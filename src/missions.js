// 오늘의 미션 (사용자 확정 11/19, docs/dev/accounts.md '출석·일일 미션')
// 사람을 섞는 미션: 매일(한국 날짜) 3개, 모두 같은 미션 = 고정 '오늘 새 상대와 1판' + 후보 6개 중 날짜로 정한 2개.
// 미션 달성은 서버가 정한다(supabase/21_missions.sql). 여기는 이름·고르는 규칙(SQL pingpong__missions_of와 같음)·로컬 가짜 서버용.
export const MISSIONS = {
  new_opp: { ico: '🤝', name: '오늘 새 상대와 1판', desc: '오늘 아직 안 붙어 본 사람과 경기' },
  duo: { ico: '👥', name: '2대2 한 판', desc: '2대2 경기 끝까지 하기' },
  cheer3: { ico: '📣', name: '관전하며 응원 3번', desc: '다른 사람 경기를 보며 응원 버튼 3번' },
  rally10: { ico: '🏓', name: '랠리 10번 넘기기', desc: '1대1·2대2 경기에서 랠리 10번' },
  opp3: { ico: '🎉', name: '오늘 상대 3명과 경기', desc: '오늘 서로 다른 상대 3명과 경기' },
  win1: { ico: '🏆', name: '1번 이기기', desc: '1대1이나 2대2에서 한 번 이기기' },
  perf3: { ico: '✨', name: '퍼펙트 3연속', desc: '경기에서 PERFECT 3번 연속' },
};
export const MISSION_POOL = ['duo', 'cheer3', 'rally10', 'opp3', 'win1', 'perf3'];
export const MISSION_COIN = 30; // 미션 하나
export const MISSION_ALL = 50; // 3개 다 깨면 더

export const koreaDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

// 그날의 미션 3개. 후보 2개 고르는 15가지를 날짜마다 7칸씩 건너뛰며 돈다 (SQL과 같은 규칙)
export function missionsOf(day) {
  const n = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse('2026-01-01T00:00:00Z')) / 86400e3);
  let k = (((n * 7) % 15) + 15) % 15;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    if (k === 0) return ['new_opp', MISSION_POOL[i], MISSION_POOL[j]];
    k--;
  }
  return ['new_opp'];
}
