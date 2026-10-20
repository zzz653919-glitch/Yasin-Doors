/**
 * Birinchi administratorni .env orqali avtomatik yaratish (faqat foydalanuvchilar yo'q bo'lganda).
 *   ADMIN_USERNAME, ADMIN_NAME (ixtiyoriy), ADMIN_PASSWORD
 * Parol faqat .env da (gitga tushmaydi); bazada faqat scrypt xeshi saqlanadi va logga yozilmaydi.
 * Administrator yaratilgach .env dagi ADMIN_PASSWORD ni o'chirib qo'yish tavsiya etiladi.
 */
"use strict";

const db = require("./db");
const auth = require("./auth");

async function bootstrapAdmin() {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!username || !password || !db.isConfigured()) return null;
  try {
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) return console.error("ADMIN_USERNAME noto'g'ri (3-40 belgi: harf, raqam, nuqta, chiziq)."), null;
    const pwErr = auth.validatePassword(password);
    if (pwErr) return console.error("ADMIN_PASSWORD: " + pwErr), null;
    await db.init();
    const name = String(process.env.ADMIN_NAME || username).trim().slice(0, 80) || username;
    // Faqat jadval bo'sh bo'lsa (poyga holatida ham ikkinchi admin yaratilmaydi)
    const r = await db.run(
      "INSERT INTO users (username, name, role, password_hash, active, created_at) SELECT ?,?,?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM users)",
      [username, name, "super_admin", auth.hashPassword(password), new Date().toISOString()]
    );
    if (r.changes) {
      await auth.audit({ user: { id: r.lastId, username } }, "setup.first_admin", "user", r.lastId, { via: "env" }, null);
      console.log(`Administrator yaratildi: ${username} (.env dagi ADMIN_PASSWORD ni endi o'chirib qo'yishingiz mumkin)`);
      return username;
    }
  } catch (e) {
    console.error("Administrator yaratilmadi:", e.message);
  }
  return null;
}

module.exports = { bootstrapAdmin };
