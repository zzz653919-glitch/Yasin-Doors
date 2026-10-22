/** Ochiq sayt API'si: katalog, buyurtma, aloqa, rasm */
"use strict";

const db = require("./db");
const store = require("./store");
const legacy = require("./handlers");
const assistant = require("./assistant");
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

// Buyurtma faqat tizimga kirgan mijozdan qabul qilinadi (router akkaunt sessiyasi va CSRF tokenini tekshiradi)
const ORDER_AUTH = { auth: false, acct: true, loginCode: "login_required", loginMessage: "Buyurtma berish uchun hisobingizga kiring yoki ro‘yxatdan o‘ting." };

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

  // POST /api/catalog/view — mahsulot sahifasi ko'rilganini sanash (IP + mahsulot bo'yicha 30 daqiqada bir marta)
  ["POST", "/catalog/view", { auth: false }, async ctx => {
    const id = String((ctx.body && ctx.body.id) || "");
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !db.isConfigured()) return { body: { ok: true } };
    if (rateLimited("view:" + ctx.ip + ":" + id, 1, 30 * 60 * 1000) || rateLimited("viewip:" + ctx.ip, 120, 10 * 60 * 1000)) return { body: { ok: true } };
    try { await store.incrementViews(id); } catch (e) { /* hisoblagich muhim emas */ }
    return { body: { ok: true } };
  }],

  // GET /api/health — joylashtirishni tekshirish: baza ulanishi va sxema (maxfiy ma'lumotsiz)
  ["GET", "/health", { auth: false }, async () => {
    if (!db.isConfigured()) return { status: 503, body: { ok: false, db: false, error: "DATABASE_URL sozlanmagan" } };
    try {
      await db.get("SELECT 1 AS x FROM accounts LIMIT 1");
      await db.get("SELECT 1 AS x FROM orders LIMIT 1");
      return { body: { ok: true, db: true } };
    } catch (e) {
      console.error("health xatosi:", e.message);
      return { status: 503, body: { ok: false, db: false, error: "Baza bilan ulanib bo'lmadi" } };
    }
  }],

  // POST /api/order — faqat autentifikatsiyalangan mijoz; buyurtma akkauntga bog'lanadi
  ["POST", "/order", ORDER_AUTH, async ctx => {
    const body = ctx.body || {};
    if (body.website) return { body: { ok: true, orderId: "YD-000000-000000" } }; // honeypot
    if (rateLimited("order:" + ctx.ip, 5, 10 * 60 * 1000)) throw new HttpError(429, "Juda ko'p so'rov yuborildi. Birozdan so'ng urinib ko'ring.");
    try {
      const r = await store.createOrder(body, { accountId: ctx.acct.account.id, accountEmail: ctx.acct.account.email });
      return { body: { ok: true, orderId: r.orderId, total: r.total } };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("buyurtma xatosi:", e.message);
      throw new HttpError(503, "Buyurtmani saqlashda xatolik. Iltimos, birozdan so'ng urinib ko'ring yoki biz bilan bog'laning.");
    }
  }],

  // POST /api/configurator/order — 3D konstruktordan buyurtma (faqat kirgan mijoz; config serverda tekshiriladi, narx adminning qoidalaridan)
  ["POST", "/configurator/order", ORDER_AUTH, async ctx => {
    const body = ctx.body || {};
    if (body.website) return { body: { ok: true, orderId: "YD-000000-000000" } }; // honeypot
    if (rateLimited("cfgorder:" + ctx.ip, 5, 10 * 60 * 1000)) throw new HttpError(429, "Juda ko'p so'rov yuborildi. Birozdan so'ng urinib ko'ring.");
    try {
      const r = await store.createConfigOrder(body, { accountId: ctx.acct.account.id, accountEmail: ctx.acct.account.email });
      return { body: { ok: true, orderId: r.orderId, code: r.code, priced: r.priced, total: r.total } };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("konstruktor buyurtma xatosi:", e.message);
      throw new HttpError(503, "Buyurtmani saqlashda xatolik. Iltimos, birozdan so'ng urinib ko'ring yoki biz bilan bog'laning.");
    }
  }],

  // POST /api/assistant — YasinDoors AI: tezkor javoblar (haqiqiy katalog/sozlamalar) + ixtiyoriy generativ AI.
  // Chat matni saqlanmaydi va logga yozilmaydi. IP bo'yicha cheklov; AI kaliti faqat serverda.
  ["POST", "/assistant", { auth: false }, async ctx => {
    if (rateLimited("ai:" + ctx.ip, 40, 10 * 60 * 1000)) throw new HttpError(429, "Savollar juda ko‘p. Bir oz kutib, qayta urinib ko‘ring yoki qo‘ng‘iroq qiling: +998 93 300 20 20.");
    const noAI = rateLimited("aigen:" + ctx.ip, 12, 10 * 60 * 1000);   // generativ so'rovlar qimmat: kamroq
    const r = await assistant.handle(ctx.body || {}, { noAI });
    return { body: r, headers: { "Cache-Control": "no-store" } };
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
