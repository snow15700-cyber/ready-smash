// PIN 계정: 진짜 정보는 서버(Supabase DB, supabase/01_accounts.sql)에 있고,
// 브라우저에는 '로그인 열쇠(토큰)'만 기억한다. 열쇠가 지워져도 닉네임+PIN으로 다시 로그인하면 된다.
// 서버 설정이 없으면(로컬 테스트) 브라우저 안의 가짜 서버로 똑같이 동작한다.
import { ONLINE, getClient } from './net.js';
import { ITEMS, ITEM, GRADES, GACHA_PRICE, PITY } from './items.js';
import { ACH, REWARD, GAG_PADDLES } from './achievements.js';

// ?acct=2 처럼 주소에 붙이면 열쇠를 따로 보관한다 (한 브라우저에서 탭마다 다른 계정으로 테스트할 때)
const ACCT = new URLSearchParams(location.search).get('acct');
const TOKEN_KEY = 'smash-token' + (ACCT ? `-${ACCT}` : '');
const NICK_KEY = 'smash-nick'; // 마지막에 쓴 닉네임 (입력칸 미리 채우기용)

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// 현재 사용자. guest면 기록이 저장되지 않는다.
// player(로그인했을 때만) = { id(선수 번호), nick, wins_1v1, losses_1v1, wins_2v2, losses_2v2, best_rally, coins, win_streak }
export const account = { nick: store.get(NICK_KEY) || '', guest: true, loggedIn: false, player: null };

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

const EMPTY_STATS = { wins_1v1: 0, losses_1v1: 0, wins_2v2: 0, losses_2v2: 0, best_rally: 0, coins: 0, win_streak: 0, pieces: 0, equip: {}, title: null };
function setUser(player, token) {
  account.player = { ...EMPTY_STATS, ...player };
  account.shop = null;
  account.ach = null;
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
  account.player = null;
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
  account.player = null;
  account.shop = null;
  account.ach = null;
  if (token) await call('pingpong_logout', { p_token: token });
}

// PIN 바꾸기. 결과 status: ok | bad_pin | no_session | error
export async function changePin(newPin) {
  const r = await call('pingpong_change_pin', { p_token: store.get(TOKEN_KEY) || '', p_new_pin: newPin });
  if (r.status === 'no_session') { store.set(TOKEN_KEY, null); account.guest = true; account.loggedIn = false; }
  return r;
}

/* ───────── 전적 ───────── */
const token = () => store.get(TOKEN_KEY) || '';

// 경기 결과 기록 (내 결과만). oppId = 1v1 상대의 선수 번호(손님이면 null). 결과 { status, player, h2h }
export async function recordMatch(mode, won, oppId) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_record_match', { p_token: token(), p_mode: mode, p_won: won, p_opp: oppId || null });
  if (r.status === 'ok') account.player = { ...EMPTY_STATS, ...r.player };
  return r;
}

// 경기 결과 기록 + 코인 정산 (supabase/04_coins.sql). bonus = { perfect3, rally10 } 이번 경기에서 한 횟수
// 결과 { status, player, h2h, coins: { total, items: [{ label, coins }] } }
export async function finishMatch(mode, won, oppId, bonus) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_finish_match', {
    p_token: token(), p_mode: mode, p_won: won, p_opp: oppId || null,
    p_perfect3: bonus.perfect3 | 0, p_rally10: bonus.rally10 | 0,
  });
  if (r.status === 'ok') account.player = { ...EMPTY_STATS, ...r.player };
  return r;
}

// 하루 첫 접속 코인. 결과 받은 코인 수 (오늘 이미 받았거나 실패하면 0)
export async function claimDaily() {
  if (!account.loggedIn) return 0;
  const r = await call('pingpong_daily', { p_token: token() });
  if (r.status !== 'ok') return 0;
  account.player = { ...EMPTY_STATS, ...r.player };
  return r.coins || 0;
}

// 혼자 하기 코인 (supabase/05_ai_coins.sql): 시작할 때 aiStart, 랠리가 끝날 때마다 aiRally(내가 친 횟수)
// 4번 칠 때마다 1코인. 결과 이번에 받은 코인 수
export const AI_HITS_PER_COIN = 4;
export async function aiStart() {
  if (account.loggedIn) await call('pingpong_ai_start', { p_token: token() });
}
export async function aiRally(hits) {
  if (!account.loggedIn || hits < 1) return 0;
  const r = await call('pingpong_ai_rally', { p_token: token(), p_hits: hits });
  if (r.status !== 'ok') return 0;
  account.player = { ...EMPTY_STATS, ...r.player };
  return r.coins || 0;
}

/* ───────── 상점·옷장 (supabase/06_shop.sql) ───────── */
// account.shop = { owned: Set(아이템 id), pity: { char, arena } }  (상점을 열 때 불러온다)
account.shop = null;
function takeShop(r) {
  if (r.status !== 'ok') return r;
  account.player = { ...EMPTY_STATS, ...r.player };
  account.shop = { owned: new Set(r.owned || []), pity: r.pity || { char: 0, arena: 0 } };
  return r;
}
// 상점 정보 불러오기
export async function loadShop() {
  if (!account.loggedIn) return { status: 'guest' };
  return takeShop(await call('pingpong_shop', { p_token: token() }));
}
// 뽑기. 결과 { status: ok | no_coins | empty | error, results: [{ item, grade, dup, pieces }] }
export async function gacha(pool, count) {
  if (!account.loggedIn) return { status: 'guest' };
  return takeShop(await call('pingpong_gacha', { p_token: token(), p_pool: pool, p_count: count }));
}
// 직접 구매(pay 'coins') 또는 조각 교환(pay 'pieces'). status ok | owned | no_coins | no_pieces
export async function buyItem(item, pay) {
  if (!account.loggedIn) return { status: 'guest' };
  return takeShop(await call('pingpong_buy', { p_token: token(), p_item: item, p_pay: pay }));
}
// 장착 (item null = 기본으로)
export async function equipItem(cat, item) {
  if (!account.loggedIn) return { status: 'guest' };
  return takeShop(await call('pingpong_equip', { p_token: token(), p_cat: cat, p_item: item }));
}
// 테스트용 코인 (서버 없이 이 브라우저 안 가짜 서버로 돌 때만. 진짜 서버에는 이런 함수가 없다)
export async function testCoins(n) {
  if (ONLINE || !account.loggedIn) return { status: 'bad' };
  return takeShop(await call('local_test_coins', { p_token: token(), p_n: n }));
}
export const myEquip = () => (account.loggedIn && account.player?.equip) || {};

// 혼자 하기 최장 랠리 기록
export async function recordRally(rally) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_record_rally', { p_token: token(), p_rally: rally });
  if (r.status === 'ok') account.player = { ...EMPTY_STATS, ...r.player };
  return r;
}

// 1v1 상대 전적 (나 vs oppId). 결과 { wins, losses } 또는 null
export async function getH2H(oppId) {
  if (!account.loggedIn || !oppId) return null;
  const r = await call('pingpong_h2h', { p_token: token(), p_opp: oppId });
  return r.status === 'ok' ? r.h2h : null;
}

/* ───────── 업적·칭호 (supabase/10_achievements.sql) ───────── */
// account.ach = { got: Map(id → 깬 시각), loaded }
function takeAch(r) {
  if (r.status === 'ok') {
    account.player = { ...EMPTY_STATS, ...r.player };
    account.ach = { got: new Map((r.got || []).map((g) => [g.id, g.at])) };
  }
  return r;
}
// 업적 목록 불러오기 + 새로 깬 업적 지급. 결과 { status, new: [{ id, coins }] }
export async function checkAch() {
  if (!account.loggedIn) return { status: 'guest', new: [] };
  return takeAch(await call('pingpong_achievements', { p_token: token() }));
}
// 칭호 달기 (id null = 떼기)
export async function setTitle(id) {
  if (!account.loggedIn) return { status: 'guest' };
  return takeAch(await call('pingpong_set_title', { p_token: token(), p_ach: id }));
}
export const myTitle = () => (account.loggedIn && account.player?.title) || null;

/* ───────── 랭킹 (손님도 볼 수 있음) ───────── */
// kind 'wins'(승수 합계) | 'rally'(혼자 하기 최장 랠리). 결과 [{ nick, value, rank, w1?, w2? }] 또는 null(실패)
export async function getRanking(kind) {
  const r = await call('pingpong_ranking', { p_kind: kind });
  return Array.isArray(r) ? r : null;
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
  db.h2h ||= {};
  const me = () => db.players[db.sessions[a.p_token]];
  const pj = (p) => ({ id: p.id, nick: p.nick, wins_1v1: p.w1 || 0, losses_1v1: p.l1 || 0, wins_2v2: p.w2 || 0, losses_2v2: p.l2 || 0, best_rally: p.best || 0, coins: p.coins || 0, win_streak: p.streak || 0, pieces: p.pieces || 0, equip: p.equip || {}, title: p.title || null });
  const shopOut = (p, extra = {}) => ({ status: 'ok', player: pj(p), owned: p.owned || [], pity: { char: p.pityChar || 0, arena: p.pityArena || 0 }, ...extra });
  const onSale = (pool, grade) => ITEMS.filter((i) => i.pool === pool && i.grade !== 'default' && (!grade || i.grade === grade));
  const h2h = (p, opp) => { const h = db.h2h[p.id + '>' + opp] || [0, 0]; return { wins: h[0], losses: h[1] }; };
  let out;
  if (fn === 'pingpong_login') {
    const p = db.players[key(a.p_nick)];
    if (!p) out = { status: 'no_user' };
    else if (p.lockedUntil > now) out = { status: 'locked', wait: Math.ceil((p.lockedUntil - now) / 1000) };
    else if (p.pin !== a.p_pin) {
      p.fail = (p.fail || 0) + 1;
      if (p.fail >= 5) { p.fail = 0; p.lockedUntil = now + 300000; out = { status: 'locked', wait: 300 }; }
      else out = { status: 'wrong_pin', left: 5 - p.fail };
    } else { p.fail = 0; p.lockedUntil = 0; out = { status: 'ok', token: newToken(key(a.p_nick)), player: pj(p) }; }
  } else if (fn === 'pingpong_signup') {
    const n = String(a.p_nick || '').trim();
    if (n.length < 1 || n.length > 10) out = { status: 'bad_nick' };
    else if (!validPin(a.p_pin || '')) out = { status: 'bad_pin' };
    else if (db.players[key(n)]) out = { status: 'taken' };
    else { const p = db.players[key(n)] = { id: 'local-' + key(n), nick: n, pin: a.p_pin }; out = { status: 'ok', token: newToken(key(n)), player: pj(p) }; }
  } else if (fn === 'pingpong_me') {
    out = me() ? { status: 'ok', player: pj(me()) } : { status: 'no_session' };
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
  } else if (fn === 'pingpong_record_match') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else if (!['1v1', '2v2'].includes(a.p_mode)) out = { status: 'bad' };
    else if (p.lastMatch > now - 10000) out = { status: 'too_soon' };
    else {
      p.lastMatch = now;
      const f = (a.p_mode === '1v1' ? '1' : '2');
      if (a.p_won) p['w' + f] = (p['w' + f] || 0) + 1; else p['l' + f] = (p['l' + f] || 0) + 1;
      const opp = a.p_opp;
      if (a.p_mode === '1v1' && opp && opp !== p.id && Object.values(db.players).some((x) => x.id === opp)) {
        const h = db.h2h[p.id + '>' + opp] ||= [0, 0];
        h[a.p_won ? 0 : 1]++;
      }
      out = { status: 'ok', player: pj(p), h2h: opp ? h2h(p, opp) : null };
    }
  } else if (fn === 'pingpong_finish_match') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else if (!['1v1', '2v2'].includes(a.p_mode)) out = { status: 'bad' };
    else if (p.lastMatch > now - 10000) out = { status: 'too_soon' };
    else {
      p.lastMatch = now;
      const f = (a.p_mode === '1v1' ? '1' : '2');
      if (a.p_won) p['w' + f] = (p['w' + f] || 0) + 1; else p['l' + f] = (p['l' + f] || 0) + 1;
      p.streak = a.p_won ? (p.streak || 0) + 1 : 0;
      const clamp = (n) => Math.min(3, Math.max(0, n | 0));
      const nPerf = clamp(a.p_perfect3), nRally = clamp(a.p_rally10);
      const items = [{ label: '경기 참여', coins: 10 }];
      if (a.p_won) items.push({ label: '승리', coins: 10 });
      if (nPerf) items.push({ label: `퍼펙트 3연속 ×${nPerf}`, coins: 5 * nPerf });
      if (nRally) items.push({ label: `랠리 10회 이상 ×${nRally}`, coins: 5 * nRally });
      if (a.p_won && p.streak % 3 === 0) items.push({ label: `${p.streak}연승`, coins: 15 });
      const total = items.reduce((s, i) => s + i.coins, 0);
      p.coins = (p.coins || 0) + total;
      const opp = a.p_opp;
      if (a.p_mode === '1v1' && opp && opp !== p.id && Object.values(db.players).some((x) => x.id === opp)) {
        const h = db.h2h[p.id + '>' + opp] ||= [0, 0];
        h[a.p_won ? 0 : 1]++;
      }
      out = { status: 'ok', player: pj(p), h2h: opp ? h2h(p, opp) : null, coins: { total, items } };
    }
  } else if (fn === 'pingpong_daily') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else {
      const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10); // 한국 시간 날짜
      let got = 0;
      if (p.daily !== today) { p.daily = today; p.coins = (p.coins || 0) + 20; got = 20; }
      out = { status: 'ok', coins: got, player: pj(p) };
    }
  } else if (fn === 'pingpong_ai_start') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else { p.aiAt = now; out = { status: 'ok' }; }
  } else if (fn === 'pingpong_ai_rally') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else {
      const allowed = p.aiAt ? Math.floor((now - p.aiAt) / 1000) + 1 : 0;
      const total = (p.aiRem || 0) + Math.min(Math.max(a.p_hits | 0, 0), allowed, 1000);
      const got = Math.floor(total / AI_HITS_PER_COIN);
      p.aiRem = total % AI_HITS_PER_COIN;
      p.aiAt = now;
      p.coins = (p.coins || 0) + got;
      out = { status: 'ok', coins: got, player: pj(p) };
    }
  } else if (fn === 'local_test_coins') {
    const p = me();
    if (p) p.coins = (p.coins || 0) + (a.p_n | 0);
    out = p ? shopOut(p) : { status: 'no_session' };
  } else if (fn === 'pingpong_shop') {
    const p = me();
    out = p ? shopOut(p) : { status: 'no_session' };
  } else if (fn === 'pingpong_gacha') {
    const p = me();
    const cost = GACHA_PRICE[a.p_count];
    if (!p) out = { status: 'no_session' };
    else if (!cost || !['char', 'arena'].includes(a.p_pool)) out = { status: 'bad' };
    else if (!onSale(a.p_pool).length) out = { status: 'empty' };
    else if ((p.coins || 0) < cost) out = { status: 'no_coins' };
    else {
      p.owned ||= [];
      const key = a.p_pool === 'char' ? 'pityChar' : 'pityArena';
      let pity = p[key] || 0;
      const results = [];
      for (let i = 0; i < a.p_count; i++) {
        const r = Math.random();
        let g = pity >= PITY ? 'legend' : r < GRADES.legend.rate ? 'legend' : r < GRADES.legend.rate + GRADES.rare.rate ? 'rare' : 'common';
        if (!onSale(a.p_pool, g).length) g = ['common', 'rare', 'legend'].find((x) => onSale(a.p_pool, x).length);
        const list = onSale(a.p_pool, g);
        const it = list[Math.floor(Math.random() * list.length)].id;
        pity = g === 'legend' ? 0 : pity + 1;
        const dup = p.owned.includes(it);
        if (!dup) p.owned.push(it);
        const got = dup ? GRADES[g].dup : 0;
        p.pieces = (p.pieces || 0) + got;
        results.push({ item: it, grade: g, dup, pieces: got });
      }
      p[key] = pity;
      p.coins -= cost;
      out = shopOut(p, { results });
    }
  } else if (fn === 'pingpong_buy') {
    const p = me();
    const it = ITEM[a.p_item];
    if (!p) out = { status: 'no_session' };
    else if (!it || it.grade === 'default' || !['coins', 'pieces'].includes(a.p_pay)) out = { status: 'bad' };
    else if ((p.owned ||= []).includes(it.id)) out = { status: 'owned' };
    else {
      const field = a.p_pay, cost = a.p_pay === 'coins' ? GRADES[it.grade].buy : GRADES[it.grade].pieces;
      if ((p[field] || 0) < cost) out = { status: a.p_pay === 'coins' ? 'no_coins' : 'no_pieces' };
      else { p[field] -= cost; p.owned.push(it.id); out = shopOut(p); }
    }
  } else if (fn === 'pingpong_equip') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else if (a.p_item == null) { p.equip = { ...p.equip }; delete p.equip[a.p_cat]; out = shopOut(p); }
    else if (!(p.owned || []).includes(a.p_item) || ITEM[a.p_item]?.cat !== a.p_cat) out = { status: 'not_owned' };
    else { p.equip = { ...p.equip, [a.p_cat]: a.p_item }; out = shopOut(p); }
  } else if (fn === 'pingpong_record_rally') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else { p.best = Math.max(p.best || 0, a.p_rally | 0); out = { status: 'ok', player: pj(p) }; }
  } else if (fn === 'pingpong_h2h') {
    out = me() ? { status: 'ok', h2h: h2h(me(), a.p_opp) } : { status: 'no_session' };
  } else if (fn === 'pingpong_ranking') {
    const rows = Object.values(db.players).map((p) => pj(p))
      .map((p) => (a.p_kind === 'wins'
        ? { nick: p.nick, title: p.title, value: p.wins_1v1 + p.wins_2v2, w1: p.wins_1v1, w2: p.wins_2v2 }
        : { nick: p.nick, title: p.title, value: p.best_rally }))
      .filter((x) => x.value > 0)
      .sort((x, y) => y.value - x.value || (x.nick < y.nick ? -1 : 1))
      .slice(0, 50);
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].value === x.value ? rows[i - 1].rank : i + 1; });
    return rows;
  } else if (fn === 'pingpong_achievements' || fn === 'pingpong_set_title') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else {
      p.ach ||= {};
      const fresh = [];
      if (fn === 'pingpong_achievements') {
        const w = (p.w1 || 0) + (p.w2 || 0), l = (p.l1 || 0) + (p.l2 || 0);
        const hs = Object.entries(db.h2h).filter(([k]) => k.startsWith(p.id + '>')).map(([, h]) => h);
        const owned = p.owned || [];
        const ok = {
          win1: w >= 1, win30: w >= 30, win100: w >= 100, games50: w + l >= 50, wl10: w >= 10 && l >= 10,
          streak5: (p.streak || 0) >= 5, streak10: (p.streak || 0) >= 10,
          meet5: hs.length >= 5, beat10: hs.filter((h) => h[0] > 0).length >= 10, rival10: hs.some((h) => h[0] + h[1] >= 10),
          ai20: (p.best || 0) >= 20, ai50: (p.best || 0) >= 50, ai100: (p.best || 0) >= 100,
          own10: owned.length >= 10, legend1: owned.some((id) => ITEM[id]?.grade === 'legend'),
          gag15: GAG_PADDLES.every((id) => owned.includes(id)),
        };
        for (const [id, yes] of Object.entries(ok)) {
          if (!yes || p.ach[id] || !ACH[id]) continue;
          p.ach[id] = new Date(now).toISOString();
          p.coins = (p.coins || 0) + REWARD[ACH[id].grade];
          fresh.push({ id, coins: REWARD[ACH[id].grade] });
        }
        out = { status: 'ok' };
      } else if (a.p_ach != null && !p.ach[a.p_ach]) out = { status: 'not_owned' };
      else { p.title = a.p_ach; out = { status: 'ok' }; }
      if (out.status === 'ok') out = { status: 'ok', player: pj(p), got: Object.entries(p.ach).map(([id, at]) => ({ id, at })), new: fresh };
    }
  } else if (fn === 'pingpong_logout') {
    delete db.sessions[a.p_token];
    out = { status: 'ok' };
  }
  save();
  return out || { status: 'error' };
}
