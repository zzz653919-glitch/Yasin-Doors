/* Личный кабинет: профиль, смена пароля, избранное, история заказов */
(function () {
  "use strict";

  var YD = window.YD, A = YD && YD.account, U = YD && YD.authUI;
  if (!A || !U) return;
  var esc = YD.esc;

  var root = document.getElementById("profileRoot");
  var gate = document.getElementById("profileGate");
  var TABS = ["profile", "favorites", "orders"];
  var current = "profile";
  var ordersLoaded = false;

  function toLogin() { window.location.replace("login.html?next=" + encodeURIComponent("profile.html" + window.location.hash)); }

  /* ---------- Вкладки ---------- */
  function show(tab, pushHash) {
    if (TABS.indexOf(tab) === -1) tab = "profile";
    current = tab;
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-tab") === tab);
      b.setAttribute("aria-current", b.getAttribute("data-tab") === tab ? "page" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== tab; });
    if (pushHash && window.history && history.replaceState) history.replaceState(null, "", "#" + tab);
    if (tab === "favorites") renderFavs(true);
    if (tab === "orders") loadOrders();
  }

  /* ---------- Данные пользователя ---------- */
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

  /* ---------- Форма профиля ---------- */
  var pf = document.getElementById("profileForm");
  var pfAlert = pf.querySelector(".form-alert"), pfBtn = pf.querySelector("[type=submit]");
  var pfTouched = {};
  var PF_RULES = {
    first_name: function () { return U.nameErr(pf.elements.first_name.value, "имя"); },
    last_name: function () { return U.nameErr(pf.elements.last_name.value, "фамилию"); },
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
      U.setError(pf, "current_password", "Введите текущий пароль.");
      first = "current_password";
    } else U.setError(pf, "current_password", "");
    if (first) { U.showAlert(pfAlert, "error", "Проверьте выделенные поля."); pf.elements[first].focus(); return; }

    U.setBusy(pfBtn, true, "Сохраняем…");
    var body = { first_name: pf.elements.first_name.value.trim(), last_name: pf.elements.last_name.value.trim(), email: pf.elements.email.value.trim(), phone: pf.elements.phone.value.trim() };
    if (needPw) body.current_password = pf.elements.current_password.value;
    A.request("PUT", "/api/account/profile", body).then(function (res) {
      U.setBusy(pfBtn, false);
      A.setSession({ authenticated: true, user: res.user, csrf: A.state.csrf });
      fillUser();
      U.showAlert(pfAlert, "success", "Данные сохранены.");
      YD.toast("Данные профиля сохранены");
    }).catch(function (err) {
      U.setBusy(pfBtn, false);
      if (err.status === 401) return toLogin();
      if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(pf, n, err.fields[n], pfTouched); });
      U.showAlert(pfAlert, "error", err.message);
      var bad = pf.querySelector(".has-error input"); if (bad) bad.focus();
    });
  });

  /* ---------- Смена пароля ---------- */
  var wf = document.getElementById("passwordForm");
  var wfAlert = wf.querySelector(".form-alert"), wfBtn = wf.querySelector("[type=submit]");
  var wfTouched = {};
  var WF_RULES = {
    current_password: function () { return wf.elements.current_password.value ? "" : "Введите текущий пароль."; },
    new_password: function () { return U.passwordErr(wf.elements.new_password.value); },
    new_password2: function () {
      if (!wf.elements.new_password2.value) return "Повторите новый пароль.";
      return wf.elements.new_password2.value === wf.elements.new_password.value ? "" : "Пароли не совпадают.";
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
    if (first) { U.showAlert(wfAlert, "error", "Проверьте выделенные поля."); wf.elements[first].focus(); return; }
    U.setBusy(wfBtn, true, "Сохраняем…");
    A.request("POST", "/api/account/password", {
      current_password: wf.elements.current_password.value, new_password: wf.elements.new_password.value, new_password2: wf.elements.new_password2.value
    }).then(function () {
      U.setBusy(wfBtn, false);
      wf.reset(); wfTouched = {}; updateMeter();
      Object.keys(WF_RULES).forEach(function (n) { U.setError(wf, n, "", wfTouched); });
      U.showAlert(wfAlert, "success", "Пароль изменён. На других устройствах потребуется войти заново.");
      YD.toast("Пароль изменён");
    }).catch(function (err) {
      U.setBusy(wfBtn, false);
      if (err.status === 401) return toLogin();
      if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(wf, n, err.fields[n], wfTouched); });
      U.showAlert(wfAlert, "error", err.message);
      var bad = wf.querySelector(".has-error input"); if (bad) bad.focus();
    });
  });

  /* ---------- Избранное (общий список YD.store, синхронизируется с аккаунтом) ---------- */
  var favKey = "";
  function renderFavs(force) {
    if (current !== "favorites") return;
    var favs = YD.store.getFavs(), key = favs.join("|");
    if (!force && key === favKey) return;
    favKey = key;
    var box = document.getElementById("favBox");
    document.getElementById("favSub").textContent = favs.length ? "Сохранённые модели: " + favs.length : "Модели, которые вы сохранили.";
    if (!favs.length) {
      box.innerHTML = '<div class="auth-state"><div class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg></div><h2>Пока пусто</h2><p>Нажмите на сердечко у понравившейся модели — она появится здесь и будет доступна с любого устройства.</p><a class="btn btn--gold" href="products.html">Перейти в каталог</a></div>';
      return;
    }
    box.innerHTML = '<div class="profile-fav-grid">' + favs.map(function (id) { return YD.productCard(YD.getProduct(id)); }).join("") + "</div>";
    YD.observeReveal(box);
  }
  document.addEventListener("yd:change", function () { renderFavs(false); });

  /* ---------- Заказы ---------- */
  var STATUS = { new: "Новый", accepted: "В обработке", preparing: "Готовится", delivering: "Доставляется", completed: "Завершён", cancelled: "Отменён" };
  var PAY = { unpaid: "Не оплачен", paid: "Оплачен", refunded: "Возврат" };
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " сум"; }
  function when(iso) {
    try { return new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function loadOrders() {
    if (ordersLoaded) return;
    var box = document.getElementById("ordersBox");
    box.innerHTML = '<div class="profile-skeleton"></div>';
    A.request("GET", "/api/account/orders").then(function (res) {
      ordersLoaded = true;
      if (!res.items.length) {
        box.innerHTML = '<div class="auth-state"><div class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-box"></use></svg></div><h2>Заказов пока нет</h2><p>Когда вы оформите заказ, войдя в аккаунт, он появится здесь со статусом выполнения.</p><a class="btn btn--gold" href="products.html">Перейти в каталог</a></div>';
        return;
      }
      box.innerHTML = '<div class="order-list">' + res.items.map(function (o) {
        return '<article class="order-card"><div class="order-card-head"><div><strong>№ ' + esc(o.number) + '</strong><div class="when">' + esc(when(o.created_at)) + "</div></div>" +
          '<div class="order-badges"><span class="o-chip o-chip--' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span><span class="o-chip o-chip--' + esc(o.payment_status) + '">' + esc(PAY[o.payment_status] || o.payment_status) + "</span></div></div>" +
          '<ul class="order-lines">' + o.lines.map(function (l) {
            return "<li><span>" + esc(l.name) + (l.size ? " · " + esc(l.size) + " мм" : "") + " × " + l.qty + "</span><span>" + (l.price ? money(l.price * l.qty) : "Цена уточняется") + "</span></li>";
          }).join("") + "</ul>" +
          '<div class="order-total"><span>Итого</span><span>' + (o.total ? money(o.total) : "Цена уточняется") + "</span></div></article>";
      }).join("") + "</div>";
    }).catch(function (err) {
      if (err.status === 401) return toLogin();
      box.innerHTML = '<div class="form-alert is-error"></div>';
      box.firstChild.textContent = err.message;
    });
  }

  /* ---------- Запуск ---------- */
  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { show(b.getAttribute("data-tab"), true); });
  });

  A.onReady(function (state) {
    if (!state.user) {
      if (!state.available) { gate.innerHTML = '<p class="muted">Личный кабинет временно недоступен. Попробуйте позже.</p>'; return; }
      return toLogin();
    }
    gate.hidden = true;
    root.hidden = false;
    fillUser();
    var hash = window.location.hash.replace("#", "");
    if (hash === "welcome") { YD.toast("Добро пожаловать, " + state.user.first_name + "!"); hash = "profile"; }
    show(hash, true);
  });
  // После выхода/потери сессии на этой странице — на вход
  document.addEventListener("yd:auth", function (e) { if (!e.detail.user) toLogin(); });
  window.addEventListener("hashchange", function () { var h = window.location.hash.replace("#", ""); if (TABS.indexOf(h) !== -1 && h !== current) show(h, false); });
})();
