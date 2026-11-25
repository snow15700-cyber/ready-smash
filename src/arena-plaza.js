// 광장 로비 배경 (docs/dev/plaza.md 1장·20장): 배경 아이템과 상관없이 늘 같은 '광장' 하나.
// 20장(11/25 사용자 확정): '경주캠퍼스 느낌' — 시안(campus.html)과 같은 장면(src/campusMock.js buildCampus({ game: true }))에
// 탁구대 4대를 더한다. 북쪽 본관(떠 있는 유리 막대·필로티), 가운데 분수 + 반원 가게 3개(뽑기방·옷가게·명예의 전당),
// 시계탑·게시판·빵집·포토존·푸드트럭·자판기·바다 전망대, 남·동쪽 바다(물결·돌고래). 자리는 src/campusLayout.js.
// 움직이지 않는 것은 bakeArena로 합쳐서 가볍게 (scene.js의 setPlaza가 합친다). 나무·가로등·벤치 등은 무료 모델(InstancedMesh, src/campusModels.js).
import * as THREE from 'three';
import { addBox, std } from './arena-kit.js';
import { buildCampus } from './campusMock.js';
import { fillProps } from './campusModels.js';
import { DECK, FOUNTAIN, heightAt, KIM_SPOT, onPier, PIER, SHOP_SPOTS, STAIRS, SPAWN, SPOTS, TABLE_SPOTS, toWorld } from './campusLayout.js';
import { DECK_TELE_Z } from './campusProps.js';
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
  minX: -21.5, maxX: 21.5, minZ: -10, maxZ: PIER.z1 - 0.35, // 남쪽은 전망대 밑 낚시 판까지 (데크 서쪽·데크 난간·계단 옆은 아래 blocks로 막음, 낚시 12장)
  floorMin: PIER.y, // 가장 낮은 바닥 (바닥 클릭 계산용)
  heightAt, // 서 있는 바닥 높이 (데크 위 0.25m · 계단 · 낚시 판 −4.35m)
  onPier, // 낚시 판 위인지 (4단계 ②: '🎣 낚시하기' 버튼)
  // 돌계단 2개 — 데크 서쪽·동쪽 (plaza.js planWalk: 광장 ↔ 낚시 판은 가까운 계단의 입구 top · 계단 아래 bottom을 지나감)
  stairs: STAIRS.map((S) => ({ ...S, top: [(S.x0 + S.x1) / 2, S.z0 - 0.7], bottom: [(S.x0 + S.x1) / 2, S.z1 + 0.5] })),
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
    // 바다 전망대: 데크 위는 걸어 다님. 데크 양옆(광장 바닥 끝 너머)·망원경·벤치·안내 판은 막음
    // 낚시터(12장): 서쪽 계단 너머(광장 끝 너머 + 판 서쪽 바다) · 데크 바다 쪽 난간(판으로 떨어지지 않게) · 두 계단의 데크 쪽 옆(판에서 계단 옆구리로 못 오르게). 데크 양옆 풀밭 → 계단 → 판은 걸어감
    flat(-22, STAIRS[0].x0, 32.2, PIER.z1 + 1), flat(STAIRS[0].x1, STAIRS[1].x0, DECK.z1 - 0.2, DECK.z1 + 0.2),
    flat(STAIRS[0].x1, STAIRS[0].x1 + 0.2, DECK.z1, STAIRS[0].z1 - 0.3), flat(STAIRS[1].x0 - 0.2, STAIRS[1].x0, DECK.z1, STAIRS[1].z1 - 0.3),
    { x: SPOTS.deck.x - 3, z: SPOTS.deck.z + DECK_TELE_Z(DECK.z1 - DECK.z0), r: 0.4 }, { x: SPOTS.deck.x + 3, z: SPOTS.deck.z + DECK_TELE_Z(DECK.z1 - DECK.z0), r: 0.4 },
    flat(SPOTS.deck.x - 6.15, SPOTS.deck.x - 4.25, SPOTS.deck.z + 0.05, SPOTS.deck.z + 0.75), flat(SPOTS.deck.x + 4.25, SPOTS.deck.x + 6.15, SPOTS.deck.z + 0.05, SPOTS.deck.z + 0.75),
    flat(SPOTS.deck.x - 0.85, SPOTS.deck.x + 0.85, SPOTS.deck.z - (DECK.z1 - DECK.z0) / 2 + 0.15, SPOTS.deck.z - (DECK.z1 - DECK.z0) / 2 + 0.45),
  ],
  // 카메라가 못 들어가는 곳 (가게·건물·본관 기둥·유리 막대). 가게는 따로 더함
  camBlocks: [
    box(SPOTS.clock, -1.3, 1.3, -1.3, 1.3, { y1: 11 }),
    box(SPOTS.bakery, -2.85, 2.85, -2.35, 2.4, { y1: 6 }),
    flat(-7.5, -0.5, -28.5, -19.5), flat(10, 16, -24, -16), flat(-34, -30, -27, -21), // 본관 검은 돌 기둥
    { ...flat(-36.3, 8.3, -30.3, -16.7), y0: 12.6, y1: 26.5 }, { ...flat(-0.3, 40.3, -25.3, -14.2), y0: 8.1, y1: 19.5 }, // 유리 막대 ①·②
  ],
  // 눌러서 뭔가 되는 곳 (광장 20장 ② 기능): 안쪽 좌표 클릭 상자 [x0, x1, z0, z1, 높이] — plaza.js pick → ui/plaza.js onSpot
  spots: [
    { id: 'bakery', ...SPOTS.bakery, box: [-2.9, 2.9, -2.4, 3.5, 6.2] }, // 김제빵 대사
    { id: 'board', ...SPOTS.board, box: [-1.85, 1.85, -0.5, 0.6, 3.3], front: (lx) => toWorld(SPOTS.board, lx, 1.4) }, // 업데이트·미션·치는 방법
    { id: 'clock', ...SPOTS.clock, box: [-1.4, 1.4, -1.4, 1.4, 11.5] }, // 쉬는 시간 안내
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
// 재질 바꾸기: 무늬 없는 무광 → Lambert, 반짝이는 것(금·알루미늄·유리·물)·무늬 있는 것 → Phong (거칠기·금속 정도는 몇 단계로 맞춰 합치기가 잘 되게)
const MAT_CACHE = new WeakMap();
const PH_BASE = THREE.Material.prototype.onBeforeCompile;
export function lightMat(mt) {
  if (!mt?.isMeshStandardMaterial) return mt;
  if (MAT_CACHE.has(mt)) return MAT_CACHE.get(mt);
  const common = {
    color: mt.color, side: mt.side, transparent: mt.transparent, opacity: mt.opacity, depthWrite: mt.depthWrite, blending: mt.blending,
    flatShading: mt.flatShading, vertexColors: mt.vertexColors, map: mt.map, emissive: mt.emissive, emissiveMap: mt.emissiveMap,
    emissiveIntensity: mt.emissiveIntensity, alphaTest: mt.alphaTest, fog: mt.fog,
  };
  let out;
  if (!mt.map && !mt.emissiveMap && !mt.transparent && mt.metalness < 0.3 && mt.roughness >= 0.5 && mt.onBeforeCompile === PH_BASE) out = new THREE.MeshLambertMaterial(common);
  else {
    const metal = mt.metalness >= 0.4, r = mt.roughness;
    out = new THREE.MeshPhongMaterial({
      ...common,
      shininess: r < 0.2 ? 90 : r < 0.45 ? 45 : 15,
      specular: metal ? mt.color.clone().multiplyScalar(0.7) : new THREE.Color(r < 0.45 ? 0x444444 : 0x1a1a1a),
    });
    if (metal) out.color = mt.color.clone().multiplyScalar(0.75); // 반사할 것이 없는 금속은 너무 밝게 보여서 조금 어둡게
  }
  out.name = mt.name;
  out.userData = { ...mt.userData };
  if (mt.onBeforeCompile !== PH_BASE) { out.onBeforeCompile = mt.onBeforeCompile; if (mt.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) out.customProgramCacheKey = mt.customProgramCacheKey; } // 바다 물결
  MAT_CACHE.set(mt, out);
  return out;
}

export function buildPlaza() {
  const c = buildCampus({ game: true });
  const root = c.root;
  // 탁구대 4대 (사람 대결용 3대 + 김제빵 탁구대). 움직이지 않으니 합친다. 이름표·자리 칸·상태 표지판·김제빵은 src/plaza.js
  for (const t of PLAZA.tables) root.add(plazaTable(t, 0x2a5db0));
  root.add(plazaTable(PLAZA.kim, 0x2f8a4e));
  // 낚시터(전망대 밑 판·계단)는 buildCampus가 더함 (src/campusPier.js, fishing.md 12장)
  // 재질 가볍게 (느린 PC): 진짜 같은 빛 계산 재질(MeshStandard)은 픽셀마다 계산이 많아 광장 전체에 쓰면 느린 PC가 힘듦 → 실제 광장은 가벼운 재질로 (시안 페이지는 그대로)
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.material = Array.isArray(o.material) ? o.material.map(lightMat) : lightMat(o.material); });
  // 그림자는 큰 것만 (작은 부품 — 전구·캡슐·손잡이·빵 등 — 까지 그림자를 그리면 그리기가 두 배로 늘어 느린 PC가 힘듦)
  const sph = new THREE.Sphere(), sc = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    o.geometry.boundingSphere || o.geometry.computeBoundingSphere();
    o.getWorldScale(sc);
    if (o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) < 0.9) o.castShadow = false;
  });
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
  a.ready = fillProps(root, props, lightMat).then(() => a.relink()).catch((e) => console.warn('[광장 소품 모델]', e));
  return a;
}
