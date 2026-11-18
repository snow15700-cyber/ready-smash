import { account, getRanking } from '../account.js';
import { playUI } from '../audio.js';
import { show } from './screen.js';
import { $, esc, tpill } from './state.js';

/* ───────── 랭킹 ───────── */
const RANK = {
  wins: { desc: '1v1 + 2v2 승리 합계', unit: '승', empty: '아직 이긴 사람이 없어요. 첫 1등이 되어 보세요!', join: '친구와 경기에서 이겨 보세요!' },
  rally: { desc: '혼자 하기(AI 상대) 최장 랠리', unit: '회', empty: '아직 기록이 없어요. 혼자 하기로 첫 기록을 세워 보세요!', join: '혼자 하기로 기록을 세워 보세요!' },
};
let rankKind = 'wins';
let rankReq = 0;
async function showRank(kind = rankKind) {
  rankKind = kind;
  for (const k of ['wins', 'rally']) $(`rank-tab-${k}`).classList.toggle('on', k === kind);
  $('rank-desc').textContent = RANK[kind].desc;
  const list = $('rank-list'), podium = $('rank-podium'), meBar = $('rank-me');
  podium.innerHTML = '';
  meBar.innerHTML = '';
  list.innerHTML = '<li class="msg-row">불러오는 중…</li>';
  show('rank');
  const req = ++rankReq;
  const rows = await getRanking(kind);
  if (req !== rankReq) return; // 그 사이 탭을 바꿨으면 버림
  if (!rows) { list.innerHTML = '<li class="msg-row">랭킹을 불러오지 못했어요 (인터넷 연결 확인)</li>'; return; }
  const myNick = account.loggedIn ? account.nick : null;
  const unit = RANK[kind].unit;
  const MEDAL = ['', '🥇', '🥈', '🥉'];
  const av = (nick) => `<em class="av">${esc([...nick][0] || '?')}</em>`;
  const sub = (r) => (kind === 'wins' ? `<small>1v1 ${r.w1}승 · 2v2 ${r.w2}승</small>` : '');

  // 1~3등: 시상대 (가운데 1등, 왼쪽 2등, 오른쪽 3등). 비어 있으면 '?' 자리
  const top = rows.slice(0, 3);
  podium.innerHTML = [1, 0, 2].map((i) => {
    const r = top[i];
    if (!r) return `<div class="pod p${i + 1} empty"><em class="av">?</em><b>비어 있어요</b><div class="block">${i + 1}</div></div>`;
    const me = r.nick === myNick ? ' me' : '';
    return `<div class="pod p${i + 1}${me}"><span class="medal">${MEDAL[r.rank] || r.rank}</span>${av(r.nick)}`
      + `${tpill(r.title, r.title_x)}<b>${esc(r.nick)}</b><span class="val">${r.value}<small>${unit}</small></span>${sub(r)}<div class="block">${r.rank}</div></div>`;
  }).join('');
  podium.classList.toggle('hidden', !rows.length);

  // 4등부터: 목록
  const rest = rows.slice(3);
  if (!rows.length) list.innerHTML = `<li class="msg-row">${RANK[kind].empty}</li>`;
  else list.innerHTML = rest.map((r) => `<li class="${r.nick === myNick ? 'me' : ''}"><span class="no">${MEDAL[r.rank] || r.rank}</span>${av(r.nick)}`
    + `<span class="who">${tpill(r.title, r.title_x)}${esc(r.nick)}${sub(r)}</span><span class="val">${r.value}<small>${unit}</small></span></li>`).join('');

  // 내 줄이 목록 아래쪽에 있으면 보이게 스크롤
  list.scrollTop = 0;
  const myRow = list.querySelector('li.me');
  if (myRow) list.scrollTop = Math.max(0, myRow.offsetTop - list.clientHeight / 2 + myRow.offsetHeight / 2);

  // 맨 아래: 내 순위
  const mine = myNick && rows.find((r) => r.nick === myNick);
  if (!account.loggedIn) meBar.innerHTML = '🙋 로그인하면 랭킹에 이름을 올릴 수 있어요';
  else if (mine) meBar.innerHTML = `<span>내 순위</span><b>${mine.rank}위</b><span class="val">${mine.value}${unit}</span>`;
  else meBar.innerHTML = `<span>아직 순위에 없어요</span><span class="hint">${RANK[kind].join}</span>`;
}
$('btn-rank').addEventListener('click', () => { playUI('click'); showRank('wins'); });
$('rank-tab-wins').addEventListener('click', () => { playUI('click'); showRank('wins'); });
$('rank-tab-rally').addEventListener('click', () => { playUI('click'); showRank('rally'); });
$('btn-rank-back').addEventListener('click', () => { playUI('click'); show('lobby'); });
