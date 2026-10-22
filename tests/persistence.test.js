/**
 * Haqiqiy server jarayoni bilan: ro'yxatdan o'tish → buyurtma → admin ko'radi va holatni o'zgartiradi →
 * serverni TO'XTATIB qayta ishga tushirish → ma'lumotlar (va sessiyalar) bazada saqlanib qolgan.
 * Faqat vaqtinchalik fayl bazasi ishlatiladi; mavjud ma'lumotlarga tegilmaydi.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os"), path = require("path"), fs = require("fs");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 3401 + (process.pid % 300);
const B = `http://127.0.0.1:${PORT}`;
const dbFile = path.join(os.tmpdir(), `yd-persist-${process.pid}-${Date.now()}.db`);
const DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.DATABASE_URL = DATABASE_URL;

let server = null;
function start() {
  server = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), DATABASE_URL, ORDER_DRY_RUN: "true", VERCEL: "" }), stdio: "ignore" });
  return waitHealthy();
}
async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(B + "/api/health"); if (r.ok) return; } catch (e) { /* hali ishga tushmagan */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("server ishga tushmadi");
}
function stop() {
  return new Promise(resolve => { if (!server) return resolve(); server.once("exit", resolve); server.kill("SIGTERM"); });
}
async function api(method, url, { body, cookie, csrf } = {}) {
  const r = await fetch(B + url, {
    method,
    headers: Object.assign({ "Content-Type": "application/json", Origin: B }, cookie ? { Cookie: cookie } : {}, csrf ? { "X-CSRF-Token": csrf } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null; try { json = await r.json(); } catch (e) { /* json emas */ }
  const sc = r.headers.get("set-cookie");
  return { status: r.status, json, cookie: sc ? sc.split(";")[0] : null };
}

const state = {};

test.before(async () => {
  // Bazani tayyorlash: katalog (1 mahsulot) va admin
  const db = require("../lib/db"), store = require("../lib/store"), auth = require("../lib/auth");
  await db.init();
  state.product = (await store.createProduct({ name: "Persist Door", price: 1500000, stock: 10, sizes: ["800 × 2000"], active: true }, { id: 1, username: "test" })).item;
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", ["persist-admin", "Admin", "super_admin", auth.hashPassword("Admin-Parol-4455"), new Date().toISOString()]);
  await start();
});
test.after(async () => {
  await stop();
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
  setTimeout(() => process.exit(0), 50).unref();
});

test("1-2) yangi foydalanuvchi ro'yxatdan o'tadi va bazaga yoziladi (parol xeshlangan)", async () => {
  const r = await api("POST", "/api/account/register", { body: { first_name: "Алишер", last_name: "Каримов", email: "persist@example.com", phone: "+998 90 321 54 76", password: "Sinov-8421-Kalit", password2: "Sinov-8421-Kalit", consent: true } });
  assert.equal(r.status, 201);
  state.user = { cookie: r.cookie, csrf: r.json.csrf, id: r.json.user.id };
  const db = require("../lib/db");
  const row = await db.get("SELECT first_name, last_name, email, phone, status, created_at, password_hash FROM accounts WHERE email = ?", ["persist@example.com"]);
  assert.equal(row.first_name, "Алишер"); assert.equal(row.phone, "+998903215476"); assert.equal(row.status, "active");
  assert.ok(row.created_at); assert.match(row.password_hash, /^scrypt\$/); assert.ok(!row.password_hash.includes("Sinov"));
});

test("3) admin panelda (API) yangi foydalanuvchi ko'rinadi, parol qaytmaydi", async () => {
  const l = await api("POST", "/api/admin/auth/login", { body: { username: "persist-admin", password: "Admin-Parol-4455" } });
  assert.equal(l.status, 200); state.admin = { cookie: l.cookie, csrf: l.json.csrf };
  const list = await api("GET", "/api/admin/accounts?q=persist", { cookie: state.admin.cookie });
  assert.equal(list.status, 200);
  const u = list.json.items.find(i => i.email === "persist@example.com");
  assert.ok(u, "yangi foydalanuvchi ro'yxatda"); assert.ok(u.created_at);
  assert.ok(!JSON.stringify(list.json).includes("password"));
});

test("4-5) shu foydalanuvchi buyurtma beradi; buyurtma bazada va adminda; narx serverda hisoblanadi", async () => {
  const body = { customer: { name: "Алишер Каримов", phone: "+998 90 321 54 76", region: "toshkent", address: "Ташкент, ул. Тестовая 5" }, items: [{ id: state.product.id, size: "800 × 2000", qty: 2 }], clientTotal: 1, idempotencyKey: "persist-key-0123456789abcdef" };
  const o = await api("POST", "/api/order", { body, cookie: state.user.cookie, csrf: state.user.csrf });
  assert.equal(o.status, 200); assert.equal(o.json.total, 3000000, "narx serverda hisoblandi (clientTotal=1 e'tiborsiz)");
  state.orderNo = o.json.orderId;
  // takroriy so'rov (bir xil kalit) yangi buyurtma yaratmaydi
  const dup = await api("POST", "/api/order", { body, cookie: state.user.cookie, csrf: state.user.csrf });
  assert.equal(dup.json.orderId, state.orderNo);
  const db = require("../lib/db");
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM orders")).n), 1);
  const list = await api("GET", "/api/admin/orders", { cookie: state.admin.cookie });
  const ord = list.json.items.find(i => i.number === state.orderNo);
  assert.ok(ord); assert.equal(ord.status, "new"); assert.equal(ord.total, 3000000); assert.equal(ord.email, "persist@example.com");
  assert.equal(ord.items[0].name, "Persist Door"); assert.equal(ord.items[0].qty, 2); assert.equal(ord.items[0].price, 1500000);
  assert.ok(ord.created_at); state.orderId = ord.id;
});

test("6) admin buyurtma holatini o'zgartiradi (new → accepted → completed)", async () => {
  for (const st of ["accepted", "completed"]) {
    const r = await api("PATCH", `/api/admin/orders/${state.orderId}`, { body: { status: st }, cookie: state.admin.cookie, csrf: state.admin.csrf });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const g = await api("GET", `/api/admin/orders/${state.orderId}`, { cookie: state.admin.cookie });
  assert.equal(g.json.item.status, "completed");
  assert.ok(g.json.item.history.length >= 3);
  const filtered = await api("GET", "/api/admin/orders?status=completed", { cookie: state.admin.cookie });
  assert.ok(filtered.json.items.some(i => i.id === state.orderId));
});

test("8) oddiy foydalanuvchi admin API'lariga kira olmaydi", async () => {
  for (const [m, u] of [["GET", "/api/admin/accounts"], ["GET", "/api/admin/orders"], ["GET", "/api/admin/dashboard"], ["GET", "/api/admin/users"]]) {
    const r = await api(m, u, { cookie: state.user.cookie });
    assert.equal(r.status, 401, u);
  }
});

test("7) server TO'XTATILIB qayta ishga tushirilgach ma'lumotlar va sessiyalar saqlanadi", async () => {
  await stop();
  await start();
  const me = await api("GET", "/api/account/me", { cookie: state.user.cookie });
  assert.equal(me.json.authenticated, true, "mijoz sessiyasi bazada saqlangan");
  assert.equal(me.json.user.email, "persist@example.com");
  const orders = await api("GET", "/api/account/orders", { cookie: state.user.cookie });
  assert.equal(orders.json.items.length, 1); assert.equal(orders.json.items[0].number, state.orderNo); assert.equal(orders.json.items[0].status, "completed");
  const adminOrders = await api("GET", "/api/admin/orders", { cookie: state.admin.cookie });
  const ord = adminOrders.json.items.find(i => i.number === state.orderNo);
  assert.ok(ord && ord.status === "completed" && ord.total === 3000000);
  const adminUsers = await api("GET", "/api/admin/accounts", { cookie: state.admin.cookie });
  assert.ok(adminUsers.json.items.some(i => i.email === "persist@example.com"));
  // qayta kirish ham ishlaydi (parol xeshi saqlangan)
  const l = await api("POST", "/api/account/login", { body: { identifier: "persist@example.com", password: "Sinov-8421-Kalit" } });
  assert.equal(l.status, 200);
});
