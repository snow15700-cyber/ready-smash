// 배경 속 반려동물 — '09시까지 출근하세요'(until09_new js/08-pets.js)의 툰 셰이딩 펫 6종을 그대로 옮김
// 얼굴 = +z. update(t, dt, yaw, j): yaw = 공 쪽 방향(몸 기준), j = 공이 막 튀었을 때 1
import * as THREE from 'three';

/* ================= 반려동물 (09시 게임의 툰 셰이딩 펫, 얼굴 = +z) ================= */
const toonGrad = (() => {
  const d = new Uint8Array([25, 25, 25, 255, 95, 95, 95, 255, 150, 150, 150, 255]);
  const tx = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  tx.minFilter = tx.magFilter = THREE.NearestFilter;
  tx.generateMipmaps = false;
  tx.needsUpdate = true;
  return tx;
})();
const petMats = {};
const PM = (hex) => petMats[hex] || (petMats[hex] = new THREE.MeshToonMaterial({ color: new THREE.Color(hex).multiplyScalar(0.86), gradientMap: toonGrad }));
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x3a2418, side: THREE.BackSide });
function addOutlines(root, t = 0.022) {
  const targets = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.noOutline && o.material !== OUTLINE && !o.material.transparent && !o.material.isMeshBasicMaterial) targets.push(o); });
  root.updateMatrixWorld(true);
  const size = new THREE.Vector3(), ws = new THREE.Vector3();
  for (const o of targets) {
    o.geometry.computeBoundingBox();
    o.geometry.boundingBox.getSize(size);
    o.getWorldScale(ws);
    const dims = [size.x * ws.x, size.y * ws.y, size.z * ws.z];
    if (Math.min(...dims) < 0.07 || o.geometry.type === 'TorusGeometry') continue;
    const ol = new THREE.Mesh(o.geometry, OUTLINE);
    ol.scale.set(1 + (2 * t) / dims[0], 1 + (2 * t) / dims[1], 1 + (2 * t) / dims[2]);
    ol.userData.noOutline = true;
    o.add(ol);
  }
}
const SPH = new THREE.SphereGeometry(1, 24, 18);
function sph(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1) {
  const s = new THREE.Mesh(SPH, m);
  s.scale.set(r * sx, r * sy, r * sz);
  s.position.set(x, y, z);
  s.castShadow = true;
  parent.add(s);
  return s;
}
const EYE = PM(0x17141a), SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BLUSH = new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55, depthWrite: false });
function eye(parent, x, y, z, r) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  sph(g, r, EYE, 0, 0, 0, 1, 1.12, 0.7);
  sph(g, r * 0.34, SHINE, r * 0.3, r * 0.38, r * 0.55);
  sph(g, r * 0.16, SHINE, -r * 0.28, -r * 0.3, r * 0.6);
  return g;
}
function blush(parent, x, y, z, r) { const b = sph(parent, r, BLUSH, x, y, z, 1, 0.62, 0.25); b.castShadow = false; return b; }
function closedEye(parent, x, y, z, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 16, Math.PI), EYE);
  m.position.set(x, y, z); parent.add(m); return m;
}
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// 웰시코기: 앉아서 공을 눈으로 따라간다 (공이 튀면 귀가 쫑긋)
export function buildCorgi() {
  const g = new THREE.Group();
  const O = PM(0xe8913a), W = PM(0xfff6ea), P = PM(0xff8fa3), K = PM(0x1d1a1f);
  sph(g, 0.33, O, 0, 0.32, -0.08, 1, 0.92, 1.12);
  sph(g, 0.23, W, 0, 0.36, 0.16, 1, 1.12, 0.72);
  for (const sd of [-1, 1]) {
    sph(g, 0.15, O, sd * 0.24, 0.15, -0.14, 0.8, 0.95, 1.2);
    sph(g, 0.085, W, sd * 0.13, 0.1, 0.36, 1, 1.0, 1.5);
  }
  const butt = sph(g, 0.14, W, 0, 0.3, -0.42);
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.08); g.add(head);
  sph(head, 0.3, O, 0, 0, 0, 1.08, 0.96, 1);
  sph(head, 0.21, W, 0, -0.07, 0.17, 1.05, 0.88, 0.72);
  sph(head, 0.06, W, 0, 0.06, 0.25, 0.75, 1.3, 0.45);
  sph(head, 0.13, W, 0, -0.1, 0.27, 1.25, 0.82, 0.95);
  sph(head, 0.048, K, 0, -0.05, 0.39, 1.2, 0.9, 0.9);
  const tongue = sph(head, 0.055, P, 0, -0.2, 0.32, 1, 0.65, 0.7);
  eye(head, -0.13, 0.04, 0.26, 0.055); eye(head, 0.13, 0.04, 0.26, 0.055);
  blush(head, -0.21, -0.07, 0.22, 0.06); blush(head, 0.21, -0.07, 0.22, 0.06);
  const ears = [-1, 1].map((sd) => {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.17, 0.2, -0.02); pivot.rotation.z = -sd * 0.32; head.add(pivot);
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.36, 14), O); e.position.y = 0.17; e.castShadow = true; pivot.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 12), P); inner.position.set(0, 0.14, 0.06); pivot.add(inner);
    return pivot;
  });
  addOutlines(g);
  let look = 0, perk = 0;
  return {
    group: g,
    // yaw: 공 쪽 방향(몸 기준, 라디안), j: 공이 막 튀었을 때 1 → 0
    update(t, dt, yaw, j) {
      look += (Math.max(-1.25, Math.min(1.25, yaw)) - look) * (1 - Math.exp(-dt * 9));
      perk = Math.max(j, perk - dt * 3);
      head.rotation.y = look;
      head.rotation.z = Math.sin(t * 1.6) * 0.05;
      head.rotation.x = Math.sin(t * 1.1) * 0.03 - perk * 0.12;
      ears.forEach((e, i) => { const sd = i ? 1 : -1; e.rotation.z = -sd * (0.32 + Math.sin(t * 13 + i) * 0.05 - perk * 0.2); e.rotation.x = -0.15 - Math.abs(Math.sin(t * 9 + i)) * 0.1; });
      tongue.position.y = -0.2 + Math.sin(t * 7) * 0.012;
      butt.position.x = Math.sin(t * 9) * 0.03; // 엉덩이 씰룩 (꼬리 대신)
    },
  };
}

// 치즈냥: 벤치 위에서 식빵 굽는 잠꾸러기. 가끔 눈 뜨고, 공이 튀면 깜짝
export function buildCat() {
  const g = new THREE.Group();
  const O = PM(0xf4a94f), D = PM(0xd9792b), W = PM(0xfff6ea), P = PM(0xff9db0), K = PM(0x5a3a2a);
  const loafGeo = new THREE.SphereGeometry(1, 32, 24), lp = loafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.62);
    lp.setXYZ(i, f(lp.getX(i)), f(lp.getY(i)), f(lp.getZ(i)));
  }
  loafGeo.computeVertexNormals();
  const torso = new THREE.Group(); g.add(torso);
  const loaf = new THREE.Mesh(loafGeo, O); loaf.scale.set(0.31, 0.2, 0.4); loaf.position.set(0, 0.2, -0.06); loaf.castShadow = true; torso.add(loaf);
  for (const z of [-0.32, -0.16, 0.0]) { const st = new THREE.Mesh(loafGeo, D); st.scale.set(0.3, 0.035, 0.045); st.position.set(0, 0.395, z); st.userData.noOutline = true; torso.add(st); }
  const bib = sph(torso, 0.17, W, 0, 0.17, 0.27, 1.25, 0.95, 0.55); bib.userData.noOutline = true;
  for (const sd of [-1, 1]) sph(torso, 0.07, W, sd * 0.1, 0.045, 0.33, 1.15, 0.6, 0.9);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const curve = new THREE.CatmullRomCurve3([v(0.12, 0.06, -0.47), v(0.3, 0.05, -0.36), v(0.36, 0.05, -0.05), v(0.32, 0.05, 0.22), v(0.18, 0.05, 0.38)]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.055, 10, false), O); tailMesh.castShadow = true; tailMesh.userData.noOutline = true; torso.add(tailMesh);
  const tol = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.077, 10, false), OUTLINE); tol.userData.noOutline = true; torso.add(tol);
  const tip = sph(torso, 0.06, D, 0.18, 0.05, 0.38, 1, 1, 1.1);
  const head = new THREE.Group(); head.position.set(0, 0.44, 0.2); g.add(head);
  sph(head, 0.24, O, 0, 0, 0, 1.2, 0.98, 1);
  [-0.06, 0, 0.06].forEach((x) => { const m = sph(head, 0.028, D, x, 0.19, 0.12 - Math.abs(x) * 0.4, 0.55, 1.5, 0.5); m.rotation.z = -x * 4; m.userData.noOutline = true; });
  for (const sd of [-1, 1]) { const m = sph(head, 0.1, W, sd * 0.06, -0.085, 0.18, 1, 0.78, 0.8); m.userData.noOutline = true; }
  sph(head, 0.03, P, 0, -0.035, 0.255, 1.35, 0.85, 0.8);
  for (const sd of [-1, 1]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12, Math.PI), K); m.rotation.z = Math.PI; m.position.set(sd * 0.022, -0.075, 0.262); head.add(m); }
  blush(head, -0.19, -0.05, 0.17, 0.055); blush(head, 0.19, -0.05, 0.17, 0.055);
  const open = new THREE.Group(), shut = new THREE.Group(); head.add(open, shut);
  eye(open, -0.11, 0.035, 0.205, 0.048); eye(open, 0.11, 0.035, 0.205, 0.048);
  closedEye(shut, -0.11, 0.025, 0.228, 0.045); closedEye(shut, 0.11, 0.025, 0.228, 0.045);
  const wm = PM(0x8a7262);
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.007, 0.007), wm);
    w.position.set(sd * 0.22, -0.06 - k * 0.025, 0.15); w.rotation.z = sd * (0.12 - k * 0.12); w.userData.noOutline = true; head.add(w);
  }
  const ears = [-1, 1].map((sd) => {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.15, 0.16, -0.01); pivot.rotation.z = -sd * 0.32; head.add(pivot);
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.17, 12), O); e.scale.z = 0.7; e.position.y = 0.075; e.castShadow = true; pivot.add(e);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 10), P); inner.scale.z = 0.5; inner.position.set(0, 0.06, 0.035); inner.userData.noOutline = true; pivot.add(inner);
    return pivot;
  });
  addOutlines(g);
  let startle = 0;
  return {
    group: g,
    update(t, dt, yaw, j) {
      startle = Math.max(j * 0.8, startle - dt * 1.2);
      const awake = startle > 0.05 || t % 7 > 6.1;
      open.visible = awake; shut.visible = !awake;
      const jj = Math.min(1, startle * 2) * (startle > 0.6 ? 1 : 0.3);
      torso.scale.set(1 + jj * 0.04, 1 + Math.sin(t * 1.3) * 0.02 - jj * 0.05, 1);
      head.position.y = 0.44 + Math.sin(t * 1.3) * 0.008 + jj * 0.04;
      head.rotation.z = Math.sin(t * 0.6) * 0.06;
      head.rotation.y = awake ? Math.max(-0.8, Math.min(0.8, yaw)) * 0.6 : 0;
      tip.position.y = 0.05 + Math.max(0, Math.sin(t * 2.6)) * 0.04;
      ears.forEach((e, i) => { const sd = i ? 1 : -1; e.rotation.z = -sd * (0.32 + ((t + i * 1.7) % 5 > 4.8 ? 0.3 : 0)); });
    },
  };
}

// 햄스터: 찻잔 속에서 머리만 빼꼼. 공이 튀면 깜짝 놀라 쏙 숨었다 나온다
export function buildHamster(cupHex = 0x9fc7ea) {
  const g = new THREE.Group();
  // 찻잔
  const cup = new THREE.Group(); g.add(cup);
  const H = 0.38, R = 0.43, r0 = 0.34;
  const porcelain = PM(0xfdfbf7), band = PM(cupHex);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R, r0, H, 36, 1, true), porcelain);
  side.position.y = H / 2; side.castShadow = true; cup.add(side);
  const innerMat = new THREE.MeshToonMaterial({ color: new THREE.Color(0xe9e2d6).multiplyScalar(0.86), gradientMap: toonGrad, side: THREE.BackSide });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.02, r0 - 0.02, H, 36, 1, true), innerMat);
  inner.position.y = H / 2 + 0.005; inner.userData.noOutline = true; cup.add(inner);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * 0.92, 0.04, 30), porcelain); bottom.position.y = 0.02; cup.add(bottom);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.032, R - 0.05, 0.08, 36, 1, true), band);
  stripe.position.y = H * 0.68; stripe.scale.setScalar(1.08); stripe.userData.noOutline = true; cup.add(stripe);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 40), porcelain); rimRing.rotation.x = Math.PI / 2; rimRing.position.y = H; cup.add(rimRing);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.032, 8, 18), porcelain); handle.position.set(R - 0.02, H * 0.52, 0); cup.add(handle);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 0.05, 40), porcelain); cup.add(saucer);
  // 햄스터
  const G = PM(0xf0b46c), C = PM(0xfff4e2), P = PM(0xffa3b5);
  const body = new THREE.Group(); body.position.y = 0.0; g.add(body);
  sph(body, 0.38, G, 0, 0.36, -0.02, 1.0, 0.95, 0.95);
  sph(body, 0.31, C, 0, 0.3, 0.08, 0.94, 0.9, 0.82);
  const cheeks = [-1, 1].map((sd) => sph(body, 0.12, C, sd * 0.19, 0.38, 0.2, 1, 0.9, 0.95));
  blush(body, -0.2, 0.39, 0.31, 0.055); blush(body, 0.2, 0.39, 0.31, 0.055);
  const eyes = new THREE.Group(); body.add(eyes);
  eye(eyes, -0.12, 0.5, 0.31, 0.058); eye(eyes, 0.12, 0.5, 0.31, 0.058);
  sph(body, 0.03, P, 0, 0.43, 0.37, 1.3, 1, 1);
  for (const sd of [-1, 1]) { sph(body, 0.09, G, sd * 0.21, 0.68, 0.0, 1, 1, 0.45); sph(body, 0.055, P, sd * 0.21, 0.68, 0.03, 1, 1, 0.3); }
  sph(body, 0.12, PM(0xd99a52), 0, 0.72, -0.12, 1.4, 0.35, 1);
  const paws = [-1, 1].map((sd) => sph(body, 0.05, P, sd * 0.11, 0.39, 0.41, 1.1, 0.8, 1.2));
  addOutlines(g);
  let scare = 0;
  return {
    group: g,
    update(t, dt, yaw, j) {
      scare = Math.max(j, scare - dt * 1.4);
      const c = t % 8, duck = c > 6.6 && c < 7.4 ? Math.sin(((c - 6.6) / 0.8) * Math.PI) : 0;
      const d = Math.max(duck, Math.min(1, scare * 1.6));
      body.position.y = Math.sin(t * 1.4) * 0.012 - d * 0.2;
      body.rotation.y = (Math.max(-0.7, Math.min(0.7, yaw)) * 0.6 + Math.sin(t * 0.8) * 0.12) * (1 - d);
      paws.forEach((p) => { p.visible = d < 0.35; });
      cheeks.forEach((ch) => { ch.scale.x = 0.12 * (1 + d * 0.25); });
    },
  };
}

// 토끼: 가끔 폴짝, 한쪽 귀가 살짝 접힘. 공이 튀면 귀 쫑긋하며 같이 폴짝
export function buildRabbit() {
  const g = new THREE.Group(), W = PM(0xfbfaf7), P = PM(0xffa3b5);
  const hop = new THREE.Group(); g.add(hop);
  sph(hop, 0.31, W, 0, 0.31, -0.06, 1, 1.05, 1.08);
  sph(hop, 0.11, W, 0, 0.22, -0.4);
  for (const sd of [-1, 1]) { sph(hop, 0.1, W, sd * 0.15, 0.05, 0.16, 0.8, 0.5, 1.6); sph(hop, 0.07, W, sd * 0.1, 0.2, 0.25, 0.9, 1.3, 0.9); }
  const head = new THREE.Group(); head.position.set(0, 0.7, 0.07); hop.add(head);
  sph(head, 0.26, W, 0, 0, 0, 1.1, 0.95, 1);
  for (const sd of [-1, 1]) sph(head, 0.085, W, sd * 0.05, -0.1, 0.2, 1, 0.82, 0.85);
  sph(head, 0.028, P, 0, -0.05, 0.27, 1.3, 1, 1);
  eye(head, -0.12, 0.03, 0.21, 0.052); eye(head, 0.12, 0.03, 0.21, 0.052);
  blush(head, -0.19, -0.07, 0.19, 0.055); blush(head, 0.19, -0.07, 0.19, 0.055);
  const ears = [-1, 1].map((sd) => {
    const pivot = new THREE.Group(); pivot.position.set(sd * 0.09, 0.2, -0.02); head.add(pivot);
    sph(pivot, 0.085, W, 0, 0.24, 0, 1, 3.1, 0.55);
    sph(pivot, 0.05, P, 0, 0.24, 0.03, 1, 3.6, 0.35);
    return pivot;
  });
  addOutlines(g);
  let jump = 0, jt = 9;
  return {
    group: g,
    update(t, dt, yaw, j) {
      if (j && jt > 0.5) jt = 0; // 공이 튀면 같이 폴짝
      jt += dt;
      const cyc = t % 3.2, h = cyc < 0.45 ? Math.sin((cyc / 0.45) * Math.PI) : 0;
      jump = jt < 0.4 ? Math.sin((jt / 0.4) * Math.PI) : 0;
      hop.position.y = h * 0.18 + jump * 0.22;
      ears[0].rotation.z = 0.12 + Math.sin(t * 1.5) * 0.05 - h * 0.15;
      ears[1].rotation.z = -0.35 - Math.sin(t * 1.5 + 1) * 0.05 + h * 0.15;
      ears[0].rotation.x = -0.1 - jump * 0.5;
      ears[1].rotation.x = 0.35 - jump * 0.5;
      head.rotation.y = Math.max(-0.9, Math.min(0.9, yaw)) * 0.7;
      head.rotation.z = Math.sin(t * 0.9) * 0.05;
    },
  };
}

// 앵무새(모란앵무): 고개를 갸웃, 공을 따라 고개를 돌리고 공이 튀면 날개 파닥
export function buildParrot() {
  const g = new THREE.Group();
  const Gr = PM(0x58c45a), Dg = PM(0x2f9a49), Pe = PM(0xff8a5c), Y = PM(0xffd54a), B = PM(0x2f8fd0), Bk = PM(0xe8403a), Ft = PM(0x9b8f86);
  sph(g, 0.24, Gr, 0, 0.42, -0.02, 1, 1.32, 1);
  sph(g, 0.19, PM(0x8bdb6a), 0, 0.38, 0.1, 0.95, 1.2, 0.8);
  const wings = [-1, 1].map((sd) => { const w = sph(g, 0.17, Dg, sd * 0.2, 0.44, -0.04, 0.38, 1.12, 0.85); w.rotation.z = sd * 0.18; return w; });
  const tail = sph(g, 0.1, B, 0, 0.2, -0.3, 0.7, 0.3, 2.2); tail.rotation.x = 0.55;
  for (const sd of [-1, 1]) sph(g, 0.045, Ft, sd * 0.08, 0.04, 0.06, 1.3, 0.5, 1.4);
  const head = new THREE.Group(); head.position.set(0, 0.8, 0.04); g.add(head);
  sph(head, 0.21, Gr, 0, 0, -0.02);
  sph(head, 0.175, Pe, 0, -0.02, 0.09, 1, 0.98, 0.75);
  sph(head, 0.11, Y, 0, -0.12, 0.08, 1.3, 0.6, 0.8);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 12), Bk);
  beak.rotation.x = Math.PI / 2 + 0.55; beak.position.set(0, -0.04, 0.24); head.add(beak);
  for (const sd of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 8, 18), PM(0xffffff)); ring.position.set(sd * 0.1, 0.04, 0.205); head.add(ring);
    eye(head, sd * 0.1, 0.04, 0.2, 0.045);
  }
  sph(head, 0.05, Gr, 0, 0.2, -0.02, 0.6, 1.3, 1);
  addOutlines(g);
  let flapT = 0, look = 0;
  return {
    group: g,
    update(t, dt, yaw, j) {
      flapT = Math.max(j * 0.6, flapT - dt);
      look += (Math.max(-1.2, Math.min(1.2, yaw)) - look) * (1 - Math.exp(-dt * 7));
      const bob = Math.sin(t * 2.4);
      head.rotation.y = look;
      head.rotation.z = bob > 0.7 ? 0.32 : Math.sin(t * 0.8) * 0.05;
      head.position.y = 0.8 + Math.max(0, Math.sin(t * 5)) * 0.025;
      const flap = flapT > 0 ? Math.sin(t * 40) * 0.6 : 0;
      wings.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.z = sd * (0.18 + Math.abs(flap)); });
      tail.rotation.x = 0.55 + Math.sin(t * 3) * 0.05;
    },
  };
}

// 거북이: 느긋하게 머리를 넣었다 뺐다. 공이 튀면 머리를 쏙
export function buildTurtle() {
  const g = new THREE.Group(), Sh = PM(0x4f9a46), Sp = PM(0x7cc26a), Rim = PM(0xd9b46a), Sk = PM(0xb3d977);
  const shellGeo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shell = new THREE.Mesh(shellGeo, Sh); shell.scale.set(0.42, 0.34, 0.48); shell.position.y = 0.1; shell.castShadow = true; g.add(shell);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 32), Rim); rim.scale.z = 1.14; rim.position.y = 0.1; g.add(rim);
  const hexGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 6);
  const spots = [[0, Math.PI / 2]].concat([0, 1, 2, 3, 4, 5].map((k) => [(k * Math.PI) / 3 + Math.PI / 6, 0.62]));
  for (const [az, el] of spots) {
    const n = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const h = new THREE.Mesh(hexGeo, Sp);
    h.position.set(n.x * 0.42, n.y * 0.34 + 0.1, n.z * 0.48);
    h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x / 0.42, n.y / 0.34, n.z / 0.48).normalize());
    h.scale.set(el > 1 ? 1.2 : 0.85, 1, el > 1 ? 1.2 : 0.85); h.userData.noOutline = true; g.add(h);
  }
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) sph(g, 0.09, Sk, sx * 0.3, 0.07, sz * 0.3, 1, 0.6, 1.25);
  const tailC = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 10), Sk); tailC.rotation.x = -Math.PI / 2 - 0.3; tailC.position.set(0, 0.1, -0.56); g.add(tailC);
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.5); head.scale.setScalar(1.12); g.add(head);
  sph(head, 0.16, Sk, 0, 0, 0, 1, 0.92, 1.05);
  const open = new THREE.Group(), shut = new THREE.Group(); head.add(open, shut);
  eye(open, -0.075, 0.04, 0.12, 0.042); eye(open, 0.075, 0.04, 0.12, 0.042);
  closedEye(shut, -0.075, 0.035, 0.145, 0.032); closedEye(shut, 0.075, 0.035, 0.145, 0.032);
  blush(head, -0.11, -0.03, 0.11, 0.04); blush(head, 0.11, -0.03, 0.11, 0.04);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI), EYE); smile.rotation.z = Math.PI; smile.position.set(0, -0.035, 0.155); head.add(smile);
  addOutlines(g);
  let hide = 0;
  return {
    group: g,
    update(t, dt, yaw, j) {
      hide = Math.max(j, hide - dt * 0.7);
      const peek = (Math.sin(t * 0.6) + 1) / 2;
      head.position.z = 0.42 + peek * 0.12 - Math.min(1, hide * 1.5) * 0.16;
      head.rotation.y = Math.max(-0.6, Math.min(0.6, yaw)) * 0.5 + Math.sin(t * 0.4) * 0.1;
      const blink = t % 5 > 4.75 || hide > 0.3;
      open.visible = !blink; shut.visible = blink;
    },
  };
}
