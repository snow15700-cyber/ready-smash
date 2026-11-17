// 로비 배경: 두 캐릭터가 끝없이 랠리를 주고받는 연출 (로비 화면에서만 작은 타구음·바운드음)
// 실제 경기와 같은 물리(planShot·simulate)를 써서 공이 진짜처럼 날아간다
import { planShot, simulate, findIdealHit, ballPos, sideSign, rng, HIT_Z, TY } from './physics.js';
import { PADDLE_OFFSET, CHAR_Z } from './scene.js';
import { armPose } from './game.js';
import * as A from './audio.js';

// 로비 카메라: 옆에서 비스듬히 내려다보며 천천히 좌우로 흔들린다
// shift: 화면 왼쪽 메뉴를 피해 탁구대를 오른쪽으로 보내는 정도(m, 좁은 화면에서는 0)
export const LOBBY_CAM = { dist: 5.2, y: 2.45, angle: 0.82, sway: 0.22, speed: 0.07, lookY: 0.78, shift: 1.55 };
// 치는 등급 비율 (BAD는 빼서 랠리가 예쁘게 이어지게)
const GRADES = [['perfect', 0.3], ['good', 0.5], ['block', 0.2]];

export function createLobbyDemo() {
  const r = rng(Date.now() & 0xffff);
  let segs = null; // 지금 날아가는 공
  let next = null; // 다음에 칠 사람의 타격 예정 { t, pos, side }
  let restart = 0; // 공이 끊기면 이 시각에 다시 서브
  const charX = [0, 0];
  let lastNow = 0;
  let played = 0; // 지금 공(segs)에서 소리를 낸 세그먼트 수

  const pickGrade = () => {
    let x = r();
    for (const [g, p] of GRADES) { if ((x -= p) <= 0) return g; }
    return 'good';
  };

  function shoot(side, from, t, serve, chars) {
    const grade = serve ? 'good' : pickGrade();
    const dir = [-1, 0, 1][Math.floor(r() * 3)];
    const v = planShot(from, side, grade, dir, (r() * 1e9) >>> 0, serve);
    segs = simulate(from, v, t, 'hit', { side, grade, sound: chars[side].sound });
    played = 0;
    next = findIdealHit(segs, 1 - side);
    const c = chars[side];
    c.swingT = performance.now() / 1000;
    c.swingBlock = grade === 'block';
    if (!next) restart = t + 1.2;
  }

  function serve(now, chars) {
    const x = (r() * 2 - 1) * 0.3;
    shoot(0, [x, TY + 0.28, HIT_Z], now + 0.6, true, chars);
  }

  // 다가오는 소리를 예약 (타구·탁구대·바닥·네트). sound가 false면 소리 없이 건너뛴다
  function sounds(now, on, chars, world) {
    while (played < segs.length) {
      const s = segs[played];
      const ahead = s.t0 - now;
      if (ahead > 0.06) break;
      played++;
      if (ahead < -0.1) continue;
      if (s.ev === 'hit') world.hitFx(chars[s.side], s.p, s.grade); // 전설 탁구채 효과는 소리가 꺼져 있어도 보인다
      if (!on) continue;
      const when = A.audioNow() + Math.max(0, ahead);
      if (s.ev === 'hit') A.playHit(s.grade, s.p, when, s.sound);
      else if (s.ev === 'table') A.playTable(s.speed, s.p, when);
      else if (s.ev === 'floor') A.playFloor(s.speed, s.p, when);
      else if (s.ev === 'net') A.playNet(s.p, when);
    }
  }

  return {
    // chars = [쪽0 캐릭터, 쪽1 캐릭터], sound = 소리를 낼지 (로비 화면일 때만)
    update(now, chars, world, sound = false) {
      const dt = Math.min(0.1, now - lastNow || 0.016);
      lastNow = now;
      // 처음이거나, 탭을 오래 비웠다가 돌아오면 새로 시작
      if (!segs || (next && now > next.t + 0.6) || (restart && now > restart)) {
        restart = 0;
        serve(now, chars);
      }
      if (next && now >= next.t) {
        const n = next;
        next = null;
        shoot(n.side, n.pos, n.t, false, chars);
      }
      sounds(now, sound, chars, world);
      const t0 = segs[0].t0;
      world.setBall(now >= t0 ? ballPos(segs, now) : segs[0].p, true);

      const k = 1 - Math.exp(-dt * 7);
      for (const s of [0, 1]) {
        const m = sideSign(s);
        const c = chars[s];
        let tx = -PADDLE_OFFSET.right * m * 0.5;
        let remain = 9, ballY = TY + 0.25;
        if (next && next.side === s) {
          tx = next.pos[0] - PADDLE_OFFSET.right * m;
          remain = next.t - now;
          ballY = next.pos[1];
        } else if (!next && segs && segs[0].side === s && now < t0) {
          tx = segs[0].p[0] - PADDLE_OFFSET.right * m; // 서브 준비
        }
        const ox = charX[s];
        charX[s] += (tx - ox) * k;
        c.group.position.set(charX[s], 0, m * CHAR_Z);
        c.group.rotation.y = s === 0 ? 0 : Math.PI;
        armPose(c, now, remain, ballY);
        c.body.position.y = Math.sin(now * 2.6 + s) * 0.006;
        c.body.rotation.z = -(tx - ox) * 0.25 * m;
      }
    },
  };
}
