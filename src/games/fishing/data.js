// 낚시 손맛 시안 (리듬 방식, docs/dev/fishing.md 8장): 물고기 3종 · 박자 패턴 · 입질 순서 · 기포 확률 · 시험 설정
// 서버 없음 — 어떤 물고기·몇 cm인지는 이 브라우저가 정한다(게임에 넣을 때는 서버가 정함, 5장).

export const TUNE = {
  perfect: 0.3, good: 0.5, // 챔질: '!' 뒤 반응 속도(초)
  noteP: 0.06, noteG: 0.13, // 리듬 노트 판정 폭(± 초)
  fake: 1, // 가짜 비율: 0 적게 · 1 보통 · 2 많이
  bubbles: 'often', // 기포: 'normal' = 약 2분에 1~2곳·30초(기획) · 'often' = 시험용(약 50초마다)
  fish: 'random', // 'random' | 물고기 id | 'junk' | 'paddle'
  size: 'random', // 크기 시험: 'random' | 고정 크기 점수(50 = 보통 1배 · '95' 월척 · '125' 대물 · '180' 괴물 · '300', cm는 물고기 보통 크기 × 점수 ÷ 50)
  cond: 'auto', // 조건 물고기 시험: 'auto'(실제 쉬는 시간·밤) | 'break' | 'night' | 'rain'
  sound: true,
  lag: 0, // 소리 늦음 보정에 더할 값(초, 자동 측정값 위에 더함, + = 소리를 더 일찍). 🎵 박자 맞추기 창(syncCal.js)에서 본인이 맞추고 이 기기에 저장(sound.js setLag)
  bSea: 1, bPier: 1, bBody: 1, // 주변 박자 연출(바다 물결·선착장·캐릭터·고양이) 1 = 켬 — 11/26 사용자 확정: ④⑤⑥ 모두 광장에도 (내 화면에서만)
  heat: 1, // 16장 C 1단계: 계속 맞출수록 음악에 악기가 한 겹씩 더해짐(0~3겹, 놓치면 한 겹 빠짐). 1 = 켬 — 11/26 사용자 확정: 광장에도 (내 화면에서만)
  heatC: 1, // 16장 C 2단계: 같은 겹 수로 기본 원 둘레·화면 가장자리 빛이 주황 → 분홍 → 금색. 1 = 켬 — 11/26 사용자 확정: 광장에도
  chargeBeats: 4, // 17장: 끝까지 기 모으는 데 걸리는 박 수 (11/27 사용자 확정: 기본 4박, 시안 ⚙️에서 8박도)
  cam: 2, // 카메라 연출 세기 (박자 두근·단계 확대·기울기): 0 끔 · 1 약 · 2 보통 · 3 강
};

// 단계마다 쓰는 리듬·그림자 물고기 모양 (진짜 물고기 목록은 rules.js SPECIES). 리듬: bpm(한 마리마다 ±4 흔들림), secs = 그 단계를 다 맞출 때 걸리는 시간(초, 11/26 사용자 확정: 일반 6 · 희귀 +30% · 전설 +60% → 11/27 전설도 +30%),
// missOut = 처음부터 몇 번 놓치면 도망가는지. 박자 패턴·음악은 rhythm.js가 한 마리마다 새로 조립
export const FISH = {
  mackerel: {
    grade: 'common', body: 0x3f6fa0, belly: 0xe8eef2, stripe: true,
    bpm: 100, secs: 6, missOut: 3,
  },
  seabream: {
    grade: 'rare', body: 0xe0646a, belly: 0xfbd3cf,
    bpm: 115, secs: 7.8, missOut: 7,
  },
  goldball: {
    grade: 'legend', body: 0xffc21a, belly: 0xfff3b8, ball: true,
    bpm: 130, secs: 7.8, missOut: 10, // 17장(11/27 사용자 확정): 전설 단계도 희귀와 같은 7.8초 (예전 9.6)
  },
};
export const GRADE = {
  common: { label: '일반', color: '#9fb4c8' },
  rare: { label: '희귀', color: '#5aa9ff' },
  legend: { label: '전설', color: '#ffc21a' },
};

// ── 잡히는 것·크기·코인 규칙은 rules.js (서버와 같아야 해서 한곳에). 여기서는 시안의 ⚙️ 강제만 더함
import { JUNK, SPECIES, paddleCatch, rollCatch } from './rules.js';
// ctx: { cond: { break, night, rain }, owned: [가진 탁구채 id] }. 게임(로그인)에서는 서버가 같은 규칙으로 정함(5장)
export function pickCatch(near = 0, ctx = {}, rnd = Math.random) {
  const f = TUNE.fish;
  if (f === 'paddle') return paddleCatch(ctx.owned || [], rnd);
  if (f === 'junk') return JUNK[Math.floor(rnd() * JUNK.length)];
  if (f !== 'random') return SPECIES.find((s) => s.id === f);
  return rollCatch(near, ctx, rnd);
}

// 단계 (fishing.md 8장 '등급 숨기기', 11/25 사용자 확정): 누구나 일반 리듬으로 시작 → 희귀면 한 번, 전설이면 두 번 "무겁다!"로 리듬이 올라감
export const STAGES = ['common', 'rare', 'legend'];
export const STAGE_FISH = { common: FISH.mackerel, rare: FISH.seabream, legend: FISH.goldball }; // 단계마다 박자(bpm)·시간 기준
export const stageOf = (f) => STAGES.indexOf(f.grade);

// 입질 순서: tok(톡 = 약한 떨림) · fake(가짜 풍덩 = 약한 떨림 2~3번) · real(진짜, 항상 마지막)
// 등급을 숨기므로 입질 순서는 등급과 상관없이 고름 (순서로 등급을 알아채지 못하게)
const SEQS = [['tok'], ['tok', 'fake'], ['tok', 'fake', 'tok'], ['tok', 'tok', 'fake'], ['tok', 'fake', 'tok', 'fake']];
export function biteSeq(f, rnd = Math.random) {
  let s = [...SEQS[Math.floor(rnd() * SEQS.length)]];
  if (TUNE.fake === 0) s = s.slice(0, 1);
  if (TUNE.fake === 2) s.splice(1 + Math.floor(rnd() * s.length), 0, 'fake');
  return [...s, 'real'];
}
