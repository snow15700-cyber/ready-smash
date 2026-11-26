// 배경(arenas)들이 같이 쓰는 도구: 정해진 난수, 캔버스 그림, 빛 번짐, 하늘, 떨어지는 알갱이
import * as THREE from 'three';
import { seeded, canvasTex as baseCanvasTex } from './util.js';

// 같은 배경이면 모든 PC에서 똑같이 보이게 (건물 높이·창문 불빛 등)
export { seeded }; // 계산은 util.js

export const canvasTex = (w, h, draw) => baseCanvasTex(w, h, draw, 8);

// 빛 번짐 (차 라이트·신호등·가로등)
let GLOW_TEX = null;
const glowMats = {};
export function glowSprite(color, size, opacity = 1) {
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

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
export function addBox(parent, w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}


// 공 위치(세계 좌표)를 배경 root 안 좌표로 (root를 돌려 놓은 배경도 반려동물이 공을 제대로 보게)
const _v = new THREE.Vector3();
export function toLocal(root, p) {
  return root.worldToLocal(_v.copy(p));
}

// 반려동물이 공 쪽을 보는 각도 (몸 기준, 라디안)
export function petYaw(root, pet, ball) {
  if (!ball) return 0;
  const b = toLocal(root, ball), gp = pet.group.position;
  const y = Math.atan2(b.x - gp.x, b.z - gp.z) - pet.group.rotation.y;
  return Math.atan2(Math.sin(y), Math.cos(y));
}

// 하늘: 위아래 색이 이어지는 큰 공 (안쪽 면). stops = [[0(아래)~1(위), '#색'], ...]
export function skyDome(stops, radius = 300) {
  const tex = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  // 구의 v좌표(0 위 ~ 1 아래)를 높이로: 수평선 아래는 맨 아래 색
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, Math.max(0, pos.getY(i) / radius));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}

// 동그란 알갱이 그림 (눈송이·먼지·꽃잎)
let DOT = null;
export function dotTex() {
  if (!DOT) DOT = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  return DOT;
}

// 떨어지는 알갱이 (눈·꽃잎·은행잎·먼지). box = [x0, x1, y0, y1, z0, z1]
// fall: 떨어지는 속도(m/s), sway: 좌우 흔들림, colors: 색 목록
// px: 주면 거리와 상관없이 늘 그 크기(화면 픽셀) — 카메라 바로 앞 알갱이가 공처럼 커 보이지 않게
export function makeDrift(rnd, n, box, { size = 0.08, px = 0, opacity = 0.9, fall = 0.8, sway = 0.4, colors = ['#ffffff'], additive = false } = {}) {
  const [x0, x1, y0, y1, z0, z1] = box;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x0 + rnd() * (x1 - x0);
    pos[i * 3 + 1] = y0 + rnd() * (y1 - y0);
    pos[i * 3 + 2] = z0 + rnd() * (z1 - z0);
    c.set(colors[i % colors.length]);
    col.set([c.r, c.g, c.b], i * 3);
    ph[i] = rnd() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: px ? px * Math.min(window.devicePixelRatio || 1, 2) : size, map: dotTex(), vertexColors: true, transparent: true, opacity, depthWrite: false, sizeAttenuation: !px, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  pts.frustumCulled = false;
  pts.userData.noFocus = true;
  return {
    pts,
    tick(t, dt) {
      const a = geo.attributes.position, p = a.array;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        p[k + 1] -= fall * dt * (0.7 + 0.3 * Math.sin(ph[i]));
        p[k] += Math.sin(t * 0.9 + ph[i]) * sway * dt;
        p[k + 2] += Math.cos(t * 0.7 + ph[i]) * sway * 0.6 * dt;
        if (p[k + 1] < y0) { p[k + 1] = y1; p[k] = x0 + Math.random() * (x1 - x0); p[k + 2] = z0 + Math.random() * (z1 - z0); }
      }
      a.needsUpdate = true;
    },
  };
}

// 글자 그림 (간판·메뉴판)
export function textTex(lines, { w = 512, h = 128, bg = '#ffffff', color = '#222', font = 'bold 56px sans-serif', border = null, align = 'center', lineH = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
    g.fillStyle = color; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
    const L = [].concat(lines), lh = lineH || h / (L.length + 0.4);
    L.forEach((s, i) => g.fillText(s, align === 'center' ? w / 2 : 30, h / 2 + (i - (L.length - 1) / 2) * lh + 3));
  });
}

// 시계 그림 (hh:mm)
export function clockTex(hh, mm, { face = '#fdfbf4', ink = '#1f2933' } = {}) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = face; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = ink;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 10, 8, 20); }
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('12', 128, 52); g.fillText('3', 205, 130); g.fillText('6', 128, 206); g.fillText('9', 52, 130);
    g.lineCap = 'round';
    const hand = (a, len, w) => { g.strokeStyle = ink; g.lineWidth = w; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
    hand((((hh % 12) + mm / 60) / 12) * Math.PI * 2, 60, 12);
    hand((mm / 60) * Math.PI * 2, 90, 8);
    g.fillStyle = '#e0333c'; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
  });
}

// 09시 게임의 빌딩 창문 무늬: 회색 외벽 + 창문 격자, 불 켜진 창은 emissiveMap
export function makeFacade(rnd) {
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
