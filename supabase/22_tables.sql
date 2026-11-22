-- 준비하시고, 스매시! — 22단계: 탁구대 17종 (경기장 뽑기) (21_missions.sql 다음)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js의 table_ 아이템 = src/tables.js의 TABLES와 같게 유지)
-- 기본 탁구대(table_blue, 파랑)는 표에 넣지 않는다 (장착 해제 = 기본).
-- 방에서는 방장이 장착한 탁구대가 모두에게 보인다 (서버는 장착만 저장, 보여 주는 건 화면 쪽). 보기만 다르고 판정·공 튀는 소리는 그대로.

insert into public.pingpong_items(id, pool, cat, grade) values
  -- 일반: 색·무늬
  ('table_green',      'arena', 'table', 'common'),
  ('table_black',      'arena', 'table', 'common'),
  ('table_wood',       'arena', 'table', 'common'),
  ('table_cherry',     'arena', 'table', 'common'),
  ('table_purple',     'arena', 'table', 'common'),
  ('table_camo',       'arena', 'table', 'common'),
  -- 고급: 물건이 탁구대가 됨 (공이 튀면 반응)
  ('table_office',     'arena', 'table', 'rare'),
  ('table_parcel',     'arena', 'table', 'rare'),
  ('table_bed',        'arena', 'table', 'rare'),
  ('table_go',         'arena', 'table', 'rare'),
  ('table_pyeongsang', 'arena', 'table', 'rare'),
  ('table_toast',      'arena', 'table', 'rare'),
  ('table_book',       'arena', 'table', 'rare'),
  -- 전설: 스매시 득점·긴 랠리에 특별한 연출
  ('table_arcade',     'arena', 'table', 'legend'),
  ('table_carpet',     'arena', 'table', 'legend'),
  ('table_turtle',     'arena', 'table', 'legend'),
  ('table_cake',       'arena', 'table', 'legend'),
  ('table_cloud',      'arena', 'table', 'legend')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;
