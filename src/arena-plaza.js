// 광장 로비 배경 (docs/dev/plaza.md 1장·20장): 배경 아이템과 상관없이 늘 같은 '광장' 하나.
// 20장(11/25 사용자 확정): '경주캠퍼스 느낌' — 시안(campus.html)과 같은 장면(src/campusMock.js buildCampus({ game: true }))에
// 탁구대 4대를 더한다. 북쪽 본관(떠 있는 유리 막대·필로티), 가운데 분수 + 반원 가게 3개(뽑기방·옷가게·명예의 전당),
// 시계탑·게시판·빵집·포토존·푸드트럭·자판기·바다 전망대, 남·동쪽 바다(물결·돌고래). 자리는 src/campusLayout.js.
// 움직이지 않는 것은 bakeArena로 합쳐서 가볍게 (scene.js의 setPlaza가 합친다). 나무·가로등·벤치 등은 무료 모델(InstancedMesh, src/campusModels.js).
import * as THREE from 'three';
import { addBox, std } from './arena-kit.js';
import { buildCampus } from './campusMock.js';
import { fillProps } from './campusModels.js';
import { FOUNTAIN, KIM_SPOT, SHOP_SPOTS, SPAWN, SPOTS, TABLE_SPOTS, toWorld } from './campusLayout.js';
import { GACHA_OUT, SHOP_D } from './campusShops.js';

// 탁구대 (② 탁구대에 서서 경기, plaza.md 2장): 긴 쪽이 x. A팀(side 0) = 서쪽(x−) 끝, B팀(side 1) = 동쪽(x+) 끝.
// 자리 4칸: 0·1 = A팀 1번·2번, 2·3 = B팀 1번·2번 (각 팀이 탁구대를 볼 때 1번이 왼쪽)
const T_HALF = [1.37, 0.7625]; // 탁구대 반 길이·반 너비 (경기 탁구대와 같은 크기)
const SEAT_X = 2.12, SEAT_Z = 0.5;
const tableAt = (n, x, z) => ({
  n, x, z,
  seats: [[x - SEAT_X, z - SEAT_Z], [x - SEAT_X, z + SEAT_Z], [x + SEAT_X, z + SEAT_Z], [x + SEAT_X, z - SEAT_Z]],
  rect: { x0: x - T_HALF[0] - 0.08, x1: x + T_HALF[0] + 0.08, z0: z - T_HALF[1] - 0.08, z1: z + T_HALF[1] + 0.08 },
});
// 경기장 거품(plaza.md 16장): 경기 중인 탁구대 둘레 원(들어가기 7m·나가기 9m)이 겹치지 않게 탁구대끼리 18m 넘게 떨어뜨림
export const BUBBLE_IN = 7, BUBBLE_OUT = 9;
const TABLES = TABLE_SPOTS.map(([x, z], i) => tableAt(i + 1, x, z));
// 김제빵 탁구대 (③ 혼자 하기): 서쪽 끝 spot에 서면 혼자 하기, 동쪽 끝 chef에 김제빵이 늘 서 있다
const KIM = { ...tableAt(0, KIM_SPOT[0], KIM_SPOT[1]), spot: [KIM_SPOT[0] - SEAT_X, KIM_SPOT[1]], chef: [KIM_SPOT[0] + SEAT_X, KIM_SPOT[1]] };

// 걸어서 못 지나가는 곳(장애물). 종류 둘:
//  네모 { x, z, yaw, x0, x1, z0, z1 } — (x, z)를 가운데로 yaw만큼 돌린 물건 안쪽 좌표의 네모 (yaw 0·x 0·z 0이면 광장 좌표 그대로)
//  동그라미 { x, z, r }
// 카메라 막기용은 높이 y0·y1도 (본관 유리 막대처럼 공중에 있는 것)
const box = (o, x0, x1, z0, z1, more = {}) => ({ x: o.x, z: o.z, yaw: o.yaw || 0, x0, x1, z0, z1, ...more });
const flat = (x0, x1, z0, z1) => ({ x: 0, z: 0, yaw: 0, x0, x1, z0, z1 });
const FZ = SHOP_D / 2;
// 가게 바닥 자리(안쪽 좌표)·문 앞(도착하면 화면이 열리는 곳)
const SHOP_BOX = { shop: [-2.95, 2.95, -2.35, FZ + 0.95], closet: [-2.95, 2.95, -2.35, FZ + 0.85], rank: [-3.3, 3.3, -2.6, 3.45] };
const SHOPS = SHOP_SPOTS.map((sp) => {
  const [x0, x1, z0, z1] = SHOP_BOX[sp.id];
  return { ...sp, h: 4.6, rect: box(sp, x0, x1, z0, z1), door: toWorld(sp, 0, z1 + 1.0) };
});
const GACHA = SHOPS.find((s) => s.id === 'shop');

// 걸을 수 있는 곳 (m)
export const PLAZA = {
  minX: -21.5, maxX: 21.5, minZ: -10, maxZ: 32,
  spawn: SPAWN, // 처음 서는 곳 (분수 남쪽, 북쪽 가게를 바라봄). 가게 문까지 약 13m(걸어서 3초)
  shops: SHOPS,
  tables: TABLES,
  kim: KIM,
  // 가게 말고 걸어서 못 지나가는 곳
  blocks: [
    { x: FOUNTAIN[0], z: FOUNTAIN[1], r: 3.65 }, // 분수 물받이
    ...TABLES.map((t) => flat(t.rect.x0, t.rect.x1, t.rect.z0, t.rect.z1)),
    flat(KIM.rect.x0, KIM.rect.x1, KIM.rect.z0, KIM.rect.z1),
    flat(KIM.chef[0] - 0.3, KIM.chef[0] + 0.3, KIM.z - 0.3, KIM.z + 0.3),
    box(SPOTS.clock, -1.3, 1.3, -1.3, 1.3),
    box(SPOTS.board, -1.8, 1.8, -0.35, 0.35),
    { x: SPOTS.photo.x, z: SPOTS.photo.z, r: 2.1 },
    box(SPOTS.truck, -2.4, 2.9, -1.15, 3.0),
    box(SPOTS.vending, -0.6, 3.0, -0.45, 0.45),
    box(SPOTS.bakery, -2.85, 2.85, -2.35, 3.4),
    flat(6, 20, 31, 35.6), // 바다 전망대 데크
  ],
  // 카메라가 못 들어가는 곳 (가게·건물·본관 기둥·유리 막대). 가게는 따로 더함
  camBlocks: [
    box(SPOTS.clock, -1.3, 1.3, -1.3, 1.3, { y1: 11 }),
    box(SPOTS.bakery, -2.85, 2.85, -2.35, 2.4, { y1: 6 }),
    flat(-7.5, -0.5, -28.5, -19.5), flat(10, 16, -24, -16), flat(-34, -30, -27, -21), // 본관 검은 돌 기둥
    { ...flat(-36.3, 8.3, -30.3, -16.7), y0: 12.6, y1: 26.5 }, { ...flat(-0.3, 40.3, -25.3, -14.2), y0: 8.1, y1: 19.5 }, // 유리 막대 ①·②
  ],
  // 김제빵이 뛰어나오는 곳 (빵집 문 앞) — plazaKim.js
  kimHome: toWorld(SPOTS.bakery, -1.45, FZ + 1.3),
  // 뽑기 연출(ui/plaza.js): 캡슐 나오는 곳(뽑기방 안쪽 좌표)과 그 가게
  gacha: { shop: GACHA, out: GACHA_OUT },
};

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
export function buildPlaza() {
  const c = buildCampus({ game: true });
  const root = c.root;
  // 탁구대 4대 (사람 대결용 3대 + 김제빵 탁구대). 움직이지 않으니 합친다. 이름표·자리 칸·상태 표지판·김제빵은 src/plaza.js
  for (const t of PLAZA.tables) root.add(plazaTable(t, 0x2a5db0));
  root.add(plazaTable(PLAZA.kim, 0x2f8a4e));
  // 무료 소품 모델 자리 (모델을 다 받으면 InstancedMesh로 채움 — 합치기와 상관없이 그리기 몇 번)
  const props = new THREE.Group(); props.name = 'props'; root.add(props);
  const a = {
    root,
    glow: [],
    halos: [],
    nightFx: [],
    grass: c.ground,
    snowLayer: c.snowLayer,
    knob: root.getObjectByName('gacha-knob'),
    sky: '#cfe8fb',
    fog: [60, 220],
    far: 700,
    light: { hemi: ['#fffaf0', '#9fb08a', 1.55], sun: ['#fff1dc', 1.7, [-7, 14, 9]], shadow: 22 },
    // 움직이는 것(분수·물결·돌고래·시계 초침·굴뚝 연기): plazaSky가 매 프레임, bakeArena는 미리 돌려 보고 움직이는 것을 찾음
    tick: (t) => { for (const f of c.anim) f(t); },
  };
  // 밤에 켜지는 재질·가로등 빛 모으기 (합치기 뒤에도 다시 — 합친 메시는 재질을 복사하므로)
  a.relink = () => {
    const glow = new Set(), fx = [];
    root.traverse((o) => {
      for (const m of [].concat(o.material || [])) if (m.userData?.glow || m.userData?.glowBase != null) glow.add(m);
      if (o.userData.nightFx) fx.push(o.userData.nightFx);
    });
    a.glow = [...glow]; a.nightFx = fx;
  };
  a.relink();
  a.ready = fillProps(root, props).then(() => a.relink()).catch((e) => console.warn('[광장 소품 모델]', e));
  return a;
}
