/**
 * YasinDoors — 3D eshik sahnasi (Three.js, lokal nusxa).
 *
 * Eshik protsedur usulda (kod orqali) quriladi: tayyor .glb/.gltf model hozircha yo'q.
 * Haqiqiy 3D modelga o'tish uchun: scene.setDoorBuilder((cfg, ctx) => THREE.Object3D) — qaytgan obyekt
 * eshik o'rnini egallaydi (balandligi cfg.h/1000 m, poydevori y=0, markazi x=0,z=0). ctx = { THREE, materials(cfg), colors }.
 *
 * Optimallashtirish: kerak bo'lganda render (doimiy aylanma sikl yo'q), mobilda soya/piksel zichligi kamaytirilgan,
 * teksturalar kod orqali chiziladi (tashqi rasm yuklanmaydi), qayta qurishda geometriya/material tozalanadi.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";

const T = 0.04;                 // eshik qalinligi (m)
const GAP = 0.004;              // eshik va rom orasidagi tirqish
const WALL_D = 0.14;            // devor qalinligi
const HANDLE_Y = 1.0;           // tutqich balandligi (m)

function hexToColor(hex) { return new THREE.Color(hex); }
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return c; }

/* ---------- Yog'och tekstura (kod bilan chiziladi) ---------- */
const woodCache = new Map();
function woodTexture(hex) {
  if (woodCache.has(hex)) return woodCache.get(hex);
  const w = 512, h = 1024, cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = hex; g.fillRect(0, 0, w, h);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const base = new THREE.Color(hex);
  const dark = "#" + base.clone().multiplyScalar(0.62).getHexString();
  const light = "#" + base.clone().lerp(new THREE.Color("#ffffff"), 0.22).getHexString();
  for (let i = 0; i < 170; i++) {                 // uzun tolalar
    const x = rnd() * w, wd = 0.6 + rnd() * 3.2, amp = 2 + rnd() * 9;
    g.globalAlpha = 0.05 + rnd() * 0.13;
    g.strokeStyle = rnd() > 0.45 ? dark : light; g.lineWidth = wd;
    g.beginPath(); g.moveTo(x, 0);
    g.bezierCurveTo(x + amp, h * 0.3, x - amp, h * 0.66, x + (rnd() - 0.5) * amp * 2, h);
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {                  // yirik damlar
    const x = rnd() * w, y = rnd() * h;
    g.globalAlpha = 0.07; g.strokeStyle = dark; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x, y, 5 + k * 5, 24 + k * 22, 0, 0, Math.PI * 2); g.stroke(); }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.5);                          // 1 m x 2 m — shu sababli eshik balandligida tikuv ko'rinmaydi
  tex.anisotropy = 4;
  woodCache.set(hex, tex);
  return tex;
}

/* ---------- Materiallar ---------- */
function makeMaterials(cfg, C) {
  const color = C.COLORS[cfg.color];
  let leaf;
  if (color.wood) {
    const tex = woodTexture(color.hex);
    leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, bumpMap: tex, bumpScale: 0.35, roughness: 0.62, metalness: 0 });
  } else if (cfg.coating === "emal") {
    leaf = new THREE.MeshPhysicalMaterial({ color: color.hex, roughness: 0.34, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.28 });
  } else {
    leaf = new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.8, metalness: 0 });
  }
  const finish = C.HANDLE_FINISHES[cfg.finish];
  const metalParams = cfg.finish === "black" ? { roughness: 0.42, metalness: 0.65 } : cfg.finish === "chrome" ? { roughness: 0.16, metalness: 1 } : { roughness: 0.28, metalness: 1 };
  const handle = new THREE.MeshStandardMaterial({ color: finish.hex, ...metalParams });
  const decorHex = cfg.decor !== "none" ? C.DECORS[cfg.decor].hex : null;
  const decor = decorHex ? new THREE.MeshStandardMaterial({ color: decorHex, roughness: 0.28, metalness: 1 }) : null;
  const groove = new THREE.MeshStandardMaterial({ color: shade(color.wood ? "#5a3d27" : color.hex, color.wood ? 0.8 : 0.5), roughness: 0.9, metalness: 0 });
  const glassDef = cfg.glass === "clear"
    ? { color: 0xd8e6ea, transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0, envMapIntensity: 1.2 }
    : { color: 0xe7edef, transparent: true, opacity: 0.9, roughness: 0.55, metalness: 0, envMapIntensity: 0.6 };
  const glass = new THREE.MeshStandardMaterial(glassDef);
  const trim = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5, metalness: 0.6 });
  const hinge = new THREE.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.35, metalness: 1 });
  const frameHex = cfg.frame === "white" ? "#f1efea" : cfg.frame === "black" ? "#1c1c1e" : null;
  const frame = frameHex
    ? new THREE.MeshStandardMaterial({ color: frameHex, roughness: 0.55, metalness: 0 })
    : leaf;                                        // "eshik rangida" rom — shu material
  const wall = new THREE.MeshStandardMaterial({ color: 0xcfcabf, roughness: 0.95, metalness: 0 });
  return { leaf, handle, decor, groove, glass, trim, hinge, frame, wall };
}

/* ---------- Geometriya yordamchilari ---------- */
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = 0, y = 0;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function extrude(shape, depth, bevel) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
}
function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}
function box(w, h, d, mat, x, y, z, cast = true) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, cast, true); m.position.set(x, y, z); return m;
}

/** To'g'ri to'rtburchak kontur (4 ta yupqa chiziq). Markaz (cx, cy), yuz tekisligidan `lift` balandlikda. */
function outline(group, cx, cy, w, h, th, lift, mat) {
  const z = T / 2 + lift / 2;
  group.add(box(w, th, lift, mat, cx, cy + h / 2 - th / 2, z, false));
  group.add(box(w, th, lift, mat, cx, cy - h / 2 + th / 2, z, false));
  group.add(box(th, h - 2 * th, lift, mat, cx - w / 2 + th / 2, cy, z, false));
  group.add(box(th, h - 2 * th, lift, mat, cx + w / 2 - th / 2, cy, z, false));
}

/* ---------- Yuz (old tomon) detallari: orqa tomon shundan nusxa ---------- */
function buildFace(cfg, C, M, leafGroupForGlass) {
  const W = cfg.w / 1000, H = cfg.h / 1000, g = new THREE.Group();
  const model = cfg.model, variant = cfg.variant;
  const lineMat = M.decor || M.groove;
  const lineLift = M.decor ? 0.0022 : 0.0008;
  const lineTh = M.decor ? 0.006 : 0.0055;
  const panelGrid = (cols, rows) => {
    const m = 0.085, gap = 0.07, bottomM = 0.1;
    const aw = W - 2 * m, ah = H - m - bottomM;
    const pw = (aw - gap * (cols - 1)) / cols;
    const sumGap = gap * (rows.length - 1), usable = ah - sumGap;
    let y = bottomM;
    for (let r = rows.length - 1; r >= 0; r--) {      // pastdan yuqoriga
      const ph = usable * rows[r];
      for (let c = 0; c < cols; c++) {
        const px = -W / 2 + m + c * (pw + gap);
        const geo = extrude(roundedRect(pw, ph, 0.008), 0.006, 0.0032);
        const p = mesh(geo, M.leaf); p.position.set(px, y, T / 2); g.add(p);
        if (M.decor) outline(g, px + pw / 2, y + ph / 2, pw + 0.04, ph + 0.04, 0.005, 0.002, M.decor);
      }
      y += ph + gap;
    }
  };

  if (model === "classic") {
    if (variant === "p2") panelGrid(2, [1]);
    else if (variant === "p6") panelGrid(2, [0.28, 0.36, 0.36]);   // qatorlar yuqoridan pastga (nisbatlar)
    else panelGrid(2, [0.6, 0.4]);                                  // yuqori panel balandroq (klassik proporsiya)
  } else if (model === "flat" && variant === "groove") {
    [0.2, 0.4, 0.6, 0.8].forEach(f => g.add(box(W - 0.0, 0.006, 0.001, M.groove, 0, H * f, T / 2 + 0.0005, false)));
  } else if (model === "lines") {
    const n = variant === "l2" ? 2 : variant === "l5" ? 5 : 3;
    for (let i = 1; i <= n; i++) {
      const x = -W / 2 + (W * i) / (n + 1);
      g.add(box(lineTh, H - 0.12, lineLift, lineMat, x, H / 2, T / 2 + lineLift / 2, false));
    }
  } else if (model === "geo") {
    const inset = 0.11, ow = W - 2 * inset, oh = H - 2 * inset - 0.02, cy = H / 2;
    outline(g, 0, cy, ow, oh, lineTh, lineLift, lineMat);
    if (variant === "cross") {
      g.add(box(lineTh, oh - 2 * lineTh, lineLift, lineMat, 0, cy, T / 2 + lineLift / 2, false));
      g.add(box(ow - 2 * lineTh, lineTh, lineLift, lineMat, 0, cy, T / 2 + lineLift / 2, false));
    } else {
      const by = H * 0.6;
      g.add(box(ow - 2 * lineTh, lineTh, lineLift, lineMat, 0, by, T / 2 + lineLift / 2, false));
      g.add(box(lineTh, by - (cy - oh / 2) - lineTh, lineLift, lineMat, 0, (by + cy - oh / 2) / 2, T / 2 + lineLift / 2, false));
      const ty = (by + cy + oh / 2) / 2, th = (cy + oh / 2) - by - 0.05;
      outline(g, 0, ty, ow - 0.1, th, lineTh * 0.8, lineLift, lineMat);
    }
  } else if (model === "glass") {
    const panes = [];
    if (variant === "bands") {
      for (let i = 0; i < 5; i++) panes.push([0, H * (0.24 + i * 0.135), W * 0.62, H * 0.075]);
    } else if (variant === "grid") {
      panes.push([0, H * 0.56, W * 0.72, H * 0.76]);
    } else {
      panes.push([0, H * 0.58, W * 0.26, H * 0.62]);
    }
    panes.forEach(([x, y, pw, ph]) => {
      const pane = mesh(new THREE.BoxGeometry(pw, ph, T + 0.004), M.glass, false, false); pane.position.set(x, y, 0);
      pane.renderOrder = 2; leafGroupForGlass.add(pane);
      outline(g, x, y, pw + 0.024, ph + 0.024, 0.012, 0.0018, M.trim);
    });
    if (variant === "grid") {
      const [x, y, pw, ph] = panes[0];
      g.add(box(0.012, ph, 0.0026, M.trim, x, y, T / 2 + 0.0013, false));
      [-0.25, 0, 0.25].forEach(f => g.add(box(pw, 0.012, 0.0026, M.trim, x, y + ph * f, T / 2 + 0.0013, false)));
    }
  }

  g.add(buildHandle(cfg, C, M, W));
  return g;
}

/* ---------- Tutqich ---------- */
function buildHandle(cfg, C, M, W) {
  const h = new THREE.Group();
  const latchRight = cfg.hinge === "left";
  const edge = W / 2 - 0.065, hx = latchRight ? edge : -edge, dir = latchRight ? -1 : 1;   // dasta eshik markaziga qarab (ilmoq tomonga)
  h.position.set(hx, HANDLE_Y, T / 2);
  const zc = (z, r, len) => { const m = new THREE.CylinderGeometry(r, r, len, 28); m.rotateX(Math.PI / 2); return m; };
  const add = (geo, x, y, z) => { const m = mesh(geo, M.handle); m.position.set(x, y, z); h.add(m); return m; };

  if (cfg.handle === "bar") {
    add(zc(0, 0.009, 0.05), 0, 0.17, 0.025);
    add(zc(0, 0.009, 0.05), 0, -0.17, 0.025);
    add(new THREE.CylinderGeometry(0.0115, 0.0115, 0.46, 28), 0, 0, 0.055);
    add(new THREE.SphereGeometry(0.0115, 20, 12), 0, 0.23, 0.055);
    add(new THREE.SphereGeometry(0.0115, 20, 12), 0, -0.23, 0.055);
  } else if (cfg.handle === "round") {
    add(zc(0, 0.032, 0.012), 0, 0, 0.006);
    add(zc(0, 0.011, 0.04), 0, 0, 0.026);
    const k = add(new THREE.SphereGeometry(0.036, 32, 20), 0, 0, 0.056); k.scale.set(1, 1, 0.92);
  } else {
    add(zc(0, 0.028, 0.012), 0, 0, 0.006);
    add(zc(0, 0.0095, 0.04), 0, 0, 0.028);
    const lev = new THREE.CapsuleGeometry(0.0095, 0.12, 6, 16); lev.rotateZ(Math.PI / 2);
    add(lev, dir * 0.06, 0, 0.048);
    add(new THREE.SphereGeometry(0.0125, 16, 12), 0, 0, 0.044);
  }
  return h;
}

/* ---------- Eshik + rom + devor ---------- */
function buildDoorDefault(cfg, ctx) {
  const { C } = ctx;
  const M = makeMaterials(cfg, C);
  const W = cfg.w / 1000, H = cfg.h / 1000;
  const root = new THREE.Group();
  root.userData.materials = M;

  // Eshik panjarasi (bevel bilan — qirralar yorug'likni ushlaydi)
  const leafGroup = new THREE.Group(); root.add(leafGroup);
  const leafShape = new THREE.Shape(); leafShape.moveTo(0, 0); leafShape.lineTo(W, 0); leafShape.lineTo(W, H); leafShape.lineTo(0, H); leafShape.closePath();
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: T - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  leafGeo.translate(-W / 2, 0, -(T - 0.004) / 2);
  const leaf = mesh(leafGeo, M.leaf); leafGroup.add(leaf);

  const front = buildFace(cfg, C, M, leafGroup);
  const back = front.clone(); back.scale.z = -1;     // orqa tomon — old tomonning ko'zgudagi nusxasi
  leafGroup.add(front, back);

  // Ilmoqlar (eshikning chetida, ikki tomondan ko'rinadi)
  const hx = (cfg.hinge === "left" ? -1 : 1) * (W / 2 + 0.0015);
  [0.25, H / 2, H - 0.25].forEach(y => {
    const hg = new THREE.CylinderGeometry(0.0085, 0.0085, 0.11, 16);
    const m = mesh(hg, M.hinge); m.position.set(hx, y, 0); leafGroup.add(m);
  });

  // Rom (jamb)
  const hasFrame = cfg.frame !== "none", jw = hasFrame ? 0.07 : 0, jd = WALL_D + 0.012;
  const ow = W + 2 * GAP, oh = H + GAP;            // eshik uchun ochiq joy
  if (hasFrame) {
    const topH = jw;
    root.add(box(jw, H + GAP + topH, jd, M.frame, -(ow / 2 + jw / 2), (H + GAP + topH) / 2, 0));
    root.add(box(jw, H + GAP + topH, jd, M.frame, ow / 2 + jw / 2, (H + GAP + topH) / 2, 0));
    root.add(box(ow + 2 * jw, topH, jd, M.frame, 0, H + GAP + topH / 2, 0));
  }
  // Devor: eshik/rom atrofida teshik qoldirib quriladi
  const holeW = ow + 2 * jw, holeH = oh + jw, wallW = 3.4, wallH = 2.8;
  const wx = (wallW - holeW) / 2;
  root.add(Object.assign(box(wx, wallH, WALL_D, M.wall, -(holeW / 2 + wx / 2), wallH / 2, 0), { receiveShadow: true }));
  root.add(Object.assign(box(wx, wallH, WALL_D, M.wall, holeW / 2 + wx / 2, wallH / 2, 0), { receiveShadow: true }));
  root.add(Object.assign(box(holeW, wallH - holeH, WALL_D, M.wall, 0, holeH + (wallH - holeH) / 2, 0), { receiveShadow: true }));
  return root;
}

function disposeTree(obj, keepMaterials) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !keepMaterials) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

/* =========================================================
   Sahna
   ========================================================= */
export function createScene(container, options) {
  const C = options.data;                                   // YD_CFG
  const reduceMotion = !!options.reduceMotion;
  const mobile = matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const onError = options.onError || (() => {});

  const renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0d0d0f, 1);
  const canvas = renderer.domElement;
  canvas.classList.add("cfg-canvas");
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);

  // Yorug'lik: asosiy (soyali) + to'ldiruvchi
  const key = new THREE.DirectionalLight(0xfff3e2, 2.3);
  key.position.set(2.4, 3.4, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.8, bottom: -0.4, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.target.position.set(0, 1, 0);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55); fill.position.set(-3, 1.8, 2.2); scene.add(fill);
  const backLight = new THREE.DirectionalLight(0xfff0dc, 1.1); backLight.position.set(-1.5, 2.6, -3.2); scene.add(backLight);   // orqa tomon ham yoritilgan bo'lsin
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1c, 0.3));

  // Pol
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.5, metalness: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8;
  controls.minDistance = 1.2; controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minPolarAngle = 0.25;

  let doorBuilder = buildDoorDefault;
  let door = null, current = null, destroyed = false, raf = 0, idleFrames = 0, ready = false;

  /* ---------- Render sikli: faqat kerak bo'lganda ---------- */
  function render() { renderer.render(scene, camera); }
  function loop() {
    raf = 0;
    if (destroyed) return;
    const moved = controls.update();            // damping tugamaguncha true qaytaradi
    render();
    idleFrames = moved ? 0 : idleFrames + 1;
    if (idleFrames < 2) raf = requestAnimationFrame(loop);
  }
  function requestRender() { idleFrames = 0; if (!raf && !destroyed) raf = requestAnimationFrame(loop); }
  controls.addEventListener("change", requestRender);
  controls.addEventListener("start", requestRender);

  /* ---------- Kamera ---------- */
  const target = new THREE.Vector3(0, 1, 0);
  function fitDistance(H) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const needH = (H * 1.18) / (2 * Math.tan(fov / 2));
    const needW = ((cfgWidth() + 0.5) * 1.05) / (2 * Math.tan(fov / 2) * camera.aspect);
    return Math.max(needH, needW, 2.2);
  }
  function cfgWidth() { return current ? current.w / 1000 : 0.9; }
  const VIEWS = {
    front: { az: 14, el: 5 }, back: { az: 194, el: 5 }, side: { az: 78, el: 5 }, top: { az: 24, el: 38 }
  };
  function applySpherical(az, el, dist, tgt) {
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    camera.position.set(tgt.x + dist * Math.cos(e) * Math.sin(a), tgt.y + dist * Math.sin(e), tgt.z + dist * Math.cos(e) * Math.cos(a));
    controls.target.copy(tgt); camera.lookAt(tgt);
  }
  function currentSpherical() {
    const v = camera.position.clone().sub(controls.target);
    const dist = v.length();
    return { dist, az: THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z)), el: THREE.MathUtils.radToDeg(Math.asin(v.y / dist)) };
  }
  let tween = null;
  function goTo(az, el, dist, tgt, instant) {
    if (tween) { cancelAnimationFrame(tween.raf); tween = null; }
    if (instant || reduceMotion) { applySpherical(az, el, dist, tgt); controls.update(); requestRender(); return; }
    const from = currentSpherical(), fromT = controls.target.clone(), t0 = performance.now(), dur = 650;
    let dAz = az - from.az; dAz = ((dAz + 540) % 360) - 180;              // eng qisqa burilish
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      applySpherical(from.az + dAz * e, from.el + (el - from.el) * e, from.dist + (dist - from.dist) * e, fromT.clone().lerp(tgt, e));
      controls.update(); requestRender();
      if (k < 1) tween.raf = requestAnimationFrame(step); else tween = null;
    };
    tween = { raf: requestAnimationFrame(step) };
  }
  function setView(name, instant) {
    const H = current ? current.h / 1000 : 2;
    if (name === "handle") {
      const latchRight = !current || current.hinge === "left";
      const W = current ? current.w / 1000 : 0.8;
      const tgt = new THREE.Vector3((latchRight ? 1 : -1) * (W / 2 - 0.1), HANDLE_Y, 0);
      goTo(latchRight ? 28 : -28, 8, 1.15, tgt, instant);
      return;
    }
    const v = VIEWS[name] || VIEWS.front;
    goTo(v.az, v.el, fitDistance(H), new THREE.Vector3(0, H * 0.5, 0), instant);
  }

  /* ---------- Eshikni yangilash ---------- */
  function update(cfg) {
    const sizeChanged = !current || current.h !== cfg.h || current.w !== cfg.w;
    current = Object.assign({}, cfg);
    if (door) { scene.remove(door); disposeTree(door, false); door = null; }
    try {
      door = doorBuilder(cfg, { THREE, C, materials: (c) => makeMaterials(c, C) });
    } catch (e) {
      console.error("Eshikni qurishda xato:", e);
      onError(e);
      return;
    }
    scene.add(door);
    const H = cfg.h / 1000;
    key.target.position.set(0, H / 2, 0);
    if (!ready) { setView("front", true); ready = true; }
    else if (sizeChanged) {       // o'lcham o'zgarsa kamera nishoni va masofasi moslashadi (hozirgi burchak saqlanadi)
      const s = currentSpherical();
      goTo(s.az, s.el, Math.min(Math.max(s.dist, fitDistance(H) * 0.7), 7), new THREE.Vector3(0, H / 2, 0), true);
    }
    requestRender();
  }

  /* ---------- O'lcham ---------- */
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  /* ---------- Klaviatura (kanvas fokusda) ---------- */
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    const s = currentSpherical(); let handled = true;
    const H = current ? current.h / 1000 : 2;
    if (e.key === "ArrowLeft") goTo(s.az - 9, s.el, s.dist, controls.target.clone(), true);
    else if (e.key === "ArrowRight") goTo(s.az + 9, s.el, s.dist, controls.target.clone(), true);
    else if (e.key === "ArrowUp") goTo(s.az, Math.min(70, s.el + 6), s.dist, controls.target.clone(), true);
    else if (e.key === "ArrowDown") goTo(s.az, Math.max(2, s.el - 6), s.dist, controls.target.clone(), true);
    else if (e.key === "+" || e.key === "=") goTo(s.az, s.el, Math.max(controls.minDistance, s.dist * 0.88), controls.target.clone(), true);
    else if (e.key === "-" || e.key === "_") goTo(s.az, s.el, Math.min(controls.maxDistance, s.dist / 0.88), controls.target.clone(), true);
    else if (e.key === "Home") setView("front", true);
    else handled = false;
    if (handled) { e.preventDefault(); requestRender(); }
  });

  /* ---------- WebGL kontekst yo'qolishi ---------- */
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onError(new Error("webgl_context_lost")); });
  canvas.addEventListener("webglcontextrestored", () => { if (current) { const c = current; current = null; ready = false; update(c); } });

  /* ---------- Rasm olish (old tomondan, belgilangan o'lchamda) ---------- */
  function snapshot(opts) {
    opts = opts || {};
    const width = opts.width || 720, height = opts.height || 900;
    const type = opts.type || "image/jpeg", quality = opts.quality || 0.86;
    const saved = { pos: camera.position.clone(), tgt: controls.target.clone(), pr: renderer.getPixelRatio(), aspect: camera.aspect };
    if (tween) { cancelAnimationFrame(tween.raf); tween = null; }
    if (opts.view !== "current") setView(opts.view || "front", true);
    renderer.setPixelRatio(1); renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    render();
    const data = canvas.toDataURL(type, quality);
    renderer.setPixelRatio(saved.pr);
    camera.position.copy(saved.pos); controls.target.copy(saved.tgt); camera.aspect = saved.aspect; camera.updateProjectionMatrix();
    resize();
    return data;
  }

  function dispose() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    if (tween) cancelAnimationFrame(tween.raf);
    ro.disconnect(); controls.dispose();
    if (door) disposeTree(door, false);
    envTex.dispose(); pmrem.dispose(); renderer.dispose();
    canvas.remove();
  }

  resize();
  return {
    update, setView, snapshot, dispose, resize,
    setDoorBuilder(fn) { doorBuilder = typeof fn === "function" ? fn : buildDoorDefault; if (current) update(current); },
    get canvas() { return canvas; },
    get info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; }
  };
}
