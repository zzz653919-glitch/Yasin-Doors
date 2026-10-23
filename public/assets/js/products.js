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

  var PRODUCTS = [
    {
      id: "classic-royal",
      name: "Classic Royal",
      price: 2350000,
      oldPrice: null,
      color: "oq",
      style: "klassik",
      badges: ["popular"],
      image: "assets/img/doors/photo/classic-royal.png",
      short: "Oq rangli, ikki panelli klassik eshik. Oltin rangli tutqich va ilgaklar bilan.",
      description: "Classic Royal — an’anaviy ikki panelli frezalangan yuzaga ega klassik MDF eshik. Oq rang har qanday interyerga yorug‘lik va ozodalik bag‘ishlaydi, nafis panellar esa eshikka chuqurlik beradi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "2 ta frezalangan panel" }
    },
    {
      id: "neo-arka",
      name: "Neo Arka",
      price: 3100000,
      oldPrice: 3450000,
      color: "bej",
      style: "neoklassik",
      badges: ["popular"],
      image: "assets/img/doors/photo/neo-arka.png",
      short: "Krem rangli eshik: vertikal frezalangan panel va oltin rangli chiziqli ramka.",
      description: "Neo Arka — krem rangli neoklassik MDF eshik. Vertikal frezalangan panel oltin rangli chiziq bilan ramkalangan; ramka va naqshli yuza eshikka nafis ko‘rinish beradi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Vertikal frezalar, oltin chiziq" }
    },
    {
      id: "linea-grafit",
      name: "Linea Grafit",
      price: 2750000,
      oldPrice: null,
      color: "grafit",
      style: "minimalistik",
      badges: ["new"],
      image: "assets/img/doors/linea-grafit.svg",
      short: "Grafit rang, silliq yuza va vertikal metall chiziq.",
      description: "Linea Grafit — ortiqcha detallarsiz, silliq yuzali minimalistik eshik. Vertikal metall rangli chiziq zamonaviy kvartira va ofislarga qat’iy, toza ko‘rinish beradi.",
      specs: { "Material": "MDF", "Qoplama": "Matovaya plyonka", "Shisha": "Yo‘q", "Dizayn": "Silliq yuza, vertikal molding" }
    },
    {
      id: "vetro-bianco",
      name: "Vetro Bianco",
      price: 2600000,
      oldPrice: null,
      color: "oq",
      style: "shishali",
      badges: [],
      image: "assets/img/doors/photo/vetro-bianco.png",
      short: "Oq ikki qanotli eshik, bezakli (vitraj) shisha qo‘shimchalari bilan.",
      description: "Vetro Bianco — ikki qanotli oq MDF eshik: keng va tor bezakli shisha oynalar, pastda frezalangan panellar. Yorug‘likni o‘tkazadi va kirish zonasiga hashamat bag‘ishlaydi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Bezakli (vitraj)", "Dizayn": "Ikki qanotli, bezakli shisha" }
    },
    {
      id: "loft-black",
      name: "Loft Black",
      price: 3400000,
      oldPrice: null,
      color: "qora",
      style: "loft",
      badges: ["new"],
      image: "assets/img/doors/loft-black.svg",
      short: "Qora ramka va to‘rsimon shisha — industrial loft uslubi.",
      description: "Loft Black — industrial uslubdagi interyerlar uchun qora rangli, to‘rsimon shishali eshik. Ishchi xona, oshxona yoki studiya uchun ajoyib tanlov.",
      specs: { "Material": "MDF", "Qoplama": "Matovaya plyonka", "Shisha": "Tiniq shisha", "Dizayn": "2 × 4 to‘rsimon shisha" }
    },
    {
      id: "nordic-oak",
      name: "Nordic Oak",
      price: 2200000,
      oldPrice: null,
      color: "eman",
      style: "zamonaviy",
      badges: ["popular"],
      image: "assets/img/doors/nordic-oak.svg",
      short: "Och eman teksturasi va gorizontal frezalar — skandinav uslubi.",
      description: "Nordic Oak — tabiiy och eman teksturasiga ega iliq va yengil eshik. Gorizontal frezalar skandinav uslubidagi xonalar bilan uyg‘un ko‘rinadi.",
      specs: { "Material": "MDF", "Qoplama": "Teksturali plyonka", "Shisha": "Yo‘q", "Dizayn": "4 ta gorizontal freza" }
    },
    {
      id: "noir-gold",
      name: "Noir Gold",
      price: 3900000,
      oldPrice: null,
      color: "qora",
      style: "zamonaviy",
      badges: ["new", "popular"],
      image: "assets/img/doors/noir-gold.svg",
      short: "Chuqur qora rang va oltin rangli geometrik chiziqlar.",
      description: "Noir Gold — premium kolleksiyaning yorqin vakili. Chuqur qora yuzadagi oltin rangli geometrik chiziqlar eshikni interyerning asosiy aksentiga aylantiradi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Geometrik dekor chiziqlar" }
    },
    {
      id: "walnut-glass",
      name: "Walnut Glass",
      price: 3250000,
      oldPrice: null,
      color: "yongoq",
      style: "shishali",
      badges: [],
      image: "assets/img/doors/walnut-glass.svg",
      short: "Yong‘oq teksturasi va baland vertikal xira shisha.",
      description: "Walnut Glass — boy yong‘oq teksturasi va markazdagi baland xira shisha uyg‘unligi. Kabinet va mehmonxona uchun iliq, salobatli yechim.",
      specs: { "Material": "MDF", "Qoplama": "Teksturali plyonka", "Shisha": "Xira (matli) shisha", "Dizayn": "Vertikal shisha panel" }
    },
    {
      id: "sand-duo",
      name: "Sand Duo",
      price: 2150000,
      oldPrice: 2390000,
      color: "oq",
      style: "klassik",
      badges: [],
      image: "assets/img/doors/photo/sand-duo.png",
      short: "Ikki qanotli och rangli eshik: vertikal panellar va oltin chiziqlar.",
      description: "Sand Duo — ikki qanotli, och rangdagi klassik eshik: vertikal panellar, oltin rangli chiziqli bezak va bezakli romli ustki qism. Keng kirish joylari uchun mos.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Ikki qanotli, vertikal panellar" }
    },
    {
      id: "grey-stripe",
      name: "Grey Stripe",
      price: 1950000,
      oldPrice: null,
      color: "oq",
      style: "minimalistik",
      badges: [],
      image: "assets/img/doors/photo/grey-stripe.png",
      short: "Oq eshik: vertikal nozik frezalar va oltin rangli chiziqli ramka.",
      description: "Grey Stripe — oq rangli zamonaviy MDF eshik: vertikal nozik frezalangan panel oltin rangli chiziq bilan ramkalangan. Har qanday interyerga oson moslashadi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Vertikal frezalar, oltin chiziq" }
    },
    {
      id: "bianco-gold",
      name: "Bianco Gold",
      price: 2900000,
      oldPrice: null,
      color: "oq",
      style: "neoklassik",
      badges: ["new"],
      image: "assets/img/doors/photo/bianco-gold.png",
      short: "Oq eshik: vertikal frezalangan panel va oltin rangli chiziqli ramka.",
      description: "Bianco Gold — oq rangli neoklassik MDF eshik. Vertikal nozik frezalangan panel nafis oltin rangli chiziq bilan ramkalangan; keng profilli romi eshikka to‘liq ko‘rinish beradi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Vertikal frezalar, oltin chiziq" }
    },
    {
      id: "crema-classic",
      name: "Crema Classic",
      price: 2450000,
      oldPrice: null,
      color: "bej",
      style: "klassik",
      badges: ["new"],
      image: "assets/img/doors/photo/crema-classic.png",
      short: "Krem-oq rangli ikki panelli klassik eshik, oltin rangli furnitura bilan.",
      description: "Crema Classic — iliq krem-oq rangdagi klassik MDF eshik: ikki frezalangan panel va oltin rangli tutqich bilan ilgaklar. Devor bezaklari (molding) bor interyerlarga yaxshi mos keladi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "2 ta frezalangan panel" }
    },
    {
      id: "vetro-grande",
      name: "Vetro Grande",
      price: 4200000,
      oldPrice: null,
      color: "oq",
      style: "shishali",
      badges: ["new"],
      image: "assets/img/doors/photo/vetro-grande.png",
      short: "Ikki qanotli oq eshik: bezakli vitraj shisha va pastda frezalangan panellar.",
      description: "Vetro Grande — ikki qanotli oq MDF eshik: keng bezakli vitraj shisha, tor yon oyna, pastda frezalangan panellar va ustida pediment (korniz) bezagi. Keng kirish joylari va zallar uchun.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Bezakli (vitraj)", "Dizayn": "Ikki qanotli, vitraj shisha" }
    }
  ];

  PRODUCTS.forEach(function (p) {
    if (!p.sizes) p.sizes = DEFAULT_SIZES.slice();
  });

  var api = { PRODUCTS: PRODUCTS, COLORS: COLORS, STYLES: STYLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YD_DATA = api;
})(typeof window !== "undefined" ? window : this);
