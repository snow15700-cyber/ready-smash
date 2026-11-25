-- ⚠️ 낚시 월척 랭킹 초기화 (광장 전광판·랭킹 창의 '이번 주'·'역대' 둘 다 비워짐)
-- 실행하면 되돌릴 수 없어요. 꼭 필요할 때만 SQL Editor에서 직접 실행하세요.
-- 지우는 것: 랭킹용 물고기 기록(pingpong_fish_log)만.
-- 그대로 두는 것: 도감(잡은 종류·마리 수·최고 크기), 낚시 업적, 코인, 전설 탁구채 조각.
-- 번호 파일(01~)과 달리 '전부 차례로 실행'할 때 섞이지 않게 once 폴더에 따로 둡니다.

delete from public.pingpong_fish_log;

-- 확인: 0이 나오면 다 지워진 거예요.
select count(*) as 남은_랭킹_기록 from public.pingpong_fish_log;
