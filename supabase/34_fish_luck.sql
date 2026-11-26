-- 준비하시고, 스매시! — 34: 물고기 크기 = '보통 크기 × 배율' + 행운 주사위 (docs/dev/fishing.md 13장, 사용자 확정 11/26)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 31 다음에 실행.
--
--  · 크기 점수 s = pingpong__fish_cm(u) (29의 식 그대로, 소수 한 자리). 배율 = s ÷ 50
--  · 실제 cm = round(s × 그 물고기 보통 크기 ÷ 50, 1). 보통 크기는 pingpong_fish.base_cm (rules.js SPECIES 다섯째 값과 같게)
--  · 월척(88)·대물(110)·괴물(150)·업적 「월척 사냥꾼」·월척 랭킹은 점수 s로 → 어떤 물고기든 공평
--  · 행운 주사위: 난수 u를 여러 번 뽑아 가장 큰 것 (rules.js luckDice와 같게)
--      처음 잡는 물고기 10마리 = 3번 · 오늘(한국 날짜) 첫 3마리 = 2번 · 그 밖 1번
--      + 바다 술렁임: 이번 주 1등 기록이 세워진 뒤 하루마다 +1 (최대 +4, 깨지면 다시 0). 이번 주 기록에만
--  · 아래 pingpong_fish_cast는 31과 같고 크기 부분만, pingpong_fish_finish는 28과 같고 점수 부분만 다르다.

alter table public.pingpong_fish add column if not exists base_cm int not null default 50;
update public.pingpong_fish f set base_cm = v.b from (values
  ('mackerel', 30), ('horse', 25), ('rockfish', 20), ('greenling', 30), ('flounder', 30), ('squid', 30), ('puffer', 25),
  ('seabream', 50), ('blackporgy', 40), ('rockcod', 40), ('yellowtail', 70), ('octopus', 60),
  ('lattegoby', 15), ('moonhair', 90), ('raindrop', 50), ('goldball', 40), ('dragon', 150)) as v(id, b)
where f.id = v.id;

alter table public.pingpong_players
  add column if not exists fish_day   date,                 -- 오늘의 첫 3마리 (한국 날짜)
  add column if not exists fish_day_n int not null default 0;

alter table public.pingpong_fish_log add column if not exists score numeric(5, 1);
update public.pingpong_fish_log set score = cm where score is null; -- 34 전 기록은 cm = 점수(모든 물고기 같은 범위였음)
create index if not exists pingpong_fish_log_player on public.pingpong_fish_log(player_id);

-- 한국 월요일 0시
create or replace function public.pingpong__fish_week_start() returns timestamptz
language sql stable set search_path = public as $$
  select (date_trunc('week', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul'
$$;
revoke all on function public.pingpong__fish_week_start() from public, anon, authenticated;

-- 행운 주사위 개수 (p_day_n = 오늘 이미 뽑은 물고기 수)
create or replace function public.pingpong__fish_dice(p_player uuid, p_day_n int) returns int
language plpgsql stable set search_path = public as $$
declare
  caught int; top_at timestamptz; base int; storm int := 0;
begin
  select count(*) into caught from pingpong_fish_log where player_id = p_player;
  base := case when caught < 10 then 3 when coalesce(p_day_n, 0) < 3 then 2 else 1 end;
  select l.at into top_at from pingpong_fish_log l where l.at >= pingpong__fish_week_start() order by l.score desc, l.at limit 1;
  if top_at is not null then storm := least(4, greatest(0, floor(extract(epoch from now() - top_at) / 86400)::int)); end if;
  return base + storm;
end $$;
revoke all on function public.pingpong__fish_dice(uuid, int) from public, anon, authenticated;

-- 던지기 (31과 같음 + 크기: 보통 크기 × 배율, 행운 주사위)
create or replace function public.pingpong_fish_cast(p_token text, p_x float8, p_z float8, p_aim float8, p_power float8, p_rain boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  sx float8 := least(20.8, greatest(1.3, coalesce(p_x, 13)));
  sz float8 := least(44.6, greatest(39.6, coalesce(p_z, 44.6)));
  aim float8 := least(1, greatest(-1, coalesce(p_aim, 0)));
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8 := -aim * 0.7;
  near int; r float8; odds int[];
  v_kind text; v_item text; v_grade text; v_dup boolean := false; v_cm numeric(5, 1) := 0; v_s numeric(5, 1) := 0;
  h int := extract(hour from now() at time zone 'Asia/Seoul');
  today date := (now() at time zone 'Asia/Seoul')::date;
  day_n int; dice int; u float8;
  paddles text[] := array['paddle_pan', 'paddle_guitar', 'paddle_keyboard', 'paddle_mouse', 'paddle_phone', 'paddle_duck', 'paddle_hammer'];
  c jsonb;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  near := pingpong__fish_near(now(), sx + sin(a) * d, sz + cos(a) * d);
  if random() < 0.01 then
    v_kind := 'paddle'; v_grade := 'rare';
    select pid into v_item from unnest(paddles) pid
      where not exists (select 1 from pingpong_inventory v where v.player_id = pl.id and v.item_id = pid) order by random() limit 1;
    if v_item is null then v_dup := true; v_item := paddles[1 + floor(random() * 7)::int]; end if;
  else
    odds := case near when 2 then array[25, 55, 20] when 1 then array[45, 43, 12] else array[72, 25, 3] end;
    r := random() * 100;
    if r < odds[1] then
      v_grade := 'common';
      v_kind := case when random() < 0.13 then 'junk' else 'fish' end;
      select f.id into v_item from pingpong_fish f where f.kind = v_kind and f.grade = 'common' order by random() limit 1;
    elsif r < odds[1] + odds[2] then
      v_grade := 'rare'; v_kind := 'fish';
      if random() < 0.4 then
        select f.id into v_item from pingpong_fish f where f.cond is not null
          and ((f.cond = 'break' and pingpong__is_break(now())) or (f.cond = 'night' and (h >= 19 or h < 6)) or (f.cond = 'rain' and coalesce(p_rain, false)))
          order by random() limit 1;
      end if;
      if v_item is null then select f.id into v_item from pingpong_fish f where f.kind = 'fish' and f.grade = 'rare' and f.cond is null order by random() limit 1; end if;
    else
      v_grade := 'legend'; v_kind := 'fish';
      select f.id into v_item from pingpong_fish f where f.grade = 'legend' order by random() limit 1;
    end if;
    if v_kind = 'fish' then -- 34: 행운 주사위 → 점수 → 그 물고기 cm
      day_n := case when pl.fish_day = today then pl.fish_day_n else 0 end;
      dice := pingpong__fish_dice(pl.id, day_n);
      select max(random()) into u from generate_series(1, dice);
      v_s := round(pingpong__fish_cm(u)::numeric, 1);
      v_cm := round(v_s * (select f.base_cm from pingpong_fish f where f.id = v_item) / 50.0, 1);
      update pingpong_players set fish_day = today, fish_day_n = day_n + 1 where id = pl.id;
    end if;
  end if;
  c := jsonb_build_object('id', md5(random()::text || clock_timestamp()::text), 'kind', v_kind, 'item', v_item, 'grade', v_grade,
                          'cm', v_cm, 's', v_s, 'dup', v_dup, 'near', near, 'at', extract(epoch from clock_timestamp()));
  update pingpong_players set fish_cast = c where id = pl.id;
  return json_build_object('status', 'ok', 'cast', c - 'at');
end $$;
revoke all on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) from public;
grant execute on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) to anon, authenticated;

-- 잡기 (28과 같음 + 월척·업적은 점수 s로, 기록에 점수도)
create or replace function public.pingpong_fish_finish(p_token text, p_cast text, p_ok boolean, p_perfect boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c jsonb; v_kind text; v_item text; v_grade text; v_cm numeric(5, 1); v_s numeric(5, 1);
  stage text; min_sec int; el float8;
  base int := 0; brk int := 0; brk_pct int := 50; total int; pocket int; capped boolean := false;
  st record; dx pingpong_fish_dex; v_first boolean := false; v_rec boolean := false; v_pieces int := 0;
  run int; ok text[] := array[]::text[]; fresh text[];
  nfish int; njunk int;
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
    base := case v_grade when 'common' then 3 when 'rare' then 8 else 20 end;
    select * into st from pingpong__set_of(pl.equip);
    if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
    if pingpong__is_break(now()) then brk := (base * brk_pct + 99) / 100; end if;
  end if;
  pocket := least(60, pl.fish_pocket + floor(coalesce(extract(epoch from now() - pl.fish_pocket_at), 0) / 60.0 * 25)::int);
  total := base + brk;
  if total > pocket then total := pocket; capped := true; end if;

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
         fish_pocket = pocket - total, fish_pocket_at = now(),
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
    'capped', capped, 'first', v_first, 'rec', v_rec, 'best', greatest(coalesce(dx.best, 0), v_cm), 'big', v_kind = 'fish' and v_s >= 88,
    'pieces', v_pieces,
    'new', coalesce((select json_agg(json_build_object('id', x.id, 'coins', case x.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach x where x.id = any(fresh)), '[]'::json),
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_finish(text, text, boolean, boolean) from public;
grant execute on function public.pingpong_fish_finish(text, text, boolean, boolean) to anon, authenticated;

-- 월척 랭킹: 점수(배율) 순서. 결과 [{ rank, nick, title, title_x, value(cm), x(배율), fish }]
create or replace function public.pingpong_fish_rank(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_kind = 'week' then pingpong__fish_week_start() else '-infinity'::timestamptz end;
begin
  if p_kind not in ('week', 'all') then return '[]'::json; end if;
  return coalesce((
    select json_agg(r order by r.rank, r.nick)
    from (
      select p.nick, p.title, case when p.title = 'nemesis' then p.ach_n->>'nemesis' end as title_x,
             b.cm as value, round(b.score / 50.0, 1) as x, b.fish_id as fish, rank() over (order by b.score desc)::int as rank
      from (select distinct on (l.player_id) l.player_id, l.fish_id, l.cm, coalesce(l.score, l.cm) as score, l.at
              from pingpong_fish_log l where l.at >= since order by l.player_id, coalesce(l.score, l.cm) desc, l.at) b
      join pingpong_players p on p.id = b.player_id
      order by b.score desc, b.at
      limit 50
    ) r), '[]'::json);
end $$;
revoke all on function public.pingpong_fish_rank(text) from public;
grant execute on function public.pingpong_fish_rank(text) to anon, authenticated;
