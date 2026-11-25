-- 준비하시고, 스매시! — 33단계: 옛 경기 결과 함수 닫기. ⚠️ test를 main에 합친 뒤에 실행 (먼저 하면 main 배포본의 경기 기록이 안 남음)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 32부터 화면은 pingpong_match_result(서로 말이 맞아야 정산)를 부른다.
-- 옛 pingpong_match_finish는 브라우저가 보낸 '이겼다'를 그대로 믿으므로 브라우저(anon)에서 못 부르게 한다.
-- (13·18·19·24·27을 다시 실행하면 옛 함수가 다시 열리니, 그 뒤에는 이 파일도 다시 실행)

revoke execute on function public.pingpong_match_finish(text, uuid, boolean, int, int) from public, anon, authenticated;
