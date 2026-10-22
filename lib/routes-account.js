/**
 * Mijoz akkaunti API'si (/api/account/...): ro'yxatdan o'tish, kirish, chiqish, profil, parol tiklash,
 * sevimlilar va buyurtmalar tarixi. Kirishsiz marshrutlar `auth:false`, himoyalanganlari `acct:true`
 * (router akkaunt sessiyasi va CSRF tokenini tekshiradi).
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");
const auth = require("./auth");
const acc = require("./accounts");
const mail = require("./mail");
const store = require("./store");
const { HttpError } = require("./http");
const regions = require("./regions");

const A = "/account";
const HOUR = 3600 * 1000, QUARTER = 15 * 60 * 1000;
const now = () => new Date().toISOString();

function fail(status, message, fields, extra) {
  return new HttpError(status, message, Object.assign({ fields: fields || undefined }, extra));
}
function requireDb() {
  if (!db.isConfigured()) throw new HttpError(503, "Hisoblar xizmati vaqtincha mavjud emas.", { code: "db_not_configured" });
}
const sessionBody = (account, csrf) => ({ ok: true, authenticated: true, user: acc.publicAccount(account), csrf });
const isUnique = e => /UNIQUE/i.test(String(e && e.message));

function uniqueFields(e) {
  const m = String(e && e.message);
  if (/accounts\.email/.test(m)) return { email: "Bu email bilan hisob allaqachon mavjud. Kiring yoki parolni tiklang." };
  if (/accounts\.phone/.test(m)) return { phone: "Bu telefon raqami bilan hisob allaqachon mavjud." };
  return null;
}

const routes = [
  /* ---------- Holat ---------- */
  ["GET", A + "/me", { auth: false }, async ctx => {
    if (!db.isConfigured()) return { body: { ok: true, authenticated: false, available: false } };
    const s = await acc.getSession(ctx.req);
    return { body: s ? sessionBody(s.account, s.csrf) : { ok: true, authenticated: false, available: true, mail: mail.configured() } };
  }],

  /* ---------- Ro'yxatdan o'tish ---------- */
  ["POST", A + "/register", { auth: false }, async ctx => {
    requireDb();
    const b = ctx.body;
    if (b.website) return { status: 201, body: { ok: true, authenticated: false } }; // honeypot
    if (await acc.attempts("a-reg:" + ctx.ip, HOUR) >= 10) throw new HttpError(429, "Ro‘yxatdan o‘tish urinishlari juda ko‘p. Keyinroq qayta urinib ko‘ring.");
    await acc.noteAttempt("a-reg:" + ctx.ip);

    const fields = {};
    const fn = acc.cleanName(b.first_name, "ism"); if (fn.error) fields.first_name = fn.error;
    const ln = acc.cleanName(b.last_name, "familiya"); if (ln.error) fields.last_name = ln.error;
    const em = acc.cleanEmail(b.email); if (em.error) fields.email = em.error;
    const ph = acc.cleanPhone(b.phone); if (ph.error) fields.phone = ph.error;
    const pe = acc.passwordError(b.password, { email: em.value }); if (pe) fields.password = pe;
    if (!fields.password && b.password !== b.password2) fields.password2 = "Parollar mos kelmadi.";
    if (b.consent !== true) fields.consent = "Maxfiylik siyosati va foydalanish shartlariga rozilik kerak.";
    if (Object.keys(fields).length) throw fail(422, "Belgilangan maydonlarni tekshiring.", fields);

    // Takroriy email / telefon: tushunarli xabar (UNIQUE indeks poyga holatlarida ham himoya qiladi)
    const dupE = await db.get("SELECT 1 AS x FROM accounts WHERE email = ?", [em.value]);
    const dupP = await db.get("SELECT 1 AS x FROM accounts WHERE phone = ?", [ph.value]);
    if (dupE) fields.email = "Bu email bilan hisob allaqachon mavjud. Kiring yoki parolni tiklang.";
    if (dupP) fields.phone = "Bu telefon raqami bilan hisob allaqachon mavjud.";
    if (Object.keys(fields).length) throw fail(409, "Bunday hisob allaqachon ro‘yxatdan o‘tgan.", fields);

    const t = now();
    let id;
    try {
      id = (await db.run(
        "INSERT INTO accounts (first_name, last_name, email, phone, password_hash, status, consent_at, created_at, updated_at, last_login_at) VALUES (?,?,?,?,?,'active',?,?,?,?)",
        [fn.value, ln.value, em.value, ph.value, auth.hashPassword(b.password), t, t, t, t]
      )).lastId;
    } catch (e) {
      const f = isUnique(e) && uniqueFields(e);
      if (f) throw fail(409, "Bunday hisob allaqachon ro‘yxatdan o‘tgan.", f);
      throw e;
    }
    const s = await acc.createSession(ctx.req, id, ctx.ip, false);
    const account = await db.get("SELECT * FROM accounts WHERE id = ?", [id]);
    await acc.logLogin(ctx.req, id, em.value, true, "register", ctx.ip);
    await auth.audit(null, "account.register", "account", id, null, ctx.ip);
    return { status: 201, body: sessionBody(account, s.csrf), headers: { "Set-Cookie": s.cookie } };
  }],

  /* ---------- Kirish ---------- */
  ["POST", A + "/login", { auth: false }, async ctx => {
    requireDb();
    const identifier = String(ctx.body.identifier || "").trim();
    const password = String(ctx.body.password || "");
    const fields = {};
    if (!identifier) fields.identifier = "Email yoki telefon raqamini kiriting.";
    if (!password) fields.password = "Parolni kiriting.";
    if (Object.keys(fields).length) throw fail(422, "Barcha maydonlarni to‘ldiring.", fields);
    if (identifier.length > 254 || password.length > 128) throw fail(401, "Email/telefon yoki parol noto‘g‘ri.");

    const isEmail = identifier.includes("@");
    const key = isEmail ? identifier.toLowerCase() : (store.normalizePhone(identifier) || identifier);
    if (await acc.attempts("a-ip:" + ctx.ip, QUARTER) >= 10 || await acc.attempts("a-id:" + key, QUARTER) >= 5) {
      await acc.logLogin(ctx.req, null, identifier, false, "rate_limited", ctx.ip);
      throw new HttpError(429, "Kirish urinishlari juda ko‘p. 15 daqiqadan keyin qayta urinib ko‘ring.");
    }
    const row = await db.get(isEmail ? "SELECT * FROM accounts WHERE email = ?" : "SELECT * FROM accounts WHERE phone = ?", [key]);
    // Akkaunt bo'lmasa ham xuddi shuncha vaqt sarflanadi (akkaunt mavjudligini vaqt orqali bilib bo'lmasin)
    const ok = auth.verifyPassword(password, row ? row.password_hash : acc.DUMMY_HASH);
    if (!row || !ok) {
      await acc.noteAttempt("a-ip:" + ctx.ip, "a-id:" + key);
      await acc.logLogin(ctx.req, row && row.id, identifier, false, row ? "bad_password" : "unknown_account", ctx.ip);
      throw fail(401, "Email/telefon yoki parol noto‘g‘ri.");
    }
    if (row.status !== "active") {
      await acc.logLogin(ctx.req, row.id, identifier, false, "blocked", ctx.ip);
      throw fail(403, "Hisobingiz bloklangan. Sababini bilish uchun biz bilan bog‘laning.", null, { code: "blocked" });
    }

    await acc.clearAttempts("a-id:" + key);
    const t = now();
    await db.run("UPDATE accounts SET last_login_at = ? WHERE id = ?", [t, row.id]);
    await db.run("UPDATE accounts SET last_seen_at = ? WHERE id = ?", [t, row.id]);
    await acc.logLogin(ctx.req, row.id, identifier, true, "ok", ctx.ip);
    const s = await acc.createSession(ctx.req, row.id, ctx.ip, ctx.body.remember === true);
    return { body: sessionBody(row, s.csrf), headers: { "Set-Cookie": s.cookie } };
  }],

  ["POST", A + "/logout", { auth: false }, async ctx => {
    // Chiqish har doim muvaffaqiyatli: sessiya bo'lmasa ham cookie tozalanadi
    if (db.isConfigured()) await acc.destroySession(ctx.req);
    return { body: { ok: true }, headers: { "Set-Cookie": acc.cookieString(ctx.req, "", 0) } };
  }],

  /* ---------- Profil ---------- */
  ["PUT", A + "/profile", { auth: false, acct: true }, async ctx => {
    const b = ctx.body, cur = await db.get("SELECT * FROM accounts WHERE id = ?", [ctx.acct.account.id]);
    const fields = {};
    const fn = acc.cleanName(b.first_name !== undefined ? b.first_name : cur.first_name, "ism"); if (fn.error) fields.first_name = fn.error;
    const ln = acc.cleanName(b.last_name !== undefined ? b.last_name : cur.last_name, "familiya"); if (ln.error) fields.last_name = ln.error;
    const em = acc.cleanEmail(b.email !== undefined ? b.email : cur.email); if (em.error) fields.email = em.error;
    const ph = acc.cleanPhone(b.phone !== undefined ? b.phone : cur.phone); if (ph.error) fields.phone = ph.error;
    if (Object.keys(fields).length) throw fail(422, "Belgilangan maydonlarni tekshiring.", fields);

    // Email yoki telefon o'zgarsa — joriy parol talab qilinadi (o'g'irlangan sessiya akkauntni olib qo'ymasin)
    if (em.value !== cur.email || ph.value !== cur.phone) {
      if (await acc.attempts("a-pw:" + cur.id, QUARTER) >= 5) throw new HttpError(429, "Noto‘g‘ri urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring.");
      if (!auth.verifyPassword(String(b.current_password || ""), cur.password_hash)) {
        await acc.noteAttempt("a-pw:" + cur.id);
        throw fail(403, "Email yoki telefonni o‘zgartirish uchun joriy parolni kiriting.", { current_password: "Joriy parol noto‘g‘ri." });
      }
    }
    try {
      await db.run("UPDATE accounts SET first_name=?, last_name=?, email=?, phone=?, updated_at=? WHERE id=?",
        [fn.value, ln.value, em.value, ph.value, now(), cur.id]);
    } catch (e) {
      const f = isUnique(e) && uniqueFields(e);
      if (f) throw fail(409, "Bu ma’lumotlar boshqa hisobda ishlatilmoqda.", f);
      throw e;
    }
    const account = await db.get("SELECT * FROM accounts WHERE id = ?", [cur.id]);
    return { body: { ok: true, user: acc.publicAccount(account) } };
  }],

  ["POST", A + "/password", { auth: false, acct: true }, async ctx => {
    const b = ctx.body, cur = await db.get("SELECT * FROM accounts WHERE id = ?", [ctx.acct.account.id]);
    if (await acc.attempts("a-pw:" + cur.id, QUARTER) >= 5) throw new HttpError(429, "Noto‘g‘ri urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring.");
    if (!auth.verifyPassword(String(b.current_password || ""), cur.password_hash)) {
      await acc.noteAttempt("a-pw:" + cur.id);
      throw fail(403, "Joriy parol noto‘g‘ri.", { current_password: "Joriy parol noto‘g‘ri." });
    }
    const pe = acc.passwordError(b.new_password, { email: cur.email });
    if (pe) throw fail(422, pe, { new_password: pe });
    if (b.new_password !== b.new_password2) throw fail(422, "Parollar mos kelmadi.", { new_password2: "Parollar mos kelmadi." });
    if (b.new_password === b.current_password) throw fail(422, "Yangi parol joriy paroldan farq qilishi kerak.", { new_password: "Yangi parol joriy paroldan farq qilishi kerak." });
    await db.run("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?", [auth.hashPassword(b.new_password), now(), cur.id]);
    await acc.destroyAllSessions(cur.id, ctx.acct.sid); // boshqa qurilmalardagi sessiyalar tugatiladi
    await acc.clearAttempts("a-pw:" + cur.id);
    return { body: { ok: true } };
  }],

  /* ---------- Parolni tiklash ---------- */
  ["POST", A + "/forgot", { auth: false }, async ctx => {
    requireDb();
    // Pochta sozlanmagan bo'lsa soxta "yuborildi" ko'rsatilmaydi
    if (!mail.configured() || !mail.appUrl()) {
      throw new HttpError(503, "Parolni tiklash vaqtincha mavjud emas: xat yuborish sozlanmagan. Biz bilan telefon orqali bog‘laning.", { code: "mail_not_configured" });
    }
    const em = acc.cleanEmail(ctx.body.email);
    if (em.error) throw fail(422, em.error, { email: em.error });
    if (await acc.attempts("a-fp:" + ctx.ip, HOUR) >= 5 || await acc.attempts("a-fe:" + em.value, HOUR) >= 3) {
      throw new HttpError(429, "So‘rovlar juda ko‘p. Bir soatdan keyin qayta urinib ko‘ring.");
    }
    await acc.noteAttempt("a-fp:" + ctx.ip, "a-fe:" + em.value);

    const row = await db.get("SELECT id, first_name, status FROM accounts WHERE email = ?", [em.value]);
    if (row && row.status === "active") {
      const token = crypto.randomBytes(32).toString("base64url");
      const t = now();
      await db.batch([
        { sql: "DELETE FROM password_resets WHERE account_id = ?", args: [row.id] }, // faqat eng oxirgi havola amal qiladi
        { sql: "INSERT INTO password_resets (token_hash, account_id, expires_at, created_at) VALUES (?,?,?,?)", args: [acc.sha256(token), row.id, new Date(Date.now() + acc.RESET_TTL_MS).toISOString(), t] }
      ]);
      // Token URL fragment'ida (#t=...) — serverlar loglariga va Referer'ga tushmaydi
      const m = mail.resetEmail(row.first_name, mail.appUrl() + "/Reset-Password#t=" + token);
      const r = await mail.send({ to: em.value, subject: m.subject, text: m.text, html: m.html });
      if (!r.sent && !r.dry) console.error("Tiklash xati yuborilmadi:", r.reason);
      await auth.audit(null, "account.reset_requested", "account", row.id, null, ctx.ip);
    }
    // Akkaunt bor-yo'qligidan qat'i nazar bir xil javob (email enumeration'ga qarshi)
    return { body: { ok: true } };
  }],

  ["POST", A + "/reset/check", { auth: false }, async ctx => {
    requireDb();
    const token = String(ctx.body.token || "");
    if (token.length < 20 || token.length > 200) return { body: { ok: true, valid: false } };
    const r = await db.get("SELECT 1 AS x FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", [acc.sha256(token), now()]);
    return { body: { ok: true, valid: !!r } };
  }],

  ["POST", A + "/reset", { auth: false }, async ctx => {
    requireDb();
    const token = String(ctx.body.token || "");
    if (await acc.attempts("a-rs:" + ctx.ip, QUARTER) >= 10) throw new HttpError(429, "Urinishlar juda ko‘p. Keyinroq qayta urinib ko‘ring.");
    const invalid = fail(400, "Havola yaroqsiz yoki muddati tugagan. Parolni tiklashni qaytadan so‘rang.", null, { code: "invalid_token" });
    if (token.length < 20 || token.length > 200) { await acc.noteAttempt("a-rs:" + ctx.ip); throw invalid; }
    const pe = acc.passwordError(ctx.body.password);
    if (pe) throw fail(422, pe, { password: pe });
    if (ctx.body.password !== ctx.body.password2) throw fail(422, "Parollar mos kelmadi.", { password2: "Parollar mos kelmadi." });

    const hash = acc.sha256(token);
    const accountId = await db.transaction(async tx => {
      // Bir martalik: used_at faqat bitta so'rovda o'rnatiladi
      const used = await tx.run("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", [now(), hash, now()]);
      if (!used.changes) return null;
      const r = await tx.get("SELECT account_id FROM password_resets WHERE token_hash = ?", [hash]);
      await tx.run("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?", [auth.hashPassword(ctx.body.password), now(), r.account_id]);
      await tx.run("DELETE FROM account_sessions WHERE account_id = ?", [r.account_id]); // hamma qurilmalardan chiqarish
      return Number(r.account_id);
    });
    if (!accountId) { await acc.noteAttempt("a-rs:" + ctx.ip); throw invalid; }
    await auth.audit(null, "account.password_reset", "account", accountId, null, ctx.ip);
    return { body: { ok: true } };
  }],

  /* ---------- Sevimlilar ---------- */
  ["GET", A + "/favorites", { auth: false, acct: true }, async ctx => {
    const rows = await db.all("SELECT product_id FROM account_favorites WHERE account_id = ? ORDER BY created_at, rowid", [ctx.acct.account.id]);
    return { body: { ok: true, ids: rows.map(r => r.product_id) } };
  }],
  // To'liq ro'yxat almashtiriladi (mijoz lokal va server ro'yxatini birlashtirib yuboradi)
  ["PUT", A + "/favorites", { auth: false, acct: true }, async ctx => {
    const ids = ctx.body.ids;
    if (!Array.isArray(ids) || ids.length > 200) throw new HttpError(400, "Sevimlilar ro‘yxati noto‘g‘ri.");
    const clean = Array.from(new Set(ids.map(String))).filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id));
    const id = ctx.acct.account.id, t = now();
    await db.batch([{ sql: "DELETE FROM account_favorites WHERE account_id = ?", args: [id] }]
      .concat(clean.map(pid => ({ sql: "INSERT INTO account_favorites (account_id, product_id, created_at) VALUES (?,?,?)", args: [id, pid, t] }))));
    return { body: { ok: true, ids: clean } };
  }],

  /* ---------- Saqlangan manzillar (hudud va nuqta buyurtmadagi kabi serverda tekshiriladi) ---------- */
  ["GET", A + "/addresses", { auth: false, acct: true }, async ctx => {
    const rows = await db.all("SELECT id, label, region, address, lat, lng FROM account_addresses WHERE account_id = ? ORDER BY id DESC LIMIT 10", [ctx.acct.account.id]);
    return { body: { ok: true, items: rows.map(r => ({ id: Number(r.id), label: r.label, region: r.region, address: r.address, lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng) })) } };
  }],
  ["POST", A + "/addresses", { auth: false, acct: true }, async ctx => {
    const b = ctx.body, id = ctx.acct.account.id;
    const label = String(b.label == null ? "" : b.label).trim().replace(/\s+/g, " ").slice(0, 40) || "Manzil";
    const text = String(b.address == null ? "" : b.address).trim().replace(/\s+/g, " ").slice(0, 200);
    if (text.length < 5) throw fail(422, "Manzilni kiriting (kamida 5 ta belgi).", { address: "Manzilni kiriting (kamida 5 ta belgi)." });
    const geo = regions.resolve(b.region, text, m => { throw fail(422, m, { region: m }); }, b.lat, b.lng);
    const n = Number((await db.get("SELECT COUNT(*) AS n FROM account_addresses WHERE account_id = ?", [id])).n);
    if (n >= 5) throw fail(409, "Eng ko‘pi bilan 5 ta manzil saqlash mumkin. Avval keraksiz manzilni o‘chiring.");
    const r = await db.run("INSERT INTO account_addresses (account_id, label, region, address, lat, lng, created_at) VALUES (?,?,?,?,?,?,?)", [id, label, geo.key, text, geo.lat, geo.lng, now()]);
    return { status: 201, body: { ok: true, item: { id: r.lastId, label, region: geo.key, address: text, lat: geo.lat, lng: geo.lng } } };
  }],
  ["DELETE", A + "/addresses/:id", { auth: false, acct: true }, async ctx => {
    const r = await db.run("DELETE FROM account_addresses WHERE id = ? AND account_id = ?", [Number(ctx.params.id) || 0, ctx.acct.account.id]);
    if (!r.changes) throw new HttpError(404, "Manzil topilmadi.");
    return { body: { ok: true } };
  }],

  /* ---------- Buyurtmalar tarixi ---------- */
  ["GET", A + "/orders", { auth: false, acct: true }, async ctx => {
    const orders = await db.all(
      "SELECT id, number, status, payment_status, delivery_status, total, items_count, address, created_at FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 100",
      [ctx.acct.account.id]);
    const ids = orders.map(o => Number(o.id));
    const items = ids.length ? await db.all(`SELECT order_id, name, size, qty, price FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids) : [];
    const hist = ids.length ? await db.all(`SELECT order_id, at, to_value FROM order_history WHERE field = 'status' AND order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids) : [];
    return {
      body: {
        ok: true,
        items: orders.map(o => ({
          number: o.number, status: o.status, payment_status: o.payment_status, total: Number(o.total), items_count: Number(o.items_count),
          address: o.address, created_at: o.created_at,
          delivery_status: o.delivery_status,
          lines: items.filter(i => Number(i.order_id) === Number(o.id)).map(i => ({ name: i.name, size: i.size, qty: Number(i.qty), price: Number(i.price) })),
          history: hist.filter(h => Number(h.order_id) === Number(o.id)).map(h => ({ at: h.at, to: h.to_value }))
        }))
      }
    };
  }]
];

module.exports = { routes };
