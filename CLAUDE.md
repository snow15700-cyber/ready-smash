# 준비하시고, 스매시! — 개발 안내 (Claude용)

교육생(10~20명)이 쉬는 시간에 하는 웹 3D 탁구 게임. 기획은 `docs/기획서.md`(필요한 장만 읽기).

## 사용자와 일하는 방식
- 사용자는 코딩을 잘 모름. **한국어로, 쉬운 말로** 설명하고 실행·테스트 방법은 단계별로 안내.
- 큰 기능은 단계별로 나눠서 만들고, **단계마다 멈추고 사용자가 테스트**하게 한다.
- 디자인·조작 결정은 사용자가 내린다. 여러 안이 있으면 스크린샷을 찍어 고르게 한다.
- 기획서와 사용자의 의도가 다를 수 있으니, 애매하면 만들기 전에 확인한다.
- **'사용자 확정'이라고 적힌 것은 바꾸기 전에 사용자에게 확인.**

## 상세 문서 지도 (작업 주제에 맞는 파일만 먼저 읽는다)
이 파일은 대화마다 통째로 읽히므로 짧게 유지한다. 새로 정해진 것·구현 메모는 아래 주제 파일에 적고, 여기에는 한 줄 상태만.

| 주제 | 파일 | 상태 |
|---|---|---|
| 경기 규칙·조작·판정·찬스볼·몰입 연출·**동기화 규칙** | `docs/dev/gameplay.md` | main |
| 2v2·혼자 하기(AI)·모바일·링크 미리보기·**관전 모드(기획·단계)** | `docs/dev/modes.md` | 2v2·AI main / 모바일·미리보기 test / 관전 ①방 목록 ②관전 기본 **`test-spectate` 브랜치**(test 말고) |
| PIN 계정·전적·랭킹·코인·경기 확인·**보안(18)**·업적·칭호 | `docs/dev/accounts.md` | 보안 18 test(SQL 실행 전) |
| 상점·꾸미기 공통, 탁구채(전설 포함)·몸·목록 그림 | `docs/dev/shop.md` | test |
| 탁구공 | `docs/dev/balls.md` | test |
| 배경(경기장)·배경 합치기(성능) | `docs/dev/arenas.md` | test |
| 화면 디자인(로비·대기실·랭킹·꾸미기·경기 HUD)·대기실 무대·VS 소개·**업데이트 내역**(`src/updates.js`, main에 합칠 때마다 추가) | `docs/dev/design.md` | test |

아직 안 한 것(기획서 8장): 머리·궤적·탁구대 아이템, 출석·미션, 사운드 스킨, 승리 세리머니. 최적화 계획(진행 중): ① 보안 구멍 ✓ ② 옷장 렉 ✓ ③ 이 파일 줄이기 ✓ ④ 프레임 측정(`?fps=1`)·무거운 배경 가볍게(`arena-bake.js`, test에서 사용자 테스트 전) ✓ ⑤ 첫 로딩 빠르게·자동 점검 ✓ (남은 보안 — 계정 두 개로 승수 쌓기, 가입 제한 — 은 사용자가 이번엔 안 하기로).

## 어디서나 지킬 규칙
- 매 프레임 순서 `game.decideHit` → `match.update` → `game.update`(느린 PC에서 늦은 스윙이 버려지지 않게). 판정·물리는 결정론적(같은 입력 → 같은 결과).
- 꾸미기 아이템은 **보기만 다름**(판정·네트워크 메시지 그대로).
- 서버 SQL: 새 파일 `19_...sql`로 추가(사용자가 SQL Editor에서 직접 실행, 여러 번 실행해도 되게). 테이블·함수는 `pingpong_` 접두어(Supabase를 다른 게임과 공유). 표는 RLS로 잠그고 security definer 함수만 anon에. 로컬 PostgreSQL 16으로 01부터 차례로 먼저 시험(`service postgresql start`, `extensions` 스키마·`anon` 역할을 만들어 흉내).
- 서버 규칙을 바꾸면 **로컬 가짜 서버**(`src/account.js`의 `localServer`, 설정 없을 때 쓰임)도 같은 규칙으로.
- 아이템 목록은 두 곳: `src/items.js`와 SQL insert. 아이템을 추가·수정하면 **`npm run thumbs`**로 목록 그림 다시 찍기.
- 브라우저가 보낸 숫자는 믿지 않는다(코인·전적·기록은 서버가 계산하거나 상한을 둔다).

## 구조
- `src/physics.js` 공 궤적(해석적 세그먼트), 판정 범위, 샷 계획. 결정론적(같은 입력 → 같은 결과).
- `src/match.js` 경기 기준 로직(방장/혼자 모드에서만 실행). `computeShot`은 방장과 상대 PC가 같이 쓴다.
- `src/game.js` 화면 쪽: 이벤트를 받아 공·캐릭터·링·소리 처리, 내 입력 판정, 상대 PC의 타격 예측.
- `src/scene.js` Three.js 체육관·탁구대·캐릭터·카메라. `src/audio.js` Web Audio 합성음.
- `src/net.js` Supabase Realtime Broadcast + presence. 채널 `pingpong-room-XXXX`. 설정이 없으면 BroadcastChannel로 같은 브라우저 탭끼리만 연결(로컬 테스트, `?lag=80`으로 지연 흉내).
- `src/main.js` 로비·방·대기실 흐름, 시계 맞추기(ping/pong), 매 프레임 루프.
- `src/account.js` 서버 함수 부르기 + 로컬 가짜 서버. `src/achievements.js` 업적 목록.
- `src/items.js` 아이템 목록·탁구채 모델·`applyLook`·목록 그림(`src/thumbs/`). `src/outfits.js` 몸. `src/balls.js` 탁구공. `src/fx.js` 효과 파티클.
- `src/arenas.js` + `src/arena-*.js` 배경. `src/lobbyDemo.js` 로비 배경 랠리. 시안 페이지 `outfits.html`·`balls.html`.
- `supabase/NN_*.sql` 서버(번호 순서대로 실행). `scripts/make-thumbs.cjs` 목록 그림 찍기.

## 배포 흐름 (사용자가 확정)
- 새 작업은 **항상 `test` 브랜치에 먼저 올린다**(작업 브랜치에서 커밋 후 `git push origin HEAD:test`). Vercel 미리보기 주소에서 사용자가 테스트한다.
- **`main`으로 합치는 건 사용자가 직접 한다.** Claude는 `main`에 push·merge하지 않는다.
- 미리보기 배포(`VITE_VERCEL_ENV`가 production이 아님)에서는 상단에 '🧪 테스트 버전' 표시가 뜨고, 방 채널이 `pingpong-test-room-XXXX`로 분리된다(`src/net.js`의 `IS_TEST`).

## 환경 변수 / 배포
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable, 공개용). 로컬은 `.env.local`(git 제외), 배포는 Vercel 프로젝트 설정.
- GitHub `main`에 올리면 Vercel이 자동 배포한다. 다른 브랜치는 미리보기(Preview) 주소가 생긴다.
- Supabase 프로젝트는 다른 게임과 공유한다. DB 테이블을 만들 때는 `pingpong_` 접두어를 붙인다.

## 테스트 요령
- **`npm run check`** = 자동 점검(`scripts/check.cjs`, 약 2분): 빌드, 서버 SQL을 빈 DB에 01부터 두 번 실행 + anon 권한으로 가입·상점·뽑기 등, `items.js`·`achievements.js` ↔ SQL 목록·목록 그림, 브라우저로 손님·로그인·혼자 하기·꾸미기·랭킹·1대1 방(탭 두 개)·배경 6종·시안 페이지. test에 올리기 전에 돌리고, 새 화면·SQL을 만들면 점검도 추가한다. 화면 점검은 진짜 Supabase를 안 쓴다(VITE_SUPABASE_URL을 비움). GitHub에서도 `.github/workflows/check.yml`이 test·main push마다 돌린다(Actions 탭).
- `npm run dev` 후 Playwright(사전 설치됨)로 확인. 헤드리스 swiftshader는 매우 느려서(초당 수 프레임) 타이밍 결과가 흔들린다. 판정 테스트는 페이지 안에서 `PointerEvent`를 직접 쏘는 방식이 안정적이다.
- 1v1은 같은 브라우저 컨텍스트의 탭 두 개(로컬 모드) 또는 컨텍스트 두 개 + Supabase로 확인한다. 디버그 훅: `window.__smash.{world, game, match, room}`.
- 사용자에게 줄 단일 HTML이 필요하면 `npm run build` 후 `dist/assets/*.js`와 css를 `index.html`에 인라인한다(함수형 replace로 `$` 패턴 주의).
