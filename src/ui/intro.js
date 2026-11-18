import { playHit, playUI, setEcho } from '../audio.js';
import { equipped } from '../items.js';
import { sideSign } from '../physics.js';
import { CHAR_Z } from '../scene.js';
import { hud } from './hud.js';
import { TEAM_NAME, looks, myId, playerNames, room, roomTpill } from './room.js';
import { holdPose, lookPills } from './stage.js';
import { $, ease, esc, game, match, world } from './state.js';

/* ───────── 경기 시작 전 VS 소개 (3초, 1v1·2v2) ─────────
   상대 팀 → 우리 팀을 차례로 비추며 각자 탁구채를 한 번 휘두르고 (그 탁구채 소리),
   마지막에 옆에서 크게 보며 VS + '준비하시고, 스매시!'. 건너뛰기 없음 (사용자 결정).
   모든 PC가 'go'를 받은 순간부터 3초. 방장은 소개가 끝나야 경기를 시작한다(match.start) */
export const INTRO = { len: 3.0, p2: 1.0, p3: 2.0, go: 2.4, swing: 0.2, gap: 0.22, far: 2.3, near: 1.85, y: 1.35, lookY: 1.0, fov: 45, wide: 5.2, wideY: 2.7, wideLook: 0.15 };
export let intro = null;

export function startIntro(players, mySide, mode) {
  const nm = playerNames(), lk = looks();
  const seats = players.map((p) => ({ side: p.side, slot: p.slot || 0, id: p.id, name: nm[p.side][p.slot || 0], look: lk[p.side][p.slot || 0] }))
    .sort((a, b) => a.side - b.side || a.slot - b.slot);
  intro = { t0: performance.now() / 1000, mySide, mode, seats, phase: 0, swung: new Set(), go: false, fov: world.camera.fov };
  if (game) game.paused = true;
  document.body.classList.add('intro');
  const card = (s) => {
    return `<div class="vi-card">${roomTpill(s.id)}<div class="nm t${s.side}">${esc(s.name)}${s.id === myId ? '<small>나</small>' : ''}</div>${lookPills(s.look)}</div>`;
  };
  const team = (side) => `<div class="vi-team">${side === mySide ? (mode === '2v2' ? '우리 팀' : '나') : (mode === '2v2' ? '상대 팀' : '상대')} · ${TEAM_NAME[side]}</div>`
    + seats.filter((s) => s.side === side).map(card).join('');
  $('vi-opp').innerHTML = team(1 - mySide);
  $('vi-us').innerHTML = team(mySide);
  $('vs-intro').className = 'vs-intro';
}

// 소개 중이면 true (그동안 game.update 대신 소개 화면을 그린다)
export function introFrame(now) {
  const I = INTRO;
  const t = now - intro.t0;
  if (t >= I.len) { endIntro(); return false; }
  const el = $('vs-intro');
  const ph = t < I.p2 ? 1 : t < I.p3 ? 2 : 3;
  if (ph !== intro.phase) {
    intro.phase = ph;
    el.className = `vs-intro p${ph}${ph > 1 ? ' flash' : ''}`;
    if (ph === 3) playUI('rare');
  }
  if (t >= I.go && !intro.go) { intro.go = true; el.classList.add('go'); playUI('turn'); }
  world.setFocus(0);
  setEcho(0);
  world.setBall([0, -1, 0], false);
  world.ring.visible = false;
  world.aim.visible = false;

  // 선수: 실제 경기 자리에 서서 탁구채를 몸 옆에 들고, 자기 팀이 소개될 때 한 번 휘두른다
  const used = new Set();
  intro.seats.forEach((s, i) => {
    const c = world.team[s.side][s.slot];
    used.add(c);
    const m = sideSign(s.side);
    const x = intro.mode === '2v2' ? (s.slot === 0 ? -0.45 : 0.45) * m : 0; // 1번이 (그 팀이 보기에) 왼쪽
    c.group.visible = true;
    c.setOpacity(1, 1);
    c.setTag(null);
    c.setHold(true);
    c.group.position.set(x, 0, m * CHAR_Z);
    c.group.rotation.y = s.side === 0 ? 0 : Math.PI;
    c.body.position.y = Math.sin(now * 2.6 + i) * 0.008;
    const at = (s.side === intro.mySide ? I.p2 : 0) + I.swing + I.gap * s.slot;
    if (t >= at && !intro.swung.has(i)) {
      intro.swung.add(i);
      c.stSwing = now;
      c.stBlock = false;
      playHit('perfect', null, null, equipped(s.look, 'paddle').sound || null);
    }
    holdPose(c, now, i);
  });
  for (const side of world.team) for (const c of side) if (!used.has(c)) c.group.visible = false;

  // 카메라: 1) 상대 팀 앞에서 천천히 다가가기 2) 우리 팀 3) 옆에서 크게 (우리 팀이 왼쪽)
  let pos, look;
  if (ph < 3) {
    const side = ph === 1 ? 1 - intro.mySide : intro.mySide;
    const k = ease(ph === 1 ? t / I.p2 : (t - I.p2) / (I.p3 - I.p2));
    const m = sideSign(side);
    const d = I.far + (I.near - I.far) * k;
    pos = [(0.3 - 0.6 * k) * m, I.y, m * (CHAR_Z - d)];
    look = [0, I.lookY, m * CHAR_Z];
  } else {
    const k = ease((t - I.p3) / (I.len - I.p3));
    const sx = intro.mySide === 0 ? 1 : -1;
    pos = [sx * (I.wide - 0.5 * k), I.wideY - 0.2 * k, 0];
    look = [0, I.wideLook, 0];
  }
  world.camera.fov = I.fov;
  world.camera.updateProjectionMatrix();
  world.camera.position.set(...pos);
  world.camera.lookAt(...look);
  return true;
}

// 소개를 끝내고 경기로 (start=false: 경기가 중간에 취소됨)
export function endIntro(start = true) {
  if (!intro) return;
  const { mode, fov } = intro;
  intro = null;
  document.body.classList.remove('intro');
  $('vs-intro').className = 'vs-intro hidden';
  for (const side of world.team) for (const c of side) c.setHold(false);
  world.camera.fov = fov;
  world.camera.updateProjectionMatrix();
  if (!start || !game) return;
  game.paused = false;
  // 경기 화면 모습으로 되돌리기 (Game 생성 때와 같게: 내 캐릭터는 반투명)
  for (const side of [0, 1]) for (const slot of [0, 1]) {
    const c = world.team[side][slot];
    const isMe = side === game.mySide && slot === game.mySlot;
    c.group.visible = slot === 0 || mode === '2v2';
    c.setOpacity(isMe ? 0.38 : 1, isMe ? 0.9 : 1);
  }
  hud.toast(mode === '2v2' ? '2v2 시작! A1 → B1 → A2 → B2 순서로 쳐요' : '경기 시작! 5점 먼저 내면 승리', 2000);
  if (match && room && room.host) match.start(performance.now() / 1000);
}
