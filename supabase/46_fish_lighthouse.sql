-- 준비하시고, 스매시! — 46: 등대 자리 옮김 + 팔에서 부채꼴 둥글게 (docs/dev/fishing.md 13-3, 사용자 요청 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 45 다음에 실행.
--
--  · 등대 돌 받침: 팔 끝 바깥 옆 → 팔 끝(갑판이 끝나는 곳) 바로 앞(남쪽) — 서 x −5.45~−2.55 · 동 x 24.55~27.45, z 57.5~59.9
--  · 팔에서 던질 때 45는 z 43 밑을 잘라서 부채꼴 끝이 한쪽만 꺾였음 → 북쪽(절벽 쪽) 반의 각도만 좁혀서
--    가장 멀리(18m) 던져도 z 43까지만 가게 (각도 = asin((선 자리 z − 43) / 18), 최대 0.7). 남쪽 반·앞 판은 그대로
--  · src/games/fishing/rules.js WOOD·aimAngle·landingPoint와 같게 (자동 점검이 비교)

-- 찌가 떨어지는 곳 (판 위면 같은 방향으로 판 밖 + 0.6m, 최대 4번)
create or replace function public.pingpong__fish_land(p_x float8, p_z float8, p_aim float8, p_power float8, out x float8, out z float8)
language plpgsql immutable set search_path = public as $$
declare
  W float8[] := array[[-6, 28, 39, 46.5], [-6, -2, 46.5, 57.5], [24, 28, 46.5, 57.5], [-5.45, -2.55, 57.5, 59.9], [24.55, 27.45, 57.5, 59.9]];
  pad constant float8 := 0.6;
  sx float8; sz float8; h float8; north float8; aim float8;
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8;
  ux float8; uz float8;
  k int; i int; hit int; t float8;
begin
  select s.x, s.z into sx, sz from pingpong__fish_stand(p_x, p_z) s;
  h := case when sz <= 45.6 + 1e-6 then 0 when sx < 11 then -pi() / 2 else pi() / 2 end; -- 앞 판 · 서쪽 팔 · 동쪽 팔
  aim := least(1, greatest(-1, coalesce(p_aim, 0)));
  if h = 0 then a := -aim * 0.7;
  else
    north := least(0.7, asin(least(1, greatest(0, (sz - 43) / 18)))); -- 팔: 북쪽(절벽 쪽) 반만 좁힘 (18m로 던져도 z 43까지)
    if (h < 0 and aim > 0) or (h > 0 and aim < 0) then a := h - aim * north; else a := h - aim * 0.7; end if;
  end if;
  ux := sin(a); uz := cos(a);
  x := sx + ux * d; z := sz + uz * d;
  for k in 1 .. 4 loop
    hit := 0;
    for i in 1 .. 5 loop
      if x > W[i][1] - pad and x < W[i][2] + pad and z > W[i][3] - pad and z < W[i][4] + pad then hit := i; exit; end if;
    end loop;
    exit when hit = 0;
    t := 'infinity';
    if uz > 1e-9 then t := (W[hit][4] + pad - z) / uz;
    elsif uz < -1e-9 then t := (W[hit][3] - pad - z) / uz; end if;
    if ux > 1e-9 then t := least(t, (W[hit][2] + pad - x) / ux);
    elsif ux < -1e-9 then t := least(t, (W[hit][1] - pad - x) / ux); end if;
    x := x + ux * (t + 0.001); z := z + uz * (t + 0.001);
  end loop;
  z := greatest(z, 43);
end $$;
revoke all on function public.pingpong__fish_land(float8, float8, float8, float8) from public, anon, authenticated;
