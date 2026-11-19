import { myEquip, myTitle } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { Game } from '../game.js';
import { applyLook } from '../items.js';
import { joinRoom } from '../net.js';
import { crowdJoin, crowdKeep, renderCheerBar } from './cheer.js';
import { hud } from './hud.js';
import { lobbyRooms } from './lobbyList.js';
import { enterRoom, leaveRoom, myId, room, takeRoomLink } from './room.js';
import { show, stopGame } from './screen.js';
import { $, game, myNemesis, myNick, setGame, world } from './state.js';

export let watch = null; // 관전 중인 방 (아래 '관전')
let watchView = 'side'; // 관전 카메라 (다른 경기로 넘어가도 유지)
/* ───────── 관전 ─────────
   선수 채널은 듣기만(명단에도 안 들어감, 말도 안 함) → 선수 PC에 부담 0.
   시계: 방장이 보내는 시각(pong의 th, 이벤트의 t)과 받은 순간의 차이 중 가장 큰 값 = 방장 시계 - 내 시계 - (가장 짧은 전달 시간).
   그래서 화면은 방장보다 전달 시간만큼 늦게, 끊김 없이 흘러간다. 중간에 들어오면 다음 서브부터 보여 준다.
   관중 명단은 따로 관중석 채널(pingpong-watch-XXXX)에서, 16명까지. */
export const WATCH_MAX = 16;
// keep: 같은 방이면 관중석 채널은 나가지 않고 그대로. link·members: 대기실 관전에서 채널을 넘겨받음 (나갔다 다시 들어가지 않게)
// live: 경기 시작 신호('go')를 직접 받았음 → 처음부터 빠짐없이 받으니 '다음 서브부터'가 아니라 첫 서브부터
export function startWatch(r, { keep = false, link = null, members = null, live = false } = {}) {
  initAudio();
  if (!link) playUI('click');
  if (link) takeRoomLink(); else leaveRoom();
  stopGame(keep);
  const me = { id: myId, nick: myNick(), at: Date.now() };
  watch = { code: r.code, mode: r.mode, pl: r.pl, nick: r.nick, members: [], hostM: null, sawHost: false, seen: new Set(), offs: [], live: false, count: 0, fromGo: live };
  const w = watch;
  const handlers = {
    onMsg: (m) => onWatchMsg(w, m),
    onMembers: (list) => onWatchMembers(w, list),
    onStatus: (st, text) => { if (st === 'error' && watch === w) endWatch(text); },
  };
  if (link) { w.link = link; link.setHandlers(handlers); } else w.link = joinRoom(r.code, me, handlers, { listen: true });
  // 관중석 명단에 들어가기 (16명 제한은 onCrowdList). 내 꾸미기·칭호도 같이 → 관중석에 내 캐릭터로 선다
  if (!(keep && crowdKeep(r.code))) crowdJoin(r.code, { ...me, team: null, look: myEquip(), title: myTitle(), titleX: myNemesis() });
  show('hud');
  const n = watchNames(w);
  setGame(new Game(world, { mySide: 0, mode: r.mode, hud, spectator: true, names: n.names, playerNames: n.per, playerTitles: n.tl, looks: [[{}, {}], [{}, {}]], send: { toss() {}, swing() {} } }));
  game.view = watchView; // 넘나들어도 고른 카메라 그대로
  hud.score([0, 0]);
  hud.stats(game.stats);
  hud.hint(live ? '곧 경기가 시작돼요!' : '다음 서브부터 중계해요…');
  if (members?.length) onWatchMembers(w, members);
  document.body.classList.add('watching');
  renderWatchBar();
  renderCheerBar();
  // 방장 신호가 안 오면(방이 막 끝났거나 사라짐) 로비로
  setTimeout(() => { if (watch === w && !w.sawHost) endWatch('경기를 찾을 수 없어요'); }, 6000);
}

// toLobby = false: 다른 경기로 넘어가는 중 (로비로 안 돌아감). keepCrowd: 같은 방 다음 경기로 이어 보기
export function endWatch(msg, toLobby = true, keepCrowd = false) {
  if (!watch) return;
  const w = watch;
  watch = null;
  w.link.leave();
  document.body.classList.remove('watching');
  $('watch-bar').classList.add('hidden');
  if (game) watchView = game.view;
  stopGame(keepCrowd);
  if (!toLobby) return;
  show('lobby');
  if (msg) hud.toast(msg, 2600);
}

// 지금 관전할 수 있는 방들 (코드 순, 넘나들 때 순서가 흔들리지 않게)
export const watchable = () => lobbyRooms.filter((r) => r.play && r.w !== false && r.pl).sort((a, b) => (a.code < b.code ? -1 : 1));
// 관전 중 ◀ ▶: 다른 경기로 바로 넘어가기
function hopWatch(dir) {
  if (!watch) return;
  const list = watchable();
  const others = list.filter((r) => r.code !== watch.code);
  if (!others.length) { hud.toast('지금은 다른 경기가 없어요', 1800); return; }
  const i = list.findIndex((r) => r.code === watch.code);
  const next = i < 0 ? others[0] : list[(i + dir + list.length) % list.length];
  endWatch(null, false);
  startWatch(next);
}
// 🎲 아무 경기나 보기
export function randomWatch() {
  const list = watchable().filter((r) => r.code !== watch?.code);
  if (!list.length) { hud.toast('지금 경기 중인 방이 없어요', 1800); return; }
  const r = list[(Math.random() * list.length) | 0];
  if (watch) endWatch(null, false);
  startWatch(r);
}

// 선수 이름 (쪽별, 2v2는 'A1·A2'), 이름표용 [side][slot]
function watchNames(w) {
  const nick = (id) => w.members.find((m) => m.id === id)?.nick || '선수';
  const names = [0, 1].map((s) => w.pl.filter((p) => p.side === s).sort((a, b) => a.slot - b.slot).map((p) => nick(p.id)).join('·'));
  const per = [[], []], tl = [[], []];
  for (const p of w.pl) {
    per[p.side][p.slot] = nick(p.id);
    const m = w.members.find((x) => x.id === p.id);
    tl[p.side][p.slot] = m ? titleText(m.title, m.titleX) : '';
  }
  return { names, per, tl };
}

function onWatchMembers(w, list) {
  if (watch !== w) return;
  w.members = list;
  const host = list.find((m) => m.host);
  if (host) { w.sawHost = true; w.hostM = host; }
  if (w.sawHost && !host) { endWatch('방장이 나가서 중계가 끝났어요'); return; }
  // 선수가 나감: 한 번이라도 명단에서 본 선수가 사라졌을 때만 (처음엔 명단이 한 명씩 들어올 수 있음)
  // 경기가 끝난 것 → 대기실 관전으로 (빈자리가 생겼으니 들어갈 수도 있다)
  for (const m of list) w.seen.add(m.id);
  if (w.pl.some((p) => w.seen.has(p.id) && !list.some((m) => m.id === p.id))) { hud.toast('선수가 나가서 경기가 끝났어요', 2400); watchDone(w); return; }
  if (!game) return;
  // 선수 이름·꾸미기 (presence에서)
  const n = watchNames(w);
  game.names = n.names;
  game.playerNames = n.per;
  game.playerTitles = n.tl;
  for (const p of w.pl) applyLook(world.team[p.side][p.slot], list.find((m) => m.id === p.id)?.look);
  hud.score(game.score);
  renderCheerBar();
}

/* ───────── 경기가 끝난 뒤 (관전 5·6단계) ─────────
   관중은 방에 그대로 남아 대기실 관전으로 돌아간다 (채널을 넘겨줌: 나갔다 다시 들어가지 않음).
   대기실 관전 화면에서 '🏓 참가'(빈자리) / '🔔 자리 나면 알려 줘요' / 다른 경기 보기. 다음 경기가 시작되면 자동으로 이어서 중계.
   아무도 쫓겨나지 않는다(사용자 확정). */
export function watchDone(w) {
  if (watch !== w || w.over) return;
  w.over = true;
  $('result').classList.add('hidden');
  hud.hint('');
  const { code, mode, link } = w;
  const members = link.members();
  watch = null;
  document.body.classList.remove('watching');
  $('watch-bar').classList.add('hidden');
  if (game) watchView = game.view;
  stopGame(true);
  enterRoom(code, false, mode, { spectate: true, link, members });
}
function watchClock(w, hostT) {
  const off = hostT - performance.now() / 1000;
  w.offs.push(off);
  if (w.offs.length > 30) w.offs.shift();
  const best = Math.max(...w.offs);
  if (game) game.offset = best;
}

function onWatchMsg(w, m) {
  if (watch !== w || !game || w.over) return; // 경기가 끝난 뒤엔 새 경기를 다시 들어가서 받는다
  if (m.k === 'pong' && typeof m.th === 'number') { watchClock(w, m.th); return; }
  if (m.k !== 'ev' || !m.ev) return;
  const ev = m.ev;
  if (typeof ev.t === 'number' && (ev.type === 'shot' || ev.type === 'toss')) watchClock(w, ev.t);
  if (!w.live && ev.type === 'gameOver') { watchDone(w); return; } // 중계 시작 전에 경기가 끝남
  if (!w.live) {
    // 다음 서브부터 중계
    if (ev.type !== 'serveReady') return; // 시계는 바로 뒤 토스·샷의 방장 시각으로 맞춘다 (watchClock이 적용 전에 먼저)
    w.live = true;
    hud.hint('');
    if (Array.isArray(ev.score)) { game.score = [...ev.score]; hud.score(game.score); } // 직전 득점은 못 받았으니 서브 신호의 점수로 맞춤
  }
  game.onEvent(ev);
}

export function renderWatchBar() {
  if (!watch || !game) return;
  $('watch-bar').classList.remove('hidden');
  const list = watchable(), i = list.findIndex((r) => r.code === watch.code);
  const pos = list.length > 1 && i >= 0 ? ` (${i + 1}/${list.length})` : '';
  $('watch-who').textContent = `👀 ${watch.nick}의 방${pos} · 관중 ${watch.count || 1}명`;
  for (const b of $('watch-bar').querySelectorAll('[data-hop]')) b.disabled = !list.some((r) => r.code !== watch.code);
  for (const b of $('watch-bar').querySelectorAll('[data-view]')) b.classList.toggle('on', String(game.view) === b.dataset.view);
}
$('watch-bar').addEventListener('click', (e) => {
  const hop = e.target.closest('[data-hop]');
  if (hop && watch) { playUI('click'); hopWatch(+hop.dataset.hop); return; }
  const b = e.target.closest('[data-view]');
  if (!b || !game || !game.spectator) return;
  playUI('click');
  game.view = b.dataset.view === 'side' ? 'side' : +b.dataset.view;
  renderWatchBar();
});
