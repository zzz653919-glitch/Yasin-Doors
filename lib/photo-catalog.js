/**
 * Haqiqiy fotosuratli (fonsiz PNG) mahsulotlar uchun bazani bir martalik moslashtirish.
 *  1) 5 ta mavjud mahsulotning (Classic Royal, Vetro Bianco, Neo Arka, Sand Duo, Grey Stripe) eski matni foto bilan mos kelmasdi:
 *     faqat matn HALI O'ZGARTIRILMAGAN (aynan eski qiymat) bo'lsa yangilanadi; admin tahrir qilgan bo'lsa tegilmaydi.
 *  2) 3 ta yangi mahsulot (Bianco Gold, Crema Classic, Vetro Grande) bazaga bir marta qo'shiladi — faqat baza allaqachon mahsulotlar
 *     bilan to'ldirilgan bo'lsa (bo'sh baza statik katalogdan foydalanadi) va keyin admin o'chirsa qayta qo'shilmaydi (settings bayrog'i).
 */
"use strict";

const { PRODUCTS } = require("../public/assets/js/products.js");

const OLD = {
  "classic-royal": { short: "Oq rangli, to‘rt panelli klassik eshik. Oltin rangli tutqich bilan.", color: "oq" },
  "vetro-bianco": { short: "Oq eshik, gorizontal xira shisha qo‘shimchalari bilan.", color: "oq" },
  "neo-arka": { short: "Fil suyagi rangida, arkali panel va oltin chiziqli bezak.", color: "bej" },
  "sand-duo": { short: "Qum-bej rang, ikki vertikal panel — yumshoq klassika.", color: "bej" },
  "grey-stripe": { short: "Och kulrang, vertikal nozik frezalar bilan.", color: "kulrang" }
};
const EXTRA = { "bianco-gold": "Oq va och rangli", "crema-classic": "Klassik naqshli", "vetro-grande": "Shisha elementli" };
const FLAG = "photo_products_v1";

/**
 * Bir martalik tozalash (egasining talabi: faqat o'zining foto eshiklari qolsin): namunaviy (rasmi assets/img/doors/*.svg bo'lgan,
 * ya'ni seed/boshlang'ich illyustratsiyali) mahsulotlar o'chiriladi. Foto (PNG) mahsulotlar va admin o'zi rasm yuklab qo'shganlari tegilmaydi.
 * Xavfsizlik: bazada hech bo'lmasa bitta foto mahsulot bo'lmasa (katalog bo'sh qolmasin) va ochiq buyurtmadagi mahsulotlar o'chirilmaydi.
 */
const CLEAN_FLAG = "only_photo_catalog_v1";
async function cleanSamples(exec, t) {
  if ((await exec("SELECT v FROM settings WHERE k = ?", [CLEAN_FLAG])).rows.length) return;
  const keep = Number((await exec("SELECT COUNT(*) AS n FROM products WHERE image LIKE '%/doors/photo/%'")).rows[0].n);
  if (!keep) return;
  await exec(`DELETE FROM products WHERE image LIKE 'assets/img/doors/%.svg' AND image NOT LIKE '%/doors/photo/%'
    AND id NOT IN (SELECT DISTINCT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('new','accepted','preparing','delivering') AND oi.product_id IS NOT NULL)`);
  await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [CLEAN_FLAG, t]);
}

async function apply(db) {
  const exec = (sql, args) => db.execute({ sql, args: args || [] });
  const t = new Date().toISOString();
  for (const id of Object.keys(OLD)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    await exec("UPDATE products SET short = ?, description = ?, color = ?, updated_at = ? WHERE id = ? AND short = ?", [p.short, p.description, p.color, t, id, OLD[id].short]);
  }
  const flag = await exec("SELECT v FROM settings WHERE k = ?", [FLAG]);
  if (flag.rows.length) return;
  const n = Number((await exec("SELECT COUNT(*) AS n FROM products")).rows[0].n);
  if (!n) return;   // bo'sh baza: sayt statik katalogni ko'rsatadi (3 ta yangi mahsulot u yerda bor)
  for (const id of Object.keys(EXTRA)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    const cat = (await exec("SELECT id FROM categories WHERE name = ?", [EXTRA[id]])).rows[0];
    await exec("INSERT OR IGNORE INTO products (id, name, short, description, category_id, price, old_price, color, style, material, sizes, image, stock, low_stock, active, is_new, is_popular, created_at, updated_at, finish) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,0,?,?,?)",
      [p.id, p.name, p.short, p.description, cat ? Number(cat.id) : null, p.price, p.oldPrice || null, p.color, p.style, (p.specs && p.specs.Material) || "MDF", JSON.stringify(p.sizes), p.image, 10, 5, (p.badges || []).indexOf("new") !== -1 ? 1 : 0, t, t, (p.specs && p.specs.Qoplama) || ""]);
  }
  await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [FLAG, t]);
}
async function applyAll(db) {
  await apply(db);
  const exec = (sql, args) => db.execute({ sql, args: args || [] });
  await cleanSamples(exec, new Date().toISOString());
}

module.exports = { apply: applyAll, OLD, EXTRA, FLAG, CLEAN_FLAG };
