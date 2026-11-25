// 광장 새 디자인 시안 페이지 (campus.html) — 카메라 자리 몇 개 + 낮·노을·밤 + 끌어서 돌려 보기
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
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
let curSky = 'day';
function setSky(k) {
  const s = SKY[k]; curSky = k;
  scene.background = new THREE.Color(s.bg);
  scene.fog = new THREE.Fog(s.fog, 60, 260);
  hemi.color.set(s.hemi[0]); hemi.intensity = s.hemi[1] * (hq ? 0.6 : 1);
  sun.color.set(s.sun[0]); sun.intensity = s.sun[1] * (hq ? 1.1 : 1);
}
setSky('day');

const CAMS = {
  spawn: { pos: [0, 5.2, 18.5], look: [0, 4.2, -4] }, // 광장 3인칭(처음 서는 곳 뒤)
  shops: { pos: [0, 3.2, 8], look: [0, 3.5, -6] },
  top: { pos: [0, 66, 54], look: [0, 0, 4] },
  south: { pos: [-2, 4.5, 26], look: [14, -4, 60] }, // 바다 전망대 쪽을 바라봄
  building: { pos: [-19, 1.8, -5], look: [-6, 9, -26] }, // 필로티 아래로 뒤쪽 산
};
function setCam(k) {
  const c = CAMS[k];
  camera.position.set(...c.pos); controls.target.set(...c.look); controls.update();
}
setCam(new URLSearchParams(location.search).get('cam') || 'spawn');
const q = new URLSearchParams(location.search).get('sky');
if (q && SKY[q]) setSky(q);
if (new URLSearchParams(location.search).get('hq') === '1') { setHQ(true); document.querySelector('[data-k="hq"]')?.classList.add('on'); }

document.getElementById('bar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
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
window.__campus = { setCam, setSky, setHQ, camera, controls };
