/* =========================================================
   YasinDoors — 3D konstruktor interfeysi (ES modul)
   - holat: joriy konfiguratsiya, "oldingi holat" tarixi, localStorage va havola (#c=...) bilan sinxron
   - 3D sahna configurator-3d.js dan dinamik yuklanadi; WebGL yo'q yoki yuklanmasa — 2D zaxira ko'rinish
   - narx faqat admin kiritgan qoidalardan hisoblanadi (configurator-data.js); qoida yo'q bo'lsa "Narxni so'rash"
   ========================================================= */
(function () {
  "use strict";

  var C = window.YD_CFG, esc = YD.esc;
  var STORE_KEY = "yd_cfg_v1";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    cfg: C.defaults(), past: [], pendingPrev: null, commitTimer: null,
    scene: null, mode: "loading",            // loading | 3d | fallback
    avail: C.availability([]), rules: {}, sending: false, attemptKey: null, attemptSig: "", view: "front"
  };

  /* ---------- Yordamchilar ---------- */
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function lighten(hex, f) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r + (255 - r) * f) + "," + Math.round(g + (255 - g) * f) + "," + Math.round(b + (255 - b) * f) + ")"; }
  function darken(hex, f) { var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return "rgb(" + Math.round(r * f) + "," + Math.round(g * f) + "," + Math.round(b * f) + ")"; }
  function money(n) { return YD.formatPrice(n); }

  // Ekran o'quvchilar uchun xabar
  var live = document.createElement("div");
  live.className = "sr-only"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live);
  function announce(text) { live.textContent = ""; setTimeout(function () { live.textContent = text; }, 30); }

  /* ---------- 2D tasvir (zaxira ko'rinish va model kartalari uchun) ---------- */
  var svgSeq = 0;
  function doorSVG(cfg, label) {
    var id = "dw" + (++svgSeq), VW = 140, VH = 220, floorY = 206;
    var dh = 172 * (cfg.h / 2000), dw = dh * cfg.w / cfg.h, x0 = (VW - dw) / 2, y0 = floorY - dh;
    var col = C.COLORS[cfg.color], m = C.MODELS[cfg.model];
    var edge = darken(col.hex, col.wood ? 0.66 : 0.58), inner = col.wood ? "none" : lighten(col.hex, 0.08);
    var decorHex = cfg.decor !== "none" ? C.DECORS[cfg.decor].hex : null;
    var lineCol = decorHex || edge, lineW = decorHex ? 1.3 : 1;
    var s = [];
    s.push('<svg class="cfg-mini" viewBox="0 0 ' + VW + " " + VH + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(label || C.title(cfg)) + '">');
    s.push('<defs><pattern id="' + id + 'w" width="7" height="30" patternUnits="userSpaceOnUse"><rect width="7" height="30" fill="' + col.hex + '"/>' +
      '<path d="M1.5 0q2.5 15 0 30M4.5 0q-2.5 15 0 30M6.5 0q1.5 15 0 30" stroke="' + darken(col.hex, 0.62) + '" stroke-opacity=".38" fill="none"/></pattern>' +
      '<linearGradient id="' + id + 's" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>');
    s.push('<rect width="' + VW + '" height="' + VH + '" rx="10" fill="#cfcabf"/><rect y="' + floorY + '" width="' + VW + '" height="' + (VH - floorY) + '" fill="#1b1b1e"/>');
    if (cfg.frame !== "none") {
      var fc = cfg.frame === "white" ? "#f1efea" : cfg.frame === "black" ? "#1c1c1e" : (col.wood ? "url(#" + id + "w)" : col.hex);
      s.push('<rect x="' + (x0 - 5) + '" y="' + (y0 - 5) + '" width="' + (dw + 10) + '" height="' + (dh + 5) + '" fill="' + fc + '" stroke="rgba(0,0,0,.3)" stroke-width=".6"/>');
    }
    s.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + dw + '" height="' + dh + '" fill="' + (col.wood ? "url(#" + id + "w)" : col.hex) + '" stroke="rgba(0,0,0,.4)" stroke-width=".8"/>');
    function rect(x, y, w, h, fill, stroke, sw, rx) { return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" rx="' + (rx || 0) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>'; }
    function line(x1, y1, x2, y2, c, w) { return '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke="' + c + '" stroke-width="' + w + '"/>'; }
    var v = cfg.variant;
    if (cfg.model === "classic") {
      var rows = v === "p2" ? [1] : v === "p6" ? [0.28, 0.36, 0.36] : [0.6, 0.4], cols = 2;
      var mg = dw * 0.12, gp = dw * 0.08, bm = dh * 0.06, tm = dh * 0.05, aw = dw - 2 * mg, ah = dh - bm - tm - gp * (rows.length - 1), pw = (aw - gp * (cols - 1)) / cols, y = y0 + tm;
      rows.forEach(function (rr) {
        var ph = ah * rr;
        for (var c = 0; c < cols; c++) { s.push(rect(x0 + mg + c * (pw + gp), y, pw, ph, inner, decorHex ? decorHex : edge, decorHex ? 1.2 : 0.9, 1.5)); }
        y += ph + gp;
      });
    } else if (cfg.model === "flat" && v === "groove") {
      [0.2, 0.4, 0.6, 0.8].forEach(function (f) { s.push(line(x0, y0 + dh * f, x0 + dw, y0 + dh * f, edge, 1.1)); });
    } else if (cfg.model === "lines") {
      var n = v === "l2" ? 2 : v === "l5" ? 5 : 3;
      for (var i = 1; i <= n; i++) s.push(line(x0 + dw * i / (n + 1), y0 + 6, x0 + dw * i / (n + 1), y0 + dh - 6, lineCol, lineW));
    } else if (cfg.model === "geo") {
      var ins = dw * 0.14, ow = dw - 2 * ins, oy = y0 + dh * 0.06, oh = dh * 0.88;
      s.push(rect(x0 + ins, oy, ow, oh, "none", lineCol, lineW, 0));
      if (v === "cross") { s.push(line(x0 + dw / 2, oy, x0 + dw / 2, oy + oh, lineCol, lineW), line(x0 + ins, oy + oh / 2, x0 + ins + ow, oy + oh / 2, lineCol, lineW)); }
      else { var by = y0 + dh * 0.42; s.push(line(x0 + ins, by, x0 + ins + ow, by, lineCol, lineW), line(x0 + dw / 2, by, x0 + dw / 2, oy + oh, lineCol, lineW)); }
    } else if (cfg.model === "glass") {
      var gl = cfg.glass === "clear" ? "rgba(214,232,238,.55)" : "rgba(232,238,240,.92)";
      if (v === "bands") { for (var k = 0; k < 5; k++) s.push(rect(x0 + dw * 0.19, y0 + dh * (0.1 + k * 0.17), dw * 0.62, dh * 0.09, gl, "#18181a", 1.1, 0)); }
      else if (v === "grid") { var gx = x0 + dw * 0.14, gy = y0 + dh * 0.1, gw = dw * 0.72, gh = dh * 0.78; s.push(rect(gx, gy, gw, gh, gl, "#18181a", 1.4, 0), line(gx + gw / 2, gy, gx + gw / 2, gy + gh, "#18181a", 1.2)); [0.25, 0.5, 0.75].forEach(function (f) { s.push(line(gx, gy + gh * f, gx + gw, gy + gh * f, "#18181a", 1.2)); }); }
      else s.push(rect(x0 + dw * 0.37, y0 + dh * 0.14, dw * 0.26, dh * 0.62, gl, "#18181a", 1.4, 0));
    }
    s.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + dw + '" height="' + dh + '" fill="url(#' + id + 's)"/>');
    // Tutqich
    var hf = C.HANDLE_FINISHES[cfg.finish].hex, latchRight = cfg.hinge === "left", hx = latchRight ? x0 + dw - 8 : x0 + 8, hy = floorY - dh * (1.0 / (cfg.h / 1000)) / 1; hy = floorY - dh * (1.0 / (cfg.h / 1000)) / 1 * 1;
    hy = floorY - (1.0 / (cfg.h / 1000)) * dh;
    var dir = latchRight ? -1 : 1;
    if (cfg.handle === "bar") s.push('<rect x="' + (hx - 1.6) + '" y="' + (hy - 13) + '" width="3.2" height="26" rx="1.6" fill="' + hf + '" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>');
    else if (cfg.handle === "round") s.push('<circle cx="' + hx + '" cy="' + hy + '" r="4.2" fill="' + hf + '" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>');
    else s.push('<circle cx="' + hx + '" cy="' + hy + '" r="2.6" fill="' + hf + '"/><rect x="' + (dir < 0 ? hx - 11 : hx - 1) + '" y="' + (hy - 1.4) + '" width="12" height="2.8" rx="1.4" fill="' + hf + '" stroke="rgba(0,0,0,.3)" stroke-width=".4"/>');
    // Ilmoqlar
    var hxh = latchRight ? x0 : x0 + dw; [0.14, 0.5, 0.86].forEach(function (f) { s.push('<rect x="' + (hxh - 1) + '" y="' + (y0 + dh * f - 4) + '" width="2" height="8" fill="#8b8e92"/>'); });
    s.push("</svg>");
    return s.join("");
  }

  function handleIcon(shape, hex) {
    var body = shape === "bar" ? '<rect x="22" y="8" width="5" height="32" rx="2.5" fill="' + hex + '"/><rect x="18" y="12" width="5" height="3" fill="' + hex + '"/><rect x="18" y="33" width="5" height="3" fill="' + hex + '"/>'
      : shape === "round" ? '<circle cx="24" cy="24" r="9" fill="' + hex + '"/>'
      : '<circle cx="34" cy="24" r="5" fill="' + hex + '"/><rect x="8" y="21" width="30" height="6" rx="3" fill="' + hex + '"/>';
    return '<svg class="cfg-mini" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#26262a"/>' + body + "</svg>";
  }

  /* ---------- Sozlamalar paneli ---------- */
  var GROUP_KEY = { model: "model", variant: "variant", color: "color", coating: "coating", handle: "handle", finish: "finish", hinge: "hinge", frame: "frame", decor: "decor", glass: "glass" };
  var tagHTML = '<span class="cfg-tag">Buyurtma asosida</span>';

  function radioAttrs(group, value, selected, disabled, label) {
    return 'type="button" role="radio" data-g="' + group + '" data-v="' + esc(value) + '" aria-checked="' + selected + '" tabindex="' + (selected ? 0 : -1) + '"' +
      (disabled ? ' aria-disabled="true" disabled' : "") + ' aria-label="' + esc(label) + '"';
  }
  function cardHTML(group, value, label, sub, preview, selected, disabled, onRequest) {
    return '<button class="cfg-card' + (selected ? " is-selected" : "") + (disabled ? " is-disabled" : "") + '" ' + radioAttrs(group, value, selected, disabled, label) + ">" +
      (onRequest ? tagHTML : "") + preview + '<span class="cfg-card-name">' + esc(label) + "</span>" + (sub ? '<span class="cfg-card-sub">' + esc(sub) + "</span>" : "") + "</button>";
  }
  function chipHTML(group, value, label, selected, disabled, onRequest) {
    return '<button class="cfg-chip' + (selected ? " is-selected" : "") + (disabled ? " is-disabled" : "") + '" ' + radioAttrs(group, value, selected, disabled, label) + ">" + esc(label) + (onRequest ? tagHTML : "") + "</button>";
  }
  function swatchHTML(group, value, label, hex, wood, selected, disabled, onRequest) {
    return '<div class="cfg-sw-wrap' + (disabled ? " is-disabled" : "") + '"><button class="cfg-swatch' + (selected ? " is-selected" : "") + (wood ? " is-wood" : "") + '" style="background-color:' + esc(hex) + '" ' + radioAttrs(group, value, selected, disabled, label) + "></button>" +
      '<span class="cfg-sw-name">' + esc(label) + "</span>" + (onRequest ? tagHTML : "") + "</div>";
  }
  function group(title, body, kind) {
    return '<section class="cfg-group"><h3>' + esc(title) + '</h3><div role="radiogroup" aria-label="' + esc(title) + '" class="' + (kind || "") + '">' + body + "</div></section>";
  }

  function optionsHTML() {
    var cfg = state.cfg, m = C.MODELS[cfg.model], html = "";
    // Model
    html += group("Eshik modeli", Object.keys(C.MODELS).filter(function (k) { return state.avail.models[k]; }).map(function (k) {
      var pv = C.normalize(Object.assign({}, cfg, { model: k, variant: C.MODELS[k].defaultVariant, w: 800, h: 2000, frame: "none", decor: k === "geo" ? "gold" : "none" }));
      return cardHTML("model", k, C.MODELS[k].name, "", doorSVG(pv, C.MODELS[k].name), cfg.model === k, false, false);
    }).join(""), "cfg-grid cfg-grid--3");
    // Variant
    html += group("Naqsh varianti", Object.keys(m.variants).map(function (k) { return chipHTML("variant", k, m.variants[k], cfg.variant === k, false, false); }).join(""), "cfg-chips");
    // Rang
    html += group("Rang", Object.keys(C.COLORS).filter(function (k) { return state.avail.colors[k]; }).map(function (k) {
      return swatchHTML("color", k, C.COLORS[k].name, C.COLORS[k].hex, C.COLORS[k].wood, cfg.color === k, false, false);
    }).join(""), "cfg-swatches");
    // Qoplama
    var wood = C.COLORS[cfg.color].wood;
    html += group("Qoplama turi", Object.keys(C.COATINGS).map(function (k) {
      var disabled = wood ? k !== "tex" : k === "tex";
      return cardHTML("coating", k, C.COATINGS[k].name, disabled ? (wood ? "Yog‘och rang uchun emas" : "Faqat yog‘och rangda") : C.COATINGS[k].desc, "", cfg.coating === k, disabled, false);
    }).join(""), "cfg-grid cfg-grid--3");
    if (m.glass) html += group("Shisha turi", Object.keys(C.GLASS_TYPES).map(function (k) { return chipHTML("glass", k, C.GLASS_TYPES[k].name, cfg.glass === k, false, false); }).join(""), "cfg-chips");
    // Tutqich
    html += group("Tutqich shakli", Object.keys(C.HANDLE_SHAPES).map(function (k) {
      return cardHTML("handle", k, C.HANDLE_SHAPES[k].name, "", handleIcon(k, C.HANDLE_FINISHES[cfg.finish].hex), cfg.handle === k, false, true);
    }).join(""), "cfg-grid cfg-grid--3");
    html += group("Tutqich rangi", Object.keys(C.HANDLE_FINISHES).map(function (k) { return swatchHTML("finish", k, C.HANDLE_FINISHES[k].name, C.HANDLE_FINISHES[k].hex, false, cfg.finish === k, false, true); }).join(""), "cfg-swatches");
    html += group("Ochilish tomoni", Object.keys(C.HINGES).map(function (k) { return chipHTML("hinge", k, C.HINGES[k], cfg.hinge === k, false, false); }).join(""), "cfg-chips");
    // O'lcham
    var L = C.LIMITS;
    html += '<section class="cfg-group"><h3>O‘lcham</h3><div role="radiogroup" aria-label="Standart o‘lchamlar" class="cfg-chips">' +
      L.standardW.map(function (w) { return chipHTML("std", String(w), w + " × " + L.standardH, cfg.w === w && cfg.h === L.standardH, false, false); }).join("") + "</div>" +
      '<div class="cfg-size" id="cfgSize">' +
        '<div class="cfg-size-row"><label for="cfgWn">Kengligi <span>' + L.wMin + "–" + L.wMax + ' mm</span></label><div class="cfg-size-inputs"><input class="input" id="cfgWn" type="number" inputmode="numeric" min="' + L.wMin + '" max="' + L.wMax + '" step="' + L.step + '" value="' + cfg.w + '" aria-describedby="cfgSizeNote"><input class="cfg-range" id="cfgWr" type="range" min="' + L.wMin + '" max="' + L.wMax + '" step="' + L.step + '" value="' + cfg.w + '" aria-label="Kenglik (slayder)"></div></div>' +
        '<div class="cfg-size-row"><label for="cfgHn">Balandligi <span>' + L.hMin + "–" + L.hMax + ' mm</span></label><div class="cfg-size-inputs"><input class="input" id="cfgHn" type="number" inputmode="numeric" min="' + L.hMin + '" max="' + L.hMax + '" step="' + L.step + '" value="' + cfg.h + '" aria-describedby="cfgSizeNote"><input class="cfg-range" id="cfgHr" type="range" min="' + L.hMin + '" max="' + L.hMax + '" step="' + L.step + '" value="' + cfg.h + '" aria-label="Balandlik (slayder)"></div></div>' +
        '<p class="cfg-note" id="cfgSizeNote">' + sizeNote() + "</p></div></section>";
    // Rom
    html += group("Eshik romi", Object.keys(C.FRAMES).map(function (k) { return chipHTML("frame", k, C.FRAMES[k].name, cfg.frame === k, false, true); }).join(""), "cfg-chips");
    // Dekor
    if (m.decor) html += group("Dekorativ chiziqlar", Object.keys(C.DECORS).map(function (k) { return chipHTML("decor", k, C.DECORS[k].name, cfg.decor === k, false, k !== "none"); }).join(""), "cfg-chips");
    return html;
  }
  function sizeNote() {
    return C.isStandardSize(state.cfg) ? "Standart o‘lcham." : "<b>Nostandart o‘lcham</b> — ishlab chiqarish imkoniyati va narx menejer tomonidan tasdiqlanadi.";
  }

  function renderPanel() {
    var panel = $("cfgOptions"), active = document.activeElement, restore = null;
    if (active && panel.contains(active) && active.dataset && active.dataset.g) restore = active.dataset.g + "|" + active.dataset.v;
    panel.innerHTML = optionsHTML();
    if (restore) {
      var sel = panel.querySelector('[data-g="' + restore.split("|")[0] + '"][data-v="' + restore.split("|")[1] + '"]');
      var tab = panel.querySelector('[data-g="' + restore.split("|")[0] + '"][aria-checked="true"]');
      (sel && !sel.disabled ? sel : tab) && (sel && !sel.disabled ? sel : tab).focus({ preventScroll: true });
    }
  }
  function syncSize() {                 // sürgich sudralayotganda panel qayta chizilmaydi (aks holda sudrash uziladi)
    var cfg = state.cfg;
    [["cfgWn", "w"], ["cfgWr", "w"], ["cfgHn", "h"], ["cfgHr", "h"]].forEach(function (p) { var el = $(p[0]); if (el && document.activeElement !== el) el.value = cfg[p[1]]; });
    $("cfgSizeNote").innerHTML = sizeNote();
    A11Y_std();
  }
  function A11Y_std() {
    var cfg = state.cfg;
    document.querySelectorAll('[data-g="std"]').forEach(function (b) {
      var on = cfg.w === Number(b.dataset.v) && cfg.h === C.LIMITS.standardH;
      b.classList.toggle("is-selected", on); b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1;
    });
  }

  /* ---------- Xulosa ---------- */
  function renderSummary() {
    var cfg = state.cfg, rows = C.describe(cfg), price = C.calcPrice(cfg, state.rules);
    var priced = price.status === "priced";
    var html = '<h2 class="cfg-sum-title">' + esc(C.title(cfg)) + "</h2>" +
      '<p class="cfg-sum-code">Kod: <code>' + esc(C.shortCode(cfg)) + "</code></p>" +
      '<dl class="cfg-rows">' + rows.map(function (r) { return "<div><dt>" + esc(r.label) + "</dt><dd>" + esc(r.value) + "</dd></div>"; }).join("") + "</dl>" +
      '<div class="cfg-qty"><span id="cfgQtyLabel">Soni</span><div class="qty" role="group" aria-labelledby="cfgQtyLabel"><button type="button" data-qty="-1" aria-label="Kamaytirish">−</button><input type="number" id="cfgQty" min="1" max="' + C.LIMITS.qtyMax + '" value="' + cfg.qty + '" inputmode="numeric" aria-label="Soni"><button type="button" data-qty="1" aria-label="Ko‘paytirish">+</button></div></div>';
    if (priced) {
      var baseL = price.lines.filter(function (l) { return l.kind === "base"; }), extraL = price.lines.filter(function (l) { return l.kind !== "base"; });
      var extraSum = extraL.reduce(function (s, l) { return s + l.amount; }, 0);
      html += '<div class="cfg-price"><small>Narx hisob-kitobi (1 dona)</small>' +
        '<ul class="cfg-lines">' + baseL.map(function (l) { return '<li class="is-base"><span>Asosiy narx · ' + esc(l.label.replace(/^Model: /, "")) + "</span><b>" + money(l.amount) + "</b></li>"; }).join("") +
        (extraL.length ? '<li class="is-head"><span>Qo‘shimcha xarajatlar</span><b>' + money(extraSum) + "</b></li>" : "") +
        extraL.map(function (l) { return '<li class="is-extra"><span>' + esc(l.label) + "</span><b>" + (l.amount ? "+ " + money(l.amount) : "qo‘shimchasiz") + "</b></li>"; }).join("") + "</ul>" +
        (cfg.qty > 1 ? '<p class="cfg-unit">1 dona: ' + money(price.unit) + " × " + cfg.qty + " dona</p>" : "") +
        '<small class="cfg-total-label">Yakuniy narx' + (cfg.qty > 1 ? " (" + cfg.qty + " dona)" : "") + "</small><strong>" + money(price.total) + "</strong>" +
        "<p>Narx tasdiqlangan qoidalar bo‘yicha hisoblandi; buyurtma yuborilganda server qayta tekshiradi.</p></div>";
    } else {
      html += '<div class="cfg-price"><small>Narxi</small><div class="request">Narx so‘raladi</div>' +
        "<p>Bu konfiguratsiya uchun narx hali tasdiqlanmagan. Buyurtma yuboring — menejer narxni aniqlab, siz bilan bog‘lanadi.</p></div>";
    }
    html += '<button class="btn btn--gold btn--block" type="button" id="cfgOrder">' + (priced ? "Buyurtma berish" : "Narxni so‘rash va buyurtma berish") + "</button>" +
      '<p class="cfg-disclaimer"><svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg><span>' + esc(C.NOTE) + "</span></p>";
    $("cfgSummary").innerHTML = html;
  }

  /* ---------- 2D zaxira ko'rinish ---------- */
  function renderFallback() {
    var box = $("cfgFallback");
    if (state.mode !== "fallback") return;
    box.innerHTML = doorSVG(state.cfg) + '<p id="cfgFallbackNote">' + esc(state.fallbackNote || "3D ko‘rinish mavjud emas — oddiy ko‘rinish ko‘rsatilmoqda. Barcha sozlamalar va buyurtma ishlayveradi.") + "</p>";
  }
  function useFallback(note) {
    if (state.mode === "fallback") return;
    state.mode = "fallback"; state.fallbackNote = note;
    if (state.scene) { try { state.scene.dispose(); } catch (e) { /* e'tiborsiz */ } state.scene = null; }
    $("cfgLoading").classList.add("is-done");
    $("cfgFallback").hidden = false; $("cfgViewbar").hidden = true; $("cfgHint").hidden = true;
    renderFallback();
  }
  function webglOK() {
    if (/[?&]fallback=1\b/.test(location.search)) return false;     // sinov uchun: 2D zaxira ko'rinishni majburan yoqish
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (e) { return false; }
  }

  /* ---------- 3D ---------- */
  var sceneDirty = false;
  function scheduleScene() {
    if (state.mode === "fallback") { renderFallback(); return; }
    if (!state.scene || sceneDirty) return;
    sceneDirty = true;
    setTimeout(function () { sceneDirty = false; if (state.scene) state.scene.update(state.cfg); }, 16);
  }
  function initScene() {
    if (!webglOK()) return useFallback("Qurilmangiz yoki brauzeringiz 3D grafikani (WebGL) qo‘llab-quvvatlamaydi — oddiy ko‘rinish ko‘rsatilmoqda.");
    var slow = setTimeout(function () { if (state.mode === "loading") useFallback("3D model uzoq yuklanmadi — oddiy ko‘rinish ko‘rsatilmoqda."); }, 30000);
    import("/assets/js/configurator-3d.js").then(function (mod) {
      state.scene = mod.createScene($("cfgViewport"), {
        data: C, reduceMotion: reduceMotion,
        onError: function (e) { console.error(e); useFallback("3D ko‘rinishda xatolik yuz berdi — oddiy ko‘rinish ko‘rsatilmoqda."); }
      });
      state.scene.update(state.cfg);
      state.mode = "3d";
      clearTimeout(slow);
      setTimeout(function () { $("cfgLoading").classList.add("is-done"); markView("front"); }, 350);
    }).catch(function (e) {
      clearTimeout(slow);
      console.error("3D yuklanmadi:", e);
      useFallback("3D kutubxonasi yuklanmadi — oddiy ko‘rinish ko‘rsatilmoqda.");
    });
  }
  function markView(name) {
    state.view = name;
    document.querySelectorAll("#cfgViewbar [data-view]").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === name); });
  }

  /* ---------- Holat o'zgarishi ---------- */
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.cfg)); } catch (e) { /* localStorage yo'q */ }
    try { history.replaceState(null, "", location.pathname + location.search + "#c=" + C.encode(state.cfg)); } catch (e) { /* e'tiborsiz */ }
  }
  function updateUndo() { $("cfgUndo").disabled = !(state.past.length || state.pendingPrev); }
  function flushHistory() {
    if (state.commitTimer) { clearTimeout(state.commitTimer); state.commitTimer = null; }
    if (state.pendingPrev) { state.past.push(state.pendingPrev); if (state.past.length > 60) state.past.shift(); state.pendingPrev = null; }
  }

  function set(patch, opts) {
    opts = opts || {};
    var next = C.normalize(Object.assign({}, state.cfg, patch));
    if (same(next, state.cfg)) { if (opts.rerender) renderPanel(); return; }
    if (!state.pendingPrev) state.pendingPrev = Object.assign({}, state.cfg);       // bir necha tez o'zgarish (sürgich) — bitta tarix qadami
    clearTimeout(state.commitTimer);
    state.commitTimer = setTimeout(flushHistory, 450);
    state.cfg = next;
    afterChange(opts);
    updateUndo();
    if (opts.say) announce(opts.say);
  }
  function afterChange(opts) {
    persist();
    if (!opts || !opts.skipPanel) renderPanel(); else syncSize();
    renderSummary();
    scheduleScene();
  }
  function replaceAll(cfg, say) {
    flushHistory();
    state.past.push(Object.assign({}, state.cfg));
    state.cfg = C.normalize(cfg);
    afterChange(); updateUndo();
    if (say) announce(say);
  }

  function choose(g, v) {
    var label;
    if (g === "std") { set({ w: Number(v), h: C.LIMITS.standardH }, { say: "O‘lcham: " + v + " × " + C.LIMITS.standardH }); return; }
    if (!GROUP_KEY[g]) return;
    var patch = {}; patch[GROUP_KEY[g]] = v;
    if (g === "model") patch.variant = C.MODELS[v].defaultVariant;
    if (g === "model") patch.decor = C.MODELS[v].decor ? (C.MODELS[v].defaultDecor || (state.cfg.decor)) : "none";
    set(patch, { say: ($("cfgOptions").querySelector('[data-g="' + g + '"][data-v="' + v + '"]') || {}).ariaLabel ? "Tanlandi: " + $("cfgOptions").querySelector('[data-g="' + g + '"][data-v="' + v + '"]').getAttribute("aria-label") : "" });
  }

  /* ---------- Havola, saqlash, rasm ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy")); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }
  function svgToPng(svg, w, h) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { var cv = document.createElement("canvas"); cv.width = w; cv.height = h; var g = cv.getContext("2d"); g.fillStyle = "#0d0d0f"; g.fillRect(0, 0, w, h); var s = Math.min(w / img.width, h / img.height) * 0.92; g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); resolve(cv.toDataURL("image/png")); };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg width="560" height="880" '));
    });
  }
  function download() {
    var name = "yasindoors-" + C.shortCode(state.cfg).toLowerCase() + ".png";
    var get = state.mode === "3d" && state.scene
      ? Promise.resolve(state.scene.snapshot({ width: 1200, height: 1500, type: "image/png", view: "current" }))
      : svgToPng(doorSVG(state.cfg), 1200, 1500);
    get.then(function (data) {
      var a = document.createElement("a"); a.href = data; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      YD.toast("Rasm yuklab olindi");
    }).catch(function () { YD.toast("Rasmni yuklab bo‘lmadi"); });
  }

  /* ---------- Buyurtma oynasi ---------- */
  /** Narx qoidalarini serverdan qayta o'qish (admin narxni o'zgartirgan bo'lishi mumkin) */
  function refreshRules() {
    return fetch(YD.apiUrl("/api/catalog"), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.settings) state.rules = C.sanitizeRules(d.settings.cfg_prices || "").rules;
    }).catch(function () { /* mavjud qoidalar qoladi */ });
  }
  var lastFocus = null;
  function openModal() {
    var cfg = state.cfg, price = C.calcPrice(cfg, state.rules), priced = price.status === "priced";
    lastFocus = document.activeElement;
    var rows = C.describe(cfg).map(function (r) { return "<div><dt>" + esc(r.label) + "</dt><dd>" + esc(r.value) + "</dd></div>"; }).join("");
    $("cfgModalTitle").textContent = priced ? "Buyurtma berish" : "Narxni so‘rash";
    $("cfgModalBody").innerHTML =
      '<dl class="cfg-rows">' + rows + "<div><dt>Soni</dt><dd>" + cfg.qty + " dona</dd></div><div><dt>Yakuniy narx</dt><dd id=\"cfgModalPrice\"><b>" + (priced ? money(price.total) : "Menejer aniqlaydi") + "</b></dd></div></dl>" +
      '<form id="cfgOrderForm" novalidate><div class="form-grid">' +
      '<div class="field"><label for="cfg-name">Ismingiz <span class="req">*</span></label><input class="input" id="cfg-name" name="name" autocomplete="name" maxlength="80"><span class="error" id="name-error">Ismingizni kiriting (kamida 2 ta harf).</span></div>' +
      '<div class="field"><label for="cfg-phone">Telefon raqami <span class="req">*</span></label><input class="input" id="cfg-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="+998 90 123 45 67"><span class="error" id="phone-error">Telefon raqamini to‘g‘ri kiriting.</span></div>' +
      '<div class="field full"><label for="cfg-region">Yetkazib berish hududi <span class="req">*</span></label><select class="select" id="cfg-region" name="region"><option value="">Viloyatni tanlang</option><option value="samarqand">Samarqand viloyati</option><option value="sirdaryo">Sirdaryo viloyati</option><option value="toshkent">Toshkent viloyati</option><option value="navoiy">Navoiy viloyati</option></select><span class="error" id="region-error">Hududni tanlang (Samarqand, Sirdaryo, Toshkent yoki Navoiy viloyati).</span></div>' +
      '<div class="field full"><label for="cfg-address">Manzil <span class="req">*</span></label><input class="input" id="cfg-address" name="address" autocomplete="street-address" maxlength="200" placeholder="Shahar, tuman, ko‘cha, uy"><span class="error" id="address-error">Manzilni kiriting.</span></div>' +
      '<div class="field full"><label for="cfg-comment">Qo‘shimcha izoh</label><textarea class="textarea" id="cfg-comment" name="comment" maxlength="1000" style="min-height:80px"></textarea></div>' +
      '<div class="field full"><label class="checkbox"><input type="checkbox" name="install"> O‘rnatish xizmati ham kerak</label></div>' +
      '<div class="field full"><label class="checkbox"><input type="checkbox" name="agree" id="cfg-agree"> Ma’lumotlarim buyurtma uchun ishlatilishiga roziman <span class="req">*</span></label><span class="error" id="agree-error">Davom etish uchun roziligingizni belgilang.</span></div>' +
      '<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div></div>' +
      '<div class="form-alert" id="cfgFormAlert" role="alert" style="margin-top:14px"></div>' +
      '<button class="btn btn--gold btn--block" type="submit" id="cfgSubmit" style="margin-top:16px">' + (priced ? "Buyurtmani yuborish" : "So‘rov yuborish") + "</button></form>";
    $("cfgModal").hidden = false;
    document.documentElement.classList.add("cfg-modal-open");      // fon scrolli to'xtaydi (overflow:hidden)
    setTimeout(function () { var f = $("cfg-name"); if (f) f.focus(); }, 30);
    bindOrderForm();
  }
  function closeModal() {
    $("cfgModal").hidden = true;
    document.documentElement.classList.remove("cfg-modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function randomKey() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  function bindOrderForm() {
    var form = $("cfgOrderForm");
    var rules = {
      name: function (v) { return v.replace(/\s/g, "").length >= 2; },
      phone: function (v) { return YDForm.isValidPhone(v); },
      region: function (v) { return !!v; },
      address: function (v) { return v.length >= 5; },
      agree: function (v) { return v === true; }
    };
    YDForm.liveValidate(form, rules);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (state.sending) return;
      var alertEl = $("cfgFormAlert"); YDForm.hideAlert(alertEl);
      var bad = YDForm.validate(form, rules);
      if (bad) { YDForm.showAlert(alertEl, "error", "Iltimos, belgilangan maydonlarni to‘g‘ri to‘ldiring."); bad.focus(); return; }
      var btn = $("cfgSubmit"), fd = form.elements;
      var payload = {
        customer: { name: fd.name.value.trim(), phone: YDForm.formatPhone(fd.phone.value), region: fd.region.value, address: fd.address.value.trim(), comment: fd.comment.value.trim(), install: fd.install.checked },
        config: state.cfg, website: fd.website.value
      };
      // Takroriy yuborishdan himoya: bir xil konfiguratsiya va telefon uchun qayta urinishda kalit o'zgarmaydi
      var sig = C.encode(state.cfg) + "|" + payload.customer.phone;
      if (!state.attemptKey || sig !== state.attemptSig) { state.attemptKey = randomKey(); state.attemptSig = sig; }
      payload.idempotencyKey = state.attemptKey;
      var pr = C.calcPrice(state.cfg, state.rules);
      payload.expectedTotal = pr.status === "priced" ? pr.total : null;   // server narxi boshqacha bo'lsa 409 qaytaradi
      try {   // 3D konfiguratsiya rasmi (old tomondan) — ishlab chiqarishga yordam beradi; olinmasa buyurtma baribir yuboriladi
        if (state.mode === "3d" && state.scene) payload.snapshot = state.scene.snapshot({ width: 720, height: 900, type: "image/jpeg", quality: 0.82, view: "front" });
      } catch (err) { /* rasmsiz davom etamiz */ }

      state.sending = true; btn.disabled = true; btn.textContent = "Yuborilmoqda…";
      YDForm.postJSON("/api/configurator/order", payload).then(function (res) {
        $("cfgModalTitle").textContent = "Rahmat!";
        $("cfgModalBody").innerHTML = '<div class="cfg-done"><div class="empty-icon"><svg class="icon" aria-hidden="true" style="width:34px;height:34px"><use href="#i-check"></use></svg></div>' +
          "<h3>Buyurtmangiz qabul qilindi</h3>" +
          '<div class="order-no">№ ' + esc(res.orderId || "—") + "</div>" +
          '<dl class="cfg-rows" style="text-align:left;margin:12px 0">' + C.describe(payload.config).map(function (r) { return "<div><dt>" + esc(r.label) + "</dt><dd>" + esc(r.value) + "</dd></div>"; }).join("") + "<div><dt>Soni</dt><dd>" + payload.config.qty + " dona</dd></div><div><dt>Yakuniy narx</dt><dd><b>" + (res.priced ? money(res.total) : "Menejer aniqlaydi") + "</b></dd></div></dl>" +
          '<p class="muted">Konfiguratsiya kodi: <b>' + esc(res.code || C.shortCode(state.cfg)) + "</b>.<br>Menejerimiz " + esc(payload.customer.phone) + " raqami orqali bog‘lanib, " + (res.priced ? "buyurtmani" : "narx va ishlab chiqarish tafsilotlarini") + " tasdiqlaydi.</p>" +
          '<button class="btn btn--gold" type="button" id="cfgDone" style="margin-top:12px">Yopish</button></div>';
        $("cfgDone").addEventListener("click", closeModal);
        $("cfgDone").focus();
        state.attemptKey = null;
      }).catch(function (err) {
        if (err.code === "login_required") { closeModal(); YD.account.showGate("/Configurator"); }   // sessiya tugagan
        if (err.status === 409) {
          refreshRules().then(function () {
            renderSummary();
            var np = C.calcPrice(state.cfg, state.rules), pe = $("cfgModalPrice");
            if (pe) pe.textContent = np.status === "priced" ? money(np.total) : "Menejer aniqlaydi";
          });
        }   // narx o'zgargan — yangisini yuklab, mijoz qayta tasdiqlaydi
        YDForm.showAlert(alertEl, "error", (err.message || "Buyurtmani yuborib bo‘lmadi.") + (err.status === 409 || !YD.config.phone ? "" : " Yoki qo‘ng‘iroq qiling: " + YD.config.phone));
        btn.disabled = false; btn.textContent = C.calcPrice(state.cfg, state.rules).status === "priced" ? "Buyurtmani yuborish" : "So‘rov yuborish";
      }).then(function () { state.sending = false; });
    });
  }

  /* ---------- Hodisalar ---------- */
  function bindEvents() {
    var panel = $("cfgPanel");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-g]");
      if (b && !b.disabled) choose(b.dataset.g, b.dataset.v);
    });
    // Radio guruhlarida strelkalar bilan harakatlanish
    panel.addEventListener("keydown", function (e) {
      var b = e.target.closest('[role="radio"]');
      if (!b || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      var list = [].slice.call(b.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]:not([disabled])'));
      var i = list.indexOf(b), next = list[(i + (/Left|Up/.test(e.key) ? -1 : 1) + list.length) % list.length];
      if (next && next !== b) { e.preventDefault(); next.focus(); next.click(); }
    });
    // O'lcham maydonlari
    function sizeInput(id, key, commitOnInput) {
      var el = $(id);
      el.addEventListener(commitOnInput ? "input" : "change", function () {
        var v = parseInt(el.value, 10); if (isNaN(v)) return;
        var patch = {}; patch[key] = v; set(patch, { skipPanel: true });
      });
    }
    panel.addEventListener("input", function (e) { if (e.target.id === "cfgWr") set({ w: parseInt(e.target.value, 10) }, { skipPanel: true }); else if (e.target.id === "cfgHr") set({ h: parseInt(e.target.value, 10) }, { skipPanel: true }); });
    panel.addEventListener("change", function (e) {
      if (e.target.id === "cfgWn") set({ w: parseInt(e.target.value, 10) }, { skipPanel: true });
      else if (e.target.id === "cfgHn") set({ h: parseInt(e.target.value, 10) }, { skipPanel: true });
      if (e.target.id === "cfgWn" || e.target.id === "cfgHn") { syncSize(); }
      if (e.target.id === "cfgWn" || e.target.id === "cfgHn" || e.target.id === "cfgWr" || e.target.id === "cfgHr") { renderPanelKeepSize(); }
    });
    function renderPanelKeepSize() { A11Y_std(); }

    $("cfgSummary").addEventListener("click", function (e) {
      var q = e.target.closest("[data-qty]");
      if (q) { set({ qty: state.cfg.qty + Number(q.dataset.qty) }, { skipPanel: true }); return; }
      if (e.target.closest("#cfgOrder")) YD.account.gate("/Configurator", openModal);   // konfiguratsiya localStorage’da saqlanadi
    });
    $("cfgSummary").addEventListener("change", function (e) { if (e.target.id === "cfgQty") set({ qty: parseInt(e.target.value, 10) || 1 }, { skipPanel: true }); });

    $("cfgViewbar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-view]");
      if (b && state.scene) { state.scene.setView(b.dataset.view); markView(b.dataset.view); }
    });
    $("cfgUndo").addEventListener("click", function () {
      flushHistory();
      var prev = state.past.pop();
      if (prev) { state.cfg = C.normalize(prev); afterChange(); announce("Oldingi holatga qaytarildi"); }
      updateUndo();
    });
    $("cfgReset").addEventListener("click", function () { replaceAll(C.defaults(), "Konfiguratsiya boshidan boshlandi"); if (state.scene) { state.scene.setView("front"); markView("front"); } });
    $("cfgShare").addEventListener("click", function () {
      persist();
      copyText(location.href).then(function () { YD.toast("Havola nusxalandi — uni ulashishingiz mumkin"); }).catch(function () { window.prompt("Havolani nusxalang:", location.href); });
    });
    $("cfgDownload").addEventListener("click", download);

    // Mobil panel
    function sheet(open) {
      document.body.classList.toggle("cfg-sheet-on", open);
      $("cfgSheetOpen").setAttribute("aria-expanded", String(open));
      if (open) { var f = $("cfgOptions").querySelector('[aria-checked="true"]'); if (f) f.focus({ preventScroll: true }); }
    }
    $("cfgSheetOpen").addEventListener("click", function () { sheet(true); });
    $("cfgSheetClose").addEventListener("click", function () { sheet(false); $("cfgSheetOpen").focus(); });
    $("cfgSheetBackdrop").addEventListener("click", function () { sheet(false); });

    // Modal
    $("cfgModalClose").addEventListener("click", closeModal);
    $("cfgModal").addEventListener("mousedown", function (e) { if (e.target === $("cfgModal")) closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (!$("cfgModal").hidden) closeModal(); else if (document.body.classList.contains("cfg-sheet-on")) sheet(false); }
      if (e.key === "Tab" && !$("cfgModal").hidden) {      // fokus oyna ichida qolsin
        var f = [].slice.call($("cfgModal").querySelectorAll("a[href], button:not([disabled]), input:not([disabled]):not([tabindex='-1']), textarea, select")).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    window.addEventListener("hashchange", function () {
      var m = /^#c=([A-Za-z0-9_-]+)$/.exec(location.hash), cfg = m && C.decode(m[1]);
      if (cfg && !same(cfg, state.cfg)) replaceAll(cfg, "Konfiguratsiya havoladan yuklandi");
    });
  }

  /* ---------- Boshlash ---------- */
  function start() {
    // Narx qoidalari va katalog mavjudligi (admin sozlamalari va mahsulotlar)
    var site = YD.site ? YD.site() : {};
    state.rules = C.sanitizeRules(site.cfg_prices || "").rules;
    state.avail = C.availability(YD.data.PRODUCTS.map(function (p) { return { style: p.style, color: p.color }; }));
    // Boshlang'ich konfiguratsiya: havola > saqlangan > standart
    var m = /^#c=([A-Za-z0-9_-]+)$/.exec(location.hash), cfg = m && C.decode(m[1]);
    if (!cfg) { try { var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (saved) cfg = C.normalize(saved); } catch (e) { /* e'tiborsiz */ } }
    state.cfg = cfg || C.defaults();
    if (!state.avail.models[state.cfg.model]) state.cfg = C.normalize(Object.assign({}, state.cfg, { model: Object.keys(C.MODELS).filter(function (k) { return state.avail.models[k]; })[0] || "classic" }));
    $("cfgHint").hidden = false;
    renderPanel(); renderSummary(); bindEvents(); updateUndo();
    initScene();
    if (m && cfg) announce("Konfiguratsiya havoladan yuklandi");
  }

  YD.whenReady(start);
  window.YDConfigurator = { get state() { return state; }, doorSVG: doorSVG, setDoorBuilder: function (fn) { if (state.scene) state.scene.setDoorBuilder(fn); } };
})();
