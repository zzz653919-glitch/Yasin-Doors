/* Admin bo'limlari: Mijozlar, Kategoriyalar, Ombor, Administratorlar, Sozlamalar, Audit */
(function () {
  "use strict";
  var A = window.A, esc = A.esc, fmt = A.fmt, $ = A.$;

  /* =====================================================
     MIJOZLAR
     ===================================================== */
  A.views.customers = {
    title: "Mijozlar", icon: "users", perm: "customers.read",
    render: function (root, query) {
      var q = query.q || "", items = [];
      root.innerHTML = '<div class="page-head"><div><h1>Mijozlar</h1><p>Buyurtma bergan mijozlar. Faqat buyurtma uchun zarur ma\'lumotlar (ism, telefon, manzil) saqlanadi.</p></div></div><div class="card"><div class="toolbar"><input class="input grow" id="cq" type="search" placeholder="Ism yoki telefon bo\'yicha qidirish…" value="' + esc(q) + '" aria-label="Qidirish"></div><div id="cTable">' + A.skeleton() + "</div></div>";

      function load() {
        return A.get("/customers" + A.qs({ q: q })).then(function (r) {
          if (!root.isConnected) return;
          items = r.items; paint();
        }).catch(function (e) { $("#cTable", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message, '<button class="btn btn--gold" data-act="reload">Qayta urinish</button>'); });
      }
      function paint() {
        if (!items.length) { $("#cTable", root).innerHTML = q ? A.emptyState("search", "Mijoz topilmadi", "Boshqa ism yoki raqam bilan qidirib ko'ring.") : A.emptyState("users", "Hozircha mijozlar yo'q", "Birinchi buyurtma kelganda mijoz avtomatik qo'shiladi."); return; }
        $("#cTable", root).innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Mijoz</th><th>Telefon</th><th class="right">Buyurtmalar</th><th class="right">Xarid summasi</th><th>Oxirgi buyurtma</th></tr></thead><tbody>' +
          items.map(function (c) {
            return '<tr class="clickable" data-open="' + c.id + '"><td><div class="cell-main">' + esc(c.name) + '</div><div class="cell-sub">' + esc(c.address || "") + "</div></td><td class=\"nowrap\">" + esc(fmt.phone(c.phone)) + '</td><td class="right mono">' + c.orders_count + '</td><td class="right mono nowrap"><b>' + fmt.money(c.total_spent) + "</b></td><td>" + fmt.date(c.last_order_at, false) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      }
      $("#cq", root).addEventListener("input", A.debounce(function (e) { q = e.target.value.trim(); load(); }, 250));
      root.addEventListener("click", function (e) {
        var row = e.target.closest("[data-open]");
        if (row) openCustomer(row.getAttribute("data-open"));
        if (e.target.closest("[data-act=reload]")) load();
      });

      function openCustomer(id) {
        A.get("/customers/" + id).then(function (r) {
          var c = r.item, canW = A.can("customers.write");
          var orders = c.orders.length ? '<table class="items-tbl"><thead><tr><th>Buyurtma</th><th>Holat</th><th class="right">Summa</th></tr></thead><tbody>' +
            c.orders.map(function (o) { return '<tr><td><a href="#/orders?open=' + o.id + '" data-close-modal class="text-link"><b>' + esc(o.number) + "</b></a><br><small class=\"muted\">" + fmt.date(o.created_at) + "</small></td><td>" + A.statusChip(o.status) + '</td><td class="right mono nowrap">' + fmt.money(o.total) + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Buyurtmalar yo\'q</p>';
          var m = A.modal({
            title: c.name, size: "lg", persistent: true,
            body: '<div class="order-grid"><form id="cf" class="stack" novalidate>' +
              '<div class="field"><label for="cf-name">Ism</label><input class="input" id="cf-name" name="name" maxlength="80" value="' + esc(c.name) + '"' + (canW ? "" : " disabled") + '><span class="err"></span></div>' +
              '<div class="field"><label for="cf-phone">Telefon</label><input class="input" id="cf-phone" name="phone" value="' + esc(fmt.phone(c.phone)) + '"' + (canW ? "" : " disabled") + '><span class="err"></span></div>' +
              '<div class="field"><label for="cf-addr">Manzil</label><input class="input" id="cf-addr" name="address" maxlength="300" value="' + esc(c.address) + '"' + (canW ? "" : " disabled") + "></div>" +
              '<div class="field"><label for="cf-note">Ichki izoh</label><textarea class="textarea" id="cf-note" name="note" maxlength="500"' + (canW ? "" : " disabled") + ">" + esc(c.note) + '</textarea></div><div class="alert alert--error" id="cfErr" hidden></div></form>' +
              '<div class="stack"><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div class="card card-pad"><div class="muted">Buyurtmalar</div><div class="stat"><div class="val" style="padding:0">' + c.orders_count + '</div></div></div><div class="card card-pad"><div class="muted">Xarid summasi</div><div class="val mono" style="font-size:18px;font-weight:800">' + fmt.money(c.total_spent) + '</div></div></div><div><p class="section-title">Buyurtmalar tarixi</p>' + orders + '</div><a class="btn btn--ghost btn--sm" href="#/orders?customer=' + c.id + '" data-close-modal>Barcha buyurtmalarni ko\'rish</a></div></div>',
            actions: [{ label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } }].concat(canW ? [{
              label: "Saqlash", cls: "btn--gold", onClick: function (api, btn) {
                var fd = $("#cf", m.el).elements;
                A.setBusy(btn, true);
                A.put("/customers/" + c.id, { name: fd.name.value, phone: fd.phone.value, address: fd.address.value, note: fd.note.value }).then(function () {
                  api.close(); A.toast("Mijoz ma'lumotlari saqlandi"); load();
                }).catch(function (err) { A.setBusy(btn, false); var b = $("#cfErr", m.el); b.textContent = err.message; b.hidden = false; });
              }
            }] : [])
          });
          m.el.addEventListener("click", function (e) { if (e.target.closest("[data-close-modal]")) m.close(); });
        }).catch(A.fail);
      }
      load();
    }
  };

  /* =====================================================
     SAYT FOYDALANUVCHILARI (mijoz akkauntlari)
     ===================================================== */
  A.views.accounts = {
    title: "Sayt foydalanuvchilari", icon: "users", perm: "accounts.read",
    render: function (root, query) {
      var q = query.q || "", status = "", sort = "created_at", dir = "desc", items = [], canW = A.can("accounts.write");
      var REASON = { ok: "Muvaffaqiyatli", register: "Ro'yxatdan o'tish", bad_password: "Noto'g'ri parol", unknown_account: "Akkaunt topilmadi", blocked: "Bloklangan akkaunt", rate_limited: "Urinishlar chegarasi" };
      var COLS = [["name", "Foydalanuvchi"], [null, "Telefon"], [null, "Holat"], ["orders_count", "Buyurtmalar"], ["created_at", "Ro'yxatdan o'tgan"], ["last_login_at", "Oxirgi kirish"], ["last_seen_at", "Oxirgi faollik"]];
      root.innerHTML = '<div class="page-head"><div><h1>Sayt foydalanuvchilari</h1><p>Saytda ro\'yxatdan o\'tgan mijozlar (real bazadan). Parollar xeshlangan holda saqlanadi va hech qayerda ko\'rsatilmaydi.' + (canW ? "" : " Holatni faqat Super Admin o'zgartira oladi.") + '</p></div></div><div id="aStats"></div><div class="card"><div class="toolbar"><input class="input grow" id="aq" type="search" placeholder="Ism, email yoki telefon bo\'yicha qidirish…" value="' + esc(q) + '" aria-label="Qidirish"><select class="select" id="as" aria-label="Holat"><option value="">Barcha holatlar</option><option value="active">Faol</option><option value="blocked">Bloklangan</option></select></div><div id="aTable">' + A.skeleton() + "</div></div>";

      function ago(iso) {
        if (!iso) return "—";
        var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 2) return "hozir";
        if (m < 60) return m + " daqiqa oldin";
        if (m < 1440) return Math.floor(m / 60) + " soat oldin";
        return fmt.date(iso, false);
      }
      function load(quiet) {
        return A.get("/accounts" + A.qs({ q: q, status: status, sort: sort, dir: dir })).then(function (r) {
          if (!root.isConnected) return;
          items = r.items;
          var s = r.stats;
          $("#aStats", root).innerHTML = '<div class="grid stats" style="margin-bottom:16px">' +
            '<div class="card stat"><div class="top"><span>Jami foydalanuvchilar</span><span class="ico">' + A.icon("users") + '</span></div><div class="val">' + fmt.num(s.total) + '</div><div class="sub">Bloklangan: ' + s.blocked + "</div></div>" +
            '<div class="card stat"><div class="top"><span>Bugun ro\'yxatdan o\'tgan</span><span class="ico">' + A.icon("userplus") + '</span></div><div class="val">' + fmt.num(s.today) + '</div><div class="sub">Toshkent vaqti bo\'yicha</div></div>' +
            '<div class="card stat"><div class="top"><span>So\'nggi 7 kun</span><span class="ico">' + A.icon("trend") + '</span></div><div class="val">' + fmt.num(s.week) + '</div><div class="sub">Yangi foydalanuvchilar</div></div>' +
            '<div class="card stat"><div class="top"><span>Hozir saytda</span><span class="ico">' + A.icon("clock") + '</span></div><div class="val">' + fmt.num(s.online) + '</div><div class="sub">So\'nggi 15 daqiqada faol</div></div></div>';
          paint();
        }).catch(function (e) { if (!quiet) $("#aTable", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message, '<button class="btn btn--gold" data-act="reload">Qayta urinish</button>'); });
      }
      function paint() {
        if (!items.length) { $("#aTable", root).innerHTML = (q || status) ? A.emptyState("search", "Foydalanuvchi topilmadi", "Boshqa so'rov bilan qidirib ko'ring.") : A.emptyState("users", "Hozircha ro'yxatdan o'tganlar yo'q", "Mijozlar saytda ro'yxatdan o'tganda shu yerda ko'rinadi."); return; }
        $("#aTable", root).innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr>' + COLS.map(function (c) {
          if (!c[0]) return "<th>" + c[1] + "</th>";
          return '<th><button class="th-sort" type="button" data-sort="' + c[0] + '" style="font:inherit;color:inherit;font-weight:inherit;background:none;border:0;padding:0;cursor:pointer">' + c[1] + (sort === c[0] ? (dir === "asc" ? " ▲" : " ▼") : "") + "</button></th>";
        }).join("") + "</tr></thead><tbody>" +
          items.map(function (a) {
            return '<tr class="clickable" data-open="' + a.id + '"><td><div class="cell-main">' + esc(a.first_name + " " + a.last_name) + '</div><div class="cell-sub">' + esc(a.email) + '</div></td><td class="nowrap">' + esc(fmt.phone(a.phone)) + "</td><td>" + (a.status === "active" ? A.chip("ok", "Faol") : A.chip("bad", "Bloklangan")) + '</td><td class="right mono">' + a.orders_count + "</td><td>" + fmt.date(a.created_at) + "</td><td>" + fmt.date(a.last_login_at) + "</td><td>" + esc(ago(a.last_seen_at)) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      }

      function openProfile(id) {
        A.get("/accounts/" + id).then(function (r) {
          var a = r.item, blocked = a.status === "blocked";
          var logins = r.logins.length ? '<div class="table-wrap"><table class="items-tbl"><thead><tr><th>Vaqt</th><th>Natija</th><th>IP</th></tr></thead><tbody>' + r.logins.map(function (l) {
            return "<tr><td>" + fmt.date(l.at) + "</td><td>" + (l.success ? A.chip("ok", REASON[l.reason] || l.reason) : A.chip("bad", REASON[l.reason] || l.reason)) + '</td><td class="mono">' + esc(l.ip || "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="muted">Kirish tarixi yo\'q</p>';
          var orders = r.orders.length ? '<table class="items-tbl"><thead><tr><th>Buyurtma</th><th>Holat</th><th class="right">Summa</th></tr></thead><tbody>' + r.orders.map(function (o) {
            return '<tr><td><a href="#/orders?open=' + o.id + '" data-close-modal class="text-link"><b>' + esc(o.number) + "</b></a><br><small class=\"muted\">" + fmt.date(o.created_at) + "</small></td><td>" + A.statusChip(o.status) + '</td><td class="right mono nowrap">' + fmt.money(o.total) + "</td></tr>";
          }).join("") + "</tbody></table>" : '<p class="muted">Buyurtmalar yo\'q</p>';
          function row(k, v) { return '<div class="kv"><span class="muted">' + k + "</span><b>" + v + "</b></div>"; }
          var actions = [{ label: "Yopish", cls: "btn--ghost", onClick: function (api) { api.close(); } }];
          if (canW) {
            actions.push({ label: "Akkauntni o'chirish", cls: "btn--danger", onClick: function (api) {
              A.confirm({ title: "Akkauntni o'chirish", danger: true, confirmLabel: "O'chirish", text: esc(a.email) + " akkaunti, sevimlilari va kirish tarixi butunlay o'chiriladi. Buyurtmalar saqlanadi. Bu amalni qaytarib bo'lmaydi." }).then(function (ok) {
                if (!ok) return;
                A.del("/accounts/" + a.id).then(function () { api.close(); A.toast("Akkaunt o'chirildi"); load(); }).catch(A.fail);
              });
            } });
            actions.push({ label: blocked ? "Faollashtirish" : "Bloklash", cls: blocked ? "btn--gold" : "btn--ghost", onClick: function (api) {
              A.put("/accounts/" + a.id + "/status", { status: blocked ? "active" : "blocked" }).then(function () {
                api.close(); A.toast(blocked ? "Akkaunt faollashtirildi" : "Akkaunt bloklandi"); load();
              }).catch(A.fail);
            } });
          }
          var m = A.modal({
            title: a.first_name + " " + a.last_name, size: "lg",
            body: '<div class="order-grid"><div class="stack">' +
              row("Email", esc(a.email)) + row("Telefon", esc(fmt.phone(a.phone))) + row("Holat", blocked ? "Bloklangan" : "Faol") +
              row("Ro'yxatdan o'tgan", fmt.date(a.created_at)) + row("Shartlarga rozilik", fmt.date(a.consent_at)) +
              row("Oxirgi kirish", fmt.date(a.last_login_at)) + row("Oxirgi faollik", esc(ago(a.last_seen_at))) +
              row("Sevimlilar", r.favorites + " ta") + row("Xato urinishlar (7 kun)", String(r.failed_week)) +
              '</div><div class="stack"><div><p class="section-title">Buyurtmalar</p>' + orders + '</div><div><p class="section-title">Kirish tarixi</p>' + logins + "</div></div></div>",
            actions: actions
          });
          m.el.addEventListener("click", function (e) { if (e.target.closest("[data-close-modal]")) m.close(); });
        }).catch(A.fail);
      }

      $("#aq", root).addEventListener("input", A.debounce(function (e) { q = e.target.value.trim(); load(); }, 250));
      $("#as", root).addEventListener("change", function (e) { status = e.target.value; load(); });
      root.addEventListener("click", function (e) {
        if (e.target.closest("[data-act=reload]")) { load(); return; }
        var th = e.target.closest("[data-sort]");
        if (th) {
          var k = th.getAttribute("data-sort");
          if (sort === k) dir = dir === "asc" ? "desc" : "asc"; else { sort = k; dir = k === "name" || k === "email" ? "asc" : "desc"; }
          load(); return;
        }
        var row = e.target.closest("[data-open]");
        if (row) openProfile(row.getAttribute("data-open"));
      });
      // Yangi ro'yxatdan o'tganlar va faollik avtomatik yangilanadi
      var timer = setInterval(function () {
        if (!root.isConnected) { clearInterval(timer); return; }
        if (document.visibilityState === "visible" && !document.querySelector(".modal")) load(true);
      }, 30000);
      load();
    }
  };

  /* =====================================================
     KATEGORIYALAR
     ===================================================== */
  A.openCategoryForm = function (cat, onSaved) {
    var m = A.modal({
      title: cat ? "Kategoriyani tahrirlash" : "Yangi kategoriya", size: "sm",
      body: '<form id="catf" novalidate><div class="field"><label for="cat-name">Nomi</label><input class="input" id="cat-name" name="name" maxlength="60" value="' + esc(cat ? cat.name : "") + '" placeholder="Masalan: Ichki eshiklar"></div><div class="alert alert--error" id="catErr" hidden style="margin-top:12px"></div></form>',
      actions: [
        { label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { api.close(); } },
        { label: cat ? "Saqlash" : "Yaratish", cls: "btn--gold", onClick: function (api, btn) { submit(api, btn); } }
      ]
    });
    $("#catf", m.el).addEventListener("submit", function (e) { e.preventDefault(); submit(m, $(".modal-foot .btn--gold", m.el)); });
    function submit(api, btn) {
      if (btn.disabled) return;   // allaqachon yuborilmoqda — takroriy so'rov yuborilmaydi
      var name = $("#cat-name", m.el).value.trim();
      if (name.length < 2) { var b = $("#catErr", m.el); b.textContent = "Nomini kiriting (kamida 2 ta belgi)."; b.hidden = false; return; }
      A.setBusy(btn, true);
      (cat ? A.put("/categories/" + cat.id, { name: name }) : A.post("/categories", { name: name })).then(function () {
        api.close(); if (onSaved) onSaved();
      }).catch(function (err) { A.setBusy(btn, false); var b = $("#catErr", m.el); b.textContent = err.message; b.hidden = false; });
    }
  };

  A.views.categories = {
    title: "Kategoriyalar", icon: "tag", perm: "categories.read",
    render: function (root) {
      var items = [], canW = A.can("categories.write");
      root.innerHTML = '<div class="page-head"><div><h1>Kategoriyalar</h1><p>Mahsulotlarni guruhlash uchun kategoriyalar.</p></div><div class="head-actions">' + (canW ? '<button class="btn btn--gold" data-act="add">' + A.icon("plus") + "Yangi kategoriya</button>" : "") + '</div></div><div class="card" id="catCard">' + A.skeleton() + "</div>";
      function load() {
        return A.get("/categories").then(function (r) {
          if (!root.isConnected) return;
          items = r.items;
          $("#catCard", root).innerHTML = !items.length ? A.emptyState("tag", "Kategoriyalar yo'q", "Birinchi kategoriyani yarating, masalan «Ichki eshiklar».", canW ? '<button class="btn btn--gold" data-act="add">' + A.icon("plus") + " Yangi kategoriya</button>" : "") :
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>Nomi</th><th class="right">Mahsulotlar</th><th>Yaratilgan</th><th></th></tr></thead><tbody>' +
            items.map(function (c) { return "<tr><td class=\"cell-main\">" + esc(c.name) + '</td><td class="right mono">' + c.products_count + "</td><td>" + fmt.date(c.created_at, false) + '</td><td><div class="actions">' + (canW ? '<button class="icon-btn" data-edit="' + c.id + '" aria-label="Tahrirlash">' + A.icon("edit") + '</button><button class="icon-btn danger" data-del="' + c.id + '" aria-label="O\'chirish">' + A.icon("trash") + "</button>" : "") + "</div></td></tr>"; }).join("") + "</tbody></table></div>";
        }).catch(function (e) { $("#catCard", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message); });
      }
      root.addEventListener("click", function (e) {
        var t = e.target.closest("[data-act], [data-edit], [data-del]");
        if (!t) return;
        if (t.hasAttribute("data-act")) A.openCategoryForm(null, function () { A.toast("Kategoriya yaratildi"); load(); });
        else if (t.hasAttribute("data-edit")) A.openCategoryForm(items.filter(function (c) { return String(c.id) === t.getAttribute("data-edit"); })[0], function () { A.toast("Kategoriya saqlandi"); load(); });
        else {
          var cat = items.filter(function (c) { return String(c.id) === t.getAttribute("data-del"); })[0];
          A.confirm({ title: "Kategoriyani o'chirish", danger: true, confirmLabel: "O'chirish", text: "<b>" + esc(cat.name) + "</b> kategoriyasi o'chiriladi." + (cat.products_count ? " Undagi " + cat.products_count + " ta mahsulot kategoriyasiz qoladi (o'chirilmaydi)." : "") }).then(function (ok) {
            if (ok) A.del("/categories/" + cat.id).then(function () { A.toast("Kategoriya o'chirildi"); load(); }).catch(A.fail);
          });
        }
      });
      load();
    }
  };

  /* =====================================================
     OMBOR
     ===================================================== */
  var REASONS = { initial: "Boshlang'ich", restock: "Kirim", writeoff: "Chiqim", correction: "Tuzatish", order_deduct: "Buyurtma (chiqim)", order_restore: "Buyurtma bekor (qaytarildi)" };

  function openStockModal(p, kind, onDone) {
    var titles = { restock: "Kirim — " + p.name, writeoff: "Chiqim — " + p.name, set: "Miqdorni tuzatish — " + p.name };
    var m = A.modal({
      title: titles[kind], size: "sm",
      body: '<form id="sf" novalidate><p class="muted" style="margin-bottom:14px">Hozir omborda: <b>' + p.stock + ' dona</b></p><div class="stack">' +
        '<div class="field"><label for="sf-val">' + (kind === "set" ? "Yangi miqdor" : "Miqdor (dona)") + '</label><input class="input" id="sf-val" name="value" inputmode="numeric" autocomplete="off"></div>' +
        '<div class="field"><label for="sf-note">Izoh (ixtiyoriy)</label><input class="input" id="sf-note" name="note" maxlength="300" placeholder="Masalan: yangi partiya, brak, inventarizatsiya"></div>' +
        '<div class="alert alert--error" id="sfErr" hidden></div></div></form>',
      actions: [{ label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { api.close(); } }, { label: "Saqlash", cls: "btn--gold", onClick: function (api, btn) { submit(api, btn); } }]
    });
    $("#sf", m.el).addEventListener("submit", function (e) { e.preventDefault(); submit(m, $(".modal-foot .btn--gold", m.el)); });
    function submit(api, btn) {
      if (btn.disabled) return;   // allaqachon yuborilmoqda — takroriy so'rov yuborilmaydi
      var raw = $("#sf-val", m.el).value.replace(/\s/g, ""), v = Number(raw), err = $("#sfErr", m.el);
      if (raw === "" || !Number.isInteger(v) || v < (kind === "set" ? 0 : 1)) { err.textContent = kind === "set" ? "0 yoki undan katta butun son kiriting." : "Musbat butun son kiriting."; err.hidden = false; return; }
      var body = { product_id: p.id, note: $("#sf-note", m.el).value };
      if (kind === "restock") { body.mode = "delta"; body.value = v; body.reason = "restock"; }
      if (kind === "writeoff") { body.mode = "delta"; body.value = -v; body.reason = "writeoff"; }
      if (kind === "set") { body.mode = "set"; body.value = v; body.reason = "correction"; }
      A.setBusy(btn, true);
      A.post("/inventory/adjust", body).then(function (r) { api.close(); A.toast(r.delta ? "Ombor yangilandi: " + (r.delta > 0 ? "+" : "") + r.delta + " dona" : "O'zgarish yo'q"); onDone(); })
        .catch(function (e) { A.setBusy(btn, false); err.textContent = e.message; err.hidden = false; });
    }
  }

  A.views.inventory = {
    title: "Ombor", icon: "warehouse", perm: "inventory.read",
    render: function (root, query) {
      var tab = query.tab === "history" ? "history" : "stock", filter = query.stock || "", items = [], moves = [], productFilter = query.product || "";
      var canAdj = A.can("inventory.adjust");
      root.innerHTML = '<div class="page-head"><div><h1>Ombor</h1><p>Mahsulot zaxirasi, kirim-chiqim va o\'zgarishlar tarixi.</p></div><div class="seg" role="tablist"><button type="button" data-tab="stock" class="' + (tab === "stock" ? "is-active" : "") + '">Zaxira</button><button type="button" data-tab="history" class="' + (tab === "history" ? "is-active" : "") + '">Harakatlar tarixi</button></div></div><div id="invBanner"></div><div class="card" id="invCard">' + A.skeleton() + "</div>";

      function loadStock() {
        return A.get("/inventory").then(function (r) {
          if (!root.isConnected) return;
          items = r.items;
          var low = items.filter(function (p) { return p.active && p.stock <= p.low_stock; }).length;
          $("#invBanner", root).innerHTML = low ? '<div class="alert alert--warn" style="margin-bottom:16px">' + A.icon("warehouse") + "<div><b>" + low + " ta mahsulot</b> omborda kam qolgan yoki tugagan.</div></div>" : "";
          var list = items.filter(function (p) { return !filter || (filter === "low" ? p.stock <= p.low_stock : p.stock === 0); });
          var card = $("#invCard", root);
          if (!items.length) { card.innerHTML = A.emptyState("box", "Mahsulotlar yo'q", "Avval Mahsulotlar bo'limida eshik qo'shing."); return; }
          card.innerHTML = '<div class="toolbar"><select class="select" id="invf" aria-label="Filtr"><option value="">Hammasi</option><option value="low">Kam qolgan</option><option value="out">Tugagan</option></select></div>' +
            (!list.length ? A.emptyState("check", "Hammasi yetarli", "Filtrga mos mahsulot yo'q.") : '<div class="table-wrap"><table class="tbl"><thead><tr><th>Mahsulot</th><th class="right">Qoldiq</th><th>Holat</th><th class="right">Chegara</th><th></th></tr></thead><tbody>' +
              list.map(function (p) {
                var chip = p.stock <= 0 ? A.chip("bad", "Tugagan") : p.stock <= p.low_stock ? A.chip("low", "Kam qolgan") : A.chip("ok", "Yetarli");
                return "<tr><td><div class=\"cell-product\"><img class=\"thumb\" data-fb loading=\"lazy\" src=\"" + esc(A.imgSrc(p.image)) + '" alt=""><div><div class="cell-main">' + esc(p.name) + '</div><div class="cell-sub">' + (p.active ? "" : "Nofaol · ") + esc(p.category_name || "Kategoriyasiz") + '</div></div></div></td><td class="right mono"><b>' + p.stock + "</b></td><td>" + chip + '</td><td class="right mono">' + p.low_stock + '</td><td><div class="actions">' +
                  (canAdj ? '<button class="btn btn--sm btn--ghost" data-stock="restock" data-id="' + esc(p.id) + '">+ Kirim</button><button class="btn btn--sm btn--ghost" data-stock="writeoff" data-id="' + esc(p.id) + '">− Chiqim</button><button class="icon-btn" data-stock="set" data-id="' + esc(p.id) + '" aria-label="Miqdorni tuzatish">' + A.icon("edit") + "</button>" : "") +
                  '<button class="icon-btn" data-hist="' + esc(p.id) + '" aria-label="Tarix">' + A.icon("clock") + "</button></div></td></tr>";
              }).join("") + "</tbody></table></div>");
          var sel = $("#invf", root); if (sel) sel.value = filter;
          A.fallbackImg(root);
        }).catch(function (e) { $("#invCard", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message); });
      }
      function loadHistory() {
        return A.get("/inventory/movements" + A.qs({ product: productFilter })).then(function (r) {
          if (!root.isConnected) return;
          moves = r.items;
          $("#invBanner", root).innerHTML = productFilter ? '<div class="alert alert--info" style="margin-bottom:16px">' + A.icon("info") + '<div>Bitta mahsulot tarixi ko\'rsatilmoqda. <a href="#/inventory?tab=history" data-clear-pf>Hammasini ko\'rsatish</a></div></div>' : "";
          $("#invCard", root).innerHTML = !moves.length ? A.emptyState("clock", "Harakatlar yo'q", "Kirim, chiqim va buyurtmalar tufayli ombor o'zgarganda shu yerda ko'rinadi.") :
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>Sana</th><th>Mahsulot</th><th class="right">O\'zgarish</th><th class="right">Qoldiq</th><th>Sabab</th><th>Kim</th></tr></thead><tbody>' +
            moves.map(function (m) { return "<tr><td class=\"nowrap\">" + fmt.date(m.at) + '</td><td class="cell-main">' + esc(m.product_name) + '</td><td class="right mono"><b style="color:' + (m.delta > 0 ? "var(--ok)" : "var(--danger)") + '">' + (m.delta > 0 ? "+" : "") + m.delta + '</b></td><td class="right mono">' + m.balance_after + "</td><td>" + esc(REASONS[m.reason] || m.reason) + (m.note ? '<div class="cell-sub">' + esc(m.note) + "</div>" : "") + "</td><td>" + esc(m.username || "—") + "</td></tr>"; }).join("") + "</tbody></table></div>";
        }).catch(function (e) { $("#invCard", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message); });
      }
      function load() { return tab === "history" ? loadHistory() : loadStock(); }

      root.addEventListener("click", function (e) {
        var tb = e.target.closest("[data-tab]");
        if (tb) { tab = tb.getAttribute("data-tab"); $$tabs(); $("#invCard", root).innerHTML = A.skeleton(); load(); return; }
        var st = e.target.closest("[data-stock]");
        if (st) { var p = items.filter(function (x) { return x.id === st.getAttribute("data-id"); })[0]; openStockModal(p, st.getAttribute("data-stock"), load); return; }
        var h = e.target.closest("[data-hist]");
        if (h) { productFilter = h.getAttribute("data-hist"); tab = "history"; $$tabs(); load(); return; }
        if (e.target.closest("[data-clear-pf]")) { e.preventDefault(); productFilter = ""; load(); }
      });
      root.addEventListener("change", function (e) { if (e.target.id === "invf") { filter = e.target.value; loadStock(); } });
      function $$tabs() { A.$$("[data-tab]", root).forEach(function (b) { b.classList.toggle("is-active", b.getAttribute("data-tab") === tab); }); }
      load();
    }
  };

  /* =====================================================
     ADMINISTRATORLAR
     ===================================================== */
  A.views.users = {
    title: "Administratorlar", icon: "shield", perm: "users.manage",
    render: function (root) {
      var items = [], roles = [];
      root.innerHTML = '<div class="page-head"><div><h1>Administratorlar</h1><p>Admin panelga kirish huquqi va rollar. Barcha o\'zgarishlar parol bilan tasdiqlanadi va audit logga yoziladi.</p></div><div class="head-actions"><button class="btn btn--gold" data-act="add">' + A.icon("userplus") + 'Administrator qo\'shish</button></div></div><div class="card" id="uCard">' + A.skeleton() + '</div><div class="card card-pad" style="margin-top:16px"><p class="section-title">Rollar</p><div class="guide"><b>Super Admin</b> — barcha amallar, foydalanuvchilar va sozlamalar. <b>Manager</b> — mahsulot, kategoriya, buyurtma, mijoz va ombor (sozlamalarni faqat ko\'radi). <b>Operator</b> — buyurtmalar holatini yuritish, mijoz va mahsulotlarni ko\'rish.</div></div>';
      function load() {
        return A.get("/users").then(function (r) {
          if (!root.isConnected) return;
          items = r.items; roles = r.roles;
          $("#uCard", root).innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Foydalanuvchi</th><th>Rol</th><th>Holat</th><th>Oxirgi kirish</th><th></th></tr></thead><tbody>' +
            items.map(function (u) {
              return '<tr><td><div class="cell-main">' + esc(u.name) + '</div><div class="cell-sub">@' + esc(u.username) + "</div></td><td>" + esc((roles.filter(function (x) { return x.key === u.role; })[0] || {}).label || u.role) + "</td><td>" + (u.active ? A.chip("ok", "Faol") : A.chip("off", "Nofaol")) + "</td><td>" + fmt.date(u.last_login_at) + '</td><td><div class="actions"><button class="icon-btn" data-edit="' + u.id + '" aria-label="Tahrirlash">' + A.icon("edit") + '</button><button class="icon-btn" data-pw="' + u.id + '" aria-label="Parolni tiklash">' + A.icon("key") + "</button></div></td></tr>";
            }).join("") + "</tbody></table></div>";
        }).catch(function (e) { $("#uCard", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message); });
      }
      function roleOpts(sel) { return roles.map(function (r) { return '<option value="' + r.key + '"' + (r.key === sel ? " selected" : "") + ">" + esc(r.label) + "</option>"; }).join(""); }

      function userForm(u) {
        var isEdit = !!u;
        var m = A.modal({
          title: isEdit ? "Foydalanuvchini tahrirlash" : "Yangi administrator", size: "sm", persistent: true,
          body: '<form id="uf" novalidate class="stack">' +
            (isEdit ? "" : '<div class="field"><label for="uf-user">Login</label><input class="input" id="uf-user" name="username" autocomplete="off" autocapitalize="off" maxlength="40"><span class="hint">Harf, raqam, nuqta, chiziq (3–40 belgi)</span></div>') +
            '<div class="field"><label for="uf-name">To\'liq ism</label><input class="input" id="uf-name" name="name" maxlength="80" value="' + esc(u ? u.name : "") + '"></div>' +
            '<div class="field"><label for="uf-role">Rol</label><select class="select" id="uf-role" name="role">' + roleOpts(u ? u.role : "operator") + "</select></div>" +
            (isEdit ? '<label class="check"><input type="checkbox" name="active"' + (u.active ? " checked" : "") + "> Faol (kira oladi)</label>" : '<div class="field"><label for="uf-pw">Parol</label><input class="input" id="uf-pw" name="password" type="password" autocomplete="new-password"><span class="hint">Kamida 10 belgi, harf va raqam</span></div>') +
            '<div class="alert alert--error" id="ufErr" hidden></div></form>',
          actions: [{ label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { api.close(); } }, { label: isEdit ? "Saqlash" : "Yaratish", cls: "btn--gold", onClick: function (api, btn) { submit(api, btn); } }]
        });
        $("#uf", m.el).addEventListener("submit", function (e) { e.preventDefault(); submit(m, $(".modal-foot .btn--gold", m.el)); });
        function submit(api, btn) {
      if (btn.disabled) return;   // allaqachon yuborilmoqda — takroriy so'rov yuborilmaydi
          var fd = $("#uf", m.el).elements, body = { name: fd.name.value, role: fd.role.value };
          if (isEdit) body.active = fd.active.checked; else { body.username = fd.username.value; body.password = fd.password.value; }
          A.setBusy(btn, true);
          (isEdit ? A.put("/users/" + u.id, body) : A.post("/users", body)).then(function () { api.close(); A.toast(isEdit ? "Foydalanuvchi saqlandi" : "Administrator yaratildi"); load(); })
            .catch(function (err) { A.setBusy(btn, false); var b = $("#ufErr", m.el); b.textContent = err.message; b.hidden = false; });
        }
      }
      function pwForm(u) {
        var m = A.modal({
          title: "Parolni tiklash — @" + u.username, size: "sm", persistent: true,
          body: '<form id="pwf" novalidate class="stack"><div class="field"><label for="pw-new">Yangi parol</label><input class="input" id="pw-new" name="password" type="password" autocomplete="new-password"><span class="hint">Kamida 10 belgi, harf va raqam. Foydalanuvchining barcha sessiyalari tugatiladi.</span></div><div class="alert alert--error" id="pwErr" hidden></div></form>',
          actions: [{ label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { api.close(); } }, { label: "Yangilash", cls: "btn--gold", onClick: function (api, btn) { submit(api, btn); } }]
        });
        $("#pwf", m.el).addEventListener("submit", function (e) { e.preventDefault(); submit(m, $(".modal-foot .btn--gold", m.el)); });
        function submit(api, btn) {
      if (btn.disabled) return;   // allaqachon yuborilmoqda — takroriy so'rov yuborilmaydi
          A.setBusy(btn, true);
          A.post("/users/" + u.id + "/password", { password: $("#pw-new", m.el).value }).then(function () { api.close(); A.toast("Parol yangilandi"); })
            .catch(function (err) { A.setBusy(btn, false); var b = $("#pwErr", m.el); b.textContent = err.message; b.hidden = false; });
        }
      }
      root.addEventListener("click", function (e) {
        var t = e.target.closest("[data-act], [data-edit], [data-pw]");
        if (!t) return;
        if (t.hasAttribute("data-act")) userForm(null);
        else { var u = items.filter(function (x) { return String(x.id) === (t.getAttribute("data-edit") || t.getAttribute("data-pw")); })[0]; if (t.hasAttribute("data-edit")) userForm(u); else pwForm(u); }
      });
      load();
    }
  };

  /* =====================================================
     SOZLAMALAR
     ===================================================== */
  /** 3D konstruktor narx qoidalari: bo'sh maydon = "narx noma'lum" (mijozga "Narx so'raladi" ko'rsatiladi) */
  function cfgPricesHTML(raw, dis) {
    if (!window.YD_CFG) return "";
    var rules = window.YD_CFG.sanitizeRules(raw || "").rules;
    return '<p class="section-title" style="margin-top:8px">3D konstruktor narxlari</p>' +
      '<p class="muted" style="font-size:13px;margin:0 0 8px">Faqat siz kiritgan narxlar ishlatiladi. Narx hisoblanishi uchun tanlangan har bir qism uchun qiymat kerak; <b>bo\'sh qoldirilsa</b> mijozga «Narx so\'raladi» ko\'rsatiladi (narx taxmin qilinmaydi). Standart o\'lchamdagi 1 dona uchun so\'mda yozing; qo\'shimcha bo\'lmasa <b>0</b> kiriting.</p>' +
      window.YD_CFG.PRICE_FIELDS.map(function (g) {
        return '<fieldset class="cfgp"><legend>' + esc(g.label) + '</legend><div class="form-grid">' + g.items.map(function (it) {
          var v = rules[g.group] && rules[g.group][it.key] !== undefined ? rules[g.group][it.key] : "";
          return '<div class="field"><label for="cfgp-' + g.group + '-' + it.key + '">' + esc(it.label) + '</label><input class="input" inputmode="numeric" data-cfgp="' + g.group + '.' + it.key + '" id="cfgp-' + g.group + '-' + it.key + '" value="' + esc(v) + '"' + dis + ' placeholder="Narx noma\'lum"></div>';
        }).join("") + "</div></fieldset>";
      }).join("");
  }
  function collectCfgPrices(form) {
    var rules = {}, error = "";
    [].slice.call(form.querySelectorAll("[data-cfgp]")).forEach(function (el) {
      var v = el.value.replace(/\s/g, ""); if (v === "") return;
      if (!/^\d{1,10}$/.test(v) || Number(v) > 1000000000) { error = "Konstruktor narxi noto'g'ri: «" + el.value + "». Faqat butun son kiriting."; return; }
      var p = el.getAttribute("data-cfgp").split(".");
      (rules[p[0]] = rules[p[0]] || {})[p[1]] = Number(v);
    });
    return { rules: rules, error: error };
  }

  A.views.settings = {
    title: "Sozlamalar", icon: "settings", perm: "settings.read",
    render: function (root) {
      var canW = A.can("settings.write");
      root.innerHTML = '<div class="page-head"><div><h1>Sozlamalar</h1><p>Do\'kon ma\'lumotlari saytda ko\'rinadi. Bo\'sh qoldirilgan maydonlar saytda «Tez orada qo\'shiladi» deb ko\'rsatiladi — ma\'lumotni o\'zingiz kiriting.</p></div></div><div id="sBody">' + A.skeleton() + "</div>";
      A.get("/settings").then(function (r) {
        if (!root.isConnected) return;
        var s = r.settings, tg = r.telegram, logo = s.logo || "";
        var dis = canW ? "" : " disabled";
        function inp(name, label, opts) { opts = opts || {}; return '<div class="field' + (opts.full ? " full" : "") + '"><label for="s-' + name + '">' + label + '</label>' + (opts.area ? '<textarea class="textarea" id="s-' + name + '" name="' + name + '" maxlength="' + (opts.max || 1500) + '"' + dis + ">" + esc(s[name]) + "</textarea>" : '<input class="input" id="s-' + name + '" name="' + name + '" maxlength="' + (opts.max || 200) + '" value="' + esc(s[name]) + '"' + dis + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + ">") + (opts.hint ? '<span class="hint">' + opts.hint + "</span>" : "") + "</div>"; }
        $("#sBody", root).innerHTML = '<div class="settings-grid"><form id="sf" class="card card-pad stack" novalidate><p class="section-title">Do\'kon</p><div class="form-grid">' +
          inp("store_name", "Do'kon nomi", { max: 80 }) +
          '<div class="field"><label>Valyuta</label><input class="input" value="UZS (so\'m)" disabled></div>' +
          inp("phone", "Telefon raqami", { ph: "+998 90 123 45 67", max: 30 }) + inp("email", "Email", { max: 120 }) +
          inp("address", "Manzil", { full: true, max: 300 }) + inp("work_hours", "Ish vaqti", { full: true, max: 120, ph: "Masalan: Du–Sha, 9:00–19:00" }) +
          '<div class="field full"><span class="label">Logotip</span><div class="img-up"><div class="preview" id="sLogoPrev" style="width:72px;height:72px">' + (logo ? '<img src="' + esc(A.imgSrc(logo)) + '" alt="" style="object-fit:contain">' : A.icon("image")) + '</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + (canW ? '<button class="btn btn--ghost btn--sm" type="button" id="sLogoPick">Logotip yuklash</button><button class="btn btn--ghost btn--sm" type="button" id="sLogoClear"' + (logo ? "" : " hidden") + '>Olib tashlash</button><input type="file" id="sLogoFile" accept="image/jpeg,image/png,image/webp" hidden>' : "") + '</div></div><span class="hint">Saytdagi logotip belgisi o\'rnida ko\'rinadi (kvadrat, shaffof PNG yaxshi).</span></div></div>' +
          '<p class="section-title" style="margin-top:8px">Sayt matnlari va shartlar</p><div class="form-grid">' +
          inp("hero_subtitle", "Bosh sahifa qisqa tavsifi", { full: true, max: 300, hint: "Bo'sh bo'lsa standart matn ko'rsatiladi." }) +
          inp("footer_about", "Footer qisqa matni", { full: true, max: 300 }) +
          inp("delivery_terms", "Yetkazib berish shartlari", { full: true, area: true, hint: "«Biz haqimizda» sahifasida ko'rinadi. Faqat tasdiqlangan ma'lumotni kiriting." }) +
          inp("warranty_info", "Kafolat haqidagi ma'lumot", { full: true, area: true, hint: "Faqat haqiqiy, rasman mavjud kafolat shartlarini yozing." }) +
          '</div>' + cfgPricesHTML(s.cfg_prices, dis) + '<div class="alert alert--error" id="sErr" hidden></div>' + (canW ? '<div><button class="btn btn--gold" type="submit" id="sSave">Saqlash</button></div>' : '<div class="alert alert--info">' + A.icon("info") + "Sozlamalarni faqat Super Admin o'zgartira oladi.</div>") + "</form>" +
          '<div class="stack"><div class="card card-pad stack"><p class="section-title">Telegram bildirishnomalari</p>' +
          '<div class="row-between"><div><b>Holat</b><div class="muted" style="font-size:13px">Server muhit o\'zgaruvchilari</div></div>' + (tg.configured ? A.chip("ok", "Sozlangan") : tg.dryRun ? A.chip("low", "Sinov rejimi") : A.chip("bad", "Sozlanmagan")) + "</div>" +
          '<div class="row-between"><label for="s-tg" style="font-weight:700">Yangi buyurtma haqida xabar yuborish</label><span class="switch"><input type="checkbox" id="s-tg"' + (s.telegram_enabled !== "0" ? " checked" : "") + (canW ? "" : " disabled") + '><span></span></span></div>' +
          (canW ? '<div><button class="btn btn--ghost btn--sm" id="sTgTest">' + A.icon("telegram") + "Sinov xabarini yuborish</button></div>" : "") +
          (!tg.configured ? '<div class="alert alert--warn">' + A.icon("alert") + "<div>Bot tokeni va chat ID serverda sozlanmagan. Quyidagi yo'riqnomadan foydalaning. Sozlanmaguncha qolgan hamma funksiyalar ishlayveradi.</div></div>" : "") +
          '<div class="guide"><b>Sozlash yo\'riqnomasi</b><ol><li>Telegram\'da <span class="code">@BotFather</span> → <span class="code">/newbot</span> → bot yarating va tokenni nusxalang.</li><li>Botga biror xabar yozing (guruh bo\'lsa, botni guruhga qo\'shing), so\'ng brauzerda <span class="code">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> ni oching va <span class="code">chat.id</span> qiymatini toping.</li><li>Vercel → loyiha → <b>Settings → Environment Variables</b>: <span class="code">TELEGRAM_BOT_TOKEN</span> va <span class="code">TELEGRAM_CHAT_ID</span> ni qo\'shing (lokal ishlashda <span class="code">.env</span> fayliga).</li><li>Loyihani qayta deploy qiling (lokalda serverni qayta ishga tushiring) va «Sinov xabarini yuborish» tugmasini bosing.</li></ol><p class="muted" style="margin-top:8px">Token hech qachon brauzerga yoki shu panelga chiqmaydi — faqat serverda saqlanadi.</p></div></div>' +
          '<div class="card card-pad stack"><p class="section-title">Ko\'rinish</p><div class="row-between"><span style="font-weight:700">Yorug\' / qorong\'i rejim</span><button class="btn btn--ghost btn--sm" id="sTheme">Almashtirish</button></div><p class="muted" style="font-size:13px">Tanlov shu brauzerda saqlanadi.</p></div></div></div>';

        var form = $("#sf", root);
        if (canW) {
          $("#sLogoPick", root).addEventListener("click", function () { $("#sLogoFile", root).click(); });
          $("#sLogoClear", root).addEventListener("click", function () { logo = ""; prev(); });
          $("#sLogoFile", root).addEventListener("change", function (e) {
            var f = e.target.files[0]; if (!f) return;
            $("#sLogoPrev", root).innerHTML = '<span class="spinner"></span>';
            A.uploadImage(f).then(function (url) { logo = url; }).catch(A.fail).then(function () { prev(); e.target.value = ""; });
          });
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            var fd = form.elements, body = { logo: logo };
            ["store_name", "phone", "email", "address", "work_hours", "hero_subtitle", "footer_about", "delivery_terms", "warranty_info"].forEach(function (k) { body[k] = fd[k].value; });
            var cp = collectCfgPrices(form);
            if (cp.error) { var eb = $("#sErr", root); eb.textContent = cp.error; eb.hidden = false; return; }
            body.cfg_prices = JSON.stringify(cp.rules);
            var btn = $("#sSave", root); if (btn.disabled) return; A.setBusy(btn, true); $("#sErr", root).hidden = true;
            A.put("/settings", body).then(function () { A.toast("Sozlamalar saqlandi"); }).catch(function (err) { var b = $("#sErr", root); b.textContent = err.message; b.hidden = false; }).then(function () { A.setBusy(btn, false); });
          });
          $("#s-tg", root).addEventListener("change", function (e) {
            var on = e.target.checked;
            A.put("/settings", { telegram_enabled: on }).then(function () { A.toast(on ? "Telegram bildirishnomalari yoqildi" : "Telegram bildirishnomalari o'chirildi"); }).catch(function (err) { e.target.checked = !on; A.fail(err); });
          });
          $("#sTgTest", root).addEventListener("click", function (e) {
            var btn = e.currentTarget; A.setBusy(btn, true);
            A.post("/settings/telegram-test").then(function (r) {
              if (r.sent) A.toast("Sinov xabari yuborildi");
              else A.toast(r.reason === "not_configured" ? "Telegram sozlanmagan: TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID kerak" : r.reason === "dry_run" ? "Sinov rejimi (ORDER_DRY_RUN) yoqilgan — xabar server konsoliga yozildi" : "Xabar yuborilmadi. Token va chat ID ni tekshiring.", r.sent ? "ok" : "error");
            }).catch(A.fail).then(function () { A.setBusy(btn, false); btn.innerHTML = A.icon("telegram") + "Sinov xabarini yuborish"; });
          });
        }
        function prev() { $("#sLogoPrev", root).innerHTML = logo ? '<img src="' + esc(A.imgSrc(logo)) + '" alt="" style="object-fit:contain">' : A.icon("image"); $("#sLogoClear", root).hidden = !logo; }
        $("#sTheme", root).addEventListener("click", function () { A.toggleTheme(); });
      }).catch(function (e) { $("#sBody", root).innerHTML = '<div class="card">' + A.emptyState("alert", "Yuklab bo'lmadi", e.message) + "</div>"; });
    }
  };

  /* =====================================================
     AUDIT LOG
     ===================================================== */
  A.views.audit = {
    title: "Audit log", icon: "log", perm: "audit.read",
    render: function (root) {
      var q = "";
      root.innerHTML = '<div class="page-head"><div><h1>Audit log</h1><p>Muhim amallar tarixi: kim, qachon va nima qilgan. Parollar va maxfiy ma\'lumotlar yozilmaydi.</p></div></div><div class="card"><div class="toolbar"><input class="input grow" id="aq" type="search" placeholder="Foydalanuvchi, amal yoki ID…" aria-label="Qidirish"></div><div id="aTable">' + A.skeleton() + "</div></div>";
      function load() {
        return A.get("/audit" + A.qs({ q: q })).then(function (r) {
          if (!root.isConnected) return;
          $("#aTable", root).innerHTML = !r.items.length ? A.emptyState("log", "Yozuvlar yo'q", "Hali muhim amallar bajarilmagan.") :
            '<div class="table-wrap"><table class="tbl"><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Amal</th><th>Obyekt</th><th>Tafsilot</th><th>IP</th></tr></thead><tbody>' +
            r.items.map(function (a) {
              var detail = ""; try { detail = a.detail ? Object.entries(JSON.parse(a.detail)).map(function (kv) { return kv[0] + ": " + (typeof kv[1] === "object" ? JSON.stringify(kv[1]) : kv[1]); }).join(" · ") : ""; } catch (e) { detail = a.detail || ""; }
              return '<tr><td class="nowrap">' + fmt.date(a.at) + "</td><td>" + esc(a.username || "—") + '</td><td><span class="tag" style="margin:0">' + esc(a.action) + "</span></td><td>" + esc((a.entity || "") + (a.entity_id ? " #" + a.entity_id : "")) + '</td><td class="cell-sub" style="max-width:340px;word-break:break-word">' + esc(detail) + '</td><td class="muted nowrap">' + esc(a.ip || "") + "</td></tr>";
            }).join("") + "</tbody></table></div>";
        }).catch(function (e) { $("#aTable", root).innerHTML = A.emptyState("alert", "Yuklab bo'lmadi", e.message); });
      }
      $("#aq", root).addEventListener("input", A.debounce(function (e) { q = e.target.value.trim(); load(); }, 250));
      load();
    }
  };
})();
