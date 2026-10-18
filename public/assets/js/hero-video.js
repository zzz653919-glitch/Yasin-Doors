/* Bosh sahifa video-banneri.
   - Avval poster-rasm ko‘rinadi (LCP tez bo‘lsin); video sahifa to‘liq yuklangach olinadi.
   - Keng ekranda 16:9, tik (portret) telefon ekranida 9:16 versiya tanlanadi.
   - Video ovozsiz, avtomatik, takroriy; ekrandan chiqsa yoki tab yashirilsa — pauza.
   - Fayl yo‘q / xato / sekin internet / "kamroq harakat" sozlamasi — poster-rasm banner bo‘lib qoladi. */
(function () {
  "use strict";

  var media = document.getElementById("heroMedia");
  if (!media) return;
  var banner = media.closest(".hero-banner");
  var toggle = document.getElementById("heroToggle");

  var SRC_WIDE = media.getAttribute("data-video-wide");
  var SRC_TALL = media.getAttribute("data-video-tall");
  var mqTall = window.matchMedia("(max-width: 768px) and (orientation: portrait)");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || {};
  var slowNet = conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || "");

  var video = null;
  var userPaused = false;   // foydalanuvchi o‘zi to‘xtatgan bo‘lsa, avtomatik qayta yoqmaymiz
  var inView = true;

  function setState(state) {
    banner.classList.remove("is-loading", "is-playing", "is-static");
    banner.classList.add(state);
  }

  // Video ishlamaydi — oddiy rasmli banner qoladi
  function fallback() {
    if (video) {
      video.removeAttribute("src");
      video.load();
      video.remove();
      video = null;
    }
    if (toggle) toggle.hidden = true;
    setState("is-static");
  }

  function currentSrc() {
    return (mqTall.matches && SRC_TALL) ? SRC_TALL : (SRC_WIDE || SRC_TALL);
  }

  function tryPlay() {
    if (!video || userPaused || !inView || document.hidden) return;
    var p = video.play();
    // Avtomatik ijro bloklansa (masalan, quvvat tejash rejimi) — poster qoladi, xato chiqmaydi
    if (p && p.catch) p.catch(function () { if (!video || video.paused) setState("is-static"); });
  }

  function updateToggle() {
    if (!toggle || !video) return;
    var paused = video.paused;
    toggle.setAttribute("aria-pressed", paused ? "true" : "false");
    toggle.setAttribute("aria-label", paused ? "Videoni davom ettirish" : "Videoni to‘xtatish");
    toggle.classList.toggle("is-paused", paused);
  }

  function createVideo() {
    var src = currentSrc();
    if (!src) return fallback();

    video = document.createElement("video");
    video.className = "hero-video";
    // iOS/Safari avtomatik ijrosi uchun muted va playsinline atribut sifatida ham bo‘lishi shart
    video.muted = true; video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("tabindex", "-1");
    video.disablePictureInPicture = true;
    video.loop = true;
    video.autoplay = true;
    video.preload = "auto";

    video.addEventListener("playing", function () {
      setState("is-playing");
      if (toggle) toggle.hidden = false;
      updateToggle();
    });
    video.addEventListener("pause", updateToggle);
    video.addEventListener("play", updateToggle);
    video.addEventListener("error", fallback);

    video.src = src;
    media.insertBefore(video, media.querySelector(".hero-loading"));   // poster ustida, loader ostida
    setState("is-loading");
    tryPlay();
  }

  function start() {
    if (reduceMotion || slowNet || !("IntersectionObserver" in window)) return setState("is-static");
    createVideo();

    // Ekrandan chiqqanda pauza — protsessor va batareyani tejaydi
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (!video) return;
      if (inView) tryPlay(); else video.pause();
    }, { threshold: 0.15 }).observe(banner);

    document.addEventListener("visibilitychange", function () {
      if (!video) return;
      if (document.hidden) video.pause(); else tryPlay();
    });

    // Telefon burilsa yoki oyna o‘lchami o‘zgarsa — mos formatdagi videoga o‘tamiz
    var onChange = function () {
      if (!video) return;
      var src = currentSrc();
      if (video.getAttribute("src") === src) return;
      setState("is-loading");
      video.src = src;
      tryPlay();
    };
    if (mqTall.addEventListener) mqTall.addEventListener("change", onChange);
    else if (mqTall.addListener) mqTall.addListener(onChange);
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      if (!video) return;
      if (video.paused) { userPaused = false; tryPlay(); }
      else { userPaused = true; video.pause(); }
      updateToggle();
    });
  }

  setState("is-loading");
  // Video asosiy kontent (shrift, CSS, poster) yuklanib bo‘lgach olinadi
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
