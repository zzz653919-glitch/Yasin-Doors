/* =========================================================
   YasinDoors — konstruktorda katalog fotolari (2D rejim)
   Katalogdagi fonsiz (shaffof PNG) eshik fotolari 3D model EMAS: ular aniq "2D foto ko'rinish" deb belgilanadi.
   Qalinlik, orqa tomon yoki aylantirish uchun haqiqiy ma'lumot yo'q — shuning uchun ular o'ylab topilmaydi.
   Foto rejimi: tanlash, yaqinlashtirish/siljitish, fon (studiya / yorug' / devor), katalog narxi va savatga qo'shish.
   Haqiqiy 3D uchun — "3D konstruktor" rejimi (o'xshash modelni bir bosishda ochish mumkin).
   ========================================================= */
(function () {
  "use strict";
  var C = window.YD_CFG, esc = YD.esc;
  var $ = function (id) { return document.getElementById(id); };
  var PHOTO_RE = /\/doors\/photo\//;

  // Foto eshikka eng yaqin 3D model (aynan emas — faqat "o'xshash" sifatida taklif qilinadi)
  var SIMILAR = {
    "classic-royal": { model: "classic", variant: "p2", decor: "none" },
    "crema-classic": { model: "classic", variant: "p2", decor: "none" },
    "vetro-bianco":  { model: "glass", variant: "grid" },
    "vetro-grande":  { model: "glass", variant: "grid" },
    "bianco-gold":   { model: "lines", variant: "l5", decor: "gold" },
    "grey-stripe":   { model: "lines", variant: "l5", decor: "gold" },
    "neo-arka":      { model: "lines", variant: "l5", decor: "gold" },
    "sand-duo":      { model: "lines", variant: "l3", decor: "gold" }
  };
  var BGS = { studio: "Qorong‘i studiya", light: "Yorug‘ fon", wall: "Devor bilan" };
  var WALLS = { warm: { name: "Iliq oq", hex: "#e9e4da" }, grey: { name: "Kulrang", hex: "#b9b8b4" }, dark: { name: "Grafit", hex: "#4a4b4f" } };
  var ZMIN = 1, ZMAX = 3;

  var st = { mode: "3d", id: null, size: null, qty: 1, bg: "studio", wall: "warm", z: 1, x: 0, y: 0 };
  var list = [];

  function photos() {
    return (YD.data.PRODUCTS || []).filter(function (p) { return p && PHOTO_RE.test(p.image || ""); });
  }
  function cur() { return list.filter(function (p) { return p.id === st.id; })[0] || null; }
  function thumb(p) { return p.image.replace("/doors/photo/", "/doors/photo/thumb/"); }
  function src(p) { return "/" + p.image.replace(/^\//, ""); }
  function ready() { return list.length > 0; }

  /* ---------- Rejim almashtirish ---------- */
  function setMode(mode, opts) {
    opts = opts || {};
    if (mode === "photo" && !ready()) return;
    st.mode = mode;
    document.body.classList.remove("cfg-sheet-on");           // mobil sozlamalar paneli yopiladi
    var so = $("cfgSheetOpen"); if (so) so.setAttribute("aria-expanded", "false");
    var on = mode === "photo";
    document.body.classList.toggle("cfg-photo-on", on);
    ["cfgPhotoOptions", "cfgPhoto", "cfgPhotoSummary"].forEach(function (id) { $(id).hidden = !on; });
    $("cfgOptions").hidden = on; $("cfgSummary").hidden = on;
    $("cfgModeBtn3d").setAttribute("aria-selected", String(!on));
    $("cfgModeBtnPhoto").setAttribute("aria-selected", String(on));
    var legend = document.querySelector(".cfg-legend"); if (legend) legend.hidden = on;
    var h2 = document.querySelector(".cfg-panel-head h2"); if (h2) h2.textContent = on ? "Katalog eshiklari" : "Sozlamalar";
    if (on) { if (!st.id) select(list[0].id, true); else render(); }
    if (!opts.silent) syncUrl();
  }
  function syncUrl() {
    try {
      var u = new URL(location.href);
      if (st.mode === "photo" && st.id) u.searchParams.set("photo", st.id); else u.searchParams.delete("photo");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) { /* e'tiborsiz */ }
  }

  /* ---------- Tanlash ---------- */
  function select(id, silent) {
    var p = list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    st.id = id; st.size = p.sizes[0]; st.qty = 1; resetView();
    render();
    if (!silent) syncUrl();
  }

  /* ---------- Chizish ---------- */
  function renderOptions() {
    var p = cur(), box = $("cfgPhotoOptions");
    var html = '<p class="cfg-legend"><span class="cfg-tag">2D</span> Bu — haqiqiy foto. Uni aylantirib bo‘lmaydi (3D ma’lumot yo‘q); aylantirish uchun «3D konstruktor» rejimidan foydalaning.</p>';
    html += '<section class="cfg-group"><h3>Eshik modeli</h3><div role="radiogroup" aria-label="Eshik modeli" class="cfg-grid cfg-grid--3">' +
      list.map(function (q) {
        var sel = q.id === st.id;
        return '<button type="button" class="cfg-card' + (sel ? " is-selected" : "") + '" role="radio" data-ph="model" data-v="' + esc(q.id) + '" aria-checked="' + sel + '" tabindex="' + (sel ? 0 : -1) + '" aria-label="' + esc(q.name) + '">' +
          '<img class="cfg-ph-thumb" src="' + esc("/" + thumb(q)) + '" alt="" loading="lazy" decoding="async" width="74" height="110">' +
          '<span class="cfg-card-name">' + esc(q.name) + '</span><span class="cfg-card-sub">' + esc(YD.formatPrice(q.price)) + "</span></button>";
      }).join("") + "</div></section>";
    html += '<section class="cfg-group"><h3>Fon (ko‘rinish)</h3><div role="radiogroup" aria-label="Fon" class="cfg-chips">' +
      Object.keys(BGS).map(function (k) { return '<button type="button" class="cfg-chip' + (st.bg === k ? " is-selected" : "") + '" role="radio" data-ph="bg" data-v="' + k + '" aria-checked="' + (st.bg === k) + '">' + esc(BGS[k]) + "</button>"; }).join("") + "</div>";
    if (st.bg === "wall") {
      html += '<div class="cfg-swatches" role="radiogroup" aria-label="Devor rangi" style="margin-top:12px">' +
        Object.keys(WALLS).map(function (k) {
          return '<div class="cfg-sw-wrap"><button type="button" class="cfg-swatch' + (st.wall === k ? " is-selected" : "") + '" style="background-color:' + WALLS[k].hex + '" role="radio" data-ph="wall" data-v="' + k + '" aria-checked="' + (st.wall === k) + '" aria-label="Devor: ' + esc(WALLS[k].name) + '"></button><span class="cfg-sw-name">' + esc(WALLS[k].name) + "</span></div>";
        }).join("") + "</div>" +
        '<p class="cfg-note" style="margin-top:8px">Devor — faqat namuna fon. Romi eshik fotosida ko‘rinib turgan holda.</p>';
    }
    html += "</section>";
    html += '<section class="cfg-group"><h3>O‘lcham (mm)</h3><div role="radiogroup" aria-label="O‘lcham" class="cfg-chips">' +
      p.sizes.map(function (s) { return '<button type="button" class="cfg-chip' + (st.size === s ? " is-selected" : "") + '" role="radio" data-ph="size" data-v="' + esc(s) + '" aria-checked="' + (st.size === s) + '">' + esc(s) + "</button>"; }).join("") + "</div>" +
      '<p class="cfg-note" style="margin-top:8px">Foto o‘lchamga qarab o‘zgarmaydi — tanlangan o‘lcham buyurtmaga yoziladi.</p></section>';
    var col = (YD.data.COLORS || {})[p.color];
    html += '<section class="cfg-group"><h3>Rang va tutqich</h3><p class="cfg-note">Rang: <b>' + esc(col ? col.name : p.color) + '</b>. Tutqich va furnitura — fotodagidek, boshqa variant tanlab bo‘lmaydi. Boshqa rang yoki tutqichni tanlash uchun 3D konstruktorda o‘xshash modelni oching.</p>' +
      '<button class="btn btn--outline btn--sm" type="button" data-ph="to3d" style="margin-top:10px">3D da o‘xshash modelni ochish</button></section>';
    box.innerHTML = html;
  }

  function renderSummary() {
    var p = cur(), box = $("cfgPhotoSummary");
    var col = (YD.data.COLORS || {})[p.color], style = (YD.data.STYLES || {})[p.style] || p.style;
    var specs = p.specs || {};
    var total = p.price * st.qty;
    var rows = [["Model", p.name], ["Rang", col ? col.name : p.color], ["Uslub", style], ["O‘lcham", st.size + " mm"]];
    Object.keys(specs).forEach(function (k) { rows.push([k, specs[k]]); });
    box.innerHTML = '<h2 class="cfg-sum-title">' + esc(p.name) + "</h2>" +
      '<p class="cfg-sum-code"><span class="cfg-tag">2D foto ko‘rinish</span></p>' +
      '<dl class="cfg-rows">' + rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>" +
      '<div class="cfg-qty"><span id="cfgPhQtyLabel">Soni</span><div class="qty" role="group" aria-labelledby="cfgPhQtyLabel"><button type="button" data-ph="qty" data-d="-1" aria-label="Kamaytirish">−</button><input type="number" id="cfgPhQty" min="1" max="99" value="' + st.qty + '" inputmode="numeric" aria-label="Soni"><button type="button" data-ph="qty" data-d="1" aria-label="Ko‘paytirish">+</button></div></div>' +
      '<div class="cfg-price"><small>Katalog narxi (1 komplekt)</small>' +
      '<ul class="cfg-lines"><li class="is-base"><span>' + esc(p.name) + "</span><b>" + YD.formatPrice(p.price) + "</b></li></ul>" +
      (st.qty > 1 ? '<p class="cfg-unit">1 komplekt: ' + YD.formatPrice(p.price) + " × " + st.qty + "</p>" : "") +
      '<small class="cfg-total-label">Jami' + (st.qty > 1 ? " (" + st.qty + " dona)" : "") + "</small><strong>" + YD.formatPrice(total) + "</strong>" +
      "<p>" + (YD.isSample && YD.isSample() ? "Narx namunaviy. " : "") + "Aniq narx va o‘lcham menejer tomonidan tasdiqlanadi.</p></div>" +
      '<button class="btn btn--gold btn--block" type="button" data-ph="cart">Savatga qo‘shish</button>' +
      '<a class="btn btn--outline btn--block" style="margin-top:10px" href="/Product?id=' + encodeURIComponent(p.id) + '">Mahsulot sahifasi</a>' +
      '<p class="cfg-disclaimer"><svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg><span>Bu — katalogdagi tayyor eshikning 2D fotosi. Rang, tutqich va naqshni o‘zgartirib, 3D da ko‘rish uchun «3D konstruktor» rejimiga o‘ting.</span></p>';
  }

  function applyBg() {
    var bg = $("cfgPhotoBg");
    bg.className = "cfg-photo-bg is-" + st.bg;
    bg.style.setProperty("--wall", WALLS[st.wall].hex);
    $("cfgPhoto").className = "cfg-photo is-" + st.bg;
  }
  function renderStage() {
    var p = cur(), img = $("cfgPhotoImg");
    img.alt = p.name + " — eshik fotosi (2D)";
    if (img.getAttribute("data-id") !== p.id) {
      img.setAttribute("data-id", p.id);
      img.classList.add("is-loading");
      img.onload = img.onerror = function () { img.classList.remove("is-loading"); };
      img.src = src(p);
    }
    $("cfgPhotoPan").setAttribute("aria-label", p.name + " — eshik fotosi (2D). Yaqinlashtirish: g‘ildirak yoki + − tugmalari");
    applyBg(); applyView();
  }
  function render() { if (!cur()) return; renderOptions(); renderSummary(); renderStage(); }

  /* ---------- Yaqinlashtirish / siljitish ---------- */
  function applyView() {
    var box = $("cfgPhoto"), r = box.getBoundingClientRect();
    var mx = (r.width * (st.z - 1)) / 2, my = (r.height * (st.z - 1)) / 2;
    st.x = Math.max(-mx, Math.min(mx, st.x)); st.y = Math.max(-my, Math.min(my, st.y));
    $("cfgPhotoPan").style.transform = "translate(" + st.x.toFixed(1) + "px," + st.y.toFixed(1) + "px) scale(" + st.z.toFixed(3) + ")";
    box.classList.toggle("is-zoomed", st.z > 1.001);
    box.querySelector('[data-z="in"]').disabled = st.z >= ZMAX - 0.001;
    box.querySelector('[data-z="out"]').disabled = st.z <= ZMIN + 0.001;
  }
  function zoomTo(z, cx, cy) {
    var nz = Math.max(ZMIN, Math.min(ZMAX, z)), k = nz / st.z, box = $("cfgPhoto").getBoundingClientRect();
    if (cx === undefined) { cx = box.width / 2; cy = box.height / 2; }
    var px = cx - box.width / 2, py = cy - box.height / 2;      // nuqta markazga nisbatan: shu nuqta joyida qolsin
    st.x = px - (px - st.x) * k; st.y = py - (py - st.y) * k; st.z = nz;
    if (nz === 1) { st.x = 0; st.y = 0; }
    applyView();
  }
  function resetView() { st.z = 1; st.x = 0; st.y = 0; if (cur()) applyView(); }

  function bindStage() {
    var box = $("cfgPhoto"), pan = $("cfgPhotoPan"), ptr = {}, last = null;
    box.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      zoomTo(st.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    box.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".cfg-photo-zoom")) return;
      ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* e'tiborsiz */ }
      last = null;
    });
    box.addEventListener("pointermove", function (e) {
      if (!ptr[e.pointerId]) return;
      var ids = Object.keys(ptr), prev = ptr[e.pointerId];
      ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (ids.length === 2) {                                   // chimchilash
        var a = ptr[ids[0]], b = ptr[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), r = box.getBoundingClientRect();
        if (last) zoomTo(st.z * d / last, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        last = d;
      } else if (ids.length === 1 && st.z > 1) {               // siljitish
        st.x += e.clientX - prev.x; st.y += e.clientY - prev.y; applyView();
      }
    });
    function up(e) { delete ptr[e.pointerId]; last = null; }
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    box.addEventListener("dblclick", function (e) { var r = box.getBoundingClientRect(); zoomTo(st.z > 1.5 ? 1 : 2.2, e.clientX - r.left, e.clientY - r.top); });
    box.querySelector(".cfg-photo-zoom").addEventListener("click", function (e) {
      var b = e.target.closest("[data-z]"); if (!b) return;
      if (b.dataset.z === "in") zoomTo(st.z * 1.3); else if (b.dataset.z === "out") zoomTo(st.z / 1.3); else resetView();
    });
    pan.addEventListener("keydown", function (e) {
      var s = 30;
      if (e.key === "+" || e.key === "=") zoomTo(st.z * 1.2);
      else if (e.key === "-") zoomTo(st.z / 1.2);
      else if (e.key === "0") resetView();
      else if (st.z > 1 && /^Arrow/.test(e.key)) { st.x += e.key === "ArrowLeft" ? s : e.key === "ArrowRight" ? -s : 0; st.y += e.key === "ArrowUp" ? s : e.key === "ArrowDown" ? -s : 0; applyView(); }
      else return;
      e.preventDefault();
    });
    window.addEventListener("resize", function () { if (st.mode === "photo") applyView(); });
  }

  /* ---------- Hodisalar ---------- */
  function to3d() {
    var p = cur(), sim = SIMILAR[p.id];
    var cfg = C.defaults();
    if (sim) { cfg.model = sim.model; cfg.variant = sim.variant; if (sim.decor) cfg.decor = sim.decor; }
    if (C.COLORS[p.color]) cfg.color = p.color;
    setMode("3d");
    if (window.YDConfigurator && window.YDConfigurator.loadConfig) window.YDConfigurator.loadConfig(cfg, "3D da o‘xshash model ochildi: " + p.name + " (aynan emas)");
    YD.toast("3D da o‘xshash model ochildi — bu " + p.name + "ning aynan nusxasi emas");
  }
  function bindEvents() {
    $("cfgModeBtn3d").addEventListener("click", function () { setMode("3d"); });
    $("cfgModeBtnPhoto").addEventListener("click", function () { setMode("photo"); });
    $("cfgPhotoOptions").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ph]"); if (!b) return;
      var k = b.dataset.ph, v = b.dataset.v;
      if (k === "model") select(v);
      else if (k === "bg") { st.bg = v; render(); }
      else if (k === "wall") { st.wall = v; render(); }
      else if (k === "size") { st.size = v; renderOptions(); renderSummary(); }
      else if (k === "to3d") to3d();
    });
    $("cfgPhotoOptions").addEventListener("keydown", function (e) {
      var b = e.target.closest('[role="radio"]');
      if (!b || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      var items = [].slice.call(b.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]'));
      var n = items[(items.indexOf(b) + (/Left|Up/.test(e.key) ? -1 : 1) + items.length) % items.length];
      if (n && n !== b) { e.preventDefault(); n.click(); var again = $("cfgPhotoOptions").querySelector('[data-ph="' + n.dataset.ph + '"][data-v="' + n.dataset.v + '"]'); if (again) again.focus({ preventScroll: true }); }
    });
    var sum = $("cfgPhotoSummary");
    sum.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ph]"); if (!b) return;
      if (b.dataset.ph === "qty") { st.qty = Math.max(1, Math.min(99, st.qty + Number(b.dataset.d))); renderSummary(); }
      else if (b.dataset.ph === "cart") {
        var p = cur(); YD.store.addToCart(p.id, st.size, st.qty);
        YD.toast(p.name + " (" + st.size + ") savatga qo‘shildi", { href: "/Cart", label: "Savatga o‘tish" });
      }
    });
    sum.addEventListener("change", function (e) { if (e.target.id === "cfgPhQty") { st.qty = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)); renderSummary(); } });
    bindStage();
  }

  function start() {
    list = photos();
    if (!list.length) { var b = $("cfgModeBtnPhoto"); if (b) b.hidden = true; return; }
    bindEvents();
    var id = null;
    try { id = new URL(location.href).searchParams.get("photo"); } catch (e) { /* e'tiborsiz */ }
    if (id && list.some(function (p) { return p.id === id; })) { st.id = id; st.size = cur().sizes[0]; setMode("photo", { silent: true }); }
    else if (id) syncUrl();
    window.YDConfiguratorPhoto = { get state() { return st; }, setMode: setMode, select: select };
  }
  YD.whenReady(start);
})();
