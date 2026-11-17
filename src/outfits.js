import * as THREE from 'three';

/* ───────────── 몸 꾸미기 (한 벌씩 통째로) ─────────────
   캐릭터 몸통(scene.js makeCharacter) = 캡슐 반지름 0.18, 높이 y 0.01 ~ 0.99, 머리는 y 1.17(반지름 0.16).
   앞 = -z, 탁구채(오른쪽) = +x. 옷을 입으면 원래 흰 몸통은 숨기고, 옷이 몸 전체를 새로 만든다.
   - 일반: 몸통에 색·무늬 칠하기 (paint)
   - 고급: 몸이 다른 모양으로 변신하거나 소품이 붙음 (build)
   - 전설: 고급 + 움직이는 효과 (build가 update 함수를 돌려줌, 매 프레임 char.tickOutfit에서 불림)
   텍스처 좌표: 가로 = 몸 한 바퀴(가운데 FX = 앞, 0/TW = 등, TW*0.25 = 오른쪽 +x), 세로 = 높이 */

const BODY_R = 0.18, BY0 = 0.01, BY1 = 0.99;
const TW = 1024;
const PXM = TW / (2 * Math.PI * BODY_R); // 1m당 픽셀 (가로·세로 같게)
const TH = Math.round((BY1 - BY0) * PXM);
const py = (y) => (BY1 - y) * PXM; // 높이(m) → 캔버스 y
const M = (m) => m * PXM; // 길이(m) → 픽셀
const FX = TW / 2; // 앞 가운데
const RX = TW * 0.25, LX = TW * 0.75; // 오른쪽(+x) · 왼쪽 옆구리
const FONT = (m) => `${Math.round(M(m))}px Jua, sans-serif`;

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, ...o });
function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  if (parent) parent.add(o);
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
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const bodyTex = (draw) => canvasTex(TW, TH, draw);

// 몸통 캡슐 UV를 '둘레 × 높이'로 다시 잡는다 (앞 = u 0.5)
// 텍스처 이음매(u 0/1)는 등 한가운데(+z)에 오므로, 도형의 이음매(겹친 꼭짓점 줄)도 등 한가운데로 돌려 맞춘다.
// (안 맞추면 이음매를 가로지르는 삼각형 한 줄에 그림 전체가 눌려 들어가 등에 세로 줄이 생긴다)
function fixBodyUV(geo, cy, y0 = BY0, y1 = BY1) {
  const p0 = geo.attributes.position, uv0 = geo.attributes.uv;
  for (let i = 0; i < p0.count; i++) {
    if (uv0.getX(i) === 0 && Math.hypot(p0.getX(i), p0.getZ(i)) > 1e-5) {
      geo.rotateY(Math.atan2(p0.getX(i), p0.getZ(i)) * -1);
      break;
    }
  }
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + cy, z = pos.getZ(i);
    const u0 = uv.getX(i);
    let u;
    if (Math.hypot(x, z) < 1e-5) u = u0;
    else {
      u = Math.atan2(x, z) / (2 * Math.PI);
      if (u < 0) u += 1;
      // 이음매 위 꼭짓점: 도형 쪽 u(0 또는 1)를 따른다
      if (u > 0.5 && u0 < 0.25) u -= 1;
      else if (u < 0.5 && u0 > 0.75) u += 1;
      u = Math.min(1, Math.max(0, u));
    }
    uv.setXY(i, u, (y - y0) / (y1 - y0));
  }
  uv.needsUpdate = true;
  return geo;
}
// 칠한 몸통 (원래 몸통과 같은 크기, k만큼 살짝 크게)
function skin(root, draw, matFn = (t) => lam('#ffffff', { map: t }), k = 1.004) {
  const geo = fixBodyUV(new THREE.CapsuleGeometry(BODY_R, 0.62, 10, 32), 0.5);
  const tex = bodyTex(draw);
  const m = mesh(geo, matFn(tex), 0, 0.5, 0, root);
  m.scale.set(k, 1, k);
  return m;
}

/* ── 그리기 도우미 ── */
const band = (g, y0, y1, color) => { g.fillStyle = color; g.fillRect(0, py(y1), TW, py(y0) - py(y1)); };
const atBack = (fn) => { fn(0); fn(TW); };
const atSides = (fn) => { fn(RX); fn(LX); };
// 가로로 이어지게 (이음매 근처는 반대편에도 한 번 더)
function wrap(x, fn, pad = 80) { fn(x); if (x < pad) fn(x + TW); else if (x > TW - pad) fn(x - TW); }
function scatter(g, y0, y1, n, seed, draw) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * TW, y = py(y0 + r() * (y1 - y0));
    const rr = rng(i * 977 + seed);
    wrap(x, (xx) => draw(xx, y, rng(i * 977 + seed)), 90);
    rr();
  }
}
// 줄 맞춘 무늬 (엇갈림)
function grid(g, y0, y1, step, draw) {
  const nx = Math.round(TW / M(step));
  const sx = TW / nx;
  let row = 0;
  for (let y = py(y1) + sx / 2; y < py(y0); y += sx * 0.87, row++) {
    for (let i = 0; i <= nx; i++) draw(i * sx + (row % 2 ? sx / 2 : 0), y, row, i);
  }
}
function circle(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function star(g, x, y, R, r, color, n = 5, rot = -Math.PI / 2) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
function heart(g, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.4);
  g.bezierCurveTo(x - s * 1.15, y - s * 0.3, x - s * 0.5, y - s * 1.05, x, y - s * 0.42);
  g.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.15, y - s * 0.3, x, y + s * 0.4);
  g.fill();
}
function flower(g, x, y, s, petal, center, n = 5, rot = 0) {
  g.fillStyle = petal;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.55, s * 0.4, a, 0, Math.PI * 2);
    g.fill();
  }
  circle(g, x, y, s * 0.32, center);
}
function leaf(g, x, y, l, w, a, color) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -w, l, 0); g.quadraticCurveTo(l * 0.5, w, 0, 0); g.fill();
  g.restore();
}
function buttons(g, y0, y1, n, color, r = 0.009, x = FX) {
  for (let i = 0; i < n; i++) {
    const y = py(y0 + ((i + 0.5) / n) * (y1 - y0));
    circle(g, x, y, M(r), 'rgba(0,0,0,0.18)');
    circle(g, x, y - 1.5, M(r), color);
  }
}
function text(g, s, x, y, size, color, stroke) {
  g.font = FONT(size);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = M(size * 0.18); g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = color;
  g.fillText(s, x, y);
}
// 앞 가운데 기준 둥근 목선 (아래쪽으로 파인 모양)
function neckline(g, w, depth, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(FX, py(BY1), M(w), M(depth), 0, 0, Math.PI);
  g.fill();
}
// 바느질 점선
function stitch(g, x0, y0, x1, y1, color, w = 0.003) {
  g.save();
  g.strokeStyle = color; g.lineWidth = M(w); g.setLineDash([M(0.012), M(0.008)]);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.restore();
}
// 천 느낌: 아주 옅은 잡티
function grain(g, y0, y1, n, seed, color, s = 0.003) {
  const r = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(r() * TW, py(y0 + r() * (y1 - y0)), M(s), M(s));
}
// 아래로 갈수록 옅은 그림자 (몸 아래쪽 입체감)
function shade(g, y0, y1, color) {
  const gr = g.createLinearGradient(0, py(y1), 0, py(y0));
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, color);
  g.fillStyle = gr;
  g.fillRect(0, py(y1), TW, py(y0) - py(y1));
}
function shoes(g, color, sole = '#f4f1ea', top = 0.07) {
  band(g, BY0, top, color);
  band(g, BY0, BY0 + 0.018, sole);
}

// 만화 음영 (3단계 밝기)
const TOON = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/* ── 반사용 주변 그림 (CubeTexture). 금속·거울이 '무언가를 비추는' 것처럼 보이게 한다. 한 번 만들어 같이 쓴다 ──
   studio: 위는 밝은 조명, 옆은 따뜻한 벽과 창, 아래는 나무 바닥 (갑옷 등)
   steel: 차가운 회색 하늘·창·어두운 바닥 (갑옷 쇠)
   disco: 어두운 무대에 색색 조명 점 (미러볼) */
const envCache = {};
function envCube(kind) {
  if (envCache[kind]) return envCache[kind];
  const S = 128;
  const r = rng(kind === 'disco' ? 41 : kind === 'steel' ? 43 : 42);
  const face = (i) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (kind === 'disco') {
      g.fillStyle = i === 2 ? '#3a3050' : i === 3 ? '#1a1424' : '#231c33';
      g.fillRect(0, 0, S, S);
      const cols = ['#ff5f86', '#5fb4ff', '#7ee07e', '#ffd23d', '#c86bff', '#ff9a40', '#ffffff'];
      for (let k = 0; k < 16; k++) {
        const x = r() * S, y = r() * S, rad = 5 + r() * 12;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const col = cols[Math.floor(r() * cols.length)];
        gr.addColorStop(0, col); gr.addColorStop(0.35, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    } else if (kind === 'steel') {
      if (i === 2) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); }
      else if (i === 3) { g.fillStyle = '#3a404c'; g.fillRect(0, 0, S, S); }
      else {
        const gr = g.createLinearGradient(0, 0, 0, S);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.42, '#d6deea'); gr.addColorStop(0.5, '#8d96a6'); gr.addColorStop(0.58, '#5a6170'); gr.addColorStop(1, '#2e333d');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fillRect(S * (0.15 + r() * 0.4), S * 0.1, S * 0.22, S * 0.3);
      }
    } else {
      if (i === 2) { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, S, S); }
      else if (i === 3) { g.fillStyle = '#7a5434'; g.fillRect(0, 0, S, S); for (let x = 0; x < S; x += 16) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 2, S); } }
      else {
        const gr = g.createLinearGradient(0, 0, 0, S);
        gr.addColorStop(0, '#fff6e6'); gr.addColorStop(0.45, '#e6cfae'); gr.addColorStop(0.55, '#8f6c4a'); gr.addColorStop(1, '#5e4028');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        // 창문 (밝은 네모) — 옆면마다 하나씩
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fillRect(S * (0.15 + r() * 0.4), S * 0.12, S * 0.28, S * 0.26);
      }
    }
    return c;
  };
  const t = new THREE.CubeTexture([0, 1, 2, 3, 4, 5].map(face));
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  envCache[kind] = t;
  return t;
}

/* ── 효과용 반짝이 (Sprite). userData.fx = true면 캐릭터 반투명 설정을 받지 않는다 ── */
const spriteTex = {};
function sprite(kind) {
  if (spriteTex[kind]) return spriteTex[kind];
  const t = canvasTex(64, 64, (g) => {
    g.translate(32, 32);
    if (kind === 'spark') { // 네 갈래 반짝
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? 5 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.fill();
    } else if (kind === 'heart') {
      heart(g, 0, 4, 26, '#ff6f9f');
      g.globalAlpha = 0.7; heart(g, -8, -8, 6, '#ffffff');
    } else if (kind === 'drop') {
      g.fillStyle = '#8fd3ff';
      g.beginPath(); g.moveTo(0, -26); g.quadraticCurveTo(20, 6, 0, 22); g.quadraticCurveTo(-20, 6, 0, -26); g.fill();
      circle(g, -5, 4, 5, 'rgba(255,255,255,0.9)');
    } else if (kind === 'dot') {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(-32, -32, 64, 64);
    } else if (kind === 'star') {
      star(g, 0, 2, 28, 12, '#ffd84a');
      g.globalAlpha = 0.8; star(g, 0, 2, 14, 6, '#fff6c8');
    }
  });
  spriteTex[kind] = t;
  return t;
}
function particles(root, kind, max, additive = true) {
  const live = [];
  const pool = [];
  return {
    spawn(p, v, life, size, color = '#ffffff', spin = 0) {
      let s = pool.pop();
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite(kind), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
        s.userData.fx = true;
        root.add(s);
      }
      if (live.length >= max) { const old = live.shift(); old.s.visible = false; pool.push(old.s); }
      s.visible = true;
      s.position.copy(p);
      s.material.color.set(color);
      live.push({ s, v: v.clone(), age: 0, life, size, spin });
    },
    update(dt, gravity = 0, drag = 0) {
      for (let i = live.length - 1; i >= 0; i--) {
        const q = live[i];
        q.age += dt;
        const k = q.age / q.life;
        if (k >= 1) { q.s.visible = false; pool.push(q.s); live.splice(i, 1); continue; }
        q.v.y -= gravity * dt;
        q.v.multiplyScalar(1 - drag * dt);
        q.s.position.addScaledVector(q.v, dt);
        const pop = Math.min(1, k * 6) * (1 - k * k);
        q.s.scale.setScalar(q.size * (0.4 + 0.6 * pop));
        q.s.material.opacity = pop;
        q.s.material.rotation += q.spin * dt;
      }
    },
  };
}
// 몸 겉면 아무 점 (반짝이 낼 자리)
function surfacePoint(r, y0 = 0.15, y1 = 0.92, rad = 0.2) {
  const a = r() * Math.PI * 2, y = y0 + r() * (y1 - y0);
  return new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 휘두른 순간을 알려 주는 도우미
function swingWatch(char) {
  let last = char.swingT;
  return () => { const hit = char.swingT !== last && char.swingT > 0; last = char.swingT; return hit; };
}
// 캐릭터가 움직이는 속도 (월드 기준, m/s)
function motionWatch(char) {
  const prev = new THREE.Vector3(), cur = new THREE.Vector3(), v = new THREE.Vector3();
  let first = true;
  return (dt) => {
    char.group.getWorldPosition(cur);
    if (first) { prev.copy(cur); first = false; }
    if (dt > 0) v.lerp(cur.clone().sub(prev).divideScalar(dt), Math.min(1, dt * 8));
    prev.copy(cur);
    return v;
  };
}
// 돌림체(lathe): points = [[반지름, 높이], ...] 아래에서 위로. 텍스처 v = 높이 비율
function lathe(pts, seg = 40) {
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const ys = pts.map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0));
  uv.needsUpdate = true;
  return geo;
}
// 부드러운 돌림체: 몇 개의 점을 곡선으로 이어서 촘촘하게
function smoothPts(pts, n = 40) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(n).map((p) => [Math.max(0.0001, p.x), p.y]);
}

/* ═════════════ 일반: 칠하기 ═════════════ */
const PAINT = {
  // 국가대표 유니폼: 빨강 상의 + 등번호 7, 남색 반바지, 흰 양말
  uniform(g) {
    band(g, BY0, BY1, '#f6f5f1');
    band(g, 0.5, BY1, '#e0333c');
    // 어깨~옆구리 흰 줄
    g.fillStyle = '#ffffff';
    atSides((x) => g.fillRect(x - M(0.014), py(0.97), M(0.028), py(0.5) - py(0.97)));
    g.fillStyle = '#20307a';
    atSides((x) => g.fillRect(x - M(0.004), py(0.97), M(0.008), py(0.5) - py(0.97)));
    neckline(g, 0.06, 0.04, '#ffffff');
    neckline(g, 0.045, 0.03, '#f6f5f1');
    text(g, 'SMASH', FX, py(0.8), 0.06, '#ffffff');
    star(g, FX - M(0.07), py(0.9), M(0.016), M(0.007), '#ffd84a');
    atBack((x) => { text(g, '7', x, py(0.71), 0.2, '#ffffff', '#20307a'); text(g, 'KIM', x, py(0.88), 0.045, '#ffffff'); });
    // 반바지
    band(g, 0.2, 0.5, '#20307a');
    band(g, 0.47, 0.5, '#e0333c');
    g.fillStyle = '#ffffff';
    atSides((x) => g.fillRect(x - M(0.01), py(0.47), M(0.02), py(0.2) - py(0.47)));
    shade(g, 0.2, 0.5, 'rgba(0,0,0,0.12)');
    band(g, 0.06, 0.14, '#ffffff');
    band(g, 0.11, 0.125, '#e0333c');
    shoes(g, '#ffffff', '#e0333c', 0.06);
  },
  // 학교 체육복: 진초록 + 옆 흰 두 줄 + 이름표 '김탁구'
  pe(g) {
    band(g, BY0, BY1, '#1f6b4a');
    grain(g, BY0, BY1, 2500, 7, 'rgba(255,255,255,0.05)');
    g.fillStyle = '#ffffff';
    atSides((x) => { g.fillRect(x - M(0.02), py(0.96), M(0.012), py(0.06) - py(0.96)); g.fillRect(x + M(0.008), py(0.96), M(0.012), py(0.06) - py(0.96)); });
    // 목 지퍼 깃
    neckline(g, 0.07, 0.035, '#18563b');
    g.fillStyle = '#d9d6cc'; g.fillRect(FX - M(0.003), py(0.97), M(0.006), M(0.12));
    circle(g, FX, py(0.85), M(0.007), '#d9d6cc');
    // 허리 고무줄
    band(g, 0.48, 0.51, '#18563b');
    for (let x = 0; x < TW; x += M(0.01)) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, py(0.51), 1.5, M(0.03)); }
    // 이름표
    const nx = FX - M(0.08), ny = py(0.83);
    g.fillStyle = '#ffffff'; g.fillRect(nx - M(0.05), ny - M(0.022), M(0.1), M(0.044));
    g.strokeStyle = '#c9c4b5'; g.lineWidth = 2; g.strokeRect(nx - M(0.05), ny - M(0.022), M(0.1), M(0.044));
    text(g, '김탁구', nx, ny + 2, 0.03, '#203a8c');
    // 학교 마크
    circle(g, FX + M(0.08), py(0.83), M(0.022), '#f2c230');
    text(g, '탁', FX + M(0.08), py(0.83) + 2, 0.026, '#1f6b4a');
    atBack((x) => text(g, '탁구중학교', x, py(0.8), 0.04, '#ffffff'));
    shade(g, BY0, 0.4, 'rgba(0,0,0,0.15)');
    shoes(g, '#ffffff', '#c9c4b5', 0.055);
  },
  // 아빠 런닝셔츠 + 줄무늬 트렁크 (+ 목에 수건은 build에서)
  undershirt(g) {
    band(g, BY0, BY1, '#f6f5f1');
    // 런닝: 흰색, 깊은 U넥·민소매 (옆이 크게 파임)
    band(g, 0.44, 0.97, '#ffffff');
    for (let x = 0; x < TW; x += M(0.008)) { g.fillStyle = 'rgba(160,160,150,0.12)'; g.fillRect(x, py(0.97), 1.5, py(0.44) - py(0.97)); }
    g.fillStyle = '#f6f5f1';
    g.beginPath(); g.ellipse(FX, py(BY1), M(0.085), M(0.11), 0, 0, Math.PI); g.fill();
    atBack((x) => { g.beginPath(); g.ellipse(x, py(BY1), M(0.07), M(0.06), 0, 0, Math.PI); g.fill(); });
    atSides((x) => { g.beginPath(); g.ellipse(x, py(BY1), M(0.06), M(0.16), 0, 0, Math.PI); g.fill(); });
    // 배꼽 쪽 늘어난 자국 (아빠 감성)
    g.strokeStyle = 'rgba(180,170,150,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(FX, py(0.6) - i * 10, M(0.05 + i * 0.01), 0.2, Math.PI - 0.2); g.stroke(); }
    // 트렁크: 하늘색 체크
    band(g, 0.24, 0.45, '#9cc8ec');
    g.fillStyle = 'rgba(40,90,170,0.35)';
    for (let x = 0; x < TW; x += M(0.04)) g.fillRect(x, py(0.45), M(0.012), py(0.24) - py(0.45));
    for (let y = 0.25; y < 0.45; y += 0.04) band(g, y, y + 0.012, 'rgba(40,90,170,0.35)');
    band(g, 0.42, 0.45, '#2f6fe0');
    g.fillStyle = '#2f6fe0'; g.fillRect(FX - M(0.002), py(0.42), M(0.004), M(0.08));
    // 슬리퍼 느낌 발
    shoes(g, '#2f6fe0', '#1d4da8', 0.04);
  },
  // 할머니 몸빼: 분홍 꽃 블라우스 + 보라 큰 꽃 바지
  monpe(g) {
    band(g, 0.5, BY1, '#ffb8c9');
    scatter(g, 0.52, 0.97, 60, 11, (x, y, r) => flower(g, x, y, M(0.012), '#ffffff', '#ffd23d'));
    neckline(g, 0.06, 0.03, '#f6f5f1');
    // 칼라
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(FX - M(0.07), py(0.985)); g.lineTo(FX, py(0.93)); g.lineTo(FX - M(0.02), py(0.985)); g.fill();
    g.beginPath(); g.moveTo(FX + M(0.07), py(0.985)); g.lineTo(FX, py(0.93)); g.lineTo(FX + M(0.02), py(0.985)); g.fill();
    buttons(g, 0.6, 0.92, 4, '#ffffff', 0.007);
    // 몸빼
    band(g, BY0, 0.5, '#6d3fa6');
    scatter(g, 0.06, 0.48, 34, 5, (x, y, r) => {
      const c = ['#ff5f86', '#ffd23d', '#ff9a40', '#ffffff'][Math.floor(r() * 4)];
      leaf(g, x, y, M(0.04), M(0.012), r() * 6, '#3fb06a');
      leaf(g, x, y, M(0.035), M(0.01), r() * 6, '#3fb06a');
      flower(g, x, y, M(0.03), c, '#6d3fa6', 6, r());
    });
    band(g, 0.46, 0.5, '#5b3290');
    for (let x = 0; x < TW; x += M(0.012)) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, py(0.5), 2, M(0.04)); }
    // 발목 고무줄
    band(g, 0.05, 0.075, '#5b3290');
    shoes(g, '#a7a7a7', '#ffffff', 0.05);
  },
  // 형광 안전 조끼 + 회색 작업복
  vest(g) {
    band(g, BY0, BY1, '#7c8590');
    grain(g, BY0, BY1, 2500, 3, 'rgba(0,0,0,0.06)');
    // 조끼 (앞은 V로 열림)
    band(g, 0.42, 0.97, '#ff8a1e');
    g.fillStyle = '#7c8590';
    g.beginPath(); g.moveTo(FX - M(0.07), py(0.99)); g.lineTo(FX + M(0.07), py(0.99)); g.lineTo(FX + M(0.018), py(0.55)); g.lineTo(FX - M(0.018), py(0.55)); g.fill();
    atSides((x) => { g.beginPath(); g.ellipse(x, py(BY1), M(0.06), M(0.14), 0, 0, Math.PI); g.fill(); });
    // 반사띠 2줄 + 어깨 세로띠
    const refl = (y0, y1) => {
      band(g, y0, y1, '#d8dde3');
      const gr = g.createLinearGradient(0, py(y1), 0, py(y0));
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(150,160,170,0.4)');
      g.fillStyle = gr; g.fillRect(0, py(y1), TW, py(y0) - py(y1));
    };
    refl(0.5, 0.54); refl(0.62, 0.66);
    g.fillStyle = '#7c8590';
    g.beginPath(); g.moveTo(FX - M(0.03), py(0.67)); g.lineTo(FX + M(0.03), py(0.67)); g.lineTo(FX + M(0.018), py(0.49)); g.lineTo(FX - M(0.018), py(0.49)); g.fill();
    atBack((x) => text(g, '안전제일', x, py(0.82), 0.05, '#2b2a33'));
    g.fillStyle = '#2b9a4a'; atBack((x) => g.fillRect(x - M(0.012), py(0.92), M(0.024), M(0.05)));
    g.fillStyle = '#2b9a4a'; atBack((x) => g.fillRect(x - M(0.025), py(0.905), M(0.05), M(0.02)));
    // 무릎 덧댐
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(FX - M(0.09), py(0.28), M(0.05), M(0.06)); g.fillRect(FX + M(0.04), py(0.28), M(0.05), M(0.06));
    band(g, 0.48, 0.5, '#4f565e');
    shoes(g, '#5b3a22', '#2b2a33', 0.07);
  },
  // 등산복 아저씨: 쨍한 주황·남색 바람막이, 검정 등산바지
  hiking(g) {
    band(g, 0.48, BY1, '#ff6a1a');
    // 대각선 남색 판
    g.fillStyle = '#233b7a';
    g.beginPath(); g.moveTo(0, py(0.48)); g.lineTo(TW, py(0.48)); g.lineTo(TW, py(0.62)); g.lineTo(FX + M(0.05), py(0.78)); g.lineTo(0, py(0.6)); g.fill();
    g.fillStyle = '#ffe14a';
    g.beginPath(); g.moveTo(0, py(0.6)); g.lineTo(FX + M(0.05), py(0.78)); g.lineTo(TW, py(0.62)); g.lineTo(TW, py(0.64)); g.lineTo(FX + M(0.05), py(0.8)); g.lineTo(0, py(0.62)); g.fill();
    // 깃 + 지퍼
    band(g, 0.93, BY1, '#233b7a');
    g.fillStyle = '#2b2a33'; g.fillRect(FX - M(0.003), py(0.99), M(0.006), py(0.48) - py(0.99));
    g.fillStyle = '#d9d6cc'; g.fillRect(FX - M(0.006), py(0.9), M(0.012), M(0.025));
    // 산 로고
    const lx = FX - M(0.08), ly = py(0.86);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(lx - M(0.03), ly + M(0.015)); g.lineTo(lx - M(0.01), ly - M(0.015)); g.lineTo(lx, ly); g.lineTo(lx + M(0.012), ly - M(0.02)); g.lineTo(lx + M(0.035), ly + M(0.015)); g.fill();
    text(g, 'MOUNTAIN', FX + M(0.08), py(0.86), 0.022, '#ffffff');
    // 가슴 주머니 지퍼
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(FX + M(0.04), py(0.82), M(0.08), 3);
    atBack((x) => text(g, '정상까지 GO', x, py(0.85), 0.038, '#ffffff'));
    shade(g, 0.48, 0.99, 'rgba(0,0,0,0.08)');
    band(g, BY0, 0.48, '#26262c');
    g.fillStyle = 'rgba(255,255,255,0.08)'; atSides((x) => g.fillRect(x - M(0.03), py(0.4), M(0.06), M(0.08)));
    stitch(g, 0, py(0.25), TW, py(0.25), 'rgba(255,255,255,0.15)');
    shoes(g, '#8b5a2b', '#3a2a1a', 0.07);
    band(g, 0.05, 0.058, '#ff6a1a');
  },
  // 별 잠옷: 하늘색, 노란 별·초승달, 흰 테두리, 단추
  starpj(g) {
    band(g, BY0, BY1, '#a9c8f2');
    grid(g, 0.06, 0.97, 0.075, (x, y, row, i) => {
      if ((row + i) % 3 === 0) {
        g.fillStyle = '#fff2a8';
        g.beginPath(); g.arc(x, y, M(0.015), 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a9c8f2';
        g.beginPath(); g.arc(x + M(0.007), y - M(0.004), M(0.013), 0, Math.PI * 2); g.fill();
      } else star(g, x, y, M(0.014), M(0.006), '#ffe14a', 5, -Math.PI / 2 + (i % 4) * 0.3);
    });
    scatter(g, 0.06, 0.97, 120, 4, (x, y) => circle(g, x, y, M(0.0025), '#ffffff'));
    // 흰 테두리 깃 + 앞섶 + 허리끈
    g.strokeStyle = '#ffffff'; g.lineWidth = M(0.007);
    g.beginPath(); g.moveTo(FX - M(0.08), py(0.985)); g.lineTo(FX, py(0.86)); g.lineTo(FX + M(0.08), py(0.985)); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(FX + M(0.01), py(0.86), M(0.006), py(0.5) - py(0.86));
    buttons(g, 0.52, 0.86, 4, '#ffffff', 0.008, FX + M(0.03));
    band(g, 0.48, 0.5, '#ffffff');
    // 바지 밑단 + 발
    band(g, 0.06, 0.08, '#ffffff');
    shoes(g, '#f4d0e0', '#ffffff', 0.05);
    shade(g, BY0, 0.45, 'rgba(30,60,120,0.12)');
  },
  // 호피 무늬 전신
  leopard(g) {
    band(g, BY0, BY1, '#e9a54b');
    const r = rng(21);
    for (let i = 0; i < 260; i++) {
      const x = r() * TW, y = py(BY0 + r() * (BY1 - BY0)), s = M(0.012 + r() * 0.012), a = r() * 6;
      wrap(x, (xx) => {
        g.fillStyle = '#c9772a';
        g.beginPath(); g.ellipse(xx, y, s * 0.9, s * 0.7, a, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#2b1d12'; g.lineWidth = s * 0.38; g.lineCap = 'round';
        for (let k = 0; k < 3; k++) { const a0 = a + k * 2.1 + r() * 0.5; g.beginPath(); g.arc(xx, y, s, a0, a0 + 1.3); g.stroke(); }
      });
    }
    scatter(g, BY0, BY1, 200, 9, (x, y) => circle(g, x, y, M(0.004), '#2b1d12'));
    neckline(g, 0.05, 0.03, '#f6f5f1');
    band(g, 0.49, 0.51, '#2b1d12');
    shoes(g, '#2b1d12', '#c9a227', 0.05);
  },
  // 땡땡이 잠옷: 분홍 바탕 흰 물방울, 동그란 흰 깃, 리본
  dotpj(g) {
    band(g, BY0, BY1, '#ff9fc0');
    grid(g, 0.05, 0.97, 0.05, (x, y) => circle(g, x, y, M(0.011), '#ffffff'));
    // 동그란 깃 (피터팬 칼라)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(FX - M(0.045), py(0.955), M(0.05), M(0.035), 0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(FX + M(0.045), py(0.955), M(0.05), M(0.035), -0.25, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ff7fb0'; g.lineWidth = M(0.004);
    g.beginPath(); g.ellipse(FX - M(0.045), py(0.955), M(0.05), M(0.035), 0.25, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(FX + M(0.045), py(0.955), M(0.05), M(0.035), -0.25, 0, Math.PI * 2); g.stroke();
    neckline(g, 0.04, 0.025, '#f6f5f1');
    // 빨간 리본
    g.fillStyle = '#e8456f';
    g.beginPath(); g.moveTo(FX, py(0.93)); g.lineTo(FX - M(0.03), py(0.95)); g.lineTo(FX - M(0.03), py(0.91)); g.fill();
    g.beginPath(); g.moveTo(FX, py(0.93)); g.lineTo(FX + M(0.03), py(0.95)); g.lineTo(FX + M(0.03), py(0.91)); g.fill();
    circle(g, FX, py(0.93), M(0.01), '#c8325a');
    buttons(g, 0.55, 0.88, 4, '#ffffff', 0.008);
    // 가슴 주머니 + 하트
    g.fillStyle = '#ffffff'; g.fillRect(FX + M(0.05), py(0.8), M(0.06), M(0.055));
    heart(g, FX + M(0.08), py(0.77), M(0.015), '#ff7fb0');
    // 소매·밑단 프릴 (가장자리 물결)
    const frill = (y, color) => { g.fillStyle = color; for (let x = 0; x < TW; x += M(0.02)) { g.beginPath(); g.arc(x, py(y), M(0.01), 0, Math.PI); g.fill(); } };
    band(g, 0.5, 0.515, '#ffffff'); frill(0.5, '#ffffff');
    band(g, 0.06, 0.075, '#ffffff'); frill(0.06, '#ffffff');
    shoes(g, '#ffffff', '#ffd1e0', 0.045);
  },
  // 데님 멜빵: 노랑 줄무늬 티 + 연청 멜빵바지, 하트 주머니
  overalls(g) {
    band(g, 0.5, BY1, '#fff2b0');
    for (let y = 0.52; y < BY1; y += 0.05) band(g, y, y + 0.02, '#ffb84d');
    neckline(g, 0.05, 0.03, '#f6f5f1');
    const denim = (y0, y1) => {
      band(g, y0, y1, '#7fa8d8');
      grain(g, y0, y1, 4000, 8, 'rgba(255,255,255,0.18)', 0.002);
      grain(g, y0, y1, 3000, 9, 'rgba(30,60,120,0.18)', 0.002);
    };
    denim(BY0, 0.52);
    // 가슴판 (앞)
    g.save();
    g.beginPath(); g.roundRect(FX - M(0.1), py(0.76), M(0.2), py(0.5) - py(0.76), M(0.015)); g.clip();
    denim(0.5, 0.76);
    g.restore();
    g.strokeStyle = '#f2b23a'; g.lineWidth = M(0.003); g.setLineDash([M(0.01), M(0.006)]);
    g.strokeRect(FX - M(0.09), py(0.75), M(0.18), py(0.52) - py(0.75)); g.setLineDash([]);
    // 하트 주머니
    heart(g, FX, py(0.65), M(0.045), '#5f8cc4');
    heart(g, FX, py(0.655), M(0.035), '#ff7fb0');
    // 멜빵끈: 앞 두 줄 → 등에서 X
    g.strokeStyle = '#6a95c9'; g.lineWidth = M(0.028); g.lineCap = 'butt';
    g.beginPath(); g.moveTo(FX - M(0.08), py(0.76)); g.lineTo(FX - M(0.1), py(BY1)); g.stroke();
    g.beginPath(); g.moveTo(FX + M(0.08), py(0.76)); g.lineTo(FX + M(0.1), py(BY1)); g.stroke();
    atBack((x) => {
      g.beginPath(); g.moveTo(x - M(0.13), py(BY1)); g.lineTo(x + M(0.1), py(0.52)); g.stroke();
      g.beginPath(); g.moveTo(x + M(0.13), py(BY1)); g.lineTo(x - M(0.1), py(0.52)); g.stroke();
    });
    circle(g, FX - M(0.08), py(0.745), M(0.014), '#e8b923');
    circle(g, FX + M(0.08), py(0.745), M(0.014), '#e8b923');
    band(g, 0.5, 0.52, '#5f8cc4');
    // 접어 올린 밑단 + 운동화
    band(g, 0.07, 0.11, '#b5cfee');
    shoes(g, '#ffffff', '#ff7fb0', 0.07);
    band(g, 0.045, 0.055, '#ff7fb0');
  },
};

/* ═════════════ 고급·전설: 모양 만들기 ═════════════
   build(root, char) → 매 프레임 불릴 update(t, dt) (없으면 생략) */
const BUILD = {};

// 아빠 런닝셔츠: 목에 두른 하늘색 수건
BUILD.undershirt = (root) => {
  skin(root, PAINT.undershirt);
  const tex = canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = '#bfe3f7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 10, h);
  });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const m = lam('#ffffff', { map: tex });
  const ring = mesh(new THREE.TorusGeometry(0.15, 0.03, 10, 30), m, 0, 0.965, 0.01, root);
  ring.rotation.x = Math.PI / 2 + 0.25;
  ring.scale.set(1, 1.05, 0.7);
  const endTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#bfe3f7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; for (let y = 0; y < h; y += 40) g.fillRect(0, y, w, 12);
    g.fillStyle = '#ffffff'; for (let x = 2; x < w; x += 8) g.fillRect(x, h - 14, 3, 14); // 술
  });
  const em = lam('#ffffff', { map: endTex });
  for (const s of [-1, 1]) {
    const end = mesh(new THREE.BoxGeometry(0.065, 0.24, 0.016), em, s * 0.075, 0.84, -0.17, root);
    end.rotation.set(-0.22, 0, s * -0.12);
  }
};

// 출근룩 정장: 남색 정장, 빨간 넥타이(입체), 사원증
BUILD.suit = (root) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#27304f');
    grain(g, BY0, BY1, 3000, 2, 'rgba(255,255,255,0.05)');
    // 흰 셔츠 V
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(FX - M(0.09), py(BY1)); g.lineTo(FX + M(0.09), py(BY1)); g.lineTo(FX, py(0.62)); g.fill();
    // 깃 (라펠)
    g.fillStyle = '#1d2540';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(FX + s * M(0.09), py(BY1)); g.lineTo(FX + s * M(0.03), py(0.62)); g.lineTo(FX + s * M(0.055), py(0.8)); g.lineTo(FX + s * M(0.11), py(0.86)); g.fill();
    }
    g.fillStyle = '#ffffff';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(FX + s * M(0.03), py(0.985)); g.lineTo(FX + s * M(0.07), py(0.985)); g.lineTo(FX + s * M(0.012), py(0.93)); g.fill(); }
    buttons(g, 0.5, 0.62, 2, '#111522', 0.008);
    // 가슴 주머니 손수건
    g.fillStyle = '#e0333c'; g.beginPath(); g.moveTo(FX - M(0.11), py(0.8)); g.lineTo(FX - M(0.08), py(0.83)); g.lineTo(FX - M(0.07), py(0.8)); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(FX - M(0.12), py(0.8), M(0.06), 3);
    // 바지 주름 + 구두
    band(g, 0.48, 0.5, '#1a2038');
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(FX - M(0.05), py(0.48), 2, py(0.1) - py(0.48)); g.fillRect(FX + M(0.05), py(0.48), 2, py(0.1) - py(0.48));
    shoes(g, '#1a1a1a', '#3a2a1a', 0.06);
    const gr = g.createLinearGradient(0, py(0.06), 0, py(0.03)); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, py(0.06), TW, M(0.03));
  });
  // 넥타이 (앞으로 볼록)
  const tie = new THREE.Shape();
  tie.moveTo(-0.018, 0); tie.lineTo(0.018, 0); tie.lineTo(0.012, -0.03); tie.lineTo(0.03, -0.24); tie.lineTo(0, -0.28); tie.lineTo(-0.03, -0.24); tie.lineTo(-0.012, -0.03); tie.closePath();
  const tieTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#d4313a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8f1d24'; g.lineWidth = 6;
    for (let y = -64; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 40); g.stroke(); }
  });
  tieTex.repeat.set(16, 3.5); tieTex.offset.set(0.5, 1);
  const tm = mesh(new THREE.ExtrudeGeometry(tie, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 2 }), lam('#ffffff', { map: tieTex }), 0, 0.97, -0.158, root);
  tm.rotation.x = 0.36;
  mesh(new THREE.SphereGeometry(0.022, 12, 8), lam('#b8242c'), 0, 0.965, -0.165, root).scale.set(1, 0.8, 0.7);
  // 사원증: 목줄 + 카드
  const strap = mesh(new THREE.TorusGeometry(0.155, 0.005, 6, 40, Math.PI * 1.2), lam('#2f6fe0'), 0, 0.92, 0, root);
  strap.rotation.set(Math.PI / 2 + 0.55, 0, Math.PI * 0.4 + Math.PI / 2 - Math.PI * 0.6 + Math.PI * 0.5);
  const cardTex = canvasTex(160, 220, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f6fe0'; g.fillRect(0, 0, w, 44);
    g.font = '28px Jua, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText('사원증', w / 2, 32);
    g.fillStyle = '#dfe6f2'; g.fillRect(40, 58, 80, 80);
    circle(g, 80, 88, 20, '#f6f5f1'); g.fillStyle = '#f6f5f1'; g.fillRect(52, 112, 56, 26);
    g.fillStyle = '#2b2a33'; g.font = '30px Jua, sans-serif'; g.fillText('김탁구', w / 2, 172);
    g.font = '18px Jua, sans-serif'; g.fillStyle = '#7a7f8c'; g.fillText('탁구사업부 · 대리', w / 2, 200);
  });
  const card = mesh(new THREE.BoxGeometry(0.06, 0.082, 0.003), [lam('#ddd'), lam('#ddd'), lam('#ddd'), lam('#ddd'), lam('#fff'), lam('#ffffff', { map: cardTex })], 0.07, 0.7, -0.19, root);
  card.rotation.set(0.12, Math.PI, 0.04);
  const clip = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 6), lam('#2f6fe0'), 0.055, 0.82, -0.18, root);
  clip.rotation.set(0.25, 0, -0.2);
};

// 김제빵 앞치마: 흰 제빵복(더블 단추) + 갈색 앞치마(입체) + 밀가루 자국
BUILD.apron = (root) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#fbfaf5');
    grain(g, BY0, BY1, 2000, 4, 'rgba(0,0,0,0.04)');
    band(g, 0.94, BY1, '#f0ece0');
    for (const s of [-1, 1]) buttons(g, 0.7, 0.92, 3, '#d9cdb2', 0.007, FX + s * M(0.05));
    band(g, BY0, 0.3, '#3b3b44');
    shoes(g, '#2b2a33', '#ffffff', 0.05);
  });
  const tex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a0643a'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    g.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < 1500; i++) g.fillRect(r() * w, r() * h, 2, 2);
    g.strokeStyle = '#f2d3a6'; g.lineWidth = 5; g.setLineDash([14, 8]); g.strokeRect(14, 14, w - 28, h - 28); g.setLineDash([]);
    // 식빵 그림
    g.save(); g.translate(w / 2, 170);
    g.fillStyle = '#c98a4b'; g.beginPath(); g.arc(-40, -40, 50, Math.PI, Math.PI * 1.9); g.arc(40, -40, 50, Math.PI * 1.1, 0); g.lineTo(80, 70); g.lineTo(-80, 70); g.closePath(); g.fill();
    g.fillStyle = '#ffe6b8'; g.beginPath(); g.arc(-36, -34, 38, Math.PI, Math.PI * 1.9); g.arc(36, -34, 38, Math.PI * 1.1, 0); g.lineTo(66, 58); g.lineTo(-66, 58); g.closePath(); g.fill();
    circle(g, -20, 0, 6, '#3b2a1e'); circle(g, 20, 0, 6, '#3b2a1e');
    g.strokeStyle = '#3b2a1e'; g.lineWidth = 4; g.beginPath(); g.arc(0, 12, 12, 0.2, Math.PI - 0.2); g.stroke();
    circle(g, -38, 16, 9, 'rgba(255,120,120,0.5)'); circle(g, 38, 16, 9, 'rgba(255,120,120,0.5)');
    g.restore();
    g.font = '70px Jua, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff4dc'; g.fillText('김제빵', w / 2, 330);
    // 주머니
    g.strokeStyle = '#f2d3a6'; g.lineWidth = 4; g.setLineDash([10, 7]); g.strokeRect(150, 380, 212, 90); g.setLineDash([]);
    g.beginPath(); g.moveTo(256, 380); g.lineTo(256, 470); g.stroke();
    // 밀가루 자국
    const f = rng(8);
    for (let i = 0; i < 7; i++) {
      const x = f() * w, y = f() * h, s = 14 + f() * 26;
      for (let k = 0; k < 14; k++) circle(g, x + (f() - 0.5) * s * 1.6, y + (f() - 0.5) * s, s * (0.2 + f() * 0.35), 'rgba(255,255,255,0.5)');
    }
  });
  // 몸 앞을 감싸는 곡면 (원통 일부)
  const geo = new THREE.CylinderGeometry(0.188, 0.2, 0.62, 24, 1, true, Math.PI - 1.0, 2.0);
  const ap = mesh(geo, lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0.53, 0, root);
  void ap;
  // 목끈 + 허리끈 (등에서 리본)
  const tie = lam('#8a5430');
  const neck = mesh(new THREE.TorusGeometry(0.16, 0.007, 6, 30, Math.PI), tie, 0, 0.92, 0.02, root);
  neck.rotation.set(-0.3, 0, 0);
  const waist = mesh(new THREE.TorusGeometry(0.19, 0.009, 6, 40), tie, 0, 0.66, 0, root);
  waist.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const bow = mesh(new THREE.SphereGeometry(0.03, 10, 8), tie, s * 0.03, 0.66, 0.2, root);
    bow.scale.set(1.2, 0.6, 0.4);
    const tail = mesh(new THREE.BoxGeometry(0.018, 0.12, 0.006), tie, s * 0.022, 0.59, 0.195, root);
    tail.rotation.z = s * 0.25;
  }
  mesh(new THREE.SphereGeometry(0.014, 8, 6), tie, 0, 0.66, 0.205, root);
};

// 수능 롱패딩: 칸칸이 부푼 검정 패딩, 높은 깃, 앞 지퍼
BUILD.padding = (root) => {
  const pts = [];
  pts.push([0.16, 0.06]);
  const rows = 9;
  for (let i = 0; i <= rows * 6; i++) {
    const y = 0.07 + (i / (rows * 6)) * 0.84;
    const k = (i % 6) / 6;
    const base = 0.205 + 0.012 * Math.sin((y - 0.07) * 2.4);
    pts.push([base + Math.sin(k * Math.PI) * 0.018, y]);
  }
  pts.push([0.17, 0.93], [0.16, 1.0], [0.135, 1.0]); // 높은 깃
  const tex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#1c1d22'; g.fillRect(0, 0, w, h);
    // 광택 줄 (칸마다)
    for (let i = 0; i < rows; i++) {
      const y0 = h - (i + 1) * (h * 0.84 / rows) - h * 0.07, hh = h * 0.84 / rows;
      const gr = g.createLinearGradient(0, y0, 0, y0 + hh);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = gr; g.fillRect(0, y0, w, hh);
    }
    // 앞 지퍼 + 지퍼 손잡이
    g.fillStyle = '#4a4b52'; g.fillRect(w / 2 - 3, 0, 6, h);
    g.fillStyle = '#c9c9cf'; g.fillRect(w / 2 - 6, 30, 12, 26);
    // 왼쪽 가슴 흰 로고 (산 모양 + 글자)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(w / 2 + 34, 120); g.lineTo(w / 2 + 46, 104); g.lineTo(w / 2 + 52, 112); g.lineTo(w / 2 + 60, 100); g.lineTo(w / 2 + 72, 120); g.fill();
    g.font = '15px Jua, sans-serif'; g.fillText('수능 대박', w / 2 + 34, 138);
    // 등 '2027 수능'
    g.font = '44px Jua, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText('2027', 0, 170); g.fillText('2027', w, 170);
    g.font = '30px Jua, sans-serif'; g.fillText('수험생', 0, 210); g.fillText('수험생', w, 210);
  });
  mesh(lathe(pts, 48), phong('#ffffff', { map: tex, shininess: 40, specular: '#555' }), 0, 0, 0, root);
  // 바닥 막음 + 발
  mesh(new THREE.CircleGeometry(0.16, 24), lam('#1c1d22'), 0, 0.06, 0, root).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.06, 12, 8), lam('#f6f5f1'), s * 0.07, 0.035, -0.04, root).scale.set(1, 0.6, 1.4);
};

// 이불 둘둘: 꽃무늬 솜이불을 감은 모양 + 한쪽 끝자락이 펄럭
BUILD.blanket = (root) => {
  const tex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#e84a6f'; g.fillRect(0, 0, w, h);
    const r = rng(14);
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, s = 22 + r() * 22;
      for (const xx of [x, x - w, x + w]) {
        for (let k = 0; k < 3; k++) leaf(g, xx, y, s * 1.4, s * 0.4, r() * 6, '#2f9a5a');
        flower(g, xx, y, s, r() < 0.5 ? '#ffd23d' : '#ffffff', '#ff8a1e', 8, r());
        flower(g, xx, y, s * 0.55, '#ff9a40', '#ffe14a', 6, r());
      }
    }
    // 테두리 천 (가장자리 노란 띠)
    g.fillStyle = '#ffd23d'; g.fillRect(0, 0, w, 22);
  });
  tex.wrapS = THREE.RepeatWrapping;
  const m = lam('#ffffff', { map: tex, side: THREE.DoubleSide });
  // 몸을 감은 본체 (위가 넓게 벌어져 목을 감쌈)
  const pts = smoothPts([[0.17, 0.02], [0.215, 0.2], [0.225, 0.5], [0.215, 0.8], [0.2, 0.96], [0.22, 1.0]], 40);
  mesh(lathe(pts, 48), m, 0, 0, 0, root);
  // 감긴 자국 (비스듬한 띠 두 줄)
  for (const [y, a] of [[0.38, 0.18], [0.72, -0.14]]) {
    const ring = mesh(new THREE.TorusGeometry(0.228, 0.018, 8, 40), m, 0, y, 0, root);
    ring.rotation.set(Math.PI / 2 + a, 0, 0);
  }
  // 끝자락 (앞쪽에 비스듬히 늘어진 천)
  const flap = new THREE.PlaneGeometry(0.18, 0.5, 4, 8);
  const pos = flap.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -Math.cos(x / 0.24) * 0.02 + (0.25 - y) * 0.05);
  }
  flap.computeVertexNormals();
  const f = mesh(flap, m, 0.08, 0.55, -0.235, root);
  f.rotation.set(0, 0.35, 0.18);
  mesh(new THREE.CircleGeometry(0.17, 24), m, 0, 0.02, 0, root).rotation.x = Math.PI / 2;
};

// 김밥: 김밥 세 조각이 단면을 앞으로 보이며 쌓인 '김밥 탑'
BUILD.gimbap = (root) => {
  const nori = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#18241a'; g.fillRect(0, 0, w, h);
    const r = rng(6);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,120,70,0.25)' : 'rgba(0,0,0,0.3)'; g.fillRect(r() * w, r() * h, 2 + r() * 4, 1 + r() * 2); }
    for (let i = 0; i < 60; i++) { g.fillStyle = '#f3e3b8'; g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 3); g.beginPath(); g.ellipse(0, 0, 3.5, 1.8, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  });
  const cut = (seed) => canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    circle(g, c, c, 256, '#18241a');
    circle(g, c, c, 236, '#fbfaf2');
    const r = rng(seed);
    for (let i = 0; i < 520; i++) { const a = r() * 6.28, d = r() * 228; g.fillStyle = r() < 0.5 ? '#ffffff' : '#e6e1d2'; g.beginPath(); g.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 8, 4.5, r() * 3, 0, Math.PI * 2); g.fill(); }
    const fill = (x, y, ww, hh, col, rot = 0) => { g.save(); g.translate(c + x, c + y); g.rotate(rot); g.fillStyle = col; g.beginPath(); g.roundRect(-ww / 2, -hh / 2, ww, hh, 9); g.fill(); g.restore(); };
    const jit = () => (r() - 0.5) * 14;
    fill(jit(), jit(), 72, 72, '#f6d12a', r() - 0.5); // 단무지
    fill(-80 + jit(), -15 + jit(), 44, 44, '#ff8a2a'); // 당근
    fill(75 + jit(), -25 + jit(), 54, 64, '#ffd36b'); // 달걀
    fill(-5 + jit(), -88 + jit(), 66, 40, '#ff8ca6'); // 햄
    fill(5 + jit(), 85 + jit(), 74, 40, '#3e8a3a'); // 시금치
    fill(-75 + jit(), 65 + jit(), 44, 44, '#8b5a3a'); // 우엉
    fill(82 + jit(), 60 + jit(), 42, 42, '#e8556f'); // 맛살
    // 참기름 반짝
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(c - 120, c - 130, 50, 18, -0.7, 0, Math.PI * 2); g.fill();
  });
  const side = phong('#ffffff', { map: nori, shininess: 70, specular: '#4a5a4a' });
  const R = 0.17, D = 0.34;
  [[0.18, 0.05, 1], [0.51, -0.06, 2], [0.84, 0.04, 3]].forEach(([y, tilt, seed]) => {
    const face = lam('#ffffff', { map: cut(seed) });
    const s = mesh(new THREE.CylinderGeometry(R, R, D, 40), [side, face, face], 0, y, 0, root);
    s.rotation.set(Math.PI / 2, 0, tilt);
    s.rotation.order = 'ZXY';
    s.rotation.y = tilt * 2;
  });
};

// 붕어빵: 머리가 붕어 입에서 쏙 나온 탈
BUILD.bungeo = (root) => {
  const tex = canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#c97b2e'); gr.addColorStop(0.5, '#e7a24e'); gr.addColorStop(1, '#b8691f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 비늘 (반원 겹침)
    g.strokeStyle = 'rgba(110,55,10,0.55)'; g.lineWidth = 5;
    for (let row = 0; row < 12; row++) for (let i = 0; i < 26; i++) {
      const x = i * 40 + (row % 2) * 20, y = 90 + row * 30;
      g.beginPath(); g.arc(x, y, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
    // 탄 자국 (가장자리 진하게)
    const r = rng(4);
    for (let i = 0; i < 40; i++) circle(g, r() * w, r() * h, 6 + r() * 18, 'rgba(90,40,5,0.18)');
    for (let i = 0; i < 40; i++) circle(g, r() * w, r() * h, 4 + r() * 10, 'rgba(255,220,150,0.25)');
    // 옆줄 (가운데 지느러미 선)
    g.strokeStyle = 'rgba(110,55,10,0.6)'; g.lineWidth = 6;
    g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, 70 + Math.sin(x / 40) * 6); g.stroke();
  });
  const m = lam('#ffffff', { map: tex });
  // 몸: 위가 입(머리 나오는 곳), 아래로 갈수록 가늘어져 꼬리
  const pts = smoothPts([[0.12, 0.12], [0.2, 0.25], [0.245, 0.5], [0.235, 0.75], [0.19, 0.93], [0.16, 1.0]], 40);
  mesh(lathe(pts, 40), m, 0, 0, 0, root);
  // 입술 (머리 둘레 도톰한 고리)
  const lip = mesh(new THREE.TorusGeometry(0.155, 0.03, 10, 30), lam('#d98d3c'), 0, 0.995, 0, root);
  lip.rotation.x = Math.PI / 2;
  // 눈 (위쪽 양옆)
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.04, 14, 10), lam('#f2c58a'), s * 0.17, 0.88, -0.1, root);
    e.scale.set(0.5, 1, 1);
    mesh(new THREE.SphereGeometry(0.022, 10, 8), lam('#2b1d12'), s * 0.19, 0.885, -0.11, root);
  }
  // 꼬리 지느러미 (아래, 두 갈래)
  const tail = new THREE.Shape();
  tail.moveTo(0, 0.05); tail.quadraticCurveTo(0.16, -0.02, 0.18, -0.14); tail.quadraticCurveTo(0.08, -0.08, 0, -0.06);
  tail.quadraticCurveTo(-0.08, -0.08, -0.18, -0.14); tail.quadraticCurveTo(-0.16, -0.02, 0, 0.05);
  const finTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d08a3a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,55,10,0.6)'; g.lineWidth = 6;
    for (let a = -1; a <= 1; a += 0.25) { g.beginPath(); g.moveTo(w / 2, h * 0.3); g.lineTo(w / 2 + Math.sin(a) * w, h); g.stroke(); }
  });
  finTex.repeat.set(2.6, 2.6); finTex.offset.set(0.5, 0.6);
  const fm = lam('#ffffff', { map: finTex });
  const tf = mesh(new THREE.ExtrudeGeometry(tail, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2 }), fm, 0, 0.1, 0.0, root);
  tf.rotation.y = Math.PI / 2;
  tf.position.set(-0.015, 0.1, 0);
  // 옆·등 지느러미
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.quadraticCurveTo(0.06, 0.03, 0.09, 0.12); fin.quadraticCurveTo(0.02, 0.1, 0, 0.08);
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 }), fm, s * 0.23, 0.42, -0.02, root);
    f.rotation.set(0, s > 0 ? 0 : Math.PI, -0.6);
  }
  const back = mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 }), fm, 0.006, 0.5, 0.23, root);
  back.rotation.set(0, Math.PI / 2, 0);
  back.scale.set(1.6, 1.8, 1);
  mesh(new THREE.CircleGeometry(0.12, 20), lam('#b8691f'), 0, 0.12, 0, root).rotation.x = Math.PI / 2;
};

// 바나나: 몸은 하얀 속살, 노란 껍질 네 장이 허리 아래부터 꽃잎처럼 벌어짐
BUILD.banana = (root) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#fff3c4');
    const r = rng(3);
    for (let i = 0; i < 300; i++) circle(g, r() * TW, py(0.5 + r() * 0.48), M(0.002 + r() * 0.002), 'rgba(170,120,40,0.3)');
    for (let x = 0; x < TW; x += M(0.06)) { g.fillStyle = 'rgba(230,200,120,0.25)'; g.fillRect(x, 0, M(0.006), TH); }
    band(g, BY0, 0.5, '#f7d23a');
  });
  const peelTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#e0b52a'); gr.addColorStop(0.5, '#ffdc3a'); gr.addColorStop(1, '#e0b52a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(120,80,20,0.6)'; const r = rng(9);
    for (let i = 0; i < 14; i++) circle(g, r() * w, r() * h * 0.8, 2 + r() * 4, 'rgba(110,70,20,0.55)');
    g.fillStyle = '#7a5a1a'; g.fillRect(0, h - 10, w, 10);
  });
  const inTex = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#fff6d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(230,200,140,0.6)'; for (let x = 6; x < w; x += 14) g.fillRect(x, 0, 3, h);
  });
  const outM = lam('#ffffff', { map: peelTex, side: THREE.FrontSide });
  const inM = lam('#ffffff', { map: inTex, side: THREE.BackSide });
  // 껍질 한 장 = 원통의 1/4 조각, 위로 갈수록 바깥으로 휘어 뒤집힘
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.CylinderGeometry(0.19, 0.19, 0.5, 10, 14, true, -0.68, 1.36);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) + 0.25, z = pos.getZ(i); // y 0 ~ 0.5
      const t = y / 0.5;
      const a = Math.atan2(x, z);
      const width = 1 - Math.pow(t, 2.2) * 0.8; // 끝이 뾰족
      const aa = a * width;
      const s = Math.max(0, Math.min(1, (t - 0.42) / 0.58));
      const k = s * s * (3 - 2 * s);
      const out = 0.19 + Math.sin(k * Math.PI * 0.62) * 0.16;
      const yy = 0.21 + Math.sin(Math.min(t, 0.42) / 0.42 * Math.PI / 2) * 0.0 + (t < 0.42 ? (t - 0.42) * 0.5 : 0) + Math.sin(k * Math.PI) * 0.09 - k * k * 0.3;
      pos.setXYZ(i, Math.sin(aa) * out, yy, Math.cos(aa) * out);
    }
    geo.computeVertexNormals();
    const grp = new THREE.Group();
    grp.rotation.y = k * (Math.PI / 2) + Math.PI / 4;
    grp.position.y = 0.4;
    root.add(grp);
    mesh(geo, outM, 0, 0, 0, grp);
    mesh(geo, inM, 0, 0, 0, grp);
  }
  // 아래 꼭지
  mesh(new THREE.CylinderGeometry(0.192, 0.19, 0.4, 32), lam('#f2cc35'), 0, 0.22, 0, root);
  mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.06, 16), lam('#6b4a1a'), 0, 0.02, 0, root);
};

// 펭귄: 검정 몸 + 흰 배 + 날개 + 노란 발
BUILD.penguin = (root) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#25262e');
    g.fillStyle = '#fbfaf5';
    g.beginPath(); g.ellipse(FX, py(0.5), M(0.15), M(0.42), 0, 0, Math.PI * 2); g.fill();
    // 목 노란 무늬
    const gr = g.createRadialGradient(FX, py(0.95), 0, FX, py(0.95), M(0.12));
    gr.addColorStop(0, 'rgba(255,200,60,0.9)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
    g.fillStyle = gr; g.fillRect(FX - M(0.15), py(BY1), M(0.3), M(0.15));
    // 배 털 결
    g.strokeStyle = 'rgba(0,0,0,0.05)'; g.lineWidth = 2;
    for (let y = 0.15; y < 0.85; y += 0.04) { g.beginPath(); g.arc(FX, py(y), M(0.04), 0.3, Math.PI - 0.3); g.stroke(); }
  }, (t) => phong('#ffffff', { map: t, shininess: 20, specular: '#333' }));
  // 날개 (팔락 각도)
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.SphereGeometry(0.1, 16, 12), phong('#25262e', { shininess: 20 }), s * 0.18, 0.55, 0.01, root);
    w.scale.set(0.22, 1.5, 0.6);
    w.rotation.z = s * 0.28;
  }
  // 꼬리
  const tail = mesh(new THREE.ConeGeometry(0.05, 0.1, 10), lam('#25262e'), 0, 0.1, 0.18, root);
  tail.rotation.x = 1.9;
  // 발
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.SphereGeometry(0.06, 12, 8), lam('#ffb020'), s * 0.07, 0.02, -0.12, root);
    f.scale.set(1, 0.35, 1.5);
  }
  // 나비넥타이 (신사 펭귄)
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.ConeGeometry(0.025, 0.05, 4), lam('#e0333c'), s * 0.025, 0.93, -0.165, root);
    b.rotation.set(0, 0, s * Math.PI / 2);
  }
  mesh(new THREE.SphereGeometry(0.012, 8, 6), lam('#b8242c'), 0, 0.93, -0.17, root);
};

// 하와이안 셔츠 + 꽃목걸이(레이)
BUILD.hawaii = (root) => {
  skin(root, (g) => {
    band(g, 0.46, BY1, '#1fa7a0');
    scatter(g, 0.48, 0.98, 30, 3, (x, y, r) => {
      for (let k = 0; k < 3; k++) leaf(g, x, y, M(0.05), M(0.016), r() * 6, k % 2 ? '#127a5a' : '#2bc48a');
      flower(g, x, y, M(0.026), r() < 0.5 ? '#ff6f9f' : '#ffd23d', '#ffffff', 5, r());
      circle(g, x, y, M(0.004), '#ff3c3c');
    });
    // 깃 + 단추
    g.fillStyle = '#17837d';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(FX + s * M(0.1), py(BY1)); g.lineTo(FX + s * M(0.005), py(0.82)); g.lineTo(FX + s * M(0.06), py(0.9)); g.fill(); }
    g.fillStyle = '#f6f5f1'; g.beginPath(); g.moveTo(FX - M(0.05), py(BY1)); g.lineTo(FX + M(0.05), py(BY1)); g.lineTo(FX, py(0.84)); g.fill();
    buttons(g, 0.48, 0.8, 4, '#fff4d6', 0.007);
    // 반바지
    band(g, 0.18, 0.47, '#d9c39a');
    stitch(g, 0, py(0.2), TW, py(0.2), 'rgba(90,60,20,0.4)');
    band(g, 0.44, 0.47, '#bda57a');
    shoes(g, '#ff7fb0', '#ffd23d', 0.035);
  });
  // 꽃목걸이: 목 둘레를 따라 꽃 18송이
  const cols = ['#ff6f9f', '#ffd23d', '#ff9a40', '#ffffff', '#c86bff'];
  const petal = new THREE.SphereGeometry(0.018, 8, 6);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const front = Math.max(0, -Math.cos(a)); // 앞쪽(-z)일수록 아래로 처짐
    const p = V(Math.sin(a) * 0.17, 0.96 - front * 0.1, -Math.cos(a) * 0.17 * (1 + front * 0.12));
    const fl = new THREE.Group();
    fl.position.copy(p);
    fl.lookAt(p.clone().multiplyScalar(2).setY(p.y));
    root.add(fl);
    const cm = lam(cols[i % cols.length]);
    for (let k = 0; k < 5; k++) {
      const b = mesh(petal, cm, Math.cos(k * 1.256) * 0.017, Math.sin(k * 1.256) * 0.017, 0, fl);
      b.scale.set(1, 1, 0.45);
    }
    mesh(new THREE.SphereGeometry(0.008, 6, 4), lam('#ffe14a'), 0, 0, 0.006, fl);
  }
};

// 딸기우유 팩: 몸이 분홍 우유팩(뾰족 지붕), 빨대 꽂힘
BUILD.milk = (root) => {
  const W = 0.36, H = 0.72;
  const side = (front) => canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#fff6f8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff8fb1'; g.fillRect(0, h * 0.42, w, h * 0.58);
    // 물결
    g.fillStyle = '#ff8fb1'; g.beginPath(); g.moveTo(0, h * 0.42);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.42 + Math.sin(x / 22) * 10);
    g.lineTo(w, h * 0.5); g.lineTo(0, h * 0.5); g.fill();
    g.fillStyle = '#fff6f8'; g.beginPath(); g.moveTo(0, h * 0.42 - 2);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.42 + Math.sin(x / 22) * 10 - 2);
    g.lineTo(w, h * 0.3); g.lineTo(0, h * 0.3); g.fill();
    if (front) {
      // 딸기 + 글자
      const sx = w / 2, sy = h * 0.22;
      g.fillStyle = '#e8304f';
      g.beginPath(); g.moveTo(sx, sy + 46); g.bezierCurveTo(sx - 52, sy + 10, sx - 44, sy - 30, sx, sy - 24); g.bezierCurveTo(sx + 44, sy - 30, sx + 52, sy + 10, sx, sy + 46); g.fill();
      const r = rng(1);
      for (let i = 0; i < 14; i++) circle(g, sx + (r() - 0.5) * 60, sy + r() * 50 - 14, 2.5, '#ffe9a0');
      for (let k = -2; k <= 2; k++) leaf(g, sx, sy - 26, 24, 7, -Math.PI / 2 + k * 0.5, '#3fb06a');
      g.font = '56px Jua, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
      g.lineWidth = 10; g.strokeStyle = '#e8456f'; g.lineJoin = 'round';
      g.strokeText('딸기', w / 2, h * 0.62); g.fillText('딸기', w / 2, h * 0.62);
      g.strokeText('우유', w / 2, h * 0.74); g.fillText('우유', w / 2, h * 0.74);
      g.font = '24px Jua, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('200ml', w / 2, h * 0.86);
      // 볼터치 얼굴
      circle(g, w / 2 - 60, h * 0.93, 5, '#7a2a3a'); circle(g, w / 2 + 60, h * 0.93, 5, '#7a2a3a');
    } else {
      g.font = '26px Jua, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8456f';
      g.fillText('STRAWBERRY', w / 2, h * 0.2);
      g.fillStyle = '#ffffff'; g.font = '22px Jua, sans-serif';
      for (let i = 0; i < 5; i++) g.fillText(['원유 80%', '딸기과즙', '냉장 보관', '흔들어서', '드세요 ♥'][i], w / 2, h * 0.58 + i * 32);
    }
  });
  const fT = side(true), bT = side(false);
  const plain = lam('#fff6f8');
  const mats = [lam('#ffffff', { map: bT }), lam('#ffffff', { map: bT }), plain, plain, lam('#ffffff', { map: bT }), lam('#ffffff', { map: fT })];
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z(등), -z(앞)
  const box = mesh(new THREE.BoxGeometry(W, H, W), mats, 0, 0.02 + H / 2, 0, root);
  box.rotation.y = Math.PI; // 앞 그림 면(-z)을 앞으로: 원래 5번(-z)이 앞 → 돌리면 4번이 앞
  box.rotation.y = 0;
  // 지붕 (박공): 앞뒤로 기울어진 두 판 + 꼭대기 접힌 날개
  const roofH = 0.14;
  const roof = new THREE.Shape();
  roof.moveTo(-W / 2, 0); roof.lineTo(W / 2, 0); roof.lineTo(0, roofH); roof.closePath();
  const rg = new THREE.ExtrudeGeometry(roof, { depth: W, bevelEnabled: false });
  rg.translate(0, 0, -W / 2);
  const r1 = mesh(rg, lam('#fff6f8'), 0, 0.02 + H, 0, root);
  r1.rotation.y = Math.PI / 2;
  const fin = mesh(new THREE.BoxGeometry(W, 0.05, 0.012), lam('#ffe1ea'), 0, 0.02 + H + roofH + 0.02, 0, root);
  void fin;
  // 머리가 지붕 위로 쏙 (지붕 가운데를 살짝 낮춤): 머리 밑에 분홍 테두리
  const collar = mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 24), lam('#ff8fb1'), 0, 0.99, 0, root);
  collar.rotation.x = Math.PI / 2;
  // 꺾인 빨대 (왼쪽 위)
  const straw = lam('#ff5f86');
  const s1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), straw, -0.12, 0.98, 0.06, root);
  s1.rotation.z = 0.05;
  const bend = mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 12, Math.PI / 2), straw, -0.15, 1.14, 0.06, root);
  bend.rotation.z = 0;
  const s2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 10), straw, -0.18, 1.14, 0.06, root);
  s2.rotation.z = Math.PI / 2;
  s2.position.set(-0.19, 1.17, 0.06);
  bend.position.set(-0.15, 1.14, 0.06);
  bend.rotation.set(0, 0, Math.PI / 2);
  // 빨대 줄무늬 링
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.02, 10), lam('#ffffff'), -0.12 + 0.0025 * i, 0.86 + i * 0.06, 0.06, root);
};

// 컵케이크: 주름 컵 + 몽글몽글 생크림 + 스프링클 + 체리
BUILD.cupcake = (root) => {
  // 컵 (주름: 반지름을 물결치게)
  const cupTex = canvasTex(512, 128, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#7fd8c4' : '#a9ead9'; g.fillRect(x, 0, 16, h); }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let x = 8; x < w; x += 64) heart(g, x + 16, h / 2, 9, '#ffffff');
  });
  const cup = new THREE.CylinderGeometry(0.225, 0.165, 0.42, 64, 1, true);
  const pos = cup.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(x, z);
    const k = 1 + Math.cos(a * 32) * 0.035;
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  cup.computeVertexNormals();
  mesh(cup, lam('#ffffff', { map: cupTex }), 0, 0.23, 0, root);
  mesh(new THREE.CircleGeometry(0.165, 32), lam('#8ad8c6'), 0, 0.02, 0, root).rotation.x = Math.PI / 2;
  // 빵이 컵 위로 살짝
  mesh(new THREE.CylinderGeometry(0.23, 0.225, 0.04, 40), lam('#e3a35f'), 0, 0.46, 0, root);
  // 생크림: 점점 작아지는 도넛 고리 4단 (분홍) + 소용돌이 끝
  const cream = phong('#ffc2d6', { shininess: 30, specular: '#664' });
  const tiers = [[0.215, 0.065, 0.53], [0.19, 0.06, 0.64], [0.16, 0.055, 0.75], [0.13, 0.05, 0.85], [0.1, 0.045, 0.93]];
  for (const [R, r, y] of tiers) {
    const t = mesh(new THREE.TorusGeometry(R - r * 0.4, r, 14, 48), cream, 0, y, 0, root);
    t.rotation.x = Math.PI / 2;
  }
  for (const [R, , y] of tiers.slice(0, 4)) mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.1, 32), cream, 0, y, 0, root);
  // 스프링클
  const r = rng(12);
  const sc = ['#ff5f86', '#ffd23d', '#5fb4ff', '#7ee07e', '#ffffff', '#c86bff'];
  const sg = new THREE.CapsuleGeometry(0.005, 0.018, 3, 6);
  for (let i = 0; i < 60; i++) {
    const tier = tiers[Math.floor(r() * tiers.length)];
    const a = r() * Math.PI * 2;
    const rad = tier[0] + tier[1] * 0.45;
    const s = mesh(sg, lam(sc[Math.floor(r() * sc.length)]), Math.sin(a) * rad, tier[2] + (r() - 0.3) * tier[1], Math.cos(a) * rad, root);
    s.rotation.set(r() * 3, r() * 3, r() * 3);
    s.castShadow = false;
  }
  // 체리 (앞쪽 어깨 위)
  const cherry = phong('#e0233c', { shininess: 90, specular: '#fff' });
  mesh(new THREE.SphereGeometry(0.05, 18, 14), cherry, -0.1, 1.0, -0.06, root);
  const stem = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), lam('#5a3a1a'), -0.12, 1.07, -0.06, root);
  stem.rotation.z = 0.5;
};

// 병아리: 동글동글 노란 공 + 까만 테두리(만화 느낌) + 얼굴(눈·부리·볼터치) + 손 흔드는 날개 + 삐침 털
// headless = true(B안)면 흰 머리를 숨기고 병아리 공이 캐릭터 전체가 된다
function chick(root, char, headless) {
  const YEL = '#ffe57a', LINE = '#2b2522';
  const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: TOON, ...o });
  const shape = new THREE.Group();
  root.add(shape);
  // 까만 테두리: 같은 모양을 조금 크게, 뒷면만 까맣게 (뒤집힌 껍질)
  const lineM = new THREE.MeshBasicMaterial({ color: LINE, side: THREE.BackSide });
  const outline = (m, k = 0.035) => {
    const o = new THREE.Mesh(m.geometry, lineM);
    o.position.copy(m.position); o.rotation.copy(m.rotation); o.quaternion.copy(m.quaternion);
    m.geometry.computeBoundingSphere();
    o.userData.k = 1 + k / Math.max(0.05, m.geometry.boundingSphere.radius); // 테두리 두께 k(m)
    o.castShadow = false;
    m.parent.add(o);
    return o;
  };
  const add = (geo, mat, x, y, z, parent = shape, k = 0.012) => {
    const m = mesh(geo, mat, x, y, z, parent);
    if (k) m.userData.line = outline(m, k);
    return m;
  };
  // 몸 공: 아래가 살짝 더 통통 (A안 = 머리 밑까지, B안 = 캐릭터 키만큼)
  const H = headless ? 1.08 : 1.0, W = headless ? 0.47 : 0.39;
  const prof = [[0.0001, 0.02], [0.7, 0.05], [0.97, 0.2], [1, 0.4], [0.94, 0.62], [0.76, 0.82], [0.46, 0.95], [0.0001, 1]];
  const pts = smoothPts(prof.map(([r, y]) => [r * W, 0.01 + y * (H - 0.01)]), 60);
  const rAt = (y) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][1] >= y) { const [r0, y0] = pts[i - 1], [r1, y1] = pts[i]; return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1)); }
    return 0;
  };
  const tex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fff09a'); gr.addColorStop(1, '#ffd85a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  add(lathe(pts, 64), toon('#ffffff', { map: tex }), 0, 0, 0, shape, 0.014);
  // 얼굴: 몸 공 앞(-z) 위쪽. a = 옆으로 돈 각도, y = 높이 → 표면 위 점
  const surf = (a, y, out = 0) => { const r = rAt(y) + out; return V(Math.sin(a) * r, y, -Math.cos(a) * r); };
  const faceY = headless ? 0.7 : 0.66;
  const stick = (m, a) => { m.rotation.y = -a; return m; };
  for (const s of [-1, 1]) {
    const a = s * 0.4;
    const ep = surf(a, faceY, 0.004);
    const eye = stick(mesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshBasicMaterial({ color: LINE }), ep.x, ep.y, ep.z, shape), a);
    eye.scale.set(1, 1.1, 0.45);
    const gp = surf(a - s * 0.03, faceY + 0.012, 0.016);
    mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), gp.x, gp.y, gp.z, shape);
    // 볼터치 (눈 바깥 아래)
    const bp = surf(s * 0.66, faceY - 0.06, 0.002);
    const blush = stick(mesh(new THREE.SphereGeometry(0.05, 18, 12), new THREE.MeshBasicMaterial({ color: '#f7a0a6' }), bp.x, bp.y, bp.z, shape), s * 0.62);
    blush.scale.set(1, 0.85, 0.22);
  }
  // 부리: 위·아래 두 쪽 (살짝 벌린 입)
  const beakM = toon('#f3a04a');
  const bp = surf(0, faceY - 0.01, 0.0);
  const up = add(new THREE.SphereGeometry(0.042, 16, 12), beakM, bp.x, bp.y + 0.014, bp.z - 0.014, shape, 0);
  up.scale.set(1, 0.55, 0.75);
  const lo = add(new THREE.SphereGeometry(0.034, 16, 12), toon('#e98a3a'), bp.x, bp.y - 0.018, bp.z - 0.008, shape, 0);
  lo.scale.set(0.9, 0.5, 0.65);
  // 날개: 왼쪽(-x)은 손 흔들기, 오른쪽(+x, 탁구채 쪽)은 살짝 들고
  const wingM = toon(YEL);
  const wings = [];
  for (const s of [-1, 1]) {
    const grp = new THREE.Group();
    const wy = headless ? 0.42 : 0.4;
    grp.position.set(s * (rAt(wy) - 0.02), wy, -0.02);
    shape.add(grp);
    // 날개 뿌리 = 그룹 원점, 날개는 위로 뻗어 있고 그룹을 기울여 바깥으로 벌린다
    const w = add(new THREE.SphereGeometry(0.1, 18, 14), wingM, 0, 0.09, 0, grp, 0.012);
    w.scale.set(0.42, 1, 0.62);
    wings.push(grp);
  }
  // 삐침 털 (꼬불): A안은 머리 뒤쪽 위, B안은 정수리
  const tuftM = toon(YEL);
  const tuft = new THREE.Group();
  if (headless) tuft.position.set(0.02, H - 0.02, 0);
  else tuft.position.set(0.04, H - 0.06, 0.13);
  shape.add(tuft);
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.01, 0.06, 0), V(0.05, 0.1, 0), V(0.09, 0.09, 0), V(0.08, 0.06, 0)]);
  add(new THREE.TubeGeometry(curve, 20, 0.014, 8, false), tuftM, 0, 0, 0, tuft, 0.006);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(-0.03, 0.05, 0), V(-0.06, 0.06, 0)]), 12, 0.011, 8, false), tuftM, 0, 0, 0, tuft, 0.006);
  tuft.rotation.y = headless ? 0.3 : 0.9;
  // 발: 짧고 동그란 주황 발
  for (const s of [-1, 1]) {
    const f = add(new THREE.SphereGeometry(0.05, 14, 10), toon('#f3a04a'), s * 0.1, 0.025, -W * 0.55, shape, 0.008);
    f.scale.set(1.1, 0.45, 1.3);
  }
  // 테두리 크기는 모양을 다 잡은 뒤(scale 바꾼 뒤) 맞춘다
  shape.traverse((m) => { const o = m.userData.line; if (o) o.scale.copy(m.scale).multiplyScalar(o.userData.k); });
  const hit = swingWatch(char);
  let flap = 0, hop = 0, hopV = 0;
  return (t, dt) => {
    if (hit()) { flap = 1; hopV += 2.4; }
    flap = Math.max(0, flap - dt * 2.5);
    hopV += (-hop * 120 - hopV * 9) * dt;
    hop += hopV * dt;
    shape.scale.set(1 - hop * 0.12, 1 + hop * 0.2, 1 - hop * 0.12);
    // 왼쪽 날개는 늘 살랑살랑 손 흔들기, 칠 때는 양쪽 파닥
    // 왼쪽(-x) 날개는 위로 들어 흔들기, 오른쪽은 옆으로 쏙
    wings[0].rotation.z = 0.75 + Math.sin(t * 5) * 0.3 + Math.abs(Math.sin(t * 24)) * flap * 0.5;
    wings[1].rotation.z = -1.5 - Math.abs(Math.sin(t * 24)) * flap * 0.7;
    tuft.rotation.z = Math.sin(t * 3) * 0.12;
  };
}
// 사용자 확정: B안(흰 머리를 숨기고 병아리 한 마리). A안은 chick(root, char, false)
BUILD.chick = (root, char) => chick(root, char, true);
const HIDE_HEAD = new Set(['chick']);

// 곰젤리: 반투명 빨간 젤리 곰 몸 (배·팔·다리), 설탕 반짝
BUILD.gummy = (root) => {
  const jelly = phong('#ff3d5a', { shininess: 120, specular: '#ffffff', emissive: '#6a0010', emissiveIntensity: 0.4, transparent: true, opacity: 0.78 });
  jelly.userData.baseOp = 0.78;
  const core = lam('#ff8a9a', { emissive: '#a01a30', emissiveIntensity: 0.25 });
  // 몸통 (위가 좁은 통통한 모양)
  const pts = smoothPts([[0.0001, 0.08], [0.17, 0.12], [0.225, 0.35], [0.22, 0.6], [0.17, 0.85], [0.12, 0.99], [0.0001, 1.0]], 40);
  mesh(lathe(pts, 40), jelly, 0, 0, 0, root);
  // 속 (안쪽 진한 덩어리 → 깊어 보임)
  const inner = mesh(lathe(pts.map(([r, y]) => [r * 0.6, 0.15 + (y - 0.08) * 0.85]), 24), core, 0, 0, 0, root);
  inner.castShadow = false;
  // 배 볼록
  const belly = mesh(new THREE.SphereGeometry(0.13, 20, 14), jelly, 0, 0.42, -0.12, root);
  belly.scale.set(1, 1.1, 0.6);
  // 팔 (위로 살짝 들고 있음)
  for (const s of [-1, 1]) {
    const a = mesh(new THREE.CapsuleGeometry(0.06, 0.12, 6, 12), jelly, s * 0.23, 0.68, -0.02, root);
    a.rotation.z = s * -0.9;
  }
  // 다리 (앞으로 쭉)
  for (const s of [-1, 1]) {
    const l = mesh(new THREE.CapsuleGeometry(0.075, 0.08, 6, 12), jelly, s * 0.1, 0.09, -0.08, root);
    l.rotation.x = Math.PI / 2 - 0.3;
  }
  // 설탕 알갱이 (작은 흰 점)
  const r = rng(4);
  const sugar = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
  for (let i = 0; i < 70; i++) {
    const p = surfacePoint(r, 0.15, 0.95, 0.215);
    const sg = mesh(new THREE.BoxGeometry(0.008, 0.008, 0.008), sugar, p.x, p.y, p.z, root);
    sg.rotation.set(r() * 3, r() * 3, 0);
    sg.castShadow = false;
  }
};

// 마카롱: 분홍·민트·라벤더 마카롱 세 개가 층층이
BUILD.macaron = (root) => {
  const colors = [['#c9b3f2', '#fff4f0'], ['#9fe3cf', '#fff8e0'], ['#ffb0c8', '#ffffff']];
  const H = 0.32;
  colors.forEach(([shell, cream], i) => {
    const y0 = 0.02 + i * H;
    const sm = phong(shell, { shininess: 15, specular: '#222' });
    // 위·아래 껍질 (납작한 반구)
    for (const up of [1, -1]) {
      const g = new THREE.SphereGeometry(0.23, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      const s = mesh(g, sm, 0, y0 + H / 2 + up * 0.035, 0, root);
      s.scale.set(1, 0.48, 1);
      if (up < 0) s.rotation.x = Math.PI;
      // 피에 (울퉁불퉁 테두리)
      const foot = mesh(new THREE.TorusGeometry(0.215, 0.022, 6, 60), sm, 0, y0 + H / 2 + up * 0.03, 0, root);
      foot.rotation.x = Math.PI / 2;
      const p = foot.geometry.attributes.position;
      const rr = rng(i * 7 + (up > 0 ? 1 : 2));
      for (let k = 0; k < p.count; k++) { const f = 1 + (rr() - 0.5) * 0.12; p.setXYZ(k, p.getX(k) * (1 + (f - 1) * 0.1), p.getY(k) * (1 + (f - 1) * 0.1), p.getZ(k) * f); }
      foot.geometry.computeVertexNormals();
    }
    // 크림 (살짝 삐져나옴)
    mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 40), lam(cream), 0, y0 + H / 2, 0, root);
  });
  // 맨 위 아이싱 하트
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.03); hs.bezierCurveTo(-0.04, 0, -0.025, 0.03, 0, 0.015); hs.bezierCurveTo(0.025, 0.03, 0.04, 0, 0, -0.03);
  const h = mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.008, bevelEnabled: false }), lam('#ffffff'), 0, 0.86, -0.19, root);
  h.rotation.x = -0.5;
};

/* ═════════════ 전설: 움직이는 효과 ═════════════ */

// 영웅 망토: 어깨를 감싸고 아래로 넓게 퍼지는 주름 망토(바깥 빨강·안 금색), 세운 깃, 가슴을 잇는 금 사슬.
// 움직이면 뒤로 날리고, 휘두르면 휙 + 금빛 별. 몸은 파랑 영웅복 + 입체 금 방패 문장
BUILD.cape = (root, char) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#2a4fd0');
    // 근육 음영: 가슴 두 덩이 + 배 왕(王)자 (아주 은은하게)
    const lt = 'rgba(255,255,255,0.13)', dk = 'rgba(0,10,60,0.22)';
    for (const sd of [-1, 1]) {
      const gr = g.createRadialGradient(FX + sd * M(0.075), py(0.8), M(0.01), FX + sd * M(0.075), py(0.8), M(0.09));
      gr.addColorStop(0, lt); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(FX - M(0.2), py(0.92), M(0.4), M(0.25));
      g.strokeStyle = dk; g.lineWidth = M(0.006);
      g.beginPath(); g.ellipse(FX + sd * M(0.075), py(0.79), M(0.08), M(0.05), 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
    g.strokeStyle = dk; g.lineWidth = M(0.005);
    g.beginPath(); g.moveTo(FX, py(0.74)); g.lineTo(FX, py(0.53)); g.stroke();
    for (const y of [0.68, 0.61]) { g.beginPath(); g.moveTo(FX - M(0.06), py(y)); g.quadraticCurveTo(FX, py(y - 0.012), FX + M(0.06), py(y)); g.stroke(); }
    // 옆구리 어두운 띠 (몸이 날씬해 보이게)
    atSides((x) => { const gr = g.createLinearGradient(x - M(0.08), 0, x + M(0.08), 0); gr.addColorStop(0, 'rgba(0,0,40,0)'); gr.addColorStop(0.5, 'rgba(0,0,40,0.18)'); gr.addColorStop(1, 'rgba(0,0,40,0)'); g.fillStyle = gr; g.fillRect(x - M(0.08), 0, M(0.16), TH); });
    // 빨간 팬츠 + 빨간 부츠 (톱니 무늬)
    band(g, 0.36, 0.5, '#e0333c');
    band(g, BY0, 0.14, '#e0333c');
    g.fillStyle = '#e0333c';
    for (let x = 0; x < TW; x += M(0.05)) { g.beginPath(); g.moveTo(x, py(0.14)); g.lineTo(x + M(0.025), py(0.17)); g.lineTo(x + M(0.05), py(0.14)); g.fill(); }
  }, (t) => phong('#ffffff', { map: t, shininess: 50, specular: '#445' }));
  const goldM = phong('#ffcf2e', { shininess: 140, specular: '#fff6c8', emissive: '#4a2c00', envMap: envCube('studio'), combine: THREE.MixOperation, reflectivity: 0.18 });
  const redM = phong('#e0333c', { shininess: 60, specular: '#844' });
  // 금 벨트 + 큰 버클 (입체)
  const belt = mesh(new THREE.TorusGeometry(0.185, 0.016, 8, 56), goldM, 0, 0.49, 0, root);
  belt.rotation.x = Math.PI / 2;
  const bk = new THREE.Shape(); bk.absellipse(0, 0, 0.034, 0.026, 0, Math.PI * 2, false);
  const bkGeo = new THREE.ExtrudeGeometry(bk, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 24 });
  mesh(bkGeo, goldM, 0, 0.49, -0.2, root).rotation.y = Math.PI;
  mesh(new THREE.SphereGeometry(0.012, 12, 8), phong('#e0233c', { shininess: 200, specular: '#fff' }), 0, 0.49, -0.214, root).scale.set(1, 1, 0.5);
  // 부츠 위 접힌 테
  const cuff = mesh(new THREE.TorusGeometry(0.184, 0.014, 8, 56), redM, 0, 0.165, 0, root);
  cuff.rotation.x = Math.PI / 2;
  // 가슴 문장: 입체 금 방패 + 빨간 탁구채
  const crest = new THREE.Group();
  crest.position.set(0, 0.79, -0.19);
  crest.rotation.x = 0.18;
  root.add(crest);
  const sh = new THREE.Shape();
  sh.moveTo(-0.07, 0.055); sh.lineTo(0.07, 0.055); sh.quadraticCurveTo(0.072, -0.01, 0, -0.075); sh.quadraticCurveTo(-0.072, -0.01, -0.07, 0.055);
  mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, curveSegments: 16 }), goldM, 0, 0, 0, crest).rotation.y = Math.PI;
  const inner = new THREE.Shape();
  inner.moveTo(-0.055, 0.042); inner.lineTo(0.055, 0.042); inner.quadraticCurveTo(0.056, -0.005, 0, -0.058); inner.quadraticCurveTo(-0.056, -0.005, -0.055, 0.042);
  mesh(new THREE.ShapeGeometry(inner), phong('#1d3aa8', { shininess: 80 }), 0, 0, -0.0165, crest).rotation.y = Math.PI;
  const pd = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 24), redM, -0.006, 0.008, -0.02, crest);
  pd.rotation.x = Math.PI / 2;
  const hd = mesh(new THREE.BoxGeometry(0.01, 0.034, 0.008), phong('#8a5430'), 0.016, -0.026, -0.02, crest);
  hd.rotation.z = 0.6;
  // 망토: 어깨를 감싸고(위), 아래로 넓게 펴진다. 세로 주름
  const W = 0.56, H = 0.88, NX = 18, NY = 22;
  const geo = new THREE.PlaneGeometry(W, H, NX, NY);
  geo.translate(0, -H / 2, 0);
  const base = geo.attributes.position.array.slice();
  const outTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#b0141f'); gr.addColorStop(0.3, '#e1263a'); gr.addColorStop(1, '#c81b2e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // 천 결
    const r = rng(19);
    for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(80,0,10,0.07)'; g.fillRect(r() * w, r() * h, 1, 10 + r() * 30); }
    // 아래 금 테두리 두 줄 + 옆 테두리
    g.fillStyle = '#ffcf2e'; g.fillRect(0, h - 14, w, 9); g.fillRect(0, h - 22, w, 3);
    g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
  });
  const outM = phong('#ffffff', { map: outTex, side: THREE.FrontSide, shininess: 70, specular: '#a55' });
  const inM = phong('#eaa91c', { side: THREE.BackSide, shininess: 90, specular: '#fff0b0' });
  const capeRoot = new THREE.Group();
  capeRoot.position.set(0, 0.955, 0);
  root.add(capeRoot);
  mesh(geo, outM, 0, 0, 0, capeRoot);
  mesh(geo, inM, 0, 0, 0, capeRoot);
  // 세운 깃: 목 뒤를 감싸며 위로 벌어짐 (바깥 빨강·안 금색)
  const collarGeo = new THREE.CylinderGeometry(0.215, 0.15, 0.09, 32, 1, true, Math.PI / 2 - 1.05 + Math.PI, 2.1);
  collarGeo.rotateY(Math.PI);
  mesh(collarGeo, redM, 0, 0.995, 0.01, root);
  mesh(collarGeo, inM, 0, 0.995, 0.01, root);
  // 어깨 금 고정쇠(보석) + 가슴을 잇는 금 사슬
  const gemM = phong('#ff2f4a', { shininess: 220, specular: '#ffffff', flatShading: true, emissive: '#500010' });
  for (const sd of [-1, 1]) {
    const c = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 24), goldM, sd * 0.14, 0.925, -0.1, root);
    c.rotation.set(Math.PI / 2 - 0.5, 0, sd * 0.5);
    const gm = mesh(new THREE.OctahedronGeometry(0.016, 0), gemM, sd * 0.143, 0.928, -0.112, root);
    gm.scale.set(1, 1, 0.6);
  }
  const chain = new THREE.CatmullRomCurve3([V(-0.14, 0.925, -0.1), V(-0.06, 0.885, -0.168), V(0, 0.875, -0.178), V(0.06, 0.885, -0.168), V(0.14, 0.925, -0.1)]);
  for (let i = 1; i < 22; i++) {
    const p = chain.getPoint(i / 22);
    const l = mesh(new THREE.TorusGeometry(0.0085, 0.003, 5, 10), goldM, p.x, p.y, p.z, root);
    l.rotation.set(0, i % 2 ? Math.PI / 2 : 0, 0.3);
  }
  const hit = swingWatch(char), motion = motionWatch(char);
  const fx = particles(root, 'star', 30);
  let lift = 0, kick = 0, nextStar = 0;
  const rr = rng(77);
  const q = new THREE.Quaternion();
  const sm = (x) => x * x * (3 - 2 * x);
  return (t, dt) => {
    const v = motion(dt);
    const local = v.clone().applyQuaternion(char.group.getWorldQuaternion(q).invert());
    const speed = Math.min(2, Math.hypot(local.x, local.z));
    if (hit()) kick = 1;
    kick = Math.max(0, kick - dt * 2.2);
    lift += (Math.min(1, speed * 0.7 + kick * 0.9) - lift) * Math.min(1, dt * 5);
    const side = Math.max(-1, Math.min(1, -local.x * 0.6));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      const u = bx / (W / 2); // -1 ~ 1
      const d = -by / H; // 0 위 ~ 1 아래
      // 위: 어깨를 감싸는 곡면 (등 쪽 반 바퀴) / 아래: 넓게 늘어진 천
      const a = u * 1.25;
      const wx = Math.sin(a) * 0.205, wz = Math.cos(a) * 0.205;
      const fxx = u * 0.29, fz = 0.24 - (1 - u * u) * 0.025;
      const k = sm(Math.min(1, d / 0.45));
      let x = wx + (fxx - wx) * k;
      let z = wz + (fz - wz) * k;
      // 세로 주름 (아래로 갈수록 깊게) + 살랑
      z += Math.sin(u * Math.PI * 3.5) * 0.03 * k + Math.sin(t * (5 + lift * 6) + d * 5 + u * 3) * 0.02 * d * (0.4 + lift * 1.6);
      // 뒤로 날림 (위쪽 줄을 축으로)
      const ang = d * d * (0.08 + lift * 1.05);
      let y = by * Math.cos(ang);
      z += -by * Math.sin(ang);
      x += side * d * d * 0.12;
      // 아래쪽 가장자리 펄럭
      z += Math.sin(t * 7 + u * 9) * 0.012 * d * d * (0.5 + lift);
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    nextStar -= dt;
    if (lift > 0.35 && nextStar <= 0) {
      nextStar = 0.06;
      const x = (rr() - 0.5) * W;
      const pt = V(x, 0.955 - H * Math.cos(lift) * 0.9, 0.24 + H * Math.sin(lift) * 0.8);
      fx.spawn(pt, V((rr() - 0.5) * 0.2, 0.15 + rr() * 0.2, 0.3), 0.7, 0.05 + rr() * 0.03, '#ffe27a', 2);
    }
    fx.update(dt, 0, 1.5);
  };
};

// 오리 튜브: 둥둥 떠 있고, 칠 때마다 출렁 + 물방울. 발밑에 물결 고리
BUILD.duck = (root, char) => {
  skin(root, (g) => {
    // 복고풍 줄무늬 수영복
    band(g, BY0, BY1, '#f6f5f1');
    band(g, 0.3, 0.92, '#ffffff');
    for (let y = 0.3; y < 0.92; y += 0.06) band(g, y, y + 0.03, '#2f8fe0');
    atSides((x) => { g.fillStyle = '#f6f5f1'; g.beginPath(); g.ellipse(x, py(BY1), M(0.06), M(0.12), 0, 0, Math.PI); g.fill(); });
    neckline(g, 0.07, 0.07, '#f6f5f1');
    band(g, 0.3, 0.34, '#e0333c');
    shoes(g, '#ffd23d', '#ff9a20', 0.03);
  });
  const tube = new THREE.Group();
  tube.position.y = 0.42;
  root.add(tube);
  const yellow = phong('#ffd21f', { shininess: 110, specular: '#ffffff', emissive: '#4a3000', emissiveIntensity: 0.35 });
  const torus = mesh(new THREE.TorusGeometry(0.26, 0.085, 22, 64), yellow, 0, 0, 0, tube);
  torus.rotation.x = Math.PI / 2;
  // 튜브 가운데 이음매 (바깥 둘레 얇은 줄) + 바람 넣는 꼭지 (오른쪽)
  const seam = mesh(new THREE.TorusGeometry(0.345, 0.004, 6, 80), phong('#ffe680', { shininess: 80 }), 0, 0, 0, tube);
  seam.rotation.x = Math.PI / 2;
  const valve = new THREE.Group();
  valve.position.set(0.3, 0.06, 0.12);
  valve.lookAt(V(0.6, 0.3, 0.24));
  tube.add(valve);
  const valveM = phong('#fff4c0', { shininess: 120, specular: '#ffffff' });
  mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.025, 14), valveM, 0, 0, 0.012, valve).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.008, 14), valveM, 0, 0, 0.028, valve).rotation.x = Math.PI / 2;
  // 오리 머리 (앞)
  const duck = new THREE.Group();
  duck.position.set(0, 0.03, -0.3);
  tube.add(duck);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.068, 0.12, 18), yellow, 0, 0.05, 0, duck);
  neck.rotation.x = 0.2;
  const head = mesh(new THREE.SphereGeometry(0.088, 24, 18), yellow, 0, 0.15, -0.01, duck);
  head.scale.set(1, 0.95, 1.03);
  // 부리: 위·아래 두 쪽 (살짝 웃는 입)
  const beakM = phong('#ff8a1a', { shininess: 90, specular: '#ffe0c0' });
  const up = mesh(new THREE.SphereGeometry(0.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), beakM, 0, 0.135, -0.085, duck);
  up.scale.set(1.15, 0.45, 1.1);
  const lo = mesh(new THREE.SphereGeometry(0.044, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), phong('#f07012', { shininess: 60 }), 0, 0.132, -0.08, duck);
  lo.scale.set(1.05, 0.35, 1.0);
  for (const sd of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.019, 12, 10), lam('#ffffff'), sd * 0.04, 0.182, -0.068, duck);
    mesh(new THREE.SphereGeometry(0.012, 10, 8), phong('#1a1a1a', { shininess: 120, specular: '#ffffff' }), sd * 0.043, 0.184, -0.083, duck);
    mesh(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), sd * 0.046, 0.189, -0.094, duck);
    mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb0b0' }), sd * 0.068, 0.142, -0.055, duck).scale.set(1, 0.6, 0.5);
  }
  // 머리 위 깃털 세 가닥 (말려 올라감)
  for (let i = -1; i <= 1; i++) {
    const c = mesh(new THREE.SphereGeometry(0.014, 10, 8), yellow, i * 0.014, 0.25 - Math.abs(i) * 0.006, 0.01, duck);
    c.scale.set(0.7, 2.2, 0.7);
    c.rotation.set(0.45, 0, -i * 0.5);
  }
  // 날개 (튜브 양옆, 깃 세 겹)
  const wings = [];
  for (const sd of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sd * 0.325, 0.07, 0.02);
    w.rotation.set(0, 0, sd * -0.25);
    tube.add(w);
    const wb = mesh(new THREE.SphereGeometry(0.075, 18, 14), yellow, 0, 0, 0, w);
    wb.scale.set(0.42, 0.62, 1.2);
    // 깃 끝 세 갈래 (뒤쪽으로 갈수록 위로)
    for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.SphereGeometry(0.032, 12, 8), yellow, sd * 0.004, 0.012 + k * 0.016, 0.07 + k * 0.016, w);
      f.scale.set(0.42, 0.6, 1.4);
      f.rotation.x = 0.5 + k * 0.25;
    }
    wings.push(w);
  }
  // 꼬리 (뒤, 위로 뾰족 치켜든 깃)
  const tail = new THREE.Group();
  tail.position.set(0, 0.05, 0.33);
  tube.add(tail);
  const tb = mesh(new THREE.SphereGeometry(0.075, 18, 12), yellow, 0, 0.01, 0, tail);
  tb.scale.set(1, 0.8, 1.1);
  const tip = mesh(new THREE.SphereGeometry(0.05, 16, 12), yellow, 0, 0.075, 0.05, tail);
  tip.scale.set(0.75, 1.5, 0.55);
  tip.rotation.x = -0.6;
  // 물결 고리 (발밑, 퍼지며 사라짐)
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    m.userData.fx = true;
    root.add(m);
    return m;
  });
  const hit = swingWatch(char);
  const drops = particles(root, 'drop', 40, false);
  const rr = rng(3);
  let wob = 0, wobV = 0, sq = 0;
  return (t, dt) => {
    if (hit()) {
      wobV += 9; sq = 1;
      for (let i = 0; i < 12; i++) {
        const a = rr() * Math.PI * 2;
        drops.spawn(V(Math.sin(a) * 0.3, 0.45, Math.cos(a) * 0.3), V(Math.sin(a) * (0.4 + rr() * 0.4), 0.9 + rr() * 0.8, Math.cos(a) * (0.4 + rr() * 0.4)), 0.8, 0.035 + rr() * 0.02);
      }
    }
    // 스프링 (출렁)
    wobV += (-wob * 60 - wobV * 5) * dt;
    wob += wobV * dt;
    sq = Math.max(0, sq - dt * 3);
    tube.position.y = 0.42 + Math.sin(t * 2.4) * 0.018 + wob * 0.02;
    tube.rotation.z = Math.sin(t * 1.7) * 0.05 + wob * 0.08;
    tube.rotation.x = Math.sin(t * 1.3 + 1) * 0.04 + wob * 0.05;
    torus.scale.set(1 + sq * 0.06, 1 + sq * 0.06, 1 - sq * 0.12);
    duck.rotation.x = Math.sin(t * 3) * 0.08 - wob * 0.15;
    duck.rotation.y = Math.sin(t * 1.1) * 0.2;
    wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.25 + Math.max(0, wob) * 0.6 + Math.sin(t * 2.4 + i) * 0.06); }); // 날개 끝이 바깥으로 파닥
    tail.rotation.x = Math.sin(t * 5) * 0.12 - wob * 0.2;
    rings.forEach((m, i) => {
      const k = ((t * 0.5 + i / 3) % 1);
      m.scale.setScalar(0.25 + k * 0.45);
      m.material.opacity = 0.45 * (1 - k);
    });
    drops.update(dt, 3.2);
  };
};

// 미러볼 무대 의상: 하나하나 기울어진 거울 조각이 무대 조명을 비춘다. 뒤로 펼친 반짝이 깃털 깃,
// 몸에서 바닥으로 뻗는 색 빛줄기와 빙글 도는 조명 점. 칠 때 번쩍 + 반짝이 폭발
BUILD.mirror = (root, char) => {
  // 거울 조각: 같은 격자로 색(밝기·금색 줄)·기울기(normal)·반짝 조각(emissive) 세 장을 그린다
  const s = M(0.021);
  const nx = Math.round(TW / s), sx = TW / nx; // 가로로 딱 맞게 (이음매 없이)
  const gold = (y) => (y > py(0.515) && y < py(0.465)) || y > py(0.105);
  const tiles = [];
  {
    const r = rng(8);
    for (let y = 0; y < TH; y += sx) for (let i = 0; i < nx; i++) tiles.push({ x: i * sx, y, v: r(), tx: r() * 2 - 1, ty: r() * 2 - 1, sp: r() });
  }
  const colTex = bodyTex((g) => {
    g.fillStyle = '#2a2633'; g.fillRect(0, 0, TW, TH); // 줄눈
    for (const t of tiles) {
      const gd = gold(t.y + sx / 2);
      const l = 68 + Math.floor(t.v * 28);
      g.fillStyle = gd ? `hsl(${42 + t.v * 8},${70 + t.v * 20}%,${45 + t.v * 25}%)` : `hsl(${215 + t.v * 30},${8 + t.v * 12}%,${l}%)`;
      g.fillRect(t.x + 1.5, t.y + 1.5, sx - 3, sx - 3);
      // 조각 위쪽 모서리 하이라이트
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(t.x + 1.5, t.y + 1.5, sx - 3, 2);
    }
  });
  const nrmTex = bodyTex((g) => {
    g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, TW, TH);
    for (const t of tiles) {
      g.fillStyle = `rgb(${Math.round(128 + t.tx * 70)},${Math.round(128 + t.ty * 70)},230)`;
      g.fillRect(t.x + 1.5, t.y + 1.5, sx - 3, sx - 3);
    }
  });
  nrmTex.colorSpace = THREE.NoColorSpace;
  const emTex = bodyTex((g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, TW, TH);
    for (const t of tiles) if (t.sp > 0.9) {
      g.fillStyle = t.sp > 0.97 ? '#ffffff' : `hsl(${Math.floor(t.sp * 3600) % 360},90%,70%)`;
      g.fillRect(t.x + 2, t.y + 2, sx - 4, sx - 4);
    }
  });
  const disco = envCube('disco');
  const suit = skin(root, () => {}, () => phong('#ffffff', {
    map: colTex, normalMap: nrmTex, normalScale: new THREE.Vector2(1, 1),
    envMap: disco, combine: THREE.MixOperation, reflectivity: 0.38,
    shininess: 160, specular: '#ffffff', emissive: '#ffffff', emissiveMap: emTex, emissiveIntensity: 0.6,
  }));
  const mat = suit.material;
  // 어깨: 각진 거울 뽕
  const shoulderM = phong('#e4e8f2', { shininess: 180, specular: '#ffffff', flatShading: true, envMap: disco, combine: THREE.MixOperation, reflectivity: 0.55 });
  for (const sd of [-1, 1]) {
    const sh = mesh(new THREE.IcosahedronGeometry(0.075, 1), shoulderM, sd * 0.165, 0.865, 0.005, root);
    sh.scale.set(1, 0.72, 1);
  }
  // 금 벨트 + 큰 보석 버클
  const goldM = phong('#f0c23a', { shininess: 140, specular: '#fff3c0', envMap: envCube('studio'), combine: THREE.MixOperation, reflectivity: 0.25 });
  const belt = mesh(new THREE.TorusGeometry(0.184, 0.014, 8, 56), goldM, 0, 0.49, 0, root);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 1, 1.4);
  const gemM = phong('#ff4fa3', { shininess: 200, specular: '#ffffff', flatShading: true, emissive: '#ff2f8a', emissiveIntensity: 0.35, envMap: disco, combine: THREE.MixOperation, reflectivity: 0.4 });
  const gem = mesh(new THREE.OctahedronGeometry(0.034, 0), gemM, 0, 0.49, -0.192, root);
  gem.scale.set(1, 0.85, 0.5);
  mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 20), goldM, 0, 0.49, -0.19, root);
  // 목 둘레 보석 줄
  const stoneM = phong('#ffffff', { shininess: 220, specular: '#ffffff', flatShading: true, emissive: '#cfd8ff', emissiveIntensity: 0.45, envMap: disco, combine: THREE.MixOperation, reflectivity: 0.5 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    mesh(new THREE.OctahedronGeometry(0.013, 0), stoneM, Math.sin(a) * 0.15, 0.975, Math.cos(a) * 0.15, root);
  }
  // 등 뒤로 펼친 반짝이 깃털 깃 (무대 의상)
  const featherTex = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, '#f0c23a'); gr.addColorStop(0.45, '#ff7ac0'); gr.addColorStop(0.85, '#c9a6ff'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(w * 1.05, h * 0.6, w * 0.95, h * 0.15, w / 2, 0); g.bezierCurveTo(w * 0.05, h * 0.15, -w * 0.05, h * 0.6, w / 2, h); g.fill();
    // 깃털 결 + 가운데 깃대
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2;
    for (let y = 12; y < h - 10; y += 7) { g.beginPath(); g.moveTo(w / 2, y + 6); g.lineTo(6, y - 4); g.moveTo(w / 2, y + 6); g.lineTo(w - 6, y - 4); g.stroke(); }
    g.strokeStyle = '#fff6d0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 6); g.stroke();
    const r = rng(12);
    for (let k = 0; k < 40; k++) circle(g, w * 0.25 + r() * w * 0.5, r() * h * 0.9, 1 + r() * 1.5, 'rgba(255,255,255,0.9)');
  });
  const featherM = phong('#ffffff', { map: featherTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, shininess: 80, specular: '#ffffff', emissive: '#ffffff', emissiveMap: featherTex, emissiveIntensity: 0.25 });
  const fan = new THREE.Group();
  fan.position.set(0, 0.93, 0.13);
  root.add(fan);
  const feathers = [];
  for (let i = 0; i < 9; i++) {
    const k = (i - 4) / 4; // -1 ~ 1
    const len = 0.34 - Math.abs(k) * 0.08;
    const geo = new THREE.PlaneGeometry(0.075, len, 1, 4);
    geo.translate(0, len / 2, 0);
    // 깃털을 살짝 휘게 (끝이 뒤로)
    const p = geo.attributes.position;
    for (let j = 0; j < p.count; j++) { const yy = p.getY(j) / len; p.setZ(j, yy * yy * 0.06); }
    geo.computeVertexNormals();
    const piv = new THREE.Group();
    piv.rotation.set(-0.35, 0, -k * 1.15);
    piv.position.set(Math.sin(k * 1.1) * 0.05, 0, Math.abs(k) * -0.02);
    fan.add(piv);
    const f = mesh(geo, featherM, 0, 0, 0, piv);
    f.castShadow = false;
    feathers.push(piv);
  }
  // 몸에서 바닥으로 뻗는 색 빛줄기 + 바닥 조명 점 (빙글빙글)
  const beamTex = canvasTex(4, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const spotTex = sprite('dot');
  const spotCols = ['#ff5f86', '#5fb4ff', '#7ee07e', '#ffd23d', '#c86bff', '#ff9a40'];
  const UP = V(0, 1, 0);
  const lights = spotCols.map((c) => {
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: c, map: spotTex, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    spot.rotation.x = -Math.PI / 2;
    spot.userData.fx = true;
    root.add(spot);
    const beamGeo = new THREE.CylinderGeometry(0.003, 0.028, 1, 10, 1, true);
    beamGeo.translate(0, -0.5, 0); // 위 끝 = 원점
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, map: beamTex, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.userData.fx = true;
    root.add(beam);
    return { spot, beam };
  });
  const fx = particles(root, 'spark', 46);
  const hit = swingWatch(char);
  const rr = rng(5);
  let next = 0, burst = 0;
  const from = V(0, 0, 0), to = V(0, 0, 0), dir = V(0, 0, 0);
  return (t, dt) => {
    if (hit()) {
      burst = 1;
      for (let i = 0; i < 18; i++) fx.spawn(surfacePoint(rr, 0.2, 0.95, 0.23), V((rr() - 0.5) * 0.8, rr() * 0.7, (rr() - 0.5) * 0.8), 0.6, 0.08 + rr() * 0.07, i % 3 ? '#ffffff' : `hsl(${Math.floor(rr() * 360)},100%,78%)`, 3);
    }
    burst = Math.max(0, burst - dt * 2);
    // 반짝 조각이 천천히 돌며 무지개 빛
    mat.emissive.setHSL((t * 0.15) % 1, 0.7, 0.65);
    mat.emissiveIntensity = 0.5 + Math.sin(t * 6) * 0.2 + burst * 0.9;
    emTex.offset.x = (t * 0.04) % 1;
    mat.reflectivity = 0.38 + burst * 0.3;
    shoulderM.emissive.setScalar(0.08 + burst * 0.45);
    gemM.emissiveIntensity = 0.35 + Math.sin(t * 3) * 0.15 + burst;
    feathers.forEach((f, i) => { f.rotation.x = -0.35 + Math.sin(t * 2.2 + i * 0.6) * 0.04 - burst * 0.12; });
    next -= dt;
    if (next <= 0) {
      next = 0.045;
      fx.spawn(surfacePoint(rr, 0.12, 0.98, 0.2), V(0, 0.03, 0), 0.45, 0.05 + rr() * 0.05, rr() < 0.5 ? '#ffffff' : `hsl(${Math.floor(rr() * 360)},100%,80%)`, 4);
    }
    fx.update(dt);
    lights.forEach(({ spot, beam }, i) => {
      const a = t * 0.9 + (i / lights.length) * Math.PI * 2;
      const rad = 0.5 + Math.sin(t * 0.7 + i) * 0.15;
      to.set(Math.cos(a) * rad, 0.008, Math.sin(a) * rad);
      spot.position.copy(to);
      const pulse = 0.55 + Math.sin(t * 4 + i * 2) * 0.25 + burst * 0.3;
      spot.material.opacity = pulse;
      spot.scale.setScalar(1 + burst * 0.4);
      // 빛줄기: 몸 가운데 높이의 거울에서 바닥 점으로
      from.set(Math.cos(a) * 0.19, 0.62, Math.sin(a) * 0.19);
      dir.subVectors(to, from);
      const len = dir.length();
      beam.position.copy(from);
      beam.quaternion.setFromUnitVectors(UP, dir.multiplyScalar(-1 / len));
      beam.scale.set(1, len, 1);
      beam.material.opacity = 0.04 + pulse * 0.06;
    });
  };
};

// 기사 갑옷: 판금을 겹겹이 (가슴판 능선·허리 판·사슬 치마), 큰 어깨 갑옷, 가슴의 금 문장,
// 허리에 늘어진 빨간 천과 왼쪽 허리의 칼. 빛줄기가 주기적으로 쓱, 휘두르면 번쩍 + 천이 휙
BUILD.knight = (root, char) => {
  const studio = envCube('steel');
  const brushed = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d4dae4'; g.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,70,90,0.12)'; g.fillRect(r() * w, r() * h, 1, 6 + r() * 30); }
  });
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  brushed.repeat.set(3, 1);
  const steel = phong('#ffffff', { map: brushed, shininess: 120, specular: '#ffffff', envMap: studio, combine: THREE.MixOperation, reflectivity: 0.5 });
  const dark = phong('#4a505c', { shininess: 60, specular: '#889' });
  const trim = phong('#ffbf1f', { shininess: 140, specular: '#fff3c0', emissive: '#4a2c00', envMap: envCube('studio'), combine: THREE.MixOperation, reflectivity: 0.18 });
  const rivetM = phong('#f4f6fb', { shininess: 160, specular: '#ffffff' });
  // 속(빈틈이 비지 않게)
  mesh(new THREE.CapsuleGeometry(0.165, 0.62, 6, 20), dark, 0, 0.5, 0, root);
  // 사슬 치마 (아래)
  const mailTex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#3d424d'; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h + 8; y += 6, row++) for (let x = row % 2 ? 4 : 0; x < w + 8; x += 8) {
      g.strokeStyle = '#aab1bf'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 3.2, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    }
  });
  mailTex.wrapS = mailTex.wrapT = THREE.RepeatWrapping;
  mailTex.repeat.set(10, 4);
  const mailM = phong('#ffffff', { map: mailTex, shininess: 90, specular: '#cfd6e6', envMap: studio, combine: THREE.MixOperation, reflectivity: 0.15 });
  mesh(lathe(smoothPts([[0.0001, 0.015], [0.12, 0.03], [0.195, 0.1], [0.2, 0.2], [0.186, 0.3]], 24), 40), mailM, 0, 0, 0, root);
  // 허리 판 3겹 (위 판이 아래 판을 덮는다)
  const lame = (yt, yb, rt, rb) => lathe([[rb - 0.004, yb - 0.004], [rb + 0.005, yb], [rb, yb + 0.006], [rt, yt - 0.004], [rt - 0.006, yt + 0.002]], 48); // 아래→위 순서여야 겉면이 밖을 본다
  for (let i = 0; i < 3; i++) {
    const yt = 0.47 - i * 0.055, yb = yt - 0.07;
    mesh(lame(yt, yb, 0.18 + i * 0.004, 0.196 + i * 0.006), steel, 0, 0, 0, root);
    // 앞쪽 리벳
    for (const a of [-0.5, 0.5]) mesh(new THREE.SphereGeometry(0.007, 8, 6), rivetM, Math.sin(Math.PI + a) * (0.19 + i * 0.006), yb + 0.012, Math.cos(Math.PI + a) * (0.19 + i * 0.006), root);
  }
  // 가슴판: 가슴이 불룩하고, 앞 가운데 능선이 선다
  const chestGeo = lathe(smoothPts([[0.176, 0.47], [0.192, 0.56], [0.208, 0.7], [0.2, 0.8], [0.178, 0.88], [0.15, 0.93]], 30), 64);
  {
    const p = chestGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, -z); // 0 = 앞 가운데
      const h = Math.max(0, Math.min(1, (y - 0.5) / 0.12)) * Math.max(0, Math.min(1, (0.92 - y) / 0.1));
      const ab = Math.PI - Math.abs(a); // 0 = 등 가운데
      const push = 0.014 * Math.exp(-((a / 0.22) ** 2)) * h + 0.006 * Math.exp(-((a / 0.9) ** 2)) * h + 0.006 * Math.exp(-((ab / 0.18) ** 2)) * h;
      const rad = Math.hypot(x, z);
      if (rad > 1e-5) { p.setX(i, x * (1 + push / rad)); p.setZ(i, z * (1 + push / rad)); }
    }
    chestGeo.computeVertexNormals();
  }
  const chest = mesh(chestGeo, steel, 0, 0, 0, root);
  void chest;
  // 가슴판 아래·위 금 테두리
  const ringAt = (y, r, tube = 0.008, sz = 1) => { const m = mesh(new THREE.TorusGeometry(r, tube, 8, 56), trim, 0, y, 0, root); m.rotation.x = Math.PI / 2; m.scale.set(1, sz, 1); return m; };
  ringAt(0.475, 0.178);
  // 목 보호대 (두 겹)
  mesh(lathe([[0.15, 0.915], [0.162, 0.93], [0.15, 0.965], [0.12, 0.985]], 40), steel, 0, 0, 0, root);
  ringAt(0.93, 0.158, 0.007);
  mesh(lathe([[0.125, 0.96], [0.135, 0.97], [0.125, 1.0], [0.105, 1.015]], 40), steel, 0, 0, 0, root);
  // 가슴 문장: 왕관 + 엇갈린 탁구채 (금, 입체)
  const crest = new THREE.Group();
  crest.position.set(0, 0.745, -0.222);
  crest.rotation.x = 0.12;
  root.add(crest);
  const ex = (shape, d = 0.008) => new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 16 });
  for (const sd of [-1, 1]) {
    const pdl = new THREE.Group();
    pdl.rotation.z = sd * 0.6;
    crest.add(pdl);
    const blade = new THREE.Shape(); blade.absarc(0, 0.035, 0.026, 0, Math.PI * 2, false);
    mesh(ex(blade), trim, 0, 0, -0.006, pdl);
    mesh(new THREE.BoxGeometry(0.01, 0.045, 0.01), trim, 0, -0.015, 0, pdl);
  }
  const cr = new THREE.Shape();
  cr.moveTo(-0.04, 0.07); cr.lineTo(-0.04, 0.1); cr.lineTo(-0.02, 0.085); cr.lineTo(0, 0.11); cr.lineTo(0.02, 0.085); cr.lineTo(0.04, 0.1); cr.lineTo(0.04, 0.07); cr.closePath();
  mesh(ex(cr), trim, 0, 0, -0.006, crest);
  const rubyM = phong('#e0233c', { shininess: 200, specular: '#ffffff', flatShading: true, emissive: '#600010' });
  mesh(new THREE.OctahedronGeometry(0.011, 0), rubyM, 0, 0.085, -0.008, crest);
  crest.scale.setScalar(0.95);
  // 어깨 갑옷 (겹친 판 3장 + 금 테두리 + 리벳)
  const pauldrons = [];
  for (const sd of [-1, 1]) {
    const grp = new THREE.Group();
    grp.position.set(sd * 0.165, 0.875, 0);
    grp.rotation.z = sd * -0.42;
    root.add(grp);
    for (let k = 0; k < 3; k++) {
      const rad = 0.112 - k * 0.012;
      const p = mesh(new THREE.SphereGeometry(rad, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, -k * 0.04, 0, grp);
      p.scale.set(1, 0.62, 1.08);
      const e = mesh(new THREE.TorusGeometry(rad, 0.0075, 6, 36), trim, 0, -k * 0.04, 0, grp);
      e.rotation.x = Math.PI / 2;
      e.scale.set(1, 1.08, 1);
      // 맨 위 판에 능선
      if (k === 0) { const rg = mesh(new THREE.TorusGeometry(rad * 0.62, 0.006, 6, 24, Math.PI), steel, 0, 0, 0, grp); rg.rotation.y = Math.PI / 2; rg.scale.set(1, 1.05, 1.08); }
    }
    mesh(new THREE.SphereGeometry(0.009, 8, 6), rivetM, 0, 0.068, 0, grp);
    pauldrons.push(grp);
  }
  // 허리띠 + 버클 (몸에 딱 붙게)
  const belt = mesh(new THREE.TorusGeometry(0.192, 0.013, 8, 56), phong('#5a3a22', { shininess: 30 }), 0, 0.455, 0, root);
  belt.rotation.x = Math.PI / 2;
  const buckle = mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 4), trim, 0, 0.455, -0.204, root);
  buckle.rotation.z = Math.PI / 4;
  // 허리에 늘어진 빨간 천 (앞·뒤, 금 테두리 + 아래 술). 움직이면 흔들린다
  const tabTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#b3162a'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd84a'; g.lineWidth = 8; g.strokeRect(8, -10, w - 16, h - 14);
    // 작은 왕관
    g.fillStyle = '#ffd84a';
    g.beginPath(); g.moveTo(40, 120); g.lineTo(40, 92); g.lineTo(52, 104); g.lineTo(64, 84); g.lineTo(76, 104); g.lineTo(88, 92); g.lineTo(88, 120); g.fill();
    // 아래 금 술
    for (let x = 4; x < w; x += 10) g.fillRect(x, h - 18, 5, 18);
  });
  const tabM = phong('#ffffff', { map: tabTex, side: THREE.DoubleSide, shininess: 20, transparent: true, alphaTest: 0.5 });
  const tabs = [];
  const TW_ = 0.15, TH_ = 0.3;
  for (const back of [0, 1]) {
    const geo = new THREE.PlaneGeometry(TW_, TH_, 4, 8);
    geo.translate(0, -TH_ / 2, 0);
    const base = geo.attributes.position.array.slice();
    const piv = new THREE.Group();
    piv.position.set(0, 0.46, back ? 0.205 : -0.205);
    piv.rotation.y = back ? Math.PI : 0;
    root.add(piv);
    const m = mesh(geo, tabM, 0, 0, 0, piv);
    tabs.push({ geo, base, m, back });
  }
  // 칼 (왼쪽 허리, 칼집 + 금 손잡이)
  const sword = new THREE.Group();
  sword.position.set(-0.205, 0.43, 0.02);
  sword.rotation.set(0.25, 0, -0.22);
  root.add(sword);
  const sheath = phong('#3b2416', { shininess: 40 });
  mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.36, 10), sheath, 0, -0.18, 0, sword).scale.set(1, 1, 0.55);
  mesh(new THREE.ConeGeometry(0.014, 0.03, 10), trim, 0, -0.375, 0, sword).rotation.x = Math.PI;
  mesh(new THREE.BoxGeometry(0.1, 0.014, 0.018), trim, 0, 0.005, 0, sword);
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 8), phong('#6b1a1a', { shininess: 30 }), 0, 0.045, 0, sword);
  mesh(new THREE.SphereGeometry(0.016, 10, 8), trim, 0, 0.088, 0, sword);
  // 빛줄기 (가슴판 위를 쓱 지나가는 하얀 줄)
  const glintTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.44, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.56, 'rgba(255,255,255,0)');
    g.save(); g.translate(w / 2, h / 2); g.transform(1, 0, -0.6, 1, 0, 0); g.translate(-w / 2, -h / 2);
    g.fillStyle = gr; g.fillRect(-w, 0, w * 3, h); g.restore();
  });
  glintTex.wrapS = THREE.RepeatWrapping;
  const glintM = new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const gl = mesh(chestGeo.clone(), glintM, 0, 0, 0, root);
  gl.scale.set(1.012, 1, 1.012);
  gl.userData.fx = true;
  gl.castShadow = false;
  const fx = particles(root, 'spark', 14);
  const hit = swingWatch(char), motion = motionWatch(char);
  let cyc = 1.5, flash = 0, sway = 0, kick = 0;
  const rr = rng(2);
  const q = new THREE.Quaternion();
  return (t, dt) => {
    cyc += dt;
    if (hit()) { cyc = 0; flash = 1; kick = 1; }
    if (cyc > 2.8) cyc = 0;
    const k = cyc / 0.7;
    glintM.opacity = k < 1 ? Math.sin(k * Math.PI) * 0.85 : 0;
    glintTex.offset.x = 0.75 - k * 0.55;
    if (k > 0.45 && k < 0.5) fx.spawn(V(0.18, 0.95, -0.06), V(0, 0, 0), 0.5, 0.16, '#ffffff', 2);
    flash = Math.max(0, flash - dt * 3);
    kick = Math.max(0, kick - dt * 2.5);
    steel.emissive.setScalar(flash * 0.45);
    if (flash > 0.9) for (let i = 0; i < 4; i++) fx.spawn(surfacePoint(rr, 0.45, 0.95, 0.23), V(0, 0.1, 0), 0.4, 0.09, '#ffffff', 3);
    pauldrons.forEach((p, i) => { p.position.y = 0.875 + Math.sin(t * 2 + i) * 0.003 + kick * 0.008; });
    // 천: 움직이는 반대쪽으로 날림 + 살랑
    const v = motion(dt);
    const local = v.clone().applyQuaternion(char.group.getWorldQuaternion(q).invert());
    sway += (Math.max(-1, Math.min(1, local.x * 0.8)) - sway) * Math.min(1, dt * 6);
    for (const tb of tabs) {
      const p = tb.geo.attributes.position;
      const dirZ = tb.back ? -1 : 1;
      for (let i = 0; i < p.count; i++) {
        const bx = tb.base[i * 3], by = tb.base[i * 3 + 1];
        const d = -by / TH_;
        const wave = Math.sin(t * 4 + d * 4 + bx * 10) * 0.008 * d;
        const lift = d * d * (0.04 + kick * 0.12);
        p.setXYZ(i, bx + sway * d * d * 0.05 * dirZ, by * (1 - lift * 0.3), -Math.abs(Math.sin(bx * 12)) * 0.004 - lift - wave);
      }
      p.needsUpdate = true;
      tb.geo.computeVertexNormals();
    }
    fx.update(dt);
  };
};

// 곰 인형탈 (몸만): 보송한 털(가장자리가 복슬), 볼록한 배 패치(바느질) + 하트·단추, 젤리 발바닥, 등 지퍼 손잡이, 목 리본.
// 꼬리 살랑, 걸으면 몸이 말랑 출렁, 칠 때 하트 뿅 + 몸 찌그러짐
BUILD.bear = (root, char) => {
  const BROWN = '#9a6438', LIGHT = '#e8c49a', PINK = '#ff9fb5';
  const furTex = (base, n, seed, w = 512, h = 512) => canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, l = 4 + r() * 7;
      g.strokeStyle = r() < 0.5 ? 'rgba(70,40,20,0.22)' : 'rgba(255,225,190,0.2)';
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 4, y + l / 2, x + (r() - 0.5) * 3, y + l); g.stroke();
    }
  });
  const fur = furTex(BROWN, 4500, 6);
  fur.wrapS = fur.wrapT = THREE.RepeatWrapping;
  fur.repeat.set(2, 1);
  // 등 지퍼 (u 0 / 1 = 등 가운데)
  const bodyFur = canvasTex(1024, 512, (g, w, h) => {
    g.drawImage(fur.image, 0, 0, w, h);
    g.fillStyle = '#c9c9cf';
    for (let y = h * 0.06; y < h * 0.6; y += 8) { g.fillRect(0, y, 7, 4); g.fillRect(w - 7, y, 7, 4); g.fillRect(-3, y + 4, 7, 4); g.fillRect(w - 4, y + 4, 7, 4); }
  });
  const furM = lam('#ffffff', { map: bodyFur });
  const shape = new THREE.Group();
  root.add(shape);
  const pts = smoothPts([[0.0001, 0.06], [0.17, 0.09], [0.235, 0.3], [0.24, 0.5], [0.205, 0.78], [0.15, 0.95], [0.13, 1.0]], 40);
  mesh(lathe(pts, 56), furM, 0, 0, 0, shape);
  // 털 껍질 2겹: 털 끝만 남긴 그림을 살짝 크게 씌워 가장자리를 복슬하게
  const tufts = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(14);
    for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.5 ? '#94603a' : '#a87244'; g.fillRect(r() * w, r() * h, 2, 2 + r() * 3); }
  });
  tufts.wrapS = tufts.wrapT = THREE.RepeatWrapping;
  tufts.repeat.set(6, 3);
  for (const k of [1.025]) {
    const sm = mesh(lathe(pts.map(([r, y]) => [r * k, y]), 56), lam('#ffffff', { map: tufts, transparent: true, alphaTest: 0.5 }), 0, 0, 0, shape);
    sm.castShadow = false;
  }
  // 배 패치 (앞, 볼록 + 바느질 테두리)
  const bellyTex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.48, h * 0.48, 0, 0, Math.PI * 2); g.clip();
    g.drawImage(furTex(LIGHT, 1800, 9, 256, 256).image, 0, 0);
    g.restore();
    g.strokeStyle = '#fff6ea'; g.lineWidth = 4; g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.42, h * 0.42, 0, 0, Math.PI * 2); g.stroke();
  });
  const belly = mesh(new THREE.SphereGeometry(1, 32, 24, Math.PI * 1.5 - 0.62, 1.24, Math.PI * 0.33, Math.PI * 0.36), lam('#ffffff', { map: bellyTex, transparent: true, alphaTest: 0.5 }), 0, 0.5, 0, shape);
  belly.scale.set(0.262, 0.42, 0.272);
  belly.castShadow = false;
  // 하트 패치 (입체) + 단추 두 개
  const hs = new THREE.Shape();
  hs.moveTo(0, -0.03); hs.bezierCurveTo(-0.045, 0.002, -0.03, 0.04, 0, 0.018); hs.bezierCurveTo(0.03, 0.04, 0.045, 0.002, 0, -0.03);
  const heartM = phong('#ff6f9f', { shininess: 60, specular: '#ffd0e0' });
  const hrt = mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 }), heartM, 0.07, 0.63, -0.258, shape);
  hrt.rotation.set(0.15, Math.PI + 0.3, 0);
  const btnM = phong('#5a3a22', { shininess: 80 });
  for (const y of [0.5, 0.41]) {
    const b = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), btnM, -0.06, y, -0.268, shape);
    b.rotation.x = Math.PI / 2;
  }
  const plain = lam('#ffffff', { map: fur });
  const pad = lam(LIGHT);
  const bean = phong(PINK, { shininess: 120, specular: '#ffffff' });
  // 팔 (통통, 끝에 젤리 발바닥이 앞을 본다)
  const arms = [];
  for (const sd of [-1, 1]) {
    const grp = new THREE.Group();
    grp.position.set(sd * 0.2, 0.8, -0.02);
    shape.add(grp);
    mesh(new THREE.CapsuleGeometry(0.07, 0.17, 8, 16), plain, 0, -0.11, 0, grp);
    const pd = mesh(new THREE.SphereGeometry(0.04, 14, 10), bean, 0, -0.2, -0.05, grp);
    pd.scale.set(1, 0.85, 0.45);
    for (let i = -1; i <= 1; i++) {
      const tb = mesh(new THREE.SphereGeometry(0.013, 10, 8), bean, i * 0.024, -0.155 - Math.abs(i) * 0.008, -0.058, grp);
      tb.scale.set(1, 1, 0.55);
    }
    grp.rotation.z = sd * 0.45;
    arms.push(grp);
  }
  // 발 (앞으로 동그랗게, 젤리 발바닥)
  for (const sd of [-1, 1]) {
    const f = mesh(new THREE.SphereGeometry(0.08, 18, 12), plain, sd * 0.1, 0.05, -0.11, shape);
    f.scale.set(1, 0.6, 1.3);
    const sole = new THREE.Group();
    sole.position.set(sd * 0.1, 0.055, -0.205);
    sole.rotation.x = 0.35;
    shape.add(sole);
    const mp = mesh(new THREE.SphereGeometry(0.032, 14, 10), bean, 0, -0.008, 0, sole);
    mp.scale.set(1.1, 0.85, 0.35);
    for (let i = -1; i <= 1; i++) mesh(new THREE.SphereGeometry(0.011, 10, 8), bean, i * 0.022, 0.026 - Math.abs(i) * 0.006, 0, sole).scale.set(1, 1, 0.45);
  }
  // 꼬리 (복슬: 작은 털뭉치 여러 개)
  const tail = new THREE.Group();
  tail.position.set(0, 0.22, 0.235);
  shape.add(tail);
  const tailM = lam('#c9b09c', { map: fur });
  mesh(new THREE.SphereGeometry(0.05, 14, 10), tailM, 0, 0, 0, tail);
  { const r = rng(21); for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, b = r() * Math.PI; mesh(new THREE.SphereGeometry(0.022, 8, 6), tailM, Math.cos(a) * Math.sin(b) * 0.045, Math.cos(b) * 0.045, Math.abs(Math.sin(a) * Math.sin(b)) * 0.045, tail); } }
  // 등 지퍼 손잡이
  const zipM = phong('#d8d8e0', { shininess: 160, specular: '#ffffff' });
  const pull = new THREE.Group();
  pull.position.set(0, 0.93, 0.163);
  pull.rotation.x = -0.3;
  shape.add(pull);
  mesh(new THREE.BoxGeometry(0.022, 0.016, 0.01), zipM, 0, 0, 0, pull);
  const tab = mesh(new THREE.BoxGeometry(0.016, 0.04, 0.005), zipM, 0, -0.03, 0.004, pull);
  void tab;
  // 목 리본 (고리 두 개 + 매듭 + 꼬리)
  const ribbon = phong('#ff6f9f', { shininess: 70, specular: '#ffe0ea' });
  const neckR = mesh(new THREE.TorusGeometry(0.135, 0.016, 8, 36), ribbon, 0, 0.975, 0, shape);
  neckR.rotation.x = Math.PI / 2;
  const bow = new THREE.Group();
  bow.position.set(0, 0.965, -0.15);
  shape.add(bow);
  for (const sd of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(0.028, 0.011, 8, 18), ribbon, sd * 0.034, 0.004, 0, bow);
    loop.scale.set(1.2, 0.85, 0.7);
    loop.rotation.z = sd * 0.25;
    const tl = mesh(new THREE.BoxGeometry(0.016, 0.06, 0.006), ribbon, sd * 0.016, -0.035, 0.004, bow);
    tl.rotation.z = sd * 0.35;
  }
  mesh(new THREE.SphereGeometry(0.016, 10, 8), phong('#e8456f', { shininess: 80 }), 0, 0.002, -0.006, bow);
  const hit = swingWatch(char), motion = motionWatch(char);
  const hearts = particles(root, 'heart', 24, false);
  const rr = rng(8);
  let sq = 0, sqV = 0, idle = 1.5, jig = 0, jigV = 0, lastSp = 0;
  const q = new THREE.Quaternion();
  const puff = () => {
    for (let i = 0; i < 5; i++) hearts.spawn(V((rr() - 0.5) * 0.3, 0.9 + rr() * 0.2, -0.1 + (rr() - 0.5) * 0.2), V((rr() - 0.5) * 0.4, 0.5 + rr() * 0.4, (rr() - 0.5) * 0.3), 1.1, 0.06 + rr() * 0.04);
  };
  return (t, dt) => {
    if (hit()) { sqV -= 6; puff(); }
    sqV += (-sq * 90 - sqV * 7) * dt;
    sq += sqV * dt;
    // 걸을 때 출렁 (속도가 바뀌면 옆으로 말랑)
    const v = motion(dt);
    const local = v.clone().applyQuaternion(char.group.getWorldQuaternion(q).invert());
    const acc = dt > 0 ? (local.x - lastSp) / dt : 0;
    lastSp = local.x;
    jigV += (-jig * 70 - jigV * 6) * dt - Math.max(-8, Math.min(8, acc)) * dt * 0.6;
    jig += jigV * dt;
    shape.scale.set(1 - sq * 0.25, 1 + sq * 0.35, 1 - sq * 0.25);
    shape.rotation.z = jig * 0.12;
    tail.position.x = Math.sin(t * 7) * 0.02;
    tail.rotation.z = Math.sin(t * 7) * 0.4;
    arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 2.2 + i * Math.PI) * 0.15; a.rotation.z = (i ? 1 : -1) * (0.45 + Math.max(0, -sq) * 0.6); });
    pull.rotation.z = Math.sin(t * 3) * 0.2 - jig * 0.5;
    idle -= dt;
    if (idle <= 0) { idle = 2 + rr() * 2; hearts.spawn(V(0.1, 1.0, -0.1), V(0.05, 0.35, 0), 1.2, 0.05); }
    hearts.update(dt, -0.1, 1.2);
  };
};

/* ═════════════ 목록 ═════════════ */
// [id, 이름, 등급]. 일반은 칠하기(PAINT), 고급·전설은 BUILD
export const OUTFITS = [
  ['uniform', '국가대표 유니폼', 'common'],
  ['pe', '학교 체육복', 'common'],
  ['undershirt', '아빠 런닝셔츠', 'common'],
  ['monpe', '할머니 몸빼', 'common'],
  ['vest', '형광 안전 조끼', 'common'],
  ['hiking', '등산복 아저씨', 'common'],
  ['starpj', '별 잠옷', 'common'],
  ['leopard', '호피 무늬', 'common'],
  ['dotpj', '땡땡이 잠옷', 'common'],
  ['overalls', '데님 멜빵', 'common'],
  ['suit', '출근룩 정장', 'rare'],
  ['apron', '김제빵 앞치마', 'rare'],
  ['padding', '수능 롱패딩', 'rare'],
  ['blanket', '이불 둘둘', 'rare'],
  ['gimbap', '김밥', 'rare'],
  ['bungeo', '붕어빵', 'rare'],
  ['banana', '바나나', 'rare'],
  ['penguin', '펭귄', 'rare'],
  ['hawaii', '하와이안 셔츠', 'rare'],
  ['milk', '딸기우유 팩', 'rare'],
  ['cupcake', '컵케이크', 'rare'],
  ['chick', '병아리', 'rare'],
  ['gummy', '곰젤리', 'rare'],
  ['macaron', '마카롱', 'rare'],
  ['cape', '영웅 망토', 'legend'],
  ['duck', '오리 튜브', 'legend'],
  ['mirror', '미러볼 무대 의상', 'legend'],
  ['knight', '기사 갑옷', 'legend'],
  ['bear', '곰 인형탈', 'legend'],
].map(([id, name, grade]) => ({ id, name, grade }));

// 옷 만들기: { group, update(t, dt) | null }
export function makeOutfit(id, char) {
  const group = new THREE.Group();
  let update = null;
  if (BUILD[id]) update = BUILD[id](group, char) || null;
  else if (PAINT[id]) skin(group, PAINT[id]);
  else return null;
  group.traverse((o) => { if (o.isMesh && o.userData.fx) o.castShadow = false; });
  return { group, update, hideHead: HIDE_HEAD.has(id) };
}
