/**
 * Portal capture tooling (not part of the game): load time of the built portal folder, served by portal-serve.mjs, from
 * navigation to the main menu being usable, and on to the first frame of a round after Play. Three runs per network
 * profile, cache off. Needs playwright-core@1.65.0 and its Chromium in a scratch folder.
 */
import { chromium, devices } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const profiles = {
  'no throttle': null,
  'fast 4G (9 Mbps, 85 ms)': { latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 },
  'slow 4G (1.6 Mbps, 150 ms, 4x CPU)': { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8, cpu: 4 },
};
for (const [name, net] of Object.entries(profiles)) {
  const menu = [];
  const round = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await b.newContext(name.includes('slow') ? devices['Pixel 7 landscape'] : { viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
    if (net?.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    const t0 = Date.now();
    await p.goto('http://localhost:3202/games/hazefall/');
    await p.getByRole('navigation', { name: 'Main menu' }).waitFor({ timeout: 60000 });
    menu.push(Date.now() - t0);
    const t1 = Date.now();
    await p.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: /^Play/ }).click();
    await p.getByText('LEFT', { exact: true }).waitFor({ timeout: 60000 });
    round.push(Date.now() - t1);
    if (errs.length) console.log('  errors:', errs);
    await ctx.close();
  }
  const f = (a) => a.map((t) => (t / 1000).toFixed(2) + ' s').join(', ');
  console.log(`${name}: menu ${f(menu)} | Play to first frame ${f(round)}`);
}
await b.close();
