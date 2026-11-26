// 🐱 내 고양이 창 (docs/dev/cats.md 3c): 6마리 하트·다음 밥 시간·옷 입히기(🔔 ♥1 · 🎀 ♥2, 🎩🧥✨는 4·5단계)
// 여는 곳: 낚시 화면 오른쪽 위 '🐱' 버튼(ui/fishing.js) · 고양이 말풍선의 '🐱 내 고양이'(plazaCats.js)
import * as THREE from 'three';
import { account, catList, catWear } from '../../account.js';
import { hud } from '../../ui/hud.js';
import { esc } from '../../ui/state.js';
import { CAT_NAME, CAT_IDS, OUTFITS, canWear, heartOf, heartProgress, heartsText } from './rules.js';
import { COATS, makeCat, setCatWear } from './models.js';
import { followChoice, setFollowChoice } from './plazaCats.js';

const css = document.createElement('style');
css.textContent = `
#mycats { position: fixed; inset: 0; z-index: 80; display: none; align-items: center; justify-content: center; background: rgba(8,16,34,.45); backdrop-filter: blur(4px); font-family: 'Pretendard Variable', system-ui, sans-serif; color: #fff; }
#mycats.open { display: flex; }
#mycats .box { width: min(860px, calc(100vw - 24px)); max-height: calc(100vh - 32px); display: flex; flex-direction: column; border-radius: 22px; background: rgba(15,25,50,.86); border: 1px solid rgba(255,255,255,.18); overflow: hidden; }
#mycats .top { display: flex; align-items: center; gap: 10px; padding: 14px 16px 6px; }
#mycats h3 { margin: 0; font: 400 22px Jua, sans-serif; flex: 1; }
#mycats h3 small { font: 600 13px 'Pretendard Variable', sans-serif; color: rgba(255,255,255,.7); margin-left: 8px; }
#mycats button { font: 700 13px 'Pretendard Variable', sans-serif; border: 0; border-radius: 99px; cursor: pointer; color: #fff; }
#mycats .x { background: rgba(255,255,255,.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); padding: 7px 12px; }
#mycats .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; padding: 6px 16px 16px; overflow-y: auto; }
#mycats .card { display: grid; grid-template-columns: 92px 1fr; gap: 8px; border-radius: 16px; padding: 10px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); }
#mycats .card.new { opacity: .6; }
#mycats .pic { width: 92px; height: 92px; border-radius: 14px; background: radial-gradient(circle at 50% 60%, rgba(255,214,170,.35), rgba(255,255,255,.04)); }
#mycats .pic img { width: 100%; height: 100%; display: block; }
#mycats .nm { font: 400 18px Jua, sans-serif; }
#mycats .nm small { font: 600 11px 'Pretendard Variable', sans-serif; color: rgba(255,255,255,.6); margin-left: 4px; }
#mycats .ht { color: #ff8fb0; font-size: 16px; letter-spacing: 1px; }
#mycats .bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.14); overflow: hidden; margin: 3px 0; }
#mycats .bar i { display: block; height: 100%; background: linear-gradient(90deg, #ff9db8, #ff5f8f); }
#mycats .meal { font-size: 12px; color: rgba(255,255,255,.72); }
#mycats .wear { grid-column: 1 / -1; display: flex; gap: 5px; flex-wrap: wrap; }
#mycats .wear button { padding: 5px 9px; background: rgba(255,255,255,.12); font-size: 12px; }
#mycats .wear button.on { background: linear-gradient(180deg, #ff8fb0, #ff5f8f); box-shadow: 0 3px 10px rgba(255,95,143,.35); }
#mycats .wear button.go { background: linear-gradient(180deg, #7fd38a, #3fa85a); }
#mycats .wear button.go.on { background: linear-gradient(180deg, #ffd23f, #f0a500); color: #3a2a00; }
#mycats .wear button:disabled { opacity: .45; cursor: default; }
#mycats .tip { padding: 0 16px 14px; font-size: 12px; color: rgba(255,255,255,.65); }
@media (max-width: 560px) { #mycats .grid { grid-template-columns: 1fr; } }
`;
document.head.appendChild(css);
const el = document.createElement('div'); el.id = 'mycats';
el.innerHTML = `<div class="box"><div class="top"><h3>🐱 내 고양이<small>생선을 주면 하트가 오르고, 하트가 오르면 옷이 생겨요</small></h3><button class="x">닫기</button></div><div class="grid"></div>
<div class="tip">🐟 밥은 고양이마다 1시간에 한 마리 · 선착장 고양이를 눌러서 줘요 · 하트는 줄지 않아요 · 옷은 그 고양이 것이에요</div></div>`;
document.body.appendChild(el);
for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation());
el.addEventListener('click', (e) => { if (e.target === el) closeMyCats(); });
el.querySelector('.x').onclick = () => closeMyCats();

// ── 고양이 사진 (옷 입은 모습, 처음 한 번 찍어 둠)
let snap = null;
const pics = {};
function catPic(id, outfit) {
  const key = id + ':' + Object.keys(outfit || {}).sort().join(',');
  if (pics[key]) return pics[key];
  if (!snap) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setSize(184, 184, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c4b0, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(1.5, 3, 4); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0.35, 0.7, 2.0); cam.lookAt(0, 0.36, 0);
    snap = { renderer, scene, cam };
  }
  const m = makeCat(id); setCatWear(m, outfit); m.rotation.y = 0.25; m.userData.anim(0.4, 'sit');
  snap.scene.add(m); snap.renderer.setClearColor(0, 0); snap.renderer.render(snap.scene, snap.cam); snap.scene.remove(m);
  pics[key] = snap.renderer.domElement.toDataURL();
  return pics[key];
}

let open = false, busy = false, timer = 0;
export const myCatsOpen = () => open;
export function closeMyCats() { open = false; el.classList.remove('open'); clearInterval(timer); }
export async function openMyCats() {
  if (!account.loggedIn) { hud.toast('🐱 로그인하면 고양이와 친해질 수 있어요', 2200); return; }
  open = true; el.classList.add('open');
  render();
  await catList(); render();
  clearInterval(timer); timer = setInterval(render, 30000); // 'n분 뒤' 고치기
}
function render() {
  if (!open) return;
  const mine = account.cats || {};
  el.querySelector('.grid').innerHTML = CAT_IDS.map((id) => {
    const me = mine[id], pts = me?.pts || 0, [a, b] = heartProgress(pts), out = me?.outfit || {};
    const left = me ? Math.ceil((me.readyAt - Date.now()) / 60000) : 0;
    const meal0 = !me ? '아직 처음 만났어요 · 선착장에서 🐟를 줘 보세요' : left > 0 ? `😴 배불러요 · 다음 밥 ${left}분 뒤` : '🐟 지금 밥을 줄 수 있어요';
    const wear = OUTFITS.map((o) => {
      const ok = canWear(pts, o.slot), on = !!out[o.slot];
      if (!ok) return `<button disabled title="♥${o.heart}에 열려요">🔒 ♥${o.heart} ${o.icon}</button>`;
      if (o.later) return `<button disabled title="곧 나와요">${o.icon} 곧 나와요</button>`;
      return `<button class="${on ? 'on' : ''}" data-cat="${id}" data-slot="${o.slot}">${o.icon} ${esc(o.name)}${on ? ' ✓' : ''}</button>`;
    }).join('');
    const fol = followChoice() === id;
    const go = heartOf(pts) >= 3 ? `<button class="go${fol ? ' on' : ''}" data-go="${id}">🐾 ${fol ? '같이 다니는 중' : '데리고 다니기'}</button>` : `<button disabled title="♥3에 열려요">🔒 ♥3 🐾 데리고 다니기</button>`;
    return `<div class="card${me ? '' : ' new'}"><div class="pic"><img alt="" src="${catPic(id, out)}"></div>
      <div><div class="nm">${esc(CAT_NAME[id])}<small>${esc(COATS[id].note)}</small></div>
      <div class="ht">${heartsText(pts)}</div><div class="bar"><i style="width:${(a / b) * 100}%"></i></div>
      <div class="meal">${heartOf(pts) >= 5 ? '💞 단짝!' : `다음 ♥까지 ${b - a}마리`} · ${meal0}</div></div>
      <div class="wear">${go}${wear}</div></div>`;
  }).join('');
  for (const bt of el.querySelectorAll('.wear button[data-slot]')) bt.onclick = () => toggle(bt.dataset.cat, bt.dataset.slot);
  for (const bt of el.querySelectorAll('.wear button[data-go]')) bt.onclick = () => { // 한 번에 한 마리 · 다시 누르면 집(선착장)으로
    const id = bt.dataset.go, fol = followChoice() === id;
    setFollowChoice(fol ? null : id);
    hud.toast(fol ? `🏠 ${CAT_NAME[id]}는 선착장으로 돌아갔어요` : `🐾 ${CAT_NAME[id]}가 따라다녀요${heartOf(account.cats[id].pts) >= 5 ? ' · 가만히 있으면 어깨 위로!' : ''}`, 2200);
    render();
  };
}
async function toggle(cat, slot) {
  if (busy) return;
  busy = true;
  const on = !account.cats?.[cat]?.outfit?.[slot];
  const r = await catWear(cat, slot, on);
  busy = false;
  if (r.status === 'locked') hud.toast(`♥${r.need}이 되면 입을 수 있어요`, 1800);
  else if (r.status !== 'ok') hud.toast('잠깐 연결이 안 돼요. 다시 눌러 주세요', 1800);
  render();
}
