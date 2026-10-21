/* Buyurtma berish sahifasi */
YD.whenReady(function () {
  var root = document.getElementById("checkoutRoot");
  var form = document.getElementById("orderForm");
  var alertEl = document.getElementById("formAlert");
  var submitBtn = document.getElementById("submitBtn");
  var esc = YD.esc, fmt = YD.formatPrice;
  var sending = false;
  var attemptKey = null, attemptSig = "";
  function randomKey() {
    var a = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  function renderSummary() {
    if (sending) return;
    var items = YD.store.cartDetailed();
    if (!items.length) {
      root.innerHTML = YD.emptyState({
        icon: "bag",
        title: "Buyurtma uchun mahsulot yo‘q",
        text: "Avval katalogdan eshik tanlab, savatga qo‘shing.",
        button: "Katalogga qaytish"
      });
      YD.observeReveal(root);
      return false;
    }
    document.getElementById("summaryItems").innerHTML = items.map(function (it) {
      return '<div class="summary-item">' +
        '<img src="' + esc(it.product.image) + '" alt="" width="52" height="64">' +
        "<div><strong>" + esc(it.product.name) + "</strong><span class=\"muted\">" + esc(it.size) + " mm · " + it.qty + " dona</span></div>" +
        "<span>" + fmt(it.lineTotal) + "</span></div>";
    }).join("");
    document.getElementById("summaryCount").textContent = YD.store.cartCount() + " ta";
    document.getElementById("summaryTotal").textContent = fmt(YD.store.cartTotal());
    return true;
  }

  // Buyurtma faqat tizimga kirgan mijozdan: kirmagan bo‘lsa sahifa ochilishi bilan modal chiqadi (savat saqlanib qoladi)
  YD.account.onReady(function (st) { if (!st.user) YD.account.showGate("/Checkout"); });

  if (!renderSummary()) return;
  document.addEventListener("yd:change", renderSummary);

  var rules = {
    name: function (v) { return v.replace(/\s/g, "").length >= 2; },
    phone: function (v) { return YDForm.isValidPhone(v); },
    address: function (v) { return v.length >= 5; },
    agree: function (v) { return v === true; }
  };
  YDForm.liveValidate(form, rules);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    YDForm.hideAlert(alertEl);
    if (!YD.account.state.user) { YD.account.showGate("/Checkout"); return; }

    var bad = YDForm.validate(form, rules);
    if (bad) {
      YDForm.showAlert(alertEl, "error", "Iltimos, belgilangan majburiy maydonlarni to‘g‘ri to‘ldiring.");
      bad.focus();
      return;
    }

    var items = YD.store.cartDetailed();
    var payload = {
      customer: {
        name: form.elements.name.value.trim(),
        phone: YDForm.formatPhone(form.elements.phone.value),
        address: form.elements.address.value.trim(),
        comment: form.elements.comment.value.trim(),
        install: form.elements.install.checked
      },
      // Narxlar serverda products.js asosida qayta hisoblanadi
      items: items.map(function (it) { return { id: it.id, size: it.size, qty: it.qty }; }),
      clientTotal: YD.store.cartTotal(),
      website: form.elements.website.value
    };
    // Takroriy yuborishdan himoya: bir xil savat va telefon uchun qayta urinishda kalit o‘zgarmaydi,
    // shuning uchun javob yo‘qolib qayta bosilsa ham server bitta buyurtma yaratadi.
    var sig = JSON.stringify(payload.items) + "|" + payload.customer.phone;
    if (!attemptKey || sig !== attemptSig) { attemptKey = randomKey(); attemptSig = sig; }
    payload.idempotencyKey = attemptKey;

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Yuborilmoqda…";

    YDForm.postJSON("/api/order", payload).then(function (res) {
      YD.store.clearCart();
      root.innerHTML =
        '<div class="empty-state success-box">' +
          '<div class="empty-icon">' + YD.icon("check") + "</div>" +
          "<h2>Buyurtmangiz qabul qilindi!</h2>" +
          '<div class="order-no">№ ' + esc(res.orderId || "—") + "</div>" +
          "<p>Rahmat, " + esc(payload.customer.name) + "! Menejerimiz tez orada " + esc(payload.customer.phone) +
          " raqami orqali siz bilan bog‘lanib, buyurtma tafsilotlarini tasdiqlaydi.</p>" +
          '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">' +
            '<a class="btn btn--gold" href="/Products">Katalogga qaytish</a>' +
            '<a class="btn btn--outline" href="/">Bosh sahifa</a>' +
          "</div></div>";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (err) {
      sending = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Buyurtmani yuborish";
      if (err.code === "login_required") { YD.account.showGate("/Checkout"); return; }   // sessiya tugagan
      var phone = YD.config.phone ? " Yoki bizga qo‘ng‘iroq qiling: " + YD.config.phone : "";
      YDForm.showAlert(alertEl, "error", (err.message || "Buyurtmani yuborib bo‘lmadi.") + phone);
    });
  });
});
