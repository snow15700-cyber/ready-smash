// 광장 새 디자인 시안: 움직이는 것들 (plaza.md 20장, 11/25 사용자 요청)
//  · 바다 물결: 그래픽 카드(셰이더)가 물결 높이를 계산 — 자바스크립트·네트워크 부담 0, 매 프레임 시간 숫자 하나만 넘김
//  · 돌고래: 가끔 바다에서 점프 (모양 몇 개 + 물보라 고리, 각자 PC에서만 — 네트워크 0)
//  · 가로등 밤 불빛: 진짜 조명(무거움) 대신 바닥에 빛 웅덩이 그림 + 전구 둘레 빛 번짐 (가벼움)
import * as THREE from 'three';
import { canvasTex, glowSprite, std } from './arena-kit.js';

// ── 바다: 촘촘한 판을 물결 모양으로 (여러 방향 물결 4개를 더함) + 물마루는 하얗게
export function makeSea(y = -12) {
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f86c4, roughness: 0.22, metalness: 0.15 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    const waves = `
      uniform float uTime;
      varying float vCrest;
      // 물결 하나: 방향 d, 파장 L, 높이 A, 빠르기 s → 높이와 기울기(x, y)
      vec3 wave(vec2 p, vec2 d, float L, float A, float s) {
        float k = 6.2832 / L, f = k * dot(d, p) + uTime * s;
        return vec3(A * sin(f), A * k * cos(f) * d);
      }
      vec3 seaH(vec2 p) {
        vec3 h = wave(p, normalize(vec2(0.3, 1.0)), 26.0, 0.55, 1.1)
               + wave(p, normalize(vec2(-0.6, 0.8)), 15.0, 0.32, 1.5)
               + wave(p, normalize(vec2(0.9, 0.4)), 9.0, 0.18, 2.1)
               + wave(p, normalize(vec2(-0.2, 1.0)), 5.0, 0.07, 2.9);
        float fade = 1.0 - smoothstep(180.0, 320.0, length(p)); // 아주 먼 곳은 판판하게
        return h * fade;
      }`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + waves)
      .replace('#include <beginnormal_vertex>', `vec3 sh0 = seaH(position.xy);\nvec3 objectNormal = normalize(vec3(-sh0.y, -sh0.z, 1.0));`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.xy, position.z + sh0.x);\nvCrest = sh0.x;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrest;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, vec3(0.8, 0.9, 0.98), smoothstep(0.75, 1.05, vCrest) * 0.35);\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18, smoothstep(-0.6, 0.6, vCrest));`);
  };
  // 가까운 곳은 촘촘하게(240×240칸, 2.5m), 먼 곳은 판판한 큰 판 하나
  const near = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 240, 240), mat);
  near.rotation.x = -Math.PI / 2; near.position.y = y;
  const far = new THREE.Mesh(new THREE.RingGeometry(290, 1200, 64, 1), new THREE.MeshStandardMaterial({ color: 0x2a78b0, roughness: 0.3, metalness: 0.15 }));
  far.rotation.x = -Math.PI / 2; far.position.y = y - 0.05;
  const g = new THREE.Group(); g.add(near, far);
  return { group: g, update: (t) => { uTime.value = t; } };
}

// ── 돌고래 모양: 몸통(돌림판) + 주둥이 + 등지느러미 + 가슴지느러미 + 꼬리
function makeDolphin() {
  const g = new THREE.Group();
  const skin = std(0x6f8ea8, { roughness: 0.35 }), belly = std(0xdfe7ee, { roughness: 0.4 });
  const pts = [[0, -1.25], [0.12, -1.1], [0.22, -0.7], [0.33, -0.1], [0.36, 0.3], [0.3, 0.7], [0.18, 1.0], [0.1, 1.15], [0, 1.3]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), skin); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.85); g.add(body); // 머리가 +z
  const bel = new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 0.92, p.y * 0.9)), 20, Math.PI * 0.75, Math.PI * 0.5), belly); bel.rotation.x = Math.PI / 2; bel.position.y = -0.03; g.add(bel);
  const beak = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), skin); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.05, 1.38); g.add(beak);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(0.45, 0); finShape.quadraticCurveTo(0.1, 0.15, -0.15, 0.5); finShape.closePath();
  const dorsal = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false }), skin); dorsal.rotation.y = Math.PI / 2; dorsal.position.set(0.025, 0.28, 0.25); g.add(dorsal);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.18), skin); f.position.set(sx * 0.4, -0.15, 0.5); f.rotation.set(0, sx * 0.5, sx * -0.5); g.add(f); }
  const tail = new THREE.Group(); tail.position.z = -1.2; g.add(tail);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.2), skin); f.position.set(sx * 0.22, 0, -0.1); f.rotation.y = sx * -0.5; tail.add(f); }
  const eye = std(0x1b1f24); for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eye); e.position.set(sx * 0.2, 0.06, 0.95); g.add(e); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.userData.tail = tail;
  return g;
}

// ── 돌고래 무리: 2~9초마다 한 번, 남쪽·동쪽 바다 어딘가에서 1~2마리가 뛰어오름
export function makeDolphins(y = -12) {
  const g = new THREE.Group();
  const pool = [makeDolphin(), makeDolphin()];
  pool.forEach((d) => d.scale.setScalar(2.3)); // 멀리서도 보이게 조금 크게
  pool.forEach((d) => { d.visible = false; g.add(d); });
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const rings = [0, 1, 2, 3].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.3, 24), ringM.clone()); r.rotation.x = -Math.PI / 2; r.visible = false; g.add(r); return { m: r, t0: -9 }; });
  const drops = new THREE.Group(); g.add(drops);
  const dropM = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.9, depthWrite: false });
  const dropGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const DUR = 1.9, H = 5, LEN = 12; // 점프 시간(초)·높이·거리(m)
  let next = 2, jumps = [];
  const splash = (x, z, t) => {
    const r = rings.find((q) => t - q.t0 > 1.2) || rings[0];
    r.t0 = t; r.m.position.set(x, y + 0.6, z); r.m.visible = true;
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(dropGeo, dropM); const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 2;
      d.position.set(x, y + 0.5, z); d.userData = { vx: Math.cos(a) * v * 0.5, vz: Math.sin(a) * v * 0.5, vy: 3 + Math.random() * 3, t0: t };
      drops.add(d);
    }
  };
  function start(t) {
    // 어디서: 남쪽 바다(전망대 앞) 또는 동쪽 바다, 섬 가까이 (보이는 곳)
    const south = Math.random() < 0.65;
    const x = south ? -5 + Math.random() * 45 : 56 + Math.random() * 20;
    const z = south ? 56 + Math.random() * 14 : 0 + Math.random() * 40; // 섬 가장자리에 안 가리게 조금 먼 바다
    const yaw = Math.random() * Math.PI * 2;
    const n = Math.random() < 0.35 ? 2 : 1;
    jumps = [];
    for (let i = 0; i < n; i++) jumps.push({ d: pool[i], t0: t + i * 0.35, x: x + i * 1.6 * Math.cos(yaw + 1.2), z: z + i * 1.6 * Math.sin(yaw + 1.2), yaw, inS: false, outS: false });
  }
  function update(t) {
    if (t > next) { start(t); next = t + DUR + 2 + Math.random() * 7; }
    for (const j of jumps) {
      const p = (t - j.t0) / DUR;
      if (p < 0 || p > 1) { j.d.visible = false; continue; }
      const dx = Math.sin(j.yaw), dz = Math.cos(j.yaw), s = (p - 0.5) * LEN;
      j.d.visible = true;
      j.d.position.set(j.x + dx * s, y - 0.8 + Math.sin(p * Math.PI) * H, j.z + dz * s);
      j.d.rotation.set(-Math.atan2(Math.cos(p * Math.PI) * Math.PI * H, LEN), j.yaw, 0, 'YXZ'); // 날아가는 방향으로 머리를 듦·숙임
      j.d.userData.tail.rotation.x = Math.sin(t * 14) * 0.35;
      if (!j.inS && p > 0.08) { j.inS = true; splash(j.x - dx * LEN * 0.42, j.z - dz * LEN * 0.42, t); }
      if (!j.outS && p > 0.92) { j.outS = true; splash(j.x + dx * LEN * 0.42, j.z + dz * LEN * 0.42, t); }
    }
    for (const r of rings) { const k = (t - r.t0) / 1.2; if (k > 1) { r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * 3); r.m.material.opacity = 0.8 * (1 - k); }
    for (const d of [...drops.children]) {
      const u = d.userData, k = t - u.t0;
      d.position.set(d.position.x + u.vx * 0.016, y + 0.5 + u.vy * k - 4.9 * k * k, d.position.z + u.vz * 0.016);
      if (k > 1.4) drops.remove(d);
    }
  }
  return { group: g, update, jumpNow: () => { next = 0; } };
}

// ── 가로등 밤 불빛: 바닥 빛 웅덩이(동그란 노란 그림, 더하기 섞기) + 전구 빛 번짐. 밤 정도(0~1)에 맞춰 밝기
let POOL_TEX = null;
export function addLampGlow(lampGroup, headY = 4.15, headX = 0) {
  if (!POOL_TEX) POOL_TEX = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,140,0.85)'); gr.addColorStop(0.45, 'rgba(255,200,120,0.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: POOL_TEX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(headX, 0.04, 0); pool.renderOrder = 2;
  const halo = glowSprite('#ffd98a', 2.4, 1);
  halo.material = halo.material.clone(); halo.material.opacity = 0; halo.position.set(headX, headY, 0);
  pool.userData.keep = halo.userData.keep = true; // 무료 모델로 바꿔도 숨기지 않음
  lampGroup.add(pool, halo);
  lampGroup.userData.nightFx = (night) => { pool.material.opacity = night; halo.material.opacity = night * 0.95; pool.visible = halo.visible = night > 0.01; };
}
