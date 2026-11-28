// 광장 '경주캠퍼스 느낌' 배치 (docs/dev/plaza.md 20장) — 시안(campus.html)과 실제 광장(arena-plaza.js)이 같이 쓰는 자리.
// 위가 북쪽(−z). 단위 m. yaw = 그 물건 그룹의 rotation.y (그룹의 +z가 앞)
export const FOUNTAIN = [0, 2];
// 구역 (plaza.md 8장, 11/28 사용자 확정 '마주 보는 골목'): 북쪽 가운데 🏆 명예의 전당(본관 앞, 혼자) · 서쪽 🛍️ 상점 골목
// (서쪽 줄 뽑기방·빵집 ↔ 동쪽 줄 옷장, 골목 남쪽 끝 김제빵 탁구대) · 남쪽 🏓 경기 구역 · 동쪽 ☕ 쉼터(시계탑·푸드트럭) · 분수에서 각 구역으로 돌길
const E = Math.PI / 2, W = -Math.PI / 2; // 앞(문)이 동쪽 · 서쪽
export const SHOP_SPOTS = [
  { id: 'shop', name: '🛒 상점', x: -18.5, z: -6.5, yaw: E }, // 뽑기방 (골목 서쪽 줄)
  { id: 'closet', name: '👕 꾸미기', x: -7.6, z: -5.8, yaw: W }, // 옷장 (골목 동쪽 줄, 뽑기방과 마주 봄)
  { id: 'rank', name: '🏆 랭킹', x: 0, z: -7.5, yaw: 0 }, // 명예의 전당 (본관 앞 가운데, 분수를 봄)
];
export const SPOTS = {
  clock: { x: 13.5, z: -6.5, yaw: -0.5 },
  board: { x: 5, z: 9.6, yaw: -0.35 },
  bakery: { x: -18.5, z: 0.6, yaw: E }, // 골목 서쪽 줄 (뽑기방 남쪽)
  photo: { x: 5, z: 24, yaw: -0.5 }, // 경기 구역 사이 빈 곳 (불꽃 원 밖)
  truck: { x: 18.6, z: 4.2, yaw: W }, // 동쪽 쉼터 (시계탑 아래)
  vending: { x: 20.6, z: 27, yaw: -Math.PI / 2 },
  deck: { x: 11, z: 35.65, yaw: 0 }, // 절벽 끝까지 (낚시 12장: 광장 끝 z 32.3 ~ 절벽 39)
  fishBoard: { x: -0.75, z: 35.4, yaw: Math.PI / 2 }, // 낚시 게시판: 서쪽 계단으로 가는 풀밭 길 바로 옆(길 밖 잔디), 데크 쪽(동쪽)을 봄 — 길·카메라를 안 가리게 (11/26 사용자: 전망대·계단 옆, 광장 게시판과 같은 모양)
};
// 탁구대: 사람 대결 1·2·3번 + 김제빵 (사용자 확정 11/28: 분수 남쪽 경기 구역. 3번은 불꽃 원이 낚시터 서쪽 계단 길(x 0.5~3.7)에서 7m 넘게 왼쪽으로.
// 김제빵 탁구대는 빵집과 같이 상점 골목 남쪽 끝)
export const TABLE_SPOTS = [[-14, 15], [14, 15], [-7, 28.5]];
export const KIM_SPOT = [-13.2, 7.2];
export const SPAWN = [0, 10.5];
// 네모 잔디밭 [x0, z0, x1, z1] · 분수에서 뻗는 길(색 다른 돌, 보기만 — 걷기는 그대로) [x0, z0, x1, z1]
export const LAWNS = [[17, -9, 21, 1], [-21, 23, -17, 31], [17, 26, 21, 30]]; // 불꽃 원·골목 밖
export const PATHS = [
  [-1.4, -5.2, 1.4, -0.6], // 북: 명예의 전당
  [-11, 0.6, -2.6, 3.4], [-15.4, -10, -11, 5], // 서: 상점 골목
  [-1.4, 4.6, 1.4, 19], [-1.4, 19, 3.7, 21.8], [0.5, 21.8, 3.7, 32.3], // 남: 경기 구역 → 낚시터 서쪽 계단으로 곧게
  [2.6, 0.6, 13, 3.4], [11.8, -4, 14.6, 0.6], // 동: 쉼터·시계탑
];

// 그룹 안(로컬) 점 → 광장 점. three.js rotation.y = yaw 와 같은 돌림
export function toWorld(o, lx, lz) {
  const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
export function toLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [dx * c - dz * s, dx * s + dz * c];
}
// ── 바다 전망대 + 낚시터 (docs/dev/fishing.md 12장·14장 1b, 사용자 확정 11/25·11/26)
// 데크는 절벽 끝까지, 바다는 광장보다 6m 아래. 데크 양옆(서·동) 넓고 가파른 돌계단으로 내려가면 → 'ㄷ자' 넓은 선착장 (14장 1b, 11/26 사용자 확정 A안):
//   앞 판 34 × 7.5m(절벽에 붙음) + 양 끝에서 바다 쪽으로 뻗은 팔 2개(11m) — 팔 사이는 작은 항구(배), 팔 끝에 등대.
//   앞 판 서쪽 계단 아래 🍣 횟집·📈 시세 칠판, 동쪽 계단 아래 🐾 고양이 쉼터.
// 선착장 판·서는 곳은 서버(36_fish_pier_u.sql)·rules.js와 맞춰 둔 자리 — 옮기면 SQL도 같이.
export const SEA_Y = -6;
export const DECK = { x0: 4, x1: 18, z0: 32.3, z1: 39, h: 0.25 }; // 광장 좌표 네모 + 바닥 높이
export const CLIFF = { x0: -8, x1: 30, face: 39 }; // 절벽 벽 (광장 땅 끝 z = face)
export const PIER = { x0: -6, x1: 28, z0: 39, z1: 46.5, y: SEA_Y + 1.65 }; // 앞 판 (데크 가운데 x 11 기준 좌우 같게). y = 나무 판 윗면
// 팔 2개: 앞 판 양 끝에서 남쪽(바다)으로 11m. 팔 끝 바깥 모서리에 등대
export const ARMS = [
  { side: 'west', x0: -6, x1: -2, z0: PIER.z1, z1: PIER.z1 + 11 },
  { side: 'east', x0: 24, x1: 28, z0: PIER.z1, z1: PIER.z1 + 11 },
];
export const WOODS = [PIER, ...ARMS]; // 나무 판 전부 (걷기·찌가 떨어지는 곳 계산)
// 등대: 팔 끝(갑판이 끝나는 곳) 바로 앞(남쪽)에 붙은 돌 받침 위 (11/27 사용자 요청 — 전에는 팔 끝 바깥 옆). 받침도 찌가 못 떨어지는 곳(rules.js WOOD)
export const LH_BASES = ARMS.map((A) => { const cx = (A.x0 + A.x1) / 2; return { x0: cx - 1.45, x1: cx + 1.45, z0: A.z1, z1: A.z1 + 2.4 }; });
export const LIGHTHOUSES = LH_BASES.map((B, i) => ({ side: ARMS[i].side, x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2, r: 0.8 }));
export const HARBOR = { x0: ARMS[0].x1, x1: ARMS[1].x0, z0: PIER.z1, z1: ARMS[0].z1 }; // 팔 사이 작은 항구
// 돌계단 2개: 데크 서쪽 옆 · 동쪽 옆(x0~x1), 광장 끝(z0, 높이 0)에서 남쪽으로 곧게 → 선착장 판(z1, 높이 PIER.y)
export const STAIRS = [
  { side: 'west', x0: 0.5, x1: 3.7, z0: 39, z1: 43.5 },
  { side: 'east', x0: 18.3, x1: 21.5, z0: 39, z1: 43.5 },
];
// 앞 판 위 구역 (14장 1b): 서쪽 계단 아래 🍣 횟집(정면이 남쪽) + 📈 칠판 · 동쪽 계단 아래 🐾 고양이 쉼터
export const MARKET = { x: -3.1, z: 40.75, w: 4.8, d: 3.1, door: [-3.1, 43.4] }; // 횟집 건물 가운데·크기, 문 앞(서면 '🍣 횟집' 버튼)
export const BOARD = { x: -0.35, z: 43.9, w: 1.7 }; // 시세 칠판 (횟집 오른쪽 앞, 남쪽을 봄)
export const CAT_NOOK = { x0: 22.2, x1: 27.6, z0: 39, z1: 42.6 }; // 고양이 쉼터 (상자·방석·생선 바구니)
export const stairAt = (x, z) => STAIRS.find((S) => x > S.x0 && x <= S.x1 && z > S.z0 && z < S.z1);
export const stairY = (z, S = STAIRS[1]) => (PIER.y * Math.min(1, Math.max(0, (z - S.z0) / (S.z1 - S.z0))));
const inRect = (R, x, z, m = 0) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
export const onWood = (x, z, m = 0) => WOODS.some((R) => inRect(R, x, z, m));
export const onPier = (x, z) => onWood(x, z, 0.5) && z > PIER.z0 && !STAIRS.some((S) => x > S.x0 && x <= S.x1 && z < S.z1);
export const nearMarket = (x, z) => Math.hypot(x - MARKET.door[0], z - MARKET.door[1]) < 1.6;
// 서 있는 바닥 높이 (걷기·카메라·다른 사람 모습·바닥 클릭이 같이 씀 — 걷기 정보는 x, z만)
export function heightAt(x, z) {
  if (x > DECK.x0 && x < DECK.x1 && z > DECK.z0 && z < DECK.z1) return DECK.h;
  const S = stairAt(x, z);
  if (S) return stairY(z, S);
  if (z > PIER.z0 - 0.01 && x > PIER.x0 - 1) return PIER.y;
  return 0;
}
