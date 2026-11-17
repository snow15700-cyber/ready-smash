-- 준비하시고, 스매시! — 15단계: 배경 5종 (경기장 뽑기) (14_close_old.sql 다음, 순서는 상관없음)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. (src/items.js의 bg_ 아이템과 같게 유지)
-- 기본 배경(bg_gym, 체육관·강당)은 표에 넣지 않는다 (장착 해제 = 기본).
-- 방에서는 방장이 장착한 배경이 모두에게 보인다 (서버는 장착만 저장, 보여 주는 건 화면 쪽).

insert into public.pingpong_items(id, pool, cat, grade) values
  ('bg_commute', 'arena', 'bg', 'rare'),   -- 출근길: 도로 옆 야외 탁구대 (09시 시리즈)
  ('bg_evening', 'arena', 'bg', 'rare'),   -- 퇴근길: 사내 탁구장 (09시 시리즈)
  ('bg_picnic',  'arena', 'bg', 'rare'),   -- 소풍길: 강가 잔디밭 (09시 시리즈)
  ('bg_beach',   'arena', 'bg', 'rare'),   -- 해변
  ('bg_bakery',  'arena', 'bg', 'rare')    -- 빵집
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;

-- ※ 경기장 뽑기에는 지금 고급(배경 5종)만 있다 → 16_gacha_open.sql로 일반 아이템이 들어올 때까지 뽑기를 닫는다 (직접 구매는 가능).
-- 경기장 뽑기를 잠깐 닫아 두려면:  update public.pingpong_items set on_sale = false where pool = 'arena';
