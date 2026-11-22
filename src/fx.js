import * as THREE from 'three';

// 전설 탁구채 효과: 칠 때 튀어나오는 작은 그림(파티클)과 탁구채 주변 반짝임에 쓰는 그림들.
// 보기만 다르다(판정·공 궤적과 상관없음). 그래서 여기서는 Math.random을 써도 된다.

/* ───────────── 작은 그림(텍스처) ───────────── */
const S = 128;
const DRAW = {
  glow(c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  },
  // 네 갈래 반짝임
  star4(c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 34);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 7 : 62;
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    c.fill();
  },
  // 만화 별
  star5(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 26 : 56;
      c.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = '#b9b9b9'; c.lineWidth = 9; c.stroke();
    c.fillStyle = '#fff'; c.fill();
  },
  note1(c) {
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round';
    c.save(); c.translate(48, 96); c.rotate(-0.4); c.beginPath(); c.ellipse(0, 0, 22, 15, 0, 0, Math.PI * 2); c.fill(); c.restore();
    c.lineWidth = 8; c.beginPath(); c.moveTo(66, 92); c.lineTo(66, 18); c.stroke();
    c.lineWidth = 10; c.beginPath(); c.moveTo(66, 20); c.quadraticCurveTo(100, 30, 96, 64); c.stroke();
  },
  note2(c) {
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round';
    for (const [x, y] of [[30, 100], [86, 90]]) { c.save(); c.translate(x, y); c.rotate(-0.4); c.beginPath(); c.ellipse(0, 0, 19, 13, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    c.lineWidth = 8;
    c.beginPath(); c.moveTo(46, 98); c.lineTo(46, 30); c.moveTo(102, 88); c.lineTo(102, 20); c.stroke();
    c.lineWidth = 16; c.beginPath(); c.moveTo(46, 34); c.lineTo(102, 24); c.stroke();
  },
  dot(c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 60);
    g.addColorStop(0, '#fff'); g.addColorStop(0.75, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  },
  drop(c) {
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(64, 8); c.bezierCurveTo(70, 40, 106, 62, 106, 86); c.arc(64, 86, 42, 0, Math.PI); c.bezierCurveTo(22, 62, 58, 40, 64, 8); c.fill();
    c.fillStyle = 'rgba(190,190,190,0.9)'; c.beginPath(); c.ellipse(80, 92, 10, 16, 0.5, 0, Math.PI * 2); c.fill();
  },
  bubble(c) {
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 6; c.stroke();
    c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.arc(64, 64, 36, -2.4, -1.5); c.stroke();
  },
  ring(c) {
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2); c.stroke();
  },
  cursor(c) {
    c.beginPath();
    c.moveTo(34, 12); c.lineTo(34, 104); c.lineTo(56, 84); c.lineTo(72, 118); c.lineTo(88, 110); c.lineTo(72, 78); c.lineTo(102, 76); c.closePath();
    c.lineJoin = 'round';
    c.strokeStyle = '#2b2a33'; c.lineWidth = 10; c.stroke();
    c.fillStyle = '#fff'; c.fill();
  },
  heart(c) {
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(64, 112); c.bezierCurveTo(4, 70, 14, 16, 46, 16); c.bezierCurveTo(56, 16, 64, 26, 64, 34);
    c.bezierCurveTo(64, 26, 72, 16, 82, 16); c.bezierCurveTo(114, 16, 124, 70, 64, 112); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.0)';
  },
  // 말풍선 속 하트 ('좋아요')
  like(c) {
    c.fillStyle = '#ff5f8f';
    c.beginPath(); c.roundRect(8, 12, 112, 84, 30); c.fill();
    c.beginPath(); c.moveTo(40, 92); c.lineTo(34, 120); c.lineTo(64, 94); c.fill();
    c.fillStyle = '#fff';
    c.save(); c.translate(64, 54); c.scale(0.42, 0.42); c.translate(-64, -64);
    c.beginPath(); c.moveTo(64, 112); c.bezierCurveTo(4, 70, 14, 16, 46, 16); c.bezierCurveTo(56, 16, 64, 26, 64, 34);
    c.bezierCurveTo(64, 26, 72, 16, 82, 16); c.bezierCurveTo(114, 16, 124, 70, 64, 112); c.fill();
    c.restore();
  },
  puff(c) {
    for (const [x, y, r] of [[52, 70, 38], [80, 60, 34], [64, 46, 30]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
  },
  // 키캡
  key(c) {
    c.fillStyle = '#c9c9c9'; c.beginPath(); c.roundRect(10, 10, 108, 108, 22); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(22, 16, 84, 84, 16); c.fill();
  },
  kk(c) { text(c, 'ㅋ', 100, '#ffffff', '#3a3d48', 12); },
  ppyong(c) { text(c, '뿅!', 84, '#ffd23d', '#c2283a', 14); },
  // 탁구공 효과 (balls.js)
  nyang(c) { text(c, '냥', 92, '#ffffff', '#ff6fa3', 14); },
  pyo(c) { text(c, '삐약', 60, '#fff3a0', '#e39a1c', 11); },
  // 탁구대 효과 (tables-rare.js)
  sticky(c) { // 포스트잇 (끝이 살짝 접힘)
    c.fillStyle = '#fff'; c.fillRect(18, 18, 92, 92);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(18, 18, 92, 16);
    c.fillStyle = 'rgba(150,150,150,0.9)'; c.beginPath(); c.moveTo(110, 82); c.lineTo(82, 110); c.lineTo(110, 110); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 4;
    for (const y of [54, 70, 86]) { c.beginPath(); c.moveTo(30, y); c.lineTo(y === 86 ? 70 : 96, y); c.stroke(); }
  },
  crumb(c) { // 빵가루·종이 부스러기
    c.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, r = 30 + ((i * 29) % 19); c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(72, 74, 14, 0, Math.PI * 2); c.fill();
  },
  zz(c) { text(c, 'Z', 96, '#ffffff', '#5a6aa8', 12); },
  tada(c) { text(c, '짜잔!', 50, '#fff3a0', '#7a3cff', 11); },
  excl(c) { text(c, '!', 110, '#ffe14d', '#d23a2a', 14); },
  pix(c) { c.fillStyle = '#fff'; c.fillRect(24, 24, 80, 80); }, // 네모 조각 (색종이·픽셀)
  rock(c) { // 울퉁불퉁 돌 조각
    c.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = 34 + ((i * 37) % 17);
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.85);
    }
    c.closePath();
    const g = c.createRadialGradient(54, 52, 4, 64, 64, 52);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9a9a9a');
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(80,80,80,0.5)';
    c.beginPath(); c.arc(76, 72, 9, 0, Math.PI * 2); c.arc(50, 76, 5, 0, Math.PI * 2); c.fill();
  },
};
function text(c, s, px, fill, stroke, lw) {
  c.font = `bold ${px}px Jua, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.strokeStyle = stroke; c.lineWidth = lw; c.strokeText(s, 64, 70);
  c.fillStyle = fill; c.fillText(s, 64, 70);
}
const cache = {};
export function fxTex(name) {
  if (cache[name]) return cache[name];
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  DRAW[name](cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return (cache[name] = t);
}

/* ───────────── 칠 때 효과 ─────────────
   emit(o): tex 그림, n 개수, color(여러 개면 하나씩 골라 씀), size 크기(m), grow 끝날 때 크기 배수,
   life 수명(초), speed 퍼지는 빠르기, up 위로 뜨는 빠르기, g 중력, drag 공기 저항, spin 회전,
   add 빛처럼 더하기, wait 늦게 시작, spread 처음 흩어진 정도 */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a);
const RAINBOW = ['#ff6b81', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#f783ac'];
const PASTEL = ['#ffb3ba', '#ffd8a8', '#fff1a8', '#c8f2b0', '#b0e6f2', '#b8c4ff', '#dcc0ff'];
// lv: 0 = BAD·BLOCK, 1 = GOOD, 2 = PERFECT
const HITS = {
  pan(emit, lv) { // 기름이 탁! + 김 + (퍼펙트) 불꽃
    emit({ tex: 'dot', n: [5, 8, 12][lv], color: ['#fff3b0', '#ffd43b', '#ffffff'], size: 0.013, life: 0.5, speed: 1.5, up: 1.3, g: 6, add: true });
    emit({ tex: 'puff', n: [1, 2, 3][lv], color: '#ffffff', size: 0.07, grow: 2.2, life: 0.8, speed: 0.15, up: 0.45, g: -0.2, alpha: 0.4 });
    if (lv === 2) {
      emit({ tex: 'glow', n: 6, color: ['#ff7b1c', '#ffb02e', '#ff4d1c'], size: 0.09, grow: 0.3, life: 0.4, speed: 0.4, up: 1.1, g: -1.5, add: true });
      emit({ tex: 'star4', n: 3, color: '#ffe9a8', size: 0.07, life: 0.45, speed: 0.6, up: 0.4, add: true, spin: 3 });
    }
  },
  guitar(emit, lv) { // 음표가 둥실
    emit({ tex: ['note1', 'note2'], n: [2, 4, 7][lv], color: RAINBOW, size: 0.06, grow: 1.25, life: 1.0, speed: 0.55, up: 0.75, g: -0.5, drag: 2.2, wob: 0.25, spin: 0.6 });
    if (lv === 2) emit({ tex: 'ring', n: 1, color: '#ffd77a', size: 0.08, grow: 6, life: 0.5, speed: 0, up: 0, add: true });
  },
  keyboard(emit, lv) { // 키캡이 톡톡 + (퍼펙트) ㅋㅋㅋ
    emit({ tex: 'key', n: [3, 5, 9][lv], color: PASTEL, size: 0.034, life: 0.7, speed: 1.1, up: 1.6, g: 6.5, spin: 9 });
    if (lv === 2) for (let i = 0; i < 3; i++) emit({ tex: 'kk', n: 1, color: '#ffffff', size: 0.06, grow: 1.3, life: 0.75, speed: 0.25, up: 0.75, drag: 2.5, wait: i * 0.09, rot: rnd(-0.2, 0.2) });
  },
  mouse(emit, lv) { // 클릭 물결 + 화살표 (퍼펙트는 더블클릭)
    emit({ tex: 'ring', n: 1, color: '#a99bff', size: 0.06, grow: 5.5, life: 0.4, speed: 0, up: 0, add: true });
    if (lv === 2) emit({ tex: 'ring', n: 1, color: '#7fe0ff', size: 0.06, grow: 6.5, life: 0.42, speed: 0, up: 0, add: true, wait: 0.11 });
    emit({ tex: 'cursor', n: [1, 2, 5][lv], color: '#ffffff', size: 0.05, life: 0.65, speed: 1.3, up: 0.7, drag: 3.5, rot: 0 });
  },
  phone(emit, lv) { // 하트·좋아요가 뿅뿅
    emit({ tex: 'heart', n: [2, 4, 6][lv], color: ['#ff5f8f', '#ff8fb3', '#ff3d6e'], size: 0.045, grow: 1.4, life: 0.95, speed: 0.5, up: 0.85, g: -0.4, drag: 2.2, wob: 0.2, rot: 0 });
    if (lv >= 1) emit({ tex: 'like', n: lv, color: '#ffffff', size: 0.07, grow: 1.2, life: 0.9, speed: 0.3, up: 0.7, drag: 2.4, rot: 0, wait: 0.05 });
    if (lv === 2) emit({ tex: 'glow', n: 1, color: '#cdbdff', size: 0.25, grow: 2.4, life: 0.3, speed: 0, up: 0, add: true, alpha: 0.7 });
  },
  duck(emit, lv) { // 물이 첨벙 + 비눗방울
    emit({ tex: 'drop', n: [5, 8, 13][lv], color: ['#8fdcff', '#c9f0ff', '#5cc4f5'], size: 0.026, life: 0.6, speed: 1.2, up: 1.8, g: 7, rot: 0 });
    emit({ tex: 'bubble', n: [2, 3, 6][lv], color: ['#ffffff', '#d5f3ff'], size: 0.035, grow: 1.5, life: 1.2, speed: 0.4, up: 0.5, g: -0.35, drag: 2, wob: 0.3, rot: 0 });
  },
  hammer(emit, lv) { // 별이 팡 + '뿅!'
    emit({ tex: 'star5', n: [3, 5, 8][lv], color: ['#ffd23d', '#ffe680', '#ff8fa3'], size: 0.055, grow: 0.7, life: 0.65, speed: 1.4, up: 0.9, g: 2.5, drag: 2.2, spin: 7 });
    if (lv >= 1) emit({ tex: 'ppyong', n: 1, color: '#ffffff', size: lv === 2 ? 0.115 : 0.085, grow: 1.25, life: 0.6, speed: 0, up: 0.5, drag: 3, rot: rnd(-0.25, 0.25), pop: true });
    if (lv === 2) emit({ tex: 'ring', n: 1, color: '#ffe680', size: 0.08, grow: 5.5, life: 0.38, speed: 0, up: 0, add: true });
  },
};
const LEVEL = { perfect: 2, good: 1 };

export function createFx(scene, max = 120) {
  const pool = [];
  let next = 0;
  let alive = 0;
  function get() {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[(next + i) % pool.length];
      if (!p.on) { next = (next + i + 1) % pool.length; return p; }
    }
    if (pool.length < max) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 6;
      scene.add(s);
      const p = { s, on: false };
      pool.push(p);
      return p;
    }
    const p = pool[next];
    next = (next + 1) % pool.length;
    return p;
  }
  return {
    // kind: 탁구채 종류(HITS), pos: 맞은 자리 [x,y,z], grade: 등급, fz: 친 사람이 보는 앞쪽(z 방향 -1/1)
    // kind 자리에 함수(emit, lv)를 직접 줘도 된다 (탁구공 효과, balls.js). grade 자리에 숫자 lv(0~2)도 된다
    hit(kind, pos, grade, fz = -1) {
      const fn = typeof kind === 'function' ? kind : HITS[kind];
      if (!fn || !pos) return;
      const emit = (o) => {
        for (let i = 0; i < (o.n || 1); i++) {
          const p = get();
          const sp = (o.speed || 0) * rnd(0.45, 1), a = rnd(0, Math.PI * 2);
          const sd = o.spread ?? 0.03;
          p.on = true;
          p.age = -(o.wait || 0);
          p.life = (o.life || 0.6) * rnd(0.8, 1.15);
          p.x = pos[0] + rnd(-sd, sd); p.y = pos[1] + rnd(-sd, sd); p.z = pos[2] + rnd(-sd, sd) * 0.5;
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * 0.6 + (o.up || 0) * rnd(0.6, 1.1); p.vz = fz * rnd(0, 0.5) * sp;
          p.g = o.g || 0; p.drag = o.drag || 0;
          p.size = (o.size || 0.04) * rnd(0.8, 1.2); p.grow = o.grow ?? 1;
          p.alpha = o.alpha ?? 1;
          p.wob = o.wob || 0; p.ph = rnd(0, 6);
          p.pop = !!o.pop;
          p.floor = o.floor ?? null; // 이 높이에 닿으면 멈춘다 (탁구대 위에 떨어진 조각)
          const m = p.s.material;
          m.map = fxTex(pick(o.tex));
          m.color.set(pick(o.color));
          m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
          m.rotation = o.rot ?? rnd(-0.6, 0.6);
          p.spin = (o.spin || 0) * rnd(-1, 1);
          m.opacity = 0;
          p.s.visible = false;
        }
      };
      fn(emit, typeof grade === 'number' ? grade : LEVEL[grade] || 0);
      alive = 1;
    },
    update(dt) {
      if (!alive) return;
      alive = 0;
      for (const p of pool) {
        if (!p.on) continue;
        alive++;
        p.age += dt;
        if (p.age < 0) continue;
        if (p.age >= p.life) { p.on = false; p.s.visible = false; continue; }
        const k = p.age / p.life;
        p.vy -= p.g * dt;
        if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; }
        p.x += (p.vx + Math.sin(p.age * 7 + p.ph) * p.wob) * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; p.spin *= 0.3; }
        const m = p.s.material;
        m.rotation += p.spin * dt;
        m.opacity = p.alpha * Math.min(1, p.age / 0.05) * (1 - k * k * k);
        let sc = p.size * (1 + (p.grow - 1) * (1 - (1 - k) * (1 - k)));
        if (p.pop) sc *= 1 + 0.5 * Math.exp(-p.age * 14) * Math.cos(p.age * 30); // 통! 하고 튀어나오기
        p.s.scale.setScalar(sc);
        p.s.position.set(p.x, p.y, p.z);
        p.s.visible = true;
      }
    },
  };
}
