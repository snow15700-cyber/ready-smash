// Vercel 서버 함수 GET /api/turn — Cloudflare 서울 중계 서버(TURN) 출입증 발급 (docs/dev/gameplay.md 'WebRTC 직접 연결')
// 비밀 키는 Vercel 프로젝트 설정(Environment Variables)의 CF_TURN_KEY_ID · CF_TURN_API_TOKEN 에만 둔다 (코드·브라우저에 없음).
// 출입증은 TTL초 뒤 저절로 못 쓰게 된다. 설정이 없으면 503 → 게임은 중계 없이(직접/서버 경유) 그대로.
const TTL = 4 * 3600; // 4시간 (교육 하루 반나절)
// 쓸 주소만 (Cloudflare가 주는 6개 중: UDP 기본 + 방화벽이 UDP를 막을 때 TCP·443)
const KEEP = ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return res.status(503).json({ error: 'not_configured' });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    if (!r.ok) return res.status(502).json({ error: 'cloudflare', status: r.status });
    const d = await r.json();
    const ice = (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]).filter((s) => s && s.username && s.credential);
    for (const s of ice) {
      const urls = [].concat(s.urls).filter((u) => KEEP.includes(u));
      if (urls.length) s.urls = urls; // 모양이 바뀌어 하나도 안 맞으면 받은 그대로
    }
    if (!ice.length) return res.status(502).json({ error: 'empty' });
    return res.status(200).json({ iceServers: ice, ttl: TTL });
  } catch {
    return res.status(502).json({ error: 'fetch' });
  }
}
