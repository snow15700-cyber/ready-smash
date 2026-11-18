// 쉬는 시간 보너스 알림 (src/breaks.js). 코인은 서버가 서버 시계로 정하고, 이 알림은 이 PC 시계로 보여 주기만 한다.
// 로비: 화면 위 가운데 큰 띠 / 대기실: 아래 카드 안 알약 / 혼자 하기: 경기 화면 랠리 카드 아래 (hud.js)
// 사용자 확정: '×1.5' 말고 '+50%'로 통일, 곧 없어질 수 있다는 말('한시적') 넣기
import { breakAt, nowMs } from '../breaks.js';
import { $ } from './state.js';

const minsLeft = (b) => Math.max(1, Math.ceil((b.end - nowMs()) / 60000));

function render() {
  const b = breakAt();
  const banner = $('break-banner'), room = $('room-break');
  banner.classList.toggle('hidden', !b);
  room.classList.toggle('hidden', !b);
  if (!b) return;
  const left = minsLeft(b);
  banner.innerHTML = '<span class="bb-ico">☕</span><div><div class="bb-main">쉬는 시간 코인 <b>+50%</b></div>'
    + `<div class="bb-sub">혼자 하기 · 1대1 · 2대2 모두 · <b>${left}분 남음</b><em>⏳ 한시적 이벤트</em></div></div>`;
  room.innerHTML = `☕ 지금 시작하면 코인 <b>+50%</b> · ${left}분 남음`;
}
render();
setInterval(render, 5000);
