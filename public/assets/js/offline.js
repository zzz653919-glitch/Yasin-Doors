/* Internet yo‘q sahifasi: qayta urinish va aloqa tiklanganda avtomatik qaytish */
(function () {
  "use strict";
  var back = function () { location.reload(); };
  document.getElementById("retry").addEventListener("click", function () {
    if (navigator.onLine) back(); else this.textContent = "Hali ulanish yo‘q…";
  });
  window.addEventListener("online", back);
})();
