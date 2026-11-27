// PIN 계정: 진짜 정보는 서버(Supabase DB, supabase/01_accounts.sql)에 있고,
// 브라우저에는 '로그인 열쇠(토큰)'만 기억한다. 열쇠가 지워져도 닉네임+PIN으로 다시 로그인하면 된다.
// 서버 설정이 없으면(로컬 테스트) 브라우저 안의 가짜 서버(src/localServer.js)로 똑같이 동작한다.
import { ONLINE, getClient } from './net.js';
import { koreaDay } from './missions.js';
import { nowMs } from './breaks.js';
import { localServer } from './localServer.js'; // 서버 설정이 없을 때 쓰는 가짜 서버
import { period, periodKey, setNewsWx, setSold } from './games/fishing/market.js';

// ?acct=2 처럼 주소에 붙이면 열쇠를 따로 보관한다 (한 브라우저에서 탭마다 다른 계정으로 테스트할 때)
const ACCT = new URLSearchParams(location.search).get('acct');
const TOKEN_KEY = 'smash-token' + (ACCT ? `-${ACCT}` : '');
const NICK_KEY = 'smash-nick'; // 마지막에 쓴 닉네임 (입력칸 미리 채우기용)

export const store = {
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
// 32: 상대 쪽에 로그인한 사람이 있으면 서버가 상대 결과를 기다리며 'wait'를 준다 → 1.5초마다 다시 (서버가 20초 뒤엔 내 말대로 정산)
// onWait(r): 기다리는 동안 한 번씩 (화면에 '상대 결과 확인 중…')
export async function matchFinish(matchId, won, bonus, onWait = null) {
  if (!account.loggedIn) return { status: 'guest' };
  let r;
  for (let i = 0; i < 30; i++) {
    r = await call('pingpong_match_result', { // 32: 새 함수 (옛 pingpong_match_finish는 main 배포본용, 33로 닫음)
      p_token: token(), p_match: matchId, p_won: won,
      p_perfect3: bonus.perfect3 | 0, p_rally10: bonus.rally10 | 0,
    });
    if (r.status !== 'wait') break;
    onWait?.(r);
    await new Promise((ok) => setTimeout(ok, 1500));
  }
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
// 32: 혼자 하기 코인은 하루 AI_DAY_MAX까지 (서버가 셈). 상한에 닿으면 account.aiCapped = true
export const AI_DAY_MAX = 250;
account.aiCapped = false;
export async function aiRally(hits) {
  if (!account.loggedIn || hits < 1) return 0;
  const r = await call('pingpong_ai_rally', { p_token: token(), p_hits: hits });
  if (r.status !== 'ok') return 0;
  account.player = { ...EMPTY_STATS, ...r.player };
  account.aiCapped = !!r.capped;
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
// 서버 시각 맞추기 (기포는 시각으로 정해서 모든 PC가 같게 — PC 시계가 틀려도): srvNow() = 서버 기준 지금(ms)
let srvOff = 0, srvSynced = false;
export const srvNow = () => Date.now() + srvOff;
export async function syncServerClock() {
  if (srvSynced || !ONLINE) return;
  const t0 = Date.now(), r = await call('pingpong_now', {}), t1 = Date.now();
  const ms = +(r?.ms ?? r);
  if (!Number.isFinite(ms) || t1 - t0 > 3000) return; // 너무 늦은 답은 믿지 않음 (다음에 다시)
  srvOff = Math.round(ms - (t0 + t1) / 2); srvSynced = true;
}
export async function fishCast(x, aim, power, rain, z) {
  if (!account.loggedIn) return null;
  const r = await call('pingpong_fish_cast', { p_token: token(), p_x: x, p_z: z ?? null, p_aim: aim, p_power: power, p_rain: !!rain });
  return r.status === 'ok' ? r.cast : null;
}
// 잡았다/놓쳤다. 결과 { status, caught, coins, bonus, capped, first, rec, best, big, pieces, new: [{id, coins}], player }
// q = 품질 별 0~3 (41_fish_quality.sql). 41을 아직 안 돌린 서버면 별 없이 한 번 더 (가방엔 ★로)
export async function fishFinish(castId, ok, perfect, q = null) {
  if (!account.loggedIn || !castId) return { status: 'guest' };
  const args = { p_token: token(), p_cast: castId, p_ok: !!ok, p_perfect: !!perfect };
  let r = await call('pingpong_fish_finish', q == null ? args : { ...args, p_q: q });
  if (r.status === 'error' && q != null && ONLINE) r = await call('pingpong_fish_finish', args);
  if (r.player) account.player = { ...EMPTY_STATS, ...r.player };
  if (Array.isArray(r.bag)) account.fishBag = r.bag;
  setFishDay(r);
  if (r.status === 'ok' && r.new?.length && account.ach) for (const n of r.new) account.ach.got.set(n.id, new Date().toISOString());
  return r;
}
// 🎒 가방 · 🍣 팔기 (35_fish_bag.sql, fishing.md 7장). account.fishBag = [{ id, q(별 0~3, 41 전 서버면 없음), n }] · null = 모름(손님 또는 35 전 서버 → 횟집 숨김)
// 시세 시각: 서버면 서버 시각, 로컬 가짜 서버면 ?clock= 시험 시각
export const marketNow = () => (ONLINE ? srvNow() : nowMs());
// 📰 시세 소식(43, fishing.md 13-1 ④): 지금 대구 날씨(wx, 모르면 null)를 알리고 최근 회차 날씨를 받아 market.js에 넣음
// 지금 회차 날씨를 이미 알면 다시 안 부름(force면 부름). 로그인 안 해도 됨. 43 전 서버면 조용히 실패 → 소식은 보통 소식으로
let newsAsk = 0;
export const newsKnown = () => account.newsP === periodKey(period(marketNow()));
export async function fishNews(wx = null, force = false) {
  if (!force && newsKnown()) return true;
  if (Date.now() - newsAsk < 15000 && !force) return false;
  newsAsk = Date.now();
  const r = await call('pingpong_fish_news', { p_wx: wx });
  if (r?.status !== 'ok' || !Array.isArray(r.news)) return false;
  setNewsWx(r.news);
  setSold(r.sold); // 44 🛒 지난 회차 팔린 수 (44 전 서버면 없음 → 시세 그대로)
  if (r.news.some((n) => +n.p === +r.period)) account.newsP = +r.period;
  return true;
}
export async function fishBagLoad() {
  if (!account.loggedIn) { account.fishBag = null; return null; }
  const r = await call('pingpong_fish_bag', { p_token: token() });
  account.fishBag = r.status === 'ok' && Array.isArray(r.bag) ? r.bag : null;
  setFishDay(r);
  return account.fishBag;
}
// 오늘 물고기를 팔아 받은 코인 { coins, cap } (40_fish_price_cap.sql — 하루 1000까지). null = 모름(40 전 서버 → 한도 글자 숨김)
function setFishDay(r) { if (Number.isFinite(r?.day_coins)) account.fishDay = { coins: r.day_coins, cap: r.day_cap || 1000 }; }
// id = 물고기 종류 또는 null(전부) · q = 그 별만(41) 또는 null(별 상관없이). 결과 { status: ok | capped | empty, coins, sold: [{ id, q, n, price }], kept(한도 때문에 남긴 수), bag }
export async function fishSell(id = null, q = null) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_fish_sell', q == null ? { p_token: token(), p_fish: id } : { p_token: token(), p_fish: id, p_q: q });
  if (r.player) account.player = { ...EMPTY_STATS, ...r.player };
  if (Array.isArray(r.bag)) account.fishBag = r.bag;
  setFishDay(r);
  return r;
}
// 🐱 고양이 (37_cats.sql, docs/dev/cats.md). account.cats = { id: { pts, readyAt(이 PC 시각 ms) } } · null = 모름
function setCats(list) {
  if (!Array.isArray(list)) return;
  const now = Date.now();
  account.cats = Object.fromEntries(list.map((c) => [c.id, { pts: c.pts, readyAt: now + (c.wait || 0) * 1000, outfit: c.outfit || {} }]));
}
export async function catList() {
  if (!account.loggedIn) { account.cats = null; return null; }
  const r = await call('pingpong_cat_list', { p_token: token() });
  if (r.status === 'ok') setCats(r.cats);
  return account.cats;
}
// 결과 { status: ok | wait | no_fish | bad_cat | no_session | error, fish, pts, up, wait }
export async function catFeed(cat) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_cat_feed', { p_token: token(), p_cat: cat });
  setCats(r.cats);
  if (Array.isArray(r.bag)) account.fishBag = r.bag;
  return r;
}
// 옷 입기/벗기 (38_cat_wear.sql). 결과 { status: ok | locked | ... }
export async function catWear(cat, slot, on) {
  if (!account.loggedIn) return { status: 'guest' };
  const r = await call('pingpong_cat_wear', { p_token: token(), p_cat: cat, p_slot: slot, p_on: !!on });
  setCats(r.cats);
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
