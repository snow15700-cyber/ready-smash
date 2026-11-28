// 허수아비 = 우리 광장 캐릭터(꾸미기 적용) + 몸에 팀 색 빛 테두리 (fps.md 8장)
// 빛 테두리: 재질마다 '가장자리일수록 밝게'(림 라이트)를 셰이더에 끼워 넣는다 — 후처리 없이 가볍게
import * as THREE from 'three';
import { makeCharacter } from '../../scene.js';
import { applyLook } from '../../items.js';
import { TUNE, CHAR_SCALE, HITBOX } from './tune.js';

export const TEAM = { red: '#ff3b5c', blue: '#36b4ff' };

// 시안용 꾸미기 (광장에서 실제로 살 수 있는 것들)
const LOOKS = [
  { body: 'body_uniform', head: 'head_cap', face: 'face_glare' },
  { body: 'body_padding', head: 'head_beanie', face: 'face_sleepy' },
  { body: 'body_chick', face: 'face_dots' },
  { body: 'body_hawaii', head: 'head_party', face: 'face_happy' },
  { body: 'body_knight', face: 'face_fire' },
  { body: 'body_suit', head: 'head_gat', face: 'face_mustache' },
  { body: 'body_none', head: 'head_bunny', face: 'face_wink' },
];
// 자리: [x, 바닥 높이, z, 움직임] — 'still' 가만히 · 'strafe' 좌우로 · 'hop' 콩콩 · 'dash' 가끔 대시
const SPOTS = [
  [-5, 0, 8, 'strafe'], [5, 0, 9, 'strafe'], [0, 2.5, 0, 'hop'], [-13, 0, 4, 'still'],
  [13, 0, 5, 'dash'], [-17, 3, -3, 'still'], [8, 0, -6, 'still'], [0, 0, -13, 'strafe'],
];

function addRim(char, color) {
  const uniforms = { uRim: { value: new THREE.Color(color) }, uRimK: { value: 1 } };
  char.group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = [].concat(o.material).map((m) => {
      if (m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || !('emissive' in m)) return m;
      const c = m.clone(); // 같은 재질을 다른 팀이 같이 쓰지 않게
      const prev = m.onBeforeCompile;
      c.onBeforeCompile = (sh, r) => {
        prev?.call(c, sh, r);
        sh.uniforms.uRim = uniforms.uRim; sh.uniforms.uRimK = uniforms.uRimK;
        sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float rim = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
            totalEmissiveRadiance += uRim * (pow(rim, 2.2) * 1.6 + 0.06) * uRimK; }`);
      };
      c.customProgramCacheKey = () => 'fpsRim';
      return c;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  return uniforms;
}

// 발밑: 그림자 + 팀 색 빛이 바닥에 비침
function footGlow(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 2;
  return m;
}

export function makeDummies(scene, { teams = true } = {}) {
  const list = SPOTS.map(([x, y, z, move], i) => {
    const char = makeCharacter('#e0333c');
    applyLook(char, LOOKS[i % LOOKS.length]);
    char.arm.visible = false; // 탁구채는 숨김 (무기는 보류)
    const team = teams ? (i % 2 ? 'blue' : 'red') : 'red';
    const rim = addRim(char, TEAM[team]);
    const root = new THREE.Group(); root.position.set(x, y, z);
    char.group.scale.setScalar(CHAR_SCALE);
    root.add(char.group);
    const glow = footGlow(TEAM[team]); root.add(glow);
    scene.add(root);
    return { i, name: `허수아비 ${i + 1}`, char, rim, root, glow, team, home: new THREE.Vector3(x, y, z), move, hp: TUNE.hp, dead: -1, shield: 0, hitT: -9, hitDir: 0, phase: i * 1.7, vel: 0, hopV: 0 };
  });

  const setTeams = (on) => {
    for (const d of list) {
      d.team = on ? (d.i % 2 ? 'blue' : 'red') : 'red';
      d.rim.uRim.value.set(TEAM[d.team]); d.glow.material.color.set(TEAM[d.team]);
    }
  };

  const tick = (t, dt, eye, moving) => {
    for (const d of list) {
      d.char.tickOutfit(t, dt);
      const p = d.root.position;
      if (d.dead >= 0) {
        // 쓰러짐: 뒤로 넘어가며 가라앉음 → TUNE.respawn초 뒤 제자리에서 다시
        d.dead += dt;
        const k = Math.min(1, d.dead / 0.35);
        d.char.group.rotation.x = -k * k * 1.45;
        d.char.group.position.y = -Math.max(0, d.dead - 0.9) * 1.2;
        d.glow.material.opacity = 0.55 * (1 - k);
        if (d.dead > TUNE.respawn) { d.dead = -1; d.hp = TUNE.hp; d.shield = TUNE.shield; d.char.group.rotation.set(0, 0, 0); d.char.group.position.set(0, 0, 0); p.copy(d.home); d.hopV = 0; d.vel = 0; }
        continue;
      }
      if (moving) {
        const ph = t + d.phase;
        if (d.move === 'strafe') p.x = d.home.x + Math.sin(ph * 1.3) * 2.6; // 최고 약 3.4m/s
        if (d.move === 'dash') { // 걷다가 가끔 대시처럼 휙
          const c = ph % 3.2; const s = c < 0.17 ? 22 : 3.2;
          d.vel = s * (Math.floor(ph / 3.2) % 2 ? 1 : -1);
          p.x = THREE.MathUtils.clamp(p.x + d.vel * dt, d.home.x - 4, d.home.x + 4);
        }
        if (d.move === 'hop') { d.hopV -= TUNE.gravity * dt; p.y += d.hopV * dt; if (p.y <= d.home.y) { p.y = d.home.y; d.hopV = (Math.floor(ph) % 3 === 0) ? 0 : TUNE.jump; } }
      } else if (d.move !== 'still') { p.lerp(d.home, Math.min(1, dt * 4)); }
      // 나를 바라봄 (캐릭터 앞쪽 = -z)
      d.root.rotation.y = Math.atan2(p.x - eye.x, p.z - eye.z);
      // 맞은 반응: 맞은 쪽으로 살짝 젖혀졌다가 돌아옴 + 몸 빛이 하얗게 번쩍
      const h = t - d.hitT;
      const kick = h < 0.25 ? Math.sin((h / 0.25) * Math.PI) * (1 - h / 0.25) : 0;
      d.char.group.rotation.x = -kick * 0.28 * d.hitDir;
      d.char.body.position.y = Math.sin(t * 2.2 + d.phase) * 0.012;
      // 무적: 깜빡
      if (d.shield > 0) d.shield = Math.max(0, d.shield - dt);
      const blink = d.shield > 0 ? (Math.sin(t * 30) > 0 ? 2.4 : 0.6) : 1;
      d.rim.uRimK.value = blink + (h < 0.12 ? (1 - h / 0.12) * 3 : 0);
      d.glow.material.opacity = 0.55;
    }
  };

  // 총알(반직선) vs 허수아비: 머리 공 → 몸 원기둥. 가장 가까운 것 { d, part: 'head'|'body', t, point }
  const _o = new THREE.Vector3();
  const raycast = (o, dir) => {
    let best = null;
    for (const d of list) {
      if (d.dead >= 0) continue;
      const p = d.root.position;
      // 머리 (몸이 젖혀지는 건 무시 — 작게만 움직임)
      _o.set(p.x, p.y + HITBOX.headY, p.z).sub(o);
      const b = _o.dot(dir), c = _o.lengthSq() - HITBOX.headR ** 2, disc = b * b - c;
      if (disc >= 0) { const tt = b - Math.sqrt(disc); if (tt > 0 && (!best || tt < best.t)) best = { d, part: 'head', t: tt }; }
      // 몸 (세운 원기둥)
      const ox = o.x - p.x, oz = o.z - p.z, a2 = dir.x ** 2 + dir.z ** 2;
      if (a2 > 1e-9) {
        const b2 = ox * dir.x + oz * dir.z, c2 = ox * ox + oz * oz - HITBOX.bodyR ** 2, ds = b2 * b2 - a2 * c2;
        if (ds >= 0) {
          const tt = (-b2 - Math.sqrt(ds)) / a2, y = o.y + dir.y * tt - p.y;
          // 머리 공이 같이 맞으면 머리가 우선 (머리가 가까우면 이미 best)
          if (tt > 0 && y >= 0 && y <= HITBOX.bodyTop && (!best || tt < best.t - 0.02)) best = { d, part: 'body', t: tt };
        }
      }
    }
    if (best) best.point = o.clone().addScaledVector(dir, best.t);
    return best;
  };

  return { list, tick, raycast, setTeams };
}
