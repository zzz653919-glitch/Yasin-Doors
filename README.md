# YasinDoors — MDF eshiklar internet-do'koni + Admin panel

Faqat MDF eshiklar uchun: ochiq sayt (katalog, savat, sevimlilar, buyurtma) va **admin panel** (`/admin/`) — mahsulotlar, buyurtmalar, mijozlar, ombor, administratorlar, sozlamalar va audit log.

**Texnologiyalar:** HTML5, CSS3, Vanilla JS (frontend) · Node.js serverless API · **libSQL/Turso** (SQLite) ma'lumotlar bazasi · Telegram bot bildirishnomalari. Faqat bitta tashqi bog'liqlik: `@libsql/client`.

---

## Fayl tuzilishi

```
├── public/                    Brauzerga beriladigan hamma narsa (Vercel outputDirectory)
│   ├── index.html, products.html, product-detail.html, about.html,
│   │   favorites.html, cart.html, checkout.html, contact.html, 404.html
│   ├── assets/ (css, js, img)  Ochiq sayt
│   └── admin/                  Admin panel (SPA): index.html, admin.css, js/
├── api/[...path].js           Vercel funksiyasi — barcha /api/* so'rovlari
├── lib/                       Server kodi (brauzerga berilmaydi)
│   ├── router.js              Marshrutlash, sessiya, CSRF, ruxsatlar, xatolar
│   ├── routes-public.js       /api/catalog, /api/order, /api/contact, /api/image/:id
│   ├── routes-admin.js        /api/admin/...
│   ├── auth.js                Parol xeshi (scrypt), sessiya, rollar, login cheklovi, audit
│   ├── store.js               Mahsulot/buyurtma/ombor/mijoz/sozlama mantiqi, statistika
│   ├── db.js                  Baza ulanishi va sxema (jadvallar avtomatik yaratiladi)
│   ├── telegram.js            Telegram bildirishnomalari
│   └── handlers.js            Baza ulanmagan holat uchun zaxira rejim (faqat Telegram)
├── scripts/create-admin.js    Administrator yaratish / parolni tiklash
├── tests/api.test.js          Backend testlari (26 ta)
├── server.js                  Lokal server (public/ + API)
├── vercel.json, package.json, .env.example
```

## Lokal ishga tushirish

Talab: **Node.js 22+**.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run create-admin        # birinchi Super Admin (pastga qarang)
npm run dev                 # http://localhost:3000   ·   admin: http://localhost:3000/admin/
```

Lokal baza `data/yasindoors.db` fayli (hisob kerak emas, gitignore'da). Testlar: `npm test`.

## Ma'lumotlar bazasi

Vercel'da doimiy fayl tizimi yo'q, shuning uchun ishlab chiqarishda **Turso** (libSQL, bepul tarif yetarli) ishlatiladi. Bir xil kod lokalda `file:` bazasi bilan ham ishlaydi.

Jadvallar (`lib/db.js`, birinchi so'rovda avtomatik yaratiladi): `users`, `sessions`, `login_attempts`, `categories`, `products`, `images`, `customers`, `orders`, `order_items`, `order_history`, `stock_movements`, `settings`, `audit_log`.

**Turso'ni ulash:**
1. <https://turso.tech> da hisob oching → **Create database** (masalan `yasindoors`).
2. Baza sahifasidan **URL** (`libsql://...turso.io`) va **Create token** orqali token oling.
3. Bu ikkisi `DATABASE_URL` va `DATABASE_AUTH_TOKEN` bo'ladi (pastda Vercel bosqichlariga qarang).

Katalog bo'sh bo'lsa, ochiq sayt namunaviy (statik) katalogni ko'rsatadi. Admin panelda mahsulot qo'shilishi bilan sayt bazadagi katalogga o'tadi. Dashboard'dagi **«Namunaviy katalogni import qilish»** tugmasi 10 ta namunaviy eshikni (ombor 0) bazaga qo'shadi.

## Birinchi administratorni xavfsiz yaratish

Oldindan belgilangan parol yo'q. Ikki yo'l:

**1) Terminal (tavsiya etiladi)** — parol ekranda ko'rinmaydi va hech qayerda saqlanmaydi (bazada faqat scrypt xeshi):
```bash
npm run create-admin
# Parolni tiklash:  npm run create-admin -- --reset <login>
```
Ishlab chiqarish (Turso) bazasi uchun buyruqni shu bazaning `DATABASE_URL` va `DATABASE_AUTH_TOKEN` qiymatlari bilan ishga tushiring (PowerShell: `$env:DATABASE_URL="libsql://..."; $env:DATABASE_AUTH_TOKEN="..."; npm run create-admin`).

**2) Brauzer orqali (bir martalik)** — serverda uzun tasodifiy `SETUP_TOKEN` belgilang, `/admin/` sahifasi birinchi administrator formasini ko'rsatadi. Administrator yaratilgach u o'chadi; `SETUP_TOKEN` ni olib tashlang.

Parol siyosati: kamida 10 belgi, harf va raqam.

## Rollar va ruxsatlar (server tomonida tekshiriladi)

| | Super Admin | Manager | Operator |
|---|:-:|:-:|:-:|
| Dashboard, buyurtmalarni ko'rish | ✓ | ✓ | ✓ |
| Buyurtma holati/to'lovini o'zgartirish | ✓ | ✓ | ✓ |
| Buyurtmalarni CSV eksport | ✓ | ✓ | — |
| Mahsulot/kategoriya qo'shish, tahrirlash, o'chirish | ✓ | ✓ | ko'rish |
| Mijozlarni tahrirlash | ✓ | ✓ | ko'rish |
| Ombor kirim/chiqim/tuzatish | ✓ | ✓ | ko'rish |
| Sozlamalar | ✓ | ko'rish | — |
| Administratorlar, audit log | ✓ | — | — |

**Qayta tasdiqlash (parol so'raladi, 5 daqiqa amal qiladi):** mahsulot/kategoriya o'chirish, buyurtmani bekor qilish, administratorlarni boshqarish, Telegram yoqish/o'chirish.

## Xavfsizlik

- **Parollar:** scrypt + tasodifiy tuz, timing-safe solishtirish; API hech qachon xeshni qaytarmaydi.
- **Sessiya:** tasodifiy token `HttpOnly`, `SameSite=Strict` (HTTPS'da `Secure`) cookie'da; bazada faqat SHA-256 xeshi. 8 soat, logout'da bekor qilinadi.
- **CSRF:** har bir sessiyaga alohida token (`X-CSRF-Token`) + `Origin` tekshiruvi + `SameSite=Strict`.
- **Login cheklovi:** 15 daqiqada 5 ta xato (login bo'yicha) / 10 ta (IP bo'yicha) → 429. Baza orqali, serverless instansiyalar o'rtasida ham ishlaydi.
- **SQL injection:** barcha so'rovlar parametrlangan. **XSS:** admin interfeysida barcha matn ekranlanadi, qat'iy CSP (`script-src 'self'`, inline skript yo'q), `X-Frame-Options: DENY`.
- **Ruxsatlar:** har bir endpointda serverda tekshiriladi (frontend'da yashirish xavfsizlik hisoblanmaydi).
- **Audit log:** kirish, mahsulot/buyurtma/ombor/foydalanuvchi/sozlama o'zgarishlari. Parollar va tokenlar yozilmaydi; xato javoblarida ichki ma'lumot yo'q.
- **Narxlar** serverda bazadan hisoblanadi (brauzerdan kelgan narxga ishonilmaydi). Rasm yuklashda fayl imzosi tekshiriladi. CSV eksportda formula injection'dan himoya.
- Admin sahifasining HTML qobig'i ommaga ochiq (u faqat kirish formasi), lekin barcha ma'lumotlar himoyalangan API orqali beriladi.

## Buyurtma va ombor mantiqi

Buyurtma saytdan `Yangi` holatida bazaga yoziladi (mijoz telefon bo'yicha avtomatik yaratiladi/yangilanadi). Ombor:
- `Qabul qilindi` (yoki undan keyingi) holatga o'tganda ombor **bir marta** kamayadi;
- bekor qilinsa yoki `Yangi`ga qaytarilsa — **bir marta** qaytariladi;
- bir vaqtda ikki marta bosilsa ham ombor ikki marta o'zgarmaydi (atomik `stock_applied` bayrog'i + tranzaksiya; testlarda tekshirilgan);
- omborda yetarli mahsulot bo'lmasa tasdiqlash rad etiladi (409), hech narsa o'zgarmaydi;
- har bir o'zgarish `stock_movements` jadvalida (kim, qachon, nima uchun) saqlanadi.

## Telegram bildirishnomalari

Token va chat ID **faqat serverda** (muhit o'zgaruvchilari); brauzerga hech qachon chiqmaydi. Yangi buyurtma kelganda xabarda: buyurtma raqami, mijoz, telefon, manzil, mahsulotlar va umumiy summa. Sozlanmagan bo'lsa, qolgan hamma funksiyalar ishlayveradi; admin panel (Sozlamalar) yo'riqnoma va «Sinov xabari» tugmasini ko'rsatadi.

1. Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni nusxalang.
2. Botga xabar yozing (guruh bo'lsa, botni guruhga qo'shing) va `https://api.telegram.org/bot<TOKEN>/getUpdates` ni oching → `chat.id`.
3. `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` ni `.env` (lokal) yoki Vercel Environment Variables'ga kiriting.
4. Qayta deploy/ishga tushiring; Sozlamalar → «Sinov xabarini yuborish».

`ORDER_DRY_RUN=true` — xabarlar Telegram'ga yuborilmaydi, server konsoliga chiqadi (lokal sinov).

## Vercel'ga deploy qilish

1. Loyihani GitHub'ga yuklang (`.env` va `data/` gitignore'da).
2. [vercel.com](https://vercel.com) → **Add New → Project** → repozitoriyni tanlang. **Framework Preset: Other**, **Root Directory: bo'sh**. Build/Output sozlamalari `vercel.json` da (`outputDirectory: public`).
3. **Settings → Environment Variables:**
   - `DATABASE_URL` = `libsql://...turso.io`
   - `DATABASE_AUTH_TOKEN` = Turso tokeni
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (ixtiyoriy)
   - (`SETUP_TOKEN` — faqat birinchi administrator uchun, ixtiyoriy)
4. **Deploy**.
5. Birinchi administratorni yarating (yuqoridagi 1- yoki 2-usul). Keyin `https://<domen>/admin/` ga kiring.
6. Env o'zgartirsangiz — **Deployments → Redeploy**.

Baza ulanmagan bo'lsa: ochiq sayt statik katalog bilan ishlayveradi, buyurtmalar faqat Telegram'ga yuboriladi (zaxira rejim), admin panel esa aniq xabar ko'rsatadi.

## Kontentni tahrirlash

| Nima | Qayerda |
|---|---|
| Mahsulotlar, narxlar, ombor, rasmlar | **Admin panel → Mahsulotlar** |
| Telefon, manzil, ish vaqti, logotip, matnlar, yetkazib berish/kafolat shartlari | **Admin panel → Sozlamalar** |
| Zaxira (statik) katalog va rang/dizayn ro'yxatlari | `public/assets/js/products.js` |
| Dastlabki kontaktlar (baza bo'sh bo'lganda) | `public/assets/js/config.js` |
| Ranglar va dizayn | `public/assets/css/style.css`, `public/admin/admin.css` (`:root`) |
| Loading ekran | `public/assets/js/loader.js`, `public/assets/css/loader.css` |
| Scroll tizimi | `public/assets/js/scroll.js` |
| Bosh sahifa carousel | `public/assets/js/carousel.js`, `public/assets/js/pages/home.js` |

### Ishga tushirishdan oldin to'ldirilishi kerak

- [ ] Sozlamalar'da haqiqiy kontakt ma'lumotlari (bo'sh joylar saytda «Tez orada qo'shiladi» bo'lib ko'rinadi).
- [ ] Bosh sahifadagi «Mijozlar fikrlari» namunaviy matnlarini (`public/index.html`) haqiqiy fikrlarga almashtiring yoki bo'limni olib tashlang.
- [ ] `public/about.html` dagi `[to'ldiriladi]` joylar. Sertifikat yoki kafolatni faqat rasman mavjud bo'lsa yozing.
- [ ] Mahsulot rasmlarini haqiqiy fotolar bilan almashtiring (admin panel orqali yuklanadi, avtomatik kichraytiriladi).
