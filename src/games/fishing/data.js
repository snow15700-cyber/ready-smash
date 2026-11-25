// 낚시 손맛 시안 (리듬 방식, docs/dev/fishing.md 8장): 물고기 3종 · 박자 패턴 · 입질 순서 · 기포 확률 · 시험 설정
// 서버 없음 — 어떤 물고기·몇 cm인지는 이 브라우저가 정한다(게임에 넣을 때는 서버가 정함, 5장).

export const TUNE = {
  perfect: 0.25, good: 0.5, // 챔질: '!' 뒤 반응 속도(초)
  noteP: 0.06, noteG: 0.13, // 리듬 노트 판정 폭(± 초)
  fake: 1, // 가짜 비율: 0 적게 · 1 보통 · 2 많이
  bubbles: 'often', // 기포: 'normal' = 3.5분에 1~2곳(기획) · 'often' = 시험용(약 50초마다)
  fish: 'random',
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

// 기포 가까이 떨어질수록 희귀·전설 ↑ (빗나가도 일반은 잡힘). near: 0 = 기포 없음/멂 · 1 = 근처(3.5m) · 2 = 바로 위(1.5m)
const ODDS = [[72, 25, 3], [45, 43, 12], [25, 55, 20]];
export function pickFish(near = 0, rnd = Math.random) {
  if (TUNE.fish !== 'random') return FISH[TUNE.fish];
  const [c, r] = ODDS[near];
  const x = rnd() * 100;
  return x < c ? FISH.mackerel : x < c + r ? FISH.seabream : FISH.goldball;
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

export function fishSize(f, rnd = Math.random) {
  const k = rnd() ** 1.6; // 큰 것은 드물게
  return { cm: Math.round((f.size[0] + (f.size[1] - f.size[0]) * k) * 10) / 10, k };
}
