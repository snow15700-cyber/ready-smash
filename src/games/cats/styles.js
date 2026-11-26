// 고양이 그림체 후보 3가지 (11/26 사용자: 첫 시안이 '귀엽지 않고 좀 징그럽다' → 다시 고르기). cats.html?styles=1
//  mochi  = 찹쌀떡: 머리와 몸이 한 덩어리, 발은 콩알, 눈은 낮고 멀리
//  chibi  = 2등신 인형: 큰 머리 + 작은 몸, 짧은 다리, 큰 동그란 눈 (테두리는 물고기와 같게)
//  plush  = 봉제 인형: 테두리 없이 부드러운 파스텔, 작은 단추 눈, 둥근 귀
import * as THREE from 'three';
import { KIT } from '../fishing/models.js';

const { toon, basic, finish, sph, mesh, noOl, makeBlush } = KIT;
const soft = (c) => new THREE.MeshLambertMaterial({ color: c });
const PAL = { // 치즈 · 샴만 (그림체 고르기용)
  cheese: { base: 0xffb65c, light: 0xfff3dc, mark: 0xf08a2c },
  siamese: { base: 0xf6ead6, light: 0xfffaf0, mark: 0x6b4a38 },
};
// 동그란 까만 눈 + 반짝이 2개 (세로 동공 없음)
function eye(s, flat = 0.5) {
  const g = new THREE.Group();
  const b = mesh(sph(0.05 * s, 18, 14), basic(0x231c2c)); b.scale.z = flat; g.add(b);
  g.add(mesh(sph(0.02 * s, 10, 8), basic(0xffffff), 0.017 * s, 0.02 * s, 0.03 * s));
  g.add(mesh(sph(0.009 * s, 8, 6), basic(0xffffff), -0.016 * s, -0.018 * s, 0.03 * s));
  return noOl(g);
}
// ω 입
function mouthW(s, mat) {
  const g = new THREE.Group();
  for (const sx of [1, -1]) { const m = mesh(new THREE.TorusGeometry(0.016 * s, 0.0045 * s, 6, 12, Math.PI), mat, sx * 0.016 * s, 0, 0); m.rotation.z = Math.PI; g.add(m); }
  return noOl(g);
}
function ear(mat, inner, r, h, round) {
  const g = new THREE.Group();
  const o = mesh(new THREE.ConeGeometry(r, h, 16), mat, 0, h / 2, 0); if (round) o.scale.set(1, 1, 0.75); g.add(o);
  const i = noOl(mesh(new THREE.ConeGeometry(r * 0.55, h * 0.6, 12), inner, 0, h * 0.4, r * 0.32)); g.add(i);
  return g;
}

export function makeCatStyle(style, coat = 'cheese') {
  const P = PAL[coat], g = new THREE.Group();
  const M = style === 'plush' ? soft : toon;
  const fur = M(P.base), light = M(P.light), mark = M(P.mark), pink = M(0xffb3c4);
  const sia = coat === 'siamese';
  const face = new THREE.Group(); // 눈·입·볼 (앞 = +z)
  let head;
  if (style === 'mochi') {
    head = mesh(sph(0.32, 32, 24), fur, 0, 0.27, 0); head.scale.set(1.15, 0.85, 1); g.add(head);
    const belly = noOl(mesh(sph(0.2, 20, 14), light, 0, 0.17, 0.17)); belly.scale.set(1, 0.7, 0.55); g.add(belly);
    for (const sx of [1, -1]) {
      g.add(mesh(sph(0.06, 14, 10), sia ? mark : light, sx * 0.12, 0.04, 0.24)); // 콩알 앞발
      const e = ear(sia ? mark : fur, pink, 0.11, 0.14, true); e.position.set(sx * 0.19, 0.44, 0.0); e.rotation.z = -sx * 0.45; g.add(e);
    }
    const tail = mesh(sph(0.07, 12, 10), sia ? mark : fur, 0.26, 0.1, -0.2); g.add(tail);
    face.position.set(0, 0.25, 0.3);
    for (const sx of [1, -1]) { const e = eye(1.05); e.position.set(sx * 0.13, 0.03, 0.02); face.add(e); const b = makeBlush(1.3); b.position.set(sx * 0.2, -0.04, -0.01); face.add(b); }
    face.add(Object.assign(mouthW(1.1, basic(0x3a2a33)), {}).translateY(-0.035).translateZ(0.03));
    if (sia) { const m = noOl(mesh(sph(0.075, 16, 12), mark, 0, 0.215, 0.3)); m.scale.set(1.3, 0.75, 0.35); g.add(m); }
    else for (const x of [-0.06, 0, 0.06]) { const m = noOl(mesh(sph(0.03, 10, 8), mark, x, 0.5, 0.12)); m.scale.set(0.6, 1.3, 0.6); m.rotation.x = -0.6; g.add(m); }
  } else {
    const big = style === 'chibi' ? 0.27 : 0.26;
    const body = mesh(sph(0.17, 24, 18), fur, 0, 0.17, 0); body.scale.set(1, 1.05, 0.95); g.add(body);
    const belly = noOl(mesh(sph(0.12, 18, 12), light, 0, 0.16, 0.1)); belly.scale.set(1, 1.1, 0.6); g.add(belly);
    for (const sx of [1, -1]) {
      g.add(mesh(sph(0.065, 14, 10), sia ? mark : light, sx * 0.08, 0.05, 0.13)); // 앞발
      const hl = mesh(sph(0.085, 14, 10), fur, sx * 0.14, 0.07, -0.02); hl.scale.set(0.8, 0.7, 1.1); g.add(hl); // 뒷다리
    }
    const tc = new THREE.CatmullRomCurve3([[0, 0.06, -0.14], [0.12, 0.08, -0.2], [0.22, 0.18, -0.16], [0.24, 0.3, -0.1]].map((p) => new THREE.Vector3(...p)));
    g.add(mesh(new THREE.TubeGeometry(tc, 20, 0.04, 10), fur)); g.add(mesh(sph(0.045, 12, 10), sia ? mark : fur, 0.24, 0.3, -0.1));
    head = mesh(sph(big, 30, 22), fur, 0, 0.5, 0.02); head.scale.set(1.12, 0.95, 1); g.add(head);
    for (const sx of [1, -1]) { const e = ear(sia ? mark : fur, pink, style === 'plush' ? 0.1 : 0.09, style === 'plush' ? 0.13 : 0.15, style === 'plush'); e.position.set(sx * 0.17, 0.68, 0); e.rotation.z = -sx * 0.4; g.add(e); }
    face.position.set(0, 0.47, 0.27);
    const es = style === 'chibi' ? 1.25 : 0.7;
    for (const sx of [1, -1]) {
      const e = eye(es, style === 'plush' ? 0.8 : 0.5); e.position.set(sx * (style === 'chibi' ? 0.1 : 0.09), 0.03, 0.0); e.rotation.y = sx * 0.2; face.add(e);
      const b = makeBlush(1.2); b.position.set(sx * 0.17, -0.04, -0.04); b.rotation.y = sx * 0.5; face.add(b);
    }
    const muz = noOl(mesh(sph(0.055, 14, 10), sia ? mark : light, 0, -0.05, 0.0)); muz.scale.set(1.3, 0.8, 0.6); face.add(muz);
    face.add(noOl(mesh(sph(0.016, 10, 8), basic(0xff8fa6), 0, -0.03, 0.03)));
    const mw = mouthW(1, basic(0x3a2a33)); mw.position.set(0, -0.058, 0.03); face.add(mw);
    if (sia) { const m = noOl(mesh(sph(0.08, 16, 12), mark, 0, 0.43, 0.24)); m.scale.set(1.3, 0.8, 0.4); g.add(m); }
    else for (const x of [-0.055, 0, 0.055]) { const m = noOl(mesh(sph(0.026, 10, 8), mark, x, 0.7, 0.14)); m.scale.set(0.6, 1.4, 0.6); m.rotation.x = -0.5; g.add(m); }
  }
  g.add(face);
  if (style !== 'plush') finish(g);
  const breathe = head;
  g.userData = { faceZ: true, anim: (t) => { g.scale.y = 1 + Math.sin(t * 2.4) * 0.015; face.position.x = Math.sin(t * 0.8) * 0.004; breathe.rotation.z = Math.sin(t * 1.1) * 0.03; } };
  return g;
}
