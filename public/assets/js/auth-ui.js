/* Auth formalari uchun umumiy yordamchilar: tekshiruv qoidalari, xato ko‘rsatish, yuklanish holati, "Parolni ko‘rsatish", parol kuchi */
(function () {
  "use strict";

  function cap(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
  var NAME_RE = /^[\p{L}][\p{L}\p{M}'’ʻ`. -]*$/u;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Qoidalar serverdagi bilan bir xil (server har doim qayta tekshiradi) */
  function nameErr(v, label) {
    v = String(v).trim().replace(/\s+/g, " ");
    if (v.length < 2) return cap(label) + " kiriting (kamida 2 ta harf).";
    if (v.length > 40 || !NAME_RE.test(v)) return cap(label) + " faqat harf, bo‘sh joy va defisdan iborat bo‘lishi mumkin.";
    return "";
  }
  function emailErr(v) {
    v = String(v).trim();
    if (!v) return "Email kiriting.";
    if (v.length > 254 || !EMAIL_RE.test(v)) return "To‘g‘ri email kiriting, masalan: name@example.com.";
    return "";
  }
  function phoneErr(v) {
    if (!String(v).trim()) return "Telefon raqamini kiriting.";
    if (!window.YDForm || !window.YDForm.isValidPhone(v)) return "Raqamni +998 90 123 45 67 formatida kiriting.";
    return "";
  }
  function passwordErr(v) {
    if (!v) return "Parolni kiriting.";
    if (v.length < 8) return "Parol kamida 8 ta belgidan iborat bo‘lishi kerak.";
    if (v.length > 128) return "Parol juda uzun (ko‘pi bilan 128 ta belgi).";
    if (!/\p{L}/u.test(v) || !/[0-9]/.test(v)) return "Parolda harflar va raqamlar bo‘lishi kerak.";
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
      btn.lastChild.textContent = label || "Kuting…";
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
        btn.setAttribute("aria-label", show ? "Parolni yashirish" : "Parolni ko‘rsatish");
        btn.querySelector("span").textContent = show ? "Parolni yashirish" : "Parolni ko‘rsatish";
        btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
        input.focus();
      });
    });
  }

  /** Parol kuchi ko‘rsatkichi. Qaytaradi: yangilash funksiyasi */
  function bindMeter(form, inputName) {
    var meter = form.querySelector("[data-pw-meter]");
    if (!meter) return function () {};
    var labels = ["", "Kuchsiz parol", "O‘rtacha parol", "Yaxshi parol", "Ishonchli parol"];
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
