/* Sahifa chizilishidan oldin temani qo‘llaydi (oq "miltillash"ning oldini oladi) */
(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("yd_theme") ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) { /* localStorage mavjud emas */ }
  document.documentElement.setAttribute("data-theme", theme);
})();

/* Rang sxemasi tajribasi (assets/css/palettes.css): ?palette=N yoki avval tanlangan palitra */
(function () {
  try {
    var q = /[?&]palette=(\d+)/.exec(location.search);
    var n = q ? Number(q[1]) : Number(localStorage.getItem("yd_palette"));
    if (q) { if (n >= 2 && n <= 20) localStorage.setItem("yd_palette", String(n)); else localStorage.removeItem("yd_palette"); }
    if (n >= 2 && n <= 20) document.documentElement.setAttribute("data-palette", String(n));
  } catch (e) { /* e‘tiborsiz */ }
})();
