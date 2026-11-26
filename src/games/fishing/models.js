// 낚시 물고기 17종 · 잡동사니 9개 모형 (fishing.md 9장). 그림체 = A '젤리 장난감'(사용자 확정 11/25):
// 굵은 테두리 + 3단 만화 그림자 + 반짝이는 큰 눈 + 볼터치. 귀엽게가 핵심.
// 물고기는 머리가 +x, 눈·볼·지느러미는 양쪽(+z·−z). 문어·오징어처럼 정면이 +z인 것은 userData.faceZ = true.
// 크기는 몸길이 약 0.8. g.userData.anim(t)로 꼬리·지느러미·눈 깜빡임 등.
import * as THREE from 'three';

// ── 재질·테두리 ──
function gradTex(steps) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => d.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(d, steps.length, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const TOON = gradTex([110, 190, 255]);
const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: TOON, ...o });
const basic = (c, o) => new THREE.MeshBasicMaterial({ color: c, ...o });
const OUTLINE = new THREE.ShaderMaterial({
  uniforms: { c: { value: new THREE.Color(0x2a2340) }, w: { value: 0.018 } },
  vertexShader: 'uniform float w; void main(){ vec3 p = position + normal * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
  side: THREE.BackSide,
});
// 테두리: noOutline 표시가 없는 메시마다 뒷면을 법선 방향으로 부풀린 검은 껍질
function finish(g) {
  const list = [];
  g.traverse((m) => {
    let p = m, skip = false;
    while (p) { if (p.userData.noOutline) skip = true; p = p.parent; }
    if (m.isMesh && !skip) list.push(m);
  });
  for (const m of list) { const o = new THREE.Mesh(m.geometry, OUTLINE); o.userData.noOutline = true; m.add(o); }
  return g;
}
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const noOl = (o) => { o.userData.noOutline = true; return o; };
const hex = (c) => '#' + new THREE.Color(c).getHexString();

// ── 얼굴 ──
function makeEye(s = 1) {
  const g = new THREE.Group();
  const w = mesh(sph(0.1 * s), basic(0xffffff)); w.scale.z = 0.5; g.add(w);
  const p = mesh(sph(0.068 * s), basic(0x1c1a2a), 0.012 * s, -0.008 * s, 0.03 * s); p.scale.z = 0.4; g.add(p);
  g.add(mesh(sph(0.026 * s, 10, 8), basic(0xffffff), 0.034 * s, 0.03 * s, 0.06 * s));
  g.add(mesh(sph(0.012 * s, 8, 6), basic(0xffffff), -0.012 * s, -0.035 * s, 0.06 * s));
  g.userData.eye = true;
  return noOl(g);
}
function makeMouth(kind = 'smile', s = 1) {
  const g = new THREE.Group(), ink = basic(0x2a1f2e);
  if (kind === 'o') {
    g.add(mesh(new THREE.TorusGeometry(0.026 * s, 0.011 * s, 8, 18), basic(0xd9566b)));
    g.add(mesh(new THREE.CircleGeometry(0.02 * s, 14), basic(0x5a1f2e), 0, 0, -0.002));
  } else if (kind === 'lips') { // 두툼한 입술 (우럭)
    for (const sy of [1, -1]) { const m = mesh(sph(0.04 * s, 14, 10), basic(0xe07a86), 0, sy * 0.016 * s, 0); m.scale.set(1.3, 0.5, 0.5); g.add(m); }
  } else {
    const m = mesh(new THREE.TorusGeometry(0.035 * s, 0.009 * s, 6, 16, Math.PI), ink); m.rotation.z = Math.PI; g.add(m);
  }
  return noOl(g);
}
function makeBlush(s = 1) {
  const m = mesh(new THREE.CircleGeometry(0.045 * s, 18), basic(0xff8fa8, { transparent: true, opacity: 0.55, depthWrite: false }));
  m.scale.y = 0.55;
  return noOl(m);
}
function stick(g, obj, at, lift = 0.004) {
  obj.position.copy(at.p).addScaledVector(at.n, lift);
  obj.lookAt(obj.position.clone().add(at.n));
  g.add(obj);
  return obj;
}
const flipZ = (at) => ({ p: at.p.clone().setZ(-at.p.z), n: at.n.clone().setZ(-at.n.z) });
function pair(g, make, at, lift) { return [stick(g, make(), at, lift), stick(g, make(), flipZ(at), lift)]; }
function blinker(eyes) {
  const off = Math.random() * 3;
  return (t) => { const k = (t + off) % 3.4; const s = k < 0.12 ? Math.abs(1 - k / 0.06) : 1; for (const e of eyes) e.scale.y = Math.max(0.08, s); };
}

// ── 지느러미 모양 (Shape → 얇게 뽑아 모서리 둥글게) ──
function finGeo(shape, depth = 0.022) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
const SH = {
  fork(w = 1) { const s = new THREE.Shape(); s.moveTo(0.03, 0); s.quadraticCurveTo(-0.1 * w, 0.04, -0.2 * w, 0.17 * w); s.quadraticCurveTo(-0.15 * w, 0.02, -0.2 * w, -0.17 * w); s.quadraticCurveTo(-0.1 * w, -0.04, 0.03, 0); return s; },
  fan(w = 1) { const s = new THREE.Shape(); s.moveTo(0.03, 0); s.quadraticCurveTo(-0.06 * w, 0.13 * w, -0.17 * w, 0.13 * w); s.quadraticCurveTo(-0.24 * w, 0, -0.17 * w, -0.13 * w); s.quadraticCurveTo(-0.06 * w, -0.13 * w, 0.03, 0); return s; },
  flow(w = 1) { // 길게 나부끼는 꼬리 (용왕)
    const s = new THREE.Shape(); s.moveTo(0.03, 0);
    s.bezierCurveTo(-0.12 * w, 0.08 * w, -0.25 * w, 0.24 * w, -0.4 * w, 0.2 * w); s.quadraticCurveTo(-0.3 * w, 0.08 * w, -0.36 * w, -0.02 * w);
    s.quadraticCurveTo(-0.3 * w, -0.12 * w, -0.38 * w, -0.22 * w); s.bezierCurveTo(-0.24 * w, -0.22 * w, -0.12 * w, -0.08 * w, 0.03, 0); return s;
  },
  round(l, h) { const s = new THREE.Shape(); s.moveTo(0, -0.02); s.quadraticCurveTo(l * 0.2, h * 1.1, -l, h * 0.7); s.quadraticCurveTo(-l * 0.8, h * 0.1, -l * 0.9, -0.02); s.lineTo(0, -0.02); return s; },
  spiky(l, h, n = 4) { // 가시 지느러미 (끝이 둥근 톱니)
    const s = new THREE.Shape(); s.moveTo(0.02, -0.02);
    for (let i = 0; i < n; i++) {
      const x0 = -(l * i) / n, x1 = -(l * (i + 0.5)) / n, x2 = -(l * (i + 1)) / n, hh = h * (1 - 0.3 * (i / n));
      s.quadraticCurveTo(x0 + 0.005, hh * 0.9, x1, hh); s.quadraticCurveTo(x1 - 0.01, hh * 0.55, x2, hh * 0.5);
    }
    s.quadraticCurveTo(-l - 0.03, h * 0.2, -l - 0.02, -0.02); s.lineTo(0.02, -0.02); return s;
  },
  long(l, h) { const s = new THREE.Shape(); s.moveTo(0.02, -0.02); s.quadraticCurveTo(0, h, -0.06, h); s.lineTo(-l + 0.05, h * 0.8); s.quadraticCurveTo(-l - 0.02, h * 0.7, -l, -0.02); s.lineTo(0.02, -0.02); return s; },
  oval(rx, ry) { const s = new THREE.Shape(); s.absellipse(0, 0, rx, ry, 0, Math.PI * 2); return s; },
  leaf(l, w) { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(l * 0.5, w, l, 0); s.quadraticCurveTo(l * 0.5, -w, 0, 0); return s; },
};

// ── 그림 (몸통 겉면) ──
// 몸통은 x축으로 누운 공: 그림 세로(y) 0 = 코끝 → H = 꼬리, 가로 0·W = 등, W/4 = +z 옆, W/2 = 배, 3W/4 = −z 옆
function bodyTex(paint, W = 512, H = 256) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  paint(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function backBelly(x, W, H, back, belly, line = 0.3) {
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, back); g.addColorStop(line, back); g.addColorStop(Math.min(0.5, line + 0.08), belly);
  g.addColorStop(Math.max(0.5, 1 - line - 0.08), belly); g.addColorStop(1 - line, back); g.addColorStop(1, back);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}
const dot = (x, u, v, r, ry = r) => { x.beginPath(); x.ellipse(u, v, r, ry, 0, 0, 7); x.fill(); };
// 등쪽 띠 안에서만 아무 데나 (등 = 양 끝)
const onBack = (W, span) => (Math.random() < 0.5 ? Math.random() * W * span : W - Math.random() * W * span);

// ── 물고기 몸통: 공을 늘이고 꼬리 쪽을 가늘게(taper), 등을 높게(hump) ──
function shapeAt(o, xn, up) {
  const s = xn < 0 ? 1 - o.taper * (-xn) ** 1.6 : 1;
  const h = up ? 1 + (o.hump || 0) * (1 - xn * xn) : 1;
  return { s, h };
}
function surf(o, x, y) { // 몸통 겉면의 점(+z쪽)과 바깥 방향 (눈·입·지느러미 붙이기)
  const xn = x / o.a, { s, h } = shapeAt(o, xn, y > 0);
  const B = o.b * s * h, C = o.c * s;
  const z = C * Math.sqrt(Math.max(0.0001, 1 - xn * xn - (y / B) ** 2));
  return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x / o.a / o.a, y / B / B, z / C / C).normalize() };
}
const topY = (o, x) => { const xn = x / o.a, { s, h } = shapeAt(o, xn, true); return o.b * s * h * Math.sqrt(Math.max(0, 1 - xn * xn)); };
function bodyGeo(o) {
  const geo = new THREE.SphereGeometry(1, 48, 32); geo.rotateZ(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), { s, h } = shapeAt(o, x, pos.getY(i) > 0);
    pos.setXYZ(i, x * o.a, pos.getY(i) * o.b * s * h, pos.getZ(i) * o.c * s);
  }
  geo.computeVertexNormals();
  smoothSeam(geo);
  return geo;
}
// 공의 이음매(같은 자리 다른 점)의 법선을 평균 → 테두리가 갈라지지 않게
function smoothSeam(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, map = new Map();
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) { const k = key(i); const v = map.get(k) || new THREE.Vector3(); v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i); map.set(k, v); }
  for (let i = 0; i < pos.count; i++) { const v = map.get(key(i)).clone().normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
}
function sparkleTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 7 : 30, a = (i / 8) * Math.PI * 2 - Math.PI / 2; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.fill(); return new THREE.CanvasTexture(c);
}
let SPARK = null;
// 전설 반짝이: 몸 둘레를 도는 별
function addAura(g, color, n = 6, R = 0.45) {
  SPARK ||= sparkleTex();
  const stars = [];
  for (let i = 0; i < n; i++) {
    const sp = noOl(new THREE.Sprite(new THREE.SpriteMaterial({ map: SPARK, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    g.add(sp); stars.push({ sp, ph: (i / n) * Math.PI * 2, y: (Math.random() - 0.5) * 0.4, sp2: 0.6 + Math.random() * 0.6 });
  }
  return (t) => { for (const s of stars) { const a = s.ph + t * s.sp2; s.sp.position.set(Math.cos(a) * R, s.y + Math.sin(t * 2 + s.ph) * 0.05, Math.sin(a) * R * 0.7); const k = 0.06 + 0.05 * Math.max(0, Math.sin(t * 4 + s.ph * 3)); s.sp.scale.set(k, k, 1); } };
}

// 물고기 하나 짓기. o: a·b·c(반지름) · taper · hump · paint · fin(색) · tail{type,w,color} · dorsal{type,l,h,n,x,color} · anal{l,h,x} · pec{rx,ry,x,y} · eye{x,y,s} · mouth{kind,s,y} · blush{x,y,s} · oneSide(가자미) · extra(g, o, parts)
function fish(o) {
  const g = new THREE.Group(), parts = {};
  const body = new THREE.Mesh(bodyGeo(o), toon(0xffffff, { map: bodyTex(o.paint), ...(o.bodyMat || {}) })); g.add(body); parts.body = body;
  const finM = toon(o.fin, o.finMat || {});
  if (o.tail) {
    const tail = new THREE.Group(); tail.position.x = -o.a + 0.03; g.add(tail);
    tail.add(new THREE.Mesh(finGeo(SH[o.tail.type](o.tail.w || 1)), o.tail.color ? toon(o.tail.color) : finM)); parts.tail = tail;
  }
  if (o.dorsal) {
    const d = o.dorsal, x0 = d.x ?? 0.05, y0 = topY(o, x0 - d.l * 0.3) - 0.025;
    const m = new THREE.Mesh(finGeo(d.type === 'spiky' ? SH.spiky(d.l, d.h, d.n) : SH[d.type](d.l, d.h)), d.color ? toon(d.color) : finM); m.position.set(x0, y0, 0); g.add(m); parts.dorsal = m;
  }
  if (o.anal) {
    const d = o.anal, x0 = d.x ?? -0.05, m = new THREE.Mesh(finGeo(SH.round(d.l, d.h)), finM); m.scale.y = -1; m.position.set(x0, -topY({ ...o, hump: 0 }, x0 - d.l * 0.3) + 0.025, 0); g.add(m);
  }
  const P = o.pec || {};
  parts.pecs = P.none ? [] : [1, -1].map((sz) => {
    const pg = new THREE.Group(), pf = new THREE.Mesh(finGeo(SH.oval(P.rx ?? 0.07, P.ry ?? 0.04), 0.012), finM); pf.position.x = -(P.rx ?? 0.07) + 0.01; pg.add(pf);
    const at = surf(o, P.x ?? o.a * 0.1, P.y ?? -o.b * 0.35); pg.position.copy(at.p).addScaledVector(at.n, 0.01); pg.position.z *= sz; g.add(pg); return { pg, sz };
  });
  const E = o.eye || {}, eyeAt = surf(o, E.x ?? o.a * 0.6, E.y ?? o.b * 0.18);
  const eyes = o.oneSide ? [stick(g, makeEye(E.s ?? 1.05), eyeAt)] : pair(g, () => makeEye(E.s ?? 1.05), eyeAt, 0.004);
  const M = o.mouth || {};
  const mAt = surf(o, M.x ?? o.a * 0.86, M.y ?? -o.b * 0.2); // 입: 코끝 옆면 양쪽 (코끝 한가운데는 테두리에 가려짐)
  if (o.oneSide) stick(g, makeMouth(M.kind, M.s ?? 0.85), mAt, 0.006); else pair(g, () => makeMouth(M.kind, M.s ?? 0.85), mAt, 0.006);
  const BL = o.blush || {}, blAt = surf(o, BL.x ?? o.a * 0.55, BL.y ?? -o.b * 0.33);
  if (o.oneSide) stick(g, makeBlush(BL.s ?? 1), blAt, 0.006); else pair(g, () => makeBlush(BL.s ?? 1), blAt, 0.006);
  const extra = o.extra ? o.extra(g, o, parts, eyes) : null;
  finish(g);
  const blink = blinker(eyes), tw = o.tailWag ?? 7;
  g.userData.anim = (t) => {
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * tw) * 0.35;
    for (const p of parts.pecs) p.pg.rotation.y = p.sz * (0.3 + Math.sin(t * 9) * 0.35);
    blink(t); extra?.(t);
  };
  return g;
}

// ── 물고기 17종 ──
const FISH_MODELS = {
  // 일반
  mackerel: () => fish({
    a: 0.38, b: 0.25, c: 0.2, taper: 0.35, fin: 0x5aa0e0,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#2f78c8', '#f4f8fc', 0.27);
      x.strokeStyle = '#173a74'; x.lineWidth = 9; x.lineCap = 'round';
      for (let i = 0; i < 7; i++) for (const side of [0, 1]) {
        x.beginPath(); for (let k = 0; k <= 10; k++) { const u = side ? W - k * 12 : k * 12, v = H * (0.12 + i * 0.1) + Math.sin(k * 0.9 + i) * 7; k ? x.lineTo(u, v) : x.moveTo(u, v); } x.stroke();
      }
    },
    tail: { type: 'fork', w: 1.05 }, dorsal: { type: 'round', l: 0.13, h: 0.1 },
  }),
  horse: () => fish({ // 전갱이: 은빛 초록 등, 아가미 뒤 검은 점, 노란 옆줄
    a: 0.37, b: 0.24, c: 0.18, taper: 0.45, fin: 0xd9d06a,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#5c9a8e', '#eef3f2', 0.24);
      x.fillStyle = '#d8c95c'; x.fillRect(W * 0.22, H * 0.3, 10, H * 0.65); x.fillRect(W * 0.78 - 10, H * 0.3, 10, H * 0.65);
      x.fillStyle = '#222'; dot(x, W * 0.2, H * 0.24, 10, 8); dot(x, W * 0.8, H * 0.24, 10, 8);
    },
    tail: { type: 'fork', w: 1.1 }, dorsal: { type: 'spiky', l: 0.14, h: 0.09, n: 4 },
  }),
  rockfish: () => fish({ // 볼락: 아주 큰 눈, 가시 등지느러미, 흐린 세로 띠
    a: 0.34, b: 0.25, c: 0.2, taper: 0.3, fin: 0x6d5a4e,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#6b5a50', '#d8c9bc', 0.3);
      x.fillStyle = 'rgba(50,38,32,.45)'; for (let i = 0; i < 4; i++) x.fillRect(0, H * (0.28 + i * 0.17), W, 14);
    },
    tail: { type: 'fan', w: 1 }, dorsal: { type: 'spiky', l: 0.22, h: 0.12, n: 5, x: 0.1 },
    eye: { s: 1.25, x: 0.17, y: 0.06 }, blush: { x: 0.13 },
  }),
  greenling: () => fish({ // 노래미: 주황빛 갈색 얼룩, 긴 등지느러미
    a: 0.4, b: 0.22, c: 0.18, taper: 0.4, fin: 0xc98a4a,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#b0743c', '#f2dfc4', 0.3);
      x.fillStyle = 'rgba(110,64,30,.7)'; for (let i = 0; i < 26; i++) dot(x, onBack(W, 0.3), H * (0.15 + Math.random() * 0.8), 9 + Math.random() * 8, 6 + Math.random() * 5);
    },
    tail: { type: 'fan', w: 0.95 }, dorsal: { type: 'long', l: 0.42, h: 0.08, x: 0.18 },
  }),
  flounder: () => fish({ // 가자미: 납작, 눈 두 개가 한쪽(+z)에
    a: 0.36, b: 0.27, c: 0.07, taper: 0.25, fin: 0xb79a72, oneSide: true,
    paint: (x, W, H) => {
      x.fillStyle = '#a8865c'; x.fillRect(0, 0, W / 2, H); x.fillStyle = '#f3ece0'; x.fillRect(W / 2, 0, W / 2, H);
      x.fillStyle = 'rgba(90,64,40,.6)'; for (let i = 0; i < 30; i++) dot(x, Math.random() * W * 0.5, Math.random() * H, 7 + Math.random() * 7);
      x.fillStyle = 'rgba(255,240,210,.7)'; for (let i = 0; i < 14; i++) dot(x, Math.random() * W * 0.5, Math.random() * H, 5);
    },
    tail: { type: 'fan', w: 0.8 }, dorsal: { type: 'long', l: 0.55, h: 0.07, x: 0.28 }, anal: { l: 0.4, h: 0.06, x: 0.12 },
    pec: { rx: 0.05, ry: 0.03 }, eye: { x: 0.2, y: 0.12, s: 0.95 }, blush: { x: 0.24, y: -0.04 },
    extra(g, o, parts, eyes) { eyes.push(stick(g, makeEye(0.85), surf(o, 0.1, 0.18))); return null; }, // 둘째 눈도 +z쪽 (가자미답게)
  }),
  squid: () => squid(),
  puffer: () => fish({
    a: 0.32, b: 0.3, c: 0.29, taper: 0.1, fin: 0xf7cf63, tailWag: 6,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#f0b93a', '#fff4d6', 0.3);
      x.fillStyle = '#a86f1e'; for (let i = 0; i < 40; i++) dot(x, onBack(W, 0.28), 40 + Math.random() * (H - 80), 6 + Math.random() * 6);
    },
    tail: { type: 'fan', w: 0.7 }, pec: { rx: 0.06, ry: 0.045, y: -0.05 },
    eye: { s: 1.15, x: 0.2, y: 0.08 }, mouth: { kind: 'o', s: 1.15, y: -0.06 }, blush: { x: 0.2, y: -0.1, s: 1.1 },
    extra(g, o, parts) {
      const m = toon(0xe8a62e), geo = new THREE.ConeGeometry(0.03, 0.08, 8);
      for (let i = 0; i < 26; i++) {
        const th = Math.acos(1 - 2 * ((i + 0.5) / 26)), ph = i * 2.4;
        const d = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        if (d.y < -0.2 || d.x > 0.35) continue;
        const s = mesh(geo, m); s.position.set(d.x * o.a, d.y * o.b, d.z * o.c).addScaledVector(d, 0.03);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(s);
      }
      return (t) => { parts.body.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03); };
    },
  }),
  // 희귀
  seabream: () => fish({ // 참돔: 분홍빛 빨강 + 파란 점, 높은 몸
    a: 0.36, b: 0.28, c: 0.17, taper: 0.45, hump: 0.15, fin: 0xf08a8a,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#e2566a', '#ffe0dc', 0.3);
      x.fillStyle = '#7ec8ff'; for (let i = 0; i < 34; i++) dot(x, onBack(W, 0.3), H * (0.15 + Math.random() * 0.75), 5);
    },
    tail: { type: 'fork', w: 1.1 }, dorsal: { type: 'spiky', l: 0.3, h: 0.13, n: 6, x: 0.14 }, anal: { l: 0.1, h: 0.06 },
  }),
  blackporgy: () => fish({ // 감성돔: 은회색, 흐린 세로 띠, 높은 몸
    a: 0.36, b: 0.28, c: 0.17, taper: 0.45, hump: 0.12, fin: 0x55606e,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#4c5563', '#dfe4ea', 0.32);
      x.fillStyle = 'rgba(40,46,56,.35)'; for (let i = 0; i < 6; i++) x.fillRect(0, H * (0.2 + i * 0.12), W, 12);
      x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 2; for (let v = 20; v < H; v += 16) { x.beginPath(); x.moveTo(0, v); x.lineTo(W, v); x.stroke(); }
    },
    tail: { type: 'fork', w: 1.05 }, dorsal: { type: 'spiky', l: 0.3, h: 0.13, n: 6, x: 0.14 }, anal: { l: 0.1, h: 0.06 },
  }),
  rockcod: () => fish({ // 우럭: 얼룩덜룩 회색, 큰 머리, 두툼한 입술, 머리 가시
    a: 0.37, b: 0.27, c: 0.22, taper: 0.5, fin: 0x5f5a58,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#5d5757', '#e3ddd6', 0.33);
      x.fillStyle = 'rgba(30,28,30,.55)'; for (let i = 0; i < 30; i++) dot(x, onBack(W, 0.33), Math.random() * H, 8 + Math.random() * 10, 6 + Math.random() * 6);
    },
    tail: { type: 'fan', w: 1 }, dorsal: { type: 'spiky', l: 0.26, h: 0.12, n: 6, x: 0.1 },
    eye: { s: 1.2, y: 0.08 }, mouth: { kind: 'lips', s: 0.95, x: 0.3, y: -0.07 },
    extra(g, o) {
      const m = toon(0x6f6764);
      for (const x of [0.2, 0.26]) for (const sz of [1, -1]) { const at = surf(o, x, topY(o, x) * 0.7); const c = mesh(new THREE.ConeGeometry(0.016, 0.05, 6), m); c.position.copy(at.p).addScaledVector(at.n, 0.015); c.position.z *= sz; c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.n.clone().setZ(at.n.z * sz)); g.add(c); }
      return null;
    },
  }),
  yellowtail: () => fish({ // 방어: 길쭉, 파란 등, 노란 옆줄, 노란 꼬리
    a: 0.42, b: 0.22, c: 0.18, taper: 0.5, fin: 0xf2cc3a,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#3360a8', '#f3f6fa', 0.24);
      x.fillStyle = '#f5d03b'; x.fillRect(W * 0.2, 0, 16, H); x.fillRect(W * 0.8 - 16, 0, 16, H);
    },
    tail: { type: 'fork', w: 1.2, color: 0xf2cc3a }, dorsal: { type: 'round', l: 0.12, h: 0.08, color: 0x3a6cb8 },
  }),
  octopus: () => octopus(),
  // 전설
  goldball: () => fish({ // 🏓 황금 탁구공 물고기: 몸 = 황금 탁구공, 손 = 작은 탁구채, 왕관
    a: 0.3, b: 0.3, c: 0.3, taper: 0, fin: 0xffd84a,
    bodyMat: { emissive: 0x6b4a00, emissiveIntensity: 0.35 },
    paint: (x, W, H) => {
      const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#ffd23a'); gr.addColorStop(0.5, '#fff0a0'); gr.addColorStop(1, '#ffd23a');
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff8d8'; x.fillRect(0, H / 2 - 3, W, 6); // 탁구공 이음매
    },
    tail: { type: 'fan', w: 0.8 }, pec: { none: true },
    eye: { x: 0.2, y: 0.08, s: 1.15 }, blush: { x: 0.2, y: -0.1 },
    extra(g, o) {
      const paddles = [1, -1].map((sz) => { // 작은 탁구채 손
        const p = new THREE.Group(); const at = surf(o, 0.02, -0.1); p.position.copy(at.p).addScaledVector(at.n, 0.02); p.position.z *= sz;
        const head = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 24), toon(0xe0333c), -0.03, -0.08, 0); head.rotation.x = Math.PI / 2; p.add(head);
        const back = mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 24), toon(0x222222), -0.03, -0.08, -0.016 * sz); back.rotation.x = Math.PI / 2; p.add(back);
        p.add(mesh(new THREE.BoxGeometry(0.025, 0.07, 0.022), toon(0xc8955a), -0.01, -0.01, 0));
        p.rotation.z = 0.5; g.add(p); return { p, sz };
      });
      const crown = new THREE.Group(); crown.position.set(0.02, 0.29, 0); crown.rotation.z = -0.15; g.add(crown); // 꼭대기 작은 왕관
      const gold = toon(0xffc21a, { emissive: 0x553300, emissiveIntensity: 0.4 });
      crown.add(mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.04, 16, 1, true), gold));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; crown.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 6), gold, Math.cos(a) * 0.065, 0.04, Math.sin(a) * 0.065)); crown.add(mesh(sph(0.012, 8, 6), toon(0xff5a7a), Math.cos(a) * 0.065, 0.07, Math.sin(a) * 0.065)); }
      const aura = addAura(g, 0xffe27a, 7);
      return (t) => { for (const p of paddles) p.p.rotation.z = 0.5 + Math.sin(t * 6 + (p.sz > 0 ? 0 : 1.5)) * 0.4; aura(t); };
    },
  }),
  dragon: () => fish({ // 🌊 경주 용왕 물고기: 옥빛 비늘, 금 뿔, 긴 수염, 나부끼는 꼬리, 여의주
    a: 0.42, b: 0.22, c: 0.18, taper: 0.55, fin: 0xff8a5c,
    bodyMat: { emissive: 0x0b3a36, emissiveIntensity: 0.3 },
    paint: (x, W, H) => {
      backBelly(x, W, H, '#1fa391', '#fff2c4', 0.3);
      x.strokeStyle = 'rgba(255,224,120,.85)'; x.lineWidth = 3;
      for (let v = 10; v < H; v += 18) for (let u = (v / 18) % 2 ? 0 : 11; u < W; u += 22) { x.beginPath(); x.arc(u, v, 10, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); } // 비늘
    },
    tail: { type: 'flow', w: 1, color: 0xff7a5a }, dorsal: { type: 'spiky', l: 0.5, h: 0.1, n: 8, x: 0.24, color: 0xff6a4a },
    eye: { s: 1.15, y: 0.06 },
    extra(g, o, parts) {
      const gold = toon(0xffcf3a, { emissive: 0x553300, emissiveIntensity: 0.4 });
      for (const sz of [1, -1]) { // 뿔 (가지 하나)
        const h = new THREE.Group(); h.position.set(0.2, topY(o, 0.2) - 0.02, 0.05 * sz); h.rotation.set(sz * 0.35, 0, -0.5); g.add(h);
        h.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.14, 8), gold, 0, 0.07, 0));
        const br = mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.06, 8), gold, 0.025, 0.08, 0); br.rotation.z = -0.8; h.add(br);
        h.add(mesh(sph(0.014, 8, 6), gold, 0, 0.14, 0));
      }
      const whiskers = [1, -1].map((sz) => { // 긴 수염
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.39, -0.04, 0.05 * sz), new THREE.Vector3(0.5, -0.02, 0.14 * sz), new THREE.Vector3(0.48, -0.12, 0.26 * sz), new THREE.Vector3(0.38, -0.18, 0.3 * sz)]);
        const w = mesh(new THREE.TubeGeometry(curve, 20, 0.011, 6), gold); g.add(w); return w;
      });
      const pearl = mesh(sph(0.045, 16, 12), toon(0xfff6ff, { emissive: 0x6a5a8a, emissiveIntensity: 0.5 })); g.add(pearl); // 여의주
      const aura = addAura(g, 0x9fffe8, 7, 0.5);
      return (t) => { whiskers.forEach((w, i) => { w.rotation.x = Math.sin(t * 2 + i) * 0.08; }); pearl.position.set(0.56, -0.16 + Math.sin(t * 2.5) * 0.03, 0.12); parts.tail.rotation.x = Math.sin(t * 3) * 0.15; aura(t); };
    },
  }),
  // 조건 (희귀)
  lattegoby: () => fish({ // ☕ 라테 망둥어: 커피색 + 우유 배, 머리 위 라테 거품(하트) + 김
    a: 0.38, b: 0.22, c: 0.2, taper: 0.45, fin: 0xc9a07a,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#7a4a2c', '#f6e6cf', 0.3);
      x.fillStyle = 'rgba(246,230,207,.55)'; for (let i = 0; i < 18; i++) dot(x, onBack(W, 0.3), H * (0.25 + Math.random() * 0.7), 6);
    },
    tail: { type: 'fan', w: 0.95 }, dorsal: { type: 'round', l: 0.09, h: 0.08, x: -0.08 },
    pec: { rx: 0.08, ry: 0.06 }, eye: { x: 0.24, y: 0.13, s: 1.15 },
    extra(g, o) { // 머리 위 작은 라테 잔 (거품 하트가 보이게 살짝 기울임)
      const cup = new THREE.Group(); cup.position.set(0.0, topY(o, 0) - 0.01, 0); cup.rotation.set(0.35, 0, -0.25); cup.scale.setScalar(1.6); g.add(cup);
      cup.add(mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.08, 20), toon(0xffffff), 0, 0.03, 0));
      const hd = mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), toon(0xffffff), 0, 0.035, -0.08); hd.rotation.y = Math.PI / 2; cup.add(hd);
      const top = noOl(mesh(new THREE.CircleGeometry(0.066, 20), basic(0xb07848), 0, 0.071, 0)); top.rotation.x = -Math.PI / 2; cup.add(top);
      const heart = new THREE.Shape(); heart.moveTo(0, -0.035); heart.bezierCurveTo(-0.06, 0, -0.025, 0.045, 0, 0.018); heart.bezierCurveTo(0.025, 0.045, 0.06, 0, 0, -0.035);
      const h = noOl(mesh(new THREE.ShapeGeometry(heart, 10), basic(0xfff6e8), 0, 0.073, 0)); h.rotation.x = -Math.PI / 2; cup.add(h);
      const steam = [0, 1].map(() => { const st = noOl(mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 16, Math.PI * 1.2), basic(0xffffff, { transparent: true, opacity: 0.7 }))); cup.add(st); return st; });
      return (t) => steam.forEach((st, k) => { const q = (t * 0.6 + k * 0.5) % 1; st.position.set(-0.02 + k * 0.04, 0.1 + q * 0.13, 0); st.material.opacity = 0.7 * (1 - q); st.rotation.z = t * 2 + k; });
    },
  }),
  moonhair: () => fish({ // 🌙 달빛 갈치: 길고 납작한 은빛 리본, 초승달 무늬, 은은히 빛남
    a: 0.5, b: 0.15, c: 0.075, taper: 0.8, fin: 0xcfe2ff,
    bodyMat: { emissive: 0x31406a, emissiveIntensity: 0.6 },
    paint: (x, W, H) => {
      const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#7f97c8'); gr.addColorStop(0.3, '#c9d6f0'); gr.addColorStop(0.5, '#f4f8ff'); gr.addColorStop(0.7, '#c9d6f0'); gr.addColorStop(1, '#7f97c8');
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      for (const cx of [W * 0.25, W * 0.75]) { x.fillStyle = '#ffd84a'; dot(x, cx, H * 0.38, 30, 26); x.fillStyle = '#e8eefa'; dot(x, cx - 12, H * 0.35, 25, 22); }
      x.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 16; i++) dot(x, Math.random() * W, Math.random() * H, 2.5);
    },
    tail: null, pec: { rx: 0.04, ry: 0.025 },
    eye: { x: 0.33, y: 0.035, s: 0.95 }, mouth: { s: 0.65, y: -0.035 }, blush: { x: 0.28, y: -0.06, s: 0.75 },
    extra(g, o, parts) { const aura = addAura(g, 0xcfe0ff, 5, 0.5); return (t) => { parts.body.rotation.x = Math.sin(t * 3) * 0.08; aura(t); }; },
  }),
  raindrop: () => fish({ // 🌧️ 빗방울 숭어: 푸른 회색 + 물방울 무늬, 머리 위 작은 비구름
    a: 0.38, b: 0.23, c: 0.19, taper: 0.4, fin: 0x8fb0cc,
    paint: (x, W, H) => {
      backBelly(x, W, H, '#5f7f9e', '#eef4fa', 0.27);
      x.fillStyle = '#bfe4ff';
      for (let i = 0; i < 22; i++) { const u = onBack(W, 0.27), v = H * (0.12 + Math.random() * 0.8); x.beginPath(); x.moveTo(u, v - 12); x.quadraticCurveTo(u + 8, v + 2, u, v + 6); x.quadraticCurveTo(u - 8, v + 2, u, v - 12); x.fill(); }
    },
    tail: { type: 'fork', w: 1 }, dorsal: { type: 'round', l: 0.1, h: 0.08 },
    extra(g) {
      const cloud = new THREE.Group(); g.add(cloud);
      const cm = toon(0xf2f6fb);
      for (const [x, y, r] of [[0, 0, 0.08], [0.08, -0.01, 0.065], [-0.08, -0.01, 0.06], [0.03, 0.05, 0.06]]) cloud.add(mesh(sph(r, 16, 12), cm, x, y, 0));
      const drops = [0, 1, 2].map((i) => { const d = noOl(mesh(sph(0.015, 8, 6), basic(0x6fb8ff))); d.scale.y = 1.6; cloud.add(d); return { d, x: -0.06 + i * 0.06, ph: i * 0.33 }; });
      return (t) => { cloud.position.set(0.05, 0.42 + Math.sin(t * 1.8) * 0.015, 0); for (const d of drops) { const k = (t * 1.3 + d.ph) % 1; d.d.position.set(d.x, -0.06 - k * 0.22, 0); d.d.visible = k < 0.85; } };
    },
  }),
};

// 문어·오징어 다리 (끝으로 갈수록 가늘게 + 빨판)
function tentacles(g, legM, suckM, n, len, y0 = -0.04, long = []) {
  const legs = [], k = len / 0.33;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.2, dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), L = long.includes(i) ? 1.8 : 1;
    const pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(0.14 * k).setY(-0.1 * L * k), dir.clone().multiplyScalar(0.27 * k).setY(-0.13 * L * k), dir.clone().multiplyScalar(len).setY(-0.06 * L * k), dir.clone().multiplyScalar(0.3 * k).setY(0)];
    const curve = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(curve, 24, 0.06 * k, 10, false);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let q = 0; q < pos.count; q++) { const tt = Math.floor(q / 11) / 24, cp = curve.getPointAt(tt); v.fromBufferAttribute(pos, q).sub(cp).multiplyScalar(1 - 0.72 * tt).add(cp); pos.setXYZ(q, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    const lg = new THREE.Group(); lg.position.y = y0; lg.add(new THREE.Mesh(geo, legM)); g.add(lg);
    for (const tt of [0.35, 0.55, 0.72]) { const s = noOl(mesh(sph(0.018 * (1.2 - tt) * k, 8, 6), suckM)); s.position.copy(curve.getPointAt(tt)).add(new THREE.Vector3(0, -0.035 * (1 - tt) * k, 0)); lg.add(s); }
    legs.push({ lg, ph: i * 0.8 });
  }
  return legs;
}
// 타원체 머리 앞(+z) 겉면 (가운데 cy)
function headAt(a, b, c, cy, x, y) {
  const z = c * Math.sqrt(Math.max(0.0001, 1 - (x / a) ** 2 - ((y - cy) / b) ** 2));
  return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x / a / a, (y - cy) / b / b, z / c / c).normalize() };
}
// 문어 (정면 +z): 둥근 머리 + 다리 8개
function octopus() {
  const g = new THREE.Group(), col = 0xff7466;
  const head = mesh(sph(1, 36, 26), toon(0xffffff, { map: bodyTex((x, W, H) => { x.fillStyle = hex(col); x.fillRect(0, 0, W, H); x.fillStyle = '#ffb0a3'; for (let i = 0; i < 26; i++) dot(x, Math.random() * W, Math.random() * H * 0.8, 5 + Math.random() * 7); }) }), 0, 0.12, 0);
  head.scale.set(0.25, 0.28, 0.25); g.add(head);
  const legs = tentacles(g, toon(col), toon(0xffd2c6), 8, 0.33);
  const at = (x, y) => headAt(0.25, 0.28, 0.25, 0.12, x, y);
  const eyes = [-1, 1].map((sx) => stick(g, makeEye(0.95), at(sx * 0.1, 0.1)));
  stick(g, makeMouth('o', 0.8), at(0, -0.02));
  for (const sx of [-1, 1]) stick(g, makeBlush(0.9), at(sx * 0.16, 0.02), 0.006);
  finish(g);
  const blink = blinker(eyes);
  g.userData.faceZ = true;
  g.userData.anim = (t) => { for (const l of legs) { l.lg.rotation.x = Math.sin(t * 2.4 + l.ph) * 0.12; l.lg.rotation.z = Math.cos(t * 2.4 + l.ph) * 0.12; } head.position.y = 0.12 + Math.sin(t * 2.4) * 0.012; blink(t); };
  return g;
}
// 오징어 (정면 +z): 뾰족한 몸통 + 위 지느러미 + 짧은 다리 8 + 긴 다리 2
function squid() {
  const g = new THREE.Group(), col = 0xf7e3e6;
  const pts = [[0, 0.62], [0.05, 0.58], [0.12, 0.46], [0.16, 0.3], [0.17, 0.14], [0.16, 0.02], [0.13, -0.04], [0, -0.06]].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const tex = bodyTex((x, W, H) => { x.fillStyle = hex(col); x.fillRect(0, 0, W, H); x.fillStyle = '#f2a0b0'; for (let i = 0; i < 70; i++) dot(x, Math.random() * W, Math.random() * H * 0.85, 2 + Math.random() * 3); }, 256, 256);
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), toon(0xffffff, { map: tex })); body.scale.z = 0.85; body.position.y = -0.1; g.add(body);
  const finM = toon(0xf4c9d2);
  const fins = [1, -1].map((sx) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.12, 0.02, 0.13, -0.1); s.quadraticCurveTo(0.06, -0.12, 0, -0.2); s.lineTo(0, 0); const m = new THREE.Mesh(finGeo(s, 0.01), finM); m.position.set(0.08 * sx, 0.48, 0); m.scale.x = sx; g.add(m); return m; });
  const legs = tentacles(g, toon(0xf6d6dc), toon(0xffffff), 10, 0.2, -0.14, [2, 7]);
  const at = (x, y) => headAt(0.165, 0.2, 0.14, 0.05, x, y);
  const eyes = [-1, 1].map((sx) => stick(g, makeEye(0.85), at(sx * 0.075, 0.03)));
  stick(g, makeMouth('smile', 0.7), at(0, -0.07));
  for (const sx of [-1, 1]) stick(g, makeBlush(0.8), at(sx * 0.11, -0.05), 0.006);
  finish(g);
  const blink = blinker(eyes);
  g.userData.faceZ = true;
  g.userData.anim = (t) => { for (const l of legs) l.lg.rotation.x = Math.sin(t * 2.6 + l.ph) * 0.15; fins.forEach((f, i) => { f.rotation.y = (i ? -1 : 1) * Math.sin(t * 5) * 0.35; }); blink(t); };
  return g;
}

// ── 잡동사니 9개 (얼굴 없음, 같은 그림체) ──
const JUNK_MODELS = {
  stick() {
    const g = new THREE.Group(), bark = toon(0x8a5a32), leaf = toon(0x6cc04a);
    const seg = (x0, y0, x1, y1, r0, r1) => { const a = new THREE.Vector3(x0, y0, 0), b = new THREE.Vector3(x1, y1, 0), m = mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 10), bark); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(m); };
    seg(-0.4, -0.08, 0.05, 0.02, 0.04, 0.032); seg(0.05, 0.02, 0.4, 0.08, 0.032, 0.022); seg(0.05, 0.02, 0.2, 0.2, 0.026, 0.016);
    g.add(mesh(sph(0.04, 12, 8), bark, -0.4, -0.08, 0));
    for (const [x, y, r] of [[0.2, 0.2, 0.6], [0.38, 0.08, -0.3]]) { const l = mesh(finGeo(SH.leaf(0.12, 0.05), 0.006), leaf, x, y, 0); l.rotation.z = r; g.add(l); }
    finish(g); g.userData.anim = (t) => { g.rotation.z = Math.sin(t * 1.5) * 0.05; }; return g;
  },
  can() {
    const g = new THREE.Group();
    const tex = bodyTex((x, W, H) => { x.fillStyle = '#e8343c'; x.fillRect(0, 0, W, H); x.strokeStyle = '#fff'; x.lineWidth = 14; x.beginPath(); for (let u = 0; u <= W; u += 8) x.lineTo(u, H / 2 + Math.sin(u / 40) * 28); x.stroke(); }, 512, 256);
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 28), toon(0xffffff, { map: tex })));
    const silver = toon(0xcfd6dd);
    g.add(mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.03, 28), silver, 0, 0.195, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.115, 0.03, 28), silver, 0, -0.195, 0));
    const tab = mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14), silver, 0.03, 0.212, 0); tab.rotation.x = Math.PI / 2; g.add(tab);
    const dent = mesh(sph(0.05, 12, 8), toon(0xb8262c), 0, 0.05, 0.115); dent.scale.z = 0.25; g.add(dent);
    g.rotation.z = -1.2; finish(g); g.userData.anim = (t) => { g.rotation.x = Math.sin(t * 1.4) * 0.15; }; return g;
  },
  boot() {
    const g = new THREE.Group(), y = toon(0xffcf2a);
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.34, 24), y, 0, 0.08, 0));
    const rim = mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 24), toon(0xffe07a), 0, 0.25, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
    const foot = mesh(new THREE.CapsuleGeometry(0.1, 0.14, 6, 16), y, 0.08, -0.1, 0); foot.rotation.z = Math.PI / 2; foot.scale.set(0.8, 1, 1); g.add(foot);
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.03, 0.19), toon(0x5a4a3a), 0.07, -0.18, 0));
    const water = noOl(mesh(new THREE.CircleGeometry(0.095, 20), basic(0x2b6fa8), 0, 0.245, 0)); water.rotation.x = -Math.PI / 2; g.add(water); // 안에 고인 물
    const drop = noOl(mesh(sph(0.02, 8, 6), basic(0x6fc0ff))); drop.scale.y = 1.5; g.add(drop);
    g.rotation.z = 0.35; finish(g);
    g.userData.anim = (t) => { const k = (t * 0.9) % 1; drop.position.set(-0.12, 0.25 - k * 0.45, 0.02); drop.visible = k < 0.9; g.rotation.x = Math.sin(t * 1.3) * 0.08; }; return g;
  },
  bottle() {
    const g = new THREE.Group();
    const pts = [[0, -0.22], [0.1, -0.22], [0.11, -0.18], [0.11, 0.06], [0.09, 0.12], [0.04, 0.18], [0.035, 0.24], [0, 0.24]].map(([r, y]) => new THREE.Vector2(r, y));
    g.add(mesh(new THREE.LatheGeometry(pts, 28), toon(0xbfe9ff, { transparent: true, opacity: 0.6 })));
    g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 16), toon(0x2f8ef0), 0, 0.26, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.113, 0.113, 0.09, 28, 1, true), toon(0x48c774, { side: THREE.DoubleSide }), 0, -0.04, 0));
    g.add(noOl(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 16), basic(0x8fd2ff, { transparent: true, opacity: 0.5 }), 0, -0.18, 0)));
    g.rotation.z = -1.1; finish(g); g.userData.anim = (t) => { g.rotation.x = Math.sin(t * 1.6) * 0.18; }; return g;
  },
  kelp() {
    const g = new THREE.Group(), m = [toon(0x3fae5a), toon(0x5cc76a), toon(0x2f9a6a)];
    const blades = [0, 1, 2].map((i) => {
      const s = new THREE.Shape(); s.moveTo(-0.03, 0);
      for (let k = 1; k <= 8; k++) s.lineTo(-0.035 + Math.sin(k * 1.3 + i) * 0.03, k * 0.06);
      s.quadraticCurveTo(0, 0.53, 0.035 + Math.sin(8 * 1.3 + i) * 0.03, 0.48);
      for (let k = 7; k >= 0; k--) s.lineTo(0.035 + Math.sin(k * 1.3 + i) * 0.03, k * 0.06);
      const b = new THREE.Group(); b.add(mesh(finGeo(s, 0.008), m[i])); b.position.set((i - 1) * 0.06, -0.26, (i - 1) * 0.02); b.rotation.z = (i - 1) * 0.35; g.add(b); return b;
    });
    g.add(mesh(sph(0.05, 12, 8), toon(0x6b5a3a), 0, -0.27, 0)); // 붙은 돌
    g.scale.setScalar(1.35); finish(g); g.userData.anim = (t) => blades.forEach((b, i) => { b.rotation.z = (i - 1) * 0.35 + Math.sin(t * 2 + i) * 0.12; }); return g;
  },
  shell() {
    const g = new THREE.Group();
    const s = new THREE.Shape(); s.moveTo(0, -0.18);
    for (let i = 0; i <= 20; i++) { const a = Math.PI * (0.12 + 0.76 * (i / 20)), r = 0.26 + (i % 2 ? 0.0 : 0.018); s.lineTo(Math.cos(a) * r, -0.18 + Math.sin(a) * r); }
    s.lineTo(0, -0.18);
    const tex = bodyTex((x, W, H) => { x.fillStyle = '#ffc2b2'; x.fillRect(0, 0, W, H); x.strokeStyle = '#f07e7e'; x.lineWidth = 5; for (let i = 0; i <= 10; i++) { x.beginPath(); x.moveTo(W / 2, H); const a = Math.PI * (0.12 + 0.76 * (i / 10)); x.lineTo(W / 2 + Math.cos(a) * W, H - Math.sin(a) * H); x.stroke(); } }, 256, 256);
    const geo = finGeo(s, 0.03); geo.computeBoundingBox(); const bb = geo.boundingBox, uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    g.add(mesh(geo, toon(0xffffff, { map: tex })));
    for (const sx of [-1, 1]) { const e = mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), toon(0xffa494), sx * 0.045, -0.19, 0); e.rotation.z = sx * 0.3; g.add(e); }
    finish(g); g.userData.anim = (t) => { g.rotation.y = Math.sin(t * 1.2) * 0.3; }; return g;
  },
  oldball() {
    const g = new THREE.Group();
    const tex = bodyTex((x, W, H) => { x.fillStyle = '#f1e6c8'; x.fillRect(0, 0, W, H); x.fillStyle = 'rgba(150,120,70,.35)'; for (let i = 0; i < 12; i++) dot(x, Math.random() * W, Math.random() * H, 10 + Math.random() * 18); x.strokeStyle = '#5a4a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(W * 0.15, H * 0.35); for (let k = 1; k < 7; k++) x.lineTo(W * 0.15 + k * 14, H * 0.35 + (k % 2 ? 14 : -6)); x.stroke(); }, 256, 128);
    g.add(mesh(sph(0.2, 32, 24), toon(0xffffff, { map: tex })));
    const aid = new THREE.Group(); aid.position.set(0.06, 0.08, 0.17); aid.lookAt(0.3, 0.4, 0.9); g.add(aid); // 반창고
    const pad = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.012), toon(0xf2c79a)); pad.rotation.z = 0.5; aid.add(pad);
    const mid = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.016), toon(0xffe3c4)); mid.rotation.z = 0.5; aid.add(mid);
    finish(g); g.userData.anim = (t) => { g.rotation.y = Math.sin(t * 0.8) * 0.6; }; return g;
  },
  brokenpaddle() { // 한쪽이 깨진 머리 + 뚝 부러진 손잡이
    const g = new THREE.Group();
    const s = new THREE.Shape(); s.moveTo(0.1, 0.11); s.absarc(0, 0, 0.15, Math.PI * 0.26, Math.PI * 2.0 - 0.05, false);
    for (const [x, y] of [[0.12, 0.0], [0.07, 0.03], [0.11, 0.06], [0.06, 0.08], [0.1, 0.11]]) s.lineTo(x, y); // 깨진 톱니
    g.add(mesh(finGeo(s, 0.025), toon(0xe0333c), 0, 0.1, 0));
    g.add(mesh(finGeo(s, 0.01), toon(0x222222), 0, 0.1, -0.026));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.13, 0.045), toon(0xc8955a), 0, -0.1, 0));
    for (const [x, r, h] of [[-0.018, 0.25, 0.05], [0.004, -0.1, 0.07], [0.02, -0.3, 0.04]]) { const c = mesh(new THREE.ConeGeometry(0.011, h, 4), toon(0xe0b07a), x, -0.165 - h / 2 + 0.01, 0); c.rotation.z = Math.PI + r; g.add(c); }
    const chip = mesh(finGeo(SH.oval(0.03, 0.02), 0.02), toon(0xe0333c), 0.2, 0.17, 0); chip.rotation.z = 0.6; g.add(chip); // 떨어져 나간 조각
    g.scale.setScalar(1.3); g.rotation.z = -0.35; finish(g); g.userData.anim = (t) => { g.rotation.y = Math.sin(t * 1.1) * 0.5; chip.position.y = 0.17 + Math.sin(t * 2) * 0.015; }; return g;
  },
  baguette() {
    const g = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.075, 0.6, 8, 20); geo.rotateZ(Math.PI / 2);
    const b = mesh(geo, toon(0xd99a4e)); b.scale.set(1, 0.85, 1); g.add(b);
    for (let i = 0; i < 5; i++) { const c = mesh(sph(0.05, 12, 8), toon(0xf6d49a), -0.24 + i * 0.12, 0.05, 0); c.scale.set(1.3, 0.3, 0.45); c.rotation.set(-0.25, 0.5, 0); g.add(c); }
    const bite = noOl(mesh(sph(0.05, 12, 8), toon(0xfff1d6), 0.37, 0.03, 0.04)); bite.scale.set(0.6, 0.9, 0.6); g.add(bite); // 한 입 베어 문 자국
    g.rotation.z = 0.25; finish(g); g.userData.anim = (t) => { g.rotation.y = Math.sin(t * 1.2) * 0.4; }; return g;
  },
};

export const FISH_LIST = [
  ['mackerel', '고등어', 'common'], ['horse', '전갱이', 'common'], ['rockfish', '볼락', 'common'], ['greenling', '노래미', 'common'], ['flounder', '가자미', 'common'], ['squid', '오징어', 'common'], ['puffer', '복어', 'common'],
  ['seabream', '참돔', 'rare'], ['blackporgy', '감성돔', 'rare'], ['rockcod', '우럭', 'rare'], ['yellowtail', '방어', 'rare'], ['octopus', '문어', 'rare'],
  ['lattegoby', '☕ 라테 망둥어', 'rare'], ['moonhair', '🌙 달빛 갈치', 'rare'], ['raindrop', '🌧️ 빗방울 숭어', 'rare'],
  ['goldball', '🏓 황금 탁구공 물고기', 'legend'], ['dragon', '🌊 경주 용왕 물고기', 'legend'],
];
export const JUNK_LIST = [
  ['stick', '나뭇가지'], ['can', '빈 캔'], ['boot', '장화'], ['bottle', '페트병'], ['kelp', '해초'], ['shell', '조개껍데기'], ['oldball', '낡은 탁구공'], ['brokenpaddle', '부러진 탁구채'], ['baguette', '김제빵의 바게트'],
];
export function makeModel(id) {
  return (FISH_MODELS[id] || JUNK_MODELS[id])();
}
// 고양이 모형(src/games/cats/models.js)이 같은 그림체로 쓰는 도구
export const KIT = { toon, basic, finish, sph, mesh, noOl, makeMouth, makeBlush, blinker };
