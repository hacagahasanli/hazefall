import type { FighterId, WeaponKind } from './types';

export const DT = 1 / 60;

/** Tiles are 2 m; the campus is 48 x 48 tiles = 96 x 96 m. */
export const TILE = 2;
export const SIZE = 48;
export const WORLD = TILE * SIZE;
export const PLAYER_RADIUS = 0.55;
export const PLAYERS = 10;

// ---------------------------------------------------------------------------
// The campus: an original office park, built the same way every match.
//   #  wall          .  floor (inside a building)   ,  street / yard
//   b  plants (hide inside)
//   r  server rack (cover; breaks; may drop loot)
//   l  loot spot      s  street loot spot
// ---------------------------------------------------------------------------

export interface District {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const buildMap = () => {
  const grid: string[][] = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ','));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = c;
  };
  const r = rng(4242);
  const districts: District[] = [];
  // 4 x 4 blocks of 11 tiles with 1-tile streets between them; the outer ring is the fence.
  const names = [
    'Parking', 'Reception', 'Cafeteria', 'Loading Dock',
    'HR', 'Open Space', 'Server Farm', 'Meeting Rooms',
    'Gym', 'QA Lab', 'Floor 42', 'Data Center',
    'Garden', 'Archive', 'Rooftop Bar', 'Car Park',
  ];
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const x0 = 1 + bx * 12 + 1;
      const y0 = 1 + by * 12 + 1;
      const name = names[by * 4 + bx];
      districts.push({ name, x0: x0 * TILE, y0: y0 * TILE, x1: (x0 + 10) * TILE, y1: (y0 + 10) * TILE });
      const open = name === 'Parking' || name === 'Garden' || name === 'Car Park';
      if (open) {
        // Yards: plant patches and a few racks of crates as cover, loot in the open.
        for (let i = 0; i < 5; i++) {
          const px = x0 + 1 + Math.floor(r() * 7);
          const py = y0 + 1 + Math.floor(r() * 7);
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) set(px + dx, py + dy, 'b');
        }
        for (let i = 0; i < 4; i++) set(x0 + 1 + Math.floor(r() * 9), y0 + 1 + Math.floor(r() * 9), 'r');
        for (let i = 0; i < 3; i++) set(x0 + 1 + Math.floor(r() * 9), y0 + 1 + Math.floor(r() * 9), 's');
        continue;
      }
      // A building: walls around, floor inside, a door on two sides, an inner wall with a gap.
      const w = 7 + Math.floor(r() * 3);
      const h = 7 + Math.floor(r() * 3);
      const ox = x0 + Math.floor(r() * (11 - w));
      const oy = y0 + Math.floor(r() * (11 - h));
      for (let y = oy; y < oy + h; y++) {
        for (let x = ox; x < ox + w; x++) {
          const edge = x === ox || y === oy || x === ox + w - 1 || y === oy + h - 1;
          set(x, y, edge ? '#' : '.');
        }
      }
      const doors = [
        () => set(ox + 1 + Math.floor(r() * (w - 3)), oy, '.'),
        () => set(ox + 1 + Math.floor(r() * (w - 3)), oy + h - 1, '.'),
        () => set(ox, oy + 1 + Math.floor(r() * (h - 3)), '.'),
        () => set(ox + w - 1, oy + 1 + Math.floor(r() * (h - 3)), '.'),
      ];
      const first = Math.floor(r() * 4);
      doors[first]();
      doors[(first + 2) % 4]();
      // Wide doors: open the tile next to each door too.
      for (let y = oy; y < oy + h; y++) {
        for (let x = ox; x < ox + w; x++) {
          const edge = x === ox || y === oy || x === ox + w - 1 || y === oy + h - 1;
          if (edge && grid[y][x] === '.') {
            if (y === oy || y === oy + h - 1) set(x + 1 < ox + w - 1 ? x + 1 : x - 1, y, '.');
            else set(x, y + 1 < oy + h - 1 ? y + 1 : y - 1, '.');
          }
        }
      }
      // Inner wall with a gap, splitting the building into two rooms.
      const mid = ox + Math.floor(w / 2);
      const gap = oy + 1 + Math.floor(r() * (h - 3));
      for (let y = oy + 1; y < oy + h - 1; y++) if (y !== gap && y !== gap + 1) set(mid, y, '#');
      // Furniture: racks as cover, loot spots on the floor.
      const inside = () => ({ x: ox + 1 + Math.floor(r() * (w - 2)), y: oy + 1 + Math.floor(r() * (h - 2)) });
      const racks = name === 'Server Farm' || name === 'Data Center' ? 5 : 2;
      for (let i = 0; i < racks; i++) {
        const p = inside();
        if (grid[p.y][p.x] === '.' && p.x !== mid) set(p.x, p.y, 'r');
      }
      const loot = name === 'Floor 42' || name === 'Server Farm' ? 5 : 3;
      for (let i = 0; i < loot; i++) {
        const p = inside();
        if (grid[p.y][p.x] === '.') set(p.x, p.y, 'l');
      }
      // A plant or two by the walls outside.
      set(ox - 1, oy + Math.floor(h / 2), 'b');
      set(ox + w, oy + Math.floor(h / 2) - 1, 'b');
    }
  }
  // The fence.
  for (let i = 0; i < SIZE; i++) {
    set(i, 0, '#');
    set(i, SIZE - 1, '#');
    set(0, i, '#');
    set(SIZE - 1, i, '#');
  }
  return { map: grid.map((row) => row.join('')), districts };
};

const built = buildMap();
export const MAP: string[] = built.map;
export const DISTRICTS: District[] = built.districts;

export const tileAt = (tx: number, ty: number) =>
  tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE ? '#' : MAP[ty][tx];

export const RACK_HP = 1800;

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

/** The plane flies slowly and high; you free-fall, then the parachute opens and you drift down. */
export const DROP = { flight: 24, freefall: 2.5, chute: 9, freefallSpeed: 14, chuteSpeed: 6, glide: 11.5, height: 60, chuteHeight: 22 };

/** Movement feel: you speed up and slow down over a fraction of a second, and turn smoothly. */
export const MOVE = { accel: 38, friction: 32, turn: 9 };

/** The Deadline: wait, then shrink, phase after phase, until nothing is left. */
export const ZONE_PHASES = [
  { wait: 45, shrink: 30, radius: 34, dps: 20 },
  { wait: 35, shrink: 25, radius: 20, dps: 40 },
  { wait: 25, shrink: 20, radius: 10, dps: 70 },
  { wait: 20, shrink: 15, radius: 3, dps: 110 },
  { wait: 10, shrink: 15, radius: 0, dps: 200 },
];
export const ZONE_START_RADIUS = WORLD * 0.72;

export const BOT_NAMES = ['merge_bot', 'lint_fail', 'null_ptr', 'race_cond', 'off_by_1', 'rm_rf', 'yolo_push', 'flaky_test', 'tech_debt'];
