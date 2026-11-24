// 경기장 거품 시안 (bubble.html, 기획 단계 — 실제 게임에는 아직 없음):
// 광장에서 경기 중인 탁구대 쪽으로 걸어가 원(7m) 안에 들어가면 광장 → 방장 배경으로, 나오면(9m) 다시 광장으로 바뀌는 효과 3가지.
//   A 물방울 돔 · B 빛의 커튼 · C 반짝 섬광
// 두 장면(광장·경기장)을 각각 그림으로 그린 뒤, 바뀌는 0.8초 동안만 두 그림을 섞는다(화면 효과).
// 경기장은 광장 탁구대 자리에 맞춰 돌려 놓은 것처럼 계산해서, 걸어가던 카메라가 그대로 이어진다.
// 주소: ?fx=A|B|C · ?arena=beach · ?p=0.5 (멈춘 화면, 스크린샷용) · ?t=초 (그 시각 한 장면, 영상용)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import * as THREE from 'three';
import { PLAZA } from './arena-plaza.js';
import { applyLook } from './items.js';
import { CHAR_Z, createWorld, makeCharacter } from './scene.js';

const Q = new URLSearchParams(location.search);
let FX = (Q.get('fx') || 'A').toUpperCase();
const ARENA = Q.get('arena') || 'beach';
const canvas = document.getElementById('c');
const world = createWorld(canvas);
const { renderer, scene, camera } = world;
world.setTable('blue');

// ───── 장면 배치 ─────
const T = PLAZA.tables[0]; // 1번 탁구대 (광장 좌표)
// 광장 좌표 → 경기장 좌표 (광장 탁구대는 긴 쪽이 x, 경기 탁구대는 가운데 원점·긴 쪽 z. plazaLive.js와 같은 90° 돌림)
const toArena = (x, z) => [z - T.z, -(x - T.x)];
const me = makeCharacter('#e0333c');
me.setTag('나', true, '');
applyLook(me, { body: 'body_hoodie' });
scene.add(me.group);
// 선수 둘 (경기장에서만): 방장 배경에서 랠리 중
const players = [world.team[0][0], world.team[1][0]];
applyLook(players[0], { paddle: 'paddle_pan', head: 'head_chef', body: 'body_apron' });
applyLook(players[1], {});
// 걷는 길: 처음 서는 곳 쪽에서 1번 탁구대로 (원 경계 7m를 지나 5m까지), 그다음 돌아 나옴 (9m)
const TC = [T.x, T.z];
const START = [T.x + 11.5, T.z + 3.5], NEAR = [T.x + 4.6, T.z + 1.2];
const dist = (p) => Math.hypot(p[0] - TC[0], p[1] - TC[1]);
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const LOOP = 14; // 초: 걸어 들어감(0~4) → 구경(4~7) → 걸어 나옴(7~11) → 광장(11~14)
function walkPos(t) {
  const u = t % LOOP;
  if (u < 4) return { p: lerp2(START, NEAR, u / 4), dir: 1 };
  if (u < 7) return { p: NEAR, dir: 0 };
  if (u < 11) return { p: lerp2(NEAR, START, (u - 7) / 4), dir: -1 };
  return { p: START, dir: 0 };
}
// 원: 들어가기 7m · 나가기 9m. 경계를 지나면 0.8초 동안 바뀜
const IN_R = 7, OUT_R = 9, DUR = 0.8;
let inside = false, k = 0; // k: 0 = 광장, 1 = 경기장 (바뀌는 중엔 사이)

// ───── 두 장면을 그림으로 ─────
const rtA = new THREE.WebGLRenderTarget(4, 4, { samples: 4 }), rtB = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
for (const rt of [rtA, rtB]) rt.texture.colorSpace = THREE.SRGBColorSpace;
const mix = new THREE.ShaderMaterial({
  uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, p: { value: 0 }, mode: { value: 0 }, c: { value: new THREE.Vector2(0.5, 0.5) }, asp: { value: 1 }, time: { value: 0 }, dir: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    precision highp float;
    varying vec2 vUv; uniform sampler2D tA, tB; uniform float p, mode, asp, time, dir; uniform vec2 c;
    float h(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec4 A = texture2D(tA, uv), B = texture2D(tB, uv);
      vec3 col;
      if (mode < 0.5) {
        // A 물방울 돔: 탁구대에서 투명한 거품이 부풀어 나를 지나간다. 거품 안 = 경기장, 테두리는 무지갯빛으로 휘어 보임
        vec2 d = (uv - c) * vec2(asp, 1.);
        float r = length(d), R = p * 2.1;
        float edge = smoothstep(0.075, 0., abs(r - R)) * step(0.001, p) * step(p, 0.999);
        vec2 n = r > 0. ? d / r : vec2(0.);
        vec2 off = n * edge * 0.035 / vec2(asp, 1.);
        vec4 A2 = texture2D(tA, uv + off), B2 = texture2D(tB, uv - off);
        float inB = smoothstep(R + 0.01, R - 0.01, r);
        col = mix(A2.rgb, B2.rgb, inB);
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (r * 3. - time * 0.6 + vec3(0., .33, .67)));
        col += edge * (0.35 * rainbow + 0.35);
        col += smoothstep(R, R - 0.25, r) * (1. - inB) * 0.;
      } else if (mode < 1.5) {
        // B 빛의 커튼: 위에서 아래로 밝은 띠가 쓸고 지나가며 바뀜. 띠 둘레에 세로 빛줄기
        float y = 1. - uv.y;
        float line = p * 1.3 - 0.15;
        float wave = sin(uv.x * 40. + time * 6.) * 0.006 + sin(uv.x * 9. - time * 2.) * 0.012;
        float inB = smoothstep(line + 0.01, line - 0.01, y + wave);
        col = mix(A.rgb, B.rgb, inB);
        float band = exp(-pow((y + wave - line) / 0.035, 2.)) * step(0.001, p) * step(p, 0.999);
        float rays = pow(0.5 + 0.5 * sin(uv.x * 140. + h(vec2(floor(uv.x * 70.), 0.)) * 6.), 6.);
        float trail = smoothstep(0.35, 0., line - y) * step(y, line) * step(0.001, p) * step(p, 0.999);
        col += band * vec3(1.0, 0.93, 0.7) * 1.4 + trail * rays * vec3(1., .85, .5) * 0.35;
      } else {
        // C 반짝 섬광: 가운데에서 하얗게 번쩍 → 그 순간 바뀜, 반짝이가 흩어짐
        float inB = smoothstep(0.45, 0.55, p);
        col = mix(A.rgb, B.rgb, inB);
        float flash = exp(-pow((p - 0.5) / 0.13, 2.));
        vec2 d = (uv - c) * vec2(asp, 1.);
        col = mix(col, vec3(1.), flash * (0.75 + 0.25 * smoothstep(0.9, 0., length(d))));
        vec2 g = floor(uv * vec2(asp, 1.) * 38.);
        float s = h(g), tw = smoothstep(0.985, 1., s) * smoothstep(0.15, 0.5, p) * smoothstep(1., 0.7, p);
        vec2 f = fract(uv * vec2(asp, 1.) * 38.) - 0.5;
        float star = max(0., 1. - length(f) * 3.) + max(0., 1. - abs(f.x) * 14.) * max(0., 1. - abs(f.y) * 2.5) + max(0., 1. - abs(f.y) * 14.) * max(0., 1. - abs(f.x) * 2.5);
        col += tw * star * vec3(1., .95, .7) * 1.2;
      }
      gl_FragColor = vec4(col, 1.);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false,
});
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mix));

function resize() {
  const w = innerWidth, hgt = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, hgt, false);
  rtA.setSize(w * dpr, hgt * dpr); rtB.setSize(w * dpr, hgt * dpr);
  camera.aspect = w / hgt; camera.updateProjectionMatrix();
  mix.uniforms.asp.value = w / hgt;
}
addEventListener('resize', resize);
resize();

// 3인칭 카메라 (광장 좌표): 내 뒤 위에서 탁구대 쪽을 본다
function camFor(p) {
  const dx = TC[0] - p[0], dz = TC[1] - p[1], L = Math.hypot(dx, dz) || 1;
  const back = 5.2;
  return { pos: [p[0] - (dx / L) * back + 0.8, 3.2, p[1] - (dz / L) * back], look: [p[0] + (dx / L) * 2.5, 0.9, p[1] + (dz / L) * 2.5] };
}
const v3 = (a) => new THREE.Vector3(...a);
function placeCam(c, arena) {
  if (!arena) { camera.position.set(...c.pos); camera.lookAt(...c.look); return; }
  const [px, pz] = toArena(c.pos[0], c.pos[2]), [lx, lz] = toArena(c.look[0], c.look[2]);
  camera.position.set(px, c.pos[1], pz); camera.lookAt(lx, c.look[1], lz);
}
function placeMe(p, yaw, arena, now, moving) {
  const [x, z] = arena ? toArena(p[0], p[1]) : p;
  me.group.position.set(x, 0, z);
  me.group.rotation.y = yaw + (arena ? Math.PI / 2 : 0);
  me.body.position.y = moving ? Math.abs(Math.sin(now * 11)) * 0.07 : 0;
}
// 경기장의 랠리 (보기만): 공이 두 선수 사이를 오간다
function rally(now) {
  const per = 1.1, u = (now % (per * 2)) / per, side = u < 1 ? 0 : 1, f = u % 1;
  const z0 = (side === 0 ? 1 : -1) * CHAR_Z * 0.92, z1 = -z0;
  const x = Math.sin(now * 0.9) * 0.35;
  world.ball.position.set(x, 0.95 + Math.sin(f * Math.PI) * 0.45, z0 + (z1 - z0) * f);
  world.ball.visible = true;
  players[0].group.position.set(x * 0.6, 0, CHAR_Z); players[0].group.rotation.y = 0;
  players[1].group.position.set(x * 0.6, 0, -CHAR_Z); players[1].group.rotation.y = Math.PI;
  for (const c of players) { c.group.visible = true; c.setOpacity(1, 1); c.setTag(c === players[0] ? '김제빵' : '친구', false, ''); }
  players[side].arm.rotation.set(-0.2, -0.3 + Math.sin(f * Math.PI) * 0.9, 0.1);
}
function setPlayersVisible(on) {
  for (const side of world.team) for (const c of side) c.group.visible = false;
  if (on) for (const c of players) c.group.visible = true;
  world.ball.visible = on;
  world.ring.visible = false; world.aim.visible = false;
}

// ───── 매 프레임 ─────
const fixedP = Q.has('p') ? +Q.get('p') : null;
let fixedT = Q.has('t') ? +Q.get('t') : null;
const MANUAL = Q.has('manual'); // 영상 찍기: 한 장씩 그림 (window.__bubble.draw(t))
let last = performance.now() / 1000, simT = 0;
function frame() {
  const real = performance.now() / 1000, dt = Math.min(0.05, real - last);
  last = real;
  simT += dt;
  const now = fixedT != null ? fixedT : simT;
  // 걷기 + 원 들어가고 나가기
  const w = walkPos(now);
  const d = dist(w.p);
  let p;
  if (fixedP != null) { p = fixedP; inside = p > 0.5; }
  else if (fixedT != null) {
    // 영상용: 그 시각의 진행도를 계산 (경계를 지난 시각부터 0.8초)
    const tIn = timeAt(IN_R, 1), tOut = timeAt(OUT_R, -1), u = now % LOOP;
    p = u < tIn ? 0 : u < tOut ? Math.min(1, (u - tIn) / DUR) : Math.max(0, 1 - (u - tOut) / DUR);
  } else {
    if (!inside && d < IN_R) inside = true;
    else if (inside && d > OUT_R) inside = false;
    k += (inside ? 1 : -1) * dt / DUR;
    k = Math.max(0, Math.min(1, k));
    p = k;
  }
  const yaw = w.dir >= 0 ? Math.atan2(-(TC[0] - w.p[0]), -(TC[1] - w.p[1])) : Math.atan2(TC[0] - w.p[0], TC[1] - w.p[1]);
  const cam = camFor(w.p);
  world.setArena(ARENA); // 배경 코드는 처음에 늦게 받으므로 매 프레임 불러 둔다 (게임 루프와 같음)
  rally(now);
  // 효과 가운데 = 화면에서 탁구대 자리
  placeCam(cam, false);
  camera.updateMatrixWorld();
  const sc = v3([TC[0], 0.8, TC[1]]).project(camera);
  mix.uniforms.c.value.set(sc.x * 0.5 + 0.5, sc.y * 0.5 + 0.5);
  mix.uniforms.p.value = p;
  mix.uniforms.mode.value = { A: 0, B: 1, C: 2 }[FX] ?? 0;
  mix.uniforms.time.value = now;
  // 광장 그림
  if (p < 1) {
    world.setPlaza(true);
    setPlayersVisible(false);
    placeMe(w.p, yaw, false, now, w.dir !== 0);
    placeCam(cam, false);
    renderer.setRenderTarget(rtA);
    world.render();
  }
  // 경기장 그림
  if (p > 0) {
    world.setPlaza(false);
    setPlayersVisible(true);
    rally(now);
    placeMe(w.p, yaw, true, now, w.dir !== 0);
    placeCam(cam, true);
    renderer.setRenderTarget(rtB);
    world.render();
  }
  if (p <= 0) mix.uniforms.tB.value = rtA.texture; else mix.uniforms.tB.value = rtB.texture;
  if (p >= 1) mix.uniforms.tA.value = rtB.texture; else mix.uniforms.tA.value = rtA.texture;
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
  label(d, p);
  if (!MANUAL) requestAnimationFrame(frame);
}
// 걷는 길에서 거리 r을 지나는 시각 (dir 1 = 들어갈 때, -1 = 나올 때)
function timeAt(r, dir) {
  for (let u = 0; u < LOOP; u += 0.01) {
    const w = walkPos(u);
    if (w.dir === dir && (dir > 0 ? dist(w.p) < r : dist(w.p) > r)) return u;
  }
  return LOOP;
}
const NAMES = { A: 'A 물방울 돔', B: 'B 빛의 커튼', C: 'C 반짝 섬광' };
function label(d, p) {
  document.getElementById('info').textContent = `${NAMES[FX]} · 탁구대까지 ${d.toFixed(1)}m · ${p <= 0 ? '광장' : p >= 1 ? '경기장 (방장 배경)' : '바뀌는 중'}`;
}
for (const b of document.querySelectorAll('[data-fx]')) {
  b.classList.toggle('on', b.dataset.fx === FX);
  b.addEventListener('click', () => { FX = b.dataset.fx; for (const x of document.querySelectorAll('[data-fx]')) x.classList.toggle('on', x.dataset.fx === FX); simT = 0; k = 0; inside = false; });
}
window.__bubble = { world, draw(t) { fixedT = t; frame(); }, timeAt };
if (MANUAL) { (function warm() { world.setArena(ARENA); fixedT = 0; frame(); if (world.arenaId !== ARENA) setTimeout(warm, 200); })(); } else requestAnimationFrame(frame);
