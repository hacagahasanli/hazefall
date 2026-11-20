/** Portal capture tooling (not part of the game). Needs playwright-core@1.65.0 and its Chromium in a scratch folder; run from there with `npm run dev:portal` up (port 3203). Renders go to ./raw; portal-covers.mjs <rawDir> <portal/public/fonts> <docs/portal/covers>. */
// Covers: a real render behind the title, at the CrazyGames sizes (1920x1080, 800x1200, 800x800).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const exe = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [, , RAW, FONTS, OUT] = process.argv;
const b = await chromium.launch({ executablePath: exe });
const variants = [
  ['A-parachute', 'A-chute-3500.png', '40% 30%', 'Drop in. Loot. Survive.'],
  ['B-firefight', 'B-town.png', '50% 35%', '10 players. 1 winner.'],
  ['C-the-drop', 'A-plane.png', '38% 40%', 'Jump anywhere on the island.'],
];
const sizes = [['landscape', 1920, 1080], ['portrait', 800, 1200], ['square', 800, 800]];
for (const [name, img, focus, tag] of variants) {
  for (const [kind, w, h] of sizes) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const u = Math.min(w, h) / 100;
    writeFileSync(`${RAW}/_c.html`, `<!doctype html><style>
      @font-face{font-family:Bungee;src:url(file://${FONTS}/bungee-400.woff2)}
      @font-face{font-family:Chakra;font-weight:700;src:url(file://${FONTS}/chakra-petch-700.woff2)}
      body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0a0d18}
      .bg{position:absolute;inset:0;background:url(file://${RAW}/${img}) ${kind === 'landscape' ? '0% 30%/auto 140%' : focus + '/cover'} no-repeat}
      .shade{position:absolute;inset:0;background:linear-gradient(${kind === 'landscape' ? '90deg' : '0deg'},rgba(10,13,24,.9) 0%,rgba(10,13,24,.55) 30%,rgba(10,13,24,0) 58%)}
      .t{position:absolute;${kind === 'landscape' ? `left:${5 * u}px;top:50%;transform:translateY(-50%)` : `left:${6 * u}px;right:${6 * u}px;bottom:${7 * u}px`};font-family:Bungee;color:#e6ebf5;line-height:.92;font-size:${kind === 'landscape' ? 15 * u : 15.5 * u}px;text-shadow:0 ${u * .6}px ${u * 2.4}px rgba(0,0,0,.7)}
      .t b{display:block;color:#ffd23f;font-weight:400}
      .tag{margin-top:${2.4 * u}px;font:700 ${4.6 * u}px Chakra;letter-spacing:.06em;color:#e6ebf5;text-transform:uppercase}
    </style><div class="bg"></div><div class="shade"></div><div class="t">LAST COMMIT<b>STANDING</b><div class="tag">${tag}</div></div>`);
    await p.goto(`file://${RAW}/_c.html`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/${name}-${kind}-${w}x${h}.png` });
    await p.close();
  }
}
await b.close();
