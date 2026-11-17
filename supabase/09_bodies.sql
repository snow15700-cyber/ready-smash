-- 준비하시고, 스매시! — 9단계: 몸 꾸미기 29종 (08_legend_paddles.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js + src/outfits.js의 OUTFITS와 같게 유지)
-- 기본 몸(body_none)은 표에 넣지 않는다 (장착 해제 = 기본).

insert into public.pingpong_items(id, pool, cat, grade) values
  -- 일반 10
  ('body_uniform',    'char', 'body', 'common'),
  ('body_pe',         'char', 'body', 'common'),
  ('body_undershirt', 'char', 'body', 'common'),
  ('body_monpe',      'char', 'body', 'common'),
  ('body_vest',       'char', 'body', 'common'),
  ('body_hiking',     'char', 'body', 'common'),
  ('body_starpj',     'char', 'body', 'common'),
  ('body_leopard',    'char', 'body', 'common'),
  ('body_dotpj',      'char', 'body', 'common'),
  ('body_overalls',   'char', 'body', 'common'),
  -- 고급 14
  ('body_suit',       'char', 'body', 'rare'),
  ('body_apron',      'char', 'body', 'rare'),
  ('body_padding',    'char', 'body', 'rare'),
  ('body_blanket',    'char', 'body', 'rare'),
  ('body_gimbap',     'char', 'body', 'rare'),
  ('body_bungeo',     'char', 'body', 'rare'),
  ('body_banana',     'char', 'body', 'rare'),
  ('body_penguin',    'char', 'body', 'rare'),
  ('body_hawaii',     'char', 'body', 'rare'),
  ('body_milk',       'char', 'body', 'rare'),
  ('body_cupcake',    'char', 'body', 'rare'),
  ('body_chick',      'char', 'body', 'rare'),
  ('body_gummy',      'char', 'body', 'rare'),
  ('body_macaron',    'char', 'body', 'rare'),
  -- 전설 5 (움직이는 효과)
  ('body_cape',       'char', 'body', 'legend'),
  ('body_duck',       'char', 'body', 'legend'),
  ('body_mirror',     'char', 'body', 'legend'),
  ('body_knight',     'char', 'body', 'legend'),
  ('body_bear',       'char', 'body', 'legend')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
