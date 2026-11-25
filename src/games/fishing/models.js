// 낚시 물고기·잡동사니 모형 (fishing.md 9장): 카툰 그래픽으로 귀엽게가 핵심(사용자 강조).
// 스타일(재질·테두리·눈·입) × 종류(모양·무늬)로 나눔. 스타일 시안: fish-models.html → 사용자가 고르면 하나만 남김.
// 모형은 머리가 +x, 보는 쪽(오른쪽 눈)이 +z. 크기는 몸길이 약 0.8. g.userData.anim(t)로 꼬리·지느러미·눈 깜빡임.
import * as THREE from 'three';

// ── 스타일 3안 ──
function gradTex(steps) {
  const d = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => d.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(d, steps.length, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
const TOON3 = gradTex([110, 190, 255]), TOON2 = gradTex([150, 255]);
const lighten = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();

function outlineMat(w, color) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, w: { value: w } },
    vertexShader: 'uniform float w; void main(){ vec3 p = position + normal * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
    side: THREE.BackSide,
  });
}

export const STYLES = {
  jelly: {
    name: 'A · 젤리 장난감', desc: '굵은 테두리 + 3단 만화 그림자 + 반짝이는 큰 눈',
    tone: (c) => c,
    mat: (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: TOON3, ...o }),
    outline: 0.018, outlineColor: 0x2a2340,
    eye: 'gloss', mouth: 'smile', blush: 0.55,
  },
  plush: {
    name: 'B · 말랑 인형', desc: '테두리 없음 + 파스텔 + 보송한 재질 + 단추 눈',
    tone: (c) => lighten(c, 0.28),
    mat: (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, ...o }),
    outline: 0, eye: 'bead', mouth: 'omega', blush: 0.45,
  },
  anime: {
    name: 'C · 반짝 만화', desc: '얇은 테두리 + 2단 그림자 + 아주 큰 반짝 눈 + 웃는 입',
    tone: (c) => lighten(c, 0.08),
    mat: (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: TOON2, ...o }),
    outline: 0.01, outlineColor: 0x3a2a3a,
    eye: 'sparkle', mouth: 'open', blush: 0.7,
  },
};

const basic = (c, o) => new THREE.MeshBasicMaterial({ color: c, ...o });
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);

// 눈(+z를 봄, 크기 s). 깜빡일 때 lid(=g.scale.y)를 줄임
function makeEye(style, s, iris = 0x3a6fd8) {
  const g = new THREE.Group();
  if (style.eye === 'gloss') {
    const w = new THREE.Mesh(sph(0.1 * s), basic(0xffffff)); w.scale.z = 0.5; g.add(w);
    const p = new THREE.Mesh(sph(0.068 * s), basic(0x1c1a2a)); p.scale.z = 0.4; p.position.set(0.012 * s, -0.008 * s, 0.03 * s); g.add(p);
    const h1 = new THREE.Mesh(sph(0.026 * s, 10, 8), basic(0xffffff)); h1.position.set(0.034 * s, 0.03 * s, 0.06 * s); g.add(h1);
    const h2 = new THREE.Mesh(sph(0.012 * s, 8, 6), basic(0xffffff)); h2.position.set(-0.012 * s, -0.035 * s, 0.06 * s); g.add(h2);
  } else if (style.eye === 'bead') {
    const b = new THREE.Mesh(sph(0.062 * s), new THREE.MeshStandardMaterial({ color: 0x1a1720, roughness: 0.12, metalness: 0.1 })); b.scale.z = 0.7; g.add(b);
    const h = new THREE.Mesh(sph(0.016 * s, 8, 6), basic(0xffffff)); h.position.set(0.02 * s, 0.024 * s, 0.04 * s); g.add(h);
  } else {
    const w = new THREE.Mesh(sph(0.1 * s), basic(0xffffff)); w.scale.set(1, 1.3, 0.45); g.add(w);
    const ir = new THREE.Mesh(sph(0.075 * s), basic(iris)); ir.scale.set(1, 1.25, 0.32); ir.position.set(0.01 * s, -0.012 * s, 0.024 * s); g.add(ir);
    const p = new THREE.Mesh(sph(0.042 * s), basic(0x14121c)); p.scale.set(1, 1.2, 0.3); p.position.set(0.012 * s, -0.016 * s, 0.032 * s); g.add(p);
    const h1 = new THREE.Mesh(sph(0.03 * s, 10, 8), basic(0xffffff)); h1.position.set(0.035 * s, 0.045 * s, 0.05 * s); g.add(h1);
    const h2 = new THREE.Mesh(sph(0.015 * s, 8, 6), basic(0xffffff)); h2.position.set(-0.025 * s, -0.05 * s, 0.05 * s); g.add(h2);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.1 * s, 0.012 * s, 6, 16, Math.PI * 0.8), basic(0x2a2030)); lash.rotation.z = Math.PI * 0.1; lash.scale.y = 1.3; lash.position.z = 0.01 * s; g.add(lash);
  }
  g.userData.noOutline = true;
  return g;
}
function makeMouth(style, s, kind) {
  const g = new THREE.Group();
  const ink = basic(0x2a1f2e);
  const t = kind || style.mouth;
  if (t === 'o') {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.026 * s, 0.011 * s, 8, 18), basic(0xd9566b)); g.add(r);
    const i = new THREE.Mesh(new THREE.CircleGeometry(0.02 * s, 14), basic(0x5a1f2e)); i.position.z = -0.002; g.add(i);
  } else if (t === 'smile') {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.035 * s, 0.009 * s, 6, 16, Math.PI), ink); m.rotation.z = Math.PI; g.add(m);
  } else if (t === 'omega') {
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.02 * s, 0.007 * s, 6, 12, Math.PI), ink); m.rotation.z = Math.PI; m.position.x = sx * 0.02 * s; g.add(m); }
  } else {
    const sh = new THREE.Shape(); sh.moveTo(-0.04 * s, 0); sh.lineTo(0.04 * s, 0); sh.absarc(0, 0, 0.04 * s, 0, -Math.PI, true);
    g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), basic(0x6b2236)));
    const tg = new THREE.Mesh(new THREE.CircleGeometry(0.02 * s, 12), basic(0xff8ea0)); tg.position.set(0, -0.022 * s, 0.001); g.add(tg);
  }
  g.userData.noOutline = true;
  return g;
}
function makeBlush(style, s) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.045 * s, 18), basic(0xff8fa8, { transparent: true, opacity: style.blush, depthWrite: false }));
  m.scale.y = 0.55; m.userData.noOutline = true;
  return m;
}
// 타원체(반지름 a·b·c) 겉면의 점(x, y, +z쪽)과 바깥 방향
function onEllipsoid(a, b, c, x, y) {
  const z = c * Math.sqrt(Math.max(0.0001, 1 - (x / a) ** 2 - (y / b) ** 2));
  return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x / a / a, y / b / b, z / c / c).normalize() };
}
function stick(g, obj, at, lift = 0.004, center = new THREE.Vector3()) {
  obj.position.copy(at.p).addScaledVector(at.n, lift).add(center);
  obj.lookAt(obj.position.clone().add(at.n));
  g.add(obj);
  return obj;
}
// 양쪽(+z·−z)에 하나씩 붙임
function pair(g, make, at, lift) {
  const out = [];
  for (const sz of [1, -1]) out.push(stick(g, make(), { p: at.p.clone().setZ(at.p.z * sz), n: at.n.clone().setZ(at.n.z * sz) }, lift));
  return out;
}
const nose = (a, y) => ({ p: new THREE.Vector3(a * Math.sqrt(1 - 0), y, 0), n: new THREE.Vector3(1, 0, 0) });
// 둥근 납작 지느러미(Shape → 얇게 뽑아 모서리 둥글게)
function finGeo(shape, depth = 0.025) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
const forkTail = (w = 1) => { const s = new THREE.Shape(); s.moveTo(0.02, 0); s.quadraticCurveTo(-0.1, 0.04, -0.2 * w, 0.17 * w); s.quadraticCurveTo(-0.15 * w, 0.02, -0.2 * w, -0.17 * w); s.quadraticCurveTo(-0.1, -0.04, 0.02, 0); return s; };
const roundFin = (l, h) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(l * 0.2, h * 1.1, -l, h * 0.7); s.quadraticCurveTo(-l * 0.8, h * 0.1, -l * 0.9, 0); s.lineTo(0, 0); return s; };
const oval = (rx, ry) => { const s = new THREE.Shape(); s.absellipse(0, 0, rx, ry, 0, Math.PI * 2); return s; };

// 둥근 몸에 그림 입히기: 축이 x(코 = v 1, 꼬리 = v 0), u = 몸 둘레(u 0·1 = 등, 0.5 = 배)
function bodyTex(paint, W = 512, H = 256) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); paint(x, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function bodyGeo(r) { const g = new THREE.SphereGeometry(r, 40, 28); g.rotateZ(-Math.PI / 2); return g; }
const hex = (c) => '#' + new THREE.Color(c).getHexString();
// 등→배 색 (canvas 가로 = 둘레). 가운데(배) 밝게
function backBelly(x, W, H, back, belly, line = 0.3) {
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, back); g.addColorStop(line, back); g.addColorStop(line + 0.08, belly);
  g.addColorStop(1 - line - 0.08, belly); g.addColorStop(1 - line, back); g.addColorStop(1, back);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

function finish(g, st) {
  if (!st.outline) return g;
  const ol = outlineMat(st.outline, st.outlineColor), list = [];
  g.traverse((m) => {
    let p = m, skip = false;
    while (p) { if (p.userData.noOutline) skip = true; p = p.parent; }
    if (m.isMesh && !skip) list.push(m);
  });
  for (const m of list) { const o = new THREE.Mesh(m.geometry, ol); o.userData.noOutline = true; m.add(o); }
  return g;
}
function blinker(eyes) {
  const off = Math.random() * 3;
  return (t) => { const k = (t + off) % 3.4; const s = k < 0.12 ? Math.abs(1 - k / 0.06) : 1; for (const e of eyes) e.scale.y = Math.max(0.08, s); };
}

// ── 종류 (시안: 고등어 · 복어 · 문어) ──
const SPECIES = {
  mackerel(st) {
    const g = new THREE.Group(), T = st.tone;
    const a = 0.36, b = 0.27, c = 0.23;
    const tex = bodyTex((x, W, H) => {
      backBelly(x, W, H, hex(T(0x2f78c8)), hex(T(0xf4f8fc)), 0.27);
      x.strokeStyle = hex(T(0x173a74)); x.lineWidth = 9; x.lineCap = 'round';
      for (let i = 0; i < 7; i++) { // 등의 물결 줄무늬 (등 = 양 끝)
        const v = 0.18 + i * 0.095;
        for (const side of [0, 1]) { x.beginPath(); for (let k = 0; k <= 10; k++) { const u = side ? W - k * 12 : k * 12; const yy = H * (1 - v) + Math.sin(k * 0.9 + i) * 7; k ? x.lineTo(u, yy) : x.moveTo(u, yy); } x.stroke(); }
      }
    });
    const body = new THREE.Mesh(bodyGeo(1), st.mat(0xffffff, { map: tex })); body.scale.set(a, b, c); g.add(body);
    const finM = st.mat(T(0x5aa0e0));
    const tail = new THREE.Group(); tail.position.x = -a + 0.03; g.add(tail);
    tail.add(new THREE.Mesh(finGeo(forkTail(1.05)), finM));
    const dorsal = new THREE.Mesh(finGeo(roundFin(0.14, 0.11)), finM); dorsal.position.set(0.03, b - 0.03, 0); g.add(dorsal);
    const pecs = [1, -1].map((sz) => {
      const pecG = new THREE.Group(), pec = new THREE.Mesh(finGeo(oval(0.07, 0.04), 0.012), finM); pec.position.x = -0.06; pecG.add(pec);
      const pa = onEllipsoid(a, b, c, 0.04, -0.1); pecG.position.copy(pa.p).addScaledVector(pa.n, 0.01); pecG.position.z *= sz; g.add(pecG); return { pecG, sz };
    });
    const eyes = pair(g, () => makeEye(st, 1.05), onEllipsoid(a, b, c, 0.22, 0.05), st.eye === 'sparkle' ? 0.02 : 0.004);
    stick(g, makeMouth(st, 0.95), onEllipsoid(a, 0.27, 0.23, a * 0.97, -0.05), 0.004);
    pair(g, () => makeBlush(st, 1), onEllipsoid(a, b, c, 0.2, -0.09), 0.006);
    finish(g, st);
    const blink = blinker(eyes);
    g.userData.anim = (t) => { tail.rotation.y = Math.sin(t * 7) * 0.35; for (const p of pecs) p.pecG.rotation.y = p.sz * (0.3 + Math.sin(t * 9) * 0.35); body.rotation.x = Math.sin(t * 2) * 0.02; blink(t); };
    return g;
  },
  puffer(st) {
    const g = new THREE.Group(), T = st.tone;
    const a = 0.33, b = 0.31, c = 0.3;
    const tex = bodyTex((x, W, H) => {
      backBelly(x, W, H, hex(T(0xf0b93a)), hex(T(0xfff4d6)), 0.3);
      x.fillStyle = hex(T(0xa86f1e));
      for (let i = 0; i < 40; i++) { const u = Math.random() < 0.5 ? Math.random() * W * 0.28 : W - Math.random() * W * 0.28; const v = 40 + Math.random() * (H - 80); x.beginPath(); x.arc(u, v, 6 + Math.random() * 6, 0, 7); x.fill(); }
    });
    const body = new THREE.Mesh(bodyGeo(1), st.mat(0xffffff, { map: tex })); body.scale.set(a, b, c); g.add(body);
    const spikeM = st.mat(T(0xe8a62e)), spikeGeo = new THREE.ConeGeometry(0.03, 0.08, 8);
    for (let i = 0; i < 26; i++) { // 가시: 등·옆 위쪽만, 끝을 둥글게 보이게 짧게
      const th = Math.acos(1 - 2 * ((i + 0.5) / 26)), ph = i * 2.4;
      const d = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      if (d.y < -0.2 || d.x > 0.35) continue; // 얼굴 쪽은 비움
      const m = new THREE.Mesh(spikeGeo, spikeM); m.position.set(d.x * a, d.y * b, d.z * c).addScaledVector(d, 0.03);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(m);
    }
    const finM = st.mat(T(0xf7cf63));
    const tail = new THREE.Group(); tail.position.x = -a + 0.02; g.add(tail);
    const tf = new THREE.Mesh(finGeo(oval(0.08, 0.09), 0.014), finM); tf.position.x = -0.06; tail.add(tf);
    const pecs = [1, -1].map((sz) => {
      const pecG = new THREE.Group(), pf = new THREE.Mesh(finGeo(oval(0.06, 0.045), 0.01), finM); pf.position.x = -0.05; pecG.add(pf);
      const pa = onEllipsoid(a, b, c, -0.02, -0.06); pecG.position.copy(pa.p).addScaledVector(pa.n, 0.01); pecG.position.z *= sz; g.add(pecG); return { pecG, sz };
    });
    const eyes = pair(g, () => makeEye(st, 1.15), onEllipsoid(a, b, c, 0.2, 0.08), st.eye === 'sparkle' ? 0.02 : 0.004);
    stick(g, makeMouth(st, 1.15, 'o'), onEllipsoid(a, b, c, a * 0.97, -0.06), 0.004);
    pair(g, () => makeBlush(st, 1.1), onEllipsoid(a, b, c, 0.2, -0.1), 0.006);
    finish(g, st);
    const blink = blinker(eyes);
    g.userData.anim = (t) => { tail.rotation.y = Math.sin(t * 6) * 0.4; for (const p of pecs) p.pecG.rotation.y = p.sz * (0.3 + Math.sin(t * 12) * 0.45); const s = 1 + Math.sin(t * 2.2) * 0.03; body.scale.set(a * s, b * s, c * s); blink(t); };
    return g;
  },
  octopus(st) {
    const g = new THREE.Group(), T = st.tone;
    const col = T(0xff7466), a = 0.25, b = 0.28, c = 0.25;
    const tex = bodyTex((x, W, H) => {
      x.fillStyle = hex(col); x.fillRect(0, 0, W, H);
      x.fillStyle = hex(T(0xffb0a3));
      for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(Math.random() * W, Math.random() * H * 0.8, 5 + Math.random() * 7, 0, 7); x.fill(); }
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), st.mat(0xffffff, { map: tex })); head.scale.set(a, b, c); head.position.y = 0.12; g.add(head);
    const legM = st.mat(col), suck = st.mat(T(0xffd2c6));
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + 0.2, dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const pts = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(0.14).setY(-0.1), dir.clone().multiplyScalar(0.27).setY(-0.13), dir.clone().multiplyScalar(0.33).setY(-0.06), dir.clone().multiplyScalar(0.3).setY(0.0)];
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 24, 0.06, 10, false);
      const pos = geo.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) { // 끝으로 갈수록 가늘게
        const tt = Math.floor(k / 11) / 24, cp = curve.getPointAt(tt);
        v.fromBufferAttribute(pos, k).sub(cp).multiplyScalar(1 - 0.72 * tt).add(cp); pos.setXYZ(k, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const lg = new THREE.Group(); lg.position.y = -0.04; lg.add(new THREE.Mesh(geo, legM)); g.add(lg);
      for (const tt of [0.35, 0.55, 0.72]) { const s = new THREE.Mesh(sph(0.018 * (1.2 - tt), 8, 6), suck); s.position.copy(curve.getPointAt(tt)).add(new THREE.Vector3(0, -0.035 * (1 - tt), 0)); s.userData.noOutline = true; lg.add(s); }
      legs.push({ lg, ph: i * 0.8 });
    }
    // 얼굴: 머리 앞(+z). 문어는 정면이 +z라 눈 두 개
    const eyes = [];
    for (const sx of [-1, 1]) eyes.push(stick(g, makeEye(st, 0.95, 0xd9473f), onEllipsoid(a, b, c, sx * 0.1, -0.02), st.eye === 'sparkle' ? 0.02 : 0.004, new THREE.Vector3(0, 0.12, 0)));
    stick(g, makeMouth(st, 0.8, st.mouth === 'open' ? 'open' : 'o'), onEllipsoid(a, b, c, 0, -0.14), 0.004, new THREE.Vector3(0, 0.12, 0));
    for (const sx of [-1, 1]) stick(g, makeBlush(st, 0.9), onEllipsoid(a, b, c, sx * 0.16, -0.1), 0.006, new THREE.Vector3(0, 0.12, 0));
    finish(g, st);
    const blink = blinker(eyes);
    g.rotation.y = 0.7; // 문어는 얼굴(+z)을 보는 쪽으로
    g.userData.anim = (t) => { for (const l of legs) { l.lg.rotation.x = Math.sin(t * 2.4 + l.ph) * 0.12; l.lg.rotation.z = Math.cos(t * 2.4 + l.ph) * 0.12; } head.position.y = 0.12 + Math.sin(t * 2.4) * 0.012; blink(t); };
    return g;
  },
};
export const SAMPLE = [['mackerel', '고등어'], ['puffer', '복어'], ['octopus', '문어']];

export function makeModel(speciesId, styleId = 'jelly') {
  return SPECIES[speciesId](STYLES[styleId]);
}
