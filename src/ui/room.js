import { ic } from '../icons.js';
import { account, getH2H, matchAch, matchFinish, matchJoin, matchPeople, myEquip, myTitle, newMatchId } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { Game } from '../game.js';
import { equipped } from '../items.js';
import { Match } from '../match.js';
import { joinRoom, normalizeCode } from '../net.js';
import { crowdJoin } from './cheer.js';
import { hud } from './hud.js';
import { addSkip, startIntro } from './intro.js';
import { announceRoom, syncLobby } from './lobbyList.js';
import { show, stopGame } from './screen.js';
import { practiceSwing, renderStageLabels, stage } from './stage.js';
import { $, IS_MOBILE, MOBILE_MSG, esc, game, match, myNemesis, myNick, setGame, setMatch, tpill, world } from './state.js';
import { gotAch, runAchCheck } from './titles.js';

export const roomTpill = (id) => { const m = room?.members.find((x) => x.id === id); return tpill(m?.title, m?.titleX); };
export let room = null;
/* ───────── 온라인 방 (1v1 / 2v2) ─────────
   방장이 방을 만들 때 모드를 정한다 (presence의 mode). 참가자는 입장해서 팀만 고른다.
   팀을 고르면 준비 완료. 자리가 다 차면 방장이 '경기 시작!'을 누른다. */
export const myId = Math.random().toString(36).slice(2, 10);
export const TEAM_NAME = ['A팀', 'B팀'];
const perTeam = () => (room.mode === '2v2' ? 2 : 1);
export const capacity = () => perTeam() * 2;

export function enterRoom(code, host, mode = null) {
  if (IS_MOBILE) { hud.toast(MOBILE_MSG, 2600); return; }
  initAudio();
  playUI('click');
  const nick = myNick();
  leaveRoom();
  const me = { id: myId, nick, host, at: Date.now(), look: myEquip(), title: myTitle(), titleX: myNemesis(), ...(account.loggedIn ? { pid: account.player.id } : { guest: true }), ...(host ? { mode } : {}) };
  room = {
    code, host, me, mode, members: [], hostM: host ? me : null,
    teams: {}, // id → { team, at }  (at = 팀을 고른 시각: 같은 자리를 동시에 누르면 먼저 누른 사람이 이김)
    inGame: false, players: null, result: '',
    h2h: {}, // 상대 pid → { wins, losses } (1v1 상대 전적)
    pings: [], pingN: 0, offset: 0, sawHost: host, timer: 0,
    watchOk: true, // 방장: 관전 허용 (대기실에서 끌 수 있음)
  };
  room.link = joinRoom(code, me, {
    onMsg: onRoomMsg,
    onMembers: onMembers,
    onStatus: (st, text) => {
      if (!room) return;
      if (st === 'error') { leaveRoom(); show('lobby'); hud.toast(text, 3000); }
    },
  });
  // 참가자 PC: 방장과 시계 맞추기
  room.timer = setInterval(() => {
    if (!room || room.host || !room.hostM) return;
    room.link.send({ k: 'ping', n: ++room.pingN, t1: performance.now() / 1000, from: myId, to: room.hostM.id });
  }, 700);
  if (!host) {
    setTimeout(() => {
      if (room && room.code === code && !room.sawHost) {
        leaveRoom();
        show('join');
        $('join-msg').textContent = `'${code}' 방을 찾을 수 없어요. 코드를 다시 확인해 주세요.`;
      }
    }, 5000);
  }
  renderRoom();
  show('room');
  announceRoom();
}

export function leaveRoom() {
  if (!room) return;
  clearInterval(room.timer);
  room.link.leave();
  room = null;
  stopGame();
  syncLobby();
}

function onMembers(list) {
  if (!room) return;
  list = [...list].sort((a, b) => a.at - b.at);
  // 서버는 입장 직후 '나를 빼고' 목록을 먼저 보낼 수 있다. 내가 목록에 들어올 때까지 기다린다
  if (!list.some((m) => m.id === myId)) return;
  const host = list.find((m) => m.host);
  if (host) {
    room.sawHost = true;
    room.mode = host.mode || '1v1';
  }
  if (!room.host && room.sawHost && !host) {
    leaveRoom();
    show('lobby');
    hud.toast('방장이 방을 나갔어요', 2600);
    return;
  }
  // 방장을 아직 못 봤으면(모드를 모르면) 정원 확인은 미룬다
  let kept = list;
  if (host) {
    // 방장 + 먼저 들어온 사람부터 정원까지 (늦게 온 사람은 나간다)
    const guests = list.filter((m) => !m.host);
    kept = [host, ...guests.slice(0, capacity() - 1)];
    if (!kept.some((m) => m.id === myId)) {
      const msg = `방이 가득 찼어요 (${room.mode} 방은 ${capacity()}명까지)`;
      leaveRoom();
      show('join');
      $('join-msg').textContent = msg;
      return;
    }
  }
  const before = new Set(room.members.map((m) => m.id));
  const after = new Set(kept.map((m) => m.id));
  const gone = room.members.filter((m) => !after.has(m.id));
  const joined = kept.filter((m) => !before.has(m.id) && m.id !== myId);
  room.members = kept;
  room.hostM = host || null;
  for (const m of gone) delete room.teams[m.id];
  // 경기 중인 선수가 나가면 경기 끝내고 대기실로
  const goneP = room.inGame && room.players ? gone.find((m) => room.players.some((p) => p.id === m.id)) : null;
  if (goneP) {
    backToRoom();
    hud.toast(`${goneP.nick}님이 나가서 경기가 끝났어요`, 2800);
  }
  if (joined.length) {
    playUI('point');
    sendState(); // 새로 온 사람에게 내 팀을 알려 준다
  }
  renderRoom();
  announceRoom();
}

// 내 팀 선택을 모두에게 알린다
function sendState() {
  if (!room) return;
  const t = room.teams[myId];
  room.link.send({ k: 'st', id: myId, team: t ? t.team : null, at: t ? t.at : 0 });
}

// 팀에 들어온 순서대로 (먼저 고른 사람이 1번)
function teamList(team) {
  return room.members
    .filter((m) => room.teams[m.id] && room.teams[m.id].team === team)
    .sort((a, b) => room.teams[a.id].at - room.teams[b.id].at || (a.id < b.id ? -1 : 1));
}

// 같은 자리를 동시에 누르면: 늦게 누른 사람(나)은 스스로 빠진다
function resolveOverflow() {
  const mine = room.teams[myId];
  if (!mine || !room.mode) return;
  const idx = teamList(mine.team).findIndex((m) => m.id === myId);
  if (idx >= perTeam()) {
    delete room.teams[myId];
    sendState();
    hud.toast(`${TEAM_NAME[mine.team]} 자리가 방금 찼어요`, 2200);
  }
}

// 팀 고르기 / 바꾸기 / (내 팀을 다시 누르면) 빠지기
function pickTeam(team) {
  if (!room || room.inGame || !room.mode) return;
  initAudio();
  playUI('click');
  const cur = room.teams[myId];
  if (cur && cur.team === team) {
    delete room.teams[myId];
  } else {
    if (teamList(team).length >= perTeam()) { hud.toast(`${TEAM_NAME[team]}은 꽉 찼어요`); return; }
    room.teams[myId] = { team, at: Date.now() };
  }
  sendState();
  renderRoom();
}

function isFull() {
  return room.members.length === capacity() && teamList(0).length === perTeam() && teamList(1).length === perTeam();
}

// 방장: 경기 시작 버튼
function pressStart() {
  if (!room || !room.host || room.inGame) return;
  if (!isFull()) { hud.toast('아직 자리가 다 차지 않았어요'); return; }
  const players = [];
  for (const team of [0, 1]) teamList(team).forEach((m, slot) => players.push({ id: m.id, side: team, slot }));
  startOnline(room.mode, players);
}

function onRoomMsg(m) {
  if (!room) return;
  if (m.to && m.to !== myId) return;
  switch (m.k) {
    case 'st':
      if (room.inGame) break;
      if (m.team == null) delete room.teams[m.id];
      else room.teams[m.id] = { team: m.team, at: m.at };
      resolveOverflow();
      renderRoom();
      break;
    case 'sw': // 다른 사람의 연습 스윙
      if (!room.inGame && ['perfect', 'good', 'block'].includes(m.g)) practiceSwing(m.id, m.g);
      break;
    case 'go': {
      if (room.host) break;
      const p = m.players.find((x) => x.id === myId);
      if (!p) break;
      startGuestGame(m.mode, m.players, p, m.mid);
      break;
    }
    case 'skip': // 경기 전 연출 건너뛰기 (선수 모두가 누르면 넘어감)
      addSkip(m.from);
      break;
    case 'ping':
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
      renderPing();
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
      else if (m.kind === 'swing') match.swing(p.side, m.t, m.dir, m.up, p.slot || 0, performance.now() / 1000); // 도착 시각: 늦게 왔으면 공 출발을 늦춤
      break;
    }
  }
}

function nickOf(id) {
  return room.members.find((m) => m.id === id)?.nick || '상대';
}
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
  for (const p of room.players) out[p.side][p.slot || 0] = room.members.find((m) => m.id === p.id)?.look || {};
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
  if (mid) matchJoin(mid, mode, mine.side);
  room.result = '';
  room.coins = null;
  room.score = [0, 0];
  stopGame();
  crowdJoin(room.code); // 관중 수·응원 듣기 (명단엔 안 들어감)
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
    isRemote: (side, slot) => !(side === mine.side && slot === (mine.slot || 0)),
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
    },
  }));
  game.offset = room.offset;
  hud.stats(game.stats);
  startIntro(players, mine.side, mode);
}

// 경기가 끝나면 대기실로. 팀 선택은 모두 초기화 (다시 할 사람만 팀을 다시 고른다)
export function backToRoom() {
  if (!room) return;
  room.inGame = false;
  room.players = null;
  room.teams = {};
  stopGame();
  renderRoom();
  show('room');
  announceRoom();
  if (room.coins) playUI('coin');
}

function renderPing() {
  const el = $('room-ping');
  if (!room || room.host || room.rtt == null) { el.textContent = ''; return; }
  el.textContent = `연결 지연 ${Math.round((room.rtt / 2) * 1000)}ms`;
}

/* ───────── 전적 ───────── */
// 경기가 끝나면 내 PC가 내 결과만 기록한다. 1v1이면 상대의 선수 번호(pid)도 함께 (상대 전적)
export async function saveResult(mode, win, stats, achStats) {
  if (!account.loggedIn) return;
  const r0 = room;
  const mid = r0?.mid;
  const opp = mode === '1v1' ? oppMember() : null;
  const bonus = { perfect3: stats.perfect3, rally10: stats.rally10 };
  const r = mid ? await matchFinish(mid, win, bonus) : { status: 'no_match' };
  if (r.status === 'ok') {
    if (opp?.pid && r.h2h && r0) r0.h2h[opp.pid] = r.h2h;
    if (r.coins && r0) r0.coins = r.coins;
    if (room === r0) {
      renderRoom();
      if (r.coins && !room.inGame) playUI('coin');
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

// 방금 경기에서 받은 코인 (대기실 결과 아래)
function renderCoins() {
  const el = $('room-coins');
  const c = room.result && room.coins;
  if (!room.result) el.innerHTML = '';
  else if (!account.loggedIn) el.innerHTML = '<small>로그인하면 경기마다 코인을 모을 수 있어요</small>';
  else if (!c) el.innerHTML = '<small>코인 정산 중…</small>';
  else el.innerHTML = `<b><i class="coin-dot"></i> +${c.total} 코인</b><small>${c.items.map((i) => `${esc(i.label)}${i.coins ? ` +${i.coins}` : ""}`).join(' · ')}</small>`;
}

// 1v1 방의 상대 (나 말고 다른 한 사람)
const oppMember = () => (room ? room.members.find((m) => m.id !== myId) : null);

function renderH2H() {
  const el = $('room-h2h');
  const opp = room.mode === '1v1' ? oppMember() : null;
  if (!opp) { el.innerHTML = ''; return; }
  const name = `<b>${esc(opp.nick)}</b>님`;
  if (!account.loggedIn || !opp.pid) {
    el.innerHTML = `${ic('swords')} ${name}과의 상대 전적은 남지 않아요 (손님)`;
    return;
  }
  const h = room.h2h[opp.pid];
  if (h === undefined) {
    room.h2h[opp.pid] = null; // 불러오는 중
    getH2H(opp.pid).then((v) => { if (room) { room.h2h[opp.pid] = v || false; renderRoom(); } });
  }
  if (h === false) el.innerHTML = ''; // 불러오기 실패
  else if (!h) el.innerHTML = `${ic('swords')} ${name}과의 상대 전적 불러오는 중…`;
  else if (h.wins + h.losses === 0) el.innerHTML = `${ic('swords')} ${name}과는 첫 대결이에요!`;
  else el.innerHTML = `${ic('swords')} ${name}과의 상대 전적 <em>${h.wins}승 ${h.losses}패</em>`;
}

function renderRoom() {
  if (!room) return;
  renderH2H();
  $('room-code').textContent = room.code;
  $('room-mode').innerHTML = room.mode
    ? `${room.mode === '2v2' ? '2 대 2' : '1 대 1'} 방 <b>${room.members.length}/${capacity()}명</b>`
    : '방 정보를 불러오는 중…';
  $('room-result').textContent = room.result;
  $('room-result').classList.toggle('hidden', !room.result);
  $('btn-room-lobby').classList.toggle('hidden', !room.result);
  renderCoins();

  // 자리 칸 (안 B): A1 A2 | VS | B1 B2. 칸 바로 위에 그 선수의 3D 캐릭터가 선다 (stageFrame)
  const n = room.mode ? perTeam() : 1;
  const myTeam = room.teams[myId]?.team;
  stage.seats = [];
  for (const team of [0, 1]) {
    const ms = teamList(team).slice(0, n);
    let html = '';
    for (let i = 0; i < n; i++) {
      const m = ms[i];
      stage.seats.push({ team, slot: i, m: m || null });
      const num = n > 1 ? `${TEAM_NAME[team]} ${i + 1}번` : TEAM_NAME[team];
      if (!m) {
        const locked = !room.mode || room.inGame;
        const go = myTeam === team ? '' : `<span class="go">${TEAM_NAME[team]}으로 ▸</span>`;
        html += `<div class="slot empty${locked ? ' locked' : ''}" data-team="${team}"><b>${num} · 빈자리</b>${go}</div>`;
        continue;
      }
      const me = m.id === myId;
      const tags = [num, m.host ? `${ic('crown')} 방장` : '', m.guest ? '손님' : '', me ? '나' : ''].filter(Boolean);
      html += `<div class="slot${me ? ' me' : ''}" data-team="${team}"${me ? ' title="누르면 팀에서 빠져요"' : ''}><b>${esc(m.nick)}</b><span>${tags.join(' · ')} <i>✓</i></span>${me ? '<span class="out">누르면 빠지기</span>' : ''}</div>`;
    }
    $(`team-${team}`).innerHTML = html;
  }
  const none = room.members.filter((m) => !room.teams[m.id]);
  $('room-members').innerHTML = none.length ? `팀 고르는 중${none.map((m) => `<b>${esc(m.nick)}${m.id === myId ? '(나)' : ''}</b>`).join('')}` : '';
  renderStageLabels();
  $('room-hint').innerHTML = room.teams[myId] ? `${ic('swipe')} 화면을 누른 채 위로 밀면 연습 스윙!` : `${ic('down')} 아래 빈 칸을 눌러 팀을 골라 주세요`;
  // 배경은 방장 것이 모두에게 보인다 (방장이 바꾸면 다음 입장부터)
  const bgIt = equipped(room.hostM?.look, 'bg'), ballIt = equipped(room.hostM?.look, 'ball');
  const ballTxt = ballIt.grade === 'default' ? '' : ` · ${ic('ball')} ${esc(ballIt.name)}`; // 탁구공도 방장 것
  $('room-bg').innerHTML = `${ic('image')} ${esc(bgIt.name)}${ballTxt} · ${room.host ? '내 꾸미기' : '방장 꾸미기'}`;

  const full = room.mode && isFull();
  $('btn-start').classList.toggle('hidden', !room.host);
  $('btn-watch-ok').classList.toggle('hidden', !room.host);
  $('btn-watch-ok').innerHTML = room.watchOk ? `${ic('eye')} 관전 허용` : `${ic('eyeOff')} 관전 막음`;
  $('btn-watch-ok').classList.toggle('off', !room.watchOk);
  $('btn-start').disabled = !full;
  let tip;
  if (!room.mode) tip = '방장을 찾는 중…';
  else if (room.members.length < capacity()) tip = `친구에게 방 코드를 알려 주세요 (${capacity()}명이 모여야 해요)`;
  else if (!full) tip = '팀을 고르면 준비 완료예요. 팀은 언제든 바꿀 수 있어요';
  else tip = room.host ? '모두 준비됐어요! 경기 시작을 눌러 주세요' : '방장이 시작하기를 기다리는 중…';
  $('room-tip').textContent = tip;
  renderPing();
}
$('btn-join').addEventListener('click', () => {
  if (IS_MOBILE) { hud.toast(MOBILE_MSG, 2600); return; }
  playUI('click');
  $('join-msg').textContent = '';
  $('join-code').value = '';
  show('join');
  $('join-code').focus();
  renderCodeBoxes();
});
// 방 코드 4칸: 보이지 않는 입력칸 위에 글자를 한 칸씩 그려 준다
function renderCodeBoxes() {
  const v = $('join-code').value;
  const focus = document.activeElement === $('join-code');
  $('code-boxes').querySelectorAll('span').forEach((el, i) => {
    el.textContent = v[i] || '';
    el.classList.toggle('now', focus && i === Math.min(v.length, 3));
  });
}
$('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); $('join-msg').textContent = ''; renderCodeBoxes(); });
$('join-code').addEventListener('focus', renderCodeBoxes);
$('join-code').addEventListener('blur', renderCodeBoxes);
const doJoin = () => {
  const code = normalizeCode($('join-code').value);
  if (code.length !== 4) { $('join-msg').textContent = '4자리 코드를 입력해 주세요'; return; }
  enterRoom(code, false);
};
$('btn-join-go').addEventListener('click', doJoin);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
$('btn-join-cancel').addEventListener('click', () => { playUI('click'); show('lobby'); });
$('btn-start').addEventListener('click', () => { initAudio(); playUI('click'); pressStart(); });
// 방장: 관전 허용 켜기/끄기 (로비 방 목록에 바로 반영)
$('btn-watch-ok').addEventListener('click', () => {
  if (!room || !room.host) return;
  playUI('click');
  room.watchOk = !room.watchOk;
  renderRoom();
  announceRoom();
  hud.toast(room.watchOk ? '이제 다른 사람이 경기를 구경할 수 있어요' : '이제 아무도 경기를 구경할 수 없어요', 2200);
});
// 자리 칸 누르기: 빈자리 = 그 팀으로 (바꾸기), 내 칸 = 팀에서 빠지기
for (const team of [0, 1]) {
  $(`team-${team}`).addEventListener('click', (e) => {
    const el = e.target.closest('.slot');
    if (!el || el.classList.contains('locked')) return;
    if (el.classList.contains('empty') || el.classList.contains('me')) pickTeam(team);
  });
}
const leaveToLobby = () => { playUI('click'); leaveRoom(); show('lobby'); };
$('btn-room-leave').addEventListener('click', leaveToLobby);
$('btn-room-lobby').addEventListener('click', leaveToLobby); // 경기가 끝난 뒤 결과 아래에도
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(room.code); hud.toast('코드를 복사했어요'); } catch {}
});
