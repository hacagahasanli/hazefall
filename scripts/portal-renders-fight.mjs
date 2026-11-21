/** Portal capture tooling (not part of the game). Needs playwright-core@1.65.0 and its Chromium in a scratch folder; run from there with `npm run dev:portal` up (port 3203). Renders go to ./raw; portal-covers.mjs <rawDir> <portal/public/fonts> <docs/portal/covers>. */
import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const shot = async (name, q, fn) => {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:3203/?' + q);
  await p.waitForFunction(() => !!window.__lcs, null, { timeout: 30000 });
  await p.addStyleTag({ content: 'main > *:not(canvas){display:none !important}' });
  await fn(p);
  await p.screenshot({ path: `raw/${name}.png` });
  await p.close();
};
const land = async (p) => {
  for (let i = 0; i < 20 && (await p.evaluate(() => window.__lcs.state().players[0].stage)) === 'drone'; i++) {
    await p.keyboard.press('Space');
    await p.waitForTimeout(500);
  }
  await p.waitForFunction(() => window.__lcs.state().players[0].stage === 'ground', null, { timeout: 30000 });
  await p.waitForTimeout(500);
};
/** Puts you on an open asphalt or dirt spot near (tx, ty) and three armed rivals round you. */
const stage = (spot, rivals, zone) => (p) => p.evaluate(([spot, rivals, zone]) => {
  const L = window.__lcs, s = L.state(), map = L.map, me = s.players[0];
  const open = (x, y) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!'gpa'.includes(map[y + dy]?.[x + dx])) return false; return true; };
  let best = null;
  for (let r = 0; r < 30 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) if (open(spot[0] + dx, spot[1] + dy)) best = [spot[0] + dx, spot[1] + dy];
  const x = best[0] * 2 + 1, y = best[1] * 2 + 1;
  Object.assign(me, { x, y, weapon: 'rifle', mag: 25, ammo: 75, hp: 100 });
  rivals.forEach(([dx, dy, w], i) => Object.assign(s.players[i + 1], { stage: 'ground', alt: 0, x: x + dx, y: y + dy, weapon: w, mag: 6, ammo: 20, alive: true, hp: 100 }));
  if (zone) Object.assign(s.zone, { cx: x + zone[0], cy: y + zone[1], r: zone[2] });
  return best;
}, [spot, rivals, zone]);
const fight = [[4, -1.5, 'shotgun'], [-3.5, -2.5, 'smg'], [1.5, 4, 'rifle']];
for (const [name, spot, zoom, z] of [['B-town', [45, 45], 0.38], ['C-storm', [60, 30], 0.55, [3, -2, 9]]]) {
  await shot(name, `zoom=${zoom}`, async (p) => {
    await land(p);
    console.log(name, await stage(spot, fight, z)(p));
    await p.keyboard.down('Space');
    await p.waitForTimeout(260);
    await p.keyboard.press('KeyP');
    await p.waitForTimeout(400);
  });
}
await b.close();
