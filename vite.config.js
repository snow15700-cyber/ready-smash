import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 여러 페이지: 게임(index.html) + 아이템 구경(items.html)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        items: fileURLToPath(new URL('./items.html', import.meta.url)),
      },
    },
  },
});
