// Three.js 로우폴리 카툰 체육관, 탁구대, 캐릭터
import * as THREE from 'three';
import { createFx } from './fx.js';
import { makeBall, ballFx } from './balls.js';
import { playCrack, playPeep, playRoar } from './audio.js';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H, HIT_Z, sideSign } from './physics.js';
import { createCrowd } from './crowd.js';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// 카메라: 어깨 뒤 낮게 + 공 따라가기 + 타격 흔들림
// 관전 중계 카메라 (탁구대 옆, +x 쪽). follow: 공을 따라가는 정도
const SIDE_CAM = { x: 4.3, y: 2.4, lookY: 0.7, fov: 50, follow: 0.12, lerp: 3, halfW: 2.6 }; // halfW: 화면 가로에 꼭 들어가야 하는 반폭(m)
const CAM = { y: 1.5, back: 1.2, x: 0.3, lookY: 0.86, lookZ: 1.0, fov: 60, followChar: 0.75, followBall: 0.35, lerp: 7, shake: 0.05 };

// 몰입 연출: 최대일 때 체육관 밝기를 이만큼 줄인다 (0.9 = 원래의 10%)
const FOCUS_DARK = 0.9;
const FOCUS_BG = new THREE.Color('#120f14');

// 주소에 ?bg=commute 처럼 붙이면 그 배경으로 (시안 보기용)
function arenaFromUrl() {
  try { return new URLSearchParams(location.search).get('bg'); } catch { return null; }
}
// 배경을 바꿀 때 옛 배경의 그림·모양을 GPU에서 내린다 (여러 배경이 같이 쓰는 것도 다시 쓰면 자동으로 다시 올라간다)
function disposeArena(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) m[k]?.dispose?.();
      m.dispose();
    }
  });
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#efe3cc');
  scene.fog = new THREE.Fog('#efe3cc', 18, 40);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);

  scene.add(new THREE.HemisphereLight('#fff7ea', '#b98f62', 1.6));
  const sun = new THREE.DirectionalLight('#fff1dc', 1.6);
  sun.position.set(-3, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // 배경 (경기장 뽑기의 '배경'). 체육관도 배경 하나로 다룬다. setArena(id)로 언제든 바꾼다
  // 주소에 ?bg=... 가 있으면 그 배경으로 고정 (시안 보기용)
  const urlBg = arenaFromUrl();
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  let arena = null, arenaId = null;
  // 몰입 연출용: 배경 재질의 원래 색을 기억해 두고 setFocus로 어둡게
  let envMats = [];
  let bg0 = scene.background.clone();
  let focusK = 0;
  // 배경 코드(arenas.js, 약 170KB)는 첫 로딩을 빠르게 하려고 처음에는 안 받고, 체육관이 아닌 배경이 필요할 때 받는다
  // (첫 화면 몇 초 뒤 쉬는 시간에도 미리 받아 둔다). 받는 동안·그림 준비(셰이더) 동안은 지금 배경을 그대로 보여 준다
  let arenaMod = null, arenaLoad = null, pending = null;
  const loadArenas = () => (arenaLoad ||= import('./arenas.js').then((m) => (arenaMod = m)).catch((e) => { arenaLoad = null; console.warn('[배경] 불러오기 실패', e); }));
  setTimeout(() => (window.requestIdleCallback || setTimeout)(loadArenas), 4000);
  function setArena(id) {
    if (urlBg) id = urlBg;
    id = id || 'gym';
    if (id === arenaId) { if (pending) { disposeArena(pending.a.root); pending = null; } return; }
    if (pending) { if (pending.id === id) return; disposeArena(pending.a.root); pending = null; }
    if (id !== 'gym' && !arenaMod) { loadArenas(); return; }
    const next = id === 'gym' ? null : arenaMod.buildArena(id);
    if (id !== 'gym' && !next) { if (arenaId) return; id = 'gym'; }
    const a = next || gymArena();
    // 새 배경의 그림 준비(셰이더 컴파일)를 화면을 멈추지 않고 먼저 끝낸 뒤 바꿔 끼운다
    if (arenaId && renderer.compileAsync) {
      const job = (pending = { id, a });
      renderer.compileAsync(a.root, camera, scene).catch(() => {}).then(() => { if (pending === job) { pending = null; swapArena(id, a); } });
      return;
    }
    swapArena(id, a);
  }
  function swapArena(id, next) {
    // 몰입 연출을 풀어 원래 색으로 되돌린 뒤 옛 배경을 치운다
    for (const e of envMats) e.m.color.copy(e.c);
    if (arena) { scene.remove(arena.root); disposeArena(arena.root); }
    arena = next;
    arenaId = id;
    scene.add(arena.root);
    scene.background = new THREE.Color(arena.sky);
    scene.fog = new THREE.Fog(arena.sky, arena.fog[0], arena.fog[1]);
    camera.far = arena.far; camera.updateProjectionMatrix();
    const [hs, hg, hi] = arena.light.hemi;
    hemi.color.set(hs); hemi.groundColor.set(hg); hemi.intensity = hi;
    sun.color.set(arena.light.sun[0]); sun.intensity = arena.light.sun[1]; sun.position.set(...arena.light.sun[2]);
    const b = arena.light.shadow || 5;
    Object.assign(sun.shadow.camera, { left: -b, right: b, top: b, bottom: -b, far: arena.light.shadow ? 60 : 20 });
    sun.shadow.camera.updateProjectionMatrix();
    envMats = [];
    arena.root.traverse((o) => {
      if (o.userData.noFocus || !o.material) return;
      for (const m of [].concat(o.material)) if (m.color && !envMats.some((e) => e.m === m)) envMats.push({ m, c: m.color.clone() });
    });
    bg0 = scene.background.clone();
    if (focusK) { const k = focusK; focusK = -1; world.setFocus(k); }
  }
  buildTable(scene);

  // team[side][slot]: 2v2용으로 한쪽에 두 명씩. chars = 각 쪽 1번 선수 (1v1·AI용)
  const team = [0, 1].map((side) => [0, 1].map((slot) => {
    const c = makeCharacter(side === 0 ? PADDLE_COLOR.me : PADDLE_COLOR.opp);
    c.group.position.set(0, 0, sideSign(side) * CHAR_Z);
    c.group.rotation.y = side === 0 ? 0 : Math.PI;
    c.group.visible = slot === 0;
    scene.add(c.group);
    return c;
  }));
  const chars = [team[0][0], team[1][0]];

  // 공 + 잔상 + 그림자. ball은 자리만 잡는 그룹이고, 안의 모양(ballModel)은 탁구공 꾸미기로 바뀐다 (balls.js)
  const ball = new THREE.Group();
  scene.add(ball);
  let ballModel = null, ballId = null, ballSmash = false;
  const ballPrev = new THREE.Vector3(), ballVel = new THREE.Vector3();
  const bounceQ = []; // 앞으로 튈 때 효과 { at: performance 초, p, smash, floorY }
  function setBallSkin(id) {
    id = id || 'white';
    if (id === ballId) return;
    ballId = id;
    if (ballModel) {
      ball.remove(ballModel);
      ballModel.traverse((o) => { for (const mt of [].concat(o.material || [])) { mt.map?.dispose?.(); mt.emissiveMap?.dispose?.(); mt.dispose?.(); } });
    }
    ballModel = makeBall(id);
    ball.add(ballModel);
  }
  setBallSkin(null);
  const trail = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.024 - i * 0.002, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28 - i * 0.035, depthWrite: false }));
    scene.add(m);
    trail.push(m);
  }
  const trailHist = []; // [x, y, z, 초]
  const TRAIL_GAP = 2 / 60; // 잔상 하나당 간격(초) — 예전 60fps에서 2장 간격과 같음
  const tv1 = new THREE.Vector3(), tv2 = new THREE.Vector3();
  // 잔상 중 카메라와 공 사이에 있으면서 화면에서 공과 겹치는 것은 숨긴다 (공 반지름 0.028, 겹침 여유 1.15배)
  function hideTrailOverBall() {
    if (!ball.visible) return;
    tv1.copy(ball.position).sub(camera.position);
    const dB = tv1.length(); tv1.divideScalar(dB);
    for (const m of trail) {
      if (!m.visible) continue;
      tv2.copy(m.position).sub(camera.position);
      const dT = tv2.length();
      if (dT >= dB) continue; // 공 뒤쪽이면 공이 가려 줌
      const ang = Math.acos(Math.min(1, tv1.dot(tv2) / dT));
      if (ang < (0.028 / dB + m.geometry.parameters.radius / dT) * 1.15) m.visible = false;
    }
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // 타이밍 링
  const ring = new THREE.Group();
  const ringTarget = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.072, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false }));
  const ringMove = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.074, 40), new THREE.MeshBasicMaterial({ color: '#ffd23d', transparent: true, opacity: 0.95, depthTest: false }));
  ringTarget.renderOrder = ringMove.renderOrder = 10;
  ring.add(ringTarget, ringMove);
  ring.visible = false;
  scene.add(ring);

  // 노리는 방향 표시 (상대 테이블 위)
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 28), new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.55, depthWrite: false }));
  aim.rotation.x = -Math.PI / 2;
  aim.position.y = TY + 0.004;
  scene.add(aim);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;
  // 전설 탁구채 효과 (칠 때 튀는 그림 + 탁구채가 스스로 움직이는 연출)
  const fx = createFx(scene);
  const ballBfx = ballFx(scene, fx); // 탁구공의 튈 때·스매시·알 깨짐 효과
  const fxPos = new THREE.Vector3();
  let fxLast = 0;
  let warm = false, warm0 = false;
  let ballPrevY = 0, ballPrevVy = 0;

  const crowd = createCrowd(scene, makeCharacter); // 관중석 (관전 4단계): 관중도 선수와 같은 캐릭터
  const world = {
    renderer, scene, camera, chars, team, ball, shadow, ring, ringMove, aim, crowd,
    shake: 0,
    // 몰입 정도 k (0~1): 체육관을 어둡게 해서 선수·탁구대·공만 보이게
    setFocus(k) {
      if (Math.abs(k - focusK) < 0.003) return;
      focusK = k;
      const f = Math.pow(1 - FOCUS_DARK * k, 2.2); // 눈으로 보는 밝기 기준으로 줄이기
      for (const e of envMats) e.m.color.copy(e.c).multiplyScalar(f);
      crowd.setDim(f); // 관중석도 같이 (경기 도중에 들어온 관중 포함)
      scene.background.copy(bg0).lerp(FOCUS_BG, k);
      scene.fog.color.copy(scene.background);
    },
    // 대기실 구도: 화면 위쪽 h픽셀(카드 위 공간)을 기준으로 장면을 맞춘다. h가 없으면 원래대로
    setStageView(h) {
      const w = window.innerWidth, H = window.innerHeight;
      if (h) {
        camera.aspect = w / h;
        camera.setViewOffset(w, h, 0, 0, w, H);
      } else {
        camera.clearViewOffset();
        camera.aspect = w / H;
      }
      camera.updateProjectionMatrix();
    },
    // 화면의 점 (px, py)을 지나는 시선이 깊이 z 평면과 만나는 곳의 x (m)
    screenToX(px, py, z) {
      camera.updateMatrixWorld();
      const v = new THREE.Vector3((px / window.innerWidth) * 2 - 1, 1 - (py / window.innerHeight) * 2, 0.5).unproject(camera);
      const o = camera.position;
      const d = v.sub(o);
      return o.x + (d.x * (z - o.z)) / d.z;
    },
    // 3D 점 → 화면 좌표(px)
    toScreen(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
    },
    kick(amount) { this.shake = Math.max(this.shake, amount); },
    // 전설 탁구채로 쳤을 때 효과. pos가 없으면 탁구채 자리에서
    hitFx(char, pos, grade) {
      const model = char?.paddleModel;
      if (!char?.fx || !model) return;
      if (!pos) pos = model.getWorldPosition(fxPos).toArray();
      model.userData.hit?.(grade);
      fx.hit(char.fx, pos, grade, char.group.position.z >= 0 ? -1 : 1);
    },
    // ballX: 공이 지금 있는 좌우 위치 (공 따라가기용)
    // charZ: 내 캐릭터가 테이블에서 떨어진 거리 (2v2에서 뒤로 물러나면 카메라도 같이)
    updateCamera(side, charX, dt, ballX = 0, charZ = CHAR_Z) {
      const s = sideSign(side);
      const P = CAM;
      const fx = charX * P.followChar + ballX * P.followBall;
      // b: 2v2에서 팀원 차례라 뒤로 물러난 정도 (0~1). 물러나 있으면 카메라를 내 몸 안쪽(탁구대 가운데 쪽)으로 옮기고
      // 탁구대 가운데를 본다. 반투명한 내 몸이 탁구대를 가리지 않게
      const b = Math.max(0, Math.min(1, (charZ - CHAR_Z) / 0.6));
      const inX = charX - Math.sign(charX) * Math.min(Math.abs(charX), 0.3);
      const tp = new THREE.Vector3((fx + s * P.x) * (1 - b) + inX * b, P.y, s * (charZ - CHAR_Z + HIT_Z + P.back));
      const tl = new THREE.Vector3((charX * 0.2 + ballX * P.followBall * 0.6) * (1 - b) + ballX * P.followBall * 0.6 * b, P.lookY, -s * P.lookZ);
      if (!camInit) { camPos.copy(tp); camLook.copy(tl); camInit = true; }
      const k = 1 - Math.exp(-dt * P.lerp);
      camPos.lerp(tp, k);
      camLook.lerp(tl, k);
      camera.position.copy(camPos);
      if (P.shake && this.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * this.shake * P.shake;
        camera.position.y += (Math.random() - 0.5) * this.shake * P.shake;
      }
      this.shake *= Math.exp(-dt * 12);
      if (camera.fov !== P.fov) { camera.fov = P.fov; camera.updateProjectionMatrix(); }
      camera.lookAt(camLook);
    },
    // 관전 중계 카메라: 탁구대 옆(관중석 쪽)에서 두 선수를 함께 본다. 공을 따라 살짝만 움직인다
    // ballZ: 공의 앞뒤 위치 (탁구대 길이 방향)
    // halfW: 화면 가로에 꼭 들어가야 하는 반폭 (2v2는 선수가 넓게 서서 더 크게)
    updateSideCamera(dt, ballZ = 0, halfW = SIDE_CAM.halfW) {
      const P = SIDE_CAM;
      ballZ = Math.max(-HALF_L, Math.min(HALF_L, ballZ)); // 공이 탁구대 밖으로 멀리 날아가도 카메라는 탁구대 안쪽까지만 따라감
      // 세로로 긴 화면(휴대폰)에서는 양쪽 선수가 다 보이게 뒤로 물러난다
      // (최대 2배까지만 물러나고 — 벽 밖으로 안 나가게 — 그래도 모자라면 화각을 넓힌다)
      const need = halfW / (Math.tan((P.fov * Math.PI) / 360) * camera.aspect * P.x);
      const far = Math.min(2, Math.max(1, need));
      const fov = need > far ? (Math.atan(halfW / (camera.aspect * P.x * far)) * 360) / Math.PI : P.fov;
      const tp = new THREE.Vector3(P.x * far, P.lookY + (P.y - P.lookY) * far, ballZ * P.follow);
      const tl = new THREE.Vector3(0, P.lookY, ballZ * P.follow * 1.6);
      if (!camInit) { camPos.copy(tp); camLook.copy(tl); camInit = true; }
      const k = 1 - Math.exp(-dt * P.lerp);
      camPos.lerp(tp, k);
      camLook.lerp(tl, k);
      camera.position.copy(camPos);
      if (this.shake > 0.001) camera.position.y += (Math.random() - 0.5) * this.shake * CAM.shake * 0.5;
      this.shake *= Math.exp(-dt * 12);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(camLook);
    },
    // smash: 지금 공이 스매시인가 (전설 공의 스매시 꼬리 등)
    setBall(p, visible = true, smash = false) {
      ballSmash = smash;
      ball.visible = visible;
      ball.position.set(p[0], p[1], p[2]);
      // 잔상: '몇 장 전 화면'이 아니라 '몇 초 전 위치'로 (모니터 화면 수가 달라도 꼬리 길이가 같게).
      // 잔상은 빛을 안 받는 납작한 하얀 원이라, 공을 덮을 만큼 가까운 것은 숨긴다
      // (공이 상대 쪽으로 날아갈 때 잔상이 카메라와 공 사이에 와서 공이 2D 원처럼 보이던 문제)
      const now = performance.now() / 1000;
      trailHist.unshift([p[0], p[1], p[2], now]);
      while (trailHist.length > 2 && now - trailHist[trailHist.length - 1][3] > TRAIL_GAP * (trail.length + 2)) trailHist.pop();
      if (trailHist.length > 120) trailHist.length = 120;
      let j = 0;
      trail.forEach((m, i) => {
        const age = TRAIL_GAP * (i + 1);
        while (j < trailHist.length - 1 && now - trailHist[j][3] < age) j++;
        const h = trailHist[j];
        const ok = !!h && now - h[3] >= age * 0.8;
        m.visible = visible && ok;
        if (ok) m.position.set(h[0], h[1], h[2]);
      });
      const onTable = Math.abs(p[0]) <= HALF_W && Math.abs(p[2]) <= HALF_L && p[1] >= TY - 0.01;
      const gy = onTable ? TY + 0.003 : 0.003;
      shadow.visible = visible;
      shadow.position.set(p[0], gy, p[2]);
      const hgt = Math.max(0, p[1] - gy);
      shadow.scale.setScalar(1 + hgt * 0.8);
      shadow.material.opacity = Math.max(0.08, 0.4 - hgt * 0.35);
    },
    clearTrail() { trailHist.length = 0; },
    // 탁구공 꾸미기: 방에서는 방장 것, 로비·혼자 하기는 내 것 (main.js 루프)
    setBallSkin,
    get ballSound() { return ballModel?.userData.sound || null; },
    // 공이 delay초 뒤에 튄다 (game.js·lobbyDemo.js가 소리와 같은 세그먼트로 예약): 공의 튈 때 반응 + 효과
    ballBounce(delay, p, smash, floor) {
      bounceQ.push({ at: performance.now() / 1000 + Math.max(0, delay), p, smash, floorY: floor ? 0 : TY });
    },
    // 스매시로 득점: 알 공이면 깨지고 병아리·아기 용이 나온다 → true (부른 쪽이 공을 숨김)
    hatch(pos, dir) {
      return ballBfx.hatch(ballModel, pos, dir, TY, dir * HALF_L, { crack: playCrack, peep: playPeep, roar: playRoar });
    },
    clearHatch() { ballBfx.clearKid(); },
    render() {
      hideTrailOverBall();
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - fxLast || 0.016);
      fxLast = t;
      for (const side of team) for (const c of side) if (c.group.visible) c.paddleModel?.userData.tick?.(t, dt);
      if (arena) {
        // 공이 막 튄 순간(아래로 가다 위로) → 반려동물이 반응
        const vy = ball.position.y - ballPrevY;
        const bounce = ball.visible && ballPrevVy < -0.0005 && vy > 0 ? 1 : 0;
        ballPrevVy = vy; ballPrevY = ball.position.y;
        arena.tick?.(t, dt, ball.visible ? ball.position : null, bounce);
      }
      // 탁구공: 스스로 움직임(굴러감·얼굴 방향·반짝이) + 튈 때 효과 + 스매시 꼬리
      if (ballModel) {
        ballVel.copy(ball.position).sub(ballPrev).divideScalar(dt);
        if (ballVel.lengthSq() > 900) ballVel.set(0, 0, 0); // 공이 순간 이동(새 서브)하면 무시
        ballPrev.copy(ball.position);
        ballModel.visible = ball.visible;
        ballModel.userData.tick(t, dt, { vel: ballVel, smash: ballSmash });
        for (let i = bounceQ.length - 1; i >= 0; i--) {
          const q = bounceQ[i];
          if (t < q.at) continue;
          bounceQ.splice(i, 1);
          if (t - q.at < 0.3 && ball.visible) ballBfx.bounce(ballModel, q.p, q.smash, q.floorY);
        }
        ballBfx.frame(ballModel, ball.visible ? ball.position.toArray() : null, ballSmash && ball.visible, dt);
      }
      fx.update(dt);
      // 첫 화면: 그림 준비(셰이더 컴파일)를 먼저 끝낸다. 그동안 글자·버튼(HTML)은 먼저 보이고 화면이 멈추지 않는다
      if (!warm) {
        if (!warm0) { warm0 = true; (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {}).then(() => (warm = true)); }
        return;
      }
      renderer.render(scene, camera);
    },
    setArena,
    get arenaId() { return arenaId; },
    get arena() { return arena; },
  };
  setArena(null);
  return world;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 기본 배경: 체육관·강당 (배경 하나처럼 { root, sky, fog, far, light })
function gymArena() {
  return {
    root: buildGym(),
    sky: '#efe3cc',
    fog: [18, 40],
    far: 80,
    light: { hemi: ['#fff7ea', '#b98f62', 1.6], sun: ['#fff1dc', 1.6, [-3, 8, 4]] },
  };
}

function buildGym() {
  const scene = new THREE.Group(); // 아래 코드는 이 묶음에 붙인다
  const W = 22, D = 30, H = 9;
  // 나무 바닥 + 코트 라인
  const floorTex = canvasTex(1024, 1400, (g, w, h) => {
    g.fillStyle = '#d9a86c';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = (x / 32) % 2 ? '#d29f62' : '#ddb077';
      g.fillRect(x, 0, 32, h);
      g.fillStyle = 'rgba(120,70,30,0.18)';
      g.fillRect(x, 0, 2, h);
      for (let y = ((x * 7) % 300); y < h; y += 300) g.fillRect(x, y, 32, 2);
    }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = mat('#f3ead8');
  const woodMat = mat('#b97a45');
  const addBox = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    scene.add(b);
    return b;
  };
  // 벽
  addBox(W, H, 0.3, 0, H / 2, -D / 2, wallMat);
  addBox(W, H, 0.3, 0, H / 2, D / 2, wallMat);
  addBox(0.3, H, D, -W / 2, H / 2, 0, wallMat);
  addBox(0.3, H, D, W / 2, H / 2, 0, wallMat);
  // 아래쪽 나무 벽판
  addBox(0.32, 1.3, D, -W / 2 + 0.02, 0.65, 0, woodMat);
  addBox(0.32, 1.3, D, W / 2 - 0.02, 0.65, 0, woodMat);
  addBox(W, 1.3, 0.32, 0, 0.65, D / 2 - 0.02, woodMat);
  // 천장
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#e6dccb'));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  scene.add(ceil);
  // 천장 조명
  const lightMat = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  for (let x = -6; x <= 6; x += 6) for (let z = -10; z <= 10; z += 5) addBox(1.6, 0.08, 0.5, x, H - 0.05, z, lightMat);
  // 강당 무대 (먼 쪽)
  addBox(12, 1.1, 3.2, 0, 0.55, -D / 2 + 1.7, mat('#a8693b'));
  addBox(12.4, 0.12, 3.4, 0, 1.12, -D / 2 + 1.7, mat('#8a5530'));
  const curtA = mat('#c2343c'), curtB = mat('#a82830');
  for (let i = 0; i < 24; i++) addBox(0.52, 5.6, 0.25, -6 + i * 0.52 + 0.26, 3.9, -D / 2 + 0.4 + (i % 2) * 0.12, i % 2 ? curtA : curtB);
  addBox(12.6, 0.8, 0.5, 0, 6.9, -D / 2 + 0.5, mat('#9a2028'));
  const banner = canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#fff8e6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b4f8a'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('준비하시고, 스매시!', w / 2, h / 2 + 4);
  });
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshBasicMaterial({ map: banner }));
  ban.position.set(0, 8, -D / 2 + 0.2);
  scene.add(ban);
  return scene;
}

function buildTable(scene) {
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W, 0.035, TABLE_L), mat('#2a62b0'));
  top.position.y = TY - 0.0175;
  top.castShadow = true;
  top.receiveShadow = true;
  scene.add(top);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const line = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, d), lineMat);
    m.position.set(x, TY + 0.001, z);
    scene.add(m);
  };
  line(0.02, TABLE_L, -HALF_W + 0.01, 0);
  line(0.02, TABLE_L, HALF_W - 0.01, 0);
  line(TABLE_W, 0.02, 0, -HALF_L + 0.01);
  line(TABLE_W, 0.02, 0, HALF_L - 0.01);
  line(0.005, TABLE_L, 0, 0);
  // 다리
  const legMat = mat('#2b2f3a');
  for (const x of [-0.6, 0.6]) for (const z of [-1.1, -0.3, 0.3, 1.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TY - 0.035, 0.05), legMat);
    leg.position.set(x, (TY - 0.035) / 2, z);
    leg.castShadow = true;
    scene.add(leg);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE_W - 0.1, 0.06, TABLE_L - 0.1), legMat);
  apron.position.y = TY - 0.07;
  scene.add(apron);
  // 네트
  const netTex = canvasTex(256, 32, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,30,40,0.9)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.83, NET_H), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(0, TY + NET_H / 2, 0);
  scene.add(net);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.83, 0.015, 0.006), mat('#ffffff'));
  tape.position.set(0, TY + NET_H, 0);
  scene.add(tape);
  for (const x of [-0.915, 0.915]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, NET_H + 0.02, 6), legMat);
    post.position.set(x, TY + NET_H / 2, 0);
    scene.add(post);
  }
}

// 단순한 흰색 캐릭터 (앞쪽 = -z): 몸통 + 머리 + 떠 있는 탁구채
export function makeCharacter(paddleColor) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const white = new THREE.MeshLambertMaterial({ color: '#f6f5f1' });
  const add = (geo, m, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const torso = add(new THREE.CapsuleGeometry(0.18, 0.62, 6, 16), white, 0, 0.5, 0);
  // 몸 꾸미기 (outfits.js의 makeOutfit): 옷을 입으면 흰 몸통을 숨기고 옷이 몸을 새로 만든다
  let outfit = null;
  const setOutfit = (o) => {
    if (outfit) {
      body.remove(outfit.group);
      outfit.group.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        // 옷이 만든 그림(map·normalMap·emissiveMap·alphaMap)은 버린다. 반사 그림(envMap)은 옷끼리 같이 쓰므로 남긴다
        for (const mt of [].concat(m.material || [])) { for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) mt[k]?.dispose(); mt.dispose(); }
      });
    }
    outfit = o;
    torso.visible = !o;
    head.visible = !o?.hideHead; // 몸 전체가 캐릭터가 되는 옷(병아리 B안 등)은 흰 머리를 숨긴다
    if (o) {
      o.group.traverse((m) => { if (m.isMesh && !m.userData.fx) m.castShadow = true; });
      body.add(o.group);
    }
    if (lastOp) { group.userData.op = null; setOpacity(...lastOp); }
  };
  // 움직이는 옷(전설)의 효과: 매 프레임 불러 준다
  const tickOutfit = (t, dt) => { if (outfit?.update) outfit.update(t, dt); };
  const head = add(new THREE.SphereGeometry(0.16, 20, 14), white, 0, 1.17, 0);
  // 탁구채 (팔 없이 몸 옆에 떠 있음). arm 그룹은 보이지 않는 회전축 역할만 함
  const arm = new THREE.Group();
  arm.position.set(0.19, 0.98, 0);
  body.add(arm);
  const handle = add(new THREE.BoxGeometry(0.025, 0.1, 0.02), new THREE.MeshLambertMaterial({ color: '#c99560' }), 0, 0.05, -0.4, arm);
  const paddleMat = new THREE.MeshLambertMaterial({ color: paddleColor });
  const setPaddleColor = (color) => paddleMat.color.set(color);
  // 꾸미기 (items.js의 applyLook): 색과 빛나는 정도
  const setPaddle = ({ color, emissive = '#000000', glow = 0 }) => {
    paddleMat.color.set(color);
    paddleMat.emissive.set(emissive);
    paddleMat.emissiveIntensity = glow;
  };
  const blade = add(new THREE.CylinderGeometry(0.078, 0.078, 0.012, 20), [paddleMat, paddleMat, new THREE.MeshLambertMaterial({ color: '#222' })], 0, 0.15, -0.4, arm);
  blade.rotation.x = Math.PI / 2;
  // 모양이 다른 탁구채 (items.js의 makePaddle): 판 가운데가 기본 탁구채 판 자리. null이면 기본 탁구채
  const custom = new THREE.Group();
  custom.position.set(0, 0.15, -0.4);
  arm.add(custom);
  let lastOp = null;
  const setPaddleModel = (model) => {
    for (const o of [...custom.children]) {
      custom.remove(o);
      o.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
        for (const mt of [].concat(m.material || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
      });
    }
    if (model) {
      model.traverse((m) => { if (m.isMesh && !m.userData.fxKeep) m.castShadow = true; });
      custom.add(model);
    }
    api.paddleModel = model || null;
    handle.visible = blade.visible = !model;
    if (lastOp) { group.userData.op = null; setOpacity(...lastOp); }
  };
  const isPaddlePart = (o) => {
    for (let p = o; p; p = p.parent) if (p === custom) return true;
    return o === handle || o === blade;
  };
  const setOpacity = (bodyOp, paddleOp) => {
    lastOp = [bodyOp, paddleOp];
    const key = bodyOp + '/' + paddleOp;
    if (group.userData.op === key) return;
    group.userData.op = key;
    group.traverse((o) => {
      // keepOp: 대기실 빛 고리, fx: 옷 효과(반짝이 등), fxKeep: 전설 탁구채 효과 부품 — 스스로 투명도를 정한다
      if (!o.isMesh || o.userData.keepOp || o.userData.fx || o.userData.fxKeep) return;
      const isPaddle = isPaddlePart(o);
      const op = isPaddle ? paddleOp : bodyOp;
      for (const m of [].concat(o.material)) {
        const base = m.userData.baseOp ?? 1; // 원래 반투명한 재질(곰젤리 등)
        m.transparent = op * base < 1;
        m.opacity = op * base;
        // 탁구채는 거의 불투명(0.9)이라 깊이를 써서 부품끼리 앞뒤가 맞게 보이게 한다
        m.depthWrite = op >= 1 || isPaddle;
        m.needsUpdate = true;
      }
    });
  };
  // 머리 위 이름표 (2v2). text가 없으면 숨김, on이면 '다음에 칠 사람'으로 노랗게 강조
  let tag = null;
  // 이름표 (B안: 칭호가 있으면 이름 위에 남색 칭호 알약을 한 줄 더)
  const setTag = (text, on = false, title = '') => {
    const key = text ? `${text}/${on}/${title}` : '';
    if (group.userData.tag === key) return;
    group.userData.tag = key;
    if (!text) { if (tag) tag.visible = false; return; }
    if (!tag) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 224;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 거리와 상관없이 화면에서 같은 크기로 보이게 (sizeAttenuation 끔)
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      tag.renderOrder = 20;
      tag.scale.set(0.15, 0.0656, 1);
      tag.center.set(0.5, 0.27); // 이름 알약 가운데가 예전 이름표 자리 (칭호는 그 위)
      tag.position.set(0, 1.52, 0);
      group.add(tag);
    }
    tag.visible = true;
    const c = tag.material.map.image;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (title) {
      g.font = 'bold 46px Jua, sans-serif';
      const tw = Math.min(500, g.measureText(title).width + 44);
      g.fillStyle = 'rgba(61,59,92,0.92)';
      g.beginPath();
      g.roundRect((c.width - tw) / 2, 16, tw, 72, 36);
      g.fill();
      g.fillStyle = '#fff3c4';
      g.fillText(title, c.width / 2, 54, 470);
    }
    g.font = 'bold 64px Jua, sans-serif';
    const w = Math.min(500, g.measureText(text).width + 56);
    g.fillStyle = on ? 'rgba(255,214,61,0.95)' : 'rgba(43,42,51,0.55)';
    g.beginPath();
    g.roundRect((c.width - w) / 2, 110, w, 100, 50);
    g.fill();
    g.fillStyle = on ? '#2b2a33' : '#ffffff';
    g.fillText(text, c.width / 2, 164, 470);
    tag.material.map.needsUpdate = true;
    tag.visible = true;
  };
  // 대기실: 탁구채를 몸 옆에 붙여 들기 (팔이 없어서 멀리 띄우면 어색하다). off면 경기 자세로 되돌린다
  const ARM0 = arm.position.clone();
  const setHold = (on) => {
    if (on) arm.position.set(0.27, 0.8, 0);
    else arm.position.copy(ARM0);
    for (const k of [handle, blade, custom]) k.position.z = on ? -0.17 : -0.4;
  };
  // 대기실: 발밑 빛 고리 (아이템 등급 색). null이면 숨김
  let glow = null;
  const setGlow = (color) => {
    if (!color) { if (glow) glow.visible = false; return; }
    if (!glow) {
      glow = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.38, 40), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }));
      glow.userData.keepOp = true;
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.012;
      group.add(glow);
    }
    glow.material.color.set(color);
    glow.visible = true;
  };
  const api = { group, body, arm, head, handle, blade, swingT: -1, paddleModel: null, setOpacity, setPaddleColor, setPaddle, setPaddleModel, setTag, setHold, setGlow, setOutfit, tickOutfit };
  return api;
}

// 탁구채 색: 지금은 모두 빨강 (나중에 꾸미기에서 색·모양을 바꿀 수 있게 할 예정)
export const PADDLE_COLOR = { me: '#e0333c', mate: '#e0333c', opp: '#e0333c' };
// 캐릭터가 서는 기본 위치 (테이블 중심에서의 거리)
export const CHAR_Z = HIT_Z + 0.42;

// 라켓이 몸 기준 어디에 오는지 (준비 자세 기준 오프셋)
export const PADDLE_OFFSET = { right: 0.38, fwd: 0.42 };
