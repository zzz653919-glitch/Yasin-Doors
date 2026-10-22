/* Admin: ishga tushirish, kirish/chiqish, marshrutlash, navigatsiya, bildirishnomalar */
(function () {
  "use strict";
  var A = window.A, esc = A.esc, $ = A.$;

  var NAV = [
    ["Asosiy", [["dashboard", "Dashboard"], ["orders", "Buyurtmalar"], ["products", "Mahsulotlar"], ["customers", "Mijozlar"], ["accounts", "Foydalanuvchilar"]]],
    ["Boshqaruv", [["categories", "Kategoriyalar"], ["inventory", "Ombor"]]],
    ["Tizim", [["users", "Administratorlar"], ["settings", "Sozlamalar"], ["audit", "Audit log"]]]
  ];

  /* ---------- Tema ---------- */
  A.toggleTheme = function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("yd_admin_theme", next); } catch (e) { /* e'tiborsiz */ }
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#0e0e10" : "#f4f2ee");
  };

  /* ---------- Ekranlar ---------- */
  function showBoot(on) { $("#boot").hidden = !on; }
  function showLogin(notice) {
    showBoot(false);
    $("#app").hidden = true;
    $("#login").hidden = false;
    A.state.user = null;
    if (notice) { var n = $("#loginNotice"); n.innerHTML = notice; n.hidden = false; }
    setTimeout(function () { var u = $("#lg-user"); if (u && !$("#loginForm").hidden) u.focus(); }, 50);
  }
  function showApp() {
    showBoot(false);
    $("#login").hidden = true;
    $("#app").hidden = false;
    var u = A.state.user;
    $("#avatar").textContent = (u.name || u.username || "A").trim().charAt(0).toUpperCase();
    $("#whoName").textContent = u.name || u.username;
    $("#whoRole").textContent = A.state.role_label || u.role;
    buildNav();
    refreshNotifications();
    route();
  }

  function buildNav() {
    var html = "";
    NAV.forEach(function (g) {
      var links = g[1].filter(function (i) { var v = A.views[i[0]]; return v && A.can(v.perm); });
      if (!links.length) return;
      html += '<div class="nav-label">' + esc(g[0]) + "</div>" + links.map(function (i) {
        return '<a href="#/' + i[0] + '" data-nav="' + i[0] + '">' + A.icon(A.views[i[0]].icon) + "<span>" + esc(i[1]) + '</span><span class="count" data-count="' + i[0] + '" hidden></span></a>';
      }).join("");
    });
    $("#nav").innerHTML = html;
  }

  /* ---------- Marshrutlash ---------- */
  function route() {
    if (!A.state.user) return;
    var r = A.parseHash(), view = A.views[r.name];
    if (!view) { A.go("dashboard"); return; }
    document.body.classList.remove("nav-open");
    A.$$("#nav a").forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("data-nav") === r.name); });
    document.title = view.title + " — YasinDoors Admin";
    // Har bir sahifa yangi konteynerda chiziladi (eski hodisa tinglovchilari qolib ketmasin)
    var old = $("#view"), fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    if (!A.can(view.perm)) {
      fresh.innerHTML = '<div class="card">' + A.emptyState("shield", "Ruxsat yo'q", "Bu bo'limga kirish uchun sizning rolingizda ruxsat mavjud emas.", '<a class="btn btn--gold" href="#/dashboard">Dashboard</a>') + "</div>";
      return;
    }
    // Jadval qatorlari keyin (ma'lumot kelgach) chiziladi — o'zgarishlarni kuzatib yorliqlar qo'yiladi
    if (window.MutationObserver) {
      var label = A.debounce(function () { A.labelTables(fresh); }, 40);
      new MutationObserver(label).observe(fresh, { childList: true, subtree: true });
    }
    try { view.render(fresh, r.query); }
    catch (e) { console.error(e); fresh.innerHTML = '<div class="card">' + A.emptyState("alert", "Xatolik yuz berdi", "Sahifani yangilab ko'ring.") + "</div>"; }
    window.scrollTo(0, 0);
    fresh.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", route);

  /* ---------- Bildirishnomalar ---------- */
  var notifTimer = null;
  function refreshNotifications() {
    if (!A.state.user || !A.can("dashboard.view")) return;
    A.get("/dashboard").then(function (d) {
      var items = [];
      d.recent_orders.filter(function (o) { return o.status === "new"; }).forEach(function (o) {
        items.push('<a class="popover-item" href="#/orders?open=' + o.id + '">' + A.icon("cart") + "<div><b>Yangi buyurtma " + esc(o.number) + "</b><small>" + esc(o.name) + " · " + A.fmt.money(o.total) + "</small></div></a>");
      });
      if (d.stats.new_orders > items.length) items.push('<a class="popover-item" href="#/orders?status=new">' + A.icon("cart") + "<div><b>Yana " + (d.stats.new_orders - items.length) + " ta yangi buyurtma</b><small>Hammasini ko'rish</small></div></a>");
      if (d.stats.low_stock) items.push('<a class="popover-item" href="#/inventory?stock=low">' + A.icon("warehouse") + "<div><b>" + d.stats.low_stock + " ta mahsulot kam qolgan</b><small>Omborni tekshiring</small></div></a>");
      if (!d.telegram.configured && !d.telegram.dryRun && A.can("settings.read")) items.push('<a class="popover-item" href="#/settings">' + A.icon("telegram") + "<div><b>Telegram sozlanmagan</b><small>Sozlash yo'riqnomasi</small></div></a>");
      var n = d.stats.new_orders + (d.stats.low_stock ? 1 : 0);
      var badge = $("#bellCount");
      badge.hidden = !n; badge.textContent = n > 9 ? "9+" : n;
      $("#bellPop").innerHTML = '<div class="popover-head">Bildirishnomalar</div>' + (items.length ? items.join("") : '<div class="popover-item"><div class="muted">Yangi bildirishnoma yo\'q</div></div>');
      var oc = $('[data-count="orders"]');
      if (oc) { oc.hidden = !d.stats.new_orders; oc.textContent = d.stats.new_orders; }
    }).catch(function () { /* jimgina — bildirishnomalar muhim emas */ });
    clearTimeout(notifTimer);
    notifTimer = setTimeout(function () { if (document.visibilityState === "visible") refreshNotifications(); else notifTimer = setTimeout(refreshNotifications, 60000); }, 60000);
  }
  document.addEventListener("yd-admin-refresh", refreshNotifications);

  /* ---------- Interfeys hodisalari ---------- */
  function closePops() { ["bellPop", "profilePop"].forEach(function (id) { $("#" + id).hidden = true; }); $("#bellBtn").setAttribute("aria-expanded", "false"); $("#profileBtn").setAttribute("aria-expanded", "false"); }
  function bindUi() {
    $("#menuBtn").addEventListener("click", function () { document.body.classList.add("nav-open"); });
    $("#scrim").addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    $("#themeBtn").addEventListener("click", A.toggleTheme);
    $("#bellBtn").addEventListener("click", function (e) { e.stopPropagation(); var pop = $("#bellPop"), open = pop.hidden; closePops(); pop.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open)); if (open) refreshNotifications(); });
    $("#profileBtn").addEventListener("click", function (e) { e.stopPropagation(); var pop = $("#profilePop"), open = pop.hidden; closePops(); pop.hidden = !open; e.currentTarget.setAttribute("aria-expanded", String(open)); });
    document.addEventListener("click", function (e) { if (!e.target.closest(".popover")) closePops(); else if (e.target.closest("a")) closePops(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePops(); });
    $("#logoutBtn").addEventListener("click", function () {
      A.post("/auth/logout").catch(function () {}).then(function () { closePops(); showLogin(); clearTimeout(notifTimer); });
    });
    $("#globalSearch").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = $("#globalQ").value.trim(), base = A.parseHash().name;
      var target = ["products", "customers", "orders"].indexOf(base) !== -1 && A.can(A.views[base].perm) ? base : (A.can("orders.read") ? "orders" : "products");
      A.go(target, { q: q });
    });
  }

  A.onUnauthorized = function () {
    if (A.state.user) { A.toast("Sessiya tugadi. Qayta kiring.", "error"); showLogin(); clearTimeout(notifTimer); }
  };

  /* ---------- Kirish va birinchi sozlash ---------- */
  function alertBox(id, text) { var b = $("#" + id); b.textContent = text; b.hidden = !text; }

  function bindLogin() {
    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = e.target.elements, btn = $("#loginBtn");
      alertBox("loginError", "");
      if (!fd.username.value.trim() || !fd.password.value) return alertBox("loginError", "Login va parolni kiriting.");
      A.setBusy(btn, true, "Kirilmoqda…");
      A.api("POST", "/admin/auth/login", { username: fd.username.value.trim(), password: fd.password.value }).then(function (r) {
        applySession(r);
        fd.password.value = "";
        showApp();
      }).catch(function (err) { alertBox("loginError", err.message); fd.password.value = ""; fd.password.focus(); }).then(function () { A.setBusy(btn, false); });
    });
    $("#setupForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = e.target.elements, btn = $("#setupBtn");
      alertBox("setupError", "");
      A.setBusy(btn, true, "Yaratilmoqda…");
      A.api("POST", "/admin/auth/setup", { token: fd.token.value, name: fd.name.value, username: fd.username.value, password: fd.password.value }).then(function () {
        var u = fd.username.value, p = fd.password.value;
        return A.api("POST", "/admin/auth/login", { username: u, password: p });
      }).then(function (r) { fd.password.value = ""; fd.token.value = ""; applySession(r); showApp(); })
        .catch(function (err) { alertBox("setupError", err.message); }).then(function () { A.setBusy(btn, false); });
    });
  }

  function applySession(r) {
    A.state.user = r.user; A.state.csrf = r.csrf; A.state.perms = r.perms || []; A.state.role_label = r.role_label; A.state.telegram = r.telegram || null;
  }

  function boot() {
    A.injectSprite();
    bindUi();
    bindLogin();
    fetch("/api/admin/status", { credentials: "same-origin" }).then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (st) {
      if (!st) {
        showLogin('<div class="alert alert--error" style="margin-bottom:16px">' + A.icon("alert") + "<div>Serverga ulanib bo'lmadi. Server ishlayotganini tekshiring.</div></div>");
        return;
      }
      if (!st.db) {
        $("#loginForm").hidden = true;
        showLogin('<div class="alert alert--warn" style="margin-bottom:6px">' + A.icon("alert") + "<div><b>Ma'lumotlar bazasi sozlanmagan.</b><br>Lokal ishlash uchun <span class=\"code\">.env</span> da <span class=\"code\">DATABASE_URL=file:./data/yasindoors.db</span> yozing. Vercel uchun Turso bazasini ulang: <span class=\"code\">DATABASE_URL</span> va <span class=\"code\">DATABASE_AUTH_TOKEN</span>. Batafsil: README.md → «Ma'lumotlar bazasi».</div></div>");
        return;
      }
      return A.api("GET", "/admin/auth/me").then(function (r) { applySession(r); showApp(); }, function (err) {
        if (err.status === 401) {
          if (st.needs_setup && st.setup_enabled) {
            $("#loginTitle").textContent = "Birinchi administratorni yaratish";
            $("#loginSub").textContent = "Hozircha birorta administrator yo'q. Serverdagi SETUP_TOKEN bilan Super Admin yarating.";
            $("#loginForm").hidden = true; $("#setupForm").hidden = false;
            showLogin();
          } else if (st.needs_setup) {
            showLogin('<div class="alert alert--info" style="margin-bottom:16px">' + A.icon("info") + "<div>Hozircha administrator yaratilmagan. Terminalda <span class=\"code\">npm run create-admin</span> buyrug'ini ishga tushiring (yoki serverda <span class=\"code\">SETUP_TOKEN</span> belgilab, shu sahifani yangilang).</div></div>");
          } else showLogin();
        } else showLogin('<div class="alert alert--error" style="margin-bottom:16px">' + A.icon("alert") + "<div>" + esc(err.message) + "</div></div>");
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
