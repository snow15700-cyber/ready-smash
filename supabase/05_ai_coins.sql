-- 준비하시고, 스매시! — 5단계: 혼자 하기 코인 (01~04 SQL을 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 혼자 하기(AI)는 '내가 친 횟수' 4번마다 1코인. (1v1·2v2로 같은 시간 동안 버는 코인의 약 50%)
--  · 랠리가 끝날 때마다(내가 놓칠 때) 그 랠리에서 친 횟수를 보낸다. 남은 1~3번은 다음 랠리로 이어서 센다.
--  · 부정 방지: 서버가 '지난번 기록 이후 지난 시간'으로 칠 수 있는 최대 횟수(1초에 1번)를 넘으면 잘라낸다.
--  · 시작할 때 pingpong_ai_start로 시계를 맞춘다.

alter table public.pingpong_players
  add column if not exists ai_at  timestamptz,           -- 혼자 하기 시작 또는 마지막 랠리 기록 시각
  add column if not exists ai_rem int not null default 0; -- 코인으로 아직 안 바꾼 친 횟수 (0~3)

create or replace function public.pingpong_ai_start(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  update pingpong_players set ai_at = now() where id = pl.id;
  return json_build_object('status', 'ok');
end $$;

-- 랠리 하나가 끝났을 때. p_hits = 그 랠리에서 내가 친 횟수. 결과 { status, coins(이번에 받은 코인), player }
create or replace function public.pingpong_ai_rally(p_token text, p_hits int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  allowed int;
  hits int;
  total int;
  got int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  allowed := case when pl.ai_at is null then 0
                  else floor(extract(epoch from now() - pl.ai_at))::int + 1 end;
  hits := least(greatest(coalesce(p_hits, 0), 0), allowed, 1000);
  total := pl.ai_rem + hits;
  got := total / 4;
  update pingpong_players set coins = coins + got, ai_rem = total % 4, ai_at = now()
    where id = pl.id returning * into pl;
  return json_build_object('status', 'ok', 'coins', got, 'player', pingpong__player_json(pl));
end $$;

revoke all on function public.pingpong_ai_start(text) from public;
revoke all on function public.pingpong_ai_rally(text, int) from public;
grant execute on function public.pingpong_ai_start(text) to anon, authenticated;
grant execute on function public.pingpong_ai_rally(text, int) to anon, authenticated;
