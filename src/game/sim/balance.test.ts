// Weapon roles (docs/BALANCE.md): each gun owns a distance band and none dominates. Change a WEAPONS number and these
// tell you which role it broke.
import { BARE, burstDps, falloff, fastestAt, GEARED, GUNS, shotDamage, shotInterval, shotTicks, ttk } from './balance';
import { DT, FIGHTERS, RARITY, SUPERS, WEAPONS } from './constants';
import { falloffDamage } from './step';

import type { WeaponKind } from './types';

const near = [2, 4, 6];
const mid = [9, 10, 12];
const long = [20, 30, 40, 50];
const far = [70, 100, 150];
const sec = (k: WeaponKind, d: number, hp: number) => ttk(k, d, hp).seconds;

describe('the calculator follows the sim', () => {
  it('fires on whole ticks the way the cooldown counts down', () => {
    expect(shotTicks(0.09)).toBe(6);
    expect(shotTicks(0.16)).toBe(10);
    expect(shotInterval(WEAPONS.smg)).toBeCloseTo(6 * DT, 9);
  });

  it('uses the same falloff as the sim', () => {
    for (const k of GUNS) for (const d of [0, 10, 25, 40, 80, 200]) {
      expect(falloff(WEAPONS[k], WEAPONS[k].damage, d), `${k} ${d} m`).toBeCloseTo(falloffDamage(k, WEAPONS[k].damage, d), 9);
    }
  });
});

describe('shotgun: the close-range king', () => {
  it('kills bare in one pump and geared in two out to 6 m', () => {
    for (const d of near) {
      expect(ttk('shotgun', d, BARE).shots, `${d} m`).toBe(1);
      expect(ttk('shotgun', d, GEARED).shots, `${d} m`).toBe(2);
    }
  });

  it('is the fastest gun of all within 6 m, bare or geared', () => {
    for (const d of near) for (const hp of [BARE, GEARED]) expect(fastestAt(d, hp).kind, `${d} m ${hp}`).toBe('shotgun');
  });

  it('is useless past 15 m: under 10 damage a pump', () => {
    for (const d of [15, 20, 30]) expect(shotDamage(WEAPONS.shotgun, d), `${d} m`).toBeLessThan(10);
  });
});

describe('SMG: fastest from just outside shotgun range to 12 m, then falls off hard', () => {
  it('beats every other gun between 9 and 12 m', () => {
    for (const d of mid) for (const hp of [BARE, GEARED]) expect(fastestAt(d, hp).kind, `${d} m ${hp}`).toBe('smg');
  });

  it('out-kills the rifle and pistol up close', () => {
    for (const d of [...near, ...mid]) for (const hp of [BARE, GEARED]) {
      expect(sec('smg', d, hp)).toBeLessThan(sec('rifle', d, hp));
      expect(sec('smg', d, hp)).toBeLessThan(sec('pistol', d, hp));
    }
  });

  it('does under a quarter of its damage past 30 m and loses to the rifle from 20 m', () => {
    expect(shotDamage(WEAPONS.smg, 32)).toBeLessThan(WEAPONS.smg.damage * 0.25);
    for (const d of long) expect(sec('smg', d, BARE), `${d} m`).toBeGreaterThan(sec('rifle', d, BARE) * 1.4);
  });

  it('has the highest burst damage of the automatics', () => {
    expect(burstDps(WEAPONS.smg)).toBeGreaterThan(burstDps(WEAPONS.rifle));
  });
});

describe('rifle: reliable at mid and long range, never best up close', () => {
  it('is the fastest from 20 to 50 m', () => {
    for (const d of long) for (const hp of [BARE, GEARED]) expect(fastestAt(d, hp).kind, `${d} m ${hp}`).toBe('rifle');
  });

  it('loses to the SMG and the shotgun inside 6 m', () => {
    for (const d of near) for (const hp of [BARE, GEARED]) {
      expect(sec('rifle', d, hp)).toBeGreaterThan(sec('smg', d, hp));
      expect(sec('rifle', d, hp)).toBeGreaterThan(sec('shotgun', d, hp));
    }
  });

  it('keeps at least half its damage at any range', () => {
    expect(falloffDamage('rifle', WEAPONS.rifle.damage, 1000)).toBeGreaterThanOrEqual(WEAPONS.rifle.damage * 0.5);
  });
});

describe('pistol: the baseline', () => {
  it('is never the fastest, but finishes a bare target with its found rounds out to 50 m', () => {
    for (const d of [...near, ...mid, ...long]) {
      expect(fastestAt(d, BARE).kind).not.toBe('pistol');
      expect(Number.isFinite(sec('pistol', d, BARE)), `${d} m`).toBe(true);
    }
  });

  it('takes three shots on bare health up close', () => {
    expect(ttk('pistol', 5, BARE).shots).toBe(3);
  });
});

describe('sniper: two shots bare, three geared, at any range, slowly', () => {
  it('needs 2 hits on bare health and 3 through a full vest at every range and grade', () => {
    for (const d of [5, 20, 50, 100, 150]) for (const r of [0, 1, 2]) {
      expect(ttk('sniper', d, BARE, r).shots, `${d} m grade ${r}`).toBe(2);
      expect(ttk('sniper', d, GEARED, r).shots, `${d} m grade ${r}`).toBe(3);
    }
  });

  it('owns the far range', () => {
    for (const d of far) for (const hp of [BARE, GEARED]) expect(fastestAt(d, hp).kind, `${d} m ${hp}`).toBe('sniper');
  });

  it('fires no faster than once every 1.4 s and loses badly up close', () => {
    expect(shotInterval(WEAPONS.sniper)).toBeGreaterThanOrEqual(1.4);
    expect(sec('sniper', 5, GEARED)).toBeGreaterThan(sec('smg', 5, GEARED) * 2);
  });
});

describe('rockets: the rare power weapon', () => {
  it('a direct hit takes down a bare fighter, a vest survives one', () => {
    expect(ttk('rockets', 10, BARE).shots).toBe(1);
    expect(ttk('rockets', 10, GEARED).shots).toBe(2);
  });

  it('only one magazine round and a slow rocket you can see coming', () => {
    expect(WEAPONS.rockets.mag).toBe(1);
    expect(WEAPONS.rockets.speed).toBeLessThanOrEqual(20);
  });
});

describe('nothing dominates', () => {
  it('every gun but the pistol is the fastest somewhere, and none at every range', () => {
    const grid = [...near, ...mid, ...long, ...far];
    const winners = new Set(grid.flatMap((d) => [fastestAt(d, BARE).kind, fastestAt(d, GEARED).kind]));
    expect([...winners].sort()).toEqual(['rifle', 'shotgun', 'smg', 'sniper']);
  });

  it('rarity stays modest: a prime gun saves at most one shot, or 12 % of them on long strings', () => {
    for (const k of GUNS) for (const d of [5, 20, 50]) for (const hp of [BARE, GEARED]) {
      const common = ttk(k, d, hp, 0).shots;
      const prime = ttk(k, d, hp, RARITY.damage.length - 1).shots;
      if (Number.isFinite(common)) expect(common - prime, `${k} ${d} m ${hp}`).toBeLessThanOrEqual(Math.max(1, Math.ceil(common * 0.12)));
    }
  });
});

describe('supers: none dominates', () => {
  const T = SUPERS.timebox;
  it('the slow-field canister never one-shoots: its burst is under a third of a bare fighter', () => {
    expect(T.damage).toBeLessThan(BARE / 3);
    expect(T.damage).toBeLessThan(GEARED / 3);
  });

  it('its burst hits about as hard as the other damaging supers, per point of charge too', () => {
    const others = [SUPERS.deploy.damage, SUPERS.push.damage];
    expect(T.damage).toBeLessThanOrEqual(Math.max(...others) * 1.1);
    expect(T.damage).toBeGreaterThanOrEqual(Math.min(...others) * 0.8);
    const perCharge = (dmg: number, cost: number) => dmg / cost;
    const mine = perCharge(T.damage, FIGHTERS.standup.superCost);
    const best = Math.max(perCharge(SUPERS.deploy.damage, FIGHTERS.hotfix.superCost), perCharge(SUPERS.push.damage, FIGHTERS.intern.superCost));
    expect(mine).toBeLessThanOrEqual(best * 1.25);
  });

  it('its reach and area stay modest: a short throw, a small burst inside a field the size of the old one', () => {
    expect(T.range).toBeLessThanOrEqual(16);
    expect(T.burst).toBeLessThan(T.radius);
    expect(T.radius).toBeLessThanOrEqual(4.5);
    expect(T.life).toBeLessThanOrEqual(4.5);
  });
});
