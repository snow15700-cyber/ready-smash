-- 준비하시고, 스매시! — 1단계: PIN 계정
-- Supabase 대시보드 → SQL Editor → 이 파일 내용을 통째로 붙여 넣고 Run.
-- 여러 번 실행해도 괜찮다(이미 있는 표는 그대로 두고, 함수만 새로 고친다).
--
-- 보안 원칙
--  · 표는 RLS로 잠가서 브라우저(anon 키)가 직접 읽거나 쓰지 못한다.
--  · 브라우저는 아래 pingpong_* 함수만 부를 수 있다. PIN 확인은 서버 안에서만 한다.
--  · PIN은 bcrypt로, 로그인 열쇠(토큰)는 sha256으로 바꿔서 저장한다(원래 값은 저장하지 않음).

create extension if not exists pgcrypto with schema extensions;

-- 선수 명부
create table if not exists public.pingpong_players (
  id          uuid primary key default gen_random_uuid(),
  nick        text not null,                 -- 화면에 보이는 닉네임
  nick_key    text not null unique,          -- 중복 검사용 (앞뒤 공백 제거 + 소문자)
  pin_hash    text not null,
  fail_count  int not null default 0,        -- PIN 연속 틀린 횟수
  locked_until timestamptz,                  -- 5번 틀리면 5분 잠금
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- 로그인 열쇠 (브라우저마다 하나, 30일. 쓸 때마다 30일 연장)
create table if not exists public.pingpong_sessions (
  token_hash  text primary key,
  player_id   uuid not null references public.pingpong_players(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists pingpong_sessions_player on public.pingpong_sessions(player_id);

alter table public.pingpong_players enable row level security;
alter table public.pingpong_sessions enable row level security;
revoke all on public.pingpong_players from anon, authenticated;
revoke all on public.pingpong_sessions from anon, authenticated;

-- ───────── 내부 도우미 (브라우저에서 못 부름) ─────────
create or replace function public.pingpong__nick_key(p text) returns text
language sql immutable as $$ select lower(btrim(coalesce(p, ''))) $$;

create or replace function public.pingpong__player_json(p public.pingpong_players) returns json
language sql stable as $$ select json_build_object('nick', p.nick) $$;

create or replace function public.pingpong__new_session(p_player uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  delete from pingpong_sessions where expires_at < now();
  insert into pingpong_sessions(token_hash, player_id, expires_at)
    values (encode(digest(t, 'sha256'), 'hex'), p_player, now() + interval '30 days');
  return t;
end $$;

create or replace function public.pingpong__session_player(p_token text) returns public.pingpong_players
language plpgsql security definer set search_path = public, extensions as $$
declare s pingpong_sessions; pl pingpong_players;
begin
  select * into s from pingpong_sessions
    where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
  if not found then return null; end if;
  update pingpong_sessions set expires_at = now() + interval '30 days' where token_hash = s.token_hash;
  update pingpong_players set last_seen = now() where id = s.player_id returning * into pl;
  return pl;
end $$;

revoke all on function public.pingpong__nick_key(text) from public, anon, authenticated;
revoke all on function public.pingpong__player_json(public.pingpong_players) from public, anon, authenticated;
revoke all on function public.pingpong__new_session(uuid) from public, anon, authenticated;
revoke all on function public.pingpong__session_player(text) from public, anon, authenticated;

-- ───────── 브라우저가 부르는 함수 ─────────
-- 결과는 모두 json: { status: 'ok' | 'no_user' | 'taken' | 'wrong_pin' | 'locked' | 'bad_nick' | 'bad_pin' | 'no_session', ... }

-- 로그인. 처음 보는 닉네임이면 status 'no_user' (화면에서 "가입할까요?"를 묻는다)
create or replace function public.pingpong_login(p_nick text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players;
begin
  select * into pl from pingpong_players where nick_key = pingpong__nick_key(p_nick) for update;
  if not found then return json_build_object('status', 'no_user'); end if;
  if pl.locked_until is not null and pl.locked_until > now() then
    return json_build_object('status', 'locked', 'wait', ceil(extract(epoch from pl.locked_until - now())));
  end if;
  if pl.pin_hash <> crypt(coalesce(p_pin, ''), pl.pin_hash) then
    if pl.fail_count + 1 >= 5 then
      update pingpong_players set fail_count = 0, locked_until = now() + interval '5 minutes' where id = pl.id;
      return json_build_object('status', 'locked', 'wait', 300);
    end if;
    update pingpong_players set fail_count = fail_count + 1 where id = pl.id;
    return json_build_object('status', 'wrong_pin', 'left', 5 - (pl.fail_count + 1));
  end if;
  update pingpong_players set fail_count = 0, locked_until = null, last_seen = now() where id = pl.id
    returning * into pl;
  return json_build_object('status', 'ok', 'token', pingpong__new_session(pl.id), 'player', pingpong__player_json(pl));
end $$;

-- 가입
create or replace function public.pingpong_signup(p_nick text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare n text := btrim(coalesce(p_nick, '')); pl pingpong_players;
begin
  if char_length(n) < 1 or char_length(n) > 10 then return json_build_object('status', 'bad_nick'); end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return json_build_object('status', 'bad_pin'); end if;
  begin
    insert into pingpong_players(nick, nick_key, pin_hash)
      values (n, pingpong__nick_key(n), crypt(p_pin, gen_salt('bf', 8)))
      returning * into pl;
  exception when unique_violation then
    return json_build_object('status', 'taken');
  end;
  return json_build_object('status', 'ok', 'token', pingpong__new_session(pl.id), 'player', pingpong__player_json(pl));
end $$;

-- 자동 로그인: 브라우저에 기억해 둔 열쇠로 내 정보 가져오기
create or replace function public.pingpong_me(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  return json_build_object('status', 'ok', 'player', pingpong__player_json(pl));
end $$;

-- PIN 바꾸기 (로그인된 상태에서). 다른 브라우저에 남아 있던 로그인은 모두 풀린다.
create or replace function public.pingpong_change_pin(p_token text, p_new_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pl pingpong_players := pingpong__session_player(p_token);
begin
  if pl.id is null then return json_build_object('status', 'no_session'); end if;
  if coalesce(p_new_pin, '') !~ '^[0-9]{4}$' then return json_build_object('status', 'bad_pin'); end if;
  update pingpong_players set pin_hash = crypt(p_new_pin, gen_salt('bf', 8)), fail_count = 0, locked_until = null
    where id = pl.id;
  delete from pingpong_sessions
    where player_id = pl.id and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
  return json_build_object('status', 'ok');
end $$;

-- 로그아웃: 이 브라우저의 열쇠만 버린다
create or replace function public.pingpong_logout(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from pingpong_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return json_build_object('status', 'ok');
end $$;

revoke all on function public.pingpong_login(text, text) from public;
revoke all on function public.pingpong_signup(text, text) from public;
revoke all on function public.pingpong_me(text) from public;
revoke all on function public.pingpong_change_pin(text, text) from public;
revoke all on function public.pingpong_logout(text) from public;
grant execute on function public.pingpong_login(text, text) to anon, authenticated;
grant execute on function public.pingpong_signup(text, text) to anon, authenticated;
grant execute on function public.pingpong_me(text) to anon, authenticated;
grant execute on function public.pingpong_change_pin(text, text) to anon, authenticated;
grant execute on function public.pingpong_logout(text) to anon, authenticated;

-- ───────── 운영자용: PIN을 잊은 사람 초기화 (SQL Editor에서 직접 실행) ─────────
-- update public.pingpong_players
--   set pin_hash = extensions.crypt('0000', extensions.gen_salt('bf', 8)), fail_count = 0, locked_until = null
--   where nick_key = lower('닉네임');
-- → 그 사람에게 "PIN이 0000으로 바뀌었으니 로그인 후 바꿔 주세요"라고 알려 준다.
