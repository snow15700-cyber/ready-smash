// 꾸미기 아이템: 목록(이름·가격 초안)과 모양 만들기
// - 옷(상의·하의·신발)은 캡슐 몸통에 색·무늬를 칠한다 (캔버스 텍스처)
// - 모자는 머리에, 탁구채는 arm 그룹에 3D 조각으로 붙인다
// - 탁구공은 공 모양 + 궤적 이펙트 (createBallFx)
import * as THREE from 'three';

export const CATS = [
  { id: 'top', name: '상의', icon: '👕' },
  { id: 'bottom', name: '하의', icon: '👖' },
  { id: 'shoes', name: '신발', icon: '👟' },
  { id: 'hat', name: '모자·머리', icon: '🎩' },
  { id: 'paddle', name: '탁구채', icon: '🏓' },
  { id: 'ball', name: '탁구공', icon: '⚪' },
];

// price 0 = 처음부터 가진 기본 아이템. 가격은 초안
export const ITEMS = [
  // 상의
  { id: 'top_basic', cat: 'top', name: '기본 (맨몸)', icon: '⚪', price: 0 },
  { id: 'top_stripe', cat: 'top', name: '줄무늬 티', icon: '〰️', price: 150 },
  { id: 'top_heart', cat: 'top', name: 'I♥탁구 티', icon: '💗', price: 200 },
  { id: 'top_uniform', cat: 'top', name: '탁구 유니폼', icon: '🎽', price: 300 },
  { id: 'top_pajama', cat: 'top', name: '별 잠옷', icon: '🌙', price: 400 },
  { id: 'top_hawaii', cat: 'top', name: '하와이안 셔츠', icon: '🌺', price: 500 },
  { id: 'top_apron', cat: 'top', name: '김제빵 앞치마', icon: '🍞', price: 600 },
  { id: 'top_suit', cat: 'top', name: '정장', icon: '👔', price: 800 },
  // 하의
  { id: 'bottom_basic', cat: 'bottom', name: '기본 (맨몸)', icon: '⚪', price: 0 },
  { id: 'bottom_shorts', cat: 'bottom', name: '남색 반바지', icon: '🩳', price: 100 },
  { id: 'bottom_jeans', cat: 'bottom', name: '청바지', icon: '👖', price: 200 },
  { id: 'bottom_check', cat: 'bottom', name: '분홍 체크 바지', icon: '🟪', price: 250 },
  { id: 'bottom_track', cat: 'bottom', name: '초록 트레이닝복', icon: '🏃', price: 300 },
  { id: 'bottom_pajama', cat: 'bottom', name: '별 잠옷 바지', icon: '🌙', price: 400 },
  { id: 'bottom_leopard', cat: 'bottom', name: '호피 바지', icon: '🐆', price: 500 },
  { id: 'bottom_rainbow', cat: 'bottom', name: '무지개 바지', icon: '🌈', price: 600 },
  // 신발
  { id: 'shoes_basic', cat: 'shoes', name: '기본 (맨발)', icon: '⚪', price: 0 },
  { id: 'shoes_red', cat: 'shoes', name: '빨강 운동화', icon: '👟', price: 100 },
  { id: 'shoes_slipper', cat: 'shoes', name: '삼선 슬리퍼', icon: '🩴', price: 200 },
  { id: 'shoes_boots', cat: 'shoes', name: '노란 장화', icon: '🥾', price: 250 },
  { id: 'shoes_neon', cat: 'shoes', name: '형광 운동화', icon: '💚', price: 300 },
  { id: 'shoes_bear', cat: 'shoes', name: '곰발 슬리퍼', icon: '🐻', price: 500 },
  { id: 'shoes_gold', cat: 'shoes', name: '황금 신발', icon: '✨', price: 800 },
  // 모자·머리 장식
  { id: 'hat_none', cat: 'hat', name: '없음', icon: '⚪', price: 0 },
  { id: 'hat_band', cat: 'hat', name: '빨간 헤어밴드', icon: '🔴', price: 100 },
  { id: 'hat_sprout', cat: 'hat', name: '새싹', icon: '🌱', price: 150 },
  { id: 'hat_cat', cat: 'hat', name: '치즈냥 귀', icon: '🐱', price: 200 },
  { id: 'hat_party', cat: 'hat', name: '파티 고깔', icon: '🥳', price: 250 },
  { id: 'hat_bunny', cat: 'hat', name: '토끼 귀', icon: '🐰', price: 300 },
  { id: 'hat_cap', cat: 'hat', name: '야구 모자', icon: '🧢', price: 300 },
  { id: 'hat_chef', cat: 'hat', name: '요리사 모자', icon: '👨‍🍳', price: 400 },
  { id: 'hat_afro', cat: 'hat', name: '뽀글 머리', icon: '🦱', price: 600 },
  { id: 'hat_crown', cat: 'hat', name: '왕관', icon: '👑', price: 1000 },
  // 탁구채
  { id: 'paddle_basic', cat: 'paddle', name: '기본 빨강', icon: '🔴', price: 0 },
  { id: 'paddle_blue', cat: 'paddle', name: '파랑', icon: '🔵', price: 200 },
  { id: 'paddle_purple', cat: 'paddle', name: '보라', icon: '🟣', price: 200 },
  { id: 'paddle_dots', cat: 'paddle', name: '물방울 무늬', icon: '🩷', price: 400 },
  { id: 'paddle_rainbow', cat: 'paddle', name: '무지개 과녁', icon: '🌈', price: 600 },
  { id: 'paddle_heart', cat: 'paddle', name: '하트', icon: '❤️', price: 700 },
  { id: 'paddle_melon', cat: 'paddle', name: '수박', icon: '🍉', price: 800 },
  { id: 'paddle_toast', cat: 'paddle', name: '식빵', icon: '🍞', price: 1000 },
  { id: 'paddle_spatula', cat: 'paddle', name: '뒤집개', icon: '🥄', price: 1000 },
  { id: 'paddle_swatter', cat: 'paddle', name: '파리채', icon: '🪰', price: 1200 },
  { id: 'paddle_pan', cat: 'paddle', name: '프라이팬', icon: '🍳', price: 1500 },
  // 탁구공
  { id: 'ball_basic', cat: 'ball', name: '기본 흰 공', icon: '⚪', price: 0 },
  { id: 'ball_orange', cat: 'ball', name: '주황 공', icon: '🟠', price: 150 },
  { id: 'ball_neon', cat: 'ball', name: '형광 공', icon: '🟡', price: 150 },
  { id: 'ball_pink', cat: 'ball', name: '분홍 공', icon: '🩷', price: 200 },
  { id: 'ball_melon', cat: 'ball', name: '수박 공', icon: '🍉', price: 400 },
  { id: 'ball_eye', cat: 'ball', name: '눈알 공', icon: '👁️', price: 500 },
  { id: 'ball_star', cat: 'ball', name: '반짝별 궤적', icon: '⭐', price: 700 },
  { id: 'ball_heart', cat: 'ball', name: '하트 궤적', icon: '💕', price: 800 },
  { id: 'ball_fire', cat: 'ball', name: '불꽃 궤적', icon: '🔥', price: 1000 },
  { id: 'ball_rainbow', cat: 'ball', name: '무지개 궤적', icon: '🌈', price: 1200 },
];

export const DEFAULT_LOOK = { top: 'top_basic', bottom: 'bottom_basic', shoes: 'shoes_basic', hat: 'hat_none', paddle: 'paddle_basic', ball: 'ball_basic' };

const WHITE = '#f6f5f1';
const lam = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

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

/* ───────────── 옷: 몸통 칠하기 ───────────── */
// 몸통 캡슐: 반지름 0.18, y 0.01 ~ 0.99. 텍스처 가로 = 몸 한 바퀴(가운데가 앞), 세로 = 높이
const BODY_R = 0.18, BY0 = 0.01, BY1 = 0.99;
const TW = 1024;
const PXM = TW / (2 * Math.PI * BODY_R); // 1m당 픽셀 (가로·세로 같게)
const TH = Math.round((BY1 - BY0) * PXM);
const py = (y) => (BY1 - y) * PXM; // 높이(m) → 캔버스 y
const M = (m) => m * PXM; // 길이(m) → 픽셀
const FX = TW / 2; // 앞 가운데
const ZONE = { shoes: [BY0, 0.16], bottom: [0.16, 0.5], top: [0.5, BY1] };

// 몸통 UV를 '둘레 × 높이'로 다시 잡는다 (앞 = u 0.5)
function fixBodyUV(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + 0.5, z = pos.getZ(i);
    let u;
    if (Math.hypot(x, z) < 1e-5) u = uv.getX(i);
    else {
      u = Math.atan2(x, z) / (2 * Math.PI); // 뒤(+z) = 0, 앞(-z) = ±0.5
      if (u < 0) u += 1;
      if (u < 1e-4 && uv.getX(i) > 0.5) u = 1; // 이음매(등 가운데) 중복 정점
    }
    uv.setXY(i, u, (y - BY0) / (BY1 - BY0));
  }
  uv.needsUpdate = true;
}

function zoneRect(g, y0, y1) {
  g.save();
  g.beginPath();
  g.rect(0, py(y1), TW, py(y0) - py(y1));
  g.clip();
}
const band = (g, y0, y1, color) => { g.fillStyle = color; g.fillRect(0, py(y1), TW, py(y0) - py(y1)); };
// 앞(x=FX) 기준 대칭 / 등(x=0과 TW에 반씩) 그리기
const atBack = (fn) => { fn(0); fn(TW); };
const atSides = (fn) => { fn(TW * 0.25); fn(TW * 0.75); };

function dots(g, y0, y1, n, seed, draw) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * TW, y = py(y0 + r() * (y1 - y0));
    draw(x, y, r);
    if (x < 60) draw(x + TW, y, r); else if (x > TW - 60) draw(x - TW, y, r);
  }
}
function star(g, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  g.fill();
}
function flower(g, x, y, s, petal, center) {
  g.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath();
    g.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = center;
  g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
}
function frontButtons(g, y0, y1, n, color) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const y = py(y0 + ((i + 0.5) / n) * (y1 - y0));
    g.beginPath(); g.arc(FX, y, M(0.008), 0, Math.PI * 2); g.fill();
  }
}

const PAINT = {
  // 상의
  top_stripe(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#fbfaf5');
    g.fillStyle = '#2d3f7a';
    for (let y = y0 + 0.02; y < y1; y += 0.07) band(g, y, y + 0.032, '#2d3f7a');
  },
  top_heart(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#fbfaf5');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${M(0.075)}px Jua, sans-serif`;
    g.fillStyle = '#2b2a33';
    g.fillText('I', FX - M(0.075), py(0.8));
    g.fillStyle = '#ef4a6a';
    heartPath(g, FX, py(0.8) + M(0.008), M(0.045));
    g.fillStyle = '#2b2a33';
    g.fillText('탁구', FX, py(0.69));
  },
  top_uniform(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#e23b3b');
    band(g, 0.93, y1, '#ffffff');
    g.fillStyle = '#ffffff';
    atSides((x) => g.fillRect(x - M(0.012), py(0.93), M(0.024), py(y0) - py(0.93)));
    band(g, y0, y0 + 0.025, '#ffffff');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${M(0.07)}px Jua, sans-serif`;
    g.fillText('스매시', FX, py(0.78));
    g.font = `${M(0.22)}px Jua, sans-serif`;
    atBack((x) => g.fillText('7', x, py(0.72)));
  },
  top_pajama(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#a9c8f2');
    pajamaPattern(g, y0, y1, 11);
    frontButtons(g, 0.58, 0.92, 4, '#ffffff');
  },
  top_hawaii(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#26b2a5');
    dots(g, y0, y1, 26, 3, (x, y, r) => {
      g.fillStyle = '#1d7f4c';
      g.beginPath(); g.ellipse(x + M(0.03), y + M(0.02), M(0.03), M(0.012), 0.6, 0, Math.PI * 2); g.fill();
      flower(g, x, y, M(0.028), r() < 0.5 ? '#ff7aa8' : '#ffd23d', '#ffffff');
    });
    frontButtons(g, 0.56, 0.92, 4, '#fff4d6');
  },
  top_apron(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#fbfaf5');
    // 앞치마: 몸 앞쪽, 하의 위까지 내려옴
    g.restore(); g.save();
    g.fillStyle = '#9a6234';
    const w = M(0.2);
    g.beginPath();
    g.roundRect(FX - w / 2, py(0.86), w, py(0.22) - py(0.86), M(0.02));
    g.fill();
    // 끈
    g.fillRect(FX - w / 2, py(0.62), -FX + w / 2 + TW * 0.25 + 2, M(0.018));
    g.fillRect(FX + w / 2, py(0.62), TW * 0.25 - w / 2, M(0.018));
    g.strokeStyle = '#9a6234'; g.lineWidth = M(0.012);
    g.beginPath(); g.moveTo(FX - w * 0.42, py(0.86)); g.lineTo(FX - w * 0.6, py(BY1)); g.stroke();
    g.beginPath(); g.moveTo(FX + w * 0.42, py(0.86)); g.lineTo(FX + w * 0.6, py(BY1)); g.stroke();
    // 주머니
    g.strokeStyle = '#f1d9b5'; g.lineWidth = M(0.004);
    g.strokeRect(FX - M(0.06), py(0.42), M(0.12), M(0.07));
    // 식빵 그림
    toastIcon(g, FX, py(0.74), M(0.045));
    g.fillStyle = '#fff4dc';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${M(0.042)}px Jua, sans-serif`;
    g.fillText('김제빵', FX, py(0.6));
  },
  top_suit(g) {
    const [y0, y1] = ZONE.top;
    band(g, y0, y1, '#2a3350');
    // 셔츠 V
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(FX - M(0.08), py(BY1)); g.lineTo(FX + M(0.08), py(BY1)); g.lineTo(FX, py(0.66)); g.closePath();
    g.fill();
    // 넥타이
    g.fillStyle = '#d8333a';
    g.beginPath();
    g.moveTo(FX - M(0.014), py(0.95)); g.lineTo(FX + M(0.014), py(0.95));
    g.lineTo(FX + M(0.022), py(0.72)); g.lineTo(FX, py(0.68)); g.lineTo(FX - M(0.022), py(0.72));
    g.closePath(); g.fill();
    g.fillRect(FX - M(0.018), py(0.975), M(0.036), M(0.03));
    // 단추 + 주머니
    g.fillStyle = '#c9b78a';
    for (const y of [0.62, 0.56]) { g.beginPath(); g.arc(FX, py(y), M(0.008), 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffff';
    g.fillRect(FX - M(0.13), py(0.85), M(0.04), M(0.012));
  },
  // 하의
  bottom_shorts(g) { band(g, 0.3, 0.5, '#2c3e78'); band(g, 0.3, 0.318, '#e9edf6'); },
  bottom_jeans(g) {
    band(g, 0.16, 0.5, '#3f6fb2');
    g.strokeStyle = '#e2b86b'; g.lineWidth = M(0.003);
    g.setLineDash([M(0.008), M(0.006)]);
    atSides((x) => { g.beginPath(); g.moveTo(x, py(0.5)); g.lineTo(x, py(0.16)); g.stroke(); });
    g.beginPath(); g.moveTo(FX, py(0.47)); g.lineTo(FX, py(0.37)); g.stroke();
    atBack((x) => { for (const d of [-1, 1]) g.strokeRect(x + d * M(0.07) - M(0.03), py(0.45), M(0.06), M(0.06)); });
    g.setLineDash([]);
    band(g, 0.47, 0.5, '#2f5a96');
    g.fillStyle = '#d9b04a'; g.fillRect(FX - M(0.012), py(0.5), M(0.024), M(0.03));
  },
  bottom_check(g) {
    band(g, 0.16, 0.5, '#f6a6c8');
    g.fillStyle = 'rgba(214,77,142,0.45)';
    for (let x = 0; x < TW; x += M(0.06)) g.fillRect(x, py(0.5), M(0.022), py(0.16) - py(0.5));
    for (let y = 0.18; y < 0.5; y += 0.06) band(g, y, y + 0.022, 'rgba(214,77,142,0.45)');
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let x = M(0.03); x < TW; x += M(0.06)) g.fillRect(x, py(0.5), M(0.004), py(0.16) - py(0.5));
  },
  bottom_track(g) {
    band(g, 0.16, 0.5, '#1f6b50');
    g.fillStyle = '#ffffff';
    atSides((x) => { g.fillRect(x - M(0.022), py(0.5), M(0.012), py(0.16) - py(0.5)); g.fillRect(x + M(0.01), py(0.5), M(0.012), py(0.16) - py(0.5)); });
    band(g, 0.16, 0.18, '#18523d');
  },
  bottom_pajama(g) { band(g, 0.16, 0.5, '#a9c8f2'); pajamaPattern(g, 0.16, 0.5, 12); band(g, 0.47, 0.5, '#8fb3e6'); },
  bottom_leopard(g) {
    band(g, 0.16, 0.5, '#e7ad4f');
    dots(g, 0.16, 0.5, 70, 21, (x, y, r) => {
      const s = M(0.012 + r() * 0.01);
      g.fillStyle = '#4a2a14';
      g.beginPath(); g.ellipse(x, y, s, s * 0.8, r() * 3, 0.2, Math.PI * 1.6); g.lineTo(x, y); g.fill();
      g.fillStyle = '#b8762e';
      g.beginPath(); g.arc(x, y, s * 0.45, 0, Math.PI * 2); g.fill();
    });
  },
  bottom_rainbow(g) {
    const cols = ['#ff5a5a', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb3ff', '#7a6cff', '#c56cf0'];
    const h = (0.5 - 0.16) / cols.length;
    cols.forEach((c, i) => band(g, 0.5 - (i + 1) * h, 0.5 - i * h, c));
  },
  // 신발
  shoes_red(g) {
    band(g, BY0, 0.16, '#e23b3b'); band(g, BY0, 0.04, '#ffffff');
    laces(g, '#ffffff');
  },
  shoes_neon(g) {
    band(g, BY0, 0.16, '#7cf03a'); band(g, BY0, 0.04, '#ff5fb0');
    laces(g, '#ff5fb0');
  },
  shoes_slipper(g) {
    band(g, BY0, 0.16, '#e9e5dc'); band(g, BY0, 0.035, '#3a3f4a');
    g.fillStyle = '#2f62c9';
    g.beginPath(); g.roundRect(FX - M(0.17), py(0.14), M(0.34), py(0.06) - py(0.14), M(0.015)); g.fill();
    g.fillStyle = '#ffffff';
    for (const d of [-1, 0, 1]) g.fillRect(FX + d * M(0.07) - M(0.012), py(0.14), M(0.024), py(0.06) - py(0.14));
  },
  shoes_boots(g) {
    g.restore();
    zoneRect(g, BY0, 0.24);
    band(g, BY0, 0.24, '#ffcf2e'); band(g, BY0, 0.035, '#5b4a2a');
    band(g, 0.215, 0.24, '#f2b70f');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(FX - M(0.09), py(0.2), M(0.02), M(0.12));
  },
  shoes_bear(g) {
    band(g, BY0, 0.16, '#9a6436'); band(g, BY0, 0.035, '#6f4423');
    g.fillStyle = '#f7b9c4';
    for (const d of [-1, 1]) {
      const x = FX + d * M(0.08);
      g.beginPath(); g.ellipse(x, py(0.08), M(0.03), M(0.022), 0, 0, Math.PI * 2); g.fill();
      for (const k of [-1, 0, 1]) { g.beginPath(); g.arc(x + k * M(0.024), py(0.118), M(0.009), 0, Math.PI * 2); g.fill(); }
    }
  },
  shoes_gold(g) {
    const grd = g.createLinearGradient(0, py(0.16), 0, py(BY0));
    grd.addColorStop(0, '#fff0a0'); grd.addColorStop(0.5, '#f2c230'); grd.addColorStop(1, '#b8860b');
    g.fillStyle = grd; g.fillRect(0, py(0.16), TW, py(BY0) - py(0.16));
    g.fillStyle = 'rgba(255,255,255,0.85)';
    dots(g, 0.04, 0.15, 22, 5, (x, y) => star(g, x, y, M(0.012), M(0.004), 4));
  },
};

function pajamaPattern(g, y0, y1, seed) {
  dots(g, y0, y1, 30, seed, (x, y, r) => {
    if (r() < 0.6) { g.fillStyle = '#ffe066'; star(g, x, y, M(0.016), M(0.007)); }
    else {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x, y, M(0.015), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a9c8f2';
      g.beginPath(); g.arc(x + M(0.007), y - M(0.004), M(0.013), 0, Math.PI * 2); g.fill();
    }
  });
}
function laces(g, color) {
  g.strokeStyle = color; g.lineWidth = M(0.006);
  for (let i = 0; i < 3; i++) {
    const y = py(0.075 + i * 0.024);
    g.beginPath(); g.moveTo(FX - M(0.03), y); g.lineTo(FX + M(0.03), y - M(0.012)); g.stroke();
    g.beginPath(); g.moveTo(FX + M(0.03), y); g.lineTo(FX - M(0.03), y - M(0.012)); g.stroke();
  }
}
function toastIcon(g, x, y, s) {
  g.fillStyle = '#c9822f';
  g.beginPath();
  g.moveTo(x - s * 0.8, y + s); g.lineTo(x + s * 0.8, y + s); g.lineTo(x + s * 0.8, y - s * 0.2);
  g.arc(x + s * 0.45, y - s * 0.45, s * 0.5, 0.5, -2.2, true);
  g.arc(x - s * 0.45, y - s * 0.45, s * 0.5, -0.9, 2.6, true);
  g.closePath(); g.fill();
  g.fillStyle = '#f6dca8';
  g.save(); g.translate(x, y + s * 0.05); g.scale(0.78, 0.78); g.translate(-x, -y);
  g.beginPath();
  g.moveTo(x - s * 0.8, y + s); g.lineTo(x + s * 0.8, y + s); g.lineTo(x + s * 0.8, y - s * 0.2);
  g.arc(x + s * 0.45, y - s * 0.45, s * 0.5, 0.5, -2.2, true);
  g.arc(x - s * 0.45, y - s * 0.45, s * 0.5, -0.9, 2.6, true);
  g.closePath(); g.fill();
  g.restore();
}

function paintBody(look) {
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  g.fillStyle = WHITE;
  g.fillRect(0, 0, TW, TH);
  for (const cat of ['bottom', 'shoes', 'top']) {
    const fn = PAINT[look[cat]];
    if (!fn) continue;
    zoneRect(g, ...ZONE[cat]);
    fn(g);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ───────────── 모자·머리 장식 (머리 중심 기준, 앞 = -z) ───────────── */
const HR = 0.16;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mesh = (geo, m, x = 0, y = 0, z = 0, parent) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  if (parent) parent.add(o);
  return o;
};

const HATS = {
  hat_band(g) {
    const t = mesh(new THREE.TorusGeometry(0.152, 0.02, 10, 32), lam('#e23b3b'), 0, 0.05, 0, g);
    t.rotation.x = Math.PI / 2 - 0.35;
  },
  hat_sprout(g) {
    const green = lam('#58c04a');
    mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.09, 8), green, 0, HR + 0.04, 0, g);
    for (const d of [-1, 1]) {
      const leaf = mesh(new THREE.SphereGeometry(0.04, 12, 8), lam('#73d65a'), d * 0.038, HR + 0.09, 0, g);
      leaf.scale.set(1, 0.32, 0.6);
      leaf.rotation.z = d * 0.45;
    }
  },
  hat_cat(g) {
    for (const d of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(d * 0.085, 0.12, 0.01);
      ear.rotation.z = -d * 0.45;
      g.add(ear);
      mesh(new THREE.ConeGeometry(0.065, 0.11, 4), lam('#f0a24a', { flatShading: true }), 0, 0.03, 0, ear).rotation.y = Math.PI / 4;
      const inner = mesh(new THREE.ConeGeometry(0.04, 0.075, 4), lam('#ffb3c1', { flatShading: true }), 0, 0.025, -0.017, ear);
      inner.rotation.y = Math.PI / 4;
    }
  },
  hat_party(g) {
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#7a5cff'; c.fillRect(0, 0, w, h);
      const cols = ['#ffd23d', '#ff6fa8', '#5fe0c8'];
      for (let i = 0; i < 40; i++) { c.fillStyle = cols[i % 3]; c.beginPath(); c.arc((i * 53) % w, ((i * 97) % h), 9, 0, Math.PI * 2); c.fill(); }
    });
    const hat = new THREE.Group();
    hat.position.set(0.03, HR - 0.02, 0);
    hat.rotation.z = -0.25;
    g.add(hat);
    mesh(new THREE.ConeGeometry(0.075, 0.2, 24), lam('#ffffff', { map: tex }), 0, 0.1, 0, hat);
    mesh(new THREE.SphereGeometry(0.022, 12, 8), lam('#ffd23d'), 0, 0.205, 0, hat);
  },
  hat_bunny(g) {
    for (const d of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(d * 0.06, 0.12, 0.01);
      ear.rotation.z = -d * 0.2;
      ear.rotation.x = d > 0 ? 0.25 : -0.05;
      g.add(ear);
      const o = mesh(new THREE.CapsuleGeometry(0.028, 0.16, 6, 12), lam('#fbfaf5'), 0, 0.1, 0, ear);
      o.scale.z = 0.55;
      const inner = mesh(new THREE.CapsuleGeometry(0.016, 0.13, 6, 10), lam('#ffb3c1'), 0, 0.1, -0.011, ear);
      inner.scale.z = 0.4;
    }
  },
  hat_cap(g) {
    const blue = lam('#2f6fd6');
    const crown = mesh(new THREE.SphereGeometry(HR * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), blue, 0, 0.012, 0, g);
    crown.scale.y = 0.92;
    const brim = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24, 1, false, Math.PI / 2, Math.PI), lam('#f6f5f1'), 0, 0.03, -0.1, g);
    brim.scale.set(1, 1, 1.05);
    brim.rotation.x = -0.12;
    mesh(new THREE.SphereGeometry(0.014, 10, 8), lam('#e23b3b'), 0, HR * 0.97 + 0.014, 0, g);
  },
  hat_chef(g) {
    const cream = lam('#ffffff');
    mesh(new THREE.CylinderGeometry(0.135, 0.13, 0.07, 28), cream, 0, 0.115, 0, g);
    const puffs = [[0, 0.21, 0, 0.11], [0.07, 0.19, 0.02, 0.07], [-0.07, 0.19, 0.02, 0.07], [0, 0.19, -0.07, 0.07], [0, 0.19, 0.07, 0.07]];
    for (const [x, y, z, r] of puffs) mesh(new THREE.SphereGeometry(r, 16, 12), cream, x, y, z, g);
  },
  hat_afro(g) {
    const brown = lam('#3b2416', { flatShading: true });
    const r = rng(9);
    for (let i = 0; i < 46; i++) {
      // 앞 얼굴쪽(-z 아래)은 비우고 위·옆·뒤에 둥글게
      const th = r() * Math.PI * 2, ph = r() * 1.45;
      const x = Math.sin(ph) * Math.sin(th), y = Math.cos(ph), z = Math.sin(ph) * Math.cos(th);
      if (z < -0.35 && y < 0.55) continue;
      const rr = 0.18;
      mesh(new THREE.IcosahedronGeometry(0.055 + r() * 0.02, 0), brown, x * rr, y * rr * 0.95 + 0.02, z * rr + 0.01, g);
    }
  },
  hat_crown(g) {
    const gold = lam('#f2c230', { emissive: '#5a3c00', emissiveIntensity: 0.25, flatShading: true });
    const crown = new THREE.Group();
    crown.position.y = 0.1;
    g.add(crown);
    mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.05, 20, 1, true), lam('#f2c230', { side: THREE.DoubleSide, emissive: '#5a3c00', emissiveIntensity: 0.25 }), 0, 0.025, 0, crown);
    const gems = ['#e23b3b', '#2f6fd6', '#3fbf5f'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI;
      const sp = mesh(new THREE.ConeGeometry(0.022, 0.06, 4), gold, Math.sin(a) * 0.085, 0.078, Math.cos(a) * 0.085, crown);
      sp.rotation.y = a;
      mesh(new THREE.SphereGeometry(0.008, 8, 6), gold, Math.sin(a) * 0.085, 0.112, Math.cos(a) * 0.085, crown);
      mesh(new THREE.OctahedronGeometry(0.012), lam(gems[i % 3], { emissive: gems[i % 3], emissiveIntensity: 0.3 }), Math.sin(a) * 0.091, 0.026, Math.cos(a) * 0.091, crown);
    }
  },
};

/* ───────────── 탁구채 (판 가운데 기준, 판의 면 = ±z, 손잡이 = 아래) ───────────── */
const BLADE_R = 0.078;
function rubberPaddle(faceMat, sideMat, backColor = '#222') {
  const g = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.025, 0.1, 0.02), lam('#c99560'), 0, -0.1, 0, g);
  const blade = mesh(new THREE.CylinderGeometry(BLADE_R, BLADE_R, 0.012, 32), [sideMat, faceMat, lam(backColor)], 0, 0, 0, g);
  blade.rotation.x = Math.PI / 2;
  return g;
}
const solid = (color) => () => { const m = lam(color); return rubberPaddle(m, m); };
function faceTex(draw) {
  const t = canvasTex(256, 256, draw);
  t.center.set(0.5, 0.5);
  return t;
}
function extrudeShape(shape, depth, mats) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 16 });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mats);
}

const PADDLES = {
  paddle_basic: solid('#e0333c'),
  paddle_blue: solid('#2f6fd6'),
  paddle_purple: solid('#8a4fd8'),
  paddle_dots() {
    const t = faceTex((c, w, h) => {
      c.fillStyle = '#ff7eb6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.beginPath(); c.arc(x * 34 + (y % 2) * 17 + 8, y * 34 + 12, 8, 0, Math.PI * 2); c.fill(); }
    });
    return rubberPaddle(lam('#ffffff', { map: t }), lam('#ff7eb6'));
  },
  paddle_rainbow() {
    const cols = ['#c56cf0', '#7a6cff', '#4fb3ff', '#6bd66b', '#ffd93d', '#ff9f43', '#ff5a5a'];
    const t = faceTex((c, w, h) => {
      cols.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, (w / 2) * (1 - i / cols.length), 0, Math.PI * 2); c.fill(); });
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, 12, 0, Math.PI * 2); c.fill();
    });
    return rubberPaddle(lam('#ffffff', { map: t }), lam('#c56cf0'));
  },
  paddle_heart() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    const k = 0.095;
    s.moveTo(0, -k * 0.95);
    s.bezierCurveTo(-k * 1.25, -k * 0.1, -k * 0.75, k * 0.95, 0, k * 0.4);
    s.bezierCurveTo(k * 0.75, k * 0.95, k * 1.25, -k * 0.1, 0, -k * 0.95);
    const h = extrudeShape(s, 0.012, [lam('#ff4f7b'), lam('#e02d5c')]);
    h.position.y = 0.01;
    h.castShadow = true;
    g.add(h);
    mesh(new THREE.BoxGeometry(0.025, 0.09, 0.02), lam('#ffd0dc'), 0, -0.115, 0, g);
    return g;
  },
  paddle_melon() {
    const t = faceTex((c, w, h) => {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#2f8a3a'; c.beginPath(); c.arc(cx, cy, 128, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d9f2b0'; c.beginPath(); c.arc(cx, cy, 116, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff4d5e'; c.beginPath(); c.arc(cx, cy, 104, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2b1d1d';
      const r = rng(4);
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2, d = 25 + r() * 65;
        c.save(); c.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d); c.rotate(a);
        c.beginPath(); c.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); c.fill(); c.restore();
      }
    });
    return rubberPaddle(lam('#ffffff', { map: t }), lam('#2f8a3a'), '#2f8a3a');
  },
  paddle_toast() {
    const g = new THREE.Group();
    const shape = (k) => {
      const s = new THREE.Shape();
      s.moveTo(-0.065 * k, -0.075 * k); s.lineTo(0.065 * k, -0.075 * k); s.lineTo(0.065 * k, 0.025 * k);
      s.bezierCurveTo(0.1 * k, 0.04 * k, 0.095 * k, 0.1 * k, 0, 0.093 * k);
      s.bezierCurveTo(-0.095 * k, 0.1 * k, -0.1 * k, 0.04 * k, -0.065 * k, 0.025 * k);
      s.closePath();
      return s;
    };
    const crust = extrudeShape(shape(1), 0.014, [lam('#b8732e'), lam('#a8652a')]);
    const inner = extrudeShape(shape(0.84), 0.018, [lam('#f6deae'), lam('#f6deae')]);
    inner.position.y = 0.004;
    for (const o of [crust, inner]) { o.position.y += 0.005; o.castShadow = true; g.add(o); }
    mesh(new THREE.BoxGeometry(0.025, 0.08, 0.02), lam('#c99560'), 0, -0.11, 0, g);
    return g;
  },
  paddle_spatula() {
    const g = new THREE.Group();
    const t = faceTex((c, w, h) => {
      c.fillStyle = '#d7dde3'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7b8590';
      for (let i = 0; i < 4; i++) c.fillRect(40 + i * 50, 40, 22, 150);
    });
    const metal = lam('#d7dde3');
    mesh(new THREE.BoxGeometry(0.12, 0.13, 0.006), [metal, metal, metal, metal, lam('#ffffff', { map: t }), lam('#ffffff', { map: t })], 0, 0.01, 0, g);
    mesh(new THREE.BoxGeometry(0.014, 0.06, 0.006), metal, 0, -0.08, 0, g);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 12), lam('#2b2a33'), 0, -0.165, 0, g);
    return g;
  },
  paddle_swatter() {
    const g = new THREE.Group();
    const t = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#3fbf5f'; c.lineWidth = 7;
      for (let i = 0; i <= 12; i++) { const p = 10 + i * 19.6; c.beginPath(); c.moveTo(p, 6); c.lineTo(p, h - 6); c.stroke(); c.beginPath(); c.moveTo(6, p); c.lineTo(w - 6, p); c.stroke(); }
      c.lineWidth = 18; c.strokeRect(9, 9, w - 18, h - 18);
    });
    const plane = mesh(new THREE.PlaneGeometry(0.15, 0.15), lam('#ffffff', { map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), 0, 0.02, 0, g);
    plane.castShadow = true;
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), lam('#3fbf5f'), 0, -0.18, 0, g);
    mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10), lam('#e2f7e6'), 0, -0.28, 0, g);
    return g;
  },
  paddle_pan() {
    const g = new THREE.Group();
    const pan = new THREE.Group();
    pan.rotation.x = Math.PI / 2; // 팬 안쪽이 내 쪽(+z)을 본다
    g.add(pan);
    mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.03, 32, 1, true), lam('#26262b', { side: THREE.DoubleSide }), 0, 0, 0, pan);
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 32), [lam('#26262b'), lam('#45454d'), lam('#1b1b1f')], 0, -0.012, 0, pan);
    mesh(new THREE.TorusGeometry(0.1, 0.004, 6, 32), lam('#3a3a40'), 0, 0.015, 0, pan).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.02, 0.1, 0.012), lam('#2b2a33'), 0, -0.14, 0.0, g);
    mesh(new THREE.BoxGeometry(0.024, 0.09, 0.016), lam('#8a5a32'), 0, -0.225, 0.0, g);
    return g;
  },
};

export function makePaddle(id) {
  return (PADDLES[id] || PADDLES.paddle_basic)();
}

/* ───────────── 캐릭터에 입히기 ───────────── */
// char = makeCharacter()의 결과. look = { top, bottom, shoes, hat, paddle }
export function applyLook(char, look) {
  const torso = char.body.children[0];
  if (!torso.userData.uvFixed) {
    torso.geometry = torso.geometry.clone();
    fixBodyUV(torso.geometry);
    torso.userData.uvFixed = true;
    torso.material = lam('#ffffff');
  }
  if (torso.material.map) torso.material.map.dispose();
  torso.material.map = paintBody(look);
  torso.material.needsUpdate = true;

  if (char.hat) { char.head.remove(char.hat); disposeTree(char.hat); }
  char.hat = new THREE.Group();
  (HATS[look.hat] || (() => {}))(char.hat);
  char.head.add(char.hat);

  char.handle.visible = false;
  char.blade.visible = false;
  if (char.paddle) { char.arm.remove(char.paddle); disposeTree(char.paddle); }
  char.paddle = makePaddle(look.paddle);
  char.paddle.position.set(0, 0.15, -0.4);
  char.arm.add(char.paddle);
}

function disposeTree(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    for (const mt of [].concat(m.material || [])) { if (mt.map) mt.map.dispose(); mt.dispose(); }
  });
}

/* ───────────── 탁구공 + 궤적 ───────────── */
const BALL_R = 0.028;
const BALLS = {
  ball_basic: { color: '#fffaf0', emissive: '#ff9a40', trail: 'ghost' },
  ball_orange: { color: '#ff8a2a', emissive: '#ff5a00', trail: 'ghost', trailColor: '#ffc08a' },
  ball_neon: { color: '#e6ff3a', emissive: '#a0ff00', trail: 'ghost', trailColor: '#f2ffa0' },
  ball_pink: { color: '#ff8fc8', emissive: '#ff3d9a', trail: 'ghost', trailColor: '#ffc4e2' },
  ball_melon: { tex: 'melon', trail: 'ghost', trailColor: '#b8f2a0' },
  ball_eye: { tex: 'eye', trail: 'ghost' },
  ball_star: { color: '#fff6c8', emissive: '#ffcc00', trail: 'star' },
  ball_heart: { color: '#ffd6e6', emissive: '#ff4f8b', trail: 'heart' },
  ball_fire: { color: '#ffe08a', emissive: '#ff6a00', trail: 'fire' },
  ball_rainbow: { color: '#ffffff', emissive: '#ffffff', trail: 'rainbow' },
};
const RAINBOW = ['#ff5a5a', '#ff9f43', '#ffd93d', '#6bd66b', '#4fb3ff', '#7a6cff', '#c56cf0'];

function ballTexture(kind) {
  return canvasTex(256, 128, (c, w, h) => {
    if (kind === 'melon') {
      c.fillStyle = '#7fd36a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2f7a2f';
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        for (let y = 0; y <= h; y += 4) c.lineTo(i * 32 + 10 + Math.sin(y * 0.15) * 5, y);
        for (let y = h; y >= 0; y -= 4) c.lineTo(i * 32 + 22 + Math.sin(y * 0.15) * 5, y);
        c.fill();
      }
    } else {
      // 눈알: u 0.75 = 공의 -z 쪽. 날아가는 방향으로 공을 돌린다
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(230,60,60,0.6)'; c.lineWidth = 2;
      for (let i = 0; i < 10; i++) { c.beginPath(); c.moveTo(i * 26, 0); c.quadraticCurveTo(i * 26 + 10, 30, i * 26 - 4, 50); c.stroke(); }
      c.fillStyle = '#3b8fe0'; c.beginPath(); c.ellipse(w * 0.75, h / 2, 26, 30, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.ellipse(w * 0.75, h / 2, 13, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(w * 0.75 + 6, h / 2 - 7, 5, 0, Math.PI * 2); c.fill();
    }
  });
}

function shapeGeo(kind) {
  const s = new THREE.Shape();
  if (kind === 'heart') {
    const k = 0.02;
    s.moveTo(0, -k * 0.95);
    s.bezierCurveTo(-k * 1.25, -k * 0.1, -k * 0.75, k * 0.95, 0, k * 0.4);
    s.bezierCurveTo(k * 0.75, k * 0.95, k * 1.25, -k * 0.1, 0, -k * 0.95);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.009 : 0.022;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  return new THREE.ShapeGeometry(s);
}

// 공 + 궤적. parent에 붙인다. update(pos, dt, camera)를 매 프레임 부른다.
export function createBallFx(id, parent) {
  const def = BALLS[id] || BALLS.ball_basic;
  const root = new THREE.Group();
  parent.add(root);
  const bm = def.tex
    ? lam('#ffffff', { map: ballTexture(def.tex) })
    : lam(def.color, { emissive: def.emissive, emissiveIntensity: 0.25 });
  const ball = mesh(new THREE.SphereGeometry(BALL_R, 20, 14), bm, 0, 0, 0, root);
  if (id === 'ball_rainbow') ball.material.emissiveIntensity = 0.5;

  const MAX = 240;
  let geo, mat;
  const kind = def.trail;
  if (kind === 'heart' || kind === 'star') {
    geo = shapeGeo(kind);
    mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide });
  } else {
    geo = new THREE.SphereGeometry(1, 10, 8);
    mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: kind === 'ghost' ? 0.3 : 0.85, depthWrite: false, blending: THREE.NormalBlending });
  }
  const inst = new THREE.InstancedMesh(geo, mat, MAX);
  inst.frustumCulled = false;
  inst.count = 0;
  root.add(inst);
  const hist = []; // 최근 위치
  const parts = []; // 파티클 {p, v, life, max, rot, col}
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  const ghostCol = new THREE.Color(def.trailColor || '#ffffff');
  let last = null, spin = 0, fireAcc = 0;

  function update(pos, dt, camera, visible = true) {
    root.visible = visible;
    if (!visible) { hist.length = 0; parts.length = 0; last = null; return; }
    ball.position.copy(pos);
    if (last) {
      const v = pos.clone().sub(last);
      if (id === 'ball_eye' && v.lengthSq() > 1e-8) ball.rotation.set(0, Math.atan2(-v.x, -v.z), 0);
      else { spin += dt * 14; ball.rotation.set(spin, spin * 0.6, 0); }
    }
    hist.unshift(pos.clone());
    if (hist.length > 30) hist.pop();
    let n = 0;
    if (kind === 'ghost') {
      for (let i = 1; i <= 4 && i * 2 < hist.length; i++) {
        const p = hist[i * 2];
        sc.setScalar(BALL_R * (0.86 - i * 0.08));
        m4.compose(p, q.identity(), sc);
        inst.setMatrixAt(n, m4); inst.setColorAt(n, ghostCol); n++;
      }
    } else if (kind === 'rainbow') {
      for (let i = 1; i < hist.length && n < MAX - 7; i++) {
        const k = 1 - i / hist.length;
        for (let j = 0; j < 7; j++) {
          const p = hist[i];
          sc.setScalar(0.0085 * (0.4 + 0.6 * k));
          m4.compose(new THREE.Vector3(p.x, p.y + (3 - j) * 0.0085 * (0.5 + 0.5 * k), p.z), q.identity(), sc);
          inst.setMatrixAt(n, m4); inst.setColorAt(n, col.set(RAINBOW[j])); n++;
        }
      }
    } else {
      // 파티클: 불꽃·하트·별
      const moved = last ? pos.distanceTo(last) : 0;
      fireAcc += dt * 90;
      const emit = kind === 'fire' ? Math.floor(fireAcc) : moved > 0.004 ? (Math.random() < 0.6 ? 1 : 0) : 0;
      fireAcc -= Math.floor(fireAcc);
      for (let i = 0; i < emit; i++) {
        const j = () => (Math.random() - 0.5);
        parts.push({
          p: pos.clone().add(new THREE.Vector3(j() * 0.02, j() * 0.02, j() * 0.02)),
          v: kind === 'fire' ? new THREE.Vector3(j() * 0.15, 0.25 + Math.random() * 0.2, j() * 0.15) : new THREE.Vector3(j() * 0.08, 0.12, j() * 0.08),
          life: 0, max: kind === 'fire' ? 0.32 + Math.random() * 0.15 : 0.7, rot: Math.random() * 6, s: 0.7 + Math.random() * 0.6,
        });
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i];
        pt.life += dt;
        if (pt.life >= pt.max) { parts.splice(i, 1); continue; }
        pt.p.addScaledVector(pt.v, dt);
      }
      while (parts.length > MAX) parts.shift();
      for (const pt of parts) {
        const k = pt.life / pt.max;
        if (kind === 'fire') {
          sc.setScalar(BALL_R * 0.8 * (1 - k * 0.75) * pt.s);
          col.setHSL(0.12 - k * 0.12, 1, 0.58 - k * 0.18);
          m4.compose(pt.p, q.identity(), sc);
        } else {
          sc.setScalar((1 - k * 0.6) * pt.s);
          if (camera) q.copy(camera.quaternion); else q.identity();
          if (kind === 'star') q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pt.rot + pt.life * 4));
          col.set(kind === 'heart' ? (pt.s > 1 ? '#ff4f8b' : '#ff9ec4') : (pt.s > 1 ? '#ffd23d' : '#fff3a0'));
          m4.compose(pt.p, q, sc);
        }
        inst.setMatrixAt(n, m4); inst.setColorAt(n, col); n++;
      }
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    last = pos.clone();
  }
  function dispose() { parent.remove(root); disposeTree(root); }
  return { root, ball, update, dispose };
}
