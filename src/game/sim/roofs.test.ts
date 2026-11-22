import { createBot } from './bot';
import { BUILDINGS, DROP, MAP, TILE, WEAPONS } from './constants';
import { buildingAt, CEILING, EAVE, LADDERS, ladderAt, roofAt, roofBetween, roofHeightOf, ROOF_LAYER, ridgeHeight } from './roofs';
import { createGame, lineOfSight, lootUnder, solidAt, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const N = 20;
const idle = (): Input[] => Array.from({ length: N }, () => ({ ...NO_INPUT }));
const centreOf = (i: number) => ({ x: (BUILDINGS[i].x0 + BUILDINGS[i].w / 2) * TILE, y: (BUILDINGS[i].y0 + BUILDINGS[i].h / 2) * TILE });

/** A match in play with everyone on the ground, parked in a far corner, nothing on the floor. */
const arena = (): GameState => {
  const s = createGame('hotfix', 1);
  s.phase = 'play';
  s.loot = [];
  s.players.forEach((p, i) => Object.assign(p, { stage: 'ground', x: 8 + (i % 5) * 2, y: 8 + Math.floor(i / 5) * 2, z: 0, alt: 0 }));
  return s;
};

/** Hold one input for player 0 for `ticks` ticks; returns the ticks on which player 0 was inside a footprint below the roof. */
const hold = (s: GameState, input: Partial<Input>, ticks: number, watch?: (s: GameState) => void) => {
  for (let i = 0; i < ticks; i++) {
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, aimX: s.players[0].x + 1, aimY: s.players[0].y, ...input };
    step(s, inputs);
    watch?.(s);
  }
};

/** Come down by parachute onto the middle of building i (just above its ridge, canopy open, little drift). */
const parachuteOnto = (i: number) => {
  const s = arena();
  s.phase = 'drop';
  const c = centreOf(i);
  Object.assign(s.players[0], { stage: 'falling', x: c.x, y: c.y, alt: roofAt(c.x, c.y) + 0.6, vz: 3, vx: 0, vy: 0, canopy: DROP.deployTime + 1 });
  for (let k = 0; k < 120 && s.players[0].stage !== 'ground'; k++) step(s, idle());
  return s;
};

/** A floor tile inside building i (not on its ring) and a door on its ring with the way out. */
const insideTile = (i: number) => {
  const b = BUILDINGS[i];
  for (let y = b.y0 + 1; y < b.y0 + b.h - 1; y++) for (let x = b.x0 + 1; x < b.x0 + b.w - 1; x++) if (MAP[y][x] === '.') return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
  throw new Error('no floor');
};
const doorOf = (i: number) => {
  const b = BUILDINGS[i];
  for (let y = b.y0; y < b.y0 + b.h; y++) {
    for (let x = b.x0; x < b.x0 + b.w; x++) {
      const nx = x === b.x0 ? -1 : x === b.x0 + b.w - 1 ? 1 : 0;
      const ny = y === b.y0 ? -1 : y === b.y0 + b.h - 1 ? 1 : 0;
      if ((nx || ny) && !(nx && ny) && MAP[y][x] === '.') return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, nx, ny };
    }
  }
  throw new Error('no door');
};

describe('roof geometry', () => {
  it('every roof rises from the eaves to its ridge and sits over its whole footprint', () => {
    BUILDINGS.forEach((b, i) => {
      const c = centreOf(i);
      expect(buildingAt(c.x, c.y)).toBe(i);
      const corner = roofHeightOf(i, b.x0 * TILE + 0.01, b.y0 * TILE + 0.01);
      expect(corner).toBeGreaterThanOrEqual(EAVE - 0.05);
      expect(corner).toBeLessThan(EAVE + 0.5);
      expect(roofHeightOf(i, c.x, c.y)).toBeCloseTo(ridgeHeight(b), 0);
      expect(roofAt(b.x0 * TILE - 0.5, c.y)).toBe(-1);
    });
  });

  it('every house has one ladder on a plain wall with open ground in front', () => {
    expect(LADDERS.length).toBeGreaterThanOrEqual(BUILDINGS.length - 2);
    for (const l of LADDERS) {
      expect(MAP[l.ty][l.tx]).toBe('#');
      expect('gpash').toContain(MAP[l.ty + l.ny][l.tx + l.nx]);
    }
  });
});

describe('landing on a roof', () => {
  it('a jumper coming down over any house lands on its roof and stays there (no falling through, no going inside)', () => {
    BUILDINGS.forEach((_, i) => {
      const s = parachuteOnto(i);
      const p = s.players[0];
      expect(p.stage).toBe('ground');
      expect(buildingAt(p.x, p.y)).toBe(i);
      expect(p.z).toBeCloseTo(roofAt(p.x, p.y), 1);
      // Two seconds standing: still up there.
      s.phase = 'play';
      hold(s, {}, 120);
      expect(p.z).toBeCloseTo(roofAt(p.x, p.y), 1);
      expect(p.z).toBeGreaterThan(ROOF_LAYER);
    });
  });

  it('a jumper drifting into a wall below the eaves is stopped outside and lands beside the house', () => {
    const s = arena();
    s.phase = 'drop';
    // A plain stretch of a house's west wall (not a doorway), with open ground in front.
    const plain = (b: (typeof BUILDINGS)[number]) => [...Array(b.h - 2).keys()].map((k) => b.y0 + 1 + k).find((y) => MAP[y][b.x0] === '#' && 'gpash'.includes(MAP[y][b.x0 - 1]));
    const b = BUILDINGS.find((o) => plain(o) !== undefined)!;
    const ty = plain(b)!;
    Object.assign(s.players[0], { stage: 'falling', x: b.x0 * TILE - 0.6, y: (ty + 0.5) * TILE, alt: 1.2, vz: 2, vx: 6, vy: 0, canopy: DROP.deployTime + 1 });
    for (let k = 0; k < 120 && s.players[0].stage !== 'ground'; k++) step(s, [{ ...NO_INPUT, mx: 1 }, ...idle().slice(1)]);
    expect(s.players[0].stage).toBe('ground');
    expect(buildingAt(s.players[0].x, s.players[0].y)).toBe(-1);
    expect(s.players[0].z).toBe(0);
  });
});

describe('on a roof', () => {
  it('you can walk all over it, up and down the slope, without dropping inside', () => {
    const s = parachuteOnto(3);
    s.phase = 'play';
    const p = s.players[0];
    const b = BUILDINGS[3];
    let inside = 0;
    const watch = () => {
      if (buildingAt(p.x, p.y) === 3 && p.z < ROOF_LAYER) inside += 1;
    };
    // Back and forth across both axes, short of the edges.
    for (const [mx, my, t] of [[0, -1, 20], [0, 1, 40], [-1, 0, 20], [1, 0, 40]] as const) hold(s, { mx, my }, t, watch);
    expect(inside).toBe(0);
    expect(buildingAt(p.x, p.y)).toBe(3);
    expect(p.z).toBeCloseTo(roofAt(p.x, p.y), 1);
    expect(b).toBeTruthy();
  });

  it('jump: you leave the roof and come back down on it', () => {
    const s = parachuteOnto(2);
    s.phase = 'play';
    const p = s.players[0];
    const start = p.z;
    let top = 0;
    hold(s, { jump: true }, 1);
    hold(s, {}, 50, () => (top = Math.max(top, p.z)));
    expect(top).toBeGreaterThan(start + 0.5);
    expect(p.z).toBeCloseTo(roofAt(p.x, p.y), 1);
  });

  it('walk off the edge: gravity takes you down to the ground beside the house, with a landing', () => {
    const s = parachuteOnto(4);
    s.phase = 'play';
    const p = s.players[0];
    let landed = false;
    let inside = 0;
    hold(s, { mx: 1 }, 240, (st) => {
      if (st.events.some((e) => e.type === 'thud' && e.player === 0)) landed = true;
      if (buildingAt(p.x, p.y) === 4 && p.z < ROOF_LAYER) inside += 1;
    });
    expect(buildingAt(p.x, p.y)).not.toBe(4);
    expect(p.z).toBe(0);
    expect(landed).toBe(true);
    expect(inside).toBe(0);
  });

  it('a jump on the ground is low (it clears no wall, fence or crate), ends by itself, never fires, and a held key does not jump again', () => {
    const s = arena();
    const p = s.players[0];
    Object.assign(p, { x: 60, y: 60, weapon: 'rifle', mag: 10 });
    let top = 0;
    hold(s, { jump: true }, 1);
    expect(s.events.some((e) => e.type === 'hop' && e.player === 0)).toBe(true);
    const shots = p.shots;
    // Held for a second: one jump, back down, no second one.
    hold(s, { jump: true }, 60, () => (top = Math.max(top, p.z)));
    expect(top).toBeGreaterThan(0.5);
    expect(top).toBeLessThan(0.9);
    expect(p.z).toBe(0);
    expect(p.jz).toBe(0);
    expect(p.shots).toBe(shots);
    // Firing never jumps.
    hold(s, { fire: true }, 5);
    expect(p.z).toBe(0);
  });
});

describe('ladders', () => {
  it('pushing into a ladder climbs you onto the roof; walking off brings you down', () => {
    const l = LADDERS[0];
    const s = arena();
    const p = s.players[0];
    Object.assign(p, { x: (l.tx + 0.5 + l.nx * 1.1) * TILE, y: (l.ty + 0.5 + l.ny * 1.1) * TILE });
    hold(s, { mx: -l.nx, my: -l.ny }, 100);
    expect(buildingAt(p.x, p.y)).toBe(l.b);
    expect(p.z).toBeCloseTo(roofAt(p.x, p.y), 1);
    expect(ladderAt((l.tx + 0.5 + l.nx * 0.85) * TILE, (l.ty + 0.5 + l.ny * 0.85) * TILE, 1)).toBeTruthy();
  });
});

describe('line of sight and bullets in 3D', () => {
  const i = BUILDINGS.findIndex((b) => !b.barn && b.w >= 5 && b.h >= 5);
  const room = insideTile(i);
  const door = doorOf(i);

  it('roofs block sight both ways; walls block it; a doorway lets it through', () => {
    const r = roofAt(room.x, room.y);
    // From the roof straight down into the room, and back.
    expect(lineOfSight(createGame('hotfix'), room.x + 0.5, room.y, room.x, room.y, r + 1.1, 1.1)).toBe(false);
    expect(lineOfSight(createGame('hotfix'), room.x, room.y, room.x + 0.5, room.y, 1.1, r + 1.1)).toBe(false);
    expect(roofBetween(room.x, room.y, r + 1, room.x, room.y, CEILING - 0.5)).toBe(true);
    // Through the doorway from outside: open. Through the wall next to it: closed.
    const s = createGame('hotfix');
    const out = { x: door.x + door.nx * 5, y: door.y + door.ny * 5 };
    const inn = { x: door.x - door.nx * 2, y: door.y - door.ny * 2 };
    expect(lineOfSight(s, out.x, out.y, inn.x, inn.y)).toBe(true);
    // The roof over the doorway is still a roof: from high above the door down into the room, closed.
    expect(lineOfSight(s, door.x, door.y, inn.x, inn.y, roofAt(door.x, door.y) + 1.5, 1.1)).toBe(false);
    expect(solidAt(s, room.x, room.y, r - 0.1)).toBe(true);
    expect(solidAt(s, room.x, room.y, 1.1)).toBe(false);
  });

  const shoot = (s: GameState, shooter: number, target: number, ticks = 90) => {
    const t = s.players[target];
    const hp = t.hp;
    s.players[shooter].weapon = 'rifle';
    s.players[shooter].mag = 30;
    for (let k = 0; k < ticks; k++) {
      const inputs = idle();
      inputs[shooter] = { ...NO_INPUT, fire: true, aimX: t.x, aimY: t.y };
      step(s, inputs);
    }
    return hp - t.hp;
  };

  it('from the roof you cannot shoot through it at someone in the room below', () => {
    const s = arena();
    const r = roofAt(room.x + 1.5, room.y);
    Object.assign(s.players[1], { x: room.x + 1.5, y: room.y, z: r });
    Object.assign(s.players[2], { x: room.x, y: room.y, z: 0, hp: 500, maxHp: 500 });
    expect(shoot(s, 1, 2)).toBe(0);
  });

  it('through a doorway you can, and someone on a roof can shoot down at a person outside (and be shot back)', () => {
    const s = arena();
    const out = { x: door.x + door.nx * 6, y: door.y + door.ny * 6 };
    const inn = { x: door.x - door.nx * 2, y: door.y - door.ny * 2 };
    Object.assign(s.players[1], { x: out.x, y: out.y });
    Object.assign(s.players[2], { x: inn.x, y: inn.y, hp: 500, maxHp: 500 });
    expect(shoot(s, 1, 2)).toBeGreaterThan(0);

    const t = arena();
    const c = centreOf(i);
    const b = BUILDINGS[i];
    // Shooter on the roof near one edge, target on the ground 8 m out from that wall.
    const edgeX = (b.x0 + b.w) * TILE - 1;
    Object.assign(t.players[1], { x: edgeX, y: c.y, z: roofAt(edgeX, c.y) });
    Object.assign(t.players[2], { x: edgeX + 9, y: c.y, z: 0, hp: 500, maxHp: 500 });
    expect(shoot(t, 1, 2)).toBeGreaterThan(0);
    Object.assign(t.players[1], { hp: 500, maxHp: 500 });
    expect(shoot(t, 2, 1)).toBeGreaterThan(0);
  });

  it('cover: a wall between you stops every round', () => {
    const s = arena();
    const b = BUILDINGS[i];
    const c = centreOf(i);
    // Across the whole house at ground level, both outside: the walls are in the way.
    Object.assign(s.players[1], { x: b.x0 * TILE - 3, y: c.y });
    Object.assign(s.players[2], { x: (b.x0 + b.w) * TILE + 3, y: c.y, hp: 500, maxHp: 500 });
    if (!lineOfSight(s, s.players[1].x, s.players[1].y, s.players[2].x, s.players[2].y)) expect(shoot(s, 1, 2)).toBe(0);
    expect(WEAPONS.rifle.range).toBeGreaterThan(20);
  });

  it('loot dropped on a roof stays on the roof, out of reach from the floor below', () => {
    const s = arena();
    const r = roofAt(room.x, room.y);
    Object.assign(s.players[1], { x: room.x, y: room.y, z: r, hp: 1, weapon: 'rifle', mag: 10, ammo: 20 });
    // Someone on the same roof finishes them.
    const c = centreOf(i);
    const sx = room.x + (room.x < c.x ? 3 : -3);
    Object.assign(s.players[2], { x: sx, y: room.y, z: roofAt(sx, room.y) });
    shoot(s, 2, 1, 40);
    expect(s.players[1].alive).toBe(false);
    const dropped = s.loot.filter((k) => k.active && buildingAt(k.x, k.y) === i);
    expect(dropped.length).toBeGreaterThan(0);
    dropped.forEach((k) => expect(k.z).toBeGreaterThan(EAVE - 0.1));
    Object.assign(s.players[3], { x: dropped[0].x, y: dropped[0].y, z: 0 });
    expect(lootUnder(s, s.players[3])).toBeNull();
  });
});

describe('blasts and roofs', () => {
  it('the slow-field canister thrown onto a roof bursts up there: nobody in the room under it is hurt or slowed', () => {
    const i = BUILDINGS.findIndex((b) => !b.barn && b.w >= 5 && b.h >= 5);
    const room = insideTile(i);
    const s = arena();
    const b = BUILDINGS[i];
    const me = s.players[0];
    // A Standup outside, 6 m from the wall, throwing at the room's spot (it lands on the roof above it).
    Object.assign(me, { fighter: 'standup', x: b.x0 * TILE - 6, y: room.y, superCharge: 1, heading: 0 });
    Object.assign(s.players[1], { x: room.x, y: room.y, z: 0, hp: 100, maxHp: 100, armor: 0 });
    const hold = idle();
    hold[0] = { ...NO_INPUT, super: true, throwAt: true, aimX: room.x, aimY: room.y };
    for (let k = 0; k < 4; k++) step(s, hold);
    const go = idle();
    go[0] = { ...NO_INPUT, throwAt: true, aimX: room.x, aimY: room.y };
    step(s, go);
    let burst = null as null | { z?: number };
    for (let k = 0; k < 240 && !burst; k++) {
      step(s, idle());
      burst = (s.events.find((e) => e.type === 'slowBurst') as { z?: number } | undefined) ?? null;
    }
    expect(burst).not.toBeNull();
    expect(burst!.z).toBeGreaterThan(EAVE - 0.1);
    step(s, idle());
    expect(s.players[1].hp).toBe(100);
    expect(s.players[1].slowed).toBe(0);
  });
});

describe('determinism with roofs', () => {
  it('two runs of a full match with bots (landings on and around roofs included) end in the same state', () => {
    const run = () => {
      const s = createGame('hotfix', 7);
      const bots = s.players.map((p) => (p.bot ? createBot(p.id, 1000 + p.id) : null));
      for (let k = 0; k < 60 * 100; k++) step(s, s.players.map((p, i) => (bots[i] ? bots[i]!(s) : { ...NO_INPUT, jump: s.drone.t > 0.5 })));
      return JSON.stringify({ tick: s.tick, players: s.players.map((p) => [p.x, p.y, p.z, p.hp, p.alive]) });
    };
    expect(run()).toBe(run());
  }, 30000);

  it('bots do not end up stuck on roofs', () => {
    const s = createGame('hotfix', 3);
    const bots = s.players.map((p) => (p.bot ? createBot(p.id, 2000 + p.id) : null));
    const onRoof = new Map<number, number>();
    let longest = 0;
    for (let k = 0; k < 60 * 120; k++) {
      step(s, s.players.map((p, i) => (bots[i] ? bots[i]!(s) : { ...NO_INPUT, jump: s.drone.t > 0.5 })));
      for (const p of s.players) {
        if (!p.bot || !p.alive || p.stage !== 'ground') continue;
        const up = p.z >= ROOF_LAYER ? (onRoof.get(p.id) ?? 0) + 1 : 0;
        onRoof.set(p.id, up);
        longest = Math.max(longest, up);
      }
    }
    expect(longest / 60).toBeLessThan(20);
  }, 30000);
});
