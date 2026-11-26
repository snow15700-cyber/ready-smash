# 게임 최적화·정리 목록

이 문서는 **조사만** 한 결과예요(아직 아무것도 안 고침). 고칠 때는 **항목 하나(또는 한 묶음)마다 새 대화**로 하고,
고친 뒤 바꾼 부분만 Playwright로 짧게 확인 → test 브랜치 → 사용자 테스트 순서로 해요. 끝난 항목은 표의 '진행'에 ✓ 표시.
(앞서 한 전체 코드 정리는 `docs/dev/cleanup.md` — 이 문서는 그다음 조사분)

**지킬 것(모든 항목 공통)**: 판정·물리, 네트워크 메시지 모양, 서버 SQL 규칙(`rules.js`·`market.js`의 계산식)은 그대로 둬요.
게임이 **겉으로 똑같이** 동작해야 해요. 겉모습이 바뀌는 항목(D)은 사용자에게 먼저 확인해요.

---

## 낚시 (11/26 조사)

조사한 범위: `src/games/fishing/*`(16개 파일, 약 3,000줄), `src/ui/fishing.js`, `src/account.js`의 낚시 함수, `src/ui/plaza.js`의 `fishHooks`.
고양이(`src/games/cats/`)는 빼고 봤어요(`docs/dev/cats.md`).

### 순서표

| 순서 | 할 일 | 좋아지는 정도 | 고장 위험 | 진행 |
|---|---|---|---|---|
| 1 | A 물고기 모형 메모리 쌓임 + B 채팅 매 프레임 + C 꺼진 소리 | 큼 | 낮음 | |
| 2 | 안 쓰는 것 지우기 + 꼬인 곳 정리 (아래 2·3장) | 작음~중간 | 거의 없음 | |
| 3 | D 도장 페이드인 (겉모습이 바뀜 → 사용자 확인 먼저) | 작음 | 거의 없음 | |

### 1장. 실제로 손해가 나는 곳

**A. 잡을 때마다 3D 물고기를 새로 만들고 안 치움** — 가장 중요
- `session.js`
  - `startRhythm()`: 단계마다 `makeShadowFish()`로 검은 그림자 물고기를 새로 만듦(`makeFishModel` + 새 `MeshStandardMaterial`). 이전 것은 `scene.remove`만 하고 `dispose` 안 함.
  - `startLand()`: `makeModel(c.id)`로 진짜 물고기를 새로 만듦. `models.js`의 `bodyTex`가 512×256 캔버스 무늬를 매번 새로 만듦. 탁구채면 `makePaddle`.
  - `toReady()`: `scene.remove(S.model)`만.
- 결과: 한 마리마다 모형·무늬·재료가 GPU 메모리에 남음 → 오래 낚시하면 휴대폰이 무거워짐.
- 고칠 방법(둘 중 하나):
  - 치울 때 `traverse`로 geometry·material·texture를 `dispose`. 단, `models.js`의 공용 재료(`TOON` 그라데이션, `OUTLINE` 셰이더 등)와 `world.js`의 공용 것은 dispose하면 안 됨 → 공용인지 구분 필요.
  - 또는 그림자 물고기는 한 번만 만들어 다시 쓰고(크기·보이기만 바꿈), 진짜 물고기는 id별로 한 번 만든 걸 모아 두고 다시 씀(종류가 26개 + 탁구채 7개뿐).
- 확인: 낚시를 여러 번(`window.__smash` 또는 시안의 `__fish.catchNow()`) 한 뒤 `renderer.info.memory`(geometries·textures 수)가 계속 늘지 않는지.

**B. 화면 옆 채팅을 매 프레임 다시 그림**
- `ui/fishing.js`: `fishHooks.frame` 끝의 `if (chat.length) renderChat();` → 채팅이 한 번이라도 오면, 글자가 다 사라진 뒤에도 매 프레임 `innerHTML`을 새로 만듦(`chat` 배열에서 지난 줄을 안 지움).
- 고칠 방법: 오래된 줄은 배열에서 지우고, 내용이 바뀔 때(새 말·사라질 때) 또는 0.5초에 한 번만 그리기. 투명도(서서히 사라짐)는 CSS `transition`이 이미 있음.

**C. 소리 안 나는 '줄 끼이익'이 계속 돎**
- `sound.js`: `initSound()`가 톱니파 오실레이터 + 필터(`whine`)를 켜 두고, `tickSound(t, tension)`이 매 프레임 크기·높이를 바꿈. 그런데 `session.js`가 늘 `tickSound(S.now, 0)`(장력 0)으로 불러서 **소리는 한 번도 안 남**. 광장으로 돌아와도 계속 돎.
- 고칠 방법: `whine`을 지우고 `tickSound`는 파도 소리만. (파도 소리 `sea`는 씀 — 그대로)
- 덤: 낚시 소리는 `audio.js`와 다른 AudioContext를 따로 만듦. 지금은 문제없지만, 나중에 휴대폰 소리 문제가 생기면 하나로 합치는 걸 생각해 볼 것(이번엔 안 함).

**D. 도장 '쾅' 페이드인이 주석 안에 들어가 있음** — 겉모습이 바뀜, 사용자 확인 먼저
- `hud.js`의 도장 그리기(`if (S.stamp && S.mode === 'land')`) 첫 줄 끝: `// 물고기(위쪽)를 안 가리게 아래로 g.globalAlpha = Math.min(1, k * 8);`
  → `g.globalAlpha = ...`가 주석 안이라 실행 안 됨. 주석 밖으로 빼면 도장이 0.12초 동안 서서히 진해짐.

### 2장. 꼬인 곳 (같은 일을 여러 곳에서)

- **"싸우는 중인가" 확인 4번**: `ui/fishing.js`에 `F && !(F.S.mode === 'ready' || F.S.mode === 'result')`(또는 반대)가 도감·횟집·고양이 버튼, `fishHooks.openMarket`에 따로 있음. `session.js`가 이미 `busy()`를 돌려줌 → `F?.busy()`로.
- **횟집 여는 코드 두 벌**: `ui/fishing.js`의 `$('fish-shop')` 클릭 처리와 `fishHooks.openMarket`(둘 다 `shopMod ||= import(...)` + `openShop({ onSold })`) → 함수 하나로.
- **들여오는 길이 여러 개**:
  - `bubbles.js`는 `rules.js`를 그대로 다시 내보내는 7줄짜리 → 지우고 `session.js`가 `rules.js`에서 바로 불러오기(`ui/fishing.js`는 이미 그렇게 함).
  - `world.js`가 `rules.js`의 `STAND`·`CAST_MIN`·`CAST_MAX`·`CAST_ANG`·`castDist`·`landingPoint`와 `campusLayout.js`의 `PIER`·`SEA_Y`를 다시 내보냄. `session.js`·`hud.js`·`page.js`가 이걸 `world.js`에서 가져감 → 원래 파일에서 바로 불러오게. (`world.js`는 3D 만들기만)
  - `data.js`도 `rules.js`의 것들을 다시 내보냄(`BIG_CM`, `COND`, `JUNK`, `LEGEND_PADDLES`, `PADDLE_DUP_PIECES`, `SPECIES`, `fishSize`) → 쓰는 쪽이 `rules.js`에서 바로.
- **`seeded`가 두 벌**: `rules.js`의 `seeded`와 `src/util.js`의 `seeded`가 **계산식이 완전히 같음**(LCG 1664525·1013904223). `rules.js`는 `export { seeded } from '../../util.js'`로 바꾸기(`market.js`·`localServer.js`·점검 스크립트가 `rules.js`에서 가져갈 수 있으니 이름은 남김). ⚠️ 점검(`scripts/check.cjs`)이 Node에서 `rules.js`를 부르므로 `util.js`도 three·DOM 없이 불러와지는지 확인(`canvasTex`는 부를 때만 `document`를 씀 → 괜찮을 것).
- **밤 계산 두 곳**: `session.js`의 `catchCtx()`가 한국 시각 19~6시를 직접 계산. `rules.js`의 `isNight(ms)`를 쓰기.
- **점검용 `dbg`** (`session.js` `createFishing` 안): 한 줄이 아주 길고, `landNow`·`catchNow`·`fightNow`에 같은 가짜 리듬 결과(`{ perfects: 6, hits: 6, ... }`)가 반복 → 작은 함수 하나로. (점검 스크립트가 `__fish.catchNow()` 등을 쓰니 이름은 그대로)

### 3장. 안 쓰는 것 (검색으로 확인함)

- `sound.js`의 `snd` 중 안 쓰는 10개: `plunge`, `popUp`, `beat`, `noteHit`, `shatter`, `patience`, `reel`, `drag`, `pump`, `snap`
- `world.js`: 맨 위 재료 `wood`, `woodDark`, `rope`(선착장이 `campusPier.js`로 옮겨 가며 남음). '던지는 자리' 설명 주석 두 줄도 갈 곳 없이 남아 있음(`makeBobber` 위).
- `rules.js`: `standZ`(아무도 안 씀), `sizeK`와 크기 결과의 `k` 값(아무도 안 읽음 — `fishSize`, `session.js`의 `adoptServer`·`rollSize`가 만들기만 함). `rules.js`는 서버와 같아야 하는 파일이지만 이 둘은 서버 계산과 상관없음.
- `data.js`의 `FISH` 3종에 남은 옛 시안 값: `size: [..]`, `id`, `name`, `emoji`. 지금 쓰는 건 `grade`·`bpm`·`secs`·`missOut`(리듬)과 `body`·`belly`·`stripe`·`ball`(그림자 물고기 `makeFishModel`)뿐. ⚠️ 지우기 전에 `fishing.html`·`page.js`에서 안 쓰는지 한 번 더 검색.
- `session.js`: `zoomOnNow`(= `zoomOn`을 한 번 더 감쌈) → 돌려줄 때 `zoomOn: zoomOn`.
- `ui/fishing.js`: `F.camFov0 = ...`(넣기만 하고 읽는 곳 없음), 알림 문구 `${n.name ? '을(를)' : '을(를)'}`(두 갈래가 같음).

### 작은 것 (이번엔 안 해도 됨)

- `activeBubbles()`를 매 프레임 부르면서(낚시 화면 + 낚시터 기포 `pierBubbles`) 기포 자리 계산을 매번 새로 함. 칸(114초)마다 한 번 계산해 두면 되지만 계산이 가벼워서 효과는 작음.
- 낚시 화면(`session.js`)과 낚시터 기포(`ui/fishing.js` `pierBubbles`)가 물보라·방울 묶음(`makeSplashes`·`makeBubbleFx`)을 하나씩 따로 만듦(안 보이는 메시 약 170개씩). 하나를 같이 쓸 수 있음.
- 도감 그림(`dex.js` `modelImage`)이 WebGL 화면을 하나 더 만듦(처음 도감·결과 카드 때). 그림은 모아 둬서 괜찮음.
- `hud.js`가 매 프레임 `new THREE.Vector3`를 몇 개 만듦(기포 표시·'!'). 아주 작음.
- 낚시터 구역 판단이 두 가지: `inPierZone`(기포, `PIER`·`STAIRS` 숫자)과 `rodZone`(낚싯대, `stairAt`·`PLAZA.onPier`). 지금 동작은 맞음, 나중에 선착장 모양을 바꾸면 둘 다 고쳐야 함.
