// 물고기·잡동사니 모형 시안 (fish-models.html, fishing.md 9장). 한 캔버스에 칸마다 잘라 그림. 주소 ?t=2 = 시각 고정(스크린샷용)
import * as THREE from 'three';
import { FISH_LIST, JUNK_LIST, makeModel } from './models.js';

const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);

const cells = [];
const section = (title, sub) => { if (only) return; const h = document.createElement('h2'); h.className = 'sec'; h.innerHTML = `${title} <small>${sub}</small>`; grid.appendChild(h); };
function cell(id, name, kind) {
  if (only && !only.includes(id)) return;
  const el = document.createElement('div'); el.className = 'cell ' + kind; el.innerHTML = `<span>${name}</span>`; grid.appendChild(el);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb4d0, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 4); scene.add(sun);
  const holder = new THREE.Group(), m = makeModel(id); holder.add(m); scene.add(holder);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0, 0.25, 2.2); cam.lookAt(0, 0.03, 0);
  const c = { el, scene, holder, m, cam, yaw: kind === 'junk' || m.userData.faceZ ? 0 : -0.55, drag: null };
  el.addEventListener('pointerdown', (e) => { c.drag = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (c.drag != null) { c.yaw += (e.clientX - c.drag) * 0.012; c.drag = e.clientX; } });
  el.addEventListener('pointerup', () => { c.drag = null; });
  cells.push(c);
}
const LABEL = { common: ['🐟 일반', '7종'], rare: ['💎 희귀', '5종 + 조건 3종(☕ 쉬는 시간 · 🌙 밤 · 🌧️ 비)'], legend: ['🌟 전설', '2종'] };
for (const g of ['common', 'rare', 'legend']) { section(...LABEL[g]); for (const [id, name, gr] of FISH_LIST) if (gr === g) cell(id, name, g); }
section('🥾 잡동사니', '9개 · 코인 0 · 도감용');
for (const [id, name] of JUNK_LIST) cell(id, name, 'junk');

const wrap = canvas.parentElement;
function frame(ms) {
  const t = fixedT ?? ms / 1000;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  const wr = wrap.getBoundingClientRect();
  for (const c of cells) {
    const b = c.el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue; // 화면 밖 칸은 안 그림
    const x = b.left - wr.left, y = H - (b.bottom - wr.top);
    r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
    c.cam.aspect = b.width / b.height; c.cam.updateProjectionMatrix();
    c.holder.rotation.y = c.yaw + (c.drag == null && fixedT == null ? Math.sin(t * 0.6) * 0.35 : 0);
    c.holder.position.y = Math.sin(t * 1.8) * 0.02;
    c.m.userData.anim(t);
    r.render(c.scene, c.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__models = { cells };
