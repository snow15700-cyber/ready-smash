import { joinLobby } from '../net.js';
import { room } from './room.js';
import { curScreen } from './screen.js';
import { myNick } from './state.js';
import { renderWatchBar, watch } from './watch.js';

let lobbyLink = null; // 로비 채널
export let lobbyRooms = []; // 지금 경기 중이거나 곧 시작하는 광장 탁구대들 (방장이 올림)
let lobbySent = ''; // 마지막으로 올린 내 방 정보
/* ───────── 로비 채널 (탁구대 상태판) ─────────
   로비 채널(pingpong-lobby)은 광장 화면에 있을 때 + 내가 방장일 때 + 관전 중일 때만 붙어 있다.
   방장은 '내 경기' 정보를 상태가 바뀔 때만 올린다(사람 수·경기 시작/끝·점수) — 예전 방 목록과 같은 양.
   광장은 이걸로 '경기 중인 탁구대'(점수판·관전)를 안다 (광장 채널에서는 경기 중인 선수가 빠져 있어서). */
export function syncLobby() {
  // 관전 중에도 붙는다(듣기만): 다른 경기로 넘어갈 목록이 필요해서. 선수 PC와는 상관없음
  const need = curScreen === 'lobby' || !!room?.host || !!watch;
  if (need && !lobbyLink) {
    lobbySent = '';
    lobbyLink = joinLobby((list) => { lobbyRooms = cleanRooms(list); renderWatchBar(); });
  } else if (!need && lobbyLink) {
    lobbyLink.leave();
    lobbyLink = null;
    lobbyRooms = [];
  }
  announceRoom();
}
// 받은 정보 다듬기 (다른 PC가 보낸 것은 믿지 않고 모양을 확인)
function cleanRooms(list) {
  const out = [];
  for (const r of list) {
    if (!r || typeof r.code !== 'string' || !/^[A-Z0-9]{4}$/.test(r.code)) continue;
    const pt = Number.isInteger(r.pt) && r.pt >= 0 && r.pt < 8 ? r.pt : null;
    const score = Array.isArray(r.score) && r.score.length === 2 ? r.score.map((v) => Math.max(0, Math.min(99, v | 0))) : null;
    const pl = Array.isArray(r.pl) ? r.pl.filter((p) => p && typeof p.id === 'string').slice(0, 4).map((p) => ({ id: p.id, side: p.side ? 1 : 0, slot: p.slot ? 1 : 0 })) : null;
    out.push({ code: r.code, mode: r.mode === '2v2' ? '2v2' : '1v1', nick: typeof r.nick === 'string' ? r.nick.slice(0, 10) : '방장', n: r.n | 0, cap: r.cap | 0, play: !!r.play, score, pl, pt });
  }
  return out;
}
export function announceRoom() {
  if (!lobbyLink) return;
  if (!room || !room.host || !room.mode) {
    if (lobbySent) { lobbyLink.untrack(); lobbySent = ''; }
    return;
  }
  const info = {
    code: room.code, mode: room.mode, nick: myNick(), n: room.members.length || 1, cap: room.mode === '2v2' ? 4 : 2, play: !!room.inGame, score: room.inGame ? room.score || [0, 0] : null,
    pt: room.pt, // 광장 탁구대 번호
    pl: room.inGame && room.players ? room.players.map((p) => ({ id: p.id, side: p.side, slot: p.slot || 0 })) : null, // 중간에 들어온 관중이 선수 자리를 알게
  };
  const key = JSON.stringify(info);
  if (key === lobbySent) return;
  lobbySent = key;
  lobbyLink.track(info);
}
