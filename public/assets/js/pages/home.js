/* Bosh sahifa: "Premium MDF eshiklar vitrinasi" va eng ko‘p sotiladigan eshiklar */
YD.whenReady(function () {
  var MAX_SLIDES = 12;       // katalog katta bo‘lsa ham vitrina bir necha daqiqada to‘liq aylanib chiqsin
  var MAX_PER_STYLE = 3;     // turli uslublar aralash ko‘rinsin

  // Vitrinaga FAQAT katalogdagi haqiqiy mahsulotlar (va ularning rasmlari) olinadi — soxta mahsulot yoki narx yaratilmaydi.
  // Tanlash: avval "Mashhur"/"Yangi" belgili mahsulotlar, so‘ng qolganlari; bitta uslub 3 tadan oshmaydi.
  var PREFERRED = ["noir-gold", "nordic-oak", "linea-grafit", "neo-arka", "walnut-glass", "classic-royal", "loft-black", "vetro-bianco", "sand-duo", "grey-stripe"];
  function pickShowcase() {
    var all = YD.data.PRODUCTS.filter(function (p) { return p && p.image; });
    var flagged = function (p) { return p.badges.indexOf("popular") !== -1 || p.badges.indexOf("new") !== -1; };
    var rank = function (p) { var i = PREFERRED.indexOf(p.id); return i === -1 ? 999 : i; };
    var ordered = all.filter(flagged).concat(all.filter(function (p) { return !flagged(p); }));
    ordered.sort(function (a, b) { return rank(a) - rank(b); });     // sort barqaror emas bo‘lishi mumkin: teng ranglar uchun asl tartib saqlanadi
    var picked = [], perStyle = {};
    ordered.forEach(function (p) {
      if (picked.length >= MAX_SLIDES || (perStyle[p.style] || 0) >= MAX_PER_STYLE) return;
      picked.push(p); perStyle[p.style] = (perStyle[p.style] || 0) + 1;
    });
    ordered.forEach(function (p) {      // joy qolgan bo‘lsa — uslub chegarasiz to‘ldiramiz
      if (picked.length < Math.min(MAX_SLIDES, all.length) && picked.indexOf(p) === -1) picked.push(p);
    });
    return picked;
  }

  var showcaseEl = document.getElementById("doorShowcase");
  if (showcaseEl && window.YDShowcase) {
    var list = pickShowcase();
    if (list.length) YDShowcase.mount(showcaseEl, list, { interval: 5000, label: "YasinDoors MDF eshiklar vitrinasi" });
    else if (showcaseEl.closest("section")) showcaseEl.closest("section").hidden = true;   // katalog bo‘sh — bo‘sh vitrina ko‘rsatilmaydi
  }

  var grid = document.getElementById("bestsellers");
  if (!grid) return;
  var items = YD.data.PRODUCTS.filter(function (p) { return p.badges.indexOf("popular") !== -1; });
  // 4 tadan kam bo‘lsa, qolganlari bilan to‘ldiramiz
  YD.data.PRODUCTS.forEach(function (p) { if (items.length < 4 && items.indexOf(p) === -1) items.push(p); });
  grid.innerHTML = items.slice(0, 4).map(YD.productCard).join("");
  YD.observeReveal(grid);
});
