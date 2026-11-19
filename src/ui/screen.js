import { crowdLeave } from './cheer.js';
import { resetScore } from './hud.js';
import { endIntro } from './intro.js';
import { syncLobby } from './lobbyList.js';
import { renderMe, updSeen } from './login.js';
import { $, game, setGame, setMatch, setPreview } from './state.js';

export let curScreen = '';
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
  curScreen = screen;
  syncLobby();
  for (const id of ['login', 'pin-change', 'rank', 'lobby', 'join', 'room', 'dress']) $(id).classList.toggle('hidden', id !== screen);
  $('hud').classList.toggle('hidden', screen !== 'hud');
}

// keepCrowd: 관전하던 방에서 다음 경기로 이어 볼 때 — 관중석 채널은 그대로 (나갔다 바로 다시 들어가면 선수 화면에서 내가 빠질 수 있음)
export function stopGame(keepCrowd = false) {
  endIntro(false);
  if (!keepCrowd) crowdLeave();
  if (game) game.destroy();
  setGame(null);
  setMatch(null);
  $('hint').textContent = '';
  $('stats').textContent = '';
  $('scoreboard').textContent = '';
  $('result').classList.add('hidden');
  resetScore();
}
