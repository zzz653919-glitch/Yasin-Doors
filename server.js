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
const PUBLIC = path.join(ROOT, "public"); // faqat shu papka brauzerga beriladi (Vercel'dagi outputDirectory bilan bir xil)

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

const { handle: handleApi } = require("./lib/router");
const { resolvePage } = require("./lib/pages");

const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8"
};
// Brauzerga hech qachon berilmaydigan fayl va papkalar
const BLOCKED = /^\/(\.env|\.git|\.claude|node_modules|lib|api|data|scripts|tests|server\.js|package(-lock)?\.json|vercel\.json)/i;

// Admin sahifasi uchun qo'shimcha xavfsizlik sarlavhalari (vercel.json dagilar bilan bir xil)
const ADMIN_HEADERS = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'sha256-qGs1TcEYN810qGPzzRFXxoX7tkmq/iBgfc5oNdFfxUo='; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

// Butun sayt uchun xavfsizlik sarlavhalari (vercel.json dagilar bilan bir xil). Saytda inline skript yo'q.
const SITE_HEADERS = {
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'sha256-qGs1TcEYN810qGPzzRFXxoX7tkmq/iBgfc5oNdFfxUo='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self'; connect-src 'self'; frame-src https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"
};

function serveStatic(req, res, pathname, search) {
  if (BLOCKED.test(pathname)) return notFound(res);
  const page = resolvePage(pathname);
  if (page && page.redirect) { res.writeHead(308, { Location: page.redirect + search }); return res.end(); }
  if (page) pathname = "/" + page.file;
  else if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) return notFound(res);

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    const headers = Object.assign({
      "Content-Type": MIME[ext] || "application/octet-stream",
      // HTML/CSS/JS har doim yangilansin (o‘zgarishlar darhol ko‘rinadi), rasmlar 1 soat keshda
      "Cache-Control": [".html", ".css", ".js", ".webmanifest"].includes(ext) ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff"
    }, SITE_HEADERS, pathname.startsWith("/admin/") ? ADMIN_HEADERS : {});

    // Video uchun Range so‘rovlari (Safari/iOS videoni faqat shu bilan ijro etadi, oldinga o‘tkazish ham shunga tayanadi)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, Object.assign(headers, {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1
      }));
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, Object.assign(headers, { "Accept-Ranges": "bytes", "Content-Length": stat.size }));
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(res) {
  const file = path.join(PUBLIC, "404.html");
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

  if (pathname === "/api" || pathname.startsWith("/api/")) return handleApi(req, res);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    return res.end("Method not allowed");
  }
  serveStatic(req, res, pathname, new URL(req.url, "http://localhost").search);
});

require("./lib/bootstrap-admin").bootstrapAdmin();

server.listen(PORT, () => {
  const dbMode = require("./lib/db").isConfigured() ? "baza: " + (process.env.DATABASE_URL ? "DATABASE_URL" : "lokal fayl data/yasindoors.db") : "baza: YO'Q";
  console.log(`Admin panel: http://localhost:${PORT}/Admin  |  ${dbMode}`);
  const mode = String(process.env.ORDER_DRY_RUN).toLowerCase() === "true"
    ? "DRY RUN (buyurtmalar faqat konsolga chiqadi)"
    : (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "Telegram ulangan" : "Telegram SOZLANMAGAN — .env faylini to‘ldiring");
  console.log(`YasinDoors: http://localhost:${PORT}  |  ${mode}`);
});
