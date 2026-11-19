import { titleText } from '../achievements.js';
import { playCrowd, playUI } from '../audio.js';
import { CROWD_MAX } from '../crowd.js';
import { joinWatch } from '../net.js';
import { myId, roomCrowd } from './room.js';
import { $, esc, game, world } from './state.js';
import { WATCH_MAX, endWatch, renderWatchBar, watch } from './watch.js';
import { cheerMission } from './missions.js';

export let crowd = null; // 관중석 채널 (아래 '관중석·응원')
/* ───────── 관중석·응원 (관전 4단계) ─────────
   관중석 채널(pingpong-watch-XXXX)에 관중은 명단으로 들어가고(track), 두 선수는 듣기만 한다.
   응원은 한 사람 2초에 한 번(보내는 쪽도 막고 받는 쪽도 무시). 소리는 랠리 중엔 아주 작게, 점수 나면 크게. */
const CHEER_GAP = 2;
// 응원은 정해진 이모지·짧은 문구만 (채팅 없음 — 사용자 확정). sound = audio.playCrowd 종류
const CHEERS = { clap: { text: '👏👏👏', sound: 'clap' }, nice: { text: '👍 나이스!', sound: 'clap' }, wow: { text: '😮 우와!', sound: 'fire' }, fire: { text: '🔥 와아아!', sound: 'fire' }, go: { text: '📣 화이팅!', sound: 'go' } };
const CROWD_POS = [-2.5, 1.2, 0]; // 관중석 쪽 (소리 위치)
export function crowdJoin(code, me = null) {
  crowdLeave();
  const c = crowd = { code, list: [], me, last: new Map(), mineT: -9 };
  c.link = joinWatch(code, (list) => onCrowdList(c, list), (m) => onCrowdMsg(c, m));
  if (me) c.link.track(me);
}
// 관전하던 방에서 다음 경기로 이어 볼 때: 관중석 채널을 나가지 않고 그대로 쓴다 (응원 팀만 다시 고르게 비움)
// 나갔다가 바로 다시 들어가면 서버 명단에서 내가 빠져 선수 화면에 안 보이는 일이 있었다
export function crowdKeep(code) {
  if (!crowd || !crowd.me || crowd.code !== code) return false;
  crowd.me = { ...crowd.me, team: null };
  crowd.link.track(crowd.me);
  return true;
}
export function crowdLeave() {
  if (!crowd) return;
  crowd.link.leave();
  crowd = null;
  world.crowd.clear();
  renderCrowdPill();
}
function onCrowdList(c, list) {
  if (crowd !== c) return;
  list = [...list].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  c.list = list;
  if (c.me && watch) {
    if (list.findIndex((x) => x.id === myId) >= WATCH_MAX) { endWatch(`관중석이 꽉 찼어요 (${WATCH_MAX}명까지)`); return; }
    watch.count = list.length;
  }
  // 관중석은 12명까지. 내가 13번째 이후라도 내 화면에서는 나를 꼭 세운다(12번째 자리에)
  let shown = list;
  const mine = list.findIndex((x) => x.id === myId);
  if (mine >= CROWD_MAX) shown = [...list.slice(0, CROWD_MAX - 1), list[mine]];
  world.crowd.set(shown.map((m) => ({ id: m.id, nick: m.nick, title: titleText(m.title, m.titleX), look: m.look, team: m.team ?? null, me: m.id === myId })));
  renderCrowdPill();
  renderWatchBar();
  roomCrowd(list); // 대기실: '👀 관중 N명' (관중이면 16명 제한도)
}
function onCrowdMsg(c, m) {
  if (crowd !== c || !m || m.k !== 'cheer' || !Object.hasOwn(CHEERS, m.c)) return;
  const who = c.list.find((x) => x.id === m.id);
  if (!who) return;
  const now = performance.now() / 1000;
  if (now - (c.last.get(m.id) ?? -9) < CHEER_GAP * 0.9) return; // 너무 자주 오면 무시
  c.last.set(m.id, now);
  showCheer(who, m.c);
}
// 랠리 중(공이 오가는 중)엔 아주 작게 — 찬스볼 신호음·타구음을 가리지 않게
const crowdVol = () => (game && (game.phase === 'rally' || game.phase === 'toss') ? 0.12 : 0.6);
function showCheer(who, kind) {
  const team = who.team;
  // 📣는 고른 팀 선수 이름으로 ('○○ 화이팅!')
  const text = kind === 'go' && game && (team === 0 || team === 1) ? `📣 ${game.names[team]} 화이팅!` : CHEERS[kind].text;
  world.crowd.cheer(who.id, text);
  playCrowd(CHEERS[kind].sound, crowdVol(), CROWD_POS);
}
// 점수 났을 때: 관중이 있으면 다 같이 와아 (관중 수만큼 크게)
export function crowdRoar() {
  const n = crowd?.list.length || 0;
  if (!n) return;
  world.crowd.roar();
  playCrowd('roar', 0.6, CROWD_POS, n);
}
// 관중: 응원 보내기
function sendCheer(kind) {
  if (!crowd || !crowd.me || !Object.hasOwn(CHEERS, kind)) return;
  const now = performance.now() / 1000;
  if (now - crowd.mineT < CHEER_GAP) return;
  crowd.mineT = now;
  crowd.link.send({ k: 'cheer', id: myId, c: kind });
  const me = crowd.list.find((x) => x.id === myId) || crowd.me;
  showCheer({ ...me, team: crowd.me.team }, kind);
  renderCheerBar();
  setTimeout(renderCheerBar, CHEER_GAP * 1000 + 30);
  cheerMission(); // 오늘 응원 미션이 있으면 서버에 한 번 알림
}
// 관중: 응원할 팀 고르기 (다시 누르면 취소). 관중석 자리도 그 팀 쪽으로
function pickCheerTeam(t) {
  if (!crowd || !crowd.me) return;
  crowd.me = { ...crowd.me, team: crowd.me.team === t ? null : t };
  crowd.link.track(crowd.me);
  renderCheerBar();
}
export function renderCheerBar() {
  const bar = $('cheer-bar');
  if (!watch || !game || !crowd?.me || watch.over) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const cool = performance.now() / 1000 - crowd.mineT < CHEER_GAP;
  for (const b of bar.querySelectorAll('[data-team]')) {
    const t = +b.dataset.team;
    b.innerHTML = `${t ? '💙' : '🧡'} <span>${esc(game.names[t] || (t ? 'B팀' : 'A팀'))}</span>`;
    b.classList.toggle('on', crowd.me.team === t);
  }
  for (const b of bar.querySelectorAll('[data-cheer]')) b.disabled = cool;
}
function renderCrowdPill() {
  const n = crowd?.list.length || 0;
  const el = $('crowd-pill');
  el.classList.toggle('hidden', !n || !!watch || !game);
  el.textContent = `👀 관중 ${n}명` + (n > CROWD_MAX ? ` (관중석 +${n - CROWD_MAX})` : '');
}
$('cheer-bar').addEventListener('click', (e) => {
  const t = e.target.closest('[data-team]');
  if (t) { playUI('click'); pickCheerTeam(+t.dataset.team); return; }
  const c = e.target.closest('[data-cheer]');
  if (c && !c.disabled) sendCheer(c.dataset.cheer);
});
