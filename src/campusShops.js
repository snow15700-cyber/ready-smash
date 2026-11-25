// 광장 새 디자인 시안: 가게 3개 다듬기 (plaza.md 20장) — 뽑기방 · 옷가게 · 명예의 전당
// 각 가게는 그룹의 +z가 앞(문) 쪽, 바닥 자리 약 5.6 × 4.4m. 지붕 위 상징(캡슐 돔·옷걸이·트로피)은 그대로 살리고 모양을 곱게.
// 밤에 켜지는 재질은 userData.glow = [낮, 밤] (campusPage.js setSky가 밝기를 바꿈)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTex, std, textTex } from './arena-kit.js';

export const SHOP_W = 5.6, SHOP_D = 4.4, SHOP_H = 3.6;
// 뽑기방 문 앞 노란 작은 뽑기 기계: 캡슐 나오는 곳 (가게 안쪽 좌표 [x, z], 높이 약 0.52)
export const GACHA_OUT = [2.5 - 0.1, SHOP_D / 2 + 0.65 + 0.27];
const FZ = SHOP_D / 2; // 앞면 z
export const FONT = (px) => `bold ${px}px Jua, sans-serif`;

export function box(p, w, h, d, m, x, y, z, r = 0) {
  const b = new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; p.add(b);
  return b;
}
export function cyl(p, rt, rb, h, m, x, y, z, seg = 24) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z); c.castShadow = true; c.receiveShadow = true; p.add(c);
  return c;
}
export function sphere(p, r, m, x, y, z, seg = 16) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), m);
  s.position.set(x, y, z); s.castShadow = true; p.add(s);
  return s;
}
// 돌림판 모양 (단면 [r, y] 점들을 y축으로 돌림): 트로피 컵·받침 등 둥근 것
export function lathe(p, pts, m, x, y, z, seg = 32) {
  const l = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), m);
  l.position.set(x, y, z); l.castShadow = true; p.add(l);
  return l;
}
export function plate(p, lines, w, h, x, y, z, o = {}) {
  const px = o.px || 640;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex(lines, { w: px, h: Math.round((px * h) / w), bg: o.bg === undefined ? '#fffaf0' : o.bg, color: o.color || '#2b2a33', font: o.font || FONT(80), border: o.border || null }), transparent: o.bg === null }));
  m.position.set(x, y, z); p.add(m);
  return m;
}
export const glow = (m, day, night) => { m.userData.glow = [day, night]; m.emissiveIntensity = day; return m; };
// 바깥 꾸미기 자리 (무료 모델로 채워짐: campusPage.js swapProps)
export function propSpot(p, kind, x, y, z, s = 1, seed = 0.5) {
  const e = new THREE.Group(); e.userData.prop = kind; e.userData.extra = true; e.userData.seed = seed;
  e.position.set(x, y, z); e.scale.setScalar(s); p.add(e);
  return e;
}

// ── 공통 재질·무늬
export const MAT = {
  granite: std(0x2b2e33, { roughness: 0.45, metalness: 0.15 }),
  white: std(0xf7f4ee, { roughness: 0.6 }),
  gold: std(0xe8b53c, { metalness: 0.7, roughness: 0.3 }),
  alu: std(0xd3d8db, { metalness: 0.6, roughness: 0.35 }),
  dark: std(0x2b2a33),
  glass: new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.3, depthWrite: false }),
};
export function tileTex(base, grout, n = 8, jitter = 10) {
  const t = canvasTex(256, 256, (g) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = new THREE.Color(base).offsetHSL(0, 0, ((x * 7 + y * 13) % 5 - 2) * (jitter / 1000));
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x * s, y * s, s, s);
    }
    g.strokeStyle = grout; g.lineWidth = 2;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function marbleTex() {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f4efe4'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(160,150,135,.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * 256, y = 0; g.moveTo(x, y); while (y < 256) { x += (Math.random() - 0.5) * 30; y += 20 + Math.random() * 20; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(120,110,95,.25)'; g.lineWidth = 2;
    for (let y = 0; y <= 4; y++) { g.beginPath(); g.moveTo(0, y * 64); g.lineTo(256, y * 64); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function withRepeat(tex, a, b) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(a, b); return t; }

// 받침(검은 돌) + 문 앞 계단
function plinth(g, w = SHOP_W, d = SHOP_D) {
  box(g, w + 0.3, 0.3, d + 0.3, MAT.granite, 0, 0.15, 0, 0.04);
  box(g, 1.8, 0.15, 0.5, MAT.granite, 0, 0.075, FZ + 0.4, 0.03);
}
// 진짜 같은 문: 틀 + 유리 + 가로 살 + 손잡이 + 발판
function door(g, x, frame, { w = 1.25, h = 2.3, double = false } = {}) {
  const y0 = 0.3, z = FZ;
  // 틀: 왼쪽·오른쪽·위 막대 (가운데는 비워서 유리 안쪽이 보이게)
  for (const sx of [-1, 1]) box(g, 0.1, h + 0.12, 0.16, frame, x + sx * (w / 2 + 0.03), y0 + (h + 0.12) / 2, z + 0.06, 0.02);
  box(g, w + 0.16, 0.1, 0.16, frame, x, y0 + h + 0.06, z + 0.06, 0.02);
  const inside = glow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2a8 }), 0.35, 1.1);
  box(g, w, h, 0.04, inside, x, y0 + h / 2, z + 0.02);
  box(g, w, h, 0.03, MAT.glass, x, y0 + h / 2, z + 0.12);
  box(g, w, 0.07, 0.06, frame, x, y0 + h * 0.62, z + 0.12);
  if (double) box(g, 0.06, h, 0.06, frame, x, y0 + h / 2, z + 0.12);
  for (const sx of double ? [-0.12, 0.12] : [w * 0.36]) cyl(g, 0.025, 0.025, 0.5, MAT.gold, x + sx, y0 + 1.1, z + 0.2, 8);
  box(g, w + 0.2, 0.03, 0.6, std(0x5a4636), x, 0.315, z + 0.45); // 발판
}
// 쇼윈도: 깊이 있는 틀 + 불 켜진 안쪽 벽 + 창턱 + 유리. 반환: 진열품을 놓을 z
function showWindow(g, x, w, h, y, frame, backColor = 0xfff4dc) {
  const z = FZ;
  const back = glow(new THREE.MeshStandardMaterial({ color: backColor, emissive: backColor }), 0.3, 1.0);
  box(g, w, h, 0.03, back, x, y, z + 0.01);
  for (const sx of [-1, 1]) box(g, 0.1, h + 0.2, 0.42, frame, x + sx * (w / 2 + 0.05), y, z + 0.2);
  box(g, w + 0.3, 0.1, 0.42, frame, x, y + h / 2 + 0.05, z + 0.2);
  box(g, w + 0.36, 0.12, 0.55, MAT.white, x, y - h / 2 - 0.06, z + 0.26, 0.03); // 창턱
  box(g, w, h, 0.02, MAT.glass, x, y, z + 0.4);
  return z + 0.18;
}
// 줄무늬 차양 (기울어진 판 + 물결 끝 + 받침 막대)
function awning(g, w, x, y, colA, colB, depth = 1.0) {
  const tex = canvasTex(256, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? colB : colA; c.fillRect(i * 32, 0, 32, 64); } });
  tex.repeat.set(w / 2.4, 1); tex.wrapS = THREE.RepeatWrapping;
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, depth), [std(colA), std(colA), top, top, std(colA), std(colA)]);
  a.position.set(x, y, FZ + depth / 2 * Math.cos(0.38)); a.rotation.x = 0.38; a.castShadow = true; g.add(a);
  const n = Math.round(w / 0.4);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(w / n / 2, w / n / 2, 0.05, 12, 1, false, 0, Math.PI), std(i % 2 ? colB : colA));
    s.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    s.position.set(x - w / 2 + w / n / 2 + (i * w) / n, y - Math.sin(0.38) * depth / 2 - 0.02, FZ + depth * Math.cos(0.38) + 0.01); g.add(s);
  }
  for (const sx of [-1, 1]) { const r = box(g, 0.04, 0.04, depth * 0.9, MAT.dark, x + sx * (w / 2 - 0.1), y - 0.25, FZ + depth * 0.42); r.rotation.x = -0.45; }
}
// 간판: 틀 + 글자 판 + 둘레 꼬마전구
function signBoard(g, text, w, h, y, { bg, color, frame, bulbs = true, z = FZ + 0.12 }) {
  box(g, w + 0.2, h + 0.2, 0.14, frame, 0, y, z - 0.04, 0.04);
  plate(g, [text], w, h, 0, y, z + 0.04, { bg, color, font: FONT(Math.round(h * 150)), px: Math.round(w * 160) });
  if (!bulbs) return;
  const bulbM = glow(new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd86a }), 0.5, 2.2);
  const n = Math.round(w / 0.3);
  for (let i = 0; i <= n; i++) for (const sy of [-1, 1]) sphere(g, 0.045, bulbM, -w / 2 - 0.05 + (i * (w + 0.1)) / n, y + sy * (h / 2 + 0.06), z + 0.06, 8);
}
// 벽 조명 (구부러진 갓 등)
function wallLamp(g, x, y, frame) {
  box(g, 0.12, 0.2, 0.06, frame, x, y, FZ + 0.03);
  const arm = box(g, 0.04, 0.04, 0.45, frame, x, y + 0.12, FZ + 0.25); arm.rotation.x = -0.4;
  const shade = cyl(g, 0.06, 0.16, 0.14, frame, x, y + 0.2, FZ + 0.47, 16);
  const bulb = glow(new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe6a0 }), 0.4, 2.5);
  sphere(g, 0.06, bulb, x, y + 0.13, FZ + 0.47, 10);
  return shade;
}
// 옆면 꾸미기: 둥근 창 + 빗물 홈통
function sideDetails(g, frame, inside = 0xfff4dc) {
  const back = glow(new THREE.MeshStandardMaterial({ color: inside, emissive: inside }), 0.25, 0.9);
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 10, 28), frame); ring.position.set(sx * (SHOP_W / 2 + 0.03), 2.2, -0.3); ring.rotation.y = Math.PI / 2; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), back); disc.position.set(sx * (SHOP_W / 2 + 0.01), 2.2, -0.3); disc.rotation.y = sx * Math.PI / 2; g.add(disc);
    cyl(g, 0.05, 0.05, SHOP_H, MAT.alu, sx * (SHOP_W / 2 + 0.06), 0.3 + SHOP_H / 2, -FZ + 0.15, 8);
  }
}
// 문 옆 화분 (흰 화분 + 동그랗게 다듬은 나무 또는 무료 모델 덤불)
function planter(g, x, z, potM, topiary = true) {
  lathe(g, [[0, 0], [0.26, 0], [0.32, 0.5], [0.36, 0.55], [0.3, 0.56], [0, 0.56]], potM, x, 0.3, z, 20);
  if (topiary) {
    const leaf = new THREE.MeshLambertMaterial({ color: 0x4f9a46, flatShading: true });
    cyl(g, 0.04, 0.05, 0.5, std(0x6b4a33), x, 1.05, z, 6);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), leaf); b.position.set(x, 1.45, z); b.castShadow = true; g.add(b);
  } else propSpot(g, 'bush', x, 0.85, z, 0.6, 0.3);
}

// ── 캡슐
export function capsule(p, r, col, x, y, z, rx = 0, rz = 0) {
  const c = new THREE.Group();
  // 가볍게(광장에 캡슐이 120개 넘게): 반구 10×4칸, 가운데 띠는 얇은 원기둥
  c.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), std(col, { roughness: 0.35 })));
  c.add(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff, { roughness: 0.35 })));
  c.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, r * 0.14, 10, 1, true), std(0xeeeeee)));
  c.position.set(x, y, z); c.rotation.set(rx, 0, rz); c.traverse((o) => { o.castShadow = true; }); p.add(c);
  return c;
}
export const CAP_COLS = [0xff4d5a, 0xffd23f, 0x3fb6ff, 0x7ad35a, 0xff9ed2, 0xa77bff, 0xff8a1f];
// 작은 뽑기 기계 (가게 앞에 놓는 것)
function miniGacha(p, rnd, x, z, body, withKnob = false) {
  const g = new THREE.Group(); g.position.set(x, 0.3, z); p.add(g);
  box(g, 0.55, 0.75, 0.5, std(body, { roughness: 0.4 }), 0, 0.375, 0, 0.05);
  box(g, 0.4, 0.22, 0.04, MAT.white, 0, 0.55, 0.26, 0.02);
  // 손잡이 (돌리는 것): 실제 광장 뽑기 연출이 돌림 (ui/plaza.js gachaFrame, 이름 'gacha-knob')
  const knob = new THREE.Group(); knob.position.set(0.08, 0.55, 0.29);
  const disc = cyl(knob, 0.09, 0.09, 0.05, MAT.alu, 0, 0, 0, 16); disc.rotation.x = Math.PI / 2;
  box(knob, 0.17, 0.035, 0.035, MAT.dark, 0, 0, 0.035);
  g.add(knob);
  if (withKnob) { knob.name = 'gacha-knob'; knob.userData.dyn = true; }
  box(g, 0.18, 0.12, 0.05, MAT.dark, -0.1, 0.22, 0.26);
  cyl(g, 0.27, 0.27, 0.06, MAT.white, 0, 0.78, 0, 20);
  for (let i = 0; i < 9; i++) capsule(g, 0.07, CAP_COLS[i % 7], (rnd() - 0.5) * 0.3, 0.9 + rnd() * 0.15, (rnd() - 0.5) * 0.3, rnd() * 3, rnd() * 3);
  sphere(g, 0.27, MAT.glass, 0, 0.95, 0, 20);
  cyl(g, 0.06, 0.08, 0.06, std(body), 0, 1.23, 0, 12);
}

// ① 뽑기방: 빨간 타일 벽 + 흰 기둥·처마 + 캡슐 쇼윈도 + 문 앞 작은 뽑기 기계 2대 + 지붕 위 거대 캡슐 돔
export function gachaShop(rnd) {
  const g = new THREE.Group();
  plinth(g);
  const red = new THREE.MeshStandardMaterial({ map: withRepeat(tileTex('#d8323a', 'rgba(120,10,20,.45)'), SHOP_W / 1.6, SHOP_H / 1.6), roughness: 0.35 });
  box(g, SHOP_W, SHOP_H, SHOP_D, red, 0, 0.3 + SHOP_H / 2, 0);
  for (const sx of [-1, 1]) box(g, 0.32, SHOP_H, 0.32, MAT.white, sx * (SHOP_W / 2), 0.3 + SHOP_H / 2, FZ - 0.05, 0.06); // 모서리 흰 기둥
  // 처마: 흰 띠 2단 + 금 줄 + 지붕 판
  box(g, SHOP_W + 0.3, 0.32, SHOP_D + 0.3, MAT.white, 0, 0.3 + SHOP_H + 0.16, 0, 0.05);
  box(g, SHOP_W + 0.45, 0.14, SHOP_D + 0.45, MAT.white, 0, 0.3 + SHOP_H + 0.39, 0, 0.04);
  box(g, SHOP_W + 0.32, 0.05, 0.05, MAT.gold, 0, 0.3 + SHOP_H + 0.02, FZ + 0.16);
  // 쇼윈도 (왼쪽): 선반 3단 + 캡슐 + 'NEW!' 스티커
  const wx = -1.25, wz = showWindow(g, wx, 2.2, 1.55, 1.55, MAT.white, 0xfff1e0);
  for (let s = 0; s < 3; s++) {
    box(g, 2.1, 0.04, 0.3, MAT.white, wx, 0.95 + s * 0.45, wz);
    for (let i = 0; i < 9; i++) capsule(g, 0.1, CAP_COLS[(i + s) % 7], wx - 0.9 + i * 0.225, 1.07 + s * 0.45, wz, rnd() * 3, rnd() * 3);
  }
  const st = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ map: textTex(['NEW!'], { w: 200, h: 200, bg: '#ffd23f', color: '#d8323a', font: FONT(62) }) }));
  st.position.set(wx + 0.78, 2.05, FZ + 0.42); st.rotation.z = 0.2; g.add(st);
  door(g, 1.5, MAT.gold);
  plate(g, ['OPEN'], 0.5, 0.2, 1.5, 2.05, FZ + 0.15, { bg: '#ffffff', color: '#d8323a', font: FONT(70), px: 250, border: '#d8323a' });
  awning(g, SHOP_W + 0.1, 0, 0.3 + SHOP_H - 0.35, '#d8323a', '#ffffff', 1.0);
  signBoard(g, '🛒 뽑기', 2.6, 0.55, 0.3 + SHOP_H + 0.2, { bg: '#d8323a', color: '#ffffff', frame: MAT.white, z: FZ + 0.2 });
  wallLamp(g, -1.6, 3.0, MAT.dark); wallLamp(g, 1.6, 3.0, MAT.dark);
  // 문 앞 작은 뽑기 기계 2대 (진짜 뽑기 가게처럼)
  miniGacha(g, rnd, -2.45, FZ + 0.65, 0x3f7fe0);
  miniGacha(g, rnd, 2.5, FZ + 0.65, 0xffb000, true); // 이 기계에서 캡슐이 굴러 나옴 (뽑기 연출, GACHA_OUT)
  sideDetails(g, MAT.white, 0xfff1e0);
  // 지붕 위 거대 캡슐 돔: 돌림판 받침(흰·금) + 꼬마전구 둘레 + 유리 돔 + 캡슐 + 빨간 꼭지
  const Y = 0.3 + SHOP_H + 0.46, R = 2.05;
  lathe(g, [[0, 0], [R + 0.35, 0], [R + 0.35, 0.18], [R + 0.2, 0.3], [R + 0.25, 0.55], [R + 0.05, 0.6], [0, 0.6]], MAT.white, 0, Y, -0.15, 48);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.27, 0.05, 8, 64), MAT.gold); ring.rotation.x = Math.PI / 2; ring.position.set(0, Y + 0.42, -0.15); g.add(ring);
  const bulbM = glow(new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd86a }), 0.5, 2.2);
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; sphere(g, 0.06, bulbM, Math.cos(a) * (R + 0.36), Y + 0.12, -0.15 + Math.sin(a) * (R + 0.36), 8); }
  for (let i = 0; i < 80; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (R - 0.35), y = Y + 0.85 + rnd() * rnd() * 1.4;
    if (Math.hypot(rr, y - Y - 0.6) > R - 0.3) continue;
    capsule(g, 0.24 + rnd() * 0.08, CAP_COLS[i % 7], Math.cos(a) * rr, y, -0.15 + Math.sin(a) * rr, rnd() * 3, rnd() * 3);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe6f7ff, transparent: true, opacity: 0.22, roughness: 0.02, metalness: 0.2, depthWrite: false }));
  dome.position.set(0, Y + 0.6, -0.15); g.add(dome);
  lathe(g, [[0, 0], [0.42, 0], [0.42, 0.12], [0.3, 0.32], [0.12, 0.42], [0, 0.44]], std(0xd8323a, { roughness: 0.35 }), 0, Y + 0.58 + R, -0.15, 24);
  return g;
}

// 마네킹: 받침 + 기둥 + 옷 입은 몸 + 팔 + 머리
function mannequin(p, x, z, top, bottom, dress = false) {
  cyl(p, 0.16, 0.18, 0.04, MAT.gold, x, 0.66, z, 16);
  cyl(p, 0.02, 0.02, 0.4, MAT.gold, x, 0.86, z, 8);
  if (dress) lathe(p, [[0, 0], [0.3, 0], [0.18, 0.55], [0.15, 0.85], [0.08, 0.95], [0, 0.95]], std(top), x, 1.0, z, 20);
  else { lathe(p, [[0, 0], [0.2, 0], [0.18, 0.4], [0, 0.4]], std(bottom), x, 1.0, z, 16); lathe(p, [[0, 0], [0.19, 0], [0.22, 0.4], [0.15, 0.55], [0, 0.55]], std(top), x, 1.4, z, 16); }
  for (const sx of [-1, 1]) { const a = cyl(p, 0.045, 0.05, 0.5, std(dress ? 0xf1e3d3 : top), x + sx * 0.24, 1.6, z, 8); a.rotation.z = sx * 0.25; }
  sphere(p, 0.14, std(0xf1e3d3), x, 2.08, z, 16);
}
// 티셔츠 모양 (판을 두께 있게 뽑아냄)
function teeShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.55, -0.8); s.lineTo(0.55, -0.8); s.lineTo(0.55, 0.25); s.lineTo(0.9, 0.05); s.lineTo(1.12, 0.42); s.lineTo(0.6, 0.8);
  s.quadraticCurveTo(0, 0.55, -0.6, 0.8); s.lineTo(-1.12, 0.42); s.lineTo(-0.9, 0.05); s.lineTo(-0.55, 0.25); s.closePath();
  return s;
}

// ② 옷가게(부티크): 남색 벽 + 흰 몰딩 판 + 쇼윈도 2개(마네킹·옷걸이) + 가운데 양문 + 짧은 차양 2개 + 동그란 나무 화분 + 지붕 위 옷걸이·티셔츠
export function closetShop(rnd) {
  const g = new THREE.Group();
  plinth(g);
  const navy = std(0x24467e, { roughness: 0.55 });
  box(g, SHOP_W, SHOP_H, SHOP_D, navy, 0, 0.3 + SHOP_H / 2, 0);
  // 아래쪽 흰 몰딩 판 (앞면 문 양옆 아래) + 위 처마(톱니 장식)
  for (const sx of [-1, 1]) {
    box(g, 1.9, 0.62, 0.05, MAT.white, sx * 1.72, 0.66, FZ + 0.02, 0.02);
    box(g, 1.65, 0.4, 0.06, navy, sx * 1.72, 0.66, FZ + 0.04);
  }
  box(g, SHOP_W + 0.3, 0.35, SHOP_D + 0.3, MAT.white, 0, 0.3 + SHOP_H + 0.17, 0, 0.05);
  box(g, SHOP_W + 0.45, 0.14, SHOP_D + 0.45, MAT.white, 0, 0.3 + SHOP_H + 0.42, 0, 0.04);
  for (let i = 0; i < 22; i++) box(g, 0.1, 0.1, 0.1, MAT.white, -SHOP_W / 2 - 0.05 + i * ((SHOP_W + 0.1) / 21), 0.3 + SHOP_H - 0.05, FZ + 0.1);
  // 쇼윈도 2개 + 마네킹 + 뒤 옷걸이 막대
  for (const [sx, top, bottom, dress] of [[-1, 0xff8a3d, 0x2f3b5c, false], [1, 0xff9ed2, 0, true]]) {
    const wx = sx * 1.72;
    const wz = showWindow(g, wx, 1.55, 1.85, 1.95, MAT.gold, 0xffeef2);
    mannequin(g, wx + sx * 0.25, wz - 0.02, top, bottom, dress);
    box(g, 0.9, 0.03, 0.03, MAT.gold, wx - sx * 0.35, 2.55, wz - 0.12);
    for (let i = 0; i < 4; i++) box(g, 0.08, 0.55, 0.22, std([0x7ad35a, 0xffd23f, 0x3fb6ff, 0xffffff][i]), wx - sx * 0.35 - 0.3 + i * 0.2, 2.25, wz - 0.12);
    awning(g, 1.8, wx, 0.3 + SHOP_H - 0.55, '#24467e', '#ffffff', 0.7);
  }
  door(g, 0, MAT.gold, { w: 1.3, h: 2.4, double: true });
  signBoard(g, '👕 옷장', 2.4, 0.55, 0.3 + SHOP_H + 0.2, { bg: '#ffffff', color: '#24467e', frame: MAT.gold, z: FZ + 0.2 });
  wallLamp(g, -0.95, 3.15, MAT.gold); wallLamp(g, 0.95, 3.15, MAT.gold);
  const pot = std(0xf7f4ee, { roughness: 0.5 });
  planter(g, -0.95, FZ + 0.55, pot); planter(g, 0.95, FZ + 0.55, pot);
  sideDetails(g, MAT.gold, 0xffeef2);
  // 지붕 위: 금 옷걸이 + 걸린 티셔츠(탁구채 그림)
  const Y = 0.3 + SHOP_H + 0.5;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 12, 32, Math.PI * 1.45), MAT.gold); hook.position.set(0, Y + 3.55, 0); hook.rotation.z = -0.7; hook.castShadow = true; g.add(hook);
  cyl(g, 0.07, 0.07, 0.5, MAT.gold, 0, Y + 2.98, 0, 10);
  const wood = std(0xa8743f, { roughness: 0.5 });
  for (const sx of [-1, 1]) { const arm = cyl(g, 0.08, 0.08, 2.5, wood, sx * 1.08, Y + 2.3, 0, 10); arm.rotation.z = sx * (Math.PI / 2 - 0.55); }
  const bar = cyl(g, 0.06, 0.06, 4.1, wood, 0, Y + 1.62, 0, 10); bar.rotation.z = Math.PI / 2;
  const tee = new THREE.Mesh(new THREE.ExtrudeGeometry(teeShape(), { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), std(0xffd23f, { roughness: 0.7 }));
  tee.scale.setScalar(1.05); tee.position.set(0, Y + 0.78, -0.06); tee.castShadow = true; g.add(tee);
  plate(g, ['🏓'], 0.6, 0.6, 0, Y + 0.7, 0.13, { bg: null, font: FONT(190), px: 256 });
  return g;
}

// 트로피 (돌림판 컵 + 손잡이 + 별)
function trophy(p, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); p.add(g);
  lathe(g, [[0, 0], [0.75, 0], [0.75, 0.25], [0.6, 0.3], [0.6, 0.55], [0.7, 0.6], [0, 0.6]], std(0x3a2a20, { roughness: 0.5 }), 0, 0, 0, 32); // 나무 받침
  lathe(g, [[0, 0], [0.42, 0], [0.38, 0.1], [0.14, 0.2], [0.1, 0.7], [0.18, 0.85], [0.2, 0.9], [0, 0.9]], MAT.gold, 0, 0.6, 0, 32);
  lathe(g, [[0, 0], [0.2, 0], [0.5, 0.12], [0.85, 0.5], [1.0, 1.15], [1.05, 1.3], [0.98, 1.32], [0, 1.25]], MAT.gold, 0, 1.5, 0, 40);
  for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 10, 24, Math.PI * 1.3), MAT.gold); h.position.set(sx * 1.05, 2.25, 0); h.rotation.z = sx > 0 ? -Math.PI * 0.65 : Math.PI * 0.35 + Math.PI; h.castShadow = true; g.add(h); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), MAT.gold); star.position.set(0, 3.05, 0); star.scale.set(1, 1.2, 0.5); g.add(star);
  plate(g, ['1'], 0.4, 0.4, 0, 0.32, 0.66, { bg: null, color: '#ffd86a', font: FONT(180), px: 200 });
  return g;
}

// ③ 명예의 전당: 대리석 신전 — 3단 계단 + 기둥 4개(받침·홈 무늬·머리) + 남색·금 띠(메달) + 세모 지붕(별) + 청동 문 + 붉은 깃발 + 불 화로 + 지붕 위 트로피
export function fameShop(rnd) {
  const g = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ map: withRepeat(marbleTex(), 1.5, 1), roughness: 0.35 });
  // 계단 3단 (앞으로 넓게)
  for (let i = 0; i < 3; i++) box(g, SHOP_W + 0.9 - i * 0.3, 0.18, SHOP_D + 1.6 - i * 0.5, MAT.white, 0, 0.09 + i * 0.18, 0.4 - i * 0.12, 0.03);
  const Y0 = 0.54, CH = 3.2; // 기둥 시작 높이·기둥 높이
  box(g, SHOP_W - 0.7, CH, SHOP_D - 1.0, marble, 0, Y0 + CH / 2, -0.5); // 안쪽 방
  // 기둥: 홈 무늬 텍스처 원기둥 + 받침(원판·고리) + 머리(고리·네모판)
  const flute = canvasTex(64, 16, (c) => { c.fillStyle = '#f8f4ec'; c.fillRect(0, 0, 64, 16); c.fillStyle = 'rgba(150,140,125,.35)'; for (let i = 0; i < 8; i++) c.fillRect(i * 8 + 2, 0, 3, 16); });
  flute.wrapS = THREE.RepeatWrapping; flute.repeat.set(2, 1);
  const colM = new THREE.MeshStandardMaterial({ map: flute, roughness: 0.4 });
  const cz = FZ + 0.15;
  for (let i = 0; i < 4; i++) {
    const x = -SHOP_W / 2 + 0.45 + i * ((SHOP_W - 0.9) / 3);
    box(g, 0.62, 0.12, 0.62, MAT.white, x, Y0 + 0.06, cz, 0.02);
    const t1 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 24), MAT.white); t1.rotation.x = Math.PI / 2; t1.position.set(x, Y0 + 0.18, cz); g.add(t1);
    cyl(g, 0.21, 0.25, CH - 0.45, colM, x, Y0 + 0.12 + (CH - 0.45) / 2, cz, 28);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 24), MAT.white); t2.rotation.x = Math.PI / 2; t2.position.set(x, Y0 + CH - 0.3, cz); g.add(t2);
    box(g, 0.66, 0.16, 0.66, MAT.white, x, Y0 + CH - 0.12, cz, 0.02);
  }
  // 가로 띠: 흰 들보 + 남색 띠(금 메달) + 처마
  const EY = Y0 + CH;
  box(g, SHOP_W + 0.2, 0.3, SHOP_D + 0.2, MAT.white, 0, EY + 0.15, -0.0, 0.03);
  box(g, SHOP_W + 0.2, 0.45, 0.1, std(0x1c2a4a), 0, EY + 0.52, FZ + 0.06);
  for (let i = 0; i < 7; i++) {
    const md = cyl(g, 0.13, 0.13, 0.04, [MAT.gold, std(0xd9dee6, { metalness: 0.6, roughness: 0.3 }), std(0xc98a4b, { metalness: 0.6, roughness: 0.3 })][i % 3], -2.4 + i * 0.8, EY + 0.52, FZ + 0.13, 20);
    md.rotation.x = Math.PI / 2;
  }
  box(g, SHOP_W + 0.4, 0.18, SHOP_D + 0.4, MAT.white, 0, EY + 0.84, 0, 0.03);
  // 세모 지붕 (박공) + 가운데 금 별
  const tri = new THREE.Shape(); tri.moveTo(-(SHOP_W + 0.4) / 2, 0); tri.lineTo((SHOP_W + 0.4) / 2, 0); tri.lineTo(0, 1.05); tri.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: SHOP_D + 0.4, bevelEnabled: false }), MAT.white);
  ped.position.set(0, EY + 0.93, -(SHOP_D + 0.4) / 2); ped.castShadow = true; g.add(ped);
  const triIn = new THREE.Shape(); triIn.moveTo(-(SHOP_W - 0.4) / 2, 0); triIn.lineTo((SHOP_W - 0.4) / 2, 0); triIn.lineTo(0, 0.72); triIn.closePath();
  const tym = new THREE.Mesh(new THREE.ShapeGeometry(triIn), std(0x1c2a4a)); tym.position.set(0, EY + 1.05, FZ + 0.21); g.add(tym);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), MAT.gold); star.position.set(0, EY + 1.3, FZ + 0.3); star.scale.set(1, 1, 0.4); g.add(star);
  // 청동 양문 (판 무늬) + 위 창 + 간판
  const bronze = std(0x8a5a2b, { metalness: 0.65, roughness: 0.35 });
  box(g, 1.7, 2.6, 0.12, MAT.white, 0, Y0 + 1.3, FZ - 0.42);
  for (const sx of [-1, 1]) {
    box(g, 0.68, 2.3, 0.08, bronze, sx * 0.36, Y0 + 1.15, FZ - 0.34);
    for (const yy of [0.6, 1.6]) box(g, 0.48, 0.7, 0.04, std(0x6e4520, { metalness: 0.6, roughness: 0.4 }), sx * 0.36, Y0 + yy, FZ - 0.29);
    cyl(g, 0.05, 0.05, 0.03, MAT.gold, sx * 0.1, Y0 + 1.15, FZ - 0.28, 12).rotation.x = Math.PI / 2;
  }
  signBoard(g, '🏆 명예의 전당', 2.6, 0.42, EY + 0.52, { bg: '#1c2a4a', color: '#ffe08a', frame: MAT.gold, bulbs: false, z: FZ + 0.2 });
  // 기둥 사이 바깥 벽의 붉은 깃발 (금 테두리)
  for (const sx of [-1, 1]) {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex(64, 192, (c) => { c.fillStyle = '#b3202a'; c.fillRect(0, 0, 64, 192); c.fillStyle = '#e8b53c'; c.fillRect(0, 0, 64, 8); c.fillRect(4, 0, 4, 192); c.fillRect(56, 0, 4, 192); c.beginPath(); c.moveTo(0, 150); c.lineTo(32, 192); c.lineTo(64, 150); c.lineTo(64, 192); c.lineTo(0, 192); c.fill(); c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText('★', 32, 80); }), side: THREE.DoubleSide }));
    flag.position.set(sx * 1.55, Y0 + 2.1, FZ - 0.43); g.add(flag);
    cyl(g, 0.025, 0.025, 0.7, MAT.gold, sx * 1.55, Y0 + 2.92, FZ - 0.4, 8).rotation.z = Math.PI / 2;
  }
  // 계단 양옆 불 화로 (밤에 더 밝음)
  const flameM = glow(new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, transparent: true, opacity: 0.9 }), 0.8, 2.5);
  for (const sx of [-1, 1]) {
    const x = sx * (SHOP_W / 2 + 0.25), z = FZ + 1.05;
    cyl(g, 0.12, 0.18, 0.9, MAT.white, x, 0.45, z, 16);
    lathe(g, [[0, 0], [0.12, 0], [0.38, 0.22], [0.4, 0.28], [0, 0.22]], MAT.gold, x, 0.9, z, 24);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 10), flameM); f.position.set(x, 1.4, z); g.add(f);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), glow(new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd060 }), 1, 2.5)); f2.position.set(x, 1.35, z); g.add(f2);
  }
  // 지붕 위 큰 트로피 (받침 위)
  box(g, 1.7, 0.35, 1.3, MAT.white, 0, EY + 2.1, -0.4, 0.05);
  trophy(g, 0, EY + 2.27, -0.4, 1.0);
  return g;
}
