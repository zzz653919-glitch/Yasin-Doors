/**
 * MDF eshik rasmlari generatori (SVG). Haqiqiy foto EMAS — har bir eshik uchun parametrlar bo'yicha chizilgan realistik illyustratsiya
 * (xona devori, pol, eshik ramasi, yorug'lik, soya, tutqich). Bir xil parametrlar — bir xil rasm (deterministik).
 * Haqiqiy foto kerak bo'lsa, admin panelda mahsulot rasmini almashtiring.
 *
 * design = {
 *   leaf: "#hex",                         // eshik asosiy rangi
 *   wall: ["#hex","#hex"], floor: "#hex", frame: "#hex",
 *   handle: "lever-gold" | "lever-chrome" | "lever-black" | "bar-black" | "bar-chrome" | "bar-gold" | "knob-brass",
 *   side: "left" | "right",
 *   pattern: "<tur>", p: { ...parametrlar }, seed: <son>, shape: "rect" | "arch"
 * }
 */
"use strict";

/* ---------- Rang yordamchilari ---------- */
function hex2rgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgb2hex(r) { return "#" + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function mix(a, b, t) { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); }
const lighten = (h, t) => mix(h, "#ffffff", t);
const darken = (h, t) => mix(h, "#000000", t);
function lum(h) { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const f = n => Math.round(n * 10) / 10;

/* ---------- Sahna o'lchamlari ---------- */
const FR = { x: 128, y: 66, w: 224, h: 474 };            // rama (casing)
const L = { x: 144, y: 82, w: 192, h: 458 };              // eshik tabaqasi
const FLOOR = 540;

function metalStops(kind) {
  if (kind === "gold") return ["#ecd9b4", "#d1ac6a", "#8a7246"];
  if (kind === "rose") return ["#f0cfc0", "#cf9a86", "#8f6455"];
  if (kind === "black") return ["#55565a", "#2a2b2e", "#111113"];
  if (kind === "brass") return ["#e8d49a", "#c2a04c", "#7d6628"];
  return ["#f4f6f7", "#c3c8cb", "#7c8286"];             // chrome
}

/* ---------- Naqshlar ---------- */
function groovesV(d, o) {
  const n = o.n || 4, dark = darken(d.leaf, 0.28), light = lighten(d.leaf, 0.22);
  let s = "";
  const gap = L.w / (n + 1);
  for (let i = 1; i <= n; i++) {
    const x = L.x + gap * i + (o.off || 0) * gap * 0.5 * (i % 2 ? 1 : -1);
    const y1 = o.full ? L.y : L.y + 30, y2 = o.full ? L.y + L.h : L.y + L.h - 30;
    s += `<rect x="${f(x - 1.4)}" y="${y1}" width="2.8" height="${y2 - y1}" fill="${dark}" opacity="0.8"/><rect x="${f(x + 1.4)}" y="${y1}" width="1" height="${y2 - y1}" fill="${light}" opacity="0.55"/>`;
  }
  return s;
}
function groovesH(d, o) {
  const n = o.n || 4, dark = darken(d.leaf, 0.28), light = lighten(d.leaf, 0.22);
  let s = "";
  const gap = L.h / (n + 1);
  for (let i = 1; i <= n; i++) {
    const y = L.y + gap * i;
    s += `<rect x="${L.x}" y="${f(y - 1.4)}" width="${L.w}" height="2.8" fill="${dark}" opacity="0.8"/><rect x="${L.x}" y="${f(y + 1.4)}" width="${L.w}" height="1" fill="${light}" opacity="0.55"/>`;
  }
  return s;
}
function inlay(d, o) {
  const m = metalStops(o.metal || "gold");
  const g = `<linearGradient id="inl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m[0]}"/><stop offset="0.5" stop-color="${m[1]}"/><stop offset="1" stop-color="${m[2]}"/></linearGradient>`;
  let s = `<defs>${g}</defs>`;
  const w = o.w || 2.4, ins = o.inset || 20;
  if (o.frame !== false) s += `<rect x="${L.x + ins}" y="${L.y + ins}" width="${L.w - ins * 2}" height="${L.h - ins * 2}" fill="none" stroke="url(#inl)" stroke-width="${w}"/>`;
  if (o.cross) s += `<rect x="${L.x + L.w / 2 - w / 2}" y="${L.y + ins}" width="${w}" height="${L.h - ins * 2}" fill="url(#inl)"/>`;
  if (o.hbar) for (const t of o.hbar) s += `<rect x="${L.x + ins}" y="${f(L.y + L.h * t)}" width="${L.w - ins * 2}" height="${w}" fill="url(#inl)"/>`;
  if (o.vbar) for (const t of o.vbar) s += `<rect x="${f(L.x + L.w * t)}" y="${L.y + ins}" width="${w}" height="${L.h - ins * 2}" fill="url(#inl)"/>`;
  if (o.band) s += `<rect x="${L.x}" y="${f(L.y + L.h * o.band)}" width="${L.w}" height="${(o.bandH || 9)}" fill="url(#inl)"/>`;
  return s;
}
function panel(x, y, w, h, base, arch) {
  const hi = lighten(base, 0.2), lo = darken(base, 0.3), fill = lighten(base, 0.05);
  const r = 2;
  if (arch) {
    const a = Math.min(w / 2, h * 0.4), top = y + a;
    const path = `M${x} ${y + h} L${x} ${top} A${w / 2} ${a} 0 0 1 ${x + w} ${top} L${x + w} ${y + h} Z`;
    return `<path d="${path}" fill="${fill}" stroke="${lo}" stroke-width="2.2"/><path d="${path}" fill="none" stroke="${hi}" stroke-width="1" transform="translate(-1.4 -1.4)" opacity="0.7"/>` +
      `<path d="M${x + 7} ${y + h - 7} L${x + 7} ${top} A${w / 2 - 7} ${a - 6} 0 0 1 ${x + w - 7} ${top} L${x + w - 7} ${y + h - 7} Z" fill="none" stroke="${lo}" stroke-width="1" opacity="0.5"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${lo}" stroke-width="2.2"/>` +
    `<rect x="${x - 1.4}" y="${y - 1.4}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${hi}" stroke-width="1" opacity="0.75"/>` +
    `<rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="1" fill="none" stroke="${lo}" stroke-width="1" opacity="0.5"/>`;
}
function panels(d, o) {
  const rows = o.rows || 2, cols = o.cols || 1, pad = o.pad || 22, gap = o.gap || 14;
  let s = "";
  const hs = o.heights || new Array(rows).fill(1);
  const total = hs.reduce((a, b) => a + b, 0), availH = L.h - pad * 2 - gap * (rows - 1);
  let y = L.y + pad;
  const pw = (L.w - pad * 2 - gap * (cols - 1)) / cols;
  for (let r = 0; r < rows; r++) {
    const h = availH * hs[r] / total;
    for (let c = 0; c < cols; c++) s += panel(f(L.x + pad + c * (pw + gap)), f(y), f(pw), f(h), d.leaf, o.arch && r === 0);
    y += h + gap;
  }
  return s;
}
function glassRect(x, y, w, h, o, leaf) {
  const tint = o.tint || "clear";
  const [c1, c2] = tint === "bronze" ? ["#d9c4a4", "#a98f6a"] : tint === "grey" ? ["#c6ccce", "#8d9598"] : tint === "frost" ? ["#eef1f1", "#cfd5d6"] : ["#e7f0f3", "#b9cbd1"];
  const id = "g" + Math.round(x * 3 + y * 7);
  const fr = darken(leaf, 0.35);
  let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity="0.96"/><stop offset="1" stop-color="${c2}" stop-opacity="0.96"/></linearGradient></defs>`;
  s += `<rect x="${f(x - 4)}" y="${f(y - 4)}" width="${f(w + 8)}" height="${f(h + 8)}" rx="2" fill="${fr}"/>`;
  s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${id})"/>`;
  if (tint === "frost") s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" opacity="0.28"/>`;
  else s += `<path d="M${f(x)} ${f(y + h * 0.7)} L${f(x + w * 0.55)} ${f(y)} L${f(x + w * 0.8)} ${f(y)} L${f(x)} ${f(y + h * 0.95)} Z" fill="#fff" opacity="0.32"/>`;
  if (o.cols > 1) for (let i = 1; i < o.cols; i++) s += `<rect x="${f(x + w * i / o.cols - 1.5)}" y="${f(y)}" width="3" height="${f(h)}" fill="${fr}"/>`;
  if (o.rows > 1) for (let i = 1; i < o.rows; i++) s += `<rect x="${f(x)}" y="${f(y + h * i / o.rows - 1.5)}" width="${f(w)}" height="3" fill="${fr}"/>`;
  return s;
}
function glass(d, o) {
  const k = o.kind || "top";
  const lx = L.x, ly = L.y, lw = L.w, lh = L.h;
  const t = o.tint ? { tint: o.tint, cols: o.cols, rows: o.rows } : { cols: o.cols, rows: o.rows };
  const gp = o.pad || 26;
  if (k === "top") return glassRect(lx + gp, ly + gp, lw - gp * 2, lh * (o.hfrac || 0.34), t, d.leaf);
  if (k === "full") return glassRect(lx + lw * 0.38, ly + gp, lw * 0.24, lh - gp * 2, t, d.leaf);
  if (k === "wide") return glassRect(lx + gp, ly + lh * 0.2, lw - gp * 2, lh * 0.56, t, d.leaf);
  if (k === "center") return glassRect(lx + lw * 0.22, ly + lh * 0.14, lw * 0.56, lh * 0.5, t, d.leaf);
  if (k === "side") return glassRect(lx + lw * 0.1, ly + gp, lw * 0.22, lh - gp * 2, t, d.leaf);
  if (k === "full-grid") return glassRect(lx + gp, ly + gp, lw - gp * 2, lh - gp * 2, Object.assign({ cols: 3, rows: 6 }, t), d.leaf);
  if (k === "double") return glassRect(lx + gp, ly + gp, lw - gp * 2, lh * 0.26, t, d.leaf) + glassRect(lx + gp, ly + lh * 0.5, lw - gp * 2, lh * 0.26, t, d.leaf);
  if (k === "arch") {
    const x = lx + gp + 6, w = lw - (gp + 6) * 2, y = ly + gp, h = lh * 0.42, a = w / 2;
    const id = "ga";
    const [c1, c2] = o.tint === "bronze" ? ["#d9c4a4", "#a98f6a"] : ["#e7f0f3", "#b9cbd1"];
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
      `<path d="M${x - 4} ${y + h} L${x - 4} ${y + a} A${a + 4} ${a + 4} 0 0 1 ${x + w + 4} ${y + a} L${x + w + 4} ${y + h} Z" fill="${darken(d.leaf, 0.35)}"/>` +
      `<path d="M${x} ${y + h} L${x} ${y + a} A${a} ${a} 0 0 1 ${x + w} ${y + a} L${x + w} ${y + h} Z" fill="url(#${id})"/>` +
      `<path d="M${x} ${y + h * 0.8} L${x + w * 0.5} ${y + a * 0.5} L${x + w * 0.75} ${y + a * 0.4} L${x} ${y + h} Z" fill="#fff" opacity="0.3"/>`;
  }
  return "";
}
function wood(d, o) {
  const r = rng(d.seed || 7);
  const dark = darken(d.leaf, o.contrast || 0.3), light = lighten(d.leaf, 0.14);
  let s = "";
  const n = o.lines || 46;
  const dir = o.dir || "v";
  for (let i = 0; i < n; i++) {
    const t = r(), x = L.x + t * L.w, w0 = r() * 5 + (r() * 6);
    const a = r() * 0.45 + 0.12, col = r() > 0.35 ? dark : light, sw = 0.5 + r() * 1.5;
    if (dir === "v") {
      const x0 = f(x), amp = (r() - 0.5) * 8, x1 = f(x + amp), x2 = f(x - amp * 0.6);
      s += `<path d="M${x0} ${L.y} C${x1} ${f(L.y + L.h * 0.3)}, ${x2} ${f(L.y + L.h * 0.65)}, ${f(x + amp * 0.4)} ${L.y + L.h}" fill="none" stroke="${col}" stroke-width="${f(sw)}" opacity="${f(a)}"/>`;
    } else {
      const y = L.y + t * L.h, amp = (r() - 0.5) * 8;
      s += `<path d="M${L.x} ${f(y)} C${f(L.x + L.w * 0.3)} ${f(y + amp)}, ${f(L.x + L.w * 0.65)} ${f(y - amp * 0.6)}, ${L.x + L.w} ${f(y + amp * 0.4)}" fill="none" stroke="${col}" stroke-width="${f(sw)}" opacity="${f(a)}"/>`;
    }
  }
  if (o.knots) for (let i = 0; i < o.knots; i++) {
    const kx = L.x + 24 + r() * (L.w - 48), ky = L.y + 40 + r() * (L.h - 80);
    s += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(2 + r() * 3)}" ry="${f(5 + r() * 6)}" fill="none" stroke="${dark}" stroke-width="1.1" opacity="0.5"/>`;
  }
  if (o.planks) {
    for (let i = 1; i < o.planks; i++) {
      if (dir === "v") { const x = L.x + L.w * i / o.planks; s += `<rect x="${f(x - 0.9)}" y="${L.y}" width="1.8" height="${L.h}" fill="${darken(d.leaf, 0.45)}" opacity="0.75"/>`; }
      else { const y = L.y + L.h * i / o.planks; s += `<rect x="${L.x}" y="${f(y - 0.9)}" width="${L.w}" height="1.8" fill="${darken(d.leaf, 0.45)}" opacity="0.75"/>`; }
    }
  }
  return s;
}
function geo(d, o) {
  const dark = darken(d.leaf, o.contrast || 0.28), light = lighten(d.leaf, 0.2), k = o.kind;
  const sz = o.size || 32;
  let s = "";
  const sw = o.sw || 1.6;
  if (k === "diamond") {
    for (let y = L.y - sz; y < L.y + L.h + sz; y += sz) for (let x = L.x - sz; x < L.x + L.w + sz; x += sz) {
      const cx = x + (Math.round((y - L.y) / sz) % 2 ? sz / 2 : 0);
      s += `<path d="M${cx} ${y} l${sz / 2} ${sz / 2} l${-sz / 2} ${sz / 2} l${-sz / 2} ${-sz / 2} Z" fill="none" stroke="${dark}" stroke-width="${sw}" opacity="0.7"/>`;
    }
  } else if (k === "chevron") {
    for (let y = L.y - sz; y < L.y + L.h + sz; y += sz * 0.75) s += `<path d="M${L.x} ${f(y)} L${f(L.x + L.w / 2)} ${f(y + sz * 0.6)} L${L.x + L.w} ${f(y)}" fill="none" stroke="${dark}" stroke-width="${sw + 0.6}" opacity="0.7"/><path d="M${L.x} ${f(y + 2.4)} L${f(L.x + L.w / 2)} ${f(y + sz * 0.6 + 2.4)} L${L.x + L.w} ${f(y + 2.4)}" fill="none" stroke="${light}" stroke-width="0.8" opacity="0.6"/>`;
  } else if (k === "diag") {
    for (let i = -L.h; i < L.w + L.h; i += sz * 0.8) s += `<path d="M${f(L.x + i)} ${L.y + L.h} L${f(L.x + i + L.h)} ${L.y}" stroke="${dark}" stroke-width="${sw + 0.6}" opacity="0.7"/><path d="M${f(L.x + i + 2.4)} ${L.y + L.h} L${f(L.x + i + L.h + 2.4)} ${L.y}" stroke="${light}" stroke-width="0.8" opacity="0.6"/>`;
  } else if (k === "circles") {
    for (let y = L.y + sz / 2; y < L.y + L.h; y += sz) for (let x = L.x + sz / 2; x < L.x + L.w + sz; x += sz) {
      const cx = x + (Math.round((y - L.y) / sz) % 2 ? sz / 2 : 0);
      s += `<circle cx="${f(cx)}" cy="${f(y)}" r="${f(sz * 0.36)}" fill="none" stroke="${dark}" stroke-width="${sw}" opacity="0.7"/>`;
    }
  } else if (k === "squares") {
    for (let y = L.y + 14; y < L.y + L.h - 14; y += sz) for (let x = L.x + 14; x < L.x + L.w - 14; x += sz) s += `<rect x="${f(x)}" y="${f(y)}" width="${sz - 8}" height="${sz - 8}" fill="none" stroke="${dark}" stroke-width="${sw}" opacity="0.7"/>`;
  } else if (k === "triangles") {
    for (let y = L.y; y < L.y + L.h; y += sz) for (let x = L.x - sz / 2; x < L.x + L.w + sz; x += sz) {
      const sh = Math.round((y - L.y) / sz) % 2 ? sz / 2 : 0;
      s += `<path d="M${f(x + sh)} ${f(y + sz)} L${f(x + sh + sz / 2)} ${f(y)} L${f(x + sh + sz)} ${f(y + sz)} Z" fill="none" stroke="${dark}" stroke-width="${sw}" opacity="0.7"/>`;
    }
  } else if (k === "stripes") {
    for (let x = L.x + sz / 2; x < L.x + L.w; x += sz) s += `<rect x="${f(x)}" y="${L.y}" width="${f(sz / 2.4)}" height="${L.h}" fill="${dark}" opacity="0.38"/>`;
  } else if (k === "steps") {
    for (let i = 0; i < 9; i++) s += `<rect x="${f(L.x + i * (L.w / 9))}" y="${f(L.y + L.h - (i + 1) * (L.h / 9))}" width="${f(L.w / 9)}" height="${f((i + 1) * (L.h / 9))}" fill="${i % 2 ? dark : light}" opacity="0.22"/>`;
  }
  return s;
}
function nod(d, o) {
  const k = o.kind, acc = o.accent || mix(d.leaf, "#000000", 0.35);
  const m = metalStops(o.metal || "brass");
  let s = "";
  if (k === "diagsplit") s += `<path d="M${L.x} ${L.y + L.h} L${L.x + L.w} ${L.y + L.h * (o.t || 0.35)} L${L.x + L.w} ${L.y + L.h} Z" fill="${acc}" opacity="0.9"/><path d="M${L.x} ${L.y + L.h} L${L.x + L.w} ${L.y + L.h * (o.t || 0.35)}" stroke="${lighten(acc, 0.3)}" stroke-width="1.4"/>`;
  else if (k === "blocks") s += `<rect x="${L.x}" y="${L.y}" width="${f(L.w * (o.w || 0.4))}" height="${L.h}" fill="${acc}"/><rect x="${f(L.x + L.w * (o.w || 0.4))}" y="${L.y}" width="1.6" height="${L.h}" fill="${lighten(acc, 0.3)}"/>`;
  else if (k === "porthole") s += `<circle cx="${L.x + L.w / 2}" cy="${L.y + L.h * 0.34}" r="${o.r || 40}" fill="${darken(d.leaf, 0.4)}"/><circle cx="${L.x + L.w / 2}" cy="${L.y + L.h * 0.34}" r="${(o.r || 40) - 6}" fill="#cfdde0"/><path d="M${L.x + L.w / 2 - 22} ${L.y + L.h * 0.34 + 22} L${L.x + L.w / 2 + 8} ${L.y + L.h * 0.34 - 30} L${L.x + L.w / 2 + 22} ${L.y + L.h * 0.34 - 24} L${L.x + L.w / 2 - 16} ${L.y + L.h * 0.34 + 28} Z" fill="#fff" opacity="0.35"/><circle cx="${L.x + L.w / 2}" cy="${L.y + L.h * 0.34}" r="${(o.r || 40) + 3}" fill="none" stroke="${m[1]}" stroke-width="3"/>`;
  else if (k === "slots") for (let i = 0; i < (o.n || 5); i++) s += `<rect x="${f(L.x + 26 + i * ((L.w - 52) / (o.n || 5)))}" y="${f(L.y + 40 + (i % 2) * 26)}" width="9" height="${f(L.h * 0.6)}" rx="4.5" fill="${darken(d.leaf, 0.55)}"/><rect x="${f(L.x + 26 + i * ((L.w - 52) / (o.n || 5)) + 1)}" y="${f(L.y + 40 + (i % 2) * 26)}" width="3" height="${f(L.h * 0.6)}" rx="1.5" fill="${lighten(d.leaf, 0.2)}" opacity="0.5"/>`;
  else if (k === "offsetglass") s += glassRect(L.x + L.w * 0.58, L.y + 30, L.w * 0.3, L.h * 0.44, { tint: o.tint || "clear" }, d.leaf) + `<rect x="${f(L.x + L.w * 0.58 - 4)}" y="${f(L.y + 30 + L.h * 0.44 + 26)}" width="${f(L.w * 0.3 + 8)}" height="5" fill="url(#nodm)"/>`;
  else if (k === "bands") for (let i = 0; i < (o.n || 3); i++) s += `<rect x="${L.x}" y="${f(L.y + L.h * (0.18 + i * 0.22))}" width="${L.w}" height="${o.bh || 12}" fill="${i % 2 ? acc : m[1]}" opacity="0.9"/>`;
  else if (k === "cornercut") s += `<path d="M${L.x} ${L.y} L${L.x + L.w * 0.5} ${L.y} L${L.x} ${L.y + L.h * 0.28} Z" fill="${acc}"/><path d="M${L.x + L.w} ${L.y + L.h} L${L.x + L.w * 0.5} ${L.y + L.h} L${L.x + L.w} ${L.y + L.h * 0.72} Z" fill="${acc}"/>`;
  else if (k === "rings") for (let i = 0; i < (o.n || 3); i++) s += `<circle cx="${L.x + L.w / 2}" cy="${f(L.y + L.h * (0.28 + i * 0.2))}" r="${f(26 - i * 4)}" fill="none" stroke="${i % 2 ? acc : m[1]}" stroke-width="3.4"/>`;
  else if (k === "frameinset") s += `<rect x="${L.x + 30}" y="${L.y + 30}" width="${L.w - 60}" height="${L.h - 60}" fill="${acc}"/><rect x="${L.x + 30}" y="${L.y + 30}" width="${L.w - 60}" height="${L.h - 60}" fill="none" stroke="${m[1]}" stroke-width="2"/>`;
  return `<defs><linearGradient id="nodm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${m[0]}"/><stop offset="1" stop-color="${m[2]}"/></linearGradient></defs>` + s;
}

/* ---------- Tutqich ---------- */
function handle(d) {
  const [type, metal] = (d.handle || "lever-chrome").split("-");
  const m = metalStops(metal === "brass" ? "brass" : metal);
  const right = d.side !== "left";
  const hx = right ? L.x + L.w - 22 : L.x + 22, y = L.y + L.h * 0.52, dir = right ? -1 : 1;
  let s = `<defs><linearGradient id="hm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m[0]}"/><stop offset="0.5" stop-color="${m[1]}"/><stop offset="1" stop-color="${m[2]}"/></linearGradient></defs>`;
  if (type === "lever") {
    s += `<rect x="${hx - 6}" y="${y - 28}" width="12" height="56" rx="6" fill="url(#hm)"/><circle cx="${hx}" cy="${y}" r="7.5" fill="url(#hm)" stroke="#0004" stroke-width="0.6"/>` +
      `<rect x="${dir < 0 ? hx - 46 : hx}" y="${y - 4}" width="46" height="8" rx="4" fill="url(#hm)" stroke="#0003" stroke-width="0.5"/>`;
  } else if (type === "bar") {
    s += `<rect x="${hx - 4}" y="${y - 74}" width="8" height="150" rx="4" fill="url(#hm)" stroke="#0003" stroke-width="0.5"/><rect x="${hx - 10}" y="${y - 62}" width="6" height="6" fill="${m[2]}" opacity="0.7"/><rect x="${hx - 10}" y="${y + 56}" width="6" height="6" fill="${m[2]}" opacity="0.7"/>`;
  } else {
    s += `<circle cx="${hx}" cy="${y}" r="13" fill="url(#hm)" stroke="#0004" stroke-width="0.8"/><circle cx="${hx - 3}" cy="${y - 3}" r="4" fill="#fff" opacity="0.4"/>`;
  }
  const hxs = right ? L.x + 5 : L.x + L.w - 5;
  s += [0.14, 0.5, 0.86].map(t => `<rect x="${hxs - 2.4}" y="${f(L.y + L.h * t - 9)}" width="4.8" height="18" rx="2" fill="${m[2]}" opacity="0.8"/>`).join("");
  return s;
}

/* ---------- Asosiy ---------- */
function renderDoor(d) {
  const leaf = d.leaf, dk = darken(leaf, 0.16), lt = lighten(leaf, 0.1);
  const wall = d.wall || ["#ddd8cf", "#c5bfb4"], frame = d.frame || darken(leaf, 0.12), floor = d.floor || "#8a7b6a";
  const arch = d.shape === "arch";
  const clipPath = arch
    ? `M${L.x} ${L.y + L.h} L${L.x} ${L.y + L.w / 2} A${L.w / 2} ${L.w / 2} 0 0 1 ${L.x + L.w} ${L.y + L.w / 2} L${L.x + L.w} ${L.y + L.h} Z`
    : `M${L.x} ${L.y} H${L.x + L.w} V${L.y + L.h} H${L.x} Z`;
  const casing = arch
    ? `M${FR.x} ${FLOOR} L${FR.x} ${L.y + L.w / 2 + 6} A${FR.w / 2} ${FR.w / 2 - 4} 0 0 1 ${FR.x + FR.w} ${L.y + L.w / 2 + 6} L${FR.x + FR.w} ${FLOOR} Z`
    : `M${FR.x} ${FR.y} H${FR.x + FR.w} V${FLOOR} H${FR.x} Z`;
  const pat = d.pattern, p = d.p || {};
  let body = "";
  if (pat === "flat") body = "";
  else if (pat === "groovesV") body = groovesV(d, p);
  else if (pat === "groovesH") body = groovesH(d, p);
  else if (pat === "groovesCross") body = groovesV(d, { n: p.n || 2, full: true }) + groovesH(d, { n: p.m || 2 });
  else if (pat === "inlay") body = inlay(d, p);
  else if (pat === "panels") body = panels(d, p);
  else if (pat === "glass") body = (p.base === "panels" ? panels(d, p.panels || { rows: 2 }) : p.base === "grooves" ? groovesV(d, { n: 3 }) : p.base === "inlay" ? inlay(d, { metal: p.metal || "chrome", frame: false, hbar: [0.62] }) : "") + glass(d, p);
  else if (pat === "wood") body = wood(d, p) + (p.groove ? groovesV(d, { n: p.groove, full: false }) : "") + (p.inlay ? inlay(d, { metal: p.inlay, frame: false, hbar: [0.5], inset: 0 }) : "");
  else if (pat === "geo") body = geo(d, p);
  else if (pat === "nod") body = nod(d, p) + (p.extra === "grooves" ? groovesV(d, { n: 2 }) : "");
  const sheen = `<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${lum(leaf) > 0.6 ? 0.28 : 0.16}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600" width="480" height="600">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${wall[0]}"/><stop offset="1" stop-color="${wall[1]}"/></linearGradient>
<radialGradient id="light" cx="0.62" cy="0.16" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="${lum(wall[0]) > 0.5 ? 0.4 : 0.3}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floor}"/><stop offset="1" stop-color="${darken(floor, 0.45)}"/></linearGradient>
<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dk}"/><stop offset="0.5" stop-color="${lt}"/><stop offset="1" stop-color="${dk}"/></linearGradient>
<linearGradient id="casing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${darken(frame, 0.12)}"/><stop offset="0.5" stop-color="${lighten(frame, 0.06)}"/><stop offset="1" stop-color="${darken(frame, 0.14)}"/></linearGradient>
${sheen}
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
<clipPath id="lf"><path d="${clipPath}"/></clipPath>
</defs>
<rect width="480" height="600" fill="url(#wall)"/>
<rect width="480" height="600" fill="url(#light)"/>
<rect y="${FLOOR - 14}" width="480" height="14" fill="${mix(wall[1], "#ffffff", 0.18)}"/>
<rect y="${FLOOR}" width="480" height="${600 - FLOOR}" fill="url(#floor)"/>
<ellipse cx="240" cy="${FLOOR + 8}" rx="150" ry="9" fill="#000" opacity="0.28" filter="url(#soft)"/>
<path d="${casing}" fill="url(#casing)"/>
<path d="${clipPath}" fill="#0b0b0c" opacity="0.55"/>
<path d="${clipPath}" fill="url(#leaf)"/>
<g clip-path="url(#lf)">${body}<path d="${clipPath}" fill="url(#sh)"/></g>
<path d="${clipPath}" fill="none" stroke="${darken(leaf, 0.45)}" stroke-width="1.4"/>
${handle(d)}
</svg>
`;
}

module.exports = { renderDoor, mix, lighten, darken };
