// 전망대 밑 낚시터 (docs/dev/fishing.md 12장·14장 1b, 사용자 확정 11/25·11/26):
// 전망대 데크(절벽 끝까지) 양옆(서·동) 넓고 가파른 돌계단으로 곧장 내려가면 → 'ㄷ자' 넓은 선착장.
//   앞 판 34 × 7.5m(절벽에 붙음) + 양 끝 팔 2개(11m, 바다 쪽) — 팔 사이 작은 항구에 배, 팔 끝에 등대(서쪽 흰색·동쪽 빨간색).
//   앞 판 서쪽 계단 아래 🍣 횟집 + 📈 시세 칠판(진짜 시세, market.js), 동쪽 계단 아래 🐾 고양이 쉼터(상자·방석·생선 바구니).
// 시안(campus.html)·실제 광장(arena-plaza.js)·낚시 시안(fishing.html)이 모두 buildCampus로 같이 씀. 자리는 campusLayout.js.
import * as THREE from 'three';
import { addBox, canvasTex, seeded, std } from './arena-kit.js';
import { ARMS, BOARD, CAT_NOOK, CLIFF, HARBOR, LH_BASES, LIGHTHOUSES, MARKET, PIER, SEA_Y, STAIRS } from './campusLayout.js';
import { history, nextLabel, period } from './games/fishing/market.js';
import { CATCH } from './games/fishing/rules.js';
import { nowMs } from './breaks.js';
import { makeCharacter } from './scene.js';
import { BEAT } from './games/fishing/beat.js';

// ⑤ 선착장이 박자를 탐 (낚시 줄다리기 중, 내 화면에서만 — fishing.md 8장 'B' 시안): 등·등대·횟집 등 위의 빛 무리가 박마다 번쩍
let haloTex = null;
const makeHaloTex = () => canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
function beatHalo(g, x, y, z, color, size) {
  haloTex ||= makeHaloTex();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.set(x, y, z); s.scale.setScalar(size); s.visible = false; s.userData.noBake = true; s.userData.size = size; g.add(s);
  return s;
}

const FONT = (px) => `bold ${px}px Jua, sans-serif`;
const signTex = (text, bg, fg, w = 340) => canvasTex(w, 110, (c) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, 110); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, 102);
  c.fillStyle = fg; c.font = FONT(52); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 58);
});
// 바다 물결 높이 (campusFx.js 셰이더·fishing/world.js seaHeight와 같은 식) — 항구의 배가 물결을 따라 오르내리게
const WAVES = [[0.3, 1.0, 26, 0.55, 1.1], [-0.6, 0.8, 15, 0.32, 1.5], [0.9, 0.4, 11, 0.18, 2.1]].map(([dx, dy, L, A, s]) => {
  const n = Math.hypot(dx, dy); return { dx: dx / n, dy: dy / n, k: (Math.PI * 2) / L, A, s };
});
const seaH = (x, z, t) => WAVES.reduce((h, w) => h + w.A * Math.sin(w.k * (w.dx * x - w.dy * z) + t * w.s), SEA_Y);

export function buildPierArea(anim = null) {
  const g = new THREE.Group();
  g.name = 'pierArea';
  const rnd = seeded(4711); // 언제 지어도 같은 모습
  const rock = std(0x6f7468, { roughness: 0.95, flatShading: true }), rockDark = std(0x5a5f55, { roughness: 0.95, flatShading: true });
  const stoneTop = std(0xb9b4a6, { roughness: 0.85 });
  const wood = std(0xa8794a, { roughness: 0.85 }), wood2 = std(0xb3855a, { roughness: 0.85 }), woodDark = std(0x6e4a2b, { roughness: 0.9 });
  const red = std(0xe0483e, { roughness: 0.6 }), white = std(0xf3f1ec, { roughness: 0.6 }), metal = std(0x30363d, { roughness: 0.6 });
  const C = CLIFF, P = PIER, top = P.y;
  const WOODS = [P, ...ARMS];
  const cyl = (rt, rb, h, m, x, y, z, seg = 10, parent = g) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); c.castShadow = true; parent.add(c); return c; };
  const glowMat = (color, emissive, day, night) => { const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: day }); m.userData.glow = [day, night]; return m; };

  // ── 절벽 벽: 광장 땅 끝(z = face)에서 바다 속까지 곧게 — 전망대가 절벽 위에 얹힌 모습
  const wallBot = SEA_Y - 3, wallH = -0.03 - wallBot;
  addBox(g, C.x1 - C.x0, wallH, 4, rock, (C.x0 + C.x1) / 2, wallBot + wallH / 2, C.face - 2);
  const behind = (x) => STAIRS.some((S) => x > S.x0 - 1 && x < S.x1 + 1) || (x > MARKET.x - MARKET.w / 2 - 0.5 && x < MARKET.x + MARKET.w / 2 + 0.5) || (x > CAT_NOOK.x0 && x < CAT_NOOK.x1);
  for (let x = C.x0 - 1; x <= C.x1 + 1; x += 2.3) { // 벽 앞 울퉁불퉁 바위 (판 위로 안 나오게 납작하게)
    const r = 0.9 + rnd() * 1.1, b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rnd() < 0.5 ? rock : rockDark);
    b.position.set(x + rnd() - 0.5, top + 0.8 + rnd() * 2.2, C.face - 0.35); b.scale.set(1.3, 0.8, 0.3); b.rotation.y = rnd() * 3; b.castShadow = true;
    if (behind(x)) b.position.z = C.face - 1; // 계단·횟집·고양이 쉼터 자리는 뒤로 숨김
    g.add(b);
  }
  for (const [x, s] of [[C.x0 - 1.2, 3.4], [C.x1 + 1.4, 3.0]]) { // 양 끝 큰 바위로 마무리
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockDark); b.position.set(x, SEA_Y + 1.5, C.face - 1); b.scale.set(0.8, 1.3, 0.9); b.castShadow = true; g.add(b);
  }

  // ── 나무 선착장 'ㄷ자': 앞 판(절벽에 붙음) + 양 끝 팔 2개. 널빤지는 모두 남북으로
  for (const R of WOODS) {
    const len = R.z1 - R.z0, cz = (R.z0 + R.z1) / 2;
    for (let x = R.x0; x < R.x1 - 0.01; x += 0.5) addBox(g, 0.505, 0.1, len, rnd() < 0.5 ? wood : wood2, x + 0.25, top - 0.05, cz).receiveShadow = true;
    for (let z = R.z0 + 0.6; z < R.z1; z += 3.4) addBox(g, R.x1 - R.x0, 0.2, 0.18, woodDark, (R.x0 + R.x1) / 2, top - 0.2, z); // 받침 보
  }
  const post = (x, z) => cyl(0.14, 0.16, top - SEA_Y + 2.2, woodDark, x, top - (top - SEA_Y + 2.2) / 2 + 0.15, z);
  // 물속 기둥: 물에 닿는 가장자리를 따라
  const edge = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.9)); for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); };
  const [AW, AE] = ARMS;
  edge(HARBOR.x0 + 0.2, P.z1 - 0.2, HARBOR.x1 - 0.2, P.z1 - 0.2); // 항구 쪽 앞 판 끝
  for (const A of ARMS) { edge(A.x0 + 0.2, A.z0, A.x0 + 0.2, A.z1 - 0.2); edge(A.x1 - 0.2, A.z0, A.x1 - 0.2, A.z1 - 0.2); }
  edge(P.x0 + 0.2, P.z0 + 1, P.x0 + 0.2, P.z1); edge(P.x1 - 0.2, P.z0 + 1, P.x1 - 0.2, P.z1);
  // 물에 닿는 가장자리 낮은 턱 (낚시하려고 난간 대신)
  const curb = (x0, z0, x1, z1) => addBox(g, Math.max(0.14, x1 - x0), 0.12, Math.max(0.14, z1 - z0), woodDark, (x0 + x1) / 2, top + 0.06, (z0 + z1) / 2);
  curb(P.x0, P.z0, P.x0 + 0.14, AW.z1); curb(P.x1 - 0.14, P.z0, P.x1, AE.z1); // 서·동 바깥
  curb(HARBOR.x0, P.z1 - 0.14, HARBOR.x1, P.z1); // 항구 쪽
  curb(AW.x1 - 0.14, AW.z0, AW.x1, AW.z1); curb(AE.x0, AE.z0, AE.x0 + 0.14, AE.z1); // 팔 안쪽
  curb(AW.x0, AW.z1 - 0.14, AW.x1, AW.z1); curb(AE.x0, AE.z1 - 0.14, AE.x1, AE.z1); // 팔 끝
  // 계류 말뚝: 항구 둘레
  const bollard = (x, z) => { cyl(0.18, 0.22, 0.45, metal, x, top + 0.22, z, 12); cyl(0.26, 0.26, 0.08, metal, x, top + 0.48, z, 12); };
  for (const [x, z] of [[HARBOR.x0 + 0.5, P.z1 - 0.45], [HARBOR.x1 - 0.5, P.z1 - 0.45], [AW.x1 - 0.45, AW.z0 + 5.5], [AE.x0 + 0.45, AE.z0 + 5.5], [8, P.z1 - 0.45]]) bollard(x, z);

  // 가로등 (밤에 빛남): 서쪽 계단과 데크 사이 절벽 앞 + 두 팔 가운데 바깥쪽
  const lampMat = glowMat(0xfff4d2, 0xffe2a0, 0.25, 1.6);
  const halos = [], beatSigns = []; // ⑤ 박자 빛 무리 · 들썩이는 간판
  const lamp = (x, z) => { cyl(0.06, 0.08, 3.2, metal, x, top + 1.6, z, 8); const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lampMat); h.position.set(x, top + 3.3, z); g.add(h); halos.push(beatHalo(g, x, top + 3.3, z, 0xffe2a0, 1.6)); };
  lamp(STAIRS[0].x1 + 0.6, P.z0 + 0.6);
  lamp(AW.x0 + 0.35, (AW.z0 + AW.z1) / 2); lamp(AE.x1 - 0.35, (AE.z0 + AE.z1) / 2);
  // 절벽에 건 구명 튜브
  const buoyAt = (bx) => {
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 20), red); buoy.position.set(bx, top + 1.6, C.face + 0.12); g.add(buoy);
    for (let i = 0; i < 4; i++) { const w = addBox(g, 0.2, 0.06, 0.24, white, 0, 0, 0); const a = i * Math.PI / 2 + 0.78; w.position.set(bx + Math.cos(a) * 0.42, top + 1.6 + Math.sin(a) * 0.42, C.face + 0.12); w.rotation.z = a; }
  };
  buoyAt(9); buoyAt(15.5);

  // ── 등대 2개: 팔 끝 바깥쪽 돌 받침 위 (서쪽 흰 등대 · 동쪽 빨간 등대)
  for (const B of LH_BASES) {
    const h = top - (SEA_Y - 3);
    addBox(g, B.x1 - B.x0, h, B.z1 - B.z0, rock, (B.x0 + B.x1) / 2, SEA_Y - 3 + h / 2, (B.z0 + B.z1) / 2);
    addBox(g, B.x1 - B.x0 + 0.08, 0.1, B.z1 - B.z0 + 0.08, stoneTop, (B.x0 + B.x1) / 2, top - 0.04, (B.z0 + B.z1) / 2).receiveShadow = true;
  }
  for (const L of LIGHTHOUSES) {
    const body = L.side === 'west' ? white : red, band = L.side === 'west' ? red : white;
    const H = 4.6;
    cyl(L.r + 0.12, L.r + 0.2, 0.4, stoneTop, L.x, top + 0.2, L.z, 12); // 받침
    cyl(L.r * 0.7, L.r, H, body, L.x, top + 0.4 + H / 2, L.z, 12);
    for (const k of [0.3, 0.62]) cyl(L.r * (1 - k * 0.3) + 0.01, L.r * (1 - k * 0.3 + 0.04) + 0.01, 0.45, band, L.x, top + 0.4 + H * k, L.z, 12);
    const yTop = top + 0.4 + H;
    cyl(L.r * 0.95, L.r * 0.95, 0.12, metal, L.x, yTop + 0.06, L.z, 14); // 둘레 발판
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 10), glowMat(L.side === 'west' ? 0xd8fff0 : 0xfff0d0, L.side === 'west' ? 0x6dffb5 : 0xffb04a, 0.5, 3));
    lens.position.set(L.x, yTop + 0.47, L.z); g.add(lens);
    halos.push(beatHalo(g, L.x, yTop + 0.47, L.z, L.side === 'west' ? 0x6dffb5 : 0xffb04a, 4.5));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 10), band); cap.position.set(L.x, yTop + 1.17, L.z); cap.castShadow = true; g.add(cap);
    cyl(0.04, 0.04, 0.4, metal, L.x, yTop + 1.65, L.z, 6);
    const door = addBox(g, 0.5, 0.95, 0.06, woodDark, 0, 0, 0); // 문: 항구 쪽(안쪽)을 봄
    const dx = L.side === 'west' ? 1 : -1;
    door.position.set(L.x + dx * (L.r - 0.02), top + 0.88, L.z); door.rotation.y = Math.PI / 2;
  }

  // ── 항구의 작은 배 (물결 따라 오르내림 — 합치지 않음)
  const boat = new THREE.Group(); boat.name = 'harborBoat';
  const hullM = std(0xf6f3ea, { roughness: 0.55 }), stripe = std(0x2f6fb5, { roughness: 0.55 }), deckM = std(0xc49a6c, { roughness: 0.8 });
  addBox(boat, 4.2, 0.9, 1.9, hullM, 0, 0.15, 0);
  const bow = addBox(boat, 1.35, 0.9, 1.35, hullM, 2.1, 0.15, 0); bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 1);
  addBox(boat, 4.25, 0.16, 1.95, stripe, 0, 0.35, 0);
  addBox(boat, 4.0, 0.05, 1.7, deckM, -0.05, 0.62, 0);
  addBox(boat, 1.4, 0.95, 1.3, hullM, -0.7, 1.1, 0); // 조타실
  addBox(boat, 1.55, 0.1, 1.45, stripe, -0.7, 1.62, 0);
  addBox(boat, 0.05, 0.4, 1.0, std(0x9fd3f0, { roughness: 0.2 }), -0.02, 1.2, 0); // 앞 유리
  cyl(0.05, 0.05, 2.4, metal, -1.5, 1.8, 0, 6, boat);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35), new THREE.MeshStandardMaterial({ color: 0xe0483e, side: THREE.DoubleSide })); flag.position.set(-1.25, 2.8, 0); boat.add(flag);
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), [red, std(0xffd23f), std(0x48b06a)][i]); f.position.set(0.6 + i * 0.45, 0.78, (i - 1) * 0.5); boat.add(f); } // 부표
  const BX = (HARBOR.x0 + HARBOR.x1) / 2 - 3.5, BZ = P.z1 + 3.3;
  boat.position.set(BX, SEA_Y, BZ); boat.rotation.y = 0.08;
  boat.traverse((o) => { o.userData.noBake = true; if (o.isMesh) o.castShadow = true; });
  g.add(boat);
  let lastBeat = null, hop = 0, flagK = 0, lastT = 0;
  anim?.push((t) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    // ⑤ 박자: 배가 '통' 튀고 깃발이 펄럭, 등·등대 빛이 번쩍, 간판이 들썩 (낚시 줄다리기 중 + ⚙️에서 켰을 때만)
    const on = BEAT.on && BEAT.fx.pier;
    if (on && BEAT.n !== lastBeat) { lastBeat = BEAT.n; hop = BEAT.accent ? 1 : 0.6; flagK = 1; }
    if (!on) lastBeat = null;
    hop = Math.max(0, hop - dt * 5); flagK = Math.max(0, flagK - dt * 3);
    const p = on ? BEAT.pulse * (BEAT.accent ? 1 : 0.65) : 0;
    for (const s of halos) { s.visible = p > 0.02; s.material.opacity = p * 0.9; s.scale.setScalar(s.userData.size * (0.8 + p * 0.4)); }
    for (const sg of beatSigns) sg.scale.set(1 + p * 0.06, 1 + p * 0.1, 1);
    flag.rotation.y = Math.sin(t * 22) * 0.5 * flagK;
    const h = seaH(BX, BZ, t);
    boat.position.y = h - 0.05 + Math.sin(hop * Math.PI) * 0.12;
    boat.rotation.z = (seaH(BX + 1.5, BZ, t) - seaH(BX - 1.5, BZ, t)) * 0.12;
    boat.rotation.x = (seaH(BX, BZ + 1, t) - seaH(BX, BZ - 1, t)) * 0.15;
  });

  // ── 🍣 횟집 (서쪽 계단 아래, 정면이 남쪽)
  {
    const M = MARKET, x0 = M.x - M.w / 2, x1 = M.x + M.w / 2, z0 = M.z - M.d / 2, z1 = M.z + M.d / 2, H = 2.7;
    const wall = std(0xf4ecdc, { roughness: 0.85 }), navy = std(0x24406b, { roughness: 0.7 });
    addBox(g, M.w, H, M.d - 0.9, wall, M.x, top + H / 2, z0 + (M.d - 0.9) / 2); // 뒤쪽 방
    addBox(g, 0.18, H, M.d, wall, x0 + 0.09, top + H / 2, M.z); addBox(g, 0.18, H, M.d, wall, x1 - 0.09, top + H / 2, M.z); // 옆 벽
    addBox(g, M.w, 0.95, 0.5, navy, M.x, top + 0.48, z1 - 0.25); // 판매대
    addBox(g, M.w + 0.1, 0.06, 0.62, std(0xdcd6c8), M.x, top + 0.98, z1 - 0.25);
    const tankM = new THREE.MeshStandardMaterial({ color: 0x7fd0ff, emissive: 0x2a8fd0, emissiveIntensity: 0.3, transparent: true, opacity: 0.75, roughness: 0.1 });
    tankM.userData.glow = [0.3, 1.2];
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.45), tankM); tank.position.set(M.x - 1.1, top + 1.36, z1 - 0.3); g.add(tank); // 수조
    for (let i = 0; i < 3; i++) { const f = addBox(g, 0.22, 0.08, 0.04, [std(0xff8a5c), std(0x8fb0c8), std(0xffd36b)][i], M.x - 1.5 + i * 0.4, top + 1.3 + (i % 2) * 0.15, z1 - 0.3); f.userData.noBake = true; }
    addBox(g, M.w + 0.3, 0.14, M.d + 0.2, navy, M.x, top + H + 0.07, M.z); // 지붕
    // 줄무늬 차양 (앞으로 기울게)
    const awn = new THREE.Group(); awn.position.set(M.x, top + H - 0.05, z1); awn.rotation.x = 0.42; g.add(awn);
    for (let i = 0; i < 8; i++) addBox(awn, M.w / 8 + 0.01, 0.05, 1.0, i % 2 ? white : red, x0 - M.x + M.w / 16 + i * M.w / 8, 0, 0.5);
    for (const px of [x0 + 0.12, x1 - 0.12]) cyl(0.045, 0.045, H - 0.4, woodDark, px, top + (H - 0.4) / 2, z1 + 0.86, 6); // 차양 기둥
    // 간판 (지붕 위, 남쪽을 봄) + 붉은 등 2개
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.78), new THREE.MeshBasicMaterial({ map: signTex('🍣 바다 횟집', '#fff8ea', '#c4382f', 360) }));
    sign.position.set(M.x, top + H + 0.6, z1 - 0.05); g.add(sign);
    sign.userData.noBake = true; beatSigns.push(sign); // ⑤ 박자에 들썩
    addBox(g, 2.7, 0.86, 0.06, navy, M.x, top + H + 0.6, z1 - 0.1);
    const lanternM = glowMat(0xff6a4a, 0xff4a2a, 0.35, 2.2);
    for (const px of [x0 + 0.45, x1 - 0.45]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lanternM); l.scale.y = 1.3; l.position.set(px, top + H - 0.85, z1 + 0.62); g.add(l); halos.push(beatHalo(g, px, top + H - 0.85, z1 + 0.62, 0xff6a4a, 1.4)); }
    // 사장님 = 기본 흰색 캐릭터 (사용자 11/26 — 문어·곰 등은 나중에). 탁구채 없이, 판매대 뒤에서 손님(남쪽)을 봄
    const boss = makeCharacter('#e0333c');
    boss.body.remove(boss.arm);
    boss.group.position.set(M.x + 0.7, top + 0.5, z1 - 0.75); boss.group.rotation.y = Math.PI; boss.group.scale.setScalar(1.3); // 판매대 뒤 발판 위
    g.add(boss.group);
  }

  // ── 📈 시세 칠판 (횟집 오른쪽 앞, 남쪽을 봄) — 진짜 시세(market.js)를 쉬는 시간마다 다시 그림
  {
    const B = BOARD, frameM = woodDark;
    for (const ox of [-B.w / 2 + 0.08, B.w / 2 - 0.08]) { const leg = addBox(g, 0.07, 1.9, 0.07, frameM, B.x + ox, top + 0.95, B.z); leg.rotation.x = -0.08; }
    addBox(g, B.w, 1.18, 0.06, frameM, B.x, top + 1.25, B.z - 0.02);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 360;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(B.w - 0.12, 1.06), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(B.x, top + 1.25, B.z + 0.015); face.userData.noBake = true; face.name = 'priceBoard'; g.add(face);
    let shown = '';
    const draw = () => {
      const ms = nowMs(), p = period(ms), key = p.day + ':' + p.idx;
      if (key === shown) return;
      shown = key;
      const h = history(ms, 2), cur = h[1], prev = h[0];
      const c = cv.getContext('2d');
      c.fillStyle = '#23402f'; c.fillRect(0, 0, 512, 360);
      c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % 512, (i * 53) % 360, 60, 2); // 분필 자국
      c.fillStyle = '#fffbe8'; c.font = FONT(40); c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('📈 오늘의 시세', 20, 34);
      c.font = FONT(22); c.fillStyle = 'rgba(255,251,232,.75)'; c.textAlign = 'right'; c.fillText(`다음 ${nextLabel(ms)}`, 496, 38);
      const ids = Object.keys(cur.list).sort((a, b) => (a === cur.jackpot ? -1 : b === cur.jackpot ? 1 : cur.list[b] - cur.list[a]));
      ids.forEach((id, i) => {
        const y = 86 + i * 39, v = cur.list[id], d = v - (prev.list[id] ?? v);
        if (id === cur.jackpot) { c.fillStyle = 'rgba(255,140,60,.35)'; c.fillRect(12, y - 18, 488, 36); }
        c.textAlign = 'left'; c.font = FONT(28); c.fillStyle = '#fffbe8';
        c.fillText(`${id === cur.jackpot ? '🔥' : CATCH[id].emoji} ${CATCH[id].name}`, 22, y);
        c.textAlign = 'right'; c.fillText((v / 10).toFixed(1), 400, y);
        c.font = FONT(24); c.fillStyle = d > 0 ? '#ff7a7a' : d < 0 ? '#7ac0ff' : 'rgba(255,251,232,.55)';
        c.fillText(d > 0 ? `▲${(d / 10).toFixed(1)}` : d < 0 ? `▼${(-d / 10).toFixed(1)}` : '–', 494, y);
      });
      tex.needsUpdate = true;
    };
    draw();
    let next = 0;
    anim?.push((t) => { if (t > next) { next = t + 20; draw(); } });
  }

  // ── 🐾 고양이 쉼터 (동쪽 계단 아래): 상자 더미 · 방석 · 생선 바구니 · 밥그릇 · 작은 간판 (고양이는 cats.md 3단계)
  {
    const K = CAT_NOOK, card = std(0xc8a06a, { roughness: 0.9 }), card2 = std(0xb88f5a, { roughness: 0.9 });
    const boxAt = (x, y, z, w, h, d, ry) => { const b = addBox(g, w, h, d, rnd() < 0.5 ? card : card2, x, top + y + h / 2, z); b.rotation.y = ry; b.castShadow = true; return b; };
    boxAt(K.x1 - 0.65, 0, K.z0 + 0.6, 1.0, 0.7, 0.85, 0.05); boxAt(K.x1 - 1.7, 0, K.z0 + 0.55, 0.9, 0.6, 0.8, -0.12); boxAt(K.x1 - 1.0, 0.7, K.z0 + 0.6, 0.8, 0.55, 0.7, 0.2);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), std(0x3a2a18)); hole.position.set(K.x1 - 0.65, top + 0.32, K.z0 + 1.035); g.add(hole); // 상자 구멍
    for (const [x, z, col] of [[K.x0 + 1.0, K.z0 + 1.2, 0xf5a3b8], [K.x0 + 2.4, K.z0 + 1.9, 0x9cc8f0], [K.x0 + 0.9, K.z0 + 2.7, 0xffd98a]]) { // 방석
      const c = cyl(0.5, 0.55, 0.14, std(col, { roughness: 0.95 }), x, top + 0.07, z, 16); c.scale.z = 0.85;
    }
    const bk = cyl(0.42, 0.34, 0.42, std(0x9a6b3a, { roughness: 0.95 }), K.x1 - 2.9, top + 0.21, K.z0 + 0.6, 12); // 생선 바구니
    for (let i = 0; i < 3; i++) { const f = addBox(g, 0.36, 0.08, 0.12, std(0x8fb0c8), K.x1 - 3.0 + i * 0.12, top + 0.46 + i * 0.03, K.z0 + 0.6 + (i - 1) * 0.12); f.rotation.set(0, i * 0.7, 0.5); }
    bk.name = 'catBasket';
    for (const [x, col] of [[K.x0 + 2.7, 0xe0483e], [K.x0 + 3.2, 0x2f6fb5]]) cyl(0.17, 0.12, 0.1, std(col), x, top + 0.05, K.z0 + 3.0, 12); // 밥그릇
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), new THREE.MeshBasicMaterial({ map: signTex('🐾 고양이 쉼터', '#fff4e4', '#b0623a', 380) }));
    sign.position.set(K.x0 + 0.45, top + 1.25, K.z0 + 3.3); g.add(sign); // 세운 간판 (계단에서 내려오면 보임)
    addBox(g, 1.38, 0.5, 0.05, woodDark, K.x0 + 0.45, top + 1.25, K.z0 + 3.27);
    cyl(0.04, 0.04, 1.0, woodDark, K.x0 + 0.45, top + 0.5, K.z0 + 3.24, 6);
  }

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
    note.position.set(ax - 0.5, 0.92, S.z0 - 0.52); note.rotation.set(0, Math.PI, -0.12); g.add(note); // 보는 사람 기준 오른쪽 아래 (글자 안 가리게)
  }
  return g;
}
