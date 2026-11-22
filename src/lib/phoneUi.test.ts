import { describe, expect, it } from 'vitest';

import { isPhoneLandscape, MIN_SCALE, phoneScale } from './phoneUi';

describe('phone UI scale', () => {
  it('is 1 on the reference phone and on anything bigger', () => {
    expect(phoneScale(844, 390)).toBe(1);
    expect(phoneScale(932, 430)).toBe(1);
  });
  it('shrinks with the shorter side', () => {
    expect(phoneScale(800, 360)).toBeCloseTo(0.92, 2);
    expect(phoneScale(667, 375)).toBeCloseTo(0.88, 2);
    expect(phoneScale(568, 320)).toBeLessThan(0.85);
  });
  it('never goes below the floor', () => {
    expect(phoneScale(300, 150)).toBe(MIN_SCALE);
  });
  it('knows a landscape phone from a desktop window and a portrait phone', () => {
    expect(isPhoneLandscape(true, 844, 390)).toBe(true);
    expect(isPhoneLandscape(true, 390, 844)).toBe(false);
    expect(isPhoneLandscape(false, 844, 390)).toBe(false);
    expect(isPhoneLandscape(true, 1024, 768)).toBe(false);
  });
});
