// 경기장 거품 (docs/dev/plaza.md 16장): 경기 중인 탁구대 둘레 원(7m) 안으로 걸어 들어가면 자동으로 관전 +
// 광장이 그 경기의 방장 배경으로 바뀐다(불꽃 고리 물결, src/bubbleFx.js). 원(9m) 밖으로 나가면 다시 광장.
// - 선수 부담 0: 그 경기 채널은 듣기만(명단에도 안 들어가고 아무것도 안 보냄). 관전자 수는 관중석 채널 명단으로(선수는 듣기만).
// - 원 안에서는 광장처럼 걸어 다니며 보고(3인칭 카메라), '🪑 관중석에 앉기'를 누르면 관중석 내 자리 1인칭.
// - 같은 원 안 관전자끼리는 걷는 모습이 보인다(광장 채널). 응원(박수 등)은 그 사람 머리 위 말풍선.
// - 기존 관전 화면(고정 카메라 시점들)은 이것으로 바뀌었다.
import * as THREE from 'three';
import { myEquip, myTitle } from '../account.js';
import { titleText } from '../achievements.js';
import { initAudio, playUI } from '../audio.js';
import { BUBBLE_IN, BUBBLE_OUT, PLAZA } from '../arena-plaza.js';
import { WAVE_DUR, applyWave, prepWave, waveR } from '../bubbleFx.js';
import { Game } from '../game.js';
import { applyLook, arenaOf } from '../items.js';
import { AI_LOOK, AI_NAME, KIM_ID } from '../match.js';
import { joinRoom } from '../net.js';
import { fireBand } from '../plaza.js';
import { CHEERS, cheerHooks, cheerState, crowdJoin, crowdLeave, pickCheerTeam, sendCheer } from './cheer.js';
import { myId } from './room.js';
import { $, esc, myNemesis, myNick, world } from './state.js';

const JOIN_WAIT = 6000; // 이 안에 경기 소식(방장)이 안 오면 그만
const failed = new Map(); // 경기 코드 → 붙기 실패한 시각 (채널에 들락날락하지 않게)
export const bub = {
  phase: 'off', // off · join(채널 붙는 중, 아직 광장) · in(광장 → 경기장 물결) · inside · out(경기장 → 광장 물결)
  t: -1, r: null, code: '', q: 0, link: null, game: null, members: [], hostM: null, sawHost: false,
  offs: [], live: false, seated: false, score: [0, 0], over: null, joinAt: 0, gone: 0,
};
export const bubbleOn = () => bub.phase !== 'off';
export const bubbleArena = () => bub.phase === 'in' || bub.phase === 'inside' || bub.phase === 'out'; // 경기장을 그리는 중
export const bubbleLook = () => (bubbleArena() || bub.phase === 'join' ? bub.hostM?.look || null : null);
export const bubbleSeated = () => bub.phase === 'inside' && bub.seated;
let view = null;

// 물결 앞 불꽃 띠 + 불티 (세상 원점 = 그 탁구대)
const front = fireBand(0.93, 1.07, 0);
front.visible = false;
world.scene.add(front);
const SPK = 400;
const spkGeo = new THREE.BufferGeometry();
spkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPK * 3), 3));
const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparks.frustumCulled = false; sparks.visible = false;
world.scene.add(sparks);
const spk = Array.from({ length: SPK }, (_, i) => ({ a: (i / SPK) * Math.PI * 2 + Math.sin(i * 7.1), h: Math.sin(i * 3.7) * 0.5 + 0.5, v: 0.6 + (Math.sin(i * 1.3) * 0.5 + 0.5) * 1.6 }));
function fireFront(R, now, on) {
  front.visible = sparks.visible = on && R > 0 && R < 60;
  if (!front.visible) return;
  front.scale.setScalar(Math.max(0.01, R));
  front.material.opacity = Math.max(0, 1 - R / 60);
  const pa = spkGeo.attributes.position;
  for (let i = 0; i < SPK; i++) {
    const s = spk[i], life = (now * s.v + s.h) % 1, r = Math.max(0, R - life * 0.6);
    pa.setXYZ(i, Math.cos(s.a + life * 0.2) * r, life * life * 1.8, Math.sin(s.a + life * 0.2) * r);
  }
  pa.needsUpdate = true;
  sparks.material.opacity = Math.max(0, 1 - R / 50);
}

// 관전 경기 화면 글자는 광장 막대로 (경기 화면 #hud는 안 씀)
const quietHud = {
  score(s) { bub.score = [...s]; renderBar(); }, stats() {}, hint() {}, turn() {}, judge() {}, toast() {},
  watchOver(winner, score) { bub.over = { winner, score: [...score] }; bub.score = [...score]; renderBar(); playUI('win'); },
  gameOver() {},
};

// ───── 들어가기 · 나가기 ─────
function start(t, r) {
  stop();
  initAudio();
  Object.assign(bub, { phase: 'join', t, r, code: r.code, q: 0, members: [], hostM: null, sawHost: false, offs: [], live: false, seated: false, score: r.score || [0, 0], over: null, joinAt: performance.now(), gone: 0 });
  const me = { id: myId, nick: myNick(), at: Date.now() };
  const code = r.code;
  bub.link = joinRoom(code, me, {
    onMsg: (m) => { if (bub.code === code) onMsg(m); },
    onMembers: (list) => { if (bub.code === code) onMembers(list); },
    onStatus: () => {},
  }, { listen: true });
  // 관전자 수: 관중석 채널 명단에 들어간다 (선수는 듣기만 → '👀 관중 N명')
  crowdJoin(code, { ...me, team: null, look: myEquip(), title: myTitle(), titleX: myNemesis() });
}
// 경기장 물결 시작 (방장 꾸미기를 알고 배경이 준비되면)
function beginIn() {
  bub.phase = 'in';
  bub.q = 0;
  const pl = bub.r.pl;
  const n = names();
  bub.game = new Game(world, { mySide: 0, mode: bub.r.mode, hud: quietHud, spectator: true, names: n.names, playerNames: n.per, playerTitles: n.tl, looks: [[{}, {}], [{}, {}]], send: { toss() {}, swing() {} } });
  bub.game.view = 'free';
  for (const p of pl) applyLook(world.team[p.side][p.slot], lookOf(p.id));
  world.crowd.setFirstPerson(true); // 관중석의 내 캐릭터는 숨김 (걸어 다니는 내가 나)
  view.setFrame(bub.t);
  prep();
  renderBar();
  playUI('rare');
}
function beginOut() {
  if (bub.phase === 'out') return;
  if (bub.phase === 'join') { stop(); return; }
  bub.seated = false;
  view.setCamOff(false);
  bub.q = bub.phase === 'in' ? 1 - bub.q : 0; // 들어가던 중이면 그 자리에서 되돌아감
  bub.phase = 'out';
  renderBar();
}
export function stop() {
  if (bub.phase === 'off') return;
  bub.link?.leave();
  bub.link = null;
  crowdLeave();
  if (bub.game) { bub.game.destroy(); bub.game = null; }
  world.crowd.setFirstPerson(false);
  world.crowd.setShown(false);
  world.setBall([0, -9, 0], false);
  world.ring.visible = false; world.aim.visible = false;
  sun.castShadow = true;
  bub.phase = 'off';
  bub.code = '';
  bub.seated = false;
  view?.setCamOff(false);
  view?.setFrame(null);
  view?.setFilter(null);
  view?.setPlazaBits(true);
  resetWave();
  fireFront(-1, 0, false);
  renderBar();
}

// ───── 경기 소식 (관전과 같은 방식: 듣기만) ─────
function onMembers(list) {
  bub.members = list;
  const host = list.find((m) => m.host);
  if (host) { bub.sawHost = true; bub.hostM = host; }
  if (bub.game) {
    const n = names();
    bub.game.names = n.names; bub.game.playerNames = n.per; bub.game.playerTitles = n.tl;
    for (const p of bub.r.pl) applyLook(world.team[p.side][p.slot], lookOf(p.id));
  }
  renderBar();
}
const lookOf = (id) => (id === KIM_ID ? AI_LOOK : bub.members.find((m) => m.id === id)?.look || {});
function names() {
  const nick = (id) => (id === KIM_ID ? AI_NAME : bub.members.find((m) => m.id === id)?.nick || '선수');
  const pl = bub.r.pl;
  const per = [[], []], tl = [[], []];
  for (const p of pl) { per[p.side][p.slot] = nick(p.id); const m = bub.members.find((x) => x.id === p.id); tl[p.side][p.slot] = m ? titleText(m.title, m.titleX) : ''; }
  return { names: [0, 1].map((s) => pl.filter((p) => p.side === s).sort((a, b) => a.slot - b.slot).map((p) => nick(p.id)).join('·')), per, tl };
}
function clock(hostT) {
  bub.offs.push(hostT - performance.now() / 1000);
  if (bub.offs.length > 30) bub.offs.shift();
  if (bub.game) bub.game.offset = Math.max(...bub.offs);
}
function onMsg(m) {
  if (!m) return;
  if (m.k === 'pong' && typeof m.th === 'number') { clock(m.th); return; }
  if (m.k !== 'ev' || !m.ev || typeof m.ev !== 'object') return;
  const ev = m.ev;
  if (typeof ev.t === 'number' && (ev.type === 'shot' || ev.type === 'toss')) clock(ev.t);
  if (Array.isArray(ev.score) && ev.score.length === 2) { bub.score = ev.score.map((v) => v | 0); renderBar(); }
  if (!bub.game) return;
  if (!bub.live) {
    if (ev.type !== 'serveReady') return; // 다음 서브부터 그린다
    bub.live = true;
    bub.game.score = [...bub.score];
  }
  bub.game.onEvent(ev);
}

// ───── 물결 (광장 ↔ 경기장) ─────
let pw = null, aw = null, awRoot = null;
function prep() {
  pw = prepWave(world.plaza.root);
  if (awRoot !== world.arena.root) { awRoot = world.arena.root; aw = prepWave(awRoot); }
}
function resetWave() {
  if (pw) applyWave(pw, 1e5, 'off');
  if (aw) applyWave(aw, 1e5, 'off');
  if (world.table) { world.table.scale.setScalar(1); world.table.position.y = 0; }
}
const ease = (t) => t * t * (3 - 2 * t);
const back = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// 광장 하늘·빛(plazaSky가 매 프레임 정한 것)과 경기장 하늘·빛을 섞는다. e = 0 광장, 1 경기장
const hemi = world.scene.children.find((o) => o.isHemisphereLight), sun = world.scene.children.find((o) => o.isDirectionalLight);
const C1 = new THREE.Color(), C2 = new THREE.Color();
function mixEnv(e, plazaEnv) {
  const a = world.arena;
  if (!a || !plazaEnv) return;
  const k = ease(Math.min(1, Math.max(0, e)));
  world.scene.background = C1.copy(plazaEnv.bg).lerp(C2.set(a.sky), k).clone();
  world.scene.fog = new THREE.Fog(world.scene.background, plazaEnv.fog[0] + (a.fog[0] - plazaEnv.fog[0]) * k, plazaEnv.fog[1] + (a.fog[1] - plazaEnv.fog[1]) * k);
  hemi.color.copy(plazaEnv.hc).lerp(C2.set(a.light.hemi[0]), k);
  hemi.groundColor.copy(plazaEnv.hg).lerp(C2.set(a.light.hemi[1]), k);
  hemi.intensity = plazaEnv.hi + (a.light.hemi[2] - plazaEnv.hi) * k;
  sun.color.copy(plazaEnv.sc).lerp(C2.set(a.light.sun[0]), k);
  sun.intensity = plazaEnv.si + (a.light.sun[1] - plazaEnv.si) * k;
  if (world.camera.far < 300) { world.camera.far = 300; world.camera.updateProjectionMatrix(); }
}
// 광장 하늘·빛 기억 (광장일 때 매 프레임)
export function rememberPlazaEnv() {
  const s = world.scene;
  return { bg: s.background.clone(), fog: [s.fog?.near ?? 35, s.fog?.far ?? 85], hc: hemi.color.clone(), hg: hemi.groundColor.clone(), hi: hemi.intensity, sc: sun.color.clone(), si: sun.intensity };
}

// ───── 매 프레임 (광장이 보일 때, src/ui/plaza.js plazaFrame) ─────
// me = 내 자리(광장 좌표), busy[t] = 경기 중 정보, ok = 거품에 들어갈 수 있는 상태(광장 채널·탁구대에 안 섬 등), plazaEnv = 광장 하늘·빛
export function bubbleFrame(v, now, dt, me, busy, ok, plazaEnv) {
  view = v;
  const dist = (t) => Math.hypot(me[0] - PLAZA.tables[t].x, me[1] - PLAZA.tables[t].z);
  // 들어가기
  if (bub.phase === 'off') {
    if (!ok) return;
    busy.forEach((r, t) => { if (bub.phase === 'off' && r && dist(t) < BUBBLE_IN && !(performance.now() - (failed.get(r.code) || -1e9) < 10000)) start(t, r); });
    return;
  }
  const r = busy[bub.t];
  const inside = dist(bub.t) < BUBBLE_OUT;
  // 나가기: 원 밖 / 그 경기가 끝나 선수들이 돌아감(경기 정보가 1.5초 넘게 없음) / 다른 경기로 바뀜
  if (!r || r.code !== bub.code) bub.gone ||= performance.now(); else bub.gone = 0;
  const ended = bub.gone && performance.now() - bub.gone > 1500;
  if (!ok || !inside || ended) beginOut();
  if (bub.phase === 'join') {
    if (performance.now() - bub.joinAt > JOIN_WAIT) { failed.set(bub.code, performance.now()); stop(); return; } // 방장 소식이 없음 → 이 경기는 10초 동안 다시 안 붙음
    // 방장 꾸미기를 알고(배경), 그 배경이 다 지어지면 물결 시작
    // (배경을 못 짓는 경우를 대비해 3.5초 지나면 지금 배경으로라도)
    if (bub.hostM && world.arena && (world.arenaId === (arenaOf(bub.hostM.look) || 'gym') || performance.now() - bub.joinAt > 3500)) beginIn();
    return;
  }
  // 물결
  if (bub.phase === 'in' || bub.phase === 'out') bub.q = Math.min(1, bub.q + dt / WAVE_DUR);
  const enter = bub.phase !== 'out';
  const q = bub.phase === 'inside' ? 1 : bub.q;
  const R = waveR(q);
  if (pw && aw) {
    applyWave(pw, R, 'go'.replace('go', enter ? 'go' : 'come'));
    applyWave(aw, R, enter ? 'come' : 'go');
  }
  // 경기장 탁구대도 물결과 함께 (가운데라 제일 먼저)
  if (world.table) {
    const k = Math.min(1, Math.max(0, R / 3));
    const s = enter ? (k > 0 ? back(k) : 0) : 1 - ease(k);
    world.table.visible = s > 0.01;
    world.table.scale.setScalar(Math.max(0.001, s));
  }
  world.plaza.root.visible = !(enter && q >= 1);
  world.arena.root.visible = !(!enter && q >= 1);
  sun.castShadow = q >= 1 || q <= 0; // 물결 중엔 그림자를 잠깐 끔 (줄어드는 물건 그림자가 남지 않게)
  mixEnv(enter ? q : 1 - q, plazaEnv);
  fireFront(R, now, bub.phase === 'in' || bub.phase === 'out');
  view.setPlazaBits(!(enter && q > 0.3) && !(bub.phase === 'out' && q < 0.7));
  // 원 안에서는 원 안 사람만 보인다 (광장에 있는 사람이 경기장 위에 떠 보이지 않게)
  const T = PLAZA.tables[bub.t];
  view.setFilter((f, p) => Math.hypot(p[0] - T.x, p[1] - T.z) < BUBBLE_OUT + 0.5);
  if (bub.phase === 'in' && bub.q >= 1) { bub.phase = 'inside'; renderBar(); }
  if (bub.phase === 'out' && bub.q >= 1) { stop(); return; }
  // 경기 그리기 (공·선수·관중석 시점)
  if (bub.game) {
    bub.game.update(now + bub.game.offset);
    for (const side of world.team) for (const c of side) if (c.group.visible) c.tickOutfit(now, dt);
  }
}

// ───── 아래 막대: 점수 · 관전자 수 · 관중석에 앉기 · 응원 ─────
function renderBar() {
  const el = $('pz-bub');
  if (!el) return;
  const on = bub.phase === 'inside' || bub.phase === 'in';
  el.classList.toggle('hidden', !on);
  document.body.classList.toggle('pz-bubble', bubbleArena());
  if (!on) return;
  const n = bub.game ? bub.game.names : names().names;
  const cs = cheerState();
  const result = bub.over ? `<b class="pzb-over">🏆 ${esc(n[bub.over.winner] || '')} 승리!</b>` : '';
  el.innerHTML = `<div class="pzb-top"><span class="pzb-t">${bub.t + 1}번 탁구대</span><span class="pzb-sc"><em class="t0">${esc(n[0] || 'A팀')}</em> <b>${bub.score[0]} : ${bub.score[1]}</b> <em class="t1">${esc(n[1] || 'B팀')}</em></span><span class="pzb-eye">👀 ${cs.n}명</span>${result}</div>`
    + `<div class="pzb-row"><button type="button" class="small pzb-seat" data-bub="seat">${bub.seated ? '🚶 일어나기' : '🪑 관중석에 앉기'}</button>`
    + [0, 1].map((t) => `<button type="button" class="small${cs.team === t ? ' on' : ''}" data-team="${t}">${t ? '💙' : '🧡'}</button>`).join('')
    + Object.entries(CHEERS).map(([k, c]) => `<button type="button" class="small" data-cheer="${k}"${cs.cool ? ' disabled' : ''}>${c.text.slice(0, 2)}</button>`).join('') + '</div>';
}
cheerHooks.game = () => bub.game;
cheerHooks.onList = renderBar;
cheerHooks.onCheer = (id, text) => view?.say(id, text);
$('pz-bub').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.bub === 'seat') { playUI('click'); setSeated(!bub.seated); return; }
  if (b.dataset.team) { playUI('click'); pickCheerTeam(+b.dataset.team); return; }
  if (b.dataset.cheer) sendCheer(b.dataset.cheer);
});
// 관중석에 앉기: 관중석 내 자리 1인칭 (경기 쪽 시점). 바닥을 누르면 일어나서 걷는다
export function setSeated(on) {
  if (bub.phase !== 'inside' || !bub.game) return;
  bub.seated = !!on;
  bub.game.view = on ? 'me' : 'free';
  view.setCamOff(on);
  world.crowd.setShown(on);
  if (!on) world.crowd.setFirstPerson(true);
  renderBar();
}
export const bubbleDebug = bub;
