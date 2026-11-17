import type { FighterId, WeaponKind } from './types';

export const DT = 1 / 60;

/** Tiles are 2 m; the island is 64 x 64 tiles = 128 x 128 m. */
export const TILE = 2;
export const SIZE = 64;
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
// ---------------------------------------------------------------------------

export interface District {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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
  const district = (name: string, x0: number, y0: number, x1: number, y1: number) =>
    districts.push({ name, x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE });

  // Roads and paths first, so buildings sit beside them.
  for (let x = 0; x < SIZE; x++) {
    const y = 31 + Math.round(Math.sin(x / 7) * 2);
    set(x, y, 'a');
    set(x, y + 1, 'a');
  }
  const path = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n + Math.sin(i / 3) * 0.8);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      if (get(x, y) === 'g') set(x, y, 'p');
      if (get(x + 1, y) === 'g') set(x + 1, y, 'p');
    }
  };
  path(32, 31, 32, 6);
  path(32, 33, 32, 58);
  path(30, 14, 12, 12);
  path(34, 14, 52, 10);
  path(30, 50, 12, 54);

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

  // Old Town: a tight grid of houses of every size, with alleys between them.
  district('Old Town', 16, 14, 50, 50);
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
        x0 = 16 + gx * 8 + (gx >= 2 ? 3 : 0) + ri(0, 1);
        y0 = 14 + gy * 8 + (gy >= 2 ? 4 : 0) + ri(0, 1);
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
  for (let i = 0, made = 0; i < 60 && made < 6; i++) {
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
  farm('North Farm', 6, 4);
  farm('East Farm', 44, 6);
  farm('South Farm', 5, 46);

  // Forest in the south-east, a quarry of rocks in the east.
  district('Deadwood', 44, 42, 60, 60);
  for (let i = 0; i < 140; i++) {
    const x = ri(44, 60);
    const y = ri(40, 60);
    if (get(x, y) === 'g') set(x, y, r() < 0.75 ? 't' : 'b');
  }
  district('Quarry', 48, 22, 60, 34);
  for (let i = 0; i < 26; i++) {
    const x = ri(48, 60);
    const y = ri(21, 29);
    if (get(x, y) === 'g') set(x, y, 'k');
  }
  for (let i = 0; i < 4; i++) {
    const x = ri(49, 59);
    const y = ri(22, 28);
    if (get(x, y) === 'g') set(x, y, 's');
  }

  // Lone trees, bushes and rocks across the fields.
  for (let i = 0; i < 110; i++) {
    const x = ri(2, SIZE - 3);
    const y = ri(2, SIZE - 3);
    if (get(x, y) !== 'g') continue;
    const k = r();
    set(x, y, k < 0.45 ? 't' : k < 0.85 ? 'b' : 'k');
  }

  // The edge of the world: a tree line you can't pass.
  for (let i = 0; i < SIZE; i++) {
    for (const [x, y] of [[i, 0], [i, 1], [i, SIZE - 1], [i, SIZE - 2], [0, i], [1, i], [SIZE - 1, i], [SIZE - 2, i]]) set(x, y, 't');
  }
  return { map: grid.map((row) => row.join('')), districts, buildings };
};

const built = buildMap();
export const MAP: string[] = built.map;
export const DISTRICTS: District[] = built.districts;
export const BUILDINGS: Building[] = built.buildings;

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

export const RACK_HP = 900;

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
  hotfix: { name: 'Hotfix', role: 'On-call engineer', hp: 1000, speed: 6.6, superCost: 1600, superName: 'Deploy', superText: 'a fast dash that hits everyone in its path', color: '#ff6a3d' },
  legacy: { name: 'Legacy', role: 'Senior maintainer', hp: 1300, speed: 5.6, superCost: 1400, superName: 'Deprecated', superText: 'drops a wall that blocks bullets', color: '#3ddc84' },
  standup: { name: 'Standup', role: 'Scrum lead', hp: 900, speed: 6.9, superCost: 1300, superName: 'Timebox', superText: 'a field that slows enemies', color: '#3ec5ff' },
  intern: { name: 'Intern', role: 'First week', hp: 1000, speed: 6.3, superCost: 1500, superName: 'Force push to main', superText: 'a blast that throws everyone back', color: '#ffd23f' },
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
  ammo: number; // shots in the weapon when found; empty -> back to fists
  lob?: { radius: number };
}

export const WEAPONS: Record<WeaponKind, WeaponStats> = {
  fists: { name: 'Fists', damage: 110, bullets: 1, spread: 0, speed: 30, range: 1.6, rate: 0.45, ammo: Infinity },
  pistol: { name: 'Pistol', damage: 140, bullets: 1, spread: 0.03, speed: 30, range: 13, rate: 0.35, ammo: 30 },
  smg: { name: 'SMG', damage: 75, bullets: 1, spread: 0.1, speed: 32, range: 12, rate: 0.09, ammo: 90 },
  shotgun: { name: 'Shotgun', damage: 70, bullets: 7, spread: 0.5, speed: 24, range: 7, rate: 0.85, ammo: 16 },
  rifle: { name: 'Rifle', damage: 120, bullets: 1, spread: 0.04, speed: 40, range: 20, rate: 0.16, ammo: 60 },
  sniper: { name: 'Sniper', damage: 700, bullets: 1, spread: 0, speed: 70, range: 34, rate: 1.4, ammo: 8 },
  rockets: { name: 'Rockets', damage: 900, bullets: 1, spread: 0, speed: 0, range: 16, rate: 1.2, ammo: 4, lob: { radius: 3 } },
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
];

export const ARMOR = { points: 500, absorb: 0.6 };
export const ITEMS = {
  bomb: { damage: 800, radius: 2.6, range: 12 },
  medkit: { heal: 500, over: 3 },
};
export const PLANT_REVEAL = 2.4;
export const AUTO_AIM_RANGE = 22;
export const REGEN = { after: 6, perSecond: 25 };

export const SUPERS = {
  deploy: { distance: 8, time: 0.28, damage: 350 },
  deprecated: { length: 6, thickness: 1, ahead: 2.5, life: 7 },
  timebox: { radius: 4, life: 4, reach: 12, slow: 0.45 },
  push: { radius: 4.5, damage: 300, knockback: 4 },
};

// ---------------------------------------------------------------------------
// The drop: a cargo drone crosses the campus; you jump when you want.
// ---------------------------------------------------------------------------

/**
 * The plane flies slowly, above the clouds. You free-fall through the cloud layer, the parachute
 * opens once you're below it, and you drift down. Heights are in metres, times in seconds.
 */
export const DROP = {
  flight: 24,
  freefall: 3.2,
  chute: 9,
  freefallSpeed: 14,
  chuteSpeed: 6,
  glide: 12.2,
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
export const MOVE = { accel: 24, friction: 20, turn: 8 };

/** The Deadline: wait, then shrink, phase after phase, until nothing is left. */
export const ZONE_PHASES = [
  { wait: 50, shrink: 35, radius: 44, dps: 20 },
  { wait: 35, shrink: 25, radius: 24, dps: 40 },
  { wait: 25, shrink: 20, radius: 10, dps: 70 },
  { wait: 20, shrink: 15, radius: 3, dps: 110 },
  { wait: 10, shrink: 15, radius: 0, dps: 200 },
];
export const ZONE_START_RADIUS = WORLD * 0.72;

export const BOT_NAMES = ['merge_bot', 'lint_fail', 'null_ptr', 'race_cond', 'off_by_1', 'rm_rf', 'yolo_push', 'flaky_test', 'tech_debt'];
