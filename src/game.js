// 화면 쪽 게임: 이벤트를 받아 공·캐릭터·소리·링을 그리고, 내 입력을 판정해 보낸다
import { simulate, findIdealHit, tossSegs, ballPos, judge, sideSign, HIT_Z, TY, WIN, HOLD } from './physics.js';
import { PADDLE_OFFSET } from './scene.js';
import { computeShot } from './match.js';
import * as A from './audio.js';

// 스윙 동작은 '클릭 직전 0.15초 ~ 클릭 직후 HOLD초' 동안의 마우스 움직임으로 판단한다.
// 위로 올렸으면 스윙(아니면 블록), 그 움직임이 왼쪽 위/위/오른쪽 위 중 어디냐로 방향을 정한다.
const PRE = 0.15;
const ARROW = { '-1': ' ←', '0': ' ↑', '1': ' →' };

export class Game {
  // authority: 이 PC가 경기를 계산하는지 (혼자 모드, 방장). 아니면 방장 이벤트를 받아 그리고 내 타격은 예측해서 먼저 보여준다
  constructor(world, { mySide, mode, send, hud, authority = true, names = ['나', '상대'] }) {
    this.authority = authority;
    this.names = names;
    this.offset = 0; // 방장 시계 - 내 시계 (초)
    this.net = { seed: 0, nextIdx: 0, rally: 0 };
    this.predicted = null;
    this.w = world;
    this.mySide = mySide;
    this.mode = mode;
    this.send = send; // { toss(side,t,x), swing(side,t,dir,isSwing) }
    this.hud = hud;
    this.segs = null;
    this.expect = null;
    this.phase = 'idle';
    this.server = 0;
    this.score = [0, 0];
    this.played = new Set();
    this.localHitT = -1;
    this.charX = [0, 0];
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, hist: [] };
    this.stats = { rally: 0, best: 0, perfectStreak: 0, perfects: 0 };
    this.lastNow = performance.now() / 1000;
    this.tossX = 0;
    this.pendingHit = null; // 클릭 후 방향 판단을 기다리는 타격
    this.holdPos = null;
    world.wall.visible = mode === 'wall';
    // 내 캐릭터는 반투명 (공과 상대가 가려지지 않게)
    world.chars[mySide].setOpacity(0.38, 0.9);
    world.chars[1 - mySide].setOpacity(1, 1);
    world.chars[1].group.visible = mode !== 'wall';

    this.onMove = (e) => {
      const t = e.timeStamp / 1000 + this.offset;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.hist.push({ t, x: e.clientX, y: e.clientY });
      while (this.mouse.hist.length && this.mouse.hist[0].t < t - 0.4) this.mouse.hist.shift();
    };
    this.onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('button, input, .panel')) return;
      this.click(e.timeStamp / 1000 + this.offset, e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
  }

  destroy() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
  }

  // 클릭 전후 마우스 움직임 → { dir: -1|0|1, up: 위로 올렸는지 }
  readStroke(t, x, y) {
    const pts = this.mouse.hist.filter((s) => s.t >= t - PRE && s.t <= t + HOLD + 0.01);
    pts.push({ t, x, y });
    pts.sort((a, b) => a.t - b.t);
    const first = pts[0];
    const last = pts[pts.length - 1];
    let maxY = -Infinity, minY = Infinity;
    for (const s of pts) { maxY = Math.max(maxY, s.y); minY = Math.min(minY, s.y); }
    const up = maxY - minY >= Math.max(18, innerHeight * 0.022) && last.y < first.y;
    const dx = last.x - first.x;
    const dy = Math.abs(first.y - last.y);
    const thr = Math.max(18, innerWidth * 0.012);
    let dir = 0;
    if (Math.abs(dx) >= thr && Math.abs(dx) >= dy * 0.3) dir = dx > 0 ? 1 : -1;
    return { dir, up };
  }

  click(t, x, y) {
    A.initAudio();
    const me = this.mySide;
    if (this.pendingHit) return;
    if (this.phase === 'serve' && this.server === me) {
      A.playToss(this.tossPos(me));
      this.hud.hint('');
      if (!this.authority) this.onEvent({ type: 'toss', side: me, t, x: this.tossX, local: true });
      this.send.toss(me, t, this.tossX);
      return;
    }
    const ex = this.expect;
    const char = this.w.chars[me];
    if (!ex || ex.side !== me || ex.whiffed || (this.phase !== 'toss' && this.phase !== 'rally')) {
      this.startSwing(char, t);
      return;
    }
    const grade = judge(t - ex.t, true);
    this.startSwing(char, t);
    if (grade === 'early') return;
    if (grade === 'miss') {
      if (t < ex.t) {
        ex.whiffed = true;
        A.playWhoosh(ex.pos);
        this.hud.judge('miss', '헛스윙');
        this.stats.perfectStreak = 0;
        this.send.swing(me, t, 0, true);
      }
      return;
    }
    // 서버를 기다리지 않고 클릭 즉시 타구음. 방향은 클릭 직후 마우스 움직임까지 보고 정한다
    A.playHit(grade, ballPos(this.segs, t));
    this.w.kick(grade === 'perfect' ? 1 : grade === 'good' ? 0.6 : 0.3);
    this.localHitT = t;
    this.holdPos = ballPos(this.segs, t);
    this.pendingHit = { t, x, y, decideAt: t + HOLD };
  }

  // 클릭 후 HOLD초가 지나면 스윙/블록과 방향을 확정해서 보낸다
  decideHit(now) {
    const h = this.pendingHit;
    if (!h || now < h.decideAt) return;
    this.pendingHit = null;
    const me = this.mySide;
    const ex = this.expect;
    if (!ex) return;
    const { dir, up } = this.readStroke(h.t, h.x, h.y);
    const grade = judge(h.t - ex.t, up);
    if (!up) this.w.chars[me].swingBlock = true;
    this.hud.judge(grade, ({ perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD', block: 'BLOCK' })[grade] + ARROW[dir]);
    if (grade === 'perfect') {
      this.stats.perfectStreak++;
      this.stats.perfects++;
    } else this.stats.perfectStreak = 0;
    this.hud.stats(this.stats);
    if (!this.authority) this.predictHit(h.t, grade, dir);
    this.send.swing(me, h.t, dir, up);
  }

  // 상대 PC(방장 아님): 방장 응답을 기다리지 않고 내 타격 결과를 똑같은 공식으로 먼저 계산해 보여준다
  predictHit(t, grade, dir) {
    const shot = computeShot({
      mode: this.mode, seed: this.net.seed, shotIdx: this.net.nextIdx, rally: this.net.rally,
      segs: this.segs, serve: this.phase === 'toss', side: this.mySide, t, grade, dir, hold: HOLD,
    });
    this.predicted = { t, prevSegs: this.segs, prevExpect: this.expect };
    this.segs = shot.segs;
    this.played = new Set([0]);
    this.expect = shot.next ? { ...shot.next, whiffed: false } : null;
    this.phase = 'rally';
    this.holdPos = null;
  }

  startSwing(char, t, block = false) {
    char.swingT = performance.now() / 1000;
    char.swingBlock = block;
  }

  tossPos(side) {
    return [this.tossX, TY + 0.1, sideSign(side) * HIT_Z];
  }

  onEvent(ev) {
    const me = this.mySide;
    switch (ev.type) {
      case 'start':
        this.net.seed = ev.seed;
        this.net.nextIdx = ev.shotIdx || 0;
        this.score = ev.score;
        if (this.mode !== 'wall') this.hud.score(this.score);
        break;
      case 'serveReady':
        this.phase = 'serve';
        this.server = ev.server;
        this.segs = null;
        this.expect = null;
        this.w.clearTrail();
        this.stats.rally = 0;
        this.speedLv = 0;
        this.net.rally = 0;
        this.predicted = null;
        this.hud.stats(this.stats);
        this.hud.hint(ev.server === me ? '클릭해서 서브 토스!' : '상대 서브를 기다리는 중…');
        break;
      case 'toss': {
        if (ev.side === me && !ev.local && this.phase === 'toss') break; // 이미 예측해서 보여주는 중
        const { segs, ideal } = tossSegs(ev.side, ev.t, ev.x);
        this.phase = 'toss';
        this.segs = segs;
        this.played = new Set([0]);
        this.expect = { ...ideal, whiffed: false };
        if (ev.side === me) this.hud.hint('공이 떨어질 때 마우스를 누른 채로 위로 쓱! (↖ ↑ ↗)');
        break;
      }
      case 'shot': {
        this.phase = 'rally';
        this.net.nextIdx = (ev.idx ?? this.net.nextIdx) + 1;
        this.net.rally = ev.rally;
        const wasPredicted = this.predicted && ev.side === me && Math.abs(this.predicted.t - ev.t) < 1e-6;
        this.predicted = null;
        this.segs = simulate(ev.p, ev.v, ev.t0, 'hit', { side: ev.side, grade: ev.grade });
        this.holdPos = null;
        if (!wasPredicted) this.played = new Set();
        if (ev.side === me && Math.abs(this.localHitT - ev.t) < 0.001) this.played.add(0);
        if (ev.side !== me) this.w.chars[ev.side].swingT = performance.now() / 1000;
        const next = findIdealHit(this.segs, 1 - ev.side);
        this.expect = next ? { ...next, whiffed: false } : null;
        if (ev.side === me) {
          this.stats.rally = ev.rally;
          this.hud.hint('');
        }
        this.stats.rally = this.mode === 'wall' ? Math.ceil(ev.rally / 2) : ev.rally;
        this.hud.stats(this.stats);
        if (ev.speedLv > (this.speedLv || 0)) this.hud.toast(`속도 UP! Lv.${ev.speedLv + 1}`);
        this.speedLv = ev.speedLv;
        break;
      }
      case 'whiff':
        if (this.expect && this.expect.side === ev.side) this.expect.whiffed = true;
        break;
      case 'miss':
        if (this.predicted && ev.side === me) {
          // 내 타격이 방장에게 너무 늦게 도착: 예측을 취소하고 원래 공 궤적으로
          this.segs = this.predicted.prevSegs;
          this.predicted = null;
        }
        this.holdPos = null;
        this.pendingHit = null;
        this.expect = null;
        if (ev.side === me) {
          this.hud.judge('miss');
          this.stats.perfectStreak = 0;
        }
        break;
      case 'serveMiss':
        this.expect = null;
        if (ev.side === me) this.hud.hint('괜찮아요! 다시 토스해 보세요');
        break;
      case 'rallyEnd': {
        const r = this.stats.rally;
        if (r > this.stats.best) {
          this.stats.best = r;
          if (r >= 3) this.hud.toast(`최고 기록! ${r}회 랠리`);
        }
        this.hud.stats(this.stats);
        break;
      }
      case 'point':
        this.score = ev.score;
        this.hud.score(this.score, ev.deuce);
        A.playUI(ev.winner === me ? 'point' : 'lose');
        break;
      case 'gameOver':
        this.phase = 'over';
        A.playUI(ev.winner === me ? 'win' : 'lose');
        this.hud.gameOver(ev.winner === me, ev.score);
        break;
    }
  }

  update(now) {
    const dt = Math.max(0, Math.min(0.05, now - this.lastNow));
    this.lastNow = now;
    const w = this.w;
    const me = this.mySide;

    this.decideHit(now);
    // 공
    if (this.holdPos) {
      w.setBall(this.holdPos);
    } else if (this.segs) {
      w.setBall(ballPos(this.segs, now));
      this.scheduleSounds(now);
    } else if (this.phase === 'serve') {
      const p = this.tossPos(this.server);
      w.setBall([p[0], p[1] + Math.sin(now * 3) * 0.01, p[2]]);
    } else w.setBall([0, -1, 0], false);

    // 캐릭터 자동 이동 + 팔
    for (let s = 0; s < 2; s++) {
      const c = w.chars[s];
      const m = sideSign(s);
      let tx = -PADDLE_OFFSET.right * m * 0.5;
      let ballY = TY + 0.25;
      if (this.phase === 'serve' && this.server === s) tx = this.tossX - PADDLE_OFFSET.right * m;
      const ex = this.expect;
      if (ex && ex.side === s) {
        tx = ex.pos[0] - PADDLE_OFFSET.right * m;
        ballY = ex.pos[1];
      }
      this.charX[s] += (tx - this.charX[s]) * (1 - Math.exp(-dt * 7));
      c.group.position.x = this.charX[s];
      this.animArm(c, now, ex && ex.side === s ? ex.t - now : 9, ballY);
      c.body.position.y = Math.sin(now * 2.6 + s) * 0.006;
      c.body.rotation.z = -(tx - this.charX[s]) * 0.25 * m;
    }

    // 카메라 / 소리 위치
    w.updateCamera(me, this.charX[me], dt, this.segs ? w.ball.position.x : 0);
    const cam = w.camera;
    A.setListener([cam.position.x, cam.position.y, cam.position.z], me === 0 ? [1, 0, 0] : [-1, 0, 0]);

    // 타이밍 링
    const ex = this.expect;
    const showRing = ex && ex.side === me && !ex.whiffed && (this.phase === 'toss' || this.phase === 'rally');
    const remain = ex ? ex.t - now : 9;
    if (showRing && remain < 0.95 && remain > -WIN.bad) {
      w.ring.visible = true;
      w.ring.position.set(ex.pos[0], ex.pos[1], ex.pos[2]);
      w.ring.lookAt(cam.position);
      const k = 1 + Math.max(0, remain) * 3.4;
      w.ringMove.scale.setScalar(k);
      const col = Math.abs(remain) <= WIN.perfect ? '#5dff8a' : Math.abs(remain) <= WIN.good ? '#ffe24d' : '#ffb347';
      w.ringMove.material.color.set(col);
    } else w.ring.visible = false;

    w.aim.visible = false;
  }

  animArm(c, now, remain, ballY) {
    const READY = -0.35, BACK = -1.0, FOLLOW = 0.85;
    let yaw = READY;
    if (remain < 0.4 && remain > -0.2) yaw = READY + (BACK - READY) * Math.min(1, (0.4 - remain) / 0.25);
    const st = performance.now() / 1000 - c.swingT;
    if (c.swingT > 0 && st < 0.45) {
      if (c.swingBlock) {
        yaw = READY + Math.sin(Math.min(1, st / 0.3) * Math.PI) * 0.3;
      } else if (st < 0.12) {
        const u = st / 0.12;
        yaw = BACK + (FOLLOW - BACK) * (1 - (1 - u) * (1 - u));
      } else {
        const u = (st - 0.12) / 0.33;
        yaw = FOLLOW + (READY - FOLLOW) * u * u * (3 - 2 * u);
      }
    }
    const dy = Math.max(-0.4, Math.min(0.4, ballY - 0.98));
    const pitch = Math.asin(dy / 0.427) - 0.359;
    c.arm.rotation.order = 'YXZ';
    c.arm.rotation.y += (yaw - c.arm.rotation.y) * 0.6;
    c.arm.rotation.x += (pitch - c.arm.rotation.x) * 0.2;
    c.body.rotation.y = (yaw - READY) * 0.25;
  }

  scheduleSounds(now) {
    const segs = this.segs;
    for (let i = 0; i < segs.length; i++) {
      if (this.played.has(i)) continue;
      const s = segs[i];
      const ahead = s.t0 - now;
      if (ahead > 0.06) break;
      this.played.add(i);
      if (ahead < -0.25) continue; // 너무 지난 소리는 생략 (네트워크로 늦게 온 소리는 0.25초까지 바로 재생)
      const when = A.audioNow() + Math.max(0, ahead);
      if (s.ev === 'hit') A.playHit(s.grade, s.p, when);
      else if (s.ev === 'table') A.playTable(s.speed, s.p, when);
      else if (s.ev === 'floor') A.playFloor(s.speed, s.p, when);
      else if (s.ev === 'net') A.playNet(s.p, when);
    }
  }
}
