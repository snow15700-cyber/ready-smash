-- 준비하시고, 스매시! — 19단계: 쉬는 시간 보너스 (18 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 1대1·2대2 경기의 시작이나 끝이 쉬는 시간이면 그 판 코인 +50% (사용자 확정 11/18).
--  · 평일(월~금)만, 한국 시간. 수업 전(09시 전)·수업 후(18시 뒤)는 안 줌.
--  · 쉬는 시간 = 09:50~10:00, 10:50~11:00, 11:30~13:00(점심), 13:50~14:00, 14:50~15:00, 15:50~16:00, 16:50~17:00, 17:50~18:00
--  · 그 판 코인 전부(참여·승리·퍼펙트·랠리·연승)의 50%, 올림. 혼자 하기·업적·출석 코인에는 없음.
--  · 브라우저 시계가 아니라 서버 시계로 정한다. 화면 쪽 같은 규칙: src/breaks.js

-- 그 시각이 쉬는 시간인지 (매시 50분~정각은 9시~17시대, 점심 11:30~13:00)
create or replace function public.pingpong__is_break(t timestamptz) returns boolean
language sql stable set search_path = public as $$
  select extract(isodow from l) between 1 and 5 and (
           (extract(hour from l) between 9 and 17 and extract(minute from l) >= 50)
           or (l::time >= time '11:30' and l::time < time '13:00'))
    from (select t at time zone 'Asia/Seoul' as l) s
$$;
revoke all on function public.pingpong__is_break(timestamptz) from public, anon, authenticated;

-- ───────── 경기 결과 + 코인 정산 (18의 pingpong_match_finish에 쉬는 시간 보너스만 더함) ─────────
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
  brk int;
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

  -- 19: 쉬는 시간 보너스 — 경기 시작이나 끝이 평일 쉬는 시간이면 이 판 코인 +50% (올림). 시각은 서버 시계
  if total > 0 and (pingpong__is_break(m.started_at) or pingpong__is_break(now())) then
    brk := (total + 1) / 2;
    items := items || json_build_object('label', '☕ 쉬는 시간 +50%', 'coins', brk);
    total := total + brk;
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

revoke all on function public.pingpong_match_finish(text, uuid, boolean, int, int) from public;
grant execute on function public.pingpong_match_finish(text, uuid, boolean, int, int) to anon, authenticated;
