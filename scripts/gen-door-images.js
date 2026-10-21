/**
 * 200 ta katalog mahsuloti uchun noyob eshik rasmlarini (SVG) yaratadi: public/assets/img/doors/<sku>.svg
 *   node scripts/gen-door-images.js          — yo'q fayllarni yaratadi
 *   node scripts/gen-door-images.js --force  — hammasini qayta yaratadi
 * Rasmlar deterministik (lib/door-art.js) — bir xil kirish bir xil rasm beradi.
 */
"use strict";
const fs = require("fs"), path = require("path");
const { buildCatalog } = require("../lib/catalog-seed");
const { renderDoor } = require("../lib/door-art");

const dir = path.join(__dirname, "..", "public", "assets", "img", "doors");
const force = process.argv.includes("--force");
let made = 0, kept = 0;
for (const s of buildCatalog()) {
  if (!s.design) continue;                          // avvalgi 10 ta mahsulot o'z rasmlarini saqlaydi
  const file = path.join(dir, path.basename(s.image));
  if (!force && fs.existsSync(file)) { kept++; continue; }
  fs.writeFileSync(file, renderDoor(s.design));
  made++;
}
console.log(`Rasmlar: ${made} ta yaratildi, ${kept} ta mavjud (jami 190 ta yangi mahsulot rasmi).`);
