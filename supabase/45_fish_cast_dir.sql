-- 준비하시고, 스매시! — 45: 양쪽 팔에서 던지는 방향 고침 (docs/dev/fishing.md 13-3 🐞, 사용자 확정 11/27)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 44 다음에 실행.
--
--  · 전에는 어디서나 남쪽(+z)으로만 던져서, 양쪽 팔에서는 찌가 선착장 판을 넘어 항구 쪽으로 감
--  · 이제: 앞 판 = 남쪽(그대로) · 서쪽 팔 = 서쪽 바다(−x) · 동쪽 팔 = 동쪽 바다(+x). 부채꼴 ±0.7 · 6~18m는 그대로
--  · 팔에서 비스듬히 북쪽으로 던져도 절벽에 안 닿게 z는 43 이상
--  · src/games/fishing/rules.js castHeading·landingPoint와 같게 (자동 점검이 150곳을 비교)
--  · 기포(pingpong__fish_bubbles)는 앞 판에서 던진 자리라 그대로 (바뀌지 않음)

-- 찌가 떨어지는 곳 (판 위면 같은 방향으로 판 밖 + 0.6m, 최대 4번)
create or replace function public.pingpong__fish_land(p_x float8, p_z float8, p_aim float8, p_power float8, out x float8, out z float8)
language plpgsql immutable set search_path = public as $$
declare
  W float8[] := array[[-6, 28, 39, 46.5], [-6, -2, 46.5, 57.5], [24, 28, 46.5, 57.5], [-8.4, -6, 54.6, 57.5], [28, 30.4, 54.6, 57.5]];
  pad constant float8 := 0.6;
  sx float8; sz float8; h float8;
  pw float8 := least(1, greatest(0, coalesce(p_power, 0.5)));
  d float8 := 6 + 12 * pw; a float8;
  ux float8; uz float8;
  k int; i int; hit int; t float8;
begin
  select s.x, s.z into sx, sz from pingpong__fish_stand(p_x, p_z) s;
  h := case when sz <= 45.6 + 1e-6 then 0 when sx < 11 then -pi() / 2 else pi() / 2 end; -- 앞 판 · 서쪽 팔 · 동쪽 팔
  a := h - least(1, greatest(-1, coalesce(p_aim, 0))) * 0.7;
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
