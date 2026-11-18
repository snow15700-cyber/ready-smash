import { joinLobby } from '../net.js';
import { hud } from './hud.js';
import { capacity, enterRoom, room } from './room.js';
import { curScreen } from './screen.js';
import { $, IS_MOBILE, MOBILE_MSG, esc, game, myNick } from './state.js';
import { randomWatch, renderWatchBar, renderWatchNext, startWatch, watch, watchable } from './watch.js';

let lobbyLink = null; // 로비 채널
export let lobbyRooms = []; // 지금 열린 방들
let lobbySent = ''; // 마지막으로 올린 내 방 정보
/* ───────── 로비 방 목록 ─────────
   로비 채널(pingpong-lobby)은 로비 화면에 있을 때 + 내가 방장일 때만 붙어 있다.
   방장은 '내 방' 정보를 상태가 바뀔 때만 올린다(사람 수·경기 시작/끝·점수). */
export function syncLobby() {
  // 관전 중에도 붙는다(듣기만): 다른 경기로 넘어갈 목록이 필요해서. 선수 PC와는 상관없음
  const need = curScreen === 'lobby' || !!(room && room.host) || !!watch;
  if (need && !lobbyLink) {
    lobbySent = '';
    lobbyLink = joinLobby((list) => { lobbyRooms = list; renderRoomList(); renderWatchBar(); renderWatchNext(); });
  } else if (!need && lobbyLink) {
    lobbyLink.leave();
    lobbyLink = null;
    lobbyRooms = [];
  }
  announceRoom();
}
export function announceRoom() {
  if (!lobbyLink) return;
  if (!room || !room.host || !room.mode) {
    if (lobbySent) { lobbyLink.untrack(); lobbySent = ''; }
    return;
  }
  const info = {
    code: room.code, mode: room.mode, nick: myNick(), n: room.members.length || 1, cap: capacity(), play: !!room.inGame, score: room.inGame ? room.score || [0, 0] : null,
    w: room.watchOk, // 관전 허용
    pl: room.inGame && room.players ? room.players.map((p) => ({ id: p.id, side: p.side, slot: p.slot || 0 })) : null, // 중간에 들어온 관중이 선수 자리를 알게
  };
  const key = JSON.stringify(info);
  if (key === lobbySent) return;
  lobbySent = key;
  lobbyLink.track(info);
}
// 목록 순서: 들어갈 수 있는 방 → 경기 중 → 꽉 찬 방 (같으면 코드 순, 깜빡이지 않게)
function roomListHTML(max) {
  const mine = room?.code;
  const rank = (r) => (r.play ? 1 : r.n >= r.cap ? 2 : 0);
  const list = lobbyRooms.filter((r) => r.code !== mine).sort((a, b) => rank(a) - rank(b) || (a.code < b.code ? -1 : 1));
  if (!list.length) return '<p class="rl-empty">아직 열린 방이 없어요<br /><small>방을 만들고 친구를 불러 보세요!</small></p>';
  const row = (r) => {
    const full = !r.play && r.n >= r.cap;
    const state = r.play ? `<span class="rl-st play">● 경기 중 <b>${(r.score || [0, 0]).join(' : ')}</b></span>` : full ? '<span class="rl-st full">꽉 참</span>' : `<span class="rl-st wait">● 대기 중 ${r.n}/${r.cap}</span>`;
    const canWatch = r.play && r.w !== false && r.pl;
    const act = r.play ? (canWatch ? '<span class="rl-act watch">👀 관전</span>' : '<span class="rl-act soon">관전 막힘</span>') : full ? '' : IS_MOBILE ? '<span class="rl-act soon">🔒 PC</span>' : '<span class="rl-act">참가</span>';
    const can = (!r.play && !full && !IS_MOBILE) || canWatch;
    return `<button class="rl-row${can ? '' : ' off'}" data-code="${esc(r.code)}"${can ? '' : ' tabindex="-1"'}><span class="rl-mode">${r.mode === '2v2' ? '2:2' : '1:1'}</span><span class="rl-nm"><b>${esc(r.nick)}</b>의 방</span>${state}${act}</button>`;
  };
  const more = list.length > max ? `<p class="rl-more">외 ${list.length - max}개 방</p>` : '';
  return list.slice(0, max).map(row).join('') + more;
}
function renderRoomList() {
  // 로비 안 목록은 화면 높이에 맞춰 줄 수를 줄인다 (아래 버튼과 겹치지 않게)
  const lbMax = innerHeight >= 860 ? 3 : innerHeight >= 740 ? 2 : 1;
  $('lb-rooms').innerHTML = roomListHTML(lbMax);
  $('btn-random-watch').classList.toggle('hidden', !watchable().some((r) => r.code !== room?.code));
}
addEventListener('resize', renderRoomList);
$('btn-random-watch').addEventListener('click', () => { if (!game) randomWatch(); });
$('lb-rooms').addEventListener('click', (e) => {
  const b = e.target.closest('.rl-row');
  if (!b) return;
  const r = lobbyRooms.find((x) => x.code === b.dataset.code);
  if (!r) return;
  if (IS_MOBILE && !r.play) { hud.toast(MOBILE_MSG, 2600); return; } // 휴대폰: 참가는 PC에서만, 관전은 OK
  if (r.play) {
    if (r.w === false || !r.pl) { hud.toast('이 방은 관전을 막아 두었어요', 2200); return; }
    startWatch(r);
    return;
  }
  if (r.n >= r.cap) { hud.toast('방이 꽉 찼어요', 2000); return; }
  enterRoom(r.code, false);
});
