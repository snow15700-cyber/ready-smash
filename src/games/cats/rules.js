// 🐱 고양이 규칙 한곳 (docs/dev/cats.md 3a). three 없음 — 화면·로컬 가짜 서버가 같이 씀. 서버 37_cats.sql과 숫자를 맞춤
//  · 밥 = 고양이마다 1시간에 1마리(사용자 11/26) · 생선 1마리 = 1점 · 10점마다 ♥ 하나(♥5 = 50점) · 하트는 안 줄어듦
//  · 배회 = 서버 시각만으로 계산(기포처럼) → 모두에게 같은 자리, 네트워크 0
import { CAT_NOOK, MARKET, STAIRS, onWood } from '../../campusLayout.js';

export const CAT_IDS = ['cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese']; // models.js COATS와 같은 순서
export const CAT_NAME = { cheese: '치즈', mackerel: '고등어', calico: '삼색이', tuxedo: '턱시도', black: '까망이', siamese: '샴' };
export const FEED_GAP_MS = 3600e3;
export const PER_HEART = 10, MAX_HEART = 5;
export const heartOf = (pts) => Math.min(MAX_HEART, Math.floor((pts || 0) / PER_HEART));
// 다음 ♥까지 [지금 칸 안 점수, 칸 크기] (♥5면 [10, 10])
export const heartProgress = (pts) => (heartOf(pts) >= MAX_HEART ? [PER_HEART, PER_HEART] : [(pts || 0) % PER_HEART, PER_HEART]);
export const heartsText = (pts) => '♥'.repeat(heartOf(pts)) + '♡'.repeat(MAX_HEART - heartOf(pts));

// ── 배회: 쉬는 자리 그래프 (선착장 1b 'ㄷ자' 판 위) ──
// [x, z, 자세 후보] — nook = 쉼터 방석(조금 높음)
const C = CAT_NOOK;
export const CAT_SPOTS = [
  [C.x0 + 1.0, C.z0 + 1.2, 'nook'], [C.x0 + 2.4, C.z0 + 1.9, 'nook'], [C.x0 + 0.9, C.z0 + 2.7, 'nook'], // 방석 3
  [26.0, 45.2], [22.6, 45.0], [17.0, 44.8], [13.0, 45.7], [9.0, 44.6], [5.0, 45.6], [1.0, 45.5], [-4.3, 45.0], // 앞 판
  [-4.0, 49.5], [-4.0, 53.0], [-3.5, 56.6], // 서쪽 팔
  [26.0, 49.5], [26.0, 53.0], [25.5, 56.6], // 동쪽 팔
];
export const CUSHION_Y = 0.09; // 방석 위
const LINK_MAX = 9;
// 막히는 곳: 계단·횟집·칠판·쉼터 상자 더미(쉼터 동쪽 끝)
const blocked = (x, z) =>
  [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([dx, dz]) => !onWood(x + dx, z + dz)) ||
  STAIRS.some((S) => x > S.x0 - 0.3 && x < S.x1 + 0.3 && z < S.z1 + 0.3) ||
  (x > MARKET.x - MARKET.w / 2 - 0.3 && x < MARKET.x + MARKET.w / 2 + 0.3 && z < MARKET.z + MARKET.d / 2 + 0.3) ||
  (x > -1.4 && x < 0.7 && z > 43.4 && z < 44.4) ||
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
  return w < 0.3 ? Math.floor(h01(ci, k, 3) * 3) : Math.floor(h01(ci, k, 4) * N); // 30%는 쉼터 방석으로
}
// 그 시각 고양이 자리 { x, z, y(판 위 높이), yaw, pose: 'walk'|'sit'|'loaf'|'stand' }
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
    if (walked < d) { const f = walked / d; return { x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, y: 0, yaw, pose: 'walk' }; }
    walked -= d;
  }
  const s = CAT_SPOTS[b], o = off(s);
  const pose = s[2] ? (h01(ci, k, 9) < 0.6 ? 'loaf' : 'sit') : REST[Math.floor(h01(ci, k, 10) * REST.length)];
  if (pts.length === 1) yaw = (h01(ci, k, 11) - 0.5) * 2.4; // 제자리: 남쪽(바다) 쪽을 보며 앉음
  return { x: s[0] + o[0], z: s[1] + o[1], y: s[2] ? CUSHION_Y : 0, yaw, pose };
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
