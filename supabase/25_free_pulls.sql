-- 25: 무료 뽑기 50회 선물 (2026-11-23, 모든 선수 — 지금 있는 사람도, 앞으로 가입하는 사람도)
-- 무료 횟수가 뽑을 횟수만큼 남아 있으면 코인 대신 무료 횟수를 쓴다 (캐릭터·경기장 뽑기 함께 50회).
-- 여러 번 실행해도 된다: 칸이 이미 있으면 그대로 두므로 남은 횟수가 다시 50으로 돌아가지 않는다.
-- 16_gacha_open.sql의 pingpong_gacha와 같고, 값(cost)·무료 횟수 부분만 다르다.

alter table public.pingpong_players add column if not exists free_pulls int not null default 50;

-- 상점 정보에 남은 무료 횟수(free)를 더함 (06_shop.sql과 같고 'free'만 추가)
create or replace function public.pingpong__shop_json(p public.pingpong_players) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('status', 'ok', 'player', pingpong__player_json(p),
    'owned', coalesce((select json_agg(item_id) from pingpong_inventory where player_id = p.id), '[]'::json),
    'pity', json_build_object('char', p.pity_char, 'arena', p.pity_arena),
    'free', p.free_pulls)
$$;
revoke all on function public.pingpong__shop_json(public.pingpong_players) from public, anon, authenticated;

create or replace function public.pingpong_gacha(p_token text, p_pool text, p_count int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  cost int := case p_count when 1 then 100 when 10 then 900 end;
  use_free boolean;
  pity int;
  results json[] := array[]::json[];
  g text; r float; it text; dup boolean; got int; i int;
  gained int := 0;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_pool not in ('char', 'arena') or cost is null then return json_build_object('status', 'bad'); end if;
  if not exists (select 1 from pingpong_items where pool = p_pool and on_sale) then
    return json_build_object('status', 'empty');
  end if;
  -- 일반 아이템이 없으면 잠시 닫힘
  if not exists (select 1 from pingpong_items where pool = p_pool and grade = 'common' and on_sale) then
    return json_build_object('status', 'closed');
  end if;
  select * into pl from pingpong_players where id = pl.id for update;   -- 동시에 두 번 눌러도 안전하게
  use_free := pl.free_pulls >= p_count;
  if use_free then cost := 0; end if;
  if pl.coins < cost then return json_build_object('status', 'no_coins'); end if;
  pity := case p_pool when 'char' then pl.pity_char else pl.pity_arena end;

  for i in 1..p_count loop
    r := random();
    g := case when pity >= 40 then 'legend' when r < 0.05 then 'legend' when r < 0.30 then 'rare' else 'common' end;
    -- 그 등급에 아이템이 없으면 있는 등급으로 (일반 → 고급 → 전설 순서로 찾기)
    if not exists (select 1 from pingpong_items where pool = p_pool and grade = g and on_sale) then
      select grade into g from pingpong_items where pool = p_pool and on_sale
        order by case grade when 'common' then 1 when 'rare' then 2 else 3 end limit 1;
    end if;
    select id into it from pingpong_items where pool = p_pool and grade = g and on_sale order by random() limit 1;
    pity := case when g = 'legend' then 0 else pity + 1 end;
    insert into pingpong_inventory(player_id, item_id) values (pl.id, it) on conflict do nothing;
    dup := not found;
    got := case when dup then case g when 'common' then 2 when 'rare' then 6 else 30 end else 0 end;
    gained := gained + got;
    results := results || json_build_object('item', it, 'grade', g, 'dup', dup, 'pieces', got);
  end loop;

  update pingpong_players set
    coins = coins - cost, pieces = pieces + gained,
    free_pulls = free_pulls - case when use_free then p_count else 0 end,
    pity_char  = case when p_pool = 'char'  then pity else pity_char end,
    pity_arena = case when p_pool = 'arena' then pity else pity_arena end
  where id = pl.id returning * into pl;
  return (pingpong__shop_json(pl)::jsonb || jsonb_build_object('results', array_to_json(results), 'used_free', use_free))::json;
end $$;

revoke all on function public.pingpong_gacha(text, text, int) from public;
grant execute on function public.pingpong_gacha(text, text, int) to anon, authenticated;
