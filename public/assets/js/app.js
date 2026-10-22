/* =========================================================
   YasinDoors — umumiy yadro
   (ikonkalar, navbar/footer, tema, savat, sevimlilar, toast)
   ========================================================= */
(function () {
  "use strict";

  var DATA = window.YD_DATA || { PRODUCTS: [], COLORS: {}, STYLES: {} };
  var CONFIG = window.YD_CONFIG || {};

  /* ---------- Admin paneldagi ma’lumotlar bilan sinxronlash ----------
     Sayt avval statik katalog (products.js) bilan ishlaydi. /api/catalog bazadan faol mahsulotlar
     va sozlamalarni qaytarsa — ular statik ro‘yxat o‘rnini oladi. Baza bo‘sh yoki ishlamasa,
     statik katalog saqlanib qoladi (sayt hech qachon bo‘sh qolmaydi).
     Oxirgi javob localStorage’da keshlanadi: savat/sevimlilar sahifa ochilishi bilan to‘g‘ri tanilsin. */
  var STATIC_PRODUCTS = DATA.PRODUCTS.slice();
  var SITE = {};
  var CATALOG_SOURCE = "static";
  var CATALOG_CACHE = "yd_catalog_v1";
  var domReady = false, catalogDone = false, siteApplied = false, readyCbs = [];

  function normalizeProduct(p) {
    p.badges = p.badges || [];
    p.sizes = p.sizes && p.sizes.length ? p.sizes : ["600 × 2000"];
    p.specs = p.specs || {};
    p.short = p.short || "";
    p.description = p.description || p.short;
    return p;
  }
  function setProducts(list) {
    DATA.PRODUCTS.length = 0;
    list.forEach(function (p) { DATA.PRODUCTS.push(normalizeProduct(p)); });
  }
  function applyCatalog(res) {
    if (!res) return;
    SITE = res.settings || {};
    if (SITE.phone) CONFIG.phone = SITE.phone;
    if (SITE.email) CONFIG.email = SITE.email;
    if (SITE.address) CONFIG.address = SITE.address;
    if (SITE.work_hours) CONFIG.workHours = SITE.work_hours;
    CATALOG_SOURCE = res.source === "db" ? "db" : "static";
    if (CATALOG_SOURCE === "db" && Array.isArray(res.products)) setProducts(res.products);
    else setProducts(STATIC_PRODUCTS);
  }
  try {
    var cached = JSON.parse(localStorage.getItem(CATALOG_CACHE) || "null");
    if (cached && cached.source === "db") applyCatalog(cached);
  } catch (e) { /* kesh yo‘q */ }

  function loadCatalog() {
    if (location.protocol === "file:" || !window.fetch) return Promise.resolve();
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    return fetch((CONFIG.apiBase || "").replace(/\/$/, "") + "/api/catalog", { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        clearTimeout(timer);
        if (!res || !res.ok) return;
        applyCatalog(res);
        try {
          if (res.source === "db") localStorage.setItem(CATALOG_CACHE, JSON.stringify(res));
          else localStorage.removeItem(CATALOG_CACHE);
        } catch (e) { /* e’tiborsiz */ }
      })
      .catch(function () { clearTimeout(timer); }); // tarmoq xatosi — mavjud (statik yoki keshdagi) katalog bilan davom etamiz
  }
  loadCatalog().then(function () { catalogDone = true; fireReady(); });

  /** DOM va katalog tayyor bo‘lgach chaqiriladi (sahifa skriptlari shuni ishlatadi) */
  function whenReady(cb) { readyCbs.push(cb); fireReady(); }
  function fireReady() {
    if (!domReady || !catalogDone) return;
    if (!siteApplied) {
      siteApplied = true;
      applySite();
      document.dispatchEvent(new CustomEvent("yd:change"));
    }
    readyCbs.splice(0).forEach(function (cb) {
      try { cb(); } catch (e) { setTimeout(function () { throw e; }); }
    });
    document.querySelectorAll("[aria-busy=true]").forEach(function (el) { el.removeAttribute("aria-busy"); });
  }
  // Admin sozlamalaridagi matnlar, logotip va aloqa ma’lumotlarini sahifaga qo‘llash
  function applySite() {
    var f = document.querySelector(".site-footer");
    if (f) f.outerHTML = footerHTML();
    if (SITE.logo) {
      document.querySelectorAll(".logo-mark").forEach(function (m) {
        m.innerHTML = '<img src="' + esc(SITE.logo) + '" alt="" width="36" height="36">';
      });
    }
    if (CATALOG_SOURCE === "db") document.querySelectorAll("[data-sample-note]").forEach(function (el) { el.remove(); });
    var lead = document.querySelector(".hero .lead");
    if (lead && SITE.hero_subtitle) lead.textContent = SITE.hero_subtitle;
    document.querySelectorAll("[data-site]").forEach(function (el) {
      var v = SITE[el.getAttribute("data-site")];
      if (v) el.textContent = v;
    });
  }
  var FALLBACK_IMG = "assets/img/fallback.svg";

  /* ---------- Yordamchilar ---------- */
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function formatPrice(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m";
  }
  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function getProduct(id) {
    for (var i = 0; i < DATA.PRODUCTS.length; i++) if (DATA.PRODUCTS[i].id === id) return DATA.PRODUCTS[i];
    return null;
  }
  function icon(name, cls) {
    return '<svg class="icon' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  /* ---------- Xavfsiz localStorage ---------- */
  var storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* xotira mavjud emas */ }
    }
  };

  /* ---------- Savat va sevimlilar ---------- */
  var CART_KEY = "yd_cart_v1";
  var FAV_KEY = "yd_favs_v1";

  function emit() {
    document.dispatchEvent(new CustomEvent("yd:change"));
  }
  function sanitizeCart(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (it) {
      var p = it && getProduct(it.id);
      return p && p.sizes.indexOf(it.size) !== -1 && it.qty > 0;
    }).map(function (it) {
      return { id: it.id, size: it.size, qty: Math.min(99, Math.max(1, parseInt(it.qty, 10) || 1)) };
    });
  }

  var store = {
    getCart: function () { return sanitizeCart(storage.get(CART_KEY, [])); },
    saveCart: function (cart) { storage.set(CART_KEY, sanitizeCart(cart)); emit(); },
    addToCart: function (id, size, qty) {
      var p = getProduct(id);
      if (!p) return;
      size = size || p.sizes[0];
      qty = Math.max(1, parseInt(qty, 10) || 1);
      var cart = store.getCart();
      var found = cart.filter(function (it) { return it.id === id && it.size === size; })[0];
      if (found) found.qty = Math.min(99, found.qty + qty);
      else cart.push({ id: id, size: size, qty: qty });
      store.saveCart(cart);
    },
    setQty: function (id, size, qty) {
      var cart = store.getCart();
      cart.forEach(function (it) {
        if (it.id === id && it.size === size) it.qty = Math.min(99, Math.max(1, parseInt(qty, 10) || 1));
      });
      store.saveCart(cart);
    },
    removeFromCart: function (id, size) {
      store.saveCart(store.getCart().filter(function (it) { return !(it.id === id && it.size === size); }));
    },
    clearCart: function () { store.saveCart([]); },
    inCart: function (id) { return store.getCart().some(function (it) { return it.id === id; }); },
    cartCount: function () { return store.getCart().reduce(function (s, it) { return s + it.qty; }, 0); },
    cartDetailed: function () {
      return store.getCart().map(function (it) {
        var p = getProduct(it.id);
        return { id: it.id, size: it.size, qty: it.qty, product: p, lineTotal: p.price * it.qty };
      });
    },
    cartTotal: function () {
      return store.cartDetailed().reduce(function (s, it) { return s + it.lineTotal; }, 0);
    },

    getFavs: function () {
      var list = storage.get(FAV_KEY, []);
      return Array.isArray(list) ? list.filter(function (id) { return getProduct(id); }) : [];
    },
    isFav: function (id) { return store.getFavs().indexOf(id) !== -1; },
    toggleFav: function (id) {
      var favs = store.getFavs();
      var i = favs.indexOf(id);
      if (i === -1) favs.push(id); else favs.splice(i, 1);
      storage.set(FAV_KEY, favs);
      emit();
      return i === -1;
    }
  };

  // Boshqa tabda o‘zgarsa ham yangilansin
  window.addEventListener("storage", function (e) {
    if (e.key === CART_KEY || e.key === FAV_KEY) emit();
  });

  /* ---------- Ikonkalar to‘plami (SVG sprite) ---------- */
  var SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' +
    '<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z"/></symbol>' +
    '<symbol id="i-bag" viewBox="0 0 24 24"><path d="M5 8h14l-1 12.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></symbol>' +
    '<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>' +
    '<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></symbol>' +
    '<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></symbol>' +
    '<symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>' +
    '<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></symbol>' +
    '<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>' +
    '<symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>' +
    '<symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/></symbol>' +
    '<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/></symbol>' +
    '<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></symbol>' +
    '<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>' +
    '<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>' +
    '<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>' +
    '<symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>' +
    '<symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></symbol>' +
    '<symbol id="i-truck" viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></symbol>' +
    '<symbol id="i-ruler" viewBox="0 0 24 24"><path d="M3 16.5L16.5 3 21 7.5 7.5 21z"/><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2"/></symbol>' +
    '<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></symbol>' +
    '<symbol id="i-tool" viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5"/><path d="M14.5 6.5L17 4l3 3-2.5 2.5"/></symbol>' +
    '<symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></symbol>' +
    '<symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></symbol>' +
    '<symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></symbol>' +
    '<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></symbol>' +
    '<symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></symbol>' +
    '<symbol id="i-pause" viewBox="0 0 24 24"><path d="M8.5 5.5v13M15.5 5.5v13"/></symbol>' +
    '<symbol id="i-chat"viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>' +
    '<symbol id="i-telegram" viewBox="0 0 24 24"><path d="M21 4L3 11l6 2 2 6 3-4 5 4 2-15z"/><path d="M9 13l8-6"/></symbol>' +
    '<symbol id="i-instagram" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.3 6.7h.01"/></symbol>' +
    '<symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5M10 20v-5.5h4V20"/></symbol>' +
    '<symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></symbol>' +
    '<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/></symbol>' +
    '<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>' +
    '<symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6C3.6 9.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></symbol>' +
    '<symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/></symbol>' +
    '<symbol id="i-box" viewBox="0 0 24 24"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/></symbol>' +
    '<symbol id="i-door" viewBox="0 0 18 22"><path d="M2 21V2.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V21" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M0.5 21h17" stroke="currentColor" stroke-width="1.8"/><circle cx="12.3" cy="11.5" r="1.3" fill="currentColor"/></symbol>' +
    '</svg>';

  /* ---------- Navbar va footer ---------- */
  var NAV = [
    { href: "/", label: "Bosh sahifa", page: "home" },
    { href: "/Products", label: "Katalog", page: "products" },
    { href: "/Configurator", label: "3D konstruktor", page: "configurator" },
    { href: "/About", label: "Biz haqimizda", page: "about" },
    { href: "/Contact", label: "Aloqa", page: "contact" }
  ];

  function logoHTML() {
    return '<a class="logo" href="/" aria-label="YasinDoors — bosh sahifa">' +
      '<span class="logo-mark"><svg viewBox="0 0 18 22" aria-hidden="true"><use href="#i-door"></use></svg></span>' +
      '<span>Yasin<b>Doors</b></span></a>';
  }

  function headerHTML(page) {
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' class="is-active" aria-current="page"' : "") + ">" + n.label + "</a>";
    }).join("");
    var drawerLinks = NAV.concat([
      { href: "/Favorites", label: "Sevimlilar", page: "favorites" },
      { href: "/Cart", label: "Savat", page: "cart" }
    ]).map(function (n) {
      return '<a class="drawer-link' + (n.page === page ? " is-active" : "") + '" href="' + n.href + '">' + n.label + icon("arrow") + "</a>";
    }).join("");

    return '<header class="site-header" id="siteHeader">' +
      '<div class="container nav">' + logoHTML() +
      '<nav class="nav-links" aria-label="Asosiy menyu">' + links + "</nav>" +
      '<div class="nav-actions">' +
      '<a class="icon-btn nav-search" href="/Products?focus=search" aria-label="Qidiruv">' + icon("search") + "</a>" +
      '<button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Rejimni almashtirish (yorug‘ / qorong‘i)">' + icon("sun", "i-sun") + icon("moon", "i-moon") + "</button>" +
      '<a class="icon-btn" href="/Favorites" aria-label="Sevimlilar">' + icon("heart") + '<span class="count" data-fav-count>0</span></a>' +
      '<a class="icon-btn" href="/Cart" aria-label="Savat">' + icon("bag") + '<span class="count" data-cart-count>0</span></a>' +
      '<div class="auth-slot" data-auth-slot></div>' +
      '<a class="btn btn--sm hide-mobile nav-catalog" href="/Products">Katalog</a>' +
      '<button class="icon-btn menu-toggle" type="button" data-menu-open aria-label="Menyuni ochish" aria-expanded="false" aria-controls="mobileDrawer">' + icon("menu") + "</button>" +
      "</div></div></header>" +
      '<div class="drawer-backdrop" data-overlay></div>' +
      '<aside class="drawer" id="mobileDrawer" aria-label="Mobil menyu" aria-hidden="true">' +
      '<div class="drawer-head">' + logoHTML() +
      '<button class="icon-btn" type="button" data-menu-close aria-label="Menyuni yopish">' + icon("close") + "</button></div>" +
      '<div class="drawer-auth" data-auth-drawer></div>' +
      drawerLinks +
      '<div class="drawer-foot">' +
      '<button class="btn btn--outline btn--block" type="button" data-install hidden>' + icon("grid") + " Ilovani o‘rnatish</button>" +
      '<button class="btn btn--outline btn--block" type="button" data-theme-toggle>' + icon("moon") + " Rejimni almashtirish</button>" +
      '<a class="btn btn--gold btn--block" href="/Products">Mahsulotlarni ko‘rish</a>' +
      "</div></aside>";
  }

  function contactValue(value, emptyText) {
    return value ? esc(value) : '<span class="placeholder">' + (emptyText || "Tez orada qo‘shiladi") + "</span>";
  }

  function footerHTML() {
    var GEO = window.YDGeo || { SHOP: { lat: 40.160167, lng: 67.8335 }, mapsUrl: function (a, b) { return "https://www.google.com/maps?q=" + a + "," + b; } };
    var socials = "";
    if (CONFIG.telegram) socials += '<a href="' + esc(CONFIG.telegram) + '" target="_blank" rel="noopener" aria-label="Telegram">' + icon("telegram") + "</a>";
    if (CONFIG.instagram) socials += '<a href="' + esc(CONFIG.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram">' + icon("instagram") + "</a>";
    var phoneLink = CONFIG.phone
      ? '<a href="tel:' + esc(CONFIG.phone.replace(/[^\d+]/g, "")) + '">' + esc(CONFIG.phone) + "</a>"
      : contactValue("");
    return '<footer class="site-footer"><div class="container">' +
      '<div class="footer-grid">' +
      "<div>" + logoHTML() +
      "<p>" + esc(SITE.footer_about || "MDF eshiklar va zamonaviy dizayn yechimlari.") + "</p>" +
      (socials ? '<div class="socials">' + socials + "</div>" : "") + "</div>" +
      '<div><h4>Bizning manzilimiz</h4><ul class="footer-links footer-contact">' +
      "<li>" + icon("pin") + '<span><a class="footer-map" href="' + esc(GEO.mapsUrl(GEO.SHOP.lat, GEO.SHOP.lng)) + '" target="_blank" rel="noopener">Manzilimizni xaritada ko‘rish →</a></span></li>' +
      "</ul></div>" +
      '<div><h4>Telefon</h4><ul class="footer-links footer-contact">' +
      "<li>" + icon("phone") + "<span>" + phoneLink + "</span></li></ul>" +
      '<h4 class="footer-sub">Ish vaqti</h4><ul class="footer-links footer-contact">' +
      "<li>" + icon("clock") + "<span>" + contactValue(CONFIG.workHours) + "</span></li></ul></div>" +
      '<div><h4>Tezkor havolalar</h4><ul class="footer-links">' +
      '<li><a href="/">Bosh sahifa</a></li><li><a href="/Products">Katalog</a></li>' +
      '<li><a href="/About">Biz haqimizda</a></li><li><a href="/Contact">Aloqa</a></li>' +
      '<li><a href="/Cart">Savat</a></li><li><a href="/Favorites">Sevimlilar</a></li></ul></div>' +
      "</div>" +
      '<div class="footer-bottom"><span>© ' + new Date().getFullYear() + " " + esc(SITE.store_name || "YasinDoors") + ". Barcha huquqlar himoyalangan.</span>" +
      (CATALOG_SOURCE === "db" ? "" : "<span>Saytdagi narxlar namunaviy va o‘zgarishi mumkin.</span>") + "</div>" +
      "</div></footer>";
  }

  /* ---------- Pastki mobil navigatsiya (≤960px da CSS ko‘rsatadi) ---------- */
  var BOTTOM_NAV = [
    { href: "/", label: "Bosh sahifa", icon: "home", pages: ["home"] },
    { href: "/Products", label: "Katalog", icon: "grid", pages: ["products"] },
    { href: "/Favorites", label: "Sevimlilar", icon: "heart", pages: ["favorites"], count: "fav" },
    { href: "/Cart", label: "Savat", icon: "bag", pages: ["cart", "checkout"], count: "cart" },
    { href: "/Profile", label: "Profil", icon: "user", pages: ["profile", "login", "register", "forgot", "reset"] }
  ];
  function bottomNavHTML(page) {
    return '<nav class="bottom-nav" aria-label="Pastki menyu">' + BOTTOM_NAV.map(function (n) {
      var on = n.pages.indexOf(page) !== -1;
      return '<a class="bn-item' + (on ? " is-active" : "") + '" href="' + n.href + '"' + (on ? ' aria-current="page"' : "") + ">" +
        '<span class="bn-ico">' + icon(n.icon) + (n.count ? '<span class="count" data-' + n.count + '-count>0</span>' : "") + "</span>" +
        "<span>" + n.label + "</span></a>";
    }).join("") + "</nav>";
  }

  /* ---------- Yuklanish skeletonlari: katalog kelguncha mahsulot setkasi bo‘sh turmasin ---------- */
  function skeletonCards(n) {
    var one = '<article class="product-card is-skeleton" aria-hidden="true"><div class="product-media sk"></div><div class="product-body"><div class="sk sk-line"></div><div class="sk sk-line sk-line--s"></div><div class="sk sk-line sk-line--m"></div></div></article>';
    return new Array(n + 1).join(one);
  }

  /* ---------- Tema ---------- */
  var THEME_KEY = "yd_theme";
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0e0e0f" : "#f7f5f1");
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* e’tiborsiz */ }
  }

  /* ---------- Oxirgi ko‘rilgan mahsulotlar va qidiruv tarixi (faqat shu qurilmada) ---------- */
  function lsGet(key) { try { var v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function lsSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* e’tiborsiz */ } }
  var recent = {
    key: "yd_recent_v1",
    list: function () { return lsGet(this.key).filter(function (x) { return typeof x === "string"; }).slice(0, 12); },
    add: function (id) { var l = this.list().filter(function (x) { return x !== id; }); l.unshift(String(id)); lsSet(this.key, l.slice(0, 12)); },
    clear: function () { lsSet(this.key, []); }
  };
  var searchHistory = {
    key: "yd_search_v1",
    list: function () { return lsGet(this.key).filter(function (x) { return typeof x === "string"; }).slice(0, 6); },
    add: function (q) {
      q = String(q || "").trim().slice(0, 60);
      if (q.length < 2) return;
      var l = this.list().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
      l.unshift(q); lsSet(this.key, l.slice(0, 6));
    },
    clear: function () { lsSet(this.key, []); }
  };

  /* ---------- Toast ---------- */
  function toast(message, link) {
    var wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = icon("check") + "<span>" + esc(message) +
      (link ? '<a href="' + esc(link.href) + '">' + esc(link.label) + "</a>" : "") + "</span>";
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.removeChild(wrap.firstChild);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () { el.remove(); }, 300);
    }, 2800);
  }

  /* ---------- Mahsulot kartasi ---------- */
  function badgesHTML(p) {
    var html = "";
    if (p.badges.indexOf("new") !== -1) html += '<span class="badge badge--new">Yangi</span>';
    if (p.badges.indexOf("popular") !== -1) html += '<span class="badge badge--popular">Mashhur</span>';
    if (p.oldPrice && p.oldPrice > p.price) html += '<span class="badge badge--sale">−' + Math.round((1 - p.price / p.oldPrice) * 100) + "%</span>";
    return html ? '<div class="badges">' + html + "</div>" : "";
  }

  function productCard(p) {
    var color = DATA.COLORS[p.color] || { name: p.color, hex: "#ccc" };
    var fav = store.isFav(p.id);
    var url = "/Product?id=" + encodeURIComponent(p.id);
    return '<article class="product-card reveal" data-id="' + esc(p.id) + '">' +
      '<a class="product-media" href="' + url + '" aria-label="' + esc(p.name) + ' — batafsil">' +
      '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + ' MDF eshigi" loading="lazy" decoding="async" width="480" height="600"></a>' +
      badgesHTML(p) +
      '<button class="fav-btn' + (fav ? " is-active" : "") + '" type="button" data-fav="' + esc(p.id) + '" aria-pressed="' + fav + '" aria-label="Sevimlilarga qo‘shish">' + icon("heart") + "</button>" +
      '<div class="product-body">' +
      '<div class="product-meta"><span class="swatch" style="background:' + esc(color.hex) + '"></span>' + esc(color.name) + " · " + esc(DATA.STYLES[p.style] || p.style) + "</div>" +
      '<h3 class="product-title"><a href="' + url + '">' + esc(p.name) + "</a></h3>" +
      '<p class="product-desc">' + esc(p.short) + "</p>" +
      '<div class="product-foot">' +
      '<div class="price">' + (p.oldPrice && p.oldPrice > p.price ? '<span class="price-old">' + formatPrice(p.oldPrice) + "</span>" : "") + formatPrice(p.price) + "</div>" +
      '<div class="product-actions">' +
      '<a class="btn btn--outline" href="' + url + '">Batafsil</a>' +
      '<button class="btn add-btn' + (store.inCart(p.id) ? " is-added" : "") + '" type="button" data-add="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' — savatga qo‘shish">' + icon("bag") + "</button>" +
      "</div></div></div></article>";
  }

  function emptyState(opts) {
    return '<div class="empty-state reveal">' +
      '<div class="empty-icon">' + icon(opts.icon || "bag") + "</div>" +
      "<h2>" + esc(opts.title) + "</h2><p>" + esc(opts.text) + "</p>" +
      '<a class="btn btn--gold" href="' + (opts.href || "/Products") + '">' + esc(opts.button || "Katalogga o‘tish") + icon("arrow") + "</a></div>";
  }

  /* ---------- Hisoblagichlarni yangilash ---------- */
  var lastCounts = { cart: null, fav: null };
  function updateCounts() {
    var c = store.cartCount();
    var f = store.getFavs().length;
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = c > 99 ? "99+" : c;
      el.classList.toggle("is-visible", c > 0);
      if (lastCounts.cart !== null && lastCounts.cart !== c) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
    document.querySelectorAll("[data-fav-count]").forEach(function (el) {
      el.textContent = f;
      el.classList.toggle("is-visible", f > 0);
    });
    lastCounts.cart = c; lastCounts.fav = f;

    document.querySelectorAll("[data-fav]").forEach(function (btn) {
      var active = store.isFav(btn.getAttribute("data-fav"));
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active);
      btn.setAttribute("aria-label", active ? "Sevimlilardan olib tashlash" : "Sevimlilarga qo‘shish");
    });
    document.querySelectorAll("[data-add]").forEach(function (btn) {
      btn.classList.toggle("is-added", store.inCart(btn.getAttribute("data-add")));
    });
  }

  /* ---------- Scroll reveal ---------- */
  // Har bir element faqat BIR MARTA paydo bo‘ladi. Bir vaqtda ko‘ringan elementlar
  // ketma-ket (stagger) chiqadi. Animatsiya tugagach reveal klasslari olib tashlanadi —
  // shunda elementning o‘z hover/transition uslublari (masalan, karta ko‘tarilishi) ishlaydi.
  var revealObserver = null;
  function finishReveal(el) {
    el.classList.remove("reveal", "is-visible");
    el.style.removeProperty("--reveal-delay");
  }
  function observeReveal(root) {
    // Loading ekran ochiq bo‘lsa — animatsiyalar overlay ortida o‘tib ketmasin, tugashini kutamiz
    if (window.YDLoader && !window.YDLoader.done) {
      window.YDLoader.onReady(function () { observeReveal(root); });
      return;
    }
    var els = (root || document).querySelectorAll(".reveal:not(.is-visible)");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(finishReveal);
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        var visible = entries.filter(function (e) { return e.isIntersecting; })
          .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left; });
        visible.forEach(function (entry, i) {
          var el = entry.target;
          revealObserver.unobserve(el);
          el.style.setProperty("--reveal-delay", Math.min(i * 70, 420) + "ms");
          el.classList.add("is-visible");
          var done = function (ev) {
            if (ev && (ev.target !== el || ev.propertyName !== "opacity")) return;
            el.removeEventListener("transitionend", done);
            clearTimeout(timer);
            finishReveal(el);
          };
          var timer = setTimeout(done, 1600); // transitionend kelmasa ham (masalan, yashirin tab) tozalaymiz
          el.addEventListener("transitionend", done);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    }
    els.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- Menyu ---------- */
  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    var drawer = document.getElementById("mobileDrawer");
    var btn = document.querySelector("[data-menu-open]");
    if (drawer) drawer.setAttribute("aria-hidden", String(!open));
    if (btn) btn.setAttribute("aria-expanded", String(open));
  }

  /* ---------- Ishga tushirish ---------- */
  function init() {
    document.documentElement.classList.remove("no-js");
    document.body.insertAdjacentHTML("afterbegin", SPRITE);

    var page = document.body.getAttribute("data-page") || "";
    var headerSlot = document.querySelector("[data-include='header']");
    var footerSlot = document.querySelector("[data-include='footer']");
    if (headerSlot) headerSlot.outerHTML = headerHTML(page);
    if (footerSlot) footerSlot.outerHTML = footerHTML();

    document.body.insertAdjacentHTML("beforeend", bottomNavHTML(page));
    ["productGrid", "favGrid"].forEach(function (id) {
      var g = document.getElementById(id);
      if (g && !g.children.length && !catalogDone) { g.setAttribute("aria-busy", "true"); g.innerHTML = skeletonCards(id === "productGrid" ? 6 : 4); }
    });

    // Navbar holati, progress chizig‘i va boshqa scroll effektlari — assets/js/scroll.js

    // Global hodisalar (event delegation)
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-theme-toggle], [data-menu-open], [data-menu-close], [data-overlay], [data-fav], [data-add]");
      if (!t) return;

      if (t.hasAttribute("data-theme-toggle")) toggleTheme();
      else if (t.hasAttribute("data-menu-open")) setMenu(true);
      else if (t.hasAttribute("data-menu-close")) setMenu(false);
      else if (t.hasAttribute("data-overlay")) {
        setMenu(false);
        document.body.classList.remove("filters-open");
      }
      else if (t.hasAttribute("data-fav")) {
        e.preventDefault();
        var p = getProduct(t.getAttribute("data-fav"));
        var added = store.toggleFav(t.getAttribute("data-fav"));
        t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
        if (p) toast(added ? p.name + " sevimlilarga qo‘shildi" : p.name + " sevimlilardan olib tashlandi",
          added ? { href: "/Favorites", label: "Ko‘rish" } : null);
      }
      else if (t.hasAttribute("data-add")) {
        e.preventDefault();
        var prod = getProduct(t.getAttribute("data-add"));
        if (!prod) return;
        store.addToCart(prod.id, prod.sizes[0], 1);
        toast(prod.name + " savatga qo‘shildi", { href: "/Cart", label: "Savatga o‘tish" });
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { setMenu(false); document.body.classList.remove("filters-open"); }
    });

    // Rasm yuklanmasa — fallback
    document.addEventListener("error", function (e) {
      var img = e.target;
      if (img && img.tagName === "IMG" && !img.dataset.fallback && !img.closest(".leaflet-container")) {
        img.dataset.fallback = "1";
        img.src = FALLBACK_IMG;
      }
    }, true);

    document.addEventListener("yd:change", updateCounts);
    updateCounts();
    observeReveal();
    domReady = true;
    fireReady();
  }

  window.YD = {
    data: DATA,
    config: CONFIG,
    store: store,
    recent: recent,
    searchHistory: searchHistory,
    esc: esc,
    icon: icon,
    param: param,
    formatPrice: formatPrice,
    getProduct: getProduct,
    productCard: productCard,
    emptyState: emptyState,
    toast: toast,
    observeReveal: observeReveal,
    contactValue: contactValue,
    whenReady: whenReady,
    isSample: function () { return CATALOG_SOURCE !== "db"; },
    site: function () { return SITE; },
    apiUrl: function (path) { return (CONFIG.apiBase || "").replace(/\/$/, "") + path; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
