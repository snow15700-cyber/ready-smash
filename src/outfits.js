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
function fixBodyUV(geo, cy, y0 = BY0, y1 = BY1) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + cy, z = pos.getZ(i);
    let u;
    if (Math.hypot(x, z) < 1e-5) u = uv.getX(i);
    else {
      u = Math.atan2(x, z) / (2 * Math.PI);
      if (u < 0) u += 1;
      if (u < 1e-4 && uv.getX(i) > 0.5) u = 1;
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

// 영웅 망토: 움직이면 뒤로 날리고, 휘두르면 휙. 몸은 파랑 영웅복 + 탁구채 문장
BUILD.cape = (root, char) => {
  skin(root, (g) => {
    band(g, BY0, BY1, '#2a4fd0');
    // 근육 결 (살짝 밝은 면)
    const gr = g.createLinearGradient(FX - M(0.15), 0, FX + M(0.15), 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(FX - M(0.15), py(0.95), M(0.3), M(0.45));
    // 가슴 문장: 금색 방패 + 빨간 탁구채
    const cx = FX, cy = py(0.78);
    g.fillStyle = '#ffd84a';
    g.beginPath(); g.moveTo(cx - M(0.07), cy - M(0.06)); g.lineTo(cx + M(0.07), cy - M(0.06)); g.lineTo(cx + M(0.06), cy + M(0.02)); g.lineTo(cx, cy + M(0.07)); g.lineTo(cx - M(0.06), cy + M(0.02)); g.closePath(); g.fill();
    g.strokeStyle = '#b8860b'; g.lineWidth = M(0.006); g.stroke();
    circle(g, cx - M(0.008), cy - M(0.012), M(0.028), '#e0333c');
    g.fillStyle = '#8a5430'; g.save(); g.translate(cx + M(0.012), cy + M(0.022)); g.rotate(-0.6); g.fillRect(-M(0.006), 0, M(0.012), M(0.035)); g.restore();
    circle(g, cx + M(0.03), cy - M(0.03), M(0.008), '#ffffff');
    // 빨간 팬츠 + 금 벨트 + 빨간 부츠
    band(g, 0.36, 0.5, '#e0333c');
    band(g, 0.47, 0.51, '#ffd84a');
    g.fillStyle = '#e0a800'; g.fillRect(FX - M(0.025), py(0.515), M(0.05), M(0.05));
    band(g, BY0, 0.14, '#e0333c');
    g.fillStyle = '#e0333c';
    for (let x = 0; x < TW; x += M(0.05)) { g.beginPath(); g.moveTo(x, py(0.14)); g.lineTo(x + M(0.025), py(0.17)); g.lineTo(x + M(0.05), py(0.14)); g.fill(); }
  }, (t) => phong('#ffffff', { map: t, shininess: 50, specular: '#445' }));
  // 망토: 어깨에서 늘어진 천 (바깥 빨강, 안 금색)
  const W = 0.5, H = 0.86, NX = 10, NY = 18;
  const geo = new THREE.PlaneGeometry(W, H, NX, NY);
  geo.translate(0, -H / 2, 0);
  const base = geo.attributes.position.array.slice();
  const outTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#a3121f'); gr.addColorStop(0.5, '#e8283a'); gr.addColorStop(1, '#a3121f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd84a'; g.fillRect(0, h - 8, w, 8);
  });
  const outM = phong('#ffffff', { map: outTex, side: THREE.FrontSide, shininess: 60, specular: '#844' });
  const inM = phong('#ffcf3a', { side: THREE.BackSide, shininess: 80, specular: '#ffffff' });
  const capeRoot = new THREE.Group();
  capeRoot.position.set(0, 0.95, 0.16);
  root.add(capeRoot);
  const outer = mesh(geo, outM, 0, 0, 0, capeRoot);
  const inner = mesh(geo, inM, 0, 0, 0, capeRoot);
  void outer; void inner;
  // 어깨 금 고정쇠 + 높은 깃
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.03, 14, 10), phong('#ffd84a', { shininess: 120, specular: '#fff' }), s * 0.13, 0.93, -0.08, root);
  }
  const collar = mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.1, 24, 1, true, -1.4, 2.8), inM, 0, 1.0, 0, root);
  void collar;
  const hit = swingWatch(char), motion = motionWatch(char);
  const fx = particles(root, 'star', 30);
  let lift = 0, kick = 0, nextStar = 0;
  const rr = rng(77);
  return (t, dt) => {
    const v = motion(dt);
    const local = v.clone().applyQuaternion(char.group.getWorldQuaternion(new THREE.Quaternion()).invert());
    const speed = Math.min(2, Math.hypot(local.x, local.z));
    if (hit()) kick = 1;
    kick = Math.max(0, kick - dt * 2.2);
    lift += (Math.min(1, speed * 0.7 + kick * 0.9) - lift) * Math.min(1, dt * 5);
    const side = Math.max(-1, Math.min(1, -local.x * 0.6));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      const d = -by / H; // 0 위 ~ 1 아래
      const spread = 1 + d * 0.35;
      const curve = Math.cos((bx / (W / 2)) * 1.1) * 0.06 * (1 - d * 0.5); // 몸을 감싸는 곡면
      const wave = Math.sin(t * (5 + lift * 6) + d * 5 + bx * 6) * 0.025 * d * (0.4 + lift * 1.6);
      const ang = d * d * (0.12 + lift * 1.1); // 뒤로 날림
      let x = bx * spread + side * d * d * 0.12;
      let y = by * Math.cos(ang);
      let z = -curve + 0.02 + -by * Math.sin(ang) + wave;
      // 아래쪽 펄럭 (가장자리 물결)
      z += Math.sin(t * 7 + bx * 14) * 0.012 * d * d * (0.5 + lift);
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    // 빨리 움직이거나 휘두를 때 망토 끝에서 금빛 별
    nextStar -= dt;
    if (lift > 0.35 && nextStar <= 0) {
      nextStar = 0.06;
      const x = (rr() - 0.5) * W;
      const pt = V(x, 0.95 - H * Math.cos(lift) * 0.9, 0.16 + H * Math.sin(lift) * 0.8);
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
  const yellow = phong('#ffd21f', { shininess: 90, specular: '#ffffff' });
  const torus = mesh(new THREE.TorusGeometry(0.26, 0.085, 18, 48), yellow, 0, 0, 0, tube);
  torus.rotation.x = Math.PI / 2;
  // 줄 (튜브 위 흰 줄)
  const tex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffd21f'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff9a20'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 18, h); });
  void tex;
  // 오리 머리 (앞)
  const duck = new THREE.Group();
  duck.position.set(0, 0.03, -0.3);
  tube.add(duck);
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.12, 16), yellow, 0, 0.05, 0, duck);
  neck.rotation.x = 0.2;
  const head = mesh(new THREE.SphereGeometry(0.085, 20, 16), yellow, 0, 0.15, -0.01, duck);
  void head;
  const beak = mesh(new THREE.SphereGeometry(0.05, 16, 10), phong('#ff8a1a', { shininess: 60 }), 0, 0.13, -0.09, duck);
  beak.scale.set(1.1, 0.4, 1);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.018, 10, 8), lam('#ffffff'), s * 0.04, 0.18, -0.07, duck);
    mesh(new THREE.SphereGeometry(0.011, 8, 6), lam('#1a1a1a'), s * 0.043, 0.182, -0.083, duck);
    mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb0b0' }), s * 0.065, 0.14, -0.055, duck).scale.set(1, 0.6, 0.5);
  }
  // 꼬리 (뒤)
  const tail = mesh(new THREE.ConeGeometry(0.05, 0.12, 12), yellow, 0, 0.06, 0.32, tube);
  tail.rotation.x = -0.9;
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
    rings.forEach((m, i) => {
      const k = ((t * 0.5 + i / 3) % 1);
      m.scale.setScalar(0.25 + k * 0.45);
      m.material.opacity = 0.45 * (1 - k);
    });
    drops.update(dt, 3.2);
  };
};

// 미러볼 무대 의상: 거울 조각 반짝이 옷, 무지개 빛, 발밑 조명 점이 빙글
BUILD.mirror = (root, char) => {
  const tileTex = (emis) => bodyTex((g) => {
    const s = M(0.022);
    const r = rng(emis ? 9 : 8);
    for (let y = 0; y < TH; y += s) for (let x = 0; x < TW; x += s) {
      const v = r();
      if (emis) g.fillStyle = v > 0.86 ? `hsl(${Math.floor(r() * 360)},90%,65%)` : '#000000';
      else { const l = 55 + Math.floor(v * 40); g.fillStyle = `hsl(${220 + v * 40},${10 + v * 15}%,${l}%)`; }
      g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
    }
    if (!emis) {
      // 금 벨트 + 금 부츠
      band(g, 0.47, 0.51, '#e8b923');
      band(g, BY0, 0.1, '#e8b923');
    }
  });
  const emTex = tileTex(true);
  const suit = skin(root, () => {}, () => phong('#ffffff', { map: tileTex(false), shininess: 140, specular: '#ffffff', emissive: '#ffffff', emissiveMap: emTex, emissiveIntensity: 0.6 }));
  // 높은 어깨 뽕 (반짝이)
  const shoulderM = phong('#d0d6e6', { shininess: 150, specular: '#ffffff', flatShading: true });
  for (const s of [-1, 1]) {
    const sh = mesh(new THREE.IcosahedronGeometry(0.075, 1), shoulderM, s * 0.17, 0.86, 0, root);
    sh.scale.set(1, 0.7, 1);
  }
  // 뒤로 높이 선 별 모양 깃 (무대 의상)
  const collarM = phong('#e8b923', { shininess: 120, specular: '#fff', side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i - 3) * 0.32 + Math.PI; // 등 쪽 부채꼴
    const sp = mesh(new THREE.ConeGeometry(0.03, 0.2 - Math.abs(i - 3) * 0.025, 4), collarM, Math.sin(a) * 0.15, 1.02, Math.cos(a) * 0.15, root);
    sp.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
  }
  // 발밑 조명 점 (빙글빙글)
  const spotCols = ['#ff5f86', '#5fb4ff', '#7ee07e', '#ffd23d', '#c86bff', '#ff9a40'];
  const spots = spotCols.map((c) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.007;
    m.userData.fx = true;
    root.add(m);
    return m;
  });
  const fx = particles(root, 'spark', 40);
  const hit = swingWatch(char);
  const rr = rng(5);
  let next = 0, burst = 0;
  const mat = suit.material;
  return (t, dt) => {
    // 무지개 빛이 천천히 돌아감
    mat.emissive.setHSL((t * 0.15) % 1, 0.8, 0.6);
    mat.emissiveIntensity = 0.45 + Math.sin(t * 6) * 0.15 + burst * 0.8;
    emTex.offset.x = (t * 0.05) % 1;
    shoulderM.emissive.setScalar(0.1 + burst * 0.4);
    if (hit()) { burst = 1; for (let i = 0; i < 14; i++) fx.spawn(surfacePoint(rr, 0.2, 0.95, 0.23), V((rr() - 0.5) * 0.6, rr() * 0.6, (rr() - 0.5) * 0.6), 0.6, 0.08 + rr() * 0.06, '#ffffff', 3); }
    burst = Math.max(0, burst - dt * 2);
    next -= dt;
    if (next <= 0) {
      next = 0.05;
      fx.spawn(surfacePoint(rr, 0.12, 0.98, 0.2), V(0, 0.03, 0), 0.45, 0.05 + rr() * 0.05, rr() < 0.5 ? '#ffffff' : `hsl(${Math.floor(rr() * 360)},100%,80%)`, 4);
    }
    fx.update(dt);
    spots.forEach((m, i) => {
      const a = t * 0.9 + (i / spots.length) * Math.PI * 2;
      const rad = 0.45 + Math.sin(t * 0.7 + i) * 0.15;
      m.position.set(Math.cos(a) * rad, 0.007, Math.sin(a) * rad);
      m.material.opacity = 0.35 + Math.sin(t * 4 + i * 2) * 0.2;
    });
  };
};

// 기사 갑옷: 은빛 판금 + 빨간 겉옷 + 어깨 갑옷. 빛줄기가 주기적으로 쓱, 휘두르면 번쩍
BUILD.knight = (root, char) => {
  const steel = (t) => phong('#ffffff', { map: t, shininess: 110, specular: '#ffffff' });
  skin(root, (g) => {
    const gr = g.createLinearGradient(0, 0, TW, 0);
    for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#c9ced8' : '#8d94a3');
    g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    // 판 이음매 + 리벳
    for (const y of [0.3, 0.5, 0.62, 0.74, 0.86]) {
      band(g, y - 0.004, y + 0.004, '#5d6372');
      for (let x = M(0.03); x < TW; x += M(0.06)) circle(g, x, py(y + 0.015), M(0.005), '#e8ebf2');
    }
    // 가슴판 가운데 능선
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(FX - M(0.004), py(0.95), M(0.008), M(0.4));
    band(g, BY0, 0.12, '#6d7383');
  }, steel);
  // 빨간 겉옷 (앞·뒤로 늘어진 천, 금 테두리 + 문장)
  const tabTex = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#b3162a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd84a'; g.lineWidth = 12; g.strokeRect(6, -10, w - 12, h + 4);
    // 문장: 왕관 + 엇갈린 탁구채
    g.save(); g.translate(w / 2, h * 0.42);
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * 0.6);
      circle(g, 0, -40, 30, '#ffd84a'); g.fillStyle = '#ffd84a'; g.fillRect(-7, -14, 14, 60);
      g.restore();
    }
    g.fillStyle = '#ffd84a';
    g.beginPath(); g.moveTo(-40, -70); g.lineTo(-40, -100); g.lineTo(-20, -84); g.lineTo(0, -110); g.lineTo(20, -84); g.lineTo(40, -100); g.lineTo(40, -70); g.fill();
    g.restore();
  });
  const tabM = lam('#ffffff', { map: tabTex, side: THREE.DoubleSide });
  for (const back of [0, 1]) {
    const tb = mesh(new THREE.CylinderGeometry(0.193, 0.215, 0.62, 12, 1, true, Math.PI - 0.55 + (back ? Math.PI : 0), 1.1), tabM, 0, 0.55, 0, root);
    void tb;
  }
  // 어깨 갑옷 (겹친 판 2장)
  const plate = phong('#b9bfcc', { shininess: 120, specular: '#ffffff' });
  const trim = phong('#e8b923', { shininess: 120, specular: '#ffffff' });
  const pauldrons = [];
  for (const s of [-1, 1]) {
    const grp = new THREE.Group();
    grp.position.set(s * 0.16, 0.88, 0);
    grp.rotation.z = s * -0.35;
    root.add(grp);
    for (let k = 0; k < 2; k++) {
      const p = mesh(new THREE.SphereGeometry(0.1 - k * 0.012, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, -k * 0.045, 0, grp);
      p.scale.set(1, 0.7, 1.05);
      const e = mesh(new THREE.TorusGeometry(0.1 - k * 0.012, 0.007, 6, 30), trim, 0, -k * 0.045, 0, grp);
      e.rotation.x = Math.PI / 2;
      e.scale.set(1, 1.05, 1);
    }
    pauldrons.push(grp);
  }
  // 목 보호대 + 벨트 + 버클
  const gorget = mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.08, 32), plate, 0, 0.97, 0, root);
  void gorget;
  const belt = mesh(new THREE.TorusGeometry(0.205, 0.016, 8, 48), lam('#5a3a22'), 0, 0.3, 0, root);
  belt.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), trim, 0, 0.3, -0.215, root);
  // 빛줄기 (몸 위를 쓱 지나가는 하얀 줄)
  const glintTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0.42, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.58, 'rgba(255,255,255,0)');
    g.save(); g.translate(w / 2, h / 2); g.transform(1, 0, -0.6, 1, 0, 0); g.translate(-w / 2, -h / 2);
    g.fillStyle = gr; g.fillRect(-w, 0, w * 3, h); g.restore();
  });
  glintTex.wrapS = THREE.RepeatWrapping;
  const glintM = new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const gl = mesh(fixBodyUV(new THREE.CapsuleGeometry(BODY_R, 0.62, 10, 32), 0.5), glintM, 0, 0.5, 0, root);
  gl.scale.set(1.25, 1.01, 1.25);
  gl.userData.fx = true;
  gl.castShadow = false;
  const fx = particles(root, 'spark', 12);
  const hit = swingWatch(char);
  let cyc = 1.5, flash = 0;
  const rr = rng(2);
  return (t, dt) => {
    cyc += dt;
    if (hit()) { cyc = 0; flash = 1; }
    if (cyc > 2.8) cyc = 0;
    const k = cyc / 0.7;
    glintM.opacity = k < 1 ? Math.sin(k * Math.PI) * 0.9 : 0;
    glintTex.offset.x = 0.2 - k * 0.55;
    if (k > 0.45 && k < 0.5) fx.spawn(V(0.16, 0.95, -0.06), V(0, 0, 0), 0.5, 0.16, '#ffffff', 2);
    flash = Math.max(0, flash - dt * 3);
    plate.emissive.setScalar(flash * 0.5);
    if (flash > 0.9) for (let i = 0; i < 3; i++) fx.spawn(surfacePoint(rr, 0.4, 0.95, 0.22), V(0, 0.1, 0), 0.4, 0.09, '#ffffff', 3);
    pauldrons.forEach((p, i) => { p.position.y = 0.88 + Math.sin(t * 2 + i) * 0.003; });
    fx.update(dt);
  };
};

// 곰 인형탈 (몸만): 갈색 털 몸 + 배 하트 패치 + 등 지퍼. 꼬리 살랑, 칠 때 하트 뿅 + 몸 말랑
BUILD.bear = (root, char) => {
  const fur = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#9a6438'; g.fillRect(0, 0, w, h);
    const r = rng(6);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, l = 4 + r() * 6;
      g.strokeStyle = r() < 0.5 ? 'rgba(70,40,20,0.35)' : 'rgba(200,150,100,0.3)';
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + l); g.stroke();
    }
    // 배 (연한 갈색 타원)
    g.fillStyle = '#e8c49a';
    g.beginPath(); g.ellipse(w / 2, h * 0.58, w * 0.12, h * 0.3, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 1500; i++) {
      const a = r() * 6.28, d = Math.sqrt(r());
      const x = w / 2 + Math.cos(a) * d * w * 0.11, y = h * 0.58 + Math.sin(a) * d * h * 0.28;
      g.strokeStyle = 'rgba(180,130,80,0.3)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 5); g.stroke();
    }
    // 하트 패치 (바느질)
    heart(g, w / 2 + 28, h * 0.46, 26, '#ff7fa6');
    g.save(); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.setLineDash([6, 5]);
    g.beginPath(); g.arc(w / 2 + 28, h * 0.45, 22, 0, Math.PI * 2); g.stroke(); g.restore();
    // 단추 두 개
    circle(g, w / 2 - 26, h * 0.62, 8, '#5a3a22'); circle(g, w / 2 - 26, h * 0.72, 8, '#5a3a22');
    // 등 지퍼 (인형탈 농담)
    g.fillStyle = '#c9c9cf';
    for (let y = h * 0.06; y < h * 0.6; y += 8) { g.fillRect(0, y, 7, 4); g.fillRect(w - 7, y, 7, 4); g.fillRect(-3, y + 4, 7, 4); g.fillRect(w - 4, y + 4, 7, 4); }
    g.fillStyle = '#e0e0e6'; g.fillRect(w - 10, h * 0.06, 20, 28); g.fillRect(-10, h * 0.06, 20, 28);
  });
  const furM = lam('#ffffff', { map: fur });
  const shape = new THREE.Group();
  root.add(shape);
  const pts = smoothPts([[0.0001, 0.06], [0.17, 0.09], [0.235, 0.3], [0.24, 0.5], [0.205, 0.78], [0.15, 0.95], [0.13, 1.0]], 40);
  mesh(lathe(pts, 48), furM, 0, 0, 0, shape);
  const plain = lam('#9a6438');
  const pad = lam('#e8c49a');
  // 팔 (뭉툭, 끝에 발바닥)
  const arms = [];
  for (const s of [-1, 1]) {
    const grp = new THREE.Group();
    grp.position.set(s * 0.2, 0.78, -0.02);
    shape.add(grp);
    const a = mesh(new THREE.CapsuleGeometry(0.065, 0.16, 6, 12), plain, 0, -0.1, 0, grp);
    void a;
    const pd = mesh(new THREE.SphereGeometry(0.045, 12, 8), pad, 0, -0.2, -0.035, grp);
    pd.scale.set(1, 1, 0.5);
    grp.rotation.z = s * 0.5;
    arms.push(grp);
  }
  // 발 (앞으로 동그랗게, 발바닥 무늬)
  const soleTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9a6438'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c49a';
    g.beginPath(); g.ellipse(64, 80, 30, 24, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) circle(g, 36 + i * 28, 40, 11, '#e8c49a');
  });
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.SphereGeometry(0.075, 16, 12), plain, s * 0.1, 0.05, -0.1, shape);
    f.scale.set(1, 0.6, 1.3);
    const sole = mesh(new THREE.CircleGeometry(0.06, 20), lam('#ffffff', { map: soleTex }), s * 0.1, 0.06, -0.195, shape);
    sole.rotation.x = 0.35;
  }
  // 꼬리 (복슬)
  const tail = mesh(new THREE.SphereGeometry(0.055, 14, 10), lam('#7a4a28'), 0, 0.22, 0.235, shape);
  // 목 둘레 리본
  const ribbon = lam('#ff6f9f');
  const neckR = mesh(new THREE.TorusGeometry(0.135, 0.015, 8, 30), ribbon, 0, 0.97, 0, shape);
  neckR.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.SphereGeometry(0.035, 12, 8), ribbon, s * 0.04, 0.96, -0.14, shape);
    b.scale.set(1.3, 0.75, 0.5);
  }
  mesh(new THREE.SphereGeometry(0.016, 8, 6), lam('#e8456f'), 0, 0.96, -0.15, shape);
  const hit = swingWatch(char);
  const hearts = particles(root, 'heart', 24, false);
  const rr = rng(8);
  let sq = 0, sqV = 0, idle = 1.5;
  const puff = () => {
    for (let i = 0; i < 5; i++) hearts.spawn(V((rr() - 0.5) * 0.3, 0.9 + rr() * 0.2, -0.1 + (rr() - 0.5) * 0.2), V((rr() - 0.5) * 0.4, 0.5 + rr() * 0.4, (rr() - 0.5) * 0.3), 1.1, 0.06 + rr() * 0.04);
  };
  return (t, dt) => {
    if (hit()) { sqV -= 6; puff(); }
    sqV += (-sq * 90 - sqV * 7) * dt;
    sq += sqV * dt;
    shape.scale.set(1 - sq * 0.25, 1 + sq * 0.35, 1 - sq * 0.25);
    tail.position.x = Math.sin(t * 7) * 0.02;
    tail.rotation.z = Math.sin(t * 7) * 0.4;
    arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 2.2 + i * Math.PI) * 0.15; });
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
