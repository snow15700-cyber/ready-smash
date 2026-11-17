# 준비하시고, 스매시! — 개발 안내 (Claude용)

교육생(10~20명)이 쉬는 시간에 하는 웹 3D 탁구 게임. 기획은 `docs/기획서.md`.

## 사용자와 일하는 방식
- 사용자는 코딩을 잘 모름. **한국어로, 쉬운 말로** 설명하고 실행·테스트 방법은 단계별로 안내.
- 큰 기능은 단계별로 나눠서 만들고, **단계마다 멈추고 사용자가 테스트**하게 한다.
- 디자인·조작 결정은 사용자가 내린다. 여러 안이 있으면 스크린샷을 찍어 고르게 한다.
- 기획서와 사용자의 의도가 다를 수 있으니, 애매하면 만들기 전에 확인한다.

## 현재 상태 (1차 MVP 완료, Vercel 배포됨)
- 혼자 하기(AI 상대), 1v1 온라인(방 코드), 5점 듀스 규칙, 클릭 토스 서브, 합성 타구음·바운드음, 닉네임.
- PIN 계정·전적·랭킹: 아래 'PIN 계정·전적·랭킹' 절 참고 (기획서 5장).
- 아직 안 한 것(기획서 8장 '다음 업데이트'): 코인·상점·꾸미기·배경, 출석·미션, 사운드 스킨.

## 2v2 (완료, main 배포됨)
- 방·대기실 (사용자 확정): 로비에서 **1v1 방 만들기 / 2v2 방 만들기**로 모드를 정한다(방장 presence의 `mode`, 나중에 못 바꿈). 정원 1v1 2명, 2v2 4명.
  - 참가자는 입장만 하고 대기실에서 A/B팀을 자유롭게 고르고 바꾼다. **팀을 고르면 준비 완료**(준비 버튼 없음). 내 팀을 다시 누르면 빠진다.
  - 팀 안 순서(1번/2번)는 팀을 고른 시각 `at` 순. 같은 자리를 동시에 누르면 늦은 사람이 스스로 빠진다(`resolveOverflow`).
  - 자리가 다 차면 **방장만 '경기 시작!' 버튼**을 누를 수 있다. 방장도 A/B 어느 쪽이든 설 수 있다(방장이 side 1일 수 있음).
  - 경기가 끝나면 모두 팀 선택이 초기화된다.
  - 메시지: `st`(각자 팀 `{team, at}`), `go`(방장: 선수 목록 `{id, side, slot}`).
- 경기: 치는 순서 A1→B1→A2→B2 고정, 서브도 1점마다 그 순서. 대각선 서브 규칙 없음. 점수는 1v1과 같음. 경기 중 누가 나가면 경기 끝내고 모두 대기실로.
- 팀원은 좌우 나란히(1번 왼쪽, 2번 오른쪽) 서 있다가 다음에 칠 사람이 앞으로, 아닌 사람은 한 걸음 뒤로. 뒤로 물러난 동안 카메라는 내 몸 안쪽으로 옮겨 탁구대 가운데를 본다(`updateCamera`의 `charZ`). 다른 캐릭터가 카메라 1.3m 안에 오면 흐려진다.
- '내 차례!'(내 서브는 '내 서브!') 글자 + `playUI('turn')` 효과음은 2v2에서만. 이름표는 상대 팀 머리 위에만, 다음에 칠 사람은 노랗게.
- 구현: 선수 = `{side, slot}`, `hitOrder(mode)`(match.js)와 `turn`(다음에 칠 사람). 이벤트 `serveReady`/`shot`에 `turn`, `toss`/`shot`/`miss`에 `slot`. 입력 `in`은 `from`(id)으로 선수를 찾는다. 캐릭터는 `world.team[side][slot]`.

## 혼자 하기 = AI 상대 (벽치기 대신, main 배포됨)
- 사용자 확정: **연습용 모드**. 벽치기 없앰. 난이도 없음. AI 이름 **'탁구왕 김제빵'**(이름표). 점수 없이 **랠리 기록(내가 친 횟수)**만, 최고 기록은 브라우저에 저장(`smash-ai-best`). 서브는 항상 나. 찬스볼·스매시·몰입 연출 포함.
- **AI는 절대 실수하지 않는다**(헛스윙·아웃 없음, 내 스매시도 다 받음). 가끔(약 18%) BAD(약한 공)를 쳐서 랠리 6회 넘으면 찬스볼이 된다. 랠리는 내가 실수해야만 끝난다.
- 구현: `match.js`의 `AI`(등급별 확률·`smash`·`dir`), `aiPlan`. AI 차례가 오면 `expect.ai`에 칠 방법을 미리 정하고 `update`에서 친다. 스매시가 오면 BAD 대신 GOOD(아웃 방지).

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

## 상점·꾸미기 (① 코인, ② 상점·옷장 완료 — test에서 사용자 테스트 중)
- 설계는 기획서 4장. 순서: ① 코인 벌기 → ② 상점·옷장 화면 → ③ 카테고리 하나씩(탁구채부터). 단계마다 사용자 테스트.
- 카테고리: 탁구채(개그 탁구채 많이), 머리, 몸(흰 몸 위 장식), 탁구대, 배경, 탁구공, 궤적.
- 배경·탁구대·공은 **방장 것**으로 통일, 궤적은 **친 사람 것**, 탁구채·머리·몸은 각자.
- 보기만 다름(판정 같음). 로그인만 상점 이용(손님 불가), 되팔기 없음.
- 칭호·승리 세리머니는 **업적으로만**(추후), 몸 색·얼굴도 추후.
- 아이템은 **뽑기(중복 가능)** + 원하는 건 **비싸게 직접 구매**. 숫자는 기획서 4장(통 2개 캐릭터/경기장, 1회 100·10회 900, 70/25/5%, 천장 40, 직접 구매 500/1,500/5,000, 중복은 조각). 개그 탁구채 22종 전부, 전설급 7종(프라이팬·기타·키보드·마우스·스마트폰·고무 오리·뿅망치)은 모델링·전용 타구음까지 정성껏.
- **① 코인 벌기 완료(test에서 사용자 테스트 중)**: `supabase/04_coins.sql`(03 다음 실행). 표에 `coins`·`win_streak`·`daily_at`. 함수 `pingpong_finish_match`(전적+코인, 서버가 계산·보너스 횟수 0~3으로 자름, 3·6·9연승 +15)와 `pingpong_daily`(한국 날짜 하루 첫 접속 +20). 예전 `pingpong_record_match`는 main 배포본용으로 남겨 둠(DB를 test·main이 공유).
  - 화면: `game.stats.perfect3`(퍼펙트 3연속마다 +1)·`rally10`(랠리가 10이 될 때 +1, AI 제외) → `saveResult` → `finishMatch`(실패하면 `recordMatch`로 전적만). 대기실 `#room-coins`에 내역, 로비 `#me-coins`, 로그인 직후 `checkDaily`. 효과음 `playUI('coin')`.
- **경기 확인(부정 방지, test에서 사용자 테스트 전)**: `supabase/13_match_check.sql`(12 다음). 예전엔 서버가 브라우저의 '이겼다'를 그대로 믿어 함수만 불러도 코인이 쌓였다. 이제 방장이 경기 번호 `mid`(`newMatchId`)를 'go'에 싣고, 각 PC가 자기 토큰으로 `pingpong_match_join`(시작 30초 안, 쪽별 정원) → 끝나면 `pingpong_match_finish`(입장한 경기만·한 번만·시작 25초 전엔 거절) → `pingpong_match_ach` → `pingpong_match_people`(상대·팀원은 서버가 입장 기록에서 찾음). 혼자 하기 업적은 `pingpong_ai_ach`. 표 `pingpong_matches`·`pingpong_match_players`.
  - 사용자 확정: **같은 상대와 하루 5판**까지 보통 코인, 6판째부터 참여 +10만. 상대 열쇠 `opp_key` = 모드 + 상대 쪽 선수 번호(손님은 모두 'guest'). 하루 상한·랭킹 제한은 **없음**. 서로 이겼다고 하면 `disputed` 표시(운영자 쿼리는 13 파일 끝).
  - **보안 구멍 막기 `supabase/18_security.sql`(17 다음, test에서 사용자 테스트 전)**: 사용자 확정 — ① 한 사람은 **가장 최근에 입장한 경기만** 결과를 낼 수 있다(동시에 여러 가짜 경기 X, 아니면 `stale`). ② 상대 쪽에 로그인한 사람이 없는 경기(손님 상대 = 혼자 꾸민 가짜 경기와 구별 불가)는 **승수·패수·연승·승리 업적 X, 코인 하루 5판까지**(6판째부터 0). ③ 로그인한 같은 상대: 1~5판 보통, 6~10판 참여 +10만, **11판째부터 0**(승패·상대 전적은 계속). ④ 혼자 하기 최고 기록은 서버 `pingpong_ai_rally`가 인정한 친 횟수로만 올림, `pingpong_record_rally`는 닫음(화면의 `recordRally` 없앰). 로컬 가짜 서버(`account.js`)도 같은 규칙.
  - `supabase/14_close_old.sql`: 예전 함수(`record_match`·`finish_match`·`ach_match`·`ach_people`)를 anon에서 닫는다. **test를 main에 합친 뒤에** 실행(먼저 하면 main 배포본 기록이 안 됨).
- **② 상점·옷장**: `supabase/06_shop.sql`(05 다음). 표 `pingpong_items`(서버 쪽 아이템 목록: id·pool·cat·grade·on_sale)·`pingpong_inventory`, 선수에 `pieces`·`pity_char`·`pity_arena`·`equip`(jsonb). 함수 `pingpong_shop`·`gacha(pool, 1|10)`·`buy(item, 'coins'|'pieces')`·`equip(cat, item|null)`. 뽑기는 서버 `random()`, 그 등급에 아이템이 없으면 있는 등급에서. 기본 아이템(`DEFAULTS`)은 표에 없고 장착 해제 = 기본.
  - **아이템 목록은 두 곳**: `src/items.js`(이름·색·모양, `GRADES`·`CATS`·`POOLS`)와 06_shop.sql의 insert. 추가할 때 둘 다 고친다(SQL은 새 파일로 insert만 해도 됨).
  - 지금 아이템: 탁구채 색 일반 5종(파랑·초록·노랑·검정·분홍) + 고급 2종(황금·네온, 빛남). 경기장 뽑기는 비어 있어 '곧 열려요'.
- **③ 탁구채 1차 (test에서 사용자 테스트 중)**: 사용자 확정 = 옷장에 바로 넣기, 탁구채를 두 번에 나눔(1차 무늬+개그 15종, 2차 전설 7종 + 전용 타구음). 몸은 한 칸(한 벌씩, 몸통에 색·무늬 칠하기).
  - 무늬 4종(줄무늬·물방울·하트·번개) **일반**, 개그 15종(식빵·바게트·도넛·피자·수박·와플·고등어·밥주걱·삼선 슬리퍼·파리채·태극 부채·수세미·탁구 교재·칠판지우개·도마) **고급** — 등급은 Claude가 정한 초안. `supabase/07_paddles.sql`(06 다음).
  - 구현: 아이템의 `model` → `items.js`의 `PADDLE_MODELS`(판 가운데 = 원점, 면 ±z, +z가 내 쪽, 손잡이 -y). `applyLook`은 바뀐 게 없으면 아무것도 안 함(미리보기에서 매 프레임 불림) → `char.setPaddleModel(group|null)`(scene.js, 불투명도 다시 적용). 탁구채 부품은 반투명이어도 depthWrite.
  - 목록 그림: `paddleImage(it, px)`가 작은 WebGL로 3D 탁구채를 찍어 data URL로 캐시 → `swatch`.
- **탁구채 2차 + 탁구채별 타구음 (test에서 사용자 테스트 중)**: 전설 7종(프라이팬(달걀 프라이)·통기타·키보드(파스텔 키캡)·마우스·스마트폰·고무 오리·뿅망치) `supabase/08_legend_paddles.sql`.
  - 사용자 확정 소리(ASMR, 전부 듣기 좋게): 식빵·바게트·도넛·와플·피자 = 빵 '푸석'(`bread`), 수박 = 과육 누르는 소리(`melon`), 고등어 = '철썩'(`fish`), 밥주걱·슬리퍼·파리채·부채 = 약간 탁한 플라스틱(`plastic`), 수세미·칠판지우개 = 약한 푸석(`sponge`), 교재·도마·색·무늬 = 기본 타구음. 전설은 각자 전용(프라이팬 '댕~', 기타 G→Em→C→D 화음을 차례로, 키보드 '타닥'(퍼펙트 3번), 마우스 '딸깍'(퍼펙트 더블클릭), 스마트폰 '톡'+알림음, 오리 '꽥', 뿅망치 '뿅').
  - **친 사람의 탁구채 소리**가 난다(사용자 확정). 아이템의 `sound` → `applyLook`이 `char.sound`에 → `game.js`의 로컬 타구음과 `shot` 세그먼트(`sound`) → `audio.playHit(grade, pos, when, skin)`의 `HIT_SKINS`. 등급(퍼펙트/굿/배드/블록)마다 크기·밝기가 다르다. 음량은 `SKIN_GAIN`으로 맞춤.
  - 소리 확인: 페이지에서 `AudioContext`를 `OfflineAudioContext`로 바꿔 `playHit`을 렌더링하면 음량을 재고 WAV로 저장할 수 있다.
- **전설 탁구채 비주얼 업데이트 (test에서 사용자 테스트 중)**: 사용자 확정 = 물건 특징에 맞춰 ① 모양 더 정교하게 ② 전설 느낌 ③ 칠 때 효과. 보기만 다름(판정·동기화와 무관, 메시지 변화 없음).
  - 모양: `items.js`의 전설 7종을 다시 만듦(윤기 `phong`, 뒷면도 꾸밈 — 상대는 내 탁구채 뒷면을 본다). 프라이팬(달걀·베이컨), 통기타(로제트·프렛·줄감개), 키보드(한글 자판·돌돌 케이블), 마우스(휠·센서 불빛), 스마트폰(잠금 화면·카메라 섬), 오리(삐죽 털·깃), 뿅망치(아코디언 주름·별 스티커).
  - 전설 느낌: `legendAura`(은은한 후광 + 깜빡이는 반짝이) + 물건마다 스스로 움직임(김, 줄에 흐르는 빛·음표, 무지개 키 불빛, 화면 빛, 비눗방울 등). 모델의 `userData.tick(t, dt)`를 `world.render()`가 매 프레임 부른다.
  - 칠 때: `src/fx.js`의 `HITS`(기름·불꽃 / 음표 / 키캡·ㅋㅋㅋ / 클릭 물결·화살표 / 하트·좋아요 / 물방울·비눗방울 / 별·'뿅!'), 등급이 높을수록 많이. 모델의 `userData.hit()`로 탁구채도 반응(달걀 탱글, 줄 떨림, 키 물결, 딸깍, 알림 배너, 오리·주름 찌그러짐). 흐름: `applyLook`이 `char.fx`(전설만) → `world.hitFx(char, pos, grade)` ← `game.js`(내 클릭 즉시 + `shot` 세그먼트의 `by`)·`lobbyDemo.js`·꾸미기 '🔊' 버튼.
  - 효과용 그림은 Sprite(캐릭터 투명도 처리에 안 걸림). 효과용 Mesh는 `keep()`(`userData.fxKeep`)으로 표시해 `setOpacity`·그림자에서 뺀다. 효과 그림은 처음엔 안 보여서 목록 그림(`paddleImage`)에는 안 찍힌다.
  - 다른 카테고리용 모형 시안(모자·몸 칠하기·공 궤적)이 커밋 8a2c2f8(`src/items.js`, 원격 브랜치 `claude/nice-franklin-robva2`)에 있음. 해당 카테고리를 만들 때 옮겨 쓴다.
  - 화면: **'꾸미기' 한 화면 `#dress`로 합침**(사용자 확정, 디자인 4단계 참고). 로비 '🛍️ 상점' → 뽑기 탭, '👕 옷장' → 옷장 탭(손님은 안내 토스트). 카드가 차례로 뒤집히며 `playUI('card'|'rare'|'legend')`, 사기는 두 번 눌러야 삼. `.screen.side`로 패널이 오른쪽, 왼쪽에 내 캐릭터 미리보기. **꾸미기에서도 로비 랠리가 계속**되고(사용자 확정), 카메라만 내 캐릭터 등 뒤 가까이로 약 1.1초 동안 스르륵 옮겨 간다(`main.js`의 `PV`·`camBlend`, 로비로 돌아갈 때도 같은 방식). 입어 보는 아이템은 랠리하는 내 캐릭터에 바로 입힌다. 패널은 오른쪽에서 밀려 들어오고(`slideIn`), 로비 메뉴는 서서히 나타난다(`fadeUp`). 랠리 소리는 로비와 꾸미기 화면에서 난다(사용자 확정, 다른 화면은 조용).
  - 꾸미기 적용: `items.applyLook(char, equip)` → `char.setPaddle`. 방에서는 presence의 `look`(입장할 때의 장착)을 `looks()`로 모아 `Game`의 `looks[side][slot]`에. AI는 기본. 로비 배경 캐릭터도 내 장착.
  - 혼자 하기 코인(사용자 확정, 1v1·2v2 분당 코인의 약 50%): **내가 친 4번마다 1코인**. `supabase/05_ai_coins.sql`의 `pingpong_ai_start`(시작 시각)·`pingpong_ai_rally(hits)`(랠리 끝마다, 서버가 경과 초+1번까지만 인정, 나머지 `ai_rem` 이월). 화면은 `Game`의 `onRally` → `aiRally`, HUD에 `🪙 +N`, 나갈 때 토스트.

- **몸 꾸미기 (test에서 사용자 테스트 중)**: 사용자 확정 = 한 벌씩 통째로, 품목 새로 정함(위트·귀여운 것), 곰 인형탈은 몸만(머리는 나중에 세트), 전설은 움직이는 효과 필수, 정성은 일반 < 고급 < 전설.
  - 29종: 일반 10(칠하기) · 고급 14(몸이 음식·동물로 변신, 소품) · 전설 5(영웅 망토·오리 튜브·미러볼·기사 갑옷·곰 인형탈, 효과). `src/outfits.js`의 `OUTFITS`·`PAINT`·`BUILD`, `makeOutfit(id, char)`.
  - 캐릭터: `char.setOutfit(o|null)`(흰 몸통 숨김), 전설 효과는 매 프레임 `char.tickOutfit(t, dt)`. 효과 메시·스프라이트는 `userData.fx`(반투명 설정 안 받음), 원래 반투명 재질은 `material.userData.baseOp`.
  - 시안 보기 페이지 `outfits.html`(`src/outfits-page.js`, vite 빌드 입력에 포함). 주소 옵션 `?id=cape&yaw=3.6&t=2`(각도·시각 고정), `&op=0.38`(경기 중 내 캐릭터처럼 반투명).
  - **전설 5종 다듬기 (사용자 확정 = A안: 디자인 그대로, 모양·효과만 정교하게, test에서 사용자 테스트 중)**: 반사 그림 `envCube('studio'|'steel'|'disco')`(CubeTexture, 공용이라 버리지 않음 — `setOutfit`은 map·normalMap·emissiveMap·alphaMap만 버림).
    - 영웅 망토: 어깨를 감싸고 아래로 퍼지는 주름 망토(바깥 빨강·안 금색), 작게 세운 깃, 보석 고정쇠 + 가슴 금 사슬, 입체 금 방패 문장·벨트 버클·부츠 테, 근육 음영.
    - 오리 튜브: 밝은 노랑, 이음매·바람 꼭지, 위아래 부리·눈 하이라이트·머리 깃털, 파닥이는 날개, 치켜든 꼬리.
    - 미러볼: 거울 조각마다 기울기(normalMap)가 달라 조명을 비춤(`disco` 반사), 반짝 조각 무지개, 뒤로 펼친 깃털 깃, 보석 목줄·보석 버클 벨트, 몸에서 바닥 조명 점으로 뻗는 은은한 빛줄기.
    - 기사 갑옷: 가슴판(능선·불룩) + 허리 판 3겹 + 사슬 치마 + 두 겹 목 보호대(`steel` 반사), 3겹 어깨 갑옷, 입체 금 문장, 허리의 빨간 천(앞뒤, 움직이면 날림), 왼쪽 허리의 칼. LatheGeometry 점은 아래→위 순서여야 겉면이 밖을 본다.
    - 곰 인형탈: 털 껍질 1겹(가장자리 복슬), 볼록한 타원 배 패치(바느질), 입체 하트·단추, 분홍 젤리 발바닥(팔·발), 털뭉치 꼬리, 지퍼 손잡이, 고리 리본, 걸을 때 말랑 출렁.
  - 상점 연결: `supabase/09_bodies.sql`(08 다음, insert만). `items.js`에 `body_<id>`(`outfit` 필드)·기본 `body_none`(DEFAULTS), `applyLook`이 몸도 입힘, 목록 그림 `outfitImage`(탁구채와 같은 `snap`). `main.js` 루프 끝에서 보이는 캐릭터마다 `tickOutfit`. 대기실 이름표·VS 소개에 탁구채+몸 알약(`lookPills`), 발밑 빛 고리는 탁구채·몸 중 높은 등급(`topGrade`).
  - 병아리: 사용자가 준 참고 그림(동글한 노란 공 + 까만 테두리 + 눈·부리·볼터치 + 손 흔드는 날개 + 삐침 털)대로 다시 만듦. 만화 음영 `TOON`(MeshToonMaterial) + 뒤집힌 껍질 테두리. 칠 때 날개 파닥·통 튐.
    - 사용자 확정 = B안: 흰 머리를 숨기고 병아리 한 마리(`HIDE_HEAD` → `makeOutfit`의 `hideHead` → `char.setOutfit`이 `head.visible` 끔). 나중에 머리 아이템을 만들면 병아리를 입었을 때 어떻게 할지 정해야 함(곰 인형탈처럼 세트 처리 등). A안은 `chick(root, char, false)`로 남아 있음.

## 탁구공 (1단계 시안 + 2단계 게임·상점 연결 — test에서 사용자 테스트 전)
- 목록·반응·바운드음은 기획서 4장 '탁구공 목록'. 일반 8(색·무늬) · 고급 8(눈알·스마일·귤·방울토마토·찹쌀떡·타코야끼·계란·8번 당구공) · 전설 3(소행성·드래곤 알·미니 태양).
- 사용자 수정(1단계 확인 뒤): **공은 꼭 둥글지 않아도 됨**(보이는 모양만, 맞는 크기·판정은 같음). 털뭉치 병아리 → **계란**(달걀 모양 `EGG`), 냥냥 공 **폐기**, 소행성은 사용자가 준 사진처럼 길쭉한 땅콩 모양 + 구덩이(`asteroidGeo`, 테두리 없음), 충돌하듯 '쿵-' 소리 + 탁구대에 충돌 자국(`mark: 'crater'`). 계란·드래곤 알은 **스매시로 득점하면 깨짐**. 사용자 확정 = A안: 받는 사람이 놓쳐 공이 몸을 지나가는 순간 공중에서 깨지고(공 숨김), 계란은 털뭉치 병아리(깨진 껍데기 반쪽을 입음)가 받는 쪽 탁구대 끝 위로 톡 떨어져 가운데 쪽으로 3번 폴짝 → 받는 사람 쪽으로 돌아서 '삐약'(글자 + `playPeep`) → 반짝 사라짐(약 2.6초). 드래곤 알은 불꽃과 함께 깨지고 아기 용이 날개 치며 위로 크게 돌아 날아가다 불을 뿜고 '꺄오'(`playRoar`) → 반짝 사라짐(약 2.4초). 깨지는 소리 `playCrack(pos, kind)`. 구현: 공 모델 `userData.fx.hatch`('chick'|'dragon') → `ballFx(...).hatch(ball, pos, dir, 탁구대 높이, 받는 쪽 끝 z, {crack, peep, roar})`(알이면 true → 공 숨김), `makeChick`·`makeBabyDragon`, `kidPos`·`kidKind`. 시안 페이지 '스매시 득점' 단추(보통 랠리 → 스매시 → 놓침 반복).
- 사용자 확정: 방장 공을 모두가 봄, 보기만 다름(판정 같음), **바운드음은 공마다 다르게**(소리 초안은 기획서, 만든 뒤 들어 보고 고침). 일반 공이 들어가면 경기장 뽑기 통이 자동으로 열린다(`poolOpen`).
- **1단계 시안 페이지 (test에서 사용자 확인 전)**: `balls.html`(`src/balls-page.js`, vite 빌드 입력). 탁구대 위를 왔다 갔다 하는 공(보통 랠리/스매시, 가까이/경기 화면, 밝은 곳/어두운 곳) + 20종 목록. 주소 `?id=cat&mode=smash&cam=game&bg=dark`.
  - `src/balls.js`: `BALLS`(id·name·grade·sound), `makeBall(id)`(반지름 1로 만들고 `BALL_R` 0.028배, root → squash(말랑 찌그러짐) → spin(굴러감 'spin' / 얼굴이 날아가는 쪽 'face' / 위가 늘 위 'upright')), `userData.tick(t, dt, {vel, smash})`·`bounce`·`hit`·`fx`(튈 때 효과 `bounce(emit, s)`, 스매시 꼬리 `trail`, 미니 태양 `scorch`). 월드 효과는 `ballFx(scene, fx)`의 `bounce(ball, pos, smash, 탁구대 높이)`·`frame(...)`.
  - `fx.js`: `hit(kind, …)`의 kind에 함수도 됨, grade에 숫자 lv도 됨, 파티클 `floor`(탁구대에 떨어져 멈춤), 그림 `nyang`·`pyo`·`rock`.
  - 소리: `audio.js`의 `BOUNCE_SKINS`·`BOUNCE_GAIN`, `playTable/playFloor(speed, pos, when, skin)`. 음량은 OfflineAudioContext로 재서 기본 바운드음(RMS 약 0.07)에 맞춤.
- **2단계 게임·상점 연결 (test에 올림, 사용자 테스트 전)**: `supabase/17_balls.sql`(insert만, 사용자가 실행 → 일반 공이 들어가 경기장 뽑기가 열림). `items.js`에 `ball_white`(기본, DEFAULTS.ball)·`ball_<id>`(`ball`·`sound` 필드), `CATS.ball.ready`, `ballOf(look)`, 목록 그림 `ballImage`. 꾸미기 '크게 보기'의 🔊는 공이면 `playTable`(튀는 소리). 계란·드래곤 알은 아이템 `hatch` → 설명에 '✨ 스매시 득점 시 특별한 효과'(사용자 확정).
- 옷장 카테고리 칩(사용자 확정): 첫 줄 캐릭터(탁구채·몸·머리·궤적), 둘째 줄 경기장(배경·탁구공·탁구대) — `main.js`의 `CHIP_ROWS`. 아이템 없는 카테고리는 흐린 잠금만('곧' 글자 없음).
  - `scene.js`: `world.ball`은 자리만 잡는 그룹, 모양은 `setBallSkin(id)`로 교체. `setBall(p, visible, smash)`, `ballSound`, `ballBounce(delay, p, smash, floor)`(game.js·lobbyDemo.js가 소리와 같은 세그먼트로 예약), `hatch(pos, dir)`·`clearHatch()`. `render()`가 매 프레임 공 `tick`(속도는 위치 차이) + 튈 때 효과 + 스매시 꼬리 + 알에서 나온 아이.
  - 어떤 공을 보이나(`main.js` 루프 끝, 배경과 같음): 방 = 방장 presence `look.ball`, 로비·꾸미기 = 내 장착(입어 보는 중이면 그것), 혼자 하기 = 내 장착. 대기실 알약 `#room-bg`에 '⚪ 공 이름'(기본 공이면 생략).
  - 알 깨짐(`game.js`의 `smashWatch`·`checkHatch`): 'shot' 이벤트가 스매시이고 받을 사람이 있으면 지켜보다가, 받을 수 있는 마지막 순간(`ideal + WIN_LATE.bad + HOLD + 0.03`)이 지나도 그 공이 그대로면(내 예측 타격·대기 중인 타격 없음) 깨짐 → 공 숨김(`hatched`). 방장 결과보다 먼저 보여 주므로, 뒤늦게 받아친 'shot'이 오면 `clearHatch`로 되돌린다. serveReady에서 초기화. 보기만이라 판정·메시지는 그대로.

## 배경(경기장 뽑기) (사용자 확정 — 고급 5종 상점 연결, test에서 사용자 테스트 전)
- 목록·등급·장면은 기획서 4장 '배경 목록'. 일반 4(체육관 기본·교실·교육장·지하 주차장) · **고급 5(출근길·퇴근길·소풍길·해변·빵집) — 먼저 상점에 넣음** · 전설 3(우주·깊은 바닷속·**눈 오는 밤**).
- **눈 오는 밤은 전설로 올림(사용자 확정)**, 시안 코드는 저장만 하고 상점엔 안 넣음. 나중에 '더 어두운 밤하늘·별' + 전설급 추가 연출(기획서 4장 후보 목록에서 사용자가 고름)로 마저 만든다.
- **울림(잔향)은 배경마다 바꾸지 않는다**(사용자가 나중에 정함).
- **출근길 시안 (test에서 사용자 확인 전)**: `src/arenas.js`의 `buildCommute`. 지금은 주소에 `?bg=commute`를 붙여야 보인다(상점 연결 전). `scene.js`가 `buildArena`로 체육관 대신 짓고 하늘색·안개·조명·`camera.far`를 바꾸며, `world.render()`가 매 프레임 `arena.tick(t, dt, 공 위치, 튐)`. 몰입 연출은 배경 재질 전체를 어둡게(`userData.noFocus`는 제외: 빛 번짐·비).
  - 배치: 넓은 인도 위 탁구대, 옆으로 4차선 도로(0·1차선 한 방향, 2·3차선 반대, 차 12대가 ±150m를 돌고 돎, 09시 게임 차 5종 0.78배), 양쪽 빌딩 숲, 신호등·횡단보도 2곳, 가로등, 빗줄기, 도로 건너편 '㈜ 정시상사' 본사(9시 시계). 통째로 반 바퀴 돌려서(root.rotation.y = π) 로비 카메라에서도 도로가 보인다 → A팀은 도로가 왼쪽, B팀은 오른쪽.
  - 반려동물(사용자 확정: 웰시코기·치즈냥): 탁구대와 도로 사이 벤치. 치즈냥은 벤치 위 식빵 자세(가끔 눈 뜸, 공이 튀면 깜짝), 웰시코기는 벤치 앞에 앉아 고개로 공을 따라감. 09시 게임의 툰 셰이딩·외곽선 그대로.
- **고급 5종 시안 (test에서 사용자 확인 전)**: 주소 `?bg=evening|picnic|beach|snow|bakery`. 파일마다 하나씩 `src/arena-<id>.js`, 공통 도구 `arena-kit.js`(정해진 난수 `seeded`, `skyDome` 하늘, `makeDrift` 떨어지는 알갱이 — `px`를 주면 거리와 상관없이 같은 크기라 카메라 앞에서 공처럼 커지지 않음, `petYaw`, `textTex`·`clockTex`, `makeFacade`), 차 `arena-cars.js`, 반려동물 6종 `arena-pets.js`(09시 게임 그대로, `update(t, dt, yaw, j)`).
  - 퇴근길 = 사내 탁구장: -x 통유리 창(멀리언 그림자가 바닥에 길게, `light.shadow` 9) 너머 노을 해·빛기둥·은행나무·불 켜진 빌딩·차. 앞벽 화이트보드·17:58 시계·비상구, 뒷벽 사원증 걸이·정수기, 오른쪽 벽 게시판·책장. 반려동물 **햄스터(찻잔, 09시에서 '퇴근길 무한모드' 펫) + 앵무새(횃대)**.
  - 소풍길 = 강가 잔디밭: -x 강(물결 흐름)·모래 둑, +x 시골길(차)·'공항 4.8km' 이정표, 빙 둘러 눈 덮인 산, 숲, 꽃·풀(InstancedMesh), 양 팀 머리 위 삼각 깃발 줄(펄럭), 돗자리·바구니·김밥 도시락, 비행기가 26초마다 A팀 앞/B팀 앞 하늘을 번갈아(비행운), 구름·꽃잎·나비. 반려동물 **토끼 + 거북이**.
  - 해변: -x 바다(꼭짓점 물결 + 거품 두 겹 + 물마루), 부표·돛단배·먼 섬, 파라솔·선베드·비치볼(가만히, 사용자 확정)·서핑보드·모래성, 야자수(잎이 촘촘한 잎줄기 3층, 야자수마다 색별로 한 덩어리 `mergeGeometries`), A팀 끝 안전요원 망루, B팀 끝 해변 매점, 갈매기.
  - 눈 오는 밤: 별·달 밤하늘, 공이 눈에 안 묻히게 어두운 돌바닥 광장, 불 켜진 집(굴뚝 연기), 소나무, A팀 끝 큰 트리(전구 반짝·별), B팀 끝 눈사람·'메리 크리스마스' 간판, 양 팀 머리 위 전구 줄, 가로등(가까운 둘은 PointLight).
  - 빵집: A팀 벽 벽돌 오븐(불꽃 일렁임 + PointLight)·칠판 메뉴판·빵 랙(김), B팀 벽 유리 진열장·계산대·OPEN 문·'스매시 베이커리', 왼쪽 빵 선반, 오른쪽 창가 카페 자리(커피 김).
  - 성능: 체육관보다 그리기 호출이 많다(약 160~630, 체육관 87). 느린 PC에서 문제가 되면 움직이지 않는 메시를 재질별로 합치기(09시 게임의 `12-background-update.js` 방식)를 할 것.
- **상점 연결 (test에 올림, 사용자 테스트 전)**: `supabase/15_backgrounds.sql`(insert만, 사용자가 실행). `items.js`에 `bg_gym`(기본, DEFAULTS.bg)·`bg_commute|evening|picnic|beach|bakery`(고급, `arena` 필드), `CATS.bg.ready`, `arenaOf(look)`. 목록 그림은 `public/arenas/<arena>.jpg`(경기 화면 사진 320×180, `swatch`의 `.sw.img.bg`). **경기장 뽑기는 잠시 닫음(사용자 확정)**: 뽑기 통은 '일반' 아이템이 있어야 열린다 — 화면 `items.js`의 `poolOpen`, 서버 `supabase/16_gacha_open.sql`(`pingpong_gacha`가 `closed` 반환), 로컬 가짜 서버도 같음. 일반 아이템을 넣으면 자동으로 열림. 닫혀 있어도 뽑기 탭에 '🔒 잠시 닫혀 있어요' + 들어 있는 아이템 목록(`.pool-peek`, 누르면 '크게 보기'), 직접 구매·조각 교환은 열려 있다.
  - `world.setArena(id)`(scene.js): 체육관도 배경 하나(`gymArena`). 옛 배경은 `disposeArena`로 내림, 몰입 연출 색을 되돌린 뒤 교체. 주소 `?bg=`가 있으면 그것으로 고정(시안 보기).
  - 어떤 배경을 보이나(`main.js` 루프 끝): **방(대기실·경기) = 방장 presence `look.bg`**, 로비·꾸미기 = 내 장착(입어 보는 중이면 그것), 혼자 하기 = 내 장착. 대기실 오른쪽 위 알약 `#room-bg`('🏟️ 해변 · 방장 배경').
  - 디버그 훅 `window.__smash.shop`(testCoins·gacha·equipItem·myEquip, 로컬 가짜 서버 테스트용).
- '09시' 시리즈(출근길·퇴근길·소풍길)는 사용자의 다른 게임 '09시까지 출근하세요'(snow15700-cyber/until09_new, 공개 저장소)와 **아주 잘 맞아야** 한다. 그 게임의 `js/06-scene.js`(도시·은행나무·자연 배경)·`js/07-car-models.js`(차)를 참고해 같은 모양·색으로. 출근길은 탁구대 옆으로 4차선 도로(양 팀 모두 차가 보이게).

## 디자인 손보기 (진행 중, 로비부터 화면별로 — 사용자 확정)
- 색감은 **지금의 따뜻한 주황 + 파랑 유지**. 색은 `style.css`의 `:root` 변수(`--orange`, `--blue`, `--paper`, `--cream` …)로 쓴다.
- 순서: ① 로비 → ② 대기실·코드 입장·로그인 → ③ 랭킹 → ④ 상점·옷장 → ⑤ 경기 중 화면(점수판 등). 단계마다 test에서 사용자 확인.
- **① 로비 (test에서 사용자 테스트 중)**: 안 A '게임 타이틀형'. 왼쪽 = 제목 + '혼자 하기'(주황) + '친구랑 하기' 묶음(1 대 1 / 2 대 2 파랑, 코드로 입장). 오른쪽 위 = 내 정보 칩(이름·코인·⚙️ 메뉴에 PIN 바꾸기/로그아웃) + 전적. 오른쪽 아래 = 랭킹·상점·옷장 아이콘. 왼쪽 아래 '❓ 치는 방법' → 창(`#howto`). 좁은 화면(760px 미만·높이 560px 미만)은 세로로 쌓기.
  - 배경: 두 캐릭터가 끝없이 랠리(`src/lobbyDemo.js`, 실제 물리 사용). 카메라 `LOBBY_CAM`(메뉴를 피해 탁구대를 오른쪽으로 `shift`). 앞쪽 캐릭터는 내 장착. 팔 동작은 `game.js`의 `armPose`를 같이 쓴다.
  - 배경 소리(사용자 확정): **로비·꾸미기 화면에서만** 작은 타구음·바운드음(친 캐릭터의 탁구채 소리). 크기는 `main.js`의 `LOBBY_QUIET`(0.4) → `audio.setQuiet`(위치 있는 소리만 작게·부드럽게, 경기 중엔 1). 브라우저 규칙상 첫 클릭·키 입력 뒤부터 들린다(`unlockAudio`).
  - 다른 게임 바로가기(사용자 확정): '❓ 치는 방법' 옆 알약 `#lnk-until09` → `"09시까지 출근하세요" 플레이 ↗`, 새 탭으로 https://until09-5zhx.vercel.app/ . 로비에만, 휴대폰에서도 보임(`.lb-bottom`으로 두 버튼 묶음).
  - 처음 온 사람에게 '치는 방법' 창 자동으로 한 번(사용자 확정): 닫으면 브라우저에 `smash-howto-seen` 저장.
- **② 로그인·PIN·코드 입장·대기실 (test에서 사용자 테스트 중)**
  - 로그인·PIN 바꾸기: `.screen.left` — 로비처럼 왼쪽에 제목 + 카드, 오른쪽에 랠리 배경.
  - 코드 입장: 4칸 글자 상자(`#code-boxes`, 투명한 `#join-code` 위에 글자를 그림, `renderCodeBoxes`).
  - 대기실: 위에 '← 방 나가기' + 모드·인원 알약, 점선 '방 코드' 표, A팀 | VS | B팀(좁은 화면은 세로). 선수 줄 = 동그란 얼굴(닉네임 첫 글자) + 닉네임 + 꼬리표(N번·👑 방장·손님·나) + ✓ 준비. 빈자리는 점선.
- **③ 랭킹 (test에서 사용자 테스트 중)**: 위 '← 로비로' + 제목, 알약 모양 탭(🏓 승수 / 🔥 최장 랠리). 1~3등 = 시상대(가운데 1등·왼쪽 2등·오른쪽 3등, 금·은·동 받침대, 빈 자리는 '?'), 4등부터 목록(동그란 얼굴, 내 줄 강조 + 자동 스크롤), 맨 아래 검은 '내 순위' 띠(손님은 로그인 안내, 순위 밖이면 안내). `main.js`의 `showRank`.
- **④ 꾸미기 = 상점+옷장 합침 (test에서 사용자 테스트 중)**: 안 A '오른쪽 패널형'(사용자 확정). 패널 = '← 로비로'·제목·지갑, 탭 👕 옷장 / 🎁 뽑기 / 🏅 칭호(`dressTab`). '골라 사기' 탭은 옷장과 겹쳐서 없앰(사용자 확정, 없는 아이템은 옷장의 '크게 보기' 카드에서 산다). 카테고리 칩(아이콘, 아직 없는 건 '곧'), 아이템 카드 4열(아래 등급 색 띠, 없는 것 🔒 흐리게, 가격은 카드에 안 씀). 뽑기 탭 = 캐릭터/경기장 작은 탭, 확률 배지, 전설 보장 막대, 1회(주황)·10회(보라, '10% 이득').
  - 왼쪽 아래 '크게 보기' 카드 `#spot`(`renderSpot`): 고른 아이템(`selId`, 없으면 지금 장착) 큰 그림·등급·이름·상태 + 특수 소리가 있는 것만 '🔊 특별한 소리'(소리 이름은 안 씀, 사용자 확정), 버튼 = 장착하기 / 🪙·🧩 사기(두 번 눌러야) / 🔊 소리 듣기(`playHit`). 옷장에서 가진 것 누르면 바로 장착, 없는 건 입어 보기.
  - 미리보기 카메라 `PV`는 랠리 중인 내 캐릭터 등 뒤(좌우로 움직이면 부드럽게 따라감).
- **⑤ 경기 중 화면 (test에서 사용자 테스트 중)**: 점수판 = 내 쪽/상대 쪽 두 칸(A팀 주황 `t0`·B팀 파랑 `t1`, 점수 바뀐 쪽 숫자 통통 `bump`, 듀스는 아래 노란 알약). 오른쪽 위 랠리 카드(6회부터 🔥 불꽃 색 `hot`, AI는 최고·Perfect·코인 알약). 판정 글자·'내 차례!'는 흰 테두리 + 등급 색(PERFECT 초록 빛). '← 나가기' 알약, 아래 안내 알약, 알림 주황 알약. 경기 끝 = 가운데 큰 결과 띠 `#result`(🏆 승리! 주황 / 😢 아쉬워요 남색, 약 2.7초). `main.js`의 `hud`.

## 대기실에서 서로의 꾸밈 보기 (①②③ test에 올림, 사용자 테스트 전)
- 목적(사용자): 꾸밈이 서로 보여서 '나도 저 아이템 갖고 싶다'는 마음이 들게. 단계: ① 대기실 무대 → ② 클릭하면 연습 스윙 + 탁구채 소리(다른 사람에게도 보임) → ③ 경기 시작 전 3초 VS 소개(건너뛰기 없음).
- 사용자 확정: 대기실에서 옷 갈아입기 없음(입장할 때 차림, presence `look`). 아이템 이름은 보여 주고 **등급은 색·빛으로만**(글자 X). 팔이 없어서 탁구채는 멀리 띄우지 말고 **몸 옆에 붙여 들기**.
- ① 배치 = 안 B '자리 위에 서기': 아래 넓은 카드(`#room-card`)에 자리 칸 A1 A2 | VS | B1 B2, 칸 바로 위에 그 선수의 3D 캐릭터(정면). 빈자리는 흐린 실루엣 + '빈자리 · 기다리는 중'. 빈 칸 누르면 그 팀으로, 내 칸 누르면 빠지기. 머리 위 HTML 이름표 `#room-labels`(닉네임 + 탁구채 그림·이름, `.it.g-legend` 금빛 반짝 / `g-rare` 보라). 발밑 빛 고리 `setGlow`(카드에 가려 거의 안 보임). 결과·코인·상대 전적은 위 가운데 `.room-news`.
- ② 연습 스윙 (test에서 사용자 테스트 전): 대기실 3D 부분을 누른 채 위로 밀면 휘두르기(위로 40px 이상 perfect, 12px 이상 good), 그냥 누르면 툭(block). 경기와 같이 누르기 직전 0.15초 ~ 직후 0.12초 움직임(이벤트 `timeStamp` 기준). 내 소리는 그대로, 남의 소리는 그 캐릭터 쪽에서 작게(위치 소리). 0.45초에 한 번까지. 메시지 `{k:'sw', id, g}`. 팀을 안 골랐으면 안내 토스트. 왼쪽 위 안내 알약 `#room-hint`. `main.js`의 `SWING`·`practiceSwing`·`holdPose`.
- ③ VS 소개 (test에서 사용자 테스트 전): 'go'를 받은 순간부터 3초(`INTRO`), 1v1·2v2만(혼자 하기 X). 0~1초 상대 팀 앞에서 카메라가 다가감 → 1~2초 우리 팀 → 2~3초 옆에서 크게(우리 팀 왼쪽) + VS 도장(`playUI('rare')`) + 2.4초 '준비하시고, 스매시!'(`playUI('turn')`). 팀이 소개될 때 각자 한 번 휘두르며 그 탁구채 소리. 이름 카드(닉네임 + 탁구채 그림·이름, 등급은 색) 상대 오른쪽·우리 왼쪽 `#vs-intro`. 그동안 HUD 숨김(`body.intro`), 클릭 무시(`game.paused`), `game.update` 대신 `introFrame`. 끝나면 `endIntro`가 경기 모습으로 되돌리고 방장만 `match.start`(참가자는 방장의 serveReady를 받음). 경기가 중간에 취소되면 `stopGame` → `endIntro(false)`.
- 소리 크기 `setQuiet`는 매 프레임 루프에서 정한다(경기·대기실 1, 로비·꾸미기 `LOBBY_QUIET`). 예전에는 이 줄이 'pong' 메시지 처리 안에 잘못 들어가 있어서 로비 배경 소리가 줄지 않았다(고침).
  - 구현: `main.js`의 `STAGE`·`stageFrame`(매 프레임, 칸의 화면 x → `world.screenToX`로 캐릭터 x, `world.toScreen`으로 이름표), `stageOff`(대기실을 떠나면 경기 자세·카메라 되돌림). `scene.js`의 `setStageView(h)`(카드 위 공간 높이에 맞춰 구도, `setViewOffset`), 캐릭터 `setHold`·`setGlow`.

## 모바일 (1단계, test에서 사용자 테스트 중)
- 사용자 확정: 휴대폰은 **혼자 하기만**. 로비에 'PC에서 즐겨 주세요' 안내(`#mobile-note`), 1v1·2v2·코드 입장 버튼은 흐리게 잠그고 누르면 토스트. 상점·옷장·랭킹은 그대로.
- 판별: `main.js`의 `IS_MOBILE`(UA의 Android·iPhone 등 + 아이패드 + 터치만 있고 hover 없음). 갤럭시는 S펜 때문에 `any-pointer: fine`이라 미디어 쿼리만으로는 안 잡힌다. 주소에 `?mobile=1`이면 PC에서도 흉내. `body.mobile canvas`에 `touch-action: none`(밀어도 스크롤·확대 안 됨).
- 아직 안 한 것(2단계 후보): 터치용 스윙 판정(손가락은 닿기 전 움직임이 없어 HOLD 0.09초 안에 밀어야 함), 휴대폰 방장 문제, LTE 지연·앱 전환 끊김, 화면 안내 문구('클릭', '마우스')를 터치용으로.

## 링크 미리보기 (카톡 등, test에서 사용자 테스트 중)
- 사용자 확정: 안 A '게임 화면형'(왼쪽 큰 제목 + 흰 알약 문구, 오른쪽 체육관 2대2 장면). 설명 문구 **"친구들과 복식 한 판 어때요?"**.
- `index.html`의 `og:*` 태그 + 그림 `public/og.jpg`(1200×630). 주소는 main 배포 `https://ready-smash.vercel.app/` 고정(카톡은 전체 주소가 필요).
- 그림은 로비 장면을 Playwright로 찍고(팀원 한 명씩 더 세움) HTML로 제목을 얹어 캡처해서 만들었다.
- 카톡은 미리보기를 기억해 둔다 → 바꾼 뒤엔 카카오 공유 디버거(developers.kakao.com/tool/debugger/sharing)에서 '캐시 초기화'.

## 업적·칭호 (①②③ test에서 사용자 테스트 중, SQL 10·11은 사용자가 실행함)
- 전체 목록·규칙은 **기획서 11장**. 사용자 확정: 목록 전부 추가, 놀림형 칭호 OK, **칭호는 하나만** 달고 꾸미기 '🏅 칭호' 탭에서 언제든 바꾸기, 보상 ★20/★★50/★★★150코인, 이름표 **B안(두 줄, 칭호 알약)** — 칭호 알약은 모두 남색 `#3d3b5c`.
- **숨은 업적 없음**(사용자 확정): 업적 이름·조건은 모두 보이고, **칭호 글자만 깨기 전에 '칭호 ???'**.
- ① `supabase/10_achievements.sql`: 표 `pingpong_ach`(id·grade)·`pingpong_ach_got`, 선수 `title`. 함수 `pingpong_achievements`(목록 + 새로 깬 것 `new`)·`pingpong_set_title`. 랭킹에 `title`.
- ② `supabase/11_ach_match.sql`(10 다음): 선수 `ach_n`(누적 숫자 jsonb)·`ach_at`(10초 규칙). `pingpong_ach_match(token, mode, won, stats)` — 한 경기 업적은 바로, 누적은 `ach_n`에 더한 뒤 `pingpong__ach_check`(10의 것 + 누적)로. 지급은 `pingpong__ach_grant`. 오리·빵 탁구채 업적은 서버의 `equip`, 하루 판 수·아침 9시는 서버 시각(한국).
  - 화면: `game.js`의 `trackAch`(모든 이벤트에서 내 기록: 판정·방향(`lastLocal`)·타이밍·스매시·찬스볼·서브·점수 흐름·2v2 내 득점) → `achSummary(score)` → `main.js` `saveResult` → `achMatch`. 혼자 하기는 `onRally`에서 친 횟수 1 이하면 `achMatch('ai', …, {aizero:1})`.
  - 목록은 두 곳: `src/achievements.js`(`ACHS`, `live` = 지금 셀 수 있음)와 SQL insert. 로컬 가짜 서버는 `account.js`의 `localAchMatch`(같은 규칙).
- ③ `supabase/12_ach_people.sql`(11 다음): `pingpong_ach_people(token, mode, won, opp, mate)` — `achMatch` 다음에 부름(같은 경기 한 번만, `ach_n.people_at`). 천적 = h2h `lose_run` 5 → 칭호 「(상대 닉네임) 공포증」(`ach_n.nemesis`, 처음 깬 상대로 고정, `titleText(id, x)`·presence `titleX`·랭킹 `title_x`·player json `nemesis`). 복수 = 그 상대에게 3패 이상인데 이김. 짝꿍 = `ach_n.duo{팀원 번호: 승수}`. 뽑기 횟수 = 트리거 `pingpong_count_gacha`(코인이 100·900 줄면 `ach_n.gacha`). 출석 = `pingpong_daily`가 `ach_n.days`·`days_run`(이 SQL 넣은 날부터).
- 이제 58개 모두 깰 수 있음. 다음 후보 ④: 연출 다듬기(승리 세리머니 등, 기획서 11장).

## 사용자가 확정한 결정 (바꾸기 전에 사용자에게 확인)
- 캐릭터: 흰색 몸통+흰색 머리만, 팔 없음, 탁구채만 떠 있음. **내 캐릭터는 반투명**(0.38), 상대·팀원은 불투명. 탁구채 기본은 빨강, 옷장에서 장착한 것으로 바뀐다(`items.js`).
- 체육관은 단순하게(벽, 나무 바닥, 강당 무대·커튼, 현수막만).
- 카메라: 어깨 뒤 낮게 + 공 따라가기 + 타격 시 흔들림 (`src/scene.js`의 `CAM`).
- 조작: **마우스를 누른 채로 위로 밀어 올리기** = 스윙. 클릭 직전 0.15초 ~ 직후 `HOLD`(0.09초)의 움직임을 본다. 위로 안 올리면 블록.
- 판정 범위(`physics.js`의 `WIN`/`WIN_LATE`, `judge`): 일찍 친 쪽 perfect 0.045 / good 0.1 / bad 0.17초, **늦게 친 쪽은 좁게** perfect 0.045 / good 0.08 / bad 0.14초(공이 몸을 지나간 뒤 넘어가지 않게, 사용자 확정). 늦게 0.14초를 넘으면 블록도 놓침.
- 방향: 올리는 방향으로 왼쪽/가운데/오른쪽 3방향만. 옆 이동이 위 이동의 **30%** 이상이면 좌우.
- 타구음은 클릭 즉시 로컬 재생. 방향을 읽는 HOLD 동안 공은 라켓에 머문 뒤 출발.
- 서브 토스 위속도 3.6 (약 0.8m 위로). 서브 헛스윙은 실점 없이 다시 토스.
- 랠리 속도 증가: 구조는 있지만 **현재 0** (`src/match.js`의 `SPEED_STEP`). 인터넷 지연 때문에 계속 빨라지는 방식은 쓰지 않는다.
- 찬스볼·스매시 (1v1·2v2·AI, `match.js`의 `CHANCE_RALLY`/`SMASH_SPEED`/`SMASH_OUT`): 랠리 6회 넘은 뒤 BAD로 친 공 = 찬스볼 → 받는 사람 화면에만 '똑 똑 똑 띵' 신호음(마지막 높은 음 = perfect 타이밍, `audio.playCue`). 찬스볼을 PERFECT로 치면 스매시(그 공만 1.2~1.4배 랜덤, seed로 정해 모든 PC 같음). 스매시를 BAD(또는 GOOD 범위 밖 블록)로 받으면 아웃. **스매시는 높이 튀지 않고 낮고 빠르게 깔려 온다**(사용자 확정: 상대 탁구대 첫 바운드만 `physics.js`의 `E_SMASH` 0.4, 세그먼트 `smash` 표시). 이벤트 `shot`의 `kind`('chance'|'smash'|'out'), `computeShot`의 `incoming`/`dt`.
- 몰입 연출(1v1·2v2·AI): 랠리 6회부터 서서히 15회에 최대로 타구음·바운드음 에코(`audio.setEcho`) + 체육관 어두워짐(`world.setFocus`, 선수·탁구대·공은 그대로), 점수 나면 약 1초에 원래대로. 설정은 `game.js`의 `FOCUS`, `scene.js`의 `FOCUS_DARK`.
- 타이밍 링은 칠 자리가 화면 밖이어도 화면 가장자리 안쪽에 보인다(`game.js`의 `RING`).

## 구조
- `src/physics.js` 공 궤적(해석적 세그먼트), 판정 범위, 샷 계획. 결정론적(같은 입력 → 같은 결과).
- `src/match.js` 경기 기준 로직(방장/혼자 모드에서만 실행). `computeShot`은 방장과 상대 PC가 같이 쓴다.
- `src/game.js` 화면 쪽: 이벤트를 받아 공·캐릭터·링·소리 처리, 내 입력 판정, 상대 PC의 타격 예측.
- `src/scene.js` Three.js 체육관·탁구대·캐릭터·카메라. `src/audio.js` Web Audio 합성음.
- `src/net.js` Supabase Realtime Broadcast + presence. 채널 `pingpong-room-XXXX`. 설정이 없으면 BroadcastChannel로 같은 브라우저 탭끼리만 연결(로컬 테스트, `?lag=80`으로 지연 흉내).
- `src/main.js` 로비·방·대기실 흐름, 시계 맞추기(ping/pong), 매 프레임 루프.

## 동기화 규칙
- 방장(어느 쪽에 서든)이 공 궤적·판정·점수를 계산해 `{k:'ev', ev}`로 보낸다. 참가자는 `{k:'in', kind:'toss'|'swing', t, dir, up, from}`만 보낸다.
- 시각은 모두 **방장 시계** 기준. 상대 PC는 `game.offset`(ping 최소 RTT 표본)으로 변환한다.
- 상대 PC는 자기 타격을 `computeShot`으로 먼저 계산해 보여 주고, 방장 결과가 오면 맞춘다. 방장은 원격 선수 입력을 0.45초 더 기다린다.
- 매 프레임 `game.decideHit` → `match.update` → `game.update` 순서를 지킬 것(느린 PC에서 늦은 스윙이 버려지지 않게).

## 배포 흐름 (사용자가 확정)
- 새 작업은 **항상 `test` 브랜치에 먼저 올린다**(작업 브랜치에서 커밋 후 `git push origin HEAD:test`). Vercel 미리보기 주소에서 사용자가 테스트한다.
- **`main`으로 합치는 건 사용자가 직접 한다.** Claude는 `main`에 push·merge하지 않는다.
- 미리보기 배포(`VITE_VERCEL_ENV`가 production이 아님)에서는 상단에 '🧪 테스트 버전' 표시가 뜨고, 방 채널이 `pingpong-test-room-XXXX`로 분리된다(`src/net.js`의 `IS_TEST`).

## 환경 변수 / 배포
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(publishable, 공개용). 로컬은 `.env.local`(git 제외), 배포는 Vercel 프로젝트 설정.
- GitHub `main`에 올리면 Vercel이 자동 배포한다. 다른 브랜치는 미리보기(Preview) 주소가 생긴다.
- Supabase 프로젝트는 다른 게임과 공유한다. DB 테이블을 만들 때는 `pingpong_` 접두어를 붙인다.

## 테스트 요령
- `npm run dev` 후 Playwright(사전 설치됨)로 확인. 헤드리스 swiftshader는 매우 느려서(초당 수 프레임) 타이밍 결과가 흔들린다. 판정 테스트는 페이지 안에서 `PointerEvent`를 직접 쏘는 방식이 안정적이다.
- 1v1은 같은 브라우저 컨텍스트의 탭 두 개(로컬 모드) 또는 컨텍스트 두 개 + Supabase로 확인한다. 디버그 훅: `window.__smash.{world, game, match, room}`.
- 사용자에게 줄 단일 HTML이 필요하면 `npm run build` 후 `dist/assets/*.js`와 css를 `index.html`에 인라인한다(함수형 replace로 `$` 패턴 주의).
