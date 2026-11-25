// 전망대 밑 낚시터 (docs/dev/fishing.md 12장, 사용자 확정 11/25):
// 전망대 데크(절벽 끝까지) 양옆(서·동) 넓고 가파른 돌계단으로 곧장 내려가면 → 전망대 바로 밑 넓은 나무 판(선착장) 하나.
// 시안(campus.html)·실제 광장(arena-plaza.js)·낚시 시안(fishing.html)이 모두 buildCampus로 같이 씀. 자리는 campusLayout.js.
import * as THREE from 'three';
import { addBox, canvasTex, seeded, std } from './arena-kit.js';
import { CLIFF, PIER, SEA_Y, STAIRS } from './campusLayout.js';

const FONT = (px) => `bold ${px}px Jua, sans-serif`;
const signTex = (text, bg, fg, w = 340) => canvasTex(w, 110, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, 110); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, 102);
  c.fillStyle = fg; c.font = FONT(52); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 58);
});

export function buildPierArea() {
  const g = new THREE.Group();
  g.name = 'pierArea';
  const rnd = seeded(4711); // 언제 지어도 같은 모습
  const rock = std(0x6f7468, { roughness: 0.95, flatShading: true }), rockDark = std(0x5a5f55, { roughness: 0.95, flatShading: true });
  const stoneTop = std(0xb9b4a6, { roughness: 0.85 });
  const wood = std(0xa8794a, { roughness: 0.85 }), wood2 = std(0xb3855a, { roughness: 0.85 }), woodDark = std(0x6e4a2b, { roughness: 0.9 });
  const rope = std(0xd9c9a0), red = std(0xe0483e, { roughness: 0.6 }), white = std(0xf3f1ec, { roughness: 0.6 }), metal = std(0x30363d, { roughness: 0.6 });
  const C = CLIFF, P = PIER, E = STAIRS[1], top = P.y;
  const cyl = (rt, rb, h, m, x, y, z, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); c.castShadow = true; g.add(c); return c; };

  // ── 절벽 벽: 광장 땅 끝(z = face)에서 바다 속까지 곧게 — 전망대가 절벽 위에 얹힌 모습
  const wallBot = SEA_Y - 3, wallH = -0.03 - wallBot;
  addBox(g, C.x1 - C.x0, wallH, 4, rock, (C.x0 + C.x1) / 2, wallBot + wallH / 2, C.face - 2);
  for (let x = C.x0 - 1; x <= C.x1 + 1; x += 2.3) { // 벽 앞 울퉁불퉁 바위 (판 위로 안 나오게 납작하게)
    const r = 0.9 + rnd() * 1.1, b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rnd() < 0.5 ? rock : rockDark);
    b.position.set(x + rnd() - 0.5, top + 0.8 + rnd() * 2.2, C.face - 0.35); b.scale.set(1.3, 0.8, 0.3); b.rotation.y = rnd() * 3; b.castShadow = true;
    if (STAIRS.some((S) => x > S.x0 - 1 && x < S.x1 + 1)) b.position.z = C.face - 1; // 계단 자리는 뒤로 숨김
    g.add(b);
  }
  for (const [x, s] of [[C.x0 - 1.2, 3.4], [C.x1 + 1.4, 3.0]]) { // 양 끝 큰 바위로 마무리
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockDark); b.position.set(x, SEA_Y + 1.5, C.face - 1); b.scale.set(0.8, 1.3, 0.9); b.castShadow = true; g.add(b);
  }

  // ── 나무 선착장: 전망대 바로 밑 넓은 판 하나 (절벽에 붙어 있음)
  const plank = (x, w) => { const b = addBox(g, w, 0.1, P.z1 - P.z0, rnd() < 0.5 ? wood : wood2, x, top - 0.05, (P.z0 + P.z1) / 2); b.receiveShadow = true; return b; };
  for (let x = P.x0; x < P.x1 - 0.01; x += 0.5) plank(x + 0.25, 0.505);
  for (const z of [P.z0 + 0.6, (P.z0 + P.z1) / 2, P.z1 - 0.3]) addBox(g, P.x1 - P.x0, 0.2, 0.18, woodDark, (P.x0 + P.x1) / 2, top - 0.2, z); // 받침 보
  const post = (x, z, h) => cyl(0.14, 0.16, h, woodDark, x, top - h / 2 + 0.15, z);
  for (let x = P.x0 + 0.2; x <= P.x1; x += 2.9) post(x, P.z1 - 0.2, top - SEA_Y + 2.2); // 물속 기둥
  // 서쪽 끝 밧줄 난간 · 앞(바다 쪽)은 낚시하려고 비우고 낮은 턱만
  const rz0 = STAIRS[0].z1 + 0.2; // 서쪽 계단 아래부터 (계단 옆은 계단 손잡이)
  for (let z = rz0; z <= P.z1; z += 0.9) cyl(0.06, 0.06, 1.1, woodDark, P.x0 + 0.08, top + 0.55, z, 6);
  addBox(g, 0.04, 0.04, P.z1 - rz0, rope, P.x0 + 0.08, top + 1.0, (rz0 + P.z1) / 2);
  addBox(g, P.x1 - P.x0, 0.12, 0.14, woodDark, (P.x0 + P.x1) / 2, top + 0.06, P.z1 - 0.07);
  // 판 위 소품: 계류 말뚝 2 · 가로등(밤에 빛남) · 절벽에 건 구명 튜브 · 🎣 낚시터 표지판
  // 계류 말뚝: 앞 양 끝 (서서 던지는 자리를 가리지 않게)
  for (const bx of [P.x0 + 0.45, P.x1 - 0.45]) { cyl(0.18, 0.22, 0.45, metal, bx, top + 0.22, P.z1 - 0.55, 12); cyl(0.26, 0.26, 0.08, metal, bx, top + 0.48, P.z1 - 0.55, 12); }
  const lampX = STAIRS[0].x1 + 0.6, lampZ = P.z0 + 0.6; // 서쪽 계단과 데크 사이 절벽 앞
  cyl(0.06, 0.08, 3.2, metal, lampX, top + 1.6, lampZ, 8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xffe2a0, emissiveIntensity: 0.6 }));
  head.position.set(lampX, top + 3.3, lampZ); head.userData.glow = [0.25, 1.6]; g.add(head);
  const bx = 9;
  const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 20), red);
  buoy.position.set(bx, top + 1.6, C.face + 0.12); g.add(buoy);
  for (let i = 0; i < 4; i++) { const w = addBox(g, 0.2, 0.06, 0.24, white, 0, 0, 0); const a = i * Math.PI / 2 + 0.78; w.position.set(bx + Math.cos(a) * 0.42, top + 1.6 + Math.sin(a) * 0.42, C.face + 0.12); w.rotation.z = a; }
  // (선착장 위 '🎣 낚시터' 표지판은 없앰 — 11/25 사용자: 표지판은 전망대 옆 계단 입구 것만)
  // ── 돌계단 2개: 데크 서쪽·동쪽 옆, 광장 끝(z0)에서 남쪽으로 곧게 내려가 판 위(z1)로 (넓고 조금 가파르게)
  const noteTex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#ffe766'; c.fillRect(0, 0, 256, 256); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, 0, 256, 34); // 붙는 띠
    c.fillStyle = '#4a3a12'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = FONT(34); c.fillText('피드백', 128, 78); c.fillText('부탁드립니다 🙏', 128, 120);
    c.font = FONT(26); c.fillStyle = '#7a5a1a'; c.fillText('시스템 도입', 128, 176); c.fillText('고민중', 128, 210);
  });
  const arrowTex = signTex('🎣 낚시터 ↓', '#e8f6fb', '#1f5f8a', 300), pole = std(0xc9ced4, { metalness: 0.5, roughness: 0.35 });
  for (const S of STAIRS) {
    const n = Math.round(-top / 0.29), run = (S.z1 - S.z0) / n, w = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2;
    for (let i = 0; i < n; i++) {
      const z = S.z0 + run * (i + 0.5), step = top * (i + 1) / n; // 디딤판 윗면: 0(광장) 아래 한 칸 → top(판)
      if (i < n - 1) addBox(g, w, step - top + 0.02, run + 0.02, rock, cx, (step + top) / 2, z); // 아래까지 꽉 찬 바위
      addBox(g, w + 0.06, 0.06, run + 0.06, stoneTop, cx, step + 0.01, z).castShadow = true;
    }
    // 양옆 손잡이 (기둥 + 비스듬한 손잡이)
    const len = Math.hypot(S.z1 - S.z0, top);
    for (const x of [S.x0 + 0.08, S.x1 - 0.08]) {
      for (let k = 0; k <= 4; k++) { const z = S.z0 + (S.z1 - S.z0) * (k / 4), y = top * (k / 4); cyl(0.045, 0.045, 0.95, woodDark, x, y + 0.48, z, 6); }
      const r = addBox(g, 0.06, 0.06, len, wood, x, top / 2 + 0.95, (S.z0 + S.z1) / 2);
      r.rotation.x = Math.atan2(-top, S.z1 - S.z0);
    }
    // 계단 입구 안내 (광장에서 보이게, 북쪽을 봄) — 데크 반대쪽(바깥) 옆
    const ax = S.side === 'west' ? S.x0 + 0.1 : S.x1 - 0.1;
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshBasicMaterial({ map: arrowTex }));
    arrow.position.set(ax, 1.15, S.z0 - 0.5); arrow.rotation.y = Math.PI; g.add(arrow);
    cyl(0.04, 0.04, 0.95, pole, ax, 0.48, S.z0 - 0.45, 6);
    // 노란 포스트잇 (11/25 사용자: 낚시는 시험 중이라 의견을 받음) — 표지판 오른쪽 아래 모서리에 비스듬히
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: noteTex }));
    note.position.set(ax - 0.5, 0.92, S.z0 - 0.52); note.rotation.set(0, Math.PI, -0.12); // 보는 사람 기준 오른쪽 아래 (글자 안 가리게) g.add(note);
  }
  return g;
}
