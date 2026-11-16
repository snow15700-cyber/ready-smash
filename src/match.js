// 경기 진행 (방장 PC 또는 혼자 모드에서만 실행되는 '기준' 로직)
// 모든 결과는 emit(event)으로 알리고, 화면 쪽은 이벤트만 보고 그린다.
import { simulate, findIdealHit, tossSegs, planShot, judge, ballPos, WIN, HOLD } from './physics.js';

export const WIN_SCORE = 5;
// 랠리 3회마다 공 속도 4%씩 증가 (최대 10단계 = 40%)
export const SPEED_STEP = 0; // 지금은 속도 증가 없음 (예: 0.04 = 3회마다 4%)
export const SPEED_MAX_LV = 10;

// 찬스볼·스매시 (1v1·2v2만, 벽치기 제외)
// 랠리가 CHANCE_RALLY회를 넘은 뒤 BAD로 친 공 = 찬스볼 (받는 사람에게 타이밍 소리를 들려줌)
// 찬스볼을 PERFECT로 받아치면 스매시 (그 공만 SMASH_SPEED배 빠름)
// 스매시를 어설프게(BAD, 또는 GOOD 범위 밖 블록) 받으면 아웃
export const CHANCE_RALLY = 6;
export const SMASH_SPEED = 1.2;
export const SMASH_OUT = true;

// 한 번의 타격 결과 계산. 방장과 상대 PC가 같은 입력이면 똑같은 결과가 나온다 (상대 PC의 예측용)
// incoming: 지금 받는 공의 종류 ('chance' | 'smash' | null), dt: 이상적인 타격 시각과의 차이
export function computeShot({ mode, seed, shotIdx, rally, segs, serve, side, t, grade, dir, hold, incoming = null, dt = 0 }) {
  const from = ballPos(segs, t);
  const s = (seed + shotIdx * 7919) >>> 0;
  // 랠리 수: 벽치기는 내가 친 횟수, 1v1은 양쪽 합계
  const rallyNow = rally + 1;
  const shown = mode === 'wall' ? Math.ceil(rallyNow / 2) : rallyNow;
  const speedLv = SPEED_STEP > 0 ? Math.min(SPEED_MAX_LV, Math.floor(shown / 3)) : 0;
  let kind = null;
  if (mode !== 'wall' && !serve) {
    const poor = grade === 'bad' || (grade === 'block' && Math.abs(dt) > WIN.good);
    if (incoming === 'smash' && SMASH_OUT && poor) kind = 'out';
    else if (incoming === 'chance' && grade === 'perfect') kind = 'smash';
    else if (grade === 'bad' && rallyNow > CHANCE_RALLY) kind = 'chance';
  }
  const speed = (1 + speedLv * SPEED_STEP) * (kind === 'smash' ? SMASH_SPEED : 1);
  const v = planShot(from, side, kind === 'out' ? 'out' : grade, dir, s, serve, speed);
  const t0 = t + hold;
  const out = simulate(from, v, t0, 'hit', { side, grade });
  return { from, v, t0, segs: out, speedLv, shotIdx, kind, next: findIdealHit(out, 1 - side) };
}

// 치는 순서 (선수 = {side, slot}). 2v2는 A1 → B1 → A2 → B2, 1v1·벽치기는 두 명이 번갈아
export function hitOrder(mode) {
  return mode === '2v2'
    ? [{ side: 0, slot: 0 }, { side: 1, slot: 0 }, { side: 0, slot: 1 }, { side: 1, slot: 1 }]
    : [{ side: 0, slot: 0 }, { side: 1, slot: 0 }];
}

export class Match {
  // isRemote(side, slot): 네트워크 너머에 있는 선수인지 (입력이 늦게 도착하므로 판정 대기 시간을 늘림)
  constructor({ mode, emit, seed = (Math.random() * 1e9) | 0, isRemote = () => false }) {
    this.isRemote = isRemote;
    this.mode = mode; // 'wall' | '1v1' | '2v2'
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
    if (this.mode === 'wall') this.turn = 0; // 벽치기는 항상 내가 서브
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
  swing(side, t, dir, isSwing, slot = 0) {
    const ex = this.expect;
    if (!ex || ex.side !== side || ex.slot !== slot || ex.whiffed) return;
    if (this.phase !== 'toss' && this.phase !== 'rally') return;
    const grade = judge(t - ex.t, isSwing);
    if (grade === 'early') return;
    if (grade === 'miss') {
      if (t < ex.t) {
        ex.whiffed = true;
        this.emit({ type: 'whiff', side, slot, t });
      }
      return;
    }
    this.hit(side, t, grade, dir, HOLD, slot, t - ex.t);
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
    this.emit({ type: 'shot', side, slot, turn: this.turn, t, t0: shot.t0, p: shot.from, v: shot.v, grade, rally: this.rally, speedLv: shot.speedLv, idx: shot.shotIdx, kind: shot.kind });
    if (!shot.next) this.pointTo(1 - side, shot.t0 + 0.8, 'fault');
  }

  pointTo(winner, at, reason) {
    this.phase = 'point';
    this.expect = null;
    this.pending = {
      t: at,
      fn: (now) => {
        if (this.mode === 'wall') {
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
    // 벽치기: 벽이 자동으로 받아침
    if (this.mode === 'wall' && ex.side === 1 && now >= ex.t) {
      this.hit(1, ex.t, 'wall', 0);
      return;
    }
    const margin = this.isRemote(ex.side, ex.slot) ? 0.45 : 0.12; // 네트워크 지연 여유
    if (now > ex.t + WIN.bad + HOLD + margin) {
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
