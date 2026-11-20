/**
 * Portal capture tooling (not part of the game): the same house doorway in third and first person, to compare how lit
 * the entrance reads. Needs playwright-core@1.65.0 and its Chromium in a scratch folder; `npm run dev:portal` up (3203).
 * node portal-doors.mjs <docs/portal/screens> <label: before|after> [tier]
 */
import { chromium } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [, , OUT, label, tier = 'high'] = process.argv;
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((q) => localStorage.setItem('lcs:settings', JSON.stringify({ quality: q })), tier);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:3203/');
await p.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: /^Play/ }).click();
await p.waitForFunction(() => !!window.__lcs, null, { timeout: 30000 });
for (let i = 0; i < 20 && (await p.evaluate(() => window.__lcs.state().players[0].stage)) === 'drone'; i++) {
  await p.keyboard.press('Space');
  await p.waitForTimeout(500);
}
await p.waitForFunction(() => window.__lcs.state().players[0].stage === 'ground', null, { timeout: 30000 });
await p.waitForTimeout(600);
/** Stand 5 m outside a south-facing door of a house in the old town, facing it; the bots far away. */
const stand = () =>
  p.evaluate(() => {
    const L = window.__lcs, s = L.state(), map = L.map, me = s.players[0];
    let door = null;
    for (const bd of L.buildings) {
      if (bd.barn || door) continue;
      const ty = bd.y0 + bd.h - 1;
      for (let tx = bd.x0 + 1; tx < bd.x0 + bd.w - 2; tx++) if (map[ty][tx] === '.' && map[ty][tx + 1] === '.' && map[ty + 3]?.[tx] !== '#' && bd.x0 > 30 && bd.y0 > 30) { door = [tx + 1, ty + 1]; break; }
    }
    const x = door[0] * 2, y = door[1] * 2 + 5;
    Object.assign(me, { x, y, heading: -Math.PI / 2, hp: 100 });
    s.players.slice(1).forEach((q, i) => Object.assign(q, { x: 6 + i, y: 6, stage: 'ground', fall: 0 }));
    return door;
  });
console.log('door', await stand());
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/doors-${label}-tpp${tier === 'high' ? '' : '-' + tier}.png` });
// First person, same spot, same heading (applySettings resets the view to the heading).
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lcs:settings') || '{}');
  localStorage.setItem('lcs:settings', JSON.stringify({ ...s, camera: 'first' }));
});
await p.keyboard.press('KeyP');
await p.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Settings' }).click();
await p.getByRole('tab', { name: 'Camera' }).click();
await p.getByRole('radio', { name: 'First person' }).click();
await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'Resume' }).click();
await stand();
await p.waitForTimeout(1500);
await p.addStyleTag({ content: 'main > div{opacity:0.0 !important}' });
await p.screenshot({ path: `${OUT}/doors-${label}-fpp${tier === 'high' ? '' : '-' + tier}.png` });
await b.close();
