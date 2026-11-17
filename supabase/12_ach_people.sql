-- 준비하시고, 스매시! — 12단계: 업적 3단계 = 사람 관계·뽑기·출석 업적 (11_ach_match.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- · 천적: 같은 사람에게 1대1 5연패 → 칭호 「(그 사람 닉네임) 공포증」 (처음 깬 상대 이름으로 고정, ach_n.nemesis)
-- · 복수 성공: 1대1에서 3번 이상 진 상대를 이김
-- · 환상의 짝꿍: 2대2에서 같은 팀원(로그인한 사람)과 5승 (ach_n.duo = { 팀원 번호: 승수 })
-- · 뽑기 중독: 뽑기 누적 100번 (뽑기 함수는 그대로 두고, 뽑기로 코인이 100·900 줄어든 것을 트리거로 센다)
-- · 성실한 교육생·출석왕: 하루 첫 접속(pingpong_daily) 기준 5일 연속·총 20일 (이 SQL을 넣은 날부터 셈)

alter table public.pingpong_h2h
  add column if not exists lose_run int not null default 0;   -- 이 상대에게 지금 몇 연패 중인지

-- 화면에 보내는 내 정보 (10의 항목 + 천적 이름)
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally,
    'coins', p.coins, 'win_streak', p.win_streak,
    'pieces', p.pieces, 'equip', p.equip, 'title', p.title, 'nemesis', p.ach_n->>'nemesis')
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

-- 뽑기 횟수 세기: 뽑기는 코인 100(1회)·900(10회)만 쓰고 천장 횟수를 같이 고친다 (구매는 500·1,500·5,000)
create or replace function public.pingpong__count_gacha() returns trigger
language plpgsql as $$
begin
  if old.coins - new.coins in (100, 900) then
    new.ach_n := new.ach_n || jsonb_build_object('gacha',
      coalesce((new.ach_n->>'gacha')::int, 0) + case old.coins - new.coins when 100 then 1 else 10 end);
  end if;
  return new;
end $$;
drop trigger if exists pingpong_count_gacha on public.pingpong_players;
create trigger pingpong_count_gacha before update of coins on public.pingpong_players
  for each row when (old.coins - new.coins in (100, 900)) execute function public.pingpong__count_gacha();

-- 하루 첫 접속 코인 (04와 같음) + 출석 일수 (총 days, 연속 days_run)
create or replace function public.pingpong_daily(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  today date := (now() at time zone 'Asia/Seoul')::date;
  got int := 0;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  -- 출석 업적은 화면이 바로 뒤에 pingpong_achievements로 확인한다 (그래야 '업적 달성!' 알림이 뜸)
  update pingpong_players set coins = coins + 20, daily_at = today,
    ach_n = ach_n || jsonb_build_object(
      'days', coalesce((ach_n->>'days')::int, 0) + 1,
      'days_run', case when daily_at = today - 1 then coalesce((ach_n->>'days_run')::int, 0) + 1 else 1 end)
    where id = pl.id and daily_at is distinct from today
    returning * into pl;
  if found then got := 20; end if;
  select * into pl from pingpong_players where id = pl.id;
  return json_build_object('status', 'ok', 'coins', got, 'player', pingpong__player_json(pl));
end $$;

-- 지금 기록으로 깰 수 있는 업적 확인 (11의 것 + 뽑기·출석·짝꿍)
create or replace function public.pingpong__ach_check(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  p pingpong_players;
  wins int; losses int;
  meet int; beat int; rival int; own int; legend int; gag int;
  n jsonb;
  ok text[] := array[]::text[];
begin
  select * into p from pingpong_players where id = p_id for update;
  if not found then return array[]::text[]; end if;
  wins := p.wins_1v1 + p.wins_2v2;
  losses := p.losses_1v1 + p.losses_2v2;
  n := p.ach_n;
  select count(*), count(*) filter (where h.wins > 0), coalesce(max(h.wins + h.losses), 0)
    into meet, beat, rival from pingpong_h2h h where h.player_id = p.id;
  select count(*), count(*) filter (where i.grade = 'legend'),
         count(*) filter (where v.item_id in ('paddle_toast', 'paddle_baguette', 'paddle_donut', 'paddle_pizza', 'paddle_melon',
           'paddle_waffle', 'paddle_mackerel', 'paddle_scoop', 'paddle_slipper', 'paddle_swatter', 'paddle_fan',
           'paddle_sponge', 'paddle_book', 'paddle_eraser', 'paddle_board'))
    into own, legend, gag
    from pingpong_inventory v join pingpong_items i on i.id = v.item_id where v.player_id = p.id;

  if wins >= 1 then ok := ok || 'win1'::text; end if;
  if wins >= 30 then ok := ok || 'win30'::text; end if;
  if wins >= 100 then ok := ok || 'win100'::text; end if;
  if wins + losses >= 50 then ok := ok || 'games50'::text; end if;
  if wins >= 10 and losses >= 10 then ok := ok || 'wl10'::text; end if;
  if p.win_streak >= 5 then ok := ok || 'streak5'::text; end if;
  if p.win_streak >= 10 then ok := ok || 'streak10'::text; end if;
  if meet >= 5 then ok := ok || 'meet5'::text; end if;
  if beat >= 10 then ok := ok || 'beat10'::text; end if;
  if rival >= 10 then ok := ok || 'rival10'::text; end if;
  if p.best_rally >= 20 then ok := ok || 'ai20'::text; end if;
  if p.best_rally >= 50 then ok := ok || 'ai50'::text; end if;
  if p.best_rally >= 100 then ok := ok || 'ai100'::text; end if;
  if own >= 10 then ok := ok || 'own10'::text; end if;
  if legend >= 1 then ok := ok || 'legend1'::text; end if;
  if gag >= 15 then ok := ok || 'gag15'::text; end if;
  if coalesce((n->>'perfects')::int, 0) >= 500 then ok := ok || 'perf500'::text; end if;
  if coalesce((n->>'centers')::int, 0) >= 300 then ok := ok || 'center300'::text; end if;
  if coalesce((n->>'smash_pts')::int, 0) >= 30 then ok := ok || 'smash30'::text; end if;
  if coalesce((n->>'chance_run')::int, 0) >= 10 then ok := ok || 'chance10'::text; end if;
  if coalesce((n->>'quick')::int, 0) >= 5 then ok := ok || 'quick5'::text; end if;
  if coalesce((n->>'aces')::int, 0) >= 20 then ok := ok || 'ace20'::text; end if;
  if coalesce((n->>'deuce_wins')::int, 0) >= 5 then ok := ok || 'deuce5'::text; end if;
  if coalesce((n->>'aizero')::int, 0) >= 5 then ok := ok || 'aizero'::text; end if;
  if coalesce((n->>'duck_wins')::int, 0) >= 10 then ok := ok || 'duck10'::text; end if;
  if coalesce((n->>'bread_perf')::int, 0) >= 100 then ok := ok || 'bread100'::text; end if;
  if coalesce((n->>'day_n')::int, 0) >= 20 then ok := ok || 'day20'::text; end if;
  if coalesce((n->>'dt_n')::int, 0) >= 50 then
    if (n->>'dt_sum')::numeric / (n->>'dt_n')::numeric < -50 then ok := ok || 'early'::text; end if;
    if (n->>'dt_sum')::numeric / (n->>'dt_n')::numeric > 50 then ok := ok || 'late'::text; end if;
  end if;
  -- 3단계
  if coalesce((n->>'gacha')::int, 0) >= 100 then ok := ok || 'gacha100'::text; end if;
  if coalesce((n->>'days_run')::int, 0) >= 5 then ok := ok || 'days5'::text; end if;
  if coalesce((n->>'days')::int, 0) >= 20 then ok := ok || 'days20'::text; end if;
  if exists (select 1 from jsonb_each_text(case when jsonb_typeof(n->'duo') = 'object' then n->'duo' else '{}'::jsonb end) d
             where d.value ~ '^[0-9]+$' and d.value::int >= 5) then ok := ok || 'duo5'::text; end if;
  return pingpong__ach_grant(p.id, ok);
end $$;
revoke all on function public.pingpong__ach_check(uuid) from public, anon, authenticated;

-- 경기 기록 보내기 (11과 같음) + 1대1 상대(p_opp)·2대2 팀원(p_mate)의 선수 번호 (손님이면 null)
-- 전적(pingpong_finish_match)을 먼저 기록한 뒤에 부른다
create or replace function public.pingpong_ach_people(p_token text, p_mode text, p_won boolean, p_opp uuid, p_mate uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  h pingpong_h2h;
  n jsonb;
  ok text[] := array[]::text[];
  opp_nick text;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_won is null or p_mode not in ('1v1', '2v2') then return json_build_object('status', 'bad'); end if;
  select * into pl from pingpong_players where id = pl.id for update;
  -- 경기 기록(pingpong_ach_match)이 방금(30초 안) 들어온 경기에만 (같은 경기를 두 번 세지 않게 ach_people_at)
  if pl.ach_at is null or pl.ach_at < now() - interval '30 seconds'
     or coalesce((pl.ach_n->>'people_at')::text, '') = pl.ach_at::text then
    return json_build_object('status', 'too_soon');
  end if;
  n := pl.ach_n || jsonb_build_object('people_at', pl.ach_at::text);

  if p_mode = '1v1' and p_opp is not null and p_opp <> pl.id then
    update pingpong_h2h set lose_run = case when p_won then 0 else lose_run + 1 end
      where player_id = pl.id and opp_id = p_opp returning * into h;
    if found then
      if not p_won and h.lose_run >= 5 then
        ok := ok || 'nemesis'::text;
        if n->>'nemesis' is null then
          select nick into opp_nick from pingpong_players where id = p_opp;
          if not exists (select 1 from pingpong_ach_got where player_id = pl.id and ach_id = 'nemesis') then
            n := n || jsonb_build_object('nemesis', opp_nick);
          end if;
        end if;
      end if;
      if p_won and h.losses >= 3 then ok := ok || 'revenge'::text; end if;
    end if;
  end if;
  if p_mode = '2v2' and p_won and p_mate is not null and p_mate <> pl.id
     and exists (select 1 from pingpong_players where id = p_mate) then
    n := jsonb_set(n, '{duo}', coalesce(case when jsonb_typeof(n->'duo') = 'object' then n->'duo' end, '{}'::jsonb)
      || jsonb_build_object(p_mate::text, coalesce((n->'duo'->>p_mate::text)::int, 0) + 1));
  end if;
  update pingpong_players set ach_n = n where id = pl.id;
  return pingpong__ach_json(pl.id, pingpong__ach_grant(pl.id, ok) || pingpong__ach_check(pl.id));
end $$;

-- 랭킹 (10과 같음 + 천적 이름)
create or replace function public.pingpong_ranking(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'wins' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick, title, case when title = 'nemesis' then ach_n->>'nemesis' end as title_x,
               wins_1v1 + wins_2v2 as value,
               wins_1v1 as w1, wins_2v2 as w2,
               rank() over (order by wins_1v1 + wins_2v2 desc)::int as rank
        from pingpong_players
        where wins_1v1 + wins_2v2 > 0
        order by 4 desc, nick
        limit 50
      ) r), '[]'::json);
  elsif p_kind = 'rally' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick, title, case when title = 'nemesis' then ach_n->>'nemesis' end as title_x,
               best_rally as value,
               rank() over (order by best_rally desc)::int as rank
        from pingpong_players
        where best_rally > 0
        order by 4 desc, nick
        limit 50
      ) r), '[]'::json);
  end if;
  return '[]'::json;
end $$;

revoke all on function public.pingpong_ach_people(text, text, boolean, uuid, uuid) from public;
revoke all on function public.pingpong_ranking(text) from public;
grant execute on function public.pingpong_ach_people(text, text, boolean, uuid, uuid) to anon, authenticated;
grant execute on function public.pingpong_ranking(text) to anon, authenticated;
