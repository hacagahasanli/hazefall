/** Portal capture tooling (not part of the game). Needs playwright-core@1.65.0 and its Chromium in a scratch folder; run from there with `npm run dev:portal` up (port 3203). Renders go to ./raw; portal-covers.mjs <rawDir> <portal/public/fonts> <docs/portal/covers>. */
import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
p.on('pageerror', (e) => logs.push('ERR ' + e.message));
p.on('console', (m) => logs.push(m.type() + ' ' + m.text().slice(0, 160)));
p.on('requestfailed', (r) => logs.push('FAIL ' + r.url()));
await p.goto(process.argv[2] ?? 'http://localhost:3203/?testBreaks');
await p.waitForFunction(() => !!window.__lcs, null, { timeout: 30000 }).catch(() => logs.push('no __lcs'));
await p.waitForTimeout(2500);
await p.screenshot({ path: 'smoke1.png' });
await p.keyboard.press('Space');
await p.waitForTimeout(12000);
await p.screenshot({ path: 'smoke2.png' });
console.log(logs.filter((l) => !/HMR|vite/.test(l)).join('\n'));
await b.close();
