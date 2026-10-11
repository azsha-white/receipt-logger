import { defineConfig } from 'vite';

// GitHub Pages serves this repo at https://azsha-white.github.io/receipt-logger/
export default defineConfig({
  base: '/receipt-logger/',
  define: {
    __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
  },
});
