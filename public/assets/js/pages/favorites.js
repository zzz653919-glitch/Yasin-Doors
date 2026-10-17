/* Sevimlilar sahifasi */
YD.whenReady(function () {
  var grid = document.getElementById("favGrid");
  var toolbar = document.getElementById("favToolbar");
  var subtitle = document.getElementById("favSubtitle");
  var rendered = "";

  function render() {
    var favs = YD.store.getFavs();
    var key = favs.join("|");
    if (key === rendered) return; // faqat ro‘yxat o‘zgarganda qayta chizamiz
    rendered = key;

    toolbar.hidden = favs.length === 0;
    if (!favs.length) {
      subtitle.textContent = "Yoqqan modellarni saqlang va keyinroq solishtiring.";
      grid.style.display = "block";
      grid.innerHTML = YD.emptyState({
        icon: "heart",
        title: "Sevimlilar ro‘yxati bo‘sh",
        text: "Mahsulot kartasidagi yurakcha belgisini bosing — model shu yerda saqlanadi.",
        button: "Katalogga o‘tish"
      });
    } else {
      subtitle.textContent = "Saqlangan modellar: " + favs.length + " ta";
      grid.style.display = "";
      grid.innerHTML = favs.map(function (id) { return YD.productCard(YD.getProduct(id)); }).join("");
    }
    YD.observeReveal(grid);
  }

  document.getElementById("addAllToCart").addEventListener("click", function () {
    var favs = YD.store.getFavs();
    favs.forEach(function (id) {
      if (!YD.store.inCart(id)) YD.store.addToCart(id, null, 1);
    });
    YD.toast("Sevimli mahsulotlar savatga qo‘shildi", { href: "cart.html", label: "Savatga o‘tish" });
  });
  document.getElementById("clearFavs").addEventListener("click", function () {
    if (!window.confirm("Sevimlilar ro‘yxatini tozalaysizmi?")) return;
    YD.store.getFavs().forEach(function (id) { YD.store.toggleFav(id); });
  });

  document.addEventListener("yd:change", render);
  render();
});
