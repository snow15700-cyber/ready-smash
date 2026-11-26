// 경기장 거품 효과 (docs/dev/plaza.md 16장, 사용자 확정 = '2 섞은 것'): 탁구대(세상 원점)에서 바깥으로 물결이 퍼지며
// 떠나는 세상(광장 또는 경기장)의 물건은 하나둘 줄어들며 땅속으로, 오는 세상의 물건은 하나둘 '뿅' 솟아난다.
// 바닥·하늘·먼 언덕처럼 큰 것은 물결 원을 경계로 안/밖을 잘라서 바꾼다. 시안은 bubble.html.
// - 합친 배경(arena-bake.js)의 메시는 꼭짓점마다 물건 가운데(piv)가 있어 그래픽 카드가 물건마다 따로 움직인다 (느린 PC도 가볍게).
// - 합치지 않은 물건(움직이는 것·반투명 등)은 자바스크립트로 물건마다 크기를 바꾼다.
import * as THREE from 'three';
import { smoothstep as ease } from './util.js';

export const WAVE_DUR = 2.0; // 초
// 물결 반지름(m): 처음 1.2초에 22m까지 천천히(가까운 물건이 하나둘), 그다음 먼 곳까지 빠르게
export const waveR = (q) => (q <= 0 ? -1 : q >= 1 ? 1e5 : q < 0.6 ? 22 * Math.pow(q / 0.6, 1.3) : 22 + ((q - 0.6) / 0.4) * 420);
const W = 5; // 물건 하나가 사라지거나 솟는 동안 물결이 가는 거리(m)
const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

const VERT_HEAD = `
uniform float uR, uMode, uKind; uniform mat4 uRootM;
attribute vec4 piv;
varying vec3 vWp; varying float vBig;
float bkE(float t) { float c = 1.9; return 1.0 + (c + 1.0) * pow(t - 1.0, 3.0) + c * pow(t - 1.0, 2.0); }`;
const VERT_BODY = `
  vBig = uKind > 1.5 ? 0.0 : piv.w; // 2 = 따로 움직이는 물건(물결은 자바스크립트가), 투명 구멍만
  if (uKind < 1.5 && piv.w < 0.5 && uMode > -0.5) {
    vec3 pw = (uRootM * vec4(piv.xyz, 1.0)).xyz;
    float k = clamp((uR - length(pw.xz)) / ${W.toFixed(1)}, 0.0, 1.0);
    float s = uMode > 0.5 ? (k > 0.0 ? bkE(k) : 0.0) : 1.0 - k * k * (3.0 - 2.0 * k);
    float h = max(0.3, transformed.y - piv.y);
    transformed = piv.xyz + (transformed - piv.xyz) * max(s, 0.0);
    transformed.y -= (uMode > 0.5 ? 1.0 - k : k) * 0.35 * h;
  }`;
const FRAG_HEAD = 'uniform float uR, uMode, uCut; uniform vec3 uCam, uMe; varying vec3 vWp; varying float vBig;';
const FRAG_BODY = `
  if (vBig > 0.5 && uMode > -0.5) { float dd = length(vWp.xz); if (uMode > 0.5 ? dd > uR : dd < uR) discard; }
  // 투명 구멍: 카메라와 내 캐릭터 사이를 가리는 벽·물건은 그 자리만 뚫어서 보이게 (바닥은 그대로)
  if (uCut > 0.5 && vWp.y > 0.12) {
    vec3 ab = uMe - uCam; float L = length(ab); vec3 dv = ab / max(L, 0.001);
    float tt = dot(vWp - uCam, dv);
    if (tt > 0.3 && tt < L - 0.7) { float rr = 0.55 + 0.75 * clamp(tt / L, 0.0, 1.0); if (length(vWp - (uCam + dv * tt)) < rr) discard; }
  }`;

// 재질에 물결·투명 구멍 셰이더를 넣는다. kind: 'piv' = 합친 메시(물건마다 셰이더로) · 'big' = 원으로 자르기 · 'unit' = 투명 구멍만
// (배경이 원래 쓰던 셰이더 바꾸기가 있으면 그걸 먼저 하고 덧붙임)
function patch(m, U, { pivAttr, kind = pivAttr ? 'piv' : 'big' }) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  const KU = { value: kind === 'unit' ? 2 : kind === 'big' ? 1 : 0 };
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, U, { uKind: KU });
    let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + (pivAttr ? VERT_HEAD : VERT_HEAD.replace('attribute vec4 piv;', 'const vec4 piv = vec4(0.0, 0.0, 0.0, 1.0);')));
    v = v.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    v = v.replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.vertexShader = v;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD).replace('void main() {', 'void main() {' + FRAG_BODY);
  };
  m.customProgramCacheKey = () => 'wave' + kind + (prevKey ? prevKey() : '');
  m.needsUpdate = true;
}

// 한 세상(root)을 물결 효과용으로 준비 (한 번). extra = root 밖이지만 같이 움직일 물건(경기장 탁구대 등)
export function prepWave(root, extra = []) {
  if (root.userData.wave) return root.userData.wave;
  const U = { uR: { value: -1 }, uMode: { value: -1 }, uRootM: { value: root.matrixWorld }, uCut: { value: 0 }, uCam: { value: new THREE.Vector3() }, uMe: { value: new THREE.Vector3() } };
  const done = new WeakSet();
  const units = [];
  const box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  let i = 0;
  const jitter = () => { const x = Math.sin(++i * 12.9898) * 43758.5453; return (x - Math.floor(x) - 0.5) * 3; };
  for (const o of [...root.children, ...extra]) {
    if (o.isLight) continue;
    if (o.userData.piv) { // 합친 메시: 셰이더가 물건마다
      for (const mm of [].concat(o.material)) { patch(mm, U, { pivAttr: true }); done.add(mm); }
      continue;
    }
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    box.getSize(size); box.getCenter(ctr);
    if (Math.max(size.x, size.z) > 24 || Math.hypot(ctr.x, ctr.z) > 60) {
      // 큰 것: 원으로 자르기 (재질을 복사해서 이 물건만)
      o.traverse((m) => {
        if (!(m.isMesh || m.isPoints || m.isLine)) return;
        m.material = Array.isArray(m.material) ? m.material.map((x) => { const c = x.clone(); patch(c, U, { pivAttr: false }); done.add(c); return c; }) : (() => { const c = m.material.clone(); patch(c, U, { pivAttr: false }); done.add(c); return c; })();
      });
    } else {
      const local = extra.includes(o) ? ctr.clone() : ctr.clone().applyMatrix4(inv);
      units.push({ o, c: local, own: extra.includes(o), d0: jitter(), s0: o.scale.clone(), y0: o.position.y, h: size.y });
    }
  }
  // 나머지(따로 움직이는 물건) 재질: 투명 구멍만
  root.traverse((m) => {
    if (!m.isMesh) return;
    for (const mm of [].concat(m.material)) if (mm && !done.has(mm) && !mm.isShaderMaterial && !mm.isRawShaderMaterial) { patch(mm, U, { pivAttr: false, kind: 'unit' }); done.add(mm); }
  });
  root.userData.wave = { U, units, root };
  return root.userData.wave;
}

// 투명 구멍 켜기/끄기 (cam·me = 세상 좌표)
export function setCut(wv, on, cam, me) {
  wv.U.uCut.value = on ? 1 : 0;
  if (on) { wv.U.uCam.value.copy(cam); wv.U.uMe.value.copy(me); }
}
// mode: 'come' = 오는 세상(물결 안쪽부터 나타남) · 'go' = 떠나는 세상(물결 안쪽부터 사라짐) · 'off' = 효과 없이 그대로
export function applyWave(wv, R, mode) {
  const { U, units, root } = wv;
  U.uR.value = R;
  U.uMode.value = mode === 'come' ? 1 : mode === 'go' ? 0 : -1;
  root.updateMatrixWorld();
  const p = new THREE.Vector3();
  for (const u of units) {
    if (mode === 'off') { u.o.scale.copy(u.s0); u.o.position.y = u.y0; u.o.visible = true; continue; }
    p.copy(u.c);
    if (!u.own) p.applyMatrix4(root.matrixWorld);
    const k = Math.min(1, Math.max(0, (R - (Math.hypot(p.x, p.z) + u.d0)) / W));
    const s = mode === 'come' ? (k > 0 ? back(k) : 0) : 1 - ease(k);
    u.o.visible = s > 0.01;
    u.o.scale.copy(u.s0).multiplyScalar(Math.max(0.001, s));
    u.o.position.y = u.y0 - (mode === 'come' ? 1 - ease(k) : ease(k)) * u.h * 0.35;
  }
}
