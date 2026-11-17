// 탁구공 시안 보기 (balls.html): 저장·구매 없음. 큰 화면 = 탁구대 위에서 왔다 갔다 하는 공, 오른쪽 = 전체 목록
// 주소 옵션: ?id=cat (처음 공), &mode=smash, &cam=game, &bg=dark, &t=2 (시각 고정 시작)
import * as THREE from 'three';
import { BALLS, BALL, BALL_R, makeBall, ballFx } from './balls.js';
import { createFx } from './fx.js';
import * as A from './audio.js';
import { TY, TABLE_W, TABLE_L } from './physics.js';

const GRADE = { common: '일반', rare: '고급', legend: '전설' };
const SOUND = { jelly: '말랑 젤리 톡', rubber: '고무공 통', peel: '둔탁한 톡', tomato: '탱글 퐁', mochi: '쫀득', tako: '말랑 폭', eggshell: '껍데기 톡', billiard: '맑은 딱', rock: '운석 충돌 쿵-', dragon: '껍데기 톡 + 화르륵', sun: '치익 + 따뜻한 울림' };
const params = new URLSearchParams(location.search);
const opt = { mode: params.get('mode') || 'normal', cam: params.get('cam') || 'near', bg: params.get('bg') || 'light' };

await document.fonts.load('20px Jua');

// ── 무대: 탁구대 + 바닥 ──
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
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#c99a62' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W, 0.035, TABLE_L), new THREE.MeshLambertMaterial({ color: '#2a62b0' }));
top.position.y = TY - 0.0175;
top.receiveShadow = true;
scene.add(top);
for (const [w, l, x, z] of [[0.02, TABLE_L, -TABLE_W / 2 + 0.01, 0], [0.02, TABLE_L, TABLE_W / 2 - 0.01, 0], [TABLE_W, 0.02, 0, -TABLE_L / 2 + 0.01], [TABLE_W, 0.02, 0, TABLE_L / 2 - 0.01], [0.005, TABLE_L, 0, 0]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, TY + 0.0006, z);
  scene.add(m);
}
const net = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W + 0.3, 0.1525), new THREE.MeshLambertMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
net.position.set(0, TY + 0.076, 0);
scene.add(net);
for (const [x, y, z, w, h, d] of [[-0.6, TY / 2, -1, 0.05, TY, 0.05], [0.6, TY / 2, -1, 0.05, TY, 0.05], [-0.6, TY / 2, 1, 0.05, TY, 0.05], [0.6, TY / 2, 1, 0.05, TY, 0.05]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: '#333' }));
  m.position.set(x, y, z); scene.add(m);
}
function setBg(v) {
  opt.bg = v;
  const dark = v === 'dark';
  scene.background = new THREE.Color(dark ? '#0d1020' : '#efe3cc');
  scene.fog = new THREE.Fog(scene.background, 4, 14);
  hemi.intensity = dark ? 0.35 : 1.5;
  sun.intensity = dark ? 0.45 : 1.5;
  floor.material.color.set(dark ? '#2a2a34' : '#c99a62');
}
setBg(opt.bg);

const fx = createFx(scene);
const bfx = ballFx(scene, fx);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.1, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.visible = false; // 진짜 그림자(shadowMap)만 쓴다
scene.add(shadow);

// ── 공 궤적: 한쪽 끝 → 상대 탁구대에 튐 → 반대쪽 끝, 그다음 되돌아오기 ──
const g = 8;
function trip(dir, smash) {
  const y0 = 0.98, yb = TY + BALL_R, y2 = smash ? 0.86 : 0.98;
  const z0 = -dir * 1.55, zb = dir * (smash ? 0.75 : 0.62), z2 = dir * 1.55;
  const t1 = smash ? 0.3 : 0.62, t2 = smash ? 0.2 : 0.34;
  const x0 = (Math.random() - 0.5) * 0.5, xb = (Math.random() - 0.5) * 0.9, x2 = (Math.random() - 0.5) * 0.4;
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
let cur = null, ball = null, tr = null, tt = 0, dir = 1;
function wear(id) {
  if (ball) { scene.remove(ball); ball.traverse((o) => { o.geometry?.dispose?.(); }); }
  cur = BALL[id] || BALLS[0];
  ball = makeBall(cur.id);
  scene.add(ball);
  document.getElementById('nm').textContent = cur.name;
  const gd = document.getElementById('gd');
  gd.textContent = GRADE[cur.grade]; gd.className = 'badge ' + cur.grade;
  document.getElementById('snd').textContent = cur.sound ? '🔊 ' + SOUND[cur.sound] : '🔊 기본 바운드음';
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('on', c.dataset.id === cur.id));
  const q = new URLSearchParams({ id: cur.id });
  for (const k of ['mode', 'cam', 'bg']) if (opt[k] !== { mode: 'normal', cam: 'near', bg: 'light' }[k]) q.set(k, opt[k]);
  history.replaceState(null, '', '?' + q);
}

// ── 단추 ──
document.querySelectorAll('.btns button').forEach((b) => {
  const on = () => document.querySelectorAll(`.btns button[data-k="${b.dataset.k}"]`).forEach((x) => x.classList.toggle('on', x.dataset.v === opt[b.dataset.k]));
  on();
  b.onclick = () => {
    A.initAudio();
    opt[b.dataset.k] = b.dataset.v;
    if (b.dataset.k === 'bg') setBg(b.dataset.v);
    on();
    wear(cur.id);
  };
});
addEventListener('pointerdown', () => A.initAudio());

// ── 카메라 ──
const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 60);
let offZ = 0.3;
const camPos = new THREE.Vector3(0.5, 1.1, 0), look = new THREE.Vector3(0, TY, 0);
function placeCam(p, dt, kid = false) {
  let want, lookAt;
  if (opt.cam === 'game') { // 경기 중 내 자리(+z 끝 뒤)에서
    cam.fov = 60;
    want = new THREE.Vector3(0.3, 1.5, 2.9);
    lookAt = new THREE.Vector3(p[0] * 0.35, 0.86, -1.0);
  } else { // 공 옆에서 가까이 따라가기
    cam.fov = 36;
    // 공이 날아오는 쪽 앞에서 비스듬히 (얼굴이 있는 공은 얼굴이 보이게)
    offZ += ((vel.z >= 0 ? 1 : -1) * 0.34 - offZ) * (1 - Math.exp(-dt * 5));
    want = new THREE.Vector3(p[0] + 0.16, Math.max(TY + 0.1, p[1] + 0.06), p[2] + offZ);
    lookAt = new THREE.Vector3(p[0], Math.max(TY + 0.02, p[1] - 0.02), p[2]);
  }
  if (kid && opt.cam !== 'game') { // 알에서 나온 아이를 비스듬히 위에서
    const far = bfx.kidKind() === 'dragon' ? 1.9 : 1; // 아기 용은 날아다녀서 조금 멀리서
    want = new THREE.Vector3(p[0] + 0.25 * far, p[1] + 0.17 * far * 0.7, p[2] + (p[2] > 0 ? 0.32 : -0.32) * far);
    lookAt = new THREE.Vector3(p[0], p[1] + 0.01, p[2]);
    const k = 1 - Math.exp(-dt * (far > 1 ? 7 : 4)); camPos.lerp(want, k); look.lerp(lookAt, k);
  } else if (opt.cam === 'game') { const k = 1 - Math.exp(-dt * 6); camPos.lerp(want, k); look.lerp(lookAt, k); }
  else { camPos.copy(want); look.copy(lookAt); } // 공이 빨라서 바짝 따라간다
  cam.position.copy(camPos);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  A.setListener([cam.position.x, cam.position.y, cam.position.z], [1, 0, 0]);
}

// ── 매 프레임 ──
let last = performance.now() / 1000;
const t0 = last, prev = new THREE.Vector3(), vel = new THREE.Vector3();
let bounced = false, wait = 0, scoreN = 0;
function loop() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const t = params.has('t') ? Number(params.get('t')) + (now - t0) : now - t0;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * R3.getPixelRatio())) { R3.setSize(w, h, false); cam.aspect = w / h; }
  if (wait > 0) { // 득점 뒤 쉬는 중 (알에서 나온 아이 구경)
    wait -= dt;
    bfx.frame(ball, null, false, dt);
    fx.update(dt);
    const kp = bfx.kidPos();
    if (kp) placeCam([kp.x, kp.y, kp.z], dt, true);
    R3.render(scene, cam);
    if (wait <= 0) { ball.visible = true; tr = null; }
    requestAnimationFrame(loop);
    return;
  }
  if (!tr || tt >= tr.T) {
    if (tr && opt.mode === 'score' && tr.smash) { // 받는 사람이 놓침 → 알이면 깨짐
      const at = tr.at(tr.T);
      if (bfx.hatch(ball, at, dir, TY, dir * TABLE_L / 2, { crack: A.playCrack, peep: A.playPeep, roar: A.playRoar })) ball.visible = false;
      A.playUI('point');
      wait = 3.0; tr = null; dir = -dir;
      requestAnimationFrame(loop);
      return;
    }
    if (tr) { ball.userData.hit(); A.playHit(tr.smash ? 'perfect' : 'good', tr.at(tr.T)); dir = -dir; }
    // 스매시 득점 보기: 보통 랠리 한 번 → 스매시 → 놓침
    const smash = opt.mode === 'smash' || (opt.mode === 'score' && (scoreN++ % 2 === 1));
    tr = trip(dir, smash); tt = 0; bounced = false;
    prev.set(...tr.at(0));
  }
  tt = Math.min(tr.T, tt + dt);
  const p = tr.at(tt);
  vel.set(p[0] - prev.x, p[1] - prev.y, p[2] - prev.z).divideScalar(Math.max(dt, 1e-4));
  prev.set(...p);
  ball.position.set(...p);
  if (!bounced && tt >= tr.t1) {
    bounced = true;
    const bp = tr.at(tr.t1);
    bfx.bounce(ball, bp, tr.smash, TY);
    A.playTable(tr.speed, bp, null, cur.sound);
  }
  ball.userData.tick(t, dt, { vel, smash: tr.smash });
  bfx.frame(ball, p, tr.smash, dt);
  fx.update(dt);
  shadow.position.set(p[0], TY + 0.001, p[2]);
  shadow.material.opacity = 0.35 * Math.max(0, 1 - (p[1] - TY) * 2.5);
  placeCam(p, dt);
  R3.render(scene, cam);
  requestAnimationFrame(loop);
}

// ── 목록 그림 ──
const TR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
TR.outputColorSpace = THREE.SRGBColorSpace;
TR.setSize(160, 160, false);
const ts = new THREE.Scene();
ts.add(new THREE.HemisphereLight('#ffffff', '#b98f62', 2.0));
const tl = new THREE.DirectionalLight('#ffffff', 1.4);
tl.position.set(1, 2, 3);
ts.add(tl);
const tcam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
tcam.position.set(0, 0.03, 0.2);
tcam.lookAt(0, 0, 0);
function thumb(id) {
  const b = makeBall(id);
  b.rotation.x = 0.3;
  const zero = new THREE.Vector3();
  for (let i = 0; i < 10; i++) b.userData.tick(1 + i / 30, 1 / 30, { vel: zero, smash: false });
  ts.add(b);
  TR.setClearColor(0x000000, 0);
  TR.render(ts, tcam);
  ts.remove(b);
  return TR.domElement.toDataURL();
}
const list = document.getElementById('list');
for (const gr of ['common', 'rare', 'legend']) {
  const items = BALLS.filter((o) => o.grade === gr);
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
document.body.dataset.ready = '1';
wear(params.get('id') || 'asteroid');
loop();
window.__balls = { wear, opt, cam, get ball() { return ball; } };
