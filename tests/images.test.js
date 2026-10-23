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
const IDS = ["classic-royal", "vetro-bianco", "neo-arka", "sand-duo", "grey-stripe"];

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

test("5 ta rasm: haqiqiy shaffoflik (burchaklar shaffof, obyekt noshaffof, yumshoq qirra)", () => {
  for (const id of IDS) {
    const f = path.join(ROOT, "public/assets/img/doors/photo", id + ".png");
    assert.ok(fs.existsSync(f), id);
    const { w, h, alpha } = pngAlpha(f);
    assert.ok(w >= 500 && h >= 1000, id + " sifat (o'lcham) saqlangan: " + w + "×" + h);
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) assert.equal(alpha(x, y), 0, id + " burchak shaffof");
    let transparent = 0, opaque = 0, semi = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const a = alpha(x, y); if (a < 8) transparent++; else if (a > 247) opaque++; else semi++; }
    const n = transparent + opaque + semi;
    assert.ok(transparent / n > 0.08 && transparent / n < 0.4, id + " fon shaffof: " + (transparent / n).toFixed(2));
    assert.ok(opaque / n > 0.55, id + " obyekt noshaffof: " + (opaque / n).toFixed(2));
    assert.ok(semi / n > 0.001 && semi / n < 0.06, id + " qirra anti-alias: " + (semi / n).toFixed(3));
    assert.ok(alpha(w >> 1, h >> 1) === 255, id + " markaz (eshik) to'liq noshaffof");
  }
});

test("asl fotosuratlar zaxirada, statik katalog yangi rasmlarga ishora qiladi va barcha fayllar mavjud", () => {
  for (const id of IDS) assert.ok(fs.existsSync(path.join(ROOT, "design-src/door-photos/original", id + ".jpg")), id + " asl nusxasi");
  const { PRODUCTS } = require("../public/assets/js/products.js");
  for (const id of IDS) assert.equal(PRODUCTS.find(p => p.id === id).image, "assets/img/doors/photo/" + id + ".png");
  for (const p of PRODUCTS) assert.ok(fs.existsSync(path.join(ROOT, "public", p.image)), p.id + " rasmi topilmadi: " + p.image);
  // Eski SVG illyustratsiyalar o'chirilmagan (zaxira)
  for (const id of IDS) assert.ok(fs.existsSync(path.join(ROOT, "public/assets/img/doors", id + ".svg")), id + ".svg saqlangan");
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
