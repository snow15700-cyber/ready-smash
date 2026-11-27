// 🎶 자리마다 박자 타는 친구들 (fishing.md 13-3 '박자 친구들' ⓐ 시안, 11/27)
// 장르 자리에서 바라보는 바다·난간에 둘 사물·동물. 그림체는 물고기·고양이와 같음(툰 + 굵은 테두리 + 동그란 눈).
// 앞 = +z, 바닥(물·난간 밑) = y 0. 휴대폰을 생각해 하나당 삼각형 적게(구 조각 수를 줄임).
// g.userData.anim(t, B): B = 박자(beat.js BEAT와 같은 모양 { on, pulse, accent, n, phase, side, spb } + hit 0~1 '내가 맞춤').
//   B.on이 거짓이면 쉬는 동작(낚시 안 할 때·다른 사람 화면).
import * as THREE from 'three';
import { KIT } from './models.js';

const { toon, basic, finish, mesh, noOl, makeBlush } = KIT;
const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs); // 모형보다 조각 적게
const lerp = (a, b, k) => a + (b - a) * k;
const wave = (ph) => Math.cos(ph * Math.PI * 2) * 0.5 + 0.5; // 박에서 1, 반 박에서 0 (부드러운 박자)

function eye(s = 1) { // 고양이와 같은 까만 눈 + 반짝이
  const g = new THREE.Group();
  const b = mesh(sph(0.035 * s, 12, 10), basic(0x231c2c)); b.scale.z = 0.5; g.add(b);
  g.add(mesh(sph(0.013 * s, 8, 6), basic(0xffffff), 0.012 * s, 0.014 * s, 0.02 * s));
  return noOl(g);
}
function eyes(parent, s, x, y, z, ry = 0.25) {
  const list = [];
  for (const sx of [1, -1]) { const e = eye(s); e.position.set(sx * x, y, z); e.rotation.y = sx * ry; parent.add(e); list.push(e); }
  return list;
}
function blush(parent, s, x, y, z) { for (const sx of [1, -1]) { const b = makeBlush(s); b.position.set(sx * x, y, z); b.rotation.y = sx * 0.5; parent.add(b); } }
let WORLD = false; // 광장에 놓을 때: 물 원판은 안 만듦(진짜 바다가 있음)
function water(r = 0.6) {
  if (WORLD) return new THREE.Group();
  const m = noOl(mesh(new THREE.CircleGeometry(r, 32), basic(0x7cc7ef, { transparent: true, opacity: 0.55, depthWrite: false })));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; return m;
}
function ring(color, r = 0.2) { // 물결 고리 (박마다 퍼짐)
  const m = noOl(mesh(new THREE.TorusGeometry(r, 0.008, 4, 32), basic(color, { transparent: true, opacity: 0, depthWrite: false })));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.006; return m;
}
const spread = (m, ph, k = 1) => { const s = 0.5 + ph * 1.6; m.scale.set(s, s, s); m.material.opacity = (1 - ph) * 0.8 * k; };
let GLOW;
function glowTex() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (GLOW = new THREE.CanvasTexture(c));
}
const glow = (color, s) => { const sp = noOl(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))); sp.scale.setScalar(s); return sp; };
function textSprite(txt, color, s = 0.16) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 50px Jua, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#fff'; x.strokeText(txt, 32, 34); x.fillStyle = color; x.fillText(txt, 32, 34);
  const sp = noOl(new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })));
  sp.scale.setScalar(s); return sp;
}
// 박이 바뀌는 순간을 알려 줌 (모형마다 따로 기억)
function beatEdge() { let last = -1; return (B) => { if (!B.on || B.n === last) return false; last = B.n; return true; }; }

// ───────── 🎻 발라드 ─────────
function swan(scale, tint) {
  const white = toon(tint), beak = toon(0xff9a3c), black = toon(0x2a2430);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const b = mesh(sph(0.2, 16, 12), white); b.scale.set(0.85, 0.62, 1.15); b.position.y = 0.1; body.add(b);
  for (const sx of [1, -1]) { const w = mesh(sph(0.15, 12, 8), white, sx * 0.13, 0.16, -0.03); w.scale.set(0.4, 0.55, 1.05); w.rotation.x = -0.25; body.add(w); }
  const tail = mesh(new THREE.ConeGeometry(0.07, 0.14, 8), white, 0, 0.2, -0.22); tail.rotation.x = -0.9; body.add(tail);
  const neck = new THREE.Group(); neck.position.set(0, 0.15, 0.15); body.add(neck); // 목 밑동에서 까딱
  const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, 0.14, 0.04], [0, 0.26, -0.02], [0, 0.34, 0.03]].map((p) => new THREE.Vector3(...p)));
  neck.add(mesh(new THREE.TubeGeometry(curve, 10, 0.042, 8), white));
  const head = new THREE.Group(); head.position.set(0, 0.36, 0.05); neck.add(head);
  head.add(mesh(sph(0.065, 12, 10), white));
  const bk = mesh(new THREE.ConeGeometry(0.028, 0.09, 8), beak, 0, -0.012, 0.085); bk.rotation.x = Math.PI / 2 + 0.25; head.add(bk);
  head.add(mesh(sph(0.022, 8, 6), black, 0, 0.004, 0.05));
  eyes(head, 0.75, 0.045, 0.018, 0.035, 0.9);
  blush(head, 0.5, 0.055, -0.015, 0.02);
  g.scale.setScalar(scale);
  return { g, body, neck, head };
}
function swans() {
  const g = new THREE.Group(); g.add(water(0.75));
  const S = [swan(1, 0xffffff), swan(0.9, 0xfff6ee)];
  S[0].g.position.set(-0.24, 0, 0); S[1].g.position.set(0.24, 0, 0.05);
  for (const s of S) g.add(s.g);
  const rings = [ring(0xffffff, 0.22), ring(0xffffff, 0.2)]; rings[0].position.x = -0.24; rings[1].position.x = 0.24; g.add(...rings);
  const heart = textSprite('♥', '#ff6f9a', 0.14); heart.position.set(0, 0.62, 0.02); g.add(heart);
  finish(g);
  let face = 0, faceT = -9; const edge = beatEdge();
  g.userData.anim = (t, B) => {
    if (edge(B) && B.accent) faceT = t; // 마디 첫 박에 서로 마주 봄 (2박 동안)
    const want = B.on && t - faceT < B.spb * 2.2 ? 1 : 0;
    face = lerp(face, want, 0.06);
    S.forEach((s, i) => {
      const sx = i ? 1 : -1, off = i * 1.3;
      s.g.position.y = Math.sin(t * 1.4 + off) * 0.012;
      s.g.rotation.z = Math.sin(t * 1.1 + off) * 0.03;
      s.g.rotation.y = -sx * face * 0.9 + (B.on ? 0 : Math.sin(t * 0.3 + off) * 0.35);
      if (B.on) { const k = wave(B.phase); s.neck.rotation.x = 0.06 + k * 0.32; s.head.rotation.x = -k * 0.15; } // 박마다 천천히 까딱
      else { s.neck.rotation.x = 0.05 + Math.sin(t * 0.7 + off) * 0.06; s.head.rotation.x = 0; }
      if (B.on) spread(rings[i], B.phase, 0.7); else rings[i].material.opacity = 0;
    });
    heart.material.opacity = face > 0.6 ? (face - 0.6) * 2.5 : 0; heart.position.y = 0.6 + face * 0.05;
  };
  g.userData.view = { y: 0.6, look: 0.22, dist: 2.6 };
  return g;
}
function lanterns() {
  const g = new THREE.Group(); g.add(water(0.8));
  const L = [];
  for (const [x, z, s] of [[-0.38, -0.1, 0.9], [0.02, 0.12, 1.1], [0.4, -0.05, 0.85]]) {
    const one = new THREE.Group(); one.position.set(x, 0, z); one.scale.setScalar(s); g.add(one);
    const leaf = mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.03, 14), toon(0x6fbf73), 0, 0.015, 0); one.add(leaf);
    const shade = basic(0xd9893a), body = mesh(sph(0.09, 14, 10), shade, 0, 0.14, 0); body.scale.y = 1.25; one.add(body);
    for (const y of [0.035, 0.245]) one.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 10), toon(0xb8333a), 0, y, 0));
    const gl = glow(0xffc86a, 0.45); gl.position.y = 0.14; one.add(gl);
    const r = ring(0xfff0b0, 0.16); one.add(r);
    L.push({ one, shade, gl, r, off: L.length });
  }
  finish(g);
  const dim = new THREE.Color(0xc87a32), lit = new THREE.Color(0xfff0a0);
  g.userData.anim = (t, B) => {
    for (const l of L) {
      l.one.position.y = Math.sin(t * 1.2 + l.off * 2) * 0.01;
      l.one.rotation.z = Math.sin(t * 0.9 + l.off) * 0.04;
      // 박마다 은은히 밝아졌다 어두워짐 (하나씩 조금 늦게 = 물결처럼)
      const k = B.on ? wave(((B.phase - l.off * 0.12) % 1 + 1) % 1) : 0.35 + Math.sin(t * 0.8 + l.off * 2) * 0.15;
      l.shade.color.copy(dim).lerp(lit, k);
      l.gl.material.opacity = 0.35 + k * 0.6; l.gl.scale.setScalar(0.38 + k * 0.2);
      if (B.on) spread(l.r, ((B.phase - l.off * 0.12) % 1 + 1) % 1, 0.6); else l.r.material.opacity = 0;
    }
  };
  g.userData.view = { y: 0.7, look: 0.1, dist: 2.6 };
  return g;
}

// ───────── 🎷 재즈 ─────────
function seal() {
  const g = new THREE.Group(); g.add(water(0.8));
  const rock = mesh(new THREE.DodecahedronGeometry(0.3, 0), toon(0x8d8a94)); rock.scale.set(1.45, 0.5, 1.05); rock.position.y = 0.1; g.add(rock);
  const root = new THREE.Group(); root.position.y = 0.22; g.add(root);
  const fur = toon(0x8ea6bf), belly = toon(0xdfe9f2), dark = toon(0x2a2430);
  const body = mesh(sph(0.19, 16, 12), fur, 0, 0.17, 0); body.scale.set(1, 1.2, 0.9); root.add(body);
  const bl = mesh(sph(0.14, 12, 10), belly, 0, 0.15, 0.08); bl.scale.set(0.9, 1.15, 0.6); root.add(noOl(bl));
  for (const sx of [1, -1]) { const tf = mesh(sph(0.08, 10, 8), fur, sx * 0.12, 0.02, -0.12); tf.scale.set(1.2, 0.35, 0.8); root.add(tf); }
  const head = new THREE.Group(); head.position.set(0, 0.4, 0.02); root.add(head);
  head.add(mesh(sph(0.15, 16, 12), fur));
  for (const sx of [1, -1]) head.add(noOl(mesh(sph(0.045, 10, 8), belly, sx * 0.035, -0.04, 0.12)));
  head.add(noOl(mesh(sph(0.022, 8, 6), dark, 0, -0.012, 0.15)));
  eyes(head, 1, 0.065, 0.04, 0.125);
  blush(head, 0.8, 0.1, -0.03, 0.1);
  // 색소폰 (앞발로 안음, 마우스피스는 입에)
  const sax = new THREE.Group(); sax.position.set(0, 0.3, 0.16); root.add(sax);
  const gold = toon(0xf2c14e);
  const c = new THREE.CatmullRomCurve3([[0, 0.02, 0.02], [0.02, -0.08, 0.06], [0.03, -0.2, 0.06], [0.06, -0.27, 0.07], [0.12, -0.22, 0.09]].map((p) => new THREE.Vector3(...p)));
  sax.add(mesh(new THREE.TubeGeometry(c, 14, 0.024, 8), gold));
  const bell = mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.08, 12, 1, true), gold, 0.13, -0.18, 0.1); bell.rotation.z = -0.4; sax.add(bell);
  sax.add(noOl(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 6), dark, 0, 0.04, 0.0)));
  for (const y of [-0.06, -0.11, -0.16]) sax.add(noOl(mesh(sph(0.011, 6, 4), toon(0xfff2c0), 0.03, y, 0.09)));
  for (const sx of [1, -1]) { const fl = mesh(sph(0.07, 10, 8), fur, sx * 0.08, 0.2, 0.13); fl.scale.set(0.6, 0.35, 1); fl.rotation.z = sx * 0.5; root.add(fl); }
  const notes = ['♪', '♫'].map((s, i) => { const n = textSprite(s, i ? '#5a7fd6' : '#d66a9a', 0.13); g.add(n); return n; });
  finish(g);
  let sway = 0, noteT = -9, noteI = 0; const edge = beatEdge();
  g.userData.anim = (t, B) => {
    const breath = Math.sin(t * 2);
    root.scale.y = 1 + breath * 0.015;
    if (edge(B)) { noteT = t; noteI++; }
    sway = lerp(sway, B.on ? B.hit || 0 : 0, 0.08);
    if (B.on) {
      const p = B.pulse;
      head.rotation.x = 0.12 + p * 0.22; // 박마다 고개 까딱
      root.rotation.z = Math.sin((B.n + B.phase) * Math.PI) * 0.22 * sway; // 내가 맞추면 몸을 흔듦
      root.position.x = Math.sin((B.n + B.phase) * Math.PI) * 0.03 * sway;
      sax.rotation.x = -0.15 - sway * 0.25; sax.position.y = 0.3;
    } else {
      head.rotation.x = 0.05 + Math.sin(t * 0.6) * 0.05; root.rotation.z = 0; root.position.x = 0;
      sax.rotation.x = 0.35; sax.position.y = 0.27; // 쉬는 중: 색소폰을 내려 안고 있음
    }
    notes.forEach((n, i) => { // 음표가 박마다 하나씩 퐁
      const age = (i === noteI % 2) ? (t - noteT) / (B.spb * 1.6) : 9;
      n.visible = B.on && age < 1;
      if (n.visible) { n.position.set(0.2 + age * 0.12, 0.42 + age * 0.3, 0.3); n.material.opacity = 1 - age; }
    });
  };
  g.userData.view = { y: 0.75, look: 0.36, dist: 2.6 };
  return g;
}
function gull() {
  const g = new THREE.Group();
  const white = toon(0xffffff), grey = toon(0xa9b3c2), yel = toon(0xffc93c), org = toon(0xff9a3c);
  const body = mesh(sph(0.1, 12, 10), white, 0, 0.1, 0); body.scale.set(0.85, 0.85, 1.35); g.add(body);
  for (const sx of [1, -1]) { const w = mesh(sph(0.09, 10, 8), grey, sx * 0.07, 0.12, -0.03); w.scale.set(0.35, 0.6, 1.3); g.add(w); }
  const tail = mesh(new THREE.ConeGeometry(0.04, 0.09, 6), grey, 0, 0.11, -0.15); tail.rotation.x = -Math.PI / 2 - 0.3; g.add(tail);
  for (const sx of [1, -1]) g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5), org, sx * 0.03, 0.025, 0.01));
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.08); g.add(head);
  head.add(mesh(sph(0.07, 12, 10), white));
  const bk = mesh(new THREE.ConeGeometry(0.022, 0.08, 6), yel, 0, -0.01, 0.09); bk.rotation.x = Math.PI / 2; head.add(bk);
  head.add(noOl(mesh(sph(0.008, 6, 4), basic(0xe0483e), 0, -0.02, 0.105)));
  eyes(head, 0.7, 0.042, 0.02, 0.05, 0.7);
  return { g, head };
}
function gulls() {
  const g = new THREE.Group(), wood = toon(0xb07a4a);
  for (const x of [-0.62, 0.62]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), wood, x, 0.21, 0));
  g.add(mesh(new THREE.BoxGeometry(1.42, 0.05, 0.08), wood, 0, 0.42, 0));
  g.add(mesh(new THREE.BoxGeometry(1.32, 0.035, 0.05), wood, 0, 0.22, 0));
  const G = [-0.4, 0, 0.4].map((x, i) => { const b = gull(); b.g.position.set(x, 0.445, 0); b.g.rotation.y = (i - 1) * 0.25; g.add(b.g); return b; });
  finish(g);
  g.userData.anim = (t, B) => {
    G.forEach((b, i) => {
      if (B.on) {
        const k = B.n % 3 === i ? Math.sin(Math.min(1, B.phase / 0.6) * Math.PI) : 0; // 번갈아 고개 까딱 (왼 → 가운데 → 오른)
        b.head.position.z = 0.08 + k * 0.05; b.head.rotation.x = k * 0.35; b.head.rotation.y = 0;
        b.g.position.y = 0.445 + k * 0.012;
      } else { // 쉬는 중: 두리번
        b.head.position.z = 0.08; b.head.rotation.x = 0; b.g.position.y = 0.445;
        b.head.rotation.y = Math.sin(t * 0.5 + i * 2.1) > 0.6 ? 0.7 * Math.sign(Math.sin(t * 0.23 + i)) : 0;
      }
    });
  };
  g.userData.view = { y: 0.75, look: 0.45, dist: 2.6 };
  return g;
}

// ───────── 🎸 록 ─────────
function crab(inst) {
  const g = new THREE.Group(), red = toon(0xe8553e), pale = toon(0xffc2a8), dark = toon(0x2a2430);
  const root = new THREE.Group(); g.add(root);
  const body = mesh(sph(0.13, 14, 10), red, 0, 0.1, 0); body.scale.set(1.35, 0.6, 1); root.add(body);
  const belly = mesh(sph(0.1, 10, 8), pale, 0, 0.08, 0.05); belly.scale.set(1.3, 0.5, 0.9); root.add(noOl(belly));
  for (const sx of [1, -1]) { // 눈자루 + 눈
    root.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5), red, sx * 0.05, 0.18, 0.06));
    const e = mesh(sph(0.03, 10, 8), toon(0xffffff), sx * 0.05, 0.22, 0.065); root.add(e);
    const p = noOl(mesh(sph(0.016, 8, 6), dark, sx * 0.05, 0.222, 0.09)); root.add(p);
  }
  blush(root, 0.7, 0.11, 0.1, 0.11);
  for (const sx of [1, -1]) for (const k of [0, 1, 2]) { // 다리 3쌍
    const l = mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.13, 5), red, sx * (0.15 + k * 0.01), 0.05, -0.05 + k * 0.05);
    l.rotation.z = sx * 1.0; l.rotation.y = (k - 1) * 0.4 * sx; root.add(l);
  }
  const claws = [];
  for (const sx of [1, -1]) { // 집게: 팔 + 아래 턱 + 위 턱(딱딱)
    const arm = new THREE.Group(); arm.position.set(sx * 0.15, 0.12, 0.06); root.add(arm);
    const a = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6), red, sx * 0.03, 0.04, 0); a.rotation.z = -sx * 0.6; arm.add(a);
    const hand = new THREE.Group(); hand.position.set(sx * 0.07, 0.1, 0.01); arm.add(hand);
    const low = mesh(sph(0.045, 10, 8), red); low.scale.set(0.8, 1, 0.7); hand.add(low);
    const top = new THREE.Group(); top.position.set(0, 0.03, 0); hand.add(top);
    const tp = mesh(new THREE.ConeGeometry(0.022, 0.07, 6), red, sx * 0.012, 0.035, 0); tp.rotation.z = -sx * 0.25; top.add(tp);
    const tp2 = mesh(new THREE.ConeGeometry(0.02, 0.06, 6), red, -sx * 0.02, 0.03, 0); tp2.rotation.z = sx * 0.2; hand.add(tp2);
    claws.push({ arm, top, sx });
  }
  if (inst === 'guitar') { // 작은 기타 (몸 앞에 비스듬히)
    const gt = new THREE.Group(); gt.position.set(0.02, 0.1, 0.16); gt.rotation.z = 0.9; gt.scale.setScalar(0.7); root.add(gt);
    const gb = mesh(sph(0.06, 12, 8), toon(0x3f7fe0)); gb.scale.set(1, 1.2, 0.35); gt.add(gb);
    gt.add(mesh(new THREE.BoxGeometry(0.022, 0.16, 0.015), toon(0x6b4a2a), 0, 0.12, 0));
    gt.add(noOl(mesh(new THREE.CircleGeometry(0.018, 10), basic(0x23304a), 0, 0, 0.022)));
  }
  let drum = null;
  if (inst === 'drum') {
    drum = new THREE.Group(); drum.position.set(0, 0, 0.2); drum.scale.set(0.7, 0.6, 0.7); g.add(drum);
    drum.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14), toon(0xffd23f), 0, 0.06, 0));
    drum.add(noOl(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.005, 14), toon(0xfffaf0), 0, 0.123, 0)));
  }
  return { g, root, claws, drum };
}
function crabBand() {
  const g = new THREE.Group();
  const sand = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 24), toon(0xf1d9a0), 0, 0.03, 0); g.add(sand);
  const C = [crab('guitar'), crab('drum'), crab('guitar')];
  C.forEach((c, i) => { c.g.position.set((i - 1) * 0.45, 0.06, i === 1 ? -0.15 : 0.08); c.g.rotation.y = (1 - i) * 0.3; g.add(c.g); });
  finish(g);
  g.userData.anim = (t, B) => {
    const jump = B.on && B.accent ? Math.min(1, B.phase * 2) : 0;
    C.forEach((c, i) => {
      if (B.on) {
        const p = B.pulse;
        c.root.rotation.x = p * 0.45; // 헤드뱅잉
        c.root.position.y = Math.sin(jump * Math.PI) * 0.06;
        for (const cl of c.claws) { cl.top.rotation.z = cl.sx * (1 - p) * 0.6; cl.arm.rotation.z = -cl.sx * p * 0.3; } // 박마다 집게 딱!
        if (c.drum) for (const cl of c.claws) cl.arm.rotation.x = p * 0.9;
      } else { // 쉬는 중: 옆으로 살금살금 + 집게 천천히 오므렸다 폈다
        c.root.rotation.x = 0; c.root.position.y = 0;
        c.root.position.x = Math.sin(t * 1.2 + i) * 0.02;
        for (const cl of c.claws) { cl.top.rotation.z = cl.sx * (0.3 + Math.sin(t * 1.5 + i) * 0.3); cl.arm.rotation.z = 0; cl.arm.rotation.x = 0; }
      }
    });
  };
  g.userData.view = { y: 1.0, look: 0.15, dist: 3.1 };
  return g;
}
function speakers() {
  const g = new THREE.Group(), boxM = toon(0x34323a), rim = toon(0x5a5866), cone = toon(0x1f1d24), cap = toon(0x9aa0aa);
  const boxes = [];
  for (const [w, h, d, y, cones] of [[0.5, 0.36, 0.34, 0.18, [0.12]], [0.42, 0.3, 0.3, 0.52, [0.095]], [0.3, 0.16, 0.24, 0.76, [0.04, 0.04]]]) {
    const b = new THREE.Group(); b.position.y = y; g.add(b);
    b.add(mesh(new THREE.BoxGeometry(w, h, d), boxM));
    const cs = [];
    cones.forEach((r, i) => {
      const cx = cones.length > 1 ? (i - 0.5) * w * 0.5 : 0;
      const ri = noOl(mesh(new THREE.TorusGeometry(r, r * 0.16, 6, 20), rim, cx, 0, d / 2)); b.add(ri);
      const co = noOl(mesh(new THREE.CircleGeometry(r * 0.9, 20), basic(0x15141a), cx, 0, d / 2 + 0.002)); b.add(co);
      const dc = noOl(mesh(sph(r * 0.35, 10, 8), cap, cx, 0, d / 2)); dc.scale.z = 0.5; b.add(dc);
      cs.push(dc);
    });
    boxes.push({ b, cs, d });
  }
  const bar = mesh(new THREE.BoxGeometry(0.32, 0.04, 0.05), basic(0x553366), 0, 0.86, 0.06); g.add(noOl(bar)); // 위 조명 줄 (크래시 때 번쩍)
  const flash = glow(0xffe37a, 1.2); flash.position.set(0, 0.6, 0.3); g.add(flash);
  const bolt = textSprite('⚡', '#ffd23f', 0.22); bolt.position.set(0.3, 0.9, 0.2); g.add(bolt);
  const waves = [0, 1].map(() => { const w = noOl(mesh(new THREE.TorusGeometry(0.14, 0.01, 4, 28), basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false }))); w.position.set(0, 0.18, 0.2); g.add(w); return w; });
  finish(g);
  const off = new THREE.Color(0x553366), on = new THREE.Color(0xfff0a0);
  g.userData.anim = (t, B) => {
    const crash = B.on && B.accent ? Math.max(0, 1 - B.phase * 1.1) : 0;
    const p = B.on ? B.pulse : 0;
    boxes.forEach((x, i) => {
      const s = 1 + p * (0.06 - i * 0.012);
      x.b.scale.set(s, 1 + p * 0.03, s);
      for (const c of x.cs) c.position.z = x.d / 2 + p * 0.03; // 박마다 쿵 (콘이 튀어나옴)
    });
    if (!B.on) for (const x of boxes) x.b.scale.setScalar(1 + Math.sin(t * 2) * 0.004);
    bar.material.color.copy(off).lerp(on, Math.max(crash, B.on ? p * 0.25 : 0));
    flash.material.opacity = crash * 0.9; flash.scale.setScalar(0.8 + crash * 0.8);
    bolt.material.opacity = crash; bolt.position.y = 0.9 + (1 - crash) * 0.06;
    waves.forEach((w, i) => { if (!B.on) { w.material.opacity = 0; return; } const ph = (B.phase + i * 0.5) % 1; w.scale.setScalar(1 + ph * 2); w.position.z = 0.2 + ph * 0.3; w.material.opacity = (1 - ph) * 0.6; });
  };
  g.userData.view = { y: 0.8, look: 0.42, dist: 3.0 };
  return g;
}
function penguin() {
  const g = new THREE.Group(); g.add(water(0.7));
  const buoy = new THREE.Group(); g.add(buoy);
  const bb = mesh(sph(0.2, 16, 10), toon(0xe8463e), 0, 0.08, 0); bb.scale.y = 0.65; buoy.add(bb);
  const band = noOl(mesh(new THREE.TorusGeometry(0.19, 0.03, 6, 24), toon(0xffffff), 0, 0.09, 0)); band.rotation.x = Math.PI / 2; buoy.add(band);
  buoy.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 14), toon(0xffffff), 0, 0.2, 0));
  const P = new THREE.Group(); P.position.y = 0.22; buoy.add(P);
  const navy = toon(0x2b2f45), white = toon(0xffffff), org = toon(0xffa53c);
  const body = mesh(sph(0.13, 14, 10), navy, 0, 0.14, 0); body.scale.set(1, 1.3, 0.95); P.add(body);
  const bl = mesh(sph(0.1, 12, 8), white, 0, 0.12, 0.075); bl.scale.set(0.95, 1.25, 0.6); P.add(noOl(bl));
  for (const sx of [1, -1]) { const f = mesh(sph(0.04, 8, 6), org, sx * 0.05, 0.01, 0.06); f.scale.set(1, 0.35, 1.5); P.add(f); }
  const fl = [];
  for (const sx of [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.12, 0.2, 0); P.add(sh);
    const w = mesh(sph(0.06, 10, 8), navy, sx * 0.01, -0.06, 0); w.scale.set(0.3, 1.1, 0.6); sh.add(w);
    sh.userData.sx = sx; fl.push(sh);
  }
  const head = new THREE.Group(); head.position.set(0, 0.3, 0); P.add(head);
  head.add(mesh(sph(0.1, 14, 10), navy));
  for (const sx of [1, -1]) { const fp = noOl(mesh(sph(0.04, 8, 6), white, sx * 0.04, 0.01, 0.075)); fp.scale.z = 0.5; head.add(fp); }
  const bk = mesh(new THREE.ConeGeometry(0.025, 0.06, 6), org, 0, -0.02, 0.11); bk.rotation.x = Math.PI / 2; head.add(bk);
  eyes(head, 0.75, 0.04, 0.015, 0.09);
  blush(head, 0.6, 0.065, -0.02, 0.07);
  const hair = mesh(new THREE.ConeGeometry(0.025, 0.08, 5), toon(0xffd23f), 0.0, 0.11, 0.0); hair.rotation.z = 0.3; head.add(hair); // 록 머리털 한 가닥
  finish(g);
  g.userData.anim = (t, B) => {
    buoy.position.y = Math.sin(t * 1.6) * 0.02; buoy.rotation.z = Math.sin(t * 1.1) * 0.06;
    if (B.on) {
      const p = B.pulse;
      head.rotation.x = -0.15 + p * 0.7; // 헤드뱅잉 (크게)
      P.rotation.x = p * 0.15;
      for (const sh of fl) sh.rotation.z = sh.userData.sx * (0.3 + p * 1.1); // 날개 퍼덕
      hair.rotation.x = -p * 0.6;
    } else {
      head.rotation.x = 0; P.rotation.x = 0; head.rotation.y = Math.sin(t * 0.4) * 0.5; hair.rotation.x = 0;
      for (const sh of fl) sh.rotation.z = sh.userData.sx * (0.15 + Math.sin(t * 2) * 0.05);
    }
  };
  g.userData.view = { y: 0.6, look: 0.3, dist: 2.0 };
  return g;
}

// 장르별 목록: [id, 이름, 설명, 만들기]
export const FRIENDS = {
  ballad: [['swans', '🦢 백조 한 쌍', '박마다 목을 천천히 까딱 · 마디 첫 박에 서로 마주 봄', swans], ['lanterns', '🏮 물 위 등불', '박마다 은은히 밝아졌다 어두워짐 (하나씩 조금 늦게)', lanterns]],
  jazz: [['seal', '🦭 색소폰 물개', '박마다 고개 까딱 · 내가 맞추면 몸을 흔듦 · 음표 퐁', seal], ['gulls', '🐦 난간 갈매기 셋', '번갈아 고개 까딱 (왼 → 가운데 → 오른)', gulls]],
  rock: [['crabs', '🦀 꽃게 밴드', '박마다 집게 딱딱 · 헤드뱅잉 · 마디 첫 박에 폴짝', crabBand], ['speakers', '🔊 스피커 탑', '박마다 쿵쿵 부풂 · 크래시(마디 첫 박) 때 번쩍', speakers], ['penguin', '🐧 헤드뱅잉 펭귄', '부표 위에서 헤드뱅잉 · 날개 퍼덕', penguin]],
};
export function makeFriend(id, { world = false } = {}) {
  WORLD = world;
  try { for (const list of Object.values(FRIENDS)) for (const [fid, , , make] of list) if (fid === id) return make(); } finally { WORLD = false; }
  return null;
}
