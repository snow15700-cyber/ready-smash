// 낚시 손맛 시안 (리듬 방식, docs/dev/fishing.md 8장): 물고기 3종 · 박자 패턴 · 입질 순서 · 기포 확률 · 시험 설정
// 서버 없음 — 어떤 물고기·몇 cm인지는 이 브라우저가 정한다(게임에 넣을 때는 서버가 정함, 5장).

export const TUNE = {
  perfect: 0.3, good: 0.5, // 챔질: '!' 뒤 반응 속도(초)
  noteP: 0.06, noteG: 0.13, // 리듬 노트 판정 폭(± 초)
  fake: 1, // 가짜 비율: 0 적게 · 1 보통 · 2 많이
  bubbles: 'often', // 기포: 'normal' = 3.5분에 1~2곳(기획) · 'often' = 시험용(약 50초마다)
  fish: 'random', // 'random' | 물고기 id | 'junk' | 'paddle'
  cond: 'auto', // 조건 물고기 시험: 'auto'(실제 쉬는 시간·밤) | 'break' | 'night' | 'rain'
  sound: true,
};

// 리듬: bpm(한 마리마다 ±4 흔들림), notes = 다 Good일 때 잡히는 노트 수의 기준. 박자 패턴·음악은 rhythm.js가 한 마리마다 새로 조립
export const FISH = {
  mackerel: {
    id: 'mackerel', name: '고등어', grade: 'common', emoji: '🐟',
    size: [24, 46], body: 0x3f6fa0, belly: 0xe8eef2, stripe: true,
    bpm: 100, notes: 6,
  },
  seabream: {
    id: 'seabream', name: '참돔', grade: 'rare', emoji: '🐠',
    size: [35, 72], body: 0xe0646a, belly: 0xfbd3cf,
    bpm: 115, notes: 11,
  },
  goldball: {
    id: 'goldball', name: '황금 탁구공 물고기', grade: 'legend', emoji: '🏓',
    size: [60, 104], body: 0xffc21a, belly: 0xfff3b8, ball: true,
    bpm: 130, notes: 16,
  },
};
export const GRADE = {
  common: { label: '일반', color: '#9fb4c8' },
  rare: { label: '희귀', color: '#5aa9ff' },
  legend: { label: '전설', color: '#ffc21a' },
};

// ── 잡히는 것 (fishing.md 9장, 11/25 사용자 확정): 물고기 17종 · 잡동사니 9개 · 1% 전설 탁구채
// 리듬 단계는 등급(grade)으로만 정함(종류는 잡는 순간 공개). 잡동사니는 일반 리듬을 짧게(4노트), 탁구채는 희귀처럼 두 단계.
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
// 전설 탁구채 7종 (items.js와 같은 id). 낚시 전용 '황금 물고기 탁구채'는 나중에(사용자 11/25) — 그때 처음 걸리면 무조건 그것
export const LEGEND_PADDLES = [['paddle_pan', '프라이팬'], ['paddle_guitar', '통기타'], ['paddle_keyboard', '키보드'], ['paddle_mouse', '마우스'], ['paddle_phone', '스마트폰'], ['paddle_duck', '고무 오리'], ['paddle_hammer', '뿅망치']];
export const PADDLE_DUP_PIECES = 30; // 이미 가진 것이면 상점 조각 30개 (뽑기 전설 중복과 같음)
export const COND = { break: { icon: '☕', label: '쉬는 시간에만' }, night: { icon: '🌙', label: '밤에만' }, rain: { icon: '🌧️', label: '비 올 때만' } };
export const PADDLE_RATE = 0.01, JUNK_RATE = 0.13, COND_RATE = 0.4; // 잡동사니는 '일반'이 나올 때의 13% (전체 약 10%) · 조건 물고기는 조건이 맞을 때 희귀의 40%

// 기포 가까이 떨어질수록 희귀·전설 ↑ (빗나가도 일반은 잡힘). near: 0 = 기포 없음/멂 · 1 = 근처(3.5m) · 2 = 바로 위(1.5m)
const ODDS = [[72, 25, 3], [45, 43, 12], [25, 55, 20]];
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
// ctx: { cond: { break, night, rain }, owned: [가진 탁구채 id] }. 게임에 넣을 때는 서버가 같은 규칙으로 정함(5장)
export function pickCatch(near = 0, ctx = {}, rnd = Math.random) {
  const f = TUNE.fish;
  if (f === 'paddle' || (f === 'random' && rnd() < PADDLE_RATE)) return paddleCatch(ctx.owned || [], rnd);
  if (f === 'junk') return pick(JUNK, rnd);
  if (f !== 'random') return SPECIES.find((s) => s.id === f);
  const [c, r] = ODDS[near];
  const x = rnd() * 100;
  if (x < c) return rnd() < JUNK_RATE ? pick(JUNK, rnd) : pick(SPECIES.filter((s) => s.grade === 'common'), rnd);
  if (x < c + r) {
    const conds = SPECIES.filter((s) => s.cond && ctx.cond?.[s.cond]);
    if (conds.length && rnd() < COND_RATE) return pick(conds, rnd);
    return pick(SPECIES.filter((s) => s.grade === 'rare' && !s.cond), rnd);
  }
  return pick(SPECIES.filter((s) => s.grade === 'legend'), rnd);
}
// 아직 없는 전설 탁구채 중 하나, 다 있으면 아무거나 + 조각 30개 (사용자 확정 11/25)
function paddleCatch(owned, rnd) {
  const left = LEGEND_PADDLES.filter(([id]) => !owned.includes(id));
  const [id, name] = pick(left.length ? left : LEGEND_PADDLES, rnd);
  return { kind: 'paddle', id, name, grade: 'rare', emoji: '🏓', dup: !left.length };
}

// 단계 (fishing.md 8장 '등급 숨기기', 11/25 사용자 확정): 누구나 일반 리듬으로 시작 → 희귀면 한 번, 전설이면 두 번 "무겁다!"로 리듬이 올라감
export const STAGES = ['common', 'rare', 'legend'];
export const STAGE_FISH = { common: FISH.mackerel, rare: FISH.seabream, legend: FISH.goldball }; // 단계마다 박자(bpm)·노트 수 기준
export const stageOf = (f) => STAGES.indexOf(f.grade);

// 입질 순서: tok(톡 = 약한 떨림) · fake(가짜 풍덩 = 약한 떨림 2~3번) · real(진짜, 항상 마지막)
// 등급을 숨기므로 입질 순서는 등급과 상관없이 고름 (순서로 등급을 알아채지 못하게)
const SEQS = [['tok'], ['tok', 'fake'], ['tok', 'fake', 'tok'], ['tok', 'tok', 'fake'], ['tok', 'fake', 'tok', 'fake']];
export function biteSeq(f, rnd = Math.random) {
  let s = [...SEQS[Math.floor(rnd() * SEQS.length)]];
  if (TUNE.fake === 0) s = s.slice(0, 1);
  if (TUNE.fake === 2) s.splice(1 + Math.floor(rnd() * s.length), 0, 'fake');
  return [...s, 'real'];
}

// 크기: 종류·등급 상관없이 모두 같은 범위 (사용자 확정 11/25), 큰 것은 드물게. 88cm 이상(상위 약 10%) = 🏆 월척
export const SIZE = [20, 100], BIG_CM = 88;
export function fishSize(rnd = Math.random) {
  const k = rnd() ** 1.6;
  return { cm: Math.round((SIZE[0] + (SIZE[1] - SIZE[0]) * k) * 10) / 10, k };
}
