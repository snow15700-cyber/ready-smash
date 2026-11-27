-- 준비하시고, 스매시! — 44: 🛒 사람들이 판 만큼 다음 시세 (docs/dev/fishing.md 7장·13-1 ③, 사용자 확정 11/27 '중간' · 실시간 표시 안 함)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 43 다음에 실행.
--
--  · 횟집에서 팔린 마리 수(팔기 + 가방이 꽉 차서 바로 팔린 것, 고양이 밥은 빼고)를 회차 × 물고기 × 사람으로 기록
--  · 다음 회차 값: 지난 회차에 전체 10마리 이상 팔렸을 때만 —
--      2명 이상이 판 물고기 중 가장 많이 팔린 1등 ×0.8 · 2등 ×0.9 (같은 수면 id 순서) · 일반 물고기 중 하나도 안 팔린 것 ×1.1
--  · 값 = 43의 값(📰 소식까지) → floor((값 × 8·9·11 + 5) / 10). 팔기·꽉 찬 가방·고양이 밥·별 배율은 이 값을 씀
--  · 브라우저는 pingpong_fish_news의 sold(지난 9회차, 지금 회차는 빼고)로 같은 계산(src/games/fishing/market.js demandOf)

create table if not exists public.pingpong_fish_sold (
  period    bigint not null,                 -- 회차 번호(한국 날짜 번호 × 10 + 그날 몇 번째 쉬는 시간)
  fish_id   text not null,
  player_id uuid not null,
  n         int not null default 0,
  primary key (period, fish_id, player_id)
);
alter table public.pingpong_fish_sold enable row level security;
revoke all on public.pingpong_fish_sold from anon, authenticated;

create or replace function public.pingpong__fish_sold_add(p_player uuid, p_fish text, p_n int) returns void
language sql volatile set search_path = public as $$
  insert into pingpong_fish_sold(period, fish_id, player_id, n) values (pingpong__fish_period(now()), p_fish, p_player, p_n)
    on conflict (period, fish_id, player_id) do update set n = pingpong_fish_sold.n + excluded.n
$$;
revoke all on function public.pingpong__fish_sold_add(uuid, text, int) from public, anon, authenticated;

-- 바로 앞 회차 (market.js prevPeriod): 그날 1번째면 앞 평일의 8번째
create or replace function public.pingpong__fish_prev_period(p_per bigint) returns bigint
language plpgsql immutable set search_path = public as $$
declare d bigint := p_per / 10; k int := mod(p_per, 10);
begin
  if k > 1 then return d * 10 + k - 1; end if;
  loop d := d - 1; exit when mod(d + 4, 7) between 1 and 5; end loop;
  return d * 10 + 8;
end $$;
revoke all on function public.pingpong__fish_prev_period(bigint) from public, anon, authenticated;

-- 그 회차에 그 물고기 값에 곱하는 수 × 10 (8 · 9 · 11, 아니면 10) — market.js demandOf와 같게
create or replace function public.pingpong__fish_demand_x(p_fish text, p_per bigint) returns int
language plpgsql stable set search_path = public as $$
declare
  all17 constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer',
                                 'seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon'];
  prev bigint := pingpong__fish_prev_period(p_per); tot bigint; top text[];
begin
  select coalesce(sum(n), 0) into tot from pingpong_fish_sold where period = prev and fish_id = any(all17);
  if tot < 10 then return 10; end if;
  select array_agg(f order by sn desc, f collate "C") into top
    from (select fish_id as f, sum(n) as sn from pingpong_fish_sold where period = prev and fish_id = any(all17)
           group by fish_id having count(*) >= 2 and sum(n) > 0) t;
  if top[1] = p_fish then return 8; end if;
  if top[2] = p_fish then return 9; end if;
  if p_fish = any(all17[1:7]) and not exists (select 1 from pingpong_fish_sold where period = prev and fish_id = p_fish and n > 0) then return 11; end if;
  return 10;
end $$;
revoke all on function public.pingpong__fish_demand_x(text, bigint) from public, anon, authenticated;

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js prices) — 42 + 📰 소식(43) + 🛒 지난 회차 판매(44)
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  big constant text[] := array['seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon']; -- rules.js 희귀 8 · 전설 2 순서
  g text; s bigint; j int; i int; mx float8; v_out int := 0; per bigint; w text;
begin
  select grade into g from pingpong_fish where id = p_fish and kind = 'fish';
  if g is null then return 0; end if;
  per := pingpong__fish_period(p_now);
  s := mod(77003 + per * 7919, M);
  s := mod(s * 1664525 + 1013904223, M); j := floor(s::float8 / M * 7);
  if g <> 'common' then
    s := pingpong__fish_xs32(pingpong__fish_xs32(mod(88001 + per * 7919, M)));
    v_out := case when g = 'rare' then 200 else 400 end; -- 목록에 없는 새 물고기(없어야 함)
    for i in 1 .. array_length(big, 1) loop
      s := mod(s * 1664525 + 1013904223, M);
      if big[i] = p_fish then
        if i <= 8 then v_out := floor(200 * (0.8 + (s::float8 / M) * 0.4) + 0.5);
        else v_out := floor(400 * (0.5 + (s::float8 / M) * 1.0) + 0.5); end if;
      end if;
    end loop;
  else
    for i in 0 .. 6 loop
      s := mod(s * 1664525 + 1013904223, M); mx := 0.6 + (s::float8 / M) * 0.25;
      if ids[i + 1] = p_fish then v_out := floor(50 * (case when i = j then 2 else mx end) + 0.5); end if;
    end loop;
  end if;
  select n.wx into w from pingpong_fish_news n where n.period = per;
  v_out := (v_out * pingpong__fish_news_x(p_fish, per, w, ids[j + 1]) + 5) / 10;
  return (v_out * pingpong__fish_demand_x(p_fish, per) + 5) / 10; -- 44 🛒
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 43과 같음(날씨 알리기 + 최근 회차 날씨) + 🛒 지난 회차들의 팔린 수
-- 로그인 안 해도 부름(시세표는 누구나 봄). 날씨를 모르면 p_wx = null(읽기만)
create or replace function public.pingpong_fish_news(p_wx text default null) returns json
language plpgsql security definer set search_path = public as $$
declare per bigint := pingpong__fish_period(now());
begin
  if p_wx in ('clear', 'cloudy', 'rain', 'snow') then
    insert into pingpong_fish_news(period, wx) values (per, p_wx) on conflict (period) do nothing;
  end if;
  return json_build_object('status', 'ok', 'period', per, 'news', coalesce((
    select json_agg(json_build_object('p', t.period, 'wx', t.wx) order by t.period desc)
      from (select period, wx from pingpong_fish_news order by period desc limit 12) t), '[]'::json),
    -- 44 🛒 지난 9회차의 팔린 수 [{ p, f, n(마리), k(판 사람 수) }] — 지금 회차는 안 보여 줌(사용자 확정)
    'sold', coalesce((
    select json_agg(json_build_object('p', s.period, 'f', s.fish_id, 'n', s.n, 'k', s.k) order by s.period desc, s.fish_id)
      from (select period, fish_id, sum(n)::int as n, count(*)::int as k from pingpong_fish_sold
             where period in (select distinct period from pingpong_fish_sold where period < per order by period desc limit 9)
             group by period, fish_id) s), '[]'::json));
end $$;
revoke all on function public.pingpong_fish_news(text) from public;
grant execute on function public.pingpong_fish_news(text) to anon, authenticated;

-- 잡기 (41과 같음 + 가방이 꽉 차서 바로 팔면 🛒 팔린 수에 더함)
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
        perform pingpong__fish_sold_add(pl.id, v_item, 1); -- 44 🛒
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

-- 🍣 팔기 (41과 같음 + 판 마리 수를 🛒 팔린 수에 더함)
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
      perform pingpong__fish_sold_add(pl.id, r.fish_id, k); -- 44 🛒
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
