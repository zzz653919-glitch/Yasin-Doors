/* Sahifa chizilishidan oldin temani qo‘llaydi (oq "miltillash"ning oldini oladi) */
(function () {
  var theme = "light";
  try {
    theme = localStorage.getItem("yd_theme") ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) { /* localStorage mavjud emas */ }
  document.documentElement.setAttribute("data-theme", theme);
})();

/* Asosiy uslub: Artistic (assets/css/styles.css, [data-style="13"]) */
document.documentElement.setAttribute("data-style", "13");
