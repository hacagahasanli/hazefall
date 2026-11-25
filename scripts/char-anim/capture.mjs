// Usage: node scripts/char-anim/capture.mjs <outDir> [port] [scenario,scenario...]
// Draws contact sheets (side + over-the-shoulder rows) of each scenario with the real rig, and prints measurements.
import { chromium } from 'playwright-core';
import fs from 'fs';

const out = process.argv[2];
const port = process.argv[3] ?? '3208';
const only = process.argv[4]?.split(',');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 700 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__anim);
const names = only ?? (await page.evaluate(() => window.__anim.scenarios()));
const SPEC = {
  idle: { from: 0.2, to: 4, views: ['side', 'back'] },
  walk: { from: 0.3, to: 2.1, views: ['side', 'back'] },
  run: { from: 0.3, to: 2.1, views: ['side', 'back'] },
  back: { from: 0.3, to: 2.1, views: ['side', 'back'] },
  strafe: { from: 0.3, to: 2.1, views: ['side', 'back'] },
  diagonal: { from: 0.3, to: 2.1, views: ['side', 'back'] },
  leanL: { from: 0.3, to: 2.8, views: ['back', 'front'] },
  leanR: { from: 0.3, to: 2.8, views: ['back', 'front'] },
  leanMove: { from: 0.4, to: 2.8, views: ['back', 'front'] },
  leanFlip: { from: 0.4, to: 2.8, views: ['back', 'front'] },
  turnStand: { from: 0.3, to: 2.1, views: ['back', 'side'] },
  turnMove: { from: 0.4, to: 2.1, views: ['back', 'side'] },
  crouch: { from: 0.3, to: 2.8, views: ['side', 'back'] },
  jump: { from: 0.3, to: 1.7, views: ['side', 'back'] },
  roll: { from: 0.38, to: 1.02, views: ['side', 'back'], frames: 12 },
  rollReduced: { from: 0.38, to: 1.02, views: ['side', 'back'], frames: 12 },
  landRoll: { from: 0.28, to: 1.2, views: ['side', 'back'], frames: 12 },
  reload: { from: 0.3, to: 2.6, views: ['side', 'back'] },
};
const measures = {};
for (const name of names) {
  const spec = SPEC[name] ?? {};
  const size = await page.evaluate(([n, s]) => window.__anim.sheet(n, { id: 'hotfix', frames: s.frames ?? 8, from: s.from, to: s.to, views: s.views }), [name, spec]);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.locator('#c').screenshot({ path: `${out}/${name}.png` });
  measures[name] = await page.evaluate((n) => window.__anim.measure(n), name);
}
fs.writeFileSync(`${out}/measures.json`, JSON.stringify(measures, null, 1));
console.log(JSON.stringify(measures, null, 1));
await browser.close();
