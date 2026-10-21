/**
 * 200 ta namunaviy MDF eshikni bazaga qo'shadi (idempotent: SKU bo'yicha dublikat yaratilmaydi): `npm run seed:catalog`
 * Vercel/Turso uchun DATABASE_URL va DATABASE_AUTH_TOKEN ni shu buyruq bilan birga bering. Admin paneldagi
 * «Mahsulotlar → 200 ta namunaviy eshik» tugmasi ham xuddi shuni qiladi.
 */
"use strict";
const fs = require("fs"), path = require("path");
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const db = require("../lib/db");
const { seedCatalog } = require("../lib/catalog-seed");
(async () => {
  if (!db.isConfigured()) { console.error("DATABASE_URL sozlanmagan."); process.exit(1); }
  await db.init();
  const r = await seedCatalog(db, { id: null, username: "seed-cli" });
  console.log(`Katalog: ${r.inserted} ta yangi, ${r.linked} ta avvalgi mahsulot bog'landi, ${r.skipped} ta allaqachon mavjud (jami ${r.total} ta, ${r.categories} kategoriya).`);
  process.exit(0);
})().catch(e => { console.error("Xato:", String(e.message).slice(0, 200)); process.exit(1); });
