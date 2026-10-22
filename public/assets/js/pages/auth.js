/* Kirish / Ro‘yxatdan o‘tish / Parolni tiklash — formalar, maydonlarni tekshirish, serverga yuborish */
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
    if (!val("password2")) return "Parolni takrorlang.";
    return val("password2") === val("password") ? "" : "Parollar mos kelmadi.";
  }

  var RULES = {
    login: {
      identifier: function () { return val("identifier").trim() ? "" : "Email yoki telefon raqamini kiriting."; },
      password: function () { return val("password") ? "" : "Parolni kiriting."; }
    },
    register: {
      first_name: function () { return U.nameErr(val("first_name"), "ism"); },
      last_name: function () { return U.nameErr(val("last_name"), "familiya"); },
      email: function () { return U.emailErr(val("email")); },
      phone: function () { return U.phoneErr(val("phone")); },
      password: function () { return U.passwordErr(val("password")); },
      password2: pw2Err,
      consent: function () { return val("consent") ? "" : "Maxfiylik siyosati va foydalanish shartlariga rozilik kerak."; }
    },
    forgot: { email: function () { return U.emailErr(val("email")); } },
    reset: { password: function () { return U.passwordErr(val("password")); }, password2: pw2Err }
  }[kind];

  function check(name) {
    var msg = RULES[name]();
    U.setError(form, name, msg, touched);
    // "Belgilangan maydonlarni tekshiring" — barcha maydonlar tuzatildi, xabar endi kerak emas
    if (alertEl.dataset.generic && !form.querySelector(".has-error")) { U.hideAlert(alertEl); delete alertEl.dataset.generic; }
    return !msg;
  }

  U.bindPwToggles(form);
  U.bindMeter(form, "password");

  /* ---------- Kiritish paytida tekshirish ---------- */
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

  /* ---------- Yuborish ---------- */
  function fail(err, firstField) {
    U.setBusy(submitBtn, false);
    busy = false;
    if (err.fields) Object.keys(err.fields).forEach(function (n) { U.setError(form, n, err.fields[n], touched); });
    if (err.status === 409 && kind === "register") {
      U.showAlert(alertEl, "error", "", 'Bunday ma’lumotlar bilan hisob allaqachon mavjud. <a href="/Login">Kirish</a> yoki <a href="/Forgot-Password">parolni tiklash</a>.');
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
    stateCard("error", "info", "Havola yaroqsiz",
      "Havola muddati tugagan yoki allaqachon ishlatilgan. Parolni tiklashni qaytadan so‘rang.", "/Forgot-Password", "Yangi havola so‘rash");
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
        stateCard("success", "mail", "Pochtangizni tekshiring",
          "Agar " + val("email").trim() + " manzilli hisob mavjud bo‘lsa, parolni almashtirish havolasi bilan xat yubordik. Havola 1 soat amal qiladi. Kelmadimi? «Spam» papkasini tekshiring.",
          "/Login", "Kirishga qaytish");
      }).catch(function (err) { fail(err, "email"); });
    },
    reset: function () {
      return A.request("POST", "/api/account/reset", { token: token, password: val("password"), password2: val("password2") }).then(function () {
        stateCard("success", "check", "Parol o‘zgartirildi", "Endi yangi parol bilan kirishingiz mumkin. Barcha qurilmalarda qaytadan kirish talab qilinadi.", "/Login", "Kirish");
      }).catch(function (err) {
        if (err.code === "invalid_token") invalidLink(); else fail(err, "password");
      });
    }
  };
  var BUSY_TEXT = { login: "Kirilmoqda…", register: "Hisob yaratilmoqda…", forgot: "Yuborilmoqda…", reset: "Saqlanmoqda…" };

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
      U.showAlert(alertEl, "error", "Belgilangan maydonlarni tekshiring.");
      alertEl.dataset.generic = "1";
      form.elements[first].focus();
      return;
    }
    busy = true;
    U.setBusy(submitBtn, true, BUSY_TEXT[kind]);
    handlers[kind]();
  });

  /* ---------- Sahifa xususiyatlari ---------- */
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
    if (!state.available) unavailable("Kirish va ro‘yxatdan o‘tish vaqtincha mavjud emas. Keyinroq urinib ko‘ring yoki biz bilan bog‘laning.");
    else if (kind === "forgot" && !state.mail) unavailable("Email orqali parolni tiklash hozir mavjud emas: xat yuborish sozlanmagan. Biz bilan bog‘laning — parolni almashtirishda yordam beramiz.");
  });

  // «Kirish» / «Ro‘yxatdan o‘tish» qaytish manzilini saqlaydi
  var next = params.get("next");
  if (next && A.safeNext(next, "") === next) {
    document.querySelectorAll("[data-keep-next]").forEach(function (a) { a.href += "?next=" + encodeURIComponent(next); });
  }
})();
