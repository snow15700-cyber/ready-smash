// 배경(경기장 뽑기) — 체육관 대신 쓰는 장소들
// '09시' 시리즈는 사용자의 다른 게임 '09시까지 출근하세요'(snow15700-cyber/until09_new)의 코스 배경과
// 같은 모양·색으로 만든다 (그 게임 js/06-scene.js·07-car-models.js·08-pets.js·10-destination.js를 옮겨 옴)
// 좌표: 탁구대 가운데 = 원점, 탁구대 긴 쪽 = z, A팀(side 0)은 +z에서 -z를 본다. 단위 m
import * as THREE from 'three';

// 같은 배경이면 모든 PC에서 똑같이 보이게 (건물 높이·창문 불빛 등)
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 빛 번짐 (차 라이트·신호등·가로등)
let GLOW_TEX = null;
const glowMats = {};
function glowSprite(color, size, opacity = 1) {
  if (!GLOW_TEX) {
    GLOW_TEX = canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  const key = color + '_' + opacity;
  const m = glowMats[key] || (glowMats[key] = new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.userData.noFocus = true;
  return s;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function addBox(parent, w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}

/* ================= 차 (09시 게임의 차 5종, 앞 = -z) ================= */
const CARMAT = {
  glass: std(0x1c2a38, { metalness: 0.6, roughness: 0.15 }),
  tire: std(0x151515, { roughness: 0.9 }),
  rim: std(0xc8ccd2, { metalness: 0.9, roughness: 0.25 }),
  darkRim: std(0x2a2a2e, { metalness: 0.7, roughness: 0.3 }),
  chrome: std(0xe6e6e6, { metalness: 1.0, roughness: 0.15 }),
  gold: std(0xf5c542, { metalness: 1.0, roughness: 0.25 }),
  black: std(0x18181b, { roughness: 0.6 }),
  plastic: std(0x2b2d31, { roughness: 0.8 }),
  seat: std(0x5a2e1a, { roughness: 0.7 }),
  white: std(0xf4f4f4, { roughness: 0.4 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff6d5 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  plate: std(0xf0f0f0),
  neonPurple: new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.55, depthWrite: false }),
  neonCyan: new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
  neonCyanGlow: new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, depthWrite: false }),
  orange: new THREE.MeshBasicMaterial({ color: 0xff9a1f }),
};
const PAINT = std(0xffffff), ACCENT = std(0xffffff);
const CAR_SPECS = {
  roadster: { bw: 2.3, bl: 4.4, bh: 0.55, cy: 0.62, wr: 0.38 },
  santafe: { bw: 2.6, bl: 4.9, bh: 1.1, cy: 1.0, wr: 0.52 },
  pony: { bw: 2.1, bl: 3.9, bh: 0.75, cy: 0.72, wr: 0.36 },
  sonata: { bw: 2.5, bl: 5.0, bh: 0.5, cy: 0.55, wr: 0.42 },
  grandeur: { bw: 2.5, bl: 5.4, bh: 0.72, cy: 0.76, wr: 0.43 },
};
const CAR_TYPES = Object.keys(CAR_SPECS);
const ACCENT_COLOR = { roadster: 0xf5c542, santafe: 0x111111, pony: 0xffffff, sonata: 0x111111, grandeur: 0x22d3ee };

function buildCarTemplate(type) {
  const car = new THREE.Group();
  const { bw, bl, bh, cy, wr } = CAR_SPECS[type];
  const top = cy + bh / 2;
  const front = -bl / 2, back = bl / 2;
  const box = (w, h, d, m, x, y, z) => addBox(car, w, h, d, m, x, y, z);
  const paint = PAINT, accent = ACCENT;
  box(bw, bh, bl, paint, 0, cy, 0);
  const axle = bl * 0.31;
  const tireW = type === 'santafe' || type === 'sonata' ? 0.42 : 0.32;
  const rimMat = type === 'sonata' || type === 'grandeur' ? CARMAT.darkRim : CARMAT.rim;
  const tireGeo = new THREE.CylinderGeometry(wr, wr, tireW, 18);
  const rimGeo = new THREE.CylinderGeometry(wr * 0.6, wr * 0.6, tireW + 0.02, 10);
  for (const [sx, z] of [[-1, axle], [1, axle], [-1, -axle], [1, -axle]]) {
    const x = sx * (bw / 2 + (type === 'sonata' ? 0.08 : -0.02));
    const t = new THREE.Mesh(tireGeo, CARMAT.tire); t.rotation.z = Math.PI / 2; t.position.set(x, wr, z); car.add(t);
    const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.z = Math.PI / 2; r.position.set(x, wr, z); car.add(r);
  }
  const lightY = cy + bh * 0.15;
  if (type !== 'grandeur') {
    for (const sd of [-1, 1]) {
      box(0.5, 0.18, 0.06, CARMAT.head, sd * (bw / 2 - 0.4), lightY, front - 0.03);
      box(0.45, 0.18, 0.06, CARMAT.tail, sd * (bw / 2 - 0.35), lightY, back + 0.03);
    }
  }
  box(0.7, 0.22, 0.04, CARMAT.plate, 0, cy - bh * 0.15, back + 0.04);
  box(bw * 0.98, 0.18, 0.2, type === 'santafe' ? CARMAT.plastic : CARMAT.black, 0, cy - bh / 2 + 0.12, back + 0.05);
  box(bw * 0.98, 0.18, 0.2, type === 'santafe' ? CARMAT.plastic : CARMAT.black, 0, cy - bh / 2 + 0.12, front - 0.05);
  const mirrors = (z, y) => { for (const sd of [-1, 1]) box(0.3, 0.16, 0.12, paint, sd * (bw / 2 + 0.12), y, z); };

  if (type === 'roadster') {
    box(bw * 0.86, 0.06, 0.08, CARMAT.chrome, 0, top + 0.42, -0.35);
    const ws = box(bw * 0.84, 0.75, 0.05, CARMAT.glass, 0, top + 0.3, -0.35); ws.rotation.x = -0.45;
    box(bw * 0.8, 0.12, 1.5, CARMAT.black, 0, top + 0.02, 0.6);
    for (const sd of [-1, 1]) {
      box(0.65, 0.3, 0.55, CARMAT.seat, sd * 0.45, top + 0.2, 0.75);
      box(0.65, 0.6, 0.15, CARMAT.seat, sd * 0.45, top + 0.38, 1.05);
      box(0.12, 0.65, 0.12, CARMAT.chrome, sd * 0.45, top + 0.4, 1.3);
    }
    box(1.05, 0.12, 0.12, CARMAT.chrome, 0, top + 0.72, 1.3);
    for (const sd of [-1, 1]) box(0.04, 0.08, bl * 0.85, CARMAT.gold, sd * (bw / 2 + 0.01), cy + bh * 0.25, 0);
    box(bw * 0.5, 0.18, 0.05, CARMAT.chrome, 0, cy - 0.02, front - 0.04);
    mirrors(-0.2, top + 0.2);
  } else if (type === 'santafe') {
    const cl = 3.3, ch = 0.95, cz = 0.35;
    box(bw * 0.9, ch, cl, paint, 0, top + ch / 2, cz);
    for (const sd of [-1, 1]) box(0.04, ch * 0.62, cl * 0.86, CARMAT.glass, sd * (bw * 0.45 + 0.02), top + ch * 0.55, cz);
    box(bw * 0.8, ch * 0.6, 0.04, CARMAT.glass, 0, top + ch * 0.55, cz - cl / 2 - 0.02);
    box(bw * 0.8, ch * 0.5, 0.04, CARMAT.glass, 0, top + ch * 0.6, cz + cl / 2 + 0.02);
    for (const sd of [-1, 1]) box(0.1, 0.12, cl * 0.9, CARMAT.black, sd * bw * 0.38, top + ch + 0.08, cz);
    for (const z of [-0.8, 0.2, 1.2]) box(bw * 0.8, 0.07, 0.1, CARMAT.black, 0, top + ch + 0.16, cz + z);
    box(bw * 0.7, 0.12, 0.12, CARMAT.chrome, 0, cy + 0.15, front - 0.35);
    box(bw * 0.7, 0.12, 0.12, CARMAT.chrome, 0, cy - 0.35, front - 0.35);
    for (const sd of [-1, 1]) {
      box(0.12, 0.65, 0.12, CARMAT.chrome, sd * bw * 0.32, cy - 0.1, front - 0.35);
      for (const z of [axle, -axle]) box(0.18, 0.25, 1.4, CARMAT.plastic, sd * (bw / 2 + 0.06), wr * 2 + 0.05, z);
    }
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18), CARMAT.tire);
    sp.rotation.x = Math.PI / 2; sp.position.set(0, cy + 0.15, back + 0.2); car.add(sp);
    const spc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.32, 10), accent);
    spc.rotation.x = Math.PI / 2; spc.position.copy(sp.position); car.add(spc);
    mirrors(cz - cl / 2 + 0.2, top + 0.4);
  } else if (type === 'pony') {
    const cl = 2.5, ch = 0.8, cz = 0.55;
    box(bw * 0.86, ch, cl, CARMAT.glass, 0, top + ch / 2, cz);
    for (const sd of [-1, 1]) box(0.08, ch, 0.12, paint, sd * bw * 0.43, top + ch / 2, cz - cl / 2 + 0.06);
    box(bw * 0.88, 0.1, cl - 0.1, CARMAT.white, 0, top + ch + 0.05, cz);
    box(bw * 0.86, 0.08, 0.45, accent, 0, top + ch + 0.05, cz + cl / 2 - 0.05);
    for (const x of [-0.25, 0.25]) box(0.22, 0.02, bl * 0.48, accent, x, top + 0.01, front + bl * 0.24);
    for (const sd of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), CARMAT.head);
      hl.rotation.x = Math.PI / 2; hl.position.set(sd * (bw / 2 - 0.4), cy + 0.15, front - 0.05); car.add(hl);
    }
    mirrors(cz - cl / 2 + 0.25, top + 0.3);
  } else if (type === 'sonata') {
    const cl = 1.9, ch = 0.5, cz = 0.25;
    box(bw * 0.72, ch, cl, CARMAT.glass, 0, top + ch / 2, cz);
    box(bw * 0.74, 0.06, cl * 0.75, paint, 0, top + ch + 0.02, cz + 0.1);
    for (const sd of [-1, 1]) for (const z of [axle, -axle]) box(0.22, bh + 0.15, 1.5, paint, sd * (bw / 2 + 0.06), cy + 0.05, z);
    box(bw * 1.04, 0.06, 0.4, CARMAT.black, 0, cy - bh / 2 - 0.02, front - 0.15);
    box(bw * 1.05, 0.08, 0.7, CARMAT.black, 0, top + 0.75, back - 0.35);
    for (const sd of [-1, 1]) {
      box(0.06, 0.35, 0.8, CARMAT.black, sd * bw * 0.52, top + 0.68, back - 0.35);
      box(0.08, 0.7, 0.18, CARMAT.black, sd * bw * 0.32, top + 0.35, back - 0.35);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(bw + 0.8, bl + 0.6), CARMAT.neonPurple);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; car.add(glow);
    mirrors(cz - cl / 2 + 0.15, top + 0.25);
  } else if (type === 'grandeur') {
    const cl = 2.7, ch = 0.66, cz = 0.15;
    box(bw * 0.82, ch, cl, CARMAT.glass, 0, top + ch / 2, cz);
    box(bw * 0.84, 0.06, cl * 0.8, paint, 0, top + ch + 0.02, cz);
    box(bw * 0.95, 0.07, 0.06, CARMAT.neonCyan, 0, cy + bh * 0.35, front - 0.04);
    box(bw * 0.95, 0.1, 0.06, CARMAT.tail, 0, cy + bh * 0.3, back + 0.04);
    box(bw * 0.55, bh * 0.5, 0.05, CARMAT.chrome, 0, cy - 0.05, front - 0.04);
    for (const sd of [-1, 1]) {
      box(0.03, 0.05, bl * 0.9, CARMAT.neonCyan, sd * (bw / 2 + 0.01), cy + bh * 0.1, 0);
      for (const z of [axle, -axle]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(wr * 0.62, 0.03, 6, 20), CARMAT.neonCyan);
        ring.rotation.y = Math.PI / 2; ring.position.set(sd * (bw / 2 + 0.01), wr, z); car.add(ring);
      }
    }
    box(bw * 0.8, 0.05, 0.25, CARMAT.neonCyan, 0, top + 0.03, back - 0.15);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(bw + 0.4, bl + 0.2), CARMAT.neonCyanGlow);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; car.add(glow);
    mirrors(cz - cl / 2 + 0.2, top + 0.25);
  }
  // 라이트 빛 번짐 (비 오는 아침이라 전조등을 켜고 달린다)
  const glowFor = new Map([[CARMAT.head, [0xfff1c0, 1.4]], [CARMAT.tail, [0xff2a2a, 1.2]], [CARMAT.neonCyan, [0x22d3ee, 1.0]]]);
  const lights = [];
  car.traverse((o) => { if (o.isMesh && glowFor.has(o.material) && Math.abs(o.position.z) > bl * 0.4) lights.push(o); });
  for (const o of lights) {
    const [col, sz] = glowFor.get(o.material);
    const sp = glowSprite(col, sz, 0.9);
    sp.position.copy(o.position);
    sp.position.z += o.position.z > 0 ? 0.15 : -0.15;
    car.add(sp);
  }
  return car;
}

const carTemplates = {};
function makeCar(type, color) {
  if (!carTemplates[type]) carTemplates[type] = buildCarTemplate(type);
  const mesh = carTemplates[type].clone();
  const paint = std(color, { metalness: 0.35, roughness: 0.3 });
  const accent = std(ACCENT_COLOR[type], { metalness: 0.3, roughness: 0.4 });
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (o.material === PAINT) o.material = paint;
    else if (o.material === ACCENT) o.material = accent;
  });
  return mesh;
}

/* ================= 반려동물 (09시 게임의 툰 셰이딩 펫, 얼굴 = +z) ================= */
const toonGrad = (() => {
  const d = new Uint8Array([25, 25, 25, 255, 95, 95, 95, 255, 150, 150, 150, 255]);
  const tx = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  tx.minFilter = tx.magFilter = THREE.NearestFilter;
  tx.generateMipmaps = false;
  tx.needsUpdate = true;
  return tx;
})();
const petMats = {};
const PM = (hex) => petMats[hex] || (petMats[hex] = new THREE.MeshToonMaterial({ color: new THREE.Color(hex).multiplyScalar(0.86), gradientMap: toonGrad }));
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x3a2418, side: THREE.BackSide });
function addOutlines(root, t = 0.022) {
  const targets = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && o.material !== OUTLINE && !o.material.transparent && !o.material.isMeshBasicMaterial) targets.push(o); });
  root.updateMatrixWorld(true);
  const size = new THREE.Vector3(), ws = new THREE.Vector3();
  for (const o of targets) {
    o.geometry.computeBoundingBox();
    o.geometry.boundingBox.getSize(size);
    o.getWorldScale(ws);
    const dims = [size.x * ws.x, size.y * ws.y, size.z * ws.z];
    if (Math.min(...dims) < 0.07 || o.geometry.type === 'TorusGeometry') continue;
    const ol = new THREE.Mesh(o.geometry, OUTLINE);
    ol.scale.set(1 + (2 * t) / dims[0], 1 + (2 * t) / dims[1], 1 + (2 * t) / dims[2]);
    ol.userData.noOutline = true;
    o.add(ol);
  }
}
const SPH = new THREE.SphereGeometry(1, 24, 18);
function sph(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1) {
  const s = new THREE.Mesh(SPH, m);
  s.scale.set(r * sx, r * sy, r * sz);
  s.position.set(x, y, z);
  s.castShadow = true;
  parent.add(s);
  return s;
}
const EYE = PM(0x17141a), SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BLUSH = new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55, depthWrite: false });
function eye(parent, x, y, z, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  sph(g, r, EYE, 0, 0, 0, 1, 1.12, 0.7);
  sph(g, r * 0.34, SHINE, r * 0.3, r * 0.38, r * 0.55);
  sph(g, r * 0.16, SHINE, -r * 0.28, -r * 0.3, r * 0.6);
  return g;
}
function blush(parent, x, y, z, r) { const b = sph(parent, r, BLUSH, x, y, z, 1, 0.62, 0.25); b.castShadow = false; return b; }
function closedEye(parent, x, y, z, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 16, Math.PI), EYE);
  m.position.set(x, y, z); parent.add(m); return m;
}
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// 웰시코기: 앉아서 공을 눈으로 따라간다 (공이 튀면 귀가 쫑긋)
function buildCorgi() {
  const g = new THREE.Group();
  const O = PM(0xe8913a), W = PM(0xfff6ea), P = PM(0xff8fa3), K = PM(0x1d1a1f);
  sph(g, 0.33, O, 0, 0.32, -0.08, 1, 0.92, 1.12);
  sph(g, 0.23, W, 0, 0.36, 0.16, 1, 1.12, 0.72);
  for (const sd of [-1, 1]) {
    sph(g, 0.15, O, sd * 0.24, 0.15, -0.14, 0.8, 0.95, 1.2);
    sph(g, 0.085, W, sd * 0.13, 0.1, 0.36, 1, 1.0, 1.5);
  }
  const butt = sph(g, 0.14, W, 0, 0.3, -0.42);
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.08); g.add(head);
  sph(head, 0.3, O, 0, 0, 0, 1.08, 0.96, 1);
  sph(head, 0.21, W, 0, -0.07, 0.17, 1.05, 0.88, 0.72);
  sph(head, 0.06, W, 0, 0.06, 0.25, 0.75, 1.3, 0.45);
  sph(head, 0.13, W, 0, -0.1, 0.27, 1.25, 0.82, 0.95);
  sph(head, 0.048, K, 0, -0.05, 0.39, 1.2, 0.9, 0.9);
  const tongue = sph(head, 0.055, P, 0, -0.2, 0.32, 1, 0.65, 0.7);
  eye(head, -0.13, 0.04, 0.26, 0.055); eye(head, 0.13, 0.04, 0.26, 0.055);
  blush(head, -0.21, -0.07, 0.22, 0.06); blush(head, 0.21, -0.07, 0.22, 0.06);
  const ears = [-1, 1].map((sd) => {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.17, 0.2, -0.02); pivot.rotation.z = -sd * 0.32; head.add(pivot);
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.36, 14), O); e.position.y = 0.17; e.castShadow = true; pivot.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 12), P); inner.position.set(0, 0.14, 0.06); pivot.add(inner);
    return pivot;
  });
  addOutlines(g);
  let look = 0, perk = 0;
  return {
    group: g,
    // yaw: 공 쪽 방향(몸 기준, 라디안), j: 공이 막 튀었을 때 1 → 0
    update(t, dt, yaw, j) {
      look += (Math.max(-1.25, Math.min(1.25, yaw)) - look) * (1 - Math.exp(-dt * 9));
      perk = Math.max(j, perk - dt * 3);
      head.rotation.y = look;
      head.rotation.z = Math.sin(t * 1.6) * 0.05;
      head.rotation.x = Math.sin(t * 1.1) * 0.03 - perk * 0.12;
      ears.forEach((e, i) => { const sd = i ? 1 : -1; e.rotation.z = -sd * (0.32 + Math.sin(t * 13 + i) * 0.05 - perk * 0.2); e.rotation.x = -0.15 - Math.abs(Math.sin(t * 9 + i)) * 0.1; });
      tongue.position.y = -0.2 + Math.sin(t * 7) * 0.012;
      butt.position.x = Math.sin(t * 9) * 0.03; // 엉덩이 씰룩 (꼬리 대신)
    },
  };
}

// 치즈냥: 벤치 위에서 식빵 굽는 잠꾸러기. 가끔 눈 뜨고, 공이 튀면 깜짝
function buildCat() {
  const g = new THREE.Group();
  const O = PM(0xf4a94f), D = PM(0xd9792b), W = PM(0xfff6ea), P = PM(0xff9db0), K = PM(0x5a3a2a);
  const loafGeo = new THREE.SphereGeometry(1, 32, 24), lp = loafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.62);
    lp.setXYZ(i, f(lp.getX(i)), f(lp.getY(i)), f(lp.getZ(i)));
  }
  loafGeo.computeVertexNormals();
  const torso = new THREE.Group(); g.add(torso);
  const loaf = new THREE.Mesh(loafGeo, O); loaf.scale.set(0.31, 0.2, 0.4); loaf.position.set(0, 0.2, -0.06); loaf.castShadow = true; torso.add(loaf);
  for (const z of [-0.32, -0.16, 0.0]) { const st = new THREE.Mesh(loafGeo, D); st.scale.set(0.3, 0.035, 0.045); st.position.set(0, 0.395, z); st.userData.noOutline = true; torso.add(st); }
  const bib = sph(torso, 0.17, W, 0, 0.17, 0.27, 1.25, 0.95, 0.55); bib.userData.noOutline = true;
  for (const sd of [-1, 1]) sph(torso, 0.07, W, sd * 0.1, 0.045, 0.33, 1.15, 0.6, 0.9);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const curve = new THREE.CatmullRomCurve3([v(0.12, 0.06, -0.47), v(0.3, 0.05, -0.36), v(0.36, 0.05, -0.05), v(0.32, 0.05, 0.22), v(0.18, 0.05, 0.38)]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.055, 10, false), O); tailMesh.castShadow = true; tailMesh.userData.noOutline = true; torso.add(tailMesh);
  const tol = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.077, 10, false), OUTLINE); tol.userData.noOutline = true; torso.add(tol);
  const tip = sph(torso, 0.06, D, 0.18, 0.05, 0.38, 1, 1, 1.1);
  const head = new THREE.Group(); head.position.set(0, 0.44, 0.2); g.add(head);
  sph(head, 0.24, O, 0, 0, 0, 1.2, 0.98, 1);
  [-0.06, 0, 0.06].forEach((x) => { const m = sph(head, 0.028, D, x, 0.19, 0.12 - Math.abs(x) * 0.4, 0.55, 1.5, 0.5); m.rotation.z = -x * 4; m.userData.noOutline = true; });
  for (const sd of [-1, 1]) { const m = sph(head, 0.1, W, sd * 0.06, -0.085, 0.18, 1, 0.78, 0.8); m.userData.noOutline = true; }
  sph(head, 0.03, P, 0, -0.035, 0.255, 1.35, 0.85, 0.8);
  for (const sd of [-1, 1]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12, Math.PI), K); m.rotation.z = Math.PI; m.position.set(sd * 0.022, -0.075, 0.262); head.add(m); }
  blush(head, -0.19, -0.05, 0.17, 0.055); blush(head, 0.19, -0.05, 0.17, 0.055);
  const open = new THREE.Group(), shut = new THREE.Group(); head.add(open, shut);
  eye(open, -0.11, 0.035, 0.205, 0.048); eye(open, 0.11, 0.035, 0.205, 0.048);
  closedEye(shut, -0.11, 0.025, 0.228, 0.045); closedEye(shut, 0.11, 0.025, 0.228, 0.045);
  const wm = PM(0x8a7262);
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.007, 0.007), wm);
    w.position.set(sd * 0.22, -0.06 - k * 0.025, 0.15); w.rotation.z = sd * (0.12 - k * 0.12); w.userData.noOutline = true; head.add(w);
  }
  const ears = [-1, 1].map((sd) => {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.15, 0.16, -0.01); pivot.rotation.z = -sd * 0.32; head.add(pivot);
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.17, 12), O); e.scale.z = 0.7; e.position.y = 0.075; e.castShadow = true; pivot.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 10), P); inner.scale.z = 0.5; inner.position.set(0, 0.06, 0.035); inner.userData.noOutline = true; pivot.add(inner);
    return pivot;
  });
  addOutlines(g);
  let startle = 0;
  return {
    group: g,
    update(t, dt, yaw, j) {
      startle = Math.max(j * 0.8, startle - dt * 1.2);
      const awake = startle > 0.05 || t % 7 > 6.1;
      open.visible = awake; shut.visible = !awake;
      const jj = Math.min(1, startle * 2) * (startle > 0.6 ? 1 : 0.3);
      torso.scale.set(1 + jj * 0.04, 1 + Math.sin(t * 1.3) * 0.02 - jj * 0.05, 1);
      head.position.y = 0.44 + Math.sin(t * 1.3) * 0.008 + jj * 0.04;
      head.rotation.z = Math.sin(t * 0.6) * 0.06;
      head.rotation.y = awake ? Math.max(-0.8, Math.min(0.8, yaw)) * 0.6 : 0;
      tip.position.y = 0.05 + Math.max(0, Math.sin(t * 2.6)) * 0.04;
      ears.forEach((e, i) => { const sd = i ? 1 : -1; e.rotation.z = -sd * (0.32 + ((t + i * 1.7) % 5 > 4.8 ? 0.3 : 0)); });
    },
  };
}

/* ================= 도시 (빌딩·신호등·가로등) ================= */
function makeFacade(rnd) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = 64;
  const ge = e.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 64, 64);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const x = 6 + col * 32, y = 6 + row * 32;
    g.fillStyle = '#2b3a4a'; g.fillRect(x, y, 20, 22);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, 20, 5);
    if (rnd() < 0.55) { ge.fillStyle = '#fff'; ge.fillRect(x, y, 20, 22); }
  }
  const map = new THREE.CanvasTexture(c), emap = new THREE.CanvasTexture(e);
  map.colorSpace = emap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emap };
}

function textTex(text, { bg, color, border, w = 512, h = 104, font = 'bold 60px sans-serif' }) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}
function clockTex(hh, mm) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#fdfbf4'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = '#1f2933';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 10, 8, 20); }
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('12', 128, 52); g.fillText('3', 205, 130); g.fillText('6', 128, 206); g.fillText('9', 52, 130);
    g.lineCap = 'round';
    const hand = (a, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
    hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2, 60, 12, '#1f2933');
    hand((mm / 60) * Math.PI * 2, 90, 8, '#1f2933');
    g.fillStyle = '#e0333c'; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
  });
}

// 회사 본사 빌딩 ('㈜ 정시상사' + 9시 시계) — 09시 게임의 출근길 도착지
function buildOffice() {
  const g = new THREE.Group();
  const glass = std(0x7fa7d6, { metalness: 0.85, roughness: 0.12, emissive: 0x0b1a2e });
  const frame = std(0xd9dde3, { metalness: 0.6, roughness: 0.35 });
  const stone = std(0xb9b2a6);
  const dark = std(0x1f2933);
  addBox(g, 40, 9, 18, stone, 0, 4.5, -9);
  addBox(g, 22, 7, 0.3, glass, 0, 3.8, 0.05);
  for (let i = -5; i <= 5; i++) addBox(g, 0.35, 7.4, 0.5, frame, i * 2.2, 3.8, 0.2);
  addBox(g, 16, 0.5, 6, frame, 0, 7.6, 2.6);
  for (const x of [-7, 7]) addBox(g, 0.5, 7.4, 0.5, frame, x, 3.7, 5.3);
  const towerH = 70, tw = 26, td = 14;
  addBox(g, tw, towerH, td, glass, 0, 9 + towerH / 2, -10);
  for (let i = 0; i <= 13; i++) addBox(g, 0.35, towerH, 0.4, frame, -tw / 2 + i * (tw / 13), 9 + towerH / 2, -10 + td / 2 + 0.1);
  for (let y = 12; y < 9 + towerH; y += 4) addBox(g, tw + 0.2, 0.45, td + 0.2, frame, 0, y, -10);
  addBox(g, tw - 4, 5, td - 3, dark, 0, 9 + towerH + 2.5, -10);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 16, 8), frame); ant.position.set(4, 9 + towerH + 13, -10); g.add(ant);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 })); beacon.position.set(4, 9 + towerH + 21.3, -10); g.add(beacon);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.6), new THREE.MeshBasicMaterial({ map: textTex('㈜ 정시상사', { bg: '#0f172a', color: '#e2e8f0', border: '#94a3b8' }) }));
  sign.position.set(0, 9 + towerH + 2.5, -10 + (td - 3) / 2 + 0.05); g.add(sign);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshBasicMaterial({ map: clockTex(9, 0) }));
  clock.position.set(0, 13.5, -0.85); g.add(clock);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.3, 8, 40), frame); rim.position.copy(clock.position); g.add(rim);
  addBox(g, 10, 2, 0.2, stone, 0, 8.6, 0.0);
  return g;
}

/* ================= 출근길: 도로 옆 야외 탁구대 ================= */
// 탁구대는 넓은 인도 위. 탁구대 옆(+x)으로 4차선 도로가 탁구대와 나란히 지나가서
// A팀(오른쪽)·B팀(왼쪽) 모두 쌩쌩 지나가는 차가 보인다. 비 오는 회색 빌딩 숲, 멀리 회사 본사
const LANE = 3.2;
const ROAD_X0 = 4.6;           // 연석(도로 시작)
const ROAD_W = LANE * 4;
const ROAD_X1 = ROAD_X0 + ROAD_W;
const LANES = [0, 1, 2, 3].map((i) => ROAD_X0 + LANE * (i + 0.5));
const CAR_SCALE = 0.78;        // 09시 게임 차는 조금 크게 만들어져 있어 실제 크기(폭 약 1.9m)로 줄임
const SPAN = 150;              // 차가 오가는 길이 (±SPAN)
const OFFICE_Z = -62;          // 회사 본사 자리 (도로 건너편)

function buildCommute(scene) {
  const root = new THREE.Group();
  const rnd = seeded(9);

  // 바닥: 도로 + 인도(타일) + 연석
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, SPAN * 2 + 60), std(0x3a404d, { roughness: 0.55 }));
  road.rotation.x = -Math.PI / 2; road.position.set((ROAD_X0 + ROAD_X1) / 2, 0.005, 0); road.receiveShadow = true;
  root.add(road);
  const tileTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a3a39e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 150 + ((x * 7 + y * 13) % 5) * 5;
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  const walk = (x0, x1) => {
    const w = x1 - x0, t = tileTex.clone();
    t.repeat.set(w / 2.4, (SPAN * 2 + 60) / 2.4);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, SPAN * 2 + 60), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, 0); m.receiveShadow = true;
    root.add(m);
  };
  walk(-12, ROAD_X0);
  walk(ROAD_X1, ROAD_X1 + 6);
  const curbMat = std(0xcfcfc8);
  for (const x of [ROAD_X0, ROAD_X1]) addBox(root, 0.25, 0.15, SPAN * 2 + 60, curbMat, x, 0.075, 0);
  // 차선: 흰 점선 + 가운데 노란 겹선
  const lineW = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), lineY = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  for (const i of [1, 3]) {
    for (let z = -SPAN; z < SPAN; z += 9) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 3), lineW);
      m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X0 + LANE * i, 0.012, z); root.add(m);
    }
  }
  for (const dx of [-0.12, 0.12]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, SPAN * 2 + 60), lineY);
    m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X0 + LANE * 2 + dx, 0.012, 0); root.add(m);
  }

  // 빌딩 숲 (09시 게임과 같은 창문 무늬·벽 색)
  const facades = [makeFacade(rnd), makeFacade(rnd), makeFacade(rnd)];
  const wallColors = [0x9aa3ad, 0x7d8794, 0xa89f94, 0x6f7b88, 0xb5b0a8, 0x8c96a3, 0x5f6b78];
  const roofMat = std(0x55595f);
  const matCache = {};
  const building = (w, h, d, x, z) => {
    const si = Math.floor(rnd() * 3), ci = Math.floor(rnd() * wallColors.length);
    const geo = new THREE.BoxGeometry(w, h, d);
    const rx = Math.max(1, Math.round(d / 3.5)), ry = Math.max(1, Math.round(h / 3.5)), rxx = Math.max(1, Math.round(w / 3.5));
    const uv = geo.attributes.uv;
    // 면 순서 +x, -x, +y, -y, +z, -z (면마다 4점). 옆면은 깊이(d), 앞뒤는 폭(w) 기준으로 창문 개수
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const k = face < 2 ? rx : rxx;
      uv.setXY(i, uv.getX(i) * k, uv.getY(i) * ry);
    }
    const key = si + '_' + ci;
    const side = matCache[key] || (matCache[key] = std(wallColors[ci], { map: facades[si].map, emissive: 0xffc46b, emissiveMap: facades[si].emap, emissiveIntensity: 0 }));
    const b = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    b.position.set(x, h / 2, z);
    root.add(b);
    return b;
  };
  // sd = -1: 탁구대 쪽(왼쪽) 빌딩, +1: 도로 건너편 빌딩
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? -12.6 : ROAD_X1 + 6.6;
    let z = -SPAN;
    while (z < SPAN) {
      const d = 9 + rnd() * 5, w = 10 + rnd() * 6, h = 18 + rnd() * 40;
      if (!(sd > 0 && z + d > OFFICE_Z - 19 && z < OFFICE_Z + 19)) building(w, h, d, x0 + (sd * w) / 2, z + d / 2);
      z += d + 0.6;
    }
    for (let z2 = -SPAN; z2 < SPAN; z2 += 16) {
      const d = 12 + rnd() * 4, w = 14, h = 55 + rnd() * 60;
      if (!(sd > 0 && Math.abs(z2 - OFFICE_Z) < 22)) building(w, h, d, x0 + sd * (24 + rnd() * 6), z2);
    }
  }

  // 회사 본사 ('㈜ 정시상사' + 9시 시계): 도로 건너편에서 도로를 마주 본다
  const office = buildOffice();
  office.scale.setScalar(0.8);
  office.rotation.y = -Math.PI / 2;
  office.position.set(ROAD_X1 + 6.4, 0, OFFICE_Z);
  root.add(office);

  // 신호등 + 횡단보도 (양쪽 팀 앞에 하나씩)
  const poleMat = std(0x3b3f45, { metalness: 0.5, roughness: 0.5 });
  const housingMat = std(0x1b1d20);
  const lampOff = std(0x333333);
  const lampOn = { red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }), yellow: new THREE.MeshBasicMaterial({ color: 0xffc21a }), green: new THREE.MeshBasicMaterial({ color: 0x22e07a }) };
  const glowCol = { red: 0xff2a2a, yellow: 0xffc21a, green: 0x22e07a };
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const lights = [];
  const trafficLight = (z, poleX, dirZ, state) => {
    const g = new THREE.Group();
    const H = 6.4, armLen = 7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, H, 8), poleMat); pole.position.set(poleX, H / 2, 0); g.add(pole);
    const sx = poleX < ROAD_X0 + ROAD_W / 2 ? 1 : -1;
    addBox(g, armLen, 0.16, 0.16, poleMat, poleX + (sx * armLen) / 2, H - 0.15, 0);
    const hx = poleX + sx * (armLen - 1.2);
    addBox(g, 2.0, 0.66, 0.42, housingMat, hx, H - 0.6, 0);
    const lamps = {};
    ['red', 'yellow', 'green'].forEach((k, i) => {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), lampOff);
      l.position.set(hx + (i - 1) * 0.62, H - 0.6, dirZ * 0.22);
      l.rotation.y = dirZ > 0 ? 0 : Math.PI;
      g.add(l);
      const gl = glowSprite(glowCol[k], 1.6, 0.8); gl.position.copy(l.position); gl.position.z += dirZ * 0.05; g.add(gl);
      lamps[k] = { l, gl };
    });
    addBox(g, 0.36, 0.6, 0.3, housingMat, poleX, 2.2, dirZ * 0.24);
    for (let i = 0; i < 8; i++) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2), zebraMat);
      st.rotation.x = -Math.PI / 2; st.rotation.z = Math.PI / 2;
      st.position.set(ROAD_X0 + 0.9 + i * 1.6, 0.013, dirZ * -2.2);
      g.add(st);
    }
    g.position.z = z;
    root.add(g);
    const tl = { lamps, state, timer: 2 + rnd() * 3 };
    const set = () => { for (const [k, o] of Object.entries(tl.lamps)) { o.l.material = k === tl.state ? lampOn[k] : lampOff; o.gl.visible = k === tl.state; } };
    tl.set = set; set();
    lights.push(tl);
  };
  trafficLight(-34, ROAD_X0 - 0.6, 1, 'green');
  trafficLight(34, ROAD_X1 + 0.6, -1, 'red');

  // 가로등 (흐린 아침이라 은은하게 켜 둠)
  const lampHead = std(0xfff1c9, { emissive: 0xffd27a, emissiveIntensity: 0.6 });
  for (let z = -SPAN + 6; z < SPAN; z += 24) {
    for (const [px, dir] of [[ROAD_X0 - 0.5, 1], [ROAD_X1 + 0.5, -1]]) {
      const zz = z + (dir > 0 ? 0 : 12);
      if (Math.abs(zz) < 5) continue; // 탁구대 바로 옆은 비워서 시야를 가리지 않게
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), poleMat); p.position.set(px, 2.5, zz); root.add(p);
      addBox(root, 0.9, 0.16, 0.4, lampHead, px + dir * 0.4, 5, zz);
      const gl = glowSprite(0xffcf7a, 1.4, 0.55); gl.position.set(px + dir * 0.4, 4.85, zz); root.add(gl);
    }
  }

  // 탁구대와 도로 사이의 벤치 (등받이가 도로 쪽) — 치즈냥 자리
  const bench = new THREE.Group();
  const wood = std(0x9a6a3e), metal = std(0x3b3f45, { metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 4; i++) addBox(bench, 0.1, 0.04, 1.6, wood, -0.16 + i * 0.11, 0.44, 0);
  for (let i = 0; i < 2; i++) addBox(bench, 0.04, 0.1, 1.6, wood, -0.26, 0.62 + i * 0.13, 0);
  for (const z of [-0.65, 0.65]) { addBox(bench, 0.5, 0.05, 0.05, metal, -0.02, 0.4, z); addBox(bench, 0.05, 0.42, 0.05, metal, 0.18, 0.21, z); addBox(bench, 0.05, 0.8, 0.05, metal, -0.24, 0.4, z); }
  bench.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  bench.rotation.y = Math.PI;
  bench.position.set(2.45, 0, 0.25);
  root.add(bench);

  // 반려동물: 치즈냥은 벤치 위에서 식빵 굽기, 웰시코기는 벤치 앞에 앉아 공 구경
  const cat = buildCat();
  cat.group.scale.setScalar(0.5);
  cat.group.position.set(2.42, 0.46, 0.45);
  cat.group.rotation.y = -Math.PI / 2;
  root.add(cat.group);
  const corgi = buildCorgi();
  corgi.group.scale.setScalar(0.45);
  corgi.group.position.set(1.95, 0, -0.35);
  corgi.group.rotation.y = -Math.PI / 2;
  root.add(corgi.group);
  const pets = [cat, corgi];

  // 빗줄기 (탁구대 주변만 — 멀리는 안개에 묻힌다)
  const N = 1400, pos = new Float32Array(N * 6);
  const RX = [-14, 24], RZ = 26, RY = 16;
  for (let i = 0; i < N; i++) {
    const x = RX[0] + rnd() * (RX[1] - RX[0]), y = rnd() * RY, z = (rnd() * 2 - 1) * RZ;
    pos.set([x, y, z, x + 0.04, y - 0.55, z + 0.1], i * 6);
  }
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0xd6e0ea, transparent: true, opacity: 0.38, depthWrite: false }));
  rain.frustumCulled = false;
  rain.userData.noFocus = true;
  root.add(rain);

  // 차: 차선마다 몇 대씩 돌고 돈다. 0·1차선은 +z(A팀 쪽으로), 2·3차선은 -z(B팀 쪽으로)
  const cars = [];
  const newCar = (lane, z) => {
    const type = CAR_TYPES[Math.floor(rnd() * CAR_TYPES.length)];
    const mesh = makeCar(type, Math.floor(rnd() * 0xffffff));
    mesh.scale.setScalar(CAR_SCALE);
    const dir = lane < 2 ? 1 : -1;
    mesh.rotation.y = dir > 0 ? Math.PI : 0;
    mesh.position.set(LANES[lane], 0, z);
    root.add(mesh);
    return { mesh, lane, dir, speed: 12 + rnd() * 5 };
  };
  for (let lane = 0; lane < 4; lane++) for (let k = 0; k < 3; k++) cars.push(newCar(lane, -SPAN + ((k + rnd() * 0.6) * 2 * SPAN) / 3));

  // 통째로 반 바퀴 돌려 도로를 -x 쪽으로: 로비 카메라(+x 쪽에서 비스듬히)에서도 도로와 차가 보이게
  root.rotation.y = Math.PI;
  const ballL = new THREE.Vector3();

  return {
    root,
    sky: '#b9c3cc',
    fog: [26, 150],
    far: 320,
    light: { hemi: ['#e4eaf0', '#5c6066', 1.5], sun: ['#f2f0ea', 1.0, [-6, 12, 4]] },
    tick(t, dt, ball, bounce) {
      // 차: 끝에 닿으면 반대쪽 끝에서 다시
      for (const c of cars) {
        c.mesh.position.z += c.dir * c.speed * dt;
        if (c.dir * c.mesh.position.z > SPAN) {
          c.mesh.position.z = -c.dir * SPAN;
          c.speed = 12 + Math.random() * 5;
        }
      }
      // 앞차와 너무 가까우면 속도를 맞춘다 (같은 차선에서 겹치지 않게)
      for (const c of cars) {
        for (const o of cars) {
          if (o === c || o.lane !== c.lane) continue;
          const gap = (o.mesh.position.z - c.mesh.position.z) * c.dir;
          if (gap > 0 && gap < 9) c.speed = Math.min(c.speed, o.speed);
        }
      }
      for (const tl of lights) {
        tl.timer -= dt;
        if (tl.timer <= 0) {
          tl.state = tl.state === 'green' ? 'yellow' : tl.state === 'yellow' ? 'red' : 'green';
          tl.timer = tl.state === 'yellow' ? 1 : 3 + Math.random() * 2;
          tl.set();
        }
      }
      // 비
      const a = rgeo.attributes.position, p = a.array, fall = 14 * dt;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall;
        if (p[i + 4] < 0) { p[i + 1] += RY; p[i + 4] += RY; }
      }
      a.needsUpdate = true;
      // 반려동물: 공 쪽을 본다
      for (const pet of pets) {
        const gp = pet.group.position;
        let yaw = 0;
        if (ball) {
          ballL.set(-ball.x, ball.y, -ball.z); // root가 반 바퀴 돌아 있으니 root 안 좌표로
          yaw = Math.atan2(ballL.x - gp.x, ballL.z - gp.z) - pet.group.rotation.y;
        }
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        pet.update(t, dt, yaw, bounce);
      }
    },
  };
}

const ARENAS = { commute: buildCommute };

// 주소에 ?bg=commute 처럼 붙이면 그 배경으로 (시안 보기용)
export function arenaFromUrl() {
  try { return new URLSearchParams(location.search).get('bg'); } catch { return null; }
}

export function buildArena(id, scene) {
  const f = ARENAS[id];
  if (!f) return null;
  const a = f(scene);
  a.root.traverse((o) => { if (o.isMesh && !o.castShadow) o.receiveShadow = true; });
  scene.add(a.root);
  return a;
}
