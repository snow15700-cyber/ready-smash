-- 준비하시고, 스매시! — 48: 🎷🎸🎻 장르별 물고기·시세 (docs/dev/fishing.md 13-3 ⑤ 3단계, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 47 다음에 실행.
--
--  · 자리 = 장르: 앞 판 🎷 재즈 · 서쪽 팔 🎻 발라드 · 동쪽 팔 🎸 록 (rules.js standGenre)
--  · 물고기마다 장르(pingpong_fish.genre = rules.js ZONE). 전설 2종·잡동사니는 장르 없음
--  · 잡기: 등급(일반·희귀·전설)은 지금 그대로 뽑고, 그 안에서 내 자리 장르 물고기가 70% (rules.js rollCatch·pickZone)
--      고를 물고기 중 내 장르 것만 있거나 하나도 없으면 그냥 아무거나
--  · 시세: 난수 순서는 그대로, 배율 범위만 장르별 (market.js GENRE_SWING) — 재즈는 전과 똑같음
--      🎸 록 일반 0.4~1.05 · 희귀 0.7~1.3 / 🎷 재즈 0.6~0.85 · 0.8~1.2 / 🎻 발라드 0.675~0.775 · 0.9~1.1 / 전설 0.5~1.5
--      🔥 대박(2배)·📰 소식·🛒 판 만큼은 그대로. 팔기·꽉 찬 가방·고양이 밥·별 배율은 pingpong__fish_price를 써서 저절로 바뀜

alter table public.pingpong_fish add column if not exists genre text;
update public.pingpong_fish set genre = case
  when id in ('rockfish', 'greenling', 'blackporgy', 'octopus', 'moonhair', 'lattegoby') then 'jazz'
  when id in ('mackerel', 'squid', 'puffer', 'yellowtail', 'rockcod') then 'rock'
  when id in ('horse', 'flounder', 'seabream', 'raindrop') then 'ballad'
  else null end;

-- 서는 곳 안으로 (36과 똑같음 — 혹시 없더라도 이 파일 하나로 되게 다시 만듦)
create or replace function public.pingpong__fish_stand(p_x float8, p_z float8, out x float8, out z float8)
language plpgsql immutable set search_path = public as $$
declare
  R float8[] := array[[-5.3, 27.3, 39.6, 45.6], [-5.3, -2.7, 45.6, 56.8], [24.7, 27.3, 45.6, 56.8]];
  px float8 := coalesce(p_x, 13); pz float8 := coalesce(p_z, 45.6);
  i int; cx float8; cz float8; dd float8; bd float8 := 'infinity';
begin
  for i in 1 .. 3 loop
    cx := least(R[i][2], greatest(R[i][1], px)); cz := least(R[i][4], greatest(R[i][3], pz));
    dd := (cx - px) ^ 2 + (cz - pz) ^ 2;
    if dd < bd then bd := dd; x := cx; z := cz; end if;
  end loop;
end $$;
revoke all on function public.pingpong__fish_stand(float8, float8) from public, anon, authenticated;

-- 선 자리 장르 (rules.js standGenre): 서는 곳에 붙인 뒤 앞 판(모서리 줄 포함) = 재즈 · 팔은 판 가운데(x 11)보다 서쪽 = 발라드 · 동쪽 = 록
create or replace function public.pingpong__fish_genre(p_x float8, p_z float8) returns text
language plpgsql immutable set search_path = public as $$
declare sx float8; sz float8;
begin
  select s.x, s.z into sx, sz from public.pingpong__fish_stand(p_x, p_z) s; -- 36 (plpgsql + public. — SQL Editor의 search_path와 상관없이)
  return case when sz <= 45.6 + 1e-6 then 'jazz' when sx < 11 then 'ballad' else 'rock' end;
end $$;
revoke all on function public.pingpong__fish_genre(float8, float8) from public, anon, authenticated;

-- 물고기 목록에서 하나: 내 장르 것과 다른 것이 둘 다 있으면 70%로 내 장르 쪽 (rules.js pickZone)
create or replace function public.pingpong__fish_zone_pick(p_ids text[], p_genre text) returns text
language plpgsql volatile set search_path = public as $$
declare mine text[]; other text[];
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return null; end if;
  select array_agg(f.id) filter (where f.genre is not distinct from p_genre and p_genre is not null),
         array_agg(f.id) filter (where not (f.genre is not distinct from p_genre and p_genre is not null))
    into mine, other from pingpong_fish f where f.id = any(p_ids);
  if mine is null or other is null then return p_ids[1 + floor(random() * array_length(p_ids, 1))::int]; end if;
  if random() < 0.7 then return mine[1 + floor(random() * array_length(mine, 1))::int]; end if;
  return other[1 + floor(random() * array_length(other, 1))::int];
end $$;
revoke all on function public.pingpong__fish_zone_pick(text[], text) from public, anon, authenticated;

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js prices) — 44와 같고 배율 범위만 장르별(GENRE_SWING)
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  big constant text[] := array['seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon']; -- rules.js 희귀 8 · 전설 2 순서
  g text; gn text; lo float8; sp float8; s bigint; j int; i int; mx float8; v_out int := 0; per bigint; w text;
begin
  select grade, genre into g, gn from pingpong_fish where id = p_fish and kind = 'fish';
  if g is null then return 0; end if;
  per := pingpong__fish_period(p_now);
  s := mod(77003 + per * 7919, M);
  s := mod(s * 1664525 + 1013904223, M); j := floor(s::float8 / M * 7);
  if g <> 'common' then
    s := pingpong__fish_xs32(pingpong__fish_xs32(mod(88001 + per * 7919, M)));
    v_out := case when g = 'rare' then 200 else 400 end; -- 목록에 없는 새 물고기(없어야 함)
    for i in 1 .. array_length(big, 1) loop
      s := mod(s * 1664525 + 1013904223, M);
      if big[i] = p_fish then
        if i <= 8 then
          lo := case gn when 'rock' then 0.7 when 'ballad' then 0.9 else 0.8 end; sp := case gn when 'rock' then 0.6 when 'ballad' then 0.2 else 0.4 end;
          v_out := floor(200 * (lo + (s::float8 / M) * sp) + 0.5);
        else v_out := floor(400 * (0.5 + (s::float8 / M) * 1.0) + 0.5); end if;
      end if;
    end loop;
  else
    lo := case gn when 'rock' then 0.4 when 'ballad' then 0.675 else 0.6 end; sp := case gn when 'rock' then 0.65 when 'ballad' then 0.1 else 0.25 end;
    for i in 0 .. 6 loop
      s := mod(s * 1664525 + 1013904223, M); mx := lo + (s::float8 / M) * sp;
      if ids[i + 1] = p_fish then v_out := floor(50 * (case when i = j then 2 else mx end) + 0.5); end if;
    end loop;
  end if;
  select n.wx into w from pingpong_fish_news n where n.period = per;
  v_out := (v_out * pingpong__fish_news_x(p_fish, per, w, ids[j + 1]) + 5) / 10;
  return (v_out * pingpong__fish_demand_x(p_fish, per) + 5) / 10; -- 44 🛒
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 던지기 (36과 같음 + 48: 선 자리 장르 물고기 70%)
create or replace function public.pingpong_fish_cast(p_token text, p_x float8, p_z float8, p_aim float8, p_power float8, p_rain boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  lx float8; lz float8;
  near int; r float8; odds int[];
  v_kind text; v_item text; v_grade text; v_dup boolean := false; v_cm numeric(5, 1) := 0; v_s numeric(5, 1) := 0;
  h int := extract(hour from now() at time zone 'Asia/Seoul');
  today date := (now() at time zone 'Asia/Seoul')::date;
  day_n int; dice int; u float8;
  paddles text[] := array['paddle_pan', 'paddle_guitar', 'paddle_keyboard', 'paddle_mouse', 'paddle_phone', 'paddle_duck', 'paddle_hammer'];
  c jsonb;
  v_genre text := pingpong__fish_genre(p_x, p_z); -- 48: 선 자리 장르
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  select l.x, l.z into lx, lz from pingpong__fish_land(p_x, p_z, p_aim, p_power) l; -- 36: ㄷ자 선착장
  near := pingpong__fish_near(now(), lx, lz);
  if random() < 0.01 then
    v_kind := 'paddle'; v_grade := 'rare';
    select pid into v_item from unnest(paddles) pid
      where not exists (select 1 from pingpong_inventory v where v.player_id = pl.id and v.item_id = pid) order by random() limit 1;
    if v_item is null then v_dup := true; v_item := paddles[1 + floor(random() * 7)::int]; end if;
  else
    odds := case near when 2 then array[25, 55, 20] when 1 then array[45, 43, 12] else array[72, 25, 3] end;
    r := random() * 100;
    if r < odds[1] then
      v_grade := 'common';
      v_kind := case when random() < 0.13 then 'junk' else 'fish' end;
      if v_kind = 'junk' then
        select f.id into v_item from pingpong_fish f where f.kind = 'junk' and f.grade = 'common' order by random() limit 1;
      else
        v_item := pingpong__fish_zone_pick(array(select f.id from pingpong_fish f where f.kind = 'fish' and f.grade = 'common'), v_genre);
      end if;
    elsif r < odds[1] + odds[2] then
      v_grade := 'rare'; v_kind := 'fish';
      if random() < 0.4 then
        v_item := pingpong__fish_zone_pick(array(select f.id from pingpong_fish f where f.cond is not null
          and ((f.cond = 'break' and pingpong__is_break(now())) or (f.cond = 'night' and (h >= 19 or h < 6)) or (f.cond = 'rain' and coalesce(p_rain, false)))), v_genre);
      end if;
      if v_item is null then v_item := pingpong__fish_zone_pick(array(select f.id from pingpong_fish f where f.kind = 'fish' and f.grade = 'rare' and f.cond is null), v_genre); end if;
    else
      v_grade := 'legend'; v_kind := 'fish';
      select f.id into v_item from pingpong_fish f where f.grade = 'legend' order by random() limit 1;
    end if;
    if v_kind = 'fish' then -- 34: 행운 주사위 → 점수 → 그 물고기 cm
      day_n := case when pl.fish_day = today then pl.fish_day_n else 0 end;
      dice := pingpong__fish_dice(pl.id, day_n);
      select max(random()) into u from generate_series(1, dice);
      v_s := round(pingpong__fish_cm(u)::numeric, 1);
      v_cm := round(v_s * (select f.base_cm from pingpong_fish f where f.id = v_item) / 50.0, 1);
      update pingpong_players set fish_day = today, fish_day_n = day_n + 1 where id = pl.id;
    end if;
  end if;
  c := jsonb_build_object('id', md5(random()::text || clock_timestamp()::text), 'kind', v_kind, 'item', v_item, 'grade', v_grade,
                          'cm', v_cm, 's', v_s, 'dup', v_dup, 'near', near, 'at', extract(epoch from clock_timestamp()));
  update pingpong_players set fish_cast = c where id = pl.id;
  return json_build_object('status', 'ok', 'cast', c - 'at');
end $$;
revoke all on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) from public;
grant execute on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) to anon, authenticated;
