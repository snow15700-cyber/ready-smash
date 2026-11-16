// Three.js 로우폴리 카툰 체육관, 탁구대, 캐릭터
import * as THREE from 'three';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H, HIT_Z, sideSign } from './physics.js';

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// 카메라: 어깨 뒤 낮게 + 공 따라가기 + 타격 흔들림
const CAM = { y: 1.5, back: 1.2, x: 0.3, lookY: 0.86, lookZ: 1.0, fov: 60, followChar: 0.75, followBall: 0.35, lerp: 7, shake: 0.05 };

// 몰입 연출: 최대일 때 체육관 밝기를 이만큼 줄인다 (0.9 = 원래의 10%)
const FOCUS_DARK = 0.9;
const FOCUS_BG = new THREE.Color('#120f14');

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

  const nBefore = scene.children.length;
  buildGym(scene);
  // 몰입 연출용: 체육관(벽·바닥·무대·현수막) 재질의 원래 색을 기억해 두고 setFocus로 어둡게
  const envMats = [];
  for (const o of scene.children.slice(nBefore)) {
    if (o.material && !envMats.some((e) => e.m === o.material)) envMats.push({ m: o.material, c: o.material.color.clone() });
  }
  const bg0 = scene.background.clone();
  let focusK = 0;
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

  // 공 + 잔상 + 그림자
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), new THREE.MeshLambertMaterial({ color: '#fffaf0', emissive: '#ff9a40', emissiveIntensity: 0.25 }));
  ball.castShadow = true;
  scene.add(ball);
  const trail = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.024 - i * 0.002, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28 - i * 0.035, depthWrite: false }));
    scene.add(m);
    trail.push(m);
  }
  const trailHist = [];
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

  return {
    renderer, scene, camera, chars, team, ball, shadow, ring, ringMove, aim,
    shake: 0,
    // 몰입 정도 k (0~1): 체육관을 어둡게 해서 선수·탁구대·공만 보이게
    setFocus(k) {
      if (Math.abs(k - focusK) < 0.003) return;
      focusK = k;
      const f = Math.pow(1 - FOCUS_DARK * k, 2.2); // 눈으로 보는 밝기 기준으로 줄이기
      for (const e of envMats) e.m.color.copy(e.c).multiplyScalar(f);
      scene.background.copy(bg0).lerp(FOCUS_BG, k);
      scene.fog.color.copy(scene.background);
    },
    kick(amount) { this.shake = Math.max(this.shake, amount); },
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
    setBall(p, visible = true) {
      ball.visible = visible;
      ball.position.set(p[0], p[1], p[2]);
      trailHist.unshift([p[0], p[1], p[2]]);
      if (trailHist.length > 14) trailHist.pop();
      trail.forEach((m, i) => {
        const h = trailHist[(i + 1) * 2];
        m.visible = visible && !!h;
        if (h) m.position.set(h[0], h[1], h[2]);
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
    render() { renderer.render(scene, camera); },
  };
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

function buildGym(scene) {
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
        for (const mt of [].concat(m.material || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
      });
    }
    outfit = o;
    torso.visible = !o;
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
      model.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      custom.add(model);
    }
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
      if (!o.isMesh && !o.isSprite) return;
      if (o.userData.fx) return; // 효과(반짝이 등)는 스스로 투명도를 정한다
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
  const setTag = (text, on = false) => {
    const key = text ? `${text}/${on}` : '';
    if (group.userData.tag === key) return;
    group.userData.tag = key;
    if (!text) { if (tag) tag.visible = false; return; }
    if (!tag) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 128;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      // 거리와 상관없이 화면에서 같은 크기로 보이게 (sizeAttenuation 끔)
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      tag.renderOrder = 20;
      tag.scale.set(0.15, 0.0375, 1);
      tag.position.set(0, 1.52, 0);
      group.add(tag);
    }
    const c = tag.material.map.image;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 64px Jua, sans-serif';
    const w = Math.min(500, g.measureText(text).width + 56);
    g.fillStyle = on ? 'rgba(255,214,61,0.95)' : 'rgba(43,42,51,0.55)';
    g.beginPath();
    g.roundRect((c.width - w) / 2, 14, w, 100, 50);
    g.fill();
    g.fillStyle = on ? '#2b2a33' : '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, 68, 470);
    tag.material.map.needsUpdate = true;
    tag.visible = true;
  };
  return { group, body, arm, head, handle, blade, swingT: -1, setOpacity, setPaddleColor, setPaddle, setPaddleModel, setTag, setOutfit, tickOutfit };
}

// 탁구채 색: 지금은 모두 빨강 (나중에 꾸미기에서 색·모양을 바꿀 수 있게 할 예정)
export const PADDLE_COLOR = { me: '#e0333c', mate: '#e0333c', opp: '#e0333c' };
// 캐릭터가 서는 기본 위치 (테이블 중심에서의 거리)
export const CHAR_Z = HIT_Z + 0.42;

// 라켓이 몸 기준 어디에 오는지 (준비 자세 기준 오프셋)
export const PADDLE_OFFSET = { right: 0.38, fwd: 0.42 };
