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
  const fin = json(`public.pingpong_match_finish(${tk}, '${mid}', true, 0, 0)`);
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
    const cast = () => json(`public.pingpong_fish_cast(${tk}, 13, 0, 0.5, false)`);
    const c1 = cast();
    must(c1.status === 'ok' && c1.cast?.id && ['fish', 'junk', 'paddle'].includes(c1.cast.kind), '던지기 실패: ' + JSON.stringify(c1));
    must(json(`public.pingpong_fish_finish(${tk}, '${c1.cast.id}', true, true)`).status === 'too_fast', '던지자마자 잡았다고 해도 인정됐어요');
    // 걸린 것을 정해 두고(운영자처럼) 30초 전에 던진 걸로 → 잡기
    const setCast = (kind, item, grade, cm) => psql(DB, `update public.pingpong_players set fish_cast = jsonb_build_object('id', 'chk', 'kind', '${kind}', 'item', '${item}', 'grade', '${grade}', 'cm', ${cm}, 'dup', false, 'near', 0, 'at', extract(epoch from clock_timestamp()) - 30) where nick = '점검봇';`);
    const brkNow = psql(DB, `select public.pingpong__is_break(now());`) === 't';
    setCast('fish', 'dragon', 'legend', 95);
    const f1 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    const ids = (f1.new || []).map((n) => n.id);
    must(f1.status === 'ok' && f1.caught && f1.first && f1.big && f1.coins === (brkNow ? 30 : 20) && ids.includes('fish_big') && ids.includes('fish_legend'),
      '전설 물고기 95cm 잡기가 이상해요(코인 20 · 월척·전설 업적): ' + JSON.stringify(f1).slice(0, 300));
    must(json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`).status === 'no_cast', '같은 물고기를 두 번 잡았어요');
    setCast('fish', 'mackerel', 'common', 40);
    const f2 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    must(f2.coins === (brkNow ? 5 : 3) && f2.first && !f2.big, '일반 물고기 코인이 3이 아니에요: ' + JSON.stringify(f2).slice(0, 200));
    // 분당 상한: 주머니가 비면 코인 0 (capped)
    psql(DB, `update public.pingpong_players set fish_pocket = 0, fish_pocket_at = now() where nick = '점검봇';`);
    setCast('fish', 'seabream', 'rare', 50);
    const f3 = json(`public.pingpong_fish_finish(${tk}, 'chk', true, true)`);
    must(f3.coins === 0 && f3.capped, '분당 상한이 안 걸려요: ' + JSON.stringify(f3).slice(0, 200));
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
    // 실제 던지기 200번: 잡히는 것이 목록 안 · 크기 20~100
    const many = JSON.parse(psql(DB, `set role anon; select json_agg(public.pingpong_fish_cast(${tk}, 13, 0, 0.5, true)->'cast')::text from generate_series(1, 200);`));
    const kinds = new Set(many.map((c) => c.kind));
    must(many.every((c) => (c.kind === 'paddle' ? R.LEGEND_PADDLES.some(([id]) => id === c.item) : R.CATCH[c.item]?.kind === c.kind && (c.kind === 'junk' || (c.cm >= 20 && c.cm <= 100)))) && kinds.has('fish'),
      '던지기 결과가 목록 밖이에요: ' + JSON.stringify(many.filter((c) => !R.CATCH[c.item]).slice(0, 3)));
  }
  // 표는 브라우저가 직접 못 읽어야 한다 (RLS·권한)
  for (const t of ['pingpong_players', 'pingpong_sessions', 'pingpong_inventory', 'pingpong_matches', 'pingpong_fish_dex', 'pingpong_fish_log']) {
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
      // (광장 20장: 꾸미기 옷가게는 분수 북쪽 (0, −7), 앞면 z 약 −3.95 — 분수를 돌아서 가도 마지막 도착점은 가게 앞)
      const clip = await b.evaluate(() => { const pz = window.__smash.plaza.pz; window.__smash.plaza.walkTo([0, -9]); const end = pz.route.length ? pz.route[pz.route.length - 1] : pz.myW.to; return end[1]; });
      must(clip > -4.0, '가게 건물 안으로 걸어 들어가요: z=' + clip);
      // 카메라가 건물 바로 앞(클릭 상자 안)에 있어도 바닥을 누르면 바닥, 옆 가게를 누르면 그 가게 (plaza.md 클릭)
      const camPick = await b.evaluate(() => {
        const { world, plaza } = window.__smash, v = plaza.view, cam = world.camera;
        const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
        // 카메라를 옷가게 클릭 상자 안(문 앞 바로 앞)에 두고: 바닥을 누르면 바닥, 오른쪽 명예의 전당을 누르면 랭킹
        cam.position.set(0, 2.2, -3.5); cam.lookAt(0.5, 0, 0); cam.updateMatrixWorld();
        const ground = v.pick(...world.toScreen(0.5, 0, 0));
        cam.lookAt(7.1, 1.5, -3.5); cam.updateMatrixWorld();
        const shop = v.pick(...world.toScreen(7.1, 1.5, -3.5));
        cam.position.copy(p0); cam.quaternion.copy(q0); cam.updateMatrixWorld();
        return [ground && Object.keys(ground)[0], shop?.shop?.id];
      });
      must(camPick[0] === 'ground' && camPick[1] === 'rank', '카메라가 건물 앞에 있을 때 클릭이 이상해요: ' + camPick.join(', '));
      // 정해진 채팅: 목록 번호만, 2초에 한 번
      await b.evaluate(() => { window.__smash.plaza.say('8'); window.__smash.plaza.say('6'); });
      await waitFor(a, (id) => window.__smash.plaza.view.figs.get(id)?.bub.visible, bId, 10000, '상대 머리 위 말풍선');
      must(await b.evaluate(() => document.querySelector('#btn-say').disabled), '말하고 바로 또 말할 수 있어요 (2초에 한 번)');
      // 가게: 랭킹 건물을 클릭 → 걸어가서 랭킹 화면 → 돌아오면 다시 광장
      await a.evaluate(() => { document.querySelector('#lb-free')?.classList.add('hidden'); });
      const pt = await a.evaluate(() => window.__smash.world.toScreen(7.1, 2.2, -3.5)); // 명예의 전당 (광장 20장: 분수 북동쪽)
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
      // 경기장 거품 (plaza.md 16장): 경기 중인 2번 탁구대 둘레 불꽃 고리, 원(7m) 안으로 들어가면 그 경기장으로 바뀌며 관전(듣기만)
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
      // 경기장 거품 안 걸을 수 있는 범위 (src/arenaWalls.js): 교실은 벽이 가깝고, 해변은 벽이 없음(9m)
      const wl = await page.evaluate(async () => { const m = await import('/src/arenas.js'); const c = m.buildArena('classroom').walls, b = m.buildArena('beach').walls; return [c.x1, c.z1, b.x1]; });
      must(wl[0] > 4 && wl[0] < 7 && wl[1] < 9 && wl[2] === 9, '배경 벽 재기가 이상해요: ' + wl.join(', '));
      must(!r.fail, `배경 ${r.fail}이(가) 안 바뀌어요` + (errs.length ? '\n' + [...new Set(errs.splice(0))].slice(0, 4).join('\n') : ''));
      flush();
      return '합친 물건 ' + r.out.join(', ');
    });

    await page.evaluate(() => { window.__smashPause = true; }).catch(() => {}); // 시안 페이지를 여는 동안 앞 탭은 쉬게 (헤드리스는 그래픽 카드 없이 그려서 광장 탭이 다른 탭을 느리게 함)
    for (const [file, ready] of [['outfits.html', '몸 꾸미기 시안'], ['balls.html', '탁구공 시안'], ['tables.html', '탁구대 시안'], ['hats.html', '머리·얼굴 꾸미기 시안'], ['gacha.html', '뽑기 시안'], ['bubble.html', '경기장 거품 효과 시안'], ['campus.html', '광장 새 디자인 시안'], ['campus.html?props=1', '광장 시안 + 무료 소품 모델(glb)'], ['fishing.html', '낚시 손맛 시안'], ['fish-models.html', '물고기·잡동사니 모형 시안'], ['rtc-test.html', '연결 속도 측정']]) {
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
          const expect = { fish: [3, 5, 8, 12, 20, 30], junk: [0], paddle: [0] }[res.kind];
          must(!res.note && expect.includes(res.coins) && (res.kind !== 'fish' || res.rank[0]?.nick === '낚시점검') && (res.kind === 'paddle' || res.dex === 1),
            '로그인 낚시(서버) 결과가 이상해요: ' + JSON.stringify(res).slice(0, 300));
          note = `잡동사니·전설 탁구채·물고기 잡기 · 도감 17칸 · 로그인 낚시(${res.kind} +${res.coins}코인)`;
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
