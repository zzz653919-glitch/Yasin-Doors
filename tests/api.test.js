/**
 * Backend integratsiya testlari (node --test). Router'ni to'g'ridan-to'g'ri chaqiradi, vaqtinchalik baza bilan.
 * Ishga tushirish: npm test
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL;
delete process.env.SETUP_TOKEN;

const db = require("../lib/db");
const auth = require("../lib/auth");
const { handle } = require("../lib/router");

/* ---------- Yordamchilar ---------- */
function call(method, url, { body, cookie, csrf, ip = "10.0.0.1", headers = {} } = {}) {
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
        const ct = this.headers["content-type"] || "";
        if (ct.includes("json") && data) { try { json = JSON.parse(data); } catch (e) { /* json emas */ } }
        resolve({ status: this.statusCode, json, headers: this.headers, raw: data });
      }
    };
    handle(req, res);
  });
}

async function createUser(username, role, password = "Parol12345") {
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)",
    [username, username.toUpperCase(), role, auth.hashPassword(password), new Date().toISOString()]);
}

async function login(username, password = "Parol12345", ip) {
  const r = await call("POST", "/api/admin/auth/login", { body: { username, password }, ip });
  if (r.status !== 200) return { res: r };
  const cookie = String(r.headers["set-cookie"]).split(";")[0];
  return { res: r, cookie, csrf: r.json.csrf };
}
const authed = s => ({ cookie: s.cookie, csrf: s.csrf });
async function reauth(s, password = "Parol12345") {
  const r = await call("POST", "/api/admin/auth/reauth", Object.assign({ body: { password } }, authed(s)));
  assert.equal(r.status, 200);
}

let sa, mgr, op; // sessiyalar

test.before(async () => {
  await db.init();
  await createUser("boss", "super_admin");
  await createUser("manager1", "manager");
  await createUser("operator1", "operator");
  sa = await login("boss", undefined, "10.0.1.1");
  mgr = await login("manager1", undefined, "10.0.1.2");
  op = await login("operator1", undefined, "10.0.1.3");
});

test.after(() => {
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});

/* ---------- Autentifikatsiya ---------- */
test("login: noto'g'ri parol 401, to'g'ri parol cookie beradi (HttpOnly, SameSite=Strict)", async () => {
  const bad = await call("POST", "/api/admin/auth/login", { body: { username: "boss", password: "xato-parol-1" }, ip: "10.9.9.1" });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error, "Login yoki parol noto'g'ri.");
  const ok = sa.res;
  assert.equal(ok.status, 200);
  const cookie = String(ok.headers["set-cookie"]);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(ok.json.user.role, "super_admin");
  assert.ok(!JSON.stringify(ok.json).includes("password"));
});

test("login: ketma-ket 5 ta xato urinishdan keyin 429", async () => {
  await createUser("victim", "operator");
  for (let i = 0; i < 5; i++) {
    const r = await call("POST", "/api/admin/auth/login", { body: { username: "victim", password: "noto'g'ri" + i }, ip: "10.8.8." + i });
    assert.equal(r.status, 401);
  }
  const blocked = await call("POST", "/api/admin/auth/login", { body: { username: "victim", password: "Parol12345" }, ip: "10.8.8.99" });
  assert.equal(blocked.status, 429);
});

test("himoyalangan API sessiyasiz 401 qaytaradi", async () => {
  for (const [m, u] of [["GET", "/api/admin/products"], ["GET", "/api/admin/orders"], ["GET", "/api/admin/dashboard"], ["GET", "/api/admin/users"], ["GET", "/api/admin/settings"]]) {
    const r = await call(m, u);
    assert.equal(r.status, 401, u);
  }
});

test("CSRF: token yo'q yoki noto'g'ri bo'lsa o'zgartiruvchi so'rov 403; begona Origin 403", async () => {
  const noToken = await call("POST", "/api/admin/categories", { body: { name: "Test" }, cookie: sa.cookie });
  assert.equal(noToken.status, 403);
  assert.equal(noToken.json.code, "csrf");
  const wrong = await call("POST", "/api/admin/categories", { body: { name: "Test" }, cookie: sa.cookie, csrf: "x".repeat(sa.csrf.length) });
  assert.equal(wrong.status, 403);
  const foreign = await call("POST", "/api/admin/categories", { body: { name: "Test" }, ...authed(sa), headers: { origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
});

test("logout sessiyani bekor qiladi", async () => {
  const s = await login("manager1", undefined, "10.0.2.1");
  const out = await call("POST", "/api/admin/auth/logout", authed(s));
  assert.equal(out.status, 200);
  const after = await call("GET", "/api/admin/auth/me", { cookie: s.cookie });
  assert.equal(after.status, 401);
});

/* ---------- Rollar ---------- */
test("rollar: operator mahsulot yarata olmaydi, manager yarata oladi; manager foydalanuvchilarni ko'ra olmaydi", async () => {
  const body = { name: "Rol Sinov Eshigi", price: 1000000, stock: 3 };
  const byOp = await call("POST", "/api/admin/products", { body, ...authed(op) });
  assert.equal(byOp.status, 403);
  const byMgr = await call("POST", "/api/admin/products", { body, ...authed(mgr) });
  assert.equal(byMgr.status, 201);
  assert.equal((await call("GET", "/api/admin/users", authed(mgr))).status, 403);
  assert.equal((await call("GET", "/api/admin/users", authed(op))).status, 403);
  assert.equal((await call("GET", "/api/admin/users", authed(sa))).status, 200);
  assert.equal((await call("GET", "/api/admin/audit", authed(mgr))).status, 403);
  assert.equal((await call("PUT", "/api/admin/settings", { body: { phone: "+998901112233" }, ...authed(op) })).status, 403);
  assert.equal((await call("GET", "/api/admin/orders", authed(op))).status, 200);
  await call("DELETE", "/api/admin/products/" + byMgr.json.item.id, authed(sa)); // tozalash (reauth kerak — pastda tekshiriladi)
});

/* ---------- Mahsulotlar ---------- */
let productId;
test("mahsulot CRUD va tekshiruvlar", async () => {
  const noName = await call("POST", "/api/admin/products", { body: { price: 100 }, ...authed(mgr) });
  assert.equal(noName.status, 400);
  const badPrice = await call("POST", "/api/admin/products", { body: { name: "Xato narx", price: -5 }, ...authed(mgr) });
  assert.equal(badPrice.status, 400);
  const badSale = await call("POST", "/api/admin/products", { body: { name: "Xato chegirma", price: 2000, old_price: 1500 }, ...authed(mgr) });
  assert.equal(badSale.status, 400);
  const badColor = await call("POST", "/api/admin/products", { body: { name: "Rang", price: 2000, color: "<script>" }, ...authed(mgr) });
  assert.equal(badColor.status, 400);

  const created = await call("POST", "/api/admin/products", {
    body: { name: "Test Eshik <b>X</b>", price: 2500000, old_price: 2900000, color: "oq", style: "klassik", material: "MDF", sizes: ["800 × 2000", "900 × 2000"], stock: 10, low_stock: 4, is_new: true, active: true, short: "Qisqa", description: "Tavsif" },
    ...authed(mgr)
  });
  assert.equal(created.status, 201);
  productId = created.json.item.id;
  assert.match(productId, /^test-eshik/);
  assert.equal(created.json.item.stock, 10);

  const upd = await call("PUT", "/api/admin/products/" + productId, { body: { price: 2400000, stock: 12 }, ...authed(mgr) });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.item.price, 2400000);
  assert.equal(upd.json.item.stock, 12);
  const moves = await call("GET", "/api/admin/inventory/movements?product=" + productId, authed(mgr));
  assert.equal(moves.json.items.length, 2); // yaratilganda kirim + tahrirlashda tuzatish
  assert.equal(moves.json.items.reduce((s, m) => s + m.delta, 0), 12);

  const missing = await call("PUT", "/api/admin/products/yoq-mahsulot", { body: { price: 1 }, ...authed(mgr) });
  assert.equal(missing.status, 404);
});

test("rasm yuklash: faqat haqiqiy rasm; ochiq /api/image/:id orqali beriladi", async () => {
  const bad = await call("POST", "/api/admin/upload", { body: { data: "data:image/png;base64,AAAA" }, ...authed(mgr) });
  assert.equal(bad.status, 400);
  const html = await call("POST", "/api/admin/upload", { body: { data: "data:text/html;base64,PGgxPmhpPC9oMT4=" }, ...authed(mgr) });
  assert.equal(html.status, 400);
  // 1x1 PNG
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const ok = await call("POST", "/api/admin/upload", { body: { data: png }, ...authed(mgr) });
  assert.equal(ok.status, 201);
  const img = await call("GET", ok.json.url);
  assert.equal(img.status, 200);
  assert.equal(img.headers["content-type"], "image/png");
});

/* ---------- Ochiq katalog ---------- */
test("ochiq katalog: faol mahsulotlar, nofaollari yashirin; baza bo'sh bo'lsa 'static'", async () => {
  const cat = await call("GET", "/api/catalog");
  assert.equal(cat.json.source, "db");
  assert.ok(cat.json.products.some(p => p.id === productId));
  const off = await call("PUT", "/api/admin/products/" + productId, { body: { active: false }, ...authed(mgr) });
  assert.equal(off.status, 200);
  const cat2 = await call("GET", "/api/catalog");
  assert.ok(!(cat2.json.products || []).some(p => p.id === productId));
  await call("PUT", "/api/admin/products/" + productId, { body: { active: true }, ...authed(mgr) });
});

/* ---------- Buyurtma va ombor ---------- */
let orderId, orderNumber;
const customer = { name: "Sinov Mijoz", phone: "90 123 45 67", address: "Toshkent, Sinov ko'chasi 1", comment: "<b>izoh</b>", install: true };

test("ochiq buyurtma: narx bazadan olinadi, mijoz yaratiladi, ombor hali o'zgarmaydi", async () => {
  const r = await call("POST", "/api/order", {
    body: { customer, items: [{ id: productId, size: "800 × 2000", qty: 2, price: 1 }], clientTotal: 2 },
    ip: "10.5.5.1"
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.total, 4800000); // 2 x 2 400 000 — klient yuborgan "price: 1" e'tiborsiz
  orderNumber = r.json.orderId;
  const list = await call("GET", "/api/admin/orders?q=" + orderNumber, authed(op));
  orderId = list.json.items[0].id;
  assert.equal(list.json.items[0].status, "new");
  assert.equal(list.json.items[0].phone, "+998901234567");
  assert.equal(list.json.items[0].items[0].price, 2400000);
  const p = await call("GET", "/api/admin/products/" + productId, authed(mgr));
  assert.equal(p.json.item.stock, 12);
  const customers = await call("GET", "/api/admin/customers?q=901234567", authed(op));
  assert.equal(customers.json.items.length, 1);
  assert.equal(customers.json.items[0].orders_count, 1);
});

test("ochiq buyurtma: noto'g'ri ma'lumotlar rad etiladi", async () => {
  const noPhone = await call("POST", "/api/order", { body: { customer: { name: "Ali", phone: "123", address: "Toshkent 12" }, items: [{ id: productId, size: "800 × 2000", qty: 1 }] }, ip: "10.5.5.2" });
  assert.equal(noPhone.status, 422);
  const noProd = await call("POST", "/api/order", { body: { customer, items: [{ id: "yoq", size: "800 × 2000", qty: 1 }] }, ip: "10.5.5.2" });
  assert.equal(noProd.status, 422);
  const badSize = await call("POST", "/api/order", { body: { customer, items: [{ id: productId, size: "1 × 1", qty: 1 }] }, ip: "10.5.5.2" });
  assert.equal(badSize.status, 422);
  const honey = await call("POST", "/api/order", { body: { customer, items: [], website: "bot" }, ip: "10.5.5.3" });
  assert.equal(honey.status, 200); // botga jim "muvaffaqiyat", lekin hech narsa saqlanmaydi
  const total = await call("GET", "/api/admin/orders?limit=100", authed(op));
  assert.equal(total.json.total, 1);
});

const stockOf = async () => (await call("GET", "/api/admin/products/" + productId, authed(mgr))).json.item.stock;
const patch = (body, s = op) => call("PATCH", "/api/admin/orders/" + orderId, { body, ...authed(s) });

test("ombor: tasdiqlanganda BIR marta kamayadi; takroriy so'rov va keyingi holatlar kamaytirmaydi", async () => {
  assert.equal((await patch({ status: "accepted" })).status, 200);
  assert.equal(await stockOf(), 10);
  assert.equal((await patch({ status: "accepted" })).status, 200); // takror
  assert.equal(await stockOf(), 10);
  assert.equal((await patch({ status: "preparing" })).status, 200);
  assert.equal((await patch({ status: "delivering" })).status, 200);
  assert.equal(await stockOf(), 10);
  const o = (await call("GET", "/api/admin/orders/" + orderId, authed(op))).json.item;
  assert.equal(o.delivery_status, "in_transit");
  assert.ok(o.history.filter(h => h.field === "status").length >= 4);
});

test("ombor: bir vaqtda ikki marta 'tasdiqlash' so'rovi ham faqat bir marta kamaytiradi", async () => {
  const r = await call("POST", "/api/order", { body: { customer, items: [{ id: productId, size: "900 × 2000", qty: 3 }] }, ip: "10.5.5.4" });
  const list = await call("GET", "/api/admin/orders?q=" + r.json.orderId, authed(op));
  const id = list.json.items[0].id;
  const before = await stockOf();
  const fire = () => call("PATCH", "/api/admin/orders/" + id, { body: { status: "accepted" }, ...authed(op) });
  const results = await Promise.all([fire(), fire(), fire()]);
  results.forEach(x => assert.ok([200, 409, 500].includes(x.status)));
  assert.equal(await stockOf(), before - 3);
  const moves = (await call("GET", "/api/admin/inventory/movements?product=" + productId, authed(mgr))).json.items;
  assert.equal(moves.filter(m => m.reason === "order_deduct" && m.note.includes(r.json.orderId)).length, 1);
});

test("bekor qilish qayta tasdiqlashni (reauth) talab qiladi va omborni BIR marta qaytaradi", async () => {
  const before = await stockOf();
  const noReauth = await patch({ status: "cancelled" });
  assert.equal(noReauth.status, 403);
  assert.equal(noReauth.json.code, "reauth_required");
  await reauth(op);
  assert.equal((await patch({ status: "cancelled" })).status, 200);
  assert.equal(await stockOf(), before + 2);
  assert.equal((await patch({ status: "cancelled" })).status, 200); // takror
  assert.equal(await stockOf(), before + 2);
  // qayta ochish — yana kamayadi
  assert.equal((await patch({ status: "accepted" })).status, 200);
  assert.equal(await stockOf(), before);
});

test("ombor yetishmasa tasdiqlash 409 beradi va hech narsa o'zgarmaydi", async () => {
  const r = await call("POST", "/api/order", { body: { customer, items: [{ id: productId, size: "800 × 2000", qty: 50 }] }, ip: "10.5.5.5" });
  const list = await call("GET", "/api/admin/orders?q=" + r.json.orderId, authed(op));
  const id = list.json.items[0].id;
  const before = await stockOf();
  const res = await call("PATCH", "/api/admin/orders/" + id, { body: { status: "accepted" }, ...authed(op) });
  assert.equal(res.status, 409);
  assert.equal(await stockOf(), before);
  const o = (await call("GET", "/api/admin/orders/" + id, authed(op))).json.item;
  assert.equal(o.status, "new");
  assert.equal(o.stock_applied, false);
});

test("to'lov holati va admin izohi; noto'g'ri qiymatlar rad etiladi", async () => {
  const ok = await patch({ payment_status: "paid", admin_note: "Naqd to'landi" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.item.payment_status, "paid");
  assert.equal((await patch({ payment_status: "whatever" })).status, 400);
  assert.equal((await patch({ status: "teleport" })).status, 400);
});

test("ombor: kirim/chiqim, manfiy qoldiq taqiqlanadi, operator o'zgartira olmaydi", async () => {
  const before = await stockOf();
  const add = await call("POST", "/api/admin/inventory/adjust", { body: { product_id: productId, mode: "delta", value: 5, reason: "restock", note: "Yangi partiya" }, ...authed(mgr) });
  assert.equal(add.status, 200);
  assert.equal(add.json.stock, before + 5);
  const neg = await call("POST", "/api/admin/inventory/adjust", { body: { product_id: productId, mode: "delta", value: -9999, reason: "writeoff" }, ...authed(mgr) });
  assert.equal(neg.status, 400);
  const byOp = await call("POST", "/api/admin/inventory/adjust", { body: { product_id: productId, mode: "set", value: 1 }, ...authed(op) });
  assert.equal(byOp.status, 403);
  assert.equal(await stockOf(), before + 5);
});

/* ---------- Mijozlar, dashboard, eksport ---------- */
test("mijoz: tahrirlash va buyurtmalar tarixi; telefon takrori rad etiladi", async () => {
  const list = await call("GET", "/api/admin/customers", authed(mgr));
  const c = list.json.items[0];
  const detail = await call("GET", "/api/admin/customers/" + c.id, authed(mgr));
  assert.ok(detail.json.item.orders.length >= 1);
  assert.equal((await call("PUT", "/api/admin/customers/" + c.id, { body: { name: "Yangi Ism" }, ...authed(op) })).status, 403);
  const upd = await call("PUT", "/api/admin/customers/" + c.id, { body: { name: "Yangi Ism", note: "VIP" }, ...authed(mgr) });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.item.name, "Yangi Ism");
  assert.equal((await call("PUT", "/api/admin/customers/" + c.id, { body: { phone: "12" }, ...authed(mgr) })).status, 400);
});

test("dashboard statistikasi haqiqiy ma'lumotlardan hisoblanadi", async () => {
  const d = await call("GET", "/api/admin/dashboard?range=week", authed(op));
  assert.equal(d.status, 200);
  const all = await call("GET", "/api/admin/orders?limit=100", authed(op));
  assert.equal(d.json.stats.total_orders, all.json.total);
  const expectedRevenue = all.json.items.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  assert.equal(d.json.stats.revenue, expectedRevenue);
  assert.equal(d.json.stats.today_orders, all.json.total); // hammasi bugun yaratilgan
  assert.equal(d.json.chart.length, 7);
  assert.equal(d.json.chart.reduce((s, x) => s + x.revenue, 0), expectedRevenue);
  assert.equal((await call("GET", "/api/admin/dashboard?range=month", authed(op))).json.chart.length, 30);
  assert.ok(d.json.top_products.length >= 1);
});

test("CSV eksport: ruxsat va formula injection'dan himoya", async () => {
  await call("POST", "/api/order", { body: { customer: Object.assign({}, customer, { name: "=HYPERLINK(\"http://evil\")" }), items: [{ id: productId, size: "800 × 2000", qty: 1 }] }, ip: "10.5.5.6" });
  assert.equal((await call("GET", "/api/admin/orders/export", authed(op))).status, 403);
  const csv = await call("GET", "/api/admin/orders/export", authed(mgr));
  assert.equal(csv.status, 200);
  assert.match(csv.headers["content-type"], /text\/csv/);
  const text = String(csv.raw);
  assert.ok(text.includes("'=HYPERLINK"));
  assert.ok(!/,=HYPERLINK/.test(text));
});

/* ---------- Mahsulot o'chirish, kategoriyalar, foydalanuvchilar ---------- */
test("mahsulot o'chirish qayta tasdiqlashsiz 403; tasdiqdan keyin o'chadi", async () => {
  const p = await call("POST", "/api/admin/products", { body: { name: "O'chiriladigan", price: 1000 }, ...authed(mgr) });
  const id = p.json.item.id;
  assert.equal((await call("DELETE", "/api/admin/products/" + id, authed(op))).status, 403);
  const r1 = await call("DELETE", "/api/admin/products/" + id, authed(mgr));
  assert.equal(r1.status, 403);
  assert.equal(r1.json.code, "reauth_required");
  await reauth(mgr);
  assert.equal((await call("DELETE", "/api/admin/products/" + id, authed(mgr))).status, 200);
  assert.equal((await call("GET", "/api/admin/products/" + id, authed(mgr))).status, 404);
  // ommaviy amallar
  const a = (await call("POST", "/api/admin/products", { body: { name: "Bulk A", price: 1 }, ...authed(mgr) })).json.item.id;
  const b = (await call("POST", "/api/admin/products", { body: { name: "Bulk B", price: 1 }, ...authed(mgr) })).json.item.id;
  const bulk = await call("POST", "/api/admin/products/bulk", { body: { action: "deactivate", ids: [a, b] }, ...authed(mgr) });
  assert.equal(bulk.json.changed, 2);
  assert.equal((await call("POST", "/api/admin/products/bulk", { body: { action: "delete", ids: [a, b] }, ...authed(op) })).status, 403);
  assert.equal((await call("POST", "/api/admin/products/bulk", { body: { action: "delete", ids: [a, b] }, ...authed(mgr) })).status, 200);
});

test("kategoriyalar CRUD", async () => {
  const c = await call("POST", "/api/admin/categories", { body: { name: "Ichki eshiklar" }, ...authed(mgr) });
  assert.equal(c.status, 201);
  assert.equal((await call("POST", "/api/admin/categories", { body: { name: "Ichki eshiklar" }, ...authed(mgr) })).status, 409);
  assert.equal((await call("PUT", "/api/admin/categories/" + c.json.item.id, { body: { name: "Xona eshiklari" }, ...authed(mgr) })).status, 200);
  await call("PUT", "/api/admin/products/" + productId, { body: { category_id: c.json.item.id }, ...authed(mgr) });
  const list = await call("GET", "/api/admin/categories", authed(op));
  assert.equal(list.json.items.find(x => x.id === c.json.item.id).products_count, 1);
  await reauth(mgr);
  assert.equal((await call("DELETE", "/api/admin/categories/" + c.json.item.id, authed(mgr))).status, 200);
  assert.equal((await call("GET", "/api/admin/products/" + productId, authed(mgr))).json.item.category_id, null);
});

test("foydalanuvchilar: faqat Super Admin, parol siyosati, oxirgi Super Admin himoyasi", async () => {
  await reauth(sa);
  const weak = await call("POST", "/api/admin/users", { body: { username: "yangi1", name: "Yangi", role: "operator", password: "qisqa" }, ...authed(sa) });
  assert.equal(weak.status, 400);
  const created = await call("POST", "/api/admin/users", { body: { username: "yangi1", name: "Yangi", role: "operator", password: "Kuchli12345" }, ...authed(sa) });
  assert.equal(created.status, 201);
  const dup = await call("POST", "/api/admin/users", { body: { username: "YANGI1", name: "Yangi", role: "operator", password: "Kuchli12345" }, ...authed(sa) });
  assert.equal(dup.status, 409);
  assert.equal((await call("POST", "/api/admin/users", { body: { username: "x1234", name: "X", role: "operator", password: "Kuchli12345" }, ...authed(mgr) })).status, 403);
  // parol xeshi API orqali hech qachon qaytmaydi
  const list = await call("GET", "/api/admin/users", authed(sa));
  assert.ok(!JSON.stringify(list.json).includes("scrypt"));
  // o'zini o'chirish / oxirgi super adminni tushirish mumkin emas
  const self = list.json.items.find(u => u.username === "boss");
  assert.equal((await call("PUT", "/api/admin/users/" + self.id, { body: { active: false }, ...authed(sa) })).status, 409);
  // nofaol qilingan foydalanuvchi kira olmaydi
  const nu = list.json.items.find(u => u.username === "yangi1");
  assert.equal((await call("PUT", "/api/admin/users/" + nu.id, { body: { active: false }, ...authed(sa) })).status, 200);
  const res = await call("POST", "/api/admin/auth/login", { body: { username: "yangi1", password: "Kuchli12345" }, ip: "10.7.7.7" });
  assert.equal(res.status, 401);
});

test("sozlamalar: faqat Super Admin yozadi; manager ko'radi; telegram sozlanmagan holati ko'rinadi", async () => {
  assert.equal((await call("PUT", "/api/admin/settings", { body: { phone: "+998 90 111 22 33", address: "Toshkent" }, ...authed(mgr) })).status, 403);
  const ok = await call("PUT", "/api/admin/settings", { body: { phone: "+998 90 111 22 33", address: "Toshkent", store_name: "YasinDoors" }, ...authed(sa) });
  assert.equal(ok.status, 200);
  const get = await call("GET", "/api/admin/settings", authed(mgr));
  assert.equal(get.json.settings.phone, "+998 90 111 22 33");
  assert.equal(typeof get.json.telegram.configured, "boolean");
  assert.equal((await call("PUT", "/api/admin/settings", { body: { email: "xato" }, ...authed(sa) })).status, 400);
  const pub = await call("GET", "/api/catalog");
  assert.equal(pub.json.settings.phone, "+998 90 111 22 33");
  // maxfiy sozlamalar ochiq katalogda yo'q
  assert.ok(!("telegram_enabled" in pub.json.settings));
});

test("audit log: muhim amallar yoziladi, parol va xeshlar yozilmaydi", async () => {
  const log = await call("GET", "/api/admin/audit", authed(sa));
  assert.equal(log.status, 200);
  const actions = log.json.items.map(i => i.action);
  for (const a of ["login", "product.create", "order.update", "stock.adjust", "user.create", "settings.update"]) assert.ok(actions.includes(a), a);
  const dump = JSON.stringify(log.json);
  assert.ok(!dump.includes("Parol12345") && !dump.includes("Kuchli12345") && !dump.includes("scrypt"));
});

test("noma'lum yo'l 404, noto'g'ri usul 405; xato javoblarida ichki ma'lumot yo'q", async () => {
  assert.equal((await call("GET", "/api/yoq-yol")).status, 404);
  assert.equal((await call("DELETE", "/api/catalog")).status, 405);
  const r = await call("POST", "/api/admin/auth/login", { body: { username: "'; DROP TABLE users;--", password: "x" }, ip: "10.6.6.6" });
  assert.equal(r.status, 401);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM users")).n) > 0, true); // jadval joyida
});
