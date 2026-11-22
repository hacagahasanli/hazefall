import { describe, expect, it } from 'vitest';
import { FOLIAGE_FADE, foliageAlpha } from './nature';

const cam: [number, number, number] = [0, 3.2, 0];
const chest: [number, number, number] = [0, 1.4, 4];
describe('foliage fade rule', () => {
  it('fades leaves within 3 m of the camera to 0.25', () => {
    expect(foliageAlpha([1.5, 3.5, -1], cam, chest)).toBeCloseTo(FOLIAGE_FADE.minAlpha);
  });
  it('fades leaves on the camera-to-chest segment', () => {
    expect(foliageAlpha([0.3, 1.9, 2.2], cam, chest)).toBeCloseTo(0.25);
  });
  it('leaves distant or off-line crowns solid', () => {
    expect(foliageAlpha([8, 5, 2], cam, chest)).toBe(1);
    expect(foliageAlpha([4, 4, 3], cam, chest)).toBe(1);
  });
  it('never touches underground parts', () => {
    expect(foliageAlpha([0, -0.1, 1], cam, chest)).toBe(1);
  });
  it('ramps smoothly outside the radius', () => {
    const a = foliageAlpha([0, 3, 3.3], [0, 3, 0], [9, 3, 0]);
    expect(a).toBeGreaterThan(0.25);
    expect(a).toBeLessThan(1);
  });
});
