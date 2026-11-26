// 탁구대 만들기 도구 (tables.js·tables-rare.js가 같이 씀)
import * as THREE from 'three';
import { TY } from './physics.js';

// 결정론적 난수 (무늬가 열 때마다 같게)
export { seeded as rng } from './util.js'; // arena-kit의 seeded와 같은 계산 (mulberry32 rng와는 다름)

// 캔버스 그림 → 텍스처 (key로 캐시: 같은 그림은 한 번만 그림)
const texCache = {};
export function canvasTex(key, w, h, draw, { repeat, alpha } = {}) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData.alpha = !!alpha;
  return (texCache[key] = t);
}

export const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
export const flat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
export const shiny = (color, shininess = 60, opts = {}) => new THREE.MeshPhongMaterial({ color, shininess, specular: '#ffffff', ...opts });

// 그룹에 메시 넣기
export function put(root, geo, m, x = 0, y = 0, z = 0, { shadow = true, rx = 0, ry = 0, rz = 0 } = {}) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}
export const box = (root, w, h, d, m, x, y, z, o) => put(root, new THREE.BoxGeometry(w, h, d), m, x, y, z, o);
export const cyl = (root, rt, rb, h, m, x, y, z, o, seg = 16) => put(root, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, o);

// 둥근 모서리 상자 (ExtrudeGeometry, 위에서 본 모양이 둥근 사각형)
export function roundBox(w, h, d, r, bevel = 0.01, segs = 3) {
  const s = new THREE.Shape();
  const x = -w / 2 + bevel, y = -d / 2 + bevel, W = w - bevel * 2, D = d - bevel * 2, rr = Math.min(r, W / 2, D / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + W - rr, y); s.quadraticCurveTo(x + W, y, x + W, y + rr);
  s.lineTo(x + W, y + D - rr); s.quadraticCurveTo(x + W, y + D, x + W - rr, y + D);
  s.lineTo(x + rr, y + D); s.quadraticCurveTo(x, y + D, x, y + D - rr);
  s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h - bevel * 2, bevel: true, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, curveSegments: Math.max(8, segs * 2) });
  geo.rotateX(-Math.PI / 2); // 모양(x, y) → 바닥(x, -z), 두께는 위로
  geo.translate(0, -h / 2 + bevel, 0);
  return geo;
}

// 말랑한 윗면: 공이 튄 자리가 쏙 들어갔다 돌아온다 (침대 이불·상자·식빵)
// w×l 평면을 높이 y에 깔고, press(x, z, 깊이)로 누름. 보기만 (판정 그대로)
export function softTop(root, w, l, m, { y = TY, segW = 30, segL = 54, radius = 0.16, x = 0, z = 0, shape } = {}) {
  const geo = new THREE.PlaneGeometry(w, l, segW, segL);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  if (shape) for (let i = 0; i < pos.count; i++) base[i * 3 + 1] += shape(base[i * 3] + x, base[i * 3 + 2] + z);
  pos.array.set(base);
  geo.computeVertexNormals();
  const mesh = put(root, geo, m, x, y, z, { shadow: false });
  const dents = [];
  let busy = false;
  mesh.userData.press = (px, pz, depth = 0.02) => { dents.push({ x: px - x, z: pz - z, d: depth, t: 0 }); busy = true; };
  mesh.userData.update = (dt) => {
    if (!busy) return;
    for (const d of dents) d.t += dt;
    while (dents.length && dents[0].t > 1.2) dents.shift();
    for (let i = 0; i < pos.count; i++) {
      const vx = base[i * 3], vz = base[i * 3 + 2];
      let off = 0;
      for (const d of dents) {
        const r2 = ((vx - d.x) ** 2 + (vz - d.z) ** 2) / (radius * radius);
        if (r2 > 4) continue;
        // 쏙 들어갔다가 살짝 튀어 오르며 돌아옴
        const k = Math.exp(-d.t * 5.5) * Math.cos(d.t * 13) * (d.t < 0.05 ? d.t / 0.05 : 1);
        off -= d.d * k * Math.exp(-r2);
      }
      pos.array[i * 3 + 1] = base[i * 3 + 1] + off;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    if (!dents.length) { pos.array.set(base); pos.needsUpdate = true; geo.computeVertexNormals(); busy = false; }
  };
  return mesh;
}

// 김·연기: tick에서 부르면 every초마다 한 줄기
export function steamer(at, { every = 0.45, color = '#ffffff', size = 0.06, up = 0.16, life = 1.8, alpha = 0.32, wob = 0.05 } = {}) {
  let acc = Math.random() * every;
  return (fx, dt) => {
    if (!fx) return;
    acc += dt;
    while (acc > every) {
      acc -= every;
      fx.hit((emit) => emit({ tex: 'puff', n: 1, color, size, grow: 2.4, life, speed: 0.02, up, g: -0.01, drag: 0.4, alpha, wob, spread: 0.01 }), at, 0);
    }
  };
}

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 판(가운데 평평한 직사각형) 둘레를 감싸며 내려가는 몸 (거북이 등껍질·고양이 몸통)
// 위에서 본 바깥 모양 = 초타원 (a: x 반지름, b: z 반지름, n: 네모난 정도).
// profile(t) → [k, y]: t 0(판 가장자리) → 1(끝). k = 판 가장자리(0) ~ 바깥 모양(1) 사이 위치, y = 높이.
// uv: u = 둘레 방향(각도, uRep번 반복), v = t
export function skirt({ a, b, n, profile, rays = 144, steps = 28, uRep = 1, hw, hl }) {
  const angs = [];
  for (let i = 0; i < rays; i++) angs.push((i / rays) * Math.PI * 2);
  const c = Math.atan2(hl, hw);
  for (const v of [c, Math.PI - c, Math.PI + c, Math.PI * 2 - c]) angs.push(v); // 판 모서리를 지나는 선 (모서리가 안 깎이게)
  angs.sort((p, q) => p - q);
  angs.push(angs[0] + Math.PI * 2);
  const pos = [], uv = [], idx = [];
  for (const f of angs) {
    const cs = Math.cos(f), sn = Math.sin(f);
    const rc = Math.min(Math.abs(cs) > 1e-6 ? hw / Math.abs(cs) : 1e9, Math.abs(sn) > 1e-6 ? hl / Math.abs(sn) : 1e9);
    const rb = Math.pow(Math.abs(cs / a) ** n + Math.abs(sn / b) ** n, -1 / n);
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, [k, y] = profile(t);
      const r = rc + (rb - rc) * k;
      pos.push(r * cs, y, r * sn);
      uv.push((f / (Math.PI * 2)) * uRep, 1 - t);
    }
  }
  const S = steps + 1;
  for (let i = 0; i < angs.length - 1; i++) for (let j = 0; j < steps; j++) {
    const p = i * S + j, q = (i + 1) * S + j;
    idx.push(p, q, p + 1, q, q + 1, p + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
