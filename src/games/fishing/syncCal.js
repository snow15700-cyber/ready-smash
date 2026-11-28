// 🎵 박자 맞추기 창 (fishing.md 18장): 소리와 원(판정)이 안 맞게 느껴질 때 본인이 언제든 맞춤. 값은 '소리' 하나(TUNE.lag, + = 소리를 더 일찍).
// 직접 조절: −/+ 10ms · 들어 보기: 원이 닿는 순간에 '톡' (창이 열려 있는 동안 계속). ('박자 따라 누르기'는 11/28 사용자 요청으로 없앰)
// 광장(ui/fishing.js 🎵 버튼)과 시안(fishing.html ⚙️) 모두 이 창을 씀. 이 기기에만 저장(sound.js setLag).
import { TUNE } from './data.js';
import { autoLag, clickAt, initSound, setLag } from './sound.js';

const SPB = 0.6; // 100bpm
const nowS = () => performance.now() / 1000;
let root = null, raf = 0, t0 = 0, sched = 0, onClose = null;

const css = `
.fsync { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(5,10,25,.45); backdrop-filter: blur(3px); font-family: var(--font-ui, 'Pretendard Variable', system-ui, sans-serif); touch-action: none; user-select: none; -webkit-user-select: none; }
.fsync .box { width: min(360px, calc(100vw - 32px)); padding: 18px 18px 16px; border-radius: 22px; color: #fff; background: rgba(15,25,50,.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,.18), 0 18px 40px rgba(0,0,0,.35); text-align: center; }
.fsync h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
.fsync .sub { margin: 0 0 12px; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.75); }
.fsync canvas { display: block; margin: 0 auto 8px; width: 150px; height: 150px; }
.fsync .val { font-size: 15px; font-weight: 700; margin: 4px 0 2px; }
.fsync .hint { font-size: 12px; color: rgba(255,255,255,.6); margin-bottom: 10px; min-height: 16px; }
.fsync .rowb { display: flex; gap: 8px; justify-content: center; margin-bottom: 8px; }
.fsync button { font: 700 14px var(--font-ui, 'Pretendard Variable', system-ui, sans-serif); color: #fff; border: 0; border-radius: 999px; height: 40px; padding: 0 16px; cursor: pointer; background: rgba(255,255,255,.14); box-shadow: inset 0 0 0 1px rgba(255,255,255,.22); }
.fsync button.sq { width: 52px; padding: 0; font-size: 18px; }
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
    <div class="rowb"><button class="sq" data-a="minus" type="button">−</button><button data-a="zero" type="button">처음대로</button><button class="sq" data-a="plus" type="button">+</button></div>
    <div class="rowb"><button data-a="close" type="button">다 됐어요</button></div>
  </div>`;
  document.body.appendChild(root);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'minus' || a === 'plus') { setLag((TUNE.lag || 0) + (a === 'plus' ? 0.01 : -0.01)); restart(); }
    else if (a === 'zero') { setLag(0); restart(); }
    else if (a === 'close') close();
  });
}
const $r = (k) => root.querySelector(`[data-r="${k}"]`);

// 키보드는 창이 열린 동안 낚시로 안 가게 (Esc = 닫기)
function onKey(e) {
  e.stopImmediatePropagation();
  if (e.type === 'keydown' && e.code === 'Escape') { e.preventDefault(); close(); }
}

function restart() { t0 = nowS() + 0.5; sched = 0; }

function draw() {
  const now = nowS();
  // 소리: 0.3초 앞까지 미리 걸어 둠
  while (t0 + sched * SPB < now + 0.3) { clickAt(t0 + sched * SPB, sched % 4 === 0); sched++; }

  const lagMs = Math.round((TUNE.lag || 0) * 1000);
  $r('val').textContent = lagMs === 0 ? '보정 0ms (처음대로)' : `보정 ${lagMs > 0 ? '+' : '−'}${Math.abs(lagMs)}ms`;
  $r('hint').textContent = `소리가 늦게 들리면 +, 빨리 들리면 − · 자동 ${Math.round(autoLag() * 1000)}ms에 더함`;
  {
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
  root.style.display = ''; restart();
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
}
function close() {
  cancelAnimationFrame(raf); root.style.display = 'none';
  window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
  onClose?.();
}
