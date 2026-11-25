// 기포 시간표 (fishing.md 8장, 사용자 아이디어 11/25): 모든 사람이 같은 곳·같은 때에 봄 — 네트워크 없이 '시각'으로 정함
//  · 시간을 칸으로 나누고(기획: 3.5분), 칸 번호를 씨앗으로 기포 1~2개의 자리·시작 시각을 뽑음 → 같은 코드면 모든 PC가 같은 결과
//  · 기포 하나는 약 40초. 자리는 선착장 끝 판 어딘가에 서서 (방향 3 × 거리 3) 중 하나로 던지면 닿는 곳 근처
//  · 게임에 넣을 때: 시계는 서버 시각에 맞춘 값, 서버도 같은 식으로 계산해서 '기포 근처인가'를 직접 판단(5장)
//  · 이 시안은 PC 시계(Date.now)를 씀
import { seeded } from '../../arena-kit.js';
import { STAND, landingPoint } from './world.js';

export const BUBBLE_LIFE = 40; // 초
const SLOT = { normal: 210, often: 50 }; // 칸 길이(초). often = 시안 시험용

function slotBubbles(n, len) {
  const r = seeded(91731 + n * 7919);
  const count = r() < 0.5 ? 1 : 2;
  const out = [];
  for (let i = 0; i < count; i++) {
    const standX = STAND.xMin + r() * (STAND.xMax - STAND.xMin);
    const dir = Math.floor(r() * 3) - 1, tier = Math.floor(r() * 3);
    const p = landingPoint(standX, dir, tier);
    const start = n * len + r() * Math.max(1, len - BUBBLE_LIFE - 2);
    out.push({ id: `${n}-${i}`, x: p.x + (r() - 0.5) * 1.2, z: p.z + (r() - 0.5) * 1.2, start, end: start + BUBBLE_LIFE });
  }
  return out;
}

// 지금 보이는 기포들 (fade: 나타날 때·사라질 때 2초 동안 서서히)
export function activeBubbles(nowSec, mode = 'normal') {
  const len = SLOT[mode] || SLOT.normal;
  const n = Math.floor(nowSec / len);
  const out = [];
  for (const k of [n - 1, n]) for (const b of slotBubbles(k, len)) {
    if (nowSec < b.start || nowSec > b.end) continue;
    out.push({ ...b, left: b.end - nowSec, fade: Math.min(1, (nowSec - b.start) / 2, (b.end - nowSec) / 2) });
  }
  return out;
}

// 떨어진 자리가 기포에 얼마나 가까운지: 2 = 바로 위(1.5m) · 1 = 근처(3.5m) · 0 = 아님
export function bubbleNear(x, z, list) {
  let best = 0;
  for (const b of list) { const d = Math.hypot(x - b.x, z - b.z); best = Math.max(best, d <= 1.5 ? 2 : d <= 3.5 ? 1 : 0); }
  return best;
}
