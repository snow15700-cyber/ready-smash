// 낚시 손맛 시안 (fishing.html) — docs/dev/fishing.md 6장 1단계
// 캠퍼스 시안(campus.html)의 바다 + 전망대 아래 선착장에서:
//   그림자 보기 → 마우스를 위로 휘둘러 던지기(↖ ↑ ↗) → 톡/가짜 풍덩은 참고 진짜 풍덩만 링이 닫힐 때 누르기
//   → (희귀·전설) 짧은 장력 밀당 + 펌핑 링 → 잡기
// 서버·코인·저장 없음(최고 기록만 이 브라우저). 오른쪽 위 ⚙️로 판정 시간·가짜 비율·장력 빠르기·물고기·소리를 바꿔 보며 정한다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import * as THREE from 'three';
import { buildCampus } from '../../campusMock.js';
import { makeCharacter } from '../../scene.js';
import { FISH, GRADE, TUNE, biteSeq, fishSize, pickFish } from './data.js';
import { initSound, setSoundOn, snd, tickSound } from './sound.js';
import { PIER, STAND, buildPier, makeBobber, makeFishModel, makeLine, makeRod, makeShadow, makeSplashes, seaHeight } from './world.js';
import { drawHud } from './hud.js';

const params = new URLSearchParams(location.search);
if (params.get('fish') && FISH[params.get('fish')]) TUNE.fish = params.get('fish');

// ── 3D 장면
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe2f7);
scene.fog = new THREE.Fog(0xcfe8fb, 70, 300);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xfffaf0, 0x9fb08a, 1.5);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
sun.position.set(-8, 40, 40); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 120 });
sun.target.position.set(PIER.x, PIER.y, 62);
scene.add(hemi, sun, sun.target);
const { root, anim } = buildCampus();
scene.add(root);
scene.add(buildPier());
const fx = makeSplashes(scene);

// 나 (탁구채 대신 낚싯대)
const me = makeCharacter('#e0333c');
me.handle.visible = false; me.blade.visible = false;
me.group.rotation.y = Math.PI; // 바다(+z)를 봄
scene.add(me.group);
const rod = makeRod();
rod.root.position.set(0.24, 0.92, -0.12);
me.group.add(rod.root);
const line = makeLine(); scene.add(line.line);
const bobber = makeBobber(); scene.add(bobber);

// ── 상태
const S = {
  mode: 'ready', t: 0, now: 0, holding: false, standX: STAND.x0 ?? PIER.x, walk: 0,
  shadows: [], target: null, pending: null, hint: null,
  cast: null, bob: new THREE.Vector3(), dip: 0, dipV: 0, bobLanded: false,
  seq: [], evI: -1, ev: null, nextEv: 0, approach: 0, calm: 0, // calm = ✨ 참기 개수
  fish: null, size: null, grade: '', jump: null, fight: null, land: null, result: null,
  rodPitch: -0.95, rodPitchV: 0, bend: 0, rodKick: 0, hitstop: 0, slow: 0, shake: 0, flash: 0, cutin: null,
  texts: [], judge: null, sparks: [], snapLine: null, camSide: 0,
};
S.standX = PIER.x;
window.__fish = { S, TUNE };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DECK = PIER.y + 0.04;

// 기록 (이 브라우저에만)
let best = {}, caught = 0;
try { best = JSON.parse(localStorage.getItem('fishing-best') || '{}'); caught = +(localStorage.getItem('fishing-count') || 0); } catch { /* 저장 안 됨 */ }
const saveRec = () => { try { localStorage.setItem('fishing-best', JSON.stringify(best)); localStorage.setItem('fishing-count', String(caught)); } catch { /* 저장 안 됨 */ } };

// ── 물고기 그림자 3개 (왼쪽·가운데·오른쪽)
function spawnShadow(slot) {
  const f = pickFish();
  const obj = makeShadow(f);
  scene.add(obj);
  const spread = innerWidth < innerHeight ? rnd(2.4, 3.0) : rnd(4.2, 5.6); // 세로 화면은 좁게 (셋 다 보이게)
  const bx = PIER.x + slot * spread, bz = STAND.z + (slot === 0 ? rnd(11, 14) : rnd(8, 11.5));
  return { slot, f, obj, bx, bz, x: bx, z: bz, yaw: rnd(0, Math.PI * 2), ph: rnd(0, 9), flee: 0, alpha: 0 };
}
for (const s of [-1, 0, 1]) S.shadows.push(spawnShadow(s));
function replaceShadow(sh) {
  const i = S.shadows.indexOf(sh);
  setTimeout(() => { scene.remove(sh.obj); S.shadows[i] = spawnShadow(sh.slot); }, 1400);
}

// ── 글자(의성어)·판정
function say(txt, opt = {}) { S.texts.push({ txt, t: 0, life: opt.life ?? 0.9, size: opt.size ?? 34, color: opt.color ?? '#fff', at: opt.at ? opt.at.clone() : null, sx: opt.sx, sy: opt.sy, shake: opt.shake ?? 0, rise: opt.rise ?? 40, key: opt.key }); }
function judge(txt, color = '#fff', sub = '') { S.judge = { txt, color, sub, t: 0 }; }
const bobAbove = (h = 0.6) => S.bob.clone().add(new THREE.Vector3(0, h, 0));

// ── 조작: 누르기/떼기 + 위로 휘두르기 (탁구 스윙과 같은 동작)
const moves = []; window.__moves = moves; // 최근 포인터 위치 { t, x, y }
const nowS = () => performance.now() / 1000;
canvas.addEventListener('pointermove', (e) => { moves.push({ t: nowS(), x: e.clientX, y: e.clientY }); while (moves.length && moves[0].t < nowS() - 0.5) moves.shift(); });
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); moves.push({ t: nowS(), x: e.clientX, y: e.clientY }); press({ x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' }); });
addEventListener('pointerup', () => release());
addEventListener('pointercancel', () => release());
addEventListener('blur', () => release());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); press({ key: true }); }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') S.walk = -1;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') S.walk = 1;
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') release();
  if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) S.walk = 0;
});
for (const b of document.querySelectorAll('#move button')) {
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); S.walk = +b.dataset.d; });
  b.addEventListener('pointerup', () => { S.walk = 0; }); b.addEventListener('pointerleave', () => { S.walk = 0; });
}

function press(p) {
  initSound();
  if (S.holding) return;
  S.holding = true;
  const m = S.mode;
  if (m === 'ready') {
    if (p.key) return castTo(0);
    S.pending = { t: nowS(), x: p.x, y: p.y, touch: p.touch };
  } else if (m === 'result') {
    if (S.t > 0.7) toReady();
  } else if (m === 'wait') pressWait();
  else if (m === 'jump') pressJump();
  else if (m === 'fight') pressFight();
}
function release() { S.holding = false; }

// 누른 뒤 0.1초까지 움직임을 보고 방향을 정함 (탁구: 클릭 직전 0.15초 ~ 직후 0.09초)
function readSwing() {
  const P = S.pending; if (!P) return;
  if (nowS() - P.t < 0.15) return;
  S.pending = null;
  const win = moves.filter((m) => m.t >= P.t - 0.15 && m.t <= P.t + 0.15);
  const a = win[0] || P, b = win[win.length - 1] || P;
  const up = a.y - b.y, dx = b.x - a.x;
  if (up > 14) return castTo(Math.abs(dx) >= up * 0.3 ? Math.sign(dx) : 0);
  if (P.touch) { // 휴대폰: 노리는 그림자를 톡
    let bestS = null, bd = 1e9;
    for (const sh of S.shadows) { const v = new THREE.Vector3(sh.x, seaHeight(sh.x, sh.z, S.now), sh.z).project(camera); const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; const d = Math.hypot(sx - P.x, sy - P.y); if (d < bd) { bd = d; bestS = sh; } }
    if (bestS && bd < Math.max(90, innerWidth * 0.2)) return castAt(bestS);
    S.hint = { txt: '노리는 그림자를 톡 눌러요', t: 0 };
    return;
  }
  S.hint = { txt: '마우스를 누른 채 위로 휘둘러요 ↑', t: 0 };
}

// ── 던지기
function castTo(dir) {
  // 방향(↖ ↑ ↗)에 가장 가까운 그림자
  let bestS = null, bd = 1e9;
  // 바다(+z)를 보므로 화면 오른쪽 = −x
  for (const sh of S.shadows) { const ang = Math.atan2(sh.x - S.standX, sh.z - STAND.z); const d = Math.abs(-ang - dir * 0.38); if (d < bd) { bd = d; bestS = sh; } }
  castAt(bestS);
}
function castAt(sh) {
  S.target = sh;
  S.fish = sh.f;
  const to = new THREE.Vector3(sh.x + (S.standX - sh.x) * 0.12, 0, sh.z - 1.0);
  const from = rod.tip.getWorldPosition(new THREE.Vector3());
  S.cast = { from, to, dur: 0.75 };
  setMode('cast');
  S.rodPitch = 0.35; S.rodPitchV = -9; // 뒤로 젖혔다가 앞으로
  snd.swing();
  say('휙!', { sx: 0.5, sy: 0.62, size: 30, life: 0.6 });
}
function setMode(m) { S.mode = m; S.t = 0; }

function startWait() {
  setMode('wait');
  S.bobLanded = true; S.dip = 0; S.dipV = 0;
  S.seq = biteSeq(S.fish); S.evI = -1; S.ev = null; S.calm = 0;
  S.approach = 1.3; // 그림자가 찌 쪽으로 다가오는 시간
  S.nextEv = S.approach + rnd(0.7, 1.4);
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  fx.burst(S.bob.x, y, S.bob.z, 8, 0.45); snd.land();
  say('퐁', { at: bobAbove(0.4), size: 26, life: 0.6 });
}

// 입질 하나: 링이 나타나 좁혀지고 → 톡 / 잠김(가짜는 0.15초 뒤 튀어 오름) / 잠김 유지(진짜)
function nextEvent() {
  S.evI++;
  const kind = S.seq[S.evI];
  const st = S.t;
  if (kind === 'tok') S.ev = { kind, st, close: st + 0.4, end: st + 0.75 };
  else if (kind === 'fake') S.ev = { kind, st, sink: st + TUNE.lead, pop: st + TUNE.lead + 0.15, end: st + TUNE.lead + 0.55 };
  else S.ev = { kind, st, sink: st + TUNE.lead, close: st + TUNE.lead + TUNE.win };
  S.ev.done = {};
  fx.ring(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 0.9); // 입질 직전 고대비 파동
}

function tickWait(dt) {
  const t = S.t, E = S.ev;
  if (!E && t >= S.nextEv) nextEvent();
  if (!E) return;
  const once = (k, f) => { if (!E.done[k] && t >= E[k]) { E.done[k] = true; f(); } };
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  if (E.kind === 'tok') {
    once('close', () => { S.dipV += 5; snd.tok(); say('톡', { at: bobAbove(0.5), size: 30, color: '#e8f6ff', life: 0.6 }); fx.ring(S.bob.x, y, S.bob.z, 0.5); });
    once('end', () => patience());
  } else if (E.kind === 'fake') {
    once('sink', () => plunge(y));
    once('pop', () => { S.dip = -0.2; S.dipV = -6; snd.popUp(); snd.shatter(); E.broken = t; say('뽁', { at: bobAbove(0.5), size: 30, color: '#ffe14a', life: 0.6 }); fx.burst(S.bob.x, y, S.bob.z, 6, 0.4); });
    once('end', () => patience());
  } else {
    once('sink', () => plunge(y));
    if (t > E.close + TUNE.good) fail('late');
  }
}
function plunge(y) { // 가짜와 진짜가 똑같은 순간 (기획서: 잠기는 순간까지 똑같다)
  S.dip = 1; S.dipV = 0;
  snd.plunge();
  say('풍덩!', { at: bobAbove(0.7), size: 46, color: '#ffffff', life: 0.8, shake: 3 });
  fx.burst(S.bob.x, y, S.bob.z, 16, 0.8);
  S.shake = Math.max(S.shake, 4);
}
function patience() {
  S.calm++;
  snd.patience();
  judge('✨ Perfect 참기!', '#ffe14a');
  S.ev = null;
  if (S.evI < S.seq.length - 1) S.nextEv = S.t + rnd(0.9, 1.7);
}
function pressWait() {
  const E = S.ev, t = S.t;
  if (E && E.kind === 'real' && t >= E.sink) {
    const d = t - E.close;
    const g = Math.abs(d) <= TUNE.perfect ? 'Perfect' : Math.abs(d) <= TUNE.good ? 'Good' : 'Bad';
    return hook(g);
  }
  if (E && (E.kind === 'tok' || E.kind === 'fake')) return fail('fooled');
  fail('early');
}

// ── 챔질
function hook(g) {
  S.grade = g;
  S.size = fishSize(S.fish);
  S.hitstop = 0.06; S.shake = 12; S.flash = g === 'Perfect' ? 0.7 : 0.4; S.rodKick = 1;
  snd.hook(g);
  const col = g === 'Perfect' ? '#ffb02e' : g === 'Good' ? '#7fe3a0' : '#c9d3e0';
  judge(g === 'Perfect' ? 'PERFECT!' : g === 'Good' ? 'GOOD' : 'BAD', col, g === 'Bad' ? '물고기가 펄쩍! 한 번 더' : '');
  say('탁!', { at: bobAbove(0.8), size: 52, color: col, life: 0.6, shake: 5 });
  fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 22, 1);
  if (g === 'Bad') return startJump();
  afterHook();
}
function afterHook() {
  if (S.fish.fight) startFight();
  else startLand();
}

// ── Bad일 때: 물고기가 물 위로 펄쩍 (링이 닫힐 때 누르기, 두 번 놓치면 도망)
function startJump() {
  setMode('jump');
  S.jump = { n: 0, miss: 0, st: 0.5, model: S.jump?.model };
  if (!S.jump.model) { S.jump.model = makeFishModel(S.fish); scene.add(S.jump.model); }
  S.jump.model.visible = false;
}
function tickJump() {
  const J = S.jump, t = S.t - J.st;
  const dur = 0.9;
  const M = J.model;
  if (t < 0) { M.visible = false; return; }
  const k = t / dur;
  const y0 = seaHeight(S.bob.x, S.bob.z, S.now);
  M.visible = k < 1;
  const sc = 0.6 + S.size.k * 0.9;
  M.scale.setScalar(sc);
  M.position.set(S.bob.x + (k - 0.5) * 1.2, y0 + Math.sin(Math.min(1, k) * Math.PI) * 1.8 - 0.2, S.bob.z);
  M.rotation.set(0, 0, (0.5 - k) * 1.8);
  if (!J.out && t > 0) { J.out = true; fx.burst(S.bob.x, y0, S.bob.z, 14, 0.8); snd.splash(0.8); say('첨벙!', { at: bobAbove(1), size: 34, life: 0.6 }); }
  J.close = J.st + dur * 0.5; // 꼭대기에서 링이 닫힘
  if (S.t > J.close + TUNE.good && !J.hit) {
    J.miss++;
    say('놓쳤다!', { at: bobAbove(1.2), size: 30, color: '#ff8a8a', life: 0.7 });
    S.shake = 6;
    if (J.miss >= 2) return fail('jump');
    J.st = S.t + 0.7; J.out = false; J.hit = false; J.close = 0;
  }
}
function pressJump() {
  const J = S.jump;
  if (!J.close || S.t < J.st) return;
  const d = S.t - J.close;
  if (Math.abs(d) <= TUNE.good) {
    J.hit = true; J.model.visible = false;
    S.hitstop = 0.06; S.shake = 10; snd.hook('Good');
    say('탁!', { at: bobAbove(1), size: 52, color: '#7fe3a0', life: 0.6, shake: 5 });
    fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 18, 0.9);
    afterHook();
  }
}

// ── 줄다리기 (희귀·전설): 누르면 감기(장력↑ 거리↓) · 떼면 풀기(장력↓ 물고기가 멀어짐) · 펌핑 링 = 떼었다 다시 누르기
function startFight() {
  setMode('fight');
  const F = S.fish.fight;
  S.fight = { dist: 1, T: 0.3, pull: 0, rush: false, rushT: 0.9, dir: 1, ox: 0, pump: null, nextPump: 1.6, reelAcc: 0, dragAcc: 0, F, pumps: 0, onoT: 0 };
  S.cutin = { t: 0, txt: S.fish.grade === 'legend' ? '✨ 전설 ✨' : '희귀!', sub: S.fish.name, color: GRADE[S.fish.grade].color };
}
function tickFight(dt) {
  const Fi = S.fight, F = Fi.F, t = S.t;
  if (t < 0.9) { Fi.T += (0.35 - Fi.T) * dt * 3; return; } // 집중선 컷인 동안
  Fi.rushT -= dt;
  if (Fi.rushT <= 0) {
    Fi.rush = !Fi.rush;
    if (Fi.rush) { Fi.rushT = rnd(...F.rush); Fi.dir = Fi.ox > 1.8 ? -1 : Fi.ox < -1.8 ? 1 : Math.random() < 0.5 ? -1 : 1; fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 10, 0.7); snd.splash(0.6); say(Fi.dir < 0 ? '◀ 휙!' : '휙! ▶', { at: bobAbove(0.9), size: 30, life: 0.6 }); }
    else Fi.rushT = rnd(...F.rest);
  }
  const want = Fi.rush ? F.pull : F.pull * 0.22;
  Fi.pull += (want - Fi.pull) * Math.min(1, dt * 8);
  const prev = Fi.dist;
  if (S.holding) {
    Fi.T += (0.3 + Fi.pull * 0.85 - Fi.T) * Math.min(1, dt * 1.7 * TUNE.tension);
    Fi.dist -= dt * 0.085 * (1 - Fi.pull * 0.65);
  } else {
    Fi.T += (Fi.pull * 0.3 - Fi.T) * Math.min(1, dt * 3);
    Fi.dist += dt * Fi.pull * 0.07;
  }
  if (Fi.rush) Fi.ox = clamp(Fi.ox + Fi.dir * Fi.pull * 1.6 * dt, -3.2, 3.2);
  else Fi.ox *= 1 - dt * 0.3;
  // 펌핑 링: 찌 쪽에서 낚싯줄을 타고 대 끝 표시까지 (1초)
  if (!Fi.pump && t >= Fi.nextPump) Fi.pump = { st: t, arrive: t + 1.0 };
  if (Fi.pump && t > Fi.pump.arrive + 0.2) { say('펌핑 놓침', { sx: 0.82, sy: 0.3, size: 20, color: '#c9d3e0', life: 0.6 }); Fi.pump = null; Fi.nextPump = t + rnd(0.9, 1.4); }
  // 소리·의성어
  const dd = Fi.dist - prev;
  if (dd < 0) { Fi.reelAcc += -dd * 140; while (Fi.reelAcc >= 1) { Fi.reelAcc--; snd.reel(); } }
  else { Fi.dragAcc += dd * 300; while (Fi.dragAcc >= 1) { Fi.dragAcc--; snd.drag(); } }
  Fi.onoT -= dt;
  if (Fi.onoT <= 0) {
    if (Fi.T >= 0.8) { say('끼이익!', { sx: 0.5, sy: 0.24, size: 44 + (Fi.T - 0.8) * 120, color: '#ff4a3a', life: 0.42, shake: 6, rise: 0, key: 'creak' }); Fi.onoT = 0.35; }
    else if (S.holding && dd < 0) { say('드르륵!', { sx: 0.2 + Math.random() * 0.06, sy: 0.7, size: 26, color: '#e8f6ff', life: 0.5, rise: 20 }); Fi.onoT = 0.55; }
  }
  if (Fi.T >= 0.8) for (let i = 0; i < 2; i++) S.sparks.push({ k: Math.random(), vx: rnd(-80, 80), vy: rnd(-140, -40), life: rnd(0.2, 0.4), x: null, y: null });
  S.shake = Math.max(S.shake, Fi.pull * (S.holding ? 3 : 1.5) + (Fi.T > 0.8 ? (Fi.T - 0.8) * 20 : 0));
  if (Fi.T >= 1) return fail('snap');
  if (Fi.dist > 1.3) return fail('far');
  if (Fi.dist <= 0) startLand();
}
function pressFight() {
  const Fi = S.fight;
  if (!Fi.pump || S.t < 0.9) return;
  const d = S.t - Fi.pump.arrive;
  if (d < -0.35) return; // 아직 멀었음 → 그냥 감기
  const ok = Math.abs(d) <= 0.13, perfect = Math.abs(d) <= 0.06;
  if (ok) {
    Fi.dist -= Fi.F.pump * (perfect ? 1.25 : 1);
    Fi.T = Math.max(0, Fi.T - 0.3);
    Fi.pumps++;
    S.rodKick = 1; S.shake = 9; S.hitstop = 0.04;
    snd.pump(perfect);
    say(perfect ? '쭈우욱!' : '쭈욱!', { sx: 0.5, sy: 0.34, size: perfect ? 56 : 46, color: perfect ? '#ffb02e' : '#7fe3a0', life: 0.6, shake: 4 });
    fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 10, 0.6);
  } else say('아깝다', { sx: 0.5, sy: 0.34, size: 28, color: '#c9d3e0', life: 0.5 });
  Fi.pump = null; Fi.nextPump = S.t + rnd(1.3, 2.0);
}

// ── 잡기: 물 밖으로 들어 올림 (처음 0.2초 느린 동작 + 물방울) → 이름·cm 도장 '쾅'
function startLand() {
  setMode('land');
  const M = S.jump?.model || makeFishModel(S.fish);
  if (!M.parent) scene.add(M);
  S.jump = { model: M };
  M.visible = true;
  M.scale.setScalar(0.6 + S.size.k * 0.9);
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  S.land = { from: new THREE.Vector3(S.bob.x, y, S.bob.z), stamped: false };
  S.slow = 0.2;
  fx.burst(S.bob.x, y, S.bob.z, 30, 1.3); snd.splash(1.2);
  say('촤아악!', { at: bobAbove(1.2), size: 40, life: 0.8 });
}
function tickLand() {
  const L = S.land, M = S.jump.model;
  const k = clamp(S.t / 1.0, 0, 1), e = 1 - (1 - k) ** 3;
  const to = new THREE.Vector3(S.standX - 0.3, DECK + 1.9, STAND.z + 1.6);
  M.position.lerpVectors(L.from, to, e); M.position.y += Math.sin(k * Math.PI) * 2.2;
  M.rotation.set(Math.sin(S.t * 25) * 0.25 * (1 - k), Math.PI / 2 + 0.5, Math.sin(S.t * 18) * 0.4 * (1 - k));
  if (!L.stamped && S.t > 1.0) {
    L.stamped = true;
    snd.stamp(); S.shake = 8;
    S.stamp = { t: 0, txt: `${S.fish.name} ${S.size.cm}cm` };
    snd.win(S.fish.grade === 'legend');
  }
  if (S.t > 1.9) finishCatch();
}
function finishCatch() {
  const f = S.fish;
  caught++;
  const rec = !best[f.id] || S.size.cm > best[f.id];
  if (rec) best[f.id] = S.size.cm;
  saveRec();
  S.jump.model.visible = false; S.bobLanded = false;
  S.result = { ok: true, fish: f, cm: S.size.cm, grade: S.grade, calm: S.calm, rec, best: best[f.id], allCalm: S.calm > 0 && S.grade === 'Perfect' };
  setMode('result');
  S.target.flee = 1; replaceShadow(S.target);
}

const FAIL = {
  early: ['너무 빨랐어요!', '찌가 잠기기 전에 눌렀어요'],
  fooled: ['가짜에 속았어요!', '톡 · 가짜 풍덩(다시 튀어 오름)은 참아요'],
  late: ['놓쳤어요…', '진짜 풍덩은 링이 닫힐 때 눌러요'],
  jump: ['도망갔어요…', '펄쩍 뛸 때 링이 닫히면 눌러요'],
  snap: ['줄이 끊어졌어요!', '끼이익! 빨개지면 손을 떼요'],
  far: ['너무 멀어졌어요…', '오래 손을 떼고 있으면 도망가요'],
};
function fail(kind) {
  if (kind === 'snap') { snd.snap(); S.flash = 1; S.shake = 16; S.rodKick = -1; S.snapLine = { t: 0 }; say('팅!', { sx: 0.5, sy: 0.3, size: 64, color: '#fff', life: 0.7, shake: 6 }); }
  else snd.miss();
  S.result = { ok: false, title: FAIL[kind][0], sub: FAIL[kind][1], fish: S.fish, calm: S.calm };
  if (S.jump?.model) S.jump.model.visible = false;
  setMode('result');
  S.ev = null;
  if (S.target) { S.target.flee = 1; replaceShadow(S.target); }
}
function toReady() {
  setMode('ready');
  S.result = null; S.fight = null; S.land = null; S.stamp = null; S.cutin = null; S.bobLanded = false; S.snapLine = null; S.target = null; S.ev = null;
  if (S.jump?.model) scene.remove(S.jump.model);
  S.jump = null;
}

// ── 매 프레임
const tipW = new THREE.Vector3();
function update(dt, rdt) {
  S.t += dt; S.now += dt;
  readSwing();
  if (S.hint) { S.hint.t += rdt; if (S.hint.t > 2) S.hint = null; }
  if (S.mode === 'ready' && S.walk) { S.standX = clamp(S.standX + S.walk * 2.4 * dt, STAND.xMin, STAND.xMax); }
  me.group.position.set(S.standX, DECK, STAND.z);
  // 그림자: 천천히 헤엄
  for (const sh of S.shadows) {
    sh.alpha = Math.min(1, sh.alpha + dt * 0.8);
    if (sh.flee) { sh.flee += dt; sh.z += dt * 6; sh.alpha = Math.max(0, 1 - sh.flee); }
    else if (sh === S.target && S.mode === 'wait') { // 찌 쪽으로 다가옴
      const k = Math.min(1, dt * 2);
      sh.x += (S.bob.x + 0.5 - sh.x) * k; sh.z += (S.bob.z + 0.35 - sh.z) * k;
      sh.yaw += (Math.atan2(S.bob.z - sh.z, S.bob.x - sh.x) * -1 - sh.yaw) * k;
    } else if (sh === S.target && (S.mode === 'fight' || S.mode === 'jump')) { sh.alpha = 0; }
    else { sh.ph += dt * 0.4; sh.x = sh.bx + Math.sin(sh.ph) * 0.9; sh.z = sh.bz + Math.sin(sh.ph * 0.7) * 0.6; sh.yaw = -Math.atan2(Math.cos(sh.ph * 0.7) * 0.42, Math.cos(sh.ph) * 0.9); }
    const y = seaHeight(sh.x, sh.z, S.now) + 0.06;
    sh.obj.position.set(sh.x, y, sh.z); sh.obj.rotation.y = sh.yaw;
    sh.obj.userData.plane.material.opacity = 0.6 * sh.alpha;
    if (sh.obj.userData.glint) sh.obj.userData.glint.material.opacity = (0.2 + 0.2 * Math.sin(S.now * 4 + sh.ph)) * sh.alpha;
  }
  // 모드별
  if (S.mode === 'cast') {
    const C = S.cast, k = clamp(S.t / C.dur, 0, 1);
    S.bob.lerpVectors(C.from, C.to, k);
    const yTo = seaHeight(C.to.x, C.to.z, S.now) + 0.05;
    S.bob.y = C.from.y + (yTo - C.from.y) * k + Math.sin(k * Math.PI) * 3.2;
    if (k >= 1) startWait();
  } else if (S.mode === 'wait') tickWait(dt);
  else if (S.mode === 'jump') tickJump();
  else if (S.mode === 'fight') tickFight(dt);
  else if (S.mode === 'land') tickLand();

  // 찌 위치: 물결 + 잠김
  if (S.mode === 'fight' && S.fight) {
    const Fi = S.fight;
    const base = S.target ? new THREE.Vector3(S.target.bx, 0, S.target.bz - 1) : S.bob;
    S.bob.x = S.standX + (base.x + Fi.ox - S.standX) * Math.max(0.05, Fi.dist);
    S.bob.z = STAND.z + 1.2 + (base.z - STAND.z - 1.2) * Math.max(0.05, Fi.dist);
  }
  if (S.bobLanded && S.mode !== 'cast') {
    if (S.ev?.kind === 'real' && S.ev.done.sink) S.dip += (1 - S.dip) * Math.min(1, dt * 10);
    else if (S.mode === 'fight' || S.mode === 'jump' || S.mode === 'land') S.dip = 1;
    else { S.dipV += (-S.dip * 260 - S.dipV * 13) * dt; S.dip += S.dipV * dt; }
    S.bob.y = seaHeight(S.bob.x, S.bob.z, S.now) + 0.03 - S.dip * 0.2;
  }
  bobber.visible = S.mode !== 'ready' && !(S.mode === 'result' && S.snapLine);
  bobber.position.copy(S.bob);
  if (S.mode === 'ready' || (S.mode === 'result' && !S.bobLanded)) bobber.visible = false;

  // 낚싯대: 젖히기 스프링 + 장력만큼 휨
  const pitch0 = S.mode === 'fight' ? -0.7 : S.mode === 'ready' ? -0.95 : -1.05;
  S.rodPitchV += ((pitch0 - S.rodPitch) * 140 - S.rodPitchV * 11) * rdt;
  S.rodPitch += S.rodPitchV * rdt;
  const T = S.fight ? S.fight.T : 0;
  const wantBend = S.mode === 'fight' ? T : S.mode === 'jump' ? 0.5 : S.mode === 'land' ? 0.7 * (1 - clamp(S.t, 0, 1)) : (S.ev?.done?.sink && !S.ev.broken) ? 0.25 : 0.05;
  S.bend += (wantBend - S.bend) * Math.min(1, rdt * 10);
  S.rodKick *= 1 - Math.min(1, rdt * 6);
  const jit = S.mode === 'fight' && T > 0.4 ? (Math.sin(S.now * 70) + Math.sin(S.now * 113)) * (T - 0.4) * 6 : 0;
  rod.pose(S.rodPitch + S.rodKick * 0.35, clamp(S.bend + Math.max(0, S.rodKick) * 0.3, -0.3, 1.2), S.fight ? clamp(S.fight.ox / 3, -1, 1) : 0, jit);
  if (S.fight && S.holding) rod.reelHandle.rotation.x -= rdt * 18;
  me.group.updateMatrixWorld(true);
  rod.tip.getWorldPosition(tipW);

  // 줄
  const showLine = S.mode !== 'ready' && !S.snapLine && !(S.mode === 'result' && !S.bobLanded);
  line.line.visible = showLine || !!S.snapLine;
  if (S.snapLine) { // 끊어진 줄이 튕겨 올라갔다가 늘어짐
    S.snapLine.t += rdt;
    const k = S.snapLine.t;
    line.set(tipW, tipW.clone().add(new THREE.Vector3(-0.4 + k * 0.2, 0.9 - k * 2.4, -0.5)), 0.2, 0, S.now);
    line.mat.color.set(0xffffff);
  } else if (showLine) {
    const to = S.mode === 'land' ? S.jump.model.position : S.bob.clone().add(new THREE.Vector3(0, 0.12, 0));
    const tight = S.mode === 'fight' ? T : S.mode === 'land' || S.mode === 'jump' ? 0.8 : S.ev?.done?.sink && !S.ev.broken ? 0.6 : 0;
    const len = tipW.distanceTo(to);
    const vib = S.mode === 'fight' ? T * S.fight.pull * 0.05 : 0;
    line.set(tipW, to, (1 - tight) * Math.min(1.4, len * 0.12), vib, S.now);
    // 장력 색: 0~40 흰·파랑 / 41~79 노랑·주황 / 80~ 빨강 깜빡
    if (S.mode === 'fight') {
      if (T < 0.41) line.mat.color.set(0xd8ecff);
      else if (T < 0.8) line.mat.color.setHSL(0.14 - (T - 0.41) * 0.18, 1, 0.58);
      else line.mat.color.set(Math.sin(S.now * 30) > 0 ? 0xff2d2d : 0xffd0d0);
    } else line.mat.color.set(0xffffff);
  }

  // 물보라·효과
  fx.update(dt);
  S.shake = Math.max(0, S.shake - rdt * 30);
  S.flash = Math.max(0, S.flash - rdt * 4);
  for (const x of S.texts) x.t += rdt;
  S.texts = S.texts.filter((x) => x.t < x.life);
  if (S.judge) { S.judge.t += rdt; if (S.judge.t > 1.1) S.judge = null; }
  if (S.cutin) S.cutin.t += rdt;
  if (S.stamp) S.stamp.t += rdt;
  for (const s of S.sparks) s.life -= rdt;
  S.sparks = S.sparks.filter((s) => s.life > 0);
  tickSound(S.now, S.mode === 'fight' ? T : 0);
}

// ── 카메라: 어깨 높이 (사용자 확정 11/25) — 캐릭터 오른쪽 뒤, 바다를 봄. 물고기가 옆으로 도망치면 살짝 끌려감
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function placeCamera() {
  const side = S.fight && S.mode === 'fight' ? clamp(S.fight.ox, -3, 3) : 0;
  S.camSide += (side - S.camSide) * 0.05;
  camPos.set(S.standX + 0.95, DECK + 2.15, STAND.z - 3.0);
  const lookZ = S.mode === 'land' ? STAND.z + 7 : STAND.z + 11;
  camLook.set(S.standX - 0.4 + S.camSide * 0.9, -11.6, lookZ);
  if (S.shake > 0) { camPos.x += (Math.random() - 0.5) * S.shake * 0.012; camPos.y += (Math.random() - 0.5) * S.shake * 0.012; }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ── 그리기 루프
const hud = document.getElementById('hud');
const hg = hud.getContext('2d');
function resize() {
  const w = innerWidth, h = innerHeight, d = Math.min(2, devicePixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 72 : 55; camera.updateProjectionMatrix();
  hud.width = w * d; hud.height = h * d; hg.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

let last = performance.now();
renderer.setAnimationLoop((ms) => {
  const rdt = Math.min(0.05, (ms - last) / 1000); last = ms; // 탭이 숨겨지면 프레임이 멈춤 → 입질도 멈춤(돌아오면 이어서)
  let dt = rdt;
  if (S.hitstop > 0) { S.hitstop -= rdt; dt = 0; } // 챔질 순간 멈춤 '탁!'
  else if (S.slow > 0) { S.slow -= rdt; dt = rdt * 0.3; } // 잡는 순간 느린 동작
  update(dt, rdt);
  for (const f of anim) f(S.now);
  placeCamera();
  renderer.render(scene, camera);
  drawHud(hg, innerWidth, innerHeight, { S, TUNE, camera, tipW, caught, best });
});

// ── ⚙️ 시험 설정
const panel = document.getElementById('panel');
document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
for (const el of [panel, document.getElementById('gear')]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
const sync = () => panel.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(TUNE[b.dataset.k]) === b.dataset.v));
panel.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  TUNE[k] = k === 'fish' ? v : k === 'sound' ? v === 'true' : +v;
  if (k === 'sound') { initSound(); setSoundOn(TUNE.sound); }
  if (k === 'fish') for (const sh of S.shadows) if (sh !== S.target) { scene.remove(sh.obj); S.shadows[S.shadows.indexOf(sh)] = spawnShadow(sh.slot); }
  sync();
});
sync();
setInterval(() => document.getElementById('move').classList.toggle('hide', S.mode !== 'ready'), 200);
