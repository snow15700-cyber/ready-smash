// 광장 새 디자인 시안: 나머지 건물·조형물 다듬기 (plaza.md 20장)
// 분수 · 시계탑 · 게시판 · 김제빵 빵집 · 포토존 · 푸드트럭 · 자판기 · 바다 전망대
// 각 물건은 그룹의 +z가 앞. 밤에 켜지는 재질은 userData.glow = [낮, 밤]. 움직이는 것은 anim에 (t초) => {} 를 넣음
import * as THREE from 'three';
import { canvasTex, clockTex, std } from './arena-kit.js';
import { box, cyl, FONT, glow, lathe, MAT, plate, propSpot, sphere, tileTex, withRepeat } from './campusShops.js';

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

// ── 분수: 짙은 돌 받침 + 둥근 입술 물받이(모자이크 바닥) + 꽃병 모양 기둥 + 접시 + 떨어지는 물 커튼 + 바깥에서 안으로 쏘는 물줄기 8개(물보라) + 통통 탁구공
export function fountain(anim) {
  const g = new THREE.Group();
  const stone = std(0xe4dfd3, { roughness: 0.55 });
  // 바닥 둘레 원형 포장 (짙은 회색 돌 + 흰 줄)
  const ringTex = canvasTex(512, 512, (c) => {
    c.fillStyle = '#8f949a'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
    for (let r = 0; r < 4; r++) { c.beginPath(); c.arc(256, 256, 160 + r * 24, 0, 7); c.stroke(); }
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; c.beginPath(); c.moveTo(256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160); c.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256); c.stroke(); }
  });
  const pave = new THREE.Mesh(new THREE.CircleGeometry(5.2, 64), new THREE.MeshLambertMaterial({ map: ringTex }));
  pave.rotation.x = -Math.PI / 2; pave.position.y = 0.012; pave.receiveShadow = true; g.add(pave);
  // 물받이: 돌림판으로 둥근 입술 (바깥 벽 → 입술 → 안쪽 벽 → 바닥)
  lathe(g, [[3.45, 0], [3.5, 0.1], [3.42, 0.5], [3.55, 0.56], [3.55, 0.66], [3.3, 0.72], [3.12, 0.66], [3.1, 0.15], [0, 0.15]], stone, 0, 0, 0, 64);
  // 물속 모자이크 바닥 (파란 타일)
  const mosaic = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), new THREE.MeshStandardMaterial({ map: withRepeat(tileTex('#2f7fb8', 'rgba(255,255,255,.35)', 12, 40), 4, 4), roughness: 0.4 }));
  mosaic.rotation.x = -Math.PI / 2; mosaic.position.y = 0.16; g.add(mosaic);
  // 물 (반쯤 비치는 물결 무늬, 흘러가듯 움직임)
  const ripple = canvasTex(256, 256, (c) => {
    c.fillStyle = '#5fb8e8'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = (i * 53) % 256, y = (i * 97) % 256; c.beginPath(); c.ellipse(x, y, 18 + (i % 4) * 6, 6, (i % 7) * 0.4, 0, Math.PI * 1.3); c.stroke(); }
  });
  ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping; ripple.repeat.set(3, 3);
  const water = new THREE.MeshStandardMaterial({ map: ripple, transparent: true, opacity: 0.72, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const w1 = new THREE.Mesh(new THREE.CircleGeometry(3.11, 64), water); w1.rotation.x = -Math.PI / 2; w1.position.y = 0.5; g.add(w1);
  // 가운데: 꽃병 모양 기둥 → 큰 접시 → 작은 기둥 → 작은 접시
  lathe(g, [[0, 0], [0.75, 0], [0.75, 0.15], [0.45, 0.3], [0.35, 0.7], [0.42, 1.0], [0.3, 1.25], [0.32, 1.4], [0, 1.4]], stone, 0, 0.15, 0, 32);
  lathe(g, [[0, 0], [0.4, 0], [1.2, 0.18], [1.55, 0.32], [1.6, 0.42], [1.48, 0.42], [1.2, 0.3], [0, 0.26]], stone, 0, 1.5, 0, 48);
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), water); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.86; g.add(w2);
  lathe(g, [[0, 0], [0.22, 0], [0.16, 0.3], [0.2, 0.55], [0, 0.55]], stone, 0, 1.8, 0, 24);
  lathe(g, [[0, 0], [0.15, 0], [0.55, 0.12], [0.62, 0.2], [0.52, 0.2], [0, 0.15]], stone, 0, 2.3, 0, 32);
  // 큰 접시 가장자리에서 떨어지는 물 커튼 (위가 좁고 아래가 넓은 원통, 줄무늬가 아래로 흐름)
  const fall = canvasTex(256, 64, (c) => { c.clearRect(0, 0, 256, 64); for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(230,248,255,${0.25 + (i % 3) * 0.15})`; c.fillRect((i * 37) % 256, 0, 2 + (i % 3), 64); } });
  fall.wrapS = fall.wrapT = THREE.RepeatWrapping; fall.repeat.set(6, 2);
  const fallM = new THREE.MeshStandardMaterial({ map: fall, transparent: true, opacity: 0.75, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.85, 1.4, 48, 1, true), fallM); curtain.position.y = 1.2; g.add(curtain);
  // 바깥 입술에서 안쪽으로 쏘는 물줄기 8개 (휘어진 관) + 떨어지는 곳 물보라 고리
  const jetM = new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false });
  const splashes = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(c * 3.25, 0.72, s * 3.25), new THREE.Vector3(c * 2.6, 1.9, s * 2.6), new THREE.Vector3(c * 2.0, 0.5, s * 2.0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.035, 6), jetM));
    cyl(g, 0.06, 0.08, 0.1, MAT.alu, c * 3.3, 0.72, s * 3.3, 8);
    const sp = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), jetM); sp.rotation.x = Math.PI / 2; sp.position.set(c * 2.0, 0.52, s * 2.0); g.add(sp); splashes.push(sp);
  }
  // 가운데 물기둥 + 통통 탁구공
  const jet = cyl(g, 0.05, 0.1, 0.8, jetM, 0, 2.85, 0, 10); jet.castShadow = false;
  const ball = sphere(g, 0.22, std(0xff8a3d, { roughness: 0.35 }), 0, 3.3, 0, 20);
  // 둘레 바닥 조명 기둥 (사진 1, 밤에 켜짐)
  const lampM = glow(new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffe2a0 }), 0.2, 2.2);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; cyl(g, 0.07, 0.07, 0.45, MAT.alu, Math.cos(a) * 4.6, 0.22, Math.sin(a) * 4.6, 10); cyl(g, 0.075, 0.075, 0.08, lampM, Math.cos(a) * 4.6, 0.48, Math.sin(a) * 4.6, 10); }
  anim.push((t) => {
    const p = (t * 1.4) % 1; ball.position.y = 3.25 + Math.sin(p * Math.PI) * 0.45; ball.rotation.x = t * 2;
    ripple.offset.set(t * 0.02, t * 0.013); fall.offset.y = -t * 0.9;
    splashes.forEach((sp, i) => { const k = (t * 1.5 + i * 0.13) % 1; sp.scale.setScalar(0.6 + k * 1.2); sp.material.opacity = 0.55; });
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

// ── 김제빵 빵집: 벽돌 아랫단 + 크림색 회벽에 나무 들보(반목조) + 기와 지붕(박공) + 벽돌 굴뚝(연기) + 빵 진열 돌출창 + 매달린 바게트 간판 + 차양 + 문 앞 빵 진열대·칠판 + 꽃 화분 + 지붕 위 큰 바게트
export function bakery(anim) {
  const g = new THREE.Group();
  const W = 5.4, D = 4.4, H = 3.2, FZ = D / 2;
  box(g, W + 0.3, 0.3, D + 0.3, MAT.granite, 0, 0.15, 0, 0.04);
  const brick = new THREE.MeshStandardMaterial({ map: withRepeat(brickTex(), W / 2.5, 0.4), roughness: 0.8 });
  box(g, W, 0.9, D, brick, 0, 0.3 + 0.45, 0);
  const plaster = std(0xf6e8cf, { roughness: 0.9 });
  box(g, W - 0.04, H - 0.9, D - 0.04, plaster, 0, 1.2 + (H - 0.9) / 2, 0);
  // 반목조 들보 (앞면): 세로·가로·대각
  const beam = wood(0x6b4224);
  for (const x of [-W / 2 + 0.1, -0.6, 0.6, W / 2 - 0.1]) box(g, 0.14, H - 0.9, 0.1, beam, x, 1.2 + (H - 0.9) / 2, FZ + 0.03);
  box(g, W, 0.14, 0.1, beam, 0, 1.25, FZ + 0.03); box(g, W, 0.14, 0.1, beam, 0, 0.3 + H - 0.05, FZ + 0.03);
  for (const [x, s] of [[-2.0, 1], [2.0, -1]]) { const d = box(g, 0.12, 1.6, 0.08, beam, x, 2.45, FZ + 0.04); d.rotation.z = s * 0.6; }
  // 박공 지붕 (세모 기둥 + 기와 판 2장)
  const tri = new THREE.Shape(); tri.moveTo(-W / 2 - 0.05, 0); tri.lineTo(W / 2 + 0.05, 0); tri.lineTo(0, 1.6); tri.closePath();
  const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: D, bevelEnabled: false }), plaster);
  gable.position.set(0, 0.3 + H, -FZ); gable.castShadow = true; g.add(gable);
  const roofM = new THREE.MeshStandardMaterial({ map: withRepeat(shingleTex(), 3, 2), roughness: 0.8 });
  const slope = Math.atan2(1.6, W / 2), len = Math.hypot(1.6, W / 2) + 0.35;
  for (const sx of [-1, 1]) { const r = box(g, len, 0.12, D + 0.5, roofM, sx * (W / 4 + 0.08), 0.3 + H + 0.85, 0); r.rotation.z = -sx * slope; }
  box(g, 0.2, 0.2, D + 0.55, wood(0x5a3418), 0, 0.3 + H + 1.68, 0);
  // 박공 앞면 둥근 창
  const ringW = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 24), beam); ringW.position.set(0, 0.3 + H + 0.6, FZ + 0.02); g.add(ringW);
  const rw = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), glow(new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xffd890 }), 0.25, 1.4)); rw.position.set(0, 0.3 + H + 0.6, FZ + 0.01); g.add(rw);
  // 벽돌 굴뚝 + 연기
  box(g, 0.6, 1.8, 0.6, brick, 1.5, 0.3 + H + 1.3, -0.9, 0.02);
  box(g, 0.75, 0.15, 0.75, MAT.granite, 1.5, 0.3 + H + 2.25, -0.9);
  const smokeM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.6, roughness: 1, depthWrite: false });
  const puffs = [0, 1, 2, 3].map(() => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), smokeM.clone()); g.add(s); return s; });
  anim.push((t) => puffs.forEach((s, i) => { const k = (t * 0.25 + i / 4) % 1; s.position.set(1.5 + k * 0.6, 0.3 + H + 2.5 + k * 2.2, -0.9 - k * 0.3); s.scale.setScalar(0.6 + k * 1.4); s.material.opacity = 0.6 * (1 - k); }));
  // 문 (위가 둥근 나무 문 + 작은 창) + 발판
  const dX = -1.45;
  box(g, 1.2, 2.1, 0.1, wood(0x7a4a26), dX, 0.3 + 1.05, FZ + 0.06);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 24, 1, false, -Math.PI / 2, Math.PI), wood(0x7a4a26)); arch.rotation.x = Math.PI / 2; arch.position.set(dX, 2.4, FZ + 0.06); g.add(arch);
  box(g, 0.5, 0.5, 0.04, glow(new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xffd890 }), 0.3, 1.4), dX, 1.9, FZ + 0.12);
  sphere(g, 0.05, MAT.gold, dX + 0.4, 1.3, FZ + 0.14, 8);
  box(g, 1.4, 0.03, 0.6, std(0x5a4636), dX, 0.315, FZ + 0.45);
  // 돌출 진열창 (빵이 가득)
  const bx = 0.95, bw = 2.6;
  box(g, bw + 0.2, 0.35, 0.8, wood(0x6b4224), bx, 1.1, FZ + 0.35, 0.03);
  const inM = glow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2a8 }), 0.35, 1.2);
  box(g, bw, 1.3, 0.04, inM, bx, 1.95, FZ + 0.03);
  for (const sx of [-1, 1]) box(g, 0.1, 1.45, 0.75, wood(0x6b4224), bx + sx * (bw / 2 + 0.05), 1.95, FZ + 0.35);
  box(g, bw + 0.2, 0.12, 0.8, wood(0x6b4224), bx, 2.66, FZ + 0.35);
  box(g, bw, 1.3, 0.03, MAT.glass, bx, 1.95, FZ + 0.72);
  for (let i = 0; i < 5; i++) croissant(g, bx - 1.0 + i * 0.5, 1.35, FZ + 0.45, 1.1, i * 0.4);
  for (let i = 0; i < 4; i++) loaf(g, bx - 0.9 + i * 0.6, 1.36, FZ + 0.2, 1.2, [0xc98a42, 0xa86a2e, 0xe0b070, 0x8a5a2b][i]);
  box(g, bw - 0.1, 0.03, 0.4, MAT.white, bx, 1.95, FZ + 0.3);
  for (let i = 0; i < 3; i++) baguette(g, bx - 0.8 + i * 0.8, 2.05, FZ + 0.3, 0.5, 0.15);
  for (let i = 0; i < 6; i++) loaf(g, bx - 1.05 + i * 0.42, 2.03, FZ + 0.15, 0.7, 0xd9a35a);
  // 차양 (진열창 위)
  const awT = canvasTex(256, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f6e3c4' : '#a0522d'; c.fillRect(i * 32, 0, 32, 64); } });
  const aw = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.05, 0.9), [std(0xa0522d), std(0xa0522d), new THREE.MeshStandardMaterial({ map: awT }), std(0xa0522d), std(0xa0522d), std(0xa0522d)]);
  aw.position.set(bx, 2.95, FZ + 0.75); aw.rotation.x = 0.4; aw.castShadow = true; g.add(aw);
  // 매달린 간판 (벽에서 튀어나온 쇠 막대 + 나무 판 + 바게트)
  box(g, 0.05, 0.05, 1.8, MAT.dark, -W / 2 + 0.3, 3.05, FZ + 0.85);
  const sign = plate(g, ['🥖 김제빵 빵집'], 1.7, 0.55, -W / 2 + 0.3, 2.6, FZ + 0.85, { bg: '#fff3e0', color: '#6b4224', font: FONT(56), px: 440, border: '#6b4224' });
  sign.rotation.y = Math.PI / 2;
  const sign2 = sign.clone(); sign2.rotation.y = -Math.PI / 2; sign2.position.x -= 0.01; g.add(sign2);
  // 문 앞: 빵 진열대(나무 상자) + 칠판 + 꽃 화분
  const crate = wood(0xa8743f);
  box(g, 1.0, 0.6, 0.5, crate, 2.3, 0.6, FZ + 0.9, 0.02);
  for (let i = 0; i < 4; i++) baguette(g, 2.0 + i * 0.2, 0.98, FZ + 0.9, 0.45, 0.6, 0.2);
  const chalk = canvasTex(200, 260, (c) => { c.fillStyle = '#2f3a33'; c.fillRect(0, 0, 200, 260); c.strokeStyle = '#b98a5a'; c.lineWidth = 12; c.strokeRect(0, 0, 200, 260); c.fillStyle = '#fffbe8'; c.font = FONT(34); c.textAlign = 'center'; c.fillText('오늘의 빵', 100, 60); c.font = FONT(26); c.fillText('🥐 소금빵', 100, 120); c.fillText('🥖 바게트', 100, 165); c.fillText('🍞 식빵', 100, 210); });
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.04), [crate, crate, crate, crate, new THREE.MeshStandardMaterial({ map: chalk }), new THREE.MeshStandardMaterial({ map: chalk })]); b.position.set(-0.3, 0.75, FZ + 1.1 + s * 0.12); b.rotation.x = s * 0.25; b.castShadow = true; g.add(b); }
  for (const x of [-W / 2 + 0.3, -0.5]) { box(g, 0.5, 0.35, 0.35, std(0x8a5a32), x, 0.48, FZ + 0.35, 0.03); propSpot(g, 'flower', x, 0.65, FZ + 0.35, 0.8, 0.4); }
  // 지붕 위 큰 바게트 (칼집 무늬) + 크루아상
  const bg = new THREE.Group(); bg.position.set(-0.5, 0.3 + H + 2.0, 0.4); bg.rotation.z = 0.35; g.add(bg);
  const big = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 3.0, 8, 16), std(0xd9984a, { roughness: 0.6 })); big.rotation.z = Math.PI / 2; big.castShadow = true; bg.add(big);
  for (let i = 0; i < 5; i++) { const cut = box(bg, 0.12, 0.06, 0.5, std(0xf3d29a), -1.2 + i * 0.6, 0.33, 0); cut.rotation.y = 0.6; }
  croissant(g, 1.2, 0.3 + H + 2.0, 0.6, 3.2, 0.3);
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

// ── 푸드트럭: 둥근 모서리 차체(노랑·흰 줄) + 운전석 앞유리 + 들어 올린 판매창 덮개 + 계산대·메뉴판 + 바퀴(휠) + 전조등 + 꼬마전구 줄 + 지붕 간판 + 둥근 탁자·의자
export function foodTruck(anim) {
  const g = new THREE.Group();
  const yellow = std(0xffc21a, { roughness: 0.45 }), white = std(0xfaf8f2, { roughness: 0.5 });
  box(g, 3.6, 2.1, 2.0, yellow, -0.4, 1.55, 0, 0.18);
  box(g, 3.62, 0.25, 2.02, white, -0.4, 1.0, 0, 0.05);
  box(g, 1.4, 1.5, 1.9, yellow, 2.0, 1.25, 0, 0.2); // 운전석
  const wind = new THREE.MeshStandardMaterial({ color: 0x24404a, roughness: 0.05, metalness: 0.6 });
  const ws = box(g, 0.06, 0.65, 1.6, wind, 2.68, 1.6, 0); ws.rotation.z = -0.25;
  box(g, 0.9, 0.55, 0.06, wind, 2.0, 1.6, 0.96);
  for (const z of [-0.65, 0.65]) sphere(g, 0.12, glow(new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2c0 }), 0.3, 2), 2.72, 0.95, z, 12);
  box(g, 0.12, 0.25, 1.7, std(0x8a8f95, { metalness: 0.6, roughness: 0.3 }), 2.72, 0.62, 0, 0.04); // 범퍼
  for (const [x, z] of [[-1.5, 1.0], [-1.5, -1.0], [1.9, 1.0], [1.9, -1.0]]) {
    const w = cyl(g, 0.42, 0.42, 0.3, std(0x1f2226, { roughness: 0.9 }), x, 0.42, z, 20); w.rotation.x = Math.PI / 2;
    const hub = cyl(g, 0.2, 0.2, 0.32, MAT.alu, x, 0.42, z, 12); hub.rotation.x = Math.PI / 2;
  }
  // 판매창: 안쪽 불빛 + 들어 올린 덮개 + 계산대
  const inM = glow(new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2a8 }), 0.35, 1.3);
  box(g, 2.4, 0.95, 0.04, inM, -0.5, 1.85, 1.01);
  const flap = box(g, 2.6, 0.06, 0.9, yellow, -0.5, 2.45, 1.4); flap.rotation.x = -0.35;
  for (const x of [-1.7, 0.7]) { const s = box(g, 0.03, 0.03, 0.9, MAT.dark, x, 2.2, 1.35); s.rotation.x = 0.6; }
  box(g, 2.7, 0.08, 0.5, white, -0.5, 1.32, 1.2, 0.02);
  for (let i = 0; i < 3; i++) cyl(g, 0.08, 0.07, 0.22, std([0xe0333c, 0x2f6fe0, 0x7ad35a][i]), -1.2 + i * 0.25, 1.47, 1.2, 10); // 컵
  // 메뉴판 (옆면) + 지붕 간판
  // 메뉴 입간판 (트럭 뒤쪽 앞에 세움)
  for (const s of [-1, 1]) { const b = box(g, 0.75, 1.0, 0.04, std(0x2f3a33), -2.75, 0.62, 1.55 + s * 0.13); b.rotation.x = s * 0.22; }
  plate(g, ['메뉴', '🌭 핫도그', '🍢 어묵', '🥤 음료'], 0.68, 0.92, -2.75, 0.64, 1.71, { bg: '#2f3a33', color: '#fffbe8', font: FONT(40), px: 300 }).rotation.x = 0.22;
  box(g, 1.9, 0.6, 0.15, std(0xd7262e), -0.4, 2.95, 0, 0.05);
  plate(g, ['🌭 간식'], 1.7, 0.48, -0.4, 2.95, 0.08, { bg: '#d7262e', color: '#ffffff', font: FONT(80), px: 420 });
  plate(g, ['🌭 간식'], 1.7, 0.48, -0.4, 2.95, -0.08, { bg: '#d7262e', color: '#ffffff', font: FONT(80), px: 420 }).rotation.y = Math.PI;
  // 꼬마전구 줄 (덮개 끝을 따라)
  const bulb = glow(new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd86a }), 0.5, 2.2);
  for (let i = 0; i < 10; i++) sphere(g, 0.045, bulb, -1.75 + i * 0.28, 2.27 - Math.sin((i / 9) * Math.PI) * 0.08, 1.82, 8);
  // 둥근 탁자 + 의자 2개
  const tz = 2.6;
  cyl(g, 0.5, 0.5, 0.05, white, -0.5, 0.75, tz, 24); cyl(g, 0.04, 0.04, 0.72, MAT.dark, -0.5, 0.38, tz, 8); cyl(g, 0.25, 0.25, 0.03, MAT.dark, -0.5, 0.02, tz, 16);
  for (const sx of [-1, 1]) { cyl(g, 0.2, 0.2, 0.05, std(0xd7262e), -0.5 + sx * 0.85, 0.48, tz, 16); cyl(g, 0.03, 0.03, 0.46, MAT.dark, -0.5 + sx * 0.85, 0.24, tz, 6); }
  return g;
}

// ── 자판기 2대: 둥근 차체 + 불 켜진 진열창(캔 3줄) + 버튼 줄 + 동전 넣는 곳 + 꺼내는 곳 + 윗 조명판 + 옆 분리수거함
export function vending() {
  const g = new THREE.Group();
  [[0xe63946, '#ffe0e3'], [0x2a5db0, '#e0ecff']].forEach(([c, light], i) => {
    const x = i * 1.2;
    box(g, 1.08, 2.05, 0.82, std(c, { roughness: 0.4 }), x, 1.03, 0, 0.08);
    const panel = glow(new THREE.MeshStandardMaterial({ color: new THREE.Color(light), emissive: new THREE.Color(light) }), 0.35, 1.3);
    box(g, 0.72, 1.12, 0.04, panel, x - 0.1, 1.3, 0.41);
    for (let r = 0; r < 3; r++) {
      box(g, 0.7, 0.03, 0.1, MAT.alu, x - 0.1, 0.82 + r * 0.36, 0.44);
      for (let k = 0; k < 5; k++) cyl(g, 0.055, 0.055, 0.2, std([0xffd23f, 0x7ad35a, 0xff9ed2, 0xffffff, 0xff8a3d][(k + r + i) % 5], { metalness: 0.4, roughness: 0.3 }), x - 0.38 + k * 0.14, 0.95 + r * 0.36, 0.45, 10);
    }
    box(g, 0.74, 1.14, 0.02, MAT.glass, x - 0.1, 1.3, 0.47);
    for (let b = 0; b < 5; b++) box(g, 0.08, 0.06, 0.03, std(0xf2f2f2), x + 0.38, 1.7 - b * 0.14, 0.42); // 버튼
    box(g, 0.06, 0.14, 0.03, MAT.dark, x + 0.38, 0.95, 0.42); // 동전
    box(g, 0.6, 0.18, 0.06, MAT.dark, x - 0.1, 0.38, 0.42, 0.02); // 꺼내는 곳
    const head = glow(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff }), 0.3, 1.2);
    box(g, 0.9, 0.18, 0.04, head, x, 1.94, 0.41);
  });
  // 분리수거함 (캔·병)
  for (let i = 0; i < 2; i++) { cyl(g, 0.24, 0.22, 0.85, std([0x7ad35a, 0x3fb6ff][i]), 2.15 + i * 0.52, 0.43, 0.05, 16); cyl(g, 0.25, 0.25, 0.06, MAT.white, 2.15 + i * 0.52, 0.88, 0.05, 16); cyl(g, 0.08, 0.08, 0.07, MAT.dark, 2.15 + i * 0.52, 0.9, 0.05, 12); }
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

