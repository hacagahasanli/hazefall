// The slow-field canister (Standup's super, G): thrown on an arc to the aim point, a modest burst, then the slow field.
import { createBot } from './bot';
import { DT, MAP, PLAYERS, SUPERS, TILE } from './constants';
import { createGame, step, superThrowTarget } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const T = SUPERS.timebox;
const idle = (): Input[] => Array.from({ length: PLAYERS }, () => ({ ...NO_INPUT }));

/** The middle of a stretch of open meadow 30 tiles long: nothing in the way. */
const OPEN = (() => {
  for (let y = 6; y < MAP.length - 6; y++) {
    const x = MAP[y].indexOf('g'.repeat(30));
    if (x >= 0) return { x: x * TILE + 24, y: y * TILE + TILE / 2 };
  }
  throw new Error('no meadow');
})();

/** Everyone landed; player 0 a Standup with a full super in open meadow; everyone else far away, bare (no vest). */
const setup = (seed = 1) => {
  const s = createGame('standup', seed);
  for (let i = 0; i < 60 * 60 && s.phase === 'drop'; i++) step(s, idle());
  s.loot = [];
  s.players.forEach((p, i) => Object.assign(p, { x: 6 + i, y: 6, vx: 0, vy: 0, armor: 0, hp: p.maxHp }));
  const me = s.players[0];
  Object.assign(me, { fighter: 'standup', x: OPEN.x, y: OPEN.y, heading: 0, superCharge: 1 });
  return { s, me };
};

/** Hold G for a few ticks aiming at (ax, ay), then let go. */
const throwAt = (s: GameState, ax: number, ay: number) => {
  const hold = idle();
  hold[0] = { ...NO_INPUT, super: true, throwAt: true, aimX: ax, aimY: ay };
  for (let i = 0; i < 4; i++) step(s, hold);
  const go = idle();
  go[0] = { ...NO_INPUT, throwAt: true, aimX: ax, aimY: ay };
  step(s, go);
};

/** Run until the canister lands (or `max` s). */
const land = (s: GameState, max = 3) => {
  for (let i = 0; i < max / DT; i++) {
    step(s, idle());
    if (s.events.some((e) => e.type === 'slowBurst')) return s.events.find((e) => e.type === 'slowBurst')!;
  }
  return null;
};

describe('the slow-field canister', () => {
  it('is aimed while G is held (nothing thrown yet) and flies on letting go, landing at the aim point', () => {
    const { s, me } = setup();
    const hold = idle();
    hold[0] = { ...NO_INPUT, super: true, throwAt: true, aimX: me.x + 10, aimY: me.y + 4 };
    for (let i = 0; i < 30; i++) step(s, hold);
    expect(me.charging).toBe('super');
    expect(s.projectiles.some((p) => p.field)).toBe(false);
    expect(me.superCharge).toBe(1);
    const go = idle();
    go[0] = { ...NO_INPUT, throwAt: true, aimX: me.x + 10, aimY: me.y + 4 };
    const x0 = me.x;
    const y0 = me.y;
    step(s, go);
    const pr = s.projectiles.find((p) => p.field)!;
    expect(pr).toBeTruthy();
    expect(me.superCharge).toBe(0);
    expect(me.charging).toBeNull();
    expect(Math.hypot(pr.tx - (x0 + 10), pr.ty - (y0 + 4))).toBeLessThan(0.2);
    const burst = land(s)!;
    expect(burst).toBeTruthy();
    expect(Math.hypot(burst.x - (x0 + 10), burst.y - (y0 + 4))).toBeLessThan(0.2);
  });

  it('has a short range: aimed farther, it comes down at its range on the same line', () => {
    const { s, me } = setup();
    expect(T.range).toBeGreaterThanOrEqual(14);
    expect(T.range).toBeLessThanOrEqual(16);
    throwAt(s, me.x + 40, me.y);
    const pr = s.projectiles.find((p) => p.field)!;
    expect(Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy)).toBeCloseTo(T.range, 1);
    expect(pr.ty).toBeCloseTo(pr.sy, 1);
    // The HUD's preview uses the same rule.
    const at = superThrowTarget(me, me.x + 40, me.y);
    expect(at.x - me.x).toBeCloseTo(T.range, 5);
    expect(Math.hypot(superThrowTarget(me, me.x, me.y).x - me.x, 0)).toBeCloseTo(2, 5);
  });

  it('bursts for modest damage in a small radius, never hurting the thrower, and leaves the slow field', () => {
    const { s, me } = setup();
    const at = { x: me.x + 10, y: me.y };
    const [, centre, edge, out] = s.players;
    Object.assign(centre, { x: at.x, y: at.y });
    Object.assign(edge, { x: at.x, y: at.y + T.burst - 0.5 });
    Object.assign(out, { x: at.x, y: at.y + T.burst + 2 });
    throwAt(s, at.x, at.y);
    land(s);
    expect(centre.maxHp - centre.hp).toBeCloseTo(T.damage, 0);
    expect(edge.maxHp - edge.hp).toBeGreaterThan(0);
    expect(edge.maxHp - edge.hp).toBeLessThan(T.damage * 0.6);
    expect(out.hp).toBe(out.maxHp);
    expect(me.hp).toBe(me.maxHp);
    expect(centre.lastHitWith).toBe('super');
    expect(s.fields).toHaveLength(1);
    expect(s.fields[0]).toMatchObject({ r: T.radius, owner: 0 });
    // Inside the field (4 m) slowed; outside it (5 m out) and the thrower not.
    step(s, idle());
    expect(centre.slowed).toBeGreaterThan(0);
    expect(edge.slowed).toBeGreaterThan(0);
    expect(out.slowed).toBe(0);
    expect(me.slowed).toBe(0);
  });

  it('slows enemies in the field for its life, then the field is gone', () => {
    const { s, me } = setup();
    const at = { x: me.x + 8, y: me.y };
    const foe = s.players[1];
    Object.assign(foe, { x: at.x + 2, y: at.y });
    throwAt(s, at.x, at.y);
    land(s);
    const walk = idle();
    walk[1] = { ...NO_INPUT, mx: 0, my: 1, aimX: foe.x, aimY: foe.y + 5 };
    for (let i = 0; i < 30; i++) step(s, walk);
    const slowSpeed = Math.hypot(foe.vx, foe.vy);
    expect(foe.slowed).toBeGreaterThan(0);
    for (let i = 0; i < (T.life + 1) / DT; i++) step(s, idle());
    expect(s.fields).toHaveLength(0);
    Object.assign(foe, { x: OPEN.x + 40, y: OPEN.y });
    for (let i = 0; i < 60; i++) step(s, walk);
    expect(slowSpeed).toBeLessThan(Math.hypot(foe.vx, foe.vy) * (T.slow + 0.1));
  });

  it('is deterministic: the same throw gives the same match', () => {
    const run = () => {
      const { s, me } = setup(3);
      Object.assign(s.players[1], { x: me.x + 9, y: me.y + 1 });
      throwAt(s, me.x + 9, me.y + 1);
      for (let i = 0; i < 4 / DT; i++) step(s, idle());
      return JSON.stringify({ players: s.players.map((p) => [p.x, p.y, p.hp, p.slowed]), fields: s.fields, tick: s.tick });
    };
    expect(run()).toBe(run());
  });

  it('bots throw it at a nearby enemy they fight, in range, and it comes down on them', () => {
    // Not every bot picks a fight at once (some personalities move on); those that do throw it within a few ticks.
    let thrown = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { s } = setup(seed);
      const id = 1;
      const bot = createBot(id, seed * 7 + id);
      const me = s.players[id];
      const them = s.players[0];
      s.players.filter((p) => p.id > 1).forEach((p) => (p.alive = false));
      s.tick += 60 * 20;
      s.zone.phase = 3;
      Object.assign(me, { fighter: 'standup', x: OPEN.x, y: OPEN.y, heading: 0, superCharge: 1, weapon: 'pistol', mag: 12, ammo: 24 });
      Object.assign(them, { x: OPEN.x + 9, y: OPEN.y, superCharge: 0 });
      for (let i = 0; i < 60 * 4; i++) {
        const inputs = idle();
        inputs[id] = bot(s);
        step(s, inputs);
        const pr = s.projectiles.find((p) => p.field && p.owner === id);
        if (pr) {
          thrown++;
          expect(Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy)).toBeLessThanOrEqual(T.range + 1e-6);
          expect(Math.hypot(pr.tx - them.x, pr.ty - them.y)).toBeLessThan(T.radius);
          break;
        }
      }
    }
    expect(thrown).toBeGreaterThanOrEqual(2);
  });
});
