// 쉬는 시간 보너스 (사용자 확정 11/18): 1대1·2대2 경기의 시작이나 끝이 쉬는 시간이면 그 판 코인 +50%.
// 코인은 서버가 서버 시계로 정한다(supabase/19_break_bonus.sql의 pingpong__is_break). 여기는 같은 규칙으로
// 로비 알림('n분 남음')과 로컬 가짜 서버에 쓴다.
// 평일(월~금) 한국 시간만. 수업 전(09시 전)·수업 후(18시 뒤)는 없음.
const hm = (h, m) => h * 60 + m;
export const BREAKS = [
  [hm(9, 50), hm(10, 0)], [hm(10, 50), hm(11, 0)], [hm(11, 30), hm(13, 0)], // 점심 11:30~13:00
  [hm(13, 50), hm(14, 0)], [hm(14, 50), hm(15, 0)], [hm(15, 50), hm(16, 0)], [hm(16, 50), hm(17, 0)], [hm(17, 50), hm(18, 0)],
];
export const BREAK_LABEL = '☕ 쉬는 시간 +50%';
export const breakBonus = (total) => Math.ceil(total / 2); // 50%, 올림 (SQL의 (total + 1) / 2)

// 시험용: 주소에 ?clock=09:55 를 붙이면 이 브라우저의 '지금'을 그 시각(오늘, 한국 시간. 주말이면 다음 월요일)으로 본다.
// 화면 알림과 로컬 가짜 서버만 바뀐다 (진짜 서버의 코인은 서버 시계 그대로).
const CLOCK = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('clock'); // (자동 점검은 node에서 불러서 location이 없음)
let shift = 0;
if (/^\d{1,2}:\d{2}$/.test(CLOCK || '')) {
  const [h, m] = CLOCK.split(':').map(Number);
  const d = new Date(Date.now() + 9 * 3600e3); // 한국 시간을 UTC 칸에
  const days = { 6: 2, 0: 1 }[d.getUTCDay()] || 0; // 주말에 시험하면 다음 월요일로 (평일만 보너스라서)
  shift = (days * 1440 + hm(h, m) - hm(d.getUTCHours(), d.getUTCMinutes())) * 60e3 - d.getUTCSeconds() * 1e3;
}
export const nowMs = () => Date.now() + shift;

// ms 시각이 쉬는 시간이면 { end: 끝나는 ms }, 아니면 null
export function breakAt(ms = nowMs()) {
  const d = new Date(ms + 9 * 3600e3);
  const dow = d.getUTCDay(); // 0 일요일 … 6 토요일
  if (dow === 0 || dow === 6) return null;
  const min = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  const b = BREAKS.find(([s, e]) => min >= s && min < e);
  return b ? { end: ms + (b[1] - min) * 60e3 } : null;
}
