import * as THREE from 'three';
import { rng, canvasTex, envCube } from './outfits.js';

/* ───────────── 머리 꾸미기 (한 개씩) ─────────────
   좌표 = 캐릭터 머리 중심(scene.js makeCharacter의 head: y 1.17, 반지름 0.16). 앞 = -z, 오른쪽(탁구채 쪽) = +x.
   캐릭터는 몸 위의 hatAt 그룹에 붙인다(병아리처럼 머리 모양이 다른 옷은 outfits.js의 hatAt으로 자리·크기를 바꿈).
   - 일반: 머리에 살짝 얹는 것 / 고급: 모양이 크고 웃긴 것 (+ 세트용) / 전설(2단계): 움직이는 효과
   update(t, dt): 매 프레임(흔들림·불빛 등). hideFace: 얼굴 아이템을 가리는 머리(투구·가면). */

const HR = 0.16;
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const phong = (color, o = {}) => new THREE.MeshPhongMaterial({ color, shininess: 30, ...o });
function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}
function grp(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
const now = () => performance.now() / 1000;
// 스윙한 지 얼마나 됐나 (0 = 막 침, 큰 값 = 오래됨)
const sinceSwing = (char) => (char && char.swingT > 0 ? now() - char.swingT : 99);

// 보송한 공 (방울·털뭉치): 방향에 따라 반지름이 달라 울퉁불퉁 (같은 자리 꼭짓점은 같이 움직여 이음매가 안 벌어짐)
function fuzzGeo(r, amp = 0.12, f = 9, seg = 20) {
  const geo = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * f + 1.3) * Math.sin(v.y * f * 1.13 + 0.7) * Math.sin(v.z * f * 0.91 + 2.1) + 0.5 * Math.sin(v.x * f * 2.3 + v.z * f * 1.7);
    v.multiplyScalar(r * (1 + amp * n));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// 머리 덮개 (위에서부터 theta만큼). UV: 가로 = 한 바퀴(앞 = u 0.75), 세로 = 위(0) → 아래(1) — 캔버스 y와 같은 방향
const capGeo = (r, theta, ws = 48, hs = 20) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta);
// 천 느낌 잡티
function grain(g, w, h, n, alpha, seed, dark = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(0,0,0,${r() * alpha})` : `rgba(255,255,255,${r() * alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
function dot(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function starPath(g, x, y, R, r, color, rot = -Math.PI / 2) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
// 가로로 이어지는 그림 (이음매 근처는 반대편에도)
const wrapX = (w, x, fn, pad = 40) => { fn(x); if (x < pad) fn(x + w); else if (x > w - pad) fn(x - w); };
// 머리 표면을 따라가는 줄 (점들을 반지름 r 구 위로 붙인 뒤 이음)
function surfTube(pts, r, tube, mat, parent, closed = false) {
  const v = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z).setLength(r));
  const curve = new THREE.CatmullRomCurve3(v, closed);
  return mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 10), tube, 6, closed), mat, 0, 0, 0, parent);
}
// 평면 모양(Shape)에 그림을 붙일 때: UV가 모양 좌표 그대로라 0~1로 맞춘다
function fitUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x || 1), (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1));
  uv.needsUpdate = true;
  return geo;
}
// 머리 앞 표면에 붙는 띠 (헤어밴드·머리띠·가면 끈): 반지름이 높이마다 머리에 맞는 열린 원통
function bandGeo(y0, y1, pad = 0.006, seg = 64) {
  const rAt = (y) => Math.sqrt(Math.max(0.0001, HR * HR - y * y)) + pad;
  const geo = new THREE.CylinderGeometry(rAt(y1), rAt(y0), y1 - y0, seg, 1, true);
  geo.translate(0, (y0 + y1) / 2, 0);
  return geo;
}
// 돌림체 겉면을 따라 앞→정수리→뒤로 지나는 능선 (안전모·투구). prof = 아래→위 [반지름, 높이]. back=false면 앞쪽만
function profileTube(prof, lift, tube, mat, parent, back = true) {
  const up = prof.map(([r, y]) => new THREE.Vector3(0, y, -(r + lift)));
  const pts = back ? up.concat(prof.slice(0, -1).reverse().map(([r, y]) => new THREE.Vector3(0, y, r + lift))) : up;
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, tube, 8), mat, 0, 0, 0, parent);
}
// 원통 UV: 앞(-z) = u 0.5
const FRONT_U = 0.5;

const BUILD = {};

/* ═════════════ 일반 ═════════════ */

// 빨간 헤어밴드: 이마에 두른 운동용 밴드 (앞은 이마, 뒤는 조금 높게). 흰 줄 두 개 + 작은 탁구채 로고
BUILD.band = (g) => {
  const b = grp(g);
  b.rotation.x = -0.3;
  const tex = canvasTex(1024, 64, (c, w, h) => {
    c.fillStyle = '#e5323b'; c.fillRect(0, 0, w, h);
    // 수건 같은 결
    for (let x = 0; x < w; x += 3) { c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(x, 0, 1, h); }
    grain(c, w, h, 2500, 0.14, 3);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 7, w, 5); c.fillRect(0, h - 12, w, 5);
    // 앞 로고: 작은 흰 탁구채
    const x = w * FRONT_U, y = h / 2;
    c.save(); c.translate(x, y); c.rotate(-0.5);
    dot(c, 0, -3, 11, '#ffffff'); c.fillStyle = '#ffffff'; c.fillRect(-3, 6, 6, 12);
    c.restore();
  });
  mesh(bandGeo(0.02, 0.072, 0.007), lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0, 0, b);
  // 두께감: 위아래 가장자리 말림
  for (const [y, pad] of [[0.02, 0.007], [0.072, 0.007]]) {
    const r = Math.sqrt(HR * HR - y * y) + pad;
    const t = mesh(new THREE.TorusGeometry(r, 0.004, 6, 64), lam('#d42a33'), 0, y, 0, b);
    t.rotation.x = Math.PI / 2;
  }
};

// 야구 모자: 남색 6쪽 모자 + 앞 흰 로고 + 챙(살짝 휘고 앞으로 숙임) + 꼭지 단추
BUILD.cap = (g) => {
  const cap = grp(g);
  cap.rotation.x = -0.1;
  const NAVY = '#24407a';
  const tex = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = NAVY; c.fillRect(0, 0, w, h);
    grain(c, w, h, 3000, 0.12, 5);
    // 6쪽 바느질 선
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * w + w / 12;
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1; c.setLineDash([5, 5]);
      for (const d of [-6, 6]) { c.beginPath(); c.moveTo(x + d, 10); c.lineTo(x + d, h); c.stroke(); }
      c.setLineDash([]);
    }
    // 앞 로고 (흰 동그라미 + 빨간 S)
    const fx = w * 0.75, fy = h * 0.6;
    dot(c, fx, fy, 46, '#ffffff');
    dot(c, fx, fy, 40, '#e5323b');
    c.fillStyle = '#ffffff'; c.font = 'bold 60px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('S', fx, fy + 3);
    // 숨구멍 (각 쪽 위)
    for (let i = 0; i < 6; i++) dot(c, (i / 6) * w, h * 0.32, 5, 'rgba(0,0,0,0.5)');
  });
  const crown = mesh(capGeo(0.168, Math.PI * 0.5), lam('#ffffff', { map: tex }), 0, 0.008, 0, cap);
  crown.scale.y = 0.96;
  // 아래 테 (안쪽 땀받이가 살짝)
  const rim = mesh(new THREE.TorusGeometry(0.168, 0.005, 6, 64), lam('#1b3264'), 0, 0.01, 0, cap);
  rim.rotation.x = Math.PI / 2;
  // 꼭지 단추
  mesh(new THREE.SphereGeometry(0.014, 12, 8), lam(NAVY), 0, 0.168 * 0.96 + 0.006, 0, cap).scale.y = 0.55;
  // 챙: 앞 반달 모양 (모양 y = 앞으로 나온 거리)
  const s = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI; s.lineTo(Math.cos(a) * 0.15, Math.sin(a) * 0.15 + 0.06); }
  for (let i = N; i >= 0; i--) { const a = (i / N) * Math.PI; const x = Math.cos(a) * 0.15; s.lineTo(x, Math.sqrt(Math.max(0, 0.165 * 0.165 - x * x)) - 0.02); }
  const brimGeo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 4 });
  brimGeo.rotateX(Math.PI / 2); // 모양 (x, y, 두께) → (x, -두께, y)
  const p = brimGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), f = p.getZ(i), y = p.getY(i); // f = 앞으로 나온 거리
    // 앞으로 나온 만큼 아래로 숙이고, 양옆은 아래로 휜다
    p.setXYZ(i, x, y - Math.max(0, f - 0.12) * 0.3 - x * x * 1.4, -f);
  }
  brimGeo.computeVertexNormals();
  mesh(brimGeo, [lam(NAVY), lam('#1b3264')], 0, 0.016, 0, cap);
  // 챙 아래 초록 (옛날 야구 모자처럼)
};

// 털 비니: 겨자색 골지 + 접힌 단 + 보송한 방울
BUILD.beanie = (g) => {
  const b = grp(g);
  b.rotation.x = -0.12;
  const knit = (base, rib) => canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = rib; c.fillRect(x, 0, 6, h);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 9, 0, 3, h);
    }
    // 뜨개 코 (V 모양)
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2;
    for (let y = 4; y < h; y += 10) for (let x = 0; x < w; x += 16) { c.beginPath(); c.moveTo(x + 2, y); c.lineTo(x + 8, y + 6); c.lineTo(x + 14, y); c.stroke(); }
    grain(c, w, h, 2500, 0.1, 8);
  });
  const crown = mesh(capGeo(0.172, Math.PI * 0.56), lam('#ffffff', { map: knit('#e9a63a', '#d18f28') }), 0, 0, 0, b);
  crown.scale.y = 1.12;
  // 접힌 단
  const cuffTex = knit('#d8942c', '#bf7d1f');
  cuffTex.repeat.set(1, 0.4);
  mesh(new THREE.CylinderGeometry(0.18, 0.183, 0.06, 64, 1, true), lam('#ffffff', { map: cuffTex, side: THREE.DoubleSide }), 0, 0.0, 0, b);
  const top = mesh(new THREE.TorusGeometry(0.18, 0.007, 6, 64), lam('#d8942c'), 0, 0.03, 0, b);
  top.rotation.x = Math.PI / 2;
  // 작은 가죽 이름표
  const tag = mesh(new THREE.BoxGeometry(0.04, 0.022, 0.004), lam('#7a4b2a'), 0, 0.0, -0.183, b);
  tag.lookAt(0, 0, -1);
  // 방울
  mesh(fuzzGeo(0.048, 0.14, 11), lam('#fff4dc'), 0, 0.172 * 1.12 + 0.035, 0, b);
};

// 새싹: 머리 위 떡잎 두 장 (살랑살랑)
BUILD.sprout = (g) => {
  const root = grp(g, 0, HR - 0.006, 0.01);
  const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.006, 0.04, 0), new THREE.Vector3(-0.004, 0.08, 0)]);
  mesh(new THREE.TubeGeometry(stem, 16, 0.006, 8), lam('#5fb245'), 0, 0, 0, root);
  const top = grp(root, -0.004, 0.08, 0);
  const leafTex = canvasTex(256, 192, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#4fae3c'); gr.addColorStop(1, '#8fe06a');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(40,110,30,0.7)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, h / 2); c.quadraticCurveTo(w * 0.5, h * 0.46, w, h / 2); c.stroke();
    c.lineWidth = 2;
    for (let i = 1; i < 5; i++) { const x = (i / 5) * w; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(x - 20, h / 2); c.lineTo(x + 6, h / 2 + d * h * 0.28); c.stroke(); } }
  });
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.02, 0.036, 0.062, 0.034, 0.085, 0);
  leafShape.bezierCurveTo(0.062, -0.034, 0.02, -0.036, 0, 0);
  for (const d of [-1, 1]) {
    const geo = fitUV(new THREE.ShapeGeometry(leafShape, 12));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -x * x * 2.2 + y * y * 5); }
    geo.computeVertexNormals();
    const side = grp(top);
    side.rotation.y = d > 0 ? 0.25 : Math.PI + 0.25;
    const leaf = mesh(geo, lam('#ffffff', { map: leafTex, side: THREE.DoubleSide }), 0, 0, 0, side);
    leaf.rotation.set(1.05, 0, 0.55); // 잎끝을 위로 든 뒤, 잎 면이 위·앞을 보게 눕힌다
    leaf.scale.setScalar(d > 0 ? 1.65 : 1.45);
  }
  mesh(new THREE.SphereGeometry(0.008, 8, 6), lam('#8fe06a'), 0, 0.004, 0, top);
  return (t) => {
    root.rotation.z = Math.sin(t * 2.1) * 0.12;
    root.rotation.x = Math.sin(t * 1.6 + 1) * 0.08;
    top.rotation.y = Math.sin(t * 1.3) * 0.25;
  };
};

// 고양이 귀: 치즈냥 줄무늬 귀 + 분홍 속 + 흰 털 (가끔 쫑긋)
BUILD.cat = (g, char) => {
  const outer = new THREE.Shape();
  outer.moveTo(-0.048, 0);
  outer.quadraticCurveTo(-0.034, 0.07, -0.007, 0.104);
  outer.quadraticCurveTo(0, 0.111, 0.007, 0.104);
  outer.quadraticCurveTo(0.034, 0.07, 0.048, 0);
  outer.quadraticCurveTo(0, -0.012, -0.048, 0);
  const furTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#f3a648'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d77f22';
    for (let i = 0; i < 4; i++) { const y = h * (0.15 + i * 0.22); c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(w / 2, y + 16, w, y); c.lineTo(w, y + 14); c.quadraticCurveTo(w / 2, y + 30, 0, y + 14); c.fill(); }
    grain(c, w, h, 1200, 0.12, 4);
  });
  const ears = [];
  for (const d of [-1, 1]) {
    const ear = grp(g, d * 0.088, 0.118, 0.012);
    ear.rotation.set(0.05, 0, -d * 0.55);
    const geo = fitUV(new THREE.ExtrudeGeometry(outer, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 3, curveSegments: 10 }));
    geo.translate(0, 0, -0.008);
    const m = lam('#ffffff', { map: furTex });
    mesh(geo, [m, m], 0, 0, 0, ear);
    const inner = mesh(new THREE.ShapeGeometry(outer, 10), lam('#ffb0bd', { side: THREE.DoubleSide }), 0, 0.012, -0.0145, ear);
    inner.scale.set(0.58, 0.62, 1);
    inner.rotation.y = Math.PI;
    // 귓속 흰 털
    for (let i = 0; i < 3; i++) {
      const f = mesh(new THREE.ConeGeometry(0.006, 0.04, 5), lam('#fff8ee'), (i - 1) * 0.008, 0.03, -0.017, ear);
      f.rotation.z = (i - 1) * 0.35;
    }
    ears.push(ear);
  }
  let next = 2.5, flick = -1, side = 0;
  return (t, dt) => {
    next -= dt;
    if (next <= 0) { flick = 0; side = rng(Math.floor(t * 10))() < 0.5 ? 0 : 1; next = 2.5 + (Math.sin(t * 7) + 1) * 1.5; }
    const hit = sinceSwing(char);
    for (let i = 0; i < 2; i++) {
      let a = 0;
      if (flick >= 0 && i === side) a = Math.sin(Math.min(1, flick / 0.25) * Math.PI) * 0.35;
      if (hit < 0.3) a += Math.sin((hit / 0.3) * Math.PI) * 0.25;
      ears[i].rotation.x = 0.05 + a;
    }
    if (flick >= 0) { flick += dt; if (flick > 0.25) flick = -1; }
  };
};

// 파티 고깔: 보라 줄무늬 + 색종이 점 + 방울 + 반짝 술 + 턱끈
BUILD.party = (g) => {
  const tex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#7a5cff'; c.fillRect(0, 0, w, h);
    c.save();
    for (let i = -8; i < 16; i++) {
      c.fillStyle = i % 2 ? '#ff6fa8' : '#5fe0c8';
      c.beginPath(); c.moveTo(i * 64, h); c.lineTo(i * 64 + 26, h); c.lineTo(i * 64 + 26 + 256, 0); c.lineTo(i * 64 + 256, 0); c.fill();
    }
    c.restore();
    const r = rng(12), cols = ['#ffd23d', '#ffffff', '#ff9a40'];
    for (let i = 0; i < 60; i++) wrapX(w, r() * w, (x) => dot(c, x, r() * h, 6 + r() * 5, cols[i % 3]), 12);
  });
  const hat = grp(g, 0.035, HR - 0.03, 0.005);
  hat.rotation.set(0.05, 0, -0.24);
  mesh(new THREE.ConeGeometry(0.078, 0.21, 40, 1, true), lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0.105, 0, hat);
  // 아래 금색 술 테
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    mesh(new THREE.SphereGeometry(0.012, 8, 6), lam('#ffd23d', { emissive: '#5a3c00', emissiveIntensity: 0.3 }), Math.sin(a) * 0.079, 0.004, Math.cos(a) * 0.079, hat);
  }
  // 꼭대기 방울 + 반짝 술
  mesh(fuzzGeo(0.026, 0.18, 12), lam('#ffd23d'), 0, 0.215, 0, hat);
  const tinsel = lam('#ffe27a', { emissive: '#a07000', emissiveIntensity: 0.35 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = mesh(new THREE.BoxGeometry(0.004, 0.04, 0.002), tinsel, Math.sin(a) * 0.012, 0.235, Math.cos(a) * 0.012, hat);
    s.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
  }
  // 턱끈: 고깔 양쪽에서 볼을 지나 턱 밑으로
  const strap = lam('#f6f0ff');
  surfTube([[-0.05, 0.12, 0.0], [-0.13, 0.06, -0.04], [-0.14, -0.05, -0.06], [-0.07, -0.13, -0.06], [0, -0.15, -0.045], [0.07, -0.13, -0.06], [0.14, -0.05, -0.06], [0.14, 0.06, -0.03], [0.1, 0.12, 0.0]], 0.164, 0.0022, strap, g);
};

// 수건 양머리: 분홍 수건이 머리 위를 덮고, 양옆을 돌돌 말아 양 귀처럼
BUILD.towel = (g) => {
  const terry = (base) => canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 5000; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(150,40,70,0.13)'; dot(c, r() * w, r() * h, 1 + r() * 1.5, c.fillStyle); }
    // 끝단 줄무늬
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(0, h - 30, w, 6); c.fillRect(0, h - 18, w, 3);
  });
  const PINK = '#f7a3b6';
  const t1 = terry(PINK);
  const cover = mesh(capGeo(0.176, Math.PI * 0.47), lam('#ffffff', { map: t1 }), 0, 0, 0.005, g);
  cover.rotation.x = -0.22;
  cover.scale.set(1.02, 0.98, 1.02);
  // 이마 두른 부분 (두툼한 접힘)
  const fold = mesh(new THREE.TorusGeometry(0.17, 0.016, 10, 64), lam('#ffffff', { map: terry('#f497ac') }), 0, 0.03, 0.01, g);
  fold.rotation.x = Math.PI / 2 - 0.22;
  // 돌돌 말린 양쪽 (말린 끝에 소용돌이)
  const spiral = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = PINK; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c95a76'; c.lineWidth = 10;
    c.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.1) { const rr = 4 + a * 5.5; c.lineTo(w / 2 + Math.cos(a) * rr, h / 2 + Math.sin(a) * rr); }
    c.stroke();
    grain(c, w, h, 1500, 0.15, 9, false);
  });
  const side = lam('#ffffff', { map: terry(PINK) }), end = lam('#ffffff', { map: spiral });
  for (const d of [-1, 1]) {
    const roll = mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.17, 32, 1, false), [side, end, end], d * 0.098, 0.13, 0.0, g);
    roll.rotation.set(Math.PI / 2, 0, 0); // 앞뒤로 누운 돌돌이 → 앞에서 보면 소용돌이 두 개
  }
};

// 리본 머리띠: 가는 분홍 머리띠 + 왼쪽 위에 큰 땡땡이 리본
BUILD.ribbon = (g) => {
  const band = mesh(new THREE.TorusGeometry(0.168, 0.008, 8, 48, Math.PI), lam('#ff5f97'), 0, 0, 0.03, g);
  band.rotation.x = -0.25;
  band.scale.z = 1.6;
  const dots = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#ff6fa3'; c.fillRect(0, 0, w, h);
    for (let y = 16; y < h; y += 42) for (let x = (y / 42) % 2 ? 22 : 0; x < w; x += 44) dot(c, x, y, 8, '#ffffff');
    // 가운데 접힌 그림자
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const m = lam('#ffffff', { map: dots });
  const bow = grp(g, -0.095, 0.135, -0.03);
  bow.rotation.set(-0.35, 0.25, 0.55);
  bow.scale.setScalar(1.45);
  for (const d of [-1, 1]) {
    const loop = mesh(new THREE.TorusGeometry(0.034, 0.016, 12, 28), m, d * 0.04, 0.004, 0, bow);
    loop.scale.set(1.15, 0.78, 0.6);
    loop.rotation.z = d * 0.18;
    // 끈 꼬리
    const tail = new THREE.Shape();
    tail.moveTo(-0.01, 0); tail.lineTo(0.01, 0); tail.lineTo(0.016, -0.06); tail.lineTo(0.004, -0.05); tail.lineTo(-0.006, -0.062); tail.closePath();
    const tg = fitUV(new THREE.ExtrudeGeometry(tail, { depth: 0.004, bevelEnabled: false }));
    const tm = mesh(tg, m, d * 0.012, -0.006, 0.006, bow);
    tm.rotation.z = d * 0.45;
  }
  mesh(new THREE.SphereGeometry(0.018, 12, 10), m, 0, 0, 0, bow).scale.set(1, 1.1, 0.8);
};

/* ═════════════ 고급 ═════════════ */

// 토끼 귀: 긴 귀 두 개 (오른쪽은 반쯤 접힘). 칠 때 귀가 접혔다 펴진다
BUILD.bunny = (g, char) => {
  const fur = lam('#fbf8f2'), pink = lam('#ffb6c4');
  const ear = (d) => {
    const base = grp(g, d * 0.062, 0.135, 0.015);
    base.rotation.set(0.0, 0, -d * 0.2);
    const seg = (parent, len) => {
      const o = mesh(new THREE.CapsuleGeometry(0.036, len, 6, 14), fur, 0, len / 2 + 0.01, 0, parent);
      o.scale.z = 0.5;
      const i = mesh(new THREE.CapsuleGeometry(0.021, len * 0.9, 6, 10), pink, 0, len / 2 + 0.012, -0.013, parent);
      i.scale.z = 0.35;
    };
    seg(base, 0.09);
    const joint = grp(base, 0, 0.1, 0);
    seg(joint, 0.08);
    return { base, joint };
  };
  const L = ear(-1), R = ear(1);
  return (t) => {
    const h = sinceSwing(char);
    const fold = h < 0.45 ? Math.sin((h / 0.45) * Math.PI) : 0;
    L.joint.rotation.x = -0.08 + Math.sin(t * 1.7) * 0.04 - fold * 0.9;
    R.joint.rotation.x = 1.15 + Math.sin(t * 1.9 + 1) * 0.06 + fold * 0.4;
    L.base.rotation.x = Math.sin(t * 1.2) * 0.03 + fold * 0.25;
    R.base.rotation.x = Math.sin(t * 1.4 + 2) * 0.03 + fold * 0.25;
  };
};

// 요리사 모자: 주름진 높은 기둥 + 몽실한 위 + 이마 띠
BUILD.chef = (g) => {
  const pleat = canvasTex(1024, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const gr = c.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, 'rgba(120,110,100,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(120,110,100,0.22)');
      c.fillStyle = gr; c.fillRect(x, 0, 32, h);
    }
  });
  const hat = grp(g, 0, 0, 0.01);
  hat.rotation.x = 0.06;
  const cream = lam('#ffffff');
  // 이마 띠
  mesh(bandGeo(0.03, 0.085, 0.008), lam('#f4f1ec', { side: THREE.DoubleSide }), 0, 0, 0, hat);
  // 기둥 (살짝 퍼짐)
  const pts = [[0.148, 0.082], [0.146, 0.13], [0.152, 0.19], [0.168, 0.235]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(pts, 64), lam('#ffffff', { map: pleat, side: THREE.DoubleSide }), 0, 0, 0, hat);
  // 몽실한 위: 가장자리 볼록 8개 + 가운데 큰 것
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const puff = mesh(new THREE.SphereGeometry(0.07, 18, 12), cream, Math.sin(a) * 0.115, 0.258, Math.cos(a) * 0.115, hat);
    puff.scale.set(1, 0.72, 1);
  }
  const top = mesh(new THREE.SphereGeometry(0.135, 28, 16), cream, 0, 0.27, 0, hat);
  top.scale.set(1, 0.5, 1);
};

// 뽀글 파마: 동글동글 작은 곱슬이 머리 위·옆·뒤를 꽉 채운 아줌마 파마 (얼굴은 비움)
BUILD.perm = (g) => {
  const hair = phong('#4a2f34', { shininess: 50, specular: '#8a6060' });
  // 바탕 (틈 메우기)
  const base = mesh(capGeo(0.17, Math.PI * 0.64), hair, 0, 0, 0.01, g);
  base.rotation.x = 0.55; // 앞(이마)은 높게, 뒤(목덜미)는 낮게
  const N = 520, curls = [];
  const r = rng(77);
  for (let i = 0; i < N; i++) {
    // 고르게 퍼진 점 (피보나치 구)
    const y = 1 - (i + 0.5) / N * 2, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
    const v = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
    // 머리 선: 앞(-z)은 이마 위까지, 옆은 귀 아래까지, 뒤는 목덜미까지
    const front = -v.z;
    const limit = front > 0.3 ? 0.42 - 0.2 * (front - 0.3) : front > -0.2 ? -0.2 : -0.5;
    if (v.y < limit) continue;
    curls.push(v.multiplyScalar(0.178 + r() * 0.012));
  }
  const geo = new THREE.TorusGeometry(0.02, 0.011, 8, 14); // 돌돌 말린 곱슬
  const inst = new THREE.InstancedMesh(geo, hair, curls.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  curls.forEach((p, i) => {
    const k = 0.85 + r() * 0.45;
    s.set(k, k * 0.9, k);
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
  });
  inst.castShadow = true;
  g.add(inst);
  // 위쪽 볼륨
  const top = mesh(new THREE.SphereGeometry(0.15, 24, 14), hair, 0, 0.07, 0.03, g);
  top.scale.set(1.05, 0.95, 1.05);
};

// 바가지 머리: 눈썹 위에서 일자로 자른 동글 단발 (윤기 띠)
BUILD.bowl = (g) => {
  const tex = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = '#231b18'; c.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 900; i++) { const x = r() * w; c.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,90,70'},${0.2 + r() * 0.3})`; c.lineWidth = 1 + r() * 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 10, h); c.stroke(); }
    // 윤기 띠
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,240,220,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const hair = phong('#ffffff', { map: tex, shininess: 60, specular: '#444444', side: THREE.DoubleSide });
  const cap = grp(g, 0, 0, 0.005);
  cap.rotation.x = -0.18;
  const th = Math.PI * 0.56;
  mesh(capGeo(0.178, th), hair, 0, 0, 0, cap);
  // 자른 끝 (두께)
  const er = 0.178 * Math.sin(th), ey = 0.178 * Math.cos(th);
  const edge = mesh(new THREE.TorusGeometry(er - 0.004, 0.008, 8, 64), phong('#1c1513', { shininess: 40 }), 0, ey, 0, cap);
  edge.rotation.x = Math.PI / 2;
  // 정수리 가마
  mesh(new THREE.SphereGeometry(0.02, 10, 8), phong('#231b18', { shininess: 50 }), 0.02, 0.175, 0.03, cap).scale.y = 0.4;
};

// 갓: 비치는 검은 갓 (넓은 챙 + 높은 대우) + 망건 + 상투 + 구슬 갓끈
BUILD.gat = (g) => {
  const mesh2 = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#4a4a50'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#121214'; c.lineWidth = 2;
    for (let x = 0; x < w; x += 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y < h; y += 6) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  const see = (o = {}) => {
    const m = lam('#ffffff', { map: mesh2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, ...o });
    m.userData.baseOp = 0.8;
    return m;
  };
  // 망건 (이마 검은 띠) + 상투
  mesh(bandGeo(0.035, 0.085, 0.004), lam('#1a1a1c', { side: THREE.DoubleSide }), 0, 0, 0, g);
  mesh(new THREE.CapsuleGeometry(0.026, 0.03, 6, 12), lam('#1a1412'), 0, HR + 0.03, 0.0, g);
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 8), lam('#d9c070'), 0, HR + 0.04, 0, g).rotation.z = Math.PI / 2; // 동곳
  const hat = grp(g, 0, 0.12, 0);
  // 챙: 살짝 아래로 처짐
  const brimGeo = new THREE.RingGeometry(0.075, 0.3, 64, 4);
  brimGeo.rotateX(-Math.PI / 2);
  const bp = brimGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), rr = Math.hypot(x, z); bp.setY(i, -Math.pow(Math.max(0, rr - 0.12), 2) * 0.9); }
  brimGeo.computeVertexNormals();
  const brim = mesh(brimGeo, see(), 0, 0, 0, hat);
  brim.renderOrder = 2;
  // 대우 (윗부분)
  const crown = mesh(new THREE.CylinderGeometry(0.07, 0.078, 0.135, 40, 1, false), see(), 0, 0.068, 0, hat);
  crown.renderOrder = 2;
  const rim = mesh(new THREE.TorusGeometry(0.3, 0.003, 4, 80), lam('#111113'), 0, -0.029, 0, hat);
  rim.rotation.x = Math.PI / 2;
  // 갓끈: 호박색 구슬 줄 (챙 아래에서 볼을 지나 가슴께로)
  const bead = phong('#d9893a', { shininess: 80, specular: '#ffe0b0' });
  const bead2 = phong('#2a1e18', { shininess: 80 });
  for (const d of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(d * 0.075, 0.115, -0.02), new THREE.Vector3(d * 0.15, 0.03, -0.07), new THREE.Vector3(d * 0.12, -0.1, -0.12), new THREE.Vector3(d * 0.06, -0.24, -0.16), new THREE.Vector3(d * 0.03, -0.33, -0.17)]);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const p = curve.getPoint(i / (n - 1));
      mesh(new THREE.SphereGeometry(i % 3 === 0 ? 0.0085 : 0.007, 8, 6), i % 3 === 0 ? bead2 : bead, p.x, p.y, p.z, g);
    }
  }
};

// 안전모: 노란 플라스틱 (가운데 능선 + 앞 챙) + 초록 십자 '안전제일' 스티커
BUILD.hardhat = (g) => {
  const Y = '#ffc61e';
  const plastic = phong(Y, { shininess: 90, specular: '#fff4c0' });
  const hat = grp(g, 0, 0.0, 0.005);
  hat.rotation.x = -0.06;
  const prof = [[0.186, 0.0], [0.186, 0.02], [0.178, 0.075], [0.155, 0.135], [0.115, 0.178], [0.06, 0.2], [0.0001, 0.205]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y)); // 돌림체 점은 아래→위 (겉면이 밖을 보게)
  mesh(new THREE.LatheGeometry(pts, 64), plastic, 0, 0, 0, hat);
  // 챙: 앞이 더 나옴
  const brimGeo = new THREE.RingGeometry(0.184, 0.225, 64, 1);
  brimGeo.rotateX(-Math.PI / 2);
  const bp = brimGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i), rr = Math.hypot(x, z);
    const front = Math.max(0, -z / rr);
    const k = rr > 0.2 ? 1 + front * front * 0.3 : 1;
    bp.setZ(i, z * k);
    bp.setY(i, -(rr - 0.184) * 0.25 - (k - 1) * 0.03);
  }
  brimGeo.computeVertexNormals();
  mesh(brimGeo, phong(Y, { shininess: 90, specular: '#fff4c0', side: THREE.DoubleSide }), 0, 0.002, 0, hat);
  const lip = mesh(new THREE.TorusGeometry(0.186, 0.005, 6, 64), plastic, 0, 0.001, 0, hat);
  lip.rotation.x = Math.PI / 2;
  // 가운데 능선 (앞→뒤)
  profileTube(prof.slice(1), 0.006, 0.011, plastic, hat);
  // 스티커 (앞)
  const st = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 18); c.fill();
    c.fillStyle = '#1f9d4a'; c.fillRect(w * 0.12, h * 0.3, 52, 16); c.fillRect(w * 0.12 + 18, h * 0.3 - 18, 16, 52);
    c.fillStyle = '#1f9d4a'; c.font = 'bold 44px Jua, sans-serif'; c.textBaseline = 'middle';
    c.fillText('안전', w * 0.45, h * 0.32); c.fillText('제일', w * 0.45, h * 0.72);
  });
  const sticker = mesh(new THREE.CylinderGeometry(0.168, 0.176, 0.06, 24, 1, true, Math.PI - 0.38, 0.76), lam('#ffffff', { map: st, transparent: true, side: THREE.DoubleSide }), 0, 0.1, 0, hat);
  sticker.rotation.x = -0.32;
  sticker.position.z = -0.03;
  sticker.material.userData.baseOp = 1;
  // 턱끈
  surfTube([[-0.17, 0.0, 0.0], [-0.15, -0.07, -0.04], [-0.07, -0.15, -0.05], [0, -0.165, -0.03], [0.07, -0.15, -0.05], [0.15, -0.07, -0.04], [0.17, 0.0, 0.0]], 0.166, 0.004, lam('#3b3b40'), g);
};

// 개구리 모자: 초록 털모자 위에 큰 눈 두 개 + 웃는 입 + 볼 터치
BUILD.frog = (g) => {
  const G = '#69c24a';
  const knit = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = G; c.fillRect(0, 0, w, h);
    grain(c, w, h, 4000, 0.12, 14);
    grain(c, w, h, 2000, 0.15, 15, false);
  });
  const green = lam('#ffffff', { map: knit });
  const hat = grp(g, 0, 0, 0.005);
  hat.rotation.x = -0.15;
  const cap = mesh(capGeo(0.176, Math.PI * 0.58), green, 0, 0, 0, hat);
  cap.scale.y = 1.05;
  const cuff = mesh(new THREE.TorusGeometry(0.17, 0.014, 10, 64), lam('#57ad3a'), 0, -0.04, 0, hat);
  cuff.rotation.x = Math.PI / 2;
  // 눈 두 개
  for (const d of [-1, 1]) {
    const eye = grp(hat, d * 0.072, 0.165, -0.04);
    mesh(new THREE.SphereGeometry(0.052, 20, 14), green, 0, 0, 0, eye);
    mesh(new THREE.SphereGeometry(0.044, 20, 14), lam('#ffffff'), 0, 0.006, -0.018, eye);
    mesh(new THREE.SphereGeometry(0.024, 16, 12), phong('#1d1d20', { shininess: 80 }), d * 0.004, 0.008, -0.052, eye);
    mesh(new THREE.SphereGeometry(0.008, 8, 6), lam('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), d * 0.004 + 0.008, 0.018, -0.072, eye);
    // 볼 터치
    const ch = mesh(new THREE.CircleGeometry(0.018, 16), lam('#ff9fb0'), d * 0.115, 0.105, -0.125, hat);
    ch.lookAt(d * 0.115 * 3, 0.105 * 2, -0.4);
  }
  // 웃는 입 (모자 앞)
  surfTube([[-0.07, 0.1, -0.16], [-0.035, 0.085, -0.172], [0, 0.08, -0.176], [0.035, 0.085, -0.172], [0.07, 0.1, -0.16]], 0.181, 0.004, lam('#2e6a1f'), hat);
};

// 밀짚모자: 넓은 챙 밀짚 (엮은 무늬) + 빨간 띠 + 히비스커스 꽃
BUILD.straw = (g) => {
  const weave = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#e6c477'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 12) {
      for (let x = (y / 12) % 2 ? 0 : 10; x < w; x += 20) {
        c.fillStyle = 'rgba(160,110,40,0.35)'; c.fillRect(x, y, 10, 12);
        c.fillStyle = 'rgba(255,240,200,0.35)'; c.fillRect(x + 1, y + 1, 8, 3);
      }
    }
    grain(c, w, h, 3000, 0.15, 16);
  });
  const hat = grp(g, 0, 0.065, 0.005);
  hat.rotation.set(0.1, 0, 0.06);
  const pts = [[0.0001, 0.115], [0.08, 0.112], [0.112, 0.095], [0.122, 0.05], [0.124, 0.02], [0.14, 0.012], [0.22, 0.0], [0.29, -0.015], [0.305, -0.022]].map(([r, y]) => new THREE.Vector2(r, y));
  weave.repeat.set(1, 1);
  mesh(new THREE.LatheGeometry(pts, 72), lam('#ffffff', { map: weave, side: THREE.DoubleSide }), 0, 0, 0, hat);
  const edge = mesh(new THREE.TorusGeometry(0.305, 0.006, 6, 80), lam('#d1ab5c'), 0, -0.022, 0, hat);
  edge.rotation.x = Math.PI / 2;
  // 빨간 띠
  mesh(new THREE.CylinderGeometry(0.124, 0.126, 0.035, 64, 1, true), lam('#e0393f', { side: THREE.DoubleSide }), 0, 0.04, 0, hat);
  // 히비스커스 (오른쪽 옆)
  const fl = grp(hat, 0.125, 0.045, -0.02);
  fl.rotation.set(0, Math.PI / 2 + 0.3, 0);
  const petal = lam('#ff4f7b');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = mesh(new THREE.SphereGeometry(0.026, 14, 10), petal, Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0, fl);
    p.scale.set(1.1, 0.9, 0.35);
    p.rotation.z = a;
  }
  mesh(new THREE.SphereGeometry(0.012, 10, 8), lam('#c21f4f'), 0, 0, 0.004, fl);
  const pistil = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 6), lam('#ffd23d'), 0, 0, 0.02, fl);
  pistil.rotation.x = Math.PI / 2 - 0.4;
  mesh(new THREE.SphereGeometry(0.007, 8, 6), lam('#ffd23d'), 0, 0.008, 0.038, fl);
};

// 머리 위 귤: 오렌지 껍질 (오톨도톨) + 꼭지 + 잎 하나. 살짝 흔들
BUILD.tangerine = (g) => {
  const peel = canvasTex(512, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff9a1c'); gr.addColorStop(1, '#f07c0c');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h; dot(c, x, y, 1.5 + r() * 1.5, r() < 0.5 ? 'rgba(200,80,0,0.35)' : 'rgba(255,200,120,0.4)'); }
  });
  const bump = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    const r = rng(18);
    for (let i = 0; i < 3000; i++) dot(c, r() * w, r() * h, 1.5 + r() * 2, 'rgba(30,30,30,0.6)');
  });
  bump.colorSpace = THREE.NoColorSpace;
  const root = grp(g, 0, HR - 0.012, 0.005);
  const fruit = grp(root);
  const o = mesh(new THREE.SphereGeometry(0.098, 36, 24), phong('#ffffff', { map: peel, bumpMap: bump, bumpScale: 1.2, shininess: 40, specular: '#664422' }), 0, 0.075, 0, fruit);
  o.scale.y = 0.8;
  // 꼭지 (초록 별) + 잎
  const calyx = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.006, 6), lam('#4e8a2a'), 0, 0.153, 0, fruit);
  calyx.rotation.y = 0.3;
  mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.016, 6), lam('#5a7a2a'), 0, 0.161, 0, fruit);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.bezierCurveTo(0.015, 0.025, 0.05, 0.025, 0.07, 0); leafShape.bezierCurveTo(0.05, -0.025, 0.015, -0.025, 0, 0);
  const lg = new THREE.ShapeGeometry(leafShape, 10);
  const lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i); lp.setZ(i, -x * x * 3); }
  lg.computeVertexNormals();
  const leaf = mesh(lg, phong('#3f9a2e', { side: THREE.DoubleSide, shininess: 60 }), 0.002, 0.163, 0, fruit);
  leaf.rotation.set(-Math.PI / 2 + 0.5, 0, 0.6);
  return (t) => {
    fruit.rotation.z = Math.sin(t * 2.3) * 0.05;
    fruit.rotation.x = Math.sin(t * 1.9 + 1) * 0.04;
  };
};

// 게이밍 헤드셋: 검은 머리띠 + 귀 덮개(무지개 불빛 고리) + 마이크
BUILD.headset = (g) => {
  const black = phong('#2a2a30', { shininess: 60, specular: '#555560' });
  const soft = lam('#3a3a42');
  const band = mesh(new THREE.TorusGeometry(0.18, 0.012, 10, 48, Math.PI), black, 0, 0.0, 0.005, g);
  band.scale.z = 1.8;
  const pad = mesh(new THREE.TorusGeometry(0.168, 0.012, 10, 40, Math.PI * 0.5), soft, 0, 0, 0.005, g);
  pad.rotation.z = Math.PI * 0.25;
  pad.scale.z = 2.0;
  const glows = [];
  for (const d of [-1, 1]) {
    const cup = grp(g, d * 0.172, -0.005, 0.0);
    cup.rotation.z = (d * Math.PI) / 2;
    mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.04, 32), black, 0, d * 0.0, 0, cup);
    const cush = mesh(new THREE.TorusGeometry(0.052, 0.014, 10, 32), soft, 0, d * -0.018, 0, cup);
    cush.rotation.x = Math.PI / 2;
    const glow = new THREE.MeshLambertMaterial({ color: '#000000', emissive: '#ff3d7f', emissiveIntensity: 1 });
    const ring = mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 40), glow, 0, d * 0.021, 0, cup);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24), phong('#1a1a1e', { shininess: 90 }), 0, d * 0.022, 0, cup);
    glows.push(glow);
    // 머리띠와 이음
    mesh(new THREE.BoxGeometry(0.012, 0.05, 0.018), black, 0, d * 0.0, 0, grp(g, d * 0.178, 0.06, 0.005));
  }
  // 마이크 (왼쪽에서 입 앞으로)
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.19, -0.02, -0.01), new THREE.Vector3(-0.17, -0.08, -0.08), new THREE.Vector3(-0.1, -0.11, -0.15), new THREE.Vector3(-0.04, -0.105, -0.175)]);
  mesh(new THREE.TubeGeometry(curve, 24, 0.005, 8), black, 0, 0, 0, g);
  mesh(new THREE.SphereGeometry(0.015, 12, 10), lam('#1c1c20'), -0.035, -0.105, -0.177, g).scale.set(1.3, 1, 1);
  const c = new THREE.Color();
  return (t) => { glows.forEach((m, i) => { c.setHSL((t * 0.18 + i * 0.5) % 1, 1, 0.55); m.emissive.copy(c); }); };
};

// 합격 머리띠: 흰 띠 + 빨간 '합격' + 뒤 매듭과 펄럭이는 끈
BUILD.pass = (g) => {
  const b = grp(g);
  b.rotation.x = -0.28;
  const tex = canvasTex(1024, 64, (c, w, h) => {
    c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, w, h);
    grain(c, w, h, 1500, 0.08, 23);
    c.fillStyle = '#d81e2c'; c.fillRect(0, 2, w, 4); c.fillRect(0, h - 6, w, 4);
    c.font = 'bold 50px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('합 격', w * FRONT_U, h / 2 + 3);
    dot(c, w * FRONT_U - 82, h / 2, 9, '#d81e2c'); dot(c, w * FRONT_U + 82, h / 2, 9, '#d81e2c');
  });
  mesh(bandGeo(0.015, 0.075, 0.007), lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0, 0, b);
  // 뒤 매듭 + 끈 두 가닥
  const cloth = lam('#fbfaf6', { side: THREE.DoubleSide });
  const knotY = 0.045, knotZ = Math.sqrt(HR * HR - knotY * knotY) + 0.012;
  mesh(new THREE.SphereGeometry(0.018, 12, 10), cloth, 0, knotY, knotZ, b).scale.set(1.2, 0.9, 0.8);
  const tails = [];
  for (const d of [-1, 1]) {
    const tail = grp(b, d * 0.008, knotY, knotZ + 0.004);
    const geo = new THREE.PlaneGeometry(0.03, 0.17, 1, 8);
    geo.translate(0, -0.085, 0);
    mesh(geo, cloth, 0, 0, 0, tail);
    tail.rotation.set(0.25, 0, d * 0.3);
    tails.push(tail);
  }
  return (t) => { tails.forEach((tl, i) => { tl.rotation.x = 0.3 + Math.sin(t * 5 + i) * 0.12; tl.rotation.y = Math.sin(t * 3.7 + i * 2) * 0.25; }); };
};

// 등산 모자: 카키 사파리 모자 (그물 숨구멍 + 박음질 챙) + 턱끈과 조임 알
BUILD.hiking = (g) => {
  const khaki = '#a89a6a';
  const tex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = khaki; c.fillRect(0, 0, w, h);
    grain(c, w, h, 5000, 0.1, 26);
    // 위(대우) 옆 그물
    for (let y = h * 0.28; y < h * 0.4; y += 6) for (let x = 0; x < w; x += 6) dot(c, x, y, 1.6, 'rgba(40,36,20,0.6)');
    // 챙 박음질 (가로 줄)
    c.strokeStyle = 'rgba(70,60,30,0.5)'; c.setLineDash([8, 6]); c.lineWidth = 2;
    for (let y = h * 0.62; y < h; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.setLineDash([]);
  });
  const hat = grp(g, 0, 0.035, 0.005);
  hat.rotation.x = -0.04;
  const pts = [[0.0001, 0.125], [0.1, 0.12], [0.138, 0.09], [0.15, 0.03], [0.152, 0.005], [0.18, -0.008], [0.235, -0.03], [0.248, -0.04]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(pts, 64), lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0, 0, hat);
  mesh(new THREE.CylinderGeometry(0.151, 0.153, 0.028, 64, 1, true), lam('#6b5f3a', { side: THREE.DoubleSide }), 0, 0.02, 0, hat);
  // 작은 상표
  const lb = mesh(new THREE.BoxGeometry(0.035, 0.016, 0.003), lam('#d9452f'), 0, 0.02, -0.153, hat);
  lb.lookAt(0, 0.02, -1);
  // 턱끈 + 조임 알
  const cord = lam('#3a3426');
  surfTube([[-0.15, 0.04, 0.0], [-0.15, -0.05, -0.04], [-0.08, -0.14, -0.06], [0, -0.165, -0.045], [0.08, -0.14, -0.06], [0.15, -0.05, -0.04], [0.15, 0.04, 0.0]], 0.168, 0.0025, cord, g);
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.018, 10), lam('#222'), 0, -0.168, -0.05, g);
};

// 꽃무늬 두건 (할머니): 보라 꽃무늬 천이 얼굴 둘레를 감싸고 턱 밑에서 묶음
BUILD.scarf = (g) => {
  const tex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#7a45b4'; c.fillRect(0, 0, w, h);
    const r = rng(41), cols = ['#ff5f86', '#ffd23d', '#ff9a40', '#ffffff'];
    for (let i = 0; i < 110; i++) {
      const x = r() * w, y = r() * h, s = 14 + r() * 10, col = cols[Math.floor(r() * 4)];
      wrapX(w, x, (xx) => {
        c.fillStyle = '#3fb06a';
        c.beginPath(); c.ellipse(xx + s, y + s * 0.6, s * 0.7, s * 0.3, 0.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = col;
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; c.beginPath(); c.ellipse(xx + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.5, s * 0.36, a, 0, Math.PI * 2); c.fill(); }
        dot(c, xx, y, s * 0.3, '#7a45b4');
      }, 40);
    }
    grain(c, w, h, 3000, 0.1, 42);
  });
  // 구 껍질에서 얼굴 자리(앞 동그란 구멍)와 목 아래를 뺀다
  const R = 0.176, OPEN = 0.92, BOTTOM = -0.72;
  const full = new THREE.SphereGeometry(R, 64, 40);
  const pos = full.attributes.position, idx = full.index.array, keep = [];
  const v = new THREE.Vector3();
  const isOpen = (i) => { v.fromBufferAttribute(pos, i).normalize(); return Math.acos(Math.min(1, -v.z)) < OPEN || v.y < BOTTOM; };
  for (let i = 0; i < idx.length; i += 3) if (!(isOpen(idx[i]) || isOpen(idx[i + 1]) || isOpen(idx[i + 2]))) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  full.setIndex(keep);
  const cloth = lam('#ffffff', { map: tex, side: THREE.DoubleSide });
  const shell = mesh(full, cloth, 0, 0.012, 0.004, g);
  shell.scale.set(1.02, 1.04, 1.02);
  // 얼굴 둘레 단 (말린 끝)
  const hem = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const d = new THREE.Vector3(Math.sin(OPEN) * Math.cos(a), Math.sin(OPEN) * Math.sin(a), -Math.cos(OPEN));
    if (d.y < -0.6) continue;
    hem.push(d);
  }
  // 아래쪽이 빈 고리 → 오른쪽 아래부터 위를 돌아 왼쪽 아래까지
  const start = hem.findIndex((d, i) => i > 0 && hem[i - 1].y < -0.55);
  const ordered = start > 0 ? hem.slice(start).concat(hem.slice(0, start)) : hem;
  const curve = new THREE.CatmullRomCurve3(ordered.map((d) => d.clone().multiplyScalar(R * 1.03).add(new THREE.Vector3(0, 0.012, 0.004))));
  mesh(new THREE.TubeGeometry(curve, 80, 0.008, 6, false), lam('#ffffff', { map: tex }), 0, 0, 0, g);
  // 턱 밑 매듭 + 짧은 끝 두 개
  const knot = grp(g, 0, -0.158, -0.085);
  mesh(new THREE.SphereGeometry(0.024, 14, 10), cloth, 0, 0, 0, knot).scale.set(1.3, 0.9, 1);
  for (const d of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.03, -0.012); s.lineTo(0.05, -0.05); s.lineTo(0.008, -0.03); s.closePath();
    const t = mesh(fitUV(new THREE.ShapeGeometry(s)), cloth, 0, -0.005, -0.012, knot);
    t.scale.x = d;
    t.rotation.x = -0.4;
  }
};

// 나이트캡: 별 잠옷과 같은 하늘색 별무늬 고깔이 옆으로 축 늘어짐 + 흰 털 단 + 방울 (살랑)
BUILD.nightcap = (g) => {
  const tex = canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#a9c8f2'; c.fillRect(0, 0, w, h);
    const r = rng(52);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h;
      wrapX(w, x, (xx) => {
        if (i % 4 === 0) { dot(c, xx, y, 14, '#fff2a8'); dot(c, xx + 7, y - 4, 12, '#a9c8f2'); }
        else starPath(c, xx, y, 13, 5.5, '#ffe14a', -Math.PI / 2 + r() * 0.6);
      }, 20);
    }
    for (let i = 0; i < 160; i++) dot(c, r() * w, r() * h, 2, '#ffffff');
  });
  const root = grp(g, 0, 0.045, 0.01);
  // 고깔을 만들고 위로 갈수록 오른쪽 아래로 휘게
  const H = 0.36;
  const geo = new THREE.ConeGeometry(0.172, H, 40, 30, true);
  geo.translate(0, H / 2, 0);
  const bend = (h) => ({ x: 0.2 * h * h, y: -0.05 * h * h * h });
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / H;
    const b = bend(h);
    p.setXYZ(i, p.getX(i) + b.x, p.getY(i) * (1 - 0.12 * h * h) + b.y, p.getZ(i));
  }
  geo.computeVertexNormals();
  const cap = grp(root);
  mesh(geo, lam('#ffffff', { map: tex, side: THREE.DoubleSide }), 0, 0, 0, cap);
  const tip = bend(1);
  const pom = mesh(fuzzGeo(0.034, 0.16, 12), lam('#fffaf0'), tip.x, H * 0.88 + tip.y, 0, cap);
  const cuff = mesh(fuzzTorus(0.172, 0.022), lam('#ffffff'), 0, 0.0, 0, root);
  cuff.rotation.x = Math.PI / 2;
  return (t) => {
    cap.rotation.z = Math.sin(t * 1.4) * 0.05;
    cap.rotation.x = Math.sin(t * 1.1 + 1) * 0.04;
    pom.rotation.y = t * 0.5;
  };
};
// 보송한 고리 (털 단)
function fuzzTorus(R, r) {
  const geo = new THREE.TorusGeometry(R, r, 12, 64);
  const p = geo.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.y, v.x);
    c.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const d = v.clone().sub(c);
    const n = Math.sin(a * 37) * Math.sin(Math.atan2(d.z, d.length()) * 5 + a * 11);
    d.multiplyScalar(1 + 0.18 * n);
    p.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// 기사 투구: 머리 전체를 덮는 은색 통투구 (눈 틈 + 숨구멍 + 금 십자 장식) + 빨간 깃털
BUILD.helm = (g) => {
  const env = envCube('steel');
  const brushed = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#c9ced8'; c.fillRect(0, 0, w, h);
    const r = rng(61);
    for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,66,80'},${r() * 0.12})`; c.fillRect(0, r() * h, w, 1); }
  });
  const steel = phong('#ffffff', { map: brushed, shininess: 120, specular: '#ffffff', envMap: env, combine: THREE.MixOperation, reflectivity: 0.5 });
  const gold = phong('#f2c230', { shininess: 100, specular: '#fff0b0', envMap: envCube('studio'), combine: THREE.MixOperation, reflectivity: 0.25 });
  const dark = lam('#141418');
  const prof = [[0.176, -0.21], [0.18, -0.2], [0.188, -0.15], [0.193, -0.06], [0.192, 0.04], [0.178, 0.12], [0.135, 0.18], [0.07, 0.207], [0.0001, 0.212]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const helm = grp(g);
  mesh(new THREE.LatheGeometry(pts, 64), steel, 0, 0, 0, helm);
  // 눈 틈 (가로) — 위아래 능선 사이 어두운 틈
  const slit = mesh(new THREE.CylinderGeometry(0.191, 0.191, 0.02, 32, 1, true, Math.PI - 0.85, 1.7), lam('#08080a', { side: THREE.DoubleSide }), 0, 0.03, 0, helm);
  slit.scale.set(1.01, 1, 1.01);
  for (const y of [0.048, 0.012]) {
    const ridge = mesh(new THREE.TorusGeometry(0.195, 0.006, 6, 40, 1.8), steel, 0, y, 0, helm);
    ridge.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.6);
  }
  // 숨구멍 (오른쪽 아래)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const a = Math.PI + 0.2 + i * 0.11, y = -0.04 - j * 0.035;
    const r = 0.19;
    const h = mesh(new THREE.CircleGeometry(0.0065, 10), dark, Math.sin(a) * r * -1, y, Math.cos(a) * r, helm);
    h.lookAt(Math.sin(a) * -2, y, Math.cos(a) * 2);
  }
  // 아래 테
  const rim = mesh(new THREE.TorusGeometry(0.177, 0.008, 6, 64), gold, 0, -0.205, 0, helm);
  rim.rotation.x = Math.PI / 2;
  // 빨간 깃털 (정수리에서 뒤로)
  const plume = grp(helm, 0, 0.2, 0.02);
  mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.03, 12), gold, 0, 0.012, 0, plume);
  const feather = [lam('#d8333a'), lam('#e8564a'), lam('#b8202c')];
  const feathers = [];
  for (let i = 0; i < 9; i++) {
    const f = grp(plume, 0, 0.02, 0);
    const k = (i - 4) / 4;
    f.rotation.set(-0.5 - i * 0.16, 0, k * 0.25);
    const m = mesh(new THREE.SphereGeometry(0.03, 12, 8), feather[i % 3], 0, 0.08, 0, f);
    m.scale.set(0.7, 3.0, 0.35);
    feathers.push(f);
  }
  return (t) => { feathers.forEach((f, i) => { f.rotation.z = ((i - 4) / 4) * 0.25 + Math.sin(t * 2.5 + i * 0.6) * 0.04; }); };
};

// 영웅 가면: 빨간 눈 가면 (흰 눈구멍) + 뒤로 묶은 끈 (펄럭)
BUILD.mask = (g) => {
  const RED = '#d8333a';
  const s = new THREE.Shape();
  // 가면 모양 (x: 좌우, y: 위아래), 가운데 콧등이 살짝 내려옴
  s.moveTo(-0.15, 0.03);
  s.bezierCurveTo(-0.13, 0.072, -0.05, 0.078, 0, 0.05);
  s.bezierCurveTo(0.05, 0.078, 0.13, 0.072, 0.15, 0.03);
  s.bezierCurveTo(0.155, -0.02, 0.12, -0.06, 0.07, -0.055);
  s.bezierCurveTo(0.03, -0.05, 0.015, -0.025, 0, -0.03);
  s.bezierCurveTo(-0.015, -0.025, -0.03, -0.05, -0.07, -0.055);
  s.bezierCurveTo(-0.12, -0.06, -0.155, -0.02, -0.15, 0.03);
  const eyeShape = (d) => {
    const e = new THREE.Path();
    e.moveTo(d * 0.03, 0.012);
    e.bezierCurveTo(d * 0.042, 0.036, d * 0.092, 0.036, d * 0.104, 0.014);
    e.bezierCurveTo(d * 0.1, -0.018, d * 0.044, -0.022, d * 0.03, 0.012);
    return e;
  };
  // 머리 앞면에 감기게: (x, y) → 반지름 R 구 위로. 큰 삼각형은 구 안으로 파묻히므로 촘촘한 판에서 모양 안쪽만 남긴다
  const outerPts = s.getPoints(24), holes = [eyeShape(-1).getPoints(16), eyeShape(1).getPoints(16)];
  const inside = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const toSphere = (x, y, r) => { const ax = x / r, ay = (y + 0.03) / r; return new THREE.Vector3(Math.sin(ax) * Math.cos(ay) * r, Math.sin(ay) * r, -Math.cos(ax) * Math.cos(ay) * r); };
  const sheet = (keep, r) => {
    const geo = new THREE.PlaneGeometry(0.34, 0.16, 85, 40);
    const p = geo.attributes.position, idx = geo.index.array, kept = [];
    for (let i = 0; i < idx.length; i += 3) {
      const cx = (p.getX(idx[i]) + p.getX(idx[i + 1]) + p.getX(idx[i + 2])) / 3, cy = (p.getY(idx[i]) + p.getY(idx[i + 1]) + p.getY(idx[i + 2])) / 3;
      if (keep(cx, cy)) kept.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    geo.setIndex(kept);
    for (let i = 0; i < p.count; i++) { const v = toSphere(p.getX(i), p.getY(i), r); p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    return geo;
  };
  const red = phong(RED, { shininess: 70, specular: '#ffb0a0', side: THREE.DoubleSide });
  mesh(sheet((x, y) => inside(outerPts, x, y) && !holes.some((h) => inside(h, x, y)), 0.169), red, 0, 0, 0, g);
  // 가장자리 두께 (바깥 테 + 눈 테)
  const rimM = phong('#b8222b', { shininess: 70 });
  for (const pts of [outerPts, ...holes]) {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => toSphere(q.x, q.y, 0.169)), true);
    mesh(new THREE.TubeGeometry(curve, 120, 0.0035, 6, true), rimM, 0, 0, 0, g);
  }
  // 흰 눈 (렌즈)
  const lensM = phong('#ffffff', { shininess: 90, emissive: '#ffffff', emissiveIntensity: 0.15, side: THREE.DoubleSide });
  mesh(sheet((x, y) => holes.some((h) => inside(h, x, y)), 0.1665), lensM, 0, 0, 0, g);
  // 끈 (가면 양끝에서 뒤로)
  const strapY = 0.035;
  const band = mesh(bandGeo(strapY - 0.012, strapY + 0.012, 0.004), lam(RED, { side: THREE.DoubleSide }), 0, 0, 0, g);
  band.rotation.x = -0.05;
  const kz = Math.sqrt(HR * HR - strapY * strapY) + 0.01;
  const knot = grp(g, 0, strapY, kz);
  mesh(new THREE.SphereGeometry(0.016, 10, 8), lam(RED), 0, 0, 0, knot).scale.set(1.3, 0.9, 0.8);
  const tails = [];
  for (const d of [-1, 1]) {
    const tail = grp(knot, d * 0.008, 0, 0.004);
    const geo = new THREE.PlaneGeometry(0.022, 0.16, 1, 8);
    geo.translate(0, -0.08, 0);
    mesh(geo, lam(RED, { side: THREE.DoubleSide }), 0, 0, 0, tail);
    tails.push(tail);
  }
  return (t) => { tails.forEach((tl, i) => { tl.rotation.x = 0.7 + Math.sin(t * 6 + i * 1.3) * 0.2; tl.rotation.z = (i ? 1 : -1) * 0.35 + Math.sin(t * 4.2 + i) * 0.1; }); };
};

export const HATS = [
  ['band', '빨간 헤어밴드', 'common'],
  ['cap', '야구 모자', 'common'],
  ['beanie', '털 비니', 'common'],
  ['sprout', '새싹', 'common'],
  ['cat', '고양이 귀', 'common'],
  ['party', '파티 고깔', 'common'],
  ['towel', '수건 양머리', 'common'],
  ['ribbon', '리본 머리띠', 'common'],
  ['bunny', '토끼 귀', 'rare'],
  ['chef', '요리사 모자', 'rare'],
  ['perm', '뽀글 파마', 'rare'],
  ['bowl', '바가지 머리', 'rare'],
  ['gat', '갓', 'rare'],
  ['hardhat', '안전모', 'rare'],
  ['frog', '개구리 모자', 'rare'],
  ['straw', '밀짚모자', 'rare'],
  ['tangerine', '머리 위 귤', 'rare'],
  ['headset', '게이밍 헤드셋', 'rare'],
  ['pass', '합격 머리띠', 'rare'],
  ['hiking', '등산 모자', 'rare'],
  ['scarf', '꽃무늬 두건', 'rare'],
  ['nightcap', '나이트캡', 'rare'],
  ['helm', '기사 투구', 'rare'],
  ['mask', '영웅 가면', 'rare'],
].map(([id, name, grade]) => ({ id, name, grade }));

// 얼굴 아이템을 가리는 머리 (투구·가면)
const HIDE_FACE = new Set(['helm', 'mask']);

// 머리 만들기: { group, update(t, dt) | null, hideFace }
export function makeHat(id, char) {
  if (!BUILD[id]) return null;
  const group = new THREE.Group();
  const update = BUILD[id](group, char) || null;
  return { group, update, hideFace: HIDE_FACE.has(id) };
}
