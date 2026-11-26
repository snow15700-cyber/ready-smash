// 줄다리기 박자를 주변에 알려 주는 곳 (fishing.md 8장 'B 주변이 박자를 탐' 시안, 11/26)
// session.js가 매 프레임 채우고, 바다 물결·선착장(campusPier.js)·내 캐릭터·고양이(cats/models.js)·물고기 그림자가 읽는다.
// 내 화면에서만(내 낚시의 박자). fx = ⚙️에서 켠 것 (TUNE.bSea·bPier·bBody·bShadow를 session이 옮겨 둠)
export const BEAT = {
  on: false, // 지금 박자가 흐르는 중(줄다리기)
  pulse: 0, // 박마다 1 → 0으로 줄어듦 (반 박 동안)
  accent: false, // 이번 박이 마디 첫 박인지
  n: 0, // 박 번호 (바뀌면 새 박)
  phase: 0, // 박 안에서 지난 정도 0~1
  side: 1, // 박마다 −1·1로 바뀜 (좌우로 까딱)
  spb: 0.6, // 한 박 시간(초)
  fx: { sea: false, pier: false, body: false, shadow: false },
};
