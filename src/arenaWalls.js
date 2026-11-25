// 경기장 거품 안에서 걸을 수 있는 범위 (docs/dev/plaza.md 18장): 배경의 벽이 탁구대(원점)에서 얼마나 떨어져 있는지 잰다.
// 탁구대 높이쯤(1.1m)에서 앞뒤·양옆으로 광선을 여러 줄 쏘아, '벽 같은 것'(높이 1.8m 넘고 가로 3m 넘는 판)에 처음 닿는 거리.
// 나무·의자 같은 작은 물건은 벽으로 안 친다(지나가도 어색하지 않게). 벽이 없으면 거품 크기(9m)까지.
// 배경을 합치기(bakeArena) 전에 재야 한다(합치면 멀리 떨어진 물건끼리 한 덩어리가 돼서 크기를 알 수 없음) — arenas.js buildArena.
import * as THREE from 'three';

export const WALK_MAX = 9; // 벽이 없을 때 (= 거품 나가기 반지름)
const PAD = 0.5; // 벽에서 이만큼 떨어져서 멈춤

export function measureWalls(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), size = new THREE.Vector3();
  const walls = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    box.setFromObject(o);
    box.getSize(size);
    if (size.y >= 1.8 && Math.max(size.x, size.z) >= 3 && box.min.y < 1.1 && box.max.y > 1.1) walls.push(o);
  });
  const ray = new THREE.Raycaster();
  ray.far = WALK_MAX + PAD;
  const dist = (dir, side) => {
    let best = WALK_MAX + PAD;
    for (const off of [-3, -1.5, 0, 1.5, 3]) {
      const o = new THREE.Vector3(side.x * off, 1.1, side.z * off);
      ray.set(o, dir);
      const hit = ray.intersectObjects(walls, false)[0];
      if (hit) best = Math.min(best, hit.distance);
    }
    return Math.max(2.5, best - PAD);
  };
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  return {
    x1: dist(X, Z), x0: -dist(X.clone().negate(), Z),
    z1: dist(Z, X), z0: -dist(Z.clone().negate(), X),
  };
}
