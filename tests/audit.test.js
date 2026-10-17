/**
 * Audit testlari: noto'g'ri kirishlar, chegaraviy holatlar, statistika qoidalari, idempotentlik,
 * Telegram xato yo'li va rollarning darhol kuchga kirishi. Vaqtinchalik baza, faqat test ma'lumotlari.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-audit-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL; delete process.env.SETUP_TOKEN;
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const db = require("../lib/db");
const auth = require("../lib/auth");
const { handle } = require("../lib/router");

function call(method, url, { body, cookie, csrf, ip = "10.0.0.1", headers = {}, rawBody } = {}) {
  return new Promise(resolve => {
    const req = {
      method, url, body: rawBody !== undefined ? rawBody : body, socket: { remoteAddress: ip },
      headers: Object.assign({ host: "localhost:3000" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {}, headers)
    };
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) {
        let json = null;
        if ((this.headers["content-type"] || "").includes("json") && data) { try { json = JSON.parse(data); } catch (e) { /* json emas */ } }
        resolve({ status: this.statusCode, json, headers: this.headers, raw: data });
      }
    };
    handle(req, res);
  });
}
async function mkUser(username, role, password = "Parol12345") {
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", [username, username, role, auth.hashPassword(password), new Date().toISOString()]);
}
async function login(username, ip, password = "Parol12345") {
  const r = await call("POST", "/api/admin/auth/login", { body: { username, password }, ip });
  assert.equal(r.status, 200, "login " + username);
  return { cookie: String(r.headers["set-cookie"]).split(";")[0], csrf: r.json.csrf };
}
const A = s => ({ cookie: s.cookie, csrf: s.csrf });
const reauth = async s => assert.equal((await call("POST", "/api/admin/auth/reauth", { body: { password: "Parol12345" }, ...A(s) })).status, 200);

let sa, mgr, op, prodId;

test.before(async () => {
  await db.init();
  await mkUser("boss", "super_admin"); await mkUser("mgr", "manager"); await mkUser("opr", "operator");
  sa = await login("boss", "10.1.0.1"); mgr = await login("mgr", "10.1.0.2"); op = await login("opr", "10.1.0.3");
  const p = await call("POST", "/api/admin/products", { body: { name: "Audit Eshik", price: 1000000, stock: 50, sizes: ["800 × 2000"] }, ...A(mgr) });
  prodId = p.json.item.id;
});
test.after(() => { for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } } });

/* ---------- Validatsiya ---------- */
test("mahsulot: noto'g'ri narx va miqdor qiymatlari serverda rad etiladi", async () => {
  const bad = [null, "", "abc", true, [], {}, 0, -1, 1.5, "1e3x", 1e12];
  for (const price of bad) {
    const r = await call("POST", "/api/admin/products", { body: { name: "Narx sinovi", price }, ...A(mgr) });
    assert.equal(r.status, 400, "price=" + JSON.stringify(price));
  }
  const noPrice = await call("POST", "/api/admin/products", { body: { name: "Narxsiz" }, ...A(mgr) });
  assert.equal(noPrice.status, 400);
  for (const stock of [-1, "x", 1.2, null, true, 1e9]) {
    const r = await call("POST", "/api/admin/products", { body: { name: "Miqdor sinovi", price: 1000, stock }, ...A(mgr) });
    assert.equal(r.status, 400, "stock=" + JSON.stringify(stock));
  }
  assert.equal((await call("POST", "/api/admin/products", { body: { name: "   ", price: 1000 }, ...A(mgr) })).status, 400);
  const ok = await call("POST", "/api/admin/products", { body: { name: "To'g'ri", price: "2500000", stock: "3" }, ...A(mgr) });
  assert.equal(ok.status, 201); // son ko'rinishidagi satr qabul qilinadi
  assert.equal(ok.json.item.price, 2500000);
});

test("tahrirlash: narx 0 yoki bo'sh qilib yuborilsa rad etiladi; chegirma tekshiruvi", async () => {
  for (const price of [null, "", 0]) assert.equal((await call("PUT", "/api/admin/products/" + prodId, { body: { price }, ...A(mgr) })).status, 400, JSON.stringify(price));
  assert.equal((await call("PUT", "/api/admin/products/" + prodId, { body: { old_price: 500 }, ...A(mgr) })).status, 400);
  assert.equal((await call("PUT", "/api/admin/products/" + prodId, { body: { stock: -5 }, ...A(mgr) })).status, 400);
});

/* ---------- Noto'g'ri identifikatorlar va so'rov parametrlari ---------- */
test("noto'g'ri ID lar hech qachon 500 bermaydi (400/404)", async () => {
  const ids = ["abc", "-1", "0", "1.5", "99999999999999999999", "%00", "1;DROP", "NaN"];
  const targets = [["GET", "/orders/"], ["PATCH", "/orders/"], ["GET", "/customers/"], ["PUT", "/customers/"], ["PUT", "/categories/"], ["DELETE", "/categories/"], ["PUT", "/users/"], ["POST", "/users/", "/password"]];
  await reauth(sa);
  for (const id of ids) {
    for (const [m, base, suffix] of targets) {
      const r = await call(m, "/api/admin" + base + encodeURIComponent(id) + (suffix || ""), { body: { name: "x", password: "Kuchli12345", status: "accepted" }, ...A(sa) });
      assert.ok([400, 404, 409].includes(r.status), `${m} ${base}${id}${suffix || ""} → ${r.status} ${JSON.stringify(r.json)}`);
    }
  }
  for (const id of ["yoq", "../etc", "a b", "%25"]) {
    for (const m of ["GET", "PUT", "DELETE"]) {
      const r = await call(m, "/api/admin/products/" + encodeURIComponent(id), { body: { price: 1000 }, ...A(sa) });
      assert.ok([400, 404].includes(r.status), `${m} products/${id} → ${r.status}`);
    }
  }
});

test("noto'g'ri so'rov parametrlari xato bermaydi", async () => {
  const urls = [
    "/api/admin/orders?page=-5&limit=abc", "/api/admin/orders?page=999999&limit=100000", "/api/admin/orders?from=garbage&to=2026-13-45",
    "/api/admin/orders?status=bogus&payment=bogus", "/api/admin/orders?customer=abc", "/api/admin/orders?q=%25%5F%27%22%3B--",
    "/api/admin/customers?q=%25", "/api/admin/products?category=abc&active=x&stock=x&sort=bogus", "/api/admin/products?q=%25%5F",
    "/api/admin/dashboard?range=garbage", "/api/admin/inventory/movements?product=%25", "/api/admin/audit?q=%25", "/api/admin/orders/export?from=x"
  ];
  for (const u of urls) { const r = await call("GET", u, A(sa)); assert.equal(r.status, 200, u + " → " + r.status); }
});

test("qidiruvda % va _ belgilari joker sifatida ishlamaydi", async () => {
  const all = await call("GET", "/api/admin/products", A(mgr));
  const pct = await call("GET", "/api/admin/products?q=%25", A(mgr));
  assert.ok(all.json.items.length > 0);
  assert.equal(pct.json.items.length, 0, "'%' hamma mahsulotni qaytarmasligi kerak");
  const us = await call("GET", "/api/admin/products?q=_", A(mgr));
  assert.equal(us.json.items.length, 0);
});

test("qidiruv: matnli so'rovdagi raqam telefon bo'yicha tasodifiy moslik bermaydi", async () => {
  const c = n => ({ name: n, phone: "+998 90 555 00 0" + n.slice(-1), address: "Toshkent, qidiruv sinovi 1" });
  for (const n of ["Qidiruv Mijoz 1", "Qidiruv Mijoz 2", "Qidiruv Mijoz 3"]) {
    const r = await call("POST", "/api/order", { body: { customer: c(n), items: [{ id: prodId, size: "800 × 2000", qty: 1 }] }, ip: "10.4." + Math.floor(Math.random() * 250) + ".1" });
    assert.equal(r.status, 200);
  }
  const byText = await call("GET", "/api/admin/orders?q=" + encodeURIComponent("Mijoz 1"), A(op));
  assert.deepEqual(byText.json.items.map(o => o.name), ["Qidiruv Mijoz 1"], "'Mijoz 1' faqat shu mijozni topishi kerak");
  const byPhone = await call("GET", "/api/admin/orders?q=" + encodeURIComponent("555 00 02"), A(op));
  assert.deepEqual(byPhone.json.items.map(o => o.name), ["Qidiruv Mijoz 2"], "telefon bo'lagi bo'yicha qidiruv ishlashi kerak");
  const cust = await call("GET", "/api/admin/customers?q=" + encodeURIComponent("Mijoz 3"), A(op));
  assert.deepEqual(cust.json.items.map(x => x.name), ["Qidiruv Mijoz 3"]);
  const custPhone = await call("GET", "/api/admin/customers?q=9055500", A(op));
  assert.equal(custPhone.json.items.length, 3);
});

test("noto'g'ri tana shakllari va usullar", async () => {
  assert.equal((await call("POST", "/api/admin/categories", { rawBody: "{oops", ...A(sa) })).status, 400);
  assert.equal((await call("POST", "/api/admin/categories", { rawBody: "[1,2]", ...A(sa) })).status, 400);
  assert.equal((await call("POST", "/api/admin/categories", { rawBody: "5", ...A(sa) })).status, 400);
  assert.equal((await call("POST", "/api/admin/products/bulk", { body: { action: "activate", ids: "abc" }, ...A(mgr) })).status, 400);
  assert.equal((await call("POST", "/api/admin/products/bulk", { body: { action: "activate", ids: [{}, null, 5] }, ...A(mgr) })).status, 400);
  assert.equal((await call("POST", "/api/admin/products/bulk", { body: { action: "explode", ids: [prodId] }, ...A(mgr) })).status, 400);
  assert.equal((await call("POST", "/api/admin/inventory/adjust", { body: { product_id: prodId, mode: "delta", value: "abc" }, ...A(mgr) })).status, 400);
  assert.equal((await call("POST", "/api/admin/inventory/adjust", { body: { value: 5 }, ...A(mgr) })).status, 404);
  assert.equal((await call("PUT", "/api/order", { body: {} })).status, 405);
  assert.equal((await call("DELETE", "/api/admin/orders", A(sa))).status, 405);
  assert.equal((await call("POST", "/api/admin/dashboard", { body: {}, ...A(sa) })).status, 405);
});

/* ---------- Ochiq buyurtma ---------- */
const cust = { name: "Audit Mijoz", phone: "+998 91 111 22 33", address: "Toshkent, Audit ko'chasi 7" };
const placeOrder = (items, extra = {}) => call("POST", "/api/order", { body: Object.assign({ customer: cust, items }, extra), ip: "10.7." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250) });

test("ochiq buyurtma: miqdor qat'iy tekshiriladi", async () => {
  for (const qty of ["2abc", 0, 100, -1, 1.5, null, "", [], {}, true]) {
    const r = await placeOrder([{ id: prodId, size: "800 × 2000", qty }]);
    assert.equal(r.status, 422, "qty=" + JSON.stringify(qty));
  }
  assert.equal((await placeOrder("yoq")).status, 422);
  assert.equal((await placeOrder([null])).status, 422);
  assert.equal((await placeOrder([{ id: prodId, size: "800 × 2000", qty: "2" }])).status, 200); // "2" son ko'rinishida
});

test("ochiq buyurtma: nofaol mahsulot sotilmaydi, o'chirilgan mahsulot xato bermaydi", async () => {
  const p = await call("POST", "/api/admin/products", { body: { name: "Nofaol Eshik", price: 900000, sizes: ["800 × 2000"], active: false }, ...A(mgr) });
  assert.equal((await placeOrder([{ id: p.json.item.id, size: "800 × 2000", qty: 1 }])).status, 422);
  const cat = await call("GET", "/api/catalog");
  assert.ok(!cat.json.products.some(x => x.id === p.json.item.id));
});

test("takroriy yuborilgan buyurtma (bir xil Idempotency kaliti) bitta buyurtma yaratadi", async () => {
  const key = "k-" + Math.random().toString(36).slice(2) + "-abcdef123456";
  const body = { customer: cust, items: [{ id: prodId, size: "800 × 2000", qty: 1 }], idempotencyKey: key };
  const before = (await call("GET", "/api/admin/orders?limit=100", A(op))).json.total;
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => call("POST", "/api/order", { body, ip: "10.9.9.9" })));
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(c.status, 200);
  assert.equal(a.json.orderId, b.json.orderId); assert.equal(b.json.orderId, c.json.orderId);
  const after = (await call("GET", "/api/admin/orders?limit=100", A(op))).json.total;
  assert.equal(after, before + 1);
  const other = await call("POST", "/api/order", { body: Object.assign({}, body, { idempotencyKey: key + "x" }), ip: "10.9.9.8" });
  assert.notEqual(other.json.orderId, a.json.orderId);
});

/* ---------- Telegram ---------- */
test("Telegram ishlamay qolsa ham buyurtma saqlanadi; xabar bir marta yuboriladi; token javobda/logda yo'q", async () => {
  const realFetch = global.fetch, realErr = console.error, realLog = console.log;
  const logs = []; console.error = (...a) => logs.push(a.join(" ")); console.log = (...a) => logs.push(a.join(" "));
  let calls = 0;
  process.env.ORDER_DRY_RUN = "false"; process.env.TELEGRAM_BOT_TOKEN = "123456:SECRET-TOKEN-VALUE"; process.env.TELEGRAM_CHAT_ID = "-100999";
  try {
    global.fetch = async () => { calls++; throw new Error("tarmoq uzildi 123456:SECRET-TOKEN-VALUE"); };
    const before = (await call("GET", "/api/admin/orders?limit=100", A(op))).json.total;
    const r = await placeOrder([{ id: prodId, size: "800 × 2000", qty: 1 }]);
    assert.equal(r.status, 200);
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(r.json).includes("SECRET"));
    assert.equal((await call("GET", "/api/admin/orders?limit=100", A(op))).json.total, before + 1);
    // 4xx javob (noto'g'ri token) ham buyurtmani buzmaydi
    global.fetch = async () => ({ ok: false, status: 401, text: async () => "Unauthorized" });
    assert.equal((await placeOrder([{ id: prodId, size: "800 × 2000", qty: 1 }])).status, 200);
    // muvaffaqiyatli yuborish
    let body = null;
    global.fetch = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200 }; };
    assert.equal((await placeOrder([{ id: prodId, size: "800 × 2000", qty: 2 }])).status, 200);
    assert.equal(body.chat_id, "-100999");
    assert.match(body.text, /Yangi buyurtma YD-/); assert.match(body.text, /Audit Eshik/); assert.match(body.text, /2 000 000/);
    // admin "o'chirish" sozlamasi
    await reauth(sa);
    await call("PUT", "/api/admin/settings", { body: { telegram_enabled: false }, ...A(sa) });
    calls = 0; global.fetch = async () => { calls++; return { ok: true, status: 200 }; };
    assert.equal((await placeOrder([{ id: prodId, size: "800 × 2000", qty: 1 }])).status, 200);
    assert.equal(calls, 0, "o'chirilgan bo'lsa xabar yuborilmaydi");
    await call("PUT", "/api/admin/settings", { body: { telegram_enabled: true }, ...A(sa) });
  } finally {
    global.fetch = realFetch; console.error = realErr; console.log = realLog;
    process.env.ORDER_DRY_RUN = "true"; delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;
  }
  assert.ok(!logs.join("\n").includes("SECRET-TOKEN-VALUE"), "token logga yozilmasligi kerak");
  const audit = await call("GET", "/api/admin/audit", A(sa));
  assert.ok(!JSON.stringify(audit.json).includes("SECRET-TOKEN-VALUE"));
});

/* ---------- Statistika qoidalari ---------- */
test("dashboard: savdo faqat to'langan va bekor qilinmagan buyurtmalardan; to'lanmagan alohida ko'rsatiladi", async () => {
  // yangi toza holat uchun alohida mahsulot
  const p = await call("POST", "/api/admin/products", { body: { name: "Statistika Eshigi", price: 1000000, stock: 100, sizes: ["800 × 2000"] }, ...A(mgr) });
  const pid = p.json.item.id;
  const mk = async (qty) => {
    const r = await placeOrder([{ id: pid, size: "800 × 2000", qty }]);
    const l = await call("GET", "/api/admin/orders?q=" + r.json.orderId, A(op));
    return l.json.items[0].id;
  };
  const patch = (id, body) => call("PATCH", "/api/admin/orders/" + id, { body, ...A(sa) });
  const base = (await call("GET", "/api/admin/dashboard", A(sa))).json.stats;

  const o1 = await mk(1); await patch(o1, { status: "accepted", payment_status: "paid" });      // hisobga kiradi: 1 000 000
  const o2 = await mk(2); await patch(o2, { status: "completed", payment_status: "paid" });     // hisobga kiradi: 2 000 000
  const o3 = await mk(3); await patch(o3, { status: "accepted" });                              // to'lanmagan → savdoga kirmaydi
  const o4 = await mk(4); await patch(o4, { payment_status: "paid" });                          // to'langan, lekin hali "new" → kirmaydi? (qoidaga qarang)
  const o5 = await mk(5); await patch(o5, { status: "accepted", payment_status: "paid" }); await reauth(sa); await patch(o5, { status: "cancelled" }); // bekor → kirmaydi
  const o6 = await mk(6); await patch(o6, { status: "accepted", payment_status: "paid" }); await patch(o6, { payment_status: "refunded" });      // qaytarilgan → kirmaydi

  const d = (await call("GET", "/api/admin/dashboard?range=week", A(sa))).json;
  const s = d.stats;
  // Qoida: savdo = to'langan (paid) va bekor qilinmagan buyurtmalar yig'indisi
  assert.equal(s.revenue - base.revenue, 1000000 + 2000000 + 4000000, "o1 + o2 + o4 (to'langan, bekor qilinmagan)");
  assert.equal(s.pending_amount - base.pending_amount, 3000000, "o3 — to'lanmagan, bekor qilinmagan");
  assert.equal(s.total_orders - base.total_orders, 6);
  assert.equal(d.chart.reduce((a, x) => a + x.revenue, 0), s.revenue, "grafik yig'indisi statistika bilan bir xil");
  assert.equal(d.by_status.reduce((a, x) => a + x.count, 0), s.total_orders);
  // Eng ko'p sotilganlar: faqat qabul qilingan va undan keyingi (bekor/yangi emas) buyurtmalardan
  const top = d.top_products.find(x => x.product_id === pid);
  assert.equal(top.qty, 1 + 2 + 3 + 6, "o1,o2,o3,o6 (o4 'yangi', o5 bekor)");
  // O'rtacha chek = savdo / to'langan buyurtmalar soni
  assert.equal(s.avg_order, Math.round(s.revenue / s.paid_orders));
});

test("mijoz xarid summasi bekor qilingan va to'lanmagan buyurtmalarni qo'shmaydi", async () => {
  const list = await call("GET", "/api/admin/customers?q=911112233", A(op));
  const c = list.json.items[0];
  const orders = (await call("GET", "/api/admin/orders?customer=" + c.id + "&limit=100", A(op))).json.items;
  const expected = orders.filter(o => o.status !== "cancelled" && o.payment_status === "paid").reduce((a, o) => a + o.total, 0);
  assert.equal(c.total_spent, expected);
  const detail = await call("GET", "/api/admin/customers/" + c.id, A(op));
  assert.equal(detail.json.item.total_spent, expected);
});

/* ---------- Rollar va sessiyalar darhol kuchga kiradi ---------- */
test("rol pasaytirilsa yoki foydalanuvchi o'chirilsa, mavjud sessiya darhol ta'sirlanadi", async () => {
  await mkUser("temp1", "manager");
  const s = await login("temp1", "10.3.3.3");
  assert.equal((await call("POST", "/api/admin/categories", { body: { name: "Temp kategoriya" }, ...A(s) })).status, 201);
  await reauth(sa);
  const users = (await call("GET", "/api/admin/users", A(sa))).json.items;
  const u = users.find(x => x.username === "temp1");
  assert.equal((await call("PUT", "/api/admin/users/" + u.id, { body: { role: "operator" }, ...A(sa) })).status, 200);
  assert.equal((await call("GET", "/api/admin/auth/me", { cookie: s.cookie })).status, 401, "rol o'zgarganda sessiyalar tugatiladi");
  const s2 = await login("temp1", "10.3.3.4");
  assert.equal((await call("POST", "/api/admin/categories", { body: { name: "Yana" }, ...A(s2) })).status, 403);
});

test("parol o'zgartirilganda boshqa sessiyalar bekor qilinadi", async () => {
  await mkUser("temp2", "operator");
  const s = await login("temp2", "10.3.3.5");
  await reauth(sa);
  const u = (await call("GET", "/api/admin/users", A(sa))).json.items.find(x => x.username === "temp2");
  assert.equal((await call("POST", `/api/admin/users/${u.id}/password`, { body: { password: "YangiParol123" }, ...A(sa) })).status, 200);
  assert.equal((await call("GET", "/api/admin/auth/me", { cookie: s.cookie })).status, 401);
  assert.equal((await call("POST", "/api/admin/auth/login", { body: { username: "temp2", password: "Parol12345" }, ip: "10.3.3.6" })).status, 401);
  assert.equal((await call("POST", "/api/admin/auth/login", { body: { username: "temp2", password: "YangiParol123" }, ip: "10.3.3.7" })).status, 200);
});

/* ---------- Javob sarlavhalari va ma'lumot sizishi ---------- */
test("API javoblarida xavfsizlik sarlavhalari bor; ichki xato matni sizib chiqmaydi", async () => {
  const r = await call("GET", "/api/admin/dashboard", A(sa));
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(r.headers["cache-control"], "no-store");
  const e = await call("GET", "/api/admin/orders/zzz", A(sa));
  assert.ok(!/SQLITE|at .*\.js|stack|node_modules/i.test(String(e.raw)));
  const pub = await call("GET", "/api/catalog");
  assert.ok(!JSON.stringify(pub.json).match(/password|hash|scrypt|csrf|token/i));
});

test("o'chirilgan mahsulot buyurtmalar, ombor tarixi va katalogni buzmaydi", async () => {
  const p = await call("POST", "/api/admin/products", { body: { name: "Vaqtinchalik", price: 1500000, stock: 10, sizes: ["800 × 2000"] }, ...A(mgr) });
  const pid = p.json.item.id;
  const r = await placeOrder([{ id: pid, size: "800 × 2000", qty: 2 }]);
  const o = (await call("GET", "/api/admin/orders?q=" + r.json.orderId, A(op))).json.items[0];
  assert.equal((await call("PATCH", "/api/admin/orders/" + o.id, { body: { status: "accepted" }, ...A(op) })).status, 200);
  await reauth(mgr);
  assert.equal((await call("DELETE", "/api/admin/products/" + pid, A(mgr))).status, 200);
  // buyurtma bekor qilinsa — o'chirilgan mahsulot uchun ombor qaytarilmaydi, lekin xato ham bermaydi
  await reauth(op);
  assert.equal((await call("PATCH", "/api/admin/orders/" + o.id, { body: { status: "cancelled" }, ...A(op) })).status, 200);
  const detail = await call("GET", "/api/admin/orders/" + o.id, A(op));
  assert.equal(detail.json.item.items[0].name, "Vaqtinchalik");
  assert.equal((await call("GET", "/api/catalog")).status, 200);
  assert.equal((await call("GET", "/api/admin/inventory/movements?product=" + pid, A(op))).status, 200);
});
