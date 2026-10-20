/**
 * Brauzer (E2E) regressiya testlari. `npm test` ga kirmaydi (Playwright qo'shimcha o'rnatiladi):
 *   npm i --no-save playwright      # brauzer: PLAYWRIGHT_BROWSERS_PATH yoki CHROME_PATH
 *   npm run test:e2e
 * O'zi vaqtinchalik baza bilan serverni ishga tushiradi va namunaviy katalog bilan to'ldiradi.
 */
"use strict";

const os = require("os"), path = require("path"), fs = require("fs");
const { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const PORT = 3190, B = "http://localhost:" + PORT;
const dbFile = path.join(os.tmpdir(), `yd-e2e-${process.pid}.db`);
process.env.DATABASE_URL = "file:" + dbFile.replace(/\\/g, "/");
const PW = "Sinov-8421-Kalit";
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

async function seed() {
  const db = require(path.join(ROOT, "lib/db")), store = require(path.join(ROOT, "lib/store"));
  const { PRODUCTS } = require(path.join(ROOT, "public/assets/js/products.js"));
  await db.init();
  for (const p of PRODUCTS) {
    await store.createProduct({ name: p.name, short: p.short, description: p.description, price: p.price, old_price: p.oldPrice, color: p.color, style: p.style, material: "MDF", sizes: p.sizes, image: p.image, stock: 10, active: true, is_new: false, is_popular: false }, { id: 1, username: "e2e" });
  }
}

(async () => {
  const { chromium } = require("playwright");
  await seed();
  const srv = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT), ORDER_DRY_RUN: "true", MAIL_DRY_RUN: "true" }), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
  const newCtx = (o) => browser.newContext(o).then(async c => { await c.addInitScript(() => sessionStorage.setItem("yd_intro_seen", "1")); return c; });
  try {
    /* 1) Gorizontal scroll yo'q: 7 ta kenglik x asosiy sahifalar */
    const pages = ["index", "products", "product-detail?id=classic-royal", "about", "contact", "login", "register", "cart", "checkout", "favorites", "privacy"];
    for (const w of [320, 360, 390, 430, 768, 1024, 1440]) {
      const ctx = await newCtx({ viewport: { width: w, height: 800 }, isMobile: w < 700, hasTouch: w < 700 });
      // Savat va sevimlilar to'la bo'lsin: bo'sh holat uzun matn/elementlarni ko'rsatmaydi
      await ctx.addInitScript(() => { localStorage.setItem("yd_cart_v1", JSON.stringify([{ id: "classic-royal", size: "800 × 2000", qty: 12 }, { id: "loft-black", size: "800 × 2000", qty: 1 }])); localStorage.setItem("yd_favs_v1", JSON.stringify(["classic-royal", "loft-black"])); });
      const p = await ctx.newPage();
      const bad = [];
      for (const pg of pages) {
        await p.goto(B + "/" + pg.replace(/(\?|$)/, ".html$1").replace(".html.html", ".html"));
        await p.waitForTimeout(500);
        const r = await p.evaluate(() => {
          const W = innerWidth, over = [];
          document.querySelectorAll("body *").forEach(e => {
            if (e.closest(".drawer,.drawer-backdrop,.toast-wrap,.dc-track,.carousel,[data-carousel],.dc-stage,.marquee")) return;
            // Kesuvchi (overflow hidden/clip) ota-element ichida bo'lsa ekrandan chiqib ketmaydi (masalan, parallax rasm)
            for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
              const o = getComputedStyle(a).overflowX;
              if ((o === "hidden" || o === "clip") && a.getBoundingClientRect().right <= W + 1) return;
            }
            const r = e.getBoundingClientRect();
            if (r.width && r.right > W + 1) over.push(e.tagName + "." + String(e.className && e.className.baseVal === undefined ? e.className : "").slice(0, 25));
          });
          return { clip: document.documentElement.scrollWidth > W, over: over.slice(0, 2) };
        });
        if (r.clip || r.over.length) bad.push(pg + " " + JSON.stringify(r));
      }
      ok(bad.length === 0, `${w}px: gorizontal scroll / ekrandan chiqqan element yo'q ${bad.join("; ")}`);
      await ctx.close();
    }

    /* 2) Pastki navigatsiya (mobil) va desktopda yashirinligi */
    let ctx = await newCtx({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    let p = await ctx.newPage();
    await p.goto(B + "/index.html"); await p.waitForTimeout(600);
    ok(await p.locator(".bottom-nav").isVisible(), "mobil: pastki panel ko'rinadi");
    for (const [label, url] of [["Katalog", "products.html"], ["Sevimlilar", "favorites.html"], ["Savat", "cart.html"], ["Profil", "login.html"]]) {
      await p.locator(".bn-item", { hasText: label }).click(); await p.waitForLoadState(); await p.waitForTimeout(400);
      ok(p.url().includes(url), `pastki panel: ${label} -> ${url}`);
    }
    await ctx.close();
    ctx = await newCtx({ viewport: { width: 1280, height: 800 } }); p = await ctx.newPage();
    await p.goto(B + "/index.html"); await p.waitForTimeout(500);
    ok(!(await p.locator(".bottom-nav").isVisible()) && await p.locator(".nav-links").isVisible(), "desktop: pastki panel yo'q, navbar bor");
    await ctx.close();

    /* 3) Sevimlilar boshqa akkauntga aralashmaydi (sessiya chiqilmasdan tugagan holat) */
    const reg = async (email, phone) => {
      const c = await newCtx(); const r = await c.request.post(B + "/api/account/register", { data: { first_name: "Fav", last_name: "Test", email, phone, password: PW, password2: PW, consent: true } });
      const j = await r.json(); await c.close(); return j;
    };
    await reg("e2e-a@example.com", "+998905550101"); await reg("e2e-b@example.com", "+998905550102");
    ctx = await newCtx(); p = await ctx.newPage();
    const login = async id => { await p.goto(B + "/login.html"); await p.fill("#identifier", id); await p.fill("#password", PW); await p.click("button[type=submit]"); await p.waitForURL(/profile/); await p.waitForTimeout(800); };
    await login("e2e-a@example.com");
    await p.goto(B + "/products.html"); await p.waitForTimeout(1000);
    await p.locator("[data-fav]").first().click(); await p.waitForTimeout(900);
    const favA = await p.locator("[data-fav]").first().getAttribute("data-fav");
    await ctx.clearCookies();
    await login("e2e-b@example.com"); await p.goto(B + "/favorites.html"); await p.waitForTimeout(1000);
    const local = await p.evaluate(() => localStorage.getItem("yd_favs_v1"));
    const server = await p.evaluate(() => fetch("/api/account/favorites").then(r => r.json()));
    ok(!String(local).includes(favA) && !server.ids.includes(favA), "A ning sevimlisi B akkauntiga o'tmadi");
    await ctx.close();

    /* 4) Savat va checkout */
    ctx = await newCtx({ viewport: { width: 1280, height: 900 } }); p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    const cat = (await (await p.request.get(B + "/api/catalog")).json()).products;
    await p.goto(B + "/product-detail.html?id=classic-royal"); await p.waitForTimeout(900);
    await p.click("#addToCart"); await p.click("#addToCart"); await p.waitForTimeout(300);
    await p.goto(B + "/cart.html"); await p.waitForTimeout(800);
    const price = cat.find(x => x.id === "classic-royal").price;
    ok(+(await p.locator(".summary-row.total span").last().innerText()).replace(/\D/g, "") === price * 2, "savat: jami = narx x 2");
    await p.evaluate(() => localStorage.setItem("yd_cart_v1", "{bad"));
    await p.reload(); await p.waitForTimeout(600);
    ok(await p.locator(".empty-state").count() > 0, "savat: buzuq localStorage — bo'sh holat");
    await p.goto(B + "/product-detail.html?id=classic-royal"); await p.waitForTimeout(800); await p.click("#addToCart");
    await p.goto(B + "/checkout.html"); await p.waitForTimeout(800);
    await p.click("#submitBtn"); await p.waitForTimeout(200);
    ok(await p.locator(".field.has-error").count() >= 3, "checkout: bo'sh forma xato ko'rsatadi");
    await p.fill("#name", "Тест Покупатель"); await p.fill("#phone", "90 111 22 33"); await p.fill("#address", "Ташкент, ул. 1"); await p.check("#agree");
    let posts = 0; await p.route("**/api/order", async r => { posts++; await new Promise(x => setTimeout(x, 400)); r.continue(); });
    await p.dblclick("#submitBtn"); await p.waitForSelector(".success-box", { timeout: 8000 });
    ok(posts === 1, "checkout: qo'sh bosish bitta so'rov yuboradi");
    ok(errs.length === 0, "savat/checkout: JS xato yo'q " + JSON.stringify(errs));
    await ctx.close();

    /* 5) CSP bilan 3D konstruktor va sahifalar xatosiz yuklanadi */
    ctx = await newCtx({ viewport: { width: 1280, height: 800 } }); p = await ctx.newPage();
    const cspErr = []; p.on("console", m => { if (/Content Security Policy|Refused to/.test(m.text())) cspErr.push(m.text().slice(0, 100)); });
    for (const pg of ["index", "products", "configurator", "login", "profile"]) { await p.goto(B + "/" + pg + ".html"); await p.waitForTimeout(1200); }
    ok(cspErr.length === 0, "CSP buzilishlari yo'q " + JSON.stringify(cspErr));
    await ctx.close();
  } finally {
    await browser.close(); srv.kill();
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
  }
  console.log(fails ? fails + " FAIL" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
