// 광장 로비 3D 쪽 (docs/dev/plaza.md 1장·8장): 사람 캐릭터, 걷기, 3인칭 카메라, 바닥·가게 클릭.
// 걷기는 {from, to, t}(t = 출발 시각, ms)만 알면 언제든 같은 자리를 계산할 수 있다 → 네트워크로는 클릭할 때 한 번만 보낸다.
// 보기만 하는 장면이라 경기 판정과 상관없음. 네트워크·화면 흐름은 src/ui/plaza.js.
import * as THREE from 'three';
import { BUBBLE_IN, PLAZA } from './arena-plaza.js';
import { bubble } from './crowd.js';
import { applyLook } from './items.js';
import { holdPose } from './ui/stage.js';
import { createKimRunners } from './plazaKim.js';
import { makeCharacter } from './scene.js';

export const WALK_SPEED = 5; // m/s (광장이 넓어져서 11/24 4 → 5)
const NEAR_TAG = 16; // 이 거리(m)보다 먼 사람은 이름표 생략 (사람이 많을 때 가볍게)
const NEAR_TICK = 24; // 이 거리보다 먼 사람은 움직이는 옷 효과도 멈춤
export const CAM = { dist: 8.5, minDist: 3.2, maxDist: 15, pitch: 0.42, minPitch: 0.12, maxPitch: 1.15, lookY: 1.1, follow: 1.4 };
const TOUCH_SLOP = 8; // 이만큼(px) 안 움직이고 떼면 '클릭(탭)'

// 걷기 정보 w = {from:[x,z], to:[x,z], t} → 지금(ms) 서 있는 곳
export function posAt(w, nowMs) {
  const [fx, fz] = w.from, [tx, tz] = w.to;
  const dx = tx - fx, dz = tz - fz, d = Math.hypot(dx, dz);
  if (d < 1e-6) return [tx, tz];
  const s = Math.min(d, Math.max(0, (nowMs - w.t) / 1000) * WALK_SPEED) / d;
  return [fx + dx * s, fz + dz * s];
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
// 받은 걷기 정보 다듬기: 숫자 아님·광장 밖은 버리거나 광장 안으로
export function cleanWalk(w, nowMs) {
  if (!w || !Array.isArray(w.from) || !Array.isArray(w.to)) return null;
  const n = [w.from[0], w.from[1], w.to[0], w.to[1], w.t];
  if (!n.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const P = PLAZA;
  return {
    from: [clampN(n[0], P.minX, P.maxX), clampN(n[1], P.minZ, P.maxZ)],
    to: [clampN(n[2], P.minX, P.maxX), clampN(n[3], P.minZ, P.maxZ)],
    t: Math.min(n[4], nowMs), // 시계가 앞선 PC가 보낸 것도 '지금 출발'로
  };
}
// 가게 건물 바닥 자리 (x·z 네모)
const shopRect = (s, pad = 0) => ({ x0: s.x - s.w / 2 - pad, x1: s.x + s.w / 2 + pad, z0: s.front - s.d - pad, z1: s.front + pad });
// 걸어갈 곳 정하기: 광장 안으로, 가는 길에 가게 건물이 있으면 건물 앞에서 멈춘다
export function clipWalk(from, to) {
  const P = PLAZA;
  let tx = clampN(to[0], P.minX, P.maxX), tz = clampN(to[1], P.minZ, P.maxZ);
  const dx = tx - from[0], dz = tz - from[1];
  let best = 1;
  for (const r0 of [...P.shops.map((s) => shopRect(s)), ...(P.blocks || [])]) {
    const r = { x0: r0.x0 - 0.35, x1: r0.x1 + 0.35, z0: r0.z0 - 0.35, z1: r0.z1 + 0.35 };
    // 선분과 네모가 처음 만나는 곳 (slab 방식)
    let t0 = 0, t1 = 1, hit = true;
    for (const [o, d, a, b] of [[from[0], dx, r.x0, r.x1], [from[1], dz, r.z0, r.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < a || o > b) { hit = false; break; } continue; }
      let u = (a - o) / d, v = (b - o) / d;
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit && t0 > 0) best = Math.min(best, Math.max(0, t0 - 0.02)); // 이미 그 안에 있으면(t0 = 0) 빠져나가는 길은 막지 않음
  }
  return [from[0] + dx * best, from[1] + dz * best];
}

// 걸어갈 길 (꺾어 가기): 곧장 가는 길이 건물·탁구대에 막히면 모서리를 한두 번 돌아서 간다.
// 돌려주는 것 = 지나갈 점들 [..., 도착점]. 걷기 정보는 한 구간씩 보낸다(꺾을 때마다 한 번 — 매 프레임 전송 없음)
const allRects = () => [...PLAZA.shops.map((s) => shopRect(s)), ...(PLAZA.blocks || [])];
const clear = (a, b) => { const c = clipWalk(a, b); return Math.hypot(c[0] - b[0], c[1] - b[1]) < 1e-3; };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inside = (p) => allRects().some((r) => p[0] > r.x0 - 0.36 && p[0] < r.x1 + 0.36 && p[1] > r.z0 - 0.36 && p[1] < r.z1 + 0.36);
export function planWalk(from, to) {
  const P = PLAZA;
  const end = [clampN(to[0], P.minX, P.maxX), clampN(to[1], P.minZ, P.maxZ)];
  if (clear(from, end)) return [end];
  const pad = 0.62; // 모서리에서 조금 떨어져서 (clipWalk 여유 0.35보다 넉넉히)
  const corners = [];
  for (const r of allRects()) for (const x of [r.x0 - pad, r.x1 + pad]) for (const z of [r.z0 - pad, r.z1 + pad]) {
    if (x >= P.minX && x <= P.maxX && z >= P.minZ && z <= P.maxZ && !inside([x, z])) corners.push([x, z]);
  }
  let best = null, bd = Infinity;
  for (const c of corners) {
    if (!clear(from, c)) continue;
    if (clear(c, end)) { const d = dist2(from, c) + dist2(c, end); if (d < bd) { bd = d; best = [c, end]; } continue; }
    for (const c2 of corners) {
      if (c2 === c || !clear(c, c2) || !clear(c2, end)) continue;
      const d = dist2(from, c) + dist2(c, c2) + dist2(c2, end);
      if (d < bd) { bd = d; best = [c, c2, end]; }
    }
  }
  return best || [clipWalk(from, end)]; // 못 찾으면(도착점이 건물 안 등) 막히는 곳 앞까지
}

// 발밑 동그란 그림자 (진짜 그림자 대신: 사람이 많아도 가볍게)
let BLOB = null;
function blobShadow() {
  if (!BLOB) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    BLOB = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), BLOB);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.userData.keepOp = true;
  return m;
}

// 걸어갈 곳 표시 (바닥의 작은 고리)
function makeMarker() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.9, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.visible = false;
  return m;
}

// 탁구대 자리 칸 (바닥 동그라미) + 탁구대 위 상태 표지판. 색: A팀 주황, B팀 파랑
export const TEAM_COLOR = ['#ff8a3d', '#3d8bff'];
function makeSeatMark(team) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.95, depthWrite: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.18, depthWrite: false }));
  for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
  g.position.y = 0.022;
  return { g, ring, fill };
}
function makeSign() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 200;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.6, 0.81, 1);
  sp.renderOrder = 5;
  return { sp, c, tex, key: '' };
}
function drawSign(sg, lines, color) {
  const key = JSON.stringify([lines, color]);
  if (sg.key === key) return;
  sg.key = key;
  const g = sg.c.getContext('2d'), W = sg.c.width, H = sg.c.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(28,38,66,.82)';
  g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 40); g.fill();
  g.strokeStyle = color; g.lineWidth = 8; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.font = 'bold 64px Jua, sans-serif';
  g.fillText(lines[0] || '', W / 2, lines[1] ? 66 : H / 2);
  if (lines[1]) { g.fillStyle = '#ffe9a8'; g.font = 'bold 50px Jua, sans-serif'; g.fillText(lines[1], W / 2, 140); }
  sg.tex.needsUpdate = true;
}

// 경기장 거품 원(plaza.md 16장): 경기 중인 탁구대 둘레 바닥에 천천히 도는 주황 불꽃 고리 마법진 (반지름 = 들어가기 7m)
function ringTex(dashes) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,140,30,0)'); grd.addColorStop(0.5, 'rgba(255,200,80,1)'); grd.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = grd;
  if (dashes) {
    for (let i = 0; i < dashes; i++) g.fillRect((i * 1024) / dashes, 0, (1024 / dashes) * 0.62, 64);
    g.fillStyle = 'rgba(255,230,150,.9)';
    for (let i = 0; i < dashes; i++) g.fillRect((i * 1024) / dashes + 6, 26, 6, 12);
  } else g.fillRect(0, 0, 1024, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 반지름 1짜리 빛 띠 (scale로 키움)
export function fireBand(inner, outer, dashes) {
  const g = new THREE.RingGeometry(inner, outer, 128, 1);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 4, Math.hypot(pos.getX(i), pos.getY(i)) > (inner + outer) / 2 ? 1 : 0); }
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: ringTex(dashes), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 3;
  return m;
}

// handlers: onGround([x, z]) · onShop(shop) · onTable(t) · onSeat(t, s) · onKim() · onPerson(id)
export function createPlazaView(world, handlers) {
  const K = PLAZA.kim;
  const root = new THREE.Group();
  root.visible = false;
  world.scene.add(root);
  const marker = makeMarker();
  root.add(marker);
  const figs = new Map(); // id → { c, bub, blob, w, disp, yaw, phase, key, me, near, bubT }
  const cam = { yaw: 0, pitch: CAM.pitch, dist: CAM.dist, manual: false, init: false, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let last = 0, markerT = -9, fov0 = 0;

  function make(me) {
    const c = makeCharacter('#e0333c');
    c.setHold(true);
    c.group.traverse((o) => { o.castShadow = false; });
    const bub = bubble();
    bub.scale.multiplyScalar(1.4); // 광장에서는 말풍선을 조금 크게 (채팅이라 읽혀야 함)
    c.group.add(bub);
    const blob = blobShadow();
    c.group.add(blob);
    root.add(c.group);
    return { c, bub, blob, w: null, disp: null, yaw: 0, face: null, phase: Math.random() * 6, key: '', me, near: true, bubT: -9 };
  }
  const drop = (id, f) => {
    root.remove(f.c.group);
    f.c.group.traverse((o) => { if (o.geometry && o !== f.blob) o.geometry.dispose(); });
    figs.delete(id);
  };
  // 탁구대 자리 칸·표지판
  const tables = PLAZA.tables.map((t) => {
    const marks = t.seats.map((pt, i) => { const m = makeSeatMark(i < 2 ? 0 : 1); m.g.position.x = pt[0]; m.g.position.z = pt[1]; root.add(m.g); return m; });
    const sign = makeSign();
    sign.sp.position.set(t.x, 2.45, t.z);
    root.add(sign.sp);
    // 경기 중일 때만 보이는 불꽃 고리 마법진
    const rune = new THREE.Group();
    const r1 = fireBand(0.96, 1.04, 24), r2 = fireBand(0.9, 0.93, 60);
    rune.add(r1, r2); rune.scale.setScalar(BUBBLE_IN); rune.position.set(t.x, 0, t.z); rune.visible = false;
    root.add(rune);
    return { t, marks, sign, rune, r1, r2 };
  });

  // 김제빵 탁구대 (③): 김제빵이 동쪽 끝에 늘 서 있고 (다른 사람 눈엔 도전하는 사람은 안 보이고 김제빵 혼자), 위에 '🔥 N명 도전 중' 표지판
  const kim = { c: makeCharacter('#2f8a4e'), sign: makeSign(), n: -1, swingAt: 2 };
  kim.c.setHold(true);
  kim.c.group.traverse((o) => { o.castShadow = false; });
  kim.c.group.add(blobShadow());
  kim.c.group.position.set(K.chef[0], 0, K.chef[1]);
  kim.c.group.rotation.y = Math.PI / 2; // 서쪽(탁구대 쪽)을 본다
  root.add(kim.c.group);
  kim.sign.sp.position.set(K.x - 0.4, 3.05, K.z); // 김제빵 이름표 위로
  root.add(kim.sign.sp);
  tables.push({ sign: kim.sign }); // 카메라 앞 흐리게 (아래 update)
  // ⑤ 2대2에 불려 와 뛰어오는 김제빵 (src/plazaKim.js)
  const runners = createKimRunners(root, { path: planWalk, bubble, blob: blobShadow });

  // 사람 한 명 그리기 정보 p = { id, nick(이름표 글자), title(글자), look, w, me, face(서 있을 때 바라볼 쪽, 없으면 null) }
  function put(p) {
    let f = figs.get(p.id);
    if (!f) { f = make(!!p.me); figs.set(p.id, f); }
    f.me = !!p.me;
    f.face = typeof p.face === 'number' ? p.face : null;
    const key = JSON.stringify([p.nick, p.title, p.look]);
    if (f.key !== key) {
      f.key = key;
      applyLook(f.c, p.look || {});
      f.c.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      if (f.near) f.c.setTag(p.nick, f.me, p.title || '');
      f.nick = p.nick; f.title = p.title || '';
    }
    if (p.w && (!f.w || f.w.t !== p.w.t || f.w.to[0] !== p.w.to[0] || f.w.to[1] !== p.w.to[1])) {
      f.w = p.w;
      if (!f.disp) { const q = posAt(p.w, Date.now()); f.disp = [q[0], q[1]]; }
    }
    return f;
  }

  // 화면 좌표 → 광장 (가게면 그 가게, 아니면 바닥 점)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const boxes = PLAZA.shops.map((s) => {
    const r = shopRect(s);
    return { s, box: new THREE.Box3(new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, s.h + 2.6, r.z1 + 1.2)) };
  });
  // 탁구대 상자 (판 + 표지판 높이까지): 사람 대결용 t = 0~2, 김제빵 = 'kim'
  const tBox = (r, h) => new THREE.Box3(new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, h, r.z1));
  const tableBoxes = [...PLAZA.tables.map((t, i) => ({ t: i, box: tBox(t.rect, 1.1) })), { t: 'kim', box: tBox(K.rect, 1.1) },
    { t: 'kim', box: tBox({ x0: K.chef[0] - 0.45, x1: K.chef[0] + 0.45, z0: K.z - 0.45, z1: K.z + 0.45 }, 1.9) }]; // 김제빵을 눌러도
  const pBox = new THREE.Box3();
  function pick(px, py) {
    const rect = world.renderer.domElement.getBoundingClientRect();
    ndc.set(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    world.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, world.camera);
    if (frame.on) ray.ray.applyMatrix4(frame.inv); // 경기장 거품 안: 세상 좌표 → 광장 좌표
    let best = null, bd = Infinity;
    for (const b of boxes) {
      if (ray.ray.intersectBox(b.box, hitP)) { const d = hitP.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = { shop: b.s }; } }
    }
    for (const b of tableBoxes) {
      if (ray.ray.intersectBox(b.box, hitP)) { const d = hitP.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = b.t === 'kim' ? { kim: true } : { table: b.t }; } }
    }
    // 다른 사람 캐릭터 (콕 집어 초대)
    for (const [id, f] of figs) {
      if (f.me || !f.c.group.visible) continue;
      const gp = f.c.group.position;
      pBox.min.set(gp.x - 0.35, 0, gp.z - 0.35); pBox.max.set(gp.x + 0.35, 1.9, gp.z + 0.35);
      if (ray.ray.intersectBox(pBox, hitP)) { const d = hitP.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = { person: id }; } }
    }
    if (best) return best;
    if (!ray.ray.intersectPlane(ground, hitP)) return null;
    // 바닥의 자리 칸 근처를 눌렀으면 그 칸
    for (let t = 0; t < PLAZA.tables.length; t++) {
      const s = PLAZA.tables[t].seats.findIndex((pt) => Math.hypot(pt[0] - hitP.x, pt[1] - hitP.z) < 0.55);
      if (s >= 0) return { seat: [t, s] };
    }
    if (Math.hypot(PLAZA.kim.spot[0] - hitP.x, PLAZA.kim.spot[1] - hitP.z) < 0.55) return { kim: true };
    return { ground: [hitP.x, hitP.z] };
  }

  // ───── 입력: 왼쪽 클릭(탭) = 걷기, 오른쪽 버튼 끌기(휴대폰은 한 손가락 끌기) = 돌리기, 휠(두 손가락) = 가까이/멀리 ─────
  const canvas = world.renderer.domElement;
  const ptrs = new Map(); // pointerId → { x, y, x0, y0, t0, btn, moved }
  let pinch0 = 0, pinchDist0 = 0;
  const active = () => root.visible;
  canvas.addEventListener('contextmenu', (e) => { if (active()) e.preventDefault(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (!active()) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), btn: e.button, moved: false, touch: e.pointerType !== 'mouse' });
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchDist0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinch0 = cam.dist;
      for (const p of ptrs.values()) p.moved = true; // 두 손가락이면 탭 아님
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active()) return;
    const p = ptrs.get(e.pointerId);
    if (!p) { const h = pick(e.clientX, e.clientY); canvas.style.cursor = h && !h.ground ? 'pointer' : ''; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TOUCH_SLOP) p.moved = true;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cam.dist = clampN(pinch0 * (pinchDist0 / d), CAM.minDist, CAM.maxDist);
      return;
    }
    // 돌리기: 마우스는 오른쪽 버튼, 손가락은 한 손가락 끌기
    if ((p.btn === 2 || p.touch) && p.moved) {
      cam.yaw += dx * 0.006;
      cam.pitch = clampN(cam.pitch + dy * 0.004, CAM.minPitch, CAM.maxPitch);
      cam.manual = true;
    }
  });
  const up = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (!active() || p.moved || p.btn !== 0 || performance.now() - p.t0 > 900) return;
    const h = pick(e.clientX, e.clientY);
    if (h?.shop) handlers.onShop?.(h.shop);
    else if (h?.table != null) handlers.onTable?.(h.table);
    else if (h?.seat) handlers.onSeat?.(h.seat[0], h.seat[1]);
    else if (h?.kim) handlers.onKim?.();
    else if (h?.person) handlers.onPerson?.(h.person);
    else if (h?.ground) handlers.onGround?.(h.ground);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    if (!active()) return;
    e.preventDefault();
    cam.dist = clampN(cam.dist * Math.exp(e.deltaY * 0.0012), CAM.minDist, CAM.maxDist);
  }, { passive: false });

  const tmpV = new THREE.Vector3();
  // 경기장 거품: 탁구대 t가 세상 원점(경기 좌표)에 오도록 광장을 돌려 놓는다 (광장 배경·사람·카메라 모두)
  const frame = { on: false, m: new THREE.Matrix4(), inv: new THREE.Matrix4(), t: -1 };
  const toWorld = (v) => (frame.on ? v.applyMatrix4(frame.m) : v);
  let filter = null, camOff = false, plazaBits = true;
  return {
    root,
    figs,
    cam,
    pick,
    setVisible(on) {
      root.visible = on;
      canvas.style.touchAction = on ? 'none' : '';
      // 광장 카메라 화각은 광장에서만 (다른 화면 카메라는 원래 화각으로)
      if (on) fov0 = world.camera.fov;
      else if (fov0 && world.camera.fov !== fov0) { world.camera.fov = fov0; world.camera.updateProjectionMatrix(); }
      if (!on) { canvas.style.cursor = ''; ptrs.clear(); }
    },
    // 사람 명단 (나 포함). list = [{ id, nick, title, look, w, me }]
    sync(list) {
      const keep = new Set(list.map((p) => p.id));
      for (const [id, f] of figs) if (!keep.has(id)) drop(id, f);
      for (const p of list) put(p);
    },
    put,
    remove(id) { const f = figs.get(id); if (f) drop(id, f); },
    clear() { for (const [id, f] of figs) drop(id, f); },
    // 머리 위 말풍선 (약 3초)
    say(id, text) {
      const f = figs.get(id);
      if (!f) return;
      f.bub.draw(text);
      f.bub.visible = true;
      f.bubT = performance.now() / 1000;
    },
    // 탁구대 하나의 모습: seats = ['empty'|'taken'|'ready'] ×4, lines = 표지판 글자 [큰 줄, 작은 줄], color = 표지판 테두리
    setTable(t, { seats, lines, color = '#ffd23f', busy = false }) {
      const T = tables[t];
      if (!T) return;
      T.rune.visible = busy;
      seats.forEach((st, i) => {
        const m = T.marks[i];
        m.fill.material.opacity = st === 'empty' ? 0.18 : st === 'ready' ? 0.85 : 0.55;
        m.ring.material.opacity = st === 'off' ? 0.25 : 0.95;
        if (st === 'off') m.fill.material.opacity = 0.06;
      });
      drawSign(T.sign, lines, color);
    },
    // 김제빵 모습 (꾸미기·이름표) + 도전 중인 사람 수
    setKim(look, name, n) {
      if (!kim.look) { kim.look = true; applyLook(kim.c, look); kim.c.group.traverse((o) => { if (o.isMesh) o.castShadow = false; }); kim.c.setTag(name, false, ''); }
      if (n === kim.n) return;
      kim.n = n;
      drawSign(kim.sign, ['🤖 김제빵 탁구대', n > 0 ? `🔥 ${n}명 도전 중` : '누르면 혼자 하기 · 휴대폰도 OK'], n > 0 ? '#ff8a3d' : '#2f8a4e');
    },
    get kimN() { return kim.n; },
    // 불려 온 김제빵들 [{ key, seat, face, at, bye }]
    setKimRuns(list) { runners.sync(list); },
    get kimRuns() { return runners.count; },
    // 경기장 거품 좌표: t = 탁구대 번호 | null(광장 그대로). 광장 배경(world.plaza.root)도 같이
    setFrame(t) {
      const roots = [root, world.plaza?.root].filter(Boolean);
      if (t == null) { frame.on = false; frame.t = -1; for (const r of roots) { r.rotation.y = 0; r.position.set(0, 0, 0); r.updateMatrixWorld(true); } return; }
      const T = PLAZA.tables[t];
      frame.on = true; frame.t = t;
      for (const r of roots) { r.rotation.y = Math.PI / 2; r.position.set(-T.z, 0, T.x); r.updateMatrixWorld(true); }
      frame.m.copy(root.matrixWorld); frame.inv.copy(frame.m).invert();
    },
    get frameT() { return frame.on ? frame.t : null; },
    // 보일 사람 고르기 (거품 안에서는 원 안 사람만): fn(id, [x, z]) → true/false. null이면 모두
    setFilter(fn) { filter = fn; },
    // 관중석에 앉아 있는 동안은 카메라를 경기 쪽(관전 시점)이 정한다
    setCamOff(on) { camOff = on; },
    // 탁구대 자리 칸·표지판·김제빵·걷기 표시 (광장 것: 거품 안에서는 숨김)
    setPlazaBits(on) { for (const T of tables) { T.sign.sp.visible = on && T.sign.sp.visible; for (const m of T.marks || []) m.g.visible = on; if (T.rune) T.rune.visible = on && T.rune.visible; } kim.c.group.visible = on; plazaBits = on; },
    showMarker(x, z) { marker.position.set(x, 0.02, z); marker.visible = true; markerT = performance.now() / 1000; },
    // 카메라를 내 캐릭터 뒤로 바로 (처음 들어올 때)
    resetCam() { cam.init = false; cam.manual = false; },
    update(now, myId) {
      const dt = Math.min(0.1, now - (last || now));
      last = now;
      const nowMs = Date.now();
      const camP = world.camera.position;
      for (const f of figs.values()) {
        if (!f.w) continue;
        const [tx, tz] = posAt(f.w, nowMs);
        if (!f.disp) f.disp = [tx, tz];
        // 받은 걷기가 바뀌면 화면 위치가 조금 어긋날 수 있다 → 순간 이동 대신 부드럽게 따라붙기 (너무 멀면 바로)
        const ex = tx - f.disp[0], ez = tz - f.disp[1], e = Math.hypot(ex, ez);
        if (e > 3) { f.disp[0] = tx; f.disp[1] = tz; } else { const k = 1 - Math.exp(-dt * 10); f.disp[0] += ex * k; f.disp[1] += ez * k; }
        const g = f.c.group;
        g.position.set(f.disp[0], 0, f.disp[1]);
        g.visible = !filter || f.me || filter(f, f.disp);
        const left = Math.hypot(f.w.to[0] - f.disp[0], f.w.to[1] - f.disp[1]);
        const moving = left > 0.04;
        if (moving) {
          const dx = f.w.to[0] - f.w.from[0], dz = f.w.to[1] - f.w.from[1];
          if (Math.hypot(dx, dz) > 0.01) {
            const want = Math.atan2(-dx, -dz); // 캐릭터 앞 = -z
            let d = want - f.yaw;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            f.yaw += d * (1 - Math.exp(-dt * 12));
          }
          f.phase += dt * 11;
        }
        else if (f.face != null) { // 탁구대 자리에 서 있으면 탁구대 쪽을 본다
          let d = f.face - f.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          f.yaw += d * (1 - Math.exp(-dt * 8));
        }
        g.rotation.y = f.yaw;
        // 걷는 모습: 통통 튀며 살짝 앞으로 기울기 (다리가 없는 캐릭터)
        const walkK = moving ? 1 : 0;
        f.c.body.position.y = walkK * Math.abs(Math.sin(f.phase)) * 0.07 + Math.sin(now * 2.2 + f.phase) * 0.006;
        f.c.body.rotation.x += ((moving ? -0.13 : 0) - f.c.body.rotation.x) * (1 - Math.exp(-dt * 10));
        f.c.body.rotation.z = walkK * Math.sin(f.phase) * 0.05;
        // 먼 사람은 간단히 (이름표 생략·옷 효과 멈춤)
        const dist = toWorld(tmpV.set(f.disp[0], 1, f.disp[1])).distanceTo(camP);
        const near = f.me || dist < (f.near ? NEAR_TAG + 1 : NEAR_TAG - 1);
        if (near !== f.near) { f.near = near; f.c.setTag(near ? f.nick : null, f.me, f.title); }
        if (f.me || dist < NEAR_TICK) f.c.tickOutfit(now, dt);
        if (f.bub.visible && now - f.bubT > 3) f.bub.visible = false;
      }
      runners.update(now, dt);
      // 김제빵: 탁구채를 든 채 숨 쉬듯 흔들리고, 가끔 한 번씩 휘두른다 (도전하는 사람이 있으면 자주 — 같이 치는 중)
      if (now > kim.swingAt) {
        kim.c.stSwing = now;
        kim.c.stBlock = Math.random() < 0.25;
        kim.swingAt = now + (kim.n > 0 ? 0.9 + Math.random() * 0.6 : 3 + Math.random() * 3);
      }
      kim.c.body.position.y = Math.sin(now * 2.6) * 0.008;
      holdPose(kim.c, now, 0);
      kim.c.tickOutfit(now, dt);
      // 카메라 바로 앞의 탁구대 표지판은 흐리게 (화면을 가리지 않게)
      for (const T of tables) {
        if (T.rune?.visible) { T.r1.rotation.z = now * 0.25; T.r2.rotation.z = -now * 0.4; }
        if (!plazaBits) { T.sign.sp.visible = false; continue; }
        const d = toWorld(tmpV.copy(T.sign.sp.position)).distanceTo(camP);
        T.sign.sp.material.opacity = Math.min(1, Math.max(0, (d - 3.5) / 3));
        T.sign.sp.visible = T.sign.sp.material.opacity > 0.02;
      }
      if (marker.visible) {
        const a = now - markerT;
        const me = figs.get(myId);
        const arrived = me?.w && Math.hypot(me.w.to[0] - me.disp[0], me.w.to[1] - me.disp[1]) < 0.05;
        marker.scale.setScalar(1 + Math.sin(a * 6) * 0.12);
        marker.material.opacity = arrived ? Math.max(0, marker.material.opacity - dt * 3) : 0.9;
        if (arrived && marker.material.opacity <= 0) marker.visible = false;
      }
      // 3인칭 카메라: 내 캐릭터 뒤에서 따라간다. 걸을 때는 걷는 쪽으로 천천히 돌아간다 (오른쪽 끌기로 돌렸으면 다음 클릭까지 그대로)
      const me = figs.get(myId);
      if (!me?.disp) return;
      if (!cam.init) { cam.yaw = me.yaw; }
      else if (!cam.manual) {
        const moving = me.w && Math.hypot(me.w.to[0] - me.disp[0], me.w.to[1] - me.disp[1]) > 0.3;
        if (moving || me.face != null) { // 탁구대 자리에 서면 탁구대 쪽을 보는 내 뒤로
          let d = me.yaw - cam.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          cam.yaw += d * (1 - Math.exp(-dt * CAM.follow));
        }
      }
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); // 카메라가 보는 방향
      const look = tmpV.set(me.disp[0] + fx * 1.2, CAM.lookY, me.disp[1] + fz * 1.2);
      const h = Math.cos(cam.pitch) * cam.dist;
      let px = me.disp[0] - fx * h, pz = me.disp[1] - fz * h;
      const py = CAM.lookY + Math.sin(cam.pitch) * cam.dist;
      // 카메라가 가게 건물 안으로 들어가지 않게: 건물 앞면보다 뒤(북쪽)로는 안 간다
      const wallZ = PLAZA.shops[0].front + 0.4;
      if (pz < wallZ && me.disp[1] > wallZ) { const k = (me.disp[1] - wallZ) / (me.disp[1] - pz); px = me.disp[0] + (px - me.disp[0]) * k; pz = wallZ; }
      const k = cam.init ? 1 - Math.exp(-dt * 8) : 1;
      cam.pos.lerp(tmpV.clone().set(px, py, pz), cam.init ? k : 1);
      if (!cam.init) cam.pos.set(px, py, pz);
      cam.look.lerp(look, cam.init ? k : 1);
      if (!cam.init) cam.look.copy(look);
      cam.init = true;
      if (camOff) return;
      world.camera.position.copy(cam.pos);
      toWorld(world.camera.position);
      // 세로로 긴 화면(휴대폰)은 가게 3개가 다 들어오게 화각을 넓힌다
      const fov = Math.min(80, Math.max(55, (2 * Math.atan(Math.tan(0.4) / world.camera.aspect) * 180) / Math.PI));
      if (Math.abs(world.camera.fov - fov) > 0.01) { world.camera.fov = fov; world.camera.updateProjectionMatrix(); }
      world.camera.lookAt(toWorld(tmpV.copy(cam.look)));
    },
  };
}
