/**
 * 200 ta MDF eshik katalogi: generator, idempotent seed, admin API (filtr, saralash, ommaviy amallar, CSV, tarix),
 * sayt katalogi, ombor/sotuv integratsiyasi va ruxsatlar. Vaqtinchalik baza ishlatiladi.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os"), path = require("path"), fs = require("fs");

const dbFile = path.join(os.tmpdir(), `yd-catalog-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
process.env.ORDER_DRY_RUN = "true";
delete process.env.VERCEL;

const db = require("../lib/db"), auth = require("../lib/auth"), store = require("../lib/store");
const { handle } = require("../lib/router");
const { buildCatalog, seedCatalog, CATEGORIES } = require("../lib/catalog-seed");
const rawCall = (method, url, { body, cookie, csrf, ip = "10.50.0.1" } = {}) => new Promise(resolve => {
  const req = { method, url, body, socket: { remoteAddress: ip }, headers: Object.assign({ host: "localhost" }, cookie ? { cookie } : {}, csrf ? { "x-csrf-token": csrf } : {}) };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(d) { let j = null; try { j = JSON.parse(d); } catch (e) { /* json emas */ } resolve({ status: this.statusCode, json: j, raw: d, headers: this.headers }); } };
  handle(req, res);
});
async function call(method, url, opts = {}) {
  if (method === "POST" && /^\/api\/(order|configurator\/order)$/.test(url) && !opts.cookie) { const c = await require("./_customer")(); opts = Object.assign({}, opts, { cookie: c.cookie, csrf: c.csrf }); }
  return rawCall(method, url, opts);
}
async function staff(username, role) {
  await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)", [username, username, role, auth.hashPassword("Parol12345x"), new Date().toISOString()]);
  const r = await call("POST", "/api/admin/auth/login", { body: { username, password: "Parol12345x" }, ip: "10.50." + Math.floor(Math.random() * 250) + ".1" });
  return { cookie: String(r.headers["set-cookie"]).split(";")[0], csrf: r.json.csrf };
}
const A = s => ({ cookie: s.cookie, csrf: s.csrf });
const reauth = s => rawCall("POST", "/api/admin/auth/reauth", Object.assign({ body: { password: "Parol12345x" } }, A(s)));
let sa, mgr, op;

test.before(async () => { await db.init(); sa = await staff("sa1", "super_admin"); mgr = await staff("mg1", "manager"); op = await staff("op1", "operator"); });
test.after(() => { for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } } });

test("generator: 200 ta noyob mahsulot, kategoriyalar taqsimoti, majburiy maydonlar, mantiqiy narxlar", () => {
  const specs = buildCatalog();
  assert.equal(specs.length, 200);
  const want = { MIN: 30, LUX: 25, KLS: 25, SHI: 25, YOG: 25, OQL: 20, TUQ: 20, GEO: 15, NOD: 15 };
  const got = {}; specs.forEach(s => { got[s.category] = (got[s.category] || 0) + 1; });
  assert.deepEqual(got, want);
  assert.equal(CATEGORIES.reduce((n, c) => n + c.count, 0), 200);
  for (const k of ["sku", "id", "name", "image"]) assert.equal(new Set(specs.map(s => s[k].toLowerCase())).size, 200, k + " noyob");
  const { COLORS, STYLES } = require("../public/assets/js/products.js");
  for (const s of specs) {
    for (const k of ["sku", "id", "name", "category", "style", "color", "finish", "material", "short", "description"]) assert.ok(String(s[k] || "").trim(), `${s.sku}: ${k} bo'sh`);
    assert.ok(COLORS[s.color] && STYLES[s.style], s.sku + " rang/uslub kaliti");
    assert.ok(s.price >= 1000000 && s.price <= 7000000, s.sku + " narx " + s.price);
    if (s.old_price) assert.ok(s.old_price > s.price, s.sku + " eski narx");
    assert.ok(Array.isArray(s.sizes) && s.sizes.length >= 3);
    assert.ok(s.stock >= 0);
    assert.match(s.sku, /^YD-[A-Z]{3}-\d{3}$/);
  }
  assert.equal(specs.filter(s => !s.active).length, 8);
  // noyob dizaynlar (rasm parametrlari) va rasm fayllari mavjud
  const designs = specs.filter(s => s.design);
  assert.equal(new Set(designs.map(s => JSON.stringify(s.design))).size, designs.length);
  for (const s of specs) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", s.image)), s.image + " fayli yo'q");
  // rasm fayllari bir-biridan farq qiladi (xesh bo'yicha)
  const hashes = new Set(specs.map(s => require("crypto").createHash("md5").update(fs.readFileSync(path.join(__dirname, "..", "public", s.image))).digest("hex")));
  assert.equal(hashes.size, 200, "200 ta noyob rasm");
});

test("seed: avvalgi namunaviy mahsulot bog'lanadi, 200 ta, qayta ishga tushirilsa dublikat yo'q", async () => {
  // Avvalgi import qilingan namunaviy mahsulot (SKU'siz) — admin tahrir qilgan narx saqlanishi kerak
  await store.createProduct({ name: "Classic Royal", price: 2999000, stock: 3, sizes: ["800 × 2000"], active: true, image: "assets/img/doors/classic-royal.svg" }, { id: 1, username: "t" });
  const first = await seedCatalog(db, { id: 1, username: "sa1" });
  assert.equal(first.linked, 1);
  assert.equal(first.inserted, 199);
  const total = async () => Number((await db.get("SELECT COUNT(*) AS n FROM products")).n);
  assert.equal(await total(), 200);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM categories")).n), 9);
  assert.equal(Number((await db.get("SELECT COUNT(DISTINCT sku) AS n FROM products")).n), 200);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products WHERE sku IS NULL OR sku = '' OR name = '' OR image = '' OR category_id IS NULL OR finish IS NULL OR finish = ''")).n), 0);
  const cr = await db.get("SELECT price, sku, category_id FROM products WHERE name = 'Classic Royal'");
  assert.equal(Number(cr.price), 2999000, "tahrirlangan narx saqlandi"); assert.match(cr.sku, /^YD-KLS-/); assert.ok(cr.category_id);
  const second = await seedCatalog(db, { id: 1, username: "sa1" });
  assert.equal(second.inserted, 0); assert.equal(second.skipped + second.linked, 200);
  assert.equal(await total(), 200);
});

test("namunaviy eshiklarni o'chirish: faqat seed, asl va qo'lda qo'shilgan mahsulotlar saqlanadi, dryRun hech narsa o'chirmaydi", async () => {
  const { removeSeedProducts } = require("../lib/catalog-seed");
  const total = async () => Number((await db.get("SELECT COUNT(*) AS n FROM products")).n);
  const before = await total();
  await store.createProduct({ name: "Qo'lda qo'shilgan eshik", price: 1500000, stock: 1, sizes: ["800 × 2000"], active: true, image: "assets/img/doors/classic-royal.svg" }, { id: 1, username: "t" });
  const dry = await removeSeedProducts(db, store, { dryRun: true });
  assert.equal(dry.found, 190); assert.equal(await total(), before + 1, "dryRun hech narsa o'chirmadi");
  const r = await removeSeedProducts(db, store, {});
  assert.equal(r.deleted.length, 190); assert.equal(r.blocked.length, 0);
  assert.equal(await total(), 11, "10 ta asl + 1 ta qo'lda qo'shilgan qoldi");
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM products WHERE name = 'Qo''lda qo''shilgan eshik'")).n, 1);
  assert.equal((await removeSeedProducts(db, store, {})).found, 0, "qayta bajarilsa hech narsa topilmaydi");
  await db.run("DELETE FROM products WHERE name = 'Qo''lda qo''shilgan eshik'");
  await seedCatalog(db, { id: 1, username: "sa1" });       // keyingi testlar uchun katalog tiklanadi
  assert.equal(await total(), 200);
});

test("admin API: ro'yxat, kategoriya/rang/narx filtrlari, saralash va qidiruv (SKU bo'yicha ham)", async () => {
  const all = await rawCall("GET", "/api/admin/products", A(sa));
  assert.equal(all.json.items.length, 200);
  const cats = (await rawCall("GET", "/api/admin/categories", A(sa))).json.items;
  const lux = cats.find(c => c.name === "Premium va luxury");
  const l = await rawCall("GET", `/api/admin/products?category=${lux.id}`, A(sa));
  assert.equal(l.json.items.length, 25); assert.ok(l.json.items.every(p => p.category_name === "Premium va luxury"));
  const dark = await rawCall("GET", "/api/admin/products?color=qora", A(sa));
  assert.ok(dark.json.items.length > 5 && dark.json.items.every(p => p.color === "qora"));
  const rng = await rawCall("GET", "/api/admin/products?price_min=2000000&price_max=2500000&sort=price_asc", A(sa));
  const ps = rng.json.items.map(p => p.price);
  assert.ok(ps.length > 10 && ps.every(v => v >= 2000000 && v <= 2500000) && ps.every((v, i) => !i || v >= ps[i - 1]));
  const sku = all.json.items[17].sku;
  assert.equal((await rawCall("GET", `/api/admin/products?q=${sku}`, A(sa))).json.items.length, 1);
  assert.equal((await rawCall("GET", "/api/admin/products?sort=1;DROP TABLE products", A(sa))).status, 200);
  assert.equal((await rawCall("GET", "/api/admin/products?color=yoq", A(sa))).json.items.length, 0);
  assert.ok((await rawCall("GET", "/api/admin/products?badge=discount", A(sa))).json.items.every(p => p.old_price > p.price));
  const d = all.json.items[0];
  assert.ok("sku" in d && "finish" in d && "views" in d && "sold" in d && d.created_at);
});

test("sayt katalogi: faqat faol mahsulotlar, SKU/tekstura/kategoriya bilan; qidiruv ishlaydi", async () => {
  const c = await rawCall("GET", "/api/catalog");
  assert.equal(c.json.source, "db");
  assert.equal(c.json.products.length, 192);
  const p = c.json.products.find(x => x.sku);
  assert.ok(p.sku && p.category && p.specs["Mahsulot kodi"] === p.sku && p.specs["Tekstura"]);
  assert.ok(c.json.products.every(x => x.image && !/^\//.test(x.image)));
});

test("ko'rishlar hisoblagichi: bir IP uchun 30 daqiqada bir marta; faol bo'lmagan mahsulot sanalmaydi", async () => {
  const one = (await rawCall("GET", "/api/admin/products?active=1", A(sa))).json.items[0];
  const hit = ip => rawCall("POST", "/api/catalog/view", { body: { id: one.id }, ip });
  await hit("10.60.0.1"); await hit("10.60.0.1"); await hit("10.60.0.2");
  assert.equal(Number((await db.get("SELECT views FROM products WHERE id = ?", [one.id])).views), 2);
  const hidden = (await rawCall("GET", "/api/admin/products?active=0", A(sa))).json.items[0];
  await rawCall("POST", "/api/catalog/view", { body: { id: hidden.id }, ip: "10.60.0.3" });
  assert.equal(Number((await db.get("SELECT views FROM products WHERE id = ?", [hidden.id])).views), 0);
  assert.equal((await rawCall("POST", "/api/catalog/view", { body: { id: "x'; DROP TABLE products;--" }, ip: "10.60.0.4" })).status, 200);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products")).n), 200);
});

test("ombor va sotuvlar: buyurtma tasdiqlanganda qoldiq kamayadi, sotuvlar soni oshadi", async () => {
  const p = (await rawCall("GET", "/api/admin/products?active=1&stock=in", A(sa))).json.items.find(x => x.stock >= 5);
  const o = await call("POST", "/api/order", { body: { customer: { name: "Test Mijoz", phone: "+998 90 111 22 33", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: p.id, size: p.sizes[0], qty: 2 }] }, ip: "10.61.0.1" });
  assert.equal(o.status, 200);
  assert.equal(o.json.total, p.price * 2, "narx serverda");
  assert.equal(Number((await db.get("SELECT stock FROM products WHERE id = ?", [p.id])).stock), p.stock, "Yangi buyurtmada qoldiq o'zgarmaydi");
  const orderId = (await rawCall("GET", "/api/admin/orders", A(sa))).json.items.find(x => x.number === o.json.orderId).id;
  assert.equal((await rawCall("PATCH", `/api/admin/orders/${orderId}`, Object.assign({ body: { status: "accepted" } }, A(sa)))).status, 200);
  const after = (await rawCall("GET", `/api/admin/products/${p.id}`, A(sa))).json.item;
  assert.equal(after.stock, p.stock - 2); assert.equal(after.sold, 2);
  const sorted = await rawCall("GET", "/api/admin/products?sort=sold", A(sa));
  assert.equal(sorted.json.items[0].id, p.id);
  // omborda yetarli bo'lmagan mahsulot (0) ga buyurtma berish mumkin, lekin tasdiqlash rad etiladi — hech narsa o'zgarmaydi
  const zero = (await rawCall("GET", "/api/admin/products?active=1&stock=out", A(sa))).json.items[0];
  const o2 = await call("POST", "/api/order", { body: { customer: { name: "Test Mijoz", phone: "+998 90 111 22 33", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: zero.id, size: zero.sizes[0], qty: 1 }] }, ip: "10.61.0.2" });
  const id2 = (await rawCall("GET", "/api/admin/orders", A(sa))).json.items.find(x => x.number === o2.json.orderId).id;
  assert.equal((await rawCall("PATCH", `/api/admin/orders/${id2}`, Object.assign({ body: { status: "accepted" } }, A(sa)))).status, 409);
});

test("admin: mahsulot qo'shish (SKU), takroriy SKU 409, tahrirlash, tarix", async () => {
  const c = await rawCall("POST", "/api/admin/products", Object.assign({ body: { name: "Test Eshik Alfa", price: 2100000, old_price: 2400000, stock: 7, sku: "yd-test-001", finish: "Mat lak", color: "oq", style: "minimalistik", sizes: ["800 × 2000"], material: "MDF", short: "q", description: "d" } }, A(sa)));
  assert.equal(c.status, 201); assert.equal(c.json.item.sku, "YD-TEST-001"); assert.equal(c.json.item.finish, "Mat lak");
  const dup = await rawCall("POST", "/api/admin/products", Object.assign({ body: { name: "Test Eshik Beta", price: 2100000, sku: "YD-TEST-001" } }, A(sa)));
  assert.equal(dup.status, 409); assert.equal(dup.json.field, "sku");
  const bad = await rawCall("POST", "/api/admin/products", Object.assign({ body: { name: "X", price: 100, sku: "a b!" } }, A(sa)));
  assert.equal(bad.status, 400);
  const id = c.json.item.id;
  const u = await rawCall("PUT", `/api/admin/products/${id}`, Object.assign({ body: { price: 1990000, active: false, finish: "Soft-touch" } }, A(sa)));
  assert.equal(u.status, 200);
  const h = await rawCall("GET", `/api/admin/products/${id}/history`, A(sa));
  assert.ok(h.json.audits.some(a => a.action === "product.update" && a.detail.price && a.detail.price[1] === 1990000));
  assert.ok(h.json.audits.some(a => a.action === "product.create"));
  assert.ok(h.json.moves.some(m => m.delta === 7));
  assert.equal((await rawCall("GET", "/api/admin/products/yoq-mahsulot/history", A(sa))).status, 404);
});

test("ommaviy amallar: kategoriya, rang, narx foizi, chegirma; tarixga yoziladi", async () => {
  const items = (await rawCall("GET", "/api/admin/products?category=" + (await rawCall("GET", "/api/admin/categories", A(sa))).json.items.find(c => c.name === "Geometrik naqshli").id, A(sa))).json.items.slice(0, 3);
  const ids = items.map(i => i.id);
  const bulk = (action, value) => rawCall("POST", "/api/admin/products/bulk", Object.assign({ body: { action, ids, value } }, A(sa)));
  const nod = (await rawCall("GET", "/api/admin/categories", A(sa))).json.items.find(c => c.name === "Noodatiy dizaynli");
  assert.equal((await bulk("set_category", nod.id)).json.changed, 3);
  assert.equal((await bulk("set_category", 99999)).status, 400);
  assert.equal((await bulk("set_color", "yoq")).status, 400);
  assert.equal((await bulk("set_color", "qora")).json.changed, 3);
  const p0 = items[0].price;
  assert.equal((await bulk("price_percent", 10)).json.changed, 3);
  const after = (await rawCall("GET", `/api/admin/products/${ids[0]}`, A(sa))).json.item;
  assert.equal(after.category_name, "Noodatiy dizaynli"); assert.equal(after.color, "qora"); assert.equal(after.price, Math.round(p0 * 1.1 / 1000) * 1000);
  assert.equal((await bulk("price_percent", 500)).status, 400);
  assert.equal((await bulk("discount_percent", 20)).json.changed, 3);
  const disc = (await rawCall("GET", `/api/admin/products/${ids[0]}`, A(sa))).json.item;
  assert.ok(disc.old_price > disc.price); assert.ok(Math.abs(disc.price / disc.old_price - 0.8) < 0.01);
  assert.equal((await bulk("clear_discount")).json.changed, 3);
  assert.equal((await rawCall("GET", `/api/admin/products/${ids[0]}`, A(sa))).json.item.old_price, null);
  const h = await rawCall("GET", `/api/admin/products/${ids[0]}/history`, A(sa));
  assert.ok(h.json.audits.filter(a => a.action.startsWith("product.bulk.")).length >= 5);
  // O'chirish — parol tasdig'i va ruxsat talab qiladi
  assert.equal((await rawCall("POST", "/api/admin/products/bulk", Object.assign({ body: { action: "delete", ids: [ids[0]] } }, A(sa)))).json.code, "reauth_required");
});

test("CSV eksport/import: 200+ qator, BOM, formula injection himoyasi; xato bo'lsa hech narsa o'zgarmaydi", async () => {
  const ex = await rawCall("GET", "/api/admin/products/export", A(sa));
  assert.equal(ex.status, 200); assert.match(ex.headers["content-type"], /text\/csv/);
  const csv = String(ex.raw && ex.raw.toString ? ex.raw.toString("utf8") : ex.raw);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  assert.equal(lines.length, 1 + 201);                       // sarlavha + 200 + test mahsuloti
  assert.match(lines[0], /^sku,id,name,category/);
  await reauth(sa);
  const skuA = (await rawCall("GET", "/api/admin/products?sort=sku", A(sa))).json.items[0];
  const imp = csvText => rawCall("POST", "/api/admin/products/import", Object.assign({ body: { csv: csvText } }, A(sa)));
  // yangilash + yangi mahsulot yaratish
  const ok = await imp(`sku,name,price,stock,category,active\r\n${skuA.sku},${skuA.name},1777000,33,Klassik naqshli,1\r\nYD-CSV-001,CSV Eshik,2222000,4,Premium va luxury,1\r\n`);
  assert.equal(ok.status, 200); assert.equal(ok.json.updated, 1); assert.equal(ok.json.created, 1);
  const upd = (await rawCall("GET", `/api/admin/products/${skuA.id}`, A(sa))).json.item;
  assert.equal(upd.price, 1777000); assert.equal(upd.stock, 33); assert.equal(upd.category_name, "Klassik naqshli");
  assert.ok((await rawCall("GET", `/api/admin/products/${skuA.id}/history`, A(sa))).json.moves.some(m => m.note === "CSV import"));
  assert.equal((await rawCall("GET", "/api/admin/products?q=YD-CSV-001", A(sa))).json.items.length, 1);
  // xato: noma'lum kategoriya + manfiy narx → hech narsa yozilmaydi
  const before = Number((await db.get("SELECT COUNT(*) AS n FROM products")).n);
  const bad = await imp(`sku,name,price,category\r\nYD-CSV-002,A Eshik,1000000,Yo'q kategoriya\r\n${skuA.sku},${skuA.name},-5,\r\nYD-CSV-003,,1,\r\n`);
  assert.equal(bad.status, 422); assert.ok(bad.json.errors.length >= 3); assert.equal(bad.json.errors[0].line, 2);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products")).n), before);
  assert.equal((await rawCall("GET", `/api/admin/products/${skuA.id}`, A(sa))).json.item.price, 1777000);
  assert.equal((await imp("name,price\r\nX,1\r\n")).status, 400);                                 // sku ustuni yo'q
  // formula injection: "=" bilan boshlanadigan nom eksportda apostrof bilan chiqadi
  await rawCall("PUT", `/api/admin/products/${skuA.id}`, Object.assign({ body: { name: "=HYPERLINK(\"http://evil\")" } }, A(sa)));
  const ex2 = (await rawCall("GET", "/api/admin/products/export", A(sa))).raw.toString("utf8");
  assert.ok(ex2.includes("\"'=HYPERLINK") || ex2.includes("'=HYPERLINK"));
});

test("ruxsatlar: operator seed/import/tahrirlay olmaydi; mijoz va mehmon admin API'ga kira olmaydi; seed parol tasdig'ini talab qiladi", async () => {
  for (const [m, u, b] of [["POST", "/api/admin/products/seed-catalog", {}], ["POST", "/api/admin/products/import", { csv: "sku\r\nA" }], ["POST", "/api/admin/products", { name: "X", price: 1000 }], ["POST", "/api/admin/products/bulk", { action: "activate", ids: ["x"] }]]) {
    assert.equal((await rawCall(m, u, Object.assign({ body: b }, A(op)))).status, 403, u);
    assert.equal((await rawCall(m, u, { body: b })).status, 401, u + " (mehmon)");
  }
  assert.equal((await rawCall("GET", "/api/admin/products", A(op))).status, 200);                  // ko'rish mumkin
  const mg = await rawCall("POST", "/api/admin/products/seed-catalog", Object.assign({ body: {} }, A(mgr)));
  assert.equal(mg.json.code, "reauth_required");
  await rawCall("POST", "/api/admin/auth/reauth", Object.assign({ body: { password: "Parol12345x" } }, A(mgr)));
  const again = await rawCall("POST", "/api/admin/products/seed-catalog", Object.assign({ body: {} }, A(mgr)));
  assert.equal(again.status, 200); assert.equal(again.json.inserted, 0);                           // endpoint ham idempotent
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products WHERE sku LIKE 'YD-___-%' AND sku NOT LIKE 'YD-TEST%' AND sku NOT LIKE 'YD-CSV%'")).n), 200);
});
