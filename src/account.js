// PIN 계정: 진짜 정보는 서버(Supabase DB, supabase/01_accounts.sql)에 있고,
// 브라우저에는 '로그인 열쇠(토큰)'만 기억한다. 열쇠가 지워져도 닉네임+PIN으로 다시 로그인하면 된다.
// 서버 설정이 없으면(로컬 테스트) 브라우저 안의 가짜 서버로 똑같이 동작한다.
import { ONLINE, getClient } from './net.js';

const TOKEN_KEY = 'smash-token';
const NICK_KEY = 'smash-nick'; // 마지막에 쓴 닉네임 (입력칸 미리 채우기용)

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// 현재 사용자. { nick, guest } — guest면 기록이 저장되지 않는다.
export const account = { nick: store.get(NICK_KEY) || '', guest: true, loggedIn: false };

export const lastNick = () => store.get(NICK_KEY) || '';
export const cleanNick = (s) => String(s || '').trim().slice(0, 10);
export const validPin = (s) => /^[0-9]{4}$/.test(s);

async function call(fn, args) {
  try {
    if (!ONLINE) return localServer(fn, args);
    const { data, error } = await getClient().rpc(fn, args);
    if (error) throw error;
    return data || { status: 'error' };
  } catch (e) {
    console.warn('[account]', fn, e);
    return { status: 'error' };
  }
}

function setUser(player, token) {
  account.nick = player.nick;
  account.guest = false;
  account.loggedIn = true;
  if (token) store.set(TOKEN_KEY, token);
  store.set(NICK_KEY, player.nick);
}

// 자동 로그인. 'ok' | 'none'(열쇠 없음·만료) | 'error'(서버 연결 실패 — 열쇠는 그대로 둔다)
export async function autoLogin() {
  const token = store.get(TOKEN_KEY);
  if (!token) return 'none';
  const r = await call('pingpong_me', { p_token: token });
  if (r.status === 'ok') { setUser(r.player); return 'ok'; }
  if (r.status === 'no_session') { store.set(TOKEN_KEY, null); return 'none'; }
  return 'error';
}

// 로그인. 결과 status: ok | no_user | wrong_pin(left) | locked(wait) | error
export async function login(nick, pin) {
  const r = await call('pingpong_login', { p_nick: cleanNick(nick), p_pin: pin });
  if (r.status === 'ok') setUser(r.player, r.token);
  return r;
}

// 가입. 결과 status: ok | taken | bad_nick | bad_pin | error
export async function signup(nick, pin) {
  const r = await call('pingpong_signup', { p_nick: cleanNick(nick), p_pin: pin });
  if (r.status === 'ok') setUser(r.player, r.token);
  return r;
}

export function playAsGuest(nick) {
  account.nick = cleanNick(nick) || '플레이어';
  account.guest = true;
  account.loggedIn = false;
  store.set(NICK_KEY, account.nick);
}

export async function logout() {
  const token = store.get(TOKEN_KEY);
  store.set(TOKEN_KEY, null);
  account.guest = true;
  account.loggedIn = false;
  if (token) await call('pingpong_logout', { p_token: token });
}

// PIN 바꾸기. 결과 status: ok | bad_pin | no_session | error
export async function changePin(newPin) {
  const r = await call('pingpong_change_pin', { p_token: store.get(TOKEN_KEY) || '', p_new_pin: newPin });
  if (r.status === 'no_session') { store.set(TOKEN_KEY, null); account.guest = true; account.loggedIn = false; }
  return r;
}

/* ───────── 로컬 테스트용 가짜 서버 (서버 함수와 같은 규칙) ───────── */
const LOCAL_DB = 'smash-local-db';
function localServer(fn, a) {
  let db;
  try { db = JSON.parse(store.get(LOCAL_DB)) || {}; } catch { db = {}; }
  db.players ||= {};
  db.sessions ||= {};
  const save = () => store.set(LOCAL_DB, JSON.stringify(db));
  const key = (n) => String(n || '').trim().toLowerCase();
  const newToken = (k) => { const t = Math.random().toString(36).slice(2) + Date.now().toString(36); db.sessions[t] = k; return t; };
  const now = Date.now();
  const me = () => db.players[db.sessions[a.p_token]];
  let out;
  if (fn === 'pingpong_login') {
    const p = db.players[key(a.p_nick)];
    if (!p) out = { status: 'no_user' };
    else if (p.lockedUntil > now) out = { status: 'locked', wait: Math.ceil((p.lockedUntil - now) / 1000) };
    else if (p.pin !== a.p_pin) {
      p.fail = (p.fail || 0) + 1;
      if (p.fail >= 5) { p.fail = 0; p.lockedUntil = now + 300000; out = { status: 'locked', wait: 300 }; }
      else out = { status: 'wrong_pin', left: 5 - p.fail };
    } else { p.fail = 0; p.lockedUntil = 0; out = { status: 'ok', token: newToken(key(a.p_nick)), player: { nick: p.nick } }; }
  } else if (fn === 'pingpong_signup') {
    const n = String(a.p_nick || '').trim();
    if (n.length < 1 || n.length > 10) out = { status: 'bad_nick' };
    else if (!validPin(a.p_pin || '')) out = { status: 'bad_pin' };
    else if (db.players[key(n)]) out = { status: 'taken' };
    else { db.players[key(n)] = { nick: n, pin: a.p_pin }; out = { status: 'ok', token: newToken(key(n)), player: { nick: n } }; }
  } else if (fn === 'pingpong_me') {
    out = me() ? { status: 'ok', player: { nick: me().nick } } : { status: 'no_session' };
  } else if (fn === 'pingpong_change_pin') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else if (!validPin(a.p_new_pin || '')) out = { status: 'bad_pin' };
    else {
      p.pin = a.p_new_pin;
      const mine = db.sessions[a.p_token];
      for (const t of Object.keys(db.sessions)) if (db.sessions[t] === mine && t !== a.p_token) delete db.sessions[t];
      out = { status: 'ok' };
    }
  } else if (fn === 'pingpong_logout') {
    delete db.sessions[a.p_token];
    out = { status: 'ok' };
  }
  save();
  return out || { status: 'error' };
}
