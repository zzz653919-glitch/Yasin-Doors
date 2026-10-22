/* Bosh sahifa: 3D showcase carousel va eng ko‘p sotiladigan eshiklar */
YD.whenReady(function () {
  // Carousel tartibi: turli uslub va ranglar navbatma-navbat ko‘rinsin.
  // Ro‘yxatda yo‘q mahsulotlar oxiriga avtomatik qo‘shiladi.
  var SHOWCASE_ORDER = ["noir-gold", "nordic-oak", "linea-grafit", "neo-arka", "walnut-glass", "classic-royal", "loft-black", "vetro-bianco", "sand-duo", "grey-stripe"];
  var showcaseEl = document.getElementById("doorShowcase");
  if (showcaseEl && window.YDCarousel) {
    var list = SHOWCASE_ORDER.map(YD.getProduct).filter(Boolean);
    // Katalog katta bo‘lsa (200 ta) hammasini chizmaymiz: karusel va nuqtalar tor ekranda tartibli qolsin
    YD.data.PRODUCTS.forEach(function (p) { if (list.length < 12 && list.indexOf(p) === -1) list.push(p); });
    list = list.slice(0, 12);
    YDCarousel.mount(showcaseEl, list, { interval: 5500, label: "YasinDoors MDF eshiklar kolleksiyasi" });
  }

  var grid = document.getElementById("bestsellers");
  if (!grid) return;
  var items = YD.data.PRODUCTS.filter(function (p) { return p.badges.indexOf("popular") !== -1; });
  // 4 tadan kam bo‘lsa, qolganlari bilan to‘ldiramiz
  YD.data.PRODUCTS.forEach(function (p) { if (items.length < 4 && items.indexOf(p) === -1) items.push(p); });
  grid.innerHTML = items.slice(0, 4).map(YD.productCard).join("");
  YD.observeReveal(grid);
});
