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
// 2-partiya: egasi yuborgan qo'shimcha foto eshiklar (bir marta qo'shiladi; admin o'chirsa qaytmaydi)
const EXTRA2 = {
  "royal-oak": "Klassik naqshli", "bianco-due": "Klassik naqshli", "fluta-due": "Oq va och rangli",
  "griglia-duo": "Shisha elementli", "mono-panel": "Klassik naqshli", "nero-vitraj": "Shisha elementli", "nero-line-duo": "Zamonaviy minimalist",
  "silver-royal": "Klassik naqshli", "bianco-frame": "Oq va och rangli", "frassino": "Zamonaviy minimalist", "silver-panel": "Klassik naqshli"
};
const FLAG2 = "photo_products_v2";

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
  const open = "SELECT DISTINCT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('new','accepted','preparing','delivering') AND oi.product_id IS NOT NULL";
  const rows = (await exec(`SELECT id FROM products WHERE image LIKE 'assets/img/doors/%.svg' AND image NOT LIKE '%/doors/photo/%' AND id NOT IN (${open})`)).rows;
  let failed = 0;
  for (const r of rows) {       // har biri alohida: bitta eshikdagi xato (masalan, bog'langan yozuv) qolganlarini to'xtatmasin
    try { await exec("DELETE FROM products WHERE id = ?", [r.id]); }
    catch (e) { failed++; console.error("photo-catalog: o'chmadi", r.id, e.message); }
  }
  if (!failed) await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [CLEAN_FLAG, t]);   // xato bo'lsa — keyingi ishga tushishda qayta uriniladi
}

async function insertExtra(exec, extra, t) {
  for (const id of Object.keys(extra)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    const cat = (await exec("SELECT id FROM categories WHERE name = ?", [extra[id]])).rows[0];
    await exec("INSERT OR IGNORE INTO products (id, name, short, description, category_id, price, old_price, color, style, material, sizes, image, stock, low_stock, active, is_new, is_popular, created_at, updated_at, finish) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,0,?,?,?)",
      [p.id, p.name, p.short, p.description, cat ? Number(cat.id) : null, p.price, p.oldPrice || null, p.color, p.style, (p.specs && p.specs.Material) || "MDF", JSON.stringify(p.sizes), p.image, 10, 5, (p.badges || []).indexOf("new") !== -1 ? 1 : 0, t, t, (p.specs && p.specs.Qoplama) || ""]);
  }
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
  await insertExtra(exec, EXTRA, t);
  await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [FLAG, t]);
}
async function applyAll(db) {
  const exec = (sql, args) => db.execute({ sql, args: args || [] });
  // Tozalash boshqa qadamlardagi xatoga bog'liq bo'lmasligi uchun avval va alohida bajariladi
  try { await cleanSamples(exec, new Date().toISOString()); } catch (e) { console.error("photo-catalog tozalash:", e.message); }
  await apply(db);
  if (!(await exec("SELECT v FROM settings WHERE k = ?", [FLAG2])).rows.length && Number((await exec("SELECT COUNT(*) AS n FROM products")).rows[0].n)) {
    await insertExtra(exec, EXTRA2, new Date().toISOString());
    await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [FLAG2, new Date().toISOString()]);
  }
  try { await cleanSamples(exec, new Date().toISOString()); } catch (e) { console.error("photo-catalog tozalash:", e.message); }   // yangi qo'shilgan foto mahsulotlardan keyin ham (bo'sh bazada keep=0 edi)
}

module.exports = { apply: applyAll, OLD, EXTRA, EXTRA2, FLAG, FLAG2, CLEAN_FLAG };
