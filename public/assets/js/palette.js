/* YasinDoors — rang sxemasi tajribasi: 20 ta palitra. Tanlov brauzerda saqlanadi; ?palette=N bilan ham yoqiladi.
   Ishga tushirish: theme-init.js tanlovni sahifa chizilishidan oldin qo‘llaydi; bu fayl faqat tanlagich panelini chizadi. */
(function () {
  "use strict";
  var P = [[1, "Qum va oltin", "light", "#f7f5f1", "#ffffff", "#b8935a"], [2, "Obsidian", "dark", "#0E0E10", "#18181B", "#D9BC85"], [3, "Tun o‘rmoni", "dark", "#0B1512", "#12211C", "#6FD0A0"], [4, "Okean", "light", "#EEF3F7", "#FFFFFF", "#2875BA"], [5, "Terrakota", "light", "#F5EBE4", "#FFF8F3", "#B04F29"], [6, "Zaytun", "light", "#EEF0E4", "#F9FAF2", "#667A22"], [7, "Burgundiya", "dark", "#160B0E", "#23131A", "#E58FA6"], [8, "Grafit va mis", "dark", "#121315", "#1C1E21", "#D98B5A"], [9, "Pushti qum", "light", "#F8ECEA", "#FFF6F4", "#B24459"], [10, "Lavanda", "light", "#F0EDF7", "#FAF8FF", "#7B5CC4"], [11, "Kosmos", "dark", "#0A1020", "#121B33", "#78AEFF"], [12, "Mis qora", "dark", "#0F0D0B", "#1A1612", "#CF8B52"], [13, "Muz", "light", "#EAF4F4", "#F8FFFF", "#0C7C7C"], [14, "Zumrad", "dark", "#07130F", "#0E211B", "#3FD09A"], [15, "Qahva", "light", "#EFE6DC", "#FAF4EC", "#936037"], [16, "Cho‘g‘", "dark", "#140A08", "#221310", "#FF7A4D"], [17, "Qor", "light", "#FFFFFF", "#FAFAFA", "#222222"], [18, "Binafsha tun", "dark", "#110A1B", "#1B1230", "#BC98FF"], [19, "Limon", "light", "#F8F5E1", "#FFFDF0", "#B89A00"], [20, "Tosh va dengiz", "light", "#E6EAEC", "#F5F7F8", "#3A7C80"]];
  var KEY = "yd_palette";
  var root = document.documentElement;

  function current() { return root.getAttribute("data-palette") ? Number(root.getAttribute("data-palette")) : 1; }
  function apply(n) {
    if (n === 1) root.removeAttribute("data-palette"); else root.setAttribute("data-palette", String(n));
    try { if (n === 1) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(n)); } catch (e) { /* saqlanmaydi */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", P[n - 1][3]);
    sync();
  }

  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "pal-fab"; fab.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-controls", "palPanel");
  fab.innerHTML = '<i aria-hidden="true"></i><span>Ranglar</span>';
  var panel = document.createElement("div");
  panel.className = "pal-panel"; panel.id = "palPanel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Rang sxemalari");
  panel.innerHTML = '<div class="pal-head"><strong>Rang sxemasini sinab ko‘ring (20 ta)</strong><button type="button" data-pal-close>Yopish</button></div><div class="pal-grid">' +
    P.map(function (p) {
      return '<button type="button" class="pal-item" data-pal="' + p[0] + '" aria-pressed="false"><span class="pal-sw" style="background:' + p[3] + '"><b style="background:' + p[4] + '"></b><i style="background:' + p[5] + '"></i></span><span>' + p[0] + '. ' + p[1] + '<small>' + (p[2] === "dark" ? "qorong‘i" : "yorug‘") + (p[0] === 1 ? " · asosiy" : "") + '</small></span></button>';
    }).join("") + "</div>";

  function sync() {
    var c = current();
    panel.querySelectorAll("[data-pal]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-pal")) === c)); });
    fab.querySelector("span").textContent = "Ranglar · " + c + "/20";
  }
  function toggle(open) {
    panel.hidden = !open; fab.setAttribute("aria-expanded", String(open));
  }
  fab.addEventListener("click", function () { toggle(panel.hidden); });
  panel.addEventListener("click", function (e) {
    if (e.target.closest("[data-pal-close]")) { toggle(false); fab.focus(); return; }
    var b = e.target.closest("[data-pal]");
    if (b) apply(Number(b.getAttribute("data-pal")));
  });
  document.addEventListener("click", function (e) { if (!panel.hidden && !panel.contains(e.target) && !fab.contains(e.target)) toggle(false); });

  function mount() { document.body.appendChild(panel); document.body.appendChild(fab); sync(); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
