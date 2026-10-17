/**
 * Administrator yaratish / parolni tiklash.
 *
 *   npm run create-admin                  — interaktiv: login, ism va parol so'raladi (parol ekranda ko'rinmaydi)
 *   npm run create-admin -- --reset ali   — mavjud foydalanuvchi parolini yangilash
 *
 * Interaktiv bo'lmagan muhit (CI) uchun: ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD muhit o'zgaruvchilari.
 * Parol hech qachon faylga yoki logga yozilmaydi; bazada faqat scrypt xeshi saqlanadi.
 * Vercel (Turso) bazasi uchun: DATABASE_URL va DATABASE_AUTH_TOKEN ni shu buyruq bilan birga bering.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// .env ni o'qish (agar mavjud bo'lsa)
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const db = require("../lib/db");
const auth = require("../lib/auth");

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); else rl.output.write(/[\r\n]/.test(s) ? s : "*"); };
    }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}

async function main() {
  if (!db.isConfigured()) {
    console.error("DATABASE_URL sozlanmagan. Lokal uchun .env ichida DATABASE_URL=file:./data/yasindoors.db yozing.");
    process.exit(1);
  }
  await db.init();
  const resetIdx = process.argv.indexOf("--reset");
  const resetUser = resetIdx > -1 ? process.argv[resetIdx + 1] : null;
  const interactive = process.stdin.isTTY;

  let username = resetUser || process.env.ADMIN_USERNAME;
  let name = process.env.ADMIN_NAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!username) {
    if (!interactive) { console.error("Interaktiv terminal yo'q: ADMIN_USERNAME, ADMIN_NAME va ADMIN_PASSWORD bering."); process.exit(1); }
    username = (await ask("Login (masalan: admin): ")).trim();
  }
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) { console.error("Login 3-40 ta belgi bo'lsin (harf, raqam, nuqta, chiziq)."); process.exit(1); }

  const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
  if (resetUser && !existing) { console.error(`"${username}" topilmadi.`); process.exit(1); }
  if (!resetUser && existing) { console.error(`"${username}" allaqachon mavjud. Parolni tiklash uchun: npm run create-admin -- --reset ${username}`); process.exit(1); }

  if (!resetUser && !name) name = interactive ? (await ask("To'liq ism: ")).trim() : "Administrator";

  if (!password) {
    if (!interactive) { console.error("ADMIN_PASSWORD kerak."); process.exit(1); }
    password = await ask("Parol (kamida 10 belgi, harf va raqam): ", { hidden: true });
    const again = await ask("Parolni takrorlang: ", { hidden: true });
    if (password !== again) { console.error("Parollar mos kelmadi."); process.exit(1); }
  }
  const err = auth.validatePassword(password);
  if (err) { console.error(err); process.exit(1); }

  const hash = auth.hashPassword(password);
  if (resetUser) {
    await db.run("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?", [hash, existing.id]);
    await db.run("DELETE FROM sessions WHERE user_id = ?", [existing.id]);
    await auth.audit({ user: { id: existing.id, username } }, "user.password_reset_cli", "user", existing.id, null, "cli");
    console.log(`"${username}" paroli yangilandi.`);
  } else {
    if (!name || name.length < 2) { console.error("Ism kamida 2 ta belgi bo'lsin."); process.exit(1); }
    const r = await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)",
      [username, name, "super_admin", hash, new Date().toISOString()]);
    await auth.audit({ user: { id: r.lastId, username } }, "user.create_cli", "user", r.lastId, { role: "super_admin" }, "cli");
    console.log(`Super Admin "${username}" yaratildi. Kirish: /admin/`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error("Xato:", e.message); process.exit(1); });
