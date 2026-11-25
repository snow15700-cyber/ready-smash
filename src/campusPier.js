// 전망대 아래 낚시터 (docs/dev/fishing.md 11장, 사용자 확정 11/25):
// 전망대 옆(동쪽) 돌계단으로 절벽을 지그재그로 내려가면 → 전망대 바로 밑 바위 턱(땅) → 그 땅에 붙은 나무 선착장 → 끝 넓은 판.
// 시안(campus.html)·실제 광장(arena-plaza.js)·낚시 시안(fishing.html)이 모두 buildCampus로 같이 씀. 자리는 campusLayout.js.
import * as THREE from 'three';
import { addBox, canvasTex, seeded, std } from './arena-kit.js';
import { CLIFF, PIER, PIER_STAIRS } from './campusLayout.js';

const FONT = (px) => `bold ${px}px Jua, sans-serif`;

export function buildPierArea() {
  const g = new THREE.Group();
  g.name = 'pierArea';
  const rnd = seeded(4711); // 언제 지어도 같은 모습
  const rock = std(0x6f7468, { roughness: 0.95, flatShading: true }), rockDark = std(0x5a5f55, { roughness: 0.95, flatShading: true });
  const stone = std(0x9a978e, { roughness: 0.9 }), stoneTop = std(0xb9b4a6, { roughness: 0.85 });
  const wood = std(0xa8794a, { roughness: 0.85 }), wood2 = std(0xb3855a, { roughness: 0.85 }), woodDark = std(0x6e4a2b, { roughness: 0.9 });
  const rope = std(0xd9c9a0), red = std(0xe0483e, { roughness: 0.6 }), white = std(0xf3f1ec, { roughness: 0.6 });
  const C = CLIFF, top = PIER.y; // 바위 턱 윗면 = 선착장 윗면
  const cyl = (rt, rb, h, m, x, y, z, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); c.castShadow = true; g.add(c); return c; };

  // ── 절벽 벽: 광장 땅 끝(z = CLIFF.face)에서 바위 턱까지 곧게 — 전망대가 절벽 위에 얹힌 모습
  const wallH = 0 - top + 0.6;
  addBox(g, C.x1 - C.x0, wallH, 3, rock, (C.x0 + C.x1) / 2, top - 0.6 + wallH / 2, C.face - 1.5);
  // 벽 앞 울퉁불퉁 바위 (계단 자리는 비움)
  for (let x = C.x0 - 1; x <= C.x1 + 1; x += 2.2) {
    const r = 1.1 + rnd() * 1.3, b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rnd() < 0.5 ? rock : rockDark);
    const y = -2 - rnd() * 3;
    b.position.set(x + rnd() - 0.5, y, C.face - 0.4 + rnd() * 0.3); b.scale.set(1.3, 0.8, 0.45); b.rotation.y = rnd() * 3; b.castShadow = true;
    if (x > PIER_STAIRS.xL - 1 && x < PIER_STAIRS.xR + 1 && y > -9) b.position.z = C.face - 1.2; // 계단 뒤로 숨김
    g.add(b);
  }
  // 양 끝은 큰 바위로 둥글게 마무리 (원래 숲 언덕과 이어지게)
  for (const [x, s] of [[C.x0 - 1.2, 4.2], [C.x1 + 1.6, 3.6]]) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockDark); b.position.set(x, -7, C.face - 1.6); b.scale.set(0.8, 1.2, 0.8); b.castShadow = true; g.add(b);
  }

  // ── 바위 턱(땅): 전망대 바로 밑. 바다에서 솟은 돌 받침 + 판판한 돌 윗면
  const shelfD = C.shelfZ - C.face;
  addBox(g, C.x1 - C.x0, top - -13 , shelfD, stone, (C.x0 + C.x1) / 2, (top + -13) / 2, (C.face + C.shelfZ) / 2);
  addBox(g, C.x1 - C.x0 + 0.1, 0.1, shelfD + 0.1, stoneTop, (C.x0 + C.x1) / 2, top - 0.02, (C.face + C.shelfZ) / 2).receiveShadow = true;
  // 바다 쪽 가장자리 돌 블록(물결에 부딪히는 곳) + 둥근 바위 몇 개
  for (let x = C.x0 + 0.6; x < C.x1; x += 1.25) {
    if (Math.abs(x - PIER.x) < PIER.w / 2 + 0.4) continue; // 선착장이 붙는 곳은 비움
    addBox(g, 1.15, 0.28, 0.5, stone, x, top + 0.1, C.shelfZ - 0.3).castShadow = true;
  }
  for (let i = 0; i < 9; i++) {
    const x = C.x0 + rnd() * (C.x1 - C.x0);
    if (Math.abs(x - PIER.x) < 3) continue;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rnd() * 0.8, 0), rockDark);
    b.position.set(x, -12 + rnd() * 0.5, C.shelfZ + 0.4 + rnd() * 0.8); b.scale.y = 0.7; b.rotation.y = rnd() * 3; g.add(b);
  }
  // 바위 턱 위: 계류 말뚝 2개 · 구명 튜브 · 가로등 · 🎣 낚시터 표지판
  for (const sx of [-1, 1]) {
    const bx = PIER.x + sx * 2.6;
    cyl(0.18, 0.22, 0.5, std(0x30363d, { roughness: 0.6 }), bx, top + 0.25, C.shelfZ - 0.9, 12);
    cyl(0.26, 0.26, 0.08, std(0x30363d, { roughness: 0.6 }), bx, top + 0.52, C.shelfZ - 0.9, 12);
  }
  const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 20), red);
  buoy.position.set(PIER.x + 4.2, top + 1.4, C.face + 0.12); g.add(buoy);
  for (let i = 0; i < 4; i++) { const w = addBox(g, 0.2, 0.06, 0.24, white, 0, 0, 0); w.position.set(PIER.x + 4.2 + Math.cos(i * Math.PI / 2 + 0.78) * 0.42, top + 1.4 + Math.sin(i * Math.PI / 2 + 0.78) * 0.42, C.face + 0.12); w.rotation.z = i * Math.PI / 2 + 0.78; }
  addBox(g, 0.1, 0.1, 0.1, woodDark, PIER.x + 4.2, top + 1.86, C.face + 0.05);
  // 가로등 (밤에 빛나는 머리)
  const lampX = PIER.x - 2.4, lampZ = C.shelfZ - 0.9;
  cyl(0.06, 0.08, 3.2, std(0x30363d, { roughness: 0.5 }), lampX, top + 1.6, lampZ, 8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe2a0, emissiveIntensity: 0.6 }));
  head.position.set(lampX, top + 3.3, lampZ); head.userData.glow = [0.25, 1.6]; g.add(head);
  // 표지판
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), new THREE.MeshBasicMaterial({ map: canvasTex(340, 110, (c) => { c.fillStyle = '#fff6e4'; c.fillRect(0, 0, 340, 110); c.strokeStyle = '#6e4a2b'; c.lineWidth = 8; c.strokeRect(4, 4, 332, 102); c.fillStyle = '#5a3418'; c.font = FONT(54); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎣 낚시터', 170, 58); }) }));
  const signX = PIER.x + PIER.w / 2 + 0.9, signZ = C.shelfZ - 0.6;
  sign.position.set(signX, top + 1.45, signZ); g.add(sign); // 계단에서 내려오는 사람이 보게 (북쪽을 봄)
  sign.rotation.y = Math.PI;
  const back = addBox(g, 1.8, 0.62, 0.05, woodDark, signX, top + 1.45, signZ + 0.04); back.castShadow = true;
  cyl(0.05, 0.05, 1.2, woodDark, signX, top + 0.6, signZ + 0.06, 6);

  // ── 돌계단: 전망대 동쪽 옆 광장 끝 → 절벽 벽을 따라 서쪽으로 → 꺾임 판 → 동쪽으로 → 바위 턱
  const S = PIER_STAIRS;
  const flight = (xa, xb, ya, yb, z) => {
    const n = Math.round((ya - yb) / 0.22), run = (xb - xa) / n, rise = (yb - ya) / n;
    for (let i = 0; i < n; i++) {
      const x = xa + run * (i + 0.5), y = ya + rise * (i + 1); // 디딤판 윗면
      addBox(g, Math.abs(run) + 0.02, y - top + 0.02, S.w, rock, x, (y + top) / 2, z); // 아래까지 꽉 찬 바위 (절벽을 깎아 만든 계단처럼)
      addBox(g, Math.abs(run) + 0.06, 0.06, S.w + 0.06, stoneTop, x, y + 0.01, z).castShadow = true;
    }
    // 바다 쪽 나무 손잡이 (기둥 + 비스듬한 손잡이)
    const zr = z + S.w / 2 - 0.08, len = Math.hypot(xb - xa, yb - ya);
    for (let k = 0; k <= 4; k++) { const x = xa + (xb - xa) * (k / 4), y = ya + (yb - ya) * (k / 4); cyl(0.04, 0.04, 0.95, woodDark, x, y + 0.48, zr, 6); }
    const r = addBox(g, len, 0.06, 0.06, wood, (xa + xb) / 2, (ya + yb) / 2 + 0.95, zr);
    r.rotation.z = Math.atan2(yb - ya, xb - xa);
  };
  const midY = (0 + top) / 2;
  // 맨 위 입구 판 (광장 높이, 전망대 난간 바로 동쪽)
  addBox(g, S.xR - S.top.x0 + 0.3, 0.12, S.zTop - S.top.z0, stoneTop, (S.top.x0 + S.xR + 0.3) / 2, -0.04, (S.top.z0 + S.zTop) / 2).receiveShadow = true;
  flight(S.xR, S.xL, 0, midY, S.z1); // 위 계단: 동 → 서
  addBox(g, S.xL - S.turnX0, midY - top, S.z2 - S.z1 + S.w, rock, (S.turnX0 + S.xL) / 2, (midY + top) / 2, (S.z1 + S.z2) / 2); // 꺾임 판 (받침)
  addBox(g, S.xL - S.turnX0 + 0.06, 0.06, S.z2 - S.z1 + S.w + 0.06, stoneTop, (S.turnX0 + S.xL) / 2, midY + 0.01, (S.z1 + S.z2) / 2).receiveShadow = true;
  flight(S.xL, S.xR, midY, top, S.z2); // 아래 계단: 서 → 동
  // 입구 옆 작은 안내 (광장에서 보이게, 남쪽 → 북쪽을 봄)
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshBasicMaterial({ map: canvasTex(300, 105, (c) => { c.fillStyle = '#e8f6fb'; c.fillRect(0, 0, 300, 105); c.strokeStyle = '#1f5f8a'; c.lineWidth = 7; c.strokeRect(4, 4, 292, 97); c.fillStyle = '#1f5f8a'; c.font = FONT(44); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🎣 낚시터 ↓', 150, 56); }) }));
  arrow.position.set(S.xR + 0.75, 1.15, S.top.z0 + 0.05); arrow.rotation.y = Math.PI; g.add(arrow);
  cyl(0.04, 0.04, 0.95, std(0xc9ced4, { metalness: 0.5, roughness: 0.35 }), S.xR + 0.75, 0.48, S.top.z0 + 0.1, 6);

  // ── 나무 선착장: 바위 턱 끝(z = shelfZ)에서 바로 이어져 바다로 → 끝 넓은 판
  const P = PIER;
  const plank = (x, z, w, d) => { const b = addBox(g, w, 0.08, d, rnd() < 0.5 ? wood : wood2, x, top, z); b.receiveShadow = true; b.castShadow = true; return b; };
  for (let z = P.z0; z < P.z1 - 0.01; z += 0.5) plank(P.x, z + 0.25, P.w, 0.505);
  for (let x = P.head.x0; x < P.head.x1 - 0.01; x += 0.5) plank(x + 0.25, (P.head.z0 + P.head.z1) / 2, 0.505, P.head.z1 - P.head.z0);
  // 다리 아래 받침 보 2줄 (바위 턱에 걸쳐 놓은 모습)
  for (const sx of [-1, 1]) addBox(g, 0.16, 0.18, P.z1 - P.z0 + 0.6, woodDark, P.x + sx * (P.w / 2 - 0.15), top - 0.13, (P.z0 + P.z1) / 2 - 0.3);
  // 기둥 (물속으로)
  const post = (x, z, h = 3.2) => cyl(0.13, 0.15, h, woodDark, x, top - h / 2 + 0.25, z);
  for (let z = P.z0 + 2.5; z <= P.z1; z += 3.3) for (const sx of [-1, 1]) post(P.x + sx * (P.w / 2 + 0.05), z);
  for (let x = P.head.x0; x <= P.head.x1 + 0.01; x += (P.head.x1 - P.head.x0) / 4) for (const z of [P.head.z0, P.head.z1]) post(x, z);
  // 다리 난간 (밧줄) — 끝 판 앞쪽은 낚시하려고 비워 둠
  for (const sx of [-1, 1]) {
    for (let z = P.z0 + 0.3; z <= P.z1; z += 2.1) { const p = post(P.x + sx * (P.w / 2 + 0.05), z, 1.2); p.position.y = top + 0.6; }
    addBox(g, 0.04, 0.04, P.z1 - P.z0 - 0.3, rope, P.x + sx * (P.w / 2 + 0.05), top + 1.05, (P.z0 + 0.3 + P.z1) / 2);
  }
  // 끝 판 양옆·뒤 낮은 턱
  for (const x of [P.head.x0, P.head.x1]) addBox(g, 0.14, 0.18, P.head.z1 - P.head.z0, woodDark, x, top + 0.1, (P.head.z0 + P.head.z1) / 2);
  addBox(g, P.head.x1 - P.head.x0, 0.14, 0.14, woodDark, (P.head.x0 + P.head.x1) / 2, top + 0.08, P.head.z1);
  return g;
}
