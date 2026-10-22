/**
 * Mobil ilova funksiyalari: saqlangan manzillar (hudud serverda tekshiriladi), buyurtma holati tarixi, PWA fayllari.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-app-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL; delete process.env.SETUP_TOKEN;

const db = require("../lib/db");
const auth = require("../lib/auth");
const accounts = require("../lib/accounts");
const { handle } = require("../lib/router");

function call(method, url, { body, cookie, csrf, ip = "10.0.0.1" } = {}) {
  return new Promise(resolve => {
    const req = { method, url, body, socket: { remoteAddress: ip },
      headers: Object.assign({ host: "localhost:3000" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {}) };
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { let json = null; try { json = data ? JSON.parse(data) : null; } catch (e) { /* json emas */ } resolve({ status: this.statusCode, json, headers: this.headers }); } };
    handle(req, res);
  });
}
async function mkCustomer(email, phone) {
  await db.init();
  const t = new Date().toISOString();
  const r = await db.run("INSERT INTO accounts (first_name, last_name, email, phone, password_hash, status, consent_at, created_at, updated_at) VALUES (?,?,?,?,?,'active',?,?,?)",
    ["Test", "Mijoz", email, phone, auth.hashPassword("Sinov-8421-Kalit"), t, t, t]);
  const s = await accounts.createSession({ headers: {} }, r.lastId, "127.0.0.1", true);
  return { cookie: s.cookie.split(";")[0], csrf: s.csrf, id: r.lastId };
}
let A, B;
test.before(async () => { A = await mkCustomer("a@example.com", "+998901110001"); B = await mkCustomer("b@example.com", "+998901110002"); });
test.after(() => { for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } } });

test("manzillar: kirishsiz 401", async () => {
  assert.equal((await call("GET", "/api/account/addresses")).status, 401);
  assert.equal((await call("POST", "/api/account/addresses", { body: { region: "samarqand", address: "Registon 5" } })).status, 401);
});

test("manzillar: qo'shish, ro'yxat, hudud va nuqta serverda tekshiriladi", async () => {
  const ok = await call("POST", "/api/account/addresses", { body: { label: "Uy", region: "samarqand", address: "Registon ko'chasi 5" }, ...A });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  assert.equal(ok.json.item.region, "samarqand");
  const withPoint = await call("POST", "/api/account/addresses", { body: { label: "Ish", address: "Guliston, Markaz 1", lat: 40.489, lng: 68.784 }, ...A });
  assert.equal(withPoint.status, 201); assert.equal(withPoint.json.item.region, "sirdaryo");
  const list = await call("GET", "/api/account/addresses", A);
  assert.equal(list.json.items.length, 2);
  for (const bad of [
    { region: "buxoro", address: "Buxoro shahri 1-uy" },
    { region: "", address: "Registon ko'chasi 5" },
    { region: "samarqand", address: "ab" },
    { region: "samarqand", address: "Farg'ona, Bobur 2" },
    { region: "samarqand", address: "Registon 5", lat: 39.77, lng: 64.42 },
    { region: "navoiy", address: "Guliston, Markaz 1", lat: 40.489, lng: 68.784 }
  ]) assert.equal((await call("POST", "/api/account/addresses", { body: bad, ...A })).status, 422, JSON.stringify(bad));
});

test("manzillar: boshqa mijoz ko'rmaydi va o'chira olmaydi; chegara 5 ta; CSRFsiz rad", async () => {
  const id = (await call("GET", "/api/account/addresses", A)).json.items[0].id;
  assert.equal((await call("GET", "/api/account/addresses", B)).json.items.length, 0);
  await call("DELETE", "/api/account/addresses/" + id, B);
  assert.equal((await call("GET", "/api/account/addresses", A)).json.items.length, 2, "boshqa mijoz o'chira olmadi");
  assert.equal((await call("POST", "/api/account/addresses", { body: { region: "samarqand", address: "Registon 7" }, cookie: A.cookie })).status, 403, "CSRF tokensiz");
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/api/account/addresses", { body: { label: "M" + i, region: "toshkent", address: "Chilonzor " + (i + 10) }, ...A })).status, 201);
  assert.equal((await call("POST", "/api/account/addresses", { body: { region: "toshkent", address: "Yana bitta manzil" }, ...A })).status, 409);
  assert.equal((await call("DELETE", "/api/account/addresses/" + id, A)).status, 200);
  assert.equal((await call("GET", "/api/account/addresses", A)).json.items.length, 4);
});

test("buyurtma holati tarixi: mijoz tarixida holatlar va vaqti ko'rinadi", async () => {
  const store = require("../lib/store");
  const prod = await store.createProduct({ name: "Tarix Eshik", price: 1000000, stock: 9, sizes: ["800 × 2000"], active: true }, { id: 1, username: "test" });
  const pid = String((prod.item || prod).id);
  const o = await call("POST", "/api/order", { body: { customer: { name: "Tarix Mijoz", phone: "+998 90 123 45 67", region: "samarqand", address: "Registon 5" }, items: [{ id: pid, size: "800 × 2000", qty: 1 }] }, ...A, ip: "10.9.1.1" });
  assert.equal(o.status, 200, JSON.stringify(o.json));
  const first = (await call("GET", "/api/account/orders", A)).json.items[0];
  assert.equal(first.status, "new");
  assert.ok(Array.isArray(first.history) && first.history.length >= 1 && first.history[0].to === "new", JSON.stringify(first.history));
  assert.equal((await call("GET", "/api/account/orders", B)).json.items.length, 0, "boshqa mijoz tarixini ko'ra olmaydi");
});

test("PWA fayllari: manifest, service worker, offline sahifa, ikonkalar", () => {
  const root = path.join(__dirname, "..", "public");
  const mf = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(mf.display, "standalone"); assert.equal(mf.start_url.startsWith("/"), true); assert.equal(mf.lang, "uz");
  for (const ic of mf.icons) assert.ok(fs.existsSync(path.join(root, ic.src)), ic.src);
  assert.ok(mf.icons.some(i => i.purpose === "maskable") && mf.icons.some(i => i.sizes === "512x512"));
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes("account|admin|order"), "hisob/admin/buyurtma so'rovlari keshlanmaydi");
  assert.ok(fs.existsSync(path.join(root, "offline.html")));
  // Bot tokeni yoki maxfiy kalit frontend/SW ichida yo'q
  for (const f of ["sw.js", "assets/js/pwa.js"]) assert.doesNotMatch(fs.readFileSync(path.join(root, f), "utf8"), /TELEGRAM|bot\d+:|api[_-]?key/i);
  // Barcha ochiq sahifalarda manifest ulangan (admin va offline'dan tashqari)
  for (const f of fs.readdirSync(root).filter(n => n.endsWith(".html") && n !== "offline.html")) assert.match(fs.readFileSync(path.join(root, f), "utf8"), /manifest\.webmanifest/, f);
});
