import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DROP } from '../sim/constants';

import { buildChute, CHUTE_UP, moveChute, newChuteMotion, shapeChute } from './chute';

import type { ChuteParts } from './chute';

const body = () => ({
  strapL: new THREE.Vector3(-0.17, 0, 0),
  strapR: new THREE.Vector3(0.17, 0, 0),
  handL: new THREE.Vector3(-0.4, 0.3, 0.1),
  handR: new THREE.Vector3(0.4, 0.3, 0.1),
});
const ends = (g: THREE.Group) => {
  const a = (g.userData.parts as ChuteParts).lines.geometry.attributes.position.array as Float32Array;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < a.length; i += 3) out.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2]));
  return out;
};
const near = (v: THREE.Vector3, list: THREE.Vector3[]) => list.some((w) => w.distanceTo(v) < 1e-4);

describe('the canopy', () => {
  it('opens in stages: bag and lines first, then a narrow streamer, then the full wing', () => {
    const g = buildChute('#e8542f');
    const parts = g.userData.parts as ChuteParts;
    const width = () => {
      const a = parts.canopy.geometry.attributes.position.array as Float32Array;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < a.length; i += 3) {
        lo = Math.min(lo, a[i]);
        hi = Math.max(hi, a[i]);
      }
      return hi - lo;
    };
    shapeChute(g, { canopy: 0.1, time: 0, seed: 1, brakeL: 0, brakeR: 0, ...body() });
    expect(parts.canopy.visible).toBe(false);
    expect(parts.bag.visible).toBe(true);
    expect(parts.bag.position.y).toBeLessThan(CHUTE_UP * 0.5);
    shapeChute(g, { canopy: DROP.stretch + 0.05, time: 0, seed: 1, brakeL: 0, brakeR: 0, ...body() });
    expect(parts.canopy.visible).toBe(true);
    const streamer = width();
    shapeChute(g, { canopy: DROP.deployTime + 1, time: 0, seed: 1, brakeL: 0, brakeR: 0, ...body() });
    expect(parts.bag.visible).toBe(false);
    const wing = width();
    expect(streamer).toBeLessThan(wing * 0.4);
    expect(wing).toBeGreaterThan(4.5);
  });

  it('the lines stay connected: risers start at the straps, brake lines at the hands, lines end on the wing', () => {
    const g = buildChute('#e8542f');
    const b = body();
    b.handL.set(-0.3, -0.2, 0.2); // a toggle pulled down
    shapeChute(g, { canopy: 5, time: 1.3, seed: 2, brakeL: 1, brakeR: 0, ...b });
    const e = ends(g);
    for (const p of [b.strapL, b.strapR, b.handL, b.handR]) expect(near(p, e)).toBe(true);
    const parts = g.userData.parts as ChuteParts;
    const wing: THREE.Vector3[] = [];
    for (let i = 0; i < parts.pts.length; i += 3) wing.push(new THREE.Vector3(parts.pts[i], parts.pts[i + 1], parts.pts[i + 2]));
    // Every line's upper end is a point of the wing, a riser top, or the cascade above a hand.
    const tops = e.filter((_, i) => i % 2 === 1);
    expect(tops.filter((p) => near(p, wing)).length).toBeGreaterThanOrEqual(21 + 6);
  });

  it('a pulled toggle drags its own side of the trailing edge down', () => {
    const g = buildChute('#e8542f');
    const parts = g.userData.parts as ChuteParts;
    const tipY = () => {
      // Trailing edge at the two tips (rib 0 is the L side, rib 12 the R side; station 6 is the trailing edge).
      const at = (i: number) => parts.pts[(i * 7 + 6) * 3 + 1];
      return { l: at(0), r: at(12) };
    };
    shapeChute(g, { canopy: 5, time: 0, seed: 0, brakeL: 1, brakeR: 0, ...body() });
    const t = tipY();
    expect(t.l).toBeLessThan(t.r - 0.4);
  });

  it('turns with inertia and banks into the turn, pulling the inside toggle', () => {
    const m = newChuteMotion(0);
    let r = { brakeL: 0, brakeR: 0, turn: 0 };
    const yaws: number[] = [];
    // Flying +x, then the stick asks for +y (yaw rising).
    for (let i = 0; i < 30; i++) {
      r = moveChute(m, 1 / 60, { vx: 0, vy: 6, canopy: 5, time: i / 60, seed: 0 });
      yaws.push(m.yaw);
    }
    expect(yaws[0]).toBeLessThan(0.01); // no snap
    expect(m.yaw).toBeGreaterThan(0.1);
    expect(m.yaw).toBeLessThan(Math.PI / 2);
    expect(r.brakeL).toBeGreaterThan(0);
    expect(r.brakeR).toBe(0);
    for (let i = 0; i < 20; i++) moveChute(m, 1 / 60, { vx: 0, vy: 6, canopy: 5, time: 1, seed: 0 });
    expect(m.bank).toBeGreaterThan(0.05);
    for (let i = 0; i < 600; i++) moveChute(m, 1 / 60, { vx: 0, vy: 6, canopy: 5, time: 2 + i / 60, seed: 0 });
    expect(m.yaw).toBeCloseTo(Math.PI / 2, 1);
    expect(Math.abs(m.bank)).toBeLessThan(0.03);
  });
});
