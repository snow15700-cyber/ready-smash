// 지하 주차장(일반): 지하 2층 주차장 통로 한가운데 탁구대.
// 양옆 = 노란 주차선 칸에 세워 둔 차들, 콘크리트 기둥(구역 표시 B2 A-1…), 천장엔 형광등·배관,
// A팀 쪽 끝(-z) = 출구 램프·'출구' 표지, B팀 쪽 끝(+z) = 엘리베이터 홀·비상구.
// ★ 몰입 연출(랠리가 길어져 어두워질 때): 탁구대에서 먼 형광등부터 한두 개씩 '딸깍' 깜빡이며 꺼진다.
//    탁구대 위 세 개는 끝까지 켜져 있고, 점수가 나면 형광등이 다시 깜빡깜빡 켜진다.
import * as THREE from 'three';
import { seeded, canvasTex, std, addBox, textTex, glowSprite } from './arena-kit.js';
import { makeCar, CAR_TYPES } from './arena-cars.js';

const RX = 10, RZ = 12, RH = 3.0;
const BAY_X = 6.2;           // 주차 칸 가운데 (양옆)
const BAY_W = 2.5;           // 주차 칸 폭 (z 방향)
const COL_X = 4.0;           // 기둥 줄
const CAR_SCALE = 0.72;
const YELLOW = 0xf2c230;

export function buildParking() {
  const root = new THREE.Group();
  const rnd = seeded(404);

  // ---------- 바닥 (초록 에폭시 + 노란 주차선 + 통로 화살표) ----------
  const PX = 40; // 1m = 40px
  const floorTex = canvasTex(RX * 2 * PX, RZ * 2 * PX, (g, w, h) => {
    g.fillStyle = '#5d7a68'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect((i * 97) % w, (i * 61) % h, 3 + (i % 5), 2); }
    // 바퀴 자국
    g.fillStyle = 'rgba(30,35,32,0.18)'; for (const x of [-1.1, -0.3, 0.3, 1.1]) g.fillRect((RX + x) * PX - 6, 0, 12, h);
    const X = (x) => (x + RX) * PX, Z = (z) => (z + RZ) * PX;
    g.fillStyle = '#f2c230';
    for (const s of [-1, 1]) {
      const x0 = s * (BAY_X - 2.6), x1 = s * (BAY_X + 2.6);
      for (let k = -5; k <= 5; k++) { const z = k * BAY_W; g.fillRect(Math.min(X(x0), X(x1)), Z(z) - 3, Math.abs(X(x1) - X(x0)), 6); }
    }
    // 통로 가장자리 실선 + 화살표 (탁구대 바깥쪽)
    for (const x of [-2.4, 2.4]) g.fillRect(X(x) - 3, 0, 6, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [z, dir] of [[-8.5, -1], [8.5, -1]]) {
      const cx = X(0), cz = Z(z);
      g.fillRect(cx - 10, cz - 30 * dir, 20, 60 * dir);
      g.beginPath(); g.moveTo(cx - 32, cz - 30 * dir); g.lineTo(cx + 32, cz - 30 * dir); g.lineTo(cx, cz - 70 * dir); g.fill();
    }
    g.save(); g.translate(X(0), Z(6.8)); g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('천천히', 0, 0); g.restore();
    g.save(); g.translate(X(0), Z(-6.8)); g.rotate(Math.PI); g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('천천히', 0, 0); g.restore();
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  // ---------- 벽·천장 (콘크리트) ----------
  const concTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#9a9c98'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '40,40,40'},0.06)`; g.fillRect((i * 37) % 128, (i * 71) % 128, 3, 3); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); // 거푸집 자국
  });
  concTex.wrapS = concTex.wrapT = THREE.RepeatWrapping; concTex.repeat.set(8, 2);
  const wallM = new THREE.MeshLambertMaterial({ map: concTex });
  addBox(root, RX * 2, RH, 0.3, wallM, 0, RH / 2, -RZ);
  addBox(root, RX * 2, RH, 0.3, wallM, 0, RH / 2, RZ);
  addBox(root, 0.3, RH, RZ * 2, wallM, -RX, RH / 2, 0);
  addBox(root, 0.3, RH, RZ * 2, wallM, RX, RH / 2, 0);
  // 벽 아래쪽 초록 + 노란 띠
  for (const [w, d, x, z] of [[RX * 2, 0.04, 0, -RZ + 0.16], [RX * 2, 0.04, 0, RZ - 0.16], [0.04, RZ * 2, -RX + 0.16, 0], [0.04, RZ * 2, RX - 0.16, 0]]) {
    addBox(root, w, 1.0, d, std(0x4f6b5a), x, 0.5, z);
    addBox(root, w, 0.15, d + 0.005, std(YELLOW), x, 1.05, z);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ color: 0x8e908c }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = RH; root.add(ceil);
  // 천장 보 (x 방향)
  for (let k = -4; k <= 4; k++) addBox(root, RX * 2, 0.4, 0.5, wallM, 0, RH - 0.2, k * BAY_W * 2 + BAY_W);
  // 배관: 빨간 소방 배관 + 회색 덕트
  const pipe = (r, col, x, y) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, RZ * 2, 10), std(col, { metalness: 0.3, roughness: 0.6 })); p.rotation.x = Math.PI / 2; p.position.set(x, y, 0); root.add(p); };
  pipe(0.07, 0xc8322f, -2.0, RH - 0.5); pipe(0.05, 0xc8322f, 2.9, RH - 0.48);
  addBox(root, 0.7, 0.35, RZ * 2, std(0xb4b8bc, { metalness: 0.6, roughness: 0.4 }), 7.6, RH - 0.65, 0);
  for (let z = -10; z <= 10; z += 4) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 8), std(0xd9b44a, { metalness: 0.8 })); sp.position.set(-2.0, RH - 0.6, z); root.add(sp); }

  // ---------- 기둥 (구역 표시) ----------
  const zones = ['A', 'B'];
  for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) {
    const x = s * COL_X, z = k * BAY_W * 2;
    addBox(root, 0.6, RH, 0.6, std(0xc9cbc7), x, RH / 2, z);
    // 아래 노랑·검정 사선 띠
    const stripe = canvasTex(64, 64, (g) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#1f2124'; for (let i = -64; i < 64; i += 22) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 11, 64); g.lineTo(i + 75, 0); g.lineTo(i + 64, 0); g.fill(); } });
    stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(2, 1);
    addBox(root, 0.62, 0.5, 0.62, new THREE.MeshLambertMaterial({ map: stripe }), x, 0.25, z);
    // 구역 글씨 (네 면)
    const label = `B2 ${zones[s > 0 ? 1 : 0]}-${k + 3}`;
    const tex = textTex(label, { w: 256, h: 160, bg: s > 0 ? '#2f6fb0' : '#d9534f', color: '#ffffff', font: 'bold 70px sans-serif' });
    const lm = new THREE.MeshBasicMaterial({ map: tex });
    for (let f = 0; f < 4; f++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), lm);
      const a = (f / 4) * Math.PI * 2; p.rotation.y = a; p.position.set(x + Math.sin(a) * 0.305, 1.75, z + Math.cos(a) * 0.305); root.add(p);
    }
  }

  // ---------- 세워 둔 차들 (빈 칸도 섞어서) ----------
  const colors = [0xf4f4f4, 0x1f2124, 0x9aa0a6, 0x2f4f8f, 0xa02a2a, 0xf4f4f4, 0x5a6270, 0xe9e2d0];
  for (const s of [-1, 1]) for (let k = -4; k <= 4; k++) {
    if (rnd() < 0.3) continue;
    const type = CAR_TYPES[Math.floor(rnd() * CAR_TYPES.length)];
    const car = makeCar(type, colors[Math.floor(rnd() * colors.length)]);
    car.scale.setScalar(CAR_SCALE);
    car.rotation.y = s > 0 ? Math.PI / 2 + (rnd() < 0.5 ? Math.PI : 0) : -Math.PI / 2 + (rnd() < 0.5 ? Math.PI : 0);
    car.position.set(s * (BAY_X + 0.2 + rnd() * 0.3), 0, k * BAY_W + BAY_W / 2 + (rnd() - 0.5) * 0.2);
    // 세워 둔 차라 전조등·미등 빛 번짐은 끈다
    car.traverse((o) => { if (o.isSprite) o.visible = false; });
    root.add(car);
  }
  // 바퀴 멈춤턱
  for (const s of [-1, 1]) for (let k = -5; k < 5; k++) addBox(root, 0.15, 0.1, 1.2, std(YELLOW), s * (BAY_X + 2.1), 0.05, k * BAY_W + BAY_W / 2);

  // ---------- A팀 쪽 끝 (-z): 출구 램프 ----------
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 5), std(0x6c6f6b)); ramp.rotation.x = 0.28; ramp.position.set(0, 0.6, -RZ + 1.6); root.add(ramp);
  const rampLight = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), new THREE.MeshBasicMaterial({ color: 0xcfe6f7 })); rampLight.position.set(0, 2.2, -RZ + 0.17); rampLight.userData.noFocus = true; root.add(rampLight); // 밖에서 들어오는 빛
  for (const x of [-2.2, 2.2]) addBox(root, 0.25, 1.2, 5, std(YELLOW), x, 0.6, -RZ + 1.6);
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: textTex('출구 EXIT ↑', { w: 512, h: 128, bg: '#14a44d', color: '#ffffff', font: 'bold 64px sans-serif' }) }));
  exitSign.position.set(0, RH - 0.55, -RZ + 3.6); exitSign.userData.noFocus = true; root.add(exitSign);
  const height = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ map: textTex('높이 제한 2.3m', { w: 512, h: 112, bg: '#f2c230', color: '#1f2124', font: 'bold 60px sans-serif' }) }));
  height.position.set(0, RH - 0.25, -RZ + 3.61); root.add(height);
  addBox(root, 4.4, 0.1, 0.1, std(YELLOW), 0, RH - 0.95, -RZ + 3.55);

  // ---------- B팀 쪽 끝 (+z): 엘리베이터 홀 ----------
  const hall = new THREE.Group();
  addBox(hall, 4.0, 2.4, 0.1, std(0xe4e2dc), 0, 1.2, 0);
  for (const x of [-0.9, 0.9]) {
    addBox(hall, 1.1, 2.1, 0.06, std(0xc3c7cc, { metalness: 0.8, roughness: 0.25 }), x, 1.05, -0.07);
    addBox(hall, 0.01, 2.1, 0.07, std(0x7d8186), x, 1.05, -0.08);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: textTex('B2', { w: 128, h: 52, bg: '#111', color: '#ff5a3a', font: 'bold 40px monospace' }) })); disp.rotation.y = Math.PI; disp.position.set(x, 2.25, -0.11); disp.userData.noFocus = true; hall.add(disp);
  }
  const hallSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: textTex('🛗 엘리베이터', { w: 512, h: 128, bg: '#2b3a4a', color: '#ffffff', font: 'bold 56px sans-serif' }) }));
  hallSign.rotation.y = Math.PI; hallSign.position.set(0, 2.65, -0.11); hall.add(hallSign);
  hall.position.set(0, 0, RZ - 0.2); root.add(hall);
  const emerg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.25), new THREE.MeshBasicMaterial({ map: textTex('🏃 비상구', { w: 256, h: 92, bg: '#14a44d', color: '#ffffff', font: 'bold 46px sans-serif' }) }));
  emerg.rotation.y = Math.PI; emerg.position.set(3.5, 2.4, RZ - 0.17); emerg.userData.noFocus = true; root.add(emerg);
  addBox(root, 1.0, 2.1, 0.08, std(0x6b7480, { metalness: 0.4 }), 3.5, 1.05, RZ - 0.2);
  // 소화기함 + 큰 'B2' 벽 글씨
  addBox(root, 0.5, 0.8, 0.2, std(0xc8322f), -3.4, 1.0, RZ - 0.25);
  for (const [x, z, ry] of [[-RX + 0.16, -6, Math.PI / 2], [RX - 0.16, 6, -Math.PI / 2], [-RX + 0.16, 6, Math.PI / 2], [RX - 0.16, -6, -Math.PI / 2]]) {
    const big = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: textTex('B2', { w: 320, h: 200, bg: '#f2c230', color: '#1f2124', font: 'bold 150px sans-serif' }) }));
    big.rotation.y = ry; big.position.set(x + Math.sign(-x) * 0.01, 1.9, z); root.add(big);
  }
  // 반사경 (기둥 위)
  const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xdfe6ee, { metalness: 1, roughness: 0.1 }));
  mirror.rotation.x = Math.PI / 2; mirror.position.set(-COL_X, 2.3, -BAY_W * 4 + 0.32); root.add(mirror);
  const mirRim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20), std(0xe07b2e)); mirRim.position.copy(mirror.position); root.add(mirRim);
  // 주차 콘
  for (const [x, z] of [[-2.9, -9.5], [-2.6, -9.1], [2.8, 9.4]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 12), std(0xff6a1a)); cone.position.set(x, 0.25, z); root.add(cone);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 12), std(0xffffff)); band.position.set(x, 0.28, z); root.add(band);
    addBox(root, 0.36, 0.03, 0.36, std(0xff6a1a), x, 0.015, z);
  }

  // ---------- 형광등 (몰입 연출 때 먼 것부터 하나둘 꺼짐) ----------
  const lights = [];
  const housingM = std(0xd8dadc);
  for (const x of [-COL_X - 2.2, 0, COL_X + 2.2]) for (let k = -4; k <= 4; k += 1) {
    if (x !== 0 && k % 2) continue;
    const z = k * BAY_W;
    addBox(root, 0.22, 0.06, 1.3, housingM, x, RH - 0.03, z);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
    const tube = addBox(root, 0.07, 0.05, 1.22, mat, x, RH - 0.08, z);
    tube.userData.noFocus = true; tube.userData.noBake = true;
    const glow = glowSprite(0xe6f4ff, 2.2, 0.32); glow.position.set(x, RH - 0.12, z); glow.userData.noBake = true; root.add(glow);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.01, z); pool.userData.noFocus = true; pool.userData.noBake = true; root.add(pool); // 바닥에 비친 불빛
    lights.push({ mat, glow, pool, d: Math.hypot(x, z) + rnd() * 0.8, on: true, want: true, flick: 0, lit: 1 });
  }
  // 먼 것부터 끈다. 탁구대 위 세 개(가운데 + 양 팀 머리 위)는 끝까지 켜 둔다
  const order = [...lights].sort((a, b) => b.d - a.d);
  const KEEP = 3;
  const broken = order[1]; // 평소에도 가끔 지지직 하는 낡은 형광등 하나
  let brokenT = 4;
  const setLit = (L, v) => {
    L.lit = v;
    L.mat.color.setRGB(0.012 + 0.95 * v, 0.014 + 0.97 * v, 0.016 + 0.98 * v); // (선형 색이라 0.01대가 거의 검정)
    L.glow.visible = v > 0.5; L.pool.visible = v > 0.5;
  };
  let focus = 0;

  return {
    root,
    crowd: [1.9, 2.65], // 관중 앞줄·뒷줄 (탁구대 옆 가장자리에서 m): 기둥·주차된 차보다 앞에 서게 (crowd.js)
    sky: '#3a3d3b',
    fog: [12, 34],
    far: 60,
    light: { hemi: ['#eef6ff', '#4a5a50', 1.35], sun: ['#f2f8ff', 1.3, [0.5, 8, 1.5]] },
    setFocus(k) { focus = k; },
    tick(t, dt) {
      // 몰입 정도만큼 먼 형광등부터 끄기 (조금 일찍 시작해서 어두워지는 게 눈에 띄게)
      const nOff = Math.min(order.length - KEEP, Math.floor(Math.min(1, focus * 1.15) * (order.length - KEEP) + 0.001));
      order.forEach((L, i) => {
        const want = i >= nOff;
        if (want !== L.want) { L.want = want; L.flick = want ? 0.5 + i * 0.03 : 0.35; }
        if (L.flick > 0) {
          L.flick -= dt;
          // 꺼질 때: 두세 번 깜빡 후 꺼짐 / 켜질 때: 형광등처럼 지지직 깜빡이다 켜짐
          setLit(L, L.flick <= 0 ? (L.want ? 1 : 0) : (Math.sin(L.flick * 60) > (L.want ? -0.2 : 0.3) ? 1 : 0));
        } else if (L.lit !== (L.want ? 1 : 0)) setLit(L, L.want ? 1 : 0);
      });
      // 낡은 형광등: 켜져 있을 때 가끔 지지직
      brokenT -= dt;
      if (brokenT < 0 && broken.want && broken.flick <= 0) { broken.flick = 0.25; brokenT = 5 + rnd() * 6; }
    },
  };
}
