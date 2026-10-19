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
├── tests/api.test.js          Backend integratsiya testlari
├── tests/audit.test.js        Audit testlari: validatsiya, statistika qoidalari, idempotentlik, Telegram xato yo'li
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

## Mahsulotni saqlash va o'chirish qoidalari

- **Yaratish takrorlanmaydi:** forma har ochilganda noyob kalit yaratadi; ikki marta bosish yoki «server yaratdi, javob yo'qoldi» holatida qayta urinish ham bitta mahsulot yaratadi.
- **Ombor to'qnashuvi:** tahrirlash formasi ochilgach qoldiq boshqa joyda o'zgarsa (masalan, buyurtma tasdiqlansa), eski miqdor jimgina bosib yuborilmaydi — maydon yonida tushunarli xabar chiqadi. Miqdor o'zgartirilmasa umuman yuborilmaydi.
- **O'chirish:** tasdiqlash oynasi + parolni qayta tasdiqlash talab qilinadi. **Bajarilmagan** (yangi, qabul qilingan, tayyorlanayotgan, yo'ldagi) buyurtmada qatnashayotgan mahsulot o'chirilmaydi — sababi ko'rsatiladi va «Nofaol qilish» taklif etiladi (saytda ko'rinmaydi, hech narsa yo'qolmaydi). Yakunlangan/bekor qilingan buyurtmalar tarixida mahsulot nomi va narxi saqlanib qoladi.
- Yuklangan, lekin hech qayerga ulanmagan rasmlar 1 kundan keyin avtomatik tozalanadi.
- Katalog o'zgarishlari saytga ~5–30 soniyada yetib boradi (qisqa kesh).

## Statistika hisoblash qoidalari

Dashboarddagi barcha raqamlar bazadan shu qoidalar bo'yicha hisoblanadi:

| Ko'rsatkich | Qoida |
|---|---|
| Jami buyurtmalar | Barcha buyurtmalar (bekor qilinganlar ham, «Holat» diagrammasida alohida ko'rinadi) |
| Bugungi buyurtmalar | Toshkent vaqti bo'yicha bugun yaratilganlar |
| **Umumiy savdo** | **To'langan (`paid`) va bekor qilinmagan** buyurtmalar summasi |
| Kutilayotgan summa | To'lanmagan (`unpaid`) va bekor qilinmagan buyurtmalar summasi |
| Savdoga kirmaydi | Bekor qilingan va qaytarilgan (`refunded`) buyurtmalar |
| O'rtacha chek | Savdo ÷ to'langan buyurtmalar soni |
| Savdo grafigi | Shu savdo qoidasi, buyurtma yaratilgan kun bo'yicha (yig'indisi «Umumiy savdo» bilan mos) |
| Eng ko'p sotilgan | Qabul qilingan va undan keyingi (bekor qilinmagan) buyurtmalardagi miqdor |
| Mijoz xarid summasi | To'langan va bekor qilinmagan buyurtmalar |

Cheklov: bazada to'lov sanasi saqlanmaydi, shuning uchun grafik to'lov kuni emas, buyurtma yaratilgan kun bo'yicha chiziladi.

## 3D eshik konstruktori (`/configurator.html`)

Mijoz model, naqsh, rang, qoplama, tutqich, ochilish tomoni, o'lcham, rom va dekorni tanlaydi; natija 3D da darhol yangilanadi (aylantirish, zoom, old/orqa/yon/tutqich ko'rinishlari). Chap — sozlamalar, markaz — 3D, o'ng — buyurtma xulosasi; mobilda sozlamalar pastdan chiqadigan panel. Oldingi holat, boshidan boshlash, havola (`#c=…`), PNG yuklab olish bor. 3D ishlamasa (WebGL yo'q/xato) — 2D zaxira ko'rinish, barcha sozlamalar va buyurtma ishlayveradi (sinash: `?fallback=1`).

**Muhim — haqiqiy 3D model hali yo'q.** Hozir eshik *protsedurali vaqtinchalik model* (kodda yasalgan geometriya: panel, chiziq, geometrik, shishali naqshlar). Haqiqiy fotorealistik model uchun `.glb` fayl kerak. Uni ulash: `configurator-3d.js` dagi `setDoorBuilder(fn)` kanca orqali o'z quruvchingizni bering (Three.js `GLTFLoader` qo'shiladi). Shu vaqtgacha ko'rinish taxminiy, ishlab chiqarish namunasi emas.

**Narx faqat tasdiqlangan qoidalardan.** Admin → Sozlamalar → «3D konstruktor narxlari»da kiritilgan qiymatlar ishlatiladi. Tanlangan biror qism uchun qoida **bo'sh** bo'lsa, narx taxmin qilinmaydi: «Narx so'raladi» ko'rsatiladi, buyurtma narxi 0 bo'lib, menejer admin paneldagi buyurtma oynasida 1 dona narxini belgilaydi. Formula: `yakuniy narx = (model asosiy narxi + qoplama + yog'och rang + tutqich + tutqich rangi + rom + dekor + shisha + nostandart o'lcham + katta o'lcham (m²) + ixtiyoriy boshqa xarajat) × soni`; har tarkibiy qism bir marta hisoblanadi. Katta o'lcham qo'shimchasi faqat standart 800×2000 (1,6 m²) dan oshgan maydonga qo'llanadi, kichik eshikka chegirma yo'q. Narx serverda qayta hisoblanadi (klient yuborgan summa e'tiborga olinmaydi); mijoz ko'rgan narx server narxidan farq qilsa (admin o'zgartirgan) buyurtma 409 bilan to'xtaydi, mijoz yangi narxni ko'rib qayta tasdiqlaydi. Buyurtma narxi va hisob-kitob satrlari buyurtma vaqtida saqlanadi — admin keyin narxni o'zgartirsa, eski buyurtmalar o'zgarmaydi. Katalogda yo'q uslublar yo'q deb hisoblanadi; tutqich shakli/rangi, rom, dekor «Buyurtma asosida» deb belgilangan — ishlab chiqarilishini menejer tasdiqlaydi.

Buyurtma `POST /api/configurator/order`: konfiguratsiya serverda qat'iy tekshiriladi (`configurator-data.js` mijoz va serverda umumiy), idempotentlik kaliti, tezlik cheklovi, honeypot; 3D rasm (ixtiyoriy) `images` jadvaliga, konfiguratsiya `order_items.config` ga saqlanadi; Telegram xabarida barcha tanlovlar va narx holati bor. Baza ulanmagan rejimda faqat Telegram'ga yuboriladi. Three.js `public/assets/vendor/three/` da lokal (MIT, CDN yo'q).

## Mijoz akkauntlari (Вход / Регистрация)

Sayt mijozlari uchun alohida akkaunt tizimi (xodimlar/admin tizimidan **alohida**: boshqa jadval `accounts`, boshqa cookie `yd_acc`; mijoz akkauntida rol yo'q, shuning uchun frontend orqali admin bo'lib bo'lmaydi). Interfeys rus tilida.

**Sahifalar:** `login.html`, `register.html`, `forgot-password.html`, `reset-password.html`, `profile.html` (profil, parol o'zgartirish, sevimlilar, buyurtmalar), `privacy.html`, `terms.html`. Navbar'da «Вход / Регистрация», kirgach profil menyusi. Frontend: `assets/js/account.js` (holat, navbar, sevimlilar sinxroni), `auth-ui.js`, `pages/auth.js`, `pages/profile.js`, `assets/css/account.css`.

**API (`lib/routes-account.js`):** `GET /api/account/me`, `POST register | login | logout | forgot | reset | reset/check | password`, `PUT profile`, `GET/PUT favorites`, `GET orders`. Admin: `GET /api/admin/accounts`, `PUT /api/admin/accounts/:id/status` (bloklash; faqat Super Admin, parol tasdig'i bilan). Admin panelda «Sayt foydalanuvchilari» bo'limi (Manager ko'ra oladi, Operator — yo'q).

**Jadvallar** (`lib/db.js`, avtomatik yaratiladi/migratsiya qilinadi): `accounts`, `account_sessions`, `password_resets`, `account_favorites`; `orders.account_id` ustuni (migratsiya v5).

**Xavfsizlik:** scrypt xesh; sessiya tokeni `HttpOnly` + `SameSite=Strict` (+ HTTPS'da `Secure`), bazada faqat SHA-256; CSRF tokeni + Origin tekshiruvi; kirishda 15 daqiqada 5 ta xato (akkaunt) / 10 ta (IP) → 429, ro'yxatdan o'tish va tiklashga ham limit; login xabari akkaunt bor-yo'qligini bildirmaydi; email/telefon o'zgartirish va parol almashtirish joriy parolni talab qiladi, parol o'zgarganda boshqa sessiyalar tugaydi; bloklangan akkaunt sessiyasi darhol o'chadi; parametrlangan SQL.

**Parolni tiklash:** havola bir martalik, 1 soat amal qiladi (bazada faqat xeshi), URL fragmentida (`#t=...`) yuboriladi, ishlatilgach barcha sessiyalar tugaydi. Email yuborish uchun `.env` da `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` kerak (qarang `.env.example`). Sozlanmagan bo'lsa tiklash sahifasi aniq xabar beradi va tugma o'chiriladi. Lokal sinov: `MAIL_DRY_RUN=true` — havola server konsoliga chiqadi.

**Bog'lanishlar:** sevimlilar akkauntga bog'lanadi (kirganda lokal va server ro'yxati birlashadi, chiqqanda qurilmadan tozalanadi). Kirgan mijozning buyurtmasi (oddiy va 3D konstruktor) serverda sessiya orqali `account_id` bilan saqlanadi va profilda ko'rinadi; mehmon buyurtmasi avvalgidek ishlaydi. **Savat** hozircha qurilmada (localStorage) qoladi — akkauntga saqlanmaydi.

**Admin integratsiyasi:** «Sayt foydalanuvchilari» bo'limi real bazadan: statistika kartalari (jami, bugun, 7 kun, hozir saytda), qidiruv, holat filtri, ustun bo'yicha saralash, profil oynasi (ma'lumotlar, buyurtmalar, kirish tarixi), bloklash va akkauntni o'chirish (faqat Super Admin, parol tasdig'i bilan; buyurtmalar saqlanadi). Bo'lim va Dashboard har 30 soniyada avtomatik yangilanadi; Dashboard'da «Ro'yxatdan o'tgan foydalanuvchilar» kartasi bor. Kirish urinishlari `account_login_log` jadvalida (muvaffaqiyatli/muvaffaqiyatsiz, IP, brauzer; email/telefon niqoblangan, parol yozilmaydi, 90 kundan keyin tozalanadi). «Oxirgi faollik» — sessiya oxirgi ishlatilgan vaqt (5 daqiqa aniqlikda). Migratsiya v6: `accounts.last_seen_at`.

**Eslatma:** `privacy.html` va `terms.html` matnlari tizim haqiqatan qiladigan ishlarni tasvirlaydigan qisqa shablon — nashrdan oldin egasi/yurist ko'rib chiqsin.

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
