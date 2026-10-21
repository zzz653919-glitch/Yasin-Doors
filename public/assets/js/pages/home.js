/* Bosh sahifa: kinematik hero, kolleksiya hikoyalari (scroll), ishlab chiqarish lentasi, ommabop mahsulotlar */
(function () {
  "use strict";
  var F = YD.FINISHES;
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* e’tiborsiz */ }

  /* ---------- Eshik "steki": ikki qatlam, qoplama almashganda silliq o‘tadi ---------- */
  function layer(spec) { var d = document.createElement("div"); d.className = "xl"; d.innerHTML = YD.doorSVG(spec); return d; }
  function makeStack(els, variant, handle, startIdx) {
    var cur = startIdx, active = 0;
    var layers = els.map(function (el) {
      el.innerHTML = "";
      var f = F[startIdx];
      var a = layer({ hex: f.hex, edge: f.edge, grain: f.gr, variant: variant, handle: handle, trim: "dark" });
      var b = layer({ hex: f.hex, edge: f.edge, grain: f.gr, variant: variant, handle: handle, trim: "dark" });
      b.style.opacity = 0;
      el.appendChild(a); el.appendChild(b);
      return [a, b];
    });
    return {
      get: function () { return cur; },
      pick: function (i) {
        if (i === cur) return;
        var f = F[i], next = 1 - active;
        layers.forEach(function (pair) {
          pair[next].innerHTML = YD.doorSVG({ hex: f.hex, edge: f.edge, grain: f.gr, variant: variant, handle: handle, trim: "dark" });
          pair[next].style.opacity = 1;
          pair[active].style.opacity = 0;
        });
        active = next; cur = i;
      }
    };
  }

  function dotsHTML(idxs, cur) {
    return idxs.map(function (fi) {
      return '<button class="dot" type="button" data-fin="' + fi + '" aria-pressed="' + (fi === cur) + '" aria-label="' + YD.esc(F[fi].n) + '"><span style="background:' + F[fi].hex + '"></span></button>';
    }).join("");
  }
  function syncDots(box, cur) {
    box.querySelectorAll(".dot").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-fin") === cur)); });
  }

  /* ---------- Statik eshiklar (hikoya bo‘lmagan joylarda) ---------- */
  document.querySelectorAll("[data-door-static]").forEach(function (el) {
    try {
      var s = JSON.parse(el.getAttribute("data-door-static"));
      s.trim = "dark";
      el.innerHTML = YD.doorSVG(s);
    } catch (e) { /* e’tiborsiz */ }
  });

  /* ---------- Hero ---------- */
  var HERO_FINS = [3, 2, 0, 7];
  var heroEls = [].slice.call(document.querySelectorAll('[data-door-stack="hero"]'));
  if (heroEls.length) {
    var heroStack = makeStack(heroEls, "modern", "bronze", HERO_FINS[0]);
    var heroDots = document.getElementById("heroDots");
    var heroName = document.getElementById("heroFinName");
    heroDots.innerHTML = dotsHTML(HERO_FINS, HERO_FINS[0]);
    heroName.textContent = F[HERO_FINS[0]].n;
    heroDots.addEventListener("click", function (e) {
      var b = e.target.closest(".dot"); if (!b) return;
      var i = +b.getAttribute("data-fin");
      heroStack.pick(i); syncDots(heroDots, i); heroName.textContent = F[i].n;
    });
  }

  /* ---------- Material namunalari (2-bosqich) ---------- */
  var mats = document.getElementById("matSwatches");
  if (mats) mats.innerHTML = F.map(function (f) { return '<div><span style="background:' + f.hex + '"></span>' + YD.esc(f.n) + "</div>"; }).join("");

  /* ---------- Ishlab chiqarish lentasi ---------- */
  (function () {
    var tl = document.getElementById("tl");
    if (!tl) return;
    var slides = [].slice.call(tl.children), n = slides.length, cur = 0;
    var steps = document.getElementById("tlSteps");
    steps.innerHTML = slides.map(function (_, i) { return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === 0) + '" aria-label="' + (i + 1) + '-bosqich">' + (i + 1) + "</button>"; }).join("");
    var prev = document.getElementById("tlPrev"), next = document.getElementById("tlNext");
    function setCur(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      document.getElementById("tlNo").textContent = "0" + (cur + 1) + " / 0" + n;
      document.getElementById("tlBar").style.width = ((cur + 1) / n * 100).toFixed(1) + "%";
      steps.querySelectorAll("button").forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === cur)); });
      prev.disabled = cur === 0; next.disabled = cur === n - 1;
    }
    function go(i) {
      i = Math.max(0, Math.min(n - 1, i));
      tl.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: reduced ? "auto" : "smooth" });
      setCur(i);
    }
    var raf = 0;
    tl.addEventListener("scroll", function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var x = tl.scrollLeft, best = 0, bd = 1e9;
        slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft - slides[0].offsetLeft - x); if (d < bd) { bd = d; best = i; } });
        if (best !== cur) setCur(best);
      });
    }, { passive: true });
    steps.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) go(+b.getAttribute("data-i")); });
    prev.addEventListener("click", function () { go(cur - 1); });
    next.addEventListener("click", function () { go(cur + 1); });
    tl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
    });
    setCur(0);
  })();

  /* ---------- Kolleksiya hikoyalari ---------- */
  // Kategoriya nomiga qarab uslub (eshik chizmasi), dastak, qoplama ranglari va fon rangi tanlanadi
  var STORY_CFG = [
    { re: /premium|luxury/i,     short: "Premium",   variant: "premium", handle: "bronze", fins: [3, 4, 7, 6],       g1: "rgba(217,188,133,.34)", g2: "#14100B", blurb: "Bronza inleylar va chuqur lak qoplama — hashamat tafsilotlarda." },
    { re: /klassik/i,            short: "Klassik",   variant: "classic", handle: "bronze", fins: [0, 1, 2, 3, 5, 7], g1: "rgba(235,210,160,.26)", g2: "#17120C", blurb: "Ko‘tarma panellar va sokin, an’anaviy ritm." },
    { re: /shisha/i,             short: "Shisha",    variant: "glass",   handle: "steel",  fins: [6, 7, 5, 0],       g1: "rgba(130,175,190,.30)", g2: "#0C1214", blurb: "Yorug‘likni xonalar orasida erkin o‘tkazuvchi shisha oyna." },
    { re: /yog.?och|teksturali/i, short: "Yog‘och",  variant: "wood",    handle: "bronze", fins: [2, 3, 4, 1],       g1: "rgba(214,150,92,.32)",  g2: "#150E09", blurb: "Eman, yong‘oq va espresso tuslaridagi iliq yog‘och naqshi." },
    { re: /oq va|och rangli/i,   short: "Yorug‘",    variant: "minimal", handle: "steel",  fins: [1, 0, 5],          g1: "rgba(235,225,205,.24)", g2: "#121110", blurb: "Yorug‘ ranglar xonani kengroq va ochiqroq ko‘rsatadi." },
    { re: /qora|to.?q/i,         short: "To‘q",      variant: "modern",  handle: "black",  fins: [7, 6, 4, 3],       g1: "rgba(150,170,190,.22)", g2: "#0E1114", blurb: "Qora, kulrang va to‘q ranglar — chuqur va kuchli aksent." },
    { re: /geometrik/i,          short: "Geometrik", variant: "special", handle: "bronze", fins: [4, 3, 6, 7, 2],    g1: "rgba(190,140,120,.30)", g2: "#130D0C", blurb: "Aniq chiziqlar va geometrik shakllar — o‘ziga xos ritm." },
    { re: /noodatiy|maxsus/i,    short: "Maxsus",    variant: "special", handle: "steel",  fins: [3, 6, 2],          g1: "rgba(190,140,120,.30)", g2: "#130D0C", blurb: "Asimmetrik kesimlar va noyob inleylar — hamma ham tanlamaydigan yechim." },
    { re: /zamonaviy|minimal/i,  short: "Zamonaviy", variant: "modern",  handle: "steel",  fins: [7, 6, 5, 0, 3, 2], g1: "rgba(150,170,190,.28)", g2: "#0E1114", blurb: "Toza devorlarga chuqurlik beruvchi vertikal ariqchalar." }
  ];
  var STORY_ORDER = ["zamonaviy", "premium", "klassik", "shisha", "yog‘och", "yorug‘", "to‘q", "geometrik", "maxsus"];
  var GENERIC = [
    { short: "Klassik", variant: "classic" }, { short: "Zamonaviy", variant: "modern" }, { short: "Minimal", variant: "minimal" },
    { short: "Shisha", variant: "glass" }, { short: "Yog‘och", variant: "wood" }, { short: "Premium", variant: "premium" }
  ];
  var STYLE_VARIANT = { klassik: "classic", neoklassik: "premium", zamonaviy: "modern", minimalistik: "minimal", shishali: "glass", loft: "special" };

  function cfgFor(name, i) {
    for (var k = 0; k < STORY_CFG.length; k++) if (STORY_CFG[k].re.test(name)) return STORY_CFG[k];
    var g = GENERIC[i % GENERIC.length];
    return { short: String(name).split(/[\s,]+/)[0].slice(0, 10), variant: STYLE_VARIANT[name] || g.variant, handle: "bronze", fins: [3, 2, 0, 7, 6], g1: "rgba(217,188,133,.3)", g2: "#14100B", blurb: "" };
  }

  function buildGroups(products) {
    var byCat = {}, order = [];
    products.forEach(function (p) { if (p.category) { if (!byCat[p.category]) { byCat[p.category] = []; order.push(p.category); } byCat[p.category].push(p); } });
    if (order.length >= 2) {
      var rank = function (c) { var i = STORY_ORDER.indexOf(cfgFor(c, 0).short.toLowerCase()); return i < 0 ? 99 : i; };
      order.sort(function (a, b) { return rank(a) - rank(b); });
      return order.map(function (c) { return { key: c, label: c, param: "cat", items: byCat[c] }; });
    }
    // Kategoriya yo‘q (namunaviy ro‘yxat): uslub bo‘yicha guruhlaymiz
    var byStyle = {}, so = [];
    products.forEach(function (p) { if (!byStyle[p.style]) { byStyle[p.style] = []; so.push(p.style); } byStyle[p.style].push(p); });
    return so.map(function (s) { return { key: s, label: (YD.data.STYLES[s] || s), param: "style", items: byStyle[s], styleKey: s }; });
  }

  function storyHTML(g, i, total) {
    var cfg = cfgFor(g.key, i);
    if (g.styleKey) cfg = Object.assign({}, cfg, { variant: STYLE_VARIANT[g.styleKey] || cfg.variant, short: g.label.slice(0, 10), blurb: cfg.blurb });
    var no = (i + 1 < 10 ? "0" : "") + (i + 1), tot = (total < 10 ? "0" : "") + total;
    var rev = i % 2 ? " r" : "";
    var glow = "radial-gradient(60% 80% at " + (i % 2 ? "30%" : "72%") + " 38%, " + cfg.g1 + ", transparent 66%)";
    var href = "/Products?" + g.param + "=" + encodeURIComponent(g.key);
    var blurb = cfg.blurb || ("Eng yaxshi tanlangan " + g.items.length + " ta model.");
    return '<article class="story' + rev + '" style="background-color:' + cfg.g2 + ';--nl:' + cfg.short.length + '" aria-label="' + YD.esc(g.label) + ' kolleksiyasi" data-story="' + i + '">' +
      '<div class="st-glow" style="background:' + glow + '"></div>' +
      '<span class="st-name" aria-hidden="true">' + YD.esc(cfg.short) + "</span>" +
      '<span class="st-no">' + no + " / " + tot + "</span>" +
      '<div class="st-door plx"><div class="glow"></div><div class="xf tilt" data-stack></div></div>' +
      '<div class="st-panel reveal">' +
      '<div class="st-meta"><span>' + no + " · " + YD.esc(g.label) + "</span><b>" + g.items.length + " ta model</b></div>" +
      "<p>" + YD.esc(blurb) + "</p>" +
      '<div class="st-meta"><span>Qoplama · <b data-fin-name></b></span></div>' +
      '<div class="dots" role="group" aria-label="' + YD.esc(g.label) + ' qoplamasi" style="margin-left:-8px" data-dots></div>' +
      '<a class="btn btn--gold mag" href="' + href + '">Modellarni ko‘rish <svg class="icon" aria-hidden="true"><use href="#i-arrow"></use></svg></a>' +
      "</div></article>";
  }

  function mountStories() {
    var host = document.getElementById("stories");
    if (!host) return;
    var groups = buildGroups(YD.data.PRODUCTS);
    if (!groups.length) { var sec = document.getElementById("collections"); if (sec) sec.hidden = true; return; }
    host.innerHTML = groups.map(function (g, i) { return storyHTML(g, i, groups.length); }).join("");
    [].slice.call(host.querySelectorAll(".story")).forEach(function (el, i) {
      var cfg = cfgFor(groups[i].key, i);
      if (groups[i].styleKey) cfg = Object.assign({}, cfg, { variant: STYLE_VARIANT[groups[i].styleKey] || cfg.variant });
      var stack = makeStack([el.querySelector("[data-stack]")], cfg.variant, cfg.handle, cfg.fins[0]);
      var dots = el.querySelector("[data-dots]"), nameEl = el.querySelector("[data-fin-name]");
      dots.innerHTML = dotsHTML(cfg.fins, cfg.fins[0]);
      nameEl.textContent = F[cfg.fins[0]].n;
      dots.addEventListener("click", function (e) {
        var b = e.target.closest(".dot"); if (!b) return;
        var fi = +b.getAttribute("data-fin");
        stack.pick(fi); syncDots(dots, fi); nameEl.textContent = F[fi].n;
      });
    });
    YD.observeReveal(host);
  }

  /* ---------- Ommabop mahsulotlar va xizmat matnlari ---------- */
  YD.whenReady(function () {
    mountStories();

    var grid = document.getElementById("bestsellers");
    if (grid) {
      var items = YD.data.PRODUCTS.filter(function (p) { return p.badges.indexOf("popular") !== -1; });
      YD.data.PRODUCTS.forEach(function (p) { if (items.length < 4 && items.indexOf(p) === -1) items.push(p); });
      grid.innerHTML = items.slice(0, 4).map(YD.productCard).join("");
      YD.observeReveal(grid);
    }

    var site = YD.site() || {};
    var d = document.getElementById("svcDelivery"), w = document.getElementById("svcWarranty");
    if (d && site.delivery_terms) d.textContent = site.delivery_terms;
    if (w && site.warranty_info) w.textContent = site.warranty_info;
  });
})();
