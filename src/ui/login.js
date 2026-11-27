import { account, changePin, claimDaily, cleanNick, lastNick, login, logout, playAsGuest, signup, validPin } from '../account.js';
import { initAudio, playUI } from '../audio.js';
import { LATEST_UPDATE, UPDATES } from '../updates.js';
import { hud } from './hud.js';
import { HOWTO_KEY, show } from './screen.js';
import { $, esc } from './state.js';
import { runAchCheck } from './titles.js';
import { renderMissions } from './missions.js';
import { renderFreeGacha } from './freeGacha.js';

/* ───────── 로그인 (PIN 계정 / 손님) ───────── */
const LOGIN_MSG = {
  error: '서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요',
  taken: '방금 누가 이 닉네임으로 가입했어요. 다른 닉네임을 써 주세요',
  bad_nick: '닉네임은 1~10글자로 해 주세요',
  bad_pin: 'PIN은 숫자 4자리로 해 주세요',
};
const waitText = (sec) => (sec >= 60 ? `${Math.ceil(sec / 60)}분` : `${sec}초`);
let busy = false;

export function renderMe() {
  $('me-name').innerHTML = account.guest
    ? `${esc(account.nick)}<small>손님</small>`
    : `${esc(account.nick)}<small>님</small>`;
  $('btn-pin').classList.toggle('hidden', account.guest);
  $('me-coins').classList.toggle('hidden', account.guest);
  $('me-coins').innerHTML = `<i class="coin-dot"></i>${account.player?.coins ?? 0}`;
  $('btn-logout').textContent = account.guest ? '로그인' : '로그아웃';
  const p = account.player;
  $('me-stats').innerHTML = p
    ? `<span>1v1 <b>${p.wins_1v1}승</b></span><span>2v2 <b>${p.wins_2v2}승</b></span><span>최장 랠리 <b>${p.best_rally}</b></span>` // 패 수는 보여 주지 않는다 (사용자 결정, 상대 전적만 승패 둘 다)
    : '<span class="guest">손님은 전적·코인이 저장되지 않아요</span>';
  $('me-menu').classList.add('hidden');
  renderMissions();
  renderFreeGacha();
}

// 로비: ⚙️ 내 계정 메뉴 (PIN 바꾸기·박자 맞추기·로그아웃), ❓ 치는 방법 창
$('btn-me-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  playUI('click');
  $('me-menu').classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!$('me-menu').contains(e.target)) $('me-menu').classList.add('hidden');
});
// 🎵 박자 맞추기 (낚시 리듬의 소리 보정, docs/dev/fishing.md 18장) — 손님도 됨(이 기기에만 저장). 낚시 코드는 누를 때 불러옴
$('btn-sync').addEventListener('click', () => {
  playUI('click');
  $('me-menu').classList.add('hidden');
  import('../games/fishing/syncCal.js').then((m) => m.openSyncCal());
});
$('btn-howto').addEventListener('click', () => { playUI('click'); $('howto').classList.remove('hidden'); });
$('lnk-until09').addEventListener('click', () => playUI('click'));
const closeHowto = () => {
  $('howto').classList.add('hidden');
  try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* 무시 */ }
};
$('btn-howto-close').addEventListener('click', () => { playUI('click'); closeHowto(); });
$('howto').addEventListener('click', (e) => { if (e.target === $('howto')) closeHowto(); });

// 업데이트 내역 창 (src/updates.js). 아직 못 본 최신 업데이트가 있으면 아이콘에 N 표시(자동으로 띄우지는 않음).
const UPD_KEY = 'smash-updates-seen'; // 본 업데이트 id
export function updSeen() {
  try { return localStorage.getItem('smash-updates-seen') === LATEST_UPDATE; } catch { return true; }
}
$('upd-list').innerHTML = UPDATES.map((u, i) => `
  <section class="upd-day">
    <h3>${u.date}${u.tag ? ` <span class="upd-tag">${u.tag}</span>` : ''}${i === 0 ? ' <span class="upd-new">NEW</span>' : ''}</h3>
    <ul class="upd-big">${u.big.map(([ico, t, d]) => `<li><i>${ico}</i><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ul>
    ${u.small.length ? `<details><summary>자잘한 변경·고침 ${u.small.length}개</summary><ul>${u.small.map((t) => `<li>${t}</li>`).join('')}</ul></details>` : ''}
  </section>`).join('');
$('btn-updates').addEventListener('click', () => {
  playUI('click');
  $('upd-list').scrollTop = 0;
  $('updates').classList.remove('hidden');
  try { localStorage.setItem(UPD_KEY, LATEST_UPDATE); } catch { /* 무시 */ }
  $('upd-dot').classList.add('hidden');
});
const closeUpdates = () => $('updates').classList.add('hidden');
$('btn-updates-close').addEventListener('click', () => { playUI('click'); closeUpdates(); });
$('updates').addEventListener('click', (e) => { if (e.target === $('updates')) closeUpdates(); });
export const showLobby = () => show('lobby');

// 로그인하면 하루 첫 접속 코인 받기 (한국 시간으로 하루 한 번)
export async function checkDaily() {
  runAchCheck(2600);
  const got = await claimDaily();
  if (!got) return;
  if (!$('lobby').classList.contains('hidden')) renderMe();
  setTimeout(() => { playUI('coin'); hud.toast(`🎁 오늘 첫 접속! +${got} 코인`, 2600); }, 1200);
}

export function showLogin(msg = '') {
  $('login-form').classList.remove('hidden');
  $('signup-form').classList.add('hidden');
  $('login-nick').value = $('login-nick').value || lastNick();
  $('login-pin').value = '';
  $('login-msg').textContent = msg;
  show('login');
  ($('login-nick').value ? $('login-pin') : $('login-nick')).focus();
}

async function doLogin() {
  if (busy) return;
  initAudio();
  playUI('click');
  const nick = cleanNick($('login-nick').value);
  const pin = $('login-pin').value;
  const msg = $('login-msg');
  if (!nick) { msg.textContent = '닉네임을 입력해 주세요'; $('login-nick').focus(); return; }
  if (!validPin(pin)) { msg.textContent = 'PIN은 숫자 4자리예요'; $('login-pin').focus(); return; }
  busy = true;
  msg.textContent = '확인 중…';
  const r = await login(nick, pin);
  busy = false;
  if (r.status === 'ok') { msg.textContent = ''; showLobby(); hud.toast(`어서 와요, ${account.nick}님!`); checkDaily(); return; }
  if (r.status === 'no_user') {
    msg.textContent = '';
    $('signup-nick').textContent = `'${nick}'`;
    $('signup-pin').value = '';
    $('signup-msg').textContent = '';
    $('login-form').classList.add('hidden');
    $('signup-form').classList.remove('hidden');
    $('signup-pin').focus();
    return;
  }
  $('login-pin').value = '';
  if (r.status === 'wrong_pin') msg.textContent = `PIN이 틀렸어요 (${r.left}번 더 틀리면 5분 동안 잠겨요)`;
  else if (r.status === 'locked') msg.textContent = `PIN을 5번 틀려서 잠겼어요. ${waitText(r.wait)} 뒤에 다시 해 주세요`;
  else msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
  $('login-pin').focus();
}

async function doSignup() {
  if (busy) return;
  playUI('click');
  const msg = $('signup-msg');
  if ($('signup-pin').value !== $('login-pin').value) {
    msg.textContent = '처음 입력한 PIN과 달라요. 다시 입력해 주세요';
    $('signup-pin').value = '';
    $('signup-pin').focus();
    return;
  }
  busy = true;
  msg.textContent = '가입 중…';
  const r = await signup($('login-nick').value, $('login-pin').value);
  busy = false;
  if (r.status === 'ok') { msg.textContent = ''; showLobby(); hud.toast(`가입 완료! 반가워요, ${account.nick}님`, 2400); checkDaily(); return; }
  msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
}

function doGuest() {
  initAudio();
  playUI('click');
  const nick = cleanNick($('login-nick').value);
  if (!nick) { $('login-msg').textContent = '손님도 닉네임은 입력해 주세요'; $('login-nick').focus(); return; }
  playAsGuest(nick);
  showLobby();
}

async function doChangePin() {
  if (busy) return;
  playUI('click');
  const a = $('pin-new').value, b = $('pin-new2').value, msg = $('pin-msg');
  if (!validPin(a)) { msg.textContent = 'PIN은 숫자 4자리예요'; $('pin-new').focus(); return; }
  if (a !== b) { msg.textContent = '두 번 입력한 PIN이 달라요'; $('pin-new2').value = ''; $('pin-new2').focus(); return; }
  busy = true;
  msg.textContent = '바꾸는 중…';
  const r = await changePin(a);
  busy = false;
  if (r.status === 'ok') { showLobby(); hud.toast('PIN을 바꿨어요'); return; }
  if (r.status === 'no_session') { showLogin('로그인이 풀렸어요. 다시 로그인해 주세요'); return; }
  msg.textContent = LOGIN_MSG[r.status] || LOGIN_MSG.error;
}

const onlyDigits = (e) => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); };
for (const id of ['login-pin', 'signup-pin', 'pin-new', 'pin-new2']) $(id).addEventListener('input', onlyDigits);
$('btn-login').addEventListener('click', doLogin);
$('login-nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-pin').focus(); });
$('login-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('btn-signup').addEventListener('click', doSignup);
$('signup-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); });
$('btn-signup-cancel').addEventListener('click', () => { playUI('click'); showLogin(); });
$('btn-guest').addEventListener('click', doGuest);
$('btn-logout').addEventListener('click', async () => {
  playUI('click');
  if (!account.guest) { await logout(); showLogin('로그아웃했어요'); }
  else showLogin();
});
$('btn-pin').addEventListener('click', () => {
  playUI('click');
  $('pin-new').value = '';
  $('pin-new2').value = '';
  $('pin-msg').textContent = '';
  show('pin-change');
  $('pin-new').focus();
});
$('btn-pin-go').addEventListener('click', doChangePin);
$('pin-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pin-new2').focus(); });
$('pin-new2').addEventListener('keydown', (e) => { if (e.key === 'Enter') doChangePin(); });
$('btn-pin-cancel').addEventListener('click', () => { playUI('click'); showLobby(); });
