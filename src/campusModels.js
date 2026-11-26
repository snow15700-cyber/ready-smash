// 광장 무료 소품 모델 (Quaternius CC0, public/models/campus/CREDITS.md — 사용자 확정 11/25: 다 쓰기)
// 소품 자리(userData.prop = 'tree' | 'lamp' | 'bench' | 'bush' | 'flower' | 'trash')를 모델로 채운다.
// 실제 광장: 같은 모델은 InstancedMesh 하나로 (나무 40그루도 그리기 몇 번이면 끝). 시안 페이지는 자리마다 복사(campusPage.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODELS = {
  tree: { files: ['PineTree_1', 'PineTree_3', 'PineTree_1', 'CommonTree_1', 'CommonTree_3'], h: 4.6, lift: 0.1 },
  lamp: { files: ['Streetlight_Single'], h: 4.4 },
  bench: { files: ['Bench_1'], w: 1.8 },
  bush: { files: ['Bush_1'], h: 0.9, lift: 0.1 },
  flower: { files: ['Flowers'], h: 0.75 },
  trash: { files: ['Trashcan_Green'], h: 1.0 },
};
const cache = {};
const loader = new GLTFLoader();
// 모델 하나 받기 (같은 파일은 한 번만). 재질은 한 번 다듬어 둠
export function loadModel(name) {
  cache[name] ||= loader.loadAsync(`/models/campus/${name}.glb`).then((g) => {
    const kind = Object.keys(MODELS).find((k) => MODELS[k].files.includes(name));
    const def = MODELS[kind];
    g.scene.traverse((c) => {
      if (!c.isMesh) return;
      c.castShadow = true; c.receiveShadow = true;
      for (const mt of [].concat(c.material)) {
        // 금속 재질로 들어와서 반사할 것이 없으면 거의 검게 보임 → 다른 물건과 같은 무광으로
        mt.metalness = 0; mt.roughness = Math.max(0.7, mt.roughness ?? 1);
        if (def.lift && !mt.userData.lifted) { mt.userData.lifted = true; mt.color.offsetHSL(0, 0.08, def.lift); } // 나무·덤불 조금 밝게
        if (kind === 'lamp' && /light|glass/i.test(mt.name) && !mt.userData.glow) { mt.emissive = new THREE.Color(0xffe2a0); mt.userData.glow = [0.05, 2.2]; } // 밤에 켜짐
      }
    });
    return g.scene;
  });
  return cache[name];
}
export const fileFor = (o) => { const def = MODELS[o.userData.prop]; return def.files[Math.floor((o.userData.seed ?? 0) * def.files.length) % def.files.length]; };
// 모델을 자리 크기에 맞추는 배율·바닥 높이
export function fitOf(model, def) {
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  const k = def.w ? def.w / Math.max(size.x, size.z) : def.h / size.y;
  return { k, y: -box.min.y * k };
}

// 실제 광장: root 안의 소품 자리를 InstancedMesh로 채워 holder에 넣는다 (모델을 다 받은 뒤). 돌려줌: 밤에 켜지는 재질 목록
export async function fillProps(root, holder, matFn = (m) => m) {
  const spots = [];
  root.traverse((o) => { if (o.userData.prop && MODELS[o.userData.prop]) spots.push(o); });
  const byFile = new Map();
  for (const o of spots) { const f = fileFor(o); if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(o); }
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const glow = new Set();
  for (const [file, list] of byFile) {
    const model = await loadModel(file);
    const def = MODELS[list[0].userData.prop];
    const { k, y } = fitOf(model, def);
    const fit = new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion(), new THREE.Vector3(k, k, k));
    model.updateMatrixWorld(true);
    const mInv = model.matrixWorld.clone().invert();
    model.traverse((c) => {
      if (!c.isMesh) return;
      const local = mInv.clone().multiply(c.matrixWorld); // 모델 안에서 이 부품 자리
      const mats = Array.isArray(c.material) ? c.material.map(matFn) : matFn(c.material);
      const im = new THREE.InstancedMesh(c.geometry, mats, list.length);
      const m = new THREE.Matrix4();
      list.forEach((o, i) => { m.copy(inv).multiply(o.matrixWorld).multiply(fit).multiply(local); im.setMatrixAt(i, m); });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = !['flower', 'bush'].includes(list[0].userData.prop); im.receiveShadow = true; // 꽃·덤불은 그림자 생략 (가볍게)
      im.computeBoundingSphere();
      holder.add(im);
      for (const mt of [].concat(mats)) if (mt.userData.glow) glow.add(mt);
    });
  }
  return [...glow];
}
