/**
 * Telegram bildirishnomalari. Token va chat ID faqat server muhit o'zgaruvchilarida:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   ORDER_DRY_RUN=true  — Telegram'ga yubormasdan konsolga chiqaradi (lokal sinov)
 * Admin paneldagi "yoqilgan/o'chirilgan" tugmasi bazadagi `telegram_enabled` sozlamasi.
 */
"use strict";

function dryRun() { return String(process.env.ORDER_DRY_RUN).toLowerCase() === "true"; }
function configured() { return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID); }

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatPrice(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}
function tashkentTime(iso) {
  try { return new Date(iso || Date.now()).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }); }
  catch (e) { return new Date(iso || Date.now()).toISOString(); }
}

/** Natija: { sent: true } | { sent: false, reason: 'not_configured' | 'failed' | 'dry_run' } */
async function send(text) {
  if (dryRun()) {
    console.log("\n[ORDER_DRY_RUN] Telegram'ga yuborilmadi:\n" + text + "\n");
    return { sent: false, reason: "dry_run" };
  }
  if (!configured()) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      // Token logga yozilmaydi — faqat status
      console.error("Telegram xatosi:", res.status);
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (e) {
    console.error("Telegram tarmoq xatosi:", e.name);
    return { sent: false, reason: "failed" };
  }
}

function orderMessage(order, items) {
  const lines = [
    `🛒 <b>Yangi buyurtma ${escHtml(order.number)}</b>`,
    `🕒 ${escHtml(tashkentTime(order.created_at))}`,
    "",
    `👤 <b>Mijoz:</b> ${escHtml(order.name)}`,
    `📞 <b>Telefon:</b> ${escHtml(order.phone)}`,
    `📍 <b>Manzil:</b> ${escHtml(order.address)}`,
    `🔧 <b>O'rnatish:</b> ${order.install ? "kerak" : "kerak emas"}`,
    order.comment ? `💬 <b>Izoh:</b> ${escHtml(order.comment)}` : null,
    "",
    "<b>Mahsulotlar:</b>",
    ...items.map((it, i) => `${i + 1}. ${escHtml(it.name)} — ${escHtml(it.size)} mm × ${it.qty} = ${formatPrice(it.price * it.qty)}`),
    "",
    `📦 Jami: <b>${order.items_count} dona</b>`,
    `💰 Umumiy summa: <b>${formatPrice(order.total)}</b>`
  ];
  return lines.filter(l => l !== null).join("\n");
}

function status() {
  return { configured: configured(), dryRun: dryRun() };
}

module.exports = { send, orderMessage, status, escHtml, formatPrice, tashkentTime };
