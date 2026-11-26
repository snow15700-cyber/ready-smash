// 🐱 선착장 고양이 6마리 모형 (docs/dev/cats.md · fishing.md 14-2). 그림체 = 물고기와 같은 A '젤리 장난감'
// (굵은 테두리 + 3단 만화 그림자 + 반짝이는 큰 눈 + 볼터치). 모양은 하나, 털 무늬·눈 색·몸짓만 표(COATS)로 다름.
// 앞 = +z, 바닥 = y 0, 키 약 0.75. 뼈대 없이 몸통·머리·꼬리·다리 4개를 돌려서 자세를 만듦(김제빵과 같은 방식).
// g.userData.anim(t, pose): pose = 'stand' | 'walk' | 'sit' | 'nod' | 'loaf' | 'belly'(배 보이고 zzz)
import * as THREE from 'three';
import { KIT } from '../fishing/models.js';

const { toon, basic, finish, sph, mesh, noOl, makeBlush } = KIT;

// 털 무늬 표: base 몸 · belly 배·입가 · eye 눈동자 · marks [[부위, 색, 자리(x,y,z), 크기(x,y,z)]] · points 샴 포인트 · eat 먹는 몸짓
export const COATS = {
  cheese: { name: '치즈', base: 0xf6a94a, belly: 0xfff1d6, eye: 0x5fb84a, stripe: 0xd9782a, eat: 'dance', note: '먹보 · 먹을 때 춤' },
  mackerel: { name: '고등어', base: 0xa9a59c, belly: 0xf4f1ea, eye: 0x9cc23a, stripe: 0x4f4a45, eat: 'gulp', note: '고등어 무늬 · 허겁지겁' },
  calico: { name: '삼색이', base: 0xfffaf2, belly: 0xfffaf2, eye: 0xd9a53a, spots: [0xf0a04b, 0x35302f], eat: 'slow', note: '얌전 · 천천히 냠냠' },
  tuxedo: { name: '턱시도', base: 0x2d2c33, belly: 0xffffff, eye: 0x9ccf4a, whitePaws: true, eat: 'bow', note: '신사 · 먹기 전에 꾸벅' },
  black: { name: '까망이', base: 0x29272e, belly: 0x3a3740, eye: 0xf2c62e, eat: 'peek', note: '수줍음 · 주위를 살피고 냠' },
  siamese: { name: '샴', base: 0xf3e6cf, belly: 0xfaf3e4, eye: 0x4aa3ff, points: 0x5a3d2e, eat: 'turn', note: '새침 · 고개 한 번 돌렸다 먹기' },
};
export const CAT_IDS = Object.keys(COATS);

// 고양이 눈: 흰자 없이 큰 색 눈동자 + 세로 동공 + 반짝이 2개
function catEye(iris, s = 1) {
  const g = new THREE.Group();
  const w = mesh(sph(0.062 * s), basic(iris)); w.scale.z = 0.45; g.add(w);
  const ring = mesh(new THREE.TorusGeometry(0.061 * s, 0.008 * s, 6, 24), basic(0x1c1a2a)); ring.position.z = 0.006 * s; g.add(ring);
  const p = mesh(sph(0.036 * s), basic(0x1c1a2a), 0, -0.004 * s, 0.022 * s); p.scale.set(0.62, 1.15, 0.4); g.add(p);
  g.add(mesh(sph(0.019 * s, 10, 8), basic(0xffffff), 0.022 * s, 0.024 * s, 0.034 * s));
  g.add(mesh(sph(0.009 * s, 8, 6), basic(0xffffff), -0.016 * s, -0.026 * s, 0.034 * s));
  return noOl(g);
}
// 무늬 한 점: 표면에 살짝 묻힌 납작한 공 (테두리 없음)
function spot(parent, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const m = noOl(mesh(sph(1, 16, 10), toon(color), x, y, z));
  m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

export function makeCat(id = 'cheese') {
  const C = COATS[id] || COATS.cheese;
  const fur = toon(C.base), belly = toon(C.belly), pt = C.points ? toon(C.points) : null;
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root); // root = 자세(눕기·뛰기)
  // 몸통 (앞뒤로 긴 캡슐) — body 그룹은 뒤쪽 엉덩이를 중심으로 기울임(앉기)
  const body = new THREE.Group(); body.position.set(0, 0.2, -0.13); root.add(body);
  const torso = mesh(new THREE.CapsuleGeometry(0.165, 0.24, 8, 18), fur, 0, 0.03, 0.14); torso.rotation.x = Math.PI / 2; torso.scale.set(1.05, 1, 1); body.add(torso);
  spot(torso, C.belly, 0, 0.06, 0.11, 0.115, 0.19, 0.075); // 배·가슴 (캡슐 안쪽 좌표: y = 앞뒤, +z = 아래)
  if (C.stripe) for (const k of [-0.1, 0, 0.1]) spot(torso, C.stripe, 0, k, -0.155, 0.13, 0.028, 0.03);
  if (C.spots) { spot(torso, C.spots[0], 0.09, 0.08, -0.11, 0.1, 0.11, 0.07); spot(torso, C.spots[1], -0.1, -0.08, -0.1, 0.09, 0.1, 0.07); }
  // 머리
  const head = new THREE.Group(); head.position.set(0, 0.46, 0.17); root.add(head);
  const skull = mesh(sph(0.235, 26, 18), fur); skull.scale.set(1.12, 0.94, 0.95); head.add(skull);
  if (C.stripe) for (const [x, r] of [[-0.06, 0.25], [0, 0], [0.06, -0.25]]) spot(head, C.stripe, x, 0.19, 0.08, 0.022, 0.05, 0.03, 0.5, 0, r);
  if (C.spots) { spot(head, C.spots[0], -0.13, 0.1, 0.05, 0.11, 0.1, 0.12); spot(head, C.spots[1], 0.14, 0.12, 0.02, 0.09, 0.08, 0.11); }
  if (pt) spot(head, C.points, 0, -0.02, 0.15, 0.13, 0.12, 0.08); // 샴: 얼굴 가운데 진한 가면
  // 귀 (바깥 털색 · 안쪽 분홍)
  const ears = [];
  for (const sx of [1, -1]) {
    const e = new THREE.Group(); e.position.set(sx * 0.135, 0.17, 0.0); e.rotation.set(-0.12, 0, -sx * 0.38); head.add(e);
    const outer = mesh(new THREE.ConeGeometry(0.085, 0.16, 14), pt || fur, 0, 0.06, 0); e.add(outer);
    e.add(noOl(mesh(new THREE.ConeGeometry(0.05, 0.1, 12), toon(0xffa8b8), 0, 0.045, 0.036)));
    ears.push(e);
  }
  // 얼굴: 눈 · 입가 · 코 · 입 · 볼 · 수염
  const eyes = [];
  for (const sx of [1, -1]) {
    const e = catEye(C.eye); e.position.set(sx * 0.092, 0.025, 0.205); e.rotation.y = sx * 0.28; head.add(e); eyes.push(e);
    const b = makeBlush(1.1); b.position.set(sx * 0.165, -0.04, 0.165); b.rotation.y = sx * 0.75; head.add(b);
  }
  const muz = new THREE.Group(); muz.position.set(0, -0.065, 0.2); head.add(muz);
  for (const sx of [1, -1]) { const m = noOl(mesh(sph(0.048, 14, 10), toon(pt ? C.points : C.belly), sx * 0.034, 0, 0)); m.scale.set(1, 0.8, 0.65); muz.add(m); }
  muz.add(noOl(mesh(sph(0.022, 10, 8), basic(0xff7f96), 0, 0.03, 0.025)));
  const mouth = noOl(mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 12, Math.PI), basic(0x2a1f2e))); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.012, 0.03); muz.add(mouth);
  const wm = new THREE.LineBasicMaterial({ color: C.base === 0xfffaf2 || C.base === 0xf3e6cf ? 0x9a8c80 : 0xffffff });
  for (const sx of [1, -1]) for (const dy of [0.012, -0.012]) {
    const l = noOl(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx * 0.05, dy, 0.02), new THREE.Vector3(sx * 0.17, dy * 2.5 + 0.01, -0.01)]), wm));
    muz.add(l);
  }
  // 다리 4개 (위쪽 관절에서 돌림). 앞발 = legs[0,1], 뒷발 = legs[2,3]
  const legs = [];
  for (const [x, z, front] of [[0.095, 0.1, 1], [-0.095, 0.1, 1], [0.1, -0.13, 0], [-0.1, -0.13, 0]]) {
    const L = new THREE.Group(); L.position.set(x, 0.16, z); root.add(L);
    const leg = mesh(new THREE.CapsuleGeometry(0.052, 0.09, 6, 12), fur, 0, -0.09, 0); L.add(leg);
    const paw = mesh(sph(0.058, 14, 10), C.whitePaws || C.points ? (pt || belly) : fur, 0, -0.14, 0.012); paw.scale.set(1, 0.7, 1.15); L.add(paw);
    L.userData = { front: !!front, x, z };
    legs.push(L);
  }
  // 꼬리 (밑동에서 흔듦) — 위로 세웠다가 끝이 살짝 말림
  const tail = new THREE.Group(); tail.position.set(0, 0.25, -0.27); root.add(tail);
  const curve = new THREE.CatmullRomCurve3([[0, 0, 0], [0, 0.08, -0.08], [0, 0.22, -0.11], [0.02, 0.33, -0.06], [0.05, 0.36, 0.0]].map((p) => new THREE.Vector3(...p)));
  tail.add(mesh(new THREE.TubeGeometry(curve, 24, 0.038, 10), fur));
  tail.add(mesh(sph(0.041, 12, 10), pt || (C.stripe ? toon(C.stripe) : fur), 0.05, 0.36, 0.0));
  // zzz (배 보이고 잘 때)
  const zz = makeZzz(); zz.visible = false; g.add(zz);

  finish(g);
  const parts = { root, body, head, ears, eyes, legs, tail, zz };
  const blink = KIT.blinker(eyes);
  g.userData = { id, coat: C, parts, faceZ: true, anim: (t, pose = 'sit') => posePlay(parts, t, pose, blink, C) };
  g.userData.anim(0, 'sit');
  return g;
}

function makeZzz() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const x = cv.getContext('2d'); x.font = 'bold 54px Jua, sans-serif'; x.fillStyle = '#6d7fd6'; x.strokeStyle = '#fff'; x.lineWidth = 8;
  for (const [s, px, py] of [['z', 20, 110], ['z', 55, 75], ['Z', 85, 45]]) { x.strokeText(s, px, py); x.fillText(s, px, py); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.scale.set(0.3, 0.3, 1); sp.position.set(0.2, 0.55, 0); sp.userData.noOutline = true;
  return sp;
}

// 자세 — 값은 기본 자리에서 얼마나 돌리고 옮길지
function posePlay(P, t, pose, blink, C) {
  const { root, body, head, ears, eyes, legs, tail, zz } = P;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  body.rotation.set(0, 0, 0); body.position.set(0, 0.2, -0.13);
  head.position.set(0, 0.46, 0.17); head.rotation.set(0, 0, 0);
  tail.rotation.set(0, 0, 0); tail.position.set(0, 0.25, -0.27); tail.scale.setScalar(1);
  for (const L of legs) { L.rotation.set(0, 0, 0); L.position.set(L.userData.x, 0.16, L.userData.z); L.scale.setScalar(1); }
  for (const e of ears) e.rotation.x = -0.12;
  zz.visible = false;
  blink(t);
  const wag = Math.sin(t * 2.2);
  if (pose === 'walk') {
    const s = Math.sin(t * 9);
    legs[0].rotation.x = s * 0.6; legs[3].rotation.x = s * 0.6; legs[1].rotation.x = -s * 0.6; legs[2].rotation.x = -s * 0.6;
    root.position.y = Math.abs(Math.cos(t * 9)) * 0.02;
    head.rotation.x = Math.sin(t * 18) * 0.03; tail.rotation.x = -0.15 + Math.sin(t * 4.5) * 0.08; tail.rotation.z = wag * 0.12;
  } else if (pose === 'stand') {
    tail.rotation.z = wag * 0.25; head.rotation.y = Math.sin(t * 0.7) * 0.25;
  } else if (pose === 'sit' || pose === 'nod') {
    // 엉덩이를 바닥에, 몸통을 세우고, 뒷다리는 옆으로 접힘(통통한 허벅지처럼 보이게)
    body.rotation.x = -0.95; body.position.set(0, 0.17, -0.1);
    head.position.set(0, 0.6, 0.06);
    legs[0].position.set(0.098, 0.27, 0.09); legs[1].position.set(-0.098, 0.27, 0.09);
    legs[0].scale.y = legs[1].scale.y = 1.6;
    for (const L of [legs[2], legs[3]]) { L.position.set(Math.sign(L.userData.x) * 0.15, 0.1, -0.03); L.rotation.x = -1.45; L.scale.set(1.25, 0.85, 1.25); }
    tail.position.set(0, 0.06, -0.22); tail.rotation.x = 1.25; tail.rotation.z = wag * 0.15;
    if (pose === 'nod') { head.rotation.x = Math.sin(t * 7.5) * 0.16; head.rotation.z = Math.sin(t * 3.75) * 0.07; } // 리듬에 고개 까딱
    else head.rotation.z = Math.sin(t * 0.9) * 0.06;
  } else if (pose === 'loaf') { // 식빵 굽기: 다리 숨기고 납작
    body.position.y = 0.155; head.position.set(0, 0.37, 0.19);
    for (const L of legs) { L.scale.y = 0.35; L.position.y = 0.06; }
    tail.position.set(0.1, 0.1, -0.2); tail.rotation.set(1.5, 0, 0.9);
    for (const e of eyes) e.scale.y = Math.min(e.scale.y, 0.35);
  } else if (pose === 'belly') { // 배 보이고 누워 zzz (하루 3마리 다 먹으면) — 등을 대고 비스듬히, 발은 하늘로
    root.rotation.z = 2.35;
    if (P.bellyLift == null) { root.position.set(0, 0, 0); root.updateMatrixWorld(true); P.bellyLift = -new THREE.Box3().setFromObject(root).min.y; }
    root.position.set(0.12, P.bellyLift + 0.02, 0);
    for (const L of legs) L.rotation.x = Math.sin(t * 1.2 + L.userData.x * 9) * 0.15 + (L.userData.front ? 0.5 : -0.4);
    head.rotation.z = -0.5; tail.rotation.z = Math.sin(t * 1.1) * 0.2;
    for (const e of eyes) e.scale.y = 0.08;
    zz.visible = true; zz.position.set(0.32, 0.72 + Math.sin(t * 1.6) * 0.03, 0.15);
  }
  if (pose === 'sit' && C.eat === 'turn') head.rotation.y = Math.sin(t * 0.5) * 0.35; // 샴: 새침하게 고개 돌리기
}
