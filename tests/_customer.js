/** Testlar uchun: buyurtma endpointlari endi kirgan mijozni talab qiladi — umumiy sinov mijozi (lazy yaratiladi) */
"use strict";
let cached = null;
module.exports = async function customerAuth() {
  if (cached) return cached;
  const db = require("../lib/db"), auth = require("../lib/auth"), accounts = require("../lib/accounts");
  await db.init();
  const t = new Date().toISOString();
  const r = await db.run(
    "INSERT INTO accounts (first_name, last_name, email, phone, password_hash, status, consent_at, created_at, updated_at) VALUES (?,?,?,?,?,'active',?,?,?)",
    ["Test", "Mijoz", "shared-test@example.com", "+998900000000", auth.hashPassword("Sinov-8421-Kalit"), t, t, t]);
  const s = await accounts.createSession({ headers: {} }, r.lastId, "127.0.0.1", true);
  cached = { cookie: s.cookie.split(";")[0], csrf: s.csrf, id: r.lastId };
  return cached;
};
