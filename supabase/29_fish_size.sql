-- 준비하시고, 스매시! — 29: 물고기 크기 '최대 없음 + 긴 꼬리' (28_fishing.sql 다음, docs/dev/fishing.md 11장)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 사용자 확정(11/25): 100cm 상한을 없애고, 아주 드물게 훨씬 큰 물고기가 나오게.
--  · 85cm까지는 28과 같음: 20 + 80·u^1.6 (u = 난수 0~1)
--  · 85cm 위는 파레토 꼬리: 85 + 22.5·((1−q)^(−1/3.48) − 1), q = (u − u85) / (1 − u85), u85 = (65/80)^(1/1.6)
--    → 88cm↑ 약 8% · 110cm↑ 약 0.9% · 150cm↑ 약 0.1% · 200cm↑ 약 0.02%. 안전 상한 999cm
--  · src/games/fishing/rules.js의 cmOf와 같은 식 (자동 점검이 비교)
-- 아래 pingpong_fish_cast는 28과 같고 크기 한 줄만 다르다.

create or replace function public.pingpong__fish_cm(u float8) returns float8
language plpgsql immutable set search_path = public as $$
declare
  base float8 := 20 + 80 * power(u, 1.6);
  u85 float8 := power(65.0 / 80.0, 1 / 1.6);
  q float8;
begin
  if base <= 85 then return base; end if;
  q := (u - u85) / (1 - u85);
  return least(999, 85 + 22.5 * (power(1 - q, -1 / 3.48) - 1));
end $$;
revoke all on function public.pingpong__fish_cm(float8) from public, anon, authenticated;

create or replace function public.pingpong_fish_cast(p_token text, p_x float8, p_aim float8, p_power float8, p_rain boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  sx float8 := least(17.6, greatest(8.4, coalesce(p_x, 13)));
  aim float8 := least(1, greatest(-1, coalesce(p_aim, 0)));
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8 := -aim * 0.7;
  near int; r float8; odds int[];
  v_kind text; v_item text; v_grade text; v_dup boolean := false; v_cm numeric(5, 1) := 0;
  h int := extract(hour from now() at time zone 'Asia/Seoul');
  paddles text[] := array['paddle_pan', 'paddle_guitar', 'paddle_keyboard', 'paddle_mouse', 'paddle_phone', 'paddle_duck', 'paddle_hammer'];
  c jsonb;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  near := pingpong__fish_near(now(), sx + sin(a) * d, 65.6 + cos(a) * d);
  if random() < 0.01 then
    -- 1% 전설 탁구채: 아직 없는 것 하나, 7종 다 있으면 아무거나 + 조각 30개 (리듬은 희귀처럼 두 단계)
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
      select f.id into v_item from pingpong_fish f where f.kind = v_kind and f.grade = 'common' order by random() limit 1;
    elsif r < odds[1] + odds[2] then
      v_grade := 'rare'; v_kind := 'fish';
      if random() < 0.4 then
        select f.id into v_item from pingpong_fish f where f.cond is not null
          and ((f.cond = 'break' and pingpong__is_break(now())) or (f.cond = 'night' and (h >= 19 or h < 6)) or (f.cond = 'rain' and coalesce(p_rain, false)))
          order by random() limit 1;
      end if;
      if v_item is null then select f.id into v_item from pingpong_fish f where f.kind = 'fish' and f.grade = 'rare' and f.cond is null order by random() limit 1; end if;
    else
      v_grade := 'legend'; v_kind := 'fish';
      select f.id into v_item from pingpong_fish f where f.grade = 'legend' order by random() limit 1;
    end if;
    if v_kind = 'fish' then v_cm := round(pingpong__fish_cm(random())::numeric, 1); end if; -- 29: 최대 없음 + 긴 꼬리
  end if;
  c := jsonb_build_object('id', md5(random()::text || clock_timestamp()::text), 'kind', v_kind, 'item', v_item, 'grade', v_grade,
                          'cm', v_cm, 'dup', v_dup, 'near', near, 'at', extract(epoch from clock_timestamp()));
  update pingpong_players set fish_cast = c where id = pl.id;
  return json_build_object('status', 'ok', 'cast', c - 'at');
end $$;

revoke all on function public.pingpong_fish_cast(text, float8, float8, float8, boolean) from public;
grant execute on function public.pingpong_fish_cast(text, float8, float8, float8, boolean) to anon, authenticated;
