/**
 * Layout matrix: walks every screen of the portal build at every size that matters and fails on layout defects.
 *
 *   npm run test:layout                              # whole matrix (about 25 min, one browser context at a time)
 *   npm run test:layout -- --only 568x320,907x510    # a few sizes (add :p phone | :t tablet | :d desktop | :l touch laptop)
 *   npm run test:layout -- --base http://localhost:3203/   # use a dev server that is already running
 *   npm run test:layout -- --baseline docs/collab/ENGINEERING/layout-matrix-baseline/results.json
 *                                                    # compare with a recorded run: only NEW failures set the exit code
 *
 * Needs: playwright-core (devDependency) and its Chromium (`npx playwright-core install chromium`, or an existing
 * Chrome for Testing in the Playwright cache). Real GPU, no SwiftShader: two parallel GPU contexts slowed the game enough to
 * give false failures in the audit, so sizes run one after another. The game's `window.__lcs` test hook only exists in the dev
 * server (NODE_ENV != production), so this runs against `vite --config vite.portal.config.ts`, started here unless --base.
 *
 * Per size it walks: menu, Fighter, Settings (every tab), How to play, Credits, lobby (before and after Ready), plane,
 * free fall, canopy, ground, ground with the full touch cluster (touch only), pause, round report. On a portrait touch
 * screen it checks the rotate card instead. At each screen it asserts, from the DOM (not by eye):
 *   overflow      the document does not scroll
 *   offscreen     no visible control or HUD box leaves the viewport
 *   target        interactive boxes meet the touch floor: 44 px (FIRE / OPEN 72) on the touch UI, 24 px on the mouse UI
 *                 (range sliders are skipped: their DOM box is the 6 px track, not the thumb)
 *   overlap       no two top-level controls or HUD boxes overlap (a box inside another is nesting, not overlap)
 *   clearance     lobby: nothing in the top bar comes within 8 px of the plate, dock or Ready (spec 4.1)
 *   pad-gap       touch cluster: round buttons keep a 6 px gap (spec 4.2)
 *   zones         touch ground: the cluster fits its zone, no HUD box enters the cluster zone or the stick zone (spec 4.2)
 *   in-view       report: Play again and the menu button are fully visible without scrolling
 *   rotate        portrait touch: the rotate card covers the screen
 *   device-rule   the touch UI is on exactly when the device is a phone or tablet (src/lib/device.ts), whatever the pointer
 *   errors        no page error
 * Info lines (not failures): button counts per state, how much of the screen the controls cover.
 *
 * Markup hooks for the layout packages: `data-layout="top|plate|dock|ready|stage"` on a lobby box, `data-hud` on a HUD box
 * and `data-touch-btn` on a touch button are picked up automatically; until the lobby has them, `main header` items count
 * as `top` and `main section > *` as `stack`.
 *
 * Output (default .layout-matrix/): report.txt, results.json, shots/<size>-<state>.jpg for every failing screen with the
 * offending boxes outlined in red. Exit code 1 on any failure (or any NEW failure with --baseline), 2 on a crash.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : fallback;
};
const BASE_ARG = arg('base');
const OUT = resolve(ROOT, arg('out', '.layout-matrix'));
const BASELINE = arg('baseline');
const PORT = Number(arg('port', 3263));

/** p phone (touch, DPR 3, Android UA, CG says mobile) | t tablet (touch, DPR 2, CG says tablet) | d desktop (mouse, DPR 1)
 *  | l touch laptop (a desktop with a touch screen: CG says desktop, so it must get the mouse UI). */
const KINDS = {
  p: { label: 'phone', dpr: 3, touch: true, mobile: true, cg: 'mobile', touchUi: true, ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' },
  t: { label: 'tablet', dpr: 2, touch: true, mobile: true, cg: 'tablet', touchUi: true, ua: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
  d: { label: 'desktop', dpr: 1, touch: false, mobile: false, cg: 'desktop', touchUi: false },
  l: { label: 'touch laptop', dpr: 1, touch: true, mobile: false, cg: 'desktop', touchUi: false },
};
const SIZES = [
  // phones, landscape (CrazyGames lists 800x450 as its mobile size) and one portrait for the rotate card
  '568x320:p', '640x360:p', '667x375:p', '844x390:p', '915x412:p', '932x430:p', '800x450:p', '390x844:p',
  // tablets (1080x607 is CrazyGames' tablet size)
  '1024x768:t', '1080x607:t', '1180x820:t', '768x1024:t',
  // CrazyGames desktop iframe sizes
  '860x484:d', '907x510:d', '1020x540:d', '1216x684:d',
  // desktop
  '1280x720:d', '1366x768:d', '1440x900:d', '1920x1080:d',
  // a Windows touch laptop on CrazyGames
  '1366x768:l',
];
const only = String(arg('only', '')).split(',').filter(Boolean);
const specs = SIZES.filter((s) => !only.length || only.some((o) => s === o || s.startsWith(`${o}:`)));
if (!specs.length) {
  console.error(`no size matches --only ${only.join(',')}`);
  process.exit(2);
}

// ------------------------------------------------------------------------------------------------------ spec constants
const FLOOR_TOUCH = 44;
const FLOOR_FIRE = 72;
const FLOOR_MOUSE = 24;
const CLEARANCE = 8;
const PAD_GAP = 6;
const UI_REF = { cluster: [360, 250], stickTop: 90 };

// ----------------------------------------------------------------------------------------------------- browser + server
const findChrome = () => {
  if (process.env.LCS_CHROME && existsSync(process.env.LCS_CHROME)) return process.env.LCS_CHROME;
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch {
    /* not installed through playwright-core */
  }
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
      const mac = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(mac)) return mac;
    }
  }
  return undefined;
};

let server;
const startServer = async () => {
  server = spawn('npx', ['vite', '--config', 'vite.portal.config.ts', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: false });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return url;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the dev server did not start');
};
const stopServer = () => {
  try {
    server?.kill('SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

const SDK = (dev) =>
  `window.CrazyGames={SDK:{init:async()=>{},environment:'crazygames',game:{loadingStart(){},loadingStop(){},gameplayStart(){},gameplayStop(){},happytime(){},settings:{muteAudio:false},addSettingsChangeListener(){},removeSettingsChangeListener(){}},ad:{requestAd:(t,cb)=>{cb.adFinished&&cb.adFinished()}},banner:{requestResponsiveBanner(){},clearBanner(){}},user:{systemInfo:{device:{type:'${dev}'}}},data:{getItem:()=>null,setItem(){},removeItem(){}}}};`;

// --------------------------------------------------------------------------------------------------- DOM collection (in page)
/** Runs in the page: every visible top-level control / HUD box with its clipped rect, group and ancestry. */
const collectInPage = ({ scopeDialog, lobby, overlayOf }) => {
  const SEL = 'button, a[href], [role=radio], [role=tab], [role=slider], [role=checkbox], [role=switch], input:not([type=hidden]), select, textarea, summary, [data-hud], [data-layout], [data-touch-btn]';
  const INTERACTIVE = 'button, a[href], [role=radio], [role=tab], [role=slider], [role=checkbox], [role=switch], input:not([type=hidden]), select, textarea, summary';
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  let scope = document;
  if (scopeDialog) {
    const dialogs = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getBoundingClientRect().width > 0);
    if (dialogs.length) scope = dialogs[dialogs.length - 1];
  }
  // The round report sits over the match (its HUD is still in the DOM, behind a blurred backdrop): look at the report's own
  // full-screen box, found from one of its buttons.
  if (overlayOf) {
    const btn = [...document.querySelectorAll('button')].find((b) => new RegExp(overlayOf).test(b.textContent.trim()));
    for (let n = btn?.parentElement; n && n !== document.body; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (r.width >= vw - 1 && r.height >= vh - 1 && getComputedStyle(n).position !== 'static') {
        scope = n;
        break;
      }
    }
  }
  // The match is built underneath the lobby once Ready is pressed (PortalGame), so its HUD is in the DOM but covered: the lobby
  // checks look at the lobby's own <main> only.
  if (lobby) scope = document.querySelector('[role=radiogroup][aria-label=Fighter]')?.closest('main') ?? scope;
  const set = new Set(scope.querySelectorAll(SEL));
  const groups = new Map();
  const hasLayoutHooks = !!document.querySelector('[data-layout]');
  if (lobby && !hasLayoutHooks) {
    scope.querySelectorAll('header button, header [aria-label^="Level"], header [aria-live]').forEach((e) => {
      set.add(e);
      groups.set(e, 'top');
    });
    scope.querySelectorAll('section > *').forEach((e) => {
      set.add(e);
      groups.set(e, 'stack');
    });
  }
  const out = [];
  for (const e of set) {
    if (e.closest('[aria-hidden="true"], [inert]')) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let op = 1;
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    if (op < 0.05) continue;
    const interactive = e.matches(INTERACTIVE);
    if (interactive && cs.pointerEvents === 'none') continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    let [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom];
    let scroller = false;
    for (let n = e.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (/(auto|scroll|hidden|clip)/.test(c.overflowX + c.overflowY)) {
        const a = n.getBoundingClientRect();
        x0 = Math.max(x0, a.left);
        y0 = Math.max(y0, a.top);
        x1 = Math.min(x1, a.right);
        y1 = Math.min(y1, a.bottom);
        if (/(auto|scroll)/.test(c.overflowY) && n.scrollHeight > n.clientHeight + 1) scroller = true;
      }
    }
    if (x1 - x0 <= 0.5 || y1 - y0 <= 0.5) continue;
    out.push({
      el: e,
      name: (e.getAttribute('aria-label') || e.getAttribute('data-hud') || e.getAttribute('data-layout') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 32),
      tag: e.tagName.toLowerCase(),
      interactive,
      hud: e.hasAttribute('data-hud'),
      pad: e.matches('button.touch-none, [data-touch-btn]'),
      range: e.matches('input[type=range], [role=slider]'),
      group: e.getAttribute('data-layout') || groups.get(e) || '',
      raw: { x: r.left, y: r.top, w: r.width, h: r.height },
      vis: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      scroller,
    });
  }
  const res = out.map((o, i) => ({
    ...o,
    el: undefined,
    parents: out.reduce((a, p, j) => (j !== i && p.el.contains(o.el) ? [...a, j] : a), []),
  }));
  const se = document.scrollingElement ?? document.documentElement;
  return {
    vw,
    vh,
    docW: se.scrollWidth,
    docH: se.scrollHeight,
    ui: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1,
    touchUi: document.documentElement.classList.contains('lcs-touch'),
    mouseUi: document.documentElement.classList.contains('lcs-mouse'),
    boxes: res,
  };
};

// -------------------------------------------------------------------------------------------------------------- analysis
const R = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
const inter = (a, b) => ({ ox: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
const gapBetween = (a, b) => {
  const { ox, oy } = inter(a, b);
  if (ox > 0 && oy > 0) return -Math.min(ox, oy); // overlapping: negative depth
  return Math.hypot(Math.max(0, -ox), Math.max(0, -oy));
};
const nested = (boxes, i, j) => boxes[i].parents.includes(j) || boxes[j].parents.includes(i);
const fmt = (n) => Math.round(n);

/** Returns { fails: [{check, key, detail, boxes}], info: [..] } for one screen. */
const analyse = (snap, ctx) => {
  const { vw, vh, boxes } = snap;
  const fails = [];
  const info = [];
  const add = (check, key, detail, bs = []) => fails.push({ check, key, detail, boxes: bs });

  if (snap.docW > vw + 1 || snap.docH > vh + 1) add('overflow', 'doc', `document ${snap.docW}x${snap.docH} in a ${vw}x${vh} window`);

  for (const b of boxes) {
    const v = b.vis;
    if (v.x < -1 || v.y < -1 || v.x + v.w > vw + 1 || v.y + v.h > vh + 1) add('offscreen', b.name, `${b.name} at ${fmt(v.x)},${fmt(v.y)} ${fmt(v.w)}x${fmt(v.h)} leaves the ${vw}x${vh} screen`, [R(v)]);
  }

  const touchUi = ctx.kind.touchUi;
  for (const b of boxes) {
    // A range input's box is its 6 px track; the thumb that is actually grabbed is not in the DOM, so sliders are not judged here.
    if (!b.interactive || b.range) continue;
    const floor = touchUi ? (b.name === 'Fire' ? FLOOR_FIRE : FLOOR_TOUCH) : FLOOR_MOUSE;
    const side = Math.min(b.vis.w, b.vis.h);
    if (side < floor - 0.5) {
      const cut = b.vis.w * b.vis.h < b.raw.w * b.raw.h * 0.9;
      add('target', b.name, `${b.name} is ${fmt(b.vis.w)}x${fmt(b.vis.h)}, floor ${floor}${cut ? ` (cut off by a scroll area, its own box is ${fmt(b.raw.w)}x${fmt(b.raw.h)})` : ''}`, [R(b.vis)]);
    }
  }

  const group = (b) => b.group;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (nested(boxes, i, j)) continue;
      const a = boxes[i];
      const c = boxes[j];
      if (!(a.interactive || a.hud || a.group) && !(c.interactive || c.hud || c.group)) continue;
      const { ox, oy } = inter(a.vis, c.vis);
      const topVsRest = (group(a) === 'top') !== (group(c) === 'top') && group(a) && group(c);
      if (ctx.state.startsWith('lobby') && topVsRest) {
        const gap = gapBetween(a.vis, c.vis);
        if (gap < CLEARANCE) {
          const [t, o] = group(a) === 'top' ? [a, c] : [c, a];
          add('clearance', `${t.name}|${o.name}`, `${t.name} to ${o.name}: ${gap < 0 ? `overlap ${fmt(-gap)} px` : `gap ${fmt(gap)} px`}, needs ${CLEARANCE}`, [R(t.vis), R(o.vis)]);
        }
        continue;
      }
      if (ox > 1 && oy > 1) {
        // Round pads overlap only when their circles do; judged by pad-gap.
        if (a.pad && c.pad) continue;
        add('overlap', `${a.name}|${c.name}`, `${a.name} x ${c.name} (${fmt(ox)}x${fmt(oy)})`, [R(a.vis), R(c.vis)]);
      }
    }
  }

  const pads = boxes.filter((b) => b.pad && b.name !== 'Pause');
  if (touchUi && pads.length > 1) {
    for (let i = 0; i < pads.length; i++) {
      for (let j = i + 1; j < pads.length; j++) {
        const [a, c] = [pads[i], pads[j]];
        const d = Math.hypot(a.raw.x + a.raw.w / 2 - (c.raw.x + c.raw.w / 2), a.raw.y + a.raw.h / 2 - (c.raw.y + c.raw.h / 2)) - (a.raw.w + c.raw.w) / 2;
        if (d < PAD_GAP) add('pad-gap', `${a.name}|${c.name}`, `${a.name} and ${c.name}: ${d < 0 ? `overlap ${fmt(-d)}` : `gap ${fmt(d)}`} px, needs ${PAD_GAP}`, [R(a.vis), R(c.vis)]);
      }
    }
  }

  if (touchUi && ctx.zones && pads.length) {
    const ui = snap.ui;
    const left = Math.min(...pads.map((b) => b.raw.x));
    const top = Math.min(...pads.map((b) => b.raw.y));
    const zw = Math.min(UI_REF.cluster[0] * ui, vw * 0.46);
    const zh = Math.min(UI_REF.cluster[1] * ui, vh * 0.64);
    if (vw - left > zw + 1 || vh - top > zh + 1) add('zones', 'cluster', `touch cluster spans ${fmt(vw - left)}x${fmt(vh - top)} from the corner, zone is ${fmt(zw)}x${fmt(zh)}`, [{ x: left, y: top, w: vw - left, h: vh - top }]);
    const clusterZone = { x: vw - zw, y: vh - zh, w: zw, h: zh };
    const stickZone = { x: 0, y: UI_REF.stickTop * ui, w: vw / 2, h: vh - UI_REF.stickTop * ui };
    for (const h of boxes.filter((b) => b.hud)) {
      for (const [zn, z] of [['cluster zone', clusterZone], ['stick zone', stickZone]]) {
        const { ox, oy } = inter(h.vis, z);
        if (ox > 1 && oy > 1) add('zones', `${h.name}|${zn}`, `HUD ${h.name} enters the ${zn} (${fmt(ox)}x${fmt(oy)})`, [R(h.vis)]);
      }
    }
  }

  if (ctx.state === 'report') {
    for (const b of boxes) {
      if (!/^(Play again|Main menu|Back to lobby|Quit to menu|Back to the room)$/.test(b.name)) continue;
      const full = b.vis.w * b.vis.h >= b.raw.w * b.raw.h * 0.98 && b.raw.y + b.raw.h <= vh + 1 && b.raw.y >= -1;
      if (!full) add('in-view', b.name, `${b.name} is not fully in view (${fmt(b.raw.y)}..${fmt(b.raw.y + b.raw.h)} of ${vh})`, [R(b.vis)]);
    }
  }

  if (ctx.deviceRule && snap.touchUi !== ctx.kind.touchUi) add('device-rule', 'touchUi', `${ctx.kind.label} (CrazyGames: ${ctx.kind.cg}) should have touchUi=${ctx.kind.touchUi}, page has lcs-touch=${snap.touchUi} lcs-mouse=${snap.mouseUi}`);

  const btns = boxes.filter((b) => b.pad);
  if (btns.length) info.push(`buttons ${btns.length}: ${btns.map((b) => `${b.name} ${fmt(b.raw.w)}`).join(', ')}`);
  const area = boxes.filter((b) => (b.interactive || b.hud) && !b.parents.length).reduce((s, b) => s + b.vis.w * b.vis.h, 0);
  info.push(`controls+HUD cover about ${((area / (vw * vh)) * 100).toFixed(0)}% of the screen`);
  return { fails, info };
};

// ----------------------------------------------------------------------------------------------------------------- run
const results = []; // { size, kind, state, fails[], info[], shot? }
const notReached = []; // { size, state, why }

const shotName = (size, state) => `${size}-${state}`.replace(/[^\w.-]+/g, '_');

const runSize = async (browser, base, spec) => {
  const [dims, kindKey = 'd'] = spec.split(':');
  const [w, h] = dims.split('x').map(Number);
  const kind = KINDS[kindKey];
  const size = kindKey === 'l' ? `${dims}-touchlaptop` : dims;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    screen: { width: w, height: h },
    deviceScaleFactor: kind.dpr,
    isMobile: kind.mobile,
    hasTouch: kind.touch,
    ...(kind.ua ? { userAgent: kind.ua } : {}),
  });
  await ctx.route('**/crazygames-sdk-v3.js', (r) => r.fulfill({ contentType: 'application/javascript', body: SDK(kind.cg) }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  const tap = (loc) => (kind.touch && kind.mobile ? loc.tap({ force: true }) : loc.click({ force: true }));
  const nav = () => p.getByRole('navigation', { name: 'Main menu' });
  let current = 'boot';

  /** Measure the screen now, check it, and keep an annotated screenshot if it fails. */
  const check = async (state, opts = {}) => {
    current = state;
    const snap = await p.evaluate(collectInPage, { scopeDialog: !!opts.dialog, lobby: state.startsWith('lobby'), overlayOf: opts.overlayOf ?? '' });
    const { fails, info } = analyse(snap, { kind, state, zones: !!opts.zones, deviceRule: state === 'menu' });
    const rec = { size, kind: kindKey, state, fails, info };
    if (fails.length) {
      mkdirSync(join(OUT, 'shots'), { recursive: true });
      const boxes = fails.flatMap((f) => f.boxes);
      await p
        .evaluate((bs) => {
          const d = document.createElement('div');
          d.id = '__lm';
          d.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
          for (const b of bs) {
            const e = document.createElement('div');
            e.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:2px solid #ff2d55;background:rgba(255,45,85,.16)`;
            d.appendChild(e);
          }
          document.body.appendChild(d);
        }, boxes)
        .catch(() => {});
      rec.shot = `shots/${shotName(size, state)}.jpg`;
      await p.screenshot({ path: join(OUT, rec.shot), type: 'jpeg', quality: 72, scale: 'css' }).catch(() => {});
      await p.evaluate(() => document.getElementById('__lm')?.remove()).catch(() => {});
    }
    results.push(rec);
  };
  const skip = (state, why) => notReached.push({ size, state, why });
  const step = async (state, fn) => {
    try {
      await fn();
      return true;
    } catch (e) {
      skip(state, String(e.message).split('\n')[0].slice(0, 120));
      return false;
    }
  };
  const settle = (ms = 800) => p.waitForTimeout(ms);

  try {
    await p.goto(base);
    await settle(1200);

    // Portrait touch screen: the rotate card is the whole screen.
    if (kind.touch && kind.mobile && h > w) {
      await settle(2500);
      const card = await p.evaluate(() => {
        const e = document.getElementById('rotate');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { shown: getComputedStyle(e).display !== 'none', w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, text: e.textContent.trim().slice(0, 60) };
      });
      const fails = [];
      if (!card || !card.shown) fails.push({ check: 'rotate', key: 'card', detail: 'the rotate card is not shown on a portrait touch screen', boxes: [] });
      else if (card.w < card.vw - 1 || card.h < card.vh - 1) fails.push({ check: 'rotate', key: 'cover', detail: `the rotate card is ${fmt(card.w)}x${fmt(card.h)} in a ${card.vw}x${card.vh} window`, boxes: [] });
      const rec = { size, kind: kindKey, state: 'portrait', fails, info: [card ? `card text: "${card.text}"` : 'no card'] };
      if (fails.length) {
        mkdirSync(join(OUT, 'shots'), { recursive: true });
        rec.shot = `shots/${shotName(size, 'portrait')}.jpg`;
        await p.screenshot({ path: join(OUT, rec.shot), type: 'jpeg', quality: 72, scale: 'css' }).catch(() => {});
      }
      results.push(rec);
      return;
    }

    // Menu
    await nav().waitFor({ timeout: 90000 });
    await p.waitForFunction(() => !(window.__lcsBoot && window.__lcsBoot.active()), null, { timeout: 90000 });
    await settle(2500);
    await check('menu');

    // Menu panels
    const back = () => p.getByRole('dialog').last().getByRole('button', { name: 'Back', exact: true });
    const panel = async (state, label, after) => {
      await step(state, async () => {
        await tap(nav().getByRole('button', { name: new RegExp(`^${label}`, 'i') }));
        await p.getByRole('dialog').last().waitFor({ timeout: 5000 });
        await settle(700);
        await check(state, { dialog: true });
        if (after) await after();
        await tap(back());
        await settle(400);
      });
    };
    await panel('panel-fighter', 'Fighter');
    await panel('panel-settings', 'Settings', async () => {
      const tabs = p.getByRole('dialog').last().getByRole('tab');
      const n = await tabs.count();
      for (let i = 1; i < n; i++) {
        const name = (await tabs.nth(i).textContent())?.trim().toLowerCase().replace(/\W+/g, '-') ?? `tab${i}`;
        await tap(tabs.nth(i));
        await settle(500);
        await check(`panel-settings-${name}`, { dialog: true });
      }
    });
    await panel('panel-how', 'How to play');
    await panel('panel-credits', 'Credits');

    // Lobby
    let inLobby = false;
    for (let taps = 0; taps < 4 && !inLobby; taps++) {
      await tap(nav().getByRole('button', { name: /^Play/i }));
      inLobby = await p.getByRole('radiogroup', { name: 'Fighter' }).waitFor({ timeout: 25000 }).then(() => true, () => false);
    }
    if (!inLobby) {
      skip('lobby', 'the lobby never opened');
      return;
    }
    await settle(5500);
    await check('lobby-pre');
    const ready = p.getByRole('button', { name: /^Ready/ });
    if (await step('lobby-ready', async () => {
      await tap(ready);
      await settle(1500);
      await check('lobby-ready');
    })) {
      // Plane
      await step('plane', async () => {
        await p.getByRole('radiogroup', { name: 'Fighter' }).waitFor({ state: 'detached', timeout: 90000 });
        await settle(2500);
        await check('plane', { zones: false });
      });
    }

    // Jump, fall, canopy, ground
    const stage = () => p.evaluate(() => window.__lcs.state().players[0].stage);
    await step('freefall', async () => {
      for (let i = 0; i < 25 && (await stage()) === 'drone'; i++) {
        if (kind.touchUi) await tap(p.getByRole('button', { name: 'Jump', exact: true }).first());
        else await p.keyboard.press('Space');
        await settle(400);
      }
      await settle(1200);
      await check('freefall');
    });
    await step('canopy', async () => {
      await p.waitForFunction(() => window.__lcs.state().players[0].canopy > 0.5 || window.__lcs.state().players[0].stage === 'ground', null, { timeout: 30000 });
      await settle(1500);
      await check('canopy');
    });
    await step('ground', async () => {
      await p.waitForFunction(() => window.__lcs.state().players[0].stage === 'ground', null, { timeout: 60000 });
      await settle(2500);
      await check('ground', { zones: true });
    });
    if (kind.touchUi) {
      await step('ground-full', async () => {
        // A sniper, a second gun and a bandage, so every context button shows.
        await p.evaluate(() => {
          const q = window.__lcs.state().players[0];
          Object.assign(q, { weapon: 'sniper', mag: 5, ammo: 10, holster: { weapon: 'smg', rarity: 0, mag: 10, ammo: 30 }, hp: 50, bandages: 2 });
        });
        await settle(800);
        await check('ground-full', { zones: true });
      });
    }

    // Pause
    await step('pause', async () => {
      if (kind.touchUi) await tap(p.getByRole('button', { name: 'Pause', exact: true }));
      else await p.keyboard.press('Escape');
      await p.getByRole('dialog', { name: 'Paused' }).waitFor({ timeout: 5000 });
      await settle(600);
      await check('pause', { dialog: true });
      if (kind.touchUi) await tap(p.getByRole('button', { name: /^Resume/ }).first());
      else await p.keyboard.press('Escape');
      await settle(400);
    });

    // Report
    await step('report', async () => {
      await p.evaluate(() => {
        const s = window.__lcs.state();
        s.players.forEach((q, i) => i && Object.assign(q, { alive: false, hp: 0, placement: i + 1 }));
        Object.assign(s, { phase: 'over', winner: 0 });
        Object.assign(s.players[0], { placement: 1, kills: 3 });
      });
      await p.getByRole('button', { name: /Play again/ }).waitFor({ timeout: 15000 });
      await settle(3000);
      await check('report', { overlayOf: '^Play again' });
    });
  } catch (e) {
    skip(current, `crashed: ${String(e.message).split('\n')[0].slice(0, 120)}`);
  }
  if (errs.length) results.push({ size, kind: kindKey, state: 'errors', fails: errs.slice(0, 3).map((m, i) => ({ check: 'errors', key: `e${i}:${m.slice(0, 40)}`, detail: m.slice(0, 160), boxes: [] })), info: [] });
  await ctx.close();
};

// -------------------------------------------------------------------------------------------------------------- report
const failureId = (r, f) => `${r.size}|${r.state}|${f.check}|${f.key}`;

const buildReport = (baselineIds) => {
  const sizes = [...new Set(results.map((r) => r.size).concat(notReached.map((n) => n.size)))];
  const states = [];
  for (const r of results) if (!states.includes(r.state)) states.push(r.state);
  const cell = (size, state) => {
    const r = results.find((x) => x.size === size && x.state === state);
    if (!r) return notReached.some((n) => n.size === size && n.state === state) ? '?' : '-';
    return r.fails.length ? String(r.fails.length) : '.';
  };
  const lines = [];
  const pad = (s, n) => String(s).padEnd(n);
  lines.push(`LAYOUT MATRIX  ${new Date().toISOString().slice(0, 16)}  ${sizes.length} sizes  (. clean, N failures, ? could not be reached, - not applicable)`);
  lines.push('');
  const w0 = Math.max(...states.map((s) => s.length), 5) + 2;
  lines.push(pad('', w0) + sizes.map((s) => s.slice(0, 8).padEnd(9)).join(''));
  lines.push(pad('', w0) + sizes.map((s) => (s.includes('touchlaptop') ? 'laptopT' : '').padEnd(9)).join('').trimEnd());
  for (const st of states) lines.push(pad(st, w0) + sizes.map((s) => cell(s, st).padEnd(9)).join(''));
  lines.push('');
  const byCheck = {};
  for (const r of results) for (const f of r.fails) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  lines.push(`failures by check: ${Object.entries(byCheck).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push('');
  for (const size of sizes) {
    const rs = results.filter((r) => r.size === size && r.fails.length);
    const nr = notReached.filter((n) => n.size === size);
    if (!rs.length && !nr.length) continue;
    lines.push(`== ${size}`);
    for (const r of rs) {
      for (const f of r.fails) {
        const tag = baselineIds ? (baselineIds.has(failureId(r, f)) ? '' : ' [NEW]') : '';
        lines.push(`  ${r.state.padEnd(18)} ${f.check.padEnd(11)} ${f.detail}${tag}`);
      }
      if (r.shot) lines.push(`  ${''.padEnd(18)} shot: ${r.shot}`);
    }
    for (const n of nr) lines.push(`  ${n.state.padEnd(18)} NOT REACHED  ${n.why}`);
  }
  lines.push('');
  lines.push('info (clean or not):');
  for (const r of results) if (r.info.length && ['ground', 'ground-full', 'lobby-pre', 'plane', 'freefall', 'canopy'].includes(r.state)) lines.push(`  ${r.size} ${r.state}: ${r.info.join(' | ')}`);
  return lines.join('\n');
};

// ------------------------------------------------------------------------------------------------------------------ main
const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const base = BASE_ARG && BASE_ARG !== true ? BASE_ARG : await startServer();
  const exe = findChrome();
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    for (const spec of specs) {
      const t0 = Date.now();
      await runSize(browser, base, spec);
      const n = results.filter((r) => r.size === (spec.endsWith(':l') ? `${spec.split(':')[0]}-touchlaptop` : spec.split(':')[0]) && r.fails.length).length;
      console.error(`  ${spec.padEnd(14)} ${((Date.now() - t0) / 1000).toFixed(0)}s  ${n ? `${n} screens with failures` : 'clean'}`);
    }
  } finally {
    await browser.close();
    stopServer();
  }
  let baselineIds;
  if (BASELINE && BASELINE !== true) {
    const old = JSON.parse(readFileSync(resolve(ROOT, BASELINE), 'utf8'));
    baselineIds = new Set(old.failures);
  }
  const report = buildReport(baselineIds);
  writeFileSync(join(OUT, 'report.txt'), report + '\n');
  const all = results.flatMap((r) => r.fails.map((f) => failureId(r, f)));
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), specs, failures: all, notReached, results: results.map(({ size, state, fails, info, shot }) => ({ size, state, fails: fails.map(({ check, key, detail }) => ({ check, key, detail })), info, shot })) }, null, 1));
  console.log(report);
  const fresh = baselineIds ? all.filter((id) => !baselineIds.has(id)) : all;
  const gone = baselineIds ? [...baselineIds].filter((id) => specs.length === SIZES.length && !all.includes(id)) : [];
  if (baselineIds) console.log(`\nvs baseline: ${fresh.length} new failure(s), ${gone.length} fixed${specs.length === SIZES.length ? '' : ' (fixed count only for a full run)'}`);
  console.log(`\nreport: ${join(OUT, 'report.txt')}\nresults: ${join(OUT, 'results.json')}`);
  process.exit(fresh.length || (!baselineIds && notReached.length) ? 1 : 0);
};

main().catch((e) => {
  stopServer();
  console.error(e);
  process.exit(2);
});
