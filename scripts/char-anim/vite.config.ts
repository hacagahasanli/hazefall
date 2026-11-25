import path from 'path';
import { defineConfig } from 'vite';

/** Serves the character-animation harness (a dev tool) on port 3208: `npm run anim:sheet`. */
export default defineConfig({
  root: __dirname,
  resolve: { alias: [{ find: /^~\/game\/copy\/studio$/, replacement: path.resolve(__dirname, '../../src/game/copy/neutral.ts') }, { find: '~', replacement: path.resolve(__dirname, '../../src') }] },
  esbuild: { jsx: 'automatic' },
  server: { port: 3208, fs: { allow: [path.resolve(__dirname, '../..')] } },
});
