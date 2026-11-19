-- 준비하시고, 스매시! — 21단계: 오늘의 미션 (20 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 사람을 섞는 일일 미션 (사용자 확정 11/19, docs/dev/accounts.md '출석·일일 미션').
--  · 매일(한국 날짜) 3개, 모두 같은 미션: 고정 '오늘 새 상대와 1판' + 후보 6개 중 날짜로 정한 2개.
--  · 미션 하나 +30코인, 3개 다 깨면 +50 더. 쉬는 시간 +50%는 안 붙음.
--  · 로그인한 사람만. 경기 미션은 상대 쪽에 로그인한 사람이 있는 경기만 (손님 상대 = 혼자 꾸민 가짜 경기와 구별 불가, 18과 같은 이유).
--  · 응원 미션은 서버가 응원을 볼 수 없어서 브라우저 말을 믿는다 (하루 한 번, 1.5초에 한 번만 셈).
--  · 화면 쪽 같은 규칙: src/missions.js (미션 이름·날짜로 고르기), src/account.js 로컬 가짜 서버.

alter table public.pingpong_players add column if not exists mission jsonb not null default '{}'::jsonb;
  -- { d: 'YYYY-MM-DD'(한국 날짜), done: [미션 id], cheer: 오늘 응원 수, cheer_at: 마지막 응원 시각(epoch) }
alter table public.pingpong_match_players add column if not exists mission_done boolean not null default false;

-- 그날의 미션 3개. 후보 6개에서 2개 고르는 15가지를 날짜마다 7칸씩 건너뛰며 돈다 (15일에 한 바퀴, 모든 짝이 한 번씩).
-- src/missions.js의 missionsOf와 같은 규칙
create or replace function public.pingpong__missions_of(d date) returns text[]
language plpgsql immutable set search_path = public as $$
declare
  pool text[] := array['duo', 'cheer3', 'rally10', 'opp3', 'win1', 'perf3'];
  k int := (((d - date '2026-01-01') * 7) % 15 + 15) % 15;
  i int; j int;
begin
  for i in 1..5 loop
    for j in i + 1..6 loop
      if k = 0 then return array['new_opp', pool[i], pool[j]]; end if;
      k := k - 1;
    end loop;
  end loop;
  return array['new_opp'];
end $$;
revoke all on function public.pingpong__missions_of(date) from public, anon, authenticated;

-- 오늘 미션 상태 (날짜가 바뀌었으면 빈 것으로)
create or replace function public.pingpong__mission_today(p pingpong_players) returns jsonb
language sql stable set search_path = public as $$
  select case when p.mission->>'d' = ((now() at time zone 'Asia/Seoul')::date)::text then p.mission
              else jsonb_build_object('d', ((now() at time zone 'Asia/Seoul')::date)::text, 'done', '[]'::jsonb, 'cheer', 0) end
$$;
revoke all on function public.pingpong__mission_today(pingpong_players) from public, anon, authenticated;

create or replace function public.pingpong__mission_json(ms jsonb) returns json
language sql stable set search_path = public as $$
  select json_build_object('day', ms->>'d',
    'list', (select json_agg(json_build_object('id', id, 'done', (ms->'done') ? id) order by n)
               from unnest(pingpong__missions_of((ms->>'d')::date)) with ordinality as x(id, n)),
    'cheer', coalesce((ms->>'cheer')::int, 0))
$$;
revoke all on function public.pingpong__mission_json(jsonb) from public, anon, authenticated;

-- 새로 깬 미션을 넣고 코인 주기. 결과 { new: [id], all: 이번에 3개 다 채움, coins }
create or replace function public.pingpong__mission_grant(p_id uuid, ms jsonb, ids text[]) returns json
language plpgsql security definer set search_path = public as $$
declare
  today text[] := pingpong__missions_of((ms->>'d')::date);
  fresh text[] := array[]::text[];
  v_id text;
  v_coins int := 0;
  all_now boolean := false;
begin
  foreach v_id in array ids loop
    if v_id = any(today) and not (ms->'done') ? v_id and not v_id = any(fresh) then fresh := fresh || v_id; end if;
  end loop;
  if array_length(fresh, 1) is not null then
    ms := jsonb_set(ms, '{done}', (ms->'done') || to_jsonb(fresh));
    v_coins := 30 * array_length(fresh, 1);
    all_now := jsonb_array_length(ms->'done') >= array_length(today, 1);
    if all_now then v_coins := v_coins + 50; end if;
  end if;
  update pingpong_players set mission = ms, coins = coins + v_coins where id = p_id;
  return json_build_object('new', to_json(fresh), 'all', all_now, 'coins', v_coins);
end $$;
revoke all on function public.pingpong__mission_grant(uuid, jsonb, text[]) from public, anon, authenticated;

-- 오늘의 미션 보기. 결과 { status, missions: { day, list: [{ id, done }], cheer } }
create or replace function public.pingpong_missions(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'missions', pingpong__mission_json(pingpong__mission_today(pl)));
end $$;

-- 경기 미션 확인. pingpong_match_finish 다음에 부른다 (결과를 낸 경기에 한 번만).
-- p_perfect3·p_rally10 = finish에 보낸 것과 같은 횟수.
-- 결과 { status, new: [id], all, coins, missions, player }  status: ok | no_session | no_match | done
create or replace function public.pingpong_mission_match(p_token text, p_match uuid, p_perfect3 int, p_rally10 int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  day_start timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
  ms jsonb;
  ok text[] := array[]::text[];
  n_opp int;
  g json;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match;
  select * into me from pingpong_match_players where match_id = p_match and player_id = pl.id for update;
  if m.id is null or me.player_id is null or me.reported_at is null or me.reported_at < day_start then
    return json_build_object('status', 'no_match');
  end if;
  if me.mission_done then return json_build_object('status', 'done'); end if;
  update pingpong_match_players set mission_done = true where match_id = m.id and player_id = pl.id;
  select * into pl from pingpong_players where id = pl.id for update;

  -- 상대 쪽에 로그인한 사람이 있는 경기만
  if exists (select 1 from pingpong_match_players where match_id = m.id and side <> me.side) then
    -- 오늘 새 상대: 이 경기 상대 중 오늘 다른 경기에서 만난 적 없는 사람이 있으면
    if exists (
      select 1 from pingpong_match_players o where o.match_id = m.id and o.side <> me.side
        and not exists (
          select 1 from pingpong_match_players mine
            join pingpong_match_players x on x.match_id = mine.match_id and x.side <> mine.side and x.player_id = o.player_id
           where mine.player_id = pl.id and mine.match_id <> m.id and mine.reported_at >= day_start)) then
      ok := ok || 'new_opp'::text;
    end if;
    -- 오늘 서로 다른 상대 3명 (결과를 낸 경기만)
    select count(distinct x.player_id) into n_opp
      from pingpong_match_players mine
      join pingpong_match_players x on x.match_id = mine.match_id and x.side <> mine.side
     where mine.player_id = pl.id and mine.reported_at >= day_start;
    if n_opp >= 3 then ok := ok || 'opp3'::text; end if;
    if m.mode = '2v2' then ok := ok || 'duo'::text; end if;
    if me.won then ok := ok || 'win1'::text; end if;
    if coalesce(p_rally10, 0) > 0 then ok := ok || 'rally10'::text; end if;
    if coalesce(p_perfect3, 0) > 0 then ok := ok || 'perf3'::text; end if;
  end if;

  ms := pingpong__mission_today(pl);
  g := pingpong__mission_grant(pl.id, ms, ok);
  select * into pl from pingpong_players where id = pl.id;
  return json_build_object('status', 'ok', 'new', g->'new', 'all', g->'all', 'coins', g->'coins',
    'missions', pingpong__mission_json(pl.mission), 'player', pingpong__player_json(pl));
end $$;

-- 관전 응원 한 번 (응원 미션이 있는 날에만 화면이 부른다). 1.5초에 한 번만 센다. 3번이면 미션 달성
-- 결과 { status, new, all, coins, missions, player }
create or replace function public.pingpong_mission_cheer(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  ms jsonb;
  t double precision := extract(epoch from now());
  n int;
  g json := json_build_object('new', '[]'::json, 'all', false, 'coins', 0);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into pl from pingpong_players where id = pl.id for update;
  ms := pingpong__mission_today(pl);
  if 'cheer3' = any(pingpong__missions_of((ms->>'d')::date)) and not (ms->'done') ? 'cheer3'
     and t - coalesce((ms->>'cheer_at')::double precision, 0) >= 1.5 then
    n := coalesce((ms->>'cheer')::int, 0) + 1;
    ms := ms || jsonb_build_object('cheer', n, 'cheer_at', t);
    if n >= 3 then g := pingpong__mission_grant(pl.id, ms, array['cheer3']);
    else update pingpong_players set mission = ms where id = pl.id;
    end if;
    select * into pl from pingpong_players where id = pl.id;
  end if;
  return json_build_object('status', 'ok', 'new', g->'new', 'all', g->'all', 'coins', g->'coins',
    'missions', pingpong__mission_json(pingpong__mission_today(pl)), 'player', pingpong__player_json(pl));
end $$;

revoke all on function public.pingpong_missions(text) from public;
grant execute on function public.pingpong_missions(text) to anon, authenticated;
revoke all on function public.pingpong_mission_match(text, uuid, int, int) from public;
grant execute on function public.pingpong_mission_match(text, uuid, int, int) to anon, authenticated;
revoke all on function public.pingpong_mission_cheer(text) from public;
grant execute on function public.pingpong_mission_cheer(text) to anon, authenticated;
