/**
 * Fonsiz (shaffof PNG) eshik rasmlari (zaxira) va bo‘sh katalog: statik ro‘yxat, baza tozalash.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const IDS = require("../design-src/catalog-backup/products-19-photo-doors.js").PRODUCTS.map(p => p.id);   // barcha foto mahsulotlar

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
    const f = path.join(ROOT, "public/assets/img/doors/photo/dark", id + ".png");
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

test("katalog bo'sh: statik ro'yxat 0 ta, 19 ta foto eshik zaxirasi saqlangan, rasm fayllari o'chirilmagan", () => {
  const { PRODUCTS, COLORS, STYLES } = require("../public/assets/js/products.js");
  assert.equal(PRODUCTS.length, 0, "saytdagi statik katalog bo'sh");
  assert.ok(Object.keys(COLORS).length && Object.keys(STYLES).length, "rang va uslub ro'yxatlari saqlangan");
  const backup = require("../design-src/catalog-backup/products-19-photo-doors.js").PRODUCTS;
  assert.equal(backup.length, 19, "oxirgi 19 ta foto eshik nusxasi zaxirada");
  for (const p of backup) {
    assert.ok(fs.existsSync(path.join(ROOT, "public", p.image)), p.id + " rasmi o'chirilmagan");
    assert.ok(fs.existsSync(path.join(ROOT, "design-src/door-photos/light-cutouts", p.id + ".png")), p.id + " asl kesmasi zaxirada");
  }
  for (const f of ["index.html", "about.html"]) assert.ok(!/doors\//.test(fs.readFileSync(path.join(ROOT, "public", f), "utf8")), f + ": eshik rasmlari qolmagan");
});

test("baza: barcha mahsulotlar (seed ham, foto ham) bir marta o'chadi; keyin qo'shilganlar tegilmaydi", async () => {
  const dbFile = path.join(os.tmpdir(), `yd-empty-${process.pid}-${Date.now()}.db`);
  process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
  const fresh = () => { for (const k of Object.keys(require.cache)) if (/[\\/]lib[\\/](db|photo-catalog)\.js$/.test(k)) delete require.cache[k]; return require("../lib/db"); };
  let db = fresh(); await db.init();
  const t = new Date().toISOString();
  const ins = (id, img) => db.run("INSERT INTO products (id, name, short, description, price, color, style, sizes, image, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)", [id, id, "x", "x", 1000, "oq", "klassik", '["800 × 2000"]', img, t, t]);
  const count = async () => Number((await db.get("SELECT COUNT(*) AS n FROM products")).n);
  await db.run("DELETE FROM settings WHERE k = 'catalog_emptied_v1'");
  await ins("seed-a", "assets/img/doors/yd-kls-001.svg"); await ins("foto-a", "assets/img/doors/photo/dark/classic-royal.png"); await ins("own", "uploads/own.jpg");
  db = fresh(); await db.init();
  assert.equal(await count(), 0, "hammasi o'chdi");
  await ins("new-1", "uploads/new.jpg");
  db = fresh(); await db.init();
  assert.equal(await count(), 1, "bayroqdan keyin qo'shilgan mahsulot tegilmadi");
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
});
