import { describe, expect, it } from 'vitest';

import { arcColor, arcPath, FLINCH_LIFE, flinchCurve, HITSTOP, hitstopFor, markColor, screenAngle } from './feedback';

const near = (a: number, b: number) => {
  // Same direction on the circle.
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  expect(Math.abs(d)).toBeLessThan(1e-9);
};

describe('damage direction', () => {
  it('from the high camera: map x is screen right, map y is screen down', () => {
    near(screenAngle(1, 0, null), 0);
    near(screenAngle(0, 1, null), Math.PI / 2);
    near(screenAngle(0, -1, null), -Math.PI / 2);
  });

  it('in first person: a shooter ahead is up the screen, one on your right is right, one behind is down', () => {
    const yaw = 0.7;
    const ahead = { x: Math.cos(yaw), y: Math.sin(yaw) };
    const right = { x: -Math.sin(yaw), y: Math.cos(yaw) };
    near(screenAngle(ahead.x, ahead.y, yaw), -Math.PI / 2);
    near(screenAngle(right.x, right.y, yaw), 0);
    near(screenAngle(-ahead.x, -ahead.y, yaw), Math.PI / 2);
  });

  it('draws the arc centred on the direction', () => {
    expect(arcPath(100, 100, 50, 0, 0.6)).toMatch(/^M\d+\.\d \d+\.\dA50\.0 50\.0 0 0 1 /);
  });
});

describe('colours', () => {
  it('white hit, blue armor, red kill; orange in place of red for colour-blind players', () => {
    expect(markColor('hit', false)).toBe('#ffffff');
    expect(markColor('armor', false)).toBe('#3ec5ff');
    expect(markColor('break', false)).toBe('#3ec5ff');
    expect(markColor('kill', false)).toBe('#ff3048');
    expect(markColor('kill', true)).toBe('#ff9f1c');
    expect(arcColor(true)).toBe('#ff9f1c');
  });
});

describe('hit punch', () => {
  it('holds longest on a kill, a little on a heavy gun, a few ms on a light one', () => {
    expect(hitstopFor('rifle', true, 0)).toBe(HITSTOP.kill);
    expect(hitstopFor('shotgun', false, 0)).toBe(HITSTOP.heavy);
    expect(hitstopFor('smg', false, 1)).toBe(HITSTOP.light);
    expect(HITSTOP.light).toBeLessThan(0.04);
  });

  it('a spray of light hits holds at most once per gap', () => {
    expect(hitstopFor('smg', false, HITSTOP.lightGap / 2)).toBe(0);
    expect(hitstopFor('smg', false, HITSTOP.lightGap)).toBe(HITSTOP.light);
  });

  it('the flinch snaps out, peaks early and is gone by its end', () => {
    expect(flinchCurve(0)).toBe(0);
    expect(flinchCurve(0.03)).toBeCloseTo(1);
    expect(flinchCurve(0.08)).toBeLessThan(1);
    expect(flinchCurve(0.08)).toBeGreaterThan(flinchCurve(0.12));
    expect(flinchCurve(FLINCH_LIFE)).toBe(0);
    expect(flinchCurve(-1)).toBe(0);
  });
});
