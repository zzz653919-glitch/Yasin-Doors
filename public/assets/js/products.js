/**
 * YasinDoors — mahsulotlar ro‘yxati.
 *
 * DIQQAT: barcha narxlar NAMUNAVIY. Haqiqiy narxlarni shu yerda o‘zgartiring —
 * sayt (katalog, savat, buyurtma) va server (narxni qayta hisoblash) ham shu fayldan foydalanadi.
 *
 *  price     — 1 komplekt narxi (so‘mda, butun son)
 *  oldPrice  — ixtiyoriy, chegirmadan oldingi narx (null bo‘lsa ko‘rsatilmaydi)
 *  color     — filtr kaliti (COLORS ichidan)
 *  style     — filtr kaliti (STYLES ichidan)
 *  badges    — "new" (Yangi) va/yoki "popular" (Mashhur)
 *  image     — rasm yo‘li; haqiqiy foto qo‘yish uchun faylni almashtiring yoki yo‘lni o‘zgartiring
 */
(function (root) {
  var COLORS = {
    oq:       { name: "Oq",            hex: "#f1efea" },
    bej:      { name: "Bej / Fil suyagi", hex: "#e3d6bf" },
    kulrang:  { name: "Kulrang",       hex: "#a9a9a6" },
    grafit:   { name: "Grafit",        hex: "#45464a" },
    qora:     { name: "Qora",          hex: "#1c1c1e" },
    eman:     { name: "Och eman",      hex: "#c9a77c" },
    yongoq:   { name: "Yong‘oq",       hex: "#6b4a33" }
  };

  var STYLES = {
    klassik:      "Klassik",
    neoklassik:   "Neoklassik",
    zamonaviy:    "Zamonaviy",
    minimalistik: "Minimalistik",
    shishali:     "Shishali",
    loft:         "Loft"
  };

  var DEFAULT_SIZES = ["600 × 2000", "700 × 2000", "800 × 2000", "900 × 2000"];

  // Katalog hozircha bo'sh (egasining talabi bilan barcha eshiklar olib tashlangan).
  // Oxirgi 19 ta foto eshik nusxasi: design-src/catalog-backup/products-19-photo-doors.js — qaytarish uchun shu ro'yxatni bu yerga ko'chiring.
  var PRODUCTS = [
  ];

  PRODUCTS.forEach(function (p) {
    if (!p.sizes) p.sizes = DEFAULT_SIZES.slice();
  });

  var api = { PRODUCTS: PRODUCTS, COLORS: COLORS, STYLES: STYLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YD_DATA = api;
})(typeof window !== "undefined" ? window : this);
