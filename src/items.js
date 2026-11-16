import * as THREE from 'three';
import { OUTFITS, makeOutfit } from './outfits.js';

// 상점 아이템 목록 (기획서 4장). 이름·모양은 여기, 뽑기·구매 규칙은 서버(supabase/06_shop.sql)가 정한다.
// ⚠️ 아이템을 추가·변경하면 06_shop.sql의 pingpong_items 목록(insert)도 똑같이 고쳐야 한다.
//
// pool: 'char' 캐릭터 뽑기(탁구채·머리·몸·궤적) | 'arena' 경기장 뽑기(탁구대·배경·탁구공)
// grade: 'common' 일반 | 'rare' 고급 | 'legend' 전설.  기본 아이템(default)은 처음부터 가지고 있고 팔지 않는다.

export const POOLS = {
  char: { name: '캐릭터 뽑기', icon: '🎽', desc: '탁구채 · 머리 · 몸 · 궤적' },
  arena: { name: '경기장 뽑기', icon: '🏟️', desc: '탁구대 · 배경 · 탁구공' },
};
export const GRADES = {
  common: { name: '일반', rate: 0.7, buy: 500, pieces: 50, dup: 2 },
  rare: { name: '고급', rate: 0.25, buy: 1500, pieces: 150, dup: 6 },
  legend: { name: '전설', rate: 0.05, buy: 5000, pieces: 500, dup: 30 },
};
export const GACHA_PRICE = { 1: 100, 10: 900 };
export const PITY = 40; // 40번 안에 전설이 안 나오면 다음은 무조건 전설

// 카테고리. 순서대로 옷장 탭에 나온다. ready=false는 아직 아이템이 없음(곧 열림)
export const CATS = {
  paddle: { name: '탁구채', pool: 'char', ready: true },
  head: { name: '머리', pool: 'char' },
  body: { name: '몸', pool: 'char', ready: true },
  trail: { name: '궤적', pool: 'char' },
  table: { name: '탁구대', pool: 'arena' },
  bg: { name: '배경', pool: 'arena' },
  ball: { name: '탁구공', pool: 'arena' },
};

// 기본 아이템 (카테고리마다 하나, 장착 안 했을 때 이것)
export const DEFAULTS = { paddle: 'paddle_red', body: 'body_none' };

// model: 모양이 다른 탁구채(아래 PADDLE_MODELS). 없으면 기본 탁구채에 color만 바꾼다
const paddle = (id, name, grade, color, extra = {}) => ({ id, cat: 'paddle', name, grade, color, ...extra });
// sound: 칠 때 나는 소리 종류 (audio.js의 HIT_SKINS). 없으면 기본 타구음
const gag = (id, name, grade, model, sound) => ({ id, cat: 'paddle', name, grade, model, ...(sound ? { sound } : {}) });
export const ITEMS = [
  paddle('paddle_red', '빨강 탁구채', 'default', '#e0333c'),
  paddle('paddle_blue', '파랑 탁구채', 'common', '#2f6fe0'),
  paddle('paddle_green', '초록 탁구채', 'common', '#2fa65a'),
  paddle('paddle_yellow', '노랑 탁구채', 'common', '#f2c230'),
  paddle('paddle_black', '검정 탁구채', 'common', '#2b2a33'),
  paddle('paddle_pink', '분홍 탁구채', 'common', '#ff7fb0'),
  paddle('paddle_gold', '황금 탁구채', 'rare', '#e8b923', { emissive: '#7a5200', glow: 0.6 }),
  paddle('paddle_neon', '네온 탁구채', 'rare', '#3dffa0', { emissive: '#19ff8c', glow: 0.9 }),
  // 무늬 (일반)
  gag('paddle_stripe', '줄무늬 탁구채', 'common', 'stripe'),
  gag('paddle_dots', '물방울 탁구채', 'common', 'dots'),
  gag('paddle_hearts', '하트 탁구채', 'common', 'hearts'),
  gag('paddle_bolt', '번개 탁구채', 'common', 'bolt'),
  // 개그 탁구채 (고급)
  gag('paddle_toast', '식빵', 'rare', 'toast', 'bread'),
  gag('paddle_baguette', '바게트', 'rare', 'baguette', 'bread'),
  gag('paddle_donut', '도넛', 'rare', 'donut', 'bread'),
  gag('paddle_pizza', '피자 한 조각', 'rare', 'pizza', 'bread'),
  gag('paddle_melon', '수박 조각', 'rare', 'melon', 'melon'),
  gag('paddle_waffle', '와플', 'rare', 'waffle', 'bread'),
  gag('paddle_mackerel', '고등어', 'rare', 'mackerel', 'fish'),
  gag('paddle_scoop', '밥주걱', 'rare', 'scoop', 'plastic'),
  gag('paddle_slipper', '삼선 슬리퍼', 'rare', 'slipper', 'plastic'),
  gag('paddle_swatter', '파리채', 'rare', 'swatter', 'plastic'),
  gag('paddle_fan', '태극 부채', 'rare', 'fan', 'plastic'),
  gag('paddle_sponge', '수세미', 'rare', 'sponge', 'sponge'),
  gag('paddle_book', '탁구 교재', 'rare', 'book'),
  gag('paddle_eraser', '칠판지우개', 'rare', 'eraser', 'sponge'),
  gag('paddle_board', '도마', 'rare', 'board'),
  // 전설 7종: 모양을 정성껏 + 전용 타구음
  gag('paddle_pan', '프라이팬', 'legend', 'pan', 'pan'),
  gag('paddle_guitar', '통기타', 'legend', 'guitar', 'guitar'),
  gag('paddle_keyboard', '키보드', 'legend', 'keyboard', 'keyboard'),
  gag('paddle_mouse', '마우스', 'legend', 'mouse', 'mouse'),
  gag('paddle_phone', '스마트폰', 'legend', 'phone', 'phone'),
  gag('paddle_duck', '고무 오리', 'legend', 'duck', 'duck'),
  gag('paddle_hammer', '뿅망치', 'legend', 'hammer', 'hammer'),
  // 몸 (한 벌씩 통째로, 모양은 outfits.js). 기본 = 흰 몸
  { id: 'body_none', cat: 'body', name: '기본 (흰 몸)', grade: 'default' },
  ...OUTFITS.map((o) => ({ id: 'body_' + o.id, cat: 'body', name: o.name, grade: o.grade, outfit: o.id })),
];
for (const it of ITEMS) it.pool = CATS[it.cat].pool;
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

// 장착 정보(equip = { paddle: 'paddle_blue', ... })에서 카테고리의 아이템
export const equipped = (equip, cat) => ITEM[equip?.[cat]] || ITEM[DEFAULTS[cat]];

// 캐릭터에 꾸미기 적용 (scene.js의 makeCharacter). 매 프레임 불려도 바뀐 게 없으면 아무것도 안 한다
export function applyLook(char, equip) {
  const b = equipped(equip, 'body');
  if (char.userData?.body !== b.id) {
    char.userData = { ...char.userData, body: b.id };
    char.setOutfit(b.outfit ? makeOutfit(b.outfit, char) : null);
  }
  const p = equipped(equip, 'paddle');
  if (char.userData?.paddle === p.id) return;
  char.userData = { ...char.userData, paddle: p.id };
  char.sound = p.sound || null; // 칠 때 소리 (game.js → audio.playHit)
  if (p.model) char.setPaddleModel(makePaddle(p));
  else {
    char.setPaddleModel(null);
    char.setPaddle({ color: p.color, emissive: p.emissive || '#000000', glow: p.glow || 0 });
  }
}

/* ───────────── 탁구채 모양 ─────────────
   좌표: 기본 탁구채 판 가운데 = (0,0,0). 판의 면은 ±z (+z = 내 쪽, 카메라가 보는 면), 손잡이는 아래(-y).
   기본 판 반지름 0.078m. 맞는 범위는 모양과 상관없이 같다(보기만 다름). */
const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });
function mesh(geo, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 모양(Shape)을 두께 depth로 뽑아 가운데를 z=0에 둔다. mats = [면, 옆]
function extrude(shape, depth, mats, bevel = 0.003) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mats);
}
// 모양 면에 그림을 붙일 때: 뽑은 모양의 UV는 미터 단위 좌표라서, size(m) 크기 칸에 그림 한 장이 오게 맞춘다
function shapeTex(size, cx, cy, draw, px = 256) {
  const t = canvasTex(px, px, draw);
  t.repeat.set(1 / size, 1 / size);
  t.offset.set(0.5 - cx / size, 0.5 - cy / size);
  return t;
}
const BLADE_R = 0.078;
// 기본 탁구채 모양에 앞면(+z)만 그림
function rubber(draw, side) {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.025, 0.1, 0.02), lam('#c99560'), 0, -0.1, 0, g);
  const t = canvasTex(256, 256, draw);
  const blade = mesh(new THREE.CylinderGeometry(BLADE_R, BLADE_R, 0.012, 32), [lam(side), lam('#ffffff', { map: t }), lam('#222')], 0, 0, 0, g);
  blade.rotation.x = Math.PI / 2;
  return g;
}
function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * 0.4);
  c.bezierCurveTo(x - s * 1.15, y - s * 0.3, x - s * 0.5, y - s * 1.05, x, y - s * 0.42);
  c.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.15, y - s * 0.3, x, y + s * 0.4);
  c.fill();
}
function heartShape(k) {
  const s = new THREE.Shape();
  s.moveTo(0, -k * 0.95);
  s.bezierCurveTo(-k * 1.25, -k * 0.1, -k * 0.75, k * 0.95, 0, k * 0.4);
  s.bezierCurveTo(k * 0.75, k * 0.95, k * 1.25, -k * 0.1, 0, -k * 0.95);
  return s;
}
function roundRect(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
// 양면에 같은 장식 붙이기 (z = 면 위치)
function bothSides(fn) { fn(1); fn(-1); }

const PADDLE_MODELS = {
  // ── 무늬 ──
  stripe: () => rubber((c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2bb7a6';
    c.save(); c.translate(w / 2, h / 2); c.rotate(-0.6);
    for (let x = -w; x < w; x += 44) c.fillRect(x, -h, 22, h * 2);
    c.restore();
  }, '#2bb7a6'),
  dots: () => rubber((c, w, h) => {
    c.fillStyle = '#ff7eb6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.beginPath(); c.arc(x * 34 + (y % 2) * 17 + 8, y * 34 + 12, 8, 0, Math.PI * 2); c.fill(); }
  }, '#ff7eb6'),
  hearts: () => rubber((c, w, h) => {
    c.fillStyle = '#ffd1e0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ef3f6a';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) heartPath(c, x * 46 + (y % 2) * 23 + 12, y * 46 + 26, 14);
  }, '#ef3f6a'),
  bolt: () => rubber((c, w, h) => {
    c.fillStyle = '#25305a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffd23d';
    c.beginPath();
    c.moveTo(150, 18); c.lineTo(78, 140); c.lineTo(126, 140); c.lineTo(100, 238); c.lineTo(182, 104); c.lineTo(134, 104); c.closePath();
    c.fill();
  }, '#25305a'),

  // ── 음식 ──
  toast() {
    const g = new THREE.Group();
    const shape = (k) => {
      const s = new THREE.Shape();
      s.moveTo(-0.065 * k, -0.075 * k); s.lineTo(0.065 * k, -0.075 * k); s.lineTo(0.065 * k, 0.025 * k);
      s.bezierCurveTo(0.1 * k, 0.04 * k, 0.095 * k, 0.1 * k, 0, 0.093 * k);
      s.bezierCurveTo(-0.095 * k, 0.1 * k, -0.1 * k, 0.04 * k, -0.065 * k, 0.025 * k);
      s.closePath();
      return s;
    };
    const crust = extrude(shape(1), 0.014, [lam('#b8732e'), lam('#a8652a')]);
    const inner = extrude(shape(0.84), 0.017, [lam('#f6deae'), lam('#f6deae')]);
    inner.position.y = 0.004;
    g.add(crust, inner);
    // 버터 한 조각
    mesh(new THREE.BoxGeometry(0.03, 0.022, 0.008), lam('#ffe27a'), 0.01, 0.0, 0.012, g).rotation.z = 0.3;
    return g;
  },
  baguette() {
    const g = new THREE.Group();
    const b = mesh(new THREE.CapsuleGeometry(0.03, 0.24, 8, 16), lam('#d9973f'), 0, 0, 0, g);
    b.scale.z = 0.8;
    bothSides((d) => {
      for (let i = 0; i < 4; i++) {
        const cut = mesh(new THREE.SphereGeometry(0.02, 12, 8), lam('#f4d495'), 0, -0.09 + i * 0.06, d * 0.021, g);
        cut.scale.set(0.45, 1.1, 0.25);
        cut.rotation.z = -0.5;
      }
    });
    g.rotation.z = -0.25;
    g.position.y = -0.02;
    return g;
  },
  donut() {
    const g = new THREE.Group();
    const t = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#e0a35a'; c.fillRect(0, 0, w, h);
      // 위쪽 반(내 쪽 면)에 분홍 아이싱 + 스프링클. 캔버스 아래 = 관 둘레 0~0.5
      c.fillStyle = '#ff8fc0';
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.42 + Math.sin(x * 0.2) * 6);
      c.lineTo(w, h); c.fill();
      const cols = ['#ffffff', '#ffd23d', '#5fd0ff', '#7cf07c', '#a070ff'];
      const r = rng(7);
      for (let i = 0; i < 70; i++) {
        c.save(); c.translate(r() * w, h * 0.55 + r() * h * 0.4); c.rotate(r() * 3);
        c.fillStyle = cols[i % cols.length]; c.fillRect(-4, -1.5, 8, 3); c.restore();
      }
    });
    mesh(new THREE.TorusGeometry(0.058, 0.03, 18, 36), lam('#ffffff', { map: t }), 0, 0, 0, g);
    // 뒷면도 아이싱
    const back = mesh(new THREE.TorusGeometry(0.058, 0.03, 18, 36), lam('#ffffff', { map: t }), 0, 0, 0, g);
    back.rotation.y = Math.PI;
    back.scale.setScalar(0.999);
    return g;
  },
  pizza() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, -0.105); s.lineTo(0.08, 0.06); s.quadraticCurveTo(0, 0.085, -0.08, 0.06); s.closePath();
    g.add(extrude(s, 0.012, [lam('#ffcf4a'), lam('#f0b23a')]));
    const crust = mesh(new THREE.CapsuleGeometry(0.016, 0.15, 6, 12), lam('#c8843a'), 0, 0.068, 0, g);
    crust.rotation.z = Math.PI / 2;
    const pep = [[0, 0.03], [-0.03, -0.005], [0.028, -0.002], [0.002, -0.05]];
    bothSides((d) => {
      for (const [x, y] of pep) mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 16), lam('#c8332e'), x, y, d * 0.009, g).rotation.x = Math.PI / 2;
      for (const [x, y] of [[-0.015, 0.045], [0.035, 0.03], [-0.01, -0.03]]) mesh(new THREE.BoxGeometry(0.012, 0.006, 0.004), lam('#3f9a3f'), x, y, d * 0.009, g).rotation.z = x * 30;
    });
    g.position.y = 0.01;
    return g;
  },
  melon() {
    const g = new THREE.Group();
    const R = 0.15, A = 0.55, cy = 0.085; // 위쪽 꼭짓점에서 아래로 퍼지는 부채꼴
    const sector = (r) => {
      const s = new THREE.Shape();
      s.moveTo(0, cy);
      s.lineTo(Math.cos(-Math.PI / 2 - A) * r, cy + Math.sin(-Math.PI / 2 - A) * r);
      s.absarc(0, cy, r, -Math.PI / 2 - A, -Math.PI / 2 + A, false);
      s.closePath();
      return s;
    };
    g.add(extrude(sector(R), 0.016, [lam('#2f8a3a'), lam('#2f8a3a')], 0.002));
    const light = extrude(sector(R - 0.013), 0.018, [lam('#d9f2b0'), lam('#d9f2b0')], 0.002);
    const red = extrude(sector(R - 0.022), 0.02, [lam('#ff4d5e'), lam('#ff4d5e')], 0.002);
    g.add(light, red);
    const r = rng(4);
    bothSides((d) => {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * A * 1.4, dist = 0.04 + r() * 0.07;
        const seed = mesh(new THREE.SphereGeometry(0.006, 8, 6), lam('#2b1d1d'), Math.cos(a) * dist, cy + Math.sin(a) * dist, d * 0.012, g);
        seed.scale.set(0.6, 1, 0.4);
        seed.rotation.z = a + Math.PI / 2;
      }
    });
    return g;
  },
  waffle() {
    const g = new THREE.Group();
    const t = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#e8a94e'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        c.fillStyle = '#c47f2c'; c.fillRect(18 + x * 46, 18 + y * 46, 34, 34);
        c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(18 + x * 46, 18 + y * 46, 34, 6);
      }
    });
    const side = lam('#d9963f'), face = lam('#ffffff', { map: t });
    const b = mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), [side, side, side, side, face, face], 0, 0, 0, g);
    b.rotation.z = Math.PI / 4;
    // 버터 + 시럽
    mesh(new THREE.BoxGeometry(0.035, 0.035, 0.014), lam('#ffe27a'), 0, 0.01, 0.015, g).rotation.z = 0.4;
    const syrup = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.003, 20), lam('#a4561c'), -0.005, -0.012, 0.0115, g);
    syrup.rotation.x = Math.PI / 2;
    syrup.scale.set(1.3, 1, 0.8);
    return g;
  },
  mackerel() {
    const g = new THREE.Group();
    // 몸통: 등(+x)은 푸른 줄무늬, 배(-x)는 은색. 꼬리를 아래로 잡는다
    const t = canvasTex(256, 128, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, w / 2, 0);
      grd.addColorStop(0, '#e6eef2'); grd.addColorStop(0.55, '#b9cbd6'); grd.addColorStop(0.8, '#3f7395'); grd.addColorStop(1, '#2b5878');
      c.fillStyle = grd; c.fillRect(0, 0, w / 2, h);
      c.save(); c.translate(w, 0); c.scale(-1, 1); c.fillStyle = grd; c.fillRect(0, 0, w / 2, h); c.restore();
      c.strokeStyle = '#173a52'; c.lineWidth = 4;
      for (let y = 6; y < h; y += 11) {
        c.beginPath();
        for (let x = w * 0.36; x <= w * 0.64; x += 4) c.lineTo(x, y + Math.sin(x * 0.25) * 4);
        c.stroke();
      }
    });
    const body = mesh(new THREE.SphereGeometry(1, 28, 18), lam('#ffffff', { map: t }), 0, 0.02, 0, g);
    body.scale.set(0.045, 0.11, 0.02);
    // 눈
    bothSides((d) => {
      mesh(new THREE.SphereGeometry(0.009, 10, 8), lam('#ffffff'), 0.003, 0.1, d * 0.012, g).scale.z = 0.5;
      mesh(new THREE.SphereGeometry(0.005, 8, 6), lam('#111111'), 0.004, 0.1, d * 0.015, g).scale.z = 0.5;
    });
    // 꼬리
    const tailMat = lam('#2b5878');
    for (const d of [-1, 1]) {
      const fin = mesh(new THREE.ConeGeometry(0.022, 0.06, 3), tailMat, d * 0.016, -0.115, 0, g);
      fin.rotation.z = Math.PI - d * 0.5;
      fin.scale.z = 0.3;
    }
    mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.03, 10), tailMat, 0, -0.09, 0, g).scale.z = 0.6;
    // 지느러미
    const top = mesh(new THREE.ConeGeometry(0.015, 0.04, 3), tailMat, 0.045, 0.0, 0, g);
    top.rotation.z = -Math.PI / 2 - 0.4; top.scale.z = 0.3;
    return g;
  },

  // ── 부엌·생활 ──
  scoop() {
    const g = new THREE.Group();
    const cream = lam('#f4f0e2');
    const head = mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.01, 32), cream, 0, 0.01, 0, g);
    head.rotation.x = Math.PI / 2;
    head.scale.set(1, 1, 1.22);
    mesh(new THREE.BoxGeometry(0.026, 0.14, 0.012), cream, 0, -0.11, 0, g);
    // 붙은 밥알
    const r = rng(11);
    bothSides((d) => {
      for (let i = 0; i < 9; i++) {
        const rice = mesh(new THREE.SphereGeometry(0.006, 8, 6), lam('#ffffff'), (r() - 0.5) * 0.07, 0.01 + (r() - 0.3) * 0.08, d * 0.006, g);
        rice.scale.set(0.6, 1, 0.6);
        rice.rotation.z = r() * 3;
      }
    });
    return g;
  },
  slipper() {
    const g = new THREE.Group();
    const s = new THREE.Shape(); // 발 모양 (발가락이 위)
    s.moveTo(0, -0.11);
    s.bezierCurveTo(0.045, -0.11, 0.042, -0.03, 0.045, 0.03);
    s.bezierCurveTo(0.05, 0.1, 0.03, 0.12, 0, 0.12);
    s.bezierCurveTo(-0.03, 0.12, -0.05, 0.1, -0.045, 0.03);
    s.bezierCurveTo(-0.042, -0.03, -0.045, -0.11, 0, -0.11);
    const sole = extrude(s, 0.016, [lam('#3a3f4a'), lam('#2d3139')], 0.003);
    g.add(sole);
    const bed = extrude(s, 0.004, [lam('#7d8696'), lam('#7d8696')], 0);
    bed.position.z = 0.009;
    bed.scale.set(0.9, 0.95, 1);
    g.add(bed);
    // 삼선 끈
    const t = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#2f62c9'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      for (const x of [0.28, 0.5, 0.72]) c.fillRect(w * x - 12, 0, 24, h);
    });
    const strap = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 24, 1, true, -Math.PI / 2, Math.PI), lam('#ffffff', { map: t, side: THREE.DoubleSide }), 0, 0.05, 0.008, g);
    strap.rotation.x = Math.PI / 2;
    strap.rotation.y = Math.PI / 2;
    strap.scale.set(1, 1, 0.55);
    return g;
  },
  swatter() {
    const g = new THREE.Group();
    const t = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#3fbf5f'; c.lineWidth = 7;
      for (let i = 0; i <= 12; i++) { const p = 10 + i * 19.6; c.beginPath(); c.moveTo(p, 6); c.lineTo(p, h - 6); c.stroke(); c.beginPath(); c.moveTo(6, p); c.lineTo(w - 6, p); c.stroke(); }
      c.lineWidth = 18; c.strokeRect(9, 9, w - 18, h - 18);
    });
    mesh(new THREE.PlaneGeometry(0.15, 0.15), lam('#ffffff', { map: t, alphaTest: 0.5, side: THREE.DoubleSide }), 0, 0.02, 0, g);
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), lam('#3fbf5f'), 0, -0.155, 0, g);
    mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 10), lam('#e2f7e6'), 0, -0.235, 0, g);
    return g;
  },
  fan() {
    const g = new THREE.Group();
    const t = canvasTex(256, 256, (c, w, h) => {
      const R = w / 2;
      c.translate(R, R);
      c.fillStyle = '#f7f1e3'; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
      const r = R * 0.62;
      // 태극: 위 빨강, 아래 파랑
      c.fillStyle = '#d62e3a'; c.beginPath(); c.arc(0, 0, r, Math.PI, 0); c.fill();
      c.fillStyle = '#2350a8'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI); c.fill();
      c.fillStyle = '#d62e3a'; c.beginPath(); c.arc(r / 2, 0, r / 2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2350a8'; c.beginPath(); c.arc(-r / 2, 0, r / 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(160,120,70,0.35)'; c.lineWidth = 3;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke(); }
    });
    const face = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.005, 40), [lam('#6b4426'), lam('#ffffff', { map: t }), lam('#ffffff', { map: t })], 0, 0.02, 0, g);
    face.rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.085, 0.004, 6, 40), lam('#6b4426'), 0, 0.02, 0, g);
    mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.13, 10), lam('#b8894a'), 0, -0.12, 0, g);
    mesh(new THREE.SphereGeometry(0.01, 10, 8), lam('#d62e3a'), 0, -0.19, 0, g);
    return g;
  },
  sponge() {
    const g = new THREE.Group();
    const sp = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#ffd84a'; c.fillRect(0, 0, w, h);
      const r = rng(3);
      c.fillStyle = '#e8b81c';
      for (let i = 0; i < 90; i++) { c.beginPath(); c.arc(r() * w, r() * h, 1.5 + r() * 3, 0, Math.PI * 2); c.fill(); }
    });
    const yellow = lam('#ffffff', { map: sp });
    mesh(new THREE.BoxGeometry(0.11, 0.15, 0.03), yellow, 0, 0, -0.006, g);
    mesh(new THREE.BoxGeometry(0.11, 0.15, 0.012), lam('#2f9a4a'), 0, 0, 0.015, g);
    // 거품
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const b = mesh(new THREE.SphereGeometry(0.008 + r() * 0.012, 12, 8), lam('#ffffff', { emissive: '#bfe8ff', emissiveIntensity: 0.35 }), (r() - 0.5) * 0.12, 0.05 + r() * 0.04, (r() - 0.5) * 0.03, g);
      b.scale.z = 0.8;
    }
    return g;
  },

  // ── 교실 ──
  book() {
    const g = new THREE.Group();
    const cover = canvasTex(256, 320, (c, w, h) => {
      c.fillStyle = '#2f62c9'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd23d'; c.fillRect(0, 34, w, 10); c.fillRect(0, h - 44, w, 10);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 58px Jua, sans-serif';
      c.fillText('탁구', w / 2, 100); c.fillText('교재', w / 2, 165);
      c.fillStyle = '#e0333c'; c.beginPath(); c.arc(w / 2 - 14, 240, 26, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2 + 34, 228, 10, 0, Math.PI * 2); c.fill();
    });
    const pages = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#fbf6e8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9d0b8';
      for (let y = 2; y < h; y += 4) c.fillRect(0, y, w, 1);
    });
    const pg = lam('#ffffff', { map: pages }), spine = lam('#244c9e');
    mesh(new THREE.BoxGeometry(0.135, 0.17, 0.03), [pg, spine, pg, pg, lam('#ffffff', { map: cover }), spine], 0, 0, 0, g);
    return g;
  },
  eraser() {
    const g = new THREE.Group();
    const felt = canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = '#5b6170'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#4a4f5c';
      for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 4, h);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      const r = rng(8);
      for (let i = 0; i < 25; i++) { c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 5, 0, Math.PI * 2); c.fill(); }
    });
    const top = canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = '#3b6fd0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.font = 'bold 22px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('지우개', w / 2, h / 2);
    });
    const blue = lam('#3b6fd0');
    mesh(new THREE.BoxGeometry(0.16, 0.07, 0.03), [blue, blue, blue, blue, lam('#ffffff', { map: top }), blue], 0, 0, 0.006, g);
    const f = lam('#ffffff', { map: felt });
    mesh(new THREE.BoxGeometry(0.16, 0.07, 0.016), [f, f, f, f, f, f], 0, 0, -0.016, g);
    return g;
  },

  // ── 기타 ──
  board() {
    const g = new THREE.Group();
    const s = roundRect(0.14, 0.18, 0.02, 0, 0.02);
    // 손잡이 쪽 (아래로 좁게) + 걸이 구멍
    const tab = new THREE.Shape();
    tab.moveTo(-0.03, -0.075); tab.lineTo(0.03, -0.075); tab.lineTo(0.03, -0.13);
    tab.quadraticCurveTo(0.03, -0.15, 0, -0.15); tab.quadraticCurveTo(-0.03, -0.15, -0.03, -0.13); tab.closePath();
    const hole = new THREE.Path(); hole.absarc(0, -0.125, 0.01, 0, Math.PI * 2, true);
    tab.holes.push(hole);
    const grain = shapeTex(0.2, 0, 0, (c, w, h) => {
      c.fillStyle = '#dcae70'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(150,100,50,0.35)'; c.lineWidth = 3;
      for (let x = 10; x < w; x += 22) { c.beginPath(); for (let y = 0; y <= h; y += 8) c.lineTo(x + Math.sin(y * 0.05 + x) * 5, y); c.stroke(); }
    });
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    const face = lam('#ffffff', { map: grain }), side = lam('#c4935a');
    g.add(extrude(s, 0.016, [face, side], 0.003), extrude(tab, 0.016, [face, side], 0.003));
    // 오이 몇 조각
    for (const [x, y] of [[-0.03, 0.05], [0.02, 0.065], [0.035, 0.015]]) {
      const cu = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 20), [lam('#3f8f3a'), lam('#cfeeb0'), lam('#cfeeb0')], x, y, 0.013, g);
      cu.rotation.x = Math.PI / 2;
    }
    g.position.y = 0.02;
    return g;
  },
  // ── 전설 ──
  pan() {
    const g = new THREE.Group();
    const pan = new THREE.Group();
    pan.rotation.x = Math.PI / 2; // 팬 안쪽이 내 쪽(+z)
    pan.position.y = 0.01;
    g.add(pan);
    const iron = lam('#2a2a30'), inside = lam('#3d3d45');
    mesh(new THREE.CylinderGeometry(0.098, 0.084, 0.026, 40, 1, true), lam('#2a2a30', { side: THREE.DoubleSide }), 0, 0, 0, pan);
    mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.006, 40), [iron, inside, lam('#1c1c21')], 0, -0.011, 0, pan);
    mesh(new THREE.TorusGeometry(0.098, 0.0045, 8, 48), lam('#4a4a52'), 0, 0.013, 0, pan).rotation.x = Math.PI / 2;
    // 달걀 프라이 (안쪽)
    const egg = new THREE.Shape();
    const r = rng(2);
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2, rr = 0.052 + (i % 24 ? (r() - 0.5) * 0.014 : 0) + Math.sin(a * 3) * 0.006;
      if (i === 0) egg.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else egg.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const white = extrude(egg, 0.004, [lam('#fffdf6'), lam('#f1ebdc')], 0.002);
    white.position.set(-0.008, 0.012, 0.0);
    g.add(white);
    const yolk = mesh(new THREE.SphereGeometry(0.022, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lam('#ffb21f', { emissive: '#ff8a00', emissiveIntensity: 0.15 }), -0.004, 0.018, 0.003, g);
    yolk.rotation.x = Math.PI / 2;
    yolk.scale.y = 0.55;
    mesh(new THREE.SphereGeometry(0.005, 8, 6), lam('#fff4c8'), -0.011, 0.025, 0.014, g);
    // 손잡이: 쇠 목 + 나무 손잡이 + 걸이 구멍
    mesh(new THREE.BoxGeometry(0.02, 0.07, 0.012), lam('#3a3a42'), 0, -0.115, 0, g);
    for (const x of [-0.006, 0.006]) mesh(new THREE.SphereGeometry(0.0035, 8, 6), lam('#8a8a92'), x, -0.088, 0.007, g);
    const wood = new THREE.Shape();
    wood.moveTo(-0.014, -0.15); wood.lineTo(0.014, -0.15); wood.lineTo(0.016, -0.25);
    wood.quadraticCurveTo(0.016, -0.265, 0, -0.265); wood.quadraticCurveTo(-0.016, -0.265, -0.016, -0.25); wood.closePath();
    const hole = new THREE.Path(); hole.absarc(0, -0.245, 0.0055, 0, Math.PI * 2, true);
    wood.holes.push(hole);
    g.add(extrude(wood, 0.014, [lam('#8a5a32'), lam('#734a28')], 0.003));
    return g;
  },
  guitar() {
    const g = new THREE.Group();
    // 몸통 (위쪽) — 아래가 큰 8자 모양, 목은 아래로
    const body = new THREE.Shape(); // 목 쪽(아래)이 작고 위가 큰 8자
    const Y = (y) => 0.13 - y;
    body.moveTo(0, Y(-0.02));
    body.bezierCurveTo(-0.05, Y(-0.02), -0.072, Y(0.01), -0.068, Y(0.045));
    body.bezierCurveTo(-0.064, Y(0.07), -0.04, Y(0.075), -0.042, Y(0.095));
    body.bezierCurveTo(-0.046, Y(0.13), -0.03, Y(0.15), 0, Y(0.15));
    body.bezierCurveTo(0.03, Y(0.15), 0.046, Y(0.13), 0.042, Y(0.095));
    body.bezierCurveTo(0.04, Y(0.075), 0.064, Y(0.07), 0.068, Y(0.045));
    body.bezierCurveTo(0.072, Y(0.01), 0.05, Y(-0.02), 0, Y(-0.02));
    const topTex = shapeTex(0.2, 0, 0.065, (c, w, h) => {
      const grd = c.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.45, w * 0.55);
      grd.addColorStop(0, '#f6cf8c'); grd.addColorStop(0.7, '#e3a456'); grd.addColorStop(1, '#a8622a');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(150,90,40,0.18)'; c.lineWidth = 2;
      for (let x = 0; x < w; x += 9) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, h); c.stroke(); }
    });
    const gb = new THREE.Group();
    gb.position.y = -0.06;
    g.add(gb);
    const shell = extrude(body, 0.03, [lam('#ffffff', { map: topTex }), lam('#6b3f1d')], 0.004);
    gb.add(shell);
    // 사운드홀 + 장식 고리 + 브리지 (앞면)
    mesh(new THREE.CircleGeometry(0.017, 28), lam('#24160c'), 0, 0.04, 0.0191, gb);
    mesh(new THREE.TorusGeometry(0.021, 0.002, 6, 32), lam('#3a2414'), 0, 0.04, 0.019, gb);
    mesh(new THREE.BoxGeometry(0.036, 0.008, 0.004), lam('#3a2414'), 0, 0.11, 0.02, gb);
    // 목 (아래로) + 프렛 + 헤드
    const neckMat = lam('#5a3418');
    mesh(new THREE.BoxGeometry(0.02, 0.15, 0.012), neckMat, 0, -0.095, 0.004, gb);
    for (let i = 0; i < 7; i++) mesh(new THREE.BoxGeometry(0.02, 0.0018, 0.002), lam('#d8d4c8'), 0, -0.03 - i * 0.018, 0.0105, gb);
    mesh(new THREE.BoxGeometry(0.028, 0.045, 0.01), lam('#3a2414'), 0, -0.19, 0.003, gb);
    for (const x of [-1, 1]) for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.012, 8), lam('#e8e2d0'), x * 0.019, -0.178 - i * 0.012, 0.003, gb).rotation.z = Math.PI / 2;
    // 줄 6개
    const str = lam('#f2efe6', { emissive: '#ffffff', emissiveIntensity: 0.15 });
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.0028;
      mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.155, 4), str, x, -0.0975, 0.0115, gb); // 목 위
      mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.13, 4), str, x, 0.045, 0.0212, gb); // 몸통 위
    }
    return g;
  },
  keyboard() {
    const g = new THREE.Group();
    mesh(new THREE.BoxGeometry(0.105, 0.205, 0.016), lam('#3a3d48'), 0, 0, 0, g);
    // 파스텔 무지개 키캡 (줄마다 색)
    const rows = ['#ffb3ba', '#ffd8a8', '#fff1a8', '#c8f2b0', '#b0e6f2', '#b8c4ff', '#dcc0ff'];
    const kw = 0.0205, gap = 0.0045;
    rows.forEach((col, r) => {
      const y = 0.083 - r * (kw + gap);
      const m = lam(col);
      for (let k = 0; k < 4; k++) {
        const key = mesh(new THREE.BoxGeometry(kw, kw, 0.008), m, -0.0375 + k * (kw + gap), y, 0.011, g);
        mesh(new THREE.BoxGeometry(kw * 0.78, kw * 0.78, 0.003), lam(col, { emissive: '#ffffff', emissiveIntensity: 0.12 }), 0, 0, 0.005, key);
      }
    });
    // 스페이스바 + 빨간 엔터
    mesh(new THREE.BoxGeometry(0.07, kw, 0.008), lam('#f4f1ea'), -0.0125, -0.0845, 0.011, g);
    mesh(new THREE.BoxGeometry(kw, kw, 0.008), lam('#ff5a6a'), 0.0375, -0.0845, 0.011, g);
    // 케이블 (아래로)
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0.012, -0.14, 0), new THREE.Vector3(-0.01, -0.18, 0), new THREE.Vector3(0.004, -0.22, 0)]);
    mesh(new THREE.TubeGeometry(curve, 24, 0.004, 8), lam('#2b2a33'), 0, 0, 0, g);
    return g;
  },
  mouse() {
    const g = new THREE.Group();
    // 몸통: 위(+z)가 볼록한 둥근 마우스, 앞쪽(버튼)이 아래를 본다
    const shell = mesh(new THREE.SphereGeometry(1, 32, 20), lam('#f6f4fb'), 0, 0.01, 0, g);
    shell.scale.set(0.055, 0.088, 0.032);
    // 버튼 가르는 선 + 휠
    mesh(new THREE.BoxGeometry(0.0022, 0.05, 0.004), lam('#b9b4c8'), 0, -0.045, 0.024, g).rotation.x = -0.35;
    mesh(new THREE.BoxGeometry(0.07, 0.0022, 0.004), lam('#b9b4c8'), 0, -0.02, 0.0285, g);
    const wheel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.007, 16), lam('#7a6cff', { emissive: '#7a6cff', emissiveIntensity: 0.35 }), 0, -0.048, 0.026, g);
    wheel.rotation.z = Math.PI / 2;
    // 뒤쪽 불빛
    const led = mesh(new THREE.TorusGeometry(0.02, 0.002, 6, 24, Math.PI), lam('#7a6cff', { emissive: '#7a6cff', emissiveIntensity: 0.8 }), 0, 0.06, 0.018, g);
    led.rotation.x = -0.6;
    // 꼬불꼬불 선 (손잡이처럼 아래로)
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(Math.sin(i * 1.3) * 0.012, -0.075 - i * 0.013, Math.cos(i * 1.3) * 0.006));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0035, 8), lam('#d9d4e8'), 0, 0, 0, g);
    return g;
  },
  phone() {
    const g = new THREE.Group();
    const frame = roundRect(0.086, 0.172, 0.014);
    g.add(extrude(frame, 0.009, [lam('#c9b8ff'), lam('#a996e6')], 0.002));
    const screen = canvasTex(256, 512, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#ffd1e8'); grd.addColorStop(0.5, '#c9e4ff'); grd.addColorStop(1, '#d6ffe8');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.beginPath(); c.roundRect(w / 2 - 40, 14, 80, 22, 11); c.fill();
      c.fillStyle = '#3b3550'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 22px Jua, sans-serif'; c.fillText('17:00', 34, 25);
      c.font = 'bold 64px Jua, sans-serif'; c.fillText('스매시!', w / 2, 120);
      // 탁구채 + 공 그림
      c.fillStyle = '#e0333c'; c.beginPath(); c.arc(w / 2 - 10, 215, 42, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c99560'; c.fillRect(w / 2 - 22, 248, 22, 44);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2 + 52, 190, 13, 0, Math.PI * 2); c.fill();
      // 앱 아이콘
      const cols = ['#ff8fa3', '#ffc36b', '#7fd88a', '#6cc4ff', '#a98bff', '#ff9ad5', '#5fe0c8', '#ffd84a'];
      for (let i = 0; i < 8; i++) {
        c.fillStyle = cols[i];
        c.beginPath(); c.roundRect(28 + (i % 4) * 54, 340 + Math.floor(i / 4) * 64, 42, 42, 11); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.roundRect(w / 2 - 50, h - 22, 100, 7, 4); c.fill();
    });
    mesh(new THREE.PlaneGeometry(0.078, 0.162), new THREE.MeshBasicMaterial({ map: screen }), 0, 0, 0.0071, g);
    // 뒷면 카메라
    const cam = new THREE.Group();
    cam.position.set(-0.022, 0.06, -0.0075);
    g.add(cam);
    mesh(new THREE.BoxGeometry(0.03, 0.034, 0.004), lam('#b3a2ef'), 0, 0, 0, cam);
    for (const [x, y] of [[-0.007, 0.008], [-0.007, -0.008], [0.008, 0]]) {
      const l = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 16), [lam('#2b2a33'), lam('#2b2a33'), lam('#151520')], x, y, -0.003, cam);
      l.rotation.x = Math.PI / 2;
    }
    return g;
  },
  duck() {
    const g = new THREE.Group();
    const yellow = lam('#ffd23d'), deep = lam('#f5b800');
    const body = mesh(new THREE.SphereGeometry(1, 28, 20), yellow, -0.008, -0.02, 0, g);
    body.scale.set(0.075, 0.05, 0.052);
    mesh(new THREE.SphereGeometry(0.04, 24, 18), yellow, 0.035, 0.045, 0, g);
    // 꼬리 (뒤로 살짝 올라감)
    const tail = mesh(new THREE.ConeGeometry(0.022, 0.04, 16), yellow, -0.078, 0.008, 0, g);
    tail.rotation.z = 0.9;
    // 부리
    const beak = mesh(new THREE.SphereGeometry(1, 18, 12), lam('#ff8a1f'), 0.077, 0.036, 0, g);
    beak.scale.set(0.022, 0.009, 0.019);
    const beak2 = mesh(new THREE.SphereGeometry(1, 18, 12), lam('#f2741a'), 0.072, 0.028, 0, g);
    beak2.scale.set(0.017, 0.006, 0.015);
    bothSides((d) => {
      // 눈 + 반짝
      mesh(new THREE.SphereGeometry(0.0075, 12, 10), lam('#1b1b22'), 0.05, 0.058, d * 0.03, g);
      mesh(new THREE.SphereGeometry(0.0025, 8, 6), lam('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), 0.053, 0.061, d * 0.0365, g);
      // 볼터치
      const blush = mesh(new THREE.SphereGeometry(0.008, 10, 8), lam('#ff9a8a'), 0.058, 0.04, d * 0.031, g);
      blush.scale.set(1, 0.6, 0.4);
      // 날개
      const wing = mesh(new THREE.SphereGeometry(1, 18, 12), deep, -0.015, -0.015, d * 0.045, g);
      wing.scale.set(0.035, 0.022, 0.012);
      wing.rotation.z = 0.35;
    });
    return g;
  },
  hammer() {
    const g = new THREE.Group();
    const head = new THREE.Group();
    head.rotation.z = Math.PI / 2; // 머리는 가로로
    head.position.y = 0.01;
    g.add(head);
    const red = lam('#ff4757'), yellow = lam('#ffd23d');
    // 양 끝 노란 뚜껑 + 가운데 빨간 주름
    for (const d of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.018, 28), yellow, 0, d * 0.072, 0, head);
      mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.008, 28), yellow, 0, d * 0.085, 0, head).rotation.x = d > 0 ? 0 : Math.PI;
    }
    mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.13, 28), red, 0, 0, 0, head);
    for (let i = 0; i < 7; i++) mesh(new THREE.TorusGeometry(0.039, 0.0065, 8, 28), red, 0, -0.054 + i * 0.018, 0, head).rotation.x = Math.PI / 2;
    // 손잡이
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 16), yellow, 0, -0.12, 0, g);
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.05, 16), red, 0, -0.19, 0, g);
    mesh(new THREE.SphereGeometry(0.015, 16, 10), red, 0, -0.215, 0, g);
    return g;
  },
};

// 탁구채 하나 만들기 (아이템 또는 id)
export function makePaddle(item) {
  const it = typeof item === 'string' ? ITEM[item] : item;
  if (it?.model && PADDLE_MODELS[it.model]) return PADDLE_MODELS[it.model]();
  const g = new THREE.Group();
  const m = lam(it?.color || '#e0333c', { emissive: it?.emissive || '#000000', emissiveIntensity: it?.glow || 0 });
  mesh(new THREE.BoxGeometry(0.025, 0.1, 0.02), lam('#c99560'), 0, -0.1, 0, g);
  mesh(new THREE.CylinderGeometry(BLADE_R, BLADE_R, 0.012, 32), [m, m, lam('#222')], 0, 0, 0, g).rotation.x = Math.PI / 2;
  return g;
}

/* ───────────── 목록 화면용 작은 그림 ───────────── */
// 탁구채는 3D 모양을 작은 그림으로 찍어 둔다 (처음 한 번만)
let thumbR = null;
const thumbs = {};
// 3D 물체 하나를 투명 배경 그림(data URL)으로. lookY/dist: 몸처럼 세로로 긴 것은 가운데·거리를 정해 준다
function snap(obj, px, lookY, dist) {
  if (!thumbR) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b98f62', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(1, 2, 3);
    scene.add(sun);
    thumbR = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.01, 10) };
  }
  const { renderer, scene, camera } = thumbR;
  renderer.setSize(px, px, false);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  if (lookY != null) {
    camera.position.set(0, lookY + 0.2, dist * 1.9);
    camera.lookAt(0, lookY, 0);
  } else {
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    camera.position.set(c.x, c.y, c.z + size * 1.9);
    camera.lookAt(c);
  }
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL();
  scene.remove(obj);
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const mt of [].concat(o.material || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
  });
  return url;
}
export function paddleImage(it, px = 128) {
  const key = it.id + '/' + px;
  if (thumbs[key] != null) return thumbs[key];
  try {
    const m = makePaddle(it);
    m.rotation.set(-0.15, -0.45, 0.35);
    thumbs[key] = snap(m, px);
  } catch {
    thumbs[key] = '';
  }
  return thumbs[key];
}

// 몸은 옷 입은 몸통 + 흰 머리를 비스듬히 찍는다
export function outfitImage(it, px = 128) {
  const key = it.id + '/' + px;
  if (thumbs[key] != null) return thumbs[key];
  try {
    const o = it.outfit ? makeOutfit(it.outfit, { swingT: -1, group: new THREE.Group() }) : null;
    const g = new THREE.Group();
    if (o) { g.add(o.group); if (o.update) for (let i = 0; i < 10; i++) o.update(1 + i / 30, 1 / 30); }
    else mesh(new THREE.CapsuleGeometry(0.18, 0.62, 6, 16), lam('#f6f5f1'), 0, 0.5, 0, g);
    if (!o?.hideHead) mesh(new THREE.SphereGeometry(0.16, 20, 14), lam('#f6f5f1'), 0, 1.17, 0, g);
    g.rotation.y = Math.PI + 0.45; // 앞(-z)이 카메라 쪽으로, 살짝 비스듬히
    thumbs[key] = snap(g, px, 0.66, 1.2);
  } catch {
    thumbs[key] = '';
  }
  return thumbs[key];
}

export function swatch(it) {
  if (it.cat === 'body') {
    const src = outfitImage(it);
    if (src) return `<img class="sw img" src="${src}" alt="" />`;
  }
  if (it.cat === 'paddle') {
    const src = paddleImage(it);
    if (src) return `<img class="sw img" src="${src}" alt="" />`;
    const glow = it.glow ? `box-shadow: 0 0 10px ${it.emissive}, inset 0 0 0 3px rgba(255,255,255,.35);` : '';
    return `<span class="sw paddle" style="--c:${it.color || '#ccc'};${glow}"></span>`;
  }
  return '<span class="sw">?</span>';
}
