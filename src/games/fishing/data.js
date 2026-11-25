// 낚시 손맛 시안: 물고기 3종 + 입질 순서 + 시험 설정 (docs/dev/fishing.md 2장·5-2장·7장)
// 서버 없음 — 크기·입질 순서는 이 브라우저가 정한다(게임에 넣을 때는 서버가 정함, 5장).

// 시험 설정 (오른쪽 위 ⚙️ 버튼으로 바꿔 보며 정함). 기본값 = 기획서 숫자
export const TUNE = {
  win: 0.35, // 진짜 풍덩: 잠긴 뒤 링이 닫힐 때까지 (초)
  lead: 0.55, // 링이 나타나서 찌가 잠기기(또는 톡)까지 (초)
  perfect: 0.07, good: 0.15, // 판정 폭 (닫히는 순간 ± 초)
  fake: 1, // 가짜 비율: 0 적게 · 1 보통 · 2 많이
  tension: 1, // 장력 오르는 빠르기 배수
  fish: 'random',
  sound: true,
};

export const FISH = {
  mackerel: {
    id: 'mackerel', name: '고등어', grade: 'common', emoji: '🐟', w: 60,
    size: [24, 46], shadow: 0.75, body: 0x3f6fa0, belly: 0xe8eef2, stripe: true,
    fight: null, // 일반 = 줄다리기 없이 바로 (약 12초)
  },
  seabream: {
    id: 'seabream', name: '참돔', grade: 'rare', emoji: '🐠', w: 32,
    size: [35, 72], shadow: 1.0, body: 0xe0646a, belly: 0xfbd3cf,
    fight: { pull: 0.72, pump: 0.2, rush: [0.6, 1.1], rest: [0.9, 1.5] },
  },
  goldball: {
    id: 'goldball', name: '황금 탁구공 물고기', grade: 'legend', emoji: '🏓', w: 8,
    size: [60, 104], shadow: 1.35, body: 0xffc21a, belly: 0xfff3b8, ball: true,
    fight: { pull: 0.95, pump: 0.16, rush: [0.7, 1.3], rest: [0.7, 1.2] },
  },
};
export const GRADE = {
  common: { label: '일반', color: '#9fb4c8' },
  rare: { label: '희귀', color: '#5aa9ff' },
  legend: { label: '전설', color: '#ffc21a' },
};

export function pickFish(rnd = Math.random) {
  if (TUNE.fish !== 'random') return FISH[TUNE.fish];
  const list = Object.values(FISH);
  let r = rnd() * list.reduce((s, f) => s + f.w, 0);
  for (const f of list) if ((r -= f.w) < 0) return f;
  return list[0];
}

// 입질 순서: tok(톡, 가짜) · fake(가짜 풍덩) · real(진짜 풍덩, 항상 마지막)
// 순한 것(고등어): 톡 → 진짜 / 까다로운 것: 톡·톡·가짜 풍덩·톡 → 진짜 (2장)
export function biteSeq(f, rnd = Math.random) {
  const lv = TUNE.fake;
  let s;
  if (f.grade === 'common') s = rnd() < 0.5 ? ['tok'] : ['tok', 'tok'];
  else if (f.grade === 'rare') s = rnd() < 0.5 ? ['tok', 'fake', 'tok'] : ['tok', 'tok', 'fake'];
  else s = ['tok', 'fake', 'tok', 'tok', 'fake'];
  if (lv === 0) s = f.grade === 'common' ? ['tok'] : ['tok', 'fake'];
  if (lv === 2) s.splice(1 + Math.floor(rnd() * s.length), 0, 'fake');
  return [...s, 'real'];
}

export function fishSize(f, rnd = Math.random) {
  const k = rnd() ** 1.6; // 큰 것은 드물게
  return { cm: Math.round((f.size[0] + (f.size[1] - f.size[0]) * k) * 10) / 10, k };
}
