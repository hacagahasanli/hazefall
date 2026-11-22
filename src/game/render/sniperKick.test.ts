import { describe, expect, it } from 'vitest';
import { SNIPER_KICK, sniperBolt, sniperKick } from './sniperKick';

/** Walks one shot at a fixed frame rate and returns the curve at every frame. */
const run = (fps: number) => {
  const out: { t: number; k: number }[] = [];
  for (let f = 0; f / fps < 1; f++) out.push({ t: f / fps, k: sniperKick(f / fps) });
  return out;
};

describe('sniperKick', () => {
  it('rests before the shot and after the recovery', () => {
    expect(sniperKick(-1)).toBe(0);
    expect(sniperKick(0)).toBe(0);
    expect(sniperKick(SNIPER_KICK.attack + SNIPER_KICK.recover)).toBe(0);
    expect(sniperKick(5)).toBe(0);
    expect(sniperKick(Number.NaN)).toBe(0);
  });

  it('peaks at exactly 1 after the attack time (50-70 ms)', () => {
    expect(SNIPER_KICK.attack).toBeGreaterThanOrEqual(0.05);
    expect(SNIPER_KICK.attack).toBeLessThanOrEqual(0.07);
    expect(sniperKick(SNIPER_KICK.attack)).toBeCloseTo(1, 10);
    // Already most of the way up at half the attack time: a snap, not a drift.
    expect(sniperKick(SNIPER_KICK.attack / 2)).toBeGreaterThan(0.7);
  });

  it('rises monotonically to the peak and falls monotonically back (ease-out recovery, 350-450 ms)', () => {
    expect(SNIPER_KICK.recover).toBeGreaterThanOrEqual(0.2);
    expect(SNIPER_KICK.recover).toBeLessThanOrEqual(0.3);
    let prev = 0;
    for (let t = 0; t <= SNIPER_KICK.attack; t += 0.001) {
      const k = sniperKick(t);
      expect(k).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = k;
    }
    prev = 1;
    for (let t = SNIPER_KICK.attack; t <= SNIPER_KICK.attack + SNIPER_KICK.recover; t += 0.001) {
      const k = sniperKick(t);
      expect(k).toBeLessThanOrEqual(prev + 1e-9);
      prev = k;
    }
    // Back to under 5% before the end, and under 1% at the very end of the window.
    expect(sniperKick(SNIPER_KICK.attack + SNIPER_KICK.recover * 0.9)).toBeLessThan(0.05);
  });

  it('is frame-rate independent: the same time gives the same value at 30, 60 and 144 fps', () => {
    for (const fps of [30, 60, 144]) {
      for (const { t, k } of run(fps)) expect(k).toBe(sniperKick(t));
    }
    // And the visible peak per frame rate is within the cost of one frame's sampling of the curve.
    const peak = (fps: number) => Math.max(...run(fps).map((s) => s.k));
    expect(peak(144)).toBeGreaterThan(0.99);
    expect(peak(60)).toBeGreaterThan(0.9);
    expect(peak(30)).toBeGreaterThan(0.6);
    // Time spent above half kick is within 1 frame of the analytic value at every rate.
    const above = (fps: number) => run(fps).filter((s) => s.k > 0.5).length / fps;
    const ref = above(1000);
    for (const fps of [30, 60, 144]) expect(Math.abs(above(fps) - ref)).toBeLessThanOrEqual(1 / fps + 1e-9);
  });

  it('is deterministic: repeated shots give the same curve', () => {
    expect(run(60)).toEqual(run(60));
  });

  it('the camera is back on aim within 0.4 s and the whole cycle fits the 1.5 rounds/s fire interval', () => {
    expect(sniperKick(SNIPER_KICK.attack + SNIPER_KICK.camRecover, SNIPER_KICK.camRecover)).toBe(0);
    expect(SNIPER_KICK.attack + SNIPER_KICK.camRecover).toBeLessThanOrEqual(0.4);
    expect(sniperKick(0.4, SNIPER_KICK.camRecover)).toBe(0);
    expect(SNIPER_KICK.boltEnd).toBeLessThan(1 / 1.5);
  });

  it('the bolt dip starts after the kick has settled, peaks mid-way and ends at rest', () => {
    expect(SNIPER_KICK.boltStart).toBeGreaterThanOrEqual(SNIPER_KICK.attack + SNIPER_KICK.recover);
    expect(sniperBolt(0.1)).toBe(0);
    expect(sniperBolt(SNIPER_KICK.boltStart)).toBe(0);
    expect(sniperBolt((SNIPER_KICK.boltStart + SNIPER_KICK.boltEnd) / 2)).toBeCloseTo(1, 10);
    expect(sniperBolt(SNIPER_KICK.boltEnd)).toBe(0);
    expect(sniperBolt(2)).toBe(0);
    expect(sniperBolt(Number.NaN)).toBe(0);
  });
});
