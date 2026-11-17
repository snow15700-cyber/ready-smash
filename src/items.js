import * as THREE from 'three';
import { fxTex } from './fx.js';
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
  char.fx = p.grade === 'legend' ? p.model : null; // 칠 때 효과 (scene.js의 hitFx → fx.js)
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
// 윤기 나는 재질 (전설 탁구채)
const phong = (color, shininess = 60, specular = '#ffffff', opts = {}) => new THREE.MeshPhongMaterial({ color, shininess, specular, ...opts });
// 두 점을 잇는 가는 막대 (기타 줄)
function rod(a, b, r, m, parent) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 5), m);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  parent.add(o);
  return o;
}
// 효과용 그림 한 장 (늘 화면을 본다). 처음엔 안 보이고 tick에서 켠다 → 목록 그림에는 안 찍힌다
function spr(name, color, size, add, parent) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex(name), color, transparent: true, opacity: 0, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.setScalar(size);
  s.visible = false;
  parent.add(s);
  return s;
}
// 효과용 부품 표시: 캐릭터 투명도·그림자 처리에서 빼고 스스로 투명도를 정한다 (scene.js)
function keep(o) { o.userData.fxKeep = true; return o; }
// 전설 느낌: 은은한 후광 + 주변에서 깜빡이는 반짝이. 돌려주는 함수를 tick에서 부른다 (col을 주면 그 색으로)
function legendAura(g, { color, y = 0, r = 0.1, n = 4, glow = 0.3 }) {
  const halo = spr('glow', color, r * 3.4, true, g);
  halo.position.set(0, y, 0);
  const stars = [];
  for (let i = 0; i < n; i++) stars.push({ s: spr('star4', '#ffffff', 0.03, true, g), sp: 0.55 + i * 0.13, off: i / n, cyc: -1 });
  return (t, col) => {
    halo.visible = true;
    if (col) halo.material.color.copy(col);
    halo.material.opacity = glow * (0.8 + 0.2 * Math.sin(t * 2.1));
    for (const st of stars) {
      const u = t * st.sp + st.off, k = u % 1, cyc = Math.floor(u);
      if (cyc !== st.cyc) { // 깜빡일 때마다 자리 옮기기
        st.cyc = cyc;
        const a = Math.random() * Math.PI * 2, d = r * (0.45 + Math.random() * 0.7);
        st.s.position.set(Math.cos(a) * d, y + Math.sin(a) * d * 1.2, (Math.random() - 0.5) * 0.06);
        st.size = 0.016 + Math.random() * 0.016;
      }
      const e = Math.sin(Math.PI * k);
      st.s.visible = true;
      st.s.material.opacity = e * e * 0.95;
      st.s.material.rotation = k * 1.2;
      st.s.scale.setScalar(st.size * (0.5 + e * 0.7));
    }
  };
}

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
  // ── 전설 ── 모양을 정성껏 + 스스로 반짝이고(userData.tick) 칠 때 반응한다(userData.hit)
  pan() {
    const g = new THREE.Group();
    const pan = new THREE.Group();
    pan.rotation.x = Math.PI / 2; // 팬 안쪽이 내 쪽(+z)
    pan.position.y = 0.01;
    g.add(pan);
    const iron = phong('#2c2c33', 60, '#9a9aa8', { side: THREE.DoubleSide });
    // 무쇠 팬: 둥글게 올라가는 벽 + 도톰한 테두리
    const prof = [[0, -0.013], [0.076, -0.013], [0.086, -0.0095], [0.094, 0.004], [0.099, 0.013], [0.1005, 0.0155], [0.098, 0.0165], [0.0955, 0.0145], [0.0905, 0.003], [0.083, -0.0065], [0.074, -0.0085], [0, -0.0085]];
    mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 56), iron, 0, 0, 0, pan);
    // 안쪽 바닥: 기름이 살짝 도는 윤기
    const oil = canvasTex(256, 256, (c, w) => {
      const grd = c.createRadialGradient(w * 0.4, w * 0.36, 10, w / 2, w / 2, w / 2);
      grd.addColorStop(0, '#5a5a66'); grd.addColorStop(0.6, '#3a3a43'); grd.addColorStop(1, '#2a2a31');
      c.fillStyle = grd; c.fillRect(0, 0, w, w);
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 2;
      for (let r = 14; r < w / 2; r += 12) { c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.stroke(); }
    });
    mesh(new THREE.CircleGeometry(0.0745, 48), phong('#ffffff', 90, '#ffffff', { map: oil }), 0, -0.0083, 0, pan).rotation.x = -Math.PI / 2;
    // 바닥 뒷면(상대가 보는 쪽): 동심원 무늬 + 별
    const under = canvasTex(256, 256, (c, w) => {
      c.fillStyle = '#26262c'; c.fillRect(0, 0, w, w);
      c.strokeStyle = '#3d3d46'; c.lineWidth = 5;
      for (let r = 46; r < w / 2; r += 16) { c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = '#4a4a55'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 13 : 30; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); }
      c.fill();
    });
    mesh(new THREE.CircleGeometry(0.0765, 48), phong('#ffffff', 40, '#888888', { map: under }), 0, -0.01315, 0, pan).rotation.x = Math.PI / 2;
    // 달걀 프라이: 가장자리가 노릇한 흰자 + 탱글한 노른자
    const egg = new THREE.Group();
    egg.position.set(-0.016, 0.026, -0.0045);
    g.add(egg);
    const r = rng(2), pts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, rr = 0.039 + r() * 0.011;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
    }
    const blob = new THREE.Shape(new THREE.CatmullRomCurve3(pts, true).getPoints(64).map((p) => new THREE.Vector2(p.x, p.y)));
    const whiteTex = shapeTex(0.13, 0, 0, (c, w) => {
      const grd = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w * 0.42);
      grd.addColorStop(0, '#fffefa'); grd.addColorStop(0.62, '#fffdf4'); grd.addColorStop(0.8, '#f7e2b4'); grd.addColorStop(0.92, '#cf9547'); grd.addColorStop(1, '#a86a2a');
      c.fillStyle = grd; c.fillRect(0, 0, w, w);
      c.fillStyle = 'rgba(60,45,30,0.75)'; // 후추
      const q = rng(9);
      for (let i = 0; i < 26; i++) { const a = q() * 6.28, d = q() * w * 0.28; c.beginPath(); c.arc(w / 2 + Math.cos(a) * d, w / 2 + Math.sin(a) * d, 1.6, 0, 6.28); c.fill(); }
    });
    egg.add(extrude(blob, 0.003, [phong('#ffffff', 50, '#ffffff', { map: whiteTex }), lam('#d9a55a')], 0.002));
    const yolkMat = phong('#ffb21f', 120, '#fff6d0', { emissive: '#ff8a00', emissiveIntensity: 0.2 });
    const yolk = mesh(new THREE.SphereGeometry(0.019, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), yolkMat, 0.004, -0.002, 0.003, egg);
    yolk.rotation.x = Math.PI / 2;
    yolk.scale.y = 0.62;
    mesh(new THREE.SphereGeometry(0.0042, 8, 6), lam('#fffbe8', { emissive: '#ffffff', emissiveIntensity: 0.6 }), -0.003, 0.005, 0.0125, egg).scale.z = 0.5;
    for (const [x, y, a] of [[-0.02, -0.014, 0.4], [0.022, 0.018, 1.2], [-0.012, 0.022, 2.2]]) mesh(new THREE.BoxGeometry(0.006, 0.003, 0.001), lam('#4e9a3a'), x, y, 0.0056, egg).rotation.z = a; // 파슬리
    // 베이컨 두 줄 (구불구불)
    const baconTex = canvasTex(128, 32, (c, w, h) => {
      c.fillStyle = '#b5392f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f3c9a8'; c.fillRect(0, 5, w, 6); c.fillRect(0, 20, w, 5);
      c.fillStyle = '#8f2a24'; c.fillRect(0, 13, w, 3);
    });
    for (const [x, y, a, s] of [[0.03, -0.022, 0.75, 1], [0.012, -0.04, 0.62, -1]]) {
      const geo = new THREE.PlaneGeometry(0.058, 0.015, 28, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 330) * 0.0022 * s);
      geo.computeVertexNormals();
      mesh(geo, phong('#ffffff', 70, '#ffd9c0', { map: baconTex, side: THREE.DoubleSide }), x, y, -0.0045, g).rotation.z = a;
    }
    // 손잡이: 쇠 목 + 놋쇠 이음 + 나무 손잡이 + 걸이 고리
    const neck = mesh(new THREE.CylinderGeometry(0.0085, 0.012, 0.075, 14), iron, 0, -0.122, 0, g);
    neck.scale.z = 0.7;
    const brass = phong('#d8a84a', 90, '#fff2c0');
    for (const x of [-0.006, 0.006]) mesh(new THREE.SphereGeometry(0.0032, 10, 8), brass, x, -0.094, 0.0085, g);
    mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.012, 18), brass, 0, -0.162, 0, g).scale.z = 0.8;
    const wood = mesh(new THREE.CapsuleGeometry(0.014, 0.078, 6, 18), phong('#8a5a32', 35, '#d9a877'), 0, -0.213, 0, g);
    wood.scale.z = 0.78;
    for (const y of [-0.186, -0.24]) mesh(new THREE.TorusGeometry(0.0138, 0.0012, 6, 24), lam('#5e3a1e'), 0, y, 0, g).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.0085, 0.0018, 8, 24), brass, 0, -0.273, 0, g);
    // 연출: 김이 모락모락, 노른자가 반짝, 치면 달걀이 탱글
    const aura = legendAura(g, { color: '#ff9a3c', y: 0.01, r: 0.11 });
    const steam = [0, 1, 2].map(() => spr('puff', '#ffffff', 0.05, false, g));
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      aura(t);
      steam.forEach((s, i) => {
        const k = (t * 0.42 + i / 3) % 1;
        s.visible = true;
        s.position.set(-0.012 + (i - 1) * 0.022 + Math.sin(k * 7 + i * 2) * 0.012, 0.04 + k * 0.13, 0.02);
        s.scale.setScalar(0.035 + k * 0.06);
        s.material.opacity = Math.sin(Math.PI * k) * 0.3;
      });
      yolkMat.emissiveIntensity = 0.2 + 0.12 * Math.sin(t * 3) + (tau < 0.5 ? 0.5 * (1 - tau / 0.5) : 0);
      const j = tau < 0.9 ? Math.exp(-tau * 6) * Math.cos(tau * 24) : 0;
      egg.scale.set(1 + j * 0.14, 1 - j * 0.14, 1 + Math.abs(j) * 0.9);
    };
    return g;
  },
  guitar() {
    const g = new THREE.Group();
    // 몸통 (위쪽) — 아래가 큰 8자 모양, 목은 아래로
    const body = new THREE.Shape();
    const Y = (y) => 0.13 - y;
    body.moveTo(0, Y(-0.02));
    body.bezierCurveTo(-0.05, Y(-0.02), -0.072, Y(0.01), -0.068, Y(0.045));
    body.bezierCurveTo(-0.064, Y(0.07), -0.04, Y(0.075), -0.042, Y(0.095));
    body.bezierCurveTo(-0.046, Y(0.13), -0.03, Y(0.15), 0, Y(0.15));
    body.bezierCurveTo(0.03, Y(0.15), 0.046, Y(0.13), 0.042, Y(0.095));
    body.bezierCurveTo(0.04, Y(0.075), 0.064, Y(0.07), 0.068, Y(0.045));
    body.bezierCurveTo(0.072, Y(0.01), 0.05, Y(-0.02), 0, Y(-0.02));
    const topTex = shapeTex(0.2, 0, 0.065, (c, w, h) => {
      const grd = c.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.45, w * 0.52);
      grd.addColorStop(0, '#f8d596'); grd.addColorStop(0.55, '#eab15f'); grd.addColorStop(0.85, '#b9682a'); grd.addColorStop(1, '#7a3c14');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(130,75,30,0.16)'; c.lineWidth = 2;
      for (let x = 0; x < w; x += 7) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, h); c.stroke(); }
    }, 512);
    const gb = new THREE.Group();
    gb.position.y = -0.06;
    g.add(gb);
    gb.add(extrude(body, 0.03, [phong('#ffffff', 70, '#fff0d0', { map: topTex }), phong('#5f3719', 50, '#c08a5a')], 0.004));
    mesh(new THREE.BoxGeometry(0.003, 0.16, 0.0006), lam('#3a2414'), 0, 0.065, -0.0192, gb); // 뒷면 가운데 줄
    // 사운드홀 + 장식 고리(로제트) + 픽가드
    const Z = 0.0192;
    mesh(new THREE.CircleGeometry(0.018, 36), lam('#170d07'), 0, 0.04, Z + 0.0003, gb);
    mesh(new THREE.RingGeometry(0.018, 0.0265, 40), lam('#3a2414'), 0, 0.04, Z + 0.0002, gb);
    for (const rr of [0.0188, 0.0225, 0.0262]) mesh(new THREE.TorusGeometry(rr, 0.0007, 6, 40), lam('#f3e3c0'), 0, 0.04, Z + 0.0003, gb);
    const pg = new THREE.Shape();
    pg.moveTo(0.019, 0.05); pg.bezierCurveTo(0.034, 0.05, 0.05, 0.062, 0.049, 0.08); pg.bezierCurveTo(0.048, 0.093, 0.036, 0.096, 0.03, 0.09);
    pg.bezierCurveTo(0.034, 0.078, 0.03, 0.064, 0.019, 0.05);
    const guard = extrude(pg, 0.0008, [phong('#3a1a12', 110, '#ffb890'), lam('#2a120c')], 0);
    guard.position.z = Z + 0.0005;
    gb.add(guard);
    // 브리지 + 새들 + 핀
    mesh(new THREE.BoxGeometry(0.042, 0.01, 0.004), lam('#2f1c10'), 0, 0.108, Z + 0.002, gb);
    mesh(new THREE.BoxGeometry(0.032, 0.002, 0.002), lam('#f6efe0'), 0, 0.106, Z + 0.0045, gb);
    for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(0.0014, 8, 6), lam('#f6efe0'), (i - 2.5) * 0.0052, 0.111, Z + 0.0042, gb);
    // 목 + 지판 + 프렛 + 점 장식
    mesh(new THREE.BoxGeometry(0.02, 0.152, 0.014), phong('#6b3f1d', 40, '#c08a5a'), 0, -0.095, 0.012, gb);
    mesh(new THREE.BoxGeometry(0.0215, 0.192, 0.003), lam('#2a1a12'), 0, -0.074, 0.0205, gb);
    const metal = phong('#e8e6df', 100, '#ffffff');
    const fretY = (i) => -0.17 + 0.32 * (1 - Math.pow(2, -i / 12));
    for (let i = 1; i <= 12; i++) mesh(new THREE.BoxGeometry(0.0215, 0.0014, 0.0012), metal, 0, fretY(i), 0.0224, gb);
    for (const i of [3, 5, 7, 9]) mesh(new THREE.CircleGeometry(0.0022, 12), lam('#f3e3c0'), 0, (fretY(i) + fretY(i - 1)) / 2, 0.0221, gb);
    for (const x of [-0.005, 0.005]) mesh(new THREE.CircleGeometry(0.002, 12), lam('#f3e3c0'), x, (fretY(12) + fretY(11)) / 2, 0.0221, gb);
    mesh(new THREE.BoxGeometry(0.0215, 0.003, 0.004), lam('#f6efe0'), 0, -0.171, 0.021, gb); // 너트
    // 헤드 + 줄감개
    const hs = new THREE.Shape();
    hs.moveTo(-0.0115, -0.172); hs.lineTo(0.0115, -0.172); hs.lineTo(0.017, -0.185); hs.lineTo(0.0165, -0.222);
    hs.quadraticCurveTo(0.008, -0.232, 0, -0.225); hs.quadraticCurveTo(-0.008, -0.232, -0.0165, -0.222); hs.lineTo(-0.017, -0.185); hs.closePath();
    const head = extrude(hs, 0.01, [phong('#2f1c10', 80, '#b58a66'), lam('#24140a')], 0.0015);
    head.position.z = 0.013;
    gb.add(head);
    for (const x of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = -0.19 - i * 0.0125;
      mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 10), metal, x * 0.0095, y, 0.021, gb).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.01, 6), metal, x * 0.02, y, 0.013, gb).rotation.z = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.004, 12, 8), phong('#f6efe0', 90, '#ffffff'), x * 0.026, y, 0.013, gb).scale.set(0.7, 1.15, 0.7);
    }
    mesh(new THREE.SphereGeometry(0.003, 10, 8), metal, 0, 0.154, 0, gb); // 끈 고리
    // 줄 6개 (굵은 줄은 구릿빛). 치면 떨린다
    const strings = [];
    for (let i = 0; i < 6; i++) {
      const m = lam(i < 3 ? '#e2b25a' : '#f4f2ea', { emissive: i < 3 ? '#ffcf70' : '#ffffff', emissiveIntensity: 0.15 });
      const s = rod([(i - 2.5) * 0.0031, -0.171, 0.0236], [(i - 2.5) * 0.0052, 0.107, 0.0246], 0.00075 - i * 0.00007, m, gb);
      s.userData.x = s.position.x;
      strings.push(s);
    }
    // 연출: 줄에 빛이 흐르고, 사운드홀에서 음표가 둥실. 치면 줄이 떨리며 빛난다
    const aura = legendAura(g, { color: '#ffc861', y: -0.01, r: 0.1 });
    const note = spr('note1', '#ffd77a', 0.035, false, g);
    const noteCols = ['#ffd77a', '#ff9db5', '#9fd8ff', '#b9f0a8'];
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT, vib = tau < 0.7 ? Math.exp(-tau * 5) : 0;
      aura(t);
      strings.forEach((s, i) => {
        s.material.emissiveIntensity = 0.15 + 0.5 * Math.pow(Math.max(0, Math.sin(t * 2.4 - i * 0.6)), 6) + vib * 1.2;
        s.position.x = s.userData.x + Math.sin(t * 95 + i * 1.7) * 0.0011 * vib;
      });
      const k = (t / 2.6) % 1;
      note.visible = true;
      note.material.color.set(noteCols[Math.floor(t / 2.6) % noteCols.length]);
      note.position.set(0.012 + Math.sin(k * 9) * 0.014, -0.02 + k * 0.15, 0.035);
      note.material.opacity = Math.sin(Math.PI * k) * 0.95;
      note.material.rotation = Math.sin(k * 9) * 0.3;
    };
    return g;
  },
  keyboard() {
    const g = new THREE.Group();
    // 몸체 + 옆으로 새어 나오는 무지개 불빛
    g.add(extrude(roundRect(0.108, 0.212, 0.012), 0.011, [phong('#30333f', 60, '#9aa0b8'), phong('#262935', 60, '#9aa0b8')], 0.0025));
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ff7ad9' });
    const under = extrude(roundRect(0.1125, 0.2165, 0.014), 0.0035, glowMat, 0);
    under.position.z = -0.001;
    g.add(under);
    // 키 글자 한 장(4×8칸)에 모아 그리기
    const LEG = ['ESC', '1', '2', '3', 'ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ', '♥', '', '', '', '↵'];
    const atlas = canvasTex(256, 512, (c) => {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#4a4458';
      LEG.forEach((s, i) => {
        c.font = `bold ${s.length > 1 ? 24 : 44}px Jua, sans-serif`;
        c.fillStyle = s === '♥' ? '#e8436a' : s === '↵' ? '#ffffff' : '#4a4458';
        c.fillText(s, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 34);
      });
    });
    const legMat = lam('#ffffff', { map: atlas, alphaTest: 0.4 });
    const legend = (i, parent) => {
      const geo = new THREE.PlaneGeometry(0.0125, 0.0125);
      const u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 8;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u0 + 0.25, v1, u0, v1 - 0.125, u0 + 0.25, v1 - 0.125], 2));
      mesh(geo, legMat, 0, 0, 0.0043, parent);
    };
    // 키캡: 위가 좁은 사다리꼴
    const capGeo = new THREE.CylinderGeometry(0.0108, 0.0148, 0.008, 4, 1);
    capGeo.rotateY(Math.PI / 4); capGeo.rotateX(Math.PI / 2);
    const rows = ['#ffb3ba', '#ffd8a8', '#fff1a8', '#c8f2b0', '#b0e6f2', '#b8c4ff', '#dcc0ff'];
    const P = 0.0255, keys = [];
    const addKey = (geo, col, x, y, i) => {
      const m = phong(col, 40, '#ffffff', { emissive: col, emissiveIntensity: 0.2, flatShading: true });
      const k = mesh(geo, m, x, y, 0.0115, g);
      if (i != null && LEG[i]) legend(i, k);
      keys.push({ k, m, x, y });
      return k;
    };
    rows.forEach((col, r) => { for (let k = 0; k < 4; k++) addKey(capGeo, col, -1.5 * P + k * P, 3.5 * P - r * P, r * 4 + k); });
    const spaceGeo = new THREE.BoxGeometry(0.071, 0.019, 0.008);
    addKey(spaceGeo, '#f4f1ea', -0.5 * P, -3.5 * P, null);
    addKey(capGeo, '#ff5a6a', 1.5 * P, -3.5 * P, 31);
    // 뒷면: 고무 발 + 이름표
    for (const x of [-1, 1]) for (const y of [-1, 1]) mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, 14), lam('#17181d'), x * 0.038, y * 0.088, -0.0085, g).rotation.x = Math.PI / 2;
    const label = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#f4f1ea'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 18); c.fill();
      c.fillStyle = '#30333f'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 44px Jua, sans-serif'; c.fillText('스매시 키보드', w / 2, 50);
      c.font = 'bold 24px Jua, sans-serif'; c.fillStyle = '#8a8fa3'; c.fillText('타닥타닥 ★ 전설', w / 2, 96);
    });
    mesh(new THREE.PlaneGeometry(0.06, 0.03), lam('#ffffff', { map: label }), 0, 0.02, -0.0083, g).rotation.y = Math.PI;
    // 돌돌 말린 케이블 (손잡이처럼 아래로) + USB
    const pts = [new THREE.Vector3(0, -0.106, 0), new THREE.Vector3(0, -0.118, 0)];
    for (let i = 0; i <= 44; i++) { const a = i * 0.9; pts.push(new THREE.Vector3(Math.cos(a) * 0.008, -0.124 - i * 0.0019, Math.sin(a) * 0.008)); }
    pts.push(new THREE.Vector3(0, -0.214, 0), new THREE.Vector3(0, -0.225, 0));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.0026, 8), phong('#ff9ec4', 60, '#ffffff'), 0, 0, 0, g);
    mesh(new THREE.BoxGeometry(0.011, 0.018, 0.007), phong('#30333f', 60, '#9aa0b8'), 0, -0.234, 0, g);
    mesh(new THREE.BoxGeometry(0.009, 0.01, 0.004), phong('#d9dbe3', 110, '#ffffff'), 0, -0.248, 0, g);
    // 연출: 무지개 불빛이 흐른다. 치면 가운데부터 키가 물결처럼 눌린다
    const aura = legendAura(g, { color: '#ff7ad9', y: 0, r: 0.1 });
    const col = new THREE.Color();
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      col.setHSL((t * 0.13) % 1, 0.95, 0.62);
      glowMat.color.copy(col);
      aura(t, col);
      for (const { k, m, x, y } of keys) {
        const wave = tau < 0.6 ? Math.max(0, 1 - Math.abs(Math.hypot(x, y) - tau * 0.42) / 0.03) : 0;
        m.emissive.setHSL((t * 0.13 + y * 2.2 - x * 1.2 + 1) % 1, 0.9, 0.55);
        m.emissiveIntensity = 0.26 + wave * 0.9;
        k.position.z = 0.0115 - wave * 0.003;
      }
    };
    return g;
  },
  mouse() {
    const g = new THREE.Group();
    const mo = new THREE.Group(); // 등(볼록한 쪽)이 내 쪽(+z), 버튼이 아래(-y)
    mo.position.set(0, 0.012, -0.013);
    g.add(mo);
    const A0 = 0.05, B = 0.082, C0 = 0.036;
    const wA = (yn) => A0 * (1 + 0.1 * yn), wC = (yn) => C0 * (1 + 0.16 * yn); // 손바닥 쪽(위)이 더 넓고 높다
    const surf = (x, y) => { const yn = y / B; return wC(yn) * Math.sqrt(Math.max(0, 1 - (x / wA(yn)) ** 2 - yn * yn)); };
    const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.rotateX(Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const yn = p.getY(i); p.setXYZ(i, p.getX(i) * wA(yn), yn * B, p.getZ(i) * wC(yn)); }
    geo.computeVertexNormals();
    mesh(geo, phong('#fbfaff', 90, '#ffffff', { emissive: '#55526a', emissiveIntensity: 0.9 }), 0, 0, 0, mo);
    // 바닥판 + 둘레 불빛
    const outline = [];
    for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, yn = Math.sin(a); outline.push(new THREE.Vector2(Math.cos(a) * wA(yn), yn * B)); }
    const base = extrude(new THREE.Shape(outline), 0.005, [lam('#3a3846'), lam('#3a3846')], 0);
    base.position.z = -0.0025;
    mo.add(base);
    const led = new THREE.MeshBasicMaterial({ color: '#7a6cff' });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline.map((v) => new THREE.Vector3(v.x * 1.005, v.y * 1.005, 0.0012)), true), 96, 0.0017, 6), led, 0, 0, 0, mo);
    // 버튼 가르는 홈 (표면을 따라)
    const seam = lam('#a7a2ba');
    const line = (fn, n = 24) => {
      const pts = [];
      for (let i = 0; i <= n; i++) { const [x, y] = fn(i / n); pts.push(new THREE.Vector3(x, y, surf(x, y) + 0.0002)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0009, 6), seam, 0, 0, 0, mo);
    };
    const SY = -0.012;
    line((k) => [0, -B * 0.985 + k * (SY + B * 0.985)]);
    line((k) => { const x = (k * 2 - 1) * wA(SY / B) * 0.985; return [x, SY - 0.01 * (x / A0) ** 2]; }, 32);
    // 휠 (홈 + 빛나는 바퀴)
    const WY = -0.048, wz = surf(0, WY);
    mesh(new THREE.BoxGeometry(0.0095, 0.024, 0.004), lam('#2b2a33'), 0, WY, wz - 0.0016, mo).rotation.x = -0.4;
    const wheelMat = phong('#7a6cff', 60, '#ffffff', { emissive: '#7a6cff', emissiveIntensity: 0.6 });
    const wheel = mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.0065, 20), wheelMat, 0, WY, wz - 0.002, mo);
    wheel.rotation.z = Math.PI / 2;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mesh(new THREE.BoxGeometry(0.0068, 0.0012, 0.0012), lam('#2b2a33'), 0, WY + Math.cos(a) * 0.0095, wz - 0.002 + Math.sin(a) * 0.0095, mo); }
    // 옆 버튼 2개 + 등에 빛나는 탁구공 무늬
    for (const y of [0.004, 0.027]) mesh(new THREE.BoxGeometry(0.004, 0.019, 0.007), lam('#cfcadf'), -wA(y / B) * 0.93, y, 0.013, mo);
    const logoMat = new THREE.MeshBasicMaterial({ color: '#7a6cff' });
    const logo = mesh(new THREE.SphereGeometry(0.008, 16, 10), logoMat, 0, 0.038, surf(0, 0.038) - 0.0008, mo);
    logo.scale.z = 0.25; logo.rotation.x = -0.25;
    // 바닥(상대가 보는 쪽): 미끄럼 패드 + 빨간 센서 불빛
    for (const y of [-0.064, 0.064]) mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.001, 20), lam('#e9e6f2'), 0, y, -0.0054, mo).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.001, 20), lam('#17161c'), 0, -0.005, -0.0054, mo).rotation.x = Math.PI / 2;
    const sensor = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.0012, 14), new THREE.MeshBasicMaterial({ color: '#ff3b4e' }), 0, -0.005, -0.0058, mo);
    sensor.rotation.x = Math.PI / 2;
    const red = spr('glow', '#ff3b4e', 0.05, true, mo);
    red.position.set(0, -0.005, -0.012);
    // 선 (손잡이처럼 아래로) + USB
    const pts = [new THREE.Vector3(0, -B + 0.004, 0.006), new THREE.Vector3(0, -B - 0.012, 0.004)];
    for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector3(Math.sin(i * 1.25) * 0.011, -B - 0.012 - i * 0.0125, Math.cos(i * 1.25) * 0.004));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.003, 8), phong('#d9d4e8', 50, '#ffffff'), 0, 0, 0, mo);
    const end = pts[pts.length - 1];
    mesh(new THREE.BoxGeometry(0.011, 0.018, 0.007), lam('#8f8aa6'), end.x, end.y - 0.008, end.z, mo);
    mesh(new THREE.BoxGeometry(0.009, 0.01, 0.004), phong('#d9dbe3', 110, '#ffffff'), end.x, end.y - 0.022, end.z, mo);
    // 연출: 불빛 색이 천천히 바뀐다. 치면 '딸깍' 하고 눌리며 왼쪽 버튼이 번쩍
    const aura = legendAura(g, { color: '#8f7bff', y: 0.005, r: 0.1 });
    const click = spr('glow', '#ffffff', 0.07, true, mo);
    click.position.set(-0.022, -0.05, surf(-0.022, -0.05) + 0.004);
    const col = new THREE.Color();
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      col.setHSL((t * 0.1) % 1, 0.9, 0.62);
      led.color.copy(col); logoMat.color.copy(col); wheelMat.color.copy(col); wheelMat.emissive.copy(col);
      aura(t, col);
      red.visible = true; red.material.opacity = 0.5 + 0.2 * Math.sin(t * 5);
      const j = tau < 0.5 ? Math.exp(-tau * 9) * Math.cos(tau * 26) : 0;
      mo.rotation.x = j * 0.22;
      click.visible = true; click.material.opacity = tau < 0.3 ? 0.9 * (1 - tau / 0.3) : 0;
      wheel.rotation.x = t * 1.5;
    };
    return g;
  },
  phone() {
    const g = new THREE.Group();
    const frameMat = phong('#b9a6f2', 110, '#ffffff');
    g.add(extrude(roundRect(0.088, 0.178, 0.015), 0.008, [phong('#1b1a22', 120, '#ffffff'), frameMat], 0.002));
    // 화면: 잠금 화면 + 알림 카드
    const heart = (c, x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(0, 48); c.bezierCurveTo(-60, 6, -50, -48, -18, -48); c.bezierCurveTo(-8, -48, 0, -38, 0, -30);
      c.bezierCurveTo(0, -38, 8, -48, 18, -48); c.bezierCurveTo(50, -48, 60, 6, 0, 48); c.fill(); c.restore();
    };
    const paddleIcon = (c, x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#c99560'; c.save(); c.rotate(0.6); c.fillRect(-9, 20, 18, 44); c.restore();
      c.fillStyle = '#e0333c'; c.beginPath(); c.arc(0, 0, 36, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(40, -26, 11, 0, Math.PI * 2); c.fill();
      c.restore();
    };
    const screen = canvasTex(512, 1024, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#ffb7d9'); grd.addColorStop(0.45, '#c3b5ff'); grd.addColorStop(1, '#8fe3ff');
      c.fillStyle = grd; c.beginPath(); c.roundRect(0, 0, w, h, 60); c.fill();
      for (const [x, y, r, a] of [[90, 300, 190, 0.22], [430, 640, 230, 0.18], [200, 900, 160, 0.2]]) { // 몽글몽글 빛
        const b = c.createRadialGradient(x, y, 0, x, y, r);
        b.addColorStop(0, `rgba(255,255,255,${a})`); b.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = b; c.fillRect(0, 0, w, h);
      }
      c.fillStyle = '#16151c'; c.beginPath(); c.roundRect(w / 2 - 74, 24, 148, 42, 21); c.fill();
      c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
      c.textAlign = 'left'; c.font = 'bold 34px Jua, sans-serif'; c.fillText('17:00', 44, 46);
      c.beginPath(); c.roundRect(w - 108, 32, 60, 28, 8); c.fill();
      c.fillStyle = '#6ad37a'; c.beginPath(); c.roundRect(w - 104, 36, 40, 20, 5); c.fill();
      c.fillStyle = '#ffffff'; c.textAlign = 'center';
      c.font = 'bold 40px Jua, sans-serif'; c.fillText('쉬는 시간', w / 2, 150);
      c.font = 'bold 150px Jua, sans-serif'; c.fillText('17:00', w / 2, 262);
      // 알림 카드
      c.fillStyle = 'rgba(255,255,255,0.88)'; c.beginPath(); c.roundRect(34, 380, w - 68, 170, 40); c.fill();
      c.fillStyle = '#ff9a3c'; c.beginPath(); c.roundRect(58, 404, 122, 122, 30); c.fill();
      paddleIcon(c, 112, 462, 1.1);
      c.textAlign = 'left'; c.fillStyle = '#2b2a33'; c.font = 'bold 44px Jua, sans-serif'; c.fillText('스매시!', 204, 436);
      c.fillStyle = '#6b6880'; c.font = 'bold 32px Jua, sans-serif'; c.fillText('한 판 어때요?', 204, 494);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.roundRect(34, 572, w - 68, 96, 34); c.fill();
      c.fillStyle = '#ff5f8f'; heart(c, 96, 622, 0.55);
      c.fillStyle = '#4a4660'; c.font = 'bold 32px Jua, sans-serif'; c.fillText('좋아요 99+', 150, 622);
      // 아래 앱들
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.roundRect(30, h - 190, w - 60, 130, 44); c.fill();
      ['#ff8fa3', '#ffc36b', '#7fd88a', '#6cc4ff'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.roundRect(58 + i * 104, h - 168, 86, 86, 24); c.fill(); });
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.roundRect(w / 2 - 90, h - 36, 180, 12, 6); c.fill();
      // 유리에 비친 빛
      c.fillStyle = 'rgba(255,255,255,0.13)'; c.beginPath(); c.moveTo(w * 0.55, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.42); c.closePath(); c.fill();
    });
    mesh(new THREE.PlaneGeometry(0.081, 0.171), new THREE.MeshBasicMaterial({ map: screen, alphaTest: 0.5 }), 0, 0, 0.0062, g);
    // 옆 버튼
    mesh(new THREE.BoxGeometry(0.002, 0.024, 0.004), frameMat, 0.0468, 0.03, 0, g);
    for (const y of [0.045, 0.018]) mesh(new THREE.BoxGeometry(0.002, 0.016, 0.004), frameMat, -0.0468, y, 0, g);
    // 뒷면: 오로라 빛 유리 + 탁구채 그림
    const back = canvasTex(256, 512, (c, w, h) => {
      const grd = c.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#e6dcff'); grd.addColorStop(0.5, '#c7b6ff'); grd.addColorStop(1, '#a8d8ff');
      c.fillStyle = grd; c.beginPath(); c.roundRect(0, 0, w, h, 30); c.fill();
      c.globalAlpha = 0.9; paddleIcon(c, w / 2 - 6, h * 0.56, 0.9);
      c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,0.85)'; c.textAlign = 'center'; c.font = 'bold 26px Jua, sans-serif'; c.fillText('SMASH', w / 2, h * 0.72);
    });
    mesh(new THREE.PlaneGeometry(0.081, 0.171), phong('#ffffff', 120, '#ffffff', { map: back, alphaTest: 0.5 }), 0, 0, -0.0062, g).rotation.y = Math.PI;
    // 카메라 섬: 렌즈 3개(테두리 + 유리 + 반사) + 플래시
    const cam = new THREE.Group();
    cam.position.set(0.02, 0.062, -0.0065);
    g.add(cam);
    const isl = extrude(roundRect(0.037, 0.039, 0.01), 0.0025, [phong('#b3a2ef', 120, '#ffffff'), frameMat], 0.0008);
    cam.add(isl);
    for (const [x, y] of [[0.0085, 0.0085], [0.0085, -0.0085], [-0.0085, 0]]) {
      mesh(new THREE.CylinderGeometry(0.0074, 0.0074, 0.003, 22), phong('#d9dbe3', 120, '#ffffff'), x, y, -0.0025, cam).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.0032, 22), phong('#0f1020', 150, '#9fc0ff'), x, y, -0.0028, cam).rotation.x = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.0016, 8, 6), new THREE.MeshBasicMaterial({ color: '#8fb4ff' }), x + 0.0018, y + 0.002, -0.0044, cam).scale.z = 0.3;
    }
    mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.001, 14), lam('#fff3c4', { emissive: '#ffe9a0', emissiveIntensity: 0.6 }), -0.0085, 0.012, -0.0022, cam).rotation.x = Math.PI / 2;
    // 연출: 화면이 은은하게 빛나고, 치면 화면이 번쩍 + '좋아요' 알림이 내려온다
    const aura = legendAura(g, { color: '#b9a0ff', y: 0, r: 0.095 });
    const flash = keep(mesh(new THREE.PlaneGeometry(0.081, 0.171), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, 0.0064, g));
    const bannerTex = canvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, 30); c.fill();
      c.fillStyle = '#ff5f8f'; heart(c, 52, 50, 0.55);
      c.fillStyle = '#2b2a33'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 44px Jua, sans-serif'; c.fillText('좋아요 +1', 92, 51);
    });
    const banner = keep(mesh(new THREE.PlaneGeometry(0.072, 0.027), new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, opacity: 0, depthWrite: false }), 0, 0.06, 0.0068, g));
    const led = spr('star4', '#fff3c4', 0.03, true, g);
    led.position.set(0.0115, 0.074, -0.011);
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      aura(t);
      flash.material.opacity = 0.05 + 0.04 * Math.sin(t * 2.2) + (tau < 0.35 ? 0.55 * (1 - tau / 0.35) : 0);
      const on = tau < 1.3;
      const inK = Math.min(1, tau / 0.14), outK = Math.max(0, (tau - 1.0) / 0.3);
      banner.visible = on;
      banner.position.y = 0.092 - 0.03 * (1 - (1 - inK) * (1 - inK));
      banner.material.opacity = on ? Math.min(inK, 1 - outK) : 0;
      const k = (t / 3.1) % 1;
      led.visible = true;
      led.material.opacity = k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0;
      led.material.rotation = t;
    };
    return g;
  },
  duck() {
    const g = new THREE.Group();
    const d = new THREE.Group(); // 물에 뜬 것처럼 흔들리고, 치면 꾹 눌린다
    g.add(d);
    const yellow = phong('#ffdc45', 90, '#fff8cf', { emissive: '#6b4a00', emissiveIntensity: 0.55 }), deep = phong('#fbbf0f', 70, '#ffe9a0', { emissive: '#6b4a00', emissiveIntensity: 0.4 }), orange = phong('#ff8a1f', 80, '#ffd9b0', { emissive: '#5a2500', emissiveIntensity: 0.4 });
    const body = mesh(new THREE.SphereGeometry(1, 32, 22), yellow, -0.008, -0.022, 0, d);
    body.scale.set(0.076, 0.05, 0.053);
    const chest = mesh(new THREE.SphereGeometry(1, 24, 16), yellow, 0.03, -0.012, 0, d);
    chest.scale.set(0.042, 0.04, 0.044);
    mesh(new THREE.SphereGeometry(0.043, 28, 20), yellow, 0.036, 0.047, 0, d);
    // 꼬리 (끝이 살짝 들림)
    const tail = mesh(new THREE.ConeGeometry(0.024, 0.046, 18), yellow, -0.076, 0.006, 0, d);
    tail.rotation.z = 0.95; tail.scale.z = 0.8;
    mesh(new THREE.SphereGeometry(0.008, 12, 8), yellow, -0.094, 0.021, 0, d);
    // 머리 위 삐죽 털
    for (const [x, a, s] of [[0.03, 0.5, 1], [0.038, 0.1, 1.25], [0.046, -0.35, 0.9]]) {
      const tuft = mesh(new THREE.ConeGeometry(0.0045, 0.02 * s, 8), yellow, x - Math.sin(a) * 0.008, 0.093 + 0.004 * s, 0, d);
      tuft.rotation.z = a;
    }
    // 부리 (살짝 벌린 미소)
    const beak = mesh(new THREE.SphereGeometry(1, 20, 14), orange, 0.08, 0.04, 0, d);
    beak.scale.set(0.024, 0.0085, 0.021);
    beak.rotation.z = 0.12;
    const beak2 = mesh(new THREE.SphereGeometry(1, 20, 14), phong('#f2741a', 60, '#ffd9b0'), 0.074, 0.03, 0, d);
    beak2.scale.set(0.018, 0.006, 0.016);
    beak2.rotation.z = -0.12;
    bothSides((s) => {
      // 눈 + 반짝 두 개
      mesh(new THREE.SphereGeometry(0.009, 16, 12), phong('#1b1b22', 140, '#ffffff'), 0.052, 0.06, s * 0.031, d);
      mesh(new THREE.SphereGeometry(0.003, 8, 6), lam('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.7 }), 0.056, 0.0645, s * 0.0385, d);
      mesh(new THREE.SphereGeometry(0.0015, 8, 6), lam('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.7 }), 0.05, 0.057, s * 0.0398, d);
      mesh(new THREE.SphereGeometry(0.0012, 6, 4), lam('#1b1b22'), 0.083, 0.0465, s * 0.007, d); // 콧구멍
      // 볼터치
      const blush = mesh(new THREE.SphereGeometry(0.0085, 12, 8), lam('#ff9a8a'), 0.062, 0.04, s * 0.033, d);
      blush.scale.set(1, 0.6, 0.35);
      // 날개 (깃 세 가닥)
      const wing = mesh(new THREE.SphereGeometry(1, 20, 14), deep, -0.012, -0.014, s * 0.046, d);
      wing.scale.set(0.036, 0.023, 0.012);
      wing.rotation.z = 0.35;
      for (let i = 0; i < 3; i++) {
        const f = mesh(new THREE.SphereGeometry(1, 12, 8), deep, -0.04 - i * 0.004, -0.014 - i * 0.009, s * 0.045, d);
        f.scale.set(0.017, 0.007, 0.008);
        f.rotation.z = 0.5 + i * 0.12;
      }
    });
    // 연출: 둥실둥실 + 비눗방울. 치면 '꽥' 하고 찌그러졌다 돌아온다
    const aura = legendAura(g, { color: '#7fd4ff', y: 0.01, r: 0.1 });
    const bubbles = [0, 1, 2].map(() => spr('bubble', '#e6f8ff', 0.02, false, g));
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      aura(t);
      const j = tau < 0.8 ? Math.exp(-tau * 7) * Math.cos(tau * 22) : 0;
      d.scale.set(1 + j * 0.22, 1 - j * 0.3, 1 + j * 0.22);
      d.rotation.z = Math.sin(t * 1.7) * 0.06;
      d.position.y = Math.sin(t * 1.7 + 1) * 0.004 - j * 0.012;
      bubbles.forEach((b, i) => {
        const k = (t * 0.33 + i / 3) % 1;
        b.visible = true;
        b.position.set(-0.06 + i * 0.055 + Math.sin(k * 6 + i * 2.1) * 0.012, -0.03 + k * 0.17, 0.03 - i * 0.03);
        b.scale.setScalar(0.014 + k * 0.014 + (i % 2) * 0.006);
        b.material.opacity = Math.min(1, k * 6) * (k > 0.9 ? (1 - k) * 10 : 1) * 0.85;
      });
    };
    return g;
  },
  hammer() {
    const g = new THREE.Group();
    const head = new THREE.Group();
    head.rotation.z = Math.PI / 2; // 머리는 가로로
    head.position.y = 0.01;
    g.add(head);
    const red = phong('#ff4757', 70, '#ffd0d5', { flatShading: true, side: THREE.DoubleSide }), yellow = phong('#ffd23d', 90, '#fff8cf'), orange = phong('#ff9f1a', 80, '#ffe9c0');
    // 가운데 빨간 주름(아코디언) — 접힌 모양이 또렷하게
    const N = 7, L = 0.058, prof = [];
    for (let i = 0; i <= N * 2; i++) prof.push(new THREE.Vector2(i % 2 ? 0.046 : 0.033, -L + (i * L) / N));
    const bellows = mesh(new THREE.LatheGeometry(prof, 40), red, 0, 0, 0, head);
    // 양 끝: 주황 이음 + 노란 뚜껑(모서리 둥글게) + 별 스티커
    const capProf = [[0, 0], [0.042, 0], [0.0465, 0.003], [0.048, 0.008], [0.048, 0.017], [0.045, 0.022], [0, 0.022]].map(([x, y]) => new THREE.Vector2(x, y));
    const star = canvasTex(128, 128, (c, w) => {
      c.fillStyle = '#ffd23d'; c.fillRect(0, 0, w, w);
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 54, 0, 6.3); c.stroke();
      c.fillStyle = '#ff4757'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 19 : 44; c.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
      c.fill();
    });
    const caps = [];
    for (const s of [-1, 1]) {
      const cap = new THREE.Group();
      cap.position.y = s * L;
      cap.rotation.x = s > 0 ? 0 : Math.PI;
      head.add(cap);
      mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.007, 32), orange, 0, 0.0035, 0, cap);
      mesh(new THREE.LatheGeometry(capProf, 36), yellow, 0, 0.007, 0, cap);
      mesh(new THREE.CircleGeometry(0.037, 32), lam('#ffffff', { map: star }), 0, 0.0293, 0, cap).rotation.x = -Math.PI / 2;
      caps.push(cap);
    }
    // 손잡이: 사탕 줄무늬 막대 + 이음 + 빨간 손잡이(미끄럼 방지 고리) + 손목 끈
    mesh(new THREE.CylinderGeometry(0.0165, 0.019, 0.02, 20), yellow, 0, -0.04, 0, g);
    const candy = canvasTex(64, 64, (c, w) => {
      c.fillStyle = '#ffd23d'; c.fillRect(0, 0, w, w);
      c.strokeStyle = '#fff6c9'; c.lineWidth = 12;
      for (let x = -w; x < w * 2; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, w); c.stroke(); }
    });
    candy.wrapS = candy.wrapT = THREE.RepeatWrapping;
    candy.repeat.set(2, 5);
    mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.13, 18), phong('#ffffff', 90, '#ffffff', { map: candy }), 0, -0.113, 0, g);
    const grip = phong('#ff4757', 70, '#ffd0d5');
    mesh(new THREE.CylinderGeometry(0.0148, 0.0148, 0.056, 18), grip, 0, -0.203, 0, g);
    for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.0152, 0.0022, 8, 22), grip, 0, -0.184 - i * 0.0125, 0, g).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.0165, 18, 12), grip, 0, -0.234, 0, g);
    const strap = mesh(new THREE.TorusGeometry(0.016, 0.0016, 6, 28), lam('#4dabf7'), 0.006, -0.262, 0, g);
    strap.scale.set(0.7, 1, 1); strap.rotation.z = 0.25;
    // 연출: 별이 반짝. 치면 주름이 '뿅' 하고 눌렸다 펴진다
    const aura = legendAura(g, { color: '#ffd23d', y: 0.01, r: 0.11, n: 5 });
    let hitT = -9, hitNow = false;
    g.userData.hit = () => { hitNow = true; };
    g.userData.tick = (t) => {
      if (hitNow) { hitNow = false; hitT = t; }
      const tau = t - hitT;
      aura(t);
      const j = tau < 0.8 ? Math.exp(-tau * 8) * Math.cos(tau * 21) : 0;
      const sq = 1 - j * 0.38 + Math.sin(t * 2.2) * 0.012;
      bellows.scale.set(1 + j * 0.12, sq, 1 + j * 0.12);
      caps.forEach((c, i) => { c.position.y = (i ? 1 : -1) * L * sq; });
    };
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
    // 크기는 실제 부품만 잰다 (전설 탁구채의 효과용 그림은 빼고)
    const box = new THREE.Box3(), bb = new THREE.Box3();
    obj.traverse((o) => {
      if (!o.isMesh || o.userData.fxKeep) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
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
