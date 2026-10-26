/**
 * Fonsiz (shaffof PNG) eshik rasmlari: haqiqiy alfa kanal, katalog manzillari va bazadagi eski yo'llarning yangilanishi.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const IDS = require("../public/assets/js/products.js").PRODUCTS.filter(p => /\/doors\/photo\//.test(p.image)).map(p => p.id);   // barcha foto mahsulotlar

/** Minimal PNG dekoder (8-bit RGBA, interlace yo'q): alfa kanalni qaytaradi */
function pngAlpha(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.slice(1, 4).toString(), "PNG", file);
  let p = 8, w = 0, h = 0, type = 0, depth = 0, il = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), t = b.slice(p + 4, p + 8).toString(), d = b.slice(p + 8, p + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; il = d[12]; }
    if (t === "IDAT") idat.push(d);
    p += 12 + len;
  }
  assert.equal(depth, 8); assert.equal(type, 6, "RGBA (alfa kanalli) PNG bo'lishi kerak"); assert.equal(il, 0);
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
      px[y * stride + x] = v & 255;
    }
  }
  const alpha = (x, y) => px[y * stride + x * bpp + 3];
  return { w, h, alpha };
}

test("barcha foto rasmlar: haqiqiy shaffoflik (burchaklar shaffof, obyekt noshaffof, yumshoq qirra)", () => {
  for (const id of IDS) {
    const f = path.join(ROOT, "public/assets/img/doors/photo", id + ".png");
    assert.ok(fs.existsSync(f), id);
    const { w, h, alpha } = pngAlpha(f);
    assert.ok(w >= 400 && h >= 850, id + " sifat (o'lcham) saqlangan: " + w + "×" + h);   // fotodagi obyekt hajmi (kattalashtirilmaydi)
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(alpha(x, y), 0, id + " burchak shaffof");
    let transparent = 0, opaque = 0, semi = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const a = alpha(x, y); if (a < 8) transparent++; else if (a > 247) opaque++; else semi++; }
    const n = transparent + opaque + semi;
    assert.ok(transparent / n > 0.03 && transparent / n < 0.4, id + " fon shaffof: " + (transparent / n).toFixed(2));
    assert.ok(opaque / n > 0.55, id + " obyekt noshaffof: " + (opaque / n).toFixed(2));
    assert.ok(semi / n > 0.001 && semi / n < 0.06, id + " qirra anti-alias: " + (semi / n).toFixed(3));
    assert.ok(alpha(w >> 1, h >> 1) === 255, id + " markaz (eshik) to'liq noshaffof");
  }
});

test("asl fotosuratlar zaxirada, statik katalog yangi rasmlarga ishora qiladi va barcha fayllar mavjud", () => {
  const origs = fs.readdirSync(path.join(ROOT, "design-src/door-photos/original")).map(f => f.replace(/\.jpg$/, "").split("+"));   // bitta fotodan ikki eshik: "a+b.jpg"
  for (const id of IDS) assert.ok(origs.some(g => g.includes(id)), id + " asl nusxasi");
  const { PRODUCTS } = require("../public/assets/js/products.js");
  for (const id of IDS) assert.equal(PRODUCTS.find(p => p.id === id).image, "assets/img/doors/photo/" + id + ".png");
  for (const p of PRODUCTS) assert.ok(fs.existsSync(path.join(ROOT, "public", p.image)), p.id + " rasmi topilmadi: " + p.image);
  // Eski SVG illyustratsiyalar o'chirilmagan (zaxira)
  for (const id of ["classic-royal", "vetro-bianco", "neo-arka", "sand-duo", "grey-stripe"]) assert.ok(fs.existsSync(path.join(ROOT, "public/assets/img/doors", id + ".svg")), id + ".svg saqlangan");
  // statik sahifalardagi rasmlar mavjud
  for (const f of ["index.html", "about.html"]) {
    const html = fs.readFileSync(path.join(ROOT, "public", f), "utf8");
    for (const m of html.matchAll(/src="(\/assets\/img\/[^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, "public", m[1])), f + ": " + m[1]);
  }
});

test("baza: eski SVG yo'li yangi PNG ga almashadi, admin qo'ygan boshqa rasm saqlanadi", async () => {
  const dbFile = path.join(os.tmpdir(), `yd-img-${process.pid}-${Date.now()}.db`);
  process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
  delete require.cache[require.resolve("../lib/db")];
  const db = require("../lib/db");
  await db.init();
  const t = new Date().toISOString();
  const ins = (name, img) => db.run("INSERT INTO products (name, price, sizes, image, active, created_at, updated_at) VALUES (?,?,?,?,1,?,?)", [name, 1000, '["800 × 2000"]', img, t, t]);
  await ins("Eski", "assets/img/doors/classic-royal.svg"); await ins("Admin rasmi", "/api/image/7"); await ins("Slash", "/assets/img/doors/neo-arka.svg");
  // qayta ishga tushirish (cold start) — migratsiya qayta bajariladi
  delete require.cache[require.resolve("../lib/db")];
  const db2 = require("../lib/db"); await db2.init();
  const rows = await db2.all("SELECT name, image FROM products ORDER BY id");
  assert.equal(rows.find(r => r.name === "Eski").image, "assets/img/doors/photo/classic-royal.png");
  assert.equal(rows.find(r => r.name === "Slash").image, "assets/img/doors/photo/neo-arka.png");
  assert.equal(rows.find(r => r.name === "Admin rasmi").image, "/api/image/7");
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});

test("yangi 3 ta mahsulot statik katalogda: nom, narx, rasm; takroriy fotolar qo'shilmagan", () => {
  const { PRODUCTS } = require("../public/assets/js/products.js");
  for (const [id, name] of [["bianco-gold", "Bianco Gold"], ["crema-classic", "Crema Classic"], ["vetro-grande", "Vetro Grande"]]) {
    const p = PRODUCTS.find(x => x.id === id);
    assert.ok(p && p.name === name && p.price > 0 && p.sizes.length >= 1 && p.short.length > 10 && p.description.length > 30, id);
  }
  assert.equal(new Set(PRODUCTS.map(p => p.id)).size, PRODUCTS.length, "id'lar takrorlanmaydi");
  assert.equal(new Set(PRODUCTS.map(p => p.image)).size, PRODUCTS.length, "bitta rasm ikki mahsulotda ishlatilmagan");
  const crypto = require("crypto");
  const hashes = fs.readdirSync(path.join(ROOT, "design-src/door-photos/original")).map(f => crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, "design-src/door-photos/original", f))).digest("hex"));
  assert.equal(new Set(hashes).size, hashes.length, "asl fotolar orasida takror yo'q");
});

test("baza: yangi 3 mahsulot bir marta qo'shiladi (bo'sh bazada emas), o'chirilsa qaytmaydi; eski matn faqat o'zgartirilmagan bo'lsa yangilanadi", async () => {
  const dbFile = path.join(os.tmpdir(), `yd-photo-${process.pid}-${Date.now()}.db`);
  process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
  const fresh = () => { for (const k of Object.keys(require.cache)) if (/[\\/]lib[\\/](db|photo-catalog)\.js$/.test(k)) delete require.cache[k]; return require("../lib/db"); };
  let db = fresh(); await db.init();
  assert.equal(Number((await db.get("SELECT COUNT(*) AS n FROM products")).n), 0, "bo'sh bazaga qo'shilmaydi (statik katalog ishlaydi)");
  const t = new Date().toISOString();
  const ins = (id, name, short, img) => db.run("INSERT INTO products (id, name, short, description, price, color, style, sizes, image, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)", [id, name, short, "eski tavsif", 1000, "oq", "klassik", '["800 × 2000"]', img, t, t]);
  await ins("classic-royal", "Classic Royal", "Oq rangli, to‘rt panelli klassik eshik. Oltin rangli tutqich bilan.", "assets/img/doors/classic-royal.svg");
  await ins("neo-arka", "Neo Arka", "Admin o'zgartirgan matn", "assets/img/doors/neo-arka.svg");
  db = fresh(); await db.init();   // cold start
  const ids = (await db.all("SELECT id FROM products")).map(r => r.id);
  for (const id of ["bianco-gold", "crema-classic", "vetro-grande"]) assert.ok(ids.includes(id), id + " qo'shildi");
  const cr = await db.get("SELECT short, image FROM products WHERE id = 'classic-royal'");
  assert.match(cr.short, /ikki panelli/); assert.equal(cr.image, "assets/img/doors/photo/classic-royal.png");
  assert.equal((await db.get("SELECT short FROM products WHERE id = 'neo-arka'")).short, "Admin o'zgartirgan matn", "admin matni saqlandi");
  await db.run("DELETE FROM products WHERE id = 'bianco-gold'");
  db = fresh(); await db.init();
  assert.equal((await db.all("SELECT id FROM products WHERE id = 'bianco-gold'")).length, 0, "admin o'chirgan mahsulot qaytmaydi");
  assert.equal((await db.all("SELECT id FROM products WHERE id IN ('crema-classic','vetro-grande')")).length, 2);
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});

test("konstruktor foto rejimi: har bir foto eshikning kichik rasmi, havolasi va o'xshash 3D modeli bor", () => {
  const fs2 = require("fs"), path2 = require("path");
  const js = fs2.readFileSync(path2.join(ROOT, "public/assets/js/configurator-photo.js"), "utf8");
  const html = fs2.readFileSync(path2.join(ROOT, "public/configurator.html"), "utf8");
  const C = require(path2.join(ROOT, "public/assets/js/configurator-data.js"));
  assert.doesNotThrow(() => new (require("vm").Script)(js, { filename: "configurator-photo.js" }), "configurator-photo.js sintaksisi to'g'ri");
  assert.match(html, /configurator-photo\.js/);
  assert.match(html, /2D foto ko‘rinish — 3D model emas/, "2D belgisi yozilgan");
  const photo = require(path2.join(ROOT, "public/assets/js/products.js")).PRODUCTS.filter(p => /\/doors\/photo\//.test(p.image));
  assert.equal(photo.length, 19);
  for (const p of photo) {
    const th = path2.join(ROOT, "public", p.image.replace("/doors/photo/", "/doors/photo/thumb/"));
    assert.ok(fs2.existsSync(th), p.id + " kichik rasmi bor");
    assert.ok(fs2.statSync(th).size < 160 * 1024, p.id + " kichik rasmi yengil");
    const m = new RegExp('"' + p.id + '":\\s*\\{\\s*model:\\s*"(\\w+)",\\s*variant:\\s*"(\\w+)"').exec(js);
    assert.ok(m, p.id + " uchun o'xshash 3D model ko'rsatilgan");
    assert.ok(C.MODELS[m[1]] && C.MODELS[m[1]].variants[m[2]], p.id + ": o'xshash model/variant mavjud konstruktorda");
  }
});

test("baza: namunaviy (svg) eshiklar bir marta o'chadi; foto va o'zi rasm yuklagan mahsulotlar qoladi; bir martalik", async () => {
  const dbFile = path.join(os.tmpdir(), `yd-clean-${process.pid}-${Date.now()}.db`);
  process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
  const fresh = () => { for (const k of Object.keys(require.cache)) if (/[\\/]lib[\\/](db|photo-catalog)\.js$/.test(k)) delete require.cache[k]; return require("../lib/db"); };
  let db = fresh(); await db.init();
  const t = new Date().toISOString();
  const ins = (id, img) => db.run("INSERT INTO products (id, name, short, description, price, color, style, sizes, image, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)", [id, id, "x", "x", 1000, "oq", "klassik", '["800 × 2000"]', img, t, t]);
  await ins("sample-a", "assets/img/doors/yd-kls-001.svg");
  await ins("sample-b", "assets/img/doors/linea-grafit.svg");
  await ins("custom", "uploads/own-door.jpg");
  const left = async () => (await db.all("SELECT id FROM products ORDER BY id")).map(r => r.id);
  db = fresh(); await db.init();   // cold start: foto mahsulotlar qo'shiladi, namunaviy svg'lar o'chadi
  const after = await left();
  assert.ok(after.includes("custom") && after.includes("bianco-gold"), "o'z rasmli va foto mahsulotlar qoldi");
  assert.ok(!after.includes("sample-a") && !after.includes("sample-b"), "namunaviy svg mahsulotlar o'chdi");
  await ins("sample-c", "assets/img/doors/yd-min-002.svg");
  db = fresh(); await db.init();
  assert.ok((await left()).includes("sample-c"), "tozalash bir martalik: keyin qo'shilganlar tegilmaydi");
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});
