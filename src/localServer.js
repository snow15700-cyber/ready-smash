// 로컬 가짜 서버: 서버 설정(VITE_SUPABASE_URL)이 없을 때(로컬 테스트·npm run check) src/account.js의 call()이 대신 부른다.
// 브라우저 localStorage('smash-local-db')에 저장. ⚠️ 서버 SQL(supabase/NN_*.sql) 규칙을 바꾸면 여기도 같은 규칙으로.
import { store, validPin, AI_HITS_PER_COIN, AI_DAY_MAX } from './account.js';
import { ITEMS, ITEM, GRADES, GACHA_PRICE, PITY, poolOpen } from './items.js';
import { ACH, REWARD, GAG_PADDLES } from './achievements.js';
import { breakAt, nowMs } from './breaks.js';
import { koreaDay, missionsOf, MISSION_ALL, MISSION_COIN } from './missions.js';
import { setOf, setAmount, setLabel } from './sets.js';
import * as FR from './games/fishing/rules.js';
import * as MK from './games/fishing/market.js';

// 한국 월요일 0시 (이번 주 월척)
function fishWeekStart(now) {
  const k = new Date(now + 9 * 3600e3), dow = (k.getUTCDay() + 6) % 7; // 월요일 0
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow) - 9 * 3600e3;
}
// 이번 주 1등 한 마리 (점수가 같으면 먼저 잡은 것) — 바다 술렁임은 이 기록이 세워진 뒤 지난 날 수
function fishWeekTop(db, now) {
  const since = fishWeekStart(now);
  let top = null;
  for (const l of db.fishLog || []) if (l.at >= since && (!top || (l.s ?? l.cm) > (top.s ?? top.cm))) top = l;
  return top;
}
// 로컬 가짜 서버의 낚시 (28·34와 같은 규칙)
const bagList = (p) => Object.entries(p.fishBag || {}).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, n]) => ({ id, n }));
const bagN = (p) => MK.bagCount(bagList(p));
const breakPctOf = (p) => { const st = setOf(p.equip); return st?.set.kind === 'break' ? 50 + setAmount(st.set, st.full) : 50; };
const FISH_ACH = ['fish10', 'fish_all', 'junk_all', 'fish_bread', 'fish_big', 'fish_legend', 'fish_perf10'];
function localFish(fn, a, p, db, now) {
  if (fn === 'pingpong_fish_cast') {
    const pt = FR.landingPoint(a.p_x == null ? 13 : +a.p_x, +a.p_aim || 0, a.p_power ?? 0.5, a.p_z == null ? undefined : +a.p_z); // 36: 서는 곳·판 넘기기는 landingPoint 안에서
    const near = FR.bubbleNear(pt.x, pt.z, FR.activeBubbles(nowMs() / 1000, 'normal'));
    const owned = (p.owned || []).filter((id) => FR.LEGEND_PADDLES.some(([x]) => x === id));
    const c = FR.rollCatch(near, { owned, cond: { break: !!breakAt(nowMs()), night: FR.isNight(nowMs()), rain: !!a.p_rain } });
    let size = { cm: 0, s: 0 };
    if (c.kind === 'fish') { // 34: 보통 크기 × 배율 + 행운 주사위 (초보자 10마리 3번 · 오늘 첫 3마리 2번 · 이번 주 1등이 안 깨진 날 수만큼 +1, 최대 +4)
      const day = new Date(nowMs() + 9 * 3600e3).toISOString().slice(0, 10);
      if (p.fishDay !== day) { p.fishDay = day; p.fishDayN = 0; }
      const top = fishWeekTop(db, now);
      const dice = FR.luckDice({ caught: (db.fishLog || []).filter((l) => l.pid === p.id).length, dayN: p.fishDayN, recordDays: top ? (now - top.at) / 86400e3 : 0 });
      p.fishDayN++;
      size = FR.fishSize(c.id, dice);
    }
    p.fishCast = { id: Math.random().toString(36).slice(2), kind: c.kind, item: c.id, grade: c.grade, cm: size.cm, s: size.s, dup: !!c.dup, near, at: now };
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
    // 35: 물고기는 가방에, 꽉 찼으면 그 자리에서 지금 시세로 (분당 주머니는 안 씀)
    let base = 0, brk = 0, brkPct = 50, bagged = false, sold = false;
    p.fishBag ||= {};
    if (c.kind === 'fish') {
      if (bagN(p) < MK.BAG_MAX) { p.fishBag[c.item] = (p.fishBag[c.item] || 0) + 1; bagged = true; }
      else {
        sold = true;
        base = Math.floor(MK.priceOf(c.item, nowMs()) / 10);
        brkPct = breakPctOf(p);
        if (breakAt(nowMs())) brk = Math.ceil((base * brkPct) / 100);
      }
    }
    const total = base + brk, capped = false;
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
      if (c.kind === 'fish') (db.fishLog ||= []).push({ pid: p.id, id: c.item, cm: c.cm, s: c.s ?? c.cm, at: now });
    }
    const run = a.p_perfect ? (p.achN.fish_pr || 0) + 1 : 0;
    p.achN.fish_pr = run;
    p.coins = (p.coins || 0) + total;
    p.pieces = (p.pieces || 0) + pieces;
    const dex = Object.keys(p.fishDex || {});
    const ok = {
      fish10: dex.filter((id) => FR.CATCH[id]?.kind === 'fish').length >= 10,
      fish_all: FR.SPECIES.every((s) => dex.includes(s.id)), junk_all: FR.JUNK.every((s) => dex.includes(s.id)),
      fish_bread: c.item === 'baguette', fish_big: c.kind === 'fish' && (c.s ?? c.cm) >= FR.BIG_CM, fish_legend: c.kind === 'fish' && c.grade === 'legend', fish_perf10: run >= 10,
    };
    p.ach ||= {};
    const fresh = [];
    for (const id of FISH_ACH) if (ok[id] && !p.ach[id]) { p.ach[id] = new Date(now).toISOString(); p.coins += REWARD[ACH[id].grade]; fresh.push({ id, coins: REWARD[ACH[id].grade] }); }
    const { at, ...cast } = c;
    return { status: 'ok', caught: true, cast, coins: total, bonus: Math.min(brk, total), bonus_pct: brkPct, capped, bagged, sold, bag: bagList(p), first, rec, best, big: c.kind === 'fish' && (c.s ?? c.cm) >= FR.BIG_CM, pieces, new: fresh };
  }
  if (fn === 'pingpong_fish_sell') {
    const items = Object.entries(p.fishBag || {}).filter(([id, n]) => n > 0 && (a.p_fish == null || id === a.p_fish));
    if (!items.length) return { status: 'empty', bag: bagList(p) };
    const ms = nowMs(), brkPct = breakPctOf(p);
    const r = MK.sellCoins(items, ms, breakAt(ms) ? brkPct : 0);
    for (const [id] of items) delete p.fishBag[id];
    p.coins = (p.coins || 0) + r.total;
    return { status: 'ok', coins: r.total, bonus: r.bonus, bonus_pct: brkPct, sold: items.map(([id, n]) => ({ id, n, price: MK.priceOf(id, ms) })), bag: bagList(p) };
  }
  if (fn === 'pingpong_fish_bag') return { status: 'ok', bag: bagList(p) };
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
    const since = a.p_kind === 'week' ? fishWeekStart(now) : -Infinity;
    const sc = (l) => l.s ?? l.cm; // 34: 크기 점수(배율 × 50) 순서
    const best = {};
    for (const l of db.fishLog || []) if (l.at >= since && (!best[l.pid] || sc(l) > sc(best[l.pid]))) best[l.pid] = l;
    const byId = Object.fromEntries(Object.values(db.players).map((q) => [q.id, q]));
    const rows = Object.values(best).filter((l) => byId[l.pid]).sort((x, y) => sc(y) - sc(x) || x.at - y.at).slice(0, 50)
      .map((l) => { const q = byId[l.pid]; return { nick: q.nick, title: q.title || null, title_x: q.achN?.nemesis || null, value: l.cm, x: FR.timesOf(sc(l)), score: sc(l), fish: l.id }; });
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].score === x.score ? rows[i - 1].rank : i + 1; });
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
export function localServer(fn, a) {
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
    if (r && !Array.isArray(r) && p && (fn === 'pingpong_fish_finish' || fn === 'pingpong_fish_sell') && r.status === 'ok') r.player = pj(p);
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
  } else if (fn === 'pingpong_match_result') {
    const p = me();
    const m = db.matches?.[a.p_match];
    const mp = m && p && m.players[p.id];
    if (!p) out = { status: 'no_session' };
    else if (typeof a.p_won !== 'boolean') out = { status: 'bad' };
    else if (!mp) out = { status: 'no_match' };
    else if (mp.at) out = { status: 'done' };
    else if (m.at > now - 25000) out = { status: 'too_fast' };
    else if (m.at < now - 3600e3) out = { status: 'too_old' };
    // 18: 이 경기 뒤에 다른 경기에 또 입장했으면 결과를 낼 수 없다 (32: 이미 결과를 말해 두고 기다리던 중이면 그대로)
    else if (mp.claim == null && Object.entries(db.matches).some(([id, x]) => id !== a.p_match && x.players[p.id]?.joined > (mp.joined || 0))) out = { status: 'stale' };
    else {
      // 32: 처음 말한 결과만 쓴다. 상대 쪽에 로그인한 사람이 있으면 말이 맞아야 정산 (supabase/32_fair_results.sql과 같은 규칙)
      if (mp.claim == null) { mp.claim = a.p_won; mp.claimAt = now; }
      const wonSide = mp.claim ? mp.side : 1 - mp.side;
      if (m.winner == null) m.winner = wonSide; else if (m.winner !== wonSide) m.disputed = true;
      const opps = Object.entries(m.players).filter(([, x]) => x.side !== mp.side).map(([id]) => id).sort();
      const hasOpp = opps.length > 0;
      const said = Object.values(m.players).filter((x) => x.claim != null);
      const sideOf = (x) => (x.claim ? x.side : 1 - x.side);
      const conflict = hasOpp && said.some((x) => sideOf(x) !== wonSide);
      const agreed = hasOpp && said.some((x) => x.side !== mp.side && sideOf(x) === wonSide);
      if (hasOpp && !conflict && !agreed && mp.claimAt > now - 20000) {
        save();
        return { status: 'wait', left: Math.ceil((20000 - (now - mp.claimAt)) / 1000) };
      }
      const disputed = conflict;
      a = { ...a, p_won: mp.claim && !disputed };
      // 27: 김제빵 낀 판(표시 + 로그인 입장 3명 이하)은 전적·랭킹·연승 X, 코인은 보통 2대2와 같게
      const kim = !!m.kim && Object.keys(m.players).length <= 3;
      const rec = hasOpp && !kim && !disputed; // 32: 결과가 엇갈린 판도 전적·랭킹·연승 X
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
      if (disputed) items.push({ label: '⚠️ 서로 이겼다고 해서 승패 없이 끝났어요', coins: 0 });
      else if (kim) items.push({ label: '🤖 김제빵 낀 판은 전적·랭킹에 안 들어가요', coins: 0 });
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
        else if (k === 'lose' && !a.p_won && !disputed && join) sb = amt;
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
      const opp = m.mode === '1v1' && !disputed ? opps[0] : null;
      if (opp) {
        const h = db.h2h[p.id + '>' + opp] ||= [0, 0];
        h[a.p_won ? 0 : 1]++;
      }
      out = { status: 'ok', disputed, player: pj(p), h2h: opp ? h2h(p, opp) : null, coins: { total, items } };
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
      const allowed = p.aiAt ? Math.floor((now - p.aiAt) / 1200) + 1 : 0; // 32: 1.2초에 1번
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
      // 32: 하루 AI_DAY_MAX(250)코인까지 (한국 날짜)
      const today = koreaDay(now), used = p.aiDay === today ? p.aiDayCoins || 0 : 0;
      const raw = got + sb + brk, give = Math.min(raw, Math.max(AI_DAY_MAX - used, 0));
      p.aiDay = today; p.aiDayCoins = used + give;
      p.coins = (p.coins || 0) + give;
      out = { status: 'ok', coins: give, bonus: give < raw ? 0 : brk, bonus_pct: brkPct, set: sb && give === raw ? setLabel(st.set, st.full) : null, set_coins: give === raw ? sb : 0,
        day_coins: used + give, day_max: AI_DAY_MAX, capped: give < raw || used + give >= AI_DAY_MAX, player: pj(p) };
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
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].score === x.score ? rows[i - 1].rank : i + 1; });
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
