import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 여러 페이지: 게임(index.html) + 몸 꾸미기 시안(outfits.html) + 탁구공 시안(balls.html)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        outfits: fileURLToPath(new URL('./outfits.html', import.meta.url)),
        balls: fileURLToPath(new URL('./balls.html', import.meta.url)),
      },
    },
  },
});
