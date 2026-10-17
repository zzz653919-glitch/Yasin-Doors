/**
 * Admin API (/api/admin/...). Har bir marshrut serverda tekshiriladi:
 *   auth (sessiya), perm (rol ruxsati), reauth (parolni qayta tasdiqlash), CSRF (router'da).
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");
const auth = require("./auth");
const store = require("./store");
const telegram = require("./telegram");
const { HttpError, bad, notFound, forbidden, conflict } = require("./http");
const { PRODUCTS } = require("../public/assets/js/products.js");

const A = "/admin";
const ROLE_KEYS = Object.keys(auth.ROLES);

function requireReauth(ctx) {
  if (!auth.hasRecentReauth(ctx.session)) {
    throw forbidden("Bu amal uchun parolni qayta tasdiqlang.", { code: "reauth_required", reauth: true });
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function publicUser(u) {
  return { id: Number(u.id), username: u.username, name: u.name, role: u.role, active: !!u.active, created_at: u.created_at, last_login_at: u.last_login_at };
}

async function userCount() {
  return Number((await db.get("SELECT COUNT(*) AS n FROM users")).n);
}
async function activeSuperAdmins() {
  return Number((await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1")).n);
}

function sessionPayload(session) {
  return {
    user: session.user,
    csrf: session.csrf,
    perms: auth.permsOf(session.user.role),
    role_label: auth.ROLES[session.user.role].label,
    reauth: auth.hasRecentReauth(session)
  };
}

function cleanUsername(v) {
  const u = String(v || "").trim();
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(u)) throw bad("Login 3-40 ta belgi bo'lsin (harf, raqam, nuqta, chiziq).");
  return u;
}

const routes = [
  /* ---------- Holat va kirish ---------- */
  ["GET", A + "/status", { auth: false }, async () => {
    if (!db.isConfigured()) return { body: { ok: true, db: false } };
    try {
      return { body: { ok: true, db: true, needs_setup: (await userCount()) === 0, setup_enabled: !!process.env.SETUP_TOKEN } };
    } catch (e) {
      console.error("status xatosi:", e.message);
      return { body: { ok: true, db: false, error: "connect" } };
    }
  }],

  ["POST", A + "/auth/login", { auth: false }, async ctx => {
    const r = await auth.login(ctx.body.username, ctx.body.password, ctx.ip);
    if (r.error === "blocked") throw new HttpError(429, "Juda ko'p muvaffaqiyatsiz urinish. 15 daqiqadan so'ng qayta urinib ko'ring.");
    if (r.error) {
      await auth.audit(null, "login_failed", "user", null, r.known ? { username: String(ctx.body.username).slice(0, 40) } : null, ctx.ip);
      throw new HttpError(401, "Login yoki parol noto'g'ri.");
    }
    const s = await auth.createSession(ctx.req, r.user.id, ctx.ip);
    await auth.audit({ user: r.user }, "login", "user", r.user.id, null, ctx.ip);
    return {
      body: { ok: true, user: r.user, csrf: s.csrf, perms: auth.permsOf(r.user.role), role_label: auth.ROLES[r.user.role].label, reauth: false },
      headers: { "Set-Cookie": auth.cookieString(ctx.req, s.token, s.maxAge) }
    };
  }],

  ["POST", A + "/auth/logout", { auth: true }, async ctx => {
    await auth.destroySession(ctx.req);
    await auth.audit(ctx.session, "logout", "user", ctx.session.user.id, null, ctx.ip);
    return { body: { ok: true }, headers: { "Set-Cookie": auth.cookieString(ctx.req, "", 0) } };
  }],

  ["GET", A + "/auth/me", { auth: true }, async ctx => ({
    body: Object.assign({ ok: true }, sessionPayload(ctx.session), { telegram: telegram.status() })
  })],

  // Muhim amallar uchun parolni qayta tasdiqlash (5 daqiqa amal qiladi)
  ["POST", A + "/auth/reauth", { auth: true }, async ctx => {
    const key = "reauth:" + ctx.session.user.id;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const fails = Number((await db.get("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND at > ?", [key, since])).n);
    if (fails >= 5) throw new HttpError(429, "Juda ko'p noto'g'ri urinish. Birozdan so'ng qayta urinib ko'ring.");
    const u = await db.get("SELECT password_hash FROM users WHERE id = ?", [ctx.session.user.id]);
    if (!u || !auth.verifyPassword(String(ctx.body.password || ""), u.password_hash)) {
      await db.run("INSERT INTO login_attempts (k, at) VALUES (?,?)", [key, new Date().toISOString()]);
      throw new HttpError(401, "Parol noto'g'ri.");
    }
    await auth.markReauth(ctx.session.sid);
    return { body: { ok: true } };
  }],

  // Birinchi super adminni xavfsiz yaratish (faqat foydalanuvchilar yo'q va SETUP_TOKEN berilgan bo'lsa)
  ["POST", A + "/auth/setup", { auth: false }, async ctx => {
    const expected = process.env.SETUP_TOKEN;
    if (!expected) throw forbidden("Birinchi administrator SETUP_TOKEN orqali yoki `npm run create-admin` buyrug'i bilan yaratiladi.");
    if ((await userCount()) > 0) throw forbidden("Administrator allaqachon yaratilgan.");
    const key = "setup:" + ctx.ip;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    if (Number((await db.get("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND at > ?", [key, since])).n) >= 5) {
      throw new HttpError(429, "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.");
    }
    if (!safeEqual(ctx.body.token || "", expected)) {
      await db.run("INSERT INTO login_attempts (k, at) VALUES (?,?)", [key, new Date().toISOString()]);
      throw new HttpError(401, "Sozlash kaliti noto'g'ri.");
    }
    const username = cleanUsername(ctx.body.username);
    const name = store.str(ctx.body.name, 80);
    if (name.length < 2) throw bad("Ismni kiriting.");
    const pwErr = auth.validatePassword(ctx.body.password);
    if (pwErr) throw bad(pwErr);
    const r = await db.run(
      "INSERT INTO users (username, name, role, password_hash, active, created_at) SELECT ?,?,?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM users)",
      [username, name, "super_admin", auth.hashPassword(ctx.body.password), new Date().toISOString()]
    );
    if (!r.changes) throw forbidden("Administrator allaqachon yaratilgan.");
    await auth.audit({ user: { id: r.lastId, username } }, "setup.first_admin", "user", r.lastId, null, ctx.ip);
    return { body: { ok: true } };
  }],

  /* ---------- Dashboard ---------- */
  ["GET", A + "/dashboard", { perm: "dashboard.view" }, async ctx => {
    const data = await store.dashboard(ctx.query.range);
    const sources = await db.get("SELECT COUNT(*) AS n FROM products");
    data.has_products = Number(sources.n) > 0;
    data.telegram = telegram.status();
    data.telegram_enabled = await store.telegramEnabled();
    return { body: Object.assign({ ok: true }, data) };
  }],

  /* ---------- Mahsulotlar ---------- */
  ["GET", A + "/products", { perm: "products.read" }, async ctx => ({ body: { ok: true, items: await store.listProducts(ctx.query) } })],
  ["GET", A + "/products/:id", { perm: "products.read" }, async ctx => {
    const p = await store.getProduct(ctx.params.id);
    if (!p) throw notFound("Mahsulot topilmadi.");
    return { body: { ok: true, item: p } };
  }],
  ["POST", A + "/products", { perm: "products.write" }, async ctx => {
    const p = await store.createProduct(ctx.body, ctx.session.user);
    await auth.audit(ctx.session, "product.create", "product", p.id, { name: p.name, price: p.price }, ctx.ip);
    return { status: 201, body: { ok: true, item: p } };
  }],
  ["PUT", A + "/products/:id", { perm: "products.write" }, async ctx => {
    const before = await store.getProduct(ctx.params.id);
    const p = await store.updateProduct(ctx.params.id, ctx.body, ctx.session.user);
    const changes = {};
    ["name", "price", "old_price", "stock", "active", "category_id"].forEach(k => { if (before && before[k] !== p[k]) changes[k] = [before[k], p[k]]; });
    await auth.audit(ctx.session, "product.update", "product", p.id, changes, ctx.ip);
    return { body: { ok: true, item: p } };
  }],
  ["POST", A + "/products/bulk", { perm: "products.write" }, async ctx => {
    const action = String(ctx.body.action || "");
    if (action === "delete") {
      if (!auth.can(ctx.session.user.role, "products.delete")) throw forbidden();
      requireReauth(ctx);
    }
    const r = await store.bulkProducts(action, ctx.body.ids);
    await auth.audit(ctx.session, "product.bulk." + action, "product", null, { ids: (ctx.body.ids || []).slice(0, 50), changed: r.changed }, ctx.ip);
    return { body: Object.assign({ ok: true }, r) };
  }],
  ["DELETE", A + "/products/:id", { perm: "products.delete", reauth: true }, async ctx => {
    const p = await store.getProduct(ctx.params.id);
    if (!p) throw notFound("Mahsulot topilmadi.");
    await store.bulkProducts("delete", [p.id]);
    await auth.audit(ctx.session, "product.delete", "product", p.id, { name: p.name }, ctx.ip);
    return { body: { ok: true } };
  }],
  // Namunaviy (static) katalogni bazaga import qilish — faqat baza bo'sh bo'lganda
  ["POST", A + "/products/import-sample", { perm: "products.write" }, async ctx => {
    if (Number((await db.get("SELECT COUNT(*) AS n FROM products")).n) > 0) throw conflict("Katalog bo'sh emas.");
    let n = 0;
    for (const p of PRODUCTS) {
      await store.createProduct({
        name: p.name, short: p.short, description: p.description, price: p.price, old_price: p.oldPrice,
        color: p.color, style: p.style, material: (p.specs && p.specs.Material) || "MDF", sizes: p.sizes,
        image: p.image, stock: 0, active: true, is_new: p.badges.includes("new"), is_popular: p.badges.includes("popular")
      }, ctx.session.user);
      n++;
    }
    await auth.audit(ctx.session, "product.import_sample", "product", null, { count: n }, ctx.ip);
    return { body: { ok: true, imported: n } };
  }],
  ["POST", A + "/upload", { perm: "products.write" }, async ctx => {
    const r = await store.saveImage(ctx.body.data);
    return { status: 201, body: { ok: true, url: r.url } };
  }],

  /* ---------- Kategoriyalar ---------- */
  ["GET", A + "/categories", { perm: "categories.read" }, async () => ({ body: { ok: true, items: await store.listCategories() } })],
  ["POST", A + "/categories", { perm: "categories.write" }, async ctx => {
    const c = await store.saveCategory(null, ctx.body);
    await auth.audit(ctx.session, "category.create", "category", c.id, { name: c.name }, ctx.ip);
    return { status: 201, body: { ok: true, item: c } };
  }],
  ["PUT", A + "/categories/:id", { perm: "categories.write" }, async ctx => {
    const c = await store.saveCategory(store.idParam(ctx.params.id), ctx.body);
    await auth.audit(ctx.session, "category.update", "category", c.id, { name: c.name }, ctx.ip);
    return { body: { ok: true, item: c } };
  }],
  ["DELETE", A + "/categories/:id", { perm: "categories.write", reauth: true }, async ctx => {
    await store.deleteCategory(store.idParam(ctx.params.id));
    await auth.audit(ctx.session, "category.delete", "category", ctx.params.id, null, ctx.ip);
    return { body: { ok: true } };
  }],

  /* ---------- Buyurtmalar ---------- */
  ["GET", A + "/orders", { perm: "orders.read" }, async ctx => ({ body: Object.assign({ ok: true }, await store.listOrders(ctx.query)) })],
  ["GET", A + "/orders/export", { perm: "orders.export" }, async ctx => {
    const csv = await store.exportOrdersCsv(ctx.query);
    await auth.audit(ctx.session, "orders.export", "order", null, { filters: ctx.query }, ctx.ip);
    return {
      raw: Buffer.from(csv, "utf8"),
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="yasindoors-buyurtmalar.csv"' }
    };
  }],
  ["GET", A + "/orders/:id", { perm: "orders.read" }, async ctx => ({ body: { ok: true, item: await store.getOrder(store.idParam(ctx.params.id)) } })],
  ["PATCH", A + "/orders/:id", { perm: "orders.update" }, async ctx => {
    const id = store.idParam(ctx.params.id);
    if (ctx.body.status === "cancelled") {
      const cur = await store.getOrder(id);
      if (cur.status !== "cancelled") requireReauth(ctx); // bekor qilish — muhim amal
    }
    const before = await store.getOrder(id);
    const o = await store.updateOrder(id, ctx.body, ctx.session.user);
    const changes = {};
    ["status", "payment_status"].forEach(k => { if (before[k] !== o[k]) changes[k] = [before[k], o[k]]; });
    await auth.audit(ctx.session, "order.update", "order", o.number, changes, ctx.ip);
    return { body: { ok: true, item: o } };
  }],

  /* ---------- Mijozlar ---------- */
  ["GET", A + "/customers", { perm: "customers.read" }, async ctx => ({ body: { ok: true, items: await store.listCustomers(ctx.query) } })],
  ["GET", A + "/customers/:id", { perm: "customers.read" }, async ctx => ({ body: { ok: true, item: await store.getCustomer(store.idParam(ctx.params.id)) } })],
  ["PUT", A + "/customers/:id", { perm: "customers.write" }, async ctx => {
    const c = await store.updateCustomer(store.idParam(ctx.params.id), ctx.body);
    await auth.audit(ctx.session, "customer.update", "customer", c.id, null, ctx.ip);
    return { body: { ok: true, item: c } };
  }],

  /* ---------- Ombor ---------- */
  ["GET", A + "/inventory", { perm: "inventory.read" }, async () => {
    const items = await store.listProducts({ sort: "stock" });
    return { body: { ok: true, items: items.map(p => ({ id: p.id, name: p.name, image: p.image, stock: p.stock, low_stock: p.low_stock, active: p.active, category_name: p.category_name })) } };
  }],
  ["POST", A + "/inventory/adjust", { perm: "inventory.adjust" }, async ctx => {
    const r = await store.adjustStock(ctx.body, ctx.session.user);
    await auth.audit(ctx.session, "stock.adjust", "product", r.product_id, { delta: r.delta, stock: r.stock }, ctx.ip);
    return { body: Object.assign({ ok: true }, r) };
  }],
  ["GET", A + "/inventory/movements", { perm: "inventory.read" }, async ctx => ({ body: { ok: true, items: await store.listMovements(ctx.query) } })],

  /* ---------- Sozlamalar ---------- */
  ["GET", A + "/settings", { perm: "settings.read" }, async () => ({
    body: { ok: true, settings: await store.getSettings(), telegram: telegram.status() }
  })],
  ["PUT", A + "/settings", { perm: "settings.write" }, async ctx => {
    if (ctx.body.telegram_enabled !== undefined) requireReauth(ctx);
    const changed = await store.saveSettings(ctx.body);
    await auth.audit(ctx.session, "settings.update", "settings", null, { keys: changed }, ctx.ip);
    return { body: { ok: true, settings: await store.getSettings() } };
  }],
  ["POST", A + "/settings/telegram-test", { perm: "settings.write" }, async ctx => {
    const r = await telegram.send("✅ YasinDoors: Telegram bildirishnomalari ishlayapti.\nSinov xabari " + telegram.tashkentTime());
    await auth.audit(ctx.session, "telegram.test", "settings", null, { sent: r.sent, reason: r.reason || null }, ctx.ip);
    return { body: { ok: true, sent: r.sent, reason: r.reason || null } };
  }],

  /* ---------- Administratorlar ---------- */
  ["GET", A + "/users", { perm: "users.manage" }, async () => {
    const rows = await db.all("SELECT id, username, name, role, active, created_at, last_login_at FROM users ORDER BY id");
    return { body: { ok: true, items: rows.map(publicUser), roles: ROLE_KEYS.map(k => ({ key: k, label: auth.ROLES[k].label })) } };
  }],
  ["POST", A + "/users", { perm: "users.manage", reauth: true }, async ctx => {
    const username = cleanUsername(ctx.body.username);
    const name = store.str(ctx.body.name, 80);
    if (name.length < 2) throw bad("Ismni kiriting.");
    if (!ROLE_KEYS.includes(ctx.body.role)) throw bad("Rol noto'g'ri.");
    const pwErr = auth.validatePassword(ctx.body.password);
    if (pwErr) throw bad(pwErr);
    if (await db.get("SELECT 1 AS x FROM users WHERE username = ?", [username])) throw conflict("Bu login band.");
    const r = await db.run("INSERT INTO users (username, name, role, password_hash, active, created_at) VALUES (?,?,?,?,1,?)",
      [username, name, ctx.body.role, auth.hashPassword(ctx.body.password), new Date().toISOString()]);
    await auth.audit(ctx.session, "user.create", "user", r.lastId, { username, role: ctx.body.role }, ctx.ip);
    return { status: 201, body: { ok: true, id: r.lastId } };
  }],
  ["PUT", A + "/users/:id", { perm: "users.manage", reauth: true }, async ctx => {
    const id = store.idParam(ctx.params.id);
    const u = await db.get("SELECT * FROM users WHERE id = ?", [id]);
    if (!u) throw notFound("Foydalanuvchi topilmadi.");
    const name = ctx.body.name !== undefined ? store.str(ctx.body.name, 80) : u.name;
    const role = ctx.body.role !== undefined ? ctx.body.role : u.role;
    const active = ctx.body.active !== undefined ? store.bool(ctx.body.active) : u.active;
    if (name.length < 2) throw bad("Ismni kiriting.");
    if (!ROLE_KEYS.includes(role)) throw bad("Rol noto'g'ri.");
    if (id === ctx.session.user.id && (!active || role !== u.role)) throw conflict("O'zingizning rolingiz yoki holatingizni o'zgartira olmaysiz.");
    if (u.role === "super_admin" && u.active && (role !== "super_admin" || !active) && (await activeSuperAdmins()) <= 1) {
      throw conflict("Kamida bitta faol Super Admin qolishi kerak.");
    }
    await db.run("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?", [name, role, active, id]);
    if (!active || role !== u.role) await db.run("DELETE FROM sessions WHERE user_id = ?", [id]);
    await auth.audit(ctx.session, "user.update", "user", id, { role, active: !!active }, ctx.ip);
    return { body: { ok: true } };
  }],
  ["POST", A + "/users/:id/password", { perm: "users.manage", reauth: true }, async ctx => {
    const id = store.idParam(ctx.params.id);
    if (!(await db.get("SELECT 1 AS x FROM users WHERE id = ?", [id]))) throw notFound("Foydalanuvchi topilmadi.");
    const pwErr = auth.validatePassword(ctx.body.password);
    if (pwErr) throw bad(pwErr);
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [auth.hashPassword(ctx.body.password), id]);
    // Parol o'zgargach barcha eski sessiyalar bekor (o'zingizniki bundan mustasno)
    await db.run("DELETE FROM sessions WHERE user_id = ? AND id != ?", [id, ctx.session.sid]);
    await auth.audit(ctx.session, "user.password_reset", "user", id, null, ctx.ip);
    return { body: { ok: true } };
  }],

  /* ---------- Audit log ---------- */
  ["GET", A + "/audit", { perm: "audit.read" }, async ctx => {
    const where = [], args = [];
    if (ctx.query.q) { where.push("(username LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\')"); const like = `%${store.likeEsc(ctx.query.q)}%`; args.push(like, like, like); }
    const rows = await db.all(`SELECT * FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 200`, args);
    return { body: { ok: true, items: rows.map(r => ({ id: Number(r.id), at: r.at, username: r.username, action: r.action, entity: r.entity, entity_id: r.entity_id, detail: r.detail, ip: r.ip })) } };
  }]
];

module.exports = { routes };
