import { createWorld, CHAR_Z } from './scene.js';
import { sideSign } from './physics.js';
import { createLobbyDemo, LOBBY_CAM } from './lobbyDemo.js';
import { Game } from './game.js';
import { Match, AI_NAME } from './match.js';
import { initAudio, playUI, playHit, playTable, setEcho, setQuiet, setListener } from './audio.js';
import { ONLINE, IS_TEST, joinRoom, makeCode, normalizeCode } from './net.js';
import { account, autoLogin, login, signup, playAsGuest, logout, changePin, lastNick, cleanNick, validPin, newMatchId, matchJoin, matchFinish, claimDaily, aiStart, aiRally, loadShop, gacha, buyItem, equipItem, myEquip, testCoins, recordRally, getH2H, getRanking, checkAch, setTitle, myTitle, matchAch, matchPeople, aiAch } from './account.js';
import { ACHS, ACH, ACH_CATS, REWARD, titleText } from './achievements.js';

import { ITEMS, ITEM, POOLS, GRADES, CATS, GACHA_PRICE, PITY, DEFAULTS, applyLook, swatch, equipped, arenaOf, ballOf, poolOpen } from './items.js';

const $ = (id) => document.getElementById(id);
const world = createWorld($('c'));
const lobbyDemo = createLobbyDemo();
const LOBBY_QUIET = 0.4; // 로비 배경 랠리 소리 크기 (경기 중 소리를 1로 볼 때)
// 브라우저는 사람이 한 번 누르기 전에는 소리를 못 낸다: 첫 클릭·키 입력에 소리를 켠다
const unlockAudio = () => { initAudio(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 칭호 알약 (이름표 위. 칭호 색은 모두 같게 — 2v2 '다음에 칠 사람' 노란 강조와 겹치지 않는 남색). id = 업적 id
const tpill = (id, x) => (titleText(id, x) ? `<span class="tpill">${esc(titleText(id, x))}</span>` : '');
const myNemesis = () => account.player?.nemesis || null; // 천적 칭호에 들어갈 닉네임
const roomTpill = (id) => { const m = room?.members.find((x) => x.id === id); return tpill(m?.title, m?.titleX); };

if (IS_TEST) {
  const tag = document.createElement('div');
  tag.textContent = '🧪 테스트 버전';
  tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:4px 12px;border-radius:999px;background:#ffcc00;color:#222;font:bold 13px sans-serif;pointer-events:none;';
  document.body.appendChild(tag);
}
if (!ONLINE) $('mode-note').textContent = '⚠️ 서버 설정이 없어 로컬 테스트 모드예요 (같은 브라우저의 탭끼리만 연결)';
if (!ONLINE) $('login-offline').classList.remove('hidden');

// 휴대폰·태블릿(마우스 없음): 혼자 하기만 열고 온라인 방은 막는다. 주소에 ?mobile=1 이면 PC에서도 흉내.
// 갤럭시 등은 S펜 때문에 'any-pointer: fine'으로 나와서, 브라우저가 알려 주는 기기 종류(UA)도 함께 본다.
const UA = navigator.userAgent || '';
const IS_MOBILE = new URLSearchParams(location.search).has('mobile')
  || navigator.userAgentData?.mobile === true
  || /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|KAKAOTALK|NAVER/i.test(UA)
  || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) // 아이패드(데스크톱 모드)
  || (matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);
const MOBILE_MSG = '💻 같이 하기는 PC에서 해 주세요';
if (IS_MOBILE) {
  document.body.classList.add('mobile');
  $('mobile-note').classList.remove('hidden');
  for (const id of ['btn-create-1v1', 'btn-create-2v2', 'btn-join']) { $(id).classList.add('locked'); $(id).setAttribute('aria-disabled', 'true'); }
  document.querySelector('.lb-friends .lb-label').textContent = '👥 친구랑 하기 · 🔒 PC에서만';
}

const GRADE_TEXT = { perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD', block: 'BLOCK', miss: 'MISS' };
let toastTimer = 0;

let lastScore = null; // 점수가 바뀐 쪽 숫자만 통통 튀게
let resultTimer = 0;
const hud = {
  score(s, deuce) {
    if (!game) return;
    const me = game.mySide, op = 1 - me;
    const bump = (side) => (lastScore && lastScore[side] !== s[side] ? ' bump' : '');
    $('scoreboard').innerHTML = `<div class="sb t${me}"><span>${game.mode === '2v2' ? '우리 팀' : '나'}</span><b class="${bump(me)}">${s[me]}</b></div>`
      + '<i class="sb-colon">:</i>'
      + `<div class="sb t${op}"><b class="${bump(op)}">${s[op]}</b><span>${esc(game.names[op])}</span></div>`
      + (deuce ? '<em class="sb-deuce">듀스!</em>' : '');
    lastScore = [...s];
  },
  stats(st) {
    if (!game) return;
    const hot = st.rally >= 6 ? ' hot' : ''; // 랠리 6회부터 몰입 연출과 함께 🔥
    let html = `<div class="st-rally${hot}"><span>${hot ? '🔥 ' : ''}랠리</span><b>${st.rally}</b></div>`;
    if (game.mode === 'ai') {
      html += `<div class="st-sub"><span>🏅 최고 ${st.best}</span><span>✨ Perfect ${st.perfects}</span>${account.loggedIn ? `<span class="coin">🪙 +${aiCoins}</span>` : ''}</div>`;
    }
    $('stats').innerHTML = html;
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
    // 가운데 큰 결과 띠 (약 2.6초 뒤 대기실로)
    const el = $('result');
    el.className = win ? 'win' : 'lose';
    $('result-title').textContent = win ? '🏆 승리!' : '😢 아쉬워요';
    $('result-score').textContent = `${score[me]} : ${score[1 - me]}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => el.classList.add('hidden'), 2700);
    if (room) {
      saveResult(room.mode, win, game.stats, game.achSummary(score));
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
  if (screen !== 'dress') preview = null;
  for (const id of ['login', 'pin-change', 'rank', 'lobby', 'join', 'room', 'dress']) $(id).classList.toggle('hidden', id !== screen);
  $('hud').classList.toggle('hidden', screen !== 'hud');
}

function stopGame() {
  endIntro(false);
  if (game) game.destroy();
  game = null;
  match = null;
  $('hint').textContent = '';
  $('stats').textContent = '';
  $('scoreboard').textContent = '';
  $('result').classList.add('hidden');
  lastScore = null;
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
      if (account.loggedIn) recordRally(r).then(() => runAchCheck());
      else try { localStorage.setItem(GUEST_BEST_KEY, r); } catch {}
    },
    // 랠리가 끝날 때마다 친 횟수만큼 코인 (4번에 1코인, 서버가 계산)
    onRally: async (hits) => {
      const g = game;
      // 김제빵의 첫 공을 못 받고 끝남 (업적 '첫 공 실수')
      if (hits <= 1 && account.loggedIn) aiAch({ aizero: 1 }).then(gotAch);
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
// 선수마다 칭호 글자 (presence의 title). titles[side][slot]
function titles() {
  const out = [[], []];
  for (const p of room.players) out[p.side][p.slot || 0] = (({ title, titleX } = {}) => titleText(title, titleX))(room.members.find((m) => m.id === p.id));
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

// 경기 시작: 선수마다 자기 열쇠로 서버의 그 경기에 입장 (supabase/13_match_check.sql, 결과는 입장한 경기에만)
function beginRoomGame(players, mode, mine, mid) {
  room.inGame = true;
  room.players = players;
  room.mid = mid || null;
  if (mid) matchJoin(mid, mode, mine.side);
  room.result = '';
  room.coins = null;
  stopGame();
}

// 방장: 경기 시작 (1v1 / 2v2)
function startOnline(mode, players) {
  const mine = players.find((p) => p.id === myId);
  const mid = newMatchId();
  beginRoomGame(players, mode, mine, mid);
  room.link.send({ k: 'go', mode, players, mid });
  show('hud');
  game = new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), playerTitles: titles(), looks: looks(),
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
  startIntro(players, mine.side, mode); // 3초 소개가 끝나면 match.start (endIntro)
}

// 참가자 PC: 방장의 시작 신호를 받으면 경기 화면으로
function startGuestGame(mode, players, mine, mid) {
  beginRoomGame(players, mode, mine, mid);
  show('hud');
  game = new Game(world, {
    mySide: mine.side, mySlot: mine.slot || 0, mode, hud, names: names(), playerNames: playerNames(), playerTitles: titles(), looks: looks(), authority: false,
    send: {
      toss: (s, t, x) => room && room.link.send({ k: 'in', kind: 'toss', t, x, from: myId }),
      swing: (s, t, dir, up) => room && room.link.send({ k: 'in', kind: 'swing', t, dir, up, from: myId }),
    },
  });
  game.offset = room.offset;
  hud.stats(game.stats);
  startIntro(players, mine.side, mode);
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
async function saveResult(mode, win, stats, achStats) {
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
  else el.innerHTML = `<b>🪙 +${c.total} 코인</b><small>${c.items.map((i) => `${esc(i.label)}${i.coins ? ` +${i.coins}` : ""}`).join(' · ')}</small>`;
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
      const tags = [num, m.host ? '👑 방장' : '', m.guest ? '손님' : '', me ? '나' : ''].filter(Boolean);
      html += `<div class="slot${me ? ' me' : ''}" data-team="${team}"${me ? ' title="누르면 팀에서 빠져요"' : ''}><b>${esc(m.nick)}</b><span>${tags.join(' · ')} <i>✓</i></span>${me ? '<span class="out">누르면 빠지기</span>' : ''}</div>`;
    }
    $(`team-${team}`).innerHTML = html;
  }
  const none = room.members.filter((m) => !room.teams[m.id]);
  $('room-members').innerHTML = none.length ? `팀 고르는 중${none.map((m) => `<b>${esc(m.nick)}${m.id === myId ? '(나)' : ''}</b>`).join('')}` : '';
  renderStageLabels();
  $('room-hint').textContent = room.teams[myId] ? '🏓 화면을 누른 채 위로 밀면 연습 스윙!' : '👇 아래 빈 칸을 눌러 팀을 골라 주세요';
  // 배경은 방장 것이 모두에게 보인다 (방장이 바꾸면 다음 입장부터)
  const bgIt = equipped(room.hostM?.look, 'bg'), ballIt = equipped(room.hostM?.look, 'ball');
  const ballTxt = ballIt.grade === 'default' ? '' : ` · ⚪ ${ballIt.name}`; // 탁구공도 방장 것
  $('room-bg').textContent = `🏟️ ${bgIt.name}${ballTxt} · ${room.host ? '내 꾸미기' : '방장 꾸미기'}`;

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
$('lnk-until09').addEventListener('click', () => playUI('click'));
const closeHowto = () => {
  $('howto').classList.add('hidden');
  try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* 무시 */ }
};
$('btn-howto-close').addEventListener('click', () => { playUI('click'); closeHowto(); });
$('howto').addEventListener('click', (e) => { if (e.target === $('howto')) closeHowto(); });
const showLobby = () => show('lobby');

// 로그인하면 하루 첫 접속 코인 받기 (한국 시간으로 하루 한 번)
async function checkDaily() {
  runAchCheck(2600);
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
      + `${tpill(r.title, r.title_x)}<b>${esc(r.nick)}</b><span class="val">${r.value}<small>${unit}</small></span>${sub(r)}<div class="block">${r.rank}</div></div>`;
  }).join('');
  podium.classList.toggle('hidden', !rows.length);

  // 4등부터: 목록
  const rest = rows.slice(3);
  if (!rows.length) list.innerHTML = `<li class="msg-row">${RANK[kind].empty}</li>`;
  else list.innerHTML = rest.map((r) => `<li class="${r.nick === myNick ? 'me' : ''}"><span class="no">${MEDAL[r.rank] || r.rank}</span>${av(r.nick)}`
    + `<span class="who">${tpill(r.title, r.title_x)}${esc(r.nick)}${sub(r)}</span><span class="val">${r.value}<small>${unit}</small></span></li>`).join('');

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

/* ───────── 꾸미기 (옷장 · 뽑기 · 칭호를 한 화면에) ─────────
   뽑기·구매·장착은 서버(supabase/06_shop.sql)가 정하고, 화면은 결과만 보여 준다.
   패널은 오른쪽, 왼쪽에는 내 캐릭터(입어 보기)와 고른 아이템을 크게 보여 주는 카드(#spot). */
let dressTab = 'closet'; // closet | gacha | title
let shopTab = 'char'; // 뽑기 통 (char | arena)
let closetCat = 'paddle'; // 옷장에서 보는 카테고리
let selId = null; // 고른(입어 보는) 아이템. null이면 지금 장착한 것
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
  closed: '이 뽑기는 잠시 닫혀 있어요',
  owned: '이미 가지고 있어요',
  not_owned: '가지고 있지 않은 아이템이에요',
  no_session: '로그인이 풀렸어요. 다시 로그인해 주세요',
};
const CAT_ICON = { paddle: '🏓', head: '🎩', body: '👕', trail: '✨', table: '🟦', bg: '🏟️', ball: '⚪' };

function needLogin() {
  if (account.loggedIn) return false;
  playUI('click');
  hud.toast('로그인하면 꾸미기(상점·옷장)를 쓸 수 있어요', 2400);
  return true;
}

// 꾸미기 카메라: 랠리하는 내 캐릭터의 등 뒤 가까이 (x: 패널을 피해 캐릭터를 화면 왼쪽으로 비키는 정도)
// follow: 캐릭터가 좌우로 움직일 때 카메라가 따라가는 빠르기, blend: 로비↔꾸미기 카메라가 옮겨 가는 시간(초)
const PV = { x: 0.75, y: 1.45, back: 2.7, lookY: 0.85, follow: 2.5, blend: 1.1 };
const camBlend = { p: 0, x: 0, last: 0 }; // p: 0 = 로비 카메라, 1 = 꾸미기 카메라
const ease = (t) => t * t * (3 - 2 * t);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const setMsg = (html, ok = false) => { $('dress-msg').innerHTML = html; $('dress-msg').classList.toggle('ok', ok); };
// 아이템 고르기 = 캐릭터에 입혀 보기
function select(id) {
  selId = id;
  if (id) preview = { look: { ...myEquip(), [ITEM[id].cat]: id } };
  else preview = { look: myEquip() };
}

async function openDress(tab) {
  if (needLogin()) return;
  playUI('click');
  dressTab = tab;
  sureId = null;
  select(null);
  $('gacha-result').innerHTML = '';
  setMsg('');
  show('dress');
  renderDress();
  if (!account.shop) {
    setMsg('불러오는 중…');
    const r = await loadShop();
    setMsg(r.status === 'ok' ? '' : SHOP_MSG[r.status] || SHOP_MSG.error);
    renderDress();
  }
}

function renderWallet() {
  const p = account.player || {};
  $('shop-coins').textContent = `🪙 ${(p.coins ?? 0).toLocaleString()}`;
  $('shop-pieces').textContent = `🧩 ${(p.pieces ?? 0).toLocaleString()}`;
}

function renderDress() {
  renderWallet();
  for (const t of ['closet', 'gacha', 'title']) $(`tab-${t}`).classList.toggle('on', dressTab === t);
  const g = dressTab === 'gacha', tt = dressTab === 'title';
  $('pane-gacha').classList.toggle('hidden', !g);
  $('pane-title').classList.toggle('hidden', !tt);
  $('cat-chips').classList.toggle('hidden', g || tt);
  $('item-grid').classList.toggle('hidden', g || tt);
  if (tt) { renderTitles(); $('spot').classList.add('hidden'); if (!account.ach) runAchCheck(); return; }
  if (g) renderGacha();
  else { renderChips(); renderGrid(); }
  renderSpot();
}

// 카테고리 칩: 첫 줄 = 캐릭터(탁구채·몸·머리·궤적), 둘째 줄 = 경기장(배경·탁구공·탁구대) (사용자 확정)
// 아이템이 아직 없는 카테고리는 흐리게 잠금 (글자 '곧'은 안 씀)
const CHIP_ROWS = [['paddle', 'body', 'head', 'trail'], ['bg', 'ball', 'table']];
function renderChips() {
  const has = (cat) => ITEMS.some((i) => i.cat === cat);
  $('cat-chips').innerHTML = CHIP_ROWS.map((row) => '<div class="chip-row">' + row.map((cat) => {
    const ready = has(cat);
    return `<button class="${cat === closetCat ? 'on' : ''}" data-cat="${cat}" ${ready ? '' : 'disabled'}>${CAT_ICON[cat] || ''} ${CATS[cat].name}</button>`;
  }).join('') + '</div>').join('');
}

// 아이템 카드: 가진 것 먼저(없는 건 🔒 흐리게). 없는 건 '크게 보기' 카드에서 사기
function renderGrid() {
  const on = equipped(myEquip(), closetCat)?.id;
  const list = ITEMS.filter((i) => i.cat === closetCat).sort((a, b) => (owns(b.id) - owns(a.id)) || (a.grade === 'default' ? -1 : b.grade === 'default' ? 1 : 0));
  $('item-grid').innerHTML = list.length ? list.map((it) => {
    const have = owns(it.id);
    const cls = ['card', `g-${it.grade}`, it.id === on ? 'on' : '', it.id === selId ? 'sel' : '', have ? '' : 'locked'].join(' ');
    const corner = it.id === on ? '<span class="corner on">✓</span>' : have ? '' : '<span class="corner">🔒</span>';
    return `<li class="${cls}" data-id="${it.id}">${corner}${swatch(it)}<span class="nm">${esc(it.name)}</span><i class="bar"></i></li>`;
  }).join('') : '<li class="empty-msg">곧 열려요!</li>';
}

// 왼쪽 아래 '크게 보기' 카드: 고른 아이템(없으면 지금 장착한 것)과 할 수 있는 일(장착·사기·소리 듣기)
function renderSpot() {
  const it = selId ? ITEM[selId] : dressTab === 'gacha' ? null : equipped(myEquip(), closetCat);
  const spot = $('spot');
  spot.classList.toggle('hidden', !it);
  if (!it) return;
  const have = owns(it.id);
  const isOn = equipped(myEquip(), it.cat)?.id === it.id;
  spot.className = `spot g-${it.grade}`;
  $('spot-pic').innerHTML = swatch(it).replace('class="sw', 'class="sw big');
  $('spot-grade').textContent = gradeName(it.grade);
  $('spot-name').textContent = it.name;
  const status = isOn ? '장착 중' : have ? '가지고 있어요' : '입어 보는 중';
  const snd = (it.sound ? ' · 🔊 특별한 소리' : '') // 소리 이름은 보여 주지 않는다 (사용자 결정)
    + (it.hatch ? ' · ✨ 스매시 득점 시 특별한 효과' : ''); // 계란·드래곤 알: 깨지고 병아리·아기 용
  $('spot-desc').textContent = status + snd;
  let acts = '';
  if (isOn) acts += '<span class="pill">✓ 장착 중</span>';
  else if (have) acts += `<button class="small primary" data-act="equip" ${shopBusy ? 'disabled' : ''}>장착하기</button>`;
  else if (it.grade !== 'default') {
    const p = account.player || {};
    const g = GRADES[it.grade];
    const b = (pay, label, cost, has) => {
      const key = `${it.id}/${pay}`;
      const sure = sureId === key;
      return `<button class="small${pay === 'coins' ? ' primary' : ''}${sure ? ' sure' : ''}" data-buy="${it.id}" data-pay="${pay}" ${has < cost || shopBusy ? 'disabled' : ''}>${sure ? '정말 살까요?' : `${label} ${cost.toLocaleString()}`}</button>`;
    };
    acts += b('coins', '🪙', g.buy, p.coins ?? 0) + b('pieces', '🧩', g.pieces, p.pieces ?? 0);
  }
  if (it.cat === 'paddle' || it.cat === 'ball') acts += '<button class="small" data-act="sound" title="소리 들어 보기">🔊</button>';
  $('spot-acts').innerHTML = acts;
}

// 뽑기 탭
function renderGacha() {
  for (const t of ['char', 'arena']) $(`shop-tab-${t}`).classList.toggle('on', shopTab === t);
  const pool = shopTab;
  const items = ITEMS.filter((i) => i.pool === pool && i.grade !== 'default');
  const coins = account.player?.coins ?? 0;
  const ready = !!account.shop;
  const head = `<b>${POOLS[pool].icon} ${POOLS[pool].name}</b><span class="g-cats">${POOLS[pool].desc}</span>`;
  const open = poolOpen(pool);
  if (!items.length) {
    $('gacha-desc').innerHTML = `${head}<p class="soon-box">곧 열려요! 아직 아이템을 만드는 중이에요 🛠️</p>`;
  } else if (!open) {
    // 잠시 닫힘 (일반 아이템이 아직 없음). 무엇이 들어 있는지는 보여 주고, 누르면 왼쪽 '크게 보기'에
    const list = items.map((it) => `<li class="g-${it.grade}" data-id="${it.id}">${swatch(it)}<span>${esc(it.name)}</span></li>`).join('');
    $('gacha-desc').innerHTML = `${head}<p class="soon-box">🔒 잠시 닫혀 있어요<br><small>일반 아이템이 들어오면 열려요</small></p>`
      + `<div class="pity-row">지금 들어 있는 것 ${items.length}종</div><ul class="pool-peek">${list}</ul>`;
  } else {
    const hasLegend = items.some((i) => i.grade === 'legend');
    const used = account.shop?.pity[pool] ?? 0;
    const rates = Object.entries(GRADES).map(([g, v]) => `<span class="gbadge g-${g}">${v.name} ${Math.round(v.rate * 100)}%</span>`).join('');
    $('gacha-desc').innerHTML = `${head}<div class="rates">${rates}</div>`
      + (hasLegend
        ? `<div class="pity-row">전설 보장까지 <em>${PITY - used}번</em></div><div class="pity"><i style="width:${(used / PITY) * 100}%"></i></div>`
        : '<div class="pity-row">전설 아이템은 아직 준비 중이에요</div>')
      + `<small>지금 들어 있는 것 ${items.length}종 · 중복이면 🧩 조각으로 바뀌어요</small>`;
  }
  $('btn-gacha-1').disabled = shopBusy || !ready || !open || coins < GACHA_PRICE[1];
  $('btn-gacha-10').disabled = shopBusy || !ready || !open || coins < GACHA_PRICE[10];
}

async function doGacha(count) {
  if (shopBusy) return;
  initAudio();
  playUI('click');
  shopBusy = true;
  renderGacha();
  setMsg('');
  const box = $('gacha-result');
  box.innerHTML = '';
  const r = await gacha(shopTab, count);
  if (r.status !== 'ok') {
    shopBusy = false;
    setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
    renderGacha();
    return;
  }
  renderWallet();
  const gap = count === 1 ? 0 : 0.16;
  runAchCheck(count === 1 ? 1500 : 3400); // 카드가 다 뒤집힌 뒤
  box.className = `gacha-result${count === 1 ? ' one' : ''}`;
  box.innerHTML = r.results.map((x, i) => {
    const it = ITEM[x.item] || { name: x.item, grade: x.grade };
    return `<li class="card g-${x.grade}" data-id="${ITEM[x.item] ? x.item : ''}" style="animation-delay:${(i * gap).toFixed(2)}s">`
      + `${x.dup ? '' : '<span class="new">NEW</span>'}${swatch(it)}<span class="nm">${esc(it.name)}</span>`
      + `<span class="tag">${x.dup ? `중복 🧩+${x.pieces}` : gradeName(x.grade)}</span><i class="bar"></i></li>`;
  }).join('');
  r.results.forEach((x, i) => setTimeout(() => playUI(x.grade === 'common' ? 'card' : x.grade), i * gap * 1000));
  // 가장 좋은 아이템을 캐릭터에 입혀 크게 보여 주기
  const rank = (g) => ['common', 'rare', 'legend'].indexOf(g);
  const best = [...r.results].sort((a, b) => rank(b.grade) - rank(a.grade))[0];
  setTimeout(() => {
    shopBusy = false;
    if (best && ITEM[best.item]) select(best.item);
    renderGacha();
    renderSpot();
  }, r.results.length * gap * 1000 + 300);
}

async function doEquip(it) {
  shopBusy = true;
  setMsg('');
  renderDress();
  // 기본 아이템은 '장착 해제'로 저장한다
  const r = await equipItem(it.cat, it.grade === 'default' ? null : it.id);
  shopBusy = false;
  if (r.status === 'ok') { playUI('coin'); setMsg(`✔ ${esc(it.name)} 장착!`, true); }
  else setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
  select(null);
  renderDress();
}

async function doBuy(id, pay) {
  const key = `${id}/${pay}`;
  playUI('click');
  if (sureId !== key) { // 한 번 더 눌러야 산다 (실수 방지)
    sureId = key;
    clearTimeout(sureTimer);
    sureTimer = setTimeout(() => { sureId = null; renderSpot(); }, 3000);
    renderSpot();
    return;
  }
  sureId = null;
  shopBusy = true;
  renderSpot();
  const r = await buyItem(id, pay);
  shopBusy = false;
  if (r.status === 'ok') {
    runAchCheck(900);
    playUI(ITEM[id].grade === 'common' ? 'card' : ITEM[id].grade);
    setMsg(`🎉 ${esc(ITEM[id].name)}을(를) 얻었어요! '장착하기'를 누르면 바로 써요`, true);
  } else setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
  renderDress();
}

// 탭 · 카테고리 · 카드 · 크게 보기 카드
for (const t of ['closet', 'gacha', 'title']) {
  $(`tab-${t}`).addEventListener('click', () => {
    if (dressTab === t) return;
    playUI('click');
    dressTab = t;
    sureId = null;
    select(null);
    setMsg('');
    renderDress();
  });
}
for (const t of ['char', 'arena']) {
  $(`shop-tab-${t}`).addEventListener('click', () => {
    if (shopTab === t || shopBusy) return;
    playUI('click');
    shopTab = t;
    $('gacha-result').innerHTML = '';
    setMsg('');
    select(null);
    renderGacha();
    renderSpot();
  });
}
$('cat-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b || b.disabled || b.dataset.cat === closetCat) return;
  playUI('click');
  closetCat = b.dataset.cat;
  select(null);
  setMsg('');
  renderDress();
});
$('item-grid').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || shopBusy) return;
  const it = ITEM[li.dataset.id];
  playUI('click');
  sureId = null;
  // 옷장: 가진 것을 누르면 바로 장착. 나머지는 입어 보기
  if (dressTab === 'closet' && owns(it.id) && equipped(myEquip(), it.cat).id !== it.id) { doEquip(it); return; }
  select(it.id);
  setMsg(owns(it.id) ? '' : '🔒 아직 없어요. 왼쪽 카드에서 바로 사거나 뽑기로 얻을 수 있어요');
  renderDress();
});
// 닫힌 뽑기의 '지금 들어 있는 것' 목록: 누르면 왼쪽 '크게 보기'에 (배경이면 미리 보기)
$('gacha-desc').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || shopBusy) return;
  playUI('click');
  select(li.dataset.id);
  renderSpot();
});
$('gacha-result').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || !li.dataset.id || shopBusy) return;
  playUI('click');
  select(li.dataset.id);
  renderSpot();
});
$('spot-acts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const it = selId ? ITEM[selId] : equipped(myEquip(), closetCat);
  if (b.dataset.buy) doBuy(b.dataset.buy, b.dataset.pay);
  else if (b.dataset.act === 'equip') { playUI('click'); doEquip(it); }
  else if (b.dataset.act === 'sound' && it.cat === 'ball') { initAudio(); playTable(4.5, null, null, it.sound || null); } // 탁구공: 튀는 소리
  else if (b.dataset.act === 'sound') { initAudio(); playHit('perfect', null, null, it.sound || null); world.hitFx(world.team[0][0], null, 'perfect'); }
});

$('btn-shop').addEventListener('click', () => openDress('gacha'));
$('btn-closet').addEventListener('click', () => openDress('closet'));
$('btn-dress-back').addEventListener('click', () => { playUI('click'); show('lobby'); });
$('btn-gacha-1').addEventListener('click', () => doGacha(1));
$('btn-gacha-10').addEventListener('click', () => doGacha(10));
// 서버 없이 도는 테스트 모드에서만: 뽑기를 시험해 볼 코인
$('btn-test-coins').classList.toggle('hidden', ONLINE);
$('btn-test-coins').addEventListener('click', async () => { playUI('coin'); await testCoins(1000); renderDress(); });

/* ───────── 업적·칭호 (supabase/10_achievements.sql, 기획서 11장) ─────────
   업적 달성은 서버가 정한다. 화면은 로그인 직후·경기 뒤·뽑기 뒤 등에 checkAch를 불러 새로 깬 업적을 받고
   '🏅 업적 달성!' 알림을 차례로 띄운다. 칭호는 꾸미기 화면의 '🏅 칭호' 탭에서 단다. */
const achPop = { queue: [], busy: false, notBefore: 0 };
let achTimer = 0;
function runAchCheck(delay = 0) {
  if (!account.loggedIn) return;
  clearTimeout(achTimer);
  achTimer = setTimeout(async () => {
    gotAch(await checkAch());
  }, delay);
}
// 서버가 알려 준 새 업적을 알림 줄에 넣기
function gotAch(r) {
  if (r.status !== 'ok') return;
  {
    if (r.new?.length) {
      achPop.queue.push(...r.new.filter((n) => ACH[n.id]));
      showAchPop();
      if (!$('lobby').classList.contains('hidden')) renderMe();
    }
    if (!$('dress').classList.contains('hidden')) renderDress();
  }
}
function showAchPop() {
  if (achPop.busy) return;
  const n = achPop.queue.shift();
  if (!n) return;
  // 경기 결과 띠가 떠 있으면 사라진 뒤에
  if (!$('result').classList.contains('hidden')) { achPop.queue.unshift(n); setTimeout(showAchPop, 500); return; }
  achPop.busy = true;
  const el = $('ach-pop');
  // 한꺼번에 3개 넘게 깨면(처음 열 때 쌓인 기록 등) 하나로 묶어서
  if (achPop.queue.length >= 2) {
    const all = [n, ...achPop.queue.splice(0)];
    const coins = all.reduce((t, x) => t + x.coins, 0);
    el.innerHTML = `<div class="ap-head">🏅 업적 ${all.length}개 달성!</div><div class="ap-many">${all.map((x) => `<span class="tpill">${esc(titleText(x.id, myNemesis()))}</span>`).join('')}</div>`
      + `<div class="ap-coin">🪙 +${coins} 코인 · 칭호는 꾸미기 → 🏅 칭호에서 달 수 있어요</div>`;
    el.className = 'show';
    playUI(all.some((x) => ACH[x.id].grade === 3) ? 'legend' : 'rare');
    setTimeout(() => playUI('coin'), 500);
    setTimeout(() => { el.className = ''; setTimeout(() => { achPop.busy = false; showAchPop(); }, 400); }, 4600);
    return;
  }
  const a = ACH[n.id];
  el.innerHTML = `<div class="ap-head">🏅 업적 달성!</div><div class="ap-name">${esc(a.name)} <span class="stars">${'★'.repeat(a.grade)}</span></div>`
    + `<span class="tpill">${esc(titleText(a.id, myNemesis()))}</span><div class="ap-coin">🪙 +${n.coins} 코인 · 칭호는 꾸미기 → 🏅 칭호에서 달 수 있어요</div>`;
  el.className = 'show';
  playUI(a.grade === 3 ? 'legend' : 'rare');
  setTimeout(() => playUI('coin'), 500);
  setTimeout(() => {
    el.className = '';
    setTimeout(() => { achPop.busy = false; showAchPop(); }, 400);
  }, 3200);
}

// 꾸미기 '🏅 칭호' 탭: 지금 단 칭호 + 분류별 업적 목록 (깬 것은 '달기'. 칭호 글자는 깨기 전에 '???')
let titleBusy = false;
function renderTitles() {
  const got = account.ach?.got;
  const box = $('pane-title');
  if (!got) { box.innerHTML = '<p class="msg">불러오는 중…</p>'; return; }
  const cur = myTitle();
  const n = ACHS.filter((a) => got.has(a.id)).length;
  let html = `<div class="t-now"><span>지금 단 칭호</span>${cur ? tpill(cur, myNemesis()) : '<em>없음</em>'}`
    + (cur ? `<button class="small ghost" data-title="" ${titleBusy ? 'disabled' : ''}>떼기</button>` : '')
    + `<span class="t-count">업적 ${n} / ${ACHS.length}</span></div><div class="t-list">`;
  for (const [cat, catName] of ACH_CATS) {
    html += `<h4>${catName}</h4><ul>`;
    for (const a of ACHS.filter((x) => x.cat === cat)) {
      const have = got.has(a.id);

      const on = cur === a.id;
      let right;
      if (on) right = '<span class="t-on">✓ 달고 있음</span>';
      else if (have) right = `<button class="small primary" data-title="${a.id}" ${titleBusy ? 'disabled' : ''}>달기</button>`;
      else right = `<span class="t-lock">🔒 🪙 ${REWARD[a.grade]}${a.live ? '' : '<small>준비 중</small>'}</span>`;
      html += `<li class="ach${have ? ' got' : ''}${on ? ' on' : ''}"><div class="a-main">`
        + `<div class="a-name">${esc(a.name)} <span class="stars">${'★'.repeat(a.grade)}</span></div>`
        + `<div class="a-cond">${esc(a.cond)}</div>`
        + `<span class="tpill${have ? '' : ' off'}">${have ? esc(titleText(a.id, myNemesis())) : '칭호 ???'}</span></div>${right}</li>`;
    }
    html += '</ul>';
  }
  box.innerHTML = html + '</div>';
}
$('pane-title').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-title]');
  if (!b || b.disabled || titleBusy) return;
  playUI('click');
  titleBusy = true;
  renderTitles();
  const r = await setTitle(b.dataset.title || null);
  titleBusy = false;
  if (r.status === 'ok') setMsg(b.dataset.title ? `🏅 칭호 「${esc(titleText(b.dataset.title, myNemesis()))}」을(를) 달았어요` : '칭호를 뗐어요', true);
  else setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
  renderTitles();
});

/* ───────── 대기실 무대 (안 B '자리 위에 서기') ─────────
   아래 카드의 자리 칸마다 바로 위에 그 선수의 3D 캐릭터가 서 있다. 장착한 탁구채를 몸 옆에 들고,
   머리 위에는 닉네임 + 아이템 이름 (등급은 색·빛으로만). 빈자리는 흐린 실루엣 */
const STAGE = { cam: [0, 1.0, 5.0], look: [0, 1.05, 0], fov: 46, z: 1.3, cardAt: 0.73, headY: 1.45 };
const GLOW = { legend: '#ffb020', rare: '#b07cff' };
// 발밑 빛 고리는 장착한 것(탁구채·몸) 중 가장 높은 등급 색
const topGrade = (look) => ['legend', 'rare'].find((g) => ['paddle', 'body'].some((c) => equipped(look, c)?.grade === g)) || null;
const stage = { seats: [], els: [], on: false, fov: 50 };

// 장착한 탁구채 + 몸(기본이 아닐 때만) 알약
function lookPills(look) {
  return ['paddle', 'body'].map((c) => equipped(look, c)).filter((it, i) => i === 0 || it.grade !== 'default')
    .map((it) => `<div class="it g-${it.grade}">${swatch(it)}${esc(it.name)}</div>`).join('');
}
function renderStageLabels() {
  const box = $('room-labels');
  box.innerHTML = stage.seats.map(({ team, m }) => {
    if (!m) return '<div class="rl ghost"><div class="nm">빈자리 · 기다리는 중</div></div>';
    const tags = (m.id === myId ? '<small>나</small>' : '') + (m.host ? '<small>👑</small>' : '');
    return `<div class="rl">${tpill(m.title, m.titleX)}<div class="nm t${team}">${esc(m.nick)}${tags}</div>${lookPills(m.look)}</div>`;
  }).join('');
  stage.els = [...box.children];
}

function stageFrame(now) {
  if (!stage.on) { stage.on = true; stage.fov = world.camera.fov; }
  world.setFocus(0);
  setEcho(0);
  const H = innerHeight;
  const cardTop = $('room-card').getBoundingClientRect().top;
  world.setStageView(Math.max(200, cardTop / STAGE.cardAt));
  world.camera.fov = STAGE.fov;
  world.camera.position.set(...STAGE.cam);
  world.camera.lookAt(...STAGE.look);
  world.camera.updateProjectionMatrix();
  world.setBall([0, -1, 0], false);
  world.ring.visible = false;
  world.aim.visible = false;
  const used = new Set();
  stage.seats.forEach(({ team, slot, m }, i) => {
    const c = world.team[team][slot];
    used.add(c);
    const el = $(`team-${team}`).children[slot];
    if (!el) { c.group.visible = false; return; }
    const r = el.getBoundingClientRect();
    const x = world.screenToX(r.left + r.width / 2, Math.min(cardTop, H) * 0.6, STAGE.z);
    applyLook(c, m ? m.look : {});
    c.group.visible = true;
    c.setOpacity(m ? 1 : 0.16, m ? 1 : 0);
    c.setTag(null);
    c.setHold(true);
    c.setGlow(m ? GLOW[topGrade(m.look)] : null);
    c.group.position.set(x, 0, STAGE.z);
    c.group.rotation.y = Math.PI - x * 0.08; // 가운데 쪽으로 살짝
    c.body.position.y = Math.sin(now * 2.6 + i) * 0.008;
    holdPose(c, now, i);
    const lb = stage.els[i];
    if (lb) {
      const [px, py] = world.toScreen(x, STAGE.headY, STAGE.z);
      lb.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  for (const side of world.team) for (const c of side) if (!used.has(c)) c.group.visible = false;
  setListener(STAGE.cam, [1, 0, 0]);
}

// 몸 옆에 든 자세 + 연습 스윙 (c.stSwing부터: 뒤로 빼기 → 휘두르기 → 제자리, 블록은 툭 내밀기)
function holdPose(c, now, i) {
  let yaw = -0.25 + Math.sin(now * 1.7 + i) * 0.05, pitch = -0.15, twist = 0;
  const st = now - (c.stSwing ?? -9);
  if (st < 0.5) {
    if (c.stBlock) {
      const k = Math.sin(Math.min(1, st / 0.25) * Math.PI);
      yaw += 0.35 * k;
      pitch += 0.15 * k;
    } else {
      let a;
      if (st < 0.07) a = (-st / 0.07) * 0.6;
      else if (st < 0.2) { const u = (st - 0.07) / 0.13; a = -0.6 + 1.9 * (1 - (1 - u) * (1 - u)); }
      else { const u = (st - 0.2) / 0.3; a = 1.3 * (1 - u * u * (3 - 2 * u)); }
      yaw += a;
      pitch += Math.max(0, a) * 0.45;
      twist = a * 0.22;
    }
  }
  c.arm.rotation.set(pitch, yaw, 0.12);
  c.body.rotation.set(0, twist, 0);
}

/* 연습 스윙: 대기실에서 화면을 누른 채 위로 밀면 휘두르고 (그냥 누르면 툭), 내 탁구채 소리가 난다.
   다른 사람에게도 보이고 들린다 (조금 작게, 그 캐릭터 쪽에서). 경기와 같은 조작: 누르기 직전 0.15초 ~ 직후 0.12초 움직임 */
const SWING = { before: 0.15, after: 0.12, gap: 0.45, perfect: 40, good: 12 };
const swMoves = []; // 최근 마우스 위치 { t, y }
let swDown = 0;
const mySeat = () => stage.seats.find((x) => x.m && x.m.id === myId);

function practiceSwing(id, grade) {
  const seat = stage.seats.find((x) => x.m && x.m.id === id);
  if (!seat) return;
  const c = world.team[seat.team][seat.slot];
  const now = performance.now() / 1000;
  if (now - (c.stSwing ?? -9) < 0.3) return; // 너무 자주 오면 무시
  c.stSwing = now;
  c.stBlock = grade === 'block';
  const it = equipped(seat.m.look, 'paddle');
  const me = id === myId;
  const p = c.group.position;
  playHit(grade, me ? null : [p.x, 1.0, p.z], null, it.sound || null);
}

function stageActive() {
  return stage.on && room && !room.inGame && !$('room').classList.contains('hidden');
}
$('c').addEventListener('pointermove', (e) => {
  if (!stageActive()) return;
  const t = e.timeStamp / 1000; // 이벤트가 생긴 시각 (느린 PC에서 처리가 늦어도 정확하게)
  swMoves.push({ t, y: e.clientY });
  while (swMoves.length && swMoves[0].t < t - 0.5) swMoves.shift();
});
$('c').addEventListener('pointerdown', (e) => {
  if (!stageActive() || e.button !== 0) return;
  if (!mySeat()) { hud.toast('팀을 고르면 연습 스윙을 할 수 있어요'); return; }
  const t = e.timeStamp / 1000;
  if (t - swDown < SWING.gap) return;
  swDown = t;
  swMoves.push({ t, y: e.clientY });
  initAudio();
  setTimeout(() => {
    if (!stageActive()) return;
    // 이 구간에서 가장 아래 → 그 뒤 가장 위로 올라간 만큼 = 위로 민 거리(px)
    const pts = swMoves.filter((m) => m.t >= t - SWING.before && m.t <= t + SWING.after + 0.05);
    let low = -Infinity, up = 0;
    for (const m of pts) { low = Math.max(low, m.y); up = Math.max(up, low - m.y); }
    const grade = up >= SWING.perfect ? 'perfect' : up >= SWING.good ? 'good' : 'block';
    practiceSwing(myId, grade);
    room.link.send({ k: 'sw', id: myId, g: grade });
  }, SWING.after * 1000);
});

// 대기실을 떠나면 원래 모습으로 (경기 자세, 빛 고리 끄기, 카메라 화면 비율)
function stageOff() {
  if (!stage.on) return;
  stage.on = false;
  for (const side of world.team) for (const c of side) { c.setHold(false); c.setGlow(null); }
  world.camera.fov = stage.fov;
  world.setStageView(null);
}

/* ───────── 경기 시작 전 VS 소개 (3초, 1v1·2v2) ─────────
   상대 팀 → 우리 팀을 차례로 비추며 각자 탁구채를 한 번 휘두르고 (그 탁구채 소리),
   마지막에 옆에서 크게 보며 VS + '준비하시고, 스매시!'. 건너뛰기 없음 (사용자 결정).
   모든 PC가 'go'를 받은 순간부터 3초. 방장은 소개가 끝나야 경기를 시작한다(match.start) */
const INTRO = { len: 3.0, p2: 1.0, p3: 2.0, go: 2.4, swing: 0.2, gap: 0.22, far: 2.3, near: 1.85, y: 1.35, lookY: 1.0, fov: 45, wide: 5.2, wideY: 2.7, wideLook: 0.15 };
let intro = null;

function startIntro(players, mySide, mode) {
  const nm = playerNames(), lk = looks();
  const seats = players.map((p) => ({ side: p.side, slot: p.slot || 0, id: p.id, name: nm[p.side][p.slot || 0], look: lk[p.side][p.slot || 0] }))
    .sort((a, b) => a.side - b.side || a.slot - b.slot);
  intro = { t0: performance.now() / 1000, mySide, mode, seats, phase: 0, swung: new Set(), go: false, fov: world.camera.fov };
  if (game) game.paused = true;
  document.body.classList.add('intro');
  const card = (s) => {
    return `<div class="vi-card">${roomTpill(s.id)}<div class="nm t${s.side}">${esc(s.name)}${s.id === myId ? '<small>나</small>' : ''}</div>${lookPills(s.look)}</div>`;
  };
  const team = (side) => `<div class="vi-team">${side === mySide ? (mode === '2v2' ? '우리 팀' : '나') : (mode === '2v2' ? '상대 팀' : '상대')} · ${TEAM_NAME[side]}</div>`
    + seats.filter((s) => s.side === side).map(card).join('');
  $('vi-opp').innerHTML = team(1 - mySide);
  $('vi-us').innerHTML = team(mySide);
  $('vs-intro').className = 'vs-intro';
}

// 소개 중이면 true (그동안 game.update 대신 소개 화면을 그린다)
function introFrame(now) {
  const I = INTRO;
  const t = now - intro.t0;
  if (t >= I.len) { endIntro(); return false; }
  const el = $('vs-intro');
  const ph = t < I.p2 ? 1 : t < I.p3 ? 2 : 3;
  if (ph !== intro.phase) {
    intro.phase = ph;
    el.className = `vs-intro p${ph}${ph > 1 ? ' flash' : ''}`;
    if (ph === 3) playUI('rare');
  }
  if (t >= I.go && !intro.go) { intro.go = true; el.classList.add('go'); playUI('turn'); }
  world.setFocus(0);
  setEcho(0);
  world.setBall([0, -1, 0], false);
  world.ring.visible = false;
  world.aim.visible = false;

  // 선수: 실제 경기 자리에 서서 탁구채를 몸 옆에 들고, 자기 팀이 소개될 때 한 번 휘두른다
  const used = new Set();
  intro.seats.forEach((s, i) => {
    const c = world.team[s.side][s.slot];
    used.add(c);
    const m = sideSign(s.side);
    const x = intro.mode === '2v2' ? (s.slot === 0 ? -0.45 : 0.45) * m : 0; // 1번이 (그 팀이 보기에) 왼쪽
    c.group.visible = true;
    c.setOpacity(1, 1);
    c.setTag(null);
    c.setHold(true);
    c.group.position.set(x, 0, m * CHAR_Z);
    c.group.rotation.y = s.side === 0 ? 0 : Math.PI;
    c.body.position.y = Math.sin(now * 2.6 + i) * 0.008;
    const at = (s.side === intro.mySide ? I.p2 : 0) + I.swing + I.gap * s.slot;
    if (t >= at && !intro.swung.has(i)) {
      intro.swung.add(i);
      c.stSwing = now;
      c.stBlock = false;
      playHit('perfect', null, null, equipped(s.look, 'paddle').sound || null);
    }
    holdPose(c, now, i);
  });
  for (const side of world.team) for (const c of side) if (!used.has(c)) c.group.visible = false;

  // 카메라: 1) 상대 팀 앞에서 천천히 다가가기 2) 우리 팀 3) 옆에서 크게 (우리 팀이 왼쪽)
  let pos, look;
  if (ph < 3) {
    const side = ph === 1 ? 1 - intro.mySide : intro.mySide;
    const k = ease(ph === 1 ? t / I.p2 : (t - I.p2) / (I.p3 - I.p2));
    const m = sideSign(side);
    const d = I.far + (I.near - I.far) * k;
    pos = [(0.3 - 0.6 * k) * m, I.y, m * (CHAR_Z - d)];
    look = [0, I.lookY, m * CHAR_Z];
  } else {
    const k = ease((t - I.p3) / (I.len - I.p3));
    const sx = intro.mySide === 0 ? 1 : -1;
    pos = [sx * (I.wide - 0.5 * k), I.wideY - 0.2 * k, 0];
    look = [0, I.wideLook, 0];
  }
  world.camera.fov = I.fov;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(...pos);
  world.camera.lookAt(...look);
  return true;
}

// 소개를 끝내고 경기로 (start=false: 경기가 중간에 취소됨)
function endIntro(start = true) {
  if (!intro) return;
  const { mode, fov } = intro;
  intro = null;
  document.body.classList.remove('intro');
  $('vs-intro').className = 'vs-intro hidden';
  for (const side of world.team) for (const c of side) c.setHold(false);
  world.camera.fov = fov;
  world.camera.updateProjectionMatrix();
  if (!start || !game) return;
  game.paused = false;
  // 경기 화면 모습으로 되돌리기 (Game 생성 때와 같게: 내 캐릭터는 반투명)
  for (const side of [0, 1]) for (const slot of [0, 1]) {
    const c = world.team[side][slot];
    const isMe = side === game.mySide && slot === game.mySlot;
    c.group.visible = slot === 0 || mode === '2v2';
    c.setOpacity(isMe ? 0.38 : 1, isMe ? 0.9 : 1);
  }
  hud.toast(mode === '2v2' ? '2v2 시작! A1 → B1 → A2 → B2 순서로 쳐요' : '경기 시작! 5점 먼저 내면 승리', 2000);
  if (match && room && room.host) match.start(performance.now() / 1000);
}

/* ───────── 매 프레임 ───────── */
function loop() {
  const now = performance.now() / 1000;
  // 내 스윙 판단을 먼저 끝내고 나서 경기 판정 (느린 PC에서도 늦게 친 공이 버려지지 않게)
  if (game) game.decideHit(now + game.offset);
  if (match) match.update(now);
  // 위치가 있는 소리 크기: 경기·대기실(연습 스윙)은 그대로, 로비·꾸미기 배경 랠리는 작게
  if (game) {
    setQuiet(1);
    stageOff();
    if (!(intro && introFrame(now))) game.update(now + game.offset);
  }
  else if (room && !room.inGame && !$('room').classList.contains('hidden')) { setQuiet(1); stageFrame(now); }
  else {
    setQuiet(LOBBY_QUIET);
    stageOff();
    // 로비 배경: 두 캐릭터가 랠리를 주고받고, 카메라는 옆에서 천천히 흔들린다
    // 꾸미기 화면에서도 랠리는 계속되고, 카메라만 내 캐릭터 등 뒤로 스르륵 옮겨 간다
    world.setFocus(0);
    setEcho(0);
    const dt = Math.min(0.1, now - camBlend.last || 0.016);
    camBlend.last = now;
    const L = LOBBY_CAM;
    const a = L.angle + Math.sin(now * L.speed) * L.sway;
    const lobbyPos = [Math.sin(a) * L.dist, L.y, Math.cos(a) * L.dist];
    world.camera.position.set(...lobbyPos);
    world.camera.lookAt(0, L.lookY, 0);
    // 메뉴가 왼쪽에 있으니 탁구대를 화면 오른쪽으로 비켜 보이게 (카메라를 옆으로 민다)
    if (innerWidth >= 760) world.camera.translateX(-L.shift * Math.min(1, innerWidth / innerHeight / 1.6));
    const camL = world.camera.position.toArray();
    // 시선도 같이 옮겨야 하니 로비 카메라가 보는 점을 구해 둔다 (translateX로 민 만큼 같이)
    const lookL = [camL[0] - lobbyPos[0], L.lookY, camL[2] - lobbyPos[2]];
    // 꾸미기 카메라: 내 캐릭터를 부드럽게 따라간다
    const me = world.team[0][0];
    camBlend.x += (me.group.position.x - camBlend.x) * (1 - Math.exp(-dt * PV.follow));
    const ox = camBlend.x + (innerWidth < 760 ? 0.1 : PV.x);
    const camD = [ox, PV.y, CHAR_Z + PV.back];
    const lookD = [ox, PV.lookY, CHAR_Z];
    const target = preview ? 1 : 0;
    camBlend.p += Math.sign(target - camBlend.p) * Math.min(Math.abs(target - camBlend.p), dt / PV.blend);
    const t = ease(camBlend.p);
    if (t > 0) {
      world.camera.position.set(...lerp3(camL, camD, t));
      world.camera.lookAt(...lerp3(lookL, lookD, t));
    }
    world.ring.visible = false;
    world.aim.visible = false;
    applyLook(world.team[0][0], preview ? preview.look : myEquip());
    applyLook(world.team[1][0], {});
    for (const side of [0, 1]) {
      world.team[side][0].group.visible = true;
      world.team[side][0].setOpacity(1, 1);
      world.team[side][0].setTag(null);
      world.team[side][1].group.visible = false;
    }
    // 배경 랠리 소리: 로비·꾸미기 화면에서, 카메라 자리에서 듣는 것처럼 작게
    // (좌우 소리 방향도 카메라를 따라 로비 각도 → 꾸미기 각도(정면)로 옮겨 간다)
    const cp = world.camera.position;
    setListener([cp.x, cp.y, cp.z], lerp3([Math.cos(a), 0, -Math.sin(a)], [1, 0, 0], t));
    const rallySound = !$('lobby').classList.contains('hidden') || !$('dress').classList.contains('hidden');
    lobbyDemo.update(now, world.chars, world, rallySound);
  }
  // 움직이는 옷(전설 효과·병아리 파닥): 보이는 캐릭터만
  const odt = Math.min(0.1, now - (loop.last || now));
  loop.last = now;
  for (const side of world.team) for (const c of side) if (c.group.visible) c.tickOutfit(now, odt);
  // 배경: 방(대기실·경기)에서는 방장이 장착한 배경을 모두에게, 그 밖(로비·꾸미기·혼자 하기)은 내 것(입어 보는 중이면 그것)
  const arenaLook = room ? room.hostM?.look : preview && !game ? preview.look : myEquip();
  world.setArena(arenaOf(arenaLook));
  world.setBallSkin(ballOf(arenaLook)); // 탁구공도 배경처럼: 방에서는 방장 것

  world.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__smash = { PV, STAGE, INTRO, world, shop: { testCoins, gacha, equipItem, myEquip }, get intro() { return intro; }, get game() { return game; }, get match() { return match; }, get room() { return room; } };
