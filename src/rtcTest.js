// 연결 속도 측정 페이지 (rtc-test.html) — 게임과 무관한 시험용.
// 같은 코드로 들어온 두 기기가 Supabase 채널로 WebRTC 연결 정보(offer/answer/ice)를 주고받고,
// 측정 중에는 Supabase 경유 핑과 WebRTC 직접 핑을 같이 보내 왕복 시간을 비교한다.
// Supabase 설정이 없으면 같은 브라우저 탭끼리 BroadcastChannel로 시험(로컬).
import { ONLINE, IS_TEST, getClient, normalizeCode, makeCode, joinRoom } from './net.js';

const $ = (id) => document.getElementById(id);
const me = Math.random().toString(36).slice(2, 10);
const PING_MS = 150;       // 핑 간격
const TEST_MS = 20000;     // 측정 시간
const RTC_TIMEOUT = 15000; // 이 안에 WebRTC가 안 붙으면 실패로 본다
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

let sig = null, peer = null, pc = null, dc = null, rtcTimer = 0, testing = false;
const addr = { mine: new Set(), theirs: new Set() }; // 바깥(공인) 주소 — 같으면 같은 공유기 뒤 (화면엔 같음/다름만)
const srflxIp = (c) => { const f = (c?.candidate || '').split(' '); return f[7] === 'srflx' ? f[4] : null; };
const sameNet = () => (!addr.mine.size || !addr.theirs.size ? '모름' : [...addr.mine].some((a) => addr.theirs.has(a)) ? '같음 (같은 공유기 뒤)' : '다름 (다른 네트워크)');
let sent = { s: new Map(), r: new Map(), t: new Map() }, got = { s: [], r: [], t: [] };

const log = (t) => { const el = $('log'); el.textContent += `${new Date().toLocaleTimeString()} ${t}\n`; el.scrollTop = 1e9; };
// 중계 서버(TURN) 시험: 주소 끝 #turn=… (Claude가 만들어 준 48시간짜리 출입증, iceServers JSON을 base64url로). 없으면 이 줄은 안 보임
const TURN = (() => {
  try {
    const v = new URLSearchParams(location.hash.slice(1)).get('turn');
    return v ? JSON.parse(atob(v.replace(/-/g, '+').replace(/_/g, '/'))) : null;
  } catch { return null; }
})();
let tpc = null, tdc = null, tTimer = 0;
const set = (id, html, cls = '') => { const el = $(id); el.innerHTML = html; el.className = cls; };

$('code').value = normalizeCode(new URLSearchParams(location.search).get('code') || '') || makeCode();
$('join').onclick = join;
$('start').onclick = () => { send({ t: 'start' }); runTest(); };

// ───────── 신호 채널 (Supabase 또는 로컬 탭) ─────────
function join() {
  const code = normalizeCode($('code').value);
  if (code.length !== 4) return alert('코드 4자리를 넣어 주세요');
  $('join').disabled = true; $('code').disabled = true;
  history.replaceState(null, '', `?code=${code}${location.hash}`); // #turn=… 은 그대로
  let q = Promise.resolve(); // 받은 순서대로 하나씩 처리 (offer 처리 중에 ice가 먼저 끼어들지 않게)
  const onMsg = (m) => { if (m.from !== me && (!m.to || m.to === me)) q = q.then(() => handle(m)).catch((e) => log('오류 ' + e.message)); };
  if (ONLINE) {
    const ch = getClient().channel(`pingpong-rtctest-${IS_TEST ? 'test-' : ''}${code}`, { config: { broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
    ch.subscribe((st) => { if (st === 'SUBSCRIBED') { log('Supabase 채널 연결됨'); send({ t: 'hello' }); } });
    sig = (m) => ch.send({ type: 'broadcast', event: 'm', payload: m });
  } else {
    const bc = new BroadcastChannel(`rtctest-${code}`);
    bc.onmessage = (e) => onMsg(e.data);
    sig = (m) => bc.postMessage(m);
    log('로컬 모드 (Supabase 설정 없음: 같은 브라우저 탭끼리만)');
    send({ t: 'hello' });
  }
  set('peer', '상대를 기다리는 중…');
  gameCodeTest(code);
}

// ───────── 게임 코드로 연결 시험 (net.js joinRoom rtc — 실제 경기와 같은 코드, 위 시험과 따로 채널) ─────────
// 위(이 페이지 방식)는 붙는데 여기는 안 붙으면 → 게임 코드 문제. 둘 다 안 붙으면 → 와이파이·네트워크 문제
function gameCodeTest(code) {
  const link = joinRoom(`rtc${code}`, { id: me, nick: me, at: Date.now() }, {
    onMsg() {}, onMembers() {}, onStatus() {},
    onDirect: (d) => set('g-state', d.of === 0 ? '상대 기다리는 중…' : d.n === d.of ? '⚡ 직접 연결 성공' : '🌐 아직 서버 경유 (연결 시도 중)', d.of && d.n === d.of ? 'good' : 'mid'),
  }, { rtc: true });
  setInterval(() => { $('g-info').textContent = link.rtcInfo?.() || ''; }, 1000);
}
const send = (m) => sig && sig({ ...m, from: me, to: m.to ?? peer ?? undefined });

async function handle(m) {
  if (m.t === 'hello') {
    if (peer && peer !== m.from) { log('상대가 바뀜(새로고침?) → 다시 연결'); closeRtc(); set('rtc', '-'); set('kind', '-'); }
    const isNew = peer !== m.from;
    peer = m.from;
    if (!m.reply) send({ t: 'hello', reply: true, to: peer });
    if (isNew) { set('peer', '연결됨 ✓', 'good'); $('start').disabled = false; log('상대 들어옴'); if (me < peer) { startRtc(true); if (TURN) startTurn(true); } }
    return;
  }
  if (m.from !== peer) return;
  if (m.t === 'offer') { closeRtc(); await startRtc(false); await pc.setRemoteDescription(m.sdp); await pc.setLocalDescription(await pc.createAnswer()); send({ t: 'answer', sdp: pc.localDescription.toJSON() }); }
  else if (m.t === 'answer') await pc?.setRemoteDescription(m.sdp);
  else if (m.t === 'ice') { const ip = srflxIp(m.c); if (ip) addr.theirs.add(ip); try { await pc?.addIceCandidate(m.c); } catch (e) { log('ice 오류 ' + e.message); } }
  else if (m.t === 'tOffer') { if (!TURN) return; closeTurn(); await startTurn(false); await tpc.setRemoteDescription(m.sdp); await tpc.setLocalDescription(await tpc.createAnswer()); send({ t: 'tAnswer', sdp: tpc.localDescription.toJSON() }); }
  else if (m.t === 'tAnswer') await tpc?.setRemoteDescription(m.sdp);
  else if (m.t === 'tIce') { try { await tpc?.addIceCandidate(m.c); } catch (e) { log('중계 ice 오류 ' + e.message); } }
  else if (m.t === 'start') runTest();
  else if (m.t === 'ping') send({ t: 'pong', p: m.p, n: m.n });
  else if (m.t === 'pong') onPong('s', m.n);
}

// ───────── WebRTC ─────────
async function startRtc(offerer) {
  pc = new RTCPeerConnection({ iceServers: ICE });
  set('rtc', '연결 시도 중…', 'mid');
  pc.onicecandidate = (e) => { if (e.candidate) { const ip = srflxIp(e.candidate); if (ip) addr.mine.add(ip); send({ t: 'ice', c: e.candidate.toJSON() }); log('내 후보: ' + (e.candidate.type || '?') + ' ' + (e.candidate.protocol || '')); } };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState; log('WebRTC 상태: ' + s);
    if (s === 'failed') rtcFail();
  };
  pc.ondatachannel = (e) => setupDc(e.channel);
  clearTimeout(rtcTimer);
  rtcTimer = setTimeout(() => { if (!dc || dc.readyState !== 'open') rtcFail(); }, RTC_TIMEOUT);
  if (offerer) {
    setupDc(pc.createDataChannel('p', { ordered: false, maxRetransmits: 0 })); // 게임처럼 '늦을 바엔 버리는' 설정
    await pc.setLocalDescription(await pc.createOffer());
    send({ t: 'offer', sdp: pc.localDescription.toJSON() });
  }
}
function setupDc(ch) {
  dc = ch;
  dc.onopen = () => { clearTimeout(rtcTimer); set('rtc', '직접 연결 성공 ✓', 'good'); log('데이터 통로 열림'); showKind(); };
  dc.onclose = () => log('데이터 통로 닫힘');
  dc.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'ping') dc.send(JSON.stringify({ t: 'pong', n: m.n }));
    else if (m.t === 'pong') onPong('r', m.n);
  };
}
function rtcFail() {
  set('rtc', '연결 실패 ✗', 'bad');
  set('kind', `이 와이파이는 기기끼리 직접 연결을 막는 것 같아요 · 바깥 주소 ${sameNet()}`, 'bad');
  log(`연결 실패 · 바깥 주소 ${sameNet()} · 상태 ${pc?.connectionState}/${pc?.iceConnectionState}`);
}
function closeRtc() { clearTimeout(rtcTimer); try { pc?.close(); } catch { /* 무시 */ } pc = null; dc = null; }

async function showKind() {
  const stats = await pc.getStats();
  let pair = null;
  stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
  if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
  if (!pair) return set('kind', '알 수 없음');
  const l = stats.get(pair.localCandidateId), r = stats.get(pair.remoteCandidateId);
  const types = [l?.candidateType, r?.candidateType];
  log(`선택된 길: 나 ${types[0]} ${l?.protocol} ↔ 상대 ${types[1]} ${r?.protocol}`);
  if (types.includes('relay')) set('kind', '중계 서버 경유 (빠르지 않을 수 있음)', 'mid');
  else if (types.every((t) => t === 'host')) set('kind', '같은 와이파이 안에서 직접 🎉', 'good');
  else set('kind', '인터넷을 거쳐 직접 (공유기 바깥으로 나갔다 옴)', 'mid');
}

// ───────── 중계 서버(TURN) 길: 기기끼리 막힌 와이파이에서도 가까운 중계 서버를 거쳐 이어짐 (relay만 씀) ─────────
async function startTurn(offerer) {
  tpc = new RTCPeerConnection({ iceServers: TURN, iceTransportPolicy: 'relay' });
  set('turn', '연결 시도 중…', 'mid');
  tpc.onicecandidate = (e) => { if (e.candidate) send({ t: 'tIce', c: e.candidate.toJSON() }); };
  tpc.onconnectionstatechange = () => { log('중계 상태: ' + tpc.connectionState); if (tpc.connectionState === 'failed') set('turn', '중계 연결 실패 ✗ (출입증이 만료됐거나 막힘)', 'bad'); };
  tpc.ondatachannel = (e) => setupTdc(e.channel);
  clearTimeout(tTimer);
  tTimer = setTimeout(() => { if (!tdc || tdc.readyState !== 'open') set('turn', '중계 연결 실패 ✗ (15초 안에 안 열림)', 'bad'); }, RTC_TIMEOUT);
  if (offerer) {
    setupTdc(tpc.createDataChannel('t', { ordered: false, maxRetransmits: 0 }));
    await tpc.setLocalDescription(await tpc.createOffer());
    send({ t: 'tOffer', sdp: tpc.localDescription.toJSON() });
  }
}
function setupTdc(ch) {
  tdc = ch;
  tdc.onopen = () => { clearTimeout(tTimer); set('turn', '중계 연결 성공 ✓', 'good'); log('중계 통로 열림'); };
  tdc.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'ping') tdc.send(JSON.stringify({ t: 'pong', n: m.n }));
    else if (m.t === 'pong') onPong('t', m.n);
  };
}
function closeTurn() { clearTimeout(tTimer); try { tpc?.close(); } catch { /* 무시 */ } tpc = null; tdc = null; }
if (TURN) { $('t-row').hidden = false; $('t-line').hidden = false; }

// ───────── 측정 ─────────
function runTest() {
  if (testing) return;
  testing = true; $('start').disabled = true;
  sent = { s: new Map(), r: new Map(), t: new Map() }; got = { s: [], r: [], t: [] };
  for (const p of ['s', 'r', 't']) for (const k of ['med', 'p90', 'max', 'loss']) set(`${p}-${k}`, '…');
  set('verdict', '측정 중…');
  let n = 0; const t0 = performance.now();
  const iv = setInterval(() => {
    const el = performance.now() - t0;
    set('prog', `${Math.min(20, Math.floor(el / 1000))} / 20초`);
    if (el >= TEST_MS) { clearInterval(iv); set('prog', '답 기다리는 중…'); setTimeout(finish, 2000); return; }
    n++;
    sent.s.set(n, performance.now()); send({ t: 'ping', n });
    if (dc?.readyState === 'open') { sent.r.set(n, performance.now()); dc.send(JSON.stringify({ t: 'ping', n })); }
    if (tdc?.readyState === 'open') { sent.t.set(n, performance.now()); tdc.send(JSON.stringify({ t: 'ping', n })); }
    if (n % 7 === 0) show(false);
  }, PING_MS);
}
function onPong(path, n) {
  const t = sent[path].get(n);
  if (t == null) return;
  sent[path].set(n, null); // 같은 답이 두 번 와도 한 번만
  got[path].push(performance.now() - t);
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
function stat(path) {
  const a = got[path], total = sent[path].size;
  if (!total) return null;
  return { med: pct(a, 0.5), p90: pct(a, 0.9), max: Math.max(...a), loss: (1 - a.length / total) * 100 };
}
function show(final) {
  for (const p of ['s', 'r', 't']) {
    const st = stat(p);
    if (!st || !got[p].length) { if (final) for (const k of ['med', 'p90', 'max', 'loss']) set(`${p}-${k}`, '없음', 'bad'); continue; }
    const c = (v) => (v < 40 ? 'good' : v < 120 ? 'mid' : 'bad');
    set(`${p}-med`, Math.round(st.med), c(st.med));
    set(`${p}-p90`, Math.round(st.p90), c(st.p90));
    set(`${p}-max`, Math.round(st.max), c(st.max));
    set(`${p}-loss`, st.loss.toFixed(0) + '%', st.loss < 2 ? 'good' : st.loss < 10 ? 'mid' : 'bad');
  }
}
function finish() {
  testing = false; $('start').disabled = false; set('prog', '끝');
  show(true);
  const s = stat('s'), r = stat('r');
  let v;
  if (!r || !got.r.length) v = ['WebRTC로 연결이 안 됐어요. 이 와이파이에서는 지금 방식을 그대로 쓰는 게 좋아요.', 'bad'];
  else if (!got.s.length) v = ['Supabase 쪽 답이 안 왔어요. 다시 측정해 주세요.', 'mid'];
  else {
    const gain = s.p90 - r.p90;
    if (gain > 50 && r.p90 < s.p90 * 0.6) v = [`WebRTC가 확실히 빨라요 (느릴 때 기준 ${Math.round(gain)}ms 빠름). 게임에 적용해 볼 만해요!`, 'good'];
    else if (gain > 15) v = [`WebRTC가 조금 빨라요 (${Math.round(gain)}ms). 바꿀지는 고민해 볼 만한 정도예요.`, 'mid'];
    else v = ['차이가 거의 없어요. 지금 방식을 그대로 써도 돼요.', 'mid'];
  }
  // 중계(TURN) 길이 있으면 그 결과를 우선 (기기끼리 막힌 교실 와이파이용)
  const t = stat('t');
  if (TURN && s && got.s.length) {
    if (!t || !got.t.length) v = ['서울 중계(TURN)도 연결이 안 됐어요. 출입증 기한(48시간)이 지났는지 확인해 주세요.', 'bad'];
    else {
      const gain = s.p90 - t.p90;
      if (gain > 50 && t.p90 < s.p90 * 0.6) v = [`서울 중계가 확실히 빨라요 (느릴 때 기준 ${Math.round(gain)}ms 빠름). 게임에 적용해 볼 만해요!`, 'good'];
      else if (gain > 15) v = [`서울 중계가 조금 빨라요 (${Math.round(gain)}ms). 바꿀지는 고민해 볼 만한 정도예요.`, 'mid'];
      else v = ['서울 중계도 지금 방식과 차이가 거의 없어요.', 'mid'];
    }
  }
  set('verdict', v[0], v[1]);
  log(`결과 Supabase ${s ? JSON.stringify(round(s)) : '-'} / WebRTC ${r && got.r.length ? JSON.stringify(round(r)) : '-'} / 중계 ${t && got.t.length ? JSON.stringify(round(t)) : '-'}`);
}
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
