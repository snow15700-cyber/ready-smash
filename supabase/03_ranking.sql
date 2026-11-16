-- 준비하시고, 스매시! — 3단계: 랭킹 (01, 02를 먼저 실행해 둔 상태에서 실행)
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run. 여러 번 실행해도 괜찮다.
--
-- 랭킹은 로그인 없이(손님도) 볼 수 있다. 닉네임과 기록 숫자만 내보내고, 선수 번호·PIN 등은 내보내지 않는다.
-- p_kind 'wins'  : 승수(1v1 + 2v2 합계) 순. 1승 이상인 사람만
--        'rally' : 혼자 하기 최장 랠리 순. 기록이 있는 사람만
-- 같은 기록이면 같은 등수(공동 1위 등).

create or replace function public.pingpong_ranking(p_kind text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'wins' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick,
               wins_1v1 + wins_2v2 as value,
               wins_1v1 as w1, wins_2v2 as w2,
               rank() over (order by wins_1v1 + wins_2v2 desc)::int as rank
        from pingpong_players
        where wins_1v1 + wins_2v2 > 0
        order by 2 desc, nick
        limit 50
      ) r), '[]'::json);
  elsif p_kind = 'rally' then
    return coalesce((
      select json_agg(r order by r.rank, r.nick)
      from (
        select nick, best_rally as value,
               rank() over (order by best_rally desc)::int as rank
        from pingpong_players
        where best_rally > 0
        order by 2 desc, nick
        limit 50
      ) r), '[]'::json);
  end if;
  return '[]'::json;
end $$;

revoke all on function public.pingpong_ranking(text) from public;
grant execute on function public.pingpong_ranking(text) to anon, authenticated;
