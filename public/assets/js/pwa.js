/* YasinDoors — ilova (PWA) qatlami: service worker, o‘rnatish tugmasi, internet holati xabari.
   Hisob/buyurtma so‘rovlari service worker orqali o‘tmaydi (sw.js dagi NEVER). */
(function () {
  "use strict";
  var root = document.documentElement;
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if (standalone) root.classList.add("is-standalone");
  var isAdmin = /^\/(admin)(\/|$)/i.test(location.pathname);
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var deferred = null;

  /* ---------- Service worker ---------- */
  if ("serviceWorker" in navigator && !isAdmin && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", function () {
            if (w.state === "installed" && navigator.serviceWorker.controller) {
              if (window.YD && YD.toast) YD.toast("Yangi versiya tayyor. Sahifani yangilang.", { href: location.href, label: " Yangilash" });
            }
          });
        });
      }).catch(function () { /* SW ishlamasa sayt odatdagidek ishlayveradi */ });
    });
  }

  /* ---------- Internet holati ---------- */
  var banner = null, hideTimer = 0;
  function showNet(text, cls) {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "net-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      document.body.appendChild(banner);
    }
    clearTimeout(hideTimer);
    banner.className = "net-banner is-on " + cls;
    banner.textContent = text;
  }
  function hideNet(delay) { hideTimer = setTimeout(function () { if (banner) banner.classList.remove("is-on"); }, delay); }
  function offline() { showNet("Internet aloqasi yo‘q. Saqlangan ma’lumotlar ko‘rsatilmoqda; buyurtma yuborish uchun aloqa kerak.", "is-off"); }
  function online() { showNet("Aloqa tiklandi", "is-on-line"); hideNet(2200); }
  window.addEventListener("offline", offline);
  window.addEventListener("online", online);
  document.addEventListener("DOMContentLoaded", function () { if (navigator.onLine === false) offline(); });

  /* ---------- O‘rnatish ---------- */
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; sync(); });
  window.addEventListener("appinstalled", function () { deferred = null; root.classList.add("is-standalone"); sync(); if (window.YD && YD.toast) YD.toast("YasinDoors ilovasi o‘rnatildi"); });

  function canShow() { return !standalone && !isAdmin && (!!deferred || isIOS); }
  function sync() {
    document.querySelectorAll("[data-install], [data-install-card]").forEach(function (b) { b.hidden = !canShow(); });
  }
  function iosSheet() {
    var old = document.getElementById("iosInstall");
    if (old) { old.remove(); return; }
    var d = document.createElement("div");
    d.id = "iosInstall"; d.className = "ios-install"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Ilovani o‘rnatish");
    d.innerHTML = '<div class="ios-card"><strong>Ilovani o‘rnatish</strong>' +
      "<ol><li>Safari’da pastdagi <b>Ulashish</b> tugmasini bosing.</li><li><b>«Bosh ekranga qo‘shish»</b> ni tanlang.</li><li><b>«Qo‘shish»</b> ni bosing.</li></ol>" +
      '<button type="button" class="btn btn--gold btn--block">Tushunarli</button></div>';
    d.addEventListener("click", function (e) { if (e.target === d || e.target.tagName === "BUTTON") d.remove(); });
    document.body.appendChild(d);
  }
  function install() {
    if (deferred) {
      var p = deferred; deferred = null;
      p.prompt();
      (p.userChoice || Promise.resolve()).then(sync);
    } else if (isIOS) iosSheet();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-install]");
    if (b) { e.preventDefault(); install(); }
  });
  document.addEventListener("DOMContentLoaded", sync);
  window.YDPwa = { install: install, canInstall: canShow, sync: sync, standalone: standalone };
})();
