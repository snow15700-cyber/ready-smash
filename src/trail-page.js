// 찬스볼 잔상 시안 (trail.html): 상대가 BAD로 친 찬스볼이 날아오는 장면을 되풀이한다. 보기만, 저장 없음
// 주소 옵션: ?v=wave (모양), &cam=side (관전 화면), &t=0.4 (친 뒤 몇 초에서 멈춤 — 스크린샷용)
import * as THREE from 'three';
import { createWorld } from './scene.js';
import { planShot, simulate, findIdealHit, ballPos, HIT_Z, TY } from './physics.js';
import { armPose } from './game.js';

const VARIANTS = {
  dots: '지금 잔상 (동그라미 7개, 비교용)',
  wave: '① 살랑 물결 — 가는 줄이 좌우로 살랑',
  spiral: '② 나선 — 공 길을 빙글빙글 감아 돎',
  twin: '③ 두 줄 꼬임 — 두 줄이 엇갈려 꼬임',
  wide: '④ 출렁 띠 — 꼬리로 갈수록 크게 출렁',
};
const params = new URLSearchParams(location.search);
const opt = { v: params.get('v') || 'wave', cam: params.get('cam') || 'game' };
const fixT = params.has('t') ? Number(params.get('t')) : null;

const canvas = document.getElementById('c');
const world = createWorld(canvas);
const { scene, camera, chars } = world;
function resize() { world.renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
// 지금 잔상(하얀 동그라미 7개) 찾기 — 물결 시안일 때는 숨긴다
const dots = scene.children.filter((o) => o.isMesh && o.geometry.type === 'SphereGeometry' && o.material.transparent && o.material.opacity <= 0.29);

// ── 물결 띠: 카메라를 향한 납작한 띠, 꼬리로 갈수록 흐려짐 ──
const MAXP = 240;
function ribbon() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 2 * 3), 3));
  g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(MAXP * 2), 1));
  const idx = [];
  for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(1.0,1.0,1.0,vA); }',
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
const ribbons = [ribbon(), ribbon()];

const tg = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Vector3();
// pts: 공이 지나온 길 [공 쪽 → 친 곳], fade: 튄 뒤 사라지는 정도(1 → 0), time: 물결이 흐르게
function drawRibbon(mesh, pts, shape, time, fade, flip = 1) {
  const pos = mesh.geometry.attributes.position.array, al = mesh.geometry.attributes.alpha.array;
  const n = Math.min(pts.length, MAXP);
  let s = 0;
  for (let i = 0; i < MAXP; i++) {
    const k = Math.min(i, n - 1);
    const p = pts[k], pn = pts[Math.min(k + 1, n - 1)], pp = pts[Math.max(k - 1, 0)];
    if (i > 0 && i < n) s += p.distanceTo(pts[k - 1]);
    tg.subVectors(pp, pn).normalize();
    view.subVectors(camera.position, p).normalize();
    nrm.crossVectors(tg, view).normalize(); // 화면에서 공 길에 수직 (어느 쪽에서 봐도 물결이 보이게)
    bin.crossVectors(nrm, tg).normalize();
    const u = n > 1 ? k / (n - 1) : 0; // 0 = 공, 1 = 꼬리
    const ph = s * shape.freq - time * shape.speed;
    const grow = shape.grow ? Math.min(1, s / 0.5) : Math.min(1, s / 0.12); // 공 바로 뒤에서는 작게 시작
    const amp = shape.amp * grow;
    q.copy(p);
    if (shape.kind === 'spiral') q.addScaledVector(nrm, Math.cos(ph) * amp * flip).addScaledVector(bin, Math.sin(ph) * amp);
    else q.addScaledVector(nrm, Math.sin(ph) * amp * flip);
    view.subVectors(camera.position, q).normalize();
    side.crossVectors(tg, view).normalize().multiplyScalar(shape.w * (1 - u * 0.6) * 0.5);
    pos.set([q.x + side.x, q.y + side.y, q.z + side.z, q.x - side.x, q.y - side.y, q.z - side.z], i * 6);
    const a = i < n ? shape.alpha * Math.pow(1 - u, 1.3) * Math.min(1, s / 0.05) * fade : 0;
    al[i * 2] = al[i * 2 + 1] = a;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.alpha.needsUpdate = true;
  mesh.visible = n > 1;
}
const SHAPES = {
  wave: { kind: 'wave', amp: 0.045, freq: 20, speed: 9, w: 0.022, alpha: 0.75 },
  spiral: { kind: 'spiral', amp: 0.045, freq: 24, speed: 12, w: 0.02, alpha: 0.75 },
  twin: { kind: 'wave', amp: 0.04, freq: 18, speed: 9, w: 0.016, alpha: 0.7 },
  wide: { kind: 'wave', amp: 0.08, freq: 10, speed: 6, w: 0.04, alpha: 0.55, grow: true },
};

// ── 찬스볼 한 번: 상대(쪽 1)가 BAD로 침 → 내 쪽에 튐 → 내가 침 ──
let rally = null, seed = 7;
function newRally(now) {
  const from = [0.15, TY + 0.25, -HIT_Z];
  const v = planShot(from, 1, 'bad', [-1, 0, 1][seed % 3], seed++);
  const segs = simulate(from, v, now + 0.5, 'hit', { side: 1, grade: 'bad' });
  const bounce = segs.find((s, i) => i > 0 && s.ev === 'table');
  const hit = findIdealHit(segs, 0);
  rally = { segs, t0: segs[0].t0, tb: bounce.t0, hit, swung: [false, false] };
}

// 단추
const bar = document.getElementById('bar');
for (const [k, list] of [['v', Object.keys(VARIANTS)], ['cam', ['game', 'side']]]) {
  for (const v of list) {
    const b = document.createElement('button');
    b.textContent = k === 'cam' ? (v === 'game' ? '선수 화면' : '관전 화면') : (v === 'dots' ? '지금' : VARIANTS[v].slice(0, 1));
    b.onclick = () => { opt[k] = v; sync(); };
    b.dataset.k = k; b.dataset.v = v;
    bar.appendChild(b);
  }
}
function sync() {
  bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', opt[b.dataset.k] === b.dataset.v));
  document.getElementById('cap').textContent = VARIANTS[opt.v];
  const q2 = new URLSearchParams(opt); if (fixT != null) q2.set('t', fixT);
  history.replaceState(null, '', '?' + q2);
}
sync();

const start = performance.now() / 1000;
let last = start;
function loop() {
  const real = performance.now() / 1000;
  const dt = Math.min(0.05, real - last); last = real;
  let now = real;
  if (!rally) newRally(fixT != null ? start - 0.5 : real);
  if (fixT != null) now = rally.t0 + fixT;
  else if (now > rally.hit.t + 0.7) newRally(real);
  const r = rally;
  const p = now >= r.t0 ? ballPos(r.segs, now) : r.segs[0].p;
  world.setBall(p, true);
  // 물결 잔상: 친 뒤 ~ 첫 튐까지. 튄 뒤 0.12초 동안 빠르게 사라짐
  const wavy = opt.v !== 'dots';
  for (const d of dots) d.material.visible = !wavy;
  const fade = now < r.tb ? 1 : Math.max(0, 1 - (now - r.tb) / 0.12);
  if (wavy && now > r.t0 && fade > 0) {
    const end = Math.min(now, r.tb), pts = [];
    for (let t = end; t > r.t0; t -= 1 / 240) pts.push(new THREE.Vector3(...ballPos(r.segs, t)));
    pts.push(new THREE.Vector3(...ballPos(r.segs, r.t0)));
    if (now > r.tb) pts.unshift(new THREE.Vector3(...ballPos(r.segs, r.tb)));
    const sh = SHAPES[opt.v];
    drawRibbon(ribbons[0], pts, sh, now, fade, 1);
    if (opt.v === 'twin') drawRibbon(ribbons[1], pts, sh, now, fade, -1);
    else ribbons[1].visible = false;
  } else ribbons.forEach((m) => (m.visible = false));
  // 캐릭터
  for (const s of [0, 1]) {
    const c = chars[s], m = s === 0 ? 1 : -1;
    const tx = s === 0 ? r.hit.pos[0] - 0.38 : r.segs[0].p[0] + 0.38;
    c.group.position.set(tx, 0, m * 2.04);
    const remain = s === 0 ? r.hit.t - now : r.t0 - now;
    if (remain <= 0 && !r.swung[s] && fixT == null) { r.swung[s] = true; c.swingT = real; }
    armPose(c, now, remain, s === 0 ? r.hit.pos[1] : r.segs[0].p[1]);
  }
  if (opt.cam === 'side') world.updateSideCamera(fixT != null ? 1 : dt, p[2]);
  else world.updateCamera(0, chars[0].group.position.x, fixT != null ? 1 : dt, p[0]);
  world.render();
  requestAnimationFrame(loop);
}
window.__r = () => rally;
loop();
