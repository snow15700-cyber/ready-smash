// 경기장 거품 시안 (bubble.html, 기획 단계 — 실제 게임에는 아직 없음, docs/dev/plaza.md 16장):
// 광장에서 경기 중인 탁구대 쪽으로 걸어가 원(7m) 안에 들어가면, 탁구대에서부터 물결처럼
// 광장 물건이 하나둘 땅속으로 들어가고 그 경기의 배경(방장 배경) 물건이 하나둘 솟아난다. 원(9m) 밖으로 나오면 반대로.
//   1 = 하나둘 (물건만) · 2 = 섞은 것 (바닥에 주황 불꽃 고리 마법진 + 물결 앞에 불꽃)
// 두 세상을 한 장면에 겹쳐 둔다: 경기 좌표(탁구대 = 원점, 긴 쪽 z)를 기준으로, 광장은 1번 탁구대가 원점에 오게 돌려 놓음.
// 바닥·하늘처럼 큰 것은 물결 둘레(원)를 기준으로 안/밖을 잘라서 바꾸고, 작은 물건은 하나씩 줄어들며 사라지거나 튀어 오른다.
// 시안이라 배경을 합치지 않은 채(?nobake=1) 물건을 하나씩 움직인다 — 실제로 만들 땐 합친 채로 그래픽 카드가 하나씩 움직이게.
// 주소: ?fx=1|2 · ?arena=beach · ?manual=1 (영상 찍기: window.__bubble.draw(t))
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import * as THREE from 'three';
import { smoothstep as ease } from './util.js';
import { PLAZA } from './arena-plaza.js';
import { applyLook } from './items.js';
import { CHAR_Z, createWorld, makeCharacter } from './scene.js';

const Q = new URLSearchParams(location.search);
if (!Q.has('nobake')) { Q.set('nobake', '1'); location.replace('?' + Q.toString()); } // 물건을 하나씩 움직이려고 합치지 않음
let FX = Q.get('fx') === '2' ? '2' : '1';
const ARENA = Q.get('arena') || 'beach';
const MANUAL = Q.has('manual');
const world = createWorld(document.getElementById('c'));
const { renderer, scene, camera } = world;
world.setTable('blue');
world.setPlaza(true); // 광장을 한 번 지어 두고
world.setPlaza(false); // 이 시안에서는 보이기·하늘·빛을 직접 바꾼다
const hemi = scene.children.find((o) => o.isHemisphereLight), sun = scene.children.find((o) => o.isDirectionalLight);

// ───── 좌표 ─────
const T = PLAZA.tables[0];
const toArena = (x, z) => [z - T.z, -(x - T.x)]; // 광장 → 경기 좌표 (plazaLive.js와 같은 90° 돌림)
const TC = [T.x, T.z];
const START = [T.x + 11.5, T.z + 3.5], NEAR = [T.x + 4.6, T.z + 1.2];
const dist = (p) => Math.hypot(p[0] - TC[0], p[1] - TC[1]);
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const LOOP = 16; // 걸어 들어감(0~4) → 구경(4~8) → 걸어 나옴(8~12) → 광장(12~16)
function walkPos(t) {
  const u = ((t % LOOP) + LOOP) % LOOP;
  if (u < 4) return { p: lerp2(START, NEAR, u / 4), dir: 1 };
  if (u < 8) return { p: NEAR, dir: 0 };
  if (u < 12) return { p: lerp2(NEAR, START, (u - 8) / 4), dir: -1 };
  return { p: START, dir: 0 };
}
const IN_R = 7, OUT_R = 9, DUR = 2.0;
function timeAt(r, dir) {
  for (let u = 0; u < LOOP; u += 0.01) { const w = walkPos(u); if (w.dir === dir && (dir > 0 ? dist(w.p) < r : dist(w.p) > r)) return u; }
  return LOOP;
}
// 물결 반지름 (m): 처음 1.2초에 22m까지 천천히(가까운 물건이 하나둘), 그다음 먼 곳까지 빠르게
const waveR = (q) => (q <= 0 ? -1 : q < 0.6 ? 22 * Math.pow(q / 0.6, 1.3) : 22 + ((q - 0.6) / 0.4) * 420);

// ───── 사람 ─────
const me = makeCharacter('#e0333c');
me.setTag('나', true, '');
scene.add(me.group);
const players = [world.team[0][0], world.team[1][0]];
applyLook(players[0], { paddle: 'paddle_pan', head: 'head_chef', body: 'body_apron' });
applyLook(players[1], {});

// ───── 두 세상 나누기: 큰 것(바닥·하늘·먼 언덕)은 원으로 자르고, 작은 물건은 하나씩 ─────
function patchCut(mat, U) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uR = U.uR; sh.uniforms.uIn = U.uIn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uR, uIn;')
      .replace('void main() {', 'void main() {\n  float dd = length(vWp.xz);\n  if (uIn > 0.5 ? dd > uR : dd < uR) discard;');
  };
  m.customProgramCacheKey = () => 'cut' + mat.uuid;
  return m;
}
function split(root, extra = []) {
  const U = { uR: { value: -1 }, uIn: { value: 0 } };
  const units = [], box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  let i = 0;
  for (const o of [...root.children, ...extra]) {
    if (o.isLight) continue;
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getSize(size); box.getCenter(ctr);
    if (Math.max(size.x, size.z) > 24 || Math.hypot(ctr.x, ctr.z) > 60) {
      o.traverse((m) => { if (m.isMesh || m.isPoints || m.isLine) m.material = Array.isArray(m.material) ? m.material.map((x) => patchCut(x, U)) : patchCut(m.material, U); });
    } else {
      units.push({ o, d: Math.hypot(ctr.x, ctr.z) + (rnd(++i) - 0.5) * 3, s0: o.scale.clone(), y0: o.position.y, h: size.y });
    }
  }
  return { root, U, units };
}
let P = null, A = null; // 광장 · 경기장
function prepare() {
  const plaza = world.plaza.root;
  plaza.rotation.y = Math.PI / 2; // 광장 1번 탁구대 → 경기 탁구대 자리 (긴 쪽 z)
  plaza.position.set(-T.z, 0, T.x); // 돌린 뒤 1번 탁구대가 원점에 오게
  plaza.updateMatrixWorld(true);
  P = split(plaza);
  A = split(world.arena.root, [world.table]);
  plaza.visible = true;
  world.arena.root.visible = true;
}
const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// q: 바뀌는 진행(0~1), enter: 광장 → 경기장
function applyWave(q, enter) {
  const R = waveR(q), W = 5; // W: 물건 하나가 사라지거나 솟는 데 걸리는 물결 폭(m)
  const go = enter ? P : A, come = enter ? A : P;
  go.U.uIn.value = 0; go.U.uR.value = R;
  come.U.uIn.value = 1; come.U.uR.value = R;
  go.root.visible = q < 1; come.root.visible = q > 0;
  if (go === A || come === A) world.table.visible = true;
  for (const u of go.units) {
    const k = Math.min(1, Math.max(0, (R - u.d) / W));
    const s = 1 - ease(k);
    u.o.visible = s > 0.01 && q < 1;
    u.o.scale.copy(u.s0).multiplyScalar(Math.max(0.001, s));
    u.o.position.y = u.y0 - ease(k) * u.h * 0.35; // 땅속으로 쏙
  }
  for (const u of come.units) {
    const k = Math.min(1, Math.max(0, (R - u.d) / W));
    u.o.visible = k > 0;
    u.o.scale.copy(u.s0).multiplyScalar(Math.max(0.001, k > 0 ? back(k) : 0));
    u.o.position.y = u.y0 - (1 - ease(k)) * u.h * 0.35; // 땅에서 뿅
  }
  // 하늘·안개·빛도 섞기
  const e = ease(enter ? q : 1 - q), a = world.plaza, b = world.arena;
  const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), e);
  scene.background = c(a.sky, b.sky);
  scene.fog = new THREE.Fog(c(a.sky, b.sky), a.fog[0] + (b.fog[0] - a.fog[0]) * e, a.fog[1] + (b.fog[1] - a.fog[1]) * e);
  hemi.color.copy(c(a.light.hemi[0], b.light.hemi[0])); hemi.groundColor.copy(c(a.light.hemi[1], b.light.hemi[1]));
  hemi.intensity = a.light.hemi[2] + (b.light.hemi[2] - a.light.hemi[2]) * e;
  sun.color.copy(c(a.light.sun[0], b.light.sun[0])); sun.intensity = a.light.sun[1] + (b.light.sun[1] - a.light.sun[1]) * e;
  if (camera.far !== 300) { camera.far = 300; camera.updateProjectionMatrix(); }
  return R;
}

// ───── 2 = 섞은 것: 바닥 불꽃 고리 마법진(원 7m) + 물결 앞 불꽃 ─────
function ringTex(dashes) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,140,30,0)'); grd.addColorStop(0.5, 'rgba(255,200,80,1)'); grd.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = grd;
  if (dashes) {
    for (let i = 0; i < dashes; i++) g.fillRect((i * 1024) / dashes, 0, (1024 / dashes) * 0.62, 64);
    g.fillStyle = 'rgba(255,230,150,.9)';
    for (let i = 0; i < dashes; i++) g.fillRect((i * 1024) / dashes + 6, 26, 6, 12);
  } else g.fillRect(0, 0, 1024, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 반지름 1짜리 띠 (scale로 키움). 텍스처가 둘레를 따라 감기도록 uv를 각도로
function band(inner, outer, tex) {
  const g = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 4, Math.hypot(pos.getX(i), pos.getY(i)) > (inner + outer) / 2 ? 1 : 0); }
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 3;
  return m;
}
const rune = band(0.96, 1.04, ringTex(24)); rune.scale.setScalar(IN_R);
const rune2 = band(0.9, 0.93, ringTex(60)); rune2.scale.setScalar(IN_R);
const front = band(0.93, 1.07, ringTex(0));
scene.add(rune, rune2, front);
const SPK = 500;
const spkGeo = new THREE.BufferGeometry();
spkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPK * 3), 3));
const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparks.frustumCulled = false;
scene.add(sparks);
const spk = Array.from({ length: SPK }, (_, i) => ({ a: (i / SPK) * Math.PI * 2 + Math.sin(i * 7.1), h: Math.sin(i * 3.7) * 0.5 + 0.5, v: 0.6 + (Math.sin(i * 1.3) * 0.5 + 0.5) * 1.6 }));
function fire(q, R, now, inside) {
  const on = FX === '2';
  rune.visible = rune2.visible = on;
  front.visible = sparks.visible = on && q > 0 && q < 1 && R < 60;
  if (!on) return;
  // 마법진: 천천히 돌고, 들어선 순간 번쩍 (물결이 시작될 때)
  const flash = q > 0 && q < 1 ? Math.exp(-Math.pow((q - 0.06) / 0.07, 2)) : 0;
  rune.rotation.z = now * 0.25; rune2.rotation.z = -now * 0.4;
  rune.material.opacity = Math.min(1, (inside ? 0.85 : 0.55) + flash * 0.6);
  rune2.material.opacity = Math.min(1, (inside ? 0.6 : 0.35) + flash * 0.5);
  rune.scale.setScalar(IN_R * (1 + flash * 0.06)); rune2.scale.setScalar(IN_R * (1 + flash * 0.06));
  // 물결 앞: 불꽃 띠 + 위로 튀는 불티
  front.scale.setScalar(Math.max(0.01, R));
  front.material.opacity = Math.max(0, 1 - R / 60);
  const pa = spkGeo.attributes.position;
  for (let i = 0; i < SPK; i++) {
    const s = spk[i], life = (now * s.v + s.h) % 1, r = Math.max(0, R - life * 0.6);
    pa.setXYZ(i, Math.cos(s.a + life * 0.2) * r, life * life * 1.8, Math.sin(s.a + life * 0.2) * r);
  }
  pa.needsUpdate = true;
  sparks.material.opacity = Math.max(0, 1 - R / 50);
}

// ───── 카메라·랠리 ─────
function camFor(p) {
  const dx = TC[0] - p[0], dz = TC[1] - p[1], L = Math.hypot(dx, dz) || 1;
  const pos = [p[0] - (dx / L) * 5.2 + 0.8, 3.2, p[1] - (dz / L) * 5.2], look = [p[0] + (dx / L) * 2.5, 0.9, p[1] + (dz / L) * 2.5];
  const [px, pz] = toArena(pos[0], pos[2]), [lx, lz] = toArena(look[0], look[2]);
  camera.position.set(px, pos[1], pz); camera.lookAt(lx, look[1], lz);
}
function rally(now) {
  const per = 1.1, u = (now % (per * 2)) / per, side = u < 1 ? 0 : 1, f = u % 1;
  const z0 = (side === 0 ? 1 : -1) * CHAR_Z * 0.92, z1 = -z0, x = Math.sin(now * 0.9) * 0.35;
  world.ball.position.set(x, 0.95 + Math.sin(f * Math.PI) * 0.45, z0 + (z1 - z0) * f);
  world.ball.visible = true;
  for (const sd of world.team) for (const c of sd) c.group.visible = false;
  players[0].group.position.set(x * 0.6, 0, CHAR_Z); players[0].group.rotation.y = 0;
  players[1].group.position.set(x * 0.6, 0, -CHAR_Z); players[1].group.rotation.y = Math.PI;
  for (const c of players) { c.group.visible = true; c.setOpacity(1, 1); c.setTag(c === players[0] ? '김제빵' : '친구', false, ''); }
  players[side].arm.rotation.set(-0.2, -0.3 + Math.sin(f * Math.PI) * 0.9, 0.1);
  world.ring.visible = false; world.aim.visible = false;
}

// ───── 매 프레임 ─────
let fixedT = null, simT = 0, last = performance.now() / 1000, inside = false, q = 0, enter = true;
function frame() {
  const real = performance.now() / 1000, dt = Math.min(0.05, real - last);
  last = real;
  if (!P) { if (!MANUAL) requestAnimationFrame(frame); return; }
  simT += dt;
  const now = fixedT != null ? fixedT : simT;
  const w = walkPos(now), d = dist(w.p);
  if (fixedT != null) {
    const tIn = timeAt(IN_R, 1), tOut = timeAt(OUT_R, -1), u = ((now % LOOP) + LOOP) % LOOP;
    if (u < tIn) { enter = true; q = 0; } else if (u < tOut) { enter = true; q = Math.min(1, (u - tIn) / DUR); } else { enter = false; q = Math.min(1, (u - tOut) / DUR); }
    inside = u >= tIn && u < tOut;
  } else {
    if (!inside && d < IN_R) { inside = true; enter = true; q = 0; }
    else if (inside && d > OUT_R) { inside = false; enter = false; q = 0; }
    q = Math.min(1, q + dt / DUR);
    if (!inside && enter) q = 0; // 아직 광장
  }
  const R = applyWave(q, enter);
  fire(q, R, now, inside);
  rally(now);
  const yaw = w.dir >= 0 ? Math.atan2(-(TC[0] - w.p[0]), -(TC[1] - w.p[1])) : Math.atan2(TC[0] - w.p[0], TC[1] - w.p[1]);
  const [mx, mz] = toArena(w.p[0], w.p[1]);
  me.group.position.set(mx, 0, mz); me.group.rotation.y = yaw + Math.PI / 2;
  me.body.position.y = w.dir !== 0 ? Math.abs(Math.sin(now * 11)) * 0.07 : 0;
  camFor(w.p);
  world.render();
  const atArena = (enter && q >= 1) || (!enter && q <= 0), atPlaza = (enter && q <= 0) || (!enter && q >= 1);
  document.getElementById('info').textContent = `${FX === '2' ? '2 섞은 것 (불꽃 고리)' : '1 하나둘'} · 탁구대까지 ${d.toFixed(1)}m · ${atArena ? '경기장 (방장 배경)' : atPlaza ? '광장' : '바뀌는 중'}`;
  if (!MANUAL) requestAnimationFrame(frame);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
resize();
for (const b of document.querySelectorAll('[data-fx]')) {
  b.classList.toggle('on', b.dataset.fx === FX);
  b.addEventListener('click', () => { FX = b.dataset.fx; for (const x of document.querySelectorAll('[data-fx]')) x.classList.toggle('on', x.dataset.fx === FX); simT = 0; q = 0; inside = false; enter = true; });
}
// 경기장 배경을 받아 지을 때까지 기다렸다가 두 세상을 겹친다
(function wait() {
  world.setArena(ARENA);
  if (world.arenaId === ARENA && world.plaza) { prepare(); if (!MANUAL) requestAnimationFrame(frame); return; }
  world.render();
  setTimeout(wait, 150);
})();
window.__bubble = { world, get ready() { return !!P; }, draw(t) { fixedT = t; frame(); }, timeAt };
