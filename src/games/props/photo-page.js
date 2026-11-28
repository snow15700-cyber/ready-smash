// 📸 포토존 시안 (photo.html, plaza.md 10장 ③). 포즈 6개 중 3개 · 사진 틀 3개 중 1개 고르기
// 한 캔버스에 칸마다 잘라 그림 (props.html과 같은 방식). 사진 틀 칸은 따로 찍은 사진(캔버스)을 틀에 넣은 그림
// 주소: ?t=1.4 시각 고정(스크린샷용 — 포즈가 다 된 순간)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeCharacter } from '../../scene.js';
import { applyLook } from '../../items.js';
import { photoZone } from '../../campusProps.js';
import { FRAMES, FRAME_IDS, POSES, POSE_IDS, SHOT, drawFrame, poseCurve, posePhoto } from './photo.js';

const params = new URLSearchParams(location.search);
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c'), bar = document.getElementById('bar');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);
const envTex = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
await document.fonts.load('40px Jua').catch(() => {});

const opt = { body: 'body_none', speed: 1 };
const BODIES = [['body_none', '흰 몸'], ['body_uniform', '유니폼'], ['body_padding', '롱패딩'], ['body_chick', '병아리']];
const cells = [], chars = [];
const HOLD_S = 1.6; // 포즈 멈춤 (찰칵은 멈춤 가운데)
const CYCLE = SHOT.ready + SHOT.go + HOLD_S + SHOT.back + 1.2;

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8a0, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(3, 6, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-4, 3, 5); scene.add(fill);
}
function floor(scene, rad = 9) { const f = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshLambertMaterial({ color: 0xd9d3c6 })); f.rotation.x = -Math.PI / 2; scene.add(f); }
function person(look = {}) { const c = makeCharacter('#e0333c'); c.setHold(true); applyLook(c, { body: opt.body, ...look }); chars.push({ c, look }); return c; }
// 포토존 무대 + 사람들 (캐릭터는 카메라(+z)를 봄). 무대 윗면 0.25m
function stage(scene) { const z = photoZone(); scene.add(z); return z; }
const STAND_Y = 0.25;
const section = (title, sub) => { const h = document.createElement('h2'); h.className = 'sec'; h.innerHTML = `${title} <small>${sub}</small>`; grid.appendChild(h); };
function cell(no, label, sub, setup) {
  const el = document.createElement('div'); el.className = 'cell';
  el.innerHTML = `<span>${no ? `<i>${no}</i>` : ''}${label}</span><small>${sub}</small><div class="flash"></div>`; grid.appendChild(el);
  const scene = new THREE.Scene(); scene.environment = envTex; scene.environmentIntensity = 0.3; lights(scene); floor(scene);
  const holder = new THREE.Group(); scene.add(holder);
  const cam = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
  const c = { el, flash: el.querySelector('.flash'), no, scene, holder, cam, yaw: 0, drag: null, ticks: [] };
  setup(c);
  el.addEventListener('pointerdown', (e) => { c.drag = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (c.drag != null) { c.yaw += (e.clientX - c.drag) * 0.012; c.drag = e.clientX; } });
  el.addEventListener('pointerup', () => { c.drag = null; });
  el.addEventListener('dblclick', () => el.classList.toggle('big'));
  cells.push(c);
  return c;
}
// 사진기 자리 (포토존 앞 4.6m, 사람 키 높이) — 광장에서도 '서면 카메라가 여기로' 옴
const PHOTO_CAM = { pos: [0, 1.9, 5.6], at: [-0.1, 1.55, 0.6], fov: 36 };
const camAt = (cam, v = PHOTO_CAM) => { cam.position.set(...v.pos); cam.lookAt(...v.at); cam.fov = v.fov; };

// ── 포즈 6개 (한 사람)
section('🕺 포즈 6개 중 3개 고르기', '사진 찍기 전에 3개 중 하나를 누름(남들 화면에도 보임). 준비(살짝 움츠림) → 포즈 → 잠깐 멈춤에서 찰칵(하얗게 번쩍) → 돌아오기');
POSE_IDS.forEach((id, i) => cell(i + 1, POSES[id].name, '', (c) => {
  stage(c.holder);
  const p = person(); p.group.rotation.y = Math.PI; p.group.position.set(0.25, STAND_Y, 1.1); c.holder.add(p.group);
  const pose = posePhoto(p, id);
  c.ticks.push((t) => {
    const age = (t + i * 0.25) % CYCLE;
    const { k, dip } = poseCurve(age, HOLD_S);
    pose.tick(t, k);
    p.body.scale.y *= 1 - dip * 0.08; p.body.scale.x *= 1 + dip * 0.04; p.body.scale.z *= 1 + dip * 0.04; // 준비: 움츠림
    p.group.position.y += STAND_Y;
    const shot = age - (SHOT.ready + SHOT.go + HOLD_S * 0.5);
    c.flash.style.opacity = fixedT == null && shot > 0 && shot < 0.35 ? String(0.85 * (1 - shot / 0.35)) : '0';
  });
  c.view = () => camAt(c.cam, { pos: [1.3, 1.6, 4.6], at: [0.1, 1.3, 1.1], fov: 34 });
}));

// ── 사진 틀 3개 (실제로 찍은 사진을 틀에 넣음)
section('🖼️ 사진 틀 3개 중 1개 고르기', '찰칵 뒤 화면에 사진이 뜨고 [💾 저장] 누르면 PNG 파일로 받음. 같이 선 사람도 함께 찍힘 (예: 3명 — ✌️ · 🏓 · 💖). 그림 아래 단추로 진짜 저장해 보기');
const shotR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
shotR.outputColorSpace = THREE.SRGBColorSpace;
shotR.setPixelRatio(1);
shotR.setSize(1200, 900, false);
const shotScene = new THREE.Scene(); shotScene.environment = new THREE.PMREMGenerator(shotR).fromScene(new RoomEnvironment(), 0.04).texture; shotScene.environmentIntensity = 0.3; lights(shotScene); floor(shotScene, 30);
shotScene.background = (() => { const cc = document.createElement('canvas'); cc.width = 4; cc.height = 256; const x = cc.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8fc7f5'); gr.addColorStop(0.7, '#dcefff'); gr.addColorStop(1, '#f3e7cf'); x.fillStyle = gr; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(cc); t.colorSpace = THREE.SRGBColorSpace; return t; })();
stage(shotScene);
// 광장 느낌: 뒤쪽 나무 몇 그루 (사진 배경이 텅 비지 않게)
{ const trunk = new THREE.MeshLambertMaterial({ color: 0x8a5a33 }), leaf = new THREE.MeshLambertMaterial({ color: 0x6fb85a });
  for (const [x, z, s] of [[-5.5, -4, 1.2], [4.8, -5, 1.4], [-2.8, -7, 1], [7.5, -2, 1.1], [-8, -1, 1.3]]) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.4 * s, 8), trunk); tr.position.set(x, 0.7 * s, z); shotScene.add(tr);
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 1), leaf); lf.position.set(x, 1.9 * s, z); shotScene.add(lf);
  } }
const GROUP = [
  { x: -0.8, z: 1.05, look: { face: 'face_happy', head: 'head_cap', body: 'body_uniform' } },
  { x: 0.05, z: 1.2, look: { face: 'face_dots' } },
  { x: 0.9, z: 1.05, look: { face: 'face_happy', head: 'head_beanie', body: 'body_padding' } },
];
const shooters = GROUP.map((gp) => { const p = makeCharacter('#e0333c'); p.setHold(true); applyLook(p, gp.look); p.group.rotation.y = Math.PI - gp.x * 0.12; p.group.position.set(gp.x, STAND_Y, gp.z); shotScene.add(p.group); return p; });
const shotCam = new THREE.PerspectiveCamera(PHOTO_CAM.fov, 4 / 3, 0.05, 80); camAt(shotCam);
function takeShot(poseIds, t = 1.3) {
  const ps = shooters.map((p, i) => { const q = posePhoto(p, poseIds[i]); q.tick(t + i * 0.4, 1); p.group.position.y += STAND_Y; return q; });
  for (const p of shooters) p.tickOutfit(t, 1 / 60);
  shotR.render(shotScene, shotCam);
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; c.getContext('2d').drawImage(shotR.domElement, 0, 0);
  ps.forEach((q) => q.clear());
  return c;
}
const info = { date: '2026.11.28', place: '경주캠퍼스 광장', names: ['탁구왕', '스매시', '김교육'] };
const SETS = [['v', 'smash', 'heart'], ['jump', 'jump', 'jump'], ['heart', 'v', 'trophy'], ['bow', 'bow', 'bow']];
const shots = SETS.map((s, i) => takeShot(s, 1.1 + i * 0.37));
FRAME_IDS.forEach((id, i) => {
  const f = FRAMES[id], img = drawFrame(id, f.shots === 1 ? [shots[0]] : shots, info);
  const el = document.createElement('div'); el.className = 'frame';
  const url = img.toDataURL('image/png');
  el.innerHTML = `<div class="pic"><img src="${url}" alt=""></div><div class="tag"><i>${7 + i}</i>${f.name}</div><small>${id === 'four' ? '3·2·1 하고 4번 찍음(약 8초)' : '한 번 찍음'} · ${f.w}×${f.h}</small><a class="save" download="스매시_${f.name}.png" href="${url}">💾 저장해 보기</a>`;
  grid.appendChild(el);
});

// ── 단추 줄
function buttons() {
  bar.innerHTML = '';
  const grp = (label, list, key, after) => {
    const b = document.createElement('b'); b.textContent = label; bar.appendChild(b);
    for (const [v, name] of list) {
      const e = document.createElement('button'); e.textContent = name; if (opt[key] === v) e.className = 'on';
      e.onclick = () => { opt[key] = v; after?.(); buttons(); };
      bar.appendChild(e);
    }
  };
  grp('몸', BODIES, 'body', () => { for (const { c, look } of chars) applyLook(c, { ...look, body: opt.body }); });
  grp('빠르기', [[1, '보통'], [0.35, '느리게']], 'speed');
}
buttons();

const wrap = canvas.parentElement;
let simT = 0, lastMs = null;
function frame(ms) {
  if (lastMs != null) simT += ((ms - lastMs) / 1000) * opt.speed;
  lastMs = ms;
  const t = fixedT ?? simT;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  r.setScissor(0, 0, W, H); r.clear();
  const wr = wrap.getBoundingClientRect();
  for (const { c } of chars) c.tickOutfit(t, 1 / 60);
  for (const c of cells) {
    const b = c.el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue;
    const x = b.left - wr.left, y = H - (b.bottom - wr.top);
    r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
    c.cam.aspect = b.width / b.height; c.view(); c.cam.updateProjectionMatrix();
    c.holder.rotation.y = c.yaw + (c.drag == null && fixedT == null ? Math.sin(simT * 0.35) * 0.2 : 0);
    for (const f of c.ticks) f(t);
    r.render(c.scene, c.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__photo = { cells, opt, takeShot };
