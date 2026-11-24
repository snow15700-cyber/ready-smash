-- 준비하시고, 스매시! — 27단계: 김제빵 낀 2대2 (광장 탁구대에 3명일 때 김제빵 부르기, docs/dev/plaza.md 4·8장). 26 다음에 실행.
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
--  · 경기에 '김제빵 낀 판' 표시(kim)를 단다: 그 경기에 입장한 사람이 경기 시작 30초 안에 pingpong_match_kim을 부른다.
--  · 김제빵 낀 판(표시가 있고, 로그인해서 입장한 사람이 3명 이하)은 전적(승·패)·랭킹(승수)·연승에 안 들어간다.
--    코인은 보통 2대2와 똑같이(참여·승리·퍼펙트·랠리·세트·쉬는 시간). 연승 보너스만 없음(연승 자체를 안 세니까).
--  · 사람 4명이 다 입장한 판은 표시가 있어도 보통 판으로 센다(전적을 피하려고 표시만 다는 것을 막음).
--  · pingpong_match_finish는 24의 것에 위 규칙만 더했다(나머지 그대로).

alter table public.pingpong_matches add column if not exists kim boolean not null default false;

-- 김제빵 낀 판 표시. 결과 status: ok | no_session | no_match(입장 안 한 경기) | late(시작 30초 지남) | mode(2대2가 아님)
create or replace function public.pingpong_match_kim(p_token text, p_match uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  m pingpong_matches;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into m from pingpong_matches where id = p_match for update;
  if m.id is null or not exists (select 1 from pingpong_match_players where match_id = m.id and player_id = pl.id) then
    return json_build_object('status', 'no_match');
  end if;
  if m.mode <> '2v2' then return json_build_object('status', 'mode'); end if;
  if m.started_at < now() - interval '30 seconds' then return json_build_object('status', 'late'); end if;
  update pingpong_matches set kim = true where id = m.id;
  return json_build_object('status', 'ok');
end $$;
revoke all on function public.pingpong_match_kim(text, uuid) from public;
grant execute on function public.pingpong_match_kim(text, uuid) to anon, authenticated;


-- ───────── 경기 결과 + 코인 정산 (24 + 김제빵 낀 판) ─────────
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
  kim boolean;     -- 27: 김제빵 낀 2대2 (전적·랭킹·연승 X, 코인은 보통 2대2와 같게)
  rec boolean;     -- 27: 전적에 넣을 판인지
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
  st record;       -- 24: 입은 세트
  sb int := 0;     -- 24: 세트 보너스
  brk_pct int := 50;
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
  -- 27: 김제빵 판 = 표시가 있고, 로그인해서 입장한 사람이 3명 이하 (사람 4명이 다 입장한 판은 표시가 있어도 보통 판)
  kim := m.kim and (select count(*) from pingpong_match_players where match_id = m.id) <= 3;
  rec := has_opp and not kim;
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
  won_n := p_won and rec;
  streak := case when not rec then pl.win_streak when p_won then pl.win_streak + 1 else 0 end;

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
  if kim then
    items := items || json_build_object('label', '🤖 김제빵 낀 판은 전적·랭킹에 안 들어가요', 'coins', 0);
  elsif not has_opp then
    items := items || json_build_object('label', '손님 상대 경기는 승수에 안 들어가요', 'coins', 0);
  end if;

  -- 24: 세트 보너스 (src/sets.js와 같은 규칙). 퍼센트는 이 판 코인 합에 붙고 올림, 완전 세트 = 2배
  select * into st from pingpong__set_of(pl.equip);
  if st.set_id is not null then
    if st.kind = 'win' and p_won and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'perfect' and full_coins and n_perf > 0 and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'rally' and full_coins and n_rally > 0 and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'lose' and not p_won and join_coins then sb := st.amount;
    elsif st.kind = 'streak' and full_coins and won_n and streak % 3 = 0 then sb := st.amount;
    elsif st.kind = 'break' then brk_pct := 50 + st.amount;
    end if;
    if sb > 0 then
      items := items || json_build_object('label', st.label || case when st.kind in ('lose', 'streak') then '' else ' +' || st.amount || '%' end, 'coins', sb);
      total := total + sb;
    end if;
  end if;

  -- 19: 쉬는 시간 보너스 — 경기 시작이나 끝이 평일 쉬는 시간이면 이 판 코인 +50% (올림). 시각은 서버 시계
  -- 24: '휴가 중' 세트면 +75% (완전 세트 +100%)
  if total > 0 and (pingpong__is_break(m.started_at) or pingpong__is_break(now())) then
    brk := (total * brk_pct + 99) / 100;
    items := items || json_build_object('label', '☕ 쉬는 시간 +' || brk_pct || '%', 'coins', brk);
    total := total + brk;
  end if;

  update pingpong_match_players set reported_at = now(), won = p_won, opp_key = okey
    where match_id = m.id and player_id = pl.id;
  update pingpong_players set
    wins_1v1   = wins_1v1   + case when rec and m.mode = '1v1' and p_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when rec and m.mode = '1v1' and not p_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when rec and m.mode = '2v2' and p_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when rec and m.mode = '2v2' and not p_won then 1 else 0 end,
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
