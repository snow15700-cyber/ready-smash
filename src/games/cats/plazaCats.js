// 🐱 광장 선착장 고양이 6마리 (docs/dev/cats.md 3a): 배회(rules.js catAt — 서버 시각으로 모두 같은 자리) · 누르면 말풍선 창 · '🐟 주기'
//  · 하트는 사람마다 따로(서버 37_cats.sql). 배부른 고양이(1시간 안에 내가 준)는 내 화면에서만 쉴 때 벌러덩 zzz
//  · ♥1~♥2 행동(3b)·내 고양이 창(3c)은 아직
import * as THREE from 'three';
import { account, catFeed, catList, marketNow, syncServerClock } from '../../account.js';
import { PIER } from '../../campusLayout.js';
import { catHooks, plazaApi } from '../../ui/plaza.js';
import { hud } from '../../ui/hud.js';
import { esc, world } from '../../ui/state.js';
import { SPECIES } from '../fishing/rules.js';
import { makeCat } from './models.js';
import { CAT_IDS, CAT_NAME, catAt, heartOf, heartProgress, heartsText } from './rules.js';

const SCALE = 0.75;
const fishName = (id) => SPECIES.find((s) => s.id === id)?.name || '생선';
let cats = null, pop = null, loadedFor = null;

function build() {
  const root = new THREE.Group(); root.name = 'plazaCats';
  plazaApi.view.root.add(root);
  cats = CAT_IDS.map((id) => {
    const m = makeCat(id), g = new THREE.Group();
    m.scale.setScalar(SCALE); g.add(m); root.add(g);
    return { id, m, g, yaw: null, eatT: -9, eatAt: null };
  });
  // 누르기: 고양이 둘레 상자 (작아서 조금 넉넉하게)
  const box = new THREE.Box3(), hit = new THREE.Vector3();
  plazaApi.view.addPicker((ray) => {
    let best = null;
    for (const c of cats) {
      if (!c.g.visible) continue;
      const p = c.g.position;
      box.min.set(p.x - 0.5, p.y, p.z - 0.5); box.max.set(p.x + 0.5, p.y + 0.85, p.z + 0.5);
      if (ray.intersectBox(box, hit)) { const d = hit.distanceTo(ray.origin); if (!best || d < best.d) best = { d, click: () => openPop(c) }; }
    }
    return best;
  });
  // ♥ 올라가는 그림
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'); x.font = '52px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('💗', 32, 36);
  heartTex = new THREE.CanvasTexture(cv);
  const cf = document.createElement('canvas'); cf.width = cf.height = 64;
  const y = cf.getContext('2d'); y.font = '50px sans-serif'; y.textAlign = 'center'; y.textBaseline = 'middle'; y.fillText('🐟', 32, 36);
  fishTex = new THREE.CanvasTexture(cf);
}
let heartTex = null, fishTex = null;
const floats = [];
function floatSprite(tex, pos, dur = 1.6, rise = 0.9, size = 0.38) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(size, size, 1); sp.position.copy(pos);
  plazaApi.view.root.add(sp);
  floats.push({ sp, t0: performance.now() / 1000, dur, rise, y0: pos.y });
}

// ── 말풍선 창 ──
const css = document.createElement('style');
css.textContent = `
#cat-pop { position: fixed; z-index: 30; transform: translate(-50%, -100%); min-width: 170px; padding: 10px 12px 12px; border-radius: 16px;
  background: rgba(255,255,255,.92); backdrop-filter: blur(8px); box-shadow: 0 6px 20px rgba(0,0,0,.18); text-align: center; font-size: 14px; color: #33302c; pointer-events: auto; }
#cat-pop::after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -8px; border: 8px solid transparent; border-bottom: 0; border-top-color: rgba(255,255,255,.92); }
#cat-pop .nm { font-weight: 700; font-size: 16px; }
#cat-pop .ht { color: #ff5f8f; font-size: 17px; letter-spacing: 1px; margin: 2px 0; }
#cat-pop .bar { height: 6px; border-radius: 3px; background: #f1e6ea; overflow: hidden; margin: 2px 6px 8px; }
#cat-pop .bar i { display: block; height: 100%; background: linear-gradient(90deg, #ff9db8, #ff5f8f); }
#cat-pop button { border: 0; border-radius: 12px; padding: 8px 14px; font: inherit; font-weight: 700; background: #ff7b54; color: #fff; cursor: pointer; }
#cat-pop button:disabled { background: #c9c3bd; cursor: default; }
#cat-pop .sm { font-size: 12px; color: #7a736b; margin-top: 6px; }
#cat-pop .x { position: absolute; right: 6px; top: 2px; background: none; color: #9a928a; padding: 2px 6px; font-size: 16px; }
`;
document.head.appendChild(css);

function openPop(c) {
  closePop();
  const el = document.createElement('div'); el.id = 'cat-pop';
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  pop = { c, el, t0: performance.now(), busy: false };
  renderPop();
  if (account.loggedIn && !account.cats) catList().then(renderPop);
}
function closePop() { pop?.el.remove(); pop = null; }
const v3 = new THREE.Vector3();
function placePop() {
  if (!pop) return;
  v3.copy(pop.c.g.position); v3.y += 0.95;
  plazaApi.view.root.localToWorld(v3);
  v3.project(world.camera);
  if (v3.z > 1) { pop.el.style.display = 'none'; return; }
  const r = world.renderer.domElement.getBoundingClientRect();
  pop.el.style.display = '';
  pop.el.style.left = `${r.left + ((v3.x + 1) / 2) * r.width}px`;
  pop.el.style.top = `${r.top + ((1 - v3.y) / 2) * r.height}px`;
}
const minsLeft = (c) => Math.max(1, Math.ceil(((account.cats?.[c.id]?.readyAt || 0) - Date.now()) / 60000));
function renderPop() {
  if (!pop) return;
  const { c, el } = pop, me = account.cats?.[c.id], pts = me?.pts || 0;
  const full = me && me.readyAt > Date.now();
  const [a, b] = heartProgress(pts);
  let btn, sm;
  if (!account.loggedIn) { btn = '<button disabled>🐟 주기</button>'; sm = '로그인하면 생선을 줄 수 있어요'; }
  else if (full) { btn = `<button disabled>😴 배불러요 · ${minsLeft(c)}분 뒤</button>`; sm = '밥은 1시간에 한 번이에요'; }
  else { btn = `<button class="feed"${pop.busy ? ' disabled' : ''}>🐟 주기</button>`; sm = '가방에서 지금 가장 싼 생선을 줘요'; }
  el.innerHTML = `<button class="x">×</button><div class="nm">${esc(CAT_NAME[c.id])}</div>
    <div class="ht">${heartsText(pts)}</div>${account.loggedIn ? `<div class="bar"><i style="width:${(a / b) * 100}%"></i></div>` : ''}
    ${btn}<div class="sm">${sm}</div>`;
  el.querySelector('.x').onclick = closePop;
  el.querySelector('.feed')?.addEventListener('click', () => feed(c));
  placePop();
}
async function feed(c) {
  if (!pop || pop.busy) return;
  pop.busy = true; renderPop();
  // 멀면 고양이 옆까지 걸어가서 줌
  const p = plazaApi.pos(), q = c.g.position;
  const d = Math.hypot(p[0] - q.x, p[1] - q.z);
  if (d > 2.2) {
    const k = (d - 1.2) / d;
    await new Promise((res) => plazaApi.walkTo([p[0] + (q.x - p[0]) * k, p[1] + (q.z - p[1]) * k], { then: res }));
  }
  const r = await catFeed(c.id);
  if (pop) pop.busy = false;
  if (r.status === 'ok') {
    c.eatT = performance.now() / 1000; c.eatAt = c.g.position.clone();
    floatSprite(fishTex, v3.copy(c.g.position).add(new THREE.Vector3(Math.sin(c.yaw || 0) * 0.3, 0.15, Math.cos(c.yaw || 0) * 0.3)), 2.2, 0, 0.3);
    setTimeout(() => floatSprite(heartTex, c.g.position.clone().add(new THREE.Vector3(0, 0.8, 0))), 900);
    const h = heartOf(r.pts);
    hud.toast(r.up ? `💗 ${CAT_NAME[c.id]}와(과) 더 친해졌어요! ${heartsText(r.pts)}` : `🐟 ${fishName(r.fish)}을(를) 줬어요 · ${CAT_NAME[c.id]} ${'♥'.repeat(h) || '♡'} (${heartProgress(r.pts)[0]}/10)`, 2600);
  } else if (r.status === 'no_fish') hud.toast('🎒 가방에 생선이 없어요 · 낚시해서 잡아 와요', 2400);
  else if (r.status === 'wait') hud.toast(`😴 ${CAT_NAME[c.id]}는 배불러요 · ${minsLeft(c)}분 뒤에 다시`, 2200);
  else if (r.status === 'guest') hud.toast('로그인하면 생선을 줄 수 있어요', 2000);
  else hud.toast('잠깐 연결이 안 돼요. 다시 눌러 주세요', 2000);
  renderPop();
}

// ── 매 프레임 (ui/plaza.js plazaFrame) ──
catHooks.frame = (now, p) => {
  if (!cats) { build(); syncServerClock(); }
  // 로그인이 바뀌면 내 하트 다시 받기
  const who = account.loggedIn ? account.player?.id : null;
  if (who !== loadedFor) { loadedFor = who; account.cats = null; if (who) catList(); }
  const ms = marketNow(), t = performance.now() / 1000;
  const camP = world.camera.position;
  for (const c of cats) {
    const s = catAt(c.id, ms);
    let pose = s.pose, x = s.x, z = s.z, y = PIER.y + s.y, yaw = s.yaw;
    const eating = t - c.eatT < 2.6;
    if (eating) { x = c.eatAt.x; z = c.eatAt.z; y = c.eatAt.y; pose = 'nod'; yaw = c.yaw; } // 내 화면: 먹는 동안 그 자리에서 냠냠
    else {
      if (t - c.eatT < 3.6) { const f = t - c.eatT - 2.6; x = c.eatAt.x + (x - c.eatAt.x) * f; z = c.eatAt.z + (z - c.eatAt.z) * f; } // 제자리로 천천히
      if (pose !== 'walk' && account.cats?.[c.id]?.readyAt > Date.now()) pose = 'belly'; // 배부르면 벌러덩 zzz
    }
    c.g.position.set(x, y, z);
    if (c.yaw == null) c.yaw = yaw;
    let dy = yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * Math.min(1, 0.12);
    c.g.rotation.y = c.yaw;
    // 멀면 몸짓 계산 안 함 (선착장이 안 보이는 광장 위쪽)
    v3.set(x, y, z); plazaApi.view.root.localToWorld(v3);
    if (v3.distanceTo(camP) < 70) c.m.userData.anim(t + c.m.id, pose);
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i], k = (t - f.t0) / f.dur;
    if (k >= 1) { plazaApi.view.root.remove(f.sp); f.sp.material.dispose(); floats.splice(i, 1); continue; }
    f.sp.position.y = f.y0 + f.rise * k; f.sp.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  }
  if (pop) {
    placePop();
    const q = pop.c.g.position;
    if (!pop.busy && (performance.now() - pop.t0 > 15000 || Math.hypot(p[0] - q.x, p[1] - q.z) > 14)) closePop(); // 오래되거나 멀어지면 닫음
    else if (performance.now() - (pop.rt || 0) > 20000) { pop.rt = performance.now(); renderPop(); } // 'n분 뒤' 고치기
  }
};
catHooks.hidden = () => closePop();
// 점검·디버그: window.__smash.cats
export const catsDebug = { get cats() { return cats; }, openPop: (id) => openPop(cats.find((c) => c.id === id)), feed: (id) => feed(cats.find((c) => c.id === id)), catAt };
