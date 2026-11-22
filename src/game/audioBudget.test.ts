import { readFileSync } from 'fs';
import path from 'path';

import { BUDGET, createGate } from './audioBudget';

const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8');
const sources = [read('sfx.ts'), read('../components/uiSound.ts')].join('\n');

describe('sound budget', () => {
  it('every gated sound has a budget row, and every row is used', () => {
    const asked = new Set([...sources.matchAll(/\b(?:may|gate\.allow)\('(\w+)'/g)].map((m) => m[1]));
    for (const name of asked) expect(BUDGET).toHaveProperty(name);
    for (const name of Object.keys(BUDGET)) expect(asked.has(name), name).toBe(true);
  });

  it('every row is capped', () => {
    for (const [name, b] of Object.entries(BUDGET)) {
      expect(b.maxVoices, name).toBeGreaterThanOrEqual(1);
      expect(b.maxVoices, name).toBeLessThanOrEqual(4);
      expect(b.lengthMs, name).toBeGreaterThan(0);
    }
  });

  it('a crowd of six running fighters never sounds more than four steps at once', () => {
    const g = createGate();
    let worst = 0;
    for (let t = 0; t < 3000; t += 50) {
      for (let b = 0; b < 6; b++) g.allow('step', t + b * 5);
      worst = Math.max(worst, g.active('step', t));
    }
    expect(worst).toBeLessThanOrEqual(4);
  });

  it('mashing the trigger on an empty gun clicks at most five times a second', () => {
    const g = createGate();
    let n = 0;
    for (let t = 0; t < 1000; t += 30) if (g.allow('dryFire', t)) n++;
    expect(n).toBeLessThanOrEqual(5);
  });

  it('a held arrow key in the menu ticks at most ~22 times a second', () => {
    const g = createGate();
    let n = 0;
    for (let t = 0; t < 1000; t += 33) if (g.allow('uiTick', t)) n++;
    expect(n).toBeLessThanOrEqual(23);
  });

  it('the gunshot pool and the limiter are still there', () => {
    expect(read('sfx.ts')).toMatch(/SHOT_BUDGET = \d/);
    expect(read('sfx.ts')).toMatch(/limit\.ratio\.value = 20/);
  });
});
