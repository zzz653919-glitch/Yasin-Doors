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
    const pages = ["/", "/Products", "/Product?id=classic-royal", "/About", "/Contact", "/Login", "/Register", "/Cart", "/Checkout", "/Favorites", "/Privacy"];
    for (const w of [320, 360, 390, 430, 768, 1024, 1440]) {
      const ctx = await newCtx({ viewport: { width: w, height: 800 }, isMobile: w < 700, hasTouch: w < 700 });
      // Savat va sevimlilar to'la bo'lsin: bo'sh holat uzun matn/elementlarni ko'rsatmaydi
      await ctx.addInitScript(() => { localStorage.setItem("yd_cart_v1", JSON.stringify([{ id: "classic-royal", size: "800 × 2000", qty: 12 }, { id: "loft-black", size: "800 × 2000", qty: 1 }])); localStorage.setItem("yd_favs_v1", JSON.stringify(["classic-royal", "loft-black"])); });
      const p = await ctx.newPage();
      const bad = [];
      for (const pg of pages) {
        await p.goto(B + pg);
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
    await p.goto(B + "/"); await p.waitForTimeout(600);
    ok(await p.locator(".bottom-nav").isVisible(), "mobil: pastki panel ko'rinadi");
    for (const [label, url] of [["Katalog", "/Products"], ["Sevimlilar", "/Favorites"], ["Savat", "/Cart"], ["Profil", "/Login"]]) {
      await p.locator(".bn-item", { hasText: label }).click(); await p.waitForLoadState(); await p.waitForTimeout(400);
      ok(p.url().includes(url), `pastki panel: ${label} -> ${url}`);
    }
    await ctx.close();
    ctx = await newCtx({ viewport: { width: 1280, height: 800 } }); p = await ctx.newPage();
    await p.goto(B + "/"); await p.waitForTimeout(500);
    ok(!(await p.locator(".bottom-nav").isVisible()) && await p.locator(".nav-links").isVisible(), "desktop: pastki panel yo'q, navbar bor");
    await ctx.close();

    /* 3) Sevimlilar boshqa akkauntga aralashmaydi (sessiya chiqilmasdan tugagan holat) */
    const reg = async (email, phone) => {
      const c = await newCtx(); const r = await c.request.post(B + "/api/account/register", { data: { first_name: "Fav", last_name: "Test", email, phone, password: PW, password2: PW, consent: true } });
      const j = await r.json(); await c.close(); return j;
    };
    await reg("e2e-a@example.com", "+998905550101"); await reg("e2e-b@example.com", "+998905550102");
    ctx = await newCtx(); p = await ctx.newPage();
    const login = async id => { await p.goto(B + "/Login"); await p.fill("#identifier", id); await p.fill("#password", PW); await p.click("button[type=submit]"); await p.waitForURL(/profile/); await p.waitForTimeout(800); };
    await login("e2e-a@example.com");
    await p.goto(B + "/Products"); await p.waitForTimeout(1000);
    await p.locator("[data-fav]").first().click(); await p.waitForTimeout(900);
    const favA = await p.locator("[data-fav]").first().getAttribute("data-fav");
    await ctx.clearCookies();
    await login("e2e-b@example.com"); await p.goto(B + "/Favorites"); await p.waitForTimeout(1000);
    const local = await p.evaluate(() => localStorage.getItem("yd_favs_v1"));
    const server = await p.evaluate(() => fetch("/api/account/favorites").then(r => r.json()));
    ok(!String(local).includes(favA) && !server.ids.includes(favA), "A ning sevimlisi B akkauntiga o'tmadi");
    await ctx.close();

    /* 4) Buyurtma faqat kirgan mijozdan: modal, tugmalar, qaytish, savat saqlanishi, qo'sh yuborish */
    const GATE = "Для оформления заказа необходимо войти в аккаунт или зарегистрироваться.";
    ctx = await newCtx({ viewport: { width: 1280, height: 900 } }); p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    const cat = (await (await p.request.get(B + "/api/catalog")).json()).products;
    const price = cat.find(x => x.id === "classic-royal").price;
    const gateVisible = async () => (await p.locator("#authGate").isVisible()) && (await p.locator("#gateText").innerText()) === GATE;

    // 4.1 Mehmon "Hoziroq buyurtma" -> modal (savat saqlanadi); katalog/savatga qo'shish cheklanmagan
    await p.goto(B + "/Product?id=classic-royal"); await p.waitForTimeout(900);
    await p.click("#addToCart"); await p.waitForTimeout(200);
    ok(!(await p.locator("#authGate").isVisible().catch(() => false)), "mehmon: savatga qo'shish modal chiqarmaydi");
    await p.click("#buyNow"); await p.waitForTimeout(500);
    ok(await gateVisible(), "1) mehmon 'Hoziroq buyurtma' bosdi: aniq matnli modal chiqdi");
    ok(p.url().includes("/Product"), "   sahifa o'zgarmadi");
    const btns = await p.locator("#authGate .gate-actions >> text=/./").allInnerTexts();
    ok(JSON.stringify(btns) === JSON.stringify(["Войти", "Регистрация", "Отмена"]), "   tugmalar: Войти / Регистрация / Отмена " + JSON.stringify(btns));
    // 4.2 Отмена yopadi
    await p.click("#authGate [data-gate-close].btn"); await p.waitForTimeout(250);
    ok(!(await p.locator("#authGate").isVisible()), "Отмена modalni yopadi");
    // 4.3 Savat havolasi va checkout
    await p.goto(B + "/Cart"); await p.waitForTimeout(800);
    await p.click("a.btn[href='/Checkout']"); await p.waitForTimeout(400);
    ok(await gateVisible() && p.url().includes("/Cart"), "savatdan 'Buyurtmani rasmiylashtirish': modal, sahifa o'zgarmadi");
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    ok(!(await p.locator("#authGate").isVisible()), "Escape modalni yopadi");
    await p.goto(B + "/Checkout"); await p.waitForTimeout(1200);
    ok(await gateVisible(), "checkout sahifasiga to'g'ridan-to'g'ri kirish: modal chiqdi");
    // 4.4 Войти -> /Login?next=%2FCheckout
    await p.click("[data-gate-login]"); await p.waitForURL(/Login/i);
    ok(p.url().includes("next=%2FCheckout"), "2) 'Войти' kirish sahifasini ochdi (?next=%2FCheckout)");
    // 4.5 Регистрация -> register
    await p.goto(B + "/Checkout"); await p.waitForTimeout(1000);
    await p.click("[data-gate-register]"); await p.waitForURL(/Register/i);
    ok(p.url().includes("next=%2FCheckout"), "3) 'Регистрация' ro'yxatdan o'tish sahifasini ochdi");
    // 4.6 Ro'yxatdan o'tgach checkout'ga qaytadi, savat saqlangan, forma to'ldirilgan
    await p.fill("#first_name", "Заказ"); await p.fill("#last_name", "Тестов"); await p.fill("#email", "e2e-order@example.com"); await p.fill("#phone", "+998 90 555 01 03");
    await p.fill("#password", PW); await p.fill("#password2", PW); await p.check("#consent");
    await p.click("button[type=submit]"); await p.waitForURL(/Checkout/i, { timeout: 8000 }); await p.waitForTimeout(1200);
    ok(!(await p.locator("#authGate").isVisible().catch(() => false)), "kirgandan keyin modal chiqmaydi");
    // savatga qo'shish + "Hoziroq buyurtma" mahsulotni ikki marta qo'shgan (avvalgi xatti-harakat): jami = 2 x narx
    ok((await p.locator("#summaryTotal").innerText()).replace(/\D/g, "") === String(price * 2), "6) ro'yxatdan o'tgach savat saqlangan (jami = 2 x narx)");
    ok((await p.inputValue("#name")) === "Заказ Тестов", "   ism avtomatik to'ldirildi");
    // 4.7 Kirgan foydalanuvchi buyurtma beradi, qo'sh bosish = bitta so'rov
    await p.selectOption("#region", "toshkent"); await p.fill("#address", "Ташкент, ул. 1"); await p.check("#agree");
    let posts = 0; await p.route("**/api/order", async r => { posts++; await new Promise(x => setTimeout(x, 400)); r.continue(); });
    await p.dblclick("#submitBtn"); await p.waitForSelector(".success-box", { timeout: 8000 });
    ok(posts === 1, "4) kirgan foydalanuvchi buyurtma berdi, qo'sh bosish = 1 ta so'rov");
    ok((await p.evaluate(() => localStorage.getItem("yd_cart_v1"))) === "[]", "   buyurtmadan keyin savat tozalandi");
    // 4.8 Kirgan foydalanuvchi "Hoziroq buyurtma" -> to'g'ridan-to'g'ri checkout
    await p.goto(B + "/Product?id=classic-royal"); await p.waitForTimeout(900);
    await p.click("#buyNow"); await p.waitForURL(/Checkout/i, { timeout: 5000 });
    ok(!(await p.locator("#authGate").isVisible().catch(() => false)), "kirgan foydalanuvchi: 'Hoziroq buyurtma' modalsiz checkout'ga o'tadi");
    // 4.9 Backend: autentifikatsiyasiz so'rov rad etiladi (brauzerdan, cookie'siz kontekst)
    const anon = await (await browser.newContext()).request.post(B + "/api/order", { data: { customer: { name: "Mehmon", phone: "+998901112299", region: "toshkent", address: "Ташкент, ул. 1" }, items: [{ id: "classic-royal", size: "800 × 2000", qty: 1 }] } });
    ok(anon.status() === 401 && (await anon.json()).code === "login_required", "5) backend: autentifikatsiyasiz buyurtma 401 login_required");
    const anonCfg = await (await browser.newContext()).request.post(B + "/api/configurator/order", { data: {} });
    ok(anonCfg.status() === 401, "   backend: konstruktor buyurtmasi ham 401");
    ok(errs.length === 0, "JS xato yo'q " + JSON.stringify(errs));
    await ctx.close();

    // 4.10 Konstruktor: mehmon buyurtma tugmasini bosadi
    ctx = await newCtx({ viewport: { width: 1280, height: 900 } }); p = await ctx.newPage();
    await p.goto(B + "/Configurator?fallback=1"); await p.waitForTimeout(1500);
    await p.click("#cfgOrder"); await p.waitForTimeout(500);
    ok(await p.locator("#authGate").isVisible() && !(await p.locator("#cfgModal").isVisible().catch(() => false)), "konstruktor: mehmon uchun buyurtma oynasi o'rniga kirish modali");
    await ctx.close();

    // 4.11 Telefonda modal ekranga sig'adi
    ctx = await newCtx({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }); p = await ctx.newPage();
    await p.goto(B + "/Checkout"); await p.waitForTimeout(1200);
    const box = await p.locator(".gate-card").boundingBox();
    ok(box && box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 640, "320px: modal ekrandan chiqmaydi " + JSON.stringify(box));
    await ctx.close();

    /* 5) CSP bilan 3D konstruktor va sahifalar xatosiz yuklanadi */
    ctx = await newCtx({ viewport: { width: 1280, height: 800 } }); p = await ctx.newPage();
    const cspErr = []; p.on("console", m => { if (/Content Security Policy|Refused to/.test(m.text())) cspErr.push(m.text().slice(0, 100)); });
    for (const pg of ["index", "products", "configurator", "login", "profile"]) { await p.goto(B + (pg === "index" ? "/" : "/" + pg[0].toUpperCase() + pg.slice(1))); await p.waitForTimeout(1200); }
    ok(cspErr.length === 0, "CSP buzilishlari yo'q " + JSON.stringify(cspErr));
    await ctx.close();
  } finally {
    await browser.close(); srv.kill();
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile + "-journal"]) { try { fs.unlinkSync(f); } catch (e) { /* yo'q */ } }
  }
  console.log(fails ? fails + " FAIL" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
