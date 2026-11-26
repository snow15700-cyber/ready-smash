// 🎒 물고기 가방 · 🍣 횟집 · 📈 시세표 규칙 (docs/dev/fishing.md 14-6, 사용자 확정 11/26)
// 서버(supabase/35_fish_bag.sql)·로컬 가짜 서버(localServer.js)·화면이 같이 씀. three 없음(자동 점검이 Node에서 불러 서버와 비교).
// ⚠️ 여기를 바꾸면 35(또는 새 SQL)도 같이.
//  · 잡은 물고기는 가방(30칸)에. 코인은 횟집에서 팔 때. 잡동사니·전설 탁구채는 가방에 안 들어감(지금처럼)
//  · 시세는 쉬는 시간이 시작될 때마다 바뀜(BREAKS 시작 시각). 주말·수업 전은 지난 마지막 시세 그대로
//  · 일반 물고기 7종만 시세가 움직임: 하나는 🔥 오늘의 대박(2배), 나머지는 0.6~0.85배 → 평균 약 0.9배. 희귀 8 · 전설 20 그대로
//  · 값은 0.1코인 단위(시세표에 2.4처럼). 한 번 팔 때 합을 내림 → 하나씩 팔아도 이득 없음
import { SPECIES, FISH_COINS, seeded } from './rules.js';
import { BREAKS } from '../../breaks.js';

export const BAG_MAX = 30;
export const MARKET_FISH = SPECIES.filter((s) => s.grade === 'common').map((s) => s.id); // 7종 (rules.js 순서 = 서버 순서)
export const JACKPOT_X = 2, LOW_X = 0.6, SPAN_X = 0.25;
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
// 물고기 하나의 지금 값(0.1코인 단위)
export function priceOf(id, ms) {
  const sp = SPECIES.find((s) => s.id === id);
  if (!sp) return 0;
  if (sp.grade !== 'common') return FISH_COINS[sp.grade] * 10;
  return prices(period(ms)).list[id];
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
  for (const [id, n] of items) t10 += priceOf(id, ms) * n;
  const coins = Math.floor(t10 / 10);
  const bonus = breakPct ? Math.floor((coins * breakPct + 99) / 100) : 0;
  return { coins, bonus, total: coins + bonus };
}
export const bagCount = (bag) => bag.reduce((a, b) => a + b.n, 0);
// 고양이 밥(14-3): 가방에서 지금 가장 싼 것
export function cheapestIn(bag, ms) {
  let best = null;
  for (const b of bag) if (b.n > 0 && (!best || priceOf(b.id, ms) < priceOf(best.id, ms))) best = b;
  return best?.id || null;
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
