// 공 물리와 궤적 계산 (모든 PC가 같은 공식으로 궤적을 재생)
// 좌표: x = 좌우, y = 위, z = 테이블 길이 방향. side 0은 +z 쪽, side 1은 -z 쪽.

export const G = 8.0;               // 중력 (게임용으로 실제보다 약간 느리게)
export const TABLE_L = 2.74;
export const TABLE_W = 1.525;
export const HALF_L = TABLE_L / 2;
export const HALF_W = TABLE_W / 2;
export const TY = 0.76;             // 테이블 윗면 높이
export const NET_H = 0.1525;
export const R = 0.02;              // 공 반지름
export const HIT_Z = 1.62;          // 타격 지점(테이블 끝에서 조금 뒤)

export const sideSign = (side) => (side === 0 ? 1 : -1);

// 판정 범위 (초)
// 클릭 후 방향을 읽는 동안 공이 라켓에 머무는 시간 (초)
export const HOLD = 0.09;

export const WIN = { perfect: 0.045, good: 0.1, bad: 0.17, whiff: 0.5 };

const E_TABLE = 0.8;
const E_FLOOR = 0.72;

export function posAt(seg, t) {
  if (seg.rest) return [seg.p[0], seg.p[1], seg.p[2]];
  const d = Math.max(0, t - seg.t0);
  return [
    seg.p[0] + seg.v[0] * d,
    seg.p[1] + seg.v[1] * d - 0.5 * G * d * d,
    seg.p[2] + seg.v[2] * d,
  ];
}

export function velAt(seg, t) {
  if (seg.rest) return [0, 0, 0];
  const d = Math.max(0, t - seg.t0);
  return [seg.v[0], seg.v[1] - G * d, seg.v[2]];
}

// 세그먼트 목록에서 t 시점의 세그먼트
export function segAt(segs, t) {
  let s = segs[0];
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].t0 <= t) s = segs[i];
    else break;
  }
  return s;
}

export function ballPos(segs, t) {
  return posAt(segAt(segs, t), t);
}

// 높이 c까지 내려오는 시간 (내려가는 쪽 근)
function timeToHeight(y0, vy, c) {
  const disc = vy * vy + 2 * G * (y0 - c);
  if (disc < 0) return null;
  const d = (vy + Math.sqrt(disc)) / G;
  return d > 1e-5 ? d : null;
}

// 시작 상태로부터 바운드/네트/바닥 이벤트를 따라가며 궤적 세그먼트를 만든다
export function simulate(p, v, t0, ev, extra = {}, maxDur = 4) {
  const segs = [{ t0, p: [...p], v: [...v], ev, ...extra }];
  for (let i = 0; i < 16; i++) {
    const s = segs[segs.length - 1];
    if (s.rest) break;
    const [x0, y0, z0] = s.p;
    const [vx, vy, vz] = s.v;
    let best = null;

    // 테이블 윗면
    if (y0 >= TY + R - 1e-4) {
      const d = timeToHeight(y0, vy, TY + R);
      if (d) {
        const x = x0 + vx * d, z = z0 + vz * d;
        if (Math.abs(x) <= HALF_W + R && Math.abs(z) <= HALF_L + R) best = { d, type: 'table' };
      }
    }
    // 네트
    if (Math.abs(vz) > 1e-4 && s.ev !== 'net') {
      const d = -z0 / vz;
      if (d > 1e-4 && (!best || d < best.d)) {
        const y = y0 + vy * d - 0.5 * G * d * d;
        const x = x0 + vx * d;
        if (Math.abs(x) < HALF_W + 0.15 && y < TY + NET_H + R && y > TY - 0.01) best = { d, type: 'net' };
      }
    }
    // 바닥
    {
      const d = timeToHeight(y0, vy, R);
      if (d && (!best || d < best.d)) best = { d, type: 'floor' };
    }
    if (!best) break;

    const t = s.t0 + best.d;
    const np = posAt(s, t);
    const nv = velAt(s, t);
    if (t - t0 > maxDur) {
      segs.push({ t0: t, p: np, v: [0, 0, 0], ev: 'rest', rest: true });
      break;
    }
    let speed = Math.hypot(nv[0], nv[1], nv[2]);
    if (best.type === 'table') {
      np[1] = TY + R;
      segs.push({ t0: t, p: np, v: [nv[0] * 0.98, -nv[1] * E_TABLE, nv[2] * 0.98], ev: 'table', speed });
    } else if (best.type === 'net') {
      np[2] = -Math.sign(vz) * 0.02;
      segs.push({ t0: t, p: np, v: [nv[0] * 0.3, Math.min(nv[1], 0) * 0.3, -nv[2] * 0.12], ev: 'net', speed });
    } else {
      np[1] = R;
      const nvy = -nv[1] * E_FLOOR;
      if (nvy < 0.35) {
        segs.push({ t0: t, p: np, v: [0, 0, 0], ev: 'floor', speed, rest: true });
        break;
      }
      segs.push({ t0: t, p: np, v: [nv[0] * 0.8, nvy, nv[2] * 0.8], ev: 'floor', speed });
    }
  }
  return segs;
}

// 받는 쪽(side)의 이상적인 타격 시각과 위치. 받는 쪽 테이블에 바운드하지 않으면 null
export function findIdealHit(segs, side) {
  const sg = sideSign(side);
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (s.ev === 'net') return null;
    if (s.ev === 'floor') return null;
    if (s.ev === 'table') {
      if (Math.sign(s.p[2]) !== sg) return null; // 자기 쪽에 떨어짐 = 실패
      const planeZ = sg * HIT_Z;
      let d = null;
      if (Math.abs(s.v[2]) > 1e-4) {
        const dc = (planeZ - s.p[2]) / s.v[2];
        if (dc > 0) d = dc;
      }
      const dd = timeToHeight(s.p[1], s.v[1], TY + 0.2);
      if (dd && (d === null || dd < d)) d = dd;
      if (d === null) return null;
      d = Math.max(d, 0.14);
      const t = s.t0 + d;
      return { t, pos: posAt(s, t), side };
    }
  }
  return null;
}

// 서브 토스 궤적과 타격 예정
export function tossSegs(side, t0, x) {
  const p = [x, TY + 0.1, sideSign(side) * HIT_Z];
  const segs = simulate(p, [0, 3.6, 0], t0, 'toss', { side }); // 높게 토스 (약 0.8m 위까지)
  const s = segs[0];
  const d = timeToHeight(s.p[1], s.v[1], TY + 0.28);
  const t = t0 + d;
  return { segs, ideal: { t, pos: posAt(s, t), side } };
}

// 결정론적 난수 (같은 seed면 모든 PC에서 같은 결과)
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

const SHOT = {
  perfect: { T: 0.5, depth: 1.05, aim: 0.62, jit: 0.03 },
  good:    { T: 0.62, depth: 0.95, aim: 0.5, jit: 0.15 },
  bad:     { T: 0.98, depth: 0.5, aim: 0.3, jit: 0.22 },
  block:   { T: 0.85, depth: 0.62, aim: 0.38, jit: 0.08 },
  wall:    { T: 0.66, depth: 1.0, aim: 0.45, jit: 0.25 },
  out:     { T: 0.6, depth: 1.95, aim: 0.45, jit: 0.2 }, // 스매시를 어설프게 받음: 테이블 끝을 넘겨 아웃
};

// 등급과 방향으로 공의 출발 속도를 계획한다
// dir: 치는 사람 화면 기준 -1(왼쪽) ~ 1(오른쪽)
// speed: 1이면 기본, 1.04면 4% 빠르게 (비행 시간이 그만큼 짧아짐)
export function planShot(from, hitter, grade, dir, seed, serve = false, speed = 1) {
  const r = rng(seed);
  const cfg = SHOT[grade];
  const rs = sideSign(1 - hitter); // 받는 쪽 z 부호
  const mirror = hitter === 0 ? 1 : -1;
  let x;
  if (grade === 'wall') x = (r() * 2 - 1) * cfg.aim;
  else x = dir * cfg.aim * mirror + (r() * 2 - 1) * cfg.jit;
  x = Math.max(-0.66, Math.min(0.66, x));
  const target = [x, TY + R, rs * cfg.depth];
  let T = (cfg.T + (serve ? 0.1 : 0) + (grade === 'wall' ? r() * 0.12 : 0)) / speed;
  let v;
  for (let k = 0; k < 25; k++) {
    v = [
      (target[0] - from[0]) / T,
      (target[1] - from[1] + 0.5 * G * T * T) / T,
      (target[2] - from[2]) / T,
    ];
    const dn = -from[2] / v[2];
    const yn = from[1] + v[1] * dn - 0.5 * G * dn * dn;
    if (yn > TY + NET_H + R + 0.05) break;
    T += 0.04;
  }
  return v;
}

export function judge(dt, isSwing) {
  const a = Math.abs(dt);
  if (dt < -WIN.whiff) return 'early'; // 너무 이름: 무시
  if (a > WIN.bad) return 'miss';
  if (!isSwing) return 'block';
  if (a <= WIN.perfect) return 'perfect';
  if (a <= WIN.good) return 'good';
  return 'bad';
}
