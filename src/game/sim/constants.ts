import type { FighterId, WeaponKind } from './types';

export const DT = 1 / 60;

/** Tiles are 2 m; the map is 88 x 88 tiles = 176 x 176 m. */
export const TILE = 2;
export const SIZE = 88;
/** The original 64-tile heart of the map (town, farms, forest, quarry) sits this far in. */
const O = 12;
export const WORLD = TILE * SIZE;
export const PLAYER_RADIUS = 0.55;
export const PLAYERS = 10;

// ---------------------------------------------------------------------------
// The map: an original countryside with a dense old town in the middle, farms around it,
// a forest and a quarry. Built the same way every match from a fixed seed.
//   g grass      p dirt path    a asphalt road
//   # wall       w window (blocks you, not bullets)    . floor inside a building
//   f fence (blocks you, not bullets)    t tree (blocks both)    k rock (blocks both)
//   r crate (cover, breaks, may drop loot)    b bush / c crops (you can hide inside)
//   l loot inside a building    s loot outdoors
//   u furniture (blocks you, not bullets; placed so every room stays reachable)
//   v vehicle / container / big prop (blocks both: cover)    o water (blocks you, not bullets)
//   d wooden pier (walkable)    h tall grass (walk through it, it hides you like a bush)
// ---------------------------------------------------------------------------

export interface District {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A road or path centre line in world metres, for the renderer to draw as a clean strip. */
export interface Route {
  kind: 'asphalt' | 'dirt';
  points: { x: number; y: number }[];
}

/** Big props the renderer draws over their 'v' tiles (and decor with no collision). */
export interface Prop {
  kind: 'car' | 'container' | 'tent' | 'windmill' | 'campfire' | 'pond' | 'river';
  /** Tile rectangle. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  seed: number;
}

export interface Building {
  /** In tiles. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Which exterior model to dress it with, and whether it is a big barn. */
  model: number;
  barn: boolean;
}

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** The river: its centre row at tile column x, half its width in tiles, and its bridges (first column, width). */
export const RIVER = {
  half: 3.2,
  bridges: [
    [15, 2],
    [43, 4],
    [70, 2],
  ] as [number, number][],
};
/** Which sides of a deck tile ('d') have a rail: the long sides of a bridge, and a pier's sides that face water. */
export const railSides = (tx: number, ty: number) => {
  const bridge = RIVER.bridges.find(([bx, bw]) => tx >= bx && tx < bx + bw);
  if (bridge) return { w: tx === bridge[0], e: tx === bridge[0] + bridge[1] - 1, n: false, s: false };
  const wet = (x: number, y: number) => tileAt(x, y) === 'o';
  return { w: wet(tx - 1, ty), e: wet(tx + 1, ty), n: wet(tx, ty - 1), s: wet(tx, ty + 1) };
};
export const riverCentre = (x: number) => 32 + O + Math.sin(x / 7) * 2 + Math.sin(x / 3.1) * 0.5;

const buildMap = () => {
  const grid: string[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 'g'));
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < SIZE && y < SIZE ? grid[y][x] : '#');
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = c;
  };
  const r = rng(91827);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const buildings: Building[] = [];
  const districts: District[] = [];
  const routes: Route[] = [];
  const props: Prop[] = [];
  /** Place a solid prop over a w x h tile rectangle if it's all open grass, path or asphalt. */
  const solidProp = (kind: Prop['kind'], x0: number, y0: number, w: number, h: number, on = 'gpa') => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!on.includes(get(x, y))) return false;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, 'v');
    props.push({ kind, x0, y0, w, h, seed: r() });
    return true;
  };
  const district = (name: string, x0: number, y0: number, x1: number, y1: number) =>
    districts.push({ name, x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE });

  // The river first, so everything else is placed around it: twelve metres of water winding
  // across the whole map from west to east, crossed by three wooden bridges. You can swim it
  // (slowly, with no gun up), or take a bridge and be seen.
  for (let x = 0; x < SIZE; x++) {
    const c = riverCentre(x);
    for (let y = Math.floor(c - RIVER.half - 1); y <= c + RIVER.half + 1; y++) {
      const d = Math.abs(y + 0.5 - c);
      if (d < RIVER.half) set(x, y, 'o');
    }
  }
  // Bridges are straight decks from bank to bank, a tile onto the land at each end.
  for (const [bx, bw] of RIVER.bridges) {
    let y0 = SIZE;
    let y1 = 0;
    for (let x = bx; x < bx + bw; x++) {
      for (let y = 0; y < SIZE; y++) {
        if (get(x, y) !== 'o') continue;
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    for (let x = bx; x < bx + bw; x++) for (let y = y0 - 1; y <= y1 + 1; y++) set(x, y, 'd');
  }
  props.push({ kind: 'river', x0: 0, y0: 0, w: SIZE, h: SIZE, seed: r() });
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const line: Route = { kind: 'dirt', points: [] };
    for (let i = 0; i <= n; i++) {
      const yf = y0 + ((y1 - y0) * i) / n;
      // Straight onto a bridge: no wobble near the river.
      const calm = Math.max(0, Math.min(1, (Math.abs(yf - riverCentre(x0 + ((x1 - x0) * i) / n)) - RIVER.half - 1) / 4));
      const xf = x0 + ((x1 - x0) * i) / n + Math.sin(i / 3) * 0.8 * calm;
      const x = Math.round(xf);
      const y = Math.round(yf);
      if (get(x, y) === 'g') set(x, y, 'p');
      if (get(x + 1, y) === 'g') set(x + 1, y, 'p');
      line.points.push({ x: (xf + 1) * TILE, y: (yf + 0.5) * TILE });
    }
    routes.push(line);
  };
  path(32 + O, 4, 32 + O, 76); // over the big bridge
  path(15, 22, 15, 62); // over the west bridge
  path(70, 18, 70, 64); // over the east bridge
  path(30 + O, 14 + O, 12 + O, 12 + O);
  path(34 + O, 14 + O, 52 + O, 10 + O);
  path(30 + O, 50 + O, 12 + O, 54 + O);
  path(12 + O, 37 + O, 13, 57);

  const house = (x0: number, y0: number, w: number, h: number, barn: boolean) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        set(x, y, edge ? '#' : '.');
      }
    }
    // Two doors (two tiles wide) on opposite sides; barns get a third.
    const doorH = (y: number) => {
      const x = ri(x0 + 1, x0 + w - 3);
      set(x, y, '.');
      set(x + 1, y, '.');
    };
    const doorV = (x: number) => {
      const y = ri(y0 + 1, y0 + h - 3);
      set(x, y, '.');
      set(x, y + 1, '.');
    };
    if (r() < 0.5) {
      doorH(y0);
      doorH(y0 + h - 1);
      if (barn) doorV(x0);
    } else {
      doorV(x0);
      doorV(x0 + w - 1);
      if (barn) doorH(y0);
    }
    // Windows: wall tiles you can shoot through.
    for (let i = 0; i < (barn ? 2 : ri(2, 4)); i++) {
      const side = ri(0, 3);
      const x = side < 2 ? ri(x0 + 1, x0 + w - 2) : side === 2 ? x0 : x0 + w - 1;
      const y = side >= 2 ? ri(y0 + 1, y0 + h - 2) : side === 0 ? y0 : y0 + h - 1;
      if (get(x, y) === '#') set(x, y, 'w');
    }
    // Bigger houses get an inner wall with a doorway.
    if (!barn && w >= 7) {
      const mx = x0 + Math.floor(w / 2);
      const gap = ri(y0 + 1, y0 + h - 3);
      for (let y = y0 + 1; y < y0 + h - 1; y++) if (y !== gap && y !== gap + 1) set(mx, y, '#');
    }
    const inside = () => ({ x: ri(x0 + 1, x0 + w - 2), y: ri(y0 + 1, y0 + h - 2) });
    for (let i = 0; i < (barn ? 5 : ri(2, 3)); i++) {
      const q = inside();
      if (get(q.x, q.y) === '.') set(q.x, q.y, 'l');
    }
    for (let i = 0; i < (barn ? 3 : ri(0, 1)); i++) {
      const q = inside();
      if (get(q.x, q.y) === '.') set(q.x, q.y, 'r');
    }
    furnish(x0, y0, w, h, barn);
    buildings.push({ x0, y0, w, h, model: ri(0, 20), barn });
  };

  /**
   * Furniture ('u') stands against the walls, never in front of a doorway, and a piece is only
   * kept if every open tile of the building can still be reached from its doors. It has its own
   * random stream so furnishing doesn't reshuffle the rest of the map.
   */
  const fr = rng(5150);
  const furnish = (x0: number, y0: number, w: number, h: number, barn: boolean) => {
    const inB = (x: number, y: number) => x > x0 && y > y0 && x < x0 + w - 1 && y < y0 + h - 1;
    const onRing = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && !inB(x, y);
    const doors: [number, number][] = [];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (onRing(x, y) && get(x, y) === '.') doors.push([x, y]);
    const walkable = (c: string) => c === '.' || c === 'l';
    const near = (x: number, y: number, test: (c: string, nx: number, ny: number) => boolean) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => test(get(x + dx, y + dy), x + dx, y + dy));
    const connected = () => {
      if (!doors.length) return true;
      const seen = new Set<string>();
      const queue = [doors[0]];
      seen.add(doors[0].join());
      while (queue.length) {
        const [x, y] = queue.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          const k = `${nx},${ny}`;
          if (seen.has(k) || !(inB(nx, ny) || onRing(nx, ny)) || !walkable(get(nx, ny))) continue;
          seen.add(k);
          queue.push([nx, ny]);
        }
      }
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (walkable(get(x, y)) && !seen.has(`${x},${y}`)) return false;
      return true;
    };
    const spots: [number, number][] = [];
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        if (get(x, y) !== '.') continue;
        const byWall = near(x, y, (c) => c === '#' || c === 'w');
        const byDoor = near(x, y, (_c, nx, ny) => doors.some(([dx, dy]) => dx === nx && dy === ny));
        // Not in the inner wall's doorway either: a '.' with walls on two opposite sides.
        const gap = (get(x - 1, y) === '#' && get(x + 1, y) === '#') || (get(x, y - 1) === '#' && get(x, y + 1) === '#');
        if (byWall && !byDoor && !gap) spots.push([x, y]);
      }
    }
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(fr() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    // Crates never stand in a doorway or cut the building in two.
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        if (get(x, y) !== 'r') continue;
        const byDoor = near(x, y, (_c, nx, ny) => doors.some(([dx, dy]) => dx === nx && dy === ny));
        if (byDoor) set(x, y, '.');
      }
    }
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        if (get(x, y) === 'r' && !connected()) set(x, y, '.');
      }
    }
    const want = Math.max(1, Math.floor(((w - 2) * (h - 2)) / (barn ? 6 : 3.5)));
    let placed = 0;
    for (const [x, y] of spots) {
      if (placed >= want) break;
      set(x, y, 'u');
      if (connected()) placed += 1;
      else set(x, y, '.');
    }
  };

  const free = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) if (!'gp'.includes(get(x, y))) return false;
    return x0 > 2 && y0 > 2 && x0 + w < SIZE - 3 && y0 + h < SIZE - 3;
  };

  // The new outer districts first, so the town and the lone houses are placed around them.
  // ---- Lakeside (west): a pond with reeds, a pier and two cabins.
  district('Lakeside', 2, 28, 14, 72);
  {
    const cx = 7;
    const cy = 57; // south of the main road
    for (let y = cy - 8; y <= cy + 8; y++) {
      for (let x = cx - 5; x <= cx + 5; x++) {
        const d = ((x - cx) / 4.6) ** 2 + ((y - cy) / 7.4) ** 2;
        if (d <= 1 && get(x, y) === 'g') set(x, y, 'o');
        else if (d <= 1.35 && get(x, y) === 'g' && r() < 0.45) set(x, y, 'b'); // reeds
      }
    }
    props.push({ kind: 'pond', x0: cx - 5, y0: cy - 8, w: 11, h: 17, seed: r() });
    for (let x = cx; x <= cx + 6; x++) if ('ob'.includes(get(x, cy))) set(x, cy, 'd'); // the pier
    set(cx - 1, cy, 's');
    if (free(4, 29, 4, 4)) house(4, 29, 4, 4, false);
    if (free(4, 68, 5, 4)) house(4, 68, 5, 4, false);
  }

  // ---- Windmill Hill (north): a windmill, a camp of tents round a fire.
  district('Windmill Hill', 26, 2, 62, 11);
  solidProp('windmill', 46, 4, 2, 2);
  for (const [x, y] of [[33, 4], [37, 7], [29, 7]]) solidProp('tent', x, y, 2, 2);
  props.push({ kind: 'campfire', x0: 33, y0: 7, w: 1, h: 1, seed: r() });
  for (let i = 0; i < 4; i++) {
    const x = ri(28, 40);
    const y = ri(3, 10);
    if (get(x, y) === 'g') set(x, y, 's');
  }

  // ---- Truck Stop (south): a car park by the main path, a shop.
  district('Truck Stop', 36, 76, 60, 86);
  for (let y = 78; y <= 83; y++) for (let x = 38; x <= 52; x++) if ('gp'.includes(get(x, y))) set(x, y, 'a');
  for (let i = 0; i < 6; i++) solidProp('car', 39 + i * 2 + (i > 2 ? 2 : 0), r() < 0.5 ? 78 : 82, 1, 2, 'a');
  if (free(54, 77, 6, 5)) house(54, 77, 6, 5, false);
  for (let i = 0; i < 3; i++) {
    const x = ri(38, 52);
    const y = ri(79, 81);
    if (get(x, y) === 'a') set(x, y, 's');
  }

  // ---- Container Yard (east): a river port. Three columns of shipping containers on both banks
  // (a third of them stacked two high), narrow alleys between them, and in the middle of each
  // bank an open square with the good loot, so you have to go in to get it.
  district('Container Yard', 73, 20, 86, 66);
  const squares = [
    { x0: 77, y0: 27, x1: 81, y1: 31 },
    { x0: 77, y0: 53, x1: 81, y1: 57 },
  ];
  // A paved yard: nothing grows between the containers.
  for (let y = 20; y <= 65; y++) for (let x = 73; x <= 85; x++) if (get(x, y) === 'g') set(x, y, 'a');
  const inSquare = (x: number, y: number) => squares.some((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  for (let y = 21; y <= 64; y += 3) {
    for (const x of [74, 78, 82]) {
      if (r() < 0.12) continue;
      let clear = true;
      for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 3; xx++) if (inSquare(xx, yy)) clear = false;
      if (clear) solidProp('container', x, y, 3, 2);
    }
  }
  for (const q of squares) {
    // The loot pile in the middle and a couple of crates to fight round.
    const cx = Math.round((q.x0 + q.x1) / 2);
    const cy = Math.round((q.y0 + q.y1) / 2);
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]]) if (get(cx + dx, cy + dy) === 'a') set(cx + dx, cy + dy, 's');
    for (const [dx, dy] of [[-2, 0], [2, 0]]) if (get(cx + dx, cy + dy) === 'a') set(cx + dx, cy + dy, 'r');
  }
  for (let i = 0; i < 6; i++) {
    const x = ri(74, 85);
    const y = ri(21, 64);
    if (get(x, y) === 'a') set(x, y, 's');
  }

  // Old Town: a tight grid of houses of every size, with alleys between them.
  district('Old Town', 16 + O, 14 + O, 50 + O, 50 + O);
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      // The road crosses the town around row 31 and the main path around column 32: step around them.
      let w = 0;
      let h = 0;
      let x0 = 0;
      let y0 = 0;
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        w = ri(4, 7 - Math.floor(attempt / 4));
        h = ri(4, 6 - Math.floor(attempt / 5));
        x0 = 16 + O + gx * 8 + (gx >= 2 ? 3 : 0) + ri(0, 1);
        y0 = 14 + O + gy * 8 + (gy >= 2 ? 4 : 0) + ri(0, 1);
        placed = free(x0, y0, w, h);
      }
      if (!placed) continue;
      house(x0, y0, w, h, false);
      // A fenced yard or a garden next to some of them.
      if (r() < 0.4) for (let i = 0; i < 4; i++) set(x0 + w, y0 + i, get(x0 + w, y0 + i) === 'g' ? 'f' : get(x0 + w, y0 + i));
      if (r() < 0.5) set(x0 - 1, y0 + h, get(x0 - 1, y0 + h) === 'g' ? 'b' : get(x0 - 1, y0 + h));
    }
  }

  // A few lone houses out in the fields.
  for (let i = 0, made = 0; i < 80 && made < 9; i++) {
    const w = ri(4, 6);
    const h = ri(4, 5);
    const x0 = ri(4, SIZE - 10);
    const y0 = ri(4, SIZE - 10);
    if (free(x0, y0, w, h)) {
      house(x0, y0, w, h, false);
      made += 1;
    }
  }

  // Farms: a barn, a farmhouse, a fenced field of crops you can hide in.
  const farm = (name: string, x0: number, y0: number) => {
    district(name, x0, y0, x0 + 16, y0 + 12);
    if (free(x0, y0, 10, 7)) house(x0, y0, 10, 7, true);
    if (free(x0 + 12, y0 + 1, 5, 5)) house(x0 + 12, y0 + 1, 5, 5, false);
    const fx = x0 + 1;
    const fy = y0 + 8;
    for (let y = fy; y < fy + 5; y++) for (let x = fx; x < fx + 12; x++) if (get(x, y) === 'g') set(x, y, 'c');
    for (let x = fx - 1; x <= fx + 12; x++) {
      if (get(x, fy - 1) === 'g' && x !== fx + 5) set(x, fy - 1, 'f');
      if (get(x, fy + 5) === 'g' && x !== fx + 6) set(x, fy + 5, 'f');
    }
    for (let i = 0; i < 4; i++) {
      const x = ri(x0, x0 + 15);
      const y = ri(y0, y0 + 12);
      if (get(x, y) === 'g') set(x, y, 'r');
    }
    for (let i = 0; i < 3; i++) {
      const x = ri(x0, x0 + 15);
      const y = ri(y0, y0 + 12);
      if (get(x, y) === 'g') set(x, y, 's');
    }
  };
  farm('North Farm', 6 + O, 4 + O);
  farm('East Farm', 44 + O, 6 + O);
  farm('South Farm', 5 + O, 46 + O);

  // Forest in the south-east, a quarry of rocks in the east.
  district('Deadwood', 44 + O, 42 + O, 60 + O, 60 + O);
  for (let i = 0; i < 140; i++) {
    const x = ri(44 + O, 60 + O);
    const y = ri(40 + O, 60 + O);
    if (get(x, y) === 'g') set(x, y, r() < 0.75 ? 't' : 'b');
  }
  district('Quarry', 48 + O, 22 + O, 60 + O, 34 + O);
  for (let i = 0; i < 26; i++) {
    const x = ri(48 + O, 60 + O);
    const y = ri(21 + O, 29 + O);
    if (get(x, y) === 'g') set(x, y, 'k');
  }
  for (let i = 0; i < 4; i++) {
    const x = ri(49 + O, 59 + O);
    const y = ri(22 + O, 28 + O);
    if (get(x, y) === 'g') set(x, y, 's');
  }

  // Lone trees, bushes and rocks across the fields.
  for (let i = 0; i < 200; i++) {
    const x = ri(2, SIZE - 3);
    const y = ri(2, SIZE - 3);
    if (get(x, y) !== 'g') continue;
    const k = r();
    set(x, y, k < 0.45 ? 't' : k < 0.85 ? 'b' : 'k');
  }

  // Meadows of tall grass you can crawl through unseen.
  for (let i = 0, made = 0; i < 80 && made < 14; i++) {
    const cx = ri(6, SIZE - 7);
    const cy = ri(6, SIZE - 7);
    if (get(cx, cy) !== 'g') continue;
    const rx = 1.5 + r() * 2.5;
    const ry = 1.5 + r() * 2.5;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (r() - 0.5) * 0.4 && get(x, y) === 'g') set(x, y, 'h');
      }
    }
    made += 1;
  }

  // Every door opens onto open ground: clear two tiles in front of it of fences, trees, rocks
  // and crates that the yards, farms and lone trees may have put there.
  for (const b of buildings) {
    for (let y = b.y0; y < b.y0 + b.h; y++) {
      for (let x = b.x0; x < b.x0 + b.w; x++) {
        const ring = x === b.x0 || y === b.y0 || x === b.x0 + b.w - 1 || y === b.y0 + b.h - 1;
        if (!ring || get(x, y) !== '.') continue;
        const ox = x === b.x0 ? -1 : x === b.x0 + b.w - 1 ? 1 : 0;
        const oy = y === b.y0 ? -1 : y === b.y0 + b.h - 1 ? 1 : 0;
        for (let k = 1; k <= 2; k++) if ('ftkr'.includes(get(x + ox * k, y + oy * k))) set(x + ox * k, y + oy * k, 'g');
      }
    }
  }

  // The edge of the world: a tree line you can't pass.
  for (let i = 0; i < SIZE; i++) {
    for (const [x, y] of [[i, 0], [i, 1], [i, SIZE - 1], [i, SIZE - 2], [0, i], [1, i], [SIZE - 1, i], [SIZE - 2, i]]) set(x, y, 't');
  }
  return { map: grid.map((row) => row.join('')), districts, buildings, routes, props };
};

const built = buildMap();
export const MAP: string[] = built.map;
export const DISTRICTS: District[] = built.districts;
export const BUILDINGS: Building[] = built.buildings;
export const ROUTES: Route[] = built.routes;
export const PROPS: Prop[] = built.props;

export const tileAt = (tx: number, ty: number) =>
  tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE ? '#' : MAP[ty][tx];

/** A stable 0..1 number per tile, integer-only so the server and every browser agree. */
export const tileHash = (x: number, y: number, k = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k + 1, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/**
 * What you actually bump into. A tile is 2 m, but a tree is only its trunk, a rock and a crate are
 * round, and a fence is a thin rail through the middle of its tile. The renderer places the models
 * at the same spots, so what you see is what stops you.
 */
export const SHAPES = { trunk: 0.45, rock: 0.95, crate: 0.8, fence: 0.16, furniture: 0.22 };

/** Trees stand a little off their tile centre so the forest doesn't look like a grid. */
export const treeSpot = (tx: number, ty: number) => ({
  x: tx * TILE + TILE / 2 + (tileHash(tx, ty, 2) - 0.5) * 0.8,
  y: ty * TILE + TILE / 2 + (tileHash(tx, ty, 3) - 0.5) * 0.8,
});

/** A fence runs up-down when it has a fence above or below it, otherwise left-right. */
export const fenceVertical = (tx: number, ty: number) => tileAt(tx, ty - 1) === 'f' || tileAt(tx, ty + 1) === 'f';

export const RACK_HP = 90;

// ---------------------------------------------------------------------------
// Fighters: who you are. Weapons come from the map; the super is yours.
// ---------------------------------------------------------------------------

export interface FighterStats {
  name: string;
  role: string;
  hp: number;
  speed: number;
  superCost: number;
  superName: string;
  superText: string;
  color: string;
}

export const FIGHTERS: Record<FighterId, FighterStats> = {
  hotfix: { name: 'Hotfix', role: 'On-call engineer', hp: 100, speed: 6.6, superCost: 160, superName: 'Deploy', superText: 'a fast dash that hits everyone in its path', color: '#ff6a3d' },
  legacy: { name: 'Legacy', role: 'Senior maintainer', hp: 100, speed: 5.9, superCost: 140, superName: 'Deprecated', superText: 'drops a wall that blocks bullets', color: '#3ddc84' },
  standup: { name: 'Standup', role: 'Scrum lead', hp: 100, speed: 6.9, superCost: 130, superName: 'Timebox', superText: 'a field that slows enemies', color: '#3ec5ff' },
  intern: { name: 'Intern', role: 'First week', hp: 100, speed: 6.3, superCost: 150, superName: 'Force push to main', superText: 'a blast that throws everyone back', color: '#ffd23f' },
};

// ---------------------------------------------------------------------------
// Weapons and loot
// ---------------------------------------------------------------------------

export interface WeaponStats {
  name: string;
  damage: number;
  bullets: number;
  spread: number; // radians, total cone (bullets > 1) or random jitter (1 bullet)
  speed: number;
  range: number;
  rate: number; // seconds between shots
  ammo: number; // rounds in the gun when found (magazine + spare)
  /**
   * No range limit: a bullet flies until it hits something (`range` is only how far it can
   * physically carry). Damage is full up to `falloff.start` metres and drops to `falloff.min`
   * of it at `falloff.end`.
   */
  falloff: { start: number; end: number; min: number };
  /** Magazine size and seconds to reload it. */
  mag: number;
  reload: number;
  lob?: { radius: number };
}

export const WEAPONS: Record<WeaponKind, WeaponStats> = {
  // Damage is out of 100 HP (+ up to 100 armor): about three hits kill.
  fists: { name: 'Fists', damage: 15, bullets: 1, spread: 0, speed: 30, range: 1.6, rate: 0.45, ammo: Infinity, mag: Infinity, reload: 0, falloff: { start: 9, end: 9, min: 1 } },
  pistol: { name: 'Pistol', damage: 34, bullets: 1, spread: 0.03, speed: 34, range: 90, rate: 0.35, ammo: 36, mag: 12, reload: 1.1, falloff: { start: 12, end: 40, min: 0.4 } },
  smg: { name: 'SMG', damage: 22, bullets: 1, spread: 0.1, speed: 36, range: 90, rate: 0.09, ammo: 90, mag: 30, reload: 1.7, falloff: { start: 10, end: 35, min: 0.35 } },
  shotgun: { name: 'Shotgun', damage: 14, bullets: 7, spread: 0.5, speed: 28, range: 45, rate: 0.85, ammo: 18, mag: 6, reload: 2.2, falloff: { start: 5, end: 18, min: 0.15 } },
  rifle: { name: 'Rifle', damage: 30, bullets: 1, spread: 0.04, speed: 48, range: 120, rate: 0.16, ammo: 75, mag: 25, reload: 1.9, falloff: { start: 20, end: 60, min: 0.5 } },
  sniper: { name: 'Sniper', damage: 80, bullets: 1, spread: 0, speed: 80, range: 160, rate: 1.4, ammo: 10, mag: 5, reload: 2.6, falloff: { start: 40, end: 100, min: 0.7 } },
  // A rocket flies straight where you aim at 16 m/s (you see it coming), drops a little over long
  // distances, and explodes on whatever it meets.
  rockets: { name: 'Rockets', damage: 110, bullets: 1, spread: 0, speed: 16, range: 70, rate: 1.2, ammo: 4, mag: 1, reload: 2.4, lob: { radius: 3 }, falloff: { start: 999, end: 999, min: 1 } },
};

/** Loot weights inside buildings (one entry = one ticket). Rockets and snipers are rare. */
export const LOOT_TABLE: string[] = [
  'pistol', 'pistol', 'pistol', 'pistol',
  'smg', 'smg', 'smg',
  'shotgun', 'shotgun', 'shotgun',
  'rifle', 'rifle',
  'sniper',
  'rockets',
  'armor', 'armor', 'armor',
  'medkit', 'medkit', 'medkit',
  'bomb', 'bomb',
  'ammo', 'ammo', 'ammo', 'ammo', 'ammo',
];

/** Rockets and bombs: hold to throw farther, from `min` metres up to the weapon's range after `full` seconds. */
export const THROW = { min: 4, full: 1.2 };
/** Rockets: how fast they sink (m/s^2), the height they leave at, and when they explode on walls. */
export const ROCKET = { gravity: 0.32, launchHeight: 1.35, wallHeight: 3.2 };

/** An ammo box gives the gun in your hands this many magazines of spare rounds. */
export const AMMO_BOX_MAGS = 2;

/** The dodge roll (Shift): metres, seconds, bullet-proof for the first `iframes` s, recharge. */
export const ROLL = { distance: 4, time: 0.5, iframes: 0.3, cooldown: 3 };

/** Vaulting: how long you push into a fence or sill before you climb over, and how long the climb takes. */
export const VAULT = { after: 0.15, time: 0.55, reach: 3.2 };

/** Armor is a second health bar of up to 100 that takes hits first (the Deadline ignores it). */
export const ARMOR = { points: 100, absorb: 1 };
export const ITEMS = {
  bomb: { damage: 80, radius: 2.6, range: 30 },
  medkit: { heal: 50, over: 3 },
};
/** Everyone jumps with a pistol and one magazine, so you can fight under the parachute. */
export const START_WEAPON = { kind: 'pistol' as const, mag: 12, spare: 0 };
export const PLANT_REVEAL = 2.4;
export const AUTO_AIM_RANGE = 28;
export const REGEN = { after: 6, perSecond: 2.5 };
/** Leaning out round a corner (Q / E): how far the shoulder and the muzzle move out, and the speed while leaning. */
export const LEAN = { offset: 0.7, speed: 0.6, rate: 6 };

export const SUPERS = {
  deploy: { distance: 8, time: 0.28, damage: 35 },
  deprecated: { length: 6, thickness: 1, ahead: 2.5, life: 7 },
  timebox: { radius: 4, life: 4, reach: 12, slow: 0.45 },
  push: { radius: 4.5, damage: 30, knockback: 4 },
};

// ---------------------------------------------------------------------------
// The drop: a cargo drone crosses the campus; you jump when you want.
// ---------------------------------------------------------------------------

/**
 * The plane flies slowly, above the clouds. You free-fall through the cloud layer, the parachute
 * opens once you're below it, and you drift down. Heights are in metres, times in seconds.
 */
export const DROP = {
  flight: 30,
  freefall: 3.2,
  chute: 5,
  freefallSpeed: 14,
  chuteSpeed: 7,
  glide: 8.2,
  height: 75,
  chuteHeight: 30,
  cloudLow: 44,
  cloudHigh: 58,
};

/** How high a falling player is, from the seconds of descent they have left. */
export const fallHeight = (fall: number) =>
  fall <= DROP.chute
    ? 1 + (DROP.chuteHeight - 1) * (fall / DROP.chute)
    : DROP.chuteHeight + (DROP.height - DROP.chuteHeight) * Math.min(1, (fall - DROP.chute) / DROP.freefall);

/** Movement feel: you speed up and slow down over a fraction of a second, and turn smoothly. */
/** Swimming: a little under half running speed (a good swimmer's ~2 m/s). */
export const SWIM = { speed: 0.42 };
export const MOVE = { accel: 24, friction: 20, turn: 12 };

/** The Deadline: wait, then shrink, phase after phase, until nothing is left. */
/**
 * About 3 minutes in all. Outside the Deadline you lose this much a second, armor first, then
 * health (out of up to 200): 12 in the first phase, rising to 45 in the last, so even the first
 * circle kills a fully armored player in about 17 s.
 */
export const ZONE_PHASES = [
  { wait: 34, shrink: 26, radius: 60, dps: 12 },
  { wait: 24, shrink: 20, radius: 32, dps: 16 },
  { wait: 18, shrink: 14, radius: 13, dps: 22 },
  { wait: 13, shrink: 12, radius: 4, dps: 30 },
  { wait: 8, shrink: 12, radius: 0, dps: 45 },
];
export const ZONE_START_RADIUS = WORLD * 0.72;

export const BOT_NAMES = ['merge_bot', 'lint_fail', 'null_ptr', 'race_cond', 'off_by_1', 'rm_rf', 'yolo_push', 'flaky_test', 'tech_debt'];
