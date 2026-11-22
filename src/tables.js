// 탁구대 목록 + 모델 (docs/dev/tables.md). 보기만 다르다: 판 크기·높이·네트 높이·판정은 모두 같음
// makeTable(id) → Group (원점 = 바닥 가운데, 판 윗면 = TY). 모르는 id나 'blue'는 지금의 파랑 탁구대
// 움직이는 탁구대(고급·전설): root.userData.tick(t, dt, fx) 매 프레임, root.userData.bounce(p, smash, fx) 공이 판에 튈 때
import * as THREE from 'three';
import { TABLE_L, TABLE_W, HALF_L, HALF_W, TY, NET_H } from './physics.js';
import { rng, canvasTex } from './table-kit.js';
import { RARE } from './tables-rare.js';
import { LEGEND } from './tables-legend.js';

export const TABLES = [
  { id: 'blue', name: '파랑 (기본)', grade: 'default' },
  { id: 'green', name: '클래식 초록', grade: 'common' },
  { id: 'black', name: '검정', grade: 'common' },
  { id: 'wood', name: '원목', grade: 'common' },
  { id: 'cherry', name: '체리 분홍', grade: 'common' },
  { id: 'purple', name: '보라', grade: 'common' },
  { id: 'camo', name: '위장 무늬', grade: 'common' },
  { id: 'office', name: '사무실 책상', grade: 'rare', build: 'office' },
  { id: 'parcel', name: '택배 상자', grade: 'rare', build: 'parcel' },
  { id: 'bed', name: '침대', grade: 'rare', build: 'bed' },
  { id: 'go', name: '바둑판', grade: 'rare', build: 'goBoard' },
  { id: 'pyeongsang', name: '시골 평상', grade: 'rare', build: 'pyeongsang' },
  { id: 'toast', name: '커다란 식빵', grade: 'rare', build: 'toast' },
  { id: 'book', name: '펼친 교과서', grade: 'rare', build: 'textbook' },
  { id: 'arcade', name: '오락실 게임기', grade: 'legend', build: 'arcade' },
  { id: 'carpet', name: '마법 양탄자', grade: 'legend', build: 'carpet' },
  { id: 'turtle', name: '거대 거북이', grade: 'legend', build: 'turtle' },
  { id: 'cake', name: '생일 케이크', grade: 'legend', build: 'cake' },
  { id: 'breadcat', name: '식빵 고양이', grade: 'legend', build: 'breadCat' },
  { id: 'cloud', name: '솜사탕 구름', grade: 'legend', build: 'cloud' },
];
export const TABLE = Object.fromEntries(TABLES.map((t) => [t.id, t]));

// 판(top)·옆테(edge)·다리(leg)·선(line)·네트 띠(tape) 색, 무늬(tex)
const LOOK = {
  blue: { top: '#2a62b0', edge: '#2a62b0', leg: '#2b2f3a', line: '#ffffff' },
  green: { top: '#1f6a48', edge: '#1a5a3d', leg: '#2a2e2a', line: '#ffffff' },
  black: { top: '#1d2027', edge: '#2b2f38', leg: '#33373f', line: '#ffffff' }, // 다리도 어둡게 (은색 다리는 어두운 배경에서 튀어 보였음)
  wood: { top: '#ffffff', tex: 'wood', edge: '#6e4527', leg: '#5a3820', line: '#fff6e6' },
  cherry: { top: '#b52d63', edge: '#9a2453', leg: '#3a2430', line: '#ffffff' },
  purple: { top: '#553a95', edge: '#47307e', leg: '#2a2438', line: '#ffffff' },
  camo: { top: '#ffffff', tex: 'camo', edge: '#3c4630', leg: '#2e3326', line: '#f2f0dc' },
};

// 원목: 판 길이 방향(캔버스 세로)으로 나뭇결. 흰 공·주황 공이 잘 보이게 중간보다 조금 어두운 호두색
function woodTex() {
  return canvasTex('wood', 512, 1024, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = '#7a4a26'; g.fillRect(0, 0, w, h);
    const planks = 6, pw = w / planks;
    for (let i = 0; i < planks; i++) { // 널빤지마다 색을 살짝 다르게
      const l = 0.9 + r() * 0.2;
      g.fillStyle = `rgb(${Math.round(122 * l)},${Math.round(74 * l)},${Math.round(38 * l)})`;
      g.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 26; k++) { // 결: 살짝 구불거리는 세로줄
        const x0 = i * pw + r() * pw, a = 1 + r() * 3, f = 0.004 + r() * 0.01, ph = r() * 6;
        g.strokeStyle = r() < 0.5 ? 'rgba(60,32,14,0.35)' : 'rgba(170,110,60,0.25)';
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y * f + ph) * a; y ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      if (r() < 0.7) { // 옹이
        const cx = i * pw + pw * (0.3 + r() * 0.4), cy = r() * h;
        for (let k = 5; k > 0; k--) {
          g.strokeStyle = `rgba(55,28,10,${0.12 + k * 0.05})`; g.lineWidth = 1.2;
          g.beginPath(); g.ellipse(cx, cy, k * 2.2, k * 6, 0, 0, Math.PI * 2); g.stroke();
        }
      }
      g.fillStyle = 'rgba(40,20,8,0.55)'; g.fillRect(i * pw, 0, 1.5, h); // 널빤지 틈
    }
  });
}

// 위장 무늬: 어두운 국방색 위에 갈색·검정·풀색 얼룩 (연두 공이 묻히지 않게 전체를 어둡게)
function camoTex() {
  return canvasTex('camo', 512, 1024, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#4a5636'; g.fillRect(0, 0, w, h);
    const blob = (color, n, size) => {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const cx = r() * w, cy = r() * h, s = size * (0.6 + r() * 0.8);
        g.beginPath();
        const pts = 9;
        for (let k = 0; k <= pts; k++) {
          const a = (k / pts) * Math.PI * 2, rr = s * (0.6 + r() * 0.5);
          const x = cx + Math.cos(a) * rr * 1.3, y = cy + Math.sin(a) * rr;
          k ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath(); g.fill();
      }
    };
    blob('#6b5a3a', 34, 46);
    blob('#2c3322', 30, 38);
    blob('#5e6e40', 26, 30);
    blob('#1f241a', 18, 20);
  });
}

const mat = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

let netTex = null;
function netTexture() {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(30,30,40,0.9)';
  g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); }
  for (let y = 0; y <= 32; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  netTex = new THREE.CanvasTexture(c);
  netTex.colorSpace = THREE.SRGBColorSpace;
  return netTex;
}

export function makeTable(id) {
  const build = TABLE[id]?.build;
  if (build) {
    const root = new THREE.Group();
    root.name = 'table:' + id;
    Object.assign(root.userData, (RARE[build] || LEGEND[build])(root));
    return root;
  }
  const L = LOOK[id] || LOOK.blue;
  const root = new THREE.Group();
  root.name = 'table:' + (LOOK[id] ? id : 'blue');
  const add = (geo, m, x, y, z, shadow = true) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  // 판: 윗면만 무늬, 옆면은 옆테 색
  const map = L.tex === 'wood' ? woodTex() : L.tex === 'camo' ? camoTex() : null;
  const topMat = map ? new THREE.MeshLambertMaterial({ color: L.top, map }) : mat(L.top);
  const edgeMat = mat(L.edge);
  const top = add(new THREE.BoxGeometry(TABLE_W, 0.035, TABLE_L), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat], 0, TY - 0.0175, 0);
  top.userData.part = 'top';
  // 선
  const lineMat = new THREE.MeshBasicMaterial({ color: L.line });
  const line = (w, d, x, z) => add(new THREE.BoxGeometry(w, 0.002, d), lineMat, x, TY + 0.001, z, false);
  line(0.02, TABLE_L, -HALF_W + 0.01, 0);
  line(0.02, TABLE_L, HALF_W - 0.01, 0);
  line(TABLE_W, 0.02, 0, -HALF_L + 0.01);
  line(TABLE_W, 0.02, 0, HALF_L - 0.01);
  line(0.005, TABLE_L, 0, 0);
  // 다리 + 밑판
  const legMat = L.legShine ? new THREE.MeshPhongMaterial({ color: L.leg, shininess: 60, specular: '#ffffff' }) : mat(L.leg);
  for (const x of [-0.6, 0.6]) for (const z of [-1.1, -0.3, 0.3, 1.1]) add(new THREE.BoxGeometry(0.05, TY - 0.035, 0.05), legMat, x, (TY - 0.035) / 2, z);
  add(new THREE.BoxGeometry(TABLE_W - 0.1, 0.06, TABLE_L - 0.1), legMat, 0, TY - 0.07, 0, false);
  // 네트
  add(new THREE.PlaneGeometry(1.83, NET_H), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }), 0, TY + NET_H / 2, 0, false);
  add(new THREE.BoxGeometry(1.83, 0.015, 0.006), mat('#ffffff'), 0, TY + NET_H, 0, false);
  for (const x of [-0.915, 0.915]) add(new THREE.CylinderGeometry(0.012, 0.012, NET_H + 0.02, 6), legMat, x, TY + NET_H / 2, 0);
  return root;
}
