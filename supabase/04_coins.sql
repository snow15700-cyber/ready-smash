-- 준비하시고, 스매시! — 4단계: 코인 벌기 (01·02·03 SQL을 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 코인은 경기가 끝난 뒤에만, 서버가 직접 계산해서 준다 (부정 방지).
--  · 경기 참여 +10, 승리 +10 (1v1·2v2만. 혼자 하기는 코인 없음)
--  · 퍼펙트 3연속 +5, 랠리 10회 이상 +5 — 각각 한 경기에 최대 3번 (브라우저가 보낸 횟수는 서버가 0~3으로 자른다)
--  · 3연승 +15 — 연승 횟수는 서버가 센다 (3, 6, 9연승마다)
--  · 하루 첫 접속 +20 — 한국 시간 기준 날짜가 바뀌면 다시 받음
--  · 10초 안에 또 들어온 경기 결과는 무시 (02와 같은 규칙, 전적과 코인 모두)
--
-- 예전 화면(main 배포본)이 쓰는 pingpong_record_match는 그대로 두고, 코인을 주는 새 함수 pingpong_finish_match를 추가한다.

alter table public.pingpong_players
  add column if not exists coins      int  not null default 0,
  add column if not exists win_streak int  not null default 0,   -- 지금 연승 중인 횟수 (1v1+2v2)
  add column if not exists daily_at   date;                       -- 하루 첫 접속 코인을 마지막으로 받은 날 (한국 시간)

-- 화면에 보내는 내 정보 (02의 항목 + 코인·연승)
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally,
    'coins', p.coins, 'win_streak', p.win_streak)
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

-- 경기 결과 기록 + 코인 정산 (내 결과만)
-- p_perfect3 이번 경기에서 퍼펙트 3연속을 한 횟수, p_rally10 랠리 10회 이상을 이어 간 횟수
-- 결과 { status, player, h2h, coins: { total, items: [{ label, coins }] } }
create or replace function public.pingpong_finish_match(
  p_token text, p_mode text, p_won boolean, p_opp uuid, p_perfect3 int, p_rally10 int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  n_perf int := least(greatest(coalesce(p_perfect3, 0), 0), 3);
  n_rally int := least(greatest(coalesce(p_rally10, 0), 0), 3);
  streak int;
  items json[] := array[]::json[];
  total int := 0;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_mode not in ('1v1', '2v2') or p_won is null then return json_build_object('status', 'bad'); end if;
  if pl.last_match_at is not null and pl.last_match_at > now() - interval '10 seconds' then
    return json_build_object('status', 'too_soon');
  end if;

  streak := case when p_won then pl.win_streak + 1 else 0 end;
  items := items || json_build_object('label', '경기 참여', 'coins', 10); total := total + 10;
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

  update pingpong_players set
    wins_1v1   = wins_1v1   + case when p_mode = '1v1' and p_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when p_mode = '1v1' and not p_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when p_mode = '2v2' and p_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when p_mode = '2v2' and not p_won then 1 else 0 end,
    win_streak = streak,
    coins = coins + total,
    last_match_at = now()
  where id = pl.id returning * into pl;

  if p_mode = '1v1' and p_opp is not null and p_opp <> pl.id
     and exists (select 1 from pingpong_players where id = p_opp) then
    insert into pingpong_h2h(player_id, opp_id, wins, losses)
      values (pl.id, p_opp, case when p_won then 1 else 0 end, case when p_won then 0 else 1 end)
    on conflict (player_id, opp_id) do update set
      wins = pingpong_h2h.wins + excluded.wins, losses = pingpong_h2h.losses + excluded.losses;
  end if;

  return json_build_object('status', 'ok', 'player', pingpong__player_json(pl),
    'h2h', case when p_opp is null then null else pingpong__h2h_json(pl.id, p_opp) end,
    'coins', json_build_object('total', total, 'items', array_to_json(items)));
end $$;

-- 하루 첫 접속 코인. 로그인·자동 로그인 직후 화면이 부른다. 오늘 이미 받았으면 coins 0
create or replace function public.pingpong_daily(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  today date := (now() at time zone 'Asia/Seoul')::date;
  got int := 0;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  update pingpong_players set coins = coins + 20, daily_at = today
    where id = pl.id and daily_at is distinct from today
    returning * into pl;
  if found then got := 20;
  else select * into pl from pingpong_players where id = pl.id;
  end if;
  return json_build_object('status', 'ok', 'coins', got, 'player', pingpong__player_json(pl));
end $$;

revoke all on function public.pingpong_finish_match(text, text, boolean, uuid, int, int) from public;
revoke all on function public.pingpong_daily(text) from public;
grant execute on function public.pingpong_finish_match(text, text, boolean, uuid, int, int) to anon, authenticated;
grant execute on function public.pingpong_daily(text) to anon, authenticated;

-- ───────── 운영자용 ─────────
-- 정식 오픈 전에 테스트하며 쌓인 코인을 모두 0으로:
-- update public.pingpong_players set coins = 0, win_streak = 0, daily_at = null;
-- 특정 사람에게 코인 주기 (예: 이벤트):
-- update public.pingpong_players set coins = coins + 100 where nick_key = lower('닉네임');
