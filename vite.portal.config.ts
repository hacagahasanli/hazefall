/**
 * The portal build: one static folder (dist/portal) with relative paths, solo play against bots, nothing fetched from our
 * own servers and no outbound links. `npm run build:portal`, then zip the folder for CrazyGames. `npm run dev:portal`
 * serves it on port 3203; `npm run phone:portal` builds it and serves the build on port 3204 to the local network.
 */
import { cpSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

import { GAME_TITLE, STUDIO_NAME } from './src/lib/studio';

const out = path.resolve(__dirname, 'dist/portal');

export default defineConfig({
  root: path.resolve(__dirname, 'portal'),
  base: './',
  // Only the game's own files (models, sounds) are copied, below; the site's other public files stay out.
  publicDir: false,
  resolve: {
    alias: [
      // Neutral words only: the studio's copy module is replaced by the neutral one, so its jokes never reach the bundle.
      { find: /^(\.\.?\/)+(game\/)?copy\/studio$/, replacement: path.resolve(__dirname, 'src/game/copy/neutral.ts') },
      { find: /^~\/game\/copy\/studio$/, replacement: path.resolve(__dirname, 'src/game/copy/neutral.ts') },
      { find: '~', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  esbuild: { jsx: 'automatic' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    // Models and sounds load from ./assets/, next to index.html.
    __LCS_ASSET_BASE__: JSON.stringify('./assets/'),
  },
  server: { port: 3203, fs: { allow: [__dirname] } },
  // `npm run phone:portal` serves the built folder here (with --host, to a phone on the same Wi-Fi).
  preview: { port: 3204 },
  plugins: [
    {
      // 'use client' marks components for Next.js; it means nothing here.
      name: 'strip-use-client',
      enforce: 'pre',
      transform: (code, id) => (id.includes('/src/') && /^'use client';/.test(code) ? { code: code.replace(/^'use client';/, ''), map: null } : null),
    },
    {
      name: 'game-title',
      transformIndexHtml: (html) => html.replaceAll('%GAME_TITLE%', GAME_TITLE).replaceAll('%STUDIO_NAME%', STUDIO_NAME),
    },
    {
      // The dev server serves public/assets at ./assets/; the build copies it next to index.html.
      name: 'game-assets',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/assets/models/') || req.url?.startsWith('/assets/sounds/')) req.url = `/@fs${path.resolve(__dirname, 'public')}${req.url.split('?')[0]}`;
          next();
        });
      },
      closeBundle() {
        cpSync(path.resolve(__dirname, 'public/assets'), path.join(out, 'assets'), { recursive: true });
      },
    },
  ],
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { onwarn: (w, warn) => (w.code === 'MODULE_LEVEL_DIRECTIVE' ? undefined : warn(w)) },
  },
});
