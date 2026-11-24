// Hazefall CG video director (docs/collab/ENGINEERING/video-plan-v1.md). Dev server only (window.__lcs).
// usage: node scripts/video/director.mjs <outDir> [W H] [maxSeconds] [recFrom]
// Drives a real round with a scripted pilot under a virtual clock (exactly 1/60 s per frame) and saves numbered PNGs
// from `recFrom` (game seconds after the jump prompt) on. Writes log.json with the frame -> stage/event timeline.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [out = 'frames', W = '1920', H = '1080', MAX = '90', REC = '0'] = process.argv.slice(2);
const w = Number(W), h = Number(H), maxS = Number(MAX), recFrom = Number(REC);
fs.mkdirSync(out, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:3120/';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, headless: process.env.HEADED ? false : true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('lcs:settings', JSON.stringify({ quality: 'high', camera: 'shoulder', showFps: false, aim: 'mouse' }));
  const held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  };
  const tap = (code) => { key(code, true); setTimeout(() => key(code, false), 60); };
  const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let t = 0, opened = false, jumped = false, picked = 0, leanT = 0;
  const T = { x: 139, y: 148 }; // The Pitch centre spot (STADIUM.pitch, tiles x2)
  window.__pilot = () => {
    const L = window.__lcs; if (!L) return { s: 'boot' };
    const st = L.state(); const d = L.director; const me = st.players[d.me];
    if (!st || !me) return { s: 'boot' };
    t += 1 / 60;
    d.god(true); d.lock(true);
    const v = d.viewNow();
    const look = (yaw, pitch, k = 0.08) => d.view(v.yaw + ang(yaw - v.yaw) * k, v.pitch + (pitch - v.pitch) * k);
    const dist = Math.hypot(T.x - me.x, T.y - me.y);
    const yawT = Math.atan2(T.y - me.y, T.x - me.x);
    if (st.phase !== 'drop' && st.phase !== 'play' && st.phase !== 'zone') { /* lobby etc. */ }
    if (me.stage === 'drone') {
      ['KeyW', 'ShiftLeft'].forEach((c) => key(c, false));
      if (!jumped && dist < 46) { tap('Space'); jumped = true; }
      return { s: 'drone', dist: Math.round(dist) };
    }
    if (me.stage === 'falling') {
      look(yawT, opened ? -0.35 : -0.75, 0.06);
      key('KeyW', dist > 4);
      key('ShiftLeft', !opened && me.alt > 50);
      if (!opened && me.alt < 48) { tap('Space'); opened = true; }
      return { s: 'fall', alt: Math.round(me.alt), dist: Math.round(dist) };
    }
    key('ShiftLeft', false);
    // Ground: get a better gun first (nearest active tuned+ gun within 45 m), then fight the nearest bot.
    const guns = ['rifle', 'smg', 'shotgun', 'sniper'];
    window.__skip ??= new Set(); window.__lootT = (window.__lootT ?? 0) + 1 / 60;
    if (picked < 1 && me.weapon === 'pistol' && window.__lootT < 8) {
      const g = st.loot.filter((l) => l.active && !window.__skip.has(l.id) && guns.includes(l.kind) && Math.hypot(l.x - me.x, l.y - me.y) < 45)
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      if (g) {
        const gd = Math.hypot(g.x - me.x, g.y - me.y);
        look(Math.atan2(g.y - me.y, g.x - me.x), -0.12, 0.12);
        key('KeyW', gd > 0.6);
        if (gd < 1.2 && Math.round(t * 60) % 20 === 0) tap('KeyF');
        if (gd < 1.2) { window.__near = (window.__near ?? 0) + 1 / 60; if (window.__near > 2) { window.__skip.add(g.id); window.__near = 0; } }
        return { s: 'loot', kind: g.kind, gd: Math.round(gd * 10) / 10 };
      }
    }
    if (me.weapon !== 'pistol') picked = 1;
    // Staged fight (STAGE=1): once you have a gun (or gave up looking), you stand at the north end of The Pitch and the three
    // nearest bots are put 24 m away at the south end; from there it is a real fight.
    if (window.__STAGE && !window.__staged && (picked || window.__lootT >= 8)) {
      d.place(d.me, 139, 162);
      d.view(-Math.PI / 2, -0.06);
      st.players.map((p, i) => ({ p, i, dd: Math.hypot(p.x - me.x, p.y - me.y) })).filter((o) => o.i !== d.me && o.p.alive && o.p.stage === 'ground')
        .sort((a, b) => a.dd - b.dd).slice(0, 3).forEach((o, k) => d.place(o.i, [133, 139, 145][k], [138, 135, 139][k]));
      window.__staged = true;
      return { s: 'staged' };
    }
    // Staged: pinned to a 3 m strafe line at the south end of The Pitch (keys still pressed, so the body runs and leans).
    if (window.__staged) { window.__pinT = (window.__pinT ?? 0) + 1 / 60; d.place(d.me, 139 + 1.5 * Math.sin(window.__pinT * 1.9), 162); }
    // Fight: the nearest bot you can really see (clear shot); bots are softened once (video only) so knockouts come fast.
    if (me.mag === 0 && me.ammo > 0) tap('KeyR');
    const foes = st.players.map((p, i) => ({ p, i, dd: Math.hypot(p.x - me.x, p.y - me.y) }))
      .filter((o) => o.i !== d.me && o.p.alive && o.p.stage === 'ground' && o.dd < 35).sort((a, b) => a.dd - b.dd);
    const seen = foes.map((o) => ({ ...o, s: d.sight(o.i) })).find((o) => o.s.see);
    leanT += 1 / 60;
    if (seen) {
      look(seen.s.yaw, seen.s.pitch, 0.18);
      const e = Math.abs(ang(seen.s.yaw - v.yaw)) + Math.abs(seen.s.pitch - v.pitch);
      d.fire(e < 0.02);
      // Keep a fighting distance (back off inside 10 m, close in past 28 m) and strafe while shooting, never stand still.
      key('KeyW', !window.__staged && seen.dd > 28);
      key('KeyS', !window.__staged && seen.dd < 10);
      const side = Math.cos((window.__pinT ?? 0) * 1.9) > 0;
      key('KeyA', !side); key('KeyD', side);
      key('KeyE', false);
      return { s: 'fight', dd: Math.round(seen.dd), e: Math.round(e * 1000) / 1000, alive: st.players.filter((p) => p.alive).length };
    }
    d.fire(false); ['KeyE', 'KeyA', 'KeyD', 'KeyS'].forEach((c) => key(c, false));
    if (window.__staged) { look(-Math.PI / 2, -0.06, 0.05); key('KeyW', false); const sd = Math.cos((window.__pinT ?? 0) * 1.9) > 0; key('KeyA', !sd); key('KeyD', sd); return { s: 'hold', alive: st.players.filter((p) => p.alive).length }; }
    const f = foes[0] ?? st.players.map((p, i) => ({ p, i, dd: Math.hypot(p.x - me.x, p.y - me.y) })).filter((o) => o.i !== d.me && o.p.alive).sort((a, b) => a.dd - b.dd)[0];
    if (!f) { key('KeyW', false); return { s: 'idle' }; }
    look(Math.atan2(f.p.y - me.y, f.p.x - me.x), -0.1, 0.08);
    key('KeyW', true);
    return { s: 'hunt', dd: Math.round(f.dd), alive: st.players.filter((p) => p.alive).length };
  };
});
const page = await ctx.newPage();
if (process.env.STAGE) await ctx.addInitScript(() => { window.__STAGE = true; });
if (process.env.HIDEHUD) await ctx.addInitScript(() => { const st = document.createElement('style'); st.textContent = '[data-hud]:not([data-hud="feed"]){display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st)); });
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await page.goto(URL);
await page.getByRole('link', { name: /drop in/i }).first().click().catch(() => page.goto(URL + 'play'));
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /solo with bots/i }).click();
// Real time through the lobby until the plane: wait for the round's drop phase.
await page.waitForFunction(() => window.__lcs?.state?.()?.phase === 'drop', null, { timeout: 60000 });
await page.clock.install();
const log = [];
let n = 0;
for (let f = 0; f < maxS * 60; f++) {
  const r = await page.evaluate(() => window.__pilot());
  await page.clock.runFor(1000 / 60);
  const ts = f / 60;
  if (ts >= recFrom && (!process.env.SAMPLE || f % Number(process.env.SAMPLE) === 0)) {
    await page.screenshot({ path: path.join(out, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 });
    log.push({ n, ts: Math.round(ts * 100) / 100, ...r });
    n++;
  } else if (f % 60 === 0) log.push({ ts, ...r });
  if (f % 300 === 0) console.log(ts.toFixed(1), JSON.stringify(r));
}
fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log));
await browser.close();
console.log('frames', n);
