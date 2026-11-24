// 게임 시작점: 화면별 파일(src/ui/)을 모두 불러오고, 매 프레임 루프를 돌린다.
// 화면별 파일은 불러오는 순간 자기 버튼을 연결하므로, 다른 곳에서 안 쓰는 파일도 여기서 꼭 불러야 한다.
// 글꼴 Pretendard(화면 글자용, 쓰는 글자 묶음만 받음). 로고는 Jua 그대로
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './ui/login.js';
import './ui/rank.js';
import './ui/dress.js';
import './ui/titles.js';
import './ui/lobbyList.js';
import './ui/breakPill.js';
import './ui/missions.js';
import './ui/freeGacha.js';
import './ui/plaza.js';
import { autoLogin, buyItem, equipItem, gacha, myEquip, testCoins } from './account.js';
import { initAudio, playUI, setEcho, setListener, setQuiet } from './audio.js';
import { applyLook, arenaOf, ballOf, tableOf } from './items.js';
import { LOBBY_CAM, createLobbyDemo } from './lobbyDemo.js';
import { IS_TEST, ONLINE } from './net.js';
import { CHAR_Z } from './scene.js';
import { aiCoins, clearAiCoins } from './ui/ai.js';
import { crowd } from './ui/cheer.js';
import { hud } from './ui/hud.js';
import { INTRO, intro, introFrame } from './ui/intro.js';
import { checkDaily, showLobby, showLogin } from './ui/login.js';
import { endRoom, room } from './ui/room.js';
import { show, stopGame } from './ui/screen.js';
import { $, ease, game, lerp3, match, preview, world } from './ui/state.js';
import { plazaDebug, plazaFrame } from './ui/plaza.js';
import { bubbleArena, bubbleLook, bubbleSeated } from './ui/plazaBubble.js';

const lobbyDemo = createLobbyDemo();
const LOBBY_QUIET = 0.4; // 로비 배경 랠리 소리 크기 (경기 중 소리를 1로 볼 때)
// 브라우저는 사람이 한 번 누르기 전에는 소리를 못 낸다: 첫 클릭·키 입력에 소리를 켠다
const unlockAudio = () => { initAudio(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
if (IS_TEST) {
  document.body.classList.add('is-test');
  const tag = document.createElement('div');
  tag.textContent = '🧪 테스트 버전';
  tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:4px 12px;border-radius:999px;background:#ffcc00;color:#222;font:bold 13px sans-serif;pointer-events:none;';
  document.body.appendChild(tag);
}
if (!ONLINE) { $('mode-note').classList.remove('hidden'); $('mode-note').title = '서버 설정이 없어 로컬 테스트 모드예요 (같은 브라우저의 탭끼리만 연결)'; }
if (!ONLINE) $('login-offline').classList.remove('hidden');
/* ───────── 버튼 ───────── */

function exitGame() {
  playUI('click');
  if (room) endRoom('quit'); // 경기 중에 나가면 광장으로 (탁구대 자리에서도 내려온다)
  else {
    stopGame();
    show('lobby');
    if (aiCoins) { hud.toast(`혼자 하기로 🪙 +${aiCoins} 코인`, 2400); clearAiCoins(); }
  }
}
$('exit').addEventListener('click', exitGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game && !room) exitGame();
});
// 꾸미기 카메라: 랠리하는 내 캐릭터의 등 뒤 가까이 (x: 패널을 피해 캐릭터를 화면 왼쪽으로 비키는 정도)
// follow: 캐릭터가 좌우로 움직일 때 카메라가 따라가는 빠르기, blend: 로비↔꾸미기 카메라가 옮겨 가는 시간(초)
const PV = { x: 0.75, y: 1.45, back: 2.7, lookY: 0.85, follow: 2.5, blend: 1.1 };
// 얼굴 고르기: 카메라가 캐릭터 둘레를 돌아 앞으로 가서 얼굴을 가까이 비춘다 (사용자 확정)
const PV_FRONT = { y: 1.32, dist: 1.85, lookY: 0.98, x: 0.5, turn: 0.9 };
const camBlend = { p: 0, f: 0, x: 0, last: 0 }; // p: 0 = 로비 카메라, 1 = 꾸미기 카메라 · f: 0 = 등 뒤, 1 = 앞(얼굴)
// 처음 열면: 기억해 둔 열쇠가 있으면 자동 로그인, 없으면 로그인 화면
(async () => {
  const r = await autoLogin();
  if (r === 'ok') { showLobby(); checkDaily(); }
  else showLogin(r === 'error' ? '서버에 연결하지 못해 자동 로그인을 못 했어요. 다시 로그인하거나 손님으로 해 주세요' : '');
})();
/* ───────── 매 프레임 ───────── */
function loop() {
  // 뽑기 연출 화면(src/gachaShow.js)이 화면을 다 덮는 동안에는 뒤의 3D 장면을 쉬게 한다 (느린 PC)
  if (!game && !match && document.body.classList.contains('gacha-on')) { requestAnimationFrame(loop); return; }
  const now = performance.now() / 1000;
  // 내 스윙 판단을 먼저 끝내고 나서 경기 판정 (느린 PC에서도 늦게 친 공이 버려지지 않게)
  if (game) game.decideHit(now + game.offset);
  if (match) match.update(now);
  // 광장 로비 (src/ui/plaza.js): 광장 채널 붙기/빠지기는 매 프레임 확인, 광장이 보이면 광장을 그린다
  const inPlaza = plazaFrame(now);
  // 위치가 있는 소리 크기: 경기·대기실(연습 스윙)은 그대로, 로비·꾸미기 배경 랠리는 작게
  if (game) {
    setQuiet(1);
    if (!(intro && introFrame(now))) game.update(now + game.offset); // 연출 중엔 introFrame이 그린다
  }
  else if (inPlaza) {
    setQuiet(bubbleArena() ? 1 : LOBBY_QUIET); // 경기장 거품 안: 경기 소리 그대로
    world.setFocus(0);
    setEcho(0);
    const cp = world.camera.position, e = world.camera.matrixWorld.elements;
    setListener([cp.x, cp.y, cp.z], [e[0], e[1], e[2]]); // 카메라 자리에서 듣기 (오른쪽 = 카메라 x축)
  }
  else {
    setQuiet(LOBBY_QUIET);
    // 로비 배경: 두 캐릭터가 랠리를 주고받고, 카메라는 옆에서 천천히 흔들린다
    // 꾸미기 화면에서도 랠리는 계속되고, 카메라만 내 캐릭터 등 뒤로 스르륵 옮겨 간다
    world.setFocus(0);
    setEcho(0);
    // 광장(꾸미기 창)에서 배경을 입어 보러 막 넘어왔으면 카메라는 바로 꾸미기 자리에 (로비에서 날아오지 않게)
    if (now - camBlend.last > 0.3) { camBlend.p = preview ? 1 : 0; camBlend.f = preview?.front ? 1 : 0; camBlend.x = world.team[0][0].group.position.x; }
    const dt = Math.min(0.1, now - camBlend.last || 0.016);
    camBlend.last = now;
    const L = LOBBY_CAM;
    const a = L.angle + Math.sin(now * L.speed) * L.sway;
    const lobbyPos = [Math.sin(a) * L.dist, L.y, Math.cos(a) * L.dist];
    world.camera.position.set(...lobbyPos);
    world.camera.lookAt(0, L.lookY, 0);
    // 메뉴가 왼쪽에 있으니 탁구대를 화면 오른쪽으로 비켜 보이게 (카메라를 옆으로 민다)
    if (innerWidth >= 760) world.camera.translateX(-L.shift * Math.min(1, innerWidth / innerHeight / 1.6));
    const camL = world.camera.position.toArray();
    // 시선도 같이 옮겨야 하니 로비 카메라가 보는 점을 구해 둔다 (translateX로 민 만큼 같이)
    const lookL = [camL[0] - lobbyPos[0], L.lookY, camL[2] - lobbyPos[2]];
    // 꾸미기 카메라: 내 캐릭터를 부드럽게 따라간다
    const me = world.team[0][0];
    camBlend.x += (me.group.position.x - camBlend.x) * (1 - Math.exp(-dt * PV.follow));
    // 등 뒤(θ = 0) ↔ 앞(θ = π): 캐릭터 둘레를 돌아서 간다 (몸을 뚫고 지나가지 않게)
    camBlend.f += Math.sign((preview?.front ? 1 : 0) - camBlend.f) * Math.min(Math.abs((preview?.front ? 1 : 0) - camBlend.f), dt / PV_FRONT.turn);
    const fk = ease(camBlend.f), th = fk * Math.PI;
    const R = PV.back + (PV_FRONT.dist - PV.back) * fk;
    const side = (innerWidth < 760 ? 0.1 : PV.x + (PV_FRONT.x - PV.x) * fk); // 패널을 피해 캐릭터를 화면 왼쪽으로
    const rx = Math.cos(th), rz = -Math.sin(th); // 카메라 오른쪽 방향
    const cx = camBlend.x + rx * side, cz = CHAR_Z + rz * side; // 보는 점 (캐릭터에서 화면 오른쪽으로 비킴)
    const lookD = [cx, PV.lookY + (PV_FRONT.lookY - PV.lookY) * fk, cz];
    const camD = [cx + Math.sin(th) * R, PV.y + (PV_FRONT.y - PV.y) * fk, cz + Math.cos(th) * R];
    const target = preview ? 1 : 0;
    camBlend.p += Math.sign(target - camBlend.p) * Math.min(Math.abs(target - camBlend.p), dt / PV.blend);
    const t = ease(camBlend.p);
    if (t > 0) {
      world.camera.position.set(...lerp3(camL, camD, t));
      world.camera.lookAt(...lerp3(lookL, lookD, t));
    }
    world.ring.visible = false;
    world.aim.visible = false;
    applyLook(world.team[0][0], preview ? preview.look : myEquip());
    applyLook(world.team[1][0], {});
    for (const side of [0, 1]) {
      world.team[side][0].group.visible = true;
      world.team[side][0].setOpacity(1, 1);
      world.team[side][0].setTag(null);
      world.team[side][1].group.visible = false;
    }
    // 배경 랠리 소리: 로비·꾸미기 화면에서, 카메라 자리에서 듣는 것처럼 작게
    // (좌우 소리 방향도 카메라를 따라 로비 각도 → 꾸미기 각도(정면)로 옮겨 간다)
    const cp = world.camera.position;
    setListener([cp.x, cp.y, cp.z], lerp3([Math.cos(a), 0, -Math.sin(a)], [1, 0, 0], t));
    const rallySound = !$('lobby').classList.contains('hidden') || !$('dress').classList.contains('hidden');
    lobbyDemo.update(now, world.chars, world, rallySound);
  }
  // 움직이는 옷(전설 효과·병아리 파닥): 보이는 캐릭터만
  const odt = Math.min(0.1, now - (loop.last || now));
  loop.last = now;
  for (const side of world.team) for (const c of side) if (c.group.visible) c.tickOutfit(now, odt);
  // 배경: 방(대기실·경기)에서는 방장이 장착한 배경을 모두에게, 그 밖(로비·꾸미기·혼자 하기)은 내 것(입어 보는 중이면 그것)
  const arenaLook = room ? room.hostM?.look : bubbleLook() || (preview && !game ? preview.look : myEquip()); // 경기장 거품 안이면 그 경기 방장 것
  world.setArena(arenaOf(arenaLook));
  world.setBallSkin(ballOf(arenaLook)); // 탁구공도 배경처럼: 방에서는 방장 것
  world.setTable(tableOf(arenaLook)); // 탁구대도 (방장 것)

  world.crowd.setShown(!!game || bubbleSeated()); // 관중석은 경기 화면에서만 (경기장 거품에서는 관중석에 앉았을 때만)
  world.crowd.update(now); // 관중석 (관중이 없으면 바로 끝남)
  world.render();
  if (perf) perf.frame(now);
  glassGuard(now);
  requestAnimationFrame(loop);
}

// 유리(흐림) 효과 지킴이: 로비가 떠 있는 동안 2초씩 프레임을 재서, 두 번 연달아 40fps 아래면
// 흐림을 끄고 진한 반투명 패널로 바꾼다(html.lite-glass, 이 브라우저에 기억). 내장 그래픽 노트북 렉 방지.
// ?glass=0 이면 항상 끔, ?glass=1 이면 항상 켬(시험용).
const GLASS = (() => {
  const q = new URLSearchParams(location.search).get('glass');
  let saved = null; try { saved = localStorage.getItem('smash-lite-glass'); } catch {}
  const lite = q === '0' || (q !== '1' && saved === '1');
  document.documentElement.classList.toggle('lite-glass', lite);
  return { lite, watch: !lite && q !== '1', t0: 0, n: 0, last: 0, shownAt: 0, slow: 0 };
})();
function glassGuard(now) {
  const g = GLASS;
  if (!g.watch) return;
  if (document.getElementById('lobby').classList.contains('hidden') || now - g.last > 0.5) { g.t0 = 0; g.n = 0; g.shownAt = 0; g.last = now; return; } // 로비가 아니거나 탭을 다녀옴 → 다시
  g.last = now;
  if (!g.shownAt) g.shownAt = now;
  if (now - g.shownAt < 3) return; // 막 뜬 직후(로딩·셰이더 준비)는 빼고
  if (!g.t0) { g.t0 = now; g.n = 0; return; }
  g.n++;
  if (now - g.t0 < 2) return;
  const fps = g.n / (now - g.t0);
  g.t0 = now; g.n = 0;
  g.slow = fps < 40 ? g.slow + 1 : 0;
  if (g.slow >= 2) {
    g.watch = false; g.lite = true;
    document.documentElement.classList.add('lite-glass');
    try { localStorage.setItem('smash-lite-glass', '1'); } catch {}
  }
}

// 프레임 측정 (최적화 ④): 주소에 ?fps=1을 붙이면 왼쪽 아래에 초당 프레임·가장 느린 프레임·그리기 호출 수가 뜬다
// 0.5초마다 갱신. 느린 PC에서 어떤 배경·화면이 무거운지 직접 확인하는 용도 (일반 사용자에게는 안 보임)
const perf = new URLSearchParams(location.search).has('fps') ? (() => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9999;padding:6px 9px;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font:12px/1.45 ui-monospace,monospace;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  let t0 = 0, n = 0, last = 0, worst = 0;
  return {
    frame(now) {
      if (last) worst = Math.max(worst, now - last);
      last = now; n++;
      if (!t0) t0 = now;
      if (now - t0 < 0.5) return;
      const fps = n / (now - t0), info = world.renderer.info.render, b = world.arena?.bake;
      el.textContent = `${fps.toFixed(0)} fps  (가장 느린 프레임 ${(worst * 1000).toFixed(0)}ms)\n그리기 ${info.calls}회 · 삼각형 ${(info.triangles / 1000).toFixed(0)}k\n배경 ${world.arenaId}` + (b ? ` · 합침 ${b.removed}→${b.added} (${b.ms}ms)` : '');
      t0 = now; n = 0; worst = 0;
    },
  };
})() : null;
requestAnimationFrame(loop);
window.__smash = { plaza: plazaDebug, PV, INTRO, world, shop: { testCoins, gacha, buyItem, equipItem, myEquip }, get intro() { return intro; }, get game() { return game; }, get match() { return match; }, get room() { return room; }, get crowd() { return crowd; } };
