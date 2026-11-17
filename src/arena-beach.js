// 해변: 모래사장 위 탁구대. 왼쪽(-x)으로 출렁이는 바다와 밀려왔다 빠지는 파도 거품,
// 파라솔·선베드·비치볼(가만히)·서핑보드·모래성, 야자수, 인명구조 망루(A팀 쪽 끝), 해변 매점(B팀 쪽 끝),
// 바다 위 돛단배·부표, 하늘을 도는 갈매기
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded, canvasTex, glowSprite, std, addBox, skyDome, textTex } from './arena-kit.js';

const SHORE = -7.5; // 물가 (x)

// 야자수 잎 하나: 잎줄기가 바깥(+x)으로 뻗었다가 늘어지고, 양옆에 작은 잎이 아래로 비스듬히
const frondMats = {};
const frondMat = (c) => frondMats[c] || (frondMats[c] = std(c, { flatShading: true, side: THREE.DoubleSide }));
function frondGeo(L, lift) {
  const pos = [];
  const N = 16;
  const rib = (k) => [L * k, (0.55 + lift) * Math.sin(k * Math.PI * 0.75) * L * 0.35 - k * k * L * 0.42, 0];
  for (let i = 0; i < N; i++) {
    const k0 = i / N, k1 = (i + 1) / N;
    const a = rib(k0), b = rib(k1);
    // 줄기 (얇은 띠)
    pos.push(a[0], a[1], -0.03, b[0], b[1], -0.03, b[0], b[1], 0.03, a[0], a[1], -0.03, b[0], b[1], 0.03, a[0], a[1], 0.03);
    const w = 0.62 * Math.sin(Math.min(1, k0 * 1.15) * Math.PI) * (L / 2.7) + 0.06; // 작은 잎 길이 (가운데가 길게)
    for (const sd of [-1, 1]) {
      const tip = [a[0] + L * 0.05, a[1] - w * 0.55, sd * w];
      pos.push(a[0], a[1], 0, b[0], b[1], 0, ...tip);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function makePalm(rnd, h = 6) {
  const g = new THREE.Group();
  const trunkM = std(0x9a7650, { flatShading: true }), ringM = std(0x7d5d3c, { flatShading: true });
  const lean = (rnd() - 0.5) * 0.5;
  let x = 0, y = 0;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, h / n, 7), i % 2 ? trunkM : ringM);
    x += Math.sin(lean) * (h / n) * (i / n) * 0.6;
    seg.position.set(x, y + h / n / 2, 0); seg.rotation.z = -lean * (i / n);
    seg.castShadow = true; g.add(seg); y += h / n * 0.98;
  }
  // 잎: 활처럼 휘어 늘어지는 큰 잎줄기 + 양옆으로 촘촘한 작은 잎 (두 층 + 가운데 새순)
  const top = new THREE.Group(); top.position.set(x, y, 0); g.add(top);
  const fronds = [[11, 0.35, 1, 0x3f9a3a], [9, -0.05, 0.9, 0x2f7f2e], [5, 0.9, 0.55, 0x58b84a]];
  const rot = new THREE.Matrix4();
  for (const [n, lift, len, col] of fronds) {
    const geos = [];
    for (let i = 0; i < n; i++) {
      const fg = frondGeo(2.7 * len * (0.9 + rnd() * 0.2), lift - rnd() * 0.25);
      fg.applyMatrix4(rot.makeRotationY((i / n) * Math.PI * 2 + rnd() * 0.35 + lift));
      geos.push(fg);
    }
    const f = new THREE.Mesh(mergeGeometries(geos), frondMat(col)); // 한 덩어리로 (그리기 가볍게)
    f.castShadow = true; top.add(f);
  }
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), std(0x6b4a2a)); c.position.set(Math.cos(i * 2) * 0.18, -0.15, Math.sin(i * 2) * 0.18); top.add(c); }
  g.userData.top = top;
  return g;
}

function makeGull() {
  const g = new THREE.Group(), w = std(0xffffff, { side: THREE.DoubleSide }), gr = std(0xb9c2cc, { side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), w); body.rotation.x = Math.PI / 2; g.add(body);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 6), std(0xf2b01e)); beak.rotation.x = Math.PI / 2; beak.position.z = 0.28; g.add(beak);
  const wings = [-1, 1].map((sd) => {
    const p = new THREE.Group(); p.position.x = sd * 0.06; g.add(p);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.2), sd > 0 ? w : gr); wing.rotation.x = -Math.PI / 2; wing.position.x = sd * 0.28; p.add(wing);
    const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.15), std(0x2b2f3a, { side: THREE.DoubleSide })); tip.rotation.x = -Math.PI / 2; tip.position.x = sd * 0.6; p.add(tip);
    return p;
  });
  g.userData.wings = wings;
  return g;
}

export function buildBeach() {
  const root = new THREE.Group();
  const rnd = seeded(33);

  root.add(skyDome([[0, '#f4fbff'], [0.08, '#cdeeff'], [0.4, '#7fcaf5'], [1, '#3d8fe0']], 330));
  const sunPos = new THREE.Vector3(-180, 150, 60);
  const sg = glowSprite(0xfff6d8, 110, 0.95); sg.material = sg.material.clone(); sg.material.fog = false; sg.position.copy(sunPos); root.add(sg);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false })); sunDisc.position.copy(sunPos); root.add(sunDisc);

  // ---------- 모래 ----------
  const sandTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#efd9a7'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(200,170,110,0.35)' : 'rgba(255,245,215,0.5)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(80, 80);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2; sand.position.x = 190; sand.receiveShadow = true; root.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(4, 400), std(0xcfb07a, { roughness: 0.4 }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(SHORE - 1, 0.004, 0); root.add(wet);

  // ---------- 바다: 출렁이는 물결 (꼭짓점을 매 프레임 움직임) + 밀려오는 거품 ----------
  const SEA_W = 360, SEA_D = 400;
  const seaGeo = new THREE.PlaneGeometry(SEA_W, SEA_D, 90, 60);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(SHORE - 0.5 - SEA_W / 2, 0, 0);
  const sp = seaGeo.attributes.position;
  const base = Float32Array.from(sp.array);
  const colors = new Float32Array(sp.count * 3);
  const cNear = new THREE.Color('#5fe0d6'), cFar = new THREE.Color('#1f6fc4'), cc = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const d = Math.min(1, (SHORE - sp.getX(i)) / 60);
    cc.copy(cNear).lerp(cFar, Math.pow(Math.max(0, d), 0.6));
    colors.set([cc.r, cc.g, cc.b], i * 3);
  }
  seaGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.94 }));
  sea.position.y = 0.02; root.add(sea);
  // 물가 거품 (밀려왔다 빠짐)
  const foamTex = canvasTex(128, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.75, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(70 + Math.random() * 40, Math.random() * 64, 2 + Math.random() * 3, 0, 7); g.fill(); }
  });
  foamTex.wrapT = THREE.RepeatWrapping; foamTex.repeat.set(1, 30);
  const foams = [0, 1].map((k) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 400), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    f.rotation.x = -Math.PI / 2; f.position.set(SHORE - 1.5, 0.05 + k * 0.01, 0); f.userData.noFocus = true;
    root.add(f); return f;
  });
  // 멀리서 다가오는 흰 물마루
  const crests = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 30 + rnd() * 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    c.rotation.x = -Math.PI / 2; c.position.set(SHORE - 8 - rnd() * 60, 0.25, (rnd() - 0.5) * 120);
    c.userData.noFocus = true; root.add(c); crests.push(c);
  }
  // 부표 줄 + 돛단배 + 먼 섬
  const buoyM = std(0xff7a1a);
  const buoys = [];
  for (let z = -60; z <= 60; z += 6) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), buoyM); b.position.set(SHORE - 24, 0.15, z); root.add(b); buoys.push(b); }
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 4.5, 8, 1, false, 0, Math.PI), std(0xffffff)); hull.rotation.set(Math.PI / 2, 0, Math.PI / 2); hull.position.y = 0.4; boat.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), std(0x8a6a4c)); mast.position.y = 2.9; boat.add(mast);
  const sailS = new THREE.Shape(); sailS.moveTo(0, 0); sailS.lineTo(0, 4.4); sailS.lineTo(2.6, 0); sailS.lineTo(0, 0);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailS), std(0xfff4e6, { side: THREE.DoubleSide })); sail.position.set(0.08, 0.7, 0); sail.rotation.y = Math.PI / 2; boat.add(sail);
  const sail2 = new THREE.Mesh(new THREE.ShapeGeometry(sailS), std(0xe0333c, { side: THREE.DoubleSide })); sail2.scale.set(-0.7, 0.75, 1); sail2.position.set(0.08, 0.7, 0); sail2.rotation.y = Math.PI / 2; boat.add(sail2);
  boat.position.set(SHORE - 70, 0, -30); boat.scale.setScalar(1.3); root.add(boat);
  const island = new THREE.Group();
  const isl = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x5f9e4f, { flatShading: true })); isl.scale.y = 0.35; island.add(isl);
  for (let i = 0; i < 4; i++) { const p = makePalm(rnd, 7); p.position.set(-6 + i * 4, 4, rnd() * 4 - 2); island.add(p); }
  island.position.set(-230, -1, 70); root.add(island);

  // ---------- 해변 소품: 파라솔·선베드·비치볼(가만히)·서핑보드·모래성 ----------
  const umbrella = (x, z, c1, c2) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 8), std(0xf4f4f4)); pole.position.y = 1.15; pole.castShadow = true; g.add(pole);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.5, 2, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n), std(i % 2 ? c1 : c2, { side: THREE.DoubleSide }));
      seg.position.y = 2.25; seg.castShadow = true; g.add(seg);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std(0xf4f4f4)); knob.position.y = 2.52; g.add(knob);
    g.position.set(x, 0, z); g.rotation.z = 0.08; root.add(g);
  };
  const lounger = (x, z, ry, c) => {
    const g = new THREE.Group(), fm = std(0xf4f4f4), cl = std(c);
    addBox(g, 0.62, 0.05, 1.3, cl, 0, 0.3, 0.2);
    const back = addBox(g, 0.62, 0.05, 0.7, cl, 0, 0.6, -0.67); back.rotation.x = 0.9; // 의자 끝에서 비스듬히 세운 등받이
    for (const [lx, lz] of [[-0.28, 0.75], [0.28, 0.75], [-0.28, -0.35], [0.28, -0.35]]) addBox(g, 0.04, 0.3, 0.04, fm, lx, 0.15, lz);
    const towel = addBox(g, 0.5, 0.02, 0.9, std(0xffffff), 0, 0.335, 0.25);
    towel.material = new THREE.MeshLambertMaterial({ map: canvasTex(64, 128, (gg) => { for (let i = 0; i < 8; i++) { gg.fillStyle = i % 2 ? '#ffffff' : '#3b82f6'; gg.fillRect(0, i * 16, 64, 16); } }) });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
  };
  umbrella(-3.6, -1.6, 0xe0333c, 0xffffff);
  lounger(-3.0, -2.6, Math.PI / 2 + 0.2, 0x2b6cd9);
  lounger(-3.3, -0.6, Math.PI / 2 - 0.1, 0xf2a20c);
  umbrella(3.8, 9, 0x2b6cd9, 0xffd84a);
  lounger(4.6, 8.2, -Math.PI / 2, 0xe0333c);
  umbrella(-2.5, -11, 0x22c55e, 0xffffff);
  umbrella(5.5, -14, 0xec4899, 0xffffff);
  // 비치볼 (탁구대 옆에 가만히)
  const ballTex = canvasTex(256, 128, (g) => { const cs = ['#e0333c', '#ffffff', '#2b6cd9', '#ffd84a', '#22c55e', '#ffffff']; cs.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * 43, 0, 43, 128); }); });
  const beachBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshLambertMaterial({ map: ballTex }));
  beachBall.position.set(-2.4, 0.22, 1.3); beachBall.castShadow = true; root.add(beachBall);
  // 서핑보드 (모래에 꽂힘)
  const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.6, 4, 12), std(0x22c1c3));
  board.scale.z = 0.18; board.position.set(-4.4, 0.95, 1.6); board.rotation.set(0.05, 0.6, 0.12); board.castShadow = true; root.add(board);
  const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.6, 4, 8), std(0xff7a1a)); stripe.scale.z = 0.8; stripe.position.z = 0.02; board.add(stripe);
  // 모래성 + 양동이·삽
  const castle = new THREE.Group(), cs = std(0xdcc08a, { flatShading: true });
  addBox(castle, 0.7, 0.25, 0.7, cs, 0, 0.125, 0);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 8), cs); t.position.set(x, 0.21, z); castle.add(t);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 8), cs); c.position.set(x, 0.5, z); castle.add(c);
  }
  const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8), cs); keep.position.y = 0.4; castle.add(keep);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), std(0xe0333c, { side: THREE.DoubleSide })); flag.position.set(0.07, 0.86, 0); castle.add(flag);
  const fpole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), std(0x333333)); fpole.position.set(0, 0.8, 0); castle.add(fpole);
  castle.position.set(2.6, 0, -2.4); root.add(castle);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 14), std(0xffd84a)); bucket.position.set(3.1, 0.1, -1.9); root.add(bucket);

  // ---------- 야자수 + 망루 + 매점 ----------
  for (let i = 0; i < 26; i++) {
    const z = -70 + i * 5.6 + rnd() * 2, x = 9 + rnd() * 10;
    if (Math.abs(z) < 5 && x < 11) continue;
    const p = makePalm(rnd, 5 + rnd() * 3); p.position.set(x, 0, z); root.add(p);
  }
  for (let i = 0; i < 6; i++) { const p = makePalm(rnd, 6); p.position.set(-1 + rnd() * 8, 0, (i % 2 ? 1 : -1) * (18 + rnd() * 20)); root.add(p); }
  // 인명구조 망루 (A팀 쪽 끝)
  const tower = new THREE.Group(), tw = std(0xf4f4f4), tr = std(0xe0333c);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const l = addBox(tower, 0.12, 2.4, 0.12, tw, x, 1.2, z); l.castShadow = true; }
  addBox(tower, 2.0, 0.12, 2.0, tw, 0, 2.4, 0);
  addBox(tower, 2.0, 0.9, 0.08, tr, 0, 2.9, 0.98);
  addBox(tower, 0.08, 0.9, 2.0, tr, -0.98, 2.9, 0); addBox(tower, 0.08, 0.9, 2.0, tr, 0.98, 2.9, 0);
  const roofT = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 4), tr); roofT.position.y = 4.1; roofT.rotation.y = Math.PI / 4; tower.add(roofT);
  for (let i = 0; i < 4; i++) addBox(tower, 0.12, 0.6, 0.05, tw, 0, 3.3 + 0, 0);
  const lsign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: textTex('🛟 안전요원', { w: 384, h: 108, bg: '#ffffff', color: '#e0333c', font: 'bold 62px sans-serif' }) }));
  lsign.position.set(0, 2.9, 1.03); tower.add(lsign);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20), tr); ring.position.set(0.9, 1.6, 0.95); tower.add(ring);
  tower.position.set(-2.5, 0, -22); root.add(tower);
  // 해변 매점 (B팀 쪽 끝)
  const shop = new THREE.Group(), wood = std(0xc8945e), woodD = std(0x8a5a32);
  addBox(shop, 5, 2.4, 3, wood, 0, 1.2, 0);
  addBox(shop, 3.6, 1.0, 0.1, std(0x5b3a20), 0, 1.6, -1.5);
  addBox(shop, 4, 0.12, 0.6, woodD, 0, 1.0, -1.75);
  for (let i = 0; i < 8; i++) {
    const a = addBox(shop, 5.4 / 8, 0.06, 1.4, std(i % 2 ? 0xffffff : 0xe0333c), -2.7 + 5.4 / 16 + (i * 5.4) / 8, 2.55, -1.9);
    a.rotation.x = -0.35;
  }
  const ssign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: textTex('🍧 해변 매점', { w: 512, h: 112, bg: '#2b6cd9', color: '#ffffff', font: 'bold 66px sans-serif' }) }));
  ssign.position.set(0, 3.15, -1.55); ssign.rotation.y = Math.PI; shop.add(ssign);
  const sroof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.0, 4), std(0xe9b44c, { flatShading: true })); sroof.position.y = 2.9; sroof.rotation.y = Math.PI / 4; sroof.scale.z = 0.62; shop.add(sroof);
  for (const [x, c] of [[-1.2, 0x7dd3fc], [-0.4, 0xffd84a], [0.4, 0xf9a8d4], [1.2, 0xb388ff]]) { const cup = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 10), std(c)); cup.rotation.x = Math.PI; cup.position.set(x, 1.2, -1.82); shop.add(cup); }
  shop.rotation.y = Math.PI;
  shop.position.set(2.0, 0, 21); root.add(shop);

  // ---------- 갈매기 ----------
  const gulls = [];
  for (let i = 0; i < 6; i++) {
    const g = makeGull(); g.scale.setScalar(1.3);
    g.userData.c = new THREE.Vector3(-8 - rnd() * 20, 7 + rnd() * 6, (rnd() - 0.5) * 40);
    g.userData.r = 6 + rnd() * 8; g.userData.ph = rnd() * 6.28; g.userData.sp = 0.25 + rnd() * 0.2;
    root.add(g); gulls.push(g);
  }

  return {
    root,
    sky: '#bfe7ff',
    fog: [80, 330],
    far: 360,
    light: { hemi: ['#ffffff', '#f2dcb0', 1.45], sun: ['#fff6e0', 2.2, [-5, 10, 3]] },
    tick(t, dt, ball, bounce) {
      // 물결: 서로 다른 파도 몇 개를 겹쳐 출렁출렁
      const p = sp.array;
      for (let i = 0; i < sp.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        const near = Math.min(1, Math.max(0.15, (SHORE - x) / 10));
        p[i * 3 + 1] = (Math.sin(x * 0.18 + t * 1.3) * 0.22 + Math.sin(z * 0.11 - t * 0.9) * 0.16 + Math.sin((x + z) * 0.35 + t * 2.1) * 0.06) * near;
      }
      sp.needsUpdate = true;
      // (바다는 flatShading이라 면 방향을 셰이더가 직접 구한다 → computeVertexNormals는 필요 없음, 매 프레임 약 2ms 아낌)
      // 거품: 두 겹이 엇갈려 밀려왔다 빠진다
      foams.forEach((f, k) => {
        const u = (t * 0.16 + k * 0.5) % 1;
        f.position.x = SHORE - 3.2 + Math.sin(u * Math.PI) * 2.4;
        f.material.opacity = Math.sin(u * Math.PI) * 0.9;
        foamTex.offset.y = t * 0.01;
      });
      for (const c of crests) {
        c.position.x += dt * 2.2;
        const d = SHORE - c.position.x;
        c.material.opacity = Math.min(0.75, d / 6) * Math.min(1, (70 - d) / 10);
        if (d < 2) { c.position.x = SHORE - 60 - Math.random() * 15; c.position.z = (Math.random() - 0.5) * 120; }
      }
      for (const b of buoys) b.position.y = 0.15 + Math.sin(t * 1.4 + b.position.z * 0.3) * 0.12;
      boat.position.y = Math.sin(t * 0.9) * 0.2; boat.rotation.z = Math.sin(t * 0.7) * 0.06; boat.rotation.x = Math.sin(t * 0.5) * 0.04;
      boat.position.z = -30 + Math.sin(t * 0.03) * 25;
      for (const g of gulls) {
        const { c, r, ph, sp: s, wings } = g.userData;
        const a = t * s + ph;
        g.position.set(c.x + Math.cos(a) * r, c.y + Math.sin(t * 0.8 + ph) * 0.8, c.z + Math.sin(a) * r);
        g.rotation.set(0, -a, Math.sin(a) * 0.2 - 0.2);
        const f = Math.sin(t * 7 + ph) * 0.55;
        wings[0].rotation.z = -f; wings[1].rotation.z = f;
      }
    },
  };
}
