// The 240 m valley (docs/collab/CREATIVE/specifications/map-v2.md): nothing walled in, every named place where the plan has it.
import { BUILDINGS, DISTRICTS, MAP, PLACE_TIER, placeAt, PROPS, RIVER, ROUTES, SIZE, TILE, WORLD } from './constants';
import { LADDERS } from './roofs';

/** Tiles you cannot walk onto at all (the rest can be walked, swum, vaulted or shot through). */
const SOLID = 'tkv#ur';

const reached = () => {
  const seen = new Uint8Array(SIZE * SIZE);
  const queue = [3 * SIZE + 60]; // Route 1, just inside the north edge
  seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % SIZE;
    const y = (i - x) / SIZE;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen[ny * SIZE + nx] || SOLID.includes(MAP[ny][nx])) continue;
      seen[ny * SIZE + nx] = 1;
      queue.push(ny * SIZE + nx);
    }
  }
  return seen;
};

describe('the valley', () => {
  it('is 120 x 120 tiles (240 m) with five crossings and thirteen named places', () => {
    expect(SIZE).toBe(120);
    expect(WORLD).toBe(240);
    expect(RIVER.bridges).toHaveLength(5);
    expect(new Set(DISTRICTS.map((d) => d.name)).size).toBe(13);
    for (const name of ['Old Town', 'Container Yard', 'The Campus', 'Mast Hill', 'Quarry', 'Truck Stop', 'Railyard', 'Hollis Farm', 'Redgate Farm', 'Southfield Farm', 'Windmill Hill', 'Lakeside', 'Deadwood']) {
      expect(DISTRICTS.some((d) => d.name === name)).toBe(true);
    }
    expect(PLACE_TIER['The Campus']).toBe(3);
    expect(PLACE_TIER['Mast Hill']).toBe(3);
    expect(placeAt(62 * TILE, 50 * TILE)?.name).toBe('Old Town');
  });

  it('has the landmarks: water tower, two cranes, pole sign, mast, HQ tower, lookout, gantry, conveyor, boxcars', () => {
    const count = (k: string) => PROPS.filter((p) => p.kind === k).length;
    expect(count('tower')).toBe(1);
    expect(count('crane')).toBe(2);
    expect(count('sign')).toBe(1);
    expect(count('mast')).toBe(1);
    expect(count('hq')).toBe(1);
    expect(count('lookout')).toBe(1);
    expect(count('gantry')).toBe(2);
    expect(count('conveyor')).toBe(1);
    expect(count('boxcar')).toBeGreaterThanOrEqual(10);
    expect(ROUTES.some((r) => r.kind === 'rail')).toBe(true);
  });

  it('walls nothing in: every tile you can stand on and every doorway can be reached from Route 1', () => {
    const seen = reached();
    const lost: string[] = [];
    for (let y = 2; y < SIZE - 2; y++) for (let x = 2; x < SIZE - 2; x++) if (!SOLID.includes(MAP[y][x]) && !seen[y * SIZE + x]) lost.push(`${x},${y}:${MAP[y][x]}`);
    expect(lost).toEqual([]);
    for (const b of BUILDINGS) {
      for (let y = b.y0; y < b.y0 + b.h; y++) {
        for (let x = b.x0; x < b.x0 + b.w; x++) {
          const ring = x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
          if (ring && MAP[y][x] === '.') expect(seen[y * SIZE + x]).toBe(1);
        }
      }
    }
  });

  it('has the density the plan asks for: 50 to 60 buildings, a ladder on nearly every one, plain grass under half', () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(50);
    expect(BUILDINGS.length).toBeLessThanOrEqual(60);
    expect(LADDERS.length).toBeGreaterThanOrEqual(BUILDINGS.length - 2);
    const grass = [...MAP.join('')].filter((c) => c === 'g').length / (SIZE * SIZE);
    expect(grass).toBeLessThan(0.5);
  });
});
