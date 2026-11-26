// 리듬 줄다리기의 '반복 안 되게' 부분 (fishing.md 8장 — 사용자 요청 11/25: "길게 할 테니 반복되면 안 됨")
//  · 박자 패턴: 마디 조각을 그때그때 이어 붙임 — 같은 조각이 두 번 연속 안 나옴, 4마디(한 구절)마다 새로 뽑음
//  · 음악: 한 마리마다 조(키)·화음 진행·드럼 모양·빠르기(±4)를 새로 뽑고, 구절마다 드럼을 바꾸고 끝 박에 필인
//    전설은 3번째 구절부터 한 음 올라감(전조). 녹음 파일 없음 — 합성음(sound.js tone·noise)
//  · 달아오름(16장 C 1단계): 계속 맞출수록 악기가 한 겹씩 — 1 하이햇 촘촘 · 2 베이스 굵게(8분) · 3 반짝이 분산화음. 겹이 늘 때 심벌 '챙'
//  · 멜로디: 내가 맞춘 노트가 그 박자 화음의 음으로 울림 → 다 맞추면 한 소절 멜로디(매번 다름)
import { audioCtx, noise, tone } from './sound.js';

// 마디(4박) 조각: 박 위치. 등급이 오를수록 8분음표·엇박이 섞임
const BARS = {
  common: [[0, 1, 2, 3], [0, 1, 2], [0, 2, 3], [0, 1, 3], [0, 2], [1, 2, 3]],
  rare: [[0, 1, 1.5, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 2, 2.5, 3], [0, 1.5, 2, 3], [0, 1, 2, 3], [0, 2, 2.5, 3], [0, 1, 2]],
  legend: [[0, 0.5, 1.5, 2, 3], [0.5, 1, 1.5, 2.5, 3], [0, 0.5, 1, 2, 2.5, 3], [0, 1.5, 2.5, 3], [0, 1, 1.5, 2.5, 3, 3.5], [0, 1.5, 3, 3.5], [0, 0.5, 2, 3]],
};
const REST_BAR = [0]; // 숨 돌리는 마디 (구절 끝, 희귀·전설에서 가끔)

// 화음 진행 (근음 반음 거리, m = 단조 화음)
const PROGS = [
  [[0], [7], [9, 'm'], [5]], // I–V–vi–IV
  [[9, 'm'], [5], [0], [7]], // vi–IV–I–V
  [[0], [9, 'm'], [5], [7]], // I–vi–IV–V
  [[0], [5], [7], [5]], // I–IV–V–IV
  [[2, 'm'], [7], [0], [9, 'm']], // ii–V–I–vi
];
const KEYS = [55, 57, 58, 60, 62]; // G A B♭ C D (미디 번호)
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// avoidKey: 단계가 올라갈 때 앞 단계와 다른 조로 (바뀐 게 확 느껴지게)
export function makeSong(fish, rnd = Math.random, avoidKey = null) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    grade: fish.grade,
    bpm: fish.bpm + Math.round((rnd() - 0.5) * 8),
    key: pick(KEYS.filter((k) => k !== avoidKey)),
    prog: pick(PROGS),
    drum: Math.floor(rnd() * 3),
    lastBar: -1,
    mel: 2, // 멜로디가 지금 화음의 몇 번째 음에 있는지 (조금씩 오르내림)
  };
}

// 구절(4마디) 하나의 노트 박 위치들 (구절 첫 박 기준)
export function makePhrase(song, rnd = Math.random) {
  const lib = BARS[song.grade];
  const out = [];
  for (let b = 0; b < 4; b++) {
    let bar;
    if (b === 3 && song.grade !== 'common' && rnd() < 0.3) bar = REST_BAR;
    else { let i; do i = Math.floor(rnd() * lib.length); while (i === song.lastBar && lib.length > 1); song.lastBar = i; bar = lib[i]; }
    for (const x of bar) out.push(b * 4 + x);
  }
  return out;
}

// 박 하나의 음악 (when = 오디오 시각). beat = 첫 노트 구절 시작부터 센 박 번호(음수 = 들어가는 마디)
// heat = 달아오름 겹 수(0~3, session.js가 정함)
export function playBeat(song, beat, when, spb, heat = 0) {
  const ac = audioCtx(); if (!ac) return;
  const at = Math.max(0, when - ac.currentTime);
  const bar = Math.floor(beat / 4), inBar = ((beat % 4) + 4) % 4, phrase = Math.floor(bar / 4), inPhrase = ((bar % 4) + 4) % 4;
  const drum = (song.drum + Math.max(0, phrase)) % 3; // 구절마다 드럼 모양이 바뀜
  const lift = song.grade === 'legend' && phrase >= 2 ? 2 : 0; // 전설: 3번째 구절부터 한 음 올림
  const [root, q] = song.prog[((bar % 4) + 4) % 4];
  const base = song.key + root + lift;
  const fill = inPhrase === 3 && inBar === 3 && beat >= 0;
  // 드럼
  const kick = (a) => tone(150, 45, 0.18, { gain: 0.42, at: a });
  const snare = (a, g = 0.22) => { noise(0.12, { type: 'highpass', f: 1500, gain: g, at: a }); tone(210, 180, 0.05, { type: 'triangle', gain: 0.08, at: a }); };
  const hat = (a, g = 0.06) => noise(0.03, { type: 'highpass', f: 7000, gain: g, at: a });
  if (fill) { for (let i = 0; i < 4; i++) snare(at + i * spb / 4, 0.1 + i * 0.05); }
  else if (drum === 0) { if (inBar % 2 === 0) kick(at); else snare(at); hat(at); hat(at + spb / 2, 0.04); }
  else if (drum === 1) { if (inBar === 0 || inBar === 2) kick(at); if (inBar === 2) kick(at + spb / 2); if (inBar % 2 === 1) snare(at); hat(at + spb / 2); }
  else { kick(at); hat(at + spb / 2, 0.08); if (inBar % 2 === 1) snare(at, 0.16); if (song.grade === 'legend') { hat(at + spb / 4, 0.03); hat(at + spb * 3 / 4, 0.03); } }
  // 베이스 (근음, 마디 둘째 박은 5도)
  const bn = base - 24 + (inBar === 2 ? 7 : 0);
  tone(midi(bn), midi(bn), spb * 0.85, { type: 'triangle', gain: 0.16, at });
  // 화음 (마디 첫 박에 부드럽게)
  if (inBar === 0) for (const iv of [0, q ? 3 : 4, 7]) tone(midi(base + iv), midi(base + iv), spb * 3.6, { type: 'sine', gain: 0.025, at });
  // 달아오름(16장 C): 겹이 늘면 그 박에 심벌 '챙' (줄면 조용히 빠짐)
  if (heat > (song.heatL || 0) && beat >= 0) { noise(0.9, { type: 'highpass', f: 5000, gain: 0.12, at }); noise(0.25, { type: 'bandpass', f: 9000, q: 0.6, gain: 0.08, at }); }
  song.heatL = heat;
  if (heat >= 1 && !fill) { hat(at + spb / 4, 0.035); hat(at + spb * 3 / 4, 0.035); if (inBar % 2 === 1) noise(0.08, { type: 'bandpass', f: 1200, q: 0.8, gain: 0.12, at }); } // 하이햇 16분 + 박수
  if (heat >= 2) { tone(midi(bn), midi(bn), spb * 0.4, { type: 'sawtooth', gain: 0.05, at }); tone(midi(bn + 12), midi(bn + 12), spb * 0.35, { type: 'square', gain: 0.03, at: at + spb / 2 }); } // 베이스 굵게 + 8분 뒷박
  if (heat >= 3 && beat >= 0 && song.grade !== 'legend') for (let i = 0; i < 2; i++) { const iv = [0, q ? 3 : 4, 7, 12][(inBar * 2 + i) % 4]; tone(midi(base + 12 + iv), midi(base + 12 + iv), spb * 0.3, { type: 'triangle', gain: 0.03, at: at + i * spb / 2 }); }
  if (heat >= 3 && beat >= 0 && song.grade === 'legend') for (let i = 0; i < 4; i++) { const iv = [12, 7, q ? 3 : 4, 0][(inBar + i) % 4]; tone(midi(base + 24 + iv), midi(base + 24 + iv), spb * 0.15, { type: 'sine', gain: 0.025, at: at + i * spb / 4 }); } // 전설은 원래 반짝이가 있어서 더 높은 16분 반짝이
  // 전설: 반짝이는 분산화음
  if (song.grade === 'legend' && beat >= 0) for (let i = 0; i < 2; i++) { const iv = [0, q ? 3 : 4, 7, 12][(inBar * 2 + i) % 4]; tone(midi(base + 12 + iv), midi(base + 12 + iv), spb * 0.3, { type: 'triangle', gain: 0.03, at: at + i * spb / 2 }); }
}

// 내가 맞춘 노트의 음: 그 박자의 화음 음 중에서 조금씩 오르내림 → 매번 다른 멜로디. Perfect는 3도 위 화음을 더함
export function playMelody(song, beat, perfect, rnd = Math.random) {
  const bar = Math.floor(beat / 4), phrase = Math.floor(bar / 4);
  const lift = song.grade === 'legend' && phrase >= 2 ? 2 : 0;
  const [root, q] = song.prog[((bar % 4) + 4) % 4];
  const tones = [0, q ? 3 : 4, 7, 12, 12 + (q ? 3 : 4), 19];
  song.mel = Math.max(0, Math.min(tones.length - 1, song.mel + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.75 ? 1 : 2)));
  const n = song.key + 12 + root + lift + tones[song.mel];
  tone(midi(n), midi(n), 0.35, { type: 'triangle', gain: 0.2 });
  tone(midi(n + 12), midi(n + 12), 0.12, { type: 'sine', gain: 0.05 });
  if (perfect) { const n2 = song.key + 12 + root + lift + tones[Math.min(tones.length - 1, song.mel + 1)]; tone(midi(n2), midi(n2), 0.35, { type: 'triangle', gain: 0.12 }); }
}
// 마지막 큰 노트를 맞췄을 때: 화음 쾅 + 높은 음
export function playFinish(song) {
  const [root, q] = song.prog[0];
  for (const iv of [0, q ? 3 : 4, 7, 12, 16]) tone(midi(song.key + 12 + root + iv), midi(song.key + 12 + root + iv), 0.9, { type: 'triangle', gain: 0.1 });
  tone(150, 40, 0.4, { gain: 0.5 });
}
