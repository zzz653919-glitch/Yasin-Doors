/* Temani sahifa chizilishidan oldin qo'llash (CSP inline skriptga ruxsat bermaydi, shuning uchun alohida fayl) */
(function () {
  var t = "dark";
  try { t = localStorage.getItem("yd_admin_theme") || "dark"; } catch (e) { /* localStorage yo'q */ }
  document.documentElement.setAttribute("data-theme", t);
})();
