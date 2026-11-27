// 주변이 박자를 탐 — 시안 (fishing.md 8장 'B', 11/26). 내 화면에서만, ⚙️에서 하나씩 켜고 끄며 비교.
//  ④ 바다: 박마다 찌 둘레에 동그란 물결이 퍼짐(마디 첫 박은 두 겹·크게) + 찌 둘레 물 위 반짝임이 박자에 깜빡
//  ⑥ 몸: 내 캐릭터가 박마다 무릎을 살짝 굽혀 까딱 (고양이 까딱은 cats/models.js가 BEAT를 읽음)
//  ⑤ 선착장(등·등대·배·간판)은 campusPier.js가 BEAT를 읽음
import * as THREE from 'three';
import { BEAT } from './beat.js';
import { seaHeight } from './world.js';

export function makeBeatFx(scene) {
  // ④ 물결 (평평한 고리, 0.5박 만에 퍼지고 1.5박 동안 사라짐)
  const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 4; scene.add(m);
    rings.push({ m, t: 1, max: 2, x: 0, z: 0 });
  }
  let ri = 0;
  const ripple = (x, z, max, delay = 0) => { const r = rings[ri++ % rings.length]; r.t = -delay; r.max = max; r.x = x; r.z = z; };
  // ④ 반짝임: 찌 둘레 물 위 작은 별 (박마다 일부가 번쩍)
  const glintTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,250,220,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4);
    return new THREE.CanvasTexture(c);
  })();
  const glints = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false; scene.add(s);
    glints.push({ s, a: Math.random() * Math.PI * 2, d: 1.6 + Math.random() * 4.5, k: 0, every: 1 + (i % 3) });
  }
  let lastN = null, bodyOn = false;
  function update(rdt, { bob, now, me, mode }) {
    const on = BEAT.on && mode === 'fight';
    const newBeat = on && BEAT.n !== lastN; if (on) lastN = BEAT.n; else lastN = null;

    // ④ 바다
    if (newBeat && BEAT.fx.sea) {
      ripple(bob.x, bob.z, BEAT.accent ? 3.4 : 2.2);
      if (BEAT.accent) ripple(bob.x, bob.z, 2.0, 0.12);
      for (const g of glints) if (BEAT.accent || (BEAT.n % g.every) === 0) g.k = 0.6 + Math.random() * 0.4;
    }
    for (const r of rings) {
      if (r.t >= 1) { r.m.visible = false; continue; }
      r.t += rdt / (BEAT.spb * 1.5);
      if (r.t < 0) continue;
      const k = Math.min(1, r.t), grow = 1 - (1 - Math.min(1, k * 3)) ** 3; // 앞 1/3에 빨리 퍼지고
      const s = 0.3 + grow * r.max;
      r.m.visible = true; r.m.scale.set(s, s, 1);
      r.m.position.set(r.x, seaHeight(r.x, r.z, now) + 0.04, r.z);
      r.m.material.opacity = (1 - k) * 0.75;
    }
    for (const g of glints) {
      g.k = Math.max(0, g.k - rdt * 3.2);
      g.s.visible = on && BEAT.fx.sea && g.k > 0.01;
      if (!g.s.visible) continue;
      const x = bob.x + Math.cos(g.a + now * 0.05) * g.d, z = bob.z + Math.sin(g.a + now * 0.05) * g.d;
      g.s.position.set(x, seaHeight(x, z, now) + 0.08, z);
      g.s.material.opacity = g.k; g.s.scale.setScalar(0.4 + g.k * 0.7);
    }

    // ⑥ 내 캐릭터 까딱 (무릎 굽히듯 살짝 내려갔다 올라옴 + 박마다 좌우로 조금)
    if (on && BEAT.fx.body) {
      const p = BEAT.pulse * (BEAT.accent ? 1.4 : 1);
      me.body.position.y = -0.045 * p;
      me.body.rotation.z = BEAT.side * 0.04 * p;
      me.head.rotation.x = 0.18 * p;
      bodyOn = true;
    } else if (bodyOn) { bodyOn = false; me.body.position.y = 0; me.body.rotation.z = 0; me.head.rotation.x = 0; } // 끈 뒤 한 번만 되돌림

  }
  function hide() { for (const r of rings) { r.t = 1; r.m.visible = false; } for (const g of glints) g.s.visible = false; }
  return { update, hide };
}
