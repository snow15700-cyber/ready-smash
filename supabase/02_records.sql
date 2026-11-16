-- 준비하시고, 스매시! — 2단계: 전적 (01_accounts.sql을 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- · 경기 결과는 각자 자기 PC가 자기 승패만 기록한다(로그인 열쇠가 있어야 하고, 남의 기록은 못 건드림).
-- · 1v1 상대 전적은 '나 → 상대' 방향으로 내 쪽에만 쌓인다.
-- · 너무 짧은 간격(10초 안)으로 들어온 경기 결과는 무시한다(장난으로 승수를 부풀리지 못하게).

alter table public.pingpong_players
  add column if not exists wins_1v1    int not null default 0,
  add column if not exists losses_1v1  int not null default 0,
  add column if not exists wins_2v2    int not null default 0,
  add column if not exists losses_2v2  int not null default 0,
  add column if not exists best_rally  int not null default 0,   -- 혼자 하기(AI) 최장 랠리
  add column if not exists last_match_at timestamptz;

-- 1v1 상대 전적 (player_id 입장에서 opp_id를 상대로 몇 승 몇 패)
create table if not exists public.pingpong_h2h (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  opp_id    uuid not null references public.pingpong_players(id) on delete cascade,
  wins      int not null default 0,
  losses    int not null default 0,
  primary key (player_id, opp_id)
);
alter table public.pingpong_h2h enable row level security;
revoke all on public.pingpong_h2h from anon, authenticated;

-- 화면에 보내는 내 정보: 선수 번호(id, 상대 전적용)와 전적
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally)
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

create or replace function public.pingpong__h2h_json(p_me uuid, p_opp uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('wins', coalesce(max(wins), 0), 'losses', coalesce(max(losses), 0))
  from pingpong_h2h where player_id = p_me and opp_id = p_opp
$$;
revoke all on function public.pingpong__h2h_json(uuid, uuid) from public, anon, authenticated;

-- 경기 결과 기록. p_mode '1v1' | '2v2', p_won 이겼는지, p_opp 1v1 상대의 선수 번호(손님이면 null)
create or replace function public.pingpong_record_match(p_token text, p_mode text, p_won boolean, p_opp uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_mode not in ('1v1', '2v2') or p_won is null then return json_build_object('status', 'bad'); end if;
  if pl.last_match_at is not null and pl.last_match_at > now() - interval '10 seconds' then
    return json_build_object('status', 'too_soon');
  end if;
  update pingpong_players set
    wins_1v1   = wins_1v1   + case when p_mode = '1v1' and p_won then 1 else 0 end,
    losses_1v1 = losses_1v1 + case when p_mode = '1v1' and not p_won then 1 else 0 end,
    wins_2v2   = wins_2v2   + case when p_mode = '2v2' and p_won then 1 else 0 end,
    losses_2v2 = losses_2v2 + case when p_mode = '2v2' and not p_won then 1 else 0 end,
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
    'h2h', case when p_opp is null then null else pingpong__h2h_json(pl.id, p_opp) end);
end $$;

-- 혼자 하기 최장 랠리 기록 (지금 기록보다 클 때만 바뀜)
create or replace function public.pingpong_record_rally(p_token text, p_rally int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_rally is null or p_rally < 1 or p_rally > 10000 then return json_build_object('status', 'bad'); end if;
  update pingpong_players set best_rally = greatest(best_rally, p_rally) where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'player', pingpong__player_json(pl));
end $$;

-- 1v1 상대 전적 보기 (나 vs p_opp)
create or replace function public.pingpong_h2h(p_token text, p_opp uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'h2h', pingpong__h2h_json(pl.id, p_opp));
end $$;

revoke all on function public.pingpong_record_match(text, text, boolean, uuid) from public;
revoke all on function public.pingpong_record_rally(text, int) from public;
revoke all on function public.pingpong_h2h(text, uuid) from public;
grant execute on function public.pingpong_record_match(text, text, boolean, uuid) to anon, authenticated;
grant execute on function public.pingpong_record_rally(text, int) to anon, authenticated;
grant execute on function public.pingpong_h2h(text, uuid) to anon, authenticated;

-- ───────── 운영자용 ─────────
-- 정식 오픈 전에 테스트하며 쌓인 전적을 모두 0으로 (계정·PIN은 그대로):
-- update public.pingpong_players set wins_1v1 = 0, losses_1v1 = 0, wins_2v2 = 0, losses_2v2 = 0, best_rally = 0;
-- delete from public.pingpong_h2h;
