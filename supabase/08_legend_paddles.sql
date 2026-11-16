-- 준비하시고, 스매시! — 8단계: 전설 탁구채 7종 (07_paddles.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js의 ITEMS와 같게 유지)

insert into public.pingpong_items(id, pool, cat, grade) values
  ('paddle_pan',      'char', 'paddle', 'legend'),
  ('paddle_guitar',   'char', 'paddle', 'legend'),
  ('paddle_keyboard', 'char', 'paddle', 'legend'),
  ('paddle_mouse',    'char', 'paddle', 'legend'),
  ('paddle_phone',    'char', 'paddle', 'legend'),
  ('paddle_duck',     'char', 'paddle', 'legend'),
  ('paddle_hammer',   'char', 'paddle', 'legend')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
