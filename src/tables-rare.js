// 고급 탁구대 8종: 물건이 탁구대가 된다 (docs/dev/tables.md). 보기만 다르다.
// 공통: 치는 판 = TABLE_W × TABLE_L, 윗면 높이 TY, 네트 높이 NET_H (판정 그대로)
//   - 네트는 뒤가 비쳐 보이게(틈·반투명): 상대 쪽 네트 가까이 떨어진 공이 가려지지 않게
//   - 키 큰 소품은 -x 쪽(관전 카메라 반대편), +x 쪽에는 낮은 것만. 양 끝(선수 자리)에는 안 둠
//   - 공이 튈 때 반응은 작게: bounce(p, smash, fx). 평소 움직임: tick(t, dt, fx)
import * as THREE from 'three';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H } from './physics.js';
import { rng, canvasTex, lam, flat, shiny, put, box, cyl, roundBox, softTop, steamer, smooth } from './table-kit.js';

const HL = HALF_L, HW = HALF_W;
const PX = 512, PZ = Math.round(512 * (HL / TABLE_W)); // 반쪽 판 그림 크기 (가로 = x, 세로 = z)
const k2p = (m) => (m / TABLE_W) * PX; // 미터 → 그림 픽셀

// 둥근 사각형 경로
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
// 흐린 얼룩 (질감용)
function speckle(g, w, h, r, n, colors, size = [0.5, 2]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function text(g, s, x, y, px, color, { weight = 'bold', align = 'center', rot = 0, font = 'Jua, sans-serif' } = {}) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `${weight} ${px}px ${font}`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(s, 0, 0);
  g.restore();
}
const decay = (x, t) => Math.exp(-x * t);

/* ═════════════ 1. 사무실 책상 두 개 ═════════════ */
function office(root) {
  // 책상 윗면: 짙은 회색 상판(공이 잘 보이게) + 밝은 테두리(엣지 밴드 = 경계선)
  const topTex = canvasTex('office-top', PX, PZ, (g, w, h) => {
    const r = rng(31);
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#41454d'); grd.addColorStop(1, '#383b42');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 2600, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.08)']);
    for (let i = 0; i < 40; i++) { // 은은한 나뭇결 무늬 필름
      g.strokeStyle = `rgba(255,255,255,${0.015 + r() * 0.02})`; g.lineWidth = 1 + r() * 2;
      const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + r() * 8 - 4, w * 0.7, y + r() * 8 - 4, w, y); g.stroke();
    }
    g.strokeStyle = '#dfe3e8'; g.lineWidth = 7; g.strokeRect(3.5, 3.5, w - 7, h - 7);
    g.fillStyle = 'rgba(255,255,255,0.07)'; rr(g, w * 0.08, h * 0.12, w * 0.18, h * 0.05, 4); g.fill(); // 마우스패드 자국
  });
  const topMat = lam('#ffffff', { map: topTex });
  const edge = lam('#d5d9df');
  const metal = shiny('#4a4f58', 50);
  for (const s of [-1, 1]) {
    const zc = s * (HL / 2 + 0.002);
    put(root, new THREE.BoxGeometry(TABLE_W, 0.035, HL - 0.004), [edge, edge, topMat, edge, edge, edge], 0, TY - 0.0175, zc);
    for (const x of [-0.64, 0.64]) { // T자 다리
      box(root, 0.06, TY - 0.065, 0.06, metal, x, (TY - 0.065) / 2 + 0.015, zc);
      box(root, 0.07, 0.03, 0.95, metal, x, 0.015, zc);
      box(root, 0.05, 0.03, 1.15, metal, x, TY - 0.05, zc);
    }
    box(root, 1.28, 0.05, 0.03, metal, 0, TY - 0.06, zc + s * 0.45); // 가로대
    box(root, 1.0, 0.06, 0.12, lam('#2e3238'), 0, TY - 0.09, zc - s * 0.3, { shadow: false }); // 전선 정리함
  }
  box(root, TABLE_W, 0.03, 0.006, lam('#1d1f24'), 0, TY - 0.02, 0, { shadow: false }); // 두 책상 사이 틈

  // 네트 = 칸막이: 뿌연 아크릴 + 알루미늄 테 + 포스트잇
  const alu = shiny('#c9ced6', 80);
  const net = new THREE.Group();
  root.add(net);
  net.position.y = TY;
  put(net, new THREE.PlaneGeometry(1.8, NET_H - 0.012), new THREE.MeshPhongMaterial({ color: '#d6ebf7', transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, shininess: 90 }), 0, NET_H / 2 - 0.004, 0, { shadow: false });
  box(net, 1.84, 0.014, 0.022, alu, 0, NET_H - 0.004, 0);
  box(net, 1.84, 0.01, 0.018, alu, 0, 0.005, 0);
  for (const x of [-0.915, 0.915]) {
    box(net, 0.022, NET_H + 0.006, 0.026, alu, x, NET_H / 2, 0);
    box(net, 0.05, 0.012, 0.09, alu, x, 0.006, 0); // 받침
  }
  const noteCol = ['#ffe066', '#ff9ec4', '#9be7c4'];
  [[-0.52, 0.1, 1, 0.12], [0.31, 0.085, 1, -0.1], [0.62, 0.095, -1, 0.08]].forEach(([x, y, side, rot], i) => {
    const n = put(net, new THREE.PlaneGeometry(0.055, 0.055), lam(noteCol[i], { side: THREE.DoubleSide }), x, y, side * 0.013, { shadow: false, rz: rot });
    if (side < 0) n.rotation.y = Math.PI;
  });

  // 옆 소품 (-x): 서랍장 + 머그컵 + 다육이, 모니터 / (+x): 휴지통
  const cab = lam('#a9aeb5'); // 너무 밝으면 어두운 배경에서 튀어 보임
  const cx = -(HW + 0.3), cz = 0.62;
  box(root, 0.42, TY - 0.03, 0.5, cab, cx, (TY - 0.03) / 2, cz);
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.22;
    box(root, 0.006, 0.19, 0.46, lam('#bfc4cb'), cx + 0.212, y, cz, { shadow: false });
    box(root, 0.02, 0.018, 0.16, shiny('#8c939c', 60), cx + 0.222, y + 0.06, cz, { shadow: false });
  }
  const mugY = TY - 0.03;
  const mug = lam('#ff8a3d');
  cyl(root, 0.045, 0.042, 0.1, mug, cx - 0.06, mugY + 0.05, cz - 0.1, {}, 20);
  cyl(root, 0.039, 0.039, 0.002, lam('#3a2414'), cx - 0.06, mugY + 0.092, cz - 0.1, { shadow: false }, 20); // 커피
  put(root, new THREE.TorusGeometry(0.026, 0.008, 8, 16), mug, cx - 0.06, mugY + 0.05, cz - 0.15, { ry: Math.PI / 2 });
  cyl(root, 0.05, 0.04, 0.08, lam('#e9e2d6'), cx + 0.08, mugY + 0.04, cz + 0.12);
  const leaf = flat('#6fae6a');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = put(root, new THREE.SphereGeometry(0.03, 8, 6), leaf, cx + 0.08 + Math.cos(a) * 0.025, mugY + 0.1, cz + 0.12 + Math.sin(a) * 0.025);
    l.scale.set(0.6, 1.2, 0.6); l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
  }
  // 모니터 (책상 옆에 집게로 단 팔)
  const mz = -0.6, mx = -(HW + 0.24);
  cyl(root, 0.016, 0.016, 0.46, metal, -HW - 0.03, TY + 0.19, mz);
  box(root, 0.05, 0.08, 0.06, metal, -HW - 0.02, TY - 0.03, mz);
  box(root, 0.2, 0.03, 0.04, metal, -HW - 0.13, TY + 0.4, mz);
  box(root, 0.035, 0.38, 0.64, lam('#24272d'), mx, TY + 0.4, mz);
  const scr = canvasTex('office-screen', 256, 384, (g, w, h) => {
    g.fillStyle = '#f4f7fb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f7a4c'; g.fillRect(0, 0, w, 16);
    g.strokeStyle = '#d3dbe5'; g.lineWidth = 1;
    for (let y = 16; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (const x of [40, 110, 180]) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x, h); g.stroke(); }
    const r = rng(5);
    for (let y = 20; y < h; y += 12) { g.fillStyle = '#7d8896'; g.fillRect(4, y + 3, 20 + r() * 12, 5); g.fillRect(46, y + 3, 30 + r() * 30, 5); g.fillRect(116, y + 3, 20 + r() * 40, 5); }
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff8a3d', '#2f6fe0', '#2bb673', '#e94fa8', '#ffc83d'][i]; g.fillRect(190 + i * 12, 300 - i * 22 - 20, 9, 60 + i * 22); }
  }, { repeat: true });
  const screen = put(root, new THREE.PlaneGeometry(0.6, 0.34), new THREE.MeshBasicMaterial({ map: scr }), mx + 0.019, TY + 0.4, mz, { shadow: false, ry: Math.PI / 2 });
  // 휴지통 (+x, 낮음) + 구겨진 종이
  const bin = new THREE.MeshLambertMaterial({ color: '#3d434c', side: THREE.DoubleSide });
  put(root, new THREE.CylinderGeometry(0.15, 0.12, 0.34, 18, 1, true), bin, HW + 0.32, 0.17, -0.85);
  cyl(root, 0.12, 0.12, 0.01, bin, HW + 0.32, 0.005, -0.85);
  const paper = flat('#f2f2ee');
  for (const [x, y, z, s] of [[HW + 0.3, 0.34, -0.83, 0.05], [HW + 0.36, 0.33, -0.88, 0.04], [HW + 0.5, 0.035, -0.6, 0.035]]) put(root, new THREE.IcosahedronGeometry(s, 0), paper, x, y, z, { rx: s * 40, ry: s * 70 });

  const steam = steamer([cx - 0.06, mugY + 0.11, cz - 0.1], { every: 0.5, size: 0.04, up: 0.12, alpha: 0.28 });
  let shake = 0;
  return {
    tick(t, dt, fx) {
      scr.offset.y = (t * 0.02) % 1;
      steam(fx, dt);
      shake = Math.max(0, shake - dt);
      net.rotation.x = Math.sin(t * 40) * 0.03 * shake;
    },
    bounce(p, smash, fx) {
      fx?.hit((emit) => emit({ tex: 'sticky', n: smash ? 3 : 1, color: noteCol, size: 0.04, life: 1.2, speed: 0.5, up: 0.9, g: 1.4, drag: 2.0, wob: 0.25, spin: 2.5, spread: 0.02 }), [p[0], TY + 0.03, p[2]], 0);
      if (Math.abs(p[2]) < 0.6) shake = 0.35;
    },
  };
}

/* ═════════════ 2. 택배 상자 ═════════════ */
function parcel(root) {
  const kraft = '#b98652';
  const topTex = canvasTex('parcel-top', PX, PZ, (g, w, h) => {
    const r = rng(41);
    g.fillStyle = kraft; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(90,55,20,${0.03 + r() * 0.04})`; g.fillRect(x, 0, 1, h); } // 골판지 결
    speckle(g, w, h, r, 1500, ['rgba(70,40,10,0.12)', 'rgba(255,230,190,0.1)'], [1, 3]);
    g.fillStyle = 'rgba(60,35,10,0.35)'; g.fillRect(w / 2 - 1, 0, 2, h); // 날개가 만나는 틈
    const tg = g.createLinearGradient(w / 2 - 22, 0, w / 2 + 22, 0); // 박스테이프 (반짝)
    tg.addColorStop(0, 'rgba(214,160,80,0.75)'); tg.addColorStop(0.5, 'rgba(240,200,130,0.85)'); tg.addColorStop(1, 'rgba(214,160,80,0.75)');
    g.fillStyle = tg; g.fillRect(w / 2 - 22, 0, 44, h);
    g.strokeStyle = 'rgba(255,240,210,0.5)'; g.lineWidth = 1; for (const x of [w / 2 - 22, w / 2 + 22]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = 'rgba(60,35,10,0.5)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5); // 모서리 접힘
    // '취급주의' 스티커 (모서리)
    g.save(); g.translate(w * 0.83, h * 0.82); g.rotate(-0.12);
    g.fillStyle = '#e8473a'; rr(g, -42, -26, 84, 52, 6); g.fill();
    text(g, '취급주의', 0, -6, 20, '#fff'); text(g, 'FRAGILE', 0, 14, 12, '#ffe3df');
    g.restore();
    g.fillStyle = 'rgba(60,35,10,0.18)'; // 신발 자국 (누가 밟았나)
    rr(g, w * 0.12, h * 0.2, 34, 70, 16); g.fill();
  });
  const sideTex = canvasTex('parcel-side', 512, 256, (g, w, h) => {
    const r = rng(42);
    g.fillStyle = kraft; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(90,55,20,${0.03 + r() * 0.04})`; g.fillRect(x, 0, 1, h); }
    const ink = '#4a3020';
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 5;
    for (const x of [60, 100]) { g.beginPath(); g.moveTo(x, 130); g.lineTo(x, 60); g.stroke(); g.beginPath(); g.moveTo(x - 16, 78); g.lineTo(x, 56); g.lineTo(x + 16, 78); g.stroke(); }
    text(g, '이쪽이 위', 80, 160, 22, ink);
    // 깨지는 유리잔 그림 + 우산 그림
    g.beginPath(); g.moveTo(170, 70); g.lineTo(210, 70); g.lineTo(200, 110); g.lineTo(180, 110); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(190, 110); g.lineTo(190, 140); g.moveTo(176, 140); g.lineTo(204, 140); g.moveTo(186, 76); g.lineTo(193, 90); g.lineTo(186, 100); g.stroke();
    g.beginPath(); g.arc(260, 100, 28, Math.PI, 0); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(260, 100); g.lineTo(260, 136); g.arc(252, 136, 8, 0, Math.PI); g.stroke();
    text(g, '탁구공 · 9,999개입', 400, 70, 26, ink);
    text(g, '준비하시고 스매시 물류', 400, 106, 18, ink);
    g.fillStyle = '#f8f5ee'; rr(g, 330, 140, 150, 80, 6); g.fill(); // 송장
    g.fillStyle = '#222'; for (let i = 0; i < 34; i++) { const bw = 1 + Math.floor(r() * 3); g.fillRect(342 + i * 3.8, 186, bw, 26); }
    text(g, '받는 분: 쉬는 시간', 405, 160, 15, '#333');
    g.strokeStyle = 'rgba(60,35,10,0.5)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
  const side = lam('#ffffff', { map: sideTex });
  const plain = lam(kraft);
  const halves = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.z = s * (HL / 2 + 0.003);
    root.add(g);
    // 몸통 (윗면은 softTop이 덮는다). 옆면 그림은 +x·-x·끝 면에
    put(g, new THREE.BoxGeometry(TABLE_W, TY - 0.002, HL - 0.006), [side, side, plain, plain, s > 0 ? side : plain, s < 0 ? side : plain], 0, (TY - 0.002) / 2, 0);
    const top = softTop(g, TABLE_W, HL - 0.006, lam('#ffffff', { map: topTex }), { radius: 0.13 });
    if (s < 0) top.rotation.y = Math.PI;
    halves.push({ g, top, s, sq: 0 });
  }
  // 네트 = 박스테이프 세 줄 (반투명, 틈으로 보임) + 종이 심 기둥 + 테이프 롤
  const tapeMat = new THREE.MeshPhongMaterial({ color: '#d9a85a', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, shininess: 100, specular: '#fff6dd' });
  const strands = [];
  for (const y of [0.04, 0.09, NET_H - 0.012]) {
    const geo = new THREE.PlaneGeometry(1.83, 0.026, 16, 1);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setY(i, pa.getY(i) - 0.007 * (1 - (x / 0.915) ** 2)); }
    strands.push(put(root, geo, tapeMat, 0, TY + y, 0, { shadow: false }));
  }
  const tube = lam('#a8783f');
  for (const x of [-0.93, 0.93]) {
    cyl(root, 0.028, 0.028, TY + NET_H + 0.02, tube, x, (TY + NET_H + 0.02) / 2, 0);
    cyl(root, 0.02, 0.02, 0.002, lam('#3b2a18'), x, TY + NET_H + 0.021, 0, { shadow: false });
    // 테이프 롤
    put(root, new THREE.TorusGeometry(0.05, 0.022, 10, 24), new THREE.MeshPhongMaterial({ color: '#c99446', shininess: 80, transparent: true, opacity: 0.92 }), x, TY + NET_H - 0.06, 0, { ry: Math.PI / 2 });
  }
  const tab = put(root, new THREE.PlaneGeometry(0.05, 0.026), tapeMat, 0.93, TY + NET_H - 0.012, 0.03, { shadow: false, ry: -Math.PI / 2 }); // 덜렁거리는 테이프 끝
  // 옆 소품: 작은 상자 더미(-x), 뽁뽁이 롤(+x, 낮음)
  const small = lam(kraft);
  for (const [x, y, z, sz, ry] of [[-(HW + 0.32), 0.17, 0.5, 0.34, 0.1], [-(HW + 0.3), 0.47, 0.48, 0.26, -0.2], [-(HW + 0.36), 0.14, -0.3, 0.28, 0.4]]) {
    const b = box(root, sz, sz, sz, small, x, y, z);
    b.rotation.y = ry;
    box(b, sz + 0.002, 0.004, 0.06, tapeMat, 0, sz / 2, 0, { shadow: false });
  }
  const wrapTex = canvasTex('bubblewrap', 128, 128, (g, w, h) => {
    g.fillStyle = 'rgba(220,240,255,0.5)'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 16 : 8; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  }, { repeat: true });
  wrapTex.repeat.set(4, 2);
  put(root, new THREE.CylinderGeometry(0.12, 0.12, 0.5, 20), new THREE.MeshPhongMaterial({ map: wrapTex, transparent: true, opacity: 0.85, shininess: 90 }), HW + 0.33, 0.12, -0.6, { rz: Math.PI / 2, ry: 0.4 });

  return {
    tick(t, dt) {
      tab.rotation.x = Math.sin(t * 3.1) * 0.35 + Math.sin(t * 7.3) * 0.1;
      for (const h of halves) {
        h.top.userData.update(dt);
        h.sq = Math.max(0, h.sq - dt);
        const k = h.sq > 0 ? Math.sin((0.5 - h.sq) * 18) * h.sq * 0.05 : 0;
        h.g.scale.set(1 + k * 0.3, 1 - k, 1 + k * 0.3);
      }
    },
    bounce(p, smash, fx) {
      const h = halves.find((o) => Math.sign(p[2]) === o.s) || halves[0];
      // softTop은 반쪽 그룹 안 좌표 (뒤집힌 쪽은 x·z가 반대)
      const lx = h.s < 0 ? -p[0] : p[0], lz = (p[2] - h.g.position.z) * (h.s < 0 ? -1 : 1);
      h.top.userData.press(lx, lz, smash ? 0.03 : 0.018);
      h.sq = 0.5;
      fx?.hit((emit) => emit({ tex: 'puff', n: smash ? 3 : 2, color: '#e7cfa5', size: 0.05, grow: 2, life: 0.7, speed: 0.25, up: 0.25, alpha: 0.35, spread: 0.03 }), [p[0], TY + 0.01, p[2]], 0);
    },
  };
}

/* ═════════════ 3. 급식판 ═════════════ */
function lunchTray(root) {
  // 스테인리스 판 + 눌러 찍은 칸 (반쪽마다: 끝 쪽에 밥·국 큰 칸, 네트 쪽에 반찬 세 칸)
  const tex = canvasTex('tray-top', PX, PZ, (g, w, h) => {
    const r = rng(51);
    g.fillStyle = '#9aa2aa'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { g.fillStyle = `rgba(255,255,255,${r() * 0.06})`; g.fillRect(0, y, w, 1); } // 헤어라인
    const pit = (x, y, cw, ch, rad) => { // 눌린 칸: 어두운 바닥 + 위쪽 그늘 + 아래쪽 빛
      const gr = g.createLinearGradient(0, y, 0, y + ch);
      gr.addColorStop(0, '#7b838b'); gr.addColorStop(0.15, '#8a929a'); gr.addColorStop(1, '#949ca4');
      g.fillStyle = gr; rr(g, x, y, cw, ch, rad); g.fill();
      g.lineWidth = 4; g.strokeStyle = 'rgba(40,45,52,0.45)'; rr(g, x, y, cw, ch, rad); g.stroke();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.55)'; rr(g, x + 3, y + 3, cw - 6, ch - 6, rad - 3); g.stroke();
    };
    const m = 26, gap = 18;
    const sh = h * 0.34; // 반찬 칸 높이 (위 = 네트 쪽)
    const sw = (w - m * 2 - gap * 2) / 3;
    for (let i = 0; i < 3; i++) pit(m + i * (sw + gap), m, sw, sh, 26);
    const by = m + sh + gap, bh = h - by - m;
    pit(m, by, (w - m * 2 - gap) * 0.55, bh, 40);
    pit(m + (w - m * 2 - gap) * 0.55 + gap, by, (w - m * 2 - gap) * 0.45, bh, 60);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = 'rgba(255,255,255,0.18)'; text(g, '○○초등학교', w - 70, h - 13, 13, 'rgba(60,66,74,0.6)');
  });
  const steelTop = new THREE.MeshPhongMaterial({ color: '#ffffff', map: tex, shininess: 70, specular: '#9aa0a8' });
  const steel = shiny('#b7bec5', 90);
  for (const s of [-1, 1]) {
    const m = put(root, new THREE.PlaneGeometry(TABLE_W, HL), steelTop, 0, TY, s * HL / 2, { shadow: false, rx: -Math.PI / 2 });
    if (s < 0) m.rotation.z = Math.PI; // 네트 쪽이 반찬 칸이 되게 뒤집기
  }
  box(root, TABLE_W, 0.02, TABLE_L, steel, 0, TY - 0.0105, 0);
  // 테두리 턱 (경계선 역할, 아주 낮게)
  for (const [w, d, x, z] of [[0.022, TABLE_L, -HW + 0.011, 0], [0.022, TABLE_L, HW - 0.011, 0], [TABLE_W, 0.022, 0, -HL + 0.011], [TABLE_W, 0.022, 0, HL - 0.011]]) box(root, w, 0.012, d, steel, x, TY + 0.003, z, { shadow: false });
  // 아래: 배식 수레 (사각 파이프 + 아래 선반 + 쌓은 식판 + 우유 상자)
  const pipe = shiny('#a9b0b8', 70);
  for (const x of [-0.7, 0.7]) for (const z of [-1.28, 1.28]) {
    box(root, 0.04, TY - 0.02, 0.04, pipe, x, (TY - 0.02) / 2, z);
    put(root, new THREE.SphereGeometry(0.03, 10, 8), lam('#2d2f33'), x, 0.03, z); // 바퀴
  }
  for (const y of [0.2, TY - 0.05]) { box(root, 1.44, 0.03, 0.03, pipe, 0, y, -1.28); box(root, 1.44, 0.03, 0.03, pipe, 0, y, 1.28); box(root, 0.03, 0.03, 2.56, pipe, -0.7, y, 0); box(root, 0.03, 0.03, 2.56, pipe, 0.7, y, 0); }
  box(root, 1.4, 0.012, 2.52, shiny('#8f979f', 60), 0, 0.21, 0);
  for (let i = 0; i < 6; i++) box(root, 0.46, 0.018, 0.62, steel, -0.35, 0.226 + i * 0.02, 0.6 + (i % 2) * 0.01);
  const milkTex = canvasTex('milk', 128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f6fe0'; g.fillRect(0, h * 0.55, w, h * 0.45);
    text(g, '우유', w / 2, h * 0.3, 40, '#2f6fe0'); text(g, '200ml', w / 2, h * 0.75, 22, '#fff');
  });
  const milk = lam('#ffffff', { map: milkTex });
  const crateX = 0.3, crateZ = -0.6;
  const crate = new THREE.MeshLambertMaterial({ color: '#ffd23d' });
  box(root, 0.5, 0.012, 0.36, crate, crateX, 0.222, crateZ);
  for (const [w, d, x, z] of [[0.5, 0.012, 0, -0.174], [0.5, 0.012, 0, 0.174], [0.012, 0.36, -0.244, 0], [0.012, 0.36, 0.244, 0]]) box(root, w, 0.14, d, crate, crateX + x, 0.29, crateZ + z);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const mx = crateX - 0.18 + i * 0.12, mz = crateZ - 0.11 + j * 0.11;
    box(root, 0.07, 0.11, 0.07, milk, mx, 0.285, mz);
    put(root, new THREE.CylinderGeometry(0.0001, 0.05, 0.035, 4, 1), lam('#ffffff'), mx, 0.358, mz, { ry: Math.PI / 4 });
  }
  // 네트 = 숟가락 기둥 + 젓가락 두 줄 (사이가 비어 공이 보임)
  const spoon = shiny('#cfd5dc', 110);
  for (const x of [-0.915, 0.915]) {
    box(root, 0.024, 0.2, 0.008, spoon, x, TY + 0.06, 0);
    const bowl = put(root, new THREE.SphereGeometry(0.05, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#cfd5dc', shininess: 110, specular: '#ffffff', side: THREE.DoubleSide }), x, TY + 0.2, 0, { rx: Math.PI / 2 });
    bowl.scale.set(1, 0.3, 1.3);
    box(root, 0.04, 0.012, 0.08, steel, x, TY - 0.03, 0); // 집게
  }
  for (const y of [0.07, NET_H - 0.006]) {
    const c = put(root, new THREE.CylinderGeometry(0.005, 0.007, 1.86, 4), spoon, 0, TY + y, 0, { rz: Math.PI / 2, rx: Math.PI / 4 });
    c.scale.set(1, 1, 0.6);
  }
  // 옆 소품 (-x): 국통 (김이 모락모락)
  const px = -(HW + 0.38), pz = 0.25;
  cyl(root, 0.2, 0.19, 0.42, steel, px, 0.21, pz, {}, 28);
  cyl(root, 0.19, 0.19, 0.005, lam('#c4572e'), px, 0.4, pz, { shadow: false }, 28); // 국 (빨간 국물)
  for (const s of [-1, 1]) put(root, new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI), steel, px, 0.36, pz + s * 0.2, { ry: Math.PI / 2 });
  const lid = cyl(root, 0.205, 0.205, 0.012, steel, px + 0.05, 0.44, pz + 0.03, {}, 28);
  lid.rotation.z = 0.25;
  const ladle = cyl(root, 0.008, 0.008, 0.5, steel, px + 0.06, 0.55, pz - 0.05);
  ladle.rotation.set(0.3, 0, -0.35);
  const steam = steamer([px, 0.44, pz], { every: 0.35, size: 0.08, up: 0.2, alpha: 0.3, life: 2.0 });
  return {
    tick(t, dt, fx) { steam(fx, dt); },
    bounce(p, smash, fx) {
      fx?.hit((emit) => {
        emit({ tex: 'star4', n: smash ? 3 : 1, color: '#ffffff', size: smash ? 0.09 : 0.06, grow: 0.4, life: 0.35, speed: smash ? 0.5 : 0.05, up: 0.1, add: true, spin: 3, spread: 0.02 });
        emit({ tex: 'ring', n: 1, color: '#dfe8f2', size: 0.03, grow: 4, life: 0.3, speed: 0, up: 0, add: true, alpha: 0.6 });
      }, [p[0], TY + 0.012, p[2]], 0);
    },
  };
}

/* ═════════════ 4. 침대 ═════════════ */
function bed(root) {
  // 이불: 남색 누빔 + 작은 별·달 (공보다 흐리게) + 크림색 테두리(경계선)
  const quilt = canvasTex('bed-quilt', PX, PZ * 2, (g, w, h) => {
    const r = rng(61);
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#33437a'); gr.addColorStop(1, '#2a3868');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,205,255,0.16)'; g.lineWidth = 2; g.setLineDash([6, 5]);
    const step = 64;
    for (let i = -h; i < w + h; i += step) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.setLineDash([]);
    const star = (x, y, s) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); };
    for (let i = 0; i < 46; i++) {
      const x = 30 + r() * (w - 60), y = 30 + r() * (h - 60);
      g.fillStyle = `rgba(232,214,150,${0.35 + r() * 0.2})`;
      if (r() < 0.75) star(x, y, 5 + r() * 4);
      else { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2f3f72'; g.beginPath(); g.arc(x + 4, y - 3, 7, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = '#f1e6cc'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  });
  const qm = lam('#ffffff', { map: quilt });
  // 누빔: 마름모 칸마다 살짝 볼록 (보기만, 6mm)
  const puffy = (x, z) => {
    const a = (x + z) / 0.13 * Math.PI, b = (x - z) / 0.13 * Math.PI;
    return 0.004 * (1 - Math.abs(Math.cos(a))) * (1 - Math.abs(Math.cos(b))) * smooth(0, 0.04, HW - Math.abs(x)) * smooth(0, 0.04, HL - Math.abs(z));
  };
  const top = softTop(root, TABLE_W, TABLE_L, qm, { y: TY - 0.002, segW: 44, segL: 80, radius: 0.18, shape: puffy });
  const duvet = lam('#2e3c6b');
  const pip = lam('#f1e6cc');
  for (const [w, d, x, z] of [[0.012, TABLE_L, -HW - 0.006, 0], [0.012, TABLE_L, HW + 0.006, 0], [TABLE_W + 0.024, 0.012, 0, -HL - 0.006], [TABLE_W + 0.024, 0.012, 0, HL + 0.006]]) {
    box(root, w, 0.17, d, duvet, x, TY - 0.09, z); // 이불이 옆으로 늘어짐
    box(root, w + 0.004, 0.012, d + 0.004, pip, x, TY - 0.004, z, { shadow: false });
  }
  box(root, TABLE_W - 0.02, TY - 0.44, TABLE_L - 0.02, lam('#efe9df'), 0, 0.42 + (TY - 0.44) / 2 - 0.01, 0); // 매트리스
  const oak = lam('#b07a48');
  box(root, TABLE_W + 0.08, 0.22, TABLE_L + 0.08, oak, 0, 0.31, 0); // 침대 틀
  box(root, TABLE_W + 0.1, 0.03, TABLE_L + 0.1, lam('#9a6a3c'), 0, 0.42, 0);
  for (const x of [-0.75, 0.75]) for (const z of [-1.36, 1.36]) cyl(root, 0.035, 0.03, 0.2, oak, x, 0.1, z);
  // 네트 = 낮은 베개 줄 + 모기장 (비쳐 보임) + 침대 기둥
  const pillowCol = ['#ffc4d6', '#c6f0de', '#d8cbff', '#fff0a8'];
  const pillows = [];
  // 베개 모양: 상자를 가운데는 볼록, 가장자리는 얇게 (네 귀퉁이가 뾰족 나온 진짜 베개처럼)
  const pg = new THREE.BoxGeometry(1, 1, 1, 16, 6, 12);
  const pa = pg.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i) * 2, y = pa.getY(i), z = pa.getZ(i) * 2;
    const t = (1 - x ** 4) * (1 - z ** 4);
    pa.setY(i, y * (0.18 + 0.82 * t));
    pa.setX(i, pa.getX(i) * (1 - 0.06 * z * z)); pa.setZ(i, pa.getZ(i) * (1 - 0.1 * x * x));
  }
  pg.computeVertexNormals();
  for (let i = 0; i < 4; i++) {
    const pl = put(root, pg, lam(pillowCol[i]), -0.54 + i * 0.36, TY + 0.03, 0);
    pl.scale.set(0.32, 0.075, 0.2);
    pl.rotation.y = (i % 2 ? 1 : -1) * 0.06;
    pillows.push(pl);
  }
  const lace = canvasTex('bed-net', 256, 64, (g, w, h) => {
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.95)'; for (let x = 0; x < w; x += 16) { g.beginPath(); g.arc(x + 8, 3, 6, 0, Math.PI); g.fill(); }
  });
  put(root, new THREE.PlaneGeometry(1.83, NET_H), new THREE.MeshBasicMaterial({ map: lace, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, color: '#f6f2ff' }), 0, TY + NET_H / 2, 0, { shadow: false });
  box(root, 1.84, 0.01, 0.01, pip, 0, TY + NET_H, 0, { shadow: false });
  for (const x of [-0.92, 0.92]) {
    const pts = [[0.03, 0], [0.03, 0.2], [0.04, 0.24], [0.024, 0.3], [0.024, TY + NET_H - 0.02], [0.034, TY + NET_H], [0.0, TY + NET_H + 0.012]].map(([a, b]) => new THREE.Vector2(a, b));
    put(root, new THREE.LatheGeometry(pts, 16), oak, x, 0, 0);
    put(root, new THREE.SphereGeometry(0.035, 16, 12), oak, x, TY + NET_H + 0.03, 0);
  }
  // 옆 소품 (-x): 협탁 + 스탠드 + 자명종 / (+x): 토끼 슬리퍼
  const nx = -(HW + 0.36), nz = -0.95;
  box(root, 0.4, 0.5, 0.4, oak, nx, 0.25, nz);
  box(root, 0.006, 0.16, 0.34, lam('#9a6a3c'), nx + 0.203, 0.36, nz, { shadow: false });
  put(root, new THREE.SphereGeometry(0.018, 10, 8), shiny('#e0c070', 80), nx + 0.212, 0.36, nz);
  cyl(root, 0.06, 0.07, 0.03, lam('#e9dfcc'), nx - 0.06, 0.515, nz - 0.06);
  cyl(root, 0.012, 0.012, 0.28, shiny('#c9a85c', 80), nx - 0.06, 0.66, nz - 0.06);
  cyl(root, 0.08, 0.13, 0.16, new THREE.MeshLambertMaterial({ color: '#fff1cc', emissive: '#ffcf7a', emissiveIntensity: 0.55 }), nx - 0.06, 0.82, nz - 0.06, {}, 24);
  const clock = new THREE.Group();
  clock.position.set(nx + 0.08, 0.56, nz + 0.08);
  root.add(clock);
  put(clock, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 24), lam('#e94f5a'), 0, 0, 0, { rz: Math.PI / 2 });
  put(clock, new THREE.CircleGeometry(0.042, 24), lam('#ffffff'), 0.0155, 0, 0, { ry: Math.PI / 2, shadow: false });
  for (const s of [-1, 1]) put(clock, new THREE.SphereGeometry(0.024, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), shiny('#f4c64a', 90), 0, 0.045, s * 0.03, { rx: s * 0.5 });
  for (const s of [-1, 1]) cyl(clock, 0.004, 0.004, 0.03, lam('#333'), 0, -0.055, s * 0.03);
  box(clock, 0.002, 0.03, 0.004, lam('#222'), 0.017, 0.012, 0, { shadow: false });
  box(clock, 0.002, 0.004, 0.024, lam('#222'), 0.017, 0, 0.01, { shadow: false });
  const pink = lam('#ffd0dc');
  for (const s of [-1, 1]) {
    const sx = HW + 0.32 + s * 0.08, sz = 0.95;
    const sole = put(root, roundBox(0.11, 0.03, 0.26, 0.05, 0.01), lam('#f7a9bf'), sx, 0.015, sz);
    sole.rotation.y = s * 0.1;
    const up = put(root, new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pink, sx, 0.03, sz - 0.05);
    up.scale.set(0.95, 0.9, 1.2);
    for (const e of [-1, 1]) { const ear = put(root, new THREE.SphereGeometry(0.02, 10, 8), pink, sx + e * 0.022, 0.1, sz - 0.07); ear.scale.set(0.6, 1.8, 0.4); ear.rotation.z = -e * 0.25; }
    for (const e of [-1, 1]) put(root, new THREE.SphereGeometry(0.006, 8, 6), lam('#2b2a33'), sx + e * 0.018, 0.075, sz - 0.11);
  }
  let zt = 1.5, ring = 4;
  return {
    tick(t, dt, fx) {
      top.userData.update(dt);
      zt -= dt;
      if (zt < 0 && fx) { // 베개에서 Z가 하나씩 둥실
        zt = 2.2 + Math.random() * 1.5;
        const pl = pillows[Math.floor(Math.random() * pillows.length)];
        fx.hit((emit) => emit({ tex: 'zz', n: 1, color: '#dfe6ff', size: 0.045, grow: 1.4, life: 1.8, speed: 0.02, up: 0.14, g: -0.02, drag: 0.5, wob: 0.06, alpha: 0.8, rot: 0.2 }), [pl.position.x, TY + 0.09, 0], 0);
      }
      ring -= dt; // 가끔 자명종이 덜덜
      if (ring < 0) ring = 7 + Math.random() * 5;
      clock.rotation.x = ring < 0.8 ? Math.sin(t * 60) * 0.12 : 0;
      for (const [i, pl] of pillows.entries()) pl.scale.y = 0.075 * (1 + Math.sin(t * 1.3 + i) * 0.04); // 숨 쉬듯
    },
    bounce(p, smash, fx) {
      top.userData.press(p[0], p[2], smash ? 0.035 : 0.022);
      fx?.hit((emit) => emit({ tex: 'puff', n: 1, color: '#f4f0ff', size: 0.05, grow: 2, life: 0.6, speed: 0.15, up: 0.2, alpha: 0.25 }), [p[0], TY + 0.01, p[2]], 0);
    },
  };
}

/* ═════════════ 5. 바둑판 ═════════════ */
function goBoard(root) {
  const tex = canvasTex('go-top', PX, PZ, (g, w, h) => {
    const r = rng(71);
    g.fillStyle = '#b8843f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { // 곧은 나뭇결 (판 길이 방향)
      const x = r() * w;
      g.strokeStyle = r() < 0.6 ? `rgba(110,65,20,${0.08 + r() * 0.12})` : `rgba(240,200,140,${0.06 + r() * 0.08})`;
      g.lineWidth = 0.5 + r() * 2.5;
      g.beginPath(); for (let y = 0; y <= h; y += 10) g.lineTo(x + Math.sin(y * 0.01 + i) * 2, y); g.stroke();
    }
    const m = 22, nx = 19, nz = 17;
    g.strokeStyle = 'rgba(25,15,5,0.85)'; g.lineWidth = 1.6;
    for (let i = 0; i < nx; i++) { const x = m + (i / (nx - 1)) * (w - m * 2); g.beginPath(); g.moveTo(x, m); g.lineTo(x, h - m); g.stroke(); }
    for (let j = 0; j < nz; j++) { const y = m + (j / (nz - 1)) * (h - m * 2); g.beginPath(); g.moveTo(m, y); g.lineTo(w - m, y); g.stroke(); }
    g.lineWidth = 3; g.strokeRect(m, m, w - m * 2, h - m * 2);
    g.fillStyle = 'rgba(25,15,5,0.9)';
    for (const i of [3, 9, 15]) for (const j of [3, 8, 13]) { g.beginPath(); g.arc(m + (i / 18) * (w - m * 2), m + (j / 16) * (h - m * 2), 4.5, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(70,40,12,0.6)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, w - 5, h - 5);
  });
  const sideTex = canvasTex('go-side', 256, 64, (g, w, h) => {
    const r = rng(72);
    g.fillStyle = '#a5732f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,50,15,${0.1 + r() * 0.15})`; g.lineWidth = 1; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + r() * 4 - 2); g.stroke(); }
  });
  const topM = lam('#ffffff', { map: tex }), sideM = lam('#ffffff', { map: sideTex });
  const th = 0.16;
  for (const s of [-1, 1]) {
    const zc = s * (HL / 2 + 0.002);
    put(root, new THREE.BoxGeometry(TABLE_W, th, HL - 0.004), [sideM, sideM, topM, sideM, sideM, sideM], 0, TY - th / 2, zc);
    // 치자 열매 모양 다리
    const pts = [[0.0, 0], [0.06, 0], [0.085, 0.04], [0.1, 0.12], [0.095, 0.22], [0.075, 0.3], [0.05, 0.36], [0.04, 0.4], [0.06, 0.44], [0.075, TY - th]].map(([a, b]) => new THREE.Vector2(a, b));
    const leg = new THREE.LatheGeometry(pts, 20);
    for (const x of [-0.55, 0.55]) for (const dz of [-0.42, 0.42]) put(root, leg, lam('#9a6a32'), x, 0, zc + dz);
  }
  // 네트 = 바둑돌 탑 8개 (흑·백 번갈아, 사이가 비어 보임)
  const black = shiny('#1d1d22', 70), white = shiny('#f3f1ea', 50);
  const stoneGeo = new THREE.SphereGeometry(0.032, 18, 10);
  const towers = [];
  const r = rng(73);
  for (let i = 0; i < 8; i++) {
    const tw = new THREE.Group();
    tw.position.set(-0.7 + i * 0.2, TY, 0);
    root.add(tw);
    const stones = [];
    for (let k = 0; k < 6; k++) {
      const st = put(tw, stoneGeo, (i + k) % 2 ? white : black, (r() - 0.5) * 0.008, 0.0122 + k * 0.0243, (r() - 0.5) * 0.008);
      st.scale.y = 0.38;
      st.userData.bx = st.position.x;
      stones.push(st);
    }
    towers.push({ tw, stones, kick: 0 });
  }
  // 옆 소품 (-x): 낮은 탁자 위 바둑통 둘 + 찻잔 / (+x): 방석
  const tx = -(HW + 0.36), tz = 0.35;
  box(root, 0.42, 0.04, 0.6, lam('#6b4226'), tx, 0.42, tz);
  for (const [x, z] of [[-0.17, -0.26], [0.17, -0.26], [-0.17, 0.26], [0.17, 0.26]]) box(root, 0.04, 0.4, 0.04, lam('#5a3620'), tx + x, 0.2, tz + z);
  const bowlPts = [[0, 0], [0.07, 0], [0.1, 0.03], [0.11, 0.07], [0.1, 0.11], [0.085, 0.12]].map(([a, b]) => new THREE.Vector2(a, b));
  const lidPts = [[0.088, 0], [0.1, 0.005], [0.09, 0.03], [0.05, 0.045], [0, 0.048]].map(([a, b]) => new THREE.Vector2(a, b));
  const mulberry = shiny('#7a4a26', 40);
  for (const [dz, col] of [[-0.14, black], [0.1, white]]) {
    put(root, new THREE.LatheGeometry(bowlPts, 24), mulberry, tx, 0.44, tz + dz);
    if (dz < 0) put(root, new THREE.LatheGeometry(lidPts, 24), mulberry, tx, 0.56, tz + dz);
    else {
      put(root, new THREE.LatheGeometry(lidPts, 24), mulberry, tx + 0.1, 0.49, tz + 0.21, { rx: Math.PI }); // 뒤집어 놓은 뚜껑에 딴 돌
      for (let k = 0; k < 5; k++) { const st = put(root, stoneGeo, black, tx + 0.08 + (k % 3) * 0.025, 0.47, tz + 0.2 + Math.floor(k / 3) * 0.03); st.scale.set(0.7, 0.27, 0.7); }
      for (let k = 0; k < 7; k++) { const st = put(root, stoneGeo, col, tx + ((k * 37) % 9 - 4) * 0.012, 0.552, tz + dz + ((k * 53) % 9 - 4) * 0.012); st.scale.set(0.75, 0.29, 0.75); }
    }
  }
  const cup = lam('#e8efe6');
  cyl(root, 0.035, 0.028, 0.06, cup, tx + 0.12, 0.47, tz + 0.02, {}, 18);
  cyl(root, 0.032, 0.032, 0.002, lam('#9fb86a'), tx + 0.12, 0.495, tz + 0.02, { shadow: false }, 18);
  const cush = put(root, roundBox(0.48, 0.07, 0.48, 0.12, 0.03), lam('#7a4fa0'), HW + 0.4, 0.035, -0.55);
  cush.rotation.y = 0.3;
  put(root, new THREE.TorusGeometry(0.1, 0.008, 6, 24), shiny('#e8c25a', 80), HW + 0.4, 0.071, -0.55, { rx: Math.PI / 2 });
  const steam = steamer([tx + 0.12, 0.5, tz + 0.02], { every: 0.55, size: 0.035, up: 0.1, alpha: 0.26 });
  return {
    tick(t, dt, fx) {
      steam(fx, dt);
      for (const tw of towers) {
        if (tw.kick <= 0) continue;
        tw.kick = Math.max(0, tw.kick - dt * 1.6);
        tw.stones.forEach((st, k) => {
          const a = tw.kick * k * 0.0016;
          st.position.x = st.userData.bx + Math.sin(t * 38 + k) * a;
          st.rotation.z = Math.sin(t * 38 + k + 1) * a * 8;
        });
      }
    },
    bounce(p, smash, fx) {
      for (const tw of towers) {
        const d = Math.hypot(tw.tw.position.x - p[0], p[2]);
        tw.kick = Math.max(tw.kick, Math.max(0, 1 - d / 1.1) * (smash ? 1.6 : 1));
      }
      fx?.hit((emit) => emit({ tex: 'ring', n: 1, color: '#f7dfae', size: 0.03, grow: 3.5, life: 0.35, speed: 0, up: 0, alpha: 0.6 }), [p[0], TY + 0.005, p[2]], 0);
    },
  };
}

/* ═════════════ 6. 시골 평상 ═════════════ */
function pyeongsang(root) {
  const plankTex = canvasTex('pyeong-plank', 64, 512, (g, w, h) => {
    const r = rng(81);
    g.fillStyle = '#8f6c46'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = r() < 0.5 ? `rgba(70,45,22,${0.12 + r() * 0.15})` : `rgba(190,170,140,${0.08 + r() * 0.1})`; // 빛바랜 회색 결
      g.lineWidth = 0.5 + r() * 2;
      const x = r() * w; g.beginPath(); for (let y = 0; y <= h; y += 8) g.lineTo(x + Math.sin(y * 0.02 + i) * 1.5, y); g.stroke();
    }
    speckle(g, w, h, r, 300, ['rgba(60,40,20,0.15)', 'rgba(200,190,170,0.1)']);
    g.fillStyle = 'rgba(40,30,20,0.8)'; for (const y of [10, h / 2, h - 10]) for (const x of [12, w - 12]) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); } // 못
    g.fillStyle = 'rgba(50,32,15,0.35)'; g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h); // 널빤지 양옆 그늘
  });
  const N = 8, gap = 0.008, pw = (TABLE_W - gap * (N - 1)) / N;
  const planks = [];
  const side = lam('#7a5a38');
  for (let i = 0; i < N; i++) {
    const t = plankTex.clone(); t.needsUpdate = true; t.offset.set(0, (i * 0.37) % 1); t.wrapT = THREE.RepeatWrapping; t.wrapS = THREE.RepeatWrapping;
    const m = lam('#ffffff', { map: t });
    const pl = put(root, new THREE.BoxGeometry(pw, 0.035, TABLE_L), [side, side, m, side, side, side], -HW + pw / 2 + i * (pw + gap), TY - 0.0175, 0);
    planks.push({ m: pl, v: 0, y: 0 });
  }
  box(root, TABLE_W - 0.02, 0.01, TABLE_L - 0.02, lam('#2b2016'), 0, TY - 0.03, 0, { shadow: false }); // 틈 사이로 보이는 어둠
  const beam = lam('#6a4a2c');
  for (const [w, d, x, z] of [[0.07, TABLE_L, -HW + 0.035, 0], [0.07, TABLE_L, HW - 0.035, 0], [TABLE_W, 0.07, 0, -HL + 0.035], [TABLE_W, 0.07, 0, HL - 0.035], [TABLE_W, 0.07, 0, 0]]) box(root, w, 0.11, d, beam, x, TY - 0.09, z);
  for (const x of [-0.68, 0.68]) for (const z of [-1.28, 0, 1.28]) box(root, 0.09, TY - 0.1, 0.09, beam, x, (TY - 0.1) / 2, z);
  for (const z of [-1.28, 1.28]) box(root, 1.3, 0.05, 0.05, beam, 0, 0.18, z);
  // 네트 = 대나무 기둥 + 새끼줄 + 세워 둔 수박 조각
  const bamboo = lam('#b7b05a'), node = lam('#8e8a3c');
  for (const x of [-0.93, 0.93]) {
    cyl(root, 0.022, 0.025, TY + NET_H + 0.08, bamboo, x, (TY + NET_H + 0.08) / 2, 0);
    for (let y = 0.2; y < TY + NET_H + 0.05; y += 0.22) cyl(root, 0.027, 0.027, 0.012, node, x, y, 0);
  }
  const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.93, TY + NET_H, 0), new THREE.Vector3(0, TY + NET_H - 0.012, 0), new THREE.Vector3(0.93, TY + NET_H, 0)]);
  const ropeTex = canvasTex('rope', 64, 16, (g, w, h) => { g.fillStyle = '#c9a86a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(110,80,35,0.6)'; g.lineWidth = 3; for (let x = -16; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, h); g.stroke(); } }, { repeat: true });
  ropeTex.repeat.set(40, 1);
  put(root, new THREE.TubeGeometry(rope, 40, 0.007, 6), lam('#ffffff', { map: ropeTex }), 0, 0, 0, { shadow: false });
  // 수박 조각: 둥근 껍질이 아래, 뾰족한 끝이 위
  const wedge = new THREE.Shape();
  wedge.moveTo(0, 0.135);
  wedge.lineTo(0.06, 0.02);
  wedge.quadraticCurveTo(0, -0.012, -0.06, 0.02);
  wedge.closePath();
  const melonTex = canvasTex('melon', 128, 160, (g, w, h) => {
    const X = (x) => (x + 0.06) / 0.12 * w, Y = (y) => h - (y + 0.012) / 0.147 * h;
    const path = (sh) => { g.beginPath(); g.moveTo(X(0), Y(0.135 - sh)); g.lineTo(X(0.06 - sh), Y(0.02 + sh * 0.4)); g.quadraticCurveTo(X(0), Y(-0.012 + sh * 1.2), X(-0.06 + sh), Y(0.02 + sh * 0.4)); g.closePath(); };
    g.fillStyle = '#2f7a2e'; g.fillRect(0, 0, w, h);
    path(0.006); g.fillStyle = '#e9f2c8'; g.fill();
    path(0.014); g.fillStyle = '#ff4f5e'; g.fill();
    const r = rng(83);
    g.fillStyle = '#2a1a14';
    for (let i = 0; i < 9; i++) { const y = 0.04 + r() * 0.06, x = (r() - 0.5) * (0.13 - y) * 0.6; g.beginPath(); g.ellipse(X(x), Y(y), 3, 5, 0, 0, Math.PI * 2); g.fill(); }
  });
  melonTex.repeat.set(1 / 0.12, 1 / 0.147); melonTex.offset.set(0.5, 0.012 / 0.147);
  const rind = lam('#2f7a2e');
  const wedges = [];
  const wg = new THREE.ExtrudeGeometry(wedge, { depth: 0.026, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 10 });
  wg.translate(0, 0, -0.013);
  for (let i = 0; i < 6; i++) {
    const m = put(root, wg, [lam('#ffffff', { map: melonTex }), rind], -0.625 + i * 0.25, TY + 0.013, 0);
    m.scale.set(1.15, 1.05, 1);
    m.rotation.z = (i % 2 ? 1 : -1) * 0.05;
    wedges.push(m);
  }
  // 옆 소품 (-x): 모기향 (연기) + 밀짚모자(기둥 위) + 부채 / (+x): 고무신
  const mx = -(HW + 0.3), mz = 0.35;
  box(root, 0.2, 0.01, 0.2, shiny('#6f7780', 50), mx, 0.005, mz);
  const coil = [];
  for (let a = 0; a < Math.PI * 2 * 3.2; a += 0.15) { const rr2 = 0.012 + a * 0.0045; coil.push(new THREE.Vector3(mx + Math.cos(a) * rr2, 0.03, mz + Math.sin(a) * rr2)); }
  put(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.0045, 5), lam('#3f6b3a'), 0, 0, 0);
  const last = coil[coil.length - 1];
  const ember = put(root, new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff7a2a' }), last.x, last.y + 0.002, last.z, { shadow: false });
  const smoke = steamer([last.x, 0.05, last.z], { every: 0.3, color: '#d8d8d8', size: 0.03, up: 0.18, alpha: 0.35, life: 2.6, wob: 0.09 });
  const hat = new THREE.Group();
  hat.position.set(-0.93, TY + NET_H + 0.085, 0);
  root.add(hat);
  const straw = lam('#e3c77d');
  cyl(hat, 0.16, 0.16, 0.008, straw, 0, 0, 0, {}, 32);
  put(hat, new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), straw, 0, 0.004, 0).scale.y = 0.8;
  cyl(hat, 0.074, 0.074, 0.02, lam('#d8373f'), 0, 0.014, 0, {}, 24);
  hat.rotation.set(0.12, 0, 0.18);
  const fan = new THREE.Group();
  fan.position.set(-(HW + 0.16), 0.25, -0.55);
  root.add(fan);
  const fanTex = canvasTex('fan', 128, 128, (g, w, h) => {
    g.fillStyle = '#fff6e8'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8373f'; g.beginPath(); g.arc(64, 64, 34, Math.PI, 0); g.fill();
    g.fillStyle = '#2f5fbf'; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI); g.fill();
    g.fillStyle = '#d8373f'; g.beginPath(); g.arc(47, 64, 17, 0, Math.PI); g.fill();
    g.fillStyle = '#2f5fbf'; g.beginPath(); g.arc(81, 64, 17, Math.PI, 0); g.fill();
  });
  put(fan, new THREE.CircleGeometry(0.15, 28), lam('#ffffff', { map: fanTex, side: THREE.DoubleSide }), 0, 0.12, 0, { ry: Math.PI / 2 });
  cyl(fan, 0.008, 0.008, 0.28, lam('#a07040'), 0, -0.08, 0);
  fan.rotation.z = -0.25;
  for (const s of [-1, 1]) { // 고무신
    const g = new THREE.Group();
    g.position.set(HW + 0.3 + s * 0.07, 0, 0.85);
    g.rotation.y = s * 0.15;
    root.add(g);
    const shell = put(g, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#f4f4f0', side: THREE.DoubleSide }), 0, 0.055, 0);
    shell.scale.set(0.055, 0.055, 0.14);
    const toe = put(g, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam('#f4f4f0'), 0, 0.055, 0.07);
    toe.scale.set(0.055, 0.035, 0.07);
    put(g, new THREE.TorusGeometry(1, 0.08, 6, 24), lam('#e6e6e0'), 0, 0.055, -0.02, { rx: Math.PI / 2 }).scale.set(0.05, 0.1, 1);
  }
  return {
    tick(t, dt, fx) {
      smoke(fx, dt);
      ember.material.color.setHSL(0.06, 1, 0.5 + Math.sin(t * 5) * 0.08);
      for (const p of planks) { // 밟힌 널빤지가 삐걱 하고 돌아옴
        for (let k = Math.ceil(dt / 0.004), h = dt / k; k > 0; k--) { p.v += (-p.y * 900 - p.v * 22) * h; p.y += p.v * h; } // 느린 PC에서도 안 튀게 잘게 나눠 계산
        p.m.position.y = TY - 0.0175 + p.y;
      }
      wedges.forEach((w, i) => { w.rotation.z = (i % 2 ? 1 : -1) * 0.05 + Math.sin(t * 1.7 + i) * 0.015; });
    },
    bounce(p, smash, fx) {
      const i = Math.max(0, Math.min(N - 1, Math.floor((p[0] + HW) / (pw + gap))));
      planks[i].v -= smash ? 0.35 : 0.2;
      fx?.hit((emit) => emit({ tex: 'puff', n: smash ? 2 : 1, color: '#e5d6b8', size: 0.04, grow: 2, life: 0.6, speed: 0.2, up: 0.2, alpha: 0.3 }), [p[0], TY + 0.01, p[2]], 0);
    },
  };
}

/* ═════════════ 7. 커다란 식빵 두 장 ═════════════ */
function toast(root) {
  const CR = 0.06; // 식빵 모서리 둥글기
  const tex = canvasTex('toast-top', PX, PZ, (g, w, h) => {
    const r = rng(91);
    const c = k2p(CR);
    g.save(); rr(g, 0, 0, w, h, c); g.clip();
    g.fillStyle = '#8a4c1e'; g.fillRect(0, 0, w, h); // 껍질
    const b = k2p(0.032);
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, '#c9863f'); gr.addColorStop(0.6, '#d89c55'); gr.addColorStop(1, '#e3b26c');
    g.fillStyle = gr; rr(g, b, b, w - b * 2, h - b * 2, c * 0.7); g.fill();
    for (let i = 0; i < 1500; i++) { // 기공
      const x = b + r() * (w - b * 2), y = b + r() * (h - b * 2), s = 0.8 + r() * r() * 5;
      g.fillStyle = r() < 0.7 ? `rgba(130,75,25,${0.15 + r() * 0.2})` : `rgba(255,230,180,${0.15 + r() * 0.2})`;
      g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 14; i++) { // 노릇하게 구운 얼룩
      const x = b + r() * (w - b * 2), y = b + r() * (h - b * 2), s = 20 + r() * 50;
      const sg = g.createRadialGradient(x, y, 0, x, y, s);
      sg.addColorStop(0, 'rgba(140,70,20,0.22)'); sg.addColorStop(1, 'rgba(140,70,20,0)');
      g.fillStyle = sg; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    g.strokeStyle = 'rgba(255,220,170,0.35)'; g.lineWidth = 2; rr(g, b, b, w - b * 2, h - b * 2, c * 0.7); g.stroke();
    g.restore();
  }, { alpha: true });
  const topM = lam('#ffffff', { map: tex, transparent: false, alphaTest: 0.5 });
  const crust = lam('#8f5222');
  const slices = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.z = s * (HL / 2 + 0.003);
    root.add(g);
    put(g, roundBox(TABLE_W, 0.05, HL - 0.006, CR, 0.012), crust, 0, TY - 0.026, 0);
    const top = softTop(g, TABLE_W, HL - 0.006, topM, { y: TY + 0.0005, radius: 0.12, segW: 26, segL: 24 });
    slices.push({ g, top, s });
  }
  // 도마 + 다리
  const boardTex = canvasTex('cutboard', 256, 512, (g, w, h) => {
    const r = rng(92);
    g.fillStyle = '#c48d52'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(120,70,30,${0.08 + r() * 0.12})`; g.lineWidth = 0.5 + r() * 2; const x = r() * w; g.beginPath(); for (let y = 0; y <= h; y += 10) g.lineTo(x + Math.sin(y * 0.015 + i) * 3, y); g.stroke(); }
    for (let i = 0; i < 25; i++) { g.strokeStyle = 'rgba(90,50,20,0.15)'; g.lineWidth = 1; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 40 - 20, y + r() * 10 - 5); g.stroke(); } // 칼자국
  });
  put(root, roundBox(TABLE_W + 0.22, 0.05, TABLE_L + 0.28, 0.08, 0.012), lam('#ffffff', { map: boardTex }), 0, TY - 0.076, 0);
  const legPts = [[0, 0], [0.045, 0], [0.05, 0.03], [0.036, 0.1], [0.05, 0.3], [0.042, 0.5], [0.06, TY - 0.1]].map(([a, b]) => new THREE.Vector2(a, b));
  for (const x of [-0.7, 0.7]) for (const z of [-1.3, 1.3]) put(root, new THREE.LatheGeometry(legPts, 16), lam('#a8743e'), x, 0, z);
  // 네트 = 구멍 숭숭 치즈 + 포크 기둥 (치즈 아래로 녹아 흐름)
  const cheese = canvasTex('cheese', 512, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffd34d'); gr.addColorStop(1, '#ffbb2a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.82);
    const r = rng(93);
    for (let x = 6; x < w; x += 18 + r() * 26) { const dw = 8 + r() * 10, dh = h * (0.85 + r() * 0.15); rr(g, x, h * 0.6, dw, dh - h * 0.6, dw / 2); g.fill(); } // 흘러내림
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 46; i++) { const x = r() * w, y = 6 + r() * (h * 0.7), s = 4 + r() * 10; g.beginPath(); g.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }, { alpha: true });
  put(root, new THREE.PlaneGeometry(1.72, NET_H), new THREE.MeshLambertMaterial({ map: cheese, alphaTest: 0.4, side: THREE.DoubleSide }), 0, TY + NET_H / 2, 0, { shadow: false });
  const fork = shiny('#d4d9df', 110);
  for (const x of [-0.88, 0.88]) {
    box(root, 0.026, 0.14, 0.008, fork, x, TY - 0.0, 0);
    box(root, 0.04, 0.02, 0.008, fork, x, TY + 0.08, 0);
    for (let k = 0; k < 4; k++) box(root, 0.006, 0.09, 0.006, fork, x - 0.015 + k * 0.01, TY + 0.13, 0);
  }
  // 옆 소품 (-x): 케이크 받침 위 잼병·버터 / (+x): 토스터 (낮음)
  const sx = -(HW + 0.4), sz = 0.3;
  cyl(root, 0.05, 0.12, 0.02, lam('#f2efe8'), sx, 0.01, sz, {}, 24);
  cyl(root, 0.025, 0.025, TY - 0.15, lam('#f2efe8'), sx, (TY - 0.15) / 2, sz, {}, 16);
  cyl(root, 0.22, 0.2, 0.02, lam('#f6f3ec'), sx, TY - 0.14, sz, {}, 32);
  const jar = new THREE.MeshPhongMaterial({ color: '#c41f3a', shininess: 100, specular: '#ffffff', transparent: true, opacity: 0.92 });
  cyl(root, 0.06, 0.06, 0.14, jar, sx - 0.05, TY - 0.06, sz - 0.06, {}, 24);
  const gingham = canvasTex('gingham', 64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(230,60,70,0.55)'; for (let i = 0; i < 8; i++) { g.fillRect(i * 8, 0, 4, h); g.fillRect(0, i * 8, w, 4); } });
  const cloth = put(root, new THREE.CylinderGeometry(0.075, 0.09, 0.03, 12), lam('#ffffff', { map: gingham }), sx - 0.05, TY + 0.02, sz - 0.06);
  cloth.rotation.y = 0.3;
  box(root, 0.12, 0.05, 0.08, lam('#fff0a0'), sx + 0.07, TY - 0.105, sz + 0.08);
  box(root, 0.16, 0.008, 0.025, fork, sx + 0.05, TY - 0.075, sz + 0.02).rotation.y = 0.6;
  const toaster = new THREE.Group();
  toaster.position.set(HW + 0.36, 0, -0.75);
  toaster.rotation.y = -0.3;
  root.add(toaster);
  put(toaster, roundBox(0.36, 0.24, 0.2, 0.06, 0.03), shiny('#8fd8c4', 60), 0, 0.12, 0);
  for (const z of [-0.04, 0.04]) box(toaster, 0.26, 0.01, 0.025, lam('#2b2a33'), 0, 0.241, z, { shadow: false });
  box(toaster, 0.04, 0.02, 0.03, shiny('#c9ced6', 80), 0.19, 0.16, 0);
  const steam = steamer([0, TY + 0.01, 0], { every: 0.7, size: 0.07, up: 0.12, alpha: 0.14, life: 1.6 });
  return {
    tick(t, dt, fx) {
      for (const s of slices) s.top.userData.update(dt);
      if (fx) { // 빵 위 여기저기서 따뜻한 김 (아주 흐리게)
        const pos = [(Math.random() - 0.5) * 1.2, TY + 0.01, (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.9)];
        steam({ hit: (fn, _p, lv) => fx.hit(fn, pos, lv) }, dt);
      }
    },
    bounce(p, smash, fx) {
      const s = slices.find((o) => Math.sign(p[2]) === o.s) || slices[0];
      s.top.userData.press(p[0], p[2] - s.g.position.z, smash ? 0.02 : 0.012);
      fx?.hit((emit) => emit({ tex: 'crumb', n: smash ? 9 : 4, color: ['#c98a45', '#e0b070', '#a8652c'], size: 0.014, life: 1.3, speed: 0.6, up: 1.1, g: 6, spin: 6, floor: TY + 0.005, spread: 0.02 }), [p[0], TY + 0.01, p[2]], 0);
    },
  };
}

/* ═════════════ 8. 펼친 교과서 ═════════════ */
function textbook(root) {
  // 쪽마다 어두운 우주 사진 (흰 공이 잘 보이게) + 크림색 여백 (경계선 역할) + 낙서
  const page = (id, num, far) => canvasTex('book-' + id, PX, PZ, (g, w, h) => {
    const r = rng(far ? 101 : 102);
    g.fillStyle = '#f3ead6'; g.fillRect(0, 0, w, h);
    const m = 14, top = far ? 34 : 14, bot = far ? 14 : 34; // 바깥쪽(선수 쪽)에 머리말·쪽수 여백
    const x0 = m, y0 = top, pw = w - m * 2, ph = h - top - bot;
    const sky = g.createLinearGradient(0, y0, 0, y0 + ph);
    sky.addColorStop(0, '#0f1a3d'); sky.addColorStop(1, '#1b2350');
    g.fillStyle = sky; g.fillRect(x0, y0, pw, ph);
    g.save(); g.beginPath(); g.rect(x0, y0, pw, ph); g.clip();
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`; g.fillRect(x0 + r() * pw, y0 + r() * ph, 1.2, 1.2); }
    if (far) {
      // 태양계: 왼쪽 끝에 태양 일부 + 궤도 + 행성
      const sx = x0 - 60, sy = y0 + ph / 2;
      const sg = g.createRadialGradient(sx, sy, 10, sx, sy, 120); sg.addColorStop(0, '#ffd36b'); sg.addColorStop(0.6, '#ff9a3d'); sg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = sg; g.fillRect(x0, y0, 200, ph);
      g.setLineDash([4, 6]); g.strokeStyle = 'rgba(200,210,255,0.3)'; g.lineWidth = 1.5;
      const pl = [[110, 7, '#c9a27a'], [170, 10, '#e8c37a'], [235, 11, '#4f8be8'], [300, 9, '#d8643a'], [390, 22, '#d8b38a'], [470, 18, '#e7d39a']];
      for (const [rad, s, col] of pl) {
        g.beginPath(); g.arc(sx, sy, rad, -0.9, 0.9); g.stroke();
        const a = -0.5 + r() * 1.0;
        g.save(); g.setLineDash([]); g.fillStyle = col; g.beginPath(); g.arc(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad, s, 0, Math.PI * 2); g.fill();
        if (s === 18) { g.strokeStyle = 'rgba(240,220,170,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad, s * 1.8, s * 0.5, -0.3, 0, Math.PI * 2); g.stroke(); }
        g.restore();
      }
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.88)'; rr(g, x0 + pw - 190, y0 + 16, 176, 56, 8); g.fill();
      text(g, '태양계의 행성은 모두', x0 + pw - 102, y0 + 34, 13, '#2b2a33');
      text(g, '여덟 개입니다.', x0 + pw - 102, y0 + 54, 13, '#2b2a33');
    } else {
      // 별자리 + 탐구 활동 상자
      g.strokeStyle = 'rgba(180,200,255,0.45)'; g.lineWidth = 1.2;
      const cons = [[[90, 90], [140, 70], [190, 95], [240, 80], [280, 120], [250, 160], [200, 150]], [[330, 230], [360, 270], [400, 250], [430, 300], [380, 330]]];
      for (const c of cons) { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x0 + x * pw / 480, y0 + y * ph / 400) : g.moveTo(x0 + x * pw / 480, y0 + y * ph / 400))); g.stroke(); for (const [x, y] of c) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(x0 + x * pw / 480, y0 + y * ph / 400, 2.2, 0, Math.PI * 2); g.fill(); } }
      g.fillStyle = 'rgba(255,255,255,0.9)'; rr(g, x0 + 16, y0 + ph - 84, 210, 68, 8); g.fill();
      g.fillStyle = '#ff8a3d'; rr(g, x0 + 16, y0 + ph - 84, 70, 20, 6); g.fill();
      text(g, '탐구 활동', x0 + 51, y0 + ph - 74, 12, '#fff');
      text(g, '밤하늘에서 북두칠성을', x0 + 120, y0 + ph - 46, 13, '#2b2a33');
      text(g, '찾아 그려 봅시다.', x0 + 120, y0 + ph - 26, 13, '#2b2a33');
    }
    g.restore();
    // 머리말·쪽수 (바깥쪽 여백)
    const hy = far ? 17 : h - 17;
    text(g, '과학 6-1  ·  3. 태양계와 별', w / 2, hy, 12, '#8a7f70');
    text(g, String(num), far ? m + 14 : w - m - 14, hy, 13, '#5a5248');
    // 연필 낙서: 탁구채 + '졸려…'
    g.strokeStyle = 'rgba(90,90,100,0.7)'; g.lineWidth = 1.5;
    const dx = far ? w - 70 : 40, dy = far ? 17 : h - 17;
    g.beginPath(); g.ellipse(dx, dy, 7, 9, 0.4, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(dx + 4, dy + 7); g.lineTo(dx + 9, dy + 14); g.stroke();
    text(g, '졸려…', dx + (far ? -34 : 36), dy, 12, 'rgba(90,90,100,0.75)', { font: 'cursive', weight: 'normal', rot: -0.1 });
    // 가운데 접히는 곳 그늘
    const gy = far ? h : 0;
    const gg = g.createLinearGradient(0, gy, 0, far ? h - 40 : 40);
    gg.addColorStop(0, 'rgba(60,40,20,0.45)'); gg.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gg; g.fillRect(0, far ? h - 40 : 0, w, 40);
  });
  // 쪽 표면: 가운데로 갈수록 살짝 올라갔다가 접히는 곳에서 쏙 (1.2cm, 보기만)
  const lift = (x, z) => 0.012 * smooth(0.35, 0.03, Math.abs(z)) - 0.012 * smooth(0.025, 0.0, Math.abs(z));
  for (const [s, id, num] of [[-1, 'far', 52], [1, 'near', 53]]) {
    const g = new THREE.Group();
    g.position.z = s * HL / 2;
    root.add(g);
    softTop(g, TABLE_W, HL, lam('#ffffff', { map: page(id, num, s < 0) }), { y: TY, segW: 4, segL: 40, shape: (x, zz) => lift(x, zz + g.position.z) });
  }
  const pagesSide = canvasTex('book-edge', 256, 32, (g, w, h) => { g.fillStyle = '#efe4cc'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(150,130,100,0.25)'; g.fillRect(0, y, w, 1); } }, { repeat: true });
  pagesSide.repeat.set(4, 1);
  const pm = lam('#ffffff', { map: pagesSide });
  box(root, TABLE_W, 0.05, TABLE_L - 0.01, pm, 0, TY - 0.026, 0);
  const cover = lam('#24346a');
  box(root, TABLE_W + 0.06, 0.018, TABLE_L + 0.06, cover, 0, TY - 0.06, 0);
  put(root, new THREE.CylinderGeometry(0.05, 0.05, TABLE_W + 0.06, 20, 1, false, 0, Math.PI), cover, 0, TY - 0.069, 0, { rz: Math.PI / 2, rx: Math.PI }); // 책등
  // 다리 = 쌓아 둔 다른 책들
  const spines = ['#e94f5a', '#2bb673', '#ffc83d', '#4f8be8', '#a26be0', '#ff8a3d', '#3aa7a3'];
  let k = 0;
  for (const x of [-0.55, 0.55]) for (const z of [-1.1, 1.1]) {
    let y = 0;
    while (y < TY - 0.07 - 0.01) {
      const th = Math.min(0.06 + ((k * 13) % 5) * 0.012, TY - 0.07 - y);
      const b = box(root, 0.42 - (k % 3) * 0.03, th, 0.3 - (k % 2) * 0.03, lam(spines[k % spines.length]), x, y + th / 2, z);
      b.rotation.y = ((k * 7) % 5 - 2) * 0.04;
      y += th; k++;
    }
  }
  // 네트 = 연필 기둥 + 책갈피 끈 두 줄 (가운데로 끈 하나가 늘어짐)
  const pencil = (x) => {
    const L = TY + NET_H + 0.08;
    put(root, new THREE.CylinderGeometry(0.024, 0.024, L - 0.08, 6), lam('#ffc83d'), x, 0.08 + (L - 0.08) / 2, 0);
    put(root, new THREE.CylinderGeometry(0.024, 0.004, 0.06, 6), lam('#f1d1a4'), x, 0.05, 0, { rx: Math.PI });
    put(root, new THREE.CylinderGeometry(0.006, 0.0005, 0.02, 6), lam('#333'), x, 0.012, 0, { rx: Math.PI });
    cyl(root, 0.025, 0.025, 0.03, shiny('#c9ced6', 90), x, L + 0.015, 0);
    cyl(root, 0.024, 0.024, 0.035, lam('#ff8fa3'), x, L + 0.047, 0);
  };
  pencil(-0.93); pencil(0.93);
  const satin = new THREE.MeshPhongMaterial({ color: '#d8273f', shininess: 90, specular: '#ffb0b8', side: THREE.DoubleSide });
  const ribbons = [];
  for (const [y, hgt] of [[NET_H - 0.008, 0.016], [0.06, 0.01]]) {
    const geo = new THREE.PlaneGeometry(1.86, hgt, 20, 1);
    ribbons.push({ geo, base: Float32Array.from(geo.attributes.position.array) });
    put(root, geo, satin, 0, TY + y, 0, { shadow: false });
  }
  const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0.12, TY + NET_H - 0.01, 0), new THREE.Vector3(0.13, TY + 0.06, 0.002), new THREE.Vector3(0.15, TY + 0.004, 0.06), new THREE.Vector3(0.17, TY + 0.003, 0.15)]);
  put(root, new THREE.TubeGeometry(tail, 20, 0.004, 4), satin, 0, 0, 0, { shadow: false }).scale.z = 1;
  // 접힌 귀퉁이 (바깥 모서리 넷, 바람에 살랑)
  const ears = [];
  const earGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.07, 0, 0), new THREE.Vector3(0, 0, 0.07)]);
  earGeo.setIndex([0, 2, 1]); earGeo.computeVertexNormals();
  const earM = new THREE.MeshLambertMaterial({ color: '#f6eedd', side: THREE.DoubleSide });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sx * (HW - 0.05), TY + 0.002, sz * (HL - 0.05));
    piv.rotation.y = Math.atan2(sx, sz) - Math.PI / 4 + Math.PI;
    root.add(piv);
    const e = new THREE.Mesh(earGeo, earM);
    e.position.set(-0.035, 0, -0.035);
    const hinge = new THREE.Group(); hinge.rotation.y = Math.PI / 4; hinge.add(e); piv.add(hinge);
    ears.push({ hinge, kick: 0, ph: sx + sz * 2 });
  }
  // 옆 소품 (-x): 커다란 지우개 + 연필 부스러기 / (+x): 형광펜 (바닥)
  const er = new THREE.Group();
  er.position.set(-(HW + 0.36), 0, 0.4);
  er.rotation.y = 0.4;
  root.add(er);
  put(er, roundBox(0.34, 0.12, 0.16, 0.03, 0.015), lam('#f7f5f0'), 0, 0.06, 0);
  const sleeve = canvasTex('eraser', 128, 64, (g, w, h) => { g.fillStyle = '#2f6fe0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 22, w, 20); text(g, 'ERASER', w / 2, 33, 16, '#2f6fe0'); });
  put(er, new THREE.BoxGeometry(0.2, 0.126, 0.166), lam('#ffffff', { map: sleeve }), 0.06, 0.06, 0);
  for (let i = 0; i < 4; i++) put(root, new THREE.ConeGeometry(0.03, 0.03, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#e9c99a', side: THREE.DoubleSide }), -(HW + 0.2) - i * 0.05, 0.01, 0.0 - i * 0.06, { rx: Math.PI / 2, rz: i });
  put(root, new THREE.CylinderGeometry(0.03, 0.03, 0.3, 14), lam('#e8ff3a'), HW + 0.3, 0.03, -0.7, { rz: Math.PI / 2, ry: 0.5 });
  let wind = 0;
  return {
    tick(t, dt) {
      wind += dt;
      for (const e of ears) { e.kick = Math.max(0, e.kick - dt * 1.5); e.hinge.rotation.x = -(0.15 + Math.sin(t * 1.6 + e.ph) * 0.08 + e.kick * 0.9 * Math.abs(Math.sin(t * 9))); }
      for (const [i, rb] of ribbons.entries()) {
        const pa = rb.geo.attributes.position;
        for (let v = 0; v < pa.count; v++) { const x = rb.base[v * 3]; pa.array[v * 3 + 2] = Math.sin(t * 2 + x * 3 + i) * 0.004 * (1 - (x / 0.93) ** 2); pa.array[v * 3 + 1] = rb.base[v * 3 + 1] - 0.006 * (1 - (x / 0.93) ** 2); }
        pa.needsUpdate = true;
      }
    },
    bounce(p, smash) {
      for (const e of ears) {
        const ex = e.hinge.parent.position;
        const d = Math.hypot(ex.x - p[0], ex.z - p[2]);
        e.kick = Math.max(e.kick, Math.max(0, 1 - d / 1.0) * (smash ? 1.4 : 1));
      }
    },
  };
}

export const RARE = { office, parcel, lunchTray, bed, goBoard, pyeongsang, toast, textbook };
