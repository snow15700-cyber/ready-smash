// 탁구공 꾸미기 (기획서 4장 '탁구공 목록'). 보기·소리만 다르고 크기·궤적·판정은 모두 같다.
// 방장이 장착한 공을 방 안의 모두가 본다.
//
// makeBall(id) → THREE.Group (원점 = 공 가운데, 실제 크기)
//   userData.tick(t, dt, s)   매 프레임. s = { vel: Vector3(이번 프레임 속도), smash: 스매시 공인가 }
//   userData.bounce(s)        탁구대·바닥에 튈 때. s = { pos: [x,y,z], speed, smash, floor: 바닥 높이 }
//   userData.hit()            라켓에 맞을 때
//   userData.fx               튈 때·스매시 때 효과 (ballFx가 부른다)
// 모양은 반지름 1로 만들고 BALL_R 배로 줄인다. 효과 그림(Sprite)은 줄이지 않은 root에 붙인다.
import * as THREE from 'three';
import { fxTex } from './fx.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const BALL_R = 0.028; // 보이는 공 반지름 (scene.js의 기본 공과 같음)

// sound: audio.js의 BOUNCE_SKINS (없으면 기본 바운드음)
export const BALLS = [
  // 일반: 색·무늬
  { id: 'orange', name: '주황', grade: 'common' },
  { id: 'yellow', name: '노랑 형광', grade: 'common' },
  { id: 'lime', name: '연두 형광', grade: 'common' },
  { id: 'pink', name: '핑크', grade: 'common' },
  { id: 'half', name: '반반 공', grade: 'common' },
  { id: 'stripe', name: '줄무늬', grade: 'common' },
  { id: 'dots', name: '물방울', grade: 'common' },
  { id: 'stars', name: '별 무늬', grade: 'common' },
  // 고급: 재미있는 공
  { id: 'eye', name: '눈알', grade: 'rare', sound: 'jelly' },
  { id: 'smile', name: '스마일', grade: 'rare', sound: 'rubber' },
  { id: 'tangerine', name: '귤', grade: 'rare', sound: 'peel' },
  { id: 'tomato', name: '방울토마토', grade: 'rare', sound: 'tomato' },
  { id: 'mochi', name: '찹쌀떡', grade: 'rare', sound: 'mochi' },
  { id: 'takoyaki', name: '타코야끼', grade: 'rare', sound: 'tako' },
  { id: 'egg', name: '계란', grade: 'rare', sound: 'eggshell', hatch: 'chick' },
  { id: 'eight', name: '8번 당구공', grade: 'rare', sound: 'billiard' },
  // 전설: 움직이는 효과 + 튈 때·스매시 연출
  { id: 'asteroid', name: '소행성', grade: 'legend', sound: 'rock' },
  { id: 'dragon', name: '드래곤 알', grade: 'legend', sound: 'dragon', hatch: 'dragon' },
  { id: 'sun', name: '미니 태양', grade: 'legend', sound: 'sun' },
];
export const BALL = Object.fromEntries(BALLS.map((b) => [b.id, b]));

/* ───────────── 도구 ───────────── */
const phong = (color, shininess = 30, opts = {}) => new THREE.MeshPhongMaterial({ color, shininess, specular: '#555555', ...opts });
const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
function mesh(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 공 겉면 그림 (가로 = 경도 360°, 세로 = 위→아래). 앞(+z)의 가운데 = (W/4, H/2)
const W = 1024, H = 512, PX = W / (Math.PI * 2); // 1라디안 = PX 픽셀
const FX0 = W / 4, FY0 = H / 2;
function sphereTex(draw, w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// 앞면 그림: (dx, dy)는 앞 가운데에서 라디안 단위. 위도가 높으면 가로로 늘려 그려야 구에서 둥글게 보인다
function face(c, fn) { c.save(); c.translate(FX0, FY0); c.scale(PX, PX); fn(c); c.restore(); }
// 효과 그림 (처음엔 안 보임)
function spr(name, color, size, parent, add = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex(name), color, transparent: true, opacity: 0, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.setScalar(size);
  s.visible = false;
  s.userData.fx = true;
  parent.add(s);
  return s;
}
const smooth = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

// 공 뼈대: root(위치) → squash(크기 R·찌그러짐, 월드 방향) → spin(회전) → 모양
// mode: 'spin' = 날아가는 방향으로 굴러감, 'face' = 앞(+z)이 날아가는 쪽을 봄, 'upright' = 위가 늘 위(제자리 빙글)
// squishy: 튈 때 말랑 찌그러짐을 쓰는 공만 true (지금은 찹쌀떡뿐 — 사용자 결정. 나머지 공은 squish()가 아무것도 안 함)
function base(mode = 'spin', { squishy = false } = {}) {
  const root = new THREE.Group();
  const squash = new THREE.Group();
  squash.scale.setScalar(BALL_R);
  const spin = new THREE.Group();
  root.add(squash); squash.add(spin);
  const st = { sq: 0, sqv: 0, dir: new THREE.Vector3(0, 0, 1), yaw: 0 };
  const q = new THREE.Quaternion(), axis = new THREE.Vector3(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), zero = new THREE.Vector3();
  const sqDir = new THREE.Vector3(0, 1, 0);
  // 공통 움직임: 굴러가기/바라보기 + 튈 때 말랑 찌그러짐(spring)
  function move(dt, s, soft = 0.25) {
    const v = s.vel;
    const sp = v.length();
    if (mode === 'spin') {
      if (sp > 0.05) {
        axis.crossVectors(up, v).normalize();
        q.setFromAxisAngle(axis, Math.min(sp, 14) * dt * 2.2); // 실제보다 느리게 (깜빡임 없게)
        spin.quaternion.premultiply(q);
      }
    } else if (mode === 'face') {
      if (sp > 0.3) st.dir.lerp(v.clone().normalize(), 1 - Math.exp(-dt * 14)).normalize();
      m.lookAt(zero, st.dir, up); // -z가 dir 쪽 → 반대로
      q.setFromRotationMatrix(m);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.PI));
      spin.quaternion.slerp(q, 1 - Math.exp(-dt * 18));
    } else {
      st.yaw += dt * (0.8 + Math.min(sp, 8) * 0.25);
      spin.rotation.set(0, st.yaw, 0);
    }
    // 찌그러짐: sq > 0 이면 위아래로 납작
    // 느린 PC(초당 15장 이하)에서 한 번에 크게 계산하면 용수철이 폭주해 공이 납작하게 굳는다 → 작은 걸음(1/240초)으로 나눠 계산
    for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      st.sqv += (-st.sq * 520 - st.sqv * 22) * h;
      st.sq += st.sqv * h;
    }
    if (!Number.isFinite(st.sq) || !Number.isFinite(st.sqv)) { st.sq = 0; st.sqv = 0; }
    const k = Math.max(-0.4, Math.min(0.6, st.sq)) * soft / 0.25;
    squash.scale.set(BALL_R * (1 + k * 0.5), BALL_R * (1 - k), BALL_R * (1 + k * 0.5));
    void sqDir;
  }
  function squish(amt = 1) { if (squishy) st.sqv += 9 * amt; }
  return { root, squash, spin, st, move, squish };
}
// 전설 후광 + 반짝이 (공 크기에 맞춘 작은 것)
function aura(root, color, { r = 0.05, glow = 0.35, n = 3 } = {}) {
  const halo = spr('glow', color, r * 2.6, root);
  const stars = [];
  for (let i = 0; i < n; i++) stars.push({ s: spr('star4', '#ffffff', 0.02, root), sp: 0.7 + i * 0.17, off: i / n, cyc: -1, size: 0.02 });
  return (t, k = 1) => {
    halo.visible = true;
    halo.material.opacity = glow * k * (0.8 + 0.2 * Math.sin(t * 2.3));
    for (const st of stars) {
      const u = t * st.sp + st.off, kk = u % 1, cyc = Math.floor(u);
      if (cyc !== st.cyc) {
        st.cyc = cyc;
        const a = Math.random() * Math.PI * 2, d = r * (0.7 + Math.random() * 0.5);
        st.s.position.set(Math.cos(a) * d, Math.sin(a) * d, (Math.random() - 0.5) * 0.02);
        st.size = 0.012 + Math.random() * 0.012;
      }
      const e = Math.sin(Math.PI * kk);
      st.s.visible = true;
      st.s.material.opacity = e * e * 0.9 * k;
      st.s.scale.setScalar(st.size * (0.5 + e * 0.7));
    }
  };
}
const SPH = new THREE.SphereGeometry(1, 40, 28);
// 달걀 모양 (아래 통통, 위 뾰족). 높이 약 ±1.2, 가장 굵은 곳 반지름 약 0.92 — 공처럼 굴러가지만 뒤뚱
const EGG = (() => {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = -Math.PI / 2 + (i / 32) * Math.PI, y = Math.sin(a);
    pts.push(new THREE.Vector2(Math.cos(a) * 0.92 * (1 - 0.16 * (y + 1) / 2), y * 1.2));
  }
  return new THREE.LatheGeometry(pts, 40);
})();

/* ───────────── 일반: 색·무늬 ───────────── */
// 탁구공 플라스틱 (살짝 윤기 + 스스로 은은히 빛나 어두운 곳에서도 보이게)
const plastic = (color, map = null, glow = '#ff9a40') => phong(color, 26, { map, emissive: glow, emissiveIntensity: 0.18, specular: '#3a3a3a' });
function solid(color, glow) {
  return () => {
    const b = base();
    mesh(SPH, plastic(color, null, glow), b.spin);
    return b;
  };
}
function painted(draw) {
  return () => {
    const b = base();
    mesh(SPH, plastic('#ffffff', sphereTex(draw)), b.spin);
    return b;
  };
}
const COMMON = {
  orange: solid('#ff8a2a', '#ff7a1a'),
  yellow: solid('#e8ff3a', '#d8ff00'),
  lime: solid('#7dff4a', '#4dff20'),
  pink: solid('#ff9ccc', '#ff6fae'),
  half: painted((c, w, h) => { c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3b4a'; c.fillRect(0, 0, w, h / 2); }),
  stripe: painted((c, w, h) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f6fe0'; c.fillRect(0, h * 0.4, w, h * 0.2);
    c.fillStyle = '#ff8a3d'; c.fillRect(0, h * 0.36, w, h * 0.03); c.fillRect(0, h * 0.61, w, h * 0.03);
  }),
  dots: painted((c, w, h) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
    const r = rng(7), cols = ['#ff5f8f', '#4dabf7', '#ffc53d', '#69db7c', '#b197fc'];
    for (let row = 0; row < 7; row++) {
      const lat = (row + 0.5) / 7 * Math.PI - Math.PI / 2, n = Math.max(2, Math.round(10 * Math.cos(lat)));
      for (let i = 0; i < n; i++) {
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        const x = (i + (row % 2) * 0.5) / n * w, y = (row + 0.5) / 7 * h;
        c.beginPath(); c.ellipse(x, y, 22 / Math.max(0.3, Math.cos(lat)), 22, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }),
  stars: painted((c, w, h) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let row = 0; row < 6; row++) {
      const lat = (row + 0.5) / 6 * Math.PI - Math.PI / 2, n = Math.max(2, Math.round(8 * Math.cos(lat)));
      for (let i = 0; i < n; i++) {
        const x = (i + (row % 2) * 0.5 + r() * 0.2) / n * w, y = (row + 0.5) / 6 * h, s = 24;
        c.save(); c.translate(x, y); c.scale(1 / Math.max(0.35, Math.cos(lat)), 1); c.rotate(r() * 1.2);
        c.beginPath();
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI * 2, rr = k % 2 ? s * 0.45 : s; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fillStyle = '#ffc61a'; c.fill(); c.restore();
      }
    }
  }),
};

/* ───────────── 고급 ───────────── */
// 눈알: 눈동자가 날아가는 쪽을 봄, 맞으면 눈 질끈(> <)
function eyeTex(closed) {
  return sphereTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff4f0'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#ffe6e0');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // 가는 핏줄 몇 가닥 (뒤쪽에서 앞으로)
    const r = rng(3);
    c.strokeStyle = 'rgba(230,90,90,0.45)'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = FX0 + W / 2 + (r() - 0.5) * 300, y = h * (0.2 + r() * 0.6);
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (FX0 - x) * 0.18 + (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); }
      c.stroke();
    }
    face(c, (c) => {
      if (closed) {
        c.strokeStyle = '#2b2a33'; c.lineWidth = 0.09; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(-0.42, -0.22); c.lineTo(-0.08, 0); c.lineTo(-0.42, 0.22); c.stroke();
        c.beginPath(); c.moveTo(0.42, -0.22); c.lineTo(0.08, 0); c.lineTo(0.42, 0.22); c.stroke();
        return;
      }
      const ig = c.createRadialGradient(0, 0, 0.05, 0, 0, 0.5);
      ig.addColorStop(0, '#7fd0ff'); ig.addColorStop(0.6, '#2f8be0'); ig.addColorStop(1, '#174f99');
      c.fillStyle = ig; c.beginPath(); c.arc(0, 0, 0.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.02;
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 0.25, Math.sin(a) * 0.25); c.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); c.stroke(); }
      c.fillStyle = '#111'; c.beginPath(); c.arc(0, 0, 0.23, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-0.12, -0.14, 0.08, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(0.1, 0.1, 0.035, 0, Math.PI * 2); c.fill();
    });
  });
}
// 스마일 얼굴: 기본 😊, 맞을 때마다 😆😵😤 중 하나
const SMILE_FACES = ['smile', 'laugh', 'dizzy', 'huff'];
function smileTex(kind) {
  return sphereTex((c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffe45c'); g.addColorStop(1, '#ffc21a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    face(c, (c) => {
      c.strokeStyle = '#3a2a10'; c.fillStyle = '#3a2a10'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 0.08;
      const eyeL = -0.3, eyeR = 0.3, ey = -0.18;
      if (kind === 'smile') {
        for (const x of [eyeL, eyeR]) { c.beginPath(); c.ellipse(x, ey, 0.07, 0.12, 0, 0, Math.PI * 2); c.fill(); }
        c.beginPath(); c.arc(0, 0.05, 0.38, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
      } else if (kind === 'laugh') {
        for (const x of [eyeL, eyeR]) { c.beginPath(); c.moveTo(x - 0.11, ey + 0.04); c.lineTo(x, ey - 0.07); c.lineTo(x + 0.11, ey + 0.04); c.stroke(); }
        c.beginPath(); c.moveTo(-0.34, 0.08); c.quadraticCurveTo(0, 0.62, 0.34, 0.08); c.closePath(); c.fill();
        c.fillStyle = '#ff6f7f'; c.beginPath(); c.ellipse(0, 0.3, 0.14, 0.07, 0, 0, Math.PI * 2); c.fill();
      } else if (kind === 'dizzy') {
        for (const x of [eyeL, eyeR]) { c.beginPath(); c.moveTo(x - 0.09, ey - 0.09); c.lineTo(x + 0.09, ey + 0.09); c.moveTo(x + 0.09, ey - 0.09); c.lineTo(x - 0.09, ey + 0.09); c.stroke(); }
        c.beginPath(); c.moveTo(-0.22, 0.24);
        for (let i = 1; i <= 6; i++) c.lineTo(-0.22 + i * 0.075, 0.24 + (i % 2 ? -0.06 : 0.04));
        c.stroke();
      } else {
        c.beginPath(); c.moveTo(eyeL - 0.13, ey - 0.16); c.lineTo(eyeL + 0.09, ey - 0.08); c.moveTo(eyeR + 0.13, ey - 0.16); c.lineTo(eyeR - 0.09, ey - 0.08); c.stroke();
        for (const x of [eyeL, eyeR]) { c.beginPath(); c.ellipse(x, ey + 0.03, 0.06, 0.08, 0, 0, Math.PI * 2); c.fill(); }
        c.beginPath(); c.arc(0, 0.34, 0.16, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.9)'; // 콧김
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.2, 0.12, 0.06, 0.035, s * 0.4, 0, Math.PI * 2); c.fill(); }
      }
      if (kind !== 'huff') { c.fillStyle = 'rgba(255,110,90,0.45)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.48, 0.08, 0.1, 0.06, 0, 0, Math.PI * 2); c.fill(); } }
    });
  });
}
// 오톨도톨 (귤 껍질 등) 범프 그림
function bumpTex(seed, n, rMin, rMax) {
  const t = sphereTex((c, w, h) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rr = rMin + r() * (rMax - rMin);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(128,128,128,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(70,70,70,0.25)'; c.beginPath(); c.arc(x + rr * 0.2, y + rr * 0.2, rr * 0.25, 0, Math.PI * 2); c.fill();
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
// 잎 하나 (꼭지)
function leaf(parent, len, wid, color, rotZ, rotY = 0) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(wid, len * 0.5, 0, len); s.quadraticCurveTo(-wid, len * 0.5, 0, 0);
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 8), lam(color, { side: THREE.DoubleSide }));
  g.add(m); g.rotation.set(0, rotY, rotZ);
  parent.add(g);
  return g;
}

const RARE = {
  eye() {
    const b = base('face');
    const open = eyeTex(false), shut = eyeTex(true);
    const mat = phong('#ffffff', 80, { map: open, specular: '#ffffff', emissive: '#ff9a80', emissiveIntensity: 0.12 });
    mesh(SPH, mat, b.spin);
    let blink = 0;
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.2);
      blink -= dt;
      mat.map = blink > 0 ? shut : open;
    };
    b.root.userData.bounce = () => { blink = 0.22; b.squish(0.8); };
    b.root.userData.hit = () => { blink = 0.25; };
    return b;
  },
  smile() {
    const b = base('face');
    const tex = Object.fromEntries(SMILE_FACES.map((k) => [k, smileTex(k)]));
    const mat = phong('#ffffff', 30, { map: tex.smile, emissive: '#ffb000', emissiveIntensity: 0.15 });
    mesh(SPH, mat, b.spin);
    let hold = 0, cur = 'smile', n = 0;
    const next = () => { cur = SMILE_FACES[1 + (n++ % 3)]; hold = 0.7; };
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.3);
      hold -= dt;
      mat.map = tex[hold > 0 ? cur : 'smile'];
    };
    b.root.userData.bounce = () => { b.squish(1); };
    b.root.userData.hit = next;
    return b;
  },
  tangerine() {
    const b = base();
    const peel = sphereTex((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffa62a'); g.addColorStop(0.5, '#ff8f14'); g.addColorStop(1, '#f07a08');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = rng(5);
      for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,200,90,0.35)' : 'rgba(200,90,0,0.18)'; c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 3, 0, Math.PI * 2); c.fill(); }
    });
    const body = mesh(SPH, phong('#ffffff', 22, { map: peel, bumpMap: bumpTex(5, 1600, 4, 9), bumpScale: 0.04, emissive: '#ff7a10', emissiveIntensity: 0.15 }), b.spin);
    body.scale.set(1, 0.9, 1);
    mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.12, 10), lam('#5a7a2a'), b.spin, 0, 0.92, 0);
    mesh(new THREE.SphereGeometry(0.17, 12, 8), lam('#8a9a3a'), b.spin, 0, 0.88, 0).scale.set(1, 0.3, 1);
    const lf = leaf(b.spin, 0.75, 0.32, '#3d9a3a', -1.15, 0.4);
    lf.position.set(0.05, 0.95, 0);
    b.root.userData.tick = (t, dt, s) => b.move(dt, s, 0.15);
    b.root.userData.bounce = () => b.squish(0.6);
    return b;
  },
  tomato() {
    const b = base();
    const skin = sphereTex((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d8261c'); g.addColorStop(0.3, '#ff3a2a'); g.addColorStop(1, '#e8281c');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,170,80,0.25)'; c.fillRect(0, 0, w, h * 0.12); // 꼭지 쪽 살짝 주황
    });
    const body = mesh(SPH, phong('#ffffff', 70, { map: skin, specular: '#999999', emissive: '#ff2010', emissiveIntensity: 0.12 }), b.spin);
    body.scale.set(1, 0.94, 1);
    // 별 모양 꽃받침 5장 + 꼭지
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); g.rotation.y = i / 5 * Math.PI * 2; b.spin.add(g);
      const s = mesh(new THREE.ConeGeometry(0.12, 0.62, 5), lam('#3c9a2c'), g, 0, 0.94, 0.26);
      s.rotation.x = 1.25; s.scale.set(1, 1, 0.35);
    }
    mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.32, 8), lam('#3c8a2c'), b.spin, 0, 1.05, 0).rotation.z = 0.2;
    b.root.userData.tick = (t, dt, s) => b.move(dt, s, 0.28);
    b.root.userData.bounce = () => b.squish(1);
    return b;
  },
  mochi() {
    const b = base('spin', { squishy: true });
    const tex = sphereTex((c, w, h) => {
      c.fillStyle = '#fbf5ee'; c.fillRect(0, 0, w, h);
      const r = rng(9);
      for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.5})`; c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 2.5, 0, Math.PI * 2); c.fill(); }
      // 팥이 살짝 비침
      for (let i = 0; i < 6; i++) { const g = c.createRadialGradient(r() * w, h * (0.3 + r() * 0.4), 0, 0, 0, 0); void g; }
      c.fillStyle = 'rgba(150,80,90,0.08)';
      c.beginPath(); c.ellipse(W * 0.25, H * 0.52, 180, 110, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(W * 0.75, H * 0.52, 180, 110, 0, 0, Math.PI * 2); c.fill();
    });
    const body = mesh(SPH, lam('#ffffff', { map: tex, emissive: '#ffd8c0', emissiveIntensity: 0.2 }), b.spin);
    body.scale.set(1.06, 0.9, 1.06);
    b.root.userData.tick = (t, dt, s) => b.move(dt, s, 0.55); // 말랑해서 많이 찌그러짐
    b.root.userData.bounce = () => b.squish(1.5);
    b.root.userData.hit = () => b.squish(0.8);
    return b;
  },
  takoyaki() {
    const b = base('upright');
    const tex = sphereTex((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#c9772a'); g.addColorStop(0.6, '#e09a44'); g.addColorStop(1, '#a8601e');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = rng(13);
      for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? 'rgba(120,60,15,0.3)' : 'rgba(255,200,120,0.25)'; c.beginPath(); c.arc(r() * w, h * 0.3 + r() * h * 0.7, 5 + r() * 12, 0, Math.PI * 2); c.fill(); }
      // 소스 (위쪽, 흘러내림)
      c.fillStyle = '#4a220e';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0);
      for (let x = w; x >= 0; x -= 32) c.lineTo(x, h * 0.3 + Math.sin(x * 0.05) * 18 + (r() * 30));
      c.closePath(); c.fill();
      // 마요 지그재그
      c.strokeStyle = '#fff7e0'; c.lineWidth = 9; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      for (let x = 0; x <= w; x += 40) c.lineTo(x, (x / 40) % 2 ? h * 0.08 : h * 0.24);
      c.stroke();
      // 파래 가루
      for (let i = 0; i < 260; i++) { c.fillStyle = '#3f8a2a'; c.fillRect(r() * w, r() * h * 0.28, 3, 3); }
    });
    mesh(SPH, phong('#ffffff', 40, { map: tex, emissive: '#ff9a40', emissiveIntensity: 0.12 }), b.spin);
    // 가쓰오부시: 얇은 조각이 하늘하늘
    const flakes = [];
    const r = rng(21);
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Shape();
      const L = 0.32 + r() * 0.15, Wd = 0.16 + r() * 0.08;
      s.moveTo(0, 0); s.lineTo(Wd, L * 0.3); s.lineTo(Wd * 0.6, L); s.lineTo(-Wd * 0.4, L * 0.8); s.closePath();
      const piv = new THREE.Group();
      const a = r() * Math.PI * 2, d = r() * 0.55;
      piv.position.set(Math.cos(a) * d, Math.sqrt(1 - d * d) * 0.98, Math.sin(a) * d);
      piv.rotation.y = r() * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ShapeGeometry(s), lam(r() < 0.5 ? '#e9c9a0' : '#d9a88a', { side: THREE.DoubleSide }));
      piv.add(f); b.spin.add(piv);
      flakes.push({ piv, ph: r() * 6, sp: 4 + r() * 3 });
    }
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.35);
      for (const f of flakes) f.piv.rotation.x = -0.6 + Math.sin(t * f.sp + f.ph) * 0.45 + Math.min(1, s.vel.length() * 0.06);
    };
    b.root.userData.bounce = () => b.squish(1.1);
    return b;
  },
  egg() {
    // 계란: 달걀 모양(아래가 통통, 위가 뾰족) + 연한 갈색 껍데기 점박이. 데굴데굴 굴러가며 살짝 뒤뚱
    const b = base();
    const shell = sphereTex((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#f6e2c6'); g.addColorStop(0.5, '#f2d8b6'); g.addColorStop(1, '#e8c9a2');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const r = rng(23);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${150 + r() * 40 | 0},${95 + r() * 30 | 0},${60 + r() * 20 | 0},${0.12 + r() * 0.22})`; c.beginPath(); c.ellipse(r() * w, r() * h, 1.5 + r() * 4, 1.5 + r() * 3, r() * 3, 0, Math.PI * 2); c.fill(); }
    });
    mesh(EGG, phong('#ffffff', 45, { map: shell, specular: '#6a6a6a', emissive: '#ffcf9a', emissiveIntensity: 0.16 }), b.spin);
    b.root.userData.tick = (t, dt, s) => b.move(dt, s, 0.06); // 껍데기라 단단함
    b.root.userData.bounce = () => b.squish(0.3);
    b.root.userData.fx = { hatch: 'chick' }; // 스매시로 득점하면 깨지고 병아리가 나옴
    return b;
  },
  eight() {
    const b = base();
    const tex = sphereTex((c, w, h) => {
      c.fillStyle = '#16161c'; c.fillRect(0, 0, w, h);
      face(c, (c) => {
        c.fillStyle = '#fbfbf5'; c.beginPath(); c.arc(0, 0, 0.42, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#16161c'; c.font = 'bold 0.62px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('8', 0, 0.04);
      });
    });
    mesh(SPH, phong('#ffffff', 120, { map: tex, specular: '#bbbbbb', emissive: '#ffffff', emissiveIntensity: 0.07 }), b.spin);
    b.root.userData.tick = (t, dt, s) => b.move(dt, s, 0.08); // 단단해서 거의 안 찌그러짐
    b.root.userData.bounce = () => b.squish(0.4);
    return b;
  },
};

/* ───────────── 전설 ───────────── */
// 울퉁불퉁한 소행성 (참고 그림: 길쭉한 땅콩 모양, 밝은 회색 윗면 + 보랏빛 그늘, 크고 작은 구덩이가 빽빽)
// 정해진 난수라 늘 같은 모양. 반지름 1 기준으로 길이 약 ±1.35
function asteroidGeo(seed) {
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g); // 면마다 따로인 점을 이어야 매끈하게 음영이 진다
  const r = rng(seed);
  // 구덩이: 큰 것 몇 개 + 작은 것 많이. 가운데는 오목, 가장자리는 살짝 솟은 테
  const craters = [];
  for (let i = 0; i < 120; i++) {
    const big = i < 10;
    craters.push({ d: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), w: big ? 0.26 + r() * 0.2 : 0.05 + r() * 0.11, k: big ? 0.13 + r() * 0.07 : 0.04 + r() * 0.05 });
  }
  const lumps = Array.from({ length: 8 }, () => ({ d: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), w: 0.6 + r() * 0.5, k: (r() - 0.4) * 0.18 }));
  const p = g.attributes.position, v = new THREE.Vector3(), n = new THREE.Vector3();
  const col = new Float32Array(p.count * 3);
  const deep = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i).normalize();
    // 땅콩 모양: x로 길게, 가운데 허리를 살짝 잘록하게
    const x = n.x * 1.38, waist = 1 - 0.13 * Math.exp(-(n.x * n.x) / 0.08) * (1 - Math.abs(n.y) * 0.3);
    v.set(x, n.y * 0.86 * waist, n.z * 0.9 * waist);
    let d = 1, pit = 0, rim = 0;
    for (const l of lumps) { const a = 1 - n.dot(l.d); if (a < l.w) { const k = 1 - a / l.w; d += l.k * k * k; } }
    for (const c of craters) {
      const a = Math.acos(Math.min(1, n.dot(c.d))) / c.w; // 0 = 가운데, 1 = 테
      if (a < 1.4) {
        if (a < 1) { const q = 1 - Math.pow(a, 3); d -= c.k * q; pit = Math.max(pit, Math.min(1, q * 1.4)); } // 바닥은 평평, 벽은 가파르게
        else { const e = Math.sin((a - 1) / 0.4 * Math.PI); d += c.k * 0.5 * e; rim = Math.max(rim, e); } // 솟은 테
      }
    }
    d += (r() - 0.5) * 0.012; // 자잘한 거칠기
    v.multiplyScalar(d);
    p.setXYZ(i, v.x, v.y, v.z);
    deep[i] = pit;
    // 색: 밝은 회색 바탕, 구덩이 안은 어둡고 보랏빛, 아래쪽은 은은한 보라 반사
    const base = 0.86 + (r() - 0.5) * 0.06 + rim * 0.12;
    const dk = 1 - pit * 0.78;
    const purple = Math.max(0, -n.y) * 0.35 + pit * 0.45;
    col[i * 3] = base * dk * (1 + purple * 0.15);
    col[i * 3 + 1] = base * dk * (1 - purple * 0.25);
    col[i * 3 + 2] = base * dk * (1 + purple * 0.35);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const LEGEND = {
  asteroid() {
    const b = base();
    const m = phong('#ffffff', 18, { vertexColors: true, specular: '#4a4a55', emissive: '#2a2438', emissiveIntensity: 0.35 });
    const rock = mesh(asteroidGeo(17), m, b.spin);
    rock.rotation.set(0.3, 0.5, 0.2);
    const glow = aura(b.root, '#c8c0ff', { r: 0.05, glow: 0, n: 3 }); // 후광 없이 반짝이만
    b.root.userData.tick = (t, dt, s) => { b.move(dt, s, 0.03); glow(t); };
    b.root.userData.bounce = () => b.squish(0.15);
    b.root.userData.fx = {
      bounce(emit, s) { // 운석 충돌: 충격파 + 먼지 + 돌 조각이 탁구대 위에 떨어졌다 사라짐
        const fl = s.floor + 0.004;
        emit({ tex: 'ring', n: 1, color: '#e8e0ff', size: 0.04, grow: s.smash ? 6 : 4, life: 0.35, speed: 0, up: 0, add: true, alpha: 0.8 });
        emit({ tex: 'puff', n: s.smash ? 5 : 3, color: ['#c8c0d0', '#a8a0b8'], size: 0.045, grow: 2.6, life: 0.8, speed: 0.35, up: 0.2, g: -0.1, drag: 3, alpha: 0.5 });
        emit({ tex: 'rock', n: s.smash ? 9 : 5, color: ['#b8b4c4', '#8a8498', '#d0ccd8'], size: 0.014, life: 1.4, speed: 0.7, up: 1.1, g: 7, spin: 6, floor: fl, rot: Math.random() * 6 });
        emit({ tex: 'dot', n: s.smash ? 8 : 4, color: ['#ffd8a0', '#ffb070'], size: 0.006, life: 0.35, speed: 1.2, up: 0.8, g: 6, add: true });
      },
      mark: 'crater', // 탁구대에 잠깐 남는 충돌 자국
      trail: { tex: ['glow', 'glow', 'puff'], color: ['#ffb84a', '#ff7a2a', '#ffe08a'], size: 0.04, life: 0.4, rate: 90 },
    };
    return b;
  },
  dragon() {
    const b = base('upright');
    // 비늘 무늬
    const scales = sphereTex((c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#2c6e5a'); g.addColorStop(0.5, '#1e5a4a'); g.addColorStop(1, '#13392f');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let row = 0; row < 22; row++) {
        const y = row * h / 20, off = (row % 2) * 16;
        for (let x = -32; x < w + 32; x += 32) {
          const gg = c.createRadialGradient(x + off, y - 6, 2, x + off, y, 18);
          gg.addColorStop(0, 'rgba(140,230,190,0.55)'); gg.addColorStop(1, 'rgba(20,60,50,0)');
          c.fillStyle = gg; c.beginPath(); c.arc(x + off, y, 17, 0, Math.PI); c.fill();
          c.strokeStyle = 'rgba(8,30,24,0.6)'; c.lineWidth = 2; c.beginPath(); c.arc(x + off, y, 16, 0.1, Math.PI - 0.1); c.stroke();
        }
      }
    });
    // 금 (불빛): 단계마다 더 길게
    const r = rng(31);
    const cracks = [];
    for (let i = 0; i < 9; i++) {
      let x = r() * W, y = H * (0.3 + r() * 0.4);
      const pts = [[x, y]];
      for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 60; pts.push([x, y]); }
      cracks.push(pts);
    }
    const crackTex = [1, 2, 3].map((lv) => sphereTex((c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [i, pts] of cracks.entries()) {
        if (i >= 3 + 2 * lv) continue;
        const len = Math.min(pts.length, 4 + lv * 2);
        for (const [lw, col] of [[20, 'rgba(255,90,0,0.35)'], [9, '#ff8a1a'], [3.5, '#ffe28a']]) {
          c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
          for (let k = 0; k < len; k++) c.lineTo(pts[k][0], pts[k][1]);
          c.stroke();
        }
      }
    }));
    const mat = phong('#ffffff', 50, { map: scales, specular: '#4a8a78', emissive: '#ffffff', emissiveMap: crackTex[0], emissiveIntensity: 1 });
    const egg = mesh(SPH, mat, b.spin);
    egg.scale.set(0.95, 1.08, 0.95);
    // 작은 날개 (스매시 때만 펼침)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.quadraticCurveTo(0.5, 0.55, 1.15, 0.55); wingShape.lineTo(0.95, 0.3); wingShape.lineTo(1.05, 0.12); wingShape.lineTo(0.8, 0.0); wingShape.lineTo(0.85, -0.18); wingShape.quadraticCurveTo(0.4, -0.1, 0, 0);
    const wings = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.7, 0.2, -0.3); b.squash.add(p);
      const w = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 10), phong('#3a8a6e', 40, { side: THREE.DoubleSide, emissive: '#ff6a1a', emissiveIntensity: 0.25 }));
      w.scale.set(sx, 1, 1); p.add(w); p.scale.setScalar(0);
      return { p, sx };
    });
    const glow = aura(b.root, '#ff7a2a', { r: 0.05, glow: 0.28 });
    let lv = 0, lvT = 0, flare = 0, wingK = 0;
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.1);
      glow(t, 0.8 + flare);
      lvT -= dt;
      if (lvT < 0 && lv > 0) { lv--; lvT = 1.6; }
      mat.emissiveMap = crackTex[lv];
      flare = Math.max(0, flare - dt * 2);
      mat.emissiveIntensity = 1.0 + 0.4 * Math.sin(t * 2.4) + flare; // 숨 쉬듯
      wingK = smooth(wingK, s.smash ? 1 : 0, 1 - Math.exp(-dt * 10));
      for (const w of wings) { w.p.scale.setScalar(wingK); w.p.rotation.y = w.sx * (0.3 + Math.sin(t * 26) * 0.5); }
    };
    b.root.userData.bounce = () => { lv = Math.min(2, lv + 1); lvT = 1.6; flare = 0.9; b.squish(0.4); };
    b.root.userData.fx = {
      bounce(emit, s) {
        emit({ tex: 'dot', n: s.smash ? 10 : 5, color: ['#ffb02e', '#ff7b1c', '#ffe08a'], size: 0.008, life: 0.5, speed: 0.8, up: 1.2, g: 5, add: true });
        emit({ tex: 'glow', n: 1, color: '#ff8a2a', size: 0.06, grow: 1.8, life: 0.3, speed: 0, up: 0, add: true, alpha: 0.6 });
      },
      trail: { tex: ['glow'], color: ['#ff8a2a', '#ffcf5a'], size: 0.035, life: 0.3, rate: 60 },
      hatch: 'dragon', // 스매시로 득점하면 깨지고 아기 용이 날아감
    };
    return b;
  },
  sun() {
    const b = base('upright');
    // 이글이글: 그림을 천천히 흘려서 움직이게
    const surf = sphereTex((c, w, h) => {
      c.fillStyle = '#ffb21a'; c.fillRect(0, 0, w, h);
      const r = rng(41);
      for (let i = 0; i < 700; i++) {
        const x = r() * w, y = r() * h, rr = 8 + r() * 26;
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        const hot = r() < 0.5;
        g.addColorStop(0, hot ? 'rgba(255,250,200,0.8)' : 'rgba(230,80,0,0.55)'); g.addColorStop(1, 'rgba(255,160,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill();
      }
    });
    surf.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: surf, color: '#ffffff' });
    mesh(SPH, mat, b.spin);
    const surf2 = surf.clone(); surf2.needsUpdate = true;
    const over = mesh(SPH, new THREE.MeshBasicMaterial({ map: surf2, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), b.spin);
    over.scale.setScalar(1.015); over.userData.fx = true;
    // 코로나 + 아지랑이
    const corona = spr('glow', '#ffb030', 0.15, b.root);
    const corona2 = spr('glow', '#ff6a10', 0.1, b.root);
    const heat = [0, 1, 2, 3].map((i) => ({ s: spr('glow', '#ffd080', 0.035, b.root), ph: i / 4 }));
    let flare = 0;
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.12);
      surf.offset.x = (t * 0.03) % 1; surf2.offset.x = (-t * 0.05) % 1; surf2.offset.y = Math.sin(t * 0.7) * 0.02;
      flare = Math.max(0, flare - dt * 2.2);
      const k = 1 + flare * 1.5 + (s.smash ? 0.5 : 0);
      corona.visible = corona2.visible = true;
      corona.material.opacity = 0.55 * (0.85 + 0.15 * Math.sin(t * 5.1)); corona.scale.setScalar(0.15 * k * (1 + 0.05 * Math.sin(t * 7)));
      corona2.material.opacity = 0.5; corona2.scale.setScalar(0.1 * k);
      for (const hh of heat) { // 위로 올라가며 사라지는 열기
        const u = (t * 0.9 + hh.ph) % 1;
        hh.s.visible = true;
        hh.s.position.set(Math.sin((hh.ph + Math.floor(t * 0.9 + hh.ph)) * 12.9) * 0.02, 0.02 + u * 0.06, 0);
        hh.s.material.opacity = Math.sin(Math.PI * u) * 0.3;
        hh.s.scale.setScalar(0.03 + u * 0.03);
      }
    };
    b.root.userData.bounce = () => { flare = 1; b.squish(0.3); };
    b.root.userData.fx = {
      bounce(emit, s) {
        emit({ tex: 'dot', n: s.smash ? 14 : 7, color: ['#fff3b0', '#ffd43b', '#ff9a1a'], size: 0.008, life: 0.45, speed: 1.2, up: 1.0, g: 5, add: true });
        emit({ tex: 'glow', n: 2, color: ['#ff7b1c', '#ffb02e'], size: 0.05, grow: 0.4, life: 0.4, speed: 0.2, up: 0.5, g: -1, add: true });
        if (s.smash) { // 플레어 폭발
          emit({ tex: 'ring', n: 1, color: '#ffd06a', size: 0.05, grow: 7, life: 0.45, speed: 0, up: 0, add: true });
          emit({ tex: 'glow', n: 1, color: '#ffb030', size: 0.15, grow: 2.6, life: 0.35, speed: 0, up: 0, add: true, alpha: 0.8 });
          emit({ tex: 'star4', n: 4, color: '#fff0b0', size: 0.05, life: 0.45, speed: 0.6, up: 0.3, add: true, spin: 3 });
        }
      },
      mark: 'scorch', // 탁구대에 불꽃 자국
      trail: { tex: ['glow'], color: ['#ffb030', '#ff6a10', '#fff0a0'], size: 0.035, life: 0.3, rate: 80 },
    };
    return b;
  },
};

const BUILD = { ...COMMON, ...RARE, ...LEGEND };

// 모델 만들기. 모르는 id나 기본('white')은 지금의 흰 공
export function makeBall(id) {
  const f = BUILD[id];
  let b;
  if (f) b = f();
  else { b = base(); mesh(new THREE.SphereGeometry(1, 14, 10), lam('#fffaf0', { emissive: '#ff9a40', emissiveIntensity: 0.25 }), b.spin); }
  const root = b.root;
  root.userData.id = id;
  root.userData.sound = BALL[id]?.sound || null;
  if (!root.userData.tick) root.userData.tick = (t, dt, s) => b.move(dt, s);
  if (!root.userData.bounce) root.userData.bounce = () => b.squish(0.7);
  if (!root.userData.hit) root.userData.hit = () => {};
  root.traverse((o) => { if (o.isMesh && !o.userData.fx) o.castShadow = true; });
  return root;
}

/* ───────────── 스매시로 득점하면 알이 깨짐 (계란 → 털뭉치 병아리, 드래곤 알 → 아기 용) ─────────────
   받는 사람이 놓쳐 공이 몸을 지나가는 순간 공중에서 깨지고, 병아리는 받는 쪽 탁구대 끝 위로 톡 떨어져
   폴짝폴짝 → 받는 사람 쪽으로 돌아서 '삐약' → 사라짐. 아기 용은 날개 치며 탁구대 위를 한 바퀴 날아오르다 사라짐 */
const toonish = (color, emissive = color, k = 0.18) => lam(color, { emissive, emissiveIntensity: k });
// 털뭉치 병아리 (반지름 1 기준, 아래쪽에 깨진 계란 껍데기를 입고 있음)
function makeChick() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const fuzz = sphereTex((c, w, h) => {
    c.fillStyle = '#ffd84a'; c.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 2500; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(255,240,150,0.6)' : 'rgba(230,170,30,0.35)'; c.lineWidth = 2; const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 10, y + 6 + r() * 6); c.stroke(); }
    face(c, (c) => {
      c.fillStyle = 'rgba(255,120,110,0.6)';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.52, 0.14, 0.14, 0.08, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#2b2a33';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.3, -0.12, 0.09, 0.12, 0, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#fff';
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.3 - 0.03, -0.16, 0.035, 0, Math.PI * 2); c.fill(); }
    });
  });
  mesh(SPH, toonish('#ffffff', '#ffc000'), body).material.map = fuzz;
  const shellT = sphereTex((c, w, h) => { // 보송보송 가장자리
    const r = rng(8);
    for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(255,${220 + r() * 30 | 0},${90 + r() * 60 | 0},${0.5 + r() * 0.5})`; c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 3, 0, Math.PI * 2); c.fill(); }
  });
  mesh(SPH, lam('#ffffff', { map: shellT, transparent: true, alphaTest: 0.3, emissive: '#ffc000', emissiveIntensity: 0.18 }), body).scale.setScalar(1.07);
  const beak = mesh(new THREE.ConeGeometry(0.17, 0.32, 8), toonish('#ff9a1a'), body, 0, 0.02, 1.02);
  beak.rotation.x = Math.PI / 2; beak.scale.set(1, 1, 0.7);
  const tuft = new THREE.Group(); tuft.position.set(0, 0.95, 0.05); body.add(tuft);
  for (const [rz, rx, L] of [[0.3, -0.3, 0.45], [-0.35, -0.1, 0.38], [0.05, 0.4, 0.32]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, L, 6), toonish('#ffcf2a'));
    c.geometry.translate(0, L / 2, 0); c.rotation.set(rx, 0, rz); tuft.add(c);
  }
  const wings = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.9, 0.0, 0); body.add(p);
    const w = mesh(new THREE.SphereGeometry(0.32, 12, 8), toonish('#ffcc2a'), p, sx * 0.1, -0.15, 0);
    w.scale.set(0.35, 0.8, 0.6);
    return { p, sx };
  });
  // 아래쪽에 깨진 껍데기 반쪽 (톱니 모양 테)
  const cup = new THREE.SphereGeometry(1.12, 20, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4);
  const cp = cup.attributes.position;
  for (let i = 0; i <= 20; i++) cp.setY(i, cp.getY(i) + (i % 2 ? 0.22 : -0.05)); // 맨 윗줄 점 = 톱니
  cup.computeVertexNormals();
  const eggT = sphereTex((c, w, h) => { c.fillStyle = '#f4dcbc'; c.fillRect(0, 0, w, h); const r = rng(23); for (let i = 0; i < 200; i++) { c.fillStyle = 'rgba(160,100,60,0.25)'; c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 3, 0, Math.PI * 2); c.fill(); } });
  mesh(cup, phong('#ffffff', 40, { map: eggT, side: THREE.DoubleSide, emissive: '#ffcf9a', emissiveIntensity: 0.15 }), root, 0, -0.18, 0);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, wings, tuft };
}
// 아기 용 (반지름 1 기준 몸통, 앞 = +z)
function makeBabyDragon() {
  const root = new THREE.Group();
  const G = '#3fae7a', B = '#ffe0a0';
  const skin = toonish(G, '#2a8a5a', 0.2), belly = toonish(B, '#ffcf6a', 0.15);
  const torso = mesh(SPH, skin, root); torso.scale.set(0.8, 0.85, 1);
  mesh(SPH, belly, root, 0, -0.1, 0.38).scale.set(0.6, 0.62, 0.55);
  const head = new THREE.Group(); head.position.set(0, 0.75, 0.55); root.add(head);
  mesh(SPH, skin, head).scale.setScalar(0.62);
  mesh(SPH, skin, head, 0, -0.1, 0.45).scale.set(0.42, 0.32, 0.4); // 주둥이
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.17, 12, 10), toonish('#ffffff', '#ffffff', 0.3), head, s * 0.26, 0.12, 0.42);
    mesh(new THREE.SphereGeometry(0.1, 10, 8), toonish('#1d1d26', '#000', 0), head, s * 0.27, 0.13, 0.55);
    mesh(new THREE.SphereGeometry(0.035, 6, 5), toonish('#ffffff', '#fff', 0.5), head, s * 0.24, 0.18, 0.63);
    const horn = mesh(new THREE.ConeGeometry(0.09, 0.32, 8), toonish('#fff2c0', '#ffd27a', 0.3), head, s * 0.22, 0.55, -0.1);
    horn.rotation.set(-0.4, 0, -s * 0.3);
    mesh(new THREE.SphereGeometry(0.045, 6, 5), toonish('#1a5a3a', '#000', 0), head, s * 0.12, -0.03, 0.82); // 콧구멍
  }
  // 등 가시
  for (let i = 0; i < 4; i++) { const sp = mesh(new THREE.ConeGeometry(0.1, 0.24, 6), toonish('#ffb14a'), root, 0, 0.75 - i * 0.28, -0.25 - i * 0.18); sp.rotation.x = -0.7 - i * 0.3; }
  // 꼬리
  const tc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, -0.7), new THREE.Vector3(0, -0.5, -1.3), new THREE.Vector3(0.25, -0.35, -1.8), new THREE.Vector3(0.45, -0.1, -2.0)]);
  const tail = new THREE.Group(); root.add(tail);
  mesh(new THREE.TubeGeometry(tc, 16, 0.16, 8), skin, tail);
  const tip = mesh(new THREE.ConeGeometry(0.16, 0.3, 4), toonish('#ffb14a'), tail, 0.5, -0.05, -2.08); tip.rotation.set(-1.4, 0, 0.6);
  // 날개 (막: 주황빛 반투명)
  const ws = new THREE.Shape();
  ws.moveTo(0, 0); ws.quadraticCurveTo(0.6, 0.9, 1.6, 0.9); ws.lineTo(1.35, 0.5); ws.lineTo(1.5, 0.2); ws.lineTo(1.1, 0.05); ws.lineTo(1.2, -0.25); ws.quadraticCurveTo(0.5, -0.15, 0, 0);
  const wings = [-1, 1].map((sx) => {
    const p = new THREE.Group(); p.position.set(sx * 0.45, 0.45, -0.15); root.add(p);
    const w = new THREE.Mesh(new THREE.ShapeGeometry(ws, 12), lam('#7fdcaa', { side: THREE.DoubleSide, emissive: '#ff9a3a', emissiveIntensity: 0.3 }));
    w.scale.set(sx, 1, 1); p.add(w);
    return { p, sx };
  });
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, head, wings, tail };
}

/* ───────────── 튈 때·스매시 효과 (월드 공간) ─────────────
   fx = fx.js의 createFx(scene). 공이 튈 때 bounce(), 매 프레임 frame()을 부른다 */
export function ballFx(scene, fx) {
  // 탁구대에 잠깐 남는 자국: scorch = 불꽃 자국(미니 태양), crater = 충돌 자국(소행성)
  const markTex = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    for (const [k, col] of stops) gr.addColorStop(k, col);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const TEX = {
    scorch: markTex([[0, 'rgba(255,220,120,1)'], [0.25, 'rgba(255,120,20,0.9)'], [0.55, 'rgba(60,20,10,0.6)'], [1, 'rgba(0,0,0,0)']]),
    crater: markTex([[0, 'rgba(30,26,40,0.75)'], [0.45, 'rgba(50,46,60,0.55)'], [0.62, 'rgba(210,205,225,0.5)'], [0.75, 'rgba(120,115,135,0.25)'], [1, 'rgba(0,0,0,0)']]),
  };
  const marks = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.scorch, transparent: true, depthWrite: false, opacity: 0 }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5;
    scene.add(m);
    marks.push({ m, age: 9 });
  }
  let mi = 0, acc = 0;
  const last = new THREE.Vector3();
  // 알에서 나온 아이 (한 번에 하나)
  let kid = null;
  const removeKid = () => {
    if (!kid) return;
    scene.remove(kid.m.root);
    kid.m.root.traverse((o) => { o.geometry?.dispose?.(); for (const mt of [].concat(o.material || [])) { mt.map?.dispose?.(); mt.dispose?.(); } });
    kid = null;
  };
  function kidFrame(dt) {
    if (!kid) return;
    const k = kid, t = (k.t += dt), m = k.m, r = m.root;
    if (k.kind === 'chick') {
      const S = 0.038; // 병아리 몸 반지름(m)
      let x = k.land[0], y = k.top + S * 1.05, z = k.land[2], yaw = k.face, pop = 1;
      if (t < 0.35) { // 깨진 자리 → 탁구대 끝으로 톡
        const u = t / 0.35;
        x = k.from[0] + (k.land[0] - k.from[0]) * u; z = k.from[2] + (k.land[2] - k.from[2]) * u;
        y = k.from[1] + (y - k.from[1]) * u + Math.sin(Math.PI * u) * 0.12;
        pop = 0.5 + 0.5 * ease(u * 2);
      } else if (t < 1.35) { // 가운데 쪽으로 폴짝폴짝 3번
        const u = (t - 0.35) / 1.0, hop = u * 3, h = hop % 1;
        const z0 = k.land[2] - k.dir * 0.07 * Math.floor(hop), z1 = z0 - k.dir * 0.07 * Math.min(1, h * 1.4);
        z = z1; y += Math.sin(Math.PI * Math.min(1, h * 1.4)) * 0.05;
        m.body.scale.set(1 + (h > 0.8 ? 0.15 : 0), h > 0.8 ? 0.82 : 1.05, 1);
        if (Math.floor(hop) !== k.hop) { k.hop = Math.floor(hop); }
      } else { // 받는 사람 쪽으로 돌아서 '삐약!' 손 흔들기 → 퐁 사라짐
        z = k.land[2] - k.dir * 0.21;
        const u = (t - 1.35);
        yaw = k.face + Math.PI * ease(u * 3);
        if (!k.peep2 && u > 0.35) { k.peep2 = true; k.onPeep?.([x, y, z]); fx.hit((emit) => emit({ tex: 'pyo', n: 1, color: '#ffffff', size: 0.06, grow: 1.2, life: 0.8, speed: 0, up: 0.3, drag: 3, rot: 0, pop: true, spread: 0 }), [x, y + 0.07, z], 0, 0); }
        if (u > 1.1) pop = Math.max(0, 1 - (u - 1.1) / 0.25);
        if (u > 1.1 && !k.gone) { k.gone = true; fx.hit((emit) => emit({ tex: 'star4', n: 6, color: ['#fff3a0', '#ffffff'], size: 0.03, life: 0.5, speed: 0.4, up: 0.3, add: true, spin: 3 }), [x, y, z], 0, 0); }
        m.body.scale.set(1, 1, 1);
      }
      if (!k.peep1 && t > 0.36) { k.peep1 = true; k.onPeep?.([x, y, z]); }
      const flap = t < 0.35 || (t > 0.35 && t < 1.35) || (t > 1.7 && t < 2.4);
      for (const w of m.wings) w.p.rotation.z = w.sx * (0.2 + (flap ? (0.5 + 0.5 * Math.sin(t * 38)) * 0.9 : 0.1));
      m.tuft.rotation.x = Math.sin(t * 9) * 0.15;
      r.position.set(x, y, z);
      r.rotation.y = yaw;
      r.scale.setScalar(S * pop);
      if (t > 2.6) removeKid();
    } else { // 아기 용: 튀어나와 날개 치며 위로 크게 한 바퀴 → 반짝 사라짐
      const S = 0.038;
      const u = t;
      const prev = r.position.clone();
      const ang = u * 2.4, rad = 0.35 * ease(u * 1.5);
      const p = new THREE.Vector3(k.from[0] + Math.sin(ang) * rad, k.from[1] + 0.1 * ease(u * 3) + u * 0.22, k.from[2] - k.dir * (0.15 + (1 - Math.cos(ang)) * rad * 0.9));
      r.position.copy(p);
      const v = p.clone().sub(prev);
      if (v.lengthSq() > 1e-8) { const want = Math.atan2(v.x, v.z); r.rotation.y += (((want - r.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 10); }
      r.rotation.z = -Math.sin(ang) * 0.3;
      const pop = Math.min(1, u / 0.18) * (u > 2.0 ? Math.max(0, 1 - (u - 2.0) / 0.3) : 1);
      r.scale.setScalar(S * (0.3 + 0.7 * pop) * (pop > 0 ? 1 : 0));
      for (const w of m.wings) w.p.rotation.y = w.sx * (0.2 + Math.sin(t * 22) * 0.7);
      m.tail.rotation.y = Math.sin(t * 5) * 0.3;
      if (!k.fire && u > 0.55) { // 작게 불 뿜기 + '꺄오!'
        k.fire = true; k.onRoar?.(p.toArray());
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(r.quaternion).multiplyScalar(0.05).add(p);
        fx.hit((emit) => { emit({ tex: 'glow', n: 7, color: ['#ff7b1c', '#ffb02e', '#ffe08a'], size: 0.035, grow: 0.4, life: 0.45, speed: 0.5, up: 0.2, g: -1, add: true }); emit({ tex: 'puff', n: 2, color: '#c8b8a8', size: 0.04, grow: 2, life: 0.7, speed: 0.1, up: 0.3, alpha: 0.4 }); }, f.toArray(), 2, 0);
      }
      if (u > 0.2 && Math.random() < dt * 25) fx.hit((emit) => emit({ tex: 'star4', n: 1, color: ['#ffe08a', '#7fffc0'], size: 0.018, life: 0.4, speed: 0.05, up: 0, add: true }), p.toArray(), 0, 0);
      if (!k.gone && u > 2.0) { k.gone = true; fx.hit((emit) => emit({ tex: 'star4', n: 7, color: ['#ffe08a', '#7fffc0', '#ffffff'], size: 0.035, life: 0.55, speed: 0.5, up: 0.2, add: true, spin: 3 }), p.toArray(), 0, 0); }
      if (u > 2.4) removeKid();
    }
  }
  return {
    // 스매시로 득점: 알이면 깨고 true를 돌려준다 (그러면 부른 쪽이 공을 숨긴다)
    // pos = 깨지는 자리, dir = 공이 날아가던 z 방향(+1/-1), tableY = 탁구대 윗면 높이, endZ = 받는 쪽 탁구대 끝 z, sound = {peep, roar} 소리 함수
    hatch(ball, pos, dir, tableY, endZ, sound = {}) {
      const kind = ball?.userData.fx?.hatch;
      if (!kind) return false;
      removeKid();
      const shard = kind === 'chick' ? ['#f4dcbc', '#ead0aa', '#fff4e0'] : ['#2c6e5a', '#1e5a4a', '#ffb02e'];
      fx.hit((emit) => {
        emit({ tex: 'rock', n: 9, color: shard, size: 0.016, life: 0.9, speed: 1.0, up: 1.2, g: 7, spin: 9, floor: tableY + 0.004 });
        emit({ tex: 'ring', n: 1, color: kind === 'chick' ? '#fff3c0' : '#ffb84a', size: 0.04, grow: 5, life: 0.35, speed: 0, up: 0, add: true });
        if (kind === 'dragon') emit({ tex: 'glow', n: 8, color: ['#ff7b1c', '#ffb02e', '#ffe08a'], size: 0.05, grow: 0.5, life: 0.5, speed: 0.8, up: 0.5, g: -1, add: true });
        else emit({ tex: 'star4', n: 4, color: '#fff3a0', size: 0.03, life: 0.45, speed: 0.6, up: 0.3, add: true, spin: 3 });
      }, pos, 2, 0);
      const m = kind === 'chick' ? makeChick() : makeBabyDragon();
      scene.add(m.root);
      const lx = Math.max(-0.6, Math.min(0.6, pos[0]));
      kid = { kind, m, t: 0, dir, from: [...pos], land: [lx, tableY, endZ - dir * 0.12], top: tableY, face: dir > 0 ? Math.PI : 0, hop: -1, onPeep: sound.peep, onRoar: sound.roar };
      m.root.position.set(...pos);
      m.root.rotation.y = kind === 'chick' ? kid.face : (dir > 0 ? Math.PI : 0);
      m.root.scale.setScalar(0.001);
      sound.crack?.(pos, kind);
      return true;
    },
    // 지금 나와 있는 아이의 자리 (없으면 null)
    kidPos() { return kid ? kid.m.root.position : null; },
    kidKind() { return kid?.kind || null; },
    clearKid: removeKid,
    bounce(ball, pos, smash, floorY) {
      const f = ball?.userData.fx;
      ball?.userData.bounce?.({ pos, smash });
      if (!f) return;
      if (f.bounce) fx.hit((emit) => f.bounce(emit, { smash, floor: floorY, pos }), [pos[0], pos[1] - BALL_R * 0.6, pos[2]], smash ? 2 : 1, 0);
      if (f.mark) {
        const mk = marks[mi++ % marks.length];
        mk.age = 0; mk.size = (smash ? 0.11 : 0.075) * (f.mark === 'crater' ? 0.8 : 1); mk.kind = f.mark;
        mk.m.material.map = TEX[f.mark];
        mk.m.position.set(pos[0], floorY + 0.0015, pos[2]);
        mk.m.visible = true;
      }
    },
    // 매 프레임: 스매시 꼬리 + 자국 사라지기
    frame(ball, pos, smash, dt) {
      kidFrame(dt);
      for (const mk of marks) {
        if (!mk.m.visible) continue;
        mk.age += dt;
        const k = mk.age / (mk.kind === 'crater' ? 2.2 : 1.6);
        if (k >= 1) { mk.m.visible = false; continue; }
        mk.m.material.opacity = (1 - k) * (1 - k) * 0.9;
        mk.m.scale.setScalar(mk.size * (0.7 + 0.3 * ease(mk.age * 6)));
        if (mk.kind === 'scorch') mk.m.material.color.setRGB(1, 1 - k * 0.5, 1 - k * 0.7);
        else mk.m.material.color.setRGB(1, 1, 1);
      }
      const tr = ball?.userData.fx?.trail;
      if (!tr || !smash || !pos) { acc = 0; last.set(pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0); return; }
      acc += dt * tr.rate;
      const n = Math.floor(acc);
      acc -= n;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        const p = [last.x + (pos[0] - last.x) * k, last.y + (pos[1] - last.y) * k, last.z + (pos[2] - last.z) * k];
        fx.hit((emit) => emit({ tex: tr.tex, n: 1, color: tr.color, size: tr.size, grow: 0.3, life: tr.life, speed: 0.05, up: 0, add: true, spread: 0.006 }), p, 0, 0);
      }
      last.set(pos[0], pos[1], pos[2]);
    },
  };
}
