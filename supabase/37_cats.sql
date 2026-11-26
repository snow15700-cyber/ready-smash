-- 준비하시고, 스매시! — 37: 🐱 선착장 고양이 6마리 · 밥 주기 · 하트 (docs/dev/cats.md 3a, fishing.md 14-3·14-4)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 35 다음에 실행(가방을 씀).
--
--  · 밥 = 고양이마다 1시간에 1마리(사용자 11/26). 가방에서 지금 시세가 가장 싼 생선(같으면 id 순서) 하나를 뺌
--  · 생선 1마리 = 1점, 10점마다 ♥ 하나(♥5 = 50점). 하트는 안 줄어듦 (src/games/cats/rules.js와 같은 숫자)
--  · 고양이 배회 자리는 서버가 안 다룸(각 PC가 서버 시각으로 같은 자리를 계산)

create table if not exists public.pingpong_cat (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  cat_id    text not null check (cat_id in ('cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese')),
  pts       int not null default 0 check (pts >= 0),
  fed_at    timestamptz,
  outfit    jsonb not null default '{}'::jsonb, -- 3c에서 씀
  primary key (player_id, cat_id)
);
alter table public.pingpong_cat enable row level security;
revoke all on public.pingpong_cat from anon, authenticated;

-- 내 고양이 목록: [{ id, pts, wait(다음 밥까지 초, 0 = 지금 가능) }]
create or replace function public.pingpong__cat_json(p_player uuid) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', cat_id, 'pts', pts,
           'wait', greatest(0, ceil(extract(epoch from (fed_at + interval '1 hour' - now()))))::int) order by cat_id), '[]'::json)
    from pingpong_cat where player_id = p_player
$$;
revoke all on function public.pingpong__cat_json(uuid) from public, anon, authenticated;

create or replace function public.pingpong_cat_list(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'cats', pingpong__cat_json(pl.id));
end $$;
revoke all on function public.pingpong_cat_list(text) from public;
grant execute on function public.pingpong_cat_list(text) to anon, authenticated;

-- 🐟 주기: 결과 status = ok | wait(아직 배부름, wait 초) | no_fish(가방 빔) | bad_cat | no_session
create or replace function public.pingpong_cat_feed(p_token text, p_cat text) returns json
language plpgsql security definer set search_path = public as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c pingpong_cat; v_fish text; v_before int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_cat is null or p_cat not in ('cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese') then return json_build_object('status', 'bad_cat'); end if;
  perform 1 from pingpong_players where id = pl.id for update; -- 두 번 눌러도 한 번만
  select * into c from pingpong_cat where player_id = pl.id and cat_id = p_cat;
  if c.fed_at is not null and c.fed_at > now() - interval '1 hour' then
    return json_build_object('status', 'wait', 'wait', ceil(extract(epoch from (c.fed_at + interval '1 hour' - now())))::int, 'cats', pingpong__cat_json(pl.id));
  end if;
  select fish_id into v_fish from pingpong_fish_bag where player_id = pl.id and n > 0
    order by pingpong__fish_price(fish_id, now()), fish_id limit 1;
  if v_fish is null then return json_build_object('status', 'no_fish', 'bag', pingpong__fish_bag_json(pl.id)); end if;
  update pingpong_fish_bag set n = n - 1 where player_id = pl.id and fish_id = v_fish;
  delete from pingpong_fish_bag where player_id = pl.id and n <= 0;
  v_before := coalesce(c.pts, 0);
  insert into pingpong_cat(player_id, cat_id, pts, fed_at) values (pl.id, p_cat, 1, now())
    on conflict (player_id, cat_id) do update set pts = pingpong_cat.pts + 1, fed_at = now();
  return json_build_object('status', 'ok', 'fish', v_fish, 'pts', v_before + 1,
    'up', least(5, (v_before + 1) / 10) > least(5, v_before / 10),
    'cats', pingpong__cat_json(pl.id), 'bag', pingpong__fish_bag_json(pl.id));
end $$;
revoke all on function public.pingpong_cat_feed(text, text) from public;
grant execute on function public.pingpong_cat_feed(text, text) to anon, authenticated;
