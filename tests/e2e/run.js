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
      await ctx.addInitScript(() => { localStorage.setItem("yd_cart_v1", JSON.stringify([{ id: "classic-royal", size: "800 × 2000", qty: 12 }, { id: "neo-arka", size: "800 × 2000", qty: 1 }])); localStorage.setItem("yd_favs_v1", JSON.stringify(["classic-royal", "neo-arka"])); });
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
    const GATE = "Buyurtma berish uchun hisobingizga kiring yoki ro‘yxatdan o‘ting.";
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
    ok(JSON.stringify(btns) === JSON.stringify(["Kirish", "Ro‘yxatdan o‘tish", "Bekor qilish"]), "   tugmalar: Kirish / Ro‘yxatdan o‘tish / Bekor qilish " + JSON.stringify(btns));
    // 4.2 Bekor qilish yopadi
    await p.click("#authGate [data-gate-close].btn"); await p.waitForTimeout(250);
    ok(!(await p.locator("#authGate").isVisible()), "Bekor qilish modalni yopadi");
    // 4.3 Savat havolasi va checkout
    await p.goto(B + "/Cart"); await p.waitForTimeout(800);
    await p.click("a.btn[href='/Checkout']"); await p.waitForTimeout(400);
    ok(await gateVisible() && p.url().includes("/Cart"), "savatdan 'Buyurtmani rasmiylashtirish': modal, sahifa o'zgarmadi");
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    ok(!(await p.locator("#authGate").isVisible()), "Escape modalni yopadi");
    await p.goto(B + "/Checkout"); await p.waitForTimeout(1200);
    ok(await gateVisible(), "checkout sahifasiga to'g'ridan-to'g'ri kirish: modal chiqdi");
    // 4.4 Kirish -> /Login?next=%2FCheckout
    await p.click("[data-gate-login]"); await p.waitForURL(/Login/i);
    ok(p.url().includes("next=%2FCheckout"), "2) 'Kirish' kirish sahifasini ochdi (?next=%2FCheckout)");
    // 4.5 Ro‘yxatdan o‘tish -> register
    await p.goto(B + "/Checkout"); await p.waitForTimeout(1000);
    await p.click("[data-gate-register]"); await p.waitForURL(/Register/i);
    ok(p.url().includes("next=%2FCheckout"), "3) 'Ro‘yxatdan o‘tish' ro'yxatdan o'tish sahifasini ochdi");
    // 4.6 Ro'yxatdan o'tgach checkout'ga qaytadi, savat saqlangan, forma to'ldirilgan
    await p.fill("#first_name", "Заказ"); await p.fill("#last_name", "Тестов"); await p.fill("#email", "e2e-order@example.com"); await p.fill("#phone", "+998 90 555 01 03");
    await p.fill("#password", PW); await p.fill("#password2", PW); await p.check("#consent");
    await p.click("button[type=submit]"); await p.waitForURL(/Checkout/i, { timeout: 8000 }); await p.waitForTimeout(1200);
    ok(!(await p.locator("#authGate").isVisible().catch(() => false)), "kirgandan keyin modal chiqmaydi");
    // savatga qo'shish + "Hoziroq buyurtma" mahsulotni ikki marta qo'shgan (avvalgi xatti-harakat): jami = 2 x narx
    ok((await p.locator("#summaryTotal").innerText()).replace(/\D/g, "") === String(price * 2), "6) ro'yxatdan o'tgach savat saqlangan (jami = 2 x narx)");
    ok((await p.inputValue("#name")) === "Заказ Тестов", "   ism avtomatik to'ldirildi");
    // 4.7 Kirgan foydalanuvchi buyurtma beradi, qo'sh bosish = bitta so'rov
    // Xarita: bizning marker, hudud zonalari, xaritadan nuqta tanlash va zonadan tashqari nuqtani rad etish
    await p.route("**/tile.openstreetmap.org/**", r => r.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") }));
    await p.waitForSelector("#deliveryMap .leaflet-marker-icon", { timeout: 8000 });
    ok((await p.locator("#shopCoords").innerText()).includes("40°09'36.6\"N"), "xarita: bizning manzil koordinatalari ko'rinadi");
    ok((await p.getAttribute('#deliveryMap + .map-cards a[href*="google.com/maps"]', "href")) === "https://www.google.com/maps?q=40.160167,67.833500", "xarita: Google Maps havolasi (40.160167, 67.833500)");
    // Saqlangan manzil: API orqali qo'shiladi, checkout'da tanlansa forma to'ladi
    await p.evaluate(() => YD.account.request("POST", "/api/account/addresses", { label: "Sinov", region: "samarqand", address: "Registon ko'chasi 9" }));
    await p.reload(); await p.waitForSelector("#savedAddrBox:not([hidden])", { timeout: 8000 });
    await p.selectOption("#savedAddr", { index: 1 }); await p.waitForTimeout(300);
    ok((await p.inputValue("#region")) === "samarqand" && (await p.inputValue("#address")) === "Registon ko'chasi 9", "checkout: saqlangan manzil tanlansa hudud va manzil to'ladi");
    await p.selectOption("#savedAddr", ""); await p.fill("#address", "");
    await p.waitForSelector("#deliveryMap .leaflet-marker-icon", { timeout: 8000 });
    await p.locator("#deliveryMap").scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    const clickLL = async (lat, lng) => { await p.locator("#deliveryMap").scrollIntoViewIfNeeded(); await p.waitForTimeout(700); const q = await p.evaluate(([a, b]) => { const m = window.YDCheckoutMap.map, pt = m.latLngToContainerPoint([a, b]), r = m.getContainer().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y }; }, [lat, lng]); await p.mouse.click(q.x, q.y); await p.waitForTimeout(250); };
    await clickLL(39.77, 64.42); // Buxoro — zonadan tashqari
    ok((await p.inputValue("#lat")) === "" && /tashqarida/.test(await p.locator("#map-error").innerText()), "xarita: Buxoro nuqtasi rad etildi");
    await p.fill("#address", "Buxoro, Navoiy 1"); await p.fill("#name", "Заказ Тестов"); await p.check("#agree");
    await p.click("#submitBtn"); await p.waitForTimeout(500);
    ok(!(await p.locator(".success-box").isVisible().catch(() => false)), "xarita: zonadan tashqari nuqta bilan buyurtma yuborilmadi");
    await clickLL(39.654, 66.975); // Samarqand
    ok((await p.inputValue("#region")) === "samarqand" && Number(await p.inputValue("#lat")) > 39, "xarita: Samarqand nuqtasi tanlandi, hudud avtomatik");
    await p.fill("#address", "Registon ko'chasi 5");
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

    /* 4b) Footer: manzil, telefon (tel:), ish vaqti, tezkor havolalar — desktop va mobil */
    for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["mobil", { width: 390, height: 844 }]]) {
      const fctx = await newCtx({ viewport: vp, isMobile: vp.width < 700, hasTouch: vp.width < 700 }); const fp = await fctx.newPage();
      await fp.goto(B + "/"); await fp.waitForSelector(".site-footer .footer-grid");
      const f = await fp.evaluate(() => { const q = s => document.querySelector(".site-footer " + s);
        return { tel: q('a[href="tel:+998933002020"]') && q('a[href="tel:+998933002020"]').textContent, map: q(".footer-map") && q(".footer-map").getAttribute("href"), text: q(".footer-grid").innerText,
          links: Array.from(document.querySelectorAll(".site-footer .footer-links li a")).map(a => a.getAttribute("href")).filter(h => h && h[0] === "/"), over: document.documentElement.scrollWidth - innerWidth }; });
      ok(f.tel === "+998 93 300 20 20", label + " footer: telefon tel:+998933002020 havolasi");
      ok(f.map === "https://www.google.com/maps?q=40.160167,67.833500", label + " footer: Xaritada ko'rish -> Google Maps");
      ok(!/40°|67°|40\.16|67\.83/.test(f.text) && /Manzilimizni xaritada ko'rish/.test(f.text.replace(/‘/g, "'")) && /Har kuni: 09:00–17:00/.test(f.text) && /MDF eshiklar va zamonaviy dizayn yechimlari\./.test(f.text), label + " footer: koordinatasiz manzil tugmasi, ish vaqti, tavsif");
      ok(["/", "/Products", "/About", "/Contact", "/Cart", "/Favorites"].every(h => f.links.includes(h)) && f.over <= 0, label + " footer: tezkor havolalar, gorizontal scroll yo'q");
      await fctx.close();
    }
    /* 4d) Mobil katalog: 2 ustun, kartalar, qidiruv/filtr/saralash, savat va sevimlilar, fixed elementlar to'smasligi */
    for (const w of [320, 360, 375, 390, 430]) {
      const mctx = await newCtx({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true }); const mp = await mctx.newPage();
      await mp.goto(B + "/Products"); await mp.waitForSelector(".product-card");
      const g = await mp.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".product-card")), c = cards[0], r = c.getBoundingClientRect(), img = c.querySelector("img");
        const cols = new Set(cards.map(x => Math.round(x.getBoundingClientRect().left))).size;
        return { cols, fav: !!c.querySelector(".fav-btn"), add: !!c.querySelector(".add-btn"), price: !!c.querySelector(".price"), lazy: img.getAttribute("loading"), fit: getComputedStyle(img).objectFit,
          ratio: Math.round(c.querySelector(".product-media").getBoundingClientRect().width / c.querySelector(".product-media").getBoundingClientRect().height * 100) / 100,
          over: document.documentElement.scrollWidth - innerWidth, addH: Math.round(c.querySelector(".add-btn").getBoundingClientRect().height), right: Math.round(r.right), pal: !!document.querySelector(".pal-fab") && getComputedStyle(document.querySelector(".pal-fab")).display !== "none" };
      });
      ok(g.cols === 2, w + "px mobil katalog: 2 ustun (" + g.cols + ")");
      ok(g.fav && g.add && g.price && g.lazy === "lazy" && g.fit === "contain", w + "px karta: sevimli, savat, narx, lazy, rasm kesilmaydi");
      ok(g.over <= 0 && g.right <= w && g.addH >= 36 && !g.pal, w + "px: gorizontal scroll yo'q, tugma ≥36px, 'Uslublar' tugmasi to'smaydi");
      if (w === 390) {
        const total = await mp.locator(".product-card").count();
        // qidiruv
        await mp.fill("#searchInput", "zzzz-yoq"); await mp.waitForTimeout(400);
        ok((await mp.locator(".product-card").count()) === 0, "qidiruv: mos kelmasa natija bo'sh");
        await mp.fill("#searchInput", ""); await mp.waitForTimeout(400);
        const firstName = (await mp.locator(".product-card .product-title").first().innerText()).trim();
        await mp.fill("#searchInput", firstName.slice(0, 6)); await mp.waitForTimeout(400);
        ok((await mp.locator(".product-card").count()) >= 1 && (await mp.locator(".product-card").count()) <= total, "qidiruv: nom bo'yicha topdi");
        await mp.fill("#searchInput", ""); await mp.waitForTimeout(400);
        // filtrlar paneli ochiladi, narx filtri natijani yangilaydi, tozalash tiklaydi
        await mp.click("#openFilters"); ok(await mp.locator("#filters").isVisible(), "filtrlar paneli ochildi");
        await mp.waitForTimeout(400);
        const prices = await mp.$$eval(".product-card .price", els => els.map(e => Number(e.textContent.replace(/\D/g, "").slice(-9))));
        await mp.fill("#priceMax", "1"); await mp.waitForTimeout(400);
        ok((await mp.locator(".product-card").count()) === 0, "filtr: narx bo'yicha mahsulotlar yangilandi");
        await mp.click("#resetFilters"); await mp.waitForTimeout(400);
        ok((await mp.locator(".product-card").count()) === total, "filtr: tozalash hammasini qaytardi");
        await mp.click("#filters .filters-open-btn"); await mp.waitForTimeout(300);
        // saralash
        await mp.selectOption("#sortSelect", "price-desc"); await mp.waitForTimeout(400);
        const ps = await mp.$$eval(".product-card .price", els => els.map(e => Number(e.lastChild.textContent.replace(/\D/g, ""))));
        ok(ps.length > 1 && ps.every((v, i) => i === 0 || ps[i - 1] >= v), "saralash: narx kamayish tartibida");
        // savat va sevimlilar
        await mp.locator(".product-card .add-btn").first().click(); await mp.waitForTimeout(400);
        ok((await mp.evaluate(() => JSON.parse(localStorage.getItem("yd_cart_v1") || "[]").length)) === 1, "savatga qo'shildi (Savatga tugmasi)");
        await mp.locator(".product-card .fav-btn").first().click(); await mp.waitForTimeout(300);
        ok((await mp.locator(".product-card .fav-btn.is-active").count()) === 1, "sevimlilarga qo'shildi (yurakcha)");
        // pastki navigatsiya: 5 band, to'g'ri havolalar, faol = Katalog, kartani yopmaydi
        const nav = await mp.evaluate(() => Array.from(document.querySelectorAll(".bottom-nav .bn-item")).map(a => [a.getAttribute("href"), a.classList.contains("is-active")]));
        ok(nav.length === 5 && ["/", "/Products", "/Favorites", "/Cart", "/Profile"].every((h, i) => nav[i][0] === h) && nav[1][1], "pastki navigatsiya: 5 band, faol — Katalog");
        // header: logo, qidiruv, savat, menyu
        ok(await mp.evaluate(() => ["a.logo", ".nav-search", 'a[href="/Cart"]', ".menu-toggle"].every(s => { const e = document.querySelector(".site-header " + s); return e && e.getBoundingClientRect().width > 0; })), "header: logo, qidiruv, savat, menyu ko'rinadi");
        // fixed pastki panel oxirgi kartaning tugmasini yopmaydi (sahifa oxiriga o'tganda)
        await mp.locator(".product-card .add-btn").last().scrollIntoViewIfNeeded(); await mp.waitForTimeout(300);
        const hit = await mp.evaluate(() => { const b = Array.from(document.querySelectorAll(".product-card .add-btn")).pop(), r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === b || b.contains(e)); });
        ok(hit, "fixed elementlar karta tugmasini to'smaydi");
      }
      await mctx.close();
    }
    /* 4e) Mobil joylashuv regressiyalari (370x726): header chetdan chiqmaydi, sharh avatari dumaloq, 3D konstruktorda tugmalar ustma-ust tushmaydi, Aloqa sahifasi sakramaydi */
    { const rctx = await newCtx({ viewport: { width: 370, height: 726 }, isMobile: true, hasTouch: true });
      await rctx.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) { /* yo'q */ } });
      const rp = await rctx.newPage();
      await rp.goto(B + "/"); await rp.waitForSelector(".testimonial .avatar");
      const hdr = await rp.evaluate(() => ({ right: document.querySelector(".site-header .menu-toggle").getBoundingClientRect().right, w: innerWidth, av: (r => [Math.round(r.width), Math.round(r.height)])(document.querySelector(".testimonial .avatar").getBoundingClientRect()) }));
      ok(hdr.right <= hdr.w - 8, "370px: header menyu tugmasi ekrandan chiqmaydi (" + Math.round(hdr.right) + "/" + hdr.w + ")");
      ok(hdr.av[0] === 44 && hdr.av[1] === 44, "370px: sharh avatari 44x44 (dumaloq)");
      const dots = await rp.locator(".dc-dot").count();
      ok(dots > 0 && dots <= 12, "bosh sahifa karuseli ≤12 slayd (" + dots + ")");
      await rp.goto(B + "/Configurator"); await rp.waitForSelector(".cfg-tools"); await rp.waitForTimeout(800);
      const cfg = await rp.evaluate(() => { const v = document.querySelector(".cfg-viewport").getBoundingClientRect(), t = document.querySelector(".cfg-tools").getBoundingClientRect();
        return { stage: getComputedStyle(document.querySelector(".cfg-stage")).display, vpos: getComputedStyle(document.querySelector(".cfg-viewport")).position, gap: Math.round(t.top - v.bottom), over: document.documentElement.scrollWidth - innerWidth }; });
      ok(cfg.stage === "contents" && cfg.vpos === "sticky" && cfg.gap >= 0 && cfg.over <= 0, "3D konstruktor (mobil): faqat oyna yopishqoq, tugmalar oyna ostida, gorizontal scroll yo'q");
      await rp.evaluate(() => scrollTo(0, 700)); await rp.waitForTimeout(500);
      const cover = await rp.evaluate(() => { const v = document.querySelector(".cfg-viewport").getBoundingClientRect(), s = document.querySelector("#cfgSummary").getBoundingClientRect(); const hit = document.elementFromPoint(v.left + v.width / 2, v.top + 20); return !!hit && !!hit.closest(".cfg-viewport") && v.top >= 0; });
      ok(cover, "3D konstruktor: aylantirganda oyna tepada qoladi, matn uning ustida chiqmaydi");
      await rp.goto(B + "/Contact"); await rp.waitForTimeout(1800); await rp.evaluate(() => scrollTo(0, 600)); await rp.waitForTimeout(400);
      const cls = await rp.evaluate(() => window.__cls);
      ok(cls < 0.02, "Aloqa sahifasi: yuklanganda kontent sakramaydi (CLS " + cls.toFixed(3) + ")");
      await rctx.close(); }
    /* 4h) AI yordamchi (faqat standart savollar): tugma joylashuvi, tezkor savollar, tavsiya, xato/qayta urinish, tarix, klaviatura */
    for (const [label, vp, mob] of [["desktop", { width: 1440, height: 900 }, false], ["mobil", { width: 390, height: 844 }, true]]) {
      const actx = await newCtx({ viewport: vp, isMobile: mob, hasTouch: mob }); const ap = await actx.newPage();
      const aerrs = []; ap.on("pageerror", e => aerrs.push(e.message));
      await ap.goto(B + "/"); await ap.waitForSelector("#aiFab");
      const g = await ap.evaluate(() => { const f = document.getElementById("aiFab").getBoundingClientRect(), t = document.querySelector(".to-top"), tr = t && t.getBoundingClientRect(), nav = document.querySelector(".bottom-nav"), nr = nav && nav.getBoundingClientRect();
        const hit = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { inView: f.right <= innerWidth && f.bottom <= innerHeight && f.left >= 0, overToTop: hit(f, tr), overNav: nr && nr.height > 0 ? hit(f, nr) : false, name: document.getElementById("aiFab").getAttribute("aria-label") }; });
      ok(g.inView && !g.overToTop && !g.overNav && /AI/.test(g.name), label + " AI: tugma pastki o'ngda, 'sahifa boshiga' va pastki panelni yopmaydi");
      await ap.click("#aiFab"); await ap.waitForSelector(".ai-panel:not([hidden])"); await ap.waitForTimeout(500);   // ochilish animatsiyasi tugasin
      const pn = await ap.evaluate(() => { const r = document.querySelector(".ai-panel").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), over: document.documentElement.scrollWidth - innerWidth, chips: document.querySelectorAll(".ai-suggest .ai-chip").length, title: document.querySelector(".ai-title strong").textContent, inputs: document.querySelectorAll(".ai-panel textarea, .ai-panel input").length }; });
      ok(pn.title === "YasinDoors AI" && pn.chips === 14 && pn.over <= 0 && (mob ? pn.w === 390 : pn.w <= 392), label + " AI: oyna ochildi, 14 ta tezkor savol, gorizontal scroll yo'q (" + pn.w + "×" + pn.h + ")");
      ok(pn.inputs === 0, label + " AI: erkin matn kiritish maydoni yo'q");
      // tezkor savol → haqiqiy ma'lumot + mahsulot kartasi
      await ap.locator(".ai-chip", { hasText: "MDF eshiklar narxi qancha?" }).click(); await ap.waitForSelector(".ai-card");
      const card = await ap.evaluate(() => { const c = document.querySelector(".ai-card"); return { href: c.getAttribute("href"), img: !!c.querySelector("img").getAttribute("src"), price: /so‘m/.test(c.textContent) }; });
      ok(/^\/Product\?id=/.test(card.href) && card.img && card.price, label + " AI: kartada rasm, narx va mahsulot havolasi");
      // har javobdan keyin «Barcha savollar» → 14 ta savolning hammasi qaytadi
      for (const [q, re] of [["Qaysi viloyatlarga yetkazib berasiz?", /Samarqand.*Sirdaryo.*Toshkent.*Navoiy/s], ["Ish vaqtingiz qanday?", /09:00–17:00/], ["Siz bilan qanday bog‘lanish mumkin?", /\+998 93 300 20 20/], ["Boshqa savolim bor.", /menejerimiz javob beradi/]]) {
        await ap.locator(".ai-chip--all").last().click(); await ap.waitForTimeout(200);
        ok((await ap.locator(".ai-suggest .ai-chip").count()) === 14, label + " AI: «Barcha savollar» 14 ta savolni qaytardi");
        await ap.locator(".ai-chip", { hasText: q }).last().click(); await ap.waitForTimeout(700);
        const txt = await ap.evaluate(() => Array.from(document.querySelectorAll(".ai-row--bot .ai-text")).pop().textContent);
        ok(re.test(txt), label + " AI: «" + q + "» → to'g'ri javob");
      }
      ok(await ap.evaluate(() => !!document.querySelector('.ai-link[href="tel:+998933002020"]') && !!document.querySelector('.ai-link[href^="https://www.google.com/maps?q=40.160167,67.833500"]')), label + " AI: telefon va Google Maps havolalari");
      // tavsiya suhbati (faqat tugmalar)
      await ap.locator(".ai-chip--all").last().click(); await ap.locator(".ai-chip", { hasText: "Qaysi eshikni tanlashni tavsiya qilasiz?" }).last().click(); await ap.waitForTimeout(600);
      for (let i = 0; i < 4; i++) { const c = ap.locator(".ai-suggest .ai-chip:not(.ai-chip--all)").first(); if (!(await c.count())) break; await c.click(); await ap.waitForTimeout(600); }
      ok((await ap.locator(".ai-card").count()) >= 2, label + " AI: tavsiya suhbati oxirida mahsulotlar ko'rsatildi");
      // «Butun ekran» (kompyuterda): panel butun oynani egallaydi, qayta bosilsa qaytadi; telefonda tugma yo'q
      if (!mob) {
        await ap.click("[data-ai-full]"); await ap.waitForTimeout(300);
        const full = await ap.evaluate(() => { const r = document.querySelector(".ai-panel").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), iw: innerWidth, ih: innerHeight, pressed: document.querySelector("[data-ai-full]").getAttribute("aria-pressed"), over: document.documentElement.scrollWidth - innerWidth }; });
        ok(full.w === full.iw && full.h === full.ih && full.pressed === "true" && full.over <= 0, "desktop AI: «Butun ekran» panelni butun oynaga kengaytirdi");
        await ap.keyboard.press("Escape"); await ap.waitForTimeout(300);
        const back = await ap.evaluate(() => ({ w: Math.round(document.querySelector(".ai-panel").getBoundingClientRect().width), open: !document.querySelector(".ai-panel").hidden }));
        ok(back.open && back.w <= 392, "desktop AI: Esc butun ekrandan chiqaradi (chat yopilmaydi)");
        await ap.click("[data-ai-full]"); await ap.click("[data-ai-full]"); await ap.waitForTimeout(200);
      } else ok(!(await ap.locator("[data-ai-full]").isVisible()), "mobil AI: «Butun ekran» tugmasi yo'q (oyna allaqachon to'liq ekran)");
      // xato → qayta urinish
      await ap.route("**/api/assistant", r => r.abort());
      await ap.locator(".ai-chip--all").last().click(); await ap.locator(".ai-chip", { hasText: "Ish vaqtingiz qanday?" }).last().click(); await ap.waitForSelector(".ai-retry", { timeout: 8000 });
      await ap.unroute("**/api/assistant");
      await ap.click(".ai-retry"); await ap.waitForTimeout(900);
      ok((await ap.locator(".ai-retry").count()) === 0 && /09:00–17:00/.test(await ap.evaluate(() => Array.from(document.querySelectorAll(".ai-row--bot .ai-text")).pop().textContent)), label + " AI: xatodan keyin «Qayta urinish» ishladi");
      // tarix: qayta yuklashdan keyin saqlanadi; tozalash ishlaydi; Escape yopadi, fokus tugmaga qaytadi
      await ap.reload(); await ap.waitForSelector("#aiFab"); await ap.click("#aiFab"); await ap.waitForSelector(".ai-panel:not([hidden])");
      ok((await ap.locator(".ai-row--user").count()) >= 3, label + " AI: chat tarixi qayta yuklashdan keyin saqlangan");
      await ap.click("[data-ai-clear]"); await ap.waitForTimeout(300);
      ok((await ap.locator(".ai-row--user").count()) === 0 && !(await ap.evaluate(() => localStorage.getItem("yd_ai_v1"))), label + " AI: tarixni tozalash ishladi");
      await ap.keyboard.press("Escape"); await ap.waitForTimeout(300);
      ok((await ap.locator(".ai-panel:not([hidden])").count()) === 0 && (await ap.evaluate(() => document.activeElement.id)) === "aiFab", label + " AI: Escape yopadi, fokus tugmaga qaytadi");
      ok(aerrs.length === 0, label + " AI: JS xatolari yo'q " + JSON.stringify(aerrs.slice(0, 2)));
      await actx.close();
    }
    /* 4i) Konstruktor: katalog fotolari (2D rejim) — tanlash, zoom, fon, narx, savat, 3D ga o'tish; desktop + mobil */
    for (const [label, vp, mob] of [["desktop", { width: 1366, height: 800 }, false], ["mobil", { width: 390, height: 844 }, true]]) {
      const pctx = await newCtx({ viewport: vp, isMobile: mob, hasTouch: mob }); const pp = await pctx.newPage(); const perr = [];
      pp.on("pageerror", e => perr.push(e.message));
      await pp.goto(B + "/Configurator?photo=sand-duo"); await pp.waitForSelector("#cfgPhotoImg");
      await pp.waitForFunction(() => document.getElementById("cfgPhotoImg").naturalWidth > 100);
      ok(await pp.evaluate(() => document.body.classList.contains("cfg-photo-on") && /2D/.test(document.getElementById("cfgPhotoBadge").textContent)), label + " foto rejimi: ?photo ochildi va '2D' belgisi bor");
      ok((await pp.locator("#cfgViewbar:visible").count()) === 0, label + " foto rejimi: 3D burchak tugmalari (Orqa/Yon) ko'rsatilmaydi");
      await pp.click('[data-z="in"]'); await pp.click('[data-z="in"]');
      ok(/scale\(1\.[5-9]/.test(await pp.evaluate(() => document.getElementById("cfgPhotoPan").style.transform)), label + " foto: yaqinlashtirish ishlaydi");
      await pp.click('[data-z="reset"]');
      ok(/scale\(1\)|scale\(1\.000\)/.test(await pp.evaluate(() => document.getElementById("cfgPhotoPan").style.transform)), label + " foto: asl holatga qaytarish");
      if (mob) await pp.click("#cfgSheetOpen");
      const ids = await pp.$$eval('[data-ph="model"]', els => els.map(e => e.dataset.v));
      ok(ids.length >= 8, label + " foto: barcha foto eshiklar ro'yxatda (" + ids.length + ")");
      let allOk = true;
      for (const id of ids) { await pp.click('[data-ph="model"][data-v="' + id + '"]'); await pp.waitForTimeout(80); allOk = allOk && await pp.evaluate(id => document.getElementById("cfgPhotoImg").src.includes(id + ".png"), id); }
      ok(allOk, label + " foto: har bir model tanlanganda rasm almashadi");
      for (const bg of ["light", "wall", "studio"]) { await pp.click('[data-ph="bg"][data-v="' + bg + '"]'); ok(await pp.evaluate(b => document.getElementById("cfgPhotoBg").classList.contains("is-" + b), bg), label + " foto: fon '" + bg + "'"); }
      if (mob) await pp.click("#cfgSheetClose");
      const before = await pp.textContent("#cfgPhotoSummary strong"); await pp.click('[data-ph="qty"][data-d="1"]');
      ok(before !== await pp.textContent("#cfgPhotoSummary strong"), label + " foto: narx soniga qarab darhol yangilanadi");
      await pp.click('#cfgPhotoSummary [data-ph="cart"]');
      ok(await pp.evaluate(() => YD.store.getCart().some(i => i.id === "vetro-grande" && i.qty === 2)), label + " foto: savatga qo'shildi");
      if (mob) await pp.click("#cfgSheetOpen");
      await pp.click('[data-ph="to3d"]'); await pp.waitForTimeout(800);
      ok(await pp.evaluate(() => !document.body.classList.contains("cfg-photo-on") && YDConfigurator.state.cfg.model === "glass" && !document.getElementById("cfgOptions").hidden), label + " foto: 3D ga o'xshash model bilan o'tadi (sozlamalar panel ishlaydi)");
      ok(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + " foto: gorizontal scroll yo'q");
      ok(perr.length === 0, label + " foto: JS xatolari yo'q " + JSON.stringify(perr.slice(0, 2)));
      await pctx.close();
    }
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
