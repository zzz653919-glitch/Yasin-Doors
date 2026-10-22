/**
 * Domen mantiqi: mahsulot, buyurtma, ombor, mijoz, sozlama, statistika.
 * Ham ochiq sayt API'si, ham admin API shu modulni ishlatadi.
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");
const { HttpError, bad, notFound, conflict } = require("./http");
const telegram = require("./telegram");
const regions = require("./regions");
const { COLORS, STYLES } = require("../public/assets/js/products.js");

const ORDER_STATUSES = ["new", "accepted", "preparing", "delivering", "completed", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const DEFAULT_SIZES = ["600 × 2000", "700 × 2000", "800 × 2000", "900 × 2000"];
const DELIVERY_BY_STATUS = { new: "pending", accepted: "pending", preparing: "pending", delivering: "in_transit", completed: "delivered", cancelled: "cancelled" };

const now = () => new Date().toISOString();

/* ---------- Tekshiruv yordamchilari ---------- */
function str(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
}
/**
 * Qat'iy butun son: faqat son yoki "123" / "1 234" ko'rinishidagi satr.
 * null, "", true, [], "12abc", "1e3" NaN beradi (Number() ularni 0/1/12 ga aylantirib yuborar edi).
 */
function strictInt(v) {
  if (typeof v === "number") return Number.isInteger(v) ? v : NaN;
  if (typeof v === "string" && /^\s*-?\d[\d\s]*$/.test(v)) return Number(v.replace(/\s/g, ""));
  return NaN;
}
function intIn(v, min, max, label, field) {
  const n = strictInt(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} ${min} dan ${max} gacha butun son bo'lishi kerak.`, field ? { field } : undefined);
  return n;
}
/** URL'dagi ID: faqat musbat butun son; aks holda 404 (NaN SQL'ga tushmaydi) */
function idParam(v) {
  if (!/^\d{1,12}$/.test(String(v)) || Number(v) < 1) throw notFound();
  return Number(v);
}
/** So'rov telefon raqamiga o'xshaydimi (faqat raqam, probel, +, -, qavs)? Aks holda telefon bo'yicha qidirilmaydi */
function isPhoneQuery(s) {
  return /^[\d\s+()\-]+$/.test(String(s)) && /\d/.test(String(s));
}
/** LIKE qidiruvida % va _ oddiy belgi sifatida ishlashi uchun (ESCAPE '\\' bilan ishlating) */
function likeEsc(s) {
  return String(s).replace(/[\\%_]/g, c => "\\" + c);
}
function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return /^998\d{9}$/.test(d) ? "+" + d : null;
}
function slugify(s) {
  const slug = String(s).toLowerCase().replace(/[‘’ʻʼ'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || "eshik-" + crypto.randomBytes(3).toString("hex");
}
const bool = v => (v === true || v === 1 || v === "1" || v === "true" ? 1 : 0);

/* ---------- Sozlamalar ---------- */
const CFG = require("../public/assets/js/configurator-data.js");
const PUBLIC_SETTINGS = ["store_name", "logo", "phone", "email", "address", "work_hours", "delivery_terms", "warranty_info", "hero_subtitle", "footer_about", "cfg_prices"];
const SETTING_LIMITS = {
  store_name: 80, logo: 300, phone: 30, email: 120, address: 300, work_hours: 120,
  delivery_terms: 1500, warranty_info: 1500, hero_subtitle: 300, footer_about: 300
};
const SETTING_DEFAULTS = { store_name: "YasinDoors", telegram_enabled: "1" };

async function getSettings() {
  const rows = await db.all("SELECT k, v FROM settings");
  const out = Object.assign({}, SETTING_DEFAULTS);
  rows.forEach(r => { out[r.k] = r.v; });
  PUBLIC_SETTINGS.forEach(k => { if (out[k] === undefined) out[k] = ""; });
  return out;
}
async function saveSettings(patch) {
  const stmts = [];
  const changed = [];
  Object.keys(SETTING_LIMITS).forEach(k => {
    if (patch[k] === undefined) return;
    let v = str(patch[k], SETTING_LIMITS[k]);
    if (k === "logo" && v && !/^(https?:\/\/|\/api\/image\/|assets\/)/.test(v)) throw bad("Logotip manzili noto'g'ri.");
    if (k === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad("Email noto'g'ri.");
    stmts.push({ sql: "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", args: [k, v] });
    changed.push(k);
  });
  if (patch.cfg_prices !== undefined) {
    // Konstruktor narx qoidalari: faqat ma'lum kalitlar va 0..1e9 butun sonlar; xato bo'lsa saqlanmaydi
    const raw = typeof patch.cfg_prices === "string" || (patch.cfg_prices && typeof patch.cfg_prices === "object") ? patch.cfg_prices : "";
    if (typeof raw === "string" && raw.length > 8000) throw bad("Konstruktor narxlari juda uzun.");
    const parsed = CFG.sanitizeRules(raw);
    if (parsed.errors.length) throw bad("Konstruktor narxlarida xato: " + parsed.errors.slice(0, 5).join(", ") + ". Faqat 0 dan 1 000 000 000 gacha butun son kiriting.");
    stmts.push({ sql: "INSERT INTO settings (k, v) VALUES ('cfg_prices', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", args: [Object.keys(parsed.rules).length ? JSON.stringify(parsed.rules) : ""] });
    changed.push("cfg_prices");
  }
  if (patch.telegram_enabled !== undefined) {
    stmts.push({ sql: "INSERT INTO settings (k, v) VALUES ('telegram_enabled', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", args: [bool(patch.telegram_enabled) ? "1" : "0"] });
    changed.push("telegram_enabled");
  }
  if (stmts.length) await db.batch(stmts);
  return changed;
}
async function telegramEnabled() {
  const r = await db.get("SELECT v FROM settings WHERE k = 'telegram_enabled'");
  return !r || r.v !== "0";
}

/* ---------- Mahsulotlar ---------- */
function toProduct(r) {
  let sizes = [];
  try { sizes = JSON.parse(r.sizes || "[]"); } catch (e) { /* bo'sh */ }
  return {
    id: r.id, name: r.name, short: r.short, description: r.description,
    category_id: r.category_id == null ? null : Number(r.category_id),
    category_name: r.category_name || null,
    price: Number(r.price), old_price: r.old_price == null ? null : Number(r.old_price),
    color: r.color, style: r.style, material: r.material, sizes,
    image: r.image, stock: Number(r.stock), low_stock: Number(r.low_stock),
    active: !!r.active, is_new: !!r.is_new, is_popular: !!r.is_popular,
    sku: r.sku || null, finish: r.finish || "", views: Number(r.views || 0), sold: Number(r.sold || 0),
    created_at: r.created_at, updated_at: r.updated_at
  };
}

function parseProductInput(b, partial) {
  const out = {};
  const has = k => b[k] !== undefined;
  if (!partial || has("name")) {
    out.name = str(b.name, 120);
    if (out.name.length < 2) throw bad("Mahsulot nomini kiriting (kamida 2 ta belgi).", { field: "name" });
  }
  if (!partial || has("price")) out.price = intIn(b.price, 1, 1000000000, "Narx", "price");
  if (has("old_price")) {
    out.old_price = b.old_price === null || b.old_price === "" ? null : intIn(b.old_price, 0, 1000000000, "Chegirmadan oldingi narx", "old_price");
  }
  const price = out.price;
  if (out.old_price != null && price != null && out.old_price <= price) throw bad("Chegirmadan oldingi narx joriy narxdan katta bo'lishi kerak.", { field: "old_price" });
  if (has("sku")) {
    const sku = str(b.sku, 40).toUpperCase();
    if (sku && !/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(sku)) throw bad("Mahsulot kodi (SKU) 3–40 belgi: harf, raqam, nuqta, chiziq.", { field: "sku" });
    out.sku = sku || null;
  }
  if (has("finish")) out.finish = str(b.finish, 80);
  if (has("short")) out.short = str(b.short, 200);
  if (has("description")) out.description = str(b.description, 2000);
  if (has("material")) out.material = str(b.material, 80);
  if (has("color")) {
    out.color = str(b.color, 30);
    if (out.color && !COLORS[out.color]) throw bad("Noma'lum rang.", { field: "color" });
  }
  if (has("style")) {
    out.style = str(b.style, 30);
    if (out.style && !STYLES[out.style]) throw bad("Noma'lum dizayn.", { field: "style" });
  }
  if (has("sizes")) {
    const arr = Array.isArray(b.sizes) ? b.sizes : String(b.sizes || "").split(",");
    const sizes = Array.from(new Set(arr.map(s => str(s, 20)).filter(Boolean))).slice(0, 12);
    out.sizes = JSON.stringify(sizes.length ? sizes : DEFAULT_SIZES);
  }
  if (has("category_id")) out.category_id = b.category_id === null || b.category_id === "" ? null : intIn(b.category_id, 1, 1e9, "Kategoriya", "category_id");
  if (has("stock")) out.stock = intIn(b.stock, 0, 1000000, "Ombor miqdori", "stock");
  if (has("low_stock")) out.low_stock = intIn(b.low_stock, 0, 100000, "Kam qolish chegarasi", "low_stock");
  if (has("active")) out.active = bool(b.active);
  if (has("is_new")) out.is_new = bool(b.is_new);
  if (has("is_popular")) out.is_popular = bool(b.is_popular);
  if (has("image")) {
    const img = str(b.image, 300);
    if (img && !/^(\/api\/image\/[a-z0-9]+|assets\/img\/[\w\-./]+|https:\/\/[^\s]+)$/i.test(img)) throw bad("Rasm manzili noto'g'ri.", { field: "image" });
    out.image = img;
  }
  return out;
}

// sold — qabul qilingan va undan keyingi (bekor qilinmagan) buyurtmalardagi sotilgan miqdor (haqiqiy buyurtmalardan hisoblanadi)
const PRODUCT_SELECT = `SELECT p.*, c.name AS category_name,
  (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = p.id AND o.status IN ('accepted','preparing','delivering','completed')) AS sold
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

async function listProducts(q = {}) {
  const where = [], args = [];
  if (q.q) {
    const like = `%${likeEsc(q.q)}%`;
    where.push("(p.name LIKE ? ESCAPE '\\' OR p.id LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\')"); args.push(like, like, like);
  }
  if (q.category) {
    if (/^\d{1,12}$/.test(String(q.category))) { where.push("p.category_id = ?"); args.push(Number(q.category)); }
    else where.push("1 = 0"); // noto'g'ri kategoriya filtri — hech narsa topilmaydi (hamma narsa emas)
  }
  if (q.color) { if (COLORS[q.color]) { where.push("p.color = ?"); args.push(q.color); } else where.push("1 = 0"); }
  if (q.style) { if (STYLES[q.style]) { where.push("p.style = ?"); args.push(q.style); } else where.push("1 = 0"); }
  if (/^\d{1,12}$/.test(String(q.price_min || ""))) { where.push("p.price >= ?"); args.push(Number(q.price_min)); }
  if (/^\d{1,12}$/.test(String(q.price_max || ""))) { where.push("p.price <= ?"); args.push(Number(q.price_max)); }
  if (q.active === "1" || q.active === "0") { where.push("p.active = ?"); args.push(Number(q.active)); }
  if (q.stock === "low") where.push("p.stock <= p.low_stock");
  if (q.stock === "out") where.push("p.stock = 0");
  if (q.stock === "in") where.push("p.stock > 0");
  if (q.badge === "new") where.push("p.is_new = 1");
  if (q.badge === "popular") where.push("p.is_popular = 1");
  if (q.badge === "discount") where.push("p.old_price IS NOT NULL");
  // Saralash: faqat ro'yxatdagi (oldindan belgilangan) ifodalar — foydalanuvchi matni SQL'ga qo'shilmaydi
  const sorts = {
    name: "p.name COLLATE NOCASE ASC", name_desc: "p.name COLLATE NOCASE DESC", price_asc: "p.price ASC", price_desc: "p.price DESC", stock: "p.stock ASC",
    new: "p.created_at DESC", sold: "sold DESC, p.name COLLATE NOCASE", views: "p.views DESC, p.name COLLATE NOCASE", sku: "p.sku ASC"
  };
  const order = sorts[q.sort] || sorts.new;
  const rows = await db.all(`${PRODUCT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}, p.id`, args);
  return rows.map(toProduct);
}

async function getProduct(id) {
  const r = await db.get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
  return r ? toProduct(r) : null;
}

async function uniqueProductId(name) {
  const base = slugify(name);
  let id = base, n = 1;
  while (await db.get("SELECT 1 AS x FROM products WHERE id = ?", [id])) id = `${base}-${++n}`;
  return id;
}

const validKey = k => (typeof k === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(k) ? k : null);

/**
 * Mahsulot yaratish. Natija: { item, duplicate }.
 *  - idempotencyKey bo'yicha takroriy so'rov (ikki marta bosish, tarmoq qayta urinishi) yangi mahsulot yaratmaydi;
 *  - ID (slug) band bo'lib qolsa (parallel so'rov) qayta urinadi — 500 emas.
 */
async function createProduct(body, user) {
  const p = parseProductInput(body, false);
  if (p.category_id) {
    if (!(await db.get("SELECT 1 AS x FROM categories WHERE id = ?", [p.category_id]))) throw bad("Kategoriya topilmadi.", { field: "category_id" });
  }
  const idem = validKey(body.idempotencyKey);
  const existing = async () => {
    const ex = idem && await db.get(`${PRODUCT_SELECT} WHERE p.idem_key = ?`, [idem]);
    return ex ? { item: toProduct(ex), duplicate: true } : null;
  };
  const dup = await existing();
  if (dup) return dup;

  const stock = p.stock || 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await uniqueProductId(p.name);
    const t = now();
    const stmts = [{
      sql: `INSERT INTO products (id,name,short,description,category_id,price,old_price,color,style,material,sizes,image,stock,low_stock,active,is_new,is_popular,created_at,updated_at,idem_key,sku,finish)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [id, p.name, p.short || "", p.description || "", p.category_id || null, p.price, p.old_price == null ? null : p.old_price,
        p.color || "", p.style || "", p.material || "", p.sizes || JSON.stringify(DEFAULT_SIZES), p.image || "",
        stock, p.low_stock == null ? 5 : p.low_stock, p.active == null ? 1 : p.active, p.is_new || 0, p.is_popular || 0, t, t, idem,
        p.sku || ("YD-" + crypto.randomBytes(4).toString("hex").toUpperCase()), p.finish || ""]
    }];
    if (stock > 0) {
      stmts.push({
        sql: `INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [id, p.name, stock, stock, "initial", "Mahsulot yaratilganda", user.id, user.username, t]
      });
    }
    try {
      await db.batch(stmts);
      return { item: await getProduct(id), duplicate: false };
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e;
      if (/products\.sku/i.test(String(e.message))) throw conflict("Bu mahsulot kodi (SKU) band.", { field: "sku" });
      const again = await existing();     // bir vaqtda kelgan o'sha so'rov allaqachon yaratgan
      if (again) return again;
      // aks holda ID band bo'lgan edi — yangi ID bilan qayta urinamiz
    }
  }
  throw conflict("Mahsulotni yaratib bo'lmadi. Iltimos, qayta urinib ko'ring.");
}

/**
 * Mahsulotni yangilash (bitta tranzaksiyada). Ombor miqdori o'zgartirilayotgan bo'lsa, forma ochilgandagi qiymat
 * (expected_stock) hozirgi qoldiq bilan solishtiriladi: bu orada buyurtma tasdiqlangan bo'lsa, qoldiq jimgina bosib yuborilmaydi.
 */
async function updateProduct(id, body, user) {
  const p = parseProductInput(body, true);
  await db.transaction(async tx => {
    const cur = await tx.get("SELECT * FROM products WHERE id = ?", [id]);
    if (!cur) throw notFound("Mahsulot topilmadi.");
    const price = p.price !== undefined ? p.price : Number(cur.price);
    const old = p.old_price !== undefined ? p.old_price : (cur.old_price == null ? null : Number(cur.old_price));
    if (old != null && old <= price) throw bad("Chegirmadan oldingi narx joriy narxdan katta bo'lishi kerak.", { field: "old_price" });
    if (p.category_id && !(await tx.get("SELECT 1 AS x FROM categories WHERE id = ?", [p.category_id]))) throw bad("Kategoriya topilmadi.", { field: "category_id" });

    const sets = [], args = [];
    Object.keys(p).forEach(k => { if (k !== "stock") { sets.push(`${k} = ?`); args.push(p[k]); } });
    let movement = null;
    const curStock = Number(cur.stock);
    if (p.stock !== undefined && p.stock !== curStock) {
      if (body.expected_stock !== undefined && strictInt(body.expected_stock) !== curStock) {
        throw conflict(`Ombor miqdori boshqa joyda o'zgargan (hozir ${curStock} dona). Formani yopib, qayta oching yoki Ombor bo'limidan foydalaning.`, { field: "stock", current: curStock });
      }
      sets.push("stock = ?"); args.push(p.stock);
      movement = { delta: p.stock - curStock, balance: p.stock };
    }
    if (!sets.length) return;
    sets.push("updated_at = ?"); args.push(now());
    try { await tx.run(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, [...args, id]); }
    catch (e) { if (/UNIQUE/i.test(String(e && e.message))) throw conflict("Bu mahsulot kodi (SKU) band.", { field: "sku" }); throw e; }
    if (movement) {
      await tx.run(
        `INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, p.name || cur.name, movement.delta, movement.balance, "correction", "Mahsulot tahrirlanganda", user.id, user.username, now()]
      );
    }
  });
  return getProduct(id);
}

/**
 * Mahsulotlarni o'chirish. Bajarilmagan (yangi / qabul qilingan / tayyorlanayotgan / yo'ldagi) buyurtmada
 * qatnashayotgan mahsulot o'chirilmaydi — avval buyurtmalar yakunlanishi yoki bekor qilinishi kerak
 * (yoki mahsulotni nofaol qilish mumkin). Yakunlangan/bekor qilingan buyurtmalar tarixi nomlari bilan saqlanadi.
 * Natija: { deleted: [id], blocked: [{ id, name, open }] }
 */
async function deleteProducts(ids) {
  const deleted = [], blocked = [];
  for (const id of ids) {
    const open = Number((await db.get(
      `SELECT COUNT(DISTINCT o.id) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = ? AND o.status IN ('new','accepted','preparing','delivering')`, [id])).n);
    if (open > 0) {
      const prod = await db.get("SELECT name FROM products WHERE id = ?", [id]);
      blocked.push({ id, name: prod ? prod.name : id, open });
      continue;
    }
    const r = await db.run("DELETE FROM products WHERE id = ?", [id]);
    if (r.changes) deleted.push(id);
  }
  return { deleted, blocked };
}

async function bulkProducts(action, ids, value) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500) throw bad("Mahsulotlar tanlanmagan.");
  if (!ids.every(id => typeof id === "string" && id.length > 0 && id.length <= 80)) throw bad("Mahsulot identifikatorlari noto'g'ri.");
  const ph = ids.map(() => "?").join(",");
  const map = { activate: "active = 1", deactivate: "active = 0", mark_new: "is_new = 1", unmark_new: "is_new = 0", mark_popular: "is_popular = 1", unmark_popular: "is_popular = 0", clear_discount: "old_price = NULL" };
  if (map[action]) {
    const r = await db.run(`UPDATE products SET ${map[action]}, updated_at = ? WHERE id IN (${ph})`, [now(), ...ids]);
    return { changed: r.changes };
  }
  if (action === "set_category") {
    const cid = value === null || value === "" ? null : intIn(value, 1, 1e9, "Kategoriya");
    if (cid && !(await db.get("SELECT 1 AS x FROM categories WHERE id = ?", [cid]))) throw bad("Kategoriya topilmadi.");
    const r = await db.run(`UPDATE products SET category_id = ?, updated_at = ? WHERE id IN (${ph})`, [cid, now(), ...ids]);
    return { changed: r.changes };
  }
  if (action === "set_color") {
    if (!COLORS[value]) throw bad("Noma'lum rang.");
    const r = await db.run(`UPDATE products SET color = ?, updated_at = ? WHERE id IN (${ph})`, [value, now(), ...ids]);
    return { changed: r.changes };
  }
  // Narxni foizga o'zgartirish (−50…+200%), 1000 so'mgacha yaxlitlanadi; chegirma — eski narx saqlanadi
  if (action === "price_percent" || action === "discount_percent") {
    const pct = Number(value);
    const lim = action === "discount_percent" ? [1, 70] : [-50, 200];
    if (!Number.isFinite(pct) || pct < lim[0] || pct > lim[1]) throw bad(`Foiz ${lim[0]} dan ${lim[1]} gacha bo'lishi kerak.`);
    const rows = await db.all(`SELECT id, price, old_price FROM products WHERE id IN (${ph})`, ids);
    const t = now(), stmts = [];
    for (const r of rows) {
      const price = Number(r.price);
      if (action === "discount_percent") {
        const base = r.old_price != null && Number(r.old_price) > price ? Number(r.old_price) : price;
        const np = Math.max(1000, Math.round(base * (1 - pct / 100) / 1000) * 1000);
        if (np >= base) continue;
        stmts.push({ sql: "UPDATE products SET price = ?, old_price = ?, updated_at = ? WHERE id = ?", args: [np, base, t, r.id] });
      } else {
        const np = Math.max(1000, Math.round(price * (1 + pct / 100) / 1000) * 1000);
        const old = r.old_price != null && Number(r.old_price) <= np ? null : r.old_price; // eski narx joriydan katta bo'lishi shart
        stmts.push({ sql: "UPDATE products SET price = ?, old_price = ?, updated_at = ? WHERE id = ?", args: [np, old, t, r.id] });
      }
    }
    if (stmts.length) await db.batch(stmts);
    return { changed: stmts.length };
  }
  if (action === "delete") {
    const r = await deleteProducts(ids);
    return { changed: r.deleted.length, blocked: r.blocked };
  }
  throw bad("Noma'lum amal.");
}

/* ---------- Kategoriyalar ---------- */
async function listCategories() {
  const rows = await db.all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products_count FROM categories c ORDER BY c.name COLLATE NOCASE`);
  return rows.map(r => ({ id: Number(r.id), name: r.name, slug: r.slug, products_count: Number(r.products_count), created_at: r.created_at }));
}
async function saveCategory(id, body) {
  const name = str(body.name, 60);
  if (name.length < 2) throw bad("Kategoriya nomini kiriting.");
  let slug = slugify(name);
  const dup = await db.get("SELECT id FROM categories WHERE slug = ? AND id != ?", [slug, id || 0]);
  if (dup) throw conflict("Bunday kategoriya allaqachon mavjud.");
  if (id) {
    const r = await db.run("UPDATE categories SET name = ?, slug = ? WHERE id = ?", [name, slug, id]);
    if (!r.changes) throw notFound("Kategoriya topilmadi.");
    return { id, name, slug };
  }
  const r = await db.run("INSERT INTO categories (name, slug, created_at) VALUES (?,?,?)", [name, slug, now()]);
  return { id: r.lastId, name, slug };
}
async function deleteCategory(id) {
  const r = await db.run("DELETE FROM categories WHERE id = ?", [id]);
  if (!r.changes) throw notFound("Kategoriya topilmadi.");
}

/* ---------- Ochiq katalog ---------- */
async function publicCatalog() {
  const rows = await db.all(`${PRODUCT_SELECT} WHERE p.active = 1 ORDER BY p.created_at ASC`);
  const settings = await getSettings();
  const pub = {};
  PUBLIC_SETTINGS.forEach(k => { pub[k] = settings[k]; });
  if (!rows.length) return { source: "static", settings: pub };
  const products = rows.map(toProduct).map(p => ({
    id: p.id, name: p.name, price: p.price, oldPrice: p.old_price,
    color: p.color || "oq", style: p.style || "klassik",
    badges: [p.is_new ? "new" : null, p.is_popular ? "popular" : null].filter(Boolean),
    image: p.image || "assets/img/fallback.svg",
    short: p.short, description: p.description || p.short,
    sizes: p.sizes, inStock: p.stock > 0,
    category: p.category_name, sku: p.sku,
    specs: Object.assign({}, p.material ? { "Material": p.material } : {}, p.finish ? { "Tekstura": p.finish } : {}, p.sku ? { "Mahsulot kodi": p.sku } : {})
  }));
  return { source: "db", products, settings: pub };
}

/* ---------- Mijozlar ---------- */
async function listCustomers(q = {}) {
  const where = [], args = [];
  if (q.q) {
    if (isPhoneQuery(q.q)) { where.push("(c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')"); args.push(`%${likeEsc(q.q)}%`, `%${likeEsc(String(q.q).replace(/\D/g, ""))}%`); }
    else { where.push("c.name LIKE ? ESCAPE '\\'"); args.push(`%${likeEsc(q.q)}%`); }
  }
  const rows = await db.all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
       (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'cancelled' AND o.payment_status = 'paid') AS total_spent,
       (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
     FROM customers c ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.created_at DESC LIMIT 500`, args);
  return rows.map(r => ({
    id: Number(r.id), name: r.name, phone: r.phone, address: r.address, note: r.note, created_at: r.created_at,
    orders_count: Number(r.orders_count), total_spent: Number(r.total_spent), last_order_at: r.last_order_at
  }));
}
async function getCustomer(id) {
  const c = await db.get("SELECT * FROM customers WHERE id = ?", [id]);
  if (!c) throw notFound("Mijoz topilmadi.");
  const orders = await db.all("SELECT id, number, status, payment_status, total, items_count, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC", [id]);
  // Xarid summasi = to'langan va bekor qilinmagan buyurtmalar (dashboarddagi "savdo" qoidasi bilan bir xil)
  const spent = orders.filter(o => o.status !== "cancelled" && o.payment_status === "paid").reduce((s, o) => s + Number(o.total), 0);
  return {
    id: Number(c.id), name: c.name, phone: c.phone, address: c.address, note: c.note, created_at: c.created_at,
    orders_count: orders.length, total_spent: spent,
    orders: orders.map(o => ({ id: Number(o.id), number: o.number, status: o.status, payment_status: o.payment_status, total: Number(o.total), items_count: Number(o.items_count), created_at: o.created_at }))
  };
}
async function updateCustomer(id, body) {
  const cur = await db.get("SELECT * FROM customers WHERE id = ?", [id]);
  if (!cur) throw notFound("Mijoz topilmadi.");
  const name = body.name !== undefined ? str(body.name, 80) : cur.name;
  if (name.replace(/\s/g, "").length < 2) throw bad("Mijoz ismini kiriting.");
  let phone = cur.phone;
  if (body.phone !== undefined) {
    phone = normalizePhone(body.phone);
    if (!phone) throw bad("Telefon raqami noto'g'ri.");
    const dup = await db.get("SELECT id FROM customers WHERE phone = ? AND id != ?", [phone, id]);
    if (dup) throw conflict("Bu telefon raqami boshqa mijozda mavjud.");
  }
  const address = body.address !== undefined ? str(body.address, 300) : cur.address;
  const note = body.note !== undefined ? str(body.note, 500) : cur.note;
  await db.run("UPDATE customers SET name=?, phone=?, address=?, note=? WHERE id=?", [name, phone, address, note, id]);
  return getCustomer(id);
}

/* ---------- Buyurtmalar ---------- */
function newOrderNumber() {
  const d = new Date(Date.now() + 5 * 3600e3);
  const pad = n => String(n).padStart(2, "0");
  return "YD-" + String(d.getUTCFullYear()).slice(2) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

/** Ochiq saytdan buyurtma. Narxlar bazadan olinadi (klientga ishonilmaydi). */
async function createOrder(body, opts = {}) {
  const accountId = opts.accountId || null, accountEmail = opts.accountEmail || null;
  const c = body.customer || {};
  const name = str(c.name, 80), rawAddress = str(c.address, 200), comment = str(c.comment, 1000);
  const phone = normalizePhone(c.phone);
  const errors = [];
  if (name.replace(/\s/g, "").length < 2) errors.push("ism");
  if (!phone) errors.push("telefon raqami");
  if (rawAddress.length < 5) errors.push("manzil");
  if (errors.length) throw new HttpError(422, "Quyidagi maydonlarni tekshiring: " + errors.join(", ") + ".");
  const address = regions.resolve(c.region, rawAddress, m => { throw new HttpError(422, m); }).address;
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(422, "Savat bo'sh.");
  if (body.items.length > 30) throw new HttpError(422, "Savatda mahsulotlar juda ko'p.");

  const ids = Array.from(new Set(body.items.map(i => String(i && i.id))));
  const rows = await db.all(`SELECT * FROM products WHERE active = 1 AND id IN (${ids.map(() => "?").join(",")})`, ids);
  const byId = new Map(rows.map(r => [r.id, toProduct(r)]));
  const items = [];
  for (const raw of body.items) {
    const p = byId.get(String(raw && raw.id));
    const size = String(raw && raw.size);
    const qty = strictInt(raw && raw.qty);
    if (!p || p.sizes.indexOf(size) === -1 || !(qty >= 1 && qty <= 99)) {
      throw new HttpError(422, "Savatdagi mahsulotlardan biri topilmadi yoki sotuvda yo'q. Savatni yangilab, qayta urinib ko'ring.");
    }
    items.push({ product_id: p.id, name: p.name, size, qty, price: p.price });
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const number = newOrderNumber();
  const t = now();

  // Idempotentlik: bir xil kalit bilan takroriy so'rov (ikki marta bosish, tarmoq qayta urinishi) yangi buyurtma yaratmaydi
  const idem = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  const existing = async () => {
    const ex = idem && await db.get("SELECT number, total FROM orders WHERE idem_key = ?", [idem]);
    return ex ? { orderId: ex.number, total: Number(ex.total), notified: false, duplicate: true } : null;
  };
  const dup = await existing();
  if (dup) return dup;

  let order;
  try {
    order = await insertOrder();
  } catch (e) {
    // Bir vaqtda kelgan ikkinchi so'rov UNIQUE indeksga urildi — birinchisining natijasini qaytaramiz
    if (idem && /UNIQUE/i.test(String(e && e.message))) { const again = await existing(); if (again) return again; }
    throw e;
  }

  function insertOrder() { return db.transaction(async tx => {
    let cust = await tx.get("SELECT id FROM customers WHERE phone = ?", [phone]);
    if (cust) {
      await tx.run("UPDATE customers SET address = ? WHERE id = ?", [address, cust.id]);
    } else {
      cust = { id: (await tx.run("INSERT INTO customers (name, phone, address, created_at) VALUES (?,?,?,?)", [name, phone, address, t])).lastId };
    }
    const o = await tx.run(
      `INSERT INTO orders (number, customer_id, name, phone, address, comment, install, status, payment_status, delivery_status, total, items_count, created_at, updated_at, idem_key, account_id, email)
       VALUES (?,?,?,?,?,?,?,'new','unpaid','pending',?,?,?,?,?,?,?)`,
      [number, cust.id, name, phone, address, comment, c.install === true ? 1 : 0, total, count, t, t, idem, accountId, accountEmail]
    );
    for (const it of items) {
      await tx.run("INSERT INTO order_items (order_id, product_id, name, size, qty, price) VALUES (?,?,?,?,?,?)", [o.lastId, it.product_id, it.name, it.size, it.qty, it.price]);
    }
    await tx.run("INSERT INTO order_history (order_id, at, field, to_value, note) VALUES (?,?,?,?,?)", [o.lastId, t, "status", "new", "Buyurtma saytdan qabul qilindi"]);
    return { id: o.lastId, number, name, phone, address, comment, install: c.install === true, total, items_count: count, created_at: t };
  }); }

  // Telegram — buyurtma allaqachon saqlangan, xato bo'lsa ham buyurtma yo'qolmaydi
  let notified = false;
  try {
    if (await telegramEnabled()) {
      const r = await telegram.send(telegram.orderMessage(order, items));
      notified = !!r.sent;
    }
  } catch (e) { console.error("Telegram yuborishda xato:", e.message); }
  return { orderId: order.number, total, notified };
}

/**
 * 3D konstruktordan buyurtma. Konfiguratsiya serverda qat'iy tekshiriladi, narx FAQAT admin kiritgan
 * qoidalardan (cfg_prices) hisoblanadi — klient yuborgan narxga ishonilmaydi. Qoida yetishmasa narx 0
 * va config.priced=false: menejer narxni aniqlaydi (admin paneldan "quote_unit").
 */
async function createConfigOrder(body, opts = {}) {
  const accountId = opts.accountId || null, accountEmail = opts.accountEmail || null;
  const c = body.customer || {};
  const name = str(c.name, 80), rawAddress = str(c.address, 200), comment = str(c.comment, 1000);
  const phone = normalizePhone(c.phone);
  const errors = [];
  if (name.replace(/\s/g, "").length < 2) errors.push("ism");
  if (!phone) errors.push("telefon raqami");
  if (rawAddress.length < 5) errors.push("manzil");
  if (errors.length) throw new HttpError(422, "Quyidagi maydonlarni tekshiring: " + errors.join(", ") + ".");
  const address = regions.resolve(c.region, rawAddress, m => { throw new HttpError(422, m); }).address;

  const v = CFG.validate(body.config);
  if (!v.ok) throw new HttpError(422, "Konfiguratsiya noto'g'ri yoki eskirgan. Sahifani yangilab, qayta tanlang.");
  const cfg = v.cfg;

  // Katalog bilan mos kelishi: bazada shu uslub/rang bo'yicha faol mahsulot bo'lmasa model sotuvda emas
  let rules = {};
  if (db.isConfigured()) {
    const prods = await db.all("SELECT style, color FROM products WHERE active = 1");
    const av = CFG.availability(prods);
    if (!av.models[cfg.model] || !av.colors[cfg.color]) throw new HttpError(422, "Tanlangan model yoki rang hozir mavjud emas.");
    rules = CFG.sanitizeRules((await getSettings()).cfg_prices || "").rules;
  }
  const price = CFG.calcPrice(cfg, rules);
  const priced = price.status === "priced";
  const unit = priced ? price.unit : 0, total = priced ? price.total : 0;
  const code = CFG.shortCode(cfg);

  // Mijoz ko'rgan narx server hisobidan farq qilsa (admin narxni o'zgartirgan) — mijozning roziligisiz yuborilmaydi
  if (body.expectedTotal !== undefined && !opts.dryOnly) {
    const seen = body.expectedTotal === null ? null : Number(body.expectedTotal);
    const now_ = priced ? total : null;
    if (seen !== now_) {
      throw new HttpError(409, now_ === null
        ? "Bu konfiguratsiya narxi hozir tasdiqlanmagan. Sahifa yangilanadi — qayta urinib ko'ring."
        : "Narx yangilandi: hozirgi narx " + String(now_).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm. Yangi narxni ko'rib chiqib, qayta tasdiqlang.");
    }
  }

  let image = null;
  if (body.snapshot && db.isConfigured()) {
    try { image = (await saveImage(body.snapshot)).url; } catch (e) { image = null; } // rasm ixtiyoriy — buyurtma baribir qabul qilinadi
  }
  const meta = { cfg, code, priced, lines: price.lines, missing: price.missing, image, link: "/Configurator#c=" + CFG.encode(cfg) };
  const itemName = "Konstruktor: " + CFG.title(cfg);
  const size = cfg.w + "x" + cfg.h;
  const items = [{ product_id: null, name: itemName, size, qty: cfg.qty, price: unit, config: meta }];

  const number = newOrderNumber();
  const t = now();
  const idem = typeof body.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
  const preview = { id: 0, number, name, phone, address, comment, install: c.install === true, total, items_count: cfg.qty, created_at: t };
  if (opts.dryOnly) return { orderId: number, code, priced, total, order: preview, items };

  const existing = async () => {
    const ex = idem && await db.get("SELECT number, total FROM orders WHERE idem_key = ?", [idem]);
    return ex ? { orderId: ex.number, code, priced, total: Number(ex.total), notified: false, duplicate: true } : null;
  };
  const dup = await existing();
  if (dup) return dup;

  let order;
  try {
    order = await db.transaction(async tx => {
      let cust = await tx.get("SELECT id FROM customers WHERE phone = ?", [phone]);
      if (cust) await tx.run("UPDATE customers SET address = ? WHERE id = ?", [address, cust.id]);
      else cust = { id: (await tx.run("INSERT INTO customers (name, phone, address, created_at) VALUES (?,?,?,?)", [name, phone, address, t])).lastId };
      const o = await tx.run(
        `INSERT INTO orders (number, customer_id, name, phone, address, comment, install, status, payment_status, delivery_status, total, items_count, created_at, updated_at, idem_key, account_id, email)
         VALUES (?,?,?,?,?,?,?,'new','unpaid','pending',?,?,?,?,?,?,?)`,
        [number, cust.id, name, phone, address, comment, c.install === true ? 1 : 0, total, cfg.qty, t, t, idem, accountId, accountEmail]
      );
      await tx.run("INSERT INTO order_items (order_id, product_id, name, size, qty, price, config) VALUES (?,?,?,?,?,?,?)", [o.lastId, null, itemName, size, cfg.qty, unit, JSON.stringify(meta)]);
      await tx.run("INSERT INTO order_history (order_id, at, field, to_value, note) VALUES (?,?,?,?,?)", [o.lastId, t, "status", "new", "Buyurtma 3D konstruktordan qabul qilindi (" + code + ")"]);
      return Object.assign({}, preview, { id: o.lastId });
    });
  } catch (e) {
    if (idem && /UNIQUE/i.test(String(e && e.message))) { const again = await existing(); if (again) return again; }
    throw e;
  }

  let notified = false;
  try {
    if (await telegramEnabled()) notified = !!(await telegram.send(telegram.orderMessage(order, items))).sent;
  } catch (e) { console.error("Telegram yuborishda xato:", e.message); }
  return { orderId: order.number, code, priced, total, notified };
}

async function orderItems(orderIds) {
  if (!orderIds.length) return new Map();
  const rows = await db.all(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY id`, orderIds);
  const map = new Map();
  rows.forEach(r => {
    const list = map.get(Number(r.order_id)) || [];
    let config = null;
    if (r.config) { try { config = JSON.parse(r.config); } catch (e) { config = null; } }
    list.push({ id: Number(r.id), product_id: r.product_id, name: r.name, size: r.size, qty: Number(r.qty), price: Number(r.price), config });
    map.set(Number(r.order_id), list);
  });
  return map;
}
function toOrder(r, items) {
  return {
    id: Number(r.id), number: r.number, customer_id: r.customer_id == null ? null : Number(r.customer_id),
    name: r.name, phone: r.phone, email: r.email || null, account_id: r.account_id == null ? null : Number(r.account_id),
    address: r.address, comment: r.comment, admin_note: r.admin_note, install: !!r.install,
    status: r.status, payment_status: r.payment_status, delivery_status: r.delivery_status,
    total: Number(r.total), items_count: Number(r.items_count), stock_applied: !!r.stock_applied,
    created_at: r.created_at, updated_at: r.updated_at, items: items || []
  };
}

/** Tashkent kuni (YYYY-MM-DD) chegaralarini UTC ISO ga aylantirish */
function dayBoundIso(dateStr, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return null;
  const t = Date.parse(dateStr + "T00:00:00.000Z");
  if (isNaN(t)) return null;
  return new Date(t - 5 * 3600e3 + (endOfDay ? 86400e3 : 0)).toISOString();
}

function orderFilters(q) {
  const where = [], args = [];
  if (q.q) {
    const text = `%${likeEsc(q.q)}%`;
    if (isPhoneQuery(q.q)) {
      where.push("(o.number LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\' OR o.phone LIKE ? ESCAPE '\\')");
      args.push(text, text, `%${likeEsc(String(q.q).replace(/\D/g, ""))}%`);
    } else {
      where.push("(o.number LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')");
      args.push(text, text);
    }
  }
  if (ORDER_STATUSES.includes(q.status)) { where.push("o.status = ?"); args.push(q.status); }
  if (PAYMENT_STATUSES.includes(q.payment)) { where.push("o.payment_status = ?"); args.push(q.payment); }
  const from = dayBoundIso(q.from, false), to = dayBoundIso(q.to, true);
  if (from) { where.push("o.created_at >= ?"); args.push(from); }
  if (to) { where.push("o.created_at < ?"); args.push(to); }
  if (q.customer) {
    if (/^\d{1,12}$/.test(String(q.customer))) { where.push("o.customer_id = ?"); args.push(Number(q.customer)); }
    else where.push("1 = 0"); // noto'g'ri mijoz filtri — hech narsa topilmaydi (hamma buyurtma emas)
  }
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", args };
}

async function listOrders(q = {}) {
  const f = orderFilters(q);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  const total = Number((await db.get(`SELECT COUNT(*) AS n FROM orders o ${f.clause}`, f.args)).n);
  const rows = await db.all(`SELECT o.* FROM orders o ${f.clause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`, [...f.args, limit, (page - 1) * limit]);
  const items = await orderItems(rows.map(r => Number(r.id)));
  return { total, page, limit, items: rows.map(r => toOrder(r, items.get(Number(r.id)))) };
}

async function getOrder(id) {
  const r = await db.get("SELECT * FROM orders WHERE id = ?", [id]);
  if (!r) throw notFound("Buyurtma topilmadi.");
  const items = await orderItems([Number(id)]);
  const history = await db.all("SELECT at, username, field, from_value, to_value, note FROM order_history WHERE order_id = ? ORDER BY id", [id]);
  const o = toOrder(r, items.get(Number(id)));
  o.history = history;
  return o;
}

/** Bir mahsulotning barcha qatorlarini jamlab: Map(product_id → qty) */
function qtyByProduct(items) {
  const m = new Map();
  items.forEach(i => { if (i.product_id) m.set(i.product_id, (m.get(i.product_id) || 0) + Number(i.qty)); });
  return m;
}

/**
 * Buyurtmani yangilash (status, to'lov, izoh). Ombor mantiqi:
 *  - 'new' dan boshqa (va 'cancelled' emas) holatga o'tganda ombor BIR MARTA kamayadi
 *  - bekor qilinsa yoki 'new' ga qaytarilsa — qaytariladi (BIR MARTA)
 *  - stock_applied bayrog'i atomik "UPDATE ... WHERE stock_applied = ?" bilan olinadi,
 *    shuning uchun bir buyurtma takroran qayta ishlansa ham miqdor ikki marta o'zgarmaydi
 */
async function updateOrder(id, patch, user) {
  return db.transaction(async tx => {
    const order = await tx.get("SELECT * FROM orders WHERE id = ?", [id]);
    if (!order) throw notFound("Buyurtma topilmadi.");
    const t = now();
    const history = [];

    if (patch.payment_status !== undefined) {
      if (!PAYMENT_STATUSES.includes(patch.payment_status)) throw bad("To'lov holati noto'g'ri.");
      if (patch.payment_status !== order.payment_status) {
        await tx.run("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?", [patch.payment_status, t, id]);
        history.push(["payment_status", order.payment_status, patch.payment_status]);
      }
    }
    if (patch.quote_unit !== undefined) {
      // Menejer konstruktor buyurtmasi uchun narxni belgilaydi (faqat narxi hali aniqlanmagan qatorlar uchun)
      const unit = intIn(patch.quote_unit, 0, 1000000000, "Narx");
      const rows = await tx.all("SELECT id, qty, price, config FROM order_items WHERE order_id = ? AND config IS NOT NULL", [id]);
      const open = rows.filter(r => { try { return JSON.parse(r.config).priced === false; } catch (e) { return false; } });
      if (!open.length) throw bad("Bu buyurtmada narxi aniqlanishi kerak bo'lgan konstruktor qatori yo'q.");
      for (const r of open) await tx.run("UPDATE order_items SET price = ? WHERE id = ?", [unit, r.id]);
      const sum = (await tx.get("SELECT COALESCE(SUM(qty * price),0) AS s FROM order_items WHERE order_id = ?", [id])).s;
      await tx.run("UPDATE orders SET total = ?, updated_at = ? WHERE id = ?", [Number(sum), t, id]);
      history.push(["quote", String(order.total), String(Number(sum))]);
    }
    if (patch.admin_note !== undefined) {
      const note = str(patch.admin_note, 1000);
      if (note !== order.admin_note) {
        await tx.run("UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?", [note, t, id]);
        history.push(["admin_note", null, null]);
      }
    }
    if (patch.status !== undefined && patch.status !== order.status) {
      if (!ORDER_STATUSES.includes(patch.status)) throw bad("Buyurtma holati noto'g'ri.");
      const items = await tx.all("SELECT product_id, qty FROM order_items WHERE order_id = ?", [id]);
      const needsStock = patch.status !== "new" && patch.status !== "cancelled";

      if (needsStock) {
        const claimed = await tx.run("UPDATE orders SET stock_applied = 1 WHERE id = ? AND stock_applied = 0", [id]);
        if (claimed.changes === 1) {
          const cycle = Number((await tx.get("SELECT COUNT(*) AS n FROM stock_movements WHERE ref_type='order' AND ref_id LIKE ? AND reason='order_deduct'", [`${id}:%`])).n) + 1;
          const short = [];
          for (const [pid, qty] of qtyByProduct(items)) {
            const prod = await tx.get("SELECT name, stock FROM products WHERE id = ?", [pid]);
            if (!prod) continue; // mahsulot o'chirilgan — ombor yuritilmaydi
            const upd = await tx.run("UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?", [qty, t, pid, qty]);
            if (upd.changes === 0) { short.push(`${prod.name} (omborda ${prod.stock}, kerak ${qty})`); continue; }
            await tx.run(
              `INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,ref_type,ref_id,note,user_id,username,at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [pid, prod.name, -qty, Number(prod.stock) - qty, "order_deduct", "order", `${id}:${cycle}`, `Buyurtma ${order.number}`, user.id, user.username, t]
            );
          }
          if (short.length) throw conflict("Omborda yetarli mahsulot yo'q: " + short.join("; ") + ". Avval omborni to'ldiring.");
        }
      } else {
        const released = await tx.run("UPDATE orders SET stock_applied = 0 WHERE id = ? AND stock_applied = 1", [id]);
        if (released.changes === 1) {
          const cycle = Number((await tx.get("SELECT COUNT(*) AS n FROM stock_movements WHERE ref_type='order' AND ref_id LIKE ? AND reason='order_restore'", [`${id}:%`])).n) + 1;
          for (const [pid, qty] of qtyByProduct(items)) {
            const prod = await tx.get("SELECT name, stock FROM products WHERE id = ?", [pid]);
            if (!prod) continue;
            await tx.run("UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?", [qty, t, pid]);
            await tx.run(
              `INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,ref_type,ref_id,note,user_id,username,at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
              [pid, prod.name, qty, Number(prod.stock) + qty, "order_restore", "order", `${id}:${cycle}`, `Buyurtma ${order.number}`, user.id, user.username, t]
            );
          }
        }
      }
      await tx.run("UPDATE orders SET status = ?, delivery_status = ?, updated_at = ? WHERE id = ?", [patch.status, DELIVERY_BY_STATUS[patch.status], t, id]);
      history.push(["status", order.status, patch.status]);
    }

    for (const h of history) {
      await tx.run("INSERT INTO order_history (order_id, at, user_id, username, field, from_value, to_value, note) VALUES (?,?,?,?,?,?,?,?)",
        [id, t, user.id, user.username, h[0], h[1], h[2], h[0] === "status" && patch.note ? str(patch.note, 300) : null]);
    }
    return history.map(h => h[0]);
  }).then(() => getOrder(id));
}

function csvCell(v) {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/Excel formula injection'dan himoya
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function exportOrdersCsv(q) {
  const f = orderFilters(q);
  const rows = await db.all(`SELECT o.* FROM orders o ${f.clause} ORDER BY o.created_at DESC LIMIT 5000`, f.args);
  const items = await orderItems(rows.map(r => Number(r.id)));
  const head = ["Raqam", "Sana", "Mijoz", "Telefon", "Manzil", "Mahsulotlar", "Soni", "Summa (UZS)", "Holat", "To'lov", "Yetkazish", "Izoh"];
  const lines = [head.join(",")];
  rows.forEach(r => {
    const its = (items.get(Number(r.id)) || []).map(i => `${i.name} ${i.size} x${i.qty}`).join(" | ");
    lines.push([r.number, r.created_at, r.name, r.phone, r.address, its, r.items_count, r.total, r.status, r.payment_status, r.delivery_status, r.comment].map(csvCell).join(","));
  });
  return "﻿" + lines.join("\r\n");
}

/* ---------- Ombor ---------- */
async function adjustStock(body, user) {
  const pid = str(body.product_id, 80);
  const mode = body.mode === "set" ? "set" : "delta";
  const reasons = { restock: "Kirim", writeoff: "Chiqim", correction: "Tuzatish" };
  const reason = reasons[body.reason] ? body.reason : "correction";
  const value = intIn(body.value, mode === "set" ? 0 : -1000000, 1000000, "Miqdor");
  const note = str(body.note, 300);
  return db.transaction(async tx => {
    const prod = await tx.get("SELECT name, stock FROM products WHERE id = ?", [pid]);
    if (!prod) throw notFound("Mahsulot topilmadi.");
    const stock = Number(prod.stock);
    const next = mode === "set" ? value : stock + value;
    if (next < 0) throw bad("Ombor miqdori manfiy bo'lishi mumkin emas.");
    const delta = next - stock;
    if (delta === 0) return { product_id: pid, stock, delta: 0 };
    await tx.run("UPDATE products SET stock = ?, updated_at = ? WHERE id = ?", [next, now(), pid]);
    await tx.run(
      `INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [pid, prod.name, delta, next, reason, note, user.id, user.username, now()]
    );
    return { product_id: pid, stock: next, delta };
  });
}
async function listMovements(q = {}) {
  const where = [], args = [];
  if (q.product) { where.push("product_id = ?"); args.push(String(q.product)); }
  const rows = await db.all(`SELECT * FROM stock_movements ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`, args);
  return rows.map(r => ({
    id: Number(r.id), product_id: r.product_id, product_name: r.product_name, delta: Number(r.delta), balance_after: Number(r.balance_after),
    reason: r.reason, note: r.note, username: r.username, at: r.at
  }));
}

/* ---------- Dashboard ---------- */
function tashkentDayStart(offsetDays) {
  const d = new Date(Date.now() + 5 * 3600e3);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - 5 * 3600e3 + offsetDays * 86400e3);
}
async function dashboard(range) {
  const days = range === "month" ? 30 : 7;
  const todayStart = tashkentDayStart(0).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString();
  const [totals, today, products, customers, byStatus, top, recent, accts] = await Promise.all([
    // Hisoblash qoidalari (barcha statistikalar shularga amal qiladi):
    //  savdo (revenue)      = to'langan (paid) VA bekor qilinmagan buyurtmalar summasi
    //  kutilayotgan summa   = to'lanmagan (unpaid) VA bekor qilinmagan buyurtmalar summasi
    //  qaytarilgan (refunded) va bekor qilingan buyurtmalar savdoga ham, kutilayotganga ham kirmaydi
    //  o'rtacha chek        = savdo / to'langan buyurtmalar soni
    //  eng ko'p sotilgan    = qabul qilingan va undan keyingi (bekor qilinmagan) buyurtmalardagi miqdor
    db.get(`SELECT COUNT(*) AS orders,
              COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_status = 'paid' THEN total END),0) AS revenue,
              SUM(CASE WHEN status != 'cancelled' AND payment_status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
              COALESCE(SUM(CASE WHEN status != 'cancelled' AND payment_status = 'unpaid' THEN total END),0) AS pending_amount,
              COALESCE(SUM(CASE WHEN status = 'completed' AND payment_status = 'paid' THEN total END),0) AS revenue_completed,
              SUM(CASE WHEN status IN ('new','accepted','preparing','delivering') THEN 1 ELSE 0 END) AS open_orders,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_orders
            FROM orders`),
    db.get("SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?", [todayStart]),
    db.get(`SELECT COUNT(*) AS total, COALESCE(SUM(stock),0) AS units,
              SUM(CASE WHEN active = 1 AND stock <= low_stock THEN 1 ELSE 0 END) AS low,
              SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active FROM products`),
    db.get("SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS fresh FROM customers", [weekAgo]),
    db.all("SELECT status, COUNT(*) AS n FROM orders GROUP BY status"),
    db.all(`SELECT oi.product_id, oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue, p.image
            FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.status IN ('accepted','preparing','delivering','completed') AND oi.config IS NULL GROUP BY oi.product_id, oi.name ORDER BY qty DESC LIMIT 5`),
    db.all("SELECT id, number, name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 6"),
    // Sayt akkauntlari statistikasi (faqat sonlar; shaxsiy ma'lumot yo'q)
    db.get(`SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS week,
              SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked FROM accounts`, [todayStart, weekAgo])
  ]);
  const from = tashkentDayStart(-(days - 1)).toISOString();
  const series = await db.all(
    `SELECT date(datetime(created_at, '+5 hours')) AS d, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
     FROM orders WHERE status != 'cancelled' AND payment_status = 'paid' AND created_at >= ? GROUP BY d`, [from]);
  const map = new Map(series.map(r => [r.d, r]));
  const chart = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(tashkentDayStart(-i).getTime() + 5 * 3600e3).toISOString().slice(0, 10);
    const r = map.get(d);
    chart.push({ date: d, orders: r ? Number(r.orders) : 0, revenue: r ? Number(r.revenue) : 0 });
  }
  return {
    stats: {
      total_orders: Number(totals.orders), today_orders: Number(today.n),
      total_products: Number(products.total), active_products: Number(products.active || 0),
      stock_units: Number(products.units), low_stock: Number(products.low || 0),
      new_customers: Number(customers.fresh || 0), total_customers: Number(customers.total),
      revenue: Number(totals.revenue), revenue_completed: Number(totals.revenue_completed),
      pending_amount: Number(totals.pending_amount), paid_orders: Number(totals.paid_orders || 0),
      avg_order: Number(totals.paid_orders) ? Math.round(Number(totals.revenue) / Number(totals.paid_orders)) : 0,
      open_orders: Number(totals.open_orders || 0), new_orders: Number(totals.new_orders || 0),
      total_accounts: Number(accts.total), today_accounts: Number(accts.today || 0), week_accounts: Number(accts.week || 0)
    },
    chart, range: days === 30 ? "month" : "week",
    by_status: byStatus.map(r => ({ status: r.status, count: Number(r.n) })),
    top_products: top.map(r => ({ product_id: r.product_id, name: r.name, qty: Number(r.qty), revenue: Number(r.revenue), image: r.image || "" })),
    recent_orders: recent.map(r => ({ id: Number(r.id), number: r.number, name: r.name, total: Number(r.total), status: r.status, payment_status: r.payment_status, created_at: r.created_at }))
  };
}

/* ---------- Rasm ---------- */
const ALLOWED_MIME = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
async function saveImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m || !ALLOWED_MIME[m[1]]) throw bad("Faqat JPG, PNG yoki WEBP rasm yuklash mumkin.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 700 * 1024) throw new HttpError(413, "Rasm hajmi 700 KB dan oshmasligi kerak (avtomatik kichraytiriladi).");
  // Fayl imzosini tekshirish (mime soxtalashtirilmaganini)
  const sig = buf.subarray(0, 12);
  const isJpg = sig[0] === 0xff && sig[1] === 0xd8;
  const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
  const isWebp = sig.subarray(0, 4).toString() === "RIFF" && sig.subarray(8, 12).toString() === "WEBP";
  if (!(isJpg || isPng || isWebp)) throw bad("Rasm fayli yaroqsiz.");
  const id = crypto.randomBytes(10).toString("hex");
  await db.run("INSERT INTO images (id, mime, data, created_at) VALUES (?,?,?,?)", [id, m[1], m[2], now()]);
  // Yuklangan-u hech qayerga ulanmagan (forma bekor qilingan, eski rasm almashtirilgan) rasmlarni 1 kundan keyin tozalaymiz
  db.run(
    `DELETE FROM images WHERE created_at < ?
       AND ('/api/image/' || id) NOT IN (SELECT image FROM products)
       AND ('/api/image/' || id) NOT IN (SELECT v FROM settings WHERE k = 'logo')
       AND ('/api/image/' || id) NOT IN (SELECT json_extract(config, '$.image') FROM order_items WHERE config IS NOT NULL AND json_extract(config, '$.image') IS NOT NULL)`,
    [new Date(Date.now() - 24 * 3600e3).toISOString()]
  ).catch(() => {});
  return { id, url: "/api/image/" + id };
}
async function getImage(id) {
  if (!/^[a-f0-9]{20}$/.test(id)) return null;
  const r = await db.get("SELECT mime, data FROM images WHERE id = ?", [id]);
  return r ? { mime: r.mime, buffer: Buffer.from(r.data, "base64") } : null;
}


/* ---------- Mahsulot tarixi, ko'rishlar, CSV ---------- */
/** Mahsulot o'zgarishlari tarixi: admin amallari (audit) va ombor harakatlari */
async function productHistory(id) {
  const audits = await db.all("SELECT at, username, action, detail FROM audit_log WHERE entity = 'product' AND entity_id = ? ORDER BY id DESC LIMIT 60", [id]);
  const moves = await db.all("SELECT at, username, delta, balance_after, reason, note FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 60", [id]);
  return {
    audits: audits.map(a => { let d = null; try { d = a.detail ? JSON.parse(a.detail) : null; } catch (e) { /* matn */ } return { at: a.at, username: a.username, action: a.action, detail: d }; }),
    moves: moves.map(m => ({ at: m.at, username: m.username, delta: Number(m.delta), balance_after: Number(m.balance_after), reason: m.reason, note: m.note }))
  };
}

/** Ko'rishlar hisoblagichi (faqat faol mahsulot). Rate limit routerda. */
async function incrementViews(id) {
  const r = await db.run("UPDATE products SET views = views + 1 WHERE id = ? AND active = 1", [String(id).slice(0, 80)]);
  return r.changes > 0;
}

const CSV_COLUMNS = ["sku", "id", "name", "category", "style", "color", "finish", "material", "sizes", "price", "old_price", "stock", "low_stock", "active", "is_new", "bestseller", "image", "short", "description", "views", "sold", "created_at"];

async function exportProductsCsv(q) {
  const items = await listProducts(q);
  const lines = [CSV_COLUMNS.join(",")];
  items.forEach(p => {
    const row = {
      sku: p.sku, id: p.id, name: p.name, category: p.category_name, style: p.style, color: p.color, finish: p.finish, material: p.material,
      sizes: p.sizes.join("|"), price: p.price, old_price: p.old_price, stock: p.stock, low_stock: p.low_stock, active: p.active ? 1 : 0, is_new: p.is_new ? 1 : 0,
      bestseller: p.is_popular ? 1 : 0, image: p.image, short: p.short, description: p.description, views: p.views, sold: p.sold, created_at: p.created_at
    };
    lines.push(CSV_COLUMNS.map(c => csvCell(row[c])).join(","));
  });
  return "﻿" + lines.join("\r\n");
}

/** RFC 4180 bo'yicha oddiy CSV o'qish (vergul ajratgich, qo'shtirnoq, qator ichidagi yangi qator) */
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(x => x !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== "")) rows.push(row);
  return rows;
}
const truthy = v => /^(1|true|yes|ha|on)$/i.test(String(v == null ? "" : v).trim());

/**
 * CSV import: SKU bo'yicha — mavjud mahsulot yangilanadi, yo'q bo'lsa yaratiladi. Avval HAMMA qator tekshiriladi;
 * bitta xato bo'lsa hech narsa yozilmaydi (xatolar qator raqami bilan qaytariladi). Ombor o'zgarsa harakat yoziladi.
 */
async function importProductsCsv(text, user) {
  const table = parseCsv(text);
  if (table.length < 2) throw bad("CSV bo'sh yoki faqat sarlavhadan iborat.");
  if (table.length > 1001) throw bad("Bir martada 1000 tagacha mahsulot import qilinadi.");
  const head = table[0].map(h => h.trim().toLowerCase());
  if (!head.includes("sku")) throw bad("CSV da «sku» ustuni bo'lishi shart.");
  const cats = await db.all("SELECT id, name FROM categories");
  const catByName = new Map(cats.map(c => [c.name.toLowerCase(), Number(c.id)]));
  const existing = await db.all("SELECT id, sku, name, stock FROM products");
  const bySku = new Map(existing.filter(r => r.sku).map(r => [r.sku, r]));
  const usedIds = new Set(existing.map(r => r.id));
  const errors = [], seen = new Set(), plan = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2, rec = {};
    head.forEach((h, k) => { rec[h] = cells[k] === undefined ? "" : cells[k].trim(); });
    try {
      const sku = str(rec.sku, 40).toUpperCase();
      if (!sku) throw bad("sku bo'sh.");
      if (seen.has(sku)) throw bad(`sku takrorlangan: ${sku}`);
      seen.add(sku);
      const cur = bySku.get(sku);
      const body = { sku };
      const setIf = (col, key) => { if (head.includes(col) && rec[col] !== "") body[key || col] = rec[col]; };
      ["name", "style", "color", "finish", "material", "short", "description", "image", "price", "stock", "low_stock"].forEach(c => setIf(c));
      if (head.includes("old_price")) body.old_price = rec.old_price === "" ? null : rec.old_price;
      if (head.includes("sizes") && rec.sizes) body.sizes = rec.sizes.split("|");
      ["active", "is_new"].forEach(c => { if (head.includes(c) && rec[c] !== "") body[c] = truthy(rec[c]); });
      if (head.includes("bestseller") && rec.bestseller !== "") body.is_popular = truthy(rec.bestseller);
      if (head.includes("category") && rec.category) {
        const cid = catByName.get(rec.category.toLowerCase());
        if (!cid) throw bad(`kategoriya topilmadi: ${rec.category}`);
        body.category_id = cid;
      }
      const parsed = parseProductInput(body, !!cur);
      if (!cur && parsed.price == null) throw bad("yangi mahsulot uchun narx kerak.");
      plan.push({ line, sku, cur, p: parsed });
    } catch (e) {
      errors.push({ line, message: e instanceof HttpError ? e.message : "Qator noto'g'ri." });
    }
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 50), error_count: errors.length };

  const t = now(), stmts = [];
  let created = 0, updated = 0;
  for (const it of plan) {
    const { p, cur } = it;
    if (cur) {
      const sets = [], args = [];
      Object.keys(p).forEach(k => { if (k !== "sku") { sets.push(`${k} = ?`); args.push(p[k]); } });
      if (!sets.length) continue;
      sets.push("updated_at = ?"); args.push(t);
      stmts.push({ sql: `UPDATE products SET ${sets.join(", ")} WHERE id = ?`, args: [...args, cur.id] });
      if (p.stock !== undefined && p.stock !== Number(cur.stock)) {
        stmts.push({ sql: "INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)", args: [cur.id, p.name || cur.name, p.stock - Number(cur.stock), p.stock, "correction", "CSV import", user.id, user.username, t] });
      }
      updated++;
    } else {
      let id = slugify(p.name || it.sku), n = 1; const base = id;
      while (usedIds.has(id)) id = `${base}-${++n}`;
      usedIds.add(id);
      stmts.push({
        sql: `INSERT INTO products (id,name,short,description,category_id,price,old_price,color,style,material,sizes,image,stock,low_stock,active,is_new,is_popular,created_at,updated_at,sku,finish) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [id, p.name, p.short || "", p.description || "", p.category_id || null, p.price, p.old_price == null ? null : p.old_price, p.color || "", p.style || "", p.material || "",
          p.sizes || JSON.stringify(DEFAULT_SIZES), p.image || "", p.stock || 0, p.low_stock == null ? 5 : p.low_stock, p.active == null ? 1 : p.active, p.is_new || 0, p.is_popular || 0, t, t, it.sku, p.finish || ""]
      });
      if (p.stock > 0) stmts.push({ sql: "INSERT INTO stock_movements (product_id,product_name,delta,balance_after,reason,note,user_id,username,at) VALUES (?,?,?,?,?,?,?,?,?)", args: [id, p.name, p.stock, p.stock, "initial", "CSV import", user.id, user.username, t] });
      created++;
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { ok: true, created, updated, rows: plan.length };
}

module.exports = {
  ORDER_STATUSES, PAYMENT_STATUSES, normalizePhone, str, intIn, bool,
  strictInt, idParam, likeEsc,
  getSettings, saveSettings, telegramEnabled, PUBLIC_SETTINGS,
  listProducts, getProduct, createProduct, updateProduct, deleteProducts, bulkProducts, productHistory, incrementViews, exportProductsCsv, importProductsCsv,
  listCategories, saveCategory, deleteCategory,
  publicCatalog, listCustomers, getCustomer, updateCustomer,
  createOrder, createConfigOrder, listOrders, getOrder, updateOrder, exportOrdersCsv,
  adjustStock, listMovements, dashboard, saveImage, getImage
};
