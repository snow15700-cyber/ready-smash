// 배경(경기장 뽑기) — 체육관 대신 쓰는 장소들
// '09시' 시리즈는 사용자의 다른 게임 '09시까지 출근하세요'(snow15700-cyber/until09_new)의 코스 배경과
// 같은 모양·색으로 만든다 (그 게임 js/06-scene.js·07-car-models.js·08-pets.js·10-destination.js를 옮겨 옴)
// 좌표: 탁구대 가운데 = 원점, 탁구대 긴 쪽 = z, A팀(side 0)은 +z에서 -z를 본다. 단위 m
import * as THREE from 'three';
import { seeded, canvasTex, glowSprite, std, addBox, petYaw, makeFacade } from './arena-kit.js';
import { buildCorgi, buildCat } from './arena-pets.js';
import { makeCar, CAR_TYPES } from './arena-cars.js';
import { bakeArena } from './arena-bake.js';

/* ================= 도시 (빌딩·신호등·가로등) ================= */

function textTex(text, { bg, color, border, w = 512, h = 104, font = 'bold 60px sans-serif' }) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
    g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}
function clockTex(hh, mm) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#fdfbf4'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = '#1f2933';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 10, 8, 20); }
    g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('12', 128, 52); g.fillText('3', 205, 130); g.fillText('6', 128, 206); g.fillText('9', 52, 130);
    g.lineCap = 'round';
    const hand = (a, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
    hand(((hh % 12) + mm / 60) / 12 * Math.PI * 2, 60, 12, '#1f2933');
    hand((mm / 60) * Math.PI * 2, 90, 8, '#1f2933');
    g.fillStyle = '#e0333c'; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
  });
}

// 회사 본사 빌딩 ('㈜ 정시상사' + 9시 시계) — 09시 게임의 출근길 도착지
function buildOffice() {
  const g = new THREE.Group();
  const glass = std(0x7fa7d6, { metalness: 0.85, roughness: 0.12, emissive: 0x0b1a2e });
  const frame = std(0xd9dde3, { metalness: 0.6, roughness: 0.35 });
  const stone = std(0xb9b2a6);
  const dark = std(0x1f2933);
  addBox(g, 40, 9, 18, stone, 0, 4.5, -9);
  addBox(g, 22, 7, 0.3, glass, 0, 3.8, 0.05);
  for (let i = -5; i <= 5; i++) addBox(g, 0.35, 7.4, 0.5, frame, i * 2.2, 3.8, 0.2);
  addBox(g, 16, 0.5, 6, frame, 0, 7.6, 2.6);
  for (const x of [-7, 7]) addBox(g, 0.5, 7.4, 0.5, frame, x, 3.7, 5.3);
  const towerH = 70, tw = 26, td = 14;
  addBox(g, tw, towerH, td, glass, 0, 9 + towerH / 2, -10);
  for (let i = 0; i <= 13; i++) addBox(g, 0.35, towerH, 0.4, frame, -tw / 2 + i * (tw / 13), 9 + towerH / 2, -10 + td / 2 + 0.1);
  for (let y = 12; y < 9 + towerH; y += 4) addBox(g, tw + 0.2, 0.45, td + 0.2, frame, 0, y, -10);
  addBox(g, tw - 4, 5, td - 3, dark, 0, 9 + towerH + 2.5, -10);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 16, 8), frame); ant.position.set(4, 9 + towerH + 13, -10); g.add(ant);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 })); beacon.position.set(4, 9 + towerH + 21.3, -10); g.add(beacon);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.6), new THREE.MeshBasicMaterial({ map: textTex('㈜ 정시상사', { bg: '#0f172a', color: '#e2e8f0', border: '#94a3b8' }) }));
  sign.position.set(0, 9 + towerH + 2.5, -10 + (td - 3) / 2 + 0.05); g.add(sign);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshBasicMaterial({ map: clockTex(9, 0) }));
  clock.position.set(0, 13.5, -0.85); g.add(clock);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.3, 8, 40), frame); rim.position.copy(clock.position); g.add(rim);
  addBox(g, 10, 2, 0.2, stone, 0, 8.6, 0.0);
  return g;
}

/* ================= 출근길: 도로 옆 야외 탁구대 ================= */
// 탁구대는 넓은 인도 위. 탁구대 옆(+x)으로 4차선 도로가 탁구대와 나란히 지나가서
// A팀(오른쪽)·B팀(왼쪽) 모두 쌩쌩 지나가는 차가 보인다. 비 오는 회색 빌딩 숲, 멀리 회사 본사
const LANE = 3.2;
const ROAD_X0 = 4.6;           // 연석(도로 시작)
const ROAD_W = LANE * 4;
const ROAD_X1 = ROAD_X0 + ROAD_W;
const LANES = [0, 1, 2, 3].map((i) => ROAD_X0 + LANE * (i + 0.5));
const CAR_SCALE = 0.78;        // 09시 게임 차는 조금 크게 만들어져 있어 실제 크기(폭 약 1.9m)로 줄임
const SPAN = 150;              // 차가 오가는 길이 (±SPAN)
const OFFICE_Z = -62;          // 회사 본사 자리 (도로 건너편)

function buildCommute(scene) {
  const root = new THREE.Group();
  const rnd = seeded(9);

  // 바닥: 도로 + 인도(타일) + 연석
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, SPAN * 2 + 60), std(0x3a404d, { roughness: 0.55 }));
  road.rotation.x = -Math.PI / 2; road.position.set((ROAD_X0 + ROAD_X1) / 2, 0.005, 0); road.receiveShadow = true;
  root.add(road);
  const tileTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#a3a39e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 150 + ((x * 7 + y * 13) % 5) * 5;
      g.fillStyle = `rgb(${v},${v},${v - 4})`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  const walk = (x0, x1) => {
    const w = x1 - x0, t = tileTex.clone();
    t.repeat.set(w / 2.4, (SPAN * 2 + 60) / 2.4);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, SPAN * 2 + 60), new THREE.MeshLambertMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, 0); m.receiveShadow = true;
    root.add(m);
  };
  walk(-12, ROAD_X0);
  walk(ROAD_X1, ROAD_X1 + 6);
  const curbMat = std(0xcfcfc8);
  for (const x of [ROAD_X0, ROAD_X1]) addBox(root, 0.25, 0.15, SPAN * 2 + 60, curbMat, x, 0.075, 0);
  // 차선: 흰 점선 + 가운데 노란 겹선
  const lineW = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), lineY = new THREE.MeshBasicMaterial({ color: 0xf2c230 });
  for (const i of [1, 3]) {
    for (let z = -SPAN; z < SPAN; z += 9) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 3), lineW);
      m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X0 + LANE * i, 0.012, z); root.add(m);
    }
  }
  for (const dx of [-0.12, 0.12]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, SPAN * 2 + 60), lineY);
    m.rotation.x = -Math.PI / 2; m.position.set(ROAD_X0 + LANE * 2 + dx, 0.012, 0); root.add(m);
  }

  // 빌딩 숲 (09시 게임과 같은 창문 무늬·벽 색)
  const facades = [makeFacade(rnd), makeFacade(rnd), makeFacade(rnd)];
  const wallColors = [0x9aa3ad, 0x7d8794, 0xa89f94, 0x6f7b88, 0xb5b0a8, 0x8c96a3, 0x5f6b78];
  const roofMat = std(0x55595f);
  const matCache = {};
  const building = (w, h, d, x, z) => {
    const si = Math.floor(rnd() * 3), ci = Math.floor(rnd() * wallColors.length);
    const geo = new THREE.BoxGeometry(w, h, d);
    const rx = Math.max(1, Math.round(d / 3.5)), ry = Math.max(1, Math.round(h / 3.5)), rxx = Math.max(1, Math.round(w / 3.5));
    const uv = geo.attributes.uv;
    // 면 순서 +x, -x, +y, -y, +z, -z (면마다 4점). 옆면은 깊이(d), 앞뒤는 폭(w) 기준으로 창문 개수
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      const k = face < 2 ? rx : rxx;
      uv.setXY(i, uv.getX(i) * k, uv.getY(i) * ry);
    }
    const key = si + '_' + ci;
    const side = matCache[key] || (matCache[key] = std(wallColors[ci], { map: facades[si].map, emissive: 0xffc46b, emissiveMap: facades[si].emap, emissiveIntensity: 0 }));
    const b = new THREE.Mesh(geo, [side, side, roofMat, roofMat, side, side]);
    b.position.set(x, h / 2, z);
    root.add(b);
    return b;
  };
  // sd = -1: 탁구대 쪽(왼쪽) 빌딩, +1: 도로 건너편 빌딩
  for (const sd of [-1, 1]) {
    const x0 = sd < 0 ? -12.6 : ROAD_X1 + 6.6;
    let z = -SPAN;
    while (z < SPAN) {
      const d = 9 + rnd() * 5, w = 10 + rnd() * 6, h = 18 + rnd() * 40;
      if (!(sd > 0 && z + d > OFFICE_Z - 19 && z < OFFICE_Z + 19)) building(w, h, d, x0 + (sd * w) / 2, z + d / 2);
      z += d + 0.6;
    }
    for (let z2 = -SPAN; z2 < SPAN; z2 += 16) {
      const d = 12 + rnd() * 4, w = 14, h = 55 + rnd() * 60;
      if (!(sd > 0 && Math.abs(z2 - OFFICE_Z) < 22)) building(w, h, d, x0 + sd * (24 + rnd() * 6), z2);
    }
  }

  // 회사 본사 ('㈜ 정시상사' + 9시 시계): 도로 건너편에서 도로를 마주 본다
  const office = buildOffice();
  office.scale.setScalar(0.8);
  office.rotation.y = -Math.PI / 2;
  office.position.set(ROAD_X1 + 6.4, 0, OFFICE_Z);
  root.add(office);

  // 신호등 + 횡단보도 (양쪽 팀 앞에 하나씩)
  const poleMat = std(0x3b3f45, { metalness: 0.5, roughness: 0.5 });
  const housingMat = std(0x1b1d20);
  const lampOff = std(0x333333);
  const lampOn = { red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }), yellow: new THREE.MeshBasicMaterial({ color: 0xffc21a }), green: new THREE.MeshBasicMaterial({ color: 0x22e07a }) };
  const glowCol = { red: 0xff2a2a, yellow: 0xffc21a, green: 0x22e07a };
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const lights = [];
  const trafficLight = (z, poleX, dirZ, state) => {
    const g = new THREE.Group();
    const H = 6.4, armLen = 7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, H, 8), poleMat); pole.position.set(poleX, H / 2, 0); g.add(pole);
    const sx = poleX < ROAD_X0 + ROAD_W / 2 ? 1 : -1;
    addBox(g, armLen, 0.16, 0.16, poleMat, poleX + (sx * armLen) / 2, H - 0.15, 0);
    const hx = poleX + sx * (armLen - 1.2);
    addBox(g, 2.0, 0.66, 0.42, housingMat, hx, H - 0.6, 0);
    const lamps = {};
    ['red', 'yellow', 'green'].forEach((k, i) => {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), lampOff);
      l.position.set(hx + (i - 1) * 0.62, H - 0.6, dirZ * 0.22);
      l.rotation.y = dirZ > 0 ? 0 : Math.PI;
      g.add(l);
      const gl = glowSprite(glowCol[k], 1.6, 0.8); gl.position.copy(l.position); gl.position.z += dirZ * 0.05; g.add(gl);
      lamps[k] = { l, gl };
    });
    addBox(g, 0.36, 0.6, 0.3, housingMat, poleX, 2.2, dirZ * 0.24);
    for (let i = 0; i < 8; i++) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2), zebraMat);
      st.rotation.x = -Math.PI / 2; st.rotation.z = Math.PI / 2;
      st.position.set(ROAD_X0 + 0.9 + i * 1.6, 0.013, dirZ * -2.2);
      g.add(st);
    }
    g.position.z = z;
    root.add(g);
    const tl = { lamps, state, timer: 2 + rnd() * 3 };
    const set = () => { for (const [k, o] of Object.entries(tl.lamps)) { o.l.material = k === tl.state ? lampOn[k] : lampOff; o.gl.visible = k === tl.state; } };
    tl.set = set; set();
    lights.push(tl);
  };
  trafficLight(-34, ROAD_X0 - 0.6, 1, 'green');
  trafficLight(34, ROAD_X1 + 0.6, -1, 'red');

  // 가로등 (흐린 아침이라 은은하게 켜 둠)
  const lampHead = std(0xfff1c9, { emissive: 0xffd27a, emissiveIntensity: 0.6 });
  for (let z = -SPAN + 6; z < SPAN; z += 24) {
    for (const [px, dir] of [[ROAD_X0 - 0.5, 1], [ROAD_X1 + 0.5, -1]]) {
      const zz = z + (dir > 0 ? 0 : 12);
      if (Math.abs(zz) < 5) continue; // 탁구대 바로 옆은 비워서 시야를 가리지 않게
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), poleMat); p.position.set(px, 2.5, zz); root.add(p);
      addBox(root, 0.9, 0.16, 0.4, lampHead, px + dir * 0.4, 5, zz);
      const gl = glowSprite(0xffcf7a, 1.4, 0.55); gl.position.set(px + dir * 0.4, 4.85, zz); root.add(gl);
    }
  }

  // 도로 반대편 인도의 벤치 (등받이가 빌딩 쪽) — 치즈냥 자리. 관중석(도로 쪽)과 겹치지 않게 탁구대 건너편에 둔다
  const bench = new THREE.Group();
  const wood = std(0x9a6a3e), metal = std(0x3b3f45, { metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 4; i++) addBox(bench, 0.1, 0.04, 1.6, wood, -0.16 + i * 0.11, 0.44, 0);
  for (let i = 0; i < 2; i++) addBox(bench, 0.04, 0.1, 1.6, wood, -0.26, 0.62 + i * 0.13, 0);
  for (const z of [-0.65, 0.65]) { addBox(bench, 0.5, 0.05, 0.05, metal, -0.02, 0.4, z); addBox(bench, 0.05, 0.42, 0.05, metal, 0.18, 0.21, z); addBox(bench, 0.05, 0.8, 0.05, metal, -0.24, 0.4, z); }
  bench.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  bench.position.set(-2.45, 0, 0.25);
  root.add(bench);

  // 반려동물: 치즈냥은 벤치 위에서 식빵 굽기, 웰시코기는 벤치 앞에 앉아 공 구경
  const cat = buildCat();
  cat.group.scale.setScalar(0.5);
  cat.group.position.set(-2.42, 0.46, 0.45);
  cat.group.rotation.y = Math.PI / 2;
  root.add(cat.group);
  const corgi = buildCorgi();
  corgi.group.scale.setScalar(0.45);
  corgi.group.position.set(-1.95, 0, -0.35);
  corgi.group.rotation.y = Math.PI / 2;
  root.add(corgi.group);
  const pets = [cat, corgi];

  // 빗줄기 (탁구대 주변만 — 멀리는 안개에 묻힌다)
  const N = 1400, pos = new Float32Array(N * 6);
  const RX = [-14, 24], RZ = 26, RY = 16;
  for (let i = 0; i < N; i++) {
    const x = RX[0] + rnd() * (RX[1] - RX[0]), y = rnd() * RY, z = (rnd() * 2 - 1) * RZ;
    pos.set([x, y, z, x + 0.04, y - 0.55, z + 0.1], i * 6);
  }
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: 0xd6e0ea, transparent: true, opacity: 0.38, depthWrite: false }));
  rain.frustumCulled = false;
  rain.userData.noFocus = true;
  root.add(rain);

  // 차: 차선마다 몇 대씩 돌고 돈다. 0·1차선은 +z(A팀 쪽으로), 2·3차선은 -z(B팀 쪽으로)
  const cars = [];
  const newCar = (lane, z) => {
    const type = CAR_TYPES[Math.floor(rnd() * CAR_TYPES.length)];
    const mesh = makeCar(type, Math.floor(rnd() * 0xffffff));
    mesh.scale.setScalar(CAR_SCALE);
    const dir = lane < 2 ? 1 : -1;
    mesh.rotation.y = dir > 0 ? Math.PI : 0;
    mesh.position.set(LANES[lane], 0, z);
    root.add(mesh);
    return { mesh, lane, dir, speed: 12 + rnd() * 5 };
  };
  for (let lane = 0; lane < 4; lane++) for (let k = 0; k < 3; k++) cars.push(newCar(lane, -SPAN + ((k + rnd() * 0.6) * 2 * SPAN) / 3));

  // 통째로 반 바퀴 돌려 도로를 -x 쪽으로: 로비 카메라(+x 쪽에서 비스듬히)에서도 도로와 차가 보이게
  root.rotation.y = Math.PI;

  return {
    root,
    sky: '#b9c3cc',
    fog: [26, 150],
    far: 320,
    light: { hemi: ['#e4eaf0', '#5c6066', 1.5], sun: ['#f2f0ea', 1.0, [-6, 12, 4]] },
    tick(t, dt, ball, bounce) {
      // 차: 끝에 닿으면 반대쪽 끝에서 다시
      for (const c of cars) {
        c.mesh.position.z += c.dir * c.speed * dt;
        if (c.dir * c.mesh.position.z > SPAN) {
          c.mesh.position.z = -c.dir * SPAN;
          c.speed = 12 + Math.random() * 5;
        }
      }
      // 앞차와 너무 가까우면 속도를 맞춘다 (같은 차선에서 겹치지 않게)
      for (const c of cars) {
        for (const o of cars) {
          if (o === c || o.lane !== c.lane) continue;
          const gap = (o.mesh.position.z - c.mesh.position.z) * c.dir;
          if (gap > 0 && gap < 9) c.speed = Math.min(c.speed, o.speed);
        }
      }
      for (const tl of lights) {
        tl.timer -= dt;
        if (tl.timer <= 0) {
          tl.state = tl.state === 'green' ? 'yellow' : tl.state === 'yellow' ? 'red' : 'green';
          tl.timer = tl.state === 'yellow' ? 1 : 3 + Math.random() * 2;
          tl.set();
        }
      }
      // 비
      const a = rgeo.attributes.position, p = a.array, fall = 14 * dt;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= fall; p[i + 4] -= fall;
        if (p[i + 4] < 0) { p[i + 1] += RY; p[i + 4] += RY; }
      }
      a.needsUpdate = true;
      // 반려동물: 공 쪽을 본다
      for (const pet of pets) pet.update(t, dt, petYaw(root, pet, ball), bounce);
    },
  };
}

import { buildEvening } from './arena-evening.js';
import { buildPicnic } from './arena-picnic.js';
import { buildBeach } from './arena-beach.js';
import { buildSnow } from './arena-snow.js';
import { buildBakery } from './arena-bakery.js';
import { buildClassroom } from './arena-classroom.js';
import { buildTraining } from './arena-training.js';
import { buildParking } from './arena-parking.js';

const ARENAS = { commute: buildCommute, evening: buildEvening, picnic: buildPicnic, beach: buildBeach, snow: buildSnow, bakery: buildBakery,
  classroom: buildClassroom, training: buildTraining, parking: buildParking };

export function buildArena(id) {
  const f = ARENAS[id];
  if (!f) return null;
  const tb = performance.now();
  const a = f();
  const buildMs = Math.round(performance.now() - tb);
  a.root.traverse((o) => { if (o.isMesh && !o.castShadow) o.receiveShadow = true; });
  // 움직이지 않는 것을 재질별로 합쳐 가볍게 (주소에 ?nobake=1이면 비교용으로 끔)
  if (!/[?&]nobake=1/.test(location.search)) {
    const t0 = performance.now();
    // 합치다가 문제가 생기면 합치지 않은 그대로 쓴다 (게임이 멈추지 않게)
    try { a.bake = { ...bakeArena(a, id), ms: Math.round(performance.now() - t0), buildMs }; } catch (e) { console.warn('[배경 합치기 실패, 그대로 씀]', id, e); }
  }
  return a;
}
