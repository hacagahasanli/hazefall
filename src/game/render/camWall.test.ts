import { describe, expect, it } from 'vitest';
import { CAM_WALL, clampSide, wallSideWant } from './camWall';

// Looking along +x (yaw 0: c = 1, sn = 0), the lens's right is +z (the side offset moves the lens by (-sn, c)).
const wallAtZ = (wz: number) => (_x: number, z: number) => (wz > 0 ? z >= wz : z <= wz);

describe('shoulder camera off walls', () => {
  it('stays put in the open and between two walls equally close', () => {
    expect(wallSideWant(() => false, 0, 0, 1.7, 1, 0)).toBe(0);
    expect(wallSideWant((_x, z) => Math.abs(z) >= 0.5, 0, 0, 1.7, 1, 0)).toBeCloseTo(0, 6);
  });
  it('moves left, away from a wall 0.4 m to the right, by what is missing of 1 m', () => {
    expect(wallSideWant(wallAtZ(0.4), 0, 0, 1.7, 1, 0)).toBeCloseTo(-(CAM_WALL.clearM - 0.4), 6);
  });
  it('moves right, away from a wall on the left', () => {
    expect(wallSideWant(wallAtZ(-0.3), 0, 0, 1.7, 1, 0)).toBeGreaterThan(0.6);
  });
  it('ignores a wall a metre or more away', () => {
    expect(wallSideWant(wallAtZ(1.2), 0, 0, 1.7, 1, 0)).toBe(0);
  });
  it('keeps the offset between the head-clearing minimum and the corner-shot limit', () => {
    expect(clampSide(0.62 - 0.9)).toBe(CAM_WALL.minSide);
    expect(clampSide(0.62 + 0.9)).toBe(CAM_WALL.maxSide);
  });
});
