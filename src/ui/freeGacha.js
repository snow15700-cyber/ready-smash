import { account, loadShop } from '../account.js';
import { initAudio, playUI } from '../audio.js';
import { openDress } from './dress.js';
import { $ } from './state.js';

/* ───────── 무료 뽑기 50회 선물 (supabase/25_free_pulls.sql, 2026-11-23) ─────────
   로비 오른쪽 아래(꾸미기 아이콘 위)에 크게. 누르면 꾸미기 → 뽑기 탭으로 바로 간다.
   남은 횟수는 상점 정보(account.shop.free). 다 쓰면 사라진다. 손님에게는 '로그인하면 받아요'. */
const GIFT = 50;
let loading = false;

export function renderFreeGacha() {
  const el = $('lb-free');
  if (account.loggedIn && !account.shop) {
    // 상점 정보를 아직 안 불렀으면 불러와서 다시 그린다
    el.classList.add('hidden');
    if (!loading) { loading = true; loadShop().finally(() => { loading = false; if (account.shop) renderFreeGacha(); }); }
    return;
  }
  const left = account.loggedIn ? account.shop?.free ?? 0 : GIFT;
  const show = left > 0;
  el.classList.toggle('hidden', !show);
  $('btn-closet').classList.toggle('free-dot', show && account.loggedIn);
  if (!show) return;
  el.innerHTML = `<span class="lf-gift">🎁</span>`
    + `<span class="lf-text"><span class="lf-tag">모두에게 선물!</span><b>무료 뽑기 <em>${GIFT}회</em></b>`
    + `<small>${account.loggedIn ? `남은 무료 뽑기 <i>${left}회</i> · 코인 없이 바로!` : '로그인하면 받을 수 있어요'}</small></span>`
    + `<span class="lf-go">${account.loggedIn ? '뽑으러<br>가기' : '로그인<br>하기'}</span>`;
}

// 5초마다 한 번 반짝 + 선물 상자 깡충 (로비가 보일 때만)
setInterval(() => {
  const el = $('lb-free');
  if (el.classList.contains('hidden') || $('lobby').classList.contains('hidden') || document.hidden) return;
  el.classList.remove('go');
  void el.offsetWidth; // 애니메이션 다시 시작
  el.classList.add('go');
  setTimeout(() => el.classList.remove('go'), 1300);
}, 5000);

$('lb-free').addEventListener('click', () => {
  initAudio();
  if (!account.loggedIn) { playUI('click'); $('btn-logout').click(); return; } // 손님: 로그인 화면으로 ('로그인' 버튼과 같음)
  openDress('gacha');
});
