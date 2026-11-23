import { CROUCH, DROP, MAP, PROPS, ROCK_TOP, SIZE, TILE, WEAPONS, WORLD } from './constants';
import { CONTAINER, HQ, PROP_SOLIDS, propTopAt } from './propSolids';
import { canSee, chestHeight, createGame, solidAt, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const N = 20;
const idle = (): Input[] => Array.from({ length: N }, () => ({ ...NO_INPUT }));

/** A match in play with everyone on the ground, parked in a far corner, nothing on the floor. */
const arena = (): GameState => {
  const s = createGame('hotfix', 1);
  s.phase = 'play';
  s.loot = [];
  s.players.forEach((p, i) => Object.assign(p, { stage: 'ground', x: 8 + (i % 5) * 2, y: 8 + Math.floor(i / 5) * 2, z: 0, alt: 0 }));
  return s;
};

const hold = (s: GameState, input: Partial<Input>, ticks: number) => {
  for (let i = 0; i < ticks; i++) {
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, aimX: s.players[0].x + 1, aimY: s.players[0].y, ...input };
    step(s, inputs);
  }
};

/** A rock tile with open grass three tiles out on both sides along x. */
const openRock = () => {
  for (let ty = 10; ty < SIZE - 10; ty++) {
    for (let tx = 10; tx < SIZE - 10; tx++) {
      if (MAP[ty][tx] !== 'k') continue;
      const row = MAP[ty].slice(tx - 4, tx + 5);
      if (/^[gp]{4}k[gp]{4}$/.test(row) && /^[gp]{9}$/.test(MAP[ty - 1].slice(tx - 4, tx + 5)) && /^[gp]{9}$/.test(MAP[ty + 1].slice(tx - 4, tx + 5))) return { tx, ty };
    }
  }
  throw new Error('no open rock');
};

describe('rounds and low cover', () => {
  it('a chest-high round flies over a knee-high rock; a crouched chest behind it is covered', () => {
    const { tx, ty } = openRock();
    const y = (ty + 0.5) * TILE;
    const rockX = (tx + 0.5) * TILE;
    expect(solidAt(createGame('hotfix', 1), rockX, y, 1.1)).toBe(false);
    expect(solidAt(createGame('hotfix', 1), rockX, y, ROCK_TOP - 0.2)).toBe(true);

    const s = arena();
    const me = s.players[0];
    const them = s.players[1];
    Object.assign(me, { x: rockX - 7, y, weapon: 'rifle', mag: 30, ammo: 0, heading: 0 });
    Object.assign(them, { x: rockX + 1.6, y, hp: 100, armor: 0 });
    // Standing: shot over the rock.
    for (let i = 0; i < 40 && them.hp === 100; i++) {
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, aimX: them.x, aimY: them.y };
      step(s, inputs);
    }
    expect(them.hp).toBeLessThan(100);
    // Crouched behind it: the rounds aimed at the chest meet the rock.
    Object.assign(them, { hp: 100, crouch: 1 });
    expect(chestHeight(them)).toBeCloseTo(1.1 - CROUCH.drop, 5);
    let hit = false;
    for (let i = 0; i < 60; i++) {
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, aimX: them.x, aimY: them.y };
      inputs[1] = { ...NO_INPUT, crouch: true, aimX: them.x - 1, aimY: them.y };
      step(s, inputs);
      hit ||= them.hp < 100;
    }
    expect(hit).toBe(false);
  });

  it('long guns reach across the map: a sniper round is not dropped short of a target you can see', () => {
    expect(WEAPONS.sniper.range).toBeGreaterThanOrEqual(Math.hypot(WORLD, WORLD) - 1);
    expect(WEAPONS.rifle.range).toBeGreaterThanOrEqual(200);
  });

  it('a leaned shot leaves from the shoulder and still lands on the aim point', () => {
    const s = arena();
    const me = s.players[0];
    const { tx, ty } = openRock();
    const y = (ty + 0.5) * TILE;
    Object.assign(me, { x: (tx - 3) * TILE, y, weapon: 'pistol', mag: 12, ammo: 0, heading: 0, lean: 1 });
    const aim = { x: me.x + 30, y };
    let pr = s.projectiles.find((p) => p.owner === 0);
    for (let i = 0; i < 60 && !pr; i++) {
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, lean: 1, aimX: aim.x, aimY: aim.y };
      step(s, inputs);
      pr = s.projectiles.find((p) => p.owner === 0);
    }
    if (!pr) throw new Error('no round');
    expect(pr).toBeTruthy();
    // Out to the right of the body (y + on this map, facing +x)...
    expect(pr.sy - me.y).toBeGreaterThan(0.3);
    // ...and on a line through the aim point (within the pistol's spread).
    const ang = Math.atan2(pr.vy, pr.vx);
    const toAim = Math.atan2(aim.y - pr.sy, aim.x - pr.sx);
    expect(Math.abs(ang - toAim)).toBeLessThan(WEAPONS.pistol.spread / 2 + 1e-6);
  });
});

describe('crouching', () => {
  it('G crouches you: slower, lower, and a hop or a roll stands you up', () => {
    const s = arena();
    const me = s.players[0];
    Object.assign(me, { x: 40, y: 12 });
    hold(s, { crouch: true }, 30);
    expect(me.crouch).toBe(1);
    hold(s, { crouch: true, mx: 1 }, 60);
    const v = Math.hypot(me.vx, me.vy);
    const s2 = arena();
    Object.assign(s2.players[0], { x: 40, y: 12 });
    hold(s2, { mx: 1 }, 60);
    expect(v).toBeLessThan(Math.hypot(s2.players[0].vx, s2.players[0].vy) * (CROUCH.speed + 0.05));
    hold(s, { crouch: false }, 30);
    expect(me.crouch).toBe(0);
  });
});

describe('tall grass is tactical cover', () => {
  it('a few hundred tiles in patches, none in the towns, and every quarter keeps some', () => {
    let n = 0;
    const q = [0, 0, 0, 0];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (MAP[y][x] === 'h') {
      n++;
      q[(x < SIZE / 2 ? 0 : 1) + (y < SIZE / 2 ? 0 : 2)]++;
      expect(x >= 44 && x <= 79 && y >= 42 && y <= 79, `Old Town ${x},${y}`).toBe(false);
    }
    expect(n).toBeGreaterThanOrEqual(220);
    expect(n).toBeLessThanOrEqual(320);
    for (const k of q) expect(k).toBeGreaterThanOrEqual(12);
  });

  it('hides a crouched body, not a standing one', () => {
    const s = arena();
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y < SIZE && !spot; y++) for (let x = 0; x < SIZE && !spot; x++) if (MAP[y][x] === 'h') spot = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    const [a, b] = s.players;
    Object.assign(b, { x: spot!.x, y: spot!.y, revealed: 0, crouch: 0 });
    Object.assign(a, { x: spot!.x + 8, y: spot!.y });
    expect(canSee(s, a, b)).toBe(true);
    b.crouch = 1;
    expect(canSee(s, a, b)).toBe(false);
  });
});

describe('big props are as big as they look', () => {
  it('a container stops you at its painted side, not 0.8 m out from it', () => {
    const i = PROPS.findIndex((p) => p.kind === 'container' && p.seed <= 0.6);
    const sol = PROP_SOLIDS[i];
    expect(sol.y1 - sol.y0).toBeLessThan(CONTAINER.width + 0.2);
    const cx = (sol.x0 + sol.x1) / 2;
    // Just outside its long side, within the old 4 m footprint: open now.
    const s = createGame('hotfix', 1);
    expect(solidAt(s, cx, sol.y1 + 0.3, 1.1)).toBe(false);
    expect(solidAt(s, cx, sol.y1 - 0.3, 1.1)).toBe(true);
  });

  it('coming down onto the HQ block you land on its roof, never inside it', () => {
    const hq = PROPS.find((p) => p.kind === 'hq')!;
    const c = { x: (hq.x0 + hq.w / 2) * TILE, y: (hq.y0 + hq.h / 2) * TILE };
    expect(propTopAt(c.x, c.y)).toBe(HQ.top);
    const s = arena();
    s.phase = 'drop';
    const me = s.players[0];
    Object.assign(me, { stage: 'falling', x: c.x, y: c.y, alt: HQ.top + 6, vz: 3, vx: 0, vy: 0, canopy: DROP.deployTime + 1 });
    for (let k = 0; k < 600 && me.stage !== 'ground'; k++) step(s, idle());
    expect(me.stage).toBe('ground');
    expect(me.z).toBeCloseTo(HQ.top, 3);
    // Standing up there, then walking off the edge: down to the ground.
    hold(s, { mx: 1 }, 240);
    expect(me.z).toBe(0);
    expect(me.x).toBeGreaterThan(c.x + HQ.size / 2);
  });

  it('a body on the ground is stopped by the HQ walls all the way up', () => {
    const hq = PROPS.find((p) => p.kind === 'hq')!;
    const s = createGame('hotfix', 1);
    const c = { x: (hq.x0 + hq.w / 2) * TILE, y: (hq.y0 + hq.h / 2) * TILE };
    for (const h of [1.1, 5, 12]) expect(solidAt(s, c.x, c.y, h)).toBe(true);
    expect(solidAt(s, c.x, c.y, HQ.top + 1)).toBe(false);
  });
});
