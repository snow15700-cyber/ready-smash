// 광장 '경주캠퍼스 느낌' 배치 (docs/dev/plaza.md 20장) — 시안(campus.html)과 실제 광장(arena-plaza.js)이 같이 쓰는 자리.
// 위가 북쪽(−z). 단위 m. yaw = 그 물건 그룹의 rotation.y (그룹의 +z가 앞)
export const FOUNTAIN = [0, 2];
export const SHOP_R = 9; // 분수에서 가게 가운데까지
// 가게 3개: 분수 북쪽 반원 (각도: 북쪽에서 시계 반대로 −, 시계 방향 +)
export const SHOP_SPOTS = [
  { id: 'shop', name: '🛒 상점', deg: -52 }, // 뽑기방
  { id: 'closet', name: '👕 꾸미기', deg: 0 }, // 옷가게
  { id: 'rank', name: '🏆 랭킹', deg: 52 }, // 명예의 전당
].map((s) => {
  const a = (s.deg * Math.PI) / 180;
  return { ...s, x: FOUNTAIN[0] + Math.sin(a) * SHOP_R, z: FOUNTAIN[1] - Math.cos(a) * SHOP_R, yaw: -a }; // 앞(+z)이 분수 쪽
});
export const SPOTS = {
  clock: { x: 13.5, z: -6.5, yaw: -0.5 },
  board: { x: 5, z: 9.6, yaw: -0.35 },
  bakery: { x: -19.5, z: 30.5, yaw: Math.PI / 2 + 0.4 },
  photo: { x: -7, z: 19.5, yaw: 0.5 },
  truck: { x: 19.5, z: 21, yaw: -Math.PI / 2 },
  vending: { x: 20.6, z: 27, yaw: -Math.PI / 2 },
  deck: { x: 11, z: 35.65, yaw: 0 }, // 절벽 끝까지 (낚시 12장: 광장 끝 z 32.3 ~ 절벽 39)
};
// 탁구대: 사람 대결 1·2·3번 + 김제빵 (사용자 확정 11/25: 남쪽으로 옮김, 김제빵은 빵집 옆)
export const TABLE_SPOTS = [[-14, 13], [14, 13], [0, 25]];
export const KIM_SPOT = [-14, 27];
export const SPAWN = [0, 10.5];

// 그룹 안(로컬) 점 → 광장 점. three.js rotation.y = yaw 와 같은 돌림
export function toWorld(o, lx, lz) {
  const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
export function toLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [dx * c - dz * s, dx * s + dz * c];
}
// ── 바다 전망대 + 낚시터 (docs/dev/fishing.md 12장, 사용자 확정 11/25)
// 데크는 절벽 끝까지, 바다는 광장보다 6m 아래. 전망대 바로 밑에 넓은 나무 판(선착장) 하나, 데크 양옆(서·동) 넓고 가파른 돌계단으로 바로 내려감 (11/25 사용자: 계단 양쪽 + 그만큼 판 넓힘).
// 선착장 판·서는 곳은 서버(31_fish_pier_wide.sql)·rules.js STAND와 맞춰 둔 자리 — 옮기면 SQL도 같이.
export const SEA_Y = -6;
export const DECK = { x0: 4, x1: 18, z0: 32.3, z1: 39, h: 0.25 }; // 광장 좌표 네모 + 바닥 높이
export const CLIFF = { x0: -1.5, x1: 24, face: 39 }; // 절벽 벽 (광장 땅 끝 z = face)
export const PIER = { x0: 0.5, x1: 21.5, z0: 39, z1: 45.5, y: SEA_Y + 1.65 }; // 넓은 판 하나 (데크 가운데 x 11 기준 좌우 같게). y = 나무 판 윗면
// 돌계단 2개: 데크 서쪽 옆 · 동쪽 옆(x0~x1), 광장 끝(z0, 높이 0)에서 남쪽으로 곧게 → 선착장 판(z1, 높이 PIER.y)
export const STAIRS = [
  { side: 'west', x0: 0.5, x1: 3.7, z0: 39, z1: 43.5 },
  { side: 'east', x0: 18.3, x1: 21.5, z0: 39, z1: 43.5 },
];
export const PIER_STAIRS = STAIRS[1]; // (예전 이름: 동쪽 계단)
export const stairAt = (x, z) => STAIRS.find((S) => x > S.x0 && x <= S.x1 && z > S.z0 && z < S.z1);
export const stairY = (z, S = STAIRS[1]) => (PIER.y * Math.min(1, Math.max(0, (z - S.z0) / (S.z1 - S.z0))));
export const onPier = (x, z) => z > PIER.z0 && z < PIER.z1 + 0.5 && x > PIER.x0 - 0.5 && x < PIER.x1 + 0.5 && !STAIRS.some((S) => x > S.x0 && x <= S.x1 && z < S.z1);
// 서 있는 바닥 높이 (걷기·카메라·다른 사람 모습·바닥 클릭이 같이 씀 — 걷기 정보는 x, z만)
export function heightAt(x, z) {
  if (x > DECK.x0 && x < DECK.x1 && z > DECK.z0 && z < DECK.z1) return DECK.h;
  const S = stairAt(x, z);
  if (S) return stairY(z, S);
  if (z > PIER.z0 - 0.01 && x > PIER.x0 - 1) return PIER.y;
  return 0;
}
