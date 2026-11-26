// 🐱 선착장 고양이 6마리 모형 (docs/dev/cats.md · fishing.md 14-2). 그림체 = **B 2등신 인형** (11/26 사용자 확정):
// 큰 머리 + 작은 몸, 큰 동그란 까만 눈 + 반짝이, ω 입, 볼터치, 굵은 테두리(물고기와 같음). 세로 동공·수염·긴 몸·가는 다리는 안 씀.
// 모양은 하나, 털 무늬·눈 테·먹는 몸짓만 표(COATS)로 다름. 앞 = +z, 바닥 = y 0, 키 약 0.8.
// 뼈대 없이 몸·머리·꼬리·발 4개를 돌리고 옮겨서 자세를 만듦(김제빵과 같은 방식).
// g.userData.anim(t, pose): pose = 'sit' | 'nod'(리듬에 까딱) | 'stand'(두리번) | 'walk' | 'loaf'(식빵) | 'belly'(배 보이고 zzz)
import * as THREE from 'three';
import { KIT } from '../fishing/models.js';

const { toon, basic, finish, sph, mesh, noOl, makeBlush } = KIT;

// base 몸 · light 배·입가 · mark 무늬 · ring 눈 테(털이 까만 고양이는 눈이 묻히지 않게) · paws 발 색 · eat 먹는 몸짓
export const COATS = {
  cheese: { name: '치즈', base: 0xffb65c, light: 0xfff3dc, mark: 0xf08a2c, stripes: true, eat: 'dance', note: '먹보 · 먹을 때 춤' },
  mackerel: { name: '고등어', base: 0xb2aea6, light: 0xf6f3ee, mark: 0x5a554f, stripes: true, backStripes: true, eat: 'gulp', note: '고등어 무늬 · 허겁지겁' },
  calico: { name: '삼색이', base: 0xfffaf2, light: 0xfffaf2, mark: 0xf3a24f, mark2: 0x3a3433, spots: true, eat: 'slow', note: '얌전 · 천천히 냠냠' },
  tuxedo: { name: '턱시도', base: 0x34323a, light: 0xffffff, mark: 0x34323a, ring: 0xbfe58a, paws: 0xffffff, eat: 'bow', note: '신사 · 먹기 전에 꾸벅' },
  black: { name: '까망이', base: 0x2e2c34, light: 0x45424c, mark: 0x2e2c34, ring: 0xffd23f, eat: 'peek', note: '수줍음 · 주위를 살피고 냠' },
  siamese: { name: '샴', base: 0xf6ead6, light: 0xfffaf0, mark: 0x6b4a38, ring: 0x9fd0ff, points: true, eat: 'turn', note: '새침 · 고개 한 번 돌렸다 먹기' },
};
export const CAT_IDS = Object.keys(COATS);

// 동그란 까만 눈 + 반짝이 2개 (ring = 뒤에 색 테)
function eye(s, ring) {
  const g = new THREE.Group();
  if (ring) { const r = mesh(sph(0.062 * s, 18, 14), basic(ring)); r.scale.z = 0.4; r.position.z = -0.004; g.add(r); }
  const b = mesh(sph(0.05 * s, 18, 14), basic(0x231c2c)); b.scale.z = 0.5; g.add(b);
  g.add(mesh(sph(0.02 * s, 10, 8), basic(0xffffff), 0.017 * s, 0.02 * s, 0.03 * s));
  g.add(mesh(sph(0.009 * s, 8, 6), basic(0xffffff), -0.016 * s, -0.018 * s, 0.03 * s));
  return noOl(g);
}
function mouthW(mat) { // ω
  const g = new THREE.Group();
  for (const sx of [1, -1]) { const m = mesh(new THREE.TorusGeometry(0.016, 0.0045, 6, 12, Math.PI), mat, sx * 0.016, 0, 0); m.rotation.z = Math.PI; g.add(m); }
  return noOl(g);
}
function ear(mat, inner) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.09, 0.15, 16), mat, 0, 0.075, 0));
  g.add(noOl(mesh(new THREE.ConeGeometry(0.05, 0.09, 12), inner, 0, 0.06, 0.03)));
  return g;
}
const dot = (parent, mat, x, y, z, sx, sy, sz, rx = 0) => { const m = noOl(mesh(sph(1, 14, 10), mat, x, y, z)); m.scale.set(sx, sy, sz); m.rotation.x = rx; parent.add(m); return m; };

export function makeCat(id = 'cheese') {
  const C = COATS[id] || COATS.cheese;
  const fur = toon(C.base), light = toon(C.light), mark = toon(C.mark), pink = toon(0xffb3c4);
  const pawMat = C.points ? mark : C.paws ? toon(C.paws) : light;
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);

  // 몸 (동그란 배)
  const body = new THREE.Group(); root.add(body);
  const torso = mesh(sph(0.17, 24, 18), fur); torso.scale.set(1, 1.05, 0.95); body.add(torso);
  dot(body, light, 0, -0.01, 0.1, 0.12, 0.13, 0.07);
  if (C.backStripes) for (const y of [0.05, -0.03]) dot(body, mark, 0, y, -0.13, 0.11, 0.022, 0.05);
  if (C.spots) { dot(body, mark, 0.1, 0.06, -0.08, 0.08, 0.08, 0.07); dot(body, toon(C.mark2), -0.11, -0.02, -0.06, 0.07, 0.07, 0.07); }
  // 발 4개 (앞발 0·1, 뒷다리 2·3) — 콩알 발
  const paws = [];
  for (const [x, front] of [[0.08, 1], [-0.08, 1], [0.14, 0], [-0.14, 0]]) {
    const P = new THREE.Group(); root.add(P);
    const m = mesh(sph(front ? 0.065 : 0.085, 14, 10), front ? pawMat : fur); if (!front) m.scale.set(0.8, 0.7, 1.1); P.add(m);
    if (!front && (C.points || C.paws)) dot(P, pawMat, 0, -0.03, 0.06, 0.05, 0.035, 0.04);
    P.userData = { x, front: !!front };
    paws.push(P);
  }
  // 꼬리 (밑동에서 흔듦)
  const tail = new THREE.Group(); root.add(tail);
  const tc = new THREE.CatmullRomCurve3([[0, 0, 0], [0.12, 0.02, -0.06], [0.22, 0.12, -0.02], [0.24, 0.24, 0.04]].map((p) => new THREE.Vector3(...p)));
  tail.add(mesh(new THREE.TubeGeometry(tc, 20, 0.04, 10), fur));
  tail.add(mesh(sph(0.045, 12, 10), C.points || C.stripes ? mark : fur, 0.24, 0.24, 0.04));
  // 머리
  const head = new THREE.Group(); root.add(head);
  const skull = mesh(sph(0.27, 30, 22), fur); skull.scale.set(1.12, 0.95, 1); head.add(skull);
  const ears = [];
  for (const sx of [1, -1]) { const e = ear(C.points ? mark : fur, pink); e.position.set(sx * 0.17, 0.18, -0.02); e.rotation.z = -sx * 0.4; e.userData.sx = sx; head.add(e); ears.push(e); }
  if (C.stripes) for (const x of [-0.06, 0, 0.06]) dot(head, mark, x, 0.215 - Math.abs(x) * 0.25, 0.15, 0.02, 0.045, 0.025, -0.55);
  if (C.spots) { dot(head, mark, -0.15, 0.1, 0.12, 0.1, 0.09, 0.08); dot(head, toon(C.mark2), 0.16, 0.13, 0.08, 0.08, 0.07, 0.08); }
  if (id === 'tuxedo') dot(head, light, 0, -0.1, 0.18, 0.13, 0.1, 0.08); // 흰 입가·턱
  if (C.points) dot(head, mark, 0, -0.04, 0.22, 0.105, 0.065, 0.035);
  const face = new THREE.Group(); face.position.set(0, -0.03, 0.25); head.add(face);
  const eyes = [];
  for (const sx of [1, -1]) {
    const e = eye(1.25, C.ring); e.position.set(sx * 0.1, 0.03, 0); e.rotation.y = sx * 0.2; face.add(e); eyes.push(e);
    const b = makeBlush(1.2); b.position.set(sx * 0.17, -0.04, -0.04); b.rotation.y = sx * 0.5; face.add(b);
  }
  if (!C.points && id !== 'tuxedo') { const muz = noOl(mesh(sph(0.055, 14, 10), light)); muz.position.set(0, -0.05, 0); muz.scale.set(1.3, 0.8, 0.6); face.add(muz); }
  face.add(noOl(mesh(sph(0.016, 10, 8), basic(0xff8fa6), 0, -0.03, 0.03)));
  const mw = mouthW(basic(C.base < 0x606060 && !C.points && id !== 'tuxedo' ? 0xf2e6e8 : 0x3a2a33)); mw.position.set(0, -0.058, 0.03); face.add(mw);
  // zzz
  const zz = makeZzz(); zz.visible = false; g.add(zz);

  finish(g);
  const parts = { root, body, head, paws, tail, eyes, ears, zz, lift: null, fx: {} };
  const blink = KIT.blinker(eyes);
  // fx(3b, 바꿔서 씀): ear 0~1 귀 접힘 · hop m 폴짝 · tailUp 꼬리 세움
  g.userData = { id, coat: C, parts, fx: parts.fx, faceZ: true, anim: (t, pose = 'sit') => posePlay(parts, t, pose, blink, C) };
  g.userData.anim(0, 'sit');
  return g;
}

function makeZzz() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const x = cv.getContext('2d'); x.font = 'bold 54px Jua, sans-serif'; x.fillStyle = '#6d7fd6'; x.strokeStyle = '#fff'; x.lineWidth = 8;
  for (const [s, px, py] of [['z', 20, 110], ['z', 55, 75], ['Z', 85, 45]]) { x.strokeText(s, px, py); x.fillText(s, px, py); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.scale.set(0.3, 0.3, 1); sp.userData.noOutline = true;
  return sp;
}

// 기본(앉기) 자리 → 자세마다 바꿀 것만 바꿈
const PAW0 = [[0.08, 0.05, 0.13], [-0.08, 0.05, 0.13], [0.14, 0.07, -0.02], [-0.14, 0.07, -0.02]];
function posePlay(P, t, pose, blink, C) {
  const { root, body, head, paws, tail, eyes, zz } = P;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  body.position.set(0, 0.17, 0); body.rotation.set(0, 0, 0); body.scale.set(1, 1, 1);
  head.position.set(0, 0.5, 0.02); head.rotation.set(0, 0, 0);
  paws.forEach((p, i) => { p.position.set(...PAW0[i]); p.rotation.set(0, 0, 0); p.scale.setScalar(1); });
  tail.position.set(0, 0.06, -0.14); tail.rotation.set(0, 0, 0);
  zz.visible = false;
  for (const e of P.ears) { const sx = e.userData.sx, f = P.fx.ear || 0; e.rotation.set(-f * 0.9, 0, -sx * (0.4 + f * 0.7)); }
  blink(t);
  const breath = Math.sin(t * 2.4);
  body.scale.y = 1 + breath * 0.02;
  tail.rotation.y = Math.sin(t * 2.0) * 0.25;
  if (pose === 'sit' || pose === 'nod') {
    head.position.y += breath * 0.004;
    if (pose === 'nod') { head.rotation.x = Math.sin(t * 7.5) * 0.15; head.rotation.z = Math.sin(t * 3.75) * 0.08; } // 리듬에 까딱
    else head.rotation.z = Math.sin(t * 0.9) * 0.05;
    if (pose === 'sit' && C.eat === 'turn') head.rotation.y = Math.sin(t * 0.5) * 0.35; // 샴: 새침하게 고개 돌리기
  } else if (pose === 'stand' || pose === 'walk') { // 네 발로 섬: 몸을 앞뒤로 길게, 머리는 앞으로
    body.position.set(0, 0.19, -0.03); body.scale.set(0.95, 0.85, 1.25);
    head.position.set(0, 0.42, 0.17);
    paws[2].position.set(0.09, 0.055, -0.17); paws[3].position.set(-0.09, 0.055, -0.17);
    for (const p of [paws[2], paws[3]]) p.scale.set(0.85, 0.85, 0.7);
    tail.position.set(0, 0.2, -0.22); tail.rotation.x = -0.9;
    if (pose === 'walk') {
      const s = Math.sin(t * 9);
      [s, -s, -s, s].forEach((v, i) => { paws[i].position.z += v * 0.035; paws[i].position.y += Math.max(0, v) * 0.03; });
      root.position.y = Math.abs(Math.cos(t * 9)) * 0.015;
      head.rotation.x = Math.sin(t * 18) * 0.03;
    } else head.rotation.y = Math.sin(t * 0.7) * 0.35; // 두리번
  } else if (pose === 'loaf') { // 식빵 굽기: 납작하게 엎드림, 앞발 끝만 살짝
    body.position.set(0, 0.12, -0.02); body.scale.set(1.08, 0.78, 1.15);
    head.position.set(0, 0.36, 0.08);
    paws[0].position.set(0.07, 0.03, 0.15); paws[1].position.set(-0.07, 0.03, 0.15);
    for (const i of [0, 1]) paws[i].scale.set(0.9, 0.6, 0.9);
    for (const i of [2, 3]) paws[i].scale.setScalar(0.001);
    tail.position.set(0.05, 0.04, -0.12); tail.rotation.y = 1.2 + Math.sin(t * 0.8) * 0.1;
    for (const e of eyes) e.scale.y = Math.min(e.scale.y, 0.25);
  } else if (pose === 'belly') { // 옆으로 벌러덩 누워 zzz (하루 3마리 다 먹으면) — 얼굴·배는 앞(+z)으로
    root.rotation.z = 1.35;
    if (P.lift == null) { // 몸 높이만 재려고 잠깐 떼어 냄 (붙인 채 재면 광장 선착장 높이·크기까지 들어가서 공중에 뜸)
      const par = root.parent; par.remove(root); root.position.set(0, 0, 0); root.updateMatrixWorld(true);
      P.lift = -new THREE.Box3().setFromObject(root).min.y; par.add(root);
    }
    root.position.set(0.3, P.lift, 0);
    head.rotation.z = -0.45 + Math.sin(t * 0.8) * 0.04;
    paws.forEach((p, i) => { p.position.z += 0.03 + Math.sin(t * 1.3 + i) * 0.008; });
    tail.rotation.y = 0.4 + Math.sin(t * 1.1) * 0.15;
    for (const e of eyes) e.scale.y = 0.1;
    zz.visible = true; zz.position.set(-0.05, 0.58 + Math.sin(t * 1.6) * 0.03, 0.3);
  } else if (pose === 'tap') { // 잡은 물고기 툭툭 (앉아서 앞발 하나로)
    head.rotation.x = 0.25;
    paws[0].position.z += 0.07; paws[0].position.y += Math.max(0, Math.sin(t * 9)) * 0.07;
  }
  if (P.fx.hop) root.position.y += P.fx.hop;
  if (P.fx.tailUp) { tail.rotation.x = -1.3; tail.rotation.y = Math.sin(t * 6) * 0.12; } // 꼬리 세우고 끝만 살랑
}
