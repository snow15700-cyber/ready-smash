// 광장 로비 화면 흐름 (docs/dev/plaza.md, 만드는 순서 ① 광장 기본)
// - 로비 화면(#lobby)에 'plaza-on'이 붙으면 메뉴 대신 3D 광장이 보이고, 내 정보·미션·쉬는 시간 알림은 그대로 위에 뜬다.
// - 광장 채널(net.js joinPlaza): 명단(presence)에 내 이름·꾸미기·마지막 걷기 {from,to,t}. 걷기는 클릭할 때만 고친다.
// - 정해진 채팅: 문구 번호만 보낸다({k:'say', id, c}), 한 사람 2초에 한 번, 머리 위 말풍선 약 3초.
// - 경기·대기실·관전 중에는 광장 채널에서 빠진다(선수 부담 0). 상점·꾸미기·랭킹 화면을 보는 동안은 광장에 그대로 서 있다.
// - 최대 40명 (41번째부터는 '광장이 꽉 찼어요' → 옛 로비).
import { account, myEquip, myTitle } from '../account.js';
import { titleText } from '../achievements.js';
import { playUI } from '../audio.js';
import { PLAZA } from '../arena-plaza.js';
import { joinPlaza } from '../net.js';
import { cleanWalk, clipWalk, createPlazaView, posAt } from '../plaza.js';
import { openDress } from './dress.js';
import { hud } from './hud.js';
import { myId, room } from './room.js';
import { curScreen, show } from './screen.js';
import { $, IS_MOBILE, esc, game, myNemesis, myNick, plazaHome, setPlazaHome, world } from './state.js';
import { watch } from './watch.js';

export const PLAZA_MAX = 40;
const SAY_GAP = 2; // 한 사람 2초에 한 번
const TRACK_GAP = 250; // 명단 정보 고치기 최소 간격(ms): 마구 클릭해도 서버에 몰리지 않게 (마지막 클릭은 꼭 보냄)
// 정해진 채팅 문구 (plaza.md 6장, 사용자가 바꿀 수 있음). 보내는 건 번호만
export const PHRASES = {
  1: '🏓 1대1 한판 하실래요?', 2: '👥 2대2 한판 하실래요?', 3: '🙋 저 낄게요!', 4: '⏳ 잠깐만요!', 5: '👏 잘 치시네요!',
  6: '😂 ㅋㅋㅋ', 7: '🔁 한 판 더?', 8: '👋 안녕하세요', 9: '🙏 다음에 해요', 10: '🔔 곧 쉬는 시간 끝나요!',
};
const SHOP_OPEN = {
  shop: () => openDress('gacha'),
  closet: () => openDress('closet'),
  rank: () => $('btn-rank').click(),
};

// 처음 서는 곳: 가운데 근처에 조금씩 흩어져서 (여럿이 동시에 들어와도 안 겹치게)
const spawn = () => {
  const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
  const p = [PLAZA.spawn[0] + Math.cos(a) * r, PLAZA.spawn[1] + Math.sin(a) * r * 0.6];
  return { from: p, to: p, t: Date.now() };
};
const pz = {
  link: null, at: 0, people: new Map(), myW: spawn(), full: false,
  sayT: -9, lastSay: new Map(), pendingShop: null,
  trackT: 0, trackTimer: 0, infoKey: '', infoCheckT: 0, shown: false,
};
const view = createPlazaView(world, { onGround: walkTo, onShop: goShop });

const myInfo = () => ({ id: myId, nick: myNick(), title: myTitle(), titleX: myNemesis(), look: myEquip(), at: pz.at, mob: IS_MOBILE, w: pz.myW });
const myFig = () => ({ id: myId, nick: myNick(), title: titleText(myTitle(), myNemesis()), look: myEquip(), w: pz.myW, me: true });

// 명단 정보 보내기 (걷기·꾸미기가 바뀔 때만). 너무 잦으면 마지막 것만 조금 뒤에
function sendInfo() {
  if (!pz.link) return;
  clearTimeout(pz.trackTimer);
  const wait = TRACK_GAP - (performance.now() - pz.trackT);
  if (wait > 0) { pz.trackTimer = setTimeout(sendInfo, wait); return; }
  pz.trackT = performance.now();
  pz.link.track(myInfo());
}

function connect() {
  pz.full = false;
  pz.at = Date.now();
  pz.people.clear();
  const link = pz.link = joinPlaza((list) => onList(link, list), (m) => onMsg(link, m));
  pz.infoKey = infoKey();
  pz.trackT = 0;
  link.track(myInfo());
}
function disconnect() {
  if (!pz.link) return;
  clearTimeout(pz.trackTimer);
  pz.link.leave();
  pz.link = null;
  pz.people.clear();
  view.sync([myFig()]);
  renderCount();
}
const infoKey = () => JSON.stringify([myNick(), myTitle(), myNemesis(), myEquip()]);

// 받은 명단 다듬기 (다른 PC가 보낸 것은 믿지 않고 모양·길이를 확인)
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
function onList(link, list) {
  if (link !== pz.link) return;
  const now = Date.now();
  const byId = new Map();
  for (const m of list) {
    if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 16) continue;
    const at = typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : now;
    const old = byId.get(m.id);
    if (old && old.at > at) continue; // 같은 사람이 두 번 있으면 나중에 들어온 것
    byId.set(m.id, { id: m.id, nick: str(m.nick, 10) || '플레이어', title: titleText(str(m.title, 40) || null, str(m.titleX, 10)), look: m.look && typeof m.look === 'object' ? m.look : {}, at, mob: !!m.mob, w: m.id === myId ? null : cleanWalk(m.w, now) });
  }
  // 40명까지: 먼저 들어온 순서 (들어온 시각 → id 순, 모든 PC가 같은 규칙)
  const order = [...byId.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const mine = order.findIndex((p) => p.id === myId);
  if (mine >= PLAZA_MAX) { plazaFull(); return; }
  pz.people = new Map(order.slice(0, PLAZA_MAX).filter((p) => p.id !== myId && p.w).map((p) => [p.id, p]));
  view.sync([myFig(), ...pz.people.values()]);
  renderCount();
}
function plazaFull() {
  disconnect();
  pz.full = true;
  setPlazaHome(false);
  show('lobby');
  hud.toast(`광장이 꽉 찼어요 (${PLAZA_MAX}명까지). 옛 로비에서 놀아 주세요`, 3200);
}
function onMsg(link, m) {
  if (link !== pz.link || !m || m.k !== 'say' || typeof m.id !== 'string') return;
  const c = String(m.c);
  if (!Object.hasOwn(PHRASES, c) || !pz.people.has(m.id)) return; // 목록에 있는 문구·광장에 있는 사람만
  const now = performance.now() / 1000;
  if (now - (pz.lastSay.get(m.id) ?? -9) < SAY_GAP * 0.9) return; // 너무 자주 오면 무시
  pz.lastSay.set(m.id, now);
  view.say(m.id, PHRASES[c]);
}

// ───── 걷기 ─────
function walkTo(pt, keepShop = false) {
  const nowMs = Date.now();
  const from = posAt(pz.myW, nowMs);
  const to = clipWalk(from, pt);
  pz.myW = { from: [from[0], from[1]], to: [to[0], to[1]], t: nowMs };
  if (!keepShop) pz.pendingShop = null;
  view.cam.manual = false; // 걷기 시작하면 카메라는 다시 내 뒤로 따라온다
  view.put(myFig());
  view.showMarker(to[0], to[1]);
  closePhrases();
  sendInfo();
}
// 가게: 문 앞으로 걸어가서, 도착하면 그 화면을 연다 (이미 문 앞이면 바로)
function goShop(s) {
  playUI('click');
  const p = posAt(pz.myW, Date.now());
  if (Math.hypot(p[0] - s.door[0], p[1] - s.door[1]) < 1.3) { openShop(s); return; }
  walkTo(s.door, true);
  pz.pendingShop = s;
}
function openShop(s) {
  pz.pendingShop = null;
  SHOP_OPEN[s.id]?.();
}

// ───── 정해진 채팅 ─────
function renderPhrases() {
  $('pz-phrases').innerHTML = Object.entries(PHRASES).map(([k, t]) => `<button type="button" data-say="${k}">${esc(t)}</button>`).join('');
}
const closePhrases = () => $('pz-phrases').classList.add('hidden');
function say(c) {
  if (!Object.hasOwn(PHRASES, c)) return;
  const now = performance.now() / 1000;
  if (now - pz.sayT < SAY_GAP) return;
  pz.sayT = now;
  pz.link?.send({ k: 'say', id: myId, c: +c });
  view.say(myId, PHRASES[c]);
  closePhrases();
  const b = $('btn-say');
  b.disabled = true;
  setTimeout(() => { b.disabled = false; }, SAY_GAP * 1000 + 30);
}
renderPhrases();
$('btn-say').addEventListener('click', (e) => {
  e.stopPropagation();
  playUI('click');
  $('pz-phrases').classList.toggle('hidden');
});
$('pz-phrases').addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) { playUI('click'); say(b.dataset.say); }
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.pz-chat')) closePhrases(); });

// 옛 로비 ↔ 광장 (② 단계에서 옛 로비를 없앨 때까지 임시)
$('btn-old-lobby').addEventListener('click', () => { playUI('click'); setPlazaHome(false); show('lobby'); });
$('btn-to-plaza').addEventListener('click', () => { playUI('click'); pz.full = false; setPlazaHome(true); show('lobby'); });
$('pz-help').textContent = IS_MOBILE ? '탭: 걷기 · 끌기: 돌려 보기 · 두 손가락: 가까이/멀리' : '바닥 클릭: 걷기 · 오른쪽 버튼 끌기: 돌려 보기 · 휠: 가까이/멀리';

function renderCount() {
  $('pz-count').textContent = `👥 광장 ${pz.link ? pz.people.size + 1 : 1}명`;
}

// 지금 광장이 화면에 보이나 (로비 화면 + 광장 모드)
export const plazaShown = () => plazaHome && !game && !$('lobby').classList.contains('hidden');

// 매 프레임 (main.js): 광장 채널 붙기/빠지기 + 광장이 보이면 그리기. 광장을 그렸으면 true
export function plazaFrame(now) {
  // 광장 채널: 광장·상점·꾸미기·랭킹 화면에 있을 때만. 경기·대기실·관전·로그인 화면에서는 빠진다
  const want = plazaHome && !pz.full && !game && !room && !watch && ['lobby', 'dress', 'rank'].includes(curScreen);
  if (want && !pz.link) connect();
  else if (!want && pz.link) disconnect();
  // 꾸미기·칭호·닉네임이 바뀌었으면 명단 정보 고치기 (1초마다 확인)
  if (pz.link && now - pz.infoCheckT > 1) {
    pz.infoCheckT = now;
    const k = infoKey();
    if (k !== pz.infoKey) { pz.infoKey = k; view.put(myFig()); sendInfo(); }
  }
  const shown = plazaShown();
  world.setPlaza(shown);
  if (shown !== pz.shown) {
    pz.shown = shown;
    view.setVisible(shown);
    if (shown) {
      view.put(myFig());
      world.setBall([0, -9, 0], false);
      world.ring.visible = false;
      world.aim.visible = false;
      renderCount();
    } else {
      closePhrases(); // 로비 캐릭터는 로비·경기 화면이 다시 켠다
    }
  }
  if (!shown) return false;
  for (const side of world.team) for (const c of side) c.group.visible = false; // 랠리하는 로비 캐릭터는 숨김
  // 가게로 가는 중: 문 앞에 도착하면 그 화면을 연다
  if (pz.pendingShop) {
    const p = posAt(pz.myW, Date.now());
    if (Math.hypot(p[0] - pz.myW.to[0], p[1] - pz.myW.to[1]) < 0.02) openShop(pz.pendingShop);
  }
  view.update(now, myId);
  return true;
}

// 점검·디버그용
export const plazaDebug = { pz, view, walkTo, say, PHRASES, fakeList: (list) => onList(pz.link, list) };
