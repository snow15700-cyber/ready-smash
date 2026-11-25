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
               + wave(p, normalize(vec2(0.9, 0.4)), 11.0, 0.18, 2.1); // (파장 5m 물결은 칸이 굵어 뺌)
        float fade = 1.0 - smoothstep(180.0, 320.0, length(p)); // 아주 먼 곳은 판판하게
        return h * fade;
      }`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + waves)
      .replace('#include <beginnormal_vertex>', `vec3 sh0 = seaH(position.xy);\nvec3 objectNormal = normalize(vec3(-sh0.y, -sh0.z, 1.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.z += sh0.x;\nvCrest = sh0.x;`); // include를 남겨 둠 (경기장 거품 셰이더가 덧붙일 수 있게)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrest;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb * 0.85, vec3(0.8, 0.9, 0.98), smoothstep(0.75, 1.05, vCrest) * 0.35);\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18, smoothstep(-0.6, 0.6, vCrest));`);
  };
  // 가까운 곳은 촘촘하게(110×110칸, 5.5m), 먼 곳은 판판한 큰 판 하나
  const near = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 110, 110), mat);
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

// ── 돌고래 무리 (사용자 요청 11/25): 4~11초마다 한 번, 섬에서 멀리 떨어진 남쪽·동쪽 바다에서 뛰어오름
//  몇 마리: 1마리 75% · 2마리 동시 20% · 3마리 동시 5%
//  춤: 1% 확률로 (몇 마리든) 연달아 세 번 뛰며 빙글빙글 몸을 돌리고, 마지막엔 공중에서 한 바퀴 + 음표가 퐁퐁
export function makeDolphins(y = -12) {
  const g = new THREE.Group();
  const pool = [makeDolphin(), makeDolphin(), makeDolphin()];
  pool.forEach((d) => { d.scale.setScalar(3); d.visible = false; g.add(d); }); // 멀리 뛰니까 크게
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  const rings = Array.from({ length: 12 }, () => { const r = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.9, 24), ringM.clone()); r.rotation.x = -Math.PI / 2; r.visible = false; g.add(r); return { m: r, t0: -9 }; });
  const drops = new THREE.Group(); g.add(drops);
  const dropM = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.9, depthWrite: false });
  const dropGeo = new THREE.SphereGeometry(0.14, 6, 4);
  // 춤출 때 머리 위로 떠오르는 음표
  const noteTex = canvasTex(64, 64, (c) => { c.font = 'bold 52px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffffff'; c.strokeStyle = '#2f86c4'; c.lineWidth = 6; c.strokeText('♪', 32, 34); c.fillText('♪', 32, 34); });
  const notes = Array.from({ length: 10 }, () => { const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false })); n.scale.setScalar(2.2); n.visible = false; g.add(n); return { s: n, t0: -9 }; });
  const DUR = 2.0, H = 6, LEN = 14; // 보통 점프: 시간(초)·높이·거리(m)
  const DANCE_HOP = 1.5, DANCE_N = 3; // 춤: 한 번 뛰는 시간·몇 번
  let next = 3, jumps = [], force = null;
  const splash = (x, z, t) => {
    const r = rings.find((q) => t - q.t0 > 1.2) || rings[0];
    r.t0 = t; r.m.position.set(x, y + 0.7, z); r.m.visible = true;
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Mesh(dropGeo, dropM); const a = Math.random() * Math.PI * 2, v = 2.5 + Math.random() * 2.5;
      d.position.set(x, y + 0.5, z); d.userData = { vx: Math.cos(a) * v * 0.5, vz: Math.sin(a) * v * 0.5, vy: 4 + Math.random() * 4, t0: t };
      drops.add(d);
    }
  };
  const note = (x, yy, z, t) => { const n = notes.find((q) => t - q.t0 > 1.6) || notes[0]; n.t0 = t; n.base = [x + (Math.random() - 0.5) * 2, yy, z]; n.s.visible = true; };
  function start(t) {
    // 어디서: 섬 가장자리(약 40m)에서 충분히 떨어진 바다 — 남쪽 z 85~115 또는 동쪽 x 85~115
    const south = Math.random() < 0.65;
    const x = south ? -20 + Math.random() * 70 : 85 + Math.random() * 30;
    const z = south ? 85 + Math.random() * 30 : -20 + Math.random() * 70;
    const yaw = Math.random() * Math.PI * 2;
    const r = Math.random();
    let n = r < 0.05 ? 3 : r < 0.25 ? 2 : 1;
    let dance = Math.random() < 0.01;
    if (force) { n = force.n; dance = force.dance; force = null; }
    jumps = [];
    // 여럿이면 나란히(옆으로 4m씩) 거의 동시에(0.15초씩 늦게)
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 4;
      jumps.push({ d: pool[i], t0: t + i * 0.15, x: x + sx * off, z: z + sz * off, yaw, dance, splashed: new Set() });
    }
  }
  function update(t) {
    if (t > next) { start(t); next = t + (jumps[0]?.dance ? DANCE_HOP * DANCE_N : DUR) + 2 + Math.random() * 7; }
    for (const j of jumps) {
      const dx = Math.sin(j.yaw), dz = Math.cos(j.yaw);
      const total = j.dance ? DANCE_HOP * DANCE_N : DUR;
      const e = t - j.t0;
      if (e < 0 || e > total) { j.d.visible = false; continue; }
      j.d.visible = true;
      let p, hop = 0, len = LEN, h = H;
      if (j.dance) { hop = Math.min(DANCE_N - 1, Math.floor(e / DANCE_HOP)); p = (e - hop * DANCE_HOP) / DANCE_HOP; len = 7; h = hop === DANCE_N - 1 ? 8 : 5; }
      else p = e / DUR;
      // 춤: 뛸 때마다 조금씩 앞으로 (세 번에 걸쳐 앞으로 나아감)
      const s = (j.dance ? (hop - (DANCE_N - 1) / 2) * len * 0.9 : 0) + (p - 0.5) * len;
      j.d.position.set(j.x + dx * s, y - 1 + Math.sin(p * Math.PI) * h, j.z + dz * s);
      const pitch = -Math.atan2(Math.cos(p * Math.PI) * Math.PI * h, len);
      if (j.dance) {
        // 몸을 길이 방향으로 빙글(한 번 뛸 때 한 바퀴), 마지막엔 공중에서 몸통째 한 바퀴 더
        const roll = p * Math.PI * 2 * (hop % 2 ? -1 : 1);
        const twirl = hop === DANCE_N - 1 ? Math.sin(p * Math.PI) * Math.PI * 2 : 0;
        j.d.rotation.set(pitch, j.yaw + twirl, roll, 'YXZ');
        j.d.userData.tail.rotation.x = Math.sin(t * 24) * 0.6;
        if (p > 0.3 && p < 0.7 && Math.random() < 0.08) note(j.d.position.x, j.d.position.y + 3, j.d.position.z, t);
      } else {
        j.d.rotation.set(pitch, j.yaw, 0, 'YXZ'); // 날아가는 방향으로 머리를 듦·숙임
        j.d.userData.tail.rotation.x = Math.sin(t * 14) * 0.35;
      }
      // 물보라: 뛸 때마다 들어가고(시작) 나오는(끝) 곳
      for (const [key, when, side] of [[hop + 'a', 0.08, -1], [hop + 'b', 0.92, 1]]) {
        if (!j.splashed.has(key) && p > when) { j.splashed.add(key); const ss = (j.dance ? (hop - (DANCE_N - 1) / 2) * len * 0.9 : 0) + side * len * 0.42; splash(j.x + dx * ss, j.z + dz * ss, t); }
      }
    }
    for (const r of rings) { const k = (t - r.t0) / 1.2; if (k > 1) { r.m.visible = false; continue; } r.m.scale.setScalar(1 + k * 3); r.m.material.opacity = 0.8 * (1 - k); }
    for (const n of notes) { const k = (t - n.t0) / 1.6; if (k > 1) { n.s.visible = false; continue; } n.s.position.set(n.base[0] + Math.sin(k * 9) * 0.6, n.base[1] + k * 4, n.base[2]); n.s.material.opacity = 1 - k; }
    for (const d of [...drops.children]) {
      const u = d.userData, k = t - u.t0;
      d.position.set(d.position.x + u.vx * 0.016, y + 0.5 + u.vy * k - 4.9 * k * k, d.position.z + u.vz * 0.016);
      if (k > 1.6) drops.remove(d);
    }
  }
  // 시험·구경용: 바로 뛰게 (n마리, 춤)
  return { group: g, update, jumpNow: (n = 1, dance = false) => { force = { n, dance }; next = 0; } };
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
