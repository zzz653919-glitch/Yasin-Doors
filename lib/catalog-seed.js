/**
 * 200 ta MDF eshik: namunaviy katalog (deterministik — har safar bir xil) va idempotent seed.
 *  - Hamma ma'lumot NAMUNAVIY (narx, ombor, tavsif): haqiqiy ishlab chiqaruvchi ma'lumotlari tasdiqlangan fakt sifatida ko'rsatilmaydi.
 *  - SKU bo'yicha noyob; seed qayta ishga tushirilsa mavjud SKU'lar o'tkazib yuboriladi (dublikat yaratilmaydi).
 *  - Avvalgi 10 ta namunaviy mahsulot (products.js) 200 tadan 10 tasi sifatida kategoriyaga bog'lanadi (ID va rasmlari saqlanadi).
 *  - Rasmlar: scripts/gen-door-images.js yaratgan noyob SVG illyustratsiyalar (public/assets/img/doors/<sku>.svg).
 */
"use strict";

const { PRODUCTS: LEGACY } = require("./seed-legacy-products.js");

/* ---------- Kategoriyalar (9 tur, jami 200) ---------- */
const CATEGORIES = [
  { key: "MIN", name: "Zamonaviy minimalist", count: 30 },
  { key: "LUX", name: "Premium va luxury", count: 25 },
  { key: "KLS", name: "Klassik naqshli", count: 25 },
  { key: "SHI", name: "Shisha elementli", count: 25 },
  { key: "YOG", name: "Yog'och teksturali", count: 25 },
  { key: "OQL", name: "Oq va och rangli", count: 20 },
  { key: "TUQ", name: "Qora, kulrang va to'q rangli", count: 20 },
  { key: "GEO", name: "Geometrik naqshli", count: 15 },
  { key: "NOD", name: "Noodatiy dizaynli", count: 15 }
];
const LEGACY_MAP = {
  "classic-royal": "KLS", "neo-arka": "KLS", "sand-duo": "KLS", "nordic-oak": "YOG", "linea-grafit": "MIN",
  "loft-black": "TUQ", "grey-stripe": "GEO", "noir-gold": "LUX", "vetro-bianco": "SHI", "walnut-glass": "SHI"
};

/* ---------- Ranglar (sayt filtri kalitlari: oq, bej, kulrang, grafit, qora, eman, yongoq) ---------- */
const PAL = {
  oq: [["Bianco", "#f1efea"], ["Pearl", "#ebe8e1"], ["Snow", "#f6f6f4"], ["Milk", "#efeadf"]],
  bej: [["Sabbia", "#e0d2b8"], ["Latte", "#d9c7a6"], ["Linen", "#e8dcc6"], ["Greige", "#cfc5b4"]],
  kulrang: [["Cloud", "#b8b8b5"], ["Ash", "#a0a09d"], ["Stone", "#8d8c88"], ["Mist", "#c9c9c6"]],
  grafit: [["Graphite", "#4a4b4f"], ["Slate", "#3b3c40"], ["Carbon", "#2f3033"]],
  qora: [["Nero", "#1f1f21"], ["Onyx", "#171719"], ["Jet", "#242426"]],
  eman: [["Oak", "#c9a77c"], ["Honey", "#c1976a"], ["Ashwood", "#d6bd96"], ["Natural", "#bf9c70"]],
  yongoq: [["Walnut", "#6b4a33"], ["Wenge", "#3d2b22"], ["Chocolate", "#4e3426"], ["Cherry", "#7a4332"]]
};
const COLOR_UZ = { oq: "oq", bej: "bej", kulrang: "kulrang", grafit: "grafit", qora: "qora", eman: "och eman", yongoq: "yong'oq" };
const WALLS = [["#ddd8cf", "#c5bfb4"], ["#e6e1d8", "#cfc8bb"], ["#cfcac1", "#b8b2a7"], ["#d9d3c8", "#bdb6a9"], ["#c9c4bb", "#aca69b"], ["#e2dcd0", "#c9c1b2"]];
const DARK_WALLS = [["#55524d", "#343331"], ["#4a4844", "#2f2e2c"], ["#62605b", "#3d3b38"]];
const FLOORS = ["#8a7b6a", "#7b6c5b", "#9a8a76", "#6e6254"];

/* ---------- Nom so'zlari (har bir mahsulot uchun alohida) ---------- */
const WORDS = {
  MIN: ["Aero", "Lumen", "Nova", "Vertex", "Zenit", "Solo", "Axis", "Fjord", "Mono", "Pure", "Plano", "Haven", "Orbit", "Nordic", "Vela", "Cubo", "Linea", "Arco", "Echo", "Silk", "Calm", "Drift", "Ember", "Halo", "Ione", "Jade", "Kito", "Lark", "Mira", "Nube", "Onda", "Pavo"],
  LUX: ["Imperial", "Regal", "Sovereign", "Aurum", "Majestic", "Opulent", "Prestige", "Monarch", "Elysium", "Grandeur", "Noblesse", "Sceptre", "Versailles", "Belvedere", "Cartier", "Dynasty", "Eminence", "Florentia", "Galleria", "Heritage", "Iconic", "Jubilee", "Kingsley", "Lorenzo", "Medici", "Obsidian"],
  KLS: ["Castello", "Verona", "Palazzo", "Romano", "Venezia", "Toscana", "Milano", "Padova", "Siena", "Bergamo", "Capri", "Ravenna", "Sorrento", "Torino", "Umbria", "Vicenza", "Amalfi", "Bologna", "Cremona", "Firenze", "Genova", "Lucca", "Modena", "Napoli", "Parma", "Pisa"],
  SHI: ["Cristal", "Prisma", "Lucida", "Aqua", "Brio", "Clara", "Diafan", "Opale", "Vitro", "Glaze", "Iris", "Reflex", "Mirage", "Nimbo", "Opus", "Perla", "Quarzo", "Radia", "Sfera", "Trama", "Ultra", "Visio", "Wave", "Xenia", "Zefir", "Alba"],
  YOG: ["Timber", "Bosco", "Forest", "Rustico", "Savanna", "Taiga", "Alder", "Birch", "Cedro", "Dune", "Elm", "Fagus", "Grove", "Hazel", "Juniper", "Kodiak", "Larch", "Maple", "Nogal", "Olmo", "Pine", "Quercus", "Rovere", "Sequoia", "Teak", "Urban"],
  OQL: ["Alpina", "Blanca", "Cotton", "Dolce", "Eterna", "Frost", "Gelato", "Hana", "Ivory", "Jasmine", "Kristal", "Lino", "Meringa", "Neve", "Opaline", "Panna", "Quiet", "Rosa", "Sorbet", "Tenera", "Vanilla"],
  TUQ: ["Basalt", "Cobalt", "Dusk", "Eclipse", "Flint", "Gotham", "Hematit", "Indigo", "Jaspis", "Kodiak", "Lava", "Midnight", "Noctis", "Obsidian", "Pitch", "Raven", "Shadow", "Tundra", "Umber", "Vesper", "Wolfram"],
  GEO: ["Rombo", "Vector", "Kubik", "Delta", "Matrix", "Tessera", "Zigzag", "Hexa", "Pixel", "Quadro", "Sigma", "Trigon", "Unity", "Vertigo", "Xylo", "Zenga"],
  NOD: ["Fusion", "Enigma", "Chimera", "Twist", "Surreal", "Atlas", "Bauhaus", "Cosmo", "Dada", "Eclat", "Fable", "Glitch", "Hybrid", "Illusion", "Jazz", "Kinetic"]
};

/* ---------- Deterministik tasodifiylik ---------- */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next();   // kichik seed'lar uchun dastlabki qiymatlar yaxshi aralashmaydi
  return next;
}
function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

/* ---------- Dizayn variantlari (kategoriya bo'yicha) ---------- */
const HANDLES_MOD = ["bar-black", "bar-chrome", "lever-black", "lever-chrome", "bar-black", "bar-chrome"];
const HANDLES_CLS = ["lever-gold", "lever-brass", "lever-chrome", "knob-brass", "lever-gold"];
const HANDLES_LUX = ["bar-gold", "bar-chrome", "lever-gold", "bar-black", "bar-gold", "lever-brass"];

function variantsFor(cat, r) {
  const out = [];
  const push = (pattern, p, colors, extra) => colors.forEach(([ck, pi]) => out.push(Object.assign({ pattern, p, ck, pi }, extra || {})));
  if (cat === "MIN") {
    const cols = [["bej", 0], ["bej", 1], ["bej", 3], ["kulrang", 0], ["kulrang", 1], ["kulrang", 3], ["grafit", 0], ["grafit", 1], ["eman", 2], ["oq", 1], ["oq", 3], ["bej", 2]];
    for (const n of [2, 3, 4, 5, 6, 7]) push("groovesV", { n, full: n % 2 === 0 }, cols.slice(n % 3, n % 3 + 4));
    for (const n of [2, 3, 4, 5]) push("groovesH", { n }, cols.slice(n % 4, n % 4 + 3));
    push("groovesCross", { n: 2, m: 2 }, cols.slice(0, 4)); push("groovesCross", { n: 1, m: 3 }, cols.slice(4, 8));
    push("flat", {}, cols.slice(0, 8));
  } else if (cat === "LUX") {
    const cols = [["qora", 0], ["qora", 1], ["grafit", 0], ["grafit", 2], ["yongoq", 1], ["yongoq", 0], ["bej", 2], ["oq", 1], ["kulrang", 2], ["yongoq", 3]];
    const metals = ["gold", "rose", "chrome", "brass", "black"];
    for (const m of metals) {
      push("inlay", { metal: m, cross: true }, cols.slice(0, 5)); push("inlay", { metal: m, hbar: [0.3, 0.7], inset: 22 }, cols.slice(3, 7));
      push("inlay", { metal: m, vbar: [0.33, 0.66], inset: 18, w: 2 }, cols.slice(5, 9)); push("inlay", { metal: m, frame: false, band: 0.5, bandH: 8 }, cols.slice(1, 5));
      push("inlay", { metal: m, inset: 30, w: 3 }, cols.slice(6, 10));
    }
  } else if (cat === "KLS") {
    const cols = [["oq", 0], ["oq", 1], ["oq", 3], ["bej", 0], ["bej", 2], ["bej", 3], ["kulrang", 3], ["eman", 2], ["oq", 2], ["kulrang", 0]];
    for (const rows of [2, 3, 4]) for (const cc of [1, 2]) push("panels", { rows, cols: cc }, cols.slice((rows + cc) % 5, (rows + cc) % 5 + 4));
    push("panels", { rows: 2, cols: 1, arch: true, heights: [1, 1.5] }, cols.slice(0, 6)); push("panels", { rows: 3, cols: 1, heights: [0.7, 1.4, 0.8] }, cols.slice(2, 8));
    push("panels", { rows: 2, cols: 2, arch: true, heights: [1, 1.4] }, cols.slice(1, 6)); push("panels", { rows: 6, cols: 1, pad: 18, gap: 10 }, cols.slice(0, 3));
  } else if (cat === "SHI") {
    const cols = [["oq", 0], ["oq", 2], ["qora", 0], ["grafit", 0], ["grafit", 1], ["yongoq", 0], ["eman", 0], ["kulrang", 1], ["bej", 1], ["yongoq", 1]];
    const kinds = ["top", "full", "wide", "center", "side", "full-grid", "double", "arch"], tints = ["clear", "frost", "bronze", "grey"], bases = [undefined, "panels", "grooves", "inlay"];
    kinds.forEach((k, ki) => tints.forEach((t, ti) => push("glass", { kind: k, tint: t, base: bases[(ki + ti) % 4], panels: { rows: 2 }, metal: "chrome", cols: k === "wide" ? 3 : undefined, rows: k === "wide" ? 2 : undefined }, cols.slice((ki + ti) % 6, (ki + ti) % 6 + 2))));
  } else if (cat === "YOG") {
    const cols = [["eman", 0], ["eman", 1], ["eman", 2], ["eman", 3], ["yongoq", 0], ["yongoq", 1], ["yongoq", 2], ["yongoq", 3], ["bej", 3]];
    for (const dir of ["v", "h"]) for (const planks of [0, 2, 3, 4]) for (const kn of [0, 4]) push("wood", { lines: 44 + planks * 4 + kn, dir, planks, knots: kn, contrast: 0.26 + kn * 0.02 }, cols.slice((planks + kn) % 5, (planks + kn) % 5 + 2));
    push("wood", { lines: 56, dir: "v", groove: 2 }, cols.slice(0, 5)); push("wood", { lines: 50, dir: "v", groove: 3, planks: 0 }, cols.slice(3, 8));
    push("wood", { lines: 52, dir: "h", inlay: "chrome" }, cols.slice(1, 5)); push("wood", { lines: 48, dir: "v", inlay: "gold" }, cols.slice(4, 8)); push("wood", { lines: 58, dir: "v", inlay: "black", planks: 2 }, cols.slice(2, 6));
  } else if (cat === "OQL") {
    const cols = [["oq", 0], ["oq", 1], ["oq", 2], ["oq", 3], ["bej", 2], ["bej", 0], ["kulrang", 3], ["kulrang", 0], ["eman", 2], ["bej", 1]];
    push("panels", { rows: 2, cols: 1, pad: 26 }, cols.slice(0, 4)); push("panels", { rows: 3, cols: 1 }, cols.slice(2, 6)); push("groovesV", { n: 3 }, cols.slice(0, 5)); push("groovesV", { n: 5, full: true }, cols.slice(4, 8));
    push("glass", { kind: "top", tint: "frost", base: "panels", panels: { rows: 2 } }, cols.slice(0, 4)); push("glass", { kind: "full", tint: "clear" }, cols.slice(3, 7)); push("inlay", { metal: "chrome", inset: 24 }, cols.slice(0, 4));
    push("flat", {}, cols.slice(4, 8)); push("groovesH", { n: 4 }, cols.slice(0, 4)); push("wood", { lines: 40, dir: "v", contrast: 0.16 }, [["eman", 2], ["bej", 3], ["oq", 3], ["eman", 3]]);
  } else if (cat === "TUQ") {
    const cols = [["qora", 0], ["qora", 1], ["qora", 2], ["grafit", 0], ["grafit", 1], ["grafit", 2], ["kulrang", 2], ["yongoq", 1], ["yongoq", 2], ["kulrang", 1]];
    push("flat", {}, cols.slice(0, 8)); push("groovesV", { n: 4, full: true }, cols.slice(0, 7)); push("groovesH", { n: 5 }, cols.slice(2, 9)); push("groovesV", { n: 2 }, cols.slice(1, 8));
    push("inlay", { metal: "chrome", cross: true, inset: 24 }, cols.slice(0, 4)); push("inlay", { metal: "gold", hbar: [0.5], frame: false }, cols.slice(1, 5)); push("inlay", { metal: "black", inset: 28 }, cols.slice(3, 7));
    push("glass", { kind: "full", tint: "grey" }, cols.slice(0, 4)); push("wood", { lines: 56, dir: "v", contrast: 0.34, planks: 3 }, [["yongoq", 1], ["yongoq", 2], ["kulrang", 2]]);
  } else if (cat === "GEO") {
    const cols = [["grafit", 0], ["bej", 0], ["kulrang", 0], ["oq", 1], ["qora", 0], ["eman", 0], ["yongoq", 0], ["kulrang", 2], ["grafit", 1]];
    ["diamond", "chevron", "diag", "circles", "squares", "triangles", "stripes", "steps"].forEach((k, i) => push("geo", { kind: k, size: 26 + (i % 4) * 6, contrast: 0.3 }, cols.slice(i % 5, i % 5 + 3)));
  } else if (cat === "NOD") {
    const cols = [["bej", 2], ["grafit", 0], ["oq", 0], ["kulrang", 3], ["qora", 0], ["eman", 2], ["yongoq", 0], ["bej", 0], ["kulrang", 0]];
    const accents = ["#8a7246", "#2f3033", "#b8794a", "#6b7a72", "#7a4332", "#c9a77c", "#3d4a5c"];
    ["diagsplit", "blocks", "porthole", "slots", "offsetglass", "bands", "cornercut", "rings", "frameinset"].forEach((k, i) => {
      for (let v = 0; v < 3; v++) push("nod", { kind: k, accent: accents[(i + v * 2) % accents.length], t: 0.3 + v * 0.12, w: 0.3 + v * 0.1, r: 34 + v * 6, n: 3 + v, tint: v === 1 ? "bronze" : "clear", metal: v === 2 ? "gold" : "brass" }, cols.slice((i + v) % 6, (i + v) % 6 + 2), { arch: (k === "porthole" || k === "rings") && v !== 1 });
    });
  }
  return shuffle(out, r);
}

/* ---------- Matnlar ---------- */
const PATTERN_TEXT = {
  groovesV: "vertikal frezalangan chiziqlar", groovesH: "gorizontal frezalangan chiziqlar", groovesCross: "kesishuvchi frezalangan chiziqlar", flat: "tekis, bezaksiz yuza",
  inlay: "nozik metall rangli bezak chiziqlari", panels: "frezalangan panellar", glass: "shisha oyna elementi", wood: "yog'och tolasini eslatuvchi tekstura",
  geo: "geometrik naqsh", nod: "noodatiy kompozitsiya"
};
const FINISH_BY_CAT = {
  MIN: [["Mat emal", "Emal (bo'yoq)"], ["Soft-touch qoplama", "Soft-touch plyonka"], ["Ipak-mat PVC", "PVC plyonka"], ["Mat lak", "Lak"]],
  LUX: [["Yaltiroq piano lak", "Piano lak"], ["Soft-touch + metall bezak", "Soft-touch plyonka"], ["Chuqur mat emal", "Emal (bo'yoq)"], ["Eko-shpon + lak", "Eko-shpon"]],
  KLS: [["Mat emal", "Emal (bo'yoq)"], ["Yarim yaltiroq emal", "Emal (bo'yoq)"], ["Patina effektli emal", "Emal (bo'yoq)"], ["PVC plyonka", "PVC plyonka"]],
  SHI: [["Mat emal + oyna", "Emal (bo'yoq)"], ["PVC plyonka + oyna", "PVC plyonka"], ["Eko-shpon + oyna", "Eko-shpon"], ["Lamino + oyna", "Laminat"]],
  YOG: [["Eman tekstura", "Eko-shpon"], ["Yong'oq tekstura", "Eko-shpon"], ["Chuqur tolali tekstura", "Laminat"], ["Tabiiy tolali PVC", "PVC plyonka"]],
  OQL: [["Mat oq emal", "Emal (bo'yoq)"], ["Ipak-mat PVC", "PVC plyonka"], ["Och mat lak", "Lak"], ["Soft-touch qoplama", "Soft-touch plyonka"]],
  TUQ: [["Chuqur mat emal", "Emal (bo'yoq)"], ["Soft-touch qoplama", "Soft-touch plyonka"], ["Antratsit PVC", "PVC plyonka"], ["Mat lak", "Lak"]],
  GEO: [["Mat emal", "Emal (bo'yoq)"], ["Frezalangan naqsh + emal", "Emal (bo'yoq)"], ["PVC plyonka", "PVC plyonka"], ["Lak", "Lak"]],
  NOD: [["Ikki rangli emal", "Emal (bo'yoq)"], ["Mat emal + metall detal", "Emal (bo'yoq)"], ["Soft-touch + akcent", "Soft-touch plyonka"], ["PVC plyonka", "PVC plyonka"]]
};
const INTRO = {
  MIN: ["sokin, toza chiziqlar va ortiqcha bezaksiz ko'rinish", "zamonaviy interyer uchun yengil va minimalistik yechim", "diqqatni tortmaydigan, lekin sifatli ko'rinadigan lakonik dizayn"],
  LUX: ["premium sinfdagi, metall detallar bilan boyitilgan eshik", "hashamatli interyer uchun mo'ljallangan nafis model", "chuqur rang va nozik bezaklarni birlashtirgan luxury dizayn"],
  KLS: ["an'anaviy panelli, klassik interyerga mos eshik", "nafis frezalangan panellar bilan bezatilgan klassik model", "yillar o'tsa ham eskirmaydigan klassik uslub"],
  SHI: ["yorug'likni xonalar orasida o'tkazadigan shisha elementli eshik", "shisha va MDF uyg'unligidan iborat yengil model", "xonani vizual kengaytiradigan shishali dizayn"],
  YOG: ["yog'och tolasini aks ettiruvchi issiq teksturali eshik", "tabiiy yog'och ko'rinishini beruvchi MDF model", "iliq va tabiiy muhit yaratadigan teksturali dizayn"],
  OQL: ["xonani yorug' va kengroq ko'rsatuvchi och rangli eshik", "toza va yengil ko'rinishdagi och rangli model", "yumshoq ranglari bilan har qanday interyerga mos eshik"],
  TUQ: ["to'q rangi bilan interyerga urg'u beruvchi eshik", "chuqur va kuchli rangli zamonaviy model", "kontrastli interyerlar uchun to'q rangli dizayn"],
  GEO: ["geometrik naqshli, o'ziga xos ritmga ega eshik", "takrorlanuvchi shakllardan tashkil topgan grafik dizayn", "aniq geometriyasi bilan ajralib turadigan model"],
  NOD: ["noodatiy kompozitsiyali zamonaviy dizayn eshik", "odatiy shakllardan chiqqan, o'ziga xos model", "interyerda asosiy urg'u bo'la oladigan tajribaviy dizayn"]
};
const METAL_UZ = { gold: "oltin rangli", rose: "pushti-oltin rangli", chrome: "xrom rangli", brass: "jez rangli", black: "qora" };
const GLASS_UZ = { top: "yuqori qismida shisha oyna", full: "bo'ylama tor shisha", wide: "keng shisha oyna", center: "markazda shisha oyna", side: "yon tomonda tor shisha", "full-grid": "bo'laklarga bo'lingan to'rli shisha", double: "ikki qismli shisha", arch: "arkasimon shisha" };
const TINT_UZ = { clear: "tiniq", frost: "xira (matolangan)", bronze: "bronza tusli", grey: "kulrang tusli" };
const GEO_UZ = { diamond: "romb", chevron: "zigzag (chevron)", diag: "diagonal chiziqli", circles: "doira", squares: "kvadrat", triangles: "uchburchak", stripes: "vertikal polosali", steps: "zinapoyasimon" };
const NOD_UZ = { diagsplit: "diagonal ikki rangli bo'linish", blocks: "ikki rangli vertikal blok", porthole: "dumaloq oyna (illyuminator)", slots: "vertikal tirqishlar", offsetglass: "yon tomonga siljigan shisha", bands: "gorizontal rangli bantlar", cornercut: "burchak kesimli ikki rangli kompozitsiya", rings: "halqasimon bezaklar", frameinset: "markaziy rangli panel" };
/** Dizayn parametrlariga mos aniq tavsif (har bir mahsulot uchun alohida) */
function patternText(v) {
  const p = v.p || {};
  switch (v.pattern) {
    case "groovesV": return `${p.n} ta vertikal frezalangan chiziq`;
    case "groovesH": return `${p.n} ta gorizontal frezalangan chiziq`;
    case "groovesCross": return "kesishuvchi frezalangan chiziqlar";
    case "flat": return "tekis, bezaksiz yuza";
    case "inlay": return `${METAL_UZ[p.metal] || "metall"} bezak chiziqlari`;
    case "panels": return `${(p.rows || 2) * (p.cols || 1)} ta frezalangan panel${p.arch ? " va arkasimon yuqori qism" : ""}`;
    case "glass": return `${TINT_UZ[p.tint] || "tiniq"} ${GLASS_UZ[p.kind] || "shisha element"}`;
    case "wood": return `${p.dir === "h" ? "gorizontal" : "vertikal"} tolali yog'och tekstura${p.knots ? " (tabiiy g'adir-budurliklar bilan)" : ""}${p.inlay ? ` va ${METAL_UZ[p.inlay]} metall chiziq` : ""}`;
    case "geo": return `${GEO_UZ[p.kind] || "geometrik"} naqsh`;
    case "nod": return NOD_UZ[p.kind] || "noodatiy kompozitsiya";
    default: return PATTERN_TEXT[v.pattern] || "zamonaviy dizayn";
  }
}
const FIT = ["Yashash xonasi, yotoqxona yoki ofis uchun mos.", "Xonalararo eshik sifatida ishlatish mumkin.", "Standart eshik oynasiga o'rnatish uchun mo'ljallangan.", "Boshqa interyer detallari bilan uyg'unlashtirish oson."];

const SIZE_SETS = [
  ["600 × 2000", "700 × 2000", "800 × 2000", "900 × 2000"],
  ["700 × 2000", "800 × 2000", "900 × 2000"],
  ["800 × 2000", "900 × 2000", "800 × 2100", "900 × 2100"],
  ["600 × 2000", "700 × 2000", "800 × 2000", "900 × 2000", "800 × 2100"]
];
const PRICE_RANGE = { MIN: [1550000, 2650000], LUX: [3600000, 6900000], KLS: [2000000, 3500000], SHI: [2400000, 3900000], YOG: [2000000, 3700000], OQL: [1500000, 2600000], TUQ: [1900000, 3300000], GEO: [2500000, 3800000], NOD: [2900000, 5000000] };
const STYLE_BY_CAT = { MIN: ["minimalistik", "minimalistik", "zamonaviy"], LUX: ["zamonaviy", "neoklassik"], KLS: ["klassik", "klassik", "neoklassik"], SHI: ["shishali"], YOG: ["zamonaviy", "loft", "minimalistik"], OQL: ["minimalistik", "klassik", "zamonaviy", "neoklassik"], TUQ: ["loft", "zamonaviy", "minimalistik"], GEO: ["zamonaviy", "loft"], NOD: ["zamonaviy", "loft"] };
const STYLE_UZ = { klassik: "klassik", neoklassik: "neoklassik", zamonaviy: "zamonaviy", minimalistik: "minimalistik", shishali: "shishali", loft: "loft" };

const pad3 = n => String(n).padStart(3, "0");
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const roundTo = (v, step) => Math.round(v / step) * step;

/** Hamma 200 mahsulot spetsifikatsiyasi (deterministik). */
function buildCatalog() {
  const specs = [];
  const names = new Set(LEGACY.map(p => p.name.toLowerCase()));
  const legacyByCat = {};
  LEGACY.forEach(p => { const c = LEGACY_MAP[p.id]; (legacyByCat[c] = legacyByCat[c] || []).push(p); });
  let gi = 0;
  CATEGORIES.forEach((cat, ci) => {
    const r = rng(1000 + ci * 7919);
    const legacy = legacyByCat[cat.key] || [];
    const variants = variantsFor(cat.key, r);
    const seen = new Set();
    const words = shuffle(WORDS[cat.key], rng(55 + ci));
    let wi = 0, vi = 0, seq = 0;
    const ptotal = cat.count;
    // 1) avvalgi namunaviy mahsulotlar (ID, nom, rasm saqlanadi)
    legacy.forEach(p => {
      seq++; gi++;
      const sku = `YD-${cat.key}-${pad3(seq)}`;
      specs.push(finishSpec({ cat, sku, id: p.id, name: p.name, ck: p.color, style: p.style, legacy: p, gi, seq, r: rng(gi * 31 + 3), total: ptotal }));
    });
    // 2) yangi mahsulotlar
    while (seq < ptotal) {
      let v = variants[vi++];
      if (!v) throw new Error(`Variantlar yetmadi: ${cat.key}`);
      const key = JSON.stringify([v.pattern, v.p, v.ck, v.pi, v.arch]);
      if (seen.has(key)) continue;
      seen.add(key);
      const pal = PAL[v.ck][v.pi % PAL[v.ck].length];
      let name, tries = 0;
      do { name = `${words[wi % words.length]} ${pal[0]}`; wi++; tries++; } while (names.has(name.toLowerCase()) && tries < 80);
      if (names.has(name.toLowerCase())) name = `${name} ${tries}`;
      names.add(name.toLowerCase());
      seq++; gi++;
      const sku = `YD-${cat.key}-${pad3(seq)}`;
      const rr = rng(gi * 31 + 3);
      specs.push(finishSpec({ cat, sku, id: slug(name), name, ck: v.ck, pal, variant: v, gi, seq, r: rr, total: ptotal }));
    }
  });
  // yakuniy tekshiruv: 200 ta, noyob SKU/ID/nom
  const uniq = (k) => new Set(specs.map(s => s[k].toLowerCase())).size;
  if (specs.length !== 200 || uniq("sku") !== 200 || uniq("id") !== 200 || uniq("name") !== 200) throw new Error("Katalog yaroqsiz: 200 ta noyob mahsulot chiqmadi");
  return specs;
}

function finishSpec(o) {
  const { cat, sku, id, name, ck, r, gi, seq } = o;
  const [lo, hi] = PRICE_RANGE[cat.key];
  const price = o.legacy ? o.legacy.price : roundTo(lo + (hi - lo) * Math.pow(r(), 0.9), 10000);
  const discount = o.legacy ? o.legacy.oldPrice || null : (gi % 5 === 0 ? roundTo(price * (1.08 + r() * 0.17), 10000) : null);
  const finishPair = pick(FINISH_BY_CAT[cat.key], r);
  const style = o.style || pick(STYLE_BY_CAT[cat.key], r);
  const patKey = o.variant ? o.variant.pattern : null;
  const palName = o.pal ? o.pal[0] : (o.legacy ? null : "");
  const colorName = COLOR_UZ[ck] || ck;
  const stockRoll = r();
  const stock = stockRoll < 0.06 ? 0 : stockRoll < 0.2 ? 1 + Math.floor(r() * 5) : 6 + Math.floor(r() * 43);
  const daysAgo = Math.floor(r() * 150);
  const sizes = o.legacy ? o.legacy.sizes : pick(SIZE_SETS, r);
  const intro = pick(INTRO[cat.key], r);
  let short, description, material, finish;
  if (o.legacy) {
    short = o.legacy.short; description = o.legacy.description;
    material = (o.legacy.specs && o.legacy.specs.Material) || "MDF"; finish = (o.legacy.specs && o.legacy.specs.Qoplama) || finishPair[0];
  } else {
    const pt = patternText(o.variant);
    material = `MDF, ${finishPair[1]}`; finish = finishPair[0];
    short = `${capitalize(colorName)} (${palName}) ${STYLE_UZ[style]} MDF eshik: ${pt}.`;
    description = `${name} — ${intro}. Rang: ${colorName} (${palName}), qoplama: ${finish.toLowerCase()}, dizayn elementi: ${pt}. ${pick(FIT, r)} Standart o'lchamlardan tashqari buyurtma asosida ham tayyorlash mumkin; aniq shartlar menejer bilan kelishiladi.`;
  }
  const spec = {
    sku, id, name, category: cat.key, category_name: cat.name, style, color: ck, finish, material, sizes,
    price, old_price: discount, stock, low_stock: 5,
    active: gi % 25 !== 0,                       // 8 ta mahsulot "yashirin" (faol emas)
    is_new: daysAgo <= 30, is_popular: gi % 8 === 0,
    days_ago: daysAgo, short, description,
    image: o.legacy ? o.legacy.image : `assets/img/doors/${sku.toLowerCase()}.svg`,
    legacy_id: o.legacy ? o.legacy.id : null
  };
  if (!o.legacy) spec.design = buildDesign(cat.key, o.variant, o.pal, gi, r);
  return spec;
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function buildDesign(catKey, v, pal, gi, r) {
  const dark = ["TUQ"].includes(catKey) || ["qora", "grafit"].includes(v.ck) && gi % 2 === 0;
  const wall = dark ? DARK_WALLS[gi % DARK_WALLS.length] : WALLS[gi % WALLS.length];
  const handleSet = catKey === "LUX" ? HANDLES_LUX : catKey === "KLS" ? HANDLES_CLS : HANDLES_MOD;
  const p = JSON.parse(JSON.stringify(v.p));
  return {
    leaf: pal[1], wall, floor: FLOORS[gi % FLOORS.length],
    handle: handleSet[gi % handleSet.length], side: gi % 3 === 0 ? "left" : "right",
    pattern: v.pattern, p, seed: 100 + gi * 13, shape: v.arch ? "arch" : "rect"
  };
}

/* ---------- Seed (idempotent) ---------- */
const NEW_COLS = "id,name,short,description,category_id,price,old_price,color,style,material,sizes,image,stock,low_stock,active,is_new,is_popular,created_at,updated_at,sku,finish,views";

/**
 * Kategoriyalar va mahsulotlarni bazaga yozadi. Qayta ishga tushirilsa SKU bor mahsulotlar o'tkazib yuboriladi.
 * Natija: { inserted, skipped, linked, categories }
 */
async function seedCatalog(db, userInfo) {
  const specs = buildCatalog();
  const nowMs = Date.now(), t = new Date(nowMs).toISOString();
  // 1) kategoriyalar
  const catId = {};
  for (const c of CATEGORIES) {
    const sl = slug(c.name);
    await db.run("INSERT OR IGNORE INTO categories (name, slug, created_at) VALUES (?,?,?)", [c.name, sl, t]);
    catId[c.key] = Number((await db.get("SELECT id FROM categories WHERE slug = ?", [sl])).id);
  }
  // 2) mavjud mahsulotlar
  const rows = await db.all("SELECT id, sku FROM products");
  const bySku = new Set(rows.filter(r => r.sku).map(r => r.sku));
  const ids = new Set(rows.map(r => r.id));
  // SKU'siz yoki avtomatik berilgan SKU'li (YD-XXXXXXXX) mahsulotlar — avvalgi namunaviy import; ularni bog'laymiz
  const noSku = new Map(rows.filter(r => !r.sku || /^YD-[0-9A-F]{8}$/.test(r.sku)).map(r => [r.id, true]));
  let inserted = 0, skipped = 0, linked = 0;
  let stmts = [];
  const flush = async () => { if (stmts.length) { await db.batch(stmts); stmts = []; } };
  for (const s of specs) {
    if (bySku.has(s.sku)) { skipped++; continue; }
    if (s.legacy_id && noSku.has(s.legacy_id)) {
      // avvalgi namunaviy mahsulot: tahrirlangan narx/nom/ombor o'zgartirilmaydi, faqat SKU, kategoriya va tekstura bog'lanadi
      stmts.push({ sql: "UPDATE products SET sku = ?, category_id = COALESCE(category_id, ?), finish = CASE WHEN finish IS NULL OR finish = '' THEN ? ELSE finish END WHERE id = ?", args: [s.sku, catId[s.category], s.finish, s.legacy_id] });
      linked++; bySku.add(s.sku); continue;
    }
    let id = s.id;
    if (ids.has(id)) id = `${s.id}-${s.sku.toLowerCase()}`;
    ids.add(id);
    const created = new Date(nowMs - s.days_ago * 86400e3).toISOString();
    stmts.push({
      sql: `INSERT OR IGNORE INTO products (${NEW_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      args: [id, s.name, s.short, s.description, catId[s.category], s.price, s.old_price, s.color, s.style, s.material, JSON.stringify(s.sizes), s.image,
        s.stock, s.low_stock, s.active ? 1 : 0, s.is_new ? 1 : 0, s.is_popular ? 1 : 0, created, created, s.sku, s.finish]
    });
    if (s.stock > 0) {
      stmts.push({
        sql: "INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [id, s.name, s.stock, s.stock, "initial", "Namunaviy katalog (seed)", userInfo ? userInfo.id : null, userInfo ? userInfo.username : "seed", created]
      });
    }
    inserted++;
    if (stmts.length >= 60) await flush();
  }
  await flush();
  return { inserted, skipped, linked, total: specs.length, categories: CATEGORIES.length };
}

/**
 * Namunaviy (seed) eshiklarni o'chirish. FAQAT seed yaratgan mahsulotlar: SKU seed ro'yxatida va rasmi seed rasmi
 * (assets/img/doors/<sku>.svg). Asl katalog mahsulotlari (products.js: 10 ta eski + foto eshiklar) va admin qo'lda qo'shganlari tegilmaydi.
 * Ochiq buyurtmadagi mahsulotlar o'chirilmaydi (store.deleteProducts). dryRun=true — faqat nechta ekanini hisoblaydi.
 * Natija: { found, deleted, blocked, dryRun }
 */
async function removeSeedProducts(db, store, opts) {
  const dryRun = !!(opts && opts.dryRun);
  const specs = buildCatalog().filter(s => !s.legacy_id);
  const bySku = new Map(specs.map(s => [s.sku, s]));
  const rows = await db.all("SELECT id, sku, image FROM products WHERE sku IS NOT NULL AND sku <> ''");
  const ids = rows.filter(r => { const sp = bySku.get(r.sku); return sp && r.image === sp.image; }).map(r => r.id);
  if (dryRun) return { found: ids.length, deleted: [], blocked: [], dryRun: true };
  const out = { deleted: [], blocked: [] };
  for (let i = 0; i < ids.length; i += 100) {
    const r = await store.deleteProducts(ids.slice(i, i + 100));
    out.deleted.push(...r.deleted); out.blocked.push(...r.blocked);
  }
  return { found: ids.length, deleted: out.deleted, blocked: out.blocked, dryRun: false };
}

module.exports = { CATEGORIES, buildCatalog, seedCatalog, removeSeedProducts };
