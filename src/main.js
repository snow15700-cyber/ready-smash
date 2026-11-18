// 게임 시작점: 화면별 파일(src/ui/)을 모두 불러오고, 매 프레임 루프를 돌린다.
// 화면별 파일은 불러오는 순간 자기 버튼을 연결하므로, 다른 곳에서 안 쓰는 파일도 여기서 꼭 불러야 한다.
import './ui/login.js';
import './ui/rank.js';
import './ui/dress.js';
import './ui/titles.js';
import './ui/lobbyList.js';
import { autoLogin, equipItem, gacha, myEquip, testCoins } from './account.js';
import { initAudio, playUI, setEcho, setListener, setQuiet } from './audio.js';
import { applyLook, arenaOf, ballOf } from './items.js';
import { LOBBY_CAM, createLobbyDemo } from './lobbyDemo.js';
import { IS_TEST, ONLINE, makeCode } from './net.js';
import { CHAR_Z } from './scene.js';
import { aiCoins, clearAiCoins, startAI } from './ui/ai.js';
import { crowd } from './ui/cheer.js';
import { hud } from './ui/hud.js';
import { INTRO, intro, introFrame } from './ui/intro.js';
import { checkDaily, showLobby, showLogin } from './ui/login.js';
import { enterRoom, leaveRoom, room } from './ui/room.js';
import { show, stopGame } from './ui/screen.js';
import { STAGE, stageFrame, stageOff } from './ui/stage.js';
import { $, ease, game, lerp3, match, preview, world } from './ui/state.js';
import { endWatch, watch } from './ui/watch.js';

const lobbyDemo = createLobbyDemo();
const LOBBY_QUIET = 0.4; // 로비 배경 랠리 소리 크기 (경기 중 소리를 1로 볼 때)
// 브라우저는 사람이 한 번 누르기 전에는 소리를 못 낸다: 첫 클릭·키 입력에 소리를 켠다
const unlockAudio = () => { initAudio(); removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
if (IS_TEST) {
  const tag = document.createElement('div');
  tag.textContent = '🧪 테스트 버전';
  tag.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;padding:4px 12px;border-radius:999px;background:#ffcc00;color:#222;font:bold 13px sans-serif;pointer-events:none;';
  document.body.appendChild(tag);
}
if (!ONLINE) $('mode-note').textContent = '⚠️ 서버 설정이 없어 로컬 테스트 모드예요 (같은 브라우저의 탭끼리만 연결)';
if (!ONLINE) $('login-offline').classList.remove('hidden');
/* ───────── 버튼 ───────── */
$('btn-ai').addEventListener('click', () => startAI());
$('btn-create-1v1').addEventListener('click', () => enterRoom(makeCode(), true, '1v1'));
$('btn-create-2v2').addEventListener('click', () => enterRoom(makeCode(), true, '2v2'));

function exitGame() {
  playUI('click');
  if (watch) endWatch();
  else if (room) { leaveRoom(); show('lobby'); }
  else {
    stopGame();
    show('lobby');
    if (aiCoins) { hud.toast(`혼자 하기로 🪙 +${aiCoins} 코인`, 2400); clearAiCoins(); }
  }
}
$('exit').addEventListener('click', exitGame);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && game && (!room || watch)) exitGame();
});
// 꾸미기 카메라: 랠리하는 내 캐릭터의 등 뒤 가까이 (x: 패널을 피해 캐릭터를 화면 왼쪽으로 비키는 정도)
// follow: 캐릭터가 좌우로 움직일 때 카메라가 따라가는 빠르기, blend: 로비↔꾸미기 카메라가 옮겨 가는 시간(초)
const PV = { x: 0.75, y: 1.45, back: 2.7, lookY: 0.85, follow: 2.5, blend: 1.1 };
const camBlend = { p: 0, x: 0, last: 0 }; // p: 0 = 로비 카메라, 1 = 꾸미기 카메라
// 처음 열면: 기억해 둔 열쇠가 있으면 자동 로그인, 없으면 로그인 화면
(async () => {
  const r = await autoLogin();
  if (r === 'ok') { showLobby(); checkDaily(); }
  else showLogin(r === 'error' ? '서버에 연결하지 못해 자동 로그인을 못 했어요. 다시 로그인하거나 손님으로 해 주세요' : '');
})();
/* ───────── 매 프레임 ───────── */
function loop() {
  const now = performance.now() / 1000;
  // 내 스윙 판단을 먼저 끝내고 나서 경기 판정 (느린 PC에서도 늦게 친 공이 버려지지 않게)
  if (game) game.decideHit(now + game.offset);
  if (match) match.update(now);
  // 위치가 있는 소리 크기: 경기·대기실(연습 스윙)은 그대로, 로비·꾸미기 배경 랠리는 작게
  if (game) {
    setQuiet(1);
    stageOff();
    if (!(intro && introFrame(now))) game.update(now + game.offset);
  }
  else if (room && !room.inGame && !$('room').classList.contains('hidden')) { setQuiet(1); stageFrame(now); }
  else {
    setQuiet(LOBBY_QUIET);
    stageOff();
    // 로비 배경: 두 캐릭터가 랠리를 주고받고, 카메라는 옆에서 천천히 흔들린다
    // 꾸미기 화면에서도 랠리는 계속되고, 카메라만 내 캐릭터 등 뒤로 스르륵 옮겨 간다
    world.setFocus(0);
    setEcho(0);
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
    const ox = camBlend.x + (innerWidth < 760 ? 0.1 : PV.x);
    const camD = [ox, PV.y, CHAR_Z + PV.back];
    const lookD = [ox, PV.lookY, CHAR_Z];
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
  const arenaLook = room ? room.hostM?.look : watch ? watch.hostM?.look : preview && !game ? preview.look : myEquip();
  world.setArena(arenaOf(arenaLook));
  world.setBallSkin(ballOf(arenaLook)); // 탁구공도 배경처럼: 방에서는 방장 것

  world.crowd.update(now); // 관중석 (관중이 없으면 바로 끝남)
  world.render();
  if (perf) perf.frame(now);
  requestAnimationFrame(loop);
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
window.__smash = { PV, STAGE, INTRO, world, shop: { testCoins, gacha, equipItem, myEquip }, get intro() { return intro; }, get game() { return game; }, get match() { return match; }, get room() { return room; }, get crowd() { return crowd; } };
