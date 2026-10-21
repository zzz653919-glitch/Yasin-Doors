/**
 * Joylashtirilgan saytni tekshirish (faqat O'QISH, baza o'zgarmaydi): `npm run smoke -- https://sizning-sayt.uz`
 * Tekshiradi: baza ulanishi (/api/health), katalog, buyurtma autentifikatsiyasiz rad etilishi, admin API himoyasi, xavfsizlik sarlavhalari.
 */
"use strict";
const base = (process.argv[2] || process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const call = (method, p, body) => fetch(base + p, { method, headers: { "Content-Type": "application/json", Origin: base }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });

(async () => {
  console.log("Sayt:", base);
  const h = await call("GET", "/api/health"); const hj = await h.json().catch(() => ({}));
  ok(h.status === 200 && hj.db === true, `baza ulangan (/api/health → ${h.status})`);
  const c = await call("GET", "/api/catalog"); const cj = await c.json().catch(() => ({}));
  ok(c.ok && cj.ok, `katalog javob beradi (manba: ${cj.source || "?"}, mahsulotlar: ${(cj.products || []).length})`);
  const o = await call("POST", "/api/order", { customer: { name: "Smoke", phone: "+998900000000", address: "x" }, items: [] });
  ok(o.status === 401, `buyurtma autentifikatsiyasiz rad etiladi (${o.status})`);
  for (const p of ["/api/admin/orders", "/api/admin/accounts", "/api/admin/dashboard"]) { const r = await call("GET", p); ok(r.status === 401, `${p} ruxsatsiz → ${r.status}`); }
  const home = await fetch(base + "/");
  ok(!!home.headers.get("content-security-policy"), "CSP sarlavhasi bor");
  ok(!!home.headers.get("x-content-type-options"), "X-Content-Type-Options bor");
  for (const p of ["/.env", "/lib/auth.js", "/server.js", "/package.json"]) { const r = await fetch(base + p); ok(r.status === 404, `${p} yopiq (${r.status})`); }
  console.log(fails ? `\n${fails} ta tekshiruv muvaffaqiyatsiz.` : "\nHamma tekshiruvlar o'tdi.");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("Saytga ulanib bo'lmadi:", e.message); process.exit(1); });
