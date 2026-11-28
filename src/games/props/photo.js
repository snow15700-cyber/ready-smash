// 📸 포토존 (plaza.md 10장 ③) — 포즈 · 떠 있는 손 · 사진 틀 그리기. 시안(photo.html)에서 고르고 실제 광장에서 그대로 씀. 모두 '보기만'.
// 캐릭터(makeCharacter)는 팔이 없고 탁구채가 몸 옆에 떠 있으므로, 포즈 때만 탁구채 반대쪽(왼쪽, -x)에 흰 손 하나가 떠서 나온다.
// 캐릭터 앞 = -z (사진 찍을 땐 캐릭터를 카메라 쪽으로 돌려 세움)
import * as THREE from 'three';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const add = (p, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

// ── 떠 있는 손 (흰 장갑 느낌, 몸과 같은 흰색). kind: 'v' 브이 · 'open' 편 손 · 'fist' 주먹 · 'point' 검지
export function makeHand(kind = 'open') {
  const g = new THREE.Group(), m = lam(0xf6f5f1);
  const palm = add(g, new THREE.SphereGeometry(0.052, 16, 12), m); palm.scale.set(1, 1.05, 0.62);
  const finger = (x, ang, len = 0.055) => { const f = add(g, new THREE.CapsuleGeometry(0.016, len, 4, 8), m, x, 0.05 + len / 2 - 0.01, 0); f.rotation.z = ang; f.position.x += -Math.sin(ang) * len * 0.4; return f; };
  if (kind === 'v') { finger(-0.018, 0.22, 0.07); finger(0.018, -0.22, 0.07); }
  else if (kind === 'open') { for (let i = 0; i < 4; i++) finger(-0.03 + i * 0.02, 0.18 - i * 0.12, 0.045 + (i === 1 || i === 2 ? 0.01 : 0)); }
  else if (kind === 'point') finger(0, 0, 0.07);
  if (kind !== 'fist') { const th = add(g, new THREE.CapsuleGeometry(0.016, 0.03, 4, 8), m, 0.05, 0.01, 0); th.rotation.z = -0.9; }
  else { const th = add(g, new THREE.CapsuleGeometry(0.017, 0.03, 4, 8), m, 0.02, 0.015, -0.03); th.rotation.set(1.3, 0, 0.4); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 하트 (볼하트) · 반짝이 (번쩍 들기)
function heartGeo(s) {
  const h = new THREE.Shape();
  h.moveTo(0, -0.5 * s);
  h.bezierCurveTo(-0.15 * s, -0.33 * s, -0.55 * s, -0.12 * s, -0.5 * s, 0.18 * s);
  h.bezierCurveTo(-0.45 * s, 0.48 * s, -0.08 * s, 0.5 * s, 0, 0.24 * s);
  h.bezierCurveTo(0.08 * s, 0.5 * s, 0.45 * s, 0.48 * s, 0.5 * s, 0.18 * s);
  h.bezierCurveTo(0.55 * s, -0.12 * s, 0.15 * s, -0.33 * s, 0, -0.5 * s);
  const geo = new THREE.ExtrudeGeometry(h, { depth: 0.02 * s * 5, bevelEnabled: true, bevelSize: 0.04 * s, bevelThickness: 0.04 * s, bevelSegments: 3, curveSegments: 16 });
  geo.center();
  return geo;
}
function starGeo(r) { const g = new THREE.OctahedronGeometry(r, 0); g.scale(1, 1.6, 0.35); return g; }

// ── 포즈 6가지 (사진 찍을 때 3개 중 고르기 — 시안에서 사용자가 3개를 고름)
// 각 포즈: hand = 손 모양(없으면 손 안 나옴), set(c, k, t) = k(0 서 있기 → 1 포즈)만큼 몸·탁구채·손을 움직임
// c = { char, hand, fx } — 몸(body) 기울기·크기, 그룹 높이(점프), 탁구채(arm) 자리·회전, 손 자리·회전
export const POSES = {
  v: { name: '✌️ 브이', emo: '✌️', hand: 'v',
    set(c, k, t) {
      const b = c.char.body;
      b.rotation.z = 0.13 * k; b.rotation.x = -0.04 * k;
      arm(c, [0.3, 0.78, 0], [0, 0, -0.25 * k]);
      hand(c, [lerp(-0.3, -0.22, k), lerp(0.7, 1.13, k), lerp(0, -0.13, k)], [0, 0, 0.25 + Math.sin(t * 6) * 0.04 * k]);
    } },
  smash: { name: '🏓 스매시 자세', emo: '🏓', hand: 'point',
    set(c, k, t) {
      const b = c.char.body;
      b.rotation.y = -0.45 * k; b.rotation.z = -0.08 * k; b.rotation.x = -0.06 * k;
      c.char.group.position.y = 0.04 * k;
      arm(c, [lerp(0.3, 0.3, k), lerp(0.78, 1.28, k), lerp(0, 0.08, k)], [0.35 * k, 0, -1.05 * k]);
      hand(c, [lerp(-0.3, -0.3, k), lerp(0.7, 1.02, k), lerp(0, -0.2, k)], [-1.25 * k, 0, 0.5 * k]);
    } },
  jump: { name: '🙌 만세 점프', emo: '🙌', hand: 'open',
    set(c, k, t) {
      const b = c.char.body;
      c.char.group.position.y = 0.32 * k;
      b.scale.set(1 - 0.04 * k, 1 + 0.06 * k, 1 - 0.04 * k);
      arm(c, [lerp(0.3, 0.33, k), lerp(0.78, 1.36, k), 0], [0, 0, -0.35 * k]);
      hand(c, [lerp(-0.3, -0.34, k), lerp(0.7, 1.4, k), 0], [0, 0, 0.35 * k + Math.sin(t * 9) * 0.1 * k]);
    } },
  heart: { name: '💖 볼하트', emo: '💖', hand: 'fist',
    set(c, k, t) {
      const b = c.char.body;
      b.rotation.z = -0.16 * k; b.rotation.x = -0.03 * k;
      arm(c, [0.3, 0.76, 0], [0, 0, -0.2 * k]);
      hand(c, [lerp(-0.3, -0.13, k), lerp(0.7, 1.08, k), lerp(0, -0.15, k)], [0, 0, -0.5 * k]);
      if (!c.fx) { c.fx = add(c.char.body, heartGeo(0.13), lam(0xff5c8a, { emissive: 0xff2a6a, emissiveIntensity: 0.25 }), 0, 1.4, -0.12); c.fx.userData.photoFx = true; }
      const beat = 1 + Math.max(0, Math.sin(t * 7)) * 0.12;
      c.fx.scale.setScalar(Math.max(0.001, ease(Math.min(1, k * 1.3)) * beat)); c.fx.position.set(-0.24 - 0.06 * k, 1.32 + 0.1 * k, -0.12); c.fx.rotation.z = -0.25 + Math.sin(t * 2) * 0.08;
      c.fx.visible = k > 0.02;
    } },
  trophy: { name: '🏆 번쩍 들기', emo: '🏆', hand: 'open',
    set(c, k, t) {
      const b = c.char.body;
      b.rotation.x = 0.06 * k; // 가슴 펴기 (살짝 뒤로)
      c.char.group.position.y = 0.03 * k * (1 + Math.sin(t * 5));
      arm(c, [lerp(0.3, 0.08, k), lerp(0.78, 1.42, k), lerp(0, 0.02, k)], [0, 0, -0.12 * k]);
      hand(c, [lerp(-0.3, -0.08, k), lerp(0.7, 1.43, k), lerp(0, 0.01, k)], [0, 0, 0.1 * k]);
      if (!c.fx) {
        c.fx = new THREE.Group(); c.fx.userData.photoFx = true; c.char.body.add(c.fx);
        const gold = lam(0xffd23d, { emissive: 0xffb000, emissiveIntensity: 0.45 });
        for (let i = 0; i < 5; i++) add(c.fx, starGeo(0.035 + (i % 2) * 0.015), gold);
      }
      c.fx.visible = k > 0.02;
      c.fx.children.forEach((s, i) => {
        const a = (i / 5) * Math.PI * 2 + t * 1.2;
        s.position.set(Math.cos(a) * 0.28, 1.72 + Math.sin(a * 2 + i) * 0.05, Math.sin(a) * 0.1);
        s.rotation.y = t * 3 + i; s.scale.setScalar(k * (0.7 + 0.3 * Math.sin(t * 6 + i * 2)));
      });
    } },
  bow: { name: '🙇 꾸벅 인사', emo: '🙇', hand: 'open',
    set(c, k, t) {
      const b = c.char.body;
      b.rotation.x = -0.5 * k;
      arm(c, [lerp(0.3, 0.24, k), lerp(0.78, 0.55, k), lerp(0, -0.02, k)], [0, 0, -0.05 * k]);
      hand(c, [lerp(-0.3, -0.2, k), lerp(0.7, 0.55, k), lerp(0, -0.12, k)], [1.2 * k, 0, -0.1 * k]);
    } },
};
export const POSE_IDS = Object.keys(POSES);

// 탁구채(arm 그룹) — 사진 찍을 땐 빨간 면이 앞(카메라)으로 오게 arm을 반 바퀴 돌리고 부품을 반대쪽(+z)에 둠
function arm(c, pos, rot) {
  const a = c.char.arm;
  a.position.set(...pos); a.rotation.set(rot[0], Math.PI + rot[1], -rot[2]);
}
function hand(c, pos, rot) { c.hand.position.set(...pos); c.hand.rotation.set(...rot); }

// 캐릭터에 포즈를 걸기. 돌려줌: { tick(t, k), clear() } — k = 0~1 (부르는 쪽이 준비 → 잠깐 멈춤 → 돌아오기 시간표로 정함)
export function posePhoto(char, id) {
  const p = POSES[id];
  const c = { char, hand: makeHand(p.hand), fx: null };
  char.body.add(c.hand);
  const parts = char.arm.children, z0 = parts.map((o) => o.position.z), arm0 = char.arm.position.clone();
  for (const o of parts) o.position.z = 0.17; // 반 바퀴 돌린 arm 안에서 앞쪽
  const reset = () => { const b = char.body; b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); char.group.position.y = 0; };
  const tick = (t, k) => {
    reset();
    const kk = ease(Math.max(0, Math.min(1, k)));
    c.hand.visible = k > 0.01;
    c.hand.scale.setScalar(Math.min(1, k * 2.5) || 0.001);
    p.set(c, kk, t);
  };
  const clear = () => {
    reset();
    char.body.remove(c.hand);
    if (c.fx) char.body.remove(c.fx);
    parts.forEach((o, i) => (o.position.z = z0[i]));
    char.arm.position.copy(arm0); char.arm.rotation.set(0, 0, 0);
  };
  return { tick, clear, id };
}
// 시간표: 준비(살짝 움츠림) 0.35초 → 포즈 0.45초 → 찰칵까지 멈춤 → 돌아오기 0.5초. 돌려줌: { k, dip } — dip은 준비 때 몸 낮추기(0~1)
export const SHOT = { ready: 0.35, go: 0.45, back: 0.5 };
export function poseCurve(age, hold) {
  const { ready, go, back } = SHOT;
  if (age < 0) return { k: 0, dip: 0 };
  if (age < ready) return { k: 0, dip: Math.sin((age / ready) * Math.PI) };
  if (age < ready + go) return { k: (age - ready) / go, dip: 0 };
  if (age < ready + go + hold) return { k: 1, dip: 0 };
  return { k: Math.max(0, 1 - (age - ready - go - hold) / back), dip: 0 };
}

// ── 사진 틀 (2D 캔버스에 그림 → PNG 파일로 저장). shots = 찍은 사진 캔버스 배열(4:3), info = { date, place, names[] }
const RED = '#e0333c', BLUE = '#2f6fe0', INK = '#23304a', CREAM = '#fffaf0';
function cover(x, img, dx, dy, dw, dh, r = 0) {
  const s = Math.max(dw / img.width, dh / img.height), sw = dw / s, sh = dh / s;
  x.save(); if (r) { x.beginPath(); x.roundRect(dx, dy, dw, dh, r); x.clip(); }
  x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, dx, dy, dw, dh); x.restore();
}
function ballSticker(x, cx, cy, r, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = r * 0.3; x.shadowOffsetY = r * 0.08;
  x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); x.shadowColor = 'transparent';
  x.strokeStyle = '#ff8a3d'; x.lineWidth = r * 0.12; x.beginPath(); x.arc(0, -r * 1.6, r * 1.75, Math.PI * 0.34, Math.PI * 0.66); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, Math.PI * 2); x.fill();
  x.restore();
}
function paddleSticker(x, cx, cy, r, rot = 0) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = r * 0.25; x.shadowOffsetY = r * 0.06;
  x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, r * 1.12, 0, Math.PI * 2); x.fill(); x.beginPath(); x.roundRect(-r * 0.36, r * 0.7, r * 0.72, r * 1.3, r * 0.2); x.fill();
  x.shadowColor = 'transparent';
  x.fillStyle = '#c99560'; x.beginPath(); x.roundRect(-r * 0.22, r * 0.75, r * 0.44, r * 1.1, r * 0.12); x.fill();
  x.fillStyle = RED; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
  x.restore();
}
function sparkle(x, cx, cy, r, col = '#ffd23d') {
  x.fillStyle = col; x.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.3 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}

export const FRAMES = {
  // 폴라로이드: 흰 테두리 + 아래 넓은 여백에 손글씨 느낌 글
  polaroid: { name: '폴라로이드', shots: 1, w: 1200, h: 1420,
    draw(x, shots, info) {
      x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 1420);
      cover(x, shots[0], 60, 60, 1080, 1060, 6);
      x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; x.strokeRect(60, 60, 1080, 1060);
      x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '78px Jua, sans-serif'; x.fillText('준비하시고, 스매시! 📸', 600, 1220);
      x.font = '40px Jua, sans-serif'; x.fillStyle = '#7a869a'; x.fillText(`${info.date} · ${info.place}`, 600, 1305);
      x.font = '38px Jua, sans-serif'; x.fillStyle = RED; x.fillText(info.names.join(' · '), 600, 1365);
    } },
  // 탁구 색 테두리: 빨간 두꺼운 틀 + 파란 안쪽 선 + 탁구공·탁구채 스티커 + 왼쪽 위 이름 알약 + 오른쪽 아래 날짜 도장
  sticker: { name: '탁구 스티커 틀', shots: 1, w: 1440, h: 1080,
    draw(x, shots, info) {
      x.fillStyle = RED; x.beginPath(); x.roundRect(0, 0, 1440, 1080, 60); x.fill();
      x.fillStyle = 'rgba(255,255,255,.1)'; for (let i = 0; i < 60; i++) { x.beginPath(); x.arc((i * 263) % 1440, (i * 151) % 1080, 9, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#fff'; x.beginPath(); x.roundRect(48, 48, 1344, 984, 40); x.fill();
      cover(x, shots[0], 62, 62, 1316, 956, 30);
      x.strokeStyle = BLUE; x.lineWidth = 8; x.beginPath(); x.roundRect(62, 62, 1316, 956, 30); x.stroke();
      // 왼쪽 위 알약
      x.font = '54px Jua, sans-serif'; const tw = x.measureText('🏓 준비하시고, 스매시!').width + 70;
      x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.roundRect(100, 96, tw, 88, 44); x.fill();
      x.fillStyle = RED; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('🏓 준비하시고, 스매시!', 135, 142);
      // 오른쪽 아래 날짜 도장
      x.save(); x.translate(1210, 900); x.rotate(-0.12);
      x.fillStyle = 'rgba(47,111,224,.92)'; x.beginPath(); x.roundRect(-150, -62, 300, 124, 24); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '44px Jua, sans-serif'; x.fillText(info.date, 0, -16); x.font = '30px Jua, sans-serif'; x.fillText(info.place, 0, 30);
      x.restore();
      // 이름 (아래 가운데)
      x.font = '42px Jua, sans-serif'; const nm = info.names.join(' · '), nw = x.measureText(nm).width + 60;
      x.fillStyle = 'rgba(43,42,51,.6)'; x.beginPath(); x.roundRect(720 - nw / 2, 950, nw, 70, 35); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(nm, 720, 986);
      ballSticker(x, 1350, 95, 62, 0.3); ballSticker(x, 70, 1010, 46, -0.5); paddleSticker(x, 1360, 560, 58, 0.5);
      sparkle(x, 1270, 190, 30); sparkle(x, 150, 880, 22, '#fff'); sparkle(x, 1255, 120, 16, '#fff');
    } },
  // 네컷: 세로로 긴 띠에 사진 4장(3·2·1 하고 4번 찍음) + 아래 로고 — 크림색 바탕
  four: { name: '네컷 사진', shots: 4, w: 720, h: 2160,
    draw(x, shots, info) {
      x.fillStyle = CREAM; x.fillRect(0, 0, 720, 2160);
      x.fillStyle = RED; x.fillRect(0, 0, 720, 14); x.fillRect(0, 2146, 720, 14);
      for (let i = 0; i < 4; i++) cover(x, shots[i % shots.length], 44, 44 + i * 470, 632, 440, 14);
      x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '58px Jua, sans-serif'; x.fillText('준비하시고, 스매시!', 360, 1975);
      x.font = '30px Jua, sans-serif'; x.fillStyle = '#7a869a'; x.fillText(`${info.date} · ${info.place}`, 360, 2040);
      x.fillStyle = RED; x.fillText(info.names.join(' · '), 360, 2090);
      ballSticker(x, 90, 1975, 30, 0.2); paddleSticker(x, 632, 1965, 30, 0.4);
    } },
};
export const FRAME_IDS = Object.keys(FRAMES);
export function drawFrame(id, shots, info) {
  const f = FRAMES[id], c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  f.draw(c.getContext('2d'), shots, info);
  return c;
}
