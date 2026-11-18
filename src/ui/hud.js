import { account } from '../account.js';
import { tierOf } from '../physics.js';
import { breakAt } from '../breaks.js';
import { aiCoins } from './ai.js';
import { crowdRoar } from './cheer.js';
import { backToRoom, room, saveResult } from './room.js';
import { $, esc, game } from './state.js';
import { watch, watchDone } from './watch.js';

const GRADE_TEXT = { perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD', block: 'BLOCK', miss: 'MISS' };
let toastTimer = 0;

let lastScore = null; // 점수가 바뀐 쪽 숫자만 통통 튀게
export const resetScore = () => { lastScore = null; };
let resultTimer = 0;
export const hud = {
  score(s, deuce) {
    if (!game) return;
    const me = game.mySide, op = 1 - me;
    const bump = (side) => (lastScore && lastScore[side] !== s[side] ? ' bump' : '');
    if (lastScore && (lastScore[0] !== s[0] || lastScore[1] !== s[1])) crowdRoar();
    const myLabel = game.spectator ? esc(game.names[me]) : game.mode === '2v2' ? '우리 팀' : '나';
    $('scoreboard').innerHTML = `<div class="sb t${me}"><span>${myLabel}</span><b class="${bump(me)}">${s[me]}</b></div>`
      + '<i class="sb-colon">:</i>'
      + `<div class="sb t${op}"><b class="${bump(op)}">${s[op]}</b><span>${esc(game.names[op])}</span></div>`
      + (deuce ? '<em class="sb-deuce">듀스!</em>' : '');
    lastScore = [...s];
  },
  stats(st) {
    if (!game) return;
    const hot = st.rally >= 6 ? ' hot' : ''; // 랠리 6회부터 몰입 연출과 함께 🔥
    const lv = game.mode === 'ai' ? 0 : tierOf(st.rally); // 랠리 단계 20·40·60회 (판정이 빡빡해짐, 혼자 하기는 없음)
    const fire = hot ? '🔥'.repeat(Math.max(1, lv)) + ' ' : '';
    let html = `<div class="st-rally${hot}${lv ? ` lv${lv}` : ''}"><span>${fire}랠리</span><b>${st.rally}</b></div>`;
    if (game.mode === 'ai') {
      html += `<div class="st-sub"><span>🏅 최고 ${st.best}</span><span>✨ Perfect ${st.perfects}</span>${account.loggedIn ? `<span class="coin">🪙 +${aiCoins}</span>` : ''}${account.loggedIn && breakAt() ? '<span class="brk">☕ 쉬는 시간 +50%</span>' : ''}</div>`;
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
  // 관전: 이긴 쪽 이름으로 결과 띠, 잠시 뒤 로비로
  watchOver(winner, score) {
    const el = $('result');
    el.className = 'win';
    $('result-title').textContent = `🏆 ${game.names[winner]} 승리!`;
    $('result-score').textContent = `${score[0]} : ${score[1]}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => el.classList.add('hidden'), 2700);
    const w = watch;
    setTimeout(() => { if (watch === w) watchDone(w); }, 2800); // 결과 띠가 사라지면 '다음 판' 창
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
