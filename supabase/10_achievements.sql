-- 준비하시고, 스매시! — 10단계: 업적·칭호 1단계 (01~09 SQL을 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- · 업적 하나 = 칭호 하나. 칭호는 하나만 단다(players.title = 업적 id, null이면 안 담).
-- · 업적 달성과 보상 코인은 서버가 정한다: ★ 20 / ★★ 50 / ★★★ 150
-- · 1단계에서는 이미 서버에 있는 기록(승패·연승·1대1 상대 전적·혼자 하기 최장 랠리·가진 아이템)으로
--   깰 수 있는 업적만 확인한다. 나머지 업적은 다음 단계에서 경기 기록을 더 모으면서 연다.
-- · 화면이 pingpong_achievements를 부를 때마다(로그인 직후·경기 뒤·뽑기 뒤 등) 새로 깬 업적을 지급한다.
--
-- ⚠️ 업적을 추가할 때는 src/achievements.js와 아래 insert 목록을 같이 고친다.

alter table public.pingpong_players
  add column if not exists title text;   -- 달고 있는 칭호 (업적 id)

create table if not exists public.pingpong_ach (
  id    text primary key,
  grade int  not null check (grade between 1 and 3)
);
create table if not exists public.pingpong_ach_got (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  ach_id    text not null references public.pingpong_ach(id),
  got_at    timestamptz not null default now(),
  primary key (player_id, ach_id)
);
alter table public.pingpong_ach enable row level security;
alter table public.pingpong_ach_got enable row level security;
revoke all on public.pingpong_ach from anon, authenticated;
revoke all on public.pingpong_ach_got from anon, authenticated;

-- 업적 목록 (src/achievements.js와 같게)
insert into public.pingpong_ach(id, grade) values
  ('win1', 1),
  ('win30', 2),
  ('win100', 3),
  ('games50', 2),
  ('wl10', 1),
  ('streak5', 2),
  ('streak10', 3),
  ('perf3', 1),
  ('perf10', 3),
  ('perf70', 2),
  ('perf500', 2),
  ('block3', 2),
  ('early', 1),
  ('late', 1),
  ('zigzag', 2),
  ('oneway', 1),
  ('center300', 1),
  ('noblock', 2),
  ('smash1', 1),
  ('chance10', 2),
  ('smashback', 2),
  ('smash30', 3),
  ('santa', 1),
  ('rally15', 2),
  ('rally30', 3),
  ('quick5', 1),
  ('ace20', 2),
  ('servesafe', 1),
  ('tosser', 1),
  ('windserve', 1),
  ('comeback', 3),
  ('shutout', 2),
  ('deuce5', 2),
  ('blown', 1),
  ('zero', 1),
  ('whiff3', 1),
  ('meet5', 1),
  ('beat10', 3),
  ('rival10', 2),
  ('nemesis', 1),
  ('revenge', 2),
  ('duo5', 2),
  ('carry', 2),
  ('bus', 1),
  ('ai20', 1),
  ('ai50', 2),
  ('ai100', 3),
  ('aizero', 1),
  ('own10', 1),
  ('legend1', 2),
  ('gag15', 3),
  ('gacha100', 2),
  ('duck10', 2),
  ('bread100', 2),
  ('days5', 1),
  ('days20', 2),
  ('day20', 1),
  ('early9', 1)
on conflict (id) do update set grade = excluded.grade;

-- 화면에 보내는 내 정보 (06의 항목 + 칭호)
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally,
    'coins', p.coins, 'win_streak', p.win_streak,
    'pieces', p.pieces, 'equip', p.equip, 'title', p.title)
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

-- 지금 기록으로 깰 수 있는 업적을 확인해서 새로 깬 것을 지급한다. 결과 = 새로 깬 업적 id 목록
create or replace function public.pingpong__ach_check(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  p pingpong_players;
  wins int; losses int;
  meet int; beat int; rival int; own int; legend int; gag int;
  ok text[] := array[]::text[];
  fresh text[];
  total int;
begin
  select * into p from pingpong_players where id = p_id for update;
  if not found then return array[]::text[]; end if;
  wins := p.wins_1v1 + p.wins_2v2;
  losses := p.losses_1v1 + p.losses_2v2;
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

  with ins as (
    insert into pingpong_ach_got(player_id, ach_id)
      select p.id, x from unnest(ok) x where exists (select 1 from pingpong_ach a where a.id = x)
    on conflict do nothing
    returning ach_id
  ) select coalesce(array_agg(ach_id), array[]::text[]) into fresh from ins;

  select coalesce(sum(case a.grade when 1 then 20 when 2 then 50 else 150 end), 0)::int into total
    from pingpong_ach a where a.id = any(fresh);
  if total > 0 then update pingpong_players set coins = coins + total where id = p.id; end if;
  return fresh;
end $$;
revoke all on function public.pingpong__ach_check(uuid) from public, anon, authenticated;

create or replace function public.pingpong__ach_json(p_id uuid, p_new text[]) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('status', 'ok',
    'player', (select pingpong__player_json(p) from pingpong_players p where p.id = p_id),
    'got', coalesce((select json_agg(json_build_object('id', g.ach_id, 'at', g.got_at) order by g.got_at)
                     from pingpong_ach_got g where g.player_id = p_id), '[]'::json),
    'new', coalesce((select json_agg(json_build_object('id', a.id,
                       'coins', case a.grade when 1 then 20 when 2 then 50 else 150 end))
                     from pingpong_ach a where a.id = any(p_new)), '[]'::json))
$$;
revoke all on function public.pingpong__ach_json(uuid, text[]) from public, anon, authenticated;

-- 내 업적 목록 + 새로 깬 업적 지급. 결과 { status, player, got: [{ id, at }], new: [{ id, coins }] }
create or replace function public.pingpong_achievements(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  fresh text[];
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  fresh := pingpong__ach_check(pl.id);
  return pingpong__ach_json(pl.id, fresh);
end $$;

-- 칭호 달기. p_ach가 null이면 떼기. 깬 업적의 칭호만 달 수 있다
create or replace function public.pingpong_set_title(p_token text, p_ach text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_ach is not null and not exists (select 1 from pingpong_ach_got where player_id = pl.id and ach_id = p_ach) then
    return json_build_object('status', 'not_owned');
  end if;
  update pingpong_players set title = p_ach where id = pl.id;
  return pingpong__ach_json(pl.id, array[]::text[]);
end $$;

-- 랭킹 (03과 같은 규칙 + 칭호)
create or replace function public.pingpong_ranking(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'wins' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick, title,
               wins_1v1 + wins_2v2 as value,
               wins_1v1 as w1, wins_2v2 as w2,
               rank() over (order by wins_1v1 + wins_2v2 desc)::int as rank
        from pingpong_players
        where wins_1v1 + wins_2v2 > 0
        order by 3 desc, nick
        limit 50
      ) r), '[]'::json);
  elsif p_kind = 'rally' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick, title, best_rally as value,
               rank() over (order by best_rally desc)::int as rank
        from pingpong_players
        where best_rally > 0
        order by 3 desc, nick
        limit 50
      ) r), '[]'::json);
  end if;
  return '[]'::json;
end $$;

revoke all on function public.pingpong_achievements(text) from public;
revoke all on function public.pingpong_set_title(text, text) from public;
revoke all on function public.pingpong_ranking(text) from public;
grant execute on function public.pingpong_achievements(text) to anon, authenticated;
grant execute on function public.pingpong_set_title(text, text) to anon, authenticated;
grant execute on function public.pingpong_ranking(text) to anon, authenticated;

-- ───────── 운영자용 ─────────
-- 업적을 모두 처음부터 (코인은 돌려받지 않음):  delete from public.pingpong_ach_got; update public.pingpong_players set title = null;
