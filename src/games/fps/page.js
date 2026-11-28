// FPS 1단계 손맛 시안 (fps.html, fps.md 7장 1단계): 네온 맵에서 걷기·대시·점프대·쏘기 + 허수아비
// 네트워크·광장·서버는 아직 없음. 주소: ?t=12 시각 고정·자동 연출(스크린샷용) · ?yaw=0.3&pitch=-0.1&x=0&z=12 시작 자리
import * as THREE from 'three';
import { TUNE } from './tune.js';
import { BG, buildMap } from './map.js';
import { makeDummies } from './dummies.js';
import { makeGun } from './gun.js';
import * as S from './sound.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c'), hud = document.getElementById('hud'), hx = hud.getContext('2d');
const overlay = document.getElementById('overlay'), panel = document.getElementById('panel');

// ── 설정 (이 기기에 저장) ──
const SAVE = 'fps-draft-opt';
const opt = Object.assign({ sens: 1, recoil: 'mid', gunSound: 'A', mark: 'A', move: true, teams: true, vol: 0.7 }, (() => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } })());
const saveOpt = () => { try { localStorage.setItem(SAVE, JSON.stringify(opt)); } catch { /* 저장 못 해도 괜찮음 */ } };
const RECOIL = { low: { pitch: 0.45, gun: 0.55, shake: 0.004 }, mid: { pitch: 1.0, gun: 1, shake: 0.008 }, high: { pitch: 1.9, gun: 1.4, shake: 0.014 } }; // pitch는 도(°)

// ── 3D ──
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 교육장 PC: 화면이 커도 너무 무겁지 않게
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
const scene = new THREE.Scene(); scene.background = BG;
const camera = new THREE.PerspectiveCamera(TUNE.fov, 1, 0.05, 400); camera.rotation.order = 'YXZ';
// 캐릭터만 받는 빛 (맵은 셰이더가 스스로 빛나서 영향 없음) — '캐릭터는 밝게'
scene.add(new THREE.HemisphereLight(0xe8ecff, 0x40306a, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(4, 10, 6); scene.add(sun);
const back = new THREE.DirectionalLight(0xb0c8ff, 0.8); back.position.set(-5, 6, -8); scene.add(back);
const map = buildMap(scene);
const dummies = makeDummies(scene, { teams: opt.teams });
const gun = makeGun();
await document.fonts.load('40px Jua').catch(() => {});

// ── 나 ──
const me = {
  pos: new THREE.Vector3(Number(params.get('x') ?? 0), 0, Number(params.get('z') ?? 18)),
  vel: new THREE.Vector3(), yaw: Number(params.get('yaw') ?? 0), pitch: Number(params.get('pitch') ?? 0),
  ground: true, dashT: 0, dashCool: 0, dashDir: new THREE.Vector3(), fireCool: 0, kickPitch: 0, stepT: 0, bob: 0, shake: 0, fovK: 0,
};
const keys = new Set();
let firing = false, locked = false;

// ── 부딪히기: 몸 = 세운 상자 (반지름 r, 키 h). 축마다 따로 움직여 벽을 따라 미끄러지게 ──
function collide(axis) {
  const r = TUNE.radius, p = me.pos;
  for (const b of map.solids) {
    if (p.x + r <= b.min.x || p.x - r >= b.max.x || p.z + r <= b.min.z || p.z - r >= b.max.z || p.y + TUNE.height <= b.min.y || p.y >= b.max.y) continue;
    if (axis === 'x') { p.x = me.vel.x > 0 ? b.min.x - r - 1e-4 : b.max.x + r + 1e-4; me.vel.x = 0; }
    else if (axis === 'z') { p.z = me.vel.z > 0 ? b.min.z - r - 1e-4 : b.max.z + r + 1e-4; me.vel.z = 0; }
    else if (me.vel.y <= 0) { p.y = b.max.y; me.vel.y = 0; me.ground = true; }
    else { p.y = b.min.y - TUNE.height - 1e-4; me.vel.y = 0; }
  }
}

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
function moveMe(dt) {
  _f.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)); _r.set(-_f.z, 0, _f.x);
  _w.set(0, 0, 0);
  if (keys.has('KeyW')) _w.add(_f); if (keys.has('KeyS')) _w.sub(_f);
  if (keys.has('KeyD')) _w.add(_r); if (keys.has('KeyA')) _w.sub(_r);
  const hasInput = _w.lengthSq() > 0; if (hasInput) _w.normalize();
  me.dashCool = Math.max(0, me.dashCool - dt);
  if (me.dashT > 0) {
    // 대시 중: 수평으로 곧게 (중력 없음)
    me.dashT -= dt;
    me.vel.set(me.dashDir.x * TUNE.dashSpeed, 0, me.dashDir.z * TUNE.dashSpeed);
    if (me.dashT <= 0) me.vel.set(me.dashDir.x * TUNE.run, 0, me.dashDir.z * TUNE.run); // 끝나면 달리기 속도로 이어짐
  } else {
    const target = _w.clone().multiplyScalar(TUNE.run);
    const a = me.ground ? TUNE.accel : hasInput ? TUNE.airAccel : 0;
    const dx = target.x - me.vel.x, dz = target.z - me.vel.z, dl = Math.hypot(dx, dz), step = a * dt;
    if (dl > 0) { const k = Math.min(1, step / dl); me.vel.x += dx * k; me.vel.z += dz * k; }
    me.vel.y -= TUNE.gravity * dt;
  }
  const wasGround = me.ground, fallV = me.vel.y;
  me.ground = false;
  me.pos.x += me.vel.x * dt; collide('x');
  me.pos.z += me.vel.z * dt; collide('z');
  me.pos.y += me.vel.y * dt;
  if (me.pos.y <= 0) { me.pos.y = 0; me.vel.y = 0; me.ground = true; }
  collide('y');
  if (me.ground && !wasGround && fallV < -4) { S.land(Math.min(1.5, -fallV / 10)); me.shake = Math.max(me.shake, 0.004 * Math.min(2, -fallV / 8)); }
  // 점프대: 발판 위(높이 0.3m 안)에 서면 튀어 오름
  for (const p of map.pads) {
    if (me.pos.y < 0.3 && Math.hypot(me.pos.x - p.x, me.pos.z - p.z) < 1.05 && me.vel.y <= 0.1) {
      me.vel.set(p.dir[0] * TUNE.padFwd, TUNE.padUp, p.dir[1] * TUNE.padFwd); me.ground = false; me.dashT = 0;
      p.kick = 1; S.pad(); me.fovK = 1;
    }
  }
  // 발소리
  const sp = Math.hypot(me.vel.x, me.vel.z);
  if (me.ground && sp > 2) { me.bob += dt * sp * 1.55; me.stepT -= dt * sp; if (me.stepT <= 0) { me.stepT = 2.3; S.step(); } }
}
function jump() { if (me.ground && me.dashT <= 0) { me.vel.y = TUNE.jump; me.ground = false; S.jump(); } }
function dash() {
  if (me.dashCool > 0 || me.dashT > 0) return;
  _f.set(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)); _r.set(-_f.z, 0, _f.x);
  _w.set(0, 0, 0);
  if (keys.has('KeyW')) _w.add(_f); if (keys.has('KeyS')) _w.sub(_f);
  if (keys.has('KeyD')) _w.add(_r); if (keys.has('KeyA')) _w.sub(_r);
  if (_w.lengthSq() === 0) _w.copy(_f); // 키를 안 누르면 앞으로
  me.dashDir.copy(_w.normalize()); me.dashT = TUNE.dashTime; me.dashCool = TUNE.dashCool; me.fovK = 0.7;
  S.dash();
}

// 눈 자리·방향 (쏘는 순간에도 불러서, 방금 움직인 마우스까지 반영)
function placeCamera(shake) {
  camera.position.set(me.pos.x, me.pos.y + TUNE.eye, me.pos.z);
  const s = shake ? me.shake : 0;
  camera.rotation.set(me.pitch + me.kickPitch + (Math.random() - 0.5) * s, me.yaw + (Math.random() - 0.5) * s, 0);
  camera.updateMatrixWorld();
}

// ── 쏘기 ──
const fx = []; // { mesh, t, life, kind }
const marks = []; // 화면 ✕ { t, kind: 'body'|'head'|'kill'|'shield' }
const pops = []; // 맞은 자리 숫자 { pos, text, t, color }
const feed = []; // 오른쪽 위 쓰러뜨림 기록
let streak = 0, lastKill = -99, bigText = null, hitstop = 0, now = 0, shots = 0, hitsN = 0, headsN = 0;
const ray = new THREE.Raycaster();
const tracerMat = new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const tracerGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 6, 1, true); tracerGeo.rotateX(Math.PI / 2); tracerGeo.translate(0, 0, -0.5);
const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function spark(point, color, n, size, speed) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(point); s.scale.setScalar(size * (0.6 + Math.random() * 0.8)); scene.add(s);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
    fx.push({ mesh: s, t: 0, life: 0.25 + Math.random() * 0.2, kind: 'spark', v, s0: s.scale.x });
  }
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.position.copy(point); ring.scale.setScalar(size * 3); scene.add(ring);
  fx.push({ mesh: ring, t: 0, life: 0.09, kind: 'flash', s0: size * 3 });
}

function shoot() {
  if (me.fireCool > 0) return;
  me.fireCool = TUNE.fireGap; shots++;
  const R = RECOIL[opt.recoil];
  S.shot(opt.gunSound); gun.fire(R.gun);
  placeCamera(false); // 반동 전 조준 그대로 판정
  me.kickPitch += THREE.MathUtils.degToRad(R.pitch); me.shake = Math.max(me.shake, R.shake);
  const o = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
  // 맵 상자와 허수아비 중 가까운 것
  ray.set(o, dir); ray.far = 200;
  const wall = ray.intersectObjects(map.meshes, false)[0];
  let hit = dummies.raycast(o, dir);
  if (hit && wall && wall.distance < hit.t) hit = null;
  const end = hit ? hit.point : wall ? wall.point : o.clone().addScaledVector(dir, 120);
  // 총알 줄: 총구(화면 오른쪽 아래)에서 맞은 자리까지
  const m = gun.muzzleNDC(new THREE.Vector2());
  const start = new THREE.Vector3(m.x, m.y, 0.5).unproject(camera).sub(o).normalize().multiplyScalar(1.1).add(o);
  const len = start.distanceTo(end);
  const tr = new THREE.Mesh(tracerGeo, tracerMat.clone()); tr.position.copy(start); tr.lookAt(end); tr.scale.set(1, 1, len); scene.add(tr);
  fx.push({ mesh: tr, t: 0, life: 0.07, kind: 'tracer' });
  if (!hit) { if (wall) { spark(wall.point.addScaledVector(wall.face.normal, 0.03), '#9ff6ff', 4, 0.12, 2.5); S.wallHit(); } return; }
  const d = hit.d;
  if (d.shield > 0) { marks.push({ t: now, kind: 'shield' }); S.shieldTink(); spark(hit.point, '#ffffff', 3, 0.1, 1.5); return; }
  const dmg = hit.part === 'head' ? TUNE.head : TUNE.body;
  hitsN++; if (hit.part === 'head') headsN++;
  d.hp -= dmg; d.hitT = now;
  // 맞은 방향: 내 쪽에서 밀려나게 (허수아비 앞쪽 기준이라 늘 뒤로)
  d.hitDir = hit.part === 'head' ? 1.4 : 1;
  pops.push({ pos: hit.point.clone(), text: `-${dmg}`, t: now, head: hit.part === 'head' });
  spark(hit.point, hit.part === 'head' ? '#ffe066' : '#ffffff', hit.part === 'head' ? 9 : 5, 0.14, 3);
  if (d.hp <= 0) {
    d.dead = 0; d.hp = 0;
    streak = now - lastKill < TUNE.streakGap ? streak + 1 : 1; lastKill = now;
    hitstop = TUNE.hitstop; // 0.05초 멈칫
    marks.push({ t: now, kind: 'kill', head: hit.part === 'head' });
    S.kill(streak); if (hit.part === 'head') S.hitHead(); else S.hitBody();
    bigText = { t: now, text: streak >= 2 ? `${streak}연속!` : hit.part === 'head' ? '머리!' : '쓰러뜨림!', streak };
    feed.unshift({ t: now, name: d.name, head: hit.part === 'head', team: d.team }); feed.length = Math.min(feed.length, 5);
    me.fovK = Math.max(me.fovK, 0.35);
  } else {
    marks.push({ t: now, kind: hit.part });
    if (hit.part === 'head') S.hitHead(); else S.hitBody();
  }
}

// ── 입력 ──
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') { jump(); e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') dash();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); firing = false; });
document.getElementById('start').addEventListener('click', () => lock());
canvas.addEventListener('mousedown', (e) => { if (!locked) return lock(); if (e.button === 0) { firing = true; shoot(); } });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const k = 0.0022 * opt.sens;
  me.yaw -= e.movementX * k; me.pitch = THREE.MathUtils.clamp(me.pitch - e.movementY * k, -1.5, 1.5);
  gun.look(e.movementX, e.movementY);
});
function lock() {
  S.initSound(); S.setVolume(opt.vol);
  const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
  // 일부 브라우저는 unadjustedMovement를 못 씀 → 그냥 잠금
  p?.catch?.(() => canvas.requestPointerLock?.());
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  overlay.classList.toggle('hide', locked);
  if (!locked) { firing = false; keys.clear(); }
  else panel.classList.remove('open');
});

// ── 설정 창 ──
document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
const sens = document.getElementById('sens'), sensV = document.getElementById('sensV');
sens.value = opt.sens; sensV.textContent = Number(opt.sens).toFixed(2);
sens.addEventListener('input', () => { opt.sens = Number(sens.value); sensV.textContent = opt.sens.toFixed(2); saveOpt(); });
const syncPanel = () => { for (const b of panel.querySelectorAll('button[data-k]')) b.classList.toggle('on', String(opt[b.dataset.k]) === b.dataset.v); };
panel.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]'); if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  opt[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
  if (k === 'teams') dummies.setTeams(opt.teams);
  if (k === 'vol') S.setVolume(opt.vol);
  if (k === 'gunSound') { S.initSound(); S.shot(opt.gunSound); }
  if (k === 'mark') marks.push({ t: now, kind: 'head' });
  saveOpt(); syncPanel();
});
syncPanel();
dummies.setTeams(opt.teams);

// ── 화면 그림 (HUD) ──
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  gun.cam.aspect = w / h; gun.cam.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio, 2); hud.width = w * dpr; hud.height = h * dpr; hx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
function drawX(cx, cy, size, gap, width, color, rot = 0) {
  hx.save(); hx.translate(cx, cy); hx.rotate(rot);
  hx.lineCap = 'round';
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    if (opt.mark === 'B') { hx.strokeStyle = 'rgba(0,0,0,0.55)'; hx.lineWidth = width + 3; hx.beginPath(); hx.moveTo(sx * gap, sy * gap); hx.lineTo(sx * size, sy * size); hx.stroke(); }
    hx.strokeStyle = color; hx.lineWidth = width; hx.beginPath(); hx.moveTo(sx * gap, sy * gap); hx.lineTo(sx * size, sy * size); hx.stroke();
  }
  hx.restore();
}
const _v = new THREE.Vector3();
function drawHud() {
  const w = innerWidth, h = innerHeight, cx = w / 2, cy = h / 2;
  hx.clearRect(0, 0, w, h);
  // 조준점: 가운데 점 + 네 줄 (움직이면 살짝 벌어짐 — 보기만, 판정은 늘 정가운데)
  const sp = Math.hypot(me.vel.x, me.vel.z) / TUNE.run, open = 6 + sp * 3 + (me.ground ? 0 : 4) + Math.max(0, me.fireCool / TUNE.fireGap) * 4;
  hx.fillStyle = '#ffffff'; hx.strokeStyle = 'rgba(0,0,0,0.6)'; hx.lineWidth = 1;
  hx.beginPath(); hx.arc(cx, cy, 2, 0, Math.PI * 2); hx.fill(); hx.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { hx.fillStyle = 'rgba(0,0,0,0.5)'; hx.fillRect(cx + dx * (open + 4) - (dx ? 4 : 1.5) - 0.5, cy + dy * (open + 4) - (dy ? 4 : 1.5) - 0.5, (dx ? 8 : 3) + 1, (dy ? 8 : 3) + 1); hx.fillStyle = '#fff'; hx.fillRect(cx + dx * (open + 4) - (dx ? 4 : 1.5), cy + dy * (open + 4) - (dy ? 4 : 1.5), dx ? 8 : 3, dy ? 8 : 3); }
  // 대시 쿨타임: 조준점 아래 작은 원호 (다 차면 사라짐)
  if (me.dashCool > 0) {
    const k = 1 - me.dashCool / TUNE.dashCool;
    hx.strokeStyle = 'rgba(255,255,255,0.25)'; hx.lineWidth = 3; hx.beginPath(); hx.arc(cx, cy + 34, 7, 0, Math.PI * 2); hx.stroke();
    hx.strokeStyle = '#3ff2ff'; hx.beginPath(); hx.arc(cx, cy + 34, 7, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); hx.stroke();
  }
  // 맞힘 ✕
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i], a = now - m.t;
    const life = m.kind === 'kill' ? 0.45 : m.kind === 'head' ? 0.32 : 0.22;
    if (a > life) { marks.splice(i, 1); continue; }
    const fade = 1 - a / life, pop = 1 + (1 - ease(a / 0.08)) * 0.5;
    if (m.kind === 'body') drawX(cx, cy, 13 * pop, 6, 2.5, `rgba(255,255,255,${fade})`);
    if (m.kind === 'head') drawX(cx, cy, 17 * pop, 6, 3.5, `rgba(255,214,61,${fade})`), drawX(cx, cy, 9 * pop, 4, 1.5, `rgba(255,255,255,${fade})`, Math.PI / 4);
    if (m.kind === 'kill') drawX(cx, cy, 22 * pop, 7, 4.5, m.head ? `rgba(255,214,61,${fade})` : `rgba(255,70,90,${fade})`);
    if (m.kind === 'shield') { hx.strokeStyle = `rgba(160,220,255,${fade})`; hx.lineWidth = 2.5; hx.beginPath(); hx.arc(cx, cy, 14, 0, Math.PI * 2); hx.stroke(); }
  }
  // 맞은 자리 숫자 (위로 떠오르며 사라짐)
  hx.textAlign = 'center'; hx.textBaseline = 'middle';
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i], a = now - p.t; if (a > 0.7) { pops.splice(i, 1); continue; }
    _v.copy(p.pos); _v.y += a * 0.9; _v.project(camera); if (_v.z > 1) continue;
    const x = (_v.x * 0.5 + 0.5) * w + 34, y = (-_v.y * 0.5 + 0.5) * h - 26, k = 1 - a / 0.7, s = 1 + (1 - ease(a / 0.1)) * 0.6;
    hx.font = `${Math.round((p.head ? 30 : 24) * s)}px Jua, sans-serif`; hx.lineWidth = 4; hx.strokeStyle = `rgba(20,10,40,${0.7 * k})`;
    hx.strokeText(p.text, x, y); hx.fillStyle = p.head ? `rgba(255,214,61,${k})` : `rgba(255,255,255,${k})`; hx.fillText(p.text, x, y);
  }
  // 가운데 큰 글자 (쓰러뜨림·연속)
  if (bigText) {
    const a = now - bigText.t;
    if (a > 1.1) bigText = null;
    else {
      const s = a < 0.12 ? 1.6 - ease(a / 0.12) * 0.6 : 1, k = a > 0.8 ? 1 - (a - 0.8) / 0.3 : 1;
      hx.save(); hx.translate(cx, cy + 78); hx.scale(s, s);
      hx.font = `${bigText.streak >= 2 ? 44 : 34}px Jua, sans-serif`; hx.lineWidth = 7; hx.strokeStyle = `rgba(30,10,50,${0.75 * k})`;
      hx.strokeText(bigText.text, 0, 0);
      hx.fillStyle = bigText.streak >= 3 ? `rgba(255,79,224,${k})` : bigText.streak >= 2 ? `rgba(255,138,31,${k})` : `rgba(255,255,255,${k})`; hx.fillText(bigText.text, 0, 0);
      hx.restore();
    }
  }
  // 오른쪽 위: 쓰러뜨림 기록
  hx.textAlign = 'right'; hx.font = '600 14px "Pretendard Variable", system-ui, sans-serif';
  feed.forEach((f, i) => {
    const a = now - f.t; if (a > 6) return;
    const k = a > 5 ? 6 - a : 1, y = 78 + i * 30, text = `나  ▸  ${f.name}${f.head ? '  🎯머리' : ''}`;
    const tw = hx.measureText(text).width + 24;
    hx.fillStyle = `rgba(15,18,45,${0.6 * k})`; hx.beginPath(); hx.roundRect(w - 16 - tw, y - 13, tw, 26, 13); hx.fill();
    hx.fillStyle = `rgba(255,255,255,${k})`; hx.fillText(text, w - 28, y + 1);
  });
  // 왼쪽 아래: 시험용 숫자 (속도·대시·명중)
  hx.textAlign = 'left'; hx.font = '600 13px "Pretendard Variable", system-ui, sans-serif';
  const spd = Math.hypot(me.vel.x, me.vel.z);
  const lines = [`속도 ${spd.toFixed(1)} m/s${me.dashT > 0 ? '  💨대시' : ''}${me.ground ? '' : '  ⤴공중'}`, `대시 ${me.dashCool > 0 ? me.dashCool.toFixed(1) + '초' : '준비 ✓'}  ·  명중 ${hitsN}/${shots}  ·  머리 ${headsN}`];
  hx.fillStyle = 'rgba(15,18,45,0.55)'; hx.beginPath(); hx.roundRect(16, h - 66, 300, 50, 12); hx.fill();
  hx.fillStyle = '#fff'; lines.forEach((l, i) => hx.fillText(l, 28, h - 48 + i * 20));
}

// ── 매 프레임 ──
const fixedT = params.has('t') ? Number(params.get('t')) : null;
let last = performance.now(), dashReadyPlayed = true;
function frame(ms) {
  let dt = Math.min(0.05, (ms - last) / 1000); last = ms;
  if (fixedT != null || window.__fps?.paused) dt = 0; // 스크린샷용 멈춤
  // 0.05초 멈칫: 세상은 멈추고 마우스 시선만 움직임
  let wdt = dt;
  if (hitstop > 0) { hitstop -= dt; wdt = 0; }
  now += wdt;
  const t = fixedT ?? now;
  me.fireCool = Math.max(0, me.fireCool - wdt);
  if (firing && locked) shoot();
  moveMe(wdt);
  if (me.dashCool === 0 && !dashReadyPlayed) { S.dashReady(); dashReadyPlayed = true; } if (me.dashCool > 0) dashReadyPlayed = false;
  // 반동은 스프링처럼 돌아옴 (조준이 원래 자리로)
  me.kickPitch *= Math.exp(-wdt * 11);
  me.shake *= Math.exp(-dt * 18);
  me.fovK *= Math.exp(-dt * 5);
  placeCamera(true);
  camera.fov = TUNE.fov + me.fovK * 8; camera.updateProjectionMatrix();
  map.tick(t, wdt);
  dummies.tick(t, wdt, camera.position, opt.move);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += wdt; const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.mesh); f.mesh.material.dispose(); fx.splice(i, 1); continue; }
    if (f.kind === 'spark') { f.mesh.position.addScaledVector(f.v, wdt); f.v.y -= 9 * wdt; f.mesh.material.opacity = 1 - k; f.mesh.scale.setScalar(f.s0 * (1 - k * 0.6)); }
    if (f.kind === 'flash') { f.mesh.material.opacity = 1 - k; f.mesh.scale.setScalar(f.s0 * (1 + k)); }
    if (f.kind === 'tracer') f.mesh.material.opacity = (1 - k) * 0.9;
  }
  const spd = Math.hypot(me.vel.x, me.vel.z) / TUNE.run;
  gun.tick(t, wdt, { bob: me.bob, speed: me.ground ? Math.min(1, spd) : 0, air: me.ground ? 0 : 1, dashK: me.dashT > 0 ? 1 : 0 });
  renderer.clear(); renderer.render(scene, camera);
  renderer.clearDepth(); renderer.render(gun.scene, gun.cam);
  drawHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 시험·스크린샷용 (Claude가 쓰는 디버그 손잡이)
window.__fps = {
  me, dummies, opt, keys, shoot, jump, dash, setLock: (v) => { locked = v; overlay.classList.toggle('hide', v); },
  aimAt(d, part = 'head') { // 허수아비 머리·몸을 정확히 겨눔
    const p = d.root.position, y = p.y + (part === 'head' ? 1.17 * 1.32 : 0.7);
    const e = new THREE.Vector3(me.pos.x, me.pos.y + TUNE.eye, me.pos.z);
    me.yaw = Math.atan2(-(p.x - e.x), -(p.z - e.z)); me.pitch = Math.atan2(y - e.y, Math.hypot(p.x - e.x, p.z - e.z)); me.kickPitch = 0;
  },
  step(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { me.fireCool = Math.max(0, me.fireCool - 1 / 60); moveMe(1 / 60); now += 1 / 60; } },
  revive() { for (const d of dummies.list) { d.dead = 1e9; } dummies.tick(now, 0.001, camera.position, false); for (const d of dummies.list) d.shield = 0; },
  get stats() { return { shots, hitsN, headsN, streak, hitstop }; },
};
