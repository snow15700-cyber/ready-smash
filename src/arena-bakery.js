// 빵집: 갓 구운 빵 냄새 나는 동네 빵집 한가운데 탁구대.
// A팀 쪽 벽(-z) = 벽돌 오븐(불꽃이 일렁임) + 칠판 메뉴판, B팀 쪽 벽(+z) = 유리 진열장·계산대·출입문,
// 왼쪽 벽(-x) = 빵이 가득한 나무 선반, 오른쪽 벽(+x) = 창가 카페 자리. 천장엔 나무 들보와 펜던트 조명, 빵 위로 모락모락 김
import * as THREE from 'three';
import { seeded, canvasTex, glowSprite, std, addBox, makeDrift, dotTex, textTex } from './arena-kit.js';

const RX = 6.5, RZ = 8.5, RH = 3.6;
const CRUST = 0xc98a45, CRUST_D = 0xa8692e, GOLD = 0xe2a55a, CREAM = 0xf6e7c8;

// ---------- 빵 모양들 ----------
function loaf() { // 식빵 (윗면이 봉긋한 3봉 식빵)
  const g = new THREE.Group(), c = std(CRUST, { flatShading: true }), w = std(0xf7ecd2);
  addBox(g, 0.2, 0.12, 0.13, c, 0, 0.06, 0);
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), c); b.scale.set(1, 0.75, 1); b.position.set(-0.065 + i * 0.065, 0.12, 0); g.add(b); }
  addBox(g, 0.005, 0.11, 0.12, w, 0.1, 0.06, 0);
  return g;
}
function croissant() {
  const g = new THREE.Group(), c = std(GOLD, { flatShading: true });
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45, r = 0.034 - Math.abs(i - 2) * 0.008;
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), c);
    s.scale.set(1.3, 0.9, 1); s.position.set(Math.sin(a) * 0.07, r * 0.8, -Math.cos(a) * 0.05 + 0.04); s.rotation.y = a; g.add(s);
  }
  return g;
}
function baguette(len = 0.6) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, len, 4, 10), std(GOLD, { flatShading: true }));
  b.rotation.z = Math.PI / 2; g.add(b);
  for (let i = 0; i < 4; i++) { const cut = addBox(g, 0.02, 0.006, 0.05, std(0xf3dcae), -len / 2 + 0.1 + i * (len - 0.2) / 3, 0.034, 0); cut.rotation.y = 0.6; }
  return g;
}
function donut(icing) {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.025, 10, 18), std(GOLD)); d.rotation.x = Math.PI / 2; d.position.y = 0.025; g.add(d);
  const ic = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.022, 8, 18, Math.PI * 2), std(icing)); ic.rotation.x = Math.PI / 2; ic.position.y = 0.034; ic.scale.z = 0.7; g.add(ic);
  const spr = [0xff4d4d, 0xffd84a, 0x4dd2ff, 0xffffff];
  for (let i = 0; i < 7; i++) { const a = i * 0.9; const s = addBox(g, 0.012, 0.004, 0.004, std(spr[i % 4]), Math.cos(a) * 0.045, 0.05, Math.sin(a) * 0.045); s.rotation.y = a * 2; }
  return g;
}
function bun(col = CRUST_D) { // 단팥빵·소금빵
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), std(col)); b.scale.set(1, 0.6, 1); b.position.y = 0.03; g.add(b);
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), std(0xf7ecd2)); s.position.set(0, 0.066, 0); g.add(s);
  return g;
}
function cake(col) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 20), std(0xfff6e6)); c.position.y = 0.06; g.add(c);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.123, 0.123, 0.03, 20), std(col)); top.position.y = 0.12; g.add(top);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std(0xe0333c)); s.position.set(Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08); g.add(s); }
  return g;
}

export function buildBakery() {
  const root = new THREE.Group();
  const rnd = seeded(52);

  // ---------- 바닥·벽·천장 ----------
  const floorTex = canvasTex(256, 256, (g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#f1e3c8' : '#9a6a44'; g.fillRect(x * 32, y * 32, 32, 32); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(RX / 2, RZ / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const wallTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f7ebd3'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(214,170,120,0.25)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 12, 256);
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(6, 1);
  const wallM = new THREE.MeshLambertMaterial({ map: wallTex });
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, -RZ);
  addBox(root, RX * 2, RH, 0.2, wallM, 0, RH / 2, RZ);
  addBox(root, 0.2, RH, RZ * 2, wallM, -RX, RH / 2, 0);
  addBox(root, 0.2, RH, RZ * 2, wallM, RX, RH / 2, 0);
  // 아래 나무 벽판
  const wain = std(0x8a5a32);
  addBox(root, RX * 2, 1.0, 0.06, wain, 0, 0.5, -RZ + 0.12); addBox(root, RX * 2, 1.0, 0.06, wain, 0, 0.5, RZ - 0.12);
  addBox(root, 0.06, 1.0, RZ * 2, wain, -RX + 0.12, 0.5, 0); addBox(root, 0.06, 1.0, RZ * 2, wain, RX - 0.12, 0.5, 0);
  for (const [w, d, x, z] of [[RX * 2, 0.1, 0, -RZ + 0.14], [RX * 2, 0.1, 0, RZ - 0.14], [0.1, RZ * 2, -RX + 0.14, 0], [0.1, RZ * 2, RX - 0.14, 0]]) addBox(root, w, 0.06, d, std(0x6b4224), x, 1.02, z);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ * 2), new THREE.MeshLambertMaterial({ color: 0xf3e6cf, emissive: 0x8a7258, emissiveIntensity: 0.5 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = RH; root.add(ceil);
  for (let z = -RZ + 1.2; z < RZ; z += 2.4) addBox(root, RX * 2, 0.22, 0.18, std(0x7a4a26), 0, RH - 0.11, z);
  // 펜던트 조명 (따뜻한 빛)
  const lamps = [];
  for (const [x, z] of [[-2.6, -4], [2.6, -4], [-2.6, 4], [0, -6.8], [0, 6.6]]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), std(0x222222)); cord.position.set(x, RH - 0.45, z); root.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.24, 18, 1, true), std(0x2f5d4a, { side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 })); shade.position.set(x, RH - 0.95, z); root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c4 })); bulb.position.set(x, RH - 1.06, z); bulb.userData.noFocus = true; root.add(bulb);
    const gl = glowSprite(0xffd28a, 1.3, 0.7); gl.position.copy(bulb.position); root.add(gl);
    lamps.push(gl);
  }

  // ---------- A팀 쪽 벽 (-z): 벽돌 오븐 + 칠판 메뉴판 ----------
  const brickTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d9c7b0'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) {
      const v = (x * 7 + y * 13) % 5;
      g.fillStyle = ['#b5523b', '#a84a34', '#c05c43', '#9c4430', '#b9583f'][v];
      g.fillRect(x * 32 + (y % 2) * 16 + 2, y * 16 + 2, 28, 12);
    }
  });
  brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping; brickTex.repeat.set(2, 2);
  const brick = new THREE.MeshLambertMaterial({ map: brickTex });
  const oven = new THREE.Group();
  addBox(oven, 3.0, 1.0, 1.4, brick, 0, 0.5, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), brick); dome.scale.set(1.1, 0.85, 0.75); dome.position.y = 1.0; oven.add(dome);
  const chim = addBox(oven, 0.5, 1.6, 0.5, brick, 0.6, 2.4, -0.3);
  // 아치 입구 + 불
  const archS = new THREE.Shape(); archS.moveTo(-0.45, 0); archS.lineTo(-0.45, 0.35); archS.absarc(0, 0.35, 0.45, Math.PI, 0, true); archS.lineTo(0.45, 0); archS.lineTo(-0.45, 0);
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(archS), new THREE.MeshBasicMaterial({ color: 0x1a0d08 })); mouth.position.set(0, 1.0, 1.06); oven.add(mouth);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const fire = new THREE.Mesh(new THREE.ShapeGeometry(archS), fireMat); fire.scale.set(0.8, 0.55, 1); fire.position.set(0, 1.0, 1.07); fire.userData.noFocus = true; oven.add(fire);
  const flames = [];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd04a : 0xff6a1a })); f.position.set(-0.24 + i * 0.12, 1.15, 1.0); f.userData.noFocus = true; oven.add(f); flames.push(f); }
  const glowF = glowSprite(0xff9a3a, 2.4, 0.8); glowF.position.set(0, 1.25, 1.2); oven.add(glowF);
  addBox(oven, 1.2, 0.08, 0.4, std(0x6b4224), 0, 0.98, 1.25);
  // 빵 삽 (오븐 옆에 기대어)
  const peel = new THREE.Group();
  const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), std(0xa87c4f)); ph.position.y = 0.8; peel.add(ph);
  addBox(peel, 0.38, 0.45, 0.02, std(0xc29a6a), 0, 1.75, 0);
  peel.position.set(1.8, 0, 0.6); peel.rotation.z = -0.15; oven.add(peel);
  const fireLight = new THREE.PointLight(0xff8a3a, 6, 7, 1.6); fireLight.position.set(0, 1.3, 1.6); oven.add(fireLight);
  oven.position.set(-1.6, 0, -RZ + 0.85); root.add(oven);
  // 칠판 메뉴판
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), new THREE.MeshLambertMaterial({ map: canvasTex(512, 360, (g) => {
    g.fillStyle = '#2d3a32'; g.fillRect(0, 0, 512, 360);
    g.strokeStyle = '#8a5a32'; g.lineWidth = 18; g.strokeRect(9, 9, 494, 342);
    g.fillStyle = '#fff6dc'; g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.fillText('🥐 오늘의 빵', 256, 72);
    g.font = 'bold 32px sans-serif'; g.textAlign = 'left';
    [['소금빵', '2,800'], ['우유 식빵', '4,500'], ['크루아상', '3,200'], ['단팥빵', '2,000'], ['탁구공 마카롱', '1,500']].forEach(([n, p], i) => {
      g.fillStyle = '#fff6dc'; g.fillText(n, 46, 130 + i * 44);
      g.fillStyle = '#ffd84a'; g.textAlign = 'right'; g.fillText(p, 466, 130 + i * 44); g.textAlign = 'left';
    });
  }) }));
  menu.position.set(2.6, 2.1, -RZ + 0.12); root.add(menu);
  // 밀가루 포대
  for (const [x, zz, r] of [[1.4, -RZ + 0.5, 0.2], [1.85, -RZ + 0.45, -0.1]]) {
    const sack = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 4, 10), std(0xefe4cc)); sack.position.set(x, 0.36, zz); sack.rotation.z = r; sack.castShadow = true; root.add(sack);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ map: textTex('밀가루', { w: 128, h: 80, bg: '#efe4cc', color: '#a84a34', font: 'bold 34px sans-serif' }) }));
    lab.position.set(0, 0.03, 0.23); sack.add(lab);
  }
  // 오븐 앞 갓 구운 빵 트레이 (김이 모락모락)
  const rack = new THREE.Group(), steel = std(0xc8ccd2, { metalness: 0.7, roughness: 0.3 });
  for (const [x, z] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) addBox(rack, 0.03, 1.4, 0.03, steel, x, 0.7, z);
  const steamFrom = [];
  for (let s = 0; s < 3; s++) {
    const y = 0.45 + s * 0.42;
    addBox(rack, 0.95, 0.02, 0.65, steel, 0, y, 0);
    for (let i = 0; i < 6; i++) { const b = s === 1 ? croissant() : bun(s ? CRUST_D : GOLD); b.position.set(-0.32 + (i % 3) * 0.32, y + 0.01, -0.15 + Math.floor(i / 3) * 0.3); rack.add(b); }
  }
  rack.position.set(3.9, 0, -RZ + 1.0); root.add(rack);
  steamFrom.push(new THREE.Vector3(3.9, 1.4, -RZ + 1.0));

  // ---------- B팀 쪽 벽 (+z): 진열장·계산대·문 ----------
  const counter = new THREE.Group();
  addBox(counter, 4.2, 0.9, 0.8, std(0x9a6a44), 0, 0.45, 0);
  addBox(counter, 4.3, 0.06, 0.9, std(0xf4ede0), 0, 0.93, 0);
  const caseGlass = new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
  const cg = addBox(counter, 4.1, 0.55, 0.7, caseGlass, 0, 1.24, 0); cg.userData.noFocus = true;
  addBox(counter, 4.12, 0.03, 0.72, std(0xb8bcc2, { metalness: 0.6 }), 0, 1.52, 0);
  const show = [() => loaf(), () => croissant(), () => donut(0xff9ac6), () => donut(0x7a4a2a), () => bun(), () => cake(0xffb3c7), () => cake(0xfff1a8), () => croissant(), () => loaf(), () => donut(0xffffff)];
  for (let i = 0; i < 10; i++) { const b = show[i](); b.position.set(-1.8 + i * 0.4, 0.97, -0.05 + (i % 2) * 0.12); counter.add(b); }
  for (let i = 0; i < 8; i++) { const b = (i % 2 ? bun : croissant)(); b.position.set(-1.6 + i * 0.45, 1.29, 0.0); counter.add(b); }
  addBox(counter, 4.1, 0.02, 0.6, std(0xf4ede0), 0, 1.27, 0);
  // 계산대 (금전등록기)
  const reg = new THREE.Group();
  addBox(reg, 0.42, 0.18, 0.36, std(0xd8c39a, { metalness: 0.3 }), 0, 0.09, 0);
  const scr = addBox(reg, 0.32, 0.18, 0.04, std(0x2b3a4a), 0, 0.28, -0.08); scr.rotation.x = 0.3;
  reg.position.set(1.5, 1.53, 0.05); counter.add(reg);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd9b44a, { metalness: 0.9, roughness: 0.2 })); bell.position.set(0.9, 1.55, 0.2); counter.add(bell);
  counter.rotation.y = Math.PI; counter.position.set(-1.2, 0, RZ - 1.4); root.add(counter);
  // 문 + 창 (밖은 환한 낮 거리)
  const outside = new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(0.65, '#e8f6ff'); gr.addColorStop(0.66, '#cfd6dd'); gr.addColorStop(1, '#a9b1ba');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,170,90,0.7)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(30 + i * 50, 150, 26, 0, 7); g.fill(); }
  }) });
  const door = new THREE.Group();
  addBox(door, 1.1, 2.3, 0.08, std(0x2f5d4a), 0, 1.15, 0);
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.5), outside); dg.position.set(0, 1.35, -0.05); dg.rotation.y = Math.PI; door.add(dg);
  const openSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), new THREE.MeshBasicMaterial({ map: textTex('OPEN', { w: 200, h: 80, bg: '#e0333c', color: '#fff', font: 'bold 54px sans-serif' }) }));
  openSign.position.set(0, 1.55, -0.07); openSign.rotation.y = Math.PI; door.add(openSign);
  door.position.set(3.6, 0, RZ - 0.1); root.add(door);
  const shopWin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), outside); shopWin.position.set(-1.2, 2.25, RZ - 0.11); shopWin.rotation.y = Math.PI; root.add(shopWin);
  for (let i = 0; i <= 3; i++) addBox(root, 0.06, 1.35, 0.08, std(0x2f5d4a), -2.5 + i * 0.87, 2.25, RZ - 0.13);
  // 가게 이름
  const name = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: textTex('🥖 스매시 베이커리', { w: 640, h: 132, bg: '#7a4a26', color: '#fff3d6', font: 'bold 64px sans-serif' }) }));
  name.rotation.y = Math.PI; name.position.set(-1.2, 3.18, RZ - 0.12); root.add(name);

  // ---------- 왼쪽 벽 (-x): 빵 선반 ----------
  const shelf = new THREE.Group(), sw = std(0x9a6a44);
  addBox(shelf, 0.06, 2.5, 5.6, sw, -0.25, 1.25, 0); // 뒤판
  for (const z of [-2.8, 2.8]) addBox(shelf, 0.55, 2.5, 0.06, sw, 0.02, 1.25, z); // 옆판
  const crown = addBox(shelf, 0.62, 0.12, 5.7, std(0x6b4224), 0.02, 2.5, 0);
  for (let r = 0; r < 4; r++) {
    const y = 0.5 + r * 0.55;
    addBox(shelf, 0.55, 0.04, 5.6, std(0xb98a5a), 0.02, y, 0);
    for (let i = 0; i < 9; i++) {
      const z = -2.45 + i * 0.6;
      if (r === 3 && i % 3 === 1) { // 바게트 바구니
        const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.25, 12), std(0xc8924e)); bk.position.set(0.05, y + 0.14, z); shelf.add(bk);
        for (let k = 0; k < 4; k++) { const bg = baguette(0.55); bg.rotation.z = Math.PI / 2 - 0.15 + k * 0.08; bg.rotation.y = k * 1.4; bg.position.set(0.05 + (k % 2) * 0.05, y + 0.35, z + (k - 1.5) * 0.04); shelf.add(bg); }
        continue;
      }
      const make = [loaf, croissant, () => bun(), () => bun(GOLD)][(i + r) % 4];
      for (let k = 0; k < 2; k++) { const b = make(); b.scale.setScalar(1.6); b.position.set(0.08 - k * 0.16, y + 0.02, z + (k ? 0.13 : -0.1)); b.rotation.y = Math.PI / 2 + k * 0.3; shelf.add(b); }
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff })); tag.position.set(0.29, y - 0.03, z); tag.rotation.y = Math.PI / 2; shelf.add(tag);
    }
  }
  shelf.position.set(-RX + 0.38, 0, 0); root.add(shelf);
  // 바게트 바구니 (선반 옆 바닥)
  const bigBasket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 14), std(0xc8924e)); bigBasket.position.set(-RX + 0.8, 0.25, 3.6); root.add(bigBasket);
  for (let k = 0; k < 6; k++) { const bg = baguette(0.8); bg.rotation.z = Math.PI / 2 - 0.2 + (k % 3) * 0.12; bg.rotation.y = k; bg.position.set(-RX + 0.8 + Math.cos(k) * 0.1, 0.7, 3.6 + Math.sin(k) * 0.1); root.add(bg); }

  // ---------- 오른쪽 벽 (+x): 창가 카페 자리 ----------
  for (const z of [-3.2, 0, 3.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.4), outside); win.position.set(RX - 0.11, 2.0, z); win.rotation.y = -Math.PI / 2; root.add(win);
    addBox(root, 0.08, 1.5, 0.06, std(0x2f5d4a), RX - 0.13, 2.0, z);
    addBox(root, 0.08, 0.06, 1.9, std(0x2f5d4a), RX - 0.13, 2.0, z);
    addBox(root, 0.25, 0.05, 1.9, std(0x6b4224), RX - 0.2, 1.28, z);
    // 창틀 화분
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 10), std(0xd9744a)); pot.position.set(RX - 0.22, 1.39, z + 0.6); root.add(pot);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: 0x4f9a46, flatShading: true })); leaf.position.set(RX - 0.22, 1.55, z + 0.6); root.add(leaf);
  }
  const cafeTable = (x, z) => {
    const g = new THREE.Group(), m = std(0xf4ede0), k = std(0x2b2f3a, { metalness: 0.5 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 22), m); top.position.y = 0.74; top.castShadow = true; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8), k); leg.position.y = 0.37; g.add(leg);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.08, 12), std(0xffffff)); cup.position.set(0.1, 0.8, 0); g.add(cup);
    const cof = new THREE.Mesh(new THREE.CircleGeometry(0.036, 12), std(0x5b3a20)); cof.rotation.x = -Math.PI / 2; cof.position.set(0.1, 0.835, 0); g.add(cof);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16), std(0xffffff)); plate.position.set(-0.1, 0.765, 0.05); g.add(plate);
    const c = croissant(); c.position.set(-0.1, 0.77, 0.05); g.add(c);
    for (const sd of [-1, 1]) {
      const chair = new THREE.Group(), cw = std(0x9a6a44);
      addBox(chair, 0.4, 0.04, 0.4, cw, 0, 0.45, 0); addBox(chair, 0.4, 0.45, 0.04, cw, 0, 0.7, -0.18);
      for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) addBox(chair, 0.03, 0.45, 0.03, k, lx, 0.22, lz);
      chair.position.set(0, 0, sd * 0.6); chair.rotation.y = sd > 0 ? Math.PI : 0; g.add(chair);
    }
    g.position.set(x, 0, z); root.add(g);
    steamFrom.push(new THREE.Vector3(x + 0.1, 0.86, z));
  };
  cafeTable(RX - 1.1, -3.2); cafeTable(RX - 1.1, 3.2);

  // ---------- 김·밀가루 먼지 ----------
  steamFrom.push(new THREE.Vector3(-1.2, 1.6, RZ - 1.4)); // 진열장 위
  const steamMat = new THREE.SpriteMaterial({ map: dotTex(), color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  const steam = [];
  for (const p of steamFrom) for (let k = 0; k < 6; k++) { const s = new THREE.Sprite(steamMat.clone()); s.userData = { base: p, age: k * 0.45, dx: (rnd() - 0.5) * 0.2, noFocus: true }; root.add(s); steam.push(s); }
  const flour = makeDrift(rnd, 140, [-RX + 0.5, RX - 0.5, 0.2, RH - 0.3, -RZ + 0.5, RZ - 0.5], { px: 2.5, opacity: 0.6, fall: 0.06, sway: 0.15, colors: ['#fff6e0'], additive: true });
  root.add(flour.pts);

  return {
    root,
    sky: '#f3e6cf',
    fog: [30, 80],
    far: 100,
    light: { hemi: ['#fff1dc', '#8a6448', 1.45], sun: ['#ffe2b8', 1.5, [1.5, 8, 2.5]] },
    tick(t, dt) {
      const fl = 0.75 + Math.sin(t * 11) * 0.12 + Math.sin(t * 7.3) * 0.1;
      fireMat.color.setRGB(1, 0.45 + fl * 0.15, 0.12);
      fireLight.intensity = 5 + fl * 2.2;
      glowF.scale.setScalar(2.2 + fl * 0.5);
      flames.forEach((f, i) => { f.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.7; f.position.y = 1.12 + f.scale.y * 0.05; });
      for (const s of steam) {
        s.userData.age = (s.userData.age + dt) % 2.7;
        const a = s.userData.age;
        s.position.set(s.userData.base.x + s.userData.dx + Math.sin(t * 2 + a * 3) * 0.04, s.userData.base.y + a * 0.28, s.userData.base.z);
        s.scale.setScalar(0.1 + a * 0.16);
        s.material.opacity = 0.32 * Math.sin((a / 2.7) * Math.PI);
      }
      flour.tick(t, dt);
      lamps.forEach((l, i) => l.scale.setScalar(1.25 + Math.sin(t * 1.3 + i) * 0.05));
    },
  };
}
