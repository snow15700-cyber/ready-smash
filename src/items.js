// 상점 아이템 목록 (기획서 4장). 이름·모양은 여기, 뽑기·구매 규칙은 서버(supabase/06_shop.sql)가 정한다.
// ⚠️ 아이템을 추가·변경하면 06_shop.sql의 pingpong_items 목록(insert)도 똑같이 고쳐야 한다.
//
// pool: 'char' 캐릭터 뽑기(탁구채·머리·몸·궤적) | 'arena' 경기장 뽑기(탁구대·배경·탁구공)
// grade: 'common' 일반 | 'rare' 고급 | 'legend' 전설.  기본 아이템(default)은 처음부터 가지고 있고 팔지 않는다.

export const POOLS = {
  char: { name: '캐릭터 뽑기', icon: '🎽', desc: '탁구채 · 머리 · 몸 · 궤적' },
  arena: { name: '경기장 뽑기', icon: '🏟️', desc: '탁구대 · 배경 · 탁구공' },
};
export const GRADES = {
  common: { name: '일반', rate: 0.7, buy: 500, pieces: 50, dup: 2 },
  rare: { name: '고급', rate: 0.25, buy: 1500, pieces: 150, dup: 6 },
  legend: { name: '전설', rate: 0.05, buy: 5000, pieces: 500, dup: 30 },
};
export const GACHA_PRICE = { 1: 100, 10: 900 };
export const PITY = 40; // 40번 안에 전설이 안 나오면 다음은 무조건 전설

// 카테고리. 순서대로 옷장 탭에 나온다. ready=false는 아직 아이템이 없음(곧 열림)
export const CATS = {
  paddle: { name: '탁구채', pool: 'char', ready: true },
  head: { name: '머리', pool: 'char' },
  body: { name: '몸', pool: 'char' },
  trail: { name: '궤적', pool: 'char' },
  table: { name: '탁구대', pool: 'arena' },
  bg: { name: '배경', pool: 'arena' },
  ball: { name: '탁구공', pool: 'arena' },
};

// 기본 아이템 (카테고리마다 하나, 장착 안 했을 때 이것)
export const DEFAULTS = { paddle: 'paddle_red' };

const paddle = (id, name, grade, color, extra = {}) => ({ id, cat: 'paddle', name, grade, color, ...extra });
export const ITEMS = [
  paddle('paddle_red', '빨강 탁구채', 'default', '#e0333c'),
  paddle('paddle_blue', '파랑 탁구채', 'common', '#2f6fe0'),
  paddle('paddle_green', '초록 탁구채', 'common', '#2fa65a'),
  paddle('paddle_yellow', '노랑 탁구채', 'common', '#f2c230'),
  paddle('paddle_black', '검정 탁구채', 'common', '#2b2a33'),
  paddle('paddle_pink', '분홍 탁구채', 'common', '#ff7fb0'),
  paddle('paddle_gold', '황금 탁구채', 'rare', '#e8b923', { emissive: '#7a5200', glow: 0.6 }),
  paddle('paddle_neon', '네온 탁구채', 'rare', '#3dffa0', { emissive: '#19ff8c', glow: 0.9 }),
];
for (const it of ITEMS) it.pool = CATS[it.cat].pool;
export const ITEM = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

// 장착 정보(equip = { paddle: 'paddle_blue', ... })에서 카테고리의 아이템
export const equipped = (equip, cat) => ITEM[equip?.[cat]] || ITEM[DEFAULTS[cat]];

// 캐릭터에 꾸미기 적용 (scene.js의 makeCharacter)
export function applyLook(char, equip) {
  const p = equipped(equip, 'paddle');
  char.setPaddle({ color: p.color, emissive: p.emissive || '#000000', glow: p.glow || 0 });
}

// 목록 화면용 작은 그림 (CSS)
export function swatch(it) {
  if (it.cat === 'paddle') {
    const glow = it.glow ? `box-shadow: 0 0 10px ${it.emissive}, inset 0 0 0 3px rgba(255,255,255,.35);` : '';
    return `<span class="sw paddle" style="--c:${it.color};${glow}"></span>`;
  }
  return '<span class="sw">?</span>';
}
