/* YasinDoors — service worker (PWA).
   - Ilova qobig‘i (CSS/JS/ikonkalar) keshlanadi: ikkinchi ochilish tez, internetsiz ham ochiladi.
   - Sahifalar: avval tarmoq, internet yo‘q bo‘lsa — kesh yoki /offline.html.
   - Katalog (/api/catalog): avval tarmoq, internet yo‘q bo‘lsa — oxirgi kesh.
   - Hisob, admin va buyurtma so‘rovlari HECH QACHON keshlanmaydi (maxfiylik va to‘g‘rilik). */
"use strict";
const VERSION = "yd-v2";
const SHELL_CACHE = VERSION + "-shell";
const PAGE_CACHE = VERSION + "-pages";
const DATA_CACHE = VERSION + "-data";
const SHELL = [
  "/offline.html", "/manifest.webmanifest", "/assets/css/offline.css", "/assets/js/offline.js",
  "/assets/css/style.css", "/assets/css/styles.css", "/assets/css/mobile.css", "/assets/css/account.css", "/assets/css/loader.css", "/assets/css/fx.css", "/assets/css/app.css",
  "/assets/js/theme-init.js", "/assets/js/loader.js", "/assets/js/config.js", "/assets/js/geo-regions.js", "/assets/js/products.js", "/assets/js/app.js",
  "/assets/js/account.js", "/assets/js/scroll.js", "/assets/js/fx.js", "/assets/js/styles.js", "/assets/js/pwa.js", "/assets/js/form-utils.js",
  "/assets/img/favicon.svg", "/assets/img/fallback.svg", "/assets/icons/icon-192.png"
];
const NEVER = /^\/api\/(account|admin|order|configurator|contact|catalog\/view)|^\/(Admin|admin)(\/|$)/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    // Sahifa (navigate) so‘rovlarida init/signal ishlatilmaydi: sekin tarmoq «internet yo‘q» deb hisoblanmasin.
    // Kutish chegarasi faqat ma’lumot (JSON) so‘rovlarida.
    let res;
    if (timeoutMs && req.mode !== "navigate" && typeof AbortController === "function") {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try { res = await fetch(req, { signal: ctrl.signal }); } finally { clearTimeout(t); }
    } else {
      res = await fetch(req);
    }
    if (res && res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => null);
    return res;
  } catch (err) {
    const hit = await cache.match(req) || await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || Response.error();
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.test(url.pathname)) return;
  if (req.headers.has("range")) return;

  if (req.mode === "navigate") {
    // Sahifa: tarmoq → kesh → (bir marta qayta urinish) → offline sahifa. Offline sahifa faqat haqiqatan tarmoq xatosida.
    e.respondWith(networkFirst(req, PAGE_CACHE).catch(async () => {
      try { return await fetch(req); } catch (e2) { return (await caches.match("/offline.html")) || Response.error(); }
    }));
    return;
  }
  if (url.pathname === "/api/catalog") {
    e.respondWith(networkFirst(req, DATA_CACHE, 6000).catch(() => new Response(JSON.stringify({ ok: false, offline: true }), { status: 503, headers: { "Content-Type": "application/json" } })));
    return;
  }
  if (url.pathname.startsWith("/api/image/")) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest") {
    // CSS/JS har deploy'da yangilanishi uchun avval tarmoq; rasm/shrift — keshdan tez
    if (/\.(css|js)$/.test(url.pathname)) e.respondWith(networkFirst(req, SHELL_CACHE, 3500));
    else e.respondWith(staleWhileRevalidate(req));
  }
});
