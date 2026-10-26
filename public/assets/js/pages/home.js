/* Bosh sahifa: 3D showcase carousel va eng ko‘p sotiladigan eshiklar */
YD.whenReady(function () {
  // Carousel tartibi: turli uslub va ranglar navbatma-navbat ko‘rinsin.
  // Ro‘yxatda yo‘q mahsulotlar oxiriga avtomatik qo‘shiladi.
  var SHOWCASE_ORDER = ["neo-arka", "classic-royal", "vetro-bianco", "sand-duo", "grey-stripe", "bianco-gold", "crema-classic", "vetro-grande"];
  var showcaseEl = document.getElementById("doorShowcase");
  if (showcaseEl && window.YDCarousel) {
    var list = SHOWCASE_ORDER.map(YD.getProduct).filter(Boolean);
    // Katalog katta bo‘lsa (200 ta) hammasini chizmaymiz: karusel va nuqtalar tor ekranda tartibli qolsin
    YD.data.PRODUCTS.forEach(function (p) { if (list.length < 12 && list.indexOf(p) === -1) list.push(p); });
    list = list.slice(0, 12);
    YDCarousel.mount(showcaseEl, list, { interval: 5500, label: "YasinDoors MDF eshiklar kolleksiyasi" });
  }


  /* ---------- Qo‘shimcha bo‘limlar: haqiqiy katalog ma’lumotlari asosida ---------- */
  var ALL = YD.data.PRODUCTS;
  function put(secId, gridId, list, n) {
    var sec = document.getElementById(secId), g = document.getElementById(gridId);
    if (!sec || !g || !list.length) return;
    g.innerHTML = list.slice(0, n || 4).map(YD.productCard).join("");
    sec.hidden = false;
    YD.observeReveal(g);
  }
  var sale = ALL.filter(function (p) { return p.oldPrice && p.oldPrice > p.price; })
    .sort(function (a, b) { return (b.oldPrice - b.price) / b.oldPrice - (a.oldPrice - a.price) / a.oldPrice; });
  put("saleSec", "saleGrid", sale);
  put("newSec", "newGrid", ALL.filter(function (p) { return p.badges.indexOf("new") !== -1; }));

  // Kategoriya doiralari: har kategoriyadan birinchi mahsulot rasmi
  var cats = {}, order = [];
  ALL.forEach(function (p) { if (p.category) { if (!cats[p.category]) { cats[p.category] = { n: 0, img: p.image }; order.push(p.category); } cats[p.category].n++; } });
  var catBox = document.getElementById("homeCats");
  if (catBox && order.length) {
    catBox.innerHTML = order.map(function (c) {
      return '<a class="cat-circle" role="listitem" href="/Products?cat=' + encodeURIComponent(c) + '"><span class="cc-img"><img src="' + YD.esc(cats[c].img) + '" alt="" loading="lazy" decoding="async" width="88" height="88"></span>' +
        '<span class="cc-name">' + YD.esc(c) + '</span><small>' + cats[c].n + " ta</small></a>";
    }).join("");
    document.getElementById("homeCatsSec").hidden = false;
  }

  // Oxirgi ko‘rilganlar (brauzerda saqlanadi) va ularga o‘xshash tavsiyalar
  var recentIds = YD.recent.list();
  var recent = recentIds.map(YD.getProduct).filter(Boolean);
  put("recentSec", "recentGrid", recent, 4);
  var clr = document.getElementById("recentClear");
  if (clr) clr.addEventListener("click", function () { YD.recent.clear(); document.getElementById("recentSec").hidden = true; });
  var reco;
  if (recent.length) {
    var st = {}, co = {};
    recent.forEach(function (p) { st[p.style] = (st[p.style] || 0) + 1; co[p.color] = (co[p.color] || 0) + 1; });
    reco = ALL.filter(function (p) { return recentIds.indexOf(p.id) === -1; })
      .map(function (p) { return { p: p, s: (st[p.style] || 0) * 2 + (co[p.color] || 0) + (p.badges.indexOf("popular") !== -1 ? 1 : 0) }; })
      .sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
    document.getElementById("recoTitle").textContent = "Ko‘rganlaringizga o‘xshash eshiklar";
  } else {
    var d = new Date().getDate();   // kunlik, barqaror aralashtirish
    reco = ALL.slice().sort(function (a, b) { return ((a.id.length * 7 + d) % 11) - ((b.id.length * 7 + d) % 11) || a.price - b.price; });
  }
  put("recoSec", "recoGrid", reco);

  var grid = document.getElementById("bestsellers");
  if (!grid) return;
  var items = YD.data.PRODUCTS.filter(function (p) { return p.badges.indexOf("popular") !== -1; });
  // 4 tadan kam bo‘lsa, qolganlari bilan to‘ldiramiz
  YD.data.PRODUCTS.forEach(function (p) { if (items.length < 4 && items.indexOf(p) === -1) items.push(p); });
  grid.innerHTML = items.slice(0, 4).map(YD.productCard).join("");
  YD.observeReveal(grid);
});
