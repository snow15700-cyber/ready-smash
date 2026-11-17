// 자동 점검: 고친 뒤 test에 올리기 전에 한 번 돌린다 →  npm run check
// (GitHub에 올리면 .github/workflows/check.yml이 같은 점검을 자동으로 돌린다)
//
//  1. 빌드        — vite build가 되는지
//  2. 서버 SQL    — supabase/*.sql을 빈 DB에 01부터 차례로 두 번 실행(여러 번 실행해도 되는지),
//                   anon(브라우저) 권한으로 가입·로그인·상점·뽑기·장착·업적·랭킹을 불러 보고, 표를 직접 못 읽는지
//  3. 목록 맞추기 — items.js ↔ SQL 아이템(등급·뽑기 통·카테고리), achievements.js ↔ SQL 업적, 목록 그림 파일
//  4. 화면        — 브라우저로 게임을 띄워 손님·로그인(로컬 가짜 서버), 혼자 하기, 꾸미기, 랭킹,
//                   1대1 방 만들기→입장→팀 고르기→경기 시작(탭 두 개), 배경 6종, 시안 페이지 2개를 돌려 보고 오류가 없는지
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
function sqlCheck() {
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
  const b = json(`public.pingpong_buy(${tk}, 'paddle_gold', 'coins')`);
  must(['ok', 'owned'].includes(b.status), '직접 구매 실패: ' + JSON.stringify(b).slice(0, 200));
  must(json(`public.pingpong_equip(${tk}, 'paddle', 'paddle_gold')`).status === 'ok', '장착 실패');
  must(json(`public.pingpong_achievements(${tk})`).status === 'ok', '업적 목록 실패');
  json(`public.pingpong_ranking('wins')`);
  json(`public.pingpong_ranking('rally')`);
  // 표는 브라우저가 직접 못 읽어야 한다 (RLS·권한)
  for (const t of ['pingpong_players', 'pingpong_sessions', 'pingpong_inventory', 'pingpong_matches']) {
    let leaked = true;
    try { q(`select count(*) from public.${t};`); } catch { leaked = false; }
    must(!leaked, `브라우저(anon)가 표 ${t}를 직접 읽을 수 있어요`);
  }
  return `${SQL_FILES.length}개 파일 × 2번 실행, 가입·로그인·상점·뽑기·구매·장착·업적·랭킹, 표 잠금 확인`;
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
        if (/^(paddle|body|ball)_/.test(it) && !thumbs.has(it)) probs.push(`${it}: 목록 그림 없음 → npm run thumbs`);
      }
      for (const it of web.items.filter((i) => i.cat === 'bg')) if (!fs.existsSync(path.join(ROOT, 'public', 'arenas', `${it.arena}.jpg`))) probs.push(`${it.id}: public/arenas/${it.arena}.jpg 없음`);
      must(!probs.length, probs.join('\n'));
      return `아이템 ${web.items.length}개, 업적 ${web.achs.length}개 일치 (${from} 기준), 목록 그림 있음`;
    });

    await step('화면: 손님으로 들어가서 혼자 하기', async () => {
      await page.fill('#login-nick', '점검손님');
      await page.click('#btn-guest');
      await waitFor(page, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '로비');
      await page.evaluate(() => document.querySelector('#btn-ai').click());
      await waitFor(page, () => window.__smash.game && window.__smash.match, null, 15000, '혼자 하기 시작');
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
      flush();
      return `옷장 아이템 ${n}칸`;
    });

    await step('화면: 1대1 방 (탭 두 개) 만들기 → 입장 → 팀 고르기 → 경기 시작', async () => {
      const guest = await ctx.newPage();
      watch(guest, '참가자', errs);
      await guest.goto(URL + '/?acct=2');
      await waitFor(guest, () => window.__smash?.world, null, 60000, '참가자 탭 준비');
      await guest.evaluate(() => document.querySelector('#howto')?.classList.add('hidden'));
      await guest.fill('#login-nick', '점검참가');
      await guest.click('#btn-guest');
      await waitFor(guest, () => !document.querySelector('#lobby').classList.contains('hidden'), null, 10000, '참가자 로비');

      await page.evaluate(() => document.querySelector('#btn-create-1v1').click());
      await waitFor(page, () => window.__smash.room && document.querySelector('#room-code').textContent.trim().length === 4, null, 10000, '방 만들기');
      const code = (await page.textContent('#room-code')).trim();
      await guest.evaluate(() => document.querySelector('#btn-join').click());
      await guest.fill('#join-code', code);
      await guest.evaluate(() => document.querySelector('#btn-join-go').click());
      await waitFor(guest, () => window.__smash.room, null, 10000, '방 입장');
      await waitFor(page, () => document.querySelectorAll('#team-0 .slot, #team-1 .slot').length > 0, null, 10000, '자리 칸');
      await page.evaluate(() => document.querySelector('#team-0 .slot.empty').click());
      await page.waitForTimeout(400);
      await waitFor(guest, () => document.querySelector('#team-1 .slot.empty'), null, 10000, '참가자에게 빈자리');
      await guest.evaluate(() => document.querySelector('#team-1 .slot.empty').click());
      await waitFor(page, () => !document.querySelector('#btn-start').disabled, null, 10000, "방장 '경기 시작' 버튼 켜짐");
      await page.click('#btn-start');
      // VS 소개 3초 뒤 경기 시작 → 둘 다 경기 화면
      for (const p of [page, guest]) await waitFor(p, () => window.__smash.game && !window.__smash.intro, null, 30000, '경기 시작');
      await page.waitForTimeout(1500);
      flush();
      await page.click('#exit').catch(() => {});
      await guest.close();
      return `방 코드 ${code}`;
    });

    await step('화면: 배경 6종 짓기·바꾸기', async () => {
      const r = await page.evaluate(async () => {
        const w = window.__smash.world, out = [];
        const orig = w.setArena; let want = 'gym';
        w.setArena = () => orig(want); // 루프가 내 장착으로 되돌리지 않게
        try {
          for (const id of ['commute', 'evening', 'picnic', 'beach', 'snow', 'bakery', 'gym']) {
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
      must(!r.fail, `배경 ${r.fail}이(가) 안 바뀌어요` + (errs.length ? '\n' + [...new Set(errs.splice(0))].slice(0, 4).join('\n') : ''));
      flush();
      return '합친 물건 ' + r.out.join(', ');
    });

    for (const [file, ready] of [['outfits.html', '몸 꾸미기 시안'], ['balls.html', '탁구공 시안']]) {
      await step(`화면: ${ready} 페이지 (${file})`, async () => {
        const p = await ctx.newPage();
        watch(p, file, errs);
        await p.goto(`${URL}/${file}`);
        await p.waitForLoadState('load');
        await p.waitForTimeout(2500);
        await p.close();
        flush();
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
  await browserChecks();
  if (psql) try { psql('postgres', `drop database if exists ${DB};`); } catch { /* 정리 실패는 무시 */ }
  say(`\n${failed ? `❌ ${failed}개 실패` : '✅ 모두 통과'} (${results.filter((r) => r[0] === '✓').length}개 통과, ${results.filter((r) => r[0] === '–').length}개 건너뜀)`);
  process.exit(failed ? 1 : 0);
})();
