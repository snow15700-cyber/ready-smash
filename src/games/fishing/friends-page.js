// 박자 친구들 시안 (beat-friends.html, fishing.md 13-3). 한 캔버스에 칸마다 잘라 그림 (fish-models.html과 같은 방식).
// 장르마다 따로 박자를 흘려 보냄(GENRES 빠르기). 주소: ?t=2 시각 고정 · ?idle=1 쉬는 동작 · ?stage=1 희귀 단계 빠르기
import * as THREE from 'three';
import { FRIENDS, makeFriend } from './friends.js';
import { GENRES } from './data.js';
import { GENRE_LABEL } from './rules.js';

const params = new URLSearchParams(location.search);
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c'), bar = document.getElementById('bar');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);

const opt = { on: params.get('idle') !== '1', stage: Number(params.get('stage') || 0), auto: true, sound: null };
const beats = {}; // 장르마다 { on, pulse, accent, n, phase, side, spb, hit }
const dots = {};
const cells = [];
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };

for (const genre of ['ballad', 'jazz', 'rock']) {
  beats[genre] = { on: true, pulse: 0, accent: false, n: -1, phase: 0, side: 1, spb: 0.6, hit: 0 };
  const h = document.createElement('h2'); h.className = 'sec';
  h.innerHTML = `<i class="dot"></i>${GENRE_LABEL[genre]} 자리 <small class="bpm"></small>`;
  grid.appendChild(h); dots[genre] = { dot: h.querySelector('.dot'), bpm: h.querySelector('.bpm') };
  for (const [id, name, note] of FRIENDS[genre]) {
    const el = document.createElement('div'); el.className = 'cell ' + genre; grid.appendChild(el);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb4d0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 4); scene.add(sun);
    const holder = new THREE.Group(), m = makeFriend(id); holder.add(m); scene.add(holder);
    el.innerHTML = `<span>${name}</span><small>${note}</small><em>삼각형 ${tris(m).toLocaleString()}</em>`;
    const v = m.userData.view, cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    cam.position.set(0, v.y, v.dist); cam.lookAt(0, v.look, 0);
    const c = { el, scene, holder, m, cam, genre, yaw: -0.35, drag: null };
    el.addEventListener('pointerdown', (e) => { c.drag = e.clientX; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (c.drag != null) { c.yaw += (e.clientX - c.drag) * 0.012; c.drag = e.clientX; } });
    el.addEventListener('pointerup', () => { c.drag = null; });
    cells.push(c);
  }
}

// 위 단추들
function btn(label, on, fn, cls = '') { const b = document.createElement('button'); b.textContent = label; b.className = cls + (on ? ' on' : ''); b.onclick = () => fn(b); bar.appendChild(b); return b; }
const modeB = [btn('🎵 낚시 중 (박자)', opt.on, () => setMode(true)), btn('😴 쉬는 동작', !opt.on, () => setMode(false))];
function setMode(on) { opt.on = on; modeB[0].classList.toggle('on', on); modeB[1].classList.toggle('on', !on); }
const stB = ['일반', '희귀', '전설'].map((s, i) => btn(s + ' 빠르기', i === opt.stage, () => { opt.stage = i; stB.forEach((b, k) => b.classList.toggle('on', k === i)); }));
const autoB = btn('🤖 자동으로 다 맞춤', opt.auto, () => { opt.auto = !opt.auto; autoB.classList.toggle('on', opt.auto); });
btn('👏 맞췄다!', false, () => hit(), 'hit');
const sndB = ['ballad', 'jazz', 'rock'].map((g) => btn('🔊 ' + GENRE_LABEL[g].split(' ')[0], false, () => { opt.sound = opt.sound === g ? null : g; sndB.forEach((b, k) => b.classList.toggle('on', ['ballad', 'jazz', 'rock'][k] === opt.sound)); ac(); }));
function hit() { for (const B of Object.values(beats)) B.hit = 1; }
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); hit(); } });

// 박 소리 (고른 장르 하나만): 첫 박은 높게
let AC = null;
const ac = () => { AC ||= new AudioContext(); if (AC.state === 'suspended') AC.resume(); return AC; };
function tick(accent) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.frequency.value = accent ? 1320 : 880; o.type = 'triangle';
  g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + 0.1);
}

const wrap = canvas.parentElement;
let lastMs = null;
function frame(ms) {
  const t = fixedT ?? ms / 1000, dt = lastMs == null ? 0 : Math.min(0.1, (ms - lastMs) / 1000); lastMs = ms;
  for (const [g, B] of Object.entries(beats)) {
    const bpm = GENRES[g].bpm[opt.stage], spb = 60 / bpm, x = t / spb, n = Math.floor(x);
    B.on = opt.on; B.spb = spb; B.phase = x - n;
    if (n !== B.n) { B.n = n; B.side = n % 2 ? 1 : -1; B.accent = n % 4 === 0; if (opt.on && opt.auto) B.hit = 1; if (opt.on && opt.sound === g) tick(B.accent); }
    B.pulse = Math.max(0, 1 - B.phase * 2);
    B.hit = Math.max(0, B.hit - dt / (spb * 4)); // 맞추고 4박쯤 지나면 흔들기 멈춤
    dots[g].bpm.textContent = `${bpm} BPM · ${['일반', '희귀', '전설'][opt.stage]} 단계`;
    const p = opt.on ? B.pulse : 0;
    dots[g].dot.style.transform = `scale(${1 + p * (B.accent ? 0.8 : 0.45)})`;
    dots[g].dot.style.background = p > 0.3 ? (B.accent ? '#ff6f9a' : '#3f7fe0') : '#c9d6e4';
  }
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  const wr = wrap.getBoundingClientRect();
  for (const c of cells) {
    const b = c.el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue;
    const x = b.left - wr.left, y = H - (b.bottom - wr.top);
    r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
    c.cam.aspect = b.width / b.height; c.cam.updateProjectionMatrix();
    c.holder.rotation.y = c.yaw + (c.drag == null && fixedT == null ? Math.sin(t * 0.4) * 0.25 : 0);
    c.m.userData.anim(t, beats[c.genre]);
    r.render(c.scene, c.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__friends = { cells, beats, opt, hit };
