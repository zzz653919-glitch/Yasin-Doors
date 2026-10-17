/**
 * Ma'lumotlar bazasi qatlami (libSQL / Turso).
 *  - Lokal:   DATABASE_URL=file:./data/yasindoors.db   (hisob kerak emas)
 *  - Vercel:  DATABASE_URL=libsql://<baza>.turso.io  +  DATABASE_AUTH_TOKEN=...
 * Barcha so'rovlar parametrlangan (SQL injection'dan himoya).
 */
"use strict";

const fs = require("fs");
const path = require("path");

let client = null;
let ready = null;

function config() {
  let url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "";
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "";
  if (!url) {
    // Vercel'da fayl tizimi doimiy emas — bazasiz ishlamaymiz
    if (process.env.VERCEL) return null;
    url = "file:" + path.join(process.cwd(), "data", "yasindoors.db").replace(/\\/g, "/");
  }
  return { url, authToken };
}

function isConfigured() {
  return config() !== null;
}

function getClient() {
  if (client) return client;
  const cfg = config();
  if (!cfg) {
    const e = new Error("db_not_configured");
    e.code = "db_not_configured";
    throw e;
  }
  if (cfg.url.startsWith("file:")) {
    const file = cfg.url.slice(5);
    if (file && !file.startsWith(":")) fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const { createClient } = require("@libsql/client");
  client = createClient({ url: cfg.url, authToken: cfg.authToken || undefined });
  return client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin','manager','operator')),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    reauth_until TEXT,
    ip TEXT,
    ua TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    k TEXT NOT NULL,
    at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(k, at)`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price INTEGER NOT NULL,
    old_price INTEGER,
    color TEXT NOT NULL DEFAULT '',
    style TEXT NOT NULL DEFAULT '',
    material TEXT NOT NULL DEFAULT '',
    sizes TEXT NOT NULL DEFAULT '[]',
    image TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0,
    low_stock INTEGER NOT NULL DEFAULT 5,
    active INTEGER NOT NULL DEFAULT 1,
    is_new INTEGER NOT NULL DEFAULT 0,
    is_popular INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_active ON products(active)`,
  `CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    install INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    total INTEGER NOT NULL,
    items_count INTEGER NOT NULL,
    stock_applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT,
    name TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    qty INTEGER NOT NULL,
    price INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`,
  `CREATE TABLE IF NOT EXISTS order_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    user_id INTEGER,
    username TEXT,
    field TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_type TEXT,
    ref_id TEXT,
    note TEXT,
    user_id INTEGER,
    username TEXT,
    at TEXT NOT NULL
  )`,
  // Bir buyurtma uchun bir xil ombor harakati ikki marta yozilmasligi uchun (idempotentlik)
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_ref ON stock_movements(ref_type, ref_id, product_id, reason, note) WHERE ref_type IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    detail TEXT,
    ip TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)`
];

/**
 * Sxemani keyingi o'zgartirishlar (mavjud bazalar uchun). Har biri bir marta, xavfsiz qayta ishga tushadi:
 * "duplicate column" xatosi — allaqachon qo'llangan degani.
 */
const MIGRATIONS = [
  // v2: buyurtma idempotentlik kaliti (takroriy yuborishdan himoya)
  "ALTER TABLE orders ADD COLUMN idem_key TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idem ON orders(idem_key) WHERE idem_key IS NOT NULL"
];

/** Sxema bir marta (cold start'da) yaratiladi; qayta chaqirish xavfsiz. */
function init() {
  if (!ready) {
    ready = (async () => {
      const db = getClient();
      await db.execute("PRAGMA foreign_keys = ON").catch(() => {});
      await db.batch(SCHEMA.map(sql => ({ sql, args: [] })), "write");
      for (const sql of MIGRATIONS) {
        try { await db.execute(sql); }
        catch (e) { if (!/duplicate column|already exists/i.test(String(e && e.message))) throw e; }
      }
    })().catch(err => { ready = null; throw err; });
  }
  return ready;
}

async function db() {
  await init();
  return getClient();
}

/**
 * Lokal fayl bazasi (SQLite) bir vaqtda bir nechta yozuvchini ko'tarmaydi (SQLITE_BUSY),
 * shuning uchun faqat shu rejimda barcha so'rovlar navbat bilan bajariladi.
 * Turso (libsql://) serverda esa bunday cheklov yo'q va navbat ishlatilmaydi.
 * Muhim: tranzaksiya ichida db.* funksiyalarini emas, faqat `tx.*` ni chaqiring.
 */
let chain = Promise.resolve();
function serial(fn) {
  const cfg = config();
  if (!cfg || !cfg.url.startsWith("file:")) return fn();
  const result = chain.then(() => fn());
  chain = result.catch(() => {});
  return result;
}

function all(sql, args = []) {
  return serial(async () => {
    const c = await db();
    const r = await c.execute({ sql, args });
    return r.rows.map(row => ({ ...row }));
  });
}
async function get(sql, args = []) {
  return (await all(sql, args))[0] || null;
}
function run(sql, args = []) {
  return serial(async () => {
    const c = await db();
    const r = await c.execute({ sql, args });
    return { changes: r.rowsAffected, lastId: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
  });
}
/** Bir nechta yozuv bitta atomik tranzaksiyada. statements: [{sql,args}] */
function batch(statements) {
  return serial(async () => {
    const c = await db();
    return c.batch(statements, "write");
  });
}
/** Interaktiv tranzaksiya (o'qib-keyin-yozish kerak bo'lganda). */
function transaction(fn) {
  return serial(() => runTransaction(fn));
}
async function runTransaction(fn) {
  const c = await db();
  const tx = await c.transaction("write");
  try {
    const api = {
      all: async (sql, args = []) => (await tx.execute({ sql, args })).rows.map(r => ({ ...r })),
      run: async (sql, args = []) => {
        const r = await tx.execute({ sql, args });
        return { changes: r.rowsAffected, lastId: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
      }
    };
    api.get = async (sql, args = []) => (await api.all(sql, args))[0] || null;
    const result = await fn(api);
    await tx.commit();
    return result;
  } catch (e) {
    try { await tx.rollback(); } catch (_) { /* e'tiborsiz */ }
    throw e;
  } finally {
    tx.close();
  }
}

function reset() { client = null; ready = null; }

module.exports = { isConfigured, init, all, get, run, batch, transaction, reset, config };
