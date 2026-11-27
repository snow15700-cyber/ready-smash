// 광장에서 낚시하기 (docs/dev/fishing.md 12장, 사용자 확정 11/25)
//  · 전망대 밑 나무 판(선착장)에 들어서면 '🎣 낚시하기' 버튼 → 누른 그 자리에서 시작 (정해진 칸 없음)
//  · 낚시 중: 화면은 낚시 시안과 같음(src/games/fishing/session.js), 다른 사람은 반투명으로 보이고 채팅은 화면 왼쪽에 (나는 보기만)
//  · 다른 사람에게는 걷기처럼 내 상태(fi: 낚시 중·찌 자리)와 '잡았다' 한 번만 (광장 채널). 경기 중인 선수 PC에는 안 감(광장 채널 밖)
//  · 희귀·전설·전설 탁구채를 낚으면 광장 모두에게 알림
import * as THREE from 'three';
import { account, fishBagLoad, fishDex, myEquip, srvNow, syncServerClock } from '../account.js';
import { PLAZA } from '../arena-plaza.js';
import { applyLook } from '../items.js';
import { activeBubbles, CATCH, LEGEND_PADDLES } from '../games/fishing/rules.js';
import { makeBobber, makeBubbleFx, makeLine, makeRod, makeSplashes, seaHeight } from '../games/fishing/world.js';
import { PIER, STAIRS, stairAt } from '../campusLayout.js';
import { catHooks, fishHooks, plazaApi } from './plaza.js';
import { easeInOut, orbitBlend } from '../plaza.js';
import { hud as toastHud } from './hud.js';
import { curScreen } from './screen.js';
import { renderMe } from './login.js';
import { $, IS_MOBILE, esc, world } from './state.js';

const OTHERS_OP = 0.35; // 낚시하는 동안 다른 사람 반투명 (사용자 확정)
const CHAT_KEEP = 6, CHAT_LIFE = 14; // 화면 옆 채팅: 최근 6줄, 14초
const BLEND_IN = 1.5, BLEND_OUT = 1.2; // 광장 카메라 ↔ 낚시 카메라 넘어가는 시간(초) — 랭킹·꾸미기 창처럼 카메라가 따라감
const camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, yaw: Math.PI, t: 1 };
const camTo = new THREE.Vector3();
let F = null, mod = null, dexMod = null, loading = false, on = false, lastT = 0, hiddenAt = 0;
const me = { b: null }; // 다른 사람에게 보낼 내 찌 자리
const chat = [];

// ── 화면: 버튼 · 낚시 화면(2D 캔버스) · 그만하기 · 도감 · 화면 옆 채팅
const root = Object.assign(document.createElement('div'), { id: 'fish-ui', className: 'fish-ui' });
root.innerHTML = `
  <button id="fish-start" class="fish-start hidden" type="button">🎣 낚시하기</button>
  <canvas id="fish-hud" class="fish-hud hidden"></canvas>
  <div id="fish-bar" class="fish-bar hidden">
    <button id="fish-shop" class="hidden" type="button">🍣 횟집</button>
    <button id="fish-cats" class="hidden" type="button">🐱</button>
    <button id="fish-sync" type="button" title="박자 맞추기">🎵</button>
    <button id="fish-dex" type="button">📖 도감</button>
    <button id="fish-stop" type="button">그만하기</button>
  </div>
  <div id="fish-chat" class="fish-chat hidden"></div>`;
($('lobby') || document.body).appendChild(root);
const hudCv = $('fish-hud'), hg = hudCv.getContext('2d');
const css = document.createElement('style');
css.textContent = `
#fish-ui.fish-ui { position: fixed; inset: 0; pointer-events: none !important; z-index: 6; background: none; padding: 0; margin: 0; } /* 덮개는 클릭을 그대로 아래(광장)로 */
#fish-ui .fish-hud, #fish-ui .fish-chat, #fish-ui .fish-chat div { pointer-events: none !important; }
.fish-ui button { pointer-events: auto; font-family: var(--font-ui, 'Pretendard Variable', system-ui, sans-serif); cursor: pointer; border: 0; }
.fish-start { position: absolute; left: 50%; bottom: 122px; transform: translateX(-50%); height: 54px; padding: 0 28px; border-radius: 999px; font-weight: 800; font-size: 19px; color: #fff; background: linear-gradient(180deg, #2ea3e6, #1b6fb8); box-shadow: 0 8px 22px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.3); animation: fishPop .9s ease-in-out infinite alternate; }
@keyframes fishPop { from { transform: translateX(-50%) scale(1); } to { transform: translateX(-50%) scale(1.05); } }
@keyframes fishFade { from { opacity: 0; } to { opacity: 1; } }
.fish-hud, .fish-bar, .fish-chat { animation: fishFade .8s ease .7s both; } /* 카메라가 내려앉는 동안 낚시 글자가 천천히 나타남 */
.fish-hud { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; } /* 100vh는 휴대폰 주소창까지 넣은 높이라 아래가 잘림 → 보이는 화면에 맞춤 */
.fish-bar { position: absolute; right: 16px; top: 14px; display: flex; gap: 8px; }
.fish-bar button { height: 40px; padding: 0 16px; border-radius: 999px; font-weight: 700; font-size: 15px; color: #fff; background: rgba(15,25,50,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); backdrop-filter: blur(8px); }
.fish-bar #fish-stop { background: rgba(224,51,60,.85); }
.fish-chat { position: absolute; left: 16px; top: 70px; width: min(280px, 46vw); display: flex; flex-direction: column; gap: 6px; }
.fish-chat div { padding: 7px 12px; border-radius: 14px; font: 600 14px var(--font-ui, system-ui); color: #fff; background: rgba(15,25,50,.5); backdrop-filter: blur(6px); transition: opacity .6s; }
.fish-chat b { color: #ffd36b; margin-right: 6px; }
.fish-ui .hidden { display: none !important; }
body.fish-fade #lobby > *:not(#fish-ui), body.fish-fade #lb-free, body.fish-fade .lb-bottom, body.fish-fade .lb-icons { transition: opacity .5s ease, visibility 0s; }
body.fishing-on #lobby > *:not(#fish-ui), body.fishing-on #lb-free, body.fishing-on .lb-bottom, body.fishing-on .lb-icons { visibility: hidden; opacity: 0; transition: opacity .5s ease, visibility 0s linear .5s; }
@media (max-width: 560px) { .fish-start { bottom: 170px; } .fish-chat { top: 64px; width: 52vw; } .fish-chat div { font-size: 12px; } .fish-bar button { height: 36px; padding: 0 12px; font-size: 13px; } }
`;
document.head.appendChild(css);

$('fish-start').addEventListener('click', (e) => { e.stopPropagation(); start(); });
$('fish-stop').addEventListener('click', (e) => { e.stopPropagation(); stop(); });
$('fish-dex').addEventListener('click', (e) => { e.stopPropagation(); if (F && !F.busy()) mod.openDex(); });
$('fish-sync').addEventListener('click', (e) => { e.stopPropagation(); if (F && !F.busy()) mod.openSyncCal(); }); // 🎵 박자 맞추기 (fishing.md 18장) — 던지기 전·잡은 뒤에 언제든
// 🍣 횟집 (fishing.md 14-6, 1a: 낚시 화면 버튼 — 선착장 건물은 1b). 35 전 서버·손님이면 가방을 몰라서 숨김
let shopMod = null;
$('fish-shop').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (F?.busy()) { toastHud.toast('물고기를 다 낚은 뒤에 가요', 1800); return; }
  openShopWin();
});
async function openShopWin() {
  try { shopMod ||= await import('../games/fishing/shop.js'); } catch { toastHud.toast('횟집을 불러오지 못했어요. 다시 눌러 주세요', 2200); return; }
  shopMod.openShop({ onSold: () => { renderMe(); bagBtn(); } });
}
// 선착장 🍣 횟집 건물·📈 칠판을 누르면 (14장 1b, ui/plaza.js onSpot → 문 앞까지 걸어간 뒤) 낚시 안 해도 횟집 창
fishHooks.openMarket = async () => {
  if (on && F?.busy()) return;
  if (!account.loggedIn) { toastHud.toast('🍣 로그인하면 잡은 물고기를 가방에 모아 여기서 팔 수 있어요', 2600); return; }
  openShopWin();
};
function bagBtn() {
  const b = account.fishBag, el = $('fish-shop');
  el.classList.toggle('hidden', !account.loggedIn || !Array.isArray(b));
  $('fish-cats').classList.toggle('hidden', !account.loggedIn || !Array.isArray(b)); // 🐱 내 고양이 (cats.md 3c, 35 전 서버면 숨김)
  if (Array.isArray(b)) el.textContent = `🍣 횟집 · 🎒 ${b.reduce((a, x) => a + x.n, 0)}/30`;
}
$('fish-cats').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (F?.busy()) { toastHud.toast('물고기를 다 낚은 뒤에 봐요', 1800); return; }
  (await import('../games/cats/myCats.js')).openMyCats();
});
for (const id of ['fish-start', 'fish-stop', 'fish-sync', 'fish-dex', 'fish-shop', 'fish-cats']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

// ── 시작 · 그만
async function start() {
  if (on || loading) return;
  loading = true;
  try {
    mod ||= await import('../games/fishing/session.js');
    dexMod ||= await import('../games/fishing/dex.js');
  } catch (e) { loading = false; toastHud.toast('낚시를 불러오지 못했어요. 다시 눌러 주세요', 2400); return; }
  loading = false;
  if (!F) {
    mod.TUNE.fish = 'random'; mod.TUNE.bubbles = 'normal'; mod.TUNE.size = 'random'; mod.TUNE.cond = 'auto'; // 광장은 기획대로 (시험 설정 없음)
    F = mod.createFishing({
      scene: world.scene, camera: world.camera,
      isOnline: () => account.loggedIn, clock: srvNow, rainNow: plazaApi.raining, onEvent,
    });
  }
  const f = plazaApi.view.figs.get(plazaApi.myId());
  const p = f?.disp || [...PLAZA.stairs.at(-1).bottom];
  F.standAt(p[0], p[1]);
  applyLook(F.me, myEquip());
  F.me.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  hidePaddle(F.me);
  F.setActive(true);
  on = true; me.b = null; lastT = 0;
  document.body.classList.add('fishing-on');
  for (const id of ['fish-hud', 'fish-bar', 'fish-chat']) $(id).classList.remove('hidden');
  $('fish-start').classList.add('hidden');
  // 지금 광장 카메라 자리에서 출발해 낚시 카메라(어깨 높이)로 날아감
  camFrom.pos.copy(world.camera.position); camFrom.look.copy(plazaApi.view.camLook()); camFrom.fov = world.camera.fov; camFrom.t = 0;
  camFrom.yaw = f?.yaw ?? Math.PI; // 낚시 캐릭터는 광장 캐릭터가 보던 쪽에서 바다 쪽으로 천천히 돎
  F.me.group.rotation.y = camFrom.yaw;
  document.body.classList.add('fish-fade');
  plazaApi.view.setCamOff(true);
  if (account.loggedIn) { syncServerClock(); fishDex().then((d) => { if (d) dexMod.setServerDex(d); }); fishBagLoad().then(bagBtn); }
  bagBtn();
  plazaApi.sendInfo();
  resize();
}
function stop() {
  if (!on) return;
  on = false; me.b = null;
  shopMod?.closeShop();
  F.setActive(false);
  document.body.classList.remove('fishing-on');
  for (const id of ['fish-hud', 'fish-bar', 'fish-chat']) $(id).classList.add('hidden');
  hg.clearRect(0, 0, hudCv.width, hudCv.height);
  // 낚시 카메라 자리에서 낚시 전 광장 카메라 자리로 부드럽게 돌아옴 (광장 카메라는 그대로 두었음 — 바다 쪽으로 돌리면 데크 난간 뒤에 숨음)
  const mf = plazaApi.view.figs.get(plazaApi.myId());
  if (mf) mf.yaw = Math.PI; // 광장 캐릭터도 낚시 캐릭터처럼 바다를 보고 서 있게 (툭 돌지 않게)
  F.me.group.rotation.y = Math.PI;
  plazaApi.view.blendFrom(world.camera.position, F.S.camLook, world.camera.fov, camFrom.t < 1 ? BLEND_OUT * Math.max(0.4, camFrom.t) : BLEND_OUT);
  camFrom.t = 1;
  clearTimeout(fadeT); fadeT = setTimeout(() => document.body.classList.remove('fish-fade'), 900);
  plazaApi.view.setCamOff(false);
  for (const f of plazaApi.view.figs.values()) if (!f.me && f.fishOp) { f.c.setOpacity(1, 1); f.fishOp = false; }
  plazaApi.sendInfo();
  renderMe();
}
let fadeT = 0, preload = null, lastFrameT = 0;
function hidePaddle(c) {
  if (c.handle) c.handle.visible = false;
  if (c.blade) c.blade.visible = false;
  if (c.paddleModel) c.paddleModel.visible = false;
}

// 낚시 한 판의 일 → 광장 사람들에게
function onEvent(ev) {
  catHooks.fishEvent?.(ev);
  if (ev.k === 'cast') { me.b = ev.to.map((v) => Math.round(v * 100) / 100); plazaApi.sendInfo(); }
  else if (ev.k === 'catch') {
    me.b = null; plazaApi.sendInfo();
    const c = ev.c;
    plazaApi.send({ k: 'fish', a: 'catch', item: c.id, cm: c.kind === 'fish' ? ev.cm : 0 });
    setTimeout(() => renderMe(), 2500); // 서버가 준 코인을 오른쪽 위 카드에
  } else if (ev.k === 'bag') { bagBtn(); renderMe();
  } else if (ev.k === 'miss' || ev.k === 'ready') { if (me.b) { me.b = null; plazaApi.sendInfo(); } }
}

// ── 입력 (낚시 중에만): 꾹 누르기(기 모으기)·좌우로 밀기는 광장 화면 위 어디서나
const cv = world.renderer.domElement;
cv.addEventListener('pointerdown', (e) => { if (!on || shopMod?.shopOpen()) return; e.preventDefault(); if (camFrom.t < 0.7) return; F.press({ x: e.clientX, y: e.clientY }); });
addEventListener('pointermove', (e) => { if (on) F.moveDrag(e.clientX, e.clientY); });
addEventListener('pointerup', (e) => { if (on) F.release(e.clientX, e.clientY); });
addEventListener('pointercancel', () => { if (on) { F.cancel(); } });
addEventListener('blur', () => { if (on) { F.cancel(); } });
addEventListener('keydown', (e) => {
  if (!on && e.code === 'Escape' && shopMod?.shopOpen()) { shopMod.closeShop(); return; } // 광장에서 연 횟집 창
  if (!on || e.target?.tagName === 'INPUT') return;
  if (shopMod?.shopOpen()) { if (e.code === 'Escape') shopMod.closeShop(); return; } // 횟집 창이 떠 있으면 낚시 키 안 먹음
  if (e.code === 'Escape') { if (!mod.dexOpen()) stop(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') { if (!F.S.charge?.key) return; } // 광장에서는 선 자리 그대로 (스페이스로 기 모으는 동안만 ←→ = 방향)
  if (camFrom.t < 0.7) return; // 카메라가 날아가는 동안은 던지지 않음
  F.keyDown(e);
});
addEventListener('keyup', (e) => { if (on) F.keyUp(e); });
document.addEventListener('visibilitychange', () => {
  if (!on) return;
  if (document.hidden) hiddenAt = performance.now() / 1000;
  else if (hiddenAt) { F.resumeAfter(performance.now() / 1000 - hiddenAt); hiddenAt = 0; lastT = 0; }
});
function resize() {
  const d = Math.min(2, devicePixelRatio);
  hudCv.width = innerWidth * d; hudCv.height = innerHeight * d; hg.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', () => { if (on) resize(); });

// ── 화면 옆 채팅 (낚시 중에만 보임 — 받은 말은 늘 모아 둠)
function addChat(nick, text) {
  chat.push({ nick, text, t: performance.now() / 1000 });
  while (chat.length > CHAT_KEEP) chat.shift();
  if (on) renderChat();
}
let chatDrawn = 0; // 마지막으로 그린 때 — 매 프레임 말고 0.5초에 한 번만 다시 그림(서서히 사라지는 건 CSS transition)
function renderChat() {
  const now = performance.now() / 1000;
  while (chat.length && now - chat[0].t >= CHAT_LIFE) chat.shift(); // 다 사라진 줄은 지움 → 다 사라지면 더는 안 그림
  chatDrawn = now;
  $('fish-chat').innerHTML = chat
    .map((c) => `<div style="opacity:${Math.min(1, (CHAT_LIFE - (now - c.t)) / 2).toFixed(2)}"><b>${esc(c.nick)}</b>${esc(c.text)}</div>`).join('');
}

// ── 다른 사람 낚시 모습 (fishing.md 12장 ③): 낚싯대를 들고 바다를 봄 · 던진 곳에 찌(물결 따라) · 줄 · 잡으면 말풍선·물보라
// + 낚싯대 들고 다니기 (11/26 사용자): 광장에서 계단에 들어서면(선착장 쪽) 탁구채 대신 낚싯대, 광장으로 올라가면 다시 탁구채.
//   나·다른 사람 모두, 각 PC가 캐릭터 위치로 계산 (메시지 없음 · 보기만 다름)
const others = new Map(); // id → { rod, bob, line, b, at }
const tipW = new THREE.Vector3(), toV = new THREE.Vector3();
const rodZone = (x, z) => !!stairAt(x, z) || PLAZA.onPier(x, z);
const CARRY_PITCH = -0.32; // 들고 걸을 때: 거의 세워서 조금 앞으로
function otherOf(id, f) {
  let o = others.get(id);
  if (o && o.fig !== f) { dropOther(id); o = null; }
  if (!o) {
    const rod = makeRod();
    rod.root.position.set(0.24, 0.92, -0.12);
    f.c.group.add(rod.root);
    const bob = makeBobber(); bob.visible = false; plazaApi.view.root.add(bob);
    const line = makeLine(); line.line.visible = false; plazaApi.view.root.add(line.line);
    o = { fig: f, rod, bob, line, b: null, at: 0, pitch: CARRY_PITCH };
    others.set(id, o);
  }
  return o;
}
function showPaddle(c) {
  const model = c.paddleModel;
  if (model) model.visible = true;
  if (c.handle) c.handle.visible = !model;
  if (c.blade) c.blade.visible = !model;
}
function dropOther(id) {
  const o = others.get(id); if (!o) return;
  o.fig.c.group.remove(o.rod.root);
  plazaApi.view.root.remove(o.bob, o.line.line);
  showPaddle(o.fig.c);
  others.delete(id);
}
function othersFrame(now, dt) {
  const people = plazaApi.people(), figs = plazaApi.view.figs;
  const wants = (f) => f && f.c.group.visible && f.disp && rodZone(f.disp[0], f.disp[1]);
  for (const id of [...others.keys()]) if (!wants(figs.get(id))) dropOther(id);
  for (const [id, f] of figs) {
    if (!wants(f)) continue;
    const o = otherOf(id, f);
    hidePaddle(f.c);
    const fi = f.me ? null : people.get(id)?.fi;
    const b = fi?.b ?? null;
    if (String(b) !== String(o.b)) { o.b = b; o.at = now; }
    const landed = b && now - o.at > 0.7; // 던지고 날아가는 동안은 찌를 안 보임
    const want = fi ? (b ? -1.05 : -0.95) : CARRY_PITCH; // 낚시 중이면 바다 쪽으로 눕힘, 아니면 들고 다님
    o.pitch += (want - o.pitch) * Math.min(1, dt * 6);
    o.rod.pose(o.pitch, b ? 0.12 : 0.05, 0, 0);
    o.bob.visible = !!landed;
    o.line.line.visible = !!landed;
    if (landed) {
      o.bob.position.set(b[0], seaHeight(b[0], b[1], now), b[1]);
      o.bob.rotation.set(Math.sin(now * 1.3 + b[0]) * 0.08, 0, Math.cos(now * 1.1) * 0.08);
      o.bob.userData.glow.material.opacity = 0.6 + 0.4 * Math.sin(now * 5);
      f.c.group.updateMatrixWorld(true);
      o.rod.tip.getWorldPosition(tipW);
      toV.copy(o.bob.position); toV.y += 0.8;
      o.line.set(tipW, toV, Math.min(1.4, tipW.distanceTo(toV) * 0.12), 0, now);
    }
  }
}
// '잡았다' 메시지: 그 사람 머리 위 말풍선 · 희귀·전설·전설 탁구채면 광장 모두에게 알림
function catchName(m) {
  const c = CATCH[m.item], pad = LEGEND_PADDLES.find(([x]) => x === m.item);
  if (!c && !pad) return null;
  const cm = Number.isFinite(m.cm) && m.cm > 0 && m.cm < 1000 ? Math.round(m.cm * 10) / 10 : 0;
  if (pad) return { txt: `🏓 전설 탁구채 「${pad[1]}」`, big: true };
  return { txt: `${c.emoji || '🐟'} ${c.name}${cm ? ` ${cm}cm` : ''}`, big: c.kind === 'fish' && c.grade !== 'common', name: `${c.name}${cm ? `(${cm}cm)` : ''}`, legend: c.grade === 'legend' };
}
const lastCatch = new Map();
fishHooks.onMsg = (m, p) => {
  if (m.a !== 'catch') return;
  const now = performance.now() / 1000;
  if (now - (lastCatch.get(m.id) ?? -9) < 3) return; // 너무 자주 오면 무시 (한 마리 잡는 데 몇 초 걸림)
  lastCatch.set(m.id, now);
  const n = catchName(m); if (!n) return;
  plazaApi.view.say(m.id, `🎣 ${n.txt}!`);
  if (n.big) toastHud.toast(`🎣 ${p.nick}님이 ${n.name || n.txt}을(를) 낚았어요!${n.legend ? ' 🌟' : ''}`, 3200);
};
fishHooks.onSay = (p, text) => { if (p) addChat(p.nick, text); };

// ── 광장(ui/plaza.js)이 부르는 것
fishHooks.on = () => on;
fishHooks.spot = () => (on && F ? { x: F.S.standX, z: F.S.standZ, mode: F.S.mode } : null); // 고양이가 옆에 앉을 자리
fishHooks.state = () => (on ? { b: me.b } : null);
// 🪧 낚시 게시판 (전망대·서쪽 계단 옆): 종이를 누르면 낚시 방법 · 팁 · 고양이 창 (ui/plaza.js onSpot → 앞까지 걸어간 뒤)
fishHooks.openBoard = async (n) => { if (on) return; (await import('../games/fishing/board.js')).openFishBoard(n); };
fishHooks.hidden = () => { if (on) stop(); shopMod?.closeShop(); $('fish-start').classList.add('hidden'); pierBubbles(0, null); };

// ── 낚시 안 할 때도 낚시터(계단에 들어선 순간부터 판 위)에서는 기포가 보임 (11/25 사용자: 그래야 자리를 옮겨 다님)
//  낚시 중에는 낚시 화면(session.js)이 같은 기포를 그림. 시각 = 서버 시각(모든 사람이 같은 곳·같은 때)
const inPierZone = (p) => p[1] > STAIRS[0].z0 - 0.3 && p[0] > PIER.x0 - 0.5 && p[0] < PIER.x1 + 0.5;
let pb = null, pbSync = false;
const pbSeen = new Set();
function pierBubbles(now, p) {
  const zone = !!p && !on && curScreen === 'lobby' && inPierZone(p);
  if (!pb) { if (!zone) return; const fx = makeSplashes(world.scene); pb = { fx, bfx: makeBubbleFx(world.scene, fx), last: now, was: false }; }
  if (!zone) { // 낚시터를 떠나면(낚시 시작·광장 화면을 떠남 포함) 기포·방울을 한 번에 치움
    if (pb.was) { pb.bfx.update([], now, 10, seaHeight); pb.fx.update(10); pb.was = false; }
    return;
  }
  if (!pbSync) { pbSync = true; syncServerClock().catch(() => {}); }
  const dt = Math.min(0.05, Math.max(0, now - pb.last));
  pb.last = now; pb.was = true;
  const list = activeBubbles(srvNow() / 1000);
  pb.bfx.update(list, now, dt, seaHeight);
  pb.fx.update(dt);
  for (const b of list) if (!pbSeen.has(b.id)) { pbSeen.add(b.id); toastHud.toast(`🫧 기포가 올라왔어요! ${Math.ceil(b.left)}초 동안 — 기포 위로 던지면 잘 잡혀요`, 2600); }
}
fishHooks.frame = (now, p, walking) => {
  // 버튼: 낚시 판 위에 서 있으면 (걷는 중·탁구대 자리·창이 떠 있으면 안 보임)
  const can = !on && curScreen === 'lobby' && !plazaApi.seat() && !walking && PLAZA.onPier(p[0], p[1]);
  $('fish-start').classList.toggle('hidden', !can);
  if (can && !mod && !preload) preload = Promise.all([import('../games/fishing/session.js'), import('../games/fishing/dex.js')]).catch(() => {}); // 판에 들어서면 미리 불러 둠 (누를 때 멈칫하지 않게)
  othersFrame(now, lastFrameT ? Math.min(0.1, now - lastFrameT) : 0.016); lastFrameT = now; // 계단·선착장에서는 낚싯대 (나·다른 사람)
  pierBubbles(now, p);
  if (!on) return;
  if (curScreen !== 'lobby' || plazaApi.seat()) { stop(); return; }
  const rdt = lastT ? Math.min(0.05, now - lastT) : 0.016;
  lastT = now;
  F.frame(rdt);
  if (camFrom.t < 1) { // 광장 카메라 → 낚시 카메라 (부드럽게 출발·도착)
    camFrom.t = Math.min(1, camFrom.t + rdt / BLEND_IN);
    const e = easeInOut(camFrom.t), c = world.camera;
    orbitBlend(c, camFrom.pos, camFrom.look, camTo.copy(c.position), F.S.camLook, e);
    c.fov = camFrom.fov + (c.fov - camFrom.fov) * e; c.updateProjectionMatrix();
    const dy = Math.atan2(Math.sin(Math.PI - camFrom.yaw), Math.cos(Math.PI - camFrom.yaw));
    F.me.group.rotation.y = camFrom.yaw + dy * Math.min(1, camFrom.t * 1.6); // 캐릭터가 바다 쪽으로 돎 (카메라보다 조금 먼저)
  }
  // 다른 사람 반투명 (새로 들어온 사람도)
  for (const f of plazaApi.view.figs.values()) if (!f.me && !f.fishOp) { f.c.setOpacity(OTHERS_OP, 1); f.fishOp = true; }
  if (chat.length && performance.now() / 1000 - chatDrawn > 0.5) renderChat();
};
// main.js: 3D를 그린 뒤 (찌 확대 창 · 낚시 화면 글자)
export function fishAfterRender() {
  if (!on) return;
  const W = innerWidth, H = innerHeight;
  F.renderZoom(world.renderer, W, H);
  F.hud(hg, W, H);
}
export const fishDebug = { get F() { return F; }, get on() { return on; }, start, stop, others, get mobile() { return IS_MOBILE; } };
