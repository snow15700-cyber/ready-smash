import { account, aiAch, aiRally, aiStart, myEquip } from '../account.js';
import { initAudio, playUI } from '../audio.js';
import { Game } from '../game.js';
import { AI_NAME, Match } from '../match.js';
import { hud } from './hud.js';
import { show, stopGame } from './screen.js';
import { game, match, setGame, setMatch, world } from './state.js';
import { gotAch, runAchCheck } from './titles.js';

/* ───────── 혼자 하기 (AI 상대) ───────── */
const GUEST_BEST_KEY = 'smash-ai-best'; // 손님의 최고 랠리 기록 (이 브라우저에만)
const guestBest = () => { try { return +localStorage.getItem(GUEST_BEST_KEY) || 0; } catch { return 0; } };

const AI_LOOK = { paddle: 'paddle_pan', head: 'head_chef', body: 'body_apron' };

export let aiCoins = 0; // 이번 혼자 하기에서 받은 코인
export const clearAiCoins = () => { aiCoins = 0; };

export function startAI() {
  initAudio();
  playUI('click');
  stopGame();
  aiCoins = 0;
  aiStart();
  show('hud');
  setGame(new Game(world, {
    mySide: 0,
    mode: 'ai',
    names: ['나', AI_NAME],
    hud,
    // 김제빵 코스튬: 프라이팬 + 요리사 모자 + 김제빵 앞치마 (보기만)
    looks: [[myEquip()], [AI_LOOK]],
    // 최고 기록: 로그인했으면 서버, 손님이면 이 브라우저에 저장
    best: account.loggedIn ? account.player.best_rally : guestBest(),
    // 로그인한 사람의 최고 기록은 서버가 aiRally에서 정한다 (브라우저가 보낸 숫자를 그대로 믿지 않게)
    onBest: (r) => {
      if (!account.loggedIn) try { localStorage.setItem(GUEST_BEST_KEY, r); } catch {}
    },
    // 랠리가 끝날 때마다 친 횟수만큼 코인 (3번에 1코인, 서버가 계산 — 26)
    onRally: async (hits) => {
      const g = game;
      // 김제빵의 첫 공을 못 받고 끝남 (업적 '첫 공 실수')
      if (hits <= 1 && account.loggedIn) aiAch({ aizero: 1 }).then(gotAch);
      const before = account.player?.best_rally || 0;
      const got = await aiRally(hits);
      if ((account.player?.best_rally || 0) > before) runAchCheck(); // 최고 기록 업적
      if (!got) return;
      aiCoins += got;
      if (game === g) { playUI('coin'); hud.stats(game.stats); }
    },
    send: {
      toss: (side, t, x, slot) => match.toss(side, t, x, slot),
      swing: (side, t, dir, isSwing, slot) => match.swing(side, t, dir, isSwing, slot),
    },
  }));
  setMatch(new Match({ mode: 'ai', emit: (ev) => game.onEvent(ev) }));
  hud.stats(game.stats);
  match.start(performance.now() / 1000);
}
