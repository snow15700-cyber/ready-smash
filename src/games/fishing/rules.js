// 낚시 규칙 — 서버(supabase/28_fishing.sql)와 똑같아야 하는 것만 모음 (three 없이, 자동 점검이 Node에서 불러 서버와 비교)
//   던진 자리 · 기포 시간표 · 잡히는 것(종류·확률) · 크기 · 코인 · 최소 시간. fishing.md 8·9장
// ⚠️ 여기를 바꾸면 28_fishing.sql(또는 새 SQL)과 localServer.js의 로컬 가짜 서버도 같이.

// ── 선착장에서 던지기 (자유 던지기: 부채꼴 ±40°, 6~18m — 앞 판은 남쪽, 서쪽 팔은 서쪽, 동쪽 팔은 동쪽 바다로 · 13-3 🐞 고침)
// 14장 1b(11/26 사용자 확정): 'ㄷ자' 선착장 — 앞 판 + 양 끝 팔 2개. 나무 판 어디서든 던짐(36_fish_pier_u.sql과 같게).
//   찌가 나무 판(앞 판·팔·등대 받침) 위에 떨어지면 던진 방향 그대로 판을 넘어 물(판 끝 + 0.6m)까지 날아감.
export const WOOD = [ // campusLayout.js PIER·ARMS·LH_BASES와 같은 숫자 (서버 SQL에 그대로 적혀 있음)
  { x0: -6, x1: 28, z0: 39, z1: 46.5 }, // 앞 판
  { x0: -6, x1: -2, z0: 46.5, z1: 57.5 }, // 서쪽 팔
  { x0: 24, x1: 28, z0: 46.5, z1: 57.5 }, // 동쪽 팔
  { x0: -5.45, x1: -2.55, z0: 57.5, z1: 59.9 }, // 서쪽 등대 돌 받침 (팔 끝 바로 앞, 46번부터)
  { x0: 24.55, x1: 27.45, z0: 57.5, z1: 59.9 }, // 동쪽 등대 돌 받침
];
export const STANDS = [ // 서는 곳 (판 가장자리에서 조금 안쪽)
  { x0: -5.3, x1: 27.3, z0: 39.6, z1: 45.6 },
  { x0: -5.3, x1: -2.7, z0: 45.6, z1: 56.8 },
  { x0: 24.7, x1: 27.3, z0: 45.6, z1: 56.8 },
];
// 13-3 ⑤ 자리 = 장르 (11/27 사용자 확정, 같은 날 바꿈): 가운데 앞 판 🎷 재즈 · 서쪽 팔 🎻 발라드 · 동쪽 팔 🎸 록 (STANDS 순서와 같음)
export const STAND_GENRE = ['jazz', 'ballad', 'rock'];
export const GENRE_LABEL = { jazz: '🎷 재즈', rock: '🎸 록', ballad: '🎻 발라드' };
export function standGenre(x, z) {
  const [cx, cz] = clampStand(x, z);
  if (cz <= STANDS[0].z1 + 1e-6) return STAND_GENRE[0]; // 앞 판 (팔과 만나는 모서리 줄도 앞 판)
  return cx < (STANDS[0].x0 + STANDS[0].x1) / 2 ? STAND_GENRE[1] : STAND_GENRE[2];
}
export const STAND = { z: 45.6, xMin: -5.3, xMax: 27.3, zBack: 39.6 }; // 기포를 뽑는 줄(앞 판 앞쪽) · 예전 이름 그대로
export const CAST_MIN = 6, CAST_MAX = 18, CAST_ANG = 0.7, WOOD_PAD = 0.6;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const castDist = (power) => CAST_MIN + (CAST_MAX - CAST_MIN) * clamp(power, 0, 1);
// 서는 곳 안으로: 가장 가까운 서는 곳 네모로 (같은 거리면 앞 것)
export function clampStand(x, z) {
  x = Number.isFinite(x) ? x : 13; z = Number.isFinite(z) ? z : STAND.z;
  let best = null, bd = Infinity;
  for (const R of STANDS) {
    const cx = clamp(x, R.x0, R.x1), cz = clamp(z, R.z0, R.z1), d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd) { bd = d; best = [cx, cz]; }
  }
  return best;
}
// 'ㄷ자' 꼭짓점 (11/28 사용자 요청, 화면 전용 — 서버와 상관없음): 앞 판의 양 끝(팔과 만나는 곳)은 남쪽 앞이 팔(나무 판)이라 물이 없음
//   → 여기서는 '🎣 낚시하기' 버튼이 꺼지고, 앞 판에서 낚시 중 좌우로 걸어도 여기까지는 안 감
export const DRY_PAD = 0.3;
const FRONT_X = [WOOD[1].x1 + DRY_PAD, WOOD[2].x0 - DRY_PAD]; // 앞 판에서 낚시할 수 있는 x
export function dryCorner(x, z) {
  const [cx, cz] = clampStand(x, z);
  return cz <= STANDS[0].z1 + 1e-6 && (cx < FRONT_X[0] || cx > FRONT_X[1]);
}
// 낚시 중 좌우 걷기: 지금 서는 곳 네모 안에서만 (앞 판은 꼭짓점 빼고)
export function walkStand(x, z, dx) {
  const R = STANDS.find((q) => x >= q.x0 - 1e-6 && x <= q.x1 + 1e-6 && z >= q.z0 - 1e-6 && z <= q.z1 + 1e-6) || STANDS[0];
  return R === STANDS[0] ? clamp(x + dx, FRONT_X[0], FRONT_X[1]) : clamp(x + dx, R.x0, R.x1);
}
// 던지는 방향 (13-3 🐞 고침, 11/27 사용자 확정 · 45_fish_cast_dir.sql과 같게): 앞 판 = 남쪽(+z) · 서쪽 팔 = 서쪽 바다(−x) · 동쪽 팔 = 동쪽 바다(+x)
//   h = 방향 각도 (방향 = (sin h, cos h)). 자리 나누기는 standGenre와 같음
export function castHeading(x, z) {
  const [cx, cz] = clampStand(x, z);
  if (cz <= STANDS[0].z1 + 1e-6) return 0;
  return cx < (STANDS[0].x0 + STANDS[0].x1) / 2 ? -Math.PI / 2 : Math.PI / 2;
}
export const LAND_ZMIN = 43; // 팔에서 비스듬히 북쪽으로 던져도 절벽·땅(z 39 밑)에 안 떨어지게
// 팔에서 부채꼴의 북쪽(절벽 쪽) 반만 좁힘 (46: 전에는 z 43에서 잘라 부채꼴 끝이 한쪽만 꺾여 보였음) — 가장 멀리(18m) 던져도 z 43까지만
//   → 부채꼴 끝은 늘 둥근 원. 앞 판은 그대로 ±0.7
export function aimAngle(sx, sz, aim) {
  const h = castHeading(sx, sz), a = clamp(aim, -1, 1);
  if (!h) return -a * CAST_ANG;
  const north = Math.min(CAST_ANG, Math.asin(clamp((sz - LAND_ZMIN) / CAST_MAX, 0, 1)));
  const toNorth = h < 0 ? a > 0 : a < 0; // 서쪽을 보면 오른쪽(aim +)이 북쪽, 동쪽을 보면 왼쪽(aim −)
  return -a * (toNorth ? north : CAST_ANG);
}
// 찌가 떨어지는 곳: 판 위면 같은 방향으로 판 밖(+0.6m)까지 (최대 4번 — 앞 판 → 팔 → 물)
export function landingPoint(standX, aim, power, z = STAND.z) {
  const [sx, sz] = clampStand(standX, z ?? STAND.z);
  const h = castHeading(sx, sz);
  const d = castDist(power), a = h + aimAngle(sx, sz, aim), ux = Math.sin(a), uz = Math.cos(a);
  let x = sx + ux * d, lz = sz + uz * d;
  for (let i = 0; i < 4; i++) {
    const R = WOOD.find((q) => x > q.x0 - WOOD_PAD && x < q.x1 + WOOD_PAD && lz > q.z0 - WOOD_PAD && lz < q.z1 + WOOD_PAD);
    if (!R) break;
    let t = Infinity;
    if (uz > 1e-9) t = (R.z1 + WOOD_PAD - lz) / uz;
    else if (uz < -1e-9) t = (R.z0 - WOOD_PAD - lz) / uz;
    if (ux > 1e-9) t = Math.min(t, (R.x1 + WOOD_PAD - x) / ux);
    else if (ux < -1e-9) t = Math.min(t, (R.x0 - WOOD_PAD - x) / ux);
    x += ux * (t + 0.001); lz += uz * (t + 0.001);
  }
  return { x, z: Math.max(lz, LAND_ZMIN) };
}

// ── 기포 시간표: 시간을 칸(114초)으로 나누고 칸 번호를 씨앗으로 1~2개 (모든 PC·서버가 같은 결과)
// 11/25 사용자: 1.8~2분마다 1~2곳, 기포는 30초 → 칸 시작 + 0~6초에 나타남(칸끼리 108~120초 간격)
export const BUBBLE_LIFE = 30, BUBBLE_JITTER = 6;
export const BUBBLE_SLOT = { normal: 114, often: 50 }; // often = 시안 시험용(서버는 normal만)
// 서버의 LCG와 같은 난수 (s·1664525 + 1013904223) mod 2³² — 곱이 2⁵³보다 작아서 JS 숫자로도 정확. 식은 util.js에 하나만
import { seeded } from '../../util.js';
export { seeded };
// 13-3 🫧 (11/27 사용자 확정, 47_fish_bubbles_arms.sql): 기포마다 세 자리(앞 판 · 서쪽 팔 · 동쪽 팔) 중 하나를 같은 확률로 고르고,
//   그 자리 바다 쪽 가장자리에서 던진 자리 → 앞 판은 남쪽 바다, 팔은 바깥 바다(앞·옆) — 세 장르 모두 기포 기회가 같음
export const BUBBLE_EDGE = [ // [서는 곳 번호 = STANDS·STAND_GENRE 순서]: 던지는 가장자리 선
  { x0: STAND.xMin, x1: STAND.xMax, z0: STAND.z, z1: STAND.z }, // 앞 판 앞줄
  { x0: -5.3, x1: -5.3, z0: 46.5, z1: 56.8 }, // 서쪽 팔 바깥 줄
  { x0: 27.3, x1: 27.3, z0: 46.5, z1: 56.8 }, // 동쪽 팔 바깥 줄
];
export function slotBubbles(n, len) {
  const r = seeded(91731 + n * 7919);
  const count = r() < 0.5 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const k = Math.min(2, Math.floor(r() * 3)), E = BUBBLE_EDGE[k], u = r();
    const p = landingPoint(E.x0 + u * (E.x1 - E.x0), r() * 2 - 1, 0.05 + r() * 0.9, E.z0 + u * (E.z1 - E.z0));
    const start = n * len + r() * BUBBLE_JITTER;
    out.push({ id: `${n}-${i}`, x: p.x, z: p.z, start, end: start + BUBBLE_LIFE, genre: STAND_GENRE[k] });
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
// 다섯째 값 = 보통 크기(cm, 배율 1배일 때). 실제 크기 = 보통 크기 × 배율 (34_fish_luck.sql, fishing.md 13장)
export const SPECIES = [
  ['mackerel', '고등어', 'common', '🐟', 30], ['horse', '전갱이', 'common', '🐟', 25], ['rockfish', '볼락', 'common', '🐟', 20], ['greenling', '노래미', 'common', '🐟', 30],
  ['flounder', '가자미', 'common', '🐟', 30], ['squid', '오징어', 'common', '🦑', 30], ['puffer', '복어', 'common', '🐡', 25],
  ['seabream', '참돔', 'rare', '🐠', 50], ['blackporgy', '감성돔', 'rare', '🐟', 40], ['rockcod', '우럭', 'rare', '🐟', 40], ['yellowtail', '방어', 'rare', '🐟', 70], ['octopus', '문어', 'rare', '🐙', 60],
  ['lattegoby', '라테 망둥어', 'rare', '☕', 15, 'break'], ['moonhair', '달빛 갈치', 'rare', '🌙', 90, 'night'], ['raindrop', '빗방울 숭어', 'rare', '🌧️', 50, 'rain'],
  ['goldball', '황금 탁구공 물고기', 'legend', '🏓', 40], ['dragon', '경주 용왕 물고기', 'legend', '🌊', 150],
].map(([id, name, grade, emoji, base, cond]) => ({ kind: 'fish', id, name, grade, emoji, base, cond }));
// 13-3 ⑤ 3단계 (11/27 사용자 확정): 장르 구역 물고기 — 그 자리에서 '잘 나오는 물고기'. 전설 2종은 구역 없음(어디서나 같게)
//   = SQL 48 pingpong_fish.genre. 시세 성격(록 크게 출렁 · 재즈 보통 · 발라드 잔잔)도 이 장르로(market.js GENRE_SWING)
export const ZONE = {
  jazz: ['rockfish', 'greenling', 'blackporgy', 'octopus', 'moonhair', 'lattegoby'],
  rock: ['mackerel', 'squid', 'puffer', 'yellowtail', 'rockcod'],
  ballad: ['horse', 'flounder', 'seabream', 'raindrop'],
};
for (const [g, ids] of Object.entries(ZONE)) for (const id of ids) SPECIES.find((s) => s.id === id).genre = g;
export const ZONE_RATE = 0.7; // 등급을 먼저 뽑고, 그 안에서 내 자리 장르 물고기가 70%
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
// 13-3 ⑤: 고를 물고기 중 내 장르 것이 있고 다른 것도 있으면 70%로 내 장르 쪽, 아니면 그냥 아무거나 (SQL 48과 같은 규칙)
function pickZone(arr, genre, rnd) {
  const mine = arr.filter((s) => s.genre === genre), other = arr.filter((s) => s.genre !== genre);
  if (!mine.length || !other.length) return pick(arr, rnd);
  return rnd() < ZONE_RATE ? pick(mine, rnd) : pick(other, rnd);
}
// ctx: { cond: { break, night, rain }, owned: [가진 탁구채 id], genre: 선 자리 장르(standGenre, 없으면 구역 없음) }
export function rollCatch(near, ctx, rnd = Math.random) {
  if (rnd() < PADDLE_RATE) return paddleCatch(ctx.owned || [], rnd);
  const [c, r] = ODDS[near] || ODDS[0];
  const x = rnd() * 100, g = ctx.genre;
  if (x < c) return rnd() < JUNK_RATE ? pick(JUNK, rnd) : pickZone(SPECIES.filter((s) => s.grade === 'common'), g, rnd);
  if (x < c + r) {
    const conds = SPECIES.filter((s) => s.cond && ctx.cond?.[s.cond]);
    if (conds.length && rnd() < COND_RATE) return pickZone(conds, g, rnd);
    return pickZone(SPECIES.filter((s) => s.grade === 'rare' && !s.cond), g, rnd);
  }
  return pick(SPECIES.filter((s) => s.grade === 'legend'), rnd);
}
// 아직 없는 전설 탁구채 중 하나, 다 있으면 아무거나 + 조각 30개 (사용자 확정 11/25). 리듬은 희귀처럼 두 단계
export function paddleCatch(owned, rnd = Math.random) {
  const left = LEGEND_PADDLES.filter(([id]) => !owned.includes(id));
  const [id, name] = pick(left.length ? left : LEGEND_PADDLES, rnd);
  return { kind: 'paddle', id, name, grade: 'rare', emoji: '🏓', dup: !left.length };
}

// ── 크기 = 물고기마다 '보통 크기' × 배율 (사용자 확정 11/26, fishing.md 13장)
//   배율은 '크기 점수' s로 정함: s = cmOf(u) — 예전(11장) 모든 물고기 공통 크기 식 그대로(85까지 20 + 80·u^1.6, 그 위 파레토 긴 꼬리).
//   배율 = s ÷ 50 (s 50 = 보통 1배). 월척·대물·괴물·월척 랭킹·업적은 s로 판정 → 어떤 물고기든 공평.
//   어림(주사위 1번): s 88↑ 약 8% · 110↑ 약 0.9% · 150↑ 약 0.1% · 200↑ 약 0.02%
export const SIZE_MIN = 20, BIG_CM = 88, X_BASE = 50;
export const TAIL = { from: 85, s: 22.5, a: 3.48, cap: 999 };
const U_TAIL = ((TAIL.from - SIZE_MIN) / 80) ** (1 / 1.6);
export function cmOf(u) {
  const base = SIZE_MIN + 80 * u ** 1.6;
  if (base <= TAIL.from) return base;
  const q = (u - U_TAIL) / (1 - U_TAIL);
  return Math.min(TAIL.cap, TAIL.from + TAIL.s * ((1 - q) ** (-1 / TAIL.a) - 1));
}
export const round1 = (x) => Math.round(x * 10) / 10;
// 점수 s(소수 한 자리) → 그 물고기의 cm (서버: round(s × 보통 크기 / 50, 1)). 정수로 계산해서 서버와 반올림이 같게
export const cmOfScore = (id, s) => Math.round((Math.round(s * 10) * (CATCH[id]?.base || X_BASE)) / X_BASE) / 10;
export const scoreOfCm = (id, cm) => round1((cm * X_BASE) / (CATCH[id]?.base || X_BASE)); // 도감 최고 cm → 대략의 점수(등급 아이콘용)
export const timesOf = (s) => round1(s / X_BASE); // 배율 (보통의 ○배)

// ── 행운 주사위 (사용자 확정 11/26, fishing.md 13장): 크기 난수를 여러 번 뽑아 가장 큰 것. 화면에는 안 보여 줌
//   초보자: 처음 잡는 물고기 10마리 = 3번 · 오늘(한국 날짜) 첫 3번 물고기 = 2번 · 그 밖 1번
//   + 바다 술렁임: 이번 주 1등 기록이 하루 안 깨질 때마다 +1 (최대 +4, 깨지면 0 · 이번 주 기록에만)
export const LUCK = { beginner: 10, beginnerDice: 3, day: 3, dayDice: 2, stormMax: 4 };
export function luckDice({ caught = 0, dayN = 0, recordDays = 0 } = {}) {
  const base = caught < LUCK.beginner ? LUCK.beginnerDice : dayN < LUCK.day ? LUCK.dayDice : 1;
  return base + Math.min(LUCK.stormMax, Math.max(0, Math.floor(recordDays)));
}
export function luckyU(dice, rnd = Math.random) {
  let u = 0;
  for (let i = 0; i < Math.max(1, dice); i++) u = Math.max(u, rnd());
  return u;
}
// 크기 뽑기: { cm, s(점수) }. id 없으면(시안) 보통 크기 50
export function fishSize(id, dice = 1, rnd = Math.random) {
  const s = round1(cmOf(luckyU(dice, rnd)));
  return { cm: cmOfScore(id, s), s };
}
// 크기 등급 (도장·컷인·결과 카드) — 점수 s로: 🏆 월척 88(1.76배) · 🐋 대물 110(2.2배) · 👑 괴물 150(3배)
export const SIZE_TIERS = [
  { id: 'monster', min: 150, icon: '👑', label: '괴물', color: '#ff5a7a' },
  { id: 'huge', min: 110, icon: '🐋', label: '대물', color: '#5ad1ff' },
  { id: 'big', min: BIG_CM, icon: '🏆', label: '월척', color: '#ffc21a' },
];
export const sizeTier = (s) => SIZE_TIERS.find((t) => s >= t.min) || null;
// 모형 크기(배, 점수 s로): 20 0.55 · 46 약 0.95 · 88 약 1.6 · 150 2.5 · 200 3.25 · 최대 5
export const modelScale = (s) => Math.min(5, 0.55 + (s - SIZE_MIN) * 0.015);

// ── 코인 (사용자 확정 11/25): 일반 3 · 희귀 8 · 전설 20 · 잡동사니·탁구채 0. 쉬는 시간 +50%(세트 '휴가 중'이면 더)
export const FISH_COINS = { common: 5, rare: 20, legend: 40 }; // 팔 때 기본 값 (11/27 사용자 확정, 전: 3 · 8 · 20). 일반은 시세 0.6~2배 — 바꾸면 SQL(40)도
// 속임수 막기: 던진 뒤 이만큼(초) 안 지나면 인정 안 함 (실제는 일반 약 12초 · 희귀 약 20초 · 전설 약 28초)
export const MIN_SEC = { junk: 4, common: 6, rare: 11, legend: 16 };
// 분당 상한: 1분에 25코인씩 쌓이는 주머니(최대 60)에서만 줄 수 있음 (쉬는 시간 보너스 포함)
export const COIN_PER_MIN = 25, COIN_POCKET = 60;
