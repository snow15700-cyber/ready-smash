// 광장 새 디자인 시안: 본관 (경주캠퍼스 사진 1·2·3 참고) — 코드로 다듬은 버전 (plaza.md 20장)
// 떠 있는 유리 막대 2개 + 검은 돌 기둥. 다듬은 것:
//  · 유리: 층마다 천장 띠·안쪽 불빛·하늘 비침이 그려진 유리 + 층 사이 진한 띠(바닥 판 끝) + 1.5m마다 알루미늄 세로 핀(실제로 튀어나옴)
//  · 아래 면(필로티 천장): 어두운 판 + 격자 + 매입 조명 (광장에서 올려다보면 보이는 곳)
//  · 지붕: 두꺼운 흰 난간 + 회색 자갈 지붕 + 지붕 정원(잔디 판·덤불) + 기계실 상자(환기 창살)·천창
//  · 검은 돌 기둥: 큰 돌판 줄눈 무늬 + 1층 유리 로비(불 켜진 안쪽)
import * as THREE from 'three';
import { canvasTex, std } from './arena-kit.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PANEL = 1.5; // 유리 한 칸 너비 (= 세로 핀 간격)

function box(parent, w, h, d, m, x, y, z, round = 0) {
  const g = round ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
  const b = new THREE.Mesh(g, m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true;
  parent.add(b);
  return b;
}

// 유리 한 층 무늬: 가로 cols칸 × 1층. 위쪽은 하늘이 비쳐 밝고 아래로 갈수록 진함, 천장 띠(형광등 줄), 칸마다 조금씩 다른 안쪽(블라인드·불빛·사람 없는 방)
function glassFloorTex(rnd, cols) {
  const CW = 64, H = 160;
  const t = canvasTex(cols * CW, H, (g, w, h) => {
    for (let c = 0; c < cols; c++) {
      const x = c * CW;
      // 바탕: 위 밝은 청록 → 아래 진한 청록 (사진 1의 반사)
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#6fb3b3'); gr.addColorStop(0.45, '#3f8588'); gr.addColorStop(1, '#1f4f57');
      g.fillStyle = gr; g.fillRect(x, 0, CW, h);
      // 천장 띠 + 형광등
      g.fillStyle = 'rgba(20,45,50,.55)'; g.fillRect(x, 0, CW, 18);
      g.fillStyle = 'rgba(235,250,240,.55)'; g.fillRect(x + 10, 8, CW - 20, 4);
      // 안쪽: 블라인드(가로줄) 또는 불 켜진 방 또는 그냥 유리
      const k = rnd();
      if (k < 0.18) { g.fillStyle = 'rgba(255,236,190,.28)'; g.fillRect(x + 2, 20, CW - 4, h - 40); }
      else if (k < 0.38) { g.fillStyle = 'rgba(210,225,220,.35)'; for (let y = 22; y < 22 + (40 + rnd() * 80); y += 6) g.fillRect(x + 2, y, CW - 4, 3); }
      else if (k < 0.5) { g.fillStyle = 'rgba(15,35,40,.35)'; g.fillRect(x + 2, h - 60, CW - 4, 40); } // 책상 높이 그림자
      // 하늘·구름 비침 줄 (비스듬히)
      g.fillStyle = `rgba(220,245,245,${0.06 + rnd() * 0.1})`;
      g.beginPath(); g.moveTo(x + rnd() * CW, 0); g.lineTo(x + rnd() * CW + 14, 0); g.lineTo(x + rnd() * CW - 10, h); g.lineTo(x + rnd() * CW - 24, h); g.fill();
      // 칸 사이 가는 틀
      g.fillStyle = 'rgba(10,25,28,.8)'; g.fillRect(x, 0, 2, h);
    }
    // 바닥 쪽 가로 틀
    g.fillStyle = 'rgba(10,25,28,.8)'; g.fillRect(0, h - 3, w, 3);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 필로티 천장(막대 아래 면): 어두운 판 격자 + 둥근 매입 조명
function soffitTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2a3234'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = 64 + x * 128, cy = 64 + y * 128;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 22);
      gr.addColorStop(0, '#fff6dc'); gr.addColorStop(0.45, '#ffe9b0'); gr.addColorStop(1, 'rgba(255,233,176,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 검은 돌(로얄블랙석) 판: 큰 돌판 + 가는 줄눈, 판마다 살짝 다른 어둡기
function graniteTex(rnd) {
  const t = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const v = 38 + Math.floor(rnd() * 14);
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(x * 64, y * 32, 64, 32);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(x * 64 + rnd() * 64, y * 32 + rnd() * 32, 2, 2); }
    }
    g.strokeStyle = 'rgba(0,0,0,.38)'; g.lineWidth = 1.5;
    for (let y = 0; y <= 8; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(256, y * 32); g.stroke(); }
    for (let y = 0; y < 8; y++) for (let x = 0; x <= 4; x++) { const ox = (y % 2) * 32; g.beginPath(); g.moveTo(x * 64 + ox, y * 32); g.lineTo(x * 64 + ox, y * 32 + 32); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function gravelTex(rnd) {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#b9bcbc'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { const v = 150 + rnd() * 80; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function louverTex() {
  return canvasTex(64, 64, (g) => { g.fillStyle = '#c9cdd0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#6b7276'; for (let y = 4; y < 64; y += 8) g.fillRect(4, y, 56, 3); });
}

// 유리 막대 하나. floors층, 바닥 y0 ~ 지붕 y1
function glassBar(root, rnd, { x0, x1, z0, z1, y0, y1, floors, gardens }) {
  const g = new THREE.Group();
  const w = x1 - x0, d = z1 - z0, h = y1 - y0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const fh = h / floors;
  const alu = std(0xd3d8db, { metalness: 0.6, roughness: 0.35 });
  const band = std(0x22383b, { metalness: 0.3, roughness: 0.4 }); // 층 사이 진한 띠
  const white = std(0xf1efe9, { roughness: 0.7 });

  // 유리 면 4개 (면마다 따로 무늬, 칸 수가 정확히 맞게)
  const face = (len) => {
    const cols = Math.max(1, Math.round(len / PANEL));
    const tex = glassFloorTex(rnd, Math.min(cols, 32));
    tex.repeat.set(cols / Math.min(cols, 32), floors);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.08, metalness: 0.55, emissive: 0x081c1c, emissiveIntensity: 0.4, emissiveMap: tex });
    m.userData.glow = [0.4, 6]; // [낮, 밤] 밝기 — 밤엔 창이 켜짐 (campusPage.js setSky)
    return m;
  };
  const soffit = soffitTex(); soffit.repeat.set(w / 6, d / 6);
  const soffitM = new THREE.MeshStandardMaterial({ map: soffit, emissiveMap: soffit, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.8 });
  soffitM.userData.glow = [0.25, 1.4]; // 필로티 천장 매입 조명
  const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, h, d - 0.3), [face(d), face(d), white, soffitM, face(w), face(w)]);
  body.position.set(cx, y0 + h / 2, cz); body.castShadow = true; body.receiveShadow = true; g.add(body);

  // 아래 판 (필로티 천장 두께) + 층마다 진한 띠 (조금 튀어나옴)
  const under = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.7, d + 0.1), [band, band, band, soffitM, band, band]);
  under.position.set(cx, y0 - 0.2, cz); under.castShadow = true; g.add(under);
  for (let f = 1; f < floors; f++) box(g, w + 0.06, 0.45, d + 0.06, band, cx, y0 + f * fh, cz);

  // 세로 핀 (알루미늄): 둘레를 따라 1.5m마다, 한 번에 그리기(InstancedMesh)
  const pts = [];
  const nx = Math.round(w / PANEL), nz = Math.round(d / PANEL);
  for (let i = 0; i <= nx; i++) { const x = x0 + (i * w) / nx; pts.push([x, z0 - 0.06, 0], [x, z1 + 0.06, 0]); }
  for (let i = 1; i < nz; i++) { const z = z0 + (i * d) / nz; pts.push([x0 - 0.06, z, 1], [x1 + 0.06, z, 1]); }
  const fin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, h + 0.2, 0.22), alu, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  pts.forEach(([x, z, rot], i) => { q.setFromAxisAngle(up, rot ? Math.PI / 2 : 0); m4.compose(new THREE.Vector3(x, y0 + h / 2, z), q, sc); fin.setMatrixAt(i, m4); });
  fin.castShadow = true; g.add(fin);

  // 지붕: 두꺼운 흰 난간(둥근 모서리) + 자갈 지붕
  const PT = 0.45, PH = 1.1;
  box(g, w + 0.5, PH, PT, white, cx, y1 + PH / 2, z0 - 0.05, 0.08);
  box(g, w + 0.5, PH, PT, white, cx, y1 + PH / 2, z1 + 0.05, 0.08);
  box(g, PT, PH, d, white, x0 - 0.05, y1 + PH / 2, cz, 0.08);
  box(g, PT, PH, d, white, x1 + 0.05, y1 + PH / 2, cz, 0.08);
  box(g, w + 0.55, 0.12, 0.6, alu, cx, y1 + PH + 0.04, z0 - 0.05); // 난간 위 알루미늄 덮개
  box(g, w + 0.55, 0.12, 0.6, alu, cx, y1 + PH + 0.04, z1 + 0.05);
  const gravel = gravelTex(rnd); gravel.repeat.set(w / 4, d / 4);
  box(g, w, 0.1, d, new THREE.MeshLambertMaterial({ map: gravel }), cx, y1 + 0.05, cz);

  // 지붕 정원 (사진 2): 흰 테두리 안 잔디 + 덤불 자리(무료 모델로 바뀜) + 나무 데크 길
  const grass = new THREE.MeshLambertMaterial({ color: 0x79b84f });
  for (const [gx, gz, gw, gd] of gardens) {
    box(g, gw + 0.3, 0.45, gd + 0.3, white, gx, y1 + 0.3, gz, 0.06);
    box(g, gw, 0.5, gd, grass, gx, y1 + 0.32, gz);
    box(g, 0.9, 0.52, gd, std(0xb98a5a), gx, y1 + 0.33, gz); // 데크 길
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Group(); e.userData.prop = 'bush'; e.userData.extra = true; e.userData.seed = rnd();
      e.position.set(gx + (i % 2 ? 1 : -1) * gw * 0.3, y1 + 0.57, gz + (i < 2 ? -1 : 1) * gd * 0.25); e.scale.setScalar(1.3); g.add(e);
    }
  }
  // 기계실 상자 (환기 창살) + 천창
  const louv = new THREE.MeshStandardMaterial({ map: louverTex(), roughness: 0.6 });
  box(g, w * 0.16, 1.8, d * 0.45, [white, white, white, white, louv, louv].map((m) => m), x1 - w * 0.14, y1 + 1.0, cz - d * 0.12, 0);
  box(g, w * 0.08, 1.2, d * 0.25, alu, x1 - w * 0.3, y1 + 0.7, cz + d * 0.22);
  const sky = new THREE.MeshStandardMaterial({ color: 0x8fd0d4, roughness: 0.05, metalness: 0.5 });
  for (let i = 0; i < 3; i++) { box(g, 1.6, 0.25, 1.6, alu, x0 + w * 0.12 + i * 2.6, y1 + 0.22, cz, 0.05); box(g, 1.35, 0.3, 1.35, sky, x0 + w * 0.12 + i * 2.6, y1 + 0.3, cz); }

  root.add(g);
  return g;
}

// 검은 돌 기둥 (+ 1층 유리 로비: 광장 쪽 면에)
function core(root, rnd, { x, z, w, d, h, lobby }) {
  const g = new THREE.Group();
  const tex = graniteTex(rnd);
  const mk = (a, b) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(a / 8, b / 8); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.15 }); };
  const mx = mk(d, h), mz = mk(w, h), top = std(0x2a2d31);
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, top, top, mz, mz]);
  b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
  // 바닥 쪽 그림자 틈(돌이 땅에서 살짝 떠 보이게) + 위쪽 그림자 틈(막대와 만나는 곳)
  box(g, w - 0.1, 0.18, d - 0.1, std(0x111315), x, 0.09, z);
  box(g, w - 0.2, 0.3, d - 0.2, std(0x111315), x, h - 0.15, z);
  if (lobby) {
    // 광장 쪽(+z) 1층에 유리 로비: 불 켜진 안쪽 + 알루미늄 틀 + 자동문
    const LW = w * 0.7, LH = 3.6, fz = z + d / 2;
    const inside = new THREE.MeshStandardMaterial({ color: 0xffefd0, emissive: 0xffe3b0, emissiveIntensity: 0.55 });
    inside.userData.glow = [0.55, 1.2];
    box(g, LW, LH, 0.06, inside, x, LH / 2 + 0.18, fz + 0.03);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6ea, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.3, depthWrite: false });
    box(g, LW, LH, 0.04, glass, x, LH / 2 + 0.18, fz + 0.2);
    const alu = std(0xd3d8db, { metalness: 0.6, roughness: 0.35 });
    for (let i = 0; i <= 5; i++) box(g, 0.08, LH, 0.2, alu, x - LW / 2 + (i * LW) / 5, LH / 2 + 0.18, fz + 0.14);
    // 안쪽에 보이는 것: 안내 데스크 + 화분 (불빛 앞 실루엣)
    box(g, LW * 0.35, 1.0, 0.1, std(0x6b4a33), x - LW * 0.15, 0.68, fz + 0.08);
    box(g, 0.4, 1.3, 0.1, std(0x3f7f3f), x + LW * 0.36, 0.83, fz + 0.08);
    box(g, LW + 0.1, 0.12, 0.22, alu, x, LH + 0.18, fz + 0.14);
    box(g, LW + 0.1, 0.1, 0.22, alu, x, 2.4, fz + 0.14);
    // 바닥의 로비 매트 + 캐노피(얇은 돌 차양)
    box(g, LW + 1.6, 0.25, 1.6, std(0x2a2d31, { roughness: 0.5 }), x, LH + 0.55, fz + 0.75);
  }
  root.add(g);
  return g;
}

// 본관 전체. 반환: 전광판을 붙일 앞면 z 등
export function buildMainHall(root, rnd) {
  const A = { x0: -36, x1: 8, z0: -30, z1: -17, y0: 13, y1: 25, floors: 3, gardens: [[-26, -23.5, 8, 7], [-6, -23.5, 6, 7]] }; // 막대 ① (높게)
  const B = { x0: 0, x1: 40, z0: -25, z1: -14.5, y0: 8.5, y1: 18, floors: 3, gardens: [[20, -19.8, 9, 6]] }; // 막대 ② (조금 낮게, 앞쪽)
  glassBar(root, rnd, A);
  glassBar(root, rnd, B);
  core(root, rnd, { x: -4, z: -24, w: 7, d: 9, h: 13, lobby: true }); // 사진 1의 검은 돌 기둥
  core(root, rnd, { x: 13, z: -20, w: 6, d: 8, h: 8.5, lobby: false });
  core(root, rnd, { x: -32, z: -24, w: 4, d: 6, h: 13, lobby: false });
  return { frontA: A.z1 };
}
