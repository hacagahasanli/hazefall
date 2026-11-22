import path from 'path';
import { defineConfig } from 'vite';

/** Serves the looks contact sheet (a dev tool) on port 3207: `npm run looks:sheet`. */
export default defineConfig({
  root: __dirname,
  resolve: { alias: [{ find: /^~\/game\/copy\/studio$/, replacement: path.resolve(__dirname, '../../src/game/copy/neutral.ts') }, { find: '~', replacement: path.resolve(__dirname, '../../src') }] },
  esbuild: { jsx: 'automatic' },
  server: { port: 3207, fs: { allow: [path.resolve(__dirname, '../..')] } },
});
