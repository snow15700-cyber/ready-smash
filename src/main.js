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
    $('scoreboard').innerHTML = `<small>나</small> ${s[me]} : ${s[op]} <small>${esc(game.names[op])}</small>${deuce ? ' <em>듀스!</em>' : ''}`;
  },
  stats(st) {
    if (!game) return;
    if (game.mode === 'wall') $('stats').innerHTML = `랠리<br><b>${st.rally}</b><br>최고 ${st.best} · Perfect ${st.perfects}`;
    else $('stats').innerHTML = `랠리<br><b>${st.rally}</b>`;
  },
  hint(text) { $('hint').textContent = text; },
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
      toss: (side, t, x) => match.toss(side, t, x),
      swing: (side, t, dir, isSwing) => match.swing(side, t, dir, isSwing),
    },
  });
  match = new Match({ mode: 'wall', emit: (ev) => game.onEvent(ev) });
  hud.stats(game.stats);
  match.start(performance.now() / 1000);
}

/* ───────── 온라인 방 (1v1 / 2v2) ───────── */
const myId = Math.random().toString(36).slice(2, 10);
const MAX_MEMBERS = 4;
const TEAM_NAME = ['A팀', 'B팀'];

function enterRoom(code, host) {
  initAudio();
  playUI('click');
  const nick = saveNick();
  leaveRoom();
  const me = { id: myId, nick, host, at: Date.now() };
  room = {
    code, host, me, members: [], hostM: host ? me : null,
    mode: '1v1', teams: {}, ready: {}, inGame: false, hostInGame: false, players: null, result: '',
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
  const host = list.find((m) => m.host);
  if (host) room.sawHost = true;
  if (!room.host && room.sawHost && !host) {
    leaveRoom();
    show('lobby');
    hud.toast('방장이 방을 나갔어요', 2600);
    return;
  }
  // 방장 + 먼저 들어온 3명까지만 (늦게 온 사람은 나간다)
  const guests = list.filter((m) => !m.host);
  const kept = [...(host ? [host] : []), ...guests.slice(0, MAX_MEMBERS - (host ? 1 : 0))];
  if (!kept.some((m) => m.id === myId)) {
    leaveRoom();
    show('join');
    $('join-msg').textContent = `방이 가득 찼어요 (최대 ${MAX_MEMBERS}명)`;
    return;
  }
  const before = new Set(room.members.map((m) => m.id));
  const after = new Set(kept.map((m) => m.id));
  const gone = room.members.filter((m) => !after.has(m.id));
  const joined = kept.filter((m) => !before.has(m.id) && m.id !== myId);
  room.members = kept;
  room.hostM = host || null;
  for (const m of gone) { delete room.ready[m.id]; delete room.teams[m.id]; }
  if (gone.length) room.pings = room.hostM ? room.pings : [];
  // 경기 중인 선수가 나가면 경기 끝내고 대기실로
  const goneP = room.inGame && room.players ? gone.find((m) => room.players.some((p) => p.id === m.id)) : null;
  if (goneP) {
    backToRoom();
    hud.toast(`${goneP.nick}님이 나가서 경기가 끝났어요`, 2800);
  }
  if (joined.length) {
    playUI('point');
    sendState();
    if (room.host) sendLobby();
  }
  renderRoom();
}

// 내 상태(준비·팀)를 모두에게 알린다
function sendState() {
  if (room) room.link.send({ k: 'st', id: myId, ready: !!room.ready[myId], team: room.teams[myId] ?? null });
}
// 방장: 방 설정(모드·경기 중 여부)을 알린다
function sendLobby() {
  if (room && room.host) room.link.send({ k: 'lobby', mode: room.mode, inGame: room.inGame });
}

function teamCount(team, exceptId) {
  return room.members.filter((m) => m.id !== exceptId && room.teams[m.id] === team).length;
}

function toggleReady() {
  if (!room || room.inGame) return;
  initAudio();
  playUI('click');
  if (!room.ready[myId] && room.mode === '2v2' && room.teams[myId] == null) {
    hud.toast('먼저 A팀이나 B팀을 골라 주세요');
    return;
  }
  room.ready[myId] = !room.ready[myId];
  sendState();
  renderRoom();
  maybeStart();
}

function pickTeam(team) {
  if (!room || room.inGame || room.mode !== '2v2') return;
  initAudio();
  playUI('click');
  if (room.teams[myId] === team) return;
  if (teamCount(team, myId) >= 2) { hud.toast(`${TEAM_NAME[team]}은 꽉 찼어요`); return; }
  room.teams[myId] = team;
  room.ready[myId] = false; // 팀을 바꾸면 준비는 다시
  sendState();
  renderRoom();
}

function setMode(mode) {
  if (!room || !room.host || room.inGame || room.mode === mode) return;
  initAudio();
  playUI('click');
  room.mode = mode;
  room.ready = {}; // 모드를 바꾸면 모두 준비 다시
  sendLobby();
  sendState();
  renderRoom();
}

// 방장: 시작 조건 확인
function startCheck() {
  const ms = room.members;
  const allReady = ms.every((m) => room.ready[m.id]);
  if (room.mode === '1v1') {
    if (ms.length < 2) return { ok: false, tip: room.host ? '친구에게 방 코드를 알려 주세요' : '방장을 찾는 중…' };
    if (ms.length > 2) return { ok: false, tip: `1v1은 2명일 때 시작해요 (지금 ${ms.length}명). 4명이면 2v2를 골라 보세요` };
    return { ok: allReady, tip: allReady ? '곧 시작해요!' : '둘 다 준비를 누르면 시작해요' };
  }
  if (ms.length < 4) return { ok: false, tip: `2v2는 4명이 필요해요 (지금 ${ms.length}명)` };
  if (teamCount(0) !== 2 || teamCount(1) !== 2) return { ok: false, tip: 'A팀 2명, B팀 2명으로 나눠 주세요' };
  return { ok: allReady, tip: allReady ? '곧 시작해요!' : '모두 준비를 누르면 시작해요' };
}

function maybeStart() {
  if (!room || !room.host || room.inGame) return;
  if (!startCheck().ok) return;
  if (room.mode === '1v1') startOnline();
  else start2v2();
}

function onRoomMsg(m) {
  if (!room) return;
  if (m.to && m.to !== myId) return;
  switch (m.k) {
    case 'st':
      room.ready[m.id] = m.ready;
      if (m.team == null) delete room.teams[m.id];
      else room.teams[m.id] = m.team;
      renderRoom();
      maybeStart();
      break;
    case 'lobby':
      if (room.host) break;
      room.hostInGame = m.inGame;
      if (m.mode !== room.mode) {
        room.mode = m.mode;
        room.ready = {}; // 모드가 바뀌면 모두 준비 다시
        sendState();
      }
      renderRoom();
      break;
    case 'go': {
      if (room.host) break;
      const p = m.players.find((x) => x.id === myId);
      if (!p) break; // 내가 선수가 아니면 대기실에 남는다
      if (m.mode === '1v1') startGuestGame(m.players, p.side);
      else on2v2Go(m.players);
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
      if (m.kind === 'toss') match.toss(p.side, m.t, m.x);
      else if (m.kind === 'swing') match.swing(p.side, m.t, m.dir, m.up);
      break;
    }
  }
}

function nickOf(id) {
  return room.members.find((m) => m.id === id)?.nick || '상대';
}
function names() {
  const bySide = (s) => room.players.find((p) => p.side === s);
  return [nickOf(bySide(0)?.id), nickOf(bySide(1)?.id)];
}

function beginRoomGame(players) {
  room.inGame = true;
  room.players = players;
  room.ready = {};
  room.result = '';
  stopGame();
}

// 방장: 1v1 경기 시작
function startOnline() {
  const other = room.members.find((m) => m.id !== myId);
  const players = [{ id: myId, side: 0 }, { id: other.id, side: 1 }];
  beginRoomGame(players);
  room.link.send({ k: 'go', mode: '1v1', players });
  sendLobby();
  show('hud');
  game = new Game(world, {
    mySide: 0, mode: '1v1', hud, names: names(),
    send: {
      toss: (side, t, x) => match.toss(side, t, x),
      swing: (side, t, dir, up) => match.swing(side, t, dir, up),
    },
  });
  match = new Match({
    mode: '1v1',
    remoteSides: [1],
    emit: (ev) => {
      if (game) game.onEvent(ev);
      if (room) room.link.send({ k: 'ev', ev });
    },
  });
  hud.stats(game.stats);
  hud.toast('경기 시작! 5점 먼저 내면 승리', 1600);
  match.start(performance.now() / 1000);
}

// 참가자 PC: 방장의 시작 신호를 받으면 경기 화면으로
function startGuestGame(players, side) {
  beginRoomGame(players);
  show('hud');
  game = new Game(world, {
    mySide: side, mode: '1v1', hud, names: names(), authority: false,
    send: {
      toss: (s, t, x) => room && room.link.send({ k: 'in', kind: 'toss', t, x, from: myId }),
      swing: (s, t, dir, up) => room && room.link.send({ k: 'in', kind: 'swing', t, dir, up, from: myId }),
    },
  });
  game.offset = room.offset;
  hud.stats(game.stats);
  hud.toast('경기 시작! 5점 먼저 내면 승리', 1600);
}

// 방장: 2v2 시작 (1단계: 팀 확정까지만. 경기 화면은 2단계에서)
// slot: 팀 안에서 0 = 1번(A1/B1), 1 = 2번(A2/B2). 먼저 들어온 사람이 1번
function start2v2() {
  const players = [];
  for (const team of [0, 1]) {
    room.members.filter((m) => room.teams[m.id] === team).forEach((m, slot) => players.push({ id: m.id, side: team, slot }));
  }
  room.link.send({ k: 'go', mode: '2v2', players });
  on2v2Go(players);
}

function on2v2Go(players) {
  playUI('point');
  const label = (p) => `${TEAM_NAME[p.side][0]}${p.slot + 1} ${nickOf(p.id)}`;
  room.result = `✅ 팀 확정! ${players.filter((p) => p.side === 0).map(label).join(', ')} vs ${players.filter((p) => p.side === 1).map(label).join(', ')}`;
  room.ready = {};
  hud.toast('2v2 경기 화면은 다음 단계에서 만들어요', 2600);
  sendState();
  renderRoom();
}

function backToRoom() {
  if (!room) return;
  room.inGame = false;
  room.players = null;
  room.ready = {};
  stopGame();
  renderRoom();
  show('room');
  sendState();
  sendLobby();
}

function renderPing() {
  const el = $('room-ping');
  if (!room || room.host || room.rtt == null) { el.textContent = ''; return; }
  el.textContent = `연결 지연 ${Math.round((room.rtt / 2) * 1000)}ms`;
}

function renderRoom() {
  if (!room) return;
  $('room-code').textContent = room.code;
  $('room-result').textContent = room.result;
  $('room-result').classList.toggle('hidden', !room.result);

  // 모드 고르기 (방장만 바꿀 수 있음)
  for (const b of document.querySelectorAll('#mode-pick button')) {
    b.classList.toggle('on', b.dataset.mode === room.mode);
    b.disabled = !room.host || room.inGame;
  }
  $('mode-pick-note').textContent = room.host ? '' : '모드는 방장이 정해요';

  const row = (m) => {
    const r = room.ready[m.id];
    return `<li><span>${m.host ? '방장' : '참가자'}${m.id === myId ? ' (나)' : ''}</span><b>${esc(m.nick)}</b><i class="${r ? 'on' : ''}">${r ? '준비 완료' : '준비 전'}</i></li>`;
  };
  const empty = (text = '기다리는 중…') => `<li class="empty"><span></span><b>${text}</b></li>`;
  const is2v2 = room.mode === '2v2';
  $('teams').classList.toggle('hidden', !is2v2);
  if (is2v2) {
    for (const team of [0, 1]) {
      const ms = room.members.filter((m) => room.teams[m.id] === team);
      $(`team-${team}`).innerHTML = ms.map(row).join('') + empty().repeat(Math.max(0, 2 - ms.length));
      const btn = $(`btn-team-${team}`);
      const mine = room.teams[myId] === team;
      btn.textContent = mine ? `${TEAM_NAME[team]} ✔` : `${TEAM_NAME[team]} 고르기`;
      btn.classList.toggle('on', mine);
      btn.disabled = room.inGame || (!mine && ms.length >= 2);
    }
    const none = room.members.filter((m) => room.teams[m.id] == null);
    $('room-members').innerHTML = none.length ? none.map(row).join('') : '';
    $('room-members-title').textContent = none.length ? '아직 팀을 안 고른 사람' : '';
  } else {
    $('room-members').innerHTML = room.members.map(row).join('') + empty().repeat(Math.max(0, 2 - room.members.length));
    $('room-members-title').textContent = '';
  }

  const myReady = !!room.ready[myId];
  $('btn-ready').textContent = myReady ? '준비 취소' : '준비!';
  $('btn-ready').classList.toggle('on', myReady);
  const watching = !room.host && room.hostInGame && !room.inGame;
  $('room-tip').textContent = watching ? '지금 다른 사람들이 경기 중이에요. 끝나면 같이 할 수 있어요' : startCheck().tip;
  renderPing();
}


/* ───────── 버튼 ───────── */
$('btn-wall').addEventListener('click', startWall);
$('btn-create').addEventListener('click', () => enterRoom(makeCode(), true));
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
$('btn-ready').addEventListener('click', toggleReady);
for (const b of document.querySelectorAll('#mode-pick button')) b.addEventListener('click', () => setMode(b.dataset.mode));
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
    world.chars[0].setOpacity(1, 1);
    world.chars[1].group.visible = true;
  }
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__smash = { world, get game() { return game; }, get match() { return match; }, get room() { return room; } };
