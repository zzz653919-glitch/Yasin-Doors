/* Katalog: qidiruv, saralash va filtrlar (holat URL’da saqlanadi) */
YD.whenReady(function () {
  var D = YD.data;
  var grid = document.getElementById("productGrid");
  var countEl = document.getElementById("resultCount");
  var searchInput = document.getElementById("searchInput");
  var sortSelect = document.getElementById("sortSelect");
  var styleWrap = document.getElementById("styleFilters");
  var colorWrap = document.getElementById("colorFilters");
  var badgeWrap = document.getElementById("badgeFilters");
  var activeCountEl = document.getElementById("activeFilterCount");
  var catWrap = document.getElementById("categoryFilters");
  var priceMin = document.getElementById("priceMin"), priceMax = document.getElementById("priceMax");
  var loadWrap = document.getElementById("loadMoreWrap"), loadBtn = document.getElementById("loadMore"), loadInfo = document.getElementById("loadMoreInfo");
  var PAGE = 24;   // katalog katta bo‘lganda (200+ mahsulot) sahifa tez ochilishi uchun bo‘lib-bo‘lib ko‘rsatiladi
  var shown = PAGE;

  function listParam(name) {
    var v = YD.param(name);
    return v ? v.split(",").filter(Boolean) : [];
  }

  var state = {
    q: YD.param("q") || "",
    sort: YD.param("sort") || "default",
    styles: listParam("style").filter(function (s) { return D.STYLES[s]; }),
    colors: listParam("color").filter(function (c) { return D.COLORS[c]; }),
    badges: listParam("badge").filter(function (b) { return b === "new" || b === "popular"; }),
    cats: listParam("cat"),
    min: Number(YD.param("min")) || 0,
    max: Number(YD.param("max")) || 0
  };

  // Faqat mavjud mahsulotlarda uchraydigan uslub va ranglar
  var usedStyles = Object.keys(D.STYLES).filter(function (s) { return D.PRODUCTS.some(function (p) { return p.style === s; }); });
  var usedColors = Object.keys(D.COLORS).filter(function (c) { return D.PRODUCTS.some(function (p) { return p.color === c; }); });

  styleWrap.innerHTML = usedStyles.map(function (s) {
    return '<button class="chip" type="button" data-style="' + s + '">' + YD.esc(D.STYLES[s]) + "</button>";
  }).join("");
  // Kategoriyalar (bazadagi katalogda bor): har birida nechta mahsulot borligi ko‘rsatiladi
  var catCounts = {};
  D.PRODUCTS.forEach(function (p) { if (p.category) catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  var usedCats = Object.keys(catCounts).sort();
  state.cats = state.cats.filter(function (c) { return catCounts[c]; });
  if (usedCats.length) {
    document.getElementById("categoryGroup").hidden = false;
    catWrap.innerHTML = usedCats.map(function (c) {
      return '<button class="chip" type="button" data-cat="' + YD.esc(c) + '">' + YD.esc(c) + ' <small class="muted">' + catCounts[c] + "</small></button>";
    }).join("");
  }
  colorWrap.innerHTML = usedColors.map(function (c) {
    return '<button class="chip" type="button" data-color="' + c + '"><span class="swatch" style="background:' + D.COLORS[c].hex + '"></span>' + YD.esc(D.COLORS[c].name) + "</button>";
  }).join("");

  searchInput.value = state.q;
  sortSelect.value = state.sort;
  if (state.min) priceMin.value = state.min;
  if (state.max) priceMax.value = state.max;

  function toggle(list, value) {
    var i = list.indexOf(value);
    if (i === -1) list.push(value); else list.splice(i, 1);
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/[‘’ʻʼ'`]/g, "").trim();
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    if (state.sort !== "default") p.set("sort", state.sort);
    if (state.styles.length) p.set("style", state.styles.join(","));
    if (state.colors.length) p.set("color", state.colors.join(","));
    if (state.badges.length) p.set("badge", state.badges.join(","));
    if (state.cats.length) p.set("cat", state.cats.join(","));
    if (state.min) p.set("min", state.min);
    if (state.max) p.set("max", state.max);
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function render(keepShown) {
    if (keepShown !== true) shown = PAGE;
    var q = normalize(state.q);
    var list = D.PRODUCTS.filter(function (p) {
      if (q && normalize(p.name).indexOf(q) === -1 && normalize(p.sku || "").indexOf(q) === -1 && normalize(p.category || "").indexOf(q) === -1) return false;
      if (state.cats.length && state.cats.indexOf(p.category) === -1) return false;
      if (state.min && p.price < state.min) return false;
      if (state.max && p.price > state.max) return false;
      if (state.styles.length && state.styles.indexOf(p.style) === -1) return false;
      if (state.colors.length && state.colors.indexOf(p.color) === -1) return false;
      if (state.badges.length && !state.badges.every(function (b) { return p.badges.indexOf(b) !== -1; })) return false;
      return true;
    });

    if (state.sort === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
    else if (state.sort === "price-desc") list.sort(function (a, b) { return b.price - a.price; });
    else if (state.sort === "name") list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (state.sort === "new") list.sort(function (a, b) { return (b.badges.indexOf("new") !== -1) - (a.badges.indexOf("new") !== -1); });

    countEl.textContent = list.length ? "Topildi: " + list.length + " ta mahsulot" : "";
    if (list.length) {
      grid.innerHTML = list.slice(0, shown).map(YD.productCard).join("");
      grid.style.display = "";
      loadWrap.hidden = list.length <= shown;
      loadInfo.textContent = list.length > shown ? "Ko‘rsatilgan: " + shown + " / " + list.length : "";
    } else {
      loadWrap.hidden = true;
      grid.innerHTML = '<div style="grid-column:1/-1">' + YD.emptyState({
        icon: "search",
        title: "Hech narsa topilmadi",
        text: "Qidiruv so‘zini o‘zgartirib yoki filtrlarni tozalab ko‘ring.",
        href: "/Products",
        button: "Filtrlarni tozalash"
      }) + "</div>";
    }

    document.querySelectorAll("[data-cat]").forEach(function (b) { b.classList.toggle("is-active", state.cats.indexOf(b.dataset.cat) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    document.querySelectorAll("[data-style]").forEach(function (b) { b.classList.toggle("is-active", state.styles.indexOf(b.dataset.style) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    document.querySelectorAll("[data-color]").forEach(function (b) { b.classList.toggle("is-active", state.colors.indexOf(b.dataset.color) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    document.querySelectorAll("[data-badge]").forEach(function (b) { b.classList.toggle("is-active", state.badges.indexOf(b.dataset.badge) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    var n = state.styles.length + state.colors.length + state.badges.length + state.cats.length + (state.min || state.max ? 1 : 0);
    activeCountEl.textContent = n ? "(" + n + ")" : "";

    syncUrl();
    YD.observeReveal(grid);
  }

  document.getElementById("filters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-style], [data-color], [data-badge], [data-cat]");
    if (!b) return;
    if (b.dataset.cat) toggle(state.cats, b.dataset.cat);
    if (b.dataset.style) toggle(state.styles, b.dataset.style);
    if (b.dataset.color) toggle(state.colors, b.dataset.color);
    if (b.dataset.badge) toggle(state.badges, b.dataset.badge);
    render();
  });

  document.getElementById("resetFilters").addEventListener("click", function () {
    state.styles = []; state.colors = []; state.badges = []; state.cats = []; state.min = 0; state.max = 0; state.q = ""; state.sort = "default";
    searchInput.value = ""; sortSelect.value = "default"; priceMin.value = ""; priceMax.value = "";
    render();
  });

  var timer;
  searchInput.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = searchInput.value.trim(); render(); }, 150);
  });
  sortSelect.addEventListener("change", function () { state.sort = sortSelect.value; render(); });
  var ptimer;
  function onPrice() { clearTimeout(ptimer); ptimer = setTimeout(function () { state.min = Math.max(0, Number(priceMin.value) || 0); state.max = Math.max(0, Number(priceMax.value) || 0); render(); }, 300); }
  priceMin.addEventListener("input", onPrice); priceMax.addEventListener("input", onPrice);
  loadBtn.addEventListener("click", function () { shown += PAGE; render(true); });

  // Mobil filtr paneli
  document.getElementById("openFilters").addEventListener("click", function () { document.body.classList.add("filters-open"); });
  document.querySelectorAll("[data-filters-close]").forEach(function (b) {
    b.addEventListener("click", function () { document.body.classList.remove("filters-open"); });
  });

  render();

  /* Header'dagi qidiruv tugmasi: qidiruv maydoniga o‘tadi va klaviaturani ochadi */
  function focusSearch() {
    searchInput.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    searchInput.focus({ preventScroll: true });
  }
  document.querySelectorAll(".nav-search").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); focusSearch(); }); });
  if (YD.param("focus") === "search") setTimeout(focusSearch, 250);
});
