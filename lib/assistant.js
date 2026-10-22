/**
 * YasinDoors AI yordamchisi (server tomoni) — faqat standart savollar rejimi.
 *
 * Mijoz erkin matn yozmaydi: 14 ta standart savol tugmalari va qadamma-qadam tavsiya tugmalari ishlaydi.
 * Javoblar saytning HAQIQIY ma'lumotlaridan (katalog, sozlamalar, geo-regions) tuziladi; tashqi AI xizmati ishlatilmaydi,
 * shuning uchun API kaliti va to'lov kerak emas. Chat bazaga yozilmaydi va logga chiqmaydi.
 */
"use strict";

const GEO = require("../public/assets/js/geo-regions.js");
const STATIC = require("../public/assets/js/products.js");
const CFG = require("../public/assets/js/configurator-data.js");
const db = require("./db");
const store = require("./store");

const REGION_NAMES = GEO.LABELS;   // samarqand, sirdaryo, toshkent, navoiy

const money = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m";

/* ---------- Haqiqiy ma'lumotlar konteksti ---------- */
let cache = { at: 0, ctx: null };
async function loadContext() {
  if (cache.ctx && Date.now() - cache.at < 15000) return cache.ctx;
  let ctx = null;
  if (db.isConfigured()) {
    try {
      const d = await store.publicCatalog();
      if (d.source === "db" && d.products && d.products.length) ctx = { source: "db", products: d.products, settings: d.settings || {} };
      else if (d.settings) ctx = { source: "static", products: STATIC.PRODUCTS, settings: d.settings };
    } catch (e) { /* statik katalog bilan davom etamiz */ }
  }
  if (!ctx) ctx = { source: "static", products: STATIC.PRODUCTS, settings: {} };
  ctx = Object.assign({}, ctx, { products: ctx.products.filter(p => p && p.price > 0) });
  cache = { at: Date.now(), ctx };
  return ctx;
}

function facts(ctx, now) {
  const s = ctx.settings || {};
  const phoneDisplay = s.phone || GEO.PHONE.display;
  const tel = "+" + String(s.phone ? s.phone : GEO.PHONE.tel).replace(/\D/g, "");
  const st = GEO.workStatus(now);
  return {
    name: s.store_name || "YasinDoors",
    phone: phoneDisplay, tel,
    hours: GEO.HOURS.text, workHoursNote: s.work_hours || "",
    tz: GEO.HOURS.tz, open: st.open, hour: st.hour, minute: st.minute,
    regions: Object.keys(REGION_NAMES).map(k => REGION_NAMES[k]),
    map: GEO.mapsUrl(GEO.SHOP.lat, GEO.SHOP.lng),
    delivery_terms: String(s.delivery_terms || "").trim(), warranty: String(s.warranty_info || "").trim(),
    sample: ctx.source !== "db"
  };
}

function stats(ctx) {
  const P = ctx.products;
  const prices = P.map(p => p.price);
  const styles = {}, colors = {}, sizes = {}, cats = {};
  P.forEach(p => {
    styles[p.style] = (styles[p.style] || 0) + 1; colors[p.color] = (colors[p.color] || 0) + 1;
    (p.sizes || []).forEach(sz => { sizes[sz] = (sizes[sz] || 0) + 1; });
    if (p.category) cats[p.category] = (cats[p.category] || 0) + 1;
  });
  return { n: P.length, min: Math.min.apply(null, prices), max: Math.max.apply(null, prices), styles, colors, sizes, cats };
}

const imgUrl = i => { i = String(i || "assets/img/fallback.svg"); return /^(https?:)?\/\//.test(i) || i[0] === "/" ? i : "/" + i; };
function card(p) {
  return { id: p.id, name: p.name, price: p.price, oldPrice: p.oldPrice && p.oldPrice > p.price ? p.oldPrice : null, image: imgUrl(p.image), url: "/Product?id=" + encodeURIComponent(p.id),
    style: STATIC.STYLES[p.style] || p.style, color: (STATIC.COLORS[p.color] || {}).name || p.color };
}
const widthOf = sz => { const m = /(\d{3,4})/.exec(String(sz)); return m ? Number(m[1]) : 0; };

/* ---------- Mahsulotlarni mezon bo'yicha tanlash ---------- */
function applyCriteria(P, c) {
  const test = {
    style: p => !c.style || c.style === "any" || p.style === c.style,
    color: p => !c.color || c.color === "any" || p.color === c.color,
    width: p => !c.width || c.width === "any" || (p.sizes || []).some(sz => widthOf(sz) === Number(c.width)),
    budget: p => !c.budget || c.budget === "any" || ((!c.budget[0] || p.price >= c.budget[0]) && (!c.budget[1] || p.price <= c.budget[1]))
  };
  return { test, run: keys => P.filter(p => keys.every(k => test[k](p))) };
}
function rank(list) {
  return list.slice().sort((a, b) => ((b.badges || []).indexOf("popular") !== -1) - ((a.badges || []).indexOf("popular") !== -1) || a.price - b.price);
}
function recommend(ctx, c) {
  const P = ctx.products;
  if (!P.length) return { products: [], note: "empty" };
  const ap = applyCriteria(P, c);
  const keys = ["style", "color", "width", "budget"].filter(k => c[k] != null && c[k] !== "any");
  let found = ap.run(keys);
  if (found.length) return { products: rank(found).slice(0, 4), total: found.length, relaxed: [] };
  // Aynan mos kelmadi: mezonlarni oxirgidan boshlab yumshatamiz va buni ochiq aytamiz
  const order = ["width", "color", "style", "budget"];
  const dropped = [];
  let cur = keys.slice();
  for (const k of order) {
    if (cur.indexOf(k) === -1) continue;
    cur = cur.filter(x => x !== k); dropped.push(k);
    found = ap.run(cur);
    if (found.length) return { products: rank(found).slice(0, 4), total: found.length, relaxed: dropped };
  }
  return { products: [], note: "none" };
}
const CRIT_NAME = { style: "uslub", color: "rang", width: "kenglik", budget: "budjet" };
function describeCriteria(c) {
  const out = [];
  if (c.style && c.style !== "any") out.push("uslub: " + (STATIC.STYLES[c.style] || c.style));
  if (c.color && c.color !== "any") out.push("rang: " + ((STATIC.COLORS[c.color] || {}).name || c.color));
  if (c.width && c.width !== "any") out.push("kenglik: " + c.width + " mm");
  if (c.budget && c.budget !== "any") out.push("budjet: " + (c.budget[0] ? money(c.budget[0]) + " dan " : "") + (c.budget[1] ? money(c.budget[1]) + " gacha" : "").trim());
  return out.join(", ");
}
function catalogLink(c) {
  const q = [];
  if (c.style && c.style !== "any") q.push("style=" + encodeURIComponent(c.style));
  if (c.color && c.color !== "any") q.push("color=" + encodeURIComponent(c.color));
  if (c.budget && c.budget !== "any") { if (c.budget[0]) q.push("min=" + c.budget[0]); if (c.budget[1]) q.push("max=" + c.budget[1]); }
  return "/Products" + (q.length ? "?" + q.join("&") : "");
}

/* ---------- Tavsiya suhbati (qadamma-qadam) ---------- */
function nextAsk(ctx, c) {
  const st = stats(ctx);
  if (c.style == null) {
    const opts = Object.keys(st.styles).map(k => ({ label: STATIC.STYLES[k] || k, criteria: { style: k } }));
    return { text: "Qanday uslub yoqadi?", options: opts.concat([{ label: "Farqi yo‘q", criteria: { style: "any" } }]) };
  }
  if (c.color == null) {
    const opts = Object.keys(st.colors).map(k => ({ label: (STATIC.COLORS[k] || {}).name || k, criteria: { color: k } }));
    return { text: "Qaysi rang kerak?", options: opts.concat([{ label: "Farqi yo‘q", criteria: { color: "any" } }]) };
  }
  if (c.width == null) {
    const widths = Array.from(new Set(Object.keys(st.sizes).map(widthOf).filter(Boolean))).sort((a, b) => a - b);
    return { text: "Eshik kengligi qancha kerak? (balandlik odatda 2000 mm)", options: widths.map(w => ({ label: w + " mm", criteria: { width: w } })).concat([{ label: "Farqi yo‘q", criteria: { width: "any" } }]) };
  }
  if (c.budget == null) {
    const prices = ctx.products.map(p => p.price).sort((a, b) => a - b);
    const q = f => Math.round(prices[Math.min(prices.length - 1, Math.floor(prices.length * f))] / 100000) * 100000;
    const a = q(0.33), b = q(0.66);
    const opts = [];
    if (a > 0) opts.push({ label: money(a) + " gacha", criteria: { budget: [0, a] } });
    if (b > a) opts.push({ label: money(a) + " – " + money(b), criteria: { budget: [a, b] } });
    opts.push({ label: money(b) + " dan yuqori", criteria: { budget: [b, 0] } });
    return { text: "Taxminiy budjetingiz qancha? (1 ta eshik narxi)", options: opts.concat([{ label: "Farqi yo‘q", criteria: { budget: "any" } }]) };
  }
  return null;
}
function recommendReply(ctx, c) {
  const ask = nextAsk(ctx, c);
  if (ask) return { reply: ask.text, suggestions: ask.options.map(o => ({ label: o.label, action: "recommend", criteria: Object.assign({}, c, o.criteria) })), wizard: true };
  return resultsReply(ctx, c);
}
function resultsReply(ctx, c) {
  const r = recommend(ctx, c);
  const f = facts(ctx);
  const sample = f.sample ? "\n\nEslatma: saytdagi narxlar hozircha namunaviy; aniq narxni menejer tasdiqlaydi." : "";
  const restart = { label: "Boshqa mezonlar bilan qidirish", action: "recommend", criteria: {} };
  if (!r.products.length) {
    return { reply: "Afsuski, katalogda hozircha mos eshik topilmadi" + (describeCriteria(c) ? " (" + describeCriteria(c) + ")" : "") + ". Boshqa mezonlarni sinab ko‘ring yoki menejerimiz individual variant taklif qilishi mumkin: " + f.phone + "." + sample,
      products: [], suggestions: [restart, { label: "Operator bilan bog‘lanish", intent: "contact" }], links: [{ label: "Katalog", href: "/Products" }, { label: "3D konstruktor", href: "/Configurator" }] };
  }
  const items = r.products.map(card);
  let text;
  if (r.relaxed && r.relaxed.length) {
    text = "Aynan " + (describeCriteria(c) || "shu mezonlar") + " bo‘yicha eshik topilmadi. Eng yaqin variantlar (" + r.relaxed.map(k => CRIT_NAME[k]).join(", ") + " bo‘yicha farq qiladi):";
  } else text = (describeCriteria(c) ? "Mezonlaringiz bo‘yicha (" + describeCriteria(c) + ") " : "") + r.total + " ta mos eshik topildi. Eng mosini ko‘rsatyapman:";
  return { reply: text + sample, products: items, suggestions: [restart, { label: "Buyurtma qanday beriladi?", intent: "how_order" }], links: [{ label: "Katalogda hammasini ko‘rish", href: catalogLink(c) }] };
}

const QUICK = {
  price: "MDF eshiklar narxi qancha?", models: "Qanday eshik modellari bor?", recommend: "Qaysi eshikni tanlashni tavsiya qilasiz?", sizes: "Eshiklarning o‘lchamlari qanday?",
  colors: "Qanday ranglar mavjud?", how_order: "Eshikni qanday buyurtma qilaman?", delivery_service: "Yetkazib berish xizmati bormi?",
  regions: "Qaysi viloyatlarga yetkazib berasiz?", delivery_price: "Yetkazib berish narxi qancha?", install: "Eshikni o‘rnatib berasizmi?", order_status: "Buyurtmam holatini qanday bilaman?",
  contact: "Siz bilan qanday bog‘lanish mumkin?", hours: "Ish vaqtingiz qanday?", other: "Boshqa savolim bor."
};
const QUICK_ORDER = ["price", "models", "recommend", "sizes", "colors", "how_order", "delivery_service", "regions", "delivery_price", "install", "order_status", "contact", "hours", "other"];
const sug = ids => ids.map(id => ({ label: QUICK[id], intent: id }));
const phoneLink = f => ({ label: "Qo‘ng‘iroq: " + f.phone, href: "tel:" + f.tel });

function hoursLine(f) {
  if (f.open) return "Hozir (Toshkent vaqti bilan " + String(f.hour).padStart(2, "0") + ":" + String(f.minute).padStart(2, "0") + ") ish vaqti ichidamiz.";
  return "Hozir (Toshkent vaqti bilan " + String(f.hour).padStart(2, "0") + ":" + String(f.minute).padStart(2, "0") + ") ish vaqtidan tashqaridamiz. Buyurtmani hozir ham qoldirishingiz mumkin.";
}
function sampleNote(f) { return f.sample ? "\n\nEslatma: saytdagi narxlar hozircha namunaviy, aniq narxni menejer tasdiqlaydi." : ""; }

const HANDLERS = {
  greeting: (ctx, f) => ({ reply: "Assalomu alaykum! Men YasinDoors AI yordamchisiman. MDF eshiklar, narx, yetkazib berish va buyurtma bo‘yicha savollaringizga javob beraman yoki sizga mos eshikni tanlashda yordam beraman. Quyidagi savollardan birini tanlang.", suggestions: sug(QUICK_ORDER), welcome: true }),
  price: (ctx, f) => {
    const s = stats(ctx), cheapest = rank(ctx.products).slice().sort((a, b) => a.price - b.price).slice(0, 3);
    return { reply: "Katalogimizda " + s.n + " ta MDF eshik bor. Narxlar " + money(s.min) + " dan " + money(s.max) + " gacha (1 ta eshik uchun). Aniq narx o‘lcham va komplektatsiyaga qarab menejer tomonidan tasdiqlanadi." + sampleNote(f) + "\n\nEng arzon variantlar:",
      products: cheapest.map(card), suggestions: sug(["recommend", "sizes", "delivery_price"]), links: [{ label: "Narx bo‘yicha saralangan katalog", href: "/Products?sort=price-asc" }] };
  },
  models: (ctx, f) => {
    const s = stats(ctx);
    const styles = Object.keys(s.styles).map(k => (STATIC.STYLES[k] || k) + " (" + s.styles[k] + " ta)").join(", ");
    const cats = Object.keys(s.cats);
    const popular = rank(ctx.products).filter(p => (p.badges || []).length).slice(0, 4);
    return { reply: "Katalogda " + s.n + " ta eshik modeli bor. Uslublar: " + styles + "." + (cats.length ? "\nKategoriyalar: " + cats.slice(0, 9).join(", ") + (cats.length > 9 ? " va boshqalar" : "") + "." : "") + "\nO‘zingizga moslab 3D konstruktorda ham eshik yig‘ishingiz mumkin.\n\nMashhur va yangi modellar:",
      products: (popular.length ? popular : rank(ctx.products).slice(0, 4)).map(card), suggestions: sug(["recommend", "colors", "price"]), links: [{ label: "Katalogni ochish", href: "/Products" }, { label: "3D konstruktor", href: "/Configurator" }] };
  },
  recommend: (ctx, f) => Object.assign({ reply: "" }, recommendReply(ctx, {})),
  sizes: (ctx, f) => {
    const s = stats(ctx), L = CFG.LIMITS;
    const list = Object.keys(s.sizes).sort((a, b) => widthOf(a) - widthOf(b)).map(k => k + " mm").join(", ");
    return { reply: "Katalogdagi o‘lchamlar (kenglik × balandlik): " + list + ".\nNostandart o‘lcham kerak bo‘lsa, buyurtma izohida yozing — individual tayyorlash imkoniyatini menejer aniqlashtiradi. 3D konstruktorda kenglik " + L.wMin + "–" + L.wMax + " mm, balandlik " + L.hMin + "–" + L.hMax + " mm oralig‘ida tanlanadi (yakuniy imkoniyat va narx menejer tomonidan tasdiqlanadi).",
      suggestions: sug(["recommend", "price", "how_order"]), links: [{ label: "3D konstruktor", href: "/Configurator" }] };
  },
  colors: (ctx, f) => {
    const s = stats(ctx);
    const list = Object.keys(s.colors).map(k => ((STATIC.COLORS[k] || {}).name || k) + " (" + s.colors[k] + " ta)").join(", ");
    return { reply: "Katalogdagi ranglar: " + list + ".\nKatalogda rang bo‘yicha filtrlash mumkin, 3D konstruktorda esa rangni o‘zingiz tanlaysiz.", suggestions: sug(["recommend", "models", "price"]), links: [{ label: "Katalog", href: "/Products" }, { label: "3D konstruktor", href: "/Configurator" }] };
  },
  how_order: (ctx, f) => ({ reply: "Buyurtma berish juda oson:\n1) Katalogdan eshik tanlang, o‘lcham va sonini belgilang.\n2) «Savatga qo‘shish» ni bosing (yoki «Hoziroq buyurtma»).\n3) Savatdan «Buyurtmani rasmiylashtirish» ga o‘ting; buyurtma berish uchun hisobingizga kirish yoki ro‘yxatdan o‘tish kerak.\n4) Ism, telefon, yetkazib berish hududi va manzilni kiriting (xaritadan ham tanlash mumkin).\n5) «Buyurtmani yuborish» tugmasini bosing.\n\nMen o‘zim buyurtma yaratmayman va to‘lov qilmayman — buyurtmani faqat siz saytdagi sahifada tasdiqlaysiz. " + hoursLine(f),
    suggestions: sug(["delivery_service", "order_status", "recommend"]), links: [{ label: "Katalog", href: "/Products" }, { label: "Savat", href: "/Cart" }, { label: "Buyurtma sahifasi", href: "/Checkout" }] }),
  delivery_service: (ctx, f) => ({ reply: "Ha, yetkazib berish xizmati bor. Hozir buyurtmalar faqat quyidagi viloyatlarga qabul qilinadi: " + f.regions.join(", ") + ".\n" + (f.delivery_terms ? "Shartlar: " + f.delivery_terms : "Yetkazib berish muddati va narxi manzilga qarab menejer bilan kelishiladi.") + "\n\nBoshqa hududlardan buyurtma qabul qilinmaydi.", suggestions: sug(["regions", "delivery_price", "how_order"]) }),
  regions: (ctx, f) => ({ reply: "Yetkazib berish faqat shu viloyatlarga: " + f.regions.join(", ") + ".\nBuyurtma formasida hudud va xaritadagi nuqta tekshiriladi; boshqa viloyatlardan buyurtma tasdiqlanmaydi.", suggestions: sug(["delivery_price", "how_order", "contact"]), links: [{ label: "Buyurtma sahifasi", href: "/Checkout" }] }),
  delivery_price: (ctx, f) => ({ reply: f.delivery_terms ? "Yetkazib berish shartlari: " + f.delivery_terms : "Yetkazib berish narxi saytda belgilanmagan: u manzilga va buyurtma hajmiga qarab menejer bilan kelishiladi. Aniq narxni bilish uchun menejerga murojaat qiling.", suggestions: sug(["regions", "contact", "how_order"]), links: [phoneLink(f)] }),
  install: (ctx, f) => ({ reply: "Buyurtma formasida «O‘rnatish xizmati ham kerak» degan belgi bor — uni belgilasangiz, menejer o‘rnatish shartlari va narxini siz bilan kelishadi. O‘rnatish narxi saytda belgilanmagan, shuning uchun aniq raqamni ayta olmayman.", suggestions: sug(["delivery_price", "how_order", "contact"]), links: [phoneLink(f)] }),
  order_status: () => ({ reply: "Buyurtma holatini ko‘rish uchun hisobingizga kiring: Profil → «Buyurtmalar». U yerda har buyurtma uchun holat chizig‘i bor: Qabul qilindi → Tasdiqlandi → Tayyorlanmoqda → Yetkazilmoqda → Yakunlandi (yoki Bekor qilindi).\nBuyurtma raqami bo‘yicha men sizga holatni ayta olmayman — bu ma’lumot faqat hisobingizda va menejerda.", links: [{ label: "Profil: buyurtmalar", href: "/Profile#orders" }, { label: "Kirish", href: "/Login" }], suggestions: sug(["contact", "how_order"]) }),
  contact: (ctx, f) => ({ reply: "Biz bilan bog‘lanish:\n• Telefon: " + f.phone + "\n• Ish vaqti: har kuni " + f.hours + " (Toshkent vaqti)\n• Manzilimizni xaritada ko‘rishingiz mumkin.\n" + hoursLine(f), links: [phoneLink(f), { label: "Manzilimizni xaritada ko‘rish", href: f.map }, { label: "Aloqa sahifasi", href: "/Contact" }], suggestions: sug(["hours", "how_order", "delivery_service"]), handoff: true }),
  hours: (ctx, f) => ({ reply: "Ish vaqtimiz: har kuni " + f.hours + " (Asia/Tashkent vaqti).\n" + hoursLine(f) + (f.workHoursNote ? "\n(Sayt ma’lumoti: " + f.workHoursNote + ")" : ""), links: [phoneLink(f)], suggestions: sug(["contact", "how_order"]) }),
  other: (ctx, f) => ({ reply: "Boshqa savolingiz bo‘lsa, menejerimiz javob beradi: " + f.phone + " (har kuni " + f.hours + "). " + hoursLine(f) + " Aloqa sahifasidan xabar ham qoldirishingiz mumkin. Yoki quyidagi savollardan birini tanlang.", links: [phoneLink(f), { label: "Aloqa sahifasi", href: "/Contact" }], suggestions: sug(["recommend", "price", "contact"]), handoff: true }),
};

/* ---------- Javob: faqat standart savol tugmalari ---------- */
function respond(input, ctx, now) {
  const f = facts(ctx, now);
  if (input.action === "recommend") return Object.assign(recommendReply(ctx, cleanCriteria(input.criteria)), { mode: "faq" });
  if (input.intent && Object.prototype.hasOwnProperty.call(HANDLERS, input.intent)) return Object.assign(HANDLERS[input.intent](ctx, f), { mode: "faq" });
  // Noma'lum yoki bo'sh so'rov (erkin matn qabul qilinmaydi): standart savollar menyusi
  return Object.assign(HANDLERS.greeting(ctx, f), { mode: "faq" });
}
function cleanCriteria(c) {
  const out = {};
  if (!c || typeof c !== "object") return out;
  const ok = (v, allowed) => v === "any" || allowed.indexOf(v) !== -1;
  if (typeof c.style === "string" && ok(c.style, Object.keys(STATIC.STYLES))) out.style = c.style;
  if (typeof c.color === "string" && ok(c.color, Object.keys(STATIC.COLORS))) out.color = c.color;
  if (c.width === "any") out.width = "any"; else if (Number.isInteger(c.width) && c.width >= 500 && c.width <= 1200) out.width = c.width;
  if (c.budget === "any") out.budget = "any";
  else if (Array.isArray(c.budget) && c.budget.length === 2 && c.budget.every(x => Number.isFinite(x) && x >= 0 && x < 1e10)) out.budget = [Math.round(c.budget[0]), Math.round(c.budget[1])];
  return out;
}

/* ---------- HTTP kirish nuqtasi ---------- */
async function handle(body, opts) {
  opts = opts || {};
  body = body && typeof body === "object" ? body : {};
  const input = {
    intent: typeof body.intent === "string" ? body.intent.slice(0, 30) : "",
    action: body.action === "recommend" ? "recommend" : "",
    criteria: body.criteria
  };
  const ctx = opts.ctx || await loadContext();
  const r = respond(input, ctx, opts.now || new Date());
  r.reply = String(r.reply || "").slice(0, 1500);
  return Object.assign({ ok: true, mode: "faq" }, r);
}

module.exports = { handle, respond, loadContext, facts, stats, QUICK, QUICK_ORDER, cleanCriteria };
