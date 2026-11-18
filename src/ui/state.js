import { account } from '../account.js';
import { titleText } from '../achievements.js';
import { createWorld } from '../scene.js';

export const $ = (id) => document.getElementById(id);
export const world = createWorld($('c'));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 칭호 알약 (이름표 위. 칭호 색은 모두 같게 — 2v2 '다음에 칠 사람' 노란 강조와 겹치지 않는 남색). id = 업적 id
export const tpill = (id, x) => (titleText(id, x) ? `<span class="tpill">${esc(titleText(id, x))}</span>` : '');
export const myNemesis = () => account.player?.nemesis || null; // 천적 칭호에 들어갈 닉네임
// 휴대폰·태블릿(마우스 없음): 혼자 하기만 열고 온라인 방은 막는다. 주소에 ?mobile=1 이면 PC에서도 흉내.
// 갤럭시 등은 S펜 때문에 'any-pointer: fine'으로 나와서, 브라우저가 알려 주는 기기 종류(UA)도 함께 본다.
const UA = navigator.userAgent || '';
export const IS_MOBILE = new URLSearchParams(location.search).has('mobile')
  || navigator.userAgentData?.mobile === true
  || /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser|KAKAOTALK|NAVER/i.test(UA)
  || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) // 아이패드(데스크톱 모드)
  || (matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);
export const MOBILE_MSG = '💻 같이 하기는 PC에서 해 주세요';
if (IS_MOBILE) {
  document.body.classList.add('mobile');
  $('mobile-note').classList.remove('hidden');
  for (const id of ['btn-create-1v1', 'btn-create-2v2', 'btn-join']) { $(id).classList.add('locked'); $(id).setAttribute('aria-disabled', 'true'); }
  document.querySelector('.lb-friends .lb-label').textContent = '👥 친구랑 하기 · 🔒 PC에서만';
}
export const myNick = () => account.nick || '플레이어';
export const ease = (t) => t * t * (3 - 2 * t);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 여러 화면이 함께 바꾸는 것 (다른 파일에서는 setGame 등으로 바꾼다)
export let game = null;
export let match = null;
export let preview = null; // 꾸미기에서 입어 보는 중 { look } (null이면 로비 화면)
export const setGame = (g) => (game = g);
export const setMatch = (m) => (match = m);
export const setPreview = (p) => (preview = p);
