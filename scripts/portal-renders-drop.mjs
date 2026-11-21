/** Portal capture tooling (not part of the game). Needs playwright-core@1.65.0 and its Chromium in a scratch folder; run from there with `npm run dev:portal` up (port 3203). Renders go to ./raw; portal-covers.mjs <rawDir> <portal/public/fonts> <docs/portal/covers>. */
// Clean renders (no HUD) for the covers.
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
  await p.waitForTimeout(800);
};
// A: under the parachute and the plane over the map. the parachute, others dropping around.
for (const t of [3500, 5000]) await shot(`A-chute-${t}`, 'zoom=1', async (p) => { await p.waitForTimeout(6000); await p.keyboard.press('Space'); await p.waitForTimeout(t); });
// A2: the plane over the map.
await shot('A-plane', '', async (p) => { await p.waitForTimeout(4000); });
// B: a close fight: three bots around you, guns out.
for (const z of ['0.55', '0.75']) await shot(`B-fight-${z}`, `zoom=${z}`, async (p) => {
  await land(p);
  await p.evaluate(() => {
    const s = window.__lcs.state(), me = s.players[0];
    Object.assign(me, { weapon: 'rifle', mag: 25, ammo: 75 });
    [[5, 2], [-4, 4], [2, -6]].forEach(([dx, dy], i) => Object.assign(s.players[i + 1], { stage: 'ground', alt: 0, x: me.x + dx, y: me.y + dy, weapon: ['shotgun', 'smg', 'sniper'][i], mag: 6, ammo: 20 }));
  });
  await p.keyboard.down('Space');
  await p.waitForTimeout(1300);
});
// C: the final circle: the storm wall close by.
await shot('C-storm', 'zoom=0.8', async (p) => {
  await land(p);
  await p.evaluate(() => {
    const s = window.__lcs.state(), me = s.players[0];
    Object.assign(s.zone, { cx: me.x + 6, cy: me.y - 4, r: 11 });
    [[4, 3], [-3, -2]].forEach(([dx, dy], i) => Object.assign(s.players[i + 1], { stage: 'ground', alt: 0, x: me.x + dx, y: me.y + dy, weapon: 'rifle', mag: 25, ammo: 50 }));
  });
  await p.waitForTimeout(1500);
});
await b.close();
