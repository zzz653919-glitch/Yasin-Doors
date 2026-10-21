/* Вход / Регистрация / Восстановление пароля — формы, проверка полей, отправка на сервер */
(function () {
  "use strict";

  var YD = window.YD, A = YD && YD.account, U = YD && YD.authUI;
  var form = document.querySelector("[data-auth-form]");
  if (!form || !A || !U) return;

  var kind = form.getAttribute("data-auth-form");   // login | register | forgot | reset
  var alertEl = form.querySelector(".form-alert");
  var submitBtn = form.querySelector("[type=submit]");
  var busy = false;
  var touched = {};
  var token = "";
  var params = new URLSearchParams(window.location.search);

  function val(name) { var el = form.elements[name]; return el ? (el.type === "checkbox" ? el.checked : el.value) : ""; }
  function pw2Err() {
    if (!val("password2")) return "Повторите пароль.";
    return val("password2") === val("password") ? "" : "Пароли не совпадают.";
  }

  var RULES = {
    login: {
      identifier: function () { return val("identifier").trim() ? "" : "Введите email или номер телефона."; },
      password: function () { return val("password") ? "" : "Введите пароль."; }
    },
    register: {
      first_name: function () { return U.nameErr(val("first_name"), "имя"); },
      last_name: function () { return U.nameErr(val("last_name"), "фамилию"); },
      email: function () { return U.emailErr(val("email")); },
      phone: function () { return U.phoneErr(val("phone")); },
      password: function () { return U.passwordErr(val("password")); },
      password2: pw2Err,
      consent: function () { return val("consent") ? "" : "Необходимо согласие с политикой конфиденциальности и условиями использования."; }
    },
    forgot: { email: function () { return U.emailErr(val("email")); } },
    reset: { password: function () { return U.passwordErr(val("password")); }, password2: pw2Err }
  }[kind];

  function check(name) {
    var msg = RULES[name]();
    U.setError(form, name, msg, touched);
    // "Проверьте выделенные поля" — все поля исправлены, сообщение больше не нужно
    if (alertEl.dataset.generic && !form.querySelector(".has-error")) { U.hideAlert(alertEl); delete alertEl.dataset.generic; }
    return !msg;
  }

  U.bindPwToggles(form);
  U.bindMeter(form, "password");

  /* ---------- Проверка при вводе ---------- */
  Object.keys(RULES).forEach(function (name) {
    var el = form.elements[name];
    if (!el) return;
    el.addEventListener(el.type === "checkbox" ? "change" : "input", function () {
      if (name === "password" && touched.password2) check("password2");
      if (touched[name] || el.closest(".field").classList.contains("has-error")) check(name);
    });
    el.addEventListener("blur", function () {
      if (name === "phone" && !U.phoneErr(el.value)) el.value = window.YDForm.formatPhone(el.value);
      if (el.type === "checkbox") return;
      if (el.value || touched[name]) { touched[name] = true; check(name); }
    });
  });

  /* ---------- Отправка ---------- */
  function fail(err, firstField) {
    U.setBusy(submitBtn, false);
    busy = false;
    if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(form, n, err.fields[n], touched); });
    if (err.status === 409 && kind === "register") {
      U.showAlert(alertEl, "error", "", 'Аккаунт с такими данными уже существует. <a href="/Login">Войти</a> или <a href="/Forgot-Password">восстановить пароль</a>.');
    } else {
      U.showAlert(alertEl, "error", err.message);
    }
    var bad = form.querySelector(".has-error input");
    if (bad) bad.focus(); else if (firstField && form.elements[firstField]) form.elements[firstField].focus();
  }

  function stateCard(type, iconName, title, text, linkHref, linkText) {
    var card = form.closest(".auth-card");
    card.innerHTML = '<div class="auth-state is-' + type + '"><div class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-' + iconName + '"></use></svg></div>' +
      "<h2></h2><p></p>" + (linkHref ? '<a class="btn btn--gold"></a>' : "") + "</div>";
    var h = card.querySelector("h2");
    h.textContent = title;
    card.querySelector("p").textContent = text;
    if (linkHref) { var a = card.querySelector("a.btn"); a.href = linkHref; a.textContent = linkText; }
    h.setAttribute("tabindex", "-1");
    h.focus();
  }
  function invalidLink() {
    stateCard("error", "info", "Ссылка недействительна",
      "Срок действия ссылки истёк или она уже была использована. Запросите восстановление пароля заново.", "/Forgot-Password", "Запросить новую ссылку");
  }

  var handlers = {
    login: function () {
      return A.request("POST", "/api/account/login", { identifier: val("identifier").trim(), password: val("password"), remember: !!val("remember") })
        .then(function (res) { A.setSession(res); window.location.href = A.safeNext(params.get("next")); })
        .catch(function (err) {
          fail(err, "identifier");
          if (err.status === 401 || err.status === 429) { form.elements.password.value = ""; form.elements.password.focus(); }
        });
    },
    register: function () {
      return A.request("POST", "/api/account/register", {
        first_name: val("first_name").trim(), last_name: val("last_name").trim(), email: val("email").trim(),
        phone: val("phone").trim(), password: val("password"), password2: val("password2"),
        consent: !!val("consent"), website: val("website")
      }).then(function (res) { A.setSession(res); window.location.href = A.safeNext(params.get("next"), "/Profile#welcome"); })
        .catch(function (err) { fail(err, "first_name"); });
    },
    forgot: function () {
      return A.request("POST", "/api/account/forgot", { email: val("email").trim() }).then(function () {
        stateCard("success", "mail", "Проверьте почту",
          "Если аккаунт с адресом " + val("email").trim() + " существует, мы отправили письмо со ссылкой для смены пароля. Ссылка действует 1 час. Не пришло? Загляните в папку «Спам».",
          "/Login", "Вернуться ко входу");
      }).catch(function (err) { fail(err, "email"); });
    },
    reset: function () {
      return A.request("POST", "/api/account/reset", { token: token, password: val("password"), password2: val("password2") }).then(function () {
        stateCard("success", "check", "Пароль изменён", "Теперь вы можете войти с новым паролем. На всех устройствах потребуется войти заново.", "/Login", "Войти");
      }).catch(function (err) {
        if (err.code === "invalid_token") invalidLink(); else fail(err, "password");
      });
    }
  };
  var BUSY_TEXT = { login: "Входим…", register: "Создаём аккаунт…", forgot: "Отправляем…", reset: "Сохраняем…" };

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    U.hideAlert(alertEl);
    var first = null;
    Object.keys(RULES).forEach(function (name) {
      touched[name] = true;
      if (!check(name) && !first) first = name;
    });
    if (first) {
      U.showAlert(alertEl, "error", "Проверьте выделенные поля.");
      alertEl.dataset.generic = "1";
      form.elements[first].focus();
      return;
    }
    busy = true;
    U.setBusy(submitBtn, true, BUSY_TEXT[kind]);
    handlers[kind]();
  });

  /* ---------- Особенности страниц ---------- */
  function unavailable(text) {
    U.showAlert(alertEl, "error", text);
    submitBtn.disabled = true;
  }

  if (kind === "reset") {
    var m = /[#&]t=([\w-]+)/.exec(window.location.hash);
    token = m ? m[1] : "";
    // Token manzil satrida qolmasin (tarix, skrinshot)
    if (window.history && history.replaceState) history.replaceState(null, "", window.location.pathname);
    if (!token) invalidLink();
    else A.request("POST", "/api/account/reset/check", { token: token }).then(function (r) { if (!r.valid) invalidLink(); })
      .catch(function () { /* tarmoq xatosi: yuborishda qayta tekshiriladi */ });
  }

  A.onReady(function (state) {
    if (state.user && (kind === "login" || kind === "register")) { window.location.replace(A.safeNext(params.get("next"))); return; }
    if (!state.available) unavailable("Вход и регистрация временно недоступны. Попробуйте позже или свяжитесь с нами.");
    else if (kind === "forgot" && !state.mail) unavailable("Восстановление пароля по email сейчас недоступно: отправка писем не настроена. Свяжитесь с нами — мы поможем сменить пароль.");
  });

  // «Войти» / «Зарегистрироваться» сохраняют адрес возврата
  var next = params.get("next");
  if (next && A.safeNext(next, "") === next) {
    document.querySelectorAll("[data-keep-next]").forEach(function (a) { a.href += "?next=" + encodeURIComponent(next); });
  }
})();
