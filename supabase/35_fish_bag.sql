-- 준비하시고, 스매시! — 35: 🎒 물고기 가방 · 🍣 횟집(팔기) · 📈 시세 (docs/dev/fishing.md 14-6, 사용자 확정 11/26)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 34 다음에 실행.
--
--  · 잡은 물고기는 코인 대신 가방(30칸)에. 코인은 pingpong_fish_sell로 팔 때. 잡동사니·전설 탁구채는 지금처럼(가방 X)
--  · 가방이 꽉 찼을 때 잡으면 그 자리에서 지금 시세로 팔림(사용자 결정 전 임시 — 추천안)
--  · 시세 = src/games/fishing/market.js와 똑같이: 쉬는 시간이 시작될 때마다 새 '회차'(한국 날짜 × 10 + 몇 번째 쉬는 시간),
--    회차 번호를 씨앗으로 LCG(기포와 같은 난수). 일반 7종 중 하나 = 대박 2배, 나머지 0.6~0.85배. 값은 0.1코인 단위.
--    희귀 8 · 전설 20 고정. 팔 때 합을 내림, 쉬는 시간이면 +50%(세트 '휴가 중'이면 더)
--  · 분당 주머니(28의 fish_pocket)는 이제 안 씀: 잡는 최소 시간(6·11·16초)과 가방 30칸이 속도를 막음

-- 가방: 사람 × 물고기 종류 → 마리 수 (가격이 크기와 상관없어서 마리 수만)
create table if not exists public.pingpong_fish_bag (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  fish_id   text not null references public.pingpong_fish(id),
  n         int not null default 0 check (n >= 0),
  primary key (player_id, fish_id)
);
alter table public.pingpong_fish_bag enable row level security;
revoke all on public.pingpong_fish_bag from anon, authenticated;

create or replace function public.pingpong__fish_bag_json(p_player uuid) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', fish_id, 'n', n) order by fish_id), '[]'::json)
    from pingpong_fish_bag where player_id = p_player and n > 0
$$;
revoke all on function public.pingpong__fish_bag_json(uuid) from public, anon, authenticated;

-- 시세 회차: 한국 날짜 번호(1970-01-01부터) × 10 + 그날 몇 번째 쉬는 시간(1~8). 주말·수업 전 = 앞 평일의 8번째 (market.js period)
create or replace function public.pingpong__fish_period(p_now timestamptz) returns bigint
language plpgsql immutable set search_path = public as $$
declare
  st constant int[] := array[590, 650, 690, 830, 890, 950, 1010, 1070]; -- breaks.js BREAKS 시작(분)
  ms float8 := extract(epoch from p_now) * 1000 + 32400000;
  d bigint := floor(ms / 86400000);
  mn float8 := (ms - d * 86400000) / 60000;
  dw int := mod(d + 4, 7); i int; k int := 0;
begin
  if dw between 1 and 5 and mn >= st[1] then
    for i in 1 .. 8 loop if st[i] <= mn then k := i; end if; end loop;
    return d * 10 + k;
  end if;
  loop d := d - 1; dw := mod(d + 4, 7); exit when dw between 1 and 5; end loop;
  return d * 10 + 8;
end $$;
revoke all on function public.pingpong__fish_period(timestamptz) from public, anon, authenticated;

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js priceOf)
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  g text; s bigint; j int; i int; mx float8; v_out int := 0;
begin
  select grade into g from pingpong_fish where id = p_fish and kind = 'fish';
  if g is null then return 0; end if;
  if g = 'rare' then return 80; end if;
  if g = 'legend' then return 200; end if;
  s := mod(77003 + pingpong__fish_period(p_now) * 7919, M);
  s := mod(s * 1664525 + 1013904223, M); j := floor(s::float8 / M * 7);
  for i in 0 .. 6 loop
    s := mod(s * 1664525 + 1013904223, M); mx := 0.6 + (s::float8 / M) * 0.25;
    if ids[i + 1] = p_fish then v_out := floor(30 * (case when i = j then 2 else mx end) + 0.5); end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 잡기 (34와 같음 + 물고기는 코인 대신 가방에. 가방이 차 있으면 그 자리에서 지금 시세로 팔림. 주머니(분당 한도)는 안 씀)
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
    else -- 가방이 꽉 참 → 바로 지금 시세로 (한 마리 값 내림 + 쉬는 시간)
      v_sold := true;
      base := pingpong__fish_price(v_item, now()) / 10;
      select * into st from pingpong__set_of(pl.equip);
      if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
      if pingpong__is_break(now()) then brk := (base * brk_pct + 99) / 100; end if;
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
    'capped', false, 'bagged', v_bagged, 'sold', v_sold, 'bag', pingpong__fish_bag_json(pl.id), 'first', v_first, 'rec', v_rec, 'best', greatest(coalesce(dx.best, 0), v_cm), 'big', v_kind = 'fish' and v_s >= 88,
    'pieces', v_pieces,
    'new', coalesce((select json_agg(json_build_object('id', x.id, 'coins', case x.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach x where x.id = any(fresh)), '[]'::json),
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_finish(text, text, boolean, boolean) from public;
grant execute on function public.pingpong_fish_finish(text, text, boolean, boolean) to anon, authenticated;

-- 🍣 팔기: p_fish = 물고기 id (그 종류 전부) 또는 null (가방 전부). 코인 = 서버가 지금 시세로 (market.js sellCoins)
create or replace function public.pingpong_fish_sell(p_token text, p_fish text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  t10 bigint := 0; v_coins int; brk int := 0; brk_pct int := 50; st record; v_sold json;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  perform 1 from pingpong_players where id = pl.id for update; -- 두 번 눌러도 한 번만
  select coalesce(sum(b.n * pingpong__fish_price(b.fish_id, now())), 0),
         coalesce(json_agg(json_build_object('id', b.fish_id, 'n', b.n, 'price', pingpong__fish_price(b.fish_id, now())) order by b.fish_id), '[]'::json)
    into t10, v_sold
    from pingpong_fish_bag b where b.player_id = pl.id and b.n > 0 and (p_fish is null or b.fish_id = p_fish);
  if t10 = 0 then return json_build_object('status', 'empty', 'bag', pingpong__fish_bag_json(pl.id)); end if;
  delete from pingpong_fish_bag where player_id = pl.id and (p_fish is null or fish_id = p_fish);
  v_coins := floor(t10 / 10.0);
  if pingpong__is_break(now()) then
    select * into st from pingpong__set_of(pl.equip);
    if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
    brk := (v_coins * brk_pct + 99) / 100;
  end if;
  update pingpong_players set coins = coins + v_coins + brk where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', v_coins + brk, 'bonus', brk, 'bonus_pct', brk_pct, 'sold', v_sold,
    'bag', pingpong__fish_bag_json(pl.id), 'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_sell(text, text) from public;
grant execute on function public.pingpong_fish_sell(text, text) to anon, authenticated;

-- 🎒 내 가방
create or replace function public.pingpong_fish_bag(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'bag', pingpong__fish_bag_json(pl.id));
end $$;
revoke all on function public.pingpong_fish_bag(text) from public;
grant execute on function public.pingpong_fish_bag(text) to anon, authenticated;

-- 점검용: 그 시각의 회차·일반 7종 값 (자동 점검이 market.js와 비교. anon 못 부름)
create or replace function public.pingpong__fish_prices(p_now timestamptz) returns text
language sql stable set search_path = public as $$
  select pingpong__fish_period(p_now) || ':' || string_agg(pingpong__fish_price(id, p_now)::text, ',' order by o)
    from unnest(array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']) with ordinality as x(id, o)
$$;
revoke all on function public.pingpong__fish_prices(timestamptz) from public, anon, authenticated;
