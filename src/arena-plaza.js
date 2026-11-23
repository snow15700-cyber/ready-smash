// 광장 로비 배경 (docs/dev/plaza.md 1장): 배경 아이템과 상관없이 늘 같은 '광장' 하나.
// 북쪽(-z)에 가게 건물 3개가 나란히(상점 = 커다란 뽑기 기계, 꾸미기 = 커다란 옷장, 랭킹 = 시상대), 양옆에 탁구대 4대(사람 대결용 3대 + 김제빵), 둘레에 나무·가로등·벤치.
// 움직이지 않는 것은 bakeArena로 합쳐서 가볍게 (scene.js의 setPlaza가 합친다).
import * as THREE from 'three';
import { addBox, canvasTex, glowSprite, seeded, std, textTex } from './arena-kit.js';

// 탁구대 (② 탁구대에 서서 경기, plaza.md 2장): 긴 쪽이 x. A팀(side 0) = 서쪽(x−) 끝, B팀(side 1) = 동쪽(x+) 끝.
// 자리 4칸: 0·1 = A팀 1번·2번, 2·3 = B팀 1번·2번 (각 팀이 탁구대를 볼 때 1번이 왼쪽)
const T_HALF = [1.37, 0.7625]; // 탁구대 반 길이·반 너비 (경기 탁구대와 같은 크기)
const SEAT_X = 2.12, SEAT_Z = 0.5;
const tableAt = (n, x, z) => ({
  n, x, z,
  seats: [[x - SEAT_X, z - SEAT_Z], [x - SEAT_X, z + SEAT_Z], [x + SEAT_X, z + SEAT_Z], [x + SEAT_X, z - SEAT_Z]],
  rect: { x0: x - T_HALF[0] - 0.08, x1: x + T_HALF[0] + 0.08, z0: z - T_HALF[1] - 0.08, z1: z + T_HALF[1] + 0.08 },
});
const TABLES = [tableAt(1, -8, -0.5), tableAt(2, 8, -0.5), tableAt(3, -8, 4.5)];
const KIM = { ...tableAt(0, 8, 4.5), spot: [8 - SEAT_X, 4.5] }; // 김제빵 탁구대 (혼자 하기, ③에서 표지판·김제빵)

// 걸을 수 있는 곳 (m). 가게 건물 앞면까지
export const PLAZA = {
  minX: -13, maxX: 13, minZ: -10, maxZ: 12,
  spawn: [0, 7], // 처음 서는 곳 (북쪽 가게를 바라봄). 가게 문까지 약 12m = 걸어서 3초, 탁구대 4대가 양옆으로 다 보인다
  // 가게: 가운데 x, 앞면 z(front), 너비 w, 깊이 d, 높이 h. 문 앞 door = 도착하면 화면이 열리는 곳
  shops: [
    { id: 'shop', name: '🛒 상점', x: -5.6, h: 2.7 }, // 커다란 뽑기 기계
    { id: 'closet', name: '👕 꾸미기', x: 0, h: 4.2 }, // 커다란 옷장
    { id: 'rank', name: '🏆 랭킹', x: 5.6, h: 2.9 }, // 시상대
  ].map((s) => ({ ...s, front: -6.5, w: 4.5, d: 3.4, door: [s.x, -5.4] })),
  tables: TABLES,
  kim: KIM,
  // 걸어서 못 지나가는 곳 (가게 말고): 꾸미기 옷장의 활짝 열린 왼쪽 문, 탁구대 4대
  blocks: [{ x0: -2.2, x1: -1.2, z0: -6.5, z1: -4.0 }, ...TABLES.map((t) => t.rect), KIM.rect],
};

// 밤에 켜지는 불빛 재질: 시간·날씨(src/plazaSky.js)가 밝기를 바꾸므로 합치지 않는다(noBake)
function lit(color, emissive, base = 0.5) {
  const m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: base });
  m.userData.glowBase = base;
  return m;
}
const noBake = (o) => { o.userData.noBake = true; return o; };
// 간판 판 (글자 그림)
function signPlate(parent, text, w, h, x, y, z, { bg = '#fffaf0', color = '#2b2a33', border = null, font = 'bold 92px Jua, sans-serif', px = 640 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex([].concat(text), { w: px, h: Math.round((px * h) / w), bg, color, font, border }), transparent: !bg, depthWrite: !!bg }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
// 두 가지 색 캡슐 (뽑기)
function capsule(parent, r, colA, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(colA, { roughness: 0.4 }));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff, { roughness: 0.4 }));
  g.add(top, bot);
  g.position.set(x, y, z); g.rotation.set(rx, 0, rz);
  parent.add(g);
  return g;
}

// ① 상점 = 커다란 뽑기 기계: 빨간 몸통(문·동전 넣는 곳·돌리는 손잡이·캡슐 나오는 곳) + 위에 캡슐이 가득한 유리 돔
function gachaShop(s) {
  const g = new THREE.Group();
  const { w, d } = s, H = 2.7, fz = d / 2;
  g.position.set(s.x, 0, s.front - d / 2);
  const red = std(0xd7262e, { roughness: 0.55 }), white = std(0xfdf7ee), dark = std(0x2b2a33), gold = std(0xf2c14e, { metalness: 0.25, roughness: 0.4 });
  addBox(g, w, H, d, red, 0, H / 2, 0).castShadow = true;
  addBox(g, w + 0.12, 0.3, d + 0.12, white, 0, H - 0.1, 0);
  addBox(g, w + 0.16, 0.22, d + 0.16, dark, 0, 0.11, 0);
  // 위 테두리 꼬마전구 (밤에 반짝)
  const bulbM = lit(0xfff1b8, 0xffd25a, 0.35);
  for (let i = 0; i < 11; i++) { const b = noBake(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbM)); b.position.set(-w / 2 + 0.25 + i * ((w - 0.5) / 10), H - 0.1, fz + 0.08); g.add(b); }
  // 문 (가운데, 금테 유리문)
  addBox(g, 1.3, 2.05, 0.06, gold, 0, 1.03, fz + 0.03);
  const glassDoor = noBake(addBox(g, 1.14, 1.9, 0.08, lit(0x3a4a66, 0xffd9a0, 0.18), 0, 1.0, fz + 0.04));
  glassDoor.castShadow = false;
  addBox(g, 0.06, 0.5, 0.06, gold, 0.38, 1.0, fz + 0.1);
  // 왼쪽: 동전 넣는 곳 판
  addBox(g, 0.85, 1.05, 0.08, white, -1.55, 1.55, fz + 0.04);
  addBox(g, 0.12, 0.42, 0.1, dark, -1.55, 1.72, fz + 0.06);
  signPlate(g, '🪙 1회', 0.7, 0.26, -1.55, 1.2, fz + 0.09, { bg: '#ffd23f', font: 'bold 70px Jua, sans-serif', px: 320 });
  // 오른쪽: 돌리는 손잡이 (천천히 돈다 → 합치지 않음)
  const knob = new THREE.Group(); knob.userData.dyn = true; knob.name = 'gacha-knob';
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 24), white); disc.rotation.x = Math.PI / 2; knob.add(disc);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.14), dark); bar.position.z = 0.1; knob.add(bar);
  knob.position.set(1.55, 1.65, fz + 0.08);
  g.add(knob);
  // 캡슐 나오는 곳 + 굴러 나온 캡슐
  addBox(g, 0.8, 0.5, 0.1, dark, 1.55, 0.6, fz + 0.04);
  addBox(g, 0.84, 0.08, 0.3, white, 1.55, 0.36, fz + 0.15);
  capsule(g, 0.16, 0x2a5db0, 1.5, 0.56, fz + 0.18, 0.3, 0.8);
  // 유리 돔 받침 + 돔 + 캡슐 더미
  const ringR = Math.min(w, d) / 2 - 0.1;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(ringR + 0.1, ringR + 0.18, 0.3, 32), white);
  collar.position.y = H + 0.18; g.add(collar);
  const rnd = seeded(77);
  const cols = [0xff4d5a, 0xffd23f, 0x3fb6ff, 0x7ad35a, 0xff9ed2, 0xa77bff, 0xff8a1f];
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * (ringR - 0.3), y = H + 0.5 + rnd() * rnd() * 1.1;
    if (Math.hypot(rr, y - H - 0.33) > ringR - 0.22) continue;
    capsule(g, 0.17 + rnd() * 0.06, cols[i % cols.length], Math.cos(a) * rr, y, Math.sin(a) * rr, rnd() * 3, rnd() * 3);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(ringR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false }));
  dome.position.y = H + 0.33; g.add(dome);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 16), red); cap.position.y = H + 0.33 + ringR; g.add(cap);
  // 간판 (몸통 위 흰 띠 아래)
  signPlate(g, s.name + ' · 뽑기', 3.0, 0.58, 0, 2.28, fz + 0.04, { bg: '#fffaf0', border: '#d7262e', font: 'bold 76px Jua, sans-serif' });
  return g;
}

// ② 꾸미기 = 커다란 옷장: 나무 옷장 몸통, 왼쪽 문이 활짝 열려 안의 옷걸이·옷이 보임, 오른쪽 문엔 전신 거울, 지붕 위엔 큰 옷걸이 간판
function wardrobeShop(s) {
  const g = new THREE.Group();
  const { w, d } = s, H = 4.0, fz = d / 2;
  g.position.set(s.x, 0, s.front - d / 2);
  const wood = std(0xb97a45, { roughness: 0.7 }), woodD = std(0x8a5530, { roughness: 0.7 }), brass = std(0xf2c14e, { metalness: 0.25, roughness: 0.4 }), inside = lit(0xf6e9d4, 0xffe2b0, 0.08);
  // 다리 + 몸통(뒤·옆·위·아래 판으로 속이 빈 옷장)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.25, 0.3, 0.25, woodD, sx * (w / 2 - 0.2), 0.15, sz * (d / 2 - 0.2));
  addBox(g, w, 0.18, d, woodD, 0, 0.39, 0); // 바닥판
  addBox(g, w, 0.2, d, woodD, 0, H + 0.2, 0); // 윗판
  addBox(g, w + 0.3, 0.22, d + 0.3, wood, 0, H + 0.38, 0); // 왕관 몰딩
  addBox(g, w + 0.16, 0.12, d + 0.16, woodD, 0, H + 0.53, 0);
  for (const sx of [-1, 1]) addBox(g, 0.16, H - 0.3, d, wood, sx * (w / 2 - 0.08), (H + 0.3) / 2 + 0.15, 0).castShadow = true;
  addBox(g, w - 0.3, H - 0.3, 0.12, wood, 0, (H + 0.3) / 2 + 0.15, -d / 2 + 0.06).castShadow = true;
  // 안쪽 (밤에 은은하게 불이 켜짐)
  noBake(addBox(g, w - 0.34, H - 0.36, 0.02, inside, 0, (H + 0.3) / 2 + 0.15, -d / 2 + 0.13));
  // 가운데 칸막이 + 오른쪽 닫힌 문(전신 거울)
  addBox(g, 0.1, H - 0.3, 0.12, woodD, 0.45, (H + 0.3) / 2 + 0.15, fz - 0.06);
  const doorR = addBox(g, w / 2 - 0.55, H - 0.4, 0.1, wood, (w / 2 + 0.45) / 2 + 0.02, (H + 0.3) / 2 + 0.15, fz - 0.04);
  doorR.castShadow = true;
  const mirrorTex = canvasTex(64, 160, (c) => {
    const gr = c.createLinearGradient(0, 0, 64, 160); gr.addColorStop(0, '#eaf6ff'); gr.addColorStop(1, '#a9cbe3');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 160);
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(8, 60); c.lineTo(30, 20); c.lineTo(38, 20); c.lineTo(16, 60); c.fill();
    c.beginPath(); c.moveTo(20, 90); c.lineTo(48, 40); c.lineTo(52, 40); c.lineTo(24, 90); c.fill();
  });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), new THREE.MeshBasicMaterial({ map: mirrorTex }));
  mirror.position.set(doorR.position.x, 2.2, fz + 0.035); g.add(mirror);
  addBox(g, 1.12, 2.72, 0.04, brass, doorR.position.x, 2.2, fz + 0.005);
  addBox(g, 0.06, 0.4, 0.08, brass, 0.65, 2.2, fz + 0.04);
  // 왼쪽 문: 활짝 열림 (경첩 = 왼쪽 끝)
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2 + 0.16, 0, fz - 0.02);
  hinge.rotation.y = -1.25;
  const dw = w / 2 + 0.29;
  addBox(hinge, dw, H - 0.4, 0.1, wood, dw / 2, (H + 0.3) / 2 + 0.15, 0).castShadow = true;
  for (const y of [1.3, 3.1]) addBox(hinge, dw - 0.3, 0.9, 0.04, woodD, dw / 2, y, 0.06); // 문 무늬
  addBox(hinge, 0.06, 0.4, 0.08, brass, dw - 0.15, 2.2, 0.08);
  g.add(hinge);
  // 열린 쪽 안: 옷걸이 봉 + 옷 (색색 티셔츠·원피스) + 위 선반의 모자
  const openL = -w / 2 + 0.2, openR = 0.4;
  addBox(g, openR - openL, 0.05, 0.05, brass, (openL + openR) / 2, 3.35, 0.1);
  const cloth = [0xff6b6b, 0xffd23f, 0x3fb6ff, 0x7ad35a, 0xff9ed2, 0xa77bff];
  for (let i = 0; i < 5; i++) {
    const x = openL + 0.35 + i * ((openR - openL - 0.7) / 4);
    const m = std(cloth[i]);
    const shirt = new THREE.Group(); shirt.position.set(x, 0, 0.1 - (i % 2) * 0.25); shirt.rotation.y = (i % 2 ? -0.25 : 0.25);
    addBox(shirt, 0.5, i % 3 === 2 ? 1.3 : 0.8, 0.08, m, 0, i % 3 === 2 ? 2.55 : 2.8, 0); // 원피스는 길게
    addBox(shirt, 0.03, 0.2, 0.03, brass, 0, 3.27, 0); // 옷걸이 고리
    for (const sx of [-1, 1]) { const sl = addBox(shirt, 0.22, 0.22, 0.08, m, sx * 0.32, 3.08, 0); sl.rotation.z = sx * -0.6; }
    g.add(shirt);
  }
  addBox(g, openR - openL, 0.06, d - 0.6, woodD, (openL + openR) / 2, 3.75, -0.2);
  const hatM = [std(0x2b2a33), std(0xd7262e), std(0xffd23f)];
  for (let i = 0; i < 3; i++) {
    const hx = openL + 0.45 + i * 0.6;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), hatM[i]); brim.position.set(hx, 3.8, -0.1); g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.18, 16), hatM[i]); crown.position.set(hx, 3.9, -0.1); g.add(crown);
  }
  // 지붕 위 큰 옷걸이 간판
  const hz = 0, hy = H + 0.65;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 20, Math.PI * 1.4), brass);
  hook.position.set(0, hy + 1.75, hz); hook.rotation.z = -0.2; g.add(hook);
  addBox(g, 0.08, 0.35, 0.08, brass, 0, hy + 1.35, hz);
  for (const sx of [-1, 1]) { const arm = addBox(g, 1.7, 0.1, 0.1, woodD, sx * 0.78, hy + 0.85, hz); arm.rotation.z = sx * -0.42; }
  addBox(g, 3.2, 0.1, 0.1, woodD, 0, hy + 0.5, hz);
  signPlate(g, s.name, 2.6, 0.72, 0, hy + 0.05, hz + 0.08, { bg: '#2a5db0', color: '#ffffff', font: 'bold 96px Jua, sans-serif' });
  addBox(g, 2.66, 0.78, 0.08, std(0xffffff), 0, hy + 0.05, hz + 0.02);
  for (const sx of [-1, 1]) addBox(g, 0.03, 0.42, 0.03, brass, sx * 1.1, hy + 0.32, hz + 0.02);
  return g;
}

// ③ 랭킹 = 시상대: 가운데 1등(가장 높고 문이 있음), 왼쪽 2등, 오른쪽 3등. 1등 위 큰 트로피, 2·3등 위 메달, 뒤에 명예의 전당 전광판, 앞 양쪽 조명
function podiumShop(s) {
  const g = new THREE.Group();
  const { d } = s, fz = d / 2;
  g.position.set(s.x, 0, s.front - d / 2);
  const white = std(0xfbf8f2), gold = std(0xf2c14e, { metalness: 0.25, roughness: 0.4 }), silver = std(0xd9dee6, { metalness: 0.25, roughness: 0.4 }), bronze = std(0xc98a4b, { metalness: 0.25, roughness: 0.4 });
  const tiers = [
    { n: '2', x: -1.55, w: 1.4, h: 2.0, m: silver, c: '#6f7a8c' },
    { n: '1', x: 0, w: 1.7, h: 2.9, m: gold, c: '#d79a12' },
    { n: '3', x: 1.55, w: 1.4, h: 1.55, m: bronze, c: '#b06a2c' },
  ];
  for (const t of tiers) {
    addBox(g, t.w, t.h, d, white, t.x, t.h / 2, 0).castShadow = true;
    addBox(g, t.w + 0.06, 0.18, d + 0.06, t.m, t.x, t.h - 0.09, 0);
    addBox(g, t.w + 0.08, 0.14, d + 0.08, t.m, t.x, 0.07, 0);
    // 앞면 큰 숫자
    signPlate(g, t.n, t.n === '1' ? 0.7 : 0.8, t.n === '1' ? 0.55 : 0.8, t.x, t.n === '1' ? t.h - 0.5 : t.h / 2 + 0.05, fz + 0.01, { bg: null, color: t.c, font: 'bold 200px Jua, sans-serif', px: 256 });
  }
  // 1등 칸의 문
  addBox(g, 1.0, 1.95, 0.06, std(0x3a2a1a), 0, 0.98, fz + 0.03);
  addBox(g, 1.12, 0.1, 0.1, gold, 0, 2.0, fz + 0.05);
  noBake(addBox(g, 0.8, 0.5, 0.07, lit(0xffe9b0, 0xffc84a, 0.2), 0, 1.55, fz + 0.04)); // 문 유리창
  // 1등 위 큰 트로피
  const T = 2.9;
  addBox(g, 0.8, 0.28, 0.6, std(0x5a3a22), 0, T + 0.14, -0.2);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.5, 12), gold); stem.position.set(0, T + 0.53, -0.2); g.add(stem);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.22, 0.85, 24), gold); cup.position.set(0, T + 1.2, -0.2); cup.castShadow = true; g.add(cup);
  for (const sx of [-1, 1]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), gold); hd.position.set(sx * 0.66, T + 1.25, -0.2); g.add(hd); }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gold); star.position.set(0, T + 1.78, -0.2); g.add(star);
  // 2·3등 위 메달 (리본 + 원판)
  for (const [t, m, rib] of [[tiers[0], silver, 0x2a5db0], [tiers[2], bronze, 0xd7262e]]) {
    for (const sx of [-1, 1]) { const r = addBox(g, 0.14, 0.5, 0.04, std(rib), t.x + sx * 0.12, t.h + 0.62, -0.2); r.rotation.z = sx * 0.35; }
    const med = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24), m); med.rotation.x = Math.PI / 2; med.position.set(t.x, t.h + 0.32, -0.15); med.castShadow = true; g.add(med);
  }
  // 뒤쪽 명예의 전당 전광판
  const BY = 5.85; // 트로피(꼭대기 약 4.9m)에 가리지 않게 그 위로
  addBox(g, 4.4, 1.5, 0.15, std(0x1c2233), 0, BY, -d / 2 + 0.1);
  for (const sx of [-1, 1]) addBox(g, 0.12, BY - 0.7, 0.12, std(0x3a3f4a), sx * 2.0, (BY - 0.7) / 2, -d / 2 + 0.05);
  const board = noBake(new THREE.Mesh(new THREE.PlaneGeometry(4.1, 1.25), new THREE.MeshBasicMaterial({ map: textTex([s.name + ' · 명예의 전당', '🥇  🥈  🥉  누가 1등?'], { w: 820, h: 250, bg: '#0e1a3a', color: '#ffe08a', font: 'bold 70px Jua, sans-serif' }) })));
  board.position.set(0, BY, -d / 2 + 0.19); g.add(board);
  // 앞 양쪽 조명 (위를 비춤) + 줄 깃발
  const lampM = lit(0xfff4d2, 0xfff0b0, 0.3);
  for (const sx of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12), std(0x2b2a33)); base.position.set(sx * 2.35, 0.15, fz + 0.5); g.add(base);
    const head = noBake(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.3, 12), lampM)); head.position.set(sx * 2.35, 0.42, fz + 0.5); head.rotation.z = sx * 0.4; g.add(head);
  }
  const flagC = [0xd7262e, 0xffd23f, 0x2a5db0, 0x7ad35a];
  for (let i = 0; i < 9; i++) {
    const x = -2.2 + i * 0.55, y = 3.35 - Math.sin((i / 8) * Math.PI) * 0.35;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 3), std(flagC[i % 4])); f.rotation.x = Math.PI; f.position.set(x, y, fz + 0.2); g.add(f);
  }
  return g;
}

const BUILD = { shop: gachaShop, closet: wardrobeShop, rank: podiumShop };

function tree(rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), std(0x7a5233));
  trunk.position.y = 0.6; trunk.castShadow = true; g.add(trunk);
  const leaf = new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? 0x4f9a4a : 0x5fae55, flatShading: true });
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 - k * 0.18, 0), leaf);
    b.position.set((rnd() - 0.5) * 0.3, 1.5 + k * 0.55, (rnd() - 0.5) * 0.3); b.castShadow = true; g.add(b);
  }
  return g;
}

const LAMP_M = lit(0xfff4d2, 0xffe6a0, 0.3);
function lamp() {
  const g = new THREE.Group();
  const k = std(0x2f3540, { metalness: 0.4, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), k); pole.position.y = 1.5; g.add(pole);
  noBake(addBox(g, 0.3, 0.32, 0.3, LAMP_M, 0, 3.1, 0));
  const halo = glowSprite('#ffd98a', 1.6, 0.9); halo.position.y = 3.1; halo.visible = false; halo.userData.nightHalo = true; g.add(halo); // 밤에만
  addBox(g, 0.4, 0.06, 0.4, k, 0, 3.29, 0);
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = std(0xb07a45), k = std(0x3a3f4a);
  for (let i = 0; i < 3; i++) addBox(g, 1.6, 0.05, 0.12, wood, 0, 0.45, -0.15 + i * 0.15);
  for (let i = 0; i < 2; i++) addBox(g, 1.6, 0.12, 0.04, wood, 0, 0.65 + i * 0.16, -0.26);
  for (const sx of [-0.7, 0.7]) addBox(g, 0.06, 0.45, 0.4, k, sx, 0.22, -0.05);
  return g;
}

// 광장 탁구대 (가벼운 모양: 판·흰 선·네트·다리). 경기는 경기 화면(방장 배경)에서 하고, 광장 탁구대는 보기만
function plazaTable(t, color) {
  const g = new THREE.Group();
  g.position.set(t.x, 0, t.z);
  const L = T_HALF[0] * 2, W = T_HALF[1] * 2, Y = 0.76;
  const top = std(color, { roughness: 0.6 }), white = std(0xffffff), dark = std(0x2b2a33);
  addBox(g, L, 0.05, W, top, 0, Y - 0.025, 0).castShadow = true;
  addBox(g, L, 0.052, 0.03, white, 0, Y - 0.024, -W / 2 + 0.015);
  addBox(g, L, 0.052, 0.03, white, 0, Y - 0.024, W / 2 - 0.015);
  for (const sx of [-1, 1]) addBox(g, 0.03, 0.052, W, white, sx * (L / 2 - 0.015), Y - 0.024, 0);
  addBox(g, L, 0.052, 0.006, white, 0, Y - 0.024, 0);
  addBox(g, 0.02, 0.15, W + 0.14, std(0xf4f4f4, { roughness: 0.9 }), 0, Y + 0.075, 0);
  for (const sz of [-1, 1]) addBox(g, 0.04, 0.2, 0.04, dark, 0, Y + 0.08, sz * (W / 2 + 0.07));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.06, Y - 0.05, 0.06, dark, sx * (L / 2 - 0.25), (Y - 0.05) / 2, sz * (W / 2 - 0.15));
  return g;
}
// 기둥에 단 작은 간판 (바닥에 서 있음)
function signPost(root, lines, x, z, color) {
  addBox(root, 0.08, 1.5, 0.08, std(0x6b4a2e), x, 0.75, z);
  signPlate(root, lines, 1.9, 0.62, x, 1.6, z + 0.05, { bg: '#fffaf0', border: color, font: 'bold 64px Jua, sans-serif', px: 600 });
}

export function buildPlaza() {
  const root = new THREE.Group();
  const rnd = seeded(2311);

  // 바닥: 바깥 잔디 + 가운데 돌바닥(바둑판 무늬) + 가운데 원 무늬
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: 0x8cc56a }));
  grass.userData.noBake = true; grass.name = 'grass'; // 눈이 오면 하얗게 (src/plazaSky.js)
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; root.add(grass);
  const stone = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#e9dcc4' : '#efe4cf'; g.fillRect(x * 64, y * 64, 64, 64);
      g.strokeStyle = 'rgba(150,125,90,.35)'; g.lineWidth = 2; g.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62);
    }
  });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  const W = PLAZA.maxX - PLAZA.minX + 3, D = PLAZA.maxZ - PLAZA.minZ + 5;
  stone.repeat.set(W / 2.4, D / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: stone }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (PLAZA.minZ + PLAZA.maxZ) / 2 - 1.5); floor.receiveShadow = true; root.add(floor);
  // 눈이 오면 돌바닥에 쌓이는 하얀 판 (src/plazaSky.js가 투명도를 바꿈)
  const snowLayer = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0, depthWrite: false }));
  snowLayer.rotation.x = -Math.PI / 2; snowLayer.position.set(0, 0.015, floor.position.z); snowLayer.visible = false; snowLayer.receiveShadow = true; root.add(snowLayer);
  // 바닥 가장자리 돌 띠
  const edge = std(0xb9ad99);
  const fz = floor.position.z;
  addBox(root, W + 0.4, 0.08, 0.4, edge, 0, 0.04, fz + D / 2);
  for (const sx of [-1, 1]) addBox(root, 0.4, 0.08, D, edge, sx * (W / 2 + 0.2), 0.04, fz);
  // 가운데 원 (처음 서는 곳)
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshLambertMaterial({ color: 0xd2b98f }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.008, PLAZA.spawn[1]); root.add(ring);
  // 탁구대 4대 (사람 대결용 3대 + 김제빵 탁구대). 움직이지 않으니 합친다. 이름표·자리 칸·상태 표지판은 src/plaza.js
  for (const t of PLAZA.tables) root.add(plazaTable(t, 0x2a5db0));
  root.add(plazaTable(PLAZA.kim, 0x2f8a4e));
  signPost(root, ['🤖 김제빵 탁구대', '혼자 하기 · 누르면 바로'], PLAZA.kim.x, PLAZA.kim.z + 1.6, '#2f8a4e');

  // 가게 3개 + 뒤쪽 담장
  for (const s of PLAZA.shops) root.add(BUILD[s.id](s));
  const wallM = std(0xe7d8bd);
  addBox(root, 32, 2.2, 0.4, wallM, 0, 1.1, -10.6);
  for (const sx of [-1, 1]) addBox(root, 0.4, 2.2, 5, wallM, sx * 15.8, 1.1, -8.2);
  // 가게 사이 화단
  for (const x of [-2.8, 2.8]) {
    addBox(root, 1.0, 0.4, 1.2, std(0xb9ad99), x, 0.2, -7.4);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: [0xff6b6b, 0xffd23f, 0xff9ed2][k % 3], flatShading: true }));
      f.position.set(x - 0.36 + k * 0.18, 0.5, -7.4 + (rnd() - 0.5) * 0.6); root.add(f);
    }
  }

  // 둘레: 나무·가로등·벤치 (걷는 곳 바깥)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) { const t = tree(rnd); t.position.set(sx * (15 + rnd() * 1.5), 0, -6 + i * 4.4 + rnd()); t.scale.setScalar(0.9 + rnd() * 0.4); root.add(t); }
    for (const z of [-4, 4, 11]) { const l = lamp(); l.position.set(sx * 14, 0, z); root.add(l); }
    for (const z of [0, 8]) { const b = bench(); b.position.set(sx * 14.2, 0, z); b.rotation.y = -sx * Math.PI / 2; root.add(b); }
  }
  for (let i = 0; i < 7; i++) { const t = tree(rnd); t.position.set(-12 + i * 4 + rnd(), 0, 15 + rnd() * 1.5); t.scale.setScalar(0.9 + rnd() * 0.4); root.add(t); }
  // 멀리 언덕
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 55 + rnd() * 10;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(14 + rnd() * 8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x79b35c, flatShading: true }));
    hill.position.set(Math.cos(a) * r, -2, Math.sin(a) * r); hill.scale.y = 0.5; root.add(hill);
  }

  // 밤에 켜지는 불빛 모음 (src/plazaSky.js가 시간에 맞춰 밝기를 바꿈)
  const glow = new Set(), halos = [];
  root.traverse((o) => {
    if (o.userData.nightHalo) halos.push(o);
    for (const m of [].concat(o.material || [])) if (m.userData?.glowBase != null) glow.add(m);
  });
  return {
    root,
    glow: [...glow],
    halos,
    grass,
    snowLayer,
    knob: root.getObjectByName('gacha-knob'),
    sky: '#cfe8fb',
    fog: [35, 85],
    far: 140,
    light: { hemi: ['#fffaf0', '#9fb08a', 1.55], sun: ['#fff1dc', 1.7, [-7, 14, 9]], shadow: 17 },
  };
}
