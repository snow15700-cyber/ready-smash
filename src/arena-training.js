// 교육장(일반): 교육생들이 쉬는 시간에 탁구를 치는 바로 그 교육장.
// A팀 쪽 벽(-z) = 큰 화면에 '쉬는 시간 10분' 타이머(진짜로 1초씩 줄어듦) + 강사 탁자,
// 양옆 = 앞을 보고 줄지어 놓인 긴 책상·의자, B팀 쪽 벽(+z) = 다과 탁자·정수기·출입문, 오른쪽 창엔 블라인드
import * as THREE from 'three';
import { seeded, canvasTex, std, addBox, textTex, glowSprite } from './arena-kit.js';

const RX = 7.5, RZ = 9, RH = 3.2;
const BREAK = 600; // 쉬는 시간 10분 (초)

function chair(col) {
  const g = new THREE.Group(), k = std(0x30343b, { metalness: 0.5, roughness: 0.4 }), c = std(col);
  addBox(g, 0.46, 0.06, 0.44, c, 0, 0.46, 0);
  const back = addBox(g, 0.44, 0.42, 0.05, c, 0, 0.78, 0.22); back.rotation.x = -0.1;
  addBox(g, 0.04, 0.46, 0.04, k, 0, 0.23, 0);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const l = addBox(g, 0.03, 0.03, 0.26, k, Math.sin(a) * 0.12, 0.03, Math.cos(a) * 0.12); l.rotation.y = a; }
  return g;
}

export function buildTraining() {
  const root = new THREE.Group();
  const rnd = seeded(77);

  // ---------- 바닥(카펫 타일)·벽·천장 ----------
  const carpet = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#5a6677' : '#64707f'; g.fillRect(x * 64, y * 64, 64, 64);
      g.fillStyle = 'rgba(255,255,255,0.04)'; for (let k = 0; k < 40; k++) g.fillRect(x * 64 + ((k * 23) % 64), y * 64 + ((k * 41) % 64), 2, 2);
    }
  });
  carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(RX / 1, RZ / 1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ map: carpet }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallM = std(0xeef0f2), accent = std(0x2f6fb0);
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, -RZ);
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, RZ);
  addBox(root, 0.2, RH, RZ * 2, wallM, -RX, RH / 2, 0);
  addBox(root, 0.2, RH, RZ * 2, wallM, RX, RH / 2, 0);
  for (const [w, d, x, z] of [[RX * 2, 0.06, 0, -RZ + 0.12], [RX * 2, 0.06, 0, RZ - 0.12], [0.06, RZ * 2, -RX + 0.12, 0], [0.06, RZ * 2, RX - 0.12, 0]]) addBox(root, w, 0.1, d, std(0x3b4350), x, 0.05, z); // 걸레받이
  addBox(root, 0.04, 0.12, RZ * 2, accent, -RX + 0.12, 1.1, 0); // 파란 띠
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (g) => {
    g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#d6d9dd'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);
  }), emissive: 0x5e6266, emissiveIntensity: 0.5 }));
  ceil.material.map.wrapS = ceil.material.map.wrapT = THREE.RepeatWrapping; ceil.material.map.repeat.set(RX * 2 / 0.6, RZ * 2 / 0.6);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = RH; root.add(ceil);
  const panelM = new THREE.MeshBasicMaterial({ color: 0xfafcff });
  for (const x of [-4.8, -1.6, 1.6, 4.8]) for (const z of [-6.6, -2.2, 2.2, 6.6]) { const p = addBox(root, 0.6, 0.02, 0.6, panelM, x, RH - 0.01, z); p.userData.noFocus = true; }

  // ---------- A팀 쪽 벽 (-z): 쉬는 시간 타이머 화면 ----------
  const W = 1024, H = 576;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cg = cv.getContext('2d');
  const screenTex = new THREE.CanvasTexture(cv); screenTex.colorSpace = THREE.SRGBColorSpace;
  let shown = -1;
  const drawTimer = (left) => {
    const m = Math.floor(left / 60), s = left % 60;
    const gr = cg.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1d3f73'); gr.addColorStop(1, '#2f6fb0');
    cg.fillStyle = gr; cg.fillRect(0, 0, W, H);
    cg.fillStyle = 'rgba(255,255,255,0.08)'; cg.beginPath(); cg.arc(W - 90, 80, 220, 0, 7); cg.fill();
    cg.textAlign = 'center'; cg.textBaseline = 'middle';
    cg.fillStyle = '#ffd84a'; cg.font = 'bold 64px sans-serif'; cg.fillText('☕ 쉬는 시간', W / 2, 108);
    cg.fillStyle = '#ffffff'; cg.font = 'bold 250px monospace';
    cg.fillText(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, W / 2, 300);
    // 남은 시간 막대
    cg.fillStyle = 'rgba(255,255,255,0.2)'; cg.fillRect(140, 450, W - 280, 22);
    cg.fillStyle = left < 60 ? '#ff7b6b' : '#7fe0a8'; cg.fillRect(140, 450, (W - 280) * (left / BREAK), 22);
    cg.fillStyle = 'rgba(255,255,255,0.85)'; cg.font = 'bold 34px sans-serif';
    cg.fillText(left < 60 ? '곧 수업 시작해요!' : '다음 시간: 3교시', W / 2, 520);
    screenTex.needsUpdate = true;
  };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.25), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 1.6, -RZ + 0.145); screen.userData.noFocus = true; screen.userData.noBake = true; root.add(screen);
  addBox(root, 4.16, 2.41, 0.06, std(0x1f2329), 0, 1.6, -RZ + 0.1);
  const scrGlow = glowSprite(0x6fa8ff, 5.5, 0.18); scrGlow.position.set(0, 1.6, -RZ + 0.4); root.add(scrGlow);
  // 천장 프로젝터
  addBox(root, 0.4, 0.14, 0.34, std(0xe8e8e8), 0, RH - 0.35, -3.6);
  addBox(root, 0.04, 0.28, 0.04, std(0x9aa0a6), 0, RH - 0.14, -3.6);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), new THREE.MeshBasicMaterial({ color: 0xbfe0ff })); lens.position.set(0, RH - 0.35, -3.77); lens.rotation.y = Math.PI; lens.userData.noFocus = true; root.add(lens);
  // 강사 탁자 + 노트북 + 마이크
  const podium = new THREE.Group();
  addBox(podium, 1.6, 0.05, 0.7, std(0xdedede), 0, 0.75, 0);
  addBox(podium, 1.56, 0.6, 0.04, std(0x2f6fb0), 0, 0.45, 0.32);
  for (const x of [-0.75, 0.75]) addBox(podium, 0.04, 0.74, 0.66, std(0x8a929b, { metalness: 0.5 }), x, 0.37, 0);
  addBox(podium, 0.34, 0.02, 0.24, std(0x9aa0a6, { metalness: 0.6 }), -0.2, 0.785, 0);
  const lap = addBox(podium, 0.34, 0.22, 0.01, std(0x9aa0a6, { metalness: 0.6 }), -0.2, 0.89, -0.12); lap.rotation.x = -0.25;
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.2, 8), std(0x222222)); mic.position.set(0.4, 0.86, 0); mic.rotation.z = 0.4; podium.add(mic);
  podium.position.set(-4.4, 0, -RZ + 1.3); root.add(podium);
  // 화이트보드 (오른쪽)
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshLambertMaterial({ map: canvasTex(512, 312, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f6fb0'; g.lineWidth = 6; g.font = 'bold 40px sans-serif'; g.fillStyle = '#2f6fb0'; g.textAlign = 'left';
    g.fillText('오늘의 과정', 30, 60);
    g.fillStyle = '#333'; g.font = '30px sans-serif';
    ['1교시 오리엔테이션 ✔', '2교시 실습 ✔', '3교시 팀 프로젝트', '쉬는 시간엔 탁구! 🏓'].forEach((s, i) => g.fillText(s, 40, 120 + i * 46));
  }) }));
  wb.position.set(4.6, 1.6, -RZ + 0.12); root.add(wb);
  addBox(root, 1.86, 1.16, 0.03, std(0xb8bec4, { metalness: 0.5 }), 4.6, 1.6, -RZ + 0.1);
  addBox(root, 1.8, 0.04, 0.1, std(0xb8bec4), 4.6, 1.02, -RZ + 0.16);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.36), new THREE.MeshBasicMaterial({ map: textTex('2026 하반기 신입 교육 과정', { w: 1024, h: 92, bg: '#1d3f73', color: '#ffffff', font: 'bold 52px sans-serif' }) }));
  banner.position.set(0, 3.0, -RZ + 0.12); banner.scale.setScalar(0.9); root.add(banner);

  // ---------- 양옆: 앞(-z)을 보고 줄지어 놓인 긴 책상 + 의자 ----------
  const deskTop = std(0xeae6df), deskLeg = std(0x8a929b, { metalness: 0.5 });
  const seatCols = [0x2f6fb0, 0x2f6fb0, 0x3d4a5c];
  const items = [
    () => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.6, roughness: 0.1 })); b.position.y = 0.11; return b; }, // 물병
    () => { const g = new THREE.Group(); addBox(g, 0.32, 0.02, 0.22, std(0xffffff), 0, 0.01, 0); addBox(g, 0.32, 0.005, 0.22, std(0x2f6fb0), 0, 0.022, 0); return g; }, // 교재
    () => { const g = new THREE.Group(); addBox(g, 0.32, 0.015, 0.22, std(0x3a3f46, { metalness: 0.4 }), 0, 0.008, 0); const s = addBox(g, 0.32, 0.2, 0.01, std(0x3a3f46, { metalness: 0.4 }), 0, 0.1, -0.11); s.rotation.x = -0.25; return g; }, // 노트북
    () => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.09, 10), std(0xffffff)); c.position.y = 0.045; return c; }, // 종이컵
  ];
  for (const side of [-1, 1]) {
    for (let r = 0; r < 6; r++) {
      const z = -5.4 + r * 2.1, x = side * 5.0;
      const tb = new THREE.Group();
      addBox(tb, 2.6, 0.04, 0.6, deskTop, 0, 0.73, 0);
      addBox(tb, 2.5, 0.3, 0.02, deskLeg, 0, 0.5, -0.26);
      for (const lx of [-1.22, 1.22]) addBox(tb, 0.04, 0.71, 0.5, deskLeg, lx, 0.36, 0);
      for (let k = 0; k < 3; k++) {
        const it = items[Math.floor(rnd() * items.length)](); it.position.x = -0.85 + k * 0.85 + (rnd() - 0.5) * 0.2; it.position.y += 0.75; it.position.z = (rnd() - 0.5) * 0.2; it.rotation.y = (rnd() - 0.5) * 0.6; tb.add(it);
        const ch = chair(seatCols[(r + k) % 3]); ch.position.set(-0.85 + k * 0.85 + (rnd() - 0.5) * 0.1, 0, 0.55 + rnd() * 0.15); ch.rotation.y = (rnd() - 0.5) * 0.5; tb.add(ch);
      }
      // 이름표
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff })); tag.position.set(0.4, 0.79, -0.18); tag.rotation.x = -0.3; tb.add(tag);
      tb.position.set(x, 0, z); root.add(tb);
    }
  }

  // ---------- B팀 쪽 벽 (+z): 다과 탁자 · 정수기 · 출입문 ----------
  const snack = new THREE.Group();
  addBox(snack, 2.2, 0.04, 0.7, std(0xffffff), 0, 0.76, 0);
  addBox(snack, 2.2, 0.72, 0.02, std(0x2f6fb0), 0, 0.38, -0.34);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.3, 14), std(0x30343b, { metalness: 0.6 })); pot.position.set(-0.7, 0.93, 0); snack.add(pot);
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.08, 10), std(0xffffff)); c.position.set(-0.35 + (i % 3) * 0.09, 0.82 + Math.floor(i / 3) * 0.08, 0.1); snack.add(c); }
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 18), std(0xd9d9d9, { metalness: 0.5 })); tray.position.set(0.4, 0.79, 0); snack.add(tray);
  const snackCols = [0xf2c230, 0xe0333c, 0x7a4a2a, 0x2fa65a, 0xff8a3d];
  for (let i = 0; i < 10; i++) addBox(snack, 0.07, 0.03, 0.05, std(snackCols[i % 5]), 0.4 + Math.cos(i) * 0.15, 0.815, Math.sin(i) * 0.15);
  addBox(snack, 0.25, 0.3, 0.18, std(0xf6e7c8), 0.85, 0.93, 0); // 과자 상자
  snack.rotation.y = Math.PI; snack.position.set(-2.0, 0, RZ - 0.6); root.add(snack);
  const water = new THREE.Group();
  addBox(water, 0.34, 1.0, 0.34, std(0xf2f4f6), 0, 0.5, 0);
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.65, roughness: 0.1 })); jug.position.y = 1.2; water.add(jug);
  addBox(water, 0.06, 0.04, 0.04, std(0x3c8dbc), -0.06, 0.78, 0.18); addBox(water, 0.06, 0.04, 0.04, std(0xe0333c), 0.06, 0.78, 0.18);
  water.rotation.y = Math.PI; water.position.set(0.0, 0, RZ - 0.4); root.add(water);
  const door = new THREE.Group();
  addBox(door, 1.0, 2.2, 0.06, std(0x9aa3ad, { metalness: 0.3 }), 0, 1.1, 0);
  const dw = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.9), new THREE.MeshBasicMaterial({ color: 0xdfe6e9 })); dw.rotation.y = Math.PI; dw.position.set(0.25, 1.4, -0.04); door.add(dw);
  addBox(door, 0.04, 0.3, 0.06, std(0xcccccc, { metalness: 0.8 }), -0.36, 1.05, -0.06);
  door.position.set(4.6, 0, RZ - 0.1); root.add(door);
  const exitS = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ map: textTex('🚪 비상구', { w: 256, h: 92, bg: '#14a44d', color: '#ffffff', font: 'bold 46px sans-serif' }) }));
  exitS.rotation.y = Math.PI; exitS.position.set(4.6, 2.5, RZ - 0.12); exitS.userData.noFocus = true; root.add(exitS);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshLambertMaterial({ map: textTex(['함께 성장하는', '우리 🌱'], { w: 512, h: 330, bg: '#fff6dc', color: '#2b3a4a', border: '#f2c230', font: 'bold 58px sans-serif' }) }));
  poster.rotation.y = Math.PI; poster.position.set(2.0, 1.8, RZ - 0.12); root.add(poster);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  clock.rotation.y = Math.PI; clock.position.set(-4.6, 2.5, RZ - 0.12); root.add(clock);

  // ---------- 오른쪽 (+x): 블라인드 창 ----------
  const sky = new THREE.MeshBasicMaterial({ color: 0xcfe6f7 });
  for (const z of [-5, 0, 5]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), sky); win.rotation.y = -Math.PI / 2; win.position.set(RX - 0.11, 1.85, z); root.add(win);
    for (let i = 0; i < 14; i++) { const s = addBox(root, 0.05, 0.08, 3.4, std(0xf4f4f2), RX - 0.16, 2.68 - i * 0.1, z); s.rotation.z = 0.5; }
    addBox(root, 0.08, 0.06, 3.5, std(0xd0d4d8), RX - 0.14, 2.75, z);
  }
  // 왼쪽 (-x): 게시물 + 화분
  for (const [z, txt, col] of [[-4, '교육 일정표', '#c8e9ff'], [0, '🏓 탁구 리그 순위', '#fff3a8'], [4, '건의함', '#ffd1dc']]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ map: textTex(txt, { w: 384, h: 256, bg: col, color: '#2b3a4a', border: '#ffffff', font: 'bold 40px sans-serif' }) }));
    p.rotation.y = Math.PI / 2; p.position.set(-RX + 0.12, 1.85, z); root.add(p);
  }
  for (const [x, z] of [[-RX + 0.5, -RZ + 0.5], [RX - 0.5, RZ - 0.5]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 12), std(0xf4f4f2)); pot.position.set(x, 0.2, z); root.add(pot);
    for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 - k * 0.05, 0), new THREE.MeshLambertMaterial({ color: 0x3f8a46, flatShading: true })); l.position.set(x, 0.6 + k * 0.32, z); root.add(l); }
  }

  const t0 = performance.now() / 1000;
  drawTimer(BREAK);
  return {
    root,
    sky: '#eef0f2',
    fog: [30, 80],
    far: 100,
    light: { hemi: ['#f8fbff', '#8d96a3', 1.5], sun: ['#ffffff', 1.5, [-3, 8, 3]] },
    tick(t) {
      // 쉬는 시간 10분이 진짜로 1초씩 줄어든다 (0이 되면 다시 10:00)
      const left = BREAK - (Math.floor(t - t0) % (BREAK + 1));
      if (left !== shown) { shown = left; drawTimer(left); }
    },
  };
}
