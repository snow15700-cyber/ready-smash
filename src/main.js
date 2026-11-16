import { createWorld, CHAR_Z } from './scene.js';
import { createLobbyDemo, LOBBY_CAM } from './lobbyDemo.js';
import { Game } from './game.js';
import { Match, AI_NAME } from './match.js';
import { initAudio, playUI, setEcho, setQuiet, setListener } from './audio.js';
import { ONLINE, IS_TEST, joinRoom, makeCode, normalizeCode } from './net.js';
import { account, autoLogin, login, signup, playAsGuest, logout, changePin, lastNick, cleanNick, validPin, recordMatch, finishMatch, claimDaily, aiStart, aiRally, loadShop, gacha, buyItem, equipItem, myEquip, testCoins, recordRally, getH2H, getRanking } from './account.js';

import { ITEMS, ITEM, POOLS, GRADES, CATS, GACHA_PRICE, PITY, DEFAULTS, applyLook, swatch, equipped } from './items.js';

const $ = (id) => document.getElementById(id);
const world = createWorld($('c'));
const lobbyDemo = createLobbyDemo();
const LOBBY_QUIET = 0.4; // 로비 배경 랠리 소리 크기 (경기 중 소리를 1로 볼 때)
// 브라우저는 사람이 한 번 누르기 전에는 소리를 못 낸다: 첫 클릭·키 입력에 소리를 켠다
const unlockAudio = () => { initAudio(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

if (IS_TEST) {
  const tag = document.createElement('div');
  tag.textContent = '🧪 테스트 버전';
  tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:4px 12px;border-radius:999px;background:#ffcc00;color:#222;font:bold 13px sans-serif;pointer-events:none;';
  document.body.appendChild(tag);
}
if (!ONLINE) $('mode-note').textContent = '⚠️ 서버 설정이 없어 로컬 테스트 모드예요 (같은 브라우저의 탭끼리만 연결)';
if (!ONLINE) $('login-offline').classList.remove('hidden');

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
    if (game.mode === 'ai') $('stats').innerHTML = `랠리<br><b>${st.rally}</b><br>최고 ${st.best} · Perfect ${st.perfects}${account.loggedIn ? `<br>🪙 +${aiCoins}` : ''}`;
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
      saveResult(room.mode, win, game.stats);
      room.result = win ? `🏆 승리! ${score[me]} : ${score[1 - me]}` : `😢 패배 ${score[me]} : ${score[1 - me]}`;
      setTimeout(() => { if (room && room.inGame) backToRoom(); }, 2800);
    }
  },
};

let game = null;
let match = null;
let room = null;
let preview = null; // 상점·옷장에서 미리보기 중인 꾸미기 { look } (null이면 로비 화면)

const myNick = () => account.nick || '플레이어';

const HOWTO_KEY = 'smash-howto-seen'; // 치는 방법 창을 본 적 있는지 (처음 온 사람에게 한 번 자동으로 띄움)
function show(screen) {
  if (screen === 'lobby') {
    renderMe();
    let seen = true;
    try { seen = !!localStorage.getItem(HOWTO_KEY); } catch { /* 저장 안 되는 브라우저: 띄우지 않음 */ }
    $('howto').classList.toggle('hidden', seen);
  }
  if (screen !== 'shop' && screen !== 'closet') preview = null;
  for (const id of ['login', 'pin-change', 'rank', 'lobby', 'join', 'room', 'shop', 'closet']) $(id).classList.toggle('hidden', id !== screen);
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

/* ───────── 혼자 하기 (AI 상대) ───────── */
const GUEST_BEST_KEY = 'smash-ai-best'; // 손님의 최고 랠리 기록 (이 브라우저에만)
const guestBest = () => { try { return +localStorage.getItem(GUEST_BEST_KEY) || 0; } catch { return 0; } };

let aiCoins = 0; // 이번 혼자 하기에서 받은 코인

function startAI() {
  initAudio();
  playUI('click');
  stopGame();
  aiCoins = 0;
  aiStart();
  show('hud');
  game = new Game(world, {
    mySide: 0,
    mode: 'ai',
    names: ['나', AI_NAME],
    hud,
    looks: [[myEquip()], [{}]],
    // 최고 기록: 로그인했으면 서버, 손님이면 이 브라우저에 저장
    best: account.loggedIn ? account.player.best_rally : guestBest(),
    onBest: (r) => {
      if (account.loggedIn) recordRally(r);
      else try { localStorage.setItem(GUEST_BEST_KEY, r); } catch {}
    },
    // 랠리가 끝날 때마다 친 횟수만큼 코인 (4번에 1코인, 서버가 계산)
    onRally: async (hits) => {
      const g = game;
      const got = await aiRally(hits);
      if (!got) return;
      aiCoins += got;
      if (game === g) { playUI('coin'); hud.stats(game.stats); }
    },
    send: {
      toss: (side, t, x, slot) => match.toss(side, t, x, slot),
      swing: (side, t, dir, isSwing, slot) => match.swing(side, t, dir, isSwing, slot),
    },
  });
  match = new Match({ mode: 'ai', emit: (ev) => game.onEvent(ev) });
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
  const nick = myNick();
  leaveRoom();
  const me = { id: myId, nick, host, at: Date.now(), look: myEquip(), ...(account.loggedIn ? { pid: account.player.id } : { guest: true }), ...(host ? { mode } : {}) };
  room = {
    code, host, me, mode, members: [], hostM: host ? me : null,
    teams: {}, // id → { team, at }  (at = 팀을 고른 시각: 같은 자리를 동시에 누르면 먼저 누른 사람이 이김)
    inGame: false, players: null, result: '',
    h2h: {}, // 상대 pid → { wins, losses } (1v1 상대 전적)
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
  setQuiet(game ? 1 : LOBBY_QUIET);
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
// 선수마다 꾸미기 (presence의 look). looks[side][slot]
function looks() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = room.members.find((m) => m.id === p.id)?.look || {};
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
  room.coins = null;
  stopGame();
}

// 방장: 경기 시작 (1v1 / 2v2)
function startOnline(mode, players) {
  const mine = players.find((p) => p.id === myId);
  beginRoomGame(players);
  room.link.send({ k: 'go', mode, players });
  show('hud');
  game = new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), looks: looks(),
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
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), looks: looks(), authority: false,
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
  if (room.coins) playUI('coin');
}

function renderPing() {
  const el = $('room-ping');
  if (!room || room.host || room.rtt == null) { el.textContent = ''; return; }
  el.textContent = `연결 지연 ${Math.round((room.rtt / 2) * 1000)}ms`;
}

/* ───────── 전적 ───────── */
// 경기가 끝나면 내 PC가 내 결과만 기록한다. 1v1이면 상대의 선수 번호(pid)도 함께 (상대 전적)
async function saveResult(mode, win, stats) {
  if (!account.loggedIn) return;
  const r0 = room;
  const opp = mode === '1v1' ? oppMember() : null;
  const bonus = { perfect3: stats.perfect3, rally10: stats.rally10 };
  let r = await finishMatch(mode, win, opp?.pid, bonus);
  // 서버에 코인 기능(04_coins.sql)이 아직 없으면 전적만이라도 저장 (10초 규칙이 두 번 저장을 막는다)
  if (r.status === 'error') r = await recordMatch(mode, win, opp?.pid);
  if (r.status === 'ok') {
    if (opp?.pid && r.h2h && r0) r0.h2h[opp.pid] = r.h2h;
    if (r.coins && r0) r0.coins = r.coins;
    if (room === r0) {
      renderRoom();
      if (r.coins && !room.inGame) playUI('coin');
    }
  } else if (r.status !== 'too_soon') hud.toast('전적을 저장하지 못했어요 (인터넷 연결 확인)', 2600);
}

// 방금 경기에서 받은 코인 (대기실 결과 아래)
function renderCoins() {
  const el = $('room-coins');
  const c = room.result && room.coins;
  if (!room.result) el.innerHTML = '';
  else if (!account.loggedIn) el.innerHTML = '<small>로그인하면 경기마다 코인을 모을 수 있어요</small>';
  else if (!c) el.innerHTML = '<small>코인 정산 중…</small>';
  else el.innerHTML = `<b>🪙 +${c.total} 코인</b><small>${c.items.map((i) => `${esc(i.label)} +${i.coins}`).join(' · ')}</small>`;
}

// 1v1 방의 상대 (나 말고 다른 한 사람)
const oppMember = () => (room ? room.members.find((m) => m.id !== myId) : null);

function renderH2H() {
  const el = $('room-h2h');
  const opp = room.mode === '1v1' ? oppMember() : null;
  if (!opp) { el.innerHTML = ''; return; }
  const name = `<b>${esc(opp.nick)}</b>님`;
  if (!account.loggedIn || !opp.pid) {
    el.innerHTML = `⚔️ ${name}과의 상대 전적은 남지 않아요 (손님)`;
    return;
  }
  const h = room.h2h[opp.pid];
  if (h === undefined) {
    room.h2h[opp.pid] = null; // 불러오는 중
    getH2H(opp.pid).then((v) => { if (room) { room.h2h[opp.pid] = v || false; renderRoom(); } });
  }
  if (h === false) el.innerHTML = ''; // 불러오기 실패
  else if (!h) el.innerHTML = `⚔️ ${name}과의 상대 전적 불러오는 중…`;
  else if (h.wins + h.losses === 0) el.innerHTML = `⚔️ ${name}과는 첫 대결이에요!`;
  else el.innerHTML = `⚔️ ${name}과의 상대 전적 <em>${h.wins}승 ${h.losses}패</em>`;
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
  renderCoins();

  // 선수 한 줄: 동그란 얼굴(닉네임 첫 글자) + 닉네임 + 꼬리표(방장·손님·나) + 준비 완료
  const row = (m, inTeam, i) => {
    const tags = [inTeam && room.mode === '2v2' ? `${i + 1}번` : '', m.host ? '👑 방장' : '', m.guest ? '손님' : '', m.id === myId ? '나' : ''].filter(Boolean);
    return `<li class="${m.id === myId ? 'me' : ''}"><em class="av">${esc([...m.nick][0] || '?')}</em><div class="who"><b>${esc(m.nick)}</b><span>${tags.join(' · ') || '참가자'}</span></div>${inTeam ? '<i class="on">✓ 준비</i>' : ''}</li>`;
  };
  const empty = '<li class="empty"><em class="av">+</em><div class="who"><b>빈자리</b></div></li>';
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


/* ───────── 로그인 (PIN 계정 / 손님) ───────── */
const LOGIN_MSG = {
  error: '서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요',
  taken: '방금 누가 이 닉네임으로 가입했어요. 다른 닉네임을 써 주세요',
  bad_nick: '닉네임은 1~10글자로 해 주세요',
  bad_pin: 'PIN은 숫자 4자리로 해 주세요',
};
const waitText = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);
let busy = false;

function renderMe() {
  $('me-name').innerHTML = account.guest
    ? `${esc(account.nick)}<small>손님</small>`
    : `${esc(account.nick)}<small>님</small>`;
  $('btn-pin').classList.toggle('hidden', account.guest);
  $('me-coins').classList.toggle('hidden', account.guest);
  $('me-coins').textContent = `🪙 ${account.player?.coins ?? 0}`;
  $('btn-logout').textContent = account.guest ? '로그인' : '로그아웃';
  const p = account.player;
  $('me-stats').innerHTML = p
    ? `<span>1v1 <b>${p.wins_1v1}승</b></span><span>2v2 <b>${p.wins_2v2}승</b></span><span>최장 랠리 <b>${p.best_rally}</b></span>` // 패 수는 보여 주지 않는다 (사용자 결정, 상대 전적만 승패 둘 다)
    : '<span class="guest">손님은 전적·코인이 저장되지 않아요</span>';
  $('me-menu').classList.add('hidden');
}

// 로비: ⚙️ 내 계정 메뉴 (PIN 바꾸기·로그아웃), ❓ 치는 방법 창
$('btn-me-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  playUI('click');
  $('me-menu').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!$('me-menu').contains(e.target)) $('me-menu').classList.add('hidden');
});
$('btn-howto').addEventListener('click', () => { playUI('click'); $('howto').classList.remove('hidden'); });
const closeHowto = () => {
  $('howto').classList.add('hidden');
  try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* 무시 */ }
};
$('btn-howto-close').addEventListener('click', () => { playUI('click'); closeHowto(); });
$('howto').addEventListener('click', (e) => { if (e.target === $('howto')) closeHowto(); });
const showLobby = () => show('lobby');

// 로그인하면 하루 첫 접속 코인 받기 (한국 시간으로 하루 한 번)
async function checkDaily() {
  const got = await claimDaily();
  if (!got) return;
  if (!$('lobby').classList.contains('hidden')) renderMe();
  setTimeout(() => { playUI('coin'); hud.toast(`🎁 오늘 첫 접속! +${got} 코인`, 2600); }, 1200);
}

function showLogin(msg = '') {
  $('login-form').classList.remove('hidden');
  $('signup-form').classList.add('hidden');
  $('login-nick').value = $('login-nick').value || lastNick();
  $('login-pin').value = '';
  $('login-msg').textContent = msg;
  show('login');
  ($('login-nick').value ? $('login-pin') : $('login-nick')).focus();
}

async function doLogin() {
  if (busy) return;
  initAudio();
  playUI('click');
  const nick = cleanNick($('login-nick').value);
  const pin = $('login-pin').value;
  const msg = $('login-msg');
  if (!nick) { msg.textContent = '닉네임을 입력해 주세요'; $('login-nick').focus(); return; }
  if (!validPin(pin)) { msg.textContent = 'PIN은 숫자 4자리예요'; $('login-pin').focus(); return; }
  busy = true;
  msg.textContent = '확인 중…';
  const r = await login(nick, pin);
  busy = false;
  if (r.status === 'ok') { msg.textContent = ''; showLobby(); hud.toast(`어서 와요, ${account.nick}님!`); checkDaily(); return; }
  if (r.status === 'no_user') {
    msg.textContent = '';
    $('signup-nick').textContent = `'${nick}'`;
    $('signup-pin').value = '';
    $('signup-msg').textContent = '';
    $('login-form').classList.add('hidden');
    $('signup-form').classList.remove('hidden');
    $('signup-pin').focus();
    return;
  }
  $('login-pin').value = '';
  if (r.status === 'wrong_pin') msg.textContent = `PIN이 틀렸어요 (${r.left}번 더 틀리면 5분 동안 잠겨요)`;
  else if (r.status === 'locked') msg.textContent = `PIN을 5번 틀려서 잠겼어요. ${waitText(r.wait)} 뒤에 다시 해 주세요`;
  else msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
  $('login-pin').focus();
}

async function doSignup() {
  if (busy) return;
  playUI('click');
  const msg = $('signup-msg');
  if ($('signup-pin').value !== $('login-pin').value) {
    msg.textContent = '처음 입력한 PIN과 달라요. 다시 입력해 주세요';
    $('signup-pin').value = '';
    $('signup-pin').focus();
    return;
  }
  busy = true;
  msg.textContent = '가입 중…';
  const r = await signup($('login-nick').value, $('login-pin').value);
  busy = false;
  if (r.status === 'ok') { msg.textContent = ''; showLobby(); hud.toast(`가입 완료! 반가워요, ${account.nick}님`, 2400); checkDaily(); return; }
  msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
}

function doGuest() {
  initAudio();
  playUI('click');
  const nick = cleanNick($('login-nick').value);
  if (!nick) { $('login-msg').textContent = '손님도 닉네임은 입력해 주세요'; $('login-nick').focus(); return; }
  playAsGuest(nick);
  showLobby();
}

async function doChangePin() {
  if (busy) return;
  playUI('click');
  const a = $('pin-new').value, b = $('pin-new2').value, msg = $('pin-msg');
  if (!validPin(a)) { msg.textContent = 'PIN은 숫자 4자리예요'; $('pin-new').focus(); return; }
  if (a !== b) { msg.textContent = '두 번 입력한 PIN이 달라요'; $('pin-new2').value = ''; $('pin-new2').focus(); return; }
  busy = true;
  msg.textContent = '바꾸는 중…';
  const r = await changePin(a);
  busy = false;
  if (r.status === 'ok') { showLobby(); hud.toast('PIN을 바꿨어요'); return; }
  if (r.status === 'no_session') { showLogin('로그인이 풀렸어요. 다시 로그인해 주세요'); return; }
  msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
}

const onlyDigits = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); };
for (const id of ['login-pin', 'signup-pin', 'pin-new', 'pin-new2']) $(id).addEventListener('input', onlyDigits);
$('btn-login').addEventListener('click', doLogin);
$('login-nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-pin').focus(); });
$('login-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('btn-signup').addEventListener('click', doSignup);
$('signup-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); });
$('btn-signup-cancel').addEventListener('click', () => { playUI('click'); showLogin(); });
$('btn-guest').addEventListener('click', doGuest);
$('btn-logout').addEventListener('click', async () => {
  playUI('click');
  if (!account.guest) { await logout(); showLogin('로그아웃했어요'); }
  else showLogin();
});
$('btn-pin').addEventListener('click', () => {
  playUI('click');
  $('pin-new').value = '';
  $('pin-new2').value = '';
  $('pin-msg').textContent = '';
  show('pin-change');
  $('pin-new').focus();
});
$('btn-pin-go').addEventListener('click', doChangePin);
$('pin-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pin-new2').focus(); });
$('pin-new2').addEventListener('keydown', (e) => { if (e.key === 'Enter') doChangePin(); });
$('btn-pin-cancel').addEventListener('click', () => { playUI('click'); showLobby(); });

// 처음 열면: 기억해 둔 열쇠가 있으면 자동 로그인, 없으면 로그인 화면
(async () => {
  const r = await autoLogin();
  if (r === 'ok') { showLobby(); checkDaily(); }
  else showLogin(r === 'error' ? '서버에 연결하지 못해 자동 로그인을 못 했어요. 다시 로그인하거나 손님으로 해 주세요' : '');
})();

/* ───────── 랭킹 ───────── */
const RANK = {
  wins: { desc: '1v1 + 2v2 승리 합계', unit: '승', empty: '아직 이긴 사람이 없어요. 첫 1등이 되어 보세요!', join: '친구와 경기에서 이겨 보세요!' },
  rally: { desc: '혼자 하기(AI 상대) 최장 랠리', unit: '회', empty: '아직 기록이 없어요. 혼자 하기로 첫 기록을 세워 보세요!', join: '혼자 하기로 기록을 세워 보세요!' },
};
let rankKind = 'wins';
let rankReq = 0;
async function showRank(kind = rankKind) {
  rankKind = kind;
  for (const k of ['wins', 'rally']) $(`rank-tab-${k}`).classList.toggle('on', k === kind);
  $('rank-desc').textContent = RANK[kind].desc;
  const list = $('rank-list'), podium = $('rank-podium'), meBar = $('rank-me');
  podium.innerHTML = '';
  meBar.innerHTML = '';
  list.innerHTML = '<li class="msg-row">불러오는 중…</li>';
  show('rank');
  const req = ++rankReq;
  const rows = await getRanking(kind);
  if (req !== rankReq) return; // 그 사이 탭을 바꿨으면 버림
  if (!rows) { list.innerHTML = '<li class="msg-row">랭킹을 불러오지 못했어요 (인터넷 연결 확인)</li>'; return; }
  const myNick = account.loggedIn ? account.nick : null;
  const unit = RANK[kind].unit;
  const MEDAL = ['', '🥇', '🥈', '🥉'];
  const av = (nick) => `<em class="av">${esc([...nick][0] || '?')}</em>`;
  const sub = (r) => (kind === 'wins' ? `<small>1v1 ${r.w1}승 · 2v2 ${r.w2}승</small>` : '');

  // 1~3등: 시상대 (가운데 1등, 왼쪽 2등, 오른쪽 3등). 비어 있으면 '?' 자리
  const top = rows.slice(0, 3);
  podium.innerHTML = [1, 0, 2].map((i) => {
    const r = top[i];
    if (!r) return `<div class="pod p${i + 1} empty"><em class="av">?</em><b>비어 있어요</b><div class="block">${i + 1}</div></div>`;
    const me = r.nick === myNick ? ' me' : '';
    return `<div class="pod p${i + 1}${me}"><span class="medal">${MEDAL[r.rank] || r.rank}</span>${av(r.nick)}`
      + `<b>${esc(r.nick)}</b><span class="val">${r.value}<small>${unit}</small></span>${sub(r)}<div class="block">${r.rank}</div></div>`;
  }).join('');
  podium.classList.toggle('hidden', !rows.length);

  // 4등부터: 목록
  const rest = rows.slice(3);
  if (!rows.length) list.innerHTML = `<li class="msg-row">${RANK[kind].empty}</li>`;
  else list.innerHTML = rest.map((r) => `<li class="${r.nick === myNick ? 'me' : ''}"><span class="no">${MEDAL[r.rank] || r.rank}</span>${av(r.nick)}`
    + `<span class="who">${esc(r.nick)}${sub(r)}</span><span class="val">${r.value}<small>${unit}</small></span></li>`).join('');

  // 내 줄이 목록 아래쪽에 있으면 보이게 스크롤
  list.scrollTop = 0;
  const myRow = list.querySelector('li.me');
  if (myRow) list.scrollTop = Math.max(0, myRow.offsetTop - list.clientHeight / 2 + myRow.offsetHeight / 2);

  // 맨 아래: 내 순위
  const mine = myNick && rows.find((r) => r.nick === myNick);
  if (!account.loggedIn) meBar.innerHTML = '🙋 로그인하면 랭킹에 이름을 올릴 수 있어요';
  else if (mine) meBar.innerHTML = `<span>내 순위</span><b>${mine.rank}위</b><span class="val">${mine.value}${unit}</span>`;
  else meBar.innerHTML = `<span>아직 순위에 없어요</span><span class="hint">${RANK[kind].join}</span>`;
}
$('btn-rank').addEventListener('click', () => { playUI('click'); showRank('wins'); });
$('rank-tab-wins').addEventListener('click', () => { playUI('click'); showRank('wins'); });
$('rank-tab-rally').addEventListener('click', () => { playUI('click'); showRank('rally'); });
$('btn-rank-back').addEventListener('click', () => { playUI('click'); show('lobby'); });

/* ───────── 버튼 ───────── */
$('btn-ai').addEventListener('click', () => startAI());
$('btn-create-1v1').addEventListener('click', () => enterRoom(makeCode(), true, '1v1'));
$('btn-create-2v2').addEventListener('click', () => enterRoom(makeCode(), true, '2v2'));
$('btn-join').addEventListener('click', () => {
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
$('btn-team-0').addEventListener('click', () => pickTeam(0));
$('btn-team-1').addEventListener('click', () => pickTeam(1));
$('btn-room-leave').addEventListener('click', () => { playUI('click'); leaveRoom(); show('lobby'); });
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(room.code); hud.toast('코드를 복사했어요'); } catch {}
});

function exitGame() {
  playUI('click');
  if (room) { leaveRoom(); show('lobby'); }
  else {
    stopGame();
    show('lobby');
    if (aiCoins) { hud.toast(`혼자 하기로 🪙 +${aiCoins} 코인`, 2400); aiCoins = 0; }
  }
}
$('exit').addEventListener('click', exitGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game && !room) exitGame();
});

/* ───────── 상점·옷장 ─────────
   뽑기·구매·장착은 서버(supabase/06_shop.sql)가 정하고, 화면은 결과만 보여 준다.
   상점·옷장에서는 패널이 오른쪽으로 비켜서고 왼쪽에 내 캐릭터가 보인다(입어 보기). */
let shopTab = 'char';
let closetCat = 'paddle';
let shopBusy = false;
let sureId = null; // '정말 살까요?' 확인 중인 버튼
let sureTimer = 0;
const gradeName = (g) => (g === 'default' ? '기본' : GRADES[g].name);
const owns = (id) => ITEM[id]?.grade === 'default' || !!account.shop?.owned.has(id);
const SHOP_MSG = {
  error: '서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요',
  no_coins: '코인이 모자라요',
  no_pieces: '조각이 모자라요',
  empty: '아직 이 뽑기에는 아이템이 없어요',
  owned: '이미 가지고 있어요',
  not_owned: '가지고 있지 않은 아이템이에요',
  no_session: '로그인이 풀렸어요. 다시 로그인해 주세요',
};

function needLogin() {
  if (account.loggedIn) return false;
  playUI('click');
  hud.toast('로그인하면 상점·옷장을 쓸 수 있어요', 2400);
  return true;
}

// 미리보기 카메라 (x: 화면에서 캐릭터를 왼쪽으로 비키는 정도, rot: 캐릭터가 도는 각도)
const PV = { x: 0.6, y: 1.15, back: 1.7, lookY: 0.85, rot: -0.55, sway: 0.2 };
// 미리보기: 내 캐릭터를 카메라 쪽으로 돌려 세우고 천천히 흔든다
function previewFrame(now) {
  const c = world.team[0][0];
  applyLook(c, preview.look);
  c.group.visible = true;
  c.group.position.set(0, 0, CHAR_Z);
  // 경기 때처럼 등 뒤에서 본다 (탁구채 앞면이 카메라 쪽). 천천히 좌우로 흔들기
  c.group.rotation.y = PV.rot + Math.sin(now * 0.9) * PV.sway;
  c.setOpacity(1, 1);
  c.setTag(null);
  world.team[0][1].group.visible = false;
  for (const slot of [0, 1]) world.team[1][slot].group.visible = false;
  const narrow = innerWidth < 760;
  const ox = narrow ? 0.1 : PV.x; // 패널이 오른쪽에 있으니 캐릭터는 화면 왼쪽에
  world.camera.position.set(ox, PV.y, CHAR_Z + PV.back);
  world.camera.lookAt(ox, PV.lookY, CHAR_Z);
  world.setFocus(0);
  setEcho(0);
  world.setBall([0, -1, 0], false);
  world.ring.visible = false;
  world.aim.visible = false;
}
const setPreview = (cat, id) => { preview = { look: { ...myEquip(), [cat]: id } }; };

async function openShop(tab = shopTab) {
  if (needLogin()) return;
  playUI('click');
  shopTab = tab;
  preview = { look: myEquip() };
  $('gacha-result').innerHTML = '';
  $('shop-msg').textContent = '';
  show('shop');
  renderShop();
  if (!account.shop) {
    $('shop-msg').textContent = '불러오는 중…';
    const r = await loadShop();
    $('shop-msg').textContent = r.status === 'ok' ? '' : SHOP_MSG[r.status] || SHOP_MSG.error;
    renderShop();
  }
}

function renderWallet() {
  const p = account.player || {};
  $('shop-coins').textContent = `🪙 ${p.coins ?? 0}`;
  $('shop-pieces').textContent = `🧩 ${p.pieces ?? 0}`;
}

function renderShop() {
  renderWallet();
  for (const t of ['char', 'arena', 'buy']) $(`shop-tab-${t}`).classList.toggle('on', shopTab === t);
  $('shop-gacha').classList.toggle('hidden', shopTab === 'buy');
  $('shop-buy').classList.toggle('hidden', shopTab !== 'buy');
  if (shopTab === 'buy') { renderBuyList(); return; }
  const pool = shopTab;
  const items = ITEMS.filter((i) => i.pool === pool && i.grade !== 'default');
  const coins = account.player?.coins ?? 0;
  const ready = !!account.shop;
  if (!items.length) {
    $('gacha-desc').innerHTML = `<b>${POOLS[pool].desc}</b><br>곧 열려요! 아직 아이템을 만드는 중이에요 🛠️`;
  } else {
    const hasLegend = items.some((i) => i.grade === 'legend');
    const left = PITY - (account.shop?.pity[pool] ?? 0);
    const cats = [...new Set(items.map((i) => CATS[i.cat].name))].join(' · ');
    $('gacha-desc').innerHTML = `<b>${POOLS[pool].desc}</b><br>일반 70% · 고급 25% · 전설 5%`
      + `<br>${hasLegend ? `전설 보장까지 <em>${left}번</em>` : '전설 아이템은 아직 준비 중이에요'}`
      + `<br><small>지금 들어 있는 것: ${cats} ${items.length}종 · 중복이면 🧩 조각</small>`;
  }
  $('btn-gacha-1').disabled = shopBusy || !ready || !items.length || coins < GACHA_PRICE[1];
  $('btn-gacha-10').disabled = shopBusy || !ready || !items.length || coins < GACHA_PRICE[10];
}

async function doGacha(count) {
  if (shopBusy) return;
  initAudio();
  playUI('click');
  shopBusy = true;
  renderShop();
  $('shop-msg').textContent = '';
  const box = $('gacha-result');
  box.innerHTML = '';
  $('shop-msg').classList.remove('ok');
  const r = await gacha(shopTab, count);
  if (r.status !== 'ok') {
    shopBusy = false;
    $('shop-msg').textContent = SHOP_MSG[r.status] || SHOP_MSG.error;
    renderShop();
    return;
  }
  renderWallet();
  const gap = count === 1 ? 0 : 0.16;
  box.className = `gacha-result${count === 1 ? ' one' : ''}`;
  box.innerHTML = r.results.map((x, i) => {
    const it = ITEM[x.item] || { name: x.item, grade: x.grade };
    return `<li class="g-${x.grade}" style="animation-delay:${(i * gap).toFixed(2)}s">${swatch(it)}`
      + `<span class="nm">${esc(it.name)}</span>`
      + `<span class="tag${x.dup ? '' : ' new'}">${x.dup ? `중복 → 🧩+${x.pieces}` : `NEW! · ${gradeName(x.grade)}`}</span></li>`;
  }).join('');
  r.results.forEach((x, i) => setTimeout(() => playUI(x.grade === 'common' ? 'card' : x.grade), i * gap * 1000));
  // 가장 좋은 새 아이템을 캐릭터에 입혀 보여 주기
  const best = [...r.results].sort((a, b) => ['common', 'rare', 'legend'].indexOf(b.grade) - ['common', 'rare', 'legend'].indexOf(a.grade))[0];
  if (best && ITEM[best.item]) setPreview(ITEM[best.item].cat, best.item);
  setTimeout(() => { shopBusy = false; renderShop(); }, r.results.length * gap * 1000 + 300);
}

function renderBuyList() {
  const p = account.player || {};
  let html = '';
  for (const [cat, info] of Object.entries(CATS)) {
    const list = ITEMS.filter((i) => i.cat === cat && i.grade !== 'default');
    if (!list.length) continue;
    html += `<h4>${info.name}</h4>`;
    for (const it of list) {
      const g = GRADES[it.grade];
      const sel = preview?.look?.[cat] === it.id ? ' sel' : '';
      let right;
      if (owns(it.id)) right = '<span class="have">✔ 가지고 있음</span>';
      else {
        const b = (pay, label, cost, have) => {
          const key = `${it.id}/${pay}`;
          return `<button data-buy="${it.id}" data-pay="${pay}" class="${sureId === key ? 'sure' : ''}" ${have < cost || shopBusy ? 'disabled' : ''}>${sureId === key ? '정말 살까요?' : `${label} ${cost.toLocaleString()}`}</button>`;
        };
        right = b('coins', '🪙', g.buy, p.coins ?? 0) + b('pieces', '🧩', g.pieces, p.pieces ?? 0);
      }
      html += `<li class="it g-${it.grade}${sel}" data-try="${it.id}">${swatch(it)}<span class="nm">${esc(it.name)}<span class="gbadge">${g.name}</span></span>${right}</li>`;
    }
  }
  $('buy-list').innerHTML = html || '<li class="msg-row">아직 파는 아이템이 없어요</li>';
}

$('buy-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-buy]');
  if (btn) {
    const id = btn.dataset.buy, pay = btn.dataset.pay, key = `${id}/${pay}`;
    playUI('click');
    if (sureId !== key) { // 한 번 더 눌러야 산다 (실수 방지)
      sureId = key;
      clearTimeout(sureTimer);
      sureTimer = setTimeout(() => { sureId = null; if (shopTab === 'buy') renderBuyList(); }, 3000);
      renderBuyList();
      return;
    }
    sureId = null;
    shopBusy = true;
    renderBuyList();
    const r = await buyItem(id, pay);
    shopBusy = false;
    if (r.status === 'ok') {
      playUI(ITEM[id].grade === 'common' ? 'card' : ITEM[id].grade);
      $('shop-msg').innerHTML = `🎉 ${esc(ITEM[id].name)}을(를) 얻었어요! 옷장에서 장착해 보세요`;
      $('shop-msg').classList.add('ok');
      setPreview(ITEM[id].cat, id);
    } else $('shop-msg').textContent = SHOP_MSG[r.status] || SHOP_MSG.error;
    renderShop();
    return;
  }
  const li = e.target.closest('li[data-try]');
  if (li) {
    const it = ITEM[li.dataset.try];
    setPreview(it.cat, it.id);
    renderBuyList();
  }
});

async function openCloset(cat = closetCat) {
  if (needLogin()) return;
  playUI('click');
  closetCat = cat;
  preview = { look: myEquip() };
  $('closet-msg').textContent = '';
  show('closet');
  renderCloset();
  if (!account.shop) {
    $('closet-msg').textContent = '불러오는 중…';
    const r = await loadShop();
    $('closet-msg').textContent = r.status === 'ok' ? '' : SHOP_MSG[r.status] || SHOP_MSG.error;
    renderCloset();
  }
}

function renderCloset() {
  $('closet-tabs').innerHTML = Object.entries(CATS).map(([cat, info]) => {
    const ready = ITEMS.some((i) => i.cat === cat);
    return `<button class="small${cat === closetCat ? ' on' : ''}" data-cat="${cat}" ${ready ? '' : 'disabled title="곧 열려요"'}>${info.name}</button>`;
  }).join('');
  const on = equipped(myEquip(), closetCat)?.id;
  const sel = preview?.look?.[closetCat];
  const list = ITEMS.filter((i) => i.cat === closetCat)
    .sort((a, b) => (owns(b.id) - owns(a.id)) || (a.grade === 'default' ? -1 : b.grade === 'default' ? 1 : 0));
  $('closet-list').innerHTML = list.length ? list.map((it) => {
    const have = owns(it.id);
    const cls = [`g-${it.grade}`, it.id === on ? 'on' : '', it.id === sel ? 'sel' : '', have ? '' : 'locked'].join(' ');
    const badge = it.id === on ? '✔' : have ? '' : '🔒';
    return `<li class="${cls}" data-id="${it.id}"><span class="badge">${badge}</span>${swatch(it)}<span class="nm">${esc(it.name)}</span></li>`;
  }).join('') : '<li class="empty-msg">곧 열려요!</li>';
}

$('closet-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b || b.disabled) return;
  playUI('click');
  closetCat = b.dataset.cat;
  preview = { look: myEquip() };
  $('closet-msg').textContent = '';
  renderCloset();
});
$('closet-list').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || shopBusy) return;
  const it = ITEM[li.dataset.id];
  playUI('click');
  setPreview(it.cat, it.id);
  if (!owns(it.id)) {
    $('closet-msg').textContent = `🔒 아직 없어요. 상점에서 뽑거나 살 수 있어요 (입어 보기 중)`;
    $('closet-msg').classList.remove('ok');
    renderCloset();
    return;
  }
  if (equipped(myEquip(), it.cat).id === it.id) { renderCloset(); return; }
  shopBusy = true;
  $('closet-msg').textContent = '';
  renderCloset();
  // 기본 아이템은 '장착 해제'로 저장한다
  const r = await equipItem(it.cat, it.grade === 'default' ? null : it.id);
  shopBusy = false;
  $('closet-msg').textContent = r.status === 'ok' ? `✔ ${it.name} 장착!` : SHOP_MSG[r.status] || SHOP_MSG.error;
  $('closet-msg').classList.toggle('ok', r.status === 'ok');
  preview = { look: myEquip() };
  renderCloset();
});

$('btn-shop').addEventListener('click', () => openShop());
$('btn-closet').addEventListener('click', () => openCloset());
$('btn-shop-closet').addEventListener('click', () => openCloset());
$('btn-closet-shop').addEventListener('click', () => openShop());
$('btn-shop-back').addEventListener('click', () => { playUI('click'); show('lobby'); });
$('btn-closet-back').addEventListener('click', () => { playUI('click'); show('lobby'); });
for (const t of ['char', 'arena', 'buy']) {
  $(`shop-tab-${t}`).addEventListener('click', () => {
    playUI('click');
    shopTab = t;
    sureId = null;
    $('gacha-result').innerHTML = '';
    $('shop-msg').textContent = '';
    preview = { look: myEquip() };
    renderShop();
  });
}
$('btn-gacha-1').addEventListener('click', () => doGacha(1));
// 서버 없이 도는 테스트 모드에서만: 뽑기를 시험해 볼 코인
$('btn-test-coins').classList.toggle('hidden', ONLINE);
$('btn-test-coins').addEventListener('click', async () => { playUI('coin'); await testCoins(1000); renderShop(); });
$('btn-gacha-10').addEventListener('click', () => doGacha(10));

/* ───────── 매 프레임 ───────── */
function loop() {
  const now = performance.now() / 1000;
  // 내 스윙 판단을 먼저 끝내고 나서 경기 판정 (느린 PC에서도 늦게 친 공이 버려지지 않게)
  if (game) game.decideHit(now + game.offset);
  if (match) match.update(now);
  if (game) game.update(now + game.offset);
  else if (preview) previewFrame(now);
  else {
    // 로비 배경: 두 캐릭터가 랠리를 주고받고, 카메라는 옆에서 천천히 흔들린다
    world.setFocus(0);
    setEcho(0);
    const L = LOBBY_CAM;
    const a = L.angle + Math.sin(now * L.speed) * L.sway;
    world.camera.position.set(Math.sin(a) * L.dist, L.y, Math.cos(a) * L.dist);
    world.camera.lookAt(0, L.lookY, 0);
    // 메뉴가 왼쪽에 있으니 탁구대를 화면 오른쪽으로 비켜 보이게 (카메라를 옆으로 민다)
    if (innerWidth >= 760) world.camera.translateX(-L.shift * Math.min(1, innerWidth / innerHeight / 1.6));
    world.ring.visible = false;
    world.aim.visible = false;
    applyLook(world.team[0][0], myEquip());
    applyLook(world.team[1][0], {});
    for (const side of [0, 1]) {
      world.team[side][0].group.visible = true;
      world.team[side][0].setOpacity(1, 1);
      world.team[side][0].setTag(null);
      world.team[side][1].group.visible = false;
    }
    // 배경 랠리 소리: 로비 화면에서만, 카메라 자리에서 듣는 것처럼 작게
    const cp = world.camera.position;
    setListener([cp.x, cp.y, cp.z], [Math.cos(a), 0, -Math.sin(a)]);
    lobbyDemo.update(now, world.chars, world, !$('lobby').classList.contains('hidden'));
  }
  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__smash = { PV, world, get game() { return game; }, get match() { return match; }, get room() { return room; } };
