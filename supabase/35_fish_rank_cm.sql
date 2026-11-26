-- 준비하시고, 스매시! — 35: 월척 랭킹을 길이(cm) 순서로 (docs/dev/fishing.md 13장, 사용자 요청 11/26)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 34 다음에 실행.
--
--  · 34에서는 랭킹이 점수(배율) 순서였음 → 이제 실제 cm가 큰 순서. 화면에 '보통의 ○배'(x)는 그대로 보여 줌
--  · 바다 술렁임의 '이번 주 1등 기록'도 랭킹과 같게 cm로 (34의 pingpong__fish_dice에서 이 줄만 다름)
--  · 월척·대물·괴물 도장, 업적 「월척 사냥꾼」은 그대로 점수(배율)로

create or replace function public.pingpong__fish_dice(p_player uuid, p_day_n int) returns int
language plpgsql stable set search_path = public as $$
declare
  caught int; top_at timestamptz; base int; storm int := 0;
begin
  select count(*) into caught from pingpong_fish_log where player_id = p_player;
  base := case when caught < 10 then 3 when coalesce(p_day_n, 0) < 3 then 2 else 1 end;
  select l.at into top_at from pingpong_fish_log l where l.at >= pingpong__fish_week_start() order by l.cm desc, l.at limit 1;
  if top_at is not null then storm := least(4, greatest(0, floor(extract(epoch from now() - top_at) / 86400)::int)); end if;
  return base + storm;
end $$;
revoke all on function public.pingpong__fish_dice(uuid, int) from public, anon, authenticated;

-- 월척 랭킹: 길이(cm) 순서. 결과 [{ rank, nick, title, title_x, value(cm), x(배율), fish }]
create or replace function public.pingpong_fish_rank(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := case when p_kind = 'week' then pingpong__fish_week_start() else '-infinity'::timestamptz end;
begin
  if p_kind not in ('week', 'all') then return '[]'::json; end if;
  return coalesce((
    select json_agg(r order by r.rank, r.nick)
    from (
      select p.nick, p.title, case when p.title = 'nemesis' then p.ach_n->>'nemesis' end as title_x,
             b.cm as value, round(b.score / 50.0, 1) as x, b.fish_id as fish, rank() over (order by b.cm desc)::int as rank
      from (select distinct on (l.player_id) l.player_id, l.fish_id, l.cm, coalesce(l.score, l.cm) as score, l.at
              from pingpong_fish_log l where l.at >= since order by l.player_id, l.cm desc, l.at) b
      join pingpong_players p on p.id = b.player_id
      order by b.cm desc, b.at
      limit 50
    ) r), '[]'::json);
end $$;
revoke all on function public.pingpong_fish_rank(text) from public;
grant execute on function public.pingpong_fish_rank(text) to anon, authenticated;
