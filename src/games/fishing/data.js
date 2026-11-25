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

// 리듬: bpm, pat = 박자 위치(박 단위, 0부터). 한 바퀴 끝나면 3박 쉬고 다시(놓쳐도 만회할 수 있게)
export const FISH = {
  mackerel: {
    id: 'mackerel', name: '고등어', grade: 'common', emoji: '🐟',
    size: [24, 46], body: 0x3f6fa0, belly: 0xe8eef2, stripe: true,
    bpm: 100, pats: [[0, 1, 2, 3], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]],
  },
  seabream: {
    id: 'seabream', name: '참돔', grade: 'rare', emoji: '🐠',
    size: [35, 72], body: 0xe0646a, belly: 0xfbd3cf,
    bpm: 115, pats: [[0, 1, 2, 2.5, 3, 5, 6, 6.5, 7, 8]],
  },
  goldball: {
    id: 'goldball', name: '황금 탁구공 물고기', grade: 'legend', emoji: '🏓',
    size: [60, 104], body: 0xffc21a, belly: 0xfff3b8, ball: true,
    bpm: 130, pats: [[0, 0.5, 1.5, 2, 3, 4.5, 5, 5.5, 6.5, 8, 8.5, 9, 10.5, 11, 11.5, 12]],
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

// 입질 순서: tok(톡 = 약한 떨림) · fake(가짜 풍덩 = 약한 떨림 2~3번) · real(진짜, 항상 마지막)
export function biteSeq(f, rnd = Math.random) {
  let s;
  if (f.grade === 'common') s = rnd() < 0.5 ? ['tok'] : ['tok', 'fake'];
  else if (f.grade === 'rare') s = rnd() < 0.5 ? ['tok', 'fake', 'tok'] : ['tok', 'tok', 'fake'];
  else s = ['tok', 'fake', 'tok', 'fake'];
  if (TUNE.fake === 0) s = s.slice(0, 1);
  if (TUNE.fake === 2) s.splice(1 + Math.floor(rnd() * s.length), 0, 'fake');
  return [...s, 'real'];
}

export function fishSize(f, rnd = Math.random) {
  const k = rnd() ** 1.6; // 큰 것은 드물게
  return { cm: Math.round((f.size[0] + (f.size[1] - f.size[0]) * k) * 10) / 10, k };
}
