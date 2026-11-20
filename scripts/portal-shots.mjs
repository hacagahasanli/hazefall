/**
 * Portal capture tooling (not part of the game): the main menu, each Settings tab, and a round from drop to ad break, on
 * a desktop and a phone. Needs playwright-core@1.65.0 and its Chromium in a scratch folder; run from there with
 * `npm run dev:portal` up (port 3203): node portal-shots.mjs <docs/portal/screens> [menu].
 */
import { chromium, devices } from 'playwright-core';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

const open = async (ctxOpts) => {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:3203/?testBreaks');
  await p.getByRole('navigation', { name: 'Main menu' }).waitFor();
  await p.waitForTimeout(3500);
  return { ctx, p, errs };
};
const png = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const jpg = (p, name) => p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
const menuItem = (p, name) => p.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: new RegExp(`^${name}`, 'i') });
const forceWin = (p) =>
  p.evaluate(() => {
    const s = window.__lcs.state();
    s.players.forEach((q, i) => i && Object.assign(q, { alive: false, hp: 0, placement: i + 1 }));
    Object.assign(s, { phase: 'over', winner: 0 });
    Object.assign(s.players[0], { placement: 1, kills: 4 });
  });
const land = async (p) => {
  for (let i = 0; i < 20 && (await p.evaluate(() => window.__lcs.state().players[0].stage)) === 'drone'; i++) {
    await p.keyboard.press('Space');
    await p.waitForTimeout(500);
  }
  await p.waitForFunction(() => window.__lcs.state().players[0].stage === 'ground', null, { timeout: 30000 });
  await p.waitForTimeout(1200);
};

const run = async (dev, ctxOpts) => {
  const { ctx, p, errs } = await open(ctxOpts);
  await png(p, `menu-${dev}`);
  // Settings, every tab.
  await menuItem(p, 'Settings').click();
  await p.waitForTimeout(500);
  for (const [tab, file] of [['Controls', 'controls'], ['Camera', 'camera'], ['Graphics', 'graphics'], ['Audio', 'audio'], ['Accessibility', 'accessibility']]) {
    await p.getByRole('tab', { name: tab }).click();
    await p.waitForTimeout(250);
    await png(p, `menu-${dev}-settings-${file}`);
  }
  if (dev === 'desktop') {
    // Rebinding with a conflict: Shoot onto F swaps Pick up onto Space.
    await p.getByRole('tab', { name: 'Controls' }).click();
    await p.getByRole('button', { name: /^Shoot \/ jump/ }).click();
    await p.keyboard.press('KeyF');
    await p.waitForTimeout(250);
    await p.getByRole('button', { name: /^Shoot \/ jump/ }).scrollIntoViewIfNeeded();
    await png(p, 'menu-desktop-settings-rebind-conflict');
    await p.getByRole('button', { name: 'Reset keys to default' }).click();
  }
  await p.getByRole('button', { name: 'Back', exact: true }).click();
  await p.waitForTimeout(300);
  for (const item of ['Fighter', 'How to play', 'Credits']) {
    await menuItem(p, item).click();
    await p.waitForTimeout(item === 'Fighter' ? 1500 : 400);
    await png(p, `menu-${dev}-${item.toLowerCase().replaceAll(' ', '-')}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
  // A round (skipped with a second argument 'menu': menu screens only).
  if (process.argv[3] === 'menu') {
    await ctx.close();
    return;
  }
  await menuItem(p, 'Play').click();
  await p.waitForFunction(() => !!window.__lcs, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  await jpg(p, `${dev}-1-drop`);
  await land(p);
  await jpg(p, `${dev}-2-gameplay`);
  if (ctxOpts.hasTouch) await p.getByRole('button', { name: 'Pause' }).click();
  else await p.keyboard.press('KeyP');
  await p.waitForTimeout(400);
  await jpg(p, `${dev}-3-pause`);
  await p.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Settings' }).click();
  await p.waitForTimeout(400);
  await jpg(p, `${dev}-4-pause-settings`);
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Resume' }).click();
  await p.waitForTimeout(300);
  await forceWin(p);
  await p.getByRole('button', { name: /Play again/ }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(1200);
  await jpg(p, `${dev}-5-round-end`);
  // Leaving the report: with ?testBreaks a midgame ad is due; the SDK's local mode shows its demo ad.
  await p.getByRole('button', { name: /Play again/ }).click();
  await p.waitForTimeout(1500);
  await jpg(p, `${dev}-6-ad-break`);
  await p.waitForFunction(() => window.__lcs && window.__lcs.state().tick < 300 && window.__lcs.state().phase === 'drop', null, { timeout: 60000 }).catch(() => errs.push('next round never started'));
  await p.waitForTimeout(1500);
  await jpg(p, `${dev}-7-next-round`);
  console.log(dev, errs.length ? '\n  ' + errs.join('\n  ') : 'no errors');
  await ctx.close();
};

await run('desktop', { viewport: { width: 1280, height: 720 } });
await run('phone', { ...devices['Pixel 7 landscape'] });
// The menu upright on a phone.
{
  const { ctx, p } = await open({ ...devices['Pixel 7'] });
  await png(p, 'menu-phone-portrait');
  await menuItem(p, 'Settings').click();
  await p.waitForTimeout(500);
  await png(p, 'menu-phone-portrait-settings');
  await ctx.close();
}
await b.close();
