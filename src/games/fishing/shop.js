// 🍣 횟집 창: 📈 시세표(일반 7종 + 희귀 8 · 전설 2(13-1 ②) · ▲빨강/▼파랑 · 지난 8회 꺾은선 · 🔥 오늘의 대박) + 🎒 가방(종류 × ⭐ 별마다 팔기 · 모두 팔기)
// docs/dev/fishing.md 14-6. 규칙은 market.js, 코인은 서버(account.js fishSell)가 그 순간 시세로.
// 낚시 화면 오른쪽 위 '🍣 횟집' 버튼(1a) · 선착장 횟집 건물·📈 칠판을 눌러도(1b, ui/fishing.js openMarket) 엶
import { account, fishBagLoad, fishSell, marketNow } from '../../account.js';
import { CATCH, SPECIES } from './rules.js';
import { BAG_MAX, BIG_FISH, BIG_SWING, MARKET_FISH, QUAL_X, bagCount, history, nextLabel, periodLabel, priceOf, sellPlan, stars } from './market.js';
import { FISH_COINS } from './rules.js';
import { modelImage } from './dex.js';

const css = `
#fshop { position: fixed; inset: 0; z-index: 80; display: none; align-items: center; justify-content: center; background: rgba(8,16,34,.45); backdrop-filter: blur(4px); font-family: 'Pretendard Variable', system-ui, sans-serif; color: #fff; }
#fshop.open { display: flex; }
#fshop .box { width: min(820px, calc(100vw - 36px)); max-height: calc(100vh - 64px); max-height: calc(100dvh - 72px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); display: flex; flex-direction: column; border-radius: 22px; background: rgba(15,25,50,.86); border: 1px solid rgba(255,255,255,.18); overflow: hidden; }
#fshop .top { display: flex; align-items: center; gap: 10px; padding: 14px 16px 8px; }
#fshop h3 { margin: 0; font: 400 22px Jua, sans-serif; flex: 1; }
#fshop h3 small { font: 600 14px 'Pretendard Variable', sans-serif; color: rgba(255,255,255,.7); margin-left: 8px; }
#fshop button { font: 700 14px 'Pretendard Variable', sans-serif; border: 0; border-radius: 99px; cursor: pointer; color: #fff; }
#fshop .x { background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); padding: 7px 12px; }
#fshop .body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 4px 16px 16px; overflow-y: auto; }
#fshop .panel { border-radius: 16px; padding: 12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); min-width: 0; overflow: visible; } /* 공용 .panel의 overflow:auto면 휴대폰에서 칸이 눌려 잘림 */
#fshop .panel h4 { margin: 0 0 8px; font: 400 17px Jua, sans-serif; display: flex; justify-content: space-between; align-items: baseline; }
#fshop .panel h4 small { font: 600 12px 'Pretendard Variable', sans-serif; color: rgba(255,255,255,.6); }
#fshop .board { background: #1f3b2f; border: 4px solid #8a5a32; border-radius: 12px; padding: 8px 10px; font-family: Jua, sans-serif; } /* 칠판 */
#fshop .row { display: grid; grid-template-columns: 22px 1fr 64px 46px 56px; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,.14); font-size: 15px; }
#fshop .row > span:nth-child(2) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#fshop .row:last-child { border-bottom: 0; }
#fshop .row.hot { background: linear-gradient(90deg, rgba(255,120,40,.35), transparent); border-radius: 8px; padding-left: 4px; }
#fshop .row .p { text-align: right; font-size: 17px; }
#fshop .sec { font-size: 13px; color: #ffe9a8; padding: 8px 0 2px; border-bottom: 1px solid rgba(255,255,255,.22); display: flex; justify-content: space-between; }
#fshop .sec small { font: 600 11px 'Pretendard Variable', sans-serif; color: rgba(255,255,255,.6); }
#fshop .row.leg { background: linear-gradient(90deg, rgba(255,210,60,.18), transparent); border-radius: 8px; padding-left: 4px; }
#fshop .up { color: #ff6b6b; } #fshop .dn { color: #6bb7ff; } #fshop .eq { color: rgba(255,255,255,.55); }
#fshop .row svg { width: 56px; height: 20px; }
#fshop .note { font-size: 12px; color: rgba(255,255,255,.65); margin-top: 8px; line-height: 1.5; }
#fshop .bag { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
#fshop .fc { border-radius: 14px; padding: 4px 4px 8px; text-align: center; background: linear-gradient(180deg, rgba(191,230,251,.22), rgba(143,208,242,.1)); position: relative; }
#fshop .fc.rare { background: linear-gradient(180deg, rgba(110,160,255,.35), rgba(90,140,240,.15)); }
#fshop .fc.legend { background: linear-gradient(180deg, rgba(255,214,90,.45), rgba(255,170,60,.18)); }
#fshop .fc img { width: 100%; aspect-ratio: 1; display: block; }
#fshop .fc .nm { font: 400 14px Jua, sans-serif; }
#fshop .fc .st { position: absolute; left: 8px; top: 5px; font: 400 14px Jua, sans-serif; color: #ffd23a; text-shadow: 0 1px 2px rgba(0,0,0,.6); letter-spacing: -1px; }
#fshop .fc .st.no { color: rgba(255,255,255,.55); }
#fshop .fc .cnt { position: absolute; right: 8px; top: 6px; font: 800 13px 'Pretendard Variable', sans-serif; background: rgba(0,0,0,.45); border-radius: 99px; padding: 1px 7px; }
#fshop .fc button { margin-top: 4px; padding: 5px 10px; background: rgba(255,255,255,.14); font-size: 12px; }
#fshop .all { width: 100%; margin-top: 10px; height: 46px; font-size: 16px; background: linear-gradient(180deg, #ff8a1f, #e8590c); box-shadow: 0 6px 16px rgba(232,89,12,.35); }
#fshop .day { margin-top: 6px; font-size: 12px; text-align: center; color: rgba(255,255,255,.7); }
#fshop .day b { color: #ffd36b; }
#fshop .all:disabled, #fshop .fc button:disabled { opacity: .45; cursor: default; }
#fshop .empty { padding: 24px 6px; text-align: center; color: rgba(255,255,255,.6); font-size: 14px; }
#fshop .boss { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 13px; min-height: 34px; }
#fshop .boss span:first-child { font-size: 26px; }
#fshop .boss .say { background: rgba(255,255,255,.12); border-radius: 12px; padding: 6px 10px; }
@media (max-width: 640px) { #fshop .body { grid-template-columns: 1fr; } }
/* 좁은 칠판(휴대폰 세로·가로 2단): 숫자 칸을 줄여 이름이 들어가게 */
@media (max-width: 420px), (max-width: 900px) and (min-width: 641px) { #fshop .row { grid-template-columns: 20px 1fr 36px 44px 44px; gap: 4px; font-size: 14px; } #fshop .row .p { font-size: 15px; } #fshop .row svg { width: 44px; } }
`;
let el = null, busy = false, bossLine = '어서 와요! 오늘 시세 한번 보고 가요.';
const name = (id) => CATCH[id]?.name || id;
const emoji = (id) => CATCH[id]?.emoji || '🐟';
const coin = (p10) => (p10 / 10).toFixed(1).replace(/\.0$/, '');

function build() {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  el = document.createElement('div'); el.id = 'fshop';
  el.innerHTML = `<div class="box"><div class="top"><h3>🍣 횟집<small></small></h3><button class="x" type="button">✕</button></div>
    <div class="body"><div class="panel"><h4>📈 오늘의 시세 <small class="when"></small></h4><div class="board"></div><div class="note"></div></div>
    <div class="panel"><h4>🎒 내 가방 <small class="cnt"></small></h4><div class="bag"></div><button class="all" type="button"></button><div class="day"></div>
    <div class="boss"><span>🧑‍🍳</span><span class="say"></span></div></div></div></div>`;
  document.body.appendChild(el);
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.x')) return closeShop();
    const b = e.target.closest('[data-sell]');
    if (b && !b.disabled) sell(b.dataset.sell || null, b.dataset.q ? +b.dataset.q : null);
  });
}
// 꺾은선 (지난 8회)
function spark(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals), w = 56, h = 20;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * (w - 4) + 2},${hi === lo ? h / 2 : h - 3 - ((v - lo) / (hi - lo)) * (h - 6)}`).join(' ');
  const last = pts.split(' ').at(-1).split(',');
  return `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="#ffd23a"/></svg>`;
}
function render() {
  const ms = marketNow(), hist = history(ms, 8), cur = hist.at(-1), prev = hist.at(-2);
  el.querySelector('.when').textContent = `${periodLabel(cur.p)} 쉬는 시간부터`;
  const order = [cur.jackpot, ...MARKET_FISH.filter((id) => id !== cur.jackpot)];
  const row = (id, cls = '') => {
    const v = cur.list[id], d = v - prev.list[id];
    const ch = d > 0 ? `<span class="up">▲${coin(d)}</span>` : d < 0 ? `<span class="dn">▼${coin(-d)}</span>` : '<span class="eq">–</span>';
    return `<div class="row${id === cur.jackpot ? ' hot' : ''}${cls}"><span>${emoji(id)}</span><span>${id === cur.jackpot ? '🔥 ' : ''}${name(id)}</span><span class="p">${coin(v)}</span>${ch}${spark(hist.map((h) => h.list[id]))}</div>`;
  };
  // 희귀·전설도 오르내림 (13-1 ②): 칸을 나눠서 아래에
  const grp = (g) => BIG_FISH.filter((id) => CATCH[id]?.grade === g);
  const pct = (g) => Math.round(BIG_SWING[g][1] / 2 * 100);
  el.querySelector('.board').innerHTML = order.map((id) => row(id)).join('')
    + `<div class="sec">💎 희귀 <small>보통 ${FISH_COINS.rare} · ±${pct('rare')}%</small></div>` + grp('rare').map((id) => row(id)).join('')
    + `<div class="sec">👑 전설 <small>보통 ${FISH_COINS.legend} · ±${pct('legend')}% · 언제 팔까?</small></div>` + grp('legend').map((id) => row(id, ' leg')).join('');
  el.querySelector('.note').innerHTML = `🔥 = 오늘의 대박(2배, 일반만) · 크기와 상관없이 종류로만 · 희귀는 조금, 전설은 크게 오르내려요<br>⭐ 리듬을 잘 맞춘 물고기는 더 비싸요: ★★★ ×${QUAL_X[3] / 10} · ★★ ×${QUAL_X[2] / 10} · ★ ×${QUAL_X[1] / 10} · 별 없음 ×${QUAL_X[0] / 10}<br>다음 시세: <b>${nextLabel(ms)}</b> 쉬는 시간`;

  const bag = account.fishBag || [], n = bagCount(bag);
  el.querySelector('h3 small').textContent = account.loggedIn ? `🪙 ${account.player?.coins ?? 0}` : '';
  el.querySelector('.cnt').textContent = `${n} / ${BAG_MAX}`;
  const box = el.querySelector('.bag'); box.innerHTML = '';
  if (!account.loggedIn) box.innerHTML = '<div class="empty">로그인하면 잡은 물고기가 가방에 들어가요</div>';
  else if (!n) box.innerHTML = '<div class="empty">가방이 비었어요 · 물고기를 낚아 오세요 🎣</div>';
  // 같은 종류라도 별마다 따로 칸 (41 — 별을 모르는 옛 서버면 q 없음 → 별 안 그림)
  const sorted = [...bag].sort((a, b) => SPECIES.findIndex((s) => s.id === a.id) - SPECIES.findIndex((s) => s.id === b.id) || (b.q ?? 1) - (a.q ?? 1));
  for (const b of sorted) {
    const d = document.createElement('div'); d.className = `fc ${CATCH[b.id]?.grade || ''}`;
    d.appendChild(modelImage(b.id).cloneNode());
    const st = b.q == null ? '' : `<span class="st${b.q ? '' : ' no'}" title="품질 값 ×${QUAL_X[b.q] / 10}">${stars(b.q)}</span>`;
    d.insertAdjacentHTML('beforeend', `${st}<span class="cnt">×${b.n}</span><div class="nm">${name(b.id)}</div><button type="button" data-sell="${b.id}" ${b.q == null ? '' : `data-q="${b.q}"`} ${busy ? 'disabled' : ''}>팔기 · ${coin(priceOf(b.id, ms, b.q) * b.n)}</button>`);
    box.appendChild(d);
  }
  const all = el.querySelector('.all');
  // 하루 한도(40, market.js DAY_CAP): 오늘 판 코인 · 남은 한도 안에서만 팔림
  const fd = account.fishDay, left = fd ? Math.max(0, fd.cap - fd.coins) : Infinity;
  const plan = sellPlan(bag.map((b) => [b.id, b.n, b.q]), ms, left);
  all.dataset.sell = ''; all.disabled = busy || !n || left <= 0;
  all.textContent = !n ? '🍣 모두 팔기' : left <= 0 ? '🍣 오늘은 다 팔았어요' : `🍣 모두 팔기 · 🪙 약 ${plan.coins}${plan.kept ? ` (${plan.kept}마리는 내일)` : ''}`;
  el.querySelector('.day').innerHTML = fd ? `오늘 판 코인 <b>${fd.coins}</b> / ${fd.cap} · 한도가 차면 남은 물고기는 내일 팔아요` : '';
  el.querySelector('.say').textContent = bossLine;
}
async function sell(id, q = null) {
  busy = true; render();
  const r = await fishSell(id, q);
  busy = false;
  if (r.status === 'ok') {
    const big = (r.sold || []).find((s) => CATCH[s.id]?.grade !== 'common');
    const hot = (r.sold || []).find((s) => s.id === history(marketNow(), 1)[0].jackpot);
    const top = (r.sold || []).some((s) => s.q === 3);
    bossLine = `🪙 +${r.coins}코인! ` + (r.kept ? `오늘은 여기까지 살게요. ${r.kept}마리는 내일 다시 가져와요 🙏` : top && !big ? '★★★! 손질이 필요 없을 만큼 싱싱하네요 ✨' : big ? `${name(big.id)}! 오늘 장사 잘 되겠네요 😆` : hot ? `${name(hot.id)} 오늘 금값인데, 타이밍 좋아요!` : '고마워요, 또 와요~');
    onSold?.(r);
  } else bossLine = r.status === 'capped' ? '오늘은 더 못 사요 😅 내일 다시 와 주세요! (하루 1000코인까지)' : r.status === 'empty' ? '가방이 비었는데요? 😅' : '앗, 계산이 안 됐어요. 다시 눌러 주세요';
  render();
}
let onSold = null;
export function openShop(opt = {}) {
  onSold = opt.onSold || null;
  if (!el) build();
  el.classList.add('open'); render();
  if (account.loggedIn) fishBagLoad().then(() => el.classList.contains('open') && render());
}
export function closeShop() { el?.classList.remove('open'); }
export const shopOpen = () => !!el?.classList.contains('open');
