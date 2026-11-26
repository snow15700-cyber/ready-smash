// 고양이 모형 시안 (cats.html, docs/dev/cats.md 2단계). 한 캔버스에 칸마다 잘라 그림. 주소 ?t=2 = 시각 고정(스크린샷용)
import * as THREE from 'three';
import { CAT_IDS, COATS, makeCat } from './models.js';

const params = new URLSearchParams(location.search);
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);

const cells = [];
const section = (title, sub) => { const h = document.createElement('h2'); h.className = 'sec'; h.innerHTML = `${title} <small>${sub}</small>`; grid.appendChild(h); };
function cell(id, pose, label, sub, kind = '') {
  const el = document.createElement('div'); el.className = 'cell ' + kind; el.innerHTML = `<span>${label}</span><small>${sub}</small>`; grid.appendChild(el);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd0a0b4, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 4); scene.add(sun);
  const holder = new THREE.Group(), m = makeCat(id); holder.add(m); scene.add(holder);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0, 0.7, 2.2); cam.lookAt(0, 0.36, 0);
  const c = { el, scene, holder, m, cam, pose, yaw: pose === 'walk' ? -1.0 : -0.45, drag: null };
  el.addEventListener('pointerdown', (e) => { c.drag = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (c.drag != null) { c.yaw += (e.clientX - c.drag) * 0.012; c.drag = e.clientX; } });
  el.addEventListener('pointerup', () => { c.drag = null; });
  cells.push(c);
}
section('🐾 6마리', '모두 같은 모양 · 털 무늬·눈 색·몸짓만 다름 (앉은 자세)');
for (const id of CAT_IDS) cell(id, 'sit', COATS[id].name, COATS[id].note);
section('🎬 자세', '치즈로 보기 · 실제로는 6마리 모두 같은 자세');
for (const [pose, name, sub] of [['walk', '걷기', '배회 · 따라오기'], ['nod', '고개 까딱', '♥2 낚시 옆 · 리듬에 맞춰'], ['loaf', '식빵 굽기', '쉬는 중'], ['belly', '배 보이고 zzz', '오늘 3마리 다 먹으면'], ['stand', '서서 두리번', '♡0 어슬렁']]) cell('cheese', pose, name, sub, 'pose');

const wrap = canvas.parentElement;
function frame(ms) {
  const t = fixedT ?? ms / 1000;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  const wr = wrap.getBoundingClientRect();
  for (const c of cells) {
    const b = c.el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue;
    const x = b.left - wr.left, y = H - (b.bottom - wr.top);
    r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
    c.cam.aspect = b.width / b.height; c.cam.updateProjectionMatrix();
    c.holder.rotation.y = c.yaw + (c.drag == null && fixedT == null ? Math.sin(t * 0.5) * 0.3 : 0);
    c.m.userData.anim(t, c.pose);
    r.render(c.scene, c.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__cats = { cells };
