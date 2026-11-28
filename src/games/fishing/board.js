// 🪧 낚시 게시판 (전망대·서쪽 계단 옆, 광장 게시판과 같은 모양 — campusProps.js FISH_NOTES)
//  종이 3장을 누르면 이 창: 🎣 낚시 방법 · 💡 낚시 팁 · 🐱 고양이. 위 탭으로 서로 넘겨 봄. 글만 있음(서버·네트워크 없음)
//  ui/fishing.js의 openBoard(n)가 필요할 때 불러옴
import { FEED_GAP_MS, PER_HEART } from '../cats/rules.js';

const NOTES = [
  {
    tab: '🎣 낚시 방법',
    title: '🎣 이렇게 낚아요',
    items: [
      '계단으로 선착장에 내려가 나무 판 위에 서면 <b>🎣 낚시하기</b> 버튼이 나와요',
      '<b>화면(또는 스페이스바)을 꾹 누르면</b> 힘을 모아요. 오래 누를수록 멀리, <b>떼면 던져요</b>',
      '누른 채 좌우로 밀면 그쪽으로 던져요 (스페이스바는 ← →)',
      '찌가 <b>톡톡</b> 움직이는 건 가짜예요. 꾹 참기!',
      '찌가 <b>쑥 들어가고 ‘!’</b>가 뜨면 바로 눌러서 당겨요',
      '걸리면 리듬 타임 🎵 <b>줄어드는 원이 가운데 원과 겹칠 때</b> 눌러요. 끝까지 맞추면 잡혀요',
    ],
  },
  {
    tab: '💡 낚시 팁',
    title: '💡 낚시 꿀팁',
    items: [
      '🫧 <b>기포</b>가 올라오는 곳에 던지면 좋은 물고기가 잘 물어요',
      '<b>무겁다!</b>가 뜨면 귀한 물고기예요. 정신 바짝! 🌟',
      '잡은 물고기는 🎒 가방에 모여요. 🍣 <b>횟집</b>에 팔면 코인! (하루 1000코인까지)',
      '📈 물고기 값은 쉬는 시간마다 바뀌어요. 비쌀 때 파세요',
      '🎷🎸🎻 <b>서는 자리마다 잘 나오는 물고기</b>가 달라요 (가운데 재즈 · 서쪽 팔 발라드 · 동쪽 팔 록). 🎸 록 물고기는 값이 크게 출렁, 🎻 발라드는 잔잔해요',
      '📖 도감을 채우고, 🏆 랭킹에서 누가 제일 큰 물고기를 낚았는지 겨뤄 봐요',
      '✨ 아주 가끔 물에서 <b>전설 탁구채</b>가 올라와요!',
      '소리랑 원이 안 맞는 것 같으면 <b>🎵 박자 맞추기</b>로 고쳐요',
    ],
  },
  {
    tab: '🐱 고양이',
    title: '🐱 선착장 고양이 친구들',
    items: [
      '선착장에 고양이 <b>6마리</b>가 살아요',
      `고양이를 누르고 <b>🐟 주기</b>를 하면 생선을 줘요 (한 마리에게 ${Math.round(FEED_GAP_MS / 3600e3)}시간에 한 번)`,
      `생선을 ${PER_HEART}번 주면 <b>♥ 하나</b>가 쌓여요`,
      '친해질수록 다리에 비비고, 낚시할 때 옆에서 구경하고, 광장까지 따라와요',
      '끝까지 친해지면 <b>어깨 위에 폴짝!</b> 🔔 목걸이나 🎀 리본도 입혀 줄 수 있어요',
    ],
  },
];

let el = null, cur = 0;
function build() {
  el = document.createElement('div');
  el.id = 'fish-board';
  el.className = 'howto-pop gx hidden';
  el.innerHTML = `<div class="howto fb">
    <div class="fb-tabs">${NOTES.map((n, i) => `<button type="button" data-i="${i}">${n.tab}</button>`).join('')}</div>
    <b class="howto-title fb-title"></b>
    <ul class="fb-list"></ul>
    <button type="button" class="big fb-close">알겠어요!</button>
  </div>`;
  const css = document.createElement('style');
  css.textContent = `
#fish-board { z-index: 80; } /* 광장 화면(.screen 10) 위 — 횟집·도감 창과 같은 층 */
#fish-board .fb { width: min(460px, 100%); max-height: calc(100vh - 64px); max-height: calc(100dvh - 72px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow: hidden; }
#fish-board .fb-tabs { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
#fish-board .fb-tabs button { height: 34px; padding: 0 12px; border: 0; border-radius: 999px; font: 700 14px var(--font-ui, system-ui); color: #fff; background: rgba(255,255,255,.16); cursor: pointer; }
#fish-board .fb-tabs button.on { background: #2ea3e6; }
#fish-board .fb-title { justify-content: center; margin-top: 4px; }
#fish-board .fb-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 2px 0 4px; padding-left: 20px; line-height: 1.6; font-size: 15px; color: #fff; }
#fish-board .fb-list li { margin: 3px 0; }
#fish-board .fb-tabs, #fish-board .fb-title, #fish-board .fb-close { flex: none; } /* 짧은 화면: 글 목록만 스크롤, 탭·'알겠어요!'는 늘 보이게 */
#fish-board .fb-list b { color: #ffd36b; }`;
  document.head.appendChild(css);
  (document.getElementById('app') || document.body).appendChild(el);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (e.target === el || t?.classList.contains('fb-close')) close();
    else if (t?.dataset.i) show(+t.dataset.i);
  });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && isOpen()) close(); });
}
function show(i) {
  cur = i;
  const n = NOTES[i];
  el.querySelector('.fb-title').textContent = n.title;
  el.querySelector('.fb-list').innerHTML = n.items.map((t) => `<li>${t}</li>`).join('');
  el.querySelectorAll('.fb-tabs button').forEach((b, k) => b.classList.toggle('on', k === i));
}
const isOpen = () => !!el && !el.classList.contains('hidden');
function close() { el.classList.add('hidden'); }
export function openFishBoard(i = 0) {
  if (!el) build();
  show(Math.max(0, Math.min(NOTES.length - 1, i | 0)));
  el.classList.remove('hidden');
}
export const fishBoardOpen = isOpen;
export const FISH_BOARD_NOTES = NOTES; // 점검용
