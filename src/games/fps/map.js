// FPS 네온 맵 (fps.md 8장 '어둡지만 잘 보이게'): 배경은 어둡게, 바닥·벽 윤곽은 밝은 네온.
// 빛 번짐 후처리 없이, 상자 면마다 '모서리에서 멀어질수록 옅어지는 빛'을 셰이더로 그려 번짐을 흉내 낸다 (교육장 PC도 가볍게).
// 바닥에는 점프대·발판 둘레에 색 빛이 비치게 (principles.md 3번 '효과의 빛이 바닥에 비치면')
import * as THREE from 'three';
import { rng } from '../../util.js';

export const BG = new THREE.Color('#0b0c22'); // 배경(하늘·안개) — 아주 어둡지는 않은 남색
export const NEON = { wall: '#3ff2ff', mid: '#ff4fe0', pad: '#ffd84a', crate: '#ff8a1f', sky: '#6a5cff' };
const HALF = 20; // 맵 한 변 40m

// 안개: 멀수록 배경색으로 (셰이더마다 똑같이)
const FOG = /* glsl */ `
  uniform vec3 uBg;
  vec3 fogMix(vec3 c, float dist) { float f = 1.0 - exp(-dist * 0.018); return mix(c, uBg, clamp(f, 0.0, 0.75)); }
`;

// 네온 상자: 어두운 면 + 모서리 빛. 면 위 점에서 가장 가까운 모서리까지 거리(m)로 빛 세기를 정한다
function boxMat(size, neon, { base = '#141632', line = 0.03, glow = 0.22, k = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uHalf: { value: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2) }, uNeon: { value: new THREE.Color(neon) }, uBase: { value: new THREE.Color(base) }, uBg: { value: BG }, uK: { value: k } },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN; varying float vDist;
      void main() { vP = position; vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHalf, uNeon, uBase; uniform float uK; varying vec3 vP; varying vec3 vN; varying float vDist;
      ${FOG}
      void main() {
        vec3 a = abs(vN); vec3 d = uHalf - abs(vP);
        // 면의 법선 쪽 축은 빼고 나머지 두 축 중 가까운 모서리
        float e = a.x > 0.5 ? min(d.y, d.z) : a.y > 0.5 ? min(d.x, d.z) : min(d.x, d.y);
        float core = smoothstep(${line.toFixed(3)} + 0.012, ${line.toFixed(3)}, e);
        float halo = exp(-e / ${glow.toFixed(3)}) * 0.55;
        // 면은 위쪽이 조금 밝게(위에서 빛이 오는 느낌), 옆면은 높이에 따라 살짝 그러데이션
        float shade = a.y > 0.5 ? (vN.y > 0.0 ? 1.25 : 0.6) : 0.85 + 0.25 * (vP.y / max(uHalf.y, 0.01));
        vec3 c = uBase * shade + uNeon * (halo + core * 1.3) * uK;
        gl_FragColor = vec4(fogMix(c, vDist), 1.0);
      }`,
  });
}

// 바닥: 2m 격자(옅게) + 8m 격자(조금 진하게) + 빛 웅덩이(점프대·발판 색이 바닥에 비침)
function floorMat(glows) {
  const n = glows.length;
  return new THREE.ShaderMaterial({
    uniforms: { uBg: { value: BG }, uG: { value: glows.map((g) => new THREE.Vector4(g.x, g.z, g.r, g.k ?? 1)) }, uC: { value: glows.map((g) => new THREE.Color(g.color)) }, uT: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vW; varying float vDist;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec4 uG[${n}]; uniform vec3 uC[${n}]; uniform float uT; varying vec2 vW; varying float vDist;
      ${FOG}
      float grid(vec2 p, float s, float w) { vec2 q = abs(fract(p / s + 0.5) - 0.5) * s; float e = min(q.x, q.y); return smoothstep(w + fwidth(e) * 1.2, w, e); }
      void main() {
        vec3 c = vec3(0.055, 0.06, 0.14);
        c += vec3(0.16, 0.42, 0.62) * grid(vW, 2.0, 0.018) * 0.55;
        c += vec3(0.25, 0.85, 1.0) * grid(vW, 8.0, 0.03) * 0.8;
        // 맵 가장자리 띠
        float edge = ${HALF.toFixed(1)} - max(abs(vW.x), abs(vW.y));
        c += vec3(0.25, 0.95, 1.0) * exp(-edge / 0.6) * 0.5;
        for (int i = 0; i < ${n}; i++) {
          float d = length(vW - uG[i].xy) / uG[i].z;
          c += uC[i] * exp(-d * d * 2.2) * 0.55 * uG[i].w;
        }
        gl_FragColor = vec4(fogMix(c, vDist), 1.0);
      }`,
    extensions: { derivatives: true },
  });
}

// 점프대: 발판 + 위로 흐르는 빛 고리
function makePad(x, z, dir, color) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.14, 32), boxMat([2.4, 0.14, 2.4], color, { base: '#2a2440', line: 0.02, glow: 0.12 }));
  disc.position.y = 0.07; g.add(disc);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.145; g.add(top);
  // 방향 화살표 (밟으면 어느 쪽으로 튀는지)
  const arrowShape = new THREE.Shape([new THREE.Vector2(0, 0.55), new THREE.Vector2(0.38, 0.1), new THREE.Vector2(0.16, 0.1), new THREE.Vector2(0.16, -0.45), new THREE.Vector2(-0.16, -0.45), new THREE.Vector2(-0.16, 0.1), new THREE.Vector2(-0.38, 0.1)]);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: '#2a1f00' }));
  arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.atan2(-dir[0], -dir[1]); arrow.position.y = 0.15; g.add(arrow);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    r.rotation.x = Math.PI / 2; g.add(r); rings.push(r);
  }
  return { g, x, z, dir, rings, kick: 0 };
}

export function buildMap(scene) {
  const solids = []; // 부딪히는 상자 {min, max}
  const meshes = []; // 총알이 맞는 상자
  const box = (x, y0, z, w, h, d, neon, opt) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat([w, h, d], neon, opt));
    m.position.set(x, y0 + h / 2, z); scene.add(m);
    const b = { min: new THREE.Vector3(x - w / 2, y0, z - d / 2), max: new THREE.Vector3(x + w / 2, y0 + h, z + d / 2) };
    solids.push(b); meshes.push(m);
    return m;
  };
  // 바깥 벽 (높이 4m)
  const W = 4, T = 1;
  box(0, 0, -HALF - T / 2, HALF * 2 + T * 2, W, T, NEON.wall);
  box(0, 0, HALF + T / 2, HALF * 2 + T * 2, W, T, NEON.wall);
  box(-HALF - T / 2, 0, 0, T, W, HALF * 2, NEON.wall);
  box(HALF + T / 2, 0, 0, T, W, HALF * 2, NEON.wall);
  // 가운데 높은 단 (2.5m) — 점프대로만 올라감
  box(0, 0, 0, 8, 2.5, 8, NEON.mid, { base: '#1d1438' });
  // 양옆 발코니 (3m) — 옆 점프대로
  box(-17, 0, 0, 6, 3, 12, NEON.wall, { base: '#121a38' });
  box(17, 0, 0, 6, 3, 12, NEON.wall, { base: '#121a38' });
  // 기둥
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) box(x, 0, z, 1.3, 4, 1.3, NEON.mid, { base: '#1d1438' });
  // 낮은 엄폐 벽 (1.2m — 점프로 못 넘고 숨기 좋음)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 6.5, 0, sz * 14, 6, 1.2, 0.6, NEON.wall);
  // 상자 (0.9m — 점프로 넘음) · 큰 상자 (1.8m)
  const crates = [[-3, -11, 0.9], [3.5, 11, 0.9], [-13, -6, 0.9], [13, 6, 0.9], [-12.5, 13, 1.8], [12.5, -13, 1.8], [-4, 16, 0.9], [4, -16, 0.9], [-14.5, -14.5, 1.8], [14.5, 14.5, 1.8]];
  for (const [x, z, h] of crates) box(x, 0, z, 1.4, h, 1.4, NEON.crate, { base: '#2a1a14', glow: 0.14 });
  // 바닥
  const pads = [makePad(0, 7.2, [0, -1], NEON.pad), makePad(0, -7.2, [0, 1], NEON.pad), makePad(-10.5, 0, [-1, 0], NEON.pad), makePad(10.5, 0, [1, 0], NEON.pad)];
  const glows = [
    ...pads.map((p) => ({ x: p.x, z: p.z, r: 2.6, color: NEON.pad })),
    { x: 0, z: 0, r: 7.5, color: NEON.mid, k: 0.7 },
    ...[[-9, -9], [9, -9], [-9, 9], [9, 9]].map(([x, z]) => ({ x, z, r: 2.2, color: NEON.mid, k: 0.8 })),
  ];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), floorMat(glows));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  for (const p of pads) scene.add(p.g);
  // 먼 배경: 벽 너머 어두운 건물 실루엣 (윤곽만 옅게) + 별
  const r = rng(7);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.08, dist = 34 + r() * 18, w = 4 + r() * 6, h = 6 + r() * 14;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), boxMat([w, h, w], r() < 0.3 ? NEON.mid : NEON.sky, { base: '#0d0e26', line: 0.06, glow: 0.5, k: 0.45 }));
    m.position.set(Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist); m.rotation.y = r() * Math.PI; scene.add(m);
  }
  const sp = [];
  for (let i = 0; i < 400; i++) { const a = r() * Math.PI * 2, e = 0.15 + r() * 1.2; sp.push(Math.cos(a) * Math.cos(e) * 150, Math.sin(e) * 150, Math.sin(a) * Math.cos(e) * 150); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#b9c4ff', size: 1.6, sizeAttenuation: false, fog: false })));

  const tick = (t, dt) => {
    floor.material.uniforms.uT.value = t;
    for (const p of pads) {
      p.kick = Math.max(0, p.kick - dt * 3);
      p.rings.forEach((ring, i) => { const f = (t * 0.9 + i / 3) % 1; ring.position.y = 0.2 + f * 2.2; ring.material.opacity = (1 - f) * (0.55 + p.kick); ring.scale.setScalar(1 - f * 0.35 + p.kick * 0.3); });
    }
  };
  return { solids, meshes, pads, tick, half: HALF };
}

