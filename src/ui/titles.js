import { account, checkAch, myTitle, setTitle } from '../account.js';
import { ACH, ACHS, ACH_CATS, REWARD, titleText } from '../achievements.js';
import { playUI } from '../audio.js';
import { SHOP_MSG, renderDress, setMsg } from './dress.js';
import { renderMe } from './login.js';
import { $, esc, myNemesis, tpill } from './state.js';

/* ───────── 업적·칭호 (supabase/10_achievements.sql, 기획서 11장) ─────────
   업적 달성은 서버가 정한다. 화면은 로그인 직후·경기 뒤·뽑기 뒤 등에 checkAch를 불러 새로 깬 업적을 받고
   '🏅 업적 달성!' 알림을 차례로 띄운다. 칭호는 꾸미기 화면의 '🏅 칭호' 탭에서 단다. */
const achPop = { queue: [], busy: false, notBefore: 0 };
let achTimer = 0;
export function runAchCheck(delay = 0) {
  if (!account.loggedIn) return;
  clearTimeout(achTimer);
  achTimer = setTimeout(async () => {
    gotAch(await checkAch());
  }, delay);
}
// 서버가 알려 준 새 업적을 알림 줄에 넣기
export function gotAch(r) {
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
export function renderTitles() {
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
