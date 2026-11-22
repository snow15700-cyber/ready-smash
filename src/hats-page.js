// 머리 꾸미기 시안 보기 (hats.html): 저장·구매 없음. 큰 화면 = 살아 있는 캐릭터, 오른쪽 = 전체 목록 그림
// 주소 옵션: ?id=cap&face=heart&body=chick (id·face = none이면 없음)&yaw=3.6&t=2 (각도·시각 고정), &op=0.38 (경기 중 내 캐릭터처럼 반투명)
import * as THREE from 'three';
import { makeCharacter } from './scene.js';
import { OUTFITS, makeOutfit } from './outfits.js';
import { HATS, makeHat } from './hats.js';
import { FACE_LIST, makeFace } from './faces.js';
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
const cam = new THREE.PerspectiveCamera(34, 1, 0.02, 50);
let yaw = params.has('yaw') ? Number(params.get('yaw')) : Math.PI + 0.5, drag = null, auto = !params.has('yaw');
let zoom = params.get('zoom') === '0' ? 0 : 1; // 1 = 머리 가까이
canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; auto = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (drag != null) { yaw -= (e.clientX - drag) * 0.01; drag = e.clientX; } });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('dblclick', () => { zoom = 1 - zoom; });
let cur = null, curFace = null, body = params.get('body') || '';
const NONE = { id: 'none', name: '없음', grade: 'common' };
function url() {
  const q = new URLSearchParams({ id: cur.id, face: curFace?.id || 'none' });
  if (body) q.set('body', body);
  for (const k of ['t', 'op', 'yaw', 'zoom']) if (params.has(k)) q.set(k, params.get(k));
  history.replaceState(null, '', '?' + q);
}
function caption() {
  const parts = [cur, curFace].filter((o) => o && o.id !== 'none');
  document.getElementById('nm').textContent = parts.map((o) => o.name).join(' + ') || '아무것도 안 씀';
  const top = ['legend', 'rare', 'common'].find((gr) => parts.some((o) => o.grade === gr)) || '';
  const gd = document.getElementById('gd');
  gd.textContent = top ? GRADE[top] : ''; gd.className = 'badge ' + top;
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.id === (c.dataset.kind === 'face' ? curFace?.id : cur.id)));
  url();
}
function wear(id) {
  cur = HATS.find((o) => o.id === id) || NONE;
  live.char.setHat(cur.id === 'none' ? null : makeHat(cur.id, live.char));
  if (params.has('op')) live.char.setOpacity(Number(params.get('op')), 0.9);
  caption();
}
function wearFace(id) {
  curFace = FACE_LIST.find((o) => o.id === id) || NONE;
  live.char.setFace(curFace.id === 'none' ? null : makeFace(curFace.id));
  if (params.has('op')) live.char.setOpacity(Number(params.get('op')), 0.9);
  caption();
}
function dress(id) {
  body = id;
  live.char.setOutfit(id ? makeOutfit(id, live.char) : null);
  if (params.has('op')) live.char.setOpacity(Number(params.get('op')), 0.9);
  document.querySelectorAll('.bodies button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  if (cur) url();
}
// 전설 효과 시험: 경기 반응 버튼 (게임에서는 3단계에서 연결)
let rally = 0;
const reacts = document.getElementById('reacts');
const fire = (kind) => {
  if (kind === 'rally') { rally++; live.char.react('rally', rally); }
  else { if (kind === 'end' || kind === 'miss' || kind === 'score') rally = 0; live.char.react(kind, rally); if (kind === 'score' || kind === 'miss') live.char.react('end', 0); }
  const b = reacts.querySelector('[data-k="rally"]');
  b.textContent = `🔁 랠리 +1 (${rally})`;
};
for (const [k, label] of [['perfect', '⭐ 퍼펙트'], ['smash', '💥 스매시'], ['score', '🏓 내 득점'], ['miss', '😵 실점'], ['rally', '🔁 랠리 +1 (0)'], ['end', '⏹ 랠리 끝']]) {
  const b = document.createElement('button');
  b.dataset.k = k;
  b.textContent = label;
  b.onclick = () => fire(k);
  reacts.appendChild(b);
}
// 몸 고르기 (같이 입어 보기)
const bodies = document.getElementById('bodies');
for (const o of [{ id: '', name: '흰 몸' }, ...OUTFITS]) {
  const b = document.createElement('button');
  b.dataset.id = o.id;
  b.textContent = o.name;
  b.onclick = () => dress(o.id);
  bodies.appendChild(b);
}
let last = performance.now() / 1000, nextSwing = 0.8;
const t0 = last;
function loop() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const t = params.has('t') ? Number(params.get('t')) + (now - t0) : now - t0;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * big.getPixelRatio()) || canvas.height !== Math.round(h * big.getPixelRatio())) { big.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  if (auto) yaw += dt * 0.35;
  const d = zoom ? 1.15 : 2.3, ly = zoom ? 1.2 : 0.66;
  cam.position.set(Math.sin(yaw) * d, ly + (zoom ? 0.18 : 0.25), Math.cos(yaw) * d);
  cam.lookAt(0, ly, 0);
  if (!params.has('t')) {
    live.char.group.position.x = Math.sin(t * 1.3) * (zoom ? 0.06 : 0.25);
    nextSwing -= dt;
    if (nextSwing <= 0) { live.char.swingT = performance.now() / 1000; nextSwing = 1.6; }
  }
  armPose(live.char, now, 1, 0.98);
  live.char.tickOutfit(t, dt);
  big.render(live.scene, cam);
  requestAnimationFrame(loop);
}

// ── 목록 그림 (머리 가까이, 비스듬히 앞에서 / 얼굴은 정면) ──
const thumbR = renderer(document.createElement('canvas'), 240, 240);
const ts = stage();
const tcam = new THREE.PerspectiveCamera(30, 1, 0.02, 50);
function thumb(id, back) {
  ts.char.setHat(id === 'none' ? null : makeHat(id, ts.char));
  ts.char.setFace(null);
  ts.char.arm.rotation.set(0, -0.35, 0);
  for (let i = 0; i < 20; i++) ts.char.tickOutfit(1 + i / 30, 1 / 30);
  const a = back ? 0.6 : Math.PI + 0.45;
  tcam.position.set(Math.sin(a) * 1.25, 1.45, Math.cos(a) * 1.25);
  tcam.lookAt(0, 1.2, 0);
  thumbR.render(ts.scene, tcam);
  return thumbR.domElement.toDataURL();
}
function faceThumb(id) {
  ts.char.setHat(null);
  ts.char.setFace(id === 'none' ? null : makeFace(id));
  ts.char.arm.rotation.set(0, -0.35, 0);
  const a = Math.PI + 0.2;
  tcam.position.set(Math.sin(a) * 0.9, 1.25, Math.cos(a) * 0.9);
  tcam.lookAt(0, 1.17, 0);
  thumbR.render(ts.scene, tcam);
  return thumbR.domElement.toDataURL();
}
const list = document.getElementById('list');
const back = params.get('back') === '1';
function section(title, kind, all, shot, pick) {
  list.insertAdjacentHTML('beforeend', `<h1 class="sec">${title}</h1>`);
  for (const g of ['common', 'rare', 'legend']) {
    const items = all.filter((o) => o.grade === g);
    if (!items.length) continue;
    list.insertAdjacentHTML('beforeend', `<h2><span class="badge ${g}">${GRADE[g]}</span> ${items.length}종</h2><div class="grid" id="g-${kind}-${g}"></div>`);
    const grid = document.getElementById(`g-${kind}-${g}`);
    for (const o of g === 'common' ? [NONE, ...items] : items) {
      const d = document.createElement('div');
      d.className = 'card g-' + g;
      d.dataset.id = o.id;
      d.dataset.kind = kind;
      d.innerHTML = `<img src="${shot(o.id)}" alt=""><div class="n">${o.name}</div>`;
      d.onclick = () => { pick(o.id); auto = true; };
      grid.appendChild(d);
    }
  }
}
section('🎩 머리', 'hat', HATS, (id) => thumb(id, back), wear);
section('👀 얼굴 (그리기)', 'face', FACE_LIST, faceThumb, wearFace);
list.insertAdjacentHTML('beforeend', '<p class="hint">전설은 왼쪽 위 버튼(퍼펙트·스매시·득점·실점·랠리)으로 효과를 시험해 보세요.</p>');
dress(body);
wear(params.get('id') || 'band');
wearFace(params.get('face') || 'none');
document.body.dataset.ready = '1';
loop();
// 점검·스크린샷용
window.__hats = { wear, wearFace, dress, fire, view(y, z = 1) { yaw = y; auto = false; zoom = z; } };
