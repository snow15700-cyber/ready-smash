// 뽑기 연출 화면: 탁구공을 직접 두드려 깨는 뽑기 (사용자 확정 11/22, 시안 gacha.html과 같은 코드).
// 결과는 서버가 먼저 정하고(src/account.js의 gacha), 이 화면은 그 결과를 보여 주는 연출만 한다.
// 1회: 공이 떨어져 통통 → 3번 두드리기(금 → 색이 바뀌며 등급 예고 → 팡). 전설 공은 금빛이 되어 가운데로 떠올라 깨진다.
// 10회: 공 10개가 떨어져 줄 서고, 고급·전설 공은 색이 바뀐다 → 하나씩 눌러 깨기. '모두 깨기'는 금빛 공만 남긴다(사용자 확정).
// 전설: 하얀 섬광 → 잠깐 고요 → 빛기둥·빛살 속에서 아이템이 돌며 내려옴 → 휘익! 전용 소리 → 폭죽 (사용자 확정). 건너뛰기 없음.
//
// 쓰는 법: openGacha(cfg) → playGacha(results, pity) (results: [{ it, grade, dup, pieces }]) → (나가기·한 번 더는 cfg.onExit·onAgain)
//   cfg: { coins() 지금 코인, price {1,10}, onAgain(n), onExit(), onDone(results), start: true면 처음에 1회·10회 버튼(시안), auto: 저절로 진행 }
import * as THREE from 'three';
import './gachaShow.css';
import { GRADES, makePaddle, swatch, outfitImage, headImage, faceImage, ballImage, tableImage } from './items.js';
import * as A from './audio.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let cfg = {};
let PRICE = { 1: 100, 10: 900 };
let active = false, pity = null, nextPity = null;

/* ───────── 화면 (처음 열 때 한 번 만든다) ───────── */
const el = {};
let g2 = null, W = 0, H = 0, DPR = 1;
function build() {
  if (el.root) return;
  const root = document.createElement('div');
  root.id = 'gacha-show';
  root.className = 'gshow hidden';
  root.innerHTML = `<canvas class="gs-stage"></canvas><canvas class="gs-three"></canvas>
    <div class="gs-reveal gs-hide"></div><div class="gs-sum gs-hide"></div>
    <button id="gacha-exit" class="gs-exit">← 나가기</button><div class="gs-coins gs-hide"></div>
    <div class="gs-dock"><div class="gs-hint"></div><div class="gs-btns"></div>
      <div class="gs-pity gs-hide"><span></span><span class="gauge"><i></i></span></div></div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  Object.assign(el, { root, stage: q('.gs-stage'), three: q('.gs-three'), reveal: q('.gs-reveal'), sum: q('.gs-sum'), exit: q('.gs-exit'), coins: q('.gs-coins'),
    hint: q('.gs-hint'), btns: q('.gs-btns'), pity: q('.gs-pity'), pityTxt: q('.gs-pity span'), pityBar: q('.gs-pity i') });
  g2 = el.stage.getContext('2d');
  // 입력
  el.stage.addEventListener('pointerdown', (e) => {
    A.initAudio();
    if (mode === 'legendWait') { legendClose(); return; }
    const b = ballAt(e.clientX, e.clientY);
    if (!b) return;
    if (count === 1) tap1(b); else tap10(b);
  });
  root.addEventListener('pointerdown', (e) => { if (mode === 'legendWait' && e.target !== el.stage) legendClose(); });
  el.exit.addEventListener('click', () => { A.initAudio(); A.playUI('click'); cfg.onExit?.(); });
  el.btns.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    A.initAudio();
    if (b.dataset.go) { A.playUI('click'); waitGacha(); cfg.onAgain?.(+b.dataset.go); }
    else if (b.dataset.act === 'all') breakAll();
  });
  window.addEventListener('resize', () => { if (active) resize(); });
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  el.stage.width = W * DPR; el.stage.height = H * DPR;
  g2.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout();
}

// 아이템 그림 (목록 그림 = swatch와 같은 것, 배경은 경기장 사진)
const IMG = {};
function imgOf(it) {
  if (!it?.id) return null;
  if (!(it.id in IMG)) {
    let s = null;
    try { s = (swatch(it).match(/src="([^"]+)"/) || [])[1]; } catch { /* 모르는 아이템 */ }
    IMG[it.id] = s ? Object.assign(new Image(), { src: s }) : null;
  }
  return IMG[it.id];
}
// 전설 등장용 큰 그림 (탁구채는 3D로 따로)
const BIG = { body: outfitImage, head: headImage, face: faceImage, ball: ballImage, table: tableImage };
function bigImage(it) {
  try { if (BIG[it.cat]) return BIG[it.cat](it, 512) || imgOf(it)?.src; } catch { /* 작은 그림으로 */ }
  return imgOf(it)?.src;
}
// 전설 아이템이 휘익 할 때 그 아이템의 소리
function itemSound(it) {
  if (it.cat === 'paddle') A.playHit('perfect', null, null, it.sound);
  else if (it.cat === 'ball') A.playTable(6, null, null, it.sound);
  else A.playUI('legend');
}

/* ───────── 색 ───────── */
const COL = {
  common: { base: [251, 250, 246], shade: [196, 202, 212], glow: [255, 255, 255] },
  rare: { base: [206, 170, 255], shade: [104, 52, 206], glow: [190, 140, 255] },
  legend: { base: [255, 230, 140], shade: [214, 140, 0], glow: [255, 200, 70] },
};
const STAGE = ['common', 'rare', 'legend'];
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const rand = (a, b) => a + Math.random() * (b - a);

/* ───────── 소리 (audio.js) ───────── */
const SND = {
  bounce: (v) => A.playTable(1.5 + v * 5, null),
  crack: () => A.playCrack(null, 'chick'),
  tap: () => A.playGacha('tap'), pop: () => A.playGacha('pop'), ting: () => A.playGacha('ting'),
  upRare: () => A.playGacha('upRare'), upLegend: () => A.playGacha('upLegend'), riser: () => A.playGacha('riser'),
  shine: () => A.playGacha('shine'), choir: () => A.playGacha('choir'),
  launch: () => A.playGacha('launch'), firework: () => A.playGacha('firework'),
};

/* ───────── 무대 배치 ───────── */
let tableY = 0, tableW = 0, tableD = 0, CX = 0, CY = 0;
function layout() {
  tableW = Math.min(W * 0.94, 820);
  const narrow = W < 620; // 좁은 화면(휴대폰)은 10개를 두 줄로 → 탁구대를 깊게
  tableD = narrow ? Math.min(200, H * 0.27) : Math.min(130, H * 0.16);
  tableY = H * (narrow ? 0.5 : 0.58);
  CX = W / 2; CY = H * 0.42 - 60; // 전설 탁구채 자리 (아래 글자만큼 위로)
  for (const b of balls) { b.tx = slotX(b.idx, b.n); b.ty = slotY(b.idx, b.n); b.r0 = ballR(b.n); }
}
const cols = (n) => (n === 1 ? 1 : W < 620 ? 5 : 10);
function ballR(n) { if (n === 1) return clamp(Math.min(W, H) * 0.085, 40, 62); const c = cols(n); return clamp(tableW / c / 2.7, 15, 30); }
function slotX(i, n) { const c = cols(n); const k = i % c; return CX + (k - (c - 1) / 2) * (tableW * 0.86 / c); }
function slotY(i, n) { if (n === 1) return tableY + tableD * 0.5; const rows = Math.ceil(n / cols(n)); const row = Math.floor(i / cols(n)); return tableY + tableD * (rows === 1 ? 0.5 : 0.3 + row * 0.45); }

/* ───────── 상태 ───────── */
let balls = [], parts = [], rings = [], halves = [], icons = [];
let mode = 'idle'; // idle | drop | tap | busy | legend | done
let count = 1, results = [], gen = 0, nowT = 0;
const fx = { dim: 0, dimT: 0, flash: 0, rays: 0, raysT: 0, pillar: 0, pillarT: 0, halo: 0, haloT: 0, shake: 0, tint: [255, 200, 70], rot: 0, dust: 0, fireworks: 0 };
const timers = [];
const later = (dt, fn) => { const g = gen; timers.push({ at: nowT + dt, fn: () => g === gen && fn() }); };

function hint(txt, pulse = false) { el.hint.textContent = txt; el.hint.classList.toggle('pulse', pulse); }
const coinTag = (n) => `<small><i class="gs-coin"></i> ${PRICE[n]}</small>`;
const canBuy = (n) => (cfg.coins?.() ?? Infinity) >= PRICE[n];
function setButtons(kind) {
  const btn = (n, label, big) => `<button class="${big ? 'big' : ''}" data-go="${n}" ${canBuy(n) ? '' : 'disabled'}>${label} ${coinTag(n)}</button>`;
  if (kind === 'start') el.btns.innerHTML = btn(1, '1회 뽑기', true) + btn(10, '10회 뽑기', true);
  else if (kind === 'again') el.btns.innerHTML = btn(count, '한 번 더!', true) + btn(count === 1 ? 10 : 1, count === 1 ? '10회 뽑기' : '1회 뽑기', false);
  else if (kind === 'ten') el.btns.innerHTML = '<button data-act="all">모두 깨기</button>';
  else el.btns.innerHTML = '';
  // 나가기: 처음·결과 화면에서만 (깨는 중에는 숨김 — 결과는 이미 저장돼 있지만 연출을 실수로 끊지 않게)
  el.exit.classList.toggle('gs-hide', !(kind === 'start' || kind === 'again'));
  el.pity.classList.toggle('gs-hide', !(kind === 'start' || kind === 'again') || !pity);
  renderCoins();
}
function renderCoins() {
  const c = cfg.coins?.();
  el.coins.classList.toggle('gs-hide', c == null || c === Infinity);
  if (c != null) el.coins.innerHTML = `<i class="gs-coin"></i> ${c.toLocaleString()}`;
}
function renderPity() {
  if (!pity) return;
  el.pityTxt.textContent = `전설 보장까지 ${pity.max - pity.used}번`;
  el.pityBar.style.width = `${(pity.used / pity.max) * 100}%`;
}

function reset() {
  gen++;
  timers.length = 0;
  balls = []; parts = []; rings = []; halves = []; icons = [];
  Object.assign(fx, { dimT: 0, raysT: 0, pillarT: 0, haloT: 0, dust: 0, fireworks: 0 });
  el.reveal.className = 'gs-reveal gs-hide'; el.reveal.innerHTML = '';
  el.sum.classList.add('gs-hide');
  three.hide();
}

/* ───────── 뽑기 시작 ───────── */
// list: [{ it, grade, dup, pieces }] (서버가 정한 결과), newPity: 뽑은 뒤의 천장 { used, max } (끝난 뒤에 보여 준다)
function start(list, newPity) {
  A.initAudio();
  reset();
  results = list;
  count = list.length;
  nextPity = newPity;
  const n = count;
  for (const r of list) imgOf(r.it);
  const r0 = ballR(n);
  results.forEach((res, i) => {
    const b = {
      idx: i, n, res, r0, r: r0, tx: slotX(i, n), ty: slotY(i, n),
      x: 0, y: -r0 - rand(0, 40), vx: 0, vy: 0, state: 'wait', delay: n === 1 ? 0.05 : 0.08 + i * 0.07,
      col: COL.common, colFrom: COL.common, colTo: COL.common, colK: 1, stage: 0, glow: 0, glowT: 0,
      crack: 0, cracks: [], shake: 0, squash: 0, taps: 0, spin: rand(-1, 1), lift: 0, broken: false, bounces: 0,
    };
    b.x = b.tx + (n === 1 ? 0 : rand(-20, 20));
    balls.push(b);
  });
  mode = 'drop';
  setButtons('');
  hint('');
}

function upgrade(b, stage, { big = true } = {}) {
  b.colFrom = b.col; b.colTo = COL[STAGE[stage]]; b.colK = 0; b.stage = stage;
  b.glowT = stage === 2 ? 1 : 0.75;
  const c = COL[STAGE[stage]].glow;
  ring(b.x, b.y - b.lift, c, big ? b.r * 4 : b.r * 2.5, big ? 5 : 3);
  sparkle(b.x, b.y - b.lift, c, big ? 26 : 12, b.r * 0.8);
}

// 1번 뽑기: 두드리기
function tap1(b) {
  if (b.broken || mode !== 'tap') return;
  b.taps++;
  b.shake = 0.35;
  SND.tap();
  chips(b, 6);
  if (b.taps === 1) {
    addCrack(b); SND.crack();
    if (b.res.grade !== 'common') { later(0.12, () => { upgrade(b, 1); SND.upRare(); hint('어?! 공 색이 바뀌었어요!'); }); }
    else hint('금이 갔어요! 계속 톡톡', false);
  } else if (b.taps === 2) {
    addCrack(b); addCrack(b); SND.crack();
    if (b.res.grade === 'legend') {
      // 금빛으로: 화면이 어두워지고, 공이 가운데로 천천히 떠오른다
      mode = 'busy';
      fx.dimT = 0.55; fx.raysT = 0.12;
      SND.upLegend();
      hint('');
      later(0.15, () => { b.floating = true; });
      later(0.8, () => { upgrade(b, 2); hint('✨ 금빛이다…!! ✨', true); fx.shake = 0.3; });
      later(1.5, () => { mode = 'tap'; hint('마지막으로 톡!', true); });
    } else hint('한 번만 더!', true);
  } else {
    breakBall(b);
  }
}

// 10번 뽑기: 공 하나 깨기
function tap10(b) {
  if (b.broken || b.going || mode !== 'tap') return;
  if (b.res.grade === 'legend') { flyLegend(b); return; }
  b.shake = 0.2; SND.tap(); addCrack(b);
  b.going = true;
  later(0.09, () => breakBall(b));
}
function flyLegend(b) {
  mode = 'busy';
  b.going = true;
  b.flyFrom = [b.x, b.y]; b.flyT = 0;
  fx.dimT = 0.6; fx.raysT = 0.15;
  SND.riser();
  setButtons('');
  hint('');
  later(0.55, () => { b.shake = 0.6; fx.shake = 0.25; addCrack(b); addCrack(b); SND.crack(); });
  later(1.0, () => { breakBall(b); });
}

function breakAll() {
  const left = balls.filter((b) => !b.broken && !b.going && b.res.grade !== 'legend');
  left.forEach((b, i) => { b.going = true; later(i * 0.11, () => { addCrack(b); breakBall(b); }); });
  const leg = balls.filter((b) => !b.broken && !b.going && b.res.grade === 'legend');
  if (leg.length) later(left.length * 0.11 + 0.3, () => hint('남은 금빛 공은 직접 깨 보세요!', true));
}

/* ───────── 깨지기 + 아이템 등장 ───────── */
function breakBall(b) {
  if (b.broken) return;
  b.broken = true;
  const g = b.res.grade, c = COL[g];
  const x = b.x, y = b.y - b.lift;
  // 껍데기 두 쪽 + 조각
  for (const side of [-1, 1]) halves.push({ x, y, r: b.r, col: b.col, side, vx: side * rand(120, 220) * (b.r / 50), vy: -rand(300, 480) * (b.r / 50), rot: 0, vr: side * rand(4, 8), life: 1.1 });
  chips(b, g === 'common' ? 14 : 22);
  ring(x, y, c.glow, b.r * (g === 'common' ? 3 : 5), g === 'common' ? 3 : 5);
  if (count === 10 && g !== 'legend') {
    SND.pop();
    if (g === 'rare') { SND.ting(); sparkle(x, y, c.glow, 18, b.r); }
    icons.push({ b, t: 0 });
    checkDone();
    return;
  }
  if (g === 'legend') return legendReveal(b);
  // 1번: 일반·고급
  SND.pop();
  A.playUI(g === 'common' ? 'card' : 'rare');
  if (g === 'rare') { sparkle(x, y, c.glow, 40, b.r * 1.5); ring(x, y, c.glow, b.r * 7, 4); fx.flash = 0.25; }
  later(0.12, () => showReveal(b.res, ''));
  setButtons('');
  hint('');
  later(0.7, () => finish());
}

function showReveal(res, cls) {
  const it = res.it, g = res.grade;
  const gc = rgb(COL[g].glow);
  const src = imgOf(it)?.src;
  const pic = `<div class="pic${it.cat === 'bg' ? ' bg' : ''}">${cls || !src ? '' : `<img src="${src}" alt="">`}</div>`;
  const sub = res.dup ? `중복 · 🧩 조각 +${res.pieces}` : '<span class="new">NEW!</span> 옷장에 넣었어요';
  if (cls === 'leg') {
    el.reveal.innerHTML = `${pic}<div class="big">전 설</div><div class="nm">${it.name}</div><div class="sub">${sub}</div>`;
  } else {
    el.reveal.innerHTML = `${pic}<div class="gd" style="--gc:${gc}">${GRADES[g].name}</div><div class="nm">${it.name}</div><div class="sub">${sub}</div>`;
  }
  el.reveal.className = `gs-reveal ${cls || 'pop'}`;
  el.reveal.style.setProperty('--gc', gc);
}

function legendReveal(b) {
  mode = 'legend';
  const res = b.res;
  setButtons('');
  hint('');
  const x = CX, y = CY;
  icons.push({ b, t: 0, hidden: true });
  // 하얀 섬광 → 잠깐 고요 → 빛기둥·빛살 속에서 탁구채가 천천히 내려와 돈다 → 휘익! 전용 타구음 → 폭죽
  fx.flash = 1; fx.dimT = 0.82; fx.raysT = 0; fx.pillarT = 0; fx.tint = [255, 200, 70];
  SND.shine();
  sparkle(x, y, COL.legend.glow, 30, 30);
  const d = 0.55; // 고요한 순간
  later(d, () => {
    fx.raysT = 1; fx.pillarT = 1; fx.haloT = 1; fx.dust = 1;
    SND.choir();
    showReveal(res, 'leg');
    three.show(res.it);
  });
  later(d + 1.7, () => { three.swing(); A.playHit('perfect', null, null, res.it.sound); ring(x, y, COL.legend.glow, 260, 3); sparkle(x, y, [255, 255, 255], 24, 80); });
  // 마지막: 폭죽이 연달아 터지고 색종이가 흩날린다
  later(d + 2.4, () => {
    for (let i = 0; i < 3; i++) later(i * 0.18, firework);
    fx.fireworks = 3.5;
    A.playCrowd('roar', 0.6, null, 10);
  });
  later(d + 3.1, () => confetti(x, y - 40, 110));
  later(d + 3.4, () => { mode = 'legendWait'; hint('화면을 눌러 계속', true); if (cfg.auto) later(2.5, legendClose); });
}
function legendClose() {
  if (mode !== 'legendWait') return;
  fx.dust = 0; fx.fireworks = 0;
  if (count === 1) { // 1번: 탁구채는 그대로 두고 빛만 은은하게
    Object.assign(fx, { dimT: 0.3, raysT: 0.35, pillarT: 0, haloT: 0.6 });
    finish(); return;
  }
  fx.dimT = 0; fx.raysT = 0; fx.pillarT = 0; fx.haloT = 0;
  three.hide();
  el.reveal.className = 'gs-reveal gs-hide';
  const ic = icons.find((i) => i.hidden); if (ic) { ic.hidden = false; ic.t = 0; }
  mode = 'tap';
  setButtons('ten');
  hint('공을 눌러 깨 보세요', false);
  checkDone();
}
function checkDone() {
  if (count !== 10 || !balls.every((b) => b.broken) || mode === 'legend' || mode === 'legendWait') return;
  if (mode === 'done') return;
  mode = 'done';
  later(0.9, () => finish());
}

function finish() {
  mode = 'done';
  if (nextPity) pity = nextPity;
  renderPity();
  if (count === 10) {
    el.reveal.className = 'gs-reveal gs-hide';
    el.sum.innerHTML = '<h3>10회 뽑기 결과</h3><ul>' + results.map((r, i) => {
      const src = imgOf(r.it)?.src;
      return `<li class="g-${r.grade}" style="animation-delay:${i * 0.03}s">${r.dup ? '' : '<span class="new">NEW</span>'}${src ? `<img${r.it.cat === 'bg' ? ' class="bg"' : ''} src="${src}" alt="">` : ''}`
        + `<span class="n">${esc(r.it.name)}</span><span class="t">${r.dup ? `조각 +${r.pieces}` : GRADES[r.grade].name}</span></li>`;
    }).join('') + '</ul>';
    el.sum.classList.remove('gs-hide');
    balls = []; icons = [];
  }
  setButtons('again');
  hint('');
  cfg.onDone?.(results);
}

/* ───────── 효과 만들기 ───────── */
function addCrack(b) {
  // 공 안 좌표(반지름 1)에서 시작해 지그재그로 뻗는 금
  const a = rand(0, Math.PI * 2), d = rand(0.15, 0.5);
  let x = Math.cos(a) * d, y = Math.sin(a) * d, dir = rand(0, Math.PI * 2);
  const pts = [[x, y]];
  const n = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) { dir += rand(-0.9, 0.9); const l = rand(0.15, 0.3); x += Math.cos(dir) * l; y += Math.sin(dir) * l; pts.push([x, y]); }
  b.cracks.push({ pts, t: 0 });
  if (b.cracks.length > 1 && Math.random() < 0.7) { const p = pts[Math.floor(pts.length / 2)]; const br = [[p[0], p[1]]]; let bx = p[0], by = p[1], bd = dir + 1.6; for (let i = 0; i < 3; i++) { bd += rand(-0.8, 0.8); bx += Math.cos(bd) * 0.18; by += Math.sin(bd) * 0.18; br.push([bx, by]); } b.cracks.push({ pts: br, t: 0 }); }
}
function chips(b, n) {
  const y = b.y - b.lift;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(80, 320) * (b.r / 50);
    parts.push({ k: 'shard', x: b.x + Math.cos(a) * b.r * 0.7, y: y + Math.sin(a) * b.r * 0.7, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, g: 900, life: rand(0.5, 0.9), max: 0.9, size: rand(2, 5) * (b.r / 40), col: b.col.base, rot: rand(0, 6), vr: rand(-10, 10) });
  }
}
function sparkle(x, y, col, n, rad) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 260);
    parts.push({ k: 'star', x: x + Math.cos(a) * rand(0, rad), y: y + Math.sin(a) * rand(0, rad), vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0, drag: 2.5, life: rand(0.6, 1.3), max: 1.3, size: rand(5, 12), col, rot: rand(0, 1) });
  }
}
function ring(x, y, col, R, w) { rings.push({ x, y, col, R, w, t: 0, dur: 0.6 }); }
const CONF = ['#ff4d6d', '#ffb13c', '#ffe14d', '#5be38a', '#4fb3ff', '#b07cff', '#ffffff'];
function confetti(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0) + rand(-0.4, 0.4), s = rand(300, 900);
    parts.push({ k: 'conf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 700, drag: 1.6, life: rand(2, 3.5), max: 3.5, size: rand(6, 11), col: CONF[i % CONF.length], rot: rand(0, 6), vr: rand(-12, 12), flip: rand(0, 6), vf: rand(6, 14) });
  }
}
function firework() {
  const x = rand(W * 0.12, W * 0.88), ty = rand(H * 0.1, H * 0.35);
  parts.push({ k: 'rocket', x, y: H + 10, vx: rand(-40, 40), vy: -Math.sqrt(2 * 900 * (H - ty)), g: 900, life: 3, max: 3, size: 3, col: '#fff', ty });
  SND.launch();
}
function explode(x, y) {
  const hue = Math.random() < 0.5 ? rand(38, 50) : Math.floor(rand(0, 360)); // 절반은 금빛
  const n = 70;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05), s = rand(180, 330);
    parts.push({ k: 'spark', x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 160, drag: 1.4, life: rand(1, 1.6), max: 1.6, size: rand(1.6, 2.6), col: `hsl(${hue + rand(-20, 20)},100%,${rand(60, 75)}%)` });
  }
  SND.firework();
}

/* ───────── 3D 탁구채 (전설 등장) ───────── */
const three = (() => {
  let canvas = null;
  let R = null, scene, cam, holder, model, t0 = 0, swingT = -1, on = false;
  function init() {
    canvas = el.three;
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    R.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e0', '#6b4a8a', 2.2));
    const key = new THREE.DirectionalLight('#fff1c8', 2.2); key.position.set(1, 2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight('#ffd27a', 2.5); rim.position.set(-2, 1, -2); scene.add(rim);
    cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    holder = new THREE.Group(); scene.add(holder);
  }
  function show(it) {
    if (it.cat !== 'paddle') { // 탁구채가 아니면(몸 등) 크게 찍은 그림이 둥실 돌며 나온다
      const pic = el.reveal.querySelector('.pic');
      const src = bigImage(it);
      if (pic && src) pic.innerHTML = `<img class="float" src="${src}" alt="">`;
      return;
    }
    if (!R) init();
    const s = canvas.clientWidth; R.setSize(s, s, false);
    if (model) holder.remove(model);
    model = makePaddle(it);
    // 크기·가운데 맞추기 (효과 그림은 빼고 실제 부품만)
    model.updateMatrixWorld(true);
    const box = new THREE.Box3(), bb = new THREE.Box3();
    model.traverse((o) => { if (!o.isMesh || o.userData.fxKeep) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); });
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    model.position.sub(c);
    holder.add(model);
    cam.position.set(0, 0, size * 2.75); cam.lookAt(0, 0, 0);
    t0 = nowT; swingT = -1; on = true;
    canvas.classList.add('on');
  }
  function hide() { on = false; el.three?.classList.remove('on'); }
  function swing() { swingT = nowT; }
  function tick() {
    if (!R || !on) return;
    const t = nowT - t0;
    // 위에서 천천히 내려오며 빠르게 돌다가 점점 느려져 앞을 본다
    const k = ease(t / 2.2);
    holder.position.y = (1 - k) * 0.12;
    holder.scale.setScalar(0.6 + 0.4 * k);
    holder.rotation.y = (1 - k) * Math.PI * 5 + Math.sin(t * 0.9) * 0.35 * k;
    holder.rotation.x = -0.12; holder.rotation.z = 0.3 + Math.sin(t * 1.3) * 0.04;
    if (swingT >= 0) { // '휘익' 한 번 휘두르기
      const s = (nowT - swingT) / 0.45;
      if (s < 1) holder.rotation.z += Math.sin(s * Math.PI) * -0.9, holder.rotation.x += Math.sin(s * Math.PI) * 0.5;
    }
    model?.userData.tick?.(nowT);
    R.render(scene, cam);
  }
  return { show, hide, swing, tick };
})();

/* ───────── 매 프레임 (연출 화면이 떠 있을 때만) ───────── */
let last = 0, raf = 0;
function frame(ms) {
  raf = 0;
  if (!active) return;
  const dt = Math.min(0.05, last ? (ms - last) / 1000 : 0.016); last = ms;
  nowT += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= nowT) { const t = timers.splice(i, 1)[0]; t.fn(); }
  update(dt);
  draw();
  three.tick();
  raf = requestAnimationFrame(frame);
}

function update(dt) {
  const ap = (k, target, speed) => { fx[k] += (fx[target] - fx[k]) * Math.min(1, dt * speed); };
  ap('dim', 'dimT', 4); ap('rays', 'raysT', 2.2); ap('pillar', 'pillarT', 1.6); ap('halo', 'haloT', 2.5);
  fx.flash = Math.max(0, fx.flash - dt * 1.8);
  fx.shake = Math.max(0, fx.shake - dt);
  fx.rot += dt * 0.12;
  if (fx.dust > 0 && Math.random() < dt * 40) {
    parts.push({ k: 'dust', x: CX + rand(-W * 0.35, W * 0.35), y: H + 5, vx: rand(-10, 10), vy: -rand(40, 110), g: 0, life: rand(3, 6), max: 6, size: rand(1.5, 4), col: [255, 214, 120], tw: rand(0, 6) });
  }
  if (fx.dust > 0 && Math.random() < dt * 10) {
    parts.push({ k: 'star', x: CX + rand(-180, 180), y: CY + rand(-170, 170), vx: 0, vy: rand(-8, 8), g: 0, life: rand(0.8, 1.6), max: 1.6, size: rand(6, 14), col: [255, 240, 200], rot: 0 });
  }
  if (fx.fireworks > 0) {
    fx.fireworks -= dt;
    if (Math.random() < dt * 3.2) firework();
  }

  let allRest = true;
  for (const b of balls) {
    if (b.colK < 1) { b.colK = Math.min(1, b.colK + dt * 2.5); const k = ease(b.colK); b.col = { base: mix(b.colFrom.base, b.colTo.base, k), shade: mix(b.colFrom.shade, b.colTo.shade, k), glow: mix(b.colFrom.glow, b.colTo.glow, k) }; }
    b.glow += (b.glowT - b.glow) * Math.min(1, dt * 4);
    b.shake = Math.max(0, b.shake - dt);
    b.squash *= Math.pow(0.0005, dt);
    for (const c of b.cracks) c.t = Math.min(1, c.t + dt * 8);
    if (b.state === 'wait') { b.delay -= dt; if (b.delay <= 0) b.state = 'fall'; allRest = false; continue; }
    if (b.state === 'fall') {
      allRest = false;
      b.vy += 2600 * dt; b.y += b.vy * dt; b.x += (b.tx - b.x) * Math.min(1, dt * 3);
      if (b.y >= b.ty) {
        b.y = b.ty;
        const v = b.vy;
        if (v > 260 && b.bounces < 4) {
          b.vy = -v * 0.52; b.bounces++;
          b.squash = clamp(v / 2600, 0.05, 0.3);
          if (count === 1 || b.bounces === 1) SND.bounce(clamp(v / 1800, 0, 1) * (count === 1 ? 1 : 0.5));
        } else { b.vy = 0; b.state = 'rest'; b.squash = 0.06; }
      }
    }
    // 1번 전설: 금빛이 되며 가운데로 떠오르기
    if (b.floating) { const target = b.ty - CY; b.lift += (target - b.lift) * Math.min(1, dt * 2.2); b.r += (b.r0 * 1.5 - b.r) * Math.min(1, dt * 2); }
    // 10번 전설: 가운데로 날아오기
    if (b.flyFrom) {
      b.flyT = Math.min(1, b.flyT + dt / 0.55);
      const k = ease(b.flyT);
      b.x = b.flyFrom[0] + (CX - b.flyFrom[0]) * k;
      b.y = b.flyFrom[1] + (CY - b.flyFrom[1]) * k - Math.sin(k * Math.PI) * 60;
      b.r = b.r0 + (clamp(Math.min(W, H) * 0.09, 44, 70) - b.r0) * k;
    }
  }
  if (mode === 'drop' && allRest && balls.length) onLanded();

  for (const p of parts) {
    p.life -= dt;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
    p.vy += (p.g || 0) * dt;
    if (p.k === 'spark') { p.px = p.x; p.py = p.y; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vr) p.rot += p.vr * dt;
    if (p.vf) p.flip += p.vf * dt;
    if (p.k === 'rocket' && (p.vy >= -30 || p.y <= p.ty)) { p.life = 0; explode(p.x, p.y); }
  }
  parts = parts.filter((p) => p.life > 0 && p.y < H + 60);
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  for (const r of rings) r.t += dt;
  rings = rings.filter((r) => r.t < r.dur);
  for (const h of halves) { h.vy += 1400 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt; }
  halves = halves.filter((h) => h.life > 0);
  for (const ic of icons) ic.t += dt;
}

function onLanded() {
  mode = 'busy';
  if (count === 1) {
    mode = 'tap';
    hint('공을 톡톡 두드려 깨 보세요! (3번)', true);
    if (cfg.auto) autoTap1();
    return;
  }
  // 10번: 고급 공부터 차례로 색이 바뀌고, 전설 공은 마지막에 크게
  const rares = balls.filter((b) => b.res.grade === 'rare');
  const legs = balls.filter((b) => b.res.grade === 'legend');
  let t = 0.25;
  for (const b of rares) { later(t, () => { upgrade(b, 1, { big: false }); SND.ting(); }); t += 0.18; }
  if (legs.length) {
    t += 0.35;
    later(t, () => { fx.dimT = 0.35; SND.upLegend(); hint(''); });
    for (const b of legs) { later(t + 0.2, () => upgrade(b, 1, { big: false })); later(t + 0.85, () => { upgrade(b, 2); b.shake = 0.4; fx.shake = 0.2; }); }
    t += 1.3;
    later(t, () => { fx.dimT = 0.15; hint('✨ 금빛 공이 있어요! ✨', true); });
  }
  later(t + 0.1, () => {
    mode = 'tap';
    setButtons('ten');
    if (!legs.length) hint('공을 눌러 깨 보세요', false);
    if (cfg.auto) autoTap10();
  });
}

/* ───────── 그리기 ───────── */
function draw() {
  g2.clearRect(0, 0, W, H);
  g2.save();
  if (fx.shake > 0) g2.translate(rand(-1, 1) * fx.shake * 18, rand(-1, 1) * fx.shake * 18);
  drawTable();
  // 어둡게 + 빛
  if (fx.dim > 0.01) { g2.fillStyle = `rgba(4,6,18,${fx.dim})`; g2.fillRect(-20, -20, W + 40, H + 40); }
  if (fx.pillar > 0.01) drawPillar();
  if (fx.rays > 0.01) drawRays();
  if (fx.halo > 0.01) drawHalo();
  for (const b of balls) drawShadow(b);
  const hero = mode === 'legend' || mode === 'legendWait'; // 전설 등장 중에는 다른 공·아이템은 숨긴다
  if (!hero) for (const ic of icons) drawIcon(ic);
  for (const b of balls) if (!b.broken && (!hero || b.res.grade === 'legend')) drawBall(b);
  for (const h of halves) drawHalf(h);
  for (const r of rings) drawRing(r);
  drawParts();
  g2.restore();
  if (fx.flash > 0.01) { g2.fillStyle = `rgba(255,252,240,${Math.min(1, fx.flash)})`; g2.fillRect(0, 0, W, H); }
}

function drawTable() {
  const top = tableY - tableD * 0.15, bot = tableY + tableD, inset = tableW * 0.06;
  const l = CX - tableW / 2, r = CX + tableW / 2;
  // 윗면 (살짝 원근)
  const grad = g2.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, '#2a5db0'); grad.addColorStop(1, '#1c468c');
  g2.fillStyle = grad;
  g2.beginPath(); g2.moveTo(l + inset, top); g2.lineTo(r - inset, top); g2.lineTo(r, bot); g2.lineTo(l, bot); g2.closePath(); g2.fill();
  g2.strokeStyle = 'rgba(255,255,255,.85)'; g2.lineWidth = 3; g2.stroke();
  g2.beginPath(); g2.moveTo(CX, top); g2.lineTo(CX, bot); g2.lineWidth = 2; g2.strokeStyle = 'rgba(255,255,255,.55)'; g2.stroke();
  // 앞 두께
  g2.fillStyle = '#132f63'; g2.fillRect(l, bot, tableW, 12);
  // 윗면 반사광
  const sh = g2.createLinearGradient(l, 0, r, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = sh; g2.fillRect(l, top, tableW, bot - top);
}
function drawShadow(b) {
  if (b.broken || b.state === 'wait') return;
  const h = Math.max(0, b.ty - b.y) + b.lift;
  const k = clamp(1 - h / 400, 0.15, 1);
  g2.fillStyle = `rgba(0,0,0,${0.3 * k})`;
  g2.beginPath(); g2.ellipse(b.flyFrom ? b.flyFrom[0] : b.x, b.ty + b.r0 * 0.85, b.r0 * 0.9 * k, b.r0 * 0.22 * k, 0, 0, Math.PI * 2); g2.fill();
}
function ballGrad(r, col) {
  const gr = g2.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.28, rgb(col.base)); gr.addColorStop(1, rgb(col.shade));
  return gr;
}
function drawBall(b) {
  const r = b.r;
  let x = b.x, y = b.y - b.lift;
  if (b.shake > 0) { x += rand(-1, 1) * b.shake * 14; y += rand(-1, 1) * b.shake * 8; }
  // 금빛 공은 둥실둥실 + 바르르
  if (b.stage === 2) { y += Math.sin(nowT * 3) * 3; x += rand(-1, 1) * 1.2; }
  else if (b.state === 'rest' && mode === 'tap') y += Math.sin(nowT * 2.4 + b.idx) * 1.2;
  if (b.state === 'wait') return;
  const pulse = 0.85 + Math.sin(nowT * 4 + b.idx) * 0.15;
  // 바깥 빛
  if (b.glow > 0.02) {
    const R = r * (b.stage === 2 ? 4 : 2.8);
    const gg = g2.createRadialGradient(x, y, r * 0.6, x, y, R);
    gg.addColorStop(0, rgb(b.col.glow, 0.55 * b.glow * pulse)); gg.addColorStop(1, rgb(b.col.glow, 0));
    g2.globalCompositeOperation = 'lighter';
    g2.fillStyle = gg; g2.beginPath(); g2.arc(x, y, R, 0, Math.PI * 2); g2.fill();
    if (b.stage === 2) { // 금빛 공 주위의 작은 빛살
      g2.save(); g2.translate(x, y); g2.rotate(nowT * 0.6);
      for (let i = 0; i < 8; i++) { g2.rotate(Math.PI / 4); const L = r * (2.2 + Math.sin(nowT * 5 + i) * 0.4); const lg = g2.createLinearGradient(0, 0, L, 0); lg.addColorStop(0, rgb(b.col.glow, 0.5 * b.glow)); lg.addColorStop(1, rgb(b.col.glow, 0)); g2.fillStyle = lg; g2.beginPath(); g2.moveTo(0, -r * 0.12); g2.lineTo(L, 0); g2.lineTo(0, r * 0.12); g2.fill(); }
      g2.restore();
    }
    g2.globalCompositeOperation = 'source-over';
  }
  g2.save();
  g2.translate(x, y + r);
  g2.scale(1 + b.squash, 1 - b.squash);
  g2.translate(0, -r);
  g2.fillStyle = ballGrad(r, b.col);
  g2.beginPath(); g2.arc(0, 0, r, 0, Math.PI * 2); g2.fill();
  // 이음매 (탁구공 가운데 줄)
  g2.save(); g2.beginPath(); g2.arc(0, 0, r, 0, Math.PI * 2); g2.clip();
  g2.strokeStyle = 'rgba(0,0,0,.08)'; g2.lineWidth = Math.max(1, r * 0.03);
  g2.beginPath(); g2.ellipse(0, r * 0.05, r * 1.0, r * 0.32, -0.25 + b.spin * 0.1, 0, Math.PI); g2.stroke();
  // 금 (등급 색 빛이 새어 나온다)
  for (const c of b.cracks) {
    const n = Math.max(2, Math.ceil(c.pts.length * c.t));
    g2.beginPath(); c.pts.slice(0, n).forEach(([px, py], i) => (i ? g2.lineTo(px * r, py * r) : g2.moveTo(px * r, py * r)));
    g2.shadowColor = rgb(b.stage ? b.col.glow : [120, 130, 150]); g2.shadowBlur = b.stage ? r * 0.35 : 0;
    g2.strokeStyle = b.stage ? rgb(b.col.glow) : 'rgba(80,88,104,.75)'; g2.lineWidth = Math.max(1.5, r * 0.06); g2.lineJoin = 'round'; g2.stroke();
    g2.shadowBlur = 0;
    if (b.stage) { g2.strokeStyle = 'rgba(255,255,255,.95)'; g2.lineWidth = Math.max(0.8, r * 0.022); g2.stroke(); }
  }
  g2.restore();
  // 반짝 하이라이트
  g2.fillStyle = 'rgba(255,255,255,.75)';
  g2.beginPath(); g2.ellipse(-r * 0.38, -r * 0.45, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2); g2.fill();
  g2.restore();
}
function drawHalf(h) {
  g2.save();
  g2.globalAlpha = clamp(h.life / 0.5, 0, 1);
  g2.translate(h.x, h.y); g2.rotate(h.rot);
  g2.fillStyle = ballGrad(h.r, h.col);
  g2.beginPath();
  // 지그재그로 깨진 반쪽
  const r = h.r, s = h.side;
  g2.moveTo(0, -r);
  for (let i = 1; i < 6; i++) g2.lineTo((i % 2 ? 0.12 : -0.1) * r, -r + (i / 6) * 2 * r);
  g2.lineTo(0, r);
  g2.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, s > 0);
  g2.closePath(); g2.fill();
  g2.restore();
}
function drawRing(r) {
  const k = r.t / r.dur;
  g2.globalCompositeOperation = 'lighter';
  g2.strokeStyle = rgb(r.col, (1 - k) * 0.8);
  g2.lineWidth = r.w * (1 - k) + 0.5;
  g2.beginPath(); g2.arc(r.x, r.y, r.R * ease(k), 0, Math.PI * 2); g2.stroke();
  g2.globalCompositeOperation = 'source-over';
}
function star4(x, y, s, rot) {
  g2.save(); g2.translate(x, y); g2.rotate(rot);
  g2.beginPath();
  for (let i = 0; i < 4; i++) { g2.rotate(Math.PI / 2); g2.moveTo(0, 0); g2.quadraticCurveTo(s * 0.12, s * 0.12, s, 0); g2.quadraticCurveTo(s * 0.12, -s * 0.12, 0, 0); }
  g2.fill(); g2.restore();
}
function drawParts() {
  for (const p of parts) {
    const k = clamp(p.life / p.max, 0, 1);
    if (p.k === 'shard') {
      g2.fillStyle = rgb(p.col, Math.min(1, k * 2));
      g2.save(); g2.translate(p.x, p.y); g2.rotate(p.rot); g2.beginPath(); g2.moveTo(-p.size, -p.size * 0.6); g2.lineTo(p.size, -p.size * 0.2); g2.lineTo(0, p.size); g2.closePath(); g2.fill(); g2.restore();
    } else if (p.k === 'star') {
      g2.globalCompositeOperation = 'lighter';
      const e = Math.sin(Math.PI * k);
      g2.fillStyle = rgb(p.col, e);
      star4(p.x, p.y, p.size * (0.4 + e * 0.6), p.rot + (1 - k));
      g2.globalCompositeOperation = 'source-over';
    } else if (p.k === 'dust') {
      g2.globalCompositeOperation = 'lighter';
      const a = Math.sin(Math.PI * k) * (0.5 + 0.5 * Math.sin(nowT * 6 + p.tw)) * fx.dust;
      const gg = g2.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      gg.addColorStop(0, rgb(p.col, a)); gg.addColorStop(1, rgb(p.col, 0));
      g2.fillStyle = gg; g2.beginPath(); g2.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); g2.fill();
      g2.globalCompositeOperation = 'source-over';
    } else if (p.k === 'conf') {
      g2.save(); g2.translate(p.x, p.y); g2.rotate(p.rot); g2.scale(Math.cos(p.flip), 1);
      g2.globalAlpha = Math.min(1, k * 3); g2.fillStyle = p.col; g2.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6); g2.restore();
    } else if (p.k === 'rocket') {
      g2.globalCompositeOperation = 'lighter';
      g2.strokeStyle = 'rgba(255,230,180,.9)'; g2.lineWidth = 2.5;
      g2.beginPath(); g2.moveTo(p.x, p.y); g2.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g2.stroke();
      g2.globalCompositeOperation = 'source-over';
    } else if (p.k === 'spark') {
      g2.globalCompositeOperation = 'lighter';
      g2.globalAlpha = k;
      g2.strokeStyle = p.col; g2.lineWidth = p.size;
      g2.beginPath(); g2.moveTo(p.x, p.y); g2.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); g2.stroke();
      g2.globalAlpha = 1;
      g2.globalCompositeOperation = 'source-over';
    }
  }
}
function drawRays() {
  const R = Math.hypot(W, H);
  g2.save(); g2.translate(CX, CY); g2.rotate(fx.rot);
  g2.globalCompositeOperation = 'lighter';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const w = i % 2 ? 0.07 : 0.12;
    const lg = g2.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
    lg.addColorStop(0, rgb(fx.tint, 0.32 * fx.rays)); lg.addColorStop(0.6, rgb(fx.tint, 0.08 * fx.rays)); lg.addColorStop(1, rgb(fx.tint, 0));
    g2.fillStyle = lg;
    g2.beginPath(); g2.moveTo(0, 0); g2.arc(0, 0, R, -w, w); g2.closePath(); g2.fill();
    g2.rotate((Math.PI * 2) / n);
  }
  g2.restore();
  g2.globalCompositeOperation = 'source-over';
}
function drawPillar() {
  g2.globalCompositeOperation = 'lighter';
  const w = Math.min(320, W * 0.5);
  const lg = g2.createLinearGradient(CX - w / 2, 0, CX + w / 2, 0);
  lg.addColorStop(0, 'rgba(255,220,140,0)'); lg.addColorStop(0.5, `rgba(255,236,190,${0.35 * fx.pillar})`); lg.addColorStop(1, 'rgba(255,220,140,0)');
  g2.fillStyle = lg; g2.fillRect(CX - w / 2, 0, w, CY + 40);
  const core = g2.createLinearGradient(CX - w / 6, 0, CX + w / 6, 0);
  core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(0.5, `rgba(255,255,240,${0.4 * fx.pillar})`); core.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = core; g2.fillRect(CX - w / 6, 0, w / 3, CY);
  g2.globalCompositeOperation = 'source-over';
}
function drawHalo() {
  g2.globalCompositeOperation = 'lighter';
  const R = Math.min(W, H) * 0.36 * (1 + Math.sin(nowT * 2) * 0.03);
  const gg = g2.createRadialGradient(CX, CY, 0, CX, CY, R);
  gg.addColorStop(0, rgb(fx.tint, 0.55 * fx.halo)); gg.addColorStop(0.45, rgb(fx.tint, 0.18 * fx.halo)); gg.addColorStop(1, rgb(fx.tint, 0));
  g2.fillStyle = gg; g2.beginPath(); g2.arc(CX, CY, R, 0, Math.PI * 2); g2.fill();
  // 얇은 빛 고리
  g2.strokeStyle = rgb([255, 240, 200], 0.35 * fx.halo); g2.lineWidth = 1.5;
  g2.beginPath(); g2.arc(CX, CY, R * 0.62, 0, Math.PI * 2); g2.stroke();
  g2.globalCompositeOperation = 'source-over';
}
function drawIcon(ic) {
  if (ic.hidden) return;
  const b = ic.b, it = b.res.it, g = b.res.grade;
  const x = b.tx, y = b.ty - b.r0 * 0.4;
  const k = clamp(ic.t / 0.35, 0, 1);
  const s = k < 1 ? ease(k) * (1 + Math.sin(k * Math.PI) * 0.4) : 1;
  const size = b.r0 * 2.6 * s;
  if (g !== 'common') {
    g2.globalCompositeOperation = 'lighter';
    const gg = g2.createRadialGradient(x, y, 0, x, y, size * 0.8);
    gg.addColorStop(0, rgb(COL[g].glow, g === 'legend' ? 0.7 : 0.45)); gg.addColorStop(1, rgb(COL[g].glow, 0));
    g2.fillStyle = gg; g2.beginPath(); g2.arc(x, y, size * 0.8, 0, Math.PI * 2); g2.fill();
    g2.globalCompositeOperation = 'source-over';
  }
  const im = imgOf(it);
  if (im && im.complete && im.naturalWidth) {
    const ar = im.naturalWidth / im.naturalHeight;
    const w = ar >= 1 ? size : size * ar, h = ar >= 1 ? size / ar : size;
    g2.drawImage(im, x - w / 2, y - h / 2, w, h);
  }
  if (!b.res.dup && k >= 1) {
    g2.font = `800 ${Math.max(9, b.r0 * 0.42)}px ${getComputedStyle(document.body).fontFamily}`;
    g2.textAlign = 'center'; g2.fillStyle = '#ff5d7a';
    g2.fillText('NEW', x, y - size * 0.5);
  }
}

/* ───────── 입력 ───────── */
function ballAt(x, y) {
  let best = null, bd = 1e9;
  for (const b of balls) {
    if (b.broken || b.state === 'wait') continue;
    const d = Math.hypot(b.x - x, b.y - b.lift - y);
    if (d < Math.max(b.r * 1.35, 28) && d < bd) { best = b; bd = d; }
  }
  return best;
}

// 저절로 진행 (시안 스크린샷용)
function autoTap1() { const b = balls[0]; later(0.5, () => tap1(b)); later(1.3, () => tap1(b)); later(b.res.grade === 'legend' ? 3.2 : 2.1, () => tap1(b)); }
function autoTap10() {
  const order = balls.filter((b) => b.res.grade !== 'legend');
  order.forEach((b, i) => later(0.4 + i * 0.25, () => tap10(b)));
  const leg = balls.find((b) => b.res.grade === 'legend');
  if (leg) later(0.6 + order.length * 0.25, () => tap10(leg));
}

/* ───────── 밖에서 부르는 것 ───────── */
// 연출 화면 열기 (서버 결과를 기다리는 동안 '뽑는 중…')
export function openGacha(c = {}) {
  build();
  cfg = c;
  if (c.price) PRICE = c.price;
  if (c.pity !== undefined) pity = c.pity;
  el.root.classList.remove('hidden');
  document.body.classList.add('gacha-on'); // main.js: 연출 중에는 뒤의 3D 장면을 그리지 않는다
  active = true;
  resize();
  reset();
  mode = 'idle';
  renderPity();
  if (c.start) { setButtons('start'); hint('탁구공을 깨서 아이템을 얻어요 🏓'); } else waitGacha();
  last = 0;
  if (!raf) raf = requestAnimationFrame(frame);
}
// 서버 결과 기다리는 중
export function waitGacha() {
  reset();
  mode = 'idle';
  setButtons('');
  el.exit.classList.add('gs-hide');
  hint('뽑는 중…');
}
// 결과 받음 → 공이 떨어진다
export function playGacha(list, newPity = null) {
  if (!active) return;
  start(list, newPity);
}
// 뽑기 실패 (코인 모자람·서버 오류)
export function gachaError(msg) {
  mode = 'done';
  setButtons(count && results.length ? 'again' : 'start');
  hint(msg);
}
export function closeGacha() {
  if (!active) return;
  active = false;
  reset();
  el.root.classList.add('hidden');
  document.body.classList.remove('gacha-on');
}
export const gachaState = { get active() { return active; }, get mode() { return mode; } };
// 자동 점검용: 남은 공을 모두 깨고 바로 결과로 (화면에는 이런 버튼이 없다)
export function gachaFinishNow() {
  if (!active || mode === 'done' || mode === 'idle') return;
  gen++; timers.length = 0;
  Object.assign(fx, { dimT: 0, raysT: 0, pillarT: 0, haloT: 0, dust: 0, fireworks: 0 });
  three.hide();
  finish();
}
