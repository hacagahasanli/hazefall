/**
 * The web build: the portal build's game for our own subdomain (dist/web, served by Vercel, see vercel.json). The same page,
 * boot screen, aliases, neutral copy and relative paths as vite.portal.config.ts, with three differences: the page loads
 * web/main.tsx (the Support us pill, the "Online is coming" button and the studio's stats), it loads no CrazyGames SDK, and
 * the share image (og.jpg) and its tags come along. `npm run build:web`, then `npm run preview:web` (port 3234).
 */
import { cpSync } from 'fs';
import path from 'path';
import { mergeConfig } from 'vite';

import portal from './vite.portal.config';

import type { Plugin, UserConfig } from 'vite';

const out = path.resolve(__dirname, 'dist/web');
const DESCRIPTION = 'A battle royale in your browser: twenty players drop from a plane, loot guns and armor, and fight inside a shrinking safe zone until one is left.';

const base = portal as UserConfig;
const plugins = (base.plugins as Plugin[]).map((p) =>
  // The game's models and sounds go next to this build's index.html, not the portal's.
  p.name === 'game-assets' ? { ...p, closeBundle: () => cpSync(path.resolve(__dirname, 'public/assets'), path.join(out, 'assets'), { recursive: true }) } : p,
);

const webPage: Plugin = {
  name: 'web-page',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      const sdk = /\s*<!-- CrazyGames SDK v3\.[^>]*-->\s*<script src="https:\/\/sdk\.crazygames\.com\/crazygames-sdk-v3\.js"><\/script>/;
      if (!sdk.test(html) || !html.includes('<script type="module" src="./main.tsx"></script>')) throw new Error('web-page: portal/index.html changed');
      const share = [
        `<meta property="og:title" content="%GAME_TITLE%" />`,
        `<meta property="og:description" content="${DESCRIPTION}" />`,
        `<meta property="og:image" content="https://lastcommit.nalbakigames.com/og.jpg" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
      ].join('\n    ');
      return html
        .replace(sdk, '\n    ' + share)
        .replace('<script type="module" src="./main.tsx"></script>', '<script type="module" src="../web/main.tsx"></script>');
    },
  },
  closeBundle: () => cpSync(path.resolve(__dirname, 'public/og.jpg'), path.join(out, 'og.jpg')),
};

export default mergeConfig(
  { ...base, plugins },
  {
    server: { port: 3232 },
    preview: { port: 3234 },
    build: { outDir: out },
    plugins: [webPage],
  },
);
