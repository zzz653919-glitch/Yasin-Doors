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
    document.getElementById("submitTotal").textContent = fmt(YD.store.cartTotal());
    return true;
  }

  // Buyurtma faqat tizimga kirgan mijozdan: kirmagan bo‘lsa sahifa ochilishi bilan modal chiqadi (savat saqlanib qoladi)
  YD.account.onReady(function (st) { if (!st.user) YD.account.showGate("/Checkout"); });

  if (!renderSummary()) return;
  document.addEventListener("yd:change", renderSummary);

  /* Saqlangan manzillar: tanlansa hudud, manzil va (bo‘lsa) xarita nuqtasi to‘ldiriladi */
  var savedAddrs = [];
  var savedBox = document.getElementById("savedAddrBox"), savedSel = document.getElementById("savedAddr");
  var REGLBL = { samarqand: "Samarqand viloyati", sirdaryo: "Sirdaryo viloyati", toshkent: "Toshkent viloyati", navoiy: "Navoiy viloyati" };
  YD.account.onReady(function (st) {
    if (!st.user || !savedSel) return;
    YD.account.request("GET", "/api/account/addresses").then(function (res) {
      savedAddrs = res.items || [];
      if (!savedAddrs.length) return;
      savedSel.innerHTML = '<option value="">Yangi manzil kiritaman</option>' + savedAddrs.map(function (a) {
        return '<option value="' + a.id + '">' + esc(a.label) + " — " + esc(REGLBL[a.region] || a.region) + ", " + esc(a.address) + "</option>";
      }).join("");
      savedBox.hidden = false;
    }).catch(function () { /* manzillarsiz ham buyurtma berish mumkin */ });
  });
  if (savedSel) savedSel.addEventListener("change", function () {
    var a = savedAddrs.filter(function (x) { return String(x.id) === savedSel.value; })[0];
    if (!a) { if (window.YDCheckoutMap) window.YDCheckoutMap.clear(); return; }
    form.elements.region.value = a.region;
    form.elements.address.value = a.address;
    form.elements.region.dispatchEvent(new Event("change", { bubbles: true }));
    form.elements.address.dispatchEvent(new Event("input", { bubbles: true }));
    if (window.YDCheckoutMap) { if (a.lat != null && a.lng != null) window.YDCheckoutMap.setPoint(a.lat, a.lng); else window.YDCheckoutMap.clear(); }
    form.elements.region.value = a.region;
  });

  var rules = {
    name: function (v) { return v.replace(/\s/g, "").length >= 2; },
    phone: function (v) { return YDForm.isValidPhone(v); },
    region: function (v) { return !!v; },
    address: function (v) { return v.length >= 5; },
    agree: function (v) { return v === true; }
  };
  YDForm.liveValidate(form, rules);

  /* Bosqichlar: 1 Ma’lumot (ism, telefon) → 2 Manzil (hudud, manzil) → 3 Tasdiq (rozilik). Joriy bosqich ajratiladi. */
  var stepEls = document.querySelectorAll("#orderSteps li");
  function updateSteps() {
    var f = form.elements;
    var done = [
      rules.name(f.name.value.trim()) && rules.phone(f.phone.value.trim()),
      !!f.region.value && rules.address(f.address.value.trim()),
      f.agree.checked
    ];
    var current = done.indexOf(false);
    stepEls.forEach(function (li, i) {
      li.classList.toggle("is-done", done[i]);
      li.classList.toggle("is-current", i === current);
      if (i === current) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }
  form.addEventListener("input", updateSteps);
  form.addEventListener("change", updateSteps);
  updateSteps();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    YDForm.hideAlert(alertEl);
    if (!YD.account.state.user) { YD.account.showGate("/Checkout"); return; }

    var mapErr = window.YDCheckoutMap && window.YDCheckoutMap.error();
    if (mapErr) { YDForm.showAlert(alertEl, "error", mapErr); return; }
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
        region: form.elements.region.value,
        lat: form.elements.lat.value ? Number(form.elements.lat.value) : undefined,
        lng: form.elements.lng.value ? Number(form.elements.lng.value) : undefined,
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

    var saveIt = document.getElementById("saveAddr") && document.getElementById("saveAddr").checked && !savedSel.value;
    YDForm.postJSON("/api/order", payload).then(function (res) {
      YD.store.clearCart();
      // Buyurtma saqlangandan keyingina manzil saqlanadi; xato bo‘lsa buyurtmaga ta’sir qilmaydi
      if (saveIt) YD.account.request("POST", "/api/account/addresses", { label: "Manzil", region: payload.customer.region, address: payload.customer.address, lat: payload.customer.lat, lng: payload.customer.lng }).catch(function () {});
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
