/* YasinDoors — uslub tajribasi: 20 ta uslub qobig‘i. Tanlov brauzerda saqlanadi; ?style=N bilan ham yoqiladi.
   theme-init.js tanlovni sahifa chizilishidan oldin qo‘llaydi; bu fayl faqat tanlagich panelini chizadi. */
(function () {
  "use strict";
  var P = [[1, "Minimalist", "Toza va oddiy uslub", "light", "#FAF8F4", "#FFFFFF", "#262626"], [2, "Dark / Premium", "Qorong‘i va hashamatli", "dark", "#0C0C0D", "#161617", "#D9BC85"], [3, "Futuristik", "Kelajak uslubi", "dark", "#060B16", "#0C1730", "#35C8FF"], [4, "Nature / Eco", "Tabiat va ekologiya", "light", "#F3F1E6", "#FBFAF2", "#2F6B3A"], [5, "Classic", "Klassik uslub", "light", "#F4EEE3", "#FBF7EE", "#8A6A3A"], [6, "Modern / Bold", "Zamonaviy va jasur", "light", "#FFFFFF", "#FAFAFA", "#0B0B0B"], [7, "Luxury", "Hashamat uslubi", "dark", "#0A0907", "#15110C", "#C9A45C"], [8, "E-commerce Style", "Internet-do‘kon uslubi", "light", "#F5F6F8", "#FFFFFF", "#2563EB"], [9, "3D Interactive", "3D interaktiv", "dark", "#070B14", "#101A2E", "#E6B86A"], [10, "Scroll Story", "Scroll bilan hikoya", "dark", "#0B0A09", "#16130F", "#C18A55"], [11, "Clean & Simple", "Toza va qulay", "light", "#FBFAF7", "#FFFFFF", "#1F1F1F"], [12, "Dark Modern", "Qorong‘i va zamonaviy", "dark", "#0D0D0E", "#161618", "#F4F2EE"], [13, "Artistic", "Badiiy uslub", "dark", "#111010", "#1B1818", "#D8B56A"], [14, "Light & Airy", "Yorug‘ va yengil", "light", "#F2FAFA", "#FFFFFF", "#0F7F88"], [15, "High-Tech", "Texnologik uslub", "dark", "#050A14", "#0B1426", "#1F6BFF"], [16, "An’anaviy iliq", "Klassika, hech qachon eskirmaydi", "light", "#F2E8DC", "#FAF3E8", "#7A4B27"], [17, "Geometric", "Geometrik uslub", "dark", "#0A0A0A", "#151515", "#F0A93B"], [18, "Soft Pastel", "Yumshoq ranglar", "light", "#FDEFEA", "#FFF8F5", "#C24B60"], [19, "Glass Modern", "Shisha uslubi", "dark", "#0A0F1A", "#131C2E", "#7DD3FC"], [20, "Dark Gradient", "Qorong‘i gradient", "dark", "#1A0F2E", "#2A1640", "#FF8A3D"]];
  var KEY = "yd_style";
  var KEEP = [9, 4, 13, 17, 20]; /* tanlangan uslublar */
  var root = document.documentElement;
  var BASE = [247, 245, 241];

  function current() { return root.getAttribute("data-style") ? Number(root.getAttribute("data-style")) : 0; }
  function apply(n) {
    if (!n) root.removeAttribute("data-style"); else root.setAttribute("data-style", String(n));
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* saqlanmaydi */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && n) meta.setAttribute("content", P[n - 1][4]);
    sync();
  }

  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "pal-fab"; fab.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-controls", "palPanel");
  fab.innerHTML = '<i aria-hidden="true"></i><span>Uslublar</span>';
  var panel = document.createElement("div");
  panel.className = "pal-panel"; panel.id = "palPanel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Sayt uslublari");
  panel.innerHTML = '<div class="pal-head"><strong>Sayt uslubini sinab ko‘ring (5 ta)</strong><button type="button" data-pal="0">Eski ko‘rinish</button></div><div class="pal-grid">' +
    P.filter(function (p) { return KEEP.indexOf(p[0]) > -1; }).map(function (p) {
      return '<button type="button" class="pal-item" data-pal="' + p[0] + '" aria-pressed="false"><span class="pal-sw" style="background:' + p[4] + '"><b style="background:' + p[5] + '"></b><i style="background:' + p[6] + '"></i></span><span>' + p[0] + '. ' + p[1] + '<small>' + p[2] + '</small></span></button>';
    }).join("") + '</div><p style="margin:12px 2px 0;font-size:12px;color:var(--muted)">Panelni yopish: tashqariga bosing.</p>';

  function sync() {
    var c = current();
    panel.querySelectorAll("[data-pal]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-pal")) === c)); });
    fab.querySelector("span").textContent = c ? "Uslub · " + c : "Uslublar";
  }
  function toggle(open) { panel.hidden = !open; fab.setAttribute("aria-expanded", String(open)); }
  fab.addEventListener("click", function () { toggle(panel.hidden); });
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pal]");
    if (b) apply(Number(b.getAttribute("data-pal")));
  });
  document.addEventListener("click", function (e) { if (!panel.hidden && !panel.contains(e.target) && !fab.contains(e.target)) toggle(false); });

  function mount() { document.body.appendChild(panel); document.body.appendChild(fab); sync(); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
