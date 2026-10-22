/**
 * Yetkazib berish hududlari. Faqat 4 ta viloyatga yetkazib beriladi.
 * Geokodlash xizmati yo'q: server mijoz tanlagan hudud kalitini tekshiradi va manzil matnida
 * boshqa viloyat nomi borligini aniqlaydi (to'liq ishonchli geografik tekshiruv emas).
 */
"use strict";

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

/** Tekshiradi va { key, label, address } qaytaradi (address — hudud nomi qo'shilgan to'liq manzil). */
function resolve(region, address, fail) {
  const key = String(region == null ? "" : region).trim().toLowerCase();
  if (!ALLOWED[key]) fail("Yetkazib berish hududini tanlang. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.");
  if (BLOCKED_RE.test(norm(address))) fail("Manzilda ko'rsatilgan hudud yetkazib berish zonasidan tashqarida. Biz faqat Samarqand, Sirdaryo, Toshkent va Navoiy viloyatlariga yetkazib beramiz.");
  return { key, label: ALLOWED[key], address: ALLOWED[key] + ", " + address };
}

module.exports = { ALLOWED, resolve };
