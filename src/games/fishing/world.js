// 낚시 3D: 전망대 → 해변 계단 · 나무 선착장(일자 + 끝이 넓은 모양, 사용자 확정 11/25) · 낚싯대 · 줄 · 찌 · 물고기 그림자 · 물고기 · 물보라
// 좌표는 광장 좌표(m). 바다 = 남쪽(+z), 바다 평균 높이 y = −12, 자갈 해변 z 43~53.
import * as THREE from 'three';
import { addBox, canvasTex, std } from '../../arena-kit.js';

export const SEA_Y = -12;
// 선착장: 해변(z 48)에서 바다 쪽으로 다리 약 14m → 끝 넓은 판 (사람 4~5명)
export const PIER = { x: 13, z0: 47, z1: 62, w: 2.2, head: { x0: 7.5, x1: 18.5, z0: 62, z1: 66.5 }, y: -10.35 };
export const STAND = { z: 65.6, xMin: 8.4, xMax: 17.6 }; // 서는 곳 (끝 판 앞쪽)

// 바다 물결 높이 (src/campusFx.js의 셰이더와 같은 식 — 찌·그림자가 물결을 따라 오르내리게)
const WAVES = [[0.3, 1.0, 26, 0.55, 1.1], [-0.6, 0.8, 15, 0.32, 1.5], [0.9, 0.4, 11, 0.18, 2.1]].map(([dx, dy, L, A, s]) => {
  const n = Math.hypot(dx, dy); return { dx: dx / n, dy: dy / n, k: (Math.PI * 2) / L, A, s };
});
export function seaHeight(x, z, t) {
  const px = x, py = -z; // 바다 판은 눕혀져 있어서 판의 y = −z
  let h = 0;
  for (const w of WAVES) h += w.A * Math.sin(w.k * (w.dx * px + w.dy * py) + t * w.s);
  return SEA_Y + h;
}

const wood = std(0xa8794a, { roughness: 0.85 }), woodDark = std(0x6e4a2b, { roughness: 0.9 }), rope = std(0xd9c9a0);

export function buildPier() {
  const g = new THREE.Group();
  const P = PIER, top = P.y;
  // 다리: 해변 쪽은 낮게 시작해서 경사 → 평평
  const plank = (x, z, w, d, y) => { const b = addBox(g, w, 0.08, d, Math.random() < 0.5 ? wood : std(0xb3855a, { roughness: 0.85 }), x, y, z); b.receiveShadow = true; b.castShadow = true; return b; };
  for (let z = P.z0; z < P.z1; z += 0.5) {
    const y = z < 51 ? -11.75 + ((z - P.z0) / 4) * (top - -11.75) : top;
    plank(P.x, z + 0.25, P.w, 0.505, y);
  }
  for (let x = P.head.x0; x < P.head.x1 - 0.01; x += 0.5) plank(x + 0.25, (P.head.z0 + P.head.z1) / 2, 0.505, P.head.z1 - P.head.z0, top);
  // 기둥 (물속으로)
  const post = (x, z, h = 3.2) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, h, 10), woodDark); c.position.set(x, top - h / 2 + 0.25, z); c.castShadow = true; g.add(c); return c; };
  for (let z = 52; z <= P.z1; z += 3.3) for (const sx of [-1, 1]) post(P.x + sx * (P.w / 2 + 0.05), z);
  for (let x = P.head.x0; x <= P.head.x1 + 0.01; x += (P.head.x1 - P.head.x0) / 4) for (const z of [P.head.z0, P.head.z1]) post(x, z);
  // 다리 난간 (밧줄) — 끝 판 앞쪽은 낚시하려고 비워 둠
  for (const sx of [-1, 1]) {
    for (let z = 51.5; z <= P.z1; z += 2.1) post(P.x + sx * (P.w / 2 + 0.05), z, 1.2).position.y = top + 0.6;
    addBox(g, 0.04, 0.04, P.z1 - 51.5, rope, P.x + sx * (P.w / 2 + 0.05), top + 1.05, (51.5 + P.z1) / 2);
  }
  // 끝 판 양옆·뒤 낮은 턱
  for (const x of [P.head.x0, P.head.x1]) addBox(g, 0.14, 0.18, P.head.z1 - P.head.z0, woodDark, x, top + 0.1, (P.head.z0 + P.head.z1) / 2);
  addBox(g, P.head.x1 - P.head.x0, 0.14, 0.14, woodDark, (P.head.x0 + P.head.x1) / 2, top + 0.08, P.head.z1);
  // 작은 표지판
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(320, 100, (c) => { c.fillStyle = '#fff6e4'; c.fillRect(0, 0, 320, 100); c.strokeStyle = '#6e4a2b'; c.lineWidth = 8; c.strokeRect(4, 4, 312, 92); c.fillStyle = '#5a3418'; c.font = 'bold 50px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎣 낚시터', 160, 54); }) }));
  sign.position.set(P.x - P.w / 2 - 0.6, top + 1.3, 50.5); sign.rotation.y = Math.PI; g.add(sign);
  post(P.x - P.w / 2 - 0.6, 50.5, 1.4).position.y = top + 0.4 - 1.4;
  // 전망대(데크 동쪽 끝)에서 해변으로 내려오는 나무 계단 (꺾임 2번)
  const steps = [[19.3, 35.6, 0.25, 19.3, 40.5, -5.2], [19.3, 40.5, -5.2, 16.2, 40.5, -5.2], [16.2, 40.5, -5.2, 16.2, 46.5, -11.85]];
  for (const [x0, z0, y0, x1, z1, y1] of steps) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(Math.abs(y1 - y0) / 0.22) || Math.round(len / 0.5));
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const s = addBox(g, 1.4, 0.1, len / n + 0.02, wood, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k);
      s.rotation.y = ang; s.castShadow = true;
    }
    for (const sx of [-1, 1]) { // 손잡이
      const mx = (x0 + x1) / 2 + Math.cos(ang) * sx * 0.7, mz = (z0 + z1) / 2 - Math.sin(ang) * sx * 0.7;
      const r = addBox(g, 0.05, 0.05, Math.hypot(len, y1 - y0), woodDark, mx, (y0 + y1) / 2 + 0.95, mz);
      r.rotation.order = 'YXZ'; r.rotation.y = ang; r.rotation.x = Math.atan2(y0 - y1, len);
    }
    if (y0 === y1) { const lf = addBox(g, 4, 0.12, 1.6, wood, (x0 + x1) / 2, y0, z0); lf.castShadow = true; } // 꺾이는 곳 판
    // 받침 기둥
    for (let k = 0; k <= 1; k += 0.5) { const y = y0 + (y1 - y0) * k; const h = y - -12.2; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h, 8), woodDark); c.position.set(x0 + (x1 - x0) * k, y - h / 2, z0 + (z1 - z0) * k); g.add(c); }
  }
  return g;
}

// ── 낚싯대: 마디 8개가 이어져 있어서 끝으로 갈수록 휜다
export function makeRod() {
  const root = new THREE.Group();
  const segs = [];
  const N = 8, L = 2.5;
  let parent = root;
  const grip = std(0x2a2522, { roughness: 0.6 }), blank = std(0x1f3f6e, { roughness: 0.35, metalness: 0.2 }), tipM = std(0xff8a3d, { roughness: 0.4 });
  for (let i = 0; i < N; i++) {
    const s = new THREE.Group();
    s.position.y = i === 0 ? 0 : L / N;
    const r0 = 0.024 - i * 0.0026, r1 = 0.024 - (i + 1) * 0.0026;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.004, r1), Math.max(0.005, r0), L / N, 8), i < 2 ? grip : i === N - 1 ? tipM : blank);
    m.position.y = L / N / 2; m.castShadow = true; s.add(m);
    parent.add(s); segs.push(s); parent = s;
  }
  // 릴
  const reel = new THREE.Group(); reel.position.set(0, 0.32, 0.06);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), std(0xc9ced6, { metalness: 0.6, roughness: 0.3 })); drum.rotation.z = Math.PI / 2; reel.add(drum);
  const handle = new THREE.Group(); handle.position.x = 0.04; reel.add(handle);
  addBox(handle, 0.01, 0.1, 0.012, std(0x30363d), 0.01, 0.05, 0);
  addBox(handle, 0.03, 0.025, 0.025, std(0xff8a3d), 0.02, 0.1, 0);
  segs[0].add(reel);
  const tip = new THREE.Object3D(); tip.position.y = L / N; segs[N - 1].add(tip);
  // bend: 0~1 (끝이 아래로 휨), side: −1~1 (옆으로), pitch: 대 전체 각도(라디안, 0 = 앞으로 눕힘)
  const pose = (pitch, bend, side = 0, jit = 0) => {
    segs[0].rotation.set(pitch, 0, 0);
    for (let i = 1; i < N; i++) {
      const k = (i / N) ** 1.6;
      segs[i].rotation.x = -bend * 0.42 * k + jit * k * 0.03;
      segs[i].rotation.z = side * bend * 0.12 * k;
    }
  };
  return { root, tip, reelHandle: handle, pose };
}

// ── 낚싯줄: 대 끝 → 찌, 처짐(slack)과 떨림(vib)
export function makeLine() {
  const N = 28;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat); line.frustumCulled = false;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  const set = (from, to, sag, vib, t) => {
    a.copy(from); b.copy(to);
    const arr = geo.attributes.position.array;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      p.lerpVectors(a, b, k);
      p.y -= Math.sin(k * Math.PI) * sag;
      const w = Math.sin(k * Math.PI) * vib * Math.sin(t * 90 + k * 14);
      p.x += (-dz / len) * w; p.z += (dx / len) * w; p.y += w * 0.5;
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { line, set, mat };
}

// ── 찌: 위 빨강·아래 흰색 + 안테나
export function makeBobber() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff3d2a, emissive: 0x551005 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf7f7f2 }));
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
  ant.position.y = 0.2;
  g.add(top, bot, ant);
  return g;
}

// ── 물고기 그림자 (물 위에 어둡게 비치는 모양). 크기로 짐작
let SHADOW_TEX = null;
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  SHADOW_TEX = canvasTex(256, 128, (c) => {
    c.filter = 'blur(6px)';
    c.fillStyle = 'rgba(5,25,40,1)';
    c.beginPath(); c.ellipse(140, 64, 80, 30, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(70, 64); c.lineTo(22, 34); c.lineTo(28, 94); c.closePath(); c.fill();
  });
  return SHADOW_TEX;
}
export function makeShadow(fish) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.5), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: 0.6, depthWrite: false, color: fish.grade === 'legend' ? 0x3a3000 : 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  m.scale.setScalar(fish.shadow);
  const g = new THREE.Group(); g.add(m);
  if (fish.grade === 'legend') { // 전설은 그림자 속에 금빛이 살짝 반짝
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.rotation.x = -Math.PI / 2; glint.position.y = 0.01; glint.renderOrder = 3; g.add(glint); g.userData.glint = glint;
  }
  g.userData.plane = m;
  return g;
}

// ── 물고기 모형 (튀어 오를 때·잡았을 때). 머리가 +x
export function makeFishModel(f) {
  const g = new THREE.Group();
  const bodyM = std(f.body, { roughness: 0.35, metalness: f.ball ? 0.55 : 0.15 }), bellyM = std(f.belly, { roughness: 0.4 });
  if (f.ball) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), bodyM); g.add(b);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 32), std(0xffffff, { roughness: 0.3 })); seam.rotation.y = Math.PI / 2; g.add(seam);
  } else {
    const pts = [[0, -0.5], [0.08, -0.42], [0.15, -0.2], [0.18, 0.05], [0.15, 0.3], [0.09, 0.45], [0, 0.52]].map(([r, y]) => new THREE.Vector2(r, y));
    const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), bodyM); b.rotation.z = -Math.PI / 2; b.scale.set(1, 1, 0.55); g.add(b);
    const bl = new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 0.96, p.y * 0.92)), 18, Math.PI * 0.8, Math.PI * 0.4), bellyM); bl.rotation.z = -Math.PI / 2; bl.scale.set(1, 1, 0.55); g.add(bl);
    if (f.stripe) for (let i = 0; i < 4; i++) { const s = addBox(g, 0.03, 0.08, 0.2, std(0x1c3550), -0.15 + i * 0.09, 0.11, 0); s.rotation.z = 0.5; s.scale.z = 0.5; }
  }
  const finM = f.ball ? std(0xffe07a, { metalness: 0.4, roughness: 0.3 }) : bodyM;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 4), finM); tail.rotation.z = Math.PI / 2; tail.scale.z = 0.25; tail.position.x = f.ball ? -0.38 : -0.56; g.add(tail);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 3), finM); dorsal.position.set(0, f.ball ? 0.32 : 0.2, 0); dorsal.scale.z = 0.3; g.add(dorsal);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyeB = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const sz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeW); e.position.set(f.ball ? 0.22 : 0.36, 0.06, sz * (f.ball ? 0.18 : 0.085)); g.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeB); p.position.set(f.ball ? 0.245 : 0.385, 0.06, sz * (f.ball ? 0.2 : 0.1)); g.add(p);
  }
  g.userData.tail = tail;
  return g;
}

// ── 물보라 알갱이 + 물결 고리 (모아 두고 다시 씀)
export function makeSplashes(scene) {
  const dropGeo = new THREE.SphereGeometry(0.045, 6, 4), dropMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff });
  const drops = [];
  for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(dropGeo, dropMat); m.visible = false; scene.add(m); drops.push({ m, v: new THREE.Vector3(), life: 0 }); }
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4; scene.add(m); rings.push({ m, r: 0, max: 1, life: 0 }); }
  let di = 0, ri = 0;
  const ring = (x, y, z, max = 1.2) => { const r = rings[ri++ % rings.length]; r.m.position.set(x, y + 0.03, z); r.r = 0.1; r.max = max; r.life = 1; r.m.visible = true; };
  const burst = (x, y, z, n = 14, pow = 1) => {
    for (let i = 0; i < n; i++) {
      const d = drops[di++ % drops.length];
      d.m.position.set(x, y, z); d.v.set((Math.random() - 0.5) * 2.4 * pow, (1.8 + Math.random() * 3) * pow, (Math.random() - 0.5) * 2.4 * pow);
      d.life = 0.5 + Math.random() * 0.6; d.m.visible = true; d.m.scale.setScalar(0.6 + Math.random() * 0.9);
    }
    ring(x, y, z, 0.8 + pow);
  };
  const update = (dt) => {
    for (const d of drops) if (d.life > 0) { d.life -= dt; d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt); if (d.life <= 0) d.m.visible = false; }
    for (const r of rings) if (r.life > 0) { r.life -= dt * 1.1; r.r += dt * 1.6; const s = Math.min(r.r, r.max); r.m.scale.set(s, s, 1); r.m.material.opacity = Math.max(0, r.life) * 0.7; if (r.life <= 0) r.m.visible = false; }
  };
  return { burst, ring, update };
}
