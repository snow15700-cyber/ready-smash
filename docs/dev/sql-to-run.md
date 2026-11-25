# Supabase SQL 실행 목록 (사용자가 SQL Editor에서 직접 실행)

모든 파일은 **여러 번 실행해도 괜찮아요**. 이미 실행한 것을 다시 해도 문제없으니, 헷갈리면 아래 순서대로 전부 실행하면 됩니다.
Supabase → SQL Editor → New query → 파일 내용을 통째로 붙여넣기 → Run.

## test 브랜치를 쓰기 전에 (11/25 기준, 문서에 '실행 필요'로 남아 있는 것)
| 순서 | 파일 | 무엇 |
|---|---|---|
| 1 | `supabase/22_tables.sql` | 탁구대 아이템 (뽑기·게임 연결) |
| 2 | `supabase/23_heads_faces.sql` | 머리·얼굴 아이템 (24보다 먼저) |
| 3 | `supabase/24_sets.sql` | 세트 |
| 4 | `supabase/25_free_pulls.sql` | 무료 뽑기 50회 |
| 5 | `supabase/26_ai_coins_up.sql` | 혼자 하기 코인 (이미 했으면 건너뛰어도 됨) |
| 6 | `supabase/27_kim_match.sql` | 광장 김제빵 탁구대 경기 |
| 7 | `supabase/28_fishing.sql` | 낚시 서버(코인·도감·업적·월척 랭킹) |
| 8 | `supabase/29_fish_size.sql` | 물고기 크기 '최대 없음 + 긴 꼬리' |
| 9 | `supabase/30_fish_pier.sql` | 전망대 밑 선착장 자리(기포·서는 곳) + 서버 시각 `pingpong_now` |
| 10 | `supabase/31_fish_pier_wide.sql` | **새로**: 계단 양쪽 + 선착장 서쪽으로 넓힘(서는 곳 x 1.3~20.8) + 기포 약 2분마다 1~2곳·30초 |

- **28 → 29 → 30 → 31 순서는 꼭 지켜 주세요** (30·31이 앞 파일의 함수를 새 자리로 바꿔 씀).
- 31을 안 하면 화면의 기포(새 시간표)와 서버가 '기포 근처'로 보는 곳이 달라서 기포 위에 던져도 효과가 없어요.
- 30을 실행하기 전에는 test 주소에서 낚시하면 "서버 기록 실패"가 날 수 있어요 (던지기 함수 모양이 바뀌어서).
- 실행했는지 확인: SQL Editor에서 `select public.pingpong_now();` → `{"ms": ...}`가 나오면 30까지 된 거예요.
