import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 여러 페이지: 게임(index.html) + 몸 꾸미기 시안(outfits.html) + 탁구공 시안(balls.html) + 탁구대 시안(tables.html) + 머리 꾸미기 시안(hats.html) + 뽑기 시안(gacha.html) + 경기장 거품 효과 시안(bubble.html) + 광장 새 디자인 시안(campus.html) + 낚시 손맛 시안(fishing.html)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        outfits: fileURLToPath(new URL('./outfits.html', import.meta.url)),
        balls: fileURLToPath(new URL('./balls.html', import.meta.url)),
        tables: fileURLToPath(new URL('./tables.html', import.meta.url)),
        hats: fileURLToPath(new URL('./hats.html', import.meta.url)),
        gacha: fileURLToPath(new URL('./gacha.html', import.meta.url)),
        bubble: fileURLToPath(new URL('./bubble.html', import.meta.url)),
        campus: fileURLToPath(new URL('./campus.html', import.meta.url)), // 광장 새 디자인 시안 (경주캠퍼스 느낌, plaza.md 20장)
        fishing: fileURLToPath(new URL('./fishing.html', import.meta.url)), // 낚시 손맛 시안 (fishing.md 6장 1단계)
        fishModels: fileURLToPath(new URL('./fish-models.html', import.meta.url)), // 물고기 모형 스타일 시안 (fishing.md 9장)
        beatFriends: fileURLToPath(new URL('./beat-friends.html', import.meta.url)), // 자리마다 박자 친구들 시안 (fishing.md 13-3)
        props: fileURLToPath(new URL('./props.html', import.meta.url)), // 광장 물건 상호작용 시안 (plaza.md 10장 ①)
        look: fileURLToPath(new URL('./look.html', import.meta.url)), // 물건 4개 새 모습 비교 (plaza.md 8장 🎨)
        cats: fileURLToPath(new URL('./cats.html', import.meta.url)), // 고양이 모형 시안 (docs/dev/cats.md 2단계)
        fps: fileURLToPath(new URL('./fps.html', import.meta.url)), // FPS 손맛 시안 (docs/dev/fps.md 7장 1단계)
        rtcTest: fileURLToPath(new URL('./rtc-test.html', import.meta.url)), // 와이파이 연결 속도 측정 (WebRTC 시험)
      },
      // three.js는 자주 안 바뀌므로 따로 묶어 두면 게임만 고쳐 올렸을 때 브라우저가 three를 다시 안 받는다
      output: {
        manualChunks(id) { if (id.includes('node_modules/three/')) return 'three'; },
      },
    },
  },
});
