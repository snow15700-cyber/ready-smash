// Web Audio API로 탁구 소리를 실시간 합성 (녹음 파일 없이)
let ctx = null;
let master, dryBus, revSend, noiseBuf;
let listener = { pos: [0, 1.7, 3.6], right: [1, 0, 0] };

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
  return { pan, gain, cutoff };
}

// 한 소리를 만들 출력 체인
function chain(when, pos, wet = 1) {
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

// 라켓 타구음. grade: perfect | good | bad | block | wall
export function playHit(grade, pos, when) {
  if (!ctx) return;
  const t = at(when);
  const p = jitter(0.04);
  const v = jitter(0.04);
  const out = chain(t, pos, 0.9);
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
  } else if (grade === 'wall') {
    // 연습용 나무판
    mode(out, t, 640 * p, 0.45 * v, 0.022);
    mode(out, t, 1480 * p, 0.25 * v, 0.012);
    mode(out, t, 3100 * p, 0.08 * v, 0.005);
    mode(out, t, 170 * p, 0.35 * v, 0.025);
    tick(out, t, 1800 * p, 1, 0.3 * v, 0.005);
  }
}

// 테이블 바운드음: 빠를수록 크고 밝게
export function playTable(speed, pos, when) {
  if (!ctx) return;
  const t = at(when);
  const s = Math.max(0, Math.min(1, (speed - 1.5) / 5));
  const p = jitter(0.03);
  const amp = (0.35 + 0.65 * s) * jitter(0.04);
  const out = chain(t, pos, 1);
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

// 체육관 나무 바닥에 통통
export function playFloor(speed, pos, when) {
  if (!ctx) return;
  const t = at(when);
  const s = Math.max(0, Math.min(1, speed / 5));
  const p = jitter(0.04);
  const amp = (0.1 + 0.75 * s) * jitter(0.05);
  const out = chain(t, pos, 1.3);
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
  } else if (kind === 'win') {
    [660, 830, 990, 1320].forEach((f, i) => mode(out, t + i * 0.1, f, 0.06, 0.18));
  }
}
