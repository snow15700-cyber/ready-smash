// 전설 탁구대 5종 (식빵 고양이는 사용자 요청으로 뺌) (docs/dev/tables.md). 보기만 다르다: 판 = TABLE_W × TABLE_L, 윗면 TY, 네트 높이 NET_H.
// 고급과 같은 규칙(네트는 비쳐 보이게, 키 큰 소품은 -x, +x엔 낮은 것, 양 끝은 비움) + 전설만의 것:
//   tick(t, dt, fx, st)  st = { ball: 공 위치 | null, rally: 랠리 수, heat: 0~1 (랠리가 길어질수록 → 더 화려하게) }
//   bounce(p, smash, fx) 공이 판에 튐 · hit(p, smash, fx) 선수가 침 · score({ x, z, smash }, fx) 득점 (z = 공이 빠져나간 끝)
// 효과는 공보다 작고 흐리게, 판 위 그림은 공보다 어둡게 (공이 잘 보이게).
import * as THREE from 'three';
import { easeOut as ease } from './util.js';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H } from './physics.js';
import { rng, canvasTex, lam, flat, shiny, put, box, cyl, roundBox, softTop, steamer, smooth, skirt } from './table-kit.js';

const HL = HALF_L, HW = HALF_W;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
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
      const side = -half(info.z);
      if (!info.smash) { // 보통 득점: 'POINT' 글자만
        score[side] += 1000;
        floats.push({ s: 'POINT', x: SW / 2, y: side > 0 ? SH * 0.3 : SH * 0.7, size: 3, c: '#7fe0ff', t: 0, life: 1.4, flip: side < 0 });
        return;
      }
      ko = 2.4; flash = 1; shake = 0.6;
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
  // 지니: 스매시 득점 때 램프 주둥이에서 연기와 함께 나와 손을 흔들고 다시 쏙 들어감
  const genie = new THREE.Group();
  genie.visible = false;
  root.add(genie);
  const gBlue = new THREE.MeshPhongMaterial({ color: '#5b8dff', emissive: '#3a5cff', emissiveIntensity: 0.25, shininess: 60, transparent: true, opacity: 0.95 });
  const gGold = shiny('#f2c440', 120), gDark = lam('#1d1d2a');
  const tailBalls = [];
  for (let i = 0; i < 12; i++) tailBalls.push(put(genie, new THREE.SphereGeometry(1, 16, 12), gBlue, 0, 0, 0, { shadow: false }));
  const torso = put(genie, new THREE.SphereGeometry(0.13, 24, 18), gBlue, 0, 0.5, 0);
  torso.scale.set(0.85, 1.15, 1);
  put(genie, new THREE.TorusGeometry(0.105, 0.018, 8, 24), gGold, 0, 0.41, 0, { rx: Math.PI / 2 }); // 금 허리띠
  for (const s2 of [-1, 1]) box(genie, 0.02, 0.18, 0.07, lam('#7a3cff'), 0.09, 0.52, s2 * 0.06, { shadow: false }).rotation.x = s2 * 0.25; // 조끼
  const gHead = new THREE.Group(); gHead.position.set(0, 0.76, 0); genie.add(gHead);
  put(gHead, new THREE.SphereGeometry(0.115, 24, 18), gBlue, 0, 0, 0);
  for (const s2 of [-1, 1]) {
    const e = put(gHead, new THREE.SphereGeometry(0.022, 12, 10), gDark, 0.1, 0.02, s2 * 0.042, { shadow: false }); e.scale.set(0.5, 1.2, 0.9);
    put(gHead, new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.111, 0.03, s2 * 0.038, { shadow: false });
    box(gHead, 0.006, 0.006, 0.035, gDark, 0.098, 0.06, s2 * 0.045, { shadow: false }).rotation.x = s2 * 0.25; // 눈썹
    put(gHead, new THREE.TorusGeometry(0.014, 0.004, 6, 12), gGold, 0, -0.03, s2 * 0.115, { shadow: false }); // 귀걸이
    const ear = put(gHead, new THREE.ConeGeometry(0.025, 0.06, 8), gBlue, 0, 0.0, s2 * 0.115); ear.rotation.x = s2 * 1.4;
  }
  put(gHead, new THREE.TorusGeometry(0.04, 0.008, 6, 14, Math.PI), gDark, 0.105, -0.035, 0, { ry: Math.PI / 2, rz: Math.PI, shadow: false }); // 함박웃음
  put(gHead, new THREE.SphereGeometry(0.018, 10, 8), gBlue, 0.118, 0.0, 0); // 코
  put(gHead, new THREE.SphereGeometry(0.035, 14, 10), gDark, -0.01, 0.12, 0); // 상투
  put(gHead, new THREE.ConeGeometry(0.02, 0.12, 10), gDark, -0.06, 0.13, 0, { rz: 1.2 });
  const gArms = [-1, 1].map((s2) => {
    const sh = new THREE.Group(); sh.position.set(0, 0.6, s2 * 0.115); genie.add(sh);
    put(sh, new THREE.CapsuleGeometry(0.03, 0.12, 6, 12), gBlue, 0, -0.08, 0);
    put(sh, new THREE.TorusGeometry(0.034, 0.008, 6, 14), gGold, 0, -0.14, 0, { rx: Math.PI / 2 });
    put(sh, new THREE.SphereGeometry(0.038, 12, 10), gBlue, 0, -0.18, 0);
    return { sh, s: s2 };
  });
  let genieT = -1;
  const backOut = (k) => { const c1 = 1.9; return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2; };
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
      if (genieT >= 0) {
        genieT += dt;
        lamp.rotation.z = genieT < 0.4 ? Math.sin(genieT * 60) * 0.12 : 0; // 덜덜 → 펑
        const tip = new THREE.Vector3(-0.2, 0.14, 0).applyMatrix4(lamp.matrixWorld);
        genie.position.copy(tip);
        const grow = genieT < 0.25 ? 0 : genieT < 0.95 ? backOut((genieT - 0.25) / 0.7) : genieT < 2.5 ? 1 : Math.max(0, 1 - ease((genieT - 2.5) / 0.45));
        genie.visible = grow > 0.01;
        genie.scale.setScalar(Math.max(0.001, grow) * 1.25);
        genie.rotation.y = -0.3 + Math.sin(genieT * 1.3) * 0.5 + (genieT > 2.5 ? (genieT - 2.5) * 14 : 0); // 들어갈 땐 빙글
        for (const [i, b] of tailBalls.entries()) { // 꼬리: 주둥이에서 몸까지 소용돌이
          const u = i / (tailBalls.length - 1);
          b.position.set(Math.sin(u * 6 + genieT * 6) * 0.05 * u, u * 0.4, Math.cos(u * 6 + genieT * 6) * 0.05 * u);
          b.scale.setScalar(0.012 + u * u * 0.08);
        }
        gHead.rotation.z = Math.sin(genieT * 4) * 0.08;
        for (const a of gArms) { // 오른팔은 손 흔들기, 왼팔은 허리에
          if (a.s > 0) { a.sh.rotation.x = -2.6 + Math.sin(genieT * 12) * 0.35; a.sh.rotation.z = 0.2; } else { a.sh.rotation.x = 0.9; a.sh.rotation.z = 0.5; }
        }
        if (fx && genieT > 0.9 && genieT - dt <= 0.9) {
          fx.hit((emit) => emit({ tex: 'tada', n: 1, color: '#ffffff', size: 0.22, grow: 1.15, life: 1.3, speed: 0, up: 0.25, drag: 3, rot: 0, pop: true }), [tip.x + 0.05, tip.y + 1.25, tip.z], 0);
        }
        if (fx && genie.visible && R() < dt * 14) fx.hit((emit) => emit({ tex: 'star4', n: 1, color: ['#ffd77a', '#c9a6ff', '#7fe0ff'], size: 0.04, life: 0.8, speed: 0.3, up: 0.2, add: true, spin: 3 }), [tip.x + (R() - 0.5) * 0.4, tip.y + 0.3 + R() * 0.7, tip.z + (R() - 0.5) * 0.4], 0);
        if (fx && genieT > 2.5 && genieT - dt <= 2.5) fx.hit((emit) => emit({ tex: 'puff', n: 6, color: ['#b48cff', '#7f9cff'], size: 0.1, grow: 2.5, life: 1.0, speed: 0.3, up: 0.3, alpha: 0.5 }), [tip.x, tip.y + 0.3, tip.z], 0);
        if (genieT > 3.0) { genieT = -1; genie.visible = false; lamp.rotation.z = 0; }
      }
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
      pulse = 1;
      if (!info.smash) { fx?.hit((emit) => emit({ tex: 'star4', n: 10, color: ['#ffd77a', '#fff1c0'], size: 0.05, life: 1.2, speed: 0.8, up: 1, g: 0.5, drag: 1.2, add: true, spin: 4, spread: 0.2 }), [info.x * 0.5, TY + 0.1, info.z * 0.85], 0); return; }
      curl = { t: 0, s: half(info.z) };
      fx?.hit((emit) => {
        emit({ tex: 'star4', n: 26, color: ['#ffd77a', '#fff1c0', '#c9a6ff', '#7fe0ff'], size: 0.06, life: 1.6, speed: 1.2, up: 1.4, g: 0.5, drag: 1.2, add: true, spin: 4, spread: 0.3 });
        emit({ tex: 'puff', n: 6, color: ['#b48cff', '#e0b0ff'], size: 0.18, grow: 2.5, life: 1.4, speed: 0.4, up: 0.4, alpha: 0.4, spread: 0.2 });
      }, [info.x * 0.5, TY + 0.1, info.z * 0.85], 0);
      const tip = new THREE.Vector3(-0.2, 0.14, 0).applyMatrix4(lamp.matrixWorld);
      fx?.hit((emit) => emit({ tex: 'puff', n: 10, color: ['#b48cff', '#7f9cff', '#c9a6ff'], size: 0.1, grow: 3.2, life: 1.6, speed: 0.35, up: 0.6, alpha: 0.55, wait: 0.15 }), [tip.x, tip.y + 0.05, tip.z], 0);
      if (info.smash) genieT = 0;
    },
  };
}

/* ════════════════════════════════════════════════════════════
   3. 거대 거북이 (등껍질이 판, 머리는 -x 쪽에서 공을 따라봄)
   ════════════════════════════════════════════════════════════ */
function turtle(root) {
  // 진짜 거북이처럼: 둥근 등껍질(위에서 보면 거의 동그란 모양)이 판 둘레에서 둥글게 내려가 가장자리 비늘로 끝남.
  // 머리는 -x, 꼬리는 +x (선수 쪽 양 끝은 비워 둠). 판(공이 튀는 곳)은 평평한 등껍질 꼭대기.
  const skin = '#8fbf6a', skinD = '#6f9f4e';
  const A = 1.5, B = 1.48, N = 2.6, RIM = 0.36;
  const plate = (c, pts, i, glow) => { // 비늘 한 칸: 가운데 밝게 + 나이테 + 짙은 이음매
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const path = (sc) => { c.beginPath(); pts.forEach(([x, y], j) => { const X = cx + (x - cx) * sc, Y = cy + (y - cy) * sc; j ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
    if (!glow) {
      const rad = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      const gr = c.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
      gr.addColorStop(0, `hsl(${42 + (i % 3) * 4}, 42%, 42%)`); gr.addColorStop(0.55, `hsl(${44 + (i % 2) * 4}, 36%, 31%)`); gr.addColorStop(1, 'hsl(38, 32%, 19%)');
      path(0.97); c.fillStyle = gr; c.fill();
      c.lineWidth = 1.6; c.strokeStyle = 'rgba(40,30,12,0.3)';
      for (const sc of [0.82, 0.64, 0.46, 0.3]) { path(sc); c.stroke(); }
    }
    c.strokeStyle = glow ? '#9dffc8' : '#22190c'; c.lineWidth = glow ? 5 : 6; c.lineJoin = 'round';
    path(1); c.stroke();
  };
  // 판 = 등껍질 꼭대기: 가운데 등뼈 비늘(x 방향 줄) + 양옆 갈비 비늘
  const topDraw = (glow) => (c, w, h) => {
    if (glow) c.clearRect(0, 0, w, h); else { c.fillStyle = '#4f4628'; c.fillRect(0, 0, w, h); }
    const band = h * 0.24, cy = h / 2;
    for (let i = 0; i < 3; i++) { // 등뼈 비늘 (육각)
      const x0 = -w * 0.25 + i * w * 0.5, x1 = x0 + w * 0.5;
      plate(c, [[x0, cy], [x0 + w * 0.08, cy - band], [x1 - w * 0.08, cy - band], [x1, cy], [x1 - w * 0.08, cy + band], [x0 + w * 0.08, cy + band]], i, glow);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { // 갈비 비늘
      const x0 = i * w * 0.5, x1 = x0 + w * 0.5, yi = cy + s * band, yo = s > 0 ? h + 40 : -40;
      plate(c, [[x0, yi], [x1, yi], [x1, yo], [x0, yo]], i + 3 + s, glow);
    }
    if (!glow) {
      const r2 = rng(121); for (let k = 0; k < 900; k++) { c.fillStyle = r2() < 0.5 ? 'rgba(90,120,50,0.16)' : 'rgba(20,15,5,0.14)'; c.fillRect(r2() * w, r2() * h, 2, 2); }
      c.strokeStyle = '#d6c487'; c.lineWidth = 9; c.strokeRect(4.5, 4.5, w - 9, h - 9); // 판 가장자리 = 경계선
    }
  };
  // 둘레 (u = 둘레 방향, v = 위→아래): 위쪽은 큰 갈비 비늘, 아래 끝은 작은 가장자리 비늘
  const sideDraw = (glow) => (c, w, h) => {
    if (glow) c.clearRect(0, 0, w, h); else { c.fillStyle = '#4f4628'; c.fillRect(0, 0, w, h); }
    const n1 = 14, n2 = 34, split = h * 0.72;
    for (let i = 0; i < n1; i++) { const x0 = (i / n1) * w, x1 = ((i + 1) / n1) * w; plate(c, [[x0, -10], [x1, -10], [x1 + 6, split], [x0 + 6, split]], i, glow); }
    for (let i = 0; i < n2; i++) {
      const x0 = (i / n2) * w, x1 = ((i + 1) / n2) * w;
      if (!glow) { const gr = c.createLinearGradient(0, split, 0, h); gr.addColorStop(0, '#8a7646'); gr.addColorStop(1, '#5e4f2c'); c.fillStyle = gr; c.fillRect(x0, split, x1 - x0, h - split); }
      c.strokeStyle = glow ? '#9dffc8' : '#22190c'; c.lineWidth = glow ? 4 : 5; c.strokeRect(x0, split, x1 - x0, h - split + 4);
    }
  };
  const topTex = canvasTex('turtle2-top', 512, 920, topDraw(false)), topGlow = canvasTex('turtle2-top-g', 512, 920, topDraw(true), { alpha: true });
  const sideTex = canvasTex('turtle2-side', 1024, 256, sideDraw(false)), sideGlow = canvasTex('turtle2-side-g', 1024, 256, sideDraw(true), { alpha: true });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), lam('#ffffff', { map: topTex }), 0, TY, 0, { shadow: false, rx: -Math.PI / 2 });
  const glowM = new THREE.MeshBasicMaterial({ map: topGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  put(root, new THREE.PlaneGeometry(TABLE_W, TABLE_L), glowM, 0, TY + 0.0015, 0, { shadow: false, rx: -Math.PI / 2 });
  // 등껍질 둘레: 판 가장자리에서 둥글게(어깨) 내려가 가장자리에서 살짝 밖으로 뻗는 테두리
  const shellProfile = (t) => {
    if (t < 0.86) { const al = (t / 0.86) * Math.PI / 2; return [Math.sin(al) * 0.96, TY - (TY - RIM) * (1 - Math.cos(al))]; }
    const u = (t - 0.86) / 0.14; return [0.96 + 0.04 * u, RIM - 0.05 * u * u];
  };
  const shellG = skirt({ a: A, b: B, n: N, profile: shellProfile, hw: HW, hl: HL });
  put(root, shellG, new THREE.MeshLambertMaterial({ map: sideTex, side: THREE.DoubleSide }), 0, 0, 0);
  const sideGlowM = new THREE.MeshBasicMaterial({ map: sideGlow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sg = put(root, shellG, sideGlowM, 0, 0, 0, { shadow: false });
  sg.scale.setScalar(1.002);
  // 등껍질 아래: 몸(살) + 배딱지
  put(root, new THREE.SphereGeometry(1, 32, 16), lam(skinD), 0, 0.34, 0).scale.set(A * 0.86, 0.12, B * 0.86);
  put(root, slab(superShape(A * 0.82, B * 0.8, 2.6), 0.06, 0.02), lam('#e6d28a'), 0, 0.24, 0);
  // 다리 4개: 등껍질 가장자리 밑에서 바깥으로 벌어진 굵은 다리 + 발톱
  const legM = lam(skin);
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lg = new THREE.Group();
    lg.position.set(sx * 1.0, 0, sz * 1.0);
    lg.rotation.set(sz * 0.12, 0, -sx * 0.12);
    root.add(lg);
    const pts = [[0, 0], [0.16, 0], [0.17, 0.04], [0.15, 0.12], [0.14, 0.28], [0.15, 0.42], [0.0, 0.46]].map(([a, b]) => new THREE.Vector2(a, b));
    put(lg, new THREE.LatheGeometry(pts, 20), legM).scale.set(1, 1, 0.85);
    for (let k = 0; k < 3; k++) { const an = Math.atan2(sz, sx) + (k - 1) * 0.45; put(lg, new THREE.SphereGeometry(0.032, 10, 8), lam('#f2ead2'), Math.cos(an) * 0.15, 0.025, Math.sin(an) * 0.13); }
    for (let k = 0; k < 5; k++) put(lg, new THREE.SphereGeometry(0.022, 8, 6), lam(skinD), Math.cos(k * 1.3) * 0.135, 0.12 + k * 0.05, Math.sin(k * 1.3) * 0.115).scale.set(1, 0.6, 1);
    legs.push(lg);
  }
  // 꼬리 (+x)
  const tail = new THREE.Group();
  tail.position.set(A - 0.08, 0.3, 0);
  root.add(tail);
  put(tail, new THREE.ConeGeometry(0.06, 0.22, 12), legM, 0.1, 0, 0, { rz: -Math.PI / 2 - 0.25 });
  // 목 + 머리 (-x)
  const neck = new THREE.Group();
  neck.position.set(-(A - 0.2), 0.36, 0);
  root.add(neck);
  const neckM = put(neck, new THREE.CylinderGeometry(0.13, 0.17, 0.5, 18), legM, -0.2, 0.12, 0, { rz: Math.PI / 2 - 0.55 });
  for (let k = 0; k < 5; k++) put(neckM, new THREE.TorusGeometry(0.14 + k * 0.006, 0.006, 6, 20), lam(skinD), 0, -0.14 + k * 0.06, 0, { rx: Math.PI / 2, shadow: false });
  const head = new THREE.Group();
  head.position.set(-0.46, 0.34, 0);
  head.scale.setScalar(1.75);
  neck.add(head);
  put(head, new THREE.SphereGeometry(0.17, 28, 20), legM, 0, 0, 0).scale.set(1.15, 0.92, 1.0);
  const eyes = [-1, 1].map((s) => cuteEye(head, -0.12, 0.06, s * 0.085, 0.055, { lid: skin }));
  for (const s of [-1, 1]) put(head, new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: '#ff9bb0', transparent: true, opacity: 0.65 }), -0.15, -0.025, s * 0.12, { shadow: false, ry: -Math.PI / 2 - s * 0.6 });
  const mouth = put(head, new THREE.TorusGeometry(0.04, 0.006, 6, 18, Math.PI * 0.7), lam('#2b2a33'), -0.19, -0.02, 0, { shadow: false, ry: Math.PI / 2, rz: -Math.PI / 2 - Math.PI * 0.35 });
  const open = put(head, new THREE.SphereGeometry(0.035, 14, 10), lam('#7a2c3a'), -0.18, -0.06, 0, { shadow: false });
  open.scale.set(0.4, 0.05, 1);
  for (const s of [-1, 1]) put(head, new THREE.SphereGeometry(0.006, 6, 6), lam('#2b2a33'), -0.195, 0.02, s * 0.022, { shadow: false });
  // 네트 = 등껍질에 꽂은 나뭇가지 기둥 + 그물 + 부표 + 미역
  const drift = lam('#9a8c78');
  for (const x of [-0.93, 0.93]) { const d = cyl(root, 0.022, 0.03, NET_H + 0.14, drift, x, TY + (NET_H + 0.14) / 2 - 0.08, 0, {}, 8); d.rotation.z = x > 0 ? -0.04 : 0.05; }
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
  // 옆 소품 (+x 바깥, 낮음): 모래밭 + 불가사리 + 소라 + 옆으로 걷는 꽃게
  const SX = A + 0.5;
  put(root, new THREE.CircleGeometry(0.45, 28), lam('#e8d3a0'), SX, 0.003, -0.6, { rx: -Math.PI / 2, shadow: false });
  const starS = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const an = (i / 10) * Math.PI * 2, r = i % 2 ? 0.025 : 0.065; i ? starS.lineTo(Math.cos(an) * r, Math.sin(an) * r) : starS.moveTo(Math.cos(an) * r, Math.sin(an) * r); }
  put(root, new THREE.ExtrudeGeometry(starS, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 }), lam('#ff8a5a'), SX - 0.15, 0.012, -0.45, { rx: -Math.PI / 2 });
  put(root, new THREE.ConeGeometry(0.04, 0.12, 14), shiny('#f7d9c4', 60), SX + 0.18, 0.04, -0.8, { rz: Math.PI / 2 + 0.2 }).scale.set(1, 1, 0.8);
  const crab = new THREE.Group();
  crab.position.set(SX, 0, -0.55);
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
  let retract = 0, peek = -1, wide = 0, happy = 0, nod = 0, crabT = 0, glow = 0;
  void retract;
  const neckOut = neck.position.clone();
  return {
    tick(t, dt, fx, st = {}) {
      const heat = st.heat || 0;
      happy = Math.max(0, happy - dt);
      glow = Math.max(glow - dt * 1.4, heat * 0.3 + Math.sin(t * 2.5) * 0.04 * heat);
      glowM.opacity = glow; sideGlowM.opacity = glow * 0.8;
      // 쏙 들어갔다가 빼꼼 (득점 연출)
      let out = 1;
      if (peek >= 0) {
        peek += dt;
        out = peek < 0.25 ? 1 - ease(peek / 0.25) : peek < 1.4 ? 0 : peek < 1.8 ? 0.35 * ease((peek - 1.4) / 0.4) : peek < 2.4 ? 0.35 : peek < 2.8 ? lerp(0.35, 1, ease((peek - 2.4) / 0.4)) : 1;
        if (peek > 2.8) { peek = -1; happy = 1.5; }
      }
      neck.position.x = neckOut.x + (1 - out) * 0.62;
      neck.position.y = neckOut.y - (1 - out) * 0.06;
      neck.scale.setScalar(0.45 + out * 0.55);
      for (const lg of legs) lg.scale.set(0.6 + out * 0.4, 0.25 + out * 0.75, 0.6 + out * 0.4);
      tail.scale.setScalar(out);
      // 공 따라보기 + 깜빡임 + 끄덕
      const hw = new THREE.Vector3(); head.getWorldPosition(hw);
      follow(head, hw, st.ball, dt, { maxYaw: 0.9 });
      nod = Math.max(0, nod - dt * 3);
      head.position.y = 0.34 + Math.sin(t * (1.5 + heat * 5)) * (0.006 + heat * 0.012) - nod * 0.03;
      const b = peek > 1.4 && peek < 2.4 ? 0 : blink(dt);
      wide = Math.max(0, wide - dt * 1.2);
      for (const e of eyes) {
        e.blink(happy > 0 ? 0.55 : b);
        e.size(1 - wide * 0.45 + heat * 0.15);
        if (st.ball) e.look(clamp(st.ball[2] - hw.z, -1, 1) * 0.6, clamp(st.ball[1] - hw.y, -1, 1));
        e.hl1.scale.setScalar(1 + heat * 0.8);
      }
      open.scale.y = 0.05 + (happy > 0 ? 0.6 : 0) + (wide > 0.3 ? 0.8 : 0);
      mouth.visible = open.scale.y < 0.3; open.visible = !mouth.visible;
      tail.rotation.y = Math.sin(t * (2 + heat * 6)) * 0.4;
      for (const lg of legs) lg.position.y = Math.max(0, Math.sin(t * 2 + lg.position.x * 3 + lg.position.z)) * 0.004 * (1 + heat * 3); // 발 까딱
      for (const f of floats) f.position.y = TY + NET_H + Math.sin(t * 2 + f.position.x * 4) * 0.004;
      for (const kp of kelps) {
        const pa = kp.kg.attributes.position;
        for (let v = 0; v < pa.count; v++) { const y = kp.kb[v * 3 + 1]; pa.array[v * 3] = kp.kb[v * 3] + Math.sin(t * 2 + kp.ph + y * 20) * 0.012 * (0.07 - y) * 10; }
        pa.needsUpdate = true;
      }
      crabT += dt;
      crab.position.z = -0.55 + Math.sin(crabT * 0.6) * 0.28;
      crab.position.y = Math.abs(Math.sin(crabT * 14)) * 0.006;
      if (fx && heat > 0.6 && R() < dt * heat * 1.5) fx.hit((emit) => emit({ tex: 'heart', n: 1, color: '#ff8fb3', size: 0.05, grow: 1.3, life: 1.2, speed: 0.05, up: 0.3, g: -0.1, drag: 1, rot: 0 }), [hw.x - 0.1, hw.y + 0.25, hw.z], 0);
    },
    bounce(p, smash, fx) {
      glow = smash ? 0.9 : 0.55;
      nod = 1;
      if (smash) wide = 1;
      fx?.hit((emit) => {
        emit({ tex: 'ring', n: 1, color: '#9dffc8', size: 0.04, grow: smash ? 6 : 4, life: 0.45, speed: 0, up: 0, add: true, alpha: 0.8 });
        emit({ tex: 'drop', n: smash ? 10 : 5, color: ['#8fdcff', '#c9f0ff', '#5cc4f5'], size: 0.02, life: 0.6, speed: 0.9, up: 1.4, g: 7, rot: 0, floor: TY + 0.004 });
      }, [p[0], TY + 0.01, p[2]], 0);
    },
    score(info, fx) {
      if (!info.smash) { nod = 1; happy = 1; return; } // 보통 득점: 끄덕 + 웃음
      peek = 0;
      const hw = new THREE.Vector3(); head.getWorldPosition(hw);
      fx?.hit((emit) => emit({ tex: 'excl', n: 1, color: '#ffffff', size: 0.18, grow: 1.2, life: 1.0, speed: 0, up: 0.4, drag: 3, rot: 0, pop: true }), [hw.x, hw.y + 0.38, hw.z], 0);
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
    if (words) { c.font = `bold ${words.length < 5 ? 120 : 64}px Jua, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.strokeStyle = '#c2185b'; c.lineWidth = 10; c.strokeText(words, w / 2, h * 0.64); c.fillStyle = '#ffd1e3'; c.fillText(words, w / 2, h * 0.64); }
    c.fillStyle = '#2e170d';
    c.fillRect(0, 0, w, 28);
    let x = 0;
    while (x < w) { const dw = 14 + r() * 26, dl = 30 + r() * (r() < 0.25 ? 90 : 40); c.beginPath(); c.roundRect(x, 10, dw, dl, dw / 2); c.fill(); x += dw + r() * 18; }
    c.fillStyle = 'rgba(255,200,170,0.18)'; c.fillRect(0, 6, w, 3);
    void len;
  });
  const sA = new THREE.MeshPhongMaterial({ map: sideTex('cake-side-a', W2, 'HBD'), shininess: 40, specular: '#3a1d11' });
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
      if (!info.smash) { fx?.hit((emit) => emit({ tex: 'pix', n: 14, color: candleCols, size: 0.02, life: 1.2, speed: 0.8, up: 1.6, g: 3.5, spin: 8 }), [0, TY + 0.15, -info.z * 0.4], 0); return; } // 보통 득점: 색종이 조금
      blowT = 0;
      const dir = -half(info.z); // 바람이 이긴 사람 쪽에서 분다
      candles.forEach((c, i) => { setTimeout(() => { c.on = 0; fx?.hit((emit) => emit({ tex: 'puff', n: 2, color: '#d8d8d8', size: 0.03, grow: 3, life: 1.4, speed: 0.05, up: 0.18, g: -0.02, alpha: 0.5, wob: 0.04 }), [c.x, c.top + 0.01, 0], 0); }, (dir > 0 ? i : 8 - i) * 25); });
    },
  };
}

/* ════════════════════════════════════════════════════════════
   5. 솜사탕 구름 (둥둥, 무지개 = 네트)
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

export const LEGEND = { arcade, carpet, turtle, cake, cloud };
