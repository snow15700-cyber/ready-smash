// 🎒 물고기 가방 · 🍣 횟집 · 📈 시세표 규칙 (docs/dev/fishing.md 14-6, 사용자 확정 11/26)
// 서버(supabase/35_fish_bag.sql)·로컬 가짜 서버(localServer.js)·화면이 같이 씀. three 없음(자동 점검이 Node에서 불러 서버와 비교).
// ⚠️ 여기를 바꾸면 35·40(또는 새 SQL)도 같이.
//  · 잡은 물고기는 가방(30칸)에. 코인은 횟집에서 팔 때. 잡동사니·전설 탁구채는 가방에 안 들어감(지금처럼)
//  · 시세는 쉬는 시간이 시작될 때마다 바뀜(BREAKS 시작 시각). 주말·수업 전은 지난 마지막 시세 그대로
//  · 일반 물고기 7종만 시세가 움직임: 하나는 🔥 오늘의 대박(2배), 나머지는 0.6~0.85배 → 평균 약 0.9배. 희귀 20 · 전설 40 그대로(11/27, 전 8 · 20)
//  · 값은 0.1코인 단위(시세표에 2.4처럼). 한 번 팔 때 합을 내림 → 하나씩 팔아도 이득 없음
//  · ⭐ 품질 별(13-1 ①, 11/27 사용자 확정): 줄다리기 정확도(Perfect 1 · Good 0.5 · 놓침 0 ÷ 노트 수) 85%↑ ★★★ · 60%↑ ★★ · 35%↑ ★ · 그 아래 별 없음
//    → 값 × 1.3 · 1.1 · 1.0 · 0.8 (QUAL_X, 10배 정수). 가방은 종류 × 별(q 0~3)로 칸이 따로. 크기는 값과 상관없음. 서버 41_fish_quality.sql
//  · 하루 한도 DAY_CAP(한국 날짜, 11/27 사용자 확정): 팔아서 받는 코인은 하루 1000까지. 비싼 것부터 한도 안에서만 팔리고 나머지는 가방에 (sellPlan)
import { SPECIES, FISH_COINS, seeded } from './rules.js';
import { BREAKS } from '../../breaks.js';

export const BAG_MAX = 30;
export const DAY_CAP = 1000;
export const MARKET_FISH = SPECIES.filter((s) => s.grade === 'common').map((s) => s.id); // 7종 (rules.js 순서 = 서버 순서)
export const JACKPOT_X = 2, LOW_X = 0.6, SPAN_X = 0.25;
export const QUAL_X = [8, 10, 11, 13]; // 별 0~3개의 값 배율 × 10 (서버 41과 같게)
export const QUAL_DEF = 1; // 별 모르는 것(41 전에 잡은 것)은 ★ ×1.0
const qq = (q) => (q === 0 || q === 1 || q === 2 || q === 3 ? q : QUAL_DEF);
// 줄다리기 판정 수 → 별 0~3 (정수로 비교해 소수 오차 없음)
export function qualityOf(perfects, goods, misses) {
  const n = perfects + goods + misses;
  if (n <= 0) return QUAL_DEF;
  const a = (2 * perfects + goods) * 50; // 정확도 × 100 × n
  return a >= 85 * n ? 3 : a >= 60 * n ? 2 : a >= 35 * n ? 1 : 0;
}
export const stars = (q) => (q == null ? '' : '★'.repeat(qq(q)) + '☆'.repeat(3 - qq(q)));
const STARTS = BREAKS.map((b) => b[0]); // 쉬는 시간 시작(하루 분) 590 650 690 830 890 950 1010 1070
const KST = 9 * 3600e3, DAY = 86400e3;
const dowOf = (day) => (day + 4) % 7; // 1970-01-01 = 목요일(4) → 0 일 … 6 토
const prevWeekday = (day) => { do day--; while (dowOf(day) === 0 || dowOf(day) === 6); return day; };

// 지금 시세의 '회차' { day: 한국 날짜 번호(1970-01-01부터), idx: 그날 몇 번째 쉬는 시간(1~8) }
export function period(ms) {
  const day = Math.floor((ms + KST) / DAY), min = ((ms + KST) % DAY) / 60000;
  const dow = dowOf(day);
  if (dow >= 1 && dow <= 5 && min >= STARTS[0]) return { day, idx: STARTS.filter((s) => s <= min).length };
  return { day: prevWeekday(day), idx: STARTS.length };
}
export const prevPeriod = (p) => (p.idx > 1 ? { day: p.day, idx: p.idx - 1 } : { day: prevWeekday(p.day), idx: STARTS.length });
export const periodLabel = (p) => { const m = STARTS[p.idx - 1]; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

// 그 회차의 시세 { 물고기 id: 값(0.1코인 단위 정수, 예 24 = 2.4코인) } + jackpot(id)
export function prices(p) {
  const r = seeded(77003 + (p.day * 10 + p.idx) * 7919);
  const j = Math.floor(r() * MARKET_FISH.length);
  const out = {};
  MARKET_FISH.forEach((id, i) => {
    const m = LOW_X + r() * SPAN_X; // (대박이어도 하나 뽑음 — 서버와 순서를 같게)
    out[id] = Math.floor(FISH_COINS.common * 10 * (i === j ? JACKPOT_X : m) + 0.5);
  });
  return { list: out, jackpot: MARKET_FISH[j] };
}
// 물고기 하나의 지금 값(0.1코인 단위) — 별 q면 × 배율 후 반올림 (서버 pingpong__fish_qprice)
export function priceOf(id, ms, q = QUAL_DEF) {
  const sp = SPECIES.find((s) => s.id === id);
  if (!sp) return 0;
  const p = sp.grade !== 'common' ? FISH_COINS[sp.grade] * 10 : prices(period(ms)).list[id];
  return Math.floor((p * QUAL_X[qq(q)] + 5) / 10);
}
// 시세표 꺾은선: 지난 n회차(오래된 것부터) [{ p, list, jackpot }]
export function history(ms, n = 8) {
  const out = [];
  let p = period(ms);
  for (let i = 0; i < n; i++) { out.unshift({ p, ...prices(p) }); p = prevPeriod(p); }
  return out;
}
// 팔 때 코인: 합(0.1 단위)을 내림 + 쉬는 시간이면 +pct%(올림) — 서버 pingpong_fish_sell과 같게
export function sellCoins(items, ms, breakPct = 0) {
  let t10 = 0;
  for (const [id, n, q] of items) t10 += priceOf(id, ms, q) * n;
  const coins = Math.floor(t10 / 10);
  const bonus = breakPct ? Math.floor((coins * breakPct + 99) / 100) : 0;
  return { coins, bonus, total: coins + bonus };
}
// 한도 안에서 팔기 (서버 41 pingpong_fish_sell과 같게): 비싼 것부터(같은 값이면 id 순서, 그다음 별 많은 것), 남은 한도 left코인을 넘지 않게
// items = [[id, 마리, 별?]] → { sold: [[id, 마리, 값, 별]], coins, kept(한도 때문에 남긴 마리 수) }
export function sellPlan(items, ms, left = Infinity) {
  const rows = items.map(([id, n, q]) => [id, n, priceOf(id, ms, q), qq(q)]).filter((r) => r[1] > 0 && r[2] > 0)
    .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || b[3] - a[3]);
  const lim = Math.max(0, left) * 10, sold = [];
  let t10 = 0, kept = 0;
  for (const [id, n, p, q] of rows) {
    const k = Math.min(n, Math.floor((lim - t10) / p));
    if (k > 0) { sold.push([id, k, p, q]); t10 += k * p; }
    kept += n - Math.max(0, k);
  }
  return { sold, coins: Math.floor(t10 / 10), kept };
}
export const bagCount = (bag) => bag.reduce((a, b) => a + b.n, 0);
// 고양이 밥(14-3): 가방에서 지금 가장 싼 칸 { id, q, n } (같은 값이면 id 순서, 그다음 별 적은 것 — 서버 41 pingpong_cat_feed)
export function cheapestIn(bag, ms) {
  let best = null, bp = 0;
  for (const b of bag) {
    if (!(b.n > 0)) continue;
    const p = priceOf(b.id, ms, b.q);
    if (!best || p < bp || (p === bp && (b.id < best.id || (b.id === best.id && qq(b.q) < qq(best.q))))) { best = b; bp = p; }
  }
  return best;
}
// 다음 시세가 바뀌는 때 (시세표 아래 글자)
export function nextLabel(ms) {
  const p = period(ms), today = Math.floor((ms + KST) / DAY), dow = dowOf(today);
  const min = ((ms + KST) % DAY) / 60000;
  if (dow >= 1 && dow <= 5) {
    if (min < STARTS[0]) return `오늘 ${periodLabel({ idx: 1 })}`;
    if (p.day === today && p.idx < STARTS.length) return periodLabel({ idx: p.idx + 1 });
  }
  return dow === 5 || dow === 6 || dow === 0 ? `월요일 ${periodLabel({ idx: 1 })}` : `내일 ${periodLabel({ idx: 1 })}`;
}
