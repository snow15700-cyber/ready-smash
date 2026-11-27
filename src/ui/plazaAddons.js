// 광장 '콘텐츠 콘센트' (docs/dev/cleanup.md 12번): 낚시 같은 콘텐츠는 자기 파일에서 registerAddon({...}) 한 번으로 광장에 붙는다.
// 광장(ui/plaza.js)은 콘텐츠 이름을 모르고, 등록된 것을 돌면서 부른다. 콘텐츠는 ui/plaza.js를 직접 불러오지 않고 여기의 plazaApi를 쓴다.
//
// registerAddon(def) — def에 넣을 수 있는 것 (모두 골라서):
//   id            이름 ('fishing'). 콘텐츠끼리 addon(id)로 찾아 부름
//   key           광장 상태 메시지(st)에 실을 칸 이름 ('fi') — ⚠️ 한 번 정하면 바꾸지 않기(다른 버전 사람과 메시지 모양이 같아야 함)
//   state()       내 상태에 실을 값 (없으면 null). 다른 사람 쪽에서는 clean(v)를 거쳐 사람[key]에 들어감
//   clean(v)      받은 값 검사 (브라우저가 보낸 값은 믿지 않기). 없으면 null
//   msgKind       이 콘텐츠의 광장 메시지 종류 ('fish') → onMsg(m, 보낸 사람). 광장에 있는 사람이 보낸 것만 옴
//   onSay(사람, 글)  정해진 채팅이 왔을 때
//   spots         { 눌린 곳 id: (sp, at) => ... } 광장 3D에서 그곳을 눌렀을 때
//   takesOver()   true면 광장 걷기 멈춤·내 캐릭터 숨김 (그 콘텐츠가 화면을 맡음)
//   face(사람)     다른 사람이 볼 방향(라디안) 또는 null
//   frame(now, 내 자리, 걷는 중)  광장이 보이는 동안 매 프레임 — 등록 순서대로 부름
//   hidden()      광장이 안 보일 때(경기·랭킹·꾸미기 창 등) 매 프레임
const list = [];
export function registerAddon(def) {
  if (list.some((a) => a.id === def.id)) throw new Error(`광장 콘텐츠 이름이 겹쳐요: ${def.id}`);
  list.push(def);
  return def;
}
export const addons = () => list;
export const addon = (id) => list.find((a) => a.id === id) || null;

// 콘텐츠가 쓰는 광장 정보·기능 — ui/plaza.js가 불러올 때 채운다
//   view · people() · seat() · myId() · send(m) · sendInfo() · raining() · walkTo(pt, {then}) · pos() · walkNear(pt, f) · boardNote(at)
export const plazaApi = {};
