// 낚시 규칙 — 서버(supabase/28_fishing.sql)와 똑같아야 하는 것만 모음 (three 없이, 자동 점검이 Node에서 불러 서버와 비교)
//   던진 자리 · 기포 시간표 · 잡히는 것(종류·확률) · 크기 · 코인 · 최소 시간. fishing.md 8·9장
// ⚠️ 여기를 바꾸면 28_fishing.sql(또는 새 SQL)과 account.js의 로컬 가짜 서버도 같이.

// ── 선착장에서 던지기 (자유 던지기: 부채꼴 ±40°, 6~18m)
export const STAND = { z: 65.6, xMin: 8.4, xMax: 17.6 }; // 서는 곳 (끝 판 앞쪽)
export const CAST_MIN = 6, CAST_MAX = 18, CAST_ANG = 0.7;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const castDist = (power) => CAST_MIN + (CAST_MAX - CAST_MIN) * clamp(power, 0, 1);
export function landingPoint(standX, aim, power) {
  const d = castDist(power), a = -clamp(aim, -1, 1) * CAST_ANG;
  return { x: standX + Math.sin(a) * d, z: STAND.z + Math.cos(a) * d };
}

// ── 기포 시간표: 시간을 칸(210초)으로 나누고 칸 번호를 씨앗으로 1~2개 (모든 PC·서버가 같은 결과)
export const BUBBLE_LIFE = 40;
export const BUBBLE_SLOT = { normal: 210, often: 50 }; // often = 시안 시험용(서버는 normal만)
// 서버의 LCG와 같은 난수 (s·1664525 + 1013904223) mod 2³² — 곱이 2⁵³보다 작아서 JS 숫자로도 정확
export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function slotBubbles(n, len) {
  const r = seeded(91731 + n * 7919);
  const count = r() < 0.5 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const standX = STAND.xMin + r() * (STAND.xMax - STAND.xMin);
    const p = landingPoint(standX, r() * 2 - 1, 0.05 + r() * 0.9);
    const start = n * len + r() * Math.max(1, len - BUBBLE_LIFE - 2);
    out.push({ id: `${n}-${i}`, x: p.x, z: p.z, start, end: start + BUBBLE_LIFE });
  }
  return out;
}
// 지금 보이는 기포들 (fade: 나타날 때·사라질 때 2초 동안 서서히)
export function activeBubbles(nowSec, mode = 'normal') {
  const len = BUBBLE_SLOT[mode] || BUBBLE_SLOT.normal;
  const n = Math.floor(nowSec / len);
  const out = [];
  for (const k of [n - 1, n]) for (const b of slotBubbles(k, len)) {
    if (nowSec < b.start || nowSec > b.end) continue;
    out.push({ ...b, left: b.end - nowSec, fade: Math.min(1, (nowSec - b.start) / 2, (b.end - nowSec) / 2) });
  }
  return out;
}
// 떨어진 자리가 기포에 얼마나 가까운지: 2 = 바로 위(1.5m) · 1 = 근처(3.5m) · 0 = 아님
export function bubbleNear(x, z, list) {
  let best = 0;
  for (const b of list) { const d = Math.hypot(x - b.x, z - b.z); best = Math.max(best, d <= 1.5 ? 2 : d <= 3.5 ? 1 : 0); }
  return best;
}

// ── 잡히는 것 (fishing.md 9장, 11/25 사용자 확정): 물고기 17종 · 잡동사니 9개 · 1% 전설 탁구채
export const SPECIES = [
  ['mackerel', '고등어', 'common', '🐟'], ['horse', '전갱이', 'common', '🐟'], ['rockfish', '볼락', 'common', '🐟'], ['greenling', '노래미', 'common', '🐟'],
  ['flounder', '가자미', 'common', '🐟'], ['squid', '오징어', 'common', '🦑'], ['puffer', '복어', 'common', '🐡'],
  ['seabream', '참돔', 'rare', '🐠'], ['blackporgy', '감성돔', 'rare', '🐟'], ['rockcod', '우럭', 'rare', '🐟'], ['yellowtail', '방어', 'rare', '🐟'], ['octopus', '문어', 'rare', '🐙'],
  ['lattegoby', '라테 망둥어', 'rare', '☕', 'break'], ['moonhair', '달빛 갈치', 'rare', '🌙', 'night'], ['raindrop', '빗방울 숭어', 'rare', '🌧️', 'rain'],
  ['goldball', '황금 탁구공 물고기', 'legend', '🏓'], ['dragon', '경주 용왕 물고기', 'legend', '🌊'],
].map(([id, name, grade, emoji, cond]) => ({ kind: 'fish', id, name, grade, emoji, cond }));
export const JUNK = [
  ['stick', '나뭇가지', '🪵'], ['can', '빈 캔', '🥫'], ['boot', '장화', '👢'], ['bottle', '페트병', '🧴'], ['kelp', '해초', '🌿'],
  ['shell', '조개껍데기', '🐚'], ['oldball', '낡은 탁구공', '🏓'], ['brokenpaddle', '부러진 탁구채', '🏓'], ['baguette', '김제빵의 바게트', '🥖'],
].map(([id, name, emoji]) => ({ kind: 'junk', id, name, grade: 'common', emoji }));
export const CATCH = Object.fromEntries([...SPECIES, ...JUNK].map((c) => [c.id, c]));
// 전설 탁구채 7종 (items.js와 같은 id). 낚시 전용 '황금 물고기 탁구채'는 나중에(사용자 11/25)
export const LEGEND_PADDLES = [['paddle_pan', '프라이팬'], ['paddle_guitar', '통기타'], ['paddle_keyboard', '키보드'], ['paddle_mouse', '마우스'], ['paddle_phone', '스마트폰'], ['paddle_duck', '고무 오리'], ['paddle_hammer', '뿅망치']];
export const PADDLE_DUP_PIECES = 30; // 이미 가진 것이면 상점 조각 30개 (뽑기 전설 중복과 같음)
export const COND = { break: { icon: '☕', label: '쉬는 시간에만' }, night: { icon: '🌙', label: '밤에만' }, rain: { icon: '🌧️', label: '비 올 때만' } };
export const PADDLE_RATE = 0.01, JUNK_RATE = 0.13, COND_RATE = 0.4; // 잡동사니 = '일반'의 13%(전체 약 10%) · 조건 물고기 = 조건이 맞을 때 희귀의 40%
// 기포 가까이 떨어질수록 희귀·전설 ↑ (빗나가도 일반은 잡힘). [일반, 희귀, 전설] %, near 0·1·2
export const ODDS = [[72, 25, 3], [45, 43, 12], [25, 55, 20]];
export const isNight = (ms) => { const h = new Date(ms + 9 * 3600e3).getUTCHours(); return h >= 19 || h < 6; }; // 한국 시각 19~6시

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
// ctx: { cond: { break, night, rain }, owned: [가진 탁구채 id] }
export function rollCatch(near, ctx, rnd = Math.random) {
  if (rnd() < PADDLE_RATE) return paddleCatch(ctx.owned || [], rnd);
  const [c, r] = ODDS[near] || ODDS[0];
  const x = rnd() * 100;
  if (x < c) return rnd() < JUNK_RATE ? pick(JUNK, rnd) : pick(SPECIES.filter((s) => s.grade === 'common'), rnd);
  if (x < c + r) {
    const conds = SPECIES.filter((s) => s.cond && ctx.cond?.[s.cond]);
    if (conds.length && rnd() < COND_RATE) return pick(conds, rnd);
    return pick(SPECIES.filter((s) => s.grade === 'rare' && !s.cond), rnd);
  }
  return pick(SPECIES.filter((s) => s.grade === 'legend'), rnd);
}
// 아직 없는 전설 탁구채 중 하나, 다 있으면 아무거나 + 조각 30개 (사용자 확정 11/25). 리듬은 희귀처럼 두 단계
export function paddleCatch(owned, rnd = Math.random) {
  const left = LEGEND_PADDLES.filter(([id]) => !owned.includes(id));
  const [id, name] = pick(left.length ? left : LEGEND_PADDLES, rnd);
  return { kind: 'paddle', id, name, grade: 'rare', emoji: '🏓', dup: !left.length };
}

// ── 크기: 종류·등급 상관없이 모두 같은 범위 (사용자 확정 11/25), 큰 것은 드물게. 88cm 이상(상위 약 10%) = 🏆 월척
export const SIZE = [20, 100], BIG_CM = 88;
export function fishSize(rnd = Math.random) {
  const k = rnd() ** 1.6;
  return { cm: Math.round((SIZE[0] + (SIZE[1] - SIZE[0]) * k) * 10) / 10, k };
}
export const sizeK = (cm) => ((cm - SIZE[0]) / (SIZE[1] - SIZE[0])); // cm → 0~1 (모형 크기용)

// ── 코인 (사용자 확정 11/25): 일반 3 · 희귀 8 · 전설 20 · 잡동사니·탁구채 0. 쉬는 시간 +50%(세트 '휴가 중'이면 더)
export const FISH_COINS = { common: 3, rare: 8, legend: 20 };
// 속임수 막기: 던진 뒤 이만큼(초) 안 지나면 인정 안 함 (실제는 일반 약 12초 · 희귀 약 20초 · 전설 약 28초)
export const MIN_SEC = { junk: 4, common: 6, rare: 11, legend: 16 };
// 분당 상한: 1분에 25코인씩 쌓이는 주머니(최대 60)에서만 줄 수 있음 (쉬는 시간 보너스 포함)
export const COIN_PER_MIN = 25, COIN_POCKET = 60;
export const stageOfCatch = (c) => ['common', 'rare', 'legend'].indexOf(c.grade);
