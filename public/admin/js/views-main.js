/* Admin bo'limlari: Dashboard, Mahsulotlar, Buyurtmalar */
(function () {
  "use strict";
  var A = window.A, esc = A.esc, fmt = A.fmt, $ = A.$, $$ = A.$$;

  /* =====================================================
     DASHBOARD
     ===================================================== */
  A.views.dashboard = {
    title: "Dashboard", icon: "dashboard", perm: "dashboard.view",
    render: function (root) {
      var range = "week";
      root.innerHTML =
        '<div class="page-head"><div><h1>Xush kelibsiz, ' + esc((A.state.user.name || "").split(" ")[0]) + '</h1><p>Do\'kon holatining qisqacha ko\'rinishi — barcha raqamlar bazadagi haqiqiy ma\'lumotlardan hisoblanadi.</p></div></div>' +
        '<div id="dashBanners" class="stack" style="margin-bottom:16px"></div><div id="dashQuick"></div>' +
        '<div id="dashStats">' + A.skeleton("stats") + '</div><div id="dashBody"></div>';

      function load() {
        return A.get("/dashboard" + A.qs({ range: range })).then(function (d) {
          if (!root.isConnected) return;
          paint(d);
        }).catch(function (e) {
          $("#dashStats", root).innerHTML = '<div class="card">' + A.emptyState("alert", "Ma'lumotlarni yuklab bo'lmadi", e.message, '<button class="btn btn--gold" data-act="retry">Qayta urinish</button>') + "</div>";
          $("#dashBody", root).innerHTML = "";
        });
      }

      function paint(d) {
        var s = d.stats, banners = "";
        if (!d.telegram.configured && !d.telegram.dryRun) {
          banners += '<div class="alert alert--warn">' + A.icon("telegram") + '<div>Telegram bildirishnomalari sozlanmagan — yangi buyurtmalar haqida xabar kelmaydi. <a href="#/settings">Sozlash yo\'riqnomasi</a></div></div>';
        }
        if (!d.has_products && A.can("products.write")) {
          banners += '<div class="alert alert--info">' + A.icon("info") + '<div>Katalog hali bo\'sh, shuning uchun sayt namunaviy (statik) katalogni ko\'rsatyapti. Mahsulot qo\'shing yoki <button class="btn btn--sm btn--ghost" data-act="import-sample" style="margin-left:6px">Namunaviy katalogni import qilish</button></div></div>';
        }
        if (s.low_stock > 0) {
          banners += '<div class="alert alert--warn">' + A.icon("warehouse") + "<div>" + s.low_stock + ' ta mahsulot omborda kam qolgan yoki tugagan. <a href="#/inventory?stock=low">Omborni ko\'rish</a></div></div>';
        }
        $("#dashBanners", root).innerHTML = banners;

        var quick = "";
        if (A.can("products.write")) quick += '<button class="btn btn--gold" data-act="quick-product">' + A.icon("plus") + "Mahsulot qo'shish</button>";
        if (A.can("orders.read")) quick += '<a class="btn btn--ghost" href="#/orders">' + A.icon("cart") + "Buyurtmalarni ko'rish</a>";
        if (A.can("categories.write")) quick += '<button class="btn btn--ghost" data-act="quick-category">' + A.icon("tag") + "Yangi kategoriya</button>";
        $("#dashQuick", root).innerHTML = '<div class="quick">' + quick + "</div>";

        function card(icon, label, val, sub, warn, href) {
          var inner = '<div class="top"><span>' + label + '</span><span class="ico">' + A.icon(icon) + '</span></div><div class="val">' + val + '</div><div class="sub' + (warn ? " warn" : "") + '">' + sub + "</div>";
          return href ? '<a class="card stat" href="' + href + '">' + inner + "</a>" : '<div class="card stat">' + inner + "</div>";
        }
        $("#dashStats", root).innerHTML = '<div class="grid stats">' +
          card("cart", "Jami buyurtmalar", fmt.num(s.total_orders), "Yangi: " + s.new_orders, false, "#/orders") +
          card("clock", "Bugungi buyurtmalar", fmt.num(s.today_orders), "Toshkent vaqti bo'yicha", false, "#/orders") +
          card("box", "Jami mahsulotlar", fmt.num(s.total_products), "Sotuvda: " + s.active_products, false, "#/products") +
          card("warehouse", "Ombordagi mahsulotlar", fmt.num(s.stock_units) + "<small>dona</small>", s.low_stock ? s.low_stock + " ta kam qolgan" : "Hammasi yetarli", s.low_stock > 0, "#/inventory") +
          card("userplus", "Yangi mijozlar", fmt.num(s.new_customers), "So'nggi 7 kun · jami " + s.total_customers, false, "#/customers") +
          card("users", "Ro'yxatdan o'tgan foydalanuvchilar", fmt.num(s.total_accounts), "Bugun: " + s.today_accounts + " · 7 kun: " + s.week_accounts, false, A.can("accounts.read") ? "#/accounts" : null) +
          card("money", "Umumiy savdo (to'langan)", fmt.num(s.revenue) + "<small>so'm</small>", "Kutilayotgan (to'lanmagan): " + fmt.money(s.pending_amount), false, "#/orders?payment=unpaid") +
          card("alert", "Bajarilmagan buyurtmalar", fmt.num(s.open_orders), "Yangi, qabul qilingan, tayyorlanayotgan, yo'lda", s.new_orders > 0, "#/orders?status=new") +
          card("trend", "O'rtacha chek", fmt.num(s.avg_order) + "<small>so'm</small>", "To'langan buyurtmalar: " + s.paid_orders, false) +
          "</div>";

        var total = d.by_status.reduce(function (a, b) { return a + b.count; }, 0);
        var legend = Object.keys(A.STATUS).map(function (k) {
          var c = (d.by_status.filter(function (x) { return x.status === k; })[0] || { count: 0 }).count;
          return '<div><i style="background:' + A.STATUS_COLORS[k] + '"></i>' + esc(A.STATUS[k]) + "<b>" + c + "</b></div>";
        }).join("");

        var top = d.top_products.length ? d.top_products.map(function (p, i) {
          return '<div class="popover-item" style="align-items:center"><b style="width:18px;color:var(--muted)">' + (i + 1) + '</b><img class="thumb" style="width:36px;height:44px" data-fb src="' + esc(A.imgSrc(p.image)) + '" alt=""><div style="min-width:0;flex:1"><b>' + esc(p.name) + "</b><small>" + fmt.money(p.revenue) + '</small></div><b class="mono">' + p.qty + " ta</b></div>";
        }).join("") : A.emptyState("trend", "Hali sotuvlar yo'q", "Birinchi buyurtmalar kelgach, eng ko'p sotilgan eshiklar shu yerda ko'rinadi.");

        var recent = d.recent_orders.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Buyurtma</th><th>Mijoz</th><th class="right">Summa</th><th>Holat</th></tr></thead><tbody>' +
          d.recent_orders.map(function (o) {
            return '<tr class="clickable" data-open-order="' + o.id + '"><td><div class="cell-main">' + esc(o.number) + '</div><div class="cell-sub">' + fmt.date(o.created_at) + "</div></td><td>" + esc(o.name) + '</td><td class="right mono">' + fmt.money(o.total) + "</td><td>" + A.statusChip(o.status) + "</td></tr>";
          }).join("") + "</tbody></table></div>" : A.emptyState("cart", "Buyurtmalar yo'q", "Saytdan kelgan buyurtmalar shu yerda ko'rinadi.");

        $("#dashBody", root).innerHTML =
          '<div class="grid cols-2"><div class="card"><div class="card-head"><h2>Savdo grafigi <small class="muted" style="font-weight:600;font-size:12px">(to\'langan buyurtmalar)</small></h2><div class="seg" role="group" aria-label="Davr"><button type="button" data-range="week" class="' + (range === "week" ? "is-active" : "") + '">Hafta</button><button type="button" data-range="month" class="' + (range === "month" ? "is-active" : "") + '">Oy</button></div></div><div class="chart" id="salesChart">' + A.charts.sales(d.chart) + "</div></div>" +
          '<div class="card"><div class="card-head"><h2>Buyurtmalar holati</h2></div>' + (total ? '<div class="donut-wrap">' + A.charts.donut(d.by_status) + '<div class="legend">' + legend + "</div></div>" : A.emptyState("cart", "Ma'lumot yo'q", "Buyurtmalar kelgach diagramma paydo bo'ladi.")) + "</div></div>" +
          '<div class="grid cols-2b"><div class="card"><div class="card-head"><h2>Eng ko\'p sotilgan eshiklar</h2></div><div style="padding-top:8px">' + top + "</div></div>" +
          '<div class="card"><div class="card-head"><h2>So\'nggi buyurtmalar</h2><a class="btn btn--sm btn--ghost" href="#/orders">Barchasi</a></div><div style="padding-top:8px">' + recent + "</div></div></div>";
        A.charts.bindTip($("#salesChart", root), d.chart);
        A.fallbackImg(root);
      }

      root.addEventListener("click", function (e) {
        var r = e.target.closest("[data-range]");
        if (r) { range = r.getAttribute("data-range"); load(); return; }
        var o = e.target.closest("[data-open-order]");
        if (o) { A.go("orders", { open: o.getAttribute("data-open-order") }); return; }
        var act = e.target.closest("[data-act]");
        if (!act) return;
        var a = act.getAttribute("data-act");
        if (a === "retry") load();
        if (a === "quick-product") A.openProductForm(null, load);
        if (a === "quick-category") A.openCategoryForm(null, function () { A.toast("Kategoriya yaratildi"); load(); });
        if (a === "import-sample") {
          A.confirm({ title: "Namunaviy katalog", text: "10 ta namunaviy MDF eshik bazaga qo'shiladi (narxlar namunaviy, ombor 0). Keyin ularni tahrirlashingiz mumkin.", confirmLabel: "Import qilish" }).then(function (ok) {
            if (!ok) return;
            A.post("/products/import-sample").then(function (r) { A.toast(r.imported + " ta mahsulot import qilindi"); load(); }).catch(A.fail);
          });
        }
      });
      // Statistika (jumladan yangi foydalanuvchilar) avtomatik yangilanadi
      var dashTimer = setInterval(function () {
        if (!root.isConnected) { clearInterval(dashTimer); return; }
        if (document.visibilityState === "visible" && !document.querySelector(".modal")) load();
      }, 30000);
      load();
    }
  };

  /* =====================================================
     MAHSULOTLAR
     ===================================================== */
  var colorOpts = function (sel) {
    return '<option value="">—</option>' + Object.keys(A.COLORS).map(function (k) { return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + esc(A.COLORS[k].name) + "</option>"; }).join("");
  };
  var styleOpts = function (sel) {
    return '<option value="">—</option>' + Object.keys(A.STYLES).map(function (k) { return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + esc(A.STYLES[k]) + "</option>"; }).join("");
  };

  A.openProductForm = function (product, onSaved) {
    var isEdit = !!product;
    var p = product || { name: "", price: "", old_price: "", stock: 0, low_stock: 5, color: "", style: "", material: "MDF", sizes: ["600 × 2000", "700 × 2000", "800 × 2000", "900 × 2000"], short: "", description: "", image: "", category_id: "", active: true, is_new: false, is_popular: false };
    var imageUrl = p.image || "";
    var uploading = false, saving = false;
    // Takroriy bosish/qayta urinishda server bitta mahsulot yaratishi uchun: kalit forma ochilganda bir marta yaratiladi
    var createKey = (function () { var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a); return [].map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); })();

    // Tugma ketma-ket bosilsa, bir nechta forma ochilib ketmasin
    if (A.openProductForm.opening) return;
    A.openProductForm.opening = true;

    A.get("/categories").then(function (c) { return c.items; }).catch(function () { return []; }).then(function (cats) {
      var catOpts = '<option value="">— Kategoriyasiz —</option>' + cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.category_id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("");
      var m = A.modal({
        title: isEdit ? "Mahsulotni tahrirlash" : "Yangi MDF eshik qo'shish", size: "lg", persistent: true,
        body: '<form id="pf" novalidate><div class="form-grid">' +
          '<div class="field full"><label for="pf-name">Nomi *</label><input class="input" id="pf-name" name="name" maxlength="120" value="' + esc(p.name) + '"><span class="err"></span></div>' +
          '<div class="field"><label for="pf-cat">Kategoriya</label><select class="select" id="pf-cat" name="category_id">' + catOpts + '</select><span class="err"></span></div>' +
          '<div class="field"><label for="pf-sku">Mahsulot kodi (SKU)</label><input class="input" id="pf-sku" name="sku" maxlength="40" autocapitalize="characters" placeholder="Bo\'sh qolsa avtomatik" value="' + esc(p.sku || "") + '"><span class="err"></span></div>' +
          '<div class="field"><label for="pf-fin">Tekstura / qoplama</label><input class="input" id="pf-fin" name="finish" maxlength="80" value="' + esc(p.finish || "") + '"></div>' +
          '<div class="field"><label for="pf-mat">Material</label><input class="input" id="pf-mat" name="material" maxlength="80" value="' + esc(p.material) + '"></div>' +
          '<div class="field"><label for="pf-price">Narx (so\'m) *</label><input class="input" id="pf-price" name="price" inputmode="numeric" value="' + esc(p.price) + '"><span class="err"></span></div>' +
          '<div class="field"><label for="pf-old">Chegirmadan oldingi narx</label><input class="input" id="pf-old" name="old_price" inputmode="numeric" value="' + esc(p.old_price == null ? "" : p.old_price) + '" placeholder="Chegirma bo\'lmasa bo\'sh"><span class="err"></span></div>' +
          '<div class="field"><label for="pf-stock">Ombordagi miqdor</label><input class="input" id="pf-stock" name="stock" inputmode="numeric" value="' + esc(p.stock) + '"><span class="err"></span></div>' +
          '<div class="field"><label for="pf-low">Kam qolish chegarasi</label><input class="input" id="pf-low" name="low_stock" inputmode="numeric" value="' + esc(p.low_stock) + '"><span class="hint">Shu miqdor yoki undan kam bo\'lsa ogohlantiriladi.</span><span class="err"></span></div>' +
          '<div class="field"><label for="pf-color">Rang</label><select class="select" id="pf-color" name="color">' + colorOpts(p.color) + "</select><span class=\"err\"></span></div>" +
          '<div class="field"><label for="pf-style">Dizayn</label><select class="select" id="pf-style" name="style">' + styleOpts(p.style) + "</select><span class=\"err\"></span></div>" +
          '<div class="field full"><label for="pf-sizes">O\'lchamlar (mm, vergul bilan)</label><input class="input" id="pf-sizes" name="sizes" value="' + esc((p.sizes || []).join(", ")) + '"><span class="hint">Masalan: 800 × 2000, 900 × 2000</span></div>' +
          '<div class="field full"><label for="pf-short">Qisqa tavsif</label><input class="input" id="pf-short" name="short" maxlength="200" value="' + esc(p.short) + '"></div>' +
          '<div class="field full"><label for="pf-desc">To\'liq tavsif</label><textarea class="textarea" id="pf-desc" name="description" maxlength="2000">' + esc(p.description) + "</textarea></div>" +
          '<div class="field full"><span class="label">Rasm</span><div class="img-up"><div class="preview" id="pfPrev">' + (imageUrl ? '<img data-fb src="' + esc(A.imgSrc(imageUrl)) + '" alt="">' : A.icon("image")) + '</div><div class="stack" style="gap:8px"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--ghost btn--sm" type="button" id="pfPick">' + A.icon("image") + 'Rasm tanlash</button><button class="btn btn--ghost btn--sm" type="button" id="pfClear"' + (imageUrl ? "" : " hidden") + '>Olib tashlash</button></div><span class="hint">JPG, PNG yoki WEBP. Rasm avtomatik kichraytiriladi. 4:5 nisbat tavsiya etiladi.</span><span class="err" id="pfImgErr" style="color:var(--danger);font-weight:600"></span></div><input type="file" id="pfFile" accept="image/jpeg,image/png,image/webp" hidden></div></div>' +
          '<div class="full" style="display:flex;gap:22px;flex-wrap:wrap"><label class="check"><input type="checkbox" name="active"' + (p.active ? " checked" : "") + '> Sotuvda (faol)</label><label class="check"><input type="checkbox" name="is_new"' + (p.is_new ? " checked" : "") + '> Yangi</label><label class="check"><input type="checkbox" name="is_popular"' + (p.is_popular ? " checked" : "") + "> Mashhur</label></div>" +
          '</div><div class="alert alert--error" id="pfErr" hidden style="margin-top:14px"></div></form>',
        actions: (isEdit ? [{ label: "Tarix", cls: "btn--ghost", onClick: function () { if (A.openProductHistory) A.openProductHistory(p.id, p.name); } }] : []).concat([
          { label: isEdit ? "Asl holatiga qaytarish" : "Formani tozalash", cls: "btn--ghost", id: "pfReset", onClick: function () { resetForm(); } },
          { label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { api.close(); } },
          { label: isEdit ? "Saqlash" : "Qo'shish", cls: "btn--gold", id: "pfSave", onClick: function (api, btn) { save(api, btn); } }
        ])
      });
      A.openProductForm.opening = false;
      var form = $("#pf", m.el);
      A.fallbackImg(m.el);
      form.addEventListener("submit", function (e) { e.preventDefault(); save(m, $("#pfSave", m.el)); });
      $("#pfPick", m.el).addEventListener("click", function () { $("#pfFile", m.el).click(); });
      $("#pfClear", m.el).addEventListener("click", function () { imageUrl = ""; refreshPreview(); });
      $("#pfFile", m.el).addEventListener("change", function (e) {
        var f = e.target.files[0];
        if (!f) return;
        $("#pfImgErr", m.el).textContent = "";
        uploading = true;
        $("#pfPrev", m.el).innerHTML = '<span class="spinner"></span>';
        A.uploadImage(f).then(function (url) { imageUrl = url; }).catch(function (err) { $("#pfImgErr", m.el).textContent = err.message; })
          .then(function () { uploading = false; refreshPreview(); e.target.value = ""; });
      });
      function refreshPreview() {
        $("#pfPrev", m.el).innerHTML = imageUrl ? '<img src="' + esc(A.imgSrc(imageUrl)) + '" alt="">' : A.icon("image");
        $("#pfClear", m.el).hidden = !imageUrl;
      }
      function intOrNull(v) { v = String(v).replace(/\s/g, ""); return v === "" ? null : Number(v); }
      // Yaratishda — bo'sh forma; tahrirlashda — serverdan kelgan asl qiymatlar
      function resetForm() {
        if (saving) return;
        form.reset();
        imageUrl = p.image || "";
        refreshPreview();
        A.$$(".field.has-error", form).forEach(function (f) { f.classList.remove("has-error"); });
        $("#pfImgErr", m.el).textContent = "";
        $("#pfErr", m.el).hidden = true;
        $("#pf-name", m.el).focus();
      }
      function save(api, btn) {
        if (saving || btn.disabled) return;          // allaqachon yuborilmoqda — ikkinchi so'rov yuborilmaydi
        if (uploading) return A.toast("Rasm yuklanmoqda, kuting…", "error");
        var fd = form.elements, ok = true;
        function check(name, cond, msg) { A.fieldError(form, name, cond ? "" : msg); if (!cond) ok = false; }
        var price = intOrNull(fd.price.value), old = intOrNull(fd.old_price.value), stock = intOrNull(fd.stock.value);
        check("name", fd.name.value.trim().length >= 2, "Nomini kiriting (kamida 2 ta belgi).");
        check("price", price !== null && Number.isInteger(price) && price >= 1, "Narxni 1 so'mdan katta butun son bilan kiriting.");
        check("old_price", old === null || (Number.isInteger(old) && price !== null && old > price), "Chegirmadan oldingi narx joriy narxdan katta bo'lishi kerak.");
        check("stock", stock === null || (Number.isInteger(stock) && stock >= 0), "Miqdor 0 yoki undan katta butun son bo'lsin.");
        if (!ok) return;
        var body = {
          name: fd.name.value.trim(), category_id: fd.category_id.value || null, material: fd.material.value.trim(),
          price: price, old_price: old, stock: stock == null ? 0 : stock, low_stock: intOrNull(fd.low_stock.value) == null ? 5 : intOrNull(fd.low_stock.value),
          color: fd.color.value, style: fd.style.value, sizes: fd.sizes.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean),
          short: fd.short.value.trim(), description: fd.description.value.trim(), image: imageUrl, sku: fd.sku.value.trim(), finish: fd.finish.value.trim(),
          active: fd.active.checked, is_new: fd.is_new.checked, is_popular: fd.is_popular.checked
        };
        // Forma ochiq turganda ombor boshqa joyda o'zgargan bo'lishi mumkin (masalan, buyurtma tasdiqlangan):
        // miqdor foydalanuvchi o'zgartirgan bo'lsagina yuboriladi, aks holda yangi qoldiq eski qiymat bilan bosib yuboriladi.
        if (isEdit && body.stock === p.stock) delete body.stock;
        else if (isEdit) body.expected_stock = p.stock;   // server bu orada qoldiq o'zgarganini aniqlay olsin
        if (!isEdit) body.idempotencyKey = createKey;
        saving = true;
        A.setBusy(btn, true, "Saqlanmoqda…");
        $("#pfReset", m.el).disabled = true;
        $("#pfErr", m.el).hidden = true;
        (isEdit ? A.put("/products/" + encodeURIComponent(p.id), body) : A.post("/products", body)).then(function () {
          api.close();
          A.toast(isEdit ? "Mahsulot saqlandi" : "Mahsulot qo'shildi");
          if (onSaved) onSaved();
        }).catch(function (err) {
          saving = false;
          A.setBusy(btn, false);
          $("#pfReset", m.el).disabled = false;
          // Server tekshiruvi aniq maydonni ko'rsatsa — xato o'sha maydon yonida; kiritilgan ma'lumotlar saqlanib qoladi
          var field = err.data && err.data.field;
          var fieldBox = field && form.elements[field] && form.elements[field].closest(".field");
          if (fieldBox && $(".err", fieldBox)) {
            A.fieldError(form, field, err.message);
            form.elements[field].focus();
          } else {
            var box = $("#pfErr", m.el); box.textContent = err.message; box.hidden = false;
          }
        });
      }
    });
  };

  A.views.products = {
    title: "Mahsulotlar", icon: "box", perm: "products.read",
    render: function (root, query) {
      var f = { q: query.q || "", category: "", active: "", stock: query.stock || "", sort: "new", color: "", badge: "", price_min: "", price_max: "" };
      var page = 1, PAGE = 40;
      var items = [], selected = new Set(), cats = [];
      root.innerHTML = '<div class="page-head"><div><h1>Mahsulotlar</h1><p>MDF eshiklar katalogi — saytda ko\'rinadigan mahsulotlar shu yerda boshqariladi.</p></div><div class="head-actions">' +
        '<button class="btn btn--ghost" data-act="export">' + A.icon("download") + "CSV eksport</button>" +
        (A.can("products.write") ? '<button class="btn btn--ghost" data-act="import">' + A.icon("upload") + 'CSV import</button><input type="file" id="pImportFile" accept=".csv,text/csv" hidden>' +
          '<button class="btn btn--ghost" data-act="seed">' + A.icon("box") + "200 ta namunaviy eshik</button>" +
          '<button class="btn btn--gold" data-act="add">' + A.icon("plus") + "Mahsulot qo'shish</button>" : "") + '</div></div><div class="card" id="pCard"></div>';
      var card = $("#pCard", root);
      card.innerHTML = '<div class="toolbar"><input class="input grow" id="pq" type="search" placeholder="Nomi bo\'yicha qidirish…" value="' + esc(f.q) + '" aria-label="Qidirish">' +
        '<select class="select" id="pcat" aria-label="Kategoriya"><option value="">Barcha kategoriyalar</option></select>' +
        '<select class="select" id="pact" aria-label="Holat"><option value="">Barcha holatlar</option><option value="1">Faol</option><option value="0">Nofaol</option></select>' +
        '<select class="select" id="pstock" aria-label="Ombor"><option value="">Ombor: hammasi</option><option value="low">Kam qolgan</option><option value="out">Tugagan</option></select>' +
        '<select class="select" id="psort" aria-label="Saralash"><option value="new">Yangilari avval</option><option value="name">Nomi A–Z</option><option value="price_asc">Narx: arzon</option><option value="price_desc">Narx: qimmat</option><option value="stock">Ombor: kam</option><option value="sold">Sotuvlar: ko\'p</option><option value="views">Ko\'rishlar: ko\'p</option><option value="name_desc">Nomi Z–A</option><option value="sku">Kod (SKU)</option></select>' +
        '<select class="select" id="pcolor" aria-label="Rang"><option value="">Barcha ranglar</option>' + Object.keys(A.COLORS).map(function (k) { return '<option value="' + k + '">' + esc(A.COLORS[k].name) + "</option>"; }).join("") + "</select>" +
        '<select class="select" id="pbadge" aria-label="Belgi"><option value="">Barcha belgilar</option><option value="new">Yangi</option><option value="popular">Bestseller</option><option value="discount">Chegirmali</option></select>' +
        '<input class="input" id="pmin" type="number" inputmode="numeric" min="0" placeholder="Narx: dan" aria-label="Minimal narx" style="max-width:130px"><input class="input" id="pmax" type="number" inputmode="numeric" min="0" placeholder="gacha" aria-label="Maksimal narx" style="max-width:130px">' +
        '<button class="btn btn--ghost btn--sm" type="button" id="pClear" hidden>' + A.icon("close") + "Filtrlarni tozalash</button></div>" +
        '<div id="pBulk"></div><div id="pTable">' + A.skeleton() + "</div>";
      $("#pstock", root).value = f.stock;

      // Kategoriyalar ro'yxati (seed/import yangi kategoriya qo'shishi mumkin — shuning uchun qayta yuklanadi)
      function loadCats() {
        return A.get("/categories").then(function (r) {
          cats = r.items;
          var sel = $("#pcat", root), cur = sel.value;
          sel.innerHTML = '<option value="">Barcha kategoriyalar</option>' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
          sel.value = cur;
        }).catch(function () {});
      }
      loadCats();

      function load() {
        syncClear();
        return A.get("/products" + A.qs(f)).then(function (r) {
          if (!root.isConnected) return;
          items = r.items;
          selected.forEach(function (id) { if (!items.some(function (p) { return p.id === id; })) selected.delete(id); });
          paint();
        }).catch(function (e) { $("#pTable", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message, '<button class="btn btn--gold" data-act="reload">Qayta urinish</button>'); });
      }
      // Ommaviy amallar paneli. Katakcha bosilganda butun jadval emas, faqat shu panel yangilanadi
      // (aks holda jadval qayta chizilib, klaviatura fokusi va scroll yo'qolardi).
      function paintBulk() {
        var canW = A.can("products.write"), canD = A.can("products.delete"), bulk = "";
        if (selected.size && canW) {
          bulk = '<div class="bulkbar"><span>' + selected.size + ' ta tanlandi</span>' +
            '<button class="btn btn--sm btn--ghost" data-bulk="activate">Faollashtirish</button><button class="btn btn--sm btn--ghost" data-bulk="deactivate">Nofaol qilish</button>' +
            '<button class="btn btn--sm btn--ghost" data-bulk="mark_new">«Yangi» belgisi</button><button class="btn btn--sm btn--ghost" data-bulk="mark_popular">«Mashhur» belgisi</button>' +
            '<button class="btn btn--sm btn--ghost" data-bulk="set_category">Kategoriya…</button><button class="btn btn--sm btn--ghost" data-bulk="set_color">Rang…</button><button class="btn btn--sm btn--ghost" data-bulk="price_percent">Narx ±%…</button><button class="btn btn--sm btn--ghost" data-bulk="discount_percent">Chegirma %…</button><button class="btn btn--sm btn--ghost" data-bulk="clear_discount">Chegirmani olib tashlash</button>' +
            (canD ? '<button class="btn btn--sm btn--danger" data-bulk="delete">' + A.icon("trash") + "O'chirish</button>" : "") +
            '<button class="btn btn--sm btn--ghost" data-bulk="clear" style="margin-left:auto">Bekor qilish</button></div>';
        }
        $("#pBulk", root).innerHTML = bulk;
        var all = $("[data-selall]", root);
        if (all) all.checked = items.length > 0 && items.every(function (p) { return selected.has(p.id); });
      }
      function paint() {
        var canW = A.can("products.write"), canD = A.can("products.delete");
        paintBulk();
        if (!items.length) {
          var filtered = f.q || f.category || f.active || f.stock;
          $("#pTable", root).innerHTML = filtered ? A.emptyState("search", "Hech narsa topilmadi", "Qidiruv yoki filtrlarni o'zgartirib ko'ring.") :
            A.emptyState("box", "Katalog bo'sh", "Birinchi MDF eshikni qo'shing — u saytda darhol ko'rinadi.", canW ? '<button class="btn btn--gold" data-act="add">' + A.icon("plus") + " Mahsulot qo'shish</button>" : "");
          return;
        }
        var allSel = items.length && items.every(function (p) { return selected.has(p.id); });
        $("#pTable", root).innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' + (canW ? '<th style="width:40px"><input type="checkbox" data-selall aria-label="Hammasini tanlash"' + (allSel ? " checked" : "") + "></th>" : "") +
          "<th>Mahsulot</th><th>Kategoriya</th><th>Narx</th><th>Ombor</th><th>Ko'rish · Sotuv</th><th>Holat</th><th></th></tr></thead><tbody>" +
          items.slice((page - 1) * PAGE, page * PAGE).map(function (p) {
            var stockChip = p.stock <= 0 ? A.chip("bad", "Tugagan") : p.stock <= p.low_stock ? A.chip("low", "Kam: " + p.stock) : A.chip("ok", p.stock + " dona");
            var tags = (p.is_new ? '<span class="tag">Yangi</span>' : "") + (p.is_popular ? '<span class="tag">Mashhur</span>' : "");
            return "<tr>" + (canW ? '<td><input type="checkbox" data-sel="' + esc(p.id) + '" aria-label="Tanlash"' + (selected.has(p.id) ? " checked" : "") + "></td>" : "") +
              '<td><div class="cell-product"><img class="thumb" data-fb loading="lazy" src="' + esc(A.imgSrc(p.image)) + '" alt=""><div><div class="cell-main">' + esc(p.name) + '</div><div class="cell-sub">' + tags + '<span class="mono">' + esc(p.sku || p.id) + "</span></div></div></div></td>" +
              "<td>" + (p.category_name ? esc(p.category_name) : '<span class="muted">—</span>') + "</td>" +
              '<td class="mono nowrap">' + (p.old_price ? '<span class="price-old">' + fmt.money(p.old_price) + "</span>" : "") + "<b>" + fmt.money(p.price) + "</b></td>" +
              "<td>" + stockChip + '</td><td class="nowrap"><span title="Ko\'rishlar">' + A.icon("eye") + " " + fmt.num(p.views) + '</span> · <span title="Sotilgan">' + A.icon("cart") + " " + fmt.num(p.sold) + "</span></td><td>" + (p.active ? A.chip("ok", "Faol") : A.chip("off", "Nofaol")) + "</td>" +
              '<td><div class="actions">' + (canW ? '<button class="icon-btn" data-edit="' + esc(p.id) + '" aria-label="Tahrirlash">' + A.icon("edit") + "</button>" : "") +
              (canD ? '<button class="icon-btn danger" data-del="' + esc(p.id) + '" aria-label="O\'chirish">' + A.icon("trash") + "</button>" : "") + "</div></td></tr>";
          }).join("") + "</tbody></table></div>" + pagerHTML();
        A.fallbackImg(root);
      }
      function pagerHTML() {
        var pages = Math.max(1, Math.ceil(items.length / PAGE));
        if (page > pages) page = pages;
        return '<div class="pager"><span class="muted">Jami: ' + items.length + " ta · sahifa " + page + " / " + pages + '</span><div><button class="btn btn--sm btn--ghost" data-page="prev"' + (page <= 1 ? " disabled" : "") + '>Oldingi</button> <button class="btn btn--sm btn--ghost" data-page="next"' + (page >= pages ? " disabled" : "") + ">Keyingi</button></div></div>";
      }
      function askValue(title, bodyHtml, read) {
        return new Promise(function (resolve) {
          var done = false;
          var m = A.modal({ title: title, size: "sm", body: '<form id="avf" novalidate>' + bodyHtml + '<div class="alert alert--error" id="avErr" hidden style="margin-top:12px"></div></form>',
            actions: [{ label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { done = true; api.close(); resolve(undefined); } },
              { label: "Qo'llash", cls: "btn--gold", onClick: function (api) { var r = read(A.$("#avf", m.el).elements); if (r.error) { var b = A.$("#avErr", m.el); b.textContent = r.error; b.hidden = false; return; } done = true; api.close(); resolve(r.value); } }],
            onClose: function () { if (!done) resolve(undefined); } });
        });
      }
      function openHistory(id, name) {
        A.get("/products/" + encodeURIComponent(id) + "/history").then(function (r) {
          var AC = { "product.create": "Yaratildi", "product.update": "Tahrirlandi", "products.import": "CSV import", "product.bulk.activate": "Faollashtirildi", "product.bulk.deactivate": "Nofaol qilindi" };
          function what(a) {
            if (a.detail && a.detail.bulk) return "Ommaviy amal: " + esc(a.detail.bulk) + (a.detail.value != null ? " (" + esc(String(a.detail.value)) + ")" : "");
            var parts = a.detail && typeof a.detail === "object" ? Object.keys(a.detail).map(function (k) { var v = a.detail[k]; return Array.isArray(v) ? esc(k) + ": " + esc(String(v[0] == null ? "—" : v[0]).slice(0, 40)) + " → <b>" + esc(String(v[1] == null ? "—" : v[1]).slice(0, 40)) + "</b>" : esc(k) + ": " + esc(String(v).slice(0, 60)); }) : [];
            return esc(AC[a.action] || a.action) + (parts.length ? "<br><small class=\"muted\">" + parts.join("; ") + "</small>" : "");
          }
          var rows = r.audits.map(function (a) { return { at: a.at, html: what(a), who: a.username }; }).concat(r.moves.map(function (m) { return { at: m.at, html: "Ombor: " + (m.delta > 0 ? "+" : "") + m.delta + " → qoldiq <b>" + m.balance_after + "</b>" + (m.note ? "<br><small class=\"muted\">" + esc(m.note) + "</small>" : ""), who: m.username }; }))
            .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
          A.modal({ title: "O'zgarishlar tarixi — " + name, size: "md", body: rows.length ? '<div class="timeline">' + rows.map(function (x) { return "<div>" + x.html + "<small>" + fmt.date(x.at) + (x.who ? " · " + esc(x.who) : "") + "</small></div>"; }).join("") + "</div>" : '<p class="muted">Hozircha yozuvlar yo\'q.</p>',
            actions: [{ label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } }] });
        }).catch(A.fail);
      }
      A.openProductHistory = openHistory;

      var reload = function () { load(); };
      // Mahsulot o'chirib bo'lmasa: sababi va muqobil yechim (nofaol qilish) taklif qilinadi
      function blockedDialog(prod, message) {
        A.modal({
          title: "O'chirib bo'lmaydi", size: "sm",
          body: '<div class="confirm-ico gold">' + A.icon("alert") + "</div><p>" + esc(message) + "</p>",
          actions: [
            { label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } },
            { label: "Nofaol qilish", cls: "btn--gold", onClick: function (api, btn) {
              A.setBusy(btn, true);
              A.put("/products/" + encodeURIComponent(prod.id), { active: false }).then(function () { api.close(); A.toast("Mahsulot nofaol qilindi (saytda ko'rinmaydi)"); load(); }).catch(function (e) { A.setBusy(btn, false); A.fail(e); });
            } }
          ]
        });
      }
      // «Filtrlarni tozalash»: qidiruv va barcha filtrlar boshlang'ich holatga qaytadi
      function syncClear() { var b = $("#pClear", root); if (b) b.hidden = !(f.q || f.category || f.active || f.stock || f.color || f.badge || f.price_min || f.price_max || f.sort !== "new"); }
      var onFilter = A.debounce(function () { load(); }, 250);
      $("#pq", root).addEventListener("input", function (e) { f.q = e.target.value.trim(); page = 1; onFilter(); });
      [["pcat", "category"], ["pact", "active"], ["pstock", "stock"], ["psort", "sort"], ["pcolor", "color"], ["pbadge", "badge"]].forEach(function (x) {
        $("#" + x[0], root).addEventListener("change", function (e) { f[x[1]] = e.target.value; page = 1; load(); });
      });
      $("#pmin", root).addEventListener("input", function (e) { f.price_min = e.target.value.trim(); page = 1; onFilter(); });
      $("#pmax", root).addEventListener("input", function (e) { f.price_max = e.target.value.trim(); page = 1; onFilter(); });
      $("#pClear", root).addEventListener("click", function () {
        f.q = ""; f.category = ""; f.active = ""; f.stock = ""; f.sort = "new"; f.color = ""; f.badge = ""; f.price_min = ""; f.price_max = ""; page = 1;
        $("#pq", root).value = ""; $("#pcat", root).value = ""; $("#pact", root).value = ""; $("#pstock", root).value = ""; $("#psort", root).value = "new"; $("#pcolor", root).value = ""; $("#pbadge", root).value = ""; $("#pmin", root).value = ""; $("#pmax", root).value = "";
        load();
      });

      root.addEventListener("change", function (e) {
        if (e.target.matches("[data-selall]")) {
          items.forEach(function (p) { if (e.target.checked) selected.add(p.id); else selected.delete(p.id); });
          $$("[data-sel]", root).forEach(function (b) { b.checked = e.target.checked; });
          paintBulk();
        } else if (e.target.matches("[data-sel]")) {
          var id = e.target.getAttribute("data-sel");
          if (e.target.checked) selected.add(id); else selected.delete(id);
          paintBulk();
        }
      });
      root.addEventListener("click", function (e) {
        var t = e.target.closest("[data-act], [data-edit], [data-del], [data-bulk]");
        if (!t) return;
        if (t.hasAttribute("data-act")) {
          var a = t.getAttribute("data-act");
          if (a === "add") A.openProductForm(null, reload);
          if (a === "reload") load();
          if (a === "export") {
            A.setBusy(t, true);
            A.download("/admin/products/export" + A.qs({ q: f.q, category: f.category, active: f.active, stock: f.stock, color: f.color, badge: f.badge, price_min: f.price_min, price_max: f.price_max, sort: f.sort }), "yasindoors-mahsulotlar.csv")
              .then(function () { A.toast("CSV fayl yuklab olindi"); }).catch(A.fail).then(function () { A.setBusy(t, false); });
          }
          if (a === "import") $("#pImportFile", root).click();
          if (a === "seed") {
            A.confirm({ title: "Namunaviy katalog", confirmLabel: "Qo'shish", text: "200 ta namunaviy MDF eshik (9 kategoriya) qo'shiladi. Narxlar, ombor va tavsiflar <b>namunaviy</b> — keyin tahrirlang. Qayta bosilsa dublikat yaratilmaydi (SKU bo'yicha tekshiriladi)." }).then(function (ok) {
              if (!ok) return;
              A.setBusy(t, true, "Qo'shilmoqda…");
              A.post("/products/seed-catalog", {}).then(function (r) { A.toast("Qo'shildi: " + r.inserted + " ta yangi, " + r.linked + " ta bog'landi, " + r.skipped + " ta mavjud edi"); loadCats(); load(); }).catch(A.fail).then(function () { A.setBusy(t, false); });
            });
          }
        } else if (t.hasAttribute("data-edit")) {
          if (t.disabled) return;
          var id = t.getAttribute("data-edit");
          t.disabled = true;   // ketma-ket bosishda bir nechta forma ochilmasin
          // Har safar serverdan yangi ma'lumot olinadi (ro'yxatdagi eski nusxa emas) va aynan shu ID bilan forma ochiladi
          A.get("/products/" + encodeURIComponent(id)).then(function (r) { A.openProductForm(r.item, reload); }).catch(A.fail).then(function () { t.disabled = false; });
        } else if (t.hasAttribute("data-del")) {
          if (t.disabled) return;
          var pid = t.getAttribute("data-del"), prod = items.filter(function (p) { return p.id === pid; })[0];
          A.confirm({ title: "Mahsulotni o'chirish", danger: true, confirmLabel: "Ha, o'chirish", text: "<b>" + esc(prod ? prod.name : pid) + "</b> mahsuloti butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi. Yakunlangan va bekor qilingan buyurtmalar tarixida uning nomi saqlanib qoladi. Agar mahsulotni vaqtincha sotuvdan olmoqchi bo'lsangiz, uni o'chirmasdan «nofaol» qiling." }).then(function (ok) {
            if (!ok) return;
            t.disabled = true;
            A.del("/products/" + encodeURIComponent(pid)).then(function () { A.toast("Mahsulot o'chirildi"); selected.delete(pid); load(); })
              .catch(function (err) {
                t.disabled = false;
                if (err.data && err.data.code === "product_in_open_orders") blockedDialog(prod || { id: pid, name: pid }, err.message);
                else A.fail(err);
              });
          });
        } else if (t.hasAttribute("data-bulk")) {
          if (t.disabled) return;
          var action = t.getAttribute("data-bulk");
          if (action === "clear") { selected.clear(); paint(); return; }
          var ids = Array.from(selected);
          var run = function (value) {
            t.disabled = true;
            A.post("/products/bulk", { action: action, ids: ids, value: value }).then(function (r) {
              selected.clear();
              if (action === "delete") {
                A.toast(r.changed + " ta mahsulot o'chirildi");
                if (r.blocked && r.blocked.length) {
                  A.modal({ title: "Ba'zi mahsulotlar o'chirilmadi", size: "sm", body: "<p>Quyidagi mahsulotlar bajarilmagan buyurtmalarda bor, shuning uchun o'chirilmadi:</p><ul style=\"margin:10px 0 0;padding-left:18px\">" + r.blocked.map(function (b) { return "<li><b>" + esc(b.name) + "</b> — " + b.open + " ta buyurtma</li>"; }).join("") + "</ul><p class=\"muted\" style=\"margin-top:12px\">Avval buyurtmalarni yakunlang yoki bekor qiling, yoki mahsulotlarni «nofaol» qiling.</p>", actions: [{ label: "Tushunarli", cls: "btn--gold", onClick: function (api) { api.close(); } }] });
                }
              } else A.toast(r.changed + " ta mahsulot yangilandi");
              load();
            }).catch(function (err) { t.disabled = false; A.fail(err); });
          };
          if (action === "delete") {
            A.confirm({ title: "Tanlanganlarni o'chirish", danger: true, confirmLabel: "O'chirish", text: "<b>" + ids.length + " ta</b> mahsulot butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi." }).then(function (ok) { if (ok) run(); });
          } else if (action === "set_category") {
            askValue("Kategoriyani o'zgartirish (" + ids.length + " ta)", '<div class="field"><label for="av1">Kategoriya</label><select class="select" id="av1" name="v"><option value="">— Kategoriyasiz —</option>' + cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("") + "</select></div>", function (el) { return { value: el.v.value || null }; }).then(function (v) { if (v !== undefined) run(v); });
          } else if (action === "set_color") {
            askValue("Rangni o'zgartirish (" + ids.length + " ta)", '<div class="field"><label for="av1">Rang</label><select class="select" id="av1" name="v">' + Object.keys(A.COLORS).map(function (k) { return '<option value="' + k + '">' + esc(A.COLORS[k].name) + "</option>"; }).join("") + "</select></div>", function (el) { return { value: el.v.value }; }).then(function (v) { if (v !== undefined) run(v); });
          } else if (action === "price_percent" || action === "discount_percent") {
            var disc = action === "discount_percent";
            askValue((disc ? "Chegirma berish" : "Narxni o'zgartirish") + " (" + ids.length + " ta)", '<div class="field"><label for="av1">' + (disc ? "Chegirma foizi (1–70)" : "Foiz (−50 … +200, masalan 10 yoki −5)") + '</label><input class="input" id="av1" name="v" inputmode="decimal"><span class="hint">' + (disc ? "Eski narx saqlanadi va chegirma belgisi ko'rinadi." : "Narx 1000 so'mgacha yaxlitlanadi.") + "</span></div>", function (el) {
              var n = Number(String(el.v.value).replace(",", "."));
              if (!isFinite(n) || el.v.value.trim() === "") return { error: "Foizni kiriting." };
              if (disc ? (n < 1 || n > 70) : (n < -50 || n > 200)) return { error: disc ? "1 dan 70 gacha." : "−50 dan 200 gacha." };
              return { value: n };
            }).then(function (v) { if (v !== undefined) run(v); });
          } else run();
        }
      });
      root.addEventListener("click", function (e) {
        var pg = e.target.closest("[data-page]");
        if (!pg || pg.disabled) return;
        page += pg.getAttribute("data-page") === "next" ? 1 : -1;
        paint();
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      var impFile = $("#pImportFile", root);
      if (impFile) impFile.addEventListener("change", function (e) {
        var file = e.target.files[0]; e.target.value = "";
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) return A.toast("CSV fayl 3 MB dan katta", "error");
        var rd = new FileReader();
        rd.onload = function () {
          A.post("/products/import", { csv: String(rd.result) }).then(function (r) { A.toast("Import: " + r.created + " ta yangi, " + r.updated + " ta yangilandi"); loadCats(); load(); })
            .catch(function (err) {
              var errs = err.data && err.data.errors;
              if (errs) A.modal({ title: "CSV xatolari", size: "md", body: "<p>" + esc(err.message) + '</p><ul style="margin:10px 0 0;padding-left:18px">' + errs.map(function (x) { return "<li>" + x.line + "-qator: " + esc(x.message) + "</li>"; }).join("") + "</ul>", actions: [{ label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } }] });
              else A.fail(err);
            });
        };
        rd.readAsText(file, "utf-8");
      });
      load();
    }
  };

  /* =====================================================
     BUYURTMALAR
     ===================================================== */
  function itemsSummary(items) {
    if (!items.length) return "—";
    var first = esc(items[0].name) + " ×" + items[0].qty;
    return items.length > 1 ? first + ' <span class="muted">+' + (items.length - 1) + " ta</span>" : first;
  }

  /** 3D konstruktor qatorlari: barcha tanlovlar, 3D rasm, narx holati va (narxi yo'q bo'lsa) narx belgilash maydoni */
  function cfgBlocks(o, canU) {
    var html = "";
    o.items.forEach(function (i) {
      var c = i.config; if (!c || !c.cfg) return;
      var rows = window.YD_CFG ? window.YD_CFG.describe(c.cfg).map(function (r) { return "<dt>" + esc(r.label) + "</dt><dd>" + esc(r.value) + "</dd>"; }).join("") : "";
      html += '<div><p class="section-title">3D konstruktor · ' + esc(c.code) + "</p>" +
        '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
        (c.image ? '<a href="' + esc(A.imgSrc(c.image)) + '" target="_blank" rel="noopener"><img src="' + esc(A.imgSrc(c.image)) + '" alt="3D konfiguratsiya rasmi" style="width:120px;border-radius:10px;border:1px solid var(--border,#ddd)"></a>' : "") +
        '<dl class="kv" style="flex:1;min-width:200px">' + rows + "</dl></div>" +
        (c.priced ? '<p class="muted" style="font-size:13px">Narx admin kiritgan qoidalardan hisoblangan.</p>' :
          '<div class="alert alert--warn">' + A.icon("alert") + "<div>Narx avtomatik aniqlanmadi" + (c.missing && c.missing.length ? " (qoida yo'q: " + esc(c.missing.join("; ")) + ")" : "") + ". Mijoz bilan kelishib, 1 dona narxini kiriting.</div></div>" +
          (canU && !i.price ? '<div class="field"><label for="od-quote">1 dona narxi (so\'m)</label><input class="input" id="od-quote" inputmode="numeric" placeholder="Masalan: 2 150 000"></div>' : "")) +
        (c.link ? '<p><a class="text-link" href="/' + esc(c.link) + '" target="_blank" rel="noopener">Konfiguratsiyani konstruktorda ochish</a></p>' : "") + "</div>";
    });
    return html;
  }

  A.openOrder = function (id, onChanged) {
    A.get("/orders/" + id).then(function (r) {
      var o = r.item, canU = A.can("orders.update");
      var statusOpts = Object.keys(A.STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? " selected" : "") + ">" + esc(A.STATUS[k]) + "</option>"; }).join("");
      var payOpts = Object.keys(A.PAYMENT).map(function (k) { return '<option value="' + k + '"' + (k === o.payment_status ? " selected" : "") + ">" + esc(A.PAYMENT[k]) + "</option>"; }).join("");
      var hist = o.history.map(function (h) {
        var what = h.field === "status" ? "Holat: " + esc(A.STATUS[h.from_value] || "—") + " → <b>" + esc(A.STATUS[h.to_value] || h.to_value) + "</b>" :
          h.field === "payment_status" ? "To'lov: " + esc(A.PAYMENT[h.from_value] || "—") + " → <b>" + esc(A.PAYMENT[h.to_value] || h.to_value) + "</b>" :
          h.field === "quote" ? "Narx belgilandi: " + fmt.money(Number(h.from_value)) + " → <b>" + fmt.money(Number(h.to_value)) + "</b>" : "Admin izohi yangilandi";
        return "<div>" + what + "<small>" + fmt.date(h.at) + (h.username ? " · " + esc(h.username) : "") + (h.note ? " · " + esc(h.note) : "") + "</small></div>";
      }).reverse().join("");
      var m = A.modal({
        title: "Buyurtma " + o.number, size: "lg", persistent: true,
        body: '<div class="order-grid"><div class="stack">' +
          '<div><p class="section-title">Mijoz</p><dl class="kv"><dt>Ism</dt><dd>' + esc(o.name) + "</dd><dt>Email</dt><dd>" + (o.email ? '<a href="mailto:' + esc(o.email) + '" class="text-link">' + esc(o.email) + "</a>" : '<span class="muted">—</span>') + (o.account_id && A.can("accounts.read") ? ' <a class="text-link" href="#/accounts?open=' + o.account_id + '" data-close-modal>(профиль)</a>' : "") + "</dd><dt>Telefon</dt><dd><a href=\"tel:" + esc(o.phone) + '" class="text-link">' + esc(fmt.phone(o.phone)) + "</a></dd><dt>Manzil</dt><dd>" + esc(o.address) + (o.lat != null && o.lng != null ? ' <a class="text-link" href="https://www.google.com/maps?q=' + Number(o.lat).toFixed(6) + "," + Number(o.lng).toFixed(6) + '" target="_blank" rel="noopener">(xaritada)</a>' : "") + "</dd><dt>O'rnatish</dt><dd>" + (o.install ? "Kerak" : "Kerak emas") + "</dd><dt>Mijoz izohi</dt><dd>" + (o.comment ? esc(o.comment) : '<span class="muted">—</span>') + "</dd><dt>Sana</dt><dd>" + fmt.date(o.created_at) + "</dd></dl></div>" +
          '<div><p class="section-title">Mahsulotlar</p><table class="items-tbl"><thead><tr><th>Eshik</th><th>O\'lcham</th><th class="right">Soni</th><th class="right">Summa</th></tr></thead><tbody>' +
          o.items.map(function (i) {
            var price = i.config && !i.config.priced && !i.price ? '<span class="muted">Narx so\'raladi</span>' : fmt.money(i.price * i.qty);
            return "<tr><td>" + esc(i.name) + '</td><td class="nowrap">' + esc(i.size) + '</td><td class="right">' + i.qty + '</td><td class="right mono nowrap">' + price + "</td></tr>";
          }).join("") +
          '</tbody><tfoot><tr><td colspan="2">Jami (' + o.items_count + ' dona)</td><td colspan="2" class="right mono">' + fmt.money(o.total) + "</td></tr></tfoot></table></div>" +
          cfgBlocks(o, canU) + "</div>" +
          '<div class="stack"><div><p class="section-title">Holat</p>' +
          '<div class="field"><label for="od-status">Buyurtma holati</label><select class="select" id="od-status"' + (canU ? "" : " disabled") + ">" + statusOpts + '</select><span class="hint">Qabul qilinganda ombor avtomatik kamayadi; bekor qilinsa qaytariladi.</span></div></div>' +
          '<div class="field"><label for="od-pay">To\'lov holati</label><select class="select" id="od-pay"' + (canU ? "" : " disabled") + ">" + payOpts + "</select></div>" +
          '<div class="field"><span class="label">Yetkazib berish</span><div>' + A.chip(o.delivery_status === "delivered" ? "ok" : o.delivery_status === "cancelled" ? "bad" : o.delivery_status === "in_transit" ? "delivering" : "off", A.DELIVERY[o.delivery_status] || o.delivery_status) + "</div></div>" +
          '<div class="field"><label for="od-note">Ichki izoh (mijozga ko\'rinmaydi)</label><textarea class="textarea" id="od-note" maxlength="1000"' + (canU ? "" : " disabled") + ">" + esc(o.admin_note) + "</textarea></div>" +
          '<div class="alert alert--error" id="odErr" hidden></div>' +
          '<div><p class="section-title">Buyurtma tarixi</p><div class="timeline">' + (hist || '<span class="muted">Tarix yo\'q</span>') + "</div></div></div></div>",
        actions: [{ label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } }].concat(canU ? [{
          label: "Saqlash", cls: "btn--gold", onClick: function (api, btn) {
            var patch = {}, st = $("#od-status", m.el).value, pay = $("#od-pay", m.el).value, note = $("#od-note", m.el).value;
            if (st !== o.status) patch.status = st;
            if (pay !== o.payment_status) patch.payment_status = pay;
            if (note !== o.admin_note) patch.admin_note = note;
            var q = $("#od-quote", m.el);
            if (q && q.value.trim() !== "") {
              var qn = Number(q.value.replace(/\s/g, ""));
              if (!isFinite(qn) || qn < 0 || Math.floor(qn) !== qn) { var eb = $("#odErr", m.el); eb.textContent = "Narxni butun son bilan kiriting."; eb.hidden = false; return; }
              patch.quote_unit = qn;
            }
            if (!Object.keys(patch).length) { api.close(); return; }
            A.setBusy(btn, true);
            A.patch("/orders/" + o.id, patch).then(function () {
              api.close(); A.toast("Buyurtma yangilandi"); if (onChanged) onChanged();
            }).catch(function (err) {
              A.setBusy(btn, false);
              var box = $("#odErr", m.el); box.textContent = err.message; box.hidden = false;
            });
          }
        }] : [])
      });
    }).catch(A.fail);
  };

  A.views.orders = {
    title: "Заказы", icon: "cart", perm: "orders.read",
    render: function (root, query) {
      var f = { q: query.q || "", status: query.status || "", payment: query.payment || "", from: "", to: "", customer: query.customer || "", page: 1 };
      var data = { items: [], total: 0 };
      root.innerHTML = '<div class="page-head"><div><h1>Заказы</h1><p>Saytdan kelgan barcha buyurtmalar, ularning holati va tarixi. Ro\'yxat avtomatik yangilanadi.</p></div><div class="head-actions">' +
        (A.can("orders.export") ? '<button class="btn btn--ghost" data-act="export">' + A.icon("download") + "CSV eksport</button>" : "") + '</div></div><div class="card"><div class="toolbar">' +
        '<input class="input grow" id="oq" type="search" placeholder="Raqam, mijoz yoki telefon…" value="' + esc(f.q) + '" aria-label="Qidirish">' +
        '<select class="select" id="ost" aria-label="Holat"><option value="">Barcha holatlar</option>' + Object.keys(A.STATUS).map(function (k) { return '<option value="' + k + '">' + esc(A.STATUS[k]) + "</option>"; }).join("") + "</select>" +
        '<select class="select" id="opay" aria-label="To\'lov"><option value="">To\'lov: hammasi</option>' + Object.keys(A.PAYMENT).map(function (k) { return '<option value="' + k + '">' + esc(A.PAYMENT[k]) + "</option>"; }).join("") + "</select>" +
        '<input class="input" id="ofrom" type="date" aria-label="Boshlanish sanasi"><input class="input" id="oto" type="date" aria-label="Tugash sanasi">' +
        '<button class="btn btn--ghost btn--sm" type="button" id="oClear" hidden>' + A.icon("close") + "Filtrlarni tozalash</button></div>" +
        '<div id="oCust"></div><div id="oTable">' + A.skeleton() + '</div><div id="oPager"></div></div>';
      $("#ost", root).value = f.status;
      $("#opay", root).value = f.payment;

      function syncClear() { var b = $("#oClear", root); if (b) b.hidden = !(f.q || f.status || f.payment || f.from || f.to || f.customer); }
      function load() {
        syncClear();
        return A.get("/orders" + A.qs(f)).then(function (r) {
          if (!root.isConnected) return;
          data = r; paint();
        }).catch(function (e) { $("#oTable", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message, '<button class="btn btn--gold" data-act="reload">Qayta urinish</button>'); });
      }
      function paint() {
        $("#oCust", root).innerHTML = f.customer ? '<div class="bulkbar"><span>Mijoz bo\'yicha filtr yoqilgan</span><button class="btn btn--sm btn--ghost" data-act="clear-customer">Filtrni olib tashlash</button></div>' : "";
        if (!data.items.length) {
          var any = f.q || f.status || f.payment || f.from || f.to || f.customer;
          $("#oTable", root).innerHTML = any ? A.emptyState("search", "Buyurtma topilmadi", "Filtrlarni o'zgartirib ko'ring.") : A.emptyState("cart", "Hozircha buyurtmalar yo'q", "Sayt orqali birinchi buyurtma kelganda shu yerda paydo bo'ladi.");
          $("#oPager", root).innerHTML = "";
          return;
        }
        $("#oTable", root).innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Buyurtma</th><th>Mijoz</th><th>Mahsulotlar</th><th class="right">Summa</th><th>Holat</th><th>To\'lov</th></tr></thead><tbody>' +
          data.items.map(function (o) {
            return '<tr class="clickable" data-open="' + o.id + '"><td><div class="cell-main">' + esc(o.number) + '</div><div class="cell-sub">' + fmt.date(o.created_at) + "</div></td>" +
              '<td><div class="cell-main">' + esc(o.name) + '</div><div class="cell-sub">' + esc(fmt.phone(o.phone)) + "</div></td><td>" + itemsSummary(o.items) + "</td>" +
              '<td class="right mono nowrap"><b>' + fmt.money(o.total) + "</b></td><td>" + A.statusChip(o.status) + "</td><td>" + A.payChip(o.payment_status) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
        var pages = Math.max(1, Math.ceil(data.total / data.limit));
        $("#oPager", root).innerHTML = '<div class="pager"><span>Jami: ' + data.total + " ta · sahifa " + data.page + " / " + pages + '</span><div class="btns"><button class="btn btn--sm btn--ghost" data-page="' + (data.page - 1) + '"' + (data.page <= 1 ? " disabled" : "") + '>' + A.icon("chevl") + 'Oldingi</button><button class="btn btn--sm btn--ghost" data-page="' + (data.page + 1) + '"' + (data.page >= pages ? " disabled" : "") + ">Keyingi" + A.icon("chevr") + "</button></div></div>";
      }

      var debounced = A.debounce(function () { f.page = 1; load(); }, 250);
      $("#oq", root).addEventListener("input", function (e) { f.q = e.target.value.trim(); debounced(); });
      [["ost", "status"], ["opay", "payment"], ["ofrom", "from"], ["oto", "to"]].forEach(function (x) {
        $("#" + x[0], root).addEventListener("change", function (e) { f[x[1]] = e.target.value; f.page = 1; load(); });
      });
      $("#oClear", root).addEventListener("click", function () {
        f.q = ""; f.status = ""; f.payment = ""; f.from = ""; f.to = ""; f.customer = ""; f.page = 1;
        ["oq", "ost", "opay", "ofrom", "oto"].forEach(function (id) { $("#" + id, root).value = ""; });
        load();
      });
      root.addEventListener("click", function (e) {
        var row = e.target.closest("[data-open]");
        if (row) { A.openOrder(row.getAttribute("data-open"), load); return; }
        var pg = e.target.closest("[data-page]");
        if (pg && !pg.disabled) { f.page = Number(pg.getAttribute("data-page")); load(); return; }
        var act = e.target.closest("[data-act]");
        if (!act) return;
        var a = act.getAttribute("data-act");
        if (a === "reload") load();
        if (a === "clear-customer") { f.customer = ""; load(); }
        if (a === "export") {
          var qs = A.qs({ q: f.q, status: f.status, payment: f.payment, from: f.from, to: f.to, customer: f.customer });
          A.setBusy(act, true);
          A.download("/admin/orders/export" + qs, "yasindoors-buyurtmalar.csv").then(function () { A.toast("CSV fayl yuklab olindi"); }).catch(A.fail).then(function () { A.setBusy(act, false); act.innerHTML = A.icon("download") + "CSV eksport"; });
        }
      });
      // Yangi buyurtmalar avtomatik ko'rinadi (xavfsiz polling: tab ko'rinib turganda va oyna yopiq bo'lganda)
      var poll = setInterval(function () {
        if (!root.isConnected) { clearInterval(poll); return; }
        if (document.visibilityState !== "visible" || document.querySelector(".modal")) return;
        var prev = data.total;
        A.get("/orders" + A.qs(f)).then(function (r) {
          if (!root.isConnected) return;
          data = r; paint();
          if (r.total > prev && f.page === 1) A.toast("Новый заказ: +" + (r.total - prev));
        }).catch(function () { /* jimgina: keyingi urinishda */ });
      }, 20000);
      load().then(function () {
        if (query.open) {
          A.openOrder(query.open, load);
          history.replaceState(null, "", "#/orders" + A.qs({ q: query.q, status: query.status }));
        }
      });
    }
  };
})();
