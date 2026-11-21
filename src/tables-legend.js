// 전설 탁구대 6종 (docs/dev/tables.md). 보기만 다르다: 판 = TABLE_W × TABLE_L, 윗면 TY, 네트 높이 NET_H.
// 고급과 같은 규칙(네트는 비쳐 보이게, 키 큰 소품은 -x, +x엔 낮은 것, 양 끝은 비움) + 전설만의 것:
//   tick(t, dt, fx, st)  st = { ball: 공 위치 | null, rally: 랠리 수, heat: 0~1 (랠리가 길어질수록 → 더 화려하게) }
//   bounce(p, smash, fx) 공이 판에 튐 · hit(p, smash, fx) 선수가 침 · score({ x, z, smash }, fx) 득점 (z = 공이 빠져나간 끝)
// 효과는 공보다 작고 흐리게, 판 위 그림은 공보다 어둡게 (공이 잘 보이게).
import * as THREE from 'three';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H } from './physics.js';
import { rng, canvasTex, lam, flat, shiny, put, box, cyl, roundBox, softTop, steamer, smooth } from './table-kit.js';

const HL = HALF_L, HW = HALF_W;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const R = Math.random;

// 위에서 본 모양이 둥근 네모(초타원)인 판 (거북이 등껍질)
function superShape(a, b, n = 5, seg = 96) {
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), si = Math.sin(t);
    const x = a * Math.sign(c) * Math.abs(c) ** (2 / n), y = b * Math.sign(si) * Math.abs(si) ** (2 / n);
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}
function slab(shape, h, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}
function heartShape(s = 1) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.9 * s);
  h.bezierCurveTo(-0.2 * s, -0.6 * s, -1 * s, -0.2 * s, -1 * s, 0.3 * s);
  h.bezierCurveTo(-1 * s, 0.8 * s, -0.4 * s, 1 * s, 0, 0.55 * s);
  h.bezierCurveTo(0.4 * s, 1 * s, 1 * s, 0.8 * s, 1 * s, 0.3 * s);
  h.bezierCurveTo(1 * s, -0.2 * s, 0.2 * s, -0.6 * s, 0, -0.9 * s);
  return h;
}
// 눈 깜빡임: 3~5초마다 0.15초 (가끔 두 번)
function blinker() {
  let next = 1 + R() * 3, t = 0, dbl = false;
  return (dt) => {
    t += dt; next -= dt;
    if (next < 0) { t = 0; next = 2.5 + R() * 3; dbl = R() < 0.25; }
    const k = t < 0.15 ? Math.sin((t / 0.15) * Math.PI) : dbl && t > 0.22 && t < 0.37 ? Math.sin(((t - 0.22) / 0.15) * Math.PI) : 0;
    return k;
  };
}
// 머리가 공을 따라봄: 머리 앞 = -x. 고개(yaw)는 ±maxYaw까지만
function follow(head, from, ball, dt, { maxYaw = 1.0, maxPitch = 0.35, rest = 0, speed = 6 } = {}) {
  let yaw = rest, pitch = 0;
  if (ball) {
    const dx = ball[0] - from.x, dz = ball[2] - from.z, dy = ball[1] - from.y;
    yaw = clamp(Math.atan2(dz, -dx), -maxYaw, maxYaw); // -x를 볼 때 0, +z 쪽을 보면 +
    pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -maxPitch, maxPitch);
  }
  const k = 1 - Math.exp(-dt * speed);
  head.rotation.y += (yaw - head.rotation.y) * k;
  head.rotation.z += (-pitch - head.rotation.z) * k;
}
// 반짝이는 눈 (흰자 + 검은 눈동자 + 빛 두 점) — 앞 = -x
function cuteEye(parent, x, y, z, r, { iris = '#1b1b24', white = '#ffffff', lid = '#8fbf6a' } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const eye = put(g, new THREE.SphereGeometry(r, 24, 16), shiny(white, 60), 0, 0, 0, { shadow: false });
  const pupil = new THREE.Group();
  g.add(pupil);
  const pu = put(pupil, new THREE.SphereGeometry(r * 0.62, 20, 14), shiny(iris, 120), -r * 0.74, 0, 0, { shadow: false });
  pu.scale.set(0.5, 1, 1);
  const hl1 = put(pupil, new THREE.SphereGeometry(r * 0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), -r * 1.0, r * 0.24, -r * 0.16, { shadow: false });
  put(pupil, new THREE.SphereGeometry(r * 0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), -r * 1.0, -r * 0.2, r * 0.18, { shadow: false });
  const lidM = put(g, new THREE.SphereGeometry(r * 1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam(lid), 0, 0, 0, { shadow: false });
  lidM.visible = false; void lid;
  return {
    g, pupil, pu, hl1,
    look(dx, dy) { pupil.position.set(0, clamp(dy, -1, 1) * r * 0.25, clamp(dx, -1, 1) * r * 0.32); },
    blink(k) { g.scale.y = 1 - k * 0.88; },
    size(s) { pu.scale.set(0.5, s, s); },
  };
}
// 판 위 효과용: 공이 튄 쪽 반이 +z인지
const half = (z) => (z >= 0 ? 1 : -1);

/* ════════════════════════════════════════════════════════════
   1. 오락실 게임기 (앉아서 하는 테이블형 게임기, 화면이 곧 탁구대)
   ════════════════════════════════════════════════════════════ */
const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['###', '#..', '#..', '#..', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'], G: ['###', '#..', '#.#', '#.#', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '##.', '#..', '##.', '#.#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['###', '#.#', '#.#', '#.#', '###'], P: ['###', '#.#', '###', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], '.': ['...', '...', '...', '...', '.#.'],
  '+': ['...', '.#.', '###', '.#.', '...'], x: ['...', '#.#', '.#.', '#.#', '...'], '-': ['...', '...', '###', '...', '...'], ' ': ['...', '...', '...', '...', '...'],
};
const INVADER = ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'];
const INVADER2 = ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'];

function arcade(root) {
  const SW = 160, SH = 288; // 화면 픽셀 (판 비율 그대로)
  const cv = document.createElement('canvas');
  cv.width = SW; cv.height = SH;
  const g = cv.getContext('2d');
  const scr = new THREE.CanvasTexture(cv);
  scr.colorSpace = THREE.SRGBColorSpace;
  scr.magFilter = THREE.NearestFilter; scr.minFilter = THREE.NearestFilter; scr.generateMipmaps = false;
  const toS = (x, z) => [(x + HW) / TABLE_W * SW, (z + HL) / TABLE_L * SH];
  // 3×5 픽셀 글자. flip = 반대쪽(-z) 선수가 바로 읽게 180° 돌림
  function say(str, cx, cy, s, color, flip = false) {
    const w = str.length * 4 * s - s, h = 5 * s;
    g.save();
    if (flip) { g.translate(SW, SH); g.rotate(Math.PI); cx = SW - cx; cy = SH - cy; }
    g.fillStyle = color;
    let x0 = Math.round(cx - w / 2);
    const y0 = Math.round(cy - h / 2);
    for (const ch of str) {
      const f = FONT[ch] || FONT[' '];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (f[r][c] === '#') g.fillRect(x0 + c * s, y0 + r * s, s, s);
      x0 += 4 * s;
    }
    g.restore();
  }
  function sprite(rows, cx, cy, color, flip) {
    const w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (rows[r][c] === '#') {
      const rr2 = flip ? h - 1 - r : r;
      g.fillStyle = color; g.fillRect(Math.round(cx - w / 2) + c, Math.round(cy - h / 2) + rr2, 1, 1);
    }
  }
  const stars = Array.from({ length: 60 }, () => ({ x: R() * SW, y: R() * SH, v: 4 + R() * 14, c: R() }));
  const inv = []; // 양 끝 가까이 줄지어 행진하는 외계인 (흐리게)
  for (const end of [-1, 1]) for (let i = 0; i < 5; i++) inv.push({ end, i, alive: 1, boom: 0 });
  const parts = [], floats = [];
  const score = { 1: 0, '-1': 0 };
  let hi = 31400, shake = 0, flash = 0, ko = 0, acc = 0, combo = 0, fever = 0, lastHeat = 0;
  function boom(x, y, n, cols, sp = 40) {
    for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, v = sp * (0.4 + R() * 0.8); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + R() * 0.4, t: 0, c: cols[i % cols.length] }); }
  }
  function invPos(o, t) {
    const march = Math.sin(t * 0.6) * 18;
    return [SW / 2 - 52 + o.i * 26 + march, o.end < 0 ? 22 + (Math.floor(t * 1.5) % 2) : SH - 22 - (Math.floor(t * 1.5) % 2)];
  }
  function draw(t, dt, heat) {
    const sx = shake > 0 ? Math.round((R() - 0.5) * 3) : 0, sy = shake > 0 ? Math.round((R() - 0.5) * 3) : 0;
    g.setTransform(1, 0, 0, 1, sx, sy);
    g.fillStyle = '#04050d'; g.fillRect(-4, -4, SW + 8, SH + 8);
    // 별 (열기가 오르면 빨라짐)
    for (const s of stars) {
      s.y = (s.y + s.v * dt * (1 + heat * 4)) % SH;
      g.fillStyle = s.c < 0.2 ? '#7fe0ff' : s.c < 0.3 ? '#ff7fd8' : `rgba(255,255,255,${0.35 + s.c * 0.4})`;
      g.fillRect(Math.floor(s.x), Math.floor(s.y), 1, heat > 0.6 ? 2 + Math.floor(heat * 3) : 1);
    }
    // 바닥 격자 (네온 원근 느낌, 은은하게)
    g.strokeStyle = `rgba(120,60,200,${0.18 + heat * 0.12})`; g.lineWidth = 1;
    const gy = (t * 12 * (1 + heat * 2)) % 16;
    for (let y = gy; y < SH; y += 16) { g.beginPath(); g.moveTo(0, Math.floor(y) + 0.5); g.lineTo(SW, Math.floor(y) + 0.5); g.stroke(); }
    for (let x = 0; x <= SW; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, SH); g.stroke(); }
    // 외계인
    for (const o of inv) {
      const [x, y] = invPos(o, t);
      if (o.alive) sprite(Math.floor(t * 2) % 2 ? INVADER : INVADER2, x, y, o.end < 0 ? 'rgba(120,255,140,0.55)' : 'rgba(255,200,90,0.55)', o.end < 0);
      else if ((o.respawn -= dt) < 0) o.alive = 1;
    }
    // 테두리 (= 경계선): 열기가 오르면 무지개, 피버면 깜빡
    const hue = (t * (20 + heat * 200)) % 360;
    const edge = heat > 0.85 ? `hsl(${hue},100%,62%)` : `hsl(${185 + heat * 80},100%,${55 + heat * 10}%)`;
    g.fillStyle = edge;
    g.fillRect(0, 0, SW, 2); g.fillRect(0, SH - 2, SW, 2); g.fillRect(0, 0, 2, SH); g.fillRect(SW - 2, 0, 2, SH);
    g.fillStyle = 'rgba(160,200,255,0.35)'; for (let y = 4; y < SH - 4; y += 6) g.fillRect(SW / 2, y, 1, 3); // 가운데 점선
    g.fillStyle = `hsl(${320 - heat * 40},100%,65%)`; g.fillRect(0, SH / 2 - 1, SW, 2); // 네트 줄
    // 점수판 (양 끝, 각자 바로 읽게)
    const pad = (n) => String(n).padStart(6, '0');
    say('1UP', 16, SH - 9, 1, '#ff5f8f'); say(pad(score[1]), 56, SH - 9, 1, '#ffffff');
    say('HI', 102, SH - 9, 1, '#7fe0ff'); say(pad(Math.max(hi, score[1], score[-1])), 136, SH - 9, 1, '#ffe14d');
    say('2UP', 16, 9, 1, '#ff5f8f', true); say(pad(score[-1]), 56, 9, 1, '#ffffff', true);
    say('HI', 102, 9, 1, '#7fe0ff', true); say(pad(Math.max(hi, score[1], score[-1])), 136, 9, 1, '#ffe14d', true);
    // 콤보 (랠리가 5번 넘으면 판 가운데 흐리게)
    if (combo >= 5 && !ko) {
      const a = 0.25 + heat * 0.25;
      say('COMBO', SW / 2, SH / 2 + 40, 2, `rgba(255,225,77,${a})`); say('x' + combo, SW / 2, SH / 2 + 58, 3, `rgba(255,95,143,${a})`);
      say('COMBO', SW / 2, SH / 2 - 40, 2, `rgba(255,225,77,${a})`, true); say('x' + combo, SW / 2, SH / 2 - 58, 3, `rgba(255,95,143,${a})`, true);
    }
    if (heat > 0.85 && !ko && Math.floor(t * 4) % 2) { say('FEVER!', SW / 2, SH / 2 + 22, 2, `hsl(${hue},100%,65%)`); say('FEVER!', SW / 2, SH / 2 - 22, 2, `hsl(${hue},100%,65%)`, true); }
    // 폭발 조각·떠오르는 글자
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t > p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      g.fillStyle = p.c; g.globalAlpha = 1 - p.t / p.life; g.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2); g.globalAlpha = 1;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt;
      if (f.t > f.life) { floats.splice(i, 1); continue; }
      const k = f.t / f.life;
      if (f.ring) { g.strokeStyle = f.c; g.globalAlpha = 1 - k; const r = 2 + k * f.ring; g.strokeRect(Math.floor(f.x - r) + 0.5, Math.floor(f.y - r) + 0.5, r * 2, r * 2); g.globalAlpha = 1; continue; }
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      say(f.s, f.x, f.y + (f.flip ? 1 : -1) * k * 14, f.size, f.c, f.flip);
      g.globalAlpha = 1;
    }
    // K.O.!
    if (ko > 0) {
      const on = Math.floor(ko * 8) % 2;
      say('K.O.!', SW / 2, SH * 0.75, 5, on ? '#ffe14d' : '#ff5f8f'); say('K.O.!', SW / 2, SH * 0.25, 5, on ? '#ffe14d' : '#ff5f8f', true);
      if (ko < 1.2) { say('PERFECT', SW / 2, SH * 0.75 + 26, 2, '#7fe0ff'); say('PERFECT', SW / 2, SH * 0.25 - 26, 2, '#7fe0ff', true); }
    }
    // 화면 번쩍 + 주사선
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.55})`; g.fillRect(0, 0, SW, SH); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < SH; y += 2) g.fillRect(0, y, SW, 1);
    scr.needsUpdate = true;
  }

  // ── 몸통: 테이블형 게임기 ──
  const art = canvasTex('arcade-side', 512, 192, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0f4d'); gr.addColorStop(1, '#0d0620'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const cols = ['#ff3d8b', '#ff9a3d', '#ffe14d', '#3de0ff'];
    cols.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(-40 + i * 22, h); c.lineTo(160 + i * 22, 0); c.lineTo(172 + i * 22, 0); c.lineTo(-28 + i * 22, h); c.fill(); });
    c.fillStyle = '#ffffff'; c.font = 'bold 44px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#ff3dd0'; c.shadowBlur = 14; c.fillText('SMASH 1985', w * 0.62, h * 0.42); c.shadowBlur = 0;
    c.font = 'bold 20px Jua, sans-serif'; c.fillStyle = '#7fe0ff'; c.fillText('준비하시고, 스매시!', w * 0.62, h * 0.72);
    for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(255,255,255,${0.1 + (i % 3) * 0.1})`; c.fillRect(w - 40 + (i % 3) * 9, 20 + Math.floor(i / 3) * 9, 6, 6); }
  });
  const artM = lam('#ffffff', { map: art });
  const black = shiny('#15151c', 70);
  const bodyH = TY - 0.12;
  put(root, new THREE.BoxGeometry(TABLE_W + 0.02, bodyH, TABLE_L + 0.02), [artM, artM, black, black, artM, artM], 0, 0.07 + bodyH / 2, 0);
  box(root, TABLE_W + 0.06, 0.07, TABLE_L + 0.06, black, 0, 0.035, 0);
  for (const x of [-0.7, 0.7]) for (const z of [-1.33, 1.33]) cyl(root, 0.03, 0.04, 0.02, shiny('#c9ced6', 90), x, 0.01, z);
  // 화면 테두리 (경계 바깥, 높이 = 판) + 크롬 띠
  const bez = shiny('#101016', 90), chrome = shiny('#d7dde5', 120);
  const bw = 0.05;
  for (const [w, d, x, z] of [[bw, TABLE_L + bw * 2, -HW - bw / 2, 0], [bw, TABLE_L + bw * 2, HW + bw / 2, 0], [TABLE_W, bw, 0, -HL - bw / 2], [TABLE_W, bw, 0, HL + bw / 2]]) box(root, w, 0.05, d, bez, x, TY - 0.025, z);
  for (const [w, d, x, z] of [[0.012, TABLE_L + bw * 4, -HW - bw - 0.006, 0], [0.012, TABLE_L + bw * 4, HW + bw + 0.006, 0], [TABLE_W + bw * 2, 0.012, 0, -HL - bw - 0.006], [TABLE_W + bw * 2, 0.012, 0, HL + bw + 0.006]]) box(root, w, 0.058, d, chrome, x, TY - 0.027, z);
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), new THREE.MeshBasicMaterial({ map: scr }), 0, TY - 0.004, 0, { shadow: false, rx: -Math.PI / 2 });
  // 유리 (반짝임) — 공은 유리 위(TY)에서 튄다
  const glint = canvasTex('arcade-glass', 128, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(0.58, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), new THREE.MeshPhongMaterial({ map: glint, transparent: true, opacity: 0.18, shininess: 140, specular: '#ffffff', depthWrite: false }), 0, TY, 0, { shadow: false, rx: -Math.PI / 2 });
  // 양 끝 조이스틱 판 (판보다 낮게, 선수 쪽으로 살짝)
  const pads = [];
  for (const s of [-1, 1]) {
    const pg = new THREE.Group();
    pg.position.set(0, TY - 0.085, s * (HL + 0.13));
    if (s < 0) pg.rotation.y = Math.PI;
    root.add(pg);
    put(pg, new THREE.BoxGeometry(0.62, 0.06, 0.16), black, 0, 0, 0).rotation.x = 0.18;
    box(pg, 0.6, 0.004, 0.13, lam('#2a0f4d'), 0, 0.033, 0.006, { shadow: false });
    const stick = new THREE.Group();
    stick.position.set(-0.16, 0.035, 0);
    pg.add(stick);
    cyl(stick, 0.006, 0.006, 0.08, chrome, 0, 0.04, 0);
    put(stick, new THREE.SphereGeometry(0.022, 16, 12), shiny('#e8283c', 100), 0, 0.085, 0);
    const btns = ['#ffe14d', '#3de0ff', '#ff3d8b'].map((col, i) => cyl(pg, 0.018, 0.018, 0.016, new THREE.MeshPhongMaterial({ color: col, emissive: col, emissiveIntensity: 0.15, shininess: 90 }), 0.0 + i * 0.065, 0.04, i === 1 ? -0.02 : 0.01));
    pads.push({ s, stick, btns, kick: 0, press: 0 });
  }
  // LED 띠 (밑단, 색이 흐름)
  const leds = [];
  for (const [w, d, x, z] of [[0.012, TABLE_L, -HW - 0.02, 0], [0.012, TABLE_L, HW + 0.02, 0], [TABLE_W, 0.012, 0, -HL - 0.02], [TABLE_W, 0.012, 0, HL + 0.02]]) leds.push(box(root, w, 0.012, d, new THREE.MeshBasicMaterial({ color: '#ff3dd0' }), x, 0.08, z, { shadow: false }));
  // 네트 = 홀로그램 격자 (비쳐 보임) + 네온 기둥
  const holo = canvasTex('arcade-net', 256, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(120,240,255,0.9)';
    for (let x = 0; x < w; x += 6) c.fillRect(x, 0, 1, h);
    for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1);
    c.fillRect(0, 0, w, 3);
  }, { repeat: true });
  const netM = new THREE.MeshBasicMaterial({ map: holo, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  put(root, new THREE.PlaneGeometry(1.83, NET_H), netM, 0, TY + NET_H / 2, 0, { shadow: false });
  const poles = [];
  for (const x of [-0.915, 0.915]) {
    poles.push(cyl(root, 0.01, 0.01, NET_H, new THREE.MeshBasicMaterial({ color: '#7fe0ff' }), x, TY + NET_H / 2, 0, { shadow: false }));
    put(root, new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), x, TY + NET_H + 0.006, 0, { shadow: false });
    cyl(root, 0.022, 0.026, 0.02, black, x, TY + 0.01, 0);
  }
  // 옆 소품 (-x): 'INSERT COIN' 네온 간판 / (+x): 바닥의 동전 더미
  const sign = canvasTex('arcade-sign', 256, 96, (c, w, h) => {
    c.fillStyle = '#0b0718'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ff3dd0'; c.lineWidth = 4; c.shadowColor = '#ff3dd0'; c.shadowBlur = 10; c.strokeRect(6, 6, w - 12, h - 12);
    c.font = 'bold 34px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe14d'; c.shadowColor = '#ffb300';
    c.fillText('INSERT COIN', w / 2, h / 2 + 2); c.shadowBlur = 0;
  });
  const sx = -(HW + 0.4), sz = 0.55;
  cyl(root, 0.015, 0.015, 0.9, chrome, sx, 0.45, sz);
  cyl(root, 0.12, 0.14, 0.02, black, sx, 0.01, sz);
  box(root, 0.06, 0.2, 0.52, black, sx, 0.98, sz);
  const signM = new THREE.MeshBasicMaterial({ map: sign });
  put(root, new THREE.PlaneGeometry(0.5, 0.19), signM, sx + 0.031, 0.98, sz, { shadow: false, ry: Math.PI / 2 });
  const coin = shiny('#f2c440', 100);
  for (let i = 0; i < 14; i++) { const c = cyl(root, 0.03, 0.03, 0.008, coin, HW + 0.3 + (i % 4) * 0.035 + (i > 9 ? 0.1 : 0), 0.004 + Math.floor(i / 4) * 0.008, -0.7 + (i % 3) * 0.01, {}, 18); c.rotation.z = i > 9 ? 0.3 : 0; }

  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      combo = st.rally || 0;
      shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 2.5); ko = Math.max(0, ko - dt);
      acc += dt;
      if (acc > 1 / 30) { draw(t, acc, heat); acc = 0; }
      const hue = ((t * (0.08 + heat * 0.5)) % 1);
      for (const [i, l] of leds.entries()) l.material.color.setHSL((hue + i * 0.12) % 1, 1, 0.55);
      netM.opacity = 0.45 + Math.sin(t * 9) * 0.05 + heat * 0.25;
      holo.offset.x = (t * 0.05) % 1;
      for (const p of poles) p.material.color.setHSL(0.52 - heat * 0.35, 1, 0.65);
      signM.color.setScalar(Math.floor(t * 1.4) % 4 === 3 ? 0.35 : 1); // 간판 깜빡
      for (const pd of pads) {
        // 공이 내 쪽으로 오면 조이스틱을 꽉 잡고 흔든다
        const near = st.ball ? clamp(1 - Math.abs(st.ball[2] - pd.s * HL) / 1.2, 0, 1) : 0;
        pd.kick = Math.max(0, pd.kick - dt * 3);
        pd.stick.rotation.x = Math.sin(t * 17) * 0.25 * near + pd.kick * 0.5;
        pd.stick.rotation.z = Math.sin(t * 13 + pd.s) * 0.3 * near;
        pd.press = Math.max(0, pd.press - dt * 6);
        pd.btns.forEach((b, i) => { b.position.y = 0.04 - (i === Math.floor(t * 7) % 3 ? pd.press * 0.008 : 0); b.material.emissiveIntensity = 0.15 + pd.press * 0.8 + heat * 0.3; });
      }
      if (fx && heat > 0.5 && R() < dt * heat * 6) { // 열기가 오르면 화면에서 픽셀이 톡톡
        fx.hit((emit) => emit({ tex: 'pix', n: 1, color: ['#ff3d8b', '#3de0ff', '#ffe14d', '#7dff6a'], size: 0.018, life: 0.7, speed: 0.1, up: 0.5, g: 0.3, rot: 0, spread: 0.01 }), [(R() - 0.5) * TABLE_W, TY + 0.01, (R() - 0.5) * TABLE_L], 0);
      }
      if (heat > 0.85 && lastHeat <= 0.85) flash = 0.6;
      lastHeat = heat;
    },
    bounce(p, smash, fx) {
      const [x, y] = toS(p[0], p[2]);
      const side = -half(p[2]); // 친 사람 = 반대쪽
      const pts = (smash ? 300 : 100) * Math.max(1, Math.min(9, combo));
      score[side] += pts;
      boom(x, y, smash ? 26 : 12, ['#ffe14d', '#ff5f8f', '#7fe0ff', '#ffffff'], smash ? 70 : 40);
      floats.push({ ring: smash ? 22 : 12, x, y, t: 0, life: 0.4, c: '#ffffff' });
      floats.push({ s: '+' + pts, x, y: y + (side > 0 ? -10 : 10), size: 1, c: '#ffe14d', t: 0, life: 0.9, flip: side < 0 });
      for (const o of inv) { // 근처 외계인은 퐁
        if (!o.alive) continue;
        const [ix, iy] = invPos(o, performance.now() / 1000);
        if (Math.hypot(ix - x, iy - y) < 22) { o.alive = 0; o.respawn = 4; boom(ix, iy, 14, ['#7dff6a', '#ffffff'], 45); score[side] += 500; floats.push({ s: '500', x: ix, y: iy, size: 1, c: '#7dff6a', t: 0, life: 0.8, flip: side < 0 }); }
      }
      if (smash) { shake = 0.25; flash = 0.25; }
      fx?.hit((emit) => {
        emit({ tex: 'pix', n: smash ? 10 : 4, color: ['#ff3d8b', '#3de0ff', '#ffe14d', '#7dff6a'], size: 0.02, life: 0.8, speed: smash ? 0.9 : 0.5, up: smash ? 1.6 : 1.0, g: 4, rot: 0, spread: 0.02 });
        emit({ tex: 'ring', n: 1, color: '#7fe0ff', size: 0.04, grow: smash ? 6 : 4, life: 0.35, speed: 0, up: 0, add: true });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    hit(p, smash) {
      const pd = pads.find((o) => o.s === half(p[2]));
      if (pd) { pd.kick = smash ? 1 : 0.5; pd.press = 1; }
    },
    score(info, fx) {
      ko = 2.4; flash = 1; shake = 0.6;
      const side = -half(info.z);
      score[side] += 5000;
      for (const o of inv) if (o.alive) { const [ix, iy] = invPos(o, performance.now() / 1000); o.alive = 0; o.respawn = 3; boom(ix, iy, 16, ['#7dff6a', '#ffe14d', '#ffffff'], 55); }
      for (let i = 0; i < 4; i++) boom(SW * (0.2 + i * 0.2), SH * (side > 0 ? 0.3 : 0.7), 18, ['#ffe14d', '#ff5f8f', '#7fe0ff'], 60);
      fx?.hit((emit) => {
        emit({ tex: 'pix', n: 40, color: ['#ff3d8b', '#3de0ff', '#ffe14d', '#7dff6a', '#ffffff'], size: 0.026, life: 1.6, speed: 1.4, up: 2.4, g: 3, drag: 0.6, spin: 6, spread: 0.4 });
        emit({ tex: 'star4', n: 6, color: ['#ffe14d', '#7fe0ff'], size: 0.12, grow: 0.3, life: 0.6, speed: 1, up: 1, add: true, spread: 0.4 });
      }, [0, TY + 0.05, info.z * 0.4], 0);
    },
  };
}

/* ════════════════════════════════════════════════════════════
   2. 마법 양탄자 (다리 없이 둥둥, 가장자리가 물결치고 술이 날림)
   ════════════════════════════════════════════════════════════ */
function carpet(root) {
  const TW = 640, TH = Math.round(640 * TABLE_L / TABLE_W);
  const gold = '#d9a441', ivory = '#f1e2bf', crimson = '#7a1424', indigo = '#1f2a5c';
  // 무늬 그리기 (glow = 금빛 무늬만 따로 → 빛나는 겹)
  const motif = (c, x, y, s, col) => { // 여덟 갈래 별
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? s * 0.45 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath(); c.fill();
  };
  const paisley = (c, x, y, s, rot, col) => {
    c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col;
    c.beginPath(); c.moveTo(0, -s); c.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.8, s * 0.7, 0, s * 0.6); c.bezierCurveTo(-s * 0.6, s * 0.5, -s * 0.5, -s * 0.1, 0, -s); c.fill();
    c.restore();
  };
  function rug(c, w, h, glow) {
    const r = rng(111);
    const G = glow ? '#ffd77a' : gold, BG = glow ? 'rgba(0,0,0,0)' : crimson;
    c.clearRect(0, 0, w, h);
    if (!glow) {
      c.fillStyle = crimson; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,200,180,0.05)'; c.fillRect(r() * w, r() * h, 1.5, 1.5); } // 털실 결
    }
    const B1 = 10, B2 = 46;
    if (!glow) { c.fillStyle = gold; c.fillRect(0, 0, w, B1); c.fillRect(0, h - B1, w, B1); c.fillRect(0, 0, B1, h); c.fillRect(w - B1, 0, B1, h); }
    if (!glow) { c.fillStyle = indigo; c.fillRect(B1, B1, w - B1 * 2, B2 - B1); c.fillRect(B1, h - B2, w - B1 * 2, B2 - B1); c.fillRect(B1, B1, B2 - B1, h - B1 * 2); c.fillRect(w - B2, B1, B2 - B1, h - B1 * 2); }
    // 테두리 띠 무늬
    for (let x = B2; x < w - B2; x += 26) { motif(c, x + 13, (B1 + B2) / 2, 11, G); motif(c, x + 13, h - (B1 + B2) / 2, 11, G); }
    for (let y = B2; y < h - B2; y += 26) { motif(c, (B1 + B2) / 2, y + 13, 11, G); motif(c, w - (B1 + B2) / 2, y + 13, 11, G); }
    c.strokeStyle = G; c.lineWidth = 3; c.strokeRect(B2 + 4, B2 + 4, w - B2 * 2 - 8, h - B2 * 2 - 8);
    // 바탕의 작은 무늬 (어둡게: 공이 잘 보이게)
    if (!glow) for (let i = 0; i < 60; i++) paisley(c, B2 + 20 + r() * (w - B2 * 2 - 40), B2 + 20 + r() * (h - B2 * 2 - 40), 9, r() * 6, 'rgba(217,164,65,0.28)');
    // 반쪽마다 가운데 메달리온
    for (const cy of [h * 0.25, h * 0.75]) {
      const cx = w / 2;
      if (!glow) { c.fillStyle = indigo; c.beginPath(); c.moveTo(cx, cy - 120); c.lineTo(cx + 150, cy); c.lineTo(cx, cy + 120); c.lineTo(cx - 150, cy); c.closePath(); c.fill(); }
      c.strokeStyle = G; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy - 120); c.lineTo(cx + 150, cy); c.lineTo(cx, cy + 120); c.lineTo(cx - 150, cy); c.closePath(); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy - 100); c.lineTo(cx + 126, cy); c.lineTo(cx, cy + 100); c.lineTo(cx - 126, cy); c.closePath(); c.stroke();
      motif(c, cx, cy, 44, glow ? G : 'rgba(217,164,65,0.75)');
      if (!glow) motif(c, cx, cy, 22, crimson);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; paisley(c, cx + Math.cos(a) * 72, cy + Math.sin(a) * 60, 10, a + Math.PI / 2, glow ? G : 'rgba(241,226,191,0.45)'); }
    }
    // 모서리 장식
    for (const [x, y] of [[B2, B2], [w - B2, B2], [B2, h - B2], [w - B2, h - B2], [B2, h / 2], [w - B2, h / 2]]) {
      if (!glow) { c.fillStyle = indigo; c.beginPath(); c.arc(x, y, 52, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = G; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 52, 0, Math.PI * 2); c.stroke();
      motif(c, x, y, 20, glow ? G : 'rgba(217,164,65,0.6)');
    }
    if (!glow) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h / 2 - 2, w, 4); } // 가운데 접힌 자국
    void BG; void ivory;
  }
  const tex = canvasTex('carpet', TW, TH, (c, w, h) => rug(c, w, h, false));
  const glowTex = canvasTex('carpet-glow', TW, TH, (c, w, h) => rug(c, w, h, true), { alpha: true });
  // 양탄자: 가운데는 평평, 가장자리 12cm만 물결 (공이 튀는 자리는 그대로)
  const geo = new THREE.PlaneGeometry(TABLE_W, TABLE_L, 30, 56);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const edgeK = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; edgeK[i] = 1 - smooth(0, 0.16, Math.min(HW - Math.abs(x), HL - Math.abs(z))); }
  const rugG = new THREE.Group();
  root.add(rugG);
  const top = put(rugG, geo, lam('#ffffff', { map: tex }), 0, TY, 0, { shadow: true });
  put(rugG, geo, lam('#4a0c16', { side: THREE.BackSide }), 0, TY - 0.003, 0, { shadow: false });
  const glowM = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  put(rugG, geo, glowM, 0, TY + 0.0015, 0, { shadow: false });
  // 술 (양 끝)
  const tassels = [];
  const tasselM = lam('#e8c26a');
  const tg = new THREE.ConeGeometry(0.012, 0.07, 6);
  for (const s of [-1, 1]) for (let i = 0; i < 17; i++) {
    const x = -HW + 0.04 + i * ((TABLE_W - 0.08) / 16);
    const m = put(rugG, tg, tasselM, x, TY - 0.035, s * (HL + 0.03), { shadow: false });
    // 가장 가까운 꼭짓점 (가장자리를 따라 움직임)
    let best = 0, bd = 9;
    for (let k = 0; k < pos.count; k++) { const d = Math.hypot(base[k * 3] - x, base[k * 3 + 2] - s * HL); if (d < bd) { bd = d; best = k; } }
    tassels.push({ m, v: best, s, ph: R() * 6 });
  }
  const ripples = [];
  let swell = null, curl = null, pulse = 0;
  function shape(t, heat) {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2], e = edgeK[i];
      let y = e * (0.014 + heat * 0.01) * Math.sin(t * 2.2 + z * 3.1 + x * 2.3) + e * 0.006 * Math.sin(t * 3.7 - z * 5);
      for (const r of ripples) {
        const d = Math.hypot(x - r.x, z - r.z), a = r.t;
        if (d < a * 1.4 + 0.1) y += r.A * Math.exp(-a * 3) * Math.sin(12 * (d - a * 1.4)) * Math.exp(-d * 1.5) * (0.3 + e);
      }
      if (swell) { const a = swell.t; y += 0.016 * Math.exp(-a * 1.6) * Math.sin(7 * (z * swell.dir) - a * 13) * (0.35 + e * 0.65); }
      if (curl) { const k = Math.sin(clamp(curl.t / 1.4, 0, 1) * Math.PI); const d = clamp((Math.abs(z) - (HL - 0.45)) / 0.45, 0, 1) * (Math.sign(z) === curl.s ? 1 : 0); y += k * 0.22 * d * d * (1 + Math.sin(curl.t * 10) * 0.15); }
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  // 네트 = 둥둥 뜬 금 막대 + 구슬 발 (틈으로 보임)
  const net = new THREE.Group();
  root.add(net);
  const goldM = shiny('#e0b04a', 110);
  put(net, new THREE.CylinderGeometry(0.008, 0.008, 1.86, 10), goldM, 0, TY + NET_H, 0, { rz: Math.PI / 2 });
  for (const s of [-1, 1]) {
    put(net, new THREE.SphereGeometry(0.02, 14, 10), goldM, s * 0.94, TY + NET_H, 0);
    put(net, new THREE.ConeGeometry(0.014, 0.045, 10), goldM, s * 0.94, TY + NET_H + 0.035, 0);
    put(net, new THREE.OctahedronGeometry(0.016), shiny('#d8143a', 140), s * 0.94, TY + NET_H, 0.016);
  }
  const beadCols = [shiny('#e0b04a', 120), shiny('#2ec4b6', 120), shiny('#c8143a', 120)];
  const beadG = new THREE.SphereGeometry(0.0095, 10, 8);
  const strands = [];
  for (let i = 0; i < 19; i++) {
    const st = new THREE.Group();
    st.position.set(-0.9 + i * 0.1, TY + NET_H, 0);
    net.add(st);
    for (let k = 0; k < 6; k++) put(st, beadG, beadCols[(i + k) % 3], 0, -0.014 - k * 0.022, 0, { shadow: false });
    strands.push({ st, sw: 0, ph: i * 0.6 });
  }
  // 옆 소품 (-x): 둥둥 뜬 요술 램프 / (+x): 비단 방석 (낮음)
  const lamp = new THREE.Group();
  lamp.position.set(-(HW + 0.42), TY + 0.12, 0.3);
  root.add(lamp);
  const lp = [[0, 0], [0.05, 0], [0.06, 0.01], [0.04, 0.02], [0.09, 0.05], [0.1, 0.08], [0.07, 0.11], [0.03, 0.12], [0.035, 0.15], [0.012, 0.17], [0.0, 0.18]].map(([a, b]) => new THREE.Vector2(a, b));
  const body = put(lamp, new THREE.LatheGeometry(lp, 28), goldM, 0, 0, 0);
  body.scale.set(1, 1, 0.75);
  const spoutC = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.08, 0.07, 0), new THREE.Vector3(-0.15, 0.09, 0), new THREE.Vector3(-0.2, 0.14, 0)]);
  put(lamp, new THREE.TubeGeometry(spoutC, 12, 0.015, 8), goldM);
  put(lamp, new THREE.TorusGeometry(0.045, 0.01, 8, 16, Math.PI * 1.3), goldM, 0.1, 0.09, 0, { rz: -0.6 });
  put(lamp, new THREE.OctahedronGeometry(0.014), shiny('#2ec4b6', 140), 0, 0.19, 0);
  const smoke = steamer([0, 0, 0], { every: 0.25, color: '#b48cff', size: 0.04, up: 0.12, alpha: 0.35, life: 1.6 });
  for (const [y, col, ry] of [[0.045, '#3a2a7a', 0.2], [0.12, '#b0204a', -0.25]]) {
    const cu = put(root, roundBox(0.5, 0.09, 0.5, 0.12, 0.04), lam(col), HW + 0.42, y, -0.6);
    cu.rotation.y = ry;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(cu, tg, tasselM, dx * 0.22, 0, dz * 0.22, { shadow: false, rx: Math.PI });
  }
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      for (const r of ripples) r.t += dt;
      while (ripples.length && ripples[0].t > 1.6) ripples.shift();
      if (swell) { swell.t += dt; if (swell.t > 2.2) swell = null; }
      if (curl) { curl.t += dt; if (curl.t > 1.6) curl = null; }
      shape(t, heat);
      const bob = Math.sin(t * 1.3) * 0.003;
      rugG.position.y = bob;
      net.position.y = bob + Math.sin(t * 1.3 + 0.4) * 0.002;
      for (const ts of tassels) {
        const v = ts.v;
        ts.m.position.set(base[v * 3], TY + pos.array[v * 3 + 1] - 0.035, ts.s * (HL + 0.03));
        ts.m.rotation.x = ts.s * (0.15 + Math.sin(t * 3 + ts.ph) * 0.25 + (curl && curl.s === ts.s ? 0.8 : 0)) + Math.PI;
      }
      for (const s of strands) { s.sw = Math.max(0, s.sw - dt * 0.8); s.st.rotation.x = Math.sin(t * 2.1 + s.ph) * (0.06 + s.sw * 0.5); s.st.rotation.z = Math.sin(t * 1.7 + s.ph) * 0.04; }
      pulse = Math.max(0, pulse - dt * 1.6);
      glowM.opacity = clamp(0.06 + heat * 0.35 + pulse * 0.6 + Math.sin(t * 2) * 0.03, 0, 1);
      lamp.position.y = TY + 0.12 + Math.sin(t * 1.1) * 0.03;
      lamp.rotation.y = Math.sin(t * 0.5) * 0.4;
      if (fx) {
        const lampTip = new THREE.Vector3(-0.2, 0.14, 0).applyMatrix4(lamp.matrixWorld);
        smoke({ hit: (fn, _p, lv) => fx.hit(fn, [lampTip.x, lampTip.y, lampTip.z], lv) }, dt);
        if (R() < dt * (3 + heat * 14)) { // 아래로 떨어지는 반짝이 가루
          const ex = (R() < 0.5 ? -1 : 1) * (HW + 0.01), ez = (R() - 0.5) * TABLE_L;
          const [px, pz] = R() < 0.5 ? [ex, ez] : [(R() - 0.5) * TABLE_W, (R() < 0.5 ? -1 : 1) * (HL + 0.01)];
          fx.hit((emit) => emit({ tex: 'star4', n: 1, color: ['#ffd77a', '#fff1c0', '#c9a6ff'], size: 0.025 + heat * 0.015, life: 1.4, speed: 0.04, up: -0.1, g: 0.08, add: true, spin: 2, spread: 0.01 }), [px, TY - 0.02, pz], 0);
        }
      }
    },
    bounce(p, smash, fx) {
      ripples.push({ x: p[0], z: p[2], t: 0, A: smash ? 0.012 : 0.007 });
      pulse = Math.min(1, pulse + (smash ? 0.9 : 0.45));
      for (const s of strands) s.sw = Math.max(s.sw, Math.max(0, 1 - Math.hypot(s.st.position.x - p[0], p[2]) / 0.9) * (smash ? 1 : 0.5));
      if (smash) swell = { t: 0, dir: -half(p[2]) };
      fx?.hit((emit) => {
        emit({ tex: 'ring', n: 1, color: '#ffd77a', size: 0.04, grow: smash ? 6 : 4, life: 0.5, speed: 0, up: 0, add: true, alpha: 0.8 });
        emit({ tex: 'star4', n: smash ? 8 : 4, color: ['#ffd77a', '#ffffff', '#c9a6ff'], size: 0.035, life: 0.9, speed: 0.4, up: 0.6, g: -0.2, drag: 1.5, add: true, spin: 3, spread: 0.03 });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    score(info, fx) {
      curl = { t: 0, s: half(info.z) };
      pulse = 1;
      fx?.hit((emit) => {
        emit({ tex: 'star4', n: 26, color: ['#ffd77a', '#fff1c0', '#c9a6ff', '#7fe0ff'], size: 0.06, life: 1.6, speed: 1.2, up: 1.4, g: 0.5, drag: 1.2, add: true, spin: 4, spread: 0.3 });
        emit({ tex: 'puff', n: 6, color: ['#b48cff', '#e0b0ff'], size: 0.18, grow: 2.5, life: 1.4, speed: 0.4, up: 0.4, alpha: 0.4, spread: 0.2 });
      }, [info.x * 0.5, TY + 0.1, info.z * 0.85], 0);
      const lp2 = lamp.position;
      fx?.hit((emit) => emit({ tex: 'puff', n: 8, color: ['#b48cff', '#7f5cff'], size: 0.1, grow: 3, life: 1.8, speed: 0.3, up: 0.5, alpha: 0.5 }), [lp2.x - 0.2, lp2.y + 0.14, lp2.z], 0);
    },
  };
}

/* ════════════════════════════════════════════════════════════
   3. 거대 거북이 (등껍질이 판, 머리는 -x 쪽에서 공을 따라봄)
   ════════════════════════════════════════════════════════════ */
function turtle(root) {
  const skin = '#8fbf6a', skinD = '#6f9f4e';
  // 등껍질 무늬: 가운데 줄 육각 + 양옆 큰 칸, 칸마다 나이테
  const scute = (c, w, h, glow) => {
    if (!glow) { c.fillStyle = '#4f4628'; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
    const rows = 6, cell = h / rows;
    const draw = (pts, i) => {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const path = (sc) => { c.beginPath(); pts.forEach(([x, y], j) => { const X = cx + (x - cx) * sc, Y = cy + (y - cy) * sc; j ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
      if (!glow) {
        const rad = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
        const gr = c.createRadialGradient(cx, cy - rad * 0.15, rad * 0.05, cx, cy, rad);
        gr.addColorStop(0, `hsl(${44 + (i % 3) * 5}, 38%, 40%)`); gr.addColorStop(0.55, `hsl(${46 + (i % 2) * 4}, 34%, 30%)`); gr.addColorStop(1, 'hsl(40, 30%, 19%)');
        path(0.97); c.fillStyle = gr; c.fill();
        c.lineWidth = 1.6; c.strokeStyle = 'rgba(40,30,12,0.3)';
        for (const sc of [0.82, 0.66, 0.5, 0.35]) { path(sc); c.stroke(); } // 나이테
        path(0.2); c.fillStyle = 'rgba(200,180,110,0.18)'; c.fill();
      }
      c.strokeStyle = glow ? '#9dffc8' : '#241c0e'; c.lineWidth = glow ? 5 : 6; c.lineJoin = 'round';
      path(1); c.stroke();
    };
    const mw = w * 0.36;
    for (let r = 0; r < rows; r++) { // 가운데 (척추) 칸
      const y0 = r * cell, y1 = y0 + cell;
      draw([[w / 2 - mw / 2, y0 + cell * 0.15], [w / 2, y0], [w / 2 + mw / 2, y0 + cell * 0.15], [w / 2 + mw / 2, y1 - cell * 0.15 + (r === rows - 1 ? cell * 0.15 : 0)], [w / 2, y1], [w / 2 - mw / 2, y1 - cell * 0.15 + (r === rows - 1 ? cell * 0.15 : 0)]], r);
    }
    for (const s of [-1, 1]) for (let r = 0; r < 5; r++) { // 양옆 칸
      const y0 = r * (h / 5), y1 = y0 + h / 5, xi = w / 2 + s * mw / 2, xo = s > 0 ? w : 0;
      draw([[xi, y0 + cell * 0.15], [xo, y0], [xo, y1], [xi, y1 - cell * 0.15]], r + 3);
    }
    if (!glow) {
      const r2 = rng(121); for (let k = 0; k < 900; k++) { c.fillStyle = r2() < 0.5 ? 'rgba(90,120,50,0.18)' : 'rgba(20,15,5,0.15)'; c.fillRect(r2() * w, r2() * h, 2, 2); } // 이끼·얼룩
      c.strokeStyle = '#c9b77a'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); // 가장자리 = 경계선 (밝은 띠)
    }
  };
  const tex = canvasTex('turtle-top', 512, 920, (c, w, h) => scute(c, w, h, false));
  const glowTex = canvasTex('turtle-glow', 512, 920, (c, w, h) => scute(c, w, h, true), { alpha: true });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), lam('#ffffff', { map: tex }), 0, TY + 0.0008, 0, { shadow: false, rx: -Math.PI / 2 });
  const glowM = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), glowM, 0, TY + 0.0016, 0, { shadow: false, rx: -Math.PI / 2 });
  // 등껍질 판·치마·배딱지
  put(root, slab(superShape(HW + 0.07, HL + 0.07, 5), 0.06, 0.02), lam('#8a7446'), 0, TY - 0.06, 0);
  const skirt = put(root, slab(superShape(HW + 0.15, HL + 0.15, 4), 0.2, 0.08), lam('#5e4d2c'), 0, TY - 0.24, 0);
  skirt.scale.y = 1;
  for (let i = 0; i < 26; i++) { // 가장자리 비늘 홈
    const a = (i / 26) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const x = (HW + 0.16) * Math.sign(c) * Math.abs(c) ** 0.5, z = (HL + 0.16) * Math.sign(s) * Math.abs(s) ** 0.5;
    const m = box(root, 0.012, 0.16, 0.03, lam('#3e321c'), x, TY - 0.15, z, { shadow: false });
    m.rotation.y = Math.atan2(x / (HW * HW), z / (HL * HL));
  }
  put(root, slab(superShape(HW - 0.05, HL - 0.1, 4), 0.1, 0.04), lam('#e6d28a'), 0, TY - 0.33, 0);
  // 다리 4개 (코끼리 다리처럼 굵게 + 발톱)
  const legM = lam(skin);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lg = new THREE.Group();
    lg.position.set(sx * (HW + 0.02), 0, sz * (HL - 0.25));
    root.add(lg);
    const pts = [[0, 0], [0.14, 0], [0.15, 0.04], [0.13, 0.12], [0.12, 0.3], [0.13, 0.45], [0.0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b));
    put(lg, new THREE.LatheGeometry(pts, 20), legM);
    for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.5 + (sx < 0 ? Math.PI : 0); put(lg, new THREE.SphereGeometry(0.028, 10, 8), lam('#f2ead2'), Math.cos(a) * 0.13, 0.025, Math.sin(a) * 0.13); }
    for (let k = 0; k < 4; k++) put(lg, new THREE.CircleGeometry(0.02, 10), lam(skinD), Math.cos(k * 1.7) * 0.131, 0.2 + k * 0.05, Math.sin(k * 1.7) * 0.131, { shadow: false, ry: -k * 1.7 + Math.PI / 2 });
    legs.push(lg);
  }
  // 꼬리 (+x)
  const tail = new THREE.Group();
  tail.position.set(HW + 0.12, 0.42, 0);
  root.add(tail);
  put(tail, new THREE.ConeGeometry(0.05, 0.16, 12), legM, 0.07, 0, 0, { rz: -Math.PI / 2 - 0.3 });
  // 목 + 머리 (-x)
  const neck = new THREE.Group();
  neck.position.set(-(HW + 0.12), 0.56, 0);
  root.add(neck);
  const neckM = put(neck, new THREE.CylinderGeometry(0.13, 0.16, 0.42, 18), legM, -0.15, 0.12, 0, { rz: Math.PI / 2 - 0.6 });
  for (let k = 0; k < 4; k++) put(neckM, new THREE.TorusGeometry(0.12 + k * 0.006, 0.006, 6, 20), lam(skinD), 0, -0.1 + k * 0.06, 0, { rx: Math.PI / 2, shadow: false });
  const head = new THREE.Group();
  head.position.set(-0.34, 0.3, 0);
  head.scale.setScalar(1.55);
  neck.add(head);
  const skull = put(head, new THREE.SphereGeometry(0.17, 28, 20), legM, 0, 0, 0);
  skull.scale.set(1.15, 0.92, 1.0);
  for (let k = 0; k < 7; k++) { const a = k * 0.9; const sp = put(head, new THREE.CircleGeometry(0.022 - (k % 3) * 0.005, 10), lam(skinD), 0.02 + Math.cos(a) * 0.06, 0.1 + Math.sin(k) * 0.03, Math.sin(a) * 0.15, { shadow: false }); sp.lookAt(head.position.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, 1, Math.sin(a)))); }
  const eyes = [-1, 1].map((s) => cuteEye(head, -0.12, 0.06, s * 0.085, 0.055, { lid: skin }));
  for (const s of [-1, 1]) put(head, new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: '#ff9bb0', transparent: true, opacity: 0.65 }), -0.15, -0.025, s * 0.12, { shadow: false, ry: -Math.PI / 2 - s * 0.6 });
  const mouth = put(head, new THREE.TorusGeometry(0.04, 0.006, 6, 18, Math.PI * 0.7), lam('#2b2a33'), -0.19, -0.02, 0, { shadow: false, ry: Math.PI / 2, rz: -Math.PI / 2 - Math.PI * 0.35 });
  const open = put(head, new THREE.SphereGeometry(0.035, 14, 10), lam('#7a2c3a'), -0.18, -0.06, 0, { shadow: false });
  open.scale.set(0.4, 0.05, 1);
  for (const s of [-1, 1]) put(head, new THREE.SphereGeometry(0.006, 6, 6), lam('#2b2a33'), -0.195, 0.02, s * 0.022, { shadow: false });
  // 네트 = 낡은 나뭇가지 기둥 + 그물 + 부표 + 미역
  const drift = lam('#9a8c78');
  for (const x of [-0.93, 0.93]) { const d = cyl(root, 0.022, 0.03, TY + NET_H + 0.06, drift, x, (TY + NET_H + 0.06) / 2, 0, {}, 8); d.rotation.z = x > 0 ? -0.04 : 0.05; }
  const fishnet = canvasTex('fishnet', 256, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(230,215,180,0.95)'; c.lineWidth = 1.2;
    for (let x = -h; x < w + h; x += 10) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); c.beginPath(); c.moveTo(x + h, 0); c.lineTo(x, h); c.stroke(); }
    c.fillStyle = 'rgba(230,215,180,1)'; c.fillRect(0, 0, w, 2);
  });
  put(root, new THREE.PlaneGeometry(1.86, NET_H), new THREE.MeshLambertMaterial({ map: fishnet, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 0, TY + NET_H / 2, 0, { shadow: false });
  const floats = [];
  for (let i = 0; i < 7; i++) floats.push(put(root, new THREE.SphereGeometry(0.022, 14, 10), shiny(i % 2 ? '#ffffff' : '#ff7a2a', 90), -0.75 + i * 0.25, TY + NET_H, 0));
  const kelpM = new THREE.MeshLambertMaterial({ color: '#3f8a4a', side: THREE.DoubleSide });
  const kelps = [];
  for (const x of [-0.6, 0.15, 0.62]) {
    const kg = new THREE.PlaneGeometry(0.035, 0.14, 1, 8);
    const kb = Float32Array.from(kg.attributes.position.array);
    const k = put(root, kg, kelpM, x, TY + NET_H - 0.07, 0.004, { shadow: false });
    kelps.push({ k, kg, kb, ph: x * 5 });
  }
  // 옆 소품 (+x, 낮음): 모래밭 + 불가사리 + 소라 + 옆으로 걷는 꽃게
  put(root, new THREE.CircleGeometry(0.42, 28), lam('#e8d3a0'), HW + 0.45, 0.003, -0.55, { rx: -Math.PI / 2, shadow: false });
  const starS = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.025 : 0.065; i ? starS.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starS.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  put(root, new THREE.ExtrudeGeometry(starS, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), lam('#ff8a5a'), HW + 0.32, 0.012, -0.4, { rx: -Math.PI / 2 });
  const shell = put(root, new THREE.ConeGeometry(0.04, 0.12, 14), shiny('#f7d9c4', 60), HW + 0.6, 0.04, -0.75, { rz: Math.PI / 2 + 0.2 });
  shell.scale.set(1, 1, 0.8);
  const crab = new THREE.Group();
  crab.position.set(HW + 0.5, 0, -0.5);
  root.add(crab);
  const crabM = shiny('#e8473a', 60);
  put(crab, new THREE.SphereGeometry(0.06, 16, 10), crabM, 0, 0.05, 0).scale.set(1, 0.55, 0.8);
  for (const s of [-1, 1]) {
    cyl(crab, 0.004, 0.004, 0.04, crabM, -0.02, 0.1, s * 0.02);
    put(crab, new THREE.SphereGeometry(0.012, 8, 6), lam('#ffffff'), -0.02, 0.12, s * 0.02);
    put(crab, new THREE.SphereGeometry(0.006, 6, 6), lam('#111'), -0.03, 0.123, s * 0.02);
    put(crab, new THREE.SphereGeometry(0.025, 10, 8), crabM, -0.07, 0.05, s * 0.06).scale.set(1.2, 0.8, 0.8);
    for (let k = 0; k < 3; k++) { const l = cyl(crab, 0.004, 0.004, 0.07, crabM, 0.01 + k * 0.02, 0.025, s * 0.06); l.rotation.x = s * 0.9; }
  }
  const blink = blinker();
  let retract = 0, peek = -1, wide = 0, happy = 0, nod = 0, crabT = 0;
  const neckOut = neck.position.clone();
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      // 등껍질 무늬 빛
      happy = Math.max(0, happy - dt);
      glowM.opacity = Math.max(glowM.opacity - dt * 1.4, heat * 0.3 + Math.sin(t * 2.5) * 0.04 * heat);
      // 쏙 들어갔다가 빼꼼 (득점 연출)
      let out = 1;
      if (peek >= 0) {
        peek += dt;
        out = peek < 0.25 ? 1 - ease(peek / 0.25) : peek < 1.4 ? 0 : peek < 1.8 ? 0.35 * ease((peek - 1.4) / 0.4) : peek < 2.4 ? 0.35 : peek < 2.8 ? lerp(0.35, 1, ease((peek - 2.4) / 0.4)) : 1;
        if (peek > 2.8) { peek = -1; happy = 1.5; }
      }
      neck.position.x = neckOut.x + (1 - out) * 0.42;
      neck.scale.setScalar(0.4 + out * 0.6);
      for (const lg of legs) lg.scale.y = 0.3 + out * 0.7;
      tail.scale.setScalar(out);
      // 공 따라보기 + 깜빡임 + 끄덕
      const hw = new THREE.Vector3(); head.getWorldPosition(hw);
      follow(head, hw, st.ball, dt, { maxYaw: 0.9 });
      nod = Math.max(0, nod - dt * 3);
      head.position.y = 0.3 + Math.sin(t * (1.5 + heat * 5)) * (0.006 + heat * 0.012) - nod * 0.03;
      const b = peek >= 0 && peek > 1.4 && peek < 2.4 ? 0 : blink(dt);
      wide = Math.max(0, wide - dt * 1.2);
      for (const e of eyes) {
        e.blink(happy > 0 ? 0.55 : b);
        e.size(1 - wide * 0.45 + heat * 0.15);
        if (st.ball) { const dz = st.ball[2] - hw.z; e.look(clamp(dz, -1, 1) * 0.6, clamp(st.ball[1] - hw.y, -1, 1)); }
        e.hl1.scale.setScalar(1 + heat * 0.8);
      }
      open.scale.y = 0.05 + (happy > 0 ? 0.6 : 0) + (wide > 0.3 ? 0.8 : 0);
      mouth.visible = open.scale.y < 0.3; open.visible = !mouth.visible;
      tail.rotation.y = Math.sin(t * (2 + heat * 6)) * 0.4;
      for (const f of floats) f.position.y = TY + NET_H + Math.sin(t * 2 + f.position.x * 4) * 0.004;
      for (const kp of kelps) {
        const pa = kp.kg.attributes.position;
        for (let v = 0; v < pa.count; v++) { const y = kp.kb[v * 3 + 1]; pa.array[v * 3] = kp.kb[v * 3] + Math.sin(t * 2 + kp.ph + y * 20) * 0.012 * (0.07 - y) * 10; }
        pa.needsUpdate = true;
      }
      // 꽃게: 옆으로 종종종
      crabT += dt;
      crab.position.z = -0.5 + Math.sin(crabT * 0.6) * 0.25;
      crab.position.y = Math.abs(Math.sin(crabT * 14)) * 0.006;
      if (fx && heat > 0.6 && R() < dt * heat * 1.5) fx.hit((emit) => emit({ tex: 'heart', n: 1, color: '#ff8fb3', size: 0.04, grow: 1.3, life: 1.2, speed: 0.05, up: 0.3, g: -0.1, drag: 1, rot: 0 }), [hw.x - 0.1, hw.y + 0.15, hw.z], 0);
    },
    bounce(p, smash, fx) {
      glowM.opacity = smash ? 0.9 : 0.55;
      nod = 1;
      if (smash) wide = 1;
      fx?.hit((emit) => {
        emit({ tex: 'ring', n: 1, color: '#9dffc8', size: 0.04, grow: smash ? 6 : 4, life: 0.45, speed: 0, up: 0, add: true, alpha: 0.8 });
        emit({ tex: 'drop', n: smash ? 10 : 5, color: ['#8fdcff', '#c9f0ff', '#5cc4f5'], size: 0.02, life: 0.6, speed: 0.9, up: 1.4, g: 7, rot: 0, floor: TY + 0.004 });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    score(info, fx) {
      peek = 0;
      const hw = new THREE.Vector3(); head.getWorldPosition(hw);
      fx?.hit((emit) => emit({ tex: 'excl', n: 1, color: '#ffffff', size: 0.16, grow: 1.2, life: 1.0, speed: 0, up: 0.4, drag: 3, rot: 0, pop: true }), [hw.x, hw.y + 0.28, hw.z], 0);
      fx?.hit((emit) => emit({ tex: 'drop', n: 18, color: ['#8fdcff', '#c9f0ff'], size: 0.025, life: 0.9, speed: 1.2, up: 1.8, g: 6, rot: 0, spread: 0.2 }), [info.x * 0.5, TY + 0.02, info.z * 0.8], 0);
    },
  };
}

/* ════════════════════════════════════════════════════════════
   4. 초콜릿 생일 케이크 (초 = 네트)
   ════════════════════════════════════════════════════════════ */
function cake(root) {
  const CH = 0.26; // 케이크 높이
  const ganache = canvasTex('cake-top', 512, 920, (c, w, h) => {
    const r = rng(131);
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3b1e12'); gr.addColorStop(0.5, '#2e170d'); gr.addColorStop(1, '#3a1d11');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { // 매끈한 소용돌이 윤기
      c.strokeStyle = `rgba(140,80,50,${0.06 + r() * 0.08})`; c.lineWidth = 4 + r() * 10;
      const x = r() * w, y = r() * h; c.beginPath(); c.arc(x, y, 30 + r() * 80, r() * 6, r() * 6 + 1.5); c.stroke();
    }
    const cols = ['#ff6b81', '#ffd43b', '#69db7c', '#4dabf7', '#f783ac', '#ffffff'];
    for (let i = 0; i < 160; i++) { // 스프링클 (작고 드문드문)
      c.save(); c.translate(14 + r() * (w - 28), 14 + r() * (h - 28)); c.rotate(r() * 6);
      c.fillStyle = cols[Math.floor(r() * cols.length)]; c.globalAlpha = 0.8; rrect(c, -4, -1.3, 8, 2.6, 1.3); c.fill(); c.restore();
    }
    c.strokeStyle = 'rgba(255,240,220,0.55)'; c.lineWidth = 5; c.setLineDash([2, 9]); c.lineCap = 'round'; c.strokeRect(6, 6, w - 12, h - 12); // 경계: 작은 크림 점선
  });
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  const topM = new THREE.MeshPhongMaterial({ map: ganache, shininess: 70, specular: '#6a3a24' });
  const top = softTop(root, TABLE_W, TABLE_L, topM, { y: TY, segW: 30, segL: 54, radius: 0.15 });
  // 몸통: 초코 버터크림 + 가나슈가 흘러내림 (옆면 그림, 위쪽 가장자리)
  const W2 = TABLE_W + 0.1, L2 = TABLE_L + 0.1;
  const sideTex = (key, len, words) => canvasTex(key, 1024, 256, (c, w, h) => {
    const r = rng(key.length * 7);
    c.fillStyle = '#7a4a2a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { c.strokeStyle = 'rgba(60,30,15,0.12)'; c.lineWidth = 3; const y = 40 + r() * (h - 40); c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y); c.stroke(); }
    if (words) { c.font = 'bold 64px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.strokeStyle = '#c2185b'; c.lineWidth = 10; c.strokeText(words, w / 2, h * 0.66); c.fillStyle = '#ffd1e3'; c.fillText(words, w / 2, h * 0.66); }
    c.fillStyle = '#2e170d';
    c.fillRect(0, 0, w, 28);
    let x = 0;
    while (x < w) { const dw = 14 + r() * 26, dl = 30 + r() * (r() < 0.25 ? 90 : 40); c.beginPath(); c.roundRect(x, 10, dw, dl, dw / 2); c.fill(); x += dw + r() * 18; }
    c.fillStyle = 'rgba(255,200,170,0.18)'; c.fillRect(0, 6, w, 3);
    void len;
  });
  const sA = new THREE.MeshPhongMaterial({ map: sideTex('cake-side-a', W2, '생일 축하해!'), shininess: 40, specular: '#3a1d11' });
  const sB = new THREE.MeshPhongMaterial({ map: sideTex('cake-side-b', L2, null), shininess: 40, specular: '#3a1d11' });
  const dark = new THREE.MeshPhongMaterial({ color: '#2e170d', shininess: 60 });
  put(root, new THREE.BoxGeometry(W2, CH, L2), [sB, sB, dark, dark, sA, sA], 0, TY - CH / 2 - 0.002, 0);
  box(root, W2, 0.01, L2, dark, 0, TY - 0.006, 0, { shadow: false });
  // 크림 장미 짜기 (가장자리 바깥 테두리, InstancedMesh)
  const rosG = new THREE.ConeGeometry(0.022, 0.032, 9, 1);
  rosG.translate(0, 0.016, 0);
  const pa = rosG.attributes.position; // 별깍지 모양 홈
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), a = Math.atan2(z, x); const k = 1 + 0.18 * Math.cos(a * 9); pa.setX(i, x * k); pa.setZ(i, z * k); }
  rosG.computeVertexNormals();
  const spots = [];
  const per = (len, n, f) => { for (let i = 0; i < n; i++) f(-len / 2 + (i + 0.5) * (len / n)); };
  per(W2, 30, (x) => { spots.push([x, -L2 / 2 + 0.025]); spots.push([x, L2 / 2 - 0.025]); });
  per(L2 - 0.1, 50, (z) => { spots.push([-W2 / 2 + 0.025, z]); spots.push([W2 / 2 - 0.025, z]); });
  const ros = new THREE.InstancedMesh(rosG, shiny('#fff1dc', 30), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  spots.forEach(([x, z], i) => { q.setFromEuler(new THREE.Euler(0, i * 0.7, 0)); sc.setScalar(0.85 + ((i * 37) % 10) / 40); m4.compose(new THREE.Vector3(x, TY - 0.004, z), q, sc); ros.setMatrixAt(i, m4); });
  ros.castShadow = true;
  root.add(ros);
  // 네 모서리에 딸기
  const berry = shiny('#e3233a', 90);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b = put(root, new THREE.SphereGeometry(0.04, 16, 12), berry, x * (W2 / 2 - 0.03), TY + 0.03, z * (L2 / 2 - 0.03));
    b.scale.set(1, 1.2, 1);
    put(root, new THREE.ConeGeometry(0.03, 0.02, 6), lam('#3f9a3a'), x * (W2 / 2 - 0.03), TY + 0.075, z * (L2 / 2 - 0.03));
  }
  // 케이크 받침 (금색 판 + 도자기 기둥)
  box(root, W2 + 0.12, 0.02, L2 + 0.12, shiny('#e7c25a', 110), 0, TY - CH - 0.012, 0);
  const stand = [[0, 0], [0.42, 0], [0.44, 0.02], [0.3, 0.05], [0.13, 0.1], [0.09, 0.2], [0.11, 0.26], [0.08, 0.3], [0.09, TY - CH - 0.1], [0.35, TY - CH - 0.04], [0.5, TY - CH - 0.022], [0, TY - CH - 0.022]].map(([a, b]) => new THREE.Vector2(a, b));
  put(root, new THREE.LatheGeometry(stand, 32), shiny('#fbf6ee', 80));
  for (const y of [0.02, 0.26]) put(root, new THREE.TorusGeometry(y < 0.1 ? 0.42 : 0.11, 0.008, 6, 40), shiny('#e7c25a', 110), 0, y, 0, { rx: Math.PI / 2 });
  // 네트 = 생일 초 9개 (틈 사이로 보임) + 불꽃
  const flameTex = canvasTex('flame', 64, 128, (c, w, h) => {
    const gr = c.createRadialGradient(32, 92, 2, 32, 80, 50); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#fff3a0'); gr.addColorStop(0.6, '#ff9a2a'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(32, 4); c.bezierCurveTo(52, 50, 56, 80, 32, 120); c.bezierCurveTo(8, 80, 12, 50, 32, 4); c.fill();
  });
  const stripe = (col) => canvasTex('candle-' + col, 32, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = col; for (let y = -32; y < h; y += 24) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 16); c.lineTo(w, y + 26); c.lineTo(0, y + 10); c.fill(); } });
  const candleCols = ['#ff6b81', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ffa94d', '#f783ac', '#3bc9db', '#ff6b81'];
  const candles = [];
  const glowS = new THREE.SpriteMaterial({ map: canvasTex('candle-glow', 64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  candleCols.forEach((col, i) => {
    const x = -0.72 + i * 0.18;
    const ch = 0.11 + ((i * 3) % 4) * 0.005;
    const ct = stripe(col); ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    cyl(root, 0.011, 0.011, ch, lam('#ffffff', { map: ct }), x, TY + ch / 2, 0, {}, 12);
    cyl(root, 0.0015, 0.0015, 0.015, lam('#222'), x, TY + ch + 0.007, 0, { shadow: false }, 4);
    const fl = new THREE.Group();
    fl.position.set(x, TY + ch + 0.014, 0);
    root.add(fl);
    const plane = (ry) => put(fl, new THREE.PlaneGeometry(0.022, 0.044), new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 0, 0.018, 0, { shadow: false, ry });
    plane(0); plane(Math.PI / 2);
    const gl = new THREE.Sprite(glowS); gl.scale.setScalar(0.09); gl.position.y = 0.018; fl.add(gl);
    candles.push({ fl, gl, on: 1, ph: R() * 6, out: 1, x, top: TY + ch + 0.012 });
  });
  // 옆 소품 (-x): 선물 상자 더미 + 풍선 셋 / (+x, 낮음): 고깔모자 + 바닥의 색종이
  const gifts = [[0.36, 0.3, 0.32, '#4dabf7', '#ffd43b', 0, 0.15, 0.2], [0.3, 0.24, 0.26, '#f783ac', '#ffffff', 0.02, 0.42, 0.16], [0.24, 0.2, 0.24, '#69db7c', '#ff6b81', 0.0, 0.1, -0.22]];
  const gx = -(HW + 0.42);
  for (const [w, h, d, col, rib, dx, y, z] of gifts) {
    const gg = new THREE.Group(); gg.position.set(gx + dx, y, 0.4 + z); gg.rotation.y = dx * 10 + z; root.add(gg);
    box(gg, w, h, d, lam(col), 0, 0, 0);
    box(gg, w + 0.004, h + 0.004, 0.04, lam(rib), 0, 0, 0); box(gg, 0.04, h + 0.004, d + 0.004, lam(rib), 0, 0, 0);
    for (const s of [-1, 1]) put(gg, new THREE.TorusGeometry(0.035, 0.012, 8, 16), lam(rib), s * 0.03, h / 2 + 0.025, 0, { ry: Math.PI / 2, rz: s * 0.6 });
  }
  const balloons = [];
  ['#ff6b81', '#ffd43b', '#b197fc'].forEach((col, i) => {
    const bg = new THREE.Group();
    root.add(bg);
    const b = put(bg, new THREE.SphereGeometry(0.1, 24, 18), new THREE.MeshPhongMaterial({ color: col, shininess: 120, specular: '#ffffff' }), 0, 0, 0);
    b.scale.set(1, 1.18, 1);
    put(bg, new THREE.ConeGeometry(0.014, 0.02, 8), lam(col), 0, -0.125, 0, { rx: Math.PI });
    const str = put(root, new THREE.CylinderGeometry(0.0015, 0.0015, 1, 4), lam('#ffffff'), 0, 0, 0, { shadow: false });
    balloons.push({ bg, str, base: new THREE.Vector3(gx + (i - 1) * 0.12, 1.25 + i * 0.12, 0.4 + (i - 1) * 0.1), anchor: new THREE.Vector3(gx, 0.58, 0.4), ph: i * 2 });
  });
  const hat = new THREE.Group(); hat.position.set(HW + 0.35, 0.0, -0.7); hat.rotation.z = 1.2; root.add(hat);
  put(hat, new THREE.ConeGeometry(0.08, 0.22, 20, 1, true), new THREE.MeshLambertMaterial({ map: stripe('#b197fc'), side: THREE.DoubleSide }), 0, 0.11, 0);
  put(hat, new THREE.SphereGeometry(0.025, 10, 8), lam('#ffd43b'), 0, 0.225, 0);
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.02, 0.012), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 40);
  const cc = new THREE.Color();
  for (let i = 0; i < 40; i++) { m4.compose(new THREE.Vector3(HW + 0.2 + R() * 0.45, 0.002, -1.0 + R() * 0.7), q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, R() * 6)), sc.setScalar(1)); conf.setMatrixAt(i, m4); conf.setColorAt(i, cc.set(candleCols[i % 9])); }
  root.add(conf);
  let blowT = -1;
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      top.userData.update(dt);
      // 득점 연출: 훅 꺼짐 → 연기 → 펑! → 하나씩 다시 켜짐
      if (blowT >= 0) {
        blowT += dt;
        if (blowT > 0.9 && blowT - dt <= 0.9 && fx) for (const s of [-1, 1]) fx.hit((emit) => {
          emit({ tex: 'pix', n: 36, color: candleCols, size: 0.025, life: 1.8, speed: 1.3, up: 2.6, g: 3.5, drag: 0.8, spin: 8, spread: 0.05 });
          emit({ tex: 'star4', n: 5, color: ['#ffe066', '#ffffff'], size: 0.12, grow: 0.3, life: 0.5, speed: 0.8, up: 1.4, add: true });
        }, [s * (HW + 0.1), TY + 0.1, 0], 0);
        if (blowT > 1.0 && blowT < 1.6 && fx && R() < dt * 10) fx.hit((emit) => { emit({ tex: 'ring', n: 1, color: candleCols, size: 0.05, grow: 7, life: 0.5, speed: 0, up: 0, add: true }); emit({ tex: 'star4', n: 10, color: candleCols, size: 0.04, life: 0.9, speed: 1.6, up: 0, g: 1.5, drag: 1.5, add: true }); }, [(R() - 0.5) * 1.2, TY + 0.7 + R() * 0.4, (R() - 0.5) * 1.6], 0);
        candles.forEach((c, i) => { if (blowT > 1.7 + i * 0.12 && !c.on) { c.on = 1; fx?.hit((emit) => emit({ tex: 'star4', n: 2, color: '#fff3a0', size: 0.04, life: 0.3, speed: 0.3, up: 0.3, add: true }), [c.x, c.top + 0.02, 0], 0); } });
        if (blowT > 3.2) blowT = -1;
      }
      for (const c of candles) {
        c.out = c.on ? Math.min(1, c.out + dt * 4) : Math.max(0, c.out - dt * 9);
        const f = 1 + Math.sin(t * 17 + c.ph) * 0.08 + Math.sin(t * 29 + c.ph * 2) * 0.05;
        const big = 1 + heat * 0.6;
        c.fl.scale.set(c.out * (1 + heat * 0.2), c.out * f * big, c.out * (1 + heat * 0.2));
        c.fl.rotation.z = Math.sin(t * 3 + c.ph) * 0.08;
        c.gl.material.opacity = 0.6 + heat * 0.4;
      }
      for (const b of balloons) {
        const p = b.base.clone(); p.x += Math.sin(t * 0.9 + b.ph) * 0.04; p.y += Math.sin(t * 1.3 + b.ph) * 0.03;
        b.bg.position.copy(p); b.bg.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.1;
        const knot = p.clone().add(new THREE.Vector3(0, -0.13, 0));
        const d = b.anchor.clone().sub(knot); const len = d.length();
        b.str.scale.y = len; b.str.position.copy(knot).addScaledVector(d, 0.5);
        b.str.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      }
      if (fx && R() < dt * (1 + heat * 6)) fx.hit((emit) => emit({ tex: 'star4', n: 1, color: '#ffffff', size: 0.02 + heat * 0.02, life: 0.5, speed: 0, up: 0.02, add: true, spin: 2 }), [(R() - 0.5) * TABLE_W * 0.95, TY + 0.004, (R() - 0.5) * TABLE_L * 0.95], 0);
    },
    bounce(p, smash, fx) {
      top.userData.press(p[0], p[2], smash ? 0.022 : 0.012);
      for (const c of candles) c.ph += smash ? 3 : 1;
      fx?.hit((emit) => {
        emit({ tex: 'drop', n: smash ? 8 : 4, color: ['#4a2414', '#5e2f1a'], size: 0.02, life: 0.6, speed: 0.8, up: 1.3, g: 7, rot: 0, floor: TY + 0.004 });
        emit({ tex: 'pix', n: smash ? 6 : 3, color: ['#ff6b81', '#ffd43b', '#69db7c', '#4dabf7', '#f783ac'], size: 0.012, life: 0.9, speed: 0.6, up: 1.2, g: 6, spin: 10, floor: TY + 0.004 });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    score(info, fx) {
      blowT = 0;
      const dir = -half(info.z); // 바람이 이긴 사람 쪽에서 분다
      candles.forEach((c, i) => { setTimeout(() => { c.on = 0; fx?.hit((emit) => emit({ tex: 'puff', n: 2, color: '#d8d8d8', size: 0.03, grow: 3, life: 1.4, speed: 0.05, up: 0.18, g: -0.02, alpha: 0.5, wob: 0.04 }), [c.x, c.top + 0.01, 0], 0); }, (dir > 0 ? i : 8 - i) * 25); });
    },
  };
}

/* ════════════════════════════════════════════════════════════
   5. 식빵 고양이 (회색 고등어 무늬, 식빵 자세. 등 = 판, 꼬리 = 네트)
   ════════════════════════════════════════════════════════════ */
function breadCat(root) {
  const furBase = '#9a9ca3', furDark = '#5b5d65', furLight = '#c4c6cc';
  const furTex = canvasTex('cat-back', 512, 920, (c, w, h) => {
    const r = rng(141);
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9a9ca4'); gr.addColorStop(0.5, '#8b8e97'); gr.addColorStop(1, '#9a9ca4');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    // 고등어 무늬: 등줄기(가운데, x 방향)에서 양옆(z)으로 굽어 내려가는 굵고 부드러운 줄. 머리는 -x(왼쪽)
    c.filter = 'blur(5px)';
    c.fillStyle = 'rgba(62,64,72,0.5)';
    for (let i = 0; i < 7; i++) {
      const x0 = 58 + i * 66 + (r() - 0.5) * 12;
      for (const s of [-1, 1]) { // 한 줄 = 끝으로 갈수록 가늘어지는 띠 하나 (겹치는 곳이 없게 한 번에 칠함)
        const L = [], Rt = [];
        let x = x0;
        const ph = r() * 6, amp = 8 + r() * 10, len = (h / 2 - 16) * (0.75 + r() * 0.25);
        for (let k = 0; k <= 24; k++) {
          const u = k / 24, y = h / 2 + s * u * len;
          x = x0 + Math.sin(u * 5 + ph) * amp - u * 10;
          const wd = 15 * (1 - u * 0.75);
          L.push([x - wd, y]); Rt.push([x + wd, y]);
        }
        c.beginPath(); L.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); Rt.reverse().forEach(([px, py]) => c.lineTo(px, py)); c.closePath(); c.fill();
      }
    }
    c.fillStyle = 'rgba(58,60,68,0.55)'; c.fillRect(8, h / 2 - 18, w - 16, 36); // 등줄기
    c.filter = 'none';
    for (let i = 0; i < 30000; i++) { // 털 결
      const x = r() * w, y = r() * h, l = 3 + r() * 6, a = (y < h / 2 ? -1 : 1) * (1.25 + r() * 0.4);
      c.strokeStyle = r() < 0.5 ? 'rgba(40,42,48,0.16)' : 'rgba(225,226,232,0.16)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    c.strokeStyle = 'rgba(238,239,243,0.8)'; c.lineWidth = 9; c.strokeRect(4.5, 4.5, w - 9, h - 9); // 경계: 밝은 털 테
  });
  const top = softTop(root, TABLE_W, TABLE_L, lam('#ffffff', { map: furTex }), { y: TY, segW: 30, segL: 54, radius: 0.15 });
  // 몸통: 둥근 식빵 (옆면에도 줄무늬: z를 따라 감는 uv)
  const bodyTex = canvasTex('cat-body', 512, 128, (c, w, h) => {
    const r = rng(142);
    c.fillStyle = furBase; c.fillRect(0, 0, w, h);
    c.filter = 'blur(4px)'; c.strokeStyle = 'rgba(62,64,72,0.4)'; c.lineCap = 'round';
    for (let x = 20; x < w; x += 64 + r() * 12) { c.lineWidth = 16 + r() * 6; c.beginPath(); c.moveTo(x, -10); c.bezierCurveTo(x + 12, h * 0.35, x - 10, h * 0.6, x + 4, h * 0.85); c.stroke(); }
    c.filter = 'none';
    for (let i = 0; i < 4000; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(40,42,48,0.14)' : 'rgba(225,226,232,0.14)'; c.lineWidth = 0.8; const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 3, y + 4); c.stroke(); }
    const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#d9dade'); gr.addColorStop(0.3, 'rgba(200,202,208,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const BEV = 0.3, EX = 0.1; // 둥근 빵 모양: 크게 둥글린 가장자리 + 위 평평한 곳이 판을 다 덮게
  const BW = TABLE_W + EX * 2 + BEV * 2, BL = TABLE_L + EX * 2 + BEV * 2, BH = TY - 0.005;
  const bodyG = roundBox(BW, BH, BL, 0.34, BEV, 12);
  bodyG.translate(0, BH / 2, 0);
  const uv = bodyG.attributes.uv, bp = bodyG.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); const u = Math.abs(z) > BL / 2 - 0.35 ? (x + BW / 2) / BW * 0.8 + 0.3 : (z + BL / 2) / BL * 1.7; uv.setXY(i, u, bp.getY(i) / BH); }
  const bt = bodyTex; bt.wrapS = THREE.RepeatWrapping;
  const body = put(root, bodyG, lam('#ffffff', { map: bt }), 0, 0, 0);
  // 머리 (-x)
  const headG = new THREE.Group();
  headG.position.set(-(HW + 0.56), 0.8, 0);
  root.add(headG);
  const head = new THREE.Group();
  head.scale.setScalar(1.45);
  headG.add(head);
  const furM = lam(furBase), whiteM = lam('#f4f2ee'), pinkM = lam('#ffb3c4');
  const skull = put(head, new THREE.SphereGeometry(0.3, 32, 24), lam('#ffffff', { map: bodyTex }), 0, 0, 0);
  skull.scale.set(0.92, 0.82, 1.08);
  for (const s of [-1, 1]) put(head, new THREE.SphereGeometry(0.1, 20, 14), whiteM, -0.22, -0.08, s * 0.07).scale.set(0.8, 0.75, 1); // 볼(주둥이)
  put(head, new THREE.SphereGeometry(0.07, 16, 12), whiteM, -0.2, -0.14, 0).scale.set(0.8, 0.6, 1); // 턱
  for (let k = 0; k < 3; k++) box(head, 0.004, 0.012, 0.08 - k * 0.02, lam(furDark), -0.24 + k * 0.02, 0.2 - k * 0.012, 0, { shadow: false }).rotation.z = 0.5; // 이마 M무늬 흉내
  const ears = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(0.0, 0.2, s * 0.17); eg.rotation.x = s * 0.35; head.add(eg);
    put(eg, new THREE.ConeGeometry(0.1, 0.18, 4), furM, 0, 0.08, 0, { ry: Math.PI / 4 }).scale.set(1, 1, 0.5);
    put(eg, new THREE.ConeGeometry(0.065, 0.12, 4), pinkM, -0.03, 0.07, 0, { ry: Math.PI / 4 }).scale.set(1, 1, 0.35);
    ears.push({ eg, s, perk: 0, tw: 0 });
  }
  const eyes = [-1, 1].map((s) => cuteEye(head, -0.2, 0.04, s * 0.11, 0.07, { iris: '#15161b', white: '#cfe08a', lid: furBase })); // 연두빛 눈 + 동그란 까만 눈동자
  for (const e of eyes) { e.g.scale.set(0.75, 1, 1); e.pu.scale.set(0.5, 1.15, 1.15); }
  put(head, new THREE.ConeGeometry(0.024, 0.02, 3), lam('#ff8fa8'), -0.29, -0.04, 0, { rz: Math.PI / 2, ry: Math.PI });
  const mouthG = new THREE.Group(); mouthG.position.set(-0.285, -0.085, 0); head.add(mouthG);
  for (const s of [-1, 1]) put(mouthG, new THREE.TorusGeometry(0.02, 0.0045, 6, 14, Math.PI), lam('#3a3238'), 0, 0, s * 0.02, { ry: Math.PI / 2, rz: Math.PI, shadow: false });
  const yawn = put(head, new THREE.SphereGeometry(0.045, 16, 12), lam('#d8546e'), -0.27, -0.1, 0, { shadow: false });
  yawn.scale.set(0.4, 0.01, 1);
  for (const s of [-1, 1]) { put(head, new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: '#ffa0b8', transparent: true, opacity: 0.55 }), -0.255, -0.03, s * 0.19, { shadow: false, ry: -Math.PI / 2 - s * 0.7 }); }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { // 수염
    const wsk = put(head, new THREE.CylinderGeometry(0.0018, 0.0012, 0.24, 4), lam('#ffffff'), -0.26, -0.06 + k * 0.025, s * 0.2, { shadow: false });
    wsk.rotation.set(Math.PI / 2 + s * (k - 1) * 0.15, 0, 0); wsk.rotation.y = s * 0.25;
  }
  // 앞발 (꾹꾹이)
  const paws = [-1, 1].map((s) => {
    const pg = new THREE.Group(); pg.position.set(-(HW + 0.78), 0.07, s * 0.24); pg.scale.setScalar(1.4); root.add(pg);
    const p = put(pg, new THREE.SphereGeometry(0.085, 18, 12), whiteM, 0, 0, 0); p.scale.set(1.3, 0.7, 0.9);
    for (let k = 0; k < 3; k++) put(pg, new THREE.SphereGeometry(0.014, 8, 6), pinkM, -0.1, -0.01, (k - 1) * 0.03, { shadow: false }).scale.set(0.5, 1, 1);
    return { pg, s };
  });
  // 꼬리 = 네트: +x 엉덩이에서 올라와 등 위(z=0)를 가로질러 머리 쪽 끝이 살짝 말림. 아래는 비어 있어 공이 보임
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(HW + 0.42, 0.4, 0), new THREE.Vector3(HW + 0.36, TY - 0.02, 0), new THREE.Vector3(HW - 0.05, TY + 0.11, 0),
    new THREE.Vector3(0.2, TY + 0.113, 0), new THREE.Vector3(-0.5, TY + 0.112, 0), new THREE.Vector3(-0.82, TY + 0.115, 0), new THREE.Vector3(-0.93, TY + 0.15, 0.03), new THREE.Vector3(-0.88, TY + 0.19, 0.05),
  ]);
  const TS = 120, RS = 12;
  const tailG = new THREE.TubeGeometry(tailCurve, TS, 1, RS);
  const tp = tailG.attributes.position;
  const tBase = Float32Array.from(tp.array);
  const centers = Array.from({ length: TS + 1 }, (_, i) => tailCurve.getPointAt(i / TS));
  const radius = (u) => 0.028 + 0.012 * Math.sin(Math.min(1, u * 1.3) * Math.PI) * (u < 0.92 ? 1 : (1 - u) / 0.08 * 0.5 + 0.5) - (u > 0.95 ? (u - 0.95) * 0.4 : 0);
  const tailTex = canvasTex('cat-tail', 256, 32, (c, w, h) => { c.fillStyle = furBase; c.fillRect(0, 0, w, h); c.filter = 'blur(2px)'; c.fillStyle = 'rgba(80,82,90,0.7)'; for (let x = 8; x < w - 20; x += 24) c.fillRect(x, -4, 9, h + 8); c.fillStyle = furDark; c.fillRect(w - 18, -4, 22, h + 8); c.filter = 'none'; });
  const tail = put(root, tailG, lam('#ffffff', { map: tailTex }), 0, 0, 0, { shadow: true });
  function tailShape(t, puff, heat) {
    for (let i = 0; i <= TS; i++) {
      const u = i / TS, c = centers[i];
      const r = radius(u) * (1 + puff * 0.9) * (1 + Math.sin(u * 60) * 0.03 * puff);
      const sway = Math.sin(t * (1.8 + heat * 2) - u * 5) * 0.03 * smooth(0.2, 0.6, u) + Math.sin(t * 3.1 - u * 9) * 0.008 * u;
      const lift = smooth(0.85, 1, u) * Math.sin(t * 2.4) * 0.02;
      for (let j = 0; j <= RS; j++) {
        const k = (i * (RS + 1) + j) * 3;
        tp.array[k] = c.x + (tBase[k] - c.x) * r;
        tp.array[k + 1] = c.y + (tBase[k + 1] - c.y) * r + lift;
        tp.array[k + 2] = c.z + (tBase[k + 2] - c.z) * r + sway;
      }
    }
    tp.needsUpdate = true;
    tailG.computeVertexNormals();
  }
  // 분홍 발자국 (공이 튄 자리에 꾹)
  const pawTex = canvasTex('pawprint', 128, 128, (c) => {
    c.fillStyle = '#ff9db6';
    c.beginPath(); c.ellipse(64, 80, 30, 24, 0, 0, Math.PI * 2); c.fill();
    for (const [x, y] of [[30, 42], [52, 26], [76, 26], [98, 42]]) { c.beginPath(); c.ellipse(x, y, 12, 15, 0, 0, Math.PI * 2); c.fill(); }
  }, { alpha: true });
  const prints = Array.from({ length: 6 }, () => { const m = put(root, new THREE.PlaneGeometry(0.11, 0.11), new THREE.MeshBasicMaterial({ map: pawTex, transparent: true, opacity: 0, depthWrite: false }), 0, TY + 0.004, 0, { shadow: false, rx: -Math.PI / 2 }); return { m, t: 9 }; });
  let printI = 0;
  // 옆 소품 (+x, 낮음): 털실 뭉치 + 실 + 물고기 장난감 / (-x): '나비' 밥그릇
  const yarnTex = canvasTex('yarn', 128, 128, (c, w, h) => { c.fillStyle = '#ff7fa8'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(200,60,110,0.6)'; c.lineWidth = 3; for (let i = 0; i < 26; i++) { c.beginPath(); c.moveTo(0, i * 6); c.bezierCurveTo(w * 0.3, i * 6 - 20, w * 0.7, i * 6 + 20, w, i * 6); c.stroke(); } });
  const yarn = put(root, new THREE.SphereGeometry(0.1, 20, 16), lam('#ffffff', { map: yarnTex }), HW + 0.6, 0.1, -0.9);
  put(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(HW + 0.58, 0.02, -0.8), new THREE.Vector3(HW + 0.62, 0.005, -0.55), new THREE.Vector3(HW + 0.75, 0.005, -0.35), new THREE.Vector3(HW + 0.62, 0.005, -0.1)]), 30, 0.006, 5), lam('#ff7fa8'), 0, 0, 0, { shadow: false });
  const fish = new THREE.Group(); fish.position.set(HW + 0.6, 0.035, 0.9); fish.rotation.y = 0.5; root.add(fish);
  put(fish, new THREE.SphereGeometry(0.06, 14, 10), lam('#4dabf7'), 0, 0, 0).scale.set(1.6, 0.6, 0.6);
  put(fish, new THREE.ConeGeometry(0.04, 0.06, 3), lam('#4dabf7'), 0.12, 0, 0, { rz: Math.PI / 2 });
  put(fish, new THREE.SphereGeometry(0.01, 8, 6), lam('#111'), -0.07, 0.015, 0.025);
  const bowlX = -(HW + 0.6), bowlZ = 0.85;
  const bowlPts = [[0, 0], [0.13, 0], [0.15, 0.06], [0.12, 0.065], [0.1, 0.02], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b));
  put(root, new THREE.LatheGeometry(bowlPts, 28), shiny('#ffd43b', 70), bowlX, 0, bowlZ);
  for (let i = 0; i < 14; i++) put(root, new THREE.SphereGeometry(0.015, 6, 5), lam('#a8652c'), bowlX + Math.cos(i * 2.4) * 0.06 * Math.sqrt(i / 14), 0.035, bowlZ + Math.sin(i * 2.4) * 0.06 * Math.sqrt(i / 14));
  const name = canvasTex('cat-bowl', 128, 32, (c, w, h) => { c.fillStyle = '#ffd43b'; c.fillRect(0, 0, w, h); c.font = 'bold 24px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#c2185b'; c.fillText('나비 ♥', w / 2, h / 2 + 1); });
  put(root, new THREE.PlaneGeometry(0.12, 0.03), lam('#ffffff', { map: name }), bowlX + 0.142, 0.035, bowlZ, { shadow: false, ry: Math.PI / 2, rz: -0.3 });

  const blink = blinker();
  let puff = 0, wide = 0, stretch = -1, yawnT = 6 + R() * 6, knead = 4, twT = 2;
  const headBase = headG.position.clone();
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      top.userData.update(dt);
      puff = Math.max(0, puff - dt * 0.7); wide = Math.max(0, wide - dt * 1.2);
      tailShape(t, ease(puff), heat);
      // 기지개 (득점)
      let s = 0;
      if (stretch >= 0) { stretch += dt; s = Math.sin(clamp(stretch / 1.8, 0, 1) * Math.PI); if (stretch > 1.8) stretch = -1; }
      headG.position.set(headBase.x - s * 0.18, headBase.y + s * 0.1 + Math.sin(t * 1.4) * 0.006, 0);
      headG.rotation.z = -s * 0.35;
      for (const p of paws) p.pg.position.x = -(HW + 0.78) - s * 0.3;
      // 공 따라보기 + 골골송(열기)
      const hw = new THREE.Vector3(); head.getWorldPosition(hw);
      follow(head, hw, stretch >= 0 ? null : st.ball, dt, { maxYaw: 0.8 });
      if (heat > 0.3) head.position.y = Math.sin(t * 60) * 0.0015 * heat;
      const b = blink(dt);
      // 하품
      yawnT -= dt;
      let yk = 0;
      if (yawnT < 0) { yk = Math.sin(clamp(-yawnT / 1.6, 0, 1) * Math.PI); if (yawnT < -1.6) yawnT = 8 + R() * 8; }
      yawn.scale.y = 0.01 + yk * 0.9 + s * 0.6;
      for (const e of eyes) {
        e.blink(Math.max(b, yk * 0.9, s * 0.8));
        e.pu.scale.set(0.5, 1.15 + heat * 0.25 - wide * 0.4, 1.15 + heat * 0.25 - wide * 0.4);
        if (st.ball) e.look(clamp(st.ball[2] - hw.z, -1, 1) * 0.5, clamp(st.ball[1] - hw.y, -1, 1));
      }
      // 귀: 쫑긋(공) + 가끔 혼자 씰룩
      twT -= dt;
      if (twT < 0) { twT = 1.5 + R() * 3; ears[Math.floor(R() * 2)].tw = 1; }
      for (const e of ears) {
        e.perk = Math.max(0, e.perk - dt * 2.5); e.tw = Math.max(0, e.tw - dt * 5);
        e.eg.rotation.x = e.s * (0.35 - e.perk * 0.25 + (wide > 0 ? -0.1 : 0)) + Math.sin(t * 40) * e.tw * 0.15;
        e.eg.rotation.z = -e.perk * 0.15;
      }
      // 꾹꾹이
      knead -= dt;
      const kOn = knead < 0;
      if (knead < -2.4) knead = 5 + R() * 6;
      for (const p of paws) p.pg.position.y = 0.07 - (kOn ? Math.max(0, Math.sin(t * 7 + (p.s > 0 ? Math.PI : 0))) * 0.02 : 0);
      for (const p of prints) { p.t += dt; p.m.material.opacity = p.t < 0.1 ? p.t / 0.1 * 0.8 : Math.max(0, 0.8 - (p.t - 0.1) / 1.6 * 0.8); }
      yarn.rotation.y += dt * 0.2;
      if (fx && heat > 0.5 && R() < dt * heat * 1.6) fx.hit((emit) => emit({ tex: 'heart', n: 1, color: ['#ff8fb3', '#ffb3c8'], size: 0.04, grow: 1.3, life: 1.3, speed: 0.04, up: 0.3, g: -0.1, drag: 1, rot: 0, wob: 0.05 }), [hw.x - 0.15, hw.y + 0.25, hw.z + (R() - 0.5) * 0.2], 0);
    },
    bounce(p, smash, fx) {
      top.userData.press(p[0], p[2], smash ? 0.024 : 0.014);
      for (const e of ears) e.perk = 1;
      const pr = prints[printI++ % prints.length];
      pr.t = 0; pr.m.position.set(p[0], TY + 0.004, p[2]); pr.m.rotation.z = R() * 6;
      if (smash) { puff = 1; wide = 1; }
      fx?.hit((emit) => emit({ tex: 'puff', n: smash ? 2 : 1, color: '#e8e9ee', size: 0.04, grow: 1.8, life: 0.5, speed: 0.15, up: 0.2, alpha: 0.35 }), [p[0], TY + 0.01, p[2]], 0);
      if (smash) fx?.hit((emit) => emit({ tex: 'nyang', n: 1, color: '#ffffff', size: 0.1, grow: 1.2, life: 0.8, speed: 0, up: 0.5, drag: 3, rot: R() * 0.4 - 0.2, pop: true }), [-(HW + 0.56), 1.35, 0], 0);
    },
    score(info, fx) {
      stretch = 0;
      fx?.hit((emit) => emit({ tex: 'heart', n: 12, color: ['#ff5f8f', '#ff8fb3', '#ffb3c8'], size: 0.06, grow: 1.4, life: 1.6, speed: 0.6, up: 0.9, g: -0.2, drag: 1.6, wob: 0.15, rot: 0, spread: 0.1 }), [-(HW + 0.6), 1.25, 0], 0);
    },
  };
}

/* ════════════════════════════════════════════════════════════
   6. 솜사탕 구름 (둥둥, 무지개 = 네트)
   ════════════════════════════════════════════════════════════ */
function cloud(root) {
  const topTex = canvasTex('cloud-top', 512, 920, (c, w, h) => {
    const r = rng(151);
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d97fb8'); gr.addColorStop(0.5, '#c084d8'); gr.addColorStop(1, '#9a86dd');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { // 솜사탕 실
      c.strokeStyle = `rgba(255,${200 + r() * 55},${230 + r() * 25},${0.06 + r() * 0.1})`; c.lineWidth = 0.6 + r() * 1.6;
      const x = r() * w, y = r() * h, a = r() * 6, l = 30 + r() * 90;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 1) * l, y + Math.sin(a + 1) * l, x + Math.cos(a) * l * 1.4, y + Math.sin(a) * l * 1.4); c.stroke();
    }
    for (let i = 0; i < 70; i++) { const gx = r() * w, gy = r() * h; c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(gx, gy, 1.5, 1.5); }
    const e = c.createLinearGradient(0, 0, 0, 22); // 가장자리 = 밝은 솜 테두리
    c.strokeStyle = 'rgba(255,236,248,0.85)'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    void e;
  });
  const top = softTop(root, TABLE_W, TABLE_L, lam('#ffffff', { map: topTex }), { y: TY, segW: 30, segL: 54, radius: 0.2 });
  const glitter = canvasTex('cloud-glitter', 256, 460, (c, w, h) => { const r = rng(152); c.clearRect(0, 0, w, h); for (let i = 0; i < 160; i++) { c.fillStyle = ['#ffffff', '#fff3a0', '#c9f0ff'][i % 3]; const x = r() * w, y = r() * h; c.fillRect(x, y, 1.5, 1.5); } }, { alpha: true });
  const glitM = new THREE.MeshBasicMaterial({ map: glitter, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), glitM, 0, TY + 0.002, 0, { shadow: false, rx: -Math.PI / 2 });
  // 구름 몸: 솜뭉치 여러 개 (가장자리 테두리 + 아래 큰 뭉치)
  const pinks = ['#f6a9d2', '#e9a2e6', '#c9a7f5', '#b7c2f7', '#f7b8d6', '#bff0e6'].map((col) => new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.18 }));
  const sph = new THREE.SphereGeometry(1, 22, 16);
  const puffs = [];
  const r = rng(153);
  const addPuff = (x, y, z, s, m) => { const p = put(root, sph, m, x, y, z); p.scale.setScalar(s); puffs.push({ p, y, ph: r() * 6, s }); return p; };
  // 테두리: 위가 판보다 2~3cm 높게 살짝 (공이 튀는 판 위는 덮지 않음)
  const ring = (n, fx) => { for (let i = 0; i < n; i++) fx(i / n); };
  for (const layer of [0, 1]) ring(layer ? 40 : 58, (k) => {
    const per = 2 * (TABLE_W + TABLE_L), d = ((k + layer * 0.37 + r() * 0.3 / 58) % 1) * per;
    let x, z;
    if (d < TABLE_W) { x = -HW + d; z = -HL; } else if (d < TABLE_W + TABLE_L) { x = HW; z = -HL + (d - TABLE_W); } else if (d < 2 * TABLE_W + TABLE_L) { x = HW - (d - TABLE_W - TABLE_L); z = HL; } else { x = -HW; z = HL - (d - 2 * TABLE_W - TABLE_L); }
    const sz = layer ? 0.11 + r() * 0.07 : 0.05 + r() * 0.05;
    const out = layer ? sz * 0.95 : sz * 0.7; // 큰 뭉치는 더 바깥에, 위는 판보다 조금만 높게
    const ox = Math.abs(x) >= HW - 0.001 ? Math.sign(x) * out : 0, oz = Math.abs(z) >= HL - 0.001 ? Math.sign(z) * out : 0;
    addPuff(x + ox, TY + (layer ? -0.07 : 0.018) - sz + r() * 0.01, z + oz, sz, pinks[Math.floor(r() * 5)]);
  });
  for (let i = 0; i < 46; i++) { const sz = 0.16 + r() * 0.16; addPuff((r() - 0.5) * (TABLE_W + 0.1), TY - 0.03 - sz - r() * 0.12, (r() - 0.5) * (TABLE_L + 0.1), sz, pinks[Math.floor(r() * 6)]); }
  for (let i = 0; i < 14; i++) addPuff((r() - 0.5) * TABLE_W * 0.8, TY - 0.5 - r() * 0.08, (r() - 0.5) * TABLE_L * 0.8, 0.12 + r() * 0.1, pinks[2 + Math.floor(r() * 3)]);
  // 네트 = 낮은 무지개 띠 (가운데 높이 = 네트) + 양 끝의 작은 구름
  const bands = ['#ff6b81', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'];
  const bowTex = canvasTex('rainbow', 8, 64, (c, w, h) => { bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i / bands.length) * h, w, h / bands.length + 1); }); });
  const RX = 0.93, BAND = 0.042, NS = 64;
  const bowGeo = new THREE.BufferGeometry();
  const vs = [], uvs = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const a = Math.PI * (i / NS);
    for (const [k, w] of [[0, 0], [1, BAND]]) { // 바깥(위) ↔ 안쪽(아래)
      vs.push(Math.cos(a) * (RX - w), Math.sin(a) * (NET_H - w), 0);
      uvs.push(i / NS, 1 - k); // 빨강이 바깥
    }
    if (i < NS) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  bowGeo.setAttribute('position', new THREE.Float32BufferAttribute(vs, 3));
  bowGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bowGeo.setIndex(idx);
  const bowM = new THREE.MeshBasicMaterial({ map: bowTex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const bow = put(root, bowGeo, bowM, 0, TY, 0, { shadow: false });
  for (const s of [-1, 1]) for (const [dx, dy, sz] of [[0, 0.01, 0.06], [s * 0.05, 0.0, 0.045], [-s * 0.04, -0.005, 0.04]]) addPuff(s * RX + dx, TY + dy, 0.0, sz, pinks[0]);
  // 하트 풍선 (득점 때 둥실)
  const hg = new THREE.ExtrudeGeometry(heartShape(0.05), { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 4, curveSegments: 16 });
  hg.translate(0, 0, -0.015);
  const hearts = Array.from({ length: 6 }, (_, i) => {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const m = new THREE.MeshPhongMaterial({ color: ['#ff5f8f', '#ff8fb3', '#b197fc', '#ff6b81', '#ffa8d0', '#9a86dd'][i], shininess: 120, specular: '#ffffff', transparent: true });
    put(g, hg, m, 0, 0, 0);
    const str = put(g, new THREE.CylinderGeometry(0.0012, 0.0012, 0.22, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }), 0, -0.16, 0, { shadow: false });
    return { g, m, str, t: 9, x: 0, z: 0, ph: i };
  });
  let heartI = 0;
  // 옆 소품 (-x): 잠자는 초승달 + 별 장식 / (+x): 낮게 뜬 아기 구름
  const moon = new THREE.Group(); moon.position.set(-(HW + 0.48), 1.15, 0.2); root.add(moon);
  const ms = new THREE.Shape(); ms.absarc(0, 0, 0.16, Math.PI * 0.35, Math.PI * 1.65, false); ms.absarc(0.07, 0, 0.13, Math.PI * 1.55, Math.PI * 0.45, true);
  put(moon, new THREE.ExtrudeGeometry(ms, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 4, curveSegments: 24 }), new THREE.MeshPhongMaterial({ color: '#ffe680', emissive: '#ffcf40', emissiveIntensity: 0.35, shininess: 60 }), 0, 0, -0.02, { ry: Math.PI / 2 });
  put(moon, new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), lam('#7a5a2a'), 0.04, 0.02, -0.08, { ry: Math.PI / 2, shadow: false });
  put(moon, new THREE.CircleGeometry(0.018, 12), new THREE.MeshBasicMaterial({ color: '#ff9bb0', transparent: true, opacity: 0.7 }), 0.045, -0.03, -0.1, { ry: Math.PI / 2, shadow: false });
  const dangles = [];
  for (const [dz, len] of [[0.08, 0.18], [0.0, 0.28], [-0.08, 0.13]]) {
    const dg = new THREE.Group(); dg.position.set(0, -0.12, dz); moon.add(dg);
    put(dg, new THREE.CylinderGeometry(0.0012, 0.0012, len, 4), lam('#ffffff'), 0, -len / 2, 0, { shadow: false });
    const sts = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr2 = i % 2 ? 0.014 : 0.032; i ? sts.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : sts.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    put(dg, new THREE.ExtrudeGeometry(sts, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), new THREE.MeshPhongMaterial({ color: '#fff3a0', emissive: '#ffd43b', emissiveIntensity: 0.4 }), 0, -len - 0.03, 0, { ry: Math.PI / 2 });
    dangles.push(dg);
  }
  const baby = new THREE.Group(); baby.position.set(HW + 0.45, 0.25, -0.5); root.add(baby);
  for (const [x, y, z, s] of [[0, 0, 0, 0.1], [0.08, -0.01, 0.04, 0.075], [-0.08, -0.01, -0.03, 0.08], [0.02, 0.05, -0.02, 0.07]]) put(baby, sph, pinks[3], x, y, z).scale.setScalar(s);
  for (const s of [-1, 1]) put(baby, new THREE.SphereGeometry(0.008, 8, 6), lam('#3a2a4a'), -0.06, 0.03, s * 0.03, { shadow: false });

  let flash = 0;
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      top.userData.update(dt);
      for (const p of puffs) p.p.position.y = p.y + Math.sin(t * 1.1 + p.ph) * (p.y < TY - 0.1 ? 0.012 : 0.002);
      flash = Math.max(0, flash - dt * 1.5);
      const br = 0.75 + heat * 0.35 + flash * 0.8;
      bowM.color.setScalar(Math.min(1.6, br));
      bow.scale.y = 1 + Math.sin(t * 3) * 0.02;
      glitM.opacity = clamp(heat * 0.6 + flash * 0.8 + Math.sin(t * 5) * 0.05 * heat, 0, 1);
      glitter.offset.set(Math.sin(t * 0.3) * 0.02, (t * 0.01) % 1);
      moon.position.y = 1.15 + Math.sin(t * 0.8) * 0.04; moon.rotation.x = Math.sin(t * 0.6) * 0.08;
      dangles.forEach((d, i) => { d.rotation.x = Math.sin(t * 1.4 + i) * 0.15; });
      baby.position.y = 0.25 + Math.sin(t * 1.5) * 0.03;
      for (const h of hearts) {
        if (h.t > 3.2) { h.g.visible = false; continue; }
        h.t += dt;
        const k = h.t / 3.2;
        h.g.visible = true;
        h.g.position.set(h.x + Math.sin(h.t * 2 + h.ph) * 0.06, TY + 0.06 + ease(Math.min(1, h.t / 0.4)) * 0.1 + h.t * 0.45, h.z);
        h.g.rotation.set(0, h.t * 1.6 + h.ph, Math.sin(h.t * 2 + h.ph) * 0.15);
        h.g.scale.setScalar(ease(Math.min(1, h.t / 0.35)));
        h.m.opacity = k > 0.75 ? (1 - k) / 0.25 : 1; h.str.material.opacity = h.m.opacity;
      }
      if (fx && R() < dt * (2 + heat * 10)) { // 구름 둘레에서 반짝
        const side = R() < 0.5 ? 1 : -1;
        const [px, pz] = R() < 0.6 ? [side * (HW + 0.1), (R() - 0.5) * TABLE_L] : [(R() - 0.5) * TABLE_W, side * (HL + 0.1)];
        fx.hit((emit) => emit({ tex: 'star4', n: 1, color: ['#ffffff', '#fff3a0', '#ffc8e8', '#c9f0ff'], size: 0.03 + heat * 0.02, life: 0.9, speed: 0.02, up: 0.08, add: true, spin: 2 }), [px, TY - 0.05 + R() * 0.1, pz], 0);
      }
    },
    bounce(p, smash, fx) {
      top.userData.press(p[0], p[2], smash ? 0.04 : 0.026);
      if (smash) flash = 1;
      fx?.hit((emit) => {
        emit({ tex: 'star5', n: smash ? 6 : 3, color: ['#fff3a0', '#ffc8e8', '#c9f0ff', '#d8c8ff'], size: 0.035, grow: 0.7, life: 0.8, speed: 0.6, up: 0.7, g: 1.5, drag: 2, spin: 5 });
        emit({ tex: 'puff', n: 1, color: '#ffd6ee', size: 0.06, grow: 2, life: 0.5, speed: 0.1, up: 0.15, alpha: 0.4 });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    score(info, fx) {
      flash = 1;
      const n = info.smash ? 5 : 3, zz = -info.z * 0.45; // 이긴 사람 쪽 구름에서
      for (let i = 0; i < n; i++) { const h = hearts[heartI++ % hearts.length]; h.t = -i * 0.18; h.x = (i - (n - 1) / 2) * 0.28; h.z = zz + (R() - 0.5) * 0.3; }
      fx?.hit((emit) => emit({ tex: 'star4', n: 20, color: ['#ffffff', '#fff3a0', '#ffc8e8', '#c9f0ff'], size: 0.05, life: 1.3, speed: 1, up: 1, g: 0.3, drag: 1.2, add: true, spin: 3, spread: 0.3 }), [0, TY + 0.1, zz], 0);
    },
  };
}

export const LEGEND = { arcade, carpet, turtle, cake, breadCat, cloud };
