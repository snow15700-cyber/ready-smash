// 물고기 모형 스타일 시안 (fish-models.html, fishing.md 9장). 한 캔버스에 칸마다 잘라 그림. 주소 ?t=2 = 시각 고정(스크린샷용)
import * as THREE from 'three';
import { STYLES, SAMPLE, makeModel } from './models.js';

const params = new URLSearchParams(location.search);
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);

const cells = [];
for (const [sid, st] of Object.entries(STYLES)) {
  const col = document.createElement('div'); col.className = 'col';
  col.innerHTML = `<h2>${st.name}</h2><div class="d">${st.desc}</div>`;
  grid.appendChild(col);
  for (const [fid, fname] of SAMPLE) {
    const el = document.createElement('div'); el.className = 'cell'; el.innerHTML = `<span>${fname}</span>`; col.appendChild(el);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb4d0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 4); scene.add(sun);
    const holder = new THREE.Group(), m = makeModel(fid, sid); holder.add(m); scene.add(holder);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0, 0.25, 2.1); cam.lookAt(0, 0.02, 0);
    const cell = { el, scene, holder, m, cam, yaw: -0.55, drag: null };
    el.addEventListener('pointerdown', (e) => { cell.drag = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (cell.drag != null) { cell.yaw += (e.clientX - cell.drag) * 0.012; cell.drag = e.clientX; } });
    el.addEventListener('pointerup', () => { cell.drag = null; });
    cells.push(cell);
  }
}
const wrap = canvas.parentElement;
function frame(ms) {
  const t = fixedT ?? ms / 1000;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  const wr = wrap.getBoundingClientRect();
  for (const c of cells) {
    const b = c.el.getBoundingClientRect(), x = b.left - wr.left, y = H - (b.bottom - wr.top);
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
