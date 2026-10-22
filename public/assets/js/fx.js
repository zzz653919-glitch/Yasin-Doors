/* YasinDoors — videodagi effektlar (kutubxonasiz): halqa kursor va kollektsiya "ruh" so‘zi.
   Mavjud scroll.js / app.js ga tegmaydi. Faqat rAF + transform; reduced-motion va sensorli qurilmalarda o‘chiq. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* 1. Halqa kursor */
  if (fine && !reduce) {
    var ring = document.createElement("div");
    ring.className = "fx-cursor"; ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    var tx = -100, ty = -100, x = -100, y = -100, raf = 0;
    var loop = function () {
      x += (tx - x) * 0.22; y += (ty - y) * 0.22;
      ring.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      raf = (Math.abs(tx - x) + Math.abs(ty - y) > 0.3) ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener("pointermove", function (e) {
      tx = e.clientX; ty = e.clientY; ring.classList.add("is-on");
      if (!raf) raf = requestAnimationFrame(loop);
      ring.classList.toggle("is-hot", !!(e.target.closest && e.target.closest("a,button,[role=button],.dc-card,.product-card,.cat-card,input,select,label")));
    }, { passive: true });
    document.addEventListener("pointerdown", function () { ring.classList.add("is-down"); });
    document.addEventListener("pointerup", function () { ring.classList.remove("is-down"); });
    document.documentElement.addEventListener("mouseleave", function () { ring.classList.remove("is-on"); });
  }

  /* 2. Kontur "ruh" so‘z: kategoriyalar bo‘limida; kartaga yaqinlashganda so‘z almashadi, scrollda siljiydi */
  var grid = document.querySelector(".cat-grid");
  var sec = grid && grid.closest("section");
  if (!sec) return;
  sec.classList.add("fx-ghost-sec");
  var ghost = document.createElement("p");
  ghost.className = "fx-ghost"; ghost.setAttribute("aria-hidden", "true"); ghost.textContent = "Uslub";
  sec.insertBefore(ghost, sec.firstChild);

  var cards = grid.querySelectorAll(".cat-card");
  function setWord(w) {
    if (ghost.textContent === w) return;
    ghost.classList.add("is-swap");
    setTimeout(function () { ghost.textContent = w; ghost.classList.remove("is-swap"); if (window.__fxUpdate) window.__fxUpdate(); }, 180);
  }
  cards.forEach(function (c) {
    var w = (c.querySelector("h3") || {}).textContent || "Uslub";
    ["pointerenter", "focus"].forEach(function (ev) { c.addEventListener(ev, function () { setWord(w); }); });
  });
  grid.addEventListener("pointerleave", function () { setWord("Uslub"); });

  if (reduce) return;
  var visible = false, ticking = false;
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) update(); }, { rootMargin: "100px" }).observe(sec);
  function update() {
    ticking = false;
    if (!visible) return;
    var r = sec.getBoundingClientRect(), vh = window.innerHeight;
    var p = (vh - r.top) / (vh + r.height);             // 0..1 bo‘lim ekran bo‘ylab o‘tganda
    var room = Math.max(0, ghost.offsetWidth - sec.clientWidth);
    ghost.style.setProperty("--gx", (-room * p).toFixed(1) + "px");
  }
  window.__fxUpdate = update;
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("resize", update);
})();
