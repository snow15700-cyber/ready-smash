// '09시까지 출근하세요'의 차 5종 (until09_new js/07-car-models.js). 앞 = -z
import * as THREE from 'three';
import { std, addBox, glowSprite } from './arena-kit.js';

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
export const CAR_TYPES = Object.keys(CAR_SPECS);
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
export function makeCar(type, color) {
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

