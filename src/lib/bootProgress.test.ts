import { describe, expect, it } from 'vitest';

import { createBootProgress } from './bootProgress';

const run = (p: ReturnType<typeof createBootProgress>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) p.tick(dt);
};

describe('boot progress', () => {
  it('starts at zero and eases towards a checkpoint instead of jumping', () => {
    const p = createBootProgress();
    expect(p.percent()).toBe(0);
    p.reach(0.5);
    p.tick(1 / 60);
    expect(p.value()).toBeGreaterThan(0);
    expect(p.value()).toBeLessThan(0.1);
    run(p, 3);
    expect(p.value()).toBeCloseTo(0.5, 3);
    expect(p.percent()).toBe(50);
  });

  it('the percent is always the bar value floored, never ahead of it', () => {
    const p = createBootProgress();
    const steps: [number, number?][] = [[0.1, 0.4], [0.4, 0.5], [0.52], [0.55, 0.95], [0.7, 0.95], [0.95]];
    for (const [at, next] of steps) {
      p.reach(at, next);
      for (let i = 0; i < 40; i++) {
        p.tick(1 / 60);
        expect(p.percent()).toBe(Math.floor(p.value() * 100 + 1e-9));
      }
    }
  });

  it('never goes backwards, whatever order the checkpoints come in', () => {
    const p = createBootProgress();
    let last = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      if (i % 25 === 0) p.reach(rnd(), rnd());
      p.tick(rnd() * 0.2);
      expect(p.value()).toBeGreaterThanOrEqual(last);
      last = p.value();
    }
  });

  it('stays at 99 % at most until complete, even at a checkpoint of 1', () => {
    const p = createBootProgress();
    p.reach(1, 1);
    run(p, 10);
    expect(p.percent()).toBe(99);
    expect(p.value()).toBeLessThanOrEqual(0.99);
    expect(p.finished()).toBe(false);
  });

  it('creeps towards the next checkpoint between real ones, but never reaches it', () => {
    const p = createBootProgress();
    p.reach(0.5, 0.6);
    run(p, 1);
    const early = p.value();
    expect(early).toBeGreaterThan(0.5);
    run(p, 60);
    expect(p.value()).toBeGreaterThan(early);
    expect(p.value()).toBeLessThan(0.6);
  });

  it('a later checkpoint below what creep already showed holds the value still', () => {
    const p = createBootProgress();
    p.reach(0.5, 0.9);
    run(p, 20);
    const v = p.value();
    p.reach(0.55, 0.9);
    p.tick(1 / 60);
    expect(p.value()).toBeGreaterThanOrEqual(v);
  });

  it('shows 100 % and finishes only after complete, once the bar has arrived', () => {
    const p = createBootProgress();
    p.reach(0.6);
    run(p, 2);
    p.complete();
    p.tick(1 / 60);
    expect(p.percent()).toBeLessThan(100);
    expect(p.finished()).toBe(false);
    run(p, 3);
    expect(p.percent()).toBe(100);
    expect(p.value()).toBe(1);
    expect(p.finished()).toBe(true);
  });

  it('a long stall (a busy page, a hidden tab) is one bounded step, not a teleport past the target', () => {
    const p = createBootProgress();
    p.reach(0.4, 0.5);
    p.tick(30);
    expect(p.value()).toBeLessThan(0.5);
    expect(p.value()).toBeGreaterThan(0);
  });

  it('ignores junk input', () => {
    const p = createBootProgress();
    p.reach(Number.NaN, Number.POSITIVE_INFINITY);
    p.tick(Number.NaN);
    p.tick(-1);
    expect(p.value()).toBe(0);
    p.reach(-3);
    run(p, 1);
    expect(p.percent()).toBe(0);
  });
});
