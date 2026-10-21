/* Sahifa chizilishidan oldin temani qo‘llaydi (oq "miltillash"ning oldini oladi) */
(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("yd_theme") ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) { /* localStorage mavjud emas */ }
  document.documentElement.setAttribute("data-theme", theme);
})();

/* Uslub tajribasi (assets/css/styles.css): ?style=N yoki avval tanlangan uslub */
(function () {
  try {
    var q = /[?&]style=(\d+)/.exec(location.search);
    var n = q ? Number(q[1]) : Number(localStorage.getItem("yd_style"));
    if (q) { if (n >= 1 && n <= 20) localStorage.setItem("yd_style", String(n)); else localStorage.removeItem("yd_style"); }
    if (n >= 1 && n <= 20) document.documentElement.setAttribute("data-style", String(n));
  } catch (e) { /* e‘tiborsiz */ }
})();
