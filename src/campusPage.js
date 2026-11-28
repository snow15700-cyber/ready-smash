// 광장 새 디자인 시안 페이지 (campus.html) — 카메라 자리 몇 개 + 낮·노을·밤 + 끌어서 돌려 보기
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { fileFor, fitOf, loadModel, MODELS } from './campusModels.js';
import { buildCampus } from './campusMock.js';
import { breadLine, BREADS, KIM_FUNNY } from './breads.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;

const hemi = new THREE.HemisphereLight(0xfffaf0, 0x9fb08a, 1.5);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
sun.position.set(-20, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 140 });
sun.target.position.set(0, 0, 6);
scene.add(hemi, sun, sun.target);

const { root, anim, bakery, dolphins } = buildCampus();
scene.add(root);

// ✨ 고화질 비교 (사용자 질문 '도형 + 찰흙 느낌을 벗어나려면?' — 코드만으로 할 수 있는 것 몇 가지를 켜고 끄기)
//  ① 영화 같은 색 보정(ACES 톤 매핑) ② 주변 반사(유리·금속에 하늘·빛이 비침) ③ 구석 그늘(GTAO: 물건이 맞닿은 곳·틈이 어두워져 입체감)
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
let composer = null, hq = false;
function setHQ(on) {
  hq = on;
  renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  scene.environment = on ? envTex : null;
  setSky(curSky); // 노출·반사·빛 세기는 하늘마다 (setSky)
  root.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  if (on && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.2, thickness: 1.5, scale: 1.2 });
    ao.blendIntensity = 1;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    resize();
  }
}

const SKY = {
  day: { bg: 0xbfe2f7, fog: 0xcfe8fb, hemi: [0xfffaf0, 1.5], sun: [0xfff1dc, 1.8], exp: 1 },
  sunset: { bg: 0xf3b28a, fog: 0xf0c3a0, hemi: [0xffd2b0, 1.1], sun: [0xff9a5a, 1.4], exp: 1 },
  night: { bg: 0x1a2340, fog: 0x1f2a48, hemi: [0x6f7fb0, 0.55], sun: [0x9fb0e0, 0.35], exp: 1 },
};
// 🌳 무료 소품 모델로 바꿔 보기 (사용자 결정 11/25: ③ 섞기 — 흔한 소품은 무료 모델, 우리 건물은 코드로)
// 모델 목록·받기는 src/campusModels.js (실제 광장과 같이 씀). 각 소품 자리에 크기를 맞춘 모델을 넣고, 지금 모양과 켜고 끔
let propsOn = false;
async function swapProps(on) {
  propsOn = on;
  const spots = [];
  root.traverse((o) => { if (o.userData.prop && MODELS[o.userData.prop]) spots.push(o); });
  for (const o of spots) {
    if (on && !o.userData.alt) {
      const src = await loadModel(fileFor(o)); // 재질 다듬기는 src/campusModels.js
      const m = src.clone(true);
      const { k, y } = fitOf(src, MODELS[o.userData.prop]);
      m.scale.setScalar(k); m.position.y = y;
      const alt = new THREE.Group(); alt.add(m); alt.userData.isAlt = true;
      o.userData.alt = alt; o.add(alt);
    }
    for (const c of o.children) if (!c.userData.keep) c.visible = c.userData.isAlt ? on : !on;
  }
  applyNight(curNight);
}

let curSky = 'day';
function setSky(k) {
  const s = SKY[k]; curSky = k;
  scene.background = new THREE.Color(s.bg);
  scene.fog = new THREE.Fog(s.fog, 60, 260);
  const night = k === 'night' ? 1 : k === 'sunset' ? 0.35 : 0;
  hemi.color.set(s.hemi[0]); hemi.intensity = s.hemi[1] * (hq ? 0.6 - night * 0.25 : 1);
  sun.color.set(s.sun[0]); sun.intensity = s.sun[1] * (hq ? 1.1 - night * 0.6 : 1);
  // 고화질 밤: 주변 반사(흰 방)를 거의 끄고 노출도 낮춤 — 안 그러면 밤인데 낮처럼 밝음 (11/25 사용자 제보)
  renderer.toneMappingExposure = hq ? 0.9 - night * 0.25 : 1;
  scene.environmentIntensity = 0.3 * (1 - night * 0.9);
  applyNight(night);
}
let curNight = 0;
function applyNight(night) {
  curNight = night;
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) if (m.userData?.glow) m.emissiveIntensity = m.userData.glow[0] + (m.userData.glow[1] - m.userData.glow[0]) * night;
    o.userData.nightFx?.(night); // 가로등 빛 웅덩이·빛 번짐
  });
}
setSky('day');

const CAMS = {
  spawn: { pos: [0, 5.2, 18.5], look: [0, 4.2, -4] }, // 광장 3인칭(처음 서는 곳 뒤)
  shops: { pos: [-6, 3.2, 6], look: [-13, 3.5, -4] },
  top: { pos: [0, 66, 54], look: [0, 0, 4] },
  south: { pos: [-2, 4.5, 26], look: [14, -4, 60] }, // 바다 전망대 쪽을 바라봄
  hall: { pos: [24, 22, 14], look: [-2, 14, -22] }, // 본관을 비스듬히 위에서
  gacha: { pos: [-11.5, 2.4, -3], look: [-18.5, 2.8, -6.5] }, // 가게 가까이 (서쪽 상점 골목)
  closet: { pos: [-14, 2.4, -3], look: [-7.6, 3.2, -5.8] },
  fame: { pos: [3.5, 2.4, 4], look: [0, 3.0, -7.5] },
  fountain: { pos: [0, 3.6, 10.5], look: [0, 1.4, 2] }, // 나머지 건물 가까이
  clock: { pos: [8, 3, 2], look: [13.5, 5, -6.5] },
  bakery: { pos: [-8.5, 4.2, 7], look: [-18.5, 3.4, 0.6] }, // 2층 + 지붕 바게트까지
  truck: { pos: [12, 2.6, 6], look: [18.6, 1.4, 4.2] },
  photo: { pos: [1, 2.4, 29], look: [5, 2.4, 24] },
  board: { pos: [3.3, 2.0, 14.3], look: [5, 1.7, 9.6] },
  deck: { pos: [9, 3.2, 27], look: [14, 1, 36] },
  sea: { pos: [13, 3.2, 34], look: [20, -6, 95] },
  pierTop: { pos: [11, 62, 47], look: [11, -6, 46] }, // 선착장 위에서 (낚시 14장 1b)
  pier: { pos: [11, 9, 26], look: [11, -6, 50] }, // 전망대에서 선착장 내려다보기 // 전망대에서 바다 (돌고래)
  edge: { pos: [-10, 3.4, 4], look: [-21, 1.8, 16] }, // 서쪽 가장자리 (나무·가로등·벤치·잔디밭)
  building: { pos: [-15, 1.7, -4], look: [-5, 11, -24] }, // 필로티 아래로 뒤쪽 산
};
function setCam(k) {
  const c = CAMS[k];
  camera.position.set(...c.pos); controls.target.set(...c.look); controls.update();
}
setCam(new URLSearchParams(location.search).get('cam') || 'spawn');
{ const q = new URLSearchParams(location.search), cp = q.get('cpos'), cl = q.get('clook'); if (cp && cl) { camera.position.set(...cp.split(',').map(Number)); controls.target.set(...cl.split(',').map(Number)); controls.update(); } } // 점검용 카메라 (?cpos=x,y,z&clook=x,y,z)
const q = new URLSearchParams(location.search).get('sky');
if (q && SKY[q]) setSky(q);
// 무료 소품은 기본으로 켬 (사용자 확정 11/25: 다 쓰기), ?props=0이면 끔
if (new URLSearchParams(location.search).get('props') !== '0') { swapProps(true); document.querySelector('[data-k="props"]')?.classList.add('on'); }
if (new URLSearchParams(location.search).get('hq') === '1') { setHQ(true); document.querySelector('[data-k="hq"]')?.classList.add('on'); }

document.getElementById('bar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'dolphin') { setCam('sea'); for (const o of document.querySelectorAll('[data-k="cam"]')) o.classList.toggle('on', o.dataset.v === 'sea'); const [n, d] = b.dataset.v.split(':'); dolphins.jumpNow(+n, d === 'd'); return; }
  if (b.dataset.k === 'props') { b.classList.toggle('on', !propsOn); swapProps(!propsOn); return; }
  if (b.dataset.k === 'hq') { b.classList.toggle('on', !hq); setHQ(!hq); return; }
  for (const o of document.querySelectorAll(`[data-k="${b.dataset.k}"]`)) o.classList.toggle('on', o === b);
  if (b.dataset.k === 'cam') setCam(b.dataset.v); else setSky(b.dataset.v);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 70 : 55; // 세로 화면은 넓게
  camera.updateProjectionMatrix();
  composer?.setSize(w, h);
}
addEventListener('resize', resize); resize();

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  for (const f of anim) f(t);
  controls.update();
  bubbleFrame();
  if (hq && composer) composer.render(); else renderer.render(scene, camera);
});
// 🥖 빵집을 누르면 김제빵이 말함 (사용자 요청 11/25): 보통은 '이번엔 ○○을 만들어 볼까나...'(2대2 김제빵 내보내기와 같은 말), 10%는 재밌는 대사
const bubble = document.createElement('div');
bubble.className = 'kim-bubble';
document.body.appendChild(bubble);
let bubbleT = -1, lastLine = '';
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const hitBakery = (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(bakery, true).length > 0;
};
function kimSays() {
  let line;
  do line = Math.random() < 0.1 ? '👨‍🍳 ' + KIM_FUNNY[(Math.random() * KIM_FUNNY.length) | 0] : '👨‍🍳 ' + breadLine((Math.random() * BREADS.length) | 0);
  while (line === lastLine);
  lastLine = line;
  bubble.textContent = line;
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  bubbleT = performance.now();
  popT = performance.now();
}
let downAt = null, popT = -1;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; // 끌기(화면 돌리기)는 클릭 아님
  if (hitBakery(e)) kimSays();
});
canvas.addEventListener('pointermove', (e) => { if (!e.buttons) canvas.style.cursor = hitBakery(e) ? 'pointer' : ''; });
const bubbleAt = new THREE.Vector3();
function bubbleFrame() {
  // 빵집이 '뽁' 커졌다 돌아옴
  const k = (performance.now() - popT) / 350;
  bakery.scale.setScalar(k >= 0 && k < 1 ? 1 + Math.sin(k * Math.PI) * 0.06 : 1);
  if (bubbleT < 0) return;
  const age = performance.now() - bubbleT;
  if (age > 3800) { bubble.classList.remove('pop'); bubbleT = -1; return; }
  bakery.getWorldPosition(bubbleAt); bubbleAt.y += 7.9;
  bubbleAt.project(camera);
  const r = canvas.getBoundingClientRect();
  bubble.style.left = `${r.left + ((bubbleAt.x + 1) / 2) * r.width}px`;
  bubble.style.top = `${Math.max(r.top + 90, r.top + ((1 - bubbleAt.y) / 2) * r.height)}px`; // 화면 위로 안 잘리게
  bubble.style.left = `${Math.min(r.right - 170, Math.max(r.left + 170, parseFloat(bubble.style.left)))}px`;
  bubble.style.visibility = bubbleAt.z < 1 ? 'visible' : 'hidden';
}
window.__campus = { kimSays, dolphins, setCam, setSky, setHQ, swapProps, camera, controls };
