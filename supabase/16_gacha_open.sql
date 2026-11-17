-- 준비하시고, 스매시! — 16단계: 뽑기 통은 '일반' 아이템이 있어야 열린다 (15_backgrounds.sql 다음에 실행)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
-- 사용자 확정(2026-11-17): 경기장 뽑기는 지금 고급 배경 5종뿐이라 뽑으면 늘 고급이 나온다 → 일반 아이템이 들어올 때까지 잠시 닫는다.
-- 일반 아이템(탁구대·탁구공·일반 배경)을 insert하면 따로 할 일 없이 자동으로 열린다. (화면 쪽 같은 규칙: src/items.js의 poolOpen)
-- 직접 구매·조각 교환(pingpong_buy)은 그대로 열려 있다.
-- 06_shop.sql의 pingpong_gacha와 같고, '닫힘(closed)' 확인 세 줄만 더했다.

create or replace function public.pingpong_gacha(p_token text, p_pool text, p_count int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  cost int := case p_count when 1 then 100 when 10 then 900 end;
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
    pity_char  = case when p_pool = 'char'  then pity else pity_char end,
    pity_arena = case when p_pool = 'arena' then pity else pity_arena end
  where id = pl.id returning * into pl;
  return (pingpong__shop_json(pl)::jsonb || jsonb_build_object('results', array_to_json(results)))::json;
end $$;

revoke all on function public.pingpong_gacha(text, text, int) from public;
grant execute on function public.pingpong_gacha(text, text, int) to anon, authenticated;
