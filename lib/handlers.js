/**
 * Buyurtma va aloqa so‘rovlarini qayta ishlash.
 * Bu modul ham Vercel serverless funksiyalari (api/*.js), ham server.js tomonidan ishlatiladi.
 *
 * Muhit o‘zgaruvchilari (environment variables):
 *   TELEGRAM_BOT_TOKEN  — @BotFather bergan token (frontendga HECH QACHON chiqmaydi)
 *   TELEGRAM_CHAT_ID    — buyurtmalar boradigan chat / guruh ID
 *   ORDER_DRY_RUN=true  — Telegram’ga yubormasdan, faqat konsolga chiqarish (lokal sinov uchun)
 */
"use strict";

const { PRODUCTS } = require("../assets/js/products.js");

const LIMITS = { name: 80, phone: 20, address: 200, comment: 1000, topic: 120, message: 1500 };
const MAX_ITEMS = 30;

/* ---------- Yordamchilar ---------- */
function str(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatPrice(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m";
}
function validPhone(p) {
  let d = String(p).replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return /^998\d{9}$/.test(d);
}
function orderId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "YD-" + String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + rand;
}
function tashkentTime() {
  try {
    return new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" });
  } catch (e) {
    return new Date().toISOString();
  }
}
function fail(status, error) {
  return { status, body: { ok: false, error } };
}

/* ---------- Oddiy rate limit (IP bo‘yicha, xotirada) ---------- */
const hits = new Map();
function rateLimited(ip, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

/* ---------- Telegram ---------- */
async function sendTelegram(text) {
  if (String(process.env.ORDER_DRY_RUN).toLowerCase() === "true") {
    console.log("\n[ORDER_DRY_RUN] Telegram’ga yuborilmadi. Xabar matni:\n" + text + "\n");
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    const err = new Error("not_configured");
    err.code = "not_configured";
    throw err;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    // Tokenni logga yozmaymiz — faqat status va Telegram javobi
    console.error("Telegram xatosi:", res.status, details.slice(0, 300));
    throw new Error("telegram_failed");
  }
}

function telegramFailure(e) {
  if (e && e.code === "not_configured") {
    console.error("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan (README.md ga qarang).");
    return fail(503, "Buyurtma qabul qilish xizmati hozircha sozlanmagan. Iltimos, biz bilan telefon orqali bog‘laning.");
  }
  return fail(502, "Buyurtmani yuborishda xatolik yuz berdi. Iltimos, birozdan so‘ng qayta urinib ko‘ring.");
}

/* ---------- Buyurtma ---------- */
async function handleOrder(body, ip) {
  if (!body || typeof body !== "object") return fail(400, "Noto‘g‘ri so‘rov.");
  if (body.website) return { status: 200, body: { ok: true, orderId: orderId() } }; // honeypot: botlarga jim javob
  if (rateLimited("order:" + ip)) return fail(429, "Juda ko‘p so‘rov yuborildi. Birozdan so‘ng urinib ko‘ring.");

  const c = body.customer || {};
  const customer = {
    name: str(c.name, LIMITS.name),
    phone: str(c.phone, LIMITS.phone),
    address: str(c.address, LIMITS.address),
    comment: str(c.comment, LIMITS.comment),
    install: c.install === true
  };

  const errors = [];
  if (customer.name.replace(/\s/g, "").length < 2) errors.push("ism");
  if (!validPhone(customer.phone)) errors.push("telefon raqami");
  if (customer.address.length < 5) errors.push("manzil");
  if (errors.length) return fail(422, "Quyidagi maydonlarni tekshiring: " + errors.join(", ") + ".");

  if (!Array.isArray(body.items) || !body.items.length) return fail(422, "Savat bo‘sh.");
  if (body.items.length > MAX_ITEMS) return fail(422, "Savatda mahsulotlar juda ko‘p.");

  // Narxlarni klientga ishonmasdan, serverdagi ro‘yxat asosida hisoblaymiz
  const items = [];
  for (const raw of body.items) {
    const p = PRODUCTS.find(x => x.id === String(raw && raw.id));
    const size = String(raw && raw.size);
    const qty = parseInt(raw && raw.qty, 10);
    if (!p || p.sizes.indexOf(size) === -1 || !(qty >= 1 && qty <= 99)) {
      return fail(422, "Savatdagi mahsulotlardan biri topilmadi. Savatni yangilab, qayta urinib ko‘ring.");
    }
    items.push({ name: p.name, size, qty, price: p.price, total: p.price * qty });
  }
  const total = items.reduce((s, it) => s + it.total, 0);
  const count = items.reduce((s, it) => s + it.qty, 0);
  const id = orderId();

  const lines = [
    `🛒 <b>Yangi buyurtma ${escHtml(id)}</b>`,
    `🕒 ${escHtml(tashkentTime())}`,
    "",
    `👤 <b>Mijoz:</b> ${escHtml(customer.name)}`,
    `📞 <b>Telefon:</b> ${escHtml(customer.phone)}`,
    `📍 <b>Manzil:</b> ${escHtml(customer.address)}`,
    `🔧 <b>O‘rnatish:</b> ${customer.install ? "kerak" : "kerak emas"}`,
    customer.comment ? `💬 <b>Izoh:</b> ${escHtml(customer.comment)}` : null,
    "",
    "<b>Mahsulotlar:</b>",
    ...items.map((it, i) => `${i + 1}. ${escHtml(it.name)} — ${escHtml(it.size)} mm × ${it.qty} = ${formatPrice(it.total)}`),
    "",
    `📦 Jami: <b>${count} dona</b>`,
    `💰 Umumiy summa: <b>${formatPrice(total)}</b>`
  ].filter(l => l !== null);

  try {
    await sendTelegram(lines.join("\n"));
  } catch (e) {
    return telegramFailure(e);
  }
  return { status: 200, body: { ok: true, orderId: id, total } };
}

/* ---------- Aloqa formasi ---------- */
async function handleContact(body, ip) {
  if (!body || typeof body !== "object") return fail(400, "Noto‘g‘ri so‘rov.");
  if (body.website) return { status: 200, body: { ok: true } };
  if (rateLimited("contact:" + ip)) return fail(429, "Juda ko‘p so‘rov yuborildi. Birozdan so‘ng urinib ko‘ring.");

  const name = str(body.name, LIMITS.name);
  const phone = str(body.phone, LIMITS.phone);
  const topic = str(body.topic, LIMITS.topic);
  const message = str(body.message, LIMITS.message);

  if (name.replace(/\s/g, "").length < 2 || !validPhone(phone) || message.length < 5) {
    return fail(422, "Iltimos, ism, telefon va xabar maydonlarini to‘g‘ri to‘ldiring.");
  }

  const text = [
    "✉️ <b>Saytdan yangi xabar</b>",
    `🕒 ${escHtml(tashkentTime())}`,
    "",
    `👤 <b>Ism:</b> ${escHtml(name)}`,
    `📞 <b>Telefon:</b> ${escHtml(phone)}`,
    topic ? `📌 <b>Mavzu:</b> ${escHtml(topic)}` : null,
    "",
    escHtml(message)
  ].filter(l => l !== null).join("\n");

  try {
    await sendTelegram(text);
  } catch (e) {
    return telegramFailure(e);
  }
  return { status: 200, body: { ok: true } };
}

module.exports = { handleOrder, handleContact };
