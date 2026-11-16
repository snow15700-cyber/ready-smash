// 아이템 구경 화면 (items.html): 캐릭터에 아이템을 입혀 돌려 본다. 저장·구매 없음
import * as THREE from 'three';
import { makeCharacter } from './scene.js';
import { CATS, ITEMS, DEFAULT_LOOK, applyLook, createBallFx, makePaddle } from './items.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe3cc');
const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 50);

scene.add(new THREE.HemisphereLight('#fff7ea', '#b98f62', 1.7));
const sun = new THREE.DirectionalLight('#fff1dc', 1.5);
sun.position.set(-2, 5, -4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// 바닥 원판 (나무색)
const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.06, 48), new THREE.MeshLambertMaterial({ color: '#d9a86a' }));
floor.position.y = -0.03;
floor.receiveShadow = true;
scene.add(floor);

const turn = new THREE.Group();
scene.add(turn);
const char = makeCharacter('#e0333c');
turn.add(char.group);

// 탁구채 크게 보기 (탁구채 탭에서만)
const showcase = new THREE.Group();
showcase.position.set(0.62, 0.95, -0.1);
showcase.scale.setScalar(2.6);
scene.add(showcase);

// 공 크게 보기 (탁구공 탭에서만, 실제의 2배)
const ballRoot = new THREE.Group();
ballRoot.scale.setScalar(2);
scene.add(ballRoot);

let look = { ...DEFAULT_LOOK };
let tab = 'top';
let fx = null;

const VIEWS = {
  body: { pos: [0.35, 0.9, -2.1], look: [0, 0.62, 0] },
  shoes: { pos: [0.3, 0.45, -1.25], look: [0, 0.2, 0] },
  hat: { pos: [0.35, 1.45, -0.95], look: [0, 1.22, 0] },
  paddle: { pos: [0.55, 1.15, -2.0], look: [0.32, 0.9, 0] },
  ball: { pos: [0.3, 1.25, -2.3], look: [0, 0.95, 0] },
};
const viewOf = (t) => (VIEWS[t] ? t : 'body');
const camPos = new THREE.Vector3(...VIEWS.body.pos), camLook = new THREE.Vector3(...VIEWS.body.look);

function refresh() {
  applyLook(char, look);
  showcase.clear();
  const big = makePaddle(look.paddle);
  showcase.add(big);
  if (fx) fx.dispose();
  fx = createBallFx(look.ball, ballRoot);
  drawUI();
}

const tabsEl = document.getElementById('tabs');
const listEl = document.getElementById('list');
const nowEl = document.getElementById('now');
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

function drawUI() {
  tabsEl.innerHTML = '';
  for (const c of CATS) {
    const b = document.createElement('button');
    b.textContent = `${c.icon} ${c.name}`;
    b.className = c.id === tab ? 'on' : '';
    b.onclick = () => { tab = c.id; drawUI(); };
    tabsEl.appendChild(b);
  }
  listEl.innerHTML = '';
  for (const it of ITEMS.filter((i) => i.cat === tab)) {
    const b = document.createElement('button');
    b.className = 'card' + (look[tab] === it.id ? ' on' : '');
    b.innerHTML = `<span class="ic">${it.icon}</span><span class="nm">${it.name}</span><span class="pr ${it.price ? '' : 'free'}">${it.price ? '🪙 ' + it.price.toLocaleString() : '기본 지급'}</span>`;
    b.onclick = () => { look[tab] = it.id; refresh(); };
    listEl.appendChild(b);
  }
  nowEl.innerHTML = CATS.map((c) => `${c.icon} ${byId[look[c.id]].name}`).join(' · ');
}

document.getElementById('rand').onclick = () => {
  for (const c of CATS) {
    const list = ITEMS.filter((i) => i.cat === c.id);
    look[c.id] = list[Math.floor(Math.random() * list.length)].id;
  }
  refresh();
};
document.getElementById('reset').onclick = () => { look = { ...DEFAULT_LOOK }; refresh(); };

// 드래그로 돌리기
let rotY = -0.25, dragging = false, lastX = 0, idle = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; rotY += (e.clientX - lastX) * 0.01; lastX = e.clientX; idle = 0; });
canvas.addEventListener('pointerup', () => { dragging = false; canvas.style.cursor = 'grab'; });

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let t = 0, prev = performance.now();
const ballPos = new THREE.Vector3();
let autoSpin = true;
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  t += dt;
  idle += dt;
  if (autoSpin && !dragging && idle > 2) rotY += dt * 0.5;
  turn.rotation.y = rotY;
  showcase.visible = tab === 'paddle';
  showcase.rotation.y = Math.sin(t * 0.9) * 0.9 + Math.PI;
  const v = VIEWS[viewOf(tab)];
  const k = 1 - Math.exp(-dt * 6);
  camPos.lerp(new THREE.Vector3(...v.pos), k);
  camLook.lerp(new THREE.Vector3(...v.look), k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // 공: 캐릭터 앞에서 좌우로 통통 튀며 오간다 (ballRoot가 2배라 좌표는 절반)
  if (fx) {
    const ph = (t * 0.55) % 2, s = ph < 1 ? ph : 2 - ph;
    const x = (s - 0.5) * 0.4;
    const y = 0.42 + Math.abs(Math.sin(s * Math.PI * 2)) * 0.12;
    ballPos.set(x, y, -0.35);
    fx.update(ballPos, dt, camera, tab === 'ball');
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// 디버그·스크린샷용
window.__items = {
  set(l) { look = { ...look, ...l }; refresh(); },
  tab(t2) { tab = t2; drawUI(); },
  rot(r) { rotY = r; idle = -1e9; },
  spin(on) { autoSpin = on; },
};

resize();
(document.fonts ? document.fonts.load('40px Jua').catch(() => {}) : Promise.resolve()).then(() => {
  refresh();
  requestAnimationFrame(frame);
});
