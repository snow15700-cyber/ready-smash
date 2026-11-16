import { createWorld } from './scene.js';
import { Game } from './game.js';
import { Match } from './match.js';
import { initAudio, playUI } from './audio.js';
import { ONLINE, IS_TEST, joinRoom, makeCode, normalizeCode } from './net.js';

const $ = (id) => document.getElementById(id);
const world = createWorld($('c'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NICK_KEY = 'smash-nick';
try { $('nick').value = localStorage.getItem(NICK_KEY) || ''; } catch {}
if (IS_TEST) {
  const tag = document.createElement('div');
  tag.textContent = '🧪 테스트 버전';
  tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:4px 12px;border-radius:999px;background:#ffcc00;color:#222;font:bold 13px sans-serif;pointer-events:none;';
  document.body.appendChild(tag);
}
if (!ONLINE) $('mode-note').textContent = '⚠️ 서버 설정이 없어 로컬 테스트 모드예요 (같은 브라우저의 탭끼리만 연결)';

const GRADE_TEXT = { perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD', block: 'BLOCK', miss: 'MISS' };
let toastTimer = 0;

const hud = {
  score(s, deuce) {
    if (!game) return;
    const me = game.mySide, op = 1 - me;
    $('scoreboard').innerHTML = `<small>${game.mode === '2v2' ? '우리 팀' : '나'}</small> ${s[me]} : ${s[op]} <small>${esc(game.names[op])}</small>${deuce ? ' <em>듀스!</em>' : ''}`;
  },
  stats(st) {
    if (!game) return;
    if (game.mode === 'wall') $('stats').innerHTML = `랠리<br><b>${st.rally}</b><br>최고 ${st.best} · Perfect ${st.perfects}`;
    else $('stats').innerHTML = `랠리<br><b>${st.rally}</b>`;
  },
  hint(text) { $('hint').textContent = text; },
  turn(text) {
    const el = $('turn');
    el.className = '';
    void el.offsetWidth; // 애니메이션 다시 시작
    el.textContent = text;
    el.className = 'show';
  },
  judge(grade, text) {
    const el = $('judge');
    el.className = '';
    void el.offsetWidth; // 애니메이션 다시 시작
    el.textContent = text || GRADE_TEXT[grade];
    el.className = `show ${grade}`;
  },
  toast(text, ms = 1800) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  },
  gameOver(win, score) {
    const me = game.mySide;
    hud.toast(win ? `승리! ${score[me]} : ${score[1 - me]}` : `패배… ${score[me]} : ${score[1 - me]}`, 2600);
    if (room) {
      room.result = win ? `🏆 승리! ${score[me]} : ${score[1 - me]}` : `😢 패배 ${score[me]} : ${score[1 - me]}`;
      setTimeout(() => { if (room && room.inGame) backToRoom(); }, 2800);
    }
  },
};

let game = null;
let match = null;
let room = null;

function saveNick() {
  const n = $('nick').value.trim().slice(0, 10) || '플레이어';
  try { localStorage.setItem(NICK_KEY, n); } catch {}
  return n;
}

function show(screen) {
  for (const id of ['lobby', 'join', 'room']) $(id).classList.toggle('hidden', id !== screen);
  $('hud').classList.toggle('hidden', screen !== 'hud');
}

function stopGame() {
  if (game) game.destroy();
  game = null;
  match = null;
  $('hint').textContent = '';
  $('stats').textContent = '';
  $('scoreboard').textContent = '';
}

/* ───────── 혼자 벽치기 ───────── */
function startWall() {
  initAudio();
  playUI('click');
  saveNick();
  stopGame();
  show('hud');
  game = new Game(world, {
    mySide: 0,
    mode: 'wall',
    hud,
    send: {
      toss: (side, t, x, slot) => match.toss(side, t, x, slot),
      swing: (side, t, dir, isSwing, slot) => match.swing(side, t, dir, isSwing, slot),
    },
  });
  match = new Match({ mode: 'wall', emit: (ev) => game.onEvent(ev) });
  hud.stats(game.stats);
  match.start(performance.now() / 1000);
}

/* ───────── 온라인 방 (1v1 / 2v2) ─────────
   방장이 방을 만들 때 모드를 정한다 (presence의 mode). 참가자는 입장해서 팀만 고른다.
   팀을 고르면 준비 완료. 자리가 다 차면 방장이 '경기 시작!'을 누른다. */
const myId = Math.random().toString(36).slice(2, 10);
const TEAM_NAME = ['A팀', 'B팀'];
const perTeam = () => (room.mode === '2v2' ? 2 : 1);
const capacity = () => perTeam() * 2;

function enterRoom(code, host, mode = null) {
  initAudio();
  playUI('click');
  const nick = saveNick();
  leaveRoom();
  const me = { id: myId, nick, host, at: Date.now(), ...(host ? { mode } : {}) };
  room = {
    code, host, me, mode, members: [], hostM: host ? me : null,
    teams: {}, // id → { team, at }  (at = 팀을 고른 시각: 같은 자리를 동시에 누르면 먼저 누른 사람이 이김)
    inGame: false, players: null, result: '',
    pings: [], pingN: 0, offset: 0, sawHost: host, timer: 0,
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
}

function leaveRoom() {
  if (!room) return;
  clearInterval(room.timer);
  room.link.leave();
  room = null;
  stopGame();
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
    case 'go': {
      if (room.host) break;
      const p = m.players.find((x) => x.id === myId);
      if (!p) break;
      startGuestGame(m.mode, m.players, p);
      break;
    }
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
      else if (m.kind === 'swing') match.swing(p.side, m.t, m.dir, m.up, p.slot || 0);
      break;
    }
  }
}

function nickOf(id) {
  return room.members.find((m) => m.id === id)?.nick || '상대';
}
function playerNames() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = nickOf(p.id);
  return out;
}
// 쪽(팀)별 이름. 2v2는 'A1·A2'처럼 두 명을 이어서
function names() {
  const ofSide = (s) => room.players.filter((p) => p.side === s).sort((a, b) => (a.slot || 0) - (b.slot || 0));
  return [0, 1].map((s) => ofSide(s).map((p) => nickOf(p.id)).join('·') || '상대');
}

function beginRoomGame(players) {
  room.inGame = true;
  room.players = players;
  room.result = '';
  stopGame();
}

// 방장: 경기 시작 (1v1 / 2v2)
function startOnline(mode, players) {
  const mine = players.find((p) => p.id === myId);
  beginRoomGame(players);
  room.link.send({ k: 'go', mode, players });
  show('hud');
  game = new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(),
    send: {
      toss: (side, t, x, slot) => match.toss(side, t, x, slot),
      swing: (side, t, dir, up, slot) => match.swing(side, t, dir, up, slot),
    },
  });
  match = new Match({
    mode,
    isRemote: (side, slot) => !(side === mine.side && slot === (mine.slot || 0)),
    emit: (ev) => {
      if (game) game.onEvent(ev);
      if (room) room.link.send({ k: 'ev', ev });
    },
  });
  hud.stats(game.stats);
  hud.toast(mode === '2v2' ? '2v2 시작! A1 → B1 → A2 → B2 순서로 쳐요' : '경기 시작! 5점 먼저 내면 승리', 2000);
  match.start(performance.now() / 1000);
}

// 참가자 PC: 방장의 시작 신호를 받으면 경기 화면으로
function startGuestGame(mode, players, mine) {
  beginRoomGame(players);
  show('hud');
  game = new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), authority: false,
    send: {
      toss: (s, t, x) => room && room.link.send({ k: 'in', kind: 'toss', t, x, from: myId }),
      swing: (s, t, dir, up) => room && room.link.send({ k: 'in', kind: 'swing', t, dir, up, from: myId }),
    },
  });
  game.offset = room.offset;
  hud.stats(game.stats);
  hud.toast(mode === '2v2' ? '2v2 시작! A1 → B1 → A2 → B2 순서로 쳐요' : '경기 시작! 5점 먼저 내면 승리', 2000);
}

// 경기가 끝나면 대기실로. 팀 선택은 모두 초기화 (다시 할 사람만 팀을 다시 고른다)
function backToRoom() {
  if (!room) return;
  room.inGame = false;
  room.players = null;
  room.teams = {};
  stopGame();
  renderRoom();
  show('room');
}

function renderPing() {
  const el = $('room-ping');
  if (!room || room.host || room.rtt == null) { el.textContent = ''; return; }
  el.textContent = `연결 지연 ${Math.round((room.rtt / 2) * 1000)}ms`;
}

function renderRoom() {
  if (!room) return;
  $('room-code').textContent = room.code;
  $('room-mode').textContent = room.mode ? `${room.mode} 방 · ${room.members.length}/${capacity()}명` : '방 정보를 불러오는 중…';
  $('room-result').textContent = room.result;
  $('room-result').classList.toggle('hidden', !room.result);

  const row = (m, inTeam, i) => `<li><span>${inTeam && room.mode === '2v2' ? `${i + 1}번 · ` : ''}${m.host ? '방장' : '참가자'}${m.id === myId ? ' (나)' : ''}</span><b>${esc(m.nick)}</b>${inTeam ? '<i class="on">준비 완료</i>' : ''}</li>`;
  const empty = '<li class="empty"><span></span><b>빈자리</b></li>';
  const n = room.mode ? perTeam() : 0;
  for (const team of [0, 1]) {
    const ms = teamList(team).slice(0, n);
    $(`team-${team}`).innerHTML = ms.map((m, i) => row(m, true, i)).join('') + empty.repeat(Math.max(0, n - ms.length));
    const btn = $(`btn-team-${team}`);
    const mine = room.teams[myId] && room.teams[myId].team === team;
    btn.textContent = mine ? '팀에서 빠지기' : `${TEAM_NAME[team]}으로`;
    btn.classList.toggle('on', !!mine);
    btn.disabled = !room.mode || room.inGame || (!mine && ms.length >= n);
  }
  const none = room.members.filter((m) => !room.teams[m.id]);
  $('room-members').innerHTML = none.map((m) => row(m, false)).join('');
  $('room-members-title').textContent = none.length ? '아직 팀을 안 고른 사람' : '';

  const full = room.mode && isFull();
  $('btn-start').classList.toggle('hidden', !room.host);
  $('btn-start').disabled = !full;
  let tip;
  if (!room.mode) tip = '방장을 찾는 중…';
  else if (room.members.length < capacity()) tip = `친구에게 방 코드를 알려 주세요 (${capacity()}명이 모여야 해요)`;
  else if (!full) tip = '팀을 고르면 준비 완료예요. 팀은 언제든 바꿀 수 있어요';
  else tip = room.host ? '모두 준비됐어요! 경기 시작을 눌러 주세요' : '방장이 시작하기를 기다리는 중…';
  $('room-tip').textContent = tip;
  renderPing();
}


/* ───────── 버튼 ───────── */
$('btn-wall').addEventListener('click', startWall);
$('btn-create-1v1').addEventListener('click', () => enterRoom(makeCode(), true, '1v1'));
$('btn-create-2v2').addEventListener('click', () => enterRoom(makeCode(), true, '2v2'));
$('btn-join').addEventListener('click', () => {
  playUI('click');
  saveNick();
  $('join-msg').textContent = '';
  $('join-code').value = '';
  show('join');
  $('join-code').focus();
});
$('join-code').addEventListener('input', (e) => { e.target.value = normalizeCode(e.target.value); });
const doJoin = () => {
  const code = normalizeCode($('join-code').value);
  if (code.length !== 4) { $('join-msg').textContent = '4자리 코드를 입력해 주세요'; return; }
  enterRoom(code, false);
};
$('btn-join-go').addEventListener('click', doJoin);
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
$('btn-join-cancel').addEventListener('click', () => { playUI('click'); show('lobby'); });
$('btn-start').addEventListener('click', () => { initAudio(); playUI('click'); pressStart(); });
$('btn-team-0').addEventListener('click', () => pickTeam(0));
$('btn-team-1').addEventListener('click', () => pickTeam(1));
$('btn-room-leave').addEventListener('click', () => { playUI('click'); leaveRoom(); show('lobby'); });
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(room.code); hud.toast('코드를 복사했어요'); } catch {}
});

function exitGame() {
  playUI('click');
  if (room) { leaveRoom(); show('lobby'); }
  else { stopGame(); show('lobby'); }
}
$('exit').addEventListener('click', exitGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game && !room) exitGame();
});
$('nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') startWall(); });

/* ───────── 매 프레임 ───────── */
function loop() {
  const now = performance.now() / 1000;
  // 내 스윙 판단을 먼저 끝내고 나서 경기 판정 (느린 PC에서도 늦게 친 공이 버려지지 않게)
  if (game) game.decideHit(now + game.offset);
  if (match) match.update(now);
  if (game) game.update(now + game.offset);
  else {
    // 로비 배경: 천천히 도는 카메라
    const a = now * 0.08;
    world.camera.position.set(Math.sin(a) * 4.2, 2.4, Math.cos(a) * 4.2);
    world.camera.lookAt(0, 0.8, 0);
    world.setBall([0, -1, 0], false);
    world.ring.visible = false;
    world.aim.visible = false;
    world.wall.visible = false;
    for (const side of [0, 1]) {
      world.team[side][0].group.visible = true;
      world.team[side][0].setOpacity(1, 1);
      world.team[side][1].group.visible = false;
    }
  }
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__smash = { world, get game() { return game; }, get match() { return match; }, get room() { return room; } };
