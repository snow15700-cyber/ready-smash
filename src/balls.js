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
  { id: 'chick', name: '털뭉치 병아리', grade: 'rare', sound: 'chick' },
  { id: 'eight', name: '8번 당구공', grade: 'rare', sound: 'billiard' },
  // 전설: 움직이는 효과 + 튈 때·스매시 연출
  { id: 'asteroid', name: '소행성', grade: 'legend', sound: 'rock' },
  { id: 'dragon', name: '드래곤 알', grade: 'legend', sound: 'dragon' },
  { id: 'sun', name: '미니 태양', grade: 'legend', sound: 'sun' },
  { id: 'cat', name: '냥냥 공', grade: 'legend', sound: 'cat' },
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
function base(mode = 'spin') {
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
    st.sqv += (-st.sq * 520 - st.sqv * 22) * dt;
    st.sq += st.sqv * dt;
    const k = Math.max(-0.4, Math.min(0.6, st.sq)) * soft / 0.25;
    squash.scale.set(BALL_R * (1 + k * 0.5), BALL_R * (1 - k), BALL_R * (1 + k * 0.5));
    void sqDir;
  }
  function squish(amt = 1) { st.sqv += 9 * amt; }
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
    const b = base();
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
  chick() {
    const b = base('face');
    const fuzzT = sphereTex((c, w, h) => {
      c.fillStyle = '#ffd84a'; c.fillRect(0, 0, w, h);
      const r = rng(4);
      for (let i = 0; i < 3000; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(255,240,150,0.6)' : 'rgba(230,170,30,0.35)'; c.lineWidth = 2; const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 10, y + 6 + r() * 6); c.stroke(); }
      face(c, (c) => {
        c.fillStyle = 'rgba(255,120,110,0.55)';
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.5, 0.12, 0.13, 0.08, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#2b2a33';
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.28, -0.14, 0.085, 0.11, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#fff';
        for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 0.28 - 0.03, -0.18, 0.03, 0, Math.PI * 2); c.fill(); }
      });
    });
    mesh(SPH, lam('#ffffff', { map: fuzzT, emissive: '#ffc000', emissiveIntensity: 0.18 }), b.spin);
    // 복슬 털 껍질 (가장자리가 보송보송)
    const shellT = sphereTex((c, w, h) => {
      c.clearRect(0, 0, w, h);
      const r = rng(8);
      for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(255,${220 + r() * 30 | 0},${90 + r() * 60 | 0},${0.5 + r() * 0.5})`; c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 3, 0, Math.PI * 2); c.fill(); }
    });
    mesh(SPH, lam('#ffffff', { map: shellT, transparent: true, alphaTest: 0.3, emissive: '#ffc000', emissiveIntensity: 0.18 }), b.spin).scale.setScalar(1.06);
    // 부리
    const beak = mesh(new THREE.ConeGeometry(0.16, 0.3, 8), lam('#ff9a1a'), b.spin, 0, 0.0, 1.02);
    beak.rotation.x = Math.PI / 2; beak.scale.set(1, 1, 0.7);
    // 삐침 털 3가닥
    const tuft = new THREE.Group(); tuft.position.set(0, 0.95, 0.05); b.spin.add(tuft);
    for (const [rz, rx, L] of [[0.3, -0.3, 0.42], [-0.35, -0.1, 0.36], [0.05, 0.4, 0.3]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, L, 6), lam('#ffcf2a'));
      c.geometry.translate(0, L / 2, 0); c.rotation.set(rx, 0, rz); tuft.add(c);
    }
    // 작은 날개
    const wings = [-1, 1].map((sx) => {
      const p = new THREE.Group(); p.position.set(sx * 0.92, -0.1, 0); b.spin.add(p);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), lam('#ffcc2a'));
      w.scale.set(0.35, 0.8, 0.6); w.position.set(sx * 0.08, -0.1, 0); p.add(w);
      return { p, sx };
    });
    let flap = 0;
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.35);
      flap = Math.max(0, flap - dt);
      for (const w of wings) w.p.rotation.z = w.sx * (0.15 + Math.sin(t * (flap > 0 ? 40 : 5)) * (flap > 0 ? 0.6 : 0.12));
      tuft.rotation.x = Math.sin(t * 6) * 0.08;
    };
    b.root.userData.bounce = () => { b.squish(1.1); flap = 0.35; };
    b.root.userData.hit = () => { flap = 0.3; };
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
// 울퉁불퉁한 돌 모양 (정해진 난수라 늘 같은 모양)
function rockGeo(seed, detail = 3, amt = 0.16) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const r = rng(seed);
  const bumps = Array.from({ length: 14 }, () => ({ d: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), k: (r() - 0.35) * amt, w: 0.25 + r() * 0.35 }));
  const p = g.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 1, crater = 0;
    for (const bmp of bumps) {
      const x = 1 - v.dot(bmp.d);
      if (x < bmp.w) { const k = 1 - x / bmp.w; d += bmp.k * k * k; if (bmp.k < 0) crater += k * 0.6; }
    }
    d += (r() - 0.5) * 0.05;
    v.multiplyScalar(d);
    p.setXYZ(i, v.x, v.y, v.z);
    const sh = Math.max(0.45, 0.85 - crater * 0.5 + (r() - 0.5) * 0.1);
    col[i * 3] = sh * 1.0; col[i * 3 + 1] = sh * 0.9; col[i * 3 + 2] = sh * 0.82;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const LEGEND = {
  asteroid() {
    const b = base();
    const m = phong('#b8a898', 8, { vertexColors: true, flatShading: true, emissive: '#3a2a20', emissiveIntensity: 0.25 });
    mesh(rockGeo(17), m, b.spin);
    // 가장자리 빛 테두리 (어두운 배경에서도 보이게)
    const rim = mesh(SPH, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      uniforms: { col: { value: new THREE.Color('#ffb070') }, k: { value: 0.75 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.0); gl_FragColor = vec4(col*f*k, f*k); }',
    }), b.squash);
    rim.scale.setScalar(1.22); rim.userData.fx = true;
    const glow = aura(b.root, '#ffa060', { r: 0.045, glow: 0.22 });
    b.root.userData.tick = (t, dt, s) => { b.move(dt, s, 0.05); glow(t); rim.material.uniforms.k.value = s.smash ? 1.4 : 0.75; };
    b.root.userData.bounce = () => b.squish(0.25);
    b.root.userData.fx = {
      bounce(emit, s) { // 작은 조각이 탁구대 위에 떨어졌다 사라짐 + 먼지
        const fl = s.floor + 0.004;
        emit({ tex: 'rock', n: s.smash ? 7 : 4, color: ['#a89888', '#8a7a6c', '#c0b0a0'], size: 0.014, life: 1.3, speed: 0.6, up: 0.9, g: 7, spin: 6, floor: fl, rot: Math.random() * 6 });
        emit({ tex: 'puff', n: 2, color: '#c8b8a8', size: 0.04, grow: 2.2, life: 0.6, speed: 0.15, up: 0.15, alpha: 0.45 });
      },
      trail: { tex: ['glow', 'glow', 'puff'], color: ['#ffb84a', '#ff7a2a', '#ffe08a'], size: 0.05, life: 0.4, rate: 90 },
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
      scorch: true, // 탁구대에 불꽃 자국
      trail: { tex: ['glow'], color: ['#ffb030', '#ff6a10', '#fff0a0'], size: 0.035, life: 0.3, rate: 80 },
    };
    return b;
  },
  cat() {
    const b = base('face');
    const fur = '#fff6ea', cheese = '#ffb35c';
    const faceTex = (kind) => sphereTex((c, w, h) => {
      c.fillStyle = fur; c.fillRect(0, 0, w, h);
      // 치즈 무늬: 이마 줄 3개 + 뒤통수 얼룩
      c.fillStyle = cheese;
      face(c, (c) => {
        for (const x of [-0.16, 0, 0.16]) { c.beginPath(); c.ellipse(x, -0.78, 0.05, 0.2, 0, 0, Math.PI * 2); c.fill(); }
      });
      c.beginPath(); c.ellipse(W * 0.75, H * 0.35, 200, 120, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(W * 0.6, H * 0.2, 90, 60, 0.3, 0, Math.PI * 2); c.fill();
      face(c, (c) => {
        const ey = -0.08, ex = 0.32;
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (kind === 'open' || kind === 'puff') {
          for (const s of [-1, 1]) {
            c.fillStyle = '#2b2a33'; c.beginPath(); c.ellipse(s * ex, ey, 0.13, 0.16, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#fff'; c.beginPath(); c.arc(s * ex - 0.04, ey - 0.06, 0.05, 0, Math.PI * 2); c.fill();
            c.beginPath(); c.arc(s * ex + 0.05, ey + 0.05, 0.022, 0, Math.PI * 2); c.fill();
          }
        } else if (kind === 'blink') {
          c.strokeStyle = '#2b2a33'; c.lineWidth = 0.05;
          for (const s of [-1, 1]) { c.beginPath(); c.arc(s * ex, ey - 0.03, 0.11, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
        } else { // 'shut' > <
          c.strokeStyle = '#2b2a33'; c.lineWidth = 0.055;
          for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (ex + 0.12), ey - 0.1); c.lineTo(s * (ex - 0.08), ey); c.lineTo(s * (ex + 0.12), ey + 0.1); c.stroke(); }
        }
        // 볼터치 (puff는 크게)
        const big = kind === 'puff' ? 1.6 : 1;
        c.fillStyle = kind === 'puff' ? 'rgba(255,110,150,0.7)' : 'rgba(255,130,160,0.5)';
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.55, 0.2, 0.13 * big, 0.08 * big, 0, 0, Math.PI * 2); c.fill(); }
        // 코·입 (ω)
        c.fillStyle = '#ff8fab'; c.beginPath(); c.moveTo(-0.06, 0.1); c.lineTo(0.06, 0.1); c.lineTo(0, 0.17); c.closePath(); c.fill();
        c.strokeStyle = '#5a3a3a'; c.lineWidth = 0.035;
        c.beginPath(); c.moveTo(0, 0.17); c.quadraticCurveTo(-0.02, 0.27, -0.1, 0.25); c.moveTo(0, 0.17); c.quadraticCurveTo(0.02, 0.27, 0.1, 0.25); c.stroke();
        // 수염
        c.strokeStyle = 'rgba(120,90,80,0.7)'; c.lineWidth = 0.02;
        for (const s of [-1, 1]) for (const dy of [-0.04, 0.04]) { c.beginPath(); c.moveTo(s * 0.2, 0.18 + dy); c.lineTo(s * 0.52, 0.12 + dy * 2.5); c.stroke(); }
      });
    });
    const tex = { open: faceTex('open'), blink: faceTex('blink'), shut: faceTex('shut'), puff: faceTex('puff') };
    const mat = lam('#ffffff', { map: tex.open, emissive: '#ffd6e0', emissiveIntensity: 0.2 });
    const head = mesh(SPH, mat, b.spin);
    // 귀 (바깥 털 + 안쪽 분홍)
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(s * 0.52, 0.72, 0.05); g.rotation.set(-0.1, 0, -s * 0.42); b.spin.add(g);
      const outer = mesh(new THREE.ConeGeometry(0.3, 0.52, 4), lam(s < 0 ? cheese : fur, { emissive: '#ffd6e0', emissiveIntensity: 0.15 }), g, 0, 0.18, 0);
      outer.rotation.y = Math.PI / 4; outer.scale.set(1, 1, 0.55);
      const inner = mesh(new THREE.ConeGeometry(0.18, 0.36, 3), lam('#ffa8c0'), g, 0, 0.14, 0.09);
      inner.rotation.y = Math.PI; inner.scale.set(1, 1, 0.3);
    }
    // 꼬리 (뒤쪽, 살랑)
    const tailPiv = new THREE.Group(); tailPiv.position.set(0, -0.3, -0.92); b.spin.add(tailPiv);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.15, -0.35), new THREE.Vector3(0.1, 0.55, -0.5), new THREE.Vector3(0.28, 0.85, -0.38)]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.1, 8), lam(cheese, { emissive: '#ffd6e0', emissiveIntensity: 0.15 }));
    tailPiv.add(tail);
    mesh(new THREE.SphereGeometry(0.1, 8, 6), lam(fur), tailPiv, 0.28, 0.85, -0.38);
    // 작은 앞발 두 개 (아래)
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.17, 10, 8), lam(fur), b.spin, s * 0.28, -0.9, 0.4).scale.set(1, 0.7, 1.1);
    const glow = aura(b.root, '#ff8fc0', { r: 0.045, glow: 0.3, n: 4 });
    let shut = 0, puff = 0, nextBlink = 1.5;
    b.root.userData.tick = (t, dt, s) => {
      b.move(dt, s, 0.3);
      glow(t);
      shut -= dt; nextBlink -= dt;
      puff = smooth(puff, s.smash ? 1 : 0, 1 - Math.exp(-dt * 10));
      const blinking = nextBlink < 0 && nextBlink > -0.12;
      if (nextBlink < -0.12) nextBlink = 1.8 + Math.random() * 2.2;
      mat.map = shut > 0 ? tex.shut : puff > 0.5 ? tex.puff : blinking ? tex.blink : tex.open;
      head.scale.set(1 + puff * 0.09, 1, 1);
      tailPiv.rotation.z = Math.sin(t * 3.2) * 0.5;
      tailPiv.rotation.x = Math.sin(t * 1.7) * 0.15;
    };
    b.root.userData.bounce = () => { shut = 0.3; b.squish(0.9); };
    b.root.userData.hit = () => { shut = 0.2; };
    b.root.userData.fx = {
      bounce(emit, s) {
        emit({ tex: 'nyang', n: 1, color: '#ffffff', size: s.smash ? 0.07 : 0.055, grow: 1.2, life: 0.7, speed: 0, up: 0.45, drag: 3, rot: (Math.random() - 0.5) * 0.4, pop: true, spread: 0.005 });
        emit({ tex: 'heart', n: s.smash ? 5 : 2, color: ['#ff6fa3', '#ff9cc4', '#ffc0d8'], size: 0.025, grow: 1.3, life: 0.8, speed: 0.35, up: 0.6, g: -0.3, drag: 2, wob: 0.15, rot: 0 });
      },
      trail: { tex: ['star4', 'heart', 'glow'], color: ['#ff8fc0', '#ffc0e0', '#ffffff'], size: 0.03, life: 0.45, rate: 70 },
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

/* ───────────── 튈 때·스매시 효과 (월드 공간) ─────────────
   fx = fx.js의 createFx(scene). 공이 튈 때 bounce(), 매 프레임 frame()을 부른다 */
export function ballFx(scene, fx) {
  // 탁구대 불꽃 자국 (미니 태양): 탁구대에 납작하게 붙는 그림
  const scorchTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,220,120,1)'); gr.addColorStop(0.25, 'rgba(255,120,20,0.9)'); gr.addColorStop(0.55, 'rgba(60,20,10,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const marks = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0 }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5;
    scene.add(m);
    marks.push({ m, age: 9 });
  }
  let mi = 0, acc = 0;
  const last = new THREE.Vector3();
  return {
    bounce(ball, pos, smash, floorY) {
      const f = ball?.userData.fx;
      ball?.userData.bounce?.({ pos, smash });
      if (!f) return;
      if (f.bounce) fx.hit((emit) => f.bounce(emit, { smash, floor: floorY, pos }), [pos[0], pos[1] - BALL_R * 0.6, pos[2]], smash ? 2 : 1, 0);
      if (f.scorch) {
        const mk = marks[mi++ % marks.length];
        mk.age = 0; mk.size = smash ? 0.11 : 0.075;
        mk.m.position.set(pos[0], floorY + 0.0015, pos[2]);
        mk.m.visible = true;
      }
    },
    // 매 프레임: 스매시 꼬리 + 자국 사라지기
    frame(ball, pos, smash, dt) {
      for (const mk of marks) {
        if (!mk.m.visible) continue;
        mk.age += dt;
        const k = mk.age / 1.6;
        if (k >= 1) { mk.m.visible = false; continue; }
        mk.m.material.opacity = (1 - k) * (1 - k) * 0.9;
        mk.m.scale.setScalar(mk.size * (0.7 + 0.3 * ease(mk.age * 6)));
        mk.m.material.color.setRGB(1, 1 - k * 0.5, 1 - k * 0.7);
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
