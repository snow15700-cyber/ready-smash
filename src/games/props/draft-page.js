// 광장 물건 상호작용 ① 시안 (props.html, plaza.md 10장). 한 캔버스에 칸마다 잘라 그림 (cats.html과 같은 방식)
// 고를 것: 푸드트럭 메뉴판(1~3) · 누르면 뜨는 메뉴 창(4~5) · 손에 든 모양(6~8) · 앉은 모습(9~11)
// 주소: ?t=12 시각 고정(스크린샷용) · ?view=front 앞에서 보기 · ?big=7 그 칸 크게
import * as THREE from 'three';
import { makeCharacter } from '../../scene.js';
import { applyLook } from '../../items.js';
import { foodTruck } from '../../campusProps.js';
import { MODELS, loadModel, fitOf } from '../../campusModels.js';
import { EAT, FOOD, FOODS, HOLD, SIT, TRUCK_MENU, drawFood, foodIconURL, holdFood, makeFood, sitPose } from './models.js';

const params = new URLSearchParams(location.search);
const fixedT = params.has('t') ? Number(params.get('t')) : null;
const grid = document.getElementById('grid'), canvas = document.getElementById('c'), bar = document.getElementById('bar');
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
r.setPixelRatio(Math.min(devicePixelRatio, 2));
r.outputColorSpace = THREE.SRGBColorSpace;
r.setScissorTest(true);
await document.fonts.load('40px Jua').catch(() => {});

const opt = { body: 'body_none', food: 'coffee', view: params.get('view') || 'back', speed: 1, sitFood: true };
const BODIES = [['body_none', '흰 몸'], ['body_uniform', '유니폼'], ['body_padding', '롱패딩'], ['body_chick', '병아리']];
const cells = [], chars = [];

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8a0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(3, 6, 5); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9); fill.position.set(-3, 4, -5); scene.add(fill); // 앞에서 보는 칸도 어둡지 않게
}
function floor(scene, rad, col = 0xd9d3c6) { const f = new THREE.Mesh(new THREE.CircleGeometry(rad, 48), new THREE.MeshLambertMaterial({ color: col })); f.rotation.x = -Math.PI / 2; scene.add(f); }
function person() { const c = makeCharacter('#e0333c'); c.setHold(true); applyLook(c, { body: opt.body }); chars.push(c); return c; }
const section = (title, sub) => { const h = document.createElement('h2'); h.className = 'sec'; h.innerHTML = `${title} <small>${sub}</small>`; grid.appendChild(h); };
function cell(no, label, sub, kind, setup) {
  const el = document.createElement('div'); el.className = 'cell ' + kind;
  el.innerHTML = `<span>${no ? `<i>${no}</i>` : ''}${label}</span><small>${sub}</small>`; grid.appendChild(el);
  const scene = new THREE.Scene(); lights(scene);
  const holder = new THREE.Group(); scene.add(holder);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  const c = { el, no, scene, holder, cam, yaw: 0, drag: null, ticks: [], view: null };
  setup(c);
  el.addEventListener('pointerdown', (e) => { c.drag = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (c.drag != null) { c.yaw += (e.clientX - c.drag) * 0.012; c.drag = e.clientX; } });
  el.addEventListener('pointerup', () => { c.drag = null; });
  el.addEventListener('dblclick', () => el.classList.toggle('big'));
  if (params.get('big') === String(no)) el.classList.add('big');
  cells.push(c);
  return c;
}
const look = (cam, pos, at) => { cam.position.set(...pos); cam.lookAt(...at); };

// ── 메뉴판 그림 (캔버스)
function chalkTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 700;
  const x = c.getContext('2d');
  x.fillStyle = '#2f4a3a'; x.fillRect(0, 0, 512, 700);
  x.strokeStyle = '#b07a45'; x.lineWidth = 26; x.strokeRect(13, 13, 486, 674);
  x.fillStyle = '#fffbe8'; x.font = 'bold 70px Jua, sans-serif'; x.textAlign = 'center'; x.fillText('메뉴', 256, 104);
  x.strokeStyle = 'rgba(255,251,232,.5)'; x.lineWidth = 4; x.setLineDash([12, 10]); x.beginPath(); x.moveTo(60, 130); x.lineTo(452, 130); x.stroke(); x.setLineDash([]);
  TRUCK_MENU.forEach((id, i) => {
    const y = 210 + i * 126;
    x.fillStyle = 'rgba(255,251,232,.95)'; x.beginPath(); x.arc(110, y, 52, 0, Math.PI * 2); x.fill();
    drawFood(x, id, 110, y + 4, 86);
    x.fillStyle = '#fffbe8'; x.textAlign = 'left'; x.font = 'bold 54px Jua, sans-serif'; x.fillText(FOOD[id].name, 182, y + 4);
    x.font = 'bold 30px Jua, sans-serif'; x.fillStyle = '#ffd98a'; x.fillText(FOOD[id].fx.replace('10분 · ', '').replace(' 코인', ''), 182, y + 44);
    x.fillStyle = '#ff9a3d'; x.beginPath(); x.arc(420, y - 14, 18, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fffbe8'; x.font = 'bold 44px Jua, sans-serif'; x.fillText('10', 444, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function roundTex(id) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = FOOD[id].col; x.beginPath(); x.arc(128, 128, 126, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fffbe8'; x.beginPath(); x.arc(128, 128, 108, 0, Math.PI * 2); x.fill();
  drawFood(x, id, 128, 112, 150);
  x.fillStyle = '#e0333c'; x.beginPath(); x.roundRect(78, 186, 100, 44, 22); x.fill();
  x.fillStyle = '#ff9a3d'; x.beginPath(); x.arc(102, 208, 12, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 34px Jua, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('10', 142, 210);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const lamb = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
function mesh(p, geo, m, x, y, z) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; }

// 1안: 칠판 입간판 (트럭 왼쪽 앞, 그림 4개 + 가격)
function menuChalk(g) {
  const tex = chalkTex();
  for (const s of [-1, 1]) {
    const b = mesh(g, new THREE.BoxGeometry(0.85, 1.15, 0.04), lamb(0x8a5a33), -2.75, 0.68, 1.55 + s * 0.15); b.rotation.x = s * 0.22;
  }
  const face = mesh(g, new THREE.PlaneGeometry(0.76, 1.04), new THREE.MeshBasicMaterial({ map: tex }), -2.75, 0.7, 1.725); face.rotation.x = 0.22;
}
// 2안: 판매창 덮개 끝에 매달린 둥근 그림판 4개 (살랑살랑)
function menuHang(g, ticks) {
  const rope = lamb(0x3a2a22);
  TRUCK_MENU.forEach((id, i) => {
    const pivot = new THREE.Group(); pivot.position.set(-1.55 + i * 0.7, 2.27, 1.86); g.add(pivot);
    for (const sx of [-1, 1]) mesh(pivot, new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), rope, sx * 0.12, -0.1, 0);
    const disk = mesh(pivot, new THREE.CylinderGeometry(0.27, 0.27, 0.03, 32), [lamb(0xfffbe8), lamb(0xffffff, { map: roundTex(id) }), lamb(0xfffbe8)], 0, -0.42, 0);
    disk.rotation.x = Math.PI / 2; disk.rotation.y = Math.PI / 2; // 그림 면(윗면)이 앞(+z)으로, 그림 위쪽이 위로
    ticks.push((t) => { pivot.rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.05; });
  });
}
// 3안: 지붕 위 큰 모형 4개 (가게 지붕 상징처럼, 천천히 빙글)
function menuRoof(g, ticks) {
  TRUCK_MENU.forEach((id, i) => {
    const f = makeFood(id); f.scale.setScalar(id === 'hotdog' ? 4.2 : 5);
    const base = new THREE.Group(); base.position.set(-1.75 + i * 0.95, 2.62 + (id === 'hotdog' ? 0.25 : 0), 0.1); base.add(f); g.add(base);
    if (id === 'hotdog') mesh(g, new THREE.CylinderGeometry(0.12, 0.16, 0.25, 16), lamb(0xd7262e), base.position.x, 2.72, 0.1);
    ticks.push((t) => { base.rotation.y = Math.sin(t * 0.7 + i) * 0.5; f.userData.tick(t); base.position.y = 2.62 + (id === 'hotdog' ? 0.25 : 0) + Math.abs(Math.sin(t * 2 + i * 0.8)) * 0.04; });
  });
}

// 트럭 칸: 트럭 + 판매창 앞 손님 하나(커피 들고) — 크기 비교
function truckCell(no, label, sub, build, sign) {
  cell(no, label, sub, 'truck', (c) => {
    floor(c.scene, 7.5);
    const g = foodTruck(null, { menu: false, sign }); c.holder.add(g);
    build(g, c.ticks);
    const p = person(); p.group.position.set(-0.3, 0, 2.2); c.holder.add(p.group);
    let h = null, t0 = 0;
    c.ticks.push((t) => { if (!h || t - t0 > EAT.life + 2.5) { h?.drop(); h = holdFood(p, 'coffee', 'A', t - 2); t0 = t - 2; } h.tick(t); p.body.rotation.x = h.nod; });
    c.view = () => look(c.cam, [2.6, 2.8, 8.6], [-0.8, 1.6, 0.8]);
    c.cam.fov = 34;
  });
}

section('🚚 푸드트럭 메뉴판', '메뉴 4개(☕ 커피 · 🥤 에이드 · 🐟 붕어빵 · 🌭 핫도그, 모두 10코인). 앞 사람 = 크기 비교');
truckCell(1, '칠판 입간판', '지금 자리(트럭 왼쪽 앞)에 그림 4개 + 효과 + 가격. 가까이 와야 읽힘', menuChalk, true);
truckCell(2, '판매창에 매달린 그림판', '덮개 끝에 둥근 판 4개가 살랑살랑. 그림 + 가격만', menuHang, true);
truckCell(3, '지붕 위 큰 모형', '가게 지붕 상징처럼 큰 음식 4개(간판 대신). 멀리서도 뭘 파는지 보임', menuRoof, false);

// ── 누르면 뜨는 메뉴 창 (HTML, 화면 디자인 '탁구 색 + 유리')
section('📋 트럭을 누르면 뜨는 창', '그림을 누르면 바로 삼(코인이 모자라면 회색). 아래 알약 = 먹은 뒤 내 화면 왼쪽 위');
const icons = Object.fromEntries(FOODS.map((f) => [f.id, foodIconURL(f.id)]));
const pill = `<div class="pill"><img src="${icons.coffee}">+30% · 8:12 남음</div>`;
function pop(no, label, html) { const el = document.createElement('div'); el.className = 'pop'; el.innerHTML = `${html}<div class="tag"><i>${no}</i>${label}</div>`; grid.appendChild(el); }
pop(4, '카드 4장', `<div class="glass"><h3>🚚 간식 트럭</h3><div class="cards">${TRUCK_MENU.map((id) => `<div class="card"><img src="${icons[id]}"><b>${FOOD[id].name}</b><em>${FOOD[id].fx}</em><button class="coin">10</button></div>`).join('')}</div></div>${pill}`);
pop(5, '한 줄 목록', `<div class="glass"><h3>🚚 간식 트럭</h3><div class="rows">${TRUCK_MENU.map((id) => `<div class="row"><img src="${icons[id]}"><div><b>${FOOD[id].name}</b><em>${FOOD[id].fx}</em></div><button class="coin">10</button></div>`).join('')}</div></div>${pill}`);
{ const el = document.createElement('div'); el.className = 'pop'; el.style.background = 'linear-gradient(160deg,#cfe0f0,#e8eef5)'; el.innerHTML = `<div style="font-family:Jua;font-size:17px;color:#23304a;margin-bottom:6px">참고: 그림 6개 (창·메뉴판·머리 위에 씀)</div><div class="cards" style="grid-template-columns:repeat(3,1fr)">${FOODS.map((f) => `<div class="card"><img src="${icons[f.id]}"><b>${f.name}</b><em>${f.from} · ${f.price ? f.price + '코인' : '무료'}</em></div>`).join('')}</div>`; grid.appendChild(el); }

// ── 손에 든 모양
section('🤲 손에 든 모양', `탁구채 반대 손. 5초마다 한 입(준비 → 입 앞에서 냠 → 돌아오기), 한 입마다 조금 작아지고 ${EAT.life}초에 '뿅'. 위 단추로 음식·몸·보는 쪽 바꾸기`);
const holdCells = [];
for (const [i, key] of ['A', 'B', 'C'].entries()) {
  holdCells.push(cell(6 + i, HOLD[key].name, key === 'C' ? '머리 위 동그라미 = 남은 시간(남들도 멀리서 알아봄)' : key === 'A' ? '실제 크기. 광장 카메라(8.5m 뒤)에선 작음' : '조금 과장된 크기', '', (c) => {
    floor(c.scene, 1.6);
    const p = person(); c.holder.add(p.group);
    c.p = p; c.style = key;
    c.make = (t) => { c.h?.drop(); c.h = holdFood(p, opt.food, key, t, 1); c.t0 = t; };
    c.ticks.push((t) => { if (!c.h || t - c.t0 > EAT.life + 2.5) c.make(t); c.h.tick(t); p.body.rotation.x = c.h.nod; });
    c.view = () => (opt.view === 'back' ? look(c.cam, [0.6, 1.75, 3.3], [-0.1, 0.95, 0]) : look(c.cam, [-1.0, 1.3, -2.9], [-0.1, 0.95, 0]));
  }));
}
// 광장 거리 그대로 (8.5m 뒤 · 위에서 0.42) — 실제로 얼마나 보이나
for (const [i, key] of ['A', 'B', 'C'].entries()) {
  holdCells.push(cell(6 + i, '광장 카메라 거리', '실제 광장처럼 8.5m 뒤에서 (두 번 누르면 화면 크기로)', '', (c) => {
    floor(c.scene, 40, 0xd9d3c6);
    const p = person(); c.holder.add(p.group);
    c.style = key;
    c.make = (t) => { c.h?.drop(); c.h = holdFood(p, opt.food, key, t, 1); c.t0 = t; };
    c.ticks.push((t) => { if (!c.h || t - c.t0 > EAT.life + 2.5) c.make(t); c.h.tick(t); p.body.rotation.x = c.h.nod; });
    c.cam.fov = 50;
    c.view = () => look(c.cam, [0, 1.1 + Math.sin(0.42) * 8.5, Math.cos(0.42) * 8.5], [0, 1.1, 0]);
    c.noSpin = true;
  }));
}
section('🍽️ 음식 6가지 모양', '실제 크기의 4배로 확대. 끌면 돌려 볼 수 있어요');
for (const f of FOODS) cell(0, `${f.name}`, `${f.from} · ${f.fx}`, '', (c) => {
  const m = makeFood(f.id, 0); m.scale.setScalar(4); c.holder.add(m);
  floor(c.scene, 0.7, 0xe7e1d4);
  c.ticks.push((t) => m.userData.tick(t));
  c.view = () => look(c.cam, [0, 0.9, 3.0], [0, 0.42, 0]);
});

// ── 앉은 모습 (벤치 · 트럭 의자)
section('🪑 앉은 모습', '팔다리가 없는 캐릭터라 3가지 방법. 위: 광장 벤치 · 아래: 푸드트럭 의자에서 먹기');
const bench = loadModel(MODELS.bench.files[0]).then((m) => {
  const { k, y } = fitOf(m, MODELS.bench);
  const g = new THREE.Group(), mm = m.clone(); mm.scale.setScalar(k); mm.position.y = y; g.add(mm);
  // 앉는 면 높이 · 등받이 방향: 위에서 아래로 쏘아 봄
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), hit = (z) => { ray.set(new THREE.Vector3(0.05, 3, z), new THREE.Vector3(0, -1, 0)); return ray.intersectObject(g, true)[0]?.point.y ?? 0; };
  const zs = Array.from({ length: 21 }, (_, i) => -0.5 + i * 0.05).map((z) => [z, hit(z)]);
  const top = (sgn) => Math.max(...zs.filter(([z]) => z * sgn > 0).map(([, h]) => h));
  const back = top(1) >= top(-1) ? 1 : -1; // 등받이가 있는 쪽 (+z 또는 -z) — Bench_1은 +z
  const seat = Math.max(...zs.filter(([, h]) => h > 0.2 && h < 0.6).map(([, h]) => h)); // 약 0.4m
  return { g, seat, back, zs };
});
for (const [i, key] of ['A', 'B', 'C'].entries()) {
  cell(9 + i, SIT[key].name, '광장 벤치', 'sit', (c) => {
    floor(c.scene, 2, 0xc9c2b3);
    const p = person(); c.holder.add(p.group); p.group.visible = false;
    bench.then(({ g, seat, back }) => {
      const b = g.clone(); c.holder.add(b);
      p.group.rotation.y = back > 0 ? 0 : Math.PI; // 앞(-z)이 등받이 반대쪽
      p.group.position.set(-0.45, 0, back * 0.04);
      const s = sitPose(p, key, seat);
      const p2 = person(); c.holder.add(p2.group); p2.group.rotation.y = p.group.rotation.y; p2.group.position.set(0.45, 0, back * 0.04);
      const s2 = sitPose(p2, key, seat);
      c.ticks.push((t) => { s.tick(t); s2.tick(t + 1.3); });
      p.group.visible = true;
      c.view = () => look(c.cam, [1.4, 1.5, -back * 3.6], [0, 0.6, 0]); // 앉은 사람 앞쪽에서
    });
    c.view = () => look(c.cam, [1.4, 1.5, -3.6], [0, 0.6, 0]);
  });
}
for (const [i, key] of ['A', 'B', 'C'].entries()) {
  cell(9 + i, '푸드트럭 의자 + 먹기', '빨간 동그란 의자(높이 0.5m) · 둥근 탁자', 'sit', (c) => {
    floor(c.scene, 2, 0xc9c2b3);
    const g = new THREE.Group(); c.holder.add(g);
    const white = lamb(0xfaf8f2), dark = lamb(0x2b2a33), red = lamb(0xd7262e);
    mesh(g, new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32), white, 0, 0.75, 0); mesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), dark, 0, 0.38, 0); mesh(g, new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16), dark, 0, 0.02, 0);
    for (const sx of [-1, 1]) { mesh(g, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), red, sx * 0.85, 0.48, 0); mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.46, 6), dark, sx * 0.85, 0.24, 0); }
    const p = person(); c.holder.add(p.group); p.group.position.set(-0.85, 0, 0); p.group.rotation.y = -Math.PI / 2; // 탁자(+x)를 봄
    const s = sitPose(p, key, 0.505);
    c.p = p; c.style = 'A';
    c.make = (t) => { c.h?.drop(); c.h = opt.sitFood ? holdFood(p, opt.food, 'A', t, 2) : null; c.t0 = t; };
    c.ticks.push((t) => { if (c.h === undefined || t - c.t0 > EAT.life + 2.5) c.make(t); c.h?.tick(t); s.tick(t, c.h?.nod || 0); });
    c.view = () => look(c.cam, [-0.9, 2.1, -4.6], [-0.35, 0.85, 0]) // 먹는 손(왼쪽) 쪽에서;
  });
}

// ── 단추 줄
function buttons() {
  bar.innerHTML = '';
  const grp = (label, list, key, after) => {
    const b = document.createElement('b'); b.textContent = label; bar.appendChild(b);
    for (const [v, name] of list) {
      const e = document.createElement('button'); e.textContent = name; if (opt[key] === v) e.className = 'on';
      e.onclick = () => { opt[key] = v; after?.(); buttons(); };
      bar.appendChild(e);
    }
  };
  grp('음식', FOODS.map((f) => [f.id, f.name]), 'food', () => remake());
  grp('몸', BODIES, 'body', () => { for (const c of chars) applyLook(c, { body: opt.body }); });
  grp('들기 칸 보기', [['back', '뒤에서 (광장처럼)'], ['front', '앞에서']], 'view');
  grp('빠르기', [[1, '보통'], [3, '×3']], 'speed');
  grp('의자에서', [[true, '먹기'], [false, '그냥 앉기']], 'sitFood', () => remake());
}
const remake = () => { for (const c of cells) if (c.make) c.make(clock()); };
buttons();

const wrap = canvas.parentElement;
let simT = 0, lastMs = null;
const clock = () => (fixedT ?? simT);
function frame(ms) {
  if (lastMs != null) simT += ((ms - lastMs) / 1000) * opt.speed;
  lastMs = ms;
  const t = clock();
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (canvas.width !== Math.round(W * r.getPixelRatio()) || canvas.height !== Math.round(H * r.getPixelRatio())) r.setSize(W, H, false);
  r.setScissor(0, 0, W, H); r.clear();
  const wr = wrap.getBoundingClientRect();
  for (const ch of chars) ch.tickOutfit(t, 1 / 60);
  for (const c of cells) {
    const b = c.el.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue;
    const x = b.left - wr.left, y = H - (b.bottom - wr.top);
    r.setViewport(x, y, b.width, b.height); r.setScissor(x, y, b.width, b.height);
    c.cam.aspect = b.width / b.height; c.view(); c.cam.updateProjectionMatrix();
    c.holder.rotation.y = c.yaw + (c.drag == null && fixedT == null && !c.noSpin ? Math.sin(simT * 0.35) * 0.25 : 0);
    for (const f of c.ticks) f(t);
    r.render(c.scene, c.cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__props = { cells, opt, bench };
