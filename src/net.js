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
//   handlers.onDirect({ n, of }): 직접 연결이 열리거나 닫힐 때 (다른 선수 of명 중 n명과 직접 연결, 2대2면 서로 다 연결). 주소창 ?rtc=0 이면 끔 (비교 시험용)
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
  };
}

// ───────── 선수끼리 WebRTC 직접 연결 (경기 채널로 연결 정보를 주고받음) ─────────
const RTC_ON = typeof RTCPeerConnection !== 'undefined' && new URLSearchParams(location.search).get('rtc') !== '0';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
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
    const n = [...listed].filter((id) => peers.get(id)?.dc?.readyState === 'open').length;
    const key = `${n}/${listed.size}`;
    if (key !== lastKey) { lastKey = key; onDirect({ n, of: listed.size }); }
  };
  const signal = (to, m) => sig({ k: '_rtc', to, from: myId, ...m });

  function drop(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    clearTimeout(p.retry);
    try { p.pc.close(); } catch { /* 무시 */ }
    report();
  }
  function peer(id) {
    let p = peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p = { pc, dc: null, q: Promise.resolve() };
    peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) signal(id, { t: 'ice', c: e.candidate.toJSON() }); };
    pc.ondatachannel = (e) => useDc(id, p, e.channel);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && peers.get(id) === p) { drop(id); if (myId < id && !closed) p.retry = setTimeout(() => call(id).catch(() => {}), 3000); }
      report();
    };
    return p;
  }
  function useDc(id, p, dc) {
    p.dc = dc;
    dc.onopen = report;
    dc.onclose = report;
    dc.onmessage = (e) => { if (closed) return; try { deliver(JSON.parse(e.data)); } catch { /* 깨진 소식은 버림 */ } };
  }
  async function call(id) {
    if (closed || peers.has(id)) return;
    const n = (tries.get(id) || 0) + 1;
    if (n > 3) return;
    tries.set(id, n);
    const p = peer(id);
    useDc(id, p, p.pc.createDataChannel('m')); // 순서대로·빠짐없이 (같은 와이파이에선 다시 보내기도 빠름)
    await p.pc.setLocalDescription(await p.pc.createOffer());
    signal(id, { t: 'offer', sdp: p.pc.localDescription.toJSON() });
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
      if (m.t === 'offer' && peers.has(m.from) && peers.get(m.from).pc.remoteDescription) drop(m.from); // 상대가 다시 걸어옴
      const p = m.t === 'offer' ? peer(m.from) : peers.get(m.from);
      if (!p) return;
      p.q = p.q.then(async () => {
        if (m.t === 'offer') {
          await p.pc.setRemoteDescription(m.sdp);
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          signal(m.from, { t: 'answer', sdp: p.pc.localDescription.toJSON() });
        } else if (m.t === 'answer') await p.pc.setRemoteDescription(m.sdp);
        else if (m.t === 'ice') await p.pc.addIceCandidate(m.c);
      }).catch(() => { /* 직접 연결이 안 되면 서버 길만 쓴다 */ });
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
