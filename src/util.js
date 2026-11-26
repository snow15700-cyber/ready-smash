// 여러 파일이 같이 쓰는 작은 도우미 함수 (계산식은 원래 것 그대로 옮김 — 바꾸면 무늬·판정이 달라져요)
import * as THREE from 'three';

// 결정론적 난수 (mulberry32, 같은 seed면 모든 PC에서 같은 결과)
// ⚠️ physics.js가 경기 판정에 씀 → 계산식을 바꾸지 말 것
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 결정론적 난수 (간단한 LCG — 배경·탁구대 무늬용, 위의 rng와 결과가 달라요)
export function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// 캔버스 그림 → 3D 무늬. anisotropy(비스듬히 볼 때 선명도)는 파일마다 원래 쓰던 값을 넘긴다.
export function canvasTex(w, h, draw, anisotropy = 4) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// 부드럽게: 천천히 출발 → 천천히 멈춤 (0~1 밖은 자르지 않음)
export const smoothstep = (t) => t * t * (3 - 2 * t);
// 부드럽게: 빨리 출발 → 천천히 멈춤 (0~1로 자름)
export const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
