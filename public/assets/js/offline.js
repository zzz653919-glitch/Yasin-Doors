/* Internet yo‘q sahifasi: qayta urinish, aloqa tiklanganda avtomatik qaytish.
   Qurilma aslida onlayn bo‘lsa (service worker adashgan bo‘lsa) — sw va kesh bir marta tozalanib, sahifa qayta ochiladi. */
(function () {
  "use strict";
  var KEY = "yd_sw_heal";
  var back = function () { location.reload(); };

  function heal() {
    var tried = false;
    try { tried = sessionStorage.getItem(KEY) === "1"; } catch (e) { /* e’tiborsiz */ }
    if (tried || navigator.onLine === false) return;
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* e’tiborsiz */ }
    // Tarmoq haqiqatan ishlayaptimi? Ishlasa — service worker adashgan: tozalab qayta ochamiz.
    fetch("/api/health?ping=" + Date.now(), { cache: "no-store" }).then(function (r) { if (r.ok) clean(); }).catch(function () { /* haqiqatan offline */ });
  }
  function clean() {
    var jobs = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    }
    if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
    Promise.all(jobs).catch(function () { /* e’tiborsiz */ }).then(back);
  }

  document.getElementById("retry").addEventListener("click", function () {
    if (navigator.onLine) { try { sessionStorage.removeItem(KEY); } catch (e) { /* e’tiborsiz */ } this.textContent = "Tekshirilmoqda…"; heal(); var b = this; setTimeout(function () { b.textContent = "Hali ulanish yo‘q…"; }, 3500); }
    else this.textContent = "Hali ulanish yo‘q…";
  });
  window.addEventListener("online", back);
  heal();
})();
