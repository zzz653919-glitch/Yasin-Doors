/* Aloqa sahifasi: kontakt kartalari va xabar formasi */
/* Kartalar va xarita joyi sahifa chizilishi bilan birga (sinxron) qo‘yiladi: katalog yuklangach pastdagi kontent sakramaydi.
   Admin sozlamalari kelgach (whenReady) xuddi shu funksiya yangilangan ma’lumot bilan qayta chizadi. */
function paintContact() {
  var C = YD.config, esc = YD.esc, icon = YD.icon;

  function card(ic, label, value, href) {
    var v = value ? (href ? '<a href="' + esc(href) + '"' + (/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : "") + ">" + esc(value) + "</a>" : esc(value))
      : '<span class="placeholder">Tez orada qo‘shiladi</span>';
    return '<div class="contact-card reveal"><div class="feature-icon">' + icon(ic) + "</div><div><small>" + label + "</small><strong>" + v + "</strong></div></div>";
  }

  document.getElementById("contactCards").innerHTML =
    card("phone", "Telefon", C.phone, C.phone ? "tel:" + C.phone.replace(/[^\d+]/g, "") : "") +
    card("telegram", "Telegram", C.telegram ? C.telegram.replace(/^https?:\/\/(t\.me\/)?/, "@") : "", C.telegram) +
    card("mail", "Email", C.email, C.email ? "mailto:" + C.email : "") +
    card("pin", "Manzil", C.address) +
    card("clock", "Ish vaqti", C.workHours);

  var map = document.getElementById("mapBox");
  if (C.mapEmbedUrl && /^https:\/\//.test(C.mapEmbedUrl)) {
    map.style.padding = "0";
    map.innerHTML = '<iframe src="' + esc(C.mapEmbedUrl) + '" title="Xaritada manzil" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
  } else {
    map.innerHTML = "<div>" + icon("pin") + "<p style=\"margin:10px 0 0\">Xarita manzil aniqlashtirilgandan so‘ng qo‘shiladi.</p></div>";
    map.querySelector(".icon").style.margin = "0 auto";
  }
  YD.observeReveal();
}
paintContact();

YD.whenReady(function () {
  var C = YD.config, esc = YD.esc, icon = YD.icon;
  paintContact();

  var form = document.getElementById("contactForm");
  var alertEl = document.getElementById("contactAlert");
  var btn = document.getElementById("contactSubmit");
  var rules = {
    name: function (v) { return v.replace(/\s/g, "").length >= 2; },
    phone: function (v) { return YDForm.isValidPhone(v); },
    message: function (v) { return v.length >= 5; }
  };
  YDForm.liveValidate(form, rules);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    YDForm.hideAlert(alertEl);
    var bad = YDForm.validate(form, rules);
    if (bad) { bad.focus(); return; }

    btn.disabled = true;
    btn.textContent = "Yuborilmoqda…";
    YDForm.postJSON("/api/contact", {
      name: form.elements.name.value.trim(),
      phone: YDForm.formatPhone(form.elements.phone.value),
      topic: form.elements.topic.value,
      message: form.elements.message.value.trim(),
      website: form.elements.website.value
    }).then(function () {
      form.reset();
      YDForm.showAlert(alertEl, "success", "Rahmat! Xabaringiz yuborildi. Tez orada siz bilan bog‘lanamiz.");
    }).catch(function (err) {
      YDForm.showAlert(alertEl, "error", err.message || "Xabarni yuborib bo‘lmadi.");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Yuborish";
    });
  });
});
