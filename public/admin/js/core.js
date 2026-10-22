/* =========================================================
   YasinDoors Admin — yadro: API, holat, UI primitivlar, grafiklar
   Hamma dinamik matn esc() orqali ekranlanadi (XSS'dan himoya); CSP inline skriptga ruxsat bermaydi.
   ========================================================= */
(function () {
  "use strict";

  var A = window.A = { views: {}, state: { user: null, csrf: "", perms: [], telegram: null } };

  /* ---------- Yordamchilar ---------- */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  A.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  var esc = A.esc;
  A.$ = function (sel, root) { return (root || document).querySelector(sel); };
  A.$$ = function (sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); };
  A.can = function (perm) { return A.state.perms.indexOf("*") !== -1 || A.state.perms.indexOf(perm) !== -1; };
  A.debounce = function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; };

  A.fmt = {
    num: function (n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); },
    money: function (n) { return A.fmt.num(n) + " so'm"; },
    date: function (iso, withTime) {
      if (!iso) return "—";
      try {
        var o = { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" };
        if (withTime !== false) { o.hour = "2-digit"; o.minute = "2-digit"; }
        return new Date(iso).toLocaleString("ru-RU", o).replace(",", "");
      } catch (e) { return String(iso); }
    },
    phone: function (p) {
      var d = String(p || "").replace(/\D/g, "");
      return /^998\d{9}$/.test(d) ? "+998 " + d.substr(3, 2) + " " + d.substr(5, 3) + " " + d.substr(8, 2) + " " + d.substr(10, 2) : (p || "");
    }
  };

  /* ---------- Holat nomlari ---------- */
  A.STATUS = { new: "Yangi", accepted: "Tasdiqlandi", preparing: "Tayyorlanmoqda", delivering: "Yetkazilmoqda", completed: "Yakunlandi", cancelled: "Bekor qilindi" };
  A.PAYMENT = { unpaid: "To'lanmagan", paid: "To'langan", refunded: "Qaytarilgan" };
  A.DELIVERY = { pending: "Kutilmoqda", in_transit: "Yo'lda", delivered: "Yetkazildi", cancelled: "Bekor" };
  A.STATUS_COLORS = { new: "#d19a2b", accepted: "#3b82c4", preparing: "#8b5cf6", delivering: "#14a89b", completed: "#3fa66b", cancelled: "#d9534f" };
  A.chip = function (kind, label) { return '<span class="chip ' + esc(kind) + '">' + esc(label) + "</span>"; };
  A.statusChip = function (s) { return A.chip(s, A.STATUS[s] || s); };
  A.payChip = function (s) { return A.chip(s, A.PAYMENT[s] || s); };
  A.COLORS = (window.YD_DATA && window.YD_DATA.COLORS) || {};
  A.STYLES = (window.YD_DATA && window.YD_DATA.STYLES) || {};

  /* ---------- Ikonkalar ---------- */
  var ICONS = {
    dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 8h6V4h-6z"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.5L12 12.5l8.7-5M12 22V12.5"/>',
    cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-3-5.5"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    warehouse: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M8 20v-6h8v6M8 14h8"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    log: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21a2 2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
    logout: '<path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    telegram: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    chevl: '<path d="M15 6l-6 6 6 6"/>', chevr: '<path d="M9 6l6 6-6 6"/>'
  };
  A.icon = function (n, cls) { return '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  A.injectSprite = function () {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">';
    Object.keys(ICONS).forEach(function (k) { s += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + "</symbol>"; });
    document.body.insertAdjacentHTML("afterbegin", s + "</svg>");
  };

  /* ---------- API ---------- */
  A.onUnauthorized = function () {};
  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = A.state.csrf;
    // 30 soniyada javob kelmasa so'rov to'xtatiladi — tugma cheksiz "yuklanmoqda" holatida qolib ketmasin
    var ctrl = window.AbortController ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, 30000);
    return fetch("/api" + path, { method: method, headers: headers, credentials: "same-origin", signal: ctrl ? ctrl.signal : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (res) {
        clearTimeout(timer);
        if (opts.blob && res.ok) return res.blob();
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.ok) return data;
          var err = new Error((data && typeof data.error === "string" && data.error) || (data && data.error && data.error.message) || "So'rovda xatolik (" + res.status + ")");
          err.status = res.status; err.data = data || {};
          throw err;
        });
      }, function () {
        clearTimeout(timer);
        var err = new Error(timedOut ? "Server javob bermadi (30 soniya). Birozdan so'ng qayta urinib ko'ring." : "Serverga ulanib bo'lmadi. Internet aloqasini tekshiring.");
        err.network = true;
        throw err;
      });
  }
  /** API chaqiruvi. Qayta tasdiqlash (parol) kerak bo'lsa — oyna chiqaradi va so'rovni bir marta takrorlaydi. */
  A.api = function (method, path, body, opts) {
    return request(method, path, body, opts).catch(function (err) {
      if (err.status === 401 && path.indexOf("/auth/login") === -1) { A.onUnauthorized(); throw err; }
      if (err.status === 403 && err.data && err.data.code === "reauth_required") {
        return A.askPassword().then(function (pw) {
          if (pw == null) throw err;
          return request("POST", "/admin/auth/reauth", { password: pw }).then(function () { return request(method, path, body, opts); });
        });
      }
      throw err;
    });
  };
  var P = "/admin";
  A.get = function (path) { return A.api("GET", P + path); };
  A.post = function (path, body) { return A.api("POST", P + path, body || {}); };
  A.put = function (path, body) { return A.api("PUT", P + path, body || {}); };
  A.patch = function (path, body) { return A.api("PATCH", P + path, body || {}); };
  A.del = function (path) { return A.api("DELETE", P + path); };
  A.qs = function (obj) {
    var p = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) { if (obj[k] !== "" && obj[k] != null) p.set(k, obj[k]); });
    var s = p.toString();
    return s ? "?" + s : "";
  };

  /* ---------- Toast ---------- */
  A.toast = function (msg, type) {
    var root = A.$("#toastRoot");
    var el = document.createElement("div");
    el.className = "toast " + (type || "ok");
    el.innerHTML = A.icon(type === "error" ? "alert" : "check") + "<span>" + esc(msg) + "</span>";
    root.appendChild(el);
    while (root.children.length > 4) root.removeChild(root.firstChild);
    setTimeout(function () { el.classList.add("leaving"); setTimeout(function () { el.remove(); }, 260); }, type === "error" ? 5200 : 3000);
  };
  A.fail = function (err) { A.toast(err && err.message ? err.message : "Xatolik yuz berdi", "error"); };

  /* ---------- Modal ---------- */
  var modalStack = [];
  A.modal = function (opts) {
    var back = document.createElement("div");
    back.className = "modal-back";
    var id = "m" + Math.random().toString(36).slice(2, 8);
    back.innerHTML = '<div class="modal ' + (opts.size || "") + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
      '<div class="modal-head"><h2 id="' + id + '">' + esc(opts.title || "") + '</h2><button class="icon-btn" type="button" data-close aria-label="Yopish">' + A.icon("close") + "</button></div>" +
      '<div class="modal-body">' + (opts.body || "") + "</div>" +
      (opts.footer === false ? "" : '<div class="modal-foot"></div>') + "</div>";
    var prevFocus = document.activeElement;
    var api = { el: back, body: A.$(".modal-body", back), foot: A.$(".modal-foot", back), closed: false };
    api.close = function (result) {
      if (api.closed) return;
      api.closed = true;
      modalStack = modalStack.filter(function (m) { return m !== api; });
      back.remove();
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* e'tiborsiz */ } }
      if (opts.onClose) opts.onClose(result);
    };
    back.addEventListener("mousedown", function (e) { if (e.target === back && !opts.persistent) api.close(); });
    back.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) api.close(); });
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + (a.cls || "btn--ghost");
      b.textContent = a.label;
      if (a.id) b.id = a.id;
      b.addEventListener("click", function () { a.onClick(api, b); });
      api.foot.appendChild(b);
    });
    A.$("#modalRoot").appendChild(back);
    modalStack.push(api);
    var first = A.$("input:not([type=hidden]):not([type=file]), select, textarea", back);
    (first || A.$(".modal", back)).focus({ preventScroll: true });
    return api;
  };
  document.addEventListener("keydown", function (e) {
    var top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (e.key === "Escape") { top.close(); return; }
    if (e.key === "Tab") { // fokusni modal ichida ushlab turish
      var f = A.$$("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea", top.el).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /** Tasdiqlash oynasi. Promise<boolean> */
  A.confirm = function (o) {
    return new Promise(function (resolve) {
      var done = false;
      var m = A.modal({
        title: o.title, size: "sm",
        body: '<div class="confirm-ico ' + (o.danger ? "" : "gold") + '">' + A.icon(o.danger ? "trash" : "info") + "</div><p>" + o.text + "</p>",
        actions: [
          { label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { done = true; api.close(); resolve(false); } },
          { label: o.confirmLabel || "Tasdiqlash", cls: o.danger ? "btn--danger" : "btn--gold", onClick: function (api) { done = true; api.close(); resolve(true); } }
        ],
        onClose: function () { if (!done) resolve(false); }
      });
      A.$(".modal-foot .btn:last-child", m.el).focus();
    });
  };

  /** Parolni qayta tasdiqlash. Promise<string|null> */
  A.askPassword = function () {
    return new Promise(function (resolve) {
      var done = false;
      var m = A.modal({
        title: "Parolni tasdiqlang", size: "sm", persistent: true,
        body: '<p class="muted" style="margin-bottom:14px">Bu muhim amal. Davom etish uchun joriy parolingizni kiriting (5 daqiqa amal qiladi).</p>' +
          '<form id="reauthForm"><div class="field"><label for="reauthPw">Parol</label><input class="input" id="reauthPw" type="password" autocomplete="current-password"></div><div class="alert alert--error" id="reauthErr" hidden style="margin-top:12px"></div></form>',
        actions: [
          { label: "Bekor qilish", cls: "btn--ghost", onClick: function (api) { done = true; api.close(); resolve(null); } },
          { label: "Tasdiqlash", cls: "btn--gold", id: "reauthOk", onClick: function () { submit(); } }
        ],
        onClose: function () { if (!done) resolve(null); }
      });
      function submit() {
        var pw = A.$("#reauthPw", m.el).value;
        if (!pw) return;
        done = true;
        m.close();
        resolve(pw);
      }
      A.$("#reauthForm", m.el).addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    });
  };

  /* ---------- Formalar ---------- */
  A.fieldError = function (root, name, msg) {
    var inp = A.$('[name="' + name + '"]', root);
    if (!inp) return;
    var f = inp.closest(".field");
    if (f) {
      f.classList.toggle("has-error", !!msg);
      var e = A.$(".err", f);
      if (e) e.textContent = msg || "";
    }
  };
  A.setBusy = function (btn, busy, label) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + (label ? " " + esc(label) : ""); }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  };
  A.emptyState = function (icon, title, text, actionHtml) {
    return '<div class="empty"><div class="ico">' + A.icon(icon) + "</div><h3>" + esc(title) + "</h3><p>" + esc(text) + "</p>" + (actionHtml || "") + "</div>";
  };
  A.skeleton = function (kind) {
    if (kind === "stats") return '<div class="grid stats">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function () { return '<div class="skeleton skel-card"></div>'; }).join("") + "</div>";
    return '<div class="skeleton skel-block"></div>';
  };

  /* ---------- Rasm: kichraytirish va yuklash ---------- */
  A.resizeImage = function (file, maxSide) {
    maxSide = maxSide || 1000;
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Faqat JPG, PNG yoki WEBP rasm tanlang."));
      if (file.size > 15 * 1024 * 1024) return reject(new Error("Rasm hajmi 15 MB dan oshmasligi kerak."));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        var q = 0.86, out = c.toDataURL("image/jpeg", q);
        while (out.length * 0.75 > 600 * 1024 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Rasmni o'qib bo'lmadi.")); };
      img.src = url;
    });
  };
  A.uploadImage = function (file) {
    return A.resizeImage(file).then(function (data) { return A.post("/upload", { data: data }); }).then(function (r) { return r.url; });
  };
  A.imgSrc = function (p) { return p ? (/^(https?:|\/)/.test(p) ? p : "/" + p) : "/assets/img/fallback.svg"; };
  A.fallbackImg = function (root) {
    A.$$("img[data-fb]", root || document).forEach(function (im) {
      im.addEventListener("error", function () { if (!im.dataset.done) { im.dataset.done = "1"; im.src = "/assets/img/fallback.svg"; } }, { once: true });
    });
  };

  /* ---------- CSV yuklab olish ---------- */
  A.download = function (path, filename) {
    return request("GET", path, undefined, { blob: true }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  };

  /* ---------- Grafiklar (kutubxonasiz SVG) ---------- */
  var DAY = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
  function dayLabel(iso, many) {
    var d = new Date(iso + "T00:00:00Z");
    return many ? iso.slice(8, 10) + "." + iso.slice(5, 7) : DAY[d.getUTCDay()];
  }
  A.charts = {
    /** Savdo grafigi: points = [{date, revenue, orders}] */
    sales: function (points) {
      var W = 640, H = 250, pl = 54, pr = 14, pt = 14, pb = 28;
      var max = Math.max.apply(null, points.map(function (p) { return p.revenue; }).concat([1]));
      var nice = Math.pow(10, Math.floor(Math.log10(max))); var top = Math.ceil(max / nice) * nice; if (top < max * 1.05) top += nice;
      var x = function (i) { return pl + (points.length === 1 ? 0 : i * (W - pl - pr) / (points.length - 1)); };
      var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
      var line = points.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.revenue).toFixed(1); }).join(" ");
      var area = line + " L" + x(points.length - 1).toFixed(1) + " " + (H - pb) + " L" + x(0).toFixed(1) + " " + (H - pb) + " Z";
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Savdo grafigi"><defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>';
      for (var g = 0; g <= 4; g++) {
        var v = top * g / 4, yy = y(v);
        s += '<line class="grid-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>' +
          '<text class="axis" x="' + (pl - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end">' + (v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + " mln" : v >= 1e3 ? Math.round(v / 1e3) + " ming" : Math.round(v)) + "</text>";
      }
      var many = points.length > 10, step = many ? Math.ceil(points.length / 8) : 1;
      points.forEach(function (p, i) { if (i % step === 0 || i === points.length - 1) s += '<text class="axis" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dayLabel(p.date, many) + "</text>"; });
      s += '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>';
      var slot = (W - pl - pr) / Math.max(1, points.length - 1);
      points.forEach(function (p, i) {
        s += '<g data-i="' + i + '"><circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(p.revenue).toFixed(1) + '" r="' + (many ? 0 : 3.5) + '"/>' +
          '<rect class="hit" x="' + (x(i) - slot / 2).toFixed(1) + '" y="' + pt + '" width="' + slot.toFixed(1) + '" height="' + (H - pt - pb) + '"/></g>';
      });
      return s + "</svg>";
    },
    bindTip: function (wrap, points) {
      var tip = document.createElement("div");
      tip.className = "chart-tip"; tip.hidden = true;
      wrap.style.position = "relative";
      wrap.appendChild(tip);
      wrap.addEventListener("mousemove", function (e) {
        var g = e.target.closest("[data-i]");
        if (!g) { tip.hidden = true; return; }
        var p = points[Number(g.getAttribute("data-i"))];
        var r = wrap.getBoundingClientRect();
        tip.innerHTML = esc(A.fmt.date(p.date + "T00:00:00Z", false)) + "<small>" + A.fmt.money(p.revenue) + " · " + p.orders + " ta buyurtma</small>";
        tip.hidden = false;
        tip.style.left = Math.max(70, Math.min(r.width - 70, e.clientX - r.left)) + "px";
        tip.style.top = (e.clientY - r.top) + "px";
      });
      wrap.addEventListener("mouseleave", function () { tip.hidden = true; });
    },
    /** Holatlar bo'yicha donut: parts = [{status,count}] */
    donut: function (parts) {
      var total = parts.reduce(function (s, p) { return s + p.count; }, 0);
      var R = 60, C = 2 * Math.PI * R, off = 0;
      var s = '<svg viewBox="0 0 160 160" role="img" aria-label="Buyurtmalar holati"><circle cx="80" cy="80" r="' + R + '" fill="none" stroke="var(--surface-3)" stroke-width="20"/>';
      parts.forEach(function (p) {
        var len = total ? C * p.count / total : 0;
        s += '<circle cx="80" cy="80" r="' + R + '" fill="none" stroke="' + (A.STATUS_COLORS[p.status] || "#999") + '" stroke-width="20" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 80 80)"/>';
        off += len;
      });
      s += '<text x="80" y="78" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)" font-family="Manrope,sans-serif">' + total + '</text><text x="80" y="98" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="Manrope,sans-serif">buyurtma</text></svg>';
      return s;
    }
  };

  /* ---------- Jadvallar: telefonda karta ko'rinishi uchun ustun nomlarini yorliq qilish ---------- */
  A.labelTables = function (root) {
    A.$$("table.tbl", root).forEach(function (t) {
      if (!t.tHead || !t.tHead.rows[0]) return;
      var heads = [].map.call(t.tHead.rows[0].cells, function (th) { return th.textContent.trim(); });
      A.$$("tbody tr", t).forEach(function (tr) {
        [].forEach.call(tr.cells, function (td, i) { if (heads[i] !== undefined && td.getAttribute("data-label") !== heads[i]) td.setAttribute("data-label", heads[i]); });
      });
    });
  };

  /* ---------- Marshrut yordamchilari ---------- */
  A.parseHash = function () {
    var h = location.hash.replace(/^#\/?/, "");
    var i = h.indexOf("?");
    var name = (i === -1 ? h : h.slice(0, i)) || "dashboard";
    var query = {};
    if (i !== -1) new URLSearchParams(h.slice(i + 1)).forEach(function (v, k) { query[k] = v; });
    return { name: name, query: query };
  };
  A.go = function (name, query) { location.hash = "#/" + name + A.qs(query); };
})();
