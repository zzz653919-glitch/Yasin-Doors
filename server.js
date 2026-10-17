/**
 * YasinDoors — yengil Node.js server (tashqi kutubxonalarsiz).
 * Statik fayllarni beradi va /api/order, /api/contact so‘rovlarini qayta ishlaydi.
 *
 * Ishga tushirish:  node server.js      (Node.js 18+)
 * Sozlamalar .env faylidan o‘qiladi (.env.example ga qarang).
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

/* ---------- .env yuklash ---------- */
(function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
})();

const { handleOrder, handleContact } = require("./lib/handlers");
const { clientIp } = require("./lib/vercel-adapter");

const PORT = Number(process.env.PORT) || 3000;
const ROUTES = { "/api/order": handleOrder, "/api/contact": handleContact };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};
// Brauzerga hech qachon berilmaydigan fayl va papkalar
const BLOCKED = /^\/(\.env|\.git|node_modules|lib|api|server\.js|package(-lock)?\.json)/i;

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 50 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  if (BLOCKED.test(pathname)) return notFound(res);
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) return notFound(res);

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      // HTML/CSS/JS har doim yangilansin (o‘zgarishlar darhol ko‘rinadi), rasmlar 1 soat keshda
      "Cache-Control": [".html", ".css", ".js"].includes(ext) ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(res) {
  const file = path.join(ROOT, "404.html");
  fs.readFile(file, (err, data) => {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(err ? "404 — sahifa topilmadi" : data);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    return notFound(res);
  }

  const handler = ROUTES[pathname];
  if (handler) {
    if (req.method !== "POST") return sendJSON(res, 405, { ok: false, error: "Faqat POST so‘rovi qabul qilinadi." });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return sendJSON(res, 400, { ok: false, error: "Noto‘g‘ri so‘rov." });
    }
    try {
      const result = await handler(body, clientIp(req));
      return sendJSON(res, result.status, result.body);
    } catch (e) {
      console.error(e);
      return sendJSON(res, 500, { ok: false, error: "Server xatosi." });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") return sendJSON(res, 405, { ok: false, error: "Method not allowed" });
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  const mode = String(process.env.ORDER_DRY_RUN).toLowerCase() === "true"
    ? "DRY RUN (buyurtmalar faqat konsolga chiqadi)"
    : (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "Telegram ulangan" : "Telegram SOZLANMAGAN — .env faylini to‘ldiring");
  console.log(`YasinDoors: http://localhost:${PORT}  |  ${mode}`);
});
