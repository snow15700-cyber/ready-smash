-- 준비하시고, 스매시! — 6단계: 상점·옷장 (01~05 SQL을 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 뽑기(가챠)·직접 구매·조각 교환·장착은 모두 서버가 정한다 (브라우저는 결과만 받음).
--  · 뽑기 통 2개: 'char' 캐릭터 뽑기, 'arena' 경기장 뽑기. 1회 100코인, 10회 900코인
--  · 확률: 일반 70% / 고급 25% / 전설 5%. 그 등급에 아이템이 아직 없으면 있는 등급에서 나온다
--  · 천장: 통마다 40번 연속 전설이 안 나오면 다음은 무조건 전설
--  · 중복이 나오면 조각: 일반 2 / 고급 6 / 전설 30
--  · 직접 구매: 코인 500 / 1,500 / 5,000 또는 조각 50 / 150 / 500
--  · 되팔기 없음. 기본 아이템(빨강 탁구채 등)은 표에 없고 처음부터 가진 것으로 친다
--
-- ⚠️ 아이템을 추가할 때는 src/items.js와 아래 insert 목록을 같이 고친다.

alter table public.pingpong_players
  add column if not exists pieces     int   not null default 0,
  add column if not exists pity_char  int   not null default 0,   -- 마지막 전설 이후 뽑은 횟수
  add column if not exists pity_arena int   not null default 0,
  add column if not exists equip      jsonb not null default '{}'::jsonb;  -- { "paddle": "paddle_blue", ... }

create table if not exists public.pingpong_items (
  id      text primary key,
  pool    text not null check (pool in ('char', 'arena')),
  cat     text not null,
  grade   text not null check (grade in ('common', 'rare', 'legend')),
  on_sale boolean not null default true
);
create table if not exists public.pingpong_inventory (
  player_id uuid not null references public.pingpong_players(id) on delete cascade,
  item_id   text not null references public.pingpong_items(id),
  got_at    timestamptz not null default now(),
  primary key (player_id, item_id)
);
alter table public.pingpong_items enable row level security;
alter table public.pingpong_inventory enable row level security;
revoke all on public.pingpong_items from anon, authenticated;
revoke all on public.pingpong_inventory from anon, authenticated;

-- 아이템 목록 (src/items.js와 같게)
insert into public.pingpong_items(id, pool, cat, grade) values
  ('paddle_blue',   'char', 'paddle', 'common'),
  ('paddle_green',  'char', 'paddle', 'common'),
  ('paddle_yellow', 'char', 'paddle', 'common'),
  ('paddle_black',  'char', 'paddle', 'common'),
  ('paddle_pink',   'char', 'paddle', 'common'),
  ('paddle_gold',   'char', 'paddle', 'rare'),
  ('paddle_neon',   'char', 'paddle', 'rare')
on conflict (id) do update set pool = excluded.pool, cat = excluded.cat, grade = excluded.grade;

-- 화면에 보내는 내 정보 (04의 항목 + 조각·장착)
create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$
  select json_build_object(
    'id', p.id, 'nick', p.nick,
    'wins_1v1', p.wins_1v1, 'losses_1v1', p.losses_1v1,
    'wins_2v2', p.wins_2v2, 'losses_2v2', p.losses_2v2,
    'best_rally', p.best_rally,
    'coins', p.coins, 'win_streak', p.win_streak,
    'pieces', p.pieces, 'equip', p.equip)
$$;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;

-- 상점 화면에 필요한 것: 내 정보, 가진 아이템, 통마다 천장까지 센 횟수
create or replace function public.pingpong__shop_json(p public.pingpong_players) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('status', 'ok', 'player', pingpong__player_json(p),
    'owned', coalesce((select json_agg(item_id) from pingpong_inventory where player_id = p.id), '[]'::json),
    'pity', json_build_object('char', p.pity_char, 'arena', p.pity_arena))
$$;
revoke all on function public.pingpong__shop_json(public.pingpong_players) from public, anon, authenticated;

create or replace function public.pingpong_shop(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return pingpong__shop_json(pl);
end $$;

-- 뽑기. p_pool 'char' | 'arena', p_count 1 | 10
-- 결과 { status, results: [{ item, grade, dup, pieces }], player, owned, pity }
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

-- 직접 구매·조각 교환. p_pay 'coins' | 'pieces'. 결과 status ok | owned | no_coins | no_pieces | bad
create or replace function public.pingpong_buy(p_token text, p_item text, p_pay text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  itm pingpong_items;
  cost int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select * into itm from pingpong_items where id = p_item and on_sale;
  if not found or p_pay not in ('coins', 'pieces') then return json_build_object('status', 'bad'); end if;
  select * into pl from pingpong_players where id = pl.id for update;
  if exists (select 1 from pingpong_inventory where player_id = pl.id and item_id = p_item) then
    return json_build_object('status', 'owned');
  end if;
  if p_pay = 'coins' then
    cost := case itm.grade when 'common' then 500 when 'rare' then 1500 else 5000 end;
    if pl.coins < cost then return json_build_object('status', 'no_coins'); end if;
    update pingpong_players set coins = coins - cost where id = pl.id returning * into pl;
  else
    cost := case itm.grade when 'common' then 50 when 'rare' then 150 else 500 end;
    if pl.pieces < cost then return json_build_object('status', 'no_pieces'); end if;
    update pingpong_players set pieces = pieces - cost where id = pl.id returning * into pl;
  end if;
  insert into pingpong_inventory(player_id, item_id) values (pl.id, p_item);
  return pingpong__shop_json(pl);
end $$;

-- 장착. p_item이 null이면 그 카테고리를 기본 아이템으로. 가진 아이템만 장착할 수 있다
create or replace function public.pingpong_equip(p_token text, p_cat text, p_item text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if p_cat is null or p_cat !~ '^[a-z]{2,12}$' then return json_build_object('status', 'bad'); end if;
  if p_item is null then
    update pingpong_players set equip = equip - p_cat where id = pl.id returning * into pl;
  else
    if not exists (select 1 from pingpong_inventory v join pingpong_items i on i.id = v.item_id
                   where v.player_id = pl.id and v.item_id = p_item and i.cat = p_cat) then
      return json_build_object('status', 'not_owned');
    end if;
    update pingpong_players set equip = equip || jsonb_build_object(p_cat, p_item) where id = pl.id returning * into pl;
  end if;
  return pingpong__shop_json(pl);
end $$;

revoke all on function public.pingpong_shop(text) from public;
revoke all on function public.pingpong_gacha(text, text, int) from public;
revoke all on function public.pingpong_buy(text, text, text) from public;
revoke all on function public.pingpong_equip(text, text, text) from public;
grant execute on function public.pingpong_shop(text) to anon, authenticated;
grant execute on function public.pingpong_gacha(text, text, int) to anon, authenticated;
grant execute on function public.pingpong_buy(text, text, text) to anon, authenticated;
grant execute on function public.pingpong_equip(text, text, text) to anon, authenticated;

-- ───────── 운영자용 ─────────
-- 테스트용으로 코인 주기:  update public.pingpong_players set coins = coins + 3000 where nick_key = lower('닉네임');
-- 아이템 판매 중지(뽑기·구매에서 빠짐, 이미 가진 사람은 그대로):  update public.pingpong_items set on_sale = false where id = '아이템';
