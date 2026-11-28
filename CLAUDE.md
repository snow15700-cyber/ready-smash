# 준비하시고, 스매시! — 개발 안내 (Claude용)

교육생(10~20명)이 쉬는 시간에 하는 웹 3D 탁구 게임 + 걸어 다니는 광장 + 낚시. 운영은 1월 말까지. 처음 기획은 `docs/기획서.md`(필요한 장만).
이 파일은 대화마다 통째로 읽히므로 **짧게 유지**한다. 자세한 결정·진행은 아래 주제 문서에 적고, 여기에는 한 줄만.

## 사용자와 일하는 방식
- 사용자는 코딩을 잘 모름. **한국어로, 쉬운 말로** 설명하고 실행·테스트 방법은 단계별로 안내.
- 큰 기능은 단계로 나누고, **단계마다 멈추고 사용자가 테스트**. 디자인·조작 결정은 사용자가 내린다(여러 안이면 스크린샷으로 고르게).
- 애매하면 만들기 전에 확인. **'사용자 확정'이라고 적힌 것은 바꾸기 전에 사용자에게 확인.**
- **기능 하나마다 새 대화**. 정한 것·진행 상황은 주제 문서에 적어 새 대화가 이어받게. 스크린샷은 고르기·중요 확인 때만.
- 새 게임은 같은 프로젝트에서: 코드 `src/games/<게임>/`, 문서 `docs/dev/<게임>.md`, 광장엔 `registerAddon`으로 꽂기(`cleanup.md` 12번).

## 문서 지도 (작업 주제에 맞는 파일만 읽는다)
주제 문서는 **지금 모습만** 적는다(바뀌면 그 자리를 고쳐 쓰기, 과정은 git 기록에). 버린 것은 그 문서 맨 아래 **'안 하기로 한 것'에 한 줄**, 할 일은 '남은 일'에.
| 주제 | 파일 |
|---|---|
| **게임 만들기 대원칙**(기획·디자인 전에 읽기) | `docs/dev/principles.md` |
| 경기 규칙·조작·판정·찬스볼·동기화·WebRTC/TURN | `docs/dev/gameplay.md` |
| 2v2·혼자 하기(김제빵)·휴대폰·관중석·응원 | `docs/dev/modes.md` |
| 계정·전적·랭킹·코인·보안·업적·칭호·쉬는 시간 보너스 | `docs/dev/accounts.md` |
| 상점·꾸미기·탁구채·몸·머리·얼굴·세트·뽑기 연출 | `docs/dev/shop.md` |
| 탁구공 / 탁구대 / 배경(경기장) | `balls.md` / `tables.md` / `arenas.md` |
| 광장 로비(탁구대·김제빵·거품 관전·화면 전환·캠퍼스 디자인) | `docs/dev/plaza.md` |
| 낚시(리듬·물고기·도감·가방·횟집·선착장) | `docs/dev/fishing.md` |
| 고양이 친구 | `docs/dev/cats.md` |
| 화면 디자인('탁구 색 + 유리')·업데이트 내역(`src/updates.js`) | `docs/dev/design.md` |
| 코드 정리 / 최적화 순서표 | `cleanup.md`(다음 10번) / `optimization.md`(다음 3번, 사용자 확인 먼저) |
| **실행할 서버 SQL 목록** | `docs/dev/sql-to-run.md` |
| 한 번에 테스트할 목록 | `docs/dev/test-checklist.md` |

**지금 상태(11/28)**: 위 기능은 모두 main에 합쳐짐(예외: 🍣 횟집 건물 새 모습·🛒👕🏆 가게 3개 2층 새 모습·낚시 ⭐ 품질 별·희귀·전설 시세·📰 소식·🛒 판 만큼 시세·🎵 장르 시안·광장 연결·🎶 박자 친구들 시안·선착장 자리·팔에서 던지는 방향 고침·등대 자리·팔 부채꼴·양쪽 팔 기포·장르별 물고기·시세·🗺️ 광장 구역 나누기(`plaza.md` 8장)·관전 원 6m/8m는 test, **SQL 46·48 실행 필요**). 서버 SQL 01~45·47 실행 완료(`sql-to-run.md`).
**다음 할 일(11/27)**: **낚시 + 주식 손보기**(`fishing.md` 13장, ①·②·④ 사용자 확인 끝 · ③ 사용자 확인 끝 → ⑤ 장르별 물가 1단계 시안·2단계 광장 연결(선 자리 = 장르: 서 발라드·가운데 재즈·동 록) test · 🎶 박자 친구들 ⓐ 시안(7개 확정)·ⓑⓒ 선착장 자리·박자 + 팔 던지는 방향 🐞 고침 test(13-3) · 양쪽 팔 기포 test · 3단계 장르별 물고기·시세 test(11/28, SQL 48)) → 출석 도장판·승리 세리머니(낚시 때문에 보류 중) → 궤적·사운드 스킨 등 컨텐츠. 낚시 남은 것: 낚싯대 꾸미기·어탁 카드.

## 어디서나 지킬 규칙
- 매 프레임 순서 `game.decideHit` → `match.update` → `game.update`. 판정·물리는 결정론적(같은 입력 → 같은 결과).
- 꾸미기 아이템은 **보기만 다름**(판정·네트워크 메시지 그대로).
- 브라우저가 보낸 숫자는 믿지 않는다(코인·전적·기록은 서버가 계산하거나 상한).
- 서버 SQL: 새 번호 파일(`41_...sql`부터)로 추가, 여러 번 실행해도 되게, `sql-to-run.md`에 적기. 이름은 `pingpong_` 접두어(Supabase를 다른 게임과 공유). 표는 RLS로 잠그고 security definer 함수만 anon에. 로컬 PostgreSQL 16으로 먼저 시험(`service postgresql start`, `extensions` 스키마·`anon` 역할 흉내).
- 서버 규칙을 바꾸면 **로컬 가짜 서버**(`src/localServer.js`)도 같은 규칙으로.
- 아이템 목록은 두 곳: `src/items.js`와 SQL insert. 바꾸면 **`npm run thumbs`**로 목록 그림 다시 찍기.

## 구조 (핵심만)
- `src/physics.js` 공 궤적·판정·샷 계획 · `src/match.js` 경기 기준 로직(방장/혼자) · `src/game.js` 화면 쪽(이벤트·입력·상대 예측) · `src/scene.js` 3D · `src/audio.js` 합성음 · `src/util.js` 공용 도우미(새로 복사하지 말고 여기서).
- `src/net.js` Supabase Realtime(경기 `pingpong-room-XXXX`, 광장 `pingpong-plaza`, 로비 `pingpong-lobby`) + 선수끼리 WebRTC(교실은 서울 TURN, `api/turn.js` + Vercel 환경 변수 `CF_TURN_KEY_ID`·`CF_TURN_API_TOKEN`). `?rtc=0`·`?turn=0`·`?lag=80`. 설정 없으면 같은 브라우저 탭끼리 BroadcastChannel.
- `src/main.js` 시작점·매 프레임 루프. 화면은 `src/ui/*.js`(광장 `plaza.js`가 메인 화면, 공용 변수 `state.js`). **새 화면 파일은 `main.js` 맨 위에서 불러오기.**
- `src/account.js` 서버 호출 · `src/items.js`·`outfits.js`·`balls.js`·`tables.js`·`arenas.js` 아이템 · `src/plaza*.js` 광장 3D · `src/games/` 낚시·고양이 · `supabase/NN_*.sql` 서버.

## 배포 (사용자 확정)
- 새 작업은 **항상 `test` 브랜치에 먼저**(작업 브랜치에서 커밋 후 `git push origin HEAD:test`). Vercel 미리보기 주소에서 사용자가 테스트.
- **`main` 합치기는 사용자가 직접.** Claude는 `main`에 push·merge하지 않는다.
- 미리보기는 '🧪 테스트 버전' 표시 + 방 채널 `pingpong-test-room-XXXX`(`net.js`의 `IS_TEST`). 미리보기 주소는 `test` 브랜치만 생김(Vercel 무료 하루 100번 한도 — 한도 중 push는 나중에 저절로 배포 안 됨).
- 환경 변수 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`(로컬 `.env.local`, 배포는 Vercel 설정).

## 테스트 요령
- **전체 점검(`npm run check`, 10분+)은 생략(사용자 결정 11/26).** SQL을 바꿨으면 `node scripts/check.cjs --no-browser`(약 15초), 화면은 바꾼 부분만 Playwright로 짧게. GitHub Actions는 그대로 돈다.
- `npm run dev` 후 Playwright. 헤드리스는 매우 느려 타이밍이 흔들림 → 판정은 페이지 안에서 `PointerEvent`를 직접 쏘기.
- 1v1은 같은 브라우저의 탭 두 개(로컬 모드). 디버그 훅 `window.__smash.{world, game, match, room, plaza}`.
