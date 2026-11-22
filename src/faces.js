import * as THREE from 'three';

/* ───────────── 얼굴 꾸미기 (한 개씩) ─────────────
   사용자 확정: 얼굴 아이템은 **얼굴에 직접 그리는 것만**(눈·표정·볼터치·콧수염). 안경·안대처럼 얼굴 위에 쓰는 물건은 X.
   기본 = 얼굴 없음. 얼굴을 덮는 몸(병아리)·머리(투구·가면)와 같이 입으면 숨긴다(scene.js setFace).
   만드는 법: 머리 앞면을 덮는 얇은 구 조각(머리 반지름 0.16보다 살짝 큼)에 투명 그림(512×512)을 붙인다.
   그림 좌표: 가운데(256, 256) = 머리 앞 한가운데(머리 중심 높이). 1라디안 = 640px. 그림 왼쪽 = 정면에서 볼 때 왼쪽.
   눈 높이 = 그림 y 215 (머리 중심보다 살짝 위), 입 = y 315 쯤. 머리 아이템 앞 가장자리는 y 0.06(그림 y 160) 위라 눈이 안 가려진다.
   고급 이상은 눈 깜빡임(그림 두 장을 바꿔 끼움), 하트·별·소용돌이는 두근·반짝·빙글 */

const S = 512, SPAN = 0.8; // 그림 한 변 = 0.8라디안
const R = 0.1618; // 머리(0.16, 20×14 조각)의 꼭짓점보다 살짝 밖
const INK = '#2b2522';
const EL = [158, 215], ER = [354, 215]; // 정면에서 본 왼쪽 눈 · 오른쪽 눈
const MOUTH = [256, 312];

function canvas(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const circle = (g, x, y, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const stroke = (g, w, color = INK) => { g.lineWidth = w; g.strokeStyle = color; g.stroke(); };
function line(g, pts, w, color = INK) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); stroke(g, w, color); }
// 감은 눈 (깜빡임): 아래로 볼록한 짧은 선
const shut = (g, [x, y], w = 30) => { g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y + 12, x + w, y); stroke(g, 9); };
// 웃는 눈 ^
const happy = (g, [x, y], w = 28) => { g.beginPath(); g.moveTo(x - w, y + 10); g.quadraticCurveTo(x, y - 26, x + w, y + 10); stroke(g, 10); };
// 작은 웃는 입
const smile = (g, w = 22, y = MOUTH[1]) => { g.beginPath(); g.moveTo(256 - w, y - 4); g.quadraticCurveTo(256, y + w * 0.9, 256 + w, y - 4); stroke(g, 8); };
// 반짝이 (흰 점)
const shine = (g, x, y, r) => circle(g, x, y, r, '#ffffff');
function heart(g, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.85);
  g.bezierCurveTo(x - s * 1.3, y, x - s * 0.9, y - s * 1.05, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 0.9, y - s * 1.05, x + s * 1.3, y, x, y + s * 0.85);
  g.fill();
}
function star(g, x, y, R1, R2, color, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5, r = i % 2 ? R2 : R1; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
// 볼터치
function blush(g, a = 0.55) {
  for (const x of [118, 394]) {
    const gr = g.createRadialGradient(x, 280, 4, x, 280, 40);
    gr.addColorStop(0, `rgba(255,120,150,${a})`); gr.addColorStop(1, 'rgba(255,120,150,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, 280, 44, 28, 0, 0, Math.PI * 2); g.fill();
  }
}

/* 얼굴마다 그리기: draw(g, f) — f = 그림 번호(0 = 기본, 1 = 깜빡임 또는 두 번째 장면). frames: 그림 장 수, anim: 'blink' | 'pulse' */
const FACES = {
  // 점 눈: 동글 까만 눈 + 작은 웃는 입
  dots: { frames: 1, draw(g) { for (const e of [EL, ER]) circle(g, e[0], e[1], 17, INK); smile(g); } },
  // 부릅뜬 눈: 흰자 + 작은 눈동자 + 화난 눈썹 + 꾹 다문 입
  glare: {
    frames: 1,
    draw(g) {
      for (const [x, y] of [EL, ER]) {
        g.beginPath(); g.ellipse(x, y + 4, 34, 28, 0, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); stroke(g, 7);
        circle(g, x, y + 6, 10, INK);
      }
      line(g, [[108, 158], [200, 186]], 13);
      line(g, [[404, 158], [312, 186]], 13);
      g.beginPath(); g.moveTo(222, 322); g.quadraticCurveTo(256, 308, 290, 322); stroke(g, 8);
    },
  },
  // 졸린 눈: 반쯤 감긴 눈꺼풀 + 작은 입 (하품)
  sleepy: {
    frames: 1,
    draw(g) {
      for (const [x, y] of [EL, ER]) {
        g.beginPath(); g.arc(x, y + 2, 22, 0, Math.PI); g.closePath(); g.fillStyle = INK; g.fill();
        line(g, [[x - 34, y + 2], [x + 34, y + 2]], 9);
      }
      g.beginPath(); g.ellipse(256, MOUTH[1] + 6, 11, 14, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    },
  },
  // 웃는 눈 ^^ + 활짝 웃는 입
  happy: {
    frames: 1,
    draw(g) {
      for (const e of [EL, ER]) happy(g, e);
      g.beginPath(); g.moveTo(222, 300); g.quadraticCurveTo(256, 300, 290, 300); g.quadraticCurveTo(286, 346, 256, 346); g.quadraticCurveTo(226, 346, 222, 300);
      g.fillStyle = INK; g.fill();
      g.beginPath(); g.ellipse(256, 334, 16, 9, 0, 0, Math.PI * 2); g.fillStyle = '#ff7a8a'; g.fill();
    },
  },
  // 윙크: 왼쪽은 점 눈, 오른쪽은 찡긋 + 혀 내민 입
  wink: {
    frames: 1,
    draw(g) {
      circle(g, EL[0], EL[1], 17, INK);
      line(g, [[ER[0] - 26, ER[1] - 16], [ER[0] + 14, ER[1]], [ER[0] - 26, ER[1] + 16]], 10);
      smile(g, 26);
      g.beginPath(); g.ellipse(266, MOUTH[1] + 16, 11, 13, 0.2, 0, Math.PI * 2); g.fillStyle = '#ff7a8a'; g.fill();
      line(g, [[266, MOUTH[1] + 8], [268, MOUTH[1] + 22]], 3, '#d9566a');
    },
  },

  // ── 고급 ──
  // 만화 초롱초롱 눈: 큰 눈 + 아래 보랏빛 + 반짝이 셋 + 속눈썹
  sparkle: {
    frames: 2, anim: 'blink',
    draw(g, f) {
      if (f) { for (const e of [EL, ER]) shut(g, e, 34); smile(g, 16); return; }
      for (const [x, y] of [EL, ER]) {
        const gr = g.createLinearGradient(0, y - 46, 0, y + 46);
        gr.addColorStop(0, '#1d1830'); gr.addColorStop(0.55, '#2c2350'); gr.addColorStop(1, '#7d5ccf');
        g.beginPath(); g.ellipse(x, y, 34, 44, 0, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
        shine(g, x + 11, y - 16, 13); shine(g, x - 12, y + 18, 6); shine(g, x + 16, y + 8, 3.5);
        const out = x < 256 ? -1 : 1;
        line(g, [[x + out * 26, y - 30], [x + out * 44, y - 44]], 6);
        line(g, [[x + out * 32, y - 16], [x + out * 50, y - 24]], 6);
      }
      g.beginPath(); g.ellipse(256, MOUTH[1] + 4, 9, 7, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    },
  },
  // 하트 눈: 빨간 하트 (두근두근 커졌다 작아짐) + 활짝 웃는 입
  heart: {
    frames: 2, anim: 'pulse',
    draw(g, f) {
      const s = f ? 36 : 30;
      for (const [x, y] of [EL, ER]) { heart(g, x, y, s, '#ff3d6e'); shine(g, x - s * 0.45, y - s * 0.35, s * 0.18); }
      g.beginPath(); g.moveTo(226, 300); g.quadraticCurveTo(256, 300, 286, 300); g.quadraticCurveTo(282, 340, 256, 340); g.quadraticCurveTo(230, 340, 226, 300);
      g.fillStyle = INK; g.fill();
    },
  },
  // 별 눈: 노란 별 (반짝 커졌다 작아짐) + 'O' 입
  star: {
    frames: 2, anim: 'pulse',
    draw(g, f) {
      for (const [x, y] of [EL, ER]) {
        const r = f ? 42 : 36;
        star(g, x, y, r + 6, (r + 6) * 0.48, INK, -Math.PI / 2 + (f ? 0.12 : 0));
        star(g, x, y, r, r * 0.48, '#ffd23d', -Math.PI / 2 + (f ? 0.12 : 0));
        shine(g, x - 6, y - 10, 6);
      }
      g.beginPath(); g.ellipse(256, MOUTH[1] + 6, 14, 17, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    },
  },
  // 소용돌이 눈 @@: 빙글빙글 (두 장을 번갈아) + 삐뚤 입
  swirl: {
    frames: 2, anim: 'spin',
    draw(g, f) {
      for (const [x, y] of [EL, ER]) {
        g.beginPath();
        for (let a = 0; a < Math.PI * 6; a += 0.12) { const r = 2 + a * 1.9, aa = a + (f ? Math.PI : 0); g.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); }
        stroke(g, 6);
      }
      line(g, [[218, 318], [234, 306], [250, 318], [266, 306], [282, 318], [296, 308]], 7);
    },
  },
  // 눈물 그렁: 큰 눈에 눈물이 고임 + 한 방울 + 삐죽 입
  teary: {
    frames: 2, anim: 'blink',
    draw(g, f) {
      if (f) { for (const e of [EL, ER]) shut(g, e, 30); }
      else {
        for (const [x, y] of [EL, ER]) {
          g.beginPath(); g.ellipse(x, y, 30, 36, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
          // 고인 눈물 (아래 반)
          g.save(); g.beginPath(); g.ellipse(x, y, 30, 36, 0, 0, Math.PI * 2); g.clip();
          g.fillStyle = 'rgba(110,190,255,0.85)'; g.beginPath(); g.ellipse(x, y + 30, 40, 22, 0, 0, Math.PI * 2); g.fill();
          g.restore();
          shine(g, x + 10, y - 14, 11); shine(g, x - 10, y + 2, 6); shine(g, x + 12, y + 16, 4);
        }
      }
      // 흐르는 눈물 한 방울 (오른쪽 눈 아래)
      g.fillStyle = '#7cc6ff';
      g.beginPath(); g.moveTo(ER[0] + 6, ER[1] + 40); g.quadraticCurveTo(ER[0] - 8, ER[1] + 66, ER[0] + 6, ER[1] + 72); g.quadraticCurveTo(ER[0] + 20, ER[1] + 66, ER[0] + 6, ER[1] + 40); g.fill();
      g.beginPath(); g.moveTo(228, 322); g.quadraticCurveTo(256, 300, 284, 322); stroke(g, 8);
    },
  },
  // 땀 삐질: 당황한 눈 + 걱정 눈썹 + 물결 입 + 큰 땀방울
  sweat: {
    frames: 2, anim: 'blink',
    draw(g, f) {
      if (f) { for (const e of [EL, ER]) shut(g, e, 24); }
      else for (const [x, y] of [EL, ER]) { g.beginPath(); g.ellipse(x, y + 2, 15, 20, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); shine(g, x + 5, y - 6, 4); }
      line(g, [[118, 176], [190, 160]], 8);
      line(g, [[394, 176], [322, 160]], 8);
      line(g, [[226, 314], [240, 306], [256, 314], [272, 306], [286, 314]], 7);
      // 땀방울 (오른쪽 이마)
      const gr = g.createLinearGradient(420, 120, 440, 190);
      gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#58b2f5');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(428, 112); g.quadraticCurveTo(404, 160, 426, 176); g.quadraticCurveTo(452, 162, 428, 112); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#3a8fd0'; g.stroke();
      shine(g, 422, 160, 5);
    },
  },
  // 콧수염: 점 눈 + 동그란 코 + 꼬불 갈색 콧수염
  mustache: {
    frames: 2, anim: 'blink',
    draw(g, f) {
      if (f) for (const e of [EL, ER]) shut(g, e, 20);
      else for (const e of [EL, ER]) circle(g, e[0], e[1], 15, INK);
      circle(g, 256, 262, 15, '#f0c9a8');
      const brown = '#5a3a26';
      for (const d of [-1, 1]) {
        g.beginPath();
        g.moveTo(256, 284);
        g.bezierCurveTo(256 + d * 30, 270, 256 + d * 70, 278, 256 + d * 82, 300);
        g.bezierCurveTo(256 + d * 92, 316, 256 + d * 110, 300, 256 + d * 100, 288);
        g.bezierCurveTo(256 + d * 118, 314, 256 + d * 80, 330, 256 + d * 60, 312);
        g.bezierCurveTo(256 + d * 40, 300, 256 + d * 20, 306, 256, 302);
        g.closePath();
        g.fillStyle = brown; g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) line(g, [[256 + i * 14, 286], [256 + i * 16, 300]], 2, 'rgba(255,255,255,0.18)');
    },
  },
  // 볼터치: 웃는 눈 ^^ + 분홍 볼 (빗금) + 고양이 입 ω
  blush: {
    frames: 1,
    draw(g) {
      for (const e of [EL, ER]) happy(g, e, 24);
      blush(g, 0.75);
      for (const x of [118, 394]) for (let i = -1; i <= 1; i++) line(g, [[x + i * 16 - 6, 290], [x + i * 16 + 6, 272]], 4, 'rgba(230,80,110,0.7)');
      g.beginPath(); g.moveTo(232, 304); g.quadraticCurveTo(244, 320, 256, 306); g.quadraticCurveTo(268, 320, 280, 304); stroke(g, 7);
    },
  },
};

export const FACE_LIST = [
  ['dots', '점 눈', 'common'],
  ['glare', '부릅뜬 눈', 'common'],
  ['sleepy', '졸린 눈', 'common'],
  ['happy', '웃는 눈', 'common'],
  ['wink', '윙크', 'common'],
  ['sparkle', '초롱초롱 눈', 'rare'],
  ['heart', '하트 눈', 'rare'],
  ['star', '별 눈', 'rare'],
  ['swirl', '빙글빙글 눈', 'rare'],
  ['teary', '눈물 그렁', 'rare'],
  ['sweat', '땀 삐질', 'rare'],
  ['mustache', '콧수염', 'rare'],
  ['blush', '발그레 볼', 'rare'],
].map(([id, name, grade]) => ({ id, name, grade }));

// 얼굴 만들기: { group, update(t, dt) | null }
export function makeFace(id) {
  const def = FACES[id];
  if (!def) return null;
  const maps = [];
  for (let f = 0; f < def.frames; f++) maps.push(canvas((g) => def.draw(g, f)));
  const mat = new THREE.MeshLambertMaterial({ map: maps[0], transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // alphaTest: 캐릭터 반투명 설정(setOpacity)이 transparent를 꺼도 빈 곳은 계속 비어 보이게
  // 구 조각: phi 3π/2 = 앞(-z). 그림이 뒤집히지 않게 phi는 오른쪽(+x)에서 왼쪽으로
  const geo = new THREE.SphereGeometry(R, 40, 40, (3 * Math.PI) / 2 - SPAN / 2, SPAN, Math.PI / 2 - SPAN / 2, SPAN);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  m.userData.face = true;
  const group = new THREE.Group();
  group.add(m);
  // 다 그린 그림 뭉치는 그룹을 버릴 때 같이 버린다
  group.userData.maps = maps;
  let update = null;
  if (def.frames > 1) {
    let next = 2 + Math.random() * 2, on = 0;
    const set = (i) => { if (mat.map !== maps[i]) { mat.map = maps[i]; mat.needsUpdate = true; } };
    if (def.anim === 'blink') {
      update = (t, dt) => {
        next -= dt;
        if (next <= 0) { on = 0.13; next = 2.6 + ((Math.sin(t * 12.9) + 1) * 1.6); }
        if (on > 0) on -= dt;
        set(on > 0 ? 1 : 0);
      };
    } else if (def.anim === 'pulse') {
      update = (t) => set(Math.sin(t * 7) > 0.2 ? 1 : 0);
    } else if (def.anim === 'spin') {
      update = (t) => set(Math.floor(t * 6) % 2);
    }
  }
  return { group, update };
}
