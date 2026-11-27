-- 준비하시고, 스매시! — 40: 물고기 값 올리기 + 낚시 하루 한도 (docs/dev/fishing.md 19장, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 35 다음에 실행(36~39 뒤에 해도 됨).
--
--  · 값: 일반 5(시세 0.6~0.85배, 대박 2배 — 그대로) · 희귀 20 · 전설 40 (전: 3 · 8 · 20). src/games/fishing/rules.js FISH_COINS와 같게
--  · 하루 한도: 물고기를 팔아서 받는 코인은 한국 날짜로 하루 1000까지 (src/games/fishing/market.js DAY_CAP)
--    - 팔 때: 비싼 것부터(같은 값이면 id 순서) 한도 안에서만 팔리고, 나머지는 가방에 그대로 (내일 팔면 됨)
--    - 가방이 꽉 차서 바로 팔릴 때: 한도를 넘으면 못 팔고 놓아줌(도감·기록은 그대로)
--    - 업적 코인은 한도와 상관없음. 쉬는 시간 보너스는 여전히 없음(사용자 11/26)

alter table public.pingpong_players
  add column if not exists fish_day       date,                    -- 낚시 판매 코인을 센 한국 날짜
  add column if not exists fish_day_coins int not null default 0;  -- 그날 물고기를 팔아 받은 코인

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js priceOf) — 35와 같고 값만 50 · 200 · 400
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  g text; s bigint; j int; i int; mx float8; v_out int := 0;
begin
  select grade into g from pingpong_fish where id = p_fish and kind = 'fish';
  if g is null then return 0; end if;
  if g = 'rare' then return 200; end if;
  if g = 'legend' then return 400; end if;
  s := mod(77003 + pingpong__fish_period(p_now) * 7919, M);
  s := mod(s * 1664525 + 1013904223, M); j := floor(s::float8 / M * 7);
  for i in 0 .. 6 loop
    s := mod(s * 1664525 + 1013904223, M); mx := 0.6 + (s::float8 / M) * 0.25;
    if ids[i + 1] = p_fish then v_out := floor(50 * (case when i = j then 2 else mx end) + 0.5); end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 잡기 (35와 같음 + 가방이 꽉 차서 바로 팔릴 때 하루 한도)
create or replace function public.pingpong_fish_finish(p_token text, p_cast text, p_ok boolean, p_perfect boolean) returns json
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
      insert into pingpong_fish_bag(player_id, fish_id, n) values (pl.id, v_item, 1)
        on conflict (player_id, fish_id) do update set n = pingpong_fish_bag.n + 1;
      v_bagged := true; v_bagn := v_bagn + 1;
    else -- 가방이 꽉 참 → 바로 지금 시세로 (한 마리 값 내림, 쉬는 시간 보너스 없음). 오늘 한도(1000)를 넘으면 못 팔고 놓아줌
      base := pingpong__fish_price(v_item, now()) / 10;
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
  return json_build_object('status', 'ok', 'caught', true, 'cast', c - 'at', 'coins', total, 'bonus', least(brk, total), 'bonus_pct', brk_pct,
    'capped', v_capped, 'day_coins', (select case when fish_day = today then fish_day_coins else 0 end from pingpong_players where id = pl.id), 'day_cap', 1000, 'bagged', v_bagged, 'sold', v_sold, 'bag', pingpong__fish_bag_json(pl.id), 'first', v_first, 'rec', v_rec, 'best', greatest(coalesce(dx.best, 0), v_cm), 'big', v_kind = 'fish' and v_s >= 88,
    'pieces', v_pieces,
    'new', coalesce((select json_agg(json_build_object('id', x.id, 'coins', case x.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach x where x.id = any(fresh)), '[]'::json),
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_finish(text, text, boolean, boolean) from public;
grant execute on function public.pingpong_fish_finish(text, text, boolean, boolean) to anon, authenticated;


-- 🍣 팔기: p_fish = 물고기 id (그 종류 전부) 또는 null (가방 전부). 코인 = 서버가 지금 시세로, 오늘 한도 안에서만 (market.js sellPlan)
-- 결과 status: ok(코인·팔린 것·남긴 수 kept) | capped(한도가 다 차서 하나도 못 팖) | empty
create or replace function public.pingpong_fish_sell(p_token text, p_fish text) returns json
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
  for r in select b.fish_id, b.n, pingpong__fish_price(b.fish_id, now()) as p
             from pingpong_fish_bag b where b.player_id = pl.id and b.n > 0 and (p_fish is null or b.fish_id = p_fish)
             order by 3 desc, b.fish_id collate "C" loop
    v_any := true;
    continue when r.p <= 0;
    k := least(r.n, floor((left10 - t10)::float8 / r.p)::int);
    if k > 0 then
      update pingpong_fish_bag set n = n - k where player_id = pl.id and fish_id = r.fish_id;
      t10 := t10 + k * r.p;
      v_sold := v_sold || jsonb_build_array(jsonb_build_object('id', r.fish_id, 'n', k, 'price', r.p));
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
revoke all on function public.pingpong_fish_sell(text, text) from public;
grant execute on function public.pingpong_fish_sell(text, text) to anon, authenticated;

-- 🎒 내 가방 (+ 오늘 판 코인)
create or replace function public.pingpong_fish_bag(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'bag', pingpong__fish_bag_json(pl.id),
    'day_coins', case when pl.fish_day = (now() at time zone 'Asia/Seoul')::date then pl.fish_day_coins else 0 end, 'day_cap', 1000);
end $$;
revoke all on function public.pingpong_fish_bag(text) from public;
grant execute on function public.pingpong_fish_bag(text) to anon, authenticated;
