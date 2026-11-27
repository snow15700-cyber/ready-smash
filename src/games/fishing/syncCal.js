// 🎵 박자 맞추기 창 (fishing.md 18장): 소리와 원(판정)이 안 맞게 느껴질 때 본인이 언제든 맞춤. 값은 '소리' 하나(TUNE.lag, + = 소리를 더 일찍).
// ① 박자 따라 누르기: '톡' 12번(앞 4번은 듣기만) — 뒤 8번에 맞춰 누르면, 누른 시각 − 소리 시각의 가운데값만큼 저절로 보정
// ② 직접 조절: −/+ 10ms · ③ 들어 보기: 원이 닿는 순간에 '톡' (창이 열려 있는 동안 계속, 따라 누르기 중엔 그림 없이 소리만)
// 광장(ui/fishing.js 🎵 버튼)과 시안(fishing.html ⚙️) 모두 이 창을 씀. 이 기기에만 저장(sound.js setLag).
import { TUNE } from './data.js';
import { autoLag, clickAt, initSound, setLag } from './sound.js';

const SPB = 0.6, LEAD = 4, COUNT = 8, NEED = 5; // 100bpm · 듣기만 4번 · 따라 누르기 8번 · 최소 5번은 맞게 눌러야 반영
const nowS = () => performance.now() / 1000;
let root = null, raf = 0, mode = 'idle', t0 = 0, sched = 0, taps = [], msg = '', onClose = null;

const css = `
.fsync { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(5,10,25,.45); backdrop-filter: blur(3px); font-family: var(--font-ui, 'Pretendard Variable', system-ui, sans-serif); touch-action: none; user-select: none; -webkit-user-select: none; }
.fsync .box { width: min(360px, calc(100vw - 32px)); padding: 18px 18px 16px; border-radius: 22px; color: #fff; background: rgba(15,25,50,.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 18px 40px rgba(0,0,0,.35); text-align: center; }
.fsync h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.fsync .sub { margin: 0 0 12px; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.75); }
.fsync canvas { display: block; margin: 0 auto 8px; width: 150px; height: 150px; }
.fsync .val { font-size: 15px; font-weight: 700; margin: 4px 0 2px; }
.fsync .hint { font-size: 12px; color: rgba(255,255,255,.6); margin-bottom: 10px; min-height: 16px; }
.fsync .msg { font-size: 13px; font-weight: 700; color: #ffd36b; min-height: 18px; margin: 4px 0 8px; line-height: 1.4; }
.fsync .rowb { display: flex; gap: 8px; justify-content: center; margin-bottom: 8px; }
.fsync button { font: 700 14px var(--font-ui, 'Pretendard Variable', system-ui, sans-serif); color: #fff; border: 0; border-radius: 999px; height: 40px; padding: 0 16px; cursor: pointer; background: rgba(255,255,255,.14); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); }
.fsync button.main { background: linear-gradient(180deg, #2ea3e6, #1b6fb8); box-shadow: none; padding: 0 22px; }
.fsync button.sq { width: 52px; padding: 0; font-size: 18px; }
.fsync .dots { display: flex; gap: 6px; justify-content: center; margin: 6px 0 10px; }
.fsync .dots i { width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,.18); }
.fsync .dots i.on { background: #ffd36b; }
.fsync.testing .box > :not(.testv) { display: none; }
.fsync:not(.testing) .testv { display: none; }
.fsync .big { font-size: 17px; font-weight: 800; margin: 26px 0 8px; line-height: 1.5; }
`;

function build() {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  root = document.createElement('div'); root.className = 'fsync'; root.id = 'fish-sync-cal';
  root.innerHTML = `<div class="box">
    <h3>🎵 박자 맞추기</h3>
    <p class="sub">원이 가운데에 닿는 순간 '톡' 소리가 나요.<br>소리와 원이 어긋나 보이면 여기서 맞춰요.</p>
    <canvas width="300" height="300"></canvas>
    <div class="val" data-r="val"></div>
    <div class="hint" data-r="hint"></div>
    <div class="msg" data-r="msg"></div>
    <div class="rowb"><button class="main" data-a="test" type="button">👆 박자 따라 누르기</button></div>
    <div class="rowb"><button class="sq" data-a="minus" type="button">−</button><button data-a="zero" type="button">처음대로</button><button class="sq" data-a="plus" type="button">+</button></div>
    <div class="rowb"><button data-a="close" type="button">다 됐어요</button></div>
    <div class="testv"><div class="big" data-r="big"></div><div class="dots" data-r="dots"></div><div class="hint">화면 아무 데나 누르거나 스페이스</div><div class="rowb"><button data-a="cancel" type="button">그만</button></div></div>
  </div>`;
  document.body.appendChild(root);
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (mode === 'test' && !e.target.closest('button')) { e.preventDefault(); tap(e.timeStamp); }
  });
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'test') startTest();
    else if (a === 'cancel') { mode = 'idle'; msg = ''; restart(); }
    else if (a === 'minus' || a === 'plus') { setLag((TUNE.lag || 0) + (a === 'plus' ? 0.01 : -0.01)); msg = ''; restart(); }
    else if (a === 'zero') { setLag(0); msg = ''; restart(); }
    else if (a === 'close') close();
  });
}
const $r = (k) => root.querySelector(`[data-r="${k}"]`);

// 키보드는 창이 열린 동안 낚시로 안 가게 (스페이스 = 누르기, Esc = 닫기)
function onKey(e) {
  e.stopImmediatePropagation();
  if (e.type !== 'keydown') return;
  if (e.code === 'Escape') { e.preventDefault(); if (mode === 'test') { mode = 'idle'; restart(); } else close(); }
  else if (e.code === 'Space' && mode === 'test') { e.preventDefault(); if (!e.repeat) tap(e.timeStamp); }
}

function restart() { t0 = nowS() + 0.5; sched = 0; }
function startTest() { mode = 'test'; taps = []; msg = ''; restart(); }
// e.timeStamp는 누른 바로 그 순간(performance.now와 같은 시계) — 처리가 늦어도 정확. 이상하면 지금 시각
function tap(ts) {
  let t = (ts || 0) / 1000; const n = nowS();
  if (!(Math.abs(t - n) < 1)) t = n;
  const k = Math.round((t - t0) / SPB);
  if (k < LEAD || k >= LEAD + COUNT) return;
  const d = t - (t0 + k * SPB);
  if (Math.abs(d) > SPB * 0.45) return;
  if (taps.some((x) => x.k === k)) return;
  taps.push({ k, d });
}
function finishTest() {
  mode = 'idle';
  if (taps.length < NEED) { msg = `${taps.length}번만 눌렀어요. 한 번 더 해 볼까요?`; restart(); return; }
  const ds = taps.map((x) => x.d).sort((a, b) => a - b), mid = ds[ds.length >> 1];
  const spread = ds[ds.length - 2] - ds[1]; // 가장 튀는 것 하나씩 빼고 들쭉날쭉한 정도
  if (spread > 0.16) { msg = '누른 박자가 들쭉날쭉해요. 한 번 더 해 볼까요?'; restart(); return; }
  if (Math.abs(mid) < 0.015) msg = '거의 딱 맞아요! 그대로 둘게요 👍';
  else {
    const before = TUNE.lag || 0, ms = Math.round((setLag(before + mid) - before) * 1000);
    msg = `${ms > 0 ? `소리가 ${ms}ms 늦게 들려서` : `소리가 ${-ms}ms 빨리 들려서`} 맞췄어요 ✅ 원과 '톡'을 들어 보세요`;
  }
  restart();
}

function draw() {
  const now = nowS();
  // 소리: 0.3초 앞까지 미리 걸어 둠 (따라 누르기는 12번에서 끝)
  const total = mode === 'test' ? LEAD + COUNT : Infinity;
  while (sched < total && t0 + sched * SPB < now + 0.3) { clickAt(t0 + sched * SPB, mode === 'test' ? sched < LEAD : sched % 4 === 0); sched++; }
  if (mode === 'test' && now > t0 + (LEAD + COUNT) * SPB + 0.3) finishTest();

  const lagMs = Math.round((TUNE.lag || 0) * 1000);
  $r('val').textContent = lagMs === 0 ? '보정 0ms (처음대로)' : `보정 ${lagMs > 0 ? '+' : '−'}${Math.abs(lagMs)}ms`;
  $r('hint').textContent = `소리가 늦게 들리면 +, 빨리 들리면 − · 자동 ${Math.round(autoLag() * 1000)}ms에 더함`;
  $r('msg').textContent = msg;
  root.classList.toggle('testing', mode === 'test');
  if (mode === 'test') {
    const k = Math.floor((now - t0) / SPB + 0.5);
    $r('big').innerHTML = k < LEAD ? "'톡' 소리를 잘 들어요…<br>4번 뒤부터 따라 눌러요" : '지금부터 소리에 맞춰 눌러요!';
    $r('dots').innerHTML = Array.from({ length: COUNT }, (_, i) => `<i class="${taps.some((x) => x.k === LEAD + i) ? 'on' : ''}"></i>`).join('');
  } else {
    // 원: 바깥 고리가 줄어들어 가운데 원에 닿는 순간 = 소리 나는 순간 (낚시 리듬 노트와 같은 느낌)
    const cv = root.querySelector('canvas'), g = cv.getContext('2d'), W = cv.width, c = W / 2;
    g.clearRect(0, 0, W, W);
    const ph = (((now - t0) / SPB) % 1 + 1) % 1, r0 = 46;
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(c, c, r0, 0, Math.PI * 2); g.stroke();
    const flash = Math.max(0, 1 - ph / 0.18);
    if (now >= t0) { g.fillStyle = `rgba(255,211,107,${0.85 * flash})`; g.beginPath(); g.arc(c, c, r0 - 4, 0, Math.PI * 2); g.fill(); }
    const r = r0 + (1 - ph) * 95;
    g.lineWidth = 6; g.strokeStyle = `rgba(255,211,107,${0.35 + 0.65 * ph})`; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  }
  raf = requestAnimationFrame(draw);
}

export const syncCalOpen = () => !!root && root.style.display !== 'none';
export function openSyncCal(opts = {}) {
  initSound();
  if (!root) build();
  onClose = opts.onClose || null;
  root.style.display = ''; mode = 'idle'; msg = ''; restart();
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
}
function close() {
  mode = 'idle'; cancelAnimationFrame(raf); root.style.display = 'none';
  window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
  onClose?.();
}
