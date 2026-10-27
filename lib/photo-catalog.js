/**
 * Katalogni bo'shatish (egasining talabi: saytdagi barcha eshiklar olib tashlansin).
 * Bazadagi barcha mahsulotlar bir marta o'chiriladi (settings: catalog_emptied_v1). Ochiq buyurtmadagi mahsulotlar o'chirilmaydi
 * va keyingi ishga tushishda qayta uriniladi. Bayroq o'rnatilgach admin qo'shgan yangi mahsulotlarga tegilmaydi.
 * Oldin bu yerda foto mahsulotlarni qo'shish/yangilash mantiqi bor edi — u olib tashlandi: mahsulotlar endi avtomatik qo'shilmaydi.
 */
"use strict";

const EMPTY_FLAG = "catalog_emptied_v1";

async function emptyCatalog(exec, t) {
  if ((await exec("SELECT v FROM settings WHERE k = ?", [EMPTY_FLAG])).rows.length) return;
  const open = "SELECT DISTINCT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status IN ('new','accepted','preparing','delivering') AND oi.product_id IS NOT NULL";
  const rows = (await exec(`SELECT id FROM products WHERE id NOT IN (${open})`)).rows;
  let failed = 0;
  for (const r of rows) {       // har biri alohida: bitta eshikdagi xato qolganlarini to'xtatmasin
    try { await exec("DELETE FROM products WHERE id = ?", [r.id]); }
    catch (e) { failed++; console.error("photo-catalog: o'chmadi", r.id, e.message); }
  }
  if (!failed) await exec("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", [EMPTY_FLAG, t]);
}

async function applyAll(db) {
  const exec = (sql, args) => db.execute({ sql, args: args || [] });
  try { await emptyCatalog(exec, new Date().toISOString()); } catch (e) { console.error("photo-catalog:", e.message); }
}

module.exports = { apply: applyAll, EMPTY_FLAG };
