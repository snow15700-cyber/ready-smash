// 🎶 박자 친구들을 선착장 바다에 놓기 (fishing.md 13-3 ⓑ·ⓒ, 11/27). 광장·campus 시안·낚시 시안이 모두 campusPier.js에서 부름.
// 그 자리에서 낚시할 때 바라보는 바다에: 🎻 서쪽 팔 → 서쪽 바다 · 🎷 가운데 앞 판 → 남쪽(항구 밖) · 🎸 동쪽 팔 → 동쪽 바다.
// 찌가 떨어지는 곳(6~18m)과 겹치지 않게 조금 옆·멀리. 모두 선착장(낚시하는 사람) 쪽을 봄.
// 박자: 내가 낚시하는 동안(BEAT.on) 내가 선 자리 장르(BEAT.genre)의 친구들만 춤 · 나머지·다른 사람 화면은 쉬는 동작. 내 화면에서만.
import * as THREE from 'three';
import { makeFriend } from './friends.js';
import { BEAT } from './beat.js';

const FACE = { ballad: Math.PI / 2, jazz: Math.PI, rock: -Math.PI / 2 }; // 모형 앞(+z)을 선착장 쪽으로
// [id, 장르, x, z, 크기, 'float'(물결 따라) | 'rock'(바위 위, 높이) | 'boat'(항구 배 위, 배 기준 자리)]
const SPOTS = [
  ['swans', 'ballad', -16, 46.5, 2.6, 'float'],
  ['lanterns', 'ballad', -11.5, 53.5, 2.4, 'float'],
  ['lanterns', 'ballad', -23, 55, 2.6, 'float'],
  ['seal', 'jazz', 17.5, 64, 2.6, 'rock', 1.1],
  ['gulls', 'jazz', 0.75, -0.8, 1.3, 'boat'], // 배 앞 갑판 선착장 쪽 가장자리 = 배 난간
  ['crabs', 'rock', 37.5, 45.5, 2.2, 'rock', 0.9],
  ['speakers', 'rock', 44.5, 58, 2.8, 'rock', 0.9],
  ['penguin', 'rock', 33.5, 55.5, 2.5, 'float'],
];
const IDLE = { on: false, pulse: 0, accent: false, n: 0, phase: 0, side: 1, spb: 0.6, hit: 0 };

export function addPierFriends(g, anim, { seaH, seaY, rockMat, boat }) {
  const list = [];
  for (const [id, genre, x, z, sc, kind, lift = 0] of SPOTS) {
    const m = makeFriend(id, { world: true });
    m.scale.setScalar(sc); m.rotation.y = FACE[genre];
    const y0 = kind === 'boat' ? 0.645 : kind === 'rock' ? seaY + lift : seaY;
    m.position.set(x, y0, z);
    m.traverse((o) => { o.userData.noBake = true; }); // 움직이니까 합치지 않음
    (kind === 'boat' && boat ? boat : g).add(m);
    if (kind === 'rock') { // 물결에 안 잠기게 바위 받침 (모형 밑, 윗면 = 모형 바닥)
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), rockMat), sy = lift + 1.4;
      r.scale.set(sc * 0.7, sy, sc * 0.6); r.position.set(x, y0 - sy * 0.8 + 0.05, z); r.rotation.y = x * 0.7;
      r.castShadow = true; g.add(r);
    }
    list.push({ m, genre, x, z, kind, y0 });
  }
  const B = { ...IDLE };
  anim?.push((t) => {
    const on = BEAT.on && BEAT.fx.pier;
    for (const f of list) {
      if (f.kind === 'float') f.m.position.y = seaH(f.x, f.z, t) - 0.05;
      if (on && BEAT.genre === f.genre) { Object.assign(B, BEAT); f.m.userData.anim(t, B); } else f.m.userData.anim(t, IDLE);
    }
  });
  return list;
}
