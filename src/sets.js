// 세트 (머리 + 몸 = 세트, 세 번째 아이템까지 = 완전 세트). 기획: docs/dev/shop.md '머리·얼굴·세트'
// ⚠️ 서버 supabase/24_sets.sql의 pingpong__set_of·보너스 계산, 로컬 가짜 서버(account.js)와 같게 유지한다.
//
// 세트를 입으면(서버가 장착 정보 equip으로 판단): 칭호(업적 set_<id>), 완전 세트면 칭호 하나 더(setfull_<id>),
// 그리고 컨셉에 맞는 코인 보너스 (완전 세트 = 2배). 퍼센트는 그 판(그 상황)의 코인 합에 붙고 올림.
//   kind 'win'     이긴 판 코인 +pct%          'perfect' 퍼펙트 3연속이 나온 판 +pct%
//   kind 'lose'    진 판에도 +flat              'break'   쉬는 시간 보너스 +50% → +(50+pct)%
//   kind 'rally'   랠리 10회 넘긴 판 +pct%      'streak'  연승 보너스 받을 때 +flat
//   kind 'daily'   하루 첫 접속 +flat           'ai'      혼자 하기 코인 +pct%
//   kind 'mission' 미션 코인 +pct%
// 보기(이름표 알약·꾸미기)는 화면이, 코인·칭호는 서버가 정한다.

export const SETS = [
  { id: 'korea', name: '국가대표', head: 'head_band', body: 'body_uniform', third: 'face_glare', kind: 'win', pct: 15 },
  { id: 'chef', name: '오늘의 셰프', head: 'head_chef', body: 'body_apron', third: 'paddle_pan', kind: 'perfect', pct: 25 },
  { id: 'safety', name: '안전제일', head: 'head_hardhat', body: 'body_vest', third: 'face_sweat', kind: 'lose', flat: 8 },
  { id: 'vacation', name: '휴가 중', head: 'head_straw', body: 'body_hawaii', third: 'face_happy', kind: 'break', pct: 25 },
  { id: 'exam', name: '수험생', head: 'head_pass', body: 'body_padding', third: 'paddle_book', kind: 'rally', pct: 15 },
  { id: 'hiker', name: '등산왕', head: 'head_hiking', body: 'body_hiking', third: 'face_mustache', kind: 'streak', flat: 15 },
  { id: 'granny', name: '동네 할매', head: 'head_scarf', body: 'body_monpe', third: 'paddle_scoop', kind: 'daily', flat: 15 },
  { id: 'sleepy', name: '꿀잠', head: 'head_nightcap', body: 'body_starpj', third: 'face_sleepy', kind: 'ai', pct: 15 },
  { id: 'knight', name: '원탁의 기사', head: 'head_helm', body: 'body_knight', third: 'paddle_board', kind: 'win', pct: 15 },
  { id: 'hero', name: '동네 히어로', head: 'head_mask', body: 'body_cape', third: 'paddle_hammer', kind: 'win', pct: 15 },
  { id: 'bear', name: '곰돌이', head: 'head_bear', body: 'body_bear', third: 'paddle_duck', kind: 'mission', pct: 15 },
];

// 장착 정보로 세트 찾기: { set, full } 또는 null (머리와 몸이 둘 다 맞아야 세트)
export function setOf(equip) {
  const e = equip || {};
  const s = SETS.find((x) => e.head === x.head && e.body === x.body);
  if (!s) return null;
  const cat = s.third.split('_')[0];
  return { set: s, full: e[cat] === s.third };
}

// 보너스 크기 (완전 세트 = 2배)
export const setAmount = (s, full) => (s.pct || s.flat) * (full ? 2 : 1);

// 보너스 설명 글자
export function setBonusText(s, full = false) {
  const n = setAmount(s, full);
  return {
    win: `이긴 판 코인 +${n}%`,
    perfect: `퍼펙트 3연속이 나온 판 코인 +${n}%`,
    lose: `진 판에도 코인 +${n}`,
    break: `쉬는 시간 보너스 +50% → +${50 + n}%`,
    rally: `랠리 10회 넘긴 판 코인 +${n}%`,
    streak: `연승 보너스 받을 때 +${n}`,
    daily: `하루 첫 접속 코인 +${n}`,
    ai: `혼자 하기 코인 +${n}%`,
    mission: `미션 코인 +${n}%`,
  }[s.kind];
}

// 이 아이템이 들어 있는 세트들 (꾸미기 크게 보기 카드에 안내)
export const setsWith = (itemId) => SETS.filter((s) => s.head === itemId || s.body === itemId || s.third === itemId);

// 코인 내역 글자 (서버와 같게)
export const setLabel = (s, full) => `✨ 세트 「${s.name}」${full ? ' 완전' : ''}`;
