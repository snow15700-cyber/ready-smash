-- 준비하시고, 스매시! — 49: 🚚🥤 광장 음식 코인 효과 (docs/dev/plaza.md 10장 ②-2, 사용자 확정 11/28 '싸게 · 쓴 만큼 이득')
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 48 다음에 실행 (32·33·44가 먼저 실행돼 있어야 함).
--
--  · pingpong_plaza_buy(토큰, 음식): 서버가 값을 빼고 효과·끝나는 시각(서버 시계)을 선수에 적음. 브라우저는 음식 이름만 보냄
--      ☕ coffee · 🥤 ade · 🐟 bungeo · 🌭 hotdog = 10코인 · 10분 / 🥫 can = 3코인 · 5분 (1%는 '하나 더!' = 공짜)
--  · 효과는 한 번에 하나 (새로 사면 바뀜). 경기·혼자 하기·횟집 판매 코인에만 (미션·출석·업적 X). 하루 한도(혼자 250·낚시 1000) 그대로
--      ☕ 1대1·2대2 +30% · 🥤 혼자 하기 +30% · 🐟 낚시 판매 +30% · 🌭 이긴 판만 +60% · 🥫 셋 모두 +15%
--  · 쉬는 시간 +50%·세트와는 더하기 (+50% + 30% = 같은 코인에 각각 붙음 → +80%)
--  · 아래 3개 함수는 32(혼자 하기·경기 결과)·44(횟집 팔기)의 것을 그대로 옮기고 '49' 표시한 곳만 더함
--  · 규칙은 src/games/props/rules.js와 같게 (로컬 가짜 서버도 그걸 씀)

alter table public.pingpong_players
  add column if not exists food       text,          -- 지금 효과 중인 음식
  add column if not exists food_until timestamptz;   -- 효과가 끝나는 시각 (서버 시계)

-- 음식 효과 %: kind = 'match'(1대1·2대2) | 'ai'(혼자 하기) | 'fish'(횟집 판매). p_at 시각에 효과가 남아 있어야
create or replace function public.pingpong__food_pct(p_food text, p_until timestamptz, p_kind text, p_at timestamptz, p_won boolean)
returns int language sql immutable as $$
  select case
    when p_food is null or p_until is null or p_at is null or p_until <= p_at then 0
    when p_kind = 'match' then case p_food when 'coffee' then 30 when 'can' then 15 when 'hotdog' then case when p_won then 60 else 0 end else 0 end
    when p_kind = 'ai'    then case p_food when 'ade' then 30 when 'can' then 15 else 0 end
    when p_kind = 'fish'  then case p_food when 'bungeo' then 30 when 'can' then 15 else 0 end
    else 0 end
$$;
create or replace function public.pingpong__food_label(p_food text) returns text language sql immutable as $$
  select case p_food when 'coffee' then '☕ 커피' when 'ade' then '🥤 에이드' when 'bungeo' then '🐟 붕어빵' when 'hotdog' then '🌭 핫도그' when 'can' then '🥫 캔 음료' else '🍽️ 간식' end
$$;
revoke all on function public.pingpong__food_pct(text, timestamptz, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.pingpong__food_label(text) from public, anon, authenticated;

-- 선수 정보에 음식 효과 (12의 것 + food·food_left(남은 초)) — 화면이 '☕ +30% · 8:12 남음' 알약을 그림
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally,
    'coins', p.coins, 'win_streak', p.win_streak,
    'pieces', p.pieces, 'equip', p.equip, 'title', p.title, 'nemesis', p.ach_n->>'nemesis',
    'food', case when p.food_until > now() then p.food end,
    'food_left', case when p.food_until > now() then ceil(extract(epoch from p.food_until - now()))::int else 0 end)
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

-- 사기
create or replace function public.pingpong_plaza_buy(p_token text, p_item text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  price int; mins int; lucky boolean := false;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_item in ('coffee', 'ade', 'bungeo', 'hotdog') then price := 10; mins := 10;
  elsif p_item = 'can' then price := 3; mins := 5;
  else return json_build_object('status', 'bad_item'); end if;
  select * into pl from pingpong_players where id = pl.id for update;
  -- 두 번 눌림: 같은 것을 2초 안에 또 사면 한 번만
  if pl.food = p_item and pl.food_until > now() + make_interval(mins => mins) - interval '2 seconds' then
    return json_build_object('status', 'busy', 'player', pingpong__player_json(pl));
  end if;
  if p_item = 'can' and random() < 0.01 then lucky := true; price := 0; end if;
  if pl.coins < price then return json_build_object('status', 'coins', 'price', price, 'player', pingpong__player_json(pl)); end if;
  update pingpong_players set coins = coins - price, food = p_item, food_until = now() + make_interval(mins => mins)
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'item', p_item, 'price', price, 'lucky', lucky, 'left', mins * 60, 'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_plaza_buy(text, text) from public;
grant execute on function public.pingpong_plaza_buy(text, text) to anon, authenticated;

-- ① 혼자 하기 (32의 것 + 49)
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
  fp int;          -- 49: 음식 효과 %
  fb int := 0;     -- 49: 음식 효과 코인
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
  -- 49: 🥤 에이드 +30% · 🥫 캔 +15% (쉬는 시간·세트와 더하기: 같은 got + sb에 붙음)
  fp := pingpong__food_pct(pl.food, pl.food_until, 'ai', now(), false);
  if got > 0 and fp > 0 then fb := ((got + sb) * fp + 99) / 100; end if;
  -- 32: 하루 250코인까지
  used := case when pl.ai_day = today then pl.ai_day_coins else 0 end;
  raw := got + sb + brk + fb;
  give := least(raw, greatest(250 - used, 0));
  update pingpong_players set coins = coins + give, ai_rem = total % 3, ai_at = now(),
    best_rally = greatest(best_rally, hits), ai_day = today, ai_day_coins = used + give
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', give, 'bonus', case when give < raw then 0 else brk end, 'bonus_pct', brk_pct,
    'set', case when sb > 0 and give = raw then st.label else null end, 'set_coins', case when give = raw then sb else 0 end,
    'food', case when fb > 0 and give = raw then pl.food else null end, 'food_coins', case when give = raw then fb else 0 end, 'food_pct', fp,
    'day_coins', used + give, 'day_max', 250, 'capped', give < raw or used + give >= 250,
    'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;

-- ② 1대1·2대2 결과 (32의 것 + 49)
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
  base int;        -- 49: 세트까지 더한 이 판 코인 (쉬는 시간·음식 %가 같이 여기에 붙음 = 더하기)
  fp int;          -- 49: 음식 효과 %
  fb int := 0;
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
  -- 49: 🚚 음식 효과 (☕ 커피 +30% · 🥫 캔 +15% · 🌭 핫도그 이긴 판만 +60%) — 경기 시작이나 끝에 효과가 남아 있으면. 쉬는 시간과 더하기
  base := total;
  fp := greatest(pingpong__food_pct(pl.food, pl.food_until, 'match', m.started_at, v_won),
                 pingpong__food_pct(pl.food, pl.food_until, 'match', now(), v_won));
  if base > 0 and fp > 0 then
    fb := (base * fp + 99) / 100;
    items := items || json_build_object('label', pingpong__food_label(pl.food) || ' +' || fp || '%', 'coins', fb);
  end if;
  if base > 0 and (pingpong__is_break(m.started_at) or pingpong__is_break(now())) then
    brk := (base * brk_pct + 99) / 100;
    items := items || json_build_object('label', '☕ 쉬는 시간 +' || brk_pct || '%', 'coins', brk);
    total := total + brk;
  end if;
  total := total + fb;

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

-- ③ 횟집 팔기 (44의 것 + 49)
create or replace function public.pingpong_fish_sell(p_token text, p_fish text, p_q int default null) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  today date := (now() at time zone 'Asia/Seoul')::date; used int; left10 bigint;
  t10 bigint := 0; k int; v_kept int := 0; v_any boolean := false; v_coins int; v_sold jsonb := '[]'::jsonb; r record;
  fp int; fb int := 0; -- 49: 🐟 붕어빵 +30% · 🥫 캔 +15% (하루 1000 한도 안에서)
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
  fp := pingpong__food_pct(pl.food, pl.food_until, 'fish', now(), false);
  if fp > 0 then fb := least((v_coins * fp + 99) / 100, greatest(0, 1000 - used - v_coins)); end if;
  v_coins := v_coins + fb;
  update pingpong_players set coins = coins + v_coins, fish_day = today, fish_day_coins = used + v_coins where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', v_coins, 'bonus', 0, 'bonus_pct', 0, 'food', case when fb > 0 then pl.food end, 'food_coins', fb, 'food_pct', fp, 'sold', v_sold, 'kept', v_kept,
    'day_coins', used + v_coins, 'day_cap', 1000, 'bag', pingpong__fish_bag_json(pl.id), 'player', pingpong__player_json(pl));
end $$;
revoke all on function public.pingpong_fish_sell(text, text, int) from public;
grant execute on function public.pingpong_fish_sell(text, text, int) to anon, authenticated;
