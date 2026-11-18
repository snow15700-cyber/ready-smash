// 경기 진행 (방장 PC 또는 혼자 모드에서만 실행되는 '기준' 로직)
// 모든 결과는 emit(event)으로 알리고, 화면 쪽은 이벤트만 보고 그린다.
import { simulate, findIdealHit, tossSegs, planShot, judge, ballPos, rng, WIN, WIN_LATE, winFor, rallyTier, HOLD } from './physics.js';

export const WIN_SCORE = 5;
// 랠리 3회마다 공 속도 4%씩 증가 (최대 10단계 = 40%)
export const SPEED_STEP = 0; // 지금은 속도 증가 없음 (예: 0.04 = 3회마다 4%)
export const SPEED_MAX_LV = 10;

// 찬스볼·스매시 (1v1·2v2·AI 모두)
// 랠리가 CHANCE_RALLY회를 넘은 뒤 BAD로 친 공 = 찬스볼 (받는 사람에게 타이밍 소리를 들려줌)
// 찬스볼을 PERFECT로 받아치면 스매시 (그 공만 SMASH_SPEED 범위의 랜덤 배수만큼 빠름)
// 스매시를 어설프게(BAD, 또는 GOOD 범위 밖 블록) 받으면 아웃
export const CHANCE_RALLY = 6;
export const SMASH_SPEED = [1.2, 1.4]; // 이 사이에서 랜덤 (seed로 정해서 모든 PC가 같은 값)
export const SMASH_OUT = true;

// 인터넷 지연: 네트워크 너머 선수의 타격이 방장에게 늦게 도착하면, 공이 이미 그만큼 날아간 것으로 계산돼
// 받는 사람 화면에 공이 '날아오지도 않았는데' 놓침이 될 수 있다. 그래서 늦게 온 타격은 공이 라켓에 조금 더
// 머물다 출발하게 해서, 도착한 시점에 공이 날아가 있던 시간이 LATE_OK초를 넘지 않게 한다.
export const LATE_OK = 0.15;

// 한 번의 타격 결과 계산. 방장과 상대 PC가 같은 입력이면 똑같은 결과가 나온다 (상대 PC의 예측용)
// incoming: 지금 받는 공의 종류 ('chance' | 'smash' | null), dt: 이상적인 타격 시각과의 차이
export function computeShot({ mode, seed, shotIdx, rally, segs, serve, side, t, grade, dir, hold, incoming = null, dt = 0 }) {
  const from = ballPos(segs, t);
  const s = (seed + shotIdx * 7919) >>> 0;
  // 랠리 수: AI 모드는 내가 친 횟수, 1v1은 양쪽 합계
  const rallyNow = rally + 1;
  const shown = mode === 'ai' ? Math.ceil(rallyNow / 2) : rallyNow;
  const speedLv = SPEED_STEP > 0 ? Math.min(SPEED_MAX_LV, Math.floor(shown / 3)) : 0;
  const tier = rallyTier(mode, rally); // 랠리 단계 (physics.js TIER_RALLY)
  let kind = null;
  if (!serve) {
    const looseBlock = grade === 'block' && Math.abs(dt) > winFor(dt, tier).good;
    const poor = grade === 'bad' || looseBlock;
    // 블록도 찬스볼이 되는 경우: 1단계부터 GOOD 범위 밖 블록, 2단계부터 모든 블록
    const weak = grade === 'bad' || (grade === 'block' && (tier >= 2 || (tier >= 1 && looseBlock)));
    if (incoming === 'smash' && SMASH_OUT && poor) kind = 'out';
    else if (incoming === 'chance' && grade === 'perfect') kind = 'smash';
    else if (weak && rallyNow > CHANCE_RALLY) kind = 'chance';
  }
  const smashK = kind === 'smash' ? SMASH_SPEED[0] + rng((s ^ 0x5bd1e995) >>> 0)() * (SMASH_SPEED[1] - SMASH_SPEED[0]) : 1;
  const speed = (1 + speedLv * SPEED_STEP) * smashK;
  const v = planShot(from, side, kind === 'out' ? 'out' : grade, dir, s, serve, speed);
  const t0 = t + hold;
  const out = simulate(from, v, t0, 'hit', { side, grade, smash: kind === 'smash' });
  return { from, v, t0, segs: out, speedLv, shotIdx, kind, next: findIdealHit(out, 1 - side) };
}

// AI(탁구왕 김제빵): 연습 상대라서 절대 실수하지 않는다 (헛스윙·아웃 없음, 스매시도 다 받아냄)
// 공이 올 때마다 아래 확률로 어떻게 칠지 정한다. 가끔 BAD(약한 공)를 줘서 찬스볼 연습이 되게
// smash = 내 찬스볼이 오면 스매시로 받아칠 확률, dir = 왼쪽/가운데/오른쪽으로 보낼 확률
export const AI_NAME = '탁구왕 김제빵';
export const AI = { perfect: 0.22, good: 0.42, block: 0.18, bad: 0.18, smash: 0.5, dir: [0.35, 0.3, 0.35] };
const AI_DT = { perfect: [0, 0.02], good: [0.05, 0.09], bad: [0.11, 0.16], block: [0, 0.04] };

function aiPlan(incoming) {
  let grade;
  if (incoming === 'chance' && Math.random() < AI.smash) grade = 'perfect';
  else {
    let r = Math.random() * (AI.perfect + AI.good + AI.block + AI.bad);
    for (const g of ['perfect', 'good', 'block', 'bad']) {
      grade = g;
      if ((r -= AI[g]) < 0) break;
    }
  }
  if (incoming === 'smash' && grade === 'bad') grade = 'good'; // 스매시를 BAD로 받으면 아웃이 되므로
  const [a, b] = AI_DT[grade];
  const dt = (a + Math.random() * (b - a)) * (Math.random() < 0.5 ? -1 : 1);
  const d = Math.random();
  const dir = d < AI.dir[0] ? -1 : d < AI.dir[0] + AI.dir[1] ? 0 : 1;
  return { grade, dt, dir };
}

// 치는 순서 (선수 = {side, slot}). 2v2는 A1 → B1 → A2 → B2, 1v1·AI는 두 명이 번갈아
export function hitOrder(mode) {
  return mode === '2v2'
    ? [{ side: 0, slot: 0 }, { side: 1, slot: 0 }, { side: 0, slot: 1 }, { side: 1, slot: 1 }]
    : [{ side: 0, slot: 0 }, { side: 1, slot: 0 }];
}

export class Match {
  // isRemote(side, slot): 네트워크 너머에 있는 선수인지 (입력이 늦게 도착하므로 판정 대기 시간을 늘림)
  constructor({ mode, emit, seed = (Math.random() * 1e9) | 0, isRemote = () => false }) {
    this.isRemote = isRemote;
    this.mode = mode; // 'ai' | '1v1' | '2v2'
    this.order = hitOrder(mode);
    this.turn = 0; // 다음에 칠 사람 (order의 번호)
    this.emit = emit;
    this.seed = seed;
    this.shotIdx = 0;
    this.score = [0, 0];
    this.server = 0;
    this.phase = 'idle';
    this.segs = null;
    this.expect = null;
    this.rally = 0;
    this.incoming = null; // 지금 날아가는 공의 종류 ('chance' | 'smash' | null)
    this.pending = null; // 예약된 다음 동작 {t, fn}
  }

  start(now) {
    this.emit({ type: 'start', mode: this.mode, seed: this.seed, score: [...this.score], server: this.server, shotIdx: this.shotIdx });
    this.readyServe(now);
  }

  readyServe(now) {
    if (this.mode === 'ai') this.turn = 0; // AI 모드는 항상 내가 서브
    this.phase = 'serve';
    this.segs = null;
    this.expect = null;
    this.rally = 0;
    this.incoming = null;
    this.emit({ type: 'serveReady', server: this.server, turn: this.turn, score: [...this.score] });
  }

  // 서버가 클릭: 토스
  toss(side, t, x = 0, slot = 0) {
    const who = this.order[this.turn];
    if (this.phase !== 'serve' || side !== who.side || slot !== who.slot) return;
    const { segs, ideal } = tossSegs(side, t, x);
    this.phase = 'toss';
    this.segs = segs;
    this.expect = { ...ideal, slot, whiffed: false };
    this.emit({ type: 'toss', side, slot, t, x });
  }

  // 스윙 입력 (t = 클릭 시각, dir = 화면 좌우 -1~1, isSwing = 위로 올리며 클릭)
  // now = 네트워크로 받은 입력이 방장에게 도착한 시각 (주면 늦게 온 만큼 공 출발을 늦춘다, LATE_OK 참고)
  swing(side, t, dir, isSwing, slot = 0, now = null) {
    const ex = this.expect;
    if (!ex || ex.side !== side || ex.slot !== slot || ex.whiffed) return;
    if (this.phase !== 'toss' && this.phase !== 'rally') return;
    const grade = judge(t - ex.t, isSwing, rallyTier(this.mode, this.rally));
    if (grade === 'early') return;
    if (grade === 'miss') {
      if (t < ex.t) {
        ex.whiffed = true;
        this.emit({ type: 'whiff', side, slot, t });
      }
      return;
    }
    const hold = now === null ? HOLD : Math.max(HOLD, now - LATE_OK - t);
    this.hit(side, t, grade, dir, hold, slot, t - ex.t);
  }

  // hold: 사람이 친 공은 방향을 읽는 동안 잠깐 라켓에 머문 뒤 출발
  hit(side, t, grade, dir, hold = 0, slot = 0, dt = 0) {
    const shot = computeShot({
      mode: this.mode, seed: this.seed, shotIdx: this.shotIdx, rally: this.rally,
      segs: this.segs, serve: this.phase === 'toss', side, t, grade, dir, hold, incoming: this.incoming, dt,
    });
    this.incoming = shot.kind === 'out' ? null : shot.kind;
    this.shotIdx++;
    this.segs = shot.segs;
    this.phase = 'rally';
    this.rally++;
    this.turn = (this.turn + 1) % this.order.length;
    const nextSlot = this.order[this.turn].slot;
    this.expect = shot.next ? { ...shot.next, slot: nextSlot, whiffed: false } : null;
    // AI 차례면 이번 공을 어떻게 칠지 미리 정해 둔다
    if (this.mode === 'ai' && this.expect && this.expect.side === 1) this.expect.ai = aiPlan(this.incoming);
    this.emit({ type: 'shot', side, slot, turn: this.turn, t, t0: shot.t0, p: shot.from, v: shot.v, grade, rally: this.rally, speedLv: shot.speedLv, idx: shot.shotIdx, kind: shot.kind });
    if (!shot.next) this.pointTo(1 - side, shot.t0 + 0.8, 'fault');
  }

  pointTo(winner, at, reason) {
    this.phase = 'point';
    this.expect = null;
    this.pending = {
      t: at,
      fn: (now) => {
        if (this.mode === 'ai') {
          this.emit({ type: 'rallyEnd', rally: this.rally });
          this.pending = { t: now + 1.0, fn: (n) => this.readyServe(n) };
          return;
        }
        this.score[winner]++;
        const [a, b] = this.score;
        const done = (a >= WIN_SCORE || b >= WIN_SCORE) && Math.abs(a - b) >= 2;
        this.emit({ type: 'point', winner, score: [...this.score], reason, deuce: a >= 4 && b >= 4 && a === b });
        if (done) {
          this.phase = 'over';
          this.pending = { t: now + 1.2, fn: () => this.emit({ type: 'gameOver', winner: a > b ? 0 : 1, score: [...this.score] }) };
          return;
        }
        // 1점마다 서브 교대 (2v2는 A1 → B1 → A2 → B2 순서)
        this.turn = (a + b) % this.order.length;
        this.server = this.order[this.turn].side;
        this.pending = { t: now + 1.4, fn: (n) => this.readyServe(n) };
      },
    };
  }

  update(now) {
    if (this.pending && now >= this.pending.t) {
      const p = this.pending;
      this.pending = null;
      p.fn(now);
    }
    const ex = this.expect;
    if (!ex) return;
    // AI가 받아침 (항상 받아냄)
    if (ex.ai && now >= ex.t + ex.ai.dt) {
      this.hit(1, ex.t + ex.ai.dt, ex.ai.grade, ex.ai.dir, 0, 0, ex.ai.dt);
      return;
    }
    const margin = this.isRemote(ex.side, ex.slot) ? 0.45 : 0.12; // 네트워크 지연 여유
    if (now > ex.t + WIN_LATE.bad + HOLD + margin) {
      if (this.phase === 'toss') {
        // 서브 헛스윙은 실점 없이 다시 토스
        this.phase = 'point';
        this.expect = null;
        this.emit({ type: 'serveMiss', side: ex.side, slot: ex.slot });
        this.pending = { t: now + 1.1, fn: (n) => this.readyServe(n) };
      } else {
        this.emit({ type: 'miss', side: ex.side, slot: ex.slot, t: now });
        this.pointTo(1 - ex.side, now + 0.9, 'miss');
      }
    }
  }
}
