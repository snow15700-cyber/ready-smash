// 공 물리와 궤적 계산 (모든 PC가 같은 공식으로 궤적을 재생)
// 좌표: x = 좌우, y = 위, z = 테이블 길이 방향. side 0은 +z 쪽, side 1은 -z 쪽.
import { rng } from './util.js';

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
// 늦게 친 쪽은 더 좁게 (공이 몸을 지나간 뒤에 넘어가지 않게). bad를 넘기면 블록도 놓침
export const WIN_LATE = { perfect: 0.045, good: 0.08, bad: 0.14 };
// 랠리 단계 (사용자 확정): 화면에 보이는 랠리가 20·40·60회를 넘으면 한 단계씩 올라간다.
// 단계가 오를수록 GOOD 범위가 PERFECT 쪽으로 좁아져(PERFECT·BAD 범위는 그대로) BAD → 찬스볼이 늘어난다.
// 블록: 1단계부터 GOOD 범위 밖 블록 = 찬스볼, 2단계부터 모든 블록 = 찬스볼 (match.js computeShot)
export const TIER_RALLY = [20, 40, 60];
const GOOD_BY_TIER = [[0.1, 0.08], [0.085, 0.07], [0.07, 0.06], [0.055, 0.05]]; // [일찍, 늦게]
const WINS = GOOD_BY_TIER.map(([e, l]) => [{ ...WIN, good: e }, { ...WIN_LATE, good: l }]);
// 보이는 랠리 수 → 단계 (0~3)
export const tierOf = (shown) => TIER_RALLY.filter((r) => shown >= r).length;
// 지금까지 친 횟수(rally, 양쪽 합계) → 다음 타격의 단계. 혼자 하기(AI)는 단계 없음 (사용자 확정)
export const rallyTier = (mode, rally) => (mode === 'ai' ? 0 : tierOf(rally));
// dt(클릭 - 이상적인 시각)가 늦었으면 늦은 쪽 범위
export const winFor = (dt, tier = 0) => WINS[tier][dt > 0 ? 1 : 0];

const E_TABLE = 0.8;
// 스매시는 상대 탁구대에 처음 맞을 때 덜 튀어서 낮고 빠르게 깔려 온다 (높이 뜨지 않게)
export const E_SMASH = 0.4;
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

    // 테이블 윗면. 탁구대 높이보다 낮은 곳에서 친 공(낮은 스매시를 받을 때)도
    // 탁구대 바깥에서 위로 떠올라 윗면 높이를 넘었다면 탁구대에 떨어질 수 있다
    const inside = (x, z) => Math.abs(x) <= HALF_W + R && Math.abs(z) <= HALF_L + R;
    let above = y0 >= TY + R - 1e-4;
    if (!above && vy > 0) {
      const disc = vy * vy - 2 * G * (TY + R - y0);
      if (disc >= 0) {
        const du = (vy - Math.sqrt(disc)) / G; // 위로 올라가며 윗면 높이를 지나는 순간
        above = !inside(x0 + vx * du, z0 + vz * du);
      }
    }
    if (above) {
      const d = timeToHeight(y0, vy, TY + R);
      if (d) {
        const x = x0 + vx * d, z = z0 + vz * d;
        if (inside(x, z)) best = { d, type: 'table' };
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
      // 서브의 첫 바운드(친 사람 쪽): 미리 정한 속도로 튀어 나간다 (planServe)
      const sv = segs[0].serve;
      if (sv && !segs.some((g) => g.ev === 'table') && Math.sign(np[2]) === sideSign(segs[0].side)) {
        segs.push({ t0: t, p: np, v: [...sv], ev: 'table', speed });
        continue;
      }
      const e = segs[0].smash && !segs.some((g) => g.ev === 'table') ? E_SMASH : E_TABLE;
      segs.push({ t0: t, p: np, v: [nv[0] * 0.98, -nv[1] * e, nv[2] * 0.98], ev: 'table', speed });
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
// 서브(segs[0].serve)는 친 사람 쪽 탁구대에 한 번 먼저 튀어야 한다
export function findIdealHit(segs, side) {
  const sg = sideSign(side);
  let own = segs[0].serve ? 1 : 0; // 서브: 친 사람 쪽 첫 바운드 1번은 정상
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (s.ev === 'net') return null;
    if (s.ev === 'floor') return null;
    if (s.ev === 'table') {
      if (Math.sign(s.p[2]) !== sg) { // 친 사람 쪽에 떨어짐
        if (own-- > 0) continue;
        return null; // 실패
      }
      if (own > 0) return null; // 서브가 내 쪽에 안 튀고 바로 넘어감 = 실패
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

// 결정론적 난수 (같은 seed면 모든 PC에서 같은 결과) — 계산은 util.js
export { rng };

const SHOT = {
  perfect: { T: 0.5, depth: 1.05, aim: 0.62, jit: 0.03 },
  good:    { T: 0.62, depth: 0.95, aim: 0.5, jit: 0.15 },
  bad:     { T: 0.98, depth: 0.5, aim: 0.3, jit: 0.22 },
  block:   { T: 0.85, depth: 0.62, aim: 0.38, jit: 0.08 },
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
  let x = dir * cfg.aim * mirror + (r() * 2 - 1) * cfg.jit;
  x = Math.max(-0.66, Math.min(0.66, x));
  const target = [x, TY + R, rs * cfg.depth];
  let T = (cfg.T + (serve ? 0.1 : 0)) / speed;
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

// 서브: 실제 탁구처럼 친 사람 쪽 탁구대에 먼저 한 번 튄 뒤 네트를 넘어 상대 탁구대에 떨어진다.
// 낮게 친 서브도 상대 쪽까지 가도록, 첫 바운드에서 튀어 나가는 속도(sv)를 미리 정해 둔다 (게임용 물리).
// sv는 'shot' 이벤트에 실려 모든 PC가 같은 궤적을 만든다 (simulate의 extra.serve).
// SERVE_T2: 첫 바운드 → 상대 탁구대까지 걸리는 시간 (등급별, 짧을수록 낮고 빠름)
const SERVE_Z1 = 1.0; // 첫 바운드 자리 (친 사람 쪽 네트에서 거리)
const SERVE_T2 = { perfect: 0.46, good: 0.55, bad: 0.8, block: 0.7 };
export function planServe(from, hitter, grade, dir, seed) {
  const r = rng(seed);
  const cfg = SHOT[grade] || SHOT.good;
  const rs = sideSign(1 - hitter);
  const mirror = hitter === 0 ? 1 : -1;
  let x = dir * cfg.aim * mirror + (r() * 2 - 1) * cfg.jit;
  x = Math.max(-0.66, Math.min(0.66, x));
  const tz = rs * cfg.depth;
  const y1 = TY + R;
  const z1 = -rs * SERVE_Z1;
  const k = (z1 - from[2]) / (tz - from[2]); // 위에서 본 직선 위에 첫 바운드
  const x1 = from[0] + (x - from[0]) * k;
  // 두 번째 구간: 네트를 넉넉히 넘을 때까지 시간을 늘린다
  let T2 = SERVE_T2[grade] || SERVE_T2.good;
  for (let i = 0; i < 20; i++) {
    const tn = T2 * (-z1) / (tz - z1); // 네트 지나는 때
    if (0.5 * G * tn * (T2 - tn) > NET_H + 0.05) break;
    T2 += 0.02;
  }
  const sv = [(x - x1) / T2, 0.5 * G * T2, (tz - z1) / T2];
  // 첫 구간: 같은 가로 속도로. 탁구대 아래에서 친 공은 탁구대 끝을 넘을 만큼 천천히(높이) 보낸다
  let T1 = Math.abs((z1 - from[2]) / (sv[2] / 0.98));
  let v;
  for (let i = 0; i < 30; i++) {
    v = [(x1 - from[0]) / T1, (y1 - from[1] + 0.5 * G * T1 * T1) / T1, (z1 - from[2]) / T1];
    const de = (sideSign(hitter) * HALF_L - from[2]) / v[2]; // 탁구대 끝 지나는 때
    if (de <= 0 || from[1] + v[1] * de - 0.5 * G * de * de > y1 + 0.02) break;
    T1 += 0.02;
  }
  return { v, sv };
}

export function judge(dt, isSwing, tier = 0) {
  const a = Math.abs(dt);
  const w = winFor(dt, tier);
  if (dt < -WIN.whiff) return 'early'; // 너무 이름: 무시
  if (a > w.bad) return 'miss';
  if (!isSwing) return 'block';
  if (a <= w.perfect) return 'perfect';
  if (a <= w.good) return 'good';
  return 'bad';
}
