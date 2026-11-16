// 실시간 통신: Supabase Realtime Broadcast 채널 (방 코드 = 채널 이름 pingpong-room-XXXX)
// Supabase 설정이 없으면 같은 브라우저의 탭끼리만 통하는 '로컬 테스트' 통신을 쓴다.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const ONLINE = !!(URL && KEY);

let client = null;
function getClient() {
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
export function joinRoom(code, me, handlers) {
  return ONLINE ? joinSupabase(code, me, handlers) : joinLocal(code, me, handlers);
}

function joinSupabase(code, me, h) {
  const ch = getClient().channel(`pingpong-room-${code}`, {
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
      await ch.track(me);
      h.onStatus('ok');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      h.onStatus('error', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  });
  return {
    send(payload) { ch.send({ type: 'broadcast', event: 'm', payload }); },
    leave() { ch.unsubscribe(); getClient().removeChannel(ch); },
  };
}

// 로컬 테스트: BroadcastChannel + 1초마다 '나 여기 있어요' 신호로 접속자 목록을 만든다
function joinLocal(code, me, h) {
  const bc = new BroadcastChannel(`pingpong-room-${code}`);
  const lag = Number(new URLSearchParams(location.search).get('lag') || 0) / 1000; // 지연 흉내 (ms)
  const members = new Map();
  const seen = new Map();
  members.set(me.id, me);
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
      if (!members.has(d.me.id)) { members.set(d.me.id, d.me); emitMembers(); bc.postMessage({ k: '_hb', me }); }
    } else if (d.k === '_bye') {
      members.delete(d.id); seen.delete(d.id); emitMembers();
    } else h.onMsg(d);
  };
  const hb = setInterval(() => {
    bc.postMessage({ k: '_hb', me });
    const now = performance.now();
    for (const [id, t] of seen) if (now - t > 3500) { members.delete(id); seen.delete(id); }
    emitMembers();
  }, 1000);
  setTimeout(() => { bc.postMessage({ k: '_hb', me }); h.onStatus('ok'); emitMembers(); }, 50);
  const bye = () => bc.postMessage({ k: '_bye', id: me.id });
  window.addEventListener('beforeunload', bye);
  return {
    send(payload) {
      if (lag) setTimeout(() => bc.postMessage(payload), lag * 1000);
      else bc.postMessage(payload);
    },
    leave() { bye(); clearInterval(hb); bc.close(); window.removeEventListener('beforeunload', bye); },
  };
}
