// 광장 새 디자인 시안: 나머지 건물·조형물 다듬기 (plaza.md 20장)
// 분수 · 시계탑 · 게시판 · 김제빵 빵집 · 포토존 · 푸드트럭 · 자판기 · 바다 전망대
// 각 물건은 그룹의 +z가 앞. 밤에 켜지는 재질은 userData.glow = [낮, 밤]. 움직이는 것은 anim에 (t초) => {} 를 넣음
import * as THREE from 'three';
import { canvasTex, clockTex, std } from './arena-kit.js';
import { bladeSign, box, cyl, F2, face, flat, FONT, glow, HW, lathe, litM, MAT, plate, propSpot, ROOF_Y, shell, SHOP_D, SHOP_W, signPlate, signTex, sphere, win, winGlass, withRepeat, Y1, Y2, YB } from './campusShops.js';
import { drawFood } from './games/props/models.js';

const wood = (c = 0xb07a45) => std(c, { roughness: 0.75 });
function plankTex(base = '#b98a5a', n = 8) {
  const t = canvasTex(256, 256, (g) => {
    const s = 256 / n;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(base).offsetHSL(0, 0, ((i * 5) % 3 - 1) * 0.03);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(0, i * s, 256, s);
      g.fillStyle = 'rgba(70,40,20,.5)'; g.fillRect(0, i * s, 256, 2);
      g.fillRect(((i * 97) % 200) + 20, i * s, 2, s);
      g.strokeStyle = 'rgba(90,55,25,.15)'; g.lineWidth = 1;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, i * s + 6 + k * 8); g.bezierCurveTo(80, i * s + 3 + k * 8, 170, i * s + 10 + k * 8, 256, i * s + 6 + k * 8); g.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function brickTex(base = '#a5553a') {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d9cbb5'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) {
      const c = new THREE.Color(base).offsetHSL(0, 0, (((x * 7 + y * 3) % 5) - 2) * 0.025);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function shingleTex(base = '#9a4a2c') {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#5a2a18'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 10; y++) for (let x = -1; x < 9; x++) {
      const c = new THREE.Color(base).offsetHSL(0, 0, (((x * 3 + y * 7) % 5) - 2) * 0.03);
      g.fillStyle = '#' + c.getHexString();
      g.beginPath(); const cx = x * 32 + (y % 2) * 16 + 16, cy = y * 26; g.moveTo(cx - 15, cy); g.lineTo(cx + 15, cy); g.lineTo(cx + 15, cy + 18); g.quadraticCurveTo(cx, cy + 30, cx - 15, cy + 18); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ── 분수 (11/28 새 모습 — 참고 그림 docs/dev/ref/fountain.jpg): 이끼 낀 회베이지 돌 3단
// 바깥 낮은 계단(튀어나온 돌 블록) + 두꺼운 물받이 테두리(네모 돌) → 가운데 둥근 돌 단 2층(작은 연못) → 팔각 기둥·접시에서 흘러내리는 물 + 통통 탁구공(사용자 확정: 남김)
// 물속 금색 동전(⛲ 동전 던지기와 이어짐) · 풀 포기 · 작은 돌멩이. 둘레 포장·밤 바닥 조명은 그대로
function stoneTex(seed = 1) {
  let r = seed * 7919;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const t = canvasTex(256, 256, (c) => {
    c.fillStyle = '#a99f90'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 22; i++) { c.fillStyle = rnd() < 0.5 ? `rgba(200,194,178,${0.15 + rnd() * 0.2})` : `rgba(132,124,112,${0.12 + rnd() * 0.18})`; c.beginPath(); c.ellipse(rnd() * 256, rnd() * 256, 10 + rnd() * 28, 5 + rnd() * 12, rnd() * 3, 0, 7); c.fill(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(118,140,78,${0.25 + rnd() * 0.2})`; c.beginPath(); c.ellipse(rnd() * 256, rnd() * 256, 6 + rnd() * 12, 3 + rnd() * 6, rnd() * 3, 0, 7); c.fill(); } // 이끼
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function fountain(anim) {
  const g = new THREE.Group();
  const stoneOf = (seed, col, rep) => new THREE.MeshStandardMaterial({ map: withRepeat(stoneTex(seed), rep, 1), color: col, roughness: 0.9, flatShading: true });
  const stone = stoneOf(1, 0xffffff, 8), stoneD = stoneOf(2, 0xd9d3c9, 8), stoneB = stoneOf(3, 0xeae6de, 1);
  let sd = 5;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  // 바닥 둘레 원형 포장 (짙은 회색 돌 + 흰 줄)
  const ringTex = canvasTex(512, 512, (c) => {
    c.fillStyle = '#8f949a'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
    for (let r = 0; r < 4; r++) { c.beginPath(); c.arc(256, 256, 160 + r * 24, 0, 7); c.stroke(); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; c.beginPath(); c.moveTo(256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160); c.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256); c.stroke(); }
  });
  const pave = new THREE.Mesh(new THREE.CircleGeometry(5.2, 64), new THREE.MeshLambertMaterial({ map: ringTex }));
  pave.rotation.x = -Math.PI / 2; pave.position.y = 0.012; pave.receiveShadow = true; g.add(pave);
  // 둥글게 놓는 돌 블록 (바깥 = +z 쪽이 바깥)
  const ringBox = (w, h, d, m, r, y, a) => { const b = box(g, w, h, d, m, Math.cos(a) * r, y, Math.sin(a) * r); b.rotation.y = Math.PI / 2 - a; return b; };
  // ① 바깥 낮은 계단 + 튀어나온 돌 블록
  lathe(g, [[3.98, 0], [3.98, 0.17], [3.5, 0.19]], stoneD, 0, 0, 0, 16);
  for (let i = 0; i < 8; i++) ringBox(0.62, 0.42, 0.5, stoneD, 3.78, 0.21, (i / 8) * Math.PI * 2);
  // ② 물받이 테두리 (16각) + 위에 얹은 네모 돌 8개
  lathe(g, [[3.55, 0.17], [3.55, 0.62], [3.62, 0.66], [3.62, 0.8], [3.04, 0.8], [3.04, 0.68], [3.0, 0.2], [0, 0.2]], stone, 0, 0, 0, 16);
  for (let i = 0; i < 8; i++) ringBox(0.78, 0.26, 0.66, stoneB, 3.33, 0.9, (i / 8) * Math.PI * 2 + Math.PI / 8);
  // 물 (진한 파랑 + 잔물결, 가장자리 밝은 띠)
  const ripple = canvasTex(256, 256, (c) => {
    c.fillStyle = '#3f92d4'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(190,232,255,.35)'; c.lineWidth = 2;
    for (let i = 0; i < 30; i++) { const x = (i * 53) % 256, y = (i * 97) % 256; c.beginPath(); c.ellipse(x, y, 16 + (i % 4) * 6, 5, (i % 7) * 0.4, 0, Math.PI * 1.2); c.stroke(); }
  });
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping; ripple.repeat.set(3, 3);
  const water = new THREE.MeshStandardMaterial({ map: ripple, roughness: 0.15, metalness: 0.1 });
  const edgeM = new THREE.MeshStandardMaterial({ color: 0x9edcf6, roughness: 0.2 });
  const disc = (r, y, m) => { const d = new THREE.Mesh(new THREE.CircleGeometry(r, 32), m); d.rotation.x = -Math.PI / 2; d.position.y = y; g.add(d); return d; };
  const ring = (r0, r1, y) => { const d = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), edgeM); d.rotation.x = -Math.PI / 2; d.position.y = y; g.add(d); };
  disc(3.03, 0.6, water); ring(2.88, 3.03, 0.605); ring(2.0, 2.16, 0.605);
  // ③ 가운데 둥근 돌 단 2층 (14각) + 작은 연못
  lathe(g, [[2.02, 0.2], [2.02, 0.98], [1.7, 1.0], [1.7, 1.44], [1.4, 1.44], [1.4, 1.26], [0, 1.26]], stone, 0, 0, 0, 14);
  disc(1.41, 1.36, water); ring(1.28, 1.41, 1.365);
  // ④ 팔각 기둥 + 가운데 접시 + 작은 기둥 + 맨 위 접시
  cyl(g, 0.46, 0.5, 0.2, stoneB, 0, 1.4, 0, 8);
  cyl(g, 0.26, 0.32, 0.5, stoneB, 0, 1.75, 0, 8);
  lathe(g, [[0, 0], [0.26, 0], [0.6, 0.17], [0.64, 0.3], [0.52, 0.3], [0, 0.22]], stoneB, 0, 1.95, 0, 8);
  disc(0.53, 2.24, water);
  cyl(g, 0.17, 0.22, 0.42, stoneB, 0, 2.43, 0, 8);
  lathe(g, [[0, 0], [0.15, 0], [0.34, 0.14], [0.36, 0.25], [0.27, 0.25], [0, 0.19]], stoneB, 0, 2.62, 0, 8);
  disc(0.28, 2.86, water);
  // 흘러내리는 물: 맨 위 접시 → 가운데 접시 → 연못 (네 갈래, 줄무늬가 아래로 흐름)
  const fall = canvasTex(128, 64, (c) => { c.clearRect(0, 0, 128, 64); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(225,246,255,${0.35 + (i % 3) * 0.2})`; c.fillRect((i * 37) % 128, 0, 2 + (i % 3), 64); } });
  fall.wrapS = fall.wrapT = THREE.RepeatWrapping; fall.repeat.set(2, 1.5);
  const fallM = new THREE.MeshStandardMaterial({ map: fall, transparent: true, opacity: 0.85, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.48, 0.62, 10, 1, true, a, 0.55), fallM); s1.position.y = 2.56; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 0.88, 14, 1, true, a + 0.6, 0.5), fallM); s2.position.y = 1.8; g.add(s2);
  }
  // 물보라 고리 (연못에 떨어지는 곳)
  const splM = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.6, depthWrite: false });
  const splashes = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3 + 0.85;
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 12), splM); sp.rotation.x = Math.PI / 2; sp.position.set(Math.sin(a) * 0.82, 1.38, Math.cos(a) * 0.82); g.add(sp); splashes.push(sp);
  }
  // 물속 금색 동전
  const coinM = glow(new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb000, roughness: 0.4 }), 0.25, 0.4);
  const coin = (r, y) => { const a = rnd() * Math.PI * 2; const c = cyl(g, 0.085, 0.085, 0.02, coinM, Math.cos(a) * r, y, Math.sin(a) * r, 12); c.castShadow = false; };
  for (let i = 0; i < 14; i++) coin(2.25 + rnd() * 0.6, 0.615);
  for (let i = 0; i < 4; i++) coin(0.75 + rnd() * 0.5, 1.375);
  // 풀 포기 · 작은 돌멩이
  const grassM = new THREE.MeshStandardMaterial({ color: 0x6fa84a, roughness: 0.9, flatShading: true });
  const tuft = (r, y, a) => {
    const t = new THREE.Group(); t.position.set(Math.cos(a) * r, y, Math.sin(a) * r); t.rotation.y = rnd() * 6; g.add(t);
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 + k * 0.05, 4), grassM); c.position.set((k - 1) * 0.06, 0.1, (k % 2) * 0.04); c.rotation.z = (k - 1) * 0.35; t.add(c); }
  };
  for (let i = 0; i < 7; i++) tuft(3.3, 0.8, rnd() * 6.28);
  for (let i = 0; i < 4; i++) tuft(1.86, 1.0, rnd() * 6.28);
  for (let i = 0; i < 5; i++) tuft(3.95, 0.17, rnd() * 6.28);
  const rockM = new THREE.MeshStandardMaterial({ color: 0x8e8a84, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, rr = 0.1 + rnd() * 0.1; const k = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), rockM); k.position.set(Math.cos(a) * 4.15, rr * 0.6, Math.sin(a) * 4.15); k.rotation.set(rnd() * 3, rnd() * 3, 0); k.castShadow = true; g.add(k); }
  // 맨 위 물기둥 + 통통 탁구공
  const jetM = new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false });
  const jet = cyl(g, 0.04, 0.08, 0.4, jetM, 0, 3.05, 0, 8); jet.castShadow = false;
  const ball = sphere(g, 0.2, std(0xff8a3d, { roughness: 0.35 }), 0, 3.3, 0, 20);
  // 둘레 바닥 조명 기둥 (밤에 켜짐)
  const lampM = glow(new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe2a0 }), 0.2, 2.2);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; cyl(g, 0.07, 0.07, 0.45, MAT.alu, Math.cos(a) * 4.6, 0.22, Math.sin(a) * 4.6, 10); cyl(g, 0.075, 0.075, 0.08, lampM, Math.cos(a) * 4.6, 0.48, Math.sin(a) * 4.6, 10); }
  anim?.push((t) => {
    const p = (t * 1.4) % 1; ball.position.y = 3.1 + Math.sin(p * Math.PI) * 0.45; ball.rotation.x = t * 2;
    ripple.offset.set(t * 0.02, t * 0.013); fall.offset.y = -t * 0.9;
    splashes.forEach((sp, i) => { const k = (t * 1.5 + i * 0.27) % 1; sp.scale.setScalar(0.6 + k * 1.3); sp.material.opacity = 0.6; });
  });
  return g;
}

// ── 시계탑: 계단 받침 + 검은 돌 기둥(세로 빛 틈) + 쉬는 시간 전광판 + 위에 알루미늄 핀 유리 상자 + 금테 시계 4면 + 흰 지붕 판·꼭대기 탁구공
export function clockTower(anim) {
  const g = new THREE.Group();
  const granite = std(0x2b2e33, { roughness: 0.4, metalness: 0.15 });
  for (let i = 0; i < 2; i++) box(g, 2.6 - i * 0.4, 0.2, 2.6 - i * 0.4, MAT.granite, 0, 0.1 + i * 0.2, 0, 0.03);
  box(g, 1.7, 6.6, 1.7, granite, 0, 0.4 + 3.3, 0, 0.04);
  const slitM = glow(new THREE.MeshStandardMaterial({ color: 0xbfe8ea, emissive: 0x9fe3e8 }), 0.25, 2.0);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; const sl = box(g, 0.12, 5.0, 0.05, slitM, Math.sin(a) * 0.86, 0.4 + 3.6, Math.cos(a) * 0.86); sl.rotation.y = a; }
  // 쉬는 시간 전광판 (앞면, 눈높이 조금 위)
  box(g, 1.5, 0.75, 0.1, std(0x111418), 0, 3.0, 0.9, 0.03);
  const pl = plate(g, ['⏰ 쉬는 시간', '6분 남음'], 1.35, 0.6, 0, 3.0, 0.96, { bg: '#0b1020', color: '#ffe08a', font: FONT(56), px: 360 });
  pl.name = 'clock-plate'; pl.userData.noBake = true; // 실제 광장: 쉬는 시간 안내 (ui/plazaBoards.js가 다시 그림)
  // 위 유리 상자 + 세로 핀 + 시계 4면
  const Y = 0.4 + 6.6 + 1.3;
  const gl = new THREE.MeshStandardMaterial({ color: 0x3f8588, roughness: 0.08, metalness: 0.55, emissive: 0x0a2a2c, emissiveIntensity: 0.3 });
  box(g, 2.5, 2.6, 2.5, gl, 0, Y, 0);
  for (let i = 0; i < 4; i++) for (let k = -2; k <= 2; k++) { const a = (i * Math.PI) / 2; const f = box(g, 0.07, 2.7, 0.14, MAT.alu, Math.sin(a) * 1.28 + Math.cos(a) * k * 0.55, Y, Math.cos(a) * 1.28 - Math.sin(a) * k * 0.55); f.rotation.y = a; }
  box(g, 2.6, 0.25, 2.6, std(0x22383b), 0, Y - 1.35, 0);
  const faceTex = clockTex(10, 50);
  const faceM = glow(new THREE.MeshStandardMaterial({ map: faceTex, emissive: 0xffffff, emissiveMap: faceTex }), 0.15, 0.9);
  const hands = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, sx = Math.sin(a), cz = Math.cos(a);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.92, 40), faceM); face.position.set(sx * 1.36, Y, cz * 1.36); face.rotation.y = a; g.add(face);
    face.name = 'clock-face'; face.userData.noBake = true; // 실제 광장: 한국 시간 (ui/plazaBoards.js)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 10, 40), MAT.gold); rim.position.copy(face.position); rim.rotation.y = a; g.add(rim);
    // 움직이는 초침 (빨강)
    const hand = new THREE.Group(); hand.position.set(sx * 1.39, Y, cz * 1.39); hand.rotation.y = a; g.add(hand);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.01), std(0xe0333c)); h.position.y = 0.3; hand.add(h); hands.push(hand);
  }
  // 지붕: 흰 판 2단 + 꼭대기 탁구공
  box(g, 2.9, 0.22, 2.9, MAT.white, 0, Y + 1.42, 0, 0.04);
  box(g, 2.3, 0.18, 2.3, MAT.white, 0, Y + 1.62, 0, 0.04);
  cyl(g, 0.06, 0.06, 0.9, MAT.alu, 0, Y + 2.15, 0, 8);
  sphere(g, 0.25, std(0xff8a3d, { roughness: 0.35 }), 0, Y + 2.7, 0, 20);
  anim.push(() => { const sec = (Date.now() / 1000) % 60; for (const h of hands) h.rotation.z = -(sec / 60) * Math.PI * 2; }); // 진짜 초침
  return g;
}

// ── 게시판: 돌 받침 + 나무 기둥 + 작은 기와 지붕 + 코르크판 + 압정 꽂힌 종이 3장 + 위 조명
//  notes = 종이 3장 [제목, 종이 색, 기울기] — 광장 게시판(기본)과 낚시 게시판(FISH_NOTES)이 같은 모양
export const MAIN_NOTES = [['📣 업데이트', '#fff6c8', -0.05], ['✅ 오늘의 미션', '#d8f5d0', 0.04], ['🏓 치는 방법', '#d7ecff', -0.03]];
export const FISH_NOTES = [['🎣 낚시 방법', '#d7ecff', -0.04], ['💡 낚시 팁', '#fff6c8', 0.03], ['🐱 고양이', '#ffe1ea', -0.04]];
export function board(notes = MAIN_NOTES) {
  const g = new THREE.Group();
  box(g, 3.6, 0.3, 0.7, MAT.granite, 0, 0.15, 0, 0.04);
  const post = wood(0x7a5233);
  for (const sx of [-1, 1]) box(g, 0.16, 2.6, 0.16, post, sx * 1.55, 1.6, 0, 0.03);
  // 코르크판 + 나무 테두리
  const cork = canvasTex(256, 128, (c) => { c.fillStyle = '#c99a62'; c.fillRect(0, 0, 256, 128); for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${90 + Math.random() * 80},${60 + Math.random() * 50},30,.35)`; c.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); } });
  box(g, 3.0, 1.6, 0.08, new THREE.MeshStandardMaterial({ map: cork, roughness: 0.9 }), 0, 1.75, 0);
  for (const [w, h, x, y] of [[3.12, 0.1, 0, 2.58], [3.12, 0.1, 0, 0.92], [0.1, 1.76, -1.53, 1.75], [0.1, 1.76, 1.53, 1.75]]) box(g, w, h, 0.14, post, x, y, 0.02);
  // 종이 3장 (제목 + 줄) + 압정
  notes.forEach(([t, bg, rot], i) => {
    const tex = canvasTex(240, 300, (c) => { c.fillStyle = bg; c.fillRect(0, 0, 240, 300); c.fillStyle = '#2b2a33'; c.font = FONT(36); c.textAlign = 'center'; c.fillText(t, 120, 60); c.fillStyle = 'rgba(43,42,51,.35)'; for (let k = 0; k < 6; k++) c.fillRect(30, 110 + k * 28, 150 + ((k * 37) % 40), 6); });
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    n.position.set(-0.95 + i * 0.95, 1.72, 0.05); n.rotation.z = rot; g.add(n);
    sphere(g, 0.04, std([0xe0333c, 0x2f6fe0, 0xffb000][i]), -0.95 + i * 0.95, 2.15, 0.07, 8);
  });
  // 작은 지붕 (양쪽으로 기운 판 2장, 기와 무늬)
  const roofM = new THREE.MeshStandardMaterial({ map: withRepeat(shingleTex('#6a7a8a'), 2, 1), roughness: 0.8 });
  for (const sz of [-1, 1]) { const r = box(g, 3.6, 0.07, 0.6, roofM, 0, 3.0, sz * 0.25); r.rotation.x = sz * 0.5; }
  box(g, 3.65, 0.08, 0.08, post, 0, 3.15, 0);
  // 위 조명 (아래를 비춤)
  const bulb = glow(new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe6a0 }), 0.3, 2.2);
  for (const x of [-0.8, 0.8]) { box(g, 0.04, 0.04, 0.4, MAT.dark, x, 2.8, 0.2); cyl(g, 0.05, 0.14, 0.12, MAT.dark, x, 2.75, 0.42, 12); sphere(g, 0.05, bulb, x, 2.69, 0.42, 8); }
  return g;
}

// 빵 모양들
function croissant(p, x, y, z, s = 1, rz = 0) {
  const c = new THREE.Mesh(new THREE.TorusGeometry(0.16 * s, 0.075 * s, 8, 14, Math.PI * 1.25), std(0xd9984a, { roughness: 0.6 }));
  c.position.set(x, y, z); c.rotation.set(Math.PI / 2, 0, rz); c.castShadow = true; p.add(c);
  return c;
}
function baguette(p, x, y, z, len = 0.7, rz = 0, ry = 0) {
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, len, 6, 10), std(0xd9984a, { roughness: 0.6 }));
  b.position.set(x, y, z); b.rotation.set(0, ry, Math.PI / 2 + rz); b.castShadow = true; p.add(b);
  return b;
}
function loaf(p, x, y, z, s = 1, col = 0xc98a42) {
  const l = sphere(p, 0.16 * s, std(col, { roughness: 0.6 }), x, y, z, 14); l.scale.set(1.3, 0.7, 1);
  return l;
}

// ── 김제빵 빵집 (11/28 새 모습 — 참고 그림 docs/dev/ref/bakery.jpg): 가게 3개와 같은 2층 틀(campusShops.js shell)
// 크림 벽 + 나무 기둥·띠, 1층 통유리 진열장(앞 + 오른쪽 모서리, 안에 빵 진열대·나무 계산대) + 왼쪽 앞 문, 띠에 입체 글자 '김제빵 빵집'
// 2층: 주황·노랑 차양 창 · 꽃 화단 상자 · 벽돌 조각 · 오른쪽 뒤 작은 발코니, 왼쪽 매달린 빵 간판, 갈색 평지붕 위 거대 바게트 + 뒤 구석 작은 굴뚝(연기, 사용자 확정)
const breadIcon = (c, w, ih) => {
  const s = ih / 100, cx = w / 2, cy = ih * 0.55;
  c.save(); c.translate(cx, cy); c.rotate(-0.25);
  c.fillStyle = '#e9a548'; c.strokeStyle = '#7a4a26'; c.lineWidth = 5 * s;
  c.beginPath(); c.ellipse(0, 0, 70 * s, 30 * s, 0, 0, 7); c.fill(); c.stroke();
  c.strokeStyle = '#f9dc9c'; c.lineWidth = 7 * s; c.lineCap = 'round';
  for (const x of [-32, 0, 32]) { c.beginPath(); c.moveTo((x - 10) * s, 12 * s); c.lineTo((x + 10) * s, -12 * s); c.stroke(); }
  c.restore();
};
export function bakery(anim) {
  const g = new THREE.Group();
  const FZ = SHOP_D / 2;
  const cream = flat(0xf6e7c9), woodL = flat(0xd49b5d), woodD = flat(0x9c673a), brown = flat(0x7c4b2f), roofB = flat(0xa57b62), dk = flat(0x6b4226);
  const orange = flat(0xf0a062), yellow = flat(0xf2bf4e), green = flat(0x9cc04a), brick = flat(0xc77a4e);
  const G = winGlass();
  const { xr, zf } = shell(g, { wall1: cream, wall2: cream, band: woodL, rim: brown, roof: roofB, post: woodL, frame: woodL, doorFrame: woodD, inside: 0xfff1d8, floor: 0xefe0c8, doorX: -1.55, doorW: 1.15, mull: [0.95], mullR: [-0.25] });
  // 1층 위 나무 띠 (앞·오른쪽, 판자 줄) + 입체 글자 '김제빵 빵집'
  box(g, SHOP_W - 0.06, 0.55, 0.1, woodL, 0, YB - 0.27, FZ + 0.03);
  box(g, 0.1, 0.55, SHOP_D - 0.06, woodL, HW + 0.03, YB - 0.27, 0);
  for (const y of [YB - 0.1, YB + 0.18]) { box(g, SHOP_W + 0.26, 0.025, 0.02, woodD, 0, y, FZ + 0.13); box(g, 0.02, 0.025, SHOP_D + 0.26, woodD, HW + 0.13, y, 0); }
  signPlate(g, signTex('김제빵 빵집', ['#f8ead0'], { w: 900, h: 200, outline: '#6b4226' }), 3.3, 0.73, 0.35, YB - 0.24, FZ + 0.16);
  // 2층 앞: 주황 차양 창 · 꽃 화단 4칸 창 / 오른쪽: 4칸 창 · 노랑 차양 창(화단) · 뒤 작은 발코니 / 왼쪽: 벽돌 조각
  const yM = Y2 + F2 / 2, fF = face(g, 'front'), fR = face(g, 'right'), fL = face(g, 'left');
  const awning = (f, x, w, m) => { const a = box(f, w, 0.06, 0.62, m, x, yM + 0.5, 0.28); a.rotation.x = 0.5; const lip = box(f, w, 0.12, 0.04, m, x, yM + 0.33, 0.57); lip.rotation.x = 0.1; };
  const planter = (f, x, w) => { box(f, w, 0.22, 0.26, dk, x, yM - 0.62, 0.14); box(f, w - 0.1, 0.1, 0.18, green, x, yM - 0.47, 0.14); };
  const bricks = (f, pts) => { for (const [x, y] of pts) box(f, 0.3, 0.1, 0.03, brick, x, y, 0.02); };
  win(fF, -1.45, yM - 0.05, 1.15, 0.72, woodD, G, { cols: 2, rows: 1 }); awning(fF, -1.45, 1.4, orange);
  win(fF, 0.85, yM + 0.05, 0.75, 0.95, woodD, G, { cols: 2, rows: 2 }); planter(fF, 0.85, 1.0);
  bricks(fF, [[-2.35, yM - 0.6], [-0.35, yM + 0.62], [-0.2, yM + 0.5], [2.2, yM - 0.3], [2.35, yM - 0.42]]);
  win(fR, -1.1, yM + 0.05, 0.75, 0.95, woodD, G, { cols: 2, rows: 2 });
  win(fR, 0.5, yM - 0.05, 0.85, 0.72, woodD, G, { cols: 2, rows: 1 }); awning(fR, 0.5, 1.1, yellow); planter(fR, 0.5, 1.0);
  bricks(fR, [[-0.25, yM + 0.6], [-0.1, yM + 0.48], [-1.85, yM - 0.55]]);
  box(fR, 0.85, 0.08, 0.6, woodD, 1.75, Y2 + 0.05, 0.3); // 발코니 바닥 + 난간
  box(fR, 0.85, 0.06, 0.06, woodL, 1.75, Y2 + 0.85, 0.57); box(fR, 0.06, 0.06, 0.6, woodL, 1.35, Y2 + 0.85, 0.3); box(fR, 0.06, 0.06, 0.6, woodL, 2.15, Y2 + 0.85, 0.3);
  for (let i = 0; i < 5; i++) box(fR, 0.04, 0.8, 0.04, woodL, 1.37 + i * 0.19, Y2 + 0.45, 0.57);
  for (const z of [0.12, 0.42]) { box(fR, 0.04, 0.8, 0.04, woodL, 1.35, Y2 + 0.45, z); box(fR, 0.04, 0.8, 0.04, woodL, 2.15, Y2 + 0.45, z); }
  bricks(fL, [[-1.2, yM + 0.4], [-1.05, yM + 0.28], [0.9, yM - 0.5], [1.6, yM + 0.55]]);
  bladeSign(g, signTex('', ['#6b4226'], { w: 256, h: 256, bg: '#f6c98a', icon: breadIcon, iconH: 1 }), 0.6, 0.6, YB - 0.55, dk);
  // 진열장 안: 앞 유리 쪽 빵 진열대(2단) + 오른쪽 나무 계산대
  box(g, 2.9, 0.75, 0.45, woodL, 0.85, Y1 + 0.375, zf + 0.3);
  box(g, 2.9, 0.05, 0.3, woodD, 0.85, Y1 + 1.15, zf + 0.22);
  for (const sx of [-1, 1]) box(g, 0.05, 0.4, 0.3, woodD, 0.85 + sx * 1.4, Y1 + 0.95, zf + 0.22);
  for (let i = 0; i < 5; i++) croissant(g, -0.35 + i * 0.6, Y1 + 0.8, zf + 0.38, 1.1, i * 0.4);
  for (let i = 0; i < 6; i++) loaf(g, -0.4 + i * 0.5, Y1 + 1.22, zf + 0.22, 1.0, [0xc98a42, 0xa86a2e, 0xe0b070, 0x8a5a2b][i % 4]);
  box(g, 0.45, 0.9, 2.3, woodL, xr + 0.32, Y1 + 0.45, -0.55); box(g, 0.55, 0.05, 2.4, woodD, xr + 0.32, Y1 + 0.92, -0.55);
  for (let i = 0; i < 3; i++) baguette(g, xr + 0.32, Y1 + 1.0, -1.35 + i * 0.5, 0.45, 0, Math.PI / 2);
  box(g, 0.3, 0.25, 0.3, MAT.dark, xr + 0.32, Y1 + 1.07, 0.4, 0.03); // 계산기
  // 지붕 위 거대 바게트 (낮은 폴리곤 + 칼집 3개)
  const bg = new THREE.Group(); bg.position.set(-0.1, ROOF_Y + 0.62, 0.15); bg.rotation.y = 0.42; g.add(bg);
  const big = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7), flat(0xeaa64a)); big.scale.set(2.3, 0.85, 1.1); big.castShadow = true; bg.add(big);
  for (const x of [-0.85, 0, 0.85]) { const h = 0.85 * Math.sqrt(1 - (x / 2.3) ** 2); const c = box(bg, 0.16, 0.08, 0.7, flat(0xf8d590), x, h - 0.02, 0); c.rotation.y = 0.55; }
  // 뒤 구석 작은 굴뚝 + 연기
  const bm = new THREE.MeshStandardMaterial({ map: withRepeat(brickTex(), 0.5, 1), roughness: 0.8 });
  box(g, 0.5, 0.95, 0.5, bm, -2.15, ROOF_Y + 0.45, -1.55);
  box(g, 0.62, 0.12, 0.62, brown, -2.15, ROOF_Y + 0.96, -1.55);
  const smokeM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false });
  const puffs = [0, 1, 2, 3].map(() => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), smokeM.clone()); g.add(s); return s; });
  anim?.push((t) => puffs.forEach((s, i) => { const k = (t * 0.25 + i / 4) % 1; s.position.set(-2.15 + k * 0.5, ROOF_Y + 1.2 + k * 2.0, -1.55 - k * 0.3); s.scale.setScalar(0.6 + k * 1.3); s.material.opacity = 0.6 * (1 - k); }));
  return g;
}

// ── 포토존: 둥근 돌 무대 + 거대 탁구채(빨간 돌기 고무·층층 나무 손잡이) + 공(이음매) + 글자 판 + 바닥 조명
export function photoZone() {
  const g = new THREE.Group();
  lathe(g, [[0, 0], [1.9, 0], [1.95, 0.12], [1.85, 0.25], [0, 0.25]], MAT.granite, 0, 0, 0, 48);
  const pimple = canvasTex(256, 256, (c) => { c.fillStyle = '#d7262e'; c.fillRect(0, 0, 256, 256); c.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { c.beginPath(); c.arc(x * 16 + 8 + (y % 2) * 4, y * 16 + 8, 4, 0, 7); c.fill(); } });
  const paddle = new THREE.Group(); paddle.position.set(-0.3, 0.25, 0); paddle.rotation.z = 0.25; g.add(paddle);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 48), [new THREE.MeshStandardMaterial({ color: 0xd7262e, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: pimple, roughness: 0.7 }), std(0x22252b)]);
  face.rotation.x = Math.PI / 2; face.position.set(0, 2.85, 0.04); paddle.add(face);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.1, 48), wood(0xe0c08a)); blade.rotation.x = Math.PI / 2; blade.position.set(0, 2.85, -0.07); paddle.add(blade);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.06, 48), std(0x22252b, { roughness: 0.7 })); back.rotation.x = Math.PI / 2; back.position.set(0, 2.85, -0.15); paddle.add(back);
  // 손잡이: 층층 나무색 (밝은·진한 번갈아)
  for (let i = 0; i < 5; i++) box(paddle, 0.46, 1.4, 0.06, wood(i % 2 ? 0x8a5a32 : 0xd9b07a), 0, 0.95, -0.12 + i * 0.06, 0.02);
  box(paddle, 0.5, 0.12, 0.34, MAT.gold, 0, 1.68, 0, 0.02);
  paddle.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // 공 (흰 공 + 주황 이음매)
  const ball = sphere(g, 0.5, std(0xffffff, { roughness: 0.3 }), 1.15, 4.25, 0.25, 24);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 32), std(0xff8a3d)); seam.position.copy(ball.position); seam.rotation.set(0.6, 0.4, 0); g.add(seam);
  // 앞 글자 판 + 바닥 조명 2개 (탁구채를 비춤)
  box(g, 2.8, 0.55, 0.12, std(0xfffaf0), 0, 0.55, 1.65, 0.04);
  plate(g, ['📸 준비하시고, 스매시!'], 2.6, 0.45, 0, 0.55, 1.72, { bg: '#fffaf0', color: '#d7262e', font: FONT(60), px: 640 });
  const bulb = glow(new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe2a0 }), 0.3, 2.4);
  for (const sx of [-1, 1]) { cyl(g, 0.14, 0.18, 0.22, MAT.dark, sx * 1.2, 0.36, 1.2, 12); const h = cyl(g, 0.12, 0.12, 0.06, bulb, sx * 1.2, 0.5, 1.15, 12); h.rotation.x = -0.6; }
  return g;
}

// ── 푸드트럭 (11/28 새 모습 — 참고 그림 docs/dev/ref/foodtruck.jpg): 빨강·크림 작은 트럭 + 짐칸 나무 틀 포장마차
// +z = 판매창 쪽(광장을 봄), +x = 운전석. 흰 평지붕 · 판매창(앞으로 나온 나무 계산대 · 천 가림막 '간식' · 종이 등 2개 — 밤에 켜짐)
// 판매창 양옆 기둥 칠판 = 메뉴판(☕🥤 / 🐟🌭 그림, 사용자 확정) · 뒤쪽 나무 차양 + 가림막 + 작은 계산대 · 둥근 탁자 + 의자 2개(앉기)
// opts.menu = false: 칠판 메뉴판 빼기
export function foodTruck(anim, { menu = true } = {}) {
  const g = new THREE.Group();
  const red = flat(0xe23a35), cream = flat(0xf6ecd6), wd = flat(0xd49b5d), wdD = flat(0xa36d3c), roofW = flat(0xf8f4ea), blk = flat(0x2b2a2e), gray = flat(0xb9b5ae), cloth = flat(0xf3eee2);
  const X0 = -2.25, X1 = 1.0, Z = 1.0, YF = 0.78, YC = 1.22, YT = 2.85; // 짐칸: 뒤·앞 x, 반 폭, 바닥·계산대·지붕 높이
  const L = X1 - X0, cx = (X0 + X1) / 2, OL = -1.15, OR = 0.62; // 판매창 왼쪽·오른쪽 끝
  // 바닥 틀 · 아랫단 빨강 · 위 크림 덩어리(판매창 자리만 비움)
  box(g, 4.7, 0.24, 1.5, blk, 0.25, 0.6, 0); // 차대
  box(g, L, YC - YF, 2 * Z, red, cx, (YF + YC) / 2, 0);
  const UP = YT - YC, yU = (YC + YT) / 2;
  box(g, L, UP, Z - 0.1, cream, cx, yU, (-Z - 0.1) / 2); // 뒤 절반
  box(g, OL - X0, UP, Z + 0.1, cream, (X0 + OL) / 2, yU, (Z - 0.1) / 2);
  box(g, X1 - OR, UP, Z + 0.1, cream, (OR + X1) / 2, yU, (Z - 0.1) / 2);
  // 판매창 안: 불 켜진 뒷벽 · 바닥 · 냄비·컵
  box(g, OR - OL, UP, 0.03, litM(0xfff0d2, 0.3, 1.1), (OL + OR) / 2, yU, -0.085);
  box(g, OR - OL, 0.04, Z + 0.1, flat(0x7a4a2c), (OL + OR) / 2, YC + 0.02, (Z - 0.1) / 2);
  cyl(g, 0.2, 0.18, 0.22, MAT.alu, -0.6, YC + 0.15, 0.2, 10);
  for (let i = 0; i < 3; i++) cyl(g, 0.06, 0.05, 0.16, flat([0xf7f4ee, 0xf2c94a, 0xf7f4ee][i]), 0.05 + i * 0.16, YC + 0.1, 0.35, 8);
  // 나무 기둥·들보 (판매창 쪽 + 네 모서리)
  const post = (x, z) => box(g, 0.12, YT - YF, 0.12, wd, x, (YF + YT) / 2, z);
  for (const x of [X0 + 0.06, OL - 0.45, OL, OR, X1 - 0.06]) post(x, Z + 0.01);
  for (const x of [X0 + 0.06, X1 - 0.06]) post(x, -Z - 0.01);
  for (const z of [Z + 0.02, -Z - 0.02]) { box(g, L, 0.1, 0.1, wd, cx, YT - 0.05, z); box(g, L, 0.08, 0.08, wd, cx, YC, z); }
  for (const z of [-Z + 0.06, Z - 0.06]) box(g, 0.1, 0.1, 0.1, wd, X0 - 0.01, YT - 0.05, z);
  box(g, 0.08, 0.1, 2 * Z, wd, X0 - 0.01, YT - 0.05, 0);
  // 흰 평지붕
  box(g, L + 0.3, 0.26, 2 * Z + 0.3, roofW, cx - 0.05, YT + 0.13, 0, 0.02);
  // 앞으로 나온 나무 계산대 판 + 받침
  box(g, OR - OL + 0.35, 0.07, 0.55, wd, (OL + OR) / 2, YC + 0.04, Z + 0.24);
  for (const x of [OL + 0.1, OR - 0.1]) { const b = box(g, 0.05, 0.05, 0.35, wdD, x, YC - 0.12, Z + 0.14); b.rotation.x = -0.6; }
  // 천 가림막(노렌) '간식'
  const rod = cyl(g, 0.025, 0.025, OR - OL + 0.25, wdD, (OL + OR) / 2, YT - 0.22, Z + 0.1, 6); rod.rotation.z = Math.PI / 2;
  const NS = 6, sw = (OR - OL) / NS;
  for (let i = 0; i < NS; i++) {
    const x = OL + sw * (i + 0.5);
    box(g, sw - 0.03, 0.34, 0.02, cloth, x, YT - 0.4, Z + 0.12);
    cyl(g, 0.035, 0.035, 0.03, wdD, x, YT - 0.22, Z + 0.12, 6).rotation.x = Math.PI / 2;
  }
  ['간', '식'].forEach((ch, i) => plate(g, [ch], sw - 0.06, 0.26, OL + sw * (i + 2.5), YT - 0.41, Z + 0.135, { bg: null, color: '#6b4226', font: FONT(150), px: 200 }));
  // 종이 등 2개 (밤에 켜짐) — 판매창 양옆 기둥에서 팔을 내밀어 매닮
  const lanternM = litM(0xfff3dc, 0.25, 1.5);
  for (const x of [OL - 0.22, OR + 0.22]) {
    box(g, 0.04, 0.04, 0.32, blk, x, YT - 0.2, Z + 0.17);
    box(g, 0.02, 0.12, 0.02, blk, x, YT - 0.27, Z + 0.32);
    cyl(g, 0.1, 0.1, 0.05, blk, x, YT - 0.35, Z + 0.32, 8);
    cyl(g, 0.14, 0.14, 0.38, lanternM, x, YT - 0.57, Z + 0.32, 8);
    cyl(g, 0.1, 0.1, 0.05, blk, x, YT - 0.78, Z + 0.32, 8);
  }
  // 기둥 칠판 메뉴판 (음식 그림 2개씩)
  if (menu) {
    const chalk = (ids) => canvasTex(160, 240, (c) => {
      c.fillStyle = '#2f3a33'; c.fillRect(0, 0, 160, 240);
      ids.forEach((id, i) => { drawFood(c, id, 56, 62 + i * 112, 70); c.fillStyle = '#fffbe8'; for (let k = 0; k < 2; k++) c.fillRect(100, 44 + i * 112 + k * 22, 44 - k * 12, 6); });
    });
    [[OL - 0.22, ['coffee', 'ade']], [OR + 0.22, ['bungeo', 'hotdog']]].forEach(([x, ids]) => {
      box(g, 0.34, 0.5, 0.04, wdD, x, YC + 0.42, Z + 0.07);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.44), new THREE.MeshBasicMaterial({ map: chalk(ids) })); m.position.set(x, YC + 0.42, Z + 0.095); g.add(m);
    });
  }
  // 뒤쪽 작은 포장마차: 나무 판자 아랫단 · 계산대 · 불 켜진 안쪽 · 가림막 · 기운 나무 차양
  box(g, 0.05, YC - YF, 2 * Z - 0.1, wd, X0 - 0.03, (YF + YC) / 2, 0);
  for (let i = 1; i < 6; i++) box(g, 0.02, YC - YF, 0.03, wdD, X0 - 0.06, (YF + YC) / 2, -Z + (i * 2 * Z) / 6);
  box(g, 0.4, 0.06, 2 * Z - 0.1, wd, X0 - 0.2, YC + 0.03, 0);
  box(g, 0.02, UP - 0.25, 2 * Z - 0.35, litM(0xfff0d2, 0.3, 1.1), X0 - 0.01, yU - 0.1, 0);
  for (let i = 0; i < 5; i++) box(g, 0.02, 0.38, 0.3, cloth, X0 - 0.06, YT - 0.36, -0.72 + i * 0.36);
  const aw = new THREE.Group(); aw.position.set(X0 - 0.02, YT + 0.05, 0); aw.rotation.z = 0.3; g.add(aw);
  box(aw, 0.7, 0.06, 2 * Z + 0.3, wd, -0.35, 0, 0);
  for (let i = 0; i < 7; i++) box(aw, 0.71, 0.02, 0.02, wdD, -0.35, 0.035, -Z - 0.1 + (i * (2 * Z + 0.2)) / 6);
  for (const z of [-Z, Z]) { const s = box(g, 0.04, 0.04, 0.5, wdD, X0 - 0.25, YT - 0.12, z * 0.9); s.rotation.set(0, Math.PI / 2, -0.7); }
  // 뒤 범퍼 · 후미등 · 번호판
  box(g, 0.22, 0.24, 2 * Z + 0.1, blk, X0 - 0.12, 0.52, 0);
  for (const s of [-1, 1]) { box(g, 0.04, 0.12, 0.1, flat(0xf0a020), X0 - 0.03, 0.88, s * 0.85); box(g, 0.04, 0.12, 0.12, flat(0xd62c2c), X0 - 0.03, 0.88, s * 0.72); box(g, 0.04, 0.12, 0.06, MAT.white, X0 - 0.03, 0.88, s * 0.61); }
  box(g, 0.03, 0.18, 0.42, MAT.white, X0 - 0.24, 0.5, 0);
  // 회색 통 (판매창 아래)
  box(g, 1.3, 0.32, 0.36, gray, -0.15, 0.55, 0.72, 0.05);
  for (const x of [-0.65, 0.35]) box(g, 0.06, 0.34, 0.38, flat(0x9a968f), x, 0.55, 0.72);
  // 운전석: 빨간 아래 · 크림 위 · 기운 앞유리 · 창 · 문 손잡이 · 거울 · 전조등 · 앞 범퍼
  const glass = std(0x2f4a66, { roughness: 0.1, metalness: 0.3 });
  box(g, 1.75, 0.95, 2 * Z, red, 1.875, 0.95, 0, 0.05);
  box(g, 1.3, 0.95, 2 * Z, cream, 1.65, 1.88, 0);
  const sh = new THREE.Shape(); sh.moveTo(2.3, 1.405); sh.lineTo(2.68, 1.405); sh.lineTo(2.3, 2.355); sh.closePath();
  const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2 * Z, bevelEnabled: false }), cream); wedge.position.z = -Z; wedge.castShadow = true; g.add(wedge);
  box(g, 1.42, 0.1, 2 * Z + 0.04, red, 1.62, 2.38, 0);
  const ws = box(g, 0.05, 1.0, 2 * Z - 0.25, glass, 2.5, 1.88, 0); ws.rotation.z = 0.38;
  for (const s of [-1, 1]) {
    box(g, 0.8, 0.6, 0.03, glass, 1.75, 1.92, s * (Z + 0.005));
    box(g, 0.18, 0.05, 0.04, blk, 1.3, 1.3, s * (Z + 0.02));
    box(g, 0.04, 0.04, 0.22, blk, 2.32, 1.72, s * (Z + 0.11)); box(g, 0.06, 0.3, 0.12, blk, 2.32, 1.72, s * (Z + 0.24));
    box(g, 0.04, 0.12, 0.2, glow(new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0 }), 0.3, 2), 2.77, 1.05, s * 0.72);
  }
  box(g, 0.16, 0.24, 2 * Z + 0.1, blk, 2.8, 0.58, 0);
  // 바퀴 (낮은 폴리곤) + 뒷바퀴 나무 흙받이
  for (const [x, z] of [[-1.35, Z - 0.1], [-1.35, -Z + 0.1], [1.95, Z - 0.1], [1.95, -Z + 0.1]]) {
    const w = cyl(g, 0.42, 0.42, 0.3, blk, x, 0.42, z, 10); w.rotation.x = Math.PI / 2;
    const hub = cyl(g, 0.22, 0.22, 0.32, flat(0xd9d6d0), x, 0.42, z, 8); hub.rotation.x = Math.PI / 2;
  }
  for (const s of [-1, 1]) box(g, 1.05, 0.08, 0.36, wdD, -1.35, 0.9, s * (Z - 0.1));
  // 둥근 탁자 + 의자 2개 (앉기)
  const tz = 2.6, white = std(0xfaf8f2, { roughness: 0.5 });
  cyl(g, 0.5, 0.5, 0.05, white, -0.5, 0.75, tz, 24); cyl(g, 0.04, 0.04, 0.72, MAT.dark, -0.5, 0.38, tz, 8); cyl(g, 0.25, 0.25, 0.03, MAT.dark, -0.5, 0.02, tz, 16);
  for (const sx of [-1, 1]) { cyl(g, 0.2, 0.2, 0.05, std(0xd7262e), -0.5 + sx * 0.85, 0.48, tz, 16); cyl(g, 0.03, 0.03, 0.46, MAT.dark, -0.5 + sx * 0.85, 0.24, tz, 6); }
  return g;
}
// ── 자판기 (11/28 새 모습 — 참고 그림 docs/dev/ref/vending.jpg): 빨강·흰 1대 + 옆 분리수거함 2개 (사용자 확정)
// 빨간 몸통(옆면 가운데 회색 띠, 앞면 흰 물결 판) · 진열창 2단(캔·병, 칸마다 가격 표·버튼) · '시원한'·'따뜻한' 판 · 돈 넣는 곳 · 큰 꺼내는 곳 · 짧은 다리
export const VEND_OUT = [-0.12, 0.43]; // 캔이 떨어지는 곳 (안쪽 x, 높이) — 물건 상호작용 ②에서 씀
export function vending() {
  const g = new THREE.Group();
  const W = 1.15, H = 1.95, D = 0.85, Y0 = 0.08, FZ = D / 2;
  const red = flat(0xe8302f), blk = flat(0x2b2a2e), wht = flat(0xf7f4ee);
  const frontT = canvasTex(256, 434, (c, w, h) => {
    c.fillStyle = '#e8302f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f7f4ee'; c.beginPath(); c.moveTo(14, 14); c.lineTo(198, 14); c.lineTo(198, 120);
    c.bezierCurveTo(198, 210, 168, 250, 178, 330); c.lineTo(178, 352); c.bezierCurveTo(120, 372, 80, 396, 54, 420); c.lineTo(14, 420); c.closePath(); c.fill();
  });
  const sideT = canvasTex(128, 256, (c, w, h) => { c.fillStyle = '#e8302f'; c.fillRect(0, 0, w, h); c.fillStyle = '#d9d7e0'; c.fillRect(0, h * 0.33, w, h * 0.28); });
  const sideM = new THREE.MeshStandardMaterial({ map: sideT, roughness: 0.5 }), sideM2 = new THREE.MeshStandardMaterial({ map: sideT, roughness: 0.5, color: 0xdddddd });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [sideM, sideM2, red, red, new THREE.MeshStandardMaterial({ map: frontT, roughness: 0.5 }), red]);
  body.position.set(0, Y0 + H / 2, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) for (const z of [-FZ + 0.08, FZ - 0.08]) box(g, 0.1, Y0, 0.1, blk, x, Y0 / 2, z);
  // 진열창: 불 켜진 안쪽 + 선반 2단 + 가격 표·버튼 + 유리
  const dx = -0.12, dy = Y0 + 1.45;
  box(g, 0.8, 0.84, 0.02, litM(0xc9e5f6, 0.35, 1.1), dx, dy, FZ + 0.01);
  for (const s of [-1, 1]) box(g, 0.04, 0.86, 0.2, wht, dx + s * 0.42, dy, FZ + 0.1);
  box(g, 0.88, 0.04, 0.2, wht, dx, dy + 0.44, FZ + 0.1);
  const COLS = [0x4caf50, 0x4caf50, 0xf2d33a, 0x9fd6f2, 0xf08a2a, 0x7cb342, 0xc62f45, 0xf2b631, 0xd23a3a, 0x3550b8, 0x8bc34a, 0x9ccc65];
  [dy - 0.36, dy + 0.02].forEach((sy, row) => {
    box(g, 0.8, 0.04, 0.2, wht, dx, sy, FZ + 0.1);
    for (let i = 0; i < 6; i++) {
      const x = dx - 0.33 + i * 0.132, col = COLS[(1 - row) * 6 + i];
      box(g, 0.09, 0.035, 0.02, flat(row ? 0x2f5fc8 : 0xd62c2c), x, sy - 0.04, FZ + 0.205);
      box(g, 0.06, 0.03, 0.03, blk, x, sy - 0.085, FZ + 0.2);
      const bottle = row === 1 && i >= 2, y = sy + 0.02;
      if (bottle) {
        cyl(g, 0.045, 0.045, 0.2, flat(col), x, y + 0.1, FZ + 0.1, 8);
        cyl(g, 0.047, 0.047, 0.06, flat(0xf7f4ee), x, y + 0.09, FZ + 0.1, 8);
        cyl(g, 0.02, 0.045, 0.06, flat(col), x, y + 0.23, FZ + 0.1, 8);
        cyl(g, 0.022, 0.022, 0.035, flat(i % 2 ? 0x2f5fc8 : 0xf7f4ee), x, y + 0.275, FZ + 0.1, 8);
      } else {
        cyl(g, 0.045, 0.045, 0.16, flat(col), x, y + 0.08, FZ + 0.1, 8);
        cyl(g, 0.047, 0.047, 0.05, flat(0xf3e37a), x, y + 0.08, FZ + 0.1, 8);
        cyl(g, 0.042, 0.045, 0.015, MAT.alu, x, y + 0.165, FZ + 0.1, 8);
      }
    }
  });
  box(g, 0.82, 0.84, 0.02, MAT.glass, dx, dy, FZ + 0.21);
  // '시원한'·'따뜻한' 판 + 버튼
  const lab = canvasTex(256, 128, (c) => {
    c.fillStyle = '#2f5fc8'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#e23a3a'; c.fillRect(128, 0, 128, 128);
    c.fillStyle = '#fff'; c.font = FONT(40); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('시원한', 64, 64); c.fillText('따뜻한', 192, 64);
  });
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: lab })); lm.position.set(-0.25, Y0 + 0.82, FZ + 0.004); g.add(lm);
  box(g, 0.11, 0.11, 0.03, blk, 0.1, Y0 + 0.75, FZ + 0.01);
  // 돈 넣는 곳: 화면(초록 불) · 동전 구멍(주황 손잡이) · 지폐 · 오른쪽 흰 판
  box(g, 0.2, 0.08, 0.03, blk, 0.3, Y0 + 0.98, FZ + 0.01);
  box(g, 0.04, 0.03, 0.01, glow(new THREE.MeshStandardMaterial({ color: 0x5cff7a, emissive: 0x5cff7a }), 0.8, 1.5), 0.36, Y0 + 0.98, FZ + 0.03);
  box(g, 0.13, 0.15, 0.04, flat(0x4a4a50), 0.36, Y0 + 0.83, FZ + 0.02, 0.02);
  box(g, 0.06, 0.025, 0.02, flat(0xf0a020), 0.34, Y0 + 0.84, FZ + 0.05);
  box(g, 0.11, 0.12, 0.03, flat(0x4a4a50), 0.18, Y0 + 0.92, FZ + 0.01);
  box(g, 0.12, 0.36, 0.06, wht, 0.5, Y0 + 1.1, FZ + 0.02, 0.02);
  box(g, 0.08, 0.06, 0.03, flat(0xbdbab4), 0.5, Y0 + 1.0, FZ + 0.05);
  // 꺼내는 곳 (캔이 '덜컹' 떨어지는 곳) · 아래 주황 네모
  box(g, 0.74, 0.25, 0.05, flat(0x5a5a62), VEND_OUT[0], VEND_OUT[1] - 0.05, FZ + 0.015);
  const flap = box(g, 0.68, 0.16, 0.03, flat(0x3a3a40), VEND_OUT[0], VEND_OUT[1] - 0.06, FZ + 0.045); flap.rotation.x = 0.15;
  box(g, 0.08, 0.1, 0.03, flat(0xf0a020), 0.42, Y0 + 0.2, FZ + 0.01);
  // 분리수거함 (캔·병)
  for (let i = 0; i < 2; i++) { const x = 1.0 + i * 0.52; cyl(g, 0.24, 0.22, 0.85, std([0x7ad35a, 0x3fb6ff][i]), x, 0.43, 0.05, 16); cyl(g, 0.25, 0.25, 0.06, MAT.white, x, 0.88, 0.05, 16); cyl(g, 0.08, 0.08, 0.07, MAT.dark, x, 0.9, 0.05, 12); }
  return g;
}

// ── 바다 전망대: 나무 판 바닥 + 유리 난간(알루미늄 손잡이) + 동전 망원경 2개 + 벤치 자리 + 안내 판 + 가로등 자리
export const DECK_TELE_Z = (D) => D / 2 - 0.9; // 망원경 자리 (바다 쪽 난간 앞)
export function deck(D = 4.5) {
  const g = new THREE.Group();
  const W = 14;
  box(g, W, 0.25, D, new THREE.MeshStandardMaterial({ map: withRepeat(plankTex(), W / 3, D / 3), roughness: 0.8 }), 0, 0.125, 0);
  box(g, W + 0.1, 0.1, D + 0.1, wood(0x6b4224), 0, 0.02, 0);
  // 유리 난간 (바다 쪽 +z, 양옆)
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfeef2, transparent: true, opacity: 0.25, roughness: 0.03, metalness: 0.3, depthWrite: false });
  const rail = (len, x, z, rot) => {
    const r = new THREE.Group(); r.position.set(x, 0, z); r.rotation.y = rot; g.add(r);
    box(r, len, 0.95, 0.03, glass, 0, 0.75, 0);
    box(r, len + 0.06, 0.07, 0.1, MAT.alu, 0, 1.27, 0, 0.03);
    for (let i = 0; i <= Math.round(len / 1.4); i++) box(r, 0.06, 1.05, 0.06, MAT.alu, -len / 2 + (i * len) / Math.round(len / 1.4), 0.75, 0);
  };
  rail(W, 0, D / 2, 0); rail(D, -W / 2, 0, Math.PI / 2); rail(D, W / 2, 0, Math.PI / 2);
  // 동전 망원경 (기둥 + 머리 + 눈 대는 곳 2개)
  const tz = DECK_TELE_Z(D);
  for (const x of [-3, 3]) {
    cyl(g, 0.12, 0.2, 0.15, MAT.dark, x, 0.32, tz, 16);
    cyl(g, 0.07, 0.07, 1.0, std(0x3a3f4a), x, 0.8, tz, 10);
    const head = new THREE.Group(); head.position.set(x, 1.4, tz); head.rotation.x = -0.2; g.add(head);
    box(head, 0.5, 0.32, 0.55, std(0x2f7fd8, { roughness: 0.35 }), 0, 0, 0, 0.1);
    for (const sx of [-0.11, 0.11]) { const e = cyl(head, 0.07, 0.08, 0.15, MAT.dark, sx, 0.02, -0.33, 12); e.rotation.x = Math.PI / 2; }
    const lens = cyl(head, 0.13, 0.11, 0.1, MAT.alu, 0, 0, 0.32, 16); lens.rotation.x = Math.PI / 2;
  }
  // 안내 판 + 데크 위 벤치 자리 (무료 모델 벤치)
  // 안내 판: 데크 입구(광장 쪽 −z)에서 광장을 보고 섬
  const sg = new THREE.Group(); sg.position.set(0, 0, -D / 2 + 0.3); sg.rotation.y = Math.PI; g.add(sg);
  box(sg, 1.6, 0.9, 0.08, wood(0x6b4224), 0, 1.15, 0, 0.03);
  plate(sg, ['🌊 바다 전망대'], 1.45, 0.42, 0, 1.3, 0.05, { bg: '#e8f6fb', color: '#1f5f8a', font: FONT(62), px: 440 });
  plate(sg, ['날이 맑으면 수평선이 보여요'], 1.45, 0.24, 0, 0.93, 0.05, { bg: '#e8f6fb', color: '#1f5f8a', font: FONT(34), px: 440 });
  for (const x of [-0.6, 0.6]) cyl(sg, 0.04, 0.04, 0.75, MAT.alu, x, 0.5, 0, 6);
  for (const x of [-5.2, 5.2]) { const b = propSpot(g, 'bench', x, 0.25, 0.4, 1, 0.5); b.rotation.y = Math.PI; b.userData.extra = false; }
  return g;
}

