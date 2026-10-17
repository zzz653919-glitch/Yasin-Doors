/* Savat sahifasi */
YD.whenReady(function () {
  var root = document.getElementById("cartRoot");
  var subtitle = document.getElementById("cartSubtitle");
  var esc = YD.esc, icon = YD.icon, fmt = YD.formatPrice;

  function itemHTML(it) {
    var p = it.product;
    var url = "product-detail.html?id=" + encodeURIComponent(p.id);
    var color = YD.data.COLORS[p.color] || { name: p.color };
    return '<article class="cart-item" data-id="' + esc(p.id) + '" data-size="' + esc(it.size) + '">' +
      '<a class="cart-item-media" href="' + url + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" width="110" height="138" loading="lazy"></a>' +
      "<div>" +
        '<h3><a href="' + url + '">' + esc(p.name) + "</a></h3>" +
        '<p class="muted">' + esc(color.name) + " · " + esc(it.size) + " mm</p>" +
        '<p class="muted">' + fmt(p.price) + " / dona</p>" +
        '<div class="cart-item-controls">' +
          '<div class="qty qty--sm">' +
            '<button type="button" data-qty="-1" aria-label="Kamaytirish">−</button>' +
            '<input type="number" value="' + it.qty + '" min="1" max="99" inputmode="numeric" data-qty-input aria-label="Soni">' +
            '<button type="button" data-qty="1" aria-label="Ko‘paytirish">+</button>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="cart-item-total">' +
        '<span class="price">' + fmt(it.lineTotal) + "</span>" +
        '<button class="link-btn" type="button" data-remove>' + icon("trash") + "O‘chirish</button>" +
      "</div>" +
    "</article>";
  }

  function render() {
    var items = YD.store.cartDetailed();
    var count = YD.store.cartCount();

    if (!items.length) {
      subtitle.textContent = "Tanlangan eshiklarni tekshiring va buyurtmani rasmiylashtiring.";
      root.innerHTML = YD.emptyState({
        icon: "bag",
        title: "Savatingiz hozircha bo‘sh",
        text: "Katalogdan o‘zingizga yoqqan MDF eshikni tanlang va savatga qo‘shing.",
        button: "Katalogga qaytish"
      });
      YD.observeReveal(root);
      return;
    }

    subtitle.textContent = "Savatda " + count + " ta mahsulot";
    root.innerHTML =
      '<div class="cart-layout">' +
        "<div>" +
          '<div class="cart-list">' + items.map(itemHTML).join("") + "</div>" +
          '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:20px">' +
            '<a class="btn btn--outline btn--sm" href="products.html">' + icon("arrow-left") + "Xaridni davom ettirish</a>" +
            '<button class="link-btn" type="button" id="clearCart">' + icon("trash") + "Savatni tozalash</button>" +
          "</div>" +
        "</div>" +
        '<aside class="card summary" aria-label="Buyurtma xulosasi">' +
          "<h2>Buyurtma xulosasi</h2>" +
          '<div class="summary-row"><span>Mahsulotlar (' + count + " ta)</span><span>" + fmt(YD.store.cartTotal()) + "</span></div>" +
          '<div class="summary-row"><span>Yetkazib berish</span><span class="muted">Kelishiladi</span></div>' +
          '<div class="summary-row"><span>O‘rnatish</span><span class="muted">Kelishiladi</span></div>' +
          '<div class="summary-row total"><span>Jami</span><span>' + fmt(YD.store.cartTotal()) + "</span></div>" +
          '<a class="btn btn--gold btn--block" href="checkout.html">Buyurtmani rasmiylashtirish' + icon("arrow") + "</a>" +
          '<p class="muted" style="font-size:13px;margin:14px 0 0">' + (YD.isSample() ? "Narxlar namunaviy. " : "") + 'Yakuniy summa menejer bilan tasdiqlanadi.</p>' +
        "</aside>" +
      "</div>";
  }

  root.addEventListener("click", function (e) {
    var row = e.target.closest(".cart-item");
    if (e.target.closest("#clearCart")) {
      if (window.confirm("Savatdagi barcha mahsulotlarni o‘chirasizmi?")) YD.store.clearCart();
      return;
    }
    if (!row) return;
    var id = row.dataset.id, size = row.dataset.size;
    var stepBtn = e.target.closest("[data-qty]");
    if (stepBtn) {
      var input = row.querySelector("[data-qty-input]");
      var next = (parseInt(input.value, 10) || 1) + Number(stepBtn.dataset.qty);
      if (next < 1) return;
      YD.store.setQty(id, size, next);
    }
    if (e.target.closest("[data-remove]")) {
      row.classList.add("is-removing");
      setTimeout(function () { YD.store.removeFromCart(id, size); }, 250);
    }
  });
  root.addEventListener("change", function (e) {
    if (!e.target.matches("[data-qty-input]")) return;
    var row = e.target.closest(".cart-item");
    YD.store.setQty(row.dataset.id, row.dataset.size, e.target.value);
  });

  document.addEventListener("yd:change", render);
  render();
});
