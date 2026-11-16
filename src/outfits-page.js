// 몸 꾸미기 시안 보기 (outfits.html): 저장·구매 없음. 큰 화면 = 살아 있는 캐릭터, 오른쪽 = 전체 목록 그림
import * as THREE from 'three';
import { makeCharacter } from './scene.js';
import { OUTFITS, makeOutfit } from './outfits.js';
import { armPose } from './game.js';

const GRADE = { common: '일반', rare: '고급', legend: '전설' };
const params = new URLSearchParams(location.search);

function stage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#efe3cc');
  scene.add(new THREE.HemisphereLight('#fff7ea', '#b98f62', 1.6));
  const sun = new THREE.DirectionalLight('#fff1dc', 1.6);
  sun.position.set(-2, 5, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.06, 48), new THREE.MeshLambertMaterial({ color: '#d9a86a' }));
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  scene.add(floor);
  const char = makeCharacter('#e0333c');
  scene.add(char.group);
  return { scene, char };
}
function renderer(canvas, w, h) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  if (w) r.setSize(w, h, false);
  return r;
}

await document.fonts.load('20px Jua');

// ── 큰 화면 ──
const canvas = document.getElementById('c');
const big = renderer(canvas);
const live = stage();
const cam = new THREE.PerspectiveCamera(36, 1, 0.02, 50);
let yaw = params.has('yaw') ? Number(params.get('yaw')) : Math.PI + 0.5, drag = null, auto = !params.has('yaw');
canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; auto = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (drag != null) { yaw -= (e.clientX - drag) * 0.01; drag = e.clientX; } });
canvas.addEventListener('pointerup', () => { drag = null; });
let cur = null;
function wear(id) {
  cur = OUTFITS.find((o) => o.id === id) || { id, name: id, grade: 'rare' };
  live.char.setOutfit(makeOutfit(id, live.char));
  document.getElementById('nm').textContent = cur.name;
  const gd = document.getElementById('gd');
  gd.textContent = GRADE[cur.grade]; gd.className = 'badge ' + cur.grade;
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.id === id));
  history.replaceState(null, '', '?id=' + id + (params.has('t') ? '&t=' + params.get('t') : ''));
}
let last = performance.now() / 1000, nextSwing = 0.8;
const t0 = last;
function loop() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const t = params.has('t') ? Number(params.get('t')) + (now - t0) : now - t0;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * big.getPixelRatio())) { big.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  if (auto) yaw += dt * 0.35;
  cam.position.set(Math.sin(yaw) * 2.3, 1.05, Math.cos(yaw) * 2.3);
  cam.lookAt(0, 0.62, 0);
  // 좌우로 살짝 움직이며 스윙
  live.char.group.position.x = Math.sin(t * 1.3) * 0.25;
  nextSwing -= dt;
  if (nextSwing <= 0) { live.char.swingT = performance.now() / 1000; nextSwing = 1.6; }
  armPose(live.char, now, 1, 0.98);
  live.char.tickOutfit(t, dt);
  big.render(live.scene, cam);
  requestAnimationFrame(loop);
}

// ── 목록 그림 (한 장씩 찍어서 이미지로) ──
const thumbR = renderer(document.createElement('canvas'), 240, 300);
const ts = stage();
const tcam = new THREE.PerspectiveCamera(34, 240 / 300, 0.02, 50);
function thumb(id, back) {
  ts.char.setOutfit(makeOutfit(id, ts.char));
  ts.char.arm.rotation.set(0, -0.35, 0);
  for (let i = 0; i < 20; i++) ts.char.tickOutfit(1 + i / 30, 1 / 30);
  const a = back ? 0.6 : Math.PI + 0.55;
  tcam.position.set(Math.sin(a) * 2.7, 1.15, Math.cos(a) * 2.7);
  tcam.lookAt(0, 0.68, 0);
  thumbR.render(ts.scene, tcam);
  return thumbR.domElement.toDataURL();
}
const list = document.getElementById('list');
const back = params.get('back') === '1';
for (const g of ['common', 'rare', 'legend']) {
  const items = OUTFITS.filter((o) => o.grade === g);
  list.insertAdjacentHTML('beforeend', `<h2><span class="badge ${g}">${GRADE[g]}</span> ${items.length}종</h2><div class="grid" id="g-${g}"></div>`);
  const grid = document.getElementById('g-' + g);
  for (const o of items) {
    const d = document.createElement('div');
    d.className = 'card g-' + g;
    d.dataset.id = o.id;
    d.innerHTML = `<img src="${thumb(o.id, back)}" alt=""><div class="n">${o.name}</div>`;
    d.onclick = () => { wear(o.id); auto = true; };
    grid.appendChild(d);
  }
}
document.body.dataset.ready = '1';
wear(params.get('id') || 'cape');
loop();
