/**
 * What a big prop on its 'v' tiles really is to a body and to a bullet: a box the size the renderer draws (props.ts), as
 * tall as it stands. Before this every 'v' tile was a full 2 m square up to the eaves (2.6 m), so a shipping container
 * (drawn 2.45 m wide on a 4 m footprint) had an invisible wall 0.8 m out on each long side, and the 12 m HQ block was
 * solid only to 2.6 m: a parachute came straight down into it and the jumper was then shoved out from the ground.
 *
 * `stand` props have a flat top you can land on from the sky (or walk on once there): containers, boxcars and the HQ roof.
 * Pure data from the map, shared by the simulation and the renderer.
 */
import { PROPS, SIZE, STADIUM, TILE } from './constants';

import type { Prop } from './constants';

export interface PropSolid {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height of its top (m): you are blocked below it, rounds stop below it. */
  top: number;
  /** A flat top you can stand on. */
  stand: boolean;
  kind: Prop['kind'];
}

/** A stacked container's top box (props.ts draws two when the seed is over 0.6). */
export const containerStack = (p: Prop) => (p.seed > 0.6 ? 2 : 1);
export const CONTAINER = { length: 5.8, width: 2.45, height: 2.6, gap: 0.02 };
export const BOXCAR = { length: 5.9, width: 2.4, height: 3.1 };
export const HQ = { size: 11.6, top: 12.8 };

const solidOf = (p: Prop): PropSolid => {
  const cx = (p.x0 + p.w / 2) * TILE;
  const cy = (p.y0 + p.h / 2) * TILE;
  const alongX = p.w >= p.h;
  const box = (len: number, wid: number, top: number, stand: boolean): PropSolid => {
    const hx = (alongX ? len : wid) / 2;
    const hy = (alongX ? wid : len) / 2;
    return { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy, top, stand, kind: p.kind };
  };
  switch (p.kind) {
    case 'container':
      // Drawn turned up to 3.4 degrees off square: a few centimetres of slop on the width.
      return box(CONTAINER.length, CONTAINER.width + 0.1, CONTAINER.height * containerStack(p) + CONTAINER.gap * (containerStack(p) - 1), true);
    case 'boxcar':
      return box(BOXCAR.length, BOXCAR.width, BOXCAR.height, true);
    case 'hq':
      return { x0: cx - HQ.size / 2, y0: cy - HQ.size / 2, x1: cx + HQ.size / 2, y1: cy + HQ.size / 2, top: HQ.top, stand: true, kind: p.kind };
    case 'car':
      return box(4.2, 1.95, 1.5, false);
    case 'tent':
      return box(3.4, 3.4, 2.2, false);
    default:
      // Towers, cranes, the mast, the lookout, signs, gantries, the conveyor and the windmill: their footprint, as before.
      return { x0: p.x0 * TILE, y0: p.y0 * TILE, x1: (p.x0 + p.w) * TILE, y1: (p.y0 + p.h) * TILE, top: 2.6, stand: false, kind: p.kind };
  }
};

export const PROP_SOLIDS: PropSolid[] = PROPS.map(solidOf);

/** Which prop stands on each tile (index into PROP_SOLIDS), -1 for none. */
const BY_TILE = new Int16Array(SIZE * SIZE).fill(-1);
PROPS.forEach((p, i) => {
  // The river covers the whole map as decor, and The Pitch is a ring of walls and stands round an open pitch: neither is
  // one box. The Pitch's solid tiles are handled one by one below.
  if (p.kind === 'river' || p.kind === 'stadium') return;
  for (let y = p.y0; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) BY_TILE[y * SIZE + x] = i;
});

/** The Pitch's walls, stands, dugouts and set pieces: each 'v' tile is its own box, as tall as the outer wall. */
const STADIUM_TOP = 3.6;
const inStadium = (tx: number, ty: number) => tx >= STADIUM.x0 && tx < STADIUM.x0 + STADIUM.w && ty >= STADIUM.y0 && ty < STADIUM.y0 + STADIUM.h;

/** The prop standing on tile (tx, ty), if any. */
export const propOnTile = (tx: number, ty: number): PropSolid | null => {
  if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return null;
  const i = BY_TILE[ty * SIZE + tx];
  if (i >= 0) return PROP_SOLIDS[i];
  if (inStadium(tx, ty)) return { x0: tx * TILE, y0: ty * TILE, x1: tx * TILE + TILE, y1: ty * TILE + TILE, top: STADIUM_TOP, stand: false, kind: 'stadium' };
  return null;
};

const inside = (s: PropSolid, x: number, y: number) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;

/** The flat top under (x, y) that a body could stand on (its height), or -1. */
export const propTopAt = (x: number, y: number) => {
  const s = propOnTile(Math.floor(x / TILE), Math.floor(y / TILE));
  return s && s.stand && inside(s, x, y) ? s.top : -1;
};
