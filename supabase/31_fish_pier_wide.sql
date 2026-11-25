-- 31: 낚시터 계단을 전망대 양쪽(서·동)으로 + 그만큼 선착장 판을 서쪽으로 넓힘 (docs/dev/fishing.md 12장 ⑥, 사용자 11/25)
-- 판 x 0.5~21.5 (예전 4~21.5), z 39~45.5 그대로. 서는 곳: x 1.3~20.8 (예전 4.8~20.8), 앞 끝 z 44.6, 뒤 39.6 그대로.
-- 기포 시간표도 바꿈 (11/25 사용자): 114초 칸마다 1~2곳, 칸 시작 + 0~6초에 나타나서 30초 (예전 210초 칸·40초).
-- 30의 세 함수를 서는 곳 x 범위·기포 시간만 바꿔 다시 만듦. src/games/fishing/rules.js STAND · account.js 로컬 가짜 서버와 같게.
-- 여러 번 실행해도 됨. 30 다음에 실행.

create or replace function public.pingpong__fish_near(p_now timestamptz, p_x float8, p_z float8) returns int
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 114);
  k bigint; s bigint; cnt int; i int;
  sx float8; aim float8; pw float8; st float8; d float8; a float8; bx float8; bz float8; dist float8;
  best int := 0;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M); -- (for 반복 변수는 int라 bigint로)
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); sx := 1.3 + (s::float8 / M) * (20.8 - 1.3);
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 114 + (s::float8 / M) * 6;
      if nowsec < st or nowsec > st + 30 then continue; end if;
      d := 6 + 12 * least(1, greatest(0, pw)); a := -least(1, greatest(-1, aim)) * 0.7;
      bx := sx + sin(a) * d; bz := 44.6 + cos(a) * d;
      dist := sqrt((p_x - bx) ^ 2 + (p_z - bz) ^ 2);
      best := greatest(best, case when dist <= 1.5 then 2 when dist <= 3.5 then 1 else 0 end);
    end loop;
  end loop;
  return best;
end $$;;
revoke all on function public.pingpong__fish_near(timestamptz, float8, float8) from public, anon, authenticated;

create or replace function public.pingpong__fish_bubbles(p_now timestamptz) returns table(x float8, z float8)
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 114);
  k bigint; s bigint; cnt int; i int;
  sx float8; aim float8; pw float8; st float8; d float8; a float8;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M); -- (for 반복 변수는 int라 bigint로)
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); sx := 1.3 + (s::float8 / M) * (20.8 - 1.3);
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 114 + (s::float8 / M) * 6;
      if nowsec < st or nowsec > st + 30 then continue; end if;
      d := 6 + 12 * least(1, greatest(0, pw)); a := -least(1, greatest(-1, aim)) * 0.7;
      x := sx + sin(a) * d; z := 44.6 + cos(a) * d;
      return next;
    end loop;
  end loop;
end $$;;
revoke all on function public.pingpong__fish_bubbles(timestamptz) from public, anon, authenticated;

-- 던지기 (31: 서는 곳 x 1.3~20.8)

create or replace function public.pingpong_fish_cast(p_token text, p_x float8, p_z float8, p_aim float8, p_power float8, p_rain boolean) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  sx float8 := least(20.8, greatest(1.3, coalesce(p_x, 13)));
  sz float8 := least(44.6, greatest(39.6, coalesce(p_z, 44.6))); -- 30: 넓은 판 위 어디서든 (앞 끝 44.6 ~ 뒤 39.6)
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
  near := pingpong__fish_near(now(), sx + sin(a) * d, sz + cos(a) * d);
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
end $$;;
revoke all on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) from public;
grant execute on function public.pingpong_fish_cast(text, float8, float8, float8, float8, boolean) to anon, authenticated;
