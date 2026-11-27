-- 준비하시고, 스매시! — 41: ⭐ 품질 별 → 값 (docs/dev/fishing.md 7장·13-1 ①, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 40 다음에 실행.
--
--  · 줄다리기 정확도(Perfect 1 · Good 0.5 · 놓침 0 ÷ 노트 수)로 별: 85%↑ ★★★ · 60%↑ ★★ · 35%↑ ★ · 그 아래 별 없음 (브라우저가 계산, market.js qualityOf)
--  · 값 = 시세 × 1.3 · 1.1 · 1.0 · 0.8 (별 3·2·1·0), 0.1코인 단위로 반올림 (market.js priceOf · QUAL_X). 크기는 값과 상관없음
--  · ⚠️ 별은 서버가 확인 못 함 → 범위(0~3)만 자르고, 배율 차이를 작게 + 하루 한도 1000은 그대로
--  · 가방 칸 = 사람 × 종류 × 별. 41 전에 가방에 있던 것은 ★(×1.0)
--  · 옛 함수(별 없는 잡기·팔기)는 지우고 별 인자에 기본값을 둠 → 옛 화면(main)도 그대로 불러짐

alter table public.pingpong_fish_bag add column if not exists q smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pingpong_fish_bag_q_check') then
    alter table public.pingpong_fish_bag add constraint pingpong_fish_bag_q_check check (q between 0 and 3);
  end if;
  if not exists (select 1 from information_schema.key_column_usage
                  where table_schema = 'public' and table_name = 'pingpong_fish_bag' and constraint_name = 'pingpong_fish_bag_pkey' and column_name = 'q') then
    alter table public.pingpong_fish_bag drop constraint if exists pingpong_fish_bag_pkey;
    alter table public.pingpong_fish_bag add primary key (player_id, fish_id, q);
  end if;
end $$;

create or replace function public.pingpong__fish_bag_json(p_player uuid) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', fish_id, 'q', q, 'n', n) order by fish_id, q desc), '[]'::json)
    from pingpong_fish_bag where player_id = p_player and n > 0
$$;
revoke all on function public.pingpong__fish_bag_json(uuid) from public, anon, authenticated;

-- 별 q의 값 (0.1코인 단위): 시세 × 배율(8·10·11·13 ÷ 10) 반올림 — market.js priceOf와 같게
create or replace function public.pingpong__fish_qprice(p_fish text, p_now timestamptz, p_q int) returns int
language sql stable set search_path = public as $$
  select floor((pingpong__fish_price(p_fish, p_now) * (array[8, 10, 11, 13])[least(3, greatest(0, coalesce(p_q, 1))) + 1] + 5) / 10.0)::int
$$;
revoke all on function public.pingpong__fish_qprice(text, timestamptz, int) from public, anon, authenticated;

-- 잡기 (40과 같음 + 별 p_q: 가방의 그 별 칸에 · 가방이 꽉 차서 바로 팔 때 별 값)
drop function if exists public.pingpong_fish_finish(text, text, boolean, boolean);
create or replace function public.pingpong_fish_finish(p_token text, p_cast text, p_ok boolean, p_perfect boolean, p_q int default 1) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c jsonb; v_kind text; v_item text; v_grade text; v_cm numeric(5, 1); v_s numeric(5, 1);
  stage text; min_sec int; el float8;
  base int := 0; brk int := 0; brk_pct int := 50; total int; 
  st record; dx pingpong_fish_dex; v_first boolean := false; v_rec boolean := false; v_pieces int := 0;
  run int; ok text[] := array[]::text[]; fresh text[];
  nfish int; njunk int; v_bagn int := 0; v_bagged boolean := false; v_sold boolean := false;
  today date := (now() at time zone 'Asia/Seoul')::date; used int; v_capped boolean := false;
  v_q smallint := least(3, greatest(0, coalesce(p_q, 1))); -- 별은 브라우저가 알려 줌 → 범위만 자름(배율 차이가 작고 하루 한도 1000)
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  c := pl.fish_cast;
  if c is null or c->>'id' is distinct from p_cast then return json_build_object('status', 'no_cast'); end if;
  update pingpong_players set fish_cast = null where id = pl.id; -- 한 번만
  v_kind := c->>'kind'; v_item := c->>'item'; v_grade := c->>'grade'; v_cm := (c->>'cm')::numeric;
  v_s := coalesce((c->>'s')::numeric, v_cm); -- 34 전에 던진 것은 cm = 점수
  run := coalesce((pl.ach_n->>'fish_pr')::int, 0);
  if not coalesce(p_ok, false) then
    update pingpong_players set ach_n = ach_n || jsonb_build_object('fish_pr', 0) where id = pl.id returning * into pl;
    return json_build_object('status', 'ok', 'caught', false, 'player', pingpong__player_json(pl));
  end if;
  stage := case when v_kind = 'junk' then 'junk' else v_grade end;
  min_sec := case stage when 'junk' then 4 when 'common' then 6 when 'rare' then 11 else 16 end;
  el := extract(epoch from clock_timestamp()) - (c->>'at')::float8;
  if el < min_sec then return json_build_object('status', 'too_fast'); end if;

  if v_kind = 'fish' then
    select coalesce(sum(n), 0) into v_bagn from pingpong_fish_bag where player_id = pl.id;
    if v_bagn < 30 then -- 가방에 (market.js BAG_MAX)
      insert into pingpong_fish_bag(player_id, fish_id, q, n) values (pl.id, v_item, v_q, 1)
        on conflict (player_id, fish_id, q) do update set n = pingpong_fish_bag.n + 1;
      v_bagged := true; v_bagn := v_bagn + 1;
    else -- 가방이 꽉 참 → 바로 지금 시세로 (한 마리 값 내림, 쉬는 시간 보너스 없음). 오늘 한도(1000)를 넘으면 못 팔고 놓아줌
      base := pingpong__fish_qprice(v_item, now(), v_q) / 10;
      used := case when pl.fish_day = today then pl.fish_day_coins else 0 end;
      if used + base > 1000 then base := 0; v_capped := true;
      else
        v_sold := true;
        update pingpong_players set fish_day = today, fish_day_coins = used + base where id = pl.id;
      end if;
    end if;
  end if;
  total := base + brk;

  if v_kind = 'paddle' then
    if exists (select 1 from pingpong_inventory where player_id = pl.id and item_id = v_item) then v_pieces := 30;
    else insert into pingpong_inventory(player_id, item_id) values (pl.id, v_item) on conflict do nothing; end if;
  else
    select * into dx from pingpong_fish_dex where player_id = pl.id and fish_id = v_item;
    v_first := not found;
    v_rec := v_kind = 'fish' and (v_first or v_cm > dx.best);
    insert into pingpong_fish_dex(player_id, fish_id, n, best, best_at) values (pl.id, v_item, 1, v_cm, case when v_kind = 'fish' then now() end)
      on conflict (player_id, fish_id) do update set n = pingpong_fish_dex.n + 1,
        best = greatest(pingpong_fish_dex.best, excluded.best),
        best_at = case when excluded.best > pingpong_fish_dex.best then now() else pingpong_fish_dex.best_at end;
    if v_kind = 'fish' then insert into pingpong_fish_log(player_id, fish_id, cm, score) values (pl.id, v_item, v_cm, v_s); end if;
  end if;
  run := case when coalesce(p_perfect, false) then run + 1 else 0 end;
  update pingpong_players set coins = coins + total, pieces = pingpong_players.pieces + v_pieces,
         ach_n = ach_n || jsonb_build_object('fish_pr', run)
    where id = pl.id returning * into pl;

  select count(*) filter (where f.kind = 'fish'), count(*) filter (where f.kind = 'junk') into nfish, njunk
    from pingpong_fish_dex x join pingpong_fish f on f.id = x.fish_id where x.player_id = pl.id;
  if nfish >= 10 then ok := ok || 'fish10'::text; end if;
  if nfish >= (select count(*) from pingpong_fish where kind = 'fish') then ok := ok || 'fish_all'::text; end if;
  if njunk >= (select count(*) from pingpong_fish where kind = 'junk') then ok := ok || 'junk_all'::text; end if;
  if v_item = 'baguette' then ok := ok || 'fish_bread'::text; end if;
  if v_kind = 'fish' and v_s >= 88 then ok := ok || 'fish_big'::text; end if;
  if v_kind = 'fish' and v_grade = 'legend' then ok := ok || 'fish_legend'::text; end if;
  if run >= 10 then ok := ok || 'fish_perf10'::text; end if;
  fresh := pingpong__ach_grant(pl.id, ok);
  select * into pl from pingpong_players where id = pl.id;
  return json_build_object('status', 'ok', 'caught', true, 'cast', c - 'at', 'q', case when v_kind = 'fish' then v_q end, 'coins', total, 'bonus', least(brk, total), 'bonus_pct', brk_pct,
    'capped', v_capped, 'day_coins', (select case when fish_day = today then fish_day_coins else 0 end from pingpong_players where id = pl.id), 'day_cap', 1000, 'bagged', v_bagged, 'sold', v_sold, 'bag', pingpong__fish_bag_json(pl.id), 'first', v_first, 'rec', v_rec, 'best', greatest(coalesce(dx.best, 0), v_cm), 'big', v_kind = 'fish' and v_s >= 88,
    'pieces', v_pieces,
    'new', coalesce((select json_agg(json_build_object('id', x.id, 'coins', case x.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach x where x.id = any(fresh)), '[]'::json),
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_finish(text, text, boolean, boolean, int) from public;
grant execute on function public.pingpong_fish_finish(text, text, boolean, boolean, int) to anon, authenticated;

-- 🍣 팔기: p_fish = 물고기 id 또는 null(전부) · p_q = 그 별만 또는 null(별 상관없이). 40과 같고 값만 별 값, 순서는 값 → id → 별 많은 것 (market.js sellPlan)
drop function if exists public.pingpong_fish_sell(text, text);
create or replace function public.pingpong_fish_sell(p_token text, p_fish text, p_q int default null) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  today date := (now() at time zone 'Asia/Seoul')::date; used int; left10 bigint;
  t10 bigint := 0; k int; v_kept int := 0; v_any boolean := false; v_coins int; v_sold jsonb := '[]'::jsonb; r record;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into pl from pingpong_players where id = pl.id for update; -- 두 번 눌러도 한 번만
  used := case when pl.fish_day = today then pl.fish_day_coins else 0 end;
  left10 := greatest(0, 1000 - used) * 10;
  for r in select b.fish_id, b.q, b.n, pingpong__fish_qprice(b.fish_id, now(), b.q) as p
             from pingpong_fish_bag b where b.player_id = pl.id and b.n > 0 and (p_fish is null or b.fish_id = p_fish) and (p_q is null or b.q = p_q)
             order by 4 desc, b.fish_id collate "C", b.q desc loop
    v_any := true;
    continue when r.p <= 0;
    k := least(r.n, floor((left10 - t10)::float8 / r.p)::int);
    if k > 0 then
      update pingpong_fish_bag set n = n - k where player_id = pl.id and fish_id = r.fish_id and q = r.q;
      t10 := t10 + k * r.p;
      v_sold := v_sold || jsonb_build_array(jsonb_build_object('id', r.fish_id, 'q', r.q, 'n', k, 'price', r.p));
    end if;
    v_kept := v_kept + r.n - k;
  end loop;
  if not v_any then return json_build_object('status', 'empty', 'bag', pingpong__fish_bag_json(pl.id), 'day_coins', used, 'day_cap', 1000); end if;
  delete from pingpong_fish_bag where player_id = pl.id and n <= 0;
  if t10 = 0 then return json_build_object('status', 'capped', 'kept', v_kept, 'bag', pingpong__fish_bag_json(pl.id), 'day_coins', used, 'day_cap', 1000); end if;
  v_coins := floor(t10 / 10.0);
  update pingpong_players set coins = coins + v_coins, fish_day = today, fish_day_coins = used + v_coins where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', v_coins, 'bonus', 0, 'bonus_pct', 0, 'sold', v_sold, 'kept', v_kept,
    'day_coins', used + v_coins, 'day_cap', 1000, 'bag', pingpong__fish_bag_json(pl.id), 'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_sell(text, text, int) from public;
grant execute on function public.pingpong_fish_sell(text, text, int) to anon, authenticated;

-- 🐱 고양이 밥 (37과 같음 + 가방에서 지금 가장 싼 칸 = 별 값으로, 같으면 id → 별 적은 것 — market.js cheapestIn)
create or replace function public.pingpong_cat_feed(p_token text, p_cat text) returns json
language plpgsql security definer set search_path = public as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c pingpong_cat; v_fish text; v_q smallint; v_before int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_cat is null or p_cat not in ('cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese') then return json_build_object('status', 'bad_cat'); end if;
  perform 1 from pingpong_players where id = pl.id for update; -- 두 번 눌러도 한 번만
  select * into c from pingpong_cat where player_id = pl.id and cat_id = p_cat;
  if c.fed_at is not null and c.fed_at > now() - interval '1 hour' then
    return json_build_object('status', 'wait', 'wait', ceil(extract(epoch from (c.fed_at + interval '1 hour' - now())))::int, 'cats', pingpong__cat_json(pl.id));
  end if;
  select fish_id, q into v_fish, v_q from pingpong_fish_bag where player_id = pl.id and n > 0
    order by pingpong__fish_qprice(fish_id, now(), q), fish_id collate "C", q limit 1;
  if v_fish is null then return json_build_object('status', 'no_fish', 'bag', pingpong__fish_bag_json(pl.id)); end if;
  update pingpong_fish_bag set n = n - 1 where player_id = pl.id and fish_id = v_fish and q = v_q;
  delete from pingpong_fish_bag where player_id = pl.id and n <= 0;
  v_before := coalesce(c.pts, 0);
  insert into pingpong_cat(player_id, cat_id, pts, fed_at) values (pl.id, p_cat, 1, now())
    on conflict (player_id, cat_id) do update set pts = pingpong_cat.pts + 1, fed_at = now();
  return json_build_object('status', 'ok', 'fish', v_fish, 'pts', v_before + 1,
    'up', least(5, (v_before + 1) / 10) > least(5, v_before / 10),
    'cats', pingpong__cat_json(pl.id), 'bag', pingpong__fish_bag_json(pl.id));
end $$;
revoke all on function public.pingpong_cat_feed(text, text) from public;
grant execute on function public.pingpong_cat_feed(text, text) to anon, authenticated;
