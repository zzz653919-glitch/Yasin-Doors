# YasinDoors — bosh sahifa reklama videosi

> **Holat:** video fayl hali **yaratilmagan**. Sayt videoni qabul qilishga tayyor: fayllarni
> `public/assets/video/` ga qo‘ysangiz, bosh sahifa banneri avtomatik video bilan ishlaydi.
> Fayl bo‘lmasa yoki yuklanmasa — poster-rasm banner ko‘rinadi (sayt buzilmaydi).

## 1. Qaysi fayllar kerak

| Fayl | Format | O‘lcham | Qayerda ko‘rinadi |
|---|---|---|---|
| `public/assets/video/hero-16x9.mp4` | MP4 (H.264), ovozsiz | 1920×1080, 15 s | Kompyuter, planshet, gorizontal telefon |
| `public/assets/video/hero-9x16.mp4` | MP4 (H.264), ovozsiz | 1080×1920, 15 s | Tik (portret) telefon, ekran ≤ 768px |

Faqat bittasi bo‘lsa ham ishlaydi: 9:16 yo‘q bo‘lsa telefonda ham 16:9 ko‘rsatiladi (markazdan kesiladi).

**Muhim — sayt versiyasi “toza” bo‘lsin.** Saytda sarlavha va “Katalogni ko‘rish” tugmasi video
*ustida* HTML sifatida turadi. Shuning uchun saytdagi faylda 13–15 soniyadagi logo/yozuv/tugma
**bo‘lmasin** (aks holda matn ikki marta chiqadi va telefonda tugma bosilmaydigan rasmga aylanadi).
Logotipli yakuniy kadrli to‘liq versiyani Instagram/Telegram/YouTube reklamasi uchun alohida eksport qiling.

## 2. Video generatsiya prompti (Sora / Veo / Runway / Kling / Pika)

Aksariyat AI generatorlar 5–10 soniyalik klip beradi va matnni buzib yozadi. Eng yaxshi natija:
har bir sahnani **alohida klip** sifatida yarating, so‘ng CapCut / Premiere’da birlashtiring,
logotip va yozuvni montajda qo‘shing.

### Umumiy uslub (har bir promptning oxiriga qo‘shing)

```
Photorealistic premium interior commercial, cinematic lighting, soft warm key light with deep shadows,
color palette of matte black, warm white, graphite and champagne-gold/beige accents, high-end
architectural photography look, realistic MDF door materials (smooth matte enamel paint, fine milled
grooves, brushed brass hardware), physically accurate reflections and soft shadows, shallow depth of
field, slow smooth gimbal/dolly camera movement, 24fps, film grain very subtle, no people, no text,
no logos, no watermark.
```

### Negativ prompt

```
text, letters, watermark, logo, people, hands, cartoon, CGI look, plastic texture, warped door,
bent lines, extra handles, flicker, fast cuts, shaky camera, oversaturated colors, lens flare overload,
glitch effects, wooden solid log doors, metal entrance doors
```

### Sahnalar (16:9)

**1-sahna · 0–3 s — kirish**
```
Dark luxurious modern hallway at night, graphite fluted wall panels, a single tall modern matte-black
MDF interior door with thin champagne-gold inlay lines stands in the center. The camera slowly dollies
forward toward the door. A soft warm spotlight from above gradually reveals the door surface,
light gliding across the matte paint. Moody, elegant, quiet.
```

**2-sahna · 3–6 s — detallar (makro)**
```
Extreme close-up macro shots of a premium MDF interior door: slow lateral slide along precise milled
panel grooves, then the brushed brass lever handle catching a warm highlight, then the fine matte
enamel texture of the MDF surface with subtle light falloff. Very shallow depth of field, slow motion.
```

**3-sahna · 6–10 s — turli uslublar**
```
Elegant sequence of different modern MDF interior doors in beautiful interiors, smooth slow camera
slide past each: (1) classic white MDF door with raised panels and gold handle in a bright neoclassical
living room, (2) minimalist graphite flush MDF door with hidden frame in a concrete-and-oak loft,
(3) warm walnut-tone MDF door with frosted glass insert in a cozy beige bedroom corridor.
Soft dissolves between doors, consistent warm lighting.
```

**4-sahna · 10–13 s — eshik ochiladi**
```
A modern matte-black MDF door with gold lines slowly swings open toward the camera; the camera glides
through the doorway into a bright, airy, modern living room with large windows, warm daylight, beige
and white furniture, oak floor. Exposure transitions smoothly from dark hallway to bright room.
Smooth continuous steadicam movement.
```

**5-sahna · 13–15 s — yakuniy kadr (faqat reklama versiyasi uchun)**
```
Calm static wide shot of the bright modern room behind the open MDF door, slight slow push-in,
background softly defocused to leave clean negative space in the center for a logo.
```
Montajda ustiga qo‘shing: **YasinDoors** logotipi, “YasinDoors — Uyingizga yarashadigan uslub.”
yozuvi va pastida “Modellarni ko‘rish” tugmasi (Manrope shrifti, oltin `#c9a66b`, oq `#f5f2ec`, fon qora).

### 9:16 (telefon) versiya

Xuddi shu promptlar, boshiga qo‘shing:
```
Vertical 9:16 composition, door centered and fully visible from floor to top, important details kept
in the middle 60% of the frame, extra headroom at the bottom third for overlay text.
```
Sayt telefonda matnni pastki qismga joylashtiradi — eshik va asosiy harakat kadrning yuqori/o‘rta qismida bo‘lsin.

## 3. Montaj va eksport

- Davomiylik **15 s**, sahnalar orasida 0.4–0.6 s yumshoq dissolve, keskin effektlarsiz.
- Oxirgi kadr birinchi kadrga yumshoq o‘tsin (video takrorlanadi): oxirgi 0.5 s qorong‘ilashib tugashi yetarli.
- **Ovozsiz** eksport qiling (sayt baribir ovozsiz ijro etadi, fayl ham yengillashadi).
- Hajm: 16:9 — **≤ 5 MB**, 9:16 — **≤ 4 MB** (sayt tezligi uchun).

ffmpeg bilan siqish (o‘rnatilgan bo‘lsa):

```bash
ffmpeg -i input-16x9.mov -t 15 -an -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=24" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow -movflags +faststart public/assets/video/hero-16x9.mp4
```

```bash
ffmpeg -i input-9x16.mov -t 15 -an -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 28 -preset slow -movflags +faststart public/assets/video/hero-9x16.mp4
```

`-movflags +faststart` majburiy — usiz video to‘liq yuklanmaguncha boshlanmaydi.
CapCut’da: Export → 1080p, 24/25 fps, H.264, bitrate “Lower/Recommended”, audio o‘chirilgan.

Ixtiyoriy: videoning birinchi kadridan poster yasab, `public/assets/img/hero-poster.svg` o‘rniga
`hero-poster.jpg` (≈150 KB, WebP bo‘lsa yanada yaxshi) qo‘yish va `index.html` dagi `.hero-poster` `src` ni almashtirish mumkin —
shunda video boshlanayotganda o‘tish sezilmaydi.

## 4. Saytda qanday ishlaydi

Kod: `public/index.html` (`.hero--video`), `public/assets/js/hero-video.js`, `public/assets/css/style.css` (“Hero” bo‘limi).

- Avval poster-rasm chiqadi (sahifa tez ochiladi), pastki chetda oltin yuklanish chizig‘i yuradi.
- Video sahifa to‘liq yuklangandan keyin olinadi; boshlanganda poster ustiga silliq paydo bo‘ladi.
- `muted`, `autoplay`, `loop`, `playsinline` — iPhone’da ham avtomatik ijro bo‘ladi.
- Tik telefon ekranida (≤ 768px, portret) `hero-9x16.mp4`, qolganlarida `hero-16x9.mp4`; ekran burilsa almashadi.
- Banner ekrandan chiqsa yoki boshqa tabga o‘tilsa — pauza (batareya va trafik tejaladi).
- O‘ng burchakda to‘xtatish/davom ettirish tugmasi (klaviatura bilan ham ishlaydi) — WCAG 2.2.2 talabi.
- Video **yuklanmaydi** va poster qoladi: fayl yo‘q/xato bo‘lsa, “Data Saver”/2G tarmoqda, yoki
  tizimda “kamroq harakat” (prefers-reduced-motion) yoqilgan bo‘lsa.
- Video dekorativ (`aria-hidden`), sarlavha va tugma oddiy HTML — ekran o‘quvchilar va SEO uchun to‘liq ochiq.

## 5. Tekshirish

1. Fayllarni `public/assets/video/` ga qo‘ying.
2. `npm run dev` → http://localhost:3000 — video poster o‘rnida silliq paydo bo‘lishi kerak.
3. DevTools → telefon rejimi (portret) → sahifani yangilang → 9:16 versiya.
4. DevTools → Network → fayl nomini bloklang → poster-banner qolishi kerak.
