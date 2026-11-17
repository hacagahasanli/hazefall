import { createBot } from './bot';
import { BUILDINGS, DROP, DT, MAP, PLAYER_RADIUS, SHAPES, SIZE, TILE, treeSpot, WEAPONS, WORLD, ZONE_PHASES } from './constants';
import { circleBlocked, createGame, falloffDamage, hitPoint, inPlant, lootUnder, solidAt, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const idle = (): Input[] => Array.from({ length: 10 }, () => ({ ...NO_INPUT }));

/** Land everyone at once: skip the drop. */
const landed = (seed = 1): GameState => {
  const s = createGame('hotfix', seed);
  for (let i = 0; i < 60 * 60 && s.phase === 'drop'; i++) step(s, idle());
  return s;
};

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
  it('you jump with a pistol and one magazine; with it empty, walking over a gun picks it up', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    expect(p.weapon).toBe('pistol');
    expect(p.mag + p.ammo).toBe(12);
    Object.assign(p, { mag: 0, ammo: 0 });
    s.loot.push({ id: 999, kind: 'rifle', x: p.x + 0.3, y: p.y, ammo: WEAPONS.rifle.ammo, active: true });
    step(s, idle());
    expect(p.weapon).toBe('rifle');
  });

  it('bullets have no range limit, they just hit softer far away; about three hits kill', () => {
    expect(falloffDamage('rifle', 30, 5)).toBe(30);
    expect(falloffDamage('rifle', 30, 80)).toBeCloseTo(15);
    expect(falloffDamage('pistol', 34, 25)).toBeLessThan(34);
    expect(Math.ceil(100 / WEAPONS.pistol.damage)).toBe(3);
    expect(WEAPONS.rifle.range).toBeGreaterThan(100);
  });

  it('rockets: a tap throws close, holding Space throws up to the full range', () => {
    const throwAfter = (ticks: number) => {
      const s = landed();
      clearAround(s);
      const p = s.players[0];
      Object.assign(p, { weapon: 'rockets', mag: 1, ammo: 0, cooldown: 0, heading: 0 });
      const hold = idle();
      hold[0] = { ...NO_INPUT, fire: true, aimX: p.x + 10, aimY: p.y };
      for (let i = 0; i < ticks; i++) step(s, hold);
      step(s, idle());
      const pr = s.projectiles.find((q) => q.kind === 'lob' && q.owner === 0)!;
      return Math.hypot(pr.tx - pr.sx, pr.ty - pr.sy);
    };
    expect(throwAfter(2)).toBeLessThan(5);
    expect(throwAfter(90)).toBeCloseTo(WEAPONS.rockets.range, 0);
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

  it('E swaps your gun for the one on the floor and drops yours', () => {
    const s = landed();
    clearAround(s);
    const p = s.players[0];
    Object.assign(p, { weapon: 'smg', mag: 30, ammo: 10 });
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

describe('the drop', () => {
  it('under the parachute you can shoot and be shot', () => {
    const s = createGame('hotfix', 1);
    const [a, b] = s.players;
    for (const p of [a, b]) Object.assign(p, { stage: 'falling', fall: DROP.chute - 1 });
    Object.assign(a, { x: 60, y: 60, cooldown: 0 });
    Object.assign(b, { x: 66, y: 60 });
    s.players.slice(2).forEach((p) => Object.assign(p, { stage: 'falling', fall: DROP.chute + 2, x: 10, y: 10 }));
    s.drone.t = 1;
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
  });
});

describe('bots', () => {
  it('ten bots play a full round to a single winner', () => {
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
    expect(WORLD).toBe(176);
  });
});
