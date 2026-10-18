/* =========================================================
   YasinDoors — premium scroll tizimi (kutubxonasiz)
   - yuqoridagi progress chizig‘i
   - ixchamlashuvchi, blur fonli navbar
   - rasmlarda yengil parallax
   - bo‘limlar indikatori (scroll-spy) va silliq anchor o‘tishlari
   - progress halqali "Back to top" tugmasi
   Barcha scroll hodisalari bitta requestAnimationFrame sikliga yig‘iladi:
   avval o‘qish (read), keyin yozish (write) — keraksiz layout qayta hisoblanmaydi.
   ========================================================= */
(function () {
  "use strict";

  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqParallax = window.matchMedia("(min-width: 641px) and (hover: hover)");
  var reduceMotion = mqReduce.matches;

  var doc = document.documentElement;
  var els = {};
  var maxScroll = 1;
  var ticking = false;
  var parallaxItems = [];
  var mqMobile = window.matchMedia("(max-width: 640px)");
  var isMobile = mqMobile.matches;
  var lastY = window.scrollY, scrollingUp = false;

  // Parallax qo‘llanadigan rasmlar: [selektor, kuch (px)]
  // 3D carousel (.dc-*) ataylab ro‘yxatda yo‘q — uning transformlari va drag boshqaruvi buzilmasin.
  var PARALLAX = [
    [".hero-frame img", 28],
    [".cat-card img", 18],
    [".split-media img", 32],
    [".product-media img", 14]
  ];

  function smoothBehavior() { return reduceMotion ? "auto" : "smooth"; }
  function headerOffset() { return (els.header ? els.header.offsetHeight : 64) + 16; }

  /* ---------- DOM elementlarini yaratish ---------- */
  function build() {
    els.header = document.getElementById("siteHeader");

    var bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<span class="scroll-progress-bar"></span>';
    document.body.appendChild(bar);
    els.bar = bar.firstChild;
    els.barWrap = bar;

    var top = document.createElement("button");
    top.type = "button";
    top.className = "to-top";
    top.setAttribute("aria-label", "Sahifa boshiga qaytish");
    top.innerHTML =
      '<svg class="to-top-ring" viewBox="0 0 52 52" aria-hidden="true"><circle class="to-top-track" cx="26" cy="26" r="24"/><circle class="to-top-fill" cx="26" cy="26" r="24"/></svg>' +
      '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    top.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: smoothBehavior() });
      // Klaviatura foydalanuvchisi uchun fokusni sahifa boshiga qaytaramiz
      var first = document.querySelector(".logo");
      if (first) first.focus({ preventScroll: true });
    });
    document.body.appendChild(top);
    els.toTop = top;
    els.ring = top.querySelector(".to-top-fill");
    els.ringLen = 2 * Math.PI * 24;
    els.ring.style.strokeDasharray = els.ringLen.toFixed(2);
  }

  /* ---------- Bo‘limlar indikatori (scroll-spy) ---------- */
  function slug(text) {
    return String(text).toLowerCase().replace(/[‘’ʻʼ'`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bolim";
  }
  function buildSectionNav() {
    // Ichida "eyebrow" yorlig‘i bor bo‘limlar navigatsiyaga kiradi
    var sections = [].slice.call(document.querySelectorAll("main > section")).filter(function (s) {
      return s.querySelector(".eyebrow");
    });
    if (sections.length < 3) return;

    var used = {};
    var nav = document.createElement("nav");
    nav.className = "section-nav";
    nav.setAttribute("aria-label", "Sahifa bo‘limlari");
    nav.innerHTML = sections.map(function (s) {
      var label = s.querySelector(".eyebrow").textContent.trim();
      if (!s.id) {
        var id = slug(label);
        while (used[id] || document.getElementById(id)) id += "-2";
        s.id = id;
      }
      used[s.id] = true;
      return '<a href="#' + s.id + '" data-spy="' + s.id + '"><span class="section-nav-label">' + YD.esc(label) + '</span><span class="section-nav-dot"></span></a>';
    }).join("");
    document.body.appendChild(nav);

    var links = {};
    nav.querySelectorAll("[data-spy]").forEach(function (a) { links[a.getAttribute("data-spy")] = a; });

    // Viewport markazidagi tor chiziqqa tushgan bo‘lim — faol bo‘lim
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        Object.keys(links).forEach(function (id) {
          var on = id === entry.target.id;
          links[id].classList.toggle("is-active", on);
          if (on) links[id].setAttribute("aria-current", "true"); else links[id].removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Silliq anchor o‘tishlari ---------- */
  function initAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href*='#']");
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      var url = new URL(a.getAttribute("href"), location.href);
      if (url.pathname !== location.pathname || !url.hash) return;
      var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      var y = target.getBoundingClientRect().top + window.scrollY - headerOffset() + 16;
      window.scrollTo({ top: Math.max(0, y), behavior: smoothBehavior() });
      history.replaceState(null, "", url.hash);
      document.body.classList.remove("menu-open");
    });
  }

  /* ---------- Parallax ---------- */
  // Ko‘rinish chegarasi rAF ichida bitta read-fazada tekshiriladi (rasmlar soni kam — bu arzon),
  // ekrandan tashqaridagi rasmlarga yozish qilinmaydi.
  function collectParallax() {
    var enabled = !reduceMotion && mqParallax.matches;
    var next = [];
    if (enabled) {
      PARALLAX.forEach(function (pair) {
        document.querySelectorAll(pair[0]).forEach(function (img) {
          if (img.closest(".dc")) return;
          img.classList.add("has-parallax");
          next.push({ el: img, box: img.parentElement, strength: pair[1], last: null });
        });
      });
    }
    // Ro‘yxatdan chiqqan (yoki o‘chirilgan rejimdagi) rasmlarni asl holiga qaytaramiz
    parallaxItems.forEach(function (it) {
      if (!next.some(function (n) { return n.el === it.el; })) {
        it.el.classList.remove("has-parallax");
        it.el.style.removeProperty("--py");
      }
    });
    parallaxItems = next;
  }

  /* ---------- Asosiy rAF sikli ---------- */
  function measure() {
    maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
  }

  function update() {
    ticking = false;
    // --- READ ---
    var y = window.scrollY;
    var vh = window.innerHeight;
    var progress = Math.min(1, Math.max(0, y / maxScroll));
    var rects = [];
    for (var i = 0; i < parallaxItems.length; i++) {
      var rect = parallaxItems[i].box.getBoundingClientRect();
      if (rect.bottom > -100 && rect.top < vh + 100 && rect.height > 0) rects.push([parallaxItems[i], rect]);
    }

    // --- WRITE ---
    els.bar.style.transform = "scaleX(" + progress.toFixed(4) + ")";
    els.barWrap.classList.toggle("is-hidden", maxScroll < 80);
    if (els.header) els.header.classList.toggle("is-scrolled", y > 12);
    // Telefonda tugma kontentni yopmasin: pastga o‘qiyotganda yashirinadi,
    // yuqoriga aylantirilganda yoki sahifa oxirida ko‘rinadi.
    var dir = y - lastY;
    if (Math.abs(dir) > 6) { scrollingUp = dir < 0; lastY = y; }
    var past = y > Math.min(600, vh * 0.8);
    var showTop = isMobile ? past && (scrollingUp || progress > 0.97) : past;
    els.toTop.classList.toggle("is-visible", showTop);
    els.ring.style.strokeDashoffset = (els.ringLen * (1 - progress)).toFixed(2);

    rects.forEach(function (pair) {
      var r = pair[1];
      // -1 (pastda) … 0 (markazda) … 1 (tepada)
      var t = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);
      t = Math.max(-1, Math.min(1, t));
      var val = (t * pair[0].strength).toFixed(1);
      if (val !== pair[0].last) {   // o‘zgarmagan qiymatni qayta yozmaymiz
        pair[0].last = val;
        pair[0].el.style.setProperty("--py", val + "px");
      }
    });
  }

  // Odatda rAF ishlaydi; brauzer kadrlarni to‘xtatib qo‘ygan holatlarda (fondagi oyna, iframe)
  // indikatorlar eskirib qolmasligi uchun qisqa setTimeout zaxirasi bor.
  var rafId = 0, fallbackId = 0;
  function runTick() {
    cancelAnimationFrame(rafId);
    clearTimeout(fallbackId);
    update();
  }
  function requestTick() {
    if (!ticking) {
      ticking = true;
      rafId = requestAnimationFrame(runTick);
      fallbackId = setTimeout(runTick, 150);
    }
  }

  function refresh() {
    measure();
    collectParallax();
    requestTick();
  }

  function init() {
    build();
    buildSectionNav();
    initAnchors();
    measure();

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", function () { measure(); requestTick(); }, { passive: true });

    // Kontent balandligi o‘zgarsa (katalog filtri, savat, rasmlar yuklanishi) — qayta o‘lchaymiz
    if ("ResizeObserver" in window) {
      var roTick = false;
      new ResizeObserver(function () {
        if (roTick) return;
        roTick = true;
        requestAnimationFrame(function () { roTick = false; measure(); requestTick(); });
      }).observe(document.body);
    }

    // Kartalar qayta chizilganda (filtr, sevimlilar) parallax ro‘yxatini yangilaymiz
    if ("MutationObserver" in window) {
      var moTimer;
      new MutationObserver(function () {
        clearTimeout(moTimer);
        moTimer = setTimeout(refresh, 120);
      }).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    }

    var onMq = function () { reduceMotion = mqReduce.matches; isMobile = mqMobile.matches; refresh(); };
    [mqReduce, mqParallax, mqMobile].forEach(function (mq) {
      if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
    });

    refresh();
  }

  // Sahifa sarlavhalari va bo‘lim boshlari ham tabiiy paydo bo‘lsin
  function autoReveal() {
    document.querySelectorAll(".page-hero .container > *, main .section-head, .detail-info > h1").forEach(function (el) {
      if (!el.classList.contains("reveal")) el.classList.add("reveal");
    });
    if (window.YD) YD.observeReveal();
  }

  function start() {
    autoReveal();
    init();
  }

  // Sahifa skriptlari kontentni o‘zgartirsa, qo‘lda yangilash uchun
  window.YDScroll = {
    refresh: refresh,
    stats: function () { return { parallaxItems: parallaxItems.length, maxScroll: maxScroll }; }
  };

  // app.js navbar’ni DOMContentLoaded’da yaratadi — undan keyin ishga tushamiz
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
