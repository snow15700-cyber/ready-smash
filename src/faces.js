import * as THREE from 'three';
import { fxSprite, bursts } from './hats.js';

/* ───────────── 얼굴 꾸미기 (한 개씩) ─────────────
   사용자 확정: 얼굴 아이템은 **얼굴에 직접 그리는 것만**(눈·표정·볼터치·콧수염). 안경·안대처럼 얼굴 위에 쓰는 물건은 X.
   기본 = 얼굴 없음. 얼굴을 덮는 몸(병아리)·머리(투구·가면)와 같이 입으면 숨긴다(scene.js setFace).
   만드는 법: 머리 앞면을 덮는 얇은 구 조각(머리 반지름 0.16보다 살짝 큼)에 투명 그림(512×512)을 붙인다.
   그림 좌표: 가운데(256, 256) = 머리 앞 한가운데(머리 중심 높이). 1라디안 ≈ 197px. 그림 왼쪽 = 정면에서 볼 때 왼쪽.
   그릴 때 전체를 DOWN만큼 내린다: 눈(그림 y 215) → 머리 중심 높이, 입(y 312) → 중심 아래. 큰 눈 위끝도 머리 y 0.04 아래라
   머리 아이템 앞 가장자리(y 0.06 위)에 안 가려진다.
   고급 이상은 눈 깜빡임(그림 두 장을 바꿔 끼움), 하트·별·소용돌이는 두근·반짝·빙글 */

const S = 512, SPAN = 2.6; // 그림 한 변 = 2.6라디안 (상대 테이블에서도 표정이 보이게 크게 — 사용자 요청)
const DOWN = 45; // 그림 전체를 아래로 (큰 눈이 모자 앞 가장자리에 안 닿게)
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
  g.translate(0, DOWN);
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
      const gr = g.createLinearGradient(410, 140, 430, 200);
      gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#58b2f5');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(420, 140); g.quadraticCurveTo(398, 184, 418, 198); g.quadraticCurveTo(442, 186, 420, 140); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#3a8fd0'; g.stroke();
      shine(g, 414, 182, 5);
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
  // ── 전설 (경기에 반응) ── react(kind, n): 'perfect' · 'score' · 'miss' · 'smash' · 'rally' n · 'end'
  // 표정 바뀌는 얼굴: 평소 ^‿^ / 퍼펙트 >▽< / 득점 의기양양(콧김) / 실점 X_X (1.4초)
  mood: {
    frames: 5, anim: 'mood',
    draw(g, f) {
      if (f === 0 || f === 1) {
        if (f) for (const e of [EL, ER]) shut(g, e, 28);
        else for (const [x, y] of [EL, ER]) { g.beginPath(); g.ellipse(x, y, 22, 28, 0, 0, Math.PI * 2); g.fillStyle = INK; g.fill(); shine(g, x + 7, y - 9, 8); }
        blush(g, 0.45);
        smile(g, 30);
      } else if (f === 2) { // >▽<
        line(g, [[EL[0] - 26, EL[1] - 22], [EL[0] + 16, EL[1]], [EL[0] - 26, EL[1] + 22]], 11);
        line(g, [[ER[0] + 26, ER[1] - 22], [ER[0] - 16, ER[1]], [ER[0] + 26, ER[1] + 22]], 11);
        g.beginPath(); g.moveTo(216, 296); g.lineTo(296, 296); g.lineTo(256, 352); g.closePath(); g.fillStyle = INK; g.fill();
        g.beginPath(); g.ellipse(256, 332, 16, 10, 0, 0, Math.PI * 2); g.fillStyle = '#ff7a8a'; g.fill();
        blush(g, 0.8);
      } else if (f === 3) { // 의기양양: 지그시 감은 눈 + 씨익 + 콧김
        for (const [x, y] of [EL, ER]) { g.beginPath(); g.moveTo(x - 30, y + 4); g.quadraticCurveTo(x, y - 14, x + 30, y + 4); stroke(g, 10); line(g, [[x - 32, y - 22], [x + 28, y - 30]], 8); }
        g.beginPath(); g.moveTo(222, 312); g.quadraticCurveTo(262, 330, 296, 300); stroke(g, 9);
        for (const d of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(256 + d * (44 + i * 16), 276 + i * 4, 7 - i * 1.5, 0, Math.PI * 2); g.fillStyle = 'rgba(200,210,225,0.9)'; g.fill(); }
      } else { // X_X
        for (const [x, y] of [EL, ER]) { line(g, [[x - 22, y - 22], [x + 22, y + 22]], 11); line(g, [[x + 22, y - 22], [x - 22, y + 22]], 11); }
        line(g, [[216, 318], [232, 306], [248, 318], [264, 306], [280, 318], [296, 306]], 8);
      }
    },
  },
  // 레이저 눈: 빨갛게 빛나는 눈. 스매시·퍼펙트 때 눈에서 레이저가 앞으로 쭉
  laser: {
    frames: 2, anim: 'blink',
    draw(g, f) {
      for (const [x, y] of [EL, ER]) {
        if (f) { shut(g, [x, y], 30); continue; }
        const gr = g.createRadialGradient(x, y, 2, x, y, 40);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#ffd0d0'); gr.addColorStop(0.5, '#ff2a2a'); gr.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 40, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x, y, 28, 22, 0, 0, Math.PI * 2); stroke(g, 6, '#8a0000');
      }
      line(g, [[110, 168], [200, 186]], 12);
      line(g, [[402, 168], [312, 186]], 12);
      g.beginPath(); g.moveTo(222, 318); g.lineTo(290, 312); stroke(g, 8);
    },
  },
  // 불타는 눈: 결연한 눈동자에 불꽃. 랠리가 길어질수록 눈 위 불꽃이 커짐
  fire: {
    frames: 3, anim: 'flicker',
    draw(g, f) {
      for (const [x, y] of [EL, ER]) {
        g.beginPath(); g.ellipse(x, y, 32, 28, 0, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); stroke(g, 7);
        // 불꽃 눈동자
        const k = [1, 1.12, 0.92][f];
        const gr = g.createLinearGradient(x, y + 20, x, y - 34 * k);
        gr.addColorStop(0, '#ff3a10'); gr.addColorStop(0.5, '#ff9a1a'); gr.addColorStop(1, '#ffe27a');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(x - 16, y + 14); g.quadraticCurveTo(x - 20, y - 6, x - 6 + f * 2, y - 30 * k); g.quadraticCurveTo(x, y - 12, x + 6, y - 24 * k); g.quadraticCurveTo(x + 22, y - 4, x + 16, y + 14); g.quadraticCurveTo(x, y + 22, x - 16, y + 14); g.fill();
        circle(g, x, y + 6, 7, INK);
      }
      line(g, [[112, 160], [204, 180]], 13);
      line(g, [[400, 160], [308, 180]], 13);
      g.beginPath(); g.moveTo(224, 316); g.quadraticCurveTo(256, 306, 288, 316); stroke(g, 9);
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
  ['mood', '표정 바뀌는 얼굴', 'legend'],
  ['laser', '레이저 눈', 'legend'],
  ['fire', '불타는 눈', 'legend'],
].map(([id, name, grade]) => ({ id, name, grade }));

// 그림 좌표(px, py) → 얼굴 조각 위 3D 자리 (머리 중심 기준)
function at(px, py, r = R) {
  const ax = ((256 - px) / S) * SPAN, ay = ((256 - (py + DOWN)) / S) * SPAN;
  return new THREE.Vector3(Math.sin(ax) * Math.cos(ay) * r, Math.sin(ay) * r, -Math.cos(ax) * Math.cos(ay) * r);
}

// 얼굴 만들기: { group, update(t, dt) | null, react(kind, n) | null }
export function makeFace(id) {
  const def = FACES[id];
  if (!def) return null;
  const maps = [];
  for (let f = 0; f < def.frames; f++) maps.push(canvas((g) => def.draw(g, f)));
  const mat = new THREE.MeshLambertMaterial({ map: maps[0], transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  // alphaTest: 캐릭터 반투명 설정(setOpacity)이 transparent를 꺼도 빈 곳은 계속 비어 보이게
  // 구 조각: phi 3π/2 = 앞(-z). 그림이 뒤집히지 않게 phi는 오른쪽(+x)에서 왼쪽으로
  const geo = new THREE.SphereGeometry(R, 48, 48, (3 * Math.PI) / 2 - SPAN / 2, SPAN, Math.PI / 2 - SPAN / 2, SPAN);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  m.userData.face = true;
  const group = new THREE.Group();
  group.add(m);
  group.userData.maps = maps; // 그룹을 버릴 때 같이 버린다
  const set = (i) => { if (mat.map !== maps[i]) { mat.map = maps[i]; mat.needsUpdate = true; } };
  let update = null, react = null;
  let next = 2 + Math.random() * 2, on = 0;
  const blink = (t, dt, open = 0, shut = 1) => {
    next -= dt;
    if (next <= 0) { on = 0.13; next = 2.6 + (Math.sin(t * 12.9) + 1) * 1.6; }
    if (on > 0) on -= dt;
    set(on > 0 ? shut : open);
  };
  if (def.anim === 'blink') update = (t, dt) => blink(t, dt);
  else if (def.anim === 'pulse') update = (t) => set(Math.sin(t * 7) > 0.2 ? 1 : 0);
  else if (def.anim === 'spin') update = (t) => set(Math.floor(t * 6) % 2);

  // ── 전설 효과 ──
  if (id === 'mood') {
    const fx = bursts(group);
    let face = 0, left = 0;
    update = (t, dt) => {
      if (left > 0) { left -= dt; set(face); } else blink(t, dt);
      fx.tick(dt);
    };
    react = (kind) => {
      const f = { perfect: 2, score: 3, smash: 2, miss: 4 }[kind];
      if (!f) return;
      face = f; left = 1.4;
      const col = f === 4 ? '#9fb3d8' : '#ffe27a';
      for (let i = 0; i < 5; i++) {
        const sp = fxSprite(f === 4 ? 'drop' : 'spark', col, rnd(0.03, 0.05));
        sp.position.copy(at(256 + rnd(-150, 150), 120)).multiplyScalar(1.1);
        fx.add(sp, { vel: new THREE.Vector3(rnd(-0.1, 0.1), f === 4 ? -0.1 : 0.25, -0.05), life: 0.8 });
      }
    };
  } else if (id === 'laser') {
    const eyes = [EL, ER].map(([x, y]) => at(x, y, R + 0.004));
    const glows = eyes.map((p) => { const sp = fxSprite('glow', '#ff3030', 0.07); sp.position.copy(p); group.add(sp); return sp; });
    // 레이저 빔: 눈에서 앞(-z)으로 1.6m
    const beamM = new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const L = 1.6;
    const beams = eyes.map((p) => {
      const b = new THREE.Group();
      b.position.copy(p);
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, L, 12, 1, true), beamM);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, L, 8, 1, true), coreM);
      for (const o of [outer, inner]) { o.rotation.x = Math.PI / 2; o.position.z = -L / 2; o.userData.fx = true; b.add(o); }
      group.add(b);
      return b;
    });
    let fire = 0;
    update = (t, dt) => {
      blink(t, dt);
      const k = fire > 0 ? 1 : 0.55 + Math.sin(t * 5) * 0.2;
      glows.forEach((g) => { g.material.opacity = on > 0 ? 0 : k; g.scale.setScalar(fire > 0 ? 0.12 : 0.07); });
      if (fire > 0) {
        fire -= dt;
        const o = Math.min(1, fire / 0.15);
        beamM.opacity = 0.75 * o; coreM.opacity = o;
        beams.forEach((b) => { b.scale.set(1 + Math.sin(t * 60) * 0.15, 1 + Math.sin(t * 60) * 0.15, 1); });
      } else { beamM.opacity = 0; coreM.opacity = 0; }
    };
    react = (kind) => { if (kind === 'smash' || kind === 'perfect') { fire = 0.45; on = 0; } };
  } else if (id === 'fire') {
    const fx = bursts(group);
    let size = 0.4, target = 0.4, acc = 0;
    const tops = [EL, ER].map(([x, y]) => at(x, y - 40, R + 0.01));
    update = (t, dt) => {
      set(Math.floor(t * 9) % 3);
      size += (target - size) * Math.min(1, dt * 3);
      acc += dt * (4 + size * 14);
      while (acc > 1) {
        acc -= 1;
        const p = tops[Math.floor(Math.random() * 2)];
        const sp = fxSprite('ember', '#ffffff', rnd(0.03, 0.05) * (0.6 + size));
        sp.position.copy(p).add(new THREE.Vector3(rnd(-0.015, 0.015), 0, -0.01));
        fx.add(sp, { vel: new THREE.Vector3(rnd(-0.03, 0.03), rnd(0.12, 0.22) * (0.6 + size), -0.02), life: rnd(0.3, 0.5) * (0.6 + size), grow: -0.5 });
      }
      fx.tick(dt);
    };
    react = (kind, n = 0) => {
      if (kind === 'rally') target = 0.4 + Math.min(n, 20) * 0.06;
      else if (kind === 'end' || kind === 'miss') target = 0.4;
      else if (kind === 'smash' || kind === 'perfect') size = Math.max(size, target + 0.6);
    };
  }
  return { group, update, react };
}
const rnd = (a, b) => a + Math.random() * (b - a);
