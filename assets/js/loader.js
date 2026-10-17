/* =========================================================
   YasinDoors — loading screen
   - <head> ichida sinxron yuklanadi va sahifa chizilishidan OLDIN overlay qo‘yadi
   - faqat sessiyadagi birinchi kirishda ko‘rsatiladi (keyingi sahifalarda chiqmaydi)
   - progress haqiqiy vazifalardan hisoblanadi: DOM, shriftlar, birinchi ekran rasmlari,
     window "load". Ular hali ma’lum bo‘lmaganda — foizsiz, noaniq animatsiya.
   - xavfsizlik: 9 soniyalik JS failsafe + CSS failsafe; har qanday xato — overlay darhol olinadi
   ========================================================= */
(function () {
  "use strict";

  var KEY = "yd_intro_seen";
  var MAX_WAIT = 9000; // eng uzoq kutish: shundan keyin sayt baribir ochiladi

  var root = document.documentElement;
  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === "1"; } catch (e) { /* sessionStorage yo‘q — ko‘rsatamiz */ }

  var api = { active: false, done: true, onReady: function (cb) { cb(); } };
  window.YDLoader = api;
  if (seen) return;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var waiting = [];
  var el, fill, pctEl, statusEl;

  var state = {
    domReady: false,
    fontsReady: false,
    loaded: false,
    introDone: reduceMotion,
    images: null,        // DOM tayyor bo‘lgach aniqlanadi
    imagesDone: 0,
    shown: 0,            // ekranda ko‘rsatilayotgan foiz (haqiqiy qiymatdan oshmaydi)
    finished: false
  };

  var MESSAGES = [
    "Yangi kolleksiyalar tayyorlanmoqda...",
    "Premium dizaynlar yuklanmoqda...",
    "Deyarli tayyor..."
  ];

  function markup() {
    return '' +
      '<div class="ydl-stage">' +
        '<svg class="ydl-door" viewBox="0 0 200 320" aria-hidden="true">' +
          '<defs><linearGradient id="ydlLine" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#c9a66b" stop-opacity=".75"/><stop offset="1" stop-color="#c9a66b" stop-opacity=".08"/>' +
          "</linearGradient></defs>" +
          '<path pathLength="1" d="M18 318V18h164v300"/>' +
          '<path class="d2" pathLength="1" d="M36 318V36h128v282"/>' +
          '<line class="d3" pathLength="1" x1="-40" y1="318" x2="240" y2="318"/>' +
        "</svg>" +
        '<div class="ydl-mark">' +
          '<span class="ydl-glow"></span>' +
          '<span class="ydl-ring"></span>' +
          '<svg class="ydl-logo" viewBox="0 0 100 100" aria-hidden="true">' +
            '<defs><linearGradient id="ydlGold" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0" stop-color="#8a6a3a"/><stop offset=".55" stop-color="#c9a66b"/><stop offset="1" stop-color="#f1d9a6"/>' +
            "</linearGradient></defs>" +
            // Y — o‘ng qanoti D ning yuqori burchagidan chiqadi (YD ligaturasi)
            '<path class="l1" pathLength="1" d="M10 20L28 46L46 20M28 46V80"/>' +
            // D — eshik shaklida
            '<path class="l2" pathLength="1" d="M46 20V80h12c17 0 30-13 30-30S75 20 58 20H46"/>' +
            // eshik tutqichi
            '<circle cx="66" cy="51" r="2.6"/>' +
          "</svg>" +
        "</div>" +
        '<p class="ydl-word">YASIN<b>DOORS</b></p>' +
        '<p class="ydl-tag">PREMIUM MDF DOORS</p>' +
        '<div class="ydl-progress">' +
          '<div class="ydl-track" role="progressbar" aria-label="Sayt yuklanmoqda" aria-valuemin="0" aria-valuemax="100">' +
            '<span class="ydl-fill"></span>' +
          "</div>" +
          '<div class="ydl-meta"><span class="ydl-status">' + MESSAGES[0] + '</span><span class="ydl-pct">0%</span></div>' +
        "</div>" +
      "</div>";
  }

  /* ---------- Haqiqiy progress ---------- */
  // Birliklar: DOM (1) + shriftlar (1) + har bir birinchi ekran rasmi (1 tadan) + window load (1)
  function realProgress() {
    if (!state.domReady || state.images === null) return null; // hali o‘lchab bo‘lmaydi
    var total = 3 + state.images.length;
    var done = 1 + (state.fontsReady ? 1 : 0) + state.imagesDone + (state.loaded ? 1 : 0);
    return Math.min(100, (done / total) * 100);
  }

  function setStatus(i) {
    if (statusEl.getAttribute("data-i") === String(i)) return;
    statusEl.setAttribute("data-i", i);
    statusEl.classList.add("is-swapping");
    var swap = function () {
      statusEl.textContent = MESSAGES[i];
      statusEl.classList.remove("is-swapping");
    };
    if (reduceMotion) swap(); else statusEl.addEventListener("transitionend", swap, { once: true });
  }

  var rafId = 0;
  function render() {
    rafId = 0;
    if (!el) return;
    var real = realProgress();
    if (real === null) {
      el.classList.add("is-indeterminate");
      return;
    }
    el.classList.remove("is-indeterminate");
    // Ko‘rsatilayotgan qiymat haqiqiy qiymatga silliq yetib oladi, lekin hech qachon undan oshmaydi
    var diff = real - state.shown;
    state.shown = reduceMotion || diff < 0.4 ? real : state.shown + diff * 0.18;
    var shown = Math.min(state.shown, real);
    fill.style.transform = "scaleX(" + (shown / 100).toFixed(4) + ")";
    pctEl.textContent = Math.floor(shown) + "%";
    el.querySelector(".ydl-track").setAttribute("aria-valuenow", String(Math.floor(shown)));
    setStatus(real >= 85 ? 2 : real >= 34 ? 1 : 0);

    if (real - state.shown > 0.4) schedule();
    maybeFinish();
  }
  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(render);
  }

  /* ---------- Yakunlash ---------- */
  function ready() {
    return state.domReady && state.fontsReady && state.loaded && state.introDone;
  }
  function maybeFinish() {
    if (state.finished || !ready()) return;
    // Ekranda 100% ko‘rinib ulgursin (yashirin tabda rAF ishlamaydi — kutib o‘tirmaymiz)
    if (state.shown < 99.5 && document.visibilityState === "visible") { schedule(); return; }
    finish();
  }

  function finish() {
    if (state.finished) return;
    state.finished = true;
    clearTimeout(failsafe);
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* e’tiborsiz */ }

    if (!el) return cleanup();
    fill.style.transform = "scaleX(1)";
    pctEl.textContent = "100%";
    // Scroll va interaktivlik darhol qaytadi — overlay esa silliq so‘nadi
    root.classList.remove("yd-loading");
    el.classList.add("is-leaving");
    el.setAttribute("aria-busy", "false");
    var removed = false;
    var remove = function (e) {
      if (removed || (e && (e.target !== el || e.propertyName !== "opacity"))) return;
      removed = true;
      cleanup();
    };
    el.addEventListener("transitionend", remove);
    // transitionend kelmasa (yashirin tab, reduce-motion) — baribir olib tashlaymiz
    setTimeout(remove, 1200);
    notify();
  }

  function cleanup() {
    root.classList.remove("yd-loading");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    notify();
  }

  function notify() {
    if (api.done) return;
    api.done = true;
    api.active = false;
    var list = waiting.splice(0);
    list.forEach(function (cb) { try { cb(); } catch (e) { setTimeout(function () { throw e; }); } });
    try { document.dispatchEvent(new CustomEvent("yd:loaded")); } catch (e) { /* eski brauzer */ }
  }

  /* ---------- Vazifalarni kuzatish ---------- */
  function collectImages() {
    // Birinchi ekrandagi (va lazy bo‘lmagan) rasmlar — sahifaning dastlabki ko‘rinishi uchun zarur
    var vh = window.innerHeight || 800;
    var list = [].slice.call(document.images).filter(function (img) {
      if (img.loading === "lazy") return false;
      var r = img.getBoundingClientRect();
      return r.top < vh * 1.1 && r.bottom > -50 && r.width > 0;
    });
    state.images = list;
    list.forEach(function (img) {
      var settle = function () {
        if (img.__ydlDone) return;
        img.__ydlDone = true;
        state.imagesDone++;
        schedule();
      };
      if (img.complete) settle();
      else {
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", settle, { once: true }); // xato rasm yuklanishni to‘xtatmasin
      }
    });
    schedule();
  }

  function onDomReady() {
    state.domReady = true;
    // Sahifa skriptlari (carousel, katalog) DOMContentLoaded’da kontent chizadi —
    // ular ishlab bo‘lgach rasmlarni yig‘amiz
    setTimeout(collectImages, 0);
    schedule();
  }

  var failsafe;
  try {
    el = document.createElement("div");
    el.className = "ydl";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-label", "YasinDoors sayti yuklanmoqda");
    if (reduceMotion) el.classList.add("is-reduced");
    el.classList.add("is-indeterminate");
    el.innerHTML = markup();
    fill = el.querySelector(".ydl-fill");
    pctEl = el.querySelector(".ydl-pct");
    statusEl = el.querySelector(".ydl-status");
    root.classList.add("yd-loading");
    root.appendChild(el); // <body> hali yo‘q — overlay to‘g‘ridan-to‘g‘ri <html> ga qo‘yiladi
    api.active = true;
    api.done = false;
    api.onReady = function (cb) { if (api.done) cb(); else waiting.push(cb); };

    // Logotipning kirish animatsiyasi to‘liq ko‘rinsin (vaqt emas, haqiqiy animationend hodisasi)
    el.addEventListener("animationend", function (e) {
      if (e.animationName === "ydl-mark-in") { state.introDone = true; maybeFinish(); }
    });
    // Tab yashirin bo‘lsa animatsiyalar ishlamaydi — intro shartini kutmaymiz
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") { state.introDone = true; maybeFinish(); }
    });
    if (document.visibilityState !== "visible") state.introDone = true;

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
    else onDomReady();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { state.fontsReady = true; schedule(); }, function () { state.fontsReady = true; schedule(); });
    } else state.fontsReady = true;

    if (document.readyState === "complete") state.loaded = true;
    else window.addEventListener("load", function () { state.loaded = true; schedule(); maybeFinish(); }, { once: true });

    // Cheksiz loading bo‘lmasin: eng ko‘pi bilan MAX_WAIT dan keyin sayt ochiladi
    failsafe = setTimeout(finish, MAX_WAIT);
    // Boshqa skriptlarda xato bo‘lsa ham loader o‘z ishini davom ettiradi (load hodisasi baribir keladi)
    window.addEventListener("pageshow", function (e) { if (e.persisted) cleanup(); });
  } catch (err) {
    // Loader’ning o‘zida xato — hech qachon saytni to‘sib qo‘ymaymiz
    try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { /* e’tiborsiz */ }
    root.classList.remove("yd-loading");
    api.done = true;
    api.active = false;
    api.onReady = function (cb) { cb(); };
  }
})();
