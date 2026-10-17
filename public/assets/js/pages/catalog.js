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

  function listParam(name) {
    var v = YD.param(name);
    return v ? v.split(",").filter(Boolean) : [];
  }

  var state = {
    q: YD.param("q") || "",
    sort: YD.param("sort") || "default",
    styles: listParam("style").filter(function (s) { return D.STYLES[s]; }),
    colors: listParam("color").filter(function (c) { return D.COLORS[c]; }),
    badges: listParam("badge").filter(function (b) { return b === "new" || b === "popular"; })
  };

  // Faqat mavjud mahsulotlarda uchraydigan uslub va ranglar
  var usedStyles = Object.keys(D.STYLES).filter(function (s) { return D.PRODUCTS.some(function (p) { return p.style === s; }); });
  var usedColors = Object.keys(D.COLORS).filter(function (c) { return D.PRODUCTS.some(function (p) { return p.color === c; }); });

  styleWrap.innerHTML = usedStyles.map(function (s) {
    return '<button class="chip" type="button" data-style="' + s + '">' + YD.esc(D.STYLES[s]) + "</button>";
  }).join("");
  colorWrap.innerHTML = usedColors.map(function (c) {
    return '<button class="chip" type="button" data-color="' + c + '"><span class="swatch" style="background:' + D.COLORS[c].hex + '"></span>' + YD.esc(D.COLORS[c].name) + "</button>";
  }).join("");

  searchInput.value = state.q;
  sortSelect.value = state.sort;

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
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function render() {
    var q = normalize(state.q);
    var list = D.PRODUCTS.filter(function (p) {
      if (q && normalize(p.name).indexOf(q) === -1) return false;
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
      grid.innerHTML = list.map(YD.productCard).join("");
      grid.style.display = "";
    } else {
      grid.innerHTML = '<div style="grid-column:1/-1">' + YD.emptyState({
        icon: "search",
        title: "Hech narsa topilmadi",
        text: "Qidiruv so‘zini o‘zgartirib yoki filtrlarni tozalab ko‘ring.",
        href: "products.html",
        button: "Filtrlarni tozalash"
      }) + "</div>";
    }

    document.querySelectorAll("[data-style]").forEach(function (b) { b.classList.toggle("is-active", state.styles.indexOf(b.dataset.style) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    document.querySelectorAll("[data-color]").forEach(function (b) { b.classList.toggle("is-active", state.colors.indexOf(b.dataset.color) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    document.querySelectorAll("[data-badge]").forEach(function (b) { b.classList.toggle("is-active", state.badges.indexOf(b.dataset.badge) !== -1); b.setAttribute("aria-pressed", b.classList.contains("is-active")); });
    var n = state.styles.length + state.colors.length + state.badges.length;
    activeCountEl.textContent = n ? "(" + n + ")" : "";

    syncUrl();
    YD.observeReveal(grid);
  }

  document.getElementById("filters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-style], [data-color], [data-badge]");
    if (!b) return;
    if (b.dataset.style) toggle(state.styles, b.dataset.style);
    if (b.dataset.color) toggle(state.colors, b.dataset.color);
    if (b.dataset.badge) toggle(state.badges, b.dataset.badge);
    render();
  });

  document.getElementById("resetFilters").addEventListener("click", function () {
    state.styles = []; state.colors = []; state.badges = []; state.q = ""; state.sort = "default";
    searchInput.value = ""; sortSelect.value = "default";
    render();
  });

  var timer;
  searchInput.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { state.q = searchInput.value.trim(); render(); }, 150);
  });
  sortSelect.addEventListener("change", function () { state.sort = sortSelect.value; render(); });

  // Mobil filtr paneli
  document.getElementById("openFilters").addEventListener("click", function () { document.body.classList.add("filters-open"); });
  document.querySelectorAll("[data-filters-close]").forEach(function (b) {
    b.addEventListener("click", function () { document.body.classList.remove("filters-open"); });
  });

  render();
});
