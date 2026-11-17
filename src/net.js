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
// watch: 관전 — 듣기만 한다. 출석부(presence)에 이름을 올리지 않아서 선수들에게는 아무것도 안 보이고 안 늘어난다
export function joinRoom(code, me, handlers, { watch = false } = {}) {
  return join(`${ROOM_PREFIX}${code}`, me, handlers, watch);
}

// 관전석 채널 (방마다): 관전자만 출석부에 이름·꾸밈을 올리고(me), 선수들은 듣기만(me = null).
// 나중에 응원도 여기로만 오간다 → 게임 채널은 그대로
export function joinFan(code, me, handlers) {
  return join(`${ROOM_PREFIX}${code}-fan`, me, handlers, !me);
}

// 로비 방 목록 채널: 방장만 자기 방 정보를 출석부에 올린다(me = 방 정보). 목록을 보는 사람은 watch로 듣기만
const LOBBY_NAME = IS_TEST ? 'pingpong-test-lobby' : 'pingpong-lobby';
export function joinLobby(me, handlers) {
  return join(LOBBY_NAME, me, handlers, !me);
}

function join(name, me, handlers, watch) {
  return ONLINE ? joinSupabase(name, me, handlers, watch) : joinLocal(name, me, handlers, watch);
}

// Supabase는 같은 이름의 채널을 한 PC에서 하나만 연다(두 번째로 열면 이미 열린 것을 돌려주고,
// 거기에 듣기를 더 붙이면 오류가 난다). 그래서 이름마다 연결 하나를 같이 쓴다:
// 예) 로비에서 방 목록을 듣던 중에 방을 만들면, 같은 로비 채널로 내 방 정보를 올린다.
// 다 나가면 닫고, 닫히는 중에 다시 들어오면 완전히 닫힌 뒤에 새로 연다.
const shared = new Map(); // 채널 이름 → { ch, subs, ready, tracked, closing }
const ERR_TEXT = '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
const memberList = (ch) => Object.values(ch.presenceState()).map((arr) => arr[0]).filter(Boolean);

function openShared(name, after) {
  const e = { name, ch: null, subs: new Set(), ready: false, tracked: null, closing: null };
  const start = () => {
    if (e.closing || !e.subs.size) return;
    const client = getClient();
    // 닫힌 줄 알았던 예전 채널이 아직 남아 있으면 치운다 (같은 이름이면 그걸 돌려받게 되므로)
    const old = client.getChannels().find((c) => c.topic === `realtime:${name}`);
    if (old) { try { old.teardown(); client.realtime._remove?.(old); } catch { /* 이미 정리됨 */ } }
    const ch = client.channel(name, { config: { broadcast: { self: false, ack: false }, presence: { key: '' } } });
    e.ch = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => { for (const s of e.subs) s.h.onMsg?.(payload); });
    ch.on('presence', { event: 'sync' }, () => { const list = memberList(ch); for (const s of e.subs) s.h.onMembers?.(list); });
    ch.subscribe(async (status) => {
      if (e.ch !== ch || e.closing) return;
      if (status === 'SUBSCRIBED') {
        e.ready = true;
        if (e.tracked) await ch.track(e.tracked);
        for (const s of e.subs) s.h.onStatus?.('ok');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        for (const s of e.subs) s.h.onStatus?.('error', ERR_TEXT);
      }
    });
  };
  if (after) after.finally(start); else start();
  return e;
}

function joinSupabase(name, me, h, watch) {
  let e = shared.get(name);
  if (!e || e.closing) {
    e = openShared(name, e?.closing);
    shared.set(name, e);
  }
  const sub = { h, me: watch ? null : me };
  e.subs.add(sub);
  const track = (m) => { e.tracked = m; if (e.ready && e.ch) e.ch.track(m); };
  if (sub.me) track(sub.me);
  // 이미 열려 있던 연결에 합류: 바로 '연결됨'과 지금 출석부를 알려 준다
  if (e.ready) setTimeout(() => { if (e.subs.has(sub)) { h.onStatus?.('ok'); h.onMembers?.(memberList(e.ch)); } }, 0);
  return {
    send(payload) { if (e.ch) e.ch.send({ type: 'broadcast', event: 'm', payload }); },
    // 출석부에 올린 내 정보 바꾸기 (로비 방 목록의 점수·인원 등)
    update(next) { if (!watch) { sub.me = next; track(next); } },
    leave() {
      if (!e.subs.delete(sub)) return;
      if (sub.me && e.tracked) {
        e.tracked = [...e.subs].find((s) => s.me)?.me || null;
        if (e.ready && e.ch) { if (e.tracked) e.ch.track(e.tracked); else e.ch.untrack(); }
      }
      if (e.subs.size) return;
      const ch = e.ch;
      e.closing = ch ? getClient().removeChannel(ch).catch(() => {}) : Promise.resolve();
      e.closing.finally(() => { if (shared.get(name) === e) shared.delete(name); });
    },
  };
}

// 로컬 테스트에서 이만큼(ms) 신호가 없으면 나간 것으로 (탭을 닫으면 '_bye'로 바로 안다. 탭이 많아 버벅여도 끊기지 않게 넉넉히)
const LOCAL_TIMEOUT = 10000;

// 로컬 테스트: BroadcastChannel + 1초마다 '나 여기 있어요' 신호로 접속자 목록을 만든다
function joinLocal(name, me, h, watch) {
  const bc = new BroadcastChannel(name);
  const lag = Number(new URLSearchParams(location.search).get('lag') || 0) / 1000; // 지연 흉내 (ms)
  const members = new Map();
  const seen = new Map();
  let closed = false;
  const post = (d) => { if (!closed) bc.postMessage(d); };
  if (!watch) members.set(me.id, me);
  let lastKey = '';
  const emitMembers = () => {
    const list = [...members.values()];
    const key = JSON.stringify(list.map((m) => [m.id, m]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    if (key !== lastKey) { lastKey = key; h.onMembers?.(list); }
  };
  bc.onmessage = (e) => {
    const d = e.data;
    if (d.k === '_hb') {
      seen.set(d.me.id, performance.now());
      const isNew = !members.has(d.me.id);
      members.set(d.me.id, d.me);
      emitMembers();
      if (isNew && !watch) post({ k: '_hb', me });
    } else if (d.k === '_bye') {
      members.delete(d.id); seen.delete(d.id); emitMembers();
    } else h.onMsg?.(d);
  };
  const hb = setInterval(() => {
    if (!watch) post({ k: '_hb', me });
    const now = performance.now();
    for (const [id, t] of seen) if (now - t > LOCAL_TIMEOUT) { members.delete(id); seen.delete(id); }
    emitMembers();
  }, 1000);
  // Supabase처럼 처음에는 '나를 뺀' 목록이 먼저 온다 (실제 서버와 같은 순서로 테스트하려고)
  setTimeout(() => { if (!closed) h.onMembers?.([...members.values()].filter((m) => m.id !== me?.id)); }, 0);
  setTimeout(() => { if (closed) return; if (!watch) post({ k: '_hb', me }); h.onStatus?.('ok'); emitMembers(); }, 50);
  const bye = () => { if (!watch) post({ k: '_bye', id: me.id }); };
  window.addEventListener('beforeunload', bye);
  return {
    send(payload) {
      if (lag) setTimeout(() => post(payload), lag * 1000);
      else post(payload);
    },
    update(next) { me = next; if (!watch) { members.set(me.id, me); post({ k: '_hb', me }); } },
    leave() { bye(); closed = true; clearInterval(hb); bc.close(); window.removeEventListener('beforeunload', bye); },
  };
}
