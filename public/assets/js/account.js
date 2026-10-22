/* =========================================================
   YasinDoors — mijoz akkaunti (Kirish / Ro‘yxatdan o‘tish)
   Sessiya holati (HttpOnly cookie serverda; bu yerda faqat /api/account/me natijasi), navbar menyusi,
   sevimlilarni akkaunt bilan sinxronlash. Barcha sahifalarda app.js dan keyin yuklanadi.
   ========================================================= */
(function () {
  "use strict";

  var YD = window.YD;
  if (!YD) return;
  var esc = YD.esc, icon = YD.icon;
  var HINT_KEY = "yd_acct_hint";   // faqat bosh harf: navbar sakramasligi uchun (maxfiy ma’lumot emas)
  var FAV_KEY = "yd_favs_v1";
  var FAV_OWNER_KEY = "yd_favs_owner";   // lokal sevimlilar qaysi akkauntniki (boshqa akkaunt ro‘yxatiga aralashib ketmasin)

  var state = { ready: false, available: true, mail: false, user: null, csrf: "" };
  var readyCbs = [];

  /* ---------- Xavfsiz localStorage ---------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* e’tiborsiz */ }  }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* e’tiborsiz */ } }

  /* ---------- API ---------- */
  var NETWORK_MSG = "Serverga ulanib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.";
  var GENERIC_MSG = "So‘rovni bajarib bo‘lmadi. Sahifani yangilab, qayta urinib ko‘ring.";

  function apiError(status, data) {
    data = data || {};
    // Bizning handlerlar xabarlari o‘zbek tilida; router xizmat xabarlari (boshqa tilda) umumiy xabar bilan almashtiriladi
    var msg = typeof data.error === "string" && /[A-Za-z\u0400-\u04FF]/.test(data.error) ? data.error : (status === 429 ? "Urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring." : GENERIC_MSG);
    var err = new Error(msg);
    err.status = status;
    err.code = data.code || "";
    err.fields = data.fields || null;
    return err;
  }

  function request(method, path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    var headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && state.csrf) headers["X-CSRF-Token"] = state.csrf;
    return fetch(YD.apiUrl(path), {
      method: method,
      headers: headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.ok === false) {
          if (res.status === 401 && state.user && path.indexOf("/login") === -1) setSession(null); // sessiya tugagan
          throw apiError(res.status, data);
        }
        return data;
      });
    }, function () {
      clearTimeout(timer);
      var err = new Error(NETWORK_MSG);
      err.network = true;
      throw err;
    });
  }

  /* ---------- Sessiya holati ---------- */
  function setSession(data) {
    var was = state.user ? state.user.id : null;
    if (data && data.authenticated && data.user) {
      state.user = data.user;
      state.csrf = data.csrf || "";
      lsSet(HINT_KEY, (data.user.first_name || "?").charAt(0).toUpperCase());
    } else {
      state.user = null;
      state.csrf = "";
      lsDel(HINT_KEY);
    }
    var now = state.user ? state.user.id : null;
    renderHeader();
    if (was !== now) {
      document.dispatchEvent(new CustomEvent("yd:auth", { detail: { user: state.user } }));
      if (now) syncFavorites(); else resetFavorites();
    }
  }
  function load() {
    return request("GET", "/api/account/me").then(function (data) {
      state.available = data.available !== false;
      state.mail = !!data.mail;
      setSession(data);
    }).catch(function () { /* tarmoq xatosi: mehmon sifatida davom etamiz */ }).then(function () {
      state.ready = true;
      readyCbs.splice(0).forEach(function (cb) { try { cb(state); } catch (e) { setTimeout(function () { throw e; }); } });
    });
  }
  function onReady(cb) { if (state.ready) cb(state); else readyCbs.push(cb); }

  /** Faqat shu saytdagi sahifaga ("/Cart" ko‘rinishida) yo‘naltirish (open-redirect'dan himoya) */
  function safeNext(value, fallback) {
    var v = String(value || "");
    return /^\/[A-Za-z0-9-]*(\?[\w=&%.-]*)?(#[\w-]*)?$/.test(v) ? v : (fallback || "/Profile");
  }

  function logout() {
    return request("POST", "/api/account/logout", {}).catch(function () { /* cookie baribir tozalanadi */ }).then(function () {
      setSession(null);
    });
  }

  /* ---------- Sevimlilar sinxronlash ---------- */
  var lastSynced = null, favTimer = null, favReady = false;
  function localFavs() {
    try {
      var l = JSON.parse(lsGet(FAV_KEY) || "[]");
      return Array.isArray(l) ? l.filter(function (x) { return typeof x === "string"; }) : [];
    } catch (e) { return []; }
  }
  function writeFavs(list) {
    lsSet(FAV_KEY, JSON.stringify(list));
    document.dispatchEvent(new CustomEvent("yd:change"));
  }
  function pushFavs(list) {
    return request("PUT", "/api/account/favorites", { ids: list.slice(0, 200) }).then(function (r) { lastSynced = JSON.stringify(r.ids); });
  }
  // Kirganda: serverdagi va shu qurilmadagi sevimlilar birlashtiriladi
  function syncFavorites() {
    favReady = false;
    var uid = String(state.user.id);
    request("GET", "/api/account/favorites").then(function (r) {
      var seen = {}, merged = [];
      // Lokal ro‘yxat boshqa akkauntniki bo‘lsa (sessiya tugagan, chiqilmagan) — qo‘shilmaydi, faqat mehmon ro‘yxati qo‘shiladi
      var owner = lsGet(FAV_OWNER_KEY);
      var local = owner && owner !== uid ? [] : localFavs();
      lsSet(FAV_OWNER_KEY, uid);
      r.ids.concat(local).forEach(function (id) { if (!seen[id]) { seen[id] = 1; merged.push(id); } });
      lastSynced = JSON.stringify(r.ids);
      if (JSON.stringify(merged) !== JSON.stringify(localFavs())) writeFavs(merged);
      return JSON.stringify(merged) !== lastSynced ? pushFavs(merged) : null;
    }).catch(function () { /* keyingi o‘zgarishda qayta uriniladi */ }).then(function () { favReady = true; });
  }
  // Chiqqanda: umumiy qurilmada akkaunt sevimlilari qolib ketmasin (serverda saqlangan)
  function resetFavorites() {
    clearTimeout(favTimer);
    if (favReady && localFavs().length) writeFavs([]);
    lsDel(FAV_OWNER_KEY);
    favReady = false; lastSynced = null;
  }
  document.addEventListener("yd:change", function () {
    if (!state.user || !favReady) return;
    if (JSON.stringify(localFavs()) === lastSynced) return;
    clearTimeout(favTimer);
    favTimer = setTimeout(function () { pushFavs(localFavs()).catch(function () { /* e’tiborsiz */ }); }, 400);
  });

  /* ---------- Navbar ---------- */
  function displayName(u) { return (u.first_name + " " + u.last_name).trim(); }

  function slotHTML(hintInitial) {
    var u = state.user;
    if (!u && !hintInitial) {
      return '<a class="auth-link" href="/Login">Kirish</a>' +
        '<a class="btn btn--sm btn--gold auth-register" href="/Register">Ro‘yxatdan o‘tish</a>' +
        '<a class="icon-btn auth-icon" href="/Login" aria-label="Kirish">' + icon("user") + "</a>";
    }
    var initial = u ? (u.first_name || "?").charAt(0).toUpperCase() : hintInitial;
    var menu = u ?
      '<div class="user-dd-head"><strong>' + esc(displayName(u)) + "</strong><span>" + esc(u.email) + "</span></div>" +
      '<a role="menuitem" href="/Profile">' + icon("user") + "Profil</a>" +
      '<a role="menuitem" href="/Profile#orders">' + icon("box") + "Buyurtmalarim</a>" +
      '<a role="menuitem" href="/Favorites">' + icon("heart") + "Sevimlilar</a>" +
      '<button role="menuitem" type="button" data-account-logout>' + icon("logout") + "Hisobdan chiqish</button>" : "";
    return '<div class="user-menu">' +
      '<button class="icon-btn user-btn" type="button" data-user-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="userMenu" aria-label="Profil menyusi">' +
      '<span class="avatar">' + esc(initial) + "</span></button>" +
      '<div class="user-dropdown" id="userMenu" role="menu" hidden>' + menu + "</div></div>";
  }
  function drawerHTML(hintInitial) {
    var u = state.user;
    if (!u && !hintInitial) {
      return '<a class="btn btn--gold btn--block" href="/Register">Ro‘yxatdan o‘tish</a>' +
        '<a class="btn btn--outline btn--block" href="/Login">Kirish</a>';
    }
    if (!u) return '<div class="drawer-user"><span class="avatar">' + esc(hintInitial) + "</span></div>";
    return '<div class="drawer-user"><span class="avatar">' + esc((u.first_name || "?").charAt(0).toUpperCase()) + "</span>" +
      "<div><strong>" + esc(displayName(u)) + "</strong><span>" + esc(u.email) + "</span></div></div>" +
      '<div class="drawer-auth-actions"><a class="btn btn--outline btn--sm" href="/Profile">Profil</a>' +
      '<a class="btn btn--outline btn--sm" href="/Profile#orders">Buyurtmalar</a>' +
      '<button class="btn btn--outline btn--sm" type="button" data-account-logout>Chiqish</button></div>';
  }
  function renderHeader() {
    var hint = state.ready || state.user ? null : lsGet(HINT_KEY);
    var slot = document.querySelector("[data-auth-slot]");
    var html = slotHTML(hint);
    if (slot && slot.getAttribute("data-rendered") !== html) {
      var open = slot.querySelector(".user-dropdown:not([hidden])");
      slot.innerHTML = html;
      slot.setAttribute("data-rendered", html);
      if (open) toggleMenu(true);
    }
    var drawer = document.querySelector("[data-auth-drawer]");
    var dhtml = drawerHTML(hint);
    if (drawer && drawer.getAttribute("data-rendered") !== dhtml) {
      drawer.innerHTML = dhtml;
      drawer.setAttribute("data-rendered", dhtml);
    }
  }
  function toggleMenu(open) {
    var btn = document.querySelector("[data-user-toggle]");
    var dd = document.getElementById("userMenu");
    if (!btn || !dd) return;
    if (open === undefined) open = dd.hidden;
    dd.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  function bindEvents() {
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-user-toggle]")) { toggleMenu(); return; }
      if (e.target.closest("[data-account-logout]")) {
        e.preventDefault();
        logout().then(function () {
          YD.toast("Hisobdan chiqdingiz");
          if (document.body.getAttribute("data-protected") === "1") window.location.href = "/";
        });
        return;
      }
      if (!e.target.closest(".user-menu")) toggleMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggleMenu(false);
    });
  }

  /* ---------- Buyurtma sahifasi: kirgan mijoz ma’lumotlarini avtomatik to‘ldirish ---------- */
  function prefillCheckout() {
    var form = document.getElementById("orderForm");
    var u = state.user;
    if (!form || !u) return;
    if (form.elements.name && !form.elements.name.value) form.elements.name.value = displayName(u);
    if (form.elements.phone && !form.elements.phone.value) form.elements.phone.value = u.phone;
  }
  document.addEventListener("yd:auth", prefillCheckout);

  /* ---------- Buyurtma berishdan oldin kirish talab qilinadi ----------
     gate(next, proceed): tizimga kirgan bo‘lsa proceed() chaqiriladi; kirmagan bo‘lsa modal oyna chiqadi.
     «Kirish» / «Ro‘yxatdan o‘tish» ?next=<sahifa> bilan ochiladi — kirgach foydalanuvchi shu sahifaga qaytadi.
     Savat localStorage’da saqlanadi (kirish uni o‘zgartirmaydi). Server buyurtmani baribir autentifikatsiyasiz rad etadi. */
  var GATE_TEXT = "Buyurtma berish uchun hisobingizga kiring yoki ro‘yxatdan o‘ting.";
  var gateEl = null, gateReturnFocus = null;

  function buildGate() {
    gateEl = document.createElement("div");
    gateEl.className = "gate";
    gateEl.id = "authGate";
    gateEl.hidden = true;
    gateEl.setAttribute("role", "dialog");
    gateEl.setAttribute("aria-modal", "true");
    gateEl.setAttribute("aria-labelledby", "gateText");
    gateEl.innerHTML = '<div class="gate-backdrop" data-gate-close></div>' +
      '<div class="gate-card"><div class="gate-icon">' + icon("user") + "</div>" +
      '<p class="gate-text" id="gateText"></p>' +
      '<div class="gate-actions">' +
      '<a class="btn btn--gold" data-gate-login href="/Login">Kirish</a>' +
      '<a class="btn" data-gate-register href="/Register">Ro‘yxatdan o‘tish</a>' +
      '<button class="btn btn--outline" type="button" data-gate-close>Bekor qilish</button></div></div>';
    gateEl.querySelector("#gateText").textContent = GATE_TEXT;
    document.body.appendChild(gateEl);
    gateEl.addEventListener("click", function (e) { if (e.target.closest("[data-gate-close]")) hideGate(); });
    gateEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); hideGate(); return; }
      if (e.key !== "Tab") return;
      var f = gateEl.querySelectorAll("a[href], button");
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  function showGate(next) {
    if (!gateEl) buildGate();
    var q = next ? "?next=" + encodeURIComponent(next) : "";
    gateEl.querySelector("[data-gate-login]").href = "/Login" + q;
    gateEl.querySelector("[data-gate-register]").href = "/Register" + q;
    gateReturnFocus = document.activeElement;
    gateEl.hidden = false;
    document.documentElement.classList.add("gate-open");
    var b = gateEl.querySelector("[data-gate-login]");
    setTimeout(function () { b.focus(); }, 30);
  }
  function hideGate() {
    if (!gateEl || gateEl.hidden) return;
    gateEl.hidden = true;
    document.documentElement.classList.remove("gate-open");
    if (gateReturnFocus && gateReturnFocus.focus) { try { gateReturnFocus.focus(); } catch (e) { /* e’tiborsiz */ } }
  }
  function gate(next, proceed) {
    function decide() {
      if (state.user) { if (proceed) proceed(); return true; }
      showGate(next);
      return false;
    }
    if (state.ready) return decide();
    onReady(decide);   // holat hali yuklanmagan: aniqlangach qaror qilinadi
    return false;
  }
  // Checkout sahifasiga olib boradigan har qanday havola (savat, footer) kirish talab qiladi
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (!/^\/Checkout(\?.*)?$/i.test(a.getAttribute("href"))) return;
    if (state.ready && state.user) return;
    e.preventDefault();
    var href = a.getAttribute("href");
    gate("/Checkout", function () { window.location.href = href; });
  });

  YD.account = {
    gate: gate,
    showGate: showGate,
    state: state,
    request: request,
    onReady: onReady,
    refresh: load,
    setSession: setSession,
    logout: logout,
    safeNext: safeNext,
    displayName: displayName
  };

  function init() {
    renderHeader();
    bindEvents();
    load().then(prefillCheckout);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
