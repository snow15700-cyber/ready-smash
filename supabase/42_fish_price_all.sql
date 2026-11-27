-- 준비하시고, 스매시! — 42: 모든 물고기에 시세 (docs/dev/fishing.md 7장·13-1 ②, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 41 다음에 실행.
--
--  · 일반 7종은 그대로(0.6~0.85배, 그중 하나 🔥 대박 2배) — 지난 시세도 그대로
--  · 희귀·전설도 쉬는 시간마다 오르내림('중간'): 희귀 20 × 0.8~1.2 (16~24) · 전설 40 × 0.5~1.5 (20~60). 종류마다 따로, 평균은 그대로
--  · 🔥 대박은 일반 7종에서만
--  · 씨앗: 88001 + 회차 × 7919 를 xorshift 두 번 → 같은 LCG로 희귀 8종 · 전설 2종 순서대로 (src/games/fishing/market.js prices와 같게)
--  · 값 함수만 바꿈 → 팔기·가방이 꽉 찼을 때·고양이 밥(가장 싼 것)·별 배율이 모두 저절로 새 값을 씀

create or replace function public.pingpong__fish_xs32(x bigint) returns bigint
language sql immutable set search_path = public as $$
  select ((y # (y << 5)) & 4294967295)
    from (select (z # (z >> 17)) as y
            from (select ((x # (x << 13)) & 4294967295) as z) a) b
$$;
revoke all on function public.pingpong__fish_xs32(bigint) from public, anon, authenticated;

-- 물고기 하나의 그때 값 (0.1코인 단위, market.js prices) — 40과 같고 희귀·전설도 시세
create or replace function public.pingpong__fish_price(p_fish text, p_now timestamptz) returns int
language plpgsql stable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  ids constant text[] := array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer']; -- rules.js 일반 물고기 순서
  big constant text[] := array['seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon']; -- rules.js 희귀 8 · 전설 2 순서
  g text; s bigint; j int; i int; mx float8; v_out int := 0; per bigint;
begin
  select grade into g from pingpong_fish where id = p_fish and kind = 'fish';
  if g is null then return 0; end if;
  per := pingpong__fish_period(p_now);
  if g <> 'common' then
    s := pingpong__fish_xs32(pingpong__fish_xs32(mod(88001 + per * 7919, M)));
    for i in 1 .. array_length(big, 1) loop
      s := mod(s * 1664525 + 1013904223, M);
      if big[i] = p_fish then
        if i <= 8 then return floor(200 * (0.8 + (s::float8 / M) * 0.4) + 0.5);
        else return floor(400 * (0.5 + (s::float8 / M) * 1.0) + 0.5); end if;
      end if;
    end loop;
    return case when g = 'rare' then 200 else 400 end; -- 목록에 없는 새 물고기(없어야 함)
  end if;
  s := mod(77003 + per * 7919, M);
  s := mod(s * 1664525 + 1013904223, M); j := floor(s::float8 / M * 7);
  for i in 0 .. 6 loop
    s := mod(s * 1664525 + 1013904223, M); mx := 0.6 + (s::float8 / M) * 0.25;
    if ids[i + 1] = p_fish then v_out := floor(50 * (case when i = j then 2 else mx end) + 0.5); end if;
  end loop;
  return v_out;
end $$;
revoke all on function public.pingpong__fish_price(text, timestamptz) from public, anon, authenticated;

-- 점검용: 그 시각의 회차 · 17종 값 (자동 점검이 market.js와 비교. anon 못 부름)
create or replace function public.pingpong__fish_prices(p_now timestamptz) returns text
language sql stable set search_path = public as $$
  select pingpong__fish_period(p_now) || ':' || string_agg(pingpong__fish_price(id, p_now)::text, ',' order by o)
    from unnest(array['mackerel', 'horse', 'rockfish', 'greenling', 'flounder', 'squid', 'puffer',
                      'seabream', 'blackporgy', 'rockcod', 'yellowtail', 'octopus', 'lattegoby', 'moonhair', 'raindrop', 'goldball', 'dragon']) with ordinality as x(id, o)
$$;
revoke all on function public.pingpong__fish_prices(timestamptz) from public, anon, authenticated;
