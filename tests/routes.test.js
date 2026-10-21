/* Toza URL'lar: /About, /Products ... (.html ko'rinmaydi) — lokal server, vercel.json va havolalar bir-biriga mos */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { PAGES, resolvePage } = require("../lib/pages");

const ROOT = path.join(__dirname, "..");
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

test("resolvePage: toza yo'l -> fayl, eski .html -> yo'naltirish", () => {
  assert.deepEqual(resolvePage("/"), null);
  assert.deepEqual(resolvePage("/About"), { file: "about.html" });
  assert.deepEqual(resolvePage("/about"), { file: "about.html" });
  assert.deepEqual(resolvePage("/About/"), { file: "about.html" });
  assert.deepEqual(resolvePage("/about.html"), { redirect: "/About" });
  assert.deepEqual(resolvePage("/index.html"), { redirect: "/" });
  assert.deepEqual(resolvePage("/Home"), { redirect: "/" });
  assert.deepEqual(resolvePage("/Admin"), { file: "admin/index.html" });
  assert.deepEqual(resolvePage("/admin"), { file: "admin/index.html" });
  assert.deepEqual(resolvePage("/admin/"), { file: "admin/index.html" });
  assert.deepEqual(resolvePage("/admin/index.html"), { redirect: "/Admin" });
  assert.equal(resolvePage("/admin/admin.css"), null);
  assert.equal(resolvePage("/yoq-sahifa"), null);
});

test("vercel.json: har bir sahifa uchun rewrite va eski .html uchun redirect bor", () => {
  const rw = new Map(VERCEL.rewrites.map(r => [r.source, r.destination]));
  const rd = new Map(VERCEL.redirects.map(r => [r.source, r.destination]));
  for (const p of PAGES) {
    if (p.path === "/") { assert.equal(rd.get("/index.html"), "/"); assert.equal(rd.get("/Home"), "/"); continue; }
    assert.equal(rw.get(p.path), "/" + p.file, p.path);
    assert.ok(fs.existsSync(path.join(ROOT, "public", p.file)), p.file + " mavjud emas");
    if (p.path === "/Admin") assert.equal(rd.get("/admin/index.html"), "/Admin");
    else assert.equal(rd.get("/" + p.file), p.path, p.file);
  }
  // Yo'naltirish halqasi bo'lmasin
  for (const [s, d] of rd) assert.notEqual(s.toLowerCase(), d.toLowerCase());
});

function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, n.name);
    if (n.isDirectory()) { if (!/img|vendor|video|admin$/.test(n.name)) walk(f, out); } else if (/\.(html|js|css)$/.test(n.name)) out.push(f);
  }
  return out;
}

test("sayt kodida ichki .html havolalar qolmagan", () => {
  const pageFiles = new RegExp("[\"'=(/](" + PAGES.map(p => p.file.replace("admin/", "")).join("|").replace(/\./g, "\\.") + ")");
  const bad = [];
  for (const f of walk(path.join(ROOT, "public"))) {
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => { if (pageFiles.test(line)) bad.push(path.relative(ROOT, f) + ":" + (i + 1)); });
  }
  assert.deepEqual(bad, []);
});

test("lokal server: barcha toza yo'llar 200, eski manzillar 308, noma'lum 404", async () => {
  const PORT = 3900 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), DATABASE_URL: "", TURSO_DATABASE_URL: "", ORDER_DRY_RUN: "true" }), stdio: "ignore" });
  const B = "http://localhost:" + PORT;
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(B + "/"); break; } catch (e) { await new Promise(r => setTimeout(r, 150)); } }
    const get = (p) => fetch(B + p, { redirect: "manual" });
    for (const p of PAGES) {
      for (const url of [p.path, p.path.toLowerCase()]) {
        const r = await get(url);
        assert.equal(r.status, 200, url);
        assert.match(r.headers.get("content-type"), /text\/html/, url);
      }
    }
    const home = await (await get("/")).text();
    assert.match(home, /href="\/Products"/);
    assert.doesNotMatch(home, /href="[a-z-]+\.html/);
    const r1 = await get("/products.html?style=klassik");
    assert.equal(r1.status, 308); assert.equal(r1.headers.get("location"), "/Products?style=klassik");
    assert.equal((await get("/index.html")).headers.get("location"), "/");
    assert.equal((await get("/admin/index.html")).headers.get("location"), "/Admin");
    const adm = await get("/Admin");
    assert.equal(adm.status, 200);
    assert.equal(adm.headers.get("x-frame-options"), "DENY");
    assert.equal((await get("/admin/admin.css")).status, 200);
    assert.equal((await get("/Product?id=classic-royal")).status, 200);
    assert.equal((await get("/yoq-sahifa")).status, 404);
  } finally { srv.kill(); }
});
