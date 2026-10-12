import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

// GitHub Pages serves this repo at https://azsha-white.github.io/receipt-logger/
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildId = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);
const builtAt = new Date().toISOString();

/** Writes dist/version.json, which the live page polls to discover a newer release (src/version.ts). */
function versionFile(): Plugin {
  return {
    name: 'receipt-logger-version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, build: buildId, built_at: builtAt }, null, 2) + '\n',
      });
    },
  };
}

export default defineConfig({
  base: '/receipt-logger/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [versionFile()],
});
