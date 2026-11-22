import { describe, expect, it } from 'vitest';

import { BUILDINGS, MAP, TILE } from '../sim/constants';
import { EAVE } from '../sim/roofs';

import { DOOR_HALF, doorwayCut, findDoorways } from './world';

const doors = findDoorways();
const tileAt = (x: number, z: number) => MAP[Math.floor(z / TILE)]?.[Math.floor(x / TILE)];

describe('the holes cut in the house shells at their doorways', () => {
  it('finds a doorway in every building, each one two open tiles in its outer ring', () => {
    BUILDINGS.forEach((_, bi) => expect(doors.some((d) => d.building === bi)).toBe(true));
    for (const d of doors) {
      const b = BUILDINGS[d.building];
      // Just inside the wall line, half a tile either side of the middle: both tiles open floor in the ring.
      const ix = d.horizontal ? [d.x - TILE / 2, d.x + TILE / 2] : [d.x - (d.out * TILE) / 2, d.x - (d.out * TILE) / 2];
      const iz = d.horizontal ? [d.z - (d.out * TILE) / 2, d.z - (d.out * TILE) / 2] : [d.z - TILE / 2, d.z + TILE / 2];
      for (let k = 0; k < 2; k++) {
        expect(tileAt(ix[k], iz[k])).toBe('.');
        const tx = Math.floor(ix[k] / TILE);
        const ty = Math.floor(iz[k] / TILE);
        expect(tx === b.x0 || ty === b.y0 || tx === b.x0 + b.w - 1 || ty === b.y0 + b.h - 1).toBe(true);
      }
      // Just outside: not the building any more.
      const ox = d.horizontal ? d.x : d.x + d.out * 0.5;
      const oz = d.horizontal ? d.z + d.out * 0.5 : d.z;
      expect(ox < b.x0 * TILE || oz < b.y0 * TILE || ox >= (b.x0 + b.w) * TILE || oz >= (b.y0 + b.h) * TILE).toBe(true);
    }
  });

  it('cuts only the opening: no wider than the two door tiles, under the eaves, a metre deep at most', () => {
    for (const d of doors) {
      const { min, max } = doorwayCut(d);
      expect(max.y).toBeLessThan(EAVE);
      const along = d.horizontal ? [min.x, max.x] : [min.z, max.z];
      const across = d.horizontal ? [min.z, max.z] : [min.x, max.x];
      const mid = d.horizontal ? d.x : d.z;
      const wall = d.horizontal ? d.z : d.x;
      expect(along[1] - along[0]).toBeCloseTo(DOOR_HALF * 2);
      expect(along[0]).toBeGreaterThanOrEqual(mid - TILE);
      expect(along[1]).toBeLessThanOrEqual(mid + TILE);
      // Inward a metre, outward less than half a metre.
      const inward = d.out > 0 ? wall - across[0] : across[1] - wall;
      const outward = d.out > 0 ? across[1] - wall : wall - across[0];
      expect(inward).toBeCloseTo(1);
      expect(outward).toBeLessThan(0.5);
    }
  });

  it('never cuts into another doorway of the same house', () => {
    BUILDINGS.forEach((_, bi) => {
      const boxes = doors.filter((d) => d.building === bi).map(doorwayCut);
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          expect(a.min.x < b.max.x && b.min.x < a.max.x && a.min.z < b.max.z && b.min.z < a.max.z).toBe(false);
        }
    });
  });
});
