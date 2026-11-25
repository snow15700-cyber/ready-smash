// 낚시 소리 (Web Audio 합성 — 녹음 파일 없음): 잔잔한 파도 · 톡 · 풍덩 · 뽁(가짜가 튀어 오름) · 릴 드르륵 · 줄 끼이익 · 물보라 · 끊어짐 · 잡음
import { TUNE } from './data.js';

let ac = null, out = null, noiseBuf = null, whine = null, sea = null;
export function initSound() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    out = ac.createGain(); out.gain.value = TUNE.sound ? 0.8 : 0; out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 줄이 팽팽할 때 '끼이익' (켜 두고 크기만 바꿈)
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 14;
    const g = ac.createGain(); g.gain.value = 0;
    o.connect(bp); bp.connect(g); g.connect(out); o.start();
    whine = { o, bp, g };
    // 잔잔한 파도: 낮은 소리 노이즈를 천천히 크게·작게
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const sg = ac.createGain(); sg.gain.value = 0.05;
    s.connect(lp); lp.connect(sg); sg.connect(out); s.start();
    sea = { g: sg, lp };
  } catch { ac = null; }
}
export function setSoundOn(on) { if (out) out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.05); }

function noise(dur, { type = 'bandpass', f = 2000, f2 = null, q = 1, gain = 0.3, at = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
}
function tone(f1, f2, dur, { type = 'sine', gain = 0.2, at = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f1, t);
  if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}

export const snd = {
  swing: () => noise(0.3, { f: 500, f2: 2800, q: 2, gain: 0.22 }),
  land: () => { tone(800, 220, 0.12, { gain: 0.14 }); noise(0.15, { type: 'lowpass', f: 1800, gain: 0.08 }); },
  tok: () => { tone(1300, 900, 0.05, { gain: 0.16 }); tone(700, 500, 0.04, { gain: 0.08, at: 0.01 }); },
  plunge: () => { tone(260, 60, 0.35, { gain: 0.45 }); noise(0.4, { type: 'lowpass', f: 1400, f2: 250, gain: 0.35 }); }, // 묵직한 '풍덩!'
  popUp: () => { tone(420, 1100, 0.09, { gain: 0.18 }); }, // 가짜 풍덩이 다시 튀어 오름 '뽁'
  shatter: () => { noise(0.16, { type: 'highpass', f: 3500, gain: 0.18 }); tone(1800, 1200, 0.08, { type: 'triangle', gain: 0.06 }); },
  patience: () => [880, 1320].forEach((f, i) => tone(f, f, 0.16, { type: 'triangle', gain: 0.1, at: i * 0.07 })), // ✨ 참기
  hook: (grade) => { tone(170, 55, 0.22, { type: 'triangle', gain: 0.55 }); noise(0.09, { f: 3000, q: 0.7, gain: 0.35 }); if (grade === 'Perfect') tone(1568, 1568, 0.2, { type: 'triangle', gain: 0.12, at: 0.05 }); },
  miss: () => { tone(330, 200, 0.25, { type: 'triangle', gain: 0.14 }); tone(220, 140, 0.35, { type: 'triangle', gain: 0.14, at: 0.16 }); },
  reel: () => noise(0.022, { f: 2400 + Math.random() * 400, q: 6, gain: 0.15 }),
  drag: () => noise(0.02, { f: 4300 + Math.random() * 500, q: 9, gain: 0.12 }),
  pump: (good) => { tone(good ? 240 : 180, 90, 0.18, { type: 'triangle', gain: 0.4 }); noise(0.12, { f: 1500, gain: 0.2 }); },
  splash: (k = 1) => noise(0.45, { type: 'lowpass', f: 2400, f2: 300, gain: 0.3 * k }),
  snap: () => { noise(0.12, { type: 'highpass', f: 3000, gain: 0.55 }); tone(1500, 180, 0.28, { type: 'square', gain: 0.1 }); },
  stamp: () => { tone(120, 60, 0.18, { type: 'triangle', gain: 0.5 }); noise(0.06, { type: 'lowpass', f: 900, gain: 0.3 }); },
  win: (legend) => (legend ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]).forEach((f, i) => tone(f, f, 0.26, { type: 'triangle', gain: 0.16, at: 0.25 + i * 0.09 })),
};

// 매 프레임: 줄 장력 소리 + 파도 숨쉬기
export function tickSound(t, tension) {
  if (!ac) return;
  const k = Math.max(0, (tension - 0.55) / 0.45);
  whine.g.gain.setTargetAtTime(k * k * 0.06, ac.currentTime, 0.03);
  whine.o.frequency.setTargetAtTime(220 + tension * 460, ac.currentTime, 0.05);
  whine.bp.frequency.setTargetAtTime(900 + tension * 1700, ac.currentTime, 0.05);
  sea.g.gain.setTargetAtTime(0.035 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.55)) * (0.6 + 0.4 * Math.sin(t * 0.21)), ac.currentTime, 0.3);
}
