// The 240 m valley (docs/collab/CREATIVE/specifications/map-v2.md): nothing walled in, every named place where the plan has it.
import { BUILDINGS, DISTRICTS, MAP, PLACE_TIER, placeAt, PROPS, RIVER, ROUTES, SIZE, TILE, WORLD } from './constants';
import { buildingAt, LADDERS } from './roofs';

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

  it('slopes the Quarry conveyor into the Quarry, with its gravel cone inside it and off the East lane', () => {
    const quarry = DISTRICTS.find((d) => d.name === 'Quarry')!;
    const c = PROPS.find((p) => p.kind === 'conveyor')!;
    const cx = (c.x0 + c.w / 2) * TILE;
    const cy = (c.y0 + c.h / 2) * TILE;
    // The model (render/props.ts) runs along the map's y axis, 10 m of belt, and drops onto its cone 5.2 m past the middle.
    for (const [x, y] of [[cx, cy - 5.6], [cx, cy + 5.2]]) {
      expect(x).toBeGreaterThan(quarry.x0);
      expect(x).toBeLessThan(quarry.x1);
      expect(y).toBeGreaterThan(quarry.y0);
      expect(y).toBeLessThan(quarry.y1);
    }
    const eastLane = ROUTES.find((r) => r.kind === 'dirt' && r.points[0].x === r.points[1].x && Math.abs(r.points[0].x - 87 * TILE) < 1)!;
    expect(Math.abs(cx - eastLane.points[0].x)).toBeGreaterThan(6);
  });

  it('has cover at least every 20 m along River Road across the South field', () => {
    // Boulders (the field's hard cover) in the rows by the field (y 84-91), x 62-105.
    const cover: number[] = [];
    for (let x = 62; x <= 105; x++) if ([84, 85, 86, 87, 88, 89, 90, 91].some((y) => MAP[y][x] === 'k')) cover.push(x);
    const edges = [62, ...cover, 105];
    for (let i = 1; i < edges.length; i++) expect((edges[i] - edges[i - 1]) * TILE).toBeLessThanOrEqual(20);
  });

  it('puts two hard-cover rocks at each end of all five crossings, off the deck', () => {
    for (const [bx, bw] of RIVER.bridges) {
      const deck = MAP.map((row, y) => (row[bx] === 'd' ? y : -1)).filter((y) => y >= 0);
      const y0 = Math.min(...deck);
      const y1 = Math.max(...deck);
      const axis = bx + Math.floor(bw / 2);
      for (const [from, to] of [[y0 - 4, y0 - 1], [y1 + 1, y1 + 4]]) {
        let rocks = 0;
        for (let y = from; y <= to; y++) for (let x = axis - 4; x <= axis + 4; x++) if (MAP[y][x] === 'k' && Math.abs(x - axis) >= 2) rocks += 1;
        expect(rocks, `crossing ${bx} rows ${from}-${to}`).toBeGreaterThanOrEqual(2);
      }
      for (const y of deck) for (let x = bx; x < bx + bw; x++) expect(MAP[y][x]).toBe('d');
    }
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

  // 40 to 60: nine houses that stood on roads were taken down (Reis, 2026-11-24).
  it('has the density the plan asks for: 40 to 60 buildings, a ladder on nearly every one, plain grass under half', () => {
    expect(BUILDINGS.length).toBeGreaterThanOrEqual(40);
    expect(BUILDINGS.length).toBeLessThanOrEqual(60);
    expect(LADDERS.length).toBeGreaterThanOrEqual(BUILDINGS.length - 2);
    const grass = [...MAP.join('')].filter((c) => c === 'g').length / (SIZE * SIZE);
    expect(grass).toBeLessThan(0.5);
  });

  it('no house stands on a road, path or track (its centre line never crosses a footprint)', () => {
    for (const rt of ROUTES) {
      for (let i = 1; i < rt.points.length; i++) {
        const a = rt.points[i - 1];
        const b = rt.points[i];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5);
        for (let k = 0; k <= n; k++) expect(buildingAt(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n)).toBe(-1);
      }
    }
  });
});
