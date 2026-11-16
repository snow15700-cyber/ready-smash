-- 준비하시고, 스매시! — 7단계: 탁구채 추가 1차 (무늬 4종 + 개그 탁구채 15종)
-- 06_shop.sql을 먼저 실행해 둔 상태에서, Supabase 대시보드 → SQL Editor에 붙여 넣고 Run.
-- 여러 번 실행해도 괜찮다. (src/items.js의 ITEMS와 같게 유지)

insert into public.pingpong_items(id, pool, cat, grade) values
  -- 무늬 (일반)
  ('paddle_stripe',   'char', 'paddle', 'common'),
  ('paddle_dots',     'char', 'paddle', 'common'),
  ('paddle_hearts',   'char', 'paddle', 'common'),
  ('paddle_bolt',     'char', 'paddle', 'common'),
  -- 개그 탁구채 (고급)
  ('paddle_toast',    'char', 'paddle', 'rare'),
  ('paddle_baguette', 'char', 'paddle', 'rare'),
  ('paddle_donut',    'char', 'paddle', 'rare'),
  ('paddle_pizza',    'char', 'paddle', 'rare'),
  ('paddle_melon',    'char', 'paddle', 'rare'),
  ('paddle_waffle',   'char', 'paddle', 'rare'),
  ('paddle_mackerel', 'char', 'paddle', 'rare'),
  ('paddle_scoop',    'char', 'paddle', 'rare'),
  ('paddle_slipper',  'char', 'paddle', 'rare'),
  ('paddle_swatter',  'char', 'paddle', 'rare'),
  ('paddle_fan',      'char', 'paddle', 'rare'),
  ('paddle_sponge',   'char', 'paddle', 'rare'),
  ('paddle_book',     'char', 'paddle', 'rare'),
  ('paddle_eraser',   'char', 'paddle', 'rare'),
  ('paddle_board',    'char', 'paddle', 'rare')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
