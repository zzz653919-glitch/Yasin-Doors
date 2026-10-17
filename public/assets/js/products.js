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
      image: "assets/img/doors/classic-royal.svg",
      short: "Oq rangli, to‘rt panelli klassik eshik. Oltin rangli tutqich bilan.",
      description: "Classic Royal — an’anaviy to‘rt panelli frezalangan yuzaga ega klassik MDF eshik. Oq rang har qanday interyerga yorug‘lik va ozodalik bag‘ishlaydi, nafis panellar esa eshikka chuqurlik beradi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "4 ta frezalangan panel" }
    },
    {
      id: "neo-arka",
      name: "Neo Arka",
      price: 3100000,
      oldPrice: 3450000,
      color: "bej",
      style: "neoklassik",
      badges: ["popular"],
      image: "assets/img/doors/neo-arka.svg",
      short: "Fil suyagi rangida, arkali panel va oltin chiziqli bezak.",
      description: "Neo Arka — klassik shakllarni zamonaviy talqinda birlashtirgan neoklassik eshik. Yuqori qismdagi arkasimon panel va nozik oltin rangli chiziqlar mehmonxona va yotoqxonalar uchun mos.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "Arkali panel, dekor chiziqlar" }
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
      image: "assets/img/doors/vetro-bianco.svg",
      short: "Oq eshik, gorizontal xira shisha qo‘shimchalari bilan.",
      description: "Vetro Bianco — beshta gorizontal xira shisha qo‘shimchasiga ega yorug‘ eshik. Koridor va oshxonaga yorug‘lik o‘tkazadi, shu bilan birga shaxsiy hududni saqlaydi.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Xira (matli) shisha", "Dizayn": "5 ta gorizontal shisha" }
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
      color: "bej",
      style: "klassik",
      badges: [],
      image: "assets/img/doors/sand-duo.svg",
      short: "Qum-bej rang, ikki vertikal panel — yumshoq klassika.",
      description: "Sand Duo — ikki vertikal panelli, yumshoq bej rangdagi eshik. Iliq ranglardagi yotoqxona va bolalar xonasi uchun mos.",
      specs: { "Material": "MDF", "Qoplama": "Bo‘yoq (emal)", "Shisha": "Yo‘q", "Dizayn": "2 ta vertikal panel" }
    },
    {
      id: "grey-stripe",
      name: "Grey Stripe",
      price: 1950000,
      oldPrice: null,
      color: "kulrang",
      style: "minimalistik",
      badges: [],
      image: "assets/img/doors/grey-stripe.svg",
      short: "Och kulrang, vertikal nozik frezalar bilan.",
      description: "Grey Stripe — neytral kulrang rang va vertikal nozik frezalar. Har qanday interyerga oson moslashadigan amaliy va zamonaviy eshik.",
      specs: { "Material": "MDF", "Qoplama": "Matovaya plyonka", "Shisha": "Yo‘q", "Dizayn": "Vertikal frezalar" }
    }
  ];

  PRODUCTS.forEach(function (p) {
    if (!p.sizes) p.sizes = DEFAULT_SIZES.slice();
  });

  var api = { PRODUCTS: PRODUCTS, COLORS: COLORS, STYLES: STYLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YD_DATA = api;
})(typeof window !== "undefined" ? window : this);
