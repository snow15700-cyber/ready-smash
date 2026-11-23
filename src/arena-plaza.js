// 광장 로비 배경 (docs/dev/plaza.md 1장): 배경 아이템과 상관없이 늘 같은 '광장' 하나.
// 북쪽(-z)에 가게 건물 3개(상점·꾸미기·랭킹)가 나란히, 가운데는 넓은 돌바닥(② 탁구대 자리), 둘레에 나무·가로등·벤치.
// 움직이지 않는 것은 bakeArena로 합쳐서 가볍게 (scene.js의 setPlaza가 합친다).
import * as THREE from 'three';
import { addBox, canvasTex, seeded, skyDome, std, textTex } from './arena-kit.js';

// 걸을 수 있는 곳 (m). 가게 건물 앞면까지
export const PLAZA = {
  minX: -13, maxX: 13, minZ: -10, maxZ: 12,
  spawn: [0, 2.5], // 처음 서는 곳 (북쪽 가게를 바라봄). 가게 문까지 약 7~10m = 걸어서 2~3초
  // 가게: 가운데 x, 앞면 z(front), 너비 w, 깊이 d, 높이 h. 문 앞 door = 도착하면 화면이 열리는 곳
  shops: [
    { id: 'shop', name: '🛒 상점', sub: '뽑기', x: -5.6, color: '#d7262e', awning: ['#ffffff', '#d7262e'] },
    { id: 'closet', name: '👕 꾸미기', sub: '옷장·칭호', x: 0, color: '#2a5db0', awning: ['#ffffff', '#2a5db0'] },
    { id: 'rank', name: '🏆 랭킹', sub: '누가 1등?', x: 5.6, color: '#d79a12', awning: ['#fff6d6', '#e0a419'] },
  ].map((s) => ({ ...s, front: -6.5, w: 4.5, d: 3.4, h: 3.6, door: [s.x, -5.4] })),
};

function shopBuilding(s) {
  const g = new THREE.Group();
  const { w, d, h } = s;
  const cz = s.front - d / 2; // 건물 가운데 z
  g.position.set(s.x, 0, cz);
  const wall = std(0xf6efe2), trim = std(s.color), dark = std(0x3a3f4a);
  // 몸통 + 지붕
  addBox(g, w, h, d, wall, 0, h / 2, 0).castShadow = true;
  addBox(g, w + 0.3, 0.25, d + 0.3, trim, 0, h + 0.12, 0).castShadow = true;
  addBox(g, w + 0.32, 0.3, 0.12, trim, 0, h - 0.4, d / 2 + 0.06);
  // 아래 돌 띠
  addBox(g, w + 0.06, 0.4, d + 0.06, std(0xb9ad99), 0, 0.2, 0);
  // 문 (가운데) + 문틀
  addBox(g, 1.3, 2.25, 0.08, std(0x6b4a2e), 0, 1.12, d / 2 + 0.03);
  addBox(g, 1.5, 0.12, 0.12, trim, 0, 2.3, d / 2 + 0.05);
  addBox(g, 0.1, 0.1, 0.1, std(0xf2c14e, { metalness: 0.6, roughness: 0.3 }), 0.45, 1.1, d / 2 + 0.1);
  // 진열창 (양옆, 안에서 빛나는 느낌)
  const glass = new THREE.MeshLambertMaterial({ color: 0xdff3ff, emissive: 0xfff1cc, emissiveIntensity: 0.35 });
  for (const sx of [-1, 1]) {
    addBox(g, 1.05, 1.3, 0.06, glass, sx * 1.42, 1.35, d / 2 + 0.03);
    addBox(g, 1.2, 0.1, 0.14, dark, sx * 1.42, 0.66, d / 2 + 0.06);
  }
  // 줄무늬 차양 (앞으로 기울어진 판)
  const stripe = canvasTex(256, 64, (c) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = s.awning[i % 2]; c.fillRect(i * 32, 0, 32, 64); }
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 54, 256, 10);
  });
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 1.0), new THREE.MeshLambertMaterial({ map: stripe, side: THREE.DoubleSide }));
  aw.position.set(0, h - 1.05, d / 2 + 0.45);
  aw.rotation.x = -1.05;
  g.add(aw);
  // 간판 (차양 위, 건물 앞면)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, 0.95), new THREE.MeshBasicMaterial({
    map: textTex([s.name], { w: 640, h: 152, bg: '#fffaf0', color: '#2b2a33', font: 'bold 92px Jua, sans-serif', border: s.color }),
  }));
  sign.position.set(0, h + 0.75, d / 2 - 0.25);
  g.add(sign);
  addBox(g, w - 0.4, 1.1, 0.12, trim, 0, h + 0.75, d / 2 - 0.33);
  // 진열창 안 소개 글씨
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.32), new THREE.MeshBasicMaterial({
    map: textTex([s.sub], { w: 320, h: 100, bg: s.color, color: '#ffffff', font: 'bold 52px Jua, sans-serif' }),
  }));
  sub.position.set(-1.42, 1.75, d / 2 + 0.07);
  g.add(sub);
  // 가게마다 지붕 위 큰 표시
  if (s.id === 'shop') {
    // 뽑기 캡슐 (반은 빨강 반은 흰색)
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(s.color));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff));
    for (const m of [top, bot]) { m.position.set(0, h + 1.85, -0.4); m.castShadow = true; g.add(m); }
  } else if (s.id === 'closet') {
    // 옷걸이에 걸린 티셔츠
    const shirt = std(0xffd23f);
    addBox(g, 0.7, 0.8, 0.12, shirt, 0, h + 1.75, -0.4).castShadow = true;
    for (const sx of [-1, 1]) { const sl = addBox(g, 0.42, 0.26, 0.12, shirt, sx * 0.47, h + 2.0, -0.4); sl.rotation.z = sx * -0.5; }
    addBox(g, 0.9, 0.05, 0.05, dark, 0, h + 2.22, -0.4);
  } else {
    // 금 트로피
    const gold = std(0xf2c14e, { metalness: 0.7, roughness: 0.3 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 0.7, 20), gold);
    cup.position.set(0, h + 2.15, -0.4); cup.castShadow = true; g.add(cup);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 10), gold); stem.position.set(0, h + 1.65, -0.4); g.add(stem);
    addBox(g, 0.6, 0.2, 0.4, std(0x6b4a2e), 0, h + 1.42, -0.4);
    for (const sx of [-1, 1]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 14), gold); hd.position.set(sx * 0.52, h + 2.2, -0.4); g.add(hd); }
  }
  // 문 앞 깔개
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshLambertMaterial({ color: s.color }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.012, d / 2 + 0.6); g.add(mat);
  return g;
}

function tree(rnd) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), std(0x7a5233));
  trunk.position.y = 0.6; trunk.castShadow = true; g.add(trunk);
  const leaf = new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? 0x4f9a4a : 0x5fae55, flatShading: true });
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 - k * 0.18, 0), leaf);
    b.position.set((rnd() - 0.5) * 0.3, 1.5 + k * 0.55, (rnd() - 0.5) * 0.3); b.castShadow = true; g.add(b);
  }
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const k = std(0x2f3540, { metalness: 0.4, roughness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), k); pole.position.y = 1.5; g.add(pole);
  addBox(g, 0.3, 0.32, 0.3, new THREE.MeshLambertMaterial({ color: 0xfff4d2, emissive: 0xffe6a0, emissiveIntensity: 0.6 }), 0, 3.1, 0);
  addBox(g, 0.4, 0.06, 0.4, k, 0, 3.29, 0);
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = std(0xb07a45), k = std(0x3a3f4a);
  for (let i = 0; i < 3; i++) addBox(g, 1.6, 0.05, 0.12, wood, 0, 0.45, -0.15 + i * 0.15);
  for (let i = 0; i < 2; i++) addBox(g, 1.6, 0.12, 0.04, wood, 0, 0.65 + i * 0.16, -0.26);
  for (const sx of [-0.7, 0.7]) addBox(g, 0.06, 0.45, 0.4, k, sx, 0.22, -0.05);
  return g;
}

export function buildPlaza() {
  const root = new THREE.Group();
  const rnd = seeded(2311);
  root.add(skyDome([[0, '#fff4df'], [0.1, '#dff1ff'], [0.45, '#9fd3f5'], [1, '#5aa6e6']], 90));

  // 바닥: 바깥 잔디 + 가운데 돌바닥(바둑판 무늬) + 가운데 원 무늬
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: 0x8cc56a }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; root.add(grass);
  const stone = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#e9dcc4' : '#efe4cf'; g.fillRect(x * 64, y * 64, 64, 64);
      g.strokeStyle = 'rgba(150,125,90,.35)'; g.lineWidth = 2; g.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62);
    }
  });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  const W = PLAZA.maxX - PLAZA.minX + 3, D = PLAZA.maxZ - PLAZA.minZ + 5;
  stone.repeat.set(W / 2.4, D / 2.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: stone }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (PLAZA.minZ + PLAZA.maxZ) / 2 - 1.5); floor.receiveShadow = true; root.add(floor);
  // 바닥 가장자리 돌 띠
  const edge = std(0xb9ad99);
  const fz = floor.position.z;
  addBox(root, W + 0.4, 0.08, 0.4, edge, 0, 0.04, fz + D / 2);
  for (const sx of [-1, 1]) addBox(root, 0.4, 0.08, D, edge, sx * (W / 2 + 0.2), 0.04, fz);
  // 가운데 원 (② 탁구대가 놓일 넓은 마당)
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), new THREE.MeshLambertMaterial({ color: 0xd2b98f }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.008, 6); root.add(ring);
  // 바닥 글씨 (② 탁구대가 놓일 자리): 세워 두면 카메라 앞을 가려서 바닥에 눕혀 둔다
  const floorText = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.83), new THREE.MeshBasicMaterial({
    map: textTex(['🏓 탁구대 자리 · 곧 생겨요!'], { w: 1024, h: 224, bg: null, color: '#a0794a', font: 'bold 120px Jua, sans-serif' }), transparent: true, depthWrite: false,
  }));
  floorText.rotation.x = -Math.PI / 2; floorText.position.set(0, 0.012, 6); root.add(floorText);

  // 가게 3개 + 뒤쪽 담장
  for (const s of PLAZA.shops) root.add(shopBuilding(s));
  const wallM = std(0xe7d8bd);
  addBox(root, 32, 2.2, 0.4, wallM, 0, 1.1, -10.6);
  for (const sx of [-1, 1]) addBox(root, 0.4, 2.2, 5, wallM, sx * 15.8, 1.1, -8.2);
  // 가게 사이 화단
  for (const x of [-2.8, 2.8]) {
    addBox(root, 1.0, 0.4, 1.2, std(0xb9ad99), x, 0.2, -7.4);
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshLambertMaterial({ color: [0xff6b6b, 0xffd23f, 0xff9ed2][k % 3], flatShading: true }));
      f.position.set(x - 0.36 + k * 0.18, 0.5, -7.4 + (rnd() - 0.5) * 0.6); root.add(f);
    }
  }

  // 둘레: 나무·가로등·벤치 (걷는 곳 바깥)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) { const t = tree(rnd); t.position.set(sx * (15 + rnd() * 1.5), 0, -6 + i * 4.4 + rnd()); t.scale.setScalar(0.9 + rnd() * 0.4); root.add(t); }
    for (const z of [-4, 4, 11]) { const l = lamp(); l.position.set(sx * 14, 0, z); root.add(l); }
    for (const z of [0, 8]) { const b = bench(); b.position.set(sx * 14.2, 0, z); b.rotation.y = -sx * Math.PI / 2; root.add(b); }
  }
  for (let i = 0; i < 7; i++) { const t = tree(rnd); t.position.set(-12 + i * 4 + rnd(), 0, 15 + rnd() * 1.5); t.scale.setScalar(0.9 + rnd() * 0.4); root.add(t); }
  // 멀리 언덕
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 55 + rnd() * 10;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(14 + rnd() * 8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x79b35c, flatShading: true }));
    hill.position.set(Math.cos(a) * r, -2, Math.sin(a) * r); hill.scale.y = 0.5; root.add(hill);
  }

  return {
    root,
    sky: '#cfe8fb',
    fog: [35, 85],
    far: 140,
    light: { hemi: ['#fffaf0', '#9fb08a', 1.55], sun: ['#fff1dc', 1.7, [-7, 14, 9]], shadow: 17 },
  };
}
