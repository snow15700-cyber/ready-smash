// 광장에서 관전 (docs/dev/plaza.md 7장, ④): 경기 중인 탁구대에 가까이 가면 그 탁구대 1대만 실시간으로 광장 탁구대 위에 그린다.
// - 그 경기 채널을 '듣기만' 한다(관전 화면과 같은 joinRoom listen: 명단에 안 들어가고 아무것도 안 보냄) → 선수 PC 부담 0.
// - 받는 것: 방장이 보내는 경기 소식(ev: toss·shot·point…)과 pong(시계 맞추기용 방장 시각). 공은 소식의 궤적을 그대로 계산(physics.js).
// - 멀어지면 바로 끊는다(먼 탁구대는 로비 채널의 점수 표지판만). 한 번에 1대만.
// 광장 탁구대는 긴 쪽이 x라서, 경기 좌표(탁구대 가운데 = 원점, 긴 쪽 z)를 90° 돌린 묶음(group) 안에 그린다.
import * as THREE from 'three';
import { titleText } from '../achievements.js';
import { PLAZA } from '../arena-plaza.js';
import { applyLook } from '../items.js';
import { joinRoom } from '../net.js';
import { AI_LOOK, AI_NAME, KIM_ID } from '../match.js';
import { CHAR_Z, makeCharacter } from '../scene.js';
import { HALF_L, ballPos, sideSign, simulate, tossSegs } from '../physics.js';
import { myId } from './room.js';
import { holdPose } from './stage.js';
import { myNick } from './state.js';

export const LIVE_NEAR = 7; // 탁구대 가운데에서 이 거리(m) 안이면 실시간
const LIVE_FAR = 9; // 이만큼 멀어지면 끊음 (가장자리에서 붙었다 끊겼다 하지 않게)

let view = null; // 광장 3D (src/plaza.js createPlazaView)
let live = null; // { t, code, link, members, segs, offs, offset, score, g, chars, ball, ... }

export const liveInfo = () => (live ? { t: live.t, code: live.code, score: live.score, got: live.got } : null);

function build(t) {
  const T = PLAZA.tables[t];
  const g = new THREE.Group();
  g.position.set(T.x, 0, T.z);
  g.rotation.y = -Math.PI / 2; // 경기 (x, z) → 광장 (−z, x): A팀(경기 +z) = 서쪽 끝
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshLambertMaterial({ color: 0xfff4d6, emissive: 0x332a10 }));
  ball.visible = false;
  g.add(ball);
  view.root.add(g);
  return { g, ball };
}

function start(t, r) {
  stop();
  const { g, ball } = build(t);
  const L = live = { t, code: r.code, mode: r.mode, pl: r.pl || [], members: [], segs: null, offs: [], offset: null, score: r.score || [0, 0], g, ball, chars: new Map(), got: 0, lookKey: '' };
  L.link = joinRoom(r.code, { id: myId, nick: myNick(), at: Date.now() }, {
    onMsg: (m) => onMsg(L, m),
    onMembers: (list) => { if (live === L) { L.members = list; dress(L); } },
    onStatus: () => {},
  }, { listen: true });
  dress(L);
}
export function stop() {
  if (!live) return;
  live.link.leave();
  view.root.remove(live.g);
  live.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  live = null;
}

// 선수 캐릭터 (경기 채널 명단의 이름·꾸미기·칭호). 자리: 1대1은 가운데, 2대2는 1번이 그 팀이 볼 때 왼쪽
function dress(L) {
  const key = JSON.stringify([L.pl, L.members.map((m) => [m.id, m.nick, m.look, m.title])]);
  if (key === L.lookKey) return;
  L.lookKey = key;
  for (const [id, c] of L.chars) if (!L.pl.some((p) => p.id === id)) { L.g.remove(c.group); L.chars.delete(id); }
  for (const p of L.pl) {
    let c = L.chars.get(p.id);
    if (!c) {
      c = makeCharacter('#e0333c');
      c.setHold(true);
      c.group.traverse((o) => { o.castShadow = false; });
      c.side = p.side;
      c.baseX = L.mode === '2v2' ? (p.slot === 0 ? -0.45 : 0.45) * sideSign(p.side) : 0;
      c.group.position.set(c.baseX, 0, sideSign(p.side) * CHAR_Z);
      c.group.rotation.y = p.side === 0 ? 0 : Math.PI;
      L.g.add(c.group);
      L.chars.set(p.id, c);
    }
    const m = p.id === KIM_ID ? { nick: AI_NAME, look: AI_LOOK } : L.members.find((x) => x.id === p.id);
    applyLook(c, m?.look || {});
    c.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    c.setTag(m?.nick || '선수', false, m ? titleText(m.title, m.titleX) : '');
  }
}

// 시계: 방장 시각 − 받은 순간 중 가장 큰 값 (관전 화면 watch.js watchClock과 같은 방식)
function clock(L, hostT) {
  L.offs.push(hostT - performance.now() / 1000);
  if (L.offs.length > 30) L.offs.shift();
  L.offset = Math.max(...L.offs);
}
function onMsg(L, m) {
  if (live !== L || !m) return;
  L.got++;
  if (m.k === 'pong' && typeof m.th === 'number') { clock(L, m.th); return; }
  if (m.k !== 'ev' || !m.ev || typeof m.ev !== 'object') return;
  const ev = m.ev;
  if (typeof ev.t === 'number' && (ev.type === 'shot' || ev.type === 'toss')) clock(L, ev.t);
  try {
    if (ev.type === 'toss') L.segs = tossSegs(ev.side ? 1 : 0, ev.t, +ev.x || 0).segs;
    else if (ev.type === 'shot' && Array.isArray(ev.p) && Array.isArray(ev.v)) {
      L.segs = simulate(ev.p, ev.v, ev.t0, 'hit', { side: ev.side ? 1 : 0 });
      const p = L.pl.find((x) => x.side === (ev.side ? 1 : 0) && (x.slot || 0) === (ev.slot || 0));
      const c = p && L.chars.get(p.id);
      if (c) { c.stSwing = performance.now() / 1000; c.stBlock = ev.grade === 'block'; }
    } else if (ev.type === 'serveReady' || ev.type === 'point' || ev.type === 'let' || ev.type === 'gameOver') L.segs = null;
    if (Array.isArray(ev.score) && ev.score.length === 2) L.score = ev.score.map((v) => v | 0);
  } catch { L.segs = null; } // 이상한 소식은 무시
}

// 매 프레임 (광장이 보일 때): 가장 가까운 경기 중 탁구대 1대만 실시간. busy[t] = 로비 채널의 경기 정보(없으면 null)
export function liveFrame(v, now, me, busy, on) {
  view = v;
  let want = null;
  if (on) {
    let best = Infinity;
    busy.forEach((r, t) => {
      if (!r) return;
      const T = PLAZA.tables[t];
      const d = Math.hypot(me[0] - T.x, me[1] - T.z);
      const lim = live?.t === t && live.code === r.code ? LIVE_FAR : LIVE_NEAR;
      if (d < lim && d < best) { best = d; want = { t, r }; }
    });
  }
  if (!want) { stop(); return null; }
  if (!live || live.t !== want.t || live.code !== want.r.code) start(want.t, want.r);
  const L = live;
  if (want.r.pl && JSON.stringify(want.r.pl) !== JSON.stringify(L.pl)) { L.pl = want.r.pl; dress(L); }
  // 공
  const ht = L.offset == null ? null : now + L.offset;
  const p = L.segs && ht != null ? ballPos(L.segs, ht) : null;
  L.ball.visible = !!p && Math.abs(p[2]) < HALF_L + 2.5 && p[1] > -0.5;
  if (L.ball.visible) L.ball.position.set(p[0], p[1], p[2]);
  // 선수: 공이 자기 쪽으로 오면 공 x를 따라 옆으로, 아니면 제자리로 (보기만)
  let i = 0;
  for (const c of L.chars.values()) {
    const toward = p && Math.sign(p[2]) === sideSign(c.side);
    const tx = toward ? Math.max(-0.9, Math.min(0.9, p[0] + (c.baseX ? c.baseX * 0.3 : 0))) : c.baseX;
    c.group.position.x += (tx - c.group.position.x) * 0.12;
    c.body.position.y = Math.sin(now * 2.6 + i) * 0.008;
    holdPose(c, now, i++);
    c.tickOutfit(now, 0.016);
  }
  return { t: L.t, score: L.score, r: want.r };
}
