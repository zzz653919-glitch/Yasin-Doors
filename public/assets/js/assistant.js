/* YasinDoors AI — saytdagi chat yordamchisi (faqat standart savollar).
   Mijoz matn yozmaydi: tezkor savol va tavsiya tugmalari bosiladi; javoblar serverdan (POST /api/assistant), haqiqiy katalog/sozlamalar asosida.
   Tarix faqat shu qurilmada (localStorage, 7 kun). */
(function () {
  "use strict";
  if (/^\/admin(\/|$)/i.test(location.pathname)) return;
  var KEY = "yd_ai_v1", MAX_SAVED = 30, TTL = 7 * 24 * 3600 * 1000;
  var QUICK = [
    ["price", "MDF eshiklar narxi qancha?"], ["models", "Qanday eshik modellari bor?"], ["recommend", "Qaysi eshikni tanlashni tavsiya qilasiz?"],
    ["sizes", "Eshiklarning o‘lchamlari qanday?"], ["colors", "Qanday ranglar mavjud?"],
    ["how_order", "Eshikni qanday buyurtma qilaman?"], ["delivery_service", "Yetkazib berish xizmati bormi?"], ["regions", "Qaysi viloyatlarga yetkazib berasiz?"],
    ["delivery_price", "Yetkazib berish narxi qancha?"], ["install", "Eshikni o‘rnatib berasizmi?"], ["order_status", "Buyurtmam holatini qanday bilaman?"],
    ["contact", "Siz bilan qanday bog‘lanish mumkin?"], ["hours", "Ish vaqtingiz qanday?"], ["other", "Boshqa savolim bor."]
  ];
  var PHONE = { text: "+998 93 300 20 20", tel: "+998933002020" };
  var GREETING = "Assalomu alaykum! Men YasinDoors AI yordamchisiman. MDF eshiklar, narx, yetkazib berish va buyurtma bo‘yicha savollaringizga javob beraman va sizga mos eshikni tanlashda yordam beraman. Quyidagi savollardan birini tanlang.";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var msgs = [], busy = false, lastPayload = null, built = false, open = false;
  var el = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m"; }
  function ls(fn) { try { return fn(); } catch (e) { return null; } }

  /* ---------- Tarix (faqat shu qurilmada) ---------- */
  function load() {
    var raw = ls(function () { return JSON.parse(localStorage.getItem(KEY) || "null"); });
    if (!raw || !Array.isArray(raw.msgs) || Date.now() - (raw.at || 0) > TTL) return [];
    return raw.msgs.filter(function (m) { return m && (m.role === "user" || m.role === "bot") && typeof m.text === "string"; }).slice(-MAX_SAVED);
  }
  function save() {
    var keep = msgs.filter(function (m) { return !m.error && !m.welcome; }).slice(-MAX_SAVED).map(function (m) {
      return { role: m.role, text: m.text, products: m.products, links: m.links };
    });
    ls(function () { if (keep.length) localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), msgs: keep })); else localStorage.removeItem(KEY); });
  }

  /* ---------- Chizish ---------- */
  function scrollDown() { el.log.scrollTop = el.log.scrollHeight; }
  function chip(label, payload, cls) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "ai-chip" + (cls ? " " + cls : ""); b.textContent = label;
    b.addEventListener("click", function () { send(payload, label); });
    return b;
  }
  function renderMsg(m, opts) {
    var row = document.createElement("div");
    row.className = "ai-row ai-row--" + m.role + (opts && opts.animate && !reduce ? " is-new" : "");
    var bubble = document.createElement("div");
    bubble.className = "ai-bubble";
    var t = document.createElement("div"); t.className = "ai-text"; t.textContent = m.text;
    bubble.appendChild(t);
    if (m.products && m.products.length) {
      var list = document.createElement("div"); list.className = "ai-cards";
      m.products.forEach(function (p) {
        var a = document.createElement("a");
        a.className = "ai-card"; a.href = p.url;
        a.innerHTML = '<img src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async" width="72" height="90">' +
          '<span class="ai-card-body"><strong>' + esc(p.name) + "</strong>" +
          '<span class="ai-card-meta">' + esc([p.style, p.color].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="ai-card-price">' + (p.oldPrice ? "<s>" + esc(money(p.oldPrice)) + "</s> " : "") + esc(money(p.price)) + "</span>" +
          '<span class="ai-card-go">Mahsulot sahifasi →</span></span>';
        list.appendChild(a);
      });
      bubble.appendChild(list);
    }
    if (m.links && m.links.length) {
      var ls2 = document.createElement("div"); ls2.className = "ai-links";
      m.links.forEach(function (l) {
        var a = document.createElement("a"); a.className = "ai-link"; a.href = l.href; a.textContent = l.label;
        if (/^https?:/.test(l.href)) { a.target = "_blank"; a.rel = "noopener"; }
        ls2.appendChild(a);
      });
      bubble.appendChild(ls2);
    }
    if (m.error) {
      var rb = document.createElement("button"); rb.type = "button"; rb.className = "ai-retry"; rb.textContent = "Qayta urinish";
      rb.addEventListener("click", function () { removeError(); if (lastPayload) request(lastPayload); });
      bubble.appendChild(rb);
    }
    if (m.suggestions && m.suggestions.length) {
      var sg = document.createElement("div"); sg.className = "ai-suggest";
      m.suggestions.forEach(function (s) { sg.appendChild(chip(s.label, s)); });
      if (!m.welcome && m.suggestions.length < QUICK.length) {   // har javobdan keyin 14 ta savolning hammasiga qaytish imkoni
        var all = document.createElement("button"); all.type = "button"; all.className = "ai-chip ai-chip--all"; all.textContent = "Barcha savollar";
        all.addEventListener("click", function () { sg.innerHTML = ""; QUICK.forEach(function (q) { sg.appendChild(chip(q[1], { intent: q[0] })); }); scrollDown(); });
        sg.appendChild(all);
      }
      bubble.appendChild(sg);
    }
    row.appendChild(bubble);
    el.log.appendChild(row);
    return row;
  }
  function renderAll() {
    el.log.innerHTML = "";
    msgs.forEach(function (m) { renderMsg(m); });
    scrollDown();
  }
  function welcome() {
    msgs = [{ role: "bot", text: GREETING, welcome: true, suggestions: QUICK.map(function (q) { return { label: q[1], intent: q[0] }; }) }];
    renderAll();
  }
  function showTyping() {
    var row = document.createElement("div");
    row.className = "ai-row ai-row--bot ai-typing"; row.setAttribute("role", "status"); row.setAttribute("aria-label", "YasinDoors AI yozmoqda");
    row.innerHTML = '<div class="ai-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
    el.log.appendChild(row); scrollDown(); el.typing = row;
  }
  function hideTyping() { if (el.typing) { el.typing.remove(); el.typing = null; } }
  function clearSuggestions() {
    msgs.forEach(function (m) { delete m.suggestions; });
    el.log.querySelectorAll(".ai-suggest").forEach(function (n) { n.remove(); });
  }
  function removeError() {
    var last = msgs[msgs.length - 1];
    if (last && last.error) { msgs.pop(); var rows = el.log.querySelectorAll(".ai-row"); if (rows.length) rows[rows.length - 1].remove(); }
  }

  /* ---------- Yuborish ---------- */
  function send(payload, display) {
    if (busy || !display) return;
    clearSuggestions();
    msgs.push({ role: "user", text: display });
    renderMsg(msgs[msgs.length - 1], { animate: true });
    save(); scrollDown();
    lastPayload = { intent: payload.intent, action: payload.action, criteria: payload.criteria };
    request(lastPayload);
  }
  function request(payload) {
    busy = true; setBusy(true); showTyping();
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 22000) : 0;
    var body = payload;
    fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) { var e = new Error(j.error || "xato"); e.status = r.status; e.msg = j.error; throw e; } return j; }); })
      .then(function (j) {
        clearTimeout(timer); hideTyping();
        var m = { role: "bot", text: j.reply || "", products: j.products, links: j.links, suggestions: j.suggestions };
        msgs.push(m); renderMsg(m, { animate: true }); save(); scrollDown();
      })
      .catch(function (err) {
        clearTimeout(timer); hideTyping();
        var text = err && err.msg ? err.msg : (navigator.onLine === false ? "Internet aloqasi yo‘q. Aloqa tiklangach qayta urinib ko‘ring." : "Javob olib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring yoki qo‘ng‘iroq qiling: " + PHONE.text + ".");
        var m = { role: "bot", text: text, error: true, links: [{ label: "Qo‘ng‘iroq: " + PHONE.text, href: "tel:" + PHONE.tel }] };
        msgs.push(m); renderMsg(m, { animate: true }); scrollDown();
      })
      .then(function () { busy = false; setBusy(false); });
  }
  function setBusy(b) { el.panel.setAttribute("aria-busy", b ? "true" : "false"); }

  /* ---------- Oyna ---------- */
  function build() {
    if (built) return; built = true;
    var panel = document.createElement("section");
    panel.className = "ai-panel"; panel.id = "aiPanel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "YasinDoors AI yordamchisi"); panel.setAttribute("aria-modal", "false");
    panel.innerHTML =
      '<header class="ai-head"><span class="ai-avatar" aria-hidden="true">AI</span>' +
      '<div class="ai-title"><strong>YasinDoors AI</strong><span>Eshik tanlash va buyurtma yordamchisi</span></div>' +
      '<button type="button" class="ai-icon ai-full-btn" data-ai-full aria-pressed="false" aria-label="Butun ekran" title="Butun ekran"><svg class="ai-ic-expand" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg><svg class="ai-ic-shrink" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg></button>' +
      '<button type="button" class="ai-icon" data-ai-clear aria-label="Chat tarixini tozalash" title="Tarixni tozalash"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button>' +
      '<button type="button" class="ai-icon" data-ai-close aria-label="Chatni yopish" title="Yopish"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>' +
      '<div class="ai-log" id="aiLog" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div>' +
      '<p class="ai-note">Savolni tugma bilan tanlang. Chat tarixi faqat shu qurilmada saqlanadi. Boshqa savol: +998 93 300 20 20.</p>';
    document.body.appendChild(panel);
    el.panel = panel; el.log = panel.querySelector(".ai-log");
    panel.querySelector("[data-ai-close]").addEventListener("click", function () { toggle(false); });
    panel.querySelector("[data-ai-full]").addEventListener("click", function () { setFull(!panel.classList.contains("ai-full")); });
    panel.querySelector("[data-ai-clear]").addEventListener("click", function () {
      ls(function () { localStorage.removeItem(KEY); }); lastPayload = null; welcome(); announce("Chat tarixi tozalandi");
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (panel.classList.contains("ai-full") && window.innerWidth > 640) setFull(false); else toggle(false); return; }
      if (e.key === "Tab") {   // fokusni oyna ichida ushlab turish
        var f = Array.prototype.slice.call(panel.querySelectorAll("button:not([disabled]), a[href], textarea, [tabindex='0']")).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    msgs = load();
    if (msgs.length) {
      var last = msgs[msgs.length - 1];
      if (last.role === "bot") last.suggestions = QUICK.slice(0, 5).map(function (q) { return { label: q[1], intent: q[0] }; });
      renderAll();
    } else welcome();
    if (window.visualViewport) {
      var fit = function () {
        if (!open || window.innerWidth > 640) { panel.style.removeProperty("height"); panel.style.removeProperty("top"); return; }
        panel.style.height = window.visualViewport.height + "px"; panel.style.top = window.visualViewport.offsetTop + "px"; scrollDown();
      };
      window.visualViewport.addEventListener("resize", fit); window.visualViewport.addEventListener("scroll", fit);
      el.fit = fit;
    }
  }
  function announce(t) { var n = document.createElement("div"); n.className = "ai-hint"; n.textContent = t; el.log.appendChild(n); scrollDown(); setTimeout(function () { n.remove(); }, 2500); }

  /* Butun ekran rejimi (kompyuterda; telefonda oyna allaqachon to‘liq ekran) */
  function setFull(on) {
    el.panel.classList.toggle("ai-full", on);
    document.documentElement.classList.toggle("ai-fullscreen", on);
    var b = el.panel.querySelector("[data-ai-full]");
    b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Butun ekrandan chiqish" : "Butun ekran"); b.title = on ? "Butun ekrandan chiqish" : "Butun ekran";
    ls(function () { localStorage.setItem("yd_ai_full", on ? "1" : "0"); });
    setTimeout(scrollDown, 50);
  }

  function toggle(force) {
    build();
    open = typeof force === "boolean" ? force : !open;
    el.panel.hidden = !open;
    if (!open && el.panel.classList.contains("ai-full")) { document.documentElement.classList.remove("ai-fullscreen"); }
    if (open && ls(function () { return localStorage.getItem("yd_ai_full"); }) === "1") { el.panel.classList.add("ai-full"); document.documentElement.classList.add("ai-fullscreen"); el.panel.querySelector("[data-ai-full]").setAttribute("aria-pressed", "true"); }
    el.fab.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("ai-open", open);
    if (open) {
      el.panel.classList.add("is-open");
      setTimeout(function () { if (msgs.length === 1 && msgs[0].welcome) el.log.scrollTop = 0; else scrollDown(); el.panel.querySelector("[data-ai-close]").focus(); }, 30);
      if (el.fit) el.fit();
    } else {
      el.panel.style.removeProperty("height"); el.panel.style.removeProperty("top");
      el.fab.focus();
    }
  }

  function init() {
    var fab = document.createElement("button");
    fab.type = "button"; fab.className = "ai-fab"; fab.id = "aiFab";
    fab.setAttribute("aria-label", "YasinDoors AI yordamchisini ochish"); fab.setAttribute("aria-expanded", "false"); fab.setAttribute("aria-controls", "aiPanel");
    fab.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 10h6M9 14h4"/></svg><span class="ai-fab-label">AI yordam</span>';
    fab.addEventListener("click", function () { toggle(); });
    document.body.appendChild(fab); el.fab = fab;
  }
  if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
  window.YDAssistant = { open: function () { toggle(true); }, close: function () { toggle(false); } };
})();
