# YasinDoors — Premium MDF eshiklar internet-do‘koni

Faqat MDF eshiklar uchun zamonaviy internet-do‘kon: katalog, filtr va qidiruv, savat, sevimlilar, buyurtma formasi va buyurtmalarni **Telegram bot** orqali administratorga yuborish.

**Texnologiyalar:** HTML5, CSS3, Vanilla JavaScript. Backend — tashqi kutubxonasiz Node.js (Vercel serverless yoki oddiy `server.js`).

---

## Fayl tuzilishi

```
├── index.html             Bosh sahifa
├── products.html          Katalog (qidiruv, saralash, filtrlar)
├── product-detail.html    Mahsulot sahifasi (?id=<mahsulot-id>)
├── about.html             Biz haqimizda
├── favorites.html         Sevimlilar
├── cart.html              Savat
├── checkout.html          Buyurtma berish
├── contact.html           Aloqa
├── 404.html
├── assets/
│   ├── css/style.css      Barcha uslublar (light/dark tema, responsive)
│   ├── img/doors/*.svg    Eshik tasvirlari (haqiqiy fotolar bilan almashtirish mumkin)
│   ├── img/fallback.svg   Rasm yuklanmasa ko‘rsatiladigan rasm
│   └── js/
│       ├── config.js      Kompaniya kontaktlari (telefon, manzil, ...)
│       ├── products.js    MAHSULOTLAR VA NARXLAR (sayt + server ishlatadi)
│       ├── app.js         Navbar/footer, tema, savat, sevimlilar, toast
│       ├── form-utils.js  Forma validatsiyasi va yuborish
│       ├── theme-init.js  Temani sahifa chizilishidan oldin qo‘llash
│       └── pages/*.js     Har bir sahifaning skripti
├── api/order.js           Vercel funksiyasi: POST /api/order
├── api/contact.js         Vercel funksiyasi: POST /api/contact
├── lib/handlers.js        Validatsiya, narxni qayta hisoblash, Telegram’ga yuborish
├── lib/vercel-adapter.js
├── server.js              Lokal / VPS uchun server (statik fayllar + API)
├── .env.example           Muhit o‘zgaruvchilari namunasi
└── package.json
```

---

## Lokal ishga tushirish

Talab: **Node.js 18+** (`node -v`).

```bash
cp .env.example .env      # Windows: copy .env.example .env
node server.js
```

Brauzerda: <http://localhost:3000>

- `.env` ichida `ORDER_DRY_RUN=true` bo‘lsa, buyurtmalar Telegram’ga yuborilmaydi — xabar matni server konsoliga chiqadi. Sinov uchun qulay.
- HTML fayllarni to‘g‘ridan-to‘g‘ri ochish (`file://`) ham ishlaydi: katalog, savat va sevimlilar ishlaydi, lekin buyurtma/aloqa formalari server talab qiladi.

---

## Telegram integratsiyasini sozlash

Bot tokeni **faqat serverda** (environment variable) saqlanadi — frontend JavaScript’da hech qachon bo‘lmaydi. Brauzer faqat `/api/order` ga so‘rov yuboradi, serverning o‘zi Telegram’ga murojaat qiladi.

1. **Bot yarating.** Telegram’da [@BotFather](https://t.me/BotFather) → `/newbot` → nom bering. Bergan tokenni nusxalang (`123456789:AA...`).
2. **Chat ID ni aniqlang.**
   - *Shaxsiy chat:* botingizga istalgan xabar yozing, so‘ng brauzerda oching:
     `https://api.telegram.org/bot<TOKEN>/getUpdates` → javobdagi `"chat":{"id": ...}` qiymati.
   - *Guruh:* botni guruhga qo‘shing, guruhda xabar yozing va yuqoridagi havolani oching. Guruh ID odatda `-100` bilan boshlanadi.
3. **`.env` ni to‘ldiring:**
   ```env
   TELEGRAM_BOT_TOKEN=123456789:AA...
   TELEGRAM_CHAT_ID=-1001234567890
   ORDER_DRY_RUN=false
   ```
4. Serverni qayta ishga tushiring va saytdan sinov buyurtmasi bering.

Agar token/chat ID sozlanmagan bo‘lsa, sayt mijozga "xizmat hozircha sozlanmagan" degan tushunarli xabar ko‘rsatadi, serverda esa ogohlantirish logga yoziladi.

**Xavfsizlik choralari (allaqachon qo‘shilgan):**
- Narxlar serverda `products.js` asosida qayta hisoblanadi — brauzerdan kelgan narxga ishonilmaydi.
- Majburiy maydonlar va telefon raqami serverda ham tekshiriladi, matnlar uzunligi cheklangan, HTML ekranlanadi.
- Spam-botlar uchun yashirin "honeypot" maydon va IP bo‘yicha oddiy rate-limit (10 daqiqada 5 ta so‘rov).
- `server.js` `.env`, `lib/`, `api/`, `server.js` kabi fayllarni brauzerga bermaydi.

---

## Deploy qilish

### 1-variant: Vercel (tavsiya etiladi, bepul tarif yetarli)

1. Loyihani GitHub’ga yuklang (`.env` `.gitignore` da — u yuklanmaydi).
2. [vercel.com](https://vercel.com) → **Add New → Project** → repozitoriyani tanlang. Framework: **Other**, build buyrug‘i shart emas.
3. **Settings → Environment Variables** bo‘limiga qo‘shing:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (`ORDER_DRY_RUN` qo‘shmang yoki `false`).
4. **Deploy**. Statik sahifalar va `api/order.js`, `api/contact.js` funksiyalari avtomatik ishlaydi.

### 2-variant: VPS / hosting (Node.js mavjud bo‘lsa)

```bash
git clone <repo> yasindoors && cd yasindoors
cp .env.example .env && nano .env      # token va chat ID ni yozing
node server.js                          # yoki: npx pm2 start server.js --name yasindoors
```

Nginx orqali domenni `http://127.0.0.1:3000` ga proxy qiling va HTTPS (masalan, Let’s Encrypt) ulang.

### 3-variant: faqat statik hosting (Netlify, GitHub Pages va h.k.)

Sayt to‘liq ochiladi, lekin formalar ishlashi uchun backend kerak. Backendni Vercel yoki VPS’da alohida joylab, `assets/js/config.js` ichida manzilini ko‘rsating:

```js
apiBase: "https://sizning-backend-domeningiz.uz"
```

(Bu holda backend boshqa domenda bo‘lgani uchun CORS sarlavhalarini qo‘shish kerak bo‘ladi.)

---

## Kontentni tahrirlash

| Nima | Qayerda |
|---|---|
| Mahsulotlar, **narxlar**, ranglar, uslublar, belgilar (Yangi/Mashhur) | `assets/js/products.js` |
| Telefon, email, manzil, ish vaqti, Telegram/Instagram, xarita | `assets/js/config.js` |
| Eshik rasmlari | `assets/img/doors/` — faylni almashtiring yoki `products.js` dagi `image` yo‘lini o‘zgartiring (JPG/WEBP, 4:5 nisbat tavsiya etiladi) |
| Ranglar va dizayn | `assets/css/style.css` boshidagi `:root` o‘zgaruvchilari |
| Bosh sahifadagi 3D carousel: mahsulotlar tartibi va aylanish tezligi | `assets/js/pages/home.js` (`SHOWCASE_ORDER`, `interval`) |
| Loading ekran (faqat sessiyadagi birinchi kirishda; matnlar, maksimal kutish `MAX_WAIT`) | `assets/js/loader.js`, `assets/css/loader.css`. Qayta ko‘rish uchun brauzer konsolida: `sessionStorage.removeItem("yd_intro_seen")` va sahifani yangilang |
| Scroll tizimi: progress chizig‘i, navbar, parallax, bo‘limlar indikatori, back-to-top | `assets/js/scroll.js` (parallax rasmlari va kuchi — `PARALLAX` ro‘yxati), uslublar — `style.css` → "Premium scroll tizimi" |
| Carousel geometriyasi (karta kengligi, oraliq, chuqurlik, burilish) | `style.css` → `.dc { --dc-w; --dc-spacing; --dc-depth; --dc-rotate; --dc-scale }` |

**Yangi mahsulot qo‘shish** — `products.js` dagi `PRODUCTS` ro‘yxatiga yangi obyekt qo‘shing (`id` takrorlanmas bo‘lsin, `color` va `style` qiymatlari `COLORS`/`STYLES` kalitlaridan biri bo‘lsin). Katalog, filtrlar va server avtomatik yangilanadi.

### Ishga tushirishdan oldin to‘ldirilishi kerak

- [ ] `config.js` — haqiqiy kontakt ma’lumotlari (bo‘sh joylar saytda "Tez orada qo‘shiladi" bo‘lib ko‘rinadi).
- [ ] `products.js` — haqiqiy narxlar (hozirgilari **namunaviy**).
- [ ] `index.html` — "Mijozlar fikrlari" bo‘limidagi namunaviy matnlarni haqiqiy, mijoz roziligi bilan olingan fikrlarga almashtiring (yoki bo‘limni olib tashlang).
- [ ] `about.html` — `[to‘ldiriladi]` deb belgilangan joylar (tashkil topgan yil, materiallar yetkazib beruvchilari, kafolat shartlari, yetkazib berish hududlari). Sertifikat yoki kafolatlarni faqat ular rasman mavjud bo‘lsa yozing.
- [ ] Eshik rasmlarini haqiqiy mahsulot fotolari bilan almashtirish (ixtiyoriy, lekin tavsiya etiladi).
