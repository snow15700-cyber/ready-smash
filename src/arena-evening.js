// 퇴근길: 퇴근 전 사내 탁구장 ('09시까지 출근하세요' 퇴근길 코스와 같은 노을 도시)
// 큰 통유리 창(-x 쪽) 너머로 노을 해·빛줄기·노란 은행나무·불 켜진 빌딩 창·지나가는 차.
// 실내엔 주황 노을빛이 길게 들고, 18시 직전 벽시계·화이트보드·사원증 걸이·정수기.
// 반려동물: 햄스터(찻잔 속, 09시 게임에서 '퇴근길 무한모드' 펫) + 앵무새(잔소리 따라 하는 수다쟁이)
import * as THREE from 'three';
import { seeded, canvasTex, glowSprite, std, addBox, petYaw, skyDome, makeDrift, textTex, clockTex, makeFacade } from './arena-kit.js';
import { buildHamster, buildParrot } from './arena-pets.js';
import { makeCar, CAR_TYPES } from './arena-cars.js';

const RX0 = -6.5, RX1 = 7, RZ = 9, RH = 3.6; // 방 크기 (창 = x RX0)

// 09시 게임 퇴근길의 은행나무 (노란 잎 덩어리 2개 + 줄기 + 발밑 은행잎)
const ginkgoTrunk = std(0x4a3626, { roughness: 0.9 });
const ginkgoLeaf = [0xf2c230, 0xe9b01f, 0xf6d14e].map((c) => std(c, { emissive: c, emissiveIntensity: 0.12, flatShading: true, roughness: 0.85 }));
const ginkgoCarpet = std(0xe0ac2a, { roughness: 1 });
function makeGinkgo(rnd) {
  const t = new THREE.Group(), s = 0.9 + rnd() * 0.25;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 3.4 * s, 6), ginkgoTrunk);
  trunk.position.y = 1.7 * s; t.add(trunk);
  const li = Math.floor(rnd() * 3);
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45 * s, 0), ginkgoLeaf[li]);
  c1.scale.set(1, 1.35, 1); c1.position.y = 4.6 * s; c1.rotation.y = rnd() * 6.28; t.add(c1);
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 0), ginkgoLeaf[(li + 1) % 3]);
  c2.position.set(0.25, 6.3 * s, -0.1); t.add(c2);
  const carpet = new THREE.Mesh(new THREE.CircleGeometry(1.5, 7), ginkgoCarpet);
  carpet.rotation.x = -Math.PI / 2; carpet.rotation.z = rnd() * 6.28; carpet.position.y = 0.02; t.add(carpet);
  return t;
}

export function buildEvening() {
  const root = new THREE.Group();
  const rnd = seeded(18);

  // ---------- 바깥: 노을 하늘·해·빛줄기 ----------
  root.add(skyDome([[0, '#ffb066'], [0.12, '#f7a35c'], [0.35, '#e88a63'], [0.7, '#9b6f9e'], [1, '#5f5f9a']], 290));
  const sunPos = new THREE.Vector3(-250, 26, -40);
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(24, 28, 18), new THREE.MeshBasicMaterial({ color: 0xff8a3d, fog: false }));
  sunM.position.copy(sunPos); root.add(sunM);
  const halo = glowSprite(0xffb070, 150, 0.55); halo.material = halo.material.clone(); halo.material.fog = false; halo.position.copy(sunPos); root.add(halo);
  // 해 쪽에서 내려오는 빛기둥 (09시 게임 퇴근길과 같은 방식)
  const rayTex = canvasTex(32, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,200,120,0.9)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
  });
  const rays = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14 + rnd() * 16, 220), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(-235, 70, -40 + (i - 2.5) * 10);
    m.rotation.y = Math.PI / 2; m.rotation.x = (i - 2.5) * 0.12; m.rotation.z = 0.35;
    m.userData.phase = rnd() * 6.28; m.userData.noFocus = true;
    root.add(m); rays.push(m);
  }

  // ---------- 바깥: 은행나무 인도·도로·건너편 빌딩 ----------
  const OUT_W = 260;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, OUT_W), std(0x5c6066));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-140, -0.02, 0); root.add(ground);
  const walkMat = std(0x9a8f86);
  addBox(root, 4.5, 0.12, OUT_W, walkMat, RX0 - 2.25, 0.06, 0);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12.8, OUT_W), std(0x3a404d, { roughness: 0.6 }));
  road.rotation.x = -Math.PI / 2; road.position.set(RX0 - 4.5 - 6.4, 0.01, 0); root.add(road);
  addBox(root, 4.5, 0.12, OUT_W, walkMat, RX0 - 4.5 - 12.8 - 2.25, 0.06, 0);
  const lw = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), ly = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  const R0 = RX0 - 4.5; // 도로 시작 (창에서 가까운 쪽)
  for (const i of [1, 3]) for (let z = -120; z < 120; z += 9) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 3), lw); m.rotation.x = -Math.PI / 2; m.position.set(R0 - 3.2 * i, 0.02, z); root.add(m);
  }
  for (const dx of [-0.12, 0.12]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, OUT_W), ly); m.rotation.x = -Math.PI / 2; m.position.set(R0 - 6.4 + dx, 0.02, 0); root.add(m); }
  // 은행나무 가로수 (창 바로 앞 + 건너편)
  for (let z = -60; z < 60; z += 7.5) {
    const t = makeGinkgo(rnd); t.position.set(RX0 - 2.6, 0.12, z + (rnd() - 0.5) * 1.5); t.scale.setScalar(0.75); root.add(t);
    if (rnd() < 0.8) { const t2 = makeGinkgo(rnd); t2.position.set(R0 - 12.8 - 2.2, 0.12, z + 3); t2.scale.setScalar(0.75); root.add(t2); }
  }
  // 가로등 (불 켜짐)
  const poleMat = std(0x3b3f45, { metalness: 0.5, roughness: 0.5 });
  const lampHead = std(0xfff1c9, { emissive: 0xffd27a, emissiveIntensity: 0.9 });
  for (let z = -48; z < 60; z += 16) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), poleMat); p.position.set(R0 + 0.5, 2.5, z); root.add(p);
    addBox(root, 0.9, 0.16, 0.4, lampHead, R0 - 0.1, 5, z);
    const gl = glowSprite(0xffcf7a, 2.2, 0.8); gl.position.set(R0 - 0.1, 4.85, z); root.add(gl);
  }
  // 건너편 빌딩 (창문 불빛 켜짐 — 퇴근 시간)
  const facades = [makeFacade(rnd), makeFacade(rnd), makeFacade(rnd)];
  const wallColors = [0x9aa3ad, 0x7d8794, 0xa89f94, 0x6f7b88, 0xb5b0a8, 0x8c96a3, 0x5f6b78];
  const roofMat = std(0x55595f), mc = {};
  const X0 = R0 - 12.8 - 4.6;
  const building = (w, h, d, x, z) => {
    const si = Math.floor(rnd() * 3), ci = Math.floor(rnd() * 7);
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const rx = Math.max(1, Math.round(d / 3.5)), rw = Math.max(1, Math.round(w / 3.5)), ry = Math.max(1, Math.round(h / 3.5));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.floor(i / 4) < 2 ? rx : rw), uv.getY(i) * ry);
    const key = si + '_' + ci;
    const side = mc[key] || (mc[key] = std(wallColors[ci], { map: facades[si].map, emissive: 0xffc46b, emissiveMap: facades[si].emap, emissiveIntensity: 0.9 }));
    const b = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    b.position.set(x, h / 2, z); root.add(b);
  };
  let z = -120;
  while (z < 120) {
    const d = 9 + rnd() * 5, w = 10 + rnd() * 6, h = 16 + rnd() * 34;
    building(w, h, d, X0 - w / 2, z + d / 2);
    z += d + 0.6;
  }
  for (let z2 = -120; z2 < 120; z2 += 16) building(14, 50 + rnd() * 50, 12 + rnd() * 4, X0 - 26 - rnd() * 6, z2);
  // 지나가는 차 (전조등 켜고)
  const lanes = [R0 - 1.6, R0 - 4.8, R0 - 8, R0 - 11.2];
  const cars = [];
  for (let lane = 0; lane < 4; lane++) for (let k = 0; k < 2; k++) {
    const mesh = makeCar(CAR_TYPES[Math.floor(rnd() * 5)], Math.floor(rnd() * 0xffffff));
    mesh.scale.setScalar(0.78);
    const dir = lane < 2 ? -1 : 1;
    mesh.rotation.y = dir > 0 ? Math.PI : 0;
    mesh.position.set(lanes[lane], 0, -110 + (k + rnd() * 0.6) * 110);
    root.add(mesh); cars.push({ mesh, dir, lane, speed: 10 + rnd() * 4 });
  }

  // ---------- 실내: 바닥·벽·천장 ----------
  const W = RX1 - RX0, cx = (RX0 + RX1) / 2;
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = (x / 32) % 2 ? '#b98b5e' : '#c49768';
      g.fillRect(x, 0, 32, h);
      g.fillStyle = 'rgba(80,45,20,0.18)'; g.fillRect(x, 0, 2, h);
      for (let y = (x * 5) % 180; y < h; y += 180) g.fillRect(x, y, 32, 2);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(W / 3, (RZ * 2) / 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, RZ * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.001, 0); floor.receiveShadow = true; root.add(floor);
  const wallMat = std(0xefe6d6, { roughness: 0.95 });
  const ceilTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f3efe7'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,110,95,0.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  });
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(W / 2.4, (RZ * 2) / 2.4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, RZ * 2), new THREE.MeshLambertMaterial({ map: ceilTex, emissive: 0x7a6650, emissiveIntensity: 0.55 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, RH, 0); root.add(ceil);
  const panel = std(0xfffcf2, { emissive: 0xfff3d6, emissiveIntensity: 0.35 });
  for (let x = -3; x <= 5; x += 4) for (let zz = -6; zz <= 6; zz += 4) addBox(root, 1.2, 0.04, 0.6, panel, x, RH - 0.02, zz);
  addBox(root, W, RH, 0.2, wallMat, cx, RH / 2, -RZ);          // 앞벽 (A팀이 보는 쪽)
  addBox(root, W, RH, 0.2, wallMat, cx, RH / 2, RZ);           // 뒷벽 (B팀이 보는 쪽)
  addBox(root, 0.2, RH, RZ * 2, wallMat, RX1, RH / 2, 0);      // 오른쪽 벽
  const base = std(0x8a6a4c);
  addBox(root, W, 0.12, 0.04, base, cx, 0.06, -RZ + 0.12);
  addBox(root, W, 0.12, 0.04, base, cx, 0.06, RZ - 0.12);
  addBox(root, 0.04, 0.12, RZ * 2, base, RX1 - 0.12, 0.06, 0);

  // ---------- 통유리 창 (-x): 멀리언 그림자가 바닥에 길게 ----------
  const frame = std(0x3b3f45, { metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(RZ * 2, RH), glass);
  gl.rotation.y = Math.PI / 2; gl.position.set(RX0, RH / 2, 0); gl.userData.noFocus = true; root.add(gl);
  const shadowBox = (w, h, d, x, y, zz) => { const b = addBox(root, w, h, d, frame, x, y, zz); b.castShadow = true; return b; };
  for (let zz = -RZ; zz <= RZ + 0.01; zz += 1.8) shadowBox(0.12, RH, 0.1, RX0, RH / 2, zz);
  shadowBox(0.14, 0.12, RZ * 2, RX0, 2.75, 0);
  shadowBox(0.16, 0.16, RZ * 2, RX0, 0.08, 0);
  shadowBox(0.16, 0.2, RZ * 2, RX0, RH - 0.1, 0);
  // 창가 블라인드 (위로 반쯤 걷어 올림, 그림자 줄무늬)
  const blindMat = std(0xf2ebe0);
  for (let zz = -RZ + 0.9; zz < RZ; zz += 3.6) {
    for (let i = 0; i < 7; i++) { const b = addBox(root, 0.06, 0.04, 1.7, blindMat, RX0 + 0.12, RH - 0.25 - i * 0.07, zz); b.castShadow = true; }
  }
  // 실내로 드는 노을빛 (창에서 바닥으로 비스듬한 빛줄기)
  const shaftTex = canvasTex(64, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,190,110,0.85)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const shafts = [];
  for (let zz = -RZ + 0.9; zz < RZ; zz += 1.8) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.5), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(RX0 + 3.1, 1.3, zz); m.rotation.set(Math.PI / 2, 0.36, 0);
    m.userData.noFocus = true; m.userData.phase = rnd() * 6.28;
    root.add(m); shafts.push(m);
  }

  // ---------- 앞벽 (-z, A팀이 보는 쪽): 화이트보드 + 18시 직전 시계 + 비상구 ----------
  const wb = textTex(['🏓 사내 탁구 리그', '영업팀 3 : 2 개발팀', '결승: 금요일 17:30', '※ 18시 칼퇴 엄수!'], { w: 768, h: 384, bg: '#fbfcfd', color: '#1f3b73', font: 'bold 52px sans-serif', border: '#c7ccd3' });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: wb }));
  board.position.set(-1.2, 1.55, -RZ + 0.12); root.add(board);
  addBox(root, 2.7, 0.06, 0.12, std(0xb0b6bf, { metalness: 0.5 }), -1.2, 0.88, -RZ + 0.15);
  for (const [x, c] of [[-2.2, '#e0333c'], [-1.9, '#2b6cd9'], [-0.1, '#2c9b52']]) addBox(root, 0.12, 0.03, 0.03, std(c), x, 0.93, -RZ + 0.18);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ map: clockTex(17, 58) }));
  clock.position.set(2.2, 2.55, -RZ + 0.12); root.add(clock);
  const crim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 40), std(0x2b2f3a)); crim.position.copy(clock.position); root.add(crim);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.24), new THREE.MeshBasicMaterial({ map: textTex('퇴근 2분 전!', { w: 384, h: 84, bg: '#ff8a3d', color: '#fff', font: 'bold 50px sans-serif' }) }));
  tag.position.set(2.2, 1.95, -RZ + 0.12); root.add(tag);
  addBox(root, 1.0, 2.15, 0.08, std(0x8c6a4a), 4.6, 1.075, -RZ + 0.12); // 문
  addBox(root, 0.06, 0.06, 0.1, std(0xd9c36a, { metalness: 0.8 }), 4.2, 1.05, -RZ + 0.2);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: textTex('🏃 비상구', { w: 256, h: 92, bg: '#1f9a4a', color: '#fff', font: 'bold 52px sans-serif' }) }));
  exit.position.set(4.6, 2.45, -RZ + 0.12); exit.userData.noFocus = true; root.add(exit);

  // ---------- 뒷벽 (+z, B팀이 보는 쪽): 사원증 걸이 + 정수기 + 화분 ----------
  const idBoard = addBox(root, 1.8, 0.9, 0.04, std(0xd7c2a2), -1.6, 1.6, RZ - 0.12);
  idBoard.rotation.y = Math.PI;
  const strapCols = [0xe0333c, 0x2b6cd9, 0x2c9b52, 0xf2a20c, 0x7b4fd6, 0x1aa3a3];
  for (let i = 0; i < 6; i++) {
    const x = -2.3 + i * 0.28;
    addBox(root, 0.03, 0.06, 0.06, std(0x9ca3af, { metalness: 0.7 }), x, 1.98, RZ - 0.17);
    const strap = addBox(root, 0.025, 0.42, 0.01, std(strapCols[i]), x, 1.76, RZ - 0.18);
    strap.rotation.z = (i % 2 ? 1 : -1) * 0.04;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), new THREE.MeshLambertMaterial({ map: canvasTex(64, 88, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 88);
      g.fillStyle = '#' + strapCols[i].toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 16);
      g.fillStyle = '#cfd6df'; g.fillRect(16, 24, 32, 34);
      g.fillStyle = '#f6f5f1'; g.beginPath(); g.arc(32, 36, 8, 0, 7); g.fill(); g.fillRect(22, 46, 20, 12);
      g.fillStyle = '#556'; g.fillRect(12, 66, 40, 5); g.fillRect(18, 75, 28, 4);
    }) }));
    card.rotation.y = Math.PI; card.position.set(x, 1.47, RZ - 0.19); root.add(card);
  }
  const idTitle = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.2), new THREE.MeshBasicMaterial({ map: textTex('사원증은 여기에!', { w: 384, h: 64, bg: '#3d3b5c', color: '#fff', font: 'bold 38px sans-serif' }) }));
  idTitle.rotation.y = Math.PI; idTitle.position.set(-1.6, 2.2, RZ - 0.15); root.add(idTitle);
  // 정수기 (흰 몸통 + 파란 물통 + 종이컵)
  const cooler = new THREE.Group();
  addBox(cooler, 0.36, 1.05, 0.36, std(0xf4f5f6, { roughness: 0.4 }), 0, 0.525, 0);
  addBox(cooler, 0.26, 0.22, 0.04, std(0xc9ced6), 0, 0.8, 0.18);
  addBox(cooler, 0.05, 0.05, 0.06, std(0x2b6cd9), -0.06, 0.82, 0.21);
  addBox(cooler, 0.05, 0.05, 0.06, std(0xe0333c), 0.06, 0.82, 0.21);
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 20), new THREE.MeshStandardMaterial({ color: 0x8fc7f2, transparent: true, opacity: 0.75, roughness: 0.1 }));
  bottle.position.y = 1.27; cooler.add(bottle);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.1, 16), bottle.material); neck.position.y = 1.08; cooler.add(neck);
  const cups = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.3, 12), std(0xf8f8f8)); cups.position.set(0.24, 0.85, 0); cooler.add(cups);
  cooler.position.set(0.6, 0, RZ - 0.4); cooler.rotation.y = Math.PI; root.add(cooler);
  // 화분 + 소파
  const pot = (x, zz, s = 1) => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.4 * s, 10), std(0xe9e4da)); p.position.y = 0.2 * s; g.add(p);
    const leaf = new THREE.MeshLambertMaterial({ color: 0x3f8f4a, flatShading: true });
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.75 * s, 5), leaf); l.position.y = 0.6 * s; l.rotation.set(Math.cos(i) * 0.5, i, Math.sin(i * 2) * 0.5); g.add(l); }
    g.position.set(x, 0, zz); root.add(g);
  };
  pot(1.4, RZ - 0.45, 1.2); pot(-3.2, RZ - 0.5, 1.4); pot(RX1 - 0.5, -RZ + 0.6, 1.4);
  const sofa = (x, zz, ry, col) => {
    const g = new THREE.Group(), m = std(col, { roughness: 0.9 });
    addBox(g, 1.8, 0.4, 0.8, m, 0, 0.3, 0); addBox(g, 1.8, 0.5, 0.2, m, 0, 0.7, -0.3);
    addBox(g, 0.2, 0.55, 0.8, m, -0.9, 0.45, 0); addBox(g, 0.2, 0.55, 0.8, m, 0.9, 0.45, 0);
    g.position.set(x, 0, zz); g.rotation.y = ry; root.add(g);
  };
  sofa(3.6, RZ - 0.6, Math.PI, 0x3d5a80);

  // ---------- 오른쪽 벽 (+x): 게시판 + 책장 + 포스터 ----------
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshLambertMaterial({ map: canvasTex(512, 256, (g) => {
    g.fillStyle = '#c99a62'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#8a6a4c'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
    const notes = ['#ffe680', '#ffb3c7', '#9fe0c0', '#a8cdf5', '#ffd0a0'];
    const words = ['회식 X', '칼퇴!', '탁구 연습', '보고서', '고생했어요'];
    for (let i = 0; i < 9; i++) {
      const x = 30 + (i % 5) * 92 + (i * 13) % 20, y = 30 + Math.floor(i / 5) * 110 + (i * 7) % 18;
      g.save(); g.translate(x + 35, y + 35); g.rotate(((i * 37) % 20 - 10) / 80);
      g.fillStyle = notes[i % 5]; g.fillRect(-35, -35, 70, 70);
      g.fillStyle = '#e0333c'; g.beginPath(); g.arc(0, -28, 5, 0, 7); g.fill();
      g.fillStyle = '#333'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText(words[i % 5], 0, 6);
      g.restore();
    }
  }) }));
  cork.rotation.y = -Math.PI / 2; cork.position.set(RX1 - 0.12, 1.6, -5.4); root.add(cork);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.25), new THREE.MeshLambertMaterial({ map: textTex(['칼퇴', 'D-0', '🏓'], { w: 256, h: 356, bg: '#2b4f8a', color: '#ffd23d', font: 'bold 70px sans-serif' }) }));
  poster.rotation.y = -Math.PI / 2; poster.position.set(RX1 - 0.12, 1.65, 5.6); root.add(poster);
  const shelf = new THREE.Group(), shm = std(0x8a6a4c);
  addBox(shelf, 0.35, 1.9, 1.4, shm, 0, 0.95, 0);
  const bookCols = [0xe0333c, 0x2b6cd9, 0xf2a20c, 0x2c9b52, 0x6b4fd6, 0xe9e4da];
  for (let r = 0; r < 4; r++) {
    addBox(shelf, 0.36, 0.03, 1.36, std(0xa8845e), -0.01, 0.2 + r * 0.45, 0);
    for (let i = 0; i < 9; i++) { const h = 0.26 + ((i * 7 + r) % 4) * 0.03; addBox(shelf, 0.24, h, 0.1, std(bookCols[(i + r) % 6]), -0.05, 0.22 + r * 0.45 + h / 2, -0.58 + i * 0.13); }
  }
  shelf.position.set(RX1 - 0.3, 0, 0); root.add(shelf);

  // ---------- 반려동물 자리: 창가 카페 테이블(햄스터 찻잔) + 횃대(앵무새) ----------
  const cafe = new THREE.Group(), cm = std(0xf4f1ea, { roughness: 0.5 }), cl = std(0x2b2f3a, { metalness: 0.6, roughness: 0.4 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 28), cm); top.position.y = 0.72; top.castShadow = true; cafe.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10), cl); leg.position.y = 0.36; cafe.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 20), cl); foot.position.y = 0.015; cafe.add(foot);
  cafe.position.set(-2.55, 0, 0.55); root.add(cafe);
  const hamster = buildHamster(0xf2a65a);
  hamster.group.scale.setScalar(0.42); hamster.group.position.set(-2.55, 0.74, 0.55); hamster.group.rotation.y = Math.PI / 2;
  root.add(hamster.group);
  const perch = new THREE.Group(), wood = std(0x8a5a32, { roughness: 0.9 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.15, 10), wood); pole.position.y = 0.575; perch.add(pole);
  const barM = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10), wood); barM.rotation.x = Math.PI / 2; barM.position.y = 1.15; perch.add(barM);
  const pbase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 20), wood); pbase.position.y = 0.025; perch.add(pbase);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 14), std(0x6fb4e8)); dish.position.set(0, 0.85, 0.12); perch.add(dish);
  perch.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  perch.position.set(-2.45, 0, -0.75); root.add(perch);
  const parrot = buildParrot();
  parrot.group.scale.setScalar(0.38); parrot.group.position.set(-2.45, 1.16, -0.75); parrot.group.rotation.y = Math.PI / 2;
  root.add(parrot.group);
  const pets = [hamster, parrot];

  // 창밖에 흩날리는 은행잎 + 실내에 떠다니는 노을빛 먼지
  const leaves = makeDrift(rnd, 160, [RX0 - 20, RX0 - 0.6, 0, 9, -30, 30], { size: 0.32, opacity: 0.95, fall: 0.9, sway: 1.2, colors: ['#ffd23a', '#f2b21f', '#ffe066', '#e8961c'] });
  root.add(leaves.pts);
  const dust = makeDrift(rnd, 120, [RX0 + 0.3, 3, 0.2, 3.2, -RZ + 1, RZ - 1], { px: 2.5, opacity: 0.7, fall: 0.05, sway: 0.12, colors: ['#ffd08a'], additive: true });
  root.add(dust.pts);

  return {
    root,
    sky: '#f2a65a',
    fog: [40, 230],
    far: 320,
    light: { hemi: ['#fff0e2', '#a08466', 1.35], sun: ['#ffae5c', 2.1, [-12, 4.2, -3]], shadow: 9 },
    tick(t, dt, ball, bounce) {
      for (const c of cars) {
        c.mesh.position.z += c.dir * c.speed * dt;
        if (c.dir * c.mesh.position.z > 120) c.mesh.position.z = -c.dir * 120;
      }
      for (const m of rays) m.material.opacity = 0.09 + 0.05 * Math.sin(t * 0.5 + m.userData.phase);
      for (const m of shafts) m.material.opacity = 0.08 + 0.03 * Math.sin(t * 0.7 + m.userData.phase);
      leaves.tick(t, dt);
      dust.tick(t, dt);
      for (const pet of pets) pet.update(t, dt, petYaw(root, pet, ball), bounce);
    },
  };
}
