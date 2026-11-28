// 🎒 물고기 가방 · 🍣 횟집 · 📈 시세표 규칙 (docs/dev/fishing.md 14-6, 사용자 확정 11/26)
// 서버(supabase/35_fish_bag.sql)·로컬 가짜 서버(localServer.js)·화면이 같이 씀. three 없음(자동 점검이 Node에서 불러 서버와 비교).
// ⚠️ 여기를 바꾸면 35·40(또는 새 SQL)도 같이.
//  · 잡은 물고기는 가방(30칸)에. 코인은 횟집에서 팔 때. 잡동사니·전설 탁구채는 가방에 안 들어감(지금처럼)
//  · 시세는 쉬는 시간이 시작될 때마다 바뀜(BREAKS 시작 시각). 주말·수업 전은 지난 마지막 시세 그대로
//  · 일반 물고기 7종: 하나는 🔥 오늘의 대박(2배), 나머지는 0.6~0.85배 → 평균 약 0.9배
//  · 희귀·전설도 오르내림(13-1 ②, 11/27 사용자 확정 '중간'): 희귀 20 × 0.8~1.2(16~24) · 전설 40 × 0.5~1.5(20~60), 종류마다 따로, 평균은 그대로.
//    🔥 대박은 일반 7종에서만.
//  · 📰 소식(13-1 ④, 11/27 사용자 확정): 회차마다 소식 1개 → 물고기 하나 값 ×1.3 또는 ×0.7 (오름·내림 반반). 대구 진짜 날씨와 엮음:
//    그 회차에 처음 시세를 본 브라우저가 지금 날씨를 서버에 알려 줌(pingpong_fish_news, 회차마다 한 번만 저장) → 날씨 소식 반 · 보통 소식 반.
//    날씨를 아직 모르면 보통 소식만. 대박 물고기를 건드리는 소식은 빼고 뽑음. 서버 43_fish_news.sql 씨앗은 따로(88001 + 회차 × 7919를 xorshift 두 번 — 일반 시세는 그대로 두고, 회차끼리 무늬가 안 생기게). 서버 42_fish_price_all.sql
//  · 값은 0.1코인 단위(시세표에 2.4처럼). 한 번 팔 때 합을 내림 → 하나씩 팔아도 이득 없음
//  · ⭐ 품질 별(13-1 ①, 11/27 사용자 확정): 줄다리기 정확도(Perfect 1 · Good 0.5 · 놓침 0 ÷ 노트 수) 90%↑ ★★★ · 75%↑ ★★ · 50%↑ ★ · 그 아래 별 없음
//    → 값 × 1.3 · 1.1 · 1.0 · 0.8 (QUAL_X, 10배 정수). 가방은 종류 × 별(q 0~3)로 칸이 따로. 크기는 값과 상관없음. 서버 41_fish_quality.sql
//  · 🛒 사람들이 판 만큼(13-1 ③, 11/27 사용자 확정 '중간' · 실시간 표시 안 함): 지난 회차에 횟집에서 팔린 마리 수(팔기 + 꽉 찬 가방, 고양이 밥은 빼고)로
//    이번 회차 값이 움직임. 전체 DEMAND_MIN(10)마리 이상 팔렸을 때만: 2명 이상이 판 물고기 중 가장 많이 팔린 1등 ×0.8 · 2등 ×0.9 · 일반 물고기 중 하나도 안 팔린 것 ×1.1
//    (같은 수면 id 순서). 서버 44_fish_demand.sql이 회차별 팔린 수를 알려 줌(pingpong_fish_news의 sold — 지난 회차만, 지금 회차는 안 보여 줌) → setSold
//  · 하루 한도 DAY_CAP(한국 날짜, 11/27 사용자 확정): 팔아서 받는 코인은 하루 1000까지. 비싼 것부터 한도 안에서만 팔리고 나머지는 가방에 (sellPlan)
import { SPECIES, FISH_COINS, seeded } from './rules.js';
import { BREAKS } from '../../breaks.js';

export const BAG_MAX = 30;
export const DAY_CAP = 1000;
export const MARKET_FISH = SPECIES.filter((s) => s.grade === 'common').map((s) => s.id); // 7종 (rules.js 순서 = 서버 순서)
export const JACKPOT_X = 2, LOW_X = 0.6, SPAN_X = 0.25;
export const BIG_FISH = SPECIES.filter((s) => s.grade !== 'common').map((s) => s.id); // 희귀 8 + 전설 2 (rules.js 순서 = 서버 42 순서)
export const BIG_SWING = { rare: [0.8, 0.4], legend: [0.5, 1.0] }; // [가장 낮은 배율, 폭] — 희귀 0.8~1.2 · 전설 0.5~1.5 (희귀는 아래 장르별이 먼저)
// 13-3 ⑤ 장르별 시세 성격 (11/27 사용자 확정, 서버 48): 물고기의 장르(rules.js ZONE)로 [가장 낮은 배율, 폭]. 평균은 장르끼리 같음
//   🎸 록 크게 출렁(일반 0.4~1.05 · 희귀 ±30%) · 🎷 재즈 지금 그대로(0.6~0.85 · ±20%) · 🎻 발라드 잔잔(0.675~0.775 · ±10%). 전설은 장르 없음(±50%)
//   난수를 뽑는 순서는 그대로 — 재즈 물고기 값은 전과 똑같고, 나머지는 같은 난수를 넓히거나 좁힘
export const GENRE_SWING = {
  rock: { common: [0.4, 0.65], rare: [0.7, 0.6] },
  jazz: { common: [LOW_X, SPAN_X], rare: [0.8, 0.4] },
  ballad: { common: [0.675, 0.1], rare: [0.9, 0.2] },
};
export const swingOf = (id) => { const sp = SPECIES.find((s) => s.id === id); return GENRE_SWING[sp?.genre]?.[sp.grade] || (sp?.grade === 'common' ? [LOW_X, SPAN_X] : BIG_SWING[sp?.grade]); };
// 📰 소식 목록 — [날씨(null = 보통), 물고기, 1 오름 / -1 내림, 글] (순서 = 서버 43). 날씨마다 오름 2 · 내림 2, 보통은 5 · 5
export const NEWS_X = { 1: 13, '-1': 7 }; // ×10
export const WXS = ['clear', 'cloudy', 'rain', 'snow'];
export const NEWS = [
  ['clear', 'squid', 1, '☀️ 맑은 날 오징어 말리기 딱! 오징어 값 상승'],
  ['clear', 'mackerel', -1, '☀️ 날이 좋아 고등어가 많이 잡혀요 — 고등어 값 하락'],
  ['clear', 'yellowtail', 1, '☀️ 바다 소풍 날씨 — 방어회 인기! 방어 값 상승'],
  ['clear', 'horse', -1, '☀️ 전갱이 풍년이에요 — 전갱이 값 하락'],
  ['cloudy', 'moonhair', 1, '☁️ 구름에 달이 가려 달빛 갈치가 귀해요 — 달빛 갈치 값 상승'],
  ['cloudy', 'rockfish', -1, '☁️ 흐린 날 볼락이 잘 물어요 — 볼락 값 하락'],
  ['cloudy', 'octopus', 1, '☁️ 흐린 날엔 문어숙회! 문어 값 상승'],
  ['cloudy', 'greenling', -1, '☁️ 노래미가 많이 들어왔어요 — 노래미 값 하락'],
  ['rain', 'raindrop', 1, '🌧️ 비가 와서 빗방울 숭어 값 상승!'],
  ['rain', 'mackerel', -1, '🌧️ 비 오는 날엔 고등어구이 손님이 뚝 — 고등어 값 하락'],
  ['rain', 'puffer', 1, '🌧️ 비 오는 날엔 따끈한 복국! 복어 값 상승'],
  ['rain', 'flounder', -1, '🌧️ 비 때문에 가자미 손님이 줄었어요 — 가자미 값 하락'],
  ['snow', 'yellowtail', 1, '❄️ 눈 오는 날엔 방어회! 방어 값 상승'],
  ['snow', 'squid', -1, '❄️ 눈 때문에 오징어 손님이 뚝 — 오징어 값 하락'],
  ['snow', 'lattegoby', 1, '❄️ 추운 날 따뜻한 라테 생각 — 라테 망둥어 값 상승'],
  ['snow', 'flounder', -1, '❄️ 가자미가 많이 들어왔어요 — 가자미 값 하락'],
  [null, 'seabream', 1, '🎉 단체 손님 예약! 참돔 값 상승'],
  [null, 'octopus', 1, '📺 TV에 문어 요리가 나왔어요! 문어 값 상승'],
  [null, 'rockcod', 1, '🍲 우럭 매운탕이 인기예요! 우럭 값 상승'],
  [null, 'goldball', 1, '🏓 탁구 대회 시즌! 황금 탁구공 물고기 값 상승'],
  [null, 'greenling', 1, '🧑‍🍳 사장님 추천 노래미 조림! 노래미 값 상승'],
  [null, 'blackporgy', -1, '🎣 감성돔 낚시 대회 — 감성돔이 많이 들어와 값 하락'],
  [null, 'puffer', -1, '⚠️ 복어 손질 요리사가 휴가 — 복어 값 하락'],
  [null, 'dragon', -1, '🌊 용왕님이 쉬는 날 — 경주 용왕 물고기 값 하락'],
  [null, 'rockfish', -1, '🐟 볼락 떼가 몰려왔어요 — 볼락 값 하락'],
  [null, 'lattegoby', -1, '☕ 바닷가 카페 쉬는 날 — 라테 망둥어 값 하락'],
].map(([wx, id, dir, text]) => ({ wx, id, dir, text }));
// 회차마다 저장된 날씨 (서버 pingpong_fish_news가 알려 줌) — 열쇠 = 회차 번호(day × 10 + idx)
const newsWx = new Map();
export const periodKey = (p) => p.day * 10 + p.idx;
export function setNewsWx(list) { for (const r of list || []) if (WXS.includes(r.wx)) newsWx.set(+r.p, r.wx); }
export const wxFor = (p) => newsWx.get(periodKey(p)) || null;
// 🛒 회차마다 팔린 수 { 회차 번호: { 물고기 id: [마리, 판 사람 수] } } (서버 pingpong_fish_news의 sold)
export const DEMAND_MIN = 10, DEMAND_SELLERS = 2, DEMAND_DOWN = [8, 9], DEMAND_UP = 11; // ×10
const soldBy = new Map();
export function setSold(rows) {
  for (const r of rows || []) {
    const k = +r.p;
    if (!soldBy.has(k)) soldBy.set(k, {});
    soldBy.get(k)[r.f] = [+r.n || 0, +r.k || 0];
  }
}
export const clearSold = () => soldBy.clear(); // 자동 점검용
// 그 회차 값에 곱하는 수 × 10 { 물고기 id: 8 | 9 | 11 } — 지난 회차(prevPeriod) 팔린 수로. 서버 44 pingpong__fish_demand_x와 같게
export function demandOf(p, sold = soldBy.get(periodKey(prevPeriod(p)))) {
  const out = {}, all = [...MARKET_FISH, ...BIG_FISH];
  if (!sold) return out;
  let total = 0;
  for (const id of all) total += sold[id]?.[0] || 0;
  if (total < DEMAND_MIN) return out;
  const top = all.filter((id) => (sold[id]?.[1] || 0) >= DEMAND_SELLERS && sold[id][0] > 0)
    .sort((a, b) => sold[b][0] - sold[a][0] || (a < b ? -1 : 1));
  top.slice(0, DEMAND_DOWN.length).forEach((id, i) => { out[id] = DEMAND_DOWN[i]; });
  for (const id of MARKET_FISH) if (!(sold[id]?.[0] > 0)) out[id] = DEMAND_UP;
  return out;
}
const xs32 = (x) => { x >>>= 0; x = (x ^ (x << 13)) >>> 0; x = (x ^ (x >>> 17)) >>> 0; return (x ^ (x << 5)) >>> 0; };
export const QUAL_X = [8, 10, 11, 13]; // 별 0~3개의 값 배율 × 10 (서버 41과 같게)
export const QUAL_DEF = 1; // 별 모르는 것(41 전에 잡은 것)은 ★ ×1.0
const qq = (q) => (q === 0 || q === 1 || q === 2 || q === 3 ? q : QUAL_DEF);
// 줄다리기 판정 수 → 별 0~3 (정수로 비교해 소수 오차 없음)
export function qualityOf(perfects, goods, misses) {
  const n = perfects + goods + misses;
  if (n <= 0) return QUAL_DEF;
  const a = (2 * perfects + goods) * 50; // 정확도 × 100 × n
  return a >= 90 * n ? 3 : a >= 75 * n ? 2 : a >= 50 * n ? 1 : 0;
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

// 그 회차의 시세 { 물고기 id(17종 모두): 값(0.1코인 단위 정수, 예 24 = 2.4코인) } + jackpot(id, 일반 7종 중)
// 그 회차의 소식 (wx = 그 회차 날씨, 모르면 null) — 대박 물고기 소식은 뺌. 서버 43 pingpong__fish_news_pick과 같게
export function newsOf(p, wx, jackpot) {
  const r = seeded(xs32(xs32(99001 + periodKey(p) * 7919)));
  const a = r(), b = r();
  const pool = NEWS.filter((n) => n.id !== jackpot && (WXS.includes(wx) && a < 0.5 ? n.wx === wx : n.wx === null));
  return pool[Math.floor(b * pool.length)] || null;
}
export function prices(p, wx = wxFor(p)) {
  const r = seeded(77003 + (p.day * 10 + p.idx) * 7919);
  const j = Math.floor(r() * MARKET_FISH.length);
  const out = {};
  MARKET_FISH.forEach((id, i) => {
    const [lo, span] = swingOf(id), m = lo + r() * span; // (대박이어도 하나 뽑음 — 서버와 순서를 같게)
    out[id] = Math.floor(FISH_COINS.common * 10 * (i === j ? JACKPOT_X : m) + 0.5);
  });
  const r2 = seeded(xs32(xs32(88001 + (p.day * 10 + p.idx) * 7919)));
  for (const id of BIG_FISH) {
    const g = SPECIES.find((s) => s.id === id).grade, [lo, span] = swingOf(id);
    out[id] = Math.floor(FISH_COINS[g] * 10 * (lo + r2() * span) + 0.5);
  }
  const news = newsOf(p, wx, MARKET_FISH[j]);
  if (news) out[news.id] = Math.floor((out[news.id] * NEWS_X[news.dir] + 5) / 10);
  const demand = demandOf(p);
  for (const [id, x] of Object.entries(demand)) out[id] = Math.floor((out[id] * x + 5) / 10);
  return { list: out, jackpot: MARKET_FISH[j], news, wx, demand };
}
// 물고기 하나의 지금 값(0.1코인 단위) — 별 q면 × 배율 후 반올림 (서버 pingpong__fish_qprice)
export function priceOf(id, ms, q = QUAL_DEF) {
  const sp = SPECIES.find((s) => s.id === id);
  if (!sp) return 0;
  const p = prices(period(ms)).list[id];
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
