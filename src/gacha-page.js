// 뽑기 연출 시안 (gacha.html): 실제 게임과 같은 연출(src/gachaShow.js)을 가짜 결과로 돌려 본다. 저장·코인 없음.
// 위쪽 '시험용 등급'으로 나올 등급을 고를 수 있다 (10회는 그중 하나만 그 등급).
// 주소 옵션: ?force=legend&go=1&auto=1 (스크린샷용: 저절로 진행)
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import { ITEMS, GRADES, PITY } from './items.js';
import { openGacha, playGacha, gachaState } from './gachaShow.js';

const params = new URLSearchParams(location.search);
const opt = { force: params.get('force') || 'random' };

const POOL = ITEMS.filter((i) => i.pool === 'char' && i.grade !== 'default');
const byGrade = (g) => POOL.filter((i) => i.grade === g);
const owned = new Set();
let used = 26; // 천장 게이지를 보여 주려고 중간쯤에서 시작

function roll(force) {
  let g;
  if (force) g = force;
  else if (used >= PITY - 1) g = 'legend';
  else { const r = Math.random(); g = r < GRADES.legend.rate ? 'legend' : r < GRADES.legend.rate + GRADES.rare.rate ? 'rare' : 'common'; }
  const list = byGrade(g).length ? byGrade(g) : byGrade('common');
  const it = list[Math.floor(Math.random() * list.length)];
  used = g === 'legend' ? 0 : used + 1;
  const dup = owned.has(it.id);
  owned.add(it.id);
  return { it, grade: it.grade, dup, pieces: dup ? GRADES[it.grade].pieces : 0 };
}
// 가짜 서버: 조금 기다렸다가 결과
function fakePull(n) {
  const forced = opt.force !== 'random' ? Math.floor(Math.random() * n) : -1;
  const out = [];
  for (let i = 0; i < n; i++) out.push(roll(i === forced ? opt.force : null));
  setTimeout(() => playGacha(out, { used, max: PITY }), 250);
}

const cfg = {
  start: true,
  auto: params.has('auto'),
  pity: { used, max: PITY },
  onAgain: fakePull,
  onExit: () => openGacha(cfg), // 시안: 처음 화면으로 (게임에서는 꾸미기 화면으로 돌아간다)
};
openGacha(cfg);

for (const b of document.querySelectorAll('.bar button')) {
  b.classList.toggle('on', opt[b.dataset.k] === b.dataset.v);
  b.addEventListener('click', () => {
    opt[b.dataset.k] = b.dataset.v;
    for (const o of document.querySelectorAll(`.bar button[data-k="${b.dataset.k}"]`)) o.classList.toggle('on', o === b);
  });
}
window.__gacha = { opt, get mode() { return gachaState.mode; } };
if (params.has('go')) { fakePull(+params.get('go') || 1); }
