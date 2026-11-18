// 교실(일반): 책상을 뒤로 밀어 놓고 가운데에 탁구대를 펼친 학교 교실.
// A팀 쪽 벽(-z) = 칠판·교탁·급훈·시계, B팀 쪽 벽(+z) = 게시판·사물함,
// 오른쪽(+x) = 운동장이 보이는 창문(커튼), 왼쪽(-x) = 복도 쪽 미닫이문. 천장엔 형광등과 선풍기
import * as THREE from 'three';
import { seeded, canvasTex, std, addBox, textTex, clockTex } from './arena-kit.js';

const RX = 6.5, RZ = 8.5, RH = 3.3;

// 학생 책상 + 의자 (청소할 때처럼 의자를 책상 위에 거꾸로 올린 것도)
function desk(flip) {
  const g = new THREE.Group();
  const top = std(0xd8b483), metal = std(0x5d6b78, { metalness: 0.5, roughness: 0.5 }), seat = std(0xc99a62);
  addBox(g, 0.65, 0.03, 0.48, top, 0, 0.72, 0);
  addBox(g, 0.6, 0.12, 0.4, metal, 0, 0.64, 0.02); // 서랍칸
  for (const [x, z] of [[-0.3, -0.21], [0.3, -0.21], [-0.3, 0.21], [0.3, 0.21]]) addBox(g, 0.03, 0.7, 0.03, metal, x, 0.35, z);
  const chair = new THREE.Group();
  addBox(chair, 0.4, 0.03, 0.38, seat, 0, 0.42, 0);
  addBox(chair, 0.4, 0.28, 0.03, seat, 0, 0.7, 0.18);
  for (const [x, z] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]]) addBox(chair, 0.025, 0.42, 0.025, metal, x, 0.21, z);
  addBox(chair, 0.025, 0.3, 0.025, metal, -0.18, 0.56, 0.18); addBox(chair, 0.025, 0.3, 0.025, metal, 0.18, 0.56, 0.18);
  if (flip) { chair.rotation.x = Math.PI; chair.position.set(0, 0.74 + 0.86, 0.02); }
  else chair.position.set(0, 0, 0.42);
  g.add(chair);
  return g;
}

export function buildClassroom() {
  const root = new THREE.Group();
  const rnd = seeded(31);

  // ---------- 바닥·벽·천장 ----------
  const floorTex = canvasTex(256, 256, (g) => {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = x % 2 ? '#c99a64' : '#d3a670'; g.fillRect(x * 32, 0, 32, 256);
      g.fillStyle = 'rgba(110,70,30,0.22)'; g.fillRect(x * 32, 0, 2, 256);
      g.fillRect(x * 32, ((x * 97) % 200) + 20, 32, 2);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(RX / 1.4, RZ / 1.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallM = std(0xf2eedf), lowM = std(0x9fc3a6), trim = std(0x7a8f80);
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, -RZ);
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, RZ);
  addBox(root, 0.2, RH, RZ * 2, wallM, -RX, RH / 2, 0);
  addBox(root, 0.2, RH, RZ * 2, wallM, RX, RH / 2, 0);
  // 아래쪽 연두 페인트 + 몰딩 (옛날 교실 벽)
  addBox(root, RX * 2, 1.0, 0.04, lowM, 0, 0.5, -RZ + 0.11); addBox(root, RX * 2, 1.0, 0.04, lowM, 0, 0.5, RZ - 0.11);
  addBox(root, 0.04, 1.0, RZ * 2, lowM, -RX + 0.11, 0.5, 0); addBox(root, 0.04, 1.0, RZ * 2, lowM, RX - 0.11, 0.5, 0);
  for (const [w, d, x, z] of [[RX * 2, 0.08, 0, -RZ + 0.13], [RX * 2, 0.08, 0, RZ - 0.13], [0.08, RZ * 2, -RX + 0.13, 0], [0.08, RZ * 2, RX - 0.13, 0]]) addBox(root, w, 0.05, d, trim, x, 1.02, z);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ color: 0xf4f2ea, emissive: 0x6b6a62, emissiveIntensity: 0.5 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = RH; root.add(ceil);
  // 형광등 (두 줄 x 네 개)
  const tubeM = new THREE.MeshBasicMaterial({ color: 0xfbfdff });
  for (const x of [-2.4, 2.4]) for (const z of [-6, -2, 2, 6]) {
    addBox(root, 0.32, 0.06, 1.3, std(0xe9ecef), x, RH - 0.03, z);
    for (const dx of [-0.07, 0.07]) { const t = addBox(root, 0.05, 0.04, 1.2, tubeM, x + dx, RH - 0.08, z); t.userData.noFocus = true; }
  }

  // ---------- A팀 쪽 벽 (-z): 칠판 ----------
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.35), new THREE.MeshLambertMaterial({ map: canvasTex(1024, 266, (g, w, h) => {
    g.fillStyle = '#2f5a45'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 30; i++) g.fillRect(i * 37 % w, (i * 53) % h, 140, 18); // 지운 자국
    g.fillStyle = '#f4f1e6'; g.textBaseline = 'middle';
    g.font = 'bold 30px sans-serif'; g.textAlign = 'left'; g.fillText('11월 18일 (수)', 28, 34);
    g.textAlign = 'right'; g.fillText('주번: 탁구왕', w - 28, 34);
    g.textAlign = 'center'; g.font = 'bold 76px sans-serif'; g.fillText('오늘은 탁구 수업 🏓', w / 2, 128);
    g.font = 'bold 34px sans-serif'; g.fillStyle = '#ffe58a'; g.fillText('※ 공 주우러 갈 때 뛰지 말 것!', w / 2, 210);
  }) }));
  board.position.set(0, 1.62, -RZ + 0.14); root.add(board);
  addBox(root, 5.36, 1.5, 0.05, std(0x8a6b48), 0, 1.62, -RZ + 0.1); // 테두리
  addBox(root, 5.2, 0.05, 0.12, std(0x8a6b48), 0, 0.92, -RZ + 0.16); // 분필 받침
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), std([0xffffff, 0xffe066, 0xff8a8a, 0xffffff][i])); c.rotation.z = Math.PI / 2; c.position.set(-1.6 + i * 0.12, 0.96, -RZ + 0.17); root.add(c); }
  addBox(root, 0.16, 0.06, 0.08, std(0x4a4f57), 1.8, 0.97, -RZ + 0.17); // 칠판지우개
  // 급훈 + 태극기 + 시계 + 스피커
  const motto = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshBasicMaterial({ map: textTex(['급훈: 준비하시고, 스매시!'], { w: 512, h: 134, bg: '#fffaf0', color: '#2b3a4a', border: '#8a6b48', font: 'bold 44px sans-serif' }) }));
  motto.position.set(0, 2.78, -RZ + 0.12); root.add(motto);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(150, 100, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 150, 100);
    g.fillStyle = '#cd2e3a'; g.beginPath(); g.arc(75, 50, 22, Math.PI, 0); g.fill();
    g.fillStyle = '#0047a0'; g.beginPath(); g.arc(75, 50, 22, 0, Math.PI); g.fill();
    g.fillStyle = '#111'; for (const [x, y] of [[22, 20], [128, 20], [22, 80], [128, 80]]) for (let k = 0; k < 3; k++) g.fillRect(x - 10, y - 8 + k * 6, 20, 3);
  }) }));
  flag.position.set(-1.7, 2.78, -RZ + 0.12); root.add(flag);
  addBox(root, 0.66, 0.46, 0.03, std(0x8a6b48), -1.7, 2.78, -RZ + 0.1);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshBasicMaterial({ map: clockTex(10, 50) }));
  clock.position.set(1.7, 2.78, -RZ + 0.12); root.add(clock);
  addBox(root, 0.36, 0.26, 0.16, std(0x3b3f46), -RX + 0.6, 2.9, -RZ + 0.2); // 스피커
  // 교탁 + 교사 책상
  const lect = new THREE.Group();
  addBox(lect, 0.8, 1.0, 0.5, std(0x9a6a44), 0, 0.5, 0); addBox(lect, 0.86, 0.04, 0.56, std(0x7a4f2c), 0, 1.02, 0);
  addBox(lect, 0.3, 0.03, 0.22, std(0x2f6fe0), 0.1, 1.05, 0); // 출석부
  lect.position.set(-3.6, 0, -RZ + 1.2); root.add(lect);
  const tdesk = new THREE.Group();
  addBox(tdesk, 1.4, 0.05, 0.7, std(0xb8a58a), 0, 0.74, 0); addBox(tdesk, 0.5, 0.7, 0.66, std(0x8c96a0, { metalness: 0.4 }), 0.42, 0.36, 0);
  addBox(tdesk, 0.04, 0.72, 0.6, std(0x8c96a0), -0.66, 0.36, 0);
  addBox(tdesk, 0.4, 0.28, 0.03, std(0x1f2933), -0.2, 0.92, -0.1); // 모니터
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 10), std(0xf2c230)); mug.position.set(0.35, 0.82, 0.12); tdesk.add(mug);
  tdesk.position.set(3.8, 0, -RZ + 1.0); root.add(tdesk);

  // ---------- B팀 쪽 벽 (+z): 게시판 + 사물함 ----------
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshLambertMaterial({ map: canvasTex(1024, 205, (g, w, h) => {
    g.fillStyle = '#c69a62'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(90,60,30,0.25)'; for (let i = 0; i < 600; i++) g.fillRect((i * 71) % w, (i * 37) % h, 2, 2);
    const cols = ['#fff3a8', '#ffd1dc', '#c8e9ff', '#d7f5c8', '#ffffff', '#ffe0b8'];
    const papers = ['우리 반 규칙', '시간표', '🏓 탁구 대회', '급식 메뉴', '청소 당번', '생일 축하해!', '독서 기록'];
    papers.forEach((s, i) => {
      const x = 40 + i * 140, y = 24 + (i % 2) * 22, pw = 120, ph = 150 - (i % 3) * 14;
      g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate(((i * 37) % 9 - 4) * 0.012);
      g.fillStyle = cols[i % cols.length]; g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.fillStyle = '#2b3a4a'; g.font = 'bold 19px sans-serif'; g.textAlign = 'center'; g.fillText(s, 0, -ph / 2 + 26);
      g.fillStyle = 'rgba(40,50,60,0.35)'; for (let k = 0; k < 5; k++) g.fillRect(-pw / 2 + 12, -ph / 2 + 46 + k * 16, pw - 24 - (k % 2) * 20, 5);
      g.fillStyle = '#e0333c'; g.beginPath(); g.arc(0, -ph / 2 + 6, 5, 0, 7); g.fill();
      g.restore();
    });
  }) }));
  cork.rotation.y = Math.PI; cork.position.set(0, 2.25, RZ - 0.12); root.add(cork);
  addBox(root, 6.14, 1.32, 0.04, std(0x8a6b48), 0, 2.25, RZ - 0.1);
  // 사물함 (색 문이 줄줄이)
  const lockCols = [0x6fa8dc, 0xf6b26b, 0x93c47d, 0xe06666, 0xffd966, 0x8e7cc3];
  addBox(root, 7.2, 1.0, 0.45, std(0xd9d6cc), 0, 0.5, RZ - 0.35);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
    const x = -3.3 + i * 0.6, y = 0.27 + r * 0.47;
    addBox(root, 0.54, 0.42, 0.02, std(lockCols[(i + r * 3) % lockCols.length]), x, y, RZ - 0.58);
    addBox(root, 0.08, 0.03, 0.02, std(0xeeeeee), x, y + 0.12, RZ - 0.6);
  }
  // 사물함 위 물건들 (농구공·가방·화분)
  const bball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), std(0xe07b2e)); bball.position.set(-2.4, 1.12, RZ - 0.35); root.add(bball);
  addBox(root, 0.36, 0.3, 0.2, std(0x3d6ec9), -1.6, 1.15, RZ - 0.35);
  addBox(root, 0.32, 0.26, 0.18, std(0xd9534f), 2.2, 1.13, RZ - 0.35);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 10), std(0xd9744a)); pot.position.set(3.0, 1.09, RZ - 0.35); root.add(pot);
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: 0x4f9a46, flatShading: true })); plant.position.set(3.0, 1.32, RZ - 0.35); root.add(plant);

  // ---------- 오른쪽 (+x): 운동장이 보이는 창문 + 커튼 ----------
  const outside = new THREE.MeshBasicMaterial({ map: canvasTex(256, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fd3ff'); gr.addColorStop(0.55, '#dff1ff'); gr.addColorStop(0.56, '#d8b88a'); gr.addColorStop(1, '#c9a574');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5f9e4f'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(18 + i * 40, 104, 22, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.fillRect(60, 132, 2, 40); g.fillRect(190, 132, 2, 40); g.fillRect(60, 132, 132, 2); // 축구 골대
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(70, 30, 14, 0, 7); g.arc(90, 26, 18, 0, 7); g.arc(112, 32, 12, 0, 7); g.fill();
  }) });
  const curtains = [];
  for (const z of [-5.2, -1.7, 1.7, 5.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.6), outside); win.rotation.y = -Math.PI / 2; win.position.set(RX - 0.11, 1.95, z); root.add(win);
    const frame = std(0xe8e8e4);
    addBox(root, 0.08, 1.68, 0.06, frame, RX - 0.13, 1.95, z - 1.5); addBox(root, 0.08, 1.68, 0.06, frame, RX - 0.13, 1.95, z + 1.5);
    addBox(root, 0.08, 0.06, 3.0, frame, RX - 0.13, 1.95 + 0.82, z); addBox(root, 0.08, 0.06, 3.0, frame, RX - 0.13, 1.95 - 0.82, z);
    addBox(root, 0.08, 1.64, 0.05, frame, RX - 0.13, 1.95, z);
    addBox(root, 0.22, 0.04, 3.1, std(0xd6d2c4), RX - 0.2, 1.12, z); // 창턱
    // 커튼 (양쪽으로 묶음, 바람에 살랑)
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.45), std(0xf1e4c6));
      c.position.set(RX - 0.22, 1.9, z + s * 1.42); root.add(c); curtains.push(c);
    }
  }
  addBox(root, 0.06, 0.05, RZ * 2 - 0.4, std(0xb0b0b0, { metalness: 0.6 }), RX - 0.24, 2.88, 0); // 커튼 레일
  // 창 아래 라디에이터
  for (const z of [-3.5, 3.5]) { const r = addBox(root, 0.18, 0.55, 1.4, std(0xe1ddd3), RX - 0.25, 0.45, z); for (let i = 0; i < 9; i++) addBox(root, 0.2, 0.5, 0.03, std(0xcfcac0), RX - 0.25, 0.45, z - 0.6 + i * 0.15); void r; }

  // ---------- 왼쪽 (-x): 복도 쪽 벽 (미닫이문 + 윗창) ----------
  const hall = new THREE.MeshBasicMaterial({ color: 0xdfe6e9 });
  for (const z of [-6.2, 6.2]) {
    addBox(root, 0.08, 2.1, 1.0, std(0xb88a5a), -RX + 0.13, 1.05, z);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), hall); glass.rotation.y = Math.PI / 2; glass.position.set(-RX + 0.18, 1.5, z); root.add(glass);
    addBox(root, 0.04, 0.04, 0.12, std(0x777777, { metalness: 0.7 }), -RX + 0.2, 1.0, z + 0.38); // 손잡이
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), new THREE.MeshBasicMaterial({ map: textTex('3학년 2반', { w: 320, h: 100, bg: '#ffffff', color: '#2b3a4a', border: '#2b3a4a', font: 'bold 46px sans-serif' }) }));
  sign.rotation.y = Math.PI / 2; sign.position.set(-RX + 0.14, 2.45, -6.2); root.add(sign);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), hall); w.rotation.y = Math.PI / 2; w.position.set(-RX + 0.12, 2.6, z); root.add(w);
    addBox(root, 0.06, 0.06, 2.04, std(0xe8e8e4), -RX + 0.14, 2.3, z);
  }
  // 복도 벽 쪽 청소함 + 쓰레기통
  addBox(root, 0.5, 1.8, 0.7, std(0x7f8c99, { metalness: 0.3 }), -RX + 0.4, 0.9, 4.6);
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.55, 14), std(0x3c8dbc)); bin.position.set(-RX + 0.4, 0.28, 3.8); root.add(bin);

  // ---------- 뒤로 밀어 놓은 책상들 (네 구석) ----------
  for (const [cx, cz] of [[-4.6, -5.2], [4.4, -5.0], [-4.6, 5.4], [4.4, 5.6]]) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const d = desk(rnd() < 0.6);
      d.position.set(cx + (c - 0.5) * 0.75 + (rnd() - 0.5) * 0.06, 0, cz + (r - 1) * 0.95 * Math.sign(cz) + (rnd() - 0.5) * 0.06);
      d.rotation.y = (cz < 0 ? Math.PI : 0) + (rnd() - 0.5) * 0.08;
      root.add(d);
    }
  }

  // ---------- 천장 선풍기 (천천히 돎) ----------
  const fans = [];
  for (const z of [-4, 4]) {
    const f = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), std(0xdddddd)); rod.position.y = -0.17; f.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), std(0xeeeeee)); hub.position.y = -0.36; f.add(hub);
    const blades = new THREE.Group(); blades.position.y = -0.38; f.add(blades);
    for (let i = 0; i < 3; i++) { const b = addBox(blades, 0.5, 0.01, 0.1, std(0xf4f4f4), 0.3, 0, 0); b.position.set(Math.cos(i * 2.094) * 0.3, 0, Math.sin(i * 2.094) * 0.3); b.rotation.y = -i * 2.094; }
    f.position.set(0, RH, z); root.add(f); fans.push(blades);
  }

  return {
    root,
    sky: '#f2eedf',
    fog: [30, 80],
    far: 100,
    light: { hemi: ['#fffdf4', '#b4a284', 1.55], sun: ['#fff6e0', 1.5, [4, 8, 2]] },
    tick(t, dt) {
      fans.forEach((b, i) => { b.rotation.y += dt * (1.2 + i * 0.3); });
      curtains.forEach((c, i) => { c.rotation.z = Math.sin(t * 0.8 + i * 1.3) * 0.03; });
    },
  };
}
