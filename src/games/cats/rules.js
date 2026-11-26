// 🐱 고양이 규칙 한곳 (docs/dev/cats.md 3a). three 없음 — 화면·로컬 가짜 서버가 같이 씀. 서버 37_cats.sql과 숫자를 맞춤
//  · 밥 = 고양이마다 1시간에 1마리(사용자 11/26) · 생선 1마리 = 1점 · 10점마다 ♥ 하나(♥5 = 50점) · 하트는 안 줄어듦
//  · 배회 = 서버 시각만으로 계산(기포처럼) → 모두에게 같은 자리, 네트워크 0
import { BOARD, CAT_NOOK, MARKET, SPOTS, STAIRS, heightAt, onWood } from '../../campusLayout.js';

export const CAT_IDS = ['cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese']; // models.js COATS와 같은 순서
export const CAT_NAME = { cheese: '치즈', mackerel: '고등어', calico: '삼색이', tuxedo: '턱시도', black: '까망이', siamese: '샴' };
export const FEED_GAP_MS = 3600e3;
export const PER_HEART = 10, MAX_HEART = 5;
export const heartOf = (pts) => Math.min(MAX_HEART, Math.floor((pts || 0) / PER_HEART));
// 다음 ♥까지 [지금 칸 안 점수, 칸 크기] (♥5면 [10, 10])
export const heartProgress = (pts) => (heartOf(pts) >= MAX_HEART ? [PER_HEART, PER_HEART] : [(pts || 0) % PER_HEART, PER_HEART]);
// 옷 (14-4): 하트로만 열림, 그 고양이 것. 3c는 bell·ribbon만 모양이 있음(나머지는 4·5단계) — 서버 38_cat_wear.sql과 같은 칸·하트
export const OUTFITS = [
  { slot: 'bell', heart: 1, icon: '🔔', name: '방울 목걸이' },
  { slot: 'ribbon', heart: 2, icon: '🎀', name: '리본' },
  { slot: 'hat', heart: 3, icon: '🎩', name: '모자', later: true },
  { slot: 'coat', heart: 4, icon: '🧥', name: '옷', later: true },
  { slot: 'set', heart: 5, icon: '✨', name: '전용 세트', later: true },
];
export const canWear = (pts, slot) => { const o = OUTFITS.find((x) => x.slot === slot); return !!o && heartOf(pts) >= o.heart; };
export const heartsText = (pts) => '♥'.repeat(heartOf(pts)) + '♡'.repeat(MAX_HEART - heartOf(pts));

// ── 배회: 쉬는 자리 그래프 (선착장 1b 'ㄷ자' 판 위 + 두 계단 위 풀밭 + 횟집 앞 — 11/26 사용자: 활동 범위 넓히기) ──
// [x, z, 자세 후보] — nook = 쉼터 방석(조금 높음)
const C = CAT_NOOK;
const SW = STAIRS[0], SE = STAIRS[1], mid = (S) => (S.x0 + S.x1) / 2;
export const CAT_SPOTS = [
  [C.x0 + 1.0, C.z0 + 1.2, 'nook'], [C.x0 + 2.4, C.z0 + 1.9, 'nook'], [C.x0 + 0.9, C.z0 + 2.7, 'nook'], // 방석 3
  [26.0, 45.2], [22.6, 45.0], [17.0, 44.8], [13.0, 45.7], [9.0, 44.6], [5.0, 45.6], [1.0, 45.5], [-4.3, 45.0], // 앞 판
  [-4.0, 49.5], [-4.0, 53.0], [-3.5, 56.6], // 서쪽 팔
  [26.0, 49.5], [26.0, 53.0], [25.5, 56.6], // 동쪽 팔
  [mid(SE), SE.z1 + 0.7], [mid(SE) + 0.3, 37.6], [mid(SE), 33.6], // 동쪽 계단 아래 · 계단 위 풀밭 2
  [mid(SW), SW.z1 + 0.7], [mid(SW) + 0.6, 37.8], [mid(SW) + 0.6, 33.4], // 서쪽 계단 아래 · 계단 위 풀밭 2 (게시판 옆)
  [-5.2, 43.6], [-3.1, 44.1], [1.8, 44.2], // 횟집 앞 (문 앞 · 서쪽 끝 · 칠판 건너)
];
export const CUSHION_Y = 0.09; // 방석 위
const LINK_MAX = 9;
// 고양이가 걷는 바닥: 나무 판(계단 옆구리는 빼고) + 계단 가운데 줄(손잡이 안쪽) + 계단 위 풀밭(데크 옆)
const STAIR_TOP_Z = 32.8;
const inStairLane = (x, z) => STAIRS.some((S) => x > S.x0 + 0.3 && x < S.x1 - 0.3 && z > STAIR_TOP_Z && z < S.z1 + 0.6);
const catGround = (x, z) => inStairLane(x, z) || (onWood(x, z) && !STAIRS.some((S) => x > S.x0 - 0.3 && x < S.x1 + 0.3 && z < S.z1 + 0.3));
// 낚시 게시판(서쪽 계단 위 풀밭, 데크 쪽을 봄) 자리
const FB = SPOTS.fishBoard;
// 막히는 곳: 계단 옆구리·횟집·칠판·쉼터 상자 더미(쉼터 동쪽 끝)·낚시 게시판
const blocked = (x, z) =>
  [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([dx, dz]) => !catGround(x + dx, z + dz)) ||
  (x < FB.x + 0.75 && z > FB.z - 2.1 && z < FB.z + 2.1) ||
  (x > MARKET.x - MARKET.w / 2 - 0.3 && x < MARKET.x + MARKET.w / 2 + 0.3 && z < MARKET.z + MARKET.d / 2 + 0.3) ||
  (x > BOARD.x - BOARD.w / 2 - 0.3 && x < BOARD.x + BOARD.w / 2 + 0.3 && z > 43.4 && z < 44.4) ||
  (x > C.x1 - 1.6 && z < C.z0 + 1.6);
function clear(a, b) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 0.25);
  for (let i = 1; i < n; i++) { const t = i / n; if (blocked(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false; }
  return true;
}
// 모든 자리 사이 가장 짧은 길 (Floyd, 처음 한 번)
const N = CAT_SPOTS.length;
const dist = [], nxt = [];
for (let i = 0; i < N; i++) {
  dist.push([]); nxt.push([]);
  for (let j = 0; j < N; j++) {
    const a = CAT_SPOTS[i], b = CAT_SPOTS[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const ok = i === j || (d <= LINK_MAX && clear(a, b));
    dist[i].push(i === j ? 0 : ok ? d : Infinity); nxt[i].push(ok ? j : -1);
  }
}
for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++)
  if (dist[i][k] + dist[k][j] < dist[i][j]) { dist[i][j] = dist[i][k] + dist[k][j]; nxt[i][j] = nxt[i][k]; }
export const catPathOk = () => dist.every((r) => r.every(Number.isFinite)); // 점검용: 모든 자리가 이어짐
function route(i, j) {
  const out = [i];
  while (i !== j && out.length < N + 1) { i = nxt[i][j]; out.push(i); }
  return out;
}

// 정수 해시 → 0~1 (같은 입력 → 같은 값, 어느 PC에서나)
function h01(a, b, c) {
  let x = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0; x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
const SLOT_MS = 75e3, SPEED = 0.85; // 한 칸 75초: 걸어가서(최대 약 55초) 나머지는 쉼
const REST = ['sit', 'loaf', 'stand', 'sit', 'loaf'];
function target(ci, k, depth = 0) {
  if (depth < 12 && h01(ci, k, 1) < 0.45) return target(ci, k - 1, depth + 1); // 45%는 그 자리에 그대로
  const w = h01(ci, k, 2);
  return w < 0.2 ? Math.floor(h01(ci, k, 3) * 3) : Math.floor(h01(ci, k, 4) * N); // 20%는 쉼터 방석으로 (나머지는 계단 위·횟집 앞까지 어디든)
}
// 그 시각 고양이 자리 { x, z, y(바닥 높이 — 광장 0 · 계단 · 판), yaw, pose: 'walk'|'sit'|'loaf'|'stand' }
export function catAt(id, ms) {
  const ci = Math.max(0, CAT_IDS.indexOf(id));
  const t = ms + ci * 13e3, k = Math.floor(t / SLOT_MS), into = (t - k * SLOT_MS) / 1000;
  const a = target(ci, k - 1), b = target(ci, k);
  const pts = route(a, b).map((i) => CAT_SPOTS[i]);
  // 같은 자리에 여러 마리가 겹치지 않게 고양이마다 조금 비켜 앉음
  const off = (s) => (s[2] ? [0, 0] : [(h01(ci, 7, 5) - 0.5) * 0.9, (h01(ci, 7, 6) - 0.5) * 0.7]);
  let walked = into * SPEED, yaw = (h01(ci, k, 8) - 0.5) * 2.4;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], o0 = off(p), o1 = off(q);
    const x0 = p[0] + o0[0], z0 = p[1] + o0[1], x1 = q[0] + o1[0], z1 = q[1] + o1[1];
    const d = Math.hypot(x1 - x0, z1 - z0);
    yaw = Math.atan2(x1 - x0, z1 - z0);
    if (walked < d) { const f = walked / d, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f; return { x, z, y: heightAt(x, z), yaw, pose: 'walk' }; }
    walked -= d;
  }
  const s = CAT_SPOTS[b], o = off(s);
  const pose = s[2] ? (h01(ci, k, 9) < 0.6 ? 'loaf' : 'sit') : REST[Math.floor(h01(ci, k, 10) * REST.length)];
  if (pts.length === 1) yaw = (h01(ci, k, 11) - 0.5) * 2.4; // 제자리: 남쪽(바다) 쪽을 보며 앉음
  const x = s[0] + o[0], z = s[1] + o[1];
  return { x, z, y: heightAt(x, z) + (s[2] ? CUSHION_Y : 0), yaw, pose };
}

// 3b: 고양이가 사람에게 다가가거나 돌아갈 길 [[x, z], ...] — 가장 가까운(막힘 없이 갈 수 있는) 쉬는 자리를 거쳐 그래프로
// 양 끝에서 막힘 없이 갈 수 있는 자리 중 (끝까지 거리 + 그래프 길이)가 가장 짧은 짝
const reach = (p) => { const ok = []; for (let i = 0; i < N; i++) if (clear(p, CAT_SPOTS[i])) ok.push(i); return ok.length ? ok : [...Array(N).keys()]; };
const gap = (p, i) => Math.hypot(CAT_SPOTS[i][0] - p[0], CAT_SPOTS[i][1] - p[1]);
export function catPath(from, to) {
  if (clear(from, to)) return [from, to];
  let best = null, bd = Infinity;
  const B = reach(to);
  for (const a of reach(from)) for (const b of B) { const d = gap(from, a) + dist[a][b] + gap(to, b); if (d < bd) { bd = d; best = [a, b]; } }
  return [from, ...route(best[0], best[1]).map((i) => [CAT_SPOTS[i][0], CAT_SPOTS[i][1]]), to];
}
export const catCanStand = (x, z) => !blocked(x, z);
