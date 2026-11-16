import { createWorld } from './scene.js';
import { Game } from './game.js';
import { Match } from './match.js';
import { initAudio, playUI } from './audio.js';
import { ONLINE, joinRoom, makeCode, normalizeCode } from './net.js';

const $ = (id) => document.getElementById(id);
const world = createWorld($('c'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NICK_KEY = 'smash-nick';
try { $('nick').value = localStorage.getItem(NICK_KEY) || ''; } catch {}
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

/* ───────── 1v1 온라인 ───────── */
const myId = Math.random().toString(36).slice(2, 10);

function enterRoom(code, host) {
  initAudio();
  playUI('click');
  const nick = saveNick();
  leaveRoom();
  const me = { id: myId, nick, host, at: Date.now() };
  room = {
    code, host, me, members: [], peer: null, ready: {}, inGame: false, result: '',
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
  // 상대 PC: 방장과 시계 맞추기
  room.timer = setInterval(() => {
    if (!room || room.host || !room.peer) return;
    room.link.send({ k: 'ping', n: ++room.pingN, t1: performance.now() / 1000, to: room.peer.id });
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
  const guests = list.filter((m) => !m.host);
  if (!room.host && guests.length > 1 && guests[0].id !== myId && host) {
    leaveRoom();
    show('join');
    $('join-msg').textContent = '방이 가득 찼어요 (1v1은 2명까지)';
    return;
  }
  const peer = room.host ? guests[0] || null : host || null;
  const hadPeer = room.peer;
  room.peer = peer;
  room.members = list;
  if (hadPeer && (!peer || peer.id !== hadPeer.id)) {
    room.ready = {};
    room.pings = [];
    if (room.inGame) {
      backToRoom();
      hud.toast('상대가 나갔어요', 2600);
    }
  }
  if (peer && (!hadPeer || hadPeer.id !== peer.id)) {
    playUI('point');
    sendReady();
  }
  renderRoom();
}

function sendReady() {
  if (room) room.link.send({ k: 'ready', id: myId, ready: !!room.ready[myId] });
}

function toggleReady() {
  if (!room || room.inGame) return;
  initAudio();
  playUI('click');
  room.ready[myId] = !room.ready[myId];
  sendReady();
  renderRoom();
  maybeStart();
}

function maybeStart() {
  if (!room || !room.host || room.inGame || !room.peer) return;
  if (room.ready[myId] && room.ready[room.peer.id]) startOnline();
}

function onRoomMsg(m) {
  if (!room) return;
  if (m.to && m.to !== myId) return;
  switch (m.k) {
    case 'ready':
      room.ready[m.id] = m.ready;
      renderRoom();
      maybeStart();
      break;
    case 'ping':
      if (room.host) room.link.send({ k: 'pong', n: m.n, t1: m.t1, th: performance.now() / 1000, to: m.from || room.peer?.id });
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
      if (room.host) break;
      if (m.ev.type === 'start') startGuestGame(m);
      if (game) game.onEvent(m.ev);
      break;
    case 'in':
      if (!room.host || !match) break;
      if (m.kind === 'toss') match.toss(1, m.t, m.x);
      else if (m.kind === 'swing') match.swing(1, m.t, m.dir, m.up);
      break;
  }
}

function names() {
  const host = room.host ? room.me : room.peer;
  const guest = room.host ? room.peer : room.me;
  return [host?.nick || '방장', guest?.nick || '상대'];
}

// 방장: 경기 시작
function startOnline() {
  room.inGame = true;
  room.ready = {};
  room.result = '';
  stopGame();
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

// 상대 PC: 방장의 시작 신호를 받으면 경기 화면으로
function startGuestGame() {
  room.inGame = true;
  room.ready = {};
  room.result = '';
  stopGame();
  show('hud');
  game = new Game(world, {
    mySide: 1, mode: '1v1', hud, names: names(), authority: false,
    send: {
      toss: (side, t, x) => room && room.link.send({ k: 'in', kind: 'toss', t, x }),
      swing: (side, t, dir, up) => room && room.link.send({ k: 'in', kind: 'swing', t, dir, up }),
    },
  });
  game.offset = room.offset;
  hud.stats(game.stats);
  hud.toast('경기 시작! 5점 먼저 내면 승리', 1600);
}

function backToRoom() {
  if (!room) return;
  room.inGame = false;
  room.ready = {};
  stopGame();
  renderRoom();
  show('room');
  sendReady();
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
  const host = room.host ? room.me : room.peer;
  const guest = room.host ? room.peer : room.me;
  const row = (m, label) => {
    if (!m) return `<li class="empty"><span>${label}</span><b>기다리는 중…</b></li>`;
    const r = room.ready[m.id];
    return `<li><span>${label}${m.id === myId ? ' (나)' : ''}</span><b>${esc(m.nick)}</b><i class="${r ? 'on' : ''}">${r ? '준비 완료' : '준비 전'}</i></li>`;
  };
  $('room-members').innerHTML = row(host, '방장') + row(guest, '상대');
  const myReady = !!room.ready[myId];
  $('btn-ready').textContent = myReady ? '준비 취소' : '준비!';
  $('btn-ready').classList.toggle('on', myReady);
  $('room-tip').textContent = !room.peer
    ? (room.host ? '친구에게 방 코드를 알려 주세요' : '방장을 찾는 중…')
    : (room.ready[myId] && room.ready[room.peer.id] ? '곧 시작해요!' : '둘 다 준비를 누르면 시작해요');
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
