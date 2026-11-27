// 🪧 낚시 게시판 (전망대·서쪽 계단 옆, 광장 게시판과 같은 모양 — campusProps.js FISH_NOTES)
//  종이 3장을 누르면 이 창: 🎣 낚시 방법 · 💡 낚시 팁 · 🐱 고양이. 위 탭으로 서로 넘겨 봄. 글만 있음(서버·네트워크 없음)
//  ui/fishing.js의 fishHooks.openBoard(n)가 필요할 때 불러옴
import { FEED_GAP_MS, PER_HEART } from '../cats/rules.js';

const NOTES = [
  {
    tab: '🎣 낚시 방법',
    title: '🎣 이렇게 낚아요',
    items: [
      '계단으로 선착장에 내려가 나무 판 위에 서면 <b>🎣 낚시하기</b> 버튼이 나와요. 판 위 어디서든 OK!',
      '<b>마우스를 누른 채 위로 쓱 끌어올리면</b> 던져요. 빠르게 올릴수록 멀리, 비스듬히 올리면 그쪽으로 (스페이스 = 가운데)',
      '찌를 잘 보세요. <b>톡·꿈틀꿈틀</b>은 가짜예요 — 꾹 참기! ✨',
      '찌가 <b>쑥 잠기고 ‘!’</b>가 뜨면 바로 누르기 (챔질). 빠를수록 Perfect',
      '걸리면 리듬 타임 🎵 <b>줄어드는 원이 안쪽 원과 겹칠 때</b> 누르기. 마지막에 오는 큰 원까지 맞추면 잡혀요',
      '휴대폰도 똑같아요: 위로 밀어 던지고, 화면을 톡 눌러 챔질·리듬',
    ],
  },
  {
    tab: '💡 낚시 팁',
    title: '💡 낚시꾼의 비밀 수첩',
    items: [
      '🫧 <b>기포</b>가 올라오면 그 위로 던지세요! 희귀·전설이 훨씬 잘 물어요 (몇 분에 한 번, 40초쯤 — 모두에게 같은 자리)',
      '“끝인 줄 알았는데!” <b>무겁다!</b>가 뜨면 희귀 이상이에요. 정신 바짝! 🌟',
      '☕ 쉬는 시간 · 🌙 밤 · 🌧️ 비 올 때만 나오는 물고기도 있어요. 도감의 아이콘을 보세요',
      '잡은 물고기는 가방에 모여요. 🍣 <b>횟집</b>에서 팔면 코인! 📈 시세는 쉬는 시간마다 바뀌니 비쌀 때 파세요',
      '아주 가끔(1%) 물고기 대신 <b>🏓 전설 탁구채</b>가 걸려 올라온대요…',
      '장화·빈 캔도 도감에 들어가요. 바다 청소부를 노려 봐요 🥾',
    ],
  },
  {
    tab: '🐱 고양이',
    title: '🐱 선착장 고양이 친구들',
    items: [
      '치즈 · 고등어 · 삼색이 · 턱시도 · 까망이 · 샴 — <b>6마리</b>가 선착장과 계단 위, 횟집 앞까지 놀러 다녀요',
      `고양이를 누르고 <b>🐟 주기</b> — 가방에서 가장 싼 생선을 줘요. 한 마리에게 <b>${Math.round(FEED_GAP_MS / 3600e3)}시간에 한 번</b>`,
      `생선 ${PER_HEART}마리마다 <b>♥ 하나</b>. 하트는 줄지 않아요`,
      '♥1 다가와 다리에 비비기 · 🔔 방울 목걸이',
      '♥2 낚시하는 옆에 앉아 응원 (Perfect면 ‘냥!’) · 🎀 리본',
      '♥3 광장 어디든 따라와요 · ♥4 들어오면 마중 · ♥5 어깨 위에 폴짝!',
      '하트·옷은 낚시 화면의 <b>🐱</b> 버튼이나 고양이 말풍선의 <b>🐱 내 고양이</b>에서',
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
#fish-board .fb { width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
#fish-board .fb-tabs { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
#fish-board .fb-tabs button { height: 34px; padding: 0 12px; border: 0; border-radius: 999px; font: 700 14px var(--font-ui, system-ui); color: #fff; background: rgba(255,255,255,.16); cursor: pointer; }
#fish-board .fb-tabs button.on { background: #2ea3e6; }
#fish-board .fb-title { justify-content: center; margin-top: 4px; }
#fish-board .fb-list { margin: 2px 0 4px; padding-left: 20px; line-height: 1.6; font-size: 15px; color: #fff; }
#fish-board .fb-list li { margin: 3px 0; }
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
