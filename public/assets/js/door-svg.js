/* YasinDoors — eshik illyustratsiyasi (SVG). Qoplama rangini almashtirib ko‘rsatish uchun:
   YD.doorSVG({ hex, edge, variant, handle, trim, grain }) -> SVG satri.
   Bu — studiya surati EMAS, chizilgan illyustratsiya (haqiqiy mahsulot rasmlari katalogda alohida). */
(function () {
  "use strict";
  var YD = (window.YD = window.YD || {});
  var uid = 0;

  /** 8 ta qoplama (rang) — hikoyalar, hero va mahsulot sahifasida ishlatiladi */
  var FINISHES = [
    { n: "Marvarid oq", hex: "#EDE8DD", edge: "#CFC8B8", gr: 0 },
    { n: "Zig‘ir rang", hex: "#DCD2BF", edge: "#BDB09A", gr: 0 },
    { n: "Tabiiy eman", hex: "#C19A6B", edge: "#9A7449", gr: 0.55 },
    { n: "Yong‘oq", hex: "#6B4A33", edge: "#4A3022", gr: 0.55 },
    { n: "Espresso", hex: "#4A3328", edge: "#33231B", gr: 0.55 },
    { n: "Tosh kulrang", hex: "#9A9C9D", edge: "#74777A", gr: 0 },
    { n: "Grafit", hex: "#3A3B3C", edge: "#222324", gr: 0 },
    { n: "Mat qora", hex: "#232323", edge: "#101010", gr: 0 }
  ];
  var HANDLES = { steel: "#CFCBC1", black: "#1D1D1C", bronze: "#A78346" };

  function doorSVG(o) {
    o = o || {};
    var id = "yd" + (++uid);
    var v = o.variant || "modern";
    var hc = HANDLES[o.handle || "steel"] || HANDLES.steel;
    var gr = Math.max(+o.grain || 0, v === "wood" ? 0.55 : 0);
    var hex = o.hex || "#6B4A33", edge = o.edge || "#4A3022";
    var trim = o.trim === "light" ? "#E9E2D3" : "#25211B";
    var sh = gr > 0.3 ? 0.55 : 0.95;
    var on = function (name) { return v === name ? 1 : 0; };
    var g = function (name, inner) { return on(name) ? "<g>" + inner + "</g>" : ""; };

    var classic =
      '<rect x="28" y="40" width="60" height="150" fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.34)"/><rect x="34" y="46" width="48" height="138" fill="none" stroke="rgba(255,255,255,0.3)"/>' +
      '<rect x="108" y="40" width="60" height="150" fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.34)"/><rect x="114" y="46" width="48" height="138" fill="none" stroke="rgba(255,255,255,0.3)"/>' +
      '<rect x="28" y="214" width="60" height="170" fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.34)"/><rect x="34" y="220" width="48" height="158" fill="none" stroke="rgba(255,255,255,0.3)"/>' +
      '<rect x="108" y="214" width="60" height="170" fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.34)"/><rect x="114" y="220" width="48" height="158" fill="none" stroke="rgba(255,255,255,0.3)"/>';
    var modern =
      '<path d="M45 17V420M62 17V420M79 17V420M96 17V420M113 17V420M130 17V420M147 17V420" stroke="rgba(0,0,0,0.34)" stroke-width="1.6" fill="none"/>' +
      '<path d="M46.6 17V420M63.6 17V420M80.6 17V420M97.6 17V420M114.6 17V420M131.6 17V420M148.6 17V420" stroke="rgba(255,255,255,0.26)" stroke-width="1" fill="none"/>';
    var minimal =
      '<path d="M17 96H183M17 330H183" stroke="rgba(0,0,0,0.26)" stroke-width="1.3" fill="none"/><path d="M17 97.3H183M17 331.3H183" stroke="rgba(255,255,255,0.24)" stroke-width="1" fill="none"/>' +
      '<path d="M150 17V420" stroke="rgba(0,0,0,0.18)" stroke-width="1" fill="none"/>';
    var wood =
      '<path d="M72 17V420M127 17V420" stroke="rgba(0,0,0,0.36)" stroke-width="1.4" fill="none"/><path d="M73.4 17V420M128.4 17V420" stroke="rgba(255,255,255,0.22)" stroke-width="1" fill="none"/>';
    var glass =
      '<rect x="34" y="36" width="96" height="200" fill="rgba(0,0,0,0.25)" stroke="rgba(0,0,0,0.55)" stroke-width="2"/><rect x="38" y="40" width="88" height="192" fill="rgba(10,16,20,0.82)"/>' +
      '<polygon points="38,40 86,40 38,128" fill="rgba(255,255,255,0.13)"/><polygon points="70,232 126,232 126,150 104,232" fill="rgba(255,255,255,0.07)"/>' +
      '<rect x="34" y="36" width="96" height="200" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" transform="translate(0.8,0.8)"/>' +
      '<rect x="34" y="258" width="96" height="124" fill="rgba(0,0,0,0.12)" stroke="rgba(0,0,0,0.34)"/><rect x="40" y="264" width="84" height="112" fill="none" stroke="rgba(255,255,255,0.28)"/>';
    var premium =
      '<path d="M76 17V420M124 17V420" stroke="rgba(0,0,0,0.4)" stroke-width="3.4" fill="none"/><path d="M76 17V420M124 17V420" stroke="#D9BC85" stroke-width="2" fill="none"/>' +
      '<rect x="76" y="108" width="48" height="2" fill="#D9BC85"/><rect x="76" y="300" width="48" height="2" fill="#D9BC85"/>' +
      '<path d="M45 17V420M52 17V420M148 17V420M155 17V420" stroke="rgba(0,0,0,0.26)" stroke-width="1" fill="none"/>';
    var special =
      '<circle cx="88" cy="124" r="36" fill="rgba(0,0,0,0.14)" stroke="rgba(0,0,0,0.42)" stroke-width="1.5"/><circle cx="88" cy="124" r="36" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1" transform="translate(1.4,1.4)"/>' +
      '<circle cx="88" cy="124" r="20" fill="none" stroke="#D9BC85" stroke-width="1.2" opacity="0.8"/>' +
      '<path d="M17 262L183 196M17 322L183 256" stroke="rgba(0,0,0,0.36)" stroke-width="1.5" fill="none"/><path d="M17 263.5L183 197.5M17 323.5L183 257.5" stroke="rgba(255,255,255,0.26)" stroke-width="1" fill="none"/>';

    return '<svg viewBox="0 0 200 420" role="img" aria-label="MDF eshik illyustratsiyasi" style="display:block;width:100%;height:auto;overflow:visible">' +
      "<defs>" +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.14" stop-color="#fff" stop-opacity="0.06"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="0.92" stop-color="#000" stop-opacity="0.2"/><stop offset="1" stop-color="#000" stop-opacity="0.34"/></linearGradient>' +
      '<linearGradient id="' + id + 'v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + id + 'h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>' +
      '<filter id="' + id + 'n" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.5 0.011" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.95"/></filter>' +
      "</defs>" +
      '<rect x="2" y="2" width="196" height="418" fill="' + trim + '"/>' +
      '<rect x="2" y="2" width="196" height="418" fill="url(#' + id + 'g)" opacity="0.55"/>' +
      '<rect x="2" y="2" width="196" height="418" fill="none" stroke="rgba(0,0,0,0.3)"/>' +
      '<rect x="14" y="14" width="172" height="406" fill="' + edge + '"/>' +
      '<rect x="17" y="17" width="166" height="403" fill="' + hex + '"/>' +
      g("classic", classic) + g("modern", modern) + g("minimal", minimal) + g("wood", wood) + g("glass", glass) + g("premium", premium) + g("special", special) +
      '<rect x="17" y="17" width="166" height="403" fill="#000" filter="url(#' + id + 'n)" opacity="' + gr + '"/>' +
      '<rect x="17" y="17" width="166" height="403" fill="url(#' + id + 'v)"/>' +
      '<rect x="17" y="17" width="166" height="403" fill="url(#' + id + 'g)"/>' +
      '<polygon points="66,17 112,17 92,420 44,420" fill="url(#' + id + 's)" opacity="' + sh + '"/>' +
      '<rect x="17" y="17" width="2.2" height="403" fill="#fff" opacity="0.3"/>' +
      '<rect x="180.8" y="17" width="2.2" height="403" fill="#000" opacity="0.34"/>' +
      '<rect x="17" y="17" width="166" height="1.6" fill="#fff" opacity="0.28"/>' +
      '<rect x="12" y="70" width="6" height="22" fill="' + hc + '" opacity="0.6"/><rect x="12" y="200" width="6" height="22" fill="' + hc + '" opacity="0.6"/><rect x="12" y="340" width="6" height="22" fill="' + hc + '" opacity="0.6"/>' +
      '<rect x="169" y="205" width="10" height="46" rx="2" fill="' + hc + '" stroke="rgba(0,0,0,0.35)"/><rect x="169" y="205" width="10" height="46" rx="2" fill="url(#' + id + 'h)"/>' +
      '<rect x="146" y="223" width="32" height="7" rx="3.5" fill="' + hc + '" stroke="rgba(0,0,0,0.35)"/><rect x="146" y="223" width="32" height="7" rx="3.5" fill="url(#' + id + 'h)"/>' +
      '<rect x="2" y="414" width="196" height="6" fill="rgba(0,0,0,0.4)"/>' +
      "</svg>";
  }

  YD.doorSVG = doorSVG;
  YD.FINISHES = FINISHES;
  YD.HANDLES = HANDLES;
})();
