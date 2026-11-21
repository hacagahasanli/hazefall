/**
 * The portal build: one static folder (dist/portal) with relative paths, solo play against bots, nothing fetched from our
 * own servers and no outbound links. `npm run build:portal`, then zip the folder for CrazyGames. `npm run dev:portal`
 * serves it on port 3203; `npm run phone:portal` builds it and serves the build on port 3204 to the local network.
 */
import { cpSync, readFileSync } from 'fs';
import path from 'path';
import { defineConfig, transformWithEsbuild } from 'vite';

import { bootMapPng } from './portal/bootMap';
import { GAME_TITLE, STUDIO_NAME } from './src/lib/studio';

const out = path.resolve(__dirname, 'dist/portal');

export default defineConfig({
  root: path.resolve(__dirname, 'portal'),
  base: './',
  // Favicons, app icons, the web manifest and the logo (brand/last-commit-standing), copied next to index.html. The game's
  // models and sounds are copied from public/assets below; the site's other public files stay out.
  publicDir: path.resolve(__dirname, 'portal/static'),
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
      // The boot screen's progress model (src/lib/bootProgress.ts, unit-tested) inlined into the page as a plain script,
      // window.LcsBootProgress, so the screen runs it from the first paint, before any game code has arrived; and its
      // picture of the battleground, the real map drawn as a small PNG (portal/bootMap.ts), inlined the same way.
      name: 'boot-progress',
      transformIndexHtml: {
        order: 'pre',
        async handler(html) {
          const file = path.resolve(__dirname, 'src/lib/bootProgress.ts');
          const { code } = await transformWithEsbuild(readFileSync(file, 'utf8'), file, { format: 'iife', globalName: 'LcsBootProgress', target: 'es2015', minify: true });
          if (!html.includes('<!--boot-progress-->')) throw new Error('boot-progress: placeholder not found');
          return html.replace('<!--boot-progress-->', `<script>${code.trim()}</script>`).replace('%BOOT_MAP%', bootMapPng());
        },
      },
    },
    {
      // The boot screen's real progress (portal/index.html): the game's entry script is not left as a tag; the boot loader
      // fetches it, counting its bytes against the size given here, then runs it. The boot screen's own two fonts are
      // preloaded so its text is in the game's type from the first frames.
      name: 'boot-loader',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const bundle = ctx.bundle ?? {};
          const entry = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry);
          if (!entry || entry.type !== 'chunk') return html;
          const src = `./${entry.fileName}`;
          const tag = `<script type="module" crossorigin src="${src}"></script>`;
          if (!html.includes(tag)) throw new Error('boot-loader: entry script tag not found');
          const font = (re: RegExp) => Object.keys(bundle).find((f) => re.test(f));
          const bungee = font(/bungee-400-.*\.woff2$/);
          const chakra = font(/chakra-petch-600-.*\.woff2$/);
          const faces = [
            bungee && `@font-face{font-family:BootBungee;src:url(./${bungee}) format('woff2');font-display:swap}`,
            chakra && `@font-face{font-family:BootChakra;src:url(./${chakra}) format('woff2');font-display:swap}`,
          ].filter(Boolean);
          const preload = [bungee, chakra].filter(Boolean).map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="./${f}">`).join('');
          const bytes = Buffer.byteLength(entry.code, 'utf8');
          return html.replace(tag, `<script>window.__lcsEntry=${JSON.stringify({ src, bytes })}</script>${preload}<style>${faces.join('')}</style>`);
        },
      },
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
