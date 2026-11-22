import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 여러 페이지: 게임(index.html) + 몸 꾸미기 시안(outfits.html) + 탁구공 시안(balls.html) + 탁구대 시안(tables.html) + 머리 꾸미기 시안(hats.html) + 뽑기 시안(gacha.html)
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
      },
      // three.js는 자주 안 바뀌므로 따로 묶어 두면 게임만 고쳐 올렸을 때 브라우저가 three를 다시 안 받는다
      output: {
        manualChunks(id) { if (id.includes('node_modules/three/')) return 'three'; },
      },
    },
  },
});
