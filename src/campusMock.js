// 광장 새 디자인 시안 (campus.html): '경주캠퍼스 느낌' 광장을 대충 3D로 — 기획 확인용, 게임에는 아직 안 씀
// 배치는 docs/dev/plaza.md 20장 배치도 초안. 위가 북쪽(−z). 좌표는 광장 좌표와 같은 m 단위.
import * as THREE from 'three';
import { addBox, canvasTex, seeded, std } from './arena-kit.js';
import { buildMainHall } from './campusBuilding.js';
import { closetShop, fameShop, gachaShop } from './campusShops.js';
import { addLampGlow, makeDolphins, makeSea } from './campusFx.js';
import { DECK, FOUNTAIN, KIM_SPOT, SEA_Y, SHOP_SPOTS, SPAWN, SPOTS, TABLE_SPOTS } from './campusLayout.js';
import { buildPierArea } from './campusPier.js';
import { bakery, board, clockTower, deck, foodTruck, fountain, photoZone, vending } from './campusProps.js';

const FONT = (px) => `bold ${px}px Jua, sans-serif`;
let rnd = seeded(2511);
// 실제 광장(game = true)에서는: 탁구대·사람 표시는 광장 코드가 따로 그리고, 소품(나무·가로등·벤치…) 자리는 비워 둔다
// (무료 모델을 한꺼번에 InstancedMesh로 채움 — src/campusModels.js). 시안 페이지는 지금 모양 → 버튼으로 모델
let GAME = false;

function cyl(parent, rt, rb, h, m, x, y, z, seg = 24) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z); c.castShadow = true; parent.add(c);
  return c;
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
  if (GAME) { g.scale.setScalar(s); g.userData.prop = 'tree'; g.userData.seed = rnd(); return g; }
  cyl(g, 0.14, 0.2, 1.4, std(0x7a5233), 0, 0.7, 0, 8);
  const leaf = new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? 0x3f7f3f : 0x4f9a4a, flatShading: true });
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.ConeGeometry(1.2 - k * 0.3, 1.4, 7), leaf); b.position.y = 1.7 + k * 0.7; b.castShadow = true; g.add(b); } // 소나무 느낌
  g.scale.setScalar(s);
  g.userData.prop = 'tree'; g.userData.seed = rnd(); // 무료 모델로 바꿔 보기 (campusPage.js swapProps)
  return g;
}
function bench() {
  const g = new THREE.Group(); g.userData.prop = 'bench';
  if (GAME) return g;
  addBox(g, 1.8, 0.42, 0.55, M.stone, 0, 0.21, 0); // 검은 돌 받침
  addBox(g, 1.8, 0.08, 0.55, M.wood, 0, 0.46, 0);
  return g;
}
function lamp() {
  const g = new THREE.Group(); g.userData.prop = 'lamp';
  if (GAME) { addLampGlow(g, 4.05, 0); return g; }
  cyl(g, 0.06, 0.08, 4, M.alu, 0, 2, 0, 8);
  addBox(g, 0.9, 0.12, 0.25, M.alu, 0.35, 4.0, 0);
  addBox(g, 0.5, 0.06, 0.2, new THREE.MeshBasicMaterial({ color: 0xfff4d2 }), 0.55, 3.93, 0);
  addLampGlow(g, 4.05, 0); // 밤에 바닥 빛 웅덩이 + 전구 빛 번짐 (무료 모델 가로등으로 바꿔도 그대로)
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

export function buildCampus({ game = false } = {}) {
  GAME = game; rnd = seeded(2511); // 언제 지어도 같은 모습 (모든 PC가 같게)
  const root = new THREE.Group();
  const anim = [];
  // 언덕 위 땅 (광장 둘레 잔디) + 가장자리 절벽 아래 바다
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshLambertMaterial({ color: 0x86b96a }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-1, -0.02, 4); ground.receiveShadow = true; ground.name = 'grass'; ground.userData.noBake = true; root.add(ground); // 눈이 오면 하얗게 (plazaSky)
  // 땅 둘레 숲 언덕 (사진 3: 숲 언덕 위 건물)
  const slope = std(0x4e7d3e, { flatShading: true }), seaRock = std(0x6f7468, { roughness: 0.95, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const t = i / 40, a = t * Math.PI * 2;
    const x = Math.cos(a) * 36 - 1, z = Math.sin(a) * 36 + 4;
    // 바다 쪽(남쪽)은 바다가 높아져서(낚시 12장) 물 위로 드러나는 부분이 바위 절벽처럼 보이게
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rnd() * 2, 0), z > 20 ? seaRock : slope); b.position.set(x, -5 + rnd(), z); b.scale.y = 0.8; // 전망대 데크 위로 안 솟게 낮춤
    if (!(x > -3 && x < 22 && z > 25)) root.add(b); // 전망대 아래는 절벽 벽·낚시터 계단 (campusPier.js)
  }
  // 바다 (남·동쪽 아래)
  const sea = makeSea(SEA_Y); root.add(sea.group); anim.push(sea.update); // 물결 (src/campusFx.js). 낚시 12장: −12 → −6
  const dolphins = makeDolphins(SEA_Y); root.add(dolphins.group); anim.push(dolphins.update); // 가끔 점프하는 돌고래
  // 북·서쪽 산 (낮은 산이 겹겹이)
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.95 + (i / 13) * 0.75); // 서쪽 → 북쪽
    const r = 90 + rnd() * 40;
    const m = new THREE.Mesh(new THREE.SphereGeometry(26 + rnd() * 18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: i % 2 ? 0x5d8a57 : 0x6f9a66, flatShading: true }));
    m.position.set(Math.cos(a) * r, SEA_Y - 6, Math.sin(a) * r); m.scale.y = 0.55 + rnd() * 0.3; root.add(m);
  }

  // 광장 바닥 (회색 돌판)
  const floorT = slabTex(); floorT.repeat.set(44 / 8, 44 / 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(45, 44), new THREE.MeshLambertMaterial({ map: floorT }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 11.5); floor.receiveShadow = true; root.add(floor);
  // 눈이 오면 돌바닥에 쌓이는 하얀 판 (plazaSky가 투명도를 바꿈)
  const snowLayer = new THREE.Mesh(new THREE.PlaneGeometry(45, 44), new THREE.MeshLambertMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0, depthWrite: false }));
  snowLayer.rotation.x = -Math.PI / 2; snowLayer.position.set(0, 0.015, 11.5); snowLayer.visible = false; snowLayer.receiveShadow = true; root.add(snowLayer);
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
  const hall = buildMainHall(root, rnd); // 다듬은 본관 (src/campusBuilding.js)
  // 본관 앞면 전광판 (경기 점수·오늘의 1등)
  const scr = canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#ffe08a'; g.font = FONT(64); g.textAlign = 'center'; g.fillText('🔥 1번 탁구대  김OO 7 : 5 이OO', w / 2, 130);
    g.fillStyle = '#9fe0ff'; g.font = FONT(56); g.fillText('🏆 오늘의 1등  박OO  12승', w / 2, 270);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(15, 5.6), new THREE.MeshBasicMaterial({ map: scr }));
  screen.position.set(-16, 17.2, hall.frontA + 0.42); root.add(screen); screen.name = 'scoreboard'; screen.userData.noBake = true; // 실제 광장: 경기 점수·랭킹 1등 (ui/plazaBoards.js) // 세로 핀(0.06+0.11) 앞으로
  addBox(root, 15.5, 6.1, 0.2, std(0x15191c, { metalness: 0.4, roughness: 0.4 }), -16, 17.2, hall.frontA + 0.3); // 전광판 틀

  // 분수 + 가게 반원 (분수 (0,2) 둘레 반지름 약 8.5)
  const place = (g, o) => { g.position.set(o.x, 0, o.z); g.rotation.y = o.yaw || 0; root.add(g); return g; };
  const fnt = fountain(anim); fnt.position.set(FOUNTAIN[0], 0, FOUNTAIN[1]); root.add(fnt);
  const BUILD = { shop: gachaShop, closet: closetShop, rank: fameShop }; // 다듬은 가게 (src/campusShops.js)
  const shops = {};
  for (const sp of SHOP_SPOTS) shops[sp.id] = place(BUILD[sp.id](rnd), sp);

  place(clockTower(anim), SPOTS.clock);
  place(board(), SPOTS.board);
  // 탁구대 (사람 대결 3대 + 김제빵) — 실제 광장은 arena-plaza.js가 그림
  if (!GAME) { for (const [x, z] of TABLE_SPOTS) root.add(table(x, z, 0x2a5db0)); root.add(table(KIM_SPOT[0], KIM_SPOT[1], 0x2f8a4e)); }
  const bk = place(bakery(anim), SPOTS.bakery);
  place(photoZone(), SPOTS.photo);
  place(foodTruck(), SPOTS.truck);
  place(vending(), SPOTS.vending);
  place(deck(DECK.z1 - DECK.z0), SPOTS.deck); // 광장 끝 ~ 절벽 끝 (낚시 12장)
  root.add(buildPierArea()); // 전망대 옆 돌계단 · 바로 밑 바위 턱 · 나무 선착장 (낚시터)
  // 가장자리 가로등·벤치·소나무
  for (const sx of [-1, 1]) {
    for (const z of [-6, 6, 18, 30]) { const l = lamp(); l.position.set(sx * 22.3, 0, z); l.rotation.y = sx > 0 ? Math.PI : 0; root.add(l); }
    for (const z of [9, 20]) { const b = bench(); b.position.set(sx * 21.6, 0, z); b.rotation.y = Math.PI / 2; root.add(b); }
    for (let i = 0; i < 8; i++) { const t = tree(0.9 + rnd() * 0.5); t.position.set(sx * (24.5 + rnd() * 2), 0, -8 + i * 5.2 + rnd()); root.add(t); }
  }
  for (let i = 0; i < 4; i++) { const t = tree(0.9 + rnd() * 0.5); t.position.set(-16.5 + i * 3.6 + rnd(), 0, 36 + rnd() * 2); root.add(t); } // 서쪽 계단 입구(x 0.5~3.7)를 안 가리게

  // 무료 모델로 바꿨을 때만 생기는 소품 (지금 모양에는 없는 것): 잔디밭 모서리 덤불·잔디밭 꽃·벤치 옆 쓰레기통
  const extra = (kind, x, z, ry = 0) => { const e = new THREE.Group(); e.userData.prop = kind; e.userData.extra = true; e.userData.seed = rnd(); e.position.set(x, 0, z); e.rotation.y = ry; root.add(e); };
  for (const [x0, z0, x1, z1] of [[-21, -9, -17, 4], [17, -9, 21, 4], [-21, 15, -17, 23], [17, 26, 21, 30]]) {
    for (const [x, z] of [[x0 + 0.7, z0 + 0.7], [x1 - 0.7, z0 + 0.7], [x0 + 0.7, z1 - 0.7], [x1 - 0.7, z1 - 0.7]]) extra('bush', x, z, rnd() * 6);
    for (let i = 0; i < 7; i++) extra('flower', x0 + 1 + rnd() * (x1 - x0 - 2), z0 + 1.5 + rnd() * (z1 - z0 - 3), rnd() * 6);
  }
  for (const sx of [-1, 1]) for (const z of [9, 20]) extra('trash', sx * 21.6, z + 1.5, rnd() * 6);

  // 사람 대신 표시 (처음 서는 곳) — 시안만
  if (!GAME) {
    const me = new THREE.Group();
    cyl(me, 0.28, 0.32, 0.9, std(0xffd23f), 0, 0.75, 0, 16);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), std(0xf3d5b5)); hd.position.y = 1.5; me.add(hd);
    me.position.set(SPAWN[0], 0, SPAWN[1]); root.add(me);
  }

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) o.receiveShadow = true; });
  return { root, anim, bakery: bk, dolphins, shops, ground, snowLayer };
}
