/** Ochiq sayt API'si: katalog, buyurtma, aloqa, rasm */
"use strict";

const db = require("./db");
const store = require("./store");
const legacy = require("./handlers");
const { HttpError } = require("./http");

const hits = new Map();
function rateLimited(key, max, windowMs) {
  const t = Date.now();
  const list = (hits.get(key) || []).filter(x => t - x < windowMs);
  list.push(t);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

const routes = [
  // GET /api/catalog — faol mahsulotlar. Bazada mahsulot bo'lmasa yoki baza yo'q bo'lsa: {source:'static'}
  ["GET", "/catalog", { auth: false }, async () => {
    if (!db.isConfigured()) return { body: { ok: true, source: "static", settings: {} }, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } };
    try {
      const data = await store.publicCatalog();
      // Qisqa kesh: admin o'zgartirgan narx/mahsulot mijozlarga ~5-30 soniyada yetib boradi
      return { body: Object.assign({ ok: true }, data), headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } };
    } catch (e) {
      // Baza vaqtincha ishlamasa — 503. Brauzer oxirgi (keshdagi) katalogni saqlaydi; namunaviy narxlar haqiqiy deb ko'rsatilmaydi.
      console.error("catalog xatosi:", e.message);
      return { status: 503, body: { ok: false, error: "Katalog vaqtincha mavjud emas." } };
    }
  }],

  // POST /api/order
  ["POST", "/order", { auth: false }, async ctx => {
    const body = ctx.body || {};
    if (body.website) return { body: { ok: true, orderId: "YD-000000-000000" } }; // honeypot
    if (rateLimited("order:" + ctx.ip, 5, 10 * 60 * 1000)) throw new HttpError(429, "Juda ko'p so'rov yuborildi. Birozdan so'ng urinib ko'ring.");

    if (!db.isConfigured()) {
      // Baza ulanmagan: oddiy rejim (faqat Telegram, statik narxlar)
      const r = await legacy.handleOrder(body, ctx.ip);
      return { status: r.status, body: r.body };
    }
    try {
      const r = await store.createOrder(body);
      return { body: { ok: true, orderId: r.orderId, total: r.total } };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("buyurtma xatosi:", e.message);
      throw new HttpError(503, "Buyurtmani saqlashda xatolik. Iltimos, birozdan so'ng urinib ko'ring yoki biz bilan bog'laning.");
    }
  }],

  // POST /api/contact
  ["POST", "/contact", { auth: false }, async ctx => {
    const r = await legacy.handleContact(ctx.body || {}, ctx.ip);
    return { status: r.status, body: r.body };
  }],

  // GET /api/image/:id
  ["GET", "/image/:id", { auth: false }, async ctx => {
    if (!db.isConfigured()) throw new HttpError(404, "Topilmadi.");
    const img = await store.getImage(ctx.params.id);
    if (!img) throw new HttpError(404, "Topilmadi.");
    return {
      raw: img.buffer,
      headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'" }
    };
  }]
];

module.exports = { routes };
