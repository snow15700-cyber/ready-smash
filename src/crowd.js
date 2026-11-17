// 관전석: 관전자들이 각자 꾸민 캐릭터로 탁구대 옆(-x 쪽)에 선다 (기획서 12장)
// 관전자 화면의 '옆에서' 카메라는 +x 쪽에 있어서, 관전석은 탁구대 너머로 보인다 (TV 중계에서 관중이 보이듯).
// 선수 화면에서는 왼쪽(A팀)·오른쪽(B팀) 가장자리에 보인다.
import * as THREE from 'three';
import { makeCharacter } from './scene.js';
import { applyLook } from './items.js';

// 자리 배치 안 (사용자가 고른다). x = 탁구대 가운데에서 떨어진 거리(-x 쪽), gap = 옆 사람 간격,
// perRow = 한 줄에 몇 명, rowGap = 뒷줄 간격, rise = 뒷줄이 얼마나 높아지는지(계단), sit = 앉아 있는지
export const CROWD_LAYOUTS = {
  a: { name: '가까이 서서 한 줄', x: 3.0, gap: 0.62, perRow: 6, rowGap: 0.7, rise: 0, sit: false },
  b: { name: '계단 관중석', x: 3.3, gap: 0.62, perRow: 6, rowGap: 0.75, rise: 0.3, steps: 4, sit: false },
  c: { name: '긴 의자에 앉아서', x: 3.1, gap: 0.62, perRow: 6, rowGap: 0.85, rise: 0.3, steps: 3, sit: true },
};
const DIM = 0.55; // 몰입 연출 최대일 때 관전석이 흐려지는 정도 (어두운 배경에 묻힌다)
const SIT_Y = -0.2; // 앉으면 몸을 의자 속으로 이만큼 내린다 (엉덩이가 의자에 닿게)
const BENCH = 0.46; // 긴 의자 윗면 높이

const wood = new THREE.MeshLambertMaterial({ color: '#b98a57', flatShading: true });
const woodDark = new THREE.MeshLambertMaterial({ color: '#8e6438', flatShading: true });

export function createCrowd(scene, layoutId = 'a') {
  const L = CROWD_LAYOUTS[layoutId] || CROWD_LAYOUTS.a;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const people = new Map(); // id → { c, lookKey, i }
  const seats = []; // 자리 번호 → id (먼저 온 사람이 앞줄 가운데부터)
  let stands = null; // 계단·의자 (사람이 있을 때만)
  let rowsBuilt = 0;
  let meId = null;
  let fadeQ = -1;

  // 자리 번호 i → 위치. 한 줄 안에서는 가운데(0)부터 양옆으로 번갈아
  function seatPos(i) {
    const row = Math.floor(i / L.perRow), k = i % L.perRow;
    const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * L.gap + (row % 2) * L.gap * 0.5;
    const step = Math.min(row, (L.steps || 1) - 1);
    const y = L.sit ? L.rise * step + BENCH : L.rise ? L.rise * (step + 1) : 0;
    return [-(L.x + row * L.rowGap), y, off];
  }

  // 계단(b)·긴 의자(c): 필요한 줄 수만큼
  function buildStands(rows) {
    if (!L.rise || rows <= rowsBuilt) return;
    if (!stands) { stands = new THREE.Group(); root.add(stands); }
    const len = L.perRow * L.gap + 0.8;
    for (let r = rowsBuilt; r < rows; r++) {
      const step = Math.min(r, L.steps - 1);
      const x = -(L.x + r * L.rowGap);
      if (L.sit) {
        // 앉는 긴 의자 (뒷줄은 단 위에)
        const seatY = L.rise * step + BENCH - 0.04;
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, len), wood);
        bench.position.set(x - 0.02, seatY, 0);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, seatY - 0.04, len - 0.2), woodDark);
        base.position.set(x - 0.02, (seatY - 0.04) / 2, 0);
        for (const m of [bench, base]) { m.castShadow = m.receiveShadow = true; stands.add(m); }
      } else {
        const h = L.rise * (step + 1);
        const box = new THREE.Mesh(new THREE.BoxGeometry(L.rowGap, h, len), r % 2 ? woodDark : wood);
        box.position.set(x, h / 2, 0);
        box.castShadow = box.receiveShadow = true;
        stands.add(box);
      }
    }
    rowsBuilt = rows;
  }

  return {
    layout: L,
    dispose() { scene.remove(root); },
    // list = 관전석 채널 출석부 [{ id, nick, look, at }], me = 내 id (관전자 본인은 노란 이름표)
    set(list, me) {
      meId = me;
      const ids = new Set(list.map((m) => m.id));
      for (const [id, p] of people) {
        if (ids.has(id)) continue;
        root.remove(p.c.group);
        p.c.setOutfit(null);
        seats[p.i] = null;
        people.delete(id);
      }
      for (const m of [...list].sort((a, b) => (a.at || 0) - (b.at || 0))) {
        let p = people.get(m.id);
        if (!p) {
          const c = makeCharacter('#e0333c');
          c.setHold(true);
          let i = seats.indexOf(null);
          if (i < 0) i = seats.length;
          seats[i] = m.id;
          p = { c, i, lookKey: null, ph: Math.random() * 6 };
          const [x, y, z] = seatPos(i);
          c.group.position.set(x, y, z);
          c.body.position.y = L.sit ? SIT_Y : 0;
          c.group.rotation.y = -Math.PI / 2; // 탁구대(+x) 쪽을 본다
          root.add(c.group);
          people.set(m.id, p);
        }
        const key = JSON.stringify(m.look || {});
        if (key !== p.lookKey) { p.lookKey = key; applyLook(p.c, m.look || {}); p.c.setHold(true); }
        p.c.setTag(m.nick || '관전자', m.id === meId);
        const tag = p.c.group.children.find((o) => o.isSprite);
        if (tag) { tag.scale.set(0.1, 0.0437, 1); tag.position.y = L.sit ? 1.35 : 1.52; tag.material.opacity = m.id === meId ? 1 : 0.85; }
      }
      buildStands(Math.ceil(seats.length / L.perRow));
      fadeQ = -1;
    },
    get count() { return people.size; },
    // 매 프레임 (경기 화면에서만 show = true). ball = 공 위치, focus = 몰입 정도(0~1)
    update(now, dt, show, ball, focus = 0) {
      root.visible = show && people.size > 0;
      if (!root.visible) return;
      const q = Math.round((1 - DIM * focus) * 20) / 20;
      const refade = q !== fadeQ;
      fadeQ = q;
      const k = 1 - Math.exp(-dt * 4);
      for (const p of people.values()) {
        const c = p.c, g = c.group;
        // 공을 눈으로 따라간다 (가운데와 공 사이를 보게 살짝만)
        const tz = ball ? ball[2] * 0.6 : 0, tx = ball ? ball[0] * 0.6 : 0;
        const want = Math.atan2(-(tx - g.position.x), -(tz - g.position.z));
        let d = want - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * k;
        c.body.position.y = (L.sit ? SIT_Y : 0) + Math.abs(Math.sin(now * 1.6 + p.ph)) * 0.012;
        c.body.rotation.z = Math.sin(now * 0.9 + p.ph) * 0.03;
        c.paddleModel?.userData.tick?.(now, dt);
        c.tickOutfit(now, dt);
        if (refade) c.setOpacity(q, q);
      }
    },
  };
}
