-- 준비하시고, 스매시! — 17단계: 탁구공 19종 (경기장 뽑기) (16_gacha_open.sql 다음)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js의 ball_ 아이템 = src/balls.js의 BALLS와 같게 유지)
-- 기본 공(ball_white, 흰색)은 표에 넣지 않는다 (장착 해제 = 기본).
-- 방에서는 방장이 장착한 공이 모두에게 보인다 (서버는 장착만 저장, 보여 주는 건 화면 쪽).
-- ★ 일반 공이 들어가면 닫혀 있던 경기장 뽑기가 자동으로 열린다 (16_gacha_open.sql 규칙).

insert into public.pingpong_items(id, pool, cat, grade) values
  -- 일반: 색·무늬
  ('ball_orange',    'arena', 'ball', 'common'),
  ('ball_yellow',    'arena', 'ball', 'common'),
  ('ball_lime',      'arena', 'ball', 'common'),
  ('ball_pink',      'arena', 'ball', 'common'),
  ('ball_half',      'arena', 'ball', 'common'),
  ('ball_stripe',    'arena', 'ball', 'common'),
  ('ball_dots',      'arena', 'ball', 'common'),
  ('ball_stars',     'arena', 'ball', 'common'),
  -- 고급: 재미있는 공
  ('ball_eye',       'arena', 'ball', 'rare'),
  ('ball_smile',     'arena', 'ball', 'rare'),
  ('ball_tangerine', 'arena', 'ball', 'rare'),
  ('ball_tomato',    'arena', 'ball', 'rare'),
  ('ball_mochi',     'arena', 'ball', 'rare'),
  ('ball_takoyaki',  'arena', 'ball', 'rare'),
  ('ball_egg',       'arena', 'ball', 'rare'),   -- 스매시로 득점하면 깨지고 털뭉치 병아리
  ('ball_eight',     'arena', 'ball', 'rare'),
  -- 전설
  ('ball_asteroid',  'arena', 'ball', 'legend'),
  ('ball_dragon',    'arena', 'ball', 'legend'), -- 스매시로 득점하면 깨지고 아기 용
  ('ball_sun',       'arena', 'ball', 'legend')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
