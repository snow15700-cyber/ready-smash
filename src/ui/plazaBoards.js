// 광장 20장 ② 기능: 움직이는 글자판 (광장이 보일 때 ui/plaza.js plazaFrame이 매 프레임 부름, 실제 일은 1초에 한 번 이하)
//  · 시계탑: 네 면 시계 = 한국 시간, 앞면 판 = 쉬는 시간 안내 (src/breaks.js — 보여 주기만, 코인은 서버가 정함)
//  · 본관 전광판: 지금 경기 중인 탁구대 점수(로비 채널 정보, 네트워크 추가 없음) + 랭킹 1등(승수)·최장 랠리 1등 (3분에 한 번 불러옴)
import { getFishRank, getRanking } from '../account.js';
import { CATCH } from '../games/fishing/rules.js';
import { canvasTex, clockTex } from '../arena-kit.js';
import { breakLines, nowMs } from '../breaks.js';
import { lobbyRooms } from './lobbyList.js';
import { world } from './state.js';

const FONT = (px) => `bold ${px}px Jua, sans-serif`;
let last = 0, clockKey = '', plateKey = '', boardKey = '', rankAt = -1e9, rankBusy = false;
let top = { wins: null, rally: null };
const objs = { faces: [], plate: null, board: null, root: null };

function find(root) {
  if (objs.root === root) return;
  objs.root = root;
  objs.faces = []; objs.plate = null; objs.board = null;
  root.traverse((o) => {
    if (o.name === 'clock-face') objs.faces.push(o);
    else if (o.name === 'clock-plate') objs.plate = o;
    else if (o.name === 'scoreboard') objs.board = o;
  });
  clockKey = plateKey = boardKey = '';
}
const swapMap = (mesh, tex, emissive = false) => {
  const m = mesh.material, old = m.map;
  m.map = tex;
  if (emissive) m.emissiveMap = tex;
  m.needsUpdate = true;
  if (old && old !== tex) old.dispose();
};

async function loadTop() {
  rankBusy = true;
  try {
    const [w, r, f] = await Promise.all([getRanking('wins'), getRanking('rally'), getFishRank('week')]);
    top = { wins: w?.[0] || null, rally: r?.[0] || null, fish: f?.[0] || null }; // 이번 주 월척 1등 (낚시 12장 ④)
  } catch { /* 못 받으면 지난 것 */ }
  rankAt = performance.now();
  rankBusy = false;
}

export function boardsFrame(now) {
  const root = world.plaza?.root;
  if (!root || now - last < 1) return;
  last = now;
  find(root);
  // 시계 (한국 시간, 1분에 한 번 다시 그림)
  const k = new Date(nowMs() + 9 * 3600e3), hh = k.getUTCHours(), mm = k.getUTCMinutes();
  const ck = `${hh}:${mm}`;
  if (ck !== clockKey && objs.faces.length) {
    clockKey = ck;
    const tex = clockTex(hh, mm);
    const mats = new Set(objs.faces.map((f) => f.material));
    for (const m of mats) { const old = m.map; m.map = tex; m.emissiveMap = tex; m.needsUpdate = true; if (old && old !== tex) old.dispose(); }
  }
  // 쉬는 시간 판
  const lines = breakLines();
  const pk = lines.join('|');
  if (pk !== plateKey && objs.plate) {
    plateKey = pk;
    swapMap(objs.plate, canvasTex(360, 160, (g, w, h) => {
      g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffe08a'; g.font = FONT(46); g.fillText(lines[0], w / 2, 50, w - 20);
      g.fillStyle = '#9fe0ff'; g.font = FONT(38); g.fillText(lines[1], w / 2, 112, w - 20);
    }));
  }
  // 전광판: 랭킹 1등은 3분에 한 번 (처음 광장이 보일 때 바로)
  if (!rankBusy && performance.now() - rankAt > 180e3) loadTop();
  if (!objs.board) return;
  const games = lobbyRooms.filter((r) => r.play && r.pt != null).sort((a, b) => a.pt - b.pt).slice(0, 3)
    .map((r) => `🔥 ${r.pt + 1}번 탁구대 · ${r.mode === '2v2' ? '2대2' : '1대1'}   ${(r.score || [0, 0])[0]} : ${(r.score || [0, 0])[1]}   (방장 ${r.nick})`);
  const rk = [top.wins ? `🏆 랭킹 1등 ${top.wins.nick} ${top.wins.value}승` : '🏆 랭킹 1등: 아직 없어요', top.rally ? `🏓 최장 랠리 ${top.rally.nick} ${top.rally.value}회` : ''].filter(Boolean).join('   ·   ');
  // 아래 줄: 랭킹·랠리 ↔ 이번 주 월척을 6초마다 번갈아
  const fishLine = top.fish ? `🐟 이번 주 월척 ${top.fish.nick} · ${CATCH[top.fish.fish]?.name || '물고기'} ${top.fish.value}cm` : '';
  const showFish = fishLine && Math.floor(now / 6) % 2 === 1;
  const rk2 = showFish ? fishLine : rk;
  const bk = JSON.stringify([games, rk2]);
  if (bk === boardKey) return;
  boardKey = bk;
  swapMap(objs.board, canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff8a3d'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const rows = games.length ? games : ['🏓 지금 경기 중인 탁구대가 없어요', '탁구대에 서서 한 판 해 볼까요?'];
    const top0 = games.length ? 70 : 95, step = games.length ? 74 : 80;
    g.fillStyle = '#ffe08a';
    rows.forEach((t, i) => { g.font = FONT(games.length ? 50 : 54); g.fillStyle = i === 0 || games.length ? '#ffe08a' : '#ffd6b0'; g.fillText(t, w / 2, top0 + i * step, w - 60); });
    g.fillStyle = 'rgba(255,138,61,.6)'; g.fillRect(60, h - 104, w - 120, 3);
    g.fillStyle = showFish ? '#a8f0c6' : '#9fe0ff'; g.font = FONT(46); g.fillText(rk2, w / 2, h - 56, w - 60);
  }));
}
// 점검·디버그용
export const boardsDebug = { get objs() { return objs; }, get keys() { return { clockKey, plateKey, boardKey }; } };
