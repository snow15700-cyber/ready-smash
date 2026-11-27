-- 준비하시고, 스매시! — 43: 📰 시세 소식(뉴스) (docs/dev/fishing.md 7장·13-1 ④, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 42 다음에 실행.
--
--  · 쉬는 시간(시세 회차)마다 소식 1개 → 물고기 하나 값 ×1.3(오름) 또는 ×0.7(내림). 오름·내림 반반이라 평균 코인은 그대로
--  · 대구 진짜 날씨와 엮음: 그 회차에 처음 시세를 본 브라우저가 지금 날씨를 알려 줌(pingpong_fish_news) → 회차마다 한 번만 저장(바꿀 수 없음)
--    날씨를 알면 날씨 소식 반 · 보통 소식 반, 모르면 보통 소식만. 대박 물고기 소식은 빼고 뽑음
--  · 씨앗 99001 + 회차 × 7919 를 xorshift 두 번 → LCG 두 번(a: 날씨/보통, b: 몇 번째). 목록 순서 = src/games/fishing/market.js NEWS
--  · 값 = 42의 시세 → 소식이면 floor((값 × 13 또는 7 + 5) / 10). 팔기·가방이 꽉 찼을 때·고양이 밥·별 배율은 이 값을 씀

create table if not exists public.pingpong_fish_news (
  period bigint primary key,                 -- 회차 번호(한국 날짜 번호 × 10 + 그날 몇 번째 쉬는 시간)
  wx     text not null check (wx in ('clear', 'cloudy', 'rain', 'snow')),
  at     timestamptz not null default now()
);
alter table public.pingpong_fish_news enable row level security;
revoke all on public.pingpong_fish_news from anon, authenticated;

-- 그 회차 소식이 그 물고기 값에 곱하는 수 × 10 (소식 아니면 10)
create or replace function public.pingpong__fish_news_x(p_fish text, p_per bigint, p_wx text, p_jack text) returns int
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  wxs constant text[] := array['clear','clear','clear','clear','cloudy','cloudy','cloudy','cloudy','rain','rain','rain','rain','snow','snow','snow','snow',null,null,null,null,null,null,null,null,null,null];
  ids constant text[] := array['squid','mackerel','yellowtail','horse','moonhair','rockfish','octopus','greenling','raindrop','mackerel','puffer','flounder','yellowtail','squid','lattegoby','flounder','seabream','octopus','rockcod','goldball','greenling','blackporgy','puffer','dragon','rockfish','lattegoby'];
  dirs constant int[] := array[1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,1,1,1,1,-1,-1,-1,-1,-1];
  s bigint; a float8; b float8; use_wx boolean; n int := 0; k int; i int;
begin
  s := pingpong__fish_xs32(pingpong__fish_xs32(mod(99001 + p_per * 7919, M)));
  s := mod(s * 1664525 + 1013904223, M); a := s::float8 / M;
  s := mod(s * 1664525 + 1013904223, M); b := s::float8 / M;
  use_wx := p_wx in ('clear', 'cloudy', 'rain', 'snow') and a < 0.5;
  for i in 1 .. array_length(ids, 1) loop
    if ids[i] <> p_jack and (case when use_wx then wxs[i] = p_wx else wxs[i] is null end) then n := n + 1; end if;
  end loop;
  if n = 0 then return 10; end if;
  k := floor(b * n);
  for i in 1 .. array_length(ids, 1) loop
    if ids[i] <> p_jack and (case when use_wx then wxs[i] = p_wx else wxs[i] is null end) then
      if k = 0 then return case when ids[i] = p_fish then (case when dirs[i] > 0 then 13 else 7 end) else 10 end; end if;
      k := k - 1;
    end if;
  end loop;
  return 10;
end $$;
revoke all on function public.pingpong__fish_news_x(text, bigint, text, text) from public, anon, authenticated;

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js prices) — 42 + 📰 소식
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  big constant text[] := array['seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon']; -- rules.js 희귀 8 · 전설 2 순서
  g text; s bigint; j int; i int; mx float8; v_out int := 0; per bigint; w text;
begin
  select grade into g from pingpong_fish where id = p_fish and kind = 'fish';
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
        if i <= 8 then v_out := floor(200 * (0.8 + (s::float8 / M) * 0.4) + 0.5);
        else v_out := floor(400 * (0.5 + (s::float8 / M) * 1.0) + 0.5); end if;
      end if;
    end loop;
  else
    for i in 0 .. 6 loop
      s := mod(s * 1664525 + 1013904223, M); mx := 0.6 + (s::float8 / M) * 0.25;
      if ids[i + 1] = p_fish then v_out := floor(50 * (case when i = j then 2 else mx end) + 0.5); end if;
    end loop;
  end if;
  select n.wx into w from pingpong_fish_news n where n.period = per;
  return (v_out * pingpong__fish_news_x(p_fish, per, w, ids[j + 1]) + 5) / 10;
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 브라우저가 지금 대구 날씨를 알려 줌(지금 회차에 아직 없을 때만 저장) + 최근 회차들의 날씨
-- 로그인 안 해도 부름(시세표는 누구나 봄). 날씨를 모르면 p_wx = null(읽기만)
create or replace function public.pingpong_fish_news(p_wx text default null) returns json
language plpgsql security definer set search_path = public as $$
declare per bigint := pingpong__fish_period(now());
begin
  if p_wx in ('clear', 'cloudy', 'rain', 'snow') then
    insert into pingpong_fish_news(period, wx) values (per, p_wx) on conflict (period) do nothing;
  end if;
  return json_build_object('status', 'ok', 'period', per, 'news', coalesce((
    select json_agg(json_build_object('p', t.period, 'wx', t.wx) order by t.period desc)
      from (select period, wx from pingpong_fish_news order by period desc limit 12) t), '[]'::json));
end $$;
revoke all on function public.pingpong_fish_news(text) from public;
grant execute on function public.pingpong_fish_news(text) to anon, authenticated;
