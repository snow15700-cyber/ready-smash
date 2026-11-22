import { ic } from '../icons.js';
import { initAudio, playHit, setEcho, setListener } from '../audio.js';
import { applyLook, equipped } from '../items.js';
import { hud } from './hud.js';
import { myId, room } from './room.js';
import { $, esc, tpill, world } from './state.js';

/* ───────── 대기실 무대 (안 B '자리 위에 서기') ─────────
   아래 카드의 자리 칸마다 바로 위에 그 선수의 3D 캐릭터가 서 있다. 장착한 탁구채를 몸 옆에 들고,
   머리 위에는 칭호 + 닉네임만 (아이템 이름은 안 보임, 사용자 확정 11/22). 빈자리는 흐린 실루엣 */
export const STAGE = { cam: [0, 1.0, 5.0], look: [0, 1.05, 0], fov: 46, z: 1.3, cardAt: 0.73, headY: 1.45 };
const GLOW = { legend: '#ffb020', rare: '#b07cff' };
// 발밑 빛 고리는 장착한 것(탁구채·머리·얼굴·몸) 중 가장 높은 등급 색
const LOOK_CATS = ['paddle', 'head', 'face', 'body'];
const topGrade = (look) => ['legend', 'rare'].find((g) => LOOK_CATS.some((c) => equipped(look, c)?.grade === g)) || null;
export const stage = { seats: [], els: [], on: false, fov: 50 };

export function renderStageLabels() {
  const box = $('room-labels');
  box.innerHTML = stage.seats.map(({ team, m }) => {
    if (!m) return '<div class="rl ghost"><div class="nm">빈자리 · 기다리는 중</div></div>';
    const tags = (m.id === myId ? '<small>나</small>' : '') + (m.host ? `<small>${ic('crown')}</small>` : '');
    return `<div class="rl">${tpill(m.title, m.titleX)}<div class="nm t${team}">${esc(m.nick)}${tags}</div></div>`;
  }).join('');
  stage.els = [...box.children];
}

export function stageFrame(now) {
  if (!stage.on) { stage.on = true; stage.fov = world.camera.fov; }
  world.setFocus(0);
  setEcho(0);
  const H = innerHeight;
  const cardTop = $('room-card').getBoundingClientRect().top;
  world.setStageView(Math.max(200, cardTop / STAGE.cardAt));
  world.camera.fov = STAGE.fov;
  world.camera.position.set(...STAGE.cam);
  world.camera.lookAt(...STAGE.look);
  world.camera.updateProjectionMatrix();
  world.setBall([0, -1, 0], false);
  world.ring.visible = false;
  world.aim.visible = false;
  const used = new Set();
  stage.seats.forEach(({ team, slot, m }, i) => {
    const c = world.team[team][slot];
    used.add(c);
    const el = $(`team-${team}`).children[slot];
    if (!el) { c.group.visible = false; return; }
    const r = el.getBoundingClientRect();
    const x = world.screenToX(r.left + r.width / 2, Math.min(cardTop, H) * 0.6, STAGE.z);
    applyLook(c, m ? m.look : {});
    c.group.visible = true;
    c.setOpacity(m ? 1 : 0.16, m ? 1 : 0);
    c.setTag(null);
    c.setHold(true);
    c.setGlow(m ? GLOW[topGrade(m.look)] : null);
    c.group.position.set(x, 0, STAGE.z);
    c.group.rotation.y = Math.PI - x * 0.08; // 가운데 쪽으로 살짝
    c.body.position.y = Math.sin(now * 2.6 + i) * 0.008;
    holdPose(c, now, i);
    const lb = stage.els[i];
    if (lb) {
      const [px, py] = world.toScreen(x, STAGE.headY, STAGE.z);
      lb.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
    }
  });
  for (const side of world.team) for (const c of side) if (!used.has(c)) c.group.visible = false;
  setListener(STAGE.cam, [1, 0, 0]);
}

// 몸 옆에 든 자세 + 연습 스윙 (c.stSwing부터: 뒤로 빼기 → 휘두르기 → 제자리, 블록은 툭 내밀기)
export function holdPose(c, now, i) {
  let yaw = -0.25 + Math.sin(now * 1.7 + i) * 0.05, pitch = -0.15, twist = 0;
  const st = now - (c.stSwing ?? -9);
  if (st < 0.5) {
    if (c.stBlock) {
      const k = Math.sin(Math.min(1, st / 0.25) * Math.PI);
      yaw += 0.35 * k;
      pitch += 0.15 * k;
    } else {
      let a;
      if (st < 0.07) a = (-st / 0.07) * 0.6;
      else if (st < 0.2) { const u = (st - 0.07) / 0.13; a = -0.6 + 1.9 * (1 - (1 - u) * (1 - u)); }
      else { const u = (st - 0.2) / 0.3; a = 1.3 * (1 - u * u * (3 - 2 * u)); }
      yaw += a;
      pitch += Math.max(0, a) * 0.45;
      twist = a * 0.22;
    }
  }
  c.arm.rotation.set(pitch, yaw, 0.12);
  c.body.rotation.set(0, twist, 0);
}

/* 연습 스윙: 대기실에서 화면을 누른 채 위로 밀면 휘두르고 (그냥 누르면 툭), 내 탁구채 소리가 난다.
   다른 사람에게도 보이고 들린다 (조금 작게, 그 캐릭터 쪽에서). 경기와 같은 조작: 누르기 직전 0.15초 ~ 직후 0.12초 움직임 */
const SWING = { before: 0.15, after: 0.12, gap: 0.45, perfect: 40, good: 12 };
const swMoves = []; // 최근 마우스 위치 { t, y }
let swDown = 0;
const mySeat = () => stage.seats.find((x) => x.m && x.m.id === myId);

export function practiceSwing(id, grade) {
  const seat = stage.seats.find((x) => x.m && x.m.id === id);
  if (!seat) return;
  const c = world.team[seat.team][seat.slot];
  const now = performance.now() / 1000;
  if (now - (c.stSwing ?? -9) < 0.3) return; // 너무 자주 오면 무시
  c.stSwing = now;
  c.stBlock = grade === 'block';
  const it = equipped(seat.m.look, 'paddle');
  const me = id === myId;
  const p = c.group.position;
  playHit(grade, me ? null : [p.x, 1.0, p.z], null, it.sound || null);
}

function stageActive() {
  return stage.on && room && !room.inGame && !$('room').classList.contains('hidden');
}
$('c').addEventListener('pointermove', (e) => {
  if (!stageActive()) return;
  const t = e.timeStamp / 1000; // 이벤트가 생긴 시각 (느린 PC에서 처리가 늦어도 정확하게)
  swMoves.push({ t, y: e.clientY });
  while (swMoves.length && swMoves[0].t < t - 0.5) swMoves.shift();
});
$('c').addEventListener('pointerdown', (e) => {
  if (!stageActive() || e.button !== 0) return;
  if (room.spectate) return; // 관중은 연습 스윙 없음 (보기만)
  if (!mySeat()) { hud.toast('팀을 고르면 연습 스윙을 할 수 있어요'); return; }
  const t = e.timeStamp / 1000;
  if (t - swDown < SWING.gap) return;
  swDown = t;
  swMoves.push({ t, y: e.clientY });
  initAudio();
  setTimeout(() => {
    if (!stageActive()) return;
    // 이 구간에서 가장 아래 → 그 뒤 가장 위로 올라간 만큼 = 위로 민 거리(px)
    const pts = swMoves.filter((m) => m.t >= t - SWING.before && m.t <= t + SWING.after + 0.05);
    let low = -Infinity, up = 0;
    for (const m of pts) { low = Math.max(low, m.y); up = Math.max(up, low - m.y); }
    const grade = up >= SWING.perfect ? 'perfect' : up >= SWING.good ? 'good' : 'block';
    practiceSwing(myId, grade);
    room.link.send({ k: 'sw', id: myId, g: grade });
  }, SWING.after * 1000);
});

// 대기실을 떠나면 원래 모습으로 (경기 자세, 빛 고리 끄기, 카메라 화면 비율)
export function stageOff() {
  if (!stage.on) return;
  stage.on = false;
  for (const side of world.team) for (const c of side) { c.setHold(false); c.setGlow(null); }
  world.camera.fov = stage.fov;
  world.setStageView(null);
}
