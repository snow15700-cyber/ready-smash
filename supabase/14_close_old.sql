-- 준비하시고, 스매시! — 14단계: 예전 경기 결과 함수 닫기 (13 다음, 반드시 test를 main에 합친 뒤에 실행)
-- Supabase 대시보드 → SQL Editor → 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 예전 함수들은 브라우저가 보낸 "이겼어요"를 그대로 믿어서, 경기 없이 불러도 코인·승수·업적이 쌓였다.
-- 새 화면은 13의 pingpong_match_* 함수만 쓰므로, 이것들을 브라우저(anon)에서 못 부르게 막는다.
-- (함수는 지우지 않는다. 13의 새 함수가 안에서 업적 함수를 부르기 때문)
-- ※ main에 합치기 전에 실행하면 main 배포본에서 경기 결과·코인이 저장되지 않는다.

revoke execute on function public.pingpong_record_match(text, text, boolean, uuid) from anon, authenticated;
revoke execute on function public.pingpong_finish_match(text, text, boolean, uuid, int, int) from anon, authenticated;
revoke execute on function public.pingpong_ach_match(text, text, boolean, jsonb) from anon, authenticated;
revoke execute on function public.pingpong_ach_people(text, text, boolean, uuid, uuid) from anon, authenticated;
