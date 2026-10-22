/* Shaxsiy kabinet: profil, parolni almashtirish, manzillar, sevimlilar, buyurtmalar tarixi */
(function () {
  "use strict";

  var YD = window.YD, A = YD && YD.account, U = YD && YD.authUI;
  if (!A || !U) return;
  var esc = YD.esc;

  var root = document.getElementById("profileRoot");
  var gate = document.getElementById("profileGate");
  var TABS = ["profile", "addresses", "favorites", "orders"];
  var current = "profile";
  var ordersLoaded = false;

  function toLogin() { window.location.replace("/Login?next=" + encodeURIComponent("/Profile" + window.location.hash)); }

  /* ---------- Bo‘limlar ---------- */
  function show(tab, pushHash) {
    if (TABS.indexOf(tab) === -1) tab = "profile";
    current = tab;
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
      b.setAttribute("aria-current", b.getAttribute("data-tab") === tab ? "page" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
    if (pushHash && window.history && history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "addresses") loadAddresses();
    if (tab === "favorites") renderFavs(true);
    if (tab === "orders") loadOrders();
  }

  /* ---------- Foydalanuvchi ma’lumotlari ---------- */
  function fillUser() {
    var u = A.state.user;
    document.getElementById("pAvatar").textContent = (u.first_name || "?").charAt(0).toUpperCase();
    document.getElementById("pName").textContent = A.displayName(u);
    document.getElementById("pEmail").textContent = u.email;
    var f = document.getElementById("profileForm");
    f.elements.first_name.value = u.first_name;
    f.elements.last_name.value = u.last_name;
    f.elements.email.value = u.email;
    f.elements.phone.value = window.YDForm ? YDForm.formatPhone(u.phone) : u.phone;
    toggleCurPw();
  }

  /* ---------- Profil formasi ---------- */
  var pf = document.getElementById("profileForm");
  var pfAlert = pf.querySelector(".form-alert"), pfBtn = pf.querySelector("[type=submit]");
  var pfTouched = {};
  var PF_RULES = {
    first_name: function () { return U.nameErr(pf.elements.first_name.value, "ism"); },
    last_name: function () { return U.nameErr(pf.elements.last_name.value, "familiya"); },
    email: function () { return U.emailErr(pf.elements.email.value); },
    phone: function () { return U.phoneErr(pf.elements.phone.value); }
  };
  function sensitiveChanged() {
    var u = A.state.user;
    if (!u) return false;
    var phone = window.YDForm ? YDForm.formatPhone(pf.elements.phone.value) : pf.elements.phone.value;
    var origPhone = window.YDForm ? YDForm.formatPhone(u.phone) : u.phone;
    return pf.elements.email.value.trim().toLowerCase() !== u.email || phone !== origPhone;
  }
  function toggleCurPw() {
    var need = sensitiveChanged();
    document.getElementById("curPwField").hidden = !need;
    if (!need) pf.elements.current_password.value = "";
  }
  Object.keys(PF_RULES).forEach(function (n) {
    pf.elements[n].addEventListener("input", function () {
      toggleCurPw();
      if (pfTouched[n]) U.setError(pf, n, PF_RULES[n](), pfTouched);
    });
    pf.elements[n].addEventListener("blur", function () {
      if (n === "phone" && !U.phoneErr(pf.elements.phone.value)) pf.elements.phone.value = YDForm.formatPhone(pf.elements.phone.value);
      pfTouched[n] = true; U.setError(pf, n, PF_RULES[n](), pfTouched);
      toggleCurPw();
    });
  });
  U.bindPwToggles(pf);
  pf.addEventListener("submit", function (e) {
    e.preventDefault();
    if (pfBtn.disabled) return;
    U.hideAlert(pfAlert);
    var first = null;
    Object.keys(PF_RULES).forEach(function (n) {
      pfTouched[n] = true;
      var m = PF_RULES[n]();
      U.setError(pf, n, m, pfTouched);
      if (m && !first) first = n;
    });
    var needPw = sensitiveChanged();
    if (!first && needPw && !pf.elements.current_password.value) {
      U.setError(pf, "current_password", "Joriy parolni kiriting.");
      first = "current_password";
    } else U.setError(pf, "current_password", "");
    if (first) { U.showAlert(pfAlert, "error", "Belgilangan maydonlarni tekshiring."); pf.elements[first].focus(); return; }

    U.setBusy(pfBtn, true, "Saqlanmoqda…");
    var body = { first_name: pf.elements.first_name.value.trim(), last_name: pf.elements.last_name.value.trim(), email: pf.elements.email.value.trim(), phone: pf.elements.phone.value.trim() };
    if (needPw) body.current_password = pf.elements.current_password.value;
    A.request("PUT", "/api/account/profile", body).then(function (res) {
      U.setBusy(pfBtn, false);
      A.setSession({ authenticated: true, user: res.user, csrf: A.state.csrf });
      fillUser();
      U.showAlert(pfAlert, "success", "Ma’lumotlar saqlandi.");
      YD.toast("Profil ma’lumotlari saqlandi");
    }).catch(function (err) {
      U.setBusy(pfBtn, false);
      if (err.status === 401) return toLogin();
      if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(pf, n, err.fields[n], pfTouched); });
      U.showAlert(pfAlert, "error", err.message);
      var bad = pf.querySelector(".has-error input"); if (bad) bad.focus();
    });
  });

  /* ---------- Parolni almashtirish ---------- */
  var wf = document.getElementById("passwordForm");
  var wfAlert = wf.querySelector(".form-alert"), wfBtn = wf.querySelector("[type=submit]");
  var wfTouched = {};
  var WF_RULES = {
    current_password: function () { return wf.elements.current_password.value ? "" : "Joriy parolni kiriting."; },
    new_password: function () { return U.passwordErr(wf.elements.new_password.value); },
    new_password2: function () {
      if (!wf.elements.new_password2.value) return "Yangi parolni takrorlang.";
      return wf.elements.new_password2.value === wf.elements.new_password.value ? "" : "Parollar mos kelmadi.";
    }
  };
  U.bindPwToggles(wf);
  var updateMeter = U.bindMeter(wf, "new_password");
  Object.keys(WF_RULES).forEach(function (n) {
    wf.elements[n].addEventListener("input", function () {
      if (n === "new_password" && wfTouched.new_password2) U.setError(wf, "new_password2", WF_RULES.new_password2(), wfTouched);
      if (wfTouched[n]) U.setError(wf, n, WF_RULES[n](), wfTouched);
    });
    wf.elements[n].addEventListener("blur", function () {
      if (wf.elements[n].value || wfTouched[n]) { wfTouched[n] = true; U.setError(wf, n, WF_RULES[n](), wfTouched); }
    });
  });
  wf.addEventListener("submit", function (e) {
    e.preventDefault();
    if (wfBtn.disabled) return;
    U.hideAlert(wfAlert);
    var first = null;
    Object.keys(WF_RULES).forEach(function (n) {
      wfTouched[n] = true;
      var m = WF_RULES[n]();
      U.setError(wf, n, m, wfTouched);
      if (m && !first) first = n;
    });
    if (first) { U.showAlert(wfAlert, "error", "Belgilangan maydonlarni tekshiring."); wf.elements[first].focus(); return; }
    U.setBusy(wfBtn, true, "Saqlanmoqda…");
    A.request("POST", "/api/account/password", {
      current_password: wf.elements.current_password.value, new_password: wf.elements.new_password.value, new_password2: wf.elements.new_password2.value
    }).then(function () {
      U.setBusy(wfBtn, false);
      wf.reset(); wfTouched = {}; updateMeter();
      Object.keys(WF_RULES).forEach(function (n) { U.setError(wf, n, "", wfTouched); });
      U.showAlert(wfAlert, "success", "Parol o‘zgartirildi. Boshqa qurilmalarda qaytadan kirish talab qilinadi.");
      YD.toast("Parol o‘zgartirildi");
    }).catch(function (err) {
      U.setBusy(wfBtn, false);
      if (err.status === 401) return toLogin();
      if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(wf, n, err.fields[n], wfTouched); });
      U.showAlert(wfAlert, "error", err.message);
      var bad = wf.querySelector(".has-error input"); if (bad) bad.focus();
    });
  });

  /* ---------- Sevimlilar (umumiy YD.store ro‘yxati, hisob bilan sinxronlanadi) ---------- */
  var favKey = "";
  function renderFavs(force) {
    if (current !== "favorites") return;
    var favs = YD.store.getFavs(), key = favs.join("|");
    if (!force && key === favKey) return;
    favKey = key;
    var box = document.getElementById("favBox");
    document.getElementById("favSub").textContent = favs.length ? "Saqlangan modellar: " + favs.length : "Siz saqlagan modellar.";
    if (!favs.length) {
      box.innerHTML = '<div class="auth-state"><div class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg></div><h2>Hozircha bo‘sh</h2><p>Yoqqan modelingizdagi yurakchani bosing — u shu yerda paydo bo‘ladi va istalgan qurilmada ko‘rinadi.</p><a class="btn btn--gold" href="/Products">Katalogga o‘tish</a></div>';
      return;
    }
    box.innerHTML = '<div class="profile-fav-grid">' + favs.map(function (id) { return YD.productCard(YD.getProduct(id)); }).join("") + "</div>";
    YD.observeReveal(box);
  }
  document.addEventListener("yd:change", function () { renderFavs(false); });

  /* ---------- Buyurtmalar ---------- */
  var STATUS = { new: "Qabul qilindi", accepted: "Tasdiqlandi", preparing: "Tayyorlanmoqda", delivering: "Yetkazilmoqda", completed: "Yakunlandi", cancelled: "Bekor qilindi" };
  var PAY = { unpaid: "To‘lanmagan", paid: "To‘langan", refunded: "Qaytarilgan" };
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m"; }
  var MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  function when(iso) {
    try {
      var d = new Date(new Date(iso).getTime() + 5 * 3600e3);   // Asia/Tashkent (UTC+5, yozgi vaqt yo‘q)
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes());
    } catch (e) { return String(iso).slice(0, 10); }
  }
  /* Buyurtma holati chizig‘i: qabul qilindi → tasdiqlandi → tayyorlanmoqda → yetkazilmoqda → yakunlandi (yoki bekor qilindi) */
  var STEPS = ["new", "accepted", "preparing", "delivering", "completed"];
  function tracker(o) {
    if (o.status === "cancelled") return '<div class="trk trk--cancel" role="status"><span class="trk-dot"></span>Buyurtma bekor qilindi</div>';
    var at = {};
    (o.history || []).forEach(function (h) { at[h.to] = h.at; });
    if (!at.new) at.new = o.created_at;
    var idx = Math.max(0, STEPS.indexOf(o.status));
    return '<ol class="trk" aria-label="Buyurtma holati">' + STEPS.map(function (st, i) {
      var cls = i < idx ? "is-done" : i === idx ? "is-current" : "";
      return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : "") + '><span class="trk-dot"></span><span class="trk-name">' + esc(STATUS[st]) + "</span>" +
        (at[st] && i <= idx ? '<small>' + esc(when(at[st])) + "</small>" : "") + "</li>";
    }).join("") + "</ol>";
  }
  function loadOrders() {
    if (ordersLoaded) return;
    var box = document.getElementById("ordersBox");
    box.innerHTML = '<div class="profile-skeleton"></div>';
    A.request("GET", "/api/account/orders").then(function (res) {
      ordersLoaded = true;
      if (!res.items.length) {
        box.innerHTML = '<div class="auth-state"><div class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-box"></use></svg></div><h2>Buyurtmalar hozircha yo‘q</h2><p>Hisobingiz orqali buyurtma bersangiz, u shu yerda bajarilish holati bilan ko‘rinadi.</p><a class="btn btn--gold" href="/Products">Katalogga o‘tish</a></div>';
        return;
      }
      box.innerHTML = '<div class="order-list">' + res.items.map(function (o) {
        return '<article class="order-card"><div class="order-card-head"><div><strong>№ ' + esc(o.number) + '</strong><div class="when">' + esc(when(o.created_at)) + "</div></div>" +
          '<div class="order-badges"><span class="o-chip o-chip--' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span><span class="o-chip o-chip--' + esc(o.payment_status) + '">' + esc(PAY[o.payment_status] || o.payment_status) + "</span></div></div>" +
          tracker(o) +
          '<ul class="order-lines">' + o.lines.map(function (l) {
            return "<li><span>" + esc(l.name) + (l.size ? " · " + esc(l.size) + " mm" : "") + " × " + l.qty + "</span><span>" + (l.price ? money(l.price * l.qty) : "Narx aniqlashtiriladi") + "</span></li>";
          }).join("") + "</ul>" +
          '<div class="order-total"><span>Jami</span><span>' + (o.total ? money(o.total) : "Narx aniqlashtiriladi") + "</span></div></article>";
      }).join("") + "</div>";
    }).catch(function (err) {
      if (err.status === 401) return toLogin();
      box.innerHTML = '<div class="form-alert is-error"></div>';
      box.firstChild.textContent = err.message;
    });
  }


  /* ---------- Saqlangan manzillar ---------- */
  var REG = { samarqand: "Samarqand viloyati", sirdaryo: "Sirdaryo viloyati", toshkent: "Toshkent viloyati", navoiy: "Navoiy viloyati" };
  var af = document.getElementById("addrForm");
  var afAlert = af.querySelector(".form-alert"), afBtn = af.querySelector("[type=submit]");
  function renderAddresses(items) {
    var box = document.getElementById("addrBox");
    if (!items.length) { box.innerHTML = '<p class="muted addr-empty">Hozircha saqlangan manzil yo‘q.</p>'; return; }
    box.innerHTML = '<ul class="addr-list">' + items.map(function (a) {
      return '<li class="addr-item"><div><strong>' + esc(a.label) + "</strong><span>" + esc(REG[a.region] || a.region) + ", " + esc(a.address) + "</span></div>" +
        '<button type="button" class="btn btn--outline btn--sm" data-addr-del="' + a.id + '" aria-label="' + esc(a.label) + ' manzilini o‘chirish">O‘chirish</button></li>';
    }).join("") + "</ul>";
  }
  function loadAddresses() {
    var box = document.getElementById("addrBox");
    box.innerHTML = '<div class="profile-skeleton"></div>';
    A.request("GET", "/api/account/addresses").then(function (res) { renderAddresses(res.items); }).catch(function (err) {
      if (err.status === 401) return toLogin();
      box.innerHTML = '<div class="form-alert is-error"></div>'; box.firstChild.textContent = err.message;
    });
  }
  document.getElementById("addrBox").addEventListener("click", function (e) {
    var b = e.target.closest("[data-addr-del]");
    if (!b) return;
    b.disabled = true;
    A.request("DELETE", "/api/account/addresses/" + encodeURIComponent(b.getAttribute("data-addr-del"))).then(function () { YD.toast("Manzil o‘chirildi"); loadAddresses(); })
      .catch(function (err) { b.disabled = false; if (err.status === 401) return toLogin(); YD.toast(err.message); });
  });
  af.addEventListener("submit", function (e) {
    e.preventDefault();
    if (afBtn.disabled) return;
    U.hideAlert(afAlert);
    var f = af.elements;
    if (!f.region.value) { U.showAlert(afAlert, "error", "Yetkazib berish hududini tanlang."); f.region.focus(); return; }
    if (f.address.value.trim().length < 5) { U.showAlert(afAlert, "error", "Manzilni kiriting (kamida 5 ta belgi)."); f.address.focus(); return; }
    U.setBusy(afBtn, true, "Saqlanmoqda…");
    A.request("POST", "/api/account/addresses", { label: f.label.value.trim() || "Manzil", region: f.region.value, address: f.address.value.trim() }).then(function () {
      U.setBusy(afBtn, false); af.reset(); YD.toast("Manzil saqlandi"); loadAddresses();
    }).catch(function (err) {
      U.setBusy(afBtn, false);
      if (err.status === 401) return toLogin();
      U.showAlert(afAlert, "error", err.message);
    });
  });

  /* ---------- Ishga tushirish ---------- */
  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.getAttribute("data-tab"), true); });
  });

  A.onReady(function (state) {
    if (!state.user) {
      if (!state.available) { gate.innerHTML = '<p class="muted">Shaxsiy kabinet vaqtincha mavjud emas. Keyinroq urinib ko‘ring.</p>'; return; }
      return toLogin();
    }
    gate.hidden = true;
    root.hidden = false;
    fillUser();
    var hash = window.location.hash.replace("#", "");
    if (hash === "welcome") { YD.toast("Xush kelibsiz, " + state.user.first_name + "!"); hash = "profile"; }
    show(hash, true);
  });
  // Sessiya tugasa yoki chiqilsa — kirish sahifasiga
  document.addEventListener("yd:auth", function (e) { if (!e.detail.user) toLogin(); });
  window.addEventListener("hashchange", function () { var h = window.location.hash.replace("#", ""); if (TABS.indexOf(h) !== -1 && h !== current) show(h, false); });
})();
