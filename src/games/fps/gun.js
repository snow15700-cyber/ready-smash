// 손에 든 무기 (임시 모양 — 무기 테마는 보류, fps.md 5장). 장난감 블래스터처럼 둥글게, 탁구 주황 줄.
// 화면 오른쪽 아래에 따로 그린다(벽에 파묻히지 않게 깊이를 지우고 맨 위에)
import * as THREE from 'three';

export function makeGun() {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2050, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1, 2, 1.5); scene.add(key);
  const flashLight = new THREE.PointLight(0xffc070, 0, 1.2); scene.add(flashLight);

  const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
  const holder = new THREE.Group(); scene.add(holder); // 반동·흔들림은 이 그룹을 움직임
  const g = new THREE.Group(); holder.add(g);
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const shell = lam('#e9ecf5'), dark = lam('#3a3d56'), neon = new THREE.MeshBasicMaterial({ color: '#ff8a1f' });
  add(new THREE.CapsuleGeometry(0.045, 0.2, 6, 16), shell, 0, 0, -0.06, Math.PI / 2); // 몸통
  add(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 16), dark, 0, 0.008, -0.24, Math.PI / 2); // 총구
  add(new THREE.TorusGeometry(0.026, 0.008, 8, 20), neon, 0, 0.008, -0.32); // 총구 고리 (빛)
  add(new THREE.BoxGeometry(0.012, 0.016, 0.22), neon, 0.046, 0.012, -0.06); // 옆 줄
  add(new THREE.BoxGeometry(0.012, 0.016, 0.22), neon, -0.046, 0.012, -0.06);
  const grip = add(new THREE.CapsuleGeometry(0.024, 0.07, 4, 10), dark, 0, -0.07, 0.03); grip.rotation.x = 0.35;
  add(new THREE.SphereGeometry(0.03, 16, 12), dark, 0, 0.052, 0.0); // 위 조준 혹
  const glowCore = add(new THREE.SphereGeometry(0.012, 10, 8), neon, 0, 0.068, 0.0);
  g.rotation.y = 0.06; g.scale.setScalar(0.6); // 화면 오른쪽 아래를 너무 가리지 않게

  // 총구 번쩍: 별 모양 그림 (주황·노랑) — 쏠 때마다 돌려서 매번 조금 다르게
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.2, 'rgba(255,220,120,0.95)'); gr.addColorStop(0.5, 'rgba(255,140,40,0.35)'); gr.addColorStop(1, 'rgba(255,100,0,0)');
  x.fillStyle = gr;
  x.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 64; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  x.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.position.set(0, 0.008, -0.36); flash.scale.setScalar(0.16); flash.visible = false; g.add(flash);
  flashLight.position.set(0, 0.01, -0.33);

  const REST = new THREE.Vector3(0.15, -0.13, -0.34);
  holder.position.copy(REST);
  let kick = 0, flashT = 9, swayX = 0, swayY = 0;
  const muzzleLocal = new THREE.Vector3(0, 0.008, -0.34);

  return {
    scene, cam,
    fire(power) { kick = Math.min(1.2, kick + power); flashT = 0; flash.material.rotation = Math.random() * Math.PI; flash.scale.setScalar(0.13 + Math.random() * 0.07); },
    look(dx, dy) { swayX = THREE.MathUtils.clamp(swayX - dx * 0.00025, -0.03, 0.03); swayY = THREE.MathUtils.clamp(swayY + dy * 0.00025, -0.03, 0.03); },
    tick(t, dt, { bob = 0, speed = 0, air = 0, dashK = 0 }) {
      flashT += dt;
      flash.visible = flashT < 0.045;
      flashLight.intensity = flashT < 0.06 ? 3 * (1 - flashT / 0.06) : 0;
      glowCore.scale.setScalar(1 + (flashT < 0.1 ? (1 - flashT / 0.1) * 1.5 : 0));
      // 반동: 뒤로 밀리고 총구가 들렸다가 스프링처럼 돌아옴
      kick = Math.max(0, kick - dt * 7 * Math.max(0.4, kick));
      swayX *= Math.exp(-dt * 8); swayY *= Math.exp(-dt * 8);
      const b = Math.sin(bob) * 0.012 * speed, b2 = Math.abs(Math.cos(bob)) * 0.008 * speed;
      holder.position.set(REST.x + b + swayX, REST.y - b2 + swayY - air * 0.015 - dashK * 0.03, REST.z + kick * 0.045 + dashK * 0.04);
      holder.rotation.set(kick * 0.2, swayX * 2, -dashK * 0.25 + b * 0.6);
    },
    // 총구의 화면 위치 → 세계 쪽 총알 줄 시작점을 잡을 때 씀
    muzzleNDC(out) { const v = muzzleLocal.clone(); g.localToWorld(v); v.project(cam); return out.set(v.x, v.y); },
  };
}
