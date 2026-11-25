// 광장 새 디자인 시안 페이지 (campus.html) — 카메라 자리 몇 개 + 낮·노을·밤 + 끌어서 돌려 보기
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCampus } from './campusMock.js';

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

const { root, anim } = buildCampus();
scene.add(root);

// ✨ 고화질 비교 (사용자 질문 '도형 + 찰흙 느낌을 벗어나려면?' — 코드만으로 할 수 있는 것 몇 가지를 켜고 끄기)
//  ① 영화 같은 색 보정(ACES 톤 매핑) ② 주변 반사(유리·금속에 하늘·빛이 비침) ③ 구석 그늘(GTAO: 물건이 맞닿은 곳·틈이 어두워져 입체감)
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
let composer = null, hq = false;
function setHQ(on) {
  hq = on;
  renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 0.9;
  scene.environment = on ? envTex : null;
  scene.environmentIntensity = 0.3;
  hemi.intensity = SKY[curSky].hemi[1] * (on ? 0.6 : 1);
  sun.intensity = SKY[curSky].sun[1] * (on ? 1.1 : 1);
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
// 모델: Quaternius (CC0, public/models/campus/CREDITS.md). 각 소품 자리(userData.prop)에 크기를 맞춘 모델을 넣고, 지금 모양과 켜고 끔
const MODELS = {
  tree: { files: ['PineTree_1', 'PineTree_3', 'PineTree_1', 'CommonTree_1', 'CommonTree_3'], h: 4.6, lift: 0.1 },
  lamp: { files: ['Streetlight_Single'], h: 4.4 },
  bench: { files: ['Bench_1'], w: 1.8 },
  bush: { files: ['Bush_1'], h: 0.9, lift: 0.1 },
  flower: { files: ['Flowers'], h: 0.75 },
  trash: { files: ['Trashcan_Green'], h: 1.0 },
};
const glbCache = {};
const loader = new GLTFLoader();
async function loadModel(name) {
  if (!glbCache[name]) glbCache[name] = loader.loadAsync(`/models/campus/${name}.glb`).then((g) => g.scene);
  return glbCache[name];
}
let propsOn = false;
async function swapProps(on) {
  propsOn = on;
  const spots = [];
  root.traverse((o) => { if (o.userData.prop && MODELS[o.userData.prop]) spots.push(o); });
  for (const o of spots) {
    if (on && !o.userData.alt) {
      const def = MODELS[o.userData.prop];
      const file = def.files[Math.floor((o.userData.seed ?? 0) * def.files.length) % def.files.length];
      const src = await loadModel(file);
      const m = src.clone(true);
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
      const k = def.w ? def.w / Math.max(size.x, size.z) : def.h / size.y;
      m.scale.setScalar(k);
      m.position.y = -box.min.y * k;
      m.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true; c.receiveShadow = true;
        // 이 모델들은 금속 재질로 들어와서 반사할 것이 없으면 거의 검게 보임 → 다른 물건과 같은 무광으로
        for (const mt of [].concat(c.material)) {
          mt.metalness = 0; mt.roughness = Math.max(0.7, mt.roughness ?? 1);
          if (def.lift && !mt.userData.lifted) { mt.userData.lifted = true; mt.color.offsetHSL(0, 0.08, def.lift); } // 나무·덤불 색이 어두워서 살짝 밝힘 (복사본끼리 재질을 같이 써서 한 번만)
        }
      });
      const alt = new THREE.Group(); alt.add(m); alt.userData.isAlt = true;
      o.userData.alt = alt; o.add(alt);
    }
    for (const c of o.children) c.visible = c.userData.isAlt ? on : !on;
  }
}

let curSky = 'day';
function setSky(k) {
  const s = SKY[k]; curSky = k;
  scene.background = new THREE.Color(s.bg);
  scene.fog = new THREE.Fog(s.fog, 60, 260);
  hemi.color.set(s.hemi[0]); hemi.intensity = s.hemi[1] * (hq ? 0.6 : 1);
  sun.color.set(s.sun[0]); sun.intensity = s.sun[1] * (hq ? 1.1 : 1);
  const night = k === 'night' ? 1 : k === 'sunset' ? 0.35 : 0;
  root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.userData?.glow) m.emissiveIntensity = m.userData.glow[0] + (m.userData.glow[1] - m.userData.glow[0]) * night; });
}
setSky('day');

const CAMS = {
  spawn: { pos: [0, 5.2, 18.5], look: [0, 4.2, -4] }, // 광장 3인칭(처음 서는 곳 뒤)
  shops: { pos: [0, 3.2, 8], look: [0, 3.5, -6] },
  top: { pos: [0, 66, 54], look: [0, 0, 4] },
  south: { pos: [-2, 4.5, 26], look: [14, -4, 60] }, // 바다 전망대 쪽을 바라봄
  hall: { pos: [24, 22, 14], look: [-2, 14, -22] }, // 본관을 비스듬히 위에서
  gacha: { pos: [-1.8, 2.4, 0.9], look: [-7.1, 2.8, -3.5] }, // 가게 가까이
  closet: { pos: [0, 2.4, 0.2], look: [0, 3.2, -7] },
  fame: { pos: [1.8, 2.4, 0.9], look: [7.1, 3.0, -3.5] },
  edge: { pos: [-10, 3.4, 4], look: [-21, 1.8, 16] }, // 서쪽 가장자리 (나무·가로등·벤치·잔디밭)
  building: { pos: [-15, 1.7, -4], look: [-5, 11, -24] }, // 필로티 아래로 뒤쪽 산
};
function setCam(k) {
  const c = CAMS[k];
  camera.position.set(...c.pos); controls.target.set(...c.look); controls.update();
}
setCam(new URLSearchParams(location.search).get('cam') || 'spawn');
const q = new URLSearchParams(location.search).get('sky');
if (q && SKY[q]) setSky(q);
// 무료 소품은 기본으로 켬 (사용자 확정 11/25: 다 쓰기), ?props=0이면 끔
if (new URLSearchParams(location.search).get('props') !== '0') { swapProps(true); document.querySelector('[data-k="props"]')?.classList.add('on'); }
if (new URLSearchParams(location.search).get('hq') === '1') { setHQ(true); document.querySelector('[data-k="hq"]')?.classList.add('on'); }

document.getElementById('bar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
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
  if (hq && composer) composer.render(); else renderer.render(scene, camera);
});
window.__campus = { setCam, setSky, setHQ, swapProps, camera, controls };
