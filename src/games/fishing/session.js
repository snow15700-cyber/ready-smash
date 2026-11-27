// 낚시 한 판의 규칙·연출 (시안 fishing.html과 광장이 같이 씀) — docs/dev/fishing.md 8~12장
//   던지기: 끌어올린 방향(부채꼴 ±40°) + 끌어올리는 속도로 거리(6~18m), 떨어질 자리 표시가 따라옴 → 기포(모두가 같은 곳) 가까이면 희귀·전설 ↑
//   입질: 톡(약한 떨림) · 가짜 풍덩(약한 떨림 2~3번)은 참고, 진짜는 찌가 쏙 + '!' + 강한 떨림 → 빨리 누르기
//   줄다리기: 화면 가운데 기본 원에 줄어드는 원이 닿을 때 누르기(박자에 맞춰 연속) → 거리 게이지
//   등급 숨기기: 누구나 일반 리듬으로 시작, 희귀·전설이면 마지막 큰 노트 뒤 "무겁다!" → 리듬이 한 단계씩 올라감. 잡을 때 공개
// createFishing(opt): 장면·카메라는 부르는 쪽 것. 화면 그리기·입력 연결도 부르는 쪽(page.js · ui/fishing.js)
//   opt = { scene, camera, isOnline(), rainNow(), clock() 서버 시각 ms, canWalk, onEvent(ev), viewH() }
//   onEvent: { k: 'cast', to: [x, z] } · { k: 'bite' } · { k: 'catch', c, cm, grade } · { k: 'miss' } · { k: 'ready' }
import * as THREE from 'three';
import { makeCharacter } from '../../scene.js';
import { FISH, GRADE, STAGES, STAGE_FISH, TUNE, biteSeq, pickCatch, stageOf } from './data.js';
import { addPaddle, dexOpen, fishCount, modelImage, openDex, ownedPaddles, recordCatch } from './dex.js';
import { BIG_CM, CATCH, LEGEND_PADDLES, PADDLE_DUP_PIECES, STAND, activeBubbles, bubbleNear, clampStand, cmOfScore, fishSize, isNight, landingPoint, luckDice, modelScale, sizeTier, walkStand } from './rules.js';
import { PIER, SEA_Y } from '../../campusLayout.js';
import { fishCast, fishFinish } from '../../account.js';
import { ACH } from '../../achievements.js';
import { makeModel } from './models.js';
import { ITEM, makePaddle, paddleImage } from '../../items.js';
import { breakAt } from '../../breaks.js';
import { audioCtx, audioLag, initSound, quietSound, snd, tickSound } from './sound.js';
import { makePhrase, makeSong, playBeat, playFinish, playMelody } from './rhythm.js';
import { makeBobber, makeBubbleFx, makeFishModel, makeLine, makeRod, makeSplashes, seaHeight } from './world.js';
import { drawHud, zoomRect } from './hud.js';
import { BEAT } from './beat.js';
import { makeBeatFx } from './beatFx.js';

export { TUNE, openDex, dexOpen, initSound };

export function createFishing(opt) {
  const { scene, camera } = opt;
  const isOn = () => !!opt.isOnline?.();
  const rainNow = () => (TUNE.cond === 'rain') || !!opt.rainNow?.();
  const clock = () => (opt.clock ? opt.clock() : Date.now());
  const emit = (ev) => { try { opt.onEvent?.(ev); } catch (e) { console.warn(e); } };
  const zoomCam = new THREE.PerspectiveCamera(30, 1, 0.05, 200); // 찌 확대 창
  const fx = makeSplashes(scene);
  const bubbleFx = makeBubbleFx(scene, fx);
  const beatFx = makeBeatFx(scene); // 주변이 박자를 탐 (시안, ⚙️)

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
    mode: 'ready', camLook: new THREE.Vector3(), t: 0, now: 0, holding: false, standX: 13, standZ: STAND.z, walk: 0,
    drag: null, power: 0, hint: null, aim: 0,
    cast: null, bob: new THREE.Vector3(), dip: 0, dipV: 0, bobLanded: false, near: 0,
    seq: [], evI: -1, ev: null, nextEv: 0, calm: 0, alertT: -1,
    fish: null, stage: 0, size: null, grade: '', R: null, land: null, result: null, model: null,
    rodPitch: -0.95, rodPitchV: 0, bend: 0, camK: 0, rodKick: 0, hitstop: 0, slow: 0, shake: 0, zshake: 0, flash: 0, cutin: null, stamp: null,
    texts: [], judge: null, bubbles: [], bubbleNote: null, seenBubbles: new Set(),
  };
  // 디버그: 리듬 없이 바로 잡기 연출 (점검·스크린샷용). 이름은 점검 스크립트가 씀
  const fakeRhythm = () => ({ perfects: 6, hits: 6, misses: 0, slack: 0, dist: 0, tilt: 0, bump: 0, reel: 0, notes: [], base: nowS(), t0: 0, spb: 0.6, side: 1 });
  const fakeCast = () => { // 준비 → 가운데로 바로 던진 것처럼 + 물고기·크기 정하기
    const p = landingPoint(S.standX, 0, 0.5, S.standZ);
    S.bob.set(p.x, 0, p.z); S.bobLanded = true;
    S.fish = pickCatch(0, catchCtx()); S.size = rollSize(); S.grade = 'Perfect';
    return p;
  };
  const dbg = {
    S, TUNE, openDex,
    // landNow = 던진 뒤(입질 기다리는 중) 바로 잡기 — 서버 연결 점검용
    landNow: () => { if (S.mode !== 'wait' || !S.fish) return false; S.size = S.srvSize || rollSize(); S.grade = 'Perfect'; S.R = fakeRhythm(); startLand(); return true; },
    online: () => isOn(),
    catchNow: () => { if (S.mode !== 'ready') return; fakeCast(); S.R = fakeRhythm(); startLand(); },
    fightNow: () => { if (S.mode !== 'ready') return; const p = fakeCast(); S.cast = { to: new THREE.Vector3(p.x, 0, p.z) }; startRhythm(); },
    hit: () => pressNote(),
    stageUp: () => S.mode === 'fight' && S.stage < 2 && stageUp(),
    cast: (aim = 0, power = 0.5) => { initSound(); castTo(aim, power); },
    rt: () => (S.R ? nowS() - S.R.base : 0),
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DECK = PIER.y + 0.04;
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* 진동 없음 */ } };

  // 기록은 도감(dex.js, 이 브라우저에만). 조건 물고기: 실제 쉬는 시간·밤(한국 시각 19~6시), 비는 ⚙️로만 시험
  // 로그인돼 있으면(같은 브라우저에서 게임에 로그인) 서버가 정함: 던질 때 fishCast → 잡거나 놓치면 fishFinish (28_fishing.sql)
  let castSeq = 0;
  function adoptServer() { // 던질 때 서버가 정한 것 → 이번 물고기
    const c = S.srv;
    if (!c) return false;
    if (c === 'fail') { S.fish = pickCatch(S.near, catchCtx()); S.srvSize = null; return true; } // 서버가 안 되면 이번 한 번은 이 브라우저에서
    S.castId = c.id; S.near = c.near;
    S.fish = c.kind === 'paddle' ? { kind: 'paddle', id: c.item, name: LEGEND_PADDLES.find(([x]) => x === c.item)?.[1] || c.item, grade: 'rare', emoji: '🏓', dup: !!c.dup } : CATCH[c.item];
    const s = c.s != null ? +c.s : +c.cm; // s = 크기 점수(배율 × 50). 옛 서버(34 전)는 cm = 점수
    S.srvSize = c.kind === 'fish' ? { cm: +c.cm, s } : { cm: 0, s: 0 };
    return true;
  }
  // ⚙️ 크기 시험 (로그인 안 했을 때만): 'random' | 고정 점수(보통 50 = 1배). 서버 없을 때도 초보자 행운 주사위(이 브라우저 도감 기준)
  const rollSize = () => {
    const id = S.fish?.kind === 'fish' ? S.fish.id : null;
    if (TUNE.size !== 'random') { const s = +TUNE.size; return { cm: cmOfScore(id, s), s }; }
    return fishSize(id, luckDice({ caught: fishCount(), dayN: Infinity }));
  };
  function catchCtx() {
    const c = TUNE.cond;
    return { owned: ownedPaddles(), cond: c === 'auto' ? { break: !!breakAt(), night: isNight(Date.now()), rain: false } : { [c]: true } };
  }

  // ── 글자·판정
  function say(txt, opt = {}) { S.texts.push({ txt, t: 0, life: opt.life ?? 0.9, size: opt.size ?? 34, color: opt.color ?? '#fff', at: opt.at ? opt.at.clone() : null, sx: opt.sx, sy: opt.sy, zoom: opt.zoom, shake: opt.shake ?? 0, rise: opt.rise ?? 40 }); }
  function judge(txt, color = '#fff', sub = '') { S.judge = { txt, color, sub, t: 0 }; }
  const bobAbove = (h = 0.6) => S.bob.clone().add(new THREE.Vector3(0, h, 0));

  // ── 조작: 누르기/떼기 + 끌어올리기(던지기)
  const nowS = () => performance.now() / 1000;
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
      castTo(aimOf(dx, up), S.power);
    }
  }
  // 끌어올리는 속도: 최근 0.12초 동안 위로 움직인 거리 ÷ 화면 높이 (초당). 끄는 동안 가장 빨랐던 값 → 세기(0~1, 거리)
  // 방향: 누른 곳에서 지금 손까지의 기울기 → 부채꼴 −1 ~ 1
  function moveDrag(x, y) {
    const D = S.drag; if (!D) return;
    const t = nowS();
    D.pts.push({ t, x, y });
    const prev = D.pts.slice(0, -1); // 지금 점은 빼고 (느린 PC에서 움직임이 띄엄띄엄 와도 속도가 0이 안 되게)
    const old = prev.find((p) => p.t >= t - 0.12) || prev[prev.length - 1] || D.pts[0];
    const dt = Math.max(0.016, t - old.t);
    const v = (old.y - y) / (opt.viewH?.() || innerHeight) / dt;
    S.power = Math.max(S.power, clamp(v / 3, 0, 1));
    const dx = x - D.x0, up = D.y0 - y;
    if (up > 10) S.aim = aimOf(dx, up);
  }
  const aimOf = (dx, up) => clamp(Math.atan2(dx, Math.max(1, up)) / 0.7, -1, 1);

  // ── 던지기
  function castTo(aim, power) {
    if (S.mode !== 'ready') return;
    const p = landingPoint(S.standX, aim, power, S.standZ);
    const tier = power < 0.34 ? 0 : power < 0.72 ? 1 : 2; // 글자·소리용
    const to = new THREE.Vector3(p.x, 0, p.z);
    const from = rod.tip.getWorldPosition(new THREE.Vector3());
    S.cast = { from, to, dur: 0.55 + power * 0.3, aim, power };
    S.near = bubbleNear(p.x, p.z, S.bubbles); // 던지는 순간 기포 가까운지
    S.srv = null; S.castId = null; S.srvSize = null;
    if (isOn()) { const id = ++castSeq; fishCast(S.standX, aim, power, rainNow(), S.standZ).then((c) => { if (id === castSeq) S.srv = c || 'fail'; }); }
    setMode('cast');
    emit({ k: 'cast', to: [p.x, p.z] });
    S.rodPitch = 0.35; S.rodPitchV = -9;
    snd.swing();
    say(['살짝', '휙!', '휘익—!'][tier], { sx: 0.5, sy: 0.62, size: 28 + tier * 6, life: 0.6 });
  }
  function setMode(m) { S.mode = m; S.t = 0; }

  function startWait() {
    setMode('wait');
    S.bobLanded = true; S.dip = 0; S.dipV = 0;
    S.fish = isOn() ? null : pickCatch(S.near, catchCtx()); // 로그인: 서버 답이 오면 정해짐 (tickWait)
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
    if (dbg.hold) return; // 점검용: 입질 멈춤
    if (!S.fish && !adoptServer()) { S.nextEv = Math.max(S.nextEv, S.t + 0.3); return; } // 서버 답 기다리는 동안 입질 안 함
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
    S.size = S.srvSize || rollSize();
    S.hitstop = 0.06; S.shake = 12; S.flash = g === 'Perfect' ? 0.7 : 0.4; S.rodKick = 1; S.alertT = -1;
    snd.hook(g); buzz(60);
    const col = g === 'Perfect' ? '#ffb02e' : '#7fe3a0';
    judge(g === 'Perfect' ? 'PERFECT!' : 'GOOD', col, `${rt.toFixed(2)}초`);
    say('탁!', { at: bobAbove(1), size: 52, color: col, life: 0.6, shake: 5 });
    fx.burst(S.bob.x, seaHeight(S.bob.x, S.bob.z, S.now), S.bob.z, 22, 1);
    startRhythm();
    emit({ k: 'hook', g });
  }

  // 리듬 (fishing.md 8장): 박자·패턴·음악은 rhythm.js가 한 마리마다·구절(4마디)마다 새로 조립 (반복 안 되게)
  // 시간은 진짜 시계(performance.now)로 잼 — 음악(오디오 시각)과 어긋나지 않고, 누른 순간을 정확히 잼.
  // 원은 2박 동안 줄어듦(마지막 큰 노트는 3박). 거리 게이지 0~100, 60에서 시작: Good·Perfect 똑같이 −g · Miss +m
  // (11/26 사용자 확정: 길이는 '시간'으로 — 단계마다 secs초 동안 나올 노트를 다 맞추면 마지막 큰 노트.
  //  Perfect는 빨리 끝내지 않고 연출만 더 좋게. m = 처음부터 missOut번 놓치면 도망). 0 = 잡음 · 100 = 도망
  const rtNow = () => nowS() - S.R.base;
  // stage: 0 일반 · 1 희귀 · 2 전설 단계. 단계마다 그 등급의 박자·노트 수·음악(새 조)으로 새로 시작.
  // 두 번째 단계부터는 거리 50에서 (처음 60보다 덜 가혹하게 — 사용자 확정 11/25)
  function startRhythm(stage = 0) {
    setMode('fight');
    const prev = S.R;
    S.stage = stage;
    const f = STAGE_FISH[STAGES[stage]], song = makeSong(f, Math.random, prev?.song.key);
    const spb = 60 / song.bpm;
    // 단계가 오를 때: 0.3초 + 새 단계 음악만 4박 먼저 들려줌(17장, 11/27 사용자 요청 — 예전 2박), "무겁다!"는 짧게 겹침
    const lead = stage === 0 ? 0.5 : 0.3, intro = 4;
    const dist = stage === 0 ? 60 : 50, secs = S.fish?.kind === 'junk' ? 3 : f.secs; // 잡동사니는 짧게 (3초쯤)
    S.R = {
      song, spb, base: nowS(), t0: lead + intro * spb, intro, // 첫 노트 구절의 첫 박 (그 전 intro박은 음악만 — 들어가는 마디)
      queue: [], phrases: 0, notes: [], dist, g: 1, m: (100 - dist) / f.missOut, lastBeat: -99, sched: -intro, pulse: 0, pulseAmp: 1, side: 1, pcombo: 0,
      heat: prev ? prev.heat : 0, heatV: prev ? prev.heatV : 0, heatL: prev ? prev.heatL : 0, // 음악 달아오름(16장 C): 계속 맞춘 정도 — 단계가 올라가도 이어짐
      hits: prev ? prev.hits : 0, perfects: prev ? prev.perfects : 0, misses: prev ? prev.misses : 0,
      fin: null, aOff: 0, bump: 0, tilt: 0, reel: 0, slack: 0, burst: null, shown: prev ? prev.shown : undefined,
    };
    const ac = audioCtx(); if (ac) S.R.aOff = ac.currentTime - nowS();
    // g: 이번 패턴에서 secs초 안에 나오는 노트 수(N)를 세어, N번 맞추면 거리가 g만큼 남게 → 다음이 마지막 큰 노트
    const R = S.R;
    while (!R.queue.length || R.queue[R.queue.length - 1].beat * spb < secs) { for (const x of makePhrase(R.song)) R.queue.push({ beat: R.phrases * 16 + x }); R.phrases++; }
    const N = Math.max(3, R.queue.filter((q) => q.beat * spb < secs).length);
    R.g = dist / (N + 1);
    fillQueue();
    // 맞출 때 물 위로 살짝 튀는 물고기 = 아직 무슨 물고기인지 모르게 검은 그림자. 단계가 오를수록 크게
    if (S.model) scene.remove(S.model);
    S.model = shadowFish ||= makeShadowFish(); S.model.visible = false; S.model.scale.setScalar(Math.max(0.7 + stage * 0.4, S.fish?.kind === 'fish' && S.size ? modelScale(S.size.s) * 0.8 : 0)); scene.add(S.model); // 큰 놈은 그림자도 큼
  }
  // 모형은 한 번 만든 걸 다시 씀(잡을 때마다 새로 만들면 무늬·재료가 GPU 메모리에 쌓임). 위치·크기·회전은 쓸 때마다 다시 정함
  let shadowFish = null;
  const models = new Map(); // 'fish:<id>' · 'paddle:<id>' → 모형 (종류가 33개뿐)
  const cachedModel = (key, make) => { if (!models.has(key)) models.set(key, make()); return models.get(key); };
  function makeShadowFish() {
    const m = makeFishModel(FISH.mackerel), mat = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.6 });
    m.traverse((o) => { if (o.isMesh) o.material = mat; });
    return m;
  }
  // 마지막 큰 노트를 맞췄는데 아직 더 높은 등급: "끝인 줄 알았는데!" → 줄이 확 풀리며 다음 단계
  const HEAVY = [null, { txt: '❗ 무겁다!', sub: '아직 안 끝났어!' }, { txt: '‼ 엄청 무겁다!!', sub: '보통 놈이 아니야…' }];
  function stageUp() {
    const next = S.stage + 1;
    snd.runLine(); buzz([40, 30, 40, 30, 120]);
    S.shake = 16; S.rodKick = -1; S.rodPitchV -= 8; S.hop = null;
    S.cutin = { t: 0, ...HEAVY[next], color: GRADE[STAGES[next]].color, dur: 0.6, dim: 0.12 };
    startRhythm(next);
    S.R.reel = -1; S.R.slack = 1.2; S.R.tilt = 1;
  }
  const beatT = (b) => S.R.t0 + b * S.R.spb;
  // 음악 달아오름(16장 C 1단계): 맞춘 노트(Good 1 · Perfect 1.5)가 쌓일수록 악기가 한 겹씩 — 3 → 1겹, 7 → 2겹, 12 → 3겹.
  // 놓치면 한 겹 아래 문턱으로 내려감. 숫자는 화면에 안 보임(8장 '콤보 없음' 그대로) — 귀로만
  const HEAT_AT = [3, 7, 12];
  const heatLayers = (h) => HEAT_AT.filter((x) => h >= x).length;
  function heatAdd(R, p) { R.heat = Math.min(16, R.heat + (p ? 1.5 : 1)); }
  function heatMiss(R) { const l = heatLayers(R.heat); R.heat = l >= 2 ? HEAT_AT[l - 2] : 0; }
  function fillQueue() { // 앞으로 2구절치 노트 시각을 늘 준비
    const R = S.R;
    while (R.queue.length < 12) { for (const x of makePhrase(R.song)) R.queue.push({ beat: R.phrases * 16 + x }); R.phrases++; }
  }
  function tickRhythm(rdt) {
    const R = S.R, rt = rtNow(), spb = R.spb;
    // 음악: 0.25초 앞까지 박마다 미리 걸어 둠 (오디오 시각). 소리가 늦게 들리는 만큼(lag) 먼저 틀어서 들리는 박 = 원이 닿는 순간
    const lag = audioLag();
    while (beatT(R.sched) < rt + 0.25 + lag) { playBeat(R.song, R.sched, R.aOff + R.base + beatT(R.sched) - lag, spb, TUNE.heat ? heatLayers(R.heat) : 0); R.sched++; }
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
    if (rt >= R.t0 - R.intro * spb && beat !== R.lastBeat) {
      R.lastBeat = beat;
      R.pulse = 1; R.pulseAmp = ((beat % 4) + 4) % 4 === 0 ? 1.6 : 1; S.rodKick = Math.max(S.rodKick, 0.2); // 마디 첫 박은 더 세게
      BEAT.n = beat + S.stage * 10000; BEAT.pulse = 1; BEAT.accent = R.pulseAmp > 1; BEAT.side = -BEAT.side; // 주변 박자 (beat.js)
      if (beat === -2 && S.stage === 0) say('준비', { sx: 0.5, sy: 0.4, size: 34, life: spb * 0.9, rise: 0 });
      if (beat === -1 && S.stage === 0) say('시작!', { sx: 0.5, sy: 0.4, size: 34, life: spb * 0.9, rise: 0 });
    }
    R.pulse = Math.max(0, R.pulse - rdt / (spb * 0.5));
    BEAT.on = rt >= R.t0 - R.intro * spb; BEAT.spb = spb; BEAT.phase = (((rt - R.t0) / spb) % 1 + 1) % 1;
    R.press = Math.max(0, (R.press || 0) - rdt / 0.18);
    // 색 달아오름(16장 C 2단계): 겹 수(0~3)를 부드럽게 따라가는 값 R.heatV — hud.js가 원 둘레·화면 가장자리 빛으로 그림
    const hl = TUNE.heatC ? heatLayers(R.heat) : 0;
    if (hl > (R.heatL || 0)) R.heatFlash = 1; // 한 겹 올라가는 순간 원에서 빛 고리가 퍼짐
    R.heatL = hl; R.heatV = (R.heatV || 0) + (hl - (R.heatV || 0)) * Math.min(1, rdt * (hl > (R.heatV || 0) ? 6 : 2.5)); // 오를 땐 빨리, 식을 땐 천천히
    R.heatFlash = Math.max(0, (R.heatFlash || 0) - rdt / 0.6);
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
    R.press = 1; // 판정과 상관없이 누른 순간 기본 원이 '꾹' (hud.js)
    if (!near || bd > 0.25) { snd.tap(); return; } // 노트가 멀면 무시 (마구 눌러도 손해·이득 없음) — 작은 '톡'만
    noteResult(near, bd <= TUNE.noteP ? 'Perfect' : bd <= TUNE.noteG ? 'Good' : 'Miss', rt - near.t);
  }
  // d = 누른 시각 − 노트 시각(초, 음수 = 빨리). Perfect가 아니면 '빨라요/늦어요'를 작게 알려 줌 (안 누르고 지나간 놓침은 없음)
  function noteResult(n, res, d = null) {
    const R = S.R;
    n.res = res; n.at = rtNow();
    if (d !== null && res !== 'Perfect') n.ea = d < 0 ? 'early' : 'late';
    emit({ k: 'note', res }); // 고양이(cats.md 3b)가 Perfect '냥!' · 놓치면 귀 접힘
    const y = seaHeight(S.bob.x, S.bob.z, S.now);
    if (n.fin) R.fin = null;
    if (res === 'Miss') {
      // 놓침: 릴이 '지이익' 거꾸로 · 줄이 늘어짐 · 화면이 살짝 기울었다 돌아옴
      R.dist = Math.min(100, R.dist + R.m); R.misses++; R.pcombo = 0; heatMiss(R);
      snd.noteMiss(); S.shake = Math.max(S.shake, 5); S.rodKick = -0.7;
      R.reel = -1; R.slack = 1; R.tilt = R.side;
      say('지이익…', { at: bobAbove(0.8), size: 28, color: '#c9d3e0', life: 0.7, shake: 2 });
      buzz(30);
      return;
    }
    const p = res === 'Perfect';
    R.hits++; if (p) R.perfects++; heatAdd(R, p);
    R.pcombo = p ? R.pcombo + 1 : 0; if (p && R.pcombo >= 2) n.combo = R.pcombo; // Perfect 연속: '×3' 글자
    playMelody(R.song, n.beat, p); // 내가 누른 소리가 멜로디가 됨
    if (n.fin) { // 마지막 큰 노트: 크게 당겨 바로 잡음 (아직 더 높은 등급이면 "무겁다!" → 다음 단계)
      if (S.stage < stageOf(S.fish)) return stageUp();
      R.dist = 0; playFinish(R.song);
      S.hitstop = 0.08; S.flash = 0.8; S.shake = 14; S.rodPitchV += 10; R.bump = 2; R.burst = { t: 0, p: true, big: true };
      say(p ? '영차—!! ✨' : '영차—!!', { sx: 0.5, sy: 0.4, size: 56, color: '#ffd23a', life: 0.8, shake: 5 });
      buzz([60, 30, 120]);
      return startLand();
    }
    // 맞춤: 낚싯대를 '휙' 들어 올림 · 물고기가 살짝 튐 · 화면이 순간 확대 · Perfect는 원이 터지며 불꽃
    // Perfect도 거리는 Good과 같음(빨리 안 끝남) — 대신 연출이 더 큼: 더 크게 튐·번쩍·물보라, 연속이면 점점 더
    R.dist = Math.max(1, R.dist - R.g);
    const c = p ? Math.min(1, (R.pcombo - 1) / 4) : 0; // 연속 Perfect 0~1
    S.rodPitchV += p ? 8 : 5; S.rodKick = 1; S.shake = Math.max(S.shake, p ? 7 + c * 3 : 4);
    R.bump = p ? 1.4 + c * 0.4 : 0.8; R.reel = 1; R.burst = { t: 0, p };
    if (p) S.flash = Math.max(S.flash, 0.18 + c * 0.17);
    R.side = -R.side;
    S.hop = { t: 0, h: p ? 1 + c * 0.4 : 0.5 };
    fx.burst(S.bob.x, y, S.bob.z, p ? 16 + Math.round(c * 10) : 8, p ? 1 + c * 0.3 : 0.6);
    buzz(p ? 25 : 15);
  }

  // ── 잡기: 물 밖으로 들어 올림 (처음 0.2초 느린 동작 + 물방울) → 이름·cm 도장 '쾅'
  function startLand() {
    setMode('land');
    if (S.model) scene.remove(S.model); // 그림자 → 진짜 물고기 (여기서 처음 공개)
    const c = S.fish;
    if (c.kind === 'paddle') S.model = cachedModel('paddle:' + c.id, () => { const g = new THREE.Group(), p = makePaddle(ITEM[c.id]); p.scale.setScalar(3.4); g.add(p); return g; });
    else S.model = cachedModel('fish:' + c.id, () => makeModel(c.id));
    scene.add(S.model);
    const M = S.model; M.visible = true;
    if (c.kind === 'paddle') S.cutin = { t: 0, txt: '🏓 전설 탁구채!!', sub: c.dup ? `${c.name} — 이미 있어서 조각 ${PADDLE_DUP_PIECES}개` : c.name, color: '#ffc21a' };
    else if (c.kind === 'junk') S.cutin = { t: 0, txt: '에이…', sub: `${c.name}네 ${c.emoji}`, color: '#9fd3c0', dur: 0.9, dim: 0.1 };
    else if (c.grade !== 'common') S.cutin = { t: 0, txt: c.grade === 'legend' ? '🌟 전설! 🌟' : '✨ 희귀!', sub: c.name, color: GRADE[c.grade].color };
    // 크기가 드라마틱하게 (fishing.md 11장): 모형 크기 = cm에 비례, 클수록 느린 동작·물보라·흔들림·카메라 물러남·늦게 도장
    const sc = c.kind === 'fish' ? modelScale(S.size.s) : 1.2, tier = c.kind === 'fish' ? sizeTier(S.size.s) : null;
    M.scale.setScalar(sc);
    const y = seaHeight(S.bob.x, S.bob.z, S.now);
    const T = { monster: { slow: 0.7, stamp: 1.9, end: 3.6, drops: 90, pow: 2.6, shake: 26 }, huge: { slow: 0.45, stamp: 1.4, end: 2.7, drops: 60, pow: 2, shake: 18 }, big: { slow: 0.3, stamp: 1.1, end: 2.1, drops: 40, pow: 1.6, shake: 10 } }[tier?.id] || { slow: 0.2, stamp: 1.0, end: 1.9, drops: 30, pow: 1.3, shake: 0 };
    S.land = { from: new THREE.Vector3(S.bob.x, y, S.bob.z), stamped: false, sc, tier, T, pull: clamp((sc - 2) * 0.55, 0, 1.8) };
    M.position.copy(S.land.from); // 다시 쓰는 모형이라 지난번 자리에 한 프레임 보이지 않게
    S.slow = T.slow; S.hop = null; S.shake = Math.max(S.shake, T.shake);
    fx.burst(S.bob.x, y, S.bob.z, T.drops, T.pow); snd.splash(1.2 + (T.pow - 1.3)); buzz(tier ? [60, 40, 160, 40, 220] : [30, 40, 80]);
    say(tier?.id === 'monster' ? '콰아아아앙!!!' : tier?.id === 'huge' ? '촤아아악!!' : '촤아악!', { at: bobAbove(1.2 + sc * 0.4), size: 40 + (sc - 1) * 14, life: 0.9, shake: tier ? 6 : 0 });
  }
  function tickLand() {
    const L = S.land, M = S.model;
    const k = clamp(S.t / L.T.stamp, 0, 1), e = 1 - (1 - k) ** 3;
    const to = new THREE.Vector3(S.standX - 0.3, DECK + 1.9 + Math.max(0, L.sc - 1) * 0.25, S.standZ + 1.6 + Math.max(0, L.sc - 1) * 0.6); // 큰 놈은 조금 멀리(화면에 다 들어오게)
    M.position.lerpVectors(L.from, to, e); M.position.y += Math.sin(k * Math.PI) * (2.2 + L.sc * 0.6);
    if (k >= 1 && L.tier) M.position.y += Math.sin(S.t * 9) * 0.04 * L.sc; // 큰 놈은 들고 있어도 퍼덕
    M.rotation.set(Math.sin(S.t * 25) * 0.25 * (1 - k), M.userData.faceZ || S.fish.kind !== 'fish' ? Math.PI + 0.3 : Math.PI / 2 + 0.5, Math.sin(S.t * 18) * 0.4 * (1 - k));
    M.userData.anim?.(S.now);
    if (!L.stamped && S.t > L.T.stamp) {
      L.stamped = true;
      snd.stamp(); S.shake = Math.max(8, L.T.shake);
      const c = S.fish;
      S.stamp = { t: 0, tier: L.tier, txt: c.kind === 'fish' ? `${c.name} ${S.size.cm}cm${L.tier ? ' ' + L.tier.icon : ''}` : c.name };
      if (L.tier && L.tier.id !== 'big') { S.cutin = { t: 0, txt: `${L.tier.icon} ${L.tier.label}${L.tier.id === 'monster' ? '!!!' : '!!'}`, sub: `${S.size.cm}cm`, color: L.tier.color, dur: L.tier.id === 'monster' ? 1.6 : 1.2, dy: 0.28, dim: 0.12 }; /* 글자는 아래쪽(물고기를 안 가리게) */ S.flash = 1; buzz([80, 40, 200]); }
      if (c.kind !== 'junk') snd.win(c.grade === 'legend' || c.kind === 'paddle');
    }
    if (S.t > L.T.end) finishCatch();
  }
  function finishCatch() {
    const c = S.fish, R = S.R;
    let r = {};
    if (c.kind === 'paddle') { if (!c.dup && !isOn()) addPaddle(c.id); } // 로그인 안 했으면 가진 척만 (로그인: 서버가 옷장에 넣거나 조각 30개)
    else r = recordCatch(c, S.size.cm);
    if (S.castId) { // 서버에 알림 → 코인·업적이 오면 결과 카드에 더함
      const id = S.castId; S.castId = null;
      fishFinish(id, true, S.grade === 'Perfect').then((x) => {
        if (!S.result?.ok || S.result.c !== c) return;
        if (x.status !== 'ok') { S.result.srvNote = x.status === 'too_fast' ? '너무 빨라서 인정 안 됨' : '서버 기록 실패'; return; }
        Object.assign(S.result, { first: x.first, rec: x.rec, best: x.best, coins: x.coins, bonus: x.bonus, capped: x.capped, pieces: x.pieces, bagged: x.bagged, sold: x.sold, bagN: Array.isArray(x.bag) ? x.bag.reduce((a, b) => a + b.n, 0) : null });
        if (x.bagged || x.sold) emit({ k: 'bag' });
        if (x.pieces) S.result.c = { ...c, dup: true };
        (x.new || []).forEach((n, i) => setTimeout(() => say(`🏅 업적 「${ACH[n.id]?.name || n.id}」 +${n.coins}`, { sx: 0.5, sy: 0.16, size: 26, color: '#ffe27a', life: 2.4, rise: 10 }), 600 + i * 900));
      });
    }
    const img = c.kind === 'paddle' ? Object.assign(new Image(), { src: paddleImage(ITEM[c.id], 180) }) : modelImage(c.id);
    S.model.visible = false; S.bobLanded = false;
    S.result = { ok: true, c, img, cm: S.size.cm, big: c.kind === 'fish' && S.size.s >= BIG_CM, tier: c.kind === 'fish' ? sizeTier(S.size.s) : null, times: c.kind === 'fish' ? Math.round(S.size.s / 5) / 10 : 0, grade: S.grade, calm: S.calm, ...r, perfects: R.perfects, hits: R.hits, misses: R.misses, near: S.near };
    emit({ k: 'catch', c, cm: S.size.cm, grade: S.grade });
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
    if (S.castId) { fishFinish(S.castId, false, false); S.castId = null; }
    // 등급은 숨김. 단, 희귀·전설 단계까지 가서 도망가면 아쉬움 한 줄 (사용자 확정 11/25)
    const regret = kind === 'far' && S.stage >= 1 ? `…방금 그건 ${GRADE[S.fish.grade].label}급이었다` : '';
    S.result = { ok: false, title: FAIL[kind][0], sub: FAIL[kind][1], regret, grade: S.fish?.grade };
    emit({ k: 'miss' });
    setMode('result');
    S.ev = null; S.alertT = -1;
  }
  function toReady() {
    if (S.mode !== 'ready') emit({ k: 'ready' });
    setMode('ready');
    S.result = null; S.R = null; S.stage = 0; S.land = null; S.stamp = null; S.cutin = null; S.bobLanded = false; S.ev = null; S.power = 0;
    if (S.model) { scene.remove(S.model); S.model = null; }
  }

  // ── 매 프레임
  const tipW = new THREE.Vector3();
  function update(dt, rdt) {
    S.t += dt; S.now = performance.now() / 1000; // 바다 물결 시각(광장·시안 모두 performance.now 기준)
    if (S.hint) { S.hint.t += rdt; if (S.hint.t > 2.2) S.hint = null; }
    if (S.mode === 'ready' && S.walk && opt.canWalk) S.standX = walkStand(S.standX, S.standZ, S.walk * 2.4 * dt);
    me.group.position.set(S.standX, DECK, S.standZ);
    me.setOpacity(S.mode === 'ready' ? 1 : 0.4, 1); // 낚시하는 동안 내 캐릭터 반투명 (내 화면에서만, 사용자 요청)
    if (S.R) S.R.rt = rtNow();
    if (S.mode === 'ready' && !S.drag) S.power = Math.max(0, S.power - rdt * 0.8);

    // 기포 (모두가 같은 곳 — 시각으로 정함)
    S.bubbles = activeBubbles(clock() / 1000, TUNE.bubbles); // 서버 시각에 맞춘 시계 (모든 PC가 같은 기포)
    for (const b of S.bubbles) if (!S.seenBubbles.has(b.id)) { S.seenBubbles.add(b.id); S.bubbleNote = { t: 0 }; }
    if (S.bubbleNote) { S.bubbleNote.t += rdt; if (S.bubbleNote.t > 3) S.bubbleNote = null; }
    bubbleFx.update(S.bubbles, S.now, rdt, seaHeight);

    if (S.mode === 'cast') {
      const C = S.cast, k = clamp(S.t / C.dur, 0, 1);
      S.bob.lerpVectors(C.from, C.to, k);
      const yTo = seaHeight(C.to.x, C.to.z, S.now);
      S.bob.y = C.from.y + (yTo - C.from.y) * k + Math.sin(k * Math.PI) * (2.4 + C.power * 2.4);
      if (k >= 1) startWait();
    } else if (S.mode === 'wait') tickWait();
    else if (S.mode === 'fight') tickRhythm(rdt);
    else if (S.mode === 'land') tickLand();

    // 줄다리기: 거리 게이지만큼 찌가 선착장 쪽으로, 노트마다 좌우로 휙
    if (S.mode === 'fight' && S.R) {
      const R = S.R, k = clamp(R.dist / 60, 0.06, 1.5);
      const L0 = S.cast.to;
      const tx = S.standX + (L0.x - S.standX) * k + R.side * 0.6 * k, tz = S.standZ + 1.4 + (L0.z - S.standZ - 1.4) * k;
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
    const wantBend = S.mode === 'fight' ? 0.45 + S.stage * 0.15 : S.mode === 'land' ? 0.7 * (1 - clamp(S.t, 0, 1)) : (S.ev?.kind === 'real' && S.ev.fired) ? 0.4 : 0.05;
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
    // 주변 박자 (시안 ⚙️ — 켠 것만)
    if (S.mode !== 'fight') BEAT.on = false;
    BEAT.pulse = Math.max(0, BEAT.pulse - rdt / (BEAT.spb * 0.5));
    Object.assign(BEAT.fx, { sea: !!TUNE.bSea, pier: !!TUNE.bPier, body: !!TUNE.bBody });
    beatFx.update(rdt, { bob: S.bob, now: S.now, me, mode: S.mode });
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
    S.camK += ((S.mode === 'fight' ? S.stage : 0) - S.camK) * Math.min(1, rdt * (S.mode === 'fight' ? 4 : 2.5)); // 단계 카메라(확대·기울기): 잡으면 천천히 돌아옴
    S.shake = Math.max(0, S.shake - rdt * 30);
    S.zshake = Math.max(0, S.zshake - rdt * 40);
    S.flash = Math.max(0, S.flash - rdt * 4);
    if (S.alertT >= 0) S.alertT += rdt;
    for (const x of S.texts) x.t += rdt;
    S.texts = S.texts.filter((x) => x.t < x.life);
    if (S.judge) { S.judge.t += rdt; if (S.judge.t > 1.1) S.judge = null; }
    if (S.cutin) S.cutin.t += rdt;
    if (S.stamp) S.stamp.t += rdt;
    tickSound(S.now);
  }

  // ── 카메라: 어깨 높이 (사용자 확정 11/25)
  function placeCamera() {
    const pull = S.mode === 'land' && S.land ? S.land.pull * clamp(S.t / 0.8, 0, 1) : 0; // 큰 놈을 낚으면 카메라가 물러남
    const back = S.standZ - 3.0 - pull, cz = Math.max(PIER.z0 + 0.4, back); // 판 뒤쪽에 서면 카메라가 절벽 안으로 안 가게 (대신 조금 높이)
    camera.position.set(S.standX + 0.95 + pull * 0.3, DECK + 2.15 + pull * 0.55 + (cz - back) * 0.7, cz);
    if (S.shake > 0) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.012; camera.position.y += (Math.random() - 0.5) * S.shake * 0.012; }
    // 단계 카메라 (11/26 사용자 확정): 희귀 단계 = 확대 + 오른쪽으로 약간 기울기, 전설 단계 = 더 확대 + 반대로 더 기울기. 확대할 때 찌 쪽을 봄
    const cs = [0, 0.6, 1, 1.5][TUNE.cam ?? 2], k = S.camK * cs;
    const lx = S.standX - 0.4, lz = S.mode === 'land' ? S.standZ + 7 + pull : S.standZ + 11, toBob = Math.min(1, k) * 0.35;
    S.camLook.set(lx + (S.bob.x - lx) * toBob, SEA_Y + 0.4 + pull * 1.3, lz + (S.bob.z - lz) * toBob); // 광장 카메라와 이어 붙일 때도 씀
    camera.lookAt(S.camLook);
    const roll = S.camK <= 1 ? 0.052 * S.camK : 0.052 - 0.157 * (S.camK - 1); // 0° → 3° → −6°
    // 맞추면 순간 확대(bump) · 놓치면 살짝 기울기(tilt) · 박자마다 살짝 다가가는 '두근'(마디 첫 박은 더 세게, 단계가 오를수록 조금 더)
    const R = S.mode === 'fight' ? S.R : null;
    camera.rotateZ((R ? R.tilt * 0.035 : 0) + roll * cs);
    const beat = R ? R.pulse * R.pulse * R.pulseAmp * (0.012 + S.stage * 0.004) * cs : 0;
    const fov = (innerWidth < (opt.viewH?.() || innerHeight) ? 72 : 55) * (1 - (R ? R.bump : 0) * 0.025) * (1 - k * 0.045) * (1 - beat);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  // 찌 확대 창 카메라: 찌 자리의 물 높이를 따라 오르내려서, 파도가 있어도 창 안에서 찌가 제자리 → 잠기는 게 또렷
  const zoomOn = () => S.bobLanded && S.mode === 'wait';
  function placeZoomCam() {
    const y = seaHeight(S.bob.x, S.bob.z, S.now);
    const dx = S.standX - S.bob.x, dz = S.standZ - S.bob.z, len = Math.hypot(dx, dz) || 1;
    const j = S.zshake * 0.004;
    zoomCam.position.set(S.bob.x + (dx / len) * 2.6 + (Math.random() - 0.5) * j, y + 0.55 + (Math.random() - 0.5) * j, S.bob.z + (dz / len) * 2.6);
    zoomCam.lookAt(S.bob.x, y + 0.3, S.bob.z);
  }


  // ── 부르는 쪽이 쓰는 것
  const keyDown = (e) => {
    if (e.repeat || dexOpen()) return;
    if (e.code === 'Space') { e.preventDefault(); if (S.mode === 'ready') { initSound(); castTo(0, 0.5); } else press({ key: true }); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') S.walk = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') S.walk = 1;
  };
  const keyUp = (e) => {
    if (e.code === 'Space') release();
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) S.walk = 0;
  };
  // 한 프레임: 챔질 멈춤(hitstop)·느린 동작 → 규칙·연출 → 카메라
  function frame(rdt) {
    let dt = rdt;
    if (S.hitstop > 0) { S.hitstop -= rdt; dt = 0; } // 챔질 순간 멈춤 '탁!'
    else if (S.slow > 0) { S.slow -= rdt; dt = rdt * 0.3; } // 잡는 순간 느린 동작
    update(dt, rdt);
    placeCamera();
  }
  // 3D를 그린 뒤: 오른쪽 아래 동그란 찌 확대 창 (동그란 테두리는 hud.js가 그림)
  function renderZoom(renderer, W, H) {
    if (!zoomOn()) return;
    const z = zoomRect(W, H);
    placeZoomCam();
    zoomCam.aspect = 1; zoomCam.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setScissor(z.x, H - z.y - z.s, z.s, z.s); renderer.setViewport(z.x, H - z.y - z.s, z.s, z.s);
    renderer.render(scene, zoomCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }
  const hud = (g, W, H) => drawHud(g, W, H, { S, TUNE, camera, zoomCam, zoom: zoomOn(), caught: fishCount() });
  // 탭이 숨겨졌다 돌아오면 리듬 시계를 밀어 줌 (진짜 시계라서)
  function resumeAfter(d) { if (S.R && d > 0) { S.R.base += d; S.R.sched = Math.max(S.R.sched, Math.floor((rtNow() - S.R.t0) / S.R.spb) + 1); } }
  // 그 자리에 서서 시작 / 그만
  function standAt(x, z) { [S.standX, S.standZ] = clampStand(x, z); } // ㄷ자 선착장: 가장 가까운 서는 곳 (rules.js)
  // 광장: 낚시를 그만두면 숨겨 두고 다음에 다시 씀 (만들기 한 번)
  function setActive(on) {
    if (!on) {
      if (S.castId) { fishFinish(S.castId, false, false); S.castId = null; }
      toReady();
      bubbleFx.update([], S.now, 0, seaHeight);
      quietSound(); // 파도 소리 끄기
      BEAT.on = false; beatFx.hide();
      line.line.visible = false; bobber.visible = false;
    }
    me.group.visible = on;
  }
  return { S, me, dbg, frame, renderZoom, hud, press, release, moveDrag, keyDown, keyUp, resumeAfter, standAt, setActive, busy: () => S.mode !== 'ready' && S.mode !== 'result', zoomOn, camera };
}
