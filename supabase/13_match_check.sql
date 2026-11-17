-- 준비하시고, 스매시! — 13단계: 서버가 경기를 직접 확인하기 (부정 방지, 12 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 예전에는 브라우저가 "이겼어요"라고 보내면 서버가 그대로 믿었다 (경기 없이 함수만 불러도 코인이 쌓임).
-- 이제는:
--  · 경기가 시작될 때 각 선수의 PC가 자기 열쇠(토큰)로 그 경기에 '입장'한다 (pingpong_match_join).
--    → 남의 계정을 상대로 적어 넣을 수 없다. 입장은 경기 시작 후 30초 안에만.
--  · 결과는 그 경기 번호로, 입장한 사람만, 한 번만 낼 수 있다 (pingpong_match_finish).
--  · 시작 후 25초가 안 지난 경기는 결과를 받지 않는다 (5점 경기는 사람이 아무리 빨라도 그보다 오래 걸린다).
--  · 같은 상대와는 하루(한국 날짜) 5판까지만 보통 코인. 6판째부터는 '경기 참여 +10'만 (승리·퍼펙트·랠리·연승 보너스 없음).
--    상대가 손님이면 손님 모두를 한 상대로 친다. 2대2는 상대 두 명을 묶어서 센다. 전적·랭킹은 제한 없이 기록.
--  · 상대 전적·팀원(업적)은 브라우저가 아니라 서버가 경기 입장 기록에서 찾는다.
--  · 두 사람이 서로 "내가 이겼다"고 하면 경기에 disputed 표시 (운영자 확인용, 아래 쿼리).
--
-- ※ 이 파일을 실행해도 예전 함수(main 배포본이 쓰는 것)는 그대로 둔다.
--   test를 main에 합친 뒤에 14_close_old.sql을 실행해서 예전 함수를 닫아야 구멍이 완전히 막힌다.

create table if not exists public.pingpong_matches (
  id         uuid primary key,
  mode       text not null check (mode in ('1v1', '2v2')),
  started_at timestamptz not null default now(),
  winner     int,                         -- 처음 들어온 결과로 정한 이긴 쪽 (0 | 1)
  disputed   boolean not null default false
);
create table if not exists public.pingpong_match_players (
  match_id    uuid not null references public.pingpong_matches(id) on delete cascade,
  player_id   uuid not null references public.pingpong_players(id) on delete cascade,
  side        int  not null check (side in (0, 1)),
  joined_at   timestamptz not null default now(),
  reported_at timestamptz,                -- 결과를 낸 시각 (null = 아직)
  won         boolean,
  opp_key     text,                       -- 같은 상대 판 수를 세는 열쇠 (모드 + 상대 번호들)
  ach_done    boolean not null default false,
  people_done boolean not null default false,
  primary key (match_id, player_id)
);
create index if not exists pingpong_match_players_day on public.pingpong_match_players (player_id, opp_key, reported_at);
alter table public.pingpong_matches enable row level security;
alter table public.pingpong_match_players enable row level security;
revoke all on public.pingpong_matches, public.pingpong_match_players from anon, authenticated;

-- 경기 입장. 방장이 정한 경기 번호(p_match)로 각자 부른다. 처음 부른 사람이 경기를 만든다.
-- 결과 status: ok | no_session | bad | late(시작 30초 지남) | full | mode(모드가 다름)
create or replace function public.pingpong_match_join(p_token text, p_match uuid, p_mode text, p_side int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  per int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_match is null or p_mode not in ('1v1', '2v2') or p_side not in (0, 1) then
    return json_build_object('status', 'bad');
  end if;
  insert into pingpong_matches(id, mode) values (p_match, p_mode) on conflict (id) do nothing;
  select * into m from pingpong_matches where id = p_match for update;
  if m.mode <> p_mode then return json_build_object('status', 'mode'); end if;
  if exists (select 1 from pingpong_match_players where match_id = m.id and player_id = pl.id) then
    return json_build_object('status', 'ok');
  end if;
  if m.started_at < now() - interval '30 seconds' then return json_build_object('status', 'late'); end if;
  per := case when m.mode = '1v1' then 1 else 2 end;
  if (select count(*) from pingpong_match_players where match_id = m.id and side = p_side) >= per then
    return json_build_object('status', 'full');
  end if;
  insert into pingpong_match_players(match_id, player_id, side) values (m.id, pl.id, p_side);
  return json_build_object('status', 'ok');
end $$;

-- 경기 결과 + 코인 정산 (04의 pingpong_finish_match를 대신함)
-- 결과 { status, player, h2h, coins: { total, items } }
-- status: ok | no_session | no_match(입장 안 한 경기) | done(이미 냄) | too_fast(25초 전) | too_old(1시간 지남)
create or replace function public.pingpong_match_finish(
  p_token text, p_match uuid, p_won boolean, p_perfect3 int, p_rally10 int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  opp uuid;
  okey text;
  played int;
  full_coins boolean;
  n_perf int := least(greatest(coalesce(p_perfect3, 0), 0), 3);
  n_rally int := least(greatest(coalesce(p_rally10, 0), 0), 3);
  my_side_won int;
  streak int;
  items json[] := array[]::json[];
  total int := 0;
  day_start timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_won is null then return json_build_object('status', 'bad'); end if;
  select * into m from pingpong_matches where id = p_match for update;
  if m.id is null then return json_build_object('status', 'no_match'); end if;
  select * into me from pingpong_match_players where match_id = m.id and player_id = pl.id;
  if me.player_id is null then return json_build_object('status', 'no_match'); end if;
  if me.reported_at is not null then return json_build_object('status', 'done'); end if;
  if m.started_at > now() - interval '25 seconds' then return json_build_object('status', 'too_fast'); end if;
  if m.started_at < now() - interval '1 hour' then return json_build_object('status', 'too_old'); end if;

  -- 서로 "이겼다"고 하면 표시만 해 둔다 (운영자 확인)
  my_side_won := case when p_won then me.side else 1 - me.side end;
  if m.winner is null then update pingpong_matches set winner = my_side_won where id = m.id;
  elsif m.winner <> my_side_won then update pingpong_matches set disputed = true where id = m.id;
  end if;

  -- 같은 상대 열쇠: 모드 + 상대 쪽 선수 번호(정렬). 상대가 손님뿐이면 'guest'
  select coalesce(string_agg(player_id::text, ',' order by player_id::text), 'guest') into okey
    from pingpong_match_players where match_id = m.id and side <> me.side;
  okey := m.mode || ':' || okey;
  select count(*) into played from pingpong_match_players
    where player_id = pl.id and opp_key = okey and reported_at >= day_start;
  full_coins := played < 5;

  streak := case when p_won then pl.win_streak + 1 else 0 end;
  items := items || json_build_object('label', '경기 참여', 'coins', 10); total := total + 10;
  if full_coins then
    if p_won then items := items || json_build_object('label', '승리', 'coins', 10); total := total + 10; end if;
    if n_perf > 0 then
      items := items || json_build_object('label', '퍼펙트 3연속 ×' || n_perf, 'coins', 5 * n_perf); total := total + 5 * n_perf;
    end if;
    if n_rally > 0 then
      items := items || json_build_object('label', '랠리 10회 이상 ×' || n_rally, 'coins', 5 * n_rally); total := total + 5 * n_rally;
    end if;
    if p_won and streak % 3 = 0 then
      items := items || json_build_object('label', streak || '연승', 'coins', 15); total := total + 15;
    end if;
  else
    items := items || json_build_object('label', '같은 상대 오늘 6판째부터는 참여 코인만', 'coins', 0);
  end if;

  update pingpong_match_players set reported_at = now(), won = p_won, opp_key = okey
    where match_id = m.id and player_id = pl.id;
  update pingpong_players set
    wins_1v1   = wins_1v1   + case when m.mode = '1v1' and p_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when m.mode = '1v1' and not p_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when m.mode = '2v2' and p_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when m.mode = '2v2' and not p_won then 1 else 0 end,
    win_streak = streak,
    coins = coins + total,
    last_match_at = now()
  where id = pl.id returning * into pl;

  -- 1대1 상대 전적: 상대가 실제로 이 경기에 입장했을 때만
  if m.mode = '1v1' then
    select player_id into opp from pingpong_match_players where match_id = m.id and side <> me.side;
    if opp is not null then
      insert into pingpong_h2h(player_id, opp_id, wins, losses)
        values (pl.id, opp, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end)
      on conflict (player_id, opp_id) do update set
        wins = pingpong_h2h.wins + excluded.wins, losses = pingpong_h2h.losses + excluded.losses;
    end if;
  end if;

  return json_build_object('status', 'ok', 'player', pingpong__player_json(pl),
    'h2h', case when opp is null then null else pingpong__h2h_json(pl.id, opp) end,
    'coins', json_build_object('total', total, 'items', array_to_json(items)));
end $$;

-- 경기 업적 (11의 pingpong_ach_match를 이 경기 결과로만 부름). 결과를 낸 경기에 한 번만
create or replace function public.pingpong_match_ach(p_token text, p_match uuid, p_s jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match;
  select * into me from pingpong_match_players where match_id = p_match and player_id = pl.id for update;
  if me.player_id is null or me.reported_at is null then return json_build_object('status', 'no_match'); end if;
  if me.ach_done then return json_build_object('status', 'too_soon'); end if;
  update pingpong_match_players set ach_done = true where match_id = p_match and player_id = pl.id;
  return pingpong_ach_match(p_token, m.mode, me.won, p_s);
end $$;

-- 사람 관계 업적 (12의 pingpong_ach_people). 상대·팀원은 서버가 경기 입장 기록에서 찾는다
create or replace function public.pingpong_match_people(p_token text, p_match uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  opp uuid;
  mate uuid;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match;
  select * into me from pingpong_match_players where match_id = p_match and player_id = pl.id for update;
  if me.player_id is null or not me.ach_done then return json_build_object('status', 'no_match'); end if;
  if me.people_done then return json_build_object('status', 'too_soon'); end if;
  update pingpong_match_players set people_done = true where match_id = p_match and player_id = pl.id;
  if m.mode = '1v1' then
    select player_id into opp from pingpong_match_players where match_id = p_match and side <> me.side;
  else
    select player_id into mate from pingpong_match_players where match_id = p_match and side = me.side and player_id <> pl.id;
  end if;
  return pingpong_ach_people(p_token, m.mode, me.won, opp, mate);
end $$;

-- 혼자 하기 업적 (11의 pingpong_ach_match 'ai'). 14에서 예전 함수를 닫아도 쓸 수 있게
create or replace function public.pingpong_ai_ach(p_token text, p_s jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  return pingpong_ach_match(p_token, 'ai', false, p_s);
end $$;

revoke all on function public.pingpong_ai_ach(text, jsonb) from public;
grant execute on function public.pingpong_ai_ach(text, jsonb) to anon, authenticated;
revoke all on function public.pingpong_match_join(text, uuid, text, int) from public;
revoke all on function public.pingpong_match_finish(text, uuid, boolean, int, int) from public;
revoke all on function public.pingpong_match_ach(text, uuid, jsonb) from public;
revoke all on function public.pingpong_match_people(text, uuid) from public;
grant execute on function public.pingpong_match_join(text, uuid, text, int) to anon, authenticated;
grant execute on function public.pingpong_match_finish(text, uuid, boolean, int, int) to anon, authenticated;
grant execute on function public.pingpong_match_ach(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.pingpong_match_people(text, uuid) to anon, authenticated;

-- ───────── 운영자용 (필요할 때 따로 실행) ─────────
-- ① 오늘 같은 상대와 5판 넘게 한 사람 (패작 의심)
-- select p.nick, mp.opp_key, count(*) as games, count(*) filter (where mp.won) as wins
--   from public.pingpong_match_players mp join public.pingpong_players p on p.id = mp.player_id
--  where mp.reported_at >= ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul'
--  group by p.nick, mp.opp_key having count(*) > 5 order by games desc;
-- ② 서로 이겼다고 한 경기 (조작 의심)
-- select m.id, m.mode, m.started_at, string_agg(p.nick || case when mp.won then '(승)' else '(패)' end, ', ')
--   from public.pingpong_matches m join public.pingpong_match_players mp on mp.match_id = m.id
--   join public.pingpong_players p on p.id = mp.player_id
--  where m.disputed group by m.id order by m.started_at desc;
-- ③ 상대(로그인한 사람)가 결과를 안 냈는데 이겼다고 한 경기가 많은 사람
-- select p.nick, count(*) from public.pingpong_match_players mp join public.pingpong_players p on p.id = mp.player_id
--  where mp.won and exists (select 1 from public.pingpong_match_players o where o.match_id = mp.match_id
--    and o.side <> mp.side and o.reported_at is null)
--  group by p.nick order by 2 desc;
