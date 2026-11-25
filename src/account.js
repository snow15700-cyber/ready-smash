// PIN 계정: 진짜 정보는 서버(Supabase DB, supabase/01_accounts.sql)에 있고,
// 브라우저에는 '로그인 열쇠(토큰)'만 기억한다. 열쇠가 지워져도 닉네임+PIN으로 다시 로그인하면 된다.
// 서버 설정이 없으면(로컬 테스트) 브라우저 안의 가짜 서버로 똑같이 동작한다.
import { ONLINE, getClient } from './net.js';
import { ITEMS, ITEM, GRADES, GACHA_PRICE, PITY, poolOpen } from './items.js';
import { ACH, REWARD, GAG_PADDLES } from './achievements.js';
import { breakAt, nowMs } from './breaks.js';
import { koreaDay, missionsOf, MISSION_ALL, MISSION_COIN } from './missions.js';
import { setOf, setAmount, setLabel } from './sets.js';
import * as FR from './games/fishing/rules.js';

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
  account.missions = null;
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

// 경기 번호 만들기 (방장이 'go'에 실어 보낸다)
export function newMatchId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// 경기 입장 (supabase/13_match_check.sql). 경기가 시작될 때 각자 자기 열쇠로. side = 내 팀(0|1)
export async function matchJoin(matchId, mode, side) {
  if (!account.loggedIn || !matchId) return { status: 'guest' };
  return call('pingpong_match_join', { p_token: token(), p_match: matchId, p_mode: mode, p_side: side });
}

// 김제빵 낀 2대2 표시 (supabase/27): 전적·랭킹·연승에 안 들어가고 코인은 보통 2대2와 같게
export async function matchKim(matchId) {
  if (!account.loggedIn || !matchId) return { status: 'guest' };
  return call('pingpong_match_kim', { p_token: token(), p_match: matchId });
}

// 경기 결과 기록 + 코인 정산 (내 결과만, 입장한 경기만). bonus = { perfect3, rally10 } 이번 경기에서 한 횟수
// 상대 전적·같은 상대 판 수는 서버가 경기 입장 기록으로 정한다
// 결과 { status, player, h2h, coins: { total, items: [{ label, coins }] } }
export async function matchFinish(matchId, won, bonus) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_match_finish', {
    p_token: token(), p_match: matchId, p_won: won,
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

/* ───────── 오늘의 미션 (supabase/21_missions.sql, src/missions.js) ───────── */
// account.missions = { day, list: [{ id, done }], cheer } (로비에서 불러온다. 서버에 21이 없으면 null)
account.missions = null;
function takeMissions(r) {
  if (r.status !== 'ok') return r;
  if (r.player) account.player = { ...EMPTY_STATS, ...r.player };
  if (r.missions) account.missions = r.missions;
  return r;
}
export async function loadMissions() {
  if (!account.loggedIn) { account.missions = null; return null; }
  const r = takeMissions(await call('pingpong_missions', { p_token: token() }));
  return r.status === 'ok' ? account.missions : null;
}
// 경기 미션 확인 (matchFinish 다음에, 같은 경기 한 번만). 결과 { status, new: [id], all, coins }
export async function missionMatch(matchId, bonus) {
  if (!account.loggedIn || !matchId) return { status: 'guest' };
  return takeMissions(await call('pingpong_mission_match', {
    p_token: token(), p_match: matchId, p_perfect3: bonus.perfect3 | 0, p_rally10: bonus.rally10 | 0,
  }));
}
// 관전 응원 한 번 (오늘 응원 미션이 있고 아직 안 깼을 때만 부른다)
export function cheerMissionOpen() {
  const m = account.loggedIn && account.missions;
  return !!m && m.day === koreaDay() && m.list.some((x) => x.id === 'cheer3' && !x.done);
}
export async function missionCheer() {
  if (!cheerMissionOpen()) return { status: 'skip' };
  return takeMissions(await call('pingpong_mission_cheer', { p_token: token() }));
}

// 혼자 하기 코인 (supabase/05_ai_coins.sql): 시작할 때 aiStart, 랠리가 끝날 때마다 aiRally(내가 친 횟수)
// 3번 칠 때마다 1코인(26). 결과 이번에 받은 코인 수
export const AI_HITS_PER_COIN = 3; // 26: 4 → 3
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
// account.shop = { owned: Set(아이템 id), pity: { char, arena }, free: 남은 무료 뽑기 횟수(25) }  (상점을 열 때 불러온다)
account.shop = null;
function takeShop(r) {
  if (r.status !== 'ok') return r;
  account.player = { ...EMPTY_STATS, ...r.player };
  account.shop = { owned: new Set(r.owned || []), pity: r.pity || { char: 0, arena: 0 }, free: r.free ?? 0 };
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
// 경기 업적 기록 보내기 (supabase/13의 pingpong_match_ach → 11의 규칙). s = game.achSummary(). matchFinish 다음에
export async function matchAch(matchId, s) {
  if (!account.loggedIn) return { status: 'guest', new: [] };
  return takeAch(await call('pingpong_match_ach', { p_token: token(), p_match: matchId, p_s: s }));
}
// 사람 관계 업적 (13의 pingpong_match_people → 12의 규칙). 상대·팀원은 서버가 찾는다. matchAch 다음에
export async function matchPeople(matchId) {
  if (!account.loggedIn) return { status: 'guest', new: [] };
  return takeAch(await call('pingpong_match_people', { p_token: token(), p_match: matchId }));
}
// 혼자 하기 업적 (s = { aizero: 1 })
export async function aiAch(s) {
  if (!account.loggedIn) return { status: 'guest', new: [] };
  return takeAch(await call('pingpong_ai_ach', { p_token: token(), p_s: s }));
}
export const myTitle = () => (account.loggedIn && account.player?.title) || null;

/* ───────── 랭킹 (손님도 볼 수 있음) ───────── */
// kind 'wins'(승수 합계) | 'rally'(혼자 하기 최장 랠리). 결과 [{ nick, value, rank, w1?, w2? }] 또는 null(실패)
export async function getRanking(kind) {
  const r = await call('pingpong_ranking', { p_kind: kind });
  return Array.isArray(r) ? r : null;
}

/* ───────── 낚시 (supabase/28_fishing.sql, docs/dev/fishing.md 9장) ───────── */
// 던지기: 서버가 무엇이 걸릴지 정함. 결과 cast = { id, kind, item, grade, cm, dup, near } 또는 null(손님·실패)
export async function fishCast(x, aim, power, rain, z) {
  if (!account.loggedIn) return null;
  const r = await call('pingpong_fish_cast', { p_token: token(), p_x: x, p_z: z ?? null, p_aim: aim, p_power: power, p_rain: !!rain });
  return r.status === 'ok' ? r.cast : null;
}
// 잡았다/놓쳤다. 결과 { status, caught, coins, bonus, capped, first, rec, best, big, pieces, new: [{id, coins}], player }
export async function fishFinish(castId, ok, perfect) {
  if (!account.loggedIn || !castId) return { status: 'guest' };
  const r = await call('pingpong_fish_finish', { p_token: token(), p_cast: castId, p_ok: !!ok, p_perfect: !!perfect });
  if (r.player) account.player = { ...EMPTY_STATS, ...r.player };
  if (r.status === 'ok' && r.new?.length && account.ach) for (const n of r.new) account.ach.got.set(n.id, new Date().toISOString());
  return r;
}
// 도감 (내 기록 + 어종별 기록). 손님은 dex 빈 목록
export async function fishDex() {
  const r = await call('pingpong_fish_dex', { p_token: account.loggedIn ? token() : '' });
  return r.status === 'ok' ? r : null;
}
// 월척 랭킹 'week' | 'all'. 결과 [{ rank, nick, title, title_x, value(cm), fish }] 또는 null
export async function getFishRank(kind) {
  const r = await call('pingpong_fish_rank', { p_kind: kind });
  return Array.isArray(r) ? r : null;
}

// 로컬 가짜 서버의 낚시 (28과 같은 규칙)
const FISH_ACH = ['fish10', 'fish_all', 'junk_all', 'fish_bread', 'fish_big', 'fish_legend', 'fish_perf10'];
function localFish(fn, a, p, db, now) {
  if (fn === 'pingpong_fish_cast') {
    const sx = Math.min(FR.STAND.xMax, Math.max(FR.STAND.xMin, +a.p_x || 13));
    const pt = FR.landingPoint(sx, +a.p_aim || 0, a.p_power ?? 0.5, a.p_z == null ? undefined : +a.p_z);
    const near = FR.bubbleNear(pt.x, pt.z, FR.activeBubbles(nowMs() / 1000, 'normal'));
    const owned = (p.owned || []).filter((id) => FR.LEGEND_PADDLES.some(([x]) => x === id));
    const c = FR.rollCatch(near, { owned, cond: { break: !!breakAt(nowMs()), night: FR.isNight(nowMs()), rain: !!a.p_rain } });
    p.fishCast = { id: Math.random().toString(36).slice(2), kind: c.kind, item: c.id, grade: c.grade, cm: c.kind === 'fish' ? FR.fishSize().cm : 0, dup: !!c.dup, near, at: now };
    const { at, ...cast } = p.fishCast;
    return { status: 'ok', cast };
  }
  if (fn === 'pingpong_fish_finish') {
    const c = p.fishCast;
    if (!c || c.id !== a.p_cast) return { status: 'no_cast' };
    p.fishCast = null;
    p.achN ||= {};
    if (!a.p_ok) { p.achN.fish_pr = 0; return { status: 'ok', caught: false, player: null }; }
    const stage = c.kind === 'junk' ? 'junk' : c.grade;
    if ((now - c.at) / 1000 < FR.MIN_SEC[stage]) return { status: 'too_fast' };
    let base = 0, brk = 0, brkPct = 50;
    if (c.kind === 'fish') {
      base = FR.FISH_COINS[c.grade];
      const st = setOf(p.equip);
      if (st?.set.kind === 'break') brkPct = 50 + setAmount(st.set, st.full);
      if (breakAt(nowMs())) brk = Math.ceil((base * brkPct) / 100);
    }
    const pocket = Math.min(FR.COIN_POCKET, (p.fishPocket ?? FR.COIN_POCKET) + Math.floor(((now - (p.fishPocketAt || now)) / 60000) * FR.COIN_PER_MIN));
    let total = base + brk, capped = false;
    if (total > pocket) { total = pocket; capped = true; }
    let first = false, rec = false, pieces = 0, best = 0;
    if (c.kind === 'paddle') {
      p.owned ||= [];
      if (p.owned.includes(c.item)) pieces = FR.PADDLE_DUP_PIECES; else p.owned.push(c.item);
    } else {
      p.fishDex ||= {};
      const e = p.fishDex[c.item];
      first = !e; rec = c.kind === 'fish' && (first || c.cm > e.best);
      p.fishDex[c.item] = { n: (e?.n || 0) + 1, best: Math.max(e?.best || 0, c.cm), at: rec ? now : e?.at || null };
      best = p.fishDex[c.item].best;
      if (c.kind === 'fish') (db.fishLog ||= []).push({ pid: p.id, id: c.item, cm: c.cm, at: now });
    }
    const run = a.p_perfect ? (p.achN.fish_pr || 0) + 1 : 0;
    p.achN.fish_pr = run;
    p.coins = (p.coins || 0) + total;
    p.pieces = (p.pieces || 0) + pieces;
    p.fishPocket = pocket - total; p.fishPocketAt = now;
    const dex = Object.keys(p.fishDex || {});
    const ok = {
      fish10: dex.filter((id) => FR.CATCH[id]?.kind === 'fish').length >= 10,
      fish_all: FR.SPECIES.every((s) => dex.includes(s.id)), junk_all: FR.JUNK.every((s) => dex.includes(s.id)),
      fish_bread: c.item === 'baguette', fish_big: c.kind === 'fish' && c.cm >= FR.BIG_CM, fish_legend: c.kind === 'fish' && c.grade === 'legend', fish_perf10: run >= 10,
    };
    p.ach ||= {};
    const fresh = [];
    for (const id of FISH_ACH) if (ok[id] && !p.ach[id]) { p.ach[id] = new Date(now).toISOString(); p.coins += REWARD[ACH[id].grade]; fresh.push({ id, coins: REWARD[ACH[id].grade] }); }
    const { at, ...cast } = c;
    return { status: 'ok', caught: true, cast, coins: total, bonus: Math.min(brk, total), bonus_pct: brkPct, capped, first, rec, best, big: c.kind === 'fish' && c.cm >= FR.BIG_CM, pieces, new: fresh };
  }
  if (fn === 'pingpong_fish_dex') {
    const recs = {};
    for (const q of Object.values(db.players)) for (const [id, e] of Object.entries(q.fishDex || {})) {
      if (FR.CATCH[id]?.kind !== 'fish' || !e.best) continue;
      if (!recs[id] || e.best > recs[id].cm || (e.best === recs[id].cm && (e.at || 0) < recs[id].at)) recs[id] = { id, nick: q.nick, cm: e.best, at: e.at || 0 };
    }
    return { status: 'ok', dex: Object.entries(p?.fishDex || {}).map(([id, e]) => ({ id, n: e.n, best: e.best })), records: Object.values(recs).map(({ at, ...r }) => r) };
  }
  if (fn === 'pingpong_fish_rank') {
    if (!['week', 'all'].includes(a.p_kind)) return [];
    const k = new Date(now + 9 * 3600e3), dow = (k.getUTCDay() + 6) % 7; // 월요일 0
    const since = a.p_kind === 'week' ? Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow) - 9 * 3600e3 : -Infinity;
    const best = {};
    for (const l of db.fishLog || []) if (l.at >= since && (!best[l.pid] || l.cm > best[l.pid].cm)) best[l.pid] = l;
    const byId = Object.fromEntries(Object.values(db.players).map((q) => [q.id, q]));
    const rows = Object.values(best).filter((l) => byId[l.pid]).sort((x, y) => y.cm - x.cm || x.at - y.at).slice(0, 50)
      .map((l) => { const q = byId[l.pid]; return { nick: q.nick, title: q.title || null, title_x: q.achN?.nemesis || null, value: l.cm, fish: l.id }; });
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].value === x.value ? rows[i - 1].rank : i + 1; });
    return rows;
  }
  return null;
}

/* ───────── 로컬 테스트용 가짜 서버 (서버 함수와 같은 규칙) ───────── */
// pingpong_ach_people과 같은 규칙 (천적·복수·짝꿍)
function localAchPeople(p, a, now, grant, db) {
  if (!['1v1', '2v2'].includes(a.p_mode)) return { status: 'bad' };
  if (!(p.achAt > now - 30000) || p.achN.peopleAt === p.achAt) return { status: 'too_soon' };
  p.achN.peopleAt = p.achAt;
  const ids = [];
  const h = a.p_mode === '1v1' && a.p_opp && db.h2h[p.id + '>' + a.p_opp];
  if (h) {
    h[2] = a.p_won ? 0 : (h[2] || 0) + 1; // [승, 패, 지금 연패]
    if (!a.p_won && h[2] >= 5) {
      ids.push('nemesis');
      if (!p.achN.nemesis && !p.ach.nemesis) p.achN.nemesis = Object.values(db.players).find((x) => x.id === a.p_opp)?.nick;
    }
    if (a.p_won && h[1] >= 3) ids.push('revenge');
  }
  if (a.p_mode === '2v2' && a.p_won && a.p_mate && a.p_mate !== p.id && Object.values(db.players).some((x) => x.id === a.p_mate)) {
    p.achN.duo ||= {};
    p.achN.duo[a.p_mate] = (p.achN.duo[a.p_mate] || 0) + 1;
  }
  grant(ids);
  return { status: 'ok' };
}
// pingpong_ach_match와 같은 규칙 (한 경기 업적은 grant, 누적 숫자는 p.achN)
function localAchMatch(p, a, now, grant) {
  const s = a.p_s || {};
  const n = (k, hi) => Math.min(Math.max(Number.isFinite(s[k]) ? Math.floor(s[k]) : 0, 0), hi);
  const N = p.achN;
  if (a.p_mode === 'ai') {
    if (n('aizero', 1) && !(p.achAt > now - 1000)) { N.aizero = (N.aizero || 0) + 1; p.achAt = now; }
    return { status: 'ok' };
  }
  if (!['1v1', '2v2'].includes(a.p_mode)) return { status: 'bad' };
  if (p.achAt > now - 10000) return { status: 'too_soon' };
  p.achAt = now;
  const won = !!a.p_won, two = a.p_mode === '2v2';
  const hits = n('hits', 300), perfects = Math.min(n('perfects', 300), hits), me = n('scoreMe', 50), opp = n('scoreOpp', 50);
  const paddle = p.equip?.paddle;
  const ok = {
    perf3: n('perfMax', 300) >= 3, perf10: n('perfMax', 300) >= 10, perf70: hits > 10 && perfects >= hits * 0.7,
    block3: n('blockPts', 50) >= 3, zigzag: n('zig', 1) === 1, oneway: n('dirMax', 300) >= 15,
    noblock: won && hits > 0 && n('blocks', 300) === 0, smash1: n('smashes', 300) >= 1, smashback: n('smashBack', 300) >= 1,
    santa: n('given', 300) >= 5, rally15: n('rallyMax', 1000) >= 15, rally30: n('rallyMax', 1000) >= 30,
    servesafe: won && n('serves', 50) >= 1 && n('serveFaults', 50) === 0, tosser: n('tossMax', 100) >= 3, windserve: n('serveFaults', 50) >= 3,
    comeback: won && n('maxDeficit', 50) >= 3, shutout: won && me >= 5 && opp === 0, blown: !won && n('led40', 1) === 1,
    zero: !won && me === 0 && opp >= 5, whiff3: n('whiffLost', 50) >= 3,
    carry: two && n('teamPts', 50) >= 4 && n('myPts', 50) >= n('teamPts', 50) * 0.8, bus: two && won && n('myPts', 50) === 0,
    early9: won && new Date(now + 9 * 3600e3).getUTCHours() < 9,
  };
  const add = (k, v) => { N[k] = (N[k] || 0) + v; };
  add('perfects', perfects); add('centers', Math.min(n('centers', 300), hits)); add('smash_pts', n('smashPts', 50));
  add('quick', n('quickPts', 50)); add('aces', n('aces', 50)); add('deuce_wins', won && n('deuce', 1) ? 1 : 0);
  add('duck_wins', won && paddle === 'paddle_duck' ? 1 : 0);
  add('bread_perf', ['paddle_toast', 'paddle_baguette', 'paddle_donut', 'paddle_waffle', 'paddle_pizza'].includes(paddle) ? perfects : 0);
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  N.day_n = (N.day === today ? N.day_n || 0 : 0) + 1; N.day = today;
  let run = N.chance_run || 0;
  for (const c of (Array.isArray(s.chances) ? s.chances : []).slice(0, 50)) {
    if (c === 1) { run++; if (run >= 10) ok.chance10 = true; } else run = 0;
  }
  N.chance_run = run;
  const dn = n('dtN', 300);
  add('dt_n', dn); add('dt_sum', Math.round(Math.max(Math.min(Number(s.dtSum) || 0, dn * 150), -dn * 150)));
  grant(Object.keys(ok).filter((id) => ok[id]));
  return { status: 'ok' };
}

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
  const pj = (p) => ({ id: p.id, nick: p.nick, wins_1v1: p.w1 || 0, losses_1v1: p.l1 || 0, wins_2v2: p.w2 || 0, losses_2v2: p.l2 || 0, best_rally: p.best || 0, coins: p.coins || 0, win_streak: p.streak || 0, pieces: p.pieces || 0, equip: p.equip || {}, title: p.title || null, nemesis: p.achN?.nemesis || null });
  const shopOut = (p, extra = {}) => ({ status: 'ok', player: pj(p), owned: p.owned || [], pity: { char: p.pityChar || 0, arena: p.pityArena || 0 }, free: p.free ?? 50, ...extra }); // free: 무료 뽑기 50회(25)
  const onSale = (pool, grade) => ITEMS.filter((i) => i.pool === pool && i.grade !== 'default' && (!grade || i.grade === grade));
  const h2h = (p, opp) => { const h = db.h2h[p.id + '>' + opp] || [0, 0]; return { wins: h[0], losses: h[1] }; };
  // 13의 경기 업적 함수 → 11·12의 규칙 (입장해서 결과를 낸 경기에 한 번씩만)
  if (fn === 'pingpong_ai_ach') { fn = 'pingpong_ach_match'; a = { p_token: a.p_token, p_mode: 'ai', p_won: false, p_s: a.p_s }; }
  if (fn === 'pingpong_match_ach' || fn === 'pingpong_match_people') {
    const p = me();
    const m = db.matches?.[a.p_match];
    const mp = m && p && m.players[p.id];
    if (!p) return { status: 'no_session' };
    if (!mp || !mp.at || (fn === 'pingpong_match_people' && !mp.ach)) return { status: 'no_match' };
    const flag = fn === 'pingpong_match_ach' ? 'ach' : 'people';
    if (mp[flag]) return { status: 'too_soon' };
    mp[flag] = true;
    save();
    // 18: 상대 쪽에 로그인한 사람이 없으면(손님) 이긴 경기도 승리 업적에 안 넣는다
    const hasOpp = Object.entries(m.players).some(([id, x]) => id !== p.id && x.side !== mp.side);
    const won = mp.won && hasOpp;
    if (fn === 'pingpong_match_ach') {
      const s = { ...(a.p_s || {}) };
      if (mp.won && !hasOpp) delete s.led40;
      fn = 'pingpong_ach_match'; a = { p_token: a.p_token, p_mode: m.mode, p_won: won, p_s: s };
    }
    else {
      const other = (same) => Object.entries(m.players).find(([id, x]) => id !== p.id && (x.side === mp.side) === same)?.[0] || null;
      fn = 'pingpong_ach_people';
      a = { p_token: a.p_token, p_mode: m.mode, p_won: won, p_opp: m.mode === '1v1' ? other(false) : null, p_mate: m.mode === '2v2' ? other(true) : null };
    }
  }
  if (fn.startsWith('pingpong_fish_')) {
    const p = me();
    if (!p && fn !== 'pingpong_fish_rank' && fn !== 'pingpong_fish_dex') return { status: 'no_session' };
    const r = localFish(fn, a, p, db, now);
    if (r && !Array.isArray(r) && p && fn === 'pingpong_fish_finish' && r.status === 'ok') r.player = pj(p);
    save();
    return r;
  }
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
  } else if (fn === 'pingpong_match_join') {
    const p = me();
    db.matches ||= {};
    if (!p) out = { status: 'no_session' };
    else if (!a.p_match || !['1v1', '2v2'].includes(a.p_mode) || ![0, 1].includes(a.p_side)) out = { status: 'bad' };
    else {
      const m = db.matches[a.p_match] ||= { mode: a.p_mode, at: now, players: {} };
      if (m.mode !== a.p_mode) out = { status: 'mode' };
      else if (m.players[p.id]) out = { status: 'ok' };
      else if (m.at < now - 30000) out = { status: 'late' };
      else if (Object.values(m.players).filter((x) => x.side === a.p_side).length >= (m.mode === '1v1' ? 1 : 2)) out = { status: 'full' };
      else { db.joinSeq = (db.joinSeq || 0) + 1; m.players[p.id] = { side: a.p_side, joined: db.joinSeq }; out = { status: 'ok' }; } // joined = 입장 순서
    }
  } else if (fn === 'pingpong_match_kim') {
    const p = me();
    const m = db.matches?.[a.p_match];
    if (!p) out = { status: 'no_session' };
    else if (!m || !m.players[p.id]) out = { status: 'no_match' };
    else if (m.mode !== '2v2') out = { status: 'mode' };
    else if (m.at < now - 30000) out = { status: 'late' };
    else { m.kim = true; out = { status: 'ok' }; }
  } else if (fn === 'pingpong_match_finish') {
    const p = me();
    const m = db.matches?.[a.p_match];
    const mp = m && p && m.players[p.id];
    if (!p) out = { status: 'no_session' };
    else if (typeof a.p_won !== 'boolean') out = { status: 'bad' };
    else if (!mp) out = { status: 'no_match' };
    else if (mp.at) out = { status: 'done' };
    else if (m.at > now - 25000) out = { status: 'too_fast' };
    else if (m.at < now - 3600e3) out = { status: 'too_old' };
    // 18: 이 경기 뒤에 다른 경기에 또 입장했으면 결과를 낼 수 없다
    else if (Object.entries(db.matches).some(([id, x]) => id !== a.p_match && x.players[p.id]?.joined > (mp.joined || 0))) out = { status: 'stale' };
    else {
      const wonSide = a.p_won ? mp.side : 1 - mp.side;
      if (m.winner == null) m.winner = wonSide; else if (m.winner !== wonSide) m.disputed = true;
      const opps = Object.entries(m.players).filter(([, x]) => x.side !== mp.side).map(([id]) => id).sort();
      const hasOpp = opps.length > 0;
      // 27: 김제빵 낀 판(표시 + 로그인 입장 3명 이하)은 전적·랭킹·연승 X, 코인은 보통 2대2와 같게
      const kim = !!m.kim && Object.keys(m.players).length <= 3;
      const rec = hasOpp && !kim;
      const okey = m.mode + ':' + (opps.join(',') || 'guest');
      const dayStart = Date.parse(new Date(now + 9 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+09:00');
      const played = Object.values(db.matches).filter((x) => { const y = x.players[p.id]; return y && y.okey === okey && y.at >= dayStart; }).length;
      // 18: 손님 상대 = 승수 X, 코인 하루 5판까지 / 같은 상대 = 1~5판 보통, 6~10판 참여만, 11판째부터 0
      const full = played < 5, join = hasOpp ? played < 10 : played < 5;
      p.lastMatch = now;
      const f = (m.mode === '1v1' ? '1' : '2');
      if (rec) {
        if (a.p_won) p['w' + f] = (p['w' + f] || 0) + 1; else p['l' + f] = (p['l' + f] || 0) + 1;
        p.streak = a.p_won ? (p.streak || 0) + 1 : 0;
      }
      const clamp = (n) => Math.min(3, Math.max(0, n | 0));
      const nPerf = clamp(a.p_perfect3), nRally = clamp(a.p_rally10);
      const items = join ? [{ label: '경기 참여', coins: 10 }] : [];
      if (full) {
        if (a.p_won) items.push({ label: '승리', coins: 10 });
        if (nPerf) items.push({ label: `퍼펙트 3연속 ×${nPerf}`, coins: 5 * nPerf });
        if (nRally) items.push({ label: `랠리 10회 이상 ×${nRally}`, coins: 5 * nRally });
        if (rec && a.p_won && p.streak % 3 === 0) items.push({ label: `${p.streak}연승`, coins: 15 });
      } else if (join) items.push({ label: '같은 상대 오늘 6판째부터는 참여 코인만', coins: 0 });
      else items.push({ label: hasOpp ? '같은 상대와는 하루 10판까지만 코인' : '손님 상대는 하루 5판까지만 코인', coins: 0 });
      if (kim) items.push({ label: '🤖 김제빵 낀 판은 전적·랭킹에 안 들어가요', coins: 0 });
      else if (!hasOpp) items.push({ label: '손님 상대 경기는 승수에 안 들어가요', coins: 0 });
      // 19: 쉬는 시간 보너스 (경기 시작이나 끝이 평일 쉬는 시간이면 +50%, 올림). 가짜 서버는 ?clock= 시각을 따른다
      // 24: 세트 보너스 (supabase/24_sets.sql과 같은 규칙: 퍼센트는 이 판 코인 합에 붙고 올림, 완전 세트 = 2배)
      const st = setOf(p.equip);
      let brkPct = 50;
      if (st) {
        const k = st.set.kind, amt = setAmount(st.set, st.full), sum = items.reduce((s, i) => s + i.coins, 0);
        const pctOf = (n) => Math.ceil((n * amt) / 100);
        let sb = 0;
        if (k === 'win' && a.p_won && sum > 0) sb = pctOf(sum);
        else if (k === 'perfect' && full && nPerf > 0 && sum > 0) sb = pctOf(sum);
        else if (k === 'rally' && full && nRally > 0 && sum > 0) sb = pctOf(sum);
        else if (k === 'lose' && !a.p_won && join) sb = amt;
        else if (k === 'streak' && full && rec && a.p_won && p.streak % 3 === 0) sb = amt;
        else if (k === 'break') brkPct = 50 + amt;
        if (sb > 0) items.push({ label: setLabel(st.set, st.full) + (k === 'lose' || k === 'streak' ? '' : ` +${amt}%`), coins: sb });
      }
      const base = items.reduce((s, i) => s + i.coins, 0);
      const clk = nowMs() - Date.now();
      if (base > 0 && (breakAt(m.at + clk) || breakAt(now + clk))) items.push({ label: `☕ 쉬는 시간 +${brkPct}%`, coins: Math.ceil((base * brkPct) / 100) });
      const total = items.reduce((s, i) => s + i.coins, 0);
      p.coins = (p.coins || 0) + total;
      Object.assign(mp, { at: now, won: a.p_won, okey });
      const opp = m.mode === '1v1' ? opps[0] : null;
      if (opp) {
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
      let got = 0, extra = {};
      if (p.daily !== today) {
        const yest = new Date(now + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
        p.achN ||= {};
        p.achN.days = (p.achN.days || 0) + 1;
        p.achN.days_run = p.daily === yest ? (p.achN.days_run || 0) + 1 : 1;
        p.daily = today; p.coins = (p.coins || 0) + 20; got = 20;
        // 24: '동네 할매' 세트 = 하루 첫 접속 +15 (완전 +30)
        const st = setOf(p.equip);
        if (st?.set.kind === 'daily') { const sb = setAmount(st.set, st.full); p.coins += sb; got += sb; extra = { set: setLabel(st.set, st.full), set_coins: sb }; }
      }
      out = { status: 'ok', coins: got, ...extra, player: pj(p) };
    }
  } else if (fn === 'pingpong_missions' || fn === 'pingpong_mission_match' || fn === 'pingpong_mission_cheer') {
    // 21: 오늘의 미션 (서버와 같은 규칙)
    const p = me();
    const day = koreaDay(now);
    const dayStart = Date.parse(day + 'T00:00:00+09:00');
    const today = missionsOf(day);
    if (!p) out = { status: 'no_session' };
    else {
      if (p.mission?.d !== day) p.mission = { d: day, done: [], cheer: 0 };
      const ms = p.mission;
      const mj = () => ({ day, list: today.map((id) => ({ id, done: ms.done.includes(id) })), cheer: ms.cheer || 0 });
      const grant = (ids) => {
        const fresh = [...new Set(ids)].filter((id) => today.includes(id) && !ms.done.includes(id));
        ms.done.push(...fresh);
        const all = fresh.length > 0 && ms.done.length >= today.length;
        let coins = fresh.length * MISSION_COIN + (all ? MISSION_ALL : 0);
        // 24: '곰돌이' 세트 = 미션 코인 +15% (완전 +30%), 올림
        const st = setOf(p.equip);
        const setCoins = coins > 0 && st?.set.kind === 'mission' ? Math.ceil((coins * setAmount(st.set, st.full)) / 100) : 0;
        coins += setCoins;
        p.coins = (p.coins || 0) + coins;
        return { new: fresh, all, coins, set_coins: setCoins };
      };
      if (fn === 'pingpong_missions') out = { status: 'ok', missions: mj() };
      else if (fn === 'pingpong_mission_cheer') {
        let g = { new: [], all: false, coins: 0 };
        if (today.includes('cheer3') && !ms.done.includes('cheer3') && now - (ms.cheerAt || 0) >= 1500) {
          ms.cheer = (ms.cheer || 0) + 1; ms.cheerAt = now;
          if (ms.cheer >= 3) g = grant(['cheer3']);
        }
        out = { status: 'ok', ...g, missions: mj(), player: pj(p) };
      } else {
        const m = db.matches?.[a.p_match];
        const mp = m && m.players[p.id];
        if (!mp || !mp.at || mp.at < dayStart) out = { status: 'no_match' };
        else if (mp.mission) out = { status: 'done' };
        else {
          mp.mission = true;
          const oppsOf = (x, y) => Object.entries(x.players).filter(([, z]) => z.side !== y.side).map(([id]) => id);
          const opps = oppsOf(m, mp);
          const ok = [];
          if (opps.length) {
            const before = new Set(), all = new Set();
            for (const [id, x] of Object.entries(db.matches)) {
              const y = x.players[p.id];
              if (!y || !y.at || y.at < dayStart) continue;
              for (const o of oppsOf(x, y)) { all.add(o); if (id !== a.p_match) before.add(o); }
            }
            if (opps.some((o) => !before.has(o))) ok.push('new_opp');
            if (all.size >= 3) ok.push('opp3');
            if (m.mode === '2v2') ok.push('duo');
            if (mp.won) ok.push('win1');
            if ((a.p_rally10 | 0) > 0) ok.push('rally10');
            if ((a.p_perfect3 | 0) > 0) ok.push('perf3');
          }
          out = { status: 'ok', ...grant(ok), missions: mj(), player: pj(p) };
        }
      }
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
      const hits = Math.min(Math.max(a.p_hits | 0, 0), allowed, 1000);
      const total = (p.aiRem || 0) + hits;
      p.best = Math.max(p.best || 0, hits); // 최고 기록도 서버가 인정한 횟수로 (18)
      const got = Math.floor(total / AI_HITS_PER_COIN);
      p.aiRem = total % AI_HITS_PER_COIN;
      p.aiAt = now;
      // 24: '꿀잠' 세트 = 혼자 하기 코인 +15% (완전 +30%) / '휴가 중' = 쉬는 시간 +75% (완전 +100%)
      const st = setOf(p.equip);
      const sb = st?.set.kind === 'ai' && got > 0 ? Math.ceil((got * setAmount(st.set, st.full)) / 100) : 0;
      const brkPct = st?.set.kind === 'break' ? 50 + setAmount(st.set, st.full) : 50;
      const brk = got > 0 && breakAt(nowMs()) ? Math.ceil(((got + sb) * brkPct) / 100) : 0; // 19: 쉬는 시간 +50%
      p.coins = (p.coins || 0) + got + sb + brk;
      out = { status: 'ok', coins: got + sb + brk, bonus: brk, bonus_pct: brkPct, set: sb ? setLabel(st.set, st.full) : null, set_coins: sb, player: pj(p) };
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
    else if (!poolOpen(a.p_pool)) out = { status: 'closed' }; // 일반 아이템이 들어오기 전엔 잠시 닫힘 (16_gacha_open.sql)
    else if ((p.free ?? 50) < a.p_count && (p.coins || 0) < cost) out = { status: 'no_coins' };
    else {
      // 무료 뽑기(25): 남은 무료 횟수가 뽑을 횟수만큼 있으면 코인 대신
      const useFree = (p.free ?? 50) >= a.p_count;
      p.free = (p.free ?? 50) - (useFree ? a.p_count : 0);
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
      if (!useFree) p.coins -= cost;
      p.achN ||= {};
      p.achN.gacha = (p.achN.gacha || 0) + a.p_count;
      out = shopOut(p, { results, used_free: useFree });
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
  } else if (fn === 'pingpong_h2h') {
    out = me() ? { status: 'ok', h2h: h2h(me(), a.p_opp) } : { status: 'no_session' };
  } else if (fn === 'pingpong_ranking') {
    const rows = Object.values(db.players).map((p) => pj(p))
      .map((p) => (a.p_kind === 'wins'
        ? { nick: p.nick, title: p.title, title_x: p.nemesis, value: p.wins_1v1 + p.wins_2v2, w1: p.wins_1v1, w2: p.wins_2v2 }
        : { nick: p.nick, title: p.title, title_x: p.nemesis, value: p.best_rally }))
      .filter((x) => x.value > 0)
      .sort((x, y) => y.value - x.value || (x.nick < y.nick ? -1 : 1))
      .slice(0, 50);
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].value === x.value ? rows[i - 1].rank : i + 1; });
    return rows;
  } else if (fn === 'pingpong_achievements' || fn === 'pingpong_set_title' || fn === 'pingpong_ach_match' || fn === 'pingpong_ach_people') {
    const p = me();
    if (!p) out = { status: 'no_session' };
    else {
      p.ach ||= {};
      p.achN ||= {};
      const fresh = [];
      const grant = (ids) => {
        for (const id of ids) {
          if (p.ach[id] || !ACH[id]) continue;
          p.ach[id] = new Date(now).toISOString();
          p.coins = (p.coins || 0) + REWARD[ACH[id].grade];
          fresh.push({ id, coins: REWARD[ACH[id].grade] });
        }
      };
      if (fn === 'pingpong_ach_match') out = localAchMatch(p, a, now, grant);
      if (fn === 'pingpong_ach_people') out = localAchPeople(p, a, now, grant, db);
      if ((fn === 'pingpong_ach_match' || fn === 'pingpong_ach_people') && out.status !== 'ok') { /* too_soon 등 */ }
      else if (fn !== 'pingpong_set_title') {
        const N = (k) => p.achN[k] || 0;
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
          perf500: N('perfects') >= 500, center300: N('centers') >= 300, smash30: N('smash_pts') >= 30, chance10: N('chance_run') >= 10,
          quick5: N('quick') >= 5, ace20: N('aces') >= 20, deuce5: N('deuce_wins') >= 5, aizero: N('aizero') >= 5,
          duck10: N('duck_wins') >= 10, bread100: N('bread_perf') >= 100, day20: N('day_n') >= 20,
          gacha100: N('gacha') >= 100, days5: N('days_run') >= 5, days20: N('days') >= 20,
          duo5: Object.values(p.achN.duo || {}).some((v) => v >= 5),
          early: N('dt_n') >= 50 && N('dt_sum') / N('dt_n') < -50, late: N('dt_n') >= 50 && N('dt_sum') / N('dt_n') > 50,
        };
        grant(Object.keys(ok).filter((id) => ok[id]));
        // 24: 세트 칭호 (지금 입은 세트 / 완전 세트)
        const st = setOf(p.equip);
        if (st) grant(['set_' + st.set.id, ...(st.full ? ['setfull_' + st.set.id] : [])]);
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
