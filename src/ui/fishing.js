// 광장에서 낚시하기 (docs/dev/fishing.md 12장, 사용자 확정 11/25)
//  · 전망대 밑 나무 판(선착장)에 들어서면 '🎣 낚시하기' 버튼 → 누른 그 자리에서 시작 (정해진 칸 없음)
//  · 낚시 중: 화면은 낚시 시안과 같음(src/games/fishing/session.js), 다른 사람은 반투명으로 보이고 채팅은 화면 왼쪽에 (나는 보기만)
//  · 다른 사람에게는 걷기처럼 내 상태(fi: 낚시 중·찌 자리)와 '잡았다' 한 번만 (광장 채널). 경기 중인 선수 PC에는 안 감(광장 채널 밖)
//  · 희귀·전설·전설 탁구채를 낚으면 광장 모두에게 알림
import * as THREE from 'three';
import { account, fishDex, myEquip, srvNow, syncServerClock } from '../account.js';
import { PLAZA } from '../arena-plaza.js';
import { applyLook } from '../items.js';
import { CATCH, LEGEND_PADDLES } from '../games/fishing/rules.js';
import { makeBobber, makeLine, makeRod, seaHeight } from '../games/fishing/world.js';
import { fishHooks, plazaApi } from './plaza.js';
import { hud as toastHud } from './hud.js';
import { curScreen } from './screen.js';
import { renderMe } from './login.js';
import { $, IS_MOBILE, esc, world } from './state.js';

const OTHERS_OP = 0.35; // 낚시하는 동안 다른 사람 반투명 (사용자 확정)
const CHAT_KEEP = 6, CHAT_LIFE = 14; // 화면 옆 채팅: 최근 6줄, 14초
let F = null, mod = null, dexMod = null, loading = false, on = false, lastT = 0, hiddenAt = 0;
const me = { b: null }; // 다른 사람에게 보낼 내 찌 자리
const chat = [];

// ── 화면: 버튼 · 낚시 화면(2D 캔버스) · 그만하기 · 도감 · 화면 옆 채팅
const root = Object.assign(document.createElement('div'), { id: 'fish-ui', className: 'fish-ui' });
root.innerHTML = `
  <button id="fish-start" class="fish-start hidden" type="button">🎣 낚시하기</button>
  <canvas id="fish-hud" class="fish-hud hidden"></canvas>
  <div id="fish-bar" class="fish-bar hidden">
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
.fish-hud { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
.fish-bar { position: absolute; right: 16px; top: 14px; display: flex; gap: 8px; }
.fish-bar button { height: 40px; padding: 0 16px; border-radius: 999px; font-weight: 700; font-size: 15px; color: #fff; background: rgba(15,25,50,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); backdrop-filter: blur(8px); }
.fish-bar #fish-stop { background: rgba(224,51,60,.85); }
.fish-chat { position: absolute; left: 16px; top: 70px; width: min(280px, 46vw); display: flex; flex-direction: column; gap: 6px; }
.fish-chat div { padding: 7px 12px; border-radius: 14px; font: 600 14px var(--font-ui, system-ui); color: #fff; background: rgba(15,25,50,.5); backdrop-filter: blur(6px); transition: opacity .6s; }
.fish-chat b { color: #ffd36b; margin-right: 6px; }
.fish-ui .hidden { display: none !important; }
body.fishing-on #lobby > *:not(#fish-ui), body.fishing-on #lb-free, body.fishing-on .lb-bottom, body.fishing-on .lb-icons { visibility: hidden; }
@media (max-width: 560px) { .fish-start { bottom: 170px; } .fish-chat { top: 64px; width: 52vw; } .fish-chat div { font-size: 12px; } .fish-bar button { height: 36px; padding: 0 12px; font-size: 13px; } }
`;
document.head.appendChild(css);

$('fish-start').addEventListener('click', (e) => { e.stopPropagation(); start(); });
$('fish-stop').addEventListener('click', (e) => { e.stopPropagation(); stop(); });
$('fish-dex').addEventListener('click', (e) => { e.stopPropagation(); if (F && (F.S.mode === 'ready' || F.S.mode === 'result')) mod.openDex(); });
for (const id of ['fish-start', 'fish-stop', 'fish-dex']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

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
  const p = f?.disp || [PLAZA.stairs.bottom[0], PLAZA.stairs.bottom[1]];
  F.standAt(p[0], p[1]);
  applyLook(F.me, myEquip());
  F.me.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  hidePaddle(F.me);
  F.setActive(true);
  on = true; me.b = null; lastT = 0;
  document.body.classList.add('fishing-on');
  for (const id of ['fish-hud', 'fish-bar', 'fish-chat']) $(id).classList.remove('hidden');
  $('fish-start').classList.add('hidden');
  plazaApi.view.setCamOff(true);
  F.camFov0 = world.camera.fov;
  if (account.loggedIn) { syncServerClock(); fishDex().then((d) => { if (d) dexMod.setServerDex(d); }); }
  plazaApi.sendInfo();
  resize();
}
function stop() {
  if (!on) return;
  on = false; me.b = null;
  F.setActive(false);
  document.body.classList.remove('fishing-on');
  for (const id of ['fish-hud', 'fish-bar', 'fish-chat']) $(id).classList.add('hidden');
  hg.clearRect(0, 0, hudCv.width, hudCv.height);
  plazaApi.view.setCamOff(false);
  plazaApi.view.resetCam();
  if (F.camFov0 && world.camera.fov !== F.camFov0) { world.camera.fov = F.camFov0; world.camera.updateProjectionMatrix(); }
  world.camera.rotation.z = 0;
  for (const f of plazaApi.view.figs.values()) if (!f.me && f.fishOp) { f.c.setOpacity(1, 1); f.fishOp = false; }
  plazaApi.sendInfo();
  renderMe();
}
function hidePaddle(c) {
  if (c.handle) c.handle.visible = false;
  if (c.blade) c.blade.visible = false;
  if (c.paddleModel) c.paddleModel.visible = false;
}

// 낚시 한 판의 일 → 광장 사람들에게
function onEvent(ev) {
  if (ev.k === 'cast') { me.b = ev.to.map((v) => Math.round(v * 100) / 100); plazaApi.sendInfo(); }
  else if (ev.k === 'catch') {
    me.b = null; plazaApi.sendInfo();
    const c = ev.c;
    plazaApi.send({ k: 'fish', a: 'catch', item: c.id, cm: c.kind === 'fish' ? ev.cm : 0 });
    setTimeout(() => renderMe(), 2500); // 서버가 준 코인을 오른쪽 위 카드에
  } else if (ev.k === 'miss' || ev.k === 'ready') { if (me.b) { me.b = null; plazaApi.sendInfo(); } }
}

// ── 입력 (낚시 중에만): 누르기·끌어올리기는 광장 화면 위 어디서나
const cv = world.renderer.domElement;
cv.addEventListener('pointerdown', (e) => { if (!on) return; e.preventDefault(); F.press({ x: e.clientX, y: e.clientY }); });
addEventListener('pointermove', (e) => { if (on) F.moveDrag(e.clientX, e.clientY); });
addEventListener('pointerup', (e) => { if (on) F.release(e.clientX, e.clientY); });
addEventListener('pointercancel', () => { if (on) { F.S.drag = null; F.release(); } });
addEventListener('blur', () => { if (on) { F.S.drag = null; F.release(); } });
addEventListener('keydown', (e) => {
  if (!on || e.target?.tagName === 'INPUT') return;
  if (e.code === 'Escape') { if (!mod.dexOpen()) stop(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') return; // 광장에서는 선 자리 그대로
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
function renderChat() {
  const now = performance.now() / 1000;
  $('fish-chat').innerHTML = chat.filter((c) => now - c.t < CHAT_LIFE)
    .map((c) => `<div style="opacity:${Math.min(1, (CHAT_LIFE - (now - c.t)) / 2).toFixed(2)}"><b>${esc(c.nick)}</b>${esc(c.text)}</div>`).join('');
}

// ── 다른 사람 낚시 모습 (fishing.md 12장 ③): 낚싯대를 들고 바다를 봄 · 던진 곳에 찌(물결 따라) · 줄 · 잡으면 말풍선·물보라
const others = new Map(); // id → { rod, bob, line, b, at }
const tipW = new THREE.Vector3(), toV = new THREE.Vector3();
function otherOf(id, f) {
  let o = others.get(id);
  if (o && o.fig !== f) { dropOther(id); o = null; }
  if (!o) {
    const rod = makeRod();
    rod.root.position.set(0.24, 0.92, -0.12);
    f.c.group.add(rod.root);
    const bob = makeBobber(); bob.visible = false; plazaApi.view.root.add(bob);
    const line = makeLine(); line.line.visible = false; plazaApi.view.root.add(line.line);
    o = { fig: f, rod, bob, line, b: null, at: 0 };
    others.set(id, o);
  }
  return o;
}
function dropOther(id) {
  const o = others.get(id); if (!o) return;
  o.fig.c.group.remove(o.rod.root);
  plazaApi.view.root.remove(o.bob, o.line.line);
  if (o.fig.c.handle) o.fig.c.handle.visible = true;
  if (o.fig.c.blade) o.fig.c.blade.visible = true;
  if (o.fig.c.paddleModel) o.fig.c.paddleModel.visible = true;
  others.delete(id);
}
function othersFrame(now) {
  const people = plazaApi.people();
  for (const id of [...others.keys()]) { const p = people.get(id), f = plazaApi.view.figs.get(id); if (!p?.fi || !f) dropOther(id); }
  for (const [id, p] of people) {
    if (!p.fi) continue;
    const f = plazaApi.view.figs.get(id);
    if (!f || !f.c.group.visible || !PLAZA.onPier(f.disp?.[0] ?? 0, f.disp?.[1] ?? 0)) continue;
    const o = otherOf(id, f);
    hidePaddle(f.c);
    const b = p.fi.b;
    if (String(b) !== String(o.b)) { o.b = b; o.at = now; }
    const landed = b && now - o.at > 0.7; // 던지고 날아가는 동안은 찌를 안 보임
    o.rod.pose(b ? -1.05 : -0.95, b ? 0.12 : 0.05, 0, 0);
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
  if (n.big) toastHud.toast(`🎣 ${p.nick}님이 ${n.name || n.txt}${n.name ? '을(를)' : '을(를)'} 낚았어요!${n.legend ? ' 🌟' : ''}`, 3200);
};
fishHooks.onSay = (p, text) => { if (p) addChat(p.nick, text); };

// ── 광장(ui/plaza.js)이 부르는 것
fishHooks.on = () => on;
fishHooks.state = () => (on ? { b: me.b } : null);
fishHooks.hidden = () => { if (on) stop(); $('fish-start').classList.add('hidden'); };
fishHooks.frame = (now, p, walking) => {
  // 버튼: 낚시 판 위에 서 있으면 (걷는 중·탁구대 자리·창이 떠 있으면 안 보임)
  const can = !on && curScreen === 'lobby' && !plazaApi.seat() && !walking && PLAZA.onPier(p[0], p[1]);
  $('fish-start').classList.toggle('hidden', !can);
  if (others.size || [...plazaApi.people().values()].some((q) => q.fi)) othersFrame(now);
  if (!on) return;
  if (curScreen !== 'lobby' || plazaApi.seat()) { stop(); return; }
  const rdt = lastT ? Math.min(0.05, now - lastT) : 0.016;
  lastT = now;
  F.frame(rdt);
  // 다른 사람 반투명 (새로 들어온 사람도)
  for (const f of plazaApi.view.figs.values()) if (!f.me && !f.fishOp) { f.c.setOpacity(OTHERS_OP, 1); f.fishOp = true; }
  if (chat.length) renderChat();
};
// main.js: 3D를 그린 뒤 (찌 확대 창 · 낚시 화면 글자)
export function fishAfterRender() {
  if (!on) return;
  const W = innerWidth, H = innerHeight;
  F.renderZoom(world.renderer, W, H);
  F.hud(hg, W, H);
}
export const fishDebug = { get F() { return F; }, get on() { return on; }, start, stop, others, get mobile() { return IS_MOBILE; } };
