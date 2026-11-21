import { describe, expect, it } from 'vitest';

import { doorwayInterior } from './world';

const W = 128;
const H = 96;
const px = doorwayInterior(W, H);
/** Average brightness (0..1) and warmth (red minus blue) of a box of pixels, u and v in 0..1 with v = 0 at the bottom. */
const sample = (u0: number, u1: number, v0: number, v1: number) => {
  let lum = 0;
  let warm = 0;
  let n = 0;
  for (let y = Math.floor(v0 * H); y < Math.ceil(v1 * H); y++)
    for (let x = Math.floor(u0 * W); x < Math.ceil(u1 * W); x++) {
      const o = (y * W + x) * 4;
      lum += (px[o] + px[o + 1] + px[o + 2]) / (3 * 255);
      warm += (px[o] - px[o + 2]) / 255;
      n++;
    }
  return { lum: lum / n, warm: warm / n };
};

describe('the open doorway seen from outside', () => {
  it('is opaque and the right size', () => {
    expect(px.length).toBe(W * H * 4);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it('is no white slab: nothing near white, and on the whole a mid-dark warm room', () => {
    const all = sample(0, 1, 0, 1);
    expect(all.lum).toBeGreaterThan(0.15);
    expect(all.lum).toBeLessThan(0.45);
    expect(all.warm).toBeGreaterThan(0.1);
    let brightest = 0;
    for (let i = 0; i < px.length; i += 4) brightest = Math.max(brightest, (px[i] + px[i + 1] + px[i + 2]) / 3);
    expect(brightest).toBeLessThan(220);
  });

  it('has depth: the floor is lit at the threshold and darker towards the back wall', () => {
    const threshold = sample(0.35, 0.65, 0, 0.12);
    const back = sample(0.35, 0.65, 0.48, 0.58);
    const backWall = sample(0.35, 0.65, 0.7, 0.85);
    expect(threshold.lum).toBeGreaterThan(back.lum * 1.3);
    expect(back.lum).toBeGreaterThan(backWall.lum);
  });

  it('shows the door leaf swung open against the right-hand wall, lighter than the wall across from it', () => {
    const leaf = sample(0.9, 0.98, 0.3, 0.7);
    const leftWall = sample(0.02, 0.1, 0.3, 0.7);
    expect(leaf.lum).toBeGreaterThan(leftWall.lum);
    expect(leaf.warm).toBeGreaterThan(leftWall.warm);
  });
});
