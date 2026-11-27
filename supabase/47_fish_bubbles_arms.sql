-- 준비하시고, 스매시! — 47: 양쪽 팔 바다에도 기포 (docs/dev/fishing.md 13-3 🫧, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 46 다음에 실행.
--
--  · 전에는 기포가 앞 판 앞줄에서 던진 자리(남쪽 바다)에만 나왔음
--  · 이제 기포마다 세 자리(앞 판 🎷 · 서쪽 팔 🎻 · 동쪽 팔 🎸) 중 하나를 같은 확률(1/3)로 고르고,
--    그 자리의 바다 쪽 가장자리에서 던진 자리에 기포 → 팔은 바깥 바다(옆·앞). 기포 수·시간(114초마다 1~2개, 30초)은 그대로
--  · src/games/fishing/rules.js slotBubbles·BUBBLE_EDGE와 같게 (자동 점검이 비교). pingpong__fish_near는 이걸 그대로 씀

create or replace function public.pingpong__fish_bubbles(p_now timestamptz) returns table(x float8, z float8)
language plpgsql immutable set search_path = public as $$
declare
  M constant bigint := 4294967296;
  nowsec float8 := extract(epoch from p_now);
  n bigint := floor(nowsec / 114);
  k bigint; s bigint; cnt int; i int; w int;
  u float8; sx float8; sz float8; aim float8; pw float8; st float8;
begin
  for k in n - 1 .. n loop
    s := mod(91731 + k::bigint * 7919, M);
    s := mod(s * 1664525 + 1013904223, M); cnt := case when s::float8 / M < 0.5 then 1 else 2 end;
    for i in 1 .. cnt loop
      s := mod(s * 1664525 + 1013904223, M); w := least(2, floor((s::float8 / M) * 3)::int); -- 0 앞 판 · 1 서쪽 팔 · 2 동쪽 팔
      s := mod(s * 1664525 + 1013904223, M); u := s::float8 / M;
      if w = 0 then sx := -5.3 + u * (27.3 - -5.3); sz := 45.6;
      elsif w = 1 then sx := -5.3; sz := 46.5 + u * (56.8 - 46.5);
      else sx := 27.3; sz := 46.5 + u * (56.8 - 46.5); end if;
      s := mod(s * 1664525 + 1013904223, M); aim := (s::float8 / M) * 2 - 1;
      s := mod(s * 1664525 + 1013904223, M); pw := 0.05 + (s::float8 / M) * 0.9;
      s := mod(s * 1664525 + 1013904223, M); st := k::bigint * 114 + (s::float8 / M) * 6;
      if nowsec < st or nowsec > st + 30 then continue; end if;
      select l.x, l.z into x, z from pingpong__fish_land(sx, sz, aim, pw) l;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.pingpong__fish_bubbles(timestamptz) from public, anon, authenticated;
