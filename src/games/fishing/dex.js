// 🐟 도감 (fishing.md 9장): 잡은 종·잡은 수·가장 큰 cm. 못 잡은 칸 = 검은 그림자 + 조건 아이콘. 물고기·잡동사니 탭.
// 2단계 시안: 이 브라우저(localStorage)에만 기록. 서버·명예의 전당으로 옮기기는 3~4단계.
import * as THREE from 'three';
import { BIG_CM, COND, GRADE, JUNK, SPECIES } from './data.js';
import { makeModel } from './models.js';

const KEY = 'fishing-dex', PKEY = 'fishing-sim-paddles';
let dex = {}, paddles = [];
try { dex = JSON.parse(localStorage.getItem(KEY) || '{}'); paddles = JSON.parse(localStorage.getItem(PKEY) || '[]'); } catch { /* 저장 안 됨 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(dex)); localStorage.setItem(PKEY, JSON.stringify(paddles)); } catch { /* 저장 안 됨 */ } };

export const fishCount = () => SPECIES.reduce((n, s) => n + (dex[s.id]?.n || 0), 0);
export const ownedPaddles = () => paddles;
// 잡은 것 기록 → { first: 도감에 처음, rec: 그 종 최고 기록 } (물고기·잡동사니)
export function recordCatch(c, cm) {
  const e = dex[c.id] || { n: 0, best: 0 };
  const first = !e.n, rec = c.kind === 'fish' && cm > e.best;
  e.n++; if (rec) e.best = cm;
  dex[c.id] = e; save();
  return { first, rec, best: e.best };
}
export function addPaddle(id) { if (!paddles.includes(id)) { paddles.push(id); save(); } }

// ── 작은 그림 (처음 한 번 찍어 둠). sil = 검은 그림자
let snapR = null;
const cache = {};
export function modelImage(id, sil = false, px = 180) {
  const key = `${id}/${sil}/${px}`;
  if (cache[key]) return cache[key];
  if (!snapR) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb4d0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 4); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0, 0.25, 2.2); cam.lookAt(0, 0.03, 0);
    snapR = { renderer, scene, cam, silMat: new THREE.MeshBasicMaterial({ color: 0x1d2a3e }) };
  }
  const { renderer, scene, cam, silMat } = snapR;
  renderer.setSize(px, px, false);
  const m = makeModel(id), holder = new THREE.Group();
  holder.add(m); holder.rotation.y = m.userData.faceZ || JUNK.some((j) => j.id === id) ? 0 : -0.55;
  m.userData.anim?.(0.7);
  if (sil) m.traverse((o) => { if (o.isSprite) o.visible = false; });
  scene.add(holder);
  scene.overrideMaterial = sil ? silMat : null;
  renderer.setClearColor(0, 0); renderer.render(scene, cam);
  scene.overrideMaterial = null; scene.remove(holder);
  const img = new Image(); img.src = renderer.domElement.toDataURL();
  cache[key] = img;
  return img;
}

// ── 도감 화면
const css = `
#dex { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; background: rgba(8,16,34,.45); backdrop-filter: blur(4px); font-family: Jua, 'Pretendard Variable', sans-serif; }
#dex.open { display: flex; }
#dex .box { width: min(760px, calc(100vw - 24px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; border-radius: 22px; background: rgba(15,25,50,.82); border: 1px solid rgba(255,255,255,.18); color: #fff; overflow: hidden; }
#dex .top { display: flex; align-items: center; gap: 8px; padding: 14px 16px 10px; }
#dex .top h3 { margin: 0; font-size: 22px; font-weight: 400; flex: 1; }
#dex .top h3 small { font-size: 14px; color: rgba(255,255,255,.65); margin-left: 6px; }
#dex .tabs button, #dex .x { font: inherit; font-size: 15px; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08); color: #fff; border-radius: 99px; padding: 6px 14px; cursor: pointer; }
#dex .tabs button.on { background: #FF8A1F; border-color: #FF8A1F; }
#dex .x { padding: 6px 12px; }
#dex .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; padding: 4px 16px 16px; overflow-y: auto; }
#dex .card { position: relative; border-radius: 16px; padding: 6px 6px 8px; text-align: center; background: linear-gradient(180deg, rgba(191,230,251,.25), rgba(143,208,242,.12)); border: 2px solid rgba(255,255,255,.12); }
#dex .card.rare { background: linear-gradient(180deg, rgba(110,160,255,.35), rgba(90,140,240,.15)); }
#dex .card.legend { background: linear-gradient(180deg, rgba(255,214,90,.45), rgba(255,170,60,.18)); border-color: rgba(255,210,90,.5); }
#dex .card.junk { background: linear-gradient(180deg, rgba(160,220,195,.3), rgba(120,200,170,.12)); }
#dex .card.no { opacity: .85; }
#dex .card img { width: 100%; aspect-ratio: 1; display: block; }
#dex .n { font-size: 15px; margin-top: 2px; }
#dex .s { font-family: 'Pretendard Variable', sans-serif; font-size: 11px; color: rgba(255,255,255,.75); margin-top: 2px; min-height: 14px; }
#dex .cond { position: absolute; right: 8px; top: 6px; font-size: 18px; }
#dex .gr { position: absolute; left: 8px; top: 8px; font-family: 'Pretendard Variable', sans-serif; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; color: #0b1633; }
#dex .big { color: #ffd23a; }
`;
let el = null, tab = 'fish';
function build() {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  el = document.createElement('div'); el.id = 'dex';
  el.innerHTML = `<div class="box"><div class="top"><h3>📖 도감<small></small></h3><div class="tabs"><button data-t="fish">🐟 물고기</button> <button data-t="junk">🥾 잡동사니</button></div><button class="x">✕</button></div><div class="grid"></div></div>`;
  document.body.appendChild(el);
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) el.addEventListener(ev, (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.x')) return closeDex();
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); }
  });
}
function card(s) {
  const e = dex[s.id], got = !!e?.n, junk = s.kind === 'junk';
  const d = document.createElement('div'); d.className = `card ${junk ? 'junk' : s.grade}${got ? '' : ' no'}`;
  d.appendChild(modelImage(s.id, !got).cloneNode());
  const gr = junk ? '' : `<span class="gr" style="background:${GRADE[s.grade].color}">${GRADE[s.grade].label}</span>`;
  const cond = s.cond ? `<span class="cond" title="${COND[s.cond].label}">${COND[s.cond].icon}</span>` : '';
  const sub = !got ? (s.cond ? COND[s.cond].label : '아직 못 잡았어요') : junk ? `${e.n}개` : `${e.n}마리 · 최고 <span class="${e.best >= BIG_CM ? 'big' : ''}">${e.best}cm${e.best >= BIG_CM ? ' 🏆' : ''}</span>`;
  d.insertAdjacentHTML('beforeend', `${gr}${cond}<div class="n">${got ? s.name : '???'}</div><div class="s">${sub}</div>`);
  return d;
}
function render() {
  const list = tab === 'fish' ? SPECIES : JUNK;
  el.querySelector('small').textContent = `${list.filter((s) => dex[s.id]?.n).length} / ${list.length}`;
  el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const g = el.querySelector('.grid'); g.innerHTML = '';
  for (const s of list) g.appendChild(card(s));
}
export function openDex() { if (!el) build(); render(); el.classList.add('open'); }
export function closeDex() { el?.classList.remove('open'); }
export const dexOpen = () => !!el?.classList.contains('open');
