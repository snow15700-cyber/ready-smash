-- 준비하시고, 스매시! — 28: 낚시 (27_kim_match.sql 다음, docs/dev/fishing.md 5·9장)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 무엇이 걸릴지·몇 cm인지는 서버가 정한다(던질 때). 브라우저는 '선 자리·방향·세기'만 보내고, 잡았다/놓쳤다만 알린다.
--  · 던진 자리와 기포(모두가 같은 곳에 보는 거품)는 서버가 같은 식으로 직접 계산 (src/games/fishing/rules.js와 같게)
--  · 잡히는 것: 1% 전설 탁구채(없는 것부터, 7종 다 있으면 조각 30개) → 기포 확률로 등급 → 일반의 13%는 잡동사니
--    → 희귀는 조건(☕ 쉬는 시간 · 🌙 밤 · 🌧️ 비)이 맞으면 40%가 조건 물고기. 비는 브라우저가 알려 준 광장 날씨를 믿는다(피해 작음)
--  · 크기: 모든 물고기 20~100cm, 큰 것은 드물게. 88cm 이상 = 월척
--  · 코인: 일반 3 · 희귀 8 · 전설 20 · 잡동사니·탁구채 0. 쉬는 시간 +50%(세트 '휴가 중'이면 더). 처음 잡기 보너스 없음
--  · 속임수 막기: 던진 뒤 최소 시간(잡동사니 4초 · 일반 6초 · 희귀 11초 · 전설 16초) + 1분에 25코인씩 쌓이는 주머니(최대 60)
--  · 업적 7개(★20 · ★★50 · ★★★150) · 이번 주/역대 월척 랭킹 · 어종별 기록(도감)
--
-- ⚠️ 규칙을 바꿀 때는 src/games/fishing/rules.js와 src/account.js의 로컬 가짜 서버도 같이.

alter table public.pingpong_players
  add column if not exists fish_cast      jsonb,            -- 지금 던져 둔 것 { id, kind, item, grade, cm, dup, at }
  add column if not exists fish_pocket    int not null default 60, -- 분당 상한 주머니 (코인)
  add column if not exists fish_pocket_at timestamptz;

-- 잡히는 것 목록 (rules.js의 SPECIES·JUNK와 같게)
create table if not exists public.pingpong_fish (
  id    text primary key,
  kind  text not null check (kind in ('fish', 'junk')),
  grade text not null check (grade in ('common', 'rare', 'legend')),
  cond  text check (cond in ('break', 'night', 'rain'))
);
insert into public.pingpong_fish(id, kind, grade, cond) values
  ('mackerel', 'fish', 'common', null), ('horse', 'fish', 'common', null), ('rockfish', 'fish', 'common', null), ('greenling', 'fish', 'common', null),
  ('flounder', 'fish', 'common', null), ('squid', 'fish', 'common', null), ('puffer', 'fish', 'common', null),
  ('seabream', 'fish', 'rare', null), ('blackporgy', 'fish', 'rare', null), ('rockcod', 'fish', 'rare', null), ('yellowtail', 'fish', 'rare', null), ('octopus', 'fish', 'rare', null),
  ('lattegoby', 'fish', 'rare', 'break'), ('moonhair', 'fish', 'rare', 'night'), ('raindrop', 'fish', 'rare', 'rain'),
  ('goldball', 'fish', 'legend', null), ('dragon', 'fish', 'legend', null),
  ('stick', 'junk', 'common', null), ('can', 'junk', 'common', null), ('boot', 'junk', 'common', null), ('bottle', 'junk', 'common', null), ('kelp', 'junk', 'common', null),
  ('shell', 'junk', 'common', null), ('oldball', 'junk', 'common', null), ('brokenpaddle', 'junk', 'common', null), ('baguette', 'junk', 'common', null)
on conflict (id) do update set kind = excluded.kind, grade = excluded.grade, cond = excluded.cond;

-- 도감: 사람마다 종류별 잡은 수·가장 큰 cm
create table if not exists public.pingpong_fish_dex (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  fish_id   text not null references public.pingpong_fish(id),
  n         int not null default 0,
  best      numeric(5, 1) not null default 0,
  best_at   timestamptz,
  primary key (player_id, fish_id)
);
-- 잡은 물고기 기록 (이번 주 월척 랭킹용, 물고기만)
create table if not exists public.pingpong_fish_log (
  id        bigserial primary key,
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  fish_id   text not null references public.pingpong_fish(id),
  cm        numeric(5, 1) not null,
  at        timestamptz not null default now()
);
create index if not exists pingpong_fish_log_at on public.pingpong_fish_log(at);
alter table public.pingpong_fish enable row level security;
alter table public.pingpong_fish_dex enable row level security;
alter table public.pingpong_fish_log enable row level security;
revoke all on public.pingpong_fish from anon, authenticated;
revoke all on public.pingpong_fish_dex from anon, authenticated;
revoke all on public.pingpong_fish_log from anon, authenticated;

-- 낚시 업적 (src/achievements.js의 'fish' 분류와 같게)
insert into public.pingpong_ach(id, grade) values
  ('fish10', 1), ('fish_all', 3), ('junk_all', 2), ('fish_bread', 1), ('fish_big', 2), ('fish_legend', 3), ('fish_perf10', 2)
on conflict (id) do update set grade = excluded.grade;

-- ───────── 던진 자리 · 기포 (rules.js의 landingPoint · slotBubbles · bubbleNear와 같은 식) ─────────
-- 서는 곳 x 8.4~17.6, z 65.6 · 거리 6~18m · 부채꼴 ±0.7 라디안
-- 기포: 210초 칸마다 씨앗 91731 + 칸 × 7919 로 LCG (s·1664525 + 1013904223) mod 2³² → 1~2개, 40초씩
create or replace function public.pingpong__fish_near(p_now timestamptz, p_x float8, p_z float8) returns int
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 210);
  k bigint; s bigint; cnt int; i int;
  sx float8; aim float8; pw float8; st float8; d float8; a float8; bx float8; bz float8; dist float8;
  best int := 0;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M); -- (for 반복 변수는 int라 bigint로)
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); sx := 8.4 + (s::float8 / M) * (17.6 - 8.4);
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 210 + (s::float8 / M) * greatest(1, 210 - 40 - 2);
      if nowsec < st or nowsec > st + 40 then continue; end if;
      d := 6 + 12 * least(1, greatest(0, pw)); a := -least(1, greatest(-1, aim)) * 0.7;
      bx := sx + sin(a) * d; bz := 65.6 + cos(a) * d;
      dist := sqrt((p_x - bx) ^ 2 + (p_z - bz) ^ 2);
      best := greatest(best, case when dist <= 1.5 then 2 when dist <= 3.5 then 1 else 0 end);
    end loop;
  end loop;
  return best;
end $$;
revoke all on function public.pingpong__fish_near(timestamptz, float8, float8) from public, anon, authenticated;

-- 자동 점검용: 그 시각에 보이는 기포 자리 (rules.js의 activeBubbles와 비교)
create or replace function public.pingpong__fish_bubbles(p_now timestamptz) returns table(x float8, z float8)
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 210);
  k bigint; s bigint; cnt int; i int;
  sx float8; aim float8; pw float8; st float8; d float8; a float8;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M); -- (for 반복 변수는 int라 bigint로)
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); sx := 8.4 + (s::float8 / M) * (17.6 - 8.4);
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 210 + (s::float8 / M) * greatest(1, 210 - 40 - 2);
      if nowsec < st or nowsec > st + 40 then continue; end if;
      d := 6 + 12 * least(1, greatest(0, pw)); a := -least(1, greatest(-1, aim)) * 0.7;
      x := sx + sin(a) * d; z := 65.6 + cos(a) * d;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.pingpong__fish_bubbles(timestamptz) from public, anon, authenticated;

-- ───────── 던지기: 무엇이 걸릴지 정함 ─────────
-- p_x 선 자리(8.4~17.6) · p_aim −1~1 · p_power 0~1 · p_rain 광장에 비가 오는지(브라우저)
-- 결과 { status, cast: { id, kind, item, grade, cm, dup, near } } — 브라우저는 이걸로 리듬 단계·공개 연출을 한다
-- (미리 알려 줘도 얻는 건 없다: 코인·기록은 잡았다고 알릴 때 서버가 이 값으로 준다)
create or replace function public.pingpong_fish_cast(p_token text, p_x float8, p_aim float8, p_power float8, p_rain boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  sx float8 := least(17.6, greatest(8.4, coalesce(p_x, 13)));
  aim float8 := least(1, greatest(-1, coalesce(p_aim, 0)));
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8 := -aim * 0.7;
  near int; r float8; odds int[];
  v_kind text; v_item text; v_grade text; v_dup boolean := false; v_cm numeric(5, 1) := 0;
  h int := extract(hour from now() at time zone 'Asia/Seoul');
  paddles text[] := array['paddle_pan', 'paddle_guitar', 'paddle_keyboard', 'paddle_mouse', 'paddle_phone', 'paddle_duck', 'paddle_hammer'];
  c jsonb;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  near := pingpong__fish_near(now(), sx + sin(a) * d, 65.6 + cos(a) * d);
  if random() < 0.01 then
    -- 1% 전설 탁구채: 아직 없는 것 하나, 7종 다 있으면 아무거나 + 조각 30개 (리듬은 희귀처럼 두 단계)
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
    if v_kind = 'fish' then v_cm := round((20 + 80 * power(random(), 1.6))::numeric, 1); end if;
  end if;
  c := jsonb_build_object('id', md5(random()::text || clock_timestamp()::text), 'kind', v_kind, 'item', v_item, 'grade', v_grade,
                          'cm', v_cm, 'dup', v_dup, 'near', near, 'at', extract(epoch from clock_timestamp()));
  update pingpong_players set fish_cast = c where id = pl.id;
  return json_build_object('status', 'ok', 'cast', c - 'at');
end $$;

-- ───────── 잡았다/놓쳤다 알리기 ─────────
-- p_cast 던질 때 받은 id · p_ok 잡았는지 · p_perfect 챔질이 Perfect였는지(「손맛의 달인」 연속 세기, 브라우저 말을 믿음)
-- 결과 { status: ok | no_cast | too_fast, caught, cast, coins, bonus, bonus_pct, capped, first, rec, best, big, pieces, new: [{id, coins}], player }
create or replace function public.pingpong_fish_finish(p_token text, p_cast text, p_ok boolean, p_perfect boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c jsonb; v_kind text; v_item text; v_grade text; v_cm numeric(5, 1);
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
  run := coalesce((pl.ach_n->>'fish_pr')::int, 0);
  if not coalesce(p_ok, false) then
    update pingpong_players set ach_n = ach_n || jsonb_build_object('fish_pr', 0) where id = pl.id returning * into pl;
    return json_build_object('status', 'ok', 'caught', false, 'player', pingpong__player_json(pl));
  end if;
  stage := case when v_kind = 'junk' then 'junk' else v_grade end;
  min_sec := case stage when 'junk' then 4 when 'common' then 6 when 'rare' then 11 else 16 end;
  el := extract(epoch from clock_timestamp()) - (c->>'at')::float8;
  if el < min_sec then return json_build_object('status', 'too_fast'); end if;

  -- 코인 (물고기만) + 쉬는 시간 보너스 (세트 '휴가 중'이면 더) → 분당 상한 주머니
  if v_kind = 'fish' then
    base := case v_grade when 'common' then 3 when 'rare' then 8 else 20 end;
    select * into st from pingpong__set_of(pl.equip);
    if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
    if pingpong__is_break(now()) then brk := (base * brk_pct + 99) / 100; end if;
  end if;
  pocket := least(60, pl.fish_pocket + floor(coalesce(extract(epoch from now() - pl.fish_pocket_at), 0) / 60.0 * 25)::int);
  total := base + brk;
  if total > pocket then total := pocket; capped := true; end if;

  -- 도감·기록 (물고기·잡동사니) / 탁구채는 옷장 또는 조각
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
    if v_kind = 'fish' then insert into pingpong_fish_log(player_id, fish_id, cm) values (pl.id, v_item, v_cm); end if;
  end if;
  run := case when coalesce(p_perfect, false) then run + 1 else 0 end;
  update pingpong_players set coins = coins + total, pieces = pingpong_players.pieces + v_pieces,
         fish_pocket = pocket - total, fish_pocket_at = now(),
         ach_n = ach_n || jsonb_build_object('fish_pr', run)
    where id = pl.id returning * into pl;

  -- 업적: 도감 10종 · 물고기 17종 · 잡동사니 9개 · 바게트 · 월척 · 전설 물고기 · 챔질 Perfect 10연속
  select count(*) filter (where f.kind = 'fish'), count(*) filter (where f.kind = 'junk') into nfish, njunk
    from pingpong_fish_dex x join pingpong_fish f on f.id = x.fish_id where x.player_id = pl.id;
  if nfish >= 10 then ok := ok || 'fish10'::text; end if;
  if nfish >= (select count(*) from pingpong_fish where kind = 'fish') then ok := ok || 'fish_all'::text; end if;
  if njunk >= (select count(*) from pingpong_fish where kind = 'junk') then ok := ok || 'junk_all'::text; end if;
  if v_item = 'baguette' then ok := ok || 'fish_bread'::text; end if;
  if v_kind = 'fish' and v_cm >= 88 then ok := ok || 'fish_big'::text; end if;
  if v_kind = 'fish' and v_grade = 'legend' then ok := ok || 'fish_legend'::text; end if;
  if run >= 10 then ok := ok || 'fish_perf10'::text; end if;
  fresh := pingpong__ach_grant(pl.id, ok);
  select * into pl from pingpong_players where id = pl.id;
  return json_build_object('status', 'ok', 'caught', true, 'cast', c - 'at', 'coins', total, 'bonus', least(brk, total), 'bonus_pct', brk_pct,
    'capped', capped, 'first', v_first, 'rec', v_rec, 'best', greatest(coalesce(dx.best, 0), v_cm), 'big', v_kind = 'fish' and v_cm >= 88,
    'pieces', v_pieces,
    'new', coalesce((select json_agg(json_build_object('id', x.id, 'coins', case x.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach x where x.id = any(fresh)), '[]'::json),
    'player', pingpong__player_json(pl));
end $$;

-- ───────── 도감: 내 기록 + 어종별 기록(1명) ─────────
-- 결과 { status, dex: [{ id, n, best }], records: [{ id, nick, cm }] } (손님이면 dex 빈 목록)
create or replace function public.pingpong_fish_dex(p_token text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  return json_build_object('status', 'ok',
    'dex', coalesce((select json_agg(json_build_object('id', x.fish_id, 'n', x.n, 'best', x.best)) from pingpong_fish_dex x where x.player_id = pl.id), '[]'::json),
    'records', coalesce((select json_agg(json_build_object('id', r.fish_id, 'nick', r.nick, 'cm', r.best)) from (
        select distinct on (x.fish_id) x.fish_id, p.nick, x.best
          from pingpong_fish_dex x join pingpong_players p on p.id = x.player_id join pingpong_fish f on f.id = x.fish_id
         where f.kind = 'fish' and x.best > 0
         order by x.fish_id, x.best desc, x.best_at) r), '[]'::json));
end $$;

-- ───────── 월척 랭킹: 'week' 이번 주(한국 월요일 0시부터) | 'all' 역대. 사람마다 가장 큰 한 마리 ─────────
-- 결과 [{ rank, nick, title, title_x, value(cm), fish }] (손님도 볼 수 있음)
create or replace function public.pingpong_fish_rank(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_kind = 'week'
  then (date_trunc('week', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul' else '-infinity'::timestamptz end;
begin
  if p_kind not in ('week', 'all') then return '[]'::json; end if;
  return coalesce((
    select json_agg(r order by r.rank, r.nick)
    from (
      select p.nick, p.title, case when p.title = 'nemesis' then p.ach_n->>'nemesis' end as title_x,
             b.cm as value, b.fish_id as fish, rank() over (order by b.cm desc)::int as rank
      from (select distinct on (l.player_id) l.player_id, l.fish_id, l.cm, l.at
              from pingpong_fish_log l where l.at >= since order by l.player_id, l.cm desc, l.at) b
      join pingpong_players p on p.id = b.player_id
      order by b.cm desc, b.at
      limit 50
    ) r), '[]'::json);
end $$;

revoke all on function public.pingpong_fish_cast(text, float8, float8, float8, boolean) from public;
revoke all on function public.pingpong_fish_finish(text, text, boolean, boolean) from public;
revoke all on function public.pingpong_fish_dex(text) from public;
revoke all on function public.pingpong_fish_rank(text) from public;
grant execute on function public.pingpong_fish_cast(text, float8, float8, float8, boolean) to anon, authenticated;
grant execute on function public.pingpong_fish_finish(text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.pingpong_fish_dex(text) to anon, authenticated;
grant execute on function public.pingpong_fish_rank(text) to anon, authenticated;
