# 코드 정리(리팩터링) 조사 결과 (11/26)

이 문서는 **조사만** 한 결과예요(아직 아무것도 안 고침). 고칠 때는 **항목 하나마다 새 대화**로 하고,
고친 뒤 `npm run check` → test 브랜치 → 사용자 테스트 순서로 해요. 끝난 항목은 표의 '진행'에 ✓ 표시.

**지킬 것(모든 항목 공통)**: 판정·물리 결과(`physics.js`·`match.js`), 네트워크 메시지 모양, 서버 SQL 규칙은 그대로 둬요.
게임이 **겉으로 똑같이** 동작해야 해요(정리는 속만 바꾸는 일).

전체 크기: `src` 자바스크립트 약 29,400줄 + `style.css` 1,379줄. 가장 긴 파일들(`outfits.js`·`hats.js`·`items.js`·`tables-*.js`)은
대부분 **아이템 모양 데이터**라서 길어도 괜찮아요. 정말 손볼 곳은 아래 목록이에요.

## 순서표 (안전하고 효과 큰 것부터)

| 순서 | 할 일 | 좋아지는 정도 | 고장 위험 | 크기 | 진행 |
|---|---|---|---|---|---|
| 1 | 안 쓰는 큰 파일 지우기 | 중간 | 거의 없음 | 아주 작음 | ✓ test |
| 2 | 안 쓰는 작은 코드 지우기 | 작음 | 거의 없음 | 작음 | ✓ test |
| 3 | 옛 관전 화면 카메라 지우기 | 중간 | 낮음 | 작음 | ✓ test |
| 4 | 반복되는 도우미 함수 한곳에 모으기 | 중간 | 낮음 | 중간 | ✓ test |
| 5 | 로컬 가짜 서버를 따로 떼기 | 중간 | 낮음 | 작음 | ✓ test |
| 6 | 안 쓰는 CSS(옛 화면 꾸밈) 지우기 | 중간 | 낮음~중간 | 중간 | ✓ test |
| 7 | 탁구채 모양을 `items.js`에서 떼기 | 중간 | 낮음~중간 | 중간 | |
| 8 | 헷갈리는 파일 이름 바꾸기 | 중간 | 낮음 | 중간 | |
| 9 | 옛 로비 카메라 정리 (`main.js`) | 중간 | 중간 | 중간 | |
| 10 | 광장 화면 파일(`ui/plaza.js`) 나누기 | 큼 | 중간 | 큼 | |
| 11 | (나중에) `game.js` 공 소식 처리 나누기 | 중간 | 중간~높음 | 큼 | |
| **12** | **광장 '콘텐츠 콘센트' 만들기**(낚시·고양이 연결 고리 하나로) — **10번보다 먼저 하기 추천** | 큼 | 중간 | 중간 | 12-1·12-2 ✓ test (11/27) |

---

## 1. 안 쓰는 큰 파일 지우기
- **무엇**: 맨 위 폴더의 `스매시-1v1-테스트.html`(약 800KB). 예전에 사용자에게 주려고 만든 한 파일짜리 게임이에요. 지금은 어디서도 안 쓰고, 옛 코드라 지금 게임과 달라요.
- **좋아지는 정도**: 저장소가 가벼워지고, "이게 진짜 게임인가?" 헷갈릴 일이 없어져요.
- **고장 위험**: 거의 없음(게임이 이 파일을 안 불러요). 필요하면 언제든 `npm run build`로 다시 만들 수 있어요.
- **크기**: 파일 하나 삭제.

## 2. 안 쓰는 작은 코드 지우기
만들어 놓고 아무 데서도 안 쓰는 것들이에요(검색으로 확인함).
- `src/breaks.js`: `BREAK_LABEL`, `breakBonus`
- `src/campusLayout.js`: `PIER_STAIRS` (옛 이름)
- `src/campusModels.js`: `preloadModels`
- `src/games/fishing/rules.js`: `stageOfCatch`
- `src/sets.js`: `SET`
- `src/ui/plazaBubble.js`: `bubbleOn`, `aiWaveOn`, `bubbleDebug`
- `src/game.js` 'shot' 처리 안: `if (mine) this.stats.rally = ev.rally;`는 바로 다음 줄에서 다시 덮어써져서 하는 일이 없어요(같은 블록의 `hud.hint('')`는 남겨야 해요).
- 덤: 파일 안에서만 쓰는데 `export`가 붙은 이름이 약 50개 있어요(예: `match.js`의 `WIN_SCORE`). 동작에는 문제가 없으니 **그대로 둬도 돼요**.
- **좋아지는 정도**: 작음(읽을 거리가 줄어요).
- **고장 위험**: 거의 없음. 지운 뒤 빌드가 되면 끝이에요.
- **크기**: 15줄 안팎.

## 3. 옛 관전 화면 카메라 지우기
- **한 일(11/26 ✓ test)**: `game.js`의 `view` 기본값을 `'free'`로, 관전 카메라는 `'me'`(관중석 1인칭)만 남김. `watchNear`·`view` 0/1/`'side'` 카메라, `scene.js`의 `updateSideCamera`·`SIDE_CAM` 지움(약 45줄). 거품 관전은 만들자마자 `view = 'free'`로 바꾸므로 겉모습은 그대로.
- **무엇**: 관전 화면을 없애고 '광장 경기장 거품'으로 바꿨는데, `game.js`에 옛 관전 카메라가 남아 있어요.
  지금 관전 시점은 `'free'`(걸어 다니며 보기)와 `'me'`(관중석에 앉기) 두 가지뿐이에요(`ui/plazaBubble.js`).
  - `game.js` update 안: `view === 'side'`(옆 중계)와 `view`가 0·1(A쪽/B쪽 어깨 뒤)인 카메라 부분, `watchNear`(그쪽 선수 반투명) 부분
  - `scene.js`: `updateSideCamera`와 `SIDE_CAM`(위 옆 중계에서만 씀)
  - `updateSeatCamera`·`setFirstPerson`은 **지금도 씀 → 남김**
- **좋아지는 정도**: 중간. 화면 쪽 코드에서 "이건 아직 쓰나?" 헷갈리는 곳이 줄어요.
- **고장 위험**: 낮음. 판정·물리와 상관없는 카메라예요. 거품 관전(걷기·앉기)만 확인하면 돼요.
- **크기**: 약 40줄.

## 4. 반복되는 도우미 함수 한곳에 모으기
똑같은 작은 함수가 여러 파일에 복사돼 있어요.
- `canvasTex`(그림판 → 3D 무늬): `arena-kit.js`, `outfits.js`, `items.js`, `scene.js`에 거의 같은 것 4개 + `table-kit.js`(저장해 두는 기능이 있는 다른 버전).
  ⚠️ 무늬 선명도(`anisotropy`)가 파일마다 4 또는 8로 달라요 → 모을 때 **원래 값을 그대로 넘겨야** 모양이 안 바뀌어요.
- `rng`(정해진 순서로 나오는 '가짜 무작위'): `physics.js`, `outfits.js`, `items.js`, `balls.js`에 **똑같은 계산**이 4개.
  ⚠️ `table-kit.js`의 `rng`는 **계산 방법이 달라서 합치면 안 돼요**(탁구대 무늬가 바뀜).
  ⚠️ `physics.js`의 것은 경기 판정에 쓰이니 **계산식을 한 글자도 바꾸지 말고** 옮기기만(또는 그대로 두기).
- `ease`(부드럽게 움직이기): 7곳. 두 종류(`t*t*(3-2t)`와 `1-(1-k)^3`)가 섞여 있어요 → 이름을 나눠서(예: `smoothstep`·`easeOut`) 모으기.
- 할 일: `src/util.js`(가칭) 하나를 만들어 모으고, 각 파일은 거기서 불러오기.
- **좋아지는 정도**: 중간. 나중에 고칠 때 한 곳만 고치면 돼요.
- **고장 위험**: 낮음(계산을 그대로 옮기면 결과가 같아요). `npm run thumbs`로 목록 그림을 다시 찍어서 **그림이 안 바뀌었는지** 비교하면 확실해요.
- **크기**: 약 10개 파일, 80줄 정도 줄어요.
- **한 일(11/26)**: `src/util.js`에 `rng`(mulberry32)·`seeded`(LCG)·`canvasTex(w, h, draw, anisotropy=4)`·`smoothstep`·`easeOut`.
  - `physics.js`·`outfits.js`·`items.js`·`balls.js`의 `rng` → util에서 불러옴(`physics.js`·`outfits.js`는 다른 파일이 쓰니 다시 내보냄).
  - `table-kit.js`의 `rng`는 `arena-kit.js`의 `seeded`와 **같은 계산**이라 둘 다 util의 `seeded`를 씀(mulberry32와는 안 합침).
  - `canvasTex`: `arena-kit.js`·`scene.js`는 선명도 8로 감싸서, `outfits.js`·`items.js`는 4(기본값). `table-kit.js`의 저장 기능 있는 버전은 그대로.
  - `ease`: `t*t*(3-2t)` 쓰던 곳(state·intro·main·plazaBubble·bubbleFx·bubble-page) → `smoothstep`, `1-(1-k)^3` 쓰던 곳(balls·gachaShow·tables-legend) → `easeOut`. 
    `arena-pets.js`(0~1로 자르는 버전)·`tables-rare.js`의 함수 안 `ease3`·`plaza.js`의 `easeInOut`은 모양이 달라 그대로.
  - 확인: 목록 그림 149개를 고치기 전/후 코드로 찍어 비교 → 145개 똑같음, 4개(불꽃 머리·오락실·케이크·카펫 탁구대)는 원래 코드도 찍을 때마다 달라지는 것(무작위·시간).

## 5. 로컬 가짜 서버를 따로 떼기
- **무엇**: `src/account.js`(912줄) 중 절반쯤(`localServer`·`localFish`·`localAch…`, 약 500줄)이 "서버 설정이 없을 때 쓰는 가짜 서버"예요.
  진짜 서버 부르기와 한 파일에 섞여 있어서 읽기 어려워요.
- 할 일: `src/localServer.js`로 옮기기만(내용은 그대로). CLAUDE.md의 "서버 규칙을 바꾸면 로컬 가짜 서버도" 안내에 새 파일 이름 적기.
- **좋아지는 정도**: 중간. 서버 규칙 고칠 때 찾기 쉬워요.
- **고장 위험**: 낮음(옮기기만). `npm run check`가 손님·로그인·상점을 로컬 서버로 돌려 봐요.
- **크기**: 파일 하나 새로, 내용 이동.
- **한 일(11/26 ✓ test)**: `account.js` 329줄부터 끝까지(`fishWeekStart`·`fishWeekTop`·`localFish`·`localAchPeople`·`localAchMatch`·`localServer`)를 `src/localServer.js`로 그대로 옮김(글자 비교로 `export` 한 단어만 다름). `account.js`는 323줄.
  가짜 서버가 쓰는 `store`·`validPin`·`AI_HITS_PER_COIN`·`AI_DAY_MAX`는 `account.js`에서 불러옴(서로 부르지만 함수 안에서만 써서 괜찮음). 문서·주석의 `account.js` 가짜 서버 → `localServer.js`. `npm run check` 모두 통과.

## 6. 안 쓰는 CSS(옛 화면 꾸밈) 지우기
- **무엇**: `src/style.css`에 이제 없는 화면의 꾸밈이 남아 있어요. 예: 옛 방 목록(`rl-…`), 옛 대기실(`room-…`, `slots`, `waiting-list`, `btn-start`, `btn-join`), 옛 관전 화면(`watch-…`, `spectating`, `spec-…`), 옛 로비 버튼(`lb-…`), 방 코드 입력(`code-boxes`, `ticket`) 등 약 55개 이름(대략 200줄).
- ⚠️ 코드에서 이름을 조립해서 쓰는 것은 **지우면 안 돼요**: `g-common/rare/legend`(등급 색), `lv1~3`(랠리 불꽃) 등. 지우기 전에 한 이름씩 검색하기.
- **좋아지는 정도**: 중간. CSS가 약 15% 가벼워지고 디자인 고칠 때 덜 헷갈려요.
- **고장 위험**: 낮음~중간(실수로 쓰는 걸 지우면 어떤 화면 모양이 깨질 수 있어요). 광장·꾸미기·랭킹·경기·뽑기 화면을 눈으로 확인.
- **크기**: 약 200줄 삭제.
- **한 일(11/26 ✓ test)**: `style.css` 1,379줄 → 1,174줄(약 205줄 삭제). CSS 이름을 모두 뽑아 `index.html`·`src/**/*.js`의 글자(문자열·class·id)에 한 번도 안 나오는 것만 지움:
  옛 로비 버튼(`lb-left`·`lb-play`·`lb-friends`·`lb-label`·`lb-to-plaza`·`#btn-join`·`mobile-note`), 옛 방 목록(`rl-…`·`rl`·`room-labels`), 옛 대기실(`room-…`·`slot`·`slots`·`vs`·`code`·`h2h`·`ticket`·`waiting-list`·`leave-pill`·`#btn-start`·`#btn-room-lobby`·`#room.leaving`·`.screen.stage`),
  방 코드 상자(`code-boxes`), 옛 관전(`watch-…`·`watching`·`spectating`·`spec-acts`·`wn-row`), 쉬는 시간 알약(`break-pill`·`room-break`), 그 밖에 `tiny`·`soon`·`center`·`glass`, 쓸 곳이 없어진 `@keyframes blink`·`breakGlow`, 주인 없는 설명 주석.
  여러 이름이 묶인 줄(예: 유리 한 장 공통)은 안 쓰는 이름만 뺌. 이름을 조립해서 쓰는 `g-common/rare/legend/default`·`lv1~3`은 남김.
  확인: 지우기 전/후 CSS로 로그인·가입·광장·업데이트·치는 방법·메뉴·PIN·랭킹·꾸미기·뽑기 탭을 PC·휴대폰 크기로 열어 **모든 요소의 꾸밈 값**을 비교 → 같음(알림 뜨는 타이밍·이모지 글자 폭 차이뿐).

## 7. 탁구채 모양을 `items.js`에서 떼기
- **무엇**: `src/items.js`(1,406줄)에 ① 아이템 목록 ② 탁구채 3D 모양(약 940줄) ③ 목록 그림 그리기가 같이 있어요.
  머리(`hats.js`)·몸(`outfits.js`)·공(`balls.js`)은 이미 따로 있는데 탁구채만 섞여 있어요.
- 할 일: 탁구채 모양(`PADDLE_MODELS`·`makePaddle`과 그 도우미)을 `src/paddles.js`로 옮기기(내용 그대로).
- **좋아지는 정도**: 중간. 아이템 목록을 고칠 때 1,400줄 대신 400줄만 보면 돼요.
- **고장 위험**: 낮음~중간(옮기는 양이 많음). `npm run thumbs` 그림 비교 + 꾸미기에서 탁구채 몇 개 보기.
- **크기**: 큰 덩어리 이동.

## 8. 헷갈리는 파일 이름 바꾸기
- `src/plaza.js`(광장 3D 그림)와 `src/ui/plaza.js`(광장 화면·채널) 이름이 같아요 → 예: `src/plazaView.js`.
- `src/campusMock.js`는 이름이 '시안(mock)'인데 **실제 광장**이 이걸로 만들어져요(`arena-plaza.js`가 불러씀) → 예: `src/campusBuild.js`.
- **좋아지는 정도**: 중간(새 대화의 Claude도 덜 헷갈려요).
- **고장 위험**: 낮음(불러오는 줄만 바꿈, 빌드가 틀리면 바로 알려 줌). 문서(CLAUDE.md·plaza.md)의 이름도 같이 고쳐야 해요.
- **크기**: 파일 이름 2개 + 불러오는 곳 약 15군데.

## 9. 옛 로비 카메라 정리 (`main.js`)
- **무엇**: `main.js`의 매 프레임 `loop` 안에 옛 로비(체육관에서 두 캐릭터가 랠리) 카메라 코드가 약 60줄 있어요.
  지금 메인 화면은 광장이라, 이 부분은 거의 **꾸미기에서 배경·탁구대·탁구공을 입어 볼 때**만 쓰여요.
  옛 로비가 흔들리며 보던 카메라(`LOBBY_CAM`)는 이제 거의 안 보이는 것 같아요(확인 필요).
- 할 일: 먼저 "이 부분이 언제 보이는지"를 확인하고, 꾸미기 입어 보기 카메라만 남겨 따로 함수(`dressCam` 등)로 빼기.
- **좋아지는 정도**: 중간. `loop`가 짧아져서 매 프레임 순서(`decideHit` → `match.update` → `game.update`)가 한눈에 보여요.
- **고장 위험**: 중간. 꾸미기 → 배경/탁구대/탁구공 입어 보기 → 얼굴 고르기(앞으로 도는 카메라)를 꼭 테스트.
- **크기**: 약 60줄 정리.

## 10. 광장 화면 파일(`ui/plaza.js`) 나누기
- **무엇**: 940줄 한 파일이 너무 많은 일을 해요: 광장 채널 연결 · 걷기 · 탁구대 자리·준비 · 모집 알림·초대 · 김제빵 부르기 · 패널 그리기 · 채팅 · 창(랭킹·꾸미기) 카메라 · 뽑기 기계 캡슐 연출.
- 할 일(덩어리 단위로, 한 번에 하나씩):
  - 뽑기 기계 캡슐 연출(파일 끝 약 85줄) → `ui/plazaGacha.js` — 가장 쉽고 다른 것과 덜 엮여 있음
  - 창 카메라(`WIN_CAM`·`windowFrame`, 약 60줄) → `ui/plazaWinCam.js`
  - 모집 알림·초대·김제빵 부르기(약 130줄) → `ui/plazaCall.js`
- ⚠️ 광장 상태(`pz`)를 여러 덩어리가 같이 쓰므로, 나눌 때 `ui/state.js`처럼 공용 자리에 두고 함께 써야 해요. 광장 메시지 모양은 **그대로**.
- **좋아지는 정도**: 큼. 앞으로 광장 기능(⑥ 등)을 넣을 때 고칠 곳이 금방 보여요.
- **고장 위험**: 중간. 광장 1대1(탭 두 개)·모집 알림·초대·김제빵·뽑기·랭킹/꾸미기 창을 모두 테스트해야 해요.
- **크기**: 큼(덩어리 3개, 대화 2~3번으로 나눠서).

## 11. (나중에) `game.js` 공 소식 처리 나누기
- **무엇**: `game.js`의 `onEvent`(약 160줄, 서브·토스·샷·실수·득점 등을 한 곳에서)와 `update`(약 135줄)가 길어요.
  특히 'shot' 처리 한 덩어리가 60줄이에요.
- 할 일: 처리마다 작은 함수로 나누기(`onShot` 등). 내용 순서는 그대로.
- **고장 위험**: 중간~높음. 판정·예측과 바로 붙어 있어서, 순서가 한 줄만 바뀌어도 늦은 스윙·예측 취소가 달라질 수 있어요.
- **추천**: 지금은 **하지 않기**. 경기 쪽을 크게 고칠 일이 생기면 그때 같이.

---

## 12. 광장 '콘텐츠 콘센트' 만들기 (계획 11/27, 사용자와 정함)

**왜**: 앞으로 낚시 같은 콘텐츠를 더 붙일 계획이에요. 사용자와 정한 방향은 "전체를 다시 만들지 말고, 지금 방식(콘텐츠마다 `src/games/<게임>/` 폴더)을 유지하면서 광장에 꽂는 자리만 하나로 정리"예요.
지금은 광장(`ui/plaza.js`)에 `fishHooks`·`catHooks`가 **따로** 있어서, 콘텐츠 하나를 붙일 때마다 광장 코드 여러 곳(아래 표)을 고쳐야 해요.

**목표**: 새 콘텐츠는 **자기 폴더 안에서 `registerAddon({...})` 한 번**으로 광장에 붙고, 광장 코드는 콘텐츠 이름(낚시·고양이)을 몰라도 되게.

### 지금 광장이 콘텐츠를 부르는 곳 (조사 11/27)
| 광장(`ui/plaza.js`) 쪽 | 지금 | 콘센트에서는 |
|---|---|---|
| `myState()`의 `fi`·`ct` | `fishHooks.state()`·`catHooks.state()` | 콘텐츠마다 `key`('fi'·'ct')와 `state()` → 광장이 돌면서 채움 |
| 받은 상태 정리 (`cleanFi`, `catHooks.clean`) | `cleanFi`가 **광장 파일 안**에 있음 | `clean(v)` — 낚시 쪽으로 옮김 |
| `m.k === 'fish'` 메시지 | `fishHooks.onMsg` | 콘텐츠마다 `msgKind`('fish')와 `onMsg(m, 사람)` |
| 채팅 받기 | `fishHooks.onSay` | `onSay(사람, 글)` (모두에게) |
| 눌린 곳 `fishBoard`·`market` (`onSpot`) | `if (sp.id === ...)` | 콘텐츠마다 `spots: { fishBoard(sp, at, 도우미), market(...) }` |
| 입력 막기·내 캐릭터 숨기기 | `fishHooks.on()` | `takesOver()` — 하나라도 true면 광장 걷기 멈춤·내 캐릭터 숨김 |
| 다른 사람이 바다 보기 (`figOf`의 `p.fi`) | 광장이 직접 앎 | `face(p)` — 방향을 돌려주면 그쪽을 봄 |
| 매 프레임 | `catHooks.frame`·`fishHooks.frame` (이 순서) | `frame(now, 내 자리, 걷는 중)` — **등록 순서 = 부르는 순서**(고양이 먼저 그대로) |
| 광장이 안 보일 때 | `fishHooks.hidden`·`catHooks.hidden` | `hidden()` |
| 콘텐츠끼리 | 고양이가 `fishHooks.spot()`·낚시가 `catHooks.fishEvent()` | `addon('fishing')?.spot?.()` 처럼 이름으로 찾아 부름 |

### 할 일 (대화 2번)
- **12-1 콘센트 + 낚시 옮기기**
  - **한 일(11/27 ✓ test)**: `src/ui/plazaAddons.js` 만듦(`registerAddon`·`addons`·`addon`·`plazaApi`, 넣을 수 있는 것 설명은 파일 맨 위). 광장은 등록된 콘텐츠를 돌면서 부름(`addonStates`·`addonCleans`·`addonBusy`·`addonFace`, 눌린 곳은 `spots`가 먼저). 게시판 앞으로 걸어가기는 `walkNear`·`boardNote`로 묶어서 광장 게시판·낚시 게시판·횟집이 같이 씀. 낚시는 `ui/fishing.js` 맨 아래 `registerAddon({ id: 'fishing', key: 'fi', msgKind: 'fish', ... })` 하나. `fishHooks`는 없앰. 고양이는 `addon('fishing')?.spot?.()`으로 낚시 자리를 찾음(고양이 자신은 아직 `catHooks`, 12-2에서). 메시지 모양(`fi`·`k:'fish'`)·부르는 순서(고양이 → 낚시) 그대로.
  - 확인: 빌드 · `check.cjs --no-browser` · 전체 점검의 '광장(탭 두 개)' 단계(낚시 시작·상대 화면에 찌·잡기·그만하기·게시판 포함) 통과 · 따로 게시판 종이 누르기 → 걸어가서 열림, 횟집 누르기 → 안내, 다른 사람 낚시 중 바다 쪽 보기, 오류 0.
  - 새 파일 `src/ui/plazaAddons.js`: `registerAddon(def)`·`addons()`(등록 순서 목록)·`addon(id)`. 광장 정보 `plazaApi`도 여기로 옮겨서 콘텐츠가 `ui/plaza.js`를 직접 불러오지 않게(서로 불러오기 꼬임 방지). `plaza.js`가 시작할 때 `plazaApi`를 채움.
  - `ui/plaza.js`: 위 표의 곳을 "`addons()` 돌면서 부르기"로 바꿈. `cleanFi`는 낚시로.
  - `ui/fishing.js`: `fishHooks.xxx = ` → `registerAddon({ id: 'fishing', key: 'fi', msgKind: 'fish', spots: {...}, ... })`.
- **12-2 고양이 옮기기 + 안내 쓰기**
  - **한 일(11/27 ✓ test)**: `games/cats/plazaCats.js` 맨 아래 쪽 `registerAddon({ id: 'cats', order: -1, key: 'ct', ... })`. `catHooks` 없앰 → 광장(`ui/plaza.js`)에 낚시·고양이 이름이 하나도 없음. 낚시가 고양이에게 알리는 것은 `addon('cats')?.fishEvent?.(ev)`. 콘센트에 `order`(작을수록 먼저)를 더해서 고양이 → 낚시 프레임 순서를 파일 불러오는 순서와 상관없이 지킴. 메시지 칸 `ct` 그대로.
  - `games/cats/plazaCats.js`: `catHooks` → `registerAddon({ id: 'cats', key: 'ct', ... })`. 낚시 자리는 `addon('fishing')?.spot?.()`.
  - `fishHooks`·`catHooks` 이름을 없앰(검색해서 0개 확인).
  - 이 문서 끝에 **"새 콘텐츠 붙이는 법" 체크리스트**(폴더 만들기 · `registerAddon` · `main.js`에서 불러오기 · 광장 3D 건물은 `campusLayout.js` · 서버 SQL 번호 · 문서 `docs/dev/<게임>.md`)를 쓰고, `CLAUDE.md` 지도에 한 줄.

### 지킬 것
- **광장 메시지 모양 그대로**: `st` 메시지의 `fi`·`ct` 이름, `k: 'fish'` 메시지. (test·main 사람이 섞여 있어도 서로 보여야 함)
- 프레임마다 부르는 순서 그대로(고양이 → 낚시). 겉모습·동작이 **똑같아야** 함.
- 디버그 훅(`window.__smash.plaza`, `catsDebug` 등) 이름은 유지.

### 확인할 것 (화면은 바꾼 곳만 Playwright로 짧게)
- 빌드 + `node scripts/check.cjs --no-browser`(SQL은 안 바뀌지만 빌드 확인용).
- 탭 두 개: A가 낚시 시작 → B 화면에서 A가 바다 보며 낚싯대 든 모습·잡았을 때 알림·채팅.
- 낚시 게시판 3칸·횟집 문 눌러서 걸어가 열리기.
- 낚시 중 걷기 막힘·끝나면 다시 걷기. 고양이 따라오기·낚시할 때 옆에 앉기·밥 주기.
- 랭킹·꾸미기 창 열 때(광장 안 보일 때) 낚시가 멈추는지.
- 광장 탁구대 1대1이 그대로 되는지(광장 코드를 건드리므로).

### 🧩 새 콘텐츠 붙이는 법 (체크리스트, 12번으로 생김)
낚시(`ui/fishing.js`)·고양이(`games/cats/plazaCats.js`)가 본보기예요.
1. **문서** `docs/dev/<게임>.md` 하나 — 기획·정한 것·진행. `CLAUDE.md` 지도 표에 한 줄.
2. **폴더** `src/games/<게임>/` — 규칙·모형·화면. 서버와 같아야 하는 규칙은 `rules.js`처럼 three 없이 한 파일에(자동 점검이 Node에서 불러 서버와 비교).
3. **광장에 꽂기**: 그 게임의 광장 연결 파일(작으면 `games/<게임>/plaza<게임>.js`, 크면 `ui/<게임>.js`) 맨 아래 `registerAddon({...})` 한 번 (`src/ui/plazaAddons.js` 맨 위 설명).
   - 광장 기능은 `plazaApi`로(걷기 `walkTo`·`walkNear`, 3D `view`, 메시지 `send`·`sendInfo`, 사람들 `people()`). **`ui/plaza.js`를 직접 불러오지 않기.**
   - 다른 사람에게 보일 내 상태는 `key`+`state()`+`clean()` — 칸 이름은 짧게(2글자), 다른 콘텐츠와 겹치지 않게, 한 번 정하면 안 바꿈. 자주 바뀌는 것은 `state`에 넣지 말고 바뀔 때만 `plazaApi.sendInfo()`.
   - 한 번씩 알릴 일은 `msgKind` 메시지(`plazaApi.send({ k: msgKind, ... })`). 받는 쪽은 `onMsg`에서 너무 잦은 것은 무시.
   - 콘텐츠끼리는 `addon('<id>')?.함수?.()` (없어도 안 깨지게 `?.`).
4. **`main.js` 맨 위에서 불러오기**(불러올 때 등록됨). 디버그 훅은 `window.__smash.<게임>`.
5. **광장 3D 건물·자리**: 자리 숫자는 `src/campusLayout.js`, 그리기는 `src/arena-plaza.js`. 누를 수 있는 곳은 `arena-plaza.js`의 `spots`에 `{ id, ... }`를 넣고 `registerAddon`의 `spots: { <id>: (sp, at) => ... }`로 받기.
6. **서버**: 새 SQL `supabase/NN_...sql`(`pingpong_` 접두어, RLS, security definer) + `docs/dev/sql-to-run.md` + **로컬 가짜 서버** `src/localServer.js`도 같은 규칙. 코인·기록은 서버가 계산.
7. **점검**: `scripts/check.cjs`에 서버 규칙·화면 점검 추가, test에 올릴 때 `docs/dev/test-checklist.md`에 추가.

### 10번(광장 파일 나누기)과의 관계
12번을 먼저 하면 광장 파일에서 낚시·고양이 이야기가 빠져서 10번이 더 쉬워져요. 10번은 그 뒤에 원래 계획대로.

---

## 손대지 않아도 되는 것 (조사해 보니 괜찮음)
- **아이템 모양 데이터**(`outfits.js`·`hats.js`·`faces.js`·`balls.js`·`tables-*.js`·`arena-*.js`): 길지만 아이템 하나 = 함수 하나로 잘 나뉘어 있어요. 문제는 4번(도우미 함수 복사)뿐이에요.
- **`physics.js`·`match.js`**: 짧고 깔끔해요. 판정이 바뀔 위험 때문에 정리하지 않아요.
- **`net.js`**: 길지만(`makeP2P` 165줄) 연결 단계 순서대로 적혀 있어요. 연결 문제는 테스트가 어려워서 그대로 두는 게 좋아요.
- **낚시(`games/fishing/session.js`의 `createFishing` 약 590줄)**: 길지만 지금 한창 만드는 중이라 정리는 낚시가 끝난 뒤에.
- **시안 페이지들**(`*.html` + `*-page.js`): 디자인 고를 때 쓰고 `npm run check`도 확인하니 남겨요.
- `console.log`·`TODO` 같은 흔적은 없어요.
