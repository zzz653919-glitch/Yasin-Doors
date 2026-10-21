/* YasinDoors — kinematik effektlar: scroll chizig‘i, kursor, sichqoncha parallaksi, eshik og‘ishi (tilt), magnit tugmalar.
   Barchasi ixtiyoriy bezak: prefers-reduced-motion va sensorli ekranlarda o‘chiriladi. Funksiyalarga tegmaydi. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduced = false, fine = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch (e) { /* e’tiborsiz */ }

  /* ---------- Scroll progress (yuqoridagi oltin chiziq) ---------- */
  var bar = document.createElement("div");
  bar.className = "yd-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  var sraf = 0;
  function onScroll() {
    if (sraf) return;
    sraf = requestAnimationFrame(function () {
      sraf = 0;
      var y = window.pageYOffset || root.scrollTop || 0;
      var dh = Math.max(1, root.scrollHeight - window.innerHeight);
      root.style.setProperty("--prog", String(Math.min(1, y / dh).toFixed(4)));
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  if (reduced || !fine) return;

  /* ---------- Kursor + parallaks + tilt + magnit ---------- */
  var cur = document.createElement("div");
  cur.className = "yd-cursor";
  cur.setAttribute("aria-hidden", "true");
  cur.innerHTML = "<span></span>";
  document.body.appendChild(cur);

  var mx = 0, my = 0, mraf = 0;
  function frame() {
    mraf = 0;
    root.style.setProperty("--mx", ((mx / window.innerWidth - 0.5) * 2).toFixed(3));
    root.style.setProperty("--my", ((my / window.innerHeight - 0.5) * 2).toFixed(3));
    cur.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
    var t = document.elementFromPoint(mx, my);
    cur.classList.toggle("is-hot", !!(t && t.closest && t.closest("a,button,input,textarea,select,[role=button]")));

    document.querySelectorAll(".tilt").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      var nx = (mx - (r.left + r.width / 2)) / Math.max(r.width, 1);
      var ny = (my - (r.top + r.height / 2)) / Math.max(r.height, 1);
      el.style.transform = Math.abs(nx) < 1.4 && Math.abs(ny) < 0.8
        ? "perspective(900px) rotateY(" + (nx * 9).toFixed(2) + "deg) rotateX(" + (-ny * 4).toFixed(2) + "deg)" : "";
    });
    document.querySelectorAll(".mag").forEach(function (el) {
      var r = el.getBoundingClientRect();
      var dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.8) el.style.transform = "translate(" + (dx * 0.2).toFixed(1) + "px," + (dy * 0.3).toFixed(1) + "px)";
      else if (el.style.transform) el.style.transform = "";
    });
  }
  window.addEventListener("mousemove", function (e) {
    mx = e.clientX; my = e.clientY;
    cur.classList.add("is-on");
    if (!mraf) mraf = requestAnimationFrame(frame);
  }, { passive: true });
  document.addEventListener("mouseleave", function () { cur.classList.remove("is-on"); });
})();
