// 관전석: 관전자들이 각자 꾸민 캐릭터로 탁구대 양옆 계단 관중석에 선다 (기획서 12장, 사용자 확정 = 양쪽 + 계단)
// 선수 화면에서는 왼쪽·오른쪽 가장자리에, 관전자 '옆에서' 카메라(+x 관중석 꼭대기 위)에서는 탁구대 너머와 발아래로 보인다.
import * as THREE from 'three';
import { makeCharacter } from './scene.js';
import { applyLook } from './items.js';

// x = 탁구대 가운데에서 첫 줄까지 거리, gap = 옆 사람 간격, perRow = 한 줄에 몇 명(탁구대 길이 안),
// rowGap = 뒷줄 간격, rise = 한 칸 높이, steps = 계단 칸 수(그 뒤로는 같은 높이로 계속)
const L = { x: 3.3, gap: 0.62, perRow: 6, rowGap: 0.75, rise: 0.3, steps: 4 };
const NEAR = 2.4; // 카메라에서 이만큼(m) 안의 관전자는 흐리게
const DIM = 0.55; // 몰입 연출 최대일 때 관전석이 흐려지는 정도 (어두운 배경에 묻힌다)

// 응원 말풍선 글자 (main.js의 응원 버튼과 같은 이름). 팀 응원은 팀 색 알약
export const CHEERS = { clap: '👏', fire: '🔥', wow: '😮', lol: '😂', a: '🚩 A팀', b: '🚩 B팀' };
const TEAM_COL = { a: '#ff7a2f', b: '#2f6fd6' };
const BUBBLE = { life: 1.8, rise: 0.18, y: 1.6, h: 0.075 }; // y: 머리 바로 위 (말풍선이 떠 있는 동안 이름표는 숨김)
const JUMP = { len: 0.45, h: 0.16 };
const bubbleTex = {};
function getBubble(kind) {
  if (bubbleTex[kind]) return bubbleTex[kind];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const text = CHEERS[kind] || '👏';
  const team = TEAM_COL[kind];
  g.font = `bold ${team ? 54 : 78}px Jua, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  const w = Math.min(248, g.measureText(text).width + 44);
  g.fillStyle = team || 'rgba(255,255,255,0.94)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 100, 50);
  g.fill();
  // 말풍선 꼬리
  g.beginPath();
  g.moveTo(118, 104); g.lineTo(128, 124); g.lineTo(138, 104);
  g.fill();
  g.fillStyle = team ? '#fff' : '#2b2a33';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 62, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (bubbleTex[kind] = tex);
}

const wood = new THREE.MeshLambertMaterial({ color: '#b98a57', flatShading: true });
const woodDark = new THREE.MeshLambertMaterial({ color: '#8e6438', flatShading: true });

export function createCrowd(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const people = new Map(); // id → { c, lookKey, i }
  const seats = []; // 자리 번호 → id. 짝수 = 왼쪽(-x), 홀수 = 오른쪽(+x) 관중석. 먼저 온 사람이 앞줄 가운데부터
  let stands = null;
  const rowsBuilt = [0, 0]; // 쪽마다 지은 계단 줄 수
  let meId = null;
  const bubbles = []; // 응원 말풍선 { s, p, t0 } (캐릭터 투명도 처리에 안 걸리게 관전석 묶음에 따로)
  const addBubble = (p, kind, t0) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getBubble(kind), depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.renderOrder = 21;
    sp.center.set(0.5, 0);
    sp.visible = false;
    root.add(sp);
    // 같은 사람의 이전 말풍선은 바로 치운다 (겹치지 않게)
    for (const b of bubbles) if (b.p === p) b.t0 = -99;
    bubbles.push({ s: sp, p, t0 });
    p.bubbleUntil = t0 + BUBBLE.life;
  };

  const sideOf = (i) => (i % 2 ? 1 : -1);
  // 자리 번호 i → 위치. 양쪽 관중석에 번갈아, 한 줄 안에서는 가운데부터 양옆으로
  function seatPos(i) {
    const j = Math.floor(i / 2), sx = sideOf(i);
    const row = Math.floor(j / L.perRow), k = j % L.perRow;
    const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * L.gap + (row % 2) * L.gap * 0.5;
    const step = Math.min(row, L.steps - 1);
    return [sx * (L.x + row * L.rowGap), L.rise * (step + 1), off];
  }

  // 계단: 쪽마다 필요한 줄 수만큼
  function buildStands() {
    if (!stands) { stands = new THREE.Group(); root.add(stands); }
    const len = L.perRow * L.gap + 0.8;
    for (const s of [0, 1]) {
      const n = seats.filter((id, i) => id && (i % 2) === s).length;
      const lastIdx = seats.reduce((m, id, i) => (id && i % 2 === s ? i : m), -1);
      const rows = n ? Math.floor(Math.floor(lastIdx / 2) / L.perRow) + 1 : 0;
      for (let r = rowsBuilt[s]; r < rows; r++) {
        const step = Math.min(r, L.steps - 1);
        const h = L.rise * (step + 1);
        const box = new THREE.Mesh(new THREE.BoxGeometry(L.rowGap, h, len), r % 2 ? woodDark : wood);
        box.position.set((s ? 1 : -1) * (L.x + r * L.rowGap), h / 2, 0);
        box.castShadow = box.receiveShadow = true;
        stands.add(box);
      }
      rowsBuilt[s] = Math.max(rowsBuilt[s], rows);
    }
  }

  return {
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
          p = { id: m.id, c, i, lookKey: null, ph: Math.random() * 6 };
          const [x, y, z] = seatPos(i);
          c.group.position.set(x, y, z);
          c.group.rotation.y = (x < 0 ? -1 : 1) * Math.PI / 2; // 탁구대 쪽을 본다
          root.add(c.group);
          people.set(m.id, p);
        }
        const key = JSON.stringify(m.look || {});
        if (key !== p.lookKey) {
          p.lookKey = key;
          applyLook(p.c, m.look || {});
          p.c.setHold(true);
          // 관전자는 그림자를 그리지 않는다 (사람이 많으면 그림자 계산이 화면 그리기의 절반쯤 → 느린 PC 보호)
          p.c.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
        }
        p.c.setTag(m.nick || '관전자', m.id === meId);
        const tag = p.c.group.children.find((o) => o.isSprite);
        if (tag) { tag.scale.set(0.1, 0.0437, 1); tag.position.y = 1.52; tag.material.opacity = m.id === meId ? 1 : 0.85; }
      }
      buildStands();
    },
    get count() { return people.size; },
    // 응원: 그 사람이 폴짝 뛰고 머리 위에 말풍선. 소리 낼 위치를 돌려준다 (없는 사람이면 null)
    cheer(id, kind, now) {
      const p = people.get(id);
      if (!p) return null;
      p.jumpT = now;
      addBubble(p, kind, now);
      const g = p.c.group.position;
      return [g.x, g.y + 1.3, g.z];
    },
    // 자동 반응 (메시지 없이 각자 PC에서): frac만큼의 사람이 뛰고, 그중 bubbleFrac은 말풍선
    react(kind, now, frac = 0.5, bubbleFrac = 0) {
      for (const p of people.values()) {
        if (Math.random() > frac) continue;
        p.jumpT = now + Math.random() * 0.3;
        if (kind && Math.random() < bubbleFrac) addBubble(p, kind, p.jumpT);
      }
    },
    // 관전석 가운데 (함성 소리 위치)
    center() { return people.size ? [0, 1.2, 0] : null; },
    // 매 프레임 (경기 화면에서만 show = true). ball = 공 위치, focus = 몰입 정도(0~1), cam = 카메라 위치
    // 카메라 바로 옆(NEAR m 안)의 관전자는 거의 투명하게: 화면 아래를 머리로 가리지 않게 (관전 '옆에서' 카메라 발아래 줄)
    update(now, dt, show, ball, focus = 0, cam = null) {
      root.visible = show && people.size > 0;
      if (!root.visible) return;
      const base = 1 - DIM * focus;
      const k = 1 - Math.exp(-dt * 4);
      for (const p of people.values()) {
        const c = p.c, g = c.group;
        // 공을 눈으로 따라간다 (가운데와 공 사이를 보게 살짝만)
        const tz = ball ? ball[2] * 0.6 : 0, tx = ball ? ball[0] * 0.6 : 0;
        const want = Math.atan2(-(tx - g.position.x), -(tz - g.position.z));
        let d = want - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * k;
        const ju = p.jumpT != null ? (now - p.jumpT) / JUMP.len : -1;
        c.body.position.y = Math.abs(Math.sin(now * 1.6 + p.ph)) * 0.012 + (ju >= 0 && ju < 1 ? Math.sin(Math.PI * ju) * JUMP.h : 0);
        c.body.rotation.z = Math.sin(now * 0.9 + p.ph) * 0.03;
        c.paddleModel?.userData.tick?.(now, dt);
        c.tickOutfit(now, dt);
        const near = cam && Math.hypot(g.position.x - cam.x, g.position.z - cam.z) < NEAR;
        p.fade = (p.fade ?? 1) + ((near ? 0.12 : 1) - (p.fade ?? 1)) * k * 2;
        const q = Math.round(base * p.fade * 20) / 20; // 너무 자주 재질을 바꾸지 않게
        if (q !== p.op) { p.op = q; c.setOpacity(q, q); }
        const tag = g.children.find((o) => o.isSprite);
        if (tag) tag.visible = q > 0.3 && !(p.bubbleUntil > now);
      }
      // 말풍선: 톡 튀어나와 조금 떠오르다 사라진다
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        const u = (now - b.t0) / BUBBLE.life;
        if (u >= 1 || !people.has(b.p.id)) {
          root.remove(b.s);
          b.s.material.dispose();
          bubbles.splice(i, 1);
          continue;
        }
        // 카메라 바로 옆이라 흐려진 사람의 말풍선은 숨긴다 (화면 한가운데 떠 보여서). 내 응원은 보이게
        const faded = (b.p.op ?? 1) < 0.3, mine = b.p.id === meId;
        b.s.visible = u >= 0 && (!faded || mine);
        if (!b.s.visible) continue;
        const pop = Math.min(1, u * 10);
        const k2 = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
        const g = b.p.c.group.position;
        b.s.position.set(g.x, g.y + BUBBLE.y + u * BUBBLE.rise, g.z);
        b.s.scale.set(BUBBLE.h * 2 * k2, BUBBLE.h * k2, 1);
        b.s.material.opacity = (u > 0.75 ? (1 - u) / 0.25 : 1) * (mine ? 1 : Math.max(0.35, b.p.op ?? 1));
      }
    },
  };
}
