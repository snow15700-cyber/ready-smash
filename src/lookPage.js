// 물건 4개 새 모습 비교 페이지 (look.html, plaza.md 8장 '🎨 물건 4개 새 모습' ①)
// 참고 그림(docs/dev/ref) 옆에 같은 방향으로 본 게임 모형. 끌어서 돌려 보기 · 낮/밤. 주소 ?only=truck 하나만
import * as THREE from 'three';
import { bakery, foodTruck, fountain, vending } from './campusProps.js';
import truckRef from '../docs/dev/ref/foodtruck.jpg';
import bakeryRef from '../docs/dev/ref/bakery.jpg';
import fountainRef from '../docs/dev/ref/fountain.jpg';
import vendingRef from '../docs/dev/ref/vending.jpg';

await document.fonts.load('40px Jua').catch(() => {});
const only = new URLSearchParams(location.search).get('only');
// yaw = 카메라가 물건의 +z(앞)에서 +x 쪽으로 돈 각도 · el = 내려다보는 각도 · d = 거리 · ty = 보는 높이
const LIST = [
  { id: 'truck', name: '🚚 푸드트럭', ref: truckRef, make: (a) => foodTruck(a), yaw: -0.62, el: 0.55, d: 18.5, ty: 1.4 },
  { id: 'bakery', name: '🥖 빵집', ref: bakeryRef, make: (a) => bakery(a), yaw: 0.72, el: 0.5, d: 30, ty: 3.3 },
  { id: 'fountain', name: '⛲ 분수', ref: fountainRef, make: (a) => fountain(a), yaw: 0, el: 0.62, d: 27, ty: 0.9 },
  { id: 'vending', name: '🥤 자판기', ref: vendingRef, make: () => vending(), yaw: 0.5, el: 0.45, d: 8.5, ty: 1.05 },
].filter((o) => !only || o.id === only);

const rows = document.getElementById('rows'), views = [];
for (const o of LIST) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<h2>${o.name}</h2><div class="box"><img src="${o.ref}" alt=""><span>참고 그림</span></div><div class="box"><canvas></canvas><span>게임 모형</span></div>`;
  rows.appendChild(row);
  const canvas = row.querySelector('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xffffff);
  const hemi = new THREE.HemisphereLight(0xfffaf0, 0xd8d0c0, 1.6);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.9); sun.position.set(-8, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, far: 40 });
  scene.add(hemi, sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const anim = [], obj = o.make(anim); scene.add(obj);
  obj.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  const v = { o, r, scene, cam, anim, obj, hemi, sun, yaw: o.yaw, canvas };
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag == null) return; v.yaw -= (e.clientX - drag) * 0.01; drag = e.clientX; });
  canvas.addEventListener('pointerup', () => { drag = null; });
  views.push(v);
}
function setNight(n) {
  for (const v of views) {
    v.scene.background.set(n ? 0x1f2a48 : 0xffffff);
    v.hemi.intensity = n ? 0.55 : 1.6; v.sun.intensity = n ? 0.35 : 1.9;
    v.obj.traverse((m) => { for (const mt of [].concat(m.material || [])) if (mt.userData?.glow) mt.emissiveIntensity = mt.userData.glow[0] + (mt.userData.glow[1] - mt.userData.glow[0]) * n; });
  }
}
document.getElementById('bar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of document.querySelectorAll('#bar button')) x.classList.toggle('on', x === b);
  setNight(b.dataset.sky === 'night' ? 1 : 0);
});
function frame(ms) {
  const t = ms / 1000;
  for (const v of views) {
    const w = v.canvas.clientWidth, h = v.canvas.clientHeight;
    if (v.canvas.width !== Math.round(w * v.r.getPixelRatio())) { v.r.setSize(w, h, false); v.cam.aspect = w / h; v.cam.updateProjectionMatrix(); }
    for (const f of v.anim) f(t);
    const { d, el, ty } = v.o;
    v.cam.position.set(Math.sin(v.yaw) * Math.cos(el) * d, ty + Math.sin(el) * d, Math.cos(v.yaw) * Math.cos(el) * d);
    v.cam.lookAt(0, ty, 0);
    v.r.render(v.scene, v.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__look = { views, setNight };
