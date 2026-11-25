// 실시간 통신: Supabase Realtime Broadcast 채널 (방 코드 = 채널 이름 pingpong-room-XXXX)
// Supabase 설정이 없으면 같은 브라우저의 탭끼리만 통하는 '로컬 테스트' 통신을 쓴다.
// 경기 채널의 선수끼리는 WebRTC 직접 연결도 같이 쓴다 (joinRoom의 rtc 옵션, makeP2P — 빠른 길이 먼저 도착).
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const ONLINE = !!(URL && KEY);

// Vercel 미리보기(테스트 브랜치) 배포에서는 방 채널 이름을 따로 써서 실제 게임 방과 섞이지 않게 한다.
// (Vercel이 Vite 프로젝트에 VITE_VERCEL_ENV = production | preview | development 를 자동으로 넣어 준다)
const VERCEL_ENV = import.meta.env.VITE_VERCEL_ENV;
export const IS_TEST = !!VERCEL_ENV && VERCEL_ENV !== 'production';
const ROOM_PREFIX = IS_TEST ? 'pingpong-test-room-' : 'pingpong-room-';

let client = null;
export function getClient() {
  if (!client) client = createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  return client;
}

// 헷갈리는 글자(0/O, 1/I/L)는 뺀 4자리 코드
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return c;
}
export const normalizeCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

// 방 입장. me = { id, nick, host, at }
// handlers.onMsg(payload), handlers.onMembers([{id,nick,host,at}]), handlers.onStatus('ok'|'error', text)
// listen: 관전 — 듣기만 한다. 명단(presence)에 안 들어가고 말도 안 한다 → 선수 PC는 관중이 있는지조차 모름 (부담 0)
// 돌려주는 link: send · leave · setHandlers(새 handlers: 관전 ↔ 대기실 관전 사이에 채널을 넘겨줄 때) · members(마지막 명단)
//   · ask(payload): 듣기만 하는 관중이 딱 한 번 '지금 팀 알려 줘요'를 보낼 때 · join(me): 관중 → 참가자 (채널을 나가지 않고 명단에 들어감)
// 채널을 나갔다가 같은 이름으로 바로 다시 들어가면 서버 명단에서 빠지는 일이 있어서, 넘겨주기·바꾸기로 다시 들어가지 않는다
//   · direct(): 선수끼리 WebRTC로 바로 이어졌는지 (rtc 옵션을 켰을 때)
// rtc: 선수끼리 WebRTC 직접 연결도 쓴다 (docs/dev/gameplay.md 'WebRTC 직접 연결'). 모든 소식을 서버(채널)와 직접 길로 같이 보내고,
//   받는 쪽은 먼저 온 것만 쓴다 → 직접 연결이 안 붙어도 지금처럼 서버로 된다. 관중(listen)은 서버로만 듣는다.
//   handlers.onDirect({ n, of, relay }): 연결이 열리거나 닫힐 때 (다른 선수 of명 중 n명과 이어짐, 그중 relay명은 서울 중계(TURN) 경유).
//   주소창 ?rtc=0 이면 끔, ?turn=0 이면 중계 없이 (비교 시험용)
export function joinRoom(code, me, handlers, { listen = false, rtc = false } = {}) {
  let h = handlers, last = [], p2p = null;
  const route = {
    onMsg: (m) => {
      if (m.k === '_rtc') { if (p2p && m.to === me.id) p2p.signal(m); return; }
      if (p2p && !p2p.fresh(m)) return; // 다른 길로 이미 받은 소식
      h.onMsg(m);
    },
    onMembers: (list) => { last = list; p2p?.members(list); h.onMembers(list); },
    onStatus: (st, text) => h.onStatus(st, text),
  };
  const base = ONLINE ? joinSupabase(code, me, route, listen) : joinLocal(code, me, route, listen);
  if (rtc && !listen) loadTurn(); // 출입증이 곧 만료되면 새로 (이번 연결에는 지금 있는 것)
  if (rtc && !listen && RTC_ON) p2p = makeP2P(me.id, (m) => base.send(m), (m) => route.onMsg(m), (on) => h.onDirect?.(on));
  return {
    ...base,
    send(payload) {
      if (p2p) { payload = p2p.stamp(payload); p2p.sendDirect(payload); }
      base.send(payload);
    },
    leave() { p2p?.close(); p2p = null; base.leave(); },
    setHandlers(nh) { h = nh; },
    members: () => last,
    direct: () => !!p2p?.open(), // 한 명이라도 직접 연결
    rtcInfo: () => (p2p ? p2p.info() : null), // 직접 연결 진단 (경기 화면 연결 표시를 누르면 보임)
  };
}

// ───────── 선수끼리 WebRTC 직접 연결 (경기 채널로 연결 정보를 주고받음) ─────────
const RTC_ON = typeof RTCPeerConnection !== 'undefined' && new URLSearchParams(location.search).get('rtc') !== '0';
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
// 서울 중계 서버(Cloudflare TURN) 출입증: 기기끼리 막힌 교실 와이파이에서도 가까운 중계로 이어짐 (11/25 측정 162 → 34ms).
// /api/turn(Vercel 서버 함수, api/turn.js)이 몇 시간짜리를 만들어 준다. 페이지를 열 때 미리 받아 둠. 없으면(로컬·설정 전) 직접 연결만.
let turn = null, turnUntil = 0, turnLoading = null;
const TURN_ON = ONLINE && RTC_ON && new URLSearchParams(location.search).get('turn') !== '0';
function loadTurn() {
  if (!TURN_ON || turnLoading || Date.now() < turnUntil - 30 * 60e3) return turnLoading;
  turnLoading = fetch('/api/turn', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (Array.isArray(d?.iceServers) && d.iceServers.length) { turn = d.iceServers; turnUntil = Date.now() + (d.ttl || 3600) * 1000; } })
    .catch(() => {}) // 못 받으면 중계 없이
    .finally(() => { turnLoading = null; });
  return turnLoading;
}
loadTurn();
const iceServers = () => (turn && Date.now() < turnUntil ? [...STUN, ...turn] : STUN);
export const hasTurn = () => !!(turn && Date.now() < turnUntil);
// myId: 내 id. sig(m): 서버 길로 보내기. deliver(m): 직접 길로 받은 소식. onDirect({ n, of })
// 상대마다 연결 하나 (1대1이면 하나, 2대2 네 명이면 각자 셋 → 모두 6개). id가 작은 쪽이 먼저 연결을 건다(offer).
function makeP2P(myId, sig, deliver, onDirect) {
  const peers = new Map(); // 상대 id → { pc, dc, q(받은 순서대로 처리) }
  const tries = new Map(); // 상대 id → 연결 건 횟수 (실패하면 3초 뒤 다시, 3번까지)
  let listed = new Set(); // 지난 명단 (명단에 있다가 빠진 사람만 끊는다 — 명단보다 연결 요청이 먼저 올 수 있어서)
  const seen = new Map(); // 보낸 사람 id → 받은 번호 Set (두 길로 온 같은 소식 걸러내기)
  let seq = 0, closed = false, lastKey = '';
  const nonce = Math.random().toString(36).slice(2, 8); // 새로고침해도 번호가 겹치지 않게
  const anyOpen = () => [...peers.values()].some((p) => p.dc?.readyState === 'open');
  const report = () => {
    if (closed) return;
    const open = [...listed].filter((id) => peers.get(id)?.dc?.readyState === 'open');
    const n = open.length, relay = open.filter((id) => peers.get(id).kind === 'relay').length;
    const key = `${n}/${listed.size}/${relay}`;
    if (key !== lastKey) { lastKey = key; onDirect({ n, of: listed.size, relay }); }
  };
  const signal = (to, m) => sig({ k: '_rtc', to, from: myId, ...m });
  // 진단 (상대 id → 무엇을 주고받았나). 직접 연결이 안 붙을 때 어디서 멈췄는지 보려고 (11/24 사용자 제보: 1대1이 서버 경유로만)
  const diag = new Map();
  const dg = (id) => { if (!diag.has(id)) diag.set(id, { role: myId < id ? '거는 쪽' : '받는 쪽', tries: 0, offer: '', answer: '', sent: {}, got: {}, state: '', err: '' }); return diag.get(id); };
  const typ = (c) => (/ typ (\w+)/.exec(c?.candidate || '') || [])[1] || '?';
  const srflxIp = (c) => { const f = (c?.candidate || '').split(' '); return f[7] === 'srflx' ? f[4] : null; }; // 바깥(공인) 주소 (화면엔 같음/다름만)
  const early = new Map(); // 상대 id → 연결 요청(offer)보다 먼저 온 주소 정보(ice) (서버 소식 순서가 바뀔 때 버리지 않게)
  const WATCH = 9000; // 연결을 걸고 이만큼 안 열리면 다시 건다 (소식이 하나 빠졌을 때)

  function drop(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    clearTimeout(p.retry);
    clearTimeout(p.watch);
    try { p.pc.close(); } catch { /* 무시 */ }
    report();
  }
  function peer(id) {
    let p = peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: iceServers() }); // 직접이 되면 직접, 막히면 서울 중계 (브라우저가 고름)
    p = { pc, dc: null, q: Promise.resolve() };
    peers.set(id, p);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const d = dg(id), k = e.candidate.type || typ(e.candidate);
      d.sent[k] = (d.sent[k] || 0) + 1;
      const ip = srflxIp(e.candidate); if (ip) (d.myIp ||= new Set()).add(ip);
      signal(id, { t: 'ice', c: e.candidate.toJSON() });
    };
    pc.ondatachannel = (e) => useDc(id, p, e.channel);
    const st = () => { dg(id).state = `${pc.connectionState}/${pc.iceConnectionState}`; };
    pc.oniceconnectionstatechange = st;
    pc.onconnectionstatechange = () => {
      st();
      if (pc.connectionState === 'failed' || pc.connectionState === 'connected') console.info('[직접 연결]', id, pc.connectionState, JSON.stringify(dg(id)));
      if (pc.connectionState === 'failed' && peers.get(id) === p) { drop(id); if (myId < id && !closed) p.retry = setTimeout(() => call(id).catch(() => {}), 3000); }
      report();
    };
    return p;
  }
  function useDc(id, p, dc) {
    p.dc = dc;
    dc.onopen = () => { report(); pathKind(p).then(report); };
    dc.onclose = report;
    dc.onmessage = (e) => { if (closed) return; try { deliver(JSON.parse(e.data)); } catch { /* 깨진 소식은 버림 */ } };
  }
  // 열린 연결이 기기끼리 직접인지 서울 중계(relay)인지 (화면 표시·진단용)
  async function pathKind(p) {
    try {
      const st = await p.pc.getStats();
      let pair = null;
      st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = st.get(r.selectedCandidatePairId); });
      if (!pair) st.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      const t = [st.get(pair?.localCandidateId)?.candidateType, st.get(pair?.remoteCandidateId)?.candidateType];
      p.kind = t.includes('relay') ? 'relay' : t[0] ? 'direct' : '';
    } catch { /* 모르면 직접으로 표시 */ }
  }
  async function call(id) {
    if (closed || peers.has(id)) return;
    const n = (tries.get(id) || 0) + 1;
    if (n > 3) return;
    tries.set(id, n);
    const d = dg(id);
    d.tries = n; d.offer = '보냄'; d.answer = ''; d.got = {}; d.sent = {};
    const p = peer(id);
    useDc(id, p, p.pc.createDataChannel('m')); // 순서대로·빠짐없이 (같은 와이파이에선 다시 보내기도 빠름)
    await p.pc.setLocalDescription(await p.pc.createOffer());
    signal(id, { t: 'offer', sdp: p.pc.localDescription.toJSON() });
    // 지켜보기: 소식 하나가 빠져서 멈춰 있으면 처음부터 다시 건다 (3번까지)
    p.watch = setTimeout(() => {
      if (closed || peers.get(id) !== p || p.dc?.readyState === 'open') return;
      dg(id).err = `${WATCH / 1000}초 안에 안 열림 → 다시 걸기`;
      drop(id);
      call(id).catch(() => {});
    }, WATCH);
  }
  return {
    // 명단이 바뀌면: 새 선수에게 연결 걸기(내 id가 작을 때), 나간 선수 연결 끊기
    members(list) {
      if (closed) return;
      const ids = new Set(list.map((m) => m.id).filter((id) => id && id !== myId));
      for (const id of [...peers.keys()]) if (listed.has(id) && !ids.has(id)) drop(id);
      listed = ids;
      report();
      for (const id of ids) if (myId < id) call(id).catch(() => {});
    },
    signal(m) {
      if (closed || !m.from) return;
      const d = dg(m.from);
      if (m.t === 'ice') { const k = typ(m.c); d.got[k] = (d.got[k] || 0) + 1; const ip = srflxIp(m.c); if (ip) (d.theirIp ||= new Set()).add(ip); }
      if (m.t === 'offer' && peers.has(m.from) && peers.get(m.from).pc.remoteDescription) drop(m.from); // 상대가 다시 걸어옴
      if (m.t === 'offer') { d.offer = '받음'; d.answer = ''; d.tries++; }
      if (m.t === 'answer') d.answer = '받음';
      // 연결 요청보다 먼저 온 주소 정보는 모아 뒀다가 요청을 받은 뒤에 쓴다
      if (m.t === 'ice' && !peers.has(m.from)) { const a = early.get(m.from) || []; a.push(m); early.set(m.from, a.slice(-30)); return; }
      const p = m.t === 'offer' ? peer(m.from) : peers.get(m.from);
      if (!p) return;
      const run = async (x) => {
        if (x.t === 'offer') {
          await p.pc.setRemoteDescription(x.sdp);
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          signal(x.from, { t: 'answer', sdp: p.pc.localDescription.toJSON() });
          d.answer = '보냄';
        } else if (x.t === 'answer') await p.pc.setRemoteDescription(x.sdp);
        else if (x.t === 'ice') await p.pc.addIceCandidate(x.c);
      };
      const later = m.t === 'offer' ? early.get(m.from) || [] : [];
      if (m.t === 'offer') early.delete(m.from);
      for (const x of [m, ...later]) p.q = p.q.then(() => run(x)).catch((e) => { d.err = `${x.t}: ${e?.message || e}`.slice(0, 120); }); // 직접 연결이 안 되면 서버 길만 쓴다
    },
    // 진단 글자 (상대마다 한 줄 묶음)
    info() {
      const cnt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || '없음';
      const list = [...listed].map((id) => {
        const d = dg(id), p = peers.get(id);
        const open = p?.dc?.readyState === 'open';
        let why = '';
        if (open) why = p.kind === 'relay' ? '서울 중계로 연결됨' : '직접 연결됨';
        else if (d.role === '거는 쪽' && d.offer === '보냄' && !d.answer) why = '연결 요청을 보냈는데 상대 답이 안 옴 (서버 소식이 안 감/상대가 직접 연결을 못 씀)';
        else if (d.role === '받는 쪽' && !d.offer) why = '상대의 연결 요청이 안 옴';
        else if (!Object.keys(d.got).length) why = '상대 주소 정보(ice)가 하나도 안 옴';
        else if (!Object.keys(d.sent).length) why = '내 주소 정보를 못 만듦 (브라우저 설정·네트워크)';
        else if (/failed|disconnected|checking/.test(d.state)) why = '주소는 주고받았는데 서로 닿지 않음 (와이파이가 기기끼리 막음·다른 네트워크·mDNS 막힘)';
        else why = '연결 중…';
        const net = !d.myIp || !d.theirIp ? '모름' : [...d.myIp].some((a) => d.theirIp.has(a)) ? '같음 (같은 공유기 뒤)' : '다름 (다른 네트워크)';
        return `${d.role} · 시도 ${d.tries}번 · 요청 ${d.offer || '-'} · 답 ${d.answer || '-'}\n보낸 주소: ${cnt(d.sent)} · 받은 주소: ${cnt(d.got)}\n바깥 주소: ${net}\n상태: ${p ? d.state || '시작 전' : '끊김'}${d.err ? ' · ' + d.err : ''}\n→ ${why}`;
      }).join('\n\n');
      return (list || '상대가 경기 채널 명단에 아직 없음') + `\n\n서울 중계 출입증: ${hasTurn() ? '있음' : TURN_ON ? '없음 (Vercel 설정 확인)' : '안 씀'}`;
    },
    stamp: (payload) => ({ ...payload, _f: `${myId}.${nonce}`, _s: ++seq }),
    sendDirect(payload) {
      const txt = JSON.stringify(payload);
      for (const p of peers.values()) if (p.dc?.readyState === 'open') try { p.dc.send(txt); } catch { /* 서버 길로도 가니까 괜찮음 */ }
    },
    // 처음 받는 소식이면 true. 두 길 모두 순서대로 오므로 번호가 조금씩 엇갈릴 뿐이라 최근 것만 기억
    fresh(m) {
      if (!m._f) return true;
      let s = seen.get(m._f);
      if (!s) seen.set(m._f, (s = new Set()));
      if (s.has(m._s)) return false;
      s.add(m._s);
      if (s.size > 400) { const cut = m._s - 300; for (const n of s) if (n < cut) s.delete(n); }
      return true;
    },
    open: anyOpen,
    close() { closed = true; for (const id of [...peers.keys()]) drop(id); },
  };
}

function joinSupabase(code, me, h, listen) {
  let subscribed = false;
  const ch = getClient().channel(`${ROOM_PREFIX}${code}`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: me.id } },
  });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => h.onMsg(payload));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState();
    const list = Object.values(st).map((arr) => arr[0]).filter(Boolean);
    h.onMembers(list);
  });
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      subscribed = true;
      if (!listen) await ch.track(me);
      h.onStatus('ok');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      h.onStatus('error', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  });
  return {
    send(payload) { if (!listen) ch.send({ type: 'broadcast', event: 'm', payload }); },
    ask(payload) { if (subscribed) ch.send({ type: 'broadcast', event: 'm', payload }); },
    join(m) { me = m; listen = false; if (subscribed) ch.track(me); },
    leave() { getClient().removeChannel(ch); }, // removeChannel이 나가기(unsubscribe)까지 한다 (두 번 부르면 나가기 신호가 두 번 감)
  };
}

// 로컬 테스트: BroadcastChannel + 1초마다 '나 여기 있어요' 신호로 접속자 목록을 만든다
function joinLocal(code, me, h, listen) {
  const bc = new BroadcastChannel(`${ROOM_PREFIX}${code}`);
  const lag = Number(new URLSearchParams(location.search).get('lag') || 0) / 1000; // 지연 흉내 (ms). 서버 길만 늦춘다 — 직접 연결(WebRTC)은 안 늦춤 → 예전처럼 시험하려면 ?rtc=0&lag=700
  const members = new Map();
  const seen = new Map();
  let closed = false;
  const post = (d) => { if (!closed && !(listen && (d.k === '_hb' || d.k === '_bye'))) bc.postMessage(d); };
  if (!listen) members.set(me.id, me);
  let lastKey = '';
  const emitMembers = () => {
    const list = [...members.values()];
    const key = list.map((m) => m.id).sort().join(',');
    if (key !== lastKey) { lastKey = key; h.onMembers(list); }
  };
  bc.onmessage = (e) => {
    const d = e.data;
    if (d.k === '_hb') {
      seen.set(d.me.id, performance.now());
      if (!members.has(d.me.id)) { members.set(d.me.id, d.me); emitMembers(); if (!listen) post({ k: '_hb', me }); }
    } else if (d.k === '_bye') {
      members.delete(d.id); seen.delete(d.id); emitMembers();
    } else h.onMsg(d);
  };
  const hb = setInterval(() => {
    post({ k: '_hb', me });
    const now = performance.now();
    for (const [id, t] of seen) if (now - t > 8000) { members.delete(id); seen.delete(id); } // 느린 PC(점검용 탭 여러 개)에서 신호가 늦어도 나간 걸로 안 치게
    emitMembers();
  }, 1000);
  // Supabase처럼 처음에는 '나를 뺀' 목록이 먼저 온다 (실제 서버와 같은 순서로 테스트하려고)
  setTimeout(() => { if (!closed) h.onMembers([...members.values()].filter((m) => m.id !== me.id)); }, 0);
  setTimeout(() => { if (closed) return; post({ k: '_hb', me }); h.onStatus('ok'); emitMembers(); }, 50);
  const bye = () => post({ k: '_bye', id: me.id });
  window.addEventListener('beforeunload', bye);
  return {
    send(payload) {
      if (listen) return;
      if (lag) setTimeout(() => post(payload), lag * 1000);
      else post(payload);
    },
    ask(payload) { post(payload); },
    join(m) { me = m; listen = false; members.set(me.id, me); post({ k: '_hb', me }); emitMembers(); },
    leave() { bye(); closed = true; clearInterval(hb); bc.close(); window.removeEventListener('beforeunload', bye); },
  };
}

// ───────── 로비 방 목록 (presence만 쓰는 채널 하나) ─────────
// 방장 PC가 '내 방' 정보를 올려 두고(track), 로비에 있는 사람은 듣기만 한다.
// 정보는 상태가 바뀔 때만(사람 들어옴·경기 시작/끝·점수) 고치므로 선수 PC에 부담이 거의 없다.
// onList([{code, mode, nick, n, cap, play, score}])
const LOBBY_CH = IS_TEST ? 'pingpong-test-lobby' : 'pingpong-lobby';
export function joinLobby(onList) {
  return ONLINE ? lobbySupabase(LOBBY_CH, onList) : lobbyLocal(LOBBY_CH, onList);
}
// 관중석 채널 (방마다 하나, 선수 채널과 따로): 관중 명단(presence) + 응원 메시지.
// 관중은 track(명단에 들어감), 선수 PC는 듣기만 해서 관중 수·응원을 받는다 (선수 채널에는 아무것도 안 섞임)
// onList([{id, nick, at, team}]), onMsg(payload)
export function joinWatch(code, onList, onMsg) {
  const name = (IS_TEST ? 'pingpong-test-watch-' : 'pingpong-watch-') + code;
  return ONLINE ? lobbySupabase(name, onList, onMsg) : lobbyLocal(name, onList, onMsg);
}

// 광장 로비 채널 (docs/dev/plaza.md 0장): 광장에 있는 사람 명단(presence: 이름·꾸미기, 가끔만 고침) + 메시지(broadcast:
// 걷기 {from,to,t}·탁구대 자리·준비 'st'와 정해진 채팅 'say'). 걷기는 클릭할 때만 보낸다(매 프레임 위치 전송 없음).
// 경기 채널과 따로라 경기 중인 선수는 이 채널에 없다. onList([{id, nick, title, titleX, look, at, mob}]), onMsg(payload)
export const PLAZA_CH = IS_TEST ? 'pingpong-test-plaza' : 'pingpong-plaza';
export function joinPlaza(onList, onMsg) {
  return ONLINE ? lobbySupabase(PLAZA_CH, onList, onMsg) : lobbyLocal(PLAZA_CH, onList, onMsg);
}

// Supabase는 명단 정보(presence track)를 너무 자주 고치면 채널을 끊어 버린다
// (11/24 실제 서버로 잼: 약 12초 안에 6번째 track에서 CLOSED, 12초 간격이면 괜찮음 — 간격과 상관없는 '짧은 시간 안 횟수' 한도).
// 그래서 track은 최소 4초 간격으로 묶어서 마지막 정보만 보낸다. 자주 바뀌는 것(광장 걷기·자리·준비)은 track 대신 broadcast로.
const TRACK_MIN = 4000;
function lobbySupabase(chName, onList, onMsg = null) {
  const key = Math.random().toString(36).slice(2, 10);
  const ch = getClient().channel(chName, { config: { broadcast: { self: false }, presence: { key } } });
  let ready = false, want = null, sent = null, closed = false, healT = 0, trackT = 0, lastT = 0;
  const doTrack = () => {
    trackT = 0;
    if (closed || !ready || !want || want === sent) return;
    sent = want;
    lastT = Date.now();
    ch.track(want);
  };
  const schedule = () => {
    if (trackT || closed || !ready) return;
    trackT = setTimeout(doTrack, Math.max(0, lastT + TRACK_MIN - Date.now()));
  };
  // 스스로 고치기: 올려 둔 내 정보(track)가 서버 명단에 없으면 다시 올린다
  // (관중이 나갔다 바로 다시 들어올 때 서버 명단에서 빠지는 일이 있었음 → 선수 화면에 관중이 안 보임)
  const heal = () => {
    if (healT || closed) return;
    healT = setTimeout(() => {
      healT = 0;
      if (closed || !ready || !want || ch.presenceState()[key]) return;
      sent = null;
      schedule();
      heal();
    }, 5000);
  };
  ch.on('presence', { event: 'sync' }, () => {
    onList(Object.values(ch.presenceState()).map((arr) => arr[0]).filter(Boolean));
    if (want) heal();
  });
  if (onMsg) ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED' || closed) return;
    ready = true;
    sent = null; // 다시 붙었으면(서버가 끊었다 다시 이음) 내 정보를 다시 올린다
    if (want) { schedule(); heal(); }
  });
  return {
    track(info) { want = info; schedule(); },
    untrack() { if (!want) return; want = null; sent = null; clearTimeout(trackT); trackT = 0; if (ready) { lastT = Date.now(); ch.untrack(); } },
    send(payload) { if (ready) ch.send({ type: 'broadcast', event: 'm', payload }); },
    leave() { closed = true; clearTimeout(healT); clearTimeout(trackT); getClient().removeChannel(ch); },
  };
}

// 로컬 테스트: 방장 탭이 1초마다 '내 방' 신호, 새로 온 탭은 'q'로 바로 물어본다
function lobbyLocal(chName, onList, onMsg = null) {
  const bc = new BroadcastChannel(chName);
  const key = Math.random().toString(36).slice(2, 10);
  const others = new Map(); // key → { info, t }
  let mine = null, closed = false;
  const post = (d) => { if (!closed) bc.postMessage(d); };
  const emit = () => { if (!closed) onList([...others.values()].map((o) => o.info).concat(mine ? [mine] : [])); };
  const hb = () => { if (mine) post({ k: 'hb', key, info: mine }); };
  bc.onmessage = (e) => {
    const d = e.data;
    if (d.k === 'hb') { others.set(d.key, { info: d.info, t: performance.now() }); emit(); }
    else if (d.k === 'bye') { if (others.delete(d.key)) emit(); }
    else if (d.k === 'q') hb();
    else if (d.k === 'm' && onMsg) onMsg(d.p);
  };
  const timer = setInterval(() => {
    hb();
    const now = performance.now();
    let changed = false;
    for (const [k, o] of others) if (now - o.t > 8000) { others.delete(k); changed = true; }
    if (changed) emit();
  }, 1000);
  const bye = () => { if (mine) post({ k: 'bye', key }); };
  window.addEventListener('beforeunload', bye);
  post({ k: 'q' });
  setTimeout(emit, 0);
  return {
    track(info) { mine = info; hb(); emit(); },
    untrack() { if (!mine) return; bye(); mine = null; emit(); },
    send(p) { post({ k: 'm', p }); },
    leave() { bye(); mine = null; closed = true; clearInterval(timer); bc.close(); window.removeEventListener('beforeunload', bye); },
  };
}
