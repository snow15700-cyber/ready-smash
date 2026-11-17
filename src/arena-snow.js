// 눈 오는 밤: 눈 덮인 마을 광장. 별·달이 뜬 어두운 밤하늘(공이 잘 보이게), 펑펑 내리는 눈,
// 따뜻한 가로등·창문 불빛, 반짝이는 큰 트리(A팀 쪽 끝), 눈사람·선물 상자·전구 줄(B팀 쪽),
// 굴뚝 연기, 눈 쌓인 소나무·울타리
import * as THREE from 'three';
import { seeded, canvasTex, glowSprite, std, addBox, skyDome, makeDrift, dotTex, textTex } from './arena-kit.js';

const snowM = () => std(0xf4f8ff, { flatShading: true, roughness: 0.9 });

function makeHouse(rnd, w, d, h) {
  const g = new THREE.Group();
  const wallCols = [0xb5654a, 0x8f6a52, 0xd9c7a8, 0x6f8fae, 0xa8b89a];
  const wall = std(wallCols[Math.floor(rnd() * wallCols.length)], { flatShading: true });
  addBox(g, w, h, d, wall, 0, h / 2, 0);
  // 박공지붕 (눈 덮임)
  const roofH = w * 0.45;
  const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.35, 0); shape.lineTo(0, roofH); shape.lineTo(w / 2 + 0.35, 0); shape.lineTo(-w / 2 - 0.35, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false }), std(0x5b3a2e, { flatShading: true }));
  roof.position.set(0, h, -d / 2 - 0.3); g.add(roof);
  const snowRoof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.7, bevelEnabled: false }), snowM());
  snowRoof.scale.set(1.02, 0.85, 1); snowRoof.position.set(0, h + roofH * 0.2, -d / 2 - 0.35); g.add(snowRoof);
  // 굴뚝
  const chim = addBox(g, 0.5, 1.2, 0.5, std(0x7a4a3a), w * 0.25, h + roofH * 0.7, -d * 0.2);
  addBox(g, 0.6, 0.15, 0.6, snowM(), w * 0.25, h + roofH * 0.7 + 0.65, -d * 0.2);
  g.userData.chimney = new THREE.Vector3(w * 0.25, h + roofH * 0.7 + 0.8, -d * 0.2);
  // 불 켜진 창문 (앞뒤 양쪽 — 어느 쪽에서 봐도)
  const winM = std(0xffd27a, { emissive: 0xffb84a, emissiveIntensity: 1.1 });
  const frameM = std(0xf4efe6);
  const nW = Math.max(1, Math.floor(w / 1.6));
  for (const sz of [-1, 1]) {
    for (let i = 0; i < nW; i++) {
      const x = -w / 2 + (w / nW) * (i + 0.5);
      for (let fl = 0; fl < (h > 4 ? 2 : 1); fl++) {
        const y = 1.2 + fl * 2.2;
        if (rnd() < 0.8) {
          addBox(g, 0.75, 0.9, 0.06, winM, x, y, sz * (d / 2 + 0.02));
          addBox(g, 0.85, 0.08, 0.08, frameM, x, y, sz * (d / 2 + 0.03));
          addBox(g, 0.08, 1.0, 0.08, frameM, x, y, sz * (d / 2 + 0.03));
          addBox(g, 0.95, 0.1, 0.18, snowM(), x, y - 0.5, sz * (d / 2 + 0.06));
        }
      }
    }
  }
  // 문 + 화환
  addBox(g, 0.9, 1.7, 0.08, std(0x5b3a20), -w / 2 + 0.9, 0.85, d / 2 + 0.03);
  const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), std(0x2f7a3a)); wreath.position.set(-w / 2 + 0.9, 1.35, d / 2 + 0.1); g.add(wreath);
  return g;
}

function makePine(rnd, s = 1, lights = null) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.2 * s, 6), std(0x5b3a2e)); trunk.position.y = 0.6 * s; g.add(trunk);
  const green = std(0x1f5a3a, { flatShading: true });
  [0, 1, 2, 3].forEach((k) => {
    const r = (1.6 - k * 0.35) * s, h = 1.5 * s, y = (1.4 + k * 0.95) * s;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), green); c.position.y = y; c.castShadow = true; g.add(c);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, h * 0.42, 8), snowM()); cap.position.y = y + h * 0.3; g.add(cap);
  });
  return g;
}

export function buildSnow() {
  const root = new THREE.Group();
  const rnd = seeded(41);

  // ---------- 밤하늘 + 별 + 달 ----------
  root.add(skyDome([[0, '#3a4b78'], [0.12, '#26355e'], [0.45, '#141d3d'], [1, '#080d22']], 320));
  const NS = 700, spos = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.3, r = 300;
    spos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, map: dotTex(), transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
  stars.userData.noFocus = true; root.add(stars);
  const moonPos = new THREE.Vector3(-170, 140, -120);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff8e0, fog: false })); moon.position.copy(moonPos); root.add(moon);
  const mg = glowSprite(0xcfe0ff, 70, 0.6); mg.material = mg.material.clone(); mg.material.fog = false; mg.position.copy(moonPos); root.add(mg);

  // ---------- 눈 덮인 땅 + 광장 ----------
  const snowTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#dfe7f3'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(180,195,225,0.35)' : 'rgba(255,255,255,0.7)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  });
  snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping; snowTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: snowTex }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  // 탁구대 주변: 눈을 치운 돌바닥 광장 (공이 눈에 묻히지 않게 어두운 색)
  const plazaTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#5d6478'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 88 + ((x * 3 + y * 5) % 4) * 8; g.fillStyle = `rgb(${v},${v + 4},${v + 18})`; g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 32 + 1, 30, 30); }
  });
  plazaTex.wrapS = plazaTex.wrapT = THREE.RepeatWrapping; plazaTex.repeat.set(5, 7);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), new THREE.MeshLambertMaterial({ map: plazaTex }));
  plaza.rotation.x = -Math.PI / 2; plaza.scale.set(1, 1.35, 1); plaza.position.y = 0.01; plaza.receiveShadow = true; root.add(plaza);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.25, 6, 48), snowM()); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.35, 0.4); root.add(rim);

  // ---------- 집들 (양옆으로 줄지어, 굴뚝 연기) ----------
  const chimneys = [];
  const house = (x, z, ry) => {
    const w = 4 + rnd() * 2.5, d = 4 + rnd() * 1.5, h = 3.2 + rnd() * 2.6;
    const hs = makeHouse(rnd, w, d, h); hs.position.set(x, 0, z); hs.rotation.y = ry; root.add(hs);
    hs.updateMatrixWorld(true);
    chimneys.push(hs.localToWorld(hs.userData.chimney.clone()));
  };
  for (let z = -40; z <= 40; z += 7.5) {
    if (Math.abs(z) < 4) continue;
    house(-13 - rnd() * 2, z, Math.PI / 2);
    house(13 + rnd() * 2, z, -Math.PI / 2);
  }
  for (const x of [-8, 8]) { house(x, -38, 0); house(x, 38, Math.PI); }
  // 소나무 숲 (마을 뒤)
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, d = 28 + rnd() * 60;
    const p = makePine(rnd, 1.6 + rnd() * 1.6); p.position.set(Math.cos(a) * d, 0, Math.sin(a) * d * 1.4); root.add(p);
  }
  for (const [x, z] of [[-5.5, -9], [6, -8], [-6, 9], [5.5, 10]]) { const p = makePine(rnd, 1.1); p.position.set(x, 0, z); root.add(p); }

  // ---------- A팀 쪽 끝: 반짝이는 큰 트리 ----------
  const tree = makePine(rnd, 2.6); tree.position.set(0, 0, -16); root.add(tree);
  const bulbCols = [0xff4d4d, 0xffd84a, 0x4dd2ff, 0x7dff8a, 0xff8ad8];
  const bulbs = [];
  for (let i = 0; i < 90; i++) {
    const k = i / 90, y = 2.2 + k * 8.6, r = (1 - k) * 3.6 + 0.3, a = i * 2.4;
    const m = new THREE.MeshBasicMaterial({ color: bulbCols[i % 5] });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), m);
    b.position.set(Math.cos(a) * r, y, Math.sin(a) * r - 16); root.add(b);
    b.userData.noFocus = true; b.userData.ph = rnd() * 6.28; b.userData.col = new THREE.Color(bulbCols[i % 5]);
    bulbs.push(b);
  }
  const ornCols = [0xd83a3a, 0xf2c230, 0x3a6fd8];
  for (let i = 0; i < 26; i++) { const k = rnd(), y = 2 + k * 8, r = (1 - k) * 3.8 + 0.2, a = rnd() * 6.28; const o = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), std(ornCols[i % 3], { metalness: 0.6, roughness: 0.25 })); o.position.set(Math.cos(a) * r, y, Math.sin(a) * r - 16); root.add(o); }
  const starS = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.32 : 0.75, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? starS.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starS.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starS, { depth: 0.15, bevelEnabled: false }), std(0xffd84a, { emissive: 0xffc21a, emissiveIntensity: 1 }));
  star.position.set(0, 13.4, -16); root.add(star);
  const starGlow = glowSprite(0xffe08a, 4.5, 0.9); starGlow.position.set(0, 13.6, -16); root.add(starGlow);
  // 트리 아래 선물 상자
  const gift = (x, z, s, c, rc) => {
    const g = new THREE.Group();
    addBox(g, s, s * 0.8, s, std(c), 0, s * 0.4, 0);
    addBox(g, s * 1.02, s * 0.82, s * 0.16, std(rc), 0, s * 0.4, 0);
    addBox(g, s * 0.16, s * 0.82, s * 1.02, std(rc), 0, s * 0.4, 0);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(s * 0.14, s * 0.05, 6, 12), std(rc)); bow.position.y = s * 0.85; bow.rotation.y = 0.7; g.add(bow);
    g.position.set(x, 0, z); g.rotation.y = rnd() * 1.5; g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); root.add(g);
  };
  gift(-1.6, -13.2, 0.8, 0xd83a3a, 0xf2c230); gift(1.4, -13.4, 0.65, 0x3a6fd8, 0xffffff); gift(0.2, -12.6, 0.5, 0x2f9a49, 0xd83a3a); gift(2.4, -14, 0.9, 0xf2c230, 0xd83a3a);

  // ---------- B팀 쪽 끝: 눈사람 + 전구 줄 + 간판 ----------
  const snowman = new THREE.Group(), sm = std(0xf8fbff, { roughness: 0.9 });
  [[0.75, 0.7], [0.55, 1.85], [0.4, 2.7]].forEach(([r, y]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), sm); b.position.y = y; b.castShadow = true; snowman.add(b); });
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0x111111)); e.position.set(sd * 0.13, 2.82, 0.35); snowman.add(e); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 10), std(0xff7a1a)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.7, 0.55); snowman.add(nose);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0x111111)); b.position.set(0, 1.65 + i * 0.25, 0.54 - i * 0.03); snowman.add(b); }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 20), std(0xd83a3a)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 2.33; snowman.add(scarf);
  addBox(snowman, 0.16, 0.6, 0.06, std(0xd83a3a), 0.25, 2.0, 0.38);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 16), std(0x1b1b22)); hat.position.y = 3.25; snowman.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 18), std(0x1b1b22)); brim.position.y = 3.03; snowman.add(brim);
  for (const sd of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 5), std(0x5b3a2e)); arm.position.set(sd * 0.85, 2.1, 0); arm.rotation.z = sd * 1.0; snowman.add(arm); }
  snowman.rotation.y = Math.PI; snowman.position.set(-3.2, 0, 8.5); root.add(snowman);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), new THREE.MeshBasicMaterial({ map: textTex('❄ 메리 크리스마스 ❄', { w: 640, h: 150, bg: '#1d3b2a', color: '#ffe08a', font: 'bold 70px sans-serif', border: '#c99a3a' }) }));
  sign.rotation.y = Math.PI; sign.position.set(2.2, 2.6, 14); sign.userData.noFocus = true; root.add(sign);
  for (const x of [0.6, 3.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), std(0x5b3a2e)); p.position.set(x, 1.3, 14.05); root.add(p); }
  // 전구 줄: 양 팀 앞 머리 위로 (반짝)
  const garland = [];
  for (const zz of [-6.5, 6.5]) {
    for (let i = 0; i <= 26; i++) {
      const x = -5.2 + i * 0.4, y = 3.4 - 0.55 * (1 - (x / 5.2) ** 2);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: bulbCols[i % 5] }));
      b.position.set(x, y - 0.06, zz); b.userData.noFocus = true; b.userData.ph = i * 0.9; b.userData.col = new THREE.Color(bulbCols[i % 5]);
      root.add(b); garland.push(b);
    }
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.5, 8), std(0x2b2f3a, { metalness: 0.5 })); p.position.set(sd * 5.2, 1.75, zz); root.add(p); }
  }

  // ---------- 가로등 (따뜻한 빛, 탁구대 가까이 둘은 진짜 빛) ----------
  const lampPos = [[-3.6, -3.5], [3.6, 3.5], [-3.6, 4.5], [3.6, -4.5]];
  lampPos.forEach(([x, z], i) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8), std(0x1f2430, { metalness: 0.5 })); pole.position.y = 1.6; g.add(pole);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.4, 6), std(0xffe6a8, { emissive: 0xffc46b, emissiveIntensity: 1.4 })); head.position.y = 3.3; g.add(head);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.25, 6), std(0x1f2430)); cap.position.y = 3.62; g.add(cap);
    const capS = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 6), snowM()); capS.position.y = 3.72; g.add(capS);
    const gl = glowSprite(0xffcf7a, 2.6, 0.85); gl.position.y = 3.3; g.add(gl);
    if (i < 2) { const pl = new THREE.PointLight(0xffc27a, 9, 11, 1.6); pl.position.y = 3.1; g.add(pl); }
    g.position.set(x, 0, z); root.add(g);
  });
  // 눈 쌓인 벤치
  const bench = new THREE.Group(), wood = std(0x8a5a32);
  for (let i = 0; i < 3; i++) addBox(bench, 1.5, 0.04, 0.1, wood, 0, 0.44, -0.12 + i * 0.12);
  addBox(bench, 1.5, 0.3, 0.05, wood, 0, 0.7, -0.22);
  addBox(bench, 1.5, 0.07, 0.36, snowM(), 0, 0.5, 0);
  for (const x of [-0.65, 0.65]) addBox(bench, 0.05, 0.44, 0.3, std(0x1f2430), x, 0.22, 0);
  bench.position.set(-4.2, 0, 0); bench.rotation.y = Math.PI / 2; root.add(bench);
  // 울타리
  const fence = (x0, z0, x1, z1) => {
    const n = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 0.45);
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
      addBox(root, 0.1, 0.8, 0.06, std(0xf2ece0), x, 0.4, z);
      addBox(root, 0.13, 0.08, 0.1, snowM(), x, 0.83, z);
    }
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rail = addBox(root, len, 0.07, 0.05, std(0xf2ece0), (x0 + x1) / 2, 0.55, (z0 + z1) / 2); rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  fence(-9.5, -6, -9.5, 6); fence(9.5, -6, 9.5, 6);

  // ---------- 눈송이 + 굴뚝 연기 ----------
  const snow = makeDrift(rnd, 1600, [-22, 22, 0, 14, -30, 30], { px: 3.5, opacity: 0.9, fall: 1.1, sway: 0.5, colors: ['#ffffff', '#eef4ff'] });
  root.add(snow.pts);
  const smokeMat = new THREE.SpriteMaterial({ map: dotTex(), color: 0xb8c4dc, transparent: true, opacity: 0.35, depthWrite: false });
  const smoke = [];
  for (const c of chimneys) for (let k = 0; k < 4; k++) {
    const s = new THREE.Sprite(smokeMat.clone()); s.userData = { base: c, age: k * 1.2, noFocus: true }; root.add(s); smoke.push(s);
  }

  return {
    root,
    sky: '#1a2547',
    fog: [30, 160],
    far: 340,
    light: { hemi: ['#a9bde6', '#3a4566', 1.35], sun: ['#d6e4ff', 1.15, [-5, 9, -3]] },
    tick(t, dt) {
      snow.tick(t, dt);
      for (const b of bulbs) b.material.color.copy(b.userData.col).multiplyScalar(0.45 + 0.55 * Math.max(0, Math.sin(t * 2.2 + b.userData.ph)));
      for (const b of garland) b.material.color.copy(b.userData.col).multiplyScalar(0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + b.userData.ph)));
      starGlow.scale.setScalar(4.2 + Math.sin(t * 2) * 0.5);
      star.rotation.y = Math.sin(t * 0.6) * 0.3;
      for (const s of smoke) {
        s.userData.age = (s.userData.age + dt) % 4.8;
        const a = s.userData.age;
        s.position.set(s.userData.base.x + a * 0.25, s.userData.base.y + a * 0.7, s.userData.base.z);
        s.scale.setScalar(0.6 + a * 0.45);
        s.material.opacity = 0.35 * (1 - a / 4.8);
      }
    },
  };
}
