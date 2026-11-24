// 광장 로비 화면 흐름 (docs/dev/plaza.md, 만드는 순서 ① 광장 기본 · ② 탁구대에 서서 경기)
// - 로비 화면(#lobby.plaza-on) 위에 3D 광장이 보이고, 내 정보·미션·쉬는 시간 알림은 그대로 위에 뜬다.
// - 광장 채널(net.js joinPlaza): 명단(presence)에 내 이름·꾸미기·마지막 걷기 {from,to,t}·탁구대 자리 {t,s,at}·준비.
//   걷기·자리·준비는 바뀔 때만 고친다(매 프레임 전송 없음).
// - 탁구대: 자리·방장·준비는 모든 PC가 광장 명단으로 같은 규칙(선 시각 → id 순)으로 계산한다. 모두 준비되면
//   선수마다 경기 채널로(room.js enterTable) → 방장이 'go' → 지금 경기 화면. 경기가 시작되면 광장 채널에서 빠지고(선수 부담 0),
//   끝나면 다시 붙어서 그 탁구대 앞에 그대로 서 있다('🔁 한 판 더'). 1분 동안 아무것도 안 하면 자리에서 내려온다.
// - 경기 중인 탁구대는 방장이 로비 채널에 올린 정보(lobbyList.js)로 안다 → 점수 표지판, 누르면 관전.
// - 정해진 채팅: 문구 번호만 보낸다({k:'say', id, c}), 한 사람 2초에 한 번, 머리 위 말풍선 약 3초.
// - 최대 40명 (41번째부터는 '광장이 꽉 찼어요' → 혼자 광장, 30초 뒤 다시 시도).
import { account, myEquip, myTitle } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { PLAZA } from '../arena-plaza.js';
import { AI_NAME, KIM_ID } from '../match.js';
import { BREADS, KIM_READY_MS } from '../plazaKim.js';
import { ic } from '../icons.js';
import { joinPlaza, makeCode } from '../net.js';
import { cleanWalk, createPlazaView, planWalk, posAt } from '../plaza.js';
import { createPlazaSky } from '../plazaSky.js';
import { AI_LOOK, startAI } from './ai.js';
import { dressTabNow, openDress } from './dress.js';
import { hud } from './hud.js';
import { lobbyRooms } from './lobbyList.js';
import { TEAM_NAME, enterTable, h2hOf, leaveRoom, myId, myStreak, room, roomHooks } from './room.js';
import { curScreen, show } from './screen.js';
import { $, IS_MOBILE, MOBILE_MSG, esc, game, myNemesis, myNick, preview, world } from './state.js';
import { BUBBLE_IN } from '../arena-plaza.js';
import { bub, bubbleArena, bubbleClip, bubbleFrame, bubbleHooks, bubbleLeave, bubbleSeated, rememberPlazaEnv, setSeated, stop as bubbleStop } from './plazaBubble.js';

export const PLAZA_MAX = 40;
const SAY_GAP = 2; // 한 사람 2초에 한 번
const TRACK_GAP = 250; // 명단 정보 고치기 최소 간격(ms): 마구 클릭해도 서버에 몰리지 않게 (마지막 클릭은 꼭 보냄)
const AFK_MS = 60000; // 탁구대에 서서 1분 동안 아무것도 안 하면 자리 비움 (plaza.md 2장)
const AFK_WARN = 15000; // 마지막 15초는 '곧 자리 비움' 알림
const READY_HOLD = 0.4; // 모두 준비를 이만큼(초) 계속 보면 경기 채널로 (명단이 막 바뀌는 순간에 들어가지 않게)
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
const NT = PLAZA.tables.length;
const sideOf = (s) => (s < 2 ? 0 : 1); // 자리 0·1 = A팀, 2·3 = B팀
// 자리에서 탁구대 쪽을 보는 방향 (캐릭터 앞 = -z)
const faceOf = (seat) => {
  const T = PLAZA.tables[seat.t], [sx, sz] = T.seats[seat.s];
  return Math.atan2(-(T.x - sx), -(T.z - sz));
};

// 처음 서는 곳: 가운데 근처에 조금씩 흩어져서 (여럿이 동시에 들어와도 안 겹치게)
const spawn = () => {
  const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
  const p = [PLAZA.spawn[0] + Math.cos(a) * r, PLAZA.spawn[1] + Math.sin(a) * r * 0.6];
  return { from: p, to: p, t: Date.now() };
};
const pz = {
  link: null, at: 0, people: new Map(), kimN: 0, myW: spawn(), full: false,
  sayT: -9, lastSay: new Map(), pending: null, route: [], face: null, // face: 서 있을 때 바라볼 쪽 (꾸미기 창에서 카메라 쪽으로 돌아섬, 걸으면 null)
  sendT: 0, sendTimer: 0, infoKey: '', infoCheckT: 0, shown: false,
  list: [], states: new Map(), known: new Set(), resendT: 0, beatT: 0, // 명단(presence) · 받은 상태 'st'(id → 걷기·자리·준비) · 이미 본 id
  // 탁구대: 내 자리 {t, s, at} · 준비 · 경기 채널 코드(내가 방장이면 이걸로) · 방금 끝난 경기(결과·코인) · 경기 채널로 가는 중
  seat: null, rdy: false, code: makeCode(), after: null, going: false, readyAt: 0, lastAct: Date.now(), tableT: 0, panelKey: '',
  // ⑤ 내가 부른 김제빵 {t, s, at, bye} (방장일 때) · 탁구대별 마지막 '사람 구해요' 시각 · 초대 보낸/받은 시각 · 김제빵 시각을 처음 본 때
  kim: null, callT: {}, invT: new Map(), invGotT: new Map(), kimSeen: new Map(), popFor: null,
};
const view = createPlazaView(world, { onGround: (pt) => walkTo(pt), onShop: goShop, onTable, onSeat, onKim, onPerson });
let sky = null; // 시간·날씨 (src/plazaSky.js), 광장을 처음 켤 때 만든다
let skyLabelT = -9;

const myPid = () => (account.loggedIn ? account.player?.id ?? null : null);
// 명단(presence)에는 잘 안 바뀌는 것만 (Supabase는 track을 자주 하면 채널을 끊는다, net.js TRACK_MIN)
// kim: 김제빵 탁구대에서 혼자 하기 중 (③) — 다른 사람 화면에선 내 캐릭터 대신 '🔥 N명 도전 중'
const inAI = () => game?.mode === 'ai';
const myInfo = () => ({ id: myId, nick: myNick(), title: myTitle(), titleX: myNemesis(), look: myEquip(), at: pz.at, mob: IS_MOBILE, kim: inAI() });
// 자주 바뀌는 것은 메시지로: 걷기·탁구대 자리·준비·경기 채널 코드·연승·선수 번호
const myState = () => ({ k: 'st', id: myId, w: pz.myW, seat: pz.seat, rdy: pz.rdy, code: pz.code, st: myStreak(), pid: myPid(), kc: pz.kim });
const tagOf = (nick, rdy) => (rdy ? `${nick} ✅` : nick);
// 꾸미기 창에서 입어 보는 중이면 그 모습 (내 화면에서만, 다른 사람에겐 장착한 것)
const myLook = () => (curScreen === 'dress' && preview ? preview.look : myEquip());
const myFig = () => ({ id: myId, nick: tagOf(myNick(), pz.seat && pz.rdy), title: titleText(myTitle(), myNemesis()), look: myLook(), w: pz.myW, me: true, face: pz.seat ? faceOf(pz.seat) : pz.face });
const figOf = (p) => ({ ...p, nick: tagOf(p.nick, p.seat && p.rdy), face: p.seat ? faceOf(p.seat) : null });

// 내 상태 보내기 (걷기·자리·준비가 바뀔 때만). 너무 잦으면 마지막 것만 조금 뒤에
function sendInfo() {
  if (!pz.link) return;
  clearTimeout(pz.sendTimer);
  const wait = TRACK_GAP - (performance.now() - pz.sendT);
  if (wait > 0) { pz.sendTimer = setTimeout(sendInfo, wait); return; }
  pz.sendT = performance.now();
  pz.beatT = performance.now();
  pz.link.send(myState());
}
// 새 사람이 들어오면 내 상태를 한 번 더 (메시지는 들어오기 전 것을 못 받으니까). 여럿이 한꺼번에 와도 한 번으로 묶음
function resendSoon() {
  if (pz.resendT || !pz.link) return;
  pz.resendT = setTimeout(() => { pz.resendT = 0; sendInfo(); }, 300 + Math.random() * 500);
}

function connect() {
  pz.full = false;
  pz.at = Date.now();
  pz.people.clear();
  const link = pz.link = joinPlaza((list) => onList(link, list), (m) => onMsg(link, m));
  pz.infoKey = infoKey();
  pz.sendT = 0;
  pz.list = [];
  pz.states.clear();
  pz.known = new Set([myId]);
  link.track(myInfo());
  setTimeout(() => { if (pz.link === link) sendInfo(); }, 600); // 붙은 뒤 내 상태 알리기
}
function disconnect() {
  if (!pz.link) return;
  clearTimeout(pz.sendTimer);
  clearTimeout(pz.resendT);
  pz.resendT = 0;
  pz.link.leave();
  pz.link = null;
  pz.people.clear();
  view.sync([myFig()]);
  renderCount();
}
const infoKey = () => JSON.stringify([myNick(), myTitle(), myNemesis(), myEquip(), myStreak(), inAI()]);

// 받은 명단 다듬기 (다른 PC가 보낸 것은 믿지 않고 모양·길이를 확인)
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function cleanSeat(v) {
  if (!v || !Number.isInteger(v.t) || v.t < 0 || v.t >= NT || !Number.isInteger(v.s) || v.s < 0 || v.s > 3 || !fin(v.at)) return null;
  return { t: v.t, s: v.s, at: v.at };
}
// 불려 온 김제빵 정보 {t, s, at, bye} (방장의 상태). 'kim'(혼자 하기 중 표시, true)과 구별
function cleanKim(v) {
  if (!v || typeof v !== 'object' || !Number.isInteger(v.t) || v.t < 0 || v.t >= NT || !Number.isInteger(v.s) || v.s < 0 || v.s > 3 || !fin(v.at)) return null;
  return { t: v.t, s: v.s, at: v.at, bye: fin(v.bye) ? v.bye : null, b: Number.isInteger(v.b) && v.b >= 0 && v.b < 500 ? v.b : null };
}
function onList(link, list) {
  if (link !== pz.link) return;
  pz.list = list;
  // 처음 보는 사람이 들어왔으면 내 상태를 다시 알려 준다
  const ids = new Set(list.map((m) => m?.id).filter((id) => typeof id === 'string'));
  if ([...ids].some((id) => !pz.known.has(id))) resendSoon();
  pz.known = ids.add(myId);
  // 나간 사람 상태는 2분 뒤에 버림 (명단에서 잠깐 빠졌다 돌아오는 사람은 바로 다시 보이게 — 상태 메시지는 15초마다만 다시 옴)
  const old = Date.now() - 120000;
  for (const [id, st] of pz.states) if (!ids.has(id) && st._t < old) pz.states.delete(id);
  rebuild();
}
// 받은 상태 'st' 다듬어 두기 (명단에 아직 없는 사람 것도 잠시 둔다: 메시지가 명단보다 먼저 올 수 있음)
function onState(m) {
  if (typeof m.id !== 'string' || !m.id || m.id.length > 16 || m.id === myId) return;
  if (pz.states.size > 120 && !pz.states.has(m.id)) return;
  pz.states.set(m.id, { ...m, _t: Date.now() });
  rebuild();
}
// 명단 + 상태 → 광장 사람들
function rebuild() {
  const now = Date.now();
  const byId = new Map();
  for (const m0 of pz.list) {
    const m = m0 && { ...m0, ...(pz.states.get(m0.id) || {}) };
    if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 16) continue;
    const at = fin(m.at) ? m.at : now;
    const old = byId.get(m.id);
    if (old && old.at > at) continue; // 같은 사람이 두 번 있으면 나중에 들어온 것
    const mob = !!m.mob;
    byId.set(m.id, {
      id: m.id, nick: str(m.nick, 10) || '플레이어', title: titleText(str(m.title, 40) || null, str(m.titleX, 10)), look: m.look && typeof m.look === 'object' ? m.look : {}, at, mob,
      w: m.id === myId ? null : cleanWalk(m.w, now),
      seat: mob ? null : cleanSeat(m.seat), rdy: !!m.rdy, code: typeof m.code === 'string' && /^[A-Z0-9]{4}$/.test(m.code) ? m.code : null,
      pid: (typeof m.pid === 'string' && m.pid.length <= 64) || Number.isInteger(m.pid) ? m.pid : null,
      kim: m0.kim === true, called: cleanKim(m.kc),
    });
  }
  // 40명까지: 먼저 들어온 순서 (들어온 시각 → id 순, 모든 PC가 같은 규칙)
  const order = [...byId.values()].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const mine = order.findIndex((p) => p.id === myId);
  if (mine >= PLAZA_MAX) { plazaFull(); return; }
  const inPlaza = order.slice(0, PLAZA_MAX).filter((p) => p.id !== myId);
  pz.kimN = inPlaza.filter((p) => p.kim).length; // 김제빵에게 도전 중 (광장에는 안 보임)
  pz.people = new Map(inPlaza.filter((p) => !p.kim && p.w).map((p) => [p.id, p]));
  view.sync([myFig(), ...[...pz.people.values()].map(figOf)]);
  renderCount();
  pz.tableT = 0; // 탁구대 다시 계산
}
function plazaFull() {
  unseat();
  disconnect();
  pz.full = true;
  renderCount();
  hud.toast(`광장이 꽉 찼어요 (${PLAZA_MAX}명까지). 혼자 광장에 있다가 30초 뒤 다시 들어가 볼게요`, 3400);
  setTimeout(() => { pz.full = false; renderCount(); }, 30000);
}
function onMsg(link, m) {
  if (link !== pz.link || !m) return;
  if (m.k === 'st') { onState(m); return; }
  if (m.k === 'call') { onCall(m); return; }
  if (m.k === 'inv') { onInvite(m); return; }
  if (m.k !== 'say' || typeof m.id !== 'string') return;
  const c = String(m.c);
  if (!Object.hasOwn(PHRASES, c) || !pz.people.has(m.id)) return; // 목록에 있는 문구·광장에 있는 사람만
  const now = performance.now() / 1000;
  if (now - (pz.lastSay.get(m.id) ?? -9) < SAY_GAP * 0.9) return; // 너무 자주 오면 무시
  pz.lastSay.set(m.id, now);
  view.say(m.id, PHRASES[c]);
}

// ───── 걷기 ─────
bubbleHooks.walk = (pt) => walkTo(pt, { keepSeat: true });
// pt로 걸어간다 (막히면 모서리를 돌아서). then: 도착하면 할 일 · keepSeat: 탁구대 자리로 가는 길 (자리에서 안 내려옴)
function walkTo(pt, { then = null, keepSeat = false } = {}) {
  if (bubbleSeated()) setSeated(false); // 관중석에 앉아 있었으면 일어나서 걷기
  if (!keepSeat) unseat();
  pz.face = null;
  const nowMs = Date.now();
  const from = posAt(pz.myW, nowMs);
  // 경기장 거품 안: 벽 밖으로는 못 감 → 벽 앞까지 걸어가서 광장으로 나간 뒤, 원래 가려던 곳으로
  const clip = bubbleClip(from, pt);
  if (clip.exit && !then) {
    const target = pt;
    then = () => { bubbleLeave(); setTimeout(() => walkTo(target), 350); };
    pt = clip.to;
  } else pt = clip.to;
  const path = planWalk(from, pt);
  pz.route = path.slice(1);
  pz.pending = then;
  stepWalk(from, path[0], nowMs);
  view.cam.manual = false; // 걷기 시작하면 카메라는 다시 내 뒤로 따라온다
  const end = path[path.length - 1];
  view.showMarker(end[0], end[1]);
  closePhrases();
}
function stepWalk(from, to, nowMs) {
  pz.myW = { from: [from[0], from[1]], to: [to[0], to[1]], t: nowMs };
  view.put(myFig());
  sendInfo();
}
// 가게: 문 앞으로 걸어가서, 도착하면 그 화면을 연다 (이미 문 앞이면 바로)
function goShop(s) {
  playUI('click');
  const p = posAt(pz.myW, Date.now());
  if (Math.hypot(p[0] - s.door[0], p[1] - s.door[1]) < 1.3) { unseat(); SHOP_OPEN[s.id]?.(); return; }
  walkTo(s.door, { then: () => SHOP_OPEN[s.id]?.() });
}
// 김제빵 탁구대 (③): 걸어가서 혼자 하기. 누구나 동시에 (각자 자기 PC에서, 네트워크 안 씀). 휴대폰도 됨
function onKim() {
  playUI('click');
  const p = posAt(pz.myW, Date.now()), k = PLAZA.kim.spot;
  if (Math.hypot(p[0] - k[0], p[1] - k[1]) < 1.0) { unseat(); startAI(); return; }
  walkTo(k, { then: () => startAI() });
}

// ───── 탁구대 (plaza.md 2장) ─────
// 탁구대 t의 지금 모습: 모든 PC가 같은 명단으로 같은 결과를 낸다 (같은 칸 → 먼저 선 사람, 시각이 같으면 id 순)
function tableState(t) {
  const all = [];
  if (pz.seat?.t === t) all.push({ id: myId, nick: myNick(), seat: pz.seat, rdy: pz.rdy, code: pz.code, pid: myPid(), me: true });
  for (const p of pz.people.values()) if (p.seat?.t === t) all.push(p);
  all.sort((a, b) => a.seat.at - b.seat.at || (a.id < b.id ? -1 : 1));
  const seats = [null, null, null, null], losers = [];
  for (const p of all) { if (seats[p.seat.s]) losers.push(p); else seats[p.seat.s] = p; }
  const owners = all.filter((p) => !losers.includes(p));
  const host = owners[0] || null, humans = owners.length;
  // ⑤ 방장이 부른 김제빵 (빈칸에, 돌아가는 중이 아닐 때). 뛰어오는 동안은 준비 전
  const kc = host && (host.me ? pz.kim : host.called);
  if (kc && kc.t === t && !kc.bye && !seats[kc.s]) {
    const k = { id: KIM_ID, nick: AI_NAME, kim: true, rdy: Date.now() - kimLocal(host.id, kc.at) > KIM_READY_MS, seat: { t, s: kc.s, at: kc.at } };
    seats[kc.s] = k;
    owners.push(k);
  }
  const n0 = (seats[0] ? 1 : 0) + (seats[1] ? 1 : 0), n1 = (seats[2] ? 1 : 0) + (seats[3] ? 1 : 0);
  const mode = n0 === 1 && n1 === 1 ? '1v1' : n0 === 2 && n1 === 2 ? '2v2' : null;
  const live = lobbyRooms.filter((r) => r.pt === t);
  return {
    t, seats, owners, losers, n: owners.length, n0, n1, mode, humans,
    host, // 처음 선 사람 = 방장
    kim: seats.some((p) => p?.kim),
    ready: owners.length > 0 && owners.every((p) => p.rdy),
    nReady: owners.filter((p) => p.rdy).length,
    busy: live.find((r) => r.play) || null, // 경기 중 (방장이 로비 채널에 올림)
    soon: live.some((r) => !r.play),
  };
}
// 김제빵 시각(방장 PC 시계)을 이 PC 시계로: 처음 본 때보다 늦을 수는 없게 (시계가 앞선 PC가 보내도 바로 뛰어오게)
function kimLocal(id, at) {
  const key = id + ':' + at;
  if (!pz.kimSeen.has(key)) { if (pz.kimSeen.size > 50) pz.kimSeen.clear(); pz.kimSeen.set(key, Date.now()); }
  return Math.min(at, pz.kimSeen.get(key));
}
function onSeat(t, s) {
  if (room) return; // 경기 채널로 가는 중
  initAudio();
  playUI('click');
  if (IS_MOBILE) { hud.toast(MOBILE_MSG, 2600); return; }
  const st = tableState(t);
  if (st.busy) { hud.toast(`${t + 1}번 탁구대는 경기 중이에요 · 탁구대를 누르면 관전`, 2400); return; }
  const owner = st.seats[s];
  if (owner && !owner.me) { hud.toast(owner.kim ? '김제빵이 선 자리예요' : '그 자리에는 이미 누가 서 있어요', 1800); return; }
  if (!(pz.seat?.t === t && pz.seat.s === s)) {
    pz.seat = { t, s, at: Date.now() };
    pz.rdy = false;
    pz.after = null;
  }
  pz.lastAct = Date.now();
  walkTo(PLAZA.tables[t].seats[s], { keepSeat: true });
  sendInfo();
  view.put(myFig());
  renderTables(true);
}
// 탁구대를 누르면: 경기 중이면 관전, 아니면 빈자리로 (사람이 적은 쪽 → 가까운 칸)
function onTable(t) {
  const st = tableState(t);
  if (st.busy) {
    // 경기장 거품: 그 탁구대 원 안으로 걸어 들어가면 저절로 관전 (탁구대 쪽으로 4.5m 앞까지)
    const p = posAt(pz.myW, Date.now()), T = PLAZA.tables[t];
    const dx = p[0] - T.x, dz = p[1] - T.z, d = Math.hypot(dx, dz) || 1;
    if (d > BUBBLE_IN - 1) walkTo([T.x + (dx / d) * 4.5, T.z + (dz / d) * 4.5]);
    return;
  }
  if (pz.seat?.t === t) return;
  const p = posAt(pz.myW, Date.now());
  const free = [0, 1, 2, 3].filter((s) => !st.seats[s]);
  if (!free.length) { playUI('click'); hud.toast(`${t + 1}번 탁구대 자리가 다 찼어요`, 1800); return; }
  const cnt = [st.n0, st.n1];
  const seatXZ = PLAZA.tables[t].seats;
  free.sort((a, b) => cnt[sideOf(a)] - cnt[sideOf(b)] || Math.hypot(seatXZ[a][0] - p[0], seatXZ[a][1] - p[1]) - Math.hypot(seatXZ[b][0] - p[0], seatXZ[b][1] - p[1]));
  onSeat(t, free[0]);
}
// 자리에서 내려오기 (경기 채널로 가는 중이었으면 그것도 그만)
function unseat() {
  kimBye(0);
  if (!pz.seat) return;
  pz.seat = null;
  pz.rdy = false;
  pz.after = null;
  pz.readyAt = 0;
  if (room && !room.inGame) leaveRoom();
  pz.going = false;
  view.put(myFig());
  sendInfo();
  renderTables(true);
}
function toggleReady() {
  if (!pz.seat || room) return;
  initAudio();
  playUI('click');
  pz.rdy = !pz.rdy;
  pz.lastAct = Date.now();
  view.put(myFig());
  sendInfo();
  renderTables(true);
}
// 모두 준비 → 경기 채널로 (방장 코드). 선수 명단도 모든 PC가 같은 규칙으로 계산
function goPlay(st) {
  const players = st.seats.map((p, s) => p && { id: p.id, side: sideOf(s), slot: st.mode === '2v2' ? s % 2 : 0 }).filter(Boolean);
  const h2h = {};
  const opp = st.mode === '1v1' ? st.owners.find((p) => !p.me) : null;
  const v = opp ? h2hOf(opp.pid) : undefined;
  if (v) h2h[opp.pid] = v;
  if (!enterTable(st.host.code, !!st.host.me, st.mode, st.t, players, h2h)) return;
  pz.going = true;
  renderPanel(st);
}
// 경기 채널이 끝나면 (room.js endRoom): 자리 그대로 서서 '🔁 한 판 더' (경기 중 나가기면 내려옴)
roomHooks.onEnd = (r, why) => {
  pz.going = false;
  pz.readyAt = 0;
  pz.rdy = false;
  pz.code = makeCode(); // 다음 판은 새 채널 이름으로 (같은 이름에 곧바로 다시 들어가면 서버 명단에서 빠질 때가 있음)
  pz.lastAct = Date.now();
  if (why === 'quit' || why === 'error') unseat();
  if (why === 'end' || why === 'gone') pz.after = r.inGame || r.result ? r : null;
  kimBye(2000); // 경기가 끝나면 김제빵은 '앗, 빵 타겠다!' 하고 돌아감 (다시 하려면 다시 부름)
  view.put(myFig());
  sendInfo();
  renderTables(true);
};
roomHooks.onResult = (r) => { if (pz.after === r) renderTables(true); };

// ───── ⑤ 모집 알림·콕 집어 초대·김제빵 부르기 (plaza.md 4·5장) ─────
const CALL_GAP = 15000; // 같은 탁구대 '사람 구해요'는 15초에 한 번 (보내는 쪽 잠금 + 받는 쪽도 무시)
const INV_GAP = 15000; // 같은 사람에게 초대는 15초에 한 번
const KIM_WAIT = 10000; // '사람 구해요'를 보내고 이만큼 아무도 안 오면 '김제빵 부르기'
const need = (st) => (st.n <= 1 ? 1 : 4 - st.n); // 1명이면 1대1 상대 1명, 그 밖엔 2대2까지
const needText = (st) => (st.n <= 1 ? '1대1, 1명' : `2대2, ${4 - st.n}명`);
function sendCall() {
  const st = pz.seat && tableState(pz.seat.t);
  if (!st || st.busy || room || st.n >= 4) return;
  if (Date.now() - (pz.callT[st.t] || 0) < CALL_GAP) return;
  playUI('click');
  pz.callT[st.t] = Date.now();
  pz.link?.send({ k: 'call', id: myId, t: st.t });
  hud.toast(`📣 광장에 '${st.t + 1}번 탁구대 ${needText(st)} 구해요!'를 알렸어요`, 2200);
  renderTables(true);
}
let callTimer = 0;
function onCall(m) {
  const p = pz.people.get(m.id);
  if (!p || !Number.isInteger(m.t) || p.seat?.t !== m.t) return; // 그 탁구대에 선 사람이 보낸 것만
  if (Date.now() - (pz.callT[m.t] || 0) < CALL_GAP * 0.9) return; // 같은 탁구대는 15초에 한 번
  pz.callT[m.t] = Date.now();
  const st = tableState(m.t);
  if (IS_MOBILE || pz.seat?.t === m.t || st.busy || st.n >= 4) return;
  const el = $('pz-call');
  el.innerHTML = `🏓 <b>${m.t + 1}번 탁구대</b> ${needText(st)} 구해요! <button type="button" data-go="${m.t}">가기</button>`;
  el.classList.remove('hidden');
  playUI('turn');
  clearTimeout(callTimer);
  callTimer = setTimeout(() => el.classList.add('hidden'), 8000);
}
$('pz-call').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  $('pz-call').classList.add('hidden');
  onTable(+b.dataset.go);
});
// 다른 사람을 누르면: 이름 + '초대하기' (내가 빈자리 있는 탁구대에 서 있을 때)
function onPerson(id) {
  const p = pz.people.get(id);
  if (!p) return;
  playUI('click');
  pz.popFor = id;
  const st = pz.seat && tableState(pz.seat.t);
  const cool = Date.now() - (pz.invT.get(id) || 0) < INV_GAP;
  let why = '';
  if (!st) why = '탁구대에 먼저 서야 초대할 수 있어요';
  else if (st.busy || room) why = '경기를 시작하는 중이에요';
  else if (st.n >= 4) why = '탁구대 자리가 다 찼어요';
  else if (p.seat?.t === st.t) why = '이미 같은 탁구대에 있어요';
  else if (p.mob) why = '휴대폰은 사람 대결을 못 해요';
  else if (cool) why = '방금 초대했어요 (15초에 한 번)';
  $('pz-pop').innerHTML = `<b>${esc(p.nick)}</b>${p.title ? `<small>${esc(p.title)}</small>` : ''}`
    + `<button type="button" class="big" data-inv ${why ? 'disabled' : ''}>🏓 ${st ? `${st.t + 1}번 탁구대로 ` : ''}초대하기</button>${why ? `<p>${why}</p>` : ''}<button type="button" class="small" data-x>닫기</button>`;
  $('pz-pop').classList.remove('hidden');
}
function sendInvite() {
  const id = pz.popFor, st = pz.seat && tableState(pz.seat.t);
  $('pz-pop').classList.add('hidden');
  if (!id || !st || Date.now() - (pz.invT.get(id) || 0) < INV_GAP) return;
  pz.invT.set(id, Date.now());
  pz.link?.send({ k: 'inv', id: myId, to: id, t: st.t });
  hud.toast(`${pz.people.get(id)?.nick || '상대'}님에게 초대를 보냈어요`, 1800);
}
let invTimer = 0;
function onInvite(m) {
  if (m.to !== myId) return;
  const p = pz.people.get(m.id);
  if (!p || !Number.isInteger(m.t) || p.seat?.t !== m.t || IS_MOBILE) return;
  if (Date.now() - (pz.invGotT.get(m.id) || 0) < INV_GAP * 0.9) return; // 같은 사람 15초에 한 번
  pz.invGotT.set(m.id, Date.now());
  const el = $('pz-invite');
  el.innerHTML = `<p>📩 <b>${esc(p.nick)}</b>님이 <b>${m.t + 1}번 탁구대</b>로 초대했어요!</p><div><button type="button" class="big" data-ok="${m.t}">🏓 수락</button><button type="button" class="small" data-no>🙏 다음에</button></div>`;
  el.classList.remove('hidden');
  playUI('turn');
  clearTimeout(invTimer);
  invTimer = setTimeout(() => el.classList.add('hidden'), 12000);
}
$('pz-pop').addEventListener('click', (e) => {
  if (e.target.closest('[data-inv]')) sendInvite();
  else if (e.target.closest('[data-x]')) { playUI('click'); $('pz-pop').classList.add('hidden'); }
});
$('pz-invite').addEventListener('click', (e) => {
  const ok = e.target.closest('[data-ok]');
  if (ok) { $('pz-invite').classList.add('hidden'); onTable(+ok.dataset.ok); return; }
  if (e.target.closest('[data-no]')) { $('pz-invite').classList.add('hidden'); say('9'); } // 머리 위에 '🙏 다음에 해요'
});
// 김제빵 부르기: 방장만, 2대2 탁구대에 사람 3명(한쪽 2·한쪽 1)이고 '사람 구해요'를 보낸 뒤 10초 동안 아무도 안 왔을 때
function kimCan(st) {
  if (!st || !st.host?.me || st.kim || st.busy || room || st.humans !== 3) return null;
  if (!((st.n0 === 2 && st.n1 === 1) || (st.n0 === 1 && st.n1 === 2))) return null;
  const s = [0, 1, 2, 3].find((i) => !st.seats[i]);
  return s == null ? null : s;
}
function callKim() {
  const st = pz.seat && tableState(pz.seat.t), s = kimCan(st);
  if (s == null || Date.now() - (pz.callT[st.t] || 0) < KIM_WAIT) return;
  playUI('click');
  pz.kim = { t: st.t, s, at: Date.now(), bye: null };
  pz.lastAct = Date.now();
  sendInfo();
  renderTables(true);
}
// 김제빵 돌려보내기 (경기가 끝났거나, 사람이 3명이 아니게 됐거나, 방장이 내려옴)
// bread: 방장이 직접 내보낼 때 빵 번호 ('이번엔 ○○을 만들어 볼까나...')
function kimBye(delay = 0, bread = null) {
  if (!pz.kim || pz.kim.bye) return;
  pz.kim = { ...pz.kim, bye: Date.now() + delay, ...(bread != null ? { b: bread } : {}) };
  sendInfo();
  const k = pz.kim;
  setTimeout(() => { if (pz.kim === k) { pz.kim = null; sendInfo(); } }, delay + 9000); // 다 뛰어간 뒤 지움
}
function kimCheck() {
  const k = pz.kim;
  if (!k || k.bye || room) { pz.kimBad = 0; return; }
  const st = pz.seat?.t === k.t ? tableState(k.t) : null;
  if (st && st.host?.me && st.humans === 3) { pz.kimBad = 0; return; }
  if (!st) { kimBye(0); return; } // 방장이 내려옴
  pz.kimBad ||= Date.now();
  if (Date.now() - pz.kimBad > 2500) kimBye(0); // 사람이 3명이 아니게 된 지 2.5초 (명단이 잠깐 흔들린 건 무시)
}
// 화면의 뛰어오는 김제빵들 (모든 사람의 상태에서)
function syncKimRuns() {
  const list = [];
  const add = (id, k) => {
    if (!k) return;
    const T = PLAZA.tables[k.t];
    list.push({ key: `${id}:${k.at}`, seat: T.seats[k.s], face: faceOf({ t: k.t, s: k.s }), at: kimLocal(id, k.at), bye: k.bye ? kimLocal(id + 'b', k.bye) : null, b: k.b ?? null });
  };
  add(myId, pz.kim);
  for (const p of pz.people.values()) add(p.id, p.called);
  view.setKimRuns(list);
}

// 경기 채널 붙기·시작 확인 + 탁구대 모습·내 자리 판 (0.2초마다, 명단이 바뀌면 바로)
function renderTables(force = false) {
  const now = performance.now() / 1000;
  if (!force && now - pz.tableT < 0.2) return;
  pz.tableT = now;
  view.setKim(AI_LOOK, AI_NAME, pz.link ? pz.kimN : 0);
  kimCheck();
  syncKimRuns();
  for (let t = 0; t < NT; t++) {
    const st = tableState(t);
    const off = !!st.busy;
    const seats = st.seats.map((p) => (off ? 'off' : !p ? 'empty' : p.rdy ? 'ready' : 'taken'));
    let lines, color;
    if (st.busy) {
      const sc = bub.t === t && bub.phase !== 'off' ? bub.score : st.busy.score || [0, 0]; // 거품 안이면 실시간 점수
      lines = [`${t + 1}번 · ${st.busy.mode === '2v2' ? '2대2' : '1대1'} 경기 중 ${sc[0]} : ${sc[1]}`, '👀 불꽃 원 안으로 들어가면 관전'];
      color = '#ff5a5f';
    } else if (st.soon || (st.mode && st.ready)) { lines = [`${t + 1}번 탁구대`, '🏓 곧 시작해요!']; color = '#ffd23f'; }
    else if (!st.n) { lines = [`${t + 1}번 탁구대`, '빈 탁구대 · 자리를 눌러 서요']; color = '#7ad35a'; }
    else { lines = [`${t + 1}번 탁구대 · ${st.mode === '2v2' ? '2대2' : st.mode ? '1대1' : '모이는 중'}`, `${st.n}명 · 준비 ${st.nReady}/${st.n}`]; color = '#ffd23f'; }
    view.setTable(t, { seats, lines, color, busy: !!st.busy });
  }
  const st = pz.seat ? tableState(pz.seat.t) : null;
  if (st && !room && pz.link) {
    // 같은 칸을 늦게 누른 사람(나)은 스스로 내려온다
    if (st.losers.some((p) => p.me)) { unseat(); hud.toast('그 자리는 방금 다른 사람이 섰어요', 2000); return; }
    if (st.mode && st.ready && !st.busy && st.host?.code) {
      if (!pz.readyAt) pz.readyAt = now;
      else if (now - pz.readyAt >= READY_HOLD) { pz.readyAt = 0; goPlay(st); return; }
    } else pz.readyAt = 0;
  }
  renderPanel(st);
}

// 방금 받은 코인 (경기 결과 아래)
function coinsHTML(r) {
  if (!account.loggedIn) return '<small>로그인하면 경기마다 코인을 모을 수 있어요</small>';
  const c = r.coins;
  if (!c) return '<small>코인 정산 중…</small>';
  const line = (list) => list.map((i) => `${esc(i.label).replace(/^☕\s*/, ic('coffee') + ' ')}${i.coins ? ` +${i.coins}` : ''}`).join(' · ');
  const mis = c.items.filter((i) => i.mission);
  return `<b><i class="coin-dot"></i> +${c.total} 코인</b><small>${line(c.items.filter((i) => !i.mission))}</small>`
    + (mis.length ? `<span class="rc-mission">${ic('target')} 미션 달성! ${line(mis)}</span>` : '');
}
// 내 자리 판 (탁구대에 서 있을 때만): 누가 어디 섰는지 · 준비 · 한 판 더 · 내려오기
function renderPanel(st) {
  const el = $('pz-table');
  if (!st || !pz.seat) {
    if (pz.panelKey) { pz.panelKey = ''; el.classList.add('hidden'); el.innerHTML = ''; document.body.classList.remove('pz-seated'); }
    return;
  }
  const afkLeft = Math.ceil((AFK_MS - (Date.now() - pz.lastAct)) / 1000);
  const r = pz.after;
  let tip;
  if (pz.going || room) tip = '🏓 곧 시작해요! 경기장으로 가는 중…';
  else if (st.busy) tip = '이 탁구대에서 다른 경기가 끝나기를 기다리는 중…';
  else if (!st.mode) tip = st.n === 1 ? '맞은편에 1명이 서면 1대1, 4명이 서면 2대2' : st.n === 3 ? '1명 더 오면 2대2!' : st.n0 !== st.n1 ? '양쪽에 똑같이 나눠 서야 해요' : '사람을 기다리는 중…';
  else if (!st.ready) tip = `모두 준비를 누르면 바로 시작해요 (준비 ${st.nReady}/${st.n})`;
  else tip = '모두 준비 완료!';
  if (!room && afkLeft * 1000 <= AFK_WARN) tip = `⏰ ${Math.max(0, afkLeft)}초 뒤 자리 비움으로 내려가요 · 아무 곳이나 눌러 주세요`;
  const name = (p, s) => {
    if (!p) return `<span class="pzt-seat empty t${sideOf(s)}">빈자리</span>`;
    const crown = p === st.host ? ic('crown') : '';
    return `<span class="pzt-seat t${sideOf(s)}${p.me ? ' me' : ''}${p.rdy ? ' rdy' : ''}">${crown}${esc(p.nick)}${p.me ? '<small>나</small>' : ''}${p.rdy ? ' ✅' : ''}</span>`;
  };
  const side = (k) => `<div class="pzt-side"><em class="t${k}">${TEAM_NAME[k]}</em>${[k * 2, k * 2 + 1].map((s) => name(st.seats[s], s)).join('')}</div>`;
  const label = st.mode === '2v2' ? '2대2' : st.mode ? '1대1' : `${st.n}명`;
  const res = r ? `<div class="pzt-res"><p class="pzt-result">${esc(r.result || '경기가 끝났어요')}</p><p class="coins-got">${r.result ? coinsHTML(r) : ''}</p></div>` : '';
  const busyNow = pz.going || !!room;
  const btn = busyNow ? '<button class="big" data-pzt="ready" disabled>🏓 곧 시작해요…</button>'
    : pz.rdy ? '<button class="big on" data-pzt="ready">✅ 준비 완료 <small>누르면 취소</small></button>'
    : `<button class="big" data-pzt="ready">${r ? '🔁 한 판 더' : '✋ 준비'}</button>`;
  // ⑤ 사람 구하기 · 김제빵 부르기
  let extra = '';
  if (!busyNow && !st.busy && st.n < 4) {
    const left = Math.ceil((CALL_GAP - (Date.now() - (pz.callT[st.t] || 0))) / 1000);
    extra += left > 0 ? `<button class="small" data-pzt="call" disabled>📣 ${left}초 뒤 다시 알릴 수 있어요</button>` : `<button class="small" data-pzt="call">📣 ${needText(st)} 구해요 알리기</button>`;
    const ks = kimCan(st);
    if (ks != null) {
      const wait = Math.ceil((KIM_WAIT - (Date.now() - (pz.callT[st.t] || 0))) / 1000);
      extra += !pz.callT[st.t] ? '<small class="pzt-kimtip">📣 알리고 10초 동안 아무도 안 오면 김제빵을 부를 수 있어요</small>'
        : wait > 0 ? `<small class="pzt-kimtip">🤖 ${wait}초 뒤 김제빵을 부를 수 있어요</small>` : '<button class="small kim" data-pzt="kim">🤖 김제빵 불러서 2대2</button>';
    } else if (!st.host?.me && st.humans === 3 && !st.kim && !st.mode) extra += '<small class="pzt-kimtip">🤖 방장이 김제빵을 부를 수 있어요</small>';
  }
  if (st.kim && st.host?.me && !busyNow) extra += '<button class="small kim" data-pzt="kimout">🥖 김제빵 내보내기</button>'; // 방장만
  if (st.kim) extra += '<small class="pzt-kimtip">🤖 김제빵이 한 자리를 채웠어요 · 전적엔 안 남고 코인은 보통 2대2와 같아요</small>';
  const html = `<div class="pzt-head"><b>${ic('table')} ${st.t + 1}번 탁구대</b><span class="pzt-mode">${label}${st.host?.me ? ` · ${ic('crown')} 내가 방장 (내 배경으로 경기)` : ''}</span><button class="small" data-pzt="leave">내려오기</button></div>`
    + `<div class="pzt-seats">${side(0)}<i class="pzt-vs">VS</i>${side(1)}</div>${res}${btn}${extra ? `<div class="pzt-extra">${extra}</div>` : ''}<p class="pzt-tip">${tip}</p>`;
  if (html === pz.panelKey) return;
  pz.panelKey = html;
  el.innerHTML = html;
  el.classList.remove('hidden');
  document.body.classList.add('pz-seated'); // 무료 뽑기 선물 띠는 잠시 숨김 (자리 판과 겹침)
  // 1대1 상대 전적 미리 불러오기 (경기 전 연출 '이 판에 걸린 것')
  if (st.mode === '1v1') { const o = st.owners.find((p) => !p.me); if (o?.pid) h2hOf(o.pid); }
}
$('pz-table').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pzt]');
  if (!b || b.disabled) return;
  if (b.dataset.pzt === 'ready') toggleReady();
  else if (b.dataset.pzt === 'leave') { playUI('click'); unseat(); }
  else if (b.dataset.pzt === 'call') sendCall();
  else if (b.dataset.pzt === 'kim') callKim();
  else if (b.dataset.pzt === 'kimout') { playUI('click'); kimBye(0, (Math.random() * BREADS.length) | 0); renderTables(true); }
});
// 자리 비움: 탁구대에 서 있는 동안 누르기·키 입력이 있으면 '아직 있어요'
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { if (pz.seat) pz.lastAct = Date.now(); }, { passive: true });

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

$('pz-help').textContent = IS_MOBILE ? '탭: 걷기 · 끌기: 돌려 보기 · 두 손가락: 가까이/멀리' : '바닥 클릭: 걷기 · 탁구대 자리 클릭: 서기 · 오른쪽 버튼 끌기: 돌려 보기 · 휠: 가까이/멀리';

function renderCount() {
  $('pz-count').textContent = pz.full ? `👥 광장이 꽉 찼어요 (${PLAZA_MAX}명)` : `👥 광장 ${pz.link ? pz.people.size + pz.kimN + 1 : 1}명`;
}

// 지금 광장이 화면에 보이나 (로비 화면)
// 랭킹·꾸미기 창도 광장 위에 뜬다 (plaza.md 19장: 광장은 사라지지 않는다).
// 꾸미기에서 배경·탁구대·탁구공을 입어 보는 동안만 예전처럼 그 경기장을 보여 준다
const ARENA_CATS = ['bg', 'table', 'ball'];
const arenaPreview = () => curScreen === 'dress' && !!preview && ARENA_CATS.some((c) => (preview.look?.[c] || null) !== (myEquip()[c] || null));
export const plazaShown = () => !game && ['lobby', 'dress', 'rank', 'login', 'pin-change'].includes(curScreen) && !arenaPreview(); // 로그인 화면 배경도 광장 (19장 ⓐ')

// ───── 창을 여는 동안 카메라 (plaza.md 19장) ─────
// 랭킹: 시상대·트로피를 비춘다 (창은 오른쪽 → 시상대는 화면 왼쪽)
const RANK_SHOP = PLAZA.shops.find((s) => s.id === 'rank'), GACHA_SHOP = PLAZA.shops.find((s) => s.id === 'shop');
export const WIN_CAM = {
  rank: { pos: [RANK_SHOP.x + 1.0, 2.4, RANK_SHOP.front + 6.6], look: [RANK_SHOP.x + 2.6, 2.1, RANK_SHOP.front - 1] },
  // 뽑기 탭: 커다란 뽑기 기계 (유리 공이 보이게 조금 높이)
  gacha: { pos: [GACHA_SHOP.x + 1.2, 2.6, GACHA_SHOP.front + 6.4], look: [GACHA_SHOP.x + 2.7, 2.2, GACHA_SHOP.front - 1] },
  // 꾸미기: 내 캐릭터가 지금 카메라 쪽으로 돌아서고, 카메라는 비스듬히 앞에서 (얼굴을 고르면 정면 가까이 — 사용자 확정)
  // 로그인 화면: 광장 남쪽 높은 곳에서 가게·탁구대를 내려다보며 천천히 좌우로 (창은 왼쪽 → 광장은 화면 오른쪽).
  // 로그인하면 여기서 내 캐릭터 등 뒤로 날아 내려간다
  login: { r: 17, y: 7.5, cz: -1, sway: 0.32, speed: 0.07, base: 0.18, shift: 3.2 },
  dress: { r: 2.7, y: 1.45, lookY: 0.85, side: 0.75, angle: 0.6 },
  face: { r: 1.85, y: 1.32, lookY: 0.98, side: 0.5, angle: 0 },
};
const win = { scr: '', u: [0, 1], yaw0: null, look: '' };
function windowFrame(p) {
  view.setInput(curScreen === 'lobby');
  const scr = curScreen === 'dress' || curScreen === 'rank' ? curScreen : '';
  if (scr !== win.scr) {
    if (scr === 'dress') {
      // 지금 카메라가 있는 쪽을 본다 (카메라가 크게 돌지 않고 그 자리에서 다가가게)
      const c = view.cam.pos, ux = c.x - p[0], uz = c.z - p[1], L = Math.hypot(ux, uz) || 1;
      win.u = [ux / L, uz / L];
      if (win.scr !== 'dress') win.yaw0 = pz.seat ? null : view.figs.get(myId)?.yaw ?? null;
      pz.face = Math.atan2(-win.u[0], -win.u[1]);
    } else if (win.scr === 'dress' && !pz.seat) pz.face = win.yaw0; // 창을 닫으면 원래 보던 쪽으로
    win.scr = scr;
    view.put(myFig());
  }
  const login = curScreen === 'login';
  view.setMeHidden(login);
  if (login) {
    const L = WIN_CAM.login, a = L.base + Math.sin(performance.now() / 1000 * L.speed) * L.sway;
    const sx = Math.sin(a), cz = Math.cos(a);
    // 보는 점을 카메라 왼쪽으로 옮기면 광장이 화면 오른쪽에 보인다 (카메라 오른쪽 = (-cz, sx)... 휴대폰은 가운데)
    const sh = innerWidth < 760 ? 0 : L.shift;
    const lx = -cz * sh, lz = L.cz + sx * sh;
    view.setFocus({ pos: [lx + sx * L.r, L.y, lz + cz * L.r], look: [lx, 1.2, lz] }, win.fresh);
  } else if (scr === 'dress' && dressTabNow() === 'gacha') view.setFocus(WIN_CAM.gacha);
  else if (scr === 'dress') {
    const lk = JSON.stringify(myLook());
    if (lk !== win.look) { win.look = lk; view.put(myFig()); }
    const C = preview?.front ? WIN_CAM.face : WIN_CAM.dress;
    const ca = Math.cos(C.angle), sa = Math.sin(C.angle);
    const ux = win.u[0] * ca - win.u[1] * sa, uz = win.u[0] * sa + win.u[1] * ca; // 캐릭터에서 카메라 쪽
    const side = innerWidth < 760 ? 0.1 : C.side; // 창을 피해 캐릭터를 화면 왼쪽으로: 보는 점을 카메라 오른쪽(uz, -ux)으로
    const lx = p[0] + uz * side, lz = p[1] - ux * side;
    view.setFocus({ pos: [lx + ux * C.r, C.y, lz + uz * C.r], look: [lx, C.lookY, lz] });
  } else if (scr === 'rank') view.setFocus(WIN_CAM.rank);
  else { view.setFocus(null); win.look = ''; }
  win.fresh = false;
}

// 매 프레임 (main.js): 광장 채널 붙기/빠지기 + 광장이 보이면 그리기. 광장을 그렸으면 true
export function plazaFrame(now) {
  // 광장 채널: 광장·상점·꾸미기·랭킹 화면에 있을 때만 (탁구대에서 경기 채널로 가는 중에도 — 시작할 때까지).
  // 경기(혼자 하기 포함)·관전·로그인 화면에서는 빠진다 → 경기 중 선수는 광장 메시지를 하나도 안 주고받는다
  // 김제빵 탁구대 혼자 하기(네트워크 안 씀)는 광장에 남아 '도전 중'만 알린다 (그동안 광장은 그리지 않음)
  const want = !pz.full && !room?.inGame && (inAI() ? curScreen === 'hud' : !game && ['lobby', 'dress', 'rank'].includes(curScreen));
  if (want && !pz.link) connect();
  else if (!want && pz.link) disconnect();
  if (curScreen === 'login' && pz.seat) unseat(); // 로그아웃
  // 꾸미기·칭호·닉네임이 바뀌었으면 명단 정보 고치기 (1초마다 확인)
  if (pz.link && now - pz.infoCheckT > 1) {
    pz.infoCheckT = now;
    const k = infoKey();
    if (k !== pz.infoKey) { pz.infoKey = k; view.put(myFig()); pz.link.track(myInfo()); sendInfo(); } // 이름·꾸미기는 명단(4초에 한 번까지), 연승은 상태
  }
  // 가끔 내 상태를 다시 (메시지를 놓친 사람이 있어도 15초 안에 맞춰짐)
  if (pz.link && performance.now() - pz.beatT > 15000) {
    pz.beatT = performance.now();
    sendInfo();
  }
  // 자리 비움 (1분)
  if (pz.seat && !room && Date.now() - pz.lastAct > AFK_MS) { unseat(); hud.toast('1분 동안 아무것도 안 해서 탁구대에서 내려왔어요', 2800); }
  // 꾸미기에서 배경·탁구대·탁구공을 입어 보러 들어가고 나올 때: 툭 바뀌지 않게 살짝 밝아지며
  const apv = arenaPreview();
  if (apv !== pz.apv) { pz.apv = apv; world.renderer.domElement.animate?.([{ opacity: 0.15 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }); }
  const shown = plazaShown();
  world.setPlaza(shown && !bubbleArena()); // 경기장 거품 안(또는 물결 중)이면 경기장 배경 (plazaBubble.js가 둘을 섞음)
  if (shown !== pz.shown) {
    pz.shown = shown;
    view.setVisible(shown);
    win.fresh = shown; // 광장이 막 보이기 시작함 → 카메라를 날리지 않고 바로 그 자리에
    if (shown) {
      view.put(myFig());
      world.setBall([0, -9, 0], false);
      world.ring.visible = false;
      world.aim.visible = false;
      renderCount();
      renderTables(true);
    } else {
      closePhrases(); // 로비 캐릭터는 로비·경기 화면이 다시 켠다
    }
  }
  if (!shown) { bubbleStop(); if (!arenaPreview()) view.setInput(true); return false; }
  if (!bubbleArena()) for (const side of world.team) for (const c of side) c.group.visible = false; // 랠리하는 로비 캐릭터는 숨김
  // 걷는 중: 한 구간이 끝나면 다음 구간, 다 왔으면 도착해서 할 일 (가게 열기·혼자 하기)
  const nowMs = Date.now();
  const p = posAt(pz.myW, nowMs);
  if (Math.hypot(p[0] - pz.myW.to[0], p[1] - pz.myW.to[1]) < 0.02) {
    if (pz.route.length) stepWalk(p, pz.route.shift(), nowMs);
    else if (pz.pending) { const f = pz.pending; pz.pending = null; f(); }
  }
  renderTables();
  windowFrame(p);
  view.update(now, myId);
  sky ||= createPlazaSky(world);
  sky.update(now);
  if (now - skyLabelT > 1) { skyLabelT = now; $('pz-wx').textContent = sky.label(); }
  // 경기장 거품 (plaza.md 16장): 경기 중인 탁구대 원(7m) 안으로 들어가면 그 경기장으로, 9m 밖이면 광장으로
  const busy = PLAZA.tables.map((_, t) => lobbyRooms.find((r) => r.pt === t && r.play && r.pl) || null);
  const dt = Math.min(0.1, now - (pz.lastNow || now));
  pz.lastNow = now;
  bubbleFrame(view, now, dt, p, busy, !!pz.link && !room && !pz.seat, rememberPlazaEnv());
  return true;
}

// 점검·디버그용
export const plazaDebug = {
  pz, view, get sky() { return sky; }, walkTo, say, PHRASES, fakeList: (list) => onList(pz.link, list), fakeState: (m) => onState(m), get kimN() { return pz.kimN; },
  bubble: bub, seat: setSeated, call: sendCall, callKim, person: onPerson, invite: sendInvite, sit: onSeat, table: onTable, kim: onKim, ready: toggleReady, unseat, state: tableState, afk: () => { pz.lastAct -= AFK_MS + 1000; },
};
