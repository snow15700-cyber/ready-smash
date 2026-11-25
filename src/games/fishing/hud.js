// 낚시 화면 글자·링 (2D 캔버스, 3D 위에 겹침) — '소리 없이도 손맛'(fishing.md 5-2장)
//  입질 링(톡: 작고 빠름 / 가짜 풍덩: 닫히기 전에 깨짐 / 진짜: 끝까지 닫힘) · 의성어 · 판정 · 집중선 컷인
//  장력 게이지·거리 · 펌핑 링(낚싯줄을 타고 옴) · 줄 불꽃 · 가장자리 빨간 맥동 · 도장 '쾅' · 결과 카드
import * as THREE from 'three';
import { GRADE } from './data.js';
import { seaHeight } from './world.js';

const JUA = (px) => `${Math.round(px)}px Jua, 'Pretendard Variable', sans-serif`;
const UI = (w, px) => `${w} ${Math.round(px)}px 'Pretendard Variable', system-ui, sans-serif`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const v = new THREE.Vector3();

export function drawHud(g, W, H, { S, TUNE, camera, tipW, caught, best }) {
  g.clearRect(0, 0, W, H);
  const m = Math.min(W, H), u = clamp(m / 720, 0.7, 1.3);
  const proj = (p) => { v.copy(p).project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 }; };
  const T = S.fight ? S.fight.T : 0;

  // 장력 80% 넘으면 화면 가장자리 빨간 맥동
  if (S.mode === 'fight' && T >= 0.8) {
    const a = (0.25 + 0.25 * Math.sin(S.now * 18)) * (T - 0.75) * 4;
    const gr = g.createRadialGradient(W / 2, H / 2, m * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    gr.addColorStop(0, 'rgba(255,30,30,0)'); gr.addColorStop(1, `rgba(255,30,30,${clamp(a, 0, 0.6)})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }

  // 준비: 그림자 위에 ↖ ↑ ↗
  if (S.mode === 'ready') {
    for (const sh of S.shadows) {
      if (sh.flee) continue;
      const p = proj(new THREE.Vector3(sh.x, seaHeight(sh.x, sh.z, S.now) + 1.2, sh.z));
      if (!p.ok) continue;
      const ang = -Math.atan2(sh.x - S.standX, sh.z - 65.6); // 화면 오른쪽 = −x
      const arrow = ang < -0.19 ? '↖' : ang > 0.19 ? '↗' : '↑';
      g.globalAlpha = 0.55 + 0.25 * Math.sin(S.now * 3 + sh.ph);
      g.font = JUA(26 * u); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(10,30,50,.55)'; g.strokeText(arrow, p.x, p.y); g.fillStyle = '#fff'; g.fillText(arrow, p.x, p.y);
      g.globalAlpha = 1;
    }
  }

  // 입질 링
  const bobP = proj(S.bob);
  const E = S.ev;
  if (S.mode === 'wait' && E && bobP.ok) {
    const t = S.t;
    const big = E.kind !== 'tok';
    const R0 = (big ? 96 : 48) * u, Rt = (big ? 26 : 17) * u;
    const closeT = E.kind === 'tok' ? E.close : E.sink + TUNE.win; // 가짜 풍덩도 진짜와 같은 빠르기로 좁혀짐
    const p = clamp((t - E.st) / (closeT - E.st), 0, 1);
    const cx = bobP.x, cy = bobP.y;
    // 시작 순간 파동
    const age = t - E.st;
    if (age < 0.45) { g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - age / 0.45)})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, Rt + age * 260 * u, 0, 7); g.stroke(); }
    if (E.broken) { // 깨진 링: 조각이 흩어짐
      const k = (t - E.broken) / 0.35;
      if (k < 1) {
        const r = Rt + (R0 - Rt) * (1 - p);
        g.lineWidth = 5 * u; g.strokeStyle = `rgba(255,225,74,${1 - k})`;
        for (let i = 0; i < 8; i++) { const a0 = (i / 8) * Math.PI * 2, dr = k * 40 * u; g.beginPath(); g.arc(cx + Math.cos(a0 + 0.3) * dr, cy + Math.sin(a0 + 0.3) * dr, r, a0 + 0.08, a0 + 0.62); g.stroke(); }
      }
    } else if (t <= closeT + 0.12) {
      const r = Rt + (R0 - Rt) * (1 - p);
      const fade = t > closeT ? 1 - (t - closeT) / 0.12 : 1;
      g.globalAlpha = fade;
      // 과녁(닫히는 자리)
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(cx, cy, Rt, 0, 7); g.stroke(); g.setLineDash([]);
      // 좁혀지는 링 (어두운 테두리 + 밝은 링 = 고대비)
      g.lineWidth = (big ? 9 : 6) * u; g.strokeStyle = 'rgba(10,25,45,.55)'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      const col = E.kind === 'tok' ? '#cfe8ff' : E.done.sink ? '#ffb02e' : '#ffffff';
      g.lineWidth = (big ? 5 : 3.5) * u; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      g.globalAlpha = 1;
    }
  }

  // 펄쩍 링 (Bad 뒤)
  if (S.mode === 'jump' && S.jump?.model?.visible && S.jump.close) {
    const p0 = proj(S.jump.model.position);
    const k = clamp((S.t - S.jump.st) / (S.jump.close - S.jump.st), 0, 1);
    const r = 30 * u + 70 * u * (1 - k);
    if (S.t <= S.jump.close + 0.12) {
      g.lineWidth = 8 * u; g.strokeStyle = 'rgba(10,25,45,.55)'; g.beginPath(); g.arc(p0.x, p0.y, r, 0, 7); g.stroke();
      g.lineWidth = 4.5 * u; g.strokeStyle = '#ffb02e'; g.beginPath(); g.arc(p0.x, p0.y, r, 0, 7); g.stroke();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.6)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(p0.x, p0.y, 30 * u, 0, 7); g.stroke(); g.setLineDash([]);
    }
  }

  // 줄다리기
  if (S.mode === 'fight' && S.fight) {
    const Fi = S.fight;
    const tipP = proj(tipW);
    // 펌핑 링: 찌 → 낚싯줄을 타고 → 대 끝 근처 표시
    const mark = { x: bobP.x + (tipP.x - bobP.x) * 0.78, y: bobP.y + (tipP.y - bobP.y) * 0.78 };
    if (S.t > 0.9) {
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.75)'; g.setLineDash([5, 4]); g.beginPath(); g.arc(mark.x, mark.y, 24 * u, 0, 7); g.stroke(); g.setLineDash([]);
      g.font = UI(700, 11 * u); g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('펌핑', mark.x, mark.y + 28 * u);
    }
    if (Fi.pump) {
      const k = clamp((S.t - Fi.pump.st) / (Fi.pump.arrive - Fi.pump.st), 0, 1.2);
      const x = bobP.x + (mark.x - bobP.x) * k, y = bobP.y + (mark.y - bobP.y) * k;
      const near = Math.abs(S.t - Fi.pump.arrive) <= 0.13;
      g.lineWidth = 9 * u; g.strokeStyle = 'rgba(10,25,45,.5)'; g.beginPath(); g.arc(x, y, 24 * u, 0, 7); g.stroke();
      g.lineWidth = 5 * u; g.strokeStyle = near ? '#7fe3a0' : '#ffb02e'; g.beginPath(); g.arc(x, y, 24 * u, 0, 7); g.stroke();
    }
    // 줄 불꽃 (80%~)
    for (const s of S.sparks) {
      if (s.x === null) { s.x = bobP.x + (tipP.x - bobP.x) * (0.3 + s.k * 0.6); s.y = bobP.y + (tipP.y - bobP.y) * (0.3 + s.k * 0.6); }
      s.x += s.vx / 60; s.y += s.vy / 60; s.vy += 8;
      g.fillStyle = `rgba(255,${180 + Math.random() * 70 | 0},90,${clamp(s.life * 3, 0, 1)})`; g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    // 장력 게이지 (오른쪽 세로)
    const bh = Math.min(H * 0.42, 280), bw = 18, bx = W - 46, by = H * 0.47 - bh / 2;
    glass(g, bx - 11, by - 34, bw + 22, bh + 70, 16);
    g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, bx, by, bw, bh, 9); g.fill();
    g.save(); rr(g, bx, by, bw, bh, 9); g.clip();
    const col = T < 0.41 ? '#9fd2ff' : T < 0.8 ? '#ffb02e' : (Math.sin(S.now * 30) > 0 ? '#ff2d2d' : '#ffd0d0');
    g.fillStyle = col; g.fillRect(bx, by + bh * (1 - T), bw, bh * T);
    g.restore();
    for (const [k, c] of [[0.41, 'rgba(255,255,255,.5)'], [0.8, 'rgba(255,90,90,.9)']]) { g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx - 4, by + bh * (1 - k)); g.lineTo(bx + bw + 4, by + bh * (1 - k)); g.stroke(); }
    g.font = UI(700, 12); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText('장력', bx + bw / 2, by - 10);
    g.textBaseline = 'top'; g.fillText(`${Math.round(T * 100)}%`, bx + bw / 2, by + bh + 10);
    // 거리 (위쪽 가로): 물고기 → 낚싯대
    const dw = Math.min(320, W - 140), dx = W / 2 - dw / 2, dy = 64;
    glass(g, dx - 40, dy - 16, dw + 80, 32, 16);
    g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, dx, dy - 3, dw, 6, 3); g.fill();
    const k = clamp(1 - Fi.dist, 0, 1);
    g.fillStyle = '#7fe3a0'; rr(g, dx, dy - 3, dw * k, 6, 3); g.fill();
    g.font = JUA(20); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(S.fish.emoji, dx + dw * k, dy); g.fillText('🎣', dx + dw + 22, dy);
    if (Fi.dist > 1.05) { g.font = UI(700, 12); g.fillStyle = '#ff8a8a'; g.fillText('너무 멀어져요!', dx + dw / 2, dy + 26); }
  }

  // 의성어·글자
  for (const x of S.texts) {
    let p;
    if (x.at) { p = proj(x.at); if (!p.ok) continue; } else p = { x: x.sx * W, y: x.sy * H };
    const k = x.t / x.life;
    const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.5 : k < 0.22 ? 1.1 - (k - 0.12) * 1 : 1;
    const a = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
    const sx = (Math.random() - 0.5) * x.shake * 2, sy = (Math.random() - 0.5) * x.shake * 2;
    g.save(); g.globalAlpha = a; g.translate(p.x + sx, p.y + sy - k * x.rise); g.scale(pop, pop);
    g.font = JUA(x.size * u); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = Math.max(4, x.size * u * 0.16); g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,25,45,.75)'; g.strokeText(x.txt, 0, 0);
    g.fillStyle = x.color; g.fillText(x.txt, 0, 0);
    g.restore();
  }

  // 판정
  if (S.judge) {
    const J = S.judge, k = J.t;
    const pop = k < 0.1 ? 0.5 + k * 6 : k < 0.2 ? 1.1 - (k - 0.1) : 1;
    g.save(); g.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.3 : 1; g.translate(W / 2, H * 0.2); g.scale(pop, pop);
    g.font = JUA(46 * u); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,25,45,.7)'; g.strokeText(J.txt, 0, 0); g.fillStyle = J.color; g.fillText(J.txt, 0, 0);
    if (J.sub) { g.font = UI(700, 15 * u); g.lineWidth = 4; g.strokeText(J.sub, 0, 36 * u); g.fillStyle = '#fff'; g.fillText(J.sub, 0, 36 * u); }
    g.restore();
  }

  // 집중선 컷인 (희귀·전설이 걸렸을 때)
  if (S.cutin && S.cutin.t < 1.0) {
    const C = S.cutin, k = C.t;
    const a = k < 0.1 ? k / 0.1 : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    for (let i = 0; i < 70; i++) {
      const ang = (i / 70) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05;
      const r0 = m * (0.28 + ((i * 37) % 10) / 40), r1 = Math.hypot(W, H);
      g.fillStyle = i % 3 ? 'rgba(255,255,255,.85)' : C.color;
      g.beginPath(); g.moveTo(Math.cos(ang - 0.006) * r0, Math.sin(ang - 0.006) * r0); g.lineTo(Math.cos(ang - 0.02) * r1, Math.sin(ang - 0.02) * r1); g.lineTo(Math.cos(ang + 0.02) * r1, Math.sin(ang + 0.02) * r1); g.closePath(); g.fill();
    }
    const slide = k < 0.15 ? (1 - k / 0.15) * W * 0.6 : 0;
    g.font = JUA(70 * u); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,25,45,.85)'; g.strokeText(C.txt, slide, -10 * u); g.fillStyle = C.color; g.fillText(C.txt, slide, -10 * u);
    g.font = JUA(30 * u); g.lineWidth = 6; g.strokeText(C.sub, -slide, 48 * u); g.fillStyle = '#fff'; g.fillText(C.sub, -slide, 48 * u);
    g.restore();
  }

  // 도장 '쾅'
  if (S.stamp && S.mode === 'land') {
    const k = S.stamp.t, sc = k < 0.12 ? 2.4 - (k / 0.12) * 1.4 : 1;
    g.save(); g.translate(W / 2, H * 0.3); g.rotate(-0.08); g.scale(sc, sc); g.globalAlpha = Math.min(1, k * 8);
    g.font = JUA(40 * u); const tw = g.measureText(S.stamp.txt).width + 40 * u;
    g.fillStyle = 'rgba(255,250,240,.92)'; rr(g, -tw / 2, -32 * u, tw, 64 * u, 10); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#d23a2a'; rr(g, -tw / 2 + 5, -27 * u, tw - 10, 54 * u, 8); g.stroke();
    g.fillStyle = '#d23a2a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S.stamp.txt, 0, 2);
    g.restore();
  }

  // 안내 문구 (아래)
  const hints = {
    ready: S.hint?.txt || (matchMedia('(pointer: coarse)').matches ? '노리는 그림자를 톡 눌러 던지기' : '마우스를 누른 채 위로 휘둘러 던지기  ↖ ↑ ↗'),
    cast: '',
    wait: !E ? '기다려요… 톡·가짜 풍덩은 참기' : E.kind === 'real' && E.done.sink ? '지금! 링이 닫힐 때' : '참을까? 누를까?',
    jump: '펄쩍! 링이 닫힐 때 누르기',
    fight: S.t < 0.9 ? '' : T >= 0.8 ? '끼이익! 손 떼기' : S.fight?.pump ? '링이 표시에 오면 떼었다 다시 누르기!' : S.holding ? '감는 중… 빨개지면 손 떼기' : '꾹 누르면 감기',
    land: '',
    result: S.t > 0.7 ? '눌러서 다시 던지기' : '',
  };
  const hint = hints[S.mode];
  if (hint) {
    g.font = UI(700, clamp(m * 0.032, 14, 20));
    const tw = g.measureText(hint).width + 34, th = 40, hy = H - 74;
    glass(g, W / 2 - tw / 2, hy - th / 2, tw, th, th / 2);
    g.fillStyle = /지금|떼기|끼이익/.test(hint) ? '#FF8A1F' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(hint, W / 2, hy + 1);
  }

  // 결과 카드
  if (S.mode === 'result' && S.result) drawResult(g, W, H, S, u, best);

  g.font = UI(600, 12); g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillText(`잡은 물고기 ${caught}마리`, W - 16, H - 14);

  if (S.flash > 0) { g.fillStyle = `rgba(255,255,255,${S.flash * 0.5})`; g.fillRect(0, 0, W, H); }
}

function drawResult(g, W, H, S, u, best) {
  const R = S.result;
  const a = clamp(S.t * 4, 0, 1), pop = 0.9 + 0.1 * Math.min(1, S.t * 5);
  const cw = Math.min(340, W - 32), ch = R.ok ? 240 : 160;
  g.save(); g.globalAlpha = a; g.translate(W / 2, H * 0.45); g.scale(pop, pop);
  glass(g, -cw / 2, -ch / 2, cw, ch, 24);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (R.ok) {
    const gr = GRADE[R.fish.grade];
    g.font = UI(800, 13); const gt = gr.label; const gw = g.measureText(gt).width + 18;
    g.fillStyle = gr.color; rr(g, -gw / 2, -ch / 2 + 16, gw, 22, 11); g.fill();
    g.fillStyle = R.fish.grade === 'legend' ? '#3a2a00' : '#0b1633'; g.fillText(gt, 0, -ch / 2 + 27);
    g.font = '54px sans-serif'; g.fillText(R.fish.emoji, 0, -30);
    g.font = JUA(28); g.fillStyle = '#fff'; g.fillText(`${R.fish.name} ${R.cm}cm`, 0, 30);
    g.font = UI(600, 14); g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(`챔질 ${R.grade}${R.calm ? ` · ✨ 참기 ${R.calm}번` : ''}${R.rec ? '' : ` · 최고 ${R.best}cm`}`, 0, 62);
    if (R.rec) {
      g.font = UI(800, 14); const t = '🏆 새 기록!'; const tw = g.measureText(t).width + 22;
      g.fillStyle = '#FF8A1F'; rr(g, -tw / 2, 80, tw, 26, 13); g.fill();
      g.fillStyle = '#fff'; g.fillText(t, 0, 93);
    }
  } else {
    g.font = JUA(28); g.fillStyle = '#fff'; g.fillText(R.title, 0, -26);
    g.font = UI(600, 14); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(R.sub, 0, 10);
    if (R.fish) { g.font = UI(600, 13); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(`(${R.fish.emoji} ${R.fish.name}였어요)`, 0, 42); }
  }
  g.restore();
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function glass(g, x, y, w, h, r) {
  g.fillStyle = 'rgba(15,25,50,.58)'; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
  rr(g, x, y, w, h, r); g.fill(); g.stroke();
}
