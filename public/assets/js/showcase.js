/* =========================================================
   YasinDoors — "Premium MDF eshiklar vitrinasi" (video-vitrina uslubidagi avtomatik slayder)
   - har bir eshik 5 soniya ko‘rinadi, so‘ng silliq (fade + zoom + yengil slide) keyingisiga o‘tadi; oxirgidan keyin boshiga qaytadi
   - eshik rasmi doim to‘liq (object-fit: contain), hamma kadr bir xil o‘lchamda
   - qo‘lda boshqarish: strelkalar, nuqtalar, swipe/drag, klaviatura; qo‘lda o‘tilganda taymer qaytadan boshlanadi
   - to‘xtatish: kursor/fokus ustida, sudralayotganda, bo‘lim ekranda ko‘rinmaganda, tab yashirin bo‘lganda,
     yuklash ekrani ochiq bo‘lganda; to‘xtagan joydan (qolgan vaqt bilan) davom etadi
   - prefers-reduced-motion: avtomatik almashish o‘chiq (foydalanuvchi "play" tugmasi bilan yoqishi mumkin), o‘tishlar qisqa
   - bitta taymer: har qanday vaqtda faqat bitta setTimeout; mount() qayta chaqirilsa eski nusxa to‘liq tozalanadi
   Ishlatish: YDShowcase.mount(element, mahsulotlar, { interval: 5000, label: "..." })
   ========================================================= */
(function () {
  "use strict";

  function mod(a, n) { return ((a % n) + n) % n; }

  function mount(root, products, opts) {
    if (!root || !products || !products.length) return null;
    if (root.__ydShowcase) root.__ydShowcase.destroy();   // sahifa qayta chizilsa taymerlar yig‘ilib qolmasin
    opts = opts || {};

    var n = products.length;
    var interval = opts.interval || 5000;
    var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var esc = YD.esc, icon = YD.icon;

    root.classList.add("vs");
    root.style.setProperty("--vs-interval", interval + "ms");
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "karusel");
    root.setAttribute("aria-label", opts.label || "MDF eshiklar vitrinasi");
    root.classList.toggle("is-reduced", reduceMotion);

    function imgOf(p) { return p.image || "assets/img/fallback.svg"; }

    /* ---------- Markup ---------- */
    root.innerHTML =
      '<div class="vs-backdrop" aria-hidden="true">' + products.map(function () { return "<i></i>"; }).join("") + "</div>" +
      '<div class="vs-stage" tabindex="0" aria-label="Eshiklarni almashtirish uchun chap/o‘ng strelkalardan foydalaning">' +
        '<button class="vs-arrow vs-arrow--prev" type="button" data-vs="prev" aria-label="Oldingi eshik">' + icon("arrow-left") + "</button>" +
        '<div class="vs-slides">' +
          products.map(function (p, i) {
            var color = YD.data.COLORS[p.color] || { name: p.color, hex: "#ccc" };
            var url = "product-detail.html?id=" + encodeURIComponent(p.id);
            var sale = p.oldPrice && p.oldPrice > p.price;
            return '<article class="vs-slide" data-i="' + i + '" role="group" aria-roledescription="slayd" aria-label="' + (i + 1) + " / " + n + ": " + esc(p.name) + '">' +
              '<a class="vs-frame" href="' + url + '" tabindex="-1" draggable="false" aria-label="' + esc(p.name) + ' — batafsil">' +
                '<img src="' + esc(imgOf(p)) + '" alt="' + esc(p.name) + ' MDF eshigi" width="480" height="600" draggable="false"' + (i < 2 ? "" : ' loading="lazy"') + ' decoding="async">' +
                '<span class="vs-tag">' + esc(p.badges.indexOf("new") !== -1 ? "Yangi kolleksiya" : p.badges.indexOf("popular") !== -1 ? "Xaridorlar tanlovi" : "Premium") + "</span>" +
              "</a>" +
              '<div class="vs-info">' +
                '<div class="vs-meta"><span class="swatch" style="background:' + esc(color.hex) + '"></span>' + esc(color.name) + " · " + esc(YD.data.STYLES[p.style] || p.style) + "</div>" +
                '<h3 class="vs-name">' + esc(p.name) + "</h3>" +
                '<p class="vs-desc">' + esc(p.short || "") + "</p>" +
                '<div class="vs-price">' + (sale ? '<span class="price-old">' + YD.formatPrice(p.oldPrice) + "</span>" : "") + "<strong>" + YD.formatPrice(p.price) + "</strong></div>" +
                '<div class="vs-actions"><a class="btn btn--light" href="' + url + '">Batafsil</a>' +
                  '<button class="btn btn--gold" type="button" data-vs-order="' + esc(p.id) + '">Buyurtma berish</button></div>' +
              "</div></article>";
          }).join("") +
        "</div>" +
        '<button class="vs-arrow vs-arrow--next" type="button" data-vs="next" aria-label="Keyingi eshik">' + icon("arrow") + "</button>" +
      "</div>" +
      '<div class="vs-controls">' +
        '<div class="vs-dots" role="group" aria-label="Slaydni tanlash">' +
          products.map(function (p, i) { return '<button class="vs-dot" type="button" data-vs-go="' + i + '" aria-label="' + (i + 1) + "-eshik: " + esc(p.name) + '"><span class="vs-dot-fill"></span></button>'; }).join("") +
        "</div>" +
        '<span class="vs-counter" aria-hidden="true"><b data-vs-current>01</b> / ' + String(n).padStart(2, "0") + "</span>" +
        '<button class="vs-toggle" type="button" data-vs="toggle"></button>' +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-vs-live></p>';

    var stage = root.querySelector(".vs-stage");
    var slides = [].slice.call(root.querySelectorAll(".vs-slide"));
    var bgs = [].slice.call(root.querySelectorAll(".vs-backdrop i"));
    var dots = [].slice.call(root.querySelectorAll(".vs-dot"));
    var live = root.querySelector("[data-vs-live]");
    var counter = root.querySelector("[data-vs-current]");
    var toggleBtn = root.querySelector('[data-vs="toggle"]');
    bgs.forEach(function (el, i) { el.style.backgroundImage = 'url("' + String(imgOf(products[i])).replace(/"/g, "%22") + '")'; });

    /* ---------- Holat ---------- */
    var index = 0;
    var timer = null;                 // YAGONA taymer (setTimeout). Hech qachon ikkitasi bir vaqtda ishlamaydi.
    var deadline = 0;                 // taymer qachon ishga tushishi kerak (ms, Date.now)
    var remaining = interval;         // pauzadan keyin qolgan vaqt
    var leaveTimer = null;
    var flags = { hover: false, focus: false, drag: false, hidden: document.hidden, offscreen: false, loading: false, stopped: reduceMotion };
    var destroyed = false;

    function paused() {
      return flags.hover || flags.focus || flags.drag || flags.hidden || flags.offscreen || flags.loading || flags.stopped;
    }
    function clearTimer() { if (timer !== null) { clearTimeout(timer); timer = null; } }
    function schedule(ms) {
      clearTimer();
      if (destroyed || paused()) return;
      deadline = Date.now() + ms;
      timer = setTimeout(function () { timer = null; go(index + 1, "next", false); }, ms);
    }
    // Holat o‘zgarganda: to‘xtash — qolgan vaqtni eslab qolish; davom etish — shu vaqt bilan qayta rejalash
    function sync() {
      if (destroyed) return;
      if (paused()) {
        if (timer !== null) { remaining = Math.max(0, deadline - Date.now()); clearTimer(); }
      } else if (timer === null) {
        schedule(remaining > 0 ? remaining : interval);
      }
      root.classList.toggle("is-paused", paused());
      root.classList.toggle("is-stopped", flags.stopped);
      toggleBtn.innerHTML = icon(flags.stopped ? "play" : "pause");
      toggleBtn.setAttribute("aria-label", flags.stopped ? "Avtomatik almashishni yoqish" : "Avtomatik almashishni to‘xtatish");
    }

    /* ---------- Almashtirish ---------- */
    function preload(i) {
      var p = products[mod(i, n)], im = new Image();
      im.src = imgOf(p);
    }

    function render(prev, dir) {
      root.setAttribute("data-dir", dir);
      slides.forEach(function (s, i) {
        var on = i === index;
        s.classList.toggle("is-active", on);
        s.classList.toggle("is-leaving", i === prev && prev !== index);
        s.setAttribute("aria-hidden", on ? "false" : "true");
        if ("inert" in s) s.inert = !on;
        [].forEach.call(s.querySelectorAll("a:not(.vs-frame), button"), function (el) { if (on) el.removeAttribute("tabindex"); else el.setAttribute("tabindex", "-1"); });
      });
      bgs.forEach(function (b, i) { b.classList.toggle("is-active", i === index); });
      dots.forEach(function (d, i) {
        d.classList.toggle("is-active", i === index);
        d.setAttribute("aria-current", i === index ? "true" : "false");
      });
      counter.textContent = String(index + 1).padStart(2, "0");
      // Chiqib ketayotgan slayd animatsiya tugagach tozalanadi
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () { slides.forEach(function (s) { s.classList.remove("is-leaving"); }); }, reduceMotion ? 50 : 1200);
    }

    // manual=true — foydalanuvchi o‘zi o‘tdi: taymer boshidan boshlanadi va bir muddat shu eshikda qoladi
    function go(target, dir, manual) {
      if (destroyed) return;
      var prev = index;
      index = mod(target, n);
      remaining = interval;
      render(prev, dir || (index >= prev ? "next" : "prev"));
      restartProgress();
      preload(index + 1);
      if (manual) live.textContent = products[index].name + ", " + (index + 1) + " / " + n;
      schedule(interval);          // eski taymer schedule() ichida tozalanadi — ikkitasi bo‘lmaydi
      sync();
    }
    function restartProgress() {
      // Faol nuqtadagi progress animatsiyasi har gal boshidan boshlansin (bir xil slaydga qaytilganda ham)
      var d = dots[index]; if (!d) return;
      d.classList.remove("is-active"); void d.offsetWidth; d.classList.add("is-active");
    }
    function goIndex(i, manual) {
      var diff = mod(i - index, n);
      go(i, diff <= n / 2 ? "next" : "prev", manual);
    }

    /* ---------- Tugmalar ---------- */
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vs], [data-vs-go], [data-vs-order]");
      if (!b || !root.contains(b)) return;
      var act = b.getAttribute("data-vs");
      if (b.hasAttribute("data-vs-order")) {
        // "Buyurtma berish": mahsulot savatga qo‘shiladi va buyurtma sahifasiga o‘tiladi
        var p = YD.getProduct(b.getAttribute("data-vs-order"));
        if (!p) return;
        YD.store.addToCart(p.id, p.sizes[0], 1);
        window.location.href = "checkout.html";
        return;
      }
      if (act === "toggle") { flags.stopped = !flags.stopped; if (!flags.stopped) remaining = interval; sync(); return; }
      if (act === "prev") go(index - 1, "prev", true);
      else if (act === "next") go(index + 1, "next", true);
      else if (b.hasAttribute("data-vs-go")) goIndex(Number(b.getAttribute("data-vs-go")), true);
    });

    /* ---------- Klaviatura ---------- */
    root.addEventListener("keydown", function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      var handled = true;
      if (e.key === "ArrowLeft") go(index - 1, "prev", true);
      else if (e.key === "ArrowRight") go(index + 1, "next", true);
      else if (e.key === "Home") goIndex(0, true);
      else if (e.key === "End") goIndex(n - 1, true);
      else handled = false;
      if (handled) e.preventDefault();
    });

    /* ---------- Swipe / drag ---------- */
    var drag = null, suppressClick = false;
    stage.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".vs-arrow") || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, t: performance.now() };
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // vertikal — sahifa aylantirilyapti
        if (Math.abs(dx) < 8) return;
        drag.moved = true;
        flags.drag = true; sync();
      }
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.moved) {
        var dx = (e ? e.clientX : drag.x) - drag.x;
        var fast = Math.abs(dx) / Math.max(1, performance.now() - drag.t) > 0.45;
        if (Math.abs(dx) > 48 || (fast && Math.abs(dx) > 20)) go(index + (dx < 0 ? 1 : -1), dx < 0 ? "next" : "prev", true);
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
        flags.drag = false; sync();
      }
      drag = null;
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", function () { if (drag && drag.moved) { flags.drag = false; sync(); } drag = null; });
    stage.addEventListener("dragstart", function (e) { e.preventDefault(); });
    stage.addEventListener("click", function (e) { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, true);

    /* ---------- To‘xtatish shartlari ---------- */
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { flags.hover = true; sync(); } });
    root.addEventListener("pointerleave", function () { flags.hover = false; sync(); });
    root.addEventListener("focusin", function () { flags.focus = true; sync(); });
    root.addEventListener("focusout", function (e) { if (!root.contains(e.relatedTarget)) { flags.focus = false; sync(); } });

    function onVisibility() { flags.hidden = document.hidden; sync(); }
    document.addEventListener("visibilitychange", onVisibility);

    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) { flags.offscreen = !entries[0].isIntersecting; sync(); }, { threshold: 0.25 });
      io.observe(root);
    }
    // Yuklash ekrani ochiq bo‘lsa, slayd uning ortida aylanib ketmaydi
    if (window.YDLoader && !window.YDLoader.done) {
      flags.loading = true;
      window.YDLoader.onReady(function () { flags.loading = false; remaining = interval; sync(); });
    }

    /* ---------- Tozalash ---------- */
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimer();
      clearTimeout(leaveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      if (io) io.disconnect();
      if (root.__ydShowcase === api) root.__ydShowcase = null;
    }
    window.addEventListener("pagehide", destroy, { once: true });

    var api = {
      next: function () { go(index + 1, "next", true); },
      prev: function () { go(index - 1, "prev", true); },
      goTo: function (i) { goIndex(i, true); },
      destroy: destroy,
      get index() { return index; },
      get interval() { return interval; },
      get running() { return timer !== null; },   // sinov uchun: taymer ishlayaptimi
      get paused() { return paused(); }
    };
    root.__ydShowcase = api;

    // Boshlang‘ich holat (animatsiyasiz), keyin taymer
    root.classList.add("no-anim");
    render(-1, "next");
    restartProgress();
    preload(1);
    sync();
    schedule(interval);
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("no-anim"); }); });
    document.dispatchEvent(new CustomEvent("yd:change"));
    return api;
  }

  window.YDShowcase = { mount: mount };
})();
