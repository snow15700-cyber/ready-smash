# 준비하시고, 스매시!

마우스 하나로 즐기는 탁구 (혼자 벽치기 + 1v1 온라인).
기획은 [docs/기획서.md](docs/기획서.md) 참고.

## 기술
- Vite + Three.js (3D), Web Audio API (타구음·바운드음 합성)
- Supabase Realtime Broadcast (방 코드 = 채널 `pingpong-room-XXXX`), 별도 게임 서버 없음
- 배포: GitHub → Vercel

## 환경 변수 (Vercel 프로젝트 설정 / 로컬은 `.env.local`)
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
설정이 없으면 같은 브라우저의 탭끼리만 연결되는 로컬 테스트 모드로 동작합니다.

## 로컬 실행
```bash
npm install
npm run dev
```
