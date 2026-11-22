-- 준비하시고, 스매시! — 24단계: 세트 보너스 (23_heads_faces.sql 다음)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 머리 + 몸을 같이 입으면 '세트', 세 번째 아이템(얼굴·탁구채)까지 입으면 '완전 세트' (src/sets.js와 같게).
--  · 칭호: 세트를 입으면 업적 set_<id>(★), 완전 세트면 setfull_<id>(★★) — pingpong_achievements가 지급
--  · 코인: 세트마다 컨셉에 맞는 보너스, 완전 세트 = 2배. 입은 옷은 서버의 장착 정보(equip)로만 판단한다.
--  · 아래 함수는 이전 파일의 최신 정의(19: match_finish·ai_rally / 12: daily / 21: __mission_grant / 10: achievements)에
--    세트 부분만 더한 것이다.

-- 세트 목록: 머리 + 몸이 맞으면 세트. amount = 퍼센트 또는 코인 (완전 세트면 2배)
create or replace function public.pingpong__set_of(e jsonb)
returns table(set_id text, kind text, amount int, full boolean, label text)
language sql immutable set search_path = public as $$
  select s.id, s.kind, s.amt * case when e->>s.cat = s.third then 2 else 1 end, coalesce(e->>s.cat = s.third, false),
         '✨ 세트 「' || s.nm || '」' || case when e->>s.cat = s.third then ' 완전' else '' end
    from (values
      ('korea', 'head_band', 'body_uniform', 'face', 'face_glare', 'win', 15, '국가대표'),
      ('chef', 'head_chef', 'body_apron', 'paddle', 'paddle_pan', 'perfect', 25, '오늘의 셰프'),
      ('safety', 'head_hardhat', 'body_vest', 'face', 'face_sweat', 'lose', 8, '안전제일'),
      ('vacation', 'head_straw', 'body_hawaii', 'face', 'face_happy', 'break', 25, '휴가 중'),
      ('exam', 'head_pass', 'body_padding', 'paddle', 'paddle_book', 'rally', 15, '수험생'),
      ('hiker', 'head_hiking', 'body_hiking', 'face', 'face_mustache', 'streak', 15, '등산왕'),
      ('granny', 'head_scarf', 'body_monpe', 'paddle', 'paddle_scoop', 'daily', 15, '동네 할매'),
      ('sleepy', 'head_nightcap', 'body_starpj', 'face', 'face_sleepy', 'ai', 15, '꿀잠'),
      ('knight', 'head_helm', 'body_knight', 'paddle', 'paddle_board', 'win', 15, '원탁의 기사'),
      ('hero', 'head_mask', 'body_cape', 'paddle', 'paddle_hammer', 'win', 15, '동네 히어로'),
      ('bear', 'head_bear', 'body_bear', 'paddle', 'paddle_duck', 'mission', 15, '곰돌이')
    ) as s(id, head, body, cat, third, kind, amt, nm)
   where e->>'head' = s.head and e->>'body' = s.body
   limit 1
$$;
revoke all on function public.pingpong__set_of(jsonb) from public, anon, authenticated;

-- 세트 칭호 (src/achievements.js의 set_·setfull_과 같게)
insert into public.pingpong_ach(id, grade) values
  ('set_korea', 1), ('setfull_korea', 2),
  ('set_chef', 1), ('setfull_chef', 2),
  ('set_safety', 1), ('setfull_safety', 2),
  ('set_vacation', 1), ('setfull_vacation', 2),
  ('set_exam', 1), ('setfull_exam', 2),
  ('set_hiker', 1), ('setfull_hiker', 2),
  ('set_granny', 1), ('setfull_granny', 2),
  ('set_sleepy', 1), ('setfull_sleepy', 2),
  ('set_knight', 1), ('setfull_knight', 2),
  ('set_hero', 1), ('setfull_hero', 2),
  ('set_bear', 1), ('setfull_bear', 2)
on conflict (id) do update set grade = excluded.grade;

-- ───────── 업적 목록 + 새로 깬 업적 (10 + 세트 칭호) ─────────
create or replace function public.pingpong_achievements(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  fresh text[];
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  fresh := pingpong__ach_check(pl.id);
  -- 24: 세트 칭호 (지금 입은 세트 / 완전 세트)
  fresh := fresh || pingpong__ach_grant(pl.id, (select array_remove(array['set_' || s.set_id, case when s.full then 'setfull_' || s.set_id end], null)
                                                  from pingpong__set_of(pl.equip) s));
  return pingpong__ach_json(pl.id, fresh);
end $$;


-- ───────── 경기 결과 + 코인 정산 (19 + 세트 보너스) ─────────
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


-- ───────── 혼자 하기 코인 (19 + 세트 보너스) ─────────
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
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  allowed := case when pl.ai_at is null then 0
                  else floor(extract(epoch from now() - pl.ai_at))::int + 1 end;
  hits := least(greatest(coalesce(p_hits, 0), 0), allowed, 1000);
  total := pl.ai_rem + hits;
  got := total / 4;
  -- 19: 쉬는 시간 보너스 (랠리가 끝난 시각이 평일 쉬는 시간이면 이번 코인 +50%, 올림)
  -- 24: 세트 보너스 ('꿀잠' 세트 = 혼자 하기 코인 +15%, 완전 +30% / '휴가 중' = 쉬는 시간 +75%, 완전 +100%)
  select * into st from pingpong__set_of(pl.equip);
  if st.kind = 'ai' and got > 0 then sb := (got * st.amount + 99) / 100; end if;
  if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
  if got > 0 and pingpong__is_break(now()) then brk := ((got + sb) * brk_pct + 99) / 100; end if;
  update pingpong_players set coins = coins + got + sb + brk, ai_rem = total % 4, ai_at = now(),
    best_rally = greatest(best_rally, hits)
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', got + sb + brk, 'bonus', brk, 'bonus_pct', brk_pct,
    'set', case when sb > 0 then st.label else null end, 'set_coins', sb, 'player', pingpong__player_json(pl));
end $$;


-- ───────── 하루 첫 접속 (12 + 세트 보너스) ─────────
create or replace function public.pingpong_daily(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  today date := (now() at time zone 'Asia/Seoul')::date;
  got int := 0;
  st record;
  sb int := 0;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  -- 출석 업적은 화면이 바로 뒤에 pingpong_achievements로 확인한다 (그래야 '업적 달성!' 알림이 뜸)
  update pingpong_players set coins = coins + 20, daily_at = today,
    ach_n = ach_n || jsonb_build_object(
      'days', coalesce((ach_n->>'days')::int, 0) + 1,
      'days_run', case when daily_at = today - 1 then coalesce((ach_n->>'days_run')::int, 0) + 1 else 1 end)
    where id = pl.id and daily_at is distinct from today
    returning * into pl;
  if found then
    got := 20;
    -- 24: '동네 할매' 세트 = 하루 첫 접속 +15 (완전 +30)
    select * into st from pingpong__set_of(pl.equip);
    if st.kind = 'daily' then
      sb := st.amount;
      update pingpong_players set coins = coins + sb where id = pl.id;
    end if;
  end if;
  select * into pl from pingpong_players where id = pl.id;
  return json_build_object('status', 'ok', 'coins', got + sb, 'set', case when sb > 0 then st.label else null end, 'set_coins', sb,
    'player', pingpong__player_json(pl));
end $$;


-- ───────── 미션 코인 (21 + 세트 보너스) ─────────
create or replace function public.pingpong__mission_grant(p_id uuid, ms jsonb, ids text[]) returns json
language plpgsql security definer set search_path = public as $$
declare
  today text[] := pingpong__missions_of((ms->>'d')::date);
  fresh text[] := array[]::text[];
  v_id text;
  v_coins int := 0;
  all_now boolean := false;
  st record;
  v_set int := 0;
begin
  foreach v_id in array ids loop
    if v_id = any(today) and not (ms->'done') ? v_id and not v_id = any(fresh) then fresh := fresh || v_id; end if;
  end loop;
  if array_length(fresh, 1) is not null then
    ms := jsonb_set(ms, '{done}', (ms->'done') || to_jsonb(fresh));
    v_coins := 30 * array_length(fresh, 1);
    all_now := jsonb_array_length(ms->'done') >= array_length(today, 1);
    if all_now then v_coins := v_coins + 50; end if;
    -- 24: '곰돌이' 세트 = 미션 코인 +15% (완전 +30%), 올림
    select s.* into st from pingpong_players p, pingpong__set_of(p.equip) s where p.id = p_id;
    if st.kind = 'mission' then v_set := (v_coins * st.amount + 99) / 100; v_coins := v_coins + v_set; end if;
  end if;
  update pingpong_players set mission = ms, coins = coins + v_coins where id = p_id;
  return json_build_object('new', to_json(fresh), 'all', all_now, 'coins', v_coins, 'set_coins', v_set);
end $$;
revoke all on function public.pingpong__mission_grant(uuid, jsonb, text[]) from public, anon, authenticated;

revoke all on function public.pingpong_achievements(text) from public;
grant execute on function public.pingpong_achievements(text) to anon, authenticated;
revoke all on function public.pingpong_match_finish(text, uuid, boolean, int, int) from public;
grant execute on function public.pingpong_match_finish(text, uuid, boolean, int, int) to anon, authenticated;
revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;
revoke all on function public.pingpong_daily(text) from public;
grant execute on function public.pingpong_daily(text) to anon, authenticated;
