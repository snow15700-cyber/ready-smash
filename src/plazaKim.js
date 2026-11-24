// 김제빵이 뛰어오는 연출 (docs/dev/plaza.md 4장, ⑤): 2대2 탁구대에 3명일 때 방장이 부르면
// 광장 가장자리(빵집 쪽)에서 요리사 모자·앞치마 차림으로 바게트를 들고 뛰어온다 — 뛸 때 밀가루가 폴폴,
// 도착하면 헉헉 + '빵 굽다 왔어요!' → 바게트를 옆에 내려놓고 프라이팬을 든다. 경기가 끝나면 '앗, 빵 타겠다!' 하고 다시 뛰어간다.
// 모든 PC가 방장이 정한 시각(at, bye)으로 같은 모습을 계산해서 그린다 (보기만, 네트워크는 방장 상태 한 줄).
import * as THREE from 'three';
import { applyLook } from './items.js';
import { AI_LOOK, AI_NAME } from './match.js';
import { makeCharacter } from './scene.js';

export const KIM_RUN = 6; // 뛰는 속도 (m/s)
export const KIM_READY_MS = 4500; // 부른 뒤 이만큼 지나면 '준비 완료'로 친다 (뛰어오는 중에 경기가 시작되지 않게)
const SAY_IN = '빵 굽다 왔어요! 🥖', SAY_OUT = '앗, 빵 타겠다! 🔥';
// 방장이 '김제빵 내보내기'를 누르면: '이번엔 ○○을(를) 만들어 볼까나...' (어떤 빵인지는 방장이 정한 번호 b — 모든 PC가 같은 말)
export const BREADS = [
  '소금빵', '명란 소금빵', '초코칩 소금빵', '에멘탈치즈 소금빵', '사워도우', '깜빠뉴', '치아바타', '포카치아',
  '바게트', '명란바게트', '무화과바게트', '솔티바게트', '앙버터', '크루아상', '퀸아망', '크루키', '크로플',
  '블루베리 베이글', '대파 베이글', '쪽파 베이글', '어니언 베이글', '생식빵', '밤식빵', '탕종식빵', '우유식빵',
  '저당빵', '통곡물빵', '호밀빵', '소보로빵', '튀김소보로', '단팥빵', '맘모스빵', '슈크림빵', '모카번',
  '마늘빵', '육쪽마늘빵', '메론빵', '휘낭시에', '마들렌', '까눌레', '에그타르트', '스콘', '생크림도넛', '꽈배기',
  '시나몬롤', '판타롱부추빵', '사라다빵',
];
// 받침이 있으면 '을', 없으면 '를'
const eulReul = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '을' : '를'; };
export const breadLine = (b) => { const w = BREADS[((b % BREADS.length) + BREADS.length) % BREADS.length]; return `이번엔 ${w}${eulReul(w)} 만들어 볼까나... 🥐`; };

function baguette() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.5, 4, 10), new THREE.MeshLambertMaterial({ color: 0xd8963e }));
  g.add(m);
  for (let i = -1; i <= 1; i++) { // 칼집
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), new THREE.MeshLambertMaterial({ color: 0xf3d79a }));
    c.position.set(0.035, i * 0.14, 0); c.rotation.z = 0.5; g.add(c);
  }
  return g;
}
let FLOUR = null;
function flourMat() {
  if (!FLOUR) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    FLOUR = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  return FLOUR;
}

// path(from, to) → 지나갈 점들 (광장 걷기와 같은 꺾어 가기), bubble() → 말풍선
export function createKimRunners(root, { path, bubble, blob }) {
  const runs = new Map(); // key → { c, bag, bub, pts, len, at, bye, ... }
  const puffs = [];
  function make(key, info) {
    const c = makeCharacter('#2f8a4e');
    applyLook(c, AI_LOOK);
    c.group.traverse((o) => { o.castShadow = false; });
    c.setTag(AI_NAME, false, '');
    c.setHold(true);
    const bag = baguette();
    const bub = bubble();
    bub.scale.multiplyScalar(1.4);
    c.group.add(bub);
    c.group.add(blob());
    root.add(c.group);
    root.add(bag);
    const edge = [info.seat[0] < 0 ? -14.6 : 14.6, info.seat[1]];
    const pts = [edge, ...path(edge, info.seat)];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { c, bag, bub, pts, len, said: '', face: info.face };
  }
  // 경로 위 d(m) 지점과 그 방향
  function along(r, d, back) {
    const pts = back ? [...r.pts].reverse() : r.pts;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l || i === pts.length - 1) { const k = l ? Math.min(1, d / l) : 1; return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: [b[0] - a[0], b[1] - a[1]] }; }
      d -= l;
    }
    return { p: pts[pts.length - 1], dir: [0, 1] };
  }
  function drop(key) {
    const r = runs.get(key);
    if (!r) return;
    root.remove(r.c.group); root.remove(r.bag);
    runs.delete(key);
  }
  function say(r, text, now) {
    if (r.said === text) return;
    r.said = text;
    r.bub.draw(text);
    r.bub.visible = true;
    r.bubT = now;
  }
  let lastPuff = 0;
  return {
    // list = [{ key, seat:[x,z], face(yaw), at(ms, 이 PC 시계), bye(ms|null), b(내보낼 때 빵 번호 | null) }]
    sync(list) {
      const keep = new Set(list.map((k) => k.key));
      for (const key of [...runs.keys()]) if (!keep.has(key)) drop(key);
      for (const k of list) { let r = runs.get(k.key); if (!r) { r = make(k.key, k); runs.set(k.key, r); } r.at = k.at; r.bye = k.bye; r.face = k.face; r.out = k.b != null ? breadLine(k.b) : SAY_OUT; }
    },
    get count() { return runs.size; },
    update(nowS, dt) {
      const ms = Date.now();
      for (const [key, r] of runs) {
        const runT = (r.len / KIM_RUN) * 1000;
        const g = r.c.group;
        let mode, d = 0, back = false;
        if (r.bye && ms >= r.bye) {
          const e = ms - r.bye;
          if (e < 1800) mode = 'leaving'; // 말할 시간 (빵 이름이 길어서 조금 더)
          else { mode = 'run'; back = true; d = ((e - 1800) / 1000) * KIM_RUN; if (d >= r.len) { drop(key); continue; } }
        } else if (ms - r.at < runT) { mode = 'run'; d = Math.max(0, ((ms - r.at) / 1000) * KIM_RUN); }
        else mode = 'here';
        const pos = mode === 'run' ? along(r, d, back) : { p: r.pts[r.pts.length - 1], dir: null };
        g.position.set(pos.p[0], 0, pos.p[1]);
        if (pos.dir) g.rotation.y = Math.atan2(-pos.dir[0], -pos.dir[1]);
        else g.rotation.y += (Math.atan2(Math.sin(r.face - g.rotation.y), Math.cos(r.face - g.rotation.y))) * (1 - Math.exp(-dt * 8));
        const since = ms - r.at - runT; // 도착한 뒤 (ms)
        // 몸: 뛸 때 통통, 도착하면 헉헉 (빠르게 숨쉬기)
        if (mode === 'run') { r.c.body.position.y = Math.abs(Math.sin(nowS * 16)) * 0.1; r.c.body.rotation.x = -0.22; }
        else { const pant = mode === 'here' && since < 2500 ? 1 : mode === 'leaving' ? 0.6 : 0; r.c.body.position.y = pant * Math.abs(Math.sin(nowS * 12)) * 0.035; r.c.body.rotation.x = pant * -0.12; }
        // 바게트: 뛸 때·도착 직후엔 손에, 그다음 옆에 내려놓고 프라이팬. 떠날 땐 다시 집어 든다
        const holdBag = mode === 'run' || mode === 'leaving' || since < 1200;
        if (r.c.paddleModel) r.c.paddleModel.visible = !holdBag;
        r.c.handle.visible = r.c.blade.visible = false;
        if (holdBag) {
          const a = new THREE.Vector3(0.3, 1.05, -0.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
          r.bag.position.copy(a); r.bag.position.y += r.c.body.position.y;
          r.bag.rotation.set(0.5, g.rotation.y, mode === 'run' ? 0.9 + Math.sin(nowS * 16) * 0.2 : 0.4);
        } else {
          const side = new THREE.Vector3(-0.55, 0.06, 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
          r.bag.position.copy(side); r.bag.rotation.set(0, g.rotation.y + 0.3, Math.PI / 2);
        }
        // 말
        if (mode === 'here' && since < 2600) say(r, SAY_IN, nowS);
        if (mode === 'leaving' || (back && d < 3)) say(r, r.out || SAY_OUT, nowS);
        if (r.bub.visible && nowS - r.bubT > 3.2) r.bub.visible = false;
        if (mode === 'here') r.c.tickOutfit(nowS, dt);
        // 밀가루 폴폴 (뛸 때)
        if (mode === 'run' && nowS - lastPuff > 0.06) {
          lastPuff = nowS;
          let s = puffs.find((x) => !x.visible);
          if (!s && puffs.length < 60) { s = new THREE.Sprite(flourMat().clone()); root.add(s); puffs.push(s); }
          if (s) { s.visible = true; s.userData.t = nowS; s.position.set(g.position.x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.7, g.position.z + (Math.random() - 0.5) * 0.4); s.scale.setScalar(0.18); }
        }
      }
      for (const s of puffs) {
        if (!s.visible) continue;
        const a = nowS - s.userData.t;
        if (a > 0.9) { s.visible = false; continue; }
        s.position.y += dt * 0.5;
        s.scale.setScalar(0.18 + a * 0.4);
        s.material.opacity = 0.85 * (1 - a / 0.9);
      }
    },
  };
}
