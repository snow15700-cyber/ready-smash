// 실시간 통신: Supabase Realtime Broadcast 채널 (방 코드 = 채널 이름 pingpong-room-XXXX)
// Supabase 설정이 없으면 같은 브라우저의 탭끼리만 통하는 '로컬 테스트' 통신을 쓴다.
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
export function joinRoom(code, me, handlers, { listen = false } = {}) {
  return ONLINE ? joinSupabase(code, me, handlers, listen) : joinLocal(code, me, handlers, listen);
}

function joinSupabase(code, me, h, listen) {
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
      if (!listen) await ch.track(me);
      h.onStatus('ok');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      h.onStatus('error', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  });
  return {
    send(payload) { if (!listen) ch.send({ type: 'broadcast', event: 'm', payload }); },
    leave() { ch.unsubscribe(); getClient().removeChannel(ch); },
  };
}

// 로컬 테스트: BroadcastChannel + 1초마다 '나 여기 있어요' 신호로 접속자 목록을 만든다
function joinLocal(code, me, h, listen) {
  const bc = new BroadcastChannel(`${ROOM_PREFIX}${code}`);
  const lag = Number(new URLSearchParams(location.search).get('lag') || 0) / 1000; // 지연 흉내 (ms)
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
    for (const [id, t] of seen) if (now - t > 3500) { members.delete(id); seen.delete(id); }
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

function lobbySupabase(chName, onList, onMsg = null) {
  const key = Math.random().toString(36).slice(2, 10);
  const ch = getClient().channel(chName, { config: { broadcast: { self: false }, presence: { key } } });
  let ready = false, want = null, closed = false;
  ch.on('presence', { event: 'sync' }, () => {
    onList(Object.values(ch.presenceState()).map((arr) => arr[0]).filter(Boolean));
  });
  if (onMsg) ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED' || closed) return;
    ready = true;
    if (want) ch.track(want);
  });
  return {
    track(info) { want = info; if (ready) ch.track(info); },
    untrack() { if (!want) return; want = null; if (ready) ch.untrack(); },
    send(payload) { if (ready) ch.send({ type: 'broadcast', event: 'm', payload }); },
    leave() { closed = true; ch.unsubscribe(); getClient().removeChannel(ch); },
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
    for (const [k, o] of others) if (now - o.t > 3500) { others.delete(k); changed = true; }
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
