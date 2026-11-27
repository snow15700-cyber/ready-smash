// 낚시 3D: 전망대 → 해변 계단 · 나무 선착장(일자 + 끝이 넓은 모양, 사용자 확정 11/25) · 낚싯대 · 줄 · 찌 · 물고기 그림자 · 물고기 · 물보라
// 좌표는 광장 좌표(m). 바다 = 남쪽(+z), 바다 평균 높이 y = −12, 자갈 해변 z 43~53.
import * as THREE from 'three';
import { addBox, canvasTex, std } from '../../arena-kit.js';

import { SEA_Y } from '../../campusLayout.js'; // 광장 바다 높이 (낚시 12장: −6)
// 선착장 자리(PIER)는 campusLayout.js, 던지기 계산(STAND·landingPoint 등)은 rules.js에서 바로 불러 쓰기

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

// 선착장·계단은 이제 광장 장면(buildCampus → src/campusPier.js)에 들어 있음 — 시안에서 따로 안 더함

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

// ── 긴 막대찌 + 빛나는 끝 (사용자 확정 11/25): 잠기면 막대가 쏙 사라짐. 원점 = 물에 뜨는 자리(물 높이)
export function makeBobber() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0xff4a2a, emissive: 0x401006 }));
  body.position.y = 0.1; // 물 위로 0.35m, 아래 0.15m
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  band.position.y = 0.2;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.45, 8), new THREE.MeshBasicMaterial({ color: 0xfff36a }));
  ant.position.y = 0.57;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfffbd0 }));
  tip.position.y = 0.8;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff36a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.5); glow.position.y = 0.8;
  g.add(body, band, ant, tip, glow);
  g.userData.glow = glow;
  return g;
}
let GLOW = null;
function glowTex() {
  if (!GLOW) GLOW = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  return GLOW;
}

// ── 기포: 밝은 물빛 동그라미 + 보글보글 올라오는 방울 + 작은 물결 고리
export function makeBubbleFx(scene, fx) {
  const discGeo = new THREE.CircleGeometry(1.6, 32);
  const discs = [];
  const ballGeo = new THREE.SphereGeometry(0.06, 8, 6), ballMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.9 });
  const balls = [];
  for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(ballGeo, ballMat); m.visible = false; scene.add(m); balls.push({ m, life: 0, x: 0, z: 0, y: 0, v: 0 }); }
  let bi = 0, ringT = 0;
  const update = (list, t, dt, seaH) => {
    while (discs.length < list.length) { const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xbff3ff, transparent: true, opacity: 0, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.renderOrder = 2; scene.add(d); discs.push(d); }
    discs.forEach((d, i) => {
      const b = list[i];
      d.visible = !!b;
      if (!b) return;
      const y = seaH(b.x, b.z, t);
      d.position.set(b.x, y + 0.04, b.z);
      d.material.opacity = 0.4 * b.fade * (0.8 + 0.2 * Math.sin(t * 3 + i));
      // 방울 (기포 하나에 1초에 약 14개)
      if (Math.random() < dt * 14 * b.fade) {
        const o = balls[bi++ % balls.length];
        const r = Math.random() * 1.1, a = Math.random() * 6.28;
        o.x = b.x + Math.cos(a) * r; o.z = b.z + Math.sin(a) * r; o.y = y - 0.1; o.v = 0.5 + Math.random() * 0.6; o.life = 0.5 + Math.random() * 0.4;
        o.m.visible = true; o.m.scale.setScalar(0.6 + Math.random() * 1.2);
      }
    });
    ringT -= dt;
    if (ringT <= 0 && list.length) { ringT = 0.35; const b = list[(Math.random() * list.length) | 0]; fx.ring(b.x + (Math.random() - 0.5) * 1.4, seaH(b.x, b.z, t), b.z + (Math.random() - 0.5) * 1.4, 0.35); }
    for (const o of balls) if (o.life > 0) { o.life -= dt; o.y += o.v * dt; o.m.position.set(o.x, Math.min(o.y, seaH(o.x, o.z, t) + 0.12), o.z); if (o.life <= 0) o.m.visible = false; }
  };
  return { update };
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
