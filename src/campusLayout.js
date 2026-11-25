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
  deck: { x: 13, z: 33.3, yaw: 0 },
};
// 탁구대: 사람 대결 1·2·3번 + 김제빵 (사용자 확정 11/25: 남쪽으로 옮김, 김제빵은 빵집 옆)
export const TABLE_SPOTS = [[-14, 13], [14, 13], [0, 25]];
export const KIM_SPOT = [-14, 27];
export const SPAWN = [0, 10.5];
// 바다 전망대 나무 데크 (사용자 요청 11/25: 올라갈 수 있게): 광장 좌표 네모 + 바닥 높이
export const DECK = { x0: 6, x1: 20, z0: 31.05, z1: 35.5, h: 0.25 };
export const heightAt = (x, z) => (x > DECK.x0 && x < DECK.x1 && z > DECK.z0 && z < DECK.z1 ? DECK.h : 0);
// 그룹 안(로컬) 점 → 광장 점. three.js rotation.y = yaw 와 같은 돌림
export function toWorld(o, lx, lz) {
  const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
}
export function toLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0);
  return [dx * c - dz * s, dx * s + dz * c];
}
