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

const A = "/account";
const HOUR = 3600 * 1000, QUARTER = 15 * 60 * 1000;
const now = () => new Date().toISOString();

function fail(status, message, fields, extra) {
  return new HttpError(status, message, Object.assign({ fields: fields || undefined }, extra));
}
function requireDb() {
  if (!db.isConfigured()) throw new HttpError(503, "Сервис аккаунтов временно недоступен.", { code: "db_not_configured" });
}
const sessionBody = (account, csrf) => ({ ok: true, authenticated: true, user: acc.publicAccount(account), csrf });
const isUnique = e => /UNIQUE/i.test(String(e && e.message));

function uniqueFields(e) {
  const m = String(e && e.message);
  if (/accounts\.email/.test(m)) return { email: "Аккаунт с таким email уже существует. Войдите или восстановите пароль." };
  if (/accounts\.phone/.test(m)) return { phone: "Аккаунт с таким номером телефона уже существует." };
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
    if (await acc.attempts("a-reg:" + ctx.ip, HOUR) >= 10) throw new HttpError(429, "Слишком много попыток регистрации. Попробуйте позже.");
    await acc.noteAttempt("a-reg:" + ctx.ip);

    const fields = {};
    const fn = acc.cleanName(b.first_name, "имя"); if (fn.error) fields.first_name = fn.error;
    const ln = acc.cleanName(b.last_name, "фамилию"); if (ln.error) fields.last_name = ln.error;
    const em = acc.cleanEmail(b.email); if (em.error) fields.email = em.error;
    const ph = acc.cleanPhone(b.phone); if (ph.error) fields.phone = ph.error;
    const pe = acc.passwordError(b.password, { email: em.value }); if (pe) fields.password = pe;
    if (!fields.password && b.password !== b.password2) fields.password2 = "Пароли не совпадают.";
    if (b.consent !== true) fields.consent = "Необходимо согласие с политикой конфиденциальности и условиями использования.";
    if (Object.keys(fields).length) throw fail(422, "Проверьте выделенные поля.", fields);

    // Takroriy email / telefon: tushunarli xabar (UNIQUE indeks poyga holatlarida ham himoya qiladi)
    const dupE = await db.get("SELECT 1 AS x FROM accounts WHERE email = ?", [em.value]);
    const dupP = await db.get("SELECT 1 AS x FROM accounts WHERE phone = ?", [ph.value]);
    if (dupE) fields.email = "Аккаунт с таким email уже существует. Войдите или восстановите пароль.";
    if (dupP) fields.phone = "Аккаунт с таким номером телефона уже существует.";
    if (Object.keys(fields).length) throw fail(409, "Такой аккаунт уже зарегистрирован.", fields);

    const t = now();
    let id;
    try {
      id = (await db.run(
        "INSERT INTO accounts (first_name, last_name, email, phone, password_hash, status, consent_at, created_at, updated_at, last_login_at) VALUES (?,?,?,?,?,'active',?,?,?,?)",
        [fn.value, ln.value, em.value, ph.value, auth.hashPassword(b.password), t, t, t, t]
      )).lastId;
    } catch (e) {
      const f = isUnique(e) && uniqueFields(e);
      if (f) throw fail(409, "Такой аккаунт уже зарегистрирован.", f);
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
    if (!identifier) fields.identifier = "Введите email или номер телефона.";
    if (!password) fields.password = "Введите пароль.";
    if (Object.keys(fields).length) throw fail(422, "Заполните все поля.", fields);
    if (identifier.length > 254 || password.length > 128) throw fail(401, "Неверный email/телефон или пароль.");

    const isEmail = identifier.includes("@");
    const key = isEmail ? identifier.toLowerCase() : (store.normalizePhone(identifier) || identifier);
    if (await acc.attempts("a-ip:" + ctx.ip, QUARTER) >= 10 || await acc.attempts("a-id:" + key, QUARTER) >= 5) {
      await acc.logLogin(ctx.req, null, identifier, false, "rate_limited", ctx.ip);
      throw new HttpError(429, "Слишком много неудачных попыток входа. Попробуйте через 15 минут.");
    }
    const row = await db.get(isEmail ? "SELECT * FROM accounts WHERE email = ?" : "SELECT * FROM accounts WHERE phone = ?", [key]);
    // Akkaunt bo'lmasa ham xuddi shuncha vaqt sarflanadi (akkaunt mavjudligini vaqt orqali bilib bo'lmasin)
    const ok = auth.verifyPassword(password, row ? row.password_hash : acc.DUMMY_HASH);
    if (!row || !ok) {
      await acc.noteAttempt("a-ip:" + ctx.ip, "a-id:" + key);
      await acc.logLogin(ctx.req, row && row.id, identifier, false, row ? "bad_password" : "unknown_account", ctx.ip);
      throw fail(401, "Неверный email/телефон или пароль.");
    }
    if (row.status !== "active") {
      await acc.logLogin(ctx.req, row.id, identifier, false, "blocked", ctx.ip);
      throw fail(403, "Ваш аккаунт заблокирован. Свяжитесь с нами для выяснения причины.", null, { code: "blocked" });
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
    const fn = acc.cleanName(b.first_name !== undefined ? b.first_name : cur.first_name, "имя"); if (fn.error) fields.first_name = fn.error;
    const ln = acc.cleanName(b.last_name !== undefined ? b.last_name : cur.last_name, "фамилию"); if (ln.error) fields.last_name = ln.error;
    const em = acc.cleanEmail(b.email !== undefined ? b.email : cur.email); if (em.error) fields.email = em.error;
    const ph = acc.cleanPhone(b.phone !== undefined ? b.phone : cur.phone); if (ph.error) fields.phone = ph.error;
    if (Object.keys(fields).length) throw fail(422, "Проверьте выделенные поля.", fields);

    // Email yoki telefon o'zgarsa — joriy parol talab qilinadi (o'g'irlangan sessiya akkauntni olib qo'ymasin)
    if (em.value !== cur.email || ph.value !== cur.phone) {
      if (await acc.attempts("a-pw:" + cur.id, QUARTER) >= 5) throw new HttpError(429, "Слишком много неверных попыток. Попробуйте позже.");
      if (!auth.verifyPassword(String(b.current_password || ""), cur.password_hash)) {
        await acc.noteAttempt("a-pw:" + cur.id);
        throw fail(403, "Для смены email или телефона введите текущий пароль.", { current_password: "Неверный текущий пароль." });
      }
    }
    try {
      await db.run("UPDATE accounts SET first_name=?, last_name=?, email=?, phone=?, updated_at=? WHERE id=?",
        [fn.value, ln.value, em.value, ph.value, now(), cur.id]);
    } catch (e) {
      const f = isUnique(e) && uniqueFields(e);
      if (f) throw fail(409, "Эти данные уже используются другим аккаунтом.", f);
      throw e;
    }
    const account = await db.get("SELECT * FROM accounts WHERE id = ?", [cur.id]);
    return { body: { ok: true, user: acc.publicAccount(account) } };
  }],

  ["POST", A + "/password", { auth: false, acct: true }, async ctx => {
    const b = ctx.body, cur = await db.get("SELECT * FROM accounts WHERE id = ?", [ctx.acct.account.id]);
    if (await acc.attempts("a-pw:" + cur.id, QUARTER) >= 5) throw new HttpError(429, "Слишком много неверных попыток. Попробуйте позже.");
    if (!auth.verifyPassword(String(b.current_password || ""), cur.password_hash)) {
      await acc.noteAttempt("a-pw:" + cur.id);
      throw fail(403, "Неверный текущий пароль.", { current_password: "Неверный текущий пароль." });
    }
    const pe = acc.passwordError(b.new_password, { email: cur.email });
    if (pe) throw fail(422, pe, { new_password: pe });
    if (b.new_password !== b.new_password2) throw fail(422, "Пароли не совпадают.", { new_password2: "Пароли не совпадают." });
    if (b.new_password === b.current_password) throw fail(422, "Новый пароль должен отличаться от текущего.", { new_password: "Новый пароль должен отличаться от текущего." });
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
      throw new HttpError(503, "Восстановление пароля временно недоступно: отправка писем не настроена. Свяжитесь с нами по телефону.", { code: "mail_not_configured" });
    }
    const em = acc.cleanEmail(ctx.body.email);
    if (em.error) throw fail(422, em.error, { email: em.error });
    if (await acc.attempts("a-fp:" + ctx.ip, HOUR) >= 5 || await acc.attempts("a-fe:" + em.value, HOUR) >= 3) {
      throw new HttpError(429, "Слишком много запросов. Попробуйте через час.");
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
      const m = mail.resetEmail(row.first_name, mail.appUrl() + "/reset-password.html#t=" + token);
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
    if (await acc.attempts("a-rs:" + ctx.ip, QUARTER) >= 10) throw new HttpError(429, "Слишком много попыток. Попробуйте позже.");
    const invalid = fail(400, "Ссылка недействительна или срок её действия истёк. Запросите восстановление пароля заново.", null, { code: "invalid_token" });
    if (token.length < 20 || token.length > 200) { await acc.noteAttempt("a-rs:" + ctx.ip); throw invalid; }
    const pe = acc.passwordError(ctx.body.password);
    if (pe) throw fail(422, pe, { password: pe });
    if (ctx.body.password !== ctx.body.password2) throw fail(422, "Пароли не совпадают.", { password2: "Пароли не совпадают." });

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
    if (!Array.isArray(ids) || ids.length > 200) throw new HttpError(400, "Неверный список избранного.");
    const clean = Array.from(new Set(ids.map(String))).filter(id => /^[A-Za-z0-9_-]{1,64}$/.test(id));
    const id = ctx.acct.account.id, t = now();
    await db.batch([{ sql: "DELETE FROM account_favorites WHERE account_id = ?", args: [id] }]
      .concat(clean.map(pid => ({ sql: "INSERT INTO account_favorites (account_id, product_id, created_at) VALUES (?,?,?)", args: [id, pid, t] }))));
    return { body: { ok: true, ids: clean } };
  }],

  /* ---------- Buyurtmalar tarixi ---------- */
  ["GET", A + "/orders", { auth: false, acct: true }, async ctx => {
    const orders = await db.all(
      "SELECT id, number, status, payment_status, total, items_count, address, created_at FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 100",
      [ctx.acct.account.id]);
    const ids = orders.map(o => Number(o.id));
    const items = ids.length ? await db.all(`SELECT order_id, name, size, qty, price FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids) : [];
    return {
      body: {
        ok: true,
        items: orders.map(o => ({
          number: o.number, status: o.status, payment_status: o.payment_status, total: Number(o.total), items_count: Number(o.items_count),
          address: o.address, created_at: o.created_at,
          lines: items.filter(i => Number(i.order_id) === Number(o.id)).map(i => ({ name: i.name, size: i.size, qty: Number(i.qty), price: Number(i.price) }))
        }))
      }
    };
  }]
];

module.exports = { routes };
