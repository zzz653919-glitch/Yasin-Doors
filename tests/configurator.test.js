/**
 * 3D konstruktor testlari: umumiy ma'lumot moduli, narx dvigateli (taxmin qilmaydi), serverda qat'iy tekshiruv,
 * buyurtma endpointi (idempotentlik, soxta narx), admin narx qoidalari va narx belgilash. Vaqtinchalik baza.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-cfg-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL; delete process.env.SETUP_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const C = require("../public/assets/js/configurator-data.js");
const db = require("../lib/db");
const auth = require("../lib/auth");
const { handle } = require("../lib/router");

/** Buyurtma endpointlari kirgan mijozni talab qiladi: cookie berilmasa umumiy sinov mijozi ishlatiladi ({ guest: true } — mehmon) */
async function call(method, url, opts = {}) {
  if (method === "POST" && /^\/api\/(order|configurator\/order)$/.test(url) && !opts.cookie && !opts.guest) {
    const c = await require("./_customer")();
    opts = Object.assign({}, opts, { cookie: c.cookie, csrf: c.csrf });
  }
  return rawCall(method, url, opts);
}

function rawCall(method, url, { body, cookie, csrf, ip = "10.2.0.1" } = {}) {
  return new Promise(resolve => {
    const req = {
      method, url, body, socket: { remoteAddress: ip },
      headers: Object.assign({ host: "localhost:3000" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {})
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

const FULL_RULES = {
  base: { flat: 1000000, classic: 1200000, lines: 1100000, geo: 1300000, glass: 1500000 },
  coating: { emal: 100000, mat: 80000, tex: 150000 },
  color: { wood: 50000 },
  handle: { lever: 0, bar: 20000, round: 10000 },
  finish: { gold: 30000, black: 0, chrome: 15000 },
  frame: { none: 0, same: 200000, white: 180000, black: 180000 },
  decor: { gold: 40000, silver: 35000 },
  glass: { frosted: 100000, clear: 120000 },
  size: { custom: 250000, extra_sqm: 500000 }
};
const customer = { name: "Sinov Mijoz", phone: "+998 90 123 45 67", region: "toshkent", address: "Toshkent, Sinov ko'chasi 1" };
const key = () => require("crypto").randomBytes(12).toString("hex");
let boss;

test.before(async () => {
  await db.init();
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", ["cfgboss", "cfgboss", "super_admin", auth.hashPassword("Parol12345"), new Date().toISOString()]);
  const r = await call("POST", "/api/admin/auth/login", { body: { username: "cfgboss", password: "Parol12345" } });
  assert.equal(r.status, 200);
  boss = { cookie: String(r.headers["set-cookie"]).split(";")[0], csrf: r.json.csrf };
  assert.equal((await call("POST", "/api/admin/auth/reauth", { body: { password: "Parol12345" }, ...boss })).status, 200);
});
test.after(() => { for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } } });

/* ---------- Ma'lumot moduli ---------- */
test("standart konfiguratsiya yaroqli; yog'och rang qoplamani majburlaydi; o'lcham chegaralanadi", () => {
  const d = C.defaults();
  assert.ok(C.validate(d).ok);
  const wood = C.normalize({ ...d, color: "eman", coating: "emal" });
  assert.equal(wood.coating, "tex");
  const solid = C.normalize({ ...d, color: "oq", coating: "tex" });
  assert.notEqual(solid.coating, "tex");
  const big = C.normalize({ ...d, w: 99999, h: -5, qty: 1000 });
  assert.ok(big.w <= C.LIMITS.wMax && big.h >= C.LIMITS.hMin && big.qty <= C.LIMITS.qtyMax);
});

test("validate: soxtalashtirilgan qiymatlar rad etiladi", () => {
  const d = C.defaults();
  for (const patch of [{ model: "yoq" }, { color: "pushti" }, { w: 5000 }, { h: "abc" }, { qty: 0 }, { handle: "<script>" }, { frame: 7 }]) {
    assert.equal(C.validate({ ...d, ...patch }).ok, false, JSON.stringify(patch));
  }
  assert.equal(C.validate(null).ok, false);
  assert.equal(C.validate([]).ok, false);
});

test("havola kodi: encode/decode aylanishi va yaroqsiz kod", () => {
  const cfg = C.normalize({ ...C.defaults(), model: "classic", color: "grafit", w: 900, qty: 3 });
  assert.deepEqual(C.decode(C.encode(cfg)), cfg);
  assert.equal(C.decode("???"), null);
  assert.equal(C.decode("AAAAAAAAAAAA"), null);
  assert.match(C.shortCode(cfg), /^YDC-[0-9A-Z]{7}$/);
});

test("narx dvigateli: qoida yo'q bo'lsa taxmin qilmaydi, to'liq bo'lsa hisoblaydi", () => {
  const cfg = C.normalize({ ...C.defaults(), qty: 2 });
  const none = C.calcPrice(cfg, {});
  assert.equal(none.status, "request"); assert.equal(none.total, null);
  const partial = C.calcPrice(cfg, { base: FULL_RULES.base });
  assert.equal(partial.status, "request"); assert.ok(partial.missing.length > 0);
  const full = C.calcPrice(cfg, FULL_RULES);
  assert.equal(full.status, "priced");
  assert.equal(full.total, full.unit * 2);
  assert.equal(full.unit, full.lines.reduce((s, l) => s + l.amount, 0));
  // nostandart o'lcham — qoida yo'q bo'lsa so'rov
  const custom = C.normalize({ ...C.defaults(), w: 850 });
  const rules = JSON.parse(JSON.stringify(FULL_RULES)); delete rules.size.custom;
  assert.equal(C.calcPrice(custom, rules).status, "request");
  assert.equal(C.calcPrice(custom, FULL_RULES).status, "priced");
});

test("o'lcham narxi: standartdan oshgan m² bo'yicha; kichik eshikka chegirma yo'q; ixtiyoriy xarajat bir marta", () => {
  const std = C.calcPrice(C.normalize({ ...C.defaults() }), FULL_RULES);
  assert.ok(!std.lines.some(l => /o‘lcham/i.test(l.label)));                       // standart o'lcham — o'lcham qo'shimchasi yo'q
  const big = C.normalize({ ...C.defaults(), w: 900, h: 2100 });                    // 1.89 m² → 0.29 m² ortiq
  const pb = C.calcPrice(big, FULL_RULES);
  const sq = pb.lines.find(l => /Katta o‘lcham/.test(l.label));
  assert.equal(sq.amount, Math.round(500000 * 0.29));
  assert.equal(pb.unit, std.unit + 250000 + sq.amount);                             // nostandart + m² qo'shimchasi, boshqa hech narsa
  const small = C.calcPrice(C.normalize({ ...C.defaults(), w: 700, h: 1900 }), FULL_RULES);
  assert.ok(!small.lines.some(l => /Katta/.test(l.label)));
  assert.equal(small.unit, std.unit + 250000);
  const noSqm = JSON.parse(JSON.stringify(FULL_RULES)); delete noSqm.size.extra_sqm;
  assert.equal(C.calcPrice(big, noSqm).status, "request");
  const fee = C.calcPrice(C.defaults(), { ...FULL_RULES, other: { fee: 15000 } });
  assert.equal(fee.unit, std.unit + 15000);
  assert.equal(fee.lines.filter(l => l.label === "Boshqa xarajat").length, 1);
});

test("sanitizeRules: noma'lum kalit va noto'g'ri son rad etiladi", () => {
  assert.deepEqual(C.sanitizeRules({ base: { flat: 5 }, hack: { x: 1 }, coating: { emal: -1, mat: 1.5, tex: "12 000" } }).errors.sort(), ["coating.emal", "coating.mat"]);
  assert.equal(C.sanitizeRules("{not json").errors[0], "JSON");
  assert.deepEqual(C.sanitizeRules("").rules, {});
  assert.equal(C.sanitizeRules({ base: { flat: 1e12 } }).errors.length, 1);
});

/* ---------- Server ---------- */
test("sozlama: noto'g'ri narx qoidalari 400, to'g'rilari saqlanadi va ochiq katalogda ko'rinadi", async () => {
  for (const bad of ['{"base":{"flat":-5}}', '{"base":{"flat":"abc"}}', "{broken", '{"coating":{"emal":1.5}}']) {
    assert.equal((await call("PUT", "/api/admin/settings", { body: { cfg_prices: bad }, ...boss })).status, 400, bad);
  }
  const ok = await call("PUT", "/api/admin/settings", { body: { cfg_prices: JSON.stringify({ base: { flat: 1000000 }, junk: { a: 1 } }) }, ...boss });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.json.settings.cfg_prices), { base: { flat: 1000000 } }); // noma'lum kalit tashlab yuboriladi
  assert.equal((await call("PUT", "/api/admin/settings", { body: { cfg_prices: "" }, ...boss })).status, 200);
});

test("buyurtma: yaroqsiz konfiguratsiya, ism/telefon va honeypot", async () => {
  const cfg = C.defaults();
  const r1 = await call("POST", "/api/configurator/order", { body: { customer, config: { ...cfg, model: "yoq" } }, ip: "10.2.1.1" });
  assert.equal(r1.status, 422);
  const r2 = await call("POST", "/api/configurator/order", { body: { customer: { ...customer, phone: "123" }, config: cfg }, ip: "10.2.1.2" });
  assert.equal(r2.status, 422);
  const r3 = await call("POST", "/api/configurator/order", { body: { customer, config: null }, ip: "10.2.1.3" });
  assert.equal(r3.status, 422);
  const bot = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, website: "spam" }, ip: "10.2.1.4" });
  assert.equal(bot.status, 200); assert.equal(bot.json.orderId, "YD-000000-000000");
});

test("buyurtma: narx qoidasi yo'q — narx 0, priced=false; klient yuborgan narx e'tiborga olinmaydi", async () => {
  const cfg = C.normalize({ ...C.defaults(), model: "classic", color: "grafit", qty: 2 });
  const r = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, price: 1, total: 1, idempotencyKey: key() }, ip: "10.2.2.1" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.priced, false);
  assert.equal(r.json.total, 0);
  assert.equal(r.json.code, C.shortCode(cfg));
  const list = await call("GET", "/api/admin/orders?q=" + encodeURIComponent(r.json.orderId), { ...boss });
  const order = list.json.items[0];
  assert.equal(order.total, 0);
  assert.equal(order.items[0].config.priced, false);
  assert.deepEqual(order.items[0].config.cfg, cfg);
  assert.equal(order.items[0].product_id, null);
  assert.equal(order.items[0].qty, 2);
});

test("buyurtma: to'liq qoidalar bilan narx serverda hisoblanadi; takroriy kalit ikkinchi buyurtma yaratmaydi", async () => {
  assert.equal((await call("PUT", "/api/admin/settings", { body: { cfg_prices: JSON.stringify(FULL_RULES) }, ...boss })).status, 200);
  const cfg = C.normalize({ ...C.defaults(), model: "geo", color: "eman", qty: 3 });
  const expected = C.calcPrice(cfg, FULL_RULES);
  const k = key();
  const a = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, total: 5, idempotencyKey: k }, ip: "10.2.3.1" });
  assert.equal(a.status, 200); assert.equal(a.json.priced, true); assert.equal(a.json.total, expected.total);
  const b = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, idempotencyKey: k }, ip: "10.2.3.2" });
  assert.equal(b.status, 200); assert.equal(b.json.orderId, a.json.orderId);
  const list = await call("GET", "/api/admin/orders?q=" + encodeURIComponent(a.json.orderId), { ...boss });
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].total, expected.total);
});

test("buyurtma: mijoz ko'rgan narx server narxidan farq qilsa 409; eski buyurtma narxi o'zgarmaydi", async () => {
  assert.equal((await call("PUT", "/api/admin/settings", { body: { cfg_prices: JSON.stringify(FULL_RULES) }, ...boss })).status, 200);
  const cfg = C.normalize({ ...C.defaults(), model: "lines" });
  const price1 = C.calcPrice(cfg, FULL_RULES).total;
  const ok = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, expectedTotal: price1, idempotencyKey: key() }, ip: "10.2.6.1" });
  assert.equal(ok.status, 200); assert.equal(ok.json.total, price1);
  const stale = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, expectedTotal: price1 - 1, idempotencyKey: key() }, ip: "10.2.6.2" });
  assert.equal(stale.status, 409);
  const notPriced = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, expectedTotal: null, idempotencyKey: key() }, ip: "10.2.6.3" });
  assert.equal(notPriced.status, 409);
  // admin narxni o'zgartiradi — eski buyurtma saqlangan narxda qoladi
  const changed = JSON.parse(JSON.stringify(FULL_RULES)); changed.base.lines = 9999999;
  assert.equal((await call("PUT", "/api/admin/settings", { body: { cfg_prices: JSON.stringify(changed) }, ...boss })).status, 200);
  const old = (await call("GET", "/api/admin/orders?q=" + encodeURIComponent(ok.json.orderId), { ...boss })).json.items[0];
  assert.equal(old.total, price1);
  assert.equal(old.items[0].price, price1);
  const fresh = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, expectedTotal: C.calcPrice(cfg, changed).total, idempotencyKey: key() }, ip: "10.2.6.4" });
  assert.equal(fresh.status, 200); assert.equal(fresh.json.total, C.calcPrice(cfg, changed).total);
  await call("PUT", "/api/admin/settings", { body: { cfg_prices: "" }, ...boss });
});

test("3D rasm saqlanadi va buyurtmaga bog'lanadi; yaroqsiz rasm buyurtmani to'xtatmaydi", async () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const cfg = C.normalize({ ...C.defaults(), model: "lines" });
  const ok = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, snapshot: png, idempotencyKey: key() }, ip: "10.2.4.1" });
  assert.equal(ok.status, 200);
  const o = (await call("GET", "/api/admin/orders?q=" + encodeURIComponent(ok.json.orderId), { ...boss })).json.items[0];
  assert.match(o.items[0].config.image, /^\/api\/image\/[a-f0-9]{20}$/);
  const img = await call("GET", o.items[0].config.image);
  assert.equal(img.status, 200);
  const bad = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, snapshot: "data:text/html;base64,PGI+", idempotencyKey: key() }, ip: "10.2.4.2" });
  assert.equal(bad.status, 200);
  const o2 = (await call("GET", "/api/admin/orders?q=" + encodeURIComponent(bad.json.orderId), { ...boss })).json.items[0];
  assert.equal(o2.items[0].config.image, null);
});

test("menejer narxni belgilaydi: faqat narxi aniqlanmagan konstruktor buyurtmasi uchun", async () => {
  await call("PUT", "/api/admin/settings", { body: { cfg_prices: "" }, ...boss });
  const cfg = C.normalize({ ...C.defaults(), model: "flat", qty: 2 });
  const r = await call("POST", "/api/configurator/order", { body: { customer, config: cfg, idempotencyKey: key() }, ip: "10.2.5.1" });
  assert.equal(r.json.priced, false);
  const id = (await call("GET", "/api/admin/orders?q=" + encodeURIComponent(r.json.orderId), { ...boss })).json.items[0].id;
  assert.equal((await call("PATCH", "/api/admin/orders/" + id, { body: { quote_unit: -5 }, ...boss })).status, 400);
  assert.equal((await call("PATCH", "/api/admin/orders/" + id, { body: { quote_unit: "abc" }, ...boss })).status, 400);
  const q = await call("PATCH", "/api/admin/orders/" + id, { body: { quote_unit: 1800000 }, ...boss });
  assert.equal(q.status, 200);
  assert.equal(q.json.item.total, 3600000);
  assert.equal(q.json.item.items[0].price, 1800000);
  // narx allaqachon belgilangan — qayta belgilash mumkin (config.priced hali false), lekin oddiy buyurtmada rad etiladi
  const ord = await call("POST", "/api/order", { body: { customer, items: [{ id: "yoq", size: "800 × 2000", qty: 1 }] }, ip: "10.2.5.2" });
  assert.ok(ord.status >= 400);
});

test("konstruktor buyurtmasi ombor va savdo statistikasini buzmaydi", async () => {
  const dash = await call("GET", "/api/admin/dashboard", { ...boss });
  assert.equal(dash.status, 200);
  assert.ok(!(dash.json.top_products || []).some(p => /Konstruktor/.test(p.name)));
  const id = (await call("GET", "/api/admin/orders?limit=1", { ...boss })).json.items[0].id;
  const acc = await call("PATCH", "/api/admin/orders/" + id, { body: { status: "accepted" }, ...boss });
  assert.equal(acc.status, 200); // product_id yo'q — ombor tekshiruvi to'xtatmaydi
});
