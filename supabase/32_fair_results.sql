-- 준비하시고, 스매시! — 32단계: 코인·전적 속이기 막기 (docs/dev/accounts.md '32 공정한 결과'). 31 다음에 실행.
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- ① 혼자 하기 (pingpong_ai_rally, 26의 것에 두 가지만 더함)
--  · 혼자 하기로 버는 코인은 한국 날짜로 하루 250코인까지 (쉬는 시간·세트 보너스 포함). 자정에 새로
--  · '친 횟수'는 1.2초에 1번까지만 인정 (예전 1초에 1번). 실제로는 한 번 치고 다시 치기까지 1.3초보다 오래 걸린다
--    (친 공이 상대에게 갔다 오는 시간). 최고 기록도 이 인정한 횟수로만 올라간다
--
-- ② 1대1·2대2 결과 (새 함수 pingpong_match_result = 27의 pingpong_match_finish에 더함)
--  · test와 main이 같은 서버를 쓰므로 옛 함수 pingpong_match_finish는 그대로 둔다 (main 배포본이 계속 기록되게).
--    test를 main에 합친 뒤 33_close_old_finish.sql로 옛 함수를 닫는다 (그때까지는 옛 함수로 속일 수 있음)
--  · 각자 처음 보낸 결과(이겼다/졌다)를 적어 두고, 상대 쪽에 로그인한 사람이 있으면 서로 말이 맞아야 정산한다
--  · 상대가 아직 안 보냈으면 'wait' → 화면이 1.5초마다 다시 부른다. 내가 보낸 지 20초가 지나도 상대가 안 보내면 내 말대로
--    (상대가 경기 끝나자마자 창을 닫은 경우)
--  · 누군가 나와 다른 승자를 말하면(둘 다 이겼다고 함) 그 판은 승패 없이: 승수·패수·연승·상대 전적 X, 승리 코인 X
--    (참여·퍼펙트·랠리 코인은 그대로). 속여도 얻는 게 없게
--  · 상대가 손님(로그인 안 함)인 판은 기다리지 않는다 (원래 승수에 안 들어감)

alter table public.pingpong_players
  add column if not exists ai_day       date,                      -- 혼자 하기 코인을 센 한국 날짜
  add column if not exists ai_day_coins int not null default 0;    -- 그날 혼자 하기로 받은 코인
alter table public.pingpong_match_players
  add column if not exists claim      boolean,       -- 처음 보낸 결과 (true = 이겼다)
  add column if not exists claimed_at timestamptz;

-- ① 혼자 하기
create or replace function public.pingpong_ai_rally(p_token text, p_hits int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  allowed int;
  hits int;
  total int;
  got int;
  brk int := 0;
  st record;
  sb int := 0;
  brk_pct int := 50;
  today date := (now() at time zone 'Asia/Seoul')::date;
  used int;        -- 32: 오늘 이미 받은 혼자 하기 코인
  raw int;         -- 32: 상한 전 이번 코인
  give int;        -- 32: 실제로 주는 코인
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into pl from pingpong_players where id = pl.id for update;   -- 32: 동시에 여러 번 불러도 상한이 새지 않게
  allowed := case when pl.ai_at is null then 0
                  else floor(extract(epoch from now() - pl.ai_at) / 1.2)::int + 1 end;   -- 32: 1초 → 1.2초에 1번
  hits := least(greatest(coalesce(p_hits, 0), 0), allowed, 1000);
  total := pl.ai_rem + hits;
  got := total / 3;  -- 26: 4 → 3
  -- 19: 쉬는 시간 보너스 (랠리가 끝난 시각이 평일 쉬는 시간이면 이번 코인 +50%, 올림)
  -- 24: 세트 보너스 ('꿀잠' 세트 = 혼자 하기 코인 +15%, 완전 +30% / '휴가 중' = 쉬는 시간 +75%, 완전 +100%)
  select * into st from pingpong__set_of(pl.equip);
  if st.kind = 'ai' and got > 0 then sb := (got * st.amount + 99) / 100; end if;
  if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
  if got > 0 and pingpong__is_break(now()) then brk := ((got + sb) * brk_pct + 99) / 100; end if;
  -- 32: 하루 250코인까지
  used := case when pl.ai_day = today then pl.ai_day_coins else 0 end;
  raw := got + sb + brk;
  give := least(raw, greatest(250 - used, 0));
  update pingpong_players set coins = coins + give, ai_rem = total % 3, ai_at = now(),
    best_rally = greatest(best_rally, hits), ai_day = today, ai_day_coins = used + give
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', give, 'bonus', case when give < raw then 0 else brk end, 'bonus_pct', brk_pct,
    'set', case when sb > 0 and give = raw then st.label else null end, 'set_coins', case when give = raw then sb else 0 end,
    'day_coins', used + give, 'day_max', 250, 'capped', give < raw or used + give >= 250,
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;

-- ② 1대1·2대2 결과: 새 함수 pingpong_match_result (27의 pingpong_match_finish + 32 표시한 곳, 받는 값은 같음)
--    main 배포본(옛 화면)은 아직 pingpong_match_finish를 부르므로 그대로 둔다. test를 main에 합친 뒤 33로 옛 함수를 닫는다
create or replace function public.pingpong_match_result(
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
  v_won boolean;   -- 32: 내가 처음 말한 결과 (p_won 대신 이걸 씀, 엇갈리면 false)
  conflict boolean := false;  -- 32: 이 경기에서 누군가 나와 다른 승자를 말함
  agreed boolean := false;    -- 32: 상대 쪽 누군가가 나와 같은 승자를 말함
  disputed boolean := false;  -- 32: 결과가 엇갈림 → 승패 없이 (승리 보상 X)
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
  if me.claim is null then
    -- 이 경기 뒤에 다른 경기에 또 입장했으면 이 경기는 결과를 낼 수 없다 (동시에 여러 경기 막기)
    -- 32: 이미 결과를 말해 두고 확인을 기다리던 중이면 (그사이 '한 판 더'로 새 경기에 들어가도) 그대로 정산
    if exists (select 1 from pingpong_match_players o
                where o.player_id = pl.id and o.match_id <> m.id and o.joined_at > me.joined_at) then
      return json_build_object('status', 'stale');
    end if;
    -- 32: 내 말(이겼다/졌다)을 먼저 적어 둔다. 처음 말한 것만 쓴다 (상대 말을 보고 바꿀 수 없게)
    update pingpong_match_players set claim = p_won, claimed_at = now()
      where match_id = m.id and player_id = pl.id returning * into me;
  end if;
  v_won := me.claim;

  -- 서로 "이겼다"고 하면 표시해 둔다 (운영자 확인)
  my_side_won := case when v_won then me.side else 1 - me.side end;
  if m.winner is null then update pingpong_matches set winner = my_side_won where id = m.id;
  elsif m.winner <> my_side_won then update pingpong_matches set disputed = true where id = m.id;
  end if;

  -- 같은 상대 열쇠: 모드 + 상대 쪽 선수 번호(정렬). 상대 쪽에 로그인한 사람이 없으면 'guest'
  select string_agg(player_id::text, ',' order by player_id::text) into okey
    from pingpong_match_players where match_id = m.id and side <> me.side;
  has_opp := okey is not null;

  -- 32: 상대 쪽에 로그인한 사람이 있으면 서로 말이 맞아야 승리 보상을 준다
  --  · 상대 쪽 누군가가 같은 승자를 말함 → 그대로 정산
  --  · 누군가(상대·팀원) 다른 승자를 말함 → 승패 없이 (아무도 승리 보상 X, 참여 코인 등은 그대로)
  --  · 아직 아무도 말 안 함 → 'wait' (화면이 잠시 뒤 다시 부름). 내가 말한 지 20초가 지나면 내 말대로 (상대가 창을 닫은 경우)
  if has_opp then
    conflict := exists (select 1 from pingpong_match_players x
      where x.match_id = m.id and x.claim is not null and (case when x.claim then x.side else 1 - x.side end) <> my_side_won);
    agreed := exists (select 1 from pingpong_match_players x
      where x.match_id = m.id and x.side <> me.side and x.claim is not null and (case when x.claim then x.side else 1 - x.side end) = my_side_won);
    if not conflict and not agreed and me.claimed_at > now() - interval '20 seconds' then
      return json_build_object('status', 'wait', 'left', ceil(20 - extract(epoch from now() - me.claimed_at)));
    end if;
    disputed := conflict;
  end if;
  -- 27: 김제빵 판 = 표시가 있고, 로그인해서 입장한 사람이 3명 이하 (사람 4명이 다 입장한 판은 표시가 있어도 보통 판)
  kim := m.kim and (select count(*) from pingpong_match_players where match_id = m.id) <= 3;
  rec := has_opp and not kim and not disputed;   -- 32: 결과가 엇갈린 판도 전적·랭킹·연승 X
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
  if disputed then v_won := false; end if;   -- 32: 엇갈린 판은 '이긴 것'으로 치지 않음 (승리 코인·업적·미션 X)
  won_n := v_won and rec;
  streak := case when not rec then pl.win_streak when v_won then pl.win_streak + 1 else 0 end;

  if join_coins then
    items := items || json_build_object('label', '경기 참여', 'coins', 10); total := total + 10;
  end if;
  if full_coins then
    if v_won then items := items || json_build_object('label', '승리', 'coins', 10); total := total + 10; end if;
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
  if disputed then
    items := items || json_build_object('label', '⚠️ 서로 이겼다고 해서 승패 없이 끝났어요', 'coins', 0);
  elsif kim then
    items := items || json_build_object('label', '🤖 김제빵 낀 판은 전적·랭킹에 안 들어가요', 'coins', 0);
  elsif not has_opp then
    items := items || json_build_object('label', '손님 상대 경기는 승수에 안 들어가요', 'coins', 0);
  end if;

  -- 24: 세트 보너스 (src/sets.js와 같은 규칙). 퍼센트는 이 판 코인 합에 붙고 올림, 완전 세트 = 2배
  select * into st from pingpong__set_of(pl.equip);
  if st.set_id is not null then
    if st.kind = 'win' and v_won and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'perfect' and full_coins and n_perf > 0 and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'rally' and full_coins and n_rally > 0 and total > 0 then sb := (total * st.amount + 99) / 100;
    elsif st.kind = 'lose' and not v_won and not disputed and join_coins then sb := st.amount;
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

  update pingpong_match_players set reported_at = now(), won = v_won, opp_key = okey
    where match_id = m.id and player_id = pl.id;
  update pingpong_players set
    wins_1v1   = wins_1v1   + case when rec and m.mode = '1v1' and v_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when rec and m.mode = '1v1' and not v_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when rec and m.mode = '2v2' and v_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when rec and m.mode = '2v2' and not v_won then 1 else 0 end,
    win_streak = streak,
    coins = coins + total,
    last_match_at = now()
  where id = pl.id returning * into pl;

  -- 1대1 상대 전적: 상대가 실제로 이 경기에 입장했을 때만
  if m.mode = '1v1' and not disputed then   -- 32: 결과가 엇갈린 판은 상대 전적에 안 셈
    select player_id into opp from pingpong_match_players where match_id = m.id and side <> me.side;
    if opp is not null then
      insert into pingpong_h2h(player_id, opp_id, wins, losses)
        values (pl.id, opp, case when v_won then 1 else 0 end, case when v_won then 0 else 1 end)
      on conflict (player_id, opp_id) do update set
        wins = pingpong_h2h.wins + excluded.wins, losses = pingpong_h2h.losses + excluded.losses;
    end if;
  end if;

  return json_build_object('status', 'ok', 'disputed', disputed, 'player', pingpong__player_json(pl),
    'h2h', case when opp is null then null else pingpong__h2h_json(pl.id, opp) end,
    'coins', json_build_object('total', total, 'items', array_to_json(items)));
end $$;
revoke all on function public.pingpong_match_result(text, uuid, boolean, int, int) from public;
grant execute on function public.pingpong_match_result(text, uuid, boolean, int, int) to anon, authenticated;

