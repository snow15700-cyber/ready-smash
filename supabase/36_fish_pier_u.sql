-- 준비하시고, 스매시! — 36: 'ㄷ자' 넓은 선착장 (docs/dev/fishing.md 14-9 1b, 사용자 확정 11/26 A안)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 35 다음에 실행.
--
--  · 나무 판: 앞 판 x −6~28 · z 39~46.5, 서쪽 팔 x −6~−2 · 동쪽 팔 x 24~28 (z 46.5~57.5), 등대 돌 받침 x −8.4~−6 · 28~30.4 (z 54.6~57.5). src/games/fishing/rules.js WOOD와 같게
--  · 서는 곳(가장 가까운 네모로): 앞 판 x −5.3~27.3 · z 39.6~45.6 / 서쪽 팔 x −5.3~−2.7 · 동쪽 팔 x 24.7~27.3 (z 45.6~56.8)
--  · 찌가 판 위에 떨어지면 같은 방향으로 판 끝 + 0.6m까지 (rules.js landingPoint와 같게)
--  · 기포: 앞 판 앞줄(z 45.6, x −5.3~27.3)에서 던진 자리 (시간표는 31 그대로)
--  · pingpong_fish_cast는 34와 같고 서는 곳·찌 자리 부분만 다르다.

-- 서는 곳 안으로 (가장 가까운 네모, 같으면 앞 것)
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

-- 찌가 떨어지는 곳 (판 위면 같은 방향으로 판 밖 + 0.6m, 최대 4번)
create or replace function public.pingpong__fish_land(p_x float8, p_z float8, p_aim float8, p_power float8, out x float8, out z float8)
language plpgsql immutable set search_path = public as $$
declare
  W float8[] := array[[-6, 28, 39, 46.5], [-6, -2, 46.5, 57.5], [24, 28, 46.5, 57.5], [-8.4, -6, 54.6, 57.5], [28, 30.4, 54.6, 57.5]];
  pad constant float8 := 0.6;
  sx float8; sz float8;
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8 := -least(1, greatest(-1, coalesce(p_aim, 0))) * 0.7;
  ux float8 := sin(a); uz float8 := cos(a);
  k int; i int; hit int; t float8;
begin
  select s.x, s.z into sx, sz from pingpong__fish_stand(p_x, p_z) s;
  x := sx + ux * d; z := sz + uz * d;
  for k in 1 .. 4 loop
    hit := 0;
    for i in 1 .. 5 loop
      if x > W[i][1] - pad and x < W[i][2] + pad and z > W[i][3] - pad and z < W[i][4] + pad then hit := i; exit; end if;
    end loop;
    exit when hit = 0;
    t := (W[hit][4] + pad - z) / uz;
    if ux > 1e-9 then t := least(t, (W[hit][2] + pad - x) / ux);
    elsif ux < -1e-9 then t := least(t, (W[hit][1] - pad - x) / ux); end if;
    x := x + ux * (t + 0.001); z := z + uz * (t + 0.001);
  end loop;
end $$;
revoke all on function public.pingpong__fish_land(float8, float8, float8, float8) from public, anon, authenticated;

-- 지금 기포들 (31의 시간표 그대로, 던진 자리만 새 선착장 앞줄에서)
create or replace function public.pingpong__fish_bubbles(p_now timestamptz) returns table(x float8, z float8)
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 114);
  k bigint; s bigint; cnt int; i int;
  sx float8; aim float8; pw float8; st float8;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M);
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); sx := -5.3 + (s::float8 / M) * (27.3 - -5.3);
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 114 + (s::float8 / M) * 6;
      if nowsec < st or nowsec > st + 30 then continue; end if;
      select l.x, l.z into x, z from pingpong__fish_land(sx, 45.6, aim, pw) l;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.pingpong__fish_bubbles(timestamptz) from public, anon, authenticated;

-- 기포 근처인지: 2 = 바로 위(1.5m) · 1 = 근처(3.5m) · 0 = 아님
create or replace function public.pingpong__fish_near(p_now timestamptz, p_x float8, p_z float8) returns int
language sql immutable set search_path = public as $$
  select coalesce(max(case when sqrt((p_x - b.x) ^ 2 + (p_z - b.z) ^ 2) <= 1.5 then 2 when sqrt((p_x - b.x) ^ 2 + (p_z - b.z) ^ 2) <= 3.5 then 1 else 0 end), 0)
  from public.pingpong__fish_bubbles(p_now) b
$$;
revoke all on function public.pingpong__fish_near(timestamptz, float8, float8) from public, anon, authenticated;

-- 던지기 (34와 같음 + 서는 곳·찌 자리는 pingpong__fish_land)
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
