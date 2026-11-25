// 광장의 시간·날씨 (사용자 확정 11/23: 광장만, 대구의 진짜 날씨, 해 뜨고 지는 시각 따라)
// 시간대: 아침 · 한낮 · 오후 · 일몰 · 저녁 · 밤 — 한국 시간 + 그날 대구의 일출·일몰 시각(계산)으로 정한다.
//   색·빛은 시간대 사이를 부드럽게 이어서(갑자기 바뀌지 않게) 정한다.
// 날씨: 맑음 · 흐림 · 비 · 눈 — Open-Meteo(무료, 가입·키 없음)에서 대구 지금 날씨를 15분마다 받는다. 못 받으면 맑음.
// 시험용 주소: ?sky=morning|noon|afternoon|sunset|evening|night  ?wx=clear|cloudy|rain|snow  (?clock=HH:MM 도 따름)
// 보기만 다름 — 경기·판정과 상관없음. 경기장 배경(배경 아이템)에는 적용하지 않는다.
import * as THREE from 'three';
import { dotTex, seeded } from './arena-kit.js';
import { ONLINE } from './net.js';

export const PLACE = { name: '대구', lat: 35.8714, lon: 128.6014 };
const KST = 9 * 60; // 한국 시간 = UTC + 9시간 (분)
const Q = new URLSearchParams(location.search);

// ───── 해 뜨고 지는 시각 (NOAA 간단식, 분 단위 한국 시간) ─────
export function sunTimes(date, lat = PLACE.lat, lon = PLACE.lon) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() + KST * 60e3 - start) / 864e5);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const noon = 720 - 4 * lon - eqt + KST;
  return { rise: noon - 4 * ha, set: noon + 4 * ha, noon };
}
// 지금 한국 시각 (자정부터 분). ?clock=HH:MM 이면 그 시각
function kstMinutes(now = new Date()) {
  const c = Q.get('clock');
  if (c && /^\d{1,2}:\d{2}$/.test(c)) { const [h, m] = c.split(':').map(Number); return h * 60 + m; }
  return ((now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60 + KST) % 1440 + 1440) % 1440;
}

// ───── 시간대별 모습 ─────
// top·hor: 하늘 위·지평선 색, hs·hg·hi: 하늘빛(위·아래 색, 세기), sc·si: 햇빛 색·세기, el: 해 높이(도), az: 0 동쪽 ~ 1 서쪽,
// glow: 불빛(가로등·창문) 0~1, stars: 별 0~1
const P = {
  night: { top: '#0a1230', hor: '#1c2a52', hs: '#56689c', hg: '#1f2536', hi: 0.75, sc: '#9fb4ff', si: 0.35, el: 50, az: 0.5, glow: 1, stars: 1 },
  dawn: { top: '#41609e', hor: '#f6b48c', hs: '#ffd2b0', hg: '#6d6a7a', hi: 0.95, sc: '#ffb27a', si: 0.8, el: 4, az: 0, glow: 0.5, stars: 0.15 },
  morning: { top: '#6fb6ec', hor: '#e6f3ff', hs: '#fff3e0', hg: '#9fb08a', hi: 1.35, sc: '#ffe9c8', si: 1.45, el: 25, az: 0.2, glow: 0, stars: 0 },
  noon: { top: '#4f9fe6', hor: '#d2ebff', hs: '#fffaf0', hg: '#9fb08a', hi: 1.6, sc: '#fff4e2', si: 1.8, el: 55, az: 0.5, glow: 0, stars: 0 },
  afternoon: { top: '#5aa2e0', hor: '#f2e5c6', hs: '#fff2dc', hg: '#a8a07a', hi: 1.5, sc: '#ffe2b0', si: 1.6, el: 25, az: 0.8, glow: 0, stars: 0 },
  sunset: { top: '#4a5f9e', hor: '#ff9a5a', hs: '#ffc49a', hg: '#7a6060', hi: 1.05, sc: '#ff8a4a', si: 1.15, el: 4, az: 1, glow: 0.45, stars: 0 },
  evening: { top: '#1f2c66', hor: '#875a8c', hs: '#9a8ac0', hg: '#3a3550', hi: 0.75, sc: '#b0a8ff', si: 0.35, el: 40, az: 0.6, glow: 0.9, stars: 0.5 },
};
export const PHASE_NAME = { morning: '아침', noon: '한낮', afternoon: '오후', sunset: '일몰', evening: '저녁', night: '밤' };
const PHASE_ICON = { morning: '🌅', noon: '☀️', afternoon: '🌤️', sunset: '🌇', evening: '🌆', night: '🌙' };

// 그날의 열쇠 시각들 (분). 사이는 색을 섞는다
function keys() {
  const { rise, set, noon } = sunTimes(new Date());
  return [
    [rise - 60, P.night], [rise - 15, P.dawn], [rise + 90, P.morning], [noon, P.noon],
    [set - 120, P.afternoon], [set - 10, P.sunset], [set + 40, P.evening], [set + 90, P.night],
    [rise - 60 + 1440, P.night],
  ];
}
// 시간대 이름 (화면 표시용)
export function phaseAt(m) {
  const { rise, set, noon } = sunTimes(new Date());
  if (m < rise - 30 || m >= set + 75) return 'night';
  if (m < rise + 150) return 'morning';
  if (m < noon + 90) return 'noon';
  if (m < set - 60) return 'afternoon';
  if (m < set + 20) return 'sunset';
  return 'evening';
}
// 시간대 모습 (섞인 값). ?sky= 이면 그 시간대 그대로
function lookAt(m) {
  const forced = Q.get('sky');
  if (forced && P[forced]) return { ...P[forced] };
  const ks = keys();
  const mm = m < ks[0][0] ? m + 1440 : m;
  for (let i = 0; i < ks.length - 1; i++) {
    const [t0, a] = ks[i], [t1, b] = ks[i + 1];
    if (mm >= t0 && mm < t1) return mix(a, b, (mm - t0) / (t1 - t0));
  }
  return { ...P.night };
}
const ca = new THREE.Color(), cb = new THREE.Color();
function mix(a, b, k) {
  k = k * k * (3 - 2 * k);
  const out = {};
  for (const key of Object.keys(a)) {
    if (typeof a[key] === 'number') out[key] = a[key] + (b[key] - a[key]) * k;
    else out[key] = '#' + ca.set(a[key]).lerp(cb.set(b[key]), k).getHexString();
  }
  return out;
}

// ───── 날씨 ─────
// WMO 날씨 번호 → 맑음·흐림·비·눈
export function wxOf(code) {
  if (code == null) return 'clear';
  if (code <= 1) return 'clear';
  if (code <= 3 || code === 45 || code === 48) return 'cloudy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain'; // 이슬비·비·소나기·뇌우
}
export const WX_NAME = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' };
const WX_ICON = { cloudy: '☁️', rain: '🌧️', snow: '❄️' };
// 날씨가 하늘을 얼마나 덮나 (0 맑음 ~ 1)
const WX = {
  clear: { cover: 0, fog: [60, 220], si: 1, hi: 1, clouds: 4, cloudGray: 0 },
  cloudy: { cover: 0.6, fog: [45, 170], si: 0.35, hi: 0.92, clouds: 12, cloudGray: 0.35 },
  rain: { cover: 0.85, fog: [25, 110], si: 0.15, hi: 0.78, clouds: 12, cloudGray: 0.65 },
  snow: { cover: 0.7, fog: [22, 100], si: 0.25, hi: 0.98, clouds: 12, cloudGray: 0.3 },
};
const weather = { wx: 'clear', temp: null, at: 0, busy: false };
async function fetchWeather() {
  // 서버 설정이 없는 로컬 테스트(점검 포함)에서는 바깥에 묻지 않고 맑음 (?wxlive=1 이면 받아 봄)
  if (weather.busy || !navigator.onLine || (!ONLINE && !Q.has('wxlive'))) { weather.at = Date.now(); return; }
  weather.busy = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=weather_code,temperature_2m&timezone=Asia%2FSeoul`;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(to);
    const j = await r.json();
    const code = Number(j?.current?.weather_code);
    weather.wx = wxOf(Number.isFinite(code) ? code : null);
    const t = Number(j?.current?.temperature_2m);
    weather.temp = Number.isFinite(t) ? Math.round(t) : null;
  } catch { /* 못 받으면 지난 날씨 그대로 (처음이면 맑음) */ }
  weather.at = Date.now();
  weather.busy = false;
}
const currentWx = () => (WX[Q.get('wx')] ? Q.get('wx') : weather.wx);

// ───── 장면 ─────
function skyMesh() {
  const geo = new THREE.SphereGeometry(90, 24, 16);
  const n = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}
function stars() {
  const rnd = seeded(91), n = 320, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, y = 0.15 + rnd() * 0.85, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 85, y * 85, Math.sin(a) * r * 85], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, map: dotTex(), transparent: true, depthWrite: false, fog: false, color: '#ffffff' }));
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}
function clouds() {
  const root = new THREE.Group(), rnd = seeded(5), mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false, transparent: true, opacity: 0.95 });
  const list = [];
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + rnd() * 1.8, 1), mat);
      b.position.set((k - 1.5) * 2.6 + rnd(), rnd() * 1.2, rnd() * 1.6);
      b.scale.y = 0.6;
      c.add(b);
    }
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4, r = 38 + rnd() * 22;
    c.position.set(Math.cos(a) * r, 22 + rnd() * 10, Math.sin(a) * r);
    c.rotation.y = rnd() * 3;
    root.add(c);
    list.push(c);
  }
  return { root, mat, list };
}
// 비 (선분) · 눈 (알갱이): 카메라 둘레 상자 안에서만 떨어진다
function precip(n, kind) {
  const rnd = seeded(kind === 'rain' ? 3 : 4), B = 14, H = 14;
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) base.set([(rnd() - 0.5) * 2 * B, rnd() * H, (rnd() - 0.5) * 2 * B], i * 3);
  const g = new THREE.BufferGeometry();
  let obj;
  if (kind === 'rain') {
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe0f5', transparent: true, opacity: 0.5, depthWrite: false }));
  } else {
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    obj = new THREE.Points(g, new THREE.PointsMaterial({ size: 5 * Math.min(devicePixelRatio || 1, 2), sizeAttenuation: false, map: dotTex(), transparent: true, opacity: 0.95, depthWrite: false, color: '#ffffff' }));
  }
  obj.frustumCulled = false;
  obj.visible = false;
  const speed = kind === 'rain' ? 13 : 1.1;
  let fallen = 0;
  return {
    obj,
    update(t, dt, cam, amount) {
      obj.visible = amount > 0.02;
      if (!obj.visible) return;
      obj.material.opacity = (kind === 'rain' ? 0.5 : 0.95) * Math.min(1, amount);
      fallen += speed * dt;
      const a = g.attributes.position.array, cx = cam.x, cz = cam.z;
      const shown = Math.floor(n * Math.min(1, amount));
      for (let i = 0; i < n; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
        // 상자를 카메라에 맞춰 감싸 돌린다 (카메라가 움직여도 빗줄기가 끊기지 않게)
        let x = ((bx - cx) % (2 * B) + 3 * B) % (2 * B) - B + cx;
        let z = ((bz - cz) % (2 * B) + 3 * B) % (2 * B) - B + cz;
        let y = (((by - fallen * (0.8 + (i % 5) * 0.08)) % H) + H) % H;
        if (kind === 'snow') { x += Math.sin(t * 0.8 + i) * 0.4; z += Math.cos(t * 0.6 + i * 1.3) * 0.3; }
        if (i >= shown) y = -50; // 약한 비·눈은 일부만
        if (kind === 'rain') { a.set([x, y, z, x + 0.03, y + 0.45, z], i * 6); }
        else a.set([x, y, z], i * 3);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

// world: scene.js의 world (광장이 켜졌을 때 world.plaza가 있음)
export function createPlazaSky(world) {
  const plaza = world.plaza;
  const root = new THREE.Group();
  plaza.root.add(root);
  const sky = skyMesh(), st = stars(), cl = clouds();
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex(), color: '#fff4cc', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunSp.renderOrder = -8;
  root.add(sky, st, cl.root, sunSp);
  const rain = precip(1400, 'rain'), snow = precip(1800, 'snow');
  root.add(rain.obj, snow.obj);
  const grass0 = plaza.grass.material.color.clone(), snowGrass = new THREE.Color('#eef3f7');
  // 지금 보이는 값 (목표로 천천히 다가감)
  const cur = { look: null, wx: { ...WX.clear }, rain: 0, snow: 0, snowCover: 0 };
  const hemi = world.scene.children.find((o) => o.isHemisphereLight);
  const sun = world.scene.children.find((o) => o.isDirectionalLight);
  const c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color(), gray = new THREE.Color();
  let lookT = -9, last = 0, target = null, tw = WX.clear;
  const state = { phase: 'noon', wx: 'clear' };

  // 날씨가 하늘색을 회색으로 덮는다
  const cover = (c, k, wx) => {
    const L = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    gray.setRGB(L, L, L);
    if (wx === 'rain') gray.multiplyScalar(0.8).lerp(c3.set('#5a6a80'), 0.25 * L);
    if (wx === 'snow') gray.setScalar(Math.min(1, L * 1.05 + 0.06));
    return c.lerp(gray, k);
  };
  const lerpN = (a, b, k) => a + (b - a) * k;

  return {
    state,
    update(now) {
      const dt = Math.min(0.1, now - (last || now));
      last = now;
      // 날씨: 15분마다 받기
      if (!Q.get('wx') && Date.now() - weather.at > 15 * 60e3) fetchWeather();
      // 시간대 목표: 1초마다 다시 계산
      if (now - lookT > 1 || !target) {
        lookT = now;
        const m = kstMinutes();
        target = lookAt(m);
        state.phase = Q.get('sky') && P[Q.get('sky')] && Q.get('sky') !== 'dawn' ? Q.get('sky') : phaseAt(m);
        state.wx = currentWx();
        tw = WX[state.wx];
      }
      const first = !cur.look;
      const k = first ? 1 : 1 - Math.exp(-dt * 0.8);
      if (first) cur.look = { ...target };
      else cur.look = mix(cur.look, target, k);
      for (const key of ['cover', 'si', 'hi', 'clouds', 'cloudGray']) cur.wx[key] = lerpN(cur.wx[key], tw[key], k);
      cur.wx.fog = [lerpN(cur.wx.fog[0], tw.fog[0], k), lerpN(cur.wx.fog[1], tw.fog[1], k)];
      cur.rain = lerpN(cur.rain, state.wx === 'rain' ? 1 : 0, first ? 1 : 1 - Math.exp(-dt * 0.6));
      cur.snow = lerpN(cur.snow, state.wx === 'snow' ? 1 : 0, first ? 1 : 1 - Math.exp(-dt * 0.6));
      cur.snowCover = lerpN(cur.snowCover, state.wx === 'snow' ? 0.75 : 0, first ? 1 : 1 - Math.exp(-dt * 0.05)); // 눈은 천천히 쌓임
      const L = cur.look, W = cur.wx, cov = W.cover;

      // 하늘 (아래 = 지평선 색, 위 = 하늘 위 색)
      const top = cover(c1.set(L.top), cov, state.wx), hor = cover(c2.set(L.hor), cov * 0.9, state.wx);
      const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = Math.max(0, pos.getY(i) / 90), t = Math.pow(y, 0.55);
        col.setXYZ(i, hor.r + (top.r - hor.r) * t, hor.g + (top.g - hor.g) * t, hor.b + (top.b - hor.b) * t);
      }
      col.needsUpdate = true;
      world.scene.background.copy(hor);
      world.scene.fog.color.copy(hor);
      world.scene.fog.near = W.fog[0]; world.scene.fog.far = W.fog[1];
      // 빛
      hemi.color.copy(cover(c3.set(L.hs), cov * 0.7, state.wx));
      hemi.groundColor.set(L.hg);
      hemi.intensity = L.hi * W.hi;
      sun.color.set(L.sc);
      sun.intensity = L.si * W.si;
      const el = (L.el * Math.PI) / 180, az = L.az * Math.PI;
      const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.6 + 0.35];
      sun.position.set(dir[0] * 20, Math.max(2, dir[1] * 20), dir[2] * 20);
      // 해·달 그림 (맑을수록 잘 보임)
      sunSp.position.set(dir[0] * 80, Math.max(3, dir[1] * 80), dir[2] * 80);
      const night = L.stars > 0.4;
      sunSp.material.color.set(night ? '#dfe6ff' : L.sc);
      sunSp.scale.setScalar(night ? 6 : 14);
      sunSp.material.opacity = (1 - cov) * (night ? 0.8 : 0.9);
      // 별·구름
      st.material.opacity = L.stars * (1 - cov);
      st.visible = st.material.opacity > 0.02;
      const bright = Math.min(1, L.hi / 1.4);
      cl.mat.color.copy(c1.set('#ffffff').lerp(c2.set('#6b7380'), W.cloudGray)).multiplyScalar(0.35 + 0.65 * bright);
      if (L.stars < 0.5) cl.mat.color.lerp(c3.set(L.hor), 0.15);
      cl.list.forEach((c, i) => { c.visible = i < Math.round(W.clouds); });
      cl.root.rotation.y = now * 0.004;
      // 불빛: 가로등·창문·전구 (밤·흐린 날 켜짐)
      const glowK = Math.min(1, L.glow + (state.wx === 'rain' ? 0.35 : state.wx === 'cloudy' || state.wx === 'snow' ? 0.15 : 0));
      // 불빛 재질: 광장 20장 건물은 userData.glow = [낮, 밤] (창문·간판·가로등 모델), 예전 것은 glowBase
      for (const m of plaza.glow) m.emissiveIntensity = m.userData.glow ? m.userData.glow[0] + (m.userData.glow[1] - m.userData.glow[0]) * glowK : m.userData.glowBase + glowK * 1.1;
      for (const f of plaza.nightFx || []) f(glowK); // 가로등 바닥 빛 웅덩이·빛 번짐
      for (const h of plaza.halos) { h.visible = glowK > 0.3; h.material.opacity = Math.min(0.9, (glowK - 0.3) * 1.6); }
      // 눈이 쌓이면 잔디가 하얗게
      plaza.grass.material.color.copy(grass0).lerp(snowGrass, cur.snowCover);
      plaza.snowLayer.material.opacity = cur.snowCover * 0.8;
      plaza.snowLayer.visible = cur.snowCover > 0.01;
      // 뽑기 기계 손잡이: 천천히 돈다
      if (plaza.knob) plaza.knob.rotation.z = now * 0.5;
      plaza.tick?.(now); // 분수·바다 물결·돌고래·시계 초침·굴뚝 연기 (광장 20장)
      // 비·눈
      const cp = world.camera.position;
      rain.update(now, dt, cp, cur.rain);
      snow.update(now, dt, cp, cur.snow);
    },
    // 화면 표시용 글자: '☀️ 한낮 · 맑음 · 대구 3°'
    label() {
      const icon = state.wx === 'clear' ? PHASE_ICON[state.phase] : WX_ICON[state.wx];
      const t = weather.temp != null && !Q.get('wx') ? ` ${weather.temp}°` : '';
      return `${icon} ${PHASE_NAME[state.phase]} · ${WX_NAME[state.wx]} · ${PLACE.name}${t}`;
    },
  };
}
