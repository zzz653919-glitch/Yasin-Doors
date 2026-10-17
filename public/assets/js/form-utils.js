/* Forma yordamchilari: validatsiya va yuborish (checkout va contact sahifalari uchun) */
(function () {
  "use strict";

  // O‘zbekiston raqami: +998 XX XXX XX XX (9 ta raqam operator kodi bilan)
  function normalizePhone(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 9) digits = "998" + digits;
    return digits;
  }
  function isValidPhone(value) {
    var d = normalizePhone(value);
    return /^998\d{9}$/.test(d);
  }
  function formatPhone(value) {
    var d = normalizePhone(value);
    if (!/^998\d{9}$/.test(d)) return String(value || "").trim();
    return "+998 " + d.substr(3, 2) + " " + d.substr(5, 3) + " " + d.substr(8, 2) + " " + d.substr(10, 2);
  }

  function setError(form, name, hasError) {
    var input = form.elements[name];
    if (!input) return;
    var field = input.closest(".field");
    if (field) field.classList.toggle("has-error", hasError);
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
    var err = document.getElementById(name + "-error");
    if (err) input.setAttribute("aria-describedby", err.id);
  }

  /**
   * rules: { fieldName: function(value, input) -> boolean (true = to‘g‘ri) }
   * Natija: birinchi xato maydon yoki null
   */
  function validate(form, rules) {
    var firstBad = null;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      var value = input.type === "checkbox" ? input.checked : input.value.trim();
      var ok = rules[name](value, input);
      setError(form, name, !ok);
      if (!ok && !firstBad) firstBad = input;
    });
    return firstBad;
  }

  // Foydalanuvchi xatoni tuzatayotganda xabar darhol yo‘qolsin
  function liveValidate(form, rules) {
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      var evt = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(evt, function () {
        var field = input.closest(".field");
        if (field && field.classList.contains("has-error")) {
          var value = input.type === "checkbox" ? input.checked : input.value.trim();
          setError(form, name, !rules[name](value, input));
        }
      });
    });
    if (form.elements.phone) {
      form.elements.phone.addEventListener("blur", function () {
        if (isValidPhone(this.value)) this.value = formatPhone(this.value);
      });
    }
  }

  function showAlert(el, type, text) {
    el.className = "form-alert " + (type === "error" ? "is-error" : "is-success");
    el.textContent = text;
  }
  function hideAlert(el) { el.className = "form-alert"; el.textContent = ""; }

  function postJSON(path, data) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    return fetch(YD.apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.ok) {
          var err = new Error(body.error || "Server xatosi (" + res.status + ")");
          err.status = res.status;
          throw err;
        }
        return body;
      });
    }, function (e) {
      clearTimeout(timer);
      var err = new Error("Server bilan bog‘lanib bo‘lmadi. Internet aloqasini tekshiring yoki birozdan so‘ng urinib ko‘ring.");
      err.network = true;
      err.cause = e;
      throw err;
    });
  }

  window.YDForm = {
    isValidPhone: isValidPhone,
    formatPhone: formatPhone,
    validate: validate,
    liveValidate: liveValidate,
    showAlert: showAlert,
    hideAlert: hideAlert,
    postJSON: postJSON
  };
})();
