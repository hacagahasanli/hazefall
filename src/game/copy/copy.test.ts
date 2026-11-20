import { describe, expect, it } from 'vitest';

import { COPY as NEUTRAL } from './neutral';
import { COPY as STUDIO } from './studio';

import type { Copy } from './types';

/** Every string in a copy object, with functions called on sample arguments. */
const strings = (c: Copy): string[] => [
  ...Object.values(c.fighters).flatMap((f) => [f.name, f.role, f.superName, f.superText]),
  ...c.botNames,
  c.guestPrefix,
  c.zone.name,
  c.zone.waiting,
  c.zone.closing,
  c.zone.final,
  c.zone.outside,
  c.zone.caught('Kiwi'),
  c.result.won,
  c.result.lost,
  c.result.wonLine(9),
  ...(c.intro.above ? [c.intro.above] : []),
  ...c.intro.title(10),
  c.intro.line,
  ...(c.intro.below ? [c.intro.below] : []),
  ...c.howTo.flat(),
  ...c.items.rarity,
  c.items.bandage,
  c.items.medkit,
  c.items.coffee,
];

/** Developer jokes that must never reach the portal audience. */
const JOKES = /deadline|commit|merge|deploy|developer|hotfix|legacy|standup|scrum|intern|branch|push|revert|shipp?ed|engineer|maintainer|deprecated|timebox|lint|null_ptr|rm_rf|tech_debt|\bdev_|on-call/i;

describe('portal copy', () => {
  it('has the same fighters and as many bots as the studio copy', () => {
    expect(Object.keys(NEUTRAL.fighters).sort()).toEqual(Object.keys(STUDIO.fighters).sort());
    expect(NEUTRAL.botNames).toHaveLength(STUDIO.botNames.length);
    expect(NEUTRAL.howTo.map(([t]) => t)).toEqual(STUDIO.howTo.map(([t]) => t));
  });

  it('carries none of the developer jokes', () => {
    for (const s of strings(NEUTRAL)) expect(s, s).not.toMatch(JOKES);
  });

  it('the studio copy really is the joke one (so the check above means something)', () => {
    expect(strings(STUDIO).filter((s) => JOKES.test(s)).length).toBeGreaterThan(10);
  });

  it('gives fighters and bots distinct names', () => {
    const names = [...Object.values(NEUTRAL.fighters).map((f) => f.name), ...NEUTRAL.botNames];
    expect(new Set(names).size).toBe(names.length);
  });
});
