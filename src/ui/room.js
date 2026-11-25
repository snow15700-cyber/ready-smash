import { account, getH2H, matchAch, matchFinish, matchJoin, matchKim, matchPeople, myEquip, myTitle, newMatchId } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { Game } from '../game.js';
import { AI_LOOK, AI_NAME, KIM_ID, Match } from '../match.js';
import { joinRoom } from '../net.js';
import { checkMatchMissions, missionItems } from './missions.js';
import { crowdJoin } from './cheer.js';
import { hud } from './hud.js';
import { addSkip, startIntro } from './intro.js';
import { announceRoom } from './lobbyList.js';
import { show, stopGame } from './screen.js';
import { $, IS_MOBILE, MOBILE_MSG, game, match, myNemesis, myNick, setGame, setMatch, tpill, world } from './state.js';
import { gotAch, runAchCheck } from './titles.js';

// 내 연승 (로그인했을 때만, 서버가 준 값). 다른 선수 것은 경기 채널 명단의 'streak' (보여 주기만, 코인과 무관)
export const myStreak = () => (account.loggedIn ? account.player.win_streak || 0 : 0);
export const streakOf = (id) => (id === myId ? myStreak() : Math.min(999, Math.max(0, room?.members.find((m) => m.id === id)?.streak | 0)));
export const roomTpill = (id) => { const m = room?.members.find((x) => x.id === id); return tpill(m?.title, m?.titleX); };
export let room = null;
/* ───────── 경기 채널 (광장 탁구대, docs/dev/plaza.md 2장) ─────────
   자리·준비는 광장 명단에서 모든 PC가 같은 규칙으로 정한다 (src/ui/plaza.js). 모두 준비되면 선수마다
   이 경기 채널(pingpong-room-XXXX, XXXX = 방장이 광장 명단에 올려 둔 코드)에 들어온다.
   방장(그 탁구대에 처음 선 사람)은 선수가 다 들어오면 'go' → 지금 경기 화면(방장 배경). 끝나면 채널을 나가 광장으로.
   경기 중 주고받는 것(ping/pong·go·ev·in·skip)은 예전 방과 똑같다 → 선수 부담 그대로.
   선수끼리는 WebRTC 직접 연결로도 같이 보낸다 (net.js joinRoom rtc, 먼저 온 것만 씀 — 이 파일의 처리는 그대로) */
export const myId = Math.random().toString(36).slice(2, 10);
export const TEAM_NAME = ['A팀', 'B팀'];
const GO_WAIT = 9000; // 이 시간 안에 경기가 시작되지 않으면 광장으로 (상대 PC가 못 들어옴 등)
// 광장이 정하는 일 (plaza.js가 연결): onEnd(끝난 방, why) · onResult(방) — 코인 정산이 늦게 올 때
export const roomHooks = { onEnd: null, onResult: null };

// 광장 탁구대에서 경기 채널로. t = 탁구대 번호(0~), players = [{id, side, slot}] (모든 PC가 같은 명단으로 계산)
export function enterTable(code, host, mode, t, players, h2h = {}) {
  if (IS_MOBILE) { hud.toast(MOBILE_MSG, 2600); return false; }
  initAudio();
  leaveRoom();
  const me = { id: myId, nick: myNick(), host, at: Date.now(), look: myEquip(), title: myTitle(), titleX: myNemesis(), streak: myStreak(), ...(account.loggedIn ? { pid: account.player.id } : { guest: true }), ...(host ? { mode } : {}) };
  room = {
    code, host, me, mode, pt: t, want: players, members: [], hostM: host ? me : null,
    inGame: false, players: null, result: '',
    h2h: { ...h2h }, // 상대 pid → { wins, losses } (1v1 상대 전적, 광장에서 미리 불러 둠)
    pings: [], pingN: 0, offset: 0, timer: 0,
    lag: {}, // 방장: 참가자 id → 그 PC까지 소식이 가는 시간(초, 편도). 참가자가 ping에 실어 보냄 (match.js RECV_LAG_MAX)
  };
  const r0 = room;
  const useRtc = humans(players).length >= 2; // 선수끼리 WebRTC 직접 연결 (1대1·2대2·김제빵 낀 2대2 — 김제빵은 방장 PC 안에 있어서 연결 없음)
  room.link = joinRoom(code, me, {
    onMsg: onRoomMsg,
    onMembers,
    onStatus: (st, text) => { if (room === r0 && st === 'error') endRoom('error', text); },
    onDirect: (d) => { if (room === r0) netPill(d); },
  }, { rtc: useRtc });
  netPill(useRtc ? { n: 0, of: 0 } : null);
  crowdJoin(code); // 관중석 채널: 선수는 듣기만 (관중 수·응원)
  // 참가자 PC: 방장과 시계 맞추기
  room.timer = setInterval(() => {
    if (!room || room.host || !room.hostM) return;
    room.link.send({ k: 'ping', n: ++room.pingN, t1: performance.now() / 1000, from: myId, to: room.hostM.id, lat: typicalLag() });
  }, 700);
  room.goWait = setTimeout(() => { if (room === r0 && !room.inGame) endRoom('timeout', '상대와 연결하지 못했어요. 다시 준비해 주세요'); }, GO_WAIT);
  announceRoom();
  return true;
}

export function leaveRoom() {
  if (!room) return;
  clearInterval(room.timer);
  clearTimeout(room.goWait);
  clearTimeout(room.goT);
  room.link.leave();
  room = null;
  netPill(null);
  stopGame();
  announceRoom();
}
// 경기 채널을 나가 광장으로 (why: 'end' 경기 끝 · 'quit' 내가 나감 · 'gone' 선수가 나감 · 'timeout' · 'error')
export function endRoom(why, msg) {
  const r = room;
  if (!r) return;
  leaveRoom();
  show('lobby');
  if (msg) hud.toast(msg, 2800);
  roomHooks.onEnd?.(r, why);
}

function onMembers(list) {
  if (!room) return;
  list = [...list].sort((a, b) => a.at - b.at);
  // 서버는 입장 직후 '나를 빼고' 목록을 먼저 보낼 수 있다. 내가 목록에 들어올 때까지 기다린다
  if (!list.some((m) => m.id === myId)) return;
  const ids = new Set(room.want.map((p) => p.id));
  const kept = list.filter((m) => ids.has(m.id) && m.id !== KIM_ID); // 이 판 선수만 (다른 사람이 같은 코드로 들어와도 무시)
  const gone = room.members.filter((m) => !kept.some((k) => k.id === m.id));
  room.members = kept;
  room.hostM = kept.find((m) => m.host) || null;
  // 경기 중인 선수가 나가면 경기 끝내고 광장으로
  const goneP = room.inGame && room.players ? gone.find((m) => room.players.some((p) => p.id === m.id)) : null;
  if (goneP) { endRoom('gone', `${goneP.nick}님이 나가서 경기가 끝났어요`); return; }
  if (room.inGame && !room.host && room.sawHost && !room.hostM) { endRoom('gone', '방장이 나가서 경기가 끝났어요'); return; }
  if (room.hostM) room.sawHost = true;
  // 방장: 이 판 선수가 모두 들어오면 시작 (참가자 PC가 시계 맞추기를 한 번은 하게 조금 뒤에)
  if (room.host && !room.inGame && !room.goT && kept.length === humans(room.want).length) {
    const r0 = room;
    r0.goT = setTimeout(() => { if (room === r0 && !r0.inGame) startOnline(r0.mode, r0.want); }, 500);
  }
  announceRoom();
}

function onRoomMsg(m) {
  if (!room) return;
  if (m.to && m.to !== myId) return;
  switch (m.k) {
    case 'go': {
      if (room.host || room.inGame || !Array.isArray(m.players)) break;
      const p = m.players.find((x) => x.id === myId);
      if (!p) { endRoom('timeout', '다른 사람들이 먼저 시작했어요'); break; }
      startGuestGame(m.mode === '2v2' ? '2v2' : '1v1', m.players, p, m.mid);
      break;
    }
    case 'skip': // 경기 전 연출 건너뛰기 (선수 모두가 누르면 넘어감)
      addSkip(m.from);
      break;
    case 'ping':
      if (room.host && typeof m.lat === 'number') room.lag[m.from] = Math.min(1, Math.max(0, m.lat));
      if (room.host) room.link.send({ k: 'pong', n: m.n, t1: m.t1, th: performance.now() / 1000, to: m.from });
      break;
    case 'pong': {
      const now = performance.now() / 1000;
      const rtt = now - m.t1;
      room.pings.push({ rtt, off: m.th + rtt / 2 - now });
      if (room.pings.length > 12) room.pings.shift();
      const best = room.pings.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      room.offset = best.off;
      room.rtt = best.rtt;
      if (game) game.offset = room.offset;
      break;
    }
    case 'ev':
      if (room.host || !game) break;
      game.onEvent(m.ev);
      break;
    case 'in': {
      if (!room.host || !match || !room.players) break;
      const p = room.players.find((x) => x.id === m.from);
      if (!p) break;
      if (m.kind === 'toss') match.toss(p.side, m.t, m.x, p.slot || 0);
      else if (m.kind === 'late') match.reportLate(p.side, p.slot || 0, m.idx, performance.now() / 1000); // 공 소식을 늦게 받았어요 (네트워크 렛)
      else if (m.kind === 'swing') match.swing(p.side, m.t, m.dir, m.up, p.slot || 0, performance.now() / 1000); // 도착 시각: 늦게 왔으면 공 출발을 늦춤
      break;
    }
  }
}

function nickOf(id) {
  if (id === KIM_ID) return AI_NAME;
  return room.members.find((m) => m.id === id)?.nick || '상대';
}
export const humans = (players) => players.filter((p) => p.id !== KIM_ID); // 김제빵 빼고 (사람만 경기 채널에 들어옴)
export function playerNames() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = nickOf(p.id);
  return out;
}
// 선수마다 칭호 글자 (presence의 title). titles[side][slot]
function titles() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = (({ title, titleX } = {}) => titleText(title, titleX))(room.members.find((m) => m.id === p.id));
  return out;
}
// 선수마다 꾸미기 (presence의 look). looks[side][slot]
export function looks() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = p.id === KIM_ID ? AI_LOOK : room.members.find((m) => m.id === p.id)?.look || {};
  return out;
}
// 쪽(팀)별 이름. 2v2는 'A1·A2'처럼 두 명을 이어서
export function names() {
  const ofSide = (s) => room.players.filter((p) => p.side === s).sort((a, b) => (a.slot || 0) - (b.slot || 0));
  return [0, 1].map((s) => ofSide(s).map((p) => nickOf(p.id)).join('·') || '상대');
}

// 경기 시작: 선수마다 자기 열쇠로 서버의 그 경기에 입장 (supabase/13_match_check.sql, 결과는 입장한 경기에만)
function beginRoomGame(players, mode, mine, mid) {
  room.inGame = true;
  room.players = players;
  room.mid = mid || null;
  if (mid) matchJoin(mid, mode, mine.side).then((r) => { if (r?.status === 'ok' && players.some((p) => p.id === KIM_ID)) matchKim(mid); }); // 김제빵 낀 판 표시 (전적 X, supabase/27)
  room.result = '';
  room.coins = null;
  room.score = [0, 0];
  clearTimeout(room.goWait);
  stopGame(true); // 관중석 채널(관중 수·응원 듣기)은 방에 들어올 때부터 그대로
  announceRoom();
}

// 방장: 경기 시작 (1v1 / 2v2)
function startOnline(mode, players) {
  const mine = players.find((p) => p.id === myId);
  const mid = newMatchId();
  beginRoomGame(players, mode, mine, mid);
  room.link.send({ k: 'go', mode, players, mid });
  show('hud');
  setGame(new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), playerTitles: titles(), looks: looks(),
    send: {
      toss: (side, t, x, slot) => match.toss(side, t, x, slot),
      swing: (side, t, dir, up, slot) => match.swing(side, t, dir, up, slot),
    },
  }));
  setMatch(new Match({
    mode,
    isRemote: (side, slot) => !(side === mine.side && slot === (mine.slot || 0)) && !players.some((p) => p.id === KIM_ID && p.side === side && (p.slot || 0) === slot),
    bots: players.filter((p) => p.id === KIM_ID),
    lagOf: (side, slot) => {
      const p = players.find((x) => x.side === side && (x.slot || 0) === slot);
      return p && p.id !== myId ? room?.lag[p.id] || 0 : 0;
    },
    emit: (ev) => {
      if (game) game.onEvent(ev);
      if (room) room.link.send({ k: 'ev', ev });
      if (room && ev.type === 'point') { room.score = ev.score; announceRoom(); } // 로비 방 목록의 점수
    },
  }));
  hud.stats(game.stats);
  startIntro(players, mine.side, mode); // 약 10초 연출이 끝나면 match.start (endIntro)
}

// 참가자 PC: 방장의 시작 신호를 받으면 경기 화면으로
function startGuestGame(mode, players, mine, mid) {
  beginRoomGame(players, mode, mine, mid);
  show('hud');
  setGame(new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), playerTitles: titles(), looks: looks(), authority: false,
    send: {
      toss: (s, t, x) => room && room.link.send({ k: 'in', kind: 'toss', t, x, from: myId }),
      swing: (s, t, dir, up) => room && room.link.send({ k: 'in', kind: 'swing', t, dir, up, from: myId }),
      late: (idx) => room && room.link.send({ k: 'in', kind: 'late', idx, from: myId }),
    },
  }));
  game.offset = room.offset;
  hud.stats(game.stats);
  startIntro(players, mine.side, mode);
}

// 경기 화면 왼쪽 위 연결 표시 (d = { n, of }: 다른 선수 of명 중 n명과 직접 연결, null 숨김)
// 모두 ⚡ 직접 연결 · 일부(2대2) ⚡ 일부 직접 (n/of) · 없음 🌐 서버 경유
function netPill(d) {
  const el = $('net-pill');
  if (!el) return;
  el.classList.toggle('hidden', !d);
  if (!d) $('net-diag').classList.add('hidden');
  if (!d) return;
  const all = d.of > 0 && d.n === d.of;
  el.classList.toggle('on', all);
  el.classList.toggle('part', d.n > 0 && !all);
  // 다 이어짐: 모두 직접 '⚡ 직접 연결' · 모두 중계 '⚡ 서울 중계' · 섞임 '⚡ 직접·중계' / 일부만 '⚡ 일부 연결 (n/of)' / 없음 '🌐 서버 경유'
  const relay = d.relay || 0;
  el.textContent = all ? (relay === 0 ? '⚡ 직접 연결' : relay === d.n ? '⚡ 서울 중계' : '⚡ 직접·중계') : d.n > 0 ? `⚡ 일부 연결 (${d.n}/${d.of})` : '🌐 서버 경유';
}

// 참가자 PC: 방장 소식이 보통 몇 초 걸려 오는지 (최근 ping 왕복 시간의 75% 지점 ÷ 2).
// 가장 빠른 값이 아니라 '보통 느린 쪽'을 써서 와이파이가 들쭉날쭉해도 공이 늦게 나타나지 않게
function typicalLag() {
  if (!room.pings.length) return 0;
  const r = room.pings.map((p) => p.rtt).sort((a, b) => a - b);
  return Math.round((r[Math.floor((r.length - 1) * 0.75)] / 2) * 1000) / 1000;
}

// 경기가 끝나면 광장으로 (선수는 그 탁구대 앞에 그대로, '🔁 한 판 더')
export function backToRoom() {
  if (!room) return;
  endRoom('end');
}

/* ───────── 전적 ───────── */
// 경기가 끝나면 내 PC가 내 결과만 기록한다. 1v1이면 상대의 선수 번호(pid)도 함께 (상대 전적)
export async function saveResult(mode, win, stats, achStats) {
  if (!account.loggedIn) return;
  const r0 = room;
  const mid = r0?.mid;
  const opp = mode === '1v1' ? oppMember() : null;
  const bonus = { perfect3: stats.perfect3, rally10: stats.rally10 };
  // 31: 상대 결과를 기다리는 동안 결과 아래에 '상대 결과 확인 중…'
  const onWait = () => { if (r0 && !r0.checking) { r0.checking = true; roomHooks.onResult?.(r0); } };
  const r = mid ? await matchFinish(mid, win, bonus, onWait) : { status: 'no_match' };
  if (r0) r0.checking = false;
  if (r.status === 'ok') {
    if (r.disputed) hud.toast('서로 이겼다고 해서 이번 판은 승패 없이 끝났어요', 3000);
    if (opp?.pid && r.h2h) { h2hCache.set(opp.pid, r.h2h); if (r0) r0.h2h[opp.pid] = r.h2h; }
    if (r.coins && r0) r0.coins = r.coins;
    if (r.coins && !r0?.inGame) playUI('coin');
    if (r0) roomHooks.onResult?.(r0);
    // 오늘의 미션 (supabase/21) → 코인 내역에 '미션 달성!' 줄
    const rm = await checkMatchMissions(mid, bonus);
    const mi = missionItems(rm);
    if (mi.length) {
      if (r0?.coins) r0.coins = { total: r0.coins.total + rm.coins, items: [...r0.coins.items, ...mi] };
      if (r0) { roomHooks.onResult?.(r0); playUI('coin'); }
    }
    // 경기 기록으로 깬 업적 (결과 띠가 사라진 뒤 '🏅 업적 달성!'), 그다음 사람 관계 업적 (상대·팀원은 서버가 찾음)
    const ra = await matchAch(mid, achStats || {});
    if (ra.status === 'ok') {
      gotAch(ra);
      const rp = await matchPeople(mid);
      if (rp.status === 'ok') gotAch(rp);
    } else runAchCheck();
  } else if (r.status === 'too_fast') hud.toast('너무 빨리 끝난 경기라 기록·코인이 남지 않아요', 2600);
  else if (r.status === 'stale') hud.toast('다른 경기에 들어가서 이 경기 기록은 남지 않았어요', 2600);
  else if (r.status === 'no_match') hud.toast('이번 경기는 서버에 등록되지 않아 기록이 남지 않았어요', 2600);
  else if (r.status !== 'done') hud.toast('전적을 저장하지 못했어요 (인터넷 연결 확인)', 2600);
}

// 1v1 상대 (나 말고 다른 한 사람)
const oppMember = () => (room ? room.members.find((m) => m.id !== myId) : null);
// 1v1 상대 전적 미리 불러오기 (광장에서 같은 탁구대에 상대가 서면, 둘 다 로그인했을 때). 경기 전 연출 '이 판에 걸린 것'
const h2hCache = new Map(); // 상대 pid → { wins, losses } | null(불러오는 중)
export function h2hOf(pid) {
  if (!account.loggedIn || !pid) return undefined;
  if (!h2hCache.has(pid)) {
    h2hCache.set(pid, null);
    getH2H(pid).then((v) => h2hCache.set(pid, v || false)); // 못 불러오면 false (다시 묻지 않음)
  }
  return h2hCache.get(pid) || undefined;
}

// 연결 표시를 누르면 직접 연결 진단 (왜 서버 경유인지). 열려 있는 동안 1초마다 고침
let diagT = 0;
function renderDiag() {
  const box = $('net-diag');
  if (box.classList.contains('hidden') || !room) { clearInterval(diagT); diagT = 0; box.classList.add('hidden'); return; }
  box.textContent = room.link.rtcInfo?.() || '직접 연결을 안 쓰는 경기예요 (주소 끝 ?rtc=0 이거나 혼자 하기)';
}
for (const ev of ['pointerdown', 'mousedown', 'touchstart']) $('net-pill').addEventListener(ev, (e) => e.stopPropagation()); // 눌러도 스윙이 안 되게
$('net-pill').addEventListener('click', () => {
  const box = $('net-diag');
  box.classList.toggle('hidden');
  renderDiag();
  clearInterval(diagT);
  if (!box.classList.contains('hidden')) diagT = setInterval(renderDiag, 1000);
});
