/* Mahsulot sahifasi: /Product?id=<mahsulot-id> */
YD.whenReady(function () {
  var D = YD.data, esc = YD.esc, icon = YD.icon;
  var root = document.getElementById("productRoot");
  var p = YD.getProduct(YD.param("id"));

  if (!p) {
    document.title = "Mahsulot topilmadi — YasinDoors";
    root.innerHTML = YD.emptyState({
      icon: "search",
      title: "Mahsulot topilmadi",
      text: "Bu mahsulot mavjud emas yoki havola noto‘g‘ri. Katalogdan boshqa modelni tanlang.",
      button: "Katalogga o‘tish"
    });
    YD.observeReveal(root);
    return;
  }

  // Ko'rishlar soni (admin statistikasi uchun): bir sessiyada bir mahsulot bir marta sanaladi; xato bo'lsa sahifaga ta'sir qilmaydi
  try {
    var vk = "yd_viewed_" + p.id;
    if (!sessionStorage.getItem(vk) && window.fetch && location.protocol !== "file:") {
      sessionStorage.setItem(vk, "1");
      fetch(YD.apiUrl("/api/catalog/view"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }), keepalive: true }).catch(function () {});
    }
  } catch (e) { /* sessionStorage yo'q */ }

  document.title = p.name + " — MDF eshik | YasinDoors";
  var meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", p.name + ": " + p.short);

  var color = D.COLORS[p.color] || { name: p.color, hex: "#ccc" };
  var state = { size: p.sizes[0], qty: 1 };
  var hasSale = p.oldPrice && p.oldPrice > p.price;

  var specs = Object.assign({
    "Rang": color.name,
    "Uslub": D.STYLES[p.style] || p.style,
    "Standart o‘lchamlar": p.sizes.join(", ") + " mm"
  }, p.specs);
  var specRows = Object.keys(specs).map(function (k) {
    return "<tr><th>" + esc(k) + "</th><td>" + esc(specs[k]) + "</td></tr>";
  }).join("");

  var badges = "";
  if (p.badges.indexOf("new") !== -1) badges += '<span class="badge badge--new">Yangi</span>';
  if (p.badges.indexOf("popular") !== -1) badges += '<span class="badge badge--popular">Mashhur</span>';

  root.innerHTML =
    '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Bosh sahifa</a><span>/</span><a href="/Products">Katalog</a><span>/</span><span aria-current="page">' + esc(p.name) + "</span></nav>" +
    '<div class="detail">' +
      '<div class="detail-media" id="zoomBox">' +
        (badges ? '<div class="badges">' + badges + "</div>" : "") +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + ' MDF eshigi" width="480" height="600">' +
      "</div>" +
      '<div class="detail-info">' +
        '<div class="product-meta"><span class="swatch" style="background:' + esc(color.hex) + '"></span>' + esc(color.name) + " · " + esc(D.STYLES[p.style] || p.style) + "</div>" +
        "<h1>" + esc(p.name) + "</h1>" +
        '<p class="lead">' + esc(p.description) + "</p>" +
        '<div class="detail-price"><span class="price">' + YD.formatPrice(p.price) + "</span>" +
          (hasSale ? '<span class="price-old">' + YD.formatPrice(p.oldPrice) + "</span>" : "") + "</div>" +
        '<p class="muted" style="font-size:14px;margin:0">Narx 1 komplekt uchun' + (YD.isSample() ? ", namunaviy" : "") + '. Aniq narx o‘lcham va komplektatsiyaga qarab menejer tomonidan tasdiqlanadi.</p>' +

        '<div class="option-label">O‘lcham (mm)</div>' +
        '<div class="chips" id="sizeChips" role="radiogroup" aria-label="O‘lcham">' +
          p.sizes.map(function (s, i) {
            return '<button class="chip' + (i === 0 ? " is-active" : "") + '" type="button" role="radio" aria-checked="' + (i === 0) + '" data-size="' + esc(s) + '">' + esc(s) + "</button>";
          }).join("") +
        "</div>" +
        '<p class="muted" style="font-size:14px;margin:10px 0 0">Nostandart o‘lcham kerakmi? Buyurtma izohida yozing — individual tayyorlash imkoniyatini aniqlashtiramiz.</p>' +

        '<div class="option-label">Soni</div>' +
        '<div class="qty" id="qtyBox">' +
          '<button type="button" data-step="-1" aria-label="Kamaytirish">−</button>' +
          '<input type="number" id="qtyInput" value="1" min="1" max="99" inputmode="numeric" aria-label="Soni">' +
          '<button type="button" data-step="1" aria-label="Ko‘paytirish">+</button>' +
        "</div>" +

        '<div class="detail-buy">' +
          '<button class="btn" type="button" id="addToCart">' + icon("bag") + "Savatga qo‘shish</button>" +
          '<button class="btn btn--gold" type="button" id="buyNow">Hoziroq buyurtma</button>' +
          '<button class="fav-btn" type="button" data-fav="' + esc(p.id) + '" aria-label="Sevimlilarga qo‘shish">' + icon("heart") + "</button>" +
        "</div>" +

        '<ul class="perks">' +
          "<li>" + icon("ruler") + "<span>O‘lchov olish va buyurtma asosida tayyorlash shartlarini menejer bilan kelishasiz.</span></li>" +
          "<li>" + icon("truck") + "<span>Yetkazib berish va o‘rnatish manzilingizga qarab alohida kelishiladi.</span></li>" +
          "<li>" + icon("chat") + "<span>Savollar bo‘lsa — <a href=\"/Contact\" class=\"text-gold\">biz bilan bog‘laning</a>.</span></li>" +
        "</ul>" +

        '<div class="option-label">Xususiyatlar</div>' +
        '<table class="spec-table"><tbody>' + specRows + "</tbody></table>" +
      "</div>" +
    "</div>";

  var qtyInput = document.getElementById("qtyInput");
  function setQty(v) {
    state.qty = Math.min(99, Math.max(1, parseInt(v, 10) || 1));
    qtyInput.value = state.qty;
  }
  document.getElementById("qtyBox").addEventListener("click", function (e) {
    var b = e.target.closest("[data-step]");
    if (b) setQty(state.qty + Number(b.dataset.step));
  });
  qtyInput.addEventListener("change", function () { setQty(qtyInput.value); });

  document.getElementById("sizeChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-size]");
    if (!b) return;
    state.size = b.dataset.size;
    this.querySelectorAll("[data-size]").forEach(function (c) {
      var on = c === b;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-checked", on);
    });
  });

  document.getElementById("addToCart").addEventListener("click", function () {
    YD.store.addToCart(p.id, state.size, state.qty);
    YD.toast(p.name + " (" + state.size + ") savatga qo‘shildi", { href: "/Cart", label: "Savatga o‘tish" });
  });
  document.getElementById("buyNow").addEventListener("click", function () {
    YD.store.addToCart(p.id, state.size, state.qty);   // savat saqlanadi — kirgandan keyin checkout’da shu mahsulot turadi
    YD.account.gate("/Checkout", function () { window.location.href = "/Checkout"; });
  });

  // Rasmni sichqoncha ostida kattalashtirish
  var zoomBox = document.getElementById("zoomBox");
  zoomBox.addEventListener("mousemove", function (e) {
    var r = zoomBox.getBoundingClientRect();
    zoomBox.style.setProperty("--zx", ((e.clientX - r.left) / r.width * 100) + "%");
    zoomBox.style.setProperty("--zy", ((e.clientY - r.top) / r.height * 100) + "%");
  });

  // Fav tugmasi holatini yangilash uchun
  document.dispatchEvent(new CustomEvent("yd:change"));

  // Oxirgi ko‘rilganlar ro‘yxatiga yozish
  YD.recent.add(p.id);

  // O‘xshash mahsulotlar
  var related = D.PRODUCTS.filter(function (x) { return x.id !== p.id && (x.style === p.style || x.color === p.color); });
  D.PRODUCTS.forEach(function (x) { if (related.length < 4 && x.id !== p.id && related.indexOf(x) === -1) related.push(x); });
  document.getElementById("relatedGrid").innerHTML = related.slice(0, 4).map(YD.productCard).join("");
  document.getElementById("relatedSection").hidden = false;
  YD.observeReveal();
});
