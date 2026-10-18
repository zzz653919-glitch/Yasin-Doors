/**
 * YasinDoors — MDF eshik konstruktori: variantlar, tekshiruv, narx dvigateli, havola kodi.
 * Bu modul ham brauzerda (window.YD_CFG), ham serverda (require) ishlatiladi — qoidalar bir joyda.
 *
 * MUHIM (haqiqiylik): katalogda tasdiqlangan variantlar (modellar, ranglar, qoplama turlari) alohida belgilangan
 * (`catalog: true`). Qolgan variantlar (tutqich shakli/rangi, rom, dekor, nostandart o'lcham) vizual loyiha uchun
 * mavjud va `onRequest: true` bilan belgilangan: ularning ishlab chiqarilishi va narxi menejer tomonidan tasdiqlanadi.
 * Narx FAQAT admin panelda (Sozlamalar → Konstruktor narxlari) kiritilgan qoidalardan hisoblanadi.
 * Qoida kiritilmagan bo'lsa, narx ko'rsatilmaydi — "Narxni so'rash" chiqadi.
 */
(function (root) {
  "use strict";

  var COLORS = {
    oq:      { name: "Oq",          hex: "#f1efea", wood: false, always: true },
    bej:     { name: "Bej",         hex: "#e3d6bf", wood: false, always: true },
    kulrang: { name: "Kulrang",     hex: "#a9a9a6", wood: false },
    grafit:  { name: "Grafit",      hex: "#45464a", wood: false, always: true },
    qora:    { name: "Qora",        hex: "#1c1c1e", wood: false, always: true },
    eman:    { name: "Och eman",    hex: "#c9a77c", wood: true,  always: true },
    yongoq:  { name: "Yong‘oq",     hex: "#6b4a33", wood: true }
  };

  // style — katalogdagi mos dizayn uslubi (mavjudligini katalogdan tekshirish uchun)
  var MODELS = {
    flat:    { name: "Minimalistik tekis", style: "minimalistik", catalog: true, decor: false, glass: false,
               desc: "Silliq, ortiqcha detalsiz yuza.",
               variants: { plain: "Silliq yuza", groove: "Gorizontal yo‘llar" }, defaultVariant: "plain" },
    classic: { name: "Klassik panelli", style: "klassik", catalog: true, decor: true, glass: false,
               desc: "An’anaviy frezalangan panellar.",
               variants: { p4: "4 ta panel", p6: "6 ta panel", p2: "2 ta vertikal panel" }, defaultVariant: "p4" },
    lines:   { name: "Vertikal chiziqli", style: "minimalistik", catalog: true, decor: true, glass: false,
               desc: "Nozik vertikal frezalar.",
               variants: { l3: "3 ta chiziq", l2: "2 ta chiziq", l5: "5 ta chiziq" }, defaultVariant: "l3" },
    geo:     { name: "Geometrik naqshli", style: "zamonaviy", catalog: true, decor: true, glass: false,
               desc: "To‘g‘ri burchakli geometrik bezak.",
               variants: { frame: "Ramka", cross: "To‘rtlik" }, defaultVariant: "frame", defaultDecor: "gold" },
    glass:   { name: "Shisha elementli", style: "shishali", catalog: true, decor: false, glass: true,
               desc: "Yorug‘lik o‘tkazuvchi shisha qo‘shimchalar.",
               variants: { slot: "Vertikal shisha", bands: "Gorizontal shishalar", grid: "To‘rsimon (loft)" }, defaultVariant: "slot" }
  };

  var COATINGS = {
    emal: { name: "Bo‘yoq (emal)",       desc: "Silliq, yarim yaltiroq", catalog: true },
    mat:  { name: "Matovaya plyonka",    desc: "Mat, bardoshli yuza",    catalog: true },
    tex:  { name: "Teksturali plyonka",  desc: "Yog‘och tekstura",       catalog: true }
  };
  var HANDLE_SHAPES = {
    lever: { name: "Klassik dasta",      onRequest: true },
    bar:   { name: "Zamonaviy vertikal", onRequest: true },
    round: { name: "Dumaloq tutqich",    onRequest: true }
  };
  var HANDLE_FINISHES = {
    gold:   { name: "Oltin-bej metall",     hex: "#c9a25e", onRequest: true },
    black:  { name: "Qora",                 hex: "#1c1c1e", onRequest: true },
    chrome: { name: "Metall (xrom rangi)",  hex: "#cfd2d6", onRequest: true }
  };
  var HINGES = { left: "Chap (tutqich o‘ngda)", right: "O‘ng (tutqich chapda)" };
  var FRAMES = {
    none:  { name: "Rom kerak emas",   onRequest: true },
    same:  { name: "Eshik rangida",    onRequest: true },
    white: { name: "Oq",               onRequest: true },
    black: { name: "Qora",             onRequest: true }
  };
  var DECORS = { none: { name: "Yo‘q" }, gold: { name: "Oltin-bej", hex: "#c9a25e", onRequest: true }, silver: { name: "Kumush", hex: "#cfd2d6", onRequest: true } };
  var GLASS_TYPES = { frosted: { name: "Xira (matli)", catalog: true }, clear: { name: "Tiniq", catalog: true } };

  var LIMITS = { wMin: 600, wMax: 1000, hMin: 1900, hMax: 2200, step: 10, standardW: [600, 700, 800, 900], standardH: 2000, qtyMax: 20 };

  var NOTE = "Konfiguratsiya vizual loyiha hisoblanadi. Ishlab chiqarish imkoniyati va yakuniy narx buyurtmadan keyin menejer tomonidan tasdiqlanadi.";

  var KEYS = ["model", "variant", "color", "coating", "handle", "finish", "hinge", "w", "h", "frame", "decor", "glass", "qty"];

  function has(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
  function intOf(v) {
    if (typeof v === "number" && isFinite(v)) return Math.round(v);
    if (typeof v === "string" && /^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10);
    return NaN;
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function snap(n) { return Math.round(n / LIMITS.step) * LIMITS.step; }

  function defaults() {
    return { model: "classic", variant: "p4", color: "oq", coating: "emal", handle: "lever", finish: "gold", hinge: "left",
             w: 800, h: 2000, frame: "same", decor: "none", glass: "frosted", qty: 1 };
  }

  /**
   * Konfiguratsiyani yaroqli holatga keltiradi (noma'lum/yaroqsiz qiymatlar standart bilan almashtiriladi,
   * o'zaro bog'liqliklar to'g'rilanadi). Foydalanuvchi interfeysi va havoladan yuklashda ishlatiladi.
   */
  function normalize(raw) {
    var d = defaults(), c = {};
    raw = raw || {};
    c.model = has(MODELS, raw.model) ? raw.model : d.model;
    var m = MODELS[c.model];
    c.variant = has(m.variants, raw.variant) ? raw.variant : m.defaultVariant;
    c.color = has(COLORS, raw.color) ? raw.color : d.color;
    c.coating = has(COATINGS, raw.coating) ? raw.coating : d.coating;
    // Yog'och ranglar faqat teksturali plyonkada, oddiy ranglar esa emal/mat plyonkada bo'ladi
    if (COLORS[c.color].wood) c.coating = "tex"; else if (c.coating === "tex") c.coating = "emal";
    c.handle = has(HANDLE_SHAPES, raw.handle) ? raw.handle : d.handle;
    c.finish = has(HANDLE_FINISHES, raw.finish) ? raw.finish : d.finish;
    c.hinge = has(HINGES, raw.hinge) ? raw.hinge : d.hinge;
    var w = intOf(raw.w), h = intOf(raw.h);
    c.w = clamp(snap(isNaN(w) ? d.w : w), LIMITS.wMin, LIMITS.wMax);
    c.h = clamp(snap(isNaN(h) ? d.h : h), LIMITS.hMin, LIMITS.hMax);
    c.frame = has(FRAMES, raw.frame) ? raw.frame : d.frame;
    var decorWanted = has(DECORS, raw.decor) ? raw.decor : (raw.decor === undefined && m.defaultDecor ? m.defaultDecor : "none");
    c.decor = m.decor ? decorWanted : "none";
    c.glass = m.glass && has(GLASS_TYPES, raw.glass) ? raw.glass : d.glass;
    var q = intOf(raw.qty);
    c.qty = clamp(isNaN(q) ? 1 : q, 1, LIMITS.qtyMax);
    return c;
  }

  /**
   * Qat'iy tekshiruv (server): yuborilgan qiymatlarning har biri aynan yaroqli bo'lishi shart.
   * Natija: { ok, cfg, errors: [maydon nomlari] }
   */
  function validate(raw) {
    var errors = [];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, cfg: null, errors: ["config"] };
    var n = normalize(raw);
    KEYS.forEach(function (k) {
      var a = raw[k], b = n[k];
      if (k === "w" || k === "h" || k === "qty") {
        var ai = intOf(a);
        if (isNaN(ai) || ai !== b) errors.push(k);
      } else if (k === "glass" && !MODELS[n.model].glass) {
        // shisha turi faqat shishali modelda ma'noga ega
      } else if (k === "decor" && !MODELS[n.model].decor) {
        if (a !== undefined && a !== "none") errors.push(k);
      } else if (a !== b) errors.push(k);
    });
    return { ok: errors.length === 0, cfg: n, errors: errors };
  }

  /** Katalogga qarab qaysi model/rang mavjudligi. products: [{style,color}] (bo'sh bo'lsa — hammasi mavjud) */
  function availability(products) {
    var styles = {}, colors = {}, any = !!(products && products.length);
    (products || []).forEach(function (p) { if (p.style) styles[p.style] = true; if (p.color) colors[p.color] = true; });
    var out = { models: {}, colors: {} };
    Object.keys(MODELS).forEach(function (k) { out.models[k] = !any || !!styles[MODELS[k].style]; });
    Object.keys(COLORS).forEach(function (k) { out.colors[k] = !any || !!COLORS[k].always || !!colors[k]; });
    return out;
  }

  function isStandardSize(c) { return LIMITS.standardW.indexOf(c.w) !== -1 && c.h === LIMITS.standardH; }

  function title(c) { return MODELS[c.model].name + " · " + COLORS[c.color].name; }

  /** O'qiladigan xulosa qatorlari */
  function describe(c) {
    var m = MODELS[c.model], rows = [];
    rows.push({ key: "model", label: "Model", value: m.name });
    rows.push({ key: "variant", label: "Naqsh varianti", value: m.variants[c.variant] });
    rows.push({ key: "color", label: "Rang", value: COLORS[c.color].name });
    rows.push({ key: "coating", label: "Qoplama", value: COATINGS[c.coating].name });
    if (m.glass) rows.push({ key: "glass", label: "Shisha", value: GLASS_TYPES[c.glass].name });
    rows.push({ key: "handle", label: "Tutqich", value: HANDLE_SHAPES[c.handle].name + ", " + HANDLE_FINISHES[c.finish].name.toLowerCase() });
    rows.push({ key: "hinge", label: "Ochilish tomoni", value: HINGES[c.hinge] });
    rows.push({ key: "size", label: "O‘lcham", value: c.w + " × " + c.h + " mm" + (isStandardSize(c) ? "" : " (nostandart)") });
    rows.push({ key: "frame", label: "Eshik romi", value: FRAMES[c.frame].name });
    if (c.decor !== "none") rows.push({ key: "decor", label: "Dekor", value: DECORS[c.decor].name });
    return rows;
  }

  /* ---------- Havola kodi ---------- */
  function b64encode(s) {
    if (typeof Buffer !== "undefined") return Buffer.from(s, "utf8").toString("base64");
    return btoa(unescape(encodeURIComponent(s)));
  }
  function b64decode(s) {
    if (typeof Buffer !== "undefined") return Buffer.from(s, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(s)));
  }
  function encode(c) {
    return b64encode(KEYS.map(function (k) { return c[k]; }).join("~")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  /** Havola kodini konfiguratsiyaga aylantiradi; yaroqsiz bo'lsa null */
  function decode(code) {
    try {
      if (typeof code !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(code)) return null;
      var s = b64decode(code.replace(/-/g, "+").replace(/_/g, "/"));
      var parts = s.split("~");
      if (parts.length !== KEYS.length) return null;
      var raw = {};
      KEYS.forEach(function (k, i) { raw[k] = (k === "w" || k === "h" || k === "qty") ? parseInt(parts[i], 10) : parts[i]; });
      return normalize(raw);
    } catch (e) { return null; }
  }
  /** Qisqa identifikator (buyurtma xabarlarida va admin panelda ko'rsatiladi) */
  function shortCode(c) {
    var s = encode(c), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return "YDC-" + ("0000000" + h.toString(36).toUpperCase()).slice(-7);
  }

  /* ---------- Narx dvigateli ---------- */
  // Admin panel shu ro'yxat bo'yicha narx kiritish maydonlarini chizadi; server ham shu bo'yicha tekshiradi.
  function names(obj) { return Object.keys(obj).map(function (k) { return { key: k, label: obj[k].name || obj[k] }; }); }
  var PRICE_FIELDS = [
    { group: "base",    label: "Asosiy narx (standart o‘lchamda, 1 dona)", items: names(MODELS) },
    { group: "coating", label: "Qoplama qo‘shimchasi",       items: names(COATINGS) },
    { group: "color",   label: "Yog‘och rang qo‘shimchasi",  items: [{ key: "wood", label: "Yog‘och ranglar (eman, yong‘oq)" }] },
    { group: "handle",  label: "Tutqich shakli qo‘shimchasi", items: names(HANDLE_SHAPES) },
    { group: "finish",  label: "Tutqich rangi qo‘shimchasi",  items: names(HANDLE_FINISHES) },
    { group: "frame",   label: "Eshik romi qo‘shimchasi",     items: names(FRAMES) },
    { group: "decor",   label: "Dekor qo‘shimchasi",          items: [{ key: "gold", label: DECORS.gold.name }, { key: "silver", label: DECORS.silver.name }] },
    { group: "glass",   label: "Shisha turi qo‘shimchasi",    items: names(GLASS_TYPES) },
    { group: "size",    label: "Nostandart o‘lcham qo‘shimchasi", items: [{ key: "custom", label: "Nostandart o‘lcham" }] }
  ];
  var MAX_PRICE = 1000000000;

  function priceNum(v) {
    if (typeof v === "string" && /^\s*\d[\d\s]*$/.test(v)) v = parseInt(v.replace(/\s/g, ""), 10);
    return (typeof v === "number" && isFinite(v) && v >= 0 && v <= MAX_PRICE && Math.floor(v) === v) ? v : null;
  }

  /** Narx qoidalarini tozalaydi: faqat ma'lum kalitlar, faqat 0..1e9 butun sonlar; bo'sh = "noma'lum". Natija: { rules, errors } */
  function sanitizeRules(raw) {
    var rules = {}, errors = [];
    if (typeof raw === "string") { try { raw = raw ? JSON.parse(raw) : {}; } catch (e) { return { rules: {}, errors: ["JSON"] }; } }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { rules: {}, errors: raw ? ["format"] : [] };
    PRICE_FIELDS.forEach(function (g) {
      var src = raw[g.group];
      if (!src || typeof src !== "object") return;
      g.items.forEach(function (it) {
        var v = src[it.key];
        if (v === undefined || v === null || v === "") return;
        var n = priceNum(v);
        if (n === null) { errors.push(g.group + "." + it.key); return; }
        (rules[g.group] = rules[g.group] || {})[it.key] = n;
      });
    });
    return { rules: rules, errors: errors };
  }

  function rule(rules, group, key) { return rules && rules[group] && priceNum(rules[group][key]); }

  /**
   * Narxni hisoblaydi. Har bir tanlangan tarkibiy qism uchun admin qoidasi bo'lishi shart:
   * bitta ham qoida yetishmasa — narx TAXMIN QILINMAYDI, status "request" (narx so'raladi).
   * Natija: { status: "priced"|"request", unit, total, lines: [{label, amount}], missing: [label] }
   */
  function calcPrice(c, rules) {
    var lines = [], missing = [], m = MODELS[c.model];
    function add(label, amount) { if (amount === null || amount === undefined) missing.push(label); else lines.push({ label: label, amount: amount }); }
    add("Model: " + m.name, rule(rules, "base", c.model));
    add("Qoplama: " + COATINGS[c.coating].name, rule(rules, "coating", c.coating));
    if (COLORS[c.color].wood) add("Yog‘och rang: " + COLORS[c.color].name, rule(rules, "color", "wood"));
    add("Tutqich: " + HANDLE_SHAPES[c.handle].name, rule(rules, "handle", c.handle));
    add("Tutqich rangi: " + HANDLE_FINISHES[c.finish].name, rule(rules, "finish", c.finish));
    add("Rom: " + FRAMES[c.frame].name, rule(rules, "frame", c.frame));
    if (c.decor !== "none") add("Dekor: " + DECORS[c.decor].name, rule(rules, "decor", c.decor));
    if (m.glass) add("Shisha: " + GLASS_TYPES[c.glass].name, rule(rules, "glass", c.glass));
    if (!isStandardSize(c)) add("Nostandart o‘lcham", rule(rules, "size", "custom"));
    if (missing.length) return { status: "request", unit: null, total: null, lines: lines, missing: missing };
    var unit = lines.reduce(function (s, l) { return s + l.amount; }, 0);
    return { status: "priced", unit: unit, total: unit * c.qty, lines: lines, missing: [] };
  }

  var api = {
    COLORS: COLORS, MODELS: MODELS, COATINGS: COATINGS, HANDLE_SHAPES: HANDLE_SHAPES, HANDLE_FINISHES: HANDLE_FINISHES,
    HINGES: HINGES, FRAMES: FRAMES, DECORS: DECORS, GLASS_TYPES: GLASS_TYPES, LIMITS: LIMITS, NOTE: NOTE, KEYS: KEYS, PRICE_FIELDS: PRICE_FIELDS,
    defaults: defaults, normalize: normalize, validate: validate, availability: availability, isStandardSize: isStandardSize,
    title: title, describe: describe, encode: encode, decode: decode, shortCode: shortCode,
    sanitizeRules: sanitizeRules, calcPrice: calcPrice
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.YD_CFG = api;
})(typeof window !== "undefined" ? window : this);
