import { ic } from '../icons.js';
import { account, buyItem, equipItem, gacha, loadShop, myEquip, testCoins } from '../account.js';
import { initAudio, playHit, playTable, playUI } from '../audio.js';
import { CATS, GACHA_PRICE, GRADES, ITEM, ITEMS, PITY, POOLS, equipped, poolOpen, swatch } from '../items.js';
import { ONLINE } from '../net.js';
import { hud } from './hud.js';
import { closeWindow, show } from './screen.js';
import { $, esc, setPreview, world } from './state.js';
import { setOf, setsWith, setBonusText } from '../sets.js';
import { renderTitles, runAchCheck } from './titles.js';
import { closeGacha, gachaFinishNow, gachaError, gachaState, openGacha, playGacha } from '../gachaShow.js';

/* ───────── 꾸미기 (옷장 · 뽑기 · 칭호를 한 화면에) ─────────
   뽑기·구매·장착은 서버(supabase/06_shop.sql)가 정하고, 화면은 결과만 보여 준다.
   패널은 오른쪽, 왼쪽에는 내 캐릭터(입어 보기)와 고른 아이템을 크게 보여 주는 카드(#spot). */
let dressTab = 'closet'; // closet | gacha | title
export const dressTabNow = () => dressTab;
// 광장이 연결 (ui/plaza.js): gachaIntro(count) = 뽑기 기계에서 캡슐이 굴러 나오는 연출 (Promise, 못 하면 바로 끝남)
export const dressHooks = { gachaIntro: null }; // 광장 카메라가 뽑기 탭이면 뽑기 기계를 비춘다 (ui/plaza.js)
let shopTab = 'char'; // 뽑기 통 (char | arena)
let closetCat = 'paddle'; // 옷장에서 보는 카테고리
let selId = null; // 고른(입어 보는) 아이템. null이면 지금 장착한 것
let shopBusy = false;
let sureId = null; // '정말 살까요?' 확인 중인 버튼
let sureTimer = 0;
const gradeName = (g) => (g === 'default' ? '기본' : GRADES[g].name);
const owns = (id) => ITEM[id]?.grade === 'default' || !!account.shop?.owned.has(id);
export const SHOP_MSG = {
  error: '서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요',
  no_coins: '코인이 모자라요',
  no_pieces: '조각이 모자라요',
  empty: '아직 이 뽑기에는 아이템이 없어요',
  closed: '이 뽑기는 잠시 닫혀 있어요',
  owned: '이미 가지고 있어요',
  not_owned: '가지고 있지 않은 아이템이에요',
  no_session: '로그인이 풀렸어요. 다시 로그인해 주세요',
};
const CAT_ICON = { paddle: ic('paddle'), head: ic('hat'), face: ic('smile'), body: ic('shirt'), trail: ic('trail'), table: ic('table'), bg: ic('image'), ball: ic('ball') };

function needLogin() {
  if (account.loggedIn) return false;
  playUI('click');
  hud.toast('로그인하면 꾸미기(상점·옷장)를 쓸 수 있어요', 2400);
  return true;
}

export const setMsg = (html, ok = false) => { $('dress-msg').innerHTML = html; $('dress-msg').classList.toggle('ok', ok); };
// 아이템 고르기 = 캐릭터에 입혀 보기
function select(id) {
  selId = id;
  // 얼굴을 고르는 중이면 카메라가 앞으로 돌아가 얼굴을 비춘다 (사용자 확정, main.js의 PV_FRONT)
  const front = id ? ITEM[id].cat === 'face' : dressTab === 'closet' && closetCat === 'face';
  setPreview({ look: id ? { ...myEquip(), [ITEM[id].cat]: id } : myEquip(), front });
}

export async function openDress(tab) {
  if (needLogin()) return;
  playUI('click');
  dressTab = tab;
  sureId = null;
  select(null);
  $('gacha-result').innerHTML = '';
  setMsg('');
  show('dress');
  renderDress();
  if (!account.shop) {
    setMsg('불러오는 중…');
    const r = await loadShop();
    setMsg(r.status === 'ok' ? '' : SHOP_MSG[r.status] || SHOP_MSG.error);
    renderDress();
  }
}

function renderWallet() {
  const p = account.player || {};
  $('shop-coins').innerHTML = `<i class="coin-dot"></i> ${(p.coins ?? 0).toLocaleString()}`;
  $('shop-pieces').innerHTML = `${ic('puzzle')} ${(p.pieces ?? 0).toLocaleString()}`;
}

export function renderDress() {
  renderWallet();
  for (const t of ['closet', 'gacha', 'title']) $(`tab-${t}`).classList.toggle('on', dressTab === t);
  const g = dressTab === 'gacha', tt = dressTab === 'title';
  $('pane-gacha').classList.toggle('hidden', !g);
  $('pane-title').classList.toggle('hidden', !tt);
  $('cat-chips').classList.toggle('hidden', g || tt);
  $('item-grid').classList.toggle('hidden', g || tt);
  if (tt) { renderTitles(); $('spot').classList.add('hidden'); if (!account.ach) runAchCheck(); return; }
  if (g) renderGacha();
  else { renderChips(); renderGrid(); }
  renderSpot();
}

// 카테고리 칩: 첫 줄 = 캐릭터(탁구채·몸·머리·궤적), 둘째 줄 = 경기장(배경·탁구공·탁구대) (사용자 확정)
// 아이템이 아직 없는 카테고리는 흐리게 잠금 (글자 '곧'은 안 씀)
const CHIP_ROWS = [['paddle', 'head', 'face', 'body', 'trail'], ['bg', 'ball', 'table']];
function renderChips() {
  const has = (cat) => ITEMS.some((i) => i.cat === cat);
  $('cat-chips').innerHTML = CHIP_ROWS.map((row) => '<div class="chip-row">' + row.map((cat) => {
    const ready = has(cat);
    return `<button class="${cat === closetCat ? 'on' : ''}" data-cat="${cat}" ${ready ? '' : 'disabled'}>${CAT_ICON[cat] || ''} ${CATS[cat].name}</button>`;
  }).join('') + '</div>').join('');
}

// 아이템 카드: 가진 것 먼저(없는 건 🔒 흐리게). 없는 건 '크게 보기' 카드에서 사기
function renderGrid() {
  const on = equipped(myEquip(), closetCat)?.id;
  const list = ITEMS.filter((i) => i.cat === closetCat).sort((a, b) => (owns(b.id) - owns(a.id)) || (a.grade === 'default' ? -1 : b.grade === 'default' ? 1 : 0));
  $('item-grid').innerHTML = list.length ? list.map((it) => {
    const have = owns(it.id);
    const cls = ['card', `g-${it.grade}`, it.id === on ? 'on' : '', it.id === selId ? 'sel' : '', have ? '' : 'locked'].join(' ');
    const corner = it.id === on ? `<span class="corner on">${ic('check')}</span>` : have ? '' : `<span class="corner">${ic('lock')}</span>`;
    return `<li class="${cls}" data-id="${it.id}">${corner}${swatch(it)}<span class="nm">${esc(it.name)}</span><i class="bar"></i></li>`;
  }).join('') : '<li class="empty-msg">곧 열려요!</li>';
}

// 이 아이템이 들어 있는 세트 안내 (src/sets.js): 머리 + 몸 = 세트, 세 번째까지 = 완전 세트. 입고 있는 건 ✓
function setInfo(it) {
  const look = selId ? { ...myEquip(), [it.cat]: it.id } : myEquip();
  return setsWith(it.id).map((st) => {
    const on = (id) => look[ITEM[id].cat] === id;
    const piece = (id) => `<b class="${on(id) ? 'on' : ''}">${on(id) ? '✓ ' : ''}${esc(ITEM[id].name)}</b>`;
    return `<div class="spot-set">${ic('sparkle')} 세트 「${esc(st.name)}」: ${piece(st.head)} + ${piece(st.body)} → ${setBonusText(st)}`
      + `<br>완전 세트: + ${piece(st.third)} → ${setBonusText(st, true)} · 칭호도 받아요</div>`;
  }).join('');
}

// 왼쪽 아래 '크게 보기' 카드: 고른 아이템(없으면 지금 장착한 것)과 할 수 있는 일(장착·사기·소리 듣기)
function renderSpot() {
  const it = selId ? ITEM[selId] : dressTab === 'gacha' ? null : equipped(myEquip(), closetCat);
  const spot = $('spot');
  spot.classList.toggle('hidden', !it);
  if (!it) return;
  const have = owns(it.id);
  const isOn = equipped(myEquip(), it.cat)?.id === it.id;
  spot.className = `spot g-${it.grade}`;
  $('spot-pic').innerHTML = swatch(it).replace('class="sw', 'class="sw big');
  $('spot-grade').textContent = gradeName(it.grade);
  $('spot-name').textContent = it.name;
  const status = isOn ? '장착 중' : have ? '가지고 있어요' : '입어 보는 중';
  const snd = (it.sound ? ` · ${ic('volume')} 특별한 소리` : '') // 소리 이름은 보여 주지 않는다 (사용자 결정)
    + (it.hatch ? ` · ${ic('sparkle')} 스매시 득점 시 특별한 효과` : '') // 계란·드래곤 알: 깨지고 병아리·아기 용
    + (it.cat === 'table' && it.grade === 'rare' ? ` · ${ic('sparkle')} 공이 튀면 반응해요` : '')
    + (it.cat === 'table' && it.grade === 'legend' ? ` · ${ic('sparkle')} 스매시 득점·긴 랠리에 특별한 효과` : '');
  $('spot-desc').innerHTML = status + snd + setInfo(it);
  let acts = '';
  if (isOn) acts += `<span class="pill">${ic('check')} 장착 중</span>`;
  else if (have) acts += `<button class="small primary" data-act="equip" ${shopBusy ? 'disabled' : ''}>장착하기</button>`;
  else if (it.grade !== 'default') {
    const p = account.player || {};
    const g = GRADES[it.grade];
    const b = (pay, label, cost, has) => {
      const key = `${it.id}/${pay}`;
      const sure = sureId === key;
      return `<button class="small${pay === 'coins' ? ' primary' : ''}${sure ? ' sure' : ''}" data-buy="${it.id}" data-pay="${pay}" ${has < cost || shopBusy ? 'disabled' : ''}>${sure ? '정말 살까요?' : `${label} ${cost.toLocaleString()}`}</button>`;
    };
    acts += b('coins', '<i class="coin-dot"></i>', g.buy, p.coins ?? 0) + b('pieces', ic('puzzle'), g.pieces, p.pieces ?? 0);
  }
  if (it.cat === 'paddle' || it.cat === 'ball') acts += '<button class="small" data-act="sound" title="소리 들어 보기">' + ic('volume') + '</button>';
  $('spot-acts').innerHTML = acts;
}

// 뽑기 탭
function renderGacha() {
  for (const t of ['char', 'arena']) $(`shop-tab-${t}`).classList.toggle('on', shopTab === t);
  const pool = shopTab;
  const items = ITEMS.filter((i) => i.pool === pool && i.grade !== 'default');
  const coins = account.player?.coins ?? 0;
  const ready = !!account.shop;
  const head = `<b>${ic(pool === 'char' ? 'shirt' : 'image')} ${POOLS[pool].name}</b><span class="g-cats">${POOLS[pool].desc}</span>`;
  const open = poolOpen(pool);
  if (!items.length) {
    $('gacha-desc').innerHTML = `${head}<p class="soon-box">곧 열려요! 아직 아이템을 만드는 중이에요 🛠️</p>`;
  } else if (!open) {
    // 잠시 닫힘 (일반 아이템이 아직 없음). 무엇이 들어 있는지는 보여 주고, 누르면 왼쪽 '크게 보기'에
    const list = items.map((it) => `<li class="g-${it.grade}" data-id="${it.id}">${swatch(it)}<span>${esc(it.name)}</span></li>`).join('');
    $('gacha-desc').innerHTML = `${head}<p class="soon-box">${ic('lock')} 잠시 닫혀 있어요<br><small>일반 아이템이 들어오면 열려요</small></p>`
      + `<div class="pity-row">지금 들어 있는 것 ${items.length}종</div><ul class="pool-peek">${list}</ul>`;
  } else {
    const hasLegend = items.some((i) => i.grade === 'legend');
    const used = account.shop?.pity[pool] ?? 0;
    const rates = Object.entries(GRADES).map(([g, v]) => `<span class="gbadge g-${g}">${v.name} ${Math.round(v.rate * 100)}%</span>`).join('');
    $('gacha-desc').innerHTML = `${head}<div class="rates">${rates}</div>`
      + (hasLegend
        ? `<div class="pity-row">전설 보장까지 <em>${PITY - used}번</em></div><div class="pity"><i style="width:${(used / PITY) * 100}%"></i></div>`
        : '<div class="pity-row">전설 아이템은 아직 준비 중이에요</div>')
      + `<small>지금 들어 있는 것 ${items.length}종 · 중복이면 ${ic('puzzle')} 조각으로 바뀌어요</small>`;
  }
  // 무료 뽑기(25): 남은 횟수가 뽑을 횟수만큼 있으면 코인 대신 무료
  const free = account.shop?.free ?? 0;
  for (const n of [1, 10]) {
    const b = $(`btn-gacha-${n}`), f = free >= n;
    b.innerHTML = `${n}회 뽑기<small>${f ? '🎁 무료' : `<i class="coin-dot"></i> ${GACHA_PRICE[n]}`}</small>`;
    b.classList.toggle('free', f);
    b.disabled = shopBusy || !ready || !open || (!f && coins < GACHA_PRICE[n]);
  }
  if (open && free > 0) $('gacha-desc').insertAdjacentHTML('afterbegin', `<div class="free-row">🎁 무료 뽑기 <b>${free}회</b> 남았어요<small>🎉 오픈 1주일 기념 선물 · 캐릭터·경기장 뽑기가 <b>같이 쓰는</b> 횟수예요. 나눠서 뽑아 보세요!</small></div>`);
}

// 뽑기: 누르자마자 연출 화면(src/gachaShow.js)이 뜨고, 서버 결과가 오면 탁구공이 떨어진다.
// 연출 화면의 '한 번 더'는 여기로 다시 오고, '나가기'를 누르면 결과를 오른쪽 목록에 남기고 가장 좋은 것을 입혀 보여 준다.
let lastPull = null;
const pullPool = () => shopTab;
function gachaPity(pool) {
  const hasLegend = ITEMS.some((i) => i.pool === pool && i.grade === 'legend');
  return hasLegend ? { used: account.shop?.pity[pool] ?? 0, max: PITY } : null;
}
async function doGacha(count) {
  if (shopBusy && !gachaState.active) return;
  initAudio();
  shopBusy = true;
  const pool = pullPool();
  let req = null;
  if (!gachaState.active) {
    playUI('click');
    renderGacha();
    setMsg('');
    $('gacha-result').innerHTML = '';
    lastPull = null;
    // 광장 뽑기 기계: 동전 → 손잡이 → 캡슐이 굴러 나와 연출 화면으로 (plaza.md 19장 ⓒ). 서버 요청은 그동안 같이
    req = gacha(pool, count);
    const canPay = (account.shop?.free ?? 0) > 0 || (account.player?.coins ?? 0) >= (GACHA_PRICE[count] ?? 0); // 코인이 모자라면 연출 없이 바로 안내
    if (canPay) await (dressHooks.gachaIntro?.(count) || null);
    openGacha({ coins: () => account.player?.coins ?? 0, free: () => account.shop?.free ?? 0, price: GACHA_PRICE, pity: gachaPity(pool), onAgain: (n) => doGacha(n), onExit: exitGacha });
  }
  const r = await (req || gacha(pool, count));
  if (r.status !== 'ok') {
    gachaError(SHOP_MSG[r.status] || SHOP_MSG.error);
    return;
  }
  renderWallet();
  lastPull = r.results;
  playGacha(r.results.map((x) => ({ it: ITEM[x.item] || { id: x.item, name: x.item, grade: x.grade, cat: '' }, grade: x.grade, dup: x.dup, pieces: x.pieces })), gachaPity(pool));
}
function exitGacha() {
  closeGacha();
  document.body.classList.remove('pz-gacha'); // 꾸미기 창 다시 (뽑기 기계 연출 때 숨김)
  shopBusy = false;
  const res = lastPull || [];
  const box = $('gacha-result');
  box.className = `gacha-result${res.length === 1 ? ' one' : ''}`;
  box.innerHTML = res.map((x, i) => {
    const it = ITEM[x.item] || { name: x.item, grade: x.grade };
    return `<li class="card g-${x.grade}" data-id="${ITEM[x.item] ? x.item : ''}" style="animation-delay:${(i * 0.03).toFixed(2)}s">`
      + `${x.dup ? '' : '<span class="new">NEW</span>'}${swatch(it)}<span class="nm">${esc(it.name)}</span>`
      + `<span class="tag">${x.dup ? `중복 ${ic('puzzle')}+${x.pieces}` : gradeName(x.grade)}</span><i class="bar"></i></li>`;
  }).join('');
  // 마지막에 뽑은 것 중 가장 좋은 아이템을 캐릭터에 입혀 크게 보여 주기
  const rank = (g) => ['common', 'rare', 'legend'].indexOf(g);
  const best = [...res].sort((a, b) => rank(b.grade) - rank(a.grade))[0];
  if (best && ITEM[best.item]) select(best.item);
  renderDress();
  runAchCheck(400); // 업적 알림은 연출이 끝난 뒤에
}
// 자동 점검용 (scripts/check.cjs)
window.__gachaTest = { finishNow: gachaFinishNow, get mode() { return gachaState.mode; }, get active() { return gachaState.active; } };

async function doEquip(it) {
  shopBusy = true;
  setMsg('');
  renderDress();
  // 기본 아이템은 '장착 해제'로 저장한다
  const r = await equipItem(it.cat, it.grade === 'default' ? null : it.id);
  shopBusy = false;
  if (r.status === 'ok') {
    playUI('coin');
    const st = setOf(myEquip());
    if (st && setsWith(it.id).includes(st.set)) {
      setMsg(`${ic('sparkle')} 세트 「${esc(st.set.name)}」${st.full ? ' 완전' : ''} 완성! ${setBonusText(st.set, st.full)}`, true);
      runAchCheck(300); // 세트 칭호
    } else setMsg(`✔ ${esc(it.name)} 장착!`, true);
  }
  else setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
  select(null);
  renderDress();
}

async function doBuy(id, pay) {
  const key = `${id}/${pay}`;
  playUI('click');
  if (sureId !== key) { // 한 번 더 눌러야 산다 (실수 방지)
    sureId = key;
    clearTimeout(sureTimer);
    sureTimer = setTimeout(() => { sureId = null; renderSpot(); }, 3000);
    renderSpot();
    return;
  }
  sureId = null;
  shopBusy = true;
  renderSpot();
  const r = await buyItem(id, pay);
  shopBusy = false;
  if (r.status === 'ok') {
    runAchCheck(900);
    playUI(ITEM[id].grade === 'common' ? 'card' : ITEM[id].grade);
    setMsg(`🎉 ${esc(ITEM[id].name)}을(를) 얻었어요! '장착하기'를 누르면 바로 써요`, true);
  } else setMsg(SHOP_MSG[r.status] || SHOP_MSG.error);
  renderDress();
}

// 탭 · 카테고리 · 카드 · 크게 보기 카드
for (const t of ['closet', 'gacha', 'title']) {
  $(`tab-${t}`).addEventListener('click', () => {
    if (dressTab === t) return;
    playUI('click');
    dressTab = t;
    sureId = null;
    select(null);
    setMsg('');
    renderDress();
  });
}
for (const t of ['char', 'arena']) {
  $(`shop-tab-${t}`).addEventListener('click', () => {
    if (shopTab === t || shopBusy) return;
    playUI('click');
    shopTab = t;
    $('gacha-result').innerHTML = '';
    setMsg('');
    select(null);
    renderGacha();
    renderSpot();
  });
}
$('cat-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b || b.disabled || b.dataset.cat === closetCat) return;
  playUI('click');
  closetCat = b.dataset.cat;
  select(null);
  setMsg('');
  renderDress();
});
$('item-grid').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || shopBusy) return;
  const it = ITEM[li.dataset.id];
  playUI('click');
  sureId = null;
  // 옷장: 가진 것을 누르면 바로 장착. 나머지는 입어 보기
  if (dressTab === 'closet' && owns(it.id) && equipped(myEquip(), it.cat).id !== it.id) { doEquip(it); return; }
  select(it.id);
  setMsg(owns(it.id) ? '' : '🔒 아직 없어요. 왼쪽 카드에서 바로 사거나 뽑기로 얻을 수 있어요');
  renderDress();
});
// 닫힌 뽑기의 '지금 들어 있는 것' 목록: 누르면 왼쪽 '크게 보기'에 (배경이면 미리 보기)
$('gacha-desc').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || shopBusy) return;
  playUI('click');
  select(li.dataset.id);
  renderSpot();
});
$('gacha-result').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (!li || !li.dataset.id || shopBusy) return;
  playUI('click');
  select(li.dataset.id);
  renderSpot();
});
$('spot-acts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const it = selId ? ITEM[selId] : equipped(myEquip(), closetCat);
  if (b.dataset.buy) doBuy(b.dataset.buy, b.dataset.pay);
  else if (b.dataset.act === 'equip') { playUI('click'); doEquip(it); }
  else if (b.dataset.act === 'sound' && it.cat === 'ball') { initAudio(); playTable(4.5, null, null, it.sound || null); } // 탁구공: 튀는 소리
  else if (b.dataset.act === 'sound') { initAudio(); playHit('perfect', null, null, it.sound || null); world.hitFx(world.team[0][0], null, 'perfect'); }
});

$('btn-closet').addEventListener('click', () => openDress('closet'));
$('btn-dress-back').addEventListener('click', () => { playUI('click'); closeWindow(); });
$('btn-gacha-1').addEventListener('click', () => doGacha(1));
$('btn-gacha-10').addEventListener('click', () => doGacha(10));
// 서버 없이 도는 테스트 모드에서만: 뽑기를 시험해 볼 코인
$('btn-test-coins').classList.toggle('hidden', ONLINE);
$('btn-test-coins').addEventListener('click', async () => { playUI('coin'); await testCoins(1000); renderDress(); });
