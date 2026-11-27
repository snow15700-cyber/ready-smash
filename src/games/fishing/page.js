// 낚시 손맛 시안 페이지 (fishing.html) — 규칙·연출은 session.js (광장과 같이 씀), 여기는 장면·그리기·입력·⚙️ 시험 설정만
// 서버: 같은 브라우저에서 게임에 로그인해 두면 서버를 씀(코인·도감·업적), 아니면 이 브라우저에만.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import * as THREE from 'three';
import { buildCampus } from '../../campusMock.js';
import { account, autoLogin, fishDex, syncServerClock, srvNow } from '../../account.js';
import { setServerDex } from './dex.js';
import { setSoundOn } from './sound.js';
import { openSyncCal } from './syncCal.js';
import { PIER } from '../../campusLayout.js';
import { STAND } from './rules.js';
import { TUNE, createFishing, dexOpen, initSound, openDex } from './session.js';
import { makeCat } from '../cats/models.js';
import { BEAT } from './beat.js';

const params = new URLSearchParams(location.search);
if (params.get('fish')) TUNE.fish = params.get('fish');
if (params.get('cond')) TUNE.cond = params.get('cond');
if (params.get('bubbles')) TUNE.bubbles = params.get('bubbles');
if (params.get('genre')) TUNE.genre = params.get('genre'); // 13-3 ⑤ 장르 시안 (?genre=jazz·rock·ballad)
// 주변 박자 연출 시안(B): 이 시안 페이지에서는 처음에 다 켜 둠 — ⚙️에서 하나씩 끄며 비교 (?beat=0 이면 다 끔)
for (const k of ['bSea', 'bPier', 'bBody']) TUNE[k] = params.get('beat') === '0' ? 0 : 1;
// 음악·색 달아오름(16장 C): 기본 켬(광장도) — 시안에서는 ?heat=0 이면 끔
TUNE.heat = params.get('heat') === '0' ? 0 : 1;
TUNE.heatC = params.get('heat') === '0' ? 0 : 1; // 2단계 색 달아오름도

// ── 3D 장면 (캠퍼스 시안 = 광장과 같은 장면, 낚시터 포함)
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe2f7);
scene.fog = new THREE.Fog(0xcfe8fb, 70, 300);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xfffaf0, 0x9fb08a, 1.5);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
sun.position.set(-8, 40, 40); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 120 });
sun.target.position.set((STAND.xMin + STAND.xMax) / 2, PIER.y, STAND.z);
scene.add(hemi, sun, sun.target);
const { root, anim } = buildCampus();
scene.add(root);

let online = false;
const F = createFishing({ scene, camera, canWalk: true, isOnline: () => online, clock: srvNow });
const S = F.S;
const STAND_AT = { jazz: [11, 45.6], ballad: [-4, 51], rock: [26, 51] }; // ?stand=ballad 처럼 (13-3: 팔 자리 시험) 또는 ?stand=x,z
const st = params.get('stand');
if (st) { const p = STAND_AT[st] || st.split(',').map(Number); F.standAt(p[0], p[1]); if (STAND_AT[st] && !params.get('genre')) TUNE.genre = st; }
window.__fish = Object.assign(F.dbg, { S, TUNE, openDex, BEAT, scene, standAt: F.standAt }); // 같은 물건 (점검이 __fish.hold를 바꾸면 낚시가 바로 봄)
autoLogin().then(async (r) => {
  if (r !== 'ok' || !account.loggedIn) return;
  online = true;
  syncServerClock();
  TUNE.fish = 'random'; TUNE.bubbles = 'normal'; // 서버는 기획대로의 기포만 앎
  for (const k of ['fish', 'bubbles', 'size']) document.querySelector(`#panel [data-k="${k}"]`)?.closest('.row')?.remove();
  const tag = document.querySelector('.tag span'); if (tag) tag.textContent = ` · 🔗 ${account.nick} · 서버에 기록(코인·도감·업적)`;
  const d = await fishDex(); if (d) setServerDex(d);
});

// ── 조작: 꾹 누르기(기 모으기) → 떼면 던지기 (17장)
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); F.press({ x: e.clientX, y: e.clientY }); });
addEventListener('pointermove', (e) => F.moveDrag(e.clientX, e.clientY));
addEventListener('pointerup', (e) => F.release(e.clientX, e.clientY));
addEventListener('pointercancel', () => { F.cancel(); });
addEventListener('blur', () => { F.cancel(); });
addEventListener('keydown', F.keyDown);
addEventListener('keyup', F.keyUp);
for (const b of document.querySelectorAll('#move button')) {
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); S.walk = +b.dataset.d; });
  b.addEventListener('pointerup', () => { S.walk = 0; }); b.addEventListener('pointerleave', () => { S.walk = 0; });
}

// ── 그리기 루프
const hud = document.getElementById('hud');
const hg = hud.getContext('2d');
function resize() {
  const w = innerWidth, h = innerHeight, d = Math.min(2, devicePixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 72 : 55; camera.updateProjectionMatrix();
  hud.width = w * d; hud.height = h * d; hg.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

// ⑥ 시안용 고양이: 광장의 ♥2 고양이처럼 내 옆에 앉아 줄다리기 때 까딱 (진짜 광장 고양이는 cats/plazaCats.js)
const cat = makeCat('cheese'); cat.scale.setScalar(0.75); scene.add(cat);
function tickCat() {
  cat.visible = !!TUNE.bBody;
  if (!cat.visible) return;
  const p = F.me.group.position;
  cat.position.set(p.x - 0.8, p.y, p.z + 0.9); cat.rotation.y = Math.atan2(p.x - cat.position.x, p.z - 0.6 - cat.position.z); // 내 옆(바다 쪽)에 앉아 나를 올려다봄
  cat.userData.anim(S.now, S.mode === 'fight' ? 'nod' : 'sit');
}

let last = performance.now();
renderer.setAnimationLoop((ms) => {
  const rdt = Math.min(0.05, (ms - last) / 1000); last = ms; // 탭이 숨겨지면 프레임이 멈춤 → 입질도 멈춤(돌아오면 이어서)
  F.frame(rdt);
  for (const f of anim) f(S.now);
  tickCat();
  const W = innerWidth, H = innerHeight;
  renderer.setViewport(0, 0, W, H);
  renderer.render(scene, camera);
  F.renderZoom(renderer, W, H);
  F.hud(hg, W, H);
});

// 탭이 숨겨지면 리듬 시계도 멈췄다가 돌아오면 이어서 (진짜 시계라 따로 밀어 줌)
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = performance.now() / 1000;
  else if (hiddenAt) F.resumeAfter(performance.now() / 1000 - hiddenAt);
});

// ── ⚙️ 시험 설정
const panel = document.getElementById('panel');
document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
for (const el of [panel, document.getElementById('gear')]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
const sync = () => panel.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(TUNE[b.dataset.k]) === b.dataset.v));
panel.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'syncBtn') { if (!F.busy()) openSyncCal(); return; }
  if (b.dataset.act) { if (F.dbg.fightAt(+b.dataset.act)) panel.classList.remove('open'); return; } // 단계 바로 시험
  const k = b.dataset.k, v = b.dataset.v;
  TUNE[k] = k === 'fish' || k === 'bubbles' || k === 'cond' || k === 'size' || k === 'genre' ? v : k === 'sound' ? v === 'true' : +v;
  if (k === 'sound') { initSound(); setSoundOn(TUNE.sound); }
  sync();
});
sync();
document.getElementById('dexBtn').addEventListener('click', () => { if ((S.mode === 'ready' || S.mode === 'result') && !dexOpen()) openDex(); });
document.getElementById('dexBtn').addEventListener('pointerdown', (e) => e.stopPropagation());
setInterval(() => document.getElementById('move').classList.toggle('hide', S.mode !== 'ready'), 200);
