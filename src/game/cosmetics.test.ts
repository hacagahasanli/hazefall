import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANOPIES } from './canopies';
import { botLook, FIGHTER_ORDER, FINISHES, ITEMS, MILESTONES, nextReward, OUTFITS, outfitParts, REWARD_LEVELS, rewardLabel, rewardsAtLevel, SMOKES, unlockedFor } from './cosmetics';
import { createGame } from './sim/step';
import { FIGHTERS } from './sim/constants';

const kinds = (ids: string[]) => ids.map((id) => id.split(':')[0]);
const luminance = (n: number) => 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);

describe('the reward track', () => {
  it('has the totals of the spec: 6 outfit sets, 7 finishes, 12 canopies, 3 smoke settings', () => {
    expect(OUTFITS).toHaveLength(6);
    expect(FINISHES).toHaveLength(7);
    expect(CANOPIES).toHaveLength(12);
    expect(SMOKES).toHaveLength(3);
  });

  it('every level from 1 to 20 shows exactly the rewards of the track table as unlocked', () => {
    const track: Record<number, string[]> = {
      2: ['canopy:mint'], 3: ['outfit:darkmode'], 4: ['finish:arctic'], 5: ['smoke:canopy'], 6: ['canopy:navy'], 7: ['outfit:arctic'], 8: ['finish:cherry'],
      9: ['canopy:checker'], 10: ['finish:gold', 'canopy:gold'], 11: ['canopy:split'], 12: ['outfit:synthwave'], 13: ['canopy:sunset'], 14: ['finish:terminal'],
      15: ['canopy:rainbow'], 16: ['canopy:night'], 17: ['outfit:terminal'], 18: ['finish:synthwave'], 19: ['smoke:rainbow'], 20: ['outfit:legend', 'canopy:legend'],
    };
    const start = ['outfit:standard', 'finish:factory', 'canopy:classic', 'smoke:off'];
    const own = [...start];
    for (let level = 1; level <= 20; level++) {
      if (level > 1) own.push(...track[level]);
      expect(rewardsAtLevel(level).map((i) => i.id).sort()).toEqual((level > 1 ? track[level] : []).sort());
      expect(unlockedFor(level, 0).sort()).toEqual([...own].sort());
    }
    // The streak items come from days, never levels.
    expect(unlockedFor(20, 0)).not.toContain('canopy:teal');
    expect(unlockedFor(1, 3)).toContain('canopy:teal');
    expect(unlockedFor(1, 7).filter((id) => id.endsWith(':ember')).sort()).toEqual(['canopy:ember', 'finish:ember']);
    expect(unlockedFor(30, 0)).toEqual(unlockedFor(20, 0));
  });

  it('outfit sets come at 3, 7, 12, 17 and 20 and gun finishes at 4, 8, 10, 14 and 18 (the spec table)', () => {
    expect(OUTFITS.filter((o) => o.key !== 'standard').map((o) => ('level' in o.from ? o.from.level : 0))).toEqual([3, 7, 12, 17, 20]);
    expect(FINISHES.filter((f) => 'level' in f.from && f.from.level > 1).map((f) => ('level' in f.from ? f.from.level : 0))).toEqual([4, 8, 10, 14, 18]);
    // Every level from 2 to 20 has something new, so the bar always points at a reward.
    expect(REWARD_LEVELS).toEqual(Array.from({ length: 19 }, (_, i) => i + 2));
  });

  it('the menu line: next reward, gold milestone within two levels, nothing from Level 20', () => {
    expect(nextReward(1)).toMatchObject({ level: 2, milestone: false, text: 'Next at Level 2: Mint stripes canopy' });
    expect(nextReward(3)).toMatchObject({ level: 5, milestone: true, text: 'Level 5: Drop Smoke' });
    expect(nextReward(2)).toMatchObject({ level: 3, milestone: false, text: 'Next at Level 3: Dark Mode outfits' });
    expect(nextReward(5)).toMatchObject({ level: 6, milestone: false, text: 'Next at Level 6: Navy chevron canopy' });
    expect(nextReward(3)?.item.id).toBe('smoke:canopy');
    expect(nextReward(8)).toMatchObject({ level: 10, milestone: true, text: 'Level 10: Gold Build' });
    expect(nextReward(8)?.item.id).toBe('finish:gold');
    expect(nextReward(19)).toMatchObject({ level: 20, milestone: true, text: 'Level 20: Legend outfits' });
    expect(nextReward(20)).toBeNull();
    expect(nextReward(35)).toBeNull();
    expect(MILESTONES).toEqual([5, 10, 20]);
    expect(REWARD_LEVELS[0]).toBe(2);
    expect(nextReward(3)).not.toBeNull();
    expect(rewardLabel(ITEMS.find((i) => i.id === 'finish:arctic')!)).toBe('Arctic gun finish');
  });
});

describe('outfit rules', () => {
  it('Standard is the code colours; every set keeps skin, hair and the silhouette (colour parts only)', () => {
    expect(outfitParts('standard', 'hotfix')).toMatchObject({ top: 0xf2542d, pants: 0x1b1f2e, shoes: 0xfffaf0, hood: 0xf2542d, pocket: 0xb8441f });
    expect(outfitParts('standard', 'intern')).toMatchObject({ bag: 0xffc93c, bagTrim: 0xc98a1b, cuff: 0xa82e2e });
    for (const o of OUTFITS) for (const f of FIGHTER_ORDER) {
      const parts = outfitParts(o.key, f);
      expect(Object.keys(parts).sort()).toEqual(Object.keys(outfitParts('standard', f)).sort());
      for (const part of Object.keys(o.parts[f])) expect(part).not.toMatch(/skin|hair|beard/);
    }
  });

  it('no camouflage on the top and trousers, nothing darker than #1c2024 as a main colour in the colour sets', () => {
    const camo = (n: number) => {
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return g > r && g > b && r > 60 && b < 120 && g < 180; // olive and mid greens
    };
    for (const o of OUTFITS) for (const f of FIGHTER_ORDER) {
      const p = outfitParts(o.key, f);
      for (const part of ['top', 'pants'] as const) {
        const c = p[part];
        if (typeof c !== 'number') continue;
        // Legacy's own green and brown trousers stay in Standard only.
        if (o.key === 'standard' && f === 'legacy') continue;
        expect(camo(c), `${o.key} ${f} ${part}`).toBe(false);
      }
      if (['darkmode', 'arctic', 'synthwave', 'legend'].includes(o.key)) {
        for (const part of ['top', 'pants'] as const) expect(luminance(p[part] as number)).toBeGreaterThanOrEqual(luminance(0x1c2024) - 8);
      }
    }
  });

  it('only Terminal and Legend use the glow or gold materials', () => {
    for (const o of OUTFITS) {
      const special = FIGHTER_ORDER.some((f) => Object.values(o.parts[f]).some((c) => c === 'gold' || c === 'glow'));
      expect(special).toBe(o.key === 'terminal' || o.key === 'legend');
    }
  });
});

describe('seeded bot looks', () => {
  it('the same match seed and bot id always give the same look', () => {
    for (let id = 0; id < 20; id++) expect(botLook(1234, id)).toEqual(botLook(1234, id));
    expect(botLook(1234, 3)).not.toEqual(botLook(99999, 3));
  });

  it('follows the odds of the spec over many bots', () => {
    const n = 20000;
    const tally = (pick: (l: ReturnType<typeof botLook>) => string) => {
      const t: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        const k = pick(botLook(i * 7919, i % 20));
        t[k] = (t[k] ?? 0) + 1;
      }
      return (k: string) => (t[k] ?? 0) / n;
    };
    const outfit = tally((l) => l.outfit.hotfix);
    expect(outfit('standard')).toBeGreaterThan(0.5);
    expect(outfit('standard')).toBeLessThan(0.6);
    expect(outfit('legend')).toBeGreaterThan(0.03);
    expect(outfit('legend')).toBeLessThan(0.07);
    const finish = tally((l) => l.finish);
    expect(finish('factory')).toBeGreaterThan(0.55);
    expect(finish('factory')).toBeLessThan(0.65);
    expect(finish('ember')).toBeLessThan(0.05);
    expect(tally((l) => l.canopy)('classic')).toBeGreaterThan(0.45);
    const smoke = tally((l) => l.smoke)('canopy');
    expect(smoke).toBeGreaterThan(0.17);
    expect(smoke).toBeLessThan(0.23);
  });

  it('only ever picks things that exist, and one outfit set for all four fighters', () => {
    for (let i = 0; i < 200; i++) {
      const l = botLook(i, i % 20);
      for (const f of FIGHTER_ORDER) expect(OUTFITS.some((o) => o.key === l.outfit[f])).toBe(true);
      expect(FINISHES.some((x) => x.key === l.finish)).toBe(true);
      expect(CANOPIES.some((x) => x.id === l.canopy)).toBe(true);
    }
  });
});

describe('looks only: nothing cosmetic reaches the rules', () => {
  const sim = join(__dirname, 'sim');

  it('the sim never imports a cosmetic, a canopy or the renderer', async () => {
    const { readdirSync } = await import('node:fs');
    for (const file of readdirSync(sim).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(sim, file), 'utf8');
      expect(src, file).not.toMatch(/from '(\.\.\/cosmetics|\.\.\/canopies|\.\.\/render|\.\.\/career|\.\.\/progress)/);
    }
  });

  it('fighter stats and a started match are identical for every outfit, finish, canopy and smoke combination', async () => {
    const baseStats = JSON.stringify(FIGHTERS);
    const baseState = Object.fromEntries(FIGHTER_ORDER.map((id) => [id, JSON.stringify(createGame(id, 7))]));
    const { buildRig } = await import('./render/characters');
    const { buildGun } = await import('./render/guns');
    // Wearing a combination: the fighters in the outfit, a gun in the finish; then the rules are read again.
    const worn = new Set<string>();
    let combos = 0;
    for (const o of OUTFITS) for (const f of FINISHES) {
      for (const id of FIGHTER_ORDER) if (!worn.has(`${o.key}${id}`)) {
        worn.add(`${o.key}${id}`);
        buildRig(id, o.key);
      }
      buildGun('rifle', f.key);
      for (let c = 0; c < CANOPIES.length * SMOKES.length; c++) {
        combos++;
        expect(JSON.stringify(FIGHTERS)).toBe(baseStats);
      }
      for (const id of FIGHTER_ORDER) expect(JSON.stringify(createGame(id, 7))).toBe(baseState[id]);
    }
    expect(combos).toBe(6 * 7 * 12 * 3);
  }, 60000);
});

describe('ground loot and bombs stay Factory', () => {
  it('lootModel and the bomb build guns without a finish', () => {
    const src = readFileSync(join(__dirname, 'render', 'game.ts'), 'utf8');
    expect(src).toMatch(/const gun = buildGun\(GUN_MODEL\[kind as keyof typeof GUN_MODEL\]\)\.root/);
    expect(src).toMatch(/const bomb = buildGun\('bomb'\)\.root/);
  });
});
