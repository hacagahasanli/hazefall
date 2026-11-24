// Mobile quality audit capture: node audit.mjs <base> <outdir> <size:kind> ...   kind = p (phone, touch DPR3) | t (tablet, touch DPR2) | d (desktop DPR1)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
const [,, BASE, OUT, ...specs] = process.argv;
mkdirSync(OUT, { recursive: true });
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UAT = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SDK = (dev) => `window.CrazyGames={SDK:{init:async()=>{},environment:'crazygames',game:{loadingStart(){},loadingStop(){},gameplayStart(){},gameplayStop(){},happytime(){},settings:{muteAudio:false},addSettingsChangeListener(){},removeSettingsChangeListener(){}},ad:{requestAd:(t,cb)=>{cb.adFinished&&cb.adFinished()}},banner:{requestResponsiveBanner(){},clearBanner(){}},user:{systemInfo:{device:{type:'${dev}'}}},data:{getItem:()=>null,setItem(){},removeItem(){}}}};`;
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const LOG = `${OUT}/measure.txt`;
const log = (s) => appendFileSync(LOG, s + '\n');

const rects = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { n: (e.getAttribute('aria-label') || e.dataset.hud || e.textContent || e.tagName).trim().slice(0, 28), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).opacity !== '0' && r.width > 0 }; }).filter((r) => r.vis), sel);
const overlap = (A, B) => { const out = []; for (const a of A) for (const c of B) { const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y); if (ox > 1 && oy > 1 && a !== c) out.push(`${a.n} X ${c.n} (${ox}x${oy})`); } return out; };

for (const spec of specs) {
  const [s, kind] = spec.split(':');
  const [w, h] = s.split('x').map(Number);
  const touch = kind !== 'd';
  const ctx = await b.newContext({ viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: kind === 'p' ? 3 : kind === 't' ? 2 : 1, isMobile: touch, hasTouch: touch, userAgent: kind === 'p' ? UA : kind === 't' ? UAT : undefined });
  await ctx.route('**/crazygames-sdk-v3.js', (r) => r.fulfill({ contentType: 'application/javascript', body: SDK(kind === 'p' ? 'mobile' : kind === 't' ? 'tablet' : 'desktop') }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const shot = (name) => p.screenshot({ path: `${OUT}/${s}-${name}.jpg`, type: 'jpeg', quality: 72, scale: 'css' });
  const tap = (loc) => (touch ? loc.tap({ force: true }) : loc.click({ force: true }));
  try {
    await p.goto(BASE);
    await p.waitForTimeout(1200);
    await shot('00-boot');
    if (touch && h > w) { await p.waitForTimeout(3000); await shot('01-portrait'); log(`${s} portrait card`); await ctx.close(); continue; }
    await p.getByRole('navigation', { name: 'Main menu' }).waitFor({ timeout: 90000 });
    await p.waitForFunction(() => !(window.__lcsBoot && window.__lcsBoot.active()), null, { timeout: 90000 });
    await p.waitForTimeout(2500);
    await shot('01-menu');
    const ui = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui'));
    log(`\n== ${s} (${kind}) --ui=${ui}`);
    let taps = 0;
    for (; taps < 4; taps++) {
      await tap(p.getByRole('navigation', { name: 'Main menu' }).getByRole('button', { name: /^Play/i }));
      if (await p.getByRole('radiogroup', { name: 'Fighter' }).waitFor({ timeout: 25000 }).then(() => true, () => false)) break;
    }
    log(`play taps needed: ${taps + 1}`);
    await p.waitForTimeout(300);
    await shot('02-lobby-0s');
    await p.waitForTimeout(5000);
    await shot('03-lobby-full');
    const head = await rects(p, 'main header button, main header [aria-label^="Level"], main header [aria-live]');
    const sec = await rects(p, 'main section > *');
    log(`lobby header: ${JSON.stringify(head)}`);
    log(`lobby left stack: ${JSON.stringify(sec.map((r) => [r.n, r.y, r.h]))}`);
    const ov = overlap(head, sec);
    log(`LOBBY OVERLAP header vs stack: ${ov.length ? ov.join('; ') : 'none'}`);
    const stackTop = Math.min(...sec.map((r) => r.y)); const headBottom = Math.max(...head.map((r) => r.y + r.h));
    log(`lobby gap headBottom ${headBottom} stackTop ${stackTop} => ${stackTop - headBottom}px; screen coverage of left stack width ${Math.max(...sec.map((r) => r.x + r.w))}/${w}`);
    await tap(p.getByRole('button', { name: /^Ready/ }));
    await p.waitForTimeout(1500);
    await shot('04-lobby-ready');
    await p.getByRole('radiogroup', { name: 'Fighter' }).waitFor({ state: 'detached', timeout: 90000 });
    await p.waitForTimeout(2500);
    await shot('05-plane');
    if (touch) log(`plane buttons: ${JSON.stringify(await rects(p, 'main button[aria-label]'))}`);
    // jump
    for (let i = 0; i < 20 && (await p.evaluate(() => window.__lcs.state().players[0].stage)) === 'drone'; i++) {
      if (touch) await tap(p.getByRole('button', { name: 'Jump', exact: true }).first()); else await p.keyboard.press('Space');
      await p.waitForTimeout(400);
    }
    await p.waitForTimeout(1200);
    await shot('06-freefall');
    await p.waitForFunction(() => window.__lcs.state().players[0].canopy > 0.5 || window.__lcs.state().players[0].stage === 'ground', null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await shot('07-canopy');
    await p.waitForFunction(() => window.__lcs.state().players[0].stage === 'ground', null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await shot('08-ground');
    if (touch) {
      const btns = await rects(p, 'main button[aria-label]');
      log(`ground buttons (css px): ${btns.map((r) => `${r.n}=${r.w}x${r.h}@${r.x},${r.y}`).join(' | ')}`);
      const small = btns.filter((r) => r.w < 44).map((r) => `${r.n} ${r.w}`);
      log(`buttons under 44px: ${small.join(', ') || 'none'}`);
      const hud = await rects(p, '[data-hud]');
      log(`hud: ${hud.map((r) => `${r.n}=${r.w}x${r.h}@${r.x},${r.y}`).join(' | ')}`);
      log(`HUD vs buttons overlap: ${overlap(hud, btns).join('; ') || 'none'}`);
      const bo = overlap(btns, btns).filter((x, i, a) => a.indexOf(x) === i);
      log(`button vs button overlap: ${bo.join('; ') || 'none'}`);
      // give a sniper + second gun + bandage to show the full cluster
      await p.evaluate(() => { const q = window.__lcs.state().players[0]; q.weapon = 'sniper'; q.mag = 5; q.ammo = 10; q.holster = { weapon: 'smg', rarity: 0, mag: 10, ammo: 30 }; q.hp = 50; q.bandages = 2; });
      await p.waitForTimeout(700);
      await shot('09-ground-fullcluster');
      const btns2 = await rects(p, 'main button[aria-label]');
      log(`full cluster: ${btns2.map((r) => `${r.n}=${r.w}x${r.h}@${r.x},${r.y}`).join(' | ')}`);
      const area = btns2.filter((r) => r.n !== 'Pause').reduce((a, r) => a + r.w * r.h * 0.785, 0);
      log(`button area share of screen: ${((area / (w * h)) * 100).toFixed(1)}%`);
    }
    // fight a bit near a bot for hit feedback
    await p.evaluate(() => { const s = window.__lcs.state(); const me = s.players[0]; const o = s.players.find((q, i) => i && q.alive); if (o) { o.x = me.x + 5; o.y = me.y + 1; o.stage = 'ground'; o.z = 0; } });
    if (touch) { const r = await p.getByRole('button', { name: 'Fire', exact: true }).boundingBox(); if (r) { await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); } }
    else { await p.keyboard.down('KeyJ'); }
    await p.waitForTimeout(350);
    await shot('10-firing');
    if (!touch) await p.keyboard.up('KeyJ');
    // pause
    if (touch) await tap(p.getByRole('button', { name: 'Pause' })); else { await p.keyboard.press('Escape'); }
    await p.waitForTimeout(600);
    await shot('11-pause');
    if (!touch) await p.keyboard.press('Escape'); else await tap(p.getByRole('button', { name: /Resume/ }).first()).catch(() => {});
    await p.waitForTimeout(400);
    await p.evaluate(() => { const s = window.__lcs.state(); s.players.forEach((q, i) => i && Object.assign(q, { alive: false, hp: 0, placement: i + 1 })); Object.assign(s, { phase: 'over', winner: 0 }); Object.assign(s.players[0], { placement: 1, kills: 3 }); });
    await p.getByRole('button', { name: /Play again/ }).waitFor({ timeout: 15000 });
    await p.waitForTimeout(1500);
    await shot('12-report');
  } catch (e) { log(`${s} FAILED: ${e.message.split('\n')[0]}`); await shot('zz-fail').catch(() => {}); }
  log(`${s} errors: ${errs.slice(0, 4).join(' || ') || 'none'}`);
  await ctx.close();
}
await b.close();
