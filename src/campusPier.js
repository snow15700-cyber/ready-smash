// 전망대 밑 낚시터 (docs/dev/fishing.md 12장·14장 1b, 사용자 확정 11/25·11/26):
// 전망대 데크(절벽 끝까지) 양옆(서·동) 넓고 가파른 돌계단으로 곧장 내려가면 → 'ㄷ자' 넓은 선착장.
//   앞 판 34 × 7.5m(절벽에 붙음) + 양 끝 팔 2개(11m, 바다 쪽) — 팔 사이 작은 항구에 배, 팔 끝에 등대(서쪽 흰색·동쪽 빨간색).
//   앞 판 서쪽 계단 아래 🍣 횟집 + 📈 시세 칠판(진짜 시세, market.js), 동쪽 계단 아래 🐾 고양이 쉼터(상자·방석·생선 바구니).
// 시안(campus.html)·실제 광장(arena-plaza.js)·낚시 시안(fishing.html)이 모두 buildCampus로 같이 씀. 자리는 campusLayout.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { addBox, canvasTex, seeded, std } from './arena-kit.js';
import { ARMS, BOARD, CAT_NOOK, CLIFF, HARBOR, LH_BASES, LIGHTHOUSES, MARKET, PIER, SEA_Y, STAIRS } from './campusLayout.js';
import { BIG_FISH, MARKET_FISH, history, nextLabel, demandOf, period, wxFor } from './games/fishing/market.js';
import { fishNews, newsKnown } from './account.js';
import { liveWx } from './plazaSky.js';
import { CATCH } from './games/fishing/rules.js';
import { nowMs } from './breaks.js';
import { makeCharacter } from './scene.js';
import { BEAT } from './games/fishing/beat.js';
import { addPierFriends } from './games/fishing/friendsPier.js';

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
  // 팔 가운데 가로등은 뺌 (13-3: 팔에서 서·동쪽 바다로 던지면 카메라 앞을 가림) — 팔은 등대가 밝힘
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
    const door = addBox(g, 0.5, 0.95, 0.06, woodDark, 0, 0, 0); // 문: 팔(북쪽)을 봄 — 팔 끝에서 걸어 들어가는 모양
    door.position.set(L.x, top + 0.88, L.z - (L.r - 0.02));
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
  // ── 🎶 박자 친구들 (fishing.md 13-3): 장르 자리마다 바라보는 바다에 (재즈 갈매기는 이 배 위)
  addPierFriends(g, anim, { seaH, seaY: SEA_Y, pierY: top, rockMat: rock, boat });
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

  // ── 🍣 횟집 (서쪽 계단 아래, 정면이 남쪽) — 11/28 새 모습: 나무 기둥·베이지 벽 일본식 가게 + 지붕 위 큰 연어·참치 초밥
  //   빨간 초롱 4개 · 앞 양 모서리 수조(물고기 그림자가 헤엄) · 열린 미닫이문 안쪽 사장님 · 문 위 노렌 '바다 횟집'
  {
    const M = MARKET, x0 = M.x - M.w / 2, x1 = M.x + M.w / 2, z0 = M.z - M.d / 2, z1 = M.z + M.d / 2, H = 2.7, T = 0.16, DW = 1.5, DH = 2.1;
    const wall = std(0xeadcc0, { roughness: 0.9 }), beam = std(0x8a5532, { roughness: 0.85 }), base = std(0x3e3a37, { roughness: 0.9 });
    const roofM = std(0x4d4642, { roughness: 0.8 }), rim = std(0xb9b3a9, { roughness: 0.85 }), roofTop = std(0x2e3034, { roughness: 0.9 });
    const inside = glowMat(0xc9a77c, 0x5a3a1c, 0.15, 0.7); // 문 안쪽 (밤엔 따뜻하게 빛남)
    const dl = M.x - DW / 2, dr = M.x + DW / 2; // 문 양 끝
    addBox(g, M.w + 0.1, 0.16, M.d + 0.1, base, M.x, top + 0.08, M.z); // 바닥 받침
    // 벽: 뒤·양옆 + 앞(문 자리만 비움) + 문 위 인방
    addBox(g, M.w, H, T, wall, M.x, top + H / 2, z0 + T / 2);
    for (const sx of [x0 + T / 2, x1 - T / 2]) addBox(g, T, H, M.d, wall, sx, top + H / 2, M.z);
    addBox(g, dl - x0, H, T, wall, (x0 + dl) / 2, top + H / 2, z1 - T / 2);
    addBox(g, x1 - dr, H, T, wall, (dr + x1) / 2, top + H / 2, z1 - T / 2);
    addBox(g, DW, H - DH, T, wall, M.x, top + DH + (H - DH) / 2, z1 - T / 2);
    addBox(g, M.w - 0.4, H - 0.2, 0.05, inside, M.x, top + H / 2, z0 + T + 0.03); // 안쪽 벽
    addBox(g, DW + 0.2, 0.03, M.d - 0.4, inside, M.x, top + 0.18, M.z); // 안쪽 바닥
    // 안쪽 작은 진열대 (사장님 앞)
    addBox(g, 1.3, 0.55, 0.4, beam, M.x - 0.2, top + 0.45, z1 - 0.95);
    addBox(g, 1.36, 0.05, 0.46, std(0xf3efe6), M.x - 0.2, top + 0.75, z1 - 0.95);
    // 나무 기둥·보 (앞 네 기둥 + 옆 가운데, 문 높이 띠, 그 위 작은 칸 창살)
    const pz = z1 + 0.02;
    for (const px of [x0 + 0.07, dl - 0.06, dr + 0.06, x1 - 0.07]) addBox(g, 0.14, H, 0.14, beam, px, top + H / 2, pz);
    for (const sx of [x0 - 0.02, x1 + 0.02]) { addBox(g, 0.14, H, 0.14, beam, sx, top + H / 2, M.z); addBox(g, 0.14, H, 0.14, beam, sx, top + H / 2, z0 + 0.07); }
    addBox(g, M.w + 0.04, 0.12, 0.16, beam, M.x, top + DH + 0.06, pz); // 문 높이 띠 (앞)
    for (const sx of [x0 - 0.02, x1 + 0.02]) addBox(g, 0.16, 0.12, M.d, beam, sx, top + DH + 0.06, M.z); // (옆)
    addBox(g, M.w + 0.04, 0.1, 0.16, beam, M.x, top + H - 0.05, pz);
    for (let x = x0 + 0.45; x < x1 - 0.2; x += 0.42) addBox(g, 0.06, H - DH - 0.2, 0.06, beam, x, top + (DH + H) / 2, pz + 0.04); // 위 작은 칸
    for (const sx of [x0 - 0.04, x1 + 0.04]) for (let z = z0 + 0.45; z < z1 - 0.2; z += 0.42) addBox(g, 0.06, H - DH - 0.2, 0.06, beam, sx, top + (DH + H) / 2, z);
    // 창: 앞 왼쪽 유리창 · 앞 오른쪽·동쪽 옆 격자창(창호지, 밤에 은은히 빛남)
    const latticeTex = canvasTex(128, 128, (c) => { c.fillStyle = '#fbf3dc'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#7a4a2a'; c.lineWidth = 6; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, 128); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(128, i * 32); c.stroke(); } });
    const paper = new THREE.MeshStandardMaterial({ map: latticeTex, emissive: 0xffd9a0, emissiveIntensity: 0.05, roughness: 0.9 }); paper.userData.glow = [0.05, 0.6];
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc9dc, emissive: 0x6a8fa0, emissiveIntensity: 0.1, roughness: 0.15, metalness: 0.1 }); glass.userData.glow = [0.1, 0.5];
    const win = (m, w, h, x, y, z, ry = 0) => { const fr = addBox(g, w + 0.12, h + 0.12, 0.06, beam, x, y, z); fr.rotation.y = ry; const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x + Math.sin(ry) * 0.035, y, z + Math.cos(ry) * 0.035); p.rotation.y = ry; g.add(p); };
    win(glass, 1.0, 0.85, (x0 + dl) / 2, top + 1.5, z1 + 0.01);
    win(paper, 0.9, 1.1, (dr + x1) / 2, top + 1.4, z1 + 0.01);
    win(paper, 1.1, 1.0, x1 + 0.01, top + 1.45, M.z - 0.2, Math.PI / 2);
    win(paper, 1.1, 1.0, x0 - 0.01, top + 1.45, M.z - 0.2, -Math.PI / 2);
    // 열린 미닫이문 두 짝 (바깥으로 비스듬히)
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(M.x + s * DW / 2, top + 0.16, z1); hinge.rotation.y = s * 1.95; g.add(hinge);
      const w = DW / 2 - 0.04;
      addBox(hinge, w, DH - 0.2, 0.06, beam, -s * w / 2, (DH - 0.2) / 2, 0.03);
      addBox(hinge, w - 0.18, DH - 0.75, 0.02, std(0xd9c7a3, { roughness: 0.9 }), -s * w / 2, (DH - 0.2) / 2 + 0.15, 0.065);
    }
    // 지붕: 처마 판 + 회색 테두리 + 어두운 윗면
    addBox(g, M.w + 0.6, 0.14, M.d + 0.5, roofM, M.x, top + H + 0.07, M.z + 0.1);
    addBox(g, M.w - 0.1, 0.36, M.d - 0.15, rim, M.x, top + H + 0.32, M.z);
    addBox(g, M.w - 0.45, 0.37, M.d - 0.5, roofTop, M.x, top + H + 0.325, M.z);
    const roofY = top + H + 0.51;
    // 🍣 지붕 위 큰 초밥 두 개 (연어 · 참치) — 박자에 맞춰 통통 (beatSigns)
    const rice = std(0xf7f5ef, { roughness: 0.75 });
    const salmonTex = canvasTex(256, 128, (c) => { c.fillStyle = '#f2803f'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#ffe3cc'; c.lineWidth = 9; for (let x = -100; x < 300; x += 38) { c.beginPath(); c.moveTo(x, 128); c.quadraticCurveTo(x + 30, 64, x + 70, 0); c.stroke(); } });
    const salmon = new THREE.MeshStandardMaterial({ map: salmonTex, roughness: 0.4 });
    const tuna = std(0xd8343f, { roughness: 0.45 }), nori = std(0x1f3a2a, { roughness: 0.8 });
    const sushi = (topM, x, ry, withNori) => {
      const s = new THREE.Group(); s.position.set(x, roofY, M.z + 0.05); s.rotation.y = ry; g.add(s);
      const r = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.62, 0.95, 3, 0.26), rice); r.position.y = 0.31; s.add(r);
      const f = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.26, 1.08, 3, 0.12), topM); f.position.y = 0.7; f.rotation.z = 0.04; s.add(f);
      if (withNori) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.86, 1.14), nori); n.position.y = 0.43; s.add(n); n.scale.y = 1.02; addBox(s, 0.36, 0.03, 1.14, nori, 0, 0.85, 0); }
      s.traverse((o) => { o.userData.noBake = true; if (o.isMesh) o.castShadow = true; });
      beatSigns.push(s);
    };
    sushi(salmon, M.x - 1.1, 0.12, false);
    sushi(tuna, M.x + 1.05, -0.1, true);
    // 노렌 (문 위에 거는 천, 세 갈래) '바다 횟집' — 박자에 들썩
    const norenTex = canvasTex(384, 120, (c) => { c.fillStyle = '#25385f'; c.fillRect(0, 0, 384, 160); c.fillStyle = '#fff8ea'; c.font = FONT(54); c.textAlign = 'center'; c.textBaseline = 'middle'; ['바다', '🍣', '횟집'].forEach((t, i) => c.fillText(t, 64 + i * 128, 64)); });
    const noren = new THREE.Group(); noren.position.set(M.x, top + DH + 0.02, z1 + 0.09); g.add(noren);
    for (let i = 0; i < 3; i++) {
      const tx = norenTex.clone(); tx.repeat.set(1 / 3, 1); tx.offset.set(i / 3, 0); tx.needsUpdate = true;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(DW / 3 - 0.04, 0.42), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9, side: THREE.DoubleSide }));
      strip.position.set((i - 1) * DW / 3, -0.21, 0); noren.add(strip);
    }
    addBox(noren, DW + 0.2, 0.05, 0.05, beam, 0, 0.01, 0);
    noren.traverse((o) => { o.userData.noBake = true; });
    beatSigns.push(noren);
    // 빨간 초롱 4개: 처마 앞 두 모서리 + 양옆 처마 가운데 (박마다 빛 무리)
    const lanternM = glowMat(0xd9302b, 0xff3a22, 0.35, 2.2), capM = std(0x1d1d1f, { roughness: 0.6 });
    for (const [lx, lz, ly] of [[x0 - 0.15, z1 + 0.25, H - 0.55], [x1 + 0.15, z1 + 0.25, H - 0.55], [x0 - 0.2, M.z - 0.2, H - 0.55], [x1 + 0.2, M.z - 0.2, H - 0.55]]) {
      const y = top + ly;
      cyl(0.17, 0.17, 0.44, lanternM, lx, y, lz, 12);
      cyl(0.12, 0.12, 0.06, capM, lx, y + 0.25, lz, 10); cyl(0.12, 0.12, 0.06, capM, lx, y - 0.25, lz, 10);
      cyl(0.015, 0.015, top + H - y - 0.28, capM, lx, (y + 0.28 + top + H) / 2, lz, 4);
      halos.push(beatHalo(g, lx, y, lz, 0xff5a3a, 1.4));
    }
    // 앞 양 모서리 수조 (어두운 받침 위, 물고기 그림자가 천천히 헤엄)
    const tankM = new THREE.MeshStandardMaterial({ color: 0x5ab8f0, emissive: 0x1f7fd0, emissiveIntensity: 0.3, transparent: true, opacity: 0.72, roughness: 0.1 });
    tankM.userData.glow = [0.3, 1.2];
    const fishShape = new THREE.Shape(); fishShape.ellipse(0, 0, 0.13, 0.055, 0, Math.PI * 2); fishShape.moveTo(-0.1, 0); fishShape.lineTo(-0.22, 0.07); fishShape.lineTo(-0.22, -0.07);
    const fishGeo = new THREE.ShapeGeometry(fishShape), fishM = new THREE.MeshBasicMaterial({ color: 0x1b4f8a, side: THREE.DoubleSide });
    const swimmers = [];
    for (const [tx, tw] of [[x0 + 0.5, 1.0], [x1 - 0.5, 1.0]]) {
      const tz = z1 + 0.42;
      addBox(g, tw, 0.5, 0.56, base, tx, top + 0.25, tz);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.55, 0.52), tankM); tank.position.set(tx, top + 0.78, tz); tank.userData.noBake = true; g.add(tank);
      addBox(g, tw + 0.04, 0.04, 0.56, base, tx, top + 1.06, tz);
      for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(fishGeo, fishM); f.position.set(tx, top + 0.7 + i * 0.16, tz + 0.27); f.userData = { noBake: true, cx: tx, w: tw / 2 - 0.25, ph: i * 2.1 + tx }; g.add(f); swimmers.push(f); }
    }
    anim?.push((t) => { for (const f of swimmers) { const u = t * 0.5 + f.userData.ph; f.position.x = f.userData.cx + Math.sin(u) * f.userData.w; f.scale.x = Math.cos(u) >= 0 ? 1 : -1; } });
    // 사장님 = 기본 캐릭터 (사용자 11/26 — 문어·곰 등은 나중에). 탁구채 없이, 문 안쪽 진열대 뒤에서 손님(남쪽)을 봄
    const boss = makeCharacter('#e0333c');
    boss.body.remove(boss.arm);
    boss.group.position.set(M.x - 0.15, top + 0.18, z1 - 1.4); boss.group.rotation.y = Math.PI; boss.group.scale.setScalar(1.1);
    g.add(boss.group);
  }

  // ── 📈 시세 칠판 (횟집 오른쪽 앞, 남쪽을 봄) — 진짜 시세(market.js)를 쉬는 시간마다 다시 그림
  {
    const B = BOARD, frameM = woodDark;
    for (const ox of [-B.w / 2 + 0.08, B.w / 2 - 0.08]) { const leg = addBox(g, 0.07, 1.9, 0.07, frameM, B.x + ox, top + 0.95, B.z); leg.rotation.x = -0.08; }
    addBox(g, B.w, 1.18, 0.06, frameM, B.x, top + 1.25, B.z - 0.02);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 720; // 두 칸: 왼쪽 일반 7 · 오른쪽 희귀 8 + 전설 2 (13-1 ②)
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(B.w - 0.12, 1.06), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(B.x, top + 1.25, B.z + 0.015); face.userData.noBake = true; face.name = 'priceBoard'; g.add(face);
    let shown = '';
    const draw = () => {
      const ms = nowMs(), p = period(ms), key = p.day + ':' + p.idx + ':' + wxFor(p) + ':' + JSON.stringify(demandOf(p)); // 📰 회차 날씨·🛒 지난 회차 판매를 알게 되면 값이 바뀌어 다시 그림
      if (key === shown) return;
      shown = key;
      const h = history(ms, 2), cur = h[1], prev = h[0];
      const c = cv.getContext('2d');
      c.fillStyle = '#23402f'; c.fillRect(0, 0, 1024, 720);
      c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 60; i++) c.fillRect((i * 197) % 1024, (i * 113) % 720, 110, 3); // 분필 자국
      c.fillStyle = '#fffbe8'; c.font = FONT(70); c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('📈 오늘의 시세', 30, 56);
      c.font = FONT(40); c.fillStyle = 'rgba(255,251,232,.75)'; c.textAlign = 'right'; c.fillText(`다음 ${nextLabel(ms)}`, 994, 62);
      c.font = FONT(26); c.fillStyle = 'rgba(255,251,232,.6)'; c.fillText('🎸 록 크게 출렁 · 🎷 재즈 보통 · 🎻 발라드 잔잔', 994, 104); // 13-3 ⑤
      c.fillStyle = 'rgba(255,251,232,.25)'; c.fillRect(511, 112, 3, 590); // 가운데 줄
      const head = (x, y, t) => { c.textAlign = 'left'; c.font = FONT(34); c.fillStyle = '#ffe9a8'; c.fillText(t, x + 6, y); };
      const line = (x, y, id) => {
        const v = cur.list[id], d = v - (prev.list[id] ?? v), hot = id === cur.jackpot, leg = CATCH[id].grade === 'legend';
        if (hot || leg) { c.fillStyle = hot ? 'rgba(255,140,60,.35)' : 'rgba(255,210,60,.2)'; c.fillRect(x, y - 24, 484, 48); }
        c.textAlign = 'left'; c.font = FONT(38); c.fillStyle = '#fffbe8';
        const nm = CATCH[id].name;
        const gi = { jazz: '🎷', rock: '🎸', ballad: '🎻' }[CATCH[id].genre]; // 13-3 ⑤ 그 자리에서 잘 나오는 물고기
        let x0 = x + 8;
        if (gi) { c.font = FONT(26); c.fillText(gi, x0, y); x0 += 34; c.font = FONT(38); }
        let t = `${hot ? '🔥' : cur.news?.id === id ? '📰' : cur.demand?.[id] ? '🛒' : CATCH[id].emoji} ${nm}`;
        if (c.measureText(t).width > x + 290 - x0) { while (t.length > 2 && c.measureText(t + '…').width > x + 290 - x0) t = t.slice(0, -1); t += '…'; }
        c.fillText(t, x0, y);
        c.textAlign = 'right'; c.fillText((v / 10).toFixed(1), x + 372, y);
        c.font = FONT(30); c.fillStyle = d > 0 ? '#ff7a7a' : d < 0 ? '#7ac0ff' : 'rgba(255,251,232,.55)';
        c.fillText(d > 0 ? `▲${(d / 10).toFixed(1)}` : d < 0 ? `▼${(-d / 10).toFixed(1)}` : '–', x + 478, y);
      };
      const common = MARKET_FISH.slice().sort((a, b) => (a === cur.jackpot ? -1 : b === cur.jackpot ? 1 : cur.list[b] - cur.list[a]));
      head(14, 136, '🐟 일반');
      common.forEach((id, i) => line(14, 190 + i * 54, id));
      const rare = BIG_FISH.filter((id) => CATCH[id].grade === 'rare'), legend = BIG_FISH.filter((id) => CATCH[id].grade === 'legend');
      head(526, 136, '💎 희귀');
      rare.forEach((id, i) => line(526, 184 + i * 48, id));
      head(526, 584, '👑 전설');
      legend.forEach((id, i) => line(526, 632 + i * 50, id));
      // 📰 소식 (13-1 ④): 왼쪽 아래, 줄 바꿈
      if (cur.news) {
        head(14, 584, '📰 소식');
        c.font = FONT(32); c.fillStyle = '#fff3c4'; c.textAlign = 'left';
        const words = `${cur.news.text} (${cur.news.dir > 0 ? '×1.3' : '×0.7'})`.split(' '), lines = [''];
        for (const w of words) { const t = lines.at(-1) ? lines.at(-1) + ' ' + w : w; if (c.measureText(t).width > 470 && lines.at(-1)) lines.push(w); else lines[lines.length - 1] = t; }
        lines.slice(0, 3).forEach((l, i) => c.fillText(l, 22, 628 + i * 40));
      }
      tex.needsUpdate = true;
    };
    draw();
    let next = 0;
    anim?.push((t) => { if (t > next) { next = t + 20; draw(); if (!newsKnown()) fishNews(liveWx()).then((ok) => ok && draw()); } }); // 📰 회차 날씨를 알리고 받기(알면 안 부름)
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
