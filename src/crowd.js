// 관중석 (관전 4단계): 탁구대 옆(-x 쪽, 중계 카메라 맞은편)에 관중을 세운다.
// 관중은 '본인 캐릭터'(꾸민 몸 + 장착한 탁구채를 몸 옆에 들기)로, 머리 위에 칭호·이름표(선수 이름표와 같은 모양).
// 보기만 하는 장식이다 — 판정·경기와 상관없음. 12명까지 그리고 나머지는 화면의 '+N명'으로.
// set([{id, nick, title, look, team, me}]) · cheer(id, text) · roar() · update(now) · clear()
import * as THREE from 'three';
import { HALF_W } from './physics.js';
import { applyLook } from './items.js';

export const CROWD_MAX = 12;
const TEAM_COLOR = ['#ff8a3d', '#2f6bc2']; // 응원 팀: 발밑 빛 고리 (A팀 주황, B팀 파랑, 안 고르면 없음)

// 자리: 두 줄 (앞줄 5자리, 뒷줄 8자리 = 13), 칭호 이름표가 서로 덜 겹치게 1.1m 간격. z>0 = A팀(side 0) 쪽, z<0 = B팀 쪽
// 뒷줄은 앞줄 사이사이에 서서 머리가 보이게. 선수 바로 옆(|z| 큰 곳)은 피한다: 선수 화면 가장자리를 가리지 않게
// 탁구대 옆 가장자리에서 앞줄·뒷줄까지 거리(m)는 배경마다 다를 수 있다(배경의 crowd: [앞줄, 뒷줄]) — 물건과 안 겹치게.
// 자리 번호·순서는 어느 배경이든 같아서, 배경이 달라도 같은 사람은 같은 번호 자리에 선다
export const CROWD_ROWS = [2.7, 3.6];
const ZS = [[0, 1.1, 2.2], [0.55, 1.65, 2.75, 3.6]];
const makeSlots = (rows) => {
  const out = [];
  ZS.forEach((zs, row) => { for (const z of zs) for (const sg of z ? [1, -1] : [1]) out.push({ x: -(HALF_W + rows[row]), z: z * sg, row }); });
  return out;
};
let SLOTS = makeSlots(CROWD_ROWS);
// 팀별로 먼저 앉을 자리 순서: 내 팀 쪽 앞줄 가운데부터
const prefer = (team) => SLOTS.map((s, i) => i).sort((a, b) => {
  const A = SLOTS[a], B = SLOTS[b];
  const side = (s) => (team == null ? 0 : (team === 0) === (s.z > 0) ? 0 : 1);
  return side(A) - side(B) || A.row - B.row || Math.abs(A.z) - Math.abs(B.z);
});

// 응원 말풍선 (이름표 바로 위, 거리와 상관없이 같은 크기)
export function bubble() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sp.renderOrder = 21;
  sp.scale.set(0.16, 0.04, 1);
  sp.center.set(0.5, -0.85); // 이름표(칭호 포함) 위로 비켜서
  sp.position.y = 1.52; // 이름표와 같은 기준점
  sp.visible = false;
  sp.draw = (text) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 56px Jua, sans-serif';
    const w = Math.min(500, g.measureText(text).width + 56);
    g.fillStyle = 'rgba(255,255,255,.96)';
    g.beginPath(); g.roundRect((c.width - w) / 2, 14, w, 96, 48); g.fill();
    g.fillStyle = '#2b2a33';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, 64, 470);
    tex.needsUpdate = true;
  };
  return sp;
}

// makeCharacter: scene.js의 캐릭터 만들기 (선수와 같은 캐릭터)
export function createCrowd(scene, makeCharacter) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const figs = new Map(); // id → { c, bub, slot, team, jumpT, bubT, phase }  (set에 오는 명단은 먼저 온 순서)
  let last = 0, shown = true, firstPerson = false; // shown: 경기 화면에서만 관중석을 보인다 (대기실 무대엔 안 세움 — 사용자 확정: 대기실은 관중 수만)
  // 몰입 연출(랠리가 길어지면 배경이 어두워짐)에 관중도 같이 어두워지게: 몸·탁구채·이름표·말풍선·빛 고리 전부.
  // 재질 색을 dim배로 바꿔 두고(원래 색은 f.saved에), 색을 새로 쓰는 일(꾸미기·이름표·움직이는 옷) 전에 되돌렸다가 다시 어둡게.
  // 그래서 경기 도중에 들어온 관중도 처음부터 어둡다
  let dim = 1;
  // 반사(envMap)·반짝임(specular)은 색과 따로 밝게 빛나서(기사 갑옷·미러볼 의상 같은 전설 옷) 그것도 같이 줄인다
  const undim = (f) => {
    for (const e of f.saved) {
      e.m.color.copy(e.c);
      if (e.e) e.m.emissive.copy(e.e);
      if (e.s) e.m.specular.copy(e.s);
      if (e.r != null) e.m.reflectivity = e.r;
      if (e.i != null) e.m.envMapIntensity = e.i;
    }
    f.saved = [];
  };
  const darken = (f) => {
    if (dim >= 1) return;
    const seen = new Set();
    f.c.group.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (!m.color || seen.has(m)) continue;
        seen.add(m);
        const env = !!m.envMap;
        f.saved.push({
          m, c: m.color.clone(), e: m.emissive ? m.emissive.clone() : null, s: m.specular ? m.specular.clone() : null,
          r: env && typeof m.reflectivity === 'number' ? m.reflectivity : null, i: env && typeof m.envMapIntensity === 'number' ? m.envMapIntensity : null,
        });
        m.color.multiplyScalar(dim);
        if (m.emissive) m.emissive.multiplyScalar(dim);
        if (m.specular) m.specular.multiplyScalar(dim);
        if (env && typeof m.reflectivity === 'number') m.reflectivity *= dim;
        if (env && typeof m.envMapIntensity === 'number') m.envMapIntensity *= dim;
      }
    });
  };

  function make() {
    const c = makeCharacter('#e0333c');
    c.setHold(true); // 탁구채를 몸 옆에 붙여 들기 (대기실과 같은 자세)
    c.group.traverse((o) => { o.castShadow = false; }); // 가볍게
    const bub = bubble();
    c.group.add(bub);
    root.add(c.group);
    return { c, bub, jumpT: -9, bubT: -9, phase: Math.random() * 6, saved: [] };
  }
  const drop = (id, f) => { root.remove(f.c.group); figs.delete(id); };

  return {
    root,
    // 배경이 바뀔 때: 그 배경의 관중 줄 위치로 (서 있던 관중도 옮긴다)
    setRows(rows = CROWD_ROWS) {
      SLOTS = makeSlots(rows);
      for (const f of figs.values()) { const s = SLOTS[f.slot]; f.c.group.position.set(s.x, 0, s.z); }
    },
    // 관중 명단이 바뀔 때. 먼저 온 사람부터 12명
    set(list) {
      const show = list.slice(0, CROWD_MAX);
      const keep = new Set(show.map((m) => m.id));
      for (const [id, f] of figs) if (!keep.has(id)) drop(id, f);
      // 자리는 명단 순서(먼저 온 사람부터)대로 응원 팀 쪽 빈자리 → 모든 화면에서 같은 자리에 선다
      const used = new Set();
      for (const m of show) {
        let f = figs.get(m.id);
        if (!f) { f = make(); figs.set(m.id, f); }
        undim(f);
        f.team = m.team;
        f.slot = prefer(m.team).find((i) => !used.has(i));
        used.add(f.slot);
        const s = SLOTS[f.slot];
        f.c.group.position.set(s.x, 0, s.z);
        f.c.group.rotation.y = -Math.PI / 2; // 탁구대(+x) 쪽을 본다 (캐릭터 앞 = -z)
        applyLook(f.c, m.look); // 꾸민 몸 + 장착한 탁구채
        f.c.setTag(m.nick, !!m.me, m.title || ''); // 칭호 + 이름 (내 이름은 노랗게)
        // 관중 이름표는 선수보다 조금 작게 (여럿이 붙어 서도 덜 겹치게)
        for (const o of f.c.group.children) if (o.isSprite && o !== f.bub && !o.userData.small) { o.userData.small = true; o.scale.multiplyScalar(0.8); }
        f.c.setGlow(m.team === 0 || m.team === 1 ? TEAM_COLOR[m.team] : null);
        f.me = !!m.me;
        f.c.group.visible = !(f.me && firstPerson); // 1인칭으로 볼 땐 내 캐릭터는 숨김 (카메라가 머리 안에 있으니까)
        darken(f);
      }
      root.visible = shown && figs.size > 0;
    },
    // 응원: 폴짝 뛰며 탁구채를 흔들고, 이름표 위에 말풍선
    // 몰입 연출 밝기 (scene.js의 setFocus가 배경과 같은 값으로 부른다. 1 = 원래 밝기)
    setDim(k) {
      dim = k;
      for (const f of figs.values()) { undim(f); darken(f); }
    },
    cheer(id, text, now = performance.now() / 1000) {
      const f = figs.get(id);
      if (!f) return;
      f.jumpT = now;
      f.bub.draw(text);
      f.bub.visible = true;
      f.bubT = now;
    },
    // 점수 났을 때: 모두 한 번씩 (조금씩 어긋나게) 뛴다
    roar(now = performance.now() / 1000) {
      for (const f of figs.values()) f.jumpT = now + Math.random() * 0.25;
    },
    update(now) {
      if (!root.visible) return;
      const dt = Math.min(0.1, now - (last || now));
      last = now;
      for (const f of figs.values()) {
        const jt = now - f.jumpT;
        const on = jt >= 0 && jt < 0.6;
        const jump = jt >= 0 && jt < 0.45 ? Math.sin((jt / 0.45) * Math.PI) * 0.22 : 0;
        f.c.body.position.y = jump + Math.sin(now * 2.2 + f.phase) * 0.008;
        f.c.body.rotation.z = Math.sin(now * 1.3 + f.phase) * 0.04;
        f.c.arm.rotation.z = on ? Math.sin(jt * 22) * 0.35 : 0; // 탁구채 흔들기
        // 움직이는 옷 (전설 효과 등): 색을 바꾸는 옷이 있어서, 어두운 동안엔 원래 색으로 돌린 뒤 움직이고 다시 어둡게
        if (f.saved.length) { undim(f); f.c.tickOutfit(now, dt); darken(f); } else f.c.tickOutfit(now, dt);
        if (f.bub.visible && now - f.bubT > 2.2) f.bub.visible = false;
      }
    },
    // 관전 '내 자리에서'(1인칭) 시점: 내 캐릭터가 선 자리 {x, z} (관중석에 자리가 없으면 null)
    mySpot() {
      for (const f of figs.values()) if (f.me) return SLOTS[f.slot];
      return null;
    },
    // 1인칭 시점 켜기/끄기: 내 캐릭터를 숨긴다
    setFirstPerson(on) {
      if (firstPerson === on) return;
      firstPerson = on;
      for (const f of figs.values()) if (f.me) f.c.group.visible = !on;
    },
    setShown(on) { shown = on; root.visible = on && figs.size > 0; },
    clear() { for (const [id, f] of figs) drop(id, f); root.visible = false; },
  };
}
