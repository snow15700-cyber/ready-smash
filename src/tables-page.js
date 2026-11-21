// 탁구대 시안 보기 (tables.html): 저장·구매 없음. 큰 화면 = 탁구대 위로 공이 오가는 장면, 오른쪽 = 전체 목록
// 주소 옵션: ?id=wood (처음 탁구대), &ball=orange, &cam=side|high, &bg=dark, &yaw=0.5 (카메라 돌림), &mode=smash|score|long
// 탁구대에 주는 것: tick(t, dt, fx, st) — st = { ball: 공 위치, rally: 랠리 수, heat: 0~1 (랠리가 길어질수록, 게임에서는 몰입 연출 정도) }
//   bounce(p, smash, fx) 공이 판에 튐 · hit(p, smash, fx) 선수가 침 · score({ x, z, smash }, fx) 득점 (z = 공이 빠져나간 끝)
import * as THREE from 'three';
import { TABLES, TABLE, makeTable } from './tables.js';
import { BALLS, makeBall } from './balls.js';
import * as A from './audio.js';
import { createFx } from './fx.js';
import { TY, TABLE_L } from './physics.js';

const GRADE = { default: '기본', common: '일반', rare: '고급', legend: '전설' };
const params = new URLSearchParams(location.search);
const opt = { mode: params.get('mode') || 'normal', cam: params.get('cam') || 'game', bg: params.get('bg') || 'light', ball: params.get('ball') || 'white' };
let yaw = Number(params.get('yaw') || 0);

await document.fonts.load('20px Jua');

// ── 무대 ──
const canvas = document.getElementById('c');
const R3 = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
R3.setPixelRatio(Math.min(window.devicePixelRatio, 2));
R3.shadowMap.enabled = true;
R3.shadowMap.type = THREE.PCFSoftShadowMap;
R3.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight('#fff7ea', '#8a6a4a', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 1.5);
sun.position.set(-2, 5, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 1, far: 12 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#c99a62' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
function setBg(v) {
  opt.bg = v;
  const dark = v === 'dark';
  scene.background = new THREE.Color(dark ? '#0d1020' : '#efe3cc');
  scene.fog = new THREE.Fog(scene.background, 5, 16);
  hemi.intensity = dark ? 0.35 : 1.5;
  sun.intensity = dark ? 0.45 : 1.5;
  floor.material.color.set(dark ? '#2a2a34' : '#c99a62');
}
setBg(opt.bg);

const fx = createFx(scene);

// ── 공: 양쪽 끝을 오가며 상대 쪽 판에 한 번 튐 ──
const g = 8;
function trip(dir, smash) {
  const y0 = 0.98, yb = TY + 0.02, y2 = smash ? 0.86 : 0.98;
  const z0 = -dir * 1.55, zb = dir * (smash ? 0.55 + Math.random() * 0.4 : 0.35 + Math.random() * 0.75), z2 = dir * 1.55;
  const t1 = smash ? 0.3 : 0.62, t2 = smash ? 0.2 : 0.34;
  const x0 = (Math.random() - 0.5) * 0.5, xb = (Math.random() - 0.5) * 1.2, x2 = (Math.random() - 0.5) * 0.4;
  const v1 = (yb - y0 + g * t1 * t1 / 2) / t1, v2 = (y2 - yb + g * t2 * t2 / 2) / t2;
  return {
    T: t1 + t2, t1, smash, speed: Math.hypot(zb - z0, xb - x0) / t1,
    at(t) {
      if (t < t1) { const k = t / t1; return [x0 + (xb - x0) * k, y0 + v1 * t - g * t * t / 2, z0 + (zb - z0) * k]; }
      const u = t - t1, k = u / t2;
      return [xb + (x2 - xb) * k, yb + v2 * u - g * u * u / 2, zb + (z2 - zb) * k];
    },
  };
}
let table = null, cur = null, ball = null, ballInfo = null;
function setBall(id) {
  if (ball) scene.remove(ball);
  ballInfo = BALLS.find((b) => b.id === id) || { id: 'white', name: '흰색' };
  ball = makeBall(ballInfo.id);
  scene.add(ball);
  opt.ball = ballInfo.id;
}
function wear(id) {
  if (table) { scene.remove(table); }
  cur = TABLE[id] || TABLES[0];
  table = makeTable(cur.id);
  scene.add(table);
  document.getElementById('nm').textContent = cur.name;
  const gd = document.getElementById('gd');
  gd.textContent = GRADE[cur.grade]; gd.className = 'badge ' + cur.grade;
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.id === cur.id));
  const q = new URLSearchParams({ id: cur.id });
  for (const k of ['mode', 'cam', 'bg', 'ball']) if (opt[k] !== { mode: 'normal', cam: 'game', bg: 'light', ball: 'white' }[k]) q.set(k, opt[k]);
  rally = 0; tr = null; wait = 0; ball.visible = true;
  history.replaceState(null, '', '?' + q);
}

// ── 단추: 공 고르기 (일반 공 + 흰 공) ──
const ballBtns = document.getElementById('balls');
for (const b of [{ id: 'white', name: '흰 공' }, ...BALLS.filter((x) => x.grade === 'common' || x.id === 'sun' || x.id === 'asteroid')]) {
  ballBtns.insertAdjacentHTML('beforeend', `<button data-k="ball" data-v="${b.id}">${b.name}</button>`);
}
document.querySelectorAll('.btns button').forEach((b) => {
  const on = () => document.querySelectorAll(`.btns button[data-k="${b.dataset.k}"]`).forEach((x) => x.classList.toggle('on', x.dataset.v === opt[b.dataset.k]));
  on();
  b.onclick = () => {
    A.initAudio();
    opt[b.dataset.k] = b.dataset.v;
    if (b.dataset.k === 'bg') setBg(b.dataset.v);
    if (b.dataset.k === 'ball') setBall(b.dataset.v);
    if (b.dataset.k === 'mode') heat = 0;
    on();
    wear(cur.id);
  };
});
addEventListener('pointerdown', () => A.initAudio());
// 끌어서 빙 돌아보기
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (drag != null) { yaw -= (e.clientX - drag) * 0.008; drag = e.clientX; } });
canvas.addEventListener('pointerup', () => { drag = null; });

// ── 카메라 ──
const cam = new THREE.PerspectiveCamera(55, 1, 0.01, 60);
function placeCam() {
  let p, look;
  if (opt.cam === 'side') { cam.fov = 40; p = new THREE.Vector3(3.6, 1.9, 0); look = new THREE.Vector3(0, TY, 0); }
  else if (opt.cam === 'high') { cam.fov = 40; p = new THREE.Vector3(2.0, 2.9, 2.6); look = new THREE.Vector3(0, TY - 0.1, 0); }
  else if (opt.cam === 'show') { cam.fov = 42; p = new THREE.Vector3(2.0, 1.85, 2.35); look = new THREE.Vector3(-0.2, TY - 0.08, 0.05); } // 소개 사진용 (단추 없음)
  else { cam.fov = 60; p = new THREE.Vector3(0.3, 1.5, 2.9); look = new THREE.Vector3(0, 0.86, -1.0); }
  p.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  look.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  cam.position.copy(p);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  A.setListener([p.x, p.y, p.z], [1, 0, 0]);
}

// ── 매 프레임 ──
let last = performance.now() / 1000, tr = null, tt = 0, dir = 1, bounced = false, rally = 0, wait = 0, heat = 0, n = 0;
const prev = new THREE.Vector3(), vel = new THREE.Vector3();
function loop() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * R3.getPixelRatio()) || canvas.height !== Math.round(h * R3.getPixelRatio())) { R3.setSize(w, h, false); cam.aspect = w / h; }
  const st = { ball: null, rally, heat };
  if (wait > 0) { // 득점 뒤 잠깐 쉬기 (연출 구경)
    wait -= dt;
    heat = Math.max(0, heat - dt * 0.6); st.heat = heat;
    table.userData.tick?.(now, dt, fx, st);
    fx.update(dt);
    if (wait <= 0) { ball.visible = true; tr = null; }
    placeCam();
    R3.render(scene, cam);
    requestAnimationFrame(loop);
    return;
  }
  if (!tr || tt >= tr.T) {
    if (tr && tr.smash && opt.mode === 'score') { // 받는 사람이 놓침 → 득점
      const at = tr.at(tr.T);
      table.userData.score?.({ x: at[0], z: Math.sign(at[2]) * TABLE_L / 2, smash: true }, fx);
      A.playUI('point');
      ball.visible = false; wait = 3.2; rally = 0; dir = -dir;
      requestAnimationFrame(loop);
      return;
    }
    if (tr) { ball.userData.hit(); A.playHit(tr.smash ? 'perfect' : 'good', tr.at(tr.T)); table.userData.hit?.(tr.at(tr.T), tr.smash, fx); dir = -dir; rally++; }
    const smash = opt.mode === 'smash' || (opt.mode === 'score' && n++ % 3 === 2);
    tr = trip(dir, smash); tt = 0; bounced = false;
    prev.set(...tr.at(0));
  }
  // 긴 랠리 보기: 랠리 수를 빨리 올려서 화려해지는 모습을 본다
  const want = opt.mode === 'long' ? 1 : Math.min(1, rally / 16);
  heat += (want - heat) * Math.min(1, dt * (opt.mode === 'long' ? 0.5 : 2));
  document.getElementById('rally').textContent = (opt.mode === 'long' ? '긴 랠리' : `랠리 ${rally}`) + ` · 열기 ${Math.round(heat * 100)}%`;
  tt = Math.min(tr.T, tt + dt);
  const p = tr.at(tt);
  vel.set(p[0] - prev.x, p[1] - prev.y, p[2] - prev.z).divideScalar(Math.max(dt, 1e-4));
  prev.set(...p);
  ball.position.set(...p);
  if (!bounced && tt >= tr.t1) { bounced = true; const bp = tr.at(tr.t1); bp[1] = TY; A.playTable(tr.speed, bp, null, ballInfo.sound); table.userData.bounce?.(bp, tr.smash, fx); }
  ball.userData.tick(now, dt, { vel, smash: tr.smash });
  st.ball = p; st.rally = opt.mode === 'long' ? 30 : rally; st.heat = heat;
  table.userData.tick?.(now, dt, fx, st);
  fx.update(dt);
  placeCam();
  R3.render(scene, cam);
  requestAnimationFrame(loop);
}

// ── 목록 그림 ──
const TR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
TR.outputColorSpace = THREE.SRGBColorSpace;
TR.setSize(240, 180, false);
const ts = new THREE.Scene();
ts.add(new THREE.HemisphereLight('#ffffff', '#b98f62', 2.0));
const tl = new THREE.DirectionalLight('#ffffff', 1.3);
tl.position.set(1, 3, 2);
ts.add(tl);
const tcam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 20);
tcam.position.set(3.2, 3.0, 3.6);
tcam.lookAt(0, TY - 0.15, 0);
function thumb(id) {
  const t = makeTable(id);
  for (let i = 0; i < 3; i++) t.userData.tick?.(1 + i * 0.04, 0.04, null, {}); // 움직이는 탁구대: 한 번 그려 둠 (게임기 화면 등)
  ts.add(t);
  TR.setClearColor(0x000000, 0);
  TR.render(ts, tcam);
  ts.remove(t);
  return TR.domElement.toDataURL();
}
const list = document.getElementById('list');
for (const gr of ['default', 'common', 'rare', 'legend']) {
  const items = TABLES.filter((o) => o.grade === gr);
  if (!items.length) continue;
  list.insertAdjacentHTML('beforeend', `<h2><span class="badge ${gr}">${GRADE[gr]}</span> ${items.length}종</h2><div class="grid" id="g-${gr}"></div>`);
  const grid = document.getElementById('g-' + gr);
  for (const o of items) {
    const d = document.createElement('div');
    d.className = 'card g-' + gr;
    d.dataset.id = o.id;
    d.innerHTML = `<img src="${thumb(o.id)}" alt=""><div class="n">${o.name}</div>`;
    d.onclick = () => { A.initAudio(); wear(o.id); };
    grid.appendChild(d);
  }
}
setBall(opt.ball);
wear(params.get('id') || 'green');
document.body.dataset.ready = '1';
loop();
window.__tables = { wear, setBall, opt, cam, scene, makeBall, fx, get table() { return table; }, setHeat: (v) => { heat = v; }, get ball() { return ball; }, setYaw: (v) => { yaw = v; } };
