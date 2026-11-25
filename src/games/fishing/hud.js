// 낚시 화면 (2D 캔버스, 3D 위에 겹침) — 리듬 방식 (fishing.md 8장)
//  준비: 떨어질 자리 표시(끄는 동안 따라옴) · 세기 막대 · 기포 표시 / 입질: 찌 확대 창 테두리 · '!' / 줄다리기: 가운데 기본 원 + 줄어드는 원 · 거리 게이지
//  공통: 의성어 · 판정 · 집중선 컷인 · 도장 '쾅' · 결과 카드 (소리 없이도 손맛)
import * as THREE from 'three';
import { GRADE } from './data.js';
import { castDist, landingPoint, seaHeight } from './world.js';

const JUA = (px) => `${Math.round(px)}px Jua, 'Pretendard Variable', sans-serif`;
const UI = (w, px) => `${w} ${Math.round(px)}px 'Pretendard Variable', system-ui, sans-serif`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const v = new THREE.Vector3();

// 찌 확대 창 자리 (오른쪽 아래, 화면 좌표 · 위에서부터)
export function zoomRect(W, H) {
  const s = Math.round(clamp(Math.min(W, H) * 0.3, 130, 220));
  return { x: W - s - 16, y: H - s - (W < 560 ? 130 : 100), s };
}
// 줄다리기 기본 원 자리 (화면 가운데 조금 아래, 사용자 확정)
const baseAt = (W, H) => ({ x: W / 2, y: H * 0.6 });

export function drawHud(g, W, H, { S, TUNE, camera, zoomCam, zoom, caught }) {
  g.clearRect(0, 0, W, H);
  const m = Math.min(W, H), u = clamp(m / 720, 0.7, 1.3);
  const proj = (p, cam = camera, rect = null) => {
    v.copy(p).project(cam);
    if (rect) return { x: rect.x + (v.x + 1) / 2 * rect.s, y: rect.y + (1 - v.y) / 2 * rect.s, ok: v.z < 1 };
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, ok: v.z < 1 };
  };
  const out = (txt, x, y, px, col, lw = 6) => { g.font = JUA(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = 'rgba(10,25,45,.75)'; g.strokeText(txt, x, y); g.fillStyle = col; g.fillText(txt, x, y); };

  // 기포 표시 (모두가 보는 곳) + 남은 시간
  for (const b of ['ready', 'cast', 'wait'].includes(S.mode) ? S.bubbles : []) {
    const p = proj(new THREE.Vector3(b.x, seaHeight(b.x, b.z, S.now) + 1.6, b.z));
    if (!p.ok) continue;
    g.globalAlpha = b.fade;
    out(`🫧 ${Math.ceil(b.left)}초`, p.x, p.y + Math.sin(S.now * 2) * 3, 18 * u, '#e6fbff', 4);
    g.globalAlpha = 1;
  }
  if (S.bubbleNote && S.mode !== 'fight' && S.mode !== 'land') {
    const a = clamp(Math.min(S.bubbleNote.t * 4, (3 - S.bubbleNote.t) * 2), 0, 1);
    g.globalAlpha = a;
    const txt = '🫧 기포가 올라와요! 근처에 던지면 귀한 물고기가 잘 와요';
    g.font = UI(700, clamp(m * 0.026, 12, 16)); const tw = g.measureText(txt).width + 28;
    glass(g, W / 2 - tw / 2, 58, tw, 34, 17); g.fillStyle = '#bff3ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, 76);
    g.globalAlpha = 1;
  }

  // 준비: 떨어질 자리 표시 (자유 던지기 — 끄는 동안 방향·세기를 따라 움직임, 안 끌 때는 가운데 중간에 흐리게)
  if (S.mode === 'ready') {
    const on = !!S.drag;
    const L = landingPoint(S.standX, on ? S.aim : 0, on ? S.power : 0.5);
    const p = proj(new THREE.Vector3(L.x, seaHeight(L.x, L.z, S.now), L.z));
    if (p.ok) {
      const r = (on ? 13 : 9) * u * (1.15 - S.power * 0.35), pulse = 1 + Math.sin(S.now * 6) * 0.08;
      g.save(); g.translate(p.x, p.y); g.scale(pulse, pulse);
      g.lineWidth = 3; g.strokeStyle = 'rgba(10,25,45,.45)'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.stroke();
      g.lineWidth = 2; g.strokeStyle = on ? '#FF8A1F' : 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.stroke();
      g.fillStyle = on ? '#FF8A1F' : 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(0, 0, 3, 1.6, 0, 0, 7); g.fill();
      g.restore();
    }
    // 세기 막대 (끄는 동안): 가까이 ~ 멀리
    if (S.drag || S.power > 0.01) {
      const tw = 180 * u, ch = 12 * u, x0 = W / 2 - tw / 2, y0 = H - 128;
      glass(g, x0 - 12, y0 - 26, tw + 24, ch + 36, 12);
      g.font = UI(700, 12); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`세기 ${Math.round(castDist(S.power))}m`, W / 2, y0 - 13);
      g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('가까이', x0, y0 - 13);
      g.textAlign = 'right'; g.fillText('멀리', x0 + tw, y0 - 13);
      g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, x0, y0, tw, ch, 6); g.fill();
      const grd = g.createLinearGradient(x0, 0, x0 + tw, 0); grd.addColorStop(0, '#7fe3a0'); grd.addColorStop(0.5, '#ffd23a'); grd.addColorStop(1, '#FF8A1F');
      g.fillStyle = grd; rr(g, x0, y0, tw * clamp(S.power, 0, 1), ch, 6); g.fill();
    }
  }

  // 진짜 입질: 찌 위 '!' (큰 화면)
  if (S.alertT >= 0 && S.mode === 'wait') {
    const p = proj(S.bob.clone().add(new THREE.Vector3(0, 1.4, 0)));
    const s = S.alertT < 0.1 ? 0.5 + S.alertT * 8 : 1 + Math.sin(S.alertT * 40) * 0.06;
    if (p.ok) { g.save(); g.translate(p.x, p.y); g.scale(s, s); out('!', 0, 0, 72 * u, '#FF8A1F', 10); g.restore(); }
  }

  // 찌 확대 창 테두리 (동그랗게: 네모 안쪽 원 밖을 가림)
  if (zoom) {
    const z = zoomRect(W, H), cx = z.x + z.s / 2, cy = z.y + z.s / 2, r = z.s / 2 - 2;
    const jx = (Math.random() - 0.5) * S.zshake * 0.6, jy = (Math.random() - 0.5) * S.zshake * 0.6;
    g.fillStyle = 'rgba(15,25,50,.9)'; // 네모 귀퉁이를 유리 틀로 가려서 동그란 창
    g.beginPath(); g.rect(z.x - 1, z.y - 1, z.s + 2, z.s + 2); g.arc(cx, cy, r, 0, Math.PI * 2, true); g.fill('evenodd');
    g.lineWidth = 5; g.strokeStyle = S.alertT >= 0 ? '#FF8A1F' : 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(cx + jx, cy + jy, r, 0, 7); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(10,25,45,.4)'; g.beginPath(); g.arc(cx + jx, cy + jy, r + 3, 0, 7); g.stroke();
    g.font = UI(700, 11); g.fillStyle = 'rgba(255,255,255,.85)'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('찌 확대', cx, z.y + 3);
    if (S.alertT >= 0) { const s = 1 + Math.sin(S.alertT * 40) * 0.08; g.save(); g.translate(cx, z.y + z.s * 0.28); g.scale(s, s); out('!', 0, 0, z.s * 0.32, '#FF8A1F', 8); g.restore(); }
  }

  // 줄다리기: 거리 게이지 + 기본 원 + 줄어드는 원
  if (S.mode === 'fight' && S.R) {
    const R = S.R, b = baseAt(W, H), br = 36 * u;
    // 거리 게이지 (위): 왼쪽 🎣 = 잡음 · 오른쪽 🌊 = 도망
    const dw = Math.min(320, W - 140), dx = W / 2 - dw / 2, dy = W < 560 ? 100 : 64; // 휴대폰은 위 표시와 안 겹치게
    glass(g, dx - 40, dy - 16, dw + 80, 32, 16);
    const grd = g.createLinearGradient(dx, 0, dx + dw, 0); grd.addColorStop(0, '#7fe3a0'); grd.addColorStop(0.6, '#ffd23a'); grd.addColorStop(1, '#ff5a4a');
    g.fillStyle = grd; g.globalAlpha = 0.85; rr(g, dx, dy - 3, dw, 6, 3); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(dx + dw * 0.6, dy - 8); g.lineTo(dx + dw * 0.6, dy + 8); g.stroke();
    g.font = JUA(20); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText('🎣', dx - 22, dy); g.fillText('🌊', dx + dw + 22, dy);
    R.shown = R.shown === undefined ? R.dist : R.shown + (R.dist - R.shown) * 0.2;
    g.fillText('❓', dx + dw * clamp(R.shown / 100, 0, 1), dy); // 무슨 물고기인지는 잡을 때까지 비밀
    if (S.t > 0.4 || S.stage > 0) {
      // 기본 원 (박자마다 두근)
      const pr = br * (1 + R.pulse * 0.12);
      g.fillStyle = 'rgba(15,25,50,.35)'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.fill();
      g.lineWidth = 6 * u; g.strokeStyle = 'rgba(10,25,45,.55)'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.stroke();
      g.lineWidth = 3.5 * u; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.25 + R.pulse * 0.5})`; g.beginPath(); g.arc(b.x, b.y, 7 * u, 0, 7); g.fill();
      // 줄어드는 원 (다가오는 노트들) — 시간은 리듬 시계(R.rt). 마지막 큰 노트는 굵은 금색, 3박 동안 천천히
      const rt = R.rt ?? 0;
      for (const n of R.notes) {
        if (n.res) continue;
        const k = (n.t - rt) / n.appr; // 1 → 0
        if (k > 1 || k < -0.3) continue;
        const r = br * (1 + Math.max(0, k) * (n.fin ? 3.2 : 2.4));
        g.globalAlpha = clamp((1 - k) * 3, 0, 1);
        g.lineWidth = (n.fin ? 12 : 7) * u; g.strokeStyle = 'rgba(10,25,45,.5)'; g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.stroke();
        g.lineWidth = (n.fin ? 8 : 4) * u; g.strokeStyle = n.fin ? '#ffd23a' : R.song.grade === 'common' ? '#ffb02e' : GRADE[R.song.grade].color; g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.stroke();
        if (n.fin) { g.fillStyle = 'rgba(255,210,58,.12)'; g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.fill(); }
        g.globalAlpha = 1;
      }
      // 판정 글자 (맞춘 노트)
      for (const n of R.notes) {
        if (!n.res) continue;
        const k = clamp((rt - n.at) / 0.5, 0, 1);
        g.globalAlpha = 1 - k;
        const col = n.res === 'Perfect' ? '#ffb02e' : n.res === 'Good' ? '#7fe3a0' : '#c9d3e0';
        out(n.res, b.x, b.y - br - 22 * u - k * 20, (n.res === 'Perfect' ? 30 : 26) * u, col, 5);
        if (n.res !== 'Miss') { g.lineWidth = 4; g.strokeStyle = col; g.beginPath(); g.arc(b.x, b.y, br * (1 + k * 0.8), 0, 7); g.stroke(); }
        g.globalAlpha = 1;
      }
      // Perfect: 원이 터지며 불꽃
      if (R.burst && R.burst.p) {
        const k = R.burst.t / 0.5, n = R.burst.big ? 24 : 14;
        g.globalAlpha = 1 - k;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + i * 0.37, d = br * (1.1 + k * (R.burst.big ? 3 : 1.8));
          g.strokeStyle = i % 2 ? '#ffd23a' : '#ffffff'; g.lineWidth = 3 * u;
          g.beginPath(); g.moveTo(b.x + Math.cos(ang) * d, b.y + Math.sin(ang) * d); g.lineTo(b.x + Math.cos(ang) * (d + 12 * u), b.y + Math.sin(ang) * (d + 12 * u)); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
  }

  // 의성어·글자 (zoom: 찌 확대 창 안 위쪽)
  const zr = zoom ? zoomRect(W, H) : null;
  for (const x of S.texts) {
    let p;
    if (x.zoom) { if (!zr) continue; p = { x: zr.x + zr.s / 2, y: zr.y + zr.s * 0.22 }; }
    else if (x.at) { p = proj(x.at); if (!p.ok) continue; } else p = { x: x.sx * W, y: x.sy * H };
    const k = x.t / x.life;
    const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : k < 0.22 ? 1.1 - (k - 0.12) : 1;
    const a = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
    const sx = (Math.random() - 0.5) * x.shake * 2, sy = (Math.random() - 0.5) * x.shake * 2;
    g.save(); g.globalAlpha = a; g.translate(p.x + sx, p.y + sy - k * x.rise); g.scale(pop, pop);
    out(x.txt, 0, 0, x.size * u, x.color, Math.max(4, x.size * u * 0.16));
    g.restore();
  }

  // 판정 (챔질)
  if (S.judge) {
    const J = S.judge, k = J.t;
    const pop = k < 0.1 ? 0.5 + k * 6 : k < 0.2 ? 1.1 - (k - 0.1) : 1;
    g.save(); g.globalAlpha = k > 0.8 ? 1 - (k - 0.8) / 0.3 : 1; g.translate(W / 2, H * 0.22); g.scale(pop, pop);
    out(J.txt, 0, 0, 46 * u, J.color, 8);
    if (J.sub) { g.font = UI(700, 15 * u); g.lineWidth = 4; g.strokeStyle = 'rgba(10,25,45,.7)'; g.strokeText(J.sub, 0, 36 * u); g.fillStyle = '#fff'; g.fillText(J.sub, 0, 36 * u); }
    g.restore();
  }

  // 집중선 컷인 (단계가 오를 때 "무겁다!" · 잡을 때 희귀·전설 공개)
  if (S.cutin && S.cutin.t < (S.cutin.dur || 1)) {
    const C = S.cutin, k = C.t / (C.dur || 1); // 단계가 오를 때는 짧게(0.6초)·덜 어둡게 — 첫 원이 잘 보이게
    const a = k < 0.1 ? k / 0.1 : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    g.save(); g.globalAlpha = a;
    g.fillStyle = `rgba(0,0,0,${C.dim ?? 0.35})`; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H / 2);
    for (let i = 0; i < 70; i++) {
      const ang = (i / 70) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05;
      const r0 = m * (0.28 + ((i * 37) % 10) / 40), r1 = Math.hypot(W, H);
      g.fillStyle = i % 3 ? 'rgba(255,255,255,.85)' : C.color;
      g.beginPath(); g.moveTo(Math.cos(ang - 0.006) * r0, Math.sin(ang - 0.006) * r0); g.lineTo(Math.cos(ang - 0.02) * r1, Math.sin(ang - 0.02) * r1); g.lineTo(Math.cos(ang + 0.02) * r1, Math.sin(ang + 0.02) * r1); g.closePath(); g.fill();
    }
    const slide = k < 0.15 ? (1 - k / 0.15) * W * 0.6 : 0;
    out(C.txt, slide, -10 * u, 70 * u, C.color, 10);
    out(C.sub, -slide, 48 * u, 30 * u, '#fff', 6);
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
  const E = S.ev;
  const hints = {
    ready: S.drag ? '위로 쭉! 빠를수록 멀리' : S.hint?.txt || '누른 채 위로 끌어올려 던지기 · 기울인 쪽으로 · 빠를수록 멀리',
    cast: '',
    wait: S.alertT >= 0 ? '지금!' : E || S.evI >= 0 ? "참기… '!'가 뜨면 누르기" : "기다려요… '!'가 뜨면 누르기",
    fight: S.R && (S.R.rt ?? 0) > S.R.t0 - 2 * S.R.spb ? '원이 닿을 때 누르기 · 박자에 맞춰' : '',
    land: '',
    result: S.t > 0.7 ? '눌러서 다시 던지기' : '',
  };
  const hint = hints[S.mode];
  if (hint) {
    g.font = UI(700, clamp(m * 0.032, 14, 20));
    const tw = g.measureText(hint).width + 34, th = 40, hy = H - 74;
    glass(g, W / 2 - tw / 2, hy - th / 2, tw, th, th / 2);
    g.fillStyle = /지금/.test(hint) ? '#FF8A1F' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(hint, W / 2, hy + 1);
  }

  if (S.mode === 'result' && S.result) drawResult(g, W, H, S, u);

  g.font = UI(600, 12); g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(`잡은 물고기 ${caught}마리`, 18, 52);

  if (S.flash > 0) { g.fillStyle = `rgba(255,255,255,${S.flash * 0.5})`; g.fillRect(0, 0, W, H); }
}

function drawResult(g, W, H, S, u) {
  const R = S.result;
  const a = clamp(S.t * 4, 0, 1), pop = 0.9 + 0.1 * Math.min(1, S.t * 5);
  const cw = Math.min(340, W - 32), ch = R.ok ? 250 : 160;
  g.save(); g.globalAlpha = a; g.translate(W / 2, H * 0.45); g.scale(pop, pop);
  glass(g, -cw / 2, -ch / 2, cw, ch, 24);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (R.ok) {
    const gr = GRADE[R.fish.grade];
    g.font = UI(800, 13); const gt = gr.label + (R.near ? ' · 🫧 기포' : ''); const gw = g.measureText(gt).width + 18;
    g.fillStyle = gr.color; rr(g, -gw / 2, -ch / 2 + 16, gw, 22, 11); g.fill();
    g.fillStyle = R.fish.grade === 'legend' ? '#3a2a00' : '#0b1633'; g.fillText(gt, 0, -ch / 2 + 27);
    g.font = '54px sans-serif'; g.fillText(R.fish.emoji, 0, -34);
    g.font = JUA(28); g.fillStyle = '#fff'; g.fillText(`${R.fish.name} ${R.cm}cm`, 0, 24);
    g.font = UI(600, 13); g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(`챔질 ${R.grade} · 리듬 Perfect ${R.perfects} · Good ${R.hits - R.perfects} · Miss ${R.misses}`, 0, 54);
    g.fillText(`${R.calm ? `참기 ✨ ${R.calm}번` : ''}${R.calm && !R.rec ? ' · ' : ''}${R.rec ? '' : `최고 ${R.best}cm`}`, 0, 74);
    if (R.rec) {
      g.font = UI(800, 14); const t = '🏆 새 기록!'; const tw = g.measureText(t).width + 22;
      g.fillStyle = '#FF8A1F'; rr(g, -tw / 2, 88, tw, 26, 13); g.fill();
      g.fillStyle = '#fff'; g.fillText(t, 0, 101);
    }
  } else {
    g.font = JUA(28); g.fillStyle = '#fff'; g.fillText(R.title, 0, -26);
    g.font = UI(600, 14); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(R.sub, 0, 10);
    if (R.regret) { g.font = JUA(18); g.fillStyle = GRADE[R.grade].color; g.fillText(R.regret, 0, 44); }
  }
  g.restore();
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, Math.max(0, h), r); }
function glass(g, x, y, w, h, r) {
  g.fillStyle = 'rgba(15,25,50,.58)'; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
  rr(g, x, y, w, h, r); g.fill(); g.stroke();
}
