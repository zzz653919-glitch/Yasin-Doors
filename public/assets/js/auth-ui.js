/* Auth formalari uchun umumiy yordamchilar: tekshiruv qoidalari, xato ko‘rsatish, yuklanish holati, "Показать пароль", parol kuchi */
(function () {
  "use strict";

  var NAME_RE = /^[\p{L}][\p{L}\p{M}'’ʻ`. -]*$/u;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Qoidalar serverdagi bilan bir xil (server har doim qayta tekshiradi) */
  function nameErr(v, label) {
    v = String(v).trim().replace(/\s+/g, " ");
    if (v.length < 2) return "Введите " + label + " (не короче 2 букв).";
    if (v.length > 40 || !NAME_RE.test(v)) return label.charAt(0).toUpperCase() + label.slice(1) + " может содержать только буквы, пробел и дефис.";
    return "";
  }
  function emailErr(v) {
    v = String(v).trim();
    if (!v) return "Введите email.";
    if (v.length > 254 || !EMAIL_RE.test(v)) return "Введите корректный email, например name@example.com.";
    return "";
  }
  function phoneErr(v) {
    if (!String(v).trim()) return "Введите номер телефона.";
    if (!window.YDForm || !window.YDForm.isValidPhone(v)) return "Введите номер в формате +998 90 123 45 67.";
    return "";
  }
  function passwordErr(v) {
    if (!v) return "Введите пароль.";
    if (v.length < 8) return "Пароль должен содержать не менее 8 символов.";
    if (v.length > 128) return "Пароль слишком длинный (максимум 128 символов).";
    if (!/\p{L}/u.test(v) || !/[0-9]/.test(v)) return "Пароль должен содержать буквы и цифры.";
    return "";
  }

  function setError(form, name, msg, touched) {
    var el = form.elements[name], f = el && el.closest(".field");
    if (!el || !f) return;
    var err = f.querySelector(".error");
    if (!err) {
      err = document.createElement("span");
      err.className = "error";
      err.id = form.id + "-" + name + "-error";
      f.appendChild(err);
    }
    err.textContent = msg || "";
    f.classList.toggle("has-error", !!msg);
    f.classList.toggle("is-valid", !msg && !!(touched && touched[name]) && el.type !== "checkbox" && !!el.value);
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) el.setAttribute("aria-describedby", err.id); else el.removeAttribute("aria-describedby");
  }

  function showAlert(el, type, text, html) {
    el.className = "form-alert " + (type === "error" ? "is-error" : "is-success");
    if (html) el.innerHTML = html; else el.textContent = text;
    el.setAttribute("role", type === "error" ? "alert" : "status");
  }
  function hideAlert(el) { el.className = "form-alert"; el.textContent = ""; }

  function setBusy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span></span>';
      btn.lastChild.textContent = label || "Подождите…";
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
    btn.classList.toggle("is-loading", on);
    btn.disabled = on;
    btn.setAttribute("aria-busy", String(on));
  }

  function bindPwToggles(root) {
    root.querySelectorAll("[data-pw-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = btn.parentElement.querySelector("input");
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
        btn.querySelector("span").textContent = show ? "Скрыть пароль" : "Показать пароль";
        btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
        input.focus();
      });
    });
  }

  /** Parol kuchi ko‘rsatkichi. Qaytaradi: yangilash funksiyasi */
  function bindMeter(form, inputName) {
    var meter = form.querySelector("[data-pw-meter]");
    if (!meter) return function () {};
    var labels = ["", "Слабый пароль", "Средний пароль", "Хороший пароль", "Надёжный пароль"];
    function update() {
      var v = form.elements[inputName].value;
      var has = { len: v.length >= 8, letter: /\p{L}/u.test(v), digit: /[0-9]/.test(v) };
      meter.querySelectorAll("[data-rule]").forEach(function (li) { li.classList.toggle("is-ok", !!has[li.getAttribute("data-rule")]); });
      var score = 0;
      if (v) {
        score = 1;
        if (has.len && has.letter && has.digit) score = 2;
        if (score === 2 && (v.length >= 12 || (/\p{Ll}/u.test(v) && /\p{Lu}/u.test(v)))) score = 3;
        if (score === 3 && ((v.length >= 12 && /[^\p{L}0-9]/u.test(v)) || v.length >= 16)) score = 4;
      }
      meter.setAttribute("data-score", String(score));
      meter.querySelector("[data-pw-label]").textContent = labels[score];
    }
    form.elements[inputName].addEventListener("input", update);
    update();
    return update;
  }

  window.YD = window.YD || {};
  window.YD.authUI = {
    nameErr: nameErr, emailErr: emailErr, phoneErr: phoneErr, passwordErr: passwordErr,
    setError: setError, showAlert: showAlert, hideAlert: hideAlert, setBusy: setBusy,
    bindPwToggles: bindPwToggles, bindMeter: bindMeter
  };
})();
