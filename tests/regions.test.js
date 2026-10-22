/**
 * Yetkazib berish hududlari, buyurtma validatsiyasi va Telegram xabari (ORDER_DRY_RUN — haqiqiy xabar yuborilmaydi).
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-regions-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL; delete process.env.SETUP_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const db = require("../lib/db");
const auth = require("../lib/auth");
const { handle } = require("../lib/router");
const telegram = require("../lib/telegram");
const regions = require("../lib/regions");

let cust, mgr, prodId;
function call(method, url, { body, cookie, csrf, ip = "10.0.0.1" } = {}) {
  return new Promise(resolve => {
    const req = { method, url, body, socket: { remoteAddress: ip },
      headers: Object.assign({ host: "localhost:3000" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {}) };
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { let json = null; try { json = data ? JSON.parse(data) : null; } catch (e) { /* json emas */ } resolve({ status: this.statusCode, json, headers: this.headers }); } };
    handle(req, res);
  });
}
const order = (customer, extra = {}) => call("POST", "/api/order", Object.assign({ body: Object.assign({ customer, items: [{ id: prodId, size: "800 × 2000", qty: 1 }] }, extra.body), ip: "10.5." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) }, cust, extra.opts));
const C = (over = {}) => Object.assign({ name: "Hudud Mijoz", phone: "+998 90 123 45 67", region: "samarqand", address: "Registon ko'chasi 5" }, over);

test.before(async () => {
  await db.init();
  cust = await require("./_customer")();
  cust = { cookie: cust.cookie, csrf: cust.csrf };
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", ["mgr", "mgr", "manager", auth.hashPassword("Parol12345"), new Date().toISOString()]);
  const l = await call("POST", "/api/admin/auth/login", { body: { username: "mgr", password: "Parol12345" }, ip: "10.1.0.2" });
  mgr = { cookie: String(l.headers["set-cookie"]).split(";")[0], csrf: l.json.csrf };
  const p = await call("POST", "/api/admin/products", { body: { name: "Hudud Eshik", price: 1500000, stock: 99, sizes: ["800 × 2000"] }, ...mgr });
  prodId = p.json.item.id;
});
test.after(() => { for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } } });

test("ruxsat etilgan 4 viloyat qabul qilinadi", async () => {
  for (const region of ["samarqand", "sirdaryo", "toshkent", "navoiy"]) {
    const r = await order(C({ region }));
    assert.equal(r.status, 200, region + ": " + JSON.stringify(r.json));
  }
});

test("hududsiz yoki ruxsat etilmagan hudud rad etiladi (server tomonda)", async () => {
  for (const region of [undefined, "", "buxoro", "andijon", "fargona", "xorazm", "TOSHKENT_SHAHRI", "samarqand; DROP", null, 5, {}, []]) {
    const r = await order(C({ region }));
    assert.equal(r.status, 422, "region=" + JSON.stringify(region));
    assert.match(r.json.error || r.json.message || JSON.stringify(r.json), /viloyat|hudud/i);
  }
});

test("manzil matnida boshqa viloyat nomi bo'lsa — rad etiladi (hatto ruxsat etilgan hudud tanlansa ham)", async () => {
  for (const address of ["Buxoro shahri, Navoiy ko'chasi 3", "Farg'ona, Mustaqillik 1", "Fargʻona vil., 5-uy", "Andijon, Bobur 2", "Nukus, 9-uy", "Qarshi shahri, 4"]) {
    const r = await order(C({ address }));
    assert.equal(r.status, 422, address);
  }
  // "Navoiy ko'chasi" kabi ruxsat etilgan nom bilan aralashganda to'g'ri manzil rad etilmaydi
  assert.equal((await order(C({ address: "Navoiy ko'chasi 12, Samarqand" }))).status, 200);
});

test("3D konstruktor buyurtmasi ham hududni tekshiradi", async () => {
  const CFG = require("../public/assets/js/configurator-data.js");
  const cfg = CFG.defaultConfig ? CFG.defaultConfig() : null;
  if (!cfg) return;
  const bad = await call("POST", "/api/configurator/order", { body: { customer: C({ region: "buxoro" }), config: cfg }, ...cust, ip: "10.6.0.1" });
  assert.equal(bad.status, 422);
});

test("buyurtma manzilida hudud nomi saqlanadi va Telegram xabarida ko'rinadi", async () => {
  const r = await order(C({ region: "navoiy", address: "Karmana tumani, Markaz 7" }));
  assert.equal(r.status, 200);
  const row = await db.get("SELECT * FROM orders WHERE id = (SELECT MAX(id) FROM orders)");
  assert.equal(row.address, "Navoiy viloyati, Karmana tumani, Markaz 7");
  const msg = telegram.orderMessage({ number: "YD-1", created_at: new Date().toISOString(), name: row.name, phone: "+998 90 123 45 67", address: row.address, install: 0, comment: "", items_count: 1, total: row.total }, [{ name: "Hudud Eshik", size: "800 × 2000", qty: 1, price: 1500000 }]);
  for (const part of ["Navoiy viloyati", "Hudud Mijoz", "+998 90 123 45 67", "Hudud Eshik", "1 500 000"]) assert.ok(msg.includes(part), part);
});

test("Telegram xabarida foydalanuvchi matni HTML-escape qilinadi", () => {
  const msg = telegram.orderMessage({ number: "YD-2", created_at: new Date().toISOString(), name: "<b>x</b>", phone: "1", address: "<script>", install: 0, comment: "a&b", items_count: 1, total: 1000 }, []);
  assert.ok(!msg.includes("<script>") && !msg.includes("<b>x</b>") && msg.includes("&lt;script&gt;") && msg.includes("a&amp;b"));
});

test("takroriy yuborish: bir xil idempotencyKey bitta buyurtma yaratadi", async () => {
  const key = "region-test-key-" + Date.now();
  const body = { idempotencyKey: key };
  const a = await order(C(), { body }); const b = await order(C(), { body });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.json.orderId, b.json.orderId);
  const n = await db.get("SELECT COUNT(*) AS n FROM orders WHERE idem_key = ?", [key]);
  assert.equal(Number(n.n), 1);
});

test("regions.resolve: apostrof variantlari va ruxsat etilgan nomlar", () => {
  const fail = m => { throw new Error(m); };
  assert.equal(regions.resolve("Sirdaryo", "Guliston 3", fail).address, "Sirdaryo viloyati, Guliston 3");
  assert.throws(() => regions.resolve("samarqand", "Farg‘ona 5", fail));
  assert.throws(() => regions.resolve("samarqand", "Fargʻona 5", fail));
});

/* ---------- Xaritadan tanlangan koordinatalar (haqiqiy viloyat chegaralari) ---------- */
const GEO = require("../public/assets/js/geo-regions.js");

test("geo: viloyat markazlari to'g'ri aniqlanadi, boshqa viloyatlar va tashqari nuqtalar null", () => {
  assert.equal(GEO.regionAt(39.654, 66.975), "samarqand");
  assert.equal(GEO.regionAt(40.489, 68.784), "sirdaryo");
  assert.equal(GEO.regionAt(41.469, 69.582), "toshkent");
  assert.equal(GEO.regionAt(40.103, 65.374), "navoiy");
  for (const [la, ln] of [[39.77, 64.42], [40.16, 67.8335], [37.2, 67.3], [41.0, 71.7], [0, 0], [NaN, 5], ["x", "y"]]) assert.equal(GEO.regionAt(la, ln), null, la + "," + ln);
  assert.equal(GEO.SHOP.lat, 40.160167); assert.equal(GEO.SHOP.lng, 67.8335);
  assert.equal(GEO.mapsUrl(GEO.SHOP.lat, GEO.SHOP.lng), "https://www.google.com/maps?q=40.160167,67.833500");
});

test("geo: ish vaqti Asia/Tashkent bo'yicha 09:00–17:00", () => {
  assert.equal(GEO.workStatus(new Date("2026-10-22T03:59:00Z")).open, false); // 08:59
  assert.equal(GEO.workStatus(new Date("2026-10-22T04:00:00Z")).open, true);  // 09:00
  assert.equal(GEO.workStatus(new Date("2026-10-22T11:59:00Z")).open, true);  // 16:59
  assert.equal(GEO.workStatus(new Date("2026-10-22T12:00:00Z")).open, false); // 17:00
});

test("buyurtma: xaritadagi nuqta saqlanadi; zonadan tashqari, noto'g'ri va mos kelmaydigan nuqtalar rad etiladi", async () => {
  const ok = await order(C({ region: undefined, lat: 40.489, lng: 68.784, address: "Guliston, Markaz 1" }));
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const row = await db.get("SELECT address, lat, lng FROM orders ORDER BY id DESC LIMIT 1");
  assert.equal(row.address, "Sirdaryo viloyati, Guliston, Markaz 1");
  assert.equal(Number(row.lat), 40.489); assert.equal(Number(row.lng), 68.784);
  assert.equal((await order(C({ region: "sirdaryo", lat: "40.489", lng: "68.784" }))).status, 200);
  for (const [lat, lng] of [[39.77, 64.42], [40.160167, 67.8335], [0, 0], ["abc", 5], [40.4, null], [NaN, 1], [1e9, 5], [{}, []], [40.489, undefined]]) {
    const r = await order(C({ lat, lng }));
    assert.equal(r.status, 422, JSON.stringify([lat, lng]));
  }
  // tanlangan hudud nuqta bilan mos kelmasa
  assert.equal((await order(C({ region: "navoiy", lat: 40.489, lng: 68.784 }))).status, 422);
});

test("Telegram xabarida xarita havolasi bor", () => {
  const msg = telegram.orderMessage({ number: "YD-3", created_at: new Date().toISOString(), name: "A", phone: "1", address: "Samarqand viloyati, x", lat: 39.654, lng: 66.975, install: 0, comment: "", items_count: 1, total: 1000 }, []);
  assert.ok(msg.includes("https://www.google.com/maps?q=39.654000,66.975000"));
});
