// 낚시 손맛 시안 — 리듬 방식 (docs/dev/fishing.md 8장, 11/25 사용자 확정)
//   던지기: 3방향 고정 + 끌어올리는 속도로 거리 3단계 → 기포(모두가 같은 곳) 가까이면 희귀·전설 ↑
//   입질: 톡(약한 떨림) · 가짜 풍덩(약한 떨림 2~3번)은 참고, 진짜는 찌가 쏙 + '!' + 강한 떨림 → 빨리 누르기
//   줄다리기: 화면 가운데 기본 원에 줄어드는 원이 닿을 때 누르기(박자에 맞춰 연속) → 거리 게이지
// 서버·코인·저장 없음(최고 기록만 이 브라우저). 오른쪽 위 ⚙️로 판정 시간·가짜 비율·기포·물고기·소리를 바꿔 보며 정한다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import * as THREE from 'three';
import { buildCampus } from '../../campusMock.js';
import { makeCharacter } from '../../scene.js';
import { FISH, GRADE, TUNE, biteSeq, fishSize, pickFish } from './data.js';
import { activeBubbles, bubbleNear } from './bubbles.js';
import { audioCtx, initSound, setSoundOn, snd, tickSound } from './sound.js';
import { makePhrase, makeSong, playBeat, playFinish, playMelody } from './rhythm.js';
import { PIER, STAND, buildPier, landingPoint, makeBobber, makeBubbleFx, makeFishModel, makeLine, makeRod, makeSplashes, seaHeight } from './world.js';
import { drawHud, zoomRect } from './hud.js';

const params = new URLSearchParams(location.search);
if (params.get('fish') && FISH[params.get('fish')]) TUNE.fish = params.get('fish');
if (params.get('bubbles')) TUNE.bubbles = params.get('bubbles');

// ── 3D 장면 (캠퍼스 시안 + 선착장)
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe2f7);
scene.fog = new THREE.Fog(0xcfe8fb, 70, 300);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
const zoomCam = new THREE.PerspectiveCamera(30, 1, 0.05, 200); // 찌 확대 창
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
const bubbleFx = makeBubbleFx(scene, fx);

// 나 (탁구채 대신 낚싯대)
const me = makeCharacter('#e0333c');
me.handle.visible = false; me.blade.visible = false;
me.group.rotation.y = Math.PI; // 바다(+z)를 봄
scene.add(me.group);
const rod = makeRod();
rod.root.position.set(0.24, 0.92, -0.12);
me.group.add(rod.root);
rod.root.traverse((o) => { if (o.isMesh) o.userData.keepOp = true; }); // 캐릭터가 반투명해도 낚싯대는 또렷하게
const line = makeLine(); scene.add(line.line);
const bobber = makeBobber(); scene.add(bobber);

// ── 상태
const S = {
  mode: 'ready', t: 0, now: 0, holding: false, standX: PIER.x, walk: 0,
  drag: null, power: 0, hint: null, aim: { dir: 0 },
  cast: null, bob: new THREE.Vector3(), dip: 0, dipV: 0, bobLanded: false, near: 0,
  seq: [], evI: -1, ev: null, nextEv: 0, calm: 0, alertT: -1,
  fish: null, size: null, grade: '', R: null, land: null, result: null, model: null,
  rodPitch: -0.95, rodPitchV: 0, bend: 0, rodKick: 0, hitstop: 0, slow: 0, shake: 0, zshake: 0, flash: 0, cutin: null, stamp: null,
  texts: [], judge: null, bubbles: [], bubbleNote: null, seenBubbles: new Set(),
};
window.__fish = { S, TUNE, cast: (dir, tier) => { initSound(); castTo(dir, tier); }, rt: () => (S.R ? nowS() - S.R.base : 0) };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DECK = PIER.y + 0.04;
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* 진동 없음 */ } };

// 기록 (이 브라우저에만)
let best = {}, caught = 0;
try { best = JSON.parse(localStorage.getItem('fishing-best') || '{}'); caught = +(localStorage.getItem('fishing-count') || 0); } catch { /* 저장 안 됨 */ }
const saveRec = () => { try { localStorage.setItem('fishing-best', JSON.stringify(best)); localStorage.setItem('fishing-count', String(caught)); } catch { /* 저장 안 됨 */ } };

// ── 글자·판정
function say(txt, opt = {}) { S.texts.push({ txt, t: 0, life: opt.life ?? 0.9, size: opt.size ?? 34, color: opt.color ?? '#fff', at: opt.at ? opt.at.clone() : null, sx: opt.sx, sy: opt.sy, zoom: opt.zoom, shake: opt.shake ?? 0, rise: opt.rise ?? 40 }); }
function judge(txt, color = '#fff', sub = '') { S.judge = { txt, color, sub, t: 0 }; }
const bobAbove = (h = 0.6) => S.bob.clone().add(new THREE.Vector3(0, h, 0));

// ── 조작: 누르기/떼기 + 끌어올리기(던지기)
const nowS = () => performance.now() / 1000;
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press({ x: e.clientX, y: e.clientY }); });
addEventListener('pointermove', (e) => moveDrag(e.clientX, e.clientY));
addEventListener('pointerup', (e) => release(e.clientX, e.clientY));
addEventListener('pointercancel', () => { S.drag = null; release(); });
addEventListener('blur', () => { S.drag = null; release(); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'ready') { initSound(); castTo(0, 1); } else press({ key: true }); }
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
  if (m === 'ready' && !p.key) { S.drag = { pts: [{ t: nowS(), x: p.x, y: p.y }], x0: p.x, y0: p.y }; S.power = 0; }
  else if (m === 'result') { if (S.t > 0.7) toReady(); }
  else if (m === 'wait') pressWait();
  else if (m === 'fight') pressNote();
}
function release(x, y) {
  S.holding = false;
  if (S.drag && S.mode === 'ready') {
    if (x !== undefined) moveDrag(x, y);
    const D = S.drag; S.drag = null;
    const last = D.pts[D.pts.length - 1];
    const up = D.y0 - last.y, dx = last.x - D.x0;
    if (up < 25) { S.hint = { txt: '누른 채 위로 끌어올려요 ↑ (빠를수록 멀리)', t: 0 }; S.power = 0; return; }
    castTo(Math.abs(dx) >= up * 0.3 ? Math.sign(dx) : 0, tierOf(S.power));
  }
}
// 끌어올리는 속도: 최근 0.12초 동안 위로 움직인 거리 ÷ 화면 높이 (초당). 끄는 동안 가장 빨랐던 값 → 세기 3칸
function moveDrag(x, y) {
  const D = S.drag; if (!D) return;
  const t = nowS();
  D.pts.push({ t, x, y });
  const old = D.pts.find((p) => p.t >= t - 0.12) || D.pts[0];
  const dt = Math.max(0.016, t - old.t);
  const v = (old.y - y) / innerHeight / dt;
  S.power = Math.max(S.power, clamp(v / 3, 0, 1));
  const dx = x - D.x0, up = D.y0 - y;
  S.aim.dir = up > 10 && Math.abs(dx) >= up * 0.3 ? Math.sign(dx) : 0;
}
const tierOf = (p) => (p < 0.34 ? 0 : p < 0.72 ? 1 : 2);

// ── 던지기
function castTo(dir, tier) {
  if (S.mode !== 'ready') return;
  const p = landingPoint(S.standX, dir, tier);
  const to = new THREE.Vector3(p.x, 0, p.z);
  const from = rod.tip.getWorldPosition(new THREE.Vector3());
  S.cast = { from, to, dur: 0.55 + tier * 0.15, dir, tier };
  S.near = bubbleNear(p.x, p.z, S.bubbles); // 던지는 순간 기포 가까운지
  setMode('cast');
  S.rodPitch = 0.35; S.rodPitchV = -9;
  snd.swing();
  say(['살짝', '휙!', '휘익—!'][tier], { sx: 0.5, sy: 0.62, size: 28 + tier * 6, life: 0.6 });
}
function setMode(m) { S.mode = m; S.t = 0; }

function startWait() {
  setMode('wait');
  S.bobLanded = true; S.dip = 0; S.dipV = 0;
  S.fish = pickFish(S.near);
  S.seq = biteSeq(S.fish); S.evI = -1; S.ev = null; S.calm = 0; S.alertT = -1;
  S.nextEv = rnd(1.4, 2.4);
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  fx.burst(S.bob.x, y, S.bob.z, 8, 0.45); snd.land();
  say('퐁', { at: bobAbove(0.9), size: 26, life: 0.6 });
  if (S.near) say(S.near === 2 ? '🫧 기포 바로 위!' : '🫧 기포 근처', { sx: 0.5, sy: 0.3, size: 30, color: '#bff3ff', life: 1.4 });
}

// 입질: 톡(약한 떨림 1번) · 가짜 풍덩(약한 떨림 2~3번) · 진짜(쏙 잠기고 '!' + 강한 떨림)
function nextEvent() {
  S.evI++;
  const kind = S.seq[S.evI], st = S.t;
  if (kind === 'tok') S.ev = { kind, st, hits: [st], end: st + 0.45 };
  else if (kind === 'fake') { const n = Math.random() < 0.5 ? 2 : 3; S.ev = { kind, st, hits: Array.from({ length: n }, (_, i) => st + i * 0.17), end: st + n * 0.17 + 0.4 }; }
  else S.ev = { kind, st, end: st + TUNE.good };
  S.ev.done = 0;
}
function tickWait() {
  const t = S.t, E = S.ev;
  if (!E && t >= S.nextEv) return nextEvent();
  if (!E) return;
  if (E.kind === 'real') {
    if (!E.fired) {
      E.fired = true; S.alertT = 0;
      snd.alert(); buzz(220);
      S.shake = 9; S.zshake = 14;
      const y = seaHeight(S.bob.x, S.bob.z, S.now);
      fx.burst(S.bob.x, y, S.bob.z, 14, 0.7);
    }
    if (t > E.end) fail('late');
    return;
  }
  while (E.done < E.hits.length && t >= E.hits[E.done]) { // 약한 떨림 하나
    E.done++;
    S.dipV += E.kind === 'tok' ? 2.2 : 3;
    S.zshake = Math.max(S.zshake, 4);
    if (E.kind === 'tok') { snd.tok(); buzz(15); say('톡', { zoom: true, size: 26, color: '#e8f6ff', life: 0.5 }); }
    else { snd.wiggle(); buzz(18); if (E.done === 1) say('꿈틀꿈틀', { zoom: true, size: 24, color: '#ffe9a8', life: 0.7 }); }
  }
  if (t >= E.end) { S.calm++; say('참기 ✨', { zoom: true, size: 20, color: '#ffe14a', life: 0.7, rise: 25 }); S.ev = null; S.nextEv = t + rnd(0.9, 1.8); }
}
function pressWait() {
  const E = S.ev;
  if (E && E.kind === 'real' && E.fired) {
    const rt = S.t - E.st;
    return hook(rt <= TUNE.perfect ? 'Perfect' : 'Good', rt);
  }
  if (E || S.evI >= 0) return fail('fooled');
  fail('early');
}

// ── 챔질 → 리듬 줄다리기
function hook(g, rt) {
  S.grade = g;
  S.size = fishSize(S.fish);
  S.hitstop = 0.06; S.shake = 12; S.flash = g === 'Perfect' ? 0.7 : 0.4; S.rodKick = 1; S.alertT = -1;
  snd.hook(g); buzz(60);
  const col = g === 'Perfect' ? '#ffb02e' : '#7fe3a0';
  judge(g === 'Perfect' ? 'PERFECT!' : 'GOOD', col, `${rt.toFixed(2)}초`);
  say('탁!', { at: bobAbove(1), size: 52, color: col, life: 0.6, shake: 5 });
  fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 22, 1);
  startRhythm();
}

// 리듬 (fishing.md 8장): 박자·패턴·음악은 rhythm.js가 한 마리마다·구절(4마디)마다 새로 조립 (반복 안 되게)
// 시간은 진짜 시계(performance.now)로 잼 — 음악(오디오 시각)과 어긋나지 않고, 누른 순간을 정확히 잼.
// 원은 2박 동안 줄어듦(마지막 큰 노트는 3박). 거리 게이지 0~100, 60에서 시작: Good −g · Perfect −1.4g · Miss +1.2g
// (g = 60 ÷ (기준 노트 수 × 0.9)). 0 = 잡음 · 100 = 도망. 한 번만 더 맞추면 잡힐 때 → 마지막 큰 노트(맞추면 바로 잡힘)
const rtNow = () => nowS() - S.R.base;
function startRhythm() {
  setMode('fight');
  const f = S.fish, song = makeSong(f);
  const spb = 60 / song.bpm;
  const lead = f.grade === 'common' ? 0.5 : 1.0; // 희귀·전설은 집중선 컷인 뒤
  const g = 60 / (f.notes * 0.9);
  S.R = {
    song, spb, base: nowS(), t0: lead + 4 * spb, // 첫 노트 구절의 첫 박 (그 전 1마디는 음악만 — 들어가는 마디)
    queue: [], phrases: 0, notes: [], dist: 60, g, m: g * 1.2, lastBeat: -99, sched: -4, pulse: 0, side: 1,
    hits: 0, perfects: 0, misses: 0, fin: null, aOff: 0, bump: 0, tilt: 0, reel: 0, slack: 0, burst: null,
  };
  const ac = audioCtx(); if (ac) S.R.aOff = ac.currentTime - nowS();
  fillQueue();
  if (f.grade !== 'common') S.cutin = { t: 0, txt: f.grade === 'legend' ? '✨ 전설 ✨' : '희귀!', sub: f.name, color: GRADE[f.grade].color };
  // 맞출 때 물 위로 살짝 튀는 물고기
  S.model = makeFishModel(f); S.model.visible = false; S.model.scale.setScalar(0.6 + S.size.k * 0.9); scene.add(S.model);
}
const beatT = (b) => S.R.t0 + b * S.R.spb;
function fillQueue() { // 앞으로 2구절치 노트 시각을 늘 준비
  const R = S.R;
  while (R.queue.length < 12) { for (const x of makePhrase(R.song)) R.queue.push({ beat: R.phrases * 16 + x }); R.phrases++; }
}
function tickRhythm(rdt) {
  const R = S.R, rt = rtNow(), spb = R.spb;
  // 음악: 0.25초 앞까지 박마다 미리 걸어 둠 (오디오 시각)
  while (beatT(R.sched) < rt + 0.25) { playBeat(R.song, R.sched, R.aOff + R.base + beatT(R.sched), spb); R.sched++; }
  // 노트 내보내기 (마지막 큰 노트를 기다리는 동안은 멈춤)
  if (!R.fin) {
    fillQueue();
    while (R.queue.length) {
      const q = R.queue[0], t = beatT(q.beat);
      if (t < rt + 0.05) { R.queue.shift(); continue; } // 이미 지난 박(큰 노트를 놓친 뒤)
      const pending = R.notes.filter((n) => !n.res).length;
      const fin = R.dist - R.g * pending <= R.g * 1.02;
      const appr = (fin ? 3 : 2) * spb;
      if (t - appr > rt) break;
      R.queue.shift();
      const n = { t, beat: q.beat, appr, res: null, fin };
      R.notes.push(n);
      if (fin) { R.fin = n; say('마지막!', { sx: 0.5, sy: 0.4, size: 40, color: '#ffd23a', life: spb * 2, rise: 0, shake: 2 }); break; }
    }
  }
  // 박자: 기본 원·낚싯대 '두근' (소리는 음악이 냄)
  const beat = Math.floor((rt - R.t0) / spb + 1e-6);
  if (rt >= R.t0 - 4 * spb && beat !== R.lastBeat) {
    R.lastBeat = beat;
    R.pulse = 1; S.rodKick = Math.max(S.rodKick, 0.2);
    if (beat === -2) say('준비', { sx: 0.5, sy: 0.4, size: 34, life: spb * 0.9, rise: 0 });
    if (beat === -1) say('시작!', { sx: 0.5, sy: 0.4, size: 34, life: spb * 0.9, rise: 0 });
  }
  R.pulse = Math.max(0, R.pulse - rdt / (spb * 0.5));
  for (const n of R.notes) if (!n.res && rt > n.t + TUNE.noteG) noteResult(n, 'Miss');
  R.notes = R.notes.filter((n) => !n.res || rt - n.at < 0.5);
  // 손맛 연출 줄어들기
  R.bump = Math.max(0, R.bump - rdt * 8); R.tilt *= 1 - Math.min(1, rdt * 4); R.reel *= 1 - Math.min(1, rdt * 3); R.slack = Math.max(0, R.slack - rdt * 1.5);
  if (R.burst) { R.burst.t += rdt; if (R.burst.t > 0.5) R.burst = null; }
  if (R.dist >= 100) fail('far');
}
function pressNote() {
  const R = S.R; if (!R) return;
  const rt = rtNow();
  let near = null, bd = 1e9;
  for (const n of R.notes) if (!n.res) { const d = Math.abs(rt - n.t); if (d < bd) { bd = d; near = n; } }
  if (!near || bd > 0.25) return; // 노트가 멀면 무시 (마구 눌러도 손해·이득 없음)
  noteResult(near, bd <= TUNE.noteP ? 'Perfect' : bd <= TUNE.noteG ? 'Good' : 'Miss');
}
function noteResult(n, res) {
  const R = S.R;
  n.res = res; n.at = rtNow();
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  if (n.fin) R.fin = null;
  if (res === 'Miss') {
    // 놓침: 릴이 '지이익' 거꾸로 · 줄이 늘어짐 · 화면이 살짝 기울었다 돌아옴
    R.dist = Math.min(100, R.dist + R.m); R.misses++;
    snd.noteMiss(); S.shake = Math.max(S.shake, 5); S.rodKick = -0.7;
    R.reel = -1; R.slack = 1; R.tilt = R.side;
    say('지이익…', { at: bobAbove(0.8), size: 28, color: '#c9d3e0', life: 0.7, shake: 2 });
    buzz(30);
    return;
  }
  const p = res === 'Perfect';
  R.hits++; if (p) R.perfects++;
  playMelody(R.song, n.beat, p); // 내가 누른 소리가 멜로디가 됨
  if (n.fin) { // 마지막 큰 노트: 크게 당겨 바로 잡음
    R.dist = 0; playFinish(R.song);
    S.hitstop = 0.08; S.flash = 0.8; S.shake = 14; S.rodPitchV += 10; R.bump = 2; R.burst = { t: 0, p: true, big: true };
    say(p ? '영차—!! ✨' : '영차—!!', { sx: 0.5, sy: 0.4, size: 56, color: '#ffd23a', life: 0.8, shake: 5 });
    buzz([60, 30, 120]);
    return startLand();
  }
  // 맞춤: 낚싯대를 '휙' 들어 올림 · 물고기가 살짝 튐 · 화면이 순간 확대 · Perfect는 원이 터지며 불꽃
  R.dist = Math.max(1, R.dist - R.g * (p ? 1.4 : 1));
  S.rodPitchV += p ? 7 : 5; S.rodKick = 1; S.shake = Math.max(S.shake, p ? 6 : 4);
  R.bump = p ? 1.3 : 0.8; R.reel = 1; R.burst = { t: 0, p };
  R.side = -R.side;
  S.hop = { t: 0, h: p ? 0.9 : 0.5 };
  fx.burst(S.bob.x, y, S.bob.z, p ? 14 : 8, p ? 0.9 : 0.6);
  buzz(p ? 25 : 15);
}

// ── 잡기: 물 밖으로 들어 올림 (처음 0.2초 느린 동작 + 물방울) → 이름·cm 도장 '쾅'
function startLand() {
  setMode('land');
  if (!S.model) { S.model = makeFishModel(S.fish); scene.add(S.model); }
  const M = S.model; M.visible = true;
  M.scale.setScalar(0.6 + S.size.k * 0.9);
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  S.land = { from: new THREE.Vector3(S.bob.x, y, S.bob.z), stamped: false };
  S.slow = 0.2; S.hop = null;
  fx.burst(S.bob.x, y, S.bob.z, 30, 1.3); snd.splash(1.2); buzz([30, 40, 80]);
  say('촤아악!', { at: bobAbove(1.2), size: 40, life: 0.8 });
}
function tickLand() {
  const L = S.land, M = S.model;
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
  const f = S.fish, R = S.R;
  caught++;
  const rec = !best[f.id] || S.size.cm > best[f.id];
  if (rec) best[f.id] = S.size.cm;
  saveRec();
  S.model.visible = false; S.bobLanded = false;
  S.result = { ok: true, fish: f, cm: S.size.cm, grade: S.grade, calm: S.calm, rec, best: best[f.id], perfects: R.perfects, hits: R.hits, misses: R.misses, near: S.near };
  setMode('result');
}

const FAIL = {
  early: ['너무 빨랐어요!', '입질이 오기 전에 눌렀어요'],
  fooled: ['가짜에 속았어요!', "톡·꿈틀은 참고, '!'가 뜨면 눌러요"],
  late: ['놓쳤어요…', "'!'가 뜨면 바로 눌러요"],
  far: ['도망갔어요…', '원이 기본 원에 닿을 때 눌러요'],
};
function fail(kind) {
  snd.miss();
  S.result = { ok: false, title: FAIL[kind][0], sub: FAIL[kind][1], fish: kind === 'far' || kind === 'late' ? S.fish : null };
  setMode('result');
  S.ev = null; S.alertT = -1;
}
function toReady() {
  setMode('ready');
  S.result = null; S.R = null; S.land = null; S.stamp = null; S.cutin = null; S.bobLanded = false; S.ev = null; S.power = 0;
  if (S.model) { scene.remove(S.model); S.model = null; }
}

// ── 매 프레임
const tipW = new THREE.Vector3();
function update(dt, rdt) {
  S.t += dt; S.now += dt;
  if (S.hint) { S.hint.t += rdt; if (S.hint.t > 2.2) S.hint = null; }
  if (S.mode === 'ready' && S.walk) S.standX = clamp(S.standX + S.walk * 2.4 * dt, STAND.xMin, STAND.xMax);
  me.group.position.set(S.standX, DECK, STAND.z);
  me.setOpacity(S.mode === 'ready' ? 1 : 0.4, 1); // 낚시하는 동안 내 캐릭터 반투명 (내 화면에서만, 사용자 요청)
  if (S.R) S.R.rt = rtNow();
  if (S.mode === 'ready' && !S.drag) S.power = Math.max(0, S.power - rdt * 0.8);

  // 기포 (모두가 같은 곳 — 시각으로 정함)
  S.bubbles = activeBubbles(Date.now() / 1000, TUNE.bubbles);
  for (const b of S.bubbles) if (!S.seenBubbles.has(b.id)) { S.seenBubbles.add(b.id); S.bubbleNote = { t: 0 }; }
  if (S.bubbleNote) { S.bubbleNote.t += rdt; if (S.bubbleNote.t > 3) S.bubbleNote = null; }
  bubbleFx.update(S.bubbles, S.now, rdt, seaHeight);

  if (S.mode === 'cast') {
    const C = S.cast, k = clamp(S.t / C.dur, 0, 1);
    S.bob.lerpVectors(C.from, C.to, k);
    const yTo = seaHeight(C.to.x, C.to.z, S.now);
    S.bob.y = C.from.y + (yTo - C.from.y) * k + Math.sin(k * Math.PI) * (2.4 + C.tier * 1.2);
    if (k >= 1) startWait();
  } else if (S.mode === 'wait') tickWait();
  else if (S.mode === 'fight') tickRhythm(rdt);
  else if (S.mode === 'land') tickLand();

  // 줄다리기: 거리 게이지만큼 찌가 선착장 쪽으로, 노트마다 좌우로 휙
  if (S.mode === 'fight' && S.R) {
    const R = S.R, k = clamp(R.dist / 60, 0.06, 1.5);
    const L0 = S.cast.to;
    const tx = S.standX + (L0.x - S.standX) * k + R.side * 0.6 * k, tz = STAND.z + 1.4 + (L0.z - STAND.z - 1.4) * k;
    S.bob.x += (tx - S.bob.x) * Math.min(1, rdt * 6); S.bob.z += (tz - S.bob.z) * Math.min(1, rdt * 6);
  }
  // 찌: 물결 + 떨림(스프링) + 진짜는 쏙 잠김
  if (S.bobLanded && S.mode !== 'cast') {
    if ((S.ev?.kind === 'real' && S.ev.fired) || S.mode === 'fight' || S.mode === 'land') S.dip += (1 - S.dip) * Math.min(1, dt * 14);
    else { S.dipV += (-S.dip * 300 - S.dipV * 14) * dt; S.dip += S.dipV * dt; }
    S.bob.y = seaHeight(S.bob.x, S.bob.z, S.now) - S.dip * 0.95; // 1 = 막대 끝까지 물속
  }
  bobber.visible = S.mode === 'cast' || (S.bobLanded && S.mode !== 'result');
  bobber.position.copy(S.bob);
  bobber.rotation.set(Math.sin(S.now * 1.3) * 0.08 + S.dipV * 0.01, 0, Math.cos(S.now * 1.1) * 0.08);
  bobber.userData.glow.material.opacity = 0.6 + 0.4 * Math.sin(S.now * 5);

  // 낚싯대: 젖히기 스프링 + 휨(박자마다 '두근')
  const pitch0 = S.mode === 'fight' ? -0.75 : S.mode === 'ready' ? -0.95 : -1.05;
  S.rodPitchV += ((pitch0 - S.rodPitch) * 140 - S.rodPitchV * 11) * rdt;
  S.rodPitch += S.rodPitchV * rdt;
  const wantBend = S.mode === 'fight' ? 0.45 : S.mode === 'land' ? 0.7 * (1 - clamp(S.t, 0, 1)) : (S.ev?.kind === 'real' && S.ev.fired) ? 0.4 : 0.05;
  S.bend += (wantBend - S.bend) * Math.min(1, rdt * 10);
  S.rodKick *= 1 - Math.min(1, rdt * 7);
  rod.pose(S.rodPitch + S.rodKick * 0.25, clamp(S.bend + S.rodKick * 0.35, -0.3, 1.2), S.R ? S.R.side * 0.3 : 0, 0);
  if (S.mode === 'fight' && S.R) rod.reelHandle.rotation.x -= rdt * (6 + S.R.reel * 30); // 맞추면 빨리 감기 · 놓치면 거꾸로 '지이익'
  // 맞출 때 물고기가 물 위로 살짝 튐
  if (S.hop && S.model) {
    S.hop.t += rdt;
    const k = S.hop.t / 0.4;
    S.model.visible = k < 1;
    if (k < 1) {
      S.model.position.set(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now) - 0.2 + Math.sin(k * Math.PI) * S.hop.h, S.bob.z);
      S.model.rotation.set(0, Math.PI / 2 + (S.R ? S.R.side : 1) * 0.6, (0.5 - k) * 1.4);
    } else S.hop = null;
  }
  me.group.updateMatrixWorld(true);
  rod.tip.getWorldPosition(tipW);

  // 줄 (찌 막대 위쪽 끝에 묶임)
  const showLine = S.mode !== 'ready' && !(S.mode === 'result' && !S.bobLanded);
  line.line.visible = showLine;
  if (showLine) {
    const to = S.mode === 'land' ? S.model.position : S.bob.clone().add(new THREE.Vector3(0, 0.8, 0));
    const tight = S.mode === 'fight' ? 0.85 : S.mode === 'land' ? 0.8 : (S.ev?.kind === 'real' && S.ev.fired) ? 0.6 : 0;
    const slack = S.mode === 'fight' && S.R ? S.R.slack * 1.2 : 0; // 놓치면 줄이 늘어짐
    line.set(tipW, to, (1 - tight) * Math.min(1.4, tipW.distanceTo(to) * 0.12) + slack, S.mode === 'fight' ? S.rodKick * 0.04 : 0, S.now);
  }

  fx.update(dt);
  S.shake = Math.max(0, S.shake - rdt * 30);
  S.zshake = Math.max(0, S.zshake - rdt * 40);
  S.flash = Math.max(0, S.flash - rdt * 4);
  if (S.alertT >= 0) S.alertT += rdt;
  for (const x of S.texts) x.t += rdt;
  S.texts = S.texts.filter((x) => x.t < x.life);
  if (S.judge) { S.judge.t += rdt; if (S.judge.t > 1.1) S.judge = null; }
  if (S.cutin) S.cutin.t += rdt;
  if (S.stamp) S.stamp.t += rdt;
  tickSound(S.now, 0);
}

// ── 카메라: 어깨 높이 (사용자 확정 11/25)
function placeCamera() {
  camera.position.set(S.standX + 0.95, DECK + 2.15, STAND.z - 3.0);
  if (S.shake > 0) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.012; camera.position.y += (Math.random() - 0.5) * S.shake * 0.012; }
  camera.lookAt(S.standX - 0.4, -11.6, S.mode === 'land' ? STAND.z + 7 : STAND.z + 11);
  // 맞추면 순간 확대(bump) · 놓치면 살짝 기울기(tilt)
  const R = S.mode === 'fight' ? S.R : null;
  camera.rotateZ(R ? R.tilt * 0.035 : 0);
  const fov = (innerWidth < innerHeight ? 72 : 55) * (1 - (R ? R.bump : 0) * 0.025);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
// 찌 확대 창 카메라: 찌 자리의 물 높이를 따라 오르내려서, 파도가 있어도 창 안에서 찌가 제자리 → 잠기는 게 또렷
const zoomOn = () => S.bobLanded && S.mode === 'wait';
function placeZoomCam() {
  const y = seaHeight(S.bob.x, S.bob.z, S.now);
  const dx = S.standX - S.bob.x, dz = STAND.z - S.bob.z, len = Math.hypot(dx, dz) || 1;
  const j = S.zshake * 0.004;
  zoomCam.position.set(S.bob.x + (dx / len) * 2.6 + (Math.random() - 0.5) * j, y + 0.55 + (Math.random() - 0.5) * j, S.bob.z + (dz / len) * 2.6);
  zoomCam.lookAt(S.bob.x, y + 0.3, S.bob.z);
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
  const W = innerWidth, H = innerHeight;
  renderer.setViewport(0, 0, W, H);
  renderer.render(scene, camera);
  if (zoomOn()) { // 오른쪽 아래 동그란 찌 확대 창 (동그란 테두리는 hud.js가 그림)
    const z = zoomRect(W, H);
    placeZoomCam();
    zoomCam.aspect = 1; zoomCam.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setScissor(z.x, H - z.y - z.s, z.s, z.s); renderer.setViewport(z.x, H - z.y - z.s, z.s, z.s);
    renderer.render(scene, zoomCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }
  drawHud(hg, W, H, { S, TUNE, camera, zoomCam, zoom: zoomOn(), caught });
});

// 탭이 숨겨지면 리듬 시계도 멈췄다가 돌아오면 이어서 (진짜 시계라 따로 밀어 줌)
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = nowS();
  else if (S.R && hiddenAt) { const d = nowS() - hiddenAt; S.R.base += d; S.R.sched = Math.max(S.R.sched, Math.floor((rtNow() - S.R.t0) / S.R.spb) + 1); }
});

// ── ⚙️ 시험 설정
const panel = document.getElementById('panel');
document.getElementById('gear').addEventListener('click', () => panel.classList.toggle('open'));
for (const el of [panel, document.getElementById('gear')]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
const sync = () => panel.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(TUNE[b.dataset.k]) === b.dataset.v));
panel.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  TUNE[k] = k === 'fish' || k === 'bubbles' ? v : k === 'sound' ? v === 'true' : +v;
  if (k === 'sound') { initSound(); setSoundOn(TUNE.sound); }
  sync();
});
sync();
setInterval(() => document.getElementById('move').classList.toggle('hide', S.mode !== 'ready'), 200);
