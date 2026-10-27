#!/usr/bin/env python3
"""
Eshik fotolarini haqiqiy rasm tahriri bilan to'q (premium) rangga o'tkazish.
Kirish: design-src/door-photos/light-cutouts/<id>.png (fonsiz asl kesmalar — o'zgarmaydi).
Chiqish: public/assets/img/doors/photo/dark/<id>.png va kichik rasm photo/thumb/dark/<id>.png.

Usul (CSS filtr emas): rang piksel darajasida o'zgartiriladi.
 - yorqinlik egri chizig'i bilan qoraytiriladi (yog'och tolasi, panel soyalari va yorug'lik nisbati saqlanadi: Y' = lift + k*Y^g);
 - tanlangan to'q rang (yong'oq yoki grafit) yorqinlikka ko'paytiriladi, asl rang tafsiloti ozgina aralashtiriladi;
 - oltin/jez (ilgak, tutqich, chiziqlar) va allaqachon to'q joylar (qora tutqich, ilgak, chuqur soya) himoyalanadi (mask);
 - alfa kanali (shaffof fon) va qirralar o'zgarmaydi — devor/pol rangi tegilmaydi.
Kutubxonalar: numpy pillow scipy.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WALNUT = (0.30, 0.19, 0.12)     # to'q yong'oq
GRAPHITE = (0.26, 0.27, 0.30)   # grafit
FINISH = {
 "classic-royal": WALNUT, "neo-arka": WALNUT, "sand-duo": WALNUT, "crema-classic": WALNUT, "bianco-gold": WALNUT,
 "vetro-bianco": WALNUT, "vetro-grande": WALNUT, "royal-oak": WALNUT, "bianco-due": WALNUT, "griglia-duo": WALNUT,
 "mono-panel": WALNUT, "nero-vitraj": WALNUT, "silver-royal": WALNUT, "bianco-frame": WALNUT, "silver-panel": WALNUT,
 "grey-stripe": GRAPHITE, "fluta-due": GRAPHITE, "nero-line-duo": GRAPHITE, "frassino": GRAPHITE,
}

def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def darken(src, dst, tint):
    im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32) / 255.0
    rgb, a = im[..., :3], im[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    Y = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # oltin/jez: to'yingan iliq (sariq-to'q sariq) rang
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    gold = smooth(sat, 0.42, 0.62) * smooth(r - b, 0.20, 0.34) * (g > 0.55 * r)
    gold = ndi.gaussian_filter(gold.astype(np.float32), 0.8)
    # allaqachon to'q joylar (qora tutqich, ilgak, chuqur soya) — kamroq o'zgaradi
    bright = smooth(Y, 0.28, 0.55)
    w = np.clip(bright * (1.0 - gold), 0, 1)
    # yangi yorqinlik: yog'och tolasi/panel kontrasti saqlanadi, soyalar ko'tariladi (tafsilot yo'qolmasin)
    Yn = 0.045 + 0.27 * np.power(np.clip(Y, 0, 1), 1.25)
    tl = np.array(tint, np.float32); tl = tl / (tl @ np.array([0.2126, 0.7152, 0.0722], np.float32))
    tinted = Yn[..., None] * tl
    # asl rang tafsiloti (shisha, bo'yalgan joylar) ozgina aralashadi
    chroma = rgb - Y[..., None]
    new = np.clip(tinted + 0.18 * chroma * (Yn / np.maximum(Y, 1e-3))[..., None], 0, 1)
    out = rgb * (1 - w[..., None]) + new * w[..., None]
    res = np.dstack([np.clip(out, 0, 1), a])
    img = Image.fromarray((res * 255 + 0.5).astype(np.uint8), "RGBA")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img.save(dst, optimize=True)
    return img

if __name__ == "__main__":
    src_dir, out_dir, thumb_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(thumb_dir, exist_ok=True)
    for pid, tint in FINISH.items():
        sp = os.path.join(src_dir, pid + ".png")
        if not os.path.exists(sp): print("YO'Q", pid); continue
        img = darken(sp, os.path.join(out_dir, pid + ".png"), tint)
        w = 220; h = round(img.height * w / img.width)
        img.resize((w, h), Image.LANCZOS).save(os.path.join(thumb_dir, pid + ".png"), optimize=True)
        print(pid, img.size, os.path.getsize(os.path.join(out_dir, pid + ".png")) // 1024, "KB")
