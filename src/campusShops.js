// 광장 가게 3개 (plaza.md 8장) — 뽑기방 · 옷장 · 명예의 전당
// 11/28 새 모습(사용자 참고 그림): 2층 가게 = 1층 통유리 진열장(문 + 모서리를 돌아가는 유리) + 층 사이 띠 + 2층 창·색 판 + 지붕 위 큰 상징.
// 단순한 색 덩어리(납작 음영)로 멀리서도 한눈에. 각 가게는 그룹의 +z가 앞(문) 쪽, 바닥 자리 5.6 × 4.4m.
// 밤에 켜지는 재질은 userData.glow = [낮, 밤] (campusPage.js setSky가 밝기를 바꿈)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTex, std, textTex } from './arena-kit.js';

export const SHOP_W = 5.6, SHOP_D = 4.4, SHOP_H = 4.81; // 몸통 높이(1층 + 띠 + 2층, 받침 위)
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
export function withRepeat(tex, a, b) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(a, b); return t; }

// 받침(검은 돌) + 문 앞 계단
function plinth(g, w = SHOP_W, d = SHOP_D) {
  box(g, w + 0.3, 0.3, d + 0.3, MAT.granite, 0, 0.15, 0, 0.04);
  box(g, 1.8, 0.15, 0.5, MAT.granite, 0, 0.075, FZ + 0.4, 0.03);
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


// ── 2층 가게 뼈대
const Y1 = 0.3, F1 = 2.65, BAND = 0.36, F2 = 1.8, PAR = 0.3; // 받침 위 1층 · 띠 · 2층 · 지붕 난간
const YB = Y1 + F1, Y2 = YB + BAND, YT = Y2 + F2; // 띠 아래 · 2층 바닥 · 2층 위
const ROOF_Y = YT + 0.18; // 지붕 바닥 (상징을 놓는 높이)
const HW = SHOP_W / 2, POST = 0.22, IN = 0.75; // 1층 유리 진열장 깊이
const flat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true, ...o });
const litM = (c, day = 0.35, night = 1.1) => glow(new THREE.MeshStandardMaterial({ color: c, emissive: c, roughness: 0.8 }), day, night);
const winGlass = () => glow(new THREE.MeshStandardMaterial({ color: 0x8db6e6, emissive: 0xffdc9a, roughness: 0.15, metalness: 0.15 }), 0, 0.85);

// 한 면에 붙이는 그룹: 안쪽 x = 그 면을 바라볼 때 오른쪽, +z = 바깥 (y는 그대로)
function face(g, side) {
  const f = new THREE.Group();
  if (side === 'front') f.position.z = FZ;
  else if (side === 'right') { f.position.x = HW; f.rotation.y = Math.PI / 2; } else if (side === 'left') { f.position.x = -HW; f.rotation.y = -Math.PI / 2; }
  g.add(f);
  return f;
}
// 2층 창: 유리(밤에 불) + 틀 + 살 + 창턱
function win(f, x, y, w, h, frame, glass, { cols = 2, rows = 2, sill = null } = {}) {
  box(f, w, h, 0.04, glass, x, y, 0);
  const t = 0.09;
  for (const sy of [-1, 1]) box(f, w + t, t, 0.1, frame, x, y + (sy * h) / 2, 0.03);
  for (const sx of [-1, 1]) box(f, t, h, 0.1, frame, x + (sx * w) / 2, y, 0.03);
  for (let i = 1; i < cols; i++) box(f, 0.05, h, 0.07, frame, x - w / 2 + (i * w) / cols, y, 0.03);
  for (let i = 1; i < rows; i++) box(f, w, 0.05, 0.07, frame, x, y - h / 2 + (i * h) / rows, 0.03);
  if (sill) box(f, w + 0.3, 0.08, 0.2, sill, x, y - h / 2 - 0.07, 0.08);
}
// 글자 간판 그림: 글자마다 색 + 진한 테두리 + 아래로 두께(입체 글자 느낌). vertical = 한 줄에 한 글자. icon(c, w, ih) = 위쪽 그림
function signTex(text, cols, { w = 512, h = 128, bg = null, outline = '#2b2a33', vertical = false, icon = null, iconH = 0 } = {}) {
  return canvasTex(w, h, (c) => {
    if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    const top = icon ? h * iconH : 0, H = h - top, chars = [...text];
    if (icon) icon(c, w, top);
    let fs = vertical ? Math.min(w * 0.7, (H / chars.length) * 0.8) : H * 0.72;
    c.font = FONT(Math.round(fs));
    if (!vertical) { const tw = c.measureText(text).width; if (tw > w * 0.9) { fs *= (w * 0.9) / tw; c.font = FONT(Math.round(fs)); } }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const pos = [];
    if (vertical) chars.forEach((_, i) => pos.push([w / 2, top + (H / chars.length) * (i + 0.5)]));
    else { let x = w / 2 - c.measureText(text).width / 2; for (const ch of chars) { const cw = c.measureText(ch).width; pos.push([x + cw / 2, top + H / 2]); x += cw; } }
    const lw = fs * 0.14, dy = fs * 0.08;
    chars.forEach((ch, i) => {
      const [x, y] = pos[i];
      c.fillStyle = c.strokeStyle = outline; c.lineWidth = lw;
      c.strokeText(ch, x, y + dy); c.fillText(ch, x, y + dy); c.strokeText(ch, x, y);
      c.fillStyle = cols[i % cols.length]; c.fillText(ch, x, y);
    });
  });
}
function signPlate(p, tex, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35 }));
  m.position.set(x, y, z); m.rotation.y = ry; p.add(m);
  return m;
}
// 간판 위 작은 그림: 옷걸이 · 왕관(+ 별)
const hangerIcon = (col) => (c, w, ih) => {
  const s = ih / 100, cx = w / 2;
  c.strokeStyle = col; c.lineWidth = 9 * s; c.lineCap = c.lineJoin = 'round';
  c.beginPath(); c.arc(cx, 20 * s, 11 * s, Math.PI, Math.PI * 2.5); c.lineTo(cx, 40 * s); c.lineTo(cx - 44 * s, 84 * s); c.lineTo(cx + 44 * s, 84 * s); c.closePath(); c.stroke();
};
function starPath(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }
const crownIcon = (col, stars = true) => (c, w, ih) => {
  const s = ih / 100, cx = w / 2;
  c.fillStyle = col; c.strokeStyle = '#8a5a10'; c.lineWidth = 3 * s; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(cx - 40 * s, 88 * s); c.lineTo(cx - 46 * s, 34 * s); c.lineTo(cx - 20 * s, 58 * s); c.lineTo(cx, 22 * s); c.lineTo(cx + 20 * s, 58 * s); c.lineTo(cx + 46 * s, 34 * s); c.lineTo(cx + 40 * s, 88 * s); c.closePath(); c.fill(); c.stroke();
  for (const [x, y] of [[-46, 30], [0, 18], [46, 30]]) { c.beginPath(); c.arc(cx + x * s, y * s, 7 * s, 0, 7); c.fill(); }
  if (stars) for (const sx of [-1, 1]) { starPath(c, cx + sx * 78 * s, 62 * s, 17 * s); c.fill(); c.stroke(); }
};

// 받침 + 1층(통유리 진열장·문) + 띠 + 2층 + 지붕. o: 재질들 · doorX/doorW · portal(문짝 없이 금 문틀) · mull/mullR(유리 살 자리)
// 반환: 진열장 안쪽 앞 벽 z(zf)·오른쪽 벽 x(xr) — 진열품을 놓는 곳
function shell(g, o) {
  plinth(g);
  const xr = HW - IN, zf = FZ - IN, yM = Y1 + F1 / 2;
  box(g, xr + HW, F1, zf + FZ, o.wall1, (xr - HW) / 2, yM, (zf - FZ) / 2); // 진열장 뒤 덩어리
  const lit = litM(o.inside);
  box(g, xr + HW - POST, F1, 0.02, lit, (xr - HW + POST) / 2, yM, zf + 0.011); // 불 켜진 안쪽 벽 (앞)
  box(g, 0.02, F1, zf + FZ - POST, lit, xr + 0.011, yM, (zf - FZ + POST) / 2); // (오른쪽)
  const fl = flat(o.floor || 0xf4f1ea);
  box(g, SHOP_W - 0.05, 0.03, IN, fl, 0, Y1 + 0.015, (zf + FZ) / 2);
  box(g, IN, 0.03, zf + FZ, fl, (xr + HW) / 2, Y1 + 0.015, (zf - FZ) / 2);
  box(g, POST, F1, IN, o.wall1, -HW + POST / 2, yM, (zf + FZ) / 2); // 왼쪽 벽 끝
  box(g, POST, F1, POST, o.post, HW - POST / 2, yM, FZ - POST / 2); // 앞 오른쪽 모서리 기둥
  box(g, POST, F1, POST, o.post, HW - POST / 2, yM, -FZ + POST / 2); // 뒤 오른쪽 기둥
  // 유리: 앞(문 자리 빼고, 문 위는 채광창) + 오른쪽
  const dl = o.doorX - o.doorW / 2 - 0.06, dr = o.doorX + o.doorW / 2 + 0.06, DH = 2.35;
  const gz = FZ - 0.04;
  if (dl > -HW + POST + 0.05) box(g, dl - (-HW + POST), F1, 0.03, MAT.glass, (dl - HW + POST) / 2, yM, gz);
  box(g, HW - POST - dr, F1, 0.03, MAT.glass, (dr + HW - POST) / 2, yM, gz);
  box(g, dr - dl, F1 - DH, 0.03, MAT.glass, o.doorX, Y1 + DH + (F1 - DH) / 2, gz);
  box(g, 0.03, F1, SHOP_D - POST * 2, MAT.glass, HW - 0.04, yM, 0);
  // 유리 틀: 아래·위 막대 + 세로 살
  box(g, SHOP_W - POST, 0.12, 0.1, o.frame, 0, Y1 + 0.06, gz);
  box(g, SHOP_W - POST, 0.1, 0.1, o.frame, 0, YB - 0.05, gz);
  box(g, 0.1, 0.12, SHOP_D - POST, o.frame, HW - 0.04, Y1 + 0.06, 0);
  box(g, 0.1, 0.1, SHOP_D - POST, o.frame, HW - 0.04, YB - 0.05, 0);
  for (const x of o.mull || []) box(g, 0.07, F1, 0.08, o.frame, x, yM, gz);
  for (const z of o.mullR || []) box(g, 0.08, F1, 0.07, o.frame, HW - 0.04, yM, z);
  if (o.portal) { // 문짝 없는 금 문틀 (명예의 전당)
    for (const sx of [-1, 1]) box(g, 0.24, DH + 0.1, 0.42, o.portal, o.doorX + sx * (o.doorW / 2 + 0.12), Y1 + (DH + 0.1) / 2, FZ + 0.12);
    box(g, o.doorW + 0.72, 0.26, 0.42, o.portal, o.doorX, Y1 + DH + 0.23, FZ + 0.12);
  } else { // 문틀 + 바깥으로 활짝 연 유리 문 2짝
    for (const sx of [-1, 1]) box(g, 0.12, DH, 0.14, o.doorFrame, o.doorX + sx * (o.doorW / 2 + 0.06), Y1 + DH / 2, FZ);
    box(g, o.doorW + 0.24, 0.12, 0.14, o.doorFrame, o.doorX, Y1 + DH, FZ);
    const lw = o.doorW / 2, lh = DH - 0.08;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group(); leaf.position.set(o.doorX + sx * (o.doorW / 2), Y1 + 0.02, FZ + 0.04); leaf.rotation.y = sx * 1.15; g.add(leaf);
      const cx = -sx * lw / 2;
      box(leaf, lw, lh, 0.025, MAT.glass, cx, lh / 2, 0);
      for (const yy of [0.03, lh - 0.03]) box(leaf, lw, 0.06, 0.05, o.frame, cx, yy, 0);
      for (const xx of [0.03, lw - 0.03]) box(leaf, 0.06, lh, 0.05, o.frame, -sx * xx, lh / 2, 0);
      box(leaf, 0.03, 0.3, 0.06, MAT.alu, -sx * (lw - 0.12), 1.05, 0.05); // 손잡이
    }
    box(g, o.doorW + 0.2, 0.03, 0.55, flat(0x5a4e48), o.doorX, Y1 + 0.015, FZ + 0.32); // 발판
  }
  // 층 사이 띠 + 2층 + 지붕(처마 + 난간 + 바닥)
  box(g, SHOP_W + 0.24, BAND, SHOP_D + 0.24, o.band, 0, YB + BAND / 2, 0);
  box(g, SHOP_W, F2, SHOP_D, o.wall2, 0, Y2 + F2 / 2, 0);
  box(g, SHOP_W + 0.24, 0.14, SHOP_D + 0.24, o.rim, 0, YT + 0.07, 0);
  box(g, SHOP_W - 0.2, 0.04, SHOP_D - 0.2, o.roof, 0, YT + 0.16, 0);
  const pw = 0.2, py = YT + 0.14 + PAR / 2;
  for (const sz of [-1, 1]) box(g, SHOP_W + 0.24, PAR, pw, o.rim, 0, py, sz * (SHOP_D / 2 + 0.12 - pw / 2));
  for (const sx of [-1, 1]) box(g, pw, PAR, SHOP_D + 0.24 - pw * 2, o.rim, sx * (HW + 0.12 - pw / 2), py, 0);
  return { xr, zf };
}
// 옆으로 튀어나온 세로 간판 (앞 왼쪽 모서리, 앞뒤 두 면에 글자)
function bladeSign(g, tex, w, h, y, frame) {
  const x = -HW - 0.2 - w / 2, z = FZ - 0.35;
  for (const yy of [y + h / 2 - 0.15, y - h / 2 + 0.15]) box(g, 0.34, 0.05, 0.05, frame, -HW - 0.12, yy, z);
  box(g, w + 0.1, h + 0.1, 0.08, frame, x, y, z);
  signPlate(g, tex, w, h, x, y, z + 0.045);
  signPlate(g, tex, w, h, x, y, z - 0.045, Math.PI);
}

// ① 뽑기방: 빨강·노랑·흰색 + 노란 띠 간판 '뽑기방' + 진열장 안 작은 뽑기 기계 + 문 앞 노란 뽑기 기계(뽑기 연출) + 지붕 위 거대 뽑기 기계
export function gachaShop(rnd) {
  const g = new THREE.Group();
  const red = flat(0xe23a3f), yel = flat(0xffcf2e), wht = flat(0xf7f4ee), pur = flat(0x6b4fd0), olv = flat(0xa9a51f), dk = flat(0x2b2a33, { roughness: 0.5 });
  const G = winGlass();
  const { xr, zf } = shell(g, { wall1: red, wall2: wht, band: red, rim: red, roof: flat(0x55555e), post: red, frame: dk, doorFrame: yel, inside: 0xf6efff, doorX: -1.55, doorW: 1.15, mull: [0.8], mullR: [-0.3] });
  // 1층 위 노란 띠 (앞·오른쪽) + 입체 글자 '뽑기방'
  box(g, SHOP_W - 0.06, 0.5, 0.08, yel, 0, YB - 0.25, FZ + 0.02);
  box(g, 0.08, 0.5, SHOP_D - 0.06, yel, HW + 0.02, YB - 0.25, 0);
  signPlate(g, signTex('뽑기방', ['#e23a3f', '#ffffff', '#7b5ce0'], { w: 640, h: 200 }), 2.4, 0.75, 0.45, YB - 0.24, FZ + 0.15);
  // 2층: 앞(노랑 판 · 빨강 판 · 창) · 오른쪽(노랑 · 보라 · 연두 · 창) · 왼쪽(노랑)
  const yM = Y2 + F2 / 2, fF = face(g, 'front'), fR = face(g, 'right'), fL = face(g, 'left');
  box(fF, 1.25, 1.45, 0.06, yel, -1.9, yM, 0.03); box(fF, 0.85, 1.2, 0.06, red, -0.65, yM, 0.03);
  win(fF, 1.4, yM, 1.95, 1.15, dk, G, { cols: 3, rows: 2, sill: yel });
  box(fR, 0.9, 1.35, 0.06, yel, -1.45, yM, 0.03); box(fR, 1.0, 0.68, 0.06, pur, -0.15, yM + 0.36, 0.03); box(fR, 1.0, 0.56, 0.06, olv, -0.15, yM - 0.33, 0.03);
  win(fR, 1.35, yM, 0.85, 1.1, dk, G, { cols: 1, rows: 2 });
  box(fL, 2.2, 1.4, 0.06, yel, 0.4, yM, 0.03);
  bladeSign(g, signTex('뽑기방', ['#e23a3f', '#ffffff', '#7b5ce0'], { w: 160, h: 420, bg: '#e6c58a', vertical: true }), 0.4, 1.05, YB - 0.35, dk);
  // 진열장 안 작은 빨간 뽑기 기계
  const top = flat(0xcfe8ff, { roughness: 0.2 });
  const mini = (x, z) => {
    box(g, 0.42, 0.62, 0.4, red, x, Y1 + 0.31, z);
    box(g, 0.38, 0.36, 0.36, top, x, Y1 + 0.8, z);
    for (let i = 0; i < 3; i++) sphere(g, 0.07, flat(CAP_COLS[(i + Math.floor(x * 3 + z * 5 + 9)) % 7]), x - 0.09 + i * 0.09, Y1 + 0.71, z + 0.05, 6);
    box(g, 0.4, 0.06, 0.38, red, x, Y1 + 1.0, z);
    box(g, 0.12, 0.12, 0.04, yel, x, Y1 + 0.42, z + 0.21);
  };
  for (const x of [-0.35, 0.45, 1.25, 2.05]) mini(x, zf + 0.35);
  for (const z of [-1.5, -0.75, 0.0]) mini(xr + 0.35, z);
  // 문 앞 노란 작은 뽑기 기계: 뽑기 연출에서 손잡이가 돌고 캡슐이 굴러 나옴 (GACHA_OUT)
  miniGacha(g, rnd, 2.5, FZ + 0.65, 0xffb000, true);
  // 지붕 위 거대 뽑기 기계: 빨간 받침(동전 판·손잡이·캡슐 나오는 곳) + 목 + 유리 공 + 큰 캡슐 8개 + 빨간 뚜껑
  const cx = 0.1, cz = -0.15, R0 = ROOF_Y;
  cyl(g, 0.85, 1.25, 0.95, red, cx, R0 + 0.475, cz, 12);
  const pl = new THREE.Group(); pl.position.set(cx, R0 + 0.5, cz + 1.07); pl.rotation.x = -0.4; g.add(pl);
  box(pl, 0.5, 0.64, 0.08, yel, 0, 0.02, 0);
  const knob = cyl(pl, 0.13, 0.13, 0.06, MAT.alu, 0, 0.16, 0.06, 12); knob.rotation.x = Math.PI / 2;
  box(pl, 0.22, 0.05, 0.05, MAT.alu, 0, 0.16, 0.1);
  box(pl, 0.26, 0.17, 0.05, dk, 0, -0.14, 0.05);
  box(g, 0.44, 0.12, 0.4, wht, cx, R0 + 0.16, cz + 1.4, 0.03); // 캡슐 받는 곳
  cyl(g, 0.92, 0.92, 0.14, flat(0xdfe6ee), cx, R0 + 1.02, cz, 16);
  const C = R0 + 1.09 + 0.98;
  const ballM = { w: flat(0xf4f4f6), p: flat(0x7a4fd6), g: flat(0xc9a64a, { metalness: 0.2 }) };
  for (const [x, y, z, k] of [[-0.42, -0.5, 0.12, 'w'], [0.38, -0.5, -0.2, 'p'], [0, -0.55, 0.42, 'p'], [0.05, -0.15, -0.36, 'w'], [-0.46, -0.1, 0.3, 'g'], [0.48, -0.08, 0.28, 'g'], [-0.2, 0.25, 0, 'w'], [0.32, 0.25, -0.12, 'p']]) sphere(g, 0.33, ballM[k], cx + x, C + y, cz + z, 12);
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 2), new THREE.MeshStandardMaterial({ color: 0xe6f7ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2, depthWrite: false, flatShading: true }));
  globe.position.set(cx, C, cz); g.add(globe);
  cyl(g, 0.48, 0.54, 0.3, red, cx, C + 1.05, cz, 12);
  return g;
}

// ② 옷장: 하늘색·흰색 + 분홍 문틀·줄 + 2층 옷걸이 그림 '옷장' + 진열장 안 옷걸이 행거·거울 + 지붕 위 큰 나무 옷걸이 + 야구 모자
export function closetShop() {
  const g = new THREE.Group();
  const blue = flat(0xa7cdee), lblue = flat(0xb9d8f2), wht = flat(0xf7f9ff), pink = flat(0xf08fb5), navy = flat(0x2e3550, { roughness: 0.5 }), wood = flat(0x9a6436);
  const G = winGlass();
  const { xr, zf } = shell(g, { wall1: blue, wall2: wht, band: blue, rim: blue, roof: flat(0xeef1f7), post: lblue, frame: navy, doorFrame: pink, inside: 0xfff3ee, floor: 0xf2e6dc, doorX: -1.55, doorW: 1.15, mull: [0.9], mullR: [0] });
  box(g, 0.16, F1, 0.12, pink, -1.55 + 0.575 + 0.2, Y1 + F1 / 2, FZ + 0.02); // 문 옆 분홍 기둥
  box(g, 1.55, 0.14, 0.12, pink, -1.55, YB - 0.1, FZ + 0.02);
  // 2층: 앞(옷걸이 그림 + '옷장' · 하늘색 판 · 창) · 오른쪽(분홍·하늘 줄 + 창 2개)
  const yM = Y2 + F2 / 2, fF = face(g, 'front'), fR = face(g, 'right');
  signPlate(fF, signTex('옷장', ['#5b5f94'], { w: 420, h: 360, outline: '#ffffff', icon: hangerIcon('#9a6436'), iconH: 0.45 }), 1.45, 1.25, -1.85, yM, 0.02);
  win(fF, -0.35, yM, 0.95, 1.15, lblue, G, { cols: 1, rows: 2 });
  win(fF, 1.5, yM, 1.55, 1.15, navy, G, { cols: 2, rows: 2, sill: wht });
  box(fR, 0.32, F2, 0.06, pink, -1.6, yM, 0.03);
  win(fR, -0.75, yM, 1.0, 1.15, navy, G, { cols: 2, rows: 2 });
  box(fR, 0.32, F2, 0.06, pink, 0.15, yM, 0.03); box(fR, 0.3, F2, 0.06, lblue, 0.5, yM, 0.03);
  win(fR, 1.45, yM, 0.75, 1.15, navy, G, { cols: 1, rows: 2 });
  bladeSign(g, signTex('옷장', ['#2e3550'], { w: 256, h: 256, bg: '#ffffff', outline: '#ffffff', icon: hangerIcon('#f08fb5'), iconH: 0.5 }), 0.6, 0.6, YB - 0.55, lblue);
  // 진열장 안: 옷걸이 행거(옷 5벌) 3개 + 기대 놓은 거울
  const clothes = [0xf08fb5, 0x7fb0e0, 0xffd23f, 0xffffff, 0x6fc07a, 0x2e3550];
  const rack = (x, z, ry, n = 5) => {
    const r = new THREE.Group(); r.position.set(x, Y1, z); r.rotation.y = ry; g.add(r);
    box(r, 1.1, 0.06, 0.3, wood, 0, 0.05, 0);
    for (const sx of [-1, 1]) box(r, 0.04, 1.55, 0.04, MAT.alu, sx * 0.5, 0.8, 0);
    box(r, 1.04, 0.04, 0.04, MAT.alu, 0, 1.55, 0);
    for (let i = 0; i < n; i++) box(r, 0.07, 0.62, 0.32, flat(clothes[(i + Math.round(x * 3)) % 6]), -0.36 + (i * 0.72) / (n - 1), 1.18, 0);
  };
  rack(-0.25, zf + 0.35, 0); rack(1.55, zf + 0.35, 0); rack(xr + 0.35, -1.1, Math.PI / 2);
  const mir = new THREE.Group(); mir.position.set(xr + 0.32, Y1, 0.75); mir.rotation.set(0, Math.PI / 2, 0); g.add(mir);
  const mg = new THREE.Group(); mg.rotation.x = -0.12; mir.add(mg);
  box(mg, 0.55, 1.65, 0.05, wood, 0, 0.83, 0); box(mg, 0.45, 1.55, 0.02, std(0xdbe8f5, { metalness: 0.6, roughness: 0.1 }), 0, 0.83, 0.03);
  // 지붕: 환기 상자 + 큰 나무 옷걸이(비스듬히) + 분홍·남색 야구 모자
  box(g, 0.9, 0.4, 0.6, flat(0xc9cbd6), -0.4, ROOF_Y + 0.2, -1.3, 0.03);
  for (let i = 0; i < 4; i++) box(g, 0.6, 0.03, 0.04, flat(0x8a8c99), -0.4, ROOF_Y + 0.42, -1.5 + i * 0.12);
  const hg = new THREE.Group(); hg.position.set(-0.45, ROOF_Y + 0.05, 0.1); hg.rotation.set(-0.3, -0.42, 0.12); g.add(hg);
  box(hg, 3.3, 0.12, 0.12, wood, 0, 0.25, 0);
  for (const sx of [-1, 1]) {
    const a = box(hg, 2.08, 0.18, 0.13, wood, sx * 0.8, 0.875, 0); a.rotation.z = -sx * Math.atan2(1.25, 1.6);
    sphere(hg, 0.13, wood, sx * 1.6, 0.27, 0, 8);
  }
  const hookM = flat(0x6e5a4e);
  cyl(hg, 0.05, 0.05, 0.4, hookM, 0, 1.65, 0, 8);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 6, 14, Math.PI * 1.3), hookM); hook.position.set(0, 2.09, 0); hook.rotation.z = Math.PI * 0.2; hook.castShadow = true; hg.add(hook);
  const cap = new THREE.Group(); cap.position.set(1.4, ROOF_Y + 0.02, 0.5); cap.rotation.set(0.12, -0.7, 0.18); g.add(cap);
  const cp = flat(0xf28fb7), cn = flat(0x3d4a7f);
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 2, 5, (i * Math.PI) / 3, Math.PI / 3, 0, Math.PI / 2), i % 2 ? cn : cp); s.scale.y = 0.85; s.castShadow = true; cap.add(s); }
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 10, 1, false, -Math.PI / 2, Math.PI), cn); brim.position.set(0, 0.03, 0.42); brim.scale.x = 1.05; brim.castShadow = true; cap.add(brim);
  sphere(cap, 0.08, cn, 0, 0.72, 0, 8);
  return g;
}

// ③ 명예의 전당: 흰색·남색·금색 + 금 문틀(문 없음) + 2층 '명예의 전당'(왕관·별) · 옆 '랭킹' + 진열장 안 트로피·순위표
// 지붕 위 시상대(2·1·3)와 1위 자리 큰 트로피 — 2·3위 자리는 비워 둠 (나중에 진짜 2·3등 캐릭터를 세울 자리, plaza.md 남은 일)
export const PODIUM = { x: 0, z: -0.2, w: 1.25, base: 0.45, h: [0.8, 0.55, 0.38] }; // 받침 높이 · 1·2·3위 칸 높이, 2위 = 왼쪽(−x) · 3위 = 오른쪽 (가게 안쪽 좌표, 지붕 바닥 기준)
export function fameShop() {
  const g = new THREE.Group();
  const wht = flat(0xf6f5f1), navy = flat(0x22305e, { roughness: 0.5 }), gold = std(0xe2ad35, { metalness: 0.45, roughness: 0.4, flatShading: true }), frame = flat(0xdfe5ee);
  const G = winGlass();
  const { xr, zf } = shell(g, { wall1: wht, wall2: wht, band: gold, rim: wht, roof: flat(0x283766), post: wht, frame, portal: gold, inside: 0xeef3ff, floor: 0xe9edf5, doorX: -0.9, doorW: 1.4, mull: [0.55, 1.55], mullR: [-1.0, 0, 1.0] });
  for (const y of [YB - 0.03, Y2 + 0.03]) box(g, SHOP_W + 0.26, 0.07, SHOP_D + 0.26, navy, 0, y, 0); // 금 띠 위아래 남색 줄
  box(g, SHOP_W + 0.28, 0.06, SHOP_D + 0.28, navy, 0, YT + 0.02, 0);
  for (const [x, z] of [[-HW + 0.2, FZ - 0.2], [HW - 0.2, FZ - 0.2], [HW - 0.2, -FZ + 0.2]]) box(g, 0.46, 0.4, 0.46, navy, x, Y1 + 0.2, z); // 모서리 남색 굽
  // 2층: 앞(작은 창 · '명예의 전당' 판 + 왕관·별 · 창) · 오른쪽(남색 '랭킹' 판 · 창) · 왼쪽(창)
  const yM = Y2 + F2 / 2, fF = face(g, 'front'), fR = face(g, 'right'), fL = face(g, 'left');
  win(fF, -2.1, yM, 0.55, 1.05, gold, G, { cols: 1, rows: 2 });
  box(fF, 2.5, 0.62, 0.08, gold, -0.5, yM - 0.25, 0.04);
  signPlate(fF, signTex('명예의 전당', ['#ffffff'], { w: 640, h: 150, bg: '#22305e', outline: '#22305e' }), 2.38, 0.52, -0.5, yM - 0.25, 0.085);
  signPlate(fF, canvasTex(300, 100, crownIcon('#f2c443')), 1.2, 0.4, -0.5, yM + 0.38, 0.03);
  win(fF, 1.65, yM, 1.25, 0.95, gold, G, { cols: 2, rows: 1 });
  box(fR, 1.5, 1.3, 0.06, gold, -0.75, yM, 0.03);
  signPlate(fR, signTex('랭킹', ['#ffffff'], { w: 300, h: 260, bg: '#22305e', outline: '#22305e', icon: crownIcon('#f2c443', false), iconH: 0.5 }), 1.38, 1.18, -0.75, yM, 0.065);
  win(fR, 1.2, yM, 0.6, 1.05, gold, G, { cols: 1, rows: 2 });
  win(fL, 0, yM, 0.6, 1.05, gold, G, { cols: 1, rows: 2 });
  // 진열장 안: 남색 받침 위 작은 트로피(유리 상자) + 순위표
  const case_ = (x, z, s) => { box(g, 0.5, 0.55, 0.45, navy, x, Y1 + 0.275, z); trophy(g, x, Y1 + 0.55, z, s); box(g, 0.46, 0.6, 0.42, MAT.glass, x, Y1 + 0.86, z); };
  case_(0.35, zf + 0.33, 0.15); case_(1.95, zf + 0.33, 0.15); case_(xr + 0.35, -1.2, 0.15); case_(xr + 0.35, 0.3, 0.13);
  box(g, 1.2, 0.85, 0.04, navy, 1.15, Y1 + 1.75, zf + 0.04);
  signPlate(g, canvasTex(240, 170, (c) => { c.fillStyle = '#f2c443'; for (let i = 0; i < 4; i++) { starPath(c, 30, 32 + i * 36, 11); c.fill(); c.fillRect(55, 26 + i * 36, 160 - i * 22, 12); } }), 1.1, 0.78, 1.15, Y1 + 1.75, zf + 0.065);
  // 지붕 위 시상대 + 1위 트로피
  const P = PODIUM;
  const PY = ROOF_Y + P.base; // 난간 너머로 시상대가 보이게 흰 받침 위에
  box(g, P.w * 3 + 0.4, P.base - 0.1, P.w + 0.4, wht, P.x, ROOF_Y + (P.base - 0.1) / 2, P.z);
  box(g, P.w * 3 + 0.2, 0.1, P.w + 0.2, gold, P.x, PY - 0.05, P.z);
  [[0, 0, '1', '#f2c443'], [-1, 1, '2', '#d4d8df'], [1, 2, '3', '#c9814a']].forEach(([sx, i, n, col]) => {
    const x = P.x + sx * P.w, h = P.h[i];
    box(g, P.w - 0.02, h, P.w, navy, x, PY + h / 2, P.z);
    box(g, P.w + 0.04, 0.06, P.w + 0.04, gold, x, PY + h, P.z);
    signPlate(g, signTex(n, [col], { w: 128, h: 128 }), Math.min(0.5, h * 0.8), Math.min(0.5, h * 0.8), x, PY + h / 2, P.z + P.w / 2 + 0.01);
  });
  trophy(g, P.x, PY + 0.06 + P.h[0], P.z, 0.6);
  return g;
}
