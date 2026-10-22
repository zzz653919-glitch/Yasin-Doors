/**
 * Sayt mijozlari akkauntlari: validatsiya, parol siyosati, sessiyalar, urinishlarni cheklash.
 * Xodimlar (admin) tizimidan (lib/auth.js, `users`/`sessions`) ALOHIDA: boshqa jadval va boshqa cookie (yd_acc).
 * Mijoz akkauntida rol maydoni yo'q — frontend orqali admin huquqini olishning iloji yo'q.
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");
const auth = require("./auth");
const store = require("./store");

const COOKIE = "yd_acc";
const TTL_SHORT_MS = 24 * 3600 * 1000;          // "Meni eslab qol" belgilanmagan: brauzer yopilguncha (server tomonida ham 24 soat)
const TTL_REMEMBER_MS = 30 * 24 * 3600 * 1000;  // "Meni eslab qol": 30 kun
const RESET_TTL_MS = 60 * 60 * 1000;            // tiklash havolasi: 1 soat, bir martalik
const MIN_PASSWORD = 8;

const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const DUMMY_HASH = auth.hashPassword("dummy-password-for-timing");

/* ---------- Validatsiya (xabarlar — rus tilida) ---------- */
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’ʻ`. -]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON = new Set(["12345678", "123456789", "1234567890", "qwerty123", "password1", "password123", "qwertyui", "11111111", "iloveyou1", "abc12345", "parol123", "parol12345", "yasindoors1"]);

function cleanName(v, label) {
  const s = store.str(v, 60).replace(/\s+/g, " ");
  if (s.length < 2) return { error: `${label[0].toUpperCase() + label.slice(1)} kiriting (kamida 2 ta harf).` };
  if (s.length > 40 || !NAME_RE.test(s)) return { error: `${label[0].toUpperCase() + label.slice(1)} faqat harf, bo‘sh joy va defisdan iborat bo‘lishi mumkin.` };
  return { value: s };
}
function cleanEmail(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return { error: "Email kiriting." };
  if (s.length > 254 || !EMAIL_RE.test(s)) return { error: "To‘g‘ri email kiriting, masalan: name@example.com." };
  return { value: s };
}
function cleanPhone(v) {
  if (!String(v == null ? "" : v).trim()) return { error: "Telefon raqamini kiriting." };
  const p = store.normalizePhone(v);
  if (!p) return { error: "Raqamni +998 90 123 45 67 formatida kiriting." };
  return { value: p };
}
function passwordError(pw, ctx) {
  if (typeof pw !== "string" || !pw) return "Parolni kiriting.";
  if (pw.length < MIN_PASSWORD) return `Parol kamida ${MIN_PASSWORD} ta belgidan iborat bo‘lishi kerak.`;
  if (pw.length > 128) return "Parol juda uzun (ko‘pi bilan 128 ta belgi).";
  if (!/\p{L}/u.test(pw) || !/[0-9]/.test(pw)) return "Parolda harflar va raqamlar bo‘lishi kerak.";
  if (COMMON.has(pw.toLowerCase())) return "Bu parol juda oddiy. Boshqa parol o‘ylab toping.";
  if (ctx && ctx.email && pw.toLowerCase() === ctx.email) return "Parol email bilan bir xil bo‘lmasligi kerak.";
  return null;
}

const publicAccount = a => ({
  id: Number(a.id), first_name: a.first_name, last_name: a.last_name, email: a.email, phone: a.phone, created_at: a.created_at
});

/* ---------- Urinishlarni cheklash (baza orqali: serverless instansiyalar o'rtasida ham ishlaydi) ---------- */
async function attempts(key, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  return Number((await db.get("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND at > ?", [key, since])).n);
}
async function noteAttempt(...keys) {
  const at = new Date().toISOString();
  await db.batch(keys.map(k => ({ sql: "INSERT INTO login_attempts (k, at) VALUES (?,?)", args: [k, at] })));
}
const clearAttempts = key => db.run("DELETE FROM login_attempts WHERE k = ?", [key]);

/* ---------- Kirish urinishlari tarixi ---------- */
// Maxfiylik: to'liq email/telefon saqlanmaydi (a***@example.com, +998*****4567); parol hech qachon yozilmaydi
function maskIdentifier(v) {
  v = String(v || "").trim();
  if (v.includes("@")) { const [l, d] = v.split("@"); return (l.slice(0, 1) + "***@" + (d || "")).slice(0, 80); }
  const digits = v.replace(/\D/g, "");
  return digits.length >= 6 ? "+" + digits.slice(0, 3) + "*****" + digits.slice(-4) : "***";
}
async function logLogin(req, accountId, identifier, success, reason, ip) {
  try {
    await db.run("INSERT INTO account_login_log (account_id, identifier, success, reason, ip, ua, at) VALUES (?,?,?,?,?,?,?)",
      [accountId || null, maskIdentifier(identifier), success ? 1 : 0, reason, ip || "", String(req.headers["user-agent"] || "").slice(0, 200), new Date().toISOString()]);
    db.run("DELETE FROM account_login_log WHERE at < ?", [new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()]).catch(() => {});
  } catch (e) { console.error("login log xatosi:", e.message); }
}

/* ---------- Sessiyalar ---------- */
function cookieString(req, value, maxAgeSec) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict` +
    (maxAgeSec == null ? "" : `; Max-Age=${maxAgeSec}`) + (auth.isSecure(req) ? "; Secure" : "");
}
async function createSession(req, accountId, ip, remember) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(24).toString("base64url");
  const now = Date.now(), ttl = remember ? TTL_REMEMBER_MS : TTL_SHORT_MS;
  await db.run(
    "INSERT INTO account_sessions (id, account_id, csrf, created_at, expires_at, ip, ua) VALUES (?,?,?,?,?,?,?)",
    [sha256(token), accountId, csrf, new Date(now).toISOString(), new Date(now + ttl).toISOString(), ip || "", String(req.headers["user-agent"] || "").slice(0, 200)]
  );
  db.run("DELETE FROM account_sessions WHERE expires_at < ?", [new Date(now).toISOString()]).catch(() => {});
  return { csrf, cookie: cookieString(req, token, remember ? Math.floor(ttl / 1000) : null) };
}
async function getSession(req) {
  const token = auth.parseCookies(req.headers.cookie)[COOKIE];
  if (!token || token.length < 20) return null;
  const row = await db.get(
    `SELECT s.id AS sid, s.csrf, s.expires_at, a.* FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.id = ?`,
    [sha256(token)]
  );
  if (!row || row.status !== "active") return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM account_sessions WHERE id = ?", [row.sid]);
    return null;
  }
  // Oxirgi faollik: har so'rovda emas, 5 daqiqada bir marta yangilanadi
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    db.run("UPDATE accounts SET last_seen_at = ? WHERE id = ?", [new Date().toISOString(), row.id]).catch(() => {});
  }
  return { sid: row.sid, csrf: row.csrf, account: publicAccount(row) };
}
async function destroySession(req) {
  const token = auth.parseCookies(req.headers.cookie)[COOKIE];
  if (token) await db.run("DELETE FROM account_sessions WHERE id = ?", [sha256(token)]);
}
const destroyAllSessions = (accountId, exceptSid) =>
  db.run("DELETE FROM account_sessions WHERE account_id = ?" + (exceptSid ? " AND id != ?" : ""), exceptSid ? [accountId, exceptSid] : [accountId]);

module.exports = {
  COOKIE, RESET_TTL_MS, MIN_PASSWORD, DUMMY_HASH, sha256,
  cleanName, cleanEmail, cleanPhone, passwordError, publicAccount,
  attempts, noteAttempt, clearAttempts, logLogin,
  cookieString, createSession, getSession, destroySession, destroyAllSessions
};
