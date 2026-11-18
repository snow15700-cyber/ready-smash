# 탁구공

> CLAUDE.md에서 옮겨 온 상세 기록. 작업할 때 필요한 부분만 읽는다. 새로 정해진 것도 여기에 적는다.

## 탁구공 (1단계 시안 + 2단계 게임·상점 연결 — main 배포됨)
- 목록·반응·바운드음은 기획서 4장 '탁구공 목록'. 일반 8(색·무늬) · 고급 8(눈알·스마일·귤·방울토마토·찹쌀떡·타코야끼·계란·8번 당구공) · 전설 3(소행성·드래곤 알·미니 태양).
- 사용자 수정(1단계 확인 뒤): **공은 꼭 둥글지 않아도 됨**(보이는 모양만, 맞는 크기·판정은 같음). 털뭉치 병아리 → **계란**(달걀 모양 `EGG`), 냥냥 공 **폐기**, 소행성은 사용자가 준 사진처럼 길쭉한 땅콩 모양 + 구덩이(`asteroidGeo`, 테두리 없음), 충돌하듯 '쿵-' 소리 + 탁구대에 충돌 자국(`mark: 'crater'`). 계란·드래곤 알은 **스매시로 득점하면 깨짐**. 사용자 확정 = A안: 받는 사람이 놓쳐 공이 몸을 지나가는 순간 공중에서 깨지고(공 숨김), 계란은 털뭉치 병아리(깨진 껍데기 반쪽을 입음)가 받는 쪽 탁구대 끝 위로 톡 떨어져 가운데 쪽으로 3번 폴짝 → 받는 사람 쪽으로 돌아서 '삐약'(글자 + `playPeep`) → 반짝 사라짐(약 2.6초). 드래곤 알은 불꽃과 함께 깨지고 아기 용이 날개 치며 위로 크게 돌아 날아가다 불을 뿜고 '꺄오'(`playRoar`) → 반짝 사라짐(약 2.4초). 깨지는 소리 `playCrack(pos, kind)`. 구현: 공 모델 `userData.fx.hatch`('chick'|'dragon') → `ballFx(...).hatch(ball, pos, dir, 탁구대 높이, 받는 쪽 끝 z, {crack, peep, roar})`(알이면 true → 공 숨김), `makeChick`·`makeBabyDragon`, `kidPos`·`kidKind`. 시안 페이지 '스매시 득점' 단추(보통 랠리 → 스매시 → 놓침 반복).
- 사용자 확정: 방장 공을 모두가 봄, 보기만 다름(판정 같음), **바운드음은 공마다 다르게**(소리 초안은 기획서, 만든 뒤 들어 보고 고침). 일반 공이 들어가면 경기장 뽑기 통이 자동으로 열린다(`poolOpen`).
- **1단계 시안 페이지 (main 배포됨)**: `balls.html`(`src/balls-page.js`, vite 빌드 입력). 탁구대 위를 왔다 갔다 하는 공(보통 랠리/스매시, 가까이/경기 화면, 밝은 곳/어두운 곳) + 20종 목록. 주소 `?id=cat&mode=smash&cam=game&bg=dark`.
  - `src/balls.js`: `BALLS`(id·name·grade·sound), `makeBall(id)`(반지름 1로 만들고 `BALL_R` 0.028배, root → squash(말랑 찌그러짐 — **찹쌀떡만** `base('spin', { squishy: true })`, 나머지 공은 튈 때 안 찌그러짐: 사용자 결정 2026-11) → spin(굴러감 'spin' / 얼굴이 날아가는 쪽 'face' / 위가 늘 위 'upright')), `userData.tick(t, dt, {vel, smash})`·`bounce`·`hit`·`fx`(튈 때 효과 `bounce(emit, s)`, 스매시 꼬리 `trail`, 미니 태양 `scorch`). 월드 효과는 `ballFx(scene, fx)`의 `bounce(ball, pos, smash, 탁구대 높이)`·`frame(...)`.
  - `fx.js`: `hit(kind, …)`의 kind에 함수도 됨, grade에 숫자 lv도 됨, 파티클 `floor`(탁구대에 떨어져 멈춤), 그림 `nyang`·`pyo`·`rock`.
  - 소리: `audio.js`의 `BOUNCE_SKINS`·`BOUNCE_GAIN`, `playTable/playFloor(speed, pos, when, skin)`. 음량은 OfflineAudioContext로 재서 기본 바운드음(RMS 약 0.07)에 맞춤.
- **2단계 게임·상점 연결 (main 배포됨)**: `supabase/17_balls.sql`(insert만, 사용자가 실행 → 일반 공이 들어가 경기장 뽑기가 열림). `items.js`에 `ball_white`(기본, DEFAULTS.ball)·`ball_<id>`(`ball`·`sound` 필드), `CATS.ball.ready`, `ballOf(look)`, 목록 그림 `ballImage`. 꾸미기 '크게 보기'의 🔊는 공이면 `playTable`(튀는 소리). 계란·드래곤 알은 아이템 `hatch` → 설명에 '✨ 스매시 득점 시 특별한 효과'(사용자 확정).
- 옷장 카테고리 칩(사용자 확정): 첫 줄 캐릭터(탁구채·몸·머리·궤적), 둘째 줄 경기장(배경·탁구공·탁구대) — `main.js`의 `CHIP_ROWS`. 아이템 없는 카테고리는 흐린 잠금만('곧' 글자 없음).
  - `scene.js`: `world.ball`은 자리만 잡는 그룹, 모양은 `setBallSkin(id)`로 교체. `setBall(p, visible, smash)`, `ballSound`, `ballBounce(delay, p, smash, floor)`(game.js·lobbyDemo.js가 소리와 같은 세그먼트로 예약), `hatch(pos, dir)`·`clearHatch()`. `render()`가 매 프레임 공 `tick`(속도는 위치 차이) + 튈 때 효과 + 스매시 꼬리 + 알에서 나온 아이.
  - 어떤 공을 보이나(`main.js` 루프 끝, 배경과 같음): 방 = 방장 presence `look.ball`, 로비·꾸미기 = 내 장착(입어 보는 중이면 그것), 혼자 하기 = 내 장착. 대기실 알약 `#room-bg`에 '⚪ 공 이름'(기본 공이면 생략).
  - 알 깨짐(`game.js`의 `smashWatch`·`checkHatch`): 'shot' 이벤트가 스매시이고 받을 사람이 있으면 지켜보다가, 받을 수 있는 마지막 순간(`ideal + WIN_LATE.bad + HOLD + 0.03`)이 지나도 그 공이 그대로면(내 예측 타격·대기 중인 타격 없음) 깨짐 → 공 숨김(`hatched`). 방장 결과보다 먼저 보여 주므로, 뒤늦게 받아친 'shot'이 오면 `clearHatch`로 되돌린다. serveReady에서 초기화. 보기만이라 판정·메시지는 그대로.
