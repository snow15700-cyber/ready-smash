// 자동 점검: 고친 뒤 test에 올리기 전에 한 번 돌린다 →  npm run check
// (GitHub에 올리면 .github/workflows/check.yml이 같은 점검을 자동으로 돌린다)
//
//  1. 빌드        — vite build가 되는지
//  2. 서버 SQL    — supabase/*.sql을 빈 DB에 01부터 차례로 두 번 실행(여러 번 실행해도 되는지),
//                   anon(브라우저) 권한으로 가입·로그인·상점·뽑기·장착·업적·랭킹을 불러 보고, 표를 직접 못 읽는지
//  3. 목록 맞추기 — items.js ↔ SQL 아이템(등급·뽑기 통·카테고리), achievements.js ↔ SQL 업적, 목록 그림 파일
//  4. 화면        — 브라우저로 게임을 띄워 손님·로그인(로컬 가짜 서버), 혼자 하기, 꾸미기, 랭킹, 광장(걷기·채팅·가게),
//                   광장 탁구대 1대1(서기→준비→경기→한 판 더, 탭 두 개)·관전, 배경 9종, 시안 페이지를 돌려 보고 오류가 없는지
//
// 옵션: --no-sql (DB 점검 건너뛰기) --no-browser (화면 점검 건너뛰기)
// DB: 환경 변수 CHECK_PG(예: postgres://postgres:postgres@localhost:5432)가 있으면 그것, 없으면 이 PC의 PostgreSQL(su postgres).
//     둘 다 없으면 2번은 건너뛰고 3번은 SQL 파일을 직접 읽어서 비교한다.
// 화면 점검은 진짜 Supabase를 절대 쓰지 않는다(VITE_SUPABASE_URL을 비워서 로컬 가짜 서버·탭끼리 연결로만).
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const PORT = 5197;
const results = [];
let failed = 0;

const say = (s) => process.stdout.write(s + '\n');
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    if (note === 'skip') { results.push(['–', name, '건너뜀']); say(`–  ${name} (건너뜀)`); return; }
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    results.push(['✓', name, note || '']);
    say(`✓  ${name}${note ? ' — ' + note : ''} (${sec}초)`);
  } catch (e) {
    failed++;
    results.push(['✗', name, e.message]);
    say(`✗  ${name}\n     ${String(e.message).split('\n').join('\n     ')}`);
  }
}
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

/* ───────── 1. 빌드 ───────── */
function build() {
  const r = spawnSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: ROOT, encoding: 'utf8' });
  must(r.status === 0, (r.stderr || r.stdout || '').slice(-1500) || '빌드 실패');
  const js = fs.readdirSync(path.join(ROOT, 'dist', 'assets')).filter((f) => f.endsWith('.js'));
  const kb = js.reduce((s, f) => s + fs.statSync(path.join(ROOT, 'dist', 'assets', f)).size, 0) / 1024;
  return `JS ${js.length}개 ${kb.toFixed(0)}KB`;
}

/* ───────── 2. 서버 SQL ───────── */
const SQL_FILES = fs.readdirSync(path.join(ROOT, 'supabase')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
let psql = null; // (db, sql) => 출력 (실패하면 throw)
function findPostgres() {
  const run = (cmd, argv, input) => {
    const r = spawnSync(cmd, argv, { input, encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || '').split('\n').filter((l) => !/NOTICE/.test(l)).join('\n').trim().slice(0, 1500) || 'psql 실패');
    return r.stdout.trim();
  };
  const base = process.env.CHECK_PG;
  if (base) return (db, sql) => run('psql', [`${base.replace(/\/+$/, '')}/${db}`, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], sql);
  if (spawnSync('which', ['psql']).status !== 0 || process.getuid?.() !== 0) return null;
  const local = (db, sql) => run('su', ['postgres', '-c', `psql -d ${db} -X -q -At -v ON_ERROR_STOP=1`], sql);
  try { local('postgres', 'select 1'); return local; } catch { /* 꺼져 있으면 켜 본다 */ }
  spawnSync('service', ['postgresql', 'start'], { stdio: 'ignore' });
  for (let i = 0; i < 10; i++) { try { local('postgres', 'select 1'); return local; } catch { spawnSync('sleep', ['1']); } }
  return null;
}
const DB = 'smash_check';
async function sqlCheck() {
  if (args.has('--no-sql')) return 'skip';
  psql = findPostgres();
  if (!psql) { say('   (PostgreSQL이 없어 DB 점검은 건너뛰고, 목록 맞추기는 SQL 파일을 직접 읽어요)'); return 'skip'; }
  psql('postgres', `drop database if exists ${DB};`);
  psql('postgres', `create database ${DB};`);
  // Supabase 흉내: extensions 스키마(pgcrypto), anon·authenticated 역할
  psql(DB, `create schema if not exists extensions; create extension if not exists pgcrypto schema extensions;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    grant usage on schema public, extensions to anon, authenticated;`);
  for (const round of [1, 2]) for (const f of SQL_FILES) {
    try { psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8')); }
    catch (e) { throw new Error(`${f} (${round}번째 실행)에서 오류:\n${e.message}`); }
  }
  // 브라우저와 같은 anon 권한으로 기능 하나씩
  const q = (sql) => psql(DB, `set role anon; ${sql}`);
  const json = (sql) => JSON.parse(q(`select (${sql})::text;`));
  const su = json(`public.pingpong_signup('점검봇', '1234')`);
  must(su.status === 'ok' && su.token, '가입 실패: ' + JSON.stringify(su));
  const tk = `'${su.token}'`;
  must(json(`public.pingpong_signup('점검봇', '9999')`).status !== 'ok', '같은 닉네임으로 또 가입됨');
  must(json(`public.pingpong_login('점검봇', '0000')`).status === 'wrong_pin', '틀린 PIN이 통과됨');
  must(json(`public.pingpong_login('점검봇', '1234')`).status === 'ok', '로그인 실패');
  must(json(`public.pingpong_me(${tk})`).status === 'ok', 'me 실패');
  json(`public.pingpong_daily(${tk})`);
  must(json(`public.pingpong_shop(${tk})`).status === 'ok', '상점 목록 실패');
  // 뽑기용 코인은 운영자처럼 직접 넣는다
  psql(DB, `update public.pingpong_players set coins = 5000 where nick = '점검봇';`);
  const g = json(`public.pingpong_gacha(${tk}, 'char', 10)`);
  must(g.status === 'ok', '캐릭터 뽑기 10회 실패: ' + JSON.stringify(g).slice(0, 200));
  // 25 무료 뽑기 50회: 무료 횟수부터 쓰고(코인 그대로), 다 쓰면 코인
  must(g.free === 40 && g.player.coins === 5000 && g.used_free === true, '무료 뽑기가 이상해요: ' + JSON.stringify({ free: g.free, coins: g.player.coins }));
  psql(DB, `update public.pingpong_players set free_pulls = 0 where nick = '점검봇';`);
  const g2 = json(`public.pingpong_gacha(${tk}, 'arena', 1)`);
  must(g2.status === 'ok' && g2.free === 0 && g2.player.coins === 4900, '무료를 다 쓴 뒤 코인 뽑기가 이상해요: ' + JSON.stringify({ s: g2.status, free: g2.free, coins: g2.player?.coins }));
  const b = json(`public.pingpong_buy(${tk}, 'paddle_gold', 'coins')`);
  must(['ok', 'owned'].includes(b.status), '직접 구매 실패: ' + JSON.stringify(b).slice(0, 200));
  must(json(`public.pingpong_equip(${tk}, 'paddle', 'paddle_gold')`).status === 'ok', '장착 실패');
  must(json(`public.pingpong_achievements(${tk})`).status === 'ok', '업적 목록 실패');
  json(`public.pingpong_ranking('wins')`);
  json(`public.pingpong_ranking('rally')`);
  // 19 쉬는 시간 보너스: 서버 규칙(pingpong__is_break) == 화면 규칙(src/breaks.js)
  const { breakAt } = await import(path.join(ROOT, 'src', 'breaks.js'));
  const times = [];
  for (const day of ['2026-11-16', '2026-11-20', '2026-11-21', '2026-11-22']) // 월·금·토·일
    for (let m = 8 * 60; m <= 19 * 60; m += 5) times.push(`${day}T${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+09:00`);
  times.push('2026-11-16T09:59:59+09:00', '2026-11-16T10:00:00+09:00', '2026-11-16T12:59:59+09:00', '2026-11-16T13:00:00+09:00', '2026-11-16T18:00:00+09:00');
  const srv = psql(DB, `select string_agg(public.pingpong__is_break(t::timestamptz)::text, ',' order by n) from unnest(array['${times.join("','")}']) with ordinality as x(t, n);`).split(',');
  times.forEach((t, i) => must((srv[i] === 'true') === !!breakAt(Date.parse(t)), `쉬는 시간 규칙이 서버와 화면이 달라요: ${t} 서버 ${srv[i]}`));
  must(srv.filter((x) => x === 'true').length > 0, '쉬는 시간이 하나도 없어요');
  // 보너스가 실제로 붙는지: 잠시 '언제나 쉬는 시간'으로 바꾸고 경기 하나 정산 → 19를 다시 실행해 되돌림
  psql(DB, `create or replace function public.pingpong__is_break(t timestamptz) returns boolean language sql as $$ select true $$;`);
  const mid = '00000000-0000-4000-8000-000000000019';
  must(json(`public.pingpong_match_join(${tk}, '${mid}', '1v1', 0)`).status === 'ok', '경기 입장 실패');
  psql(DB, `update public.pingpong_matches set started_at = now() - interval '2 minutes' where id = '${mid}';`);
  const fin = json(`public.pingpong_match_result(${tk}, '${mid}', true, 0, 0)`); // 32 새 함수 (옛 함수는 33이 닫음, 19를 다시 실행하면 다시 열림)
  must(fin.status === 'ok', '경기 정산 실패: ' + JSON.stringify(fin).slice(0, 200));
  // 혼자 하기: 8번 친 랠리 = 2코인 + 쉬는 시간 1코인 (19를 다시 실행하기 전, 아직 '언제나 쉬는 시간')
  json(`public.pingpong_ai_start(${tk})`);
  psql(DB, `update public.pingpong_players set ai_at = now() - interval '1 minute', ai_rem = 0 where nick = '점검봇';`);
  const air = json(`public.pingpong_ai_rally(${tk}, 8)`);
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '19_break_bonus.sql'), 'utf8'));
  const brk = fin.coins.items.find((i) => /쉬는 시간/.test(i.label));
  must(brk && brk.coins === 10 && fin.coins.total === 30, '쉬는 시간 보너스가 안 붙어요: ' + JSON.stringify(fin.coins));
  must(air.status === 'ok' && air.coins === 3 && air.bonus === 1, '혼자 하기 쉬는 시간 보너스가 이상해요: ' + JSON.stringify(air).slice(0, 200));
  // 21 오늘의 미션: 날짜로 고르는 규칙 서버 == 화면(src/missions.js), 미션 달성·코인
  const { missionsOf } = await import(path.join(ROOT, 'src', 'missions.js'));
  const days = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 10, 10 + i)).toISOString().slice(0, 10));
  const srvM = psql(DB, `select string_agg(array_to_string(public.pingpong__missions_of(d::date), ','), ';' order by n) from unnest(array['${days.join("','")}']) with ordinality as x(d, n);`).split(';');
  days.forEach((d, i) => must(srvM[i] === missionsOf(d).join(','), `오늘의 미션 고르기가 서버와 화면이 달라요: ${d} 서버 ${srvM[i]} 화면 ${missionsOf(d)}`));
  must(new Set(srvM.slice(0, 15)).size === 15, '15일 동안 미션 짝이 다 한 번씩 안 나와요');
  // 잠시 오늘의 미션을 '새 상대·2대2·응원'으로 고정 → 정산 → 21을 다시 실행해 되돌림
  psql(DB, `create or replace function public.pingpong__missions_of(d date) returns text[] language sql immutable as $$ select array['new_opp', 'duo', 'cheer3'] $$;`);
  const su2 = json(`public.pingpong_signup('점검봇2', '1234')`);
  const tk2 = `'${su2.token}'`;
  const playMatch = (id, mode) => {
    must(json(`public.pingpong_match_join(${tk}, '${id}', '${mode}', 0)`).status === 'ok', '미션 경기 입장 실패');
    must(json(`public.pingpong_match_join(${tk2}, '${id}', '${mode}', 1)`).status === 'ok', '미션 경기 입장 실패(상대)');
    psql(DB, `update public.pingpong_matches set started_at = now() - interval '2 minutes' where id = '${id}';`);
    must(json(`public.pingpong_match_finish(${tk}, '${id}', true, 0, 0)`).status === 'ok', '미션 경기 정산 실패');
    return json(`public.pingpong_mission_match(${tk}, '${id}', 0, 0)`);
  };
  must(json(`public.pingpong_missions(${tk})`).missions.list.length === 3, '오늘의 미션이 3개가 아니에요');
  const mm1 = playMatch('00000000-0000-4000-8000-000000000211', '1v1');
  must(mm1.status === 'ok' && mm1.new.join() === 'new_opp' && mm1.coins === 30, '새 상대 미션이 이상해요: ' + JSON.stringify(mm1).slice(0, 300));
  must(json(`public.pingpong_mission_match(${tk}, '00000000-0000-4000-8000-000000000211', 0, 0)`).status === 'done', '같은 경기로 미션을 두 번 확인했어요');
  const mm2 = playMatch('00000000-0000-4000-8000-000000000212', '2v2');
  must(mm2.new.join() === 'duo' && mm2.coins === 30, '2대2 미션이 이상해요(같은 상대는 새 상대 아님): ' + JSON.stringify(mm2).slice(0, 300));
  const cheer = () => json(`public.pingpong_mission_cheer(${tk})`);
  const c1 = cheer(), c2 = cheer(); // 1.5초 안 두 번째는 안 셈
  must(c1.missions.cheer === 1 && c2.missions.cheer === 1, '응원 미션: 1.5초 안 연속 응원을 셌어요');
  psql(DB, `update public.pingpong_players set mission = jsonb_set(mission, '{cheer_at}', '0') where nick = '점검봇';`); cheer();
  psql(DB, `update public.pingpong_players set mission = jsonb_set(mission, '{cheer_at}', '0') where nick = '점검봇';`);
  const c3 = cheer();
  must(c3.new.join() === 'cheer3' && c3.all === true && c3.coins === 80, '응원 3번 → 미션 + 모두 달성 +50이 이상해요: ' + JSON.stringify(c3).slice(0, 300));
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '21_missions.sql'), 'utf8'));
  // 24 세트: 위에서 19·21을 다시 실행해 세트가 빠진 함수로 돌아갔으니 24를 다시 → 세트 칭호·코인
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '24_sets.sql'), 'utf8'));
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '26_ai_coins_up.sql'), 'utf8')); // 26: 혼자 하기 3번에 1코인
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '27_kim_match.sql'), 'utf8')); // 27: 24를 다시 실행해 덮인 경기 정산을 김제빵 판 규칙으로
  // 27 김제빵 낀 2대2: 전적(승수)·연승은 그대로, 코인은 보통 2대2와 같게(참여+승리), '김제빵' 줄
  {
    const km = '00000000-0000-4000-8000-000000000027';
    const before = psql(DB, `select wins_2v2 || ',' || win_streak from public.pingpong_players where nick = '점검봇';`);
    const s2 = json(`public.pingpong_signup('점검빵친구', '1234')`);
    const j1 = json(`public.pingpong_match_join(${tk}, '${km}', '2v2', 0)`), j2 = json(`public.pingpong_match_join('${s2.token}', '${km}', '2v2', 1)`);
    must(j1.status === 'ok' && j2.status === 'ok', '김제빵 판 입장 실패: ' + JSON.stringify([s2.status, j1, j2]));
    must(json(`public.pingpong_match_kim(${tk}, '${km}')`).status === 'ok', '김제빵 판 표시 실패');
    psql(DB, `update public.pingpong_matches set started_at = now() - interval '2 minutes' where id = '${km}';`);
    const kf = json(`public.pingpong_match_finish(${tk}, '${km}', true, 0, 0)`);
    const after = psql(DB, `select wins_2v2 || ',' || win_streak from public.pingpong_players where nick = '점검봇';`);
    must(kf.status === 'ok' && after === before && kf.coins.items.some((i) => /김제빵/.test(i.label)) && kf.coins.items.some((i) => i.label === '승리' && i.coins === 10), '김제빵 판 정산이 이상해요: ' + JSON.stringify({ before, after, items: kf.coins?.items }).slice(0, 300));
  }
  psql(DB, `insert into public.pingpong_inventory(player_id, item_id) select id, x from public.pingpong_players, unnest(array['head_nightcap', 'body_starpj', 'face_sleepy']) x where nick = '점검봇' on conflict do nothing;`);
  for (const [c, i] of [['head', 'head_nightcap'], ['body', 'body_starpj'], ['face', 'face_sleepy']]) json(`public.pingpong_equip(${tk}, '${c}', '${i}')`);
  const setAch = json(`public.pingpong_achievements(${tk})`).new.map((n) => n.id);
  must(setAch.includes('set_sleepy') && setAch.includes('setfull_sleepy'), '세트 칭호가 안 나와요: ' + setAch.join());
  json(`public.pingpong_ai_start(${tk})`);
  psql(DB, `update public.pingpong_players set ai_at = now() - interval '100 seconds', ai_rem = 0 where nick = '점검봇';`);
  const setAi = json(`public.pingpong_ai_rally(${tk}, 40)`);
  must(setAi.set_coins === 4 && setAi.coins - setAi.bonus === 17 && /꿀잠/.test(setAi.set), '혼자 하기 40번 = 13코인 + 꿀잠 완전 세트 +30%(4)가 이상해요: ' + JSON.stringify(setAi).slice(0, 200));
  // 32 공정한 결과: 위에서 19·24·26·27을 다시 실행해 덮였으니 32를 다시 → 혼자 하기 하루 250 · 1.2초에 1번 / 1대1 서로 말이 맞아야 정산
  psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '32_fair_results.sql'), 'utf8'));
  {
    const one = json(`public.pingpong_signup('점검혼자', '1234')`), t1 = `'${one.token}'`;
    json(`public.pingpong_ai_start(${t1})`);
    psql(DB, `update public.pingpong_players set ai_at = now() - interval '12 seconds' where nick = '점검혼자';`);
    const r1 = json(`public.pingpong_ai_rally(${t1}, 50)`);
    must(r1.status === 'ok' && r1.player.best_rally === 11, '혼자 하기: 12초에 친 횟수는 11번까지만 인정해야 해요: ' + JSON.stringify(r1).slice(0, 200));
    psql(DB, `update public.pingpong_players set ai_at = now() - interval '2000 seconds', ai_day = (now() at time zone 'Asia/Seoul')::date, ai_day_coins = 240 where nick = '점검혼자';`);
    const before = json(`public.pingpong_me(${t1})`).player.coins;
    const r2 = json(`public.pingpong_ai_rally(${t1}, 1000)`);
    must(r2.coins === 10 && r2.capped === true && r2.player.coins === before + 10, '혼자 하기 하루 250코인 상한이 이상해요: ' + JSON.stringify(r2).slice(0, 200));
    psql(DB, `update public.pingpong_players set ai_at = now() - interval '100 seconds' where nick = '점검혼자';`);
    must(json(`public.pingpong_ai_rally(${t1}, 50)`).coins === 0, '혼자 하기 상한을 넘어 코인이 들어왔어요');
    psql(DB, `update public.pingpong_players set ai_at = now() - interval '100 seconds', ai_day = ai_day - 1 where nick = '점검혼자';`);
    must(json(`public.pingpong_ai_rally(${t1}, 30)`).coins > 0, '혼자 하기: 다음 날이 됐는데 코인이 안 들어와요');

    const A = json(`public.pingpong_signup('점검결과갑', '1234')`), B = json(`public.pingpong_signup('점검결과을', '1234')`);
    const ta = `'${A.token}'`, tb = `'${B.token}'`;
    const fin = (t, id, won) => json(`public.pingpong_match_result(${t}, '${id}', ${won}, 0, 0)`);
    const start = (id) => {
      must(json(`public.pingpong_match_join(${ta}, '${id}', '1v1', 0)`).status === 'ok' && json(`public.pingpong_match_join(${tb}, '${id}', '1v1', 1)`).status === 'ok', '31 경기 입장 실패');
      psql(DB, `update public.pingpong_matches set started_at = now() - interval '2 minutes' where id = '${id}';`);
    };
    const wins = (nick) => +psql(DB, `select wins_1v1 from public.pingpong_players where nick = '${nick}';`);
    const won = (r) => r.coins?.items.some((i) => i.label === '승리');
    // 말이 맞음: 갑 이겼다 → 기다림, 을 졌다 → 정산, 갑 다시 → 승리
    const m1 = '00000000-0000-4000-8000-000000000311';
    start(m1);
    must(fin(ta, m1, true).status === 'wait', '상대가 결과를 보내기 전엔 기다려야 해요');
    const b1 = fin(tb, m1, false);
    must(b1.status === 'ok' && !b1.disputed && b1.player.losses_1v1 === 1, '진 쪽 정산이 이상해요: ' + JSON.stringify(b1).slice(0, 200));
    const a1 = fin(ta, m1, true);
    must(a1.status === 'ok' && won(a1) && wins('점검결과갑') === 1, '말이 맞았는데 승리가 안 들어와요: ' + JSON.stringify(a1).slice(0, 300));
    // 둘 다 이겼다고 함 → 둘 다 승패 없이
    const m2 = '00000000-0000-4000-8000-000000000312';
    start(m2);
    must(fin(ta, m2, true).status === 'wait', '32: 기다림이 안 나와요');
    const b2 = fin(tb, m2, true), a2 = fin(ta, m2, true);
    must(b2.disputed && a2.disputed && !won(a2) && !won(b2) && wins('점검결과갑') === 1 && wins('점검결과을') === 0, '서로 이겼다고 했는데 승리가 들어갔어요: ' + JSON.stringify([b2, a2]).slice(0, 300));
    // 처음 말한 것만: 갑 이겼다 → 갑 '졌다'로 바꿔도 이긴 것으로, 을 졌다 → 갑 승리
    const m3 = '00000000-0000-4000-8000-000000000313';
    start(m3);
    fin(ta, m3, true);
    must(fin(ta, m3, false).status === 'wait', '32: 처음 말한 결과를 바꿀 수 있어요');
    fin(tb, m3, false);
    const a3 = fin(ta, m3, false);
    must(won(a3) && wins('점검결과갑') === 2, '32: 처음 말한 결과대로 정산되지 않아요: ' + JSON.stringify(a3).slice(0, 200));
    // 상대가 20초 동안 안 보냄 → 내 말대로. 기다리는 동안 새 경기에 들어가도 그대로 정산 (stale 아님)
    const m4 = '00000000-0000-4000-8000-000000000314', m5 = '00000000-0000-4000-8000-000000000315';
    start(m4);
    fin(ta, m4, true);
    json(`public.pingpong_match_join(${ta}, '${m5}', '1v1', 0)`);
    must(fin(ta, m4, true).status === 'wait', '32: 20초 전인데 기다리지 않아요');
    psql(DB, `update public.pingpong_match_players set claimed_at = now() - interval '25 seconds' where match_id = '${m4}';`);
    const a4 = fin(ta, m4, true);
    must(a4.status === 'ok' && won(a4) && wins('점검결과갑') === 3, '32: 상대가 안 보내면 20초 뒤 내 말대로 정산해야 해요: ' + JSON.stringify(a4).slice(0, 200));
    // 33: 옛 함수는 브라우저(anon)에서 못 부름
    psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '33_close_old_finish.sql'), 'utf8'));
    let closed = false;
    try { json(`public.pingpong_match_finish(${ta}, '${m5}', true, 0, 0)`); } catch { closed = true; }
    must(closed, '33: 옛 경기 결과 함수 pingpong_match_finish가 아직 열려 있어요');
    // 49 🚚 광장 음식: 위에서 32를 다시 실행해 덮였으니 49를 다시 → 사기(값·효과·하나만) + 경기·혼자 하기 효과가 붙는지 (쉬는 시간과 더하기)
    psql(DB, fs.readFileSync(path.join(ROOT, 'supabase', '49_plaza_food.sql'), 'utf8'));
    const FR = await import(path.join(ROOT, 'src', 'games', 'props', 'rules.js'));
    psql(DB, `update public.pingpong_players set coins = 15 where nick = '점검결과갑';`);
    must(json(`public.pingpong_plaza_buy(${ta}, 'pizza')`).status === 'bad_item', '49: 없는 음식이 팔려요');
    const f1 = json(`public.pingpong_plaza_buy(${ta}, 'coffee')`);
    must(f1.status === 'ok' && f1.player.coins === 15 - FR.FOOD_FX.coffee.price && f1.player.food === 'coffee' && f1.player.food_left > 590, '49: 커피 사기가 이상해요: ' + JSON.stringify(f1).slice(0, 200));
    must(json(`public.pingpong_plaza_buy(${ta}, 'coffee')`).status === 'busy', '49: 두 번 눌러 두 번 샀어요');
    must(json(`public.pingpong_plaza_buy(${ta}, 'hotdog')`).status === 'coins', '49: 코인이 모자란데 샀어요');
    const m6 = '00000000-0000-4000-8000-000000000491';
    start(m6);
    fin(ta, m6, true); fin(tb, m6, false);
    const a6 = fin(ta, m6, true), sum6 = (r) => r.coins.items.reduce((x, i) => x + i.coins, 0);
    const food6 = a6.coins.items.find((i) => /커피/.test(i.label));
    const base6 = a6.coins.items.filter((i) => !/커피|쉬는 시간/.test(i.label)).reduce((x, i) => x + i.coins, 0);
    must(a6.status === 'ok' && food6 && food6.coins === Math.ceil(base6 * 0.3) && sum6(a6) === a6.coins.total, '49: 커피 효과(1대1 +30%)가 경기 코인에 안 붙어요: ' + JSON.stringify(a6.coins).slice(0, 300));
    psql(DB, `update public.pingpong_players set coins = 100, food = 'ade', food_until = now() + interval '5 minutes', ai_at = now() - interval '100 seconds', ai_rem = 0, ai_day_coins = 0 where nick = '점검결과갑';`);
    json(`public.pingpong_ai_start(${ta})`);
    psql(DB, `update public.pingpong_players set ai_at = now() - interval '100 seconds' where nick = '점검결과갑';`);
    const ai6 = json(`public.pingpong_ai_rally(${ta}, 30)`);
    must(ai6.status === 'ok' && ai6.food === 'ade' && ai6.food_coins === 3 && ai6.coins === 10 + 3 + ai6.bonus, '49: 에이드 효과(혼자 하기 +30%)가 이상해요: ' + JSON.stringify(ai6).slice(0, 200));
    psql(DB, `update public.pingpong_players set food_until = now() - interval '1 second', ai_at = now() - interval '100 seconds', ai_rem = 0 where nick = '점검결과갑';`);
    must(json(`public.pingpong_ai_rally(${ta}, 30)`).food_coins === 0, '49: 시간이 끝났는데 효과가 붙어요');
    // 서버 규칙 == 화면 규칙 (rules.js foodPct)
    for (const f of [...Object.keys(FR.FOOD_FX), null]) for (const k of ['match', 'ai', 'fish']) for (const w of [true, false]) {
      const srvP = +psql(DB, `select public.pingpong__food_pct(${f ? `'${f}'` : 'null'}, now() + interval '1 minute', '${k}', now(), ${w});`);
      must(srvP === FR.foodPct(f, k, w), `49: 음식 효과 %가 서버와 화면이 달라요: ${f} ${k} ${w} 서버 ${srvP}`);
    }
  }
  // 28 낚시: 기포 자리 서버 == 화면(rules.js), 던지기 → 잡기(최소 시간·코인·도감·업적·탁구채) · 랭킹
  {
    const R = await import(path.join(ROOT, 'src', 'games', 'fishing', 'rules.js'));
    const t0 = Date.parse('2026-11-25T03:00:00Z') / 1000, ts = Array.from({ length: 160 }, (_, i) => t0 + i * 37.3);
    const srvB = psql(DB, `select string_agg(coalesce((select string_agg(round(b.x::numeric, 4) || ':' || round(b.z::numeric, 4), ' ' order by b.x) from public.pingpong__fish_bubbles(to_timestamp(t)) b), '-'), ';' order by n) from unnest(array[${ts.join(',')}]::float8[]) with ordinality as x(t, n);`).split(';');
    let seen = 0;
    ts.forEach((t, i) => {
      const js = R.activeBubbles(t, 'normal').sort((p, q) => p.x - q.x).map((b) => b.x.toFixed(4) + ':' + b.z.toFixed(4)).join(' ') || '-';
      if (js !== '-') seen++;
      must(srvB[i] === js, `기포 자리가 서버와 화면이 달라요: ${t} 서버 ${srvB[i]} 화면 ${js}`);
    });
    must(seen > 10, '기포가 거의 안 나와요: ' + seen);
    // 36 ㄷ자 선착장: 서는 곳·찌 자리(판 위면 판 넘어 물까지) 서버 == rules.js landingPoint, 찌는 나무 판 위에 안 떨어짐
    {
      const ins = [];
      for (let i = 0; i < 150; i++) ins.push([-9 + ((i * 7.31) % 40), 38 + ((i * 3.17) % 22), ((i * 0.37) % 2) - 1, (i * 0.113) % 1]);
      const col = (k) => `array[${ins.map((q) => q[k]).join(',')}]::float8[]`;
      const srvL = psql(DB, `select string_agg(round(l.x::numeric, 4) || ':' || round(l.z::numeric, 4), ' ' order by n) from generate_series(1, ${ins.length}) n, lateral public.pingpong__fish_land((${col(0)})[n], (${col(1)})[n], (${col(2)})[n], (${col(3)})[n]) l;`).split(' ');
      ins.forEach((q, i) => {
        const p = R.landingPoint(q[0], q[2], q[3], q[1]);
        must(srvL[i] === p.x.toFixed(4) + ':' + p.z.toFixed(4), `36: 찌 자리가 서버와 화면이 달라요: ${q} 서버 ${srvL[i]} 화면 ${p.x.toFixed(4)}:${p.z.toFixed(4)}`);
        must(!R.WOOD.some((w) => p.x > w.x0 && p.x < w.x1 && p.z > w.z0 && p.z < w.z1), `36: 찌가 나무 판 위에 떨어져요: ${q} → ${p.x}, ${p.z}`);
      });
      // 46: 팔에서 가장 멀리 던진 부채꼴 끝이 둥근 원 (어느 방향이든 18m, 꺾이지 않음)
      for (const [sx, sz] of [[-4, 45.7], [-4, 51], [26, 46], [26, 56]]) for (let k = -1; k <= 1; k += 0.25) {
        const L = R.landingPoint(sx, k, 1, sz), d = Math.hypot(L.x - sx, L.z - sz);
        must(Math.abs(d - 18) < 0.01 && L.z >= 43, `46: 팔 부채꼴 끝이 18m 원이 아니에요: ${sx},${sz} aim ${k} → ${d.toFixed(2)}m z ${L.z.toFixed(2)}`);
      }
      // 45: 팔에서는 바깥 바다 쪽으로 (서쪽 팔 → 서쪽, 동쪽 팔 → 동쪽), 절벽(z 43 밑)에는 안 떨어짐
      for (const aim of [-1, 0, 1]) for (const pw of [0, 0.5, 1]) {
        const w = R.landingPoint(-4, aim, pw, 52), e = R.landingPoint(26, aim, pw, 52), f = R.landingPoint(11, aim, pw, 44);
        must(w.x < -6.5 && e.x > 28.5 && f.z > 46 && w.z >= 43 && e.z >= 43, `45: 던지는 방향이 이상해요: 서 ${w.x},${w.z} 동 ${e.x},${e.z} 앞 ${f.x},${f.z}`);
      }
    }
    // 30: 서버 시각 (브라우저 기포 시계 맞추기) — anon으로 부를 수 있고 지금 시각
    const srvMs = JSON.parse(psql(DB, `set role anon; select public.pingpong_now()::text;`)).ms;
    must(Math.abs(srvMs - Date.now()) < 120000, '서버 시각(pingpong_now)이 이상해요: ' + srvMs);
    const cast = () => json(`public.pingpong_fish_cast(${tk}, 13, 44.6, 0, 0.5, false)`);
    const c1 = cast();
    must(c1.status === 'ok' && c1.cast?.id && ['fish', 'junk', 'paddle'].includes(c1.cast.kind), '던지기 실패: ' + JSON.stringify(c1));
    must(json(`public.pingpong_fish_finish(${tk}, '${c1.cast.id}', true, true)`).status === 'too_fast', '던지자마자 잡았다고 해도 인정됐어요');
    // 걸린 것을 정해 두고(운영자처럼) 30초 전에 던진 걸로 → 잡기
    const setCast = (kind, item, grade, cm) => psql(DB, `update public.pingpong_players set fish_cast = jsonb_build_object('id', 'chk', 'kind', '${kind}', 'item', '${item}', 'grade', '${grade}', 'cm', ${cm}, 'dup', false, 'near', 0, 'at', extract(epoch from clock_timestamp()) - 30) where nick = '점검봇';`);
    setCast('fish', 'dragon', 'legend', 95);
    const f1 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    const ids = (f1.new || []).map((n) => n.id);
    must(f1.status === 'ok' && f1.caught && f1.first && f1.big && f1.coins === 0 && f1.bagged && ids.includes('fish_big') && ids.includes('fish_legend'),
      '전설 물고기 95cm 잡기가 이상해요(35부터 코인 0 · 가방에 · 월척·전설 업적): ' + JSON.stringify(f1).slice(0, 300));
    must(json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`).status === 'no_cast', '같은 물고기를 두 번 잡았어요');
    setCast('fish', 'mackerel', 'common', 40);
    const f2 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    must(f2.coins === 0 && f2.first && !f2.big && f2.bag.length === 2, '일반 물고기가 가방에 안 들어가요: ' + JSON.stringify(f2).slice(0, 200));
    // 35 🎒 가방 · 🍣 팔기 · 📈 시세 (fishing.md 14-6): 서버 시세 == market.js, 팔기 코인 == sellCoins, 가방 30칸이 차면 바로 팔림
    const MK = await import(path.join(ROOT, 'src', 'games', 'fishing', 'market.js'));
    const mts = Array.from({ length: 120 }, (_, i) => Date.UTC(2026, 10, 20) + i * 4321e3 + (i % 7) * 333e3); // 금~일·밤낮·쉬는 시간 넘나들기
    const srvP = psql(DB, `select string_agg(public.pingpong__fish_prices(to_timestamp(t / 1000.0)), ';' order by n) from unnest(array[${mts.join(',')}]::float8[]) with ordinality as x(t, n);`).split(';');
    const badP = mts.map((t, i) => { const p = MK.period(t), pr = MK.prices(p); return [`${p.day * 10 + p.idx}:${[...MK.MARKET_FISH, ...MK.BIG_FISH].map((id) => pr.list[id]).join(',')}`, srvP[i], new Date(t).toISOString()]; }).filter(([a, b]) => a !== b);
    must(!badP.length, `시세가 서버와 달라요(${badP.length}곳): ` + JSON.stringify(badP.slice(0, 3)));
    // 43 📰 소식 (13-1 ④): 회차 날씨(맑음·흐림·비·눈·모름)마다 서버 == market.js · 날씨는 회차마다 처음 것만 · anon이 부를 수 있음
    {
      const wxOf = (i) => [null, 'clear', 'cloudy', 'rain', 'snow'][i % 5];
      const per = mts.map((t) => { const q = MK.period(t); return q.day * 10 + q.idx; });
      psql(DB, `insert into public.pingpong_fish_news(period, wx) select x.p, x.w from unnest(array[${per.join(',')}]::bigint[], array[${per.map((_, i) => (wxOf(i) ? `'${wxOf(i)}'` : 'null')).join(',')}]::text[]) as x(p, w) where x.w is not null on conflict do nothing;`);
      const got = psql(DB, `select string_agg(coalesce(n.wx, '-'), ',' order by x.o) from unnest(array[${per.join(',')}]::bigint[]) with ordinality as x(p, o) left join public.pingpong_fish_news n on n.period = x.p;`).split(',');
      const wxP = (i) => (got[i] === '-' ? null : got[i]);
      const srvN = psql(DB, `select string_agg(public.pingpong__fish_prices(to_timestamp(t / 1000.0)), ';' order by n) from unnest(array[${mts.join(',')}]::float8[]) with ordinality as x(t, n);`).split(';');
      const badN = mts.map((t, i) => { const p = MK.period(t), pr = MK.prices(p, wxP(i)); return [`${p.day * 10 + p.idx}:${[...MK.MARKET_FISH, ...MK.BIG_FISH].map((id) => pr.list[id]).join(',')}`, srvN[i], wxP(i), pr.news?.text]; }).filter(([x, y]) => x !== y);
      must(!badN.length, `소식 시세가 서버와 달라요(${badN.length}곳): ` + JSON.stringify(badN.slice(0, 3)));
      must(mts.some((t, i) => MK.prices(MK.period(t), wxP(i)).news?.wx), '날씨 소식이 한 번도 안 나와요');
      psql(DB, `delete from public.pingpong_fish_news;`);
      const n1 = json(`public.pingpong_fish_news('rain')`);
      const n2 = json(`public.pingpong_fish_news('clear')`);
      must(n1.status === 'ok' && n2.news.length === 1 && n2.news[0].wx === 'rain' && +n2.news[0].p === n1.period, '회차 날씨가 처음 것으로 안 남아요: ' + JSON.stringify([n1, n2]));
      MK.setNewsWx(n2.news);
      const nowP = psql(DB, `select public.pingpong__fish_prices(now());`), pr = MK.prices(MK.period(Date.now()));
      must(nowP === `${n1.period}:${[...MK.MARKET_FISH, ...MK.BIG_FISH].map((id) => pr.list[id]).join(',')}`, '지금 소식 시세가 서버와 달라요: ' + nowP);
    }
    // 44 🛒 사람들이 판 만큼 (13-1 ③): 지난 회차 팔린 수(여러 모양)마다 서버 == market.js demandOf
    {
      const keyOf = (q) => q.day * 10 + q.idx, pids = Array.from({ length: 5 }, (_, i) => `0000000${i}-0000-4000-8000-000000000000`);
      const all = [...MK.MARKET_FISH, ...MK.BIG_FISH], prevs = [...new Set(mts.map((t) => keyOf(MK.prevPeriod(MK.period(t)))))];
      const rows = [];
      prevs.forEach((per, i) => { // i % 6: 0 아무도 안 팖 · 1 9마리(10 미만) · 2 한 명이 많이 · 3 같은 수(id 순서) · 4·5 섞임
        const shape = i % 6;
        if (shape === 0) return;
        const add = (f, who, n) => rows.push([per, f, pids[who], n]);
        if (shape === 1) { add('mackerel', 0, 5); add('mackerel', 1, 4); }
        if (shape === 2) { add('squid', 0, 20); add('horse', 1, 3); add('horse', 2, 2); add('dragon', 3, 1); add('dragon', 4, 1); }
        if (shape === 3) { add('puffer', 0, 4); add('puffer', 1, 4); add('flounder', 0, 4); add('flounder', 2, 4); add('seabream', 3, 2); }
        if (shape >= 4) for (let k = 0; k < 9; k++) add(all[(i * 7 + k * 3) % all.length], (i + k) % 5, 1 + ((i * k) % 6));
      });
      const uniq = new Map(); for (const r of rows) { const k = r.slice(0, 3).join('|'); uniq.set(k, [...r.slice(0, 3), (uniq.get(k)?.[3] || 0) + r[3]]); }
      psql(DB, `insert into public.pingpong_fish_sold(period, fish_id, player_id, n) values ${[...uniq.values()].map(([a, b, c, d]) => `(${a}, '${b}', '${c}', ${d})`).join(',')};`);
      MK.clearSold();
      MK.setSold(JSON.parse(psql(DB, `select json_agg(json_build_object('p', period, 'f', fish_id, 'n', n, 'k', k))::text from (select period, fish_id, sum(n)::int n, count(*)::int k from public.pingpong_fish_sold group by 1, 2) t;`)));
      const srvD = psql(DB, `select string_agg(public.pingpong__fish_prices(to_timestamp(t / 1000.0)), ';' order by n) from unnest(array[${mts.join(',')}]::float8[]) with ordinality as x(t, n);`).split(';');
      const badD = mts.map((t, i) => { const p = MK.period(t), pr = MK.prices(p); return [`${keyOf(p)}:${all.map((id) => pr.list[id]).join(',')}`, srvD[i], pr.demand]; }).filter(([x, y]) => x !== y);
      must(!badD.length, `🛒 판매 시세가 서버와 달라요(${badD.length}곳): ` + JSON.stringify(badD.slice(0, 3)));
      const ds = mts.map((t) => MK.prices(MK.period(t)).demand);
      must(ds.some((d) => Object.values(d).includes(8)) && ds.some((d) => Object.values(d).includes(9)) && ds.some((d) => Object.values(d).includes(11)) && ds.some((d) => !Object.keys(d).length),
        '🛒 ×0.8·×0.9·×1.1·그대로가 다 안 나와요');
      psql(DB, `delete from public.pingpong_fish_sold;`);
      MK.clearSold();
    }
    const brkPct = 0; // 팔 때 쉬는 시간 보너스 없음(사용자 11/26)
    const want = MK.sellCoins([['dragon', 1], ['mackerel', 1]], Date.now(), brkPct);
    const sold = json(`public.pingpong_fish_sell(${tk}, null)`);
    must(sold.status === 'ok' && sold.coins === want.total && sold.bag.length === 0, '팔기 코인이 market.js와 달라요: ' + JSON.stringify([sold, want]).slice(0, 300));
    must(json(`public.pingpong_fish_sell(${tk}, null)`).status === 'empty', '빈 가방을 또 팔았어요');
    { // 44 🛒: 판 마리 수가 지금 회차에 기록됨 · 지금 회차 판매는 브라우저에 안 보여 줌
      const n = +psql(DB, `select coalesce(sum(n), 0) from public.pingpong_fish_sold where period = public.pingpong__fish_period(now());`);
      const nw = json(`public.pingpong_fish_news(null)`);
      must(n === 2 && Array.isArray(nw.sold) && !nw.sold.some((r) => +r.p === nw.period), '🛒 팔린 수 기록이 이상해요: ' + JSON.stringify([n, nw.sold]));
    }
    psql(DB, `insert into public.pingpong_fish_bag(player_id, fish_id, n) select id, 'horse', 30 from public.pingpong_players where nick = '점검봇';`);
    setCast('fish', 'seabream', 'rare', 50);
    const f3 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    must(f3.sold && !f3.bagged && f3.coins === Math.floor(MK.priceOf('seabream', Date.now()) / 10), '가방이 꽉 찼을 때 바로 팔리지 않아요: ' + JSON.stringify(f3).slice(0, 200));
    const s1 = json(`public.pingpong_fish_sell(${tk}, 'horse')`);
    must(s1.coins === MK.sellCoins([['horse', 30]], Date.now(), brkPct).total, '종류별 팔기 코인이 달라요: ' + JSON.stringify(s1).slice(0, 200));
    // 40 하루 한도 1000 (fishing.md 19장): 비싼 것부터 한도 안에서만 · 나머지는 가방에 · 다 차면 capped · 꽉 찬 가방 바로 팔기도 막힘
    must(s1.day_coins === sold.coins + f3.coins + s1.coins && s1.day_cap === MK.DAY_CAP, '오늘 판 코인이 이상해요: ' + JSON.stringify(s1).slice(0, 200));
    psql(DB, `update public.pingpong_players set fish_day = (now() at time zone 'Asia/Seoul')::date, fish_day_coins = 975 where nick = '점검봇';
      insert into public.pingpong_fish_bag(player_id, fish_id, n) select id, f, 2 from public.pingpong_players, unnest(array['dragon', 'seabream', 'mackerel', 'puffer']) f where nick = '점검봇' on conflict do nothing;`);
    const capItems = [['dragon', 2], ['seabream', 2], ['mackerel', 2], ['puffer', 2]], capWant = MK.sellPlan(capItems, Date.now(), 25);
    const sc = json(`public.pingpong_fish_sell(${tk}, null)`);
    const scLeft = sc.bag.reduce((a, b) => a + b.n, 0);
    must(sc.status === 'ok' && sc.coins === capWant.coins && sc.kept === capWant.kept && scLeft === capWant.kept && sc.day_coins === 975 + capWant.coins && sc.day_coins <= MK.DAY_CAP,
      '하루 한도 팔기가 market.js sellPlan과 달라요: ' + JSON.stringify([sc, capWant]).slice(0, 400));
    psql(DB, `update public.pingpong_players set fish_day_coins = 1000 where nick = '점검봇';`);
    const sc2 = json(`public.pingpong_fish_sell(${tk}, null)`);
    must(sc2.status === 'capped' && sc2.kept === scLeft, '한도가 다 찼는데 팔렸어요: ' + JSON.stringify(sc2).slice(0, 200));
    psql(DB, `delete from public.pingpong_fish_bag where player_id = (select id from public.pingpong_players where nick = '점검봇');
      insert into public.pingpong_fish_bag(player_id, fish_id, n) select id, 'horse', 30 from public.pingpong_players where nick = '점검봇';`);
    setCast('fish', 'seabream', 'rare', 50);
    const f4 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    must(f4.capped && !f4.sold && !f4.bagged && f4.coins === 0, '한도가 다 찼는데 꽉 찬 가방에서 바로 팔렸어요: ' + JSON.stringify(f4).slice(0, 200));
    // 41 ⭐ 품질 별 (fishing.md 7장): qualityOf 기준 · 가방은 종류 × 별 칸 · 별 범위 자름 · 값 = 시세 × 배율 · 별마다 팔기 · 꽉 찬 가방 바로 팔기도 별 값
    {
      const qs = [[10, 0, 0], [7, 3, 0], [5, 5, 0], [6, 2, 2], [0, 10, 0], [2, 3, 5], [0, 7, 3], [1, 2, 7], [0, 0, 1], [0, 0, 0]].map(([p, g, m]) => MK.qualityOf(p, g, m));
      must(qs.join('') === '3221100001', '품질 별 기준(90·75·50%)이 이상해요: ' + qs.join(''));
      const sb = MK.priceOf('seabream', Date.now());
      must(MK.priceOf('seabream', Date.now(), 3) === Math.floor((sb * 13 + 5) / 10) && MK.priceOf('seabream', Date.now(), 0) === Math.floor((sb * 8 + 5) / 10), '별 배율 값이 이상해요');
      // 42 모든 물고기에 시세 (13-1 ②): 희귀 16~24 · 전설 20~60, 평균은 그대로, 대박은 일반만
      const big = Array.from({ length: 400 }, (_, i) => MK.prices({ day: 20000 + (i >> 3), idx: (i & 7) + 1 }));
      // 소식(43)이 건드린 회차는 빼고
      const rs = big.filter((p) => p.news?.id !== 'seabream').map((p) => p.list.seabream), ls = big.filter((p) => p.news?.id !== 'goldball').map((p) => p.list.goldball), avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      must(Math.min(...rs) >= 160 && Math.max(...rs) <= 240 && Math.min(...ls) >= 200 && Math.max(...ls) <= 600 && Math.abs(avg(rs) - 200) < 8 && Math.abs(avg(ls) - 400) < 25
        && big.every((p) => MK.MARKET_FISH.includes(p.jackpot)) && new Set(ls).size > 50, '희귀·전설 시세 폭이 이상해요: ' + JSON.stringify([Math.min(...rs), Math.max(...rs), avg(rs), Math.min(...ls), Math.max(...ls), avg(ls)]));
    }
    psql(DB, `update public.pingpong_players set fish_day_coins = 0 where nick = '점검봇';
      delete from public.pingpong_fish_bag where player_id = (select id from public.pingpong_players where nick = '점검봇');`);
    for (const q of [3, 0, 9]) { setCast('fish', 'mackerel', 'common', 30); must(json(`public.pingpong_fish_finish(${tk}, 'chk', true, true, ${q})`).q === Math.min(q, 3), '별이 잡기 결과에 안 와요'); }
    setCast('fish', 'seabream', 'rare', 50);
    const fq = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true, 2)`);
    const bq = fq.bag.map((b) => `${b.id}${b.q}x${b.n}`).join(',');
    must(bq === 'mackerel3x2,mackerel0x1,seabream2x1', '가방이 별마다 칸이 안 나뉘어요: ' + bq);
    const qItems = fq.bag.map((b) => [b.id, b.n, b.q]);
    const sq = json(`public.pingpong_fish_sell(${tk}, 'mackerel', 3)`);
    must(sq.status === 'ok' && sq.coins === MK.sellPlan([['mackerel', 2, 3]], Date.now()).coins && sq.bag.length === 2, '별마다 팔기가 이상해요: ' + JSON.stringify(sq).slice(0, 300));
    const sqa = json(`public.pingpong_fish_sell(${tk}, null)`);
    const qWant = MK.sellPlan(qItems.filter(([id, , q]) => !(id === 'mackerel' && q === 3)), Date.now(), MK.DAY_CAP - sq.coins);
    must(sqa.status === 'ok' && sqa.coins === qWant.coins && JSON.stringify(sqa.sold.map((x) => [x.id, x.n, x.price, x.q])) === JSON.stringify(qWant.sold), '별 섞인 모두 팔기가 market.js와 달라요: ' + JSON.stringify([sqa.sold, qWant]).slice(0, 400));
    psql(DB, `insert into public.pingpong_fish_bag(player_id, fish_id, q, n) select id, 'horse', 1, 30 from public.pingpong_players where nick = '점검봇';`);
    setCast('fish', 'seabream', 'rare', 50);
    const fq2 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true, 3)`);
    must(fq2.sold && fq2.coins === Math.floor(MK.priceOf('seabream', Date.now(), 3) / 10), '꽉 찬 가방 바로 팔기에 별 값이 안 들어가요: ' + JSON.stringify(fq2).slice(0, 200));
    psql(DB, `delete from public.pingpong_fish_bag where player_id = (select id from public.pingpong_players where nick = '점검봇');`);
    // 🐱 고양이 배회 (cats.md): 모든 쉬는 자리가 이어짐 · 바닥 높이를 따라감 · 계단 위 풀밭·횟집 앞까지 다님 (11/26 활동 범위 넓힘)
    {
      const CR = await import(path.join(ROOT, 'src', 'games', 'cats', 'rules.js')), CL = await import(path.join(ROOT, 'src', 'campusLayout.js'));
      let up = 0, west = 0, badY = 0;
      for (const id of CR.CAT_IDS) for (let t = 0; t < 86400e3; t += 60e3) { const q = CR.catAt(id, 1.79e12 + t); if (q.z < 39) up++; if (q.x < 2 && q.z > 39) west++; if (Math.abs(q.y - CL.heightAt(q.x, q.z)) > 0.1) badY++; }
      must(CR.catPathOk() && up > 0 && west > 0 && badY === 0, `고양이 배회가 이상해요: 이어짐 ${CR.catPathOk()} · 계단 위 ${up} · 횟집 쪽 ${west} · 높이 틀림 ${badY}`);
    }
    // 37 🐱 고양이 밥 (cats.md 3a): 가방 빔 → no_fish · 가장 싼 생선 하나 빠짐 · 1시간 안에 또 → wait · 10점이면 ♥ 오름
    must(json(`public.pingpong_cat_feed(${tk}, 'cheese')`).status === 'no_fish', '빈 가방인데 고양이 밥을 줬어요');
    must(json(`public.pingpong_cat_feed(${tk}, 'dog')`).status === 'bad_cat', '없는 고양이에게 밥을 줬어요');
    const catBag = [{ id: 'horse', q: 1, n: 1 }, { id: 'horse', q: 0, n: 1 }, { id: 'mackerel', q: 3, n: 1 }, { id: 'squid', q: 2, n: 1 }]; // 41: 별 값으로 가장 싼 칸
    psql(DB, `insert into public.pingpong_fish_bag(player_id, fish_id, q, n) select id, f, q, 1 from public.pingpong_players, (values ${catBag.map((b) => `('${b.id}', ${b.q})`).join(', ')}) v(f, q) where nick = '점검봇' on conflict do nothing;`);
    const cheap = MK.cheapestIn(catBag, Date.now());
    const cf = json(`public.pingpong_cat_feed(${tk}, 'cheese')`);
    must(cf.status === 'ok' && cf.fish === cheap.id && cf.pts === 1 && cf.bag.length === 3 && !cf.bag.some((b) => b.id === cheap.id && b.q === cheap.q), '고양이 밥(가장 싼 생선)이 이상해요: ' + JSON.stringify([cf, cheap]).slice(0, 300));
    const cw = json(`public.pingpong_cat_feed(${tk}, 'cheese')`);
    must(cw.status === 'wait' && cw.wait > 3500, '1시간 안에 또 밥을 줬어요: ' + JSON.stringify(cw).slice(0, 200));
    psql(DB, `update public.pingpong_cat set pts = 9, fed_at = now() - interval '61 minutes' where cat_id = 'cheese';`);
    const cu = json(`public.pingpong_cat_feed(${tk}, 'cheese')`);
    must(cu.status === 'ok' && cu.pts === 10 && cu.up === true && json(`public.pingpong_cat_list(${tk})`).cats[0].wait > 3500, '♥ 오르기·목록이 이상해요: ' + JSON.stringify(cu).slice(0, 200));
    // 38 옷: ♥1이면 방울 OK · 리본(♥2)은 locked · 벗기
    const w1 = json(`public.pingpong_cat_wear(${tk}, 'cheese', 'bell', true)`), w2 = json(`public.pingpong_cat_wear(${tk}, 'cheese', 'ribbon', true)`);
    must(w1.status === 'ok' && w1.cats[0].outfit.bell === true && w2.status === 'locked', '고양이 옷 입기가 이상해요: ' + JSON.stringify([w1, w2]).slice(0, 300));
    const w3 = json(`public.pingpong_cat_wear(${tk}, 'cheese', 'bell', false)`);
    must(w3.status === 'ok' && !w3.cats[0].outfit.bell && json(`public.pingpong_cat_wear(${tk}, 'cheese', 'cape', true)`).status === 'bad_slot', '고양이 옷 벗기가 이상해요: ' + JSON.stringify(w3).slice(0, 200));
    // 잡동사니(바게트) · 챔질 Perfect 10연속 (위에서 이미 3번)
    for (let i = 0; i < 7; i++) { setCast('junk', i ? 'boot' : 'baguette', 'common', 0); json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`); }
    const got = json(`public.pingpong_achievements(${tk})`).got.map((g) => g.id);
    must(['fish_bread', 'fish_perf10'].every((x) => got.includes(x)), '바게트·챔질 10연속 업적이 없어요: ' + got.filter((x) => /fish/.test(x)).join());
    // 1% 전설 탁구채: 없으면 옷장, 있으면 조각 30
    psql(DB, `delete from public.pingpong_inventory where item_id = 'paddle_duck' and player_id = (select id from public.pingpong_players where nick = '점검봇');`);
    setCast('paddle', 'paddle_duck', 'rare', 0);
    const p1 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, false)`);
    const pc = +psql(DB, `select pieces from public.pingpong_players where nick = '점검봇';`);
    setCast('paddle', 'paddle_duck', 'rare', 0);
    const p2 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, false)`);
    must(p1.pieces === 0 && p2.pieces === 30 && +psql(DB, `select pieces from public.pingpong_players where nick = '점검봇';`) === pc + 30
      && psql(DB, `select count(*) from public.pingpong_inventory v join public.pingpong_players p on p.id = v.player_id where p.nick = '점검봇' and v.item_id = 'paddle_duck';`) === '1',
      '낚은 전설 탁구채가 옷장·조각으로 안 들어가요: ' + JSON.stringify([p1.pieces, p2.pieces]));
    // 놓침 → 연속 초기화, 도감·랭킹
    const c2 = cast();
    must(json(`public.pingpong_fish_finish(${tk}, '${c2.cast.id}', false, false)`).caught === false, '놓쳤다고 알리기 실패');
    const dex = json(`public.pingpong_fish_dex(${tk})`);
    must(dex.dex.length === 5 && dex.records.some((r) => r.id === 'dragon' && r.nick === '점검봇' && +r.cm === 95), '도감이 이상해요: ' + JSON.stringify(dex).slice(0, 300));
    const wk = json(`public.pingpong_fish_rank('week')`), al = json(`public.pingpong_fish_rank('all')`);
    must(wk[0]?.nick === '점검봇' && +wk[0].value === 95 && wk[0].fish === 'dragon' && al.length === 1, '월척 랭킹이 이상해요: ' + JSON.stringify([wk, al]).slice(0, 300));
    // 29 크기 '최대 없음 + 긴 꼬리': 서버 식 == 화면 식(rules.js cmOf)
    const us = Array.from({ length: 400 }, (_, i) => (i + 0.5) / 400).concat([0, 0.878, 0.9, 0.99, 0.999, 0.99999]);
    const srvCm = psql(DB, `select string_agg(round(public.pingpong__fish_cm(u)::numeric, 3)::text, ',' order by n) from unnest(array[${us.join(',')}]::float8[]) with ordinality as x(u, n);`).split(',');
    us.forEach((u, i) => must(Math.abs(+srvCm[i] - R.cmOf(u)) < 0.002, `물고기 크기 식이 서버와 화면이 달라요: u=${u} 서버 ${srvCm[i]} 화면 ${R.cmOf(u)}`));
    must(R.cmOf(0.999) > 150 && R.cmOf(0.5) < 50, '긴 꼬리 크기가 이상해요');
    // 34 보통 크기 × 배율 + 행운 주사위 (fishing.md 13장): 보통 크기 서버 == rules.js, 주사위 개수 서버 == luckDice
    const bases = Object.fromEntries(psql(DB, `select string_agg(id || ':' || base_cm, ',') from public.pingpong_fish where kind = 'fish';`).split(',').map((x) => x.split(':')));
    must(R.SPECIES.every((s) => +bases[s.id] === s.base) && Object.keys(bases).length === R.SPECIES.length, '물고기 보통 크기가 서버와 화면이 달라요: ' + JSON.stringify(bases));
    const pid = `(select id from public.pingpong_players where nick = '점검봇')`;
    const dice = (n) => +psql(DB, `select public.pingpong__fish_dice(${pid}, ${n});`);
    const nLog = +psql(DB, `select count(*) from public.pingpong_fish_log where player_id = ${pid};`);
    must(nLog < 10 && dice(0) === R.luckDice({ caught: nLog, dayN: 0 }) && dice(0) === 3, '초보자 행운(주사위 3번)이 이상해요: ' + dice(0));
    psql(DB, `insert into public.pingpong_fish_log(player_id, fish_id, cm, score) select ${pid}, 'mackerel', 18, 30 from generate_series(1, 10);`);
    must(dice(0) === 2 && dice(2) === 2 && dice(3) === 1, '오늘의 첫 3마리 행운이 이상해요: ' + [dice(0), dice(2), dice(3)]);
    psql(DB, `update public.pingpong_fish_log set at = public.pingpong__fish_week_start() where player_id = ${pid} and fish_id = 'dragon';`);
    const kst = new Date(Date.now() + 9 * 3600e3), wk0 = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - (kst.getUTCDay() + 6) % 7) - 9 * 3600e3;
    const storm = Math.min(4, Math.floor((Date.now() - wk0) / 864e5));
    must(dice(5) === 1 + storm && dice(5) === R.luckDice({ caught: 99, dayN: 5, recordDays: (Date.now() - wk0) / 864e5 }), `바다 술렁임이 이상해요: 서버 ${dice(5)} 기대 ${1 + storm}`);
    // 39 월척 랭킹 = 길이(cm) 순서: 배율(점수)은 가장 낮아도 더 긴 물고기가 1등
    psql(DB, `insert into public.pingpong_players(nick, nick_key, pin_hash) select '길이봇', '길이봇', 'x' where not exists (select 1 from public.pingpong_players where nick = '길이봇');`);
    psql(DB, `insert into public.pingpong_fish_log(player_id, fish_id, cm, score) select id, 'dragon', 100, 1 from public.pingpong_players where nick = '길이봇';`);
    const lr = json(`public.pingpong_fish_rank('week')`);
    must(lr[0]?.nick === '길이봇' && +lr[0].value === 100 && lr[1]?.nick === '점검봇', '월척 랭킹이 길이 순서가 아니에요: ' + JSON.stringify(lr).slice(0, 300));
    // 실제 던지기 200번: 잡히는 것이 목록 안 · 점수 20~999 · cm = 점수 × 보통 크기 ÷ 50 (서버 반올림 == rules.js cmOfScore)
    const many = JSON.parse(psql(DB, `set role anon; select json_agg(public.pingpong_fish_cast(${tk}, 13, null, 0, 0.5, true)->'cast')::text from generate_series(1, 200);`));
    const kinds = new Set(many.map((c) => c.kind));
    must(many.every((c) => (c.kind === 'paddle' ? R.LEGEND_PADDLES.some(([id]) => id === c.item) : R.CATCH[c.item]?.kind === c.kind && (c.kind === 'junk' || (c.s >= 20 && c.s <= 999 && +c.cm === R.cmOfScore(c.item, +c.s))))) && kinds.has('fish'),
      '던지기 결과가 목록 밖이에요: ' + JSON.stringify(many.filter((c) => !R.CATCH[c.item] || (c.kind === 'fish' && +c.cm !== R.cmOfScore(c.item, +c.s))).slice(0, 3)));
    const today = +psql(DB, `select fish_day_n from public.pingpong_players where nick = '점검봇';`);
    must(today === many.filter((c) => c.kind === 'fish').length + (c1.cast.kind === 'fish') + (c2.cast.kind === 'fish'), '오늘 뽑은 물고기 수(fish_day_n)가 안 맞아요: ' + today);
    // 48 🎷🎸🎻 장르별 물고기 (fishing.md 13-3 ⑤): 물고기 장르 서버 == rules.js ZONE · 선 자리 장르 서버 == standGenre · 그 자리 장르 물고기가 약 70%
    {
      const srvG = psql(DB, `select string_agg(id || ':' || coalesce(genre, '-'), ',' order by id) from public.pingpong_fish where kind = 'fish';`);
      const jsG = R.SPECIES.map((sp) => `${sp.id}:${sp.genre || '-'}`).sort().join(',');
      must(srvG === jsG, '물고기 장르가 서버와 달라요: ' + srvG);
      const pts = Array.from({ length: 80 }, (_, i) => [-7 + (i * 37) % 37, 38 + ((i * 13) % 21)]);
      const srvS = psql(DB, `select string_agg(public.pingpong__fish_genre(x.a, x.b), ',' order by x.n) from unnest(array[${pts.map((q) => q[0]).join(',')}]::float8[], array[${pts.map((q) => q[1]).join(',')}]::float8[]) with ordinality as x(a, b, n);`);
      must(srvS === pts.map(([x, z]) => R.standGenre(x, z)).join(','), '선 자리 장르가 서버와 달라요');
      for (const [x, z, g] of [[-4, 52, 'ballad'], [26, 52, 'rock'], [13, 44.6, 'jazz']]) {
        const cs = JSON.parse(psql(DB, `set role anon; select json_agg(public.pingpong_fish_cast(${tk}, ${x}, ${z}, 0, 0.5, false)->'cast')::text from generate_series(1, 300);`))
          .filter((c) => c.kind === 'fish' && R.CATCH[c.item]?.grade === 'common');
        const share = cs.filter((c) => R.CATCH[c.item].genre === g).length / cs.length;
        must(cs.length > 100 && share > 0.58 && share < 0.82, `${g} 자리 일반 물고기 중 그 장르가 ${Math.round(share * 100)}%예요(약 70%여야)`);
      }
      // 로컬 규칙(rollCatch)도 같은 비율
      let mine = 0, all = 0;
      for (let i = 0; i < 4000; i++) { const c = R.rollCatch(0, { genre: 'rock', cond: {} }); if (c.kind === 'fish' && c.grade === 'common') { all++; mine += c.genre === 'rock'; } }
      must(Math.abs(mine / all - 0.7) < 0.04, 'rollCatch 장르 비율이 이상해요: ' + mine / all);
    }
  }
  // 표는 브라우저가 직접 못 읽어야 한다 (RLS·권한)
  for (const t of ['pingpong_players', 'pingpong_sessions', 'pingpong_inventory', 'pingpong_matches', 'pingpong_fish_dex', 'pingpong_fish_log', 'pingpong_fish_bag', 'pingpong_fish_news', 'pingpong_fish_sold']) {
    let leaked = true;
    try { q(`select count(*) from public.${t};`); } catch { leaked = false; }
    must(!leaked, `브라우저(anon)가 표 ${t}를 직접 읽을 수 있어요`);
  }
  return `${SQL_FILES.length}개 파일 × 2번 실행, 가입·로그인·상점·뽑기·구매·장착·업적·랭킹·쉬는 시간 보너스·오늘의 미션·세트·낚시(기포 자리·코인·도감·업적·월척), 표 잠금 확인`;
}

/* ───────── 3. 목록 맞추기 (서버 ↔ 화면) ───────── */
function sqlLists() {
  if (psql) {
    const items = psql(DB, `select id, pool, cat, grade from public.pingpong_items order by id;`).split('\n').filter(Boolean).map((l) => l.split('|'));
    const achs = psql(DB, `select id, grade from public.pingpong_ach order by id;`).split('\n').filter(Boolean).map((l) => l.split('|'));
    return { items: new Map(items.map(([id, pool, cat, grade]) => [id, { pool, cat, grade }])), achs: new Map(achs.map(([id, g]) => [id, +g])), from: 'DB' };
  }
  // DB가 없으면 SQL 파일에서 insert 줄을 직접 읽는다 (뒤 파일이 앞 파일을 덮어씀)
  const items = new Map(), achs = new Map();
  for (const f of SQL_FILES) {
    const s = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    for (const m of s.matchAll(/insert into public\.pingpong_items[^;]*?values([\s\S]*?)on conflict/g)) {
      for (const t of m[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/g)) items.set(t[1], { pool: t[2], cat: t[3], grade: t[4] });
    }
    for (const m of s.matchAll(/insert into public\.pingpong_ach\s*\(id, grade\)\s*values([\s\S]*?)(on conflict|;)/g)) {
      for (const t of m[1].matchAll(/\(\s*'([^']+)'\s*,\s*(\d)\s*\)/g)) achs.set(t[1], +t[2]);
    }
  }
  return { items, achs, from: 'SQL 파일' };
}

/* ───────── 4. 화면 ───────── */
const IGNORE = /GPU stall|GL Driver|PCFSoftShadowMap|WebGL: |\[vite\]|Download the React|favicon|ERR_INTERNET_DISCONNECTED|fonts\.g/;
function watch(page, tag, errs) {
  page.on('pageerror', (e) => errs.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push(`[${tag}] ${m.text().slice(0, 300)}`); });
}
const waitFor = (page, fn, arg, ms = 30000, what = '') => page.waitForFunction(fn, arg, { timeout: ms }).catch(() => { throw new Error(`시간 초과: ${what || fn.toString().slice(0, 120)}`); });

async function startVite() {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', NO_COLOR: '1', FORCE_COLOR: '0' };
  // detached: npx 밑의 vite까지 한꺼번에 끄려고 (끝나고 남아 있으면 다음 점검 때 자리가 겹친다)
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  vite.stop = () => { try { process.kill(-vite.pid, 'SIGTERM'); } catch { vite.kill(); } };
  let out = '';
  // 글자 색 코드(GitHub 점검 서버에서 붙음)는 지우고 본다
  const add = (d) => (out += String(d).replace(/\x1b\[[0-9;]*m/g, ''));
  vite.stdout.on('data', add);
  vite.stderr.on('data', add);
  for (let i = 0; i < 60 && !/Local:/.test(out); i++) await new Promise((r) => setTimeout(r, 500));
  if (!/Local:/.test(out)) { vite.stop(); throw new Error('개발 서버가 안 켜져요:\n' + out.slice(-800)); }
  return vite;
}

async function browserChecks() {
  if (args.has('--no-browser')) { await step('화면 점검', () => 'skip'); return; }
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { await step('화면 점검', () => { throw new Error('playwright가 없어요 (npm i --no-save playwright 후 npx playwright install chromium)'); }); return; }
  let vite;
  try { vite = await startVite(); } catch (e) { await step('화면 점검', () => { throw e; }); return; }
  // GPU 없는 컴퓨터(GitHub 점검 서버)에서도 WebGL이 되게 소프트웨어 그리기
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const URL = `http://localhost:${PORT}`;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    const page = await ctx.newPage();
    watch(page, '게임', errs);
    const flush = () => { const e = [...new Set(errs.splice(0))]; must(!e.length, '브라우저 오류:\n' + e.slice(0, 6).join('\n')); };

    await step('화면: 첫 화면 열기', async () => {
      const t0 = Date.now();
      await page.goto(URL + '/');
      await waitFor(page, () => window.__smash?.world, null, 60000, '게임 준비');
      await page.evaluate(() => { try { localStorage.setItem('smash-howto-seen', '1'); } catch {} document.querySelector('#howto')?.classList.add('hidden'); });
      const login = await page.isVisible('#login');
      must(login, '로그인 화면이 안 보여요');
      // 로그인 화면 배경도 광장 (plaza.md 19장 ⓐ'): 광장 그리기 + 카메라는 위에서 내려다봄 + 내 캐릭터 숨김 + 광장 채널엔 안 붙음
      await waitFor(page, () => window.__smash.world.plazaOn && window.__smash.plaza.view.focusP === 1 && window.__smash.world.camera.position.y > 5, null, 15000, '로그인 화면 뒤 광장');
      must(await page.evaluate(() => !window.__smash.plaza.pz.link && [...window.__smash.plaza.view.figs.values()].every((f) => !f.me || !f.c.group.visible)), '로그인 화면에서 광장 채널에 붙었거나 내 캐릭터가 보여요');
      flush();
      return `${((Date.now() - t0) / 1000).toFixed(1)}초`;
    });

    // 1. 화면 목록 ↔ 서버 목록
    await step('목록 맞추기: 아이템·업적 (화면 ↔ 서버)', async () => {
      const { items, achs, from } = sqlLists();
      const web = await page.evaluate(async () => {
        const I = await import('/src/items.js');
        const A = await import('/src/achievements.js');
        return {
          items: I.ITEMS.filter((it) => it.grade !== 'default').map((it) => ({ id: it.id, cat: it.cat, grade: it.grade, pool: I.CATS[it.cat]?.pool, arena: it.arena })),
          defaults: Object.values(I.DEFAULTS),
          achs: A.ACHS.map((a) => ({ id: a.id, grade: a.grade })),
        };
      });
      const probs = [];
      for (const it of web.items) {
        const s = items.get(it.id);
        if (!s) probs.push(`${it.id}: items.js에는 있는데 SQL에 없음`);
        else if (s.grade !== it.grade || s.cat !== it.cat || s.pool !== it.pool) probs.push(`${it.id}: 화면 ${it.pool}/${it.cat}/${it.grade} ≠ 서버 ${s.pool}/${s.cat}/${s.grade}`);
      }
      const webIds = new Set(web.items.map((i) => i.id));
      for (const id of items.keys()) if (!webIds.has(id)) probs.push(`${id}: SQL에는 있는데 items.js에 없음 (뽑으면 화면에서 이름이 안 보임)`);
      for (const id of web.defaults) if (items.has(id)) probs.push(`${id}: 기본 아이템인데 SQL 표에 들어 있음`);
      const webA = new Map(web.achs.map((a) => [a.id, a.grade]));
      for (const [id, g] of webA) { if (!achs.has(id)) probs.push(`업적 ${id}: achievements.js에만 있음`); else if (achs.get(id) !== g) probs.push(`업적 ${id}: 별 ${g} ≠ 서버 ${achs.get(id)}`); }
      for (const id of achs.keys()) if (!webA.has(id)) probs.push(`업적 ${id}: SQL에만 있음`);
      // 목록 그림
      const thumbs = new Set(fs.readdirSync(path.join(ROOT, 'src', 'thumbs')).map((f) => f.replace(/\.webp$/, '')));
      for (const it of [...web.items.map((i) => i.id), ...web.defaults]) {
        if (/^(paddle|body|ball|table)_/.test(it) && !thumbs.has(it)) probs.push(`${it}: 목록 그림 없음 → npm run thumbs`);
      }
      for (const it of web.items.filter((i) => i.cat === 'bg')) if (!fs.existsSync(path.join(ROOT, 'public', 'arenas', `${it.arena}.jpg`))) probs.push(`${it.id}: public/arenas/${it.arena}.jpg 없음`);
      must(!probs.length, probs.join('\n'));
      return `아이템 ${web.items.length}개, 업적 ${web.achs.length}개 일치 (${from} 기준), 목록 그림 있음`;
    });

    // 휴대폰(?mobile=1)과 쉬는 시간 알림(?clock=시각): 쉬는 시간이면 로비 위 '☕ 쉬는 시간 코인 +50% · n분 남음 · 한시적', 아니면 숨김
    await step('화면: 휴대폰 로비 · 쉬는 시간 알림', async () => {
      const p = await ctx.newPage();
      watch(p, '휴대폰', errs);
      const shown = async (q, sel) => {
        await p.goto(`${URL}/?acct=9&${q}`);
        await waitFor(p, () => window.__smash?.world && !document.querySelector('#login').classList.contains('hidden'), null, 60000, '로그인 화면 (' + q + ')');
        await p.fill('#login-nick', '점검폰');
        await p.click('#btn-guest');
        await waitFor(p, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '로비 (' + q + ')');
        return p.evaluate((s) => { const el = document.querySelector(s); return el.classList.contains('hidden') ? '' : el.textContent; }, sel);
      };
      const t = await shown('clock=09:53', '#break-banner');
      must(/\+50%/.test(t) && /7분 남음/.test(t) && /한시적/.test(t), '쉬는 시간(09:53)인데 알림이 이상해요: ' + t);
      must(/\+50%/.test(await shown('mobile=1&clock=09:53', '#break-banner')), '휴대폰 로비에 쉬는 시간 알림이 없어요');
      // 휴대폰은 사람 대결 탁구대 자리에 못 선다 (김제빵·관전·채팅만)
      await p.evaluate(() => window.__smash.plaza.sit(0, 0));
      must(await p.evaluate(() => document.body.classList.contains('mobile') && !window.__smash.plaza.pz.seat && /PC에서만/.test(document.querySelector('#toast').textContent)), '휴대폰인데 탁구대 자리에 서져요');
      must(!(await shown('clock=10:20', '#break-banner')), '쉬는 시간이 아닌데 알림이 떠요');
      await p.close();
      flush();
      return '09:53 알림 · 10:20 숨김 · 휴대폰은 자리에 못 섬';
    });

    await step('화면: 손님으로 들어가서 혼자 하기 (광장 김제빵 탁구대)', async () => {
      await page.fill('#login-nick', '점검손님');
      await page.click('#btn-guest');
      await waitFor(page, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '로비');
      await page.evaluate(() => window.__smash.plaza.kim()); // 김제빵 탁구대까지 걸어가서 혼자 하기
      await waitFor(page, () => window.__smash.game && window.__smash.match, null, 20000, '혼자 하기 시작');
      // 내 배경으로 물결 (plaza.md 19장 ⓓ): 김제빵 탁구대 좌표로 광장 → 경기장, 끝나면 광장은 숨고 좌표는 원래대로
      must(await page.evaluate(() => window.__smash.plaza.mwave.on || window.__smash.plaza.view.frameT === null), '혼자 하기 물결 상태가 이상해요');
      await waitFor(page, () => !window.__smash.plaza.mwave.on && !window.__smash.world.plaza.root.visible && window.__smash.plaza.view.frameT === null, null, 20000, '혼자 하기 시작 물결 끝');
      // 서브 토스: 캔버스를 누른다
      const fire = (type) => page.evaluate((type) => {
        const c = document.querySelector('#c');
        c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 640, clientY: 500, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }));
      }, type);
      await fire('pointerdown'); await fire('pointerup');
      await waitFor(page, () => window.__smash.world.ball.visible, null, 15000, '공이 보임');
      await page.waitForTimeout(1500);
      await page.click('#exit');
      await waitFor(page, () => !window.__smash.game, null, 10000, '나가기');
      await waitFor(page, () => window.__smash.world.plazaOn && !window.__smash.plaza.mwave.on && window.__smash.plaza.view.frameT === null, null, 20000, '혼자 하기 끝 → 물결 지나고 광장');
      flush();
    });

    await step('화면: 로그인(가짜 서버) → 꾸미기·랭킹', async () => {
      await page.evaluate(() => document.querySelector('#btn-me-menu')?.click());
      await page.evaluate(() => document.querySelector('#btn-logout')?.click());
      await waitFor(page, () => !document.querySelector('#login').classList.contains('hidden'), null, 10000, '로그인 화면');
      await page.fill('#login-nick', '점검봇');
      await page.fill('#login-pin', '1234');
      await page.click('#btn-login');
      await waitFor(page, () => !document.querySelector('#signup-form').classList.contains('hidden') || !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '가입 확인');
      if (await page.isVisible('#signup-form')) { await page.fill('#signup-pin', '1234'); await page.click('#btn-signup'); }
      await waitFor(page, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '로그인 뒤 로비');
      await waitFor(page, () => document.querySelectorAll('#lb-missions:not(.hidden) .lm-list li').length === 3, null, 10000, "로비 '오늘의 미션' 카드 3줄");
      await page.evaluate(() => document.querySelector('#btn-closet').click());
      await waitFor(page, () => !document.querySelector('#dress').classList.contains('hidden') && document.querySelectorAll('#item-grid > *').length > 0, null, 15000, '옷장 아이템 목록');
      const n = await page.evaluate(() => document.querySelectorAll('#item-grid > *').length);
      await page.evaluate(() => document.querySelector('#tab-gacha').click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('#btn-dress-back').click());
      await page.evaluate(() => document.querySelector('#btn-rank').click());
      await waitFor(page, () => !document.querySelector('#rank').classList.contains('hidden'), null, 10000, '랭킹 화면');
      await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelector('#btn-rank-back').click());
      await waitFor(page, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 5000, '랭킹 창 닫기 → 광장');
      flush();
      return `옷장 아이템 ${n}칸`;
    });

    // 화면 파일(src/ui/)마다 버튼이 제대로 연결됐는지: 뽑기·장착·칭호, 업데이트·치는 방법 창, PIN 바꾸기, 랭킹 탭
    await step('화면: 뽑기·장착·칭호·알림 창·PIN 화면', async () => {
      const vis = (sel) => page.evaluate((s) => !document.querySelector(s).classList.contains('hidden'), sel);
      const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
      await click('#btn-updates');
      must(await vis('#updates'), '업데이트 창이 안 열려요');
      await click('#btn-updates-close');
      await click('#btn-howto');
      must(await vis('#howto'), '치는 방법 창이 안 열려요');
      await click('#btn-howto-close');
      await click('#btn-me-menu');
      await click('#btn-pin');
      must(await vis('#pin-change'), 'PIN 바꾸기 화면이 안 열려요');
      await click('#btn-pin-cancel');
      must(await vis('#lobby'), 'PIN 화면에서 로비로 못 돌아와요');
      await click('#btn-rank');
      await waitFor(page, () => !document.querySelector('#rank').classList.contains('hidden'), null, 10000, '랭킹 화면');
      await click('#rank-tab-rally');
      await waitFor(page, () => document.querySelector('#rank-tab-rally').classList.contains('on') && !/불러오는/.test(document.querySelector('#rank-list').textContent), null, 10000, '최장 랠리 탭');
      await click('#btn-rank-back');
      // 꾸미기: 시험 코인 → 뽑기 10번 → 뽑은 것 장착 → 칭호 탭
      await click('#btn-closet');
      await waitFor(page, () => !document.querySelector('#dress').classList.contains('hidden') && document.querySelectorAll('#item-grid > *').length > 0, null, 15000, '옷장');
      await click('#tab-gacha');
      await click('#btn-test-coins');
      await waitFor(page, () => !document.querySelector('#btn-gacha-10').disabled, null, 10000, '뽑기 버튼 (시험 코인)');
      await click('#btn-gacha-10');
      // 광장 뽑기 기계 (plaza.md 19장 ⓒ): 꾸미기 창이 잠깐 숨고 캡슐이 굴러 나온 뒤 연출 화면으로
      must(await page.evaluate(() => document.body.classList.contains('pz-gacha') || !!window.__gachaTest?.active), '뽑기 기계 연출이 안 시작됐어요');
      // 뽑기 연출 화면: 공 10개가 다 떨어지면 '모두 깨기' → (금빛 공은 직접 깨야 하니) 점검용으로 바로 결과 → 나가기
      await waitFor(page, () => window.__gachaTest?.mode === 'tap', null, 30000, '뽑기 연출: 공 10개');
      await page.evaluate(() => [...document.querySelectorAll('#gacha-show .gs-btns button')].find((b) => b.dataset.act === 'all')?.click());
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__gachaTest.finishNow());
      await waitFor(page, () => !!document.querySelector('#gacha-exit:not(.gs-hide)'), null, 10000, '뽑기 연출: 나가기 버튼');
      await click('#gacha-exit');
      must(!(await page.evaluate(() => window.__gachaTest.active)), '나가기를 눌러도 뽑기 연출 화면이 안 닫혀요');
      must(await page.evaluate(() => !document.body.classList.contains('pz-gacha')), '뽑기를 나가도 꾸미기 창이 숨어 있어요');
      await waitFor(page, () => document.querySelectorAll('#gacha-result > li').length === 10, null, 15000, '뽑기 10장');
      await waitFor(page, () => !document.querySelector('#btn-gacha-1').disabled, null, 15000, '뽑기 끝');
      await click('#tab-closet');
      const before = await page.evaluate(() => JSON.stringify(window.__smash.shop.myEquip()));
      // 가진 것 중 장착 안 한 카드 하나 누르기 (카테고리를 돌며 찾음)
      let equippedOne = false;
      for (const cat of ['paddle', 'head', 'face', 'body', 'ball', 'bg']) {
        await page.evaluate((c) => document.querySelector(`#cat-chips [data-cat="${c}"]`)?.click(), cat);
        await page.waitForTimeout(150);
        const ok = await page.evaluate(() => { const li = document.querySelector('#item-grid li.card:not(.locked):not(.on)'); if (li) li.click(); return !!li; });
        if (ok) { equippedOne = true; break; }
      }
      if (equippedOne) await waitFor(page, (b) => JSON.stringify(window.__smash.shop.myEquip()) !== b, before, 10000, '장착');
      await click('#tab-title');
      await waitFor(page, () => document.querySelectorAll('#pane-title li.ach').length > 0, null, 10000, '칭호 탭 업적 목록');
      const nAch = await page.evaluate(() => document.querySelectorAll('#pane-title li.ach').length);
      await click('#btn-dress-back'); // 창이 쏙 들어간 뒤(0.2초) 광장으로 (plaza.md 19장)
      await waitFor(page, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 5000, '꾸미기에서 로비로 돌아오기');
      flush();
      return `뽑기 10장, ${equippedOne ? '장착 확인' : '장착할 새 아이템 없음'}, 업적 ${nAch}개`;
    });

    // 광장 로비 (docs/dev/plaza.md ①·③): 들어가면 광장, 탭 두 개가 서로 보임, 걷기(클릭 한 번 = 정보 한 번), 정해진 채팅, 가게 → 화면, 김제빵 도전 중, 40명 제한
    await step('화면: 광장 (탭 두 개) 걷기·채팅·가게', async () => {
      await page.evaluate(() => { window.__smashPause = true; }).catch(() => {}); // 앞 단계 탭은 쉬게 (광장 20장이 무거워져 헤드리스에서 다른 탭이 멈춤)
      const mk = async (nick, acct) => {
        const p = await ctx.newPage();
        watch(p, '광장 ' + nick, errs);
        await p.goto(URL + '/?acct=' + acct);
        await waitFor(p, () => window.__smash?.world && !document.querySelector('#login').classList.contains('hidden'), null, 60000, '광장 탭 준비');
        await p.evaluate(() => { try { localStorage.setItem('smash-howto-seen', '1'); } catch {} document.querySelector('#howto')?.classList.add('hidden'); });
        await p.fill('#login-nick', nick);
        await p.click('#btn-guest');
        await waitFor(p, () => window.__smash.world.plazaOn && document.querySelector('#lobby').classList.contains('plaza-on'), null, 15000, '로그인 뒤 광장');
        return p;
      };
      // 앞 단계의 로그인 탭도 광장에 서 있을 수 있어서 인원 수가 아니라 서로의 id로 확인
      const a = await mk('광장가', 7), b = await mk('광장나', 8);
      let sunOk = [];
      try {
      const idOf = (p) => p.evaluate(() => [...window.__smash.plaza.view.figs.entries()].find(([, f]) => f.me)[0]);
      const aId = await idOf(a), bId = await idOf(b);
      await waitFor(a, (id) => window.__smash.plaza.pz.people.has(id) && /[2-9]명/.test(document.querySelector('#pz-count').textContent), bId, 15000, '서로 보임 (광장 인원)');
      await waitFor(b, (id) => window.__smash.plaza.pz.people.has(id), aId, 15000, '서로 보임 (반대쪽)');
      must(await a.evaluate(() => window.__smash.world.arena.root.visible === false && !window.__smash.world.table.visible), '광장인데 옛 배경·탁구대가 보여요');
      // 시간·날씨 (src/plazaSky.js): 표시 글자, 대구 해 뜨는/지는 시각이 그럴듯한지
      await waitFor(a, () => /(아침|한낮|오후|일몰|저녁|밤) · (맑음|흐림|비|눈) · 대구/.test(document.querySelector('#pz-wx').textContent), null, 10000, '광장 시간·날씨 표시');
      sunOk = await a.evaluate(async () => {
        const { sunTimes } = await import('/src/plazaSky.js');
        const w = sunTimes(new Date('2026-12-21T03:00:00Z')), s = sunTimes(new Date('2026-06-21T03:00:00Z'));
        return [w.rise, w.set, s.rise, s.set].map((m) => +(m / 60).toFixed(2));
      });
      must(sunOk[0] > 7.2 && sunOk[0] < 7.7 && sunOk[1] > 17 && sunOk[1] < 17.5 && sunOk[2] > 5 && sunOk[2] < 5.4 && sunOk[3] > 19.5 && sunOk[3] < 19.9, '대구 일출·일몰 계산이 이상해요: ' + sunOk.join(', '));
      // 걷기: b가 바닥을 클릭 → a 화면에서 b가 그곳까지 걸어감
      const to = await b.evaluate(() => { window.__smash.plaza.walkTo([4, 6]); return window.__smash.plaza.pz.myW.to; });
      await waitFor(a, ([id, x, z]) => { const f = window.__smash.plaza.view.figs.get(id); return f && Math.hypot(f.c.group.position.x - x, f.c.group.position.z - z) < 0.1; }, [bId, to[0], to[1]], 15000, '상대 화면에서 걸어간 곳에 도착');
      // 건물 안으로는 못 들어감 (가게 앞에서 멈춤)
      // (plaza.md 8장 11/28 구역: 명예의 전당은 분수 북쪽 (0, −7.5), 걷기 막는 네모 앞면 z −4.45 — 분수를 돌아서 가도 마지막 도착점은 가게 앞)
      const clip = await b.evaluate(() => { const pz = window.__smash.plaza.pz; window.__smash.plaza.walkTo([0, -9]); const end = pz.route.length ? pz.route[pz.route.length - 1] : pz.myW.to; return end[1]; });
      must(clip > -4.6, '가게 건물 안으로 걸어 들어가요: z=' + clip);
      // 낚시터(fishing.md 12장·14장 1b): 광장 ↔ 전망대 밑 판은 돌계단(데크 서쪽·동쪽 2개, 가까운 쪽)으로만, 바닥 높이 · 데크에서 판으로 뛰어내리기·바다·항구로 걷기 막힘 · ㄷ자 양 팔 끝까지 걸어감
      const pier = await b.evaluate(async () => {
        const m = await import('/src/plaza.js'), { PLAZA } = await import('/src/arena-plaza.js'), h = (p) => +PLAZA.heightAt(p[0], p[1]).toFixed(2);
        const down = m.planWalk([0, 10], [8, 43]), up = m.planWalk([12, 44], [-5, 10]), downE = m.planWalk([16, 20], [19, 44]), upE = m.planWalk([20, 44], [15, 20]);
        return { down, up, downE, upE, hDeck: h([11, 36]), hMid: h([20, 41]), hMidW: h([2, 41]), hPier: h([8, 43]), hPierW: h([1.5, 44.5]), jump: m.clipWalk([11, 37], [11, 43])[1], sea: m.planWalk([12, 44], [12, 60]).at(-1)[1], west: m.planWalk([2, 44.8], [-5, 44.8]).at(-1)[0], westSea: m.clipWalk([-4, 44.8], [-9, 44.8])[0], armW: m.planWalk([8, 44], [-4, 56]).at(-1), armE: m.planWalk([12, 20], [26, 56]).at(-1), eastGrass: m.planWalk([15, 30], [27, 30]).at(-1)[0], on: PLAZA.onPier(8, 43) && PLAZA.onPier(2, 44.5) && PLAZA.onPier(-4, 56) && PLAZA.onPier(26, 50) && !PLAZA.onPier(11, 50) && !PLAZA.onPier(11, 36) && !PLAZA.onPier(2, 41) };
      });
      const viaSt = (r, x0, x1) => r.some((p) => p[0] > x0 && p[0] < x1 && p[1] > 43) && r.some((p) => p[0] > x0 && p[0] < x1 && p[1] < 39);
      must(viaSt(pier.down, 0.5, 3.7) && viaSt(pier.up, 0.5, 3.7) && viaSt(pier.downE, 18.3, 21.6) && viaSt(pier.upE, 18.3, 21.6) && pier.down.at(-1)[1] === 43 && pier.up.at(-1)[0] === -5, '낚시터 계단 길(서쪽·동쪽)이 이상해요: ' + JSON.stringify(pier));
      must(pier.hDeck === 0.25 && pier.hMid < -1 && pier.hMid > -4 && pier.hMidW === pier.hMid && pier.hPier === -4.35 && pier.hPierW === -4.35 && pier.jump < 39 && pier.sea < 46.5 && pier.west === -5 && pier.westSea > -6 && pier.westSea < -5 && Math.hypot(pier.armW[0] + 4, pier.armW[1] - 56) < 0.01 && Math.hypot(pier.armE[0] - 26, pier.armE[1] - 56) < 0.01 && pier.eastGrass < 21.5 && pier.on, '낚시터(ㄷ자 선착장 14장 1b) 높이·막힘이 이상해요: ' + JSON.stringify(pier));
      // 광장 낚시 (fishing.md 12장): 판 위 '🎣 낚시하기' → 그 자리에서 낚시 · 다른 사람에게 찌가 보임 · 잡으면 말풍선 · 그만하기
      const bHome = await b.evaluate(() => window.__smash.plaza.pz.myW.to.slice());
      await b.evaluate(() => window.__smash.plaza.walkTo([9, 43.6]));
      // 버튼은 걷다 잠깐 멈춰도 뜰 수 있어서(느린 PC) 끝까지 걸어와 선 뒤에 누른다 — 낚시는 지금 서 있는 자리에서 시작
      await waitFor(b, () => { const f = [...window.__smash.plaza.view.figs.values()].find((g) => g.me); return f?.disp && Math.hypot(f.disp[0] - 9, f.disp[1] - 43.6) < 0.2 && !document.querySelector('#fish-start').classList.contains('hidden'); }, null, 40000, '낚시 판 그 자리에 서서 낚시하기 버튼');
      // 판 위에서 판 바닥을 누르면 그 자리 (높이 0 평면이 아니라 낮은 판 바닥 — 예전엔 그 위 빈 공중이 눌림)
      const pierPick = await b.evaluate(() => {
        const { world, plaza } = window.__smash, cam = world.camera, rc = world.renderer.domElement.getBoundingClientRect();
        return [[6, 44.5], [12, 44.8]].map(([x, z]) => {
          const v = cam.position.clone().set(x, -4.35, z).project(cam), h = plaza.view.pick(rc.left + (v.x + 1) / 2 * rc.width, rc.top + (1 - v.y) / 2 * rc.height);
          return h?.ground && Math.hypot(h.ground[0] - x, h.ground[1] - z) < 0.2 ? 'ok' : JSON.stringify(h);
        });
      });
      must(pierPick.every((r) => r === 'ok'), '낚시 판 바닥을 눌러도 그 자리가 안 눌려요: ' + pierPick.join(', '));
      await b.evaluate(() => document.querySelector('#fish-start').click());
      await waitFor(b, () => window.__smash.fish.on && document.body.classList.contains('fishing-on'), null, 20000, '광장 낚시 시작');
      must(await b.evaluate(() => { const S = window.__smash.fish.F.S; return Math.abs(S.standX - 9) < 0.3 && Math.abs(S.standZ - 43.6) < 0.3; }), '누른 자리에서 낚시가 시작되지 않아요');
      await b.evaluate(() => window.__smash.fish.F.dbg.cast(0, 0.5));
      await waitFor(a, (id) => { const o = window.__smash.fish.others.get(id); return o && o.bob.visible; }, bId, 20000, '다른 사람 화면에 낚시 찌');
      await b.bringToFront(); // 잡기 연출은 그려야 흘러감 (헤드리스는 뒤 탭을 거의 안 그림)
      await waitFor(b, () => window.__smash.fish.F.S.mode === 'wait' && window.__smash.fish.F.dbg.landNow(), null, 10000, '바로 잡기');
      await waitFor(b, () => window.__smash.fish.F.S.mode === 'result', null, 30000, '잡기 연출 끝');
      await waitFor(a, (id) => performance.now() / 1000 - (window.__smash.plaza.view.figs.get(id)?.bubT ?? -99) < 30, bId, 20000, '잡으면 다른 사람 화면에 말풍선');
      await b.evaluate(() => document.querySelector('#fish-stop').click());
      await waitFor(a, (id) => { const o = window.__smash.fish.others.get(id); return !window.__smash.plaza.pz.people.get(id)?.fi && (!o || !o.bob.visible); }, bId, 15000, '그만하면 다른 사람 화면에서 찌 사라짐');
      // 계단·선착장에서는 탁구채 대신 낚싯대를 들고 다님 (11/26): 그만해도 판 위니까 낚싯대, 광장으로 올라가면 탁구채
      must(await a.evaluate((id) => window.__smash.fish.others.has(id) && !window.__smash.plaza.view.figs.get(id).c.blade.visible, bId), '선착장에 선 사람이 낚싯대를 안 들고 있어요');
      must(await b.evaluate(() => !window.__smash.fish.on && !document.body.classList.contains('fishing-on')), '그만하기가 안 돼요');
      await b.evaluate((pt) => window.__smash.plaza.walkTo(pt), bHome); // 원래 자리로 (뒤 점검의 클릭을 가리지 않게)
      await waitFor(b, (pt) => Math.hypot(window.__smash.plaza.pz.myW.to[0] - pt[0], window.__smash.plaza.pz.myW.to[1] - pt[1]) < 0.3 && !window.__smash.plaza.pz.route.length, bHome, 30000, '원래 자리로');
      await b.waitForTimeout(4000); // 마지막 구간을 다 걸을 때까지
      await waitFor(a, (id) => !window.__smash.fish.others.has(id), bId, 20000, '광장으로 올라가면 다시 탁구채');
      // 🪧 낚시 게시판 (계단 옆): 광장 누를 곳에 있고, 창이 3장(낚시 방법·팁·고양이)으로 열림
      const fb = await b.evaluate(async () => {
        const { PLAZA } = await import('/src/arena-plaza.js'), m = await import('/src/games/fishing/board.js');
        m.openFishBoard(2);
        const el = document.querySelector('#fish-board'), r = [!!PLAZA.spots.find((x) => x.id === 'fishBoard'), !el.classList.contains('hidden'), el.querySelectorAll('.fb-tabs button').length, el.querySelectorAll('.fb-list li').length > 3];
        el.querySelector('.fb-close').click();
        return [...r, el.classList.contains('hidden')];
      });
      must(fb.join() === 'true,true,3,true,true', '낚시 게시판이 이상해요: ' + fb.join());
      await a.bringToFront();
      // 카메라가 건물 바로 앞(클릭 상자 안)에 있어도 바닥을 누르면 바닥, 옆 가게를 누르면 그 가게 (plaza.md 클릭)
      const camPick = await b.evaluate(() => {
        const { world, plaza } = window.__smash, v = plaza.view, cam = world.camera;
        const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
        // 카메라를 명예의 전당 클릭 상자 안(문 앞 바로 앞)에 두고: 바닥을 누르면 바닥, 서쪽 골목 옷장을 누르면 꾸미기
        cam.position.set(0, 2.2, -3.5); cam.lookAt(0.5, 0, 0); cam.updateMatrixWorld();
        const ground = v.pick(...world.toScreen(0.5, 0, 0));
        cam.lookAt(-7.6, 1.5, -5.8); cam.updateMatrixWorld();
        const shop = v.pick(...world.toScreen(-7.6, 1.5, -5.8));
        cam.position.copy(p0); cam.quaternion.copy(q0); cam.updateMatrixWorld();
        return [ground && Object.keys(ground)[0], shop?.shop?.id];
      });
      must(camPick[0] === 'ground' && camPick[1] === 'closet', '카메라가 건물 앞에 있을 때 클릭이 이상해요: ' + camPick.join(', '));
      // 정해진 채팅: 목록 번호만, 2초에 한 번
      await b.evaluate(() => { window.__smash.plaza.say('8'); window.__smash.plaza.say('6'); });
      await waitFor(a, (id) => window.__smash.plaza.view.figs.get(id)?.bub.visible, bId, 10000, '상대 머리 위 말풍선');
      must(await b.evaluate(() => document.querySelector('#btn-say').disabled), '말하고 바로 또 말할 수 있어요 (2초에 한 번)');
      // 가게: 랭킹 건물을 클릭 → 걸어가서 랭킹 화면 → 돌아오면 다시 광장
      await a.evaluate(() => { document.querySelector('#lb-free')?.classList.add('hidden'); });
      const pt = await a.evaluate(() => window.__smash.world.toScreen(0, 2.2, -7.5)); // 명예의 전당 (plaza.md 8장: 본관 앞 가운데)
      await a.mouse.click(pt[0], pt[1]);
      await waitFor(a, () => !document.querySelector('#rank').classList.contains('hidden'), null, 20000, '랭킹 가게 → 랭킹 화면');
      must(await a.evaluate(() => !!window.__smash.plaza.pz.link), '랭킹 화면을 보는 동안 광장에서 빠졌어요');
      // 화면 전환 (plaza.md 19장): 랭킹 창 뒤에도 광장 그대로 + 카메라가 시상대로 날아감, 걷기 클릭은 꺼짐
      await waitFor(a, () => window.__smash.world.plazaOn && window.__smash.plaza.view.focusP > 0.99, null, 10000, '랭킹 창 뒤에 광장 + 카메라가 시상대로');
      must(await a.evaluate(async () => { const { WIN_CAM } = await import('/src/ui/plaza.js'); const [x, y, z] = WIN_CAM.rank.pos; return window.__smash.world.camera.position.distanceTo({ x, y, z }) < 0.6; }), '랭킹 카메라가 명예의 전당 앞이 아니에요');
      await a.evaluate(() => document.querySelector('#btn-rank-back').click());
      await waitFor(a, () => window.__smash.world.plazaOn && !document.querySelector('#lobby').classList.contains('hidden') && window.__smash.plaza.view.focusP === 0, null, 10000, '랭킹 → 광장 (카메라가 내 뒤로)');
      // 광장 20장 ② 눌러서 되는 곳: 빵집 → 김제빵 말풍선, 게시판 오른쪽 종이 → 치는 방법 창, 시계탑 → 쉬는 시간 알림, 전광판·시계 글자, 데크 위 높이
      const spotOk = await a.evaluate(async () => {
        const { PLAZA } = await import('/src/arena-plaza.js');
        const { boardsDebug } = await import('/src/ui/plazaBoards.js');
        const P = window.__smash.plaza, sp = (id) => PLAZA.spots.find((x) => x.id === id);
        P.spot(sp('bakery'), [0, 2, 3]);
        P.spot(sp('clock'), [0, 3, 1]);
        const toast = document.querySelector('#toast').textContent;
        await new Promise((r) => setTimeout(r, 1500));
        const k = boardsDebug.keys, o = boardsDebug.objs;
        return { toast, faces: o.faces.length, plate: !!o.plate, board: !!o.board, keys: !!(k.clockKey && k.plateKey && k.boardKey), deckH: PLAZA.heightAt(13, 34), groundH: PLAZA.heightAt(0, 10) };
      });
      must(/쉬는 시간|주말|다음|끝/.test(spotOk.toast), '시계탑을 눌렀는데 쉬는 시간 안내가 안 나와요: ' + spotOk.toast);
      must(spotOk.faces === 4 && spotOk.plate && spotOk.board && spotOk.keys, '시계탑·전광판 글자판을 못 찾았거나 안 그려요: ' + JSON.stringify(spotOk));
      must(spotOk.deckH > 0.2 && spotOk.groundH === 0, '전망대 데크 높이가 이상해요');
      await a.evaluate(async () => { const { PLAZA } = await import('/src/arena-plaza.js'); window.__smash.plaza.spot(PLAZA.spots.find((x) => x.id === 'board'), [1, 1.5, 0.4]); });
      await waitFor(a, () => !document.querySelector('#howto').classList.contains('hidden'), null, 20000, '게시판 오른쪽 종이 → 걸어가서 치는 방법 창');
      await a.evaluate(() => document.querySelector('#btn-howto-close').click());
      // 걷는 길이 탁구대에 막히면 모서리를 돌아서 간다 (1번 탁구대 건너편 자리 → 탁구대 앞에서 멈추지 않음)
      const around = await b.evaluate(async () => {
        const { planWalk } = await import('/src/plaza.js');
        return planWalk([-8, 13], [-18, 13]).length; // 1번 탁구대 (−14, 13)
      });
      must(around >= 2, '탁구대를 돌아가는 길을 못 찾아요');
      // ③ 김제빵 탁구대: b가 혼자 하기를 시작하면 a 화면에선 b 캐릭터가 사라지고 '🔥 1명 도전 중', 끝나면 다시 보임
      await b.evaluate(() => window.__smash.plaza.kim());
      await waitFor(b, () => window.__smash.game?.mode === 'ai' && window.__smash.plaza.pz.link, null, 20000, '김제빵 탁구대 → 혼자 하기 (광장 채널은 그대로)');
      await waitFor(a, (id) => window.__smash.plaza.kimN === 1 && !window.__smash.plaza.view.figs.has(id) && window.__smash.plaza.view.kimN === 1, bId, 15000, "상대 화면: 도전자는 안 보이고 '🔥 1명 도전 중'");
      await b.evaluate(() => document.querySelector('#exit').click());
      await waitFor(a, (id) => window.__smash.plaza.kimN === 0 && window.__smash.plaza.view.figs.has(id), bId, 15000, '혼자 하기를 끝내면 다시 광장에 보임');
      // ⑤ 모집 알림·콕 집어 초대: a가 1번 탁구대에 서서 '구해요' → b 화면 위 띠 / a가 b를 눌러 초대 → b 수락 → 같은 탁구대
      await a.evaluate(() => window.__smash.plaza.sit(0, 0));
      await waitFor(b, () => window.__smash.plaza.state(0).n === 1, null, 10000, 'b 화면에 a가 1번 탁구대에 섬');
      await a.evaluate(() => window.__smash.plaza.call());
      await waitFor(b, () => !document.querySelector('#pz-call').classList.contains('hidden') && /1번 탁구대/.test(document.querySelector('#pz-call').textContent), null, 10000, "b 화면에 '1번 탁구대 … 구해요!' 띠");
      must(await a.evaluate(() => document.querySelector('#pz-table [data-pzt="call"]').disabled), "'구해요'를 보낸 뒤 15초 동안 버튼이 잠기지 않아요");
      await a.evaluate((id) => { window.__smash.plaza.person(id); window.__smash.plaza.invite(); }, bId);
      await waitFor(b, () => !document.querySelector('#pz-invite').classList.contains('hidden'), null, 10000, 'b가 초대를 받음');
      await b.evaluate(() => document.querySelector('#pz-invite [data-ok]').click());
      await waitFor(a, () => window.__smash.plaza.state(0).n === 2, null, 15000, '초대 수락 → 같은 탁구대에 섬');
      await b.evaluate(() => window.__smash.plaza.unseat());
      await a.evaluate(() => window.__smash.plaza.unseat());
      // 김제빵 부르기 (사람 3명 흉내: 가짜 두 명을 같은 탁구대에) → 김제빵 자리·뛰어오기 → 사람이 줄면 돌아감
      const kimOk = await a.evaluate(async () => {
        const P = window.__smash.plaza, me = [...P.view.figs.entries()].find(([, f]) => f.me)[0], now = Date.now();
        P.sit(2, 0);
        let two = true; // 진짜 광장 명단이 와도 가짜 두 명이 계속 있게 (0.2초마다 다시)
        const fk = () => {
          P.fakeList([{ id: me, nick: 'me', at: P.pz.at }, { id: 'kf1', nick: '가짜1', at: 1 }, ...(two ? [{ id: 'kf2', nick: '가짜2', at: 1 }] : [])]);
          P.fakeState({ k: 'st', id: 'kf1', w: { from: [-10, 4], to: [-10, 4], t: now }, seat: { t: 2, s: 1, at: now + 5 } });
          if (two) P.fakeState({ k: 'st', id: 'kf2', w: { from: [-6, 4], to: [-6, 4], t: now }, seat: { t: 2, s: 2, at: now + 6 } });
          else P.fakeState({ k: 'st', id: 'kf2', w: { from: [-6, 4], to: [-6, 4], t: now }, seat: null });
        };
        fk();
        const iv = setInterval(fk, 200);
        P.pz.callT[2] = now - 11000;
        let btn = false;
        for (let i = 0; i < 40 && !btn; i++) { await new Promise((r) => setTimeout(r, 150)); btn = !!document.querySelector('#pz-table [data-pzt="kim"]'); } // 느린 PC: 자리 판이 다시 그려질 때까지
        fk(); // 진짜 광장 명단이 그사이 가짜를 덮었을 수 있어서 바로 앞에 다시
        P.callKim();
        await new Promise((r) => setTimeout(r, 400));
        fk();
        const s = P.state(2), kimSeat = s.seats.findIndex((x) => x?.kim);
        const runner = P.view.kimRuns;
        // 사람이 2명이 되면 2.5초 뒤 김제빵이 돌아감
        two = false;
        await new Promise((r) => setTimeout(r, 3500));
        const bye = !!P.pz.kim?.bye;
        clearInterval(iv);
        P.unseat();
        return { btn, kimSeat, runner, bye };
      });
      must(kimOk.btn && kimOk.kimSeat === 3 && kimOk.runner === 1 && kimOk.bye, '김제빵 부르기가 이상해요: ' + JSON.stringify(kimOk));
      // 김제빵 자리는 방장 PC의 경기 로직이 대신 침 (스스로 토스·서브)
      const botOk = await a.evaluate(async () => {
        const { Match } = await import('/src/match.js');
        const evs = [];
        const m = new Match({ mode: '2v2', emit: (e) => evs.push(e.type + ':' + (e.side ?? '') + ':' + (e.slot ?? '')), bots: [{ side: 1, slot: 1 }] });
        m.turn = 3; m.server = 1; m.readyServe(0);
        for (let t = 0; t < 4; t += 0.02) m.update(t);
        return evs.join(' ');
      });
      must(/toss:1:1/.test(botOk) && /shot:1:1/.test(botOk), '김제빵 자리가 스스로 서브를 안 해요: ' + botOk);
      // 40명 제한: 먼저 온 40명 뒤에 내가 있으면 '꽉 찼어요' → 혼자 광장 (광장 채널에서 빠짐)
      await a.evaluate(() => {
        const me = window.__smash.plaza.pz;
        const list = Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, nick: 'n' + i, at: 1, w: { from: [0, 0], to: [0, 0], t: 1 } }));
        window.__smash.plaza.fakeList([...list, { id: [...window.__smash.plaza.view.figs.entries()].find(([, f]) => f.me)[0], nick: 'me', at: me.at, w: me.myW }]);
      });
      await waitFor(a, () => window.__smash.plaza.pz.full && !window.__smash.plaza.pz.link && /꽉 찼어요/.test(document.querySelector('#pz-count').textContent), null, 10000, '41번째는 광장 채널에 못 들어감');
      } finally { await a.close(); await b.close(); } // 실패해도 탭을 닫아 다음 점검이 느려지지 않게
      flush();
      // 날씨 흉내 (?wx=snow&sky=night): 눈이 내리고 밤 하늘
      const n = await ctx.newPage();
      watch(n, '광장 밤 눈', errs);
      try {
        await n.goto(URL + '/?acct=6&wx=snow&sky=night');
        await waitFor(n, () => window.__smash?.world && !document.querySelector('#login').classList.contains('hidden'), null, 60000, '밤·눈 탭 준비');
        await n.fill('#login-nick', '눈사람');
        await n.click('#btn-guest');
        await waitFor(n, () => window.__smash.plaza.sky && /밤 · 눈/.test(document.querySelector('#pz-wx').textContent), null, 15000, '밤·눈 표시');
        must(await n.evaluate(() => window.__smash.world.plaza.snowLayer.visible && window.__smash.world.scene.background.getHSL({}).l < 0.4), '눈 쌓임·밤 하늘이 안 보여요');
      } finally { await n.close(); }
      return '서로 보임 · 걷기 · 돌아가기 · 말풍선 · 랭킹 가게 · 김제빵 도전 중 · 구해요 알림·초대·김제빵 부르기 · 40명 제한 · 시간·날씨 (대구 일출 ' + sunOk[0] + '시)';
    });

    // 광장 탁구대 (docs/dev/plaza.md ②): 자리에 서기 → 준비 → VS 소개 → 경기(광장 채널에서 빠짐) → 관전 → 끝나면 광장 + '한 판 더' → 다시 시작
    // 같은 칸 다툼(먼저 선 사람), 자리 비움(1분)도
    await step('화면: 광장 탁구대 1대1 (탭 두 개) 서기 → 준비 → 경기 → 한 판 더 · 경기장 거품 관전', async () => {
      await page.evaluate(() => { window.__smashPause = false; }); // 이 단계는 앞 단계 탭이 방장
      const guest = await ctx.newPage();
      watch(guest, '참가자', errs);
      await guest.goto(URL + '/?acct=2');
      await waitFor(guest, () => window.__smash?.world, null, 60000, '참가자 탭 준비');
      await guest.evaluate(() => document.querySelector('#howto')?.classList.add('hidden'));
      await guest.fill('#login-nick', '점검참가');
      await guest.click('#btn-guest');
      let viewer = null;
      try {
      await waitFor(guest, () => window.__smash.plaza.pz.link, null, 10000, '참가자 광장');
      await waitFor(page, () => window.__smash.plaza.pz.link, null, 10000, '방장 광장');
      const idOf = (p) => p.evaluate(() => [...window.__smash.plaza.view.figs.entries()].find(([, f]) => f.me)[0]);
      const hostId = await idOf(page);
      await waitFor(guest, (id) => window.__smash.plaza.pz.people.has(id), hostId, 15000, '참가자 화면에 방장');
      // 먼저 선 사람 = 방장. 같은 칸은 먼저 선 사람 것 (참가자가 눌러도 안 됨)
      await page.evaluate(() => window.__smash.plaza.sit(1, 0));
      await waitFor(guest, () => window.__smash.plaza.state(1).seats[0], null, 10000, '참가자 화면에 방장 자리');
      await guest.evaluate(() => window.__smash.plaza.sit(1, 0));
      must(await guest.evaluate(() => !window.__smash.plaza.pz.seat), '이미 사람이 선 칸에 또 서져요');
      await guest.evaluate(() => window.__smash.plaza.sit(1, 2));
      await waitFor(page, () => { const s = window.__smash.plaza.state(1); return s.mode === '1v1' && s.host?.me; }, null, 10000, '방장 화면: 1대1, 내가 방장');
      await waitFor(guest, () => !document.querySelector('#pz-table').classList.contains('hidden') && /준비/.test(document.querySelector('#pz-table').textContent), null, 10000, '자리 판');
      // 둘 다 준비 → 경기 화면 (VS 소개)
      await page.evaluate(() => window.__smash.plaza.ready());
      await page.waitForTimeout(600);
      must(await page.evaluate(() => !window.__smash.room), '혼자만 준비했는데 시작돼요');
      await guest.evaluate(() => window.__smash.plaza.ready());
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.intro && window.__smash.intro.seg && window.__smash.intro.seg !== 'dim', null, 30000, '연출: VS 소개');
      // 경기 시작 물결 (plaza.md 19장 ⓑ): 광장 → 방장 경기장 (VS 소개 첫 장면), 늦어도 VS 장면 전에 끝
      for (const p of [page, guest]) must(await p.evaluate(() => window.__smash.intro.wave === true), '경기 시작 물결이 안 시작됐어요');
      // 경기가 시작되면 선수는 광장 채널에서 빠진다 (선수 부담 0)
      for (const p of [page, guest]) must(await p.evaluate(() => !window.__smash.plaza.pz.link && window.__smash.room?.inGame && window.__smash.room.pt === 1), '경기 중인데 광장 채널에 붙어 있어요');
      await page.evaluate(() => document.querySelector('#vi-skip-btn').click());
      await waitFor(guest, () => document.querySelectorAll('#vi-skip-dots i.on').length === 1, null, 10000, '참가자 화면에 건너뛰기 초록 불 1개');
      await guest.evaluate(() => document.querySelector('#vi-skip-btn').click());
      for (const p of [page, guest]) await waitFor(p, () => !window.__smash.intro || window.__smash.intro.seg.includes('hush'), null, 10000, '모두 건너뛰기 → 정적');
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.game && !window.__smash.intro, null, 30000, '경기 시작');
      for (const p of [page, guest]) must(await p.evaluate(() => !window.__smash.plaza.mwave.on && !document.body.classList.contains('mwave') && !window.__smash.world.plaza.root.visible && window.__smash.world.arena.root.visible && window.__smash.plaza.view.frameT === null), '경기 시작 물결이 끝나지 않았거나 광장이 남아 있어요');
      // 선수끼리 WebRTC 직접 연결 (같은 브라우저 탭끼리도 붙음) → 경기 화면에 '⚡ 직접 연결'
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.room?.link.direct() && /직접 연결/.test(document.querySelector('#net-pill').textContent) && !document.querySelector('#net-pill').classList.contains('hidden'), null, 15000, "WebRTC 직접 연결 '⚡ 직접 연결' 표시");
      // 연결 표시를 누르면 진단 (왜 서버 경유인지 보려고)
      await page.evaluate(() => document.querySelector('#net-pill').click());
      await waitFor(page, () => !document.querySelector('#net-diag').classList.contains('hidden') && /직접 연결됨/.test(document.querySelector('#net-diag').textContent) && /보낸 주소: (?!없음)/.test(document.querySelector('#net-diag').textContent), null, 5000, '연결 진단 창');
      await page.evaluate(() => document.querySelector('#net-pill').click());
      const startedAt = Date.now();
      // 관전: 세 번째 탭이 광장에서 경기 중인 2번 탁구대를 누르면 중계 화면
      viewer = await ctx.newPage();
      watch(viewer, '관중', errs);
      await viewer.goto(URL + '/?acct=3');
      await waitFor(viewer, () => window.__smash?.world, null, 60000, '관중 탭 준비');
      await viewer.evaluate(() => document.querySelector('#howto')?.classList.add('hidden'));
      await viewer.fill('#login-nick', '점검관중');
      await viewer.click('#btn-guest');
      await waitFor(viewer, () => window.__smash.plaza.state(1).busy, null, 15000, '광장에서 2번 탁구대가 경기 중으로 보임');
      must(await viewer.evaluate(() => { window.__smash.plaza.sit(1, 1); return !window.__smash.plaza.pz.seat; }), '경기 중인 탁구대 자리에 서져요');
      // 경기장 거품 (plaza.md 16장): 경기 중인 2번 탁구대 둘레 불꽃 고리, 원(6m) 안으로 들어가면 그 경기장으로 바뀌며 관전(듣기만)
      must(await viewer.evaluate(() => window.__smash.plaza.view.frameT === null), '거품 밖인데 좌표가 바뀌어 있어요');
      await viewer.evaluate(() => window.__smash.plaza.table(1)); // 탁구대를 누르면 원 안으로 걸어 들어감
      await waitFor(viewer, () => window.__smash.plaza.bubble.phase !== 'off', null, 30000, '원 안으로 걸어 들어감 → 관전 시작');
      await waitFor(viewer, () => window.__smash.plaza.bubble.phase === 'inside' && !window.__smash.world.plazaOn && window.__smash.plaza.view.frameT === 1, null, 60000, '원 안 → 경기장으로 바뀜 (방장 배경을 짓느라 느린 PC에선 오래 걸림)');
      await waitFor(viewer, () => /2번 탁구대/.test(document.querySelector('#pz-bub').textContent) && /점검참가/.test(document.querySelector('#pz-bub').textContent), null, 10000, '거품 막대에 탁구대·선수 이름');
      // 응원: 팀 고르고 박수 → 2초 잠김
      await viewer.evaluate(() => document.querySelector('#pz-bub [data-team="0"]').click());
      await viewer.evaluate(() => document.querySelector('#pz-bub [data-cheer="clap"]').click());
      await waitFor(viewer, () => document.querySelector('#pz-bub [data-cheer="fire"]').disabled, null, 3000, '응원 2초 잠김');
      // 관중석에 앉기 (관중석 내 자리 1인칭) → 일어나기
      await viewer.evaluate(() => document.querySelector('#pz-bub [data-bub="seat"]').click());
      await waitFor(viewer, () => window.__smash.plaza.bubble.seated && window.__smash.plaza.bubble.game.view === 'me', null, 5000, '관중석에 앉기');
      await viewer.evaluate(() => document.querySelector('#pz-bub [data-bub="seat"]').click());
      await waitFor(page, () => document.querySelector('#crowd-pill').textContent.includes('관중 1명'), null, 10000, "선수 화면에 '관중 1명'");
      await waitFor(page, () => window.__smash.world.crowd.root.children.some((g) => (g.userData.tag || '').startsWith('점검관중/')), null, 10000, '선수 화면 관중석에 관중 캐릭터(이름표)');
      // 경기 끝 → 선수는 광장 그 자리에 그대로 + 결과·코인 + '🔁 한 판 더', 관중도 광장으로
      await page.waitForTimeout(Math.max(0, 27000 - (Date.now() - startedAt))); // 서버는 25초보다 빨리 끝난 경기엔 코인을 안 줌
      await page.evaluate(() => window.__smash.match.emit({ type: 'gameOver', winner: 0, score: [5, 0] }));
      // 경기 끝 물결 (19장 ⓑ): 경기장이 걷히고 광장으로 (그동안 그 탁구대 좌표, 끝나면 광장 그대로)
      await waitFor(page, () => window.__smash.plaza.mwave.on && !window.__smash.plaza.mwave.enter && window.__smash.plaza.view.frameT === 1, null, 20000, '경기 끝 → 경기장이 걷히는 물결');
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.world.plazaOn && window.__smash.plaza.pz.link && window.__smash.plaza.pz.seat?.t === 1 && /한 판 더/.test(document.querySelector('#pz-table').textContent), null, 20000, "경기 끝 → 광장 자리에 '한 판 더'");
      await waitFor(page, () => /승리! 5 : 0/.test(document.querySelector('#pz-table').textContent) && /코인/.test(document.querySelector('#pz-table .coins-got').textContent) && !/정산 중/.test(document.querySelector('#pz-table .coins-got').textContent), null, 15000, '방장(로그인) 자리 판에 승리·코인');
      await waitFor(viewer, () => window.__smash.plaza.bubble.phase === 'off' && window.__smash.world.plazaOn && window.__smash.plaza.view.frameT === null && document.querySelector('#pz-bub').classList.contains('hidden'), null, 30000, '경기 끝 → 거품이 걷히고 광장으로');
      // 한 판 더: 둘 다 누르면 다시 시작
      await page.evaluate(() => window.__smash.plaza.ready());
      await guest.evaluate(() => window.__smash.plaza.ready());
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.intro && window.__smash.room?.inGame, null, 30000, '한 판 더 → 다시 VS 소개');
      flush();
      // 방장이 경기 중에 나가면: 방장은 자리에서 내려오고, 참가자는 광장 자리로 돌아옴
      await page.evaluate(() => document.querySelector('#exit').click());
      await waitFor(guest, () => !window.__smash.game && window.__smash.world.plazaOn && window.__smash.plaza.pz.seat?.t === 1, null, 15000, '방장이 나가면 참가자는 광장 자리로');
      await waitFor(page, () => !window.__smash.game && window.__smash.world.plazaOn && !window.__smash.plaza.pz.seat, null, 15000, '나간 방장은 광장 (자리에서 내려옴)');
      // 자리 비움: 1분 동안 아무것도 안 하면 내려온다
      await guest.evaluate(() => window.__smash.plaza.afk());
      await waitFor(guest, () => !window.__smash.plaza.pz.seat && /자리|내려왔어요/.test(document.querySelector('#toast').textContent), null, 5000, '자리 비움 → 내려옴');
      } finally {
        for (const p of [viewer, guest]) await p?.close().catch(() => {}); // 실패해도 탭을 닫아 다음 점검이 느려지지 않게
      }
      flush();
      return '서기·같은 칸 다툼·준비·WebRTC 직접 연결·경기 중 광장에서 빠짐·경기장 거품 관전·응원·관중석에 앉기·한 판 더·자리 비움';
    });

    await step('화면: 탁구대 19종 짓기·바꾸기 (튀기·득점 연출)', async () => {
      await page.evaluate(() => { window.__smashPause = false; });
      const r = await page.evaluate(async () => {
        const w = window.__smash.world, out = [];
        const I = await import('/src/tables.js');
        const orig = w.setTable; let want = 'blue';
        w.setTable = () => orig(want); // 루프가 내 장착으로 되돌리지 않게
        try {
          for (const t of I.TABLES) {
            want = t.id;
            const t0 = performance.now();
            while (w.table?.name !== 'table:' + t.id && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
            if (w.table?.name !== 'table:' + t.id) return { fail: t.id };
            w.table.userData.bounce?.([0.2, 0.76, -0.5], true, null);
            w.tableScore({ x: 0.1, z: -1.37, smash: true });
            await new Promise((r) => setTimeout(r, 150));
            out.push(t.id);
          }
          want = 'blue';
          await new Promise((r) => setTimeout(r, 200));
        } finally { w.setTable = orig; }
        return { out };
      });
      must(!r.fail, `탁구대 ${r.fail}이(가) 안 바뀌어요` + (errs.length ? '\n' + [...new Set(errs.splice(0))].slice(0, 4).join('\n') : ''));
      flush();
      return `${r.out.length}종`;
    });

    await step('화면: 배경 9종 짓기·바꾸기', async () => {
      const r = await page.evaluate(async () => {
        const w = window.__smash.world, out = [];
        const orig = w.setArena; let want = 'gym';
        w.setArena = () => orig(want); // 루프가 내 장착으로 되돌리지 않게
        try {
          for (const id of ['commute', 'evening', 'picnic', 'beach', 'snow', 'bakery', 'classroom', 'training', 'parking', 'gym']) {
            want = id;
            const t = performance.now();
            while (w.arenaId !== id && performance.now() - t < 40000) await new Promise((r) => setTimeout(r, 50));
            if (w.arenaId !== id) return { fail: id };
            if (id !== 'gym') out.push(`${id} ${w.arena.bake?.removed ?? 0}→${w.arena.bake?.added ?? 0}`);
            await new Promise((r) => setTimeout(r, 200));
          }
        } finally { w.setArena = orig; }
        return { out };
      });
      // 경기장 거품 안 걸을 수 있는 범위 (src/arenaWalls.js): 교실은 벽이 가깝고, 해변은 벽이 없음(8m = 거품 나가기)
      const wl = await page.evaluate(async () => { const m = await import('/src/arenas.js'); const c = m.buildArena('classroom').walls, b = m.buildArena('beach').walls; return [c.x1, c.z1, b.x1]; });
      must(wl[0] > 4 && wl[0] < 7 && wl[1] <= 8 && wl[2] === 8, '배경 벽 재기가 이상해요: ' + wl.join(', '));
      must(!r.fail, `배경 ${r.fail}이(가) 안 바뀌어요` + (errs.length ? '\n' + [...new Set(errs.splice(0))].slice(0, 4).join('\n') : ''));
      flush();
      return '합친 물건 ' + r.out.join(', ');
    });

    await page.evaluate(() => { window.__smashPause = true; }).catch(() => {}); // 시안 페이지를 여는 동안 앞 탭은 쉬게 (헤드리스는 그래픽 카드 없이 그려서 광장 탭이 다른 탭을 느리게 함)
    for (const [file, ready] of [['outfits.html', '몸 꾸미기 시안'], ['balls.html', '탁구공 시안'], ['tables.html', '탁구대 시안'], ['hats.html', '머리·얼굴 꾸미기 시안'], ['gacha.html', '뽑기 시안'], ['bubble.html', '경기장 거품 효과 시안'], ['campus.html', '광장 새 디자인 시안'], ['campus.html?props=1', '광장 시안 + 무료 소품 모델(glb)'], ['fishing.html', '낚시 손맛 시안'], ['fish-models.html', '물고기·잡동사니 모형 시안'], ['cats.html', '고양이 모형 시안'], ['beat-friends.html', '박자 친구들 시안'], ['rtc-test.html', '연결 속도 측정']]) {
      await step(`화면: ${ready} 페이지 (${file})`, async () => {
        const p = await ctx.newPage();
        watch(p, file, errs);
        await p.goto(`${URL}/${file}`, { timeout: 90000 }); // 시안 페이지는 3D 모형을 많이 지어서 느린 PC(CI)에선 오래 걸린다
        await p.waitForLoadState('load');
        await p.waitForTimeout(2500);
        let note = '';
        if (file === 'fishing.html') { // 낚시: 리듬 없이 바로 잡기(잡동사니·전설 탁구채·물고기) → 도감 (fishing.md 9장)
          const got = [];
          for (const f of ['junk', 'paddle', 'octopus']) {
            await p.evaluate((f) => { const F = window.__fish; F.TUNE.fish = f; F.S.mode = 'ready'; F.catchNow(); }, f);
            await p.waitForFunction(() => window.__fish.S.mode === 'result', null, { timeout: 60000 });
            got.push(await p.evaluate(() => window.__fish.S.result.c.kind));
          }
          must(got.join() === 'junk,paddle,fish', '낚시 잡기 결과가 이상해요: ' + got.join());
          await p.evaluate(() => window.__fish.openDex());
          const cards = await p.evaluate(() => document.querySelectorAll('#dex .card').length);
          must(cards === 17, '도감 물고기 칸이 17개가 아니에요: ' + cards);
          // 로그인(가짜 서버) → 던지면 서버가 정하고, 잡으면 코인·도감·월척 랭킹 (28과 같은 규칙)
          await p.evaluate(async () => { const A = await import('/src/account.js'); await A.signup('낚시점검', '1234'); });
          await p.reload(); await p.waitForFunction(() => window.__fish?.online(), null, { timeout: 60000 });
          await p.evaluate(() => { const F = window.__fish; F.TUNE.fish = 'random'; F.S.mode = 'ready'; F.cast(0, 0.5); });
          await p.waitForFunction(() => window.__fish.S.castId && (window.__fish.hold = true), null, { timeout: 60000 }); // 서버 답이 오면 입질 멈춤
          await p.waitForFunction(() => window.__fish.S.mode === 'wait' && window.__fish.S.fish && window.__fish.S.castId, null, { timeout: 60000 });
          await p.waitForTimeout(17000); // 서버 최소 시간(전설 16초)보다 오래
          await p.evaluate(() => window.__fish.landNow());
          await p.waitForFunction(() => window.__fish.S.mode === 'result' && (window.__fish.S.result.coins != null || window.__fish.S.result.srvNote), null, { timeout: 60000 });
          const res = await p.evaluate(async () => { const r = window.__fish.S.result, A = await import('/src/account.js'); return { kind: r.c.kind, coins: r.coins, note: r.srvNote, rank: await A.getFishRank('week'), dex: (await A.fishDex()).dex.length }; });
          const bagged = await p.evaluate(() => !!window.__fish.S.result.bagged);
          must(!res.note && res.coins === 0 && (res.kind !== 'fish' || (bagged && res.rank[0]?.nick === '낚시점검')) && (res.kind === 'paddle' || res.dex === 1),
            '로그인 낚시(서버) 결과가 이상해요(35부터 물고기는 가방에 · 코인 0): ' + JSON.stringify(res).slice(0, 300));
          // 🍣 횟집 (fishing.md 14-6): 가방에 고등어 2 · 참돔 1 → 창에 3칸 → 모두 팔기 → 코인 = market.js sellCoins, 가방 비움
          const shop = await p.evaluate(async () => {
            const db = JSON.parse(localStorage.getItem('smash-local-db'));
            const me = Object.values(db.players).find((q) => q.nick === '낚시점검');
            me.fishBag = { mackerel: 2, seabream: 1, horse: 0 }; localStorage.setItem('smash-local-db', JSON.stringify(db));
            const A = await import('/src/account.js'), Sh = await import('/src/games/fishing/shop.js'), MK = await import('/src/games/fishing/market.js'), B = await import('/src/breaks.js');
            await A.fishBagLoad();
            const c0 = A.account.player.coins;
            Sh.openShop();
            const cards = document.querySelectorAll('#fshop .fc').length, rows = document.querySelectorAll('#fshop .board .row').length;
            const want = MK.sellPlan([['mackerel', 2], ['seabream', 1]], B.nowMs()).coins;
            document.querySelector('#fshop .all').click();
            for (let i = 0; i < 50 && !/🪙/.test(document.querySelector('#fshop .say').textContent); i++) await new Promise((r) => setTimeout(r, 100));
            return { cards, rows, got: A.account.player.coins - c0, want, bag: A.account.fishBag.length, say: document.querySelector('#fshop .say').textContent };
          });
          must(shop.cards === 2 && shop.rows === 17 && shop.got === shop.want && shop.bag === 0, '횟집 창·팔기가 이상해요: ' + JSON.stringify(shop));
          note = `잡동사니·전설 탁구채·물고기 잡기 · 도감 17칸 · 로그인 낚시(${res.kind}${bagged ? ' → 가방' : ''}) · 횟집 모두 팔기 +${shop.got}`;
        }
        await p.close();
        flush();
        return note;
      });
    }
  } finally {
    await browser.close();
    vite.stop();
  }
}

(async () => {
  say('🏓 자동 점검 시작\n');
  await step('빌드', build);
  await step('서버 SQL (빈 DB에 두 번 실행 + anon으로 기능 확인)', sqlCheck);
  await step('서버 함수: /api/turn 서울 중계 출입증 (설정 없으면 503 → 게임은 중계 없이)', async () => {
    const { default: h } = await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '..', 'api', 'turn.js')).href);
    const saved = [process.env.CF_TURN_KEY_ID, process.env.CF_TURN_API_TOKEN];
    delete process.env.CF_TURN_KEY_ID; delete process.env.CF_TURN_API_TOKEN;
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
    try { await h({}, res); } finally { if (saved[0]) process.env.CF_TURN_KEY_ID = saved[0]; if (saved[1]) process.env.CF_TURN_API_TOKEN = saved[1]; }
    must(res.code === 503 && res.body?.error === 'not_configured', '설정이 없을 때 503이 아니에요: ' + JSON.stringify(res));
    return '설정 없음 → 503';
  });
  await browserChecks();
  if (psql) try { psql('postgres', `drop database if exists ${DB};`); } catch { /* 정리 실패는 무시 */ }
  say(`\n${failed ? `❌ ${failed}개 실패` : '✅ 모두 통과'} (${results.filter((r) => r[0] === '✓').length}개 통과, ${results.filter((r) => r[0] === '–').length}개 건너뜀)`);
  process.exit(failed ? 1 : 0);
})();
