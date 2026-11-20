// Progression items: two gun slots, rarity, vests, backpacks, heals and loot by place.
import { lootValue } from './bot-params';
import { DISTRICTS, DT, FIGHTERS, HEALS, lootTierAt, magOf, MAP, PACK, RARITY, SWAP_TIME, TILE, VEST, WEAPONS } from './constants';
import { createGame, healChoice, lootUnder, reloadTime, rollLoot, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input, Loot, LootKind, Player } from './types';

const idle = (): Input[] => Array.from({ length: 10 }, () => ({ ...NO_INPUT }));
const landed = (seed = 1): GameState => {
  const s = createGame('hotfix', seed);
  for (let i = 0; i < 60 * 60 && s.phase === 'drop'; i++) step(s, idle());
  return s;
};
const OPEN = (() => {
  for (let y = 6; y < MAP.length - 6; y++) {
    const x = MAP[y].indexOf('g'.repeat(30));
    if (x >= 0) return { x: x * TILE + 4, y: y * TILE + TILE / 2 };
  }
  throw new Error('no meadow');
})();
/** Empty the floor, send everyone else away, and stand player 0 in the open meadow. */
const alone = (seed = 1) => {
  const s = landed(seed);
  s.loot = [];
  s.racks.fill(0);
  s.players.slice(1).forEach((p) => Object.assign(p, { x: 6, y: 6 }));
  const p = s.players[0];
  Object.assign(p, { x: OPEN.x, y: OPEN.y, vx: 0, vy: 0 });
  return { s, p };
};
let nextLoot = 5000;
const drop = (s: GameState, kind: LootKind, x: number, y: number, extra: Partial<Loot> = {}) => {
  const l: Loot = { id: nextLoot++, kind, x, y, ammo: kind in WEAPONS ? WEAPONS[kind as 'rifle'].ammo : 0, tier: 0, active: true, ...extra };
  s.loot.push(l);
  return l;
};
/** Step with player 0 pressing `i` (one tick), then `ticks` idle ticks. */
const press = (s: GameState, i: Partial<Input>, ticks = 0) => {
  const inputs = idle();
  inputs[0] = { ...NO_INPUT, ...i };
  step(s, inputs);
  for (let t = 0; t < ticks; t++) step(s, idle());
};
const seconds = (s: GameState, sec: number, i: Partial<Input> = {}) => {
  for (let t = 0; t < Math.round(sec / DT); t++) {
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, ...i };
    step(s, inputs);
  }
};

describe('two gun slots', () => {
  it('you start with a pistol in slot 1 and slot 2 empty; walking over a new gun puts it in slot 2 and draws it', () => {
    const { s, p } = alone();
    expect(p.weapon).toBe('pistol');
    expect(p.slot).toBe(0);
    expect(p.holster).toBeNull();
    drop(s, 'rifle', p.x, p.y, { tier: 1, ammo: 40 });
    step(s, idle());
    expect(p.weapon).toBe('rifle');
    expect(p.rarity).toBe(1);
    expect(p.slot).toBe(1);
    expect(p.holster).toMatchObject({ weapon: 'pistol', mag: 12 });
    expect(p.mag).toBe(magOf('rifle', 1));
    expect(p.ammo).toBe(40 - magOf('rifle', 1));
  });

  it('a second gun of the kind in your hands is not picked up by walking over it', () => {
    const { s, p } = alone();
    drop(s, 'pistol', p.x, p.y);
    step(s, idle());
    expect(p.holster).toBeNull();
    expect(s.loot.some((l) => l.active && l.kind === 'pistol')).toBe(true);
  });

  it('1 and 2 draw a slot, X the other gun; drawing takes a moment with no shooting, and starts a reload over', () => {
    const { s, p } = alone();
    Object.assign(p, { weapon: 'smg', mag: 30, ammo: 60, slot: 1, holster: { weapon: 'sniper', rarity: 2, mag: 3, ammo: 5 } });
    press(s, { slot: 2 });
    expect(p.weapon).toBe('smg'); // already in hand
    press(s, { slot: 1 });
    expect(p.weapon).toBe('sniper');
    expect(p.rarity).toBe(2);
    expect(p.slot).toBe(0);
    expect(p.holster).toMatchObject({ weapon: 'smg', mag: 30, ammo: 60 });
    expect(s.events.some((e) => e.type === 'swap')).toBe(true);
    // No shot while drawing.
    const shots = () => s.events.filter((e) => e.type === 'shot').length;
    let fired = 0;
    for (let t = 0; t < Math.floor(SWAP_TIME / DT) - 2; t++) {
      press(s, { fire: true, aimX: p.x + 5, aimY: p.y });
      fired += shots();
    }
    expect(fired).toBe(0);
    seconds(s, 0.1);
    press(s, { fire: true, aimX: p.x + 5, aimY: p.y });
    expect(shots()).toBe(1);
    // A reload in progress starts over after a swap there and back.
    press(s, { reload: true });
    expect(p.reload).toBeGreaterThan(0);
    press(s, { cycle: true });
    expect(p.weapon).toBe('smg');
    expect(p.reload).toBe(0);
    seconds(s, 0.1);
    press(s, { cycle: true });
    expect(p.weapon).toBe('sniper');
    expect(p.reload).toBe(0);
    expect(p.mag).toBe(2);
  });

  it('with both slots full, walking over a gun leaves it; F swaps it for the one in your hands, which drops with its grade and rounds', () => {
    const { s, p } = alone();
    Object.assign(p, { weapon: 'shotgun', rarity: 1, mag: 4, ammo: 6, holster: { weapon: 'rifle', rarity: 0, mag: 25, ammo: 0 } });
    drop(s, 'sniper', p.x, p.y, { tier: 2, ammo: 10 });
    step(s, idle());
    expect(p.weapon).toBe('shotgun');
    press(s, { use: true });
    expect(p.weapon).toBe('sniper');
    expect(p.rarity).toBe(2);
    expect(p.holster?.weapon).toBe('rifle');
    const dropped = s.loot.find((l) => l.active && l.kind === 'shotgun')!;
    expect(dropped).toMatchObject({ tier: 1, ammo: 10 });
  });

  it('when you go down both guns, the vest, the backpack and everything you carried drop where you fell', () => {
    const { s, p } = alone();
    Object.assign(p, {
      weapon: 'rifle', rarity: 2, mag: 10, ammo: 5, holster: { weapon: 'shotgun', rarity: 0, mag: 6, ammo: 0 },
      vest: 2, armor: 0, pack: 1, bandages: 3, medkits: 1, coffees: 1, bombs: 2, hp: 0.5,
    });
    // The Deadline finishes it (it ignores armor).
    Object.assign(s.zone, { cx: 6, cy: 6, r: 1, dps: 50 });
    for (let i = 0; i < 30 && p.alive; i++) step(s, idle());
    expect(p.alive).toBe(false);
    const near = s.loot.filter((l) => l.active && Math.hypot(l.x - p.x, l.y - p.y) < 1.5);
    const kinds = near.map((l) => l.kind).sort();
    expect(kinds).toEqual(['backpack', 'bandage', 'bomb', 'coffee', 'medkit', 'rifle', 'shotgun']);
    expect(near.find((l) => l.kind === 'rifle')).toMatchObject({ tier: 2, ammo: 15 });
    expect(near.find((l) => l.kind === 'bandage')!.ammo).toBe(3);
  });
});

describe('vests', () => {
  /** Shoot player 1 with player 0's common pistol at 4 m until it has taken `hits` hits. */
  const shootAt = (s: GameState, hits: number) => {
    const [a, b] = s.players;
    Object.assign(b, { x: a.x + 4, y: a.y, vx: 0, vy: 0 });
    Object.assign(a, { weapon: 'pistol', rarity: 0, mag: 12, ammo: 24, heading: 0 });
    let n = 0;
    for (let t = 0; t < 600 && n < hits; t++) {
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, aimX: b.x, aimY: b.y };
      step(s, inputs);
      n += s.events.filter((e) => e.type === 'hit' && e.target === b.id).length;
    }
    expect(n).toBe(hits);
    return b;
  };

  it('I, II and III soak 50, 75 and 100 before your health takes anything', () => {
    for (const [tier, hitsToBreak] of [[1, 2], [2, 3], [3, 3]] as const) {
      const { s } = alone();
      const b = s.players[1];
      Object.assign(b, { vest: tier, armor: VEST.points[tier], hp: 100 });
      shootAt(s, 1);
      expect(b.hp).toBe(100);
      expect(b.armor).toBeCloseTo(VEST.points[tier] - 34, 5);
      shootAt(s, hitsToBreak - 1);
      expect(b.armor).toBe(0);
      // Whatever the vest could not take came off health.
      expect(b.hp).toBeCloseTo(100 - (34 * hitsToBreak - VEST.points[tier]), 5);
    }
  });

  it('walking over a vest takes it only when it has more left than yours; F swaps it anyway and drops yours', () => {
    const { s, p } = alone();
    Object.assign(p, { vest: 2, armor: 60 });
    drop(s, 'armor', p.x, p.y, { tier: 1, ammo: 50 });
    step(s, idle());
    expect(p.vest).toBe(2);
    press(s, { use: true });
    expect(p.vest).toBe(1);
    expect(p.armor).toBe(50);
    expect(s.loot.find((l) => l.active && l.kind === 'armor')).toMatchObject({ tier: 2, ammo: 60 });
    // A damaged Vest III with 40 left is not better than 50.
    drop(s, 'armor', p.x + 3, p.y, { tier: 3, ammo: 40 });
    drop(s, 'armor', p.x + 6, p.y, { tier: 3, ammo: 100 });
    seconds(s, 1.5, { mx: 1 });
    expect(p.armor).toBe(100);
    expect(p.vest).toBe(3);
  });
});

describe('rarity', () => {
  it('better grades hit a little harder, hold more and reload faster', () => {
    expect(RARITY.damage).toEqual([1, 1.06, 1.12]);
    expect(magOf('rifle', 0)).toBe(25);
    expect(magOf('rifle', 1)).toBe(31);
    expect(magOf('rifle', 2)).toBe(38);
    expect(magOf('pistol', 2)).toBe(18);
    const { s, p } = alone();
    for (const r of [0, 1, 2]) {
      Object.assign(p, { weapon: 'rifle', rarity: r, mag: 5, ammo: 50, cooldown: 0, swapping: 0, reload: 0 });
      s.projectiles = [];
      press(s, { fire: true, aimX: p.x + 10, aimY: p.y });
      expect(s.projectiles[0].damage).toBeCloseTo(WEAPONS.rifle.damage * RARITY.damage[r], 5);
      expect(reloadTime(p)).toBeCloseTo(WEAPONS.rifle.reload * RARITY.reload[r], 5);
    }
  });

  it('modestly: a prime gun never takes more than one hit fewer to finish someone than a common one', () => {
    for (const w of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'] as const) {
      for (const total of [100, 150, 200]) {
        // Per trigger pull: a shotgun's seven pellets all hitting.
        const shot = WEAPONS[w].damage * WEAPONS[w].bullets;
        const common = Math.ceil(total / shot);
        const prime = Math.ceil(total / (shot * RARITY.damage[2]));
        expect(common - prime, `${w} ${total}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('an empty magazine reloads to the bigger magazine of a prime gun', () => {
    const { s, p } = alone();
    Object.assign(p, { weapon: 'pistol', rarity: 2, mag: 1, ammo: 40, cooldown: 0 });
    press(s, { fire: true, aimX: p.x + 5, aimY: p.y });
    seconds(s, reloadTime(p) + 0.1);
    expect(p.mag).toBe(18);
    expect(p.ammo).toBe(22);
  });
});

describe('backpacks', () => {
  it('carry more spare rounds, heals and bombs; whatever does not fit stays on the floor', () => {
    const { s, p } = alone();
    Object.assign(p, { weapon: 'smg', rarity: 0, mag: 30, ammo: 80 });
    // No backpack: 3 magazines spare at most, so a box tops 80 up to 90.
    drop(s, 'ammo', p.x, p.y);
    press(s, { use: true });
    expect(p.ammo).toBe(30 * PACK.spareMags[0]);
    drop(s, 'ammo', p.x, p.y);
    press(s, { use: true });
    expect(p.ammo).toBe(90);
    expect(s.loot.filter((l) => l.active && l.kind === 'ammo')).toHaveLength(1);
    s.loot = [];
    // Bandages: 4 without a backpack. A stack of 6 leaves 2.
    drop(s, 'bandage', p.x, p.y, { ammo: 6 });
    step(s, idle());
    expect(p.bandages).toBe(PACK.bandage[0]);
    expect(s.loot.find((l) => l.active && l.kind === 'bandage')!.ammo).toBe(2);
    // Backpack II: room for 8, the rest of the stack comes along.
    drop(s, 'backpack', p.x + 3, p.y, { tier: 2 });
    const home = { x: p.x, y: p.y };
    seconds(s, 0.6, { mx: 1 });
    expect(p.pack).toBe(2);
    Object.assign(p, home);
    step(s, idle());
    expect(p.bandages).toBe(6);
    // A smaller backpack is left alone.
    drop(s, 'backpack', p.x, p.y, { tier: 1 });
    press(s, { use: true });
    expect(p.pack).toBe(2);
    expect(s.loot.some((l) => l.active && l.kind === 'backpack')).toBe(true);
  });
});

describe('heals', () => {
  const hurtAlone = (hp: number) => {
    const { s, p } = alone();
    Object.assign(p, { hp, sinceCombat: 0 });
    return { s, p };
  };

  it('a bandage takes 1.2 s for 15, and never past 75', () => {
    const { s, p } = hurtAlone(40);
    p.bandages = 2;
    press(s, { heal: true });
    expect(p.using).toBe('bandage');
    seconds(s, HEALS.bandage.time - 0.1);
    expect(p.hp).toBe(40);
    seconds(s, 0.15);
    expect(p.hp).toBe(55);
    expect(p.bandages).toBe(1);
    p.hp = 70;
    press(s, { heal: true });
    seconds(s, HEALS.bandage.time + 0.05);
    expect(p.hp).toBe(75);
    expect(p.bandages).toBe(0);
    // At 75 or more a bandage does nothing.
    p.bandages = 1;
    p.hp = 80;
    expect(healChoice(p)).toBeNull();
    press(s, { heal: true });
    expect(p.using).toBeNull();
  });

  it('a med kit takes 3.5 s for 65 and is picked when badly hurt; firing puts it away and keeps it', () => {
    const { s, p } = hurtAlone(30);
    Object.assign(p, { medkits: 1, bandages: 4 });
    expect(healChoice(p)).toBe('medkit');
    press(s, { heal: true });
    expect(p.using).toBe('medkit');
    seconds(s, HEALS.medkit.time - 0.1);
    expect(p.hp).toBe(30);
    seconds(s, 0.15);
    expect(p.hp).toBe(95);
    expect(p.medkits).toBe(0);

    p.hp = 30;
    p.medkits = 1;
    press(s, { heal: true });
    seconds(s, 1);
    press(s, { fire: true, aimX: p.x + 5, aimY: p.y });
    expect(p.using).toBeNull();
    expect(p.medkits).toBe(1);
    expect(p.hp).toBe(30);
  });

  it('while healing you walk at half speed', () => {
    const { s, p } = hurtAlone(30);
    p.medkits = 1;
    press(s, { heal: true });
    seconds(s, 1, { mx: 1 });
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(FIGHTERS.hotfix.speed * HEALS.walk, 1);
  });

  it('coffee: 0.8 s to drink, then 1.5 health a second and 6 % more speed for 20 s', () => {
    const { s, p } = hurtAlone(50);
    p.coffees = 1;
    press(s, { coffee: true });
    expect(p.using).toBe('coffee');
    seconds(s, HEALS.coffee.time + 0.05);
    expect(p.buzz).toBeGreaterThan(19.5);
    const hp0 = p.hp;
    p.sinceCombat = -20; // keep the regeneration out of it
    seconds(s, 4);
    expect(p.hp - hp0).toBeCloseTo(6, 0);
    seconds(s, 1, { mx: 1 });
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(FIGHTERS.hotfix.speed * HEALS.coffee.speed, 1);
    seconds(s, 16);
    expect(p.buzz).toBe(0);
    // The heal button drinks coffee when there is nothing else to use.
    Object.assign(p, { hp: 100, coffees: 1 });
    expect(healChoice(p)).toBe('coffee');
  });
});

describe('loot by place', () => {
  const tally = () => {
    const by = [1, 2, 3].map(() => ({ guns: 0, graded: 0, prime: 0, armor: 0, vest3: 0, long: 0, items: 0 }));
    for (let seed = 1; seed <= 30; seed++) {
      for (const l of createGame('hotfix', seed).loot) {
        const b = by[lootTierAt(l.x, l.y) - 1];
        b.items++;
        if (l.kind in WEAPONS) {
          b.guns++;
          if ((l.tier ?? 0) > 0) b.graded++;
          if (l.tier === 2) b.prime++;
          if (l.kind === 'rifle' || l.kind === 'sniper' || l.kind === 'rockets') b.long++;
        }
        if (l.kind === 'armor') {
          b.armor++;
          if (l.tier === 3) b.vest3++;
        }
      }
    }
    return by;
  };

  it('the town and the container yard are the risky places; the lake, the windmill, the forest and the fields are quiet', () => {
    const mid = (name: string) => {
      const d = DISTRICTS.find((x) => x.name === name)!;
      return lootTierAt((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2);
    };
    expect(mid('Old Town')).toBe(3);
    expect(mid('Container Yard')).toBe(3);
    expect(mid('North Farm')).toBe(2);
    expect(mid('Lakeside')).toBe(1);
    expect(mid('Deadwood')).toBe(1);
    expect(lootTierAt(5, 5)).toBe(1);
  });

  it('better loot in riskier places: more graded guns, more long guns, Vest III only away from the outskirts', () => {
    const [t1, t2, t3] = tally();
    for (const t of [t1, t2, t3]) expect(t.items).toBeGreaterThan(300); // every tier has plenty to find
    const share = (a: number, b: number) => a / Math.max(1, b);
    expect(t1.prime).toBe(0);
    expect(t1.vest3).toBe(0);
    expect(share(t1.graded, t1.guns)).toBeLessThan(share(t2.graded, t2.guns));
    expect(share(t2.graded, t2.guns)).toBeLessThan(share(t3.graded, t3.guns));
    expect(share(t3.graded, t3.guns)).toBeGreaterThan(0.5);
    expect(share(t1.long, t1.guns)).toBeLessThan(share(t3.long, t3.guns));
    expect(share(t2.vest3, t2.armor)).toBeLessThan(share(t3.vest3, t3.armor));
    expect(share(t3.vest3, t3.armor)).toBeGreaterThan(0.3);
  });

  it('is the same every time from the same seed', () => {
    expect(createGame('hotfix', 7).loot).toEqual(createGame('hotfix', 7).loot);
    const s = createGame('hotfix', 3);
    const a = Array.from({ length: 50 }, () => rollLoot(s, 3));
    const s2 = createGame('hotfix', 3);
    expect(Array.from({ length: 50 }, () => rollLoot(s2, 3))).toEqual(a);
  });
});

describe('what bots think loot is worth', () => {
  const me = (o: Partial<Player>) => Object.assign(landed().players[1], o);

  it('a second gun for the other range is worth more than a second of the same range', () => {
    const p = me({ weapon: 'shotgun', rarity: 0, mag: 6, ammo: 12, holster: null });
    expect(lootValue({ kind: 'rifle', ammo: 75, tier: 0 }, p)).toBeGreaterThan(lootValue({ kind: 'smg', ammo: 90, tier: 0 }, p));
  });

  it('a better grade of the gun you have is an upgrade; the same grade is not', () => {
    const p = me({ weapon: 'rifle', rarity: 0, mag: 25, ammo: 50, holster: { weapon: 'shotgun', rarity: 0, mag: 6, ammo: 12 } });
    expect(lootValue({ kind: 'rifle', ammo: 75, tier: 2 }, p)).toBeGreaterThan(0.5);
    expect(lootValue({ kind: 'rifle', ammo: 75, tier: 0 }, p)).toBe(0);
    expect(lootValue({ kind: 'pistol', ammo: 36, tier: 2 }, p)).toBe(0);
  });

  it('vests and backpacks only when better, heals only with room for them', () => {
    const p = me({ vest: 2, armor: 75, pack: 1, bandages: PACK.bandage[1], medkits: 0 });
    expect(lootValue({ kind: 'armor', ammo: 50, tier: 1 }, p)).toBe(0);
    expect(lootValue({ kind: 'armor', ammo: 100, tier: 3 }, p)).toBeGreaterThan(0);
    expect(lootValue({ kind: 'backpack', ammo: 0, tier: 1 }, p)).toBe(0);
    expect(lootValue({ kind: 'backpack', ammo: 0, tier: 2 }, p)).toBeGreaterThan(0);
    expect(lootValue({ kind: 'bandage', ammo: 2 }, p)).toBe(0);
    expect(lootValue({ kind: 'medkit', ammo: 1 }, p)).toBeGreaterThan(lootValue({ kind: 'coffee', ammo: 1 }, p));
  });
});

it('lootUnder still finds the nearest piece', () => {
  const { s, p } = alone();
  drop(s, 'coffee', p.x + 0.5, p.y);
  drop(s, 'bomb', p.x + 0.2, p.y);
  expect(lootUnder(s, p)?.kind).toBe('bomb');
});
