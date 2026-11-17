-- 준비하시고, 스매시! — 11단계: 업적 2단계 = 경기 기록으로 깨는 업적 (10_achievements.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- · 경기가 끝나면 각 PC가 자기 경기 기록(친 횟수·퍼펙트·방향·스매시·서브·점수 흐름 등)을 보낸다.
--   서버는 숫자를 알맞은 범위로 자르고, 한 경기 업적은 바로, 누적 업적은 ach_n에 더해서 확인한다.
-- · 10초 안에 또 들어온 경기 기록은 무시 (전적과 같은 규칙). 혼자 하기('ai')는 '첫 공 실수'만 센다.
-- · 탁구채 업적(오리·빵)은 경기 때 장착한 탁구채(equip)로 서버가 센다.

alter table public.pingpong_players
  add column if not exists ach_n  jsonb not null default '{}'::jsonb,  -- 업적용 누적 숫자
  add column if not exists ach_at timestamptz;                         -- 마지막 경기 기록 시각

-- 업적 지급 (이미 깬 건 무시). 결과 = 새로 깬 업적 id
create or replace function public.pingpong__ach_grant(p_id uuid, p_ids text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare fresh text[]; total int;
begin
  with ins as (
    insert into pingpong_ach_got(player_id, ach_id)
      select p_id, x from unnest(p_ids) x where exists (select 1 from pingpong_ach a where a.id = x)
    on conflict do nothing
    returning ach_id
  ) select coalesce(array_agg(ach_id), array[]::text[]) into fresh from ins;
  select coalesce(sum(case a.grade when 1 then 20 when 2 then 50 else 150 end), 0)::int into total
    from pingpong_ach a where a.id = any(fresh);
  if total > 0 then update pingpong_players set coins = coins + total where id = p_id; end if;
  return fresh;
end $$;
revoke all on function public.pingpong__ach_grant(uuid, text[]) from public, anon, authenticated;

-- 지금 기록(10의 항목 + 누적 숫자 ach_n)으로 깰 수 있는 업적 확인
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
  -- 누적 (ach_n)
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
    if (n->>'dt_sum')::numeric / (n->>'dt_n')::numeric < -50 then ok := ok || 'early'::text; end if;  -- 밀리초
    if (n->>'dt_sum')::numeric / (n->>'dt_n')::numeric > 50 then ok := ok || 'late'::text; end if;
  end if;
  return pingpong__ach_grant(p.id, ok);
end $$;
revoke all on function public.pingpong__ach_check(uuid) from public, anon, authenticated;

-- 숫자 하나 꺼내서 0~hi로 자르기
create or replace function public.pingpong__n(s jsonb, k text, hi int) returns int
language sql immutable as $$
  select least(greatest(coalesce(case when jsonb_typeof(s->k) = 'number' then (s->>k)::numeric end, 0), 0), hi)::int
$$;

-- 경기 기록 보내기. p_mode '1v1' | '2v2' | 'ai', p_won 이겼는지, p_s 경기 기록 (src/game.js의 achSummary)
-- 결과 { status, player, got, new: [{ id, coins }] }
create or replace function public.pingpong_ach_match(p_token text, p_mode text, p_won boolean, p_s jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  s jsonb := coalesce(p_s, '{}'::jsonb);
  n jsonb;
  ok text[] := array[]::text[];
  fresh text[];
  today text := ((now() at time zone 'Asia/Seoul')::date)::text;
  hits int; perfects int; me int; opp int; run int; c jsonb; paddle text;
  dt_n int; dt_sum int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_mode not in ('1v1', '2v2', 'ai') then return json_build_object('status', 'bad'); end if;
  select * into pl from pingpong_players where id = pl.id for update;
  n := pl.ach_n;

  if p_mode = 'ai' then
    -- 혼자 하기: 김제빵의 첫 공을 못 받고 랠리가 끝남 (1초에 한 번까지)
    if pingpong__n(s, 'aizero', 1) = 1 and (pl.ach_at is null or pl.ach_at < now() - interval '1 second') then
      n := jsonb_set(n, '{aizero}', to_jsonb(pingpong__n(n, 'aizero', 100000) + 1));
      update pingpong_players set ach_n = n, ach_at = now() where id = pl.id;
    end if;
    fresh := pingpong__ach_check(pl.id);
    return pingpong__ach_json(pl.id, fresh);
  end if;

  if p_won is null then return json_build_object('status', 'bad'); end if;
  if pl.ach_at is not null and pl.ach_at > now() - interval '10 seconds' then
    return json_build_object('status', 'too_soon');
  end if;

  hits := pingpong__n(s, 'hits', 300);
  perfects := least(pingpong__n(s, 'perfects', 300), hits);
  me := pingpong__n(s, 'scoreMe', 50);
  opp := pingpong__n(s, 'scoreOpp', 50);
  paddle := pl.equip->>'paddle';

  -- 한 경기 업적
  if pingpong__n(s, 'perfMax', 300) >= 3 then ok := ok || 'perf3'::text; end if;
  if pingpong__n(s, 'perfMax', 300) >= 10 then ok := ok || 'perf10'::text; end if;
  if hits > 10 and perfects >= hits * 0.7 then ok := ok || 'perf70'::text; end if;
  if pingpong__n(s, 'blockPts', 50) >= 3 then ok := ok || 'block3'::text; end if;
  if pingpong__n(s, 'zig', 1) = 1 then ok := ok || 'zigzag'::text; end if;
  if pingpong__n(s, 'dirMax', 300) >= 15 then ok := ok || 'oneway'::text; end if;
  if p_won and hits > 0 and pingpong__n(s, 'blocks', 300) = 0 then ok := ok || 'noblock'::text; end if;
  if pingpong__n(s, 'smashes', 300) >= 1 then ok := ok || 'smash1'::text; end if;
  if pingpong__n(s, 'smashBack', 300) >= 1 then ok := ok || 'smashback'::text; end if;
  if pingpong__n(s, 'given', 300) >= 5 then ok := ok || 'santa'::text; end if;
  if pingpong__n(s, 'rallyMax', 1000) >= 15 then ok := ok || 'rally15'::text; end if;
  if pingpong__n(s, 'rallyMax', 1000) >= 30 then ok := ok || 'rally30'::text; end if;
  if p_won and pingpong__n(s, 'serves', 50) >= 1 and pingpong__n(s, 'serveFaults', 50) = 0 then ok := ok || 'servesafe'::text; end if;
  if pingpong__n(s, 'tossMax', 100) >= 3 then ok := ok || 'tosser'::text; end if;
  if pingpong__n(s, 'serveFaults', 50) >= 3 then ok := ok || 'windserve'::text; end if;
  if p_won and pingpong__n(s, 'maxDeficit', 50) >= 3 then ok := ok || 'comeback'::text; end if;
  if p_won and me >= 5 and opp = 0 then ok := ok || 'shutout'::text; end if;
  if not p_won and pingpong__n(s, 'led40', 1) = 1 then ok := ok || 'blown'::text; end if;
  if not p_won and me = 0 and opp >= 5 then ok := ok || 'zero'::text; end if;
  if pingpong__n(s, 'whiffLost', 50) >= 3 then ok := ok || 'whiff3'::text; end if;
  if p_mode = '2v2' and pingpong__n(s, 'teamPts', 50) >= 4
     and pingpong__n(s, 'myPts', 50) >= pingpong__n(s, 'teamPts', 50) * 0.8 then ok := ok || 'carry'::text; end if;
  if p_mode = '2v2' and p_won and pingpong__n(s, 'myPts', 50) = 0 then ok := ok || 'bus'::text; end if;
  if p_won and extract(hour from now() at time zone 'Asia/Seoul') < 9 then ok := ok || 'early9'::text; end if;

  -- 누적 숫자
  n := n || jsonb_build_object(
    'perfects', pingpong__n(n, 'perfects', 100000000) + perfects,
    'centers', pingpong__n(n, 'centers', 100000000) + least(pingpong__n(s, 'centers', 300), hits),
    'smash_pts', pingpong__n(n, 'smash_pts', 100000000) + pingpong__n(s, 'smashPts', 50),
    'quick', pingpong__n(n, 'quick', 100000000) + pingpong__n(s, 'quickPts', 50),
    'aces', pingpong__n(n, 'aces', 100000000) + pingpong__n(s, 'aces', 50),
    'deuce_wins', pingpong__n(n, 'deuce_wins', 100000000) + case when p_won and pingpong__n(s, 'deuce', 1) = 1 then 1 else 0 end,
    'duck_wins', pingpong__n(n, 'duck_wins', 100000000) + case when p_won and paddle = 'paddle_duck' then 1 else 0 end,
    'bread_perf', pingpong__n(n, 'bread_perf', 100000000)
       + case when paddle in ('paddle_toast', 'paddle_baguette', 'paddle_donut', 'paddle_waffle', 'paddle_pizza') then perfects else 0 end,
    'day', today,
    'day_n', case when n->>'day' = today then pingpong__n(n, 'day_n', 100000) else 0 end + 1);
  -- 찬스볼을 스매시로 바꾼 연속 횟수 (경기를 넘어 이어짐)
  run := pingpong__n(n, 'chance_run', 100000);
  c := case when jsonb_typeof(s->'chances') = 'array' then s->'chances' else '[]'::jsonb end;
  for i in 0 .. least(jsonb_array_length(c), 50) - 1 loop
    if (c->>i) = '1' then run := run + 1;
      if run >= 10 then ok := ok || 'chance10'::text; end if;
    else run := 0; end if;
  end loop;
  n := n || jsonb_build_object('chance_run', run);
  -- 치는 타이밍 (밀리초, 일찍 = 음수). 한 번에 ±150ms까지만
  dt_n := pingpong__n(s, 'dtN', 300);
  dt_sum := greatest(least(coalesce((s->>'dtSum')::numeric, 0), dt_n * 150), -dt_n * 150)::int;
  n := n || jsonb_build_object('dt_n', pingpong__n(n, 'dt_n', 100000000) + dt_n,
                               'dt_sum', coalesce((n->>'dt_sum')::int, 0) + dt_sum);

  update pingpong_players set ach_n = n, ach_at = now() where id = pl.id;
  fresh := pingpong__ach_grant(pl.id, ok) || pingpong__ach_check(pl.id);
  return pingpong__ach_json(pl.id, fresh);
end $$;

revoke all on function public.pingpong__n(jsonb, text, int) from public, anon, authenticated;
revoke all on function public.pingpong_ach_match(text, text, boolean, jsonb) from public;
grant execute on function public.pingpong_ach_match(text, text, boolean, jsonb) to anon, authenticated;
