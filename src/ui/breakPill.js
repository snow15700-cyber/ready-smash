// 쉬는 시간 보너스 알림: 로비 '친구랑 하기' 옆과 대기실에 '☕ 쉬는 시간 코인 ×1.5 · n분 남음' (src/breaks.js)
// 코인은 서버가 서버 시계로 정한다. 이 알림은 이 PC 시계로 보여 주기만 한다.
import { breakAt, nowMs } from '../breaks.js';
import { $ } from './state.js';

function render() {
  const b = breakAt();
  for (const [id, text] of [['break-pill', '쉬는 시간'], ['room-break', '지금 시작하면']]) {
    const el = $(id);
    if (!el) continue;
    el.classList.toggle('hidden', !b);
    if (!b) continue;
    const left = Math.max(1, Math.ceil((b.end - nowMs()) / 60000));
    el.innerHTML = `☕ ${text} <b>코인 ×1.5</b> · ${left}분 남음`;
  }
}
render();
setInterval(render, 5000);
