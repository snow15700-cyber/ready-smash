# 🐱 고양이 친구 (선착장 고양이 6마리 · 하트 · 옷 · 탁구할 때 고양이)

기획 원문은 `docs/dev/fishing.md` 14장(14-0 원칙 · 14-2~14-5 · 14-7 뺀 것 · 14-8 순서). **이 문서 = 만드는 방법(설계)과 진행 상황.**
선착장·횟집·시세(14-1·14-6)는 낚시 쪽이라 `fishing.md` 14-9에.

## 상태
- **11/26 선착장 1b 끝(test)**: 'ㄷ자' 선착장에 🐾 고양이 쉼터 자리가 생김 — `campusLayout.js CAT_NOOK`(동쪽 계단 아래 x 22.2~27.6 · z 39~42.6, 상자 더미·방석 3·생선 바구니·밥그릇 2). 고양이 배회·앉는 곳은 이 자리와 앞 판·팔(`WOODS`) 위로. 걷기 막는 곳은 `arena-plaza.js` blocks.
- 11/26 설계(아래) — 사용자 확인 전.
- **2단계 시안 `cats.html` (test)**: `src/games/cats/models.js makeCat(id)` 6마리 + 자세(`anim(t, pose)`). 물고기 그림 도구는 `fishing/models.js`의 `KIT`로 같이 씀. 털 무늬·눈 색·먹는 몸짓 = `COATS` 표. 시안 페이지 `src/games/cats/page.js`(`?t=2` 시각 고정).
  - 고칠 점이 있으면 `COATS` 값이나 `posePlay` 숫자만 바꾸면 됨.
- **11/26 사용자: 첫 시안은 '귀엽지 않고 좀 징그럽다'** → 그림체 후보 3가지(A 찹쌀떡 · B 2등신 인형 · C 봉제 인형) 중 **B 2등신 인형 확정**. `models.js`를 B로 다시 만듦: 큰 머리 + 작은 동그란 몸, 큰 까만 눈 + 반짝이(털이 까만 턱시도·까망이·샴은 눈 뒤 색 테 `ring`), ω 입, 볼터치, 콩알 발, 테두리. 세로 동공·수염·긴 몸·가는 다리는 안 씀(징그러워 보인 이유). 자세: sit · nod · stand(두리번) · walk · loaf · belly(옆으로 벌러덩 zzz). 다음 = 3단계(배회 + 밥 주기 + ♡0~♥2 + 내 고양이 창 + `37`).

## 3a 한 것 (11/26, test · **`37_cats.sql` 실행 필요**)
- 규칙 `src/games/cats/rules.js`(three 없음): `CAT_IDS`·`CAT_NAME` · `FEED_GAP_MS` 1시간 · `PER_HEART` 10 · `heartOf`·`heartProgress`·`heartsText` · **배회 `catAt(id, ms)`** — 쉬는 자리 17곳(`CAT_SPOTS`: 쉼터 방석 3 · 앞 판 8 · 팔 6) 사이 길(9m 안, 계단·횟집·칠판·상자 피함, Floyd로 가장 짧은 길) · 75초 한 칸(걷기 0.85m/s → 남은 시간 쉼: sit·loaf·stand, 방석이면 loaf·sit) · 45% 제자리 · 30% 쉼터로. 시각 = `marketNow()`(서버 시각) → 모두 같은 자리, 전송 0.
- 화면 `src/games/cats/plazaCats.js`(main.js에서 불러옴): 광장 view.root에 6마리(크기 0.75) · 누르기 = `plaza.js addPicker`(새로 만든 일반 고리, 고양이 둘레 1 × 0.85m 상자) · 말풍선 `#cat-pop`(이름·하트·막대·'🐟 주기'/'😴 배불러요 · n분 뒤', 15초 또는 14m 멀어지면 닫힘) · 멀면(2.2m) 옆까지 걸어가서 줌 · 먹는 2.6초는 내 화면에서 그 자리에 멈춰 까딱(nod) + 🐟·💗 그림 · 배부르면(내가 1시간 안에 준) 쉴 때 belly zzz(내 화면만).
- 큰 파일 고친 곳: `ui/plaza.js` `catHooks`(frame·hidden) 2줄 + `plazaApi.walkTo·pos` · `src/plaza.js` `pickers`·`addPicker` 4줄.
- 서버 `37_cats.sql`: 표 `pingpong_cat(player_id, cat_id, pts, fed_at, outfit)` · `pingpong_cat_list(token)` → cats [{id, pts, wait초}] · `pingpong_cat_feed(token, cat)` → ok{fish, pts, up, cats, bag} | wait{wait} | no_fish | bad_cat. 가장 싼 생선 = 시세순 + id순(`market.js cheapestIn`과 같음). 로컬 가짜 서버 `localServer.js`도 같은 규칙, `account.js catList·catFeed`(account.cats = {id: {pts, readyAt}}).
- 점검(`check.cjs` SQL 부분): 빈 가방 no_fish · 없는 고양이 · 가장 싼 생선 == cheapestIn · 1시간 안 wait · 9→10점 ♥ 오름. 디버그 `window.__smash.cats.{cats, openPop(id), feed(id), catAt}`.
- 낚시 중엔 광장 누르기가 꺼져서 고양이를 못 누름(3b에서 낚시 옆 고양이 할 때 같이 보기).
- **다음 = 3b**(♥1~♥2 행동) → 새 대화 "cats.md 보고 고양이 3b 해줘".

## 사용자 확정 (11/26, 3단계 전)
- **밥 = 1시간에 1마리**(고양이마다): 하루 3마리 제한은 없앰 → 자주자주 들어오게. 먹으면 배 보이고 zzz, 머리 위 '다음 밥까지 n분'.
- 하트 숫자(추천안으로 3a에 넣음, 바꾸기 쉬움 — rules.js·37 SQL): 생선 1마리 = 1점, 단계마다 10점(♥5 = 50점). 하루 4~5번 들르면 약 2주에 단짝. 하트는 안 줄어듦.
- 3단계는 3a·3b·3c로 나눠 대화마다 하나씩(토큰 아끼기, 아래 표).

## 설계 원칙 (토큰·코드 아끼기)
- **코드는 `src/games/cats/`에만.** 큰 파일(`ui/plaza.js` 940줄, `game.js`)은 '고양이에게 알려 주기' 한두 줄만 고침 → 새 대화가 큰 파일을 통째로 안 읽음.
- **모형 하나 + 털 무늬 표 6줄**: 몸 모양(`models.js`처럼 매끈한 젤리 장난감)은 하나, 치즈·고등어·삼색·턱시도·까망·샴은 칠하기 값만 다름. 몸짓 차이(먹보 춤·샴 고개 돌리기)도 표의 값(`eat: 'dance' | 'turn' …`)으로.
- **동작은 뼈대 없이**: 몸통·머리·꼬리·다리 4개를 돌리고 움직이는 방식(김제빵 `plazaKim.js`와 같은 방식). 자세 = 걷기·앉기·까딱·식빵·배 보이기 zzz·안기기·어깨 위.
- **옷 30벌 = 모양 5종 × 고양이 색**: 방울·리본·모자·옷 4종은 모양 하나씩 + 고양이마다 색(24벌), ♥5 전용 세트 6벌만 따로 모양. 목록 그림은 `npm run thumbs` 방식.
- **네트워크 메시지를 늘리지 않음**
  | 무엇 | 어떻게 |
  |---|---|
  | 길고양이 배회 자리 | 기포처럼 서버 시각 씨앗으로 계산(모두 같은 자리, 전송 0) |
  | 내 고양이(광장) | 지금 내 상태(`myState`)에 `ct: { c: 종류, h: 하트, o: 옷 }`만, 바뀔 때만. 따라다니는 위치는 각 PC가 주인 위치로 계산 |
  | 탁구할 때 | 경기 시작 때 위 정보 한 번, 폴짝·귀 접힘은 각 PC가 득점 소식을 보고 알아서 |
  | 쓰다듬기 알림 | 광장 채널로 한 번(10초에 한 번까지), 서버 안 거침 |
- **규칙 한 파일** `src/games/cats/rules.js`(three 없음): 하트 단계·밥 간격(1시간)·단계별 옷. 서버 SQL·로컬 가짜 서버·자동 점검이 같이 씀.
- 밥은 `src/games/fishing/market.js cheapestIn(가방, 시각)` = 지금 시세가 가장 싼 생선.

## 서버 (3단계에서 `37_cats.sql` — 36은 선착장 1b가 씀)
- 표 `pingpong_cat(player_id, cat_id, pts, fed_at timestamptz, outfit jsonb)` (RLS 잠금).
- `pingpong_cat_feed(token, cat)`: 그 고양이가 마지막으로 먹은 지 1시간 지났는지 확인(서버 시각) → 가방(`pingpong_fish_bag`)에서 지금 가장 싼 것 하나 빼기(`pingpong__fish_price`) → 하트 점수 올림. 하트는 안 줄어듦.
- `pingpong_cat_list(token)` · `pingpong_cat_wear(token, cat, slot, on)` (하트 단계로만 열림, 상점 아이템 아님).
- 단짝(♥5) 처음 → 광장 알림.

## 만드는 순서 (14-8, 단계마다 새 대화 · 사용자 테스트)
| 단계 | 내용 | 먼저 읽을 것 |
|---|---|---|
| 2 | `cats.html` 시안: 털 무늬 2~3마리로 그림체 → 6마리, 동작 | 이 문서, `src/games/fishing/models.js`의 칠하기 함수, `fish-models.html` |
| 3a | 6마리 배회(서버 시각 씨앗, 모두 같은 자리) + '🐟 주기'(가장 싼 생선 자동) + 하트 점수 + `37_cats.sql` + 로컬 가짜 서버 + 점검 | 이 문서, `market.js`, `35_fish_bag.sql` |
| 3b | ♥1~♥2 행동: 다가와 다리에 비비기 · 낚시 옆에 앉아 리듬에 까딱 · Perfect '냥!' · 놓치면 귀 접힘 · 잡으면 툭툭 | 이 문서, 낚시 판정 이벤트 부분만 |
| 3c | 🐱 내 고양이 창(낚시 화면 오른쪽 위 '🍣 횟집' 옆): 하트 보기 · ♥1 🔔 방울 · ♥2 🎀 리본 입히기 | 이 문서, `fishing/shop.js`(창 모양 참고) |
| 4 | ♥3~♥5 따라오기·로그인 마중·어깨 위, 남에게 보이기 | 이 문서, `ui/plaza.js`의 `myState`·`cleanFi` 부근만 |
| 5 | 탁구할 때 고양이(14-5)·쓰다듬기·단짝 알림·옷 30벌 | 이 문서, 득점 이벤트 부분만 |
