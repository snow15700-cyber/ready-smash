// 광장 물건 상호작용 ②-1 (docs/dev/plaza.md 10장): 🚚 푸드트럭 · 🥤 자판기 · 🪑 앉기 (트럭 의자·광장 벤치·전망대 벤치)
//  · 사용자 확정 11/28: 메뉴 창 = 카드 4장 · 손에 든 모양 = 실제 크기(HOLD.A) · 앉기 = 쏙 앉기(SIT.A)
//  · 남들도 보임: 손에 든 음식·앉은 자리는 광장 상태 칸 'pr' 하나에 (바뀔 때만 sendInfo). 받는 쪽은 clean으로 목록에 있는 값만
//  · ②-1은 코인 없이 시험 (사도 코인이 안 빠지고 효과도 없음). ②-2에서 서버(pingpong_plaza_buy)·효과를 붙임
import * as THREE from 'three';
import { playUI } from '../../audio.js';
import { SPOTS, toWorld } from '../../campusLayout.js';
import { VEND_OUT } from '../../campusProps.js';
import { hud } from '../../ui/hud.js';
import { addon, plazaApi, registerAddon } from '../../ui/plazaAddons.js';
import { EAT, FOOD, HOLD, TRUCK_MENU, foodIconURL, holdFood, makeFood, sitPose } from './models.js';

const HOLD_STYLE = 'A', SIT_STYLE = 'A'; // 사용자 확정 (props.html 6번 · 9번)
const nowS = () => Date.now() / 1000;
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z)); // 캐릭터 앞 = −z

// ── 앉는 자리: { x, z, y(앉는 면 높이), yaw(바라볼 쪽), stand(걸어갈 곳), group(같은 의자·벤치) } — 번호 = 목록 순서 (⚠️ 순서 바꾸지 않기: 남들과 번호로 주고받음)
const T = SPOTS.truck, TABLE = toWorld(T, -0.5, 2.6);
const BENCH_Y = 0.52; // 무료 모델 벤치(Bench_1, 길이 1.8m) 앉는 면 · 등받이는 벤치의 +z 쪽
export const SEATS = [];
// 🚚 트럭 탁자 의자 2개 (campusProps.js foodTruck: 탁자 (−0.5, 2.6), 의자 x −0.5 ± 0.85, 앉는 면 0.505)
for (const sx of [-1, 1]) {
  const [x, z] = toWorld(T, -0.5 + sx * 0.85, 2.6);
  SEATS.push({ x, z, y: 0.505, yaw: yawTo(x, z, TABLE[0], TABLE[1]), stand: toWorld(T, -0.5 + sx * 1.5, 2.6), group: 'truck' });
}
// 🪑 광장 가장자리 벤치 4개 (campusMock.js: x ±21.6, z 9·20, 돌림 π/2 → 앉으면 서쪽을 봄). 벤치마다 2자리. 걸어가는 곳은 광장 안쪽
for (const sx of [-1, 1]) for (const bz of [9, 20]) {
  const B = { x: sx * 21.6, z: bz, yaw: Math.PI / 2 };
  for (const lx of [-0.42, 0.42]) {
    const [x, z] = toWorld(B, lx, 0.05);
    SEATS.push({ x, z, y: BENCH_Y, yaw: B.yaw, stand: [sx * 20.7, z], group: `b${sx}${bz}` });
  }
}
// 🌊 전망대 데크 벤치 2개 (campusProps.js deck: 데크 안쪽 x ±5.2, z 0.4, 돌림 π → 바다를 봄). 데크 바닥 0.25m
for (const dx of [-5.2, 5.2]) {
  const D = SPOTS.deck;
  for (const lx of [-0.42, 0.42]) {
    const x = D.x + dx - lx, z = D.z + 0.4 - 0.05;
    SEATS.push({ x, z, y: 0.25 + BENCH_Y, yaw: Math.PI, stand: [x, D.z - 0.45], group: `d${dx}` });
  }
}

// ── 내 상태 · 다른 사람 모습 ──
const me = { h: null, s: null, busy: false }; // h = [음식, 받은 시각(ms), 무늬] · s = 앉은 자리 번호
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
function clean(v) {
  if (!v || typeof v !== 'object') return null;
  let h = null, s = null;
  if (Array.isArray(v.h) && Object.hasOwn(FOOD, v.h[0]) && fin(v.h[1]) && Math.abs(Date.now() - v.h[1]) < (EAT.life + 5) * 1000)
    h = [v.h[0], v.h[1], Number.isInteger(v.h[2]) ? Math.abs(v.h[2]) % 3 : 0];
  if (Number.isInteger(v.s) && v.s >= 0 && v.s < SEATS.length) s = v.s;
  return h || s != null ? { h, s } : null;
}
const myState = () => (me.h || me.s != null ? { h: me.h, s: me.s } : null);
const send = () => plazaApi.sendInfo?.();

// 캐릭터마다 붙인 것: f.prop = { key, hold, sit, sitK, seat }
function holdOn(f, h) {
  const key = h ? h.join(':') : '';
  const P = (f.prop ||= { key: '', hold: null, sit: null, sitK: 0, seat: null });
  if (P.key === key) return P;
  P.hold?.drop(); P.hold = null; P.key = key;
  if (h) P.hold = holdFood(f.c, h[0], HOLD_STYLE, h[1] / 1000, h[2]);
  return P;
}
function seatTaken(i) {
  for (const p of plazaApi.people().values()) if (p.pr?.s === i) return true;
  return false;
}
// 같은 의자·벤치 묶음에서 비어 있는 자리 (누른 자리 → 가까운 순)
function freeSeat(i) {
  const S = SEATS[i];
  const list = SEATS.map((s, j) => j).filter((j) => SEATS[j].group === S.group && !seatTaken(j))
    .sort((a, b) => Math.hypot(SEATS[a].x - S.x, SEATS[a].z - S.z) - Math.hypot(SEATS[b].x - S.x, SEATS[b].z - S.z));
  return list.length ? list[0] : null;
}
function sitAt(i) {
  const j = freeSeat(i);
  if (j == null) { hud.toast('🪑 자리가 다 찼어요', 1600); return; }
  const S = SEATS[j];
  plazaApi.walkNear(S.stand, () => {
    if (seatTaken(j)) { hud.toast('🪑 누가 먼저 앉았어요', 1600); return; }
    me.s = j;
    playUI('click');
    send();
  });
}
function standUp() {
  if (me.s == null) return;
  me.s = null;
  send();
}

// ── 손에 들기 (날아가는 음식 → 손) ──
const flying = []; // { g, from, to(함수), t0, dur, then }
function giveFood(id, fromWorld, { delay = 0, drop = false } = {}) {
  const seed = id === 'can' ? (Math.random() * 3) | 0 : 0;
  const g = makeFood(id, seed);
  g.position.copy(fromWorld);
  if (id === 'can') g.rotation.z = Math.PI / 2; // 누워서 떨어짐
  plazaApi.view.root.add(g);
  const f0 = performance.now() / 1000 + delay;
  flying.push({ g, id, seed, t0: f0, drop, from: fromWorld.clone(), dur: 0.55 });
}
const handW = new THREE.Vector3();
function myHand() {
  const f = plazaApi.view.figs.get(plazaApi.myId());
  if (!f) return null;
  handW.set(HOLD.A.x, HOLD.A.y, HOLD.A.z);
  f.c.body.localToWorld(handW);
  return plazaApi.view.root.worldToLocal(handW);
}
function tickFlying(now) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const F = flying[i], g = F.g;
    g.userData.tick?.(now);
    let a = now - F.t0;
    if (F.drop) { // 🥤 자판기: 꺼내는 곳 안으로 툭 떨어져 '덜컹' → 잠깐 → 손으로
      if (a < 0) continue;
      if (a < 0.3) { const k = a / 0.3; g.position.y = F.from.y + 0.35 * (1 - k * k); continue; }
      if (!F.clunk) { F.clunk = true; g.position.y = F.from.y; playUI('clunk'); }
      if (a < 0.75) continue;
      a -= 0.75;
    } else if (a < 0) continue;
    const to = myHand();
    if (!to) continue;
    const k = Math.min(1, a / F.dur), e = k * k * (3 - 2 * k);
    g.position.lerpVectors(F.from, to, e); g.position.y += Math.sin(k * Math.PI) * 0.35;
    if (F.id === 'can') g.rotation.z = (Math.PI / 2) * (1 - e);
    if (k >= 1) {
      plazaApi.view.root.remove(g);
      flying.splice(i, 1);
      me.h = [F.id, Date.now(), F.seed];
      playUI('coin');
      send();
    }
  }
}

// ── 🚚 메뉴 창 (카드 4장, 화면 디자인 '탁구 색 + 유리') ──
const css = document.createElement('style');
css.textContent = `
#prop-pop { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 30; width: min(360px, calc(100vw - 32px));
  background: rgba(255,255,255,.22); border: 1px solid rgba(255,255,255,.55); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-radius: 18px; color: #fff; padding: 12px; box-shadow: 0 6px 24px rgba(30,40,80,.18); }
#prop-pop h3 { margin: 0 0 8px; font-family: Jua, sans-serif; font-size: 18px; font-weight: normal; text-shadow: 0 1px 2px rgba(0,0,0,.25); }
#prop-pop .x { position: absolute; right: 8px; top: 6px; border: 0; background: none; color: #fff; font-size: 20px; cursor: pointer; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
#prop-pop .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
#prop-pop .card { background: rgba(255,255,255,.9); color: #23304a; border: 0; border-radius: 14px; padding: 8px 6px; text-align: center; cursor: pointer; font: inherit; }
#prop-pop .card:hover { background: #fff; }
#prop-pop .card img { width: 58px; height: 58px; display: block; margin: 0 auto 2px; }
#prop-pop .card b { display: block; font-family: Jua, sans-serif; font-weight: normal; font-size: 16px; }
#prop-pop .card em { display: block; font-style: normal; font-size: 11px; color: #5a6a80; margin: 2px 0 6px; }
#prop-pop .coin { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 4px 12px; background: #e0333c; color: #fff; font: 700 13px/1.2 'Pretendard Variable', system-ui, sans-serif; }
#prop-pop .coin::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: #ff9a3d; box-shadow: inset 0 0 0 2px #fff6; }
#prop-pop .sm { margin-top: 8px; font-size: 12px; text-align: center; opacity: .9; text-shadow: 0 1px 2px rgba(0,0,0,.3); }
`;
document.head.appendChild(css);
let pop = null, icons = null;
function closePop() { pop?.el.remove(); pop = null; }
function openTruck() {
  closePop();
  icons ||= Object.fromEntries(Object.keys(FOOD).map((id) => [id, foodIconURL(id)]));
  const el = document.createElement('div'); el.id = 'prop-pop';
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.innerHTML = `<button class="x">×</button><h3>🚚 간식 트럭</h3><div class="cards">${TRUCK_MENU.map((id) => `<button class="card" data-id="${id}"><img src="${icons[id]}" alt=""><b>${FOOD[id].name}</b><em>${FOOD[id].fx}</em><span class="coin">${FOOD[id].price}</span></button>`).join('')}</div>
    <div class="sm">🧪 시험 중: 지금은 코인이 안 빠지고 효과도 아직 없어요</div>`;
  el.querySelector('.x').onclick = closePop;
  el.querySelectorAll('.card').forEach((b) => (b.onclick = () => buyTruck(b.dataset.id)));
  document.body.appendChild(el);
  pop = { el, at: plazaApi.pos() };
}
const COUNTER = (() => { const [x, z] = toWorld(T, -0.27, 1.35); return new THREE.Vector3(x, 1.3, z); })(); // 판매창 계산대 위
function buyTruck(id) {
  if (me.busy) return;
  closePop();
  playUI('click');
  me.busy = true; setTimeout(() => (me.busy = false), 900);
  giveFood(id, COUNTER, { delay: 0.25 });
  hud.toast(`${FOOD[id].emo} ${FOOD[id].name} 받았어요! 탁자에 앉아 먹어 볼까요`, 2200);
  // 받은 뒤 옆 탁자 빈 의자로 (사용자 확정 흐름: 판매창에서 받아 손에 듦 → 옆 탁자 의자에 앉기)
  setTimeout(() => {
    if (me.s != null || plazaApi.seat?.()) return;
    const i = SEATS.findIndex((s) => s.group === 'truck');
    if (freeSeat(i) != null) sitAt(i);
  }, 1000);
}
// 판매창 앞에 서는 곳 (탁자와 트럭 사이는 좁아서 운전석 쪽 끝)
const TRUCK_FRONT = toWorld(T, 1.05, 1.95);

// ── 🥤 자판기 ──
const V = SPOTS.vending, VEND_FRONT = toWorld(V, -0.12, 1.25);
const VEND_CAN = (() => { const [x, z] = toWorld(V, VEND_OUT[0], 0.5); return new THREE.Vector3(x, VEND_OUT[1] - 0.12, z); })();
function useVending() {
  plazaApi.walkNear(VEND_FRONT, () => {
    if (me.busy) return;
    me.busy = true; setTimeout(() => (me.busy = false), 1400);
    playUI('click');
    giveFood('can', VEND_CAN, { drop: true });
    if (Math.random() < 0.01) setTimeout(() => { playUI('rare'); hud.toast('🎉 하나 더! (나중에 코인을 붙이면 1코인 돌려받기)', 2600); }, 700);
  });
}

// ── 누르기: 의자·벤치 (작은 상자) ──
function addSeatPicker() {
  const box = new THREE.Box3(), hit = new THREE.Vector3();
  plazaApi.view.addPicker((ray) => {
    let best = null;
    SEATS.forEach((S, i) => {
      box.min.set(S.x - 0.32, S.y - 0.5, S.z - 0.32); box.max.set(S.x + 0.32, S.y + 0.35, S.z + 0.32);
      if (ray.intersectBox(box, hit)) { const d = hit.distanceTo(ray.origin); if (!best || d < best.d) best = { d, click: () => sitAt(i) }; }
    });
    return best;
  });
}

// ── 매 프레임 ──
let built = false, lastRt = 0;
function frame(now, p, walking) {
  if (!built) { built = true; addSeatPicker(); }
  const t = nowS(), rt = performance.now() / 1000, dt = Math.min(0.1, rt - (lastRt || rt));
  lastRt = rt;
  if (me.s != null && walking) standUp(); // 걸으면 일어남
  if (me.h && Date.now() - me.h[1] > (EAT.life + 1.6) * 1000) { me.h = null; send(); } // 다 먹음
  if (pop && Math.hypot(p[0] - pop.at[0], p[1] - pop.at[1]) > 2.5) closePop(); // 걸어가면 창 닫기
  if (addon('fishing')?.spot?.()) { if (me.s != null) standUp(); }
  tickFlying(rt);
  const people = plazaApi.people(), myId = plazaApi.myId();
  for (const [id, f] of plazaApi.view.figs) {
    const st = id === myId ? myState() : people.get(id)?.pr || null;
    if (!st && !f.prop) continue;
    const P = holdOn(f, st?.h || null);
    const s = st?.s ?? null;
    if (s !== P.seat) {
      if (s != null) { P.sit?.stand(); P.sit = sitPose(f.c, SIT_STYLE, SEATS[s].y); P.seatIdx = s; }
      P.seat = s;
    }
    // 앉기 ↔ 서기를 0.3초에 부드럽게 (서 있는 자리 → 의자 위)
    P.sitK = Math.max(0, Math.min(1, P.sitK + (s != null ? 1 : -1) * (dt / 0.3)));
    const g = f.c.group;
    if (P.hold) { P.hold.tick(t); if (!f.w || Math.hypot(f.w.to[0] - f.disp[0], f.w.to[1] - f.disp[1]) < 0.05) f.c.body.rotation.x = P.hold.nod; }
    if (P.sitK > 0 && P.seatIdx != null) {
      const S = SEATS[P.seatIdx], e = P.sitK * P.sitK * (3 - 2 * P.sitK), gy = g.position.y;
      P.sit.tick(rt, P.hold?.nod || 0);
      const sy = g.position.y; // sitPose가 정한 높이
      g.position.x += (S.x - g.position.x) * e; g.position.z += (S.z - g.position.z) * e;
      g.position.y = gy + (sy - gy) * e + Math.sin(P.sitK * Math.PI) * 0.12; // 폴짝
      let d = S.yaw - f.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y = f.yaw + d * e;
      if (P.sitK >= 1) f.yaw = S.yaw;
      if (P.sitK < 1 && s == null) f.c.body.rotation.x *= e;
    } else if (P.sit && s == null) { P.sit.stand(); P.sit = null; P.seatIdx = null; }
    if (!P.hold && !P.sit && P.key === '') f.prop = null;
  }
}
function hidden() { closePop(); }

registerAddon({
  id: 'props',
  key: 'pr', // 광장 상태 칸 (⚠️ 바꾸지 않기) — { h: [음식, 받은 시각 ms, 무늬], s: 앉은 자리 번호 }
  state: myState,
  clean,
  face: (p) => (p.pr?.s != null ? SEATS[p.pr.s].yaw : null),
  spots: {
    truck: () => plazaApi.walkNear(TRUCK_FRONT, openTruck),
    vending: useVending,
  },
  frame,
  hidden,
});
export const propsDebug = { me, SEATS, sitAt, standUp, openTruck, buyTruck, useVending, get pop() { return pop; } };
