// Web Audio API로 탁구 소리를 실시간 합성 (녹음 파일 없이)
let ctx = null;
let master, dryBus, revSend, noiseBuf;
let echoIn, echoFb, echoLevel = 0; // 몰입 에코 (랠리가 길어질수록 커짐)
let listener = { pos: [0, 1.7, 3.6], right: [1, 0, 0] };
let quiet = 1; // 위치가 있는 소리(타구·바운드)의 전체 크기. 로비 배경 랠리는 작게

// 로비 배경처럼 작게 들려야 할 때 0~1 (경기 중에는 1)
export function setQuiet(k) { quiet = k; }

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 3;
  comp.attack.value = 0.002;
  comp.release.value = 0.1;
  master.connect(comp).connect(ctx.destination);

  dryBus = ctx.createGain();
  dryBus.connect(master);

  // 체육관 잔향
  const conv = ctx.createConvolver();
  conv.buffer = makeIR(1.5, 0.018);
  revSend = ctx.createGain();
  revSend.gain.value = 0.22;
  revSend.connect(conv).connect(master);

  // 몰입 에코: 짧은 메아리가 몇 번 되풀이 (setEcho로 양 조절, 처음엔 0)
  echoIn = ctx.createGain();
  echoIn.gain.value = 0;
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.17;
  echoFb = ctx.createGain();
  echoFb.gain.value = 0.3;
  const elp = ctx.createBiquadFilter();
  elp.type = 'lowpass';
  elp.frequency.value = 2600;
  echoIn.connect(dl).connect(elp).connect(echoFb).connect(dl);
  elp.connect(conv);
  elp.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function makeIR(seconds, predelay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const pre = Math.floor(rate * predelay);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      lp += (Math.random() * 2 - 1 - lp) * 0.35; // 거친 고음을 부드럽게
      ch[i] = lp * Math.exp(-t * 4.2);
    }
  }
  return buf;
}

export function setListener(pos, right) {
  listener.pos = pos;
  listener.right = right;
}

// 몰입 정도 k (0~1): 타구음·바운드음의 메아리와 잔향을 키운다
export function setEcho(k) {
  if (!ctx || Math.abs(k - echoLevel) < 0.005) return;
  echoLevel = k;
  const t = ctx.currentTime;
  echoIn.gain.setTargetAtTime(k * 0.45, t, 0.1);
  echoFb.gain.setTargetAtTime(0.3 + k * 0.25, t, 0.1);
  revSend.gain.setTargetAtTime(0.22 + k * 0.18, t, 0.1);
}

export const audioNow = () => (ctx ? ctx.currentTime : 0);

// 소리 위치 → 좌우, 거리감
function spatial(pos) {
  if (!pos) return { pan: 0, gain: 1, cutoff: 20000 };
  const rel = [pos[0] - listener.pos[0], pos[1] - listener.pos[1], pos[2] - listener.pos[2]];
  const dist = Math.hypot(rel[0], rel[1], rel[2]);
  const side = rel[0] * listener.right[0] + rel[2] * listener.right[2];
  const pan = Math.max(-0.85, Math.min(0.85, (side / Math.max(dist, 0.5)) * 1.3));
  const gain = Math.max(0.12, Math.min(1, 2.2 / (dist + 0.4)));
  const cutoff = 20000 / (1 + Math.max(0, dist - 1.5) * 0.45);
  if (quiet < 1) return { pan, gain: gain * quiet, cutoff: Math.min(cutoff, 6000) }; // 로비 배경: 작고 부드럽게
  return { pan, gain, cutoff };
}

// 한 소리를 만들 출력 체인
function chain(when, pos, wet = 1, echo = false) {
  const sp = spatial(pos);
  const out = ctx.createGain();
  out.gain.value = sp.gain;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = sp.cutoff;
  const pan = ctx.createStereoPanner();
  pan.pan.value = sp.pan;
  out.connect(lp).connect(pan);
  pan.connect(dryBus);
  const send = ctx.createGain();
  send.gain.value = wet * (0.6 + (1 - sp.gain) * 0.8); // 멀수록 잔향 비율 증가
  pan.connect(send).connect(revSend);
  if (echo) pan.connect(echoIn);
  return out;
}

const jitter = (amt) => 1 + (Math.random() * 2 - 1) * amt;

// 감쇠하는 사인파 하나 (모달 합성)
function mode(dest, when, freq, amp, decay, glide = 0) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * (1 + glide), when);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq, when + 0.02);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + 0.0012);
  g.gain.setTargetAtTime(0, when + 0.0012, decay);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + decay * 8 + 0.02);
}

// 짧은 노이즈 '틱'
function tick(dest, when, freq, q, amp, dur, type = 'bandpass') {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(amp, when);
  g.gain.setTargetAtTime(0, when, dur);
  s.connect(f).connect(g).connect(dest);
  const off = Math.random() * 0.5;
  s.start(when, off, dur * 8 + 0.02);
}

function at(when) {
  return when == null ? ctx.currentTime : Math.max(ctx.currentTime, when);
}

// 라켓 타구음. grade: perfect | good | bad | block. skin: 탁구채마다 다른 소리 (items.js의 sound, 없으면 기본)
export function playHit(grade, pos, when, skin = null) {
  if (!ctx) return;
  const t = at(when);
  const p = jitter(0.04);
  const v = jitter(0.04);
  const out = chain(t, pos, 0.9, true);
  if (skin && HIT_SKINS[skin]) {
    // 등급: 퍼펙트일수록 크고 밝게 (bad는 얇고 작게, block은 먹먹하게)
    const k = { perfect: 1, good: 0.8, bad: 0.55, block: 0.6 }[grade] ?? 0.8;
    const bright = { perfect: 1, good: 0.8, bad: 0.7, block: 0.5 }[grade] ?? 0.8;
    const soft = ctx.createBiquadFilter(); // 모든 특수 소리는 부드럽게 (귀 아픈 고음 컷)
    soft.type = 'lowpass';
    soft.frequency.value = 2500 + 5500 * bright;
    const vol = ctx.createGain();
    vol.gain.value = SKIN_GAIN[skin] ?? 1;
    soft.connect(vol).connect(out);
    HIT_SKINS[skin](soft, t, { grade, k, bright, p, v });
    return;
  }
  if (grade === 'perfect') {
    // 맑고 단단한 "톡"
    mode(out, t, 1180 * p, 0.55 * v, 0.016, 0.06);
    mode(out, t, 2620 * p, 0.32 * v, 0.008);
    mode(out, t, 4350 * p, 0.14 * v, 0.004);
    mode(out, t, 240 * p, 0.35 * v, 0.012);
    tick(out, t, 3400 * p, 1.4, 0.55 * v, 0.004);
  } else if (grade === 'good') {
    // 약간 둔한 소리
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.connect(out);
    mode(f, t, 1020 * p, 0.5 * v, 0.02, 0.04);
    mode(f, t, 2250 * p, 0.22 * v, 0.009);
    mode(f, t, 200 * p, 0.3 * v, 0.016);
    tick(f, t, 2200 * p, 1, 0.35 * v, 0.005);
  } else if (grade === 'bad') {
    // 얇고 가벼운 소리
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1300;
    f.connect(out);
    mode(f, t, 1650 * p, 0.3 * v, 0.008);
    mode(f, t, 3600 * p, 0.14 * v, 0.004);
    tick(f, t, 4200 * p, 2, 0.25 * v, 0.003);
  } else if (grade === 'block') {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    f.connect(out);
    mode(f, t, 880 * p, 0.38 * v, 0.014);
    mode(f, t, 1900 * p, 0.14 * v, 0.007);
    tick(f, t, 1500 * p, 1, 0.2 * v, 0.004);
  }
}

/* ───────────── 탁구채별 타구음 (ASMR: 모두 짧고 부드럽게, 거친 고음 없이) ───────────── */
// 노이즈 한 번 (필터 주파수를 f → f2로 옮길 수 있음)
function burst(dest, when, { type = 'bandpass', f = 1000, f2 = null, q = 1, amp = 0.3, a = 0.002, d = 0.03, sweep = 0.06 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, when);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, when + sweep);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + a);
  g.gain.setTargetAtTime(0, when + a, d);
  s.connect(fl).connect(g).connect(dest);
  s.start(when, Math.random() * 0.5, a + d * 8 + 0.02);
}
// 바삭바삭한 작은 알갱이들
function crackle(dest, when, n, spread, fLo, fHi, amp, type = 'bandpass', len = 1) {
  for (let i = 0; i < n; i++) {
    const dt = Math.pow(Math.random(), 1.6) * spread;
    tick(dest, when + dt, fLo + Math.random() * (fHi - fLo), type === 'bandpass' ? 2.2 : 0.7, amp * (0.5 + Math.random() * 0.5) * (1 - dt / spread * 0.6), (0.0018 + Math.random() * 0.0015) * len, type);
  }
}
// 음높이가 미끄러지는 소리 (뾱, 꽥)
function chirp(dest, when, pts, amp, type = 'sine', rel = 0.03) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(pts[0][1], when);
  for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, when + dt);
  const end = pts[pts.length - 1][0];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(amp, when + 0.006);
  g.gain.setValueAtTime(amp, when + Math.max(0.007, end - rel));
  g.gain.linearRampToValueAtTime(0, when + end + rel * 0.5);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + end + rel + 0.02);
  return o;
}
// 줄 하나 튕기기 (기타): 배음마다 다르게 줄어듦
function pluck(dest, when, f, amp, len = 1) {
  for (let h = 1; h <= 6; h++) mode(dest, when, f * h * (1 + (h - 1) * 0.0015), amp / Math.pow(h, 1.25), (0.32 * len) / Math.pow(h, 0.7));
}
const GUITAR_CHORDS = [
  [196, 247, 294, 392], // G
  [165, 196, 247, 330], // Em
  [131, 165, 196, 262], // C
  [147, 220, 294, 370], // D
];
let chordIdx = 0;

// 소리마다 음량 맞추기 (기본 타구음과 비슷하게 들리게. 수세미는 일부러 작게)
const SKIN_GAIN = { bread: 2.3, melon: 2.2, fish: 1.7, plastic: 1.4, sponge: 2.3, pan: 1.15, guitar: 1.9, keyboard: 1.6, mouse: 2.8, phone: 2.3, duck: 0.65, hammer: 1.05 };

const HIT_SKINS = {
  // 식빵·바게트·도넛·와플·피자: 빵 '푸석'
  bread(o, t, { k, p, grade }) {
    // 높은 바삭 소리는 빼고, 낮고 둥근 '푹' + 먹먹한 부스럭
    burst(o, t, { type: 'lowpass', f: 900 * p, f2: 450, q: 0.6, amp: 0.4 * k, a: 0.007, d: 0.035, sweep: 0.06 });
    crackle(o, t + 0.004, grade === 'perfect' ? 7 : 5, 0.055, 500, 1100, 0.12 * k, 'lowpass', 2.5);
    mode(o, t, 150 * p, 0.26 * k, 0.022);
    mode(o, t, 320 * p, 0.08 * k, 0.012);
  },
  // 수박: 과육을 누르는 촉촉한 '츕'
  melon(o, t, { k, p, grade }) {
    // 수박 한 입: 부드러운 '사각'(높은 소리 없이) + 촉촉한 즙
    const crunch = ctx.createBiquadFilter();
    crunch.type = 'lowpass';
    crunch.frequency.value = 1500 * p;
    crunch.Q.value = 0.5;
    crunch.connect(o);
    burst(crunch, t, { f: 1000, q: 0.6, amp: 0.26 * k, a: 0.004, d: 0.02 });
    crackle(crunch, t + 0.003, grade === 'perfect' ? 12 : 8, 0.07, 700, 1500, 0.15 * k, 'bandpass', 2);
    burst(o, t + 0.02, { type: 'lowpass', f: 1000, f2: 380, q: 3, amp: 0.15 * k, a: 0.012, d: 0.045, sweep: 0.09 });
    mode(o, t, 150 * p, 0.14 * k, 0.02);
  },
  // 고등어: 젖은 생선 '철썩'
  fish(o, t, { k, p }) {
    burst(o, t, { f: 1100 * p, q: 0.6, amp: 0.48 * k, a: 0.0015, d: 0.02 });
    burst(o, t + 0.006, { type: 'lowpass', f: 1000, f2: 280, q: 2, amp: 0.2 * k, a: 0.005, d: 0.05, sweep: 0.09 });
    mode(o, t, 118 * p, 0.3 * k, 0.024);
    crackle(o, t + 0.01, 3, 0.06, 1800, 2800, 0.05 * k);
  },
  // 밥주걱·슬리퍼·파리채·부채: 약간 탁한 플라스틱 '탁'
  plastic(o, t, { k, p, v }) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    f.connect(o);
    mode(f, t, 640 * p, 0.36 * k * v, 0.011, 0.05);
    mode(f, t, 1490 * p, 0.18 * k, 0.006);
    mode(f, t, 2700 * p, 0.07 * k, 0.003);
    mode(f, t, 190 * p, 0.2 * k, 0.01);
    tick(f, t, 1600 * p, 1, 0.22 * k, 0.004);
  },
  // 수세미·칠판지우개: 약한 '푸석'
  sponge(o, t, { k, p }) {
    // 물 먹은 수세미: 먹먹한 '푹' + 물기 짜이는 '츄'
    burst(o, t, { type: 'lowpass', f: 650 * p, q: 0.8, amp: 0.2 * k, a: 0.006, d: 0.032 });
    burst(o, t + 0.01, { type: 'lowpass', f: 800, f2: 300, q: 2.6, amp: 0.1 * k, a: 0.008, d: 0.04, sweep: 0.08 });
    crackle(o, t, 4, 0.05, 450, 850, 0.05 * k, 'lowpass', 2.5);
    mode(o, t, 140 * p, 0.12 * k, 0.016);
  },

  // ── 전설 ──
  // 프라이팬: 맑게 울리는 '댕~' (레 음, 날카롭지 않게)
  pan(o, t, { k, p, grade }) {
    const len = grade === 'perfect' ? 1 : grade === 'good' ? 0.7 : 0.4;
    const B = 587 * p;
    mode(o, t, B, 0.3 * k, 0.2 * len);
    mode(o, t, B * 1.004, 0.1 * k, 0.24 * len); // 살짝 일렁임
    mode(o, t, B * 2.32, 0.13 * k, 0.1 * len);
    mode(o, t, B * 4.25, 0.05 * k, 0.05 * len);
    mode(o, t, B * 6.63, 0.02 * k, 0.025 * len);
    mode(o, t, 220 * p, 0.16 * k, 0.02);
    tick(o, t, 2800, 1, 0.22 * k, 0.003);
  },
  // 통기타: 칠 때마다 G → Em → C → D 화음을 차례로 '스르랑'
  guitar(o, t, { k, grade }) {
    const chord = GUITAR_CHORDS[chordIdx++ % GUITAR_CHORDS.length];
    const notes = grade === 'perfect' ? chord : grade === 'good' ? chord.slice(1, 3) : [chord[1]];
    const len = grade === 'block' ? 0.25 : grade === 'bad' ? 0.45 : 1;
    notes.forEach((f, i) => pluck(o, t + i * 0.014, f, (0.22 * k) / Math.sqrt(notes.length), len));
    mode(o, t, 110, 0.12 * k, 0.03); // 통 울림
    tick(o, t, 2400, 1.2, 0.1 * k, 0.003); // 피크
  },
  // 키보드: 청축 '찰칵'
  //  찰 = 클릭 재킷이 튀며 나는 맑고 높은 금속성 '틱'(4~7kHz 짧은 울림)
  //  칵 = 약 18ms 뒤 키가 바닥에 부딪히는 단단한 플라스틱 소리(1~2kHz)
  //  손을 떼면 작은 '찰'이 한 번 더
  keyboard(o, t, { k }) {
    const q = jitter(0.03);
    const hp = ctx.createBiquadFilter(); // 찰: 낮은 소리는 빼고 또렷하게
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    hp.connect(o);
    const chal = (w, a) => {
      tick(hp, w, 5200 * q, 1.2, 0.55 * a, 0.0006);
      mode(hp, w, 4650 * q, 0.2 * a, 0.006);
      mode(hp, w, 6900 * q, 0.08 * a, 0.004);
      mode(hp, w, 3300 * q, 0.1 * a, 0.004);
    };
    chal(t, k);
    const w = t + 0.018; // 칵
    tick(o, w, 1900 * q, 1.4, 0.4 * k, 0.0015);
    mode(o, w, 1750 * q, 0.16 * k, 0.005);
    mode(o, w, 1050 * q, 0.14 * k, 0.007);
    mode(o, w, 380 * q, 0.1 * k, 0.01);
    chal(t + 0.11, k * 0.45); // 뗄 때
    mode(o, t + 0.113, 1500 * q, 0.05 * k, 0.004);
  },
  // 마우스: 또렷한 '딸깍' (퍼펙트는 더블클릭)
  mouse(o, t, { k, grade }) {
    const click = (w, a) => {
      tick(o, w, 4000, 3, 0.26 * a, 0.0016);
      mode(o, w, 2100, 0.1 * a, 0.004);
      mode(o, w, 640, 0.12 * a, 0.006);
      // 손을 떼는 작은 딸깍
      tick(o, w + 0.05, 3400, 3, 0.1 * a, 0.0014);
      mode(o, w + 0.05, 1800, 0.04 * a, 0.003);
    };
    click(t, k);
    if (grade === 'perfect') click(t + 0.1, k * 0.85);
  },
  // 스마트폰: 유리 '톡' + 작은 알림음 '띠링'
  phone(o, t, { k, grade }) {
    mode(o, t, 1900, 0.2 * k, 0.006);
    mode(o, t, 4100, 0.06 * k, 0.003);
    mode(o, t, 250, 0.14 * k, 0.01);
    tick(o, t, 4500, 2, 0.1 * k, 0.0015);
    if (grade === 'perfect') {
      mode(o, t + 0.05, 1319, 0.075, 0.12);
      mode(o, t + 0.05, 2638, 0.012, 0.05);
      mode(o, t + 0.13, 1976, 0.07, 0.2);
      mode(o, t + 0.13, 3952, 0.01, 0.06);
    } else if (grade === 'good') {
      mode(o, t + 0.05, 1568, 0.055, 0.14);
    }
  },
  // 고무 오리: 귀여운 '꽥' (부드러운 삼각파 + 떨림)
  duck(o, t, { k, grade }) {
    const len = { perfect: 0.15, good: 0.11, bad: 0.06, block: 0.04 }[grade] ?? 0.1;
    const top = grade === 'bad' ? 1350 : 1150;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.4;
    bp.connect(o);
    const osc = chirp(bp, t, [[0, 720], [len * 0.25, top], [len, top * 0.78]], 0.42 * k, 'triangle', 0.025);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    const depth = ctx.createGain();
    depth.gain.value = 35;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
    burst(o, t, { f: 2200, q: 1, amp: 0.04 * k, a: 0.01, d: len * 0.4 }); // 바람 새는 소리
    mode(o, t, 260, 0.16 * k, 0.014); // 고무 '퐁'
  },
  // 뿅망치: '뿅!' (음이 위로 미끄러짐) + 주름 '퍽'
  hammer(o, t, { k, grade }) {
    const top = { perfect: 1300, good: 1100, bad: 900, block: 700 }[grade] ?? 1000;
    const len = grade === 'perfect' ? 0.085 : 0.065;
    chirp(o, t + 0.004, [[0, 360], [len, top]], 0.24 * k, 'sine', 0.04);
    chirp(o, t + 0.004, [[0, 720], [len, top * 2]], 0.035 * k, 'triangle', 0.03);
    burst(o, t, { f: 700, q: 0.8, amp: 0.25 * k, a: 0.002, d: 0.014 });
    mode(o, t, 180, 0.22 * k, 0.02);
  },
};

// 테이블 바운드음: 빠를수록 크고 밝게. skin: 탁구공마다 다른 소리 (balls.js의 sound, 없으면 기본)
export function playTable(speed, pos, when, skin = null) {
  if (!ctx) return;
  const t = at(when);
  const s = Math.max(0, Math.min(1, (speed - 1.5) / 5));
  const p = jitter(0.03);
  const amp = (0.35 + 0.65 * s) * jitter(0.04);
  const out = chain(t, pos, 1, true);
  if (skin && BOUNCE_SKINS[skin]) return bounceSkin(skin, out, t, { s, amp, p, floor: false });
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2200 + 7000 * s;
  f.connect(out);
  mode(f, t, 1320 * p, 0.5 * amp, 0.018 + 0.004 * s, 0.05);
  mode(f, t, 3050 * p, 0.25 * amp, 0.007);
  mode(f, t, 520 * p, 0.32 * amp, 0.02);
  mode(f, t, 150 * p, 0.25 * amp * (0.4 + s), 0.03);
  tick(f, t, 2700 * p, 1.2, 0.4 * amp, 0.004);
}

/* ───────────── 탁구공별 바운드음 (ASMR: 짧고 부드럽게, 계속 들어도 안 거슬리게) ─────────────
   o = 출력, t = 시각, s = 빠르기(0~1), amp = 크기, p = 음높이 흔들림, floor = 바닥에 튐(더 먹먹하게) */
const BOUNCE_GAIN = { jelly: 1.95, rubber: 1.3, peel: 2.2, tomato: 1.4, mochi: 1.5, tako: 2.3, eggshell: 2.4, billiard: 1.4, rock: 0.7, dragon: 1.75, sun: 1.45 };
function bounceSkin(skin, out, t, a) {
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = a.floor ? 2200 : 3200 + 4500 * a.s;
  const vol = ctx.createGain();
  vol.gain.value = (BOUNCE_GAIN[skin] ?? 1) * (a.floor ? 0.8 : 1);
  soft.connect(vol).connect(out);
  BOUNCE_SKINS[skin](soft, t, a);
}
const BOUNCE_SKINS = {
  // 눈알: 살짝 말랑한 젤리 '톡'
  jelly(o, t, { amp, p }) {
    mode(o, t, 820 * p, 0.32 * amp, 0.012, 0.18);
    mode(o, t, 300 * p, 0.22 * amp, 0.02, 0.1);
    burst(o, t, { type: 'lowpass', f: 1300 * p, f2: 500, q: 1.5, amp: 0.12 * amp, a: 0.003, d: 0.015, sweep: 0.03 });
  },
  // 스마일: 통통한 고무공 '통'
  rubber(o, t, { amp, p }) {
    mode(o, t, 430 * p, 0.42 * amp, 0.028, 0.12);
    mode(o, t, 860 * p, 0.1 * amp, 0.012);
    mode(o, t, 150 * p, 0.2 * amp, 0.03);
    tick(o, t, 1400 * p, 0.8, 0.12 * amp, 0.003, 'lowpass');
  },
  // 귤: 껍질이 둔탁한 '톡'
  peel(o, t, { amp, p }) {
    mode(o, t, 620 * p, 0.32 * amp, 0.01, 0.06);
    burst(o, t, { type: 'lowpass', f: 900 * p, q: 0.8, amp: 0.26 * amp, a: 0.002, d: 0.014 });
    mode(o, t, 190 * p, 0.2 * amp, 0.018);
    crackle(o, t + 0.002, 3, 0.02, 900, 1600, 0.05 * amp, 'bandpass', 1.5);
  },
  // 방울토마토: 탱글한 '퐁' (음이 살짝 올라감)
  tomato(o, t, { amp, p }) {
    mode(o, t, 640 * p, 0.38 * amp, 0.03, -0.28);
    mode(o, t, 1300 * p, 0.08 * amp, 0.012, -0.2);
    mode(o, t, 200 * p, 0.16 * amp, 0.02);
    burst(o, t, { type: 'lowpass', f: 1500, q: 0.7, amp: 0.08 * amp, a: 0.002, d: 0.006 });
  },
  // 찹쌀떡: 쫀득 (낮고 끈적하게 늘어나는 소리)
  mochi(o, t, { amp, p }) {
    burst(o, t, { type: 'lowpass', f: 650 * p, f2: 260, q: 2.2, amp: 0.36 * amp, a: 0.008, d: 0.035, sweep: 0.07 });
    chirp(o, t + 0.004, [[0, 250 * p], [0.06, 165 * p]], 0.16 * amp, 'sine', 0.03);
    mode(o, t, 120 * p, 0.2 * amp, 0.03);
  },
  // 타코야끼: 따끈 말랑한 '폭'
  tako(o, t, { amp, p }) {
    burst(o, t, { type: 'lowpass', f: 950 * p, f2: 420, q: 1, amp: 0.34 * amp, a: 0.004, d: 0.028, sweep: 0.05 });
    mode(o, t, 230 * p, 0.24 * amp, 0.024, 0.05);
    crackle(o, t + 0.006, 3, 0.04, 500, 1000, 0.06 * amp, 'lowpass', 2);
  },
  // 계란: 속이 빈 단단한 껍데기 '톡' (가볍고 맑게)
  eggshell(o, t, { amp, p }) {
    mode(o, t, 1500 * p, 0.3 * amp, 0.008);
    mode(o, t, 3100 * p, 0.1 * amp, 0.004);
    mode(o, t, 640 * p, 0.14 * amp, 0.012); // 빈 속 울림
    tick(o, t, 2400 * p, 1.3, 0.2 * amp, 0.003);
  },
  // 8번 당구공: 단단하고 맑은 '딱'
  billiard(o, t, { amp, p }) {
    mode(o, t, 2350 * p, 0.34 * amp, 0.011);
    mode(o, t, 3900 * p, 0.12 * amp, 0.006);
    mode(o, t, 1150 * p, 0.2 * amp, 0.008);
    mode(o, t, 420 * p, 0.12 * amp, 0.012);
    tick(o, t, 3200 * p, 1.6, 0.25 * amp, 0.003);
  },
  // 소행성: 운석이 떨어지듯 묵직한 '쿵-' (낮게 꺼지는 울림 + 퍼지는 먼지 + 튀는 자갈)
  rock(o, t, { amp, p, s }) {
    mode(o, t, 70 * p, 0.6 * amp, 0.09, 0.45);           // 땅이 울리는 낮은 쿵
    mode(o, t, 140 * p, 0.3 * amp, 0.05, 0.3);
    burst(o, t, { type: 'lowpass', f: 700 * p, f2: 160, q: 0.9, amp: 0.45 * amp, a: 0.002, d: 0.06, sweep: 0.12 }); // 충돌
    burst(o, t + 0.02, { type: 'lowpass', f: 420, f2: 200, q: 0.5, amp: 0.16 * amp, a: 0.03, d: 0.12, sweep: 0.25 }); // 먼지 '스으'
    crackle(o, t + 0.03, 8 + Math.round(s * 6), 0.22, 800, 2200, 0.06 * amp, 'bandpass', 1.4); // 자갈 후두두
  },
  // 드래곤 알: 단단한 알 껍데기 '톡' + 낮은 '화르륵'
  dragon(o, t, { amp, p }) {
    mode(o, t, 1150 * p, 0.28 * amp, 0.01);
    mode(o, t, 2300 * p, 0.08 * amp, 0.005);
    tick(o, t, 1800 * p, 1.2, 0.18 * amp, 0.003);
    burst(o, t + 0.01, { type: 'bandpass', f: 500, f2: 1300, q: 0.6, amp: 0.13 * amp, a: 0.03, d: 0.07, sweep: 0.14 });
    crackle(o, t + 0.02, 5, 0.14, 400, 900, 0.05 * amp, 'lowpass', 2);
    mode(o, t, 110 * p, 0.15 * amp, 0.06);
  },
  // 미니 태양: '치익'(달군 팬에 물방울) + 따뜻한 울림
  sun(o, t, { amp, p }) {
    mode(o, t, 900 * p, 0.2 * amp, 0.01);
    burst(o, t + 0.004, { type: 'bandpass', f: 2600, f2: 1700, q: 0.9, amp: 0.12 * amp, a: 0.006, d: 0.06, sweep: 0.18 });
    crackle(o, t + 0.01, 6, 0.12, 1800, 3000, 0.035 * amp, 'bandpass', 1);
    mode(o, t, 220 * p, 0.17 * amp, 0.14);
    mode(o, t, 330 * p, 0.08 * amp, 0.11);
  },
};

// 체육관 나무 바닥에 통통
export function playFloor(speed, pos, when, skin = null) {
  if (!ctx) return;
  const t = at(when);
  const s = Math.max(0, Math.min(1, speed / 5));
  const p = jitter(0.04);
  const amp = (0.1 + 0.75 * s) * jitter(0.05);
  const out = chain(t, pos, 1.3);
  if (skin && BOUNCE_SKINS[skin]) return bounceSkin(skin, out, t, { s, amp, p, floor: true });
  mode(out, t, 960 * p, 0.45 * amp, 0.02, 0.04);
  mode(out, t, 2200 * p, 0.18 * amp, 0.008);
  mode(out, t, 340 * p, 0.3 * amp, 0.03);
  tick(out, t, 2000 * p, 1, 0.25 * amp, 0.004);
}

// 네트: 둔하고 짧게
export function playNet(pos, when) {
  if (!ctx) return;
  const t = at(when);
  const out = chain(t, pos, 0.8);
  tick(out, t, 380, 0.7, 0.6, 0.02, 'lowpass');
  mode(out, t, 165, 0.35, 0.03);
}

// 서브 토스: 아주 작게
// ── 알이 깨질 때 (balls.js의 hatch) ──
// 껍데기가 '빠직' 깨지는 소리. kind: 'chick'(계란) | 'dragon'(드래곤 알: 더 묵직 + 불 '화르륵')
export function playCrack(pos, kind = 'chick') {
  if (!ctx) return;
  const t = at();
  const out = chain(t, pos, 1);
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass'; soft.frequency.value = 6500;
  const vol = ctx.createGain(); vol.gain.value = 4.5;
  soft.connect(vol).connect(out);
  const heavy = kind === 'dragon';
  mode(soft, t, heavy ? 900 : 1400, 0.3, 0.01);
  burst(soft, t, { type: 'bandpass', f: heavy ? 1300 : 2200, q: 0.9, amp: 0.3, a: 0.001, d: 0.012 });
  crackle(soft, t + 0.004, heavy ? 10 : 8, 0.09, heavy ? 1200 : 1800, heavy ? 3200 : 4200, 0.12, 'bandpass', 1.2); // 조각이 바스락
  if (heavy) {
    mode(soft, t, 110, 0.3, 0.06, 0.3);
    burst(soft, t + 0.02, { type: 'bandpass', f: 450, f2: 1400, q: 0.6, amp: 0.2, a: 0.05, d: 0.12, sweep: 0.25 });
  }
}
// 털뭉치 병아리 '삐약' (두 음절, 작고 귀엽게)
export function playPeep(pos) {
  if (!ctx) return;
  const t = at();
  const out = chain(t, pos, 0.8);
  const q = 1 + (Math.random() - 0.5) * 0.1;
  for (const [dt, a, b, c] of [[0, 2600, 3500, 3000], [0.13, 3100, 3700, 2500]]) {
    chirp(out, t + dt, [[0, a * q], [0.03, b * q], [0.09, c * q]], 0.17, 'sine', 0.025);
    chirp(out, t + dt, [[0, a * 2 * q], [0.03, b * 2 * q], [0.09, c * 2 * q]], 0.022, 'sine', 0.025);
  }
}
// 아기 용 '꺄오!' (작은 울음) + 불 뿜는 '화르륵'
export function playRoar(pos) {
  if (!ctx) return;
  const t = at();
  const out = chain(t, pos, 1);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(380, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.03);
  g.gain.setValueAtTime(0.22, t + 0.2);
  g.gain.linearRampToValueAtTime(0, t + 0.32);
  const mix = ctx.createGain();
  for (const [f, qq, k] of [[800, 4, 1], [1500, 5, 0.6], [2600, 6, 0.25]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = qq;
    bp.frequency.setValueAtTime(f * 0.8, t); bp.frequency.linearRampToValueAtTime(f, t + 0.1);
    const kg = ctx.createGain(); kg.gain.value = k;
    g.connect(bp).connect(kg).connect(mix);
  }
  o.connect(g); mix.connect(out);
  o.start(t); o.stop(t + 0.35);
  burst(out, t + 0.08, { type: 'bandpass', f: 500, f2: 1500, q: 0.6, amp: 0.3, a: 0.06, d: 0.15, sweep: 0.3 });
}

export function playToss(pos) {
  if (!ctx) return;
  const t = at();
  const out = chain(t, pos, 0.3);
  tick(out, t, 2400, 1.5, 0.06, 0.006);
}

// 헛스윙: 작은 휙
export function playWhoosh(pos) {
  if (!ctx) return;
  const t = at();
  const out = chain(t, pos, 0.4);
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.05);
  g.gain.linearRampToValueAtTime(0, t + 0.17);
  s.connect(f).connect(g).connect(out);
  s.start(t, 0, 0.2);
}

// 찬스볼 타이밍 신호: 나무 실로폰처럼 작고 둥근 '똑 똑 똑 띵' (high = 마지막 높은 음 = 칠 타이밍)
export function playCue(when, high = false) {
  if (!ctx) return;
  const t = at(when);
  const out = chain(t, null, 0.15);
  out.gain.value = 0.55;
  if (high) {
    mode(out, t, 1568, 0.07, 0.11);
    mode(out, t, 3136, 0.012, 0.04);
  } else {
    mode(out, t, 1047, 0.05, 0.045);
    mode(out, t, 2094, 0.008, 0.02);
  }
}

// UI: 작고 부드럽게
export function playUI(kind = 'click') {
  if (!ctx) return;
  const t = at();
  const out = chain(t, null, 0.2);
  out.gain.value = 0.5;
  if (kind === 'click') {
    mode(out, t, 880, 0.08, 0.02);
  } else if (kind === 'point') {
    mode(out, t, 660, 0.06, 0.12);
    mode(out, t + 0.09, 990, 0.05, 0.16);
  } else if (kind === 'lose') {
    mode(out, t, 520, 0.05, 0.12);
    mode(out, t + 0.1, 390, 0.045, 0.16);
  } else if (kind === 'turn') {
    // 2v2 '내 차례!': 짧고 맑은 두 음
    mode(out, t, 1175, 0.045, 0.1);
    mode(out, t + 0.07, 1568, 0.04, 0.14);
  } else if (kind === 'coin') {
    // 코인 획득: 작고 맑은 '띠링'
    mode(out, t, 1319, 0.035, 0.08);
    mode(out, t + 0.06, 1976, 0.03, 0.18);
  } else if (kind === 'card') {
    // 뽑기 카드 (일반): 작은 '톡'
    mode(out, t, 988, 0.03, 0.06);
  } else if (kind === 'rare') {
    // 고급: 맑게 올라가는 세 음
    [1047, 1319, 1568].forEach((f, i) => mode(out, t + i * 0.06, f, 0.04, 0.14));
  } else if (kind === 'legend') {
    // 전설: 반짝이는 아르페지오
    [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => mode(out, t + i * 0.07, f, 0.05, 0.3));
  } else if (kind === 'win') {
    [660, 830, 990, 1320].forEach((f, i) => mode(out, t + i * 0.1, f, 0.06, 0.18));
  }
}
