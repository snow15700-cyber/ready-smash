// 🐱 광장 선착장 고양이 6마리 (docs/dev/cats.md 3a): 배회(rules.js catAt — 서버 시각으로 모두 같은 자리) · 누르면 말풍선 창 · '🐟 주기'
//  · 하트는 사람마다 따로(서버 37_cats.sql). 배부른 고양이(1시간 안에 내가 준)는 내 화면에서만 쉴 때 벌러덩 zzz
//  · 3b (내 화면에서만, 하트는 내 것): ♥1 선착장에 오면 꼬리 세우고 달려와 다리에 비비기 · ♥2 낚시하면 옆에 앉아 리듬에 까딱,
//    Perfect '냥!' 폴짝 · 놓치면 귀 접힘 · 잡으면 앞발 툭툭. 한 번에 하트 높은 순 3마리까지. 끝나면 제자리(배회)로 돌아감
//  · 내 고양이 창(3c)은 아직
import * as THREE from 'three';
import { account, catFeed, catList, marketNow, syncServerClock } from '../../account.js';
import { PIER, heightAt, onPier } from '../../campusLayout.js';
import { catHooks, fishHooks, plazaApi } from '../../ui/plaza.js';
import { hud } from '../../ui/hud.js';
import { esc, world } from '../../ui/state.js';
import { SPECIES } from '../fishing/rules.js';
import { makeCat, setCatWear } from './models.js';
import { CAT_IDS, CAT_NAME, MAX_HEART, OUTFITS, catAt, catCanStand, catPath, heartOf, heartProgress, heartsText } from './rules.js';

const SCALE = 0.75;
const fishName = (id) => SPECIES.find((s) => s.id === id)?.name || '생선';
let cats = null, pop = null, loadedFor = null;

function build() {
  const root = new THREE.Group(); root.name = 'plazaCats';
  plazaApi.view.root.add(root);
  cats = CAT_IDS.map((id) => {
    const m = makeCat(id), g = new THREE.Group();
    m.scale.setScalar(SCALE); g.add(m); root.add(g);
    return { id, m, g, yaw: null, eatT: -9, eatAt: null, ov: null, cur: null, comeT: -999, earT: -9, hopT: -9, tapT: -9 };
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
#cat-pop .my { display: block; margin: 8px auto 0; padding: 5px 10px; background: #f3ece6; color: #6b5d50; font-size: 12px; }
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
    ${btn}<div class="sm">${sm}</div>${account.loggedIn ? '<button class="my">🐱 내 고양이</button>' : ''}`;
  el.querySelector('.x').onclick = closePop;
  el.querySelector('.feed')?.addEventListener('click', () => feed(c));
  el.querySelector('.my')?.addEventListener('click', async () => { closePop(); (await import('./myCats.js')).openMyCats(); });
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
    c.eatT = performance.now() / 1000; c.eatAt = c.g.position.clone(); if (!c.ov) c.ov = { mode: 'hold' };
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

// ── 3b: 다가오기 · 비비기 · 옆에 앉기 (내 화면만) ──
const myHeart = (c) => heartOf(account.cats?.[c.id]?.pts || 0);
let wasOnPier = false, wasFishing = false, lastT = 0;
function callCats(me, force) {
  const now = performance.now() / 1000;
  const list = cats.filter((c) => c.id !== myFollow?.id && myHeart(c) >= 1 && (force || now - c.comeT > 90)).sort((a, b) => myHeart(b) - myHeart(a)).slice(0, 3);
  list.forEach((c, i) => {
    if (!c.cur || (c.ov && c.ov.mode !== 'return' && c.ov.mode !== 'hold')) return; // 이미 옆에
    c.comeT = now;
    c.ov = { mode: 'come', slot: i, path: catPath([c.cur.x, c.cur.z], me), aim: me.slice() };
  });
}
// 낚시 옆 자리: 왼쪽·오른쪽·뒤 (판 위인 곳으로)
function besideSpot(sp, slot) {
  const cand = [[-0.95, -0.15], [0.95, -0.15], [-0.6, -0.9], [0.6, -0.9], [0, -1.1]];
  for (let k = 0; k < cand.length; k++) { const o = cand[(slot + k) % cand.length], x = sp.x + o[0], z = sp.z + o[1]; if (catCanStand(x, z)) return [x, z]; }
  return [sp.x, sp.z - 1];
}
// 길 따라 dist만큼 걷기 → 다 왔으면 true
function walkPath(c, path, d) {
  while (path.length > 1 && d > 0) {
    const [x1, z1] = path[1], dx = x1 - c.cur.x, dz = z1 - c.cur.z, L = Math.hypot(dx, dz);
    if (L > 1e-4) c.wantYaw = Math.atan2(dx, dz);
    if (L <= d) { c.cur.x = x1; c.cur.z = z1; path.shift(); d -= L; } else { c.cur.x += (dx / L) * d; c.cur.z += (dz / L) * d; d = 0; }
  }
  return path.length <= 1;
}
const textTex = (txt, color) => {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const x = cv.getContext('2d'); x.font = 'bold 44px Jua, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = '#fff'; x.strokeText(txt, 64, 34); x.fillStyle = color; x.fillText(txt, 64, 34);
  return new THREE.CanvasTexture(cv);
};
let nyaTex = null, loveTex = null;
catHooks.fishEvent = (ev) => {
  if (!cats) return;
  const t = performance.now() / 1000;
  for (const c of [...cats, ...(myFollow ? [myFollow] : [])]) {
    if (c.ov?.mode !== 'sit' && c.mode !== 'sit') continue;
    if ((ev.k === 'note' && ev.res === 'Perfect') || (ev.k === 'hook' && ev.g === 'Perfect')) {
      if (t - c.hopT > 0.5) { c.hopT = t; nyaTex ||= textTex('냥!', '#ff7b54'); floatSprite(nyaTex, c.g.position.clone().add(new THREE.Vector3(0, 0.75, 0)), 0.9, 0.35, 0.42); }
    } else if ((ev.k === 'note' && ev.res === 'Miss') || ev.k === 'miss') c.earT = t + (ev.k === 'miss' ? 1.2 : 0);
    else if (ev.k === 'catch') c.tapT = t;
  }
};

// ── 매 프레임 (ui/plaza.js plazaFrame) ──
catHooks.frame = (now, p) => {
  if (!cats) { build(); syncServerClock(); }
  // 로그인이 바뀌면 내 하트 다시 받기
  const who = account.loggedIn ? account.player?.id : null;
  if (who !== loadedFor) { loadedFor = who; account.cats = null; for (const c of cats) c.ov = null; if (who) catList(); }
  const ms = marketNow(), t = performance.now() / 1000, dt = Math.min(0.1, lastT ? t - lastT : 0); lastT = t;
  const camP = world.camera.position;
  // 선착장에 내려오면 / 낚시를 시작하면 ♥1 이상 고양이를 부름
  const sp = fishHooks.spot?.() || null, me = sp ? [sp.x, sp.z] : [p[0], p[1]];
  const onP = onPier(p[0], p[1]) || !!sp;
  if (account.cats && ((onP && !wasOnPier) || (sp && !wasFishing))) callCats(me, !!sp && !wasFishing);
  wasOnPier = onP; wasFishing = !!sp;
  for (const c of cats) {
    const s = catAt(c.id, ms);
    c.cur ||= { x: s.x, z: s.z };
    let pose = s.pose, y = PIER.y + s.y, tailUp = false;
    const eating = t - c.eatT < 2.6, ov = c.ov;
    c.wantYaw = s.yaw;
    if (eating) { pose = 'nod'; c.wantYaw = c.yaw; y = c.eatAt.y; }
    else if (!ov) {
      c.cur.x = s.x; c.cur.z = s.z;
      if (pose !== 'walk' && account.cats?.[c.id]?.readyAt > Date.now()) pose = 'belly'; // 배부르면 벌러덩 zzz
    } else {
      y = PIER.y;
      const gone = !onP || Math.hypot(p[0] - me[0], p[1] - me[1]) > 30;
      if (ov.mode === 'come') {
        if (gone) { c.ov = { mode: 'return' }; }
        else {
          if (Math.hypot(me[0] - ov.aim[0], me[1] - ov.aim[1]) > 2.5) { ov.path = catPath([c.cur.x, c.cur.z], me); ov.aim = me.slice(); }
          ov.path[ov.path.length - 1] = [me[0], me[1] - 0.45];
          pose = 'walk'; tailUp = true;
          if (walkPath(c, ov.path, 2.0 * dt)) { c.ov = { mode: 'rub', t0: t, a: Math.atan2(c.cur.x - me[0], c.cur.z - me[1]), slot: ov.slot }; loveTex ||= textTex('💕', '#ff5f8f'); floatSprite(loveTex, new THREE.Vector3(c.cur.x, y + 0.7, c.cur.z), 1.4, 0.5, 0.4); }
        }
      } else if (ov.mode === 'rub') { // 다리 둘레를 한 바퀴 반 비비며 돌기
        ov.a += dt * 1.6;
        const r = 0.42, nx = me[0] + Math.sin(ov.a) * r, nz = me[1] + Math.cos(ov.a) * r;
        c.cur.x += (nx - c.cur.x) * Math.min(1, dt * 6); c.cur.z += (nz - c.cur.z) * Math.min(1, dt * 6);
        c.wantYaw = ov.a + Math.PI / 2; pose = 'walk'; tailUp = true;
        if (gone) c.ov = { mode: 'return' };
        else if (t - ov.t0 > 4.5) {
          const fishing = fishHooks.spot?.();
          c.ov = myHeart(c) >= 2 && fishing ? { mode: 'sit', slot: ov.slot, path: null } : { mode: 'return' };
        }
      } else if (ov.mode === 'sit') { // ♥2: 낚시하는 내 옆에 앉아 구경
        const f = fishHooks.spot?.();
        if (!f || gone) c.ov = { mode: 'return' };
        else {
          const to = besideSpot(f, ov.slot);
          if (Math.hypot(to[0] - c.cur.x, to[1] - c.cur.z) > 0.08) { if (!ov.path || Math.hypot(ov.path.at(-1)[0] - to[0], ov.path.at(-1)[1] - to[1]) > 0.3) ov.path = catPath([c.cur.x, c.cur.z], to); pose = 'walk'; walkPath(c, ov.path, 1.4 * dt); }
          else {
            ov.path = null;
            c.wantYaw = Math.atan2(f.x - c.cur.x, (f.z - 0.8) - c.cur.z); // 낚시하는 나를 올려다봄 (얼굴이 화면 쪽으로)
            pose = t - c.tapT < 2.5 ? 'tap' : f.mode === 'fight' || f.mode === 'land' ? 'nod' : 'sit';
          }
        }
      } else if (ov.mode === 'hold') { // 밥 먹고 난 직후: 잠깐 그 자리 → 돌아감
        c.ov = { mode: 'return' };
      } else if (ov.mode === 'return') {
        const tgt = [s.x, s.z];
        if (!ov.path || Math.hypot(ov.path.at(-1)[0] - tgt[0], ov.path.at(-1)[1] - tgt[1]) > 2) ov.path = catPath([c.cur.x, c.cur.z], tgt);
        ov.path[ov.path.length - 1] = tgt;
        pose = 'walk';
        if (walkPath(c, ov.path, 1.3 * dt)) { c.ov = null; c.cur.x = s.x; c.cur.z = s.z; y = PIER.y + s.y; }
      }
    }
    const wear = account.cats?.[c.id]?.outfit || {}, wk = Object.keys(wear).sort().join(); // 내가 입힌 옷 (내 화면)
    if (c.wearKey !== wk) { c.wearKey = wk; setCatWear(c.m, wear); }
    c.g.position.set(c.cur.x, y, c.cur.z);
    if (c.yaw == null) c.yaw = c.wantYaw;
    let dy = c.wantYaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * Math.min(1, dt * 7);
    c.g.rotation.y = c.yaw;
    // 몸짓 효과: 귀 접힘(1.2초) · 폴짝 · 꼬리 세움
    const fx = c.m.userData.fx;
    const ek = t - c.earT; fx.ear = ek >= 0 && ek < 1.4 ? Math.min(1, (1.4 - ek) * 2) : 0;
    const hk = t - c.hopT; fx.hop = hk >= 0 && hk < 0.45 ? Math.sin((hk / 0.45) * Math.PI) * 0.22 : 0;
    fx.tailUp = tailUp;
    // 멀면 몸짓 계산 안 함 (선착장이 안 보이는 광장 위쪽)
    v3.set(c.cur.x, y, c.cur.z); plazaApi.view.root.localToWorld(v3);
    if (v3.distanceTo(camP) < 70) c.m.userData.anim(t + c.m.id, pose);
  }
  followFrame(t, dt, p, sp);
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
export const catsDebug = { get cats() { return cats; }, get follow() { return myFollow; }, get others() { return others; }, call: () => callCats(fishHooks.spot?.() ? [fishHooks.spot().x, fishHooks.spot().z] : plazaApi.pos(), true), openPop: (id) => openPop(cats.find((c) => c.id === id)), feed: (id) => feed(cats.find((c) => c.id === id)), catAt };

// ── 4단계: 데리고 다니는 고양이 (♥3 따라옴 · ♥4 로그인하면 선착장 쪽에서 마중 · ♥5 가만히 있으면 어깨 위) ──
// 배회하는 고양이와 따로 생기는 '내 고양이'(같은 종류가 광장에 여러 마리일 수 있음). 한 번에 한 마리.
// 다른 사람에게는 내 상태(myState)의 ct = { c: 종류, h: 하트, o: 옷 } 하나만(바뀔 때만). 움직임은 각 PC가 주인 위치로 계산
const FOLLOW_KEY = (pid) => 'smash-cat-follow-' + pid;
export function followChoice() {
  const pid = account.player?.id;
  if (!pid) return null;
  let v = null;
  try { v = localStorage.getItem(FOLLOW_KEY(pid)); } catch { /* 무시 */ }
  const ok = (id) => id && heartOf(account.cats?.[id]?.pts) >= 3;
  if (v === 'none') return null;
  if (ok(v)) return v;
  // 고르지 않았으면 하트가 가장 높은 ♥3 이상 고양이
  return CAT_IDS.filter(ok).sort((a, b) => (account.cats[b].pts - account.cats[a].pts))[0] || null;
}
export function setFollowChoice(id) {
  try { localStorage.setItem(FOLLOW_KEY(account.player?.id), id || 'none'); } catch { /* 무시 */ }
  plazaApi.sendInfo();
}
const wearOf = (o) => Object.fromEntries(OUTFITS.filter((x) => o?.[x.slot]).map((x) => [x.slot, true]));
catHooks.state = () => {
  const id = account.loggedIn && account.cats ? followChoice() : null;
  return id ? { c: id, h: heartOf(account.cats[id].pts), o: wearOf(account.cats[id].outfit) } : null;
};
catHooks.clean = (v) => (v && typeof v === 'object' && CAT_IDS.includes(v.c) && Number.isInteger(v.h) && v.h >= 3 && v.h <= MAX_HEART ? { c: v.c, h: v.h, o: wearOf(v.o) } : null);

let myFollow = null, sentKey = '', greetFor = null;
const others = new Map(); // 사람 id → 따라다니는 고양이
function makeFollower(id) {
  const m = makeCat(id), g = new THREE.Group();
  m.scale.setScalar(SCALE); g.add(m); plazaApi.view.root.add(g);
  return { id, m, g, cur: null, yaw: 0, mode: 'follow', t0: 0, idleT: 0, walkT: 0, wearKey: null, hopT: -9, earT: -9, tapT: -9, jump: null, last: null };
}
function dropFollower(f) { if (f) { plazaApi.view.root.remove(f.g); f.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } }
const SHOULDER = new THREE.Vector3(0.21, 1.02, 0.02); // 캐릭터 왼쪽 어깨 (캐릭터 앞 = -z)
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
// 한 마리 움직이기. own = { x, z, yaw(캐릭터), moving, fish(낚시 자리|null), vis }
function stepFollower(f, own, h, t, dt) {
  const gy = (x, z) => heightAt(x, z) || 0;
  if (!f.cur || Math.hypot(f.cur.x - own.x, f.cur.z - own.z) > 25) f.cur = { x: own.x + 0.6, z: own.z + 0.6 };
  f.idleT = own.moving ? 0 : f.idleT + dt;
  f.walkT = own.moving ? f.walkT + dt : 0;
  let pose = 'sit', tailUp = false, y = gy(f.cur.x, f.cur.z), scale = SCALE;
  const dx = own.x - f.cur.x, dz = own.z - f.cur.z, d = Math.hypot(dx, dz);
  // 낚시: 옆에 앉아 구경 (3b와 같은 반응)
  if (own.fish) {
    if (f.mode === 'shoulder') f.mode = 'follow';
    const to = besideSpot(own.fish, 0), ex = to[0] - f.cur.x, ez = to[1] - f.cur.z, e = Math.hypot(ex, ez);
    if (e > 0.08) { const s = Math.min(e, 2.4 * dt); f.cur.x += (ex / e) * s; f.cur.z += (ez / e) * s; f.wantYaw = Math.atan2(ex, ez); pose = 'walk'; f.mode = 'come'; }
    else { f.mode = 'sit'; f.wantYaw = Math.atan2(own.fish.x - f.cur.x, own.fish.z - 0.8 - f.cur.z); pose = t - f.tapT < 2.5 ? 'tap' : own.fish.mode === 'fight' || own.fish.mode === 'land' ? 'nod' : 'sit'; }
    y = gy(f.cur.x, f.cur.z);
  } else if (f.mode === 'greet') { // ♥4 로그인 마중: 꼬리 세우고 달려옴 → 💕 비비기
    pose = 'walk'; tailUp = true;
    if (d > 0.5) { const s = Math.min(d - 0.45, 4 * dt); f.cur.x += (dx / d) * s; f.cur.z += (dz / d) * s; f.wantYaw = Math.atan2(dx, dz); }
    else { if (!f.t0) { f.t0 = t; loveTex ||= textTex('💕', '#ff5f8f'); floatSprite(loveTex, new THREE.Vector3(f.cur.x, y + 0.75, f.cur.z), 1.4, 0.5, 0.4); }
      const a = (t - f.t0) * 1.6 + Math.atan2(-dx, -dz); f.cur.x = own.x + Math.sin(a) * 0.42; f.cur.z = own.z + Math.cos(a) * 0.42; f.wantYaw = a + Math.PI / 2;
      if (t - f.t0 > 3) f.mode = 'follow'; }
    y = gy(f.cur.x, f.cur.z);
  } else if (f.mode === 'shoulder' || f.jump) { // ♥5 어깨 위 (뛰어오르기 0.45초)
    tmpQ.setFromAxisAngle(UP, own.yaw);
    tmpV.copy(SHOULDER).applyQuaternion(tmpQ).add(new THREE.Vector3(own.x, gy(own.x, own.z), own.z));
    scale = SCALE * 0.72;
    if (f.jump) {
      const k = Math.min(1, (t - f.jump.t0) / 0.45), up = f.jump.up, a = up ? k : 1 - k;
      f.cur.x = f.jump.x + (tmpV.x - f.jump.x) * a; f.cur.z = f.jump.z + (tmpV.z - f.jump.z) * a;
      y = f.jump.y + (tmpV.y - f.jump.y) * a + Math.sin(k * Math.PI) * 0.45;
      scale = SCALE * (1 - 0.28 * a); pose = 'stand';
      if (k >= 1) { f.mode = up ? 'shoulder' : 'follow'; f.jump = null; if (!up) { f.cur.x = f.jump0x; f.cur.z = f.jump0z; } }
    } else {
      f.cur.x = tmpV.x; f.cur.z = tmpV.z; y = tmpV.y; pose = 'loaf';
      f.wantYaw = own.yaw + Math.PI; // 캐릭터와 같은 쪽을 봄
      if (f.walkT > 8 || !own.vis) { // 오래 걸으면 내려와서 따라 걸음
        const side = own.yaw + Math.PI / 2;
        f.jump0x = own.x + Math.sin(side) * 0.6; f.jump0z = own.z + Math.cos(side) * 0.6;
        f.jump = { t0: t, up: false, x: f.jump0x, z: f.jump0z, y: gy(f.jump0x, f.jump0z) };
      }
    }
  } else { // 따라 걷기: 주인 0.8m 뒤
    const want = 0.8;
    if (d > want + 0.25) { const s = Math.min(d - want, Math.max(1.2, (d - want) * 3.2) * dt); f.cur.x += (dx / d) * s; f.cur.z += (dz / d) * s; f.wantYaw = Math.atan2(dx, dz); pose = 'walk'; tailUp = h >= 4; }
    else { f.wantYaw = Math.atan2(dx, dz); pose = f.idleT > 6 ? 'loaf' : 'sit'; }
    y = gy(f.cur.x, f.cur.z);
    if (h >= 5 && own.vis && f.idleT > 3 && d < 1.3) f.jump = { t0: t, up: true, x: f.cur.x, z: f.cur.z, y }; // 가만히 있으면 어깨로 폴짝
  }
  f.g.visible = own.vis;
  f.g.position.set(f.cur.x, y, f.cur.z);
  f.m.scale.setScalar(scale);
  let dy = (f.wantYaw ?? f.yaw) - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  f.yaw += dy * Math.min(1, dt * (f.mode === 'shoulder' ? 20 : 8));
  f.g.rotation.y = f.yaw;
  const fx = f.m.userData.fx;
  const ek = t - f.earT; fx.ear = ek >= 0 && ek < 1.4 ? Math.min(1, (1.4 - ek) * 2) : 0;
  const hk = t - f.hopT; fx.hop = hk >= 0 && hk < 0.45 ? Math.sin((hk / 0.45) * Math.PI) * 0.22 : 0;
  fx.tailUp = tailUp;
  if (own.vis) f.m.userData.anim(t + f.m.id, pose);
}
function syncWear(f, o) { const k = Object.keys(o || {}).sort().join(); if (f.wearKey !== k) { f.wearKey = k; setCatWear(f.m, o || {}); } }
function followFrame(t, dt, p, sp) {
  const figs = plazaApi.view.figs, myId = plazaApi.myId();
  // 나
  const st = catHooks.state(), key = st ? JSON.stringify(st) : '';
  if (key !== sentKey) { sentKey = key; plazaApi.sendInfo(); } // 바뀔 때만 (하트·옷·고른 고양이)
  if (!st || myFollow?.id !== st.c) {
    dropFollower(myFollow); myFollow = st ? makeFollower(st.c) : null;
    if (myFollow) {
      // ♥4: 이번에 로그인해서 처음 나타나면 선착장 쪽(동쪽 계단 위)에서 뛰어옴
      if (st.h >= 4 && greetFor !== account.player?.id) { myFollow.cur = { x: 20, z: 37.5 }; myFollow.mode = 'greet'; }
      greetFor = account.player?.id;
    }
  }
  if (myFollow) {
    const me = figs.get(myId);
    syncWear(myFollow, st.o);
    const moving = !!me && me.last && Math.hypot(me.disp[0] - me.last[0], me.disp[1] - me.last[1]) > 0.002;
    if (me?.disp) me.last = [me.disp[0], me.disp[1]];
    stepFollower(myFollow, { x: p[0], z: p[1], yaw: me?.yaw || 0, moving, fish: sp, vis: !!sp || !!me?.c.group.visible }, st.h, t, dt);
  }
  // 다른 사람들
  const seen = new Set();
  for (const [id, person] of plazaApi.people()) {
    const ct = person.ct, f = figs.get(id);
    if (!ct || !f?.disp || id === myId) continue;
    seen.add(id);
    let o = others.get(id);
    if (!o || o.id !== ct.c) { dropFollower(o); o = makeFollower(ct.c); others.set(id, o); }
    syncWear(o, ct.o);
    const moving = o.last && Math.hypot(f.disp[0] - o.last[0], f.disp[1] - o.last[1]) > 0.002;
    o.last = [f.disp[0], f.disp[1]];
    stepFollower(o, { x: f.disp[0], z: f.disp[1], yaw: f.yaw || 0, moving, fish: null, vis: !!f.c.group.visible }, ct.h, t, dt);
  }
  for (const [id, o] of others) if (!seen.has(id)) { dropFollower(o); others.delete(id); }
}
