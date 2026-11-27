// 리듬 줄다리기의 '반복 안 되게' 부분 (fishing.md 8장 — 사용자 요청 11/25: "길게 할 테니 반복되면 안 됨")
//  · 박자 패턴: 마디 조각을 그때그때 이어 붙임 — 같은 조각이 두 번 연속 안 나옴, 4마디(한 구절)마다 새로 뽑음
//  · 음악: 한 마리마다 조(키)·화음 진행·드럼 모양·빠르기(±4)를 새로 뽑고, 구절마다 드럼을 바꾸고 끝 박에 필인
//    전설은 3번째 구절부터 한 음 올라감(전조). 녹음 파일 없음 — 합성음(sound.js tone·noise)
//  · 달아오름(16장 C 1단계): 계속 맞출수록 악기가 한 겹씩 — 1 하이햇 촘촘 · 2 베이스 굵게(8분) · 3 반짝이 분산화음. 겹이 늘 때 심벌 '챙'
//  · 멜로디: 내가 맞춘 노트가 그 박자 화음의 음으로 울림 → 다 맞추면 한 소절 멜로디(매번 다름)
//  · 장르(13-3 ⑤, 시안 1단계): song.genre = 'jazz'·'rock'·'ballad'면 노트 조각·화음·악기가 그 장르로 (없으면 지금 음악 그대로)
//    재즈 = 노트 규칙 그대로 + 쉼 많음 · 세븐스 화음·걷는 베이스·브러시 드럼 / 록 = 반박 연타 많음 · 파워코드·굵은 킥
//    발라드 = 긴 노트([박, 길이] — 시작 원에 누르고 끝 원에서 떼기) · 패드·피아노
import { audioCtx, noise, tone } from './sound.js';

// 마디(4박) 조각: 박 위치. 등급이 오를수록 8분음표(반박)가 섞임
const BARS = {
  common: [[0, 1, 2, 3], [0, 1, 2], [0, 2, 3], [0, 1, 3], [0, 2], [1, 2, 3]],
  // 17장(11/27 사용자 확정): 엇박 없이 '반박'만 — 반박(x.5) 노트는 늘 바로 앞 정박 노트에 붙음(쿵-딱)
  rare: [[0, 1, 1.5, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 2, 2.5, 3], [0, 1, 1.5, 3], [0, 1, 2, 3], [0, 2, 2.5, 3], [0, 1, 2]],
  legend: [[0, 0.5, 1, 1.5, 3], [0, 1, 1.5, 2, 2.5, 3], [0, 0.5, 1, 2, 2.5, 3], [0, 1, 1.5, 2, 3], [0, 1, 1.5, 2, 3, 3.5], [0, 1, 1.5, 3, 3.5], [0, 0.5, 2, 3]],
};
const REST_BAR = [0]; // 숨 돌리는 마디 (구절 끝, 희귀·전설에서 가끔)

// 장르별 조각 (13-3). 반박(x.5)은 늘 바로 앞 정박 노트에 붙음(17장 규칙 그대로). [박, 길이] = 발라드 긴 노트(길이 = 박 수)
//  긴 노트 끝 다음 노트는 1박 넘게 띄움 (떼고 다시 누를 틈)
const GENRE_BARS = {
  jazz: { // 띄엄띄엄 — 쉼이 많음
    common: [[0, 2], [0, 3], [0, 2, 3], [1, 3], [0, 1, 3], [0, 2]],
    rare: [[0, 2, 2.5], [0, 0.5, 3], [1, 3, 3.5], [0, 2, 3], [0, 1, 1.5], [0, 3, 3.5]],
    legend: [[0, 0.5, 2, 2.5], [0, 1, 1.5, 3, 3.5], [0, 0.5, 1, 3], [1, 1.5, 2, 3, 3.5], [0, 2, 2.5, 3]],
  },
  rock: { // 반박 연타가 많음
    common: [[0, 1, 2, 3], [0, 1, 2, 2.5], [0, 0.5, 1, 2], [0, 2, 3, 3.5], [0, 1, 1.5, 2, 3]],
    rare: [[0, 0.5, 1, 1.5, 2, 3], [0, 1, 1.5, 2, 2.5, 3], [0, 0.5, 2, 2.5, 3], [0, 0.5, 1, 2, 3, 3.5], [0, 1, 2, 2.5, 3, 3.5]],
    legend: [[0, 0.5, 1, 1.5, 2, 2.5, 3], [0, 0.5, 1, 1.5, 2, 3, 3.5], [0, 1, 1.5, 2, 2.5, 3, 3.5], [0, 0.5, 2, 2.5, 3, 3.5], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]],
  },
  ballad: { // 긴 노트 + 가끔 톡
    common: [[[0, 2], 3], [[0, 3]], [0, [1, 2]], [0, 2], [[0, 1], 2, 3], [0, 1, 2]],
    rare: [[[0, 2], 3, 3.5], [0, 0.5, [1, 2]], [[0, 1], 2, 3], [0, 1, 1.5, [2, 1]], [[0, 3]], [0, [1, 2]]],
    legend: [[0, 0.5, [1, 2]], [[0, 2], 3, 3.5], [0, 0.5, 1, [2, 1]], [[0, 1], 2, 2.5, 3], [0, 1, 1.5, 2, 3], [[0, 2], 3]],
  },
};
// 장르별 화음 진행: [근음, 종류] — 재즈는 세븐스(M7 메이저7 · m7 마이너7 · 7 도미넌트)
const GENRE_PROGS = {
  jazz: [[[2, 'm7'], [7, '7'], [0, 'M7'], [0, 'M7']], [[0, 'M7'], [9, 'm7'], [2, 'm7'], [7, '7']], [[4, 'm7'], [9, '7'], [2, 'm7'], [7, '7']], [[5, 'M7'], [4, 'm7'], [2, 'm7'], [7, '7']]],
  rock: [[[0], [10], [5], [0]], [[0], [5], [7], [5]], [[9, 'm'], [5], [0], [7]], [[0], [3], [5], [7]]],
  ballad: [[[0], [7], [9, 'm'], [5]], [[0], [4, 'm'], [5], [7]], [[5], [7], [4, 'm'], [9, 'm']], [[0], [9, 'm'], [5], [7]]],
};
const GENRE_KEYS = { jazz: [51, 53, 55, 58, 60], rock: [50, 52, 55, 57], ballad: [58, 60, 62, 65] };
const CHORD = { M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], m: [0, 3, 7], '': [0, 4, 7] };
const chordOf = (q) => CHORD[q || ''] || CHORD[''];

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
  const gn = GENRE_BARS[fish.genre] ? fish.genre : null;
  return {
    grade: fish.grade,
    genre: gn,
    bpm: fish.bpm + Math.round((rnd() - 0.5) * 8),
    key: pick((gn ? GENRE_KEYS[gn] : KEYS).filter((k) => k !== avoidKey)),
    prog: pick(gn ? GENRE_PROGS[gn] : PROGS),
    drum: Math.floor(rnd() * 3),
    lastBar: -1,
    mel: 2, // 멜로디가 지금 화음의 몇 번째 음에 있는지 (조금씩 오르내림)
  };
}

// 구절(4마디) 하나의 노트 박 위치들 (구절 첫 박 기준)
// 돌려주는 것: [{ b: 박, len: 긴 노트 길이(박, 없으면 0) }]
export function makePhrase(song, rnd = Math.random) {
  const lib = song.genre ? GENRE_BARS[song.genre][song.grade] : BARS[song.grade];
  const rest = song.genre === 'jazz' ? 0.45 : song.grade !== 'common' ? 0.3 : 0; // 재즈는 쉼이 많음(일반에서도)
  const out = [];
  for (let b = 0; b < 4; b++) {
    let bar;
    if (b === 3 && rest && rnd() < rest) bar = REST_BAR;
    else { let i; do i = Math.floor(rnd() * lib.length); while (i === song.lastBar && lib.length > 1); song.lastBar = i; bar = lib[i]; }
    for (const x of bar) out.push(Array.isArray(x) ? { b: b * 4 + x[0], len: x[1] } : { b: b * 4 + x, len: 0 });
  }
  return out;
}

// 박 하나의 음악 (when = 오디오 시각). beat = 첫 노트 구절 시작부터 센 박 번호(음수 = 들어가는 마디)
// heat = 달아오름 겹 수(0~3, session.js가 정함) · light = 던지기·입질 기다리는 동안(17장): 드럼·베이스만 가볍게
export function playBeat(song, beat, when, spb, heat = 0, light = false) {
  const ac = audioCtx(); if (!ac) return;
  const at = Math.max(0, when - ac.currentTime);
  if (song.genre) return GENRE_PLAY[song.genre](song, beat, at, spb, heat, light);
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
  if (fill && !light) { for (let i = 0; i < 4; i++) snare(at + i * spb / 4, 0.1 + i * 0.05); }
  else if (drum === 0 || light) { if (inBar % 2 === 0) kick(at); else snare(at); hat(at); hat(at + spb / 2, 0.04); }
  else if (drum === 1) { if (inBar === 0 || inBar === 2) kick(at); if (inBar === 2) kick(at + spb / 2); if (inBar % 2 === 1) snare(at); hat(at + spb / 2); }
  else { kick(at); hat(at + spb / 2, 0.08); if (inBar % 2 === 1) snare(at, 0.16); if (song.grade === 'legend') { hat(at + spb / 4, 0.03); hat(at + spb * 3 / 4, 0.03); } }
  // 베이스 (근음, 마디 둘째 박은 5도)
  const bn = base - 24 + (inBar === 2 ? 7 : 0);
  tone(midi(bn), midi(bn), spb * 0.85, { type: 'triangle', gain: light ? 0.12 : 0.16, at });
  if (light) return;
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
export function playMelody(song, beat, perfect, rnd = Math.random, hold = 0) {
  if (song.genre) return genreMelody(song, beat, perfect, rnd, hold);
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
  if (song.genre) {
    const [root, q] = song.prog[0], iv = chordOf(q);
    for (const x of [...iv, 12, 12 + iv[1]]) tone(midi(song.key + 12 + root + x), midi(song.key + 12 + root + x), song.genre === 'ballad' ? 1.6 : 0.9, { type: 'triangle', gain: 0.09 });
    tone(150, 40, 0.4, { gain: song.genre === 'rock' ? 0.6 : 0.45 });
    if (song.genre === 'rock') noise(1.4, { type: 'highpass', f: 4000, gain: 0.16 });
    return;
  }
  const [root, q] = song.prog[0];
  for (const iv of [0, q ? 3 : 4, 7, 12, 16]) tone(midi(song.key + 12 + root + iv), midi(song.key + 12 + root + iv), 0.9, { type: 'triangle', gain: 0.1 });
  tone(150, 40, 0.4, { gain: 0.5 });
}

// ── 장르 음악 (13-3 ⑤) ──────────────────────────────────────────
// at = 지금부터 몇 초 뒤 · 화음은 그 마디의 [근음, 종류]. 전설은 3번째 구절부터 한 음 올림(지금 음악과 같게)
function chordAt(song, beat) {
  const bar = Math.floor(beat / 4), phrase = Math.floor(bar / 4);
  const lift = song.grade === 'legend' && phrase >= 2 ? 2 : 0;
  const [root, q] = song.prog[((bar % 4) + 4) % 4];
  return { base: song.key + root + lift, iv: chordOf(q), bar, phrase, inBar: ((beat % 4) + 4) % 4, inPhrase: ((bar % 4) + 4) % 4 };
}
const nt = (n, dur, o) => tone(midi(n), midi(n), dur, o);
function cymbal(at, g) { noise(0.9, { type: 'highpass', f: 5000, gain: g, at }); noise(0.25, { type: 'bandpass', f: 9000, q: 0.6, gain: g * 0.7, at }); }
// 겹이 늘면 '챙' (지금 음악과 같음)
function heatUp(song, beat, heat, at) { if (heat > (song.heatL || 0) && beat >= 0) cymbal(at, 0.12); song.heatL = heat; }

const GENRE_PLAY = {
  // 🎷 재즈: 브러시 쓱쓱 · 라이드 '칭 칭-가' · 걷는 베이스(박마다 한 음, 다음 화음으로 반음 다가감) · 세븐스 화음 콤핑
  jazz(song, beat, at, spb, heat, light) {
    const { base, iv, bar, inBar, inPhrase } = chordAt(song, beat);
    const brush = (a, g) => noise(spb * 0.8, { type: 'bandpass', f: 2600, q: 0.5, gain: g, at: a });
    const ride = (a, g) => noise(0.28, { type: 'highpass', f: 6500, gain: g, at: a });
    brush(at, 0.035);
    if (inBar % 2 === 1) { noise(0.16, { type: 'bandpass', f: 3200, q: 0.7, gain: 0.09, at }); noise(0.03, { type: 'highpass', f: 5000, gain: 0.05, at }); } // 2·4박 브러시 스네어 + 하이햇 발
    ride(at, 0.06); if (inBar % 2 === 1 || heat >= 1) ride(at + spb / 2, 0.04);
    tone(110, 50, 0.12, { gain: 0.1, at }); // 살짝 밟는 킥
    if (inPhrase === 3 && inBar === 3 && beat >= 0 && !light) for (let i = 0; i < 3; i++) noise(0.12, { type: 'bandpass', f: 2200 + i * 500, q: 0.8, gain: 0.08 + i * 0.03, at: at + i * spb / 3 }); // 필인
    // 걷는 베이스
    const next = chordAt(song, beat + 4 - inBar);
    const bn = inBar === 0 ? base : inBar === 1 ? base + iv[1] : inBar === 2 ? base + 7 : next.base + ((bar & 1) ? 1 : -1);
    nt(bn - 24, spb * 0.9, { type: 'triangle', gain: light ? 0.15 : 0.19, at });
    if (heat >= 2) nt(bn - 12, spb * 0.5, { type: 'sine', gain: 0.06, at });
    if (light) return;
    // 콤핑: 마디 첫 박 부드럽게 + 마디마다 다른 자리에 짧게 '찹'
    if (inBar === 0) for (const x of iv.slice(1)) nt(base + x, spb * 1.6, { type: 'sine', gain: 0.022, at });
    const stab = [1.5, 2.5, 3.5, 1][(bar + song.drum) & 3];
    if (Math.floor(stab) === inBar) for (const x of iv.slice(1)) nt(base + x, spb * 0.25, { type: 'triangle', gain: 0.03, at: at + (stab - inBar) * spb });
    heatUp(song, beat, heat, at);
    if (heat >= 3 && beat >= 0) for (let i = 0; i < 2; i++) { const x = [...iv, 14][(inBar * 2 + i) % 5]; nt(base + 24 + x, spb * 0.6, { type: 'sine', gain: 0.03, at: at + i * spb / 2 }); } // 비브라폰
  },
  // 🎸 록: 쿵-짝 + 8분 하이햇 · 파워코드 8분 '두두두두' · 구절 시작에 크래시
  rock(song, beat, at, spb, heat, light) {
    const { base, inBar, inPhrase } = chordAt(song, beat);
    const kick = (a) => { tone(160, 40, 0.2, { gain: 0.55, at: a }); noise(0.02, { type: 'lowpass', f: 2000, gain: 0.12, at: a }); };
    const snare = (a, g = 0.3) => { noise(0.16, { type: 'highpass', f: 1300, gain: g, at: a }); tone(230, 170, 0.07, { type: 'triangle', gain: 0.12, at: a }); };
    const hat = (a, g = 0.06) => noise(0.03, { type: 'highpass', f: 7500, gain: g, at: a });
    const fill = inPhrase === 3 && inBar === 3 && beat >= 0 && !light;
    if (fill) for (let i = 0; i < 4; i++) { snare(at + i * spb / 4, 0.12 + i * 0.05); tone(220 - i * 30, 90, 0.12, { type: 'triangle', gain: 0.15, at: at + i * spb / 4 }); }
    else {
      if (inBar === 0 || inBar === 2) kick(at);
      if (inBar === 2 || (inBar === 0 && heat >= 2)) kick(at + spb / 2);
      if (inBar % 2 === 1) snare(at);
      hat(at); hat(at + spb / 2, 0.045);
      if (heat >= 1) { hat(at + spb / 4, 0.03); hat(at + spb * 3 / 4, 0.03); }
    }
    if (inPhrase === 0 && inBar === 0 && beat >= 0 && !light) cymbal(at, 0.13);
    // 베이스: 근음 8분
    for (let i = 0; i < 2; i++) nt(base - 24, spb * 0.45, { type: 'sawtooth', gain: light ? 0.06 : 0.08, at: at + i * spb / 2 });
    if (light) return;
    // 파워코드 (근음·5도·옥타브): 마디 첫 박은 길게 '쾅', 나머지는 8분 끊어서
    const pc = [0, 7, 12];
    if (inBar === 0) for (const x of pc) nt(base - 12 + x, spb * 0.95, { type: 'sawtooth', gain: 0.04, at });
    else for (let i = 0; i < 2; i++) for (const x of pc) nt(base - 12 + x, spb * 0.3, { type: 'square', gain: 0.022, at: at + i * spb / 2 });
    heatUp(song, beat, heat, at);
    if (heat >= 2 && inBar === 0 && beat >= 0) cymbal(at, 0.08);
    if (heat >= 3 && beat >= 0) for (let i = 0; i < 2; i++) { const x = [0, 7, 12, 15][(inBar * 2 + i) % 4]; nt(base + 12 + x, spb * 0.35, { type: 'square', gain: 0.025, at: at + i * spb / 2 }); } // 리드 기타 아르페지오
  },
  // 🎻 발라드: 천천히 차오르는 패드 · 피아노 분산화음 · 반으로 느린 드럼(쿵 … 탁)
  ballad(song, beat, at, spb, heat, light) {
    const { base, iv, inBar, inPhrase } = chordAt(song, beat);
    const tri = [...iv.slice(0, 3), 12];
    if (inBar === 0) tone(120, 45, 0.25, { gain: 0.32, at });
    if (inBar === 2) { noise(0.1, { type: 'bandpass', f: 1800, q: 1.2, gain: 0.1, at }); tone(400, 380, 0.04, { type: 'triangle', gain: 0.05, at }); } // 림샷 '탁'
    noise(0.04, { type: 'highpass', f: 8000, gain: 0.035, at }); // 하이햇 살짝
    if (heat >= 1) { noise(0.04, { type: 'highpass', f: 8000, gain: 0.03, at: at + spb / 2 }); noise(0.08, { type: 'bandpass', f: 6000, q: 0.6, gain: 0.025, at: at + spb / 4 }); } // 셰이커
    if (inPhrase === 3 && inBar === 3 && beat >= 0 && !light) cymbal(at + spb / 2, 0.06); // 구절 끝 살짝 '쉬익'
    // 베이스: 마디 첫 박 길게, 셋째 박 5도
    if (inBar === 0) nt(base - 24, spb * 2, { type: 'sine', gain: 0.2, at });
    if (inBar === 2) nt(base - 24 + 7, spb * 1.8, { type: 'sine', gain: 0.14, at });
    // 패드: 천천히 커짐
    if (inBar === 0) for (const x of tri) nt(base + x, spb * 4.1, { type: 'sine', gain: light ? 0.018 : 0.026, at, attack: spb * 1.2 });
    if (light) return;
    // 피아노 분산화음 (8분, 소리가 남아 겹침)
    const arp = [0, 7, 12, 12 + iv[1], 19, 12 + iv[1], 12, 7];
    for (let i = 0; i < 2; i++) nt(base + arp[(inBar * 2 + i) % 8], spb * 1.6, { type: 'triangle', gain: 0.045, at: at + i * spb / 2 });
    heatUp(song, beat, heat, at);
    if (heat >= 2 && inBar === 0) for (const x of tri) nt(base + 12 + x, spb * 4, { type: 'triangle', gain: 0.012, at, attack: spb * 1.5 }); // 현악처럼 한 옥타브 위 패드
    if (heat >= 3 && beat >= 0) for (let i = 0; i < 2; i++) { const x = [12, 19, 24, 12 + iv[1]][(inBar * 2 + i) % 4]; nt(base + 12 + x, spb * 0.9, { type: 'sine', gain: 0.025, at: at + i * spb / 2 }); } // 종소리
  },
};

// 장르 멜로디: 그 박자 화음 음에서 조금씩 오르내림. hold = 발라드 긴 노트 길이(초) — 누르는 동안 음이 이어짐
function genreMelody(song, beat, perfect, rnd, hold) {
  const { base, iv } = chordAt(song, beat);
  const tones = [...iv, 12, 12 + iv[1], 19];
  song.mel = Math.max(0, Math.min(tones.length - 1, song.mel + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.75 ? 1 : 2)));
  const n = base + 12 + tones[song.mel], n2 = base + 12 + tones[Math.min(tones.length - 1, song.mel + 1)];
  if (song.genre === 'jazz') { // 비브라폰처럼
    nt(n, 0.6, { type: 'sine', gain: 0.22 }); nt(n + 12, 0.2, { type: 'sine', gain: 0.05 });
    if (perfect) nt(n2, 0.5, { type: 'sine', gain: 0.12 });
  } else if (song.genre === 'rock') { // 리드 기타처럼 거칠게
    nt(n, 0.3, { type: 'square', gain: 0.07 }); nt(n, 0.3, { type: 'sawtooth', gain: 0.05 });
    if (perfect) nt(n + 7, 0.3, { type: 'square', gain: 0.04 });
  } else { // 발라드: 피아노 + 긴 노트면 현악처럼 이어짐
    nt(n, 0.9, { type: 'triangle', gain: 0.18 }); nt(n + 12, 0.3, { type: 'sine', gain: 0.04 });
    if (hold > 0) nt(n, hold, { type: 'sine', gain: 0.07, attack: Math.min(0.3, hold * 0.3) });
    if (perfect) nt(n2, 0.9, { type: 'triangle', gain: 0.1 });
  }
}
// 긴 노트를 끝 원에서 잘 뗐을 때: 화음 위 높은 음 하나 '띵'
export function playRelease(song, beat, perfect) {
  const { base, iv } = chordAt(song, beat);
  const n = base + 24 + (perfect ? 7 : iv[1]);
  nt(n, 0.7, { type: 'sine', gain: perfect ? 0.12 : 0.08 });
}
