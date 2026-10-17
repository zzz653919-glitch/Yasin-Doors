/**
 * Autentifikatsiya va avtorizatsiya.
 *  - Parollar: scrypt (Node crypto), tasodifiy tuz, timing-safe solishtirish
 *  - Sessiya: tasodifiy token HttpOnly + SameSite=Strict cookie'da; bazada faqat SHA-256 xeshi saqlanadi
 *  - CSRF: har bir sessiyaga alohida token, o'zgartiruvchi so'rovlarda X-CSRF-Token sarlavhasi + Origin tekshiruvi
 *  - Login urinishlari bazada cheklanadi (serverless instansiyalar o'rtasida ham ishlaydi)
 *  - Rollar va ruxsatlar serverda tekshiriladi
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");

const COOKIE = "yd_sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;       // 8 soat
const REAUTH_TTL_MS = 5 * 60 * 1000;             // muhim amallar uchun 5 daqiqalik tasdiq
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 10;
const MAX_FAILS_PER_USER = 5;
const MIN_PASSWORD = 10;

/* ---------- Rollar va ruxsatlar ---------- */
const ROLES = {
  super_admin: { label: "Super Admin", perms: ["*"] },
  manager: {
    label: "Manager",
    perms: [
      "dashboard.view",
      "products.read", "products.write", "products.delete",
      "categories.read", "categories.write",
      "orders.read", "orders.update", "orders.export",
      "customers.read", "customers.write",
      "inventory.read", "inventory.adjust",
      "settings.read"
    ]
  },
  operator: {
    label: "Operator",
    perms: [
      "dashboard.view",
      "products.read", "categories.read",
      "orders.read", "orders.update",
      "customers.read",
      "inventory.read"
    ]
  }
};

function can(role, perm) {
  const r = ROLES[role];
  if (!r) return false;
  return r.perms.includes("*") || r.perms.includes(perm);
}
function permsOf(role) {
  const r = ROLES[role];
  if (!r) return [];
  return r.perms;
}

/* ---------- Parol ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}
function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch (e) {
    return false;
  }
}
// Mavjud bo'lmagan foydalanuvchi uchun ham bir xil vaqt sarflash (username enumeration'ga qarshi)
const DUMMY_HASH = hashPassword("dummy-password-for-timing");

function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD) return `Parol kamida ${MIN_PASSWORD} ta belgidan iborat bo'lsin.`;
  if (pw.length > 200) return "Parol juda uzun.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Parolda harf va raqam bo'lishi kerak.";
  return null;
}

/* ---------- Cookie yordamchilari ---------- */
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function isSecure(req) {
  return !!process.env.VERCEL || String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https" || process.env.COOKIE_SECURE === "true";
}
function cookieString(req, value, maxAgeSec) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}` + (isSecure(req) ? "; Secure" : "");
}
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

/* ---------- Sessiya ---------- */
async function createSession(req, userId, ip) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  await db.run(
    "INSERT INTO sessions (id, user_id, csrf, created_at, expires_at, ip, ua) VALUES (?,?,?,?,?,?,?)",
    [sha256(token), userId, csrf, new Date(now).toISOString(), new Date(now + SESSION_TTL_MS).toISOString(), ip || "", String(req.headers["user-agent"] || "").slice(0, 200)]
  );
  // Eski sessiyalarni tozalash
  db.run("DELETE FROM sessions WHERE expires_at < ?", [new Date(now).toISOString()]).catch(() => {});
  return { token, csrf, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token || token.length < 20) return null;
  const row = await db.get(
    `SELECT s.id AS sid, s.csrf, s.expires_at, s.reauth_until, u.id, u.username, u.name, u.role, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [sha256(token)]
  );
  if (!row || !row.active) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM sessions WHERE id = ?", [row.sid]);
    return null;
  }
  return {
    sid: row.sid,
    csrf: row.csrf,
    reauthUntil: row.reauth_until,
    user: { id: Number(row.id), username: row.username, name: row.name, role: row.role }
  };
}

async function destroySession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await db.run("DELETE FROM sessions WHERE id = ?", [sha256(token)]);
}

async function markReauth(sid) {
  await db.run("UPDATE sessions SET reauth_until = ? WHERE id = ?", [new Date(Date.now() + REAUTH_TTL_MS).toISOString(), sid]);
}
function hasRecentReauth(session) {
  return !!session.reauthUntil && new Date(session.reauthUntil).getTime() > Date.now();
}

/* ---------- Login urinishlarini cheklash ---------- */
async function loginBlocked(ip, username) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS).toISOString();
  const [a, b] = await Promise.all([
    db.get("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND at > ?", ["ip:" + ip, since]),
    db.get("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND at > ?", ["u:" + String(username).toLowerCase(), since])
  ]);
  return Number(a.n) >= MAX_FAILS_PER_IP || Number(b.n) >= MAX_FAILS_PER_USER;
}
async function recordFail(ip, username) {
  const at = new Date().toISOString();
  await db.batch([
    { sql: "INSERT INTO login_attempts (k, at) VALUES (?,?)", args: ["ip:" + ip, at] },
    { sql: "INSERT INTO login_attempts (k, at) VALUES (?,?)", args: ["u:" + String(username).toLowerCase(), at] }
  ]);
}
async function clearFails(username) {
  await db.run("DELETE FROM login_attempts WHERE k = ?", ["u:" + String(username).toLowerCase()]);
  db.run("DELETE FROM login_attempts WHERE at < ?", [new Date(Date.now() - 24 * 3600 * 1000).toISOString()]).catch(() => {});
}

/** Login: muvaffaqiyatli bo'lsa foydalanuvchi qaytaradi, aks holda { error } */
async function login(username, password, ip) {
  username = String(username || "").trim();
  password = String(password || "");
  if (!username || !password || username.length > 80 || password.length > 200) return { error: "invalid" };
  if (await loginBlocked(ip, username)) return { error: "blocked" };

  const user = await db.get("SELECT id, username, name, role, password_hash, active FROM users WHERE username = ?", [username]);
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !user.active || !ok) {
    await recordFail(ip, username);
    return { error: "invalid", known: !!user };
  }
  await clearFails(username);
  await db.run("UPDATE users SET last_login_at = ? WHERE id = ?", [new Date().toISOString(), user.id]);
  return { user: { id: Number(user.id), username: user.username, name: user.name, role: user.role } };
}

/* ---------- Audit log ---------- */
async function audit(session, action, entity, entityId, detail, ip) {
  try {
    await db.run(
      "INSERT INTO audit_log (at, user_id, username, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?,?)",
      [
        new Date().toISOString(),
        session && session.user ? session.user.id : null,
        session && session.user ? session.user.username : null,
        action, entity || null, entityId == null ? null : String(entityId),
        detail ? JSON.stringify(detail).slice(0, 1500) : null,
        ip || null
      ]
    );
  } catch (e) {
    console.error("audit xatosi:", e.message);
  }
}

module.exports = {
  COOKIE, ROLES, can, permsOf,
  hashPassword, verifyPassword, validatePassword, MIN_PASSWORD,
  cookieString, parseCookies,
  createSession, getSession, destroySession, markReauth, hasRecentReauth,
  login, audit
};
