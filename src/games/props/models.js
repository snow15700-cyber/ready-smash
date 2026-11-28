// 광장 물건 상호작용 (plaza.md 10장) — 손에 드는 음식 모형 · 메뉴 그림 · 들고 먹는 동작 · 앉는 자세
// ① 시안(props.html)에서 모양을 고르고, ② 실제 광장에서 그대로 씀. 모두 '보기만'(판정·네트워크와 상관없음).
// 음식 모형: 원점 = 손에 쥐는 곳, +y 위, 크기는 실제 크기(m) — 캐릭터 머리 반지름 0.16, 탁구채 판 반지름 0.078
import * as THREE from 'three';
import { canvasTex } from '../../util.js';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const add = (p, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// 울퉁불퉁 (튀김옷·소보로): 꼭짓점을 바깥쪽으로 조금씩 흔듦 — 같은 모양이 늘 같게(씨앗 고정)
function bumpy(geo, amt, seed = 1) {
  const p = geo.attributes.position, v = new THREE.Vector3(), seen = new Map();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`; // 이음매가 안 벌어지게 같은 자리는 같은 값
    if (!seen.has(key)) seen.set(key, 1 + (rnd() - 0.5) * amt);
    const k = seen.get(key);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// 음식 6가지 (🚚 4 · 🥤 캔 · 🥖 김제빵 빵). col = 그림·테두리 색
export const FOODS = [
  { id: 'coffee', name: '커피', emo: '☕', col: '#8a5a33', from: '🚚 푸드트럭', price: 10, fx: '10분 · 1대1·2대2 코인 +30%' },
  { id: 'ade', name: '에이드', emo: '🥤', col: '#ff8a3d', from: '🚚 푸드트럭', price: 10, fx: '10분 · 혼자 하기 코인 +30%' },
  { id: 'bungeo', name: '붕어빵', emo: '🐟', col: '#d99a3c', from: '🚚 푸드트럭', price: 10, fx: '10분 · 낚시 판매 코인 +30%' },
  { id: 'hotdog', name: '핫도그', emo: '🌭', col: '#e0333c', from: '🚚 푸드트럭', price: 10, fx: '10분 · 이긴 판만 코인 +60%' },
  { id: 'can', name: '캔 음료', emo: '🥫', col: '#2a8f5b', from: '🥤 자판기', price: 3, fx: '5분 · 셋 모두 +15%' },
  { id: 'bread', name: '김제빵 빵', emo: '🥖', col: '#b9783a', from: '🥖 빵집', price: 0, fx: '무료 · 효과 없음' },
];
export const FOOD = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export const TRUCK_MENU = ['coffee', 'ade', 'bungeo', 'hotdog'];

const BUILD = {
  // ☕ 종이컵 + 갈색 홀더 + 흰 뚜껑 + 김 3줄기
  coffee(g, a) {
    const cup = lam(0xfaf7f0), kraft = lam(0xb07a45), lid = lam(0xf2efe8);
    add(g, lathe([[0.001, 0], [0.04, 0], [0.054, 0.135], [0.001, 0.135]]), cup);
    add(g, new THREE.CylinderGeometry(0.0525, 0.0455, 0.062, 24, 1, true), kraft, 0, 0.068, 0);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), lid, 0, 0.14, 0);
    add(g, lathe([[0.056, 0], [0.05, 0.016], [0.02, 0.022], [0.001, 0.022]]), lid, 0, 0.145, 0);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), lam(0x3a2a22), 0.03, 0.163, 0);
    // 가운데 하트 도장
    const heart = add(g, new THREE.CircleGeometry(0.014, 16), lam(0xfaf7f0), 0, 0.068, 0.0495);
    heart.rotation.x = -0.12;
    const steamM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
    const puffs = [0, 1, 2].map((i) => add(g, new THREE.SphereGeometry(0.014, 10, 8), steamM.clone(), 0, 0.18, 0));
    a.push((t) => puffs.forEach((p, i) => {
      const k = (t * 0.6 + i / 3) % 1;
      p.position.set(Math.sin(k * 6 + i) * 0.012 - 0.01 + i * 0.01, 0.17 + k * 0.11, 0);
      p.scale.setScalar(0.6 + k * 1.2);
      p.material.opacity = 0.55 * Math.sin(k * Math.PI);
    }));
    g.userData.top = 0.17;
  },
  // 🥤 투명 컵 + 주황 자몽 에이드 + 얼음 + 레몬 조각 + 빨간 빨대
  ade(g) {
    const clear = new THREE.MeshLambertMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.32, depthWrite: false });
    const juice = new THREE.MeshLambertMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.88 });
    add(g, lathe([[0.001, 0.004], [0.036, 0.004], [0.046, 0.11], [0.001, 0.11]]), juice);
    add(g, new THREE.CylinderGeometry(0.052, 0.04, 0.15, 24, 1, true), clear, 0, 0.075, 0);
    add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.004, 24), clear, 0, 0.002, 0);
    add(g, lathe([[0.054, 0], [0.04, 0.03], [0.001, 0.038]]), clear, 0, 0.15, 0);
    const ice = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    [[-0.015, 0.1, 0.01, 0.3], [0.016, 0.097, -0.008, 1.1], [0.002, 0.104, -0.02, 0.7]].forEach(([x, y, z, r]) => { const c = add(g, new THREE.BoxGeometry(0.022, 0.02, 0.022), ice, x, y, z); c.rotation.set(r, r * 1.3, 0.2); });
    const lemon = add(g, new THREE.CylinderGeometry(0.028, 0.028, 0.007, 20), lam(0xffe24a), 0.04, 0.13, 0.022);
    lemon.rotation.set(Math.PI / 2, 0, 0.5);
    add(g, new THREE.TorusGeometry(0.028, 0.003, 6, 20), lam(0xfff6b0), 0.04, 0.13, 0.026).rotation.z = 0.5;
    const straw = add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.2, 10), lam(0xe0333c), -0.012, 0.17, 0);
    straw.rotation.z = 0.22;
    g.userData.top = 0.24;
  },
  // 🐟 붕어빵: 물고기 모양을 두툼하게 뽑음 + 눈 + 아가미·비늘 줄 + 아래쪽 종이 봉투 (머리가 위)
  bungeo(g) {
    const s = new THREE.Shape();
    s.moveTo(0.088, 0);
    s.quadraticCurveTo(0.082, 0.046, 0.02, 0.05);
    s.quadraticCurveTo(-0.04, 0.046, -0.066, 0.013);
    s.lineTo(-0.104, 0.042);
    s.quadraticCurveTo(-0.096, 0, -0.104, -0.042);
    s.lineTo(-0.066, -0.013);
    s.quadraticCurveTo(-0.04, -0.046, 0.02, -0.05);
    s.quadraticCurveTo(0.082, -0.046, 0.088, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 16 });
    geo.translate(0, 0, -0.009);
    const fish = new THREE.Group(); g.add(fish);
    const crust = lam(0xd99a3c), dark = lam(0xa8692a);
    add(fish, geo, crust);
    for (const sz of [-1, 1]) {
      add(fish, new THREE.SphereGeometry(0.0075, 10, 8), lam(0x5a3416), 0.058, 0.016, sz * 0.022);
      const gill = add(fish, new THREE.TorusGeometry(0.03, 0.0028, 5, 16, 1.7), dark, 0.05, 0, sz * 0.02);
      gill.rotation.z = Math.PI - 0.85;
      for (let i = 0; i < 3; i++) for (const yy of [-1, 1]) {
        const sc = add(fish, new THREE.TorusGeometry(0.011, 0.0022, 4, 10, 2.2), dark, 0.012 - i * 0.022, yy * 0.014, sz * 0.021);
        sc.rotation.z = Math.PI - 1.1;
      }
    }
    fish.rotation.z = Math.PI / 2; // 머리가 위
    fish.position.y = 0.075;
    // 종이 봉투 (꼬리 쪽)
    const bag = add(g, new THREE.CylinderGeometry(0.058, 0.05, 0.07, 4, 1, true), lam(0xf4ecd8, { side: THREE.DoubleSide }), 0, 0.02, 0);
    bag.rotation.y = Math.PI / 4; bag.scale.set(1, 1, 0.55);
    g.userData.top = 0.17;
  },
  // 🌭 핫도그(막대 + 울퉁불퉁 튀김옷 + 케첩·머스터드 나선)
  hotdog(g) {
    add(g, new THREE.CylinderGeometry(0.0055, 0.0055, 0.12, 8), lam(0xe8cf9a), 0, -0.01, 0);
    const batter = add(g, bumpy(new THREE.CapsuleGeometry(0.031, 0.12, 6, 16), 0.16, 7), lam(0xd9913a, { flatShading: true }), 0, 0.13, 0);
    batter.userData.batter = true;
    const spiral = (off, col) => {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const k = i / 60, an = off + k * Math.PI * 6; pts.push(new THREE.Vector3(Math.cos(an) * 0.034, 0.07 + k * 0.12, Math.sin(an) * 0.034)); }
      add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.0045, 6), lam(col));
    };
    spiral(0, 0xd7262e); spiral(Math.PI, 0xffc21a);
    g.userData.top = 0.23;
  },
  // 🥫 캔: 색 띠 그림 + 알루미늄 뚜껑 + 따개 (seed로 색 3가지)
  can(g, a, seed = 0) {
    const [c1, c2, label] = [['#2a8f5b', '#bff0c8', '사이다'], ['#d7262e', '#ffe0e3', '콜라'], ['#ff8a3d', '#fff0c8', '오렌지']][seed % 3];
    const tex = canvasTex(256, 128, (x) => {
      x.fillStyle = c1; x.fillRect(0, 0, 256, 128);
      x.fillStyle = c2; x.beginPath(); x.moveTo(0, 80);
      for (let i = 0; i <= 256; i += 8) x.lineTo(i, 76 + Math.sin(i / 20) * 9);
      x.lineTo(256, 104); x.lineTo(0, 104); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 34px Jua, sans-serif'; x.textAlign = 'center'; x.fillText(label, 64, 54); x.fillText(label, 192, 54);
    });
    const alu = new THREE.MeshStandardMaterial({ color: 0xd3d8db, metalness: 0.6, roughness: 0.35 });
    add(g, new THREE.CylinderGeometry(0.033, 0.033, 0.11, 24, 1, true), lam(0xffffff, { map: tex }), 0, 0.06, 0);
    add(g, lathe([[0.001, 0], [0.028, 0], [0.033, 0.006]]), alu, 0, 0, 0);
    add(g, lathe([[0.033, 0], [0.028, 0.008], [0.001, 0.008]]), alu, 0, 0.115, 0);
    const tab = add(g, new THREE.TorusGeometry(0.008, 0.002, 4, 12), alu, 0.006, 0.124, 0); tab.rotation.x = Math.PI / 2; tab.scale.set(1.4, 1, 1);
    g.userData.top = 0.13;
  },
  // 🥖 김제빵 빵: 소보로빵 (봉긋한 빵 + 위쪽 소보로 알갱이)
  bread(g) {
    const bun = add(g, lathe([[0.001, 0], [0.066, 0], [0.072, 0.018], [0.06, 0.045], [0.034, 0.062], [0.001, 0.066]], 28), lam(0xd9a05a), 0, 0.02, 0);
    bun.rotation.x = 0.1;
    const crumbM = lam(0xb9783a, { flatShading: true });
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const an = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.055, h = 0.066 - (r / 0.066) ** 2 * 0.045;
      add(g, new THREE.IcosahedronGeometry(0.009 + rnd() * 0.006, 0), crumbM, Math.cos(an) * r, 0.02 + h + 0.002, Math.sin(an) * r);
    }
    g.userData.top = 0.1;
  },
};

// 음식 모형 하나. 돌려줌: Group (userData.tick(t)로 김 같은 움직임)
export function makeFood(id, seed = 0) {
  const g = new THREE.Group(), anim = [];
  BUILD[id](g, anim, seed);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.tick = (t) => { for (const f of anim) f(t); };
  return g;
}

// ── 2D 그림 (메뉴판·창 그림). cx, cy = 가운데, s = 칸 크기(px)
export function drawFood(x, id, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s / 100, s / 100); x.lineJoin = x.lineCap = 'round';
  const line = (w = 4) => { x.strokeStyle = '#3a2a22'; x.lineWidth = w; };
  if (id === 'coffee') {
    x.fillStyle = '#faf7f0'; x.beginPath(); x.moveTo(-26, -24); x.lineTo(26, -24); x.lineTo(19, 40); x.lineTo(-19, 40); x.closePath(); x.fill(); line(); x.stroke();
    x.fillStyle = '#b07a45'; x.beginPath(); x.moveTo(-24, -4); x.lineTo(24, -4); x.lineTo(21, 24); x.lineTo(-21, 24); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 15); x.bezierCurveTo(-12, 6, -6, -2, 0, 4); x.bezierCurveTo(6, -2, 12, 6, 0, 15); x.fill();
    x.fillStyle = '#f2efe8'; x.beginPath(); x.roundRect(-31, -34, 62, 11, 5); x.fill(); x.stroke();
    x.strokeStyle = 'rgba(180,180,190,.9)'; x.lineWidth = 4;
    for (const dx of [-10, 4]) { x.beginPath(); x.moveTo(dx, -40); x.bezierCurveTo(dx - 8, -48, dx + 8, -52, dx, -62); x.stroke(); }
  } else if (id === 'ade') {
    x.fillStyle = '#ff9a4d'; x.beginPath(); x.moveTo(-24, -6); x.lineTo(24, -6); x.lineTo(19, 40); x.lineTo(-19, 40); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,.75)'; for (const [a, b] of [[-12, 0], [6, 4], [-2, -4]]) { x.beginPath(); x.roundRect(a, b, 12, 12, 3); x.fill(); }
    line(); x.beginPath(); x.moveTo(-28, -26); x.lineTo(28, -26); x.lineTo(19, 40); x.lineTo(-19, 40); x.closePath(); x.stroke();
    x.strokeStyle = '#e0333c'; x.lineWidth = 7; x.beginPath(); x.moveTo(-4, 10); x.lineTo(8, -58); x.lineTo(20, -62); x.stroke();
    x.fillStyle = '#ffe24a'; x.beginPath(); x.arc(26, -24, 13, 0, Math.PI * 2); x.fill(); line(3); x.stroke();
    x.beginPath(); x.moveTo(26, -24); x.lineTo(26, -35); x.moveTo(26, -24); x.lineTo(36, -18); x.moveTo(26, -24); x.lineTo(16, -18); x.stroke();
  } else if (id === 'bungeo') {
    x.rotate(-0.5);
    x.fillStyle = '#e0a446'; x.beginPath(); x.moveTo(44, 0); x.quadraticCurveTo(42, -26, 8, -27); x.quadraticCurveTo(-22, -25, -32, -7); x.lineTo(-50, -22); x.quadraticCurveTo(-45, 0, -50, 22); x.lineTo(-32, 7); x.quadraticCurveTo(-22, 25, 8, 27); x.quadraticCurveTo(42, 26, 44, 0); x.closePath(); x.fill(); line(); x.stroke();
    x.fillStyle = '#3a2a22'; x.beginPath(); x.arc(28, -8, 4.5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#a8692a'; x.lineWidth = 3.5; x.beginPath(); x.arc(36, 2, 20, Math.PI * 0.75, Math.PI * 1.2); x.stroke();
    for (let i = 0; i < 3; i++) for (const yy of [-8, 8]) { x.beginPath(); x.arc(4 - i * 11, yy, 6, Math.PI * 0.6, Math.PI * 1.4); x.stroke(); }
  } else if (id === 'hotdog') {
    x.rotate(0.35);
    x.fillStyle = '#e8cf9a'; x.fillRect(-3.5, 18, 7, 34); line(3); x.strokeRect(-3.5, 18, 7, 34);
    x.fillStyle = '#d9913a'; x.beginPath(); x.roundRect(-17, -54, 34, 78, 17); x.fill(); line(); x.stroke();
    x.lineWidth = 5;
    for (const [c, o] of [['#d7262e', 0], ['#ffc21a', 8]]) { x.strokeStyle = c; x.beginPath(); for (let i = 0; i <= 6; i++) x.lineTo(i % 2 ? 11 : -11, -44 + i * 11 + o); x.stroke(); }
  } else if (id === 'can') {
    x.fillStyle = '#2a8f5b'; x.beginPath(); x.roundRect(-22, -38, 44, 78, 9); x.fill();
    x.fillStyle = '#bff0c8'; x.beginPath(); x.moveTo(-22, 14); x.bezierCurveTo(-8, 4, 8, 22, 22, 10); x.lineTo(22, 26); x.lineTo(-22, 26); x.fill();
    x.fillStyle = '#d3d8db'; x.fillRect(-20, -42, 40, 8);
    line(); x.beginPath(); x.roundRect(-22, -42, 44, 82, 9); x.stroke();
  } else if (id === 'bread') {
    x.fillStyle = '#d9a05a'; x.beginPath(); x.ellipse(0, 6, 44, 28, 0, Math.PI, 0); x.lineTo(44, 14); x.quadraticCurveTo(0, 24, -44, 14); x.closePath(); x.fill(); line(); x.stroke();
    x.fillStyle = '#b9783a'; for (const [a, b, r] of [[-22, -6, 6], [-6, -16, 7], [12, -12, 6], [26, -2, 5], [2, -2, 6], [-14, 6, 5], [18, 4, 5]]) { x.beginPath(); x.arc(a, b, r, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
}
export function foodIconURL(id, px = 160) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  drawFood(c.getContext('2d'), id, px / 2, px / 2 + px * 0.04, px * 0.85);
  return c.toDataURL();
}

// ── 손에 들기: 탁구채 반대 손(왼쪽, -x)에. 30초 동안 5초마다 한 입 (준비 → 입 앞에서 잠깐 멈춤 → 돌아오기), 한 입마다 조금씩 작아지고 끝나면 '뿅'
export const HOLD = {
  A: { name: '옆에 둥둥 (탁구채와 같은 크기)', k: 1.0, x: -0.27, y: 0.8, z: -0.04 },
  B: { name: '크게 (멀리서도 보이게 1.7배)', k: 1.7, x: -0.33, y: 0.82, z: -0.03 },
  C: { name: '둥둥 + 머리 위 작은 그림', k: 1.15, x: -0.28, y: 0.8, z: -0.04, icon: true },
};
export const EAT = { life: 30, every: 5, bite: 1.2 }; // 초
const MOUTH = new THREE.Vector3(-0.05, 1.07, -0.17);
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
// 머리 위 그림 (C안): 동그란 판 + 음식 그림 + 남은 시간 고리
function iconSprite(id) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.3, 0.3, 1);
  let last = -1;
  sp.userData.draw = (left) => {
    const q = Math.round(left * 40);
    if (q === last) return; last = q;
    const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(43,42,51,.15)'; x.lineWidth = 9; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = FOOD[id].col; x.beginPath(); x.arc(64, 64, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); x.stroke();
    drawFood(x, id, 64, 68, 74);
    tex.needsUpdate = true;
  };
  return sp;
}
// char = makeCharacter(...) 결과. 돌려줌: { tick(t), drop(), nod } — nod = 이번 프레임 고개 까딱(몸 rotation.x에 더해 쓰기). t0 = 받은 시각(초)
export function holdFood(char, id, style = 'A', t0 = 0, seed = 0) {
  const st = HOLD[style];
  const root = new THREE.Group(), food = makeFood(id, seed);
  root.add(food); char.body.add(root);
  const icon = st.icon ? iconSprite(id) : null;
  if (icon) { icon.position.set(0, 1.62, 0); char.body.add(icon); }
  const rest = new THREE.Vector3(st.x, st.y, st.z), p = new THREE.Vector3();
  const crumbs = [0, 1, 2, 3].map(() => add(char.body, new THREE.IcosahedronGeometry(0.008, 0), lam(FOOD[id].col)));
  crumbs.forEach((c) => (c.visible = false));
  const tick = (t) => {
    const age = t - t0, life = EAT.life;
    food.userData.tick(t);
    api.nod = 0;
    if (age > life + 1.6) { root.visible = false; if (icon) icon.visible = false; return; }
    if (age > life) { // 다 먹음: 살짝 커졌다가 뿅
      const k = (age - life) / 0.35;
      root.visible = k < 1; food.scale.setScalar(st.k * 0.6 * (k < 0.4 ? 1 + k : Math.max(0, 1.4 - (k - 0.4) * 2.3)));
      if (icon) icon.visible = k < 1;
      return;
    }
    root.visible = true;
    const bites = Math.floor(age / EAT.every), ph = age - bites * EAT.every; // 이번 한 입 진행(초)
    const size = 1 - 0.07 * Math.min(bites, 5) - (ph > 0.55 && ph < EAT.bite ? 0.07 : 0) * (bites < 6 ? 1 : 0);
    let m = 0, dip = 0, chew = 0;
    if (age >= 1 && ph < EAT.bite) { // 첫 1초는 받는 중
      if (ph < 0.22) dip = Math.sin((ph / 0.22) * Math.PI); // 준비: 살짝 아래로
      else if (ph < 0.45) m = ease((ph - 0.22) / 0.23); // 입으로
      else if (ph < 0.75) { m = 1; chew = (ph - 0.45) / 0.3; } // 잠깐 멈춤 (냠)
      else m = 1 - ease((ph - 0.75) / 0.45); // 돌아오기
    }
    p.copy(rest).lerp(MOUTH, m); p.y -= dip * 0.04; p.y += Math.sin(t * 2.2) * 0.012 * (1 - m);
    root.position.copy(p);
    root.rotation.set(m * 0.5, 0, -m * 0.5); // 입 쪽으로 기울이기
    const squash = chew ? 1 - Math.sin(chew * Math.PI) * 0.1 : 1;
    food.scale.set(st.k * size / Math.sqrt(squash), st.k * size * squash, st.k * size / Math.sqrt(squash));
    api.nod = chew ? -Math.sin(chew * Math.PI) * 0.06 : 0; // 냠: 고개 까딱 (몸 기울기에 더함)
    crumbs.forEach((c, i) => {
      c.visible = chew > 0.1;
      if (!c.visible) return;
      const k = chew;
      c.position.set(MOUTH.x + (i - 1.5) * 0.03 * k, MOUTH.y - 0.05 - k * k * 0.25, MOUTH.z - 0.03 - k * 0.04);
    });
    if (icon) { icon.visible = true; icon.userData.draw(1 - age / life); }
  };
  const drop = () => { char.body.remove(root); if (icon) char.body.remove(icon); crumbs.forEach((c) => char.body.remove(c)); };
  const api = { tick, drop, food, nod: 0 };
  return api;
}

// ── 앉기: 의자 윗면 높이 seatY에. 캐릭터는 팔다리가 없으므로 3가지 방법
export const SIT = {
  A: { name: '쏙 앉기 (몸 아래쪽이 의자 앞으로 내려옴 · 살짝 기댐)' },
  B: { name: '다리 달랑 (짧은 다리 2개가 나와 흔들흔들)' },
  C: { name: '폭신 눌림 (몸이 납작해지며 숨쉬기)' },
};
// 돌려줌: { tick(t, nod), stand() }. nod = 먹는 고개 까딱(holdFood). 캐릭터 group의 y만 정하고(x·z·방향은 부르는 쪽이), 몸(body)의 기울기·크기를 바꿈
export function sitPose(char, style, seatY) {
  const b = char.body, legs = [];
  if (style === 'B') {
    const legM = lam(0xf6f5f1), shoe = lam(0x3d3b5c);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.085, 0.1, -0.1); b.add(pivot);
      add(pivot, new THREE.CapsuleGeometry(0.05, 0.12, 4, 10), legM, 0, -0.08, 0);
      const sh = add(pivot, new THREE.SphereGeometry(0.06, 12, 10), shoe, 0, -0.17, -0.025); sh.scale.set(1, 0.7, 1.3);
      pivot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      legs.push(pivot);
    }
  }
  const tick = (t, nod = 0) => {
    const g = char.group;
    if (style === 'A') { g.position.y = seatY - 0.2; b.rotation.x = 0.07 + nod; b.scale.set(1, 1, 1); }
    else if (style === 'B') {
      g.position.y = seatY - 0.06; b.rotation.x = 0.05 + nod;
      legs.forEach((l, i) => { l.rotation.x = -0.9 + Math.sin(t * 3.2 + i * Math.PI) * 0.35; });
    } else {
      g.position.y = seatY - 0.03; b.rotation.x = 0.04 + nod;
      const br = Math.sin(t * 2.4) * 0.015;
      b.scale.set(1.12 - br, 0.84 + br, 1.12 - br);
    }
  };
  const stand = () => { for (const l of legs) b.remove(l); b.rotation.x = 0; b.scale.set(1, 1, 1); char.group.position.y = 0; };
  return { tick, stand };
}
