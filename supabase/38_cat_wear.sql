-- 준비하시고, 스매시! — 38: 🐱 고양이 옷 입히기 (docs/dev/cats.md 3c, fishing.md 14-4)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 괜찮다. 37 다음에 실행.
--
--  · 옷은 하트로만 열림(코인으로 못 삼): 🔔 bell ♥1 · 🎀 ribbon ♥2 · 🎩 hat ♥3 · 🧥 coat ♥4 · ✨ set ♥5 (src/games/cats/rules.js OUTFITS)
--  · pingpong_cat.outfit = { "bell": true, "ribbon": true ... } (입은 것만)
--  · 목록(pingpong__cat_json)에 outfit을 더함

create or replace function public.pingpong__cat_json(p_player uuid) returns json
language sql stable set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', cat_id, 'pts', pts, 'outfit', outfit,
           'wait', greatest(0, ceil(extract(epoch from (fed_at + interval '1 hour' - now()))))::int) order by cat_id), '[]'::json)
    from pingpong_cat where player_id = p_player
$$;
revoke all on function public.pingpong__cat_json(uuid) from public, anon, authenticated;

-- 결과 status = ok | locked(하트 모자람) | bad_slot | bad_cat | no_session
create or replace function public.pingpong_cat_wear(p_token text, p_cat text, p_slot text, p_on boolean) returns json
language plpgsql security definer set search_path = public as $$
declare
  pl pingpong_players := pingpong__session_player(p_token);
  c pingpong_cat; need int;
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  need := case p_slot when 'bell' then 1 when 'ribbon' then 2 when 'hat' then 3 when 'coat' then 4 when 'set' then 5 end;
  if need is null then return json_build_object('status', 'bad_slot'); end if;
  if p_cat is null or p_cat not in ('cheese', 'mackerel', 'calico', 'tuxedo', 'black', 'siamese') then return json_build_object('status', 'bad_cat'); end if;
  select * into c from pingpong_cat where player_id = pl.id and cat_id = p_cat for update;
  if coalesce(p_on, false) then
    if least(5, coalesce(c.pts, 0) / 10) < need then return json_build_object('status', 'locked', 'need', need); end if;
    update pingpong_cat set outfit = outfit || jsonb_build_object(p_slot, true) where player_id = pl.id and cat_id = p_cat;
  elsif c.player_id is not null then
    update pingpong_cat set outfit = outfit - p_slot where player_id = pl.id and cat_id = p_cat;
  end if;
  return json_build_object('status', 'ok', 'cats', pingpong__cat_json(pl.id));
end $$;
revoke all on function public.pingpong_cat_wear(text, text, text, boolean) from public;
grant execute on function public.pingpong_cat_wear(text, text, text, boolean) to anon, authenticated;
