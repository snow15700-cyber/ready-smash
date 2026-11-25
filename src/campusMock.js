// 광장 새 디자인 시안 (campus.html): '경주캠퍼스 느낌' 광장을 대충 3D로 — 기획 확인용, 게임에는 아직 안 씀
// 배치는 docs/dev/plaza.md 20장 배치도 초안. 위가 북쪽(−z). 좌표는 광장 좌표와 같은 m 단위.
import * as THREE from 'three';
import { addBox, canvasTex, clockTex, seeded, std, textTex } from './arena-kit.js';

const FONT = (px) => `bold ${px}px Jua, sans-serif`;
const rnd = seeded(2511);

function plate(parent, lines, w, h, x, y, z, o = {}) {
  const px = o.px || 640;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex(lines, { w: px, h: Math.round((px * h) / w), bg: o.bg ?? '#fffaf0', color: o.color || '#2b2a33', font: o.font || FONT(80), border: o.border || null }), transparent: !o.bg && o.bg !== undefined }));
  m.position.set(x, y, z);
  if (o.ry) m.rotation.y = o.ry;
  parent.add(m);
  return m;
}
function cyl(parent, rt, rb, h, m, x, y, z, seg = 24) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z); c.castShadow = true; parent.add(c);
  return c;
}
function capsule(parent, r, col, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(col, { roughness: 0.4 })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff, { roughness: 0.4 })));
  g.position.set(x, y, z); g.rotation.set(rx, 0, rz); parent.add(g);
  return g;
}
// 줄무늬 차양 (가게 앞)
function awning(parent, w, colA, colB, y, z) {
  const tex = canvasTex(256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? colB : colA; g.fillRect(i * 32, 0, 32, 64); } });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 1.1), [std(colA), std(colA), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), std(colA), std(colA), std(colA)]);
  m.position.set(0, y, z + 0.5); m.rotation.x = 0.32; m.castShadow = true; parent.add(m);
  // 끝 물결 장식
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(w / 16, w / 16, 0.05, 12, 1, false, 0, Math.PI), std(i % 2 ? colB : colA));
    s.rotation.set(Math.PI / 2, 0, Math.PI / 2); s.position.set(-w / 2 + w / 16 + (i * w) / 8, y - 0.2, z + 1.03); parent.add(s);
  }
}

// ── 재질
const M = {
  stone: std(0x2f3238, { roughness: 0.7 }), // 검은 돌 (사진 1 기둥)
  white: std(0xf3f1ec),
  alu: std(0xc9ced4, { metalness: 0.5, roughness: 0.35 }),
  gold: std(0xf2c14e, { metalness: 0.35, roughness: 0.35 }),
  wood: std(0xb07a45),
  dark: std(0x2b2a33),
  roofGrass: new THREE.MeshLambertMaterial({ color: 0x7cbf5a }),
};
// 유리 막대 (청록 유리 + 가로 띠 격자, 사진 1)
function glassTex(cols, rows) {
  const t = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4f9196'); gr.addColorStop(1, '#22505a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(12,32,36,.7)'; g.lineWidth = 3;
    for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, (r * h) / rows); g.lineTo(w, (r * h) / rows); g.stroke(); }
    g.lineWidth = 1.5;
    for (let c = 0; c <= cols; c++) { g.beginPath(); g.moveTo((c * w) / cols, 0); g.lineTo((c * w) / cols, h); g.stroke(); }
    // 반사 줄무늬 + 몇 개는 불 켜진 창
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(200,240,240,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * w, 0, 6 + Math.random() * 20, h); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,230,170,.55)'; g.fillRect(Math.floor(Math.random() * cols) * (w / cols) + 2, Math.floor(Math.random() * rows) * (h / rows) + 2, w / cols - 4, h / rows - 4); }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function glassBar(parent, x0, x1, z0, z1, y0, y1) {
  const w = x1 - x0, d = z1 - z0, h = y1 - y0;
  const mat = (len) => { const t = glassTex(16, 5); t.repeat.set(Math.max(1, Math.round(len / 14)), 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.12, metalness: 0.45, emissive: 0x041818, emissiveIntensity: 0.3 }); };
  const mx = mat(w), mz = mat(d);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mz, mz, M.white, std(0x1c2627), mx, mx]);
  bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); bar.castShadow = true; parent.add(bar);
  // 지붕: 흰 난간 띠 + 지붕 정원(사진 2)
  addBox(parent, w + 0.3, 0.5, d + 0.3, M.white, bar.position.x, y1 + 0.25, bar.position.z);
  addBox(parent, w * 0.55, 0.3, d * 0.5, M.roofGrass, bar.position.x - w * 0.12, y1 + 0.55, bar.position.z);
  addBox(parent, w * 0.25, 1.2, d * 0.6, M.white, bar.position.x + w * 0.3, y1 + 0.9, bar.position.z - d * 0.1);
  // 아래 면 짙은 띠 (떠 있는 느낌)
  addBox(parent, w + 0.02, 0.5, d + 0.02, std(0x1a2122), bar.position.x, y0 + 0.25, bar.position.z);
  return bar;
}

// ── 가게 3개 (건물 + 지붕 위 상징). 각 그룹의 +z가 앞(문) 쪽
const SW = 5.2, SD = 4.0, SH = 3.4; // 가게 너비·깊이·높이

function storeBody(g, wallCol, trimCol) {
  addBox(g, SW + 0.3, 0.3, SD + 0.3, M.stone, 0, 0.15, 0); // 검은 돌 받침 (캠퍼스 느낌)
  addBox(g, SW, SH, SD, std(wallCol), 0, 0.3 + SH / 2, 0).castShadow = true;
  addBox(g, SW + 0.25, 0.35, SD + 0.25, std(trimCol), 0, 0.3 + SH + 0.17, 0); // 지붕 테
}
function door(g, col, x = 0) {
  addBox(g, 1.3, 2.2, 0.08, std(col), x, 0.3 + 1.1, SD / 2 + 0.03);
  addBox(g, 1.05, 1.95, 0.1, new THREE.MeshStandardMaterial({ color: 0x3a5068, emissive: 0xffd9a0, emissiveIntensity: 0.15, roughness: 0.1 }), x, 0.3 + 1.05, SD / 2 + 0.04);
}
// 쇼윈도: 밝은 안쪽 판 + 금속 테 + 얇은 유리 (진열품은 안쪽 판과 유리 사이 SD/2 + 0.12쯤에)
const WIN_IN = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0c8, emissiveIntensity: 0.35 });
const WIN_GLASS = new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
function showWindow(g, x, w, h, y) {
  for (const sx of [-1, 1]) addBox(g, 0.08, h + 0.14, 0.34, M.alu, x + sx * (w / 2 + 0.03), y, SD / 2 + 0.15);
  addBox(g, w + 0.14, 0.08, 0.34, M.alu, x, y + h / 2 + 0.03, SD / 2 + 0.15);
  addBox(g, w + 0.14, 0.12, 0.4, M.alu, x, y - h / 2 - 0.04, SD / 2 + 0.17);
  addBox(g, w, h, 0.02, WIN_IN, x, y, SD / 2 + 0.01);
  addBox(g, w, h, 0.02, WIN_GLASS, x, y, SD / 2 + 0.3);
}

function gachaStore() {
  const g = new THREE.Group();
  storeBody(g, 0xe0373f, 0xfdf7ee);
  door(g, 0xf2c14e, 0.9);
  // 쇼윈도 안 캡슐 더미
  showWindow(g, -1.3, 1.9, 1.5, 1.6);
  for (let i = 0; i < 14; i++) capsule(g, 0.16, [0xffd23f, 0x3fb6ff, 0x7ad35a, 0xff9ed2, 0xa77bff][i % 5], -2.0 + (i % 5) * 0.35, 1.05 + Math.floor(i / 5) * 0.3, SD / 2 + 0.15, i, i * 2);
  awning(g, SW + 0.2, '#e0373f', '#ffffff', 0.3 + SH - 0.45, SD / 2);
  plate(g, ['🛒 뽑기'], 2.6, 0.62, 0, 0.3 + SH + 0.17, SD / 2 + 0.14, { bg: '#fffaf0', border: '#e0373f', font: FONT(90) });
  // 지붕 위 거대 캡슐 돔 (지금 뽑기 기계의 돔을 크게)
  const R = 2.0, Y = 0.3 + SH + 0.35;
  cyl(g, R + 0.15, R + 0.25, 0.4, M.white, 0, Y + 0.2, -0.2, 32);
  const cols = [0xff4d5a, 0xffd23f, 0x3fb6ff, 0x7ad35a, 0xff9ed2, 0xa77bff, 0xff8a1f];
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (R - 0.35), y = Y + 0.55 + rnd() * rnd() * 1.4;
    if (Math.hypot(rr, y - Y - 0.4) > R - 0.3) continue;
    capsule(g, 0.24 + rnd() * 0.08, cols[i % cols.length], Math.cos(a) * rr, y, -0.2 + Math.sin(a) * rr, rnd() * 3, rnd() * 3);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }));
  dome.position.set(0, Y + 0.4, -0.2); g.add(dome);
  cyl(g, 0.3, 0.38, 0.28, std(0xe0373f), 0, Y + 0.4 + R + 0.1, -0.2, 16);
  return g;
}

function closetStore() {
  const g = new THREE.Group();
  storeBody(g, 0x2f6fb8, 0xf3f1ec);
  door(g, 0xf3f1ec, 0);
  // 양쪽 쇼윈도 + 마네킹 (옷 색만)
  for (const [x, c] of [[-1.75, 0xff8a3d], [1.75, 0xff9ed2]]) {
    showWindow(g, x, 1.3, 1.9, 1.55);
    cyl(g, 0.22, 0.3, 0.8, std(c), x, 1.45, SD / 2 + 0.15, 12);
    cyl(g, 0.03, 0.03, 0.5, M.dark, x, 0.85, SD / 2 + 0.15, 6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), std(0xf3e3cf)); head.position.set(x, 2.05, SD / 2 + 0.15); g.add(head);
  }
  awning(g, SW + 0.2, '#2f6fb8', '#ffffff', 0.3 + SH - 0.45, SD / 2);
  plate(g, ['👕 옷장'], 2.6, 0.62, 0, 0.3 + SH + 0.17, SD / 2 + 0.14, { bg: '#fffaf0', border: '#2f6fb8', font: FONT(90) });
  // 지붕 위 큰 옷걸이 + 걸린 티셔츠
  const Y = 0.3 + SH + 0.35;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.09, 10, 24, Math.PI * 1.4), M.gold); hook.position.set(0, Y + 3.7, 0); hook.rotation.z = -0.6; g.add(hook);
  cyl(g, 0.08, 0.08, 0.6, M.gold, 0, Y + 3.1, 0, 8);
  for (const sx of [-1, 1]) { const arm = addBox(g, 2.4, 0.16, 0.16, M.wood, sx * 1.05, Y + 2.35, 0); arm.rotation.z = sx * -0.55; }
  addBox(g, 4.0, 0.14, 0.14, M.wood, 0, Y + 1.72, 0);
  // 티셔츠 (몸통 + 소매)
  const tee = std(0xffd23f);
  addBox(g, 1.7, 1.6, 0.18, tee, 0, Y + 0.85, 0.05);
  for (const sx of [-1, 1]) { const sl = addBox(g, 0.8, 0.5, 0.18, tee, sx * 1.05, Y + 1.4, 0.05); sl.rotation.z = sx * -0.5; }
  plate(g, ['🏓'], 0.7, 0.7, 0, Y + 0.95, 0.15, { bg: null, font: FONT(200), px: 256 });
  return g;
}

function fameStore() {
  const g = new THREE.Group();
  // 명예의 전당: 크림색 돌 + 앞 기둥 4개 + 삼각 지붕
  addBox(g, SW + 0.5, 0.45, SD + 0.9, M.stone, 0, 0.22, 0.2);
  for (let i = 0; i < 2; i++) addBox(g, SW + 0.3 - i * 0.3, 0.18, 0.4, std(0xe9e2d2), 0, 0.09 + 0.45 + i * 0.18, SD / 2 + 0.55 - i * 0.35);
  addBox(g, SW - 0.6, SH, SD - 0.6, std(0xf6efe0), 0, 0.45 + SH / 2, -0.3).castShadow = true;
  for (let i = 0; i < 4; i++) {
    const x = -SW / 2 + 0.5 + i * ((SW - 1) / 3);
    cyl(g, 0.22, 0.26, SH, std(0xfbf7ee), x, 0.45 + SH / 2, SD / 2 - 0.1, 16);
    addBox(g, 0.6, 0.15, 0.6, std(0xe9e2d2), x, 0.45 + SH - 0.07, SD / 2 - 0.1);
  }
  addBox(g, SW + 0.3, 0.4, SD + 0.2, std(0xe9e2d2), 0, 0.45 + SH + 0.2, 0);
  addBox(g, SW + 0.1, 0.1, 0.1, M.gold, 0, 0.45 + SH + 0.45, SD / 2 + 0.1);
  plate(g, ['🏆 명예의 전당'], 3.2, 0.55, 0, 0.45 + SH + 0.2, SD / 2 + 0.11, { bg: '#1c2233', color: '#ffe08a', font: FONT(80) });
  door(g, 0x8a6d2b, 0);
  // 지붕 위 큰 트로피
  const Y = 0.45 + SH + 0.4;
  addBox(g, 1.6, 0.5, 1.2, std(0x5a3a22), 0, Y + 0.25, -0.2);
  cyl(g, 0.18, 0.28, 0.9, M.gold, 0, Y + 0.95, -0.2, 16);
  cyl(g, 1.2, 0.42, 1.6, M.gold, 0, Y + 2.2, -0.2, 32);
  for (const sx of [-1, 1]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 10, 20), M.gold); hd.position.set(sx * 1.28, Y + 2.3, -0.2); g.add(hd); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), M.gold); star.position.set(0, Y + 3.3, -0.2); g.add(star);
  return g;
}

// ── 분수 (가운데): 둥근 물받이 2단 + 가운데 물기둥 위에 탁구공이 통통
function fountain(anim) {
  const g = new THREE.Group();
  const stoneL = std(0xd9d4c8), water = new THREE.MeshStandardMaterial({ color: 0x3f9ad6, roughness: 0.08, metalness: 0.2 });
  const waterDisc = (r, y) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), water); m.rotation.x = -Math.PI / 2; m.position.y = y; g.add(m); return m; };
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.25, 10, 48), stoneL); rim.rotation.x = Math.PI / 2; rim.position.y = 0.45; g.add(rim);
  cyl(g, 3.1, 3.2, 0.25, std(0xc8c2b4), 0, 0.125, 0, 48); // 물받이 바닥 (윗면 0.25)
  waterDisc(3.0, 0.4);
  cyl(g, 0.5, 0.7, 1.3, stoneL, 0, 0.9, 0, 24);
  cyl(g, 1.4, 0.9, 0.3, stoneL, 0, 1.6, 0, 32);
  waterDisc(1.3, 1.8);
  cyl(g, 0.2, 0.25, 0.7, stoneL, 0, 2.1, 0, 16);
  // 물줄기 (반투명 기둥) + 바깥으로 흐르는 물 아치
  const jetM = new THREE.MeshStandardMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.5, roughness: 0.05 });
  const jet = cyl(g, 0.08, 0.16, 0.9, jetM, 0, 2.65, 0, 12); jet.castShadow = false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 16, Math.PI), jetM);
    arc.position.set(Math.cos(a) * 1.75, 1.75, Math.sin(a) * 1.75); arc.rotation.y = -a; g.add(arc);
  }
  // 탁구공 (주황) — 물줄기 위에서 통통
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), std(0xff8a3d, { roughness: 0.35 }));
  ball.castShadow = true; g.add(ball);
  // 둘레 작은 바닥 조명 (사진 1의 기둥 조명)
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; cyl(g, 0.06, 0.06, 0.4, M.alu, Math.cos(a) * 4.2, 0.2, Math.sin(a) * 4.2, 8); }
  anim.push((t) => { const p = (t * 1.4) % 1; ball.position.set(0, 3.2 + Math.sin(p * Math.PI) * 0.45, 0); ball.rotation.x = t * 2; });
  return g;
}

// ── 시계탑: 검은 돌 기둥 + 위에 유리 상자 + 네 면 시계 (쉬는 시간 남은 시간을 보여 줄 자리)
function clockTower() {
  const g = new THREE.Group();
  addBox(g, 1.6, 7, 1.6, M.stone, 0, 3.5, 0).castShadow = true;
  const gl = new THREE.MeshStandardMaterial({ map: glassTex(4, 3), roughness: 0.15, metalness: 0.3, emissive: 0x0d3a3a, emissiveIntensity: 0.25 });
  addBox(g, 2.4, 2.4, 2.4, gl, 0, 8.2, 0).castShadow = true;
  addBox(g, 2.6, 0.25, 2.6, M.white, 0, 9.5, 0);
  const tex = clockTex(10, 50);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ map: tex }));
    const a = (i * Math.PI) / 2; c.position.set(Math.sin(a) * 1.22, 8.2, Math.cos(a) * 1.22); c.rotation.y = a; g.add(c);
  }
  plate(g, ['⏰ 쉬는 시간 6분 남음'], 1.5, 0.42, 0, 5.6, 0.81, { bg: '#1c2233', color: '#ffe08a', font: FONT(60) });
  return g;
}

// ── 게시판: 나무 판 + 종이 몇 장 (업데이트·미션·치는 방법)
function board() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) addBox(g, 0.12, 2.2, 0.12, M.wood, sx * 1.4, 1.1, 0);
  addBox(g, 3.0, 1.5, 0.1, std(0x8a5a32), 0, 1.5, 0);
  addBox(g, 3.2, 0.12, 0.4, std(0x6b4224), 0, 2.32, 0);
  const notes = [['📣 업데이트', '#fff6c8'], ['✅ 오늘의 미션', '#d8f5d0'], ['🏓 치는 방법', '#d7ecff']];
  notes.forEach(([t, bg], i) => plate(g, [t], 0.85, 1.0, -0.95 + i * 0.95, 1.5, 0.06, { bg, font: FONT(54), px: 300 }));
  return g;
}

// ── 빵집 (남서쪽, 김제빵이 뛰어나오는 곳)
function bakery() {
  const g = new THREE.Group();
  addBox(g, 5, 3, 4, std(0xf6e3c4), 0, 1.5, 0).castShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), std(0xa0522d)); roof.rotation.y = Math.PI / 4; roof.position.y = 3.9; roof.scale.z = 0.8; roof.castShadow = true; g.add(roof);
  door(g, 0x8a4b1f, -1.1);
  showWindow(g, 1.2, 1.6, 1.1, 1.6);
  awning(g, 5.2, '#a0522d', '#f6e3c4', 2.75, 1.65);
  plate(g, ['🥖 김제빵 빵집'], 2.8, 0.55, 0, 3.2, 2.02, { bg: '#fff3e0', border: '#a0522d', font: FONT(70) });
  // 지붕 위 큰 바게트 + 굴뚝 연기
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 3.2, 6, 12), std(0xd9984a)); bag.rotation.z = Math.PI / 2 - 0.35; bag.position.set(0, 5.1, 0.3); bag.castShadow = true; g.add(bag);
  for (let i = 0; i < 4; i++) { const sl = addBox(g, 0.08, 0.5, 0.5, std(0xf3d29a), -1.2 + i * 0.8, 5.1 + (-1.2 + i * 0.8) * 0.36, 0.55); sl.rotation.z = -0.35; }
  addBox(g, 0.6, 1.4, 0.6, std(0x8a6d5a), 1.6, 4.4, -0.8);
  return g;
}

// ── 포토존: 거대 탁구채 조형물 + 공
function photoZone() {
  const g = new THREE.Group();
  addBox(g, 3.2, 0.25, 2.2, M.stone, 0, 0.12, 0);
  const paddle = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.18, 32), std(0xd7262e, { roughness: 0.5 })); face.rotation.x = Math.PI / 2; face.position.y = 3.0; paddle.add(face);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.08, 32), std(0x22252b)); back.rotation.x = Math.PI / 2; back.position.set(0, 3.0, -0.12); paddle.add(back);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.5, 0.3), M.wood); handle.position.y = 1.15; paddle.add(handle);
  paddle.rotation.z = 0.25; paddle.position.x = -0.4; paddle.traverse((o) => { o.castShadow = true; }); g.add(paddle);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), std(0xffffff, { roughness: 0.35 })); ball.position.set(1.1, 4.3, 0.2); ball.castShadow = true; g.add(ball);
  plate(g, ['📸 준비하시고, 스매시!'], 2.6, 0.5, 0, 0.6, 1.12, { bg: '#fffaf0', border: '#d7262e', font: FONT(64) });
  return g;
}

function foodTruck() {
  const g = new THREE.Group();
  addBox(g, 4.2, 2.2, 2.0, std(0xffb703), 0, 1.5, 0).castShadow = true;
  addBox(g, 1.3, 1.5, 2.0, std(0xfff3d6), 2.7, 1.15, 0);
  addBox(g, 2.6, 1.0, 0.08, std(0x3a3f4a), -0.2, 1.8, 1.02);
  addBox(g, 2.8, 0.1, 0.6, std(0xffffff), -0.2, 1.25, 1.3);
  for (const [x, z] of [[-1.4, 1], [-1.4, -1], [2.3, 1], [2.3, -1]]) { const w = cyl(g, 0.38, 0.38, 0.3, M.dark, x, 0.38, z, 16); w.rotation.x = Math.PI / 2; }
  plate(g, ['🌭 간식'], 1.6, 0.45, -0.2, 2.75, 1.02, { bg: '#d7262e', color: '#fff', font: FONT(70), px: 360 });
  return g;
}
function vending() {
  const g = new THREE.Group();
  [0xe63946, 0x2a5db0].forEach((c, i) => {
    const x = i * 1.15;
    addBox(g, 1.05, 2.0, 0.8, std(c), x, 1.0, 0).castShadow = true;
    addBox(g, 0.75, 1.1, 0.06, new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xffffff, emissiveIntensity: 0.25 }), x - 0.08, 1.25, 0.41);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) cyl(g, 0.06, 0.06, 0.22, std([0xffd23f, 0x7ad35a, 0xff9ed2, 0xffffff][k]), x - 0.36 + k * 0.18, 0.9 + r * 0.33, 0.36, 8);
  });
  return g;
}
// 바다 전망대: 나무 데크 + 난간 + 망원경
function deck() {
  const g = new THREE.Group();
  addBox(g, 14, 0.25, 4.5, std(0xc9a77c), 0, 0.12, 0).receiveShadow = true;
  for (let i = 0; i <= 14; i++) addBox(g, 0.08, 1.0, 0.08, M.alu, -7 + i, 0.75, 2.2);
  addBox(g, 14, 0.06, 0.1, M.alu, 0, 1.25, 2.2);
  for (const sx of [-1, 1]) for (let i = 0; i <= 4; i++) addBox(g, 0.08, 1.0, 0.08, M.alu, sx * 7, 0.75, -2.2 + i * 1.1);
  for (const x of [-3, 3]) {
    cyl(g, 0.07, 0.1, 1.1, M.dark, x, 0.8, 1.6, 8);
    const scope = cyl(g, 0.14, 0.18, 0.7, std(0x3f8fd8), x, 1.45, 1.75, 12); scope.rotation.x = Math.PI / 2 - 0.3;
  }
  return g;
}

function table(x, z, color) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const L = 2.74, W = 1.525, Y = 0.76;
  addBox(g, L, 0.05, W, std(color, { roughness: 0.6 }), 0, Y, 0).castShadow = true;
  addBox(g, L, 0.052, 0.03, M.white, 0, Y + 0.002, -W / 2 + 0.015); addBox(g, L, 0.052, 0.03, M.white, 0, Y + 0.002, W / 2 - 0.015);
  addBox(g, 0.02, 0.15, W + 0.14, std(0xf4f4f4), 0, Y + 0.1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.06, Y, 0.06, M.dark, sx * 1.1, Y / 2, sz * 0.6);
  for (const [sx, c] of [[-1, 0xff8a3d], [1, 0x3f8fd8]]) for (const sz of [-0.5, 0.5]) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
    r.rotation.x = -Math.PI / 2; r.position.set(sx * 2.12, 0.02, sz); g.add(r);
  }
  return g;
}
function tree(s = 1) {
  const g = new THREE.Group();
  cyl(g, 0.14, 0.2, 1.4, std(0x7a5233), 0, 0.7, 0, 8);
  const leaf = new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? 0x3f7f3f : 0x4f9a4a, flatShading: true });
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.ConeGeometry(1.2 - k * 0.3, 1.4, 7), leaf); b.position.y = 1.7 + k * 0.7; b.castShadow = true; g.add(b); } // 소나무 느낌
  g.scale.setScalar(s);
  return g;
}
function bench() {
  const g = new THREE.Group();
  addBox(g, 1.8, 0.42, 0.55, M.stone, 0, 0.21, 0); // 검은 돌 받침
  addBox(g, 1.8, 0.08, 0.55, M.wood, 0, 0.46, 0);
  return g;
}
function lamp() {
  const g = new THREE.Group();
  cyl(g, 0.06, 0.08, 4, M.alu, 0, 2, 0, 8);
  addBox(g, 0.9, 0.12, 0.25, M.alu, 0.35, 4.0, 0);
  addBox(g, 0.5, 0.06, 0.2, new THREE.MeshBasicMaterial({ color: 0xfff4d2 }), 0.55, 3.93, 0);
  return g;
}

// ── 바닥: 큰 회색 돌판 (사진 1), 잔디는 네모
function slabTex() {
  const t = canvasTex(512, 512, (g) => {
    const n = 8, s = 512 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 150 + Math.floor(Math.random() * 30);
      g.fillStyle = `rgb(${v - 8},${v - 2},${v + 6})`; g.fillRect(x * s, y * s, s, s);
      g.strokeStyle = 'rgba(70,78,90,.45)'; g.lineWidth = 2; g.strokeRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildCampus() {
  const root = new THREE.Group();
  const anim = [];
  // 언덕 위 땅 (광장 둘레 잔디) + 가장자리 절벽 아래 바다
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ color: 0x86b96a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-1, -0.02, 4); ground.receiveShadow = true; root.add(ground);
  // 땅 둘레 숲 언덕 (사진 3: 숲 언덕 위 건물)
  const slope = std(0x4e7d3e, { flatShading: true });
  for (let i = 0; i < 40; i++) {
    const t = i / 40, a = t * Math.PI * 2;
    const x = Math.cos(a) * 36 - 1, z = Math.sin(a) * 36 + 4;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rnd() * 2, 0), slope); b.position.set(x, -3 + rnd(), z); b.scale.y = 0.8; root.add(b);
  }
  // 바다 (남·동쪽 아래)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x3f8fc9, roughness: 0.25, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -12, 0); root.add(sea);
  // 자갈 해변 띠 (남쪽 아래, 사진 3)
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(160, 10), new THREE.MeshLambertMaterial({ color: 0x9a948a }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, -11.9, 48); root.add(beach);
  // 북·서쪽 산 (낮은 산이 겹겹이)
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.95 + (i / 13) * 0.75); // 서쪽 → 북쪽
    const r = 90 + rnd() * 40;
    const m = new THREE.Mesh(new THREE.SphereGeometry(26 + rnd() * 18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: i % 2 ? 0x5d8a57 : 0x6f9a66, flatShading: true }));
    m.position.set(Math.cos(a) * r, -12, Math.sin(a) * r); m.scale.y = 0.55 + rnd() * 0.3; root.add(m);
  }

  // 광장 바닥 (회색 돌판)
  const floorT = slabTex(); floorT.repeat.set(44 / 8, 44 / 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(45, 44), new THREE.MeshLambertMaterial({ map: floorT }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 11.5); floor.receiveShadow = true; root.add(floor);
  // 네모 잔디밭 (사진 1) + 둘레 돌 턱
  for (const [x0, z0, x1, z1] of [[-21, -9, -17, 4], [17, -9, 21, 4], [-21, 15, -17, 23], [17, 26, 21, 30]]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color: 0x5faa48 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2); lawn.receiveShadow = true; root.add(lawn);
    for (const z of [z0 + 1, (z0 + z1) / 2, z1 - 1]) cyl(root, 0.05, 0.05, 0.45, M.alu, x0 - 0.2, 0.22, z, 8); // 작은 기둥 조명
  }
  // 서쪽 밖 축구장 (사진 2, 줄무늬)
  const pitchT = canvasTex(256, 512, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#4caf50' : '#5cbf5f'; g.fillRect(0, i * 64, 256, 64); } g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, 240, 496); g.beginPath(); g.moveTo(8, 256); g.lineTo(248, 256); g.stroke(); g.beginPath(); g.arc(128, 256, 40, 0, 7); g.stroke(); });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(9, 20), new THREE.MeshLambertMaterial({ map: pitchT }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(-29, 0.01, -4); root.add(pitch);

  // 본관: 떠 있는 유리 막대 2개 + 검은 돌 기둥 (사진 1·2)
  glassBar(root, -36, 8, -30, -17, 13, 25); // 막대 ① (높게, 바닥에서 13m 떠 있음)
  glassBar(root, 0, 40, -25, -14.5, 8.5, 18); // 막대 ② (조금 낮게, 앞쪽)
  addBox(root, 7, 13, 9, M.stone, -4, 6.5, -24).castShadow = true; // 검은 돌 기둥 (사진 1)
  addBox(root, 6, 8.5, 8, M.stone, 13, 4.25, -20).castShadow = true;
  addBox(root, 4, 13, 6, M.stone, -32, 6.5, -24);
  // 본관 앞면 전광판 (경기 점수·오늘의 1등)
  const scr = canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#ffe08a'; g.font = FONT(64); g.textAlign = 'center'; g.fillText('🔥 1번 탁구대  김OO 7 : 5 이OO', w / 2, 130);
    g.fillStyle = '#9fe0ff'; g.font = FONT(56); g.fillText('🏆 오늘의 1등  박OO  12승', w / 2, 270);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(15, 5.6), new THREE.MeshBasicMaterial({ map: scr }));
  screen.position.set(-16, 16.6, -16.94); root.add(screen);

  // 분수 + 가게 반원 (분수 (0,2) 둘레 반지름 약 8.5)
  const F = [0, 2];
  const fnt = fountain(anim); fnt.position.set(F[0], 0, F[1]); root.add(fnt);
  const shops = [[gachaStore(), -52], [closetStore(), 0], [fameStore(), 52]];
  for (const [g, deg] of shops) {
    const a = (deg * Math.PI) / 180, R = 9;
    g.position.set(F[0] + Math.sin(a) * R, 0, F[1] - Math.cos(a) * R);
    g.rotation.y = -a; // 앞(+z)이 분수 쪽
    root.add(g);
  }

  const ct = clockTower(); ct.position.set(13.5, 0, -6.5); ct.rotation.y = -0.5; root.add(ct);
  const bd = board(); bd.position.set(5, 0, 9.6); bd.rotation.y = -0.35; root.add(bd);
  // 탁구대 (사람 대결 3대 + 김제빵)
  for (const [x, z] of [[-14, 13], [14, 13], [0, 25]]) root.add(table(x, z, 0x2a5db0));
  root.add(table(-14, 27, 0x2f8a4e));
  const bk = bakery(); bk.position.set(-19.5, 0, 30.5); bk.rotation.y = Math.PI / 2 + 0.4; root.add(bk);
  const pz = photoZone(); pz.position.set(-7, 0, 19.5); pz.rotation.y = 0.5; root.add(pz);
  const ft = foodTruck(); ft.position.set(19.5, 0, 21); ft.rotation.y = -Math.PI / 2; root.add(ft);
  const vd = vending(); vd.position.set(20.6, 0, 27); vd.rotation.y = -Math.PI / 2; root.add(vd);
  const dk = deck(); dk.position.set(13, 0, 33.3); root.add(dk);
  // 가장자리 가로등·벤치·소나무
  for (const sx of [-1, 1]) {
    for (const z of [-6, 6, 18, 30]) { const l = lamp(); l.position.set(sx * 22.3, 0, z); l.rotation.y = sx > 0 ? Math.PI : 0; root.add(l); }
    for (const z of [9, 20]) { const b = bench(); b.position.set(sx * 21.6, 0, z); b.rotation.y = Math.PI / 2; root.add(b); }
    for (let i = 0; i < 8; i++) { const t = tree(0.9 + rnd() * 0.5); t.position.set(sx * (24.5 + rnd() * 2), 0, -8 + i * 5.2 + rnd()); root.add(t); }
  }
  for (let i = 0; i < 4; i++) { const t = tree(0.9 + rnd() * 0.5); t.position.set(-14 + i * 4 + rnd(), 0, 36 + rnd() * 2); root.add(t); }

  // 사람 대신 표시 (처음 서는 곳)
  const me = new THREE.Group();
  cyl(me, 0.28, 0.32, 0.9, std(0xffd23f), 0, 0.75, 0, 16);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), std(0xf3d5b5)); hd.position.y = 1.5; me.add(hd);
  me.position.set(0, 0, 10.5); root.add(me);

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.receiveShadow = true; });
  return { root, anim };
}
