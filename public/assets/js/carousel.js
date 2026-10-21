/* =========================================================
   YasinDoors — 3D showcase carousel (kutubxonasiz)
   - markazda faol katta karta, yon tomonlarda chuqurlikdagi kartalar
   - strelkalar, nuqtalar, sichqoncha drag, touch swipe, klaviatura
   - avtomatik aylanish: hover/focus/drag/qo‘l bilan boshqarilganda to‘xtaydi
   - prefers-reduced-motion: avtomatik aylanish o‘chadi, animatsiya qisqaradi
   Ishlatish: YDCarousel.mount(element, mahsulotlar_ro‘yxati, { interval: 5500 })
   ========================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mod(a, n) { return ((a % n) + n) % n; }

  // Kartadagi kichik "kolleksiya" yorlig‘i mahsulot ma’lumotlaridan olinadi
  function collectionTag(p) {
    if (p.oldPrice && p.oldPrice > p.price) return "Maxsus taklif";
    if (p.badges.indexOf("new") !== -1) return "Yangi kolleksiya";
    if (p.color === "eman" || p.color === "yongoq") return "Yog‘och tekstura";
    if (p.style === "minimalistik") return "Minimalist";
    if (p.badges.indexOf("popular") !== -1) return "Xaridorlar tanlovi";
    return "Premium";
  }

  function cardHTML(p, i, n) {
    var D = YD.data, esc = YD.esc, icon = YD.icon;
    var color = D.COLORS[p.color] || { name: p.color, hex: "#ccc" };
    var url = "/Product?id=" + encodeURIComponent(p.id);
    var sale = p.oldPrice && p.oldPrice > p.price;
    return '<article class="dc-card" data-index="' + i + '" role="group" aria-roledescription="slayd" aria-label="' + (i + 1) + " / " + n + ": " + esc(p.name) + '">' +
      '<a class="dc-media" href="' + url + '" tabindex="-1" draggable="false">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + ' MDF eshigi" width="480" height="600" draggable="false"' + (i > 2 && i < n - 2 ? ' loading="lazy"' : "") + ">" +
        '<span class="dc-tag">' + esc(collectionTag(p)) + "</span>" +
      "</a>" +
      '<div class="dc-body">' +
        '<div class="dc-meta"><span class="swatch" style="background:' + esc(color.hex) + '"></span>' + esc(color.name) + " · " + esc(D.STYLES[p.style] || p.style) + "</div>" +
        '<h3 class="dc-name">' + esc(p.name) + "</h3>" +
        '<p class="dc-desc">' + esc(p.short) + "</p>" +
        '<div class="dc-price">' +
          (sale ? '<span class="price-old">' + YD.formatPrice(p.oldPrice) + "</span>" : "") +
          "<strong>" + YD.formatPrice(p.price) + "</strong>" +
        "</div>" +
        '<div class="dc-actions">' +
          '<a class="btn btn--light" href="' + url + '">Batafsil</a>' +
          '<button class="btn btn--gold add-btn--text" type="button" data-add="' + esc(p.id) + '">' + icon("bag") + "<span>Savatga</span></button>" +
          '<button class="dc-fav fav-btn" type="button" data-fav="' + esc(p.id) + '" aria-label="Sevimlilarga qo‘shish">' + icon("heart") + "</button>" +
        "</div>" +
      "</div>" +
      '<span class="dc-shade" aria-hidden="true"></span>' +
    "</article>";
  }

  function mount(root, products, opts) {
    if (!root || !products || !products.length) return null;
    opts = opts || {};
    var n = products.length;
    var interval = opts.interval || 5500;
    var icon = YD.icon;

    root.classList.add("dc");
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "karusel");
    root.setAttribute("aria-label", opts.label || "MDF eshiklar kolleksiyasi");
    root.style.setProperty("--dc-interval", interval + "ms");

    root.innerHTML =
      '<div class="dc-viewport"><div class="dc-stage" tabindex="0" aria-label="Kartalarni almashtirish uchun chap/o‘ng strelkalardan foydalaning">' +
        products.map(function (p, i) { return cardHTML(p, i, n); }).join("") +
      "</div></div>" +
      '<div class="dc-controls">' +
        '<button class="dc-nav" type="button" data-dc="prev" aria-label="Oldingi eshik">' + icon("arrow-left") + "</button>" +
        '<div class="dc-dots" role="group" aria-label="Slaydni tanlash">' +
          products.map(function (p, i) {
            return '<button class="dc-dot" type="button" data-dc-go="' + i + '" aria-label="' + (i + 1) + "-slayd: " + YD.esc(p.name) + '"><span class="dc-dot-fill"></span></button>';
          }).join("") +
        "</div>" +
        '<span class="dc-counter" aria-hidden="true"><b data-dc-current>01</b> / ' + String(n).padStart(2, "0") + "</span>" +
        '<button class="dc-nav dc-toggle" type="button" data-dc="toggle"></button>' +
        '<button class="dc-nav" type="button" data-dc="next" aria-label="Keyingi eshik">' + icon("arrow") + "</button>" +
      "</div>" +
      '<p class="sr-only" aria-live="polite" data-dc-live></p>';

    var stage = root.querySelector(".dc-stage");
    var cards = [].slice.call(root.querySelectorAll(".dc-card"));
    var dots = [].slice.call(root.querySelectorAll(".dc-dot"));
    var live = root.querySelector("[data-dc-live]");
    var counter = root.querySelector("[data-dc-current]");
    var toggleBtn = root.querySelector('[data-dc="toggle"]');

    var pos = 0;          // uzluksiz pozitsiya (cheksiz aylanish uchun butun son emas bo‘lishi mumkin)
    var active = 0;
    var metrics = {};
    var state = { hover: false, focus: false, drag: false, hold: false, stopped: reduceMotion, inView: true };
    var holdTimer = null;

    function readMetrics() {
      var cs = getComputedStyle(root);
      var w = cards[0].offsetWidth || 600;
      metrics = {
        step: w * (parseFloat(cs.getPropertyValue("--dc-spacing")) || 0.72),
        depth: parseFloat(cs.getPropertyValue("--dc-depth")) || 200,
        rotate: parseFloat(cs.getPropertyValue("--dc-rotate")) || 0,
        scale: parseFloat(cs.getPropertyValue("--dc-scale")) || 0.13
      };
    }

    // Har bir kartaning markazdan masofasiga (d) qarab 3D joylashuvi
    function layout() {
      cards.forEach(function (card, i) {
        var d = mod(i - pos, n);
        if (d > n / 2) d -= n;
        var ad = Math.abs(d);
        var clamped = Math.min(ad, 2.2);
        var x = d * metrics.step;
        var z = -clamped * metrics.depth;
        var rot = Math.max(-2, Math.min(2, d)) * -metrics.rotate;
        var scale = 1 - clamped * metrics.scale;
        var opacity = ad <= 1 ? 1 : Math.max(0, 1 - (ad - 1) * 0.85);
        if (ad > 2.4) opacity = 0;

        card.style.transform = "translate3d(" + x.toFixed(1) + "px,0," + z.toFixed(1) + "px) rotateY(" + rot.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(100 - Math.round(ad * 10));
        card.style.visibility = opacity === 0 ? "hidden" : "visible";
        card.style.setProperty("--shade", (Math.min(ad, 1.6) * 0.42).toFixed(3));
      });
    }

    function setActive(idx, announce) {
      active = idx;
      cards.forEach(function (card, i) {
        var on = i === idx;
        card.classList.toggle("is-active", on);
        card.setAttribute("aria-hidden", on ? "false" : "true");
        // Yon kartalardagi tugmalar Tab bilan fokuslanmasin
        card.querySelectorAll("a, button").forEach(function (el) {
          if (el.classList.contains("dc-media")) return;
          if (on) el.removeAttribute("tabindex"); else el.setAttribute("tabindex", "-1");
        });
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === idx);
        dot.setAttribute("aria-current", i === idx ? "true" : "false");
      });
      counter.textContent = String(idx + 1).padStart(2, "0");
      if (announce) live.textContent = products[idx].name + ", " + (idx + 1) + " / " + n;
    }

    function goTo(target, announce) {
      pos = target;
      layout();
      setActive(mod(Math.round(pos), n), announce);
    }
    function step(dir, announce) { goTo(Math.round(pos) + dir, announce); }

    // Eng qisqa yo‘l bilan aniq indeksga o‘tish
    function goToIndex(idx, announce) {
      var diff = mod(idx - mod(Math.round(pos), n), n);
      if (diff > n / 2) diff -= n;
      goTo(Math.round(pos) + diff, announce);
    }

    /* ---------- Avtomatik aylanish ---------- */
    function syncPause() {
      var paused = state.hover || state.focus || state.drag || state.hold || state.stopped || !state.inView || state.loading;
      root.classList.toggle("is-paused", paused);
      root.classList.toggle("is-stopped", state.stopped);
      toggleBtn.innerHTML = icon(state.stopped ? "play" : "pause");
      toggleBtn.setAttribute("aria-label", state.stopped ? "Avtomatik aylanishni yoqish" : "Avtomatik aylanishni to‘xtatish");
    }
    // Foydalanuvchi o‘zi boshqarganda bir muddat to‘xtab turadi
    function userHold() {
      state.hold = true;
      syncPause();
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { state.hold = false; syncPause(); }, 7000);
    }
    // Faol nuqtaning progress animatsiyasi tugashi = keyingi slayd (pauza bilan avtomatik sinxron)
    root.addEventListener("animationend", function (e) {
      if (e.animationName === "dc-progress" && !root.classList.contains("is-paused")) step(1, false);
    });

    /* ---------- Tugmalar ---------- */
    root.querySelector(".dc-controls").addEventListener("click", function (e) {
      var b = e.target.closest("[data-dc], [data-dc-go]");
      if (!b) return;
      var act = b.getAttribute("data-dc");
      if (act === "toggle") { state.stopped = !state.stopped; state.hold = false; syncPause(); return; }
      if (act === "prev") step(-1, true);
      else if (act === "next") step(1, true);
      else goToIndex(Number(b.getAttribute("data-dc-go")), true);
      userHold();
    });

    /* ---------- Klaviatura ---------- */
    root.addEventListener("keydown", function (e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      var handled = true;
      if (e.key === "ArrowLeft") step(-1, true);
      else if (e.key === "ArrowRight") step(1, true);
      else if (e.key === "Home") goToIndex(0, true);
      else if (e.key === "End") goToIndex(n - 1, true);
      else handled = false;
      if (handled) { e.preventDefault(); userHold(); }
    });

    /* ---------- Drag (sichqoncha) va swipe (touch) ---------- */
    var drag = null;
    var suppressClick = false;

    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, startPos: pos, moved: false, id: e.pointerId, t: performance.now() };
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) > 10) drag = null; // vertikal scroll — carouselga tegmaymiz
          return;
        }
        drag.moved = true;
        state.drag = true;
        syncPause();
        stage.classList.add("is-dragging");
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* e’tiborsiz */ }
      }
      pos = drag.startPos - dx / metrics.step;
      layout();
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.moved) {
        var dx = (e ? e.clientX : drag.x) - drag.x;
        var dt = Math.max(1, performance.now() - drag.t);
        var target = Math.round(pos);
        // Qisqa, tez swipe ham bitta kartaga o‘tkazsin
        if (target === drag.startPos && (Math.abs(dx) > metrics.step * 0.12 || Math.abs(dx) / dt > 0.5)) {
          target = drag.startPos + (dx < 0 ? 1 : -1);
        }
        stage.classList.remove("is-dragging");
        goTo(target, true);
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
        state.drag = false;
        userHold();
      }
      drag = null;
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", function (e) {
      if (drag && drag.moved) { stage.classList.remove("is-dragging"); goTo(Math.round(pos)); state.drag = false; syncPause(); }
      drag = null;
    });
    stage.addEventListener("dragstart", function (e) { e.preventDefault(); });

    // Capture bosqichi: drag’dan keyingi click va yon karta bosilishini global handlerlardan oldin ushlaymiz
    stage.addEventListener("click", function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
      var card = e.target.closest(".dc-card");
      if (card && !card.classList.contains("is-active")) {
        e.preventDefault();
        e.stopPropagation();
        goToIndex(Number(card.getAttribute("data-index")), true);
        userHold();
      }
    }, true);

    /* ---------- Pauza holatlari ---------- */
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { state.hover = true; syncPause(); } });
    root.addEventListener("pointerleave", function () { state.hover = false; syncPause(); });
    root.addEventListener("focusin", function () { state.focus = true; syncPause(); });
    root.addEventListener("focusout", function (e) {
      if (!root.contains(e.relatedTarget)) { state.focus = false; syncPause(); }
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        state.inView = entries[0].isIntersecting;
        syncPause();
      }, { threshold: 0.25 }).observe(root);
    }

    var resizeRaf;
    window.addEventListener("resize", function () {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(function () { readMetrics(); layout(); });
    });

    // Loading ekran ortida avtomatik aylanish boshlanmasin
    if (window.YDLoader && !window.YDLoader.done) {
      state.loading = true;
      window.YDLoader.onReady(function () { state.loading = false; syncPause(); });
    }
    if (reduceMotion) root.classList.add("is-reduced");
    readMetrics();
    root.classList.add("no-anim");     // birinchi joylashuv animatsiyasiz
    goTo(0, false);
    syncPause();
    requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("no-anim"); }); });
    document.dispatchEvent(new CustomEvent("yd:change")); // savat/sevimli holatini kartalarga qo‘llash

    return { next: function () { step(1, true); }, prev: function () { step(-1, true); }, goTo: goToIndex, get index() { return active; } };
  }

  window.YDCarousel = { mount: mount };
})();
