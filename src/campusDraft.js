// 광장 배치 시안 (campus.html?lay=A|B) — 고르기 전 그림 확인용. 실제 광장(arena-plaza.js)은 아직 안 바뀜.
// 구역: 북쪽 가운데 🏆 명예의 전당(본관 앞) · 서쪽 상점 골목(뽑기방·옷장·빵집 + 김제빵 탁구대) · 남쪽 경기 구역 · 동쪽 시계탑·쉼터
import { KIM_SPOT, LAWNS, PATHS, SHOP_SPOTS, SPOTS, TABLE_SPOTS } from './campusLayout.js';

const E = Math.PI / 2, W = -Math.PI / 2; // 앞(문)이 동쪽 · 서쪽
const DRAFTS = {
  // A: 한 줄 골목 — 가게 3개가 서쪽 가장자리에 나란히 동쪽을 봄, 김제빵 탁구대는 빵집 길 건너
  A: {
    shops: { shop: [-18.5, -7, E], closet: [-18.5, -1.2, E], rank: [0, -7.5, 0] },
    bakery: [-18.5, 4.8, E], kim: [-11, 6.5],
    paths: [[-15.8, -10, -12.8, 8.5], [-12.8, 0.6, -2.6, 3.4]],
  },
  // B: 마주 보는 골목 — 서쪽 줄(뽑기방·빵집)과 동쪽 줄(옷장)이 좁은 길을 사이에 두고 마주 봄, 골목 남쪽 끝에 김제빵 탁구대
  B: {
    shops: { shop: [-18.5, -6.5, E], closet: [-7.6, -5.8, W], rank: [0, -7.5, 0] },
    bakery: [-18.5, 0.6, E], kim: [-13.2, 7.2],
    paths: [[-15.4, -10, -11, 5], [-11, 0.6, -2.6, 3.4], [-1.4, 19, 3.7, 21.8], [0.5, 21.8, 3.7, 32.3]], // 남쪽 길은 낚시터 서쪽 계단(x 0.5~3.7)으로 곧게
    // 3번 탁구대를 왼쪽으로 (11/28 사용자: 불꽃 원이 낚시터 내려가는 길(서쪽 계단 x 0.5~3.7)과 겹침) — 길에서 7m 넘게
    tables: [[-14, 15], [14, 15], [-7, 28.5]],
    spots: { photo: [5, 24, -0.5], truck: [18.6, 4.2, -Math.PI / 2] }, // 포토존·푸드트럭이 불꽃 원 밖으로 (푸드트럭은 동쪽 쉼터로)
    lawns: [[17, -9, 21, 1], [-21, 23, -17, 31], [17, 26, 21, 30]], // 1번 원 안 잔디밭 → 남서 구석
  },
};
const COMMON_PATHS = [[-1.4, -5.2, 1.4, -0.6], [-1.4, 4.6, 1.4, 19], [2.6, 0.6, 13, 3.4], [11.8, -4, 14.6, 0.6]]; // 북(명예의 전당) · 남(경기 구역) · 동(시계탑)

const d = DRAFTS[new URLSearchParams(location.search).get('lay')];
if (d) {
  for (const sp of SHOP_SPOTS) { const [x, z, yaw] = d.shops[sp.id]; Object.assign(sp, { x, z, yaw }); }
  const [bx, bz, by] = d.bakery; Object.assign(SPOTS.bakery, { x: bx, z: bz, yaw: by });
  KIM_SPOT.splice(0, 2, ...d.kim);
  TABLE_SPOTS.splice(0, 3, ...(d.tables || [[-14, 15], [14, 15], [0, 26.5]])); // 경기 구역: 조금 남쪽으로 (불꽃 원 7m가 골목·전망대에 안 닿게)
  for (const [k, [x, z, yaw]] of Object.entries(d.spots || {})) Object.assign(SPOTS[k], { x, z, yaw });
  if (d.lawns) LAWNS.splice(0, LAWNS.length, ...d.lawns); else LAWNS.splice(0, 1); // 서쪽 위 잔디밭 → 골목
  PATHS.push(...COMMON_PATHS, ...d.paths);
}
