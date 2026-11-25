import { crowdLeave } from './cheer.js';
import { resetScore } from './hud.js';
import { endIntro } from './intro.js';
import { syncLobby } from './lobbyList.js';
import { renderMe, updSeen } from './login.js';
import { $, game, setGame, setMatch, setPreview, world } from './state.js';

export let curScreen = '';
const WINDOWS = ['dress', 'rank'];
// 창 닫기: 창이 오른쪽으로 쏙 들어간 뒤 광장으로 (카메라는 그때부터 내 등 뒤로 돌아온다)
let closing = 0;
export function closeWindow() {
  const scr = curScreen;
  if (!WINDOWS.includes(scr) || closing) return;
  const el = $(scr);
  el.classList.remove('win-in');
  el.classList.add('win-out');
  closing = setTimeout(() => {
    closing = 0;
    el.classList.remove('win-out');
    if (curScreen === scr) show('lobby');
  }, WIN_OUT_MS);
}
export const WIN_OUT_MS = 200;
export const HOWTO_KEY = 'smash-howto-seen'; // 치는 방법 창을 본 적 있는지 (처음 온 사람에게 한 번 자동으로 띄움)
export function show(screen) {
  if (screen === 'lobby') {
    renderMe();
    let seen = true;
    try { seen = !!localStorage.getItem(HOWTO_KEY); } catch { /* 저장 안 되는 브라우저: 띄우지 않음 */ }
    $('howto').classList.toggle('hidden', seen);
    $('upd-dot').classList.toggle('hidden', updSeen());
  }
  if (screen !== 'dress') setPreview(null);
  // 광장 위에 뜨는 창(랭킹·꾸미기): 카메라가 먼저 날아가기 시작하고 창이 오른쪽에서 쑥 (plaza.md 19장)
  if (WINDOWS.includes(screen) && screen !== curScreen) {
    const el = $(screen);
    el.classList.remove('win-in', 'win-out');
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add('win-in');
  }
  curScreen = screen;
  syncLobby();
  for (const id of ['login', 'pin-change', 'rank', 'lobby', 'dress']) $(id).classList.toggle('hidden', id !== screen);
  $('hud').classList.toggle('hidden', screen !== 'hud');
}

// keepCrowd: 관전하던 방에서 다음 경기로 이어 볼 때 — 관중석 채널은 그대로 (나갔다 바로 다시 들어가면 선수 화면에서 내가 빠질 수 있음)
export function stopGame(keepCrowd = false) {
  endIntro(false);
  if (!keepCrowd) crowdLeave();
  if (game) game.destroy();
  world.crowd.setFirstPerson(false); // 관전 1인칭에서 숨긴 내 캐릭터 되돌리기
  setGame(null);
  setMatch(null);
  $('hint').textContent = '';
  $('stats').textContent = '';
  $('scoreboard').textContent = '';
  $('result').classList.add('hidden');
  resetScore();
}
