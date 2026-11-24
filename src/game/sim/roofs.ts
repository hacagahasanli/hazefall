/**
 * Roofs: every house's roof is a surface you can stand on, at the height the game draws it. Pure geometry from the map
 * (no state), shared by the simulation and the renderer. See docs/ROOFTOPS.md.
 *
 * A footprint has two layers: the floor (0 m, inside the walls, entered through doors) and the roof (the gabled surface
 * above the walls). The roof is the same gable the shoulder and first-person views draw (world.ts `buildRoof`): eaves at
 * the wall tops, a ridge along the long side, rising `rise` metres across the short side.
 */
import { BUILDINGS, MAP, SIZE, TILE, tileAt, tileHash } from './constants';

import type { Building } from './constants';

/** Wall tops (the eaves), and the ceiling indoors: the slab between the ceiling and the roof surface is solid. */
export const EAVE = 2.6;
export const CEILING = 2.45;
/** Feet at or above this over a footprint are on the roof; below it, on the floor inside. */
export const ROOF_LAYER = 1.5;
/** Feet: gravity on the ground (m/s^2), a hop's take-off speed (m/s: about 0.7 m high), the drop that counts as a landing. */
export const FEET = { gravity: 18, jump: 5, landDrop: 1 };
/** The body for bullets: from the feet to the top of the head. */
export const BODY = { top: 1.9 };
/** Climbing a ladder: seconds from the ground to the roof (1.25: three hand-over-hand pulls a person can follow), and how long you push into it first. */
export const CLIMB = { time: 1.25, after: 0.15 };
/** How far the roof hangs out past the walls (drawn only: you stand on the footprint). */
const OVERHANG = 0.4;

/**
 * Two of the top-down house models (house_type19 and house_type20, `model` 18 and 19) have flat roofs: their roof is
 * flat at the eaves, in every view. Measured from the models' geometry (share of the footprint that is roof at the top).
 */
export const FLAT_MODELS = new Set([18, 19]);

/** How high a building's ridge rises above its eaves (world.ts `buildRoof` draws this rise). */
export const roofRise = (b: Building) => {
  if (!b.barn && FLAT_MODELS.has(b.model)) return 0;
  const short = Math.min(b.w, b.h) * TILE + OVERHANG * 2;
  return Math.min(b.barn ? 3.2 : 2.2, short * (b.barn ? 0.42 : 0.32));
};
/** The ridge's height above the ground. */
export const ridgeHeight = (b: Building) => EAVE + roofRise(b);

/** Building index per tile (-1 = none): the footprints, walls included. */
const OWNER = (() => {
  const a = new Int16Array(SIZE * SIZE).fill(-1);
  BUILDINGS.forEach((b, i) => {
    for (let y = b.y0; y < b.y0 + b.h; y++) for (let x = b.x0; x < b.x0 + b.w; x++) a[y * SIZE + x] = i;
  });
  return a;
})();

/** Which building's footprint (x, y) is on, or -1. */
export const buildingAt = (x: number, y: number) => {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE ? -1 : OWNER[ty * SIZE + tx];
};

/** The roof surface's height over building `i` at (x, y): eave at the sides rising to the ridge in the middle. */
export const roofHeightOf = (i: number, x: number, y: number) => {
  const b = BUILDINGS[i];
  const w = b.w * TILE;
  const d = b.h * TILE;
  const alongX = w >= d;
  const S = (alongX ? d : w) + OVERHANG * 2;
  const v = (alongX ? y - b.y0 * TILE : x - b.x0 * TILE) + OVERHANG;
  const rise = roofRise(b);
  const k = Math.max(0, 1 - Math.abs(v - S / 2) / (S / 2));
  return EAVE - 0.05 + (rise + 0.05) * k;
};

/**
 * Whose roof is over (x, y): the footprint's building, or one whose eaves overhang the spot (the drawn roof reaches
 * OVERHANG past the walls on every side, so you can stand out to its visible edge). -1 under the open sky.
 */
export const roofOwnerAt = (x: number, y: number) => {
  const i = buildingAt(x, y);
  if (i >= 0) return i;
  const o = OVERHANG - 0.02;
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [o, -o], [-o, o], [-o, -o]]) {
    const j = buildingAt(x + dx, y + dy);
    if (j >= 0) return j;
  }
  return -1;
};

/** The roof's height at (x, y) (out to the eaves' edge), or -1 off every roof. */
export const roofAt = (x: number, y: number) => {
  const i = roofOwnerAt(x, y);
  return i < 0 ? -1 : roofHeightOf(i, x, y);
};

/** What your feet rest on at (x, y) with feet at height z: the roof when you are up on it, else the ground. */
export const supportAt = (x: number, y: number, z: number) => (z >= ROOF_LAYER ? Math.max(0, roofAt(x, y)) : 0);

/** Is (x, y) at height h inside the roof slab (between the ceiling and the roof surface)? */
export const inRoofSlab = (x: number, y: number, h: number) => {
  if (h < CEILING) return false;
  const r = roofAt(x, y);
  return r >= 0 && h <= r;
};

/**
 * Does the straight step from (x0, y0, h0) to (x1, y1, h1) pass through a roof? Samples alone can skip the thin slab, so
 * this also catches a step that goes from above a roof to under its ceiling (or back) over one footprint.
 */
export const roofBetween = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
  if (inRoofSlab(x1, y1, h1)) return true;
  const b0 = buildingAt(x0, y0);
  if (b0 < 0 || b0 !== buildingAt(x1, y1)) return false;
  const above0 = h0 > roofHeightOf(b0, x0, y0);
  const above1 = h1 > roofHeightOf(b0, x1, y1);
  const below0 = h0 < CEILING;
  const below1 = h1 < CEILING;
  return (above0 && below1) || (below0 && above1);
};

/** A ladder up a house's outside wall: its wall tile, the way out (unit normal), and the building. */
export interface Ladder {
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  b: number;
}

const OPEN_GROUND = 'gpash';

/**
 * One ladder per house: a plain wall tile (not a door, window or corner) with open ground in front of it for two tiles,
 * picked by tile hash so it is the same every match and nothing else on the map moves.
 */
export const LADDERS: Ladder[] = BUILDINGS.flatMap((b, i) => {
  let best: Ladder | null = null;
  let bestK = Infinity;
  for (let y = b.y0; y < b.y0 + b.h; y++) {
    for (let x = b.x0; x < b.x0 + b.w; x++) {
      const nx = x === b.x0 ? -1 : x === b.x0 + b.w - 1 ? 1 : 0;
      const ny = y === b.y0 ? -1 : y === b.y0 + b.h - 1 ? 1 : 0;
      // On the ring, not a corner.
      if (Math.abs(nx) + Math.abs(ny) !== 1 || MAP[y][x] !== '#') continue;
      if (!OPEN_GROUND.includes(tileAt(x + nx, y + ny)) || !OPEN_GROUND.includes(tileAt(x + nx * 2, y + ny * 2))) continue;
      // Not right beside a doorway (the ladder would stand in the way of it).
      const side = [[ny, nx], [-ny, -nx]].some(([sx, sy]) => tileAt(x + sx, y + sy) === '.');
      if (side) continue;
      const k = tileHash(x, y, 11);
      if (k < bestK) {
        bestK = k;
        best = { tx: x, ty: y, nx, ny, b: i };
      }
    }
  }
  return best ? [best] : [];
});

/** The ladder whose foot (x, y) stands at, close against the wall: within `reach` of its face and in front of its rungs. */
export const ladderAt = (x: number, y: number, reach: number) =>
  LADDERS.find((l) => {
    const cx = l.tx * TILE + TILE / 2;
    const cy = l.ty * TILE + TILE / 2;
    // Distance out from the wall face, and sideways from the ladder's middle.
    const out = (x - cx) * l.nx + (y - cy) * l.ny - TILE / 2;
    const side = Math.abs((x - cx) * -l.ny + (y - cy) * l.nx);
    return out > -0.05 && out < reach && side < 0.7;
  }) ?? null;

/** The spot just outside a door of building `i` nearest to (x, y): where to land to walk straight in. */
export const doorstep = (i: number, x: number, y: number) => {
  const b = BUILDINGS[i];
  let best = { x, y };
  let bd = Infinity;
  for (let ty = b.y0; ty < b.y0 + b.h; ty++) {
    for (let tx = b.x0; tx < b.x0 + b.w; tx++) {
      const nx = tx === b.x0 ? -1 : tx === b.x0 + b.w - 1 ? 1 : 0;
      const ny = ty === b.y0 ? -1 : ty === b.y0 + b.h - 1 ? 1 : 0;
      if ((!nx && !ny) || MAP[ty][tx] !== '.') continue;
      const px = (tx + 0.5 + nx * 1.6) * TILE;
      const py = (ty + 0.5 + ny * 1.6) * TILE;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = { x: px, y: py };
      }
    }
  }
  return best;
};
