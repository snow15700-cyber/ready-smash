-- 준비하시고, 스매시! — 20단계: 일반 배경 3종 (경기장 뽑기) (19_break_bonus.sql 다음, 순서는 상관없음)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js의 bg_ 아이템과 같게 유지)
-- 방에서는 방장이 장착한 배경이 모두에게 보인다 (서버는 장착만 저장, 보여 주는 건 화면 쪽).

insert into public.pingpong_items(id, pool, cat, grade) values
  ('bg_classroom', 'arena', 'bg', 'common'),   -- 교실
  ('bg_training',  'arena', 'bg', 'common'),   -- 교육장 ('쉬는 시간 10분' 타이머)
  ('bg_parking',   'arena', 'bg', 'common')    -- 지하 주차장 (랠리가 길어지면 형광등이 하나둘 꺼짐)
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
