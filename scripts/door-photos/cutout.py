#!/usr/bin/env python3
"""
Eshik fotosuratlarining orqa fonini olib tashlash (haqiqiy shaffof PNG).

Usul: har bir foto uchun eshik + naличник (romi) konturi taxminiy ko'pburchak bilan belgilanadi (tashqi qirrasi ±10 px aniqlikda),
so'ng GrabCut shu tor chegara polosasida (ko'pburchak ichi/tashqarisi ±BAND px) rang modeliga ko'ra aniq qirrani topadi.
Natija: yumshoq (anti-alias) alfa, qirra piksellari ichki rangdan tiklanadi (devor rangi "halo" bo'lib qolmasin).

Ishlatish (kutubxonalar: opencv-python-headless numpy pillow scipy):
    python3 scripts/door-photos/cutout.py <kirish_papka> <chiqish_papka>
Kirish: door37.jpg ... (nomlar POLYS kalitlariga mos). Chiqish: <nom>.png (to'liq o'lcham) va <nom>-crop.png (obyekt bo'yicha qirqilgan).
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

BAND = 11   # chegara polosasi kengligi (px)
BANDS = {k: 8 for k in ("door49L", "door49R", "door50", "door52", "door54", "door57", "door60", "door61", "door64", "door65", "door69")}
BANDS.update({"door37": 5, "door40": 5, "door42": 8, "door44": 5, "door45": 6})   # devor va eshik rangi yaqin bo'lgan fotolarda polosa tor: kontur ko'pburchakka ko'proq tayanadi

POLYS = {
 "door37": [(104,113),(840,115),(840,131),(820,150),(820,205),(823,222),(815,226),(812,300),(805,600),(795,900),(784,1100),(780,1212),(172,1212),(172,1105),(160,900),(148,600),(138,226),(127,222),(128,205),(133,205),(133,150),(105,132)],
 "door38": [(143,125),(737,163),(735,200),(726,400),(712,600),(695,800),(675,1000),(655,1150),(650,1185),(612,1150),(605,1120),(262,1145),(250,1155),(247,1225),(213,1222),(205,1100),(190,900),(170,600),(150,300)],
 "door39": [(180,70),(773,70),(760,300),(752,600),(740,900),(727,1190),(727,1198),(680,1198),(680,1189),(290,1189),(290,1198),(232,1198),(232,1190),(218,900),(203,600),(190,300)],
 "door40": [(115,90),(220,92),(220,100),(780,100),(780,92),(880,92),(880,104),(855,122),(855,198),(850,205),(838,270),(836,520),(825,820),(802,1133),(752,1140),(752,1240),(250,1240),(247,1140),(198,1135),(180,820),(165,520),(158,270),(155,205),(143,198),(143,122),(115,104)],
 "door42": [(235,195),(680,200),(675,300),(668,600),(660,900),(655,1070),(612,1072),(610,1060),(308,1060),(304,1085),(262,1086),(255,1000),(247,700),(240,400)],
 "door44": [(178,72),(815,65),(797,400),(775,800),(759,1100),(752,1232),(703,1234),(699,1222),(290,1219),(284,1224),(238,1222),(233,1100),(217,800),(198,450)],
 "door45": [(125,62),(860,66),(860,96),(835,100),(835,150),(838,160),(830,172),(828,300),(818,600),(806,900),(796,1140),(796,1246),(745,1247),(741,1231),(222,1231),(218,1242),(166,1242),(165,1130),(160,800),(155,400),(152,176),(145,170),(148,158),(148,96),(125,86)],
 "door41": [(188,22),(795,18),(790,100),(775,300),(765,500),(752,800),(735,1196),(690,1196),(300,1196),(255,1196),(245,900),(224,600),(207,300),(193,100)],
 # 2-partiya (egasi yuborgan qo‘shimcha fotolar; nomlar: 49L/49R — bitta fotodagi chap/o‘ng eshik)
 "door49L": [(35, 318), (480, 324), (480, 342), (468, 350), (466, 400), (464, 800), (462, 1100), (462, 1182), (425, 1182), (425, 1170), (105, 1170), (105, 1182), (65, 1182), (65, 1100), (62, 800), (60, 400), (58, 350), (45, 342)],
 "door49R": [(505, 335), (945, 333), (945, 350), (922, 356), (918, 410), (912, 800), (905, 1100), (902, 1184), (862, 1184), (862, 1170), (555, 1170), (553, 1184), (515, 1184), (516, 1100), (520, 800), (522, 410), (516, 404), (505, 350)],
 "door50": [(148, 45), (785, 42), (785, 70), (752, 78), (752, 152), (745, 160), (745, 600), (740, 1000), (722, 1232), (668, 1232), (662, 1200), (275, 1205), (270, 1235), (210, 1235), (205, 1000), (195, 600), (190, 160), (172, 150), (172, 100)],
 "door52": [(108, 100), (882, 95), (882, 125), (858, 132), (858, 200), (850, 210), (845, 500), (830, 900), (795, 1228), (738, 1228), (735, 1192), (262, 1192), (255, 1228), (190, 1228), (188, 900), (170, 600), (150, 300), (145, 208), (133, 205), (130, 130), (108, 128)],
 "door54": [(180, 125), (758, 142), (758, 170), (735, 178), (735, 225), (728, 235), (722, 600), (702, 1000), (695, 1230), (655, 1230), (650, 1224), (285, 1230), (275, 1250), (230, 1250), (225, 1000), (212, 600), (205, 228), (200, 222), (200, 210), (180, 205)],
 "door57": [(140, 160), (805, 168), (805, 185), (775, 190), (775, 250), (748, 260), (735, 600), (722, 1000), (713, 1205), (665, 1205), (660, 1195), (258, 1195), (220, 1205), (178, 1205), (172, 900), (165, 600), (160, 262), (160, 248), (150, 240), (140, 238)],
 "door60": [(113, 40), (793, 42), (795, 700), (790, 1195), (212, 1205), (207, 1200), (115, 1198)],
 "door61": [(152, 76), (820, 86), (820, 102), (792, 110), (785, 215), (770, 300), (762, 600), (740, 1000), (712, 1232), (655, 1232), (650, 1215), (300, 1218), (296, 1232), (240, 1232), (238, 1000), (225, 600), (213, 300), (198, 215), (185, 100), (152, 98)],
 "door64": [(195, 110), (795, 98), (795, 125), (772, 130), (772, 190), (770, 300), (765, 700), (755, 1100), (745, 1255), (698, 1255), (690, 1198), (305, 1198), (300, 1255), (240, 1255), (235, 1100), (225, 700), (218, 300), (215, 190), (200, 180)],
 "door65": [(185, 2), (765, 2), (765, 600), (760, 1265), (185, 1268)],
 "door69": [(222, 125), (780, 118), (780, 150), (750, 158), (750, 200), (748, 600), (740, 1000), (738, 1250), (695, 1250), (690, 1225), (305, 1225), (300, 1250), (245, 1250), (243, 1000), (246, 600), (247, 200), (240, 160), (225, 155)],
}

def cutout(path, poly, out_dir, name):
    BAND = BANDS.get(name, globals()["BAND"])
    img = cv2.imread(path)
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*BAND+1, 2*BAND+1))
    inner = cv2.erode(m, k); outer = cv2.dilate(m, k)
    gc = np.full((h, w), cv2.GC_BGD, np.uint8)
    gc[outer > 0] = cv2.GC_PR_BGD
    gc[m > 0] = cv2.GC_PR_FGD
    gc[inner > 0] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, gc, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
    fg[inner > 0] = 1; fg[outer == 0] = 0
    # tozalash: kichik teshik va dog'larni yopish, eng katta bo'lakni saqlash, qirrani silliqlash
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    fg = ndi.binary_fill_holes(fg).astype(np.uint8)
    lab, n = ndi.label(fg)
    if n > 1:
        sizes = ndi.sum(fg, lab, range(1, n + 1)); fg = (lab == 1 + int(np.argmax(sizes))).astype(np.uint8)
    fgf = cv2.GaussianBlur(fg.astype(np.float32) * 255, (0, 0), 3.0)
    fg = (fgf > 127).astype(np.uint8)
    # eshik qirralari to'g'ri chiziq: kontur ko'pburchak bilan soddalashtiriladi (devor teksturasidan qirra "tishlari" yo'qoladi)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    big = max(cnts, key=cv2.contourArea)
    approx = cv2.approxPolyDP(big, 2.2, True)
    fg = np.zeros_like(fg); cv2.fillPoly(fg, [approx], 1)
    alpha = cv2.GaussianBlur(fg.astype(np.float32) * 255, (0, 0), 0.9)   # yumshoq anti-alias
    alpha = np.clip(alpha, 0, 255).astype(np.uint8)
    # qirra piksellari rangini ichki (to'liq shaffof bo'lmagan) piksellardan tiklash: devor rangi halo bermasin
    core = cv2.erode(fg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    rgb = img[iy, ix]
    edge = (alpha > 0) & (~core)
    out = img.copy(); out[edge] = rgb[edge]
    rgba = cv2.cvtColor(out, cv2.COLOR_BGR2BGRA); rgba[:, :, 3] = alpha
    os.makedirs(out_dir, exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, name + ".png"), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    ys, xs = np.where(alpha > 8)
    pad = 4
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + 1 + pad); y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad)
    crop = Image.fromarray(cv2.cvtColor(rgba[y0:y1, x0:x1], cv2.COLOR_BGRA2RGBA))
    crop.save(os.path.join(out_dir, name + "-crop.png"), optimize=True)
    return {"name": name, "bbox": [int(x0), int(y0), int(x1), int(y1)], "size": crop.size, "opaque_pct": round(float((alpha > 250).mean()) * 100, 1)}

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    res = []
    for name, poly in POLYS.items():
        p = os.path.join(src, name + ".jpg")
        if os.path.exists(p): res.append(cutout(p, poly, dst, name))
    print(json.dumps(res, ensure_ascii=False, indent=1))
