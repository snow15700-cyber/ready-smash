-- 준비하시고, 스매시! — 18단계: 보안 구멍 막기 (17 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 막는 구멍
--  ① 혼자서 가짜 경기 만들기: 계정 하나로 경기 번호를 만들고 혼자 입장 → 25초 뒤 "이겼다" → 승수·코인.
--     여러 경기를 동시에 만들면 25초에 수백 승도 가능했다.
--     · 한 사람은 '가장 최근에 입장한 경기' 하나만 결과를 낼 수 있다 (동시에 여러 경기 X).
--     · 상대 쪽에 로그인한 사람이 아무도 없는 경기(상대가 손님)는 서버가 진짜인지 알 수 없으므로 (사용자 확정)
--       승수·패수·연승·승리 업적에 안 들어가고, 코인은 하루 5판까지만 (6판째부터 0).
--     · 로그인한 같은 상대와는 (사용자 확정) 1~5판 보통 코인, 6~10판 '참여 +10'만, 11판째부터 코인 없음.
--       승패·상대 전적은 계속 기록.
--  ② 최장 랠리 랭킹 조작: 예전 pingpong_record_rally는 브라우저가 보낸 숫자(1만까지)를 그대로 믿었다.
--     · 이제 최고 기록은 pingpong_ai_rally가 정한다 (이미 '시작한 뒤 지난 시간'만큼만 인정하는 함수).
--       한 번 치는 데 최소 약 1초가 걸리므로, 조작해도 실제로 치는 것보다 빨리 기록을 올릴 수 없다.
--     · pingpong_record_rally는 닫는다.

-- ───────── ① 경기 결과 + 코인 정산 (13의 pingpong_match_finish를 대신함) ─────────
-- status: ok | no_session | bad | no_match | done | too_fast | too_old | stale(더 새 경기에 입장함)
create or replace function public.pingpong_match_finish(
  p_token text, p_match uuid, p_won boolean, p_perfect3 int, p_rally10 int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  opp uuid;
  okey text;
  has_opp boolean;
  played int;
  full_coins boolean;
  join_coins boolean;
  n_perf int := least(greatest(coalesce(p_perfect3, 0), 0), 3);
  n_rally int := least(greatest(coalesce(p_rally10, 0), 0), 3);
  my_side_won int;
  won_n boolean;   -- 승수에 넣을 승리 (상대가 손님이면 false)
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
  -- 이 경기 뒤에 다른 경기에 또 입장했으면 이 경기는 결과를 낼 수 없다 (동시에 여러 경기 막기)
  if exists (select 1 from pingpong_match_players o
              where o.player_id = pl.id and o.match_id <> m.id and o.joined_at > me.joined_at) then
    return json_build_object('status', 'stale');
  end if;

  -- 서로 "이겼다"고 하면 표시만 해 둔다 (운영자 확인)
  my_side_won := case when p_won then me.side else 1 - me.side end;
  if m.winner is null then update pingpong_matches set winner = my_side_won where id = m.id;
  elsif m.winner <> my_side_won then update pingpong_matches set disputed = true where id = m.id;
  end if;

  -- 같은 상대 열쇠: 모드 + 상대 쪽 선수 번호(정렬). 상대 쪽에 로그인한 사람이 없으면 'guest'
  select string_agg(player_id::text, ',' order by player_id::text) into okey
    from pingpong_match_players where match_id = m.id and side <> me.side;
  has_opp := okey is not null;
  okey := m.mode || ':' || coalesce(okey, 'guest');
  select count(*) into played from pingpong_match_players
    where player_id = pl.id and opp_key = okey and reported_at >= day_start;

  if has_opp then
    full_coins := played < 5;
    join_coins := played < 10;
  else
    full_coins := played < 5;
    join_coins := played < 5;
  end if;
  won_n := p_won and has_opp;
  streak := case when not has_opp then pl.win_streak when p_won then pl.win_streak + 1 else 0 end;

  if join_coins then
    items := items || json_build_object('label', '경기 참여', 'coins', 10); total := total + 10;
  end if;
  if full_coins then
    if p_won then items := items || json_build_object('label', '승리', 'coins', 10); total := total + 10; end if;
    if n_perf > 0 then
      items := items || json_build_object('label', '퍼펙트 3연속 ×' || n_perf, 'coins', 5 * n_perf); total := total + 5 * n_perf;
    end if;
    if n_rally > 0 then
      items := items || json_build_object('label', '랠리 10회 이상 ×' || n_rally, 'coins', 5 * n_rally); total := total + 5 * n_rally;
    end if;
    if won_n and streak % 3 = 0 then
      items := items || json_build_object('label', streak || '연승', 'coins', 15); total := total + 15;
    end if;
  elsif join_coins then
    items := items || json_build_object('label', '같은 상대 오늘 6판째부터는 참여 코인만', 'coins', 0);
  elsif has_opp then
    items := items || json_build_object('label', '같은 상대와는 하루 10판까지만 코인', 'coins', 0);
  else
    items := items || json_build_object('label', '손님 상대는 하루 5판까지만 코인', 'coins', 0);
  end if;
  if not has_opp then
    items := items || json_build_object('label', '손님 상대 경기는 승수에 안 들어가요', 'coins', 0);
  end if;

  update pingpong_match_players set reported_at = now(), won = p_won, opp_key = okey
    where match_id = m.id and player_id = pl.id;
  update pingpong_players set
    wins_1v1   = wins_1v1   + case when has_opp and m.mode = '1v1' and p_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when has_opp and m.mode = '1v1' and not p_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when has_opp and m.mode = '2v2' and p_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when has_opp and m.mode = '2v2' and not p_won then 1 else 0 end,
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

-- 경기 업적: 상대가 손님뿐인 경기의 승리는 승리 업적에 넣지 않는다
create or replace function public.pingpong_match_ach(p_token text, p_match uuid, p_s jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  has_opp boolean;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match;
  select * into me from pingpong_match_players where match_id = p_match and player_id = pl.id for update;
  if me.player_id is null or me.reported_at is null then return json_build_object('status', 'no_match'); end if;
  if me.ach_done then return json_build_object('status', 'too_soon'); end if;
  update pingpong_match_players set ach_done = true where match_id = p_match and player_id = pl.id;
  has_opp := exists (select 1 from pingpong_match_players where match_id = p_match and side <> me.side);
  -- 손님 상대로 이긴 경기를 '진 경기'로 넘기므로, 진 경기 업적('4:0에서 역전패')에 잘못 걸리지 않게 led40을 뺀다
  if me.won and not has_opp then p_s := coalesce(p_s, '{}'::jsonb) - 'led40'; end if;
  return pingpong_ach_match(p_token, m.mode, me.won and has_opp, p_s);
end $$;

-- 사람 관계 업적: 위와 같이 손님 상대 승리는 승리로 치지 않는다
create or replace function public.pingpong_match_people(p_token text, p_match uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
  me pingpong_match_players;
  opp uuid;
  mate uuid;
  has_opp boolean;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match;
  select * into me from pingpong_match_players where match_id = p_match and player_id = pl.id for update;
  if me.player_id is null or not me.ach_done then return json_build_object('status', 'no_match'); end if;
  if me.people_done then return json_build_object('status', 'too_soon'); end if;
  update pingpong_match_players set people_done = true where match_id = p_match and player_id = pl.id;
  has_opp := exists (select 1 from pingpong_match_players where match_id = p_match and side <> me.side);
  if m.mode = '1v1' then
    select player_id into opp from pingpong_match_players where match_id = p_match and side <> me.side;
  else
    select player_id into mate from pingpong_match_players where match_id = p_match and side = me.side and player_id <> pl.id;
  end if;
  return pingpong_ach_people(p_token, m.mode, me.won and has_opp, opp, mate);
end $$;

-- ───────── ② 혼자 하기: 랠리 끝마다 코인 + 최고 기록 (05의 pingpong_ai_rally를 대신함) ─────────
-- 인정하는 친 횟수 = 지난번 부른 뒤(또는 시작 뒤) 지난 초 + 1 까지. 최고 기록도 그 숫자로만 올라간다
create or replace function public.pingpong_ai_rally(p_token text, p_hits int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  allowed int;
  hits int;
  total int;
  got int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  allowed := case when pl.ai_at is null then 0
                  else floor(extract(epoch from now() - pl.ai_at))::int + 1 end;
  hits := least(greatest(coalesce(p_hits, 0), 0), allowed, 1000);
  total := pl.ai_rem + hits;
  got := total / 4;
  update pingpong_players set coins = coins + got, ai_rem = total % 4, ai_at = now(),
    best_rally = greatest(best_rally, hits)
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', got, 'player', pingpong__player_json(pl));
end $$;

revoke all on function public.pingpong_match_finish(text, uuid, boolean, int, int) from public;
revoke all on function public.pingpong_match_ach(text, uuid, jsonb) from public;
revoke all on function public.pingpong_match_people(text, uuid) from public;
revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_match_finish(text, uuid, boolean, int, int) to anon, authenticated;
grant execute on function public.pingpong_match_ach(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.pingpong_match_people(text, uuid) to anon, authenticated;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;

-- 예전 랠리 기록 함수는 닫는다 (브라우저가 보낸 숫자를 그대로 믿던 함수)
revoke execute on function public.pingpong_record_rally(text, int) from public, anon, authenticated;

-- ───────── 운영자용 (필요할 때 따로 실행) ─────────
-- 최장 랠리가 수상하게 큰 사람 (예전 함수로 조작했을 수 있음). 확인 뒤 필요하면 아래 update로 0으로
-- select nick, best_rally from public.pingpong_players order by best_rally desc limit 20;
-- update public.pingpong_players set best_rally = 0 where nick = '닉네임';
