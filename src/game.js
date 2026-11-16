// 화면 쪽 게임: 이벤트를 받아 공·캐릭터·소리·링을 그리고, 내 입력을 판정해 보낸다
import { simulate, findIdealHit, tossSegs, ballPos, judge, sideSign, HIT_Z, TY, WIN, HOLD } from './physics.js';
import { PADDLE_OFFSET, PADDLE_COLOR, CHAR_Z } from './scene.js';
import { computeShot, hitOrder } from './match.js';
import * as A from './audio.js';

// 스윙 동작은 '클릭 직전 0.15초 ~ 클릭 직후 HOLD초' 동안의 마우스 움직임으로 판단한다.
// 위로 올렸으면 스윙(아니면 블록), 그 움직임이 왼쪽 위/위/오른쪽 위 중 어디냐로 방향을 정한다.
const PRE = 0.15;
// 타이밍 링이 화면 밖으로 나가지 않게: 카메라에서 최소 이만큼(m) 떨어뜨려 너무 커지지 않게 하고,
// 가운데 흰 링의 SAFE배 크기가 화면 안에 다 들어오도록 가장자리에서 띄운다
const RING = { minDist: 1.1, safe: 3, pad: 0.03 };
// 찬스볼 신호음 간격(초): 칠 타이밍 3박 전부터 똑·똑·똑, 그 타이밍에 높은 '띵'
const CUE_GAP = 0.3;
// 몰입 연출(에코·어두워짐): 랠리 FOCUS.from회부터 서서히, FOCUS.to회에 최대. 점수가 나면 약 1초에 걸쳐 원래대로 
const FOCUS = { from: 6, to: 15, up: 0.6, down: 1 };
const ARROW = { '-1': ' ←', '0': ' ↑', '1': ' →' };

export class Game {
  // authority: 이 PC가 경기를 계산하는지 (혼자 모드, 방장). 아니면 방장 이벤트를 받아 그리고 내 타격은 예측해서 먼저 보여준다
  // playerNames[side][slot]: 2v2 이름표용
  constructor(world, { mySide, mySlot = 0, mode, send, hud, authority = true, names = ['나', '상대'], playerNames = null, best = 0, onBest = null, onRally = null }) {
    this.authority = authority;
    this.names = names;
    this.playerNames = playerNames;
    this.offset = 0; // 방장 시계 - 내 시계 (초)
    this.net = { seed: 0, nextIdx: 0, rally: 0, incoming: null };
    this.focus = 0; // 몰입 정도 (0~1)
    this.focusRally = 0; // 몰입 연출 기준 랠리 수 (점수 나면 0)
    this.predicted = null;
    this.w = world;
    this.mySide = mySide;
    this.mySlot = mySlot;
    this.mode = mode;
    this.order = hitOrder(mode);
    this.turn = 0; // 다음에 칠 사람 (order의 번호)
    this.send = send; // { toss(side,t,x), swing(side,t,dir,isSwing) }
    this.hud = hud;
    this.segs = null;
    this.expect = null;
    this.phase = 'idle';
    this.server = 0;
    this.score = [0, 0];
    this.played = new Set();
    this.localHitT = -1;
    // 캐릭터 위치 [side][slot]
    this.charX = [[0, 0], [0, 0]];
    this.charZ = [[CHAR_Z, CHAR_Z], [CHAR_Z, CHAR_Z]];
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, hist: [] };
    // perfect3 = 퍼펙트 3연속 횟수, rally10 = 랠리 10회 이상 이어 간 횟수 (경기 끝나고 코인 정산용)
    this.stats = { rally: 0, best: 0, perfectStreak: 0, perfects: 0, perfect3: 0, rally10: 0 };
    // 혼자 하기 최고 기록: 처음 값과 새 기록 저장은 main.js가 정한다(로그인 = 서버, 손님 = 브라우저)
    if (mode === 'ai') this.stats.best = best;
    this.onBest = onBest;
    this.onRally = onRally; // 혼자 하기: 랠리가 끝날 때 내가 친 횟수 (코인)
    this.lastNow = performance.now() / 1000;
    this.tossX = 0;
    this.pendingHit = null; // 클릭 후 방향 판단을 기다리는 타격
    this.holdPos = null;
    // 내 캐릭터는 반투명 (공과 상대가 가려지지 않게). 채 색: 나 빨강, 팀원, 상대 파랑
    for (const side of [0, 1]) for (const slot of [0, 1]) {
      const c = world.team[side][slot];
      const isMe = side === mySide && slot === mySlot;
      c.group.visible = slot === 0 || mode === '2v2';
      c.setOpacity(isMe ? 0.38 : 1, isMe ? 0.9 : 1);
      c.fade = isMe ? null : 1; // 카메라 바로 옆에 오면 흐리게 (2v2에서 뒤로 물러난 팀원)
      c.setPaddleColor(isMe ? PADDLE_COLOR.me : side === mySide ? PADDLE_COLOR.mate : PADDLE_COLOR.opp);
      c.group.position.z = sideSign(side) * CHAR_Z;
      c.setTag(null);
    }
    if (mode === 'ai') world.team[1][0].setTag(names[1]); // AI 이름표

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
    for (const side of [0, 1]) for (const slot of [0, 1]) this.w.team[side][slot].setTag(null);
  }

  // 2v2: 이제 내가 칠 차례면 크게 알려 준다 (서브는 '내 서브!')
  announceTurn(serve) {
    if (this.mode !== '2v2') return;
    this.hud.turn(serve ? '내 서브!' : '내 차례!');
    A.playUI('turn');
  }

  isMe(side, slot = 0) { return side === this.mySide && slot === this.mySlot; }
  charOf(side, slot = 0) { return this.w.team[side][slot]; }
  // 각 쪽에서 다음에 칠 사람 (그 쪽의 '앞에 나와 있는' 선수)
  activeSlot(side) {
    const n = this.order.length;
    const a = this.order[this.turn % n];
    return a.side === side ? a.slot : this.order[(this.turn + 1) % n].slot;
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
    const who = this.order[this.turn];
    if (this.phase === 'serve' && this.isMe(who.side, who.slot)) {
      A.playToss(this.tossPos(me));
      this.hud.hint('');
      if (!this.authority) this.onEvent({ type: 'toss', side: me, slot: this.mySlot, t, x: this.tossX, local: true });
      this.send.toss(me, t, this.tossX, this.mySlot);
      return;
    }
    const ex = this.expect;
    const char = this.charOf(me, this.mySlot);
    if (!ex || !this.isMe(ex.side, ex.slot) || ex.whiffed || (this.phase !== 'toss' && this.phase !== 'rally')) {
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
        this.send.swing(me, t, 0, true, this.mySlot);
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
    if (!up) this.charOf(me, this.mySlot).swingBlock = true;
    const smash = this.net.incoming === 'chance' && grade === 'perfect';
    this.hud.judge(grade, (smash ? 'SMASH!' : ({ perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD', block: 'BLOCK' })[grade]) + ARROW[dir]);
    if (grade === 'perfect') {
      this.stats.perfectStreak++;
      this.stats.perfects++;
      if (this.stats.perfectStreak % 3 === 0) this.stats.perfect3++;
    } else this.stats.perfectStreak = 0;
    this.hud.stats(this.stats);
    if (!this.authority) this.predictHit(h.t, grade, dir, h.t - ex.t);
    this.send.swing(me, h.t, dir, up, this.mySlot);
  }

  // 상대 PC(방장 아님): 방장 응답을 기다리지 않고 내 타격 결과를 똑같은 공식으로 먼저 계산해 보여준다
  predictHit(t, grade, dir, dt = 0) {
    const shot = computeShot({
      mode: this.mode, seed: this.net.seed, shotIdx: this.net.nextIdx, rally: this.net.rally,
      segs: this.segs, serve: this.phase === 'toss', side: this.mySide, t, grade, dir, hold: HOLD,
      incoming: this.net.incoming, dt,
    });
    this.predicted = { t, prevSegs: this.segs, prevExpect: this.expect, prevTurn: this.turn };
    this.segs = shot.segs;
    this.played = new Set([0]);
    this.turn = (this.turn + 1) % this.order.length;
    this.expect = shot.next ? { ...shot.next, slot: this.order[this.turn].slot, whiffed: false } : null;
    this.phase = 'rally';
    this.holdPos = null;
  }

  // 몰입 연출: 랠리가 길어질수록 에코가 커지고 배경이 어두워진다. 천천히 따라가고, 점수가 나면 빠르게 돌아온다
  updateFocus(dt) {
    const r = this.focusRally;
    const target = Math.max(0, Math.min(1, (r - FOCUS.from) / (FOCUS.to - FOCUS.from)));
    const rate = target > this.focus ? FOCUS.up : FOCUS.down;
    this.focus += Math.sign(target - this.focus) * Math.min(Math.abs(target - this.focus), rate * dt);
    this.w.setFocus(this.focus);
    A.setEcho(this.focus);
  }

  // 찬스볼: 칠 타이밍(방장 시계 tHit)에 맞춰 똑·똑·똑·띵. 이미 지나간 박자는 건너뜀
  playCue(tHit) {
    const now = performance.now() / 1000 + this.offset;
    const base = A.audioNow() + (tHit - now);
    for (let i = 3; i >= 0; i--) {
      const when = base - i * CUE_GAP;
      if (when < A.audioNow() - 0.01) continue;
      A.playCue(when, i === 0);
    }
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
        if (this.mode !== 'ai') this.hud.score(this.score);
        break;
      case 'serveReady':
        this.phase = 'serve';
        this.server = ev.server;
        this.turn = ev.turn ?? 0;
        this.segs = null;
        this.expect = null;
        this.w.clearTrail();
        this.stats.rally = 0;
        this.speedLv = 0;
        this.net.rally = 0;
        this.net.incoming = null;
        this.focusRally = 0;
        this.predicted = null;
        this.hud.stats(this.stats);
        {
          const who = this.order[this.turn];
          const mine = this.isMe(who.side, who.slot);
          this.hud.hint(mine ? '클릭해서 서브 토스!' : who.side === me ? '팀원 서브를 기다리는 중…' : '상대 서브를 기다리는 중…');
          if (mine) this.announceTurn(true);
        }
        break;
      case 'toss': {
        const slot = ev.slot ?? 0;
        if (this.isMe(ev.side, slot) && !ev.local && this.phase === 'toss') break; // 이미 예측해서 보여주는 중
        const { segs, ideal } = tossSegs(ev.side, ev.t, ev.x);
        this.phase = 'toss';
        this.segs = segs;
        this.played = new Set([0]);
        this.expect = { ...ideal, slot, whiffed: false };
        if (this.isMe(ev.side, slot)) this.hud.hint('공이 떨어질 때 마우스를 누른 채로 위로 쓱! (↖ ↑ ↗)');
        break;
      }
      case 'shot': {
        this.phase = 'rally';
        this.net.nextIdx = (ev.idx ?? this.net.nextIdx) + 1;
        this.net.rally = ev.rally;
        this.focusRally = ev.rally;
        this.net.incoming = ev.kind === 'chance' || ev.kind === 'smash' ? ev.kind : null;
        const mine = this.isMe(ev.side, ev.slot ?? 0);
        const wasPredicted = this.predicted && mine && Math.abs(this.predicted.t - ev.t) < 1e-6;
        this.predicted = null;
        this.segs = simulate(ev.p, ev.v, ev.t0, 'hit', { side: ev.side, grade: ev.grade, smash: ev.kind === 'smash' });
        this.holdPos = null;
        if (!wasPredicted) this.played = new Set();
        if (mine && Math.abs(this.localHitT - ev.t) < 0.001) this.played.add(0);
        if (!mine) this.charOf(ev.side, ev.slot ?? 0).swingT = performance.now() / 1000;
        this.turn = ev.turn ?? (this.turn + 1) % this.order.length;
        const next = findIdealHit(this.segs, 1 - ev.side);
        this.expect = next ? { ...next, slot: this.order[this.turn].slot, whiffed: false } : null;
        const toMe = this.expect && this.isMe(this.expect.side, this.expect.slot);
        if (!mine && toMe) this.announceTurn(false);
        if (ev.kind === 'chance' && toMe) {
          this.hud.toast('찬스볼! 소리에 맞춰 쳐 보세요');
          this.playCue(this.expect.t);
        } else if (ev.kind === 'smash' && !mine) this.hud.toast('스매시!');
        if (mine) {
          this.stats.rally = ev.rally;
          this.hud.hint('');
        }
        this.stats.rally = this.mode === 'ai' ? Math.ceil(ev.rally / 2) : ev.rally;
        if (ev.rally === 10 && this.mode !== 'ai') this.stats.rally10++;
        this.hud.stats(this.stats);
        if (ev.speedLv > (this.speedLv || 0)) this.hud.toast(`속도 UP! Lv.${ev.speedLv + 1}`);
        this.speedLv = ev.speedLv;
        break;
      }
      case 'whiff':
        if (this.expect && this.expect.side === ev.side && this.expect.slot === (ev.slot ?? 0)) this.expect.whiffed = true;
        if (!this.isMe(ev.side, ev.slot ?? 0)) this.charOf(ev.side, ev.slot ?? 0).swingT = performance.now() / 1000;
        break;
      case 'miss':
        if (this.predicted && this.isMe(ev.side, ev.slot ?? 0)) {
          // 내 타격이 방장에게 너무 늦게 도착: 예측을 취소하고 원래 공 궤적으로
          this.segs = this.predicted.prevSegs;
          this.turn = this.predicted.prevTurn;
          this.predicted = null;
        }
        this.holdPos = null;
        this.pendingHit = null;
        this.expect = null;
        if (this.isMe(ev.side, ev.slot ?? 0)) {
          this.hud.judge('miss');
          this.stats.perfectStreak = 0;
        }
        break;
      case 'serveMiss':
        this.expect = null;
        if (this.isMe(ev.side, ev.slot ?? 0)) this.hud.hint('괜찮아요! 다시 토스해 보세요');
        break;
      case 'rallyEnd': {
        const r = this.stats.rally;
        this.onRally?.(r);
        if (r > this.stats.best) {
          this.stats.best = r;
          this.onBest?.(r);
          if (r >= 3) this.hud.toast(`최고 기록! ${r}회 랠리`);
        }
        this.hud.stats(this.stats);
        break;
      }
      case 'point':
        this.focusRally = 0;
        this.score = ev.score;
        this.hud.score(this.score, ev.deuce);
        A.playUI(ev.winner === me ? 'point' : 'lose');
        break;
      case 'gameOver':
        this.focusRally = 0;
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
    this.updateFocus(dt);
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
    // 2v2: 각 쪽에서 다음에 칠 사람만 앞에 나와 공을 따라가고, 팀원은 자기 자리(좌우)에서 한 걸음 뒤로 물러난다
    const two = this.mode === '2v2';
    const k = 1 - Math.exp(-dt * 7);
    const ex = this.expect;
    for (let s = 0; s < 2; s++) {
      const m = sideSign(s);
      const act = this.activeSlot(s);
      for (let sl = 0; sl < (two ? 2 : 1); sl++) {
        const c = this.charOf(s, sl);
        let tx = -PADDLE_OFFSET.right * m * 0.5;
        let tz = CHAR_Z;
        let ballY = TY + 0.25;
        let remain = 9;
        if (sl === act) {
          const who = this.order[this.turn];
          if (this.phase === 'serve' && who.side === s && who.slot === sl) tx = this.tossX - PADDLE_OFFSET.right * m;
          if (ex && ex.side === s && ex.slot === sl) {
            tx = ex.pos[0] - PADDLE_OFFSET.right * m;
            ballY = ex.pos[1];
            remain = ex.t - now;
          }
        } else {
          // 1번은 왼쪽, 2번은 오른쪽 (그 선수가 보는 방향 기준)
          tx = (sl === 0 ? -0.55 : 0.55) * m;
          tz = CHAR_Z + 0.6;
        }
        const ox = this.charX[s][sl];
        this.charX[s][sl] += (tx - ox) * k;
        this.charZ[s][sl] += (tz - this.charZ[s][sl]) * k;
        c.group.position.x = this.charX[s][sl];
        c.group.position.z = m * this.charZ[s][sl];
        this.animArm(c, now, remain, ballY);
        c.body.position.y = Math.sin(now * 2.6 + s + sl * 1.7) * 0.006;
        c.body.rotation.z = -(tx - ox) * 0.25 * m;
        // 다른 캐릭터가 카메라 가까이(1.3m 안) 오면 흐리게: 화면을 가리지 않게
        if (two && c.fade != null) {
          const cp = w.camera.position;
          const d = Math.hypot(c.group.position.x - cp.x, c.group.position.z - cp.z);
          const op = d < 1.3 ? 0.45 : 1;
          c.fade += (op - c.fade) * k;
          const q = Math.round(c.fade * 20) / 20; // 너무 자주 재질을 바꾸지 않게
          c.setOpacity(q, Math.max(q, 0.9));
        }
        // 이름표: 상대 팀만 (팀원은 가까워서 이름표가 엉뚱한 곳에 뜸). 다음에 칠 사람은 노랗게
        if (two && this.playerNames && s !== me) {
          const nx = this.order[this.turn];
          const next = this.phase !== 'point' && this.phase !== 'over' && nx.side === s && nx.slot === sl;
          c.setTag(this.playerNames[s][sl], next);
        }
      }
    }

    // 카메라 / 소리 위치
    w.updateCamera(me, this.charX[me][this.mySlot], dt, this.segs ? w.ball.position.x : 0, this.charZ[me][this.mySlot]);
    const cam = w.camera;
    A.setListener([cam.position.x, cam.position.y, cam.position.z], me === 0 ? [1, 0, 0] : [-1, 0, 0]);

    // 타이밍 링
    const showRing = ex && this.isMe(ex.side, ex.slot) && !ex.whiffed && (this.phase === 'toss' || this.phase === 'rally');
    const remain = ex ? ex.t - now : 9;
    if (showRing && remain < 0.95 && remain > -WIN.bad) {
      w.ring.visible = true;
      // 칠 자리가 화면 밖(사이드)이어도 링은 화면 안 가장자리에 붙여서 보이게 한다
      // (카메라 기준 좌표로 바꿔서: 너무 가깝거나 뒤에 있으면 앞으로 밀고, 화면 밖이면 가장자리 안쪽으로)
      const p = w.ring.position.set(ex.pos[0], ex.pos[1], ex.pos[2]);
      cam.updateMatrixWorld();
      cam.worldToLocal(p);
      const depth = Math.max(RING.minDist, -p.z);
      const th = Math.tan((cam.fov * Math.PI) / 360), tw = th * cam.aspect;
      const r = (0.072 * RING.safe) / (depth * th); // 화면 높이 기준 링 반지름
      const ey = Math.max(0.3, 1 - r - RING.pad), ex2 = Math.max(0.3, 1 - r / cam.aspect - RING.pad);
      const nx = p.z < 0 ? p.x / (-p.z * tw) : Math.sign(p.x) * 9; // 화면 가로 위치 (-1~1이 화면 안)
      const ny = p.z < 0 ? p.y / (-p.z * th) : Math.sign(p.y) * 9;
      p.set(Math.max(-ex2, Math.min(ex2, nx)) * depth * tw, Math.max(-ey, Math.min(ey, ny)) * depth * th, -depth);
      cam.localToWorld(p);
      w.ring.quaternion.copy(cam.quaternion); // 화면을 정면으로 보게 (가장자리에서도 동그랗게)
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
