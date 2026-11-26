# 준비하시고, 스매시! — 개발 안내 (Claude용)

교육생(10~20명)이 쉬는 시간에 하는 웹 3D 탁구 게임. 기획은 `docs/기획서.md`(필요한 장만 읽기).

## 사용자와 일하는 방식
- 사용자는 코딩을 잘 모름. **한국어로, 쉬운 말로** 설명하고 실행·테스트 방법은 단계별로 안내.
- 큰 기능은 단계별로 나눠서 만들고, **단계마다 멈추고 사용자가 테스트**하게 한다.
- 디자인·조작 결정은 사용자가 내린다. 여러 안이 있으면 스크린샷을 찍어 고르게 한다.
- 기획서와 사용자의 의도가 다를 수 있으니, 애매하면 만들기 전에 확인한다.
- **'사용자 확정'이라고 적힌 것은 바꾸기 전에 사용자에게 확인.**
- **새 게임(낚시 등)은 같은 프로젝트에서**(로그인·코인·업적·광장·서버를 같이 씀). 코드는 `src/games/<게임>/` 폴더, 문서는 `docs/dev/<게임>.md` 하나씩. 그 게임 작업 때는 그 폴더·문서와 광장 연결 부분만 읽는다.
- **기능 하나마다 새 대화**로 시작하길 권한다(대화가 길수록 사용량이 커짐). 정한 것·진행 상황은 주제 문서에 적어 두어 새 대화가 이어받게. 같은 기능을 두 대화에서 동시에 고치지 않는다. 스크린샷은 고르기·중요 확인 때만.

## 상세 문서 지도 (작업 주제에 맞는 파일만 먼저 읽는다)
이 파일은 대화마다 통째로 읽히므로 짧게 유지한다. 새로 정해진 것·구현 메모는 아래 주제 파일에 적고, 여기에는 한 줄 상태만.

| 주제 | 파일 | 상태 |
|---|---|---|
| 경기 규칙·조작·판정·찬스볼·몰입 연출·**동기화 규칙** | `docs/dev/gameplay.md` | main (와이파이 느림 대비·찬스볼 물결 잔상(정점까지) 포함) / WebRTC 측정 페이지 `rtc-test.html`·**선수끼리 WebRTC 직접 연결**(①~③)·**서울 중계(TURN)** test(Vercel 환경 변수 필요) |
| 2v2·혼자 하기(AI)·모바일·링크 미리보기·**관전 모드(기획·단계)** | `docs/dev/modes.md` | main (관전 ①~⑤) / test: 광장으로 방 목록·방 코드·비공개 방·대기실 관전·관전 화면 없앰(관전 = 광장 경기장 거품) |
| PIN 계정·전적·랭킹·코인·경기 확인·**보안(18·32)**·업적·칭호·**쉬는 시간 보너스(19)** | `docs/dev/accounts.md` | main (SQL 01~21 실행 완료) — 쉬는 시간 보너스·오늘의 미션 포함 / 출석 도장판 아직 / 혼자 하기 3번에 1코인 main(26 실행 완료) / 김제빵 낀 2대2 전적 제외 test(**27 실행 필요**) / **공정한 결과**(혼자 하기 하루 250·1대1 서로 맞아야 승리) test(**32 실행 필요**, 33은 main 합친 뒤) |
| 상점·꾸미기 공통, 탁구채(전설 포함)·몸·목록 그림·**머리·얼굴·세트(기획)**·**뽑기 연출** | `docs/dev/shop.md` | main / 머리 28·얼굴 16·세트 11 test(**24 실행 필요**) / 뽑기 연출(탁구공 깨기)·**무료 뽑기 50회**(25 실행 필요, 로비 배너 `src/ui/freeGacha.js`) test |
| 탁구공 | `docs/dev/balls.md` | main |
| 탁구대(일반 6·고급 7·전설 5) | `docs/dev/tables.md` | 게임·뽑기 연결 test(22 실행 필요) |
| 배경(경기장)·배경 합치기(성능) | `docs/dev/arenas.md` | main (일반 배경 3종 포함, 20 실행 완료) |
| **광장 로비**(걷는 3D 메인 화면·탁구대 4대·김제빵 탁구대·모집 알림·정해진 채팅) | `docs/dev/plaza.md` | 기획 확정(11/23) — ① 광장 기본 + 가게 건물 + 시간·날씨 test, **②~⑤ test**(탁구대 경기·김제빵·광장 관전·모집 알림·초대·김제빵 부르기, 옛 로비·대기실 없앰, **27 실행 필요**), **경기장 거품 test**(18장: 원 안 = 그 경기장으로·걸어 다니며 관전·실내 배경은 벽까지, 관전 화면 없앰), ⑥ 아직. **화면 전환 매끄럽게(19장): ⓐ 랭킹·꾸미기 창 뒤 광장 + 카메라 이어가기 · ⓐ' 로그인 화면 = 광장 · ⓑ 경기 시작·끝 물결 · ⓒ 뽑기 기계 캡슐 · ⓓ 김제빵 물결 test** · **광장 새 디자인 '경주캠퍼스 느낌'(20장) — 시안 `campus.html` + 실제 광장 ① 모습 옮김 · ② 기능(시계탑·게시판·전광판·빵집·전망대 데크) test** |
| **낚시**(광장 바다 선착장·톡톡/가짜 풍덩/진짜 풍덩 타이밍 링·큰 물고기 랠리·도감·코인) | `docs/dev/fishing.md` | 기획 확정(11/25) — **리듬 방식 손맛 시안 `fishing.html` test**(8장: 3방향 + 세기 3단계·모두가 같은 기포·막대찌 + 확대 창·'!' 챔질·가운데 원 리듬 노트) + 리듬·손맛 더하기·등급 숨기기·자유 던지기 test · **손맛 길게(시간 기준 6·7.8·9.6초)·Perfect 연출·박자 두근·단계 확대·기울기 카메라** test · **2단계** 물고기 17종·잡동사니 9개 모형(그림체 A, `fish-models.html`)·도감·1% 전설 탁구채 test · **3단계 서버**(코인·도감·업적 7개·월척 랭킹, **28 실행 필요**) test · 크기 최대 없음 + 긴 꼬리·큰 놈 연출(**29 실행 필요**) test · **크기 = 보통 크기 × 배율 + 행운 주사위**(13장, **34 실행 필요**) test · **14장 가방·횟집·ㄷ자 선착장(35·36) · 🐱 고양이(`cats.md`) 3a 배회·밥 주기·하트 · 3b ♥1·♥2 행동 test(**37 실행 필요**)** · **4단계 광장에 넣기 ①~⑤**(+ ⑦ 시작·그만 카메라 이어가기)(전망대 밑 선착장·계단, 판 위 '🎣 낚시하기', 다른 사람 모습·알림·전광판 월척·도감, 휴대폰, 12장, **30 실행 필요**) test · **14장 고양이 친구·넓은 선착장·횟집 시세표(기획 확정 11/26)** — 1a 가방·횟집·시세 test(**35 실행 필요**) · **1b 'ㄷ자' 넓은 선착장**(양 팔·등대·항구 배·횟집 건물·진짜 시세 칠판·고양이 쉼터) test(**36 실행 필요**), 고양이 설계·진행은 `docs/dev/cats.md` · 낚싯대 꾸미기·어탁 카드(나중) |
| **코드 정리(리팩터링)** 조사 결과·순서표 | `docs/dev/cleanup.md` | 조사만 끝(11/26), 1번부터 한 항목씩 새 대화로 |
| **한 번에 테스트할 목록**(사용자가 나중에 몰아서 테스트) | `docs/dev/test-checklist.md` | test에 올릴 때마다 추가 |
| 화면 디자인(**새 디자인 '탁구 색 + 유리'**: ①~⑤ 모든 화면)·대기실 무대·VS 소개·**업데이트 내역**(`src/updates.js`, main에 합칠 때마다 추가)·**광장 메뉴 정리** | `docs/dev/design.md` | 새 디자인 test / 광장 메뉴 정리(11/25) test |

아직 안 한 것(기획서 8장): 궤적 아이템, 출석·미션, 사운드 스킨, 승리 세리머니. 최적화 ①~⑤ 모두 끝(남은 보안 — 계정 두 개로 승수 쌓기, 가입 제한 — 은 사용자가 이번엔 안 하기로).
다음 할 일 순서(11/18 사용자와 정함, 운영은 1월 말까지, 1대1을 가장 많이 함, 코인은 모자란 편): ⓪ 정리(문서 상태 표시 ✓, `main.js` 나누기 ✓) → ① 쉬는 시간 보너스 ✓(test) · 출석·미션(코인 벌 곳) → ② 승리 세리머니 → ③ 머리·궤적·탁구대 아이템 등 컨텐츠.
**11/25 사용자 변경: 출석 도장판·승리 세리머니는 잠깐 보류, 낚시(`docs/dev/fishing.md`)를 먼저.**

## 어디서나 지킬 규칙
- 매 프레임 순서 `game.decideHit` → `match.update` → `game.update`(느린 PC에서 늦은 스윙이 버려지지 않게). 판정·물리는 결정론적(같은 입력 → 같은 결과).
- 꾸미기 아이템은 **보기만 다름**(판정·네트워크 메시지 그대로).
- 서버 SQL: 새 파일 `37_...sql`로 추가(사용자가 SQL Editor에서 직접 실행, 여러 번 실행해도 되게), 실행할 목록은 `docs/dev/sql-to-run.md`에 적어 둠). 테이블·함수는 `pingpong_` 접두어(Supabase를 다른 게임과 공유). 표는 RLS로 잠그고 security definer 함수만 anon에. 로컬 PostgreSQL 16으로 01부터 차례로 먼저 시험(`service postgresql start`, `extensions` 스키마·`anon` 역할을 만들어 흉내).
- 서버 규칙을 바꾸면 **로컬 가짜 서버**(`src/localServer.js`, 설정 없을 때 `account.js`의 `call`이 부름)도 같은 규칙으로.
- 아이템 목록은 두 곳: `src/items.js`와 SQL insert. 아이템을 추가·수정하면 **`npm run thumbs`**로 목록 그림 다시 찍기.
- 브라우저가 보낸 숫자는 믿지 않는다(코인·전적·기록은 서버가 계산하거나 상한을 둔다).

## 구조
- `src/physics.js` 공 궤적(해석적 세그먼트), 판정 범위, 샷 계획. 결정론적(같은 입력 → 같은 결과).
- `src/util.js` 같이 쓰는 도우미(`rng`·`seeded`·`canvasTex`·`smoothstep`·`easeOut`). 새로 복사하지 말고 여기서 불러오기(계산식은 바꾸지 않기).
- `src/match.js` 경기 기준 로직(방장/혼자 모드에서만 실행). `computeShot`은 방장과 상대 PC가 같이 쓴다.
- `src/game.js` 화면 쪽: 이벤트를 받아 공·캐릭터·링·소리 처리, 내 입력 판정, 상대 PC의 타격 예측.
- `src/scene.js` Three.js 체육관·탁구대·캐릭터·카메라. `src/audio.js` Web Audio 합성음.
- `src/net.js` Supabase Realtime Broadcast + presence. 경기 채널 `pingpong-room-XXXX`, 광장 `pingpong-plaza`, 로비(탁구대 상태) `pingpong-lobby`. 경기 채널의 선수끼리는 **WebRTC 직접 연결**(교실 와이파이는 기기끼리 막혀서 실제로는 **서울 중계 TURN**, 출입증은 `api/turn.js` Vercel 서버 함수 + Vercel 환경 변수 `CF_TURN_KEY_ID`·`CF_TURN_API_TOKEN`)도 같이 쓰고 먼저 온 소식만 씀(`makeP2P`, `?rtc=0` 끔, `?turn=0` 중계 끔). 설정이 없으면 BroadcastChannel로 같은 브라우저 탭끼리만 연결(로컬 테스트, `?lag=80`으로 서버 길 지연 흉내 — 직접 길은 안 늦어서 `?rtc=0&lag=80`).
- `src/main.js` 시작점: 화면 파일을 모두 불러오고 매 프레임 루프(로비 카메라·배경). 화면 흐름은 `src/ui/`:
  `plaza.js`(광장 로비 = 메인 화면: 걷기·채팅·가게·탁구대 자리·준비·한 판 더) · `plazaBubble.js`(경기장 거품: 원 안 = 그 경기장으로·관전, 듣기만) · `state.js`(공용: `$`·`world`·`game`/`match`/`preview`과 `setGame` 등 — 다른 파일이 바꾸는 변수는 여기에 두고 setter로) · `screen.js`(`show`·`stopGame`) · `hud.js`(경기 화면 글자) · `ai.js`(혼자 하기) · `room.js`(경기 채널: 탁구대 경기 시작·시계 맞추기·전적 저장) · `lobbyList.js`(로비 채널: 경기 중인 탁구대 정보) · `cheer.js`(관중석·응원) · `fishing.js`(광장 낚시: 판 위 버튼·낚시 화면·다른 사람 낚시 모습, 규칙은 `src/games/fishing/session.js`) · `login.js`(로그인·PIN·업데이트/치는 방법 창) · `rank.js` · `dress.js`(꾸미기) · `titles.js`(업적 알림·칭호) · `stage.js`(VS 소개의 탁구채 든 자세) · `intro.js`(VS 소개).
  새 화면 파일을 만들면 `main.js` 맨 위에서 꼭 불러온다(버튼 연결이 불러올 때 일어남).
- `src/account.js` 서버 함수 부르기. `src/localServer.js` 로컬 가짜 서버. `src/achievements.js` 업적 목록.
- `src/gachaShow.js` 뽑기 연출 화면(탁구공 깨기, 시안 `gacha.html`과 같은 코드).
- `src/items.js` 아이템 목록·탁구채 모델·`applyLook`·목록 그림(`src/thumbs/`). `src/outfits.js` 몸. `src/balls.js` 탁구공. `src/fx.js` 효과 파티클.
- `src/crowd.js` 관중석 캐릭터(관전). `src/plaza.js`·`src/plazaKim.js`·`src/bubbleFx.js`(광장 3D·뛰어오는 김제빵·거품 물결)·`src/arena-plaza.js`(광장 배경)·`src/plazaSky.js`(시간·날씨).
- `src/arenas.js` + `src/arena-*.js` 배경. `src/lobbyDemo.js` 로비 배경 랠리. 시안 페이지 `outfits.html`·`balls.html`·`tables.html`·`hats.html`(머리 `src/hats.js`·얼굴 `src/faces.js`). 탁구대 `src/tables.js`(+ `tables-rare.js`·`tables-legend.js`·`table-kit.js`).
- `supabase/NN_*.sql` 서버(번호 순서대로 실행). `scripts/make-thumbs.cjs` 목록 그림 찍기.

## 배포 흐름 (사용자가 확정)
- 새 작업은 **항상 `test` 브랜치에 먼저 올린다**(작업 브랜치에서 커밋 후 `git push origin HEAD:test`). Vercel 미리보기 주소에서 사용자가 테스트한다.
- **`main`으로 합치는 건 사용자가 직접 한다.** Claude는 `main`에 push·merge하지 않는다.
- 미리보기 배포(`VITE_VERCEL_ENV`가 production이 아님)에서는 상단에 '🧪 테스트 버전' 표시가 뜨고, 방 채널이 `pingpong-test-room-XXXX`로 분리된다(`src/net.js`의 `IS_TEST`).

## 환경 변수 / 배포
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable, 공개용). 로컬은 `.env.local`(git 제외), 배포는 Vercel 프로젝트 설정.
- GitHub `main`에 올리면 Vercel이 자동 배포한다. 미리보기(Preview) 주소는 **`test` 브랜치만** 생긴다(`vercel.json`의 `git.deploymentEnabled` — 무료 요금제 하루 배포 100번 한도 때문에 작업 브랜치는 배포 안 함).
- 한도에 걸린 동안의 push는 나중에 저절로 배포되지 않는다. 한도가 풀린 뒤 Vercel Deployments → ⋯ → Create Deployment(브랜치 `main`) 또는 새 커밋을 올려야 한다.
- Supabase 프로젝트는 다른 게임과 공유한다. DB 테이블을 만들 때는 `pingpong_` 접두어를 붙인다.

## 테스트 요령
- **사용자 결정(11/26): 전체 자동 점검은 시간이 너무 걸려 생략.** 서버 SQL을 바꿨으면 `node scripts/check.cjs --no-browser`(약 15초, 빌드 + SQL)만, 화면은 바꾼 부분만 Playwright로 짧게 확인. GitHub Actions는 그대로 돈다.
- **`npm run check`** = 전체 자동 점검(`scripts/check.cjs`, 10분 넘게 걸림): 빌드, 서버 SQL을 빈 DB에 01부터 두 번 실행 + anon 권한으로 가입·상점·뽑기 등, `items.js`·`achievements.js` ↔ SQL 목록·목록 그림, 브라우저로 손님·로그인·혼자 하기·꾸미기·랭킹·광장·광장 탁구대 1대1(탭 두 개)·배경 9종·시안 페이지. test에 올리기 전에 돌리고, 새 화면·SQL을 만들면 점검도 추가한다. 화면 점검은 진짜 Supabase를 안 쓴다(VITE_SUPABASE_URL을 비움). GitHub에서도 `.github/workflows/check.yml`이 test·main push마다 돌린다(Actions 탭).
- `npm run dev` 후 Playwright(사전 설치됨)로 확인. 헤드리스 swiftshader는 매우 느려서(초당 수 프레임) 타이밍 결과가 흔들린다. 판정 테스트는 페이지 안에서 `PointerEvent`를 직접 쏘는 방식이 안정적이다.
- 1v1은 같은 브라우저 컨텍스트의 탭 두 개(로컬 모드) 또는 컨텍스트 두 개 + Supabase로 확인한다. 디버그 훅: `window.__smash.{world, game, match, room, plaza}` (`plaza.sit(t, s)`·`ready()`·`table(t)`·`kim()`·`state(t)`·`afk()`·`bubble`).
- 사용자에게 줄 단일 HTML이 필요하면 `npm run build` 후 `dist/assets/*.js`와 css를 `index.html`에 인라인한다(함수형 replace로 `$` 패턴 주의).
