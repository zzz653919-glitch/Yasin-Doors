/* Sahifa chizilishidan oldin temani qo‘llaydi (oq "miltillash"ning oldini oladi) */
(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("yd_theme") ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) { /* localStorage mavjud emas */ }
  document.documentElement.setAttribute("data-theme", theme);
})();

/* Uslub: ?style=N yoki tanlangan uslub; hech narsa tanlanmagan bo‘lsa — asosiy Artistic (13); 0 — eski ko‘rinish */
(function () {
  try {
    var q = /[?&]style=(\d+)/.exec(location.search);
    var n = q ? Number(q[1]) : Number(localStorage.getItem("yd_style") === null ? 13 : localStorage.getItem("yd_style"));
    if (q) localStorage.setItem("yd_style", String(n));
    if (n >= 1 && n <= 20) document.documentElement.setAttribute("data-style", String(n));
  } catch (e) { document.documentElement.setAttribute("data-style", "13"); }
})();
