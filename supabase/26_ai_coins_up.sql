-- 준비하시고, 스매시! — 26: 혼자 하기 코인 올리기 (2026-11-22)
-- 혼자 하기(AI)는 '내가 친 횟수' 4번 → 3번마다 1코인 (1분에 약 6 → 약 8코인, 1대1의 약 70%).
-- 24_sets.sql의 pingpong_ai_rally와 같고, 4 → 3만 다르다. 여러 번 실행해도 된다.
-- (ai_rem 칸은 0~3이던 것이 0~2가 된다. 예전에 3이 남아 있어도 다음 랠리에서 그대로 코인으로 바뀜)

create or replace function public.pingpong_ai_rally(p_token text, p_hits int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  allowed int;
  hits int;
  total int;
  got int;
  brk int := 0;
  st record;
  sb int := 0;
  brk_pct int := 50;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  allowed := case when pl.ai_at is null then 0
                  else floor(extract(epoch from now() - pl.ai_at))::int + 1 end;
  hits := least(greatest(coalesce(p_hits, 0), 0), allowed, 1000);
  total := pl.ai_rem + hits;
  got := total / 3;  -- 26: 4 → 3
  -- 19: 쉬는 시간 보너스 (랠리가 끝난 시각이 평일 쉬는 시간이면 이번 코인 +50%, 올림)
  -- 24: 세트 보너스 ('꿀잠' 세트 = 혼자 하기 코인 +15%, 완전 +30% / '휴가 중' = 쉬는 시간 +75%, 완전 +100%)
  select * into st from pingpong__set_of(pl.equip);
  if st.kind = 'ai' and got > 0 then sb := (got * st.amount + 99) / 100; end if;
  if st.kind = 'break' then brk_pct := 50 + st.amount; end if;
  if got > 0 and pingpong__is_break(now()) then brk := ((got + sb) * brk_pct + 99) / 100; end if;
  update pingpong_players set coins = coins + got + sb + brk, ai_rem = total % 3, ai_at = now(),
    best_rally = greatest(best_rally, hits)
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', got + sb + brk, 'bonus', brk, 'bonus_pct', brk_pct,
    'set', case when sb > 0 then st.label else null end, 'set_coins', sb, 'player', pingpong__player_json(pl));
end $$;

revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;
