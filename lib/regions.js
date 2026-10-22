/**
 * Yetkazib berish hududlari. Faqat 4 ta viloyatga yetkazib beriladi.
 * Geokodlash xizmati yo'q: server mijoz tanlagan hudud kalitini tekshiradi va manzil matnida
 * boshqa viloyat nomi borligini aniqlaydi (to'liq ishonchli geografik tekshiruv emas).
 */
"use strict";

const GEO = require("../public/assets/js/geo-regions.js");

const ALLOWED = {
  samarqand: "Samarqand viloyati",
  sirdaryo: "Sirdaryo viloyati",
  toshkent: "Toshkent viloyati",
  navoiy: "Navoiy viloyati"
};

// Ruxsat etilmagan viloyatlar (manzil matnida uchrasa — rad etiladi). Apostrof variantlariga toqatli.
const BLOCKED = ["andijon", "buxoro", "farg.?ona", "jizzax", "xorazm", "namangan", "qashqadaryo", "surxondaryo", "qoraqalpog.?iston", "nukus", "urganch", "qarshi", "termiz"];
const BLOCKED_RE = new RegExp("(?:^|[^a-z\\u0400-\\u04ff])(" + BLOCKED.join("|") + ")", "i");

function norm(s) { return String(s || "").toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/'/g, ""); }

/**
 * Tekshiradi va { key, label, address, lat, lng } qaytaradi (address — hudud nomi qo'shilgan to'liq manzil).
 * Xaritadan tanlangan koordinatalar (lat/lng) bo'lsa: ular haqiqiy viloyat chegarasi (public/assets/js/geo-regions.js)
 * ichida bo'lishi shart va hudud shu nuqtadan aniqlanadi. Koordinatasiz buyurtmada hudud kaliti va manzil matni tekshiriladi.
 */
function resolve(region, address, fail, lat, lng) {
  let key = String(region == null ? "" : region).trim().toLowerCase();
  let la = null, ln = null;
  const hasPoint = lat !== undefined && lat !== null && lat !== "" || lng !== undefined && lng !== null && lng !== "";
  if (hasPoint) {
    la = typeof lat === "number" ? lat : (typeof lat === "string" && lat.trim() !== "" ? Number(lat) : NaN);
    ln = typeof lng === "number" ? lng : (typeof lng === "string" && lng.trim() !== "" ? Number(lng) : NaN);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) fail("Xaritadagi nuqta koordinatalari noto'g'ri.");
    const geoKey = GEO.regionAt(la, ln);
    if (!geoKey) fail("Tanlangan nuqta yetkazib berish zonasidan tashqarida. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.");
    if (key && key !== geoKey) fail("Tanlangan hudud xaritadagi nuqtaga mos kelmaydi.");
    key = geoKey;
    la = Math.round(la * 1e6) / 1e6; ln = Math.round(ln * 1e6) / 1e6;
  }
  if (!ALLOWED[key]) fail("Yetkazib berish hududini tanlang. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.");
  if (BLOCKED_RE.test(norm(address))) fail("Manzilda ko'rsatilgan hudud yetkazib berish zonasidan tashqarida. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.");
  return { key, label: ALLOWED[key], address: ALLOWED[key] + ", " + address, lat: la, lng: ln };
}

module.exports = { ALLOWED, resolve };
