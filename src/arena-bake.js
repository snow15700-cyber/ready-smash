// 배경 가볍게 만들기 (최적화 ④)
// 배경은 작은 물건(벽돌·창문·나뭇잎…)이 수백 개라 그리기 호출이 많다(체육관 약 90, 배경 160~640).
// 움직이지 않는 메시를 '같은 재질끼리' 한 덩어리로 합쳐 그리기 호출을 줄인다. 보이는 모습은 그대로.
//
// 무엇이 움직이는지는 배경의 tick을 미리 60초어치 돌려 보고 찾는다:
//   제자리(부모 기준) 위치·회전·크기, 보이기, 재질 바꿔 끼우기, 재질 색·투명도, 모양 꼭짓점 중 하나라도 바뀌면 '움직이는 것'.
//   (반려동물 깜빡임은 최대 8초, 퇴근길 신호등 5초, 소풍길 비행기 52초 주기라 60초면 다 잡힌다.)
// 움직이는 것 자체는 그대로 두고, 그 안에서 같이 움직이는 부품들(차 한 대의 바퀴·창문 등)은 그 물건 안에서 합친다.
// 색만 다른 재질은 색을 꼭짓점 색으로 옮겨 하나로 합친다(몰입 연출로 재질 색을 어둡게 해도 똑같이 어두워진다).
// 혹시 tick이 아주 드물게 움직이는 것이 생기면 그 물건에 userData.dyn = true를 달면 합치지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SIM_SECONDS = 60, SIM_DT = 0.2;
const CELL = +(new URLSearchParams(location.search).get('cell') || 60);
const SKIP_KEYS = new Set(['uuid', 'name', 'id', 'version', 'type', 'isMaterial', 'userData', 'needsUpdate', 'color', 'vertexColors']);
const MAP_KEYS = ['map', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'lightMap', 'specularMap', 'displacementMap'];
const baseCompile = THREE.Material.prototype.onBeforeCompile;
const baseCacheKey = THREE.Material.prototype.customProgramCacheKey;
const baseBeforeRender = THREE.Object3D.prototype.onBeforeRender;

// ---- 1. 미리 돌려 보고 스스로 바뀌는 물건 찾기 ----
let nextId = 1;
const ids = new WeakMap();
const idOf = (x) => { if (!x) return 0; let i = ids.get(x); if (!i) ids.set(x, (i = nextId++)); return i; };

// 물건 하나의 '지금 모습'을 숫자 줄로 (위치·회전·크기, 보이기, 재질과 그 색·투명도, 모양 꼭짓점 버전)
function snap(o, out) {
  let n = 0;
  const p = o.position, q = o.quaternion, sc = o.scale;
  out[n++] = p.x; out[n++] = p.y; out[n++] = p.z; out[n++] = q.x; out[n++] = q.y; out[n++] = q.z; out[n++] = q.w;
  out[n++] = sc.x; out[n++] = sc.y; out[n++] = sc.z; out[n++] = o.visible ? 1 : 0;
  if (!o.matrixAutoUpdate) { const e = o.matrix.elements; for (let i = 0; i < 16; i++) out[n++] = e[i]; }
  const ms = o.material;
  if (ms) for (let i = 0, L = Array.isArray(ms) ? ms.length : 1; i < L; i++) {
    const m = Array.isArray(ms) ? ms[i] : ms;
    out[n++] = idOf(m); out[n++] = m.opacity; out[n++] = m.visible ? 1 : 0;
    const c = m.color, e = m.emissive;
    out[n++] = c ? c.r : 0; out[n++] = c ? c.g : 0; out[n++] = c ? c.b : 0;
    out[n++] = e ? e.r + e.g * 7 + e.b * 49 : 0; out[n++] = m.emissiveIntensity || 0;
    if (m.map) { out[n++] = m.map.offset.x; out[n++] = m.map.offset.y; out[n++] = m.map.rotation; }
  }
  const g = o.geometry;
  if (g) { out[n++] = idOf(g); const at = g.attributes; for (const k in at) out[n++] = at[k].version; out[n++] = g.index ? g.index.version : -1; }
  out.length = n;
  return out;
}
function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; if (d > 1e-6 || d < -1e-6) return false; }
  return true;
}

// 같은 배경은 언제 지어도 같은 순서·같은 물건이라(정해진 난수) 한 번 찾은 결과를 다시 쓴다
const cache = new Map();

function findChanging(a, id) {
  const all = [];
  a.root.traverse((o) => all.push(o));
  const hit = id && cache.get(id);
  if (hit && hit.count === all.length) return new Set(hit.idx.map((i) => all[i]));
  const first = all.map((o) => snap(o, []));
  const changing = new Set();
  const live = all.map((_, k) => k); // 아직 안 바뀐 것만 계속 본다
  if (a.tick) {
    const t0 = performance.now() / 1000;
    const ball = new THREE.Vector3(), tmp = [];
    for (let i = 1; i <= SIM_SECONDS / SIM_DT; i++) {
      const t = t0 + i * SIM_DT;
      ball.set(Math.sin(t * 1.7) * 0.6, 0.9 + Math.abs(Math.sin(t * 3)) * 0.3, Math.sin(t * 0.9) * 1.3);
      a.tick(t, SIM_DT, ball, i % 7 === 0 ? 1 : 0); // 가끔 공이 튄다 → 반려동물 깜짝
      if (i % 2) continue; // 비교는 0.4초마다 (가장 짧게 바뀌는 것: 강아지 발 숨기 약 0.6초)
      let w = 0;
      for (let j = 0; j < live.length; j++) {
        const k = live[j];
        if (same(snap(all[k], tmp), first[k])) live[w++] = k; else changing.add(all[k]);
      }
      live.length = w;
    }
  }
  // tick 동안 새로 붙은 것도 바뀌는 것으로
  const known = new Set(all);
  a.root.traverse((o) => { if (!known.has(o)) changing.add(o); });
  if (id) cache.set(id, { count: all.length, idx: all.map((o, k) => (changing.has(o) ? k : -1)).filter((k) => k >= 0) });
  return changing;
}

// ---- 2. 합칠 수 있는 재질끼리 묶기 (색은 빼고 비교) ----
function matKey(m) {
  if (m.onBeforeCompile !== baseCompile || m.customProgramCacheKey !== baseCacheKey) return 'u' + m.uuid;
  const parts = [m.type];
  for (const k of Object.keys(m).sort()) {
    if (SKIP_KEYS.has(k) || k.startsWith('_')) continue;
    const v = m[k];
    if (v == null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') parts.push(k + '=' + v);
    else if (v.isColor) parts.push(k + '=' + v.getHexString());
    else if (v.isTexture) parts.push(k + '=' + v.uuid);
    else if (v.isVector2 || v.isVector3 || v.isEuler) parts.push(k + '=' + v.toArray().join(','));
    else if (typeof v === 'function') continue;
    else if (Object.getPrototypeOf(v) === Object.prototype) parts.push(k + '=' + JSON.stringify(v)); // defines 등
    else return 'u' + m.uuid; // 모르는 값이 있으면 그 재질끼리만
  }
  parts.push(JSON.stringify(m.userData || {}));
  return parts.join('&');
}
const usesUV = (m) => MAP_KEYS.some((k) => m[k]);
// 여러 재질 메시의 면 묶음 하나만 떼어 낸 모양 (꼭짓점은 같이 쓰고 순서표만 잘라 냄)
function subGeo(g, gr) {
  const s = new THREE.BufferGeometry();
  for (const k in g.attributes) s.setAttribute(k, g.attributes[k]);
  const end = Math.min(gr.start + gr.count, g.index ? g.index.count : g.attributes.position.count);
  const idx = new Uint32Array(end - gr.start);
  for (let i = gr.start; i < end; i++) idx[i - gr.start] = g.index ? g.index.getX(i) : i;
  s.setIndex(new THREE.BufferAttribute(idx, 1));
  return s;
}

// 합치기 전 모양 하나를 준비: 자리 옮기기 + 꼭짓점 색 + 속성 맞추기
function prepGeo(src, mat, m4, col, keepUV) {
  const g = src.clone();
  g.applyMatrix4(m4);
  g.morphAttributes = {};
  g.clearGroups();
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
  if (!keepUV) g.deleteAttribute('uv');
  else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (col) {
    const c = new Float32Array(n * 3);
    const old = mat.vertexColors && g.attributes.color;
    for (let i = 0; i < n; i++) {
      const r = old ? old.getX(i) : 1, gg = old ? old.getY(i) : 1, b = old ? old.getZ(i) : 1;
      c[i * 3] = r * col.r; c[i * 3 + 1] = gg * col.g; c[i * 3 + 2] = b * col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  } else if (!mat.vertexColors) g.deleteAttribute('color');
  if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
  return g;
}

export function bakeArena(a, id) {
  const root = a.root;
  root.updateMatrixWorld(true);
  const tS = performance.now();
  const changing = findChanging(a, id);
  const simMs = Math.round(performance.now() - tS);
  // 안 보이는 것·dyn 표시도 '바뀌는 것'처럼 다룬다 (그 안의 부품은 그 물건 안에서만 합침)
  root.traverse((o) => { if (o !== root && (!o.visible || o.userData.dyn)) changing.add(o); });
  changing.delete(root);

  // 각 메시의 기준(앵커) = 가장 가까운 '바뀌는' 조상(없으면 root). 같은 기준 안에서만 합친다
  const anchorOf = new Map();
  const walk = (o, anchor) => { anchorOf.set(o, anchor); const next = changing.has(o) ? o : anchor; for (const c of o.children) walk(c, next); };
  walk(root, root);

  const groups = new Map();
  const m4 = new THREE.Matrix4(), inv = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || changing.has(o)) return;
    if (o.onBeforeRender !== baseBeforeRender || o.userData.fx || o.userData.fxKeep || o.userData.noBake) return;
    const g = o.geometry;
    if (!g?.attributes.position || Object.keys(g.morphAttributes).length) return;
    // 재질이 여러 개(면마다 다른 재질)면 면 묶음(group)마다 따로 떼어 낸다
    const multi = Array.isArray(o.material);
    if (multi && !g.groups.length) return;
    const parts = multi ? g.groups.map((gr) => ({ mat: o.material[gr.materialIndex], geo: subGeo(g, gr) })) : [{ mat: o.material, geo: g }];
    if (parts.some((p) => !p.mat || p.mat.transparent)) return; // 겹치는 순서가 중요한 반투명은 그대로
    const anchor = anchorOf.get(o);
    m4.multiplyMatrices(inv.copy(anchor.matrixWorld).invert(), o.matrixWorld);
    if (m4.determinant() < 0) return; // 거울처럼 뒤집힌 것은 면 방향이 바뀌어 그대로
    // 멀리 떨어진 것끼리는 따로 묶어 화면 밖 덩어리는 안 그리게 (구역 CELL m 격자, 기준 물건 안에서는 한 구역)
    let cell = '';
    if (anchor === root) {
      g.boundingSphere || g.computeBoundingSphere();
      const c = g.boundingSphere.center.clone().applyMatrix4(m4);
      cell = Math.floor(c.x / CELL) + ',' + Math.floor(c.z / CELL);
    }
    for (const { mat, geo } of parts) {
      const key = [anchor.uuid, cell, matKey(mat), usesUV(mat), o.castShadow, o.receiveShadow, o.renderOrder, o.frustumCulled, o.layers.mask, !!o.userData.noFocus, !!o.userData.noOutline].join('#');
      if (!groups.has(key)) groups.set(key, { anchor, list: [], multi: false });
      const G = groups.get(key);
      G.list.push({ o, mat, geo, m: m4.clone() });
      if (multi) G.multi = true; // 여러 재질 메시의 조각이 들어 있으면 하나뿐이어도 만든다(원래 메시를 없애므로)
    }
  });

  let removed = 0, added = 0;
  const dropped = new Set();
  for (const { anchor, list, multi } of groups.values()) {
    if (list.length < 2 && !multi) continue;
    const m0 = list[0].mat;
    const oneColor = list.every(({ mat }) => !mat.vertexColors && (!m0.color || mat.color.equals(m0.color)));
    const keepUV = usesUV(m0);
    const geos = list.map(({ mat, geo, m }) => prepGeo(geo, mat, m, oneColor || !mat.color ? null : mat.color, keepUV));
    // 꼭짓점 색이 없는 것과 있는 것이 섞이면 못 합치므로 맞춘다
    if (!oneColor) for (let i = 0; i < geos.length; i++) if (!geos[i].attributes.color) {
      const c = new Float32Array(geos[i].attributes.position.count * 3).fill(1);
      geos[i].setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) { console.warn('[bake] 합치기 실패', list.length); continue; }
    merged.computeBoundingSphere();
    let mat = m0;
    if (!oneColor) { mat = m0.clone(); mat.vertexColors = true; mat.color?.set(0xffffff); }
    const src = list[0].o;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow;
    mesh.renderOrder = src.renderOrder; mesh.frustumCulled = src.frustumCulled; mesh.layers.mask = src.layers.mask;
    for (const k of ['noFocus', 'noOutline']) if (src.userData[k]) mesh.userData[k] = true;
    mesh.userData.baked = list.length;
    for (const { o } of list) {
      if (dropped.has(o)) continue;
      // 자식이 달린 메시는 빈 자리(같은 위치의 Object3D)를 남겨 자식을 그대로 둔다
      if (o.children.length) {
        const hold = new THREE.Object3D();
        hold.position.copy(o.position); hold.quaternion.copy(o.quaternion); hold.scale.copy(o.scale);
        hold.matrixAutoUpdate = o.matrixAutoUpdate; hold.matrix.copy(o.matrix);
        o.parent.add(hold);
        while (o.children.length) hold.add(o.children[0]);
      }
      o.parent.remove(o);
      dropped.add(o);
      removed++;
    }
    anchor.add(mesh);
    added++;
  }
  // 이제 아무도 안 쓰는 옛 모양·재질은 정리 (그림(map)은 남은 재질이 같이 쓸 수 있어 그대로)
  const usedGeo = new Set(), usedMat = new Set();
  root.traverse((o) => { if (o.geometry) usedGeo.add(o.geometry); for (const m of [].concat(o.material || [])) usedMat.add(m); });
  for (const o of dropped) {
    if (!usedGeo.has(o.geometry)) o.geometry.dispose();
    for (const m of [].concat(o.material)) if (!usedMat.has(m)) m.dispose();
  }
  return { removed, added, simMs };
}
