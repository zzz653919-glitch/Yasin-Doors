/**
 * Mijoz akkauntlari (Вход / Регистрация) testlari: ro'yxatdan o'tish, kirish, rate limit, profil, parol tiklash,
 * sevimlilar, buyurtmalar tarixi, admin ruxsatlari. Ishga tushirish: npm test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-acc-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL;
delete process.env.SETUP_TOKEN;
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;
delete process.env.MAIL_DRY_RUN;
process.env.APP_URL = "https://shop.example";

const db = require("../lib/db");
const auth = require("../lib/auth");
const { handle } = require("../lib/router");

function call(method, url, { body, cookie, csrf, ip = "10.1.0.1", headers = {} } = {}) {
  return new Promise(resolve => {
    const req = {
      method, url, body, socket: { remoteAddress: ip },
      headers: Object.assign({ host: "localhost:3000" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {}, headers)
    };
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) {
        let json = null;
        if ((this.headers["content-type"] || "").includes("json") && data) { try { json = JSON.parse(data); } catch (e) { /* json emas */ } }
        resolve({ status: this.statusCode, json, headers: this.headers });
      }
    };
    handle(req, res);
  });
}

const reg = (over = {}, opts = {}) => call("POST", "/api/account/register", Object.assign({
  body: Object.assign({ first_name: "Алишер", last_name: "Каримов", email: "alisher@example.com", phone: "+998 90 123 45 67", password: "Sinov-8421-Kalit", password2: "Sinov-8421-Kalit", consent: true }, over)
}, opts));
const cookieOf = r => String(r.headers["set-cookie"]).split(";")[0];
const authed = s => ({ cookie: s.cookie, csrf: s.csrf });

let user; // { cookie, csrf }

test.before(async () => { await db.init(); });
test.after(() => {
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});

test("registratsiya: muvaffaqiyatli, HttpOnly + SameSite cookie, parol xeshlangan, rol yo'q", async () => {
  const r = await reg({ role: "super_admin", status: "active", is_admin: true }, { ip: "10.1.1.1" });
  assert.equal(r.status, 201);
  assert.equal(r.json.authenticated, true);
  assert.equal(r.json.user.email, "alisher@example.com");
  assert.equal(r.json.user.phone, "+998901234567");
  assert.equal(r.json.user.password_hash, undefined);
  assert.equal(r.json.user.role, undefined);
  const sc = String(r.headers["set-cookie"]);
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  user = { cookie: cookieOf(r), csrf: r.json.csrf };
  const row = await db.get("SELECT password_hash FROM accounts WHERE email = ?", ["alisher@example.com"]);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes("Sinov-8421-Kalit"));
  // Mijoz akkaunti xodimlar jadvaliga tushmaydi
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM users")).n), 0);
});

test("registratsiya: validatsiya xatolari rus tilida, maydonlar bo'yicha", async () => {
  const r = await reg({ first_name: "", email: "noto'g'ri", phone: "123", password: "qisqa", password2: "boshqa", consent: false }, { ip: "10.1.1.2" });
  assert.equal(r.status, 422);
  const f = r.json.fields;
  assert.match(f.first_name, /имя/); assert.match(f.email, /email/); assert.match(f.phone, /\+998/);
  assert.match(f.password, /8 символов/); assert.match(f.consent, /согласие/);
  const weak = await reg({ email: "weak@example.com", phone: "+998901110000", password: "abcdefgh", password2: "abcdefgh" }, { ip: "10.1.1.2" });
  assert.match(weak.json.fields.password, /буквы и цифры/);
  const mism = await reg({ email: "mm@example.com", phone: "+998901110001", password2: "Sinov-8421-Boshqa" }, { ip: "10.1.1.2" });
  assert.match(mism.json.fields.password2, /не совпадают/);
});

test("registratsiya: takroriy email / telefon 409", async () => {
  const a = await reg({ phone: "+998 91 000 00 01" }, { ip: "10.1.1.3" });
  assert.equal(a.status, 409); assert.match(a.json.fields.email, /уже существует/);
  const b = await reg({ email: "other@example.com" }, { ip: "10.1.1.3" });
  assert.equal(b.status, 409); assert.match(b.json.fields.phone, /уже существует/);
  const c = await reg({ email: "ALISHER@Example.com", phone: "+998 91 000 00 02" }, { ip: "10.1.1.3" });
  assert.equal(c.status, 409); // email registrga bog'liq emas
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM accounts")).n), 1);
});

test("me / himoyalangan marshrutlar: sessiyasiz 401, CSRF talab qilinadi", async () => {
  const me0 = await call("GET", "/api/account/me");
  assert.equal(me0.json.authenticated, false);
  assert.equal((await call("GET", "/api/account/orders")).status, 401);
  assert.equal((await call("GET", "/api/account/favorites")).status, 401);
  assert.equal((await call("PUT", "/api/account/profile", { body: { first_name: "X" } })).status, 401);
  const me = await call("GET", "/api/account/me", { cookie: user.cookie });
  assert.equal(me.json.authenticated, true); assert.equal(me.json.csrf, user.csrf);
  // CSRF tokenisiz yoki begona Origin bilan o'zgartirish rad etiladi
  const noCsrf = await call("PUT", "/api/account/profile", { cookie: user.cookie, body: { first_name: "Ali" } });
  assert.equal(noCsrf.status, 403); assert.equal(noCsrf.json.code, "csrf");
  const foreign = await call("PUT", "/api/account/profile", { cookie: user.cookie, csrf: user.csrf, headers: { origin: "https://evil.example" }, body: { first_name: "Ali" } });
  assert.equal(foreign.status, 403);
  const loginForeign = await call("POST", "/api/account/login", { headers: { origin: "https://evil.example" }, body: { identifier: "alisher@example.com", password: "Sinov-8421-Kalit" } });
  assert.equal(loginForeign.status, 403);
});

test("kirish: email yoki telefon bilan, noto'g'ri parol rad, remember me", async () => {
  const bad = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Xato12345" }, ip: "10.1.2.1" });
  assert.equal(bad.status, 401); assert.match(bad.json.error, /Неверный/);
  assert.equal(bad.headers["set-cookie"], undefined);
  const nobody = await call("POST", "/api/account/login", { body: { identifier: "yoq@example.com", password: "Xato12345" }, ip: "10.1.2.1" });
  assert.equal(nobody.status, 401); assert.equal(nobody.json.error, bad.json.error); // mavjudligi sezilmaydi
  const empty = await call("POST", "/api/account/login", { body: { identifier: "", password: "" }, ip: "10.1.2.1" });
  assert.equal(empty.status, 422); assert.ok(empty.json.fields.identifier && empty.json.fields.password);

  const byEmail = await call("POST", "/api/account/login", { body: { identifier: "Alisher@Example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.2.2" });
  assert.equal(byEmail.status, 200);
  assert.doesNotMatch(String(byEmail.headers["set-cookie"]), /Max-Age/); // "запомнить" yo'q — sessiya cookie'si
  const byPhone = await call("POST", "/api/account/login", { body: { identifier: "90 123 45 67", password: "Sinov-8421-Kalit", remember: true }, ip: "10.1.2.2" });
  assert.equal(byPhone.status, 200);
  assert.match(String(byPhone.headers["set-cookie"]), /Max-Age=2592000/);
});

test("kirish: rate limit (5 xato → 429, to'g'ri parol ham bloklanadi)", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Xato1234" + i }, ip: "10.1.3." + i });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.3.99" });
  assert.equal(blocked.status, 429);
  await db.run("DELETE FROM login_attempts");
});

test("profil: tahrirlash; email o'zgarishi joriy parolni talab qiladi; dublikat 409", async () => {
  const ok = await call("PUT", "/api/account/profile", Object.assign({ body: { first_name: "Алишер", last_name: "Саидов" } }, authed(user)));
  assert.equal(ok.status, 200); assert.equal(ok.json.user.last_name, "Саидов");
  const noPw = await call("PUT", "/api/account/profile", Object.assign({ body: { email: "new@example.com" } }, authed(user)));
  assert.equal(noPw.status, 403); assert.ok(noPw.json.fields.current_password);
  const good = await call("PUT", "/api/account/profile", Object.assign({ body: { email: "new@example.com", current_password: "Sinov-8421-Kalit" } }, authed(user)));
  assert.equal(good.status, 200); assert.equal(good.json.user.email, "new@example.com");
  // ikkinchi akkaunt
  const r2 = await reg({ email: "second@example.com", phone: "+998 93 555 11 22" }, { ip: "10.1.4.1" });
  assert.equal(r2.status, 201);
  const dup = await call("PUT", "/api/account/profile", Object.assign({ body: { email: "second@example.com", current_password: "Sinov-8421-Kalit" } }, authed(user)));
  assert.equal(dup.status, 409);
  await call("PUT", "/api/account/profile", Object.assign({ body: { email: "alisher@example.com", current_password: "Sinov-8421-Kalit" } }, authed(user)));
});

test("parol o'zgartirish: eski parol shart, boshqa sessiyalar tugatiladi", async () => {
  const other = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.5.1" });
  const otherCookie = cookieOf(other);
  const wrong = await call("POST", "/api/account/password", Object.assign({ body: { current_password: "Xato12345", new_password: "Yangi12345", new_password2: "Yangi12345" } }, authed(user)));
  assert.equal(wrong.status, 403);
  const weak = await call("POST", "/api/account/password", Object.assign({ body: { current_password: "Sinov-8421-Kalit", new_password: "yangi", new_password2: "yangi" } }, authed(user)));
  assert.equal(weak.status, 422);
  const ok = await call("POST", "/api/account/password", Object.assign({ body: { current_password: "Sinov-8421-Kalit", new_password: "Yangi12345", new_password2: "Yangi12345" } }, authed(user)));
  assert.equal(ok.status, 200);
  assert.equal((await call("GET", "/api/account/me", { cookie: user.cookie })).json.authenticated, true);
  assert.equal((await call("GET", "/api/account/me", { cookie: otherCookie })).json.authenticated, false);
  assert.equal((await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.5.2" })).status, 401);
  assert.equal((await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Yangi12345" }, ip: "10.1.5.2" })).status, 200);
});

test("parol tiklash: pochta sozlanmagan bo'lsa 503 (soxta natija yo'q)", async () => {
  const r = await call("POST", "/api/account/forgot", { body: { email: "alisher@example.com" }, ip: "10.1.6.1" });
  assert.equal(r.status, 503); assert.equal(r.json.code, "mail_not_configured");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM password_resets")).n), 0);
});

test("parol tiklash: bir martalik, vaqt bilan cheklangan havola, hamma sessiyalar tugaydi", async () => {
  process.env.MAIL_DRY_RUN = "true";
  const logs = [];
  const orig = console.log; console.log = (...a) => logs.push(a.join(" "));
  let r1, r2;
  try {
    r1 = await call("POST", "/api/account/forgot", { body: { email: "alisher@example.com" }, ip: "10.1.6.2" });
    r2 = await call("POST", "/api/account/forgot", { body: { email: "yoq@example.com" }, ip: "10.1.6.2" });
  } finally { console.log = orig; delete process.env.MAIL_DRY_RUN; }
  assert.equal(r1.status, 200); assert.equal(r2.status, 200); assert.deepEqual(r1.json, r2.json); // enumeration yo'q
  assert.equal(logs.filter(l => l.includes("MAIL_DRY_RUN")).length, 1); // faqat mavjud akkauntga
  const m = logs.join("\n").match(/https:\/\/shop\.example\/Reset-Password#t=([A-Za-z0-9_-]+)/);
  assert.ok(m, "havola topilmadi");
  const token = m[1];
  const stored = await db.get("SELECT token_hash FROM password_resets");
  assert.notEqual(stored.token_hash, token); // bazada xesh

  assert.equal((await call("POST", "/api/account/reset/check", { body: { token } })).json.valid, true);
  assert.equal((await call("POST", "/api/account/reset/check", { body: { token: "x".repeat(40) } })).json.valid, false);

  const weak = await call("POST", "/api/account/reset", { body: { token, password: "123", password2: "123" }, ip: "10.1.6.3" });
  assert.equal(weak.status, 422);
  const ok = await call("POST", "/api/account/reset", { body: { token, password: "Tiklangan123", password2: "Tiklangan123" }, ip: "10.1.6.3" });
  assert.equal(ok.status, 200);
  const again = await call("POST", "/api/account/reset", { body: { token, password: "Boshqa12345", password2: "Boshqa12345" }, ip: "10.1.6.3" });
  assert.equal(again.status, 400); assert.equal(again.json.code, "invalid_token");
  assert.equal((await call("GET", "/api/account/me", { cookie: user.cookie })).json.authenticated, false); // eski sessiya tugadi
  assert.equal((await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Yangi12345" }, ip: "10.1.6.4" })).status, 401);
  const login = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Tiklangan123" }, ip: "10.1.6.4" });
  assert.equal(login.status, 200);
  user = { cookie: cookieOf(login), csrf: login.json.csrf };

  // Muddati o'tgan havola
  process.env.MAIL_DRY_RUN = "true";
  const logs2 = []; console.log = (...a) => logs2.push(a.join(" "));
  try { await call("POST", "/api/account/forgot", { body: { email: "alisher@example.com" }, ip: "10.1.6.5" }); }
  finally { console.log = orig; delete process.env.MAIL_DRY_RUN; }
  const token2 = logs2.join("\n").match(/#t=([A-Za-z0-9_-]+)/)[1];
  await db.run("UPDATE password_resets SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);
  const expired = await call("POST", "/api/account/reset", { body: { token: token2, password: "Boshqa12345", password2: "Boshqa12345" }, ip: "10.1.6.6" });
  assert.equal(expired.status, 400);
});

test("sevimlilar: akkauntga bog'langan, qurilmalar o'rtasida saqlanadi", async () => {
  const put = await call("PUT", "/api/account/favorites", Object.assign({ body: { ids: ["classic-royal", "loft-black", "classic-royal", "<bad>"] } }, authed(user)));
  assert.equal(put.status, 200); assert.deepEqual(put.json.ids, ["classic-royal", "loft-black"]);
  const login2 = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Tiklangan123" }, ip: "10.1.7.1" });
  const get = await call("GET", "/api/account/favorites", { cookie: cookieOf(login2) });
  assert.deepEqual(get.json.ids, ["classic-royal", "loft-black"]);
});

test("buyurtma: kirgan mijozniki akkauntga bog'lanadi, mehmonniki yo'q; tarix faqat o'zining", async () => {
  const prod = await db.get("SELECT id FROM products LIMIT 1");
  let pid = prod && prod.id;
  if (!pid) {
    await db.run("INSERT INTO products (id, name, price, sizes, stock, active, created_at, updated_at) VALUES ('t-door','Test door',1000000,'[\"800 × 2000\"]',5,1,?,?)", [new Date().toISOString(), new Date().toISOString()]);
    pid = "t-door";
  }
  const sizes = JSON.parse((await db.get("SELECT sizes FROM products WHERE id = ?", [pid])).sizes);
  const order = (extra, cookie) => call("POST", "/api/order", {
    cookie, csrf: cookie ? user.csrf : undefined, ip: "10.1.8." + Math.floor(Math.random() * 200),
    body: Object.assign({ customer: { name: "Алишер", phone: "+998 90 123 45 67", region: "toshkent", address: "Ташкент, ул. Тестовая 1" }, items: [{ id: pid, size: sizes[0], qty: 1 }] }, extra)
  });
  const mine = await order({}, user.cookie);
  assert.equal(mine.status, 200);
  // Mehmon buyurtmasi endi qabul qilinmaydi
  const guest = await order({});
  assert.equal(guest.status, 401);
  // Klient yuborgan account_id e'tiborga olinmaydi: buyurtma har doim sessiya egasiga bog'lanadi
  const spoof = await order({ account_id: 999, accountId: 999 }, user.cookie);
  assert.equal(spoof.status, 200);
  const rows = await db.all("SELECT number, account_id FROM orders");
  const mineId = (await db.get("SELECT id FROM accounts WHERE email = ?", ["alisher@example.com"])).id;
  assert.equal(rows.find(r => r.number === mine.json.orderId).account_id, mineId);
  assert.equal(rows.find(r => r.number === spoof.json.orderId).account_id, mineId);
  assert.equal(rows.some(r => r.account_id === 999), false);

  const hist = await call("GET", "/api/account/orders", { cookie: user.cookie });
  assert.equal(hist.json.items.length, 2); assert.ok(hist.json.items.some(i => i.number === mine.json.orderId));
  assert.equal(hist.json.items[0].lines.length, 1);
  const r2 = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.8.250" });
  assert.equal((await call("GET", "/api/account/orders", { cookie: cookieOf(r2) })).json.items.length, 0);
});

/* ---------- Admin integratsiyasi ---------- */
async function staff(username, role) {
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", [username, username, role, auth.hashPassword("Sinov-8421-Kalit"), new Date().toISOString()]);
  const r = await call("POST", "/api/admin/auth/login", { body: { username, password: "Sinov-8421-Kalit" }, ip: "10.1.9." + Math.floor(Math.random() * 200) });
  return { cookie: cookieOf(r), csrf: r.json.csrf };
}

test("admin: foydalanuvchilar ro'yxati faqat vakolatli xodimga; mijoz cookie'si admin API'ga kira olmaydi", async () => {
  assert.equal((await call("GET", "/api/admin/accounts")).status, 401);
  assert.equal((await call("GET", "/api/admin/accounts", { cookie: user.cookie })).status, 401); // mijoz sessiyasi admin emas
  const op = await staff("op1", "operator"), mgr = await staff("mgr1", "manager"), sa = await staff("boss1", "super_admin");
  assert.equal((await call("GET", "/api/admin/accounts", authed(op))).status, 403);
  const list = await call("GET", "/api/admin/accounts", authed(mgr));
  assert.equal(list.status, 200); assert.ok(list.json.items.length >= 2);
  assert.equal(list.json.items[0].password_hash, undefined);
  const q = await call("GET", "/api/admin/accounts?q=second", authed(mgr));
  assert.equal(q.json.items.length, 1);

  const target = list.json.items.find(a => a.email === "alisher@example.com");
  // Manager bloklay olmaydi, super admin esa parol tasdig'idan keyin bloklaydi
  assert.equal((await call("PUT", `/api/admin/accounts/${target.id}/status`, Object.assign({ body: { status: "blocked" } }, authed(mgr)))).status, 403);
  const noReauth = await call("PUT", `/api/admin/accounts/${target.id}/status`, Object.assign({ body: { status: "blocked" } }, authed(sa)));
  assert.equal(noReauth.json.code, "reauth_required");
  await call("POST", "/api/admin/auth/reauth", Object.assign({ body: { password: "Sinov-8421-Kalit" } }, authed(sa)));
  const blk = await call("PUT", `/api/admin/accounts/${target.id}/status`, Object.assign({ body: { status: "blocked" } }, authed(sa)));
  assert.equal(blk.status, 200);
  assert.equal((await call("GET", "/api/account/me", { cookie: user.cookie })).json.authenticated, false); // sessiya o'chirilgan
  const denied = await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Tiklangan123" }, ip: "10.1.9.250" });
  assert.equal(denied.status, 403); assert.equal(denied.json.code, "blocked");
  await call("PUT", `/api/admin/accounts/${target.id}/status`, Object.assign({ body: { status: "active" } }, authed(sa)));
  assert.equal((await call("POST", "/api/account/login", { body: { identifier: "alisher@example.com", password: "Tiklangan123" }, ip: "10.1.9.251" })).status, 200);
});

test("chiqish: sessiya serverda o'chadi", async () => {
  const l = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.1.10.1" });
  const s = { cookie: cookieOf(l), csrf: l.json.csrf };
  const out = await call("POST", "/api/account/logout", { cookie: s.cookie });
  assert.equal(out.status, 200); assert.match(String(out.headers["set-cookie"]), /Max-Age=0/);
  assert.equal((await call("GET", "/api/account/me", { cookie: s.cookie })).json.authenticated, false);
});

test("SQL injection urinishi: login va qidiruv xavfsiz", async () => {
  const r = await call("POST", "/api/account/login", { body: { identifier: "' OR 1=1 --", password: "x' OR '1'='1" }, ip: "10.1.11.1" });
  assert.equal(r.status, 401);
  const rr = await reg({ email: "a'; DROP TABLE accounts;--@x.com" }, { ip: "10.1.11.2" });
  assert.equal(rr.status, 422);
  assert.ok(await db.get("SELECT 1 AS x FROM accounts LIMIT 1"));
});

/* ---------- Admin integratsiyasi: tarix, faollik, saralash, profil, o'chirish, statistika ---------- */
test("kirish tarixi: muvaffaqiyatli/muvaffaqiyatsiz yoziladi, identifikator niqoblangan, parol yozilmaydi", async () => {
  await db.run("DELETE FROM login_attempts");
  await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Maxfiy-Xato-777" }, ip: "10.2.0.1" });
  await call("POST", "/api/account/login", { body: { identifier: "yoq-odam@example.com", password: "Maxfiy-Xato-888" }, ip: "10.2.0.1" });
  const ok = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.2.0.2" });
  assert.equal(ok.status, 200);
  const rows = await db.all("SELECT * FROM account_login_log ORDER BY id");
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes("Maxfiy-Xato") && !dump.includes("Sinov-8421"), "parol logda yo'q");
  assert.ok(!dump.includes("second@example.com") && !dump.includes("yoq-odam@example.com"), "to'liq email logda yo'q");
  assert.ok(rows.some(r => r.reason === "bad_password" && r.success === 0 && r.identifier === "s***@example.com"));
  assert.ok(rows.some(r => r.reason === "unknown_account" && r.account_id === null));
  assert.ok(rows.some(r => r.reason === "ok" && r.success === 1));
  const acc = await db.get("SELECT last_login_at, last_seen_at FROM accounts WHERE email = ?", ["second@example.com"]);
  assert.ok(acc.last_login_at && acc.last_seen_at);
});

test("oxirgi faollik: sessiya ishlatilganda yangilanadi", async () => {
  const l = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.2.1.1" });
  await db.run("UPDATE accounts SET last_seen_at = ? WHERE email = ?", [new Date(Date.now() - 3600e3).toISOString(), "second@example.com"]);
  await call("GET", "/api/account/me", { cookie: cookieOf(l) });
  await new Promise(r => setTimeout(r, 100));
  const a = await db.get("SELECT last_seen_at FROM accounts WHERE email = ?", ["second@example.com"]);
  assert.ok(Date.now() - new Date(a.last_seen_at).getTime() < 60000);
});

test("admin: saralash, profil, statistika, o'chirish (buyurtmalar saqlanadi), ruxsatlar", async () => {
  const op = await staff("op2", "operator"), mgr = await staff("mgr2", "manager"), sa = await staff("boss2", "super_admin");
  const list = await call("GET", "/api/admin/accounts?sort=name&dir=asc", authed(mgr));
  assert.equal(list.status, 200);
  assert.ok(list.json.stats.total >= 2 && list.json.stats.today >= 2);
  const names = list.json.items.map(i => i.first_name.toLowerCase());
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
  assert.equal((await call("GET", "/api/admin/accounts?sort=1;DROP TABLE accounts&dir=x", authed(mgr))).status, 200); // yaroqsiz saralash e'tiborsiz

  const target = list.json.items.find(a => a.email === "alisher@example.com");
  const prof = await call("GET", `/api/admin/accounts/${target.id}`, authed(mgr));
  assert.equal(prof.status, 200);
  assert.equal(JSON.stringify(prof.json).includes("password_hash"), false);
  assert.ok(prof.json.logins.length >= 1 && prof.json.orders.length === 2);
  // ruxsatlar
  assert.equal((await call("GET", `/api/admin/accounts/${target.id}`, authed(op))).status, 403);
  assert.equal((await call("GET", `/api/admin/accounts/${target.id}`, { cookie: user.cookie })).status, 401);
  assert.equal((await call("DELETE", `/api/admin/accounts/${target.id}`, authed(mgr))).status, 403);
  // dashboard statistikasi real bazadan
  const dash = await call("GET", "/api/admin/dashboard", authed(op));
  assert.equal(dash.json.stats.total_accounts, list.json.stats.total);

  await call("POST", "/api/admin/auth/reauth", Object.assign({ body: { password: "Sinov-8421-Kalit" } }, authed(sa)));
  const del = await call("DELETE", `/api/admin/accounts/${target.id}`, authed(sa));
  assert.equal(del.status, 200);
  assert.equal(await db.get("SELECT 1 AS x FROM accounts WHERE id = ?", [target.id]), null);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM account_login_log WHERE account_id = ?", [target.id])).n), 0);
  const o = await db.get("SELECT account_id FROM orders WHERE name = ? LIMIT 1", ["Алишер"]);
  assert.ok(o, "buyurtma saqlangan"); 
  assert.equal((await call("GET", `/api/admin/accounts/${target.id}`, authed(mgr))).status, 404);
  const after = await call("GET", "/api/admin/accounts", authed(mgr));
  assert.equal(after.json.stats.total, list.json.stats.total - 1);
  const audit = await db.get("SELECT detail FROM audit_log WHERE action = 'account.delete'");
  assert.ok(!audit.detail || !audit.detail.includes("alisher"));
});

test("IP cheklovi: X-Forwarded-For soxtalashtirib aylanib o'tib bo'lmaydi (proksi ishonchsiz bo'lsa)", async () => {
  await db.run("DELETE FROM login_attempts");
  for (let i = 0; i < 10; i++) {
    const r = await call("POST", "/api/account/login", { body: { identifier: `spoof${i}@example.com`, password: "Xato-Parol-1" }, ip: "10.9.0.1", headers: { "x-forwarded-for": `1.2.3.${i}` } });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/account/login", { body: { identifier: "spoof99@example.com", password: "Xato-Parol-1" }, ip: "10.9.0.1", headers: { "x-forwarded-for": "5.6.7.8" } });
  assert.equal(blocked.status, 429, "soxta XFF bilan ham bir xil socket IP bloklanadi");
  await db.run("DELETE FROM login_attempts");
});

/* ---------- Buyurtma faqat kirgan mijozdan ---------- */
test("buyurtma: autentifikatsiyasiz /api/order va /api/configurator/order rad etiladi (401, login_required)", async () => {
  const orderBody = { customer: { name: "Mehmon", phone: "+998 90 777 66 55", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: "classic-royal", size: "800 × 2000", qty: 1 }] };
  const before = Number((await db.get("SELECT COUNT(*) AS n FROM orders")).n);
  for (const url of ["/api/order", "/api/configurator/order"]) {
    const r = await call("POST", url, { body: orderBody, ip: "10.20.0.1" });
    assert.equal(r.status, 401, url);
    assert.equal(r.json.code, "login_required");
    assert.equal(r.json.error, "Для оформления заказа необходимо войти в аккаунт или зарегистрироваться.");
    // soxta/yaroqsiz cookie ham ishlamaydi
    const fake = await call("POST", url, { body: orderBody, ip: "10.20.0.2", cookie: "yd_acc=" + "x".repeat(43), csrf: "y" });
    assert.equal(fake.status, 401, url + " (soxta cookie)");
    // honeypot ham autentifikatsiyasiz o'tmaydi (sessiyasiz hech narsa bajarilmaydi)
    assert.equal((await call("POST", url, { body: Object.assign({}, orderBody, { website: "bot" }), ip: "10.20.0.3" })).status, 401);
  }
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM orders")).n), before, "hech qanday buyurtma yaratilmadi");
});

test("buyurtma: kirgan mijoz CSRF tokensiz yoki begona Origin bilan buyurtma bera olmaydi", async () => {
  const l = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.20.1.1" });
  const s = { cookie: cookieOf(l), csrf: l.json.csrf };
  const body = { customer: { name: "Madina", phone: "+998 93 555 11 22", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: "classic-royal", size: "800 × 2000", qty: 1 }] };
  const noCsrf = await call("POST", "/api/order", { body, cookie: s.cookie, ip: "10.20.1.2" });
  assert.equal(noCsrf.status, 403); assert.equal(noCsrf.json.code, "csrf");
  const foreign = await call("POST", "/api/order", { body, cookie: s.cookie, csrf: s.csrf, headers: { origin: "https://evil.example" }, ip: "10.20.1.3" });
  assert.equal(foreign.status, 403);
});

test("buyurtma: bloklangan akkaunt sessiyasi bilan buyurtma berib bo'lmaydi", async () => {
  const l = await call("POST", "/api/account/login", { body: { identifier: "second@example.com", password: "Sinov-8421-Kalit" }, ip: "10.20.2.1" });
  const s = { cookie: cookieOf(l), csrf: l.json.csrf };
  await db.run("UPDATE accounts SET status = 'blocked' WHERE email = ?", ["second@example.com"]);
  const r = await call("POST", "/api/order", { body: { customer: { name: "M", phone: "+998 93 555 11 22", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: "classic-royal", size: "800 × 2000", qty: 1 }] }, cookie: s.cookie, csrf: s.csrf, ip: "10.20.2.2" });
  assert.equal(r.status, 401);
  await db.run("UPDATE accounts SET status = 'active' WHERE email = ?", ["second@example.com"]);
});

test("Vercel yo'naltirishi: /api?__p=<yo'l> asl yo'lga tengdir (ikki qismli yo'llar ham ishlaydi)", async () => {
  const a = await call("GET", "/api?__p=admin/status");
  assert.equal(a.status, 200); assert.equal(a.json.db, true);
  const b = await call("GET", "/api?__p=account/me&x=1");
  assert.equal(b.json.authenticated, false);
  const c = await call("GET", "/api?__p=catalog");
  assert.equal(c.json.ok, true);
  const d = await call("GET", "/api?__p=admin/orders");          // himoya yo'lga bog'liq emas: ruxsatsiz 401
  assert.equal(d.status, 401);
  assert.equal((await call("GET", "/api?__p=yoq/yol")).status, 404);
});
