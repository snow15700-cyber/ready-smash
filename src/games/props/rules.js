// 광장 음식 효과 규칙 (docs/dev/plaza.md 10장 ②-2, 사용자 확정 11/28 '싸게 · 쓴 만큼 이득') — three 없이 (자동 점검이 Node에서 불러 서버와 비교)
// ⚠️ 서버 supabase/49_plaza_food.sql(pingpong_plaza_buy · pingpong__food_pct)과 같게. 로컬 가짜 서버(src/localServer.js)도 이걸 씀
//  · 효과는 한 번에 하나 (새로 사면 바뀜). 경기·혼자 하기·횟집 판매 코인에만. 하루 한도(혼자 250·낚시 1000) 그대로
//  · 쉬는 시간 +50%·세트와는 더하기 (같은 코인에 각각 붙음)
export const FOOD_FX = {
  coffee: { price: 10, min: 10, match: 30 },
  ade: { price: 10, min: 10, ai: 30 },
  bungeo: { price: 10, min: 10, fish: 30 },
  hotdog: { price: 10, min: 10, win: 60 }, // 이긴 1대1·2대2만
  can: { price: 3, min: 5, match: 15, ai: 15, fish: 15 }, // 1%는 '하나 더!' = 공짜
};
export const LUCKY_CAN = 0.01;
export const FOOD_LABEL = { coffee: '☕ 커피', ade: '🥤 에이드', bungeo: '🐟 붕어빵', hotdog: '🌭 핫도그', can: '🥫 캔 음료' };
// kind = 'match' | 'ai' | 'fish' · won = 이긴 경기인지 (핫도그)
export function foodPct(food, kind, won = false) {
  const f = FOOD_FX[food];
  if (!f) return 0;
  if (kind === 'match') return f.match || (won && f.win) || 0;
  return f[kind] || 0;
}
// 지금 효과 중인 것 (kind별 %) — 알약 글자용
export const foodSummary = (food) => {
  const f = FOOD_FX[food];
  if (!f) return '';
  if (f.win) return `이긴 판 +${f.win}%`;
  const ks = ['match', 'ai', 'fish'].filter((k) => f[k]);
  return ks.length === 3 ? `모든 코인 +${f[ks[0]]}%` : `${{ match: '대결', ai: '혼자 하기', fish: '낚시 판매' }[ks[0]]} +${f[ks[0]]}%`;
};
