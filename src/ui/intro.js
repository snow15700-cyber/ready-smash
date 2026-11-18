import { playCrowd, playHit, playUI, setEcho } from '../audio.js';
import { equipped } from '../items.js';
import { sideSign } from '../physics.js';
import { CHAR_Z } from '../scene.js';
import { hud } from './hud.js';
import { TEAM_NAME, looks, myId, playerNames, room, roomTpill } from './room.js';
import { holdPose, lookPills, stage, stageFrame, stageOff } from './stage.js';
import { $, ease, esc, game, match, world } from './state.js';

/* ───────── 경기 시작 전 연출 (약 10초, 1v1·2v2) ─────────
   ① 대기실이 스르륵 어두워지고 심장 소리 (1초) → ② VS 소개 5초: 상대 팀 → 우리 팀을 차례로 비추며
   각자 탁구채를 한 번 휘두르고 (그 탁구채 소리), 마지막에 옆에서 크게 보며 VS →
   ③ 3·2·1 카운트다운 (심장 소리가 빨라짐) → 정적 '준비하시고…' → '스매시!' + 함성.
   모든 PC가 'go'를 받은 순간부터 같은 시간표. 선수 모두가 오른쪽 아래 '건너뛰기'를 누르면
   정적(hush)으로 바로 넘어간다 (누른 사람 수는 초록 불). 방장은 연출이 끝나야 경기를 시작한다(match.start) */
export const INTRO = {
  vs: 1.0, p2: 2.7, p3: 4.4, cd: 6.0, hush: 9.0, smash: 9.6, len: 10.2, // 시간표 (초)
  beat: 0.85, beatFast: 0.5, // 심장 소리 간격 (카운트다운 중엔 빠르게)
  swing: 0.2, gap: 0.22, far: 2.3, near: 1.85, y: 1.35, lookY: 1.0, fov: 45, wide: 5.2, wideY: 2.7, wideLook: 0.15,
};
export let intro = null;

export function startIntro(players, mySide, mode) {
  const nm = playerNames(), lk = looks();
  const seats = players.map((p) => ({ side: p.side, slot: p.slot || 0, id: p.id, name: nm[p.side][p.slot || 0], look: lk[p.side][p.slot || 0] }))
    .sort((a, b) => a.side - b.side || a.slot - b.slot);
  intro = { t0: performance.now() / 1000, mySide, mode, seats, seg: '', num: 0, beatAt: 0, skips: new Set(), swung: new Set(), fov: stage.on ? stage.fov : world.camera.fov, roomShown: true };
  if (game) game.paused = true;
  document.body.classList.add('intro');
  // ① 동안은 대기실을 그대로 보여 주고 (누를 수는 없게) 그 위를 어둡게 덮는다
  $('room').classList.remove('hidden');
  $('room').classList.add('leaving');
  const card = (s) => {
    return `<div class="vi-card">${roomTpill(s.id)}<div class="nm t${s.side}">${esc(s.name)}${s.id === myId ? '<small>나</small>' : ''}</div>${lookPills(s.look)}</div>`;
  };
  const team = (side) => `<div class="vi-team">${side === mySide ? (mode === '2v2' ? '우리 팀' : '나') : (mode === '2v2' ? '상대 팀' : '상대')} · ${TEAM_NAME[side]}</div>`
    + seats.filter((s) => s.side === side).map(card).join('');
  $('vi-opp').innerHTML = team(1 - mySide);
  $('vi-us').innerHTML = team(mySide);
  $('vi-num').innerHTML = '';
  $('vs-intro').className = 'vs-intro';
  renderSkip();
}

// 건너뛰기: 선수 모두가 누르면 모든 PC가 각자 정적(hush)으로 넘어간다
function renderSkip() {
  if (!intro) return;
  const n = intro.seats.length, k = intro.skips.size, mine = intro.skips.has(myId);
  const btn = $('vi-skip-btn');
  btn.disabled = mine;
  btn.innerHTML = mine ? '다른 사람 기다리는 중' : '건너뛰기 <span class="ar">▶▶</span>';
  $('vi-skip-dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('');
}
export function addSkip(id) {
  if (!intro || intro.skips.has(id) || !intro.seats.some((s) => s.id === id)) return;
  intro.skips.add(id);
  renderSkip();
  if (intro.skips.size >= intro.seats.length) intro.skipNow = true; // 다음 프레임에 정적으로 (그 프레임 시각 기준)
}
$('vi-skip-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!intro || intro.skips.has(myId)) return;
  playUI('click');
  if (room) room.link.send({ k: 'skip', from: myId });
  addSkip(myId);
});
$('vi-skip').addEventListener('pointerdown', (e) => e.stopPropagation());

// 지금 시각의 구간 이름 (vs-intro에 붙는 class)
function segOf(t) {
  const I = INTRO;
  if (t < I.vs) return 'dim';
  if (t < I.p2) return 'p1';
  if (t < I.p3) return 'p2';
  if (t < I.cd) return 'p3';
  if (t < I.hush) return 'p3 cd';
  if (t < I.smash) return 'p3 cd hush';
  return 'p3 cd hush go';
}

// 연출 중이면 true (그동안 game.update 대신 연출 화면을 그린다)
export function introFrame(now) {
  const I = INTRO;
  if (intro.skipNow) {
    intro.skipNow = false;
    if (now - intro.t0 < I.hush) intro.t0 = now - I.hush;
  }
  const t = now - intro.t0;
  if (t >= I.len) { endIntro(); return false; }
  const el = $('vs-intro');
  const seg = segOf(t);
  if (seg !== intro.seg) {
    intro.seg = seg;
    const flash = seg === 'p2' || seg === 'p3' || seg.endsWith('go');
    el.className = `vs-intro ${seg}${flash ? ' flash' : ''}`;
    if (seg === 'p3') playUI('rare');
    if (seg.endsWith('go')) { playUI('smash'); playCrowd('roar', 1, null, 8); }
  }
  // 카운트다운 숫자 (바뀔 때마다 새로 만들어 쾅 하고 커지는 움직임을 다시)
  const num = seg === 'p3 cd' ? 3 - Math.floor(t - I.cd) : 0;
  if (num !== intro.num) {
    intro.num = num;
    $('vi-num').innerHTML = num ? `<span>${num}</span>` : '';
    if (num) playUI('count');
  }
  // 심장 소리: 정적이 오기 전까지, 카운트다운 중엔 빠르게
  if (t < I.hush && t >= intro.beatAt) {
    playUI('heart');
    intro.beatAt = t + (t >= I.cd ? I.beatFast : I.beat);
  }

  // ① 대기실 그대로 (위에 어두운 막만)
  if (seg === 'dim') { stageFrame(now); return true; }
  stageOff();
  if (intro.roomShown) {
    intro.roomShown = false;
    $('room').classList.remove('leaving');
    $('room').classList.add('hidden');
  }
  const ph = t < I.p2 ? 1 : t < I.p3 ? 2 : 3;
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
    const at = (s.side === intro.mySide ? I.p2 : I.vs) + I.swing + I.gap * s.slot;
    if (t >= at && !intro.swung.has(i)) {
      intro.swung.add(i);
      if (t < at + 0.5) { // 건너뛰어서 지나간 스윙은 하지 않음
        c.stSwing = now;
        c.stBlock = false;
        playHit('perfect', null, null, equipped(s.look, 'paddle').sound || null);
      }
    }
    holdPose(c, now, i);
  });
  for (const side of world.team) for (const c of side) if (!used.has(c)) c.group.visible = false;

  // 카메라: 1) 상대 팀 앞에서 천천히 다가가기 2) 우리 팀 3) 옆에서 크게 (우리 팀이 왼쪽)
  let pos, look;
  if (ph < 3) {
    const side = ph === 1 ? 1 - intro.mySide : intro.mySide;
    const k = ease(ph === 1 ? (t - I.vs) / (I.p2 - I.vs) : (t - I.p2) / (I.p3 - I.p2));
    const m = sideSign(side);
    const d = I.far + (I.near - I.far) * k;
    pos = [(0.3 - 0.6 * k) * m, I.y, m * (CHAR_Z - d)];
    look = [0, I.lookY, m * CHAR_Z];
  } else {
    const k = ease(Math.min(1, (t - I.p3) / (I.smash - I.p3))); // VS·카운트다운 내내 천천히 다가감
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
  const shown = intro.roomShown;
  intro = null;
  document.body.classList.remove('intro');
  $('room').classList.remove('leaving');
  if (shown) $('room').classList.add('hidden');
  stageOff();
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
