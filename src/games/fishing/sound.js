// 낚시 소리 (Web Audio 합성 — 녹음 파일 없음): 잔잔한 파도 · 톡 · 풍덩 · 뽁(가짜가 튀어 오름) · 물보라 · 끊어짐 · 잡음
import { TUNE } from './data.js';

let ac = null, out = null, noiseBuf = null, sea = null;
export function initSound() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    out = ac.createGain(); out.gain.value = TUNE.sound ? 0.8 : 0; out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 잔잔한 파도: 낮은 소리 노이즈를 천천히 크게·작게
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const sg = ac.createGain(); sg.gain.value = 0.05;
    s.connect(lp); lp.connect(sg); sg.connect(out); s.start();
    sea = { g: sg, lp };
  } catch { ac = null; }
}
// 낚시를 그만두면 파도 소리를 줄여서 끔 (안 그러면 광장에서도 파도 소리가 계속 남 — 다시 낚시하면 tickSound가 되살림)
export function quietSound() {
  if (!ac) return;
  sea.g.gain.setTargetAtTime(0, ac.currentTime, 0.4);
}
export function setSoundOn(on) { if (out) out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.05); }

export const audioCtx = () => ac;
export function noise(dur, { type = 'bandpass', f = 2000, f2 = null, q = 1, gain = 0.3, at = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
}
export function tone(f1, f2, dur, { type = 'sine', gain = 0.2, at = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f1, t);
  if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}

// 소리가 귀에 닿기까지 늦는 시간(초): 브라우저가 알려 주는 값(블루투스 이어폰이면 0.1~0.3초) + ⚙️에서 더한 값.
// 리듬 음악을 이만큼 먼저 틀어서, 들리는 박자 = 원이 닿는 순간 = 판정 순간이 되게 (fishing.md 8장 'A 판정 느낌')
export function autoLag() { if (!ac) return 0; return Math.min(0.4, Math.max(0, (ac.outputLatency || 0) + (ac.baseLatency || 0))); }
export function audioLag() { return Math.min(0.5, Math.max(0, autoLag() + (TUNE.lag || 0))); }
export const snd = {
  tap: () => { noise(0.025, { f: 1800, q: 4, gain: 0.07 }); }, // 노트가 없을 때 눌러도 '톡' (누른 게 느껴지게, 아주 작게)
  charge: (k) => { const f = 330 * 2 ** (k * 1.25); tone(f, f * 1.02, 0.1, { type: 'triangle', gain: 0.07 }); }, // 기 모으기: 박마다 한 음씩 올라감 (17장)
  chargeFull: () => { tone(880, 1320, 0.16, { type: 'triangle', gain: 0.12 }); noise(0.2, { type: 'highpass', f: 4000, gain: 0.08 }); }, // 끝까지 모음 '최대!'
  swing: () => noise(0.3, { f: 500, f2: 2800, q: 2, gain: 0.22 }),
  land: () => { tone(800, 220, 0.12, { gain: 0.14 }); noise(0.15, { type: 'lowpass', f: 1800, gain: 0.08 }); },
  tok: () => { tone(1300, 900, 0.05, { gain: 0.16 }); tone(700, 500, 0.04, { gain: 0.08, at: 0.01 }); },
  wiggle: () => { tone(900, 700, 0.04, { gain: 0.08 }); }, // 가짜 풍덩의 약한 떨림 하나
  alert: () => { tone(260, 60, 0.35, { gain: 0.45 }); noise(0.4, { type: 'lowpass', f: 1400, f2: 250, gain: 0.35 }); tone(1320, 1760, 0.12, { type: 'square', gain: 0.05, at: 0.02 }); }, // 진짜: 쑥 + '!'
  noteMiss: () => { for (let i = 0; i < 7; i++) noise(0.02, { f: 4300, q: 9, gain: 0.1, at: i * 0.025 }); tone(300, 200, 0.15, { type: 'triangle', gain: 0.08 }); },
  hook: (grade) => { tone(170, 55, 0.22, { type: 'triangle', gain: 0.55 }); noise(0.09, { f: 3000, q: 0.7, gain: 0.35 }); if (grade === 'Perfect') tone(1568, 1568, 0.2, { type: 'triangle', gain: 0.12, at: 0.05 }); },
  miss: () => { tone(330, 200, 0.25, { type: 'triangle', gain: 0.14 }); tone(220, 140, 0.35, { type: 'triangle', gain: 0.14, at: 0.16 }); },
  runLine: () => { for (let i = 0; i < 26; i++) noise(0.025, { f: 3600 + i * 40, q: 9, gain: 0.13, at: i * 0.028 }); tone(200, 90, 0.5, { type: 'triangle', gain: 0.3 }); }, // 단계가 올라갈 때 줄이 확 풀림 '지이이익'
  splash: (k = 1) => noise(0.45, { type: 'lowpass', f: 2400, f2: 300, gain: 0.3 * k }),
  stamp: () => { tone(120, 60, 0.18, { type: 'triangle', gain: 0.5 }); noise(0.06, { type: 'lowpass', f: 900, gain: 0.3 }); },
  win: (legend) => (legend ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]).forEach((f, i) => tone(f, f, 0.26, { type: 'triangle', gain: 0.16, at: 0.25 + i * 0.09 })),
};

// 매 프레임: 파도 숨쉬기
export function tickSound(t) {
  if (!ac) return;
  sea.g.gain.setTargetAtTime(0.035 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.55)) * (0.6 + 0.4 * Math.sin(t * 0.21)), ac.currentTime, 0.3);
}
