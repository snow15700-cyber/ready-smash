// 경기장 거품 (docs/dev/plaza.md 16장): 경기 중인 탁구대 둘레 원(6m) 안으로 걸어 들어가면 자동으로 관전 +
// 광장이 그 경기의 방장 배경으로 바뀐다(불꽃 고리 물결, src/bubbleFx.js). 원(8m) 밖으로 나가면 다시 광장.
// - 선수 부담 0: 그 경기 채널은 듣기만(명단에도 안 들어가고 아무것도 안 보냄). 관전자 수는 관중석 채널 명단으로(선수는 듣기만).
// - 원 안에서는 광장처럼 걸어 다니며 보고(3인칭 카메라), '🪑 관중석에 앉기'를 누르면 관중석 내 자리 1인칭.
// - 같은 원 안 관전자끼리는 걷는 모습이 보인다(광장 채널). 응원(박수 등)은 그 사람 머리 위 말풍선.
// - 기존 관전 화면(고정 카메라 시점들)은 이것으로 바뀌었다.
import * as THREE from 'three';
import { smoothstep as ease } from '../util.js';
import { myEquip, myTitle } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { BUBBLE_IN, BUBBLE_OUT, PLAZA } from '../arena-plaza.js';
import { WAVE_DUR, applyWave, prepWave, setCut, waveR } from '../bubbleFx.js';
import { Game } from '../game.js';
import { applyLook, arenaOf } from '../items.js';
import { AI_LOOK, AI_NAME, KIM_ID } from '../match.js';
import { joinRoom } from '../net.js';
import { fireBand } from '../plaza.js';
import { measureWalls } from '../arenaWalls.js';
import { CHAR_Z } from '../scene.js';
import { CHEERS, cheerHooks, cheerState, crowdJoin, crowdLeave, pickCheerTeam, sendCheer } from './cheer.js';
import { INTRO, introHooks } from './intro.js';
import { myId } from './room.js';
import { $, esc, myNemesis, myNick, world } from './state.js';

const JOIN_WAIT = 6000; // 이 안에 경기 소식(방장)이 안 오면 그만
const failed = new Map(); // 경기 코드 → 붙기 실패한 시각 (채널에 들락날락하지 않게)
export const bub = {
  phase: 'off', // off · join(채널 붙는 중, 아직 광장) · in(광장 → 경기장 물결) · inside · out(경기장 → 광장 물결)
  t: -1, r: null, code: '', q: 0, link: null, game: null, members: [], hostM: null, sawHost: false,
  offs: [], live: false, seated: false, score: [0, 0], over: null, joinAt: 0, gone: 0,
};
// 선수 물결 (plaza.md 19장 ⓑ): 경기 시작 = 광장 → 방장 경기장(VS 소개 첫 2초), 끝 = 경기장 → 광장. 그 탁구대 가운데에서.
// 관전자 거품과 같은 효과(불꽃 띠·물건 하나둘). 네트워크는 0 (각자 PC에서, 'go'를 받은 시각 기준)
let mw = { on: false, enter: true, t: -1, q: 0, look: null, env: null, cam: null };
const mwOut = () => mw.on && !mw.enter;
export const bubbleArena = () => bub.phase === 'in' || bub.phase === 'inside' || bub.phase === 'out' || mwOut(); // 경기장을 그리는 중
export const bubbleLook = () => (mwOut() ? mw.look : bubbleArena() || bub.phase === 'join' ? bub.hostM?.look || null : null);
export const bubbleSeated = () => bub.phase === 'inside' && bub.seated;
let view = null;
// plaza.js가 연결: walk(광장 좌표) = 거기로 걷기 (원 안에 들어왔는데 벽 밖이면 방 안으로)
export const bubbleHooks = { walk: null };
const cutMe = new THREE.Vector3();
const myIdRef = () => myId;
// ───── 걸을 수 있는 범위 (경기장 좌표 네모, src/arenaWalls.js) ─────
// 광장 좌표 ↔ 경기장 좌표 (그 탁구대가 원점, plaza.js setFrame과 같은 90° 돌림)
const toA = (t, p) => { const T = PLAZA.tables[t]; return [p[1] - T.z, -(p[0] - T.x)]; };
const toP = (t, a) => { const T = PLAZA.tables[t]; return [T.x - a[1], T.z + a[0]]; };
let wallsOf = null, wallsRoot = null;
function walls() {
  if (!world.arena) return null;
  if (wallsRoot !== world.arena.root) { wallsRoot = world.arena.root; wallsOf = world.arena.walls || measureWalls(world.arena.root); }
  return wallsOf;
}
const PLAY = { x: 1.7, z: CHAR_Z + 0.9 }; // 선수가 치는 자리 (관전자는 못 들어감)
const inRect = (a, w, pad = 0) => a[0] > w.x0 + pad && a[0] < w.x1 - pad && a[1] > w.z0 + pad && a[1] < w.z1 - pad;
// 걷기 길을 벽에서 자르기: from·to = 광장 좌표. 벽 밖으로 가려 하면 벽 앞까지 + exit(거품을 나감)
export function bubbleClip(from, to) {
  const w = (bub.phase === 'in' || bub.phase === 'inside') && walls(); // 나가는 중엔 자르지 않음
  if (!w) return { to, exit: false };
  const f = toA(bub.t, from);
  let a = toA(bub.t, to);
  // 선수 자리 안이면 그 바깥 가장자리로
  if (Math.abs(a[0]) < PLAY.x && Math.abs(a[1]) < PLAY.z) a = Math.abs(a[0]) / PLAY.x > Math.abs(a[1]) / PLAY.z ? [Math.sign(a[0] || 1) * PLAY.x, a[1]] : [a[0], Math.sign(a[1] || 1) * PLAY.z];
  if (inRect(a, w)) return { to: toP(bub.t, a), exit: false };
  // 벽에 처음 닿는 곳 (from은 안쪽)
  let k = 1;
  for (const [i, lo, hi] of [[0, w.x0, w.x1], [1, w.z0, w.z1]]) {
    const d = a[i] - f[i];
    if (d > 1e-6 && a[i] > hi) k = Math.min(k, (hi - f[i]) / d);
    if (d < -1e-6 && a[i] < lo) k = Math.min(k, (lo - f[i]) / d);
  }
  k = Math.max(0, k - 0.02);
  return { to: toP(bub.t, [f[0] + (a[0] - f[0]) * k, f[1] + (a[1] - f[1]) * k]), exit: true };
}
// 카메라: 경기장 안에서는 벽 바로 안쪽까지만 (높이는 거의 그대로 — 가리는 물건은 투명 구멍으로)
function camClamp(me, cam) {
  const w = walls();
  if (!w) return 1;
  const m = toA(bub.t, me), c = toA(bub.t, cam);
  if (inRect(c, w, -0.4)) return 1;
  let k = 1;
  for (const [i, lo, hi] of [[0, w.x0 - 0.4, w.x1 + 0.4], [1, w.z0 - 0.4, w.z1 + 0.4]]) {
    const d = c[i] - m[i];
    if (d > 1e-6 && c[i] > hi) k = Math.min(k, (hi - m[i]) / d);
    if (d < -1e-6 && c[i] < lo) k = Math.min(k, (lo - m[i]) / d);
  }
  return Math.max(0.3, k);
}
// 벽에 닿아 나감: 다시 8m 밖으로 나갈 때까지 이 경기 거품에 안 들어감
export function bubbleLeave() {
  if (bub.phase === 'off') return;
  bub.block = bub.code;
  beginOut();
}

// 물결 앞 불꽃 띠 + 불티 (세상 원점 = 그 탁구대)
const front = fireBand(0.93, 1.07, 0);
front.visible = false;
world.scene.add(front);
const SPK = 400;
const spkGeo = new THREE.BufferGeometry();
spkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPK * 3), 3));
const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparks.frustumCulled = false; sparks.visible = false;
world.scene.add(sparks);
const spk = Array.from({ length: SPK }, (_, i) => ({ a: (i / SPK) * Math.PI * 2 + Math.sin(i * 7.1), h: Math.sin(i * 3.7) * 0.5 + 0.5, v: 0.6 + (Math.sin(i * 1.3) * 0.5 + 0.5) * 1.6 }));
function fireFront(R, now, on) {
  front.visible = sparks.visible = on && R > 0 && R < 60;
  if (!front.visible) return;
  front.scale.setScalar(Math.max(0.01, R));
  front.material.opacity = Math.max(0, 1 - R / 60);
  const pa = spkGeo.attributes.position;
  for (let i = 0; i < SPK; i++) {
    const s = spk[i], life = (now * s.v + s.h) % 1, r = Math.max(0, R - life * 0.6);
    pa.setXYZ(i, Math.cos(s.a + life * 0.2) * r, life * life * 1.8, Math.sin(s.a + life * 0.2) * r);
  }
  pa.needsUpdate = true;
  sparks.material.opacity = Math.max(0, 1 - R / 50);
}

// 관전 범위 테두리 (11/28 사용자 요청): 원 안에서도 어디까지 걸어 다니며 볼 수 있는지 — 들어올 때 본 불꽃 고리와 같은 무늬.
// 범위 = 벽 네모(walls) ∩ 나가기 원 8m (그 밖을 누르면 광장으로 나감). 세상 원점 = 그 탁구대
const edge = fireBand(0.96, 1.04, 24);
edge.rotation.x = 0; edge.visible = false; edge.material.opacity = 0;
world.scene.add(edge);
bub.edge = edge; // 점검용
let edgeOf = null;
function edgeShape(w) {
  if (edgeOf === w) return;
  edgeOf = w;
  const N = 256, pos = [], uv = [], idx = [];
  let s = 0, prev = null;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let r = BUBBLE_OUT;
    if (w) {
      if (dx > 1e-6) r = Math.min(r, w.x1 / dx); else if (dx < -1e-6) r = Math.min(r, w.x0 / dx);
      if (dz > 1e-6) r = Math.min(r, w.z1 / dz); else if (dz < -1e-6) r = Math.min(r, w.z0 / dz);
    }
    const p = [dx * r, dz * r];
    if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    const u = (s / (Math.PI * 2 * BUBBLE_IN)) * 4; // 들어갈 때 고리와 같은 무늬 간격
    pos.push(dx * (r - 0.45), 0, dz * (r - 0.45), dx * (r + 0.05), 0, dz * (r + 0.05));
    uv.push(u, 0, u, 1);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  edge.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  edge.geometry = g;
}
let edgeT = 0;
function edgeFrame(now, on) {
  const dt = Math.min(0.1, Math.max(0, now - edgeT)); edgeT = now;
  const k = on ? Math.min(1, edge.material.opacity + dt / 0.6) : 0; // 0.6초 동안 나타남
  edge.material.opacity = k;
  edge.visible = k > 0;
  if (!edge.visible) return;
  edgeShape(walls());
  edge.material.map.offset.x = now * 0.06; // 천천히 돎
}

// 관전 경기 화면 글자는 광장 막대로 (경기 화면 #hud는 안 씀)
const quietHud = {
  score(s) { bub.score = [...s]; renderBar(); }, stats() {}, hint() {}, turn() {}, judge() {}, toast() {},
  watchOver(winner, score) { bub.over = { winner, score: [...score] }; bub.score = [...score]; renderBar(); playUI('win'); },
  gameOver() {},
};

// ───── 들어가기 · 나가기 ─────
function start(t, r) {
  stop();
  initAudio();
  Object.assign(bub, { phase: 'join', t, r, code: r.code, q: 0, members: [], hostM: null, sawHost: false, offs: [], live: false, seated: false, score: r.score || [0, 0], over: null, joinAt: performance.now(), gone: 0 });
  const me = { id: myId, nick: myNick(), at: Date.now() };
  const code = r.code;
  bub.link = joinRoom(code, me, {
    onMsg: (m) => { if (bub.code === code) onMsg(m); },
    onMembers: (list) => { if (bub.code === code) onMembers(list); },
    onStatus: () => {},
  }, { listen: true });
  // 관전자 수: 관중석 채널 명단에 들어간다 (선수는 듣기만 → '👀 관중 N명')
  crowdJoin(code, { ...me, team: null, look: myEquip(), title: myTitle(), titleX: myNemesis() });
}
// 경기장 물결 시작 (방장 꾸미기를 알고 배경이 준비되면)
function beginIn() {
  bub.phase = 'in';
  bub.q = 0;
  const pl = bub.r.pl;
  const n = names();
  bub.game = new Game(world, { mySide: 0, mode: bub.r.mode, hud: quietHud, spectator: true, names: n.names, playerNames: n.per, playerTitles: n.tl, looks: [[{}, {}], [{}, {}]], send: { toss() {}, swing() {} } });
  bub.game.view = 'free';
  for (const p of pl) applyLook(world.team[p.side][p.slot], lookOf(p.id));
  world.crowd.setFirstPerson(true); // 관중석의 내 캐릭터는 숨김 (걸어 다니는 내가 나)
  view.setFrame(bub.t);
  view.setCamClamp(camClamp);
  // 원(6m) 안이지만 방(실내 배경) 밖이면 방 안으로 몇 걸음
  const w = walls(), me = bub.mePos && toA(bub.t, bub.mePos);
  if (w && me && !inRect(me, w, 0.2)) bubbleHooks.walk?.(toP(bub.t, [Math.max(w.x0 + 0.6, Math.min(w.x1 - 0.6, me[0])), Math.max(w.z0 + 0.6, Math.min(w.z1 - 0.6, me[1]))]));
  prep();
  renderBar();
  playUI('rare');
}
function beginOut() {
  if (bub.phase === 'out') return;
  if (bub.phase === 'join') { stop(); return; }
  bub.seated = false;
  view.setCamOff(false);
  bub.q = bub.phase === 'in' ? 1 - bub.q : 0; // 들어가던 중이면 그 자리에서 되돌아감
  bub.phase = 'out';
  renderBar();
}
export function stop() {
  if (bub.phase === 'off') return;
  bub.link?.leave();
  bub.link = null;
  crowdLeave();
  if (bub.game) { bub.game.destroy(); bub.game = null; }
  world.crowd.setFirstPerson(false);
  world.crowd.setShown(false);
  world.setBall([0, -9, 0], false);
  world.ring.visible = false; world.aim.visible = false;
  sun.shadow.intensity = 1;
  bub.phase = 'off';
  bub.code = '';
  bub.seated = false;
  view?.setCamOff(false);
  view?.setCamClamp(null);
  view?.setFrame(null);
  view?.setFilter(null);
  view?.setPlazaBits(true);
  if (aw) setCut(aw, false);
  resetWave();
  fireFront(-1, 0, false);
  edgeFrame(0, false);
  renderBar();
}

// ───── 경기 소식 (관전과 같은 방식: 듣기만) ─────
function onMembers(list) {
  bub.members = list;
  const host = list.find((m) => m.host);
  if (host) { bub.sawHost = true; bub.hostM = host; }
  if (bub.game) {
    const n = names();
    bub.game.names = n.names; bub.game.playerNames = n.per; bub.game.playerTitles = n.tl;
    for (const p of bub.r.pl) applyLook(world.team[p.side][p.slot], lookOf(p.id));
  }
  renderBar();
}
const lookOf = (id) => (id === KIM_ID ? AI_LOOK : bub.members.find((m) => m.id === id)?.look || {});
function names() {
  const nick = (id) => (id === KIM_ID ? AI_NAME : bub.members.find((m) => m.id === id)?.nick || '선수');
  const pl = bub.r.pl;
  const per = [[], []], tl = [[], []];
  for (const p of pl) { per[p.side][p.slot] = nick(p.id); const m = bub.members.find((x) => x.id === p.id); tl[p.side][p.slot] = m ? titleText(m.title, m.titleX) : ''; }
  return { names: [0, 1].map((s) => pl.filter((p) => p.side === s).sort((a, b) => a.slot - b.slot).map((p) => nick(p.id)).join('·')), per, tl };
}
function clock(hostT) {
  bub.offs.push(hostT - performance.now() / 1000);
  if (bub.offs.length > 30) bub.offs.shift();
  if (bub.game) bub.game.offset = Math.max(...bub.offs);
}
function onMsg(m) {
  if (!m) return;
  if (m.k === 'pong' && typeof m.th === 'number') { clock(m.th); return; }
  if (m.k !== 'ev' || !m.ev || typeof m.ev !== 'object') return;
  const ev = m.ev;
  if (typeof ev.t === 'number' && (ev.type === 'shot' || ev.type === 'toss')) clock(ev.t);
  if (Array.isArray(ev.score) && ev.score.length === 2) { bub.score = ev.score.map((v) => v | 0); renderBar(); }
  if (!bub.game) return;
  if (!bub.live) {
    if (ev.type !== 'serveReady') return; // 다음 서브부터 그린다
    bub.live = true;
    bub.game.score = [...bub.score];
  }
  bub.game.onEvent(ev);
}

// ───── 물결 (광장 ↔ 경기장) ─────
let pw = null, aw = null, awRoot = null;
function prep() {
  pw = prepWave(world.plaza.root);
  if (awRoot !== world.arena.root) { awRoot = world.arena.root; aw = prepWave(awRoot); }
}
function resetWave() {
  if (pw) applyWave(pw, 1e5, 'off');
  if (aw) applyWave(aw, 1e5, 'off');
  if (world.table) { world.table.scale.setScalar(1); world.table.position.y = 0; }
}
const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// 광장 하늘·빛(plazaSky가 매 프레임 정한 것)과 경기장 하늘·빛을 섞는다. e = 0 광장, 1 경기장
const hemi = world.scene.children.find((o) => o.isHemisphereLight), sun = world.scene.children.find((o) => o.isDirectionalLight);
const C1 = new THREE.Color(), C2 = new THREE.Color();
function mixEnv(e, plazaEnv) {
  const a = world.arena;
  if (!a || !plazaEnv) return;
  const k = ease(Math.min(1, Math.max(0, e)));
  world.scene.background = C1.copy(plazaEnv.bg).lerp(C2.set(a.sky), k).clone();
  world.scene.fog = new THREE.Fog(world.scene.background, plazaEnv.fog[0] + (a.fog[0] - plazaEnv.fog[0]) * k, plazaEnv.fog[1] + (a.fog[1] - plazaEnv.fog[1]) * k);
  hemi.color.copy(plazaEnv.hc).lerp(C2.set(a.light.hemi[0]), k);
  hemi.groundColor.copy(plazaEnv.hg).lerp(C2.set(a.light.hemi[1]), k);
  hemi.intensity = plazaEnv.hi + (a.light.hemi[2] - plazaEnv.hi) * k;
  sun.color.copy(plazaEnv.sc).lerp(C2.set(a.light.sun[0]), k);
  sun.intensity = plazaEnv.si + (a.light.sun[1] - plazaEnv.si) * k;
  if (world.camera.far < 300) { world.camera.far = 300; world.camera.updateProjectionMatrix(); }
}
// 광장 하늘·빛 기억 (광장일 때 매 프레임)
export function rememberPlazaEnv() {
  const s = world.scene;
  return { bg: s.background.clone(), fog: [s.fog?.near ?? 35, s.fog?.far ?? 85], hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, sc: sun.color.clone(), si: sun.intensity };
}

// 물결 한 장면: q = 0~1, enter = 광장 → 경기장(아니면 반대), fire = 불꽃 띠·불티
function drawWave(q, enter, now, env, fire) {
  const R = waveR(q);
  if (pw && aw) {
    applyWave(pw, R, enter ? 'go' : 'come');
    applyWave(aw, R, enter ? 'come' : 'go');
  }
  // 경기장 탁구대도 물결과 함께 (가운데라 제일 먼저)
  if (world.table) {
    const k = Math.min(1, Math.max(0, R / 3));
    const s = enter ? (k > 0 ? back(k) : 0) : 1 - ease(k);
    world.table.visible = s > 0.01;
    world.table.scale.setScalar(Math.max(0.001, s));
  }
  world.plaza.root.visible = !(enter && q >= 1);
  world.arena.root.visible = !(!enter && q >= 1);
  // 물결 중엔 그림자를 잠깐 안 보이게 (줄어드는 물건 그림자가 남지 않게). castShadow를 끄고 켜면 모든 재질을 다시 만들어 화면이 멈춰서(느린 PC) 진하기만 0으로
  sun.shadow.intensity = q >= 1 || q <= 0 ? 1 : 0;
  mixEnv(enter ? q : 1 - q, env);
  fireFront(R, now, fire);
  return R;
}

// ───── 선수 물결 (plaza.md 19장 ⓑ) ─────
const WAVE_LATEST = INTRO.p3; // 늦어도 VS 장면 전에 끝
let lastEnv = null;
const tableOf = (t) => (t === 'kim' ? PLAZA.kim : t == null ? null : PLAZA.tables[t]); // 'kim' = 김제빵 탁구대

// 김제빵 혼자 하기 (19장 ⓓ, 사용자 확정 = 내 배경으로 물결): VS 소개가 없으니 경기 화면 카메라(game.update 다음, main.js)를
// 광장 3인칭 자리에서 이어 준다. 물결·하늘은 선수 물결과 같은 코드
let aiW = null; // { t0 }
export function aiWaveStart() {
  aiW = introHooks.waveStart('kim') ? { t0: performance.now() / 1000 } : null;
}
const fwd = new THREE.Vector3();
export function aiWaveCam(now) {
  if (!aiW) return;
  const ti = now - aiW.t0;
  const wc = introHooks.waveFrame(ti, now);
  if (!wc) { aiW = null; return; }
  const k = ease(Math.min(1, ti / AI_CAM));
  if (k >= 1) return;
  const cam = world.camera, pos = cam.position.toArray();
  fwd.set(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(6).add(cam.position);
  const lp = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
  cam.position.set(...lp(wc.pos, pos));
  cam.position.y += Math.sin(Math.PI * k) * 0.6;
  cam.lookAt(...lp(wc.look, fwd.toArray()));
}
const AI_CAM = 1.1; // 광장 카메라 → 경기 카메라 (초) // 마지막으로 본 광장 하늘·빛 (경기 시작 물결은 광장을 더 안 그리니까)
// 경기 시작: VS 소개가 시작될 때 (intro.js). t = 탁구대 번호. 카메라는 광장 3인칭 자리에서 출발
introHooks.waveStart = (t) => {
  if (!view || !world.plaza || !world.arena || !lastEnv || !tableOf(t) || bub.phase !== 'off') return false;
  if (mw.on) finishWave();
  const cp = view.cam.pos.clone(), cl = view.cam.look.clone(), fov = world.camera.fov;
  view.setFrame(t); // 광장을 그 탁구대가 원점에 오게 돌려 놓음 (경기 좌표)
  const m = world.plaza.root.matrixWorld;
  mw = { on: true, enter: true, t, q: 0, look: null, env: lastEnv, cam: { pos: cp.applyMatrix4(m).toArray(), look: cl.applyMatrix4(m).toArray(), fov } };
  prep();
  document.body.classList.add('mwave');
  playUI('rare');
  return true;
};
// VS 소개 매 프레임: ti = 소개 시작부터 초. 물결 중이면 출발 카메라 { pos, look, fov }를 준다 (끝났으면 null)
// 물결은 프레임마다 조금씩(멈칫해도 건너뛰지 않게 — 처음 그릴 때 그래픽 카드가 잠깐 멈출 수 있음), 늦어도 VS 장면(p3) 전에 끝
introHooks.waveFrame = (ti, now) => {
  if (!mw.on || !mw.enter) return null;
  mw.q = Math.min(1, Math.max(mw.q + Math.min(0.05, now - (mw.last ?? now)) / WAVE_DUR, ti / (WAVE_DUR * 2)));
  mw.last = now;
  if (ti >= WAVE_LATEST) mw.q = 1;
  const q = mw.q;
  drawWave(q, true, now, mw.env, q < 1);
  if (q >= 1) { finishWave(); return null; }
  return mw.cam;
};
introHooks.waveStop = () => { if (mw.on && mw.enter) finishWave(); };
// 경기 끝: 광장으로 돌아올 때 (plaza.js roomHooks.onEnd). look = 그 경기 방장 꾸미기 (물결 동안 그 경기장 그대로)
export function matchWaveOut(t, look) {
  if (mw.on) finishWave();
  if (!view || !world.plaza || !world.arena || !tableOf(t) || bub.phase !== 'off') return;
  mw = { on: true, enter: false, t, q: 0, look, env: null, cam: null, t0: performance.now() / 1000 };
  view.setFrame(t);
  prep();
  playUI('rare');
}
function finishWave() {
  const { enter, env } = mw;
  mw = { on: false, enter: true, t: -1, q: 0, look: null, env: null, cam: null };
  document.body.classList.remove('mwave');
  resetWave();
  fireFront(-1, 0, false);
  sun.shadow.intensity = 1;
  view?.setFrame(null);
  view?.setFilter(null);
  view?.setPlazaBits(true);
  if (enter) { world.plaza.root.visible = false; world.arena.root.visible = true; if (world.table) world.table.visible = true; if (env) mixEnv(1, env); }
}

// ───── 매 프레임 (광장이 보일 때, src/ui/plaza.js plazaFrame) ─────
// me = 내 자리(광장 좌표), busy[t] = 경기 중 정보, ok = 거품에 들어갈 수 있는 상태(광장 채널·탁구대에 안 섬 등), plazaEnv = 광장 하늘·빛
export function bubbleFrame(v, now, dt, me, busy, ok, plazaEnv) {
  view = v;
  // 경기가 끝나 광장으로 돌아오는 물결 (선수): 경기장이 걷히고 광장이 그 탁구대에서부터 다시
  if (mwOut()) {
    // 프레임마다 조금씩 + 느린 PC에서도 늦어도 WAVE_DUR의 2배 안에는 끝나게
    mw.q = Math.min(1, Math.max(mw.q + dt / WAVE_DUR, (now - mw.t0) / (WAVE_DUR * 2)));
    const R = drawWave(mw.q, false, now, plazaEnv, mw.q < 1);
    view.setPlazaBits(mw.q > 0.7);
    const T = tableOf(mw.t);
    view.setFilter((f, p) => Math.hypot(p[0] - T.x, p[1] - T.z) < R); // 광장 사람은 물결이 지나간 곳부터 보임
    for (const side of world.team) for (const c of side) c.group.visible = false; // 경기 캐릭터 대신 광장의 나·사람들
    if (mw.q >= 1) finishWave();
    return;
  }
  if (bub.phase === 'off') lastEnv = plazaEnv; // 광장일 때 하늘·빛 기억 (경기 시작 물결용)
  const dist = (t) => Math.hypot(me[0] - PLAZA.tables[t].x, me[1] - PLAZA.tables[t].z);
  // 들어가기
  bub.mePos = me;
  if (bub.phase === 'off') {
    // 벽에 닿아 나온 경기는 8m 밖으로 한 번 나간 뒤에야 다시 들어감
    if (bub.block && !busy.some((r, t) => r?.code === bub.block && dist(t) < BUBBLE_OUT)) bub.block = '';
    if (!ok) return;
    busy.forEach((r, t) => { if (bub.phase === 'off' && r && r.code !== bub.block && dist(t) < BUBBLE_IN && !(performance.now() - (failed.get(r.code) || -1e9) < 10000)) start(t, r); });
    return;
  }
  const r = busy[bub.t];
  const inside = dist(bub.t) < BUBBLE_OUT;
  // 나가기: 원 밖 / 그 경기가 끝나 선수들이 돌아감(경기 정보가 1.5초 넘게 없음) / 다른 경기로 바뀜
  if (!r || r.code !== bub.code) bub.gone ||= performance.now(); else bub.gone = 0;
  const ended = bub.gone && performance.now() - bub.gone > 1500;
  if (!ok || !inside || ended) beginOut();
  if (bub.phase === 'join') {
    if (performance.now() - bub.joinAt > JOIN_WAIT) { failed.set(bub.code, performance.now()); stop(); return; } // 방장 소식이 없음 → 이 경기는 10초 동안 다시 안 붙음
    // 방장 꾸미기를 알고(배경), 그 배경이 다 지어지면 물결 시작
    // (배경을 못 짓는 경우를 대비해 3.5초 지나면 지금 배경으로라도)
    if (bub.hostM && world.arena && (world.arenaId === (arenaOf(bub.hostM.look) || 'gym') || performance.now() - bub.joinAt > 3500)) beginIn();
    return;
  }
  // 물결
  if (bub.phase === 'in' || bub.phase === 'out') bub.q = Math.min(1, bub.q + dt / WAVE_DUR);
  const enter = bub.phase !== 'out';
  const q = bub.phase === 'inside' ? 1 : bub.q;
  drawWave(q, enter, now, plazaEnv, bub.phase === 'in' || bub.phase === 'out');
  view.setPlazaBits(!(enter && q > 0.3) && !(bub.phase === 'out' && q < 0.7));
  // 원 안에서는 원 안 사람만 보인다 (광장에 있는 사람이 경기장 위에 떠 보이지 않게)
  const T = PLAZA.tables[bub.t];
  view.setFilter((f, p) => Math.hypot(p[0] - T.x, p[1] - T.z) < BUBBLE_OUT + 0.5);
  if (bub.phase === 'in' && bub.q >= 1) { bub.phase = 'inside'; renderBar(); }
  edgeFrame(now, bub.phase === 'inside' && !bub.seated);
  if (bub.phase === 'out' && bub.q >= 1) { stop(); return; }
  // 벽 투명 구멍: 카메라와 내 캐릭터 사이를 가리는 경기장 벽·물건은 그 자리만 뚫어서 (관중석에 앉았을 땐 끔)
  if (aw) {
    const mf = view.figs.get(myIdRef()), on = !bub.seated && !!mf && (bub.phase === 'inside' || bub.phase === 'in');
    if (on) cutMe.set(mf.c.group.position.x, 1.0, mf.c.group.position.z).applyMatrix4(view.root.matrixWorld);
    setCut(aw, on, world.camera.position, cutMe);
  }
  // 경기 그리기 (공·선수·관중석 시점)
  if (bub.game) {
    bub.game.update(now + bub.game.offset);
    for (const side of world.team) for (const c of side) if (c.group.visible) c.tickOutfit(now, dt);
  }
}

// ───── 아래 막대: 점수 · 관전자 수 · 관중석에 앉기 · 응원 ─────
function renderBar() {
  const el = $('pz-bub');
  if (!el) return;
  const on = bub.phase === 'inside' || bub.phase === 'in';
  el.classList.toggle('hidden', !on);
  document.body.classList.toggle('pz-bubble', bubbleArena());
  if (!on) return;
  const n = bub.game ? bub.game.names : names().names;
  const cs = cheerState();
  const result = bub.over ? `<b class="pzb-over">🏆 ${esc(n[bub.over.winner] || '')} 승리!</b>` : '';
  el.innerHTML = `<div class="pzb-top"><span class="pzb-t">${bub.t + 1}번 탁구대</span><span class="pzb-sc"><em class="t0">${esc(n[0] || 'A팀')}</em> <b>${bub.score[0]} : ${bub.score[1]}</b> <em class="t1">${esc(n[1] || 'B팀')}</em></span><span class="pzb-eye">👀 ${cs.n}명</span>${result}</div>`
    + `<div class="pzb-row"><button type="button" class="small pzb-seat" data-bub="seat">${bub.seated ? '🚶 일어나기' : '🪑 관중석에 앉기'}</button>`
    + [0, 1].map((t) => `<button type="button" class="small${cs.team === t ? ' on' : ''}" data-team="${t}">${t ? '💙' : '🧡'}</button>`).join('')
    + Object.entries(CHEERS).map(([k, c]) => `<button type="button" class="small" data-cheer="${k}"${cs.cool ? ' disabled' : ''}>${c.text.slice(0, 2)}</button>`).join('') + '</div>';
}
cheerHooks.game = () => bub.game;
cheerHooks.onList = renderBar;
cheerHooks.onCheer = (id, text) => view?.say(id, text);
$('pz-bub').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.bub === 'seat') { playUI('click'); setSeated(!bub.seated); return; }
  if (b.dataset.team) { playUI('click'); pickCheerTeam(+b.dataset.team); return; }
  if (b.dataset.cheer) sendCheer(b.dataset.cheer);
});
// 관중석에 앉기: 관중석 내 자리 1인칭 (경기 쪽 시점). 바닥을 누르면 일어나서 걷는다
export function setSeated(on) {
  if (bub.phase !== 'inside' || !bub.game) return;
  bub.seated = !!on;
  bub.game.view = on ? 'me' : 'free';
  view.setCamOff(on);
  world.crowd.setShown(on);
  if (!on) world.crowd.setFirstPerson(true);
  renderBar();
}
export const matchWaveDebug = () => mw; // 점검용: 선수 물결 상태
