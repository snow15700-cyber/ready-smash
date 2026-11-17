// 소풍길: 강가 잔디밭 ('09시까지 출근하세요' 소풍길 코스와 같은 자연)
// 눈 덮인 뾰족 산, 파란 강, 침엽수·동글 나무, 색색 꽃, 머리 위 삼각 깃발 줄, 초록 '공항' 이정표,
// 돗자리·도시락, 가끔 하늘을 지나가는 비행기, 꽃잎·나비.
// 반려동물: 토끼(돗자리 위 폴짝) + 거북이(느긋하게 구경)
import * as THREE from 'three';
import { seeded, canvasTex, glowSprite, std, addBox, petYaw, skyDome, makeDrift } from './arena-kit.js';
import { buildRabbit, buildTurtle } from './arena-pets.js';
import { makeCar, CAR_TYPES } from './arena-cars.js';

const RIVER_X0 = -9, RIVER_X1 = -22;   // 강 (탁구대 왼쪽, A팀 기준)
const ROAD_X = 12;                      // 시골길 가운데 (탁구대 오른쪽)

// 09시 게임 소풍길의 나무 (침엽수 3단 원뿔 / 둥근 활엽수)
const trunkMat = std(0x8b5a2b);
const leafMats = [0x2f8f3a, 0x3fae4a, 0x58c45a].map((c) => std(c, { flatShading: true }));
function makeTree(rnd, s = 1) {
  const t = new THREE.Group();
  s *= 0.55 + rnd() * 0.45;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 3 * s, 6), trunkMat);
  trunk.position.y = 1.5 * s; t.add(trunk);
  const leaf = leafMats[Math.floor(rnd() * 3)];
  if (rnd() < 0.5) {
    [0, 1.6, 3.0].forEach((y, k) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry((2.6 - k * 0.6) * s, 3 * s, 7), leaf);
      c.position.y = (3.5 + y) * s; c.castShadow = true; t.add(c);
    });
  } else {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * s, 0), leaf);
    ball.position.y = 4.5 * s; ball.castShadow = true; t.add(ball);
  }
  return t;
}

// 여객기 (09시 게임 소풍길 도착지의 비행기를 하늘용으로 간단히). 앞 = +z
function buildPlane() {
  const plane = new THREE.Group();
  const white = std(0xf7f8fa, { metalness: 0.3, roughness: 0.35 });
  const grey = std(0xb8bec7, { metalness: 0.6, roughness: 0.3 });
  const navy = std(0x1e3a8a, { roughness: 0.4 });
  const accent = std(0xf59e0b, { roughness: 0.4 });
  const glassM = std(0x0f172a, { metalness: 0.8, roughness: 0.1 });
  const R = 3.2, L = 34;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24), white); body.rotation.x = Math.PI / 2; plane.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), white); nose.scale.set(1, 0.95, 1.7); nose.position.set(0, -0.1, L / 2); plane.add(nose);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(R, 0.6, 9, 24), white); tailCone.rotation.x = -Math.PI / 2; tailCone.position.set(0, 0.9, -L / 2 - 4.5); plane.add(tailCone);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, L, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7), navy);
  belly.rotation.x = Math.PI / 2; plane.add(belly);
  for (const sd of [-1, 1]) {
    addBox(plane, 0.08, 0.35, L, accent, sd * (R - 0.25), -0.9, 0);
    for (let z = L / 2 - 4; z > -L / 2 + 2; z -= 1.3) addBox(plane, 0.1, 0.55, 0.4, glassM, sd * (R - 0.05), 0.9, z);
  }
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(18, -9); wingShape.lineTo(18, -11.5); wingShape.lineTo(0, -8); wingShape.lineTo(0, 0);
  for (const sd of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, { depth: 0.5, bevelEnabled: false }), grey);
    wing.rotation.x = Math.PI / 2; wing.scale.x = sd; wing.position.set(sd * (R - 0.5), -1.2, 6); plane.add(wing);
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.25, 5.5, 18), grey); nac.rotation.x = Math.PI / 2; nac.position.set(sd * 8, -3.2, 5); plane.add(nac);
    const hs = addBox(plane, 8, 0.35, 3, grey, sd * 4.5, 1, -L / 2 - 4.5); hs.rotation.y = sd * 0.35;
    const logo = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), accent); logo.position.set(sd * 0.3, R + 4.8, -L / 2 - 4.5); logo.rotation.y = (sd * Math.PI) / 2; plane.add(logo);
  }
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(-7, 0); finShape.lineTo(-10, 9); finShape.lineTo(-6.5, 9); finShape.lineTo(0, 0);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.5, bevelEnabled: false }), navy);
  fin.rotation.y = -Math.PI / 2; fin.position.set(0.25, R - 0.6, -L / 2 + 2); plane.add(fin);
  return plane;
}

// 뭉게구름 (흰 공 몇 개)
function makeCloud(rnd) {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0xdfe9f5, emissiveIntensity: 0.35 });
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + rnd() * 4, 1), m);
    b.position.set((i - n / 2) * 6 + rnd() * 2, rnd() * 3, rnd() * 4);
    b.scale.y = 0.65; g.add(b);
  }
  return g;
}

export function buildPicnic() {
  const root = new THREE.Group();
  const rnd = seeded(27);

  root.add(skyDome([[0, '#e6f6ff'], [0.15, '#bfe6ff'], [0.5, '#8fcdfa'], [1, '#5aa8ec']], 330));
  const sunPos = new THREE.Vector3(-120, 170, -160);
  const sunGlow = glowSprite(0xfff4c8, 90, 0.9); sunGlow.material = sunGlow.material.clone(); sunGlow.material.fog = false; sunGlow.position.copy(sunPos); root.add(sunGlow);

  // ---------- 땅: 잔디 + 강 + 모래 강둑 + 시골길 ----------
  const grassTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#7ccf5a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(90,170,60,0.35)' : 'rgba(150,220,110,0.35)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 3, 6);
    }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(140, 140);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  const sandMat = std(0xe8d9a0);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_X0 - RIVER_X1 + 5, 700), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.set((RIVER_X0 + RIVER_X1) / 2, 0.01, 0); root.add(sand);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_X0 - RIVER_X1, 700), std(0x3fa9f5, { roughness: 0.1, metalness: 0.3 }));
  river.rotation.x = -Math.PI / 2; river.position.set((RIVER_X0 + RIVER_X1) / 2, 0.03, 0); river.receiveShadow = true; root.add(river);
  const rippleMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.85 });
  const ripples = [];
  for (let i = 0; i < 70; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.4 + rnd() * 1.0, 0.07), rippleMat);
    r.rotation.x = -Math.PI / 2; r.position.set(RIVER_X1 + 1 + rnd() * (RIVER_X0 - RIVER_X1 - 2), 0.05, -120 + rnd() * 240);
    r.userData.noFocus = true; root.add(r); ripples.push(r);
  }
  // 시골길 (2차선) + 가장자리 흰 선
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 700), std(0x4a4f5a, { roughness: 0.7 }));
  road.rotation.x = -Math.PI / 2; road.position.set(ROAD_X, 0.015, 0); road.receiveShadow = true; root.add(road);
  const lw = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), ly = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  for (const dx of [-3.05, 3.05]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 700), lw); m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X + dx, 0.02, 0); root.add(m); }
  for (let z = -300; z < 300; z += 8) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4), ly); m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X, 0.02, z); root.add(m); }

  // ---------- 산 (멀리 빙 둘러서, 높은 산엔 눈) ----------
  const mountainMats = [0x6aa46a, 0x7fb48a, 0x5d9470].map((c) => std(c, { flatShading: true }));
  const snowMat = std(0xffffff, { flatShading: true });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
    const d = 190 + rnd() * 70, h = 50 + rnd() * 75, r = 40 + rnd() * 40;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mountainMats[i % 3]);
    m.position.set(x, h / 2 - 2, z); m.rotation.y = rnd() * 3; root.add(m);
    if (h > 80) { const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, h * 0.28, 6), snowMat); cap.position.set(x, h - h * 0.14 - 1.7, z); cap.rotation.y = m.rotation.y; root.add(cap); }
  }

  // ---------- 나무 (강 건너 숲, 길 건너 숲, 잔디밭 가장자리) ----------
  const tree = (x, z, s) => { const t = makeTree(rnd, s); t.position.set(x, 0, z); root.add(t); };
  for (let z = -140; z < 140; z += 5) {
    tree(RIVER_X1 - 4 - rnd() * 30, z + rnd() * 4, 1);
    if (rnd() < 0.7) tree(RIVER_X1 - 20 - rnd() * 40, z + rnd() * 4, 1.2);
    tree(ROAD_X + 6 + rnd() * 30, z + rnd() * 4, 1);
    if (rnd() < 0.6) tree(ROAD_X + 25 + rnd() * 40, z + rnd() * 4, 1.2);
  }
  // 잔디밭 앞뒤 끝 (양 팀이 바라보는 쪽): 드문드문
  for (const sd of [-1, 1]) for (let i = 0; i < 16; i++) {
    const x = RIVER_X0 + 1 + rnd() * (ROAD_X - 4 - RIVER_X0), z = sd * (16 + rnd() * 60);
    tree(x, z, 0.9);
  }

  // ---------- 꽃 + 풀 (탁구대 주변은 비워 둠) ----------
  const flowerCols = [0xff5fa2, 0xffd84a, 0xffffff, 0xff7b54, 0xb388ff];
  const NF = 900;
  const petal = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), NF);
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0x3a8f2f }), NF);
  const M4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < NF; i++) {
    let x, z;
    do { x = RIVER_X0 + 0.5 + rnd() * (ROAD_X - 3.6 - RIVER_X0); z = (rnd() * 2 - 1) * 45; } while (Math.abs(x) < 3 && Math.abs(z) < 4.2);
    const s = 0.8 + rnd() * 0.6;
    M4.makeScale(s, s, s).setPosition(x, 0.24 * s, z); petal.setMatrixAt(i, M4);
    M4.makeScale(1, s, 1).setPosition(x, 0.11 * s, z); stem.setMatrixAt(i, M4);
    petal.setColorAt(i, col.set(flowerCols[i % 5]));
  }
  root.add(petal, stem);
  const NG = 1400;
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.22, 4), new THREE.MeshLambertMaterial({ color: 0x4fae3a, flatShading: true }), NG);
  for (let i = 0; i < NG; i++) {
    const x = RIVER_X0 + rnd() * (ROAD_X - 3.3 - RIVER_X0), z = (rnd() * 2 - 1) * 40;
    M4.makeRotationY(rnd() * 3).setPosition(x, 0.1, z); tuft.setMatrixAt(i, M4);
  }
  root.add(tuft);

  // ---------- 삼각 깃발 줄 (양 팀 앞쪽 머리 위에 하나씩) ----------
  const flagMats = [0xef4444, 0xf59e0b, 0x22c55e, 0x3b82f6, 0xec4899, 0xffffff].map((c) => std(c, { side: THREE.DoubleSide }));
  const ropeMat = std(0xf5f5f4), woodPole = std(0x8b5a2b, { roughness: 0.9 });
  const flagShape = new THREE.Shape(); flagShape.moveTo(-0.22, 0); flagShape.lineTo(0.22, 0); flagShape.lineTo(0, -0.5); flagShape.lineTo(-0.22, 0);
  const flagGeo = new THREE.ShapeGeometry(flagShape);
  const flags = [];
  const HALF = 5.5, TOPY = 3.6, SAG = 0.6;
  const ropeY = (x) => TOPY - SAG * (1 - (x / HALF) ** 2);
  for (const [zz, k] of [[-7, 0], [7, 3]]) {
    const g = new THREE.Group();
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, TOPY, 8), woodPole); p.position.set(sd * HALF, TOPY / 2, 0); p.castShadow = true; g.add(p); }
    for (let i = 0; i < 14; i++) {
      const x0 = -HALF + (i * 2 * HALF) / 14, x1 = x0 + (2 * HALF) / 14;
      const a = new THREE.Vector3(x0, ropeY(x0), 0), b = new THREE.Vector3(x1, ropeY(x1), 0);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, a.distanceTo(b), 4), ropeMat);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(seg);
    }
    for (let x = -HALF + 0.5, i = 0; x <= HALF - 0.4; x += 0.62, i++) {
      const f = new THREE.Mesh(flagGeo, flagMats[(i + k) % 6]);
      f.position.set(x, ropeY(x), 0); f.rotation.z = (x / HALF) * 0.12;
      f.userData.phase = i * 0.7; g.add(f); flags.push(f);
    }
    g.position.set(0.5, 0, zz); root.add(g);
  }

  // ---------- '공항' 이정표 (09시 게임 소풍길과 같은 초록 표지판) ----------
  const signTex = canvasTex(512, 256, (g) => {
    const W = 512, H = 256;
    g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(12, 12, W - 24, H - 24);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
    g.font = '900 64px sans-serif'; g.textAlign = 'left'; g.fillText('✈ 공항', 40, 86);
    g.font = '700 30px sans-serif'; g.fillStyle = '#d1fae5'; g.fillText('AIRPORT', 46, 150);
    g.fillStyle = '#ffffff'; g.font = '900 78px sans-serif'; g.textAlign = 'right'; g.fillText('4.8', W - 110, 128);
    g.font = '700 40px sans-serif'; g.fillText('km', W - 40, 142);
    g.beginPath(); g.moveTo(W / 2 - 22, 220); g.lineTo(W / 2 + 22, 220); g.lineTo(W / 2, 196); g.fill();
    g.fillRect(W / 2 - 7, 218, 14, 22);
  });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const postMat = std(0x9ca3af, { metalness: 0.5, roughness: 0.4 });
  for (const [zz, ry] of [[-16, 0], [16, Math.PI]]) {
    const sg = new THREE.Group();
    for (const x of [-1.1, 1.1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), postMat); p.position.set(x, 1.7, 0); sg.add(p); }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), signMat); board.position.set(0, 2.9, 0.07); sg.add(board);
    addBox(sg, 2.9, 1.5, 0.1, postMat, 0, 2.9, 0);
    sg.position.set(ROAD_X - 4.3, 0, zz); sg.rotation.y = ry + (ry ? 0.3 : -0.3); root.add(sg);
  }

  // ---------- 돗자리 + 도시락 + 반려동물 ----------
  const matTex = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#ffffff' : '#e8504f'; g.fillRect(x * 32, y * 32, 32, 32); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 256; i += 32) { g.fillRect(i + 14, 0, 4, 256); g.fillRect(0, i + 14, 256, 4); }
  });
  const picnicMat = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.3), new THREE.MeshLambertMaterial({ map: matTex }));
  picnicMat.rotation.x = -Math.PI / 2; picnicMat.position.set(-2.75, 0.012, 0.15); picnicMat.receiveShadow = true; root.add(picnicMat);
  // 바구니
  const basket = new THREE.Group(), wicker = std(0xc8924e, { roughness: 1 });
  addBox(basket, 0.5, 0.28, 0.34, wicker, 0, 0.14, 0);
  for (let i = 0; i < 4; i++) addBox(basket, 0.51, 0.025, 0.35, std(0xa87638), 0, 0.04 + i * 0.07, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 20, Math.PI), wicker); handle.position.y = 0.28; basket.add(handle);
  addBox(basket, 0.52, 0.03, 0.2, std(0xe8504f), 0, 0.29, 0.08);
  basket.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  basket.position.set(-3.3, 0.012, -0.6); basket.rotation.y = 0.3; root.add(basket);
  // 도시락 (김밥 + 달걀말이)
  const box = new THREE.Group();
  addBox(box, 0.42, 0.08, 0.3, std(0x3d6fb8), 0, 0.04, 0);
  addBox(box, 0.38, 0.02, 0.26, std(0xf4f1ea), 0, 0.075, 0);
  const kim = new THREE.CylinderGeometry(0.035, 0.035, 0.035, 14);
  const rice = std(0xfbfaf5), seaweed = std(0x1f2a22), filling = [0xf2a20c, 0x3f8f4a, 0xe0333c, 0xffd84a];
  for (let i = 0; i < 8; i++) {
    const k = new THREE.Mesh(kim, seaweed); k.position.set(-0.14 + (i % 4) * 0.075, 0.1, -0.06 + Math.floor(i / 4) * 0.08); box.add(k);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.037, 12), rice); r.position.copy(k.position); box.add(r);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.039, 6), std(filling[i % 4])); f.position.copy(k.position); box.add(f);
  }
  addBox(box, 0.12, 0.04, 0.06, std(0xffd84a), 0.13, 0.1, 0.07);
  box.position.set(-2.55, 0.012, 0.75); box.rotation.y = -0.2; root.add(box);
  // 보온병 + 사과
  const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 14), std(0x4fb3a9, { metalness: 0.4, roughness: 0.4 }));
  thermos.position.set(-3.25, 0.16, 0.85); thermos.castShadow = true; root.add(thermos);
  for (const [x, zz] of [[-3.0, 0.45], [-3.08, 0.55]]) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std(0xd8322f)); a.position.set(x, 0.06, zz); root.add(a); }

  const rabbit = buildRabbit();
  rabbit.group.scale.setScalar(0.42); rabbit.group.position.set(-2.45, 0.015, -0.25); rabbit.group.rotation.y = Math.PI / 2;
  root.add(rabbit.group);
  const turtle = buildTurtle();
  turtle.group.scale.setScalar(0.48); turtle.group.position.set(-2.05, 0, 0.75); turtle.group.rotation.y = Math.PI / 2 + 0.3;
  root.add(turtle.group);
  const pets = [rabbit, turtle];

  // ---------- 움직이는 것: 시골길 차, 비행기, 구름, 꽃잎, 나비 ----------
  const cars = [];
  for (let k = 0; k < 4; k++) {
    const lane = k % 2, dir = lane ? 1 : -1;
    const mesh = makeCar(CAR_TYPES[Math.floor(rnd() * 5)], Math.floor(rnd() * 0xffffff));
    mesh.scale.setScalar(0.78); mesh.rotation.y = dir > 0 ? Math.PI : 0;
    mesh.position.set(ROAD_X + (lane ? 1.6 : -1.6), 0, -150 + rnd() * 300);
    root.add(mesh); cars.push({ mesh, dir, speed: 9 + rnd() * 4 });
  }
  const plane = buildPlane();
  plane.scale.setScalar(0.9); root.add(plane);
  const trail = [];
  const trailMat = new THREE.SpriteMaterial({ map: glowSprite(0xffffff, 1).material.map, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(trailMat.clone()); s.visible = false; s.userData.noFocus = true; root.add(s); trail.push(s); }
  let trailNext = 0, trailI = 0;
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const c = makeCloud(rnd); const a = rnd() * Math.PI * 2, d = 90 + rnd() * 120;
    c.position.set(Math.cos(a) * d, 55 + rnd() * 35, Math.sin(a) * d); c.userData.speed = 1 + rnd() * 1.5;
    root.add(c); clouds.push(c);
  }
  const petals = makeDrift(rnd, 220, [-14, 10, 0, 9, -30, 30], { size: 0.12, opacity: 0.95, fall: 0.5, sway: 0.9, colors: ['#ffb8d2', '#ffe6ef', '#ff99bf'] });
  root.add(petals.pts);
  const flies = [];
  const wingCols = [0xffd84a, 0x7dd3fc, 0xf9a8d4, 0xffffff, 0xfb923c];
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: wingCols[i % 5], side: THREE.DoubleSide });
    const wg = new THREE.PlaneGeometry(0.09, 0.075);
    const ws = [-1, 1].map((sd) => { const pivot = new THREE.Group(); const w = new THREE.Mesh(wg, mat); w.position.x = sd * 0.045; w.rotation.x = -Math.PI / 2; pivot.add(w); b.add(pivot); return pivot; });
    let x, z;
    do { x = RIVER_X0 + 1 + rnd() * (ROAD_X - 5 - RIVER_X0); z = (rnd() * 2 - 1) * 12; } while (Math.abs(x) < 3 && Math.abs(z) < 4);
    b.userData = { ws, home: new THREE.Vector3(x, 0.6 + rnd() * 0.8, z), ph: rnd() * 6.28 };
    root.add(b); flies.push(b);
  }

  const PLANE_T = 26; // 비행기가 한 번 지나가는 주기(초)
  return {
    root,
    sky: '#a8dcff',
    fog: [70, 320],
    far: 360,
    light: { hemi: ['#ffffff', '#7ccf5a', 1.45], sun: ['#fff4d6', 2.0, [-4, 10, 5]] },
    tick(t, dt, ball, bounce) {
      for (const r of ripples) { r.position.z += dt * 1.6; if (r.position.z > 120) r.position.z -= 240; }
      for (const c of cars) { c.mesh.position.z += c.dir * c.speed * dt; if (c.dir * c.mesh.position.z > 160) c.mesh.position.z = -c.dir * 160; }
      for (const f of flags) f.rotation.x = Math.sin(t * 2.2 + f.userData.phase) * 0.25;
      // 비행기: 한 번은 A팀 앞쪽 하늘(-z), 다음엔 B팀 앞쪽 하늘(+z)로 가로질러 간다
      const k = Math.floor(t / PLANE_T), u = (t % PLANE_T) / 14; // 14초 동안 지나가고 나머지는 쉼
      const fly = u < 1;
      plane.visible = fly;
      if (fly) {
        const dir = k % 2 ? -1 : 1, zz = k % 2 ? 120 : -120;
        plane.position.set(dir * (-260 + u * 520), 75 + u * 18, zz);
        plane.rotation.set(-0.06, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        trailNext -= dt;
        if (trailNext <= 0) {
          trailNext = 0.12;
          const s = trail[trailI++ % trail.length];
          s.visible = true; s.position.copy(plane.position).add(new THREE.Vector3(-dir * 22, 2, 0)); s.userData.age = 0;
        }
      }
      for (const s of trail) {
        if (!s.visible) continue;
        s.userData.age += dt;
        const a = s.userData.age;
        s.scale.setScalar(4 + a * 3);
        s.material.opacity = Math.max(0, 0.55 - a * 0.12);
        if (a > 4.5) s.visible = false;
      }
      for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 230) c.position.x = -230; }
      petals.tick(t, dt);
      for (const b of flies) {
        const { ws, home, ph } = b.userData;
        b.position.set(home.x + Math.sin(t * 0.7 + ph) * 0.9, home.y + Math.sin(t * 2.1 + ph) * 0.18, home.z + Math.cos(t * 0.5 + ph) * 0.9);
        b.rotation.y = t * 0.7 + ph;
        const f = Math.sin(t * 16 + ph) * 0.9;
        ws[0].rotation.z = f; ws[1].rotation.z = -f;
      }
      for (const pet of pets) pet.update(t, dt, petYaw(root, pet, ball), bounce);
    },
  };
}
