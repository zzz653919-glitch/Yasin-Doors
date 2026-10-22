/* Buyurtma xaritasi: bizning manzil (marker) va mijozning yetkazib berish nuqtasi alohida ko‘rsatiladi.
   Xarita: Leaflet + OpenStreetMap (API kalitsiz). Viloyat chegaralari: geo-regions.js (server ham shuni ishlatadi). */
YD.whenReady(function () {
  "use strict";
  var el = document.getElementById("deliveryMap");
  var form = document.getElementById("orderForm");
  var G = window.YDGeo;
  if (!G) return;

  /* ---------- Ish vaqti xabari (bloklamaydi) ---------- */
  var note = document.getElementById("hoursNote");
  function hours() {
    if (!note) return;
    var st = G.workStatus();
    if (st.open) { note.hidden = true; return; }
    note.hidden = false;
    note.innerHTML = "Hozir ish vaqtidan tashqari. Ish vaqtimiz: har kuni " + YD.esc(G.HOURS.text) + " (Toshkent vaqti). " +
      "Buyurtmangizni hozir qoldirishingiz mumkin — ish vaqtida menejerimiz siz bilan bog‘lanadi. Savollar uchun: " +
      '<a href="tel:' + G.PHONE.tel + '">' + G.PHONE.display + "</a>";
  }
  hours(); setInterval(hours, 60000);

  if (!el || !form || !window.L) return;
  var regionSel = form.elements.region, latEl = form.elements.lat, lngEl = form.elements.lng;
  var youCoords = document.getElementById("youCoords"), youLink = document.getElementById("youLink"),
      youCard = document.getElementById("youCard"), clearBtn = document.getElementById("mapClear"), mapErr = document.getElementById("map-error");
  var invalid = "";

  var map = L.map(el, { scrollWheelZoom: false, worldCopyJump: false, attributionControl: true }).setView([G.SHOP.lat, G.SHOP.lng], 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);

  // Yetkazib berish hududlari
  var zone = L.featureGroup().addTo(map);
  Object.keys(G.POLYGONS).forEach(function (k) {
    L.polygon(G.POLYGONS[k], { color: "#c9a45c", weight: 1.5, fillColor: "#c9a45c", fillOpacity: 0.12, interactive: false })
      .bindTooltip(G.LABELS[k], { sticky: true }).addTo(zone);
  });

  function pin(cls) { return L.divIcon({ className: "yd-pin " + cls, html: "<i></i>", iconSize: [28, 28], iconAnchor: [14, 28] }); }
  L.marker([G.SHOP.lat, G.SHOP.lng], { icon: pin(""), keyboard: false, title: "YasinDoors — bizning manzilimiz" })
    .bindPopup('<b>YasinDoors</b><br>Bizning manzilimiz<br><a href="' + G.mapsUrl(G.SHOP.lat, G.SHOP.lng) + '" target="_blank" rel="noopener">Google Maps’da ochish</a>').addTo(map);

  map.fitBounds(zone.getBounds().extend([G.SHOP.lat, G.SHOP.lng]), { padding: [16, 16] });

  var you = null;
  function show(lat, lng, key) {
    invalid = "";
    el.classList.remove("is-invalid"); youCard.classList.remove("is-bad"); mapErr.textContent = "";
    var txt = lat.toFixed(6) + ", " + lng.toFixed(6) + " — " + G.LABELS[key];
    youCoords.textContent = txt;
    youLink.href = G.mapsUrl(lat, lng); youLink.hidden = false; clearBtn.hidden = false;
    latEl.value = lat.toFixed(6); lngEl.value = lng.toFixed(6);
    regionSel.value = key;
    regionSel.dispatchEvent(new Event("input", { bubbles: true })); regionSel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function bad(lat, lng) {
    invalid = "Tanlangan nuqta yetkazib berish zonasidan tashqarida. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.";
    latEl.value = ""; lngEl.value = "";
    el.classList.add("is-invalid"); youCard.classList.add("is-bad");
    youCoords.textContent = "Bu nuqta yetkazib berish zonasidan tashqarida (" + lat.toFixed(4) + ", " + lng.toFixed(4) + ")";
    youLink.hidden = true; clearBtn.hidden = false; mapErr.textContent = invalid; mapErr.style.display = "block";
  }
  function place(lat, lng) {
    if (!you) {
      you = L.marker([lat, lng], { icon: pin("yd-pin--you"), draggable: true, title: "Sizning yetkazib berish nuqtangiz" }).addTo(map);
      you.on("dragend", function () { var p = you.getLatLng(); apply(p.lat, p.lng); });
    } else you.setLatLng([lat, lng]);
    apply(lat, lng);
  }
  function apply(lat, lng) {
    var key = G.regionAt(lat, lng);
    if (you) you.setIcon(pin(key ? "yd-pin--you" : "yd-pin--bad"));
    if (key) show(lat, lng, key); else bad(lat, lng);
  }
  function clear() {
    if (you) { map.removeLayer(you); you = null; }
    invalid = ""; latEl.value = ""; lngEl.value = "";
    el.classList.remove("is-invalid"); youCard.classList.remove("is-bad"); mapErr.textContent = "";
    youCoords.textContent = "Xaritadan nuqta tanlanmagan"; youLink.hidden = true; clearBtn.hidden = true;
  }
  map.on("click", function (e) { place(e.latlng.lat, e.latlng.lng); });
  clearBtn.addEventListener("click", clear);
  // Hudud qo‘lda boshqasiga o‘zgartirilsa, mos kelmaydigan nuqta olib tashlanadi
  regionSel.addEventListener("change", function () {
    if (you && latEl.value && G.regionAt(Number(latEl.value), Number(lngEl.value)) !== regionSel.value) clear();
  });
  // Konteyner o‘lchami o‘zgarganda (mobil, yuklanish) xarita to‘g‘ri chizilsin
  window.addEventListener("resize", function () { map.invalidateSize(); });
  setTimeout(function () { map.invalidateSize(); }, 300);

  window.YDCheckoutMap = { map: map, error: function () { return invalid; }, setPoint: function (lat, lng) { place(lat, lng); map.setView([lat, lng], Math.max(map.getZoom(), 9)); }, clear: clear };
});
