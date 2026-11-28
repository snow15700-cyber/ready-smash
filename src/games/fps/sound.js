// FPS 소리 (Web Audio 합성 — 녹음 파일 없음). 시안에서 고르는 것: 총소리 A·B, 맞힘 소리
let ac = null, out = null, noiseBuf = null;
export function initSound() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ac.destination);
    out = ac.createGain(); out.gain.value = 0.7; out.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setVolume(v) { if (out) out.gain.value = v; }

function env(g, at, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
}
function noise(dur, { type = 'bandpass', f = 2000, f2 = null, q = 1, gain = 0.3, a = 0.002, delay = 0 } = {}) {
  if (!ac) return;
  const at = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, at); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, at + dur);
  const g = ac.createGain(); env(g, at, a, gain, dur);
  s.connect(fl); fl.connect(g); g.connect(out); s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.02);
}
function tone(f, dur, { type = 'sine', f2 = null, gain = 0.3, a = 0.002, delay = 0 } = {}) {
  if (!ac) return;
  const at = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
  const g = ac.createGain(); env(g, at, a, gain, dur);
  o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02);
}

// 총소리 — A: '퉁' 묵직한 블래스터 / B: '퓽' 가벼운 레이저
export function shot(kind = 'A') {
  if (kind === 'A') {
    noise(0.09, { type: 'lowpass', f: 5200, f2: 700, gain: 0.55 });
    tone(165, 0.16, { f2: 48, gain: 0.7 });
    noise(0.22, { type: 'bandpass', f: 900, f2: 300, q: 0.7, gain: 0.12, delay: 0.02 }); // 꼬리 울림
  } else {
    tone(1500, 0.13, { type: 'square', f2: 220, gain: 0.16 });
    tone(760, 0.1, { type: 'sawtooth', f2: 140, gain: 0.12 });
    noise(0.05, { type: 'highpass', f: 3000, gain: 0.18 });
  }
}
// 몸 맞힘 '틱!' — 짧고 높은 딸깍
export function hitBody() {
  tone(2300, 0.045, { type: 'triangle', gain: 0.38 });
  noise(0.03, { type: 'highpass', f: 5000, gain: 0.15 });
}
// 머리 맞힘 — 더 쨍한 '팅!' (금속 울림 두 음)
export function hitHead() {
  tone(3150, 0.22, { type: 'sine', gain: 0.32 });
  tone(4720, 0.16, { type: 'sine', gain: 0.18 });
  tone(1580, 0.08, { type: 'triangle', gain: 0.3 });
  noise(0.04, { type: 'highpass', f: 6000, gain: 0.2 });
}
// 쓰러뜨림 — 묵직한 '쿵' + 올라가는 띠링 (연속일수록 한 음씩 높게)
export function kill(streak = 1) {
  tone(110, 0.25, { f2: 40, gain: 0.55 });
  const base = 660 * Math.pow(2, Math.min(streak - 1, 5) / 12 * 2);
  [0, 4, 7].forEach((st, i) => tone(base * Math.pow(2, st / 12), 0.18, { type: 'triangle', gain: 0.17, delay: 0.05 + i * 0.05 }));
}
export function shieldTink() { tone(1200, 0.08, { type: 'square', gain: 0.06 }); }
export function wallHit() { noise(0.05, { type: 'bandpass', f: 1800, q: 2, gain: 0.12 }); }
export function dash() { noise(0.22, { type: 'bandpass', f: 600, f2: 2600, q: 0.8, gain: 0.35, a: 0.02 }); }
export function jump() { noise(0.08, { type: 'lowpass', f: 900, gain: 0.12 }); }
export function land(k = 1) { noise(0.07, { type: 'lowpass', f: 400, gain: 0.25 * k }); tone(90, 0.08, { f2: 50, gain: 0.25 * k }); }
export function pad() { tone(220, 0.35, { f2: 880, gain: 0.3 }); tone(330, 0.3, { type: 'triangle', f2: 1320, gain: 0.12 }); }
export function step() { noise(0.035, { type: 'lowpass', f: 700, gain: 0.07 }); }
export function dashReady() { tone(1760, 0.06, { type: 'triangle', gain: 0.07 }); }
