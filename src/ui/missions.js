import { account, cheerMissionOpen, loadMissions, missionCheer, missionMatch } from '../account.js';
import { playUI } from '../audio.js';
import { koreaDay, missionsOf, MISSIONS, MISSION_ALL, MISSION_COIN } from '../missions.js';
import { ic } from '../icons.js';
import { hud } from './hud.js';
import { $, esc } from './state.js';

/* ───────── 오늘의 미션 (supabase/21_missions.sql, docs/dev/accounts.md '출석·일일 미션') ─────────
   로비 오른쪽 위(내 전적 아래) 카드. 머리줄을 누르면 접고 펼친다(브라우저에 기억).
   달성은 서버가 정하고, 경기 뒤(room.js saveResult)·응원(cheer.js) 때 결과를 받아 다시 그린다. */
const FOLD_KEY = 'smash-missions-fold';
let loadedAt = 0;
let loading = false;

// 정한 적이 없으면: 휴대폰(좁은 화면)은 접어서 머리줄만, PC는 펼쳐서 (11/25 메뉴 정리 — 휴대폰에서 광장을 가리지 않게)
const folded = () => {
  let v = null;
  try { v = localStorage.getItem(FOLD_KEY); } catch { /* 무시 */ }
  return v === null ? matchMedia('(max-width: 760px)').matches : v === '1';
};

const BOXES = ['lb-missions'];
const paint = (fn) => BOXES.forEach((id) => fn($(id)));

export function renderMissions() {
  const day = koreaDay();
  let m = account.missions;
  // 로그인했으면 서버에서 불러온다 (날짜가 바뀌었거나 1분 지났으면 다시)
  if (account.loggedIn && !loading && (!m || m.day !== day || Date.now() - loadedAt > 60e3)) {
    loading = true;
    loadMissions().then(() => { loadedAt = Date.now(); loading = false; renderMissions(); });
  }
  if (m && m.day !== day) m = null;
  if (account.loggedIn && !m) {
    paint((el) => { el.classList.toggle('hidden', !loading); if (loading) el.innerHTML = `<div class="lm-head"><span class="lm-title">${ic('clipboard')} 오늘의 미션</span><small>불러오는 중…</small></div>`; });
    return;
  }
  const list = m ? m.list : missionsOf(day).map((id) => ({ id, done: false }));
  const n = list.filter((x) => x.done).length;
  const all = n === list.length;
  const html = `<button class="lm-head" type="button"><span class="lm-title">${ic('clipboard')} 오늘의 미션</span><b class="lm-n">${all ? ic('check') + ' ' : ''}${n}/${list.length}</b><span class="lm-fold">▾</span></button>`
    + `<ul class="lm-list">${list.map((x) => {
      const d = MISSIONS[x.id] || { ico: 'target', name: x.id, desc: '' };
      const cheer = x.id === 'cheer3' && !x.done && m?.cheer ? ` <em>${Math.min(m.cheer, 3)}/3</em>` : '';
      return `<li class="${x.done ? 'done' : ''}" title="${esc(d.desc)}"><i>${ic(x.done ? 'circleCheck' : d.ico)}</i><span>${esc(d.name)}${cheer}</span><small>+${MISSION_COIN}</small></li>`;
    }).join('')}</ul>`
    + `<p class="lm-note">${account.loggedIn
      ? (all ? '오늘 미션 끝! 내일 새 미션이 와요' : `다 깨면 <b>+${MISSION_ALL}</b> 더 · 로그인한 사람과의 경기만 쳐요`)
      : '로그인하면 미션 코인을 받을 수 있어요'}</p>`;
  paint((el) => {
    el.classList.remove('hidden');
    el.classList.toggle('folded', folded());
    el.classList.toggle('all', all);
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}

for (const id of BOXES) $(id).addEventListener('click', (e) => {
  if (!e.target.closest('.lm-head')) return;
  playUI('click');
  const f = !folded();
  try { localStorage.setItem(FOLD_KEY, f ? '1' : '0'); } catch { /* 무시 */ }
  paint((el) => el.classList.toggle('folded', f));
});

// 서버가 알려 준 새 미션 → 코인 내역 줄 + 알림
export function missionItems(r) {
  if (r?.status !== 'ok' || !r.new?.length) return [];
  const items = r.new.map((id) => ({ label: MISSIONS[id]?.name || id, coins: MISSION_COIN, mission: true }));
  if (r.all) items.push({ label: '오늘의 미션 모두 달성!', coins: MISSION_ALL, mission: true });
  return items;
}
export function missionToast(r, delay = 0) {
  const items = missionItems(r);
  if (!items.length) return;
  const names = r.new.map((id) => MISSIONS[id]?.name || id).join(' · ');
  setTimeout(function go() {
    // 경기 결과 띠가 떠 있으면 사라진 뒤에
    if (!$('result').classList.contains('hidden')) { setTimeout(go, 500); return; }
    playUI('coin');
    hud.toast(r.all ? `오늘의 미션 모두 달성! +${r.coins} 코인` : `미션 달성! ${names} +${r.coins} 코인`, 3000);
  }, delay);
}

// 경기가 끝난 뒤 (matchFinish 다음). 결과의 코인 내역에 붙일 줄을 돌려준다
export async function checkMatchMissions(mid, bonus) {
  const r = await missionMatch(mid, bonus);
  loadedAt = Date.now();
  return r;
}

// 관전 응원 한 번 (응원 미션이 있는 날만 서버에 알린다)
export async function cheerMission() {
  if (!cheerMissionOpen()) return;
  const r = await missionCheer();
  missionToast(r);
}
