import { createBot } from './bot';
import { BUILDINGS, DROP, DT, FIGHTERS, ITEMS, MAP, PLAYER_RADIUS, PROPS, RIVER, riverCentre, SHAPES, SIZE, SWIM, TILE, treeSpot, WEAPONS, WORLD, ZONE_EDGE_SPEED, ZONE_PHASES, ZONE_RULES, ZONE_START_RADIUS } from './constants';
import { canSee, circleBlocked, createGame, falloffDamage, hitPoint, inPlant, inWater, lootUnder, muzzleOf, shotObstruction, solidAt, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const idle = (): Input[] => Array.from({ length: 10 }, () => ({ ...NO_INPUT }));

/** Land everyone at once: skip the drop. */
const landed = (seed = 1): GameState => {
  const s = createGame('hotfix', seed);
  for (let i = 0; i < 60 * 60 && s.phase === 'drop'; i++) step(s, idle());
  return s;
};

/** The middle of a stretch of open meadow 30 tiles long: nothing to hit for a while. */
const OPEN = (() => {
  for (let y = 6; y < MAP.length - 6; y++) {
    const x = MAP[y].indexOf('g'.repeat(30));
    if (x >= 0) return { x: x * TILE + 4, y: y * TILE + TILE / 2 };
  }
  throw new Error('no meadow');
})();

const place = (s: GameState, id: number, x: number, y: number) => Object.assign(s.players[id], { x, y });
/** Empty the floor and send everyone else away, so only player 0 is near the test loot. */
const clearAround = (s: GameState) => {
  s.loot = [];
  s.racks.fill(0);
  s.players.slice(1).forEach((p) => Object.assign(p, { x: 6, y: 6 }));
};

describe('the map', () => {
  it('is 64 x 64 tiles, ringed by trees, mostly green, with a town, farms, a forest and a quarry', () => {
    expect(MAP).toHaveLength(SIZE);
    MAP.forEach((row) => expect(row).toHaveLength(SIZE));
    expect(MAP[0]).toBe('t'.repeat(SIZE));
    const all = MAP.join('');
    for (const c of ['#', 'w', '.', 'f', 't', 'k', 'r', 'b', 'c', 'l', 'p', 'a']) expect(all.includes(c)).toBe(true);
    const grassy = [...all].filter((c) => 'gpbct'.includes(c)).length / all.length;
    expect(grassy).toBeGreaterThan(0.6);
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(BUILDINGS.map((b) => `${b.w}x${b.h}`)).size).toBeGreaterThan(5);
  });

  it('windows and fences stop you but not bullets', () => {
    const s = createGame('hotfix', 1);
    const at = (c: string) => {
      const ty = MAP.findIndex((row) => row.includes(c));
      return { x: MAP[ty].indexOf(c) * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    };
    for (const c of ['w', 'f']) {
      const p = at(c);
      expect(circleBlocked(s, p.x, p.y, 0.5)).toBe(true);
      expect(solidAt(s, p.x, p.y)).toBe(false);
    }
    const t = at('t');
    const trunk = treeSpot(Math.floor(t.x / TILE), Math.floor(t.y / TILE));
    expect(solidAt(s, trunk.x, trunk.y)).toBe(true);
  });

  it('you bump into trunks and rocks, not the whole tile around them', () => {
    const s = createGame('hotfix', 1);
    // A lone tree or rock out in the fields, with open grass all around it.
    const lone = (c: string) => {
      for (let ty = 4; ty < SIZE - 4; ty++) {
        for (let tx = 4; tx < SIZE - 4; tx++) {
          if (MAP[ty][tx] !== c) continue;
          let open = true;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && MAP[ty + j][tx + i] !== 'g') open = false;
          if (open) return { tx, ty };
        }
      }
      throw new Error(`no lone ${c}`);
    };
    const tree = lone('t');
    const trunk = treeSpot(tree.tx, tree.ty);
    expect(circleBlocked(s, trunk.x, trunk.y, PLAYER_RADIUS)).toBe(true);
    // Standing 1.1 m from the trunk's centre is free: the old tile collision stopped you there.
    expect(circleBlocked(s, trunk.x + SHAPES.trunk + PLAYER_RADIUS + 0.1, trunk.y, PLAYER_RADIUS)).toBe(false);
    const rock = lone('k');
    const rx = rock.tx * TILE + TILE / 2;
    const ry = rock.ty * TILE + TILE / 2;
    expect(circleBlocked(s, rx + 1.2, ry, PLAYER_RADIUS)).toBe(true);
    // A tile corner touched the old box; the round rock leaves it free.
    expect(circleBlocked(s, rx + 1.25, ry + 1.25, PLAYER_RADIUS)).toBe(false);
  });

  it('furniture never cuts off a room: every open tile of a building is reachable from its doors', () => {
    let pieces = 0;
    for (const b of BUILDINGS) {
      const inside = (x: number, y: number) => x >= b.x0 && y >= b.y0 && x < b.x0 + b.w && y < b.y0 + b.h;
      const open = (x: number, y: number) => '.l'.includes(MAP[y][x]);
      const ring = (x: number, y: number) => x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
      const cells: [number, number][] = [];
      for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) {
        if (open(x, y)) cells.push([x, y]);
        if (MAP[y][x] === 'u') pieces += 1;
      }
      const door = cells.find(([x, y]) => ring(x, y));
      expect(door).toBeDefined();
      const seen = new Set([door!.join()]);
      const queue = [door!];
      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n: [number, number] = [x + dx, y + dy];
          if (inside(...n) && open(...n) && !seen.has(n.join())) {
            seen.add(n.join());
            queue.push(n);
          }
        }
      }
      expect(cells.every((c) => seen.has(c.join()))).toBe(true);
    }
    expect(pieces).toBeGreaterThan(30);
  });

  it('every door opens onto open ground and leads straight inside', () => {
    for (const b of BUILDINGS) {
      for (let y = b.y0; y < b.y0 + b.h; y++) {
        for (let x = b.x0; x < b.x0 + b.w; x++) {
          const ring = x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
          if (!ring || MAP[y][x] !== '.') continue;
          const ox = x === b.x0 ? -1 : x === b.x0 + b.w - 1 ? 1 : 0;
          const oy = y === b.y0 ? -1 : y === b.y0 + b.h - 1 ? 1 : 0;
          // Right outside: open ground. One step further may be a neighbour's wall (a 2 m alley), never clutter.
          expect('ftkr#w'.includes(MAP[y + oy]?.[x + ox] ?? 'g')).toBe(false);
          expect('ftkr'.includes(MAP[y + oy * 2]?.[x + ox * 2] ?? 'g')).toBe(false);
          expect(MAP[y - oy][x - ox]).not.toBe('r');
        }
      }
    }
  });

  it('nobody walks out through the tree line at the edge', () => {
    const s = createGame('hotfix', 1);
    expect(circleBlocked(s, 3, WORLD / 2, PLAYER_RADIUS)).toBe(true);
    expect(circleBlocked(s, WORLD - 3, WORLD / 2, PLAYER_RADIUS)).toBe(true);
  });

  it('starts with loot on the ground and the same map every match', () => {
    const a = createGame('hotfix', 1);
    const b = createGame('legacy', 99);
    expect(a.loot.length).toBeGreaterThan(30);
    expect(a.racks).toEqual(b.racks);
  });
});

describe('the drop', () => {
  it('everyone rides the drone, jumps, glides and lands on open ground', () => {
    const s = createGame('hotfix', 5);
    expect(s.players.every((p) => p.stage === 'drone')).toBe(true);
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, jump: true };
    for (let i = 0; i < 60 * 4 && s.drone.t < 0.3; i++) step(s, inputs);
    expect(s.players[0].stage).not.toBe('drone');
    for (let i = 0; i < 60 * (DROP.flight + DROP.glide + 1); i++) step(s, idle());
    expect(s.players.every((p) => p.stage === 'ground')).toBe(true);
    expect(s.phase).toBe('play');
    expect(s.players.every((p) => !solidAt(s, p.x, p.y))).toBe(true);
  });
});

describe('loot and fighting', () => {
  it('you jump with a pistol, a magazine and two spare; with it empty, walking over a gun picks it up', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    expect(p.weapon).toBe('pistol');
    expect(p.mag + p.ammo).toBe(36);
    Object.assign(p, { mag: 0, ammo: 0 });
    s.loot.push({ id: 999, kind: 'rifle', x: p.x + 0.3, y: p.y, ammo: WEAPONS.rifle.ammo, active: true });
    step(s, idle());
    expect(p.weapon).toBe('rifle');
  });

  it('bullets have no range limit, they just hit softer far away; about three hits kill', () => {
    expect(falloffDamage('rifle', 30, 5)).toBe(30);
    expect(falloffDamage('rifle', 30, 80)).toBeCloseTo(30 * WEAPONS.rifle.falloff.min);
    expect(falloffDamage('pistol', 34, 25)).toBeLessThan(34);
    expect(Math.ceil(100 / WEAPONS.pistol.damage)).toBe(3);
    expect(WEAPONS.rifle.range).toBeGreaterThan(100);
  });

  it('a rocket flies straight where you aim, slower than any bullet, and sinks slowly when it goes far', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    s.players.slice(1).forEach((o) => Object.assign(o, { x: 5, y: 5 }));
    Object.assign(p, { weapon: 'rockets', mag: 1, ammo: 0, cooldown: 0, heading: 0, x: OPEN.x, y: OPEN.y });
    const fire = idle();
    fire[0] = { ...NO_INPUT, fire: true, aimX: p.x + 10, aimY: p.y + 0.3 };
    step(s, fire);
    const pr = s.projectiles.find((q) => q.kind === 'rocket' && q.owner === 0)!;
    expect(pr).toBeTruthy();
    expect(Math.atan2(pr.vy, pr.vx)).toBeCloseTo(Math.atan2(0.3, 10), 1); // where you aimed, no throw arc
    expect(Math.hypot(pr.vx, pr.vy)).toBeLessThan(WEAPONS.pistol.speed / 2);
    const h0 = pr.h!;
    for (let i = 0; i < 60; i++) step(s, idle());
    expect(Math.abs(pr.h! - h0)).toBeLessThan(0.3); // level at first
    expect(WEAPONS.rockets.lob).toBeTruthy();
  });

  it('in first person a rocket goes up when you look up, so it lands farther', () => {
    const fly = (pitch: number) => {
      const s = landed();
      clearAround(s);
      s.players.slice(1).forEach((o) => Object.assign(o, { x: 5, y: 5 }));
      const p = s.players[0];
      Object.assign(p, { weapon: 'rockets', mag: 1, ammo: 0, cooldown: 0, heading: 0, x: OPEN.x, y: OPEN.y });
      const fire = idle();
      fire[0] = { ...NO_INPUT, fire: true, pitch, aimX: p.x + 10, aimY: p.y };
      step(s, fire);
      const pr = s.projectiles.find((q) => q.kind === 'rocket')!;
      return pr.vh!;
    };
    expect(fly(0.4)).toBeGreaterThan(5);
    expect(fly(-0.3)).toBeLessThan(0);
  });

  it('5 takes a bomb in hand, the trigger throws it under the cursor (as far as 30 m); F never throws', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    Object.assign(p, { bombs: 1, heading: 0, x: OPEN.x, y: OPEN.y });
    // F with a bomb and nothing to pick up: nothing is thrown.
    const f = idle();
    f[0] = { ...NO_INPUT, use: true, throwAt: true, aimX: p.x + 25, aimY: p.y };
    for (let i = 0; i < 3; i++) step(s, f);
    step(s, idle());
    expect(s.projectiles.some((q) => q.kind === 'lob')).toBe(false);
    expect(p.bombs).toBe(1);
    const five = idle();
    five[0] = { ...NO_INPUT, bomb: true, aimX: p.x + 25, aimY: p.y };
    step(s, five);
    expect(p.item).toBe('bomb');
    const hold = idle();
    hold[0] = { ...NO_INPUT, fire: true, throwAt: true, aimX: p.x + 25, aimY: p.y };
    for (let i = 0; i < 3; i++) step(s, hold);
    expect(p.shots).toBe(0);
    const letGo = idle();
    letGo[0] = { ...NO_INPUT, throwAt: true, aimX: p.x + 25, aimY: p.y };
    step(s, letGo);
    const pr = s.projectiles.find((q) => q.kind === 'lob')!;
    expect(Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy)).toBeCloseTo(25, 0);
    expect(ITEMS.bomb.range).toBeGreaterThanOrEqual(30);
    // Back to the gun after the throw.
    expect(p.item).toBeNull();
  });

  it('tall grass hides you like a bush', () => {
    const ty = MAP.findIndex((row) => row.includes('h'));
    expect(ty).toBeGreaterThan(0);
    const tx = MAP[ty].indexOf('h');
    expect(inPlant(tx * TILE + 1, ty * TILE + 1)).toBe(true);
  });

  it('leaning moves the exposed shoulder (and the muzzle) out to the side', () => {
    const s = landed();
    const p = s.players[0];
    p.heading = 0;
    p.lean = 1;
    const h = hitPoint(p);
    expect(h.y - p.y).toBeGreaterThan(0.3);
    expect(Math.abs(h.x - p.x)).toBeLessThan(0.01);
  });

  it('with both slots full, F swaps the gun in your hands for the one on the floor and drops yours', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    Object.assign(p, { weapon: 'smg', mag: 30, ammo: 10, holster: { weapon: 'pistol', rarity: 0, mag: 12, ammo: 0 } });
    s.loot.push({ id: 999, kind: 'sniper', x: p.x, y: p.y, ammo: 8, active: true });
    step(s, idle());
    expect(p.weapon).toBe('smg');
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, use: true };
    step(s, inputs);
    expect(p.weapon).toBe('sniper');
    expect(lootUnder(s, p)?.kind).toBe('smg');
  });

  it('armor soaks damage', () => {
    const s = landed();
    clearAround(s);
    const [a, b] = s.players;
    place(s, 0, 20, 30);
    place(s, 1, 24, 30);
    s.walls = [];
    Object.assign(a, { weapon: 'pistol', mag: 12, ammo: 18 });
    b.armor = 500;
    const hp = b.hp;
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: b.x, aimY: b.y };
    for (let i = 0; i < 20; i++) step(s, inputs);
    if (b.hp < hp) expect(b.armor).toBeLessThan(500);
  });

  it('guns have magazines: an empty magazine reloads from the spare rounds, R reloads early', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    Object.assign(p, { weapon: 'pistol', mag: 1, ammo: 20, cooldown: 0 });
    const fire = idle();
    fire[0] = { ...NO_INPUT, fire: true, aimX: p.x + 5, aimY: p.y };
    step(s, fire);
    expect(p.mag).toBe(0);
    expect(p.reload).toBeGreaterThan(0);
    for (let i = 0; i < 60 * (WEAPONS.pistol.reload + 0.1); i++) step(s, idle());
    expect(p.mag).toBe(12);
    expect(p.ammo).toBe(8);
    p.mag = 5;
    const r = idle();
    r[0] = { ...NO_INPUT, reload: true };
    step(s, r);
    for (let i = 0; i < 60 * (WEAPONS.pistol.reload + 0.1); i++) step(s, idle());
    expect(p.mag).toBe(12);
    expect(p.ammo).toBe(1);
  });

  it('out of rounds the gun stays in your hands and you hit with it; an ammo box refills it', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    Object.assign(p, { weapon: 'sniper', mag: 0, ammo: 0, cooldown: 0 });
    const fire = idle();
    fire[0] = { ...NO_INPUT, fire: true, aimX: p.x + 5, aimY: p.y };
    step(s, fire);
    expect(p.weapon).toBe('sniper');
    expect(s.events.some((e) => e.type === 'shot' && e.weapon === 'fists')).toBe(true);
    s.loot.push({ id: 998, kind: 'ammo', x: p.x, y: p.y, ammo: 0, active: true });
    step(s, idle());
    expect(p.ammo + p.mag).toBe(WEAPONS.sniper.mag * 2);
  });
});

describe('moving among things', () => {
  /** A lone tile of `c` with open grass on the given side and behind it. */
  const findTile = (c: string, test: (tx: number, ty: number) => boolean) => {
    for (let ty = 4; ty < SIZE - 4; ty++) for (let tx = 4; tx < SIZE - 4; tx++) if (MAP[ty][tx] === c && test(tx, ty)) return { tx, ty };
    throw new Error(`no ${c}`);
  };
  const open = (tx: number, ty: number) => 'gp'.includes(MAP[ty][tx]);

  it('running diagonally into a wall slides along it instead of stopping', () => {
    const s = landed();
    clearAround(s);
    // A long straight wall with open ground south of it.
    const w = findTile('#', (tx, ty) => [0, 1, 2, 3].every((i) => MAP[ty][tx + i] === '#' && open(tx + i, ty + 1) && open(tx + i, ty + 2)));
    const p = s.players[0];
    Object.assign(p, { x: w.tx * TILE + 1, y: (w.ty + 1) * TILE + PLAYER_RADIUS + 0.05, vx: 0, vy: 0 });
    const x0 = p.x;
    const go = idle();
    go[0] = { ...NO_INPUT, mx: 1, my: -1, aimX: p.x + 10, aimY: p.y };
    for (let i = 0; i < 30; i++) step(s, go);
    expect(p.x - x0).toBeGreaterThan(1);
  });

  it('Shift rolls about 4 m the way you move, recharges for 3 s, and dodges bullets early on', () => {
    const s = landed();
    clearAround(s);
    const w = findTile('g', (tx, ty) => [0, 1, 2, 3, 4].every((i) => open(tx + i, ty) && open(tx + i, ty - 1) && open(tx + i, ty + 1)));
    const p = s.players[0];
    Object.assign(p, { x: w.tx * TILE + 1, y: w.ty * TILE + 1, vx: 0, vy: 0 });
    const x0 = p.x;
    const roll = idle();
    roll[0] = { ...NO_INPUT, mx: 1, roll: true };
    step(s, roll);
    expect(p.rolling).toBeGreaterThan(0);
    // A bullet straight at you in the first moments of the roll does nothing.
    const hp = p.hp;
    s.projectiles.push({ id: 900, owner: 1, kind: 'bullet', weapon: 'pistol', x: p.x + 1, y: p.y, vx: -30, vy: 0, damage: 34, life: 1, sx: p.x + 1, sy: p.y, tx: 0, ty: 0, t: 0, duration: 0, radius: 0 });
    for (let i = 0; i < 5; i++) step(s, roll);
    expect(p.hp).toBe(hp);
    for (let i = 0; i < 40; i++) step(s, idle());
    expect(p.x - x0).toBeGreaterThan(3.3);
    // Recharging: pressing again does nothing.
    step(s, roll);
    expect(p.rolling).toBe(0);
  });

  it('pushing into a fence climbs over it', () => {
    const s = landed();
    clearAround(s);
    const f = findTile('f', (tx, ty) => MAP[ty][tx - 1] !== 'f' && MAP[ty][tx + 1] !== 'f' ? false : open(tx, ty - 1) && open(tx, ty + 1) && open(tx, ty - 2) && open(tx, ty + 2));
    const p = s.players[0];
    Object.assign(p, { x: f.tx * TILE + 1, y: f.ty * TILE - 0.6, vx: 0, vy: 0 });
    const go = idle();
    go[0] = { ...NO_INPUT, my: 1, aimX: p.x, aimY: p.y + 10 };
    let vaulted = false;
    for (let i = 0; i < 90; i++) {
      step(s, go);
      if (s.events.some((e) => e.type === 'vault')) vaulted = true;
    }
    expect(vaulted).toBe(true);
    expect(p.y).toBeGreaterThan(f.ty * TILE + TILE);
  });
});

describe('the river', () => {
  it('crosses the whole map, twelve metres wide, with five crossings (footbridge, two bridges, the road bridge, the weir) you walk over on a deck', () => {
    for (let x = 2; x < SIZE - 2; x++) {
      const col = MAP.map((row) => row[x]);
      const wet = col.filter((t) => t === 'o' || t === 'd').length;
      expect(wet).toBeGreaterThanOrEqual(6);
    }
    expect(RIVER.bridges).toHaveLength(5);
    for (const [bx, bw] of RIVER.bridges) {
      for (let x = bx; x < bx + bw; x++) expect(MAP.some((row) => row[x] === 'o')).toBe(false); // dry all the way over
      const c = Math.round(riverCentre(bx));
      expect(MAP[c][bx]).toBe('d');
    }
  });

  it('you can swim across it: slower, no shooting, facing where you swim; bullets fly over it', () => {
    const s = createGame('hotfix', 1);
    const p = s.players[0];
    const x = 40;
    const c = riverCentre(x / TILE) * TILE;
    Object.assign(p, { stage: 'ground', alt: 0, x, y: c - RIVER.half * TILE - 1.5, vx: 0, vy: 0, cooldown: 0 });
    s.players.slice(1).forEach((o) => Object.assign(o, { x: 160, y: 20 }));
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, my: 1, fire: true, aimX: p.x, aimY: p.y - 20 };
    let maxSpeed = 0;
    let shotsInWater = 0;
    let wet = 0;
    for (let i = 0; i < 60 * 12 && p.y < c + RIVER.half * TILE + 1; i++) {
      step(s, inputs);
      if (inWater(p.x, p.y)) {
        wet += DT;
        if (wet > 0.3) maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy)); // the run-up speed is lost in a moment
        shotsInWater += s.events.filter((e) => e.type === 'shot').length;
        if (wet > 0.6) expect(Math.abs(Math.sin(p.heading - Math.PI / 2))).toBeLessThan(0.2); // turned to face downstream of the swim
      }
    }
    expect(p.y).toBeGreaterThan(c + RIVER.half * TILE);
    expect(maxSpeed).toBeLessThan(FIGHTERS.hotfix.speed * 0.5);
    expect(maxSpeed).toBeGreaterThan(2);
    expect(shotsInWater).toBe(0);
    expect(solidAt(s, x, c)).toBe(false);
  });
});

describe('the drop', () => {
  it('someone floating down over a bush is not hidden by it', () => {
    const s = createGame('hotfix', 1);
    const [a, b] = s.players;
    const ty = MAP.findIndex((row) => row.includes('b'));
    const tx = MAP[ty].indexOf('b');
    Object.assign(a, { stage: 'ground', x: tx * TILE + 12, y: ty * TILE + 1 });
    Object.assign(b, { stage: 'falling', alt: 15, canopy: 2, x: tx * TILE + 1, y: ty * TILE + 1 });
    expect(canSee(s, a, b)).toBe(true);
  });

  it('under the open parachute a fresh press shoots, and someone on the ground can shoot you', () => {
    const s = createGame('hotfix', 1);
    const [a, b] = s.players;
    for (const p of [a, b]) Object.assign(p, { stage: 'falling', alt: 15, canopy: 2 });
    // Two in the air: the trigger works under the canopy.
    Object.assign(a, { x: 40, y: 89, cooldown: 0 });
    Object.assign(b, { x: 46, y: 89 });
    s.players.slice(2).forEach((p) => Object.assign(p, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
    s.drone.t = 1;
    const air = idle();
    air[0] = { ...NO_INPUT, fire: true, aimX: b.x, aimY: b.y };
    for (let i = 0; i < 30; i++) step(s, air);
    expect(a.mag).toBeLessThan(12);
    b.hp = b.maxHp;
    // Now the shooter is down on the ground.
    // Over the open river, so nothing stands between them.
    const ty = MAP.findIndex((row) => row.includes('....'));
    const tx = MAP[ty].indexOf('....');
    Object.assign(a, { stage: 'ground', alt: 0, canopy: -1, x: tx * TILE + 1, y: ty * TILE + 1, cooldown: 0 });
    Object.assign(b, { alt: 1, x: tx * TILE + 6, y: ty * TILE + 1 });
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: b.x, aimY: b.y };
    const hp = b.hp;
    for (let i = 0; i < 30; i++) step(s, inputs);
    expect(b.hp).toBeLessThan(hp);
  });
});

describe('the Deadline', () => {
  it('shrinks phase by phase to nothing and hurts whoever is outside', () => {
    const s = landed();
    const total = ZONE_PHASES.reduce((t, p) => t + p.wait + p.shrink, 0);
    let hurtOutside = false;
    for (let i = 0; i < 60 * (total + 2) && s.phase === 'play'; i++) {
      const before = s.players.map((p) => p.hp);
      step(s, idle());
      s.players.forEach((p, k) => {
        if (p.alive && p.hp < before[k] && Math.hypot(p.x - s.zone.cx, p.y - s.zone.cy) > s.zone.r) hurtOutside = true;
      });
    }
    expect(hurtOutside).toBe(true);
    expect(s.phase).toBe('over');
    expect(s.winner).not.toBeNull();
  }, 30000);

  const run = Math.min(...Object.values(FIGHTERS).map((f) => f.speed));

  it('the edge never moves faster than half running speed, nor faster than swimming after the first circle', () => {
    expect(ZONE_EDGE_SPEED).toBeLessThanOrEqual(run / 2);
    expect(ZONE_EDGE_SPEED).toBeLessThanOrEqual(run * SWIM.speed);
    let r = ZONE_START_RADIUS;
    ZONE_PHASES.forEach((def) => {
      // The next centre is picked up to 0.6 x the radius change away, so the far edge can move by up to 1.6 x that:
      // the table's own shrink times already keep it under the cap, so none of them is stretched.
      const edge = ((r - def.radius) * 1.6) / def.shrink;
      expect(edge).toBeLessThanOrEqual(ZONE_EDGE_SPEED);
      r = def.radius;
    });
  });

  it('from anywhere in the circle the next one is at most a third of the time away, even with waits cut short', () => {
    let r = Math.min(ZONE_START_RADIUS, Math.hypot(WORLD / 2, WORLD / 2));
    ZONE_PHASES.forEach((def, i) => {
      const worstRun = r + (r - def.radius) * 0.6 - def.radius;
      // Worst case: the lull breaker (not in the first phase) and then the endgame squeeze both cut this wait.
      const wait = (i > 0 ? Math.min(def.wait, ZONE_RULES.lullWait) : def.wait) / 2;
      expect(worstRun / run).toBeLessThanOrEqual((wait + def.shrink) / 3);
      r = def.radius;
    });
  });

  it('hurts gently at first and fatally at the end: never less from one phase to the next', () => {
    const full = 100 + 100;
    expect(full / ZONE_PHASES[0].dps).toBeGreaterThan(45);
    expect(full / ZONE_PHASES[ZONE_PHASES.length - 1].dps).toBeLessThanOrEqual(6);
    ZONE_PHASES.slice(1).forEach((def, i) => expect(def.dps).toBeGreaterThan(ZONE_PHASES[i].dps));
  });

  it('a quiet stretch never shortens the first wait, but cuts a later wait to 10 s; a hit ends the quiet', () => {
    const s = landed();
    const start = s.tick;
    while (s.zone.state === 'wait') step(s, idle());
    // Nobody has fought for the whole first wait, and it still ran its full length.
    expect((s.tick - start) * DT).toBeCloseTo(ZONE_PHASES[0].wait, 0);
    while (s.zone.phase === 0) step(s, idle());
    expect(s.zone.state).toBe('wait');
    step(s, idle());
    expect(s.zone.timer).toBeLessThanOrEqual(ZONE_RULES.lullWait);

    const t = landed(2);
    clearAround(t);
    place(t, 0, OPEN.x, OPEN.y);
    place(t, 1, OPEN.x + 3, OPEN.y);
    expect(t.zone.calm).toBeGreaterThan(0);
    for (let i = 0; i < 60 && !t.events.some((e) => e.type === 'hit'); i++) {
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, aimX: OPEN.x + 3, aimY: OPEN.y };
      step(t, inputs);
    }
    expect(t.zone.calm).toBeLessThan(DT * 1.5);
  }, 30000);

  it('with five left, every wait from then on is half as long', () => {
    const s = landed();
    step(s, idle());
    const before = s.zone.timer;
    s.players.slice(ZONE_RULES.squeezeAlive).forEach((p) => (p.alive = false));
    step(s, idle());
    expect(s.zone.timer).toBeCloseTo((before - DT) / 2, 3);
    while (s.zone.phase === 0) step(s, idle());
    step(s, idle());
    // The next wait starts halved (and the quiet since landing has cut it to 10 s first).
    expect(s.zone.timer).toBeLessThanOrEqual(ZONE_RULES.lullWait / 2);
  });
});

describe('the endgame rush', () => {
  const rush = ZONE_RULES.rush[ZONE_RULES.rush.length - 1];
  const run = Math.min(...Object.values(FIGHTERS).map((f) => f.speed));

  it('with the last few left, an early Deadline skips to a small circle near the middle of the old one', () => {
    const s = landed();
    for (let i = 0; i < 60 * (ZONE_PHASES[0].wait + 20); i++) step(s, idle());
    expect(s.zone.phase).toBe(0);
    expect(s.zone.state).toBe('shrink');
    const { cx, cy, r } = s.zone;
    s.players.slice(rush.alive).forEach((p) => (p.alive = false));
    step(s, idle());
    expect(s.zone.phase).toBe(rush.phase);
    expect(s.zone.state).toBe('wait');
    expect(s.zone.timer).toBeLessThanOrEqual(ZONE_RULES.rushWait);
    expect(s.zone.toR).toBe(ZONE_PHASES[rush.phase].radius);
    expect(Math.hypot(s.zone.toX - cx, s.zone.toY - cy)).toBeLessThanOrEqual((r - s.zone.toR) * ZONE_RULES.rushRoom + 1e-6);
    // It stops where it was while the new circle shows.
    expect(s.zone.r).toBeCloseTo(r, 0);
  }, 30000);

  it('the rushed shrink is fair: the edge stays under the cap and the new circle is in reach from anywhere', () => {
    const s = landed();
    for (let i = 0; i < 60 * 30; i++) step(s, idle());
    s.players.slice(rush.alive).forEach((p) => (p.alive = false));
    step(s, idle());
    const { cx, cy, r, toX, toY, toR } = s.zone;
    let time = s.zone.timer;
    let fastest = 0;
    while (s.zone.phase === rush.phase && s.phase === 'play') {
      const before = { cx: s.zone.cx, cy: s.zone.cy, r: s.zone.r };
      // Nobody here moves, so keep the three standing outside alive while the shrink is timed.
      s.players.forEach((p) => (p.hp = p.maxHp));
      step(s, idle());
      if (s.zone.phase !== rush.phase) break;
      time += DT;
      fastest = Math.max(fastest, (before.r - s.zone.r + Math.hypot(s.zone.cx - before.cx, s.zone.cy - before.cy)) / DT);
    }
    expect(fastest).toBeLessThanOrEqual(ZONE_EDGE_SPEED + 1e-6);
    // From the far side of the circle (inside the map) to the new one: at most a third of the time at running speed.
    const far = Math.min(r, Math.hypot(WORLD / 2, WORLD / 2)) + Math.hypot(toX - cx, toY - cy) - toR;
    expect(far / run).toBeLessThanOrEqual(time / 3 + DT);
  });
});

describe('bots', () => {
  it('twenty bots play a full round to a single winner', () => {
    const s = createGame('hotfix', 11);
    const bots = s.players.map((p) => createBot(p.id, 100 + p.id));
    let shots = 0;
    for (let i = 0; i < 60 * 600 && s.phase !== 'over'; i++) {
      step(s, bots.map((b) => b(s)));
      shots += s.events.filter((e) => e.type === 'shot').length;
    }
    expect(s.phase).toBe('over');
    expect(shots).toBeGreaterThan(20);
    expect(s.players.filter((p) => p.placement === 1)).toHaveLength(1);
    expect(s.players.some((p) => p.weapon !== 'fists' || p.kills > 0)).toBe(true);
    expect(WORLD).toBe(240);
  }, 30000);
});

describe('the sniper lands the tick it is fired', () => {
  const duel = (dist: number, hp = 50) => {
    const s = landed(3);
    clearAround(s);
    const [a, b] = s.players;
    place(s, 0, OPEN.x, OPEN.y);
    place(s, 1, OPEN.x + dist, OPEN.y);
    Object.assign(a, { weapon: 'sniper', rarity: 0, mag: 5, ammo: 10, cooldown: 0, swapping: 0, reload: 0 });
    Object.assign(b, { hp, armor: 0 });
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: b.x, aimY: b.y };
    step(s, inputs);
    return { s, a, b };
  };

  it('a hit, the damage and the kill all come on the frame of the shot, not a second later', () => {
    const { s, b } = duel(50);
    expect(b.alive).toBe(false);
    const kinds = s.events.map((e) => e.type);
    expect(kinds).toContain('shot');
    expect(kinds).toContain('hit');
    expect(kinds.indexOf('shot')).toBeLessThan(kinds.indexOf('hit'));
    expect(s.projectiles.filter((p) => p.kind === 'bullet')).toHaveLength(0);
  });

  it('the shot says where the round stopped: at the body, not through it', () => {
    const { s } = duel(50);
    const shot = s.events.find((e) => e.type === 'shot');
    expect(shot?.type === 'shot' && shot.len).toBeGreaterThan(48);
    expect(shot?.type === 'shot' && shot.len).toBeLessThan(50.5);
  });

  it('a round fired at nobody still reports how far it went', () => {
    const t = landed(3);
    clearAround(t);
    place(t, 0, OPEN.x, OPEN.y);
    Object.assign(t.players[0], { weapon: 'sniper', rarity: 0, mag: 5, ammo: 10, cooldown: 0, swapping: 0, reload: 0 });
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: OPEN.x + 10, aimY: OPEN.y };
    step(t, inputs);
    const shot = t.events.find((e) => e.type === 'shot');
    expect(t.events.some((e) => e.type === 'hit')).toBe(false);
    expect(shot?.type === 'shot' && shot.len).toBeGreaterThan(20);
  });

  it('the other guns still fly: a rifle round is in the air after the shot', () => {
    const s = landed(3);
    clearAround(s);
    place(s, 0, OPEN.x, OPEN.y);
    Object.assign(s.players[0], { weapon: 'rifle', rarity: 0, mag: 5, ammo: 10, cooldown: 0, swapping: 0, reload: 0 });
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: OPEN.x + 10, aimY: OPEN.y };
    step(s, inputs);
    expect(s.projectiles.filter((p) => p.kind === 'bullet')).toHaveLength(1);
    const shot = s.events.find((e) => e.type === 'shot');
    expect(shot?.type === 'shot' && shot.len).toBeUndefined();
  });
});

describe('the crosshair is the truth (3D aim)', () => {
  const openSpot = () => {
    const ty = MAP.findIndex((row) => row.includes('....'));
    return { x: MAP[ty].indexOf('....') * TILE + 1, y: ty * TILE + 1 };
  };
  const fireOnce = (aimH: number | undefined, dx: number) => {
    const s = createGame('hotfix', 1);
    const a = s.players[0];
    const o = openSpot();
    Object.assign(a, { stage: 'ground', x: o.x, y: o.y, heading: 0, cooldown: 0, weapon: 'rifle', mag: 25, ammo: 0, rarity: 0 });
    s.players.slice(1).forEach((p) => Object.assign(p, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
    s.drone.t = 1;
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, aimX: a.x + dx, aimY: a.y, aimH };
    step(s, inputs);
    return s.projectiles.find((p) => p.owner === 0 && p.kind === 'bullet');
  };

  it('aimed up into the sky, a round keeps climbing past the aim point', () => {
    const pr = fireOnce(11.1, 10)!;
    expect(pr.ext).toBe(true);
    const s2 = { ...pr };
    // Its height on the line at 20 m out is about chest + 2 x 10 m.
    const k = 20 / pr.hd!;
    expect(s2.h0! + (s2.h1! - s2.h0!) * k).toBeGreaterThan(18);
  });

  it('aimed at the ground 10 m ahead, a round comes down there (not at chest height)', () => {
    const pr = fireOnce(0, 10)!;
    expect(pr.h1).toBe(0);
  });

  it('without a height (bots), rounds still level off at chest height', () => {
    const pr = fireOnce(undefined, 10)!;
    expect(pr.ext).toBeUndefined();
    expect(pr.h1).toBeCloseTo(1.1);
  });
});

describe('landmarks on legs', () => {
  it('between the crane legs you can stand and shoot; the legs themselves are solid', () => {
    const s = createGame('hotfix', 1);
    for (const kind of ['crane', 'tower', 'lookout']) {
      const p = PROPS.find((q) => q.kind === kind)!;
      const cx = (p.x0 + p.w / 2) * TILE;
      const cy = (p.y0 + p.h / 2) * TILE;
      expect(circleBlocked(s, cx, cy, PLAYER_RADIUS)).toBe(false);
      expect(solidAt(s, cx, cy, 1.1)).toBe(false);
      const leg = kind === 'crane' ? { x: cx + 2.6, y: cy + 1.5 } : { x: cx + 1.6, y: cy + 1.6 };
      expect(circleBlocked(s, leg.x, leg.y, PLAYER_RADIUS)).toBe(true);
    }
  });
});

describe('healing is in your hands', () => {
  it('nothing heals by itself; 3 uses a bandage, 4 a med kit', () => {
    const s = createGame('hotfix', 1);
    const p = s.players[0];
    s.players.slice(1).forEach((o) => Object.assign(o, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
    s.drone.t = 1;
    Object.assign(p, { stage: 'ground', hp: 40, sinceCombat: 60, bandages: 2, medkits: 1 });
    for (let i = 0; i < 60 * 10; i++) step(s, idle());
    expect(p.hp).toBe(40);
    const three = idle();
    three[0] = { ...NO_INPUT, bandage: true };
    step(s, three);
    expect(p.using).toBe('bandage');
    for (let i = 0; i < 90; i++) step(s, idle());
    expect(p.hp).toBe(55);
    expect(p.bandages).toBe(1);
    const four = idle();
    four[0] = { ...NO_INPUT, medkit: true };
    step(s, four);
    expect(p.using).toBe('medkit');
  });
});

describe('leaning past a corner: the round leaves from the muzzle', () => {
  // Until 2026-11-25 the round left from the camera's side line (0.62 m right of the body), which made it swerve out of the
  // barrel. Now it leaves the muzzle you see: lean out (E) and the gun clears the corner; stand behind it and the wall takes it.
  it('leaning out, the muzzle clears the corner and the round hits; standing behind the corner, the wall takes it', () => {
    const open = (x: number, y: number) => 'gpa'.includes(MAP[y]?.[x] ?? '#');
    let spot: { x: number; y: number } | null = null;
    for (let y = 10; y < 110 && !spot; y++) {
      for (let x = 10; x < 100 && !spot; x++) {
        if (MAP[y][x] !== '#') continue;
        let ok = true;
        for (let i = 1; i <= 4; i++) if (!open(x - i, y)) ok = false;
        for (let i = -4; i <= 8; i++) if (!open(x + i, y + 1)) ok = false;
        if (ok) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    const run = (lean: number) => {
      const s = createGame('hotfix', 1);
      const [a, b] = s.players;
      s.players.slice(2).forEach((p) => Object.assign(p, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
      s.drone.t = 1;
      const wx = spot!.x * TILE;
      const wy = spot!.y * TILE;
      // Shooter west of the wall tile, its body line just inside the wall's span; the target past the wall's south edge.
      Object.assign(a, { stage: 'ground', x: wx - 3, y: wy + 1.4, z: 0, heading: 0, lean, weapon: 'sniper', mag: 5, ammo: 5, cooldown: 0, rarity: 0 });
      Object.assign(b, { stage: 'ground', x: wx + 10, y: wy + 2.5, z: 0, hp: 100, armor: 0, vest: 0 });
      const hp = b.hp;
      const inputs = idle();
      inputs[0] = { ...NO_INPUT, fire: true, snap: true, lean, aimX: b.x, aimY: b.y, aimH: 1.1 };
      step(s, inputs);
      return hp - b.hp;
    };
    expect(run(0)).toBe(0);
    expect(run(1)).toBeGreaterThan(0);
    // The HUD's obstruction trace (the same line and collision) agrees: standing, the wall is marked short of the target;
    // leaning out, the line is clear.
    const traced = (lean: number) => {
      const s = createGame('hotfix', 1);
      const a = s.players[0];
      const wx = spot!.x * TILE;
      const wy = spot!.y * TILE;
      // Facing the target, as the sim turns the body (snap) before it fires.
      Object.assign(a, { stage: 'ground', x: wx - 3, y: wy + 1.4, z: 0, heading: Math.atan2(1.1, 13), lean, weapon: 'sniper' });
      return shotObstruction(s, muzzleOf(s, a), { x: wx + 10, y: wy + 2.5, h: 1.1 });
    };
    const blocked = traced(0);
    expect(blocked).not.toBeNull();
    expect(blocked!.d).toBeLessThan(8);
    expect(traced(1)).toBeNull();
  });
});

describe('the obstruction trace (HUD) and rockets', () => {
  it('open ground: nothing in the way, aimed at the ground: the line ends there, not short of it', () => {
    const s = createGame('hotfix', 1);
    const ty = MAP.findIndex((row) => row.includes('....'));
    const o = { x: MAP[ty].indexOf('....') * TILE + 1, y: ty * TILE + 1 };
    expect(shotObstruction(s, { x: o.x, y: o.y, h: 1.3 }, { x: o.x + 4, y: o.y, h: 1.3 })).toBeNull();
    expect(shotObstruction(s, { x: o.x, y: o.y, h: 1.3 }, { x: o.x + 4, y: o.y, h: 0 })).toBeNull();
    // Aimed past a point under the ground: the ground takes it first.
    const g = shotObstruction(s, { x: o.x, y: o.y, h: 1.3 }, { x: o.x + 4, y: o.y, h: -2 });
    expect(g).not.toBeNull();
  });

  it('a rocket leaves from the launcher muzzle and keeps its arc', () => {
    const s = createGame('hotfix', 1);
    const a = s.players[0];
    const ty = MAP.findIndex((row) => row.includes('....'));
    Object.assign(a, { stage: 'ground', x: MAP[ty].indexOf('....') * TILE + 1, y: ty * TILE + 1, z: 0, heading: 0, lean: 0, weapon: 'rockets', mag: 1, ammo: 0, cooldown: 0, reload: 0 });
    s.players.slice(1).forEach((p) => Object.assign(p, { stage: 'falling', alt: 60, canopy: -1, x: 10, y: 10 }));
    s.drone.t = 1;
    const m = muzzleOf(s, a);
    const inputs = idle();
    inputs[0] = { ...NO_INPUT, fire: true, snap: true, aimX: a.x + 20, aimY: a.y, pitch: 0.2 };
    step(s, inputs);
    const pr = s.projectiles.find((p) => p.kind === 'rocket')!;
    expect(pr.sx).toBeCloseTo(m.x, 5);
    expect(pr.sy).toBeCloseTo(m.y, 5);
    expect(pr.vh).toBeGreaterThan(0);
  });
});
