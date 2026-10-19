/**
 * Yagona API router. Vercel funksiyasi (api/[...path].js) ham, lokal server.js ham shuni ishlatadi.
 * Tartib: marshrutni topish → sessiya → CSRF → ruxsat → qayta tasdiqlash → handler → xavfsiz xato javobi.
 */
"use strict";

const crypto = require("crypto");
const db = require("./db");
const auth = require("./auth");
const accounts = require("./accounts");
const http = require("./http");

const routes = []
  .concat(require("./routes-public").routes)
  .concat(require("./routes-account").routes)
  .concat(require("./routes-admin").routes)
  .map(([method, pattern, opts, handler]) => {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    return { method, re, keys, opts, handler };
  });

function match(method, pathname) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, pathMatched };
}

function send(res, status, body, headers, raw) {
  const h = Object.assign(http.baseHeaders(), headers || {});
  res.statusCode = status;
  Object.keys(h).forEach(k => res.setHeader(k, h[k]));
  if (raw !== undefined) return res.end(raw);
  res.end(JSON.stringify(body));
}

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, "http://localhost"); } catch (e) { return send(res, 400, { ok: false, error: "Noto'g'ri so'rov." }); }
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method === "HEAD" ? "GET" : req.method;
  const ip = http.clientIp(req);

  try {
    const { route, params, pathMatched } = match(method, pathname);
    if (!route) {
      if (pathMatched) return send(res, 405, { ok: false, error: "Bu usul qo'llab-quvvatlanmaydi." });
      return send(res, 404, { ok: false, error: "Topilmadi." });
    }
    const opts = route.opts || {};
    const ctx = { req, res, ip, params, query: Object.fromEntries(url.searchParams), body: {}, session: null };

    // Bazasiz admin API ishlamaydi — aniq xabar
    const needsDb = opts.auth !== false || pathname.startsWith("/admin");
    if (needsDb && !db.isConfigured()) {
      return send(res, 503, { ok: false, code: "db_not_configured", error: "Ma'lumotlar bazasi sozlanmagan. README.md dagi \"Ma'lumotlar bazasi\" bo'limiga qarang." });
    }

    // Mijoz akkaunti sessiyasi (xodimlar sessiyasidan alohida cookie va jadval)
    if (opts.acct) {
      ctx.acct = await accounts.getSession(req);
      if (!ctx.acct) return send(res, 401, { ok: false, code: "unauthorized", error: "Войдите в аккаунт." });
      if (method !== "GET") {
        const token = req.headers["x-csrf-token"];
        const ok = http.sameOrigin(req) && token && String(token).length === ctx.acct.csrf.length &&
          crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(ctx.acct.csrf));
        if (!ok) return send(res, 403, { ok: false, code: "csrf", error: "Проверка безопасности не пройдена. Обновите страницу и повторите попытку." });
      }
    } else if (opts.auth !== false) {
      ctx.session = await auth.getSession(req);
      if (!ctx.session) return send(res, 401, { ok: false, code: "unauthorized", error: "Tizimga kiring." });
      if (method !== "GET") {
        const token = req.headers["x-csrf-token"];
        const ok = http.sameOrigin(req) && token && String(token).length === ctx.session.csrf.length &&
          crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(ctx.session.csrf));
        if (!ok) return send(res, 403, { ok: false, code: "csrf", error: "Xavfsizlik tekshiruvi o'tmadi. Sahifani yangilab, qayta urinib ko'ring." });
      }
      if (opts.perm && !auth.can(ctx.session.user.role, opts.perm)) {
        return send(res, 403, { ok: false, code: "forbidden", error: "Bu amal uchun ruxsatingiz yo'q." });
      }
      if (opts.reauth && !auth.hasRecentReauth(ctx.session)) {
        return send(res, 403, { ok: false, code: "reauth_required", reauth: true, error: "Bu amal uchun parolni qayta tasdiqlang." });
      }
    } else if (method !== "GET" && (pathname.startsWith("/admin") || pathname.startsWith("/account")) && !http.sameOrigin(req)) {
      return send(res, 403, { ok: false, code: "csrf", error: "Noto'g'ri so'rov manbasi." });
    }

    if (method !== "GET") ctx.body = (await http.readBody(req)) || {};
    if (typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw http.bad("So'rov formati noto'g'ri.");

    const out = await route.handler(ctx);
    if (out.raw !== undefined) return send(res, out.status || 200, null, out.headers, req.method === "HEAD" ? undefined : out.raw);
    return send(res, out.status || 200, out.body, out.headers);
  } catch (e) {
    if (e instanceof http.HttpError) {
      return send(res, e.status, Object.assign({ ok: false, error: e.message }, e.extra));
    }
    if (e && e.code === "db_not_configured") {
      return send(res, 503, { ok: false, code: "db_not_configured", error: "Ma'lumotlar bazasi sozlanmagan." });
    }
    // Xato matni foydalanuvchiga ko'rsatilmaydi (ichki ma'lumot sizib chiqmasin); maxfiy qiymatlar loglanmaydi
    console.error("API xatosi:", method, pathname, e && e.message);
    return send(res, 500, { ok: false, error: "Server xatosi. Birozdan so'ng qayta urinib ko'ring." });
  }
}

module.exports = { handle };
