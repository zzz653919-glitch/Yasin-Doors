/**
 * Joylashtirish sozlamalarini tekshirish: `npm run check-env`
 * Vercel/Turso uchun: DATABASE_URL va DATABASE_AUTH_TOKEN ni shu buyruq bilan birga bering
 * (PowerShell: $env:DATABASE_URL="libsql://..."; $env:DATABASE_AUTH_TOKEN="..."; npm run check-env).
 * Maxfiy qiymatlar HECH QACHON chiqarilmaydi — faqat "sozlangan / yo'q" va jadvallardagi sonlar.
 */
"use strict";
const fs = require("fs"), path = require("path");
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const set = k => !!process.env[k];
let problems = 0;
const line = (ok, label, hint) => { console.log((ok ? "  ✓ " : "  ✗ ") + label + (!ok && hint ? "  → " + hint : "")); if (!ok) problems++; };

(async () => {
  const url = process.env.DATABASE_URL || "";
  const remote = /^(libsql|https?|wss?):/.test(url);
  console.log("Ma'lumotlar bazasi");
  line(set("DATABASE_URL"), "DATABASE_URL sozlangan" + (url ? (remote ? " (masofaviy Turso/libSQL)" : " (lokal fayl)") : ""), "Vercel'da majburiy: libsql://<baza>.turso.io");
  if (remote) line(set("DATABASE_AUTH_TOKEN"), "DATABASE_AUTH_TOKEN sozlangan", "turso db tokens create <baza>");
  if (process.env.VERCEL && !remote) line(false, "Vercel'da lokal fayl bazasi doimiy emas", "Turso ishlating");

  const db = require("../lib/db");
  try {
    await db.init();
    const n = async t => Number((await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n);
    line(true, "Baza ulandi, sxema/migratsiyalar qo'llandi");
    console.log(`    foydalanuvchilar (akkaunt): ${await n("accounts")}, buyurtmalar: ${await n("orders")}, mahsulotlar: ${await n("products")}, adminlar: ${await n("users")}`);
    if ((await n("users")) === 0) line(false, "Administrator yaratilmagan", "npm run create-admin (yoki ADMIN_USERNAME/ADMIN_PASSWORD .env da, yoki SETUP_TOKEN)");
    else line(true, "Administrator mavjud");
  } catch (e) {
    line(false, "Bazaga ulanib bo'lmadi: " + String(e.message).replace(/(token|password)=\S+/gi, "$1=***").slice(0, 120), "DATABASE_URL / DATABASE_AUTH_TOKEN ni tekshiring");
  }
  console.log("Parolni tiklash emaili");
  line(set("RESEND_API_KEY") && set("MAIL_FROM"), "RESEND_API_KEY va MAIL_FROM", "sozlanmasa «Parolni unutdingizmi?» ishlamaydi");
  line(set("APP_URL") || set("VERCEL_PROJECT_PRODUCTION_URL") || !process.env.VERCEL, "APP_URL (tiklash havolasi uchun)", "masalan https://yasindoors.uz");
  console.log("Telegram (ixtiyoriy)");
  line(set("TELEGRAM_BOT_TOKEN") && set("TELEGRAM_CHAT_ID"), "TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID", "sozlanmasa buyurtma xabarlari yuborilmaydi (buyurtmalar baribir bazaga yoziladi)");
  console.log("Xavfsizlik");
  line(String(process.env.MAIL_DRY_RUN).toLowerCase() !== "true" || !process.env.VERCEL, "MAIL_DRY_RUN productionda o'chiq");
  line(String(process.env.ORDER_DRY_RUN).toLowerCase() !== "true" || !process.env.VERCEL, "ORDER_DRY_RUN productionda o'chiq");
  console.log(problems ? `\n${problems} ta muammo topildi.` : "\nHammasi joyida.");
  process.exit(problems ? 1 : 0);
})();
