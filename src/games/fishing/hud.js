// 낚시 화면 (2D 캔버스, 3D 위에 겹침) — 리듬 방식 (fishing.md 8장)
//  준비: 꾹 누르는 동안 예상 범위(옅은 흰 부채꼴 + 지금 세기 흰 호) · 떨어질 자리 · 세기 막대(박 눈금) · 붉어짐(17장) · 기포 표시 / 입질: 찌 확대 창 테두리 · '!' / 줄다리기: 가운데 기본 원 + 줄어드는 원 · 거리 게이지
//  공통: 의성어 · 판정 · 집중선 컷인 · 도장 '쾅' · 결과 카드 (소리 없이도 손맛)
import * as THREE from 'three';
import { GRADE } from './data.js';
import { GENRE_LABEL, PADDLE_DUP_PIECES, castDist, landingPoint } from './rules.js';
import { seaHeight } from './world.js';
import { stars } from './market.js';
import { SEA_Y } from '../../campusLayout.js';

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
    const txt = S.bubbleNote.mine || !S.bubbleNote.genre ? '🫧 내 앞 바다에 기포가 올라와요! 근처에 던지면 귀한 물고기가 잘 와요' : `🫧 ${GENRE_LABEL[S.bubbleNote.genre]} 자리 바다에 기포가 올라와요`; // 13-3 🫧 어느 자리인지
    g.font = UI(700, clamp(m * 0.026, 12, 16)); const tw = g.measureText(txt).width + 28;
    glass(g, W / 2 - tw / 2, 58, tw, 34, 17); g.fillStyle = '#bff3ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, W / 2, 76);
    g.globalAlpha = 1;
  }

  // 기 모으기(17장): 화면 전체가 조금씩 붉어짐(가장자리부터) + 박마다 숨 쉬듯
  if (S.chargeV > 0.01) {
    const pulse = S.B ? S.B.pulse * S.B.pulse : 0, a = S.chargeV * (0.32 + pulse * 0.18);
    const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    grd.addColorStop(0, `rgba(255,60,30,${a * 0.12})`); grd.addColorStop(1, `rgba(230,20,20,${a})`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
  // 예상 범위 (17장, 11/27 사용자 요청 '세련되게'): 끝까지 모으면 닿는 부채꼴 전체 = 옅은 흰 면(약 10%) + 가는 테두리,
  //   (물결을 안 따라 평평하게) 지금 세기 = 은은하게 빛나는 흰 호(누를수록 앞으로), 모은 만큼은 아주 살짝 더 밝게. 방향 = 떨어질 자리까지 가는 흰 선 + 거리 글자
  if (S.mode === 'ready' && S.charge) {
    const fade = clamp((S.now - S.charge.t0) / 0.18, 0, 1), beat = S.B ? S.B.pulse * S.B.pulse : 0, full = S.power >= 1;
    const at = (aim, pw) => { const L = landingPoint(S.standX, aim, pw, S.standZ); return proj(new THREE.Vector3(L.x, SEA_Y, L.z)); }; // 평평한 바다 높이 (물결 따라 출렁이지 않게, 11/27 사용자 요청)
    const arc = (pw) => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(at(-1 + i / 12, pw)); return pts; };
    const inner = arc(0), outer = arc(S.power), max = arc(1);
    const path = (pts, move = true) => pts.forEach((q, i) => (i || !move ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    const band = (o, i) => { g.beginPath(); path(o); for (let k = i.length - 1; k >= 0; k--) g.lineTo(i[k].x, i[k].y); g.closePath(); };
    if ([...inner, ...max].every((q) => q.ok)) {
      g.save(); g.globalAlpha = fade; g.lineJoin = 'round'; g.lineCap = 'round';
      band(max, inner); g.fillStyle = 'rgba(255,255,255,.10)'; g.fill(); // 끝까지 닿는 범위 전체
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.28)'; g.stroke();
      band(outer, inner); g.fillStyle = `rgba(255,255,255,${0.07 + beat * 0.04})`; g.fill(); // 지금까지 모은 만큼
      g.shadowColor = 'rgba(255,255,255,.9)'; g.shadowBlur = 10 + beat * 8; // 지금 세기 호 (빛나는 흰 선)
      g.lineWidth = (full ? 3 : 2.2) + beat * 1.2; g.strokeStyle = 'rgba(255,255,255,.95)'; g.beginPath(); path(outer); g.stroke();
      g.shadowBlur = 0;
      const p0 = at(S.aim, 0), p1 = at(S.aim, S.power); // 방향: 가장 가까운 곳 → 떨어질 자리
      if (p0.ok && p1.ok) {
        const lg = g.createLinearGradient(p0.x, p0.y, p1.x, p1.y); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,.75)');
        g.lineWidth = 1.5; g.strokeStyle = lg; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
        g.font = UI(700, 13 * u); g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(255,255,255,.95)';
        g.shadowColor = 'rgba(10,25,45,.6)'; g.shadowBlur = 4; g.fillText(`${Math.round(castDist(S.power))}m`, p1.x, p1.y - 12 * u); g.shadowBlur = 0;
      }
      g.restore();
    }
  }
  // 준비: 떨어질 자리 표시 (누르는 동안 방향·세기를 따라 움직임, 안 누를 때는 가운데 중간에 흐리게)
  if (S.mode === 'ready') {
    const on = !!S.charge;
    const L = landingPoint(S.standX, on ? S.aim : 0, on ? S.power : 0.5, S.standZ);
    const p = proj(new THREE.Vector3(L.x, seaHeight(L.x, L.z, S.now), L.z));
    if (p.ok) {
      const r = (on ? 13 : 9) * u * (1.15 - S.power * 0.35), pulse = 1 + Math.sin(S.now * 6) * 0.08;
      g.save(); g.translate(p.x, p.y); g.scale(pulse, pulse);
      g.lineWidth = 3; g.strokeStyle = 'rgba(10,25,45,.45)'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.stroke();
      g.lineWidth = 2; g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.stroke();
      g.fillStyle = on ? '#fff' : 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(0, 0, 3, 1.6, 0, 0, 7); g.fill();
      g.restore();
    }
    // 세기 막대 (누르는 동안): 가까이 ~ 멀리, 박 눈금(4박이면 3줄)
    if (S.charge || S.power > 0.01) {
      const tw = 180 * u, ch = 12 * u, x0 = W / 2 - tw / 2, y0 = H - (W < 560 ? 168 : 128); // 휴대폰은 손가락·화면 아래 막대에 안 가리게 더 위로
      glass(g, x0 - 12, y0 - 26, tw + 24, ch + 36, 12);
      g.font = UI(700, 12); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`세기 ${Math.round(castDist(S.power))}m`, W / 2, y0 - 13);
      g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('가까이', x0, y0 - 13);
      g.textAlign = 'right'; g.fillText('멀리', x0 + tw, y0 - 13);
      g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, x0, y0, tw, ch, 6); g.fill();
      const grd = g.createLinearGradient(x0, 0, x0 + tw, 0); grd.addColorStop(0, '#7fe3a0'); grd.addColorStop(0.5, '#ffd23a'); grd.addColorStop(1, '#FF8A1F');
      g.fillStyle = grd; rr(g, x0, y0, tw * clamp(S.power, 0, 1), ch, 6); g.fill();
      const nb = TUNE.chargeBeats || 4; g.fillStyle = 'rgba(10,25,45,.45)';
      for (let i = 1; i < nb; i++) g.fillRect(x0 + tw * i / nb - 1, y0, 2, ch);
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
    // 색 달아오름(16장 C 2단계): 화면 가장자리 빛 — 겹(R.heatV 0~3)이 오를수록 진하고, 박마다 살짝 밝아짐
    const hv = R.heatV || 0, hc = heatColor(hv);
    if (hv > 0.02) {
      const a = Math.min(1, hv / 3) * (0.22 + R.pulse * 0.12 * (R.pulseAmp || 1));
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) / 2);
      vg.addColorStop(0, `rgba(${hc},0)`); vg.addColorStop(1, `rgba(${hc},${a})`);
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
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
      // 누른 순간 '꾹' 눌렸다가 튀어나옴(R.press 1 → 0): 처음엔 작아졌다가 살짝 넘쳐서 돌아옴
      const pk = R.press || 0, pt = 1 - pk, squash = pk > 0 ? -0.14 * Math.sin(pt * Math.PI * 2) * (1 - pt * 0.6) : 0;
      const pr = br * (1 + R.pulse * 0.12 + squash);
      if (pk > 0) { g.fillStyle = `rgba(255,255,255,${pk * 0.28})`; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.fill(); }
      if (hv > 0.02) { // 기본 원 둘레 빛 (색 달아오름)
        const gr = g.createRadialGradient(b.x, b.y, pr * 0.9, b.x, b.y, pr * (1.5 + hv * 0.15 + R.pulse * 0.15));
        gr.addColorStop(0, `rgba(${hc},${Math.min(1, hv / 2) * (0.5 + R.pulse * 0.3)})`); gr.addColorStop(1, `rgba(${hc},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, pr * 2, 0, 7); g.fill();
      }
      if (R.heatFlash > 0) { const k = 1 - R.heatFlash; g.globalAlpha = R.heatFlash; g.lineWidth = 6 * u; g.strokeStyle = `rgb(${hc})`; g.beginPath(); g.arc(b.x, b.y, pr * (1 + k * 2.2), 0, 7); g.stroke(); g.globalAlpha = 1; } // 한 겹 오를 때 빛 고리
      g.fillStyle = 'rgba(15,25,50,.35)'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.fill();
      g.lineWidth = 6 * u; g.strokeStyle = 'rgba(10,25,45,.55)'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.stroke();
      g.lineWidth = 3.5 * u; g.strokeStyle = hv > 0.5 ? `rgb(${mix('255,255,255', hc, Math.min(1, (hv - 0.5) / 2) * 0.6)})` : '#ffffff'; g.beginPath(); g.arc(b.x, b.y, pr, 0, 7); g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.25 + R.pulse * 0.5})`; g.beginPath(); g.arc(b.x, b.y, 7 * u, 0, 7); g.fill();
      // 줄어드는 원 (다가오는 노트들) — 시간은 리듬 시계(R.rt). 마지막 큰 노트는 굵은 금색, 3박 동안 천천히
      const rt = R.rt ?? 0;
      for (const n of R.notes) {
        if (n.len && n.tail === null) { // 발라드 긴 노트(13-3): 시작 원 ~ 끝 원(점선) 사이 띠. 시작을 맞추면 기본 원부터 띠가 밝게 (꾹 누르는 중)
          const kH = (n.t - rt) / n.appr, kT = (n.tEnd - rt) / n.appr;
          if (kH > 1) continue;
          const held = R.hold === n, rad = (k) => br * (1 + clamp(k, 0, 1.15) * 2.4);
          const rIn = held || n.res ? br : rad(kH), rOut = rad(kT);
          g.globalAlpha = clamp((1 - kH) * 3, 0, 1);
          g.fillStyle = held ? 'rgba(217,194,255,.42)' : 'rgba(217,194,255,.2)';
          g.beginPath(); g.arc(b.x, b.y, rOut, 0, 7); g.arc(b.x, b.y, rIn, 0, 7, true); g.fill();
          if (kT <= 1.15) {
            g.setLineDash([10 * u, 7 * u]);
            g.lineWidth = 7 * u; g.strokeStyle = 'rgba(10,25,45,.45)'; g.beginPath(); g.arc(b.x, b.y, rOut, 0, 7); g.stroke();
            g.lineWidth = 4 * u; g.strokeStyle = '#d9c2ff'; g.beginPath(); g.arc(b.x, b.y, rOut, 0, 7); g.stroke();
            g.setLineDash([]);
          }
          if (held) out('꾹~', b.x, b.y, 22 * u, '#fff', 4);
          g.globalAlpha = 1;
        }
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
        out(n.combo ? `Perfect ×${n.combo}` : n.res, b.x, b.y - br - 22 * u - k * 20, (n.res === 'Perfect' ? 30 + Math.min(4, n.combo || 0) * 2 : 26) * u, n.combo >= 3 ? '#ffd23a' : col, 5);
        const how = n.res === 'Miss' ? '너무' : '조금';
        if (n.ea) out(n.ea === 'early' ? `◀ ${how} 빨라요` : `${how} 늦어요 ▶`, b.x, b.y + br + 24 * u + k * 10, 16 * u, n.ea === 'early' ? '#8fd0ff' : '#ffb3a0', 4); // 빠름·늦음
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
    if (C.dy) g.translate(0, C.dy * H); // 크기 컷인은 아래쪽에 (도장 아래)
    out(C.txt, slide, -10 * u, 70 * u, C.color, 10);
    out(C.sub, -slide, 48 * u, 30 * u, '#fff', 6);
    g.restore();
  }

  // 도장 '쾅'
  if (S.stamp && S.mode === 'land') {
    const k = S.stamp.t, big = S.stamp.tier ? { big: 1.15, huge: 1.35, monster: 1.6 }[S.stamp.tier.id] : 1, sc = (k < 0.12 ? 2.4 - (k / 0.12) * 1.4 : 1) * big;
    g.save(); g.translate(W / 2, H * 0.6); g.rotate(-0.08); g.scale(sc, sc); // 물고기(위쪽)를 안 가리게 아래로 g.globalAlpha = Math.min(1, k * 8);
    g.font = JUA(40 * u); const tw = g.measureText(S.stamp.txt).width + 40 * u;
    g.fillStyle = 'rgba(255,250,240,.92)'; rr(g, -tw / 2, -32 * u, tw, 64 * u, 10); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#d23a2a'; rr(g, -tw / 2 + 5, -27 * u, tw - 10, 54 * u, 8); g.stroke();
    g.fillStyle = '#d23a2a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S.stamp.txt, 0, 2);
    g.restore();
  }

  // 안내 문구 (아래)
  const E = S.ev;
  const hints = {
    ready: S.charge ? (S.power >= 1 ? '최대! 놓으면 던져요' : S.charge.key ? '꾹… 오래 누를수록 멀리 · ←→ 방향' : '꾹… 오래 누를수록 멀리 · 좌우로 밀어 방향')
      : S.hint?.txt || '꾹 눌러 기 모으기 → 떼면 던지기 · 누른 채 좌우로 방향',
    cast: '',
    wait: S.alertT >= 0 ? '지금!' : E || S.evI >= 0 ? "참기… '!'가 뜨면 누르기" : "기다려요… '!'가 뜨면 누르기",
    fight: S.R && (S.R.rt ?? 0) > S.R.t0 - 2 * S.R.spb ? '원이 닿을 때 누르기 · 박자에 맞춰' : '',
    land: '',
    result: S.t > 0.7 ? '눌러서 다시 던지기' : '',
  };
  const hint = hints[S.mode];
  if (hint) {
    g.font = UI(700, clamp(m * 0.032, 14, 20));
    const tw = g.measureText(hint).width + 34, th = 40, hy = H - (W < 560 ? 104 : 74);
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
  const cw = Math.min(340, W - 32), ch = R.ok ? (R.coins != null || R.srvNote ? 356 : 326) : 160;
  g.save(); g.globalAlpha = a; g.translate(W / 2, H * 0.45); g.scale(pop, pop);
  glass(g, -cw / 2, -ch / 2, cw, ch, 24);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (R.ok) {
    const c = R.c, fish = c.kind === 'fish';
    const chip = c.kind === 'paddle' ? { label: '🏓 전설 탁구채', color: '#ffc21a' } : c.kind === 'junk' ? { label: '잡동사니', color: '#9fd3c0' } : GRADE[c.grade];
    g.font = UI(800, 13); const gt = chip.label + (R.near ? ' · 🫧 기포' : ''); const gw = g.measureText(gt).width + 18;
    g.fillStyle = chip.color; rr(g, -gw / 2, -ch / 2 + 16, gw, 22, 11); g.fill();
    g.fillStyle = '#0b1633'; g.fillText(gt, 0, -ch / 2 + 27);
    if (R.first) { // 도감에 처음
      g.font = UI(800, 12); const nt = '📖 NEW'; const nw = g.measureText(nt).width + 14;
      g.fillStyle = '#ff5a7a'; rr(g, cw / 2 - nw - 12, -ch / 2 + 16, nw, 22, 11); g.fill(); g.fillStyle = '#fff'; g.fillText(nt, cw / 2 - nw / 2 - 12, -ch / 2 + 27);
    }
    g.save(); g.translate(0, -28); // 가운데 내용(그림~크기 배지)을 위로 — 별 줄이 들어가 카드가 커져서
    if (R.img?.complete && R.img.naturalWidth) g.drawImage(R.img, -50, -84, 100, 100);
    else { g.font = '54px sans-serif'; g.fillText(c.emoji, 0, -34); }
    g.font = JUA(26); g.fillStyle = '#fff';
    g.fillText(fish ? `${c.name} ${R.cm}cm` : c.kind === 'junk' ? `에이… ${c.name}네` : `${c.name}!`, 0, 32);
    if (R.q != null) { // ⭐ 품질 별 (7장): 별 + 값 배율 — 크기 등급(월척·대물·괴물)과 따로
      g.font = JUA(24); const st = stars(R.q), sw = g.measureText(st).width;
      g.font = UI(800, 14); const qt = `  품질 값 ×${R.qx}`, qw = g.measureText(qt).width;
      g.textAlign = 'left';
      g.font = JUA(24); g.fillStyle = R.q ? '#ffd23a' : 'rgba(255,255,255,.45)'; g.fillText(st, -(sw + qw) / 2, 62);
      g.font = UI(800, 14); g.fillStyle = R.q ? '#ffe9a8' : 'rgba(255,255,255,.7)'; g.fillText(qt, -(sw + qw) / 2 + sw, 63);
      g.textAlign = 'center';
    }
    g.font = UI(600, 13); g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(`리듬 정확도 ${R.acc ?? 100}% · Perfect ${R.perfects} · Good ${R.hits - R.perfects} · Miss ${R.misses}`, 0, 88);
    const line = fish ? `보통의 ${R.times}배${R.rec ? '' : ` · 이 물고기 최고 ${R.best}cm`}` : c.kind === 'junk' ? '도감에 넣었어요 · 코인 0' : c.dup ? `이미 있어서 → 조각 ${PADDLE_DUP_PIECES}개` : R.coins != null ? '' : '옷장에 들어가요 (로그인하면)';
    g.fillText(line, 0, 108);
    const badge = R.tier ? `${R.tier.icon} ${R.tier.label}!` : fish && R.rec && !R.first ? '🏆 새 기록!' : '';
    if (badge) {
      g.font = UI(800, 14); const tw = g.measureText(badge).width + 22;
      g.fillStyle = R.tier ? R.tier.color : '#FF8A1F'; rr(g, -tw / 2, 120, tw, 26, 13); g.fill();
      g.fillStyle = R.tier ? '#2a1a00' : '#fff'; g.fillText(badge, 0, 133);
    }
    g.restore();
    if (R.coins != null || R.srvNote) { // 서버(로그인)에서 받은 코인
      g.font = UI(800, 14); g.fillStyle = R.srvNote ? '#ff9a9a' : '#ffd23a';
      g.fillText(R.srvNote || (c.kind === 'fish' ? (R.bagged ? `🎒 가방에 넣었어요 ${R.bagN}/30 · 🍣 횟집에서 팔아요` : R.capped ? '🎒 가방이 꽉 차고 오늘 판매 한도도 다 차서 놓아줬어요' : `${R.sold ? '🎒 가방이 꽉 차서 바로 팔았어요 · ' : ''}🪙 +${R.coins}코인${R.bonus ? ' (☕ +50%)' : ''}`) : c.kind === 'paddle' ? (R.pieces ? `🧩 조각 +${R.pieces}` : '🎽 옷장에 들어갔어요!') : '🪙 코인 0 (잡동사니)'), 0, ch / 2 - 22);
    }
  } else {
    g.font = JUA(28); g.fillStyle = '#fff'; g.fillText(R.title, 0, -26);
    g.font = UI(600, 14); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText(R.sub, 0, 10);
    if (R.regret) { g.font = JUA(18); g.fillStyle = GRADE[R.grade].color; g.fillText(R.regret, 0, 44); }
  }
  g.restore();
}

// 색 달아오름 색: 겹 0~3 → 주황(1) · 분홍(2) · 금색(3) 사이를 부드럽게. 'r,g,b' 글자로 돌려줌
const HEAT_COLS = ['255,150,40', '255,150,40', '255,80,150', '255,215,70'];
function mix(a, b, k) { const A = a.split(',').map(Number), B = b.split(',').map(Number); return A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(','); }
function heatColor(v) { const i = Math.min(2, Math.floor(v)), k = Math.min(1, v - i); return mix(HEAT_COLS[i], HEAT_COLS[i + 1], k); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, Math.max(0, h), r); }
function glass(g, x, y, w, h, r) {
  g.fillStyle = 'rgba(15,25,50,.58)'; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1;
  rr(g, x, y, w, h, r); g.fill(); g.stroke();
}
