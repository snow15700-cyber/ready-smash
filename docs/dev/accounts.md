# 계정·전적·랭킹·코인·부정 방지·업적

> CLAUDE.md에서 옮겨 온 상세 기록. 작업할 때 필요한 부분만 읽는다. 새로 정해진 것도 여기에 적는다.

## PIN 계정·전적·랭킹 (1·2단계 main 배포됨, 3단계 랭킹은 test 브랜치에서 사용자 테스트 중)
- 설계는 기획서 5장. 진짜 정보는 Supabase DB, 브라우저에는 로그인 열쇠(`smash-token`, 30일·쓸 때마다 연장)만. 복구 단어 없음, 손님 모드 유지(presence에 `guest: true`, 대기실에 '손님' 표시).
- 서버: `supabase/01_accounts.sql`(사용자가 SQL Editor에서 직접 실행). 표 `pingpong_players`/`pingpong_sessions`는 RLS로 잠그고 `pingpong_login`·`signup`·`me`·`change_pin`·`logout` 함수(security definer)만 anon에 열어 둔다. PIN은 bcrypt, 토큰은 sha256. 5번 틀리면 5분 잠금.
- 화면: `src/account.js`(서버가 없으면 localStorage 가짜 서버 `smash-local-db`로 같은 규칙). `main.js`의 로그인 화면(`#login`)·PIN 바꾸기(`#pin-change`)·로비 `me-bar`. 같은 브라우저의 탭은 같은 계정.
- 2단계 전적: `supabase/02_records.sql`(01 다음에 실행). `pingpong_players`에 1v1/2v2 승패·`best_rally`, 상대 전적 표 `pingpong_h2h`(내 쪽 방향만). 함수 `pingpong_record_match`(10초 안 중복 무시)·`record_rally`·`h2h`.
  - 경기가 끝나면(`hud.gameOver` → `saveResult`) **각 PC가 자기 결과만** 기록. 로그인한 사람은 presence에 `pid`(선수 번호)를 실어 1v1 상대 전적에 쓴다. 대기실 `#room-h2h`에 '○○님과의 상대 전적 3승 2패'. 경기 중 나가면 기록 없음.
  - **패 수는 화면에 안 보인다**(사용자 확정): 로비 내 전적·랭킹은 승수만. 승패 둘 다 보이는 곳은 1v1 대기실 상대 전적뿐. (서버에는 패도 저장)
  - 혼자 하기 최고 기록: 로그인 = 서버 `best_rally`, 손님 = 브라우저 `smash-ai-best`(`Game`의 `best`/`onBest`). 로비 `#me-stats`에 내 전적.
  - 로컬 테스트에서 탭마다 다른 계정: 주소에 `?acct=2`(로그인 열쇠를 따로 보관).
- 3단계 랭킹: `supabase/03_ranking.sql`의 `pingpong_ranking('wins'|'rally')`(로그인 없이 호출, 닉네임과 숫자만, 상위 50, 같은 기록은 공동 등수). 로비 '🏆 랭킹' 버튼 → `#rank` 화면(승수/최장 랠리 탭, 1~3위 메달, 내 줄 강조). `main.js`의 `showRank`.
- 알려진 문제: Vercel 미리보기(test)에서 Supabase 환경 변수가 안 들어가 '테스트 모드' 경고가 뜬다(사용자가 Preview 체크했는데도 원인 미해결). 서버 기능은 main 배포에서 확인.
- 새 SQL은 `19_...sql`처럼 새 파일로 추가. SQL은 로컬 PostgreSQL 16으로 먼저 시험할 수 있다(`service postgresql start`, `extensions` 스키마와 `anon` 역할을 만들어 흉내).

## 코인·경기 확인·보안 (상점 절에서 옮김)
- **① 코인 벌기 완료(test에서 사용자 테스트 중)**: `supabase/04_coins.sql`(03 다음 실행). 표에 `coins`·`win_streak`·`daily_at`. 함수 `pingpong_finish_match`(전적+코인, 서버가 계산·보너스 횟수 0~3으로 자름, 3·6·9연승 +15)와 `pingpong_daily`(한국 날짜 하루 첫 접속 +20). 예전 `pingpong_record_match`는 main 배포본용으로 남겨 둠(DB를 test·main이 공유).
  - 화면: `game.stats.perfect3`(퍼펙트 3연속마다 +1)·`rally10`(랠리가 10이 될 때 +1, AI 제외) → `saveResult` → `finishMatch`(실패하면 `recordMatch`로 전적만). 대기실 `#room-coins`에 내역, 로비 `#me-coins`, 로그인 직후 `checkDaily`. 효과음 `playUI('coin')`.
- **경기 확인(부정 방지, test에서 사용자 테스트 전)**: `supabase/13_match_check.sql`(12 다음). 예전엔 서버가 브라우저의 '이겼다'를 그대로 믿어 함수만 불러도 코인이 쌓였다. 이제 방장이 경기 번호 `mid`(`newMatchId`)를 'go'에 싣고, 각 PC가 자기 토큰으로 `pingpong_match_join`(시작 30초 안, 쪽별 정원) → 끝나면 `pingpong_match_finish`(입장한 경기만·한 번만·시작 25초 전엔 거절) → `pingpong_match_ach` → `pingpong_match_people`(상대·팀원은 서버가 입장 기록에서 찾음). 혼자 하기 업적은 `pingpong_ai_ach`. 표 `pingpong_matches`·`pingpong_match_players`.
  - 사용자 확정: **같은 상대와 하루 5판**까지 보통 코인, 6판째부터 참여 +10만. 상대 열쇠 `opp_key` = 모드 + 상대 쪽 선수 번호(손님은 모두 'guest'). 하루 상한·랭킹 제한은 **없음**. 서로 이겼다고 하면 `disputed` 표시(운영자 쿼리는 13 파일 끝).
  - **보안 구멍 막기 `supabase/18_security.sql`(17 다음, test에서 사용자 테스트 전)**: 사용자 확정 — ① 한 사람은 **가장 최근에 입장한 경기만** 결과를 낼 수 있다(동시에 여러 가짜 경기 X, 아니면 `stale`). ② 상대 쪽에 로그인한 사람이 없는 경기(손님 상대 = 혼자 꾸민 가짜 경기와 구별 불가)는 **승수·패수·연승·승리 업적 X, 코인 하루 5판까지**(6판째부터 0). ③ 로그인한 같은 상대: 1~5판 보통, 6~10판 참여 +10만, **11판째부터 0**(승패·상대 전적은 계속). ④ 혼자 하기 최고 기록은 서버 `pingpong_ai_rally`가 인정한 친 횟수로만 올림, `pingpong_record_rally`는 닫음(화면의 `recordRally` 없앰). 로컬 가짜 서버(`account.js`)도 같은 규칙.
  - `supabase/14_close_old.sql`: 예전 함수(`record_match`·`finish_match`·`ach_match`·`ach_people`)를 anon에서 닫는다. **test를 main에 합친 뒤에** 실행(먼저 하면 main 배포본 기록이 안 됨).

## 업적·칭호 (①②③ test에서 사용자 테스트 중, SQL 10·11은 사용자가 실행함)
- 전체 목록·규칙은 **기획서 11장**. 사용자 확정: 목록 전부 추가, 놀림형 칭호 OK, **칭호는 하나만** 달고 꾸미기 '🏅 칭호' 탭에서 언제든 바꾸기, 보상 ★20/★★50/★★★150코인, 이름표 **B안(두 줄, 칭호 알약)** — 칭호 알약은 모두 남색 `#3d3b5c`.
- **숨은 업적 없음**(사용자 확정): 업적 이름·조건은 모두 보이고, **칭호 글자만 깨기 전에 '칭호 ???'**.
- ① `supabase/10_achievements.sql`: 표 `pingpong_ach`(id·grade)·`pingpong_ach_got`, 선수 `title`. 함수 `pingpong_achievements`(목록 + 새로 깬 것 `new`)·`pingpong_set_title`. 랭킹에 `title`.
- ② `supabase/11_ach_match.sql`(10 다음): 선수 `ach_n`(누적 숫자 jsonb)·`ach_at`(10초 규칙). `pingpong_ach_match(token, mode, won, stats)` — 한 경기 업적은 바로, 누적은 `ach_n`에 더한 뒤 `pingpong__ach_check`(10의 것 + 누적)로. 지급은 `pingpong__ach_grant`. 오리·빵 탁구채 업적은 서버의 `equip`, 하루 판 수·아침 9시는 서버 시각(한국).
  - 화면: `game.js`의 `trackAch`(모든 이벤트에서 내 기록: 판정·방향(`lastLocal`)·타이밍·스매시·찬스볼·서브·점수 흐름·2v2 내 득점) → `achSummary(score)` → `main.js` `saveResult` → `achMatch`. 혼자 하기는 `onRally`에서 친 횟수 1 이하면 `achMatch('ai', …, {aizero:1})`.
  - 목록은 두 곳: `src/achievements.js`(`ACHS`, `live` = 지금 셀 수 있음)와 SQL insert. 로컬 가짜 서버는 `account.js`의 `localAchMatch`(같은 규칙).
- ③ `supabase/12_ach_people.sql`(11 다음): `pingpong_ach_people(token, mode, won, opp, mate)` — `achMatch` 다음에 부름(같은 경기 한 번만, `ach_n.people_at`). 천적 = h2h `lose_run` 5 → 칭호 「(상대 닉네임) 공포증」(`ach_n.nemesis`, 처음 깬 상대로 고정, `titleText(id, x)`·presence `titleX`·랭킹 `title_x`·player json `nemesis`). 복수 = 그 상대에게 3패 이상인데 이김. 짝꿍 = `ach_n.duo{팀원 번호: 승수}`. 뽑기 횟수 = 트리거 `pingpong_count_gacha`(코인이 100·900 줄면 `ach_n.gacha`). 출석 = `pingpong_daily`가 `ach_n.days`·`days_run`(이 SQL 넣은 날부터).
- 이제 58개 모두 깰 수 있음. 다음 후보 ④: 연출 다듬기(승리 세리머니 등, 기획서 11장).
