import { describe, expect, it } from 'vitest';

import { arrowTo, LOOT_HINT } from './hints';

describe('the loot arrow', () => {
  it('points the way on the map: east right, north up (y shrinks), south down', () => {
    expect(arrowTo(10, 0)).toBe('→');
    expect(arrowTo(-10, 0)).toBe('←');
    expect(arrowTo(0, -10)).toBe('↑');
    expect(arrowTo(0, 10)).toBe('↓');
    expect(arrowTo(7, -7)).toBe('↗');
    expect(arrowTo(-7, 7)).toBe('↙');
    expect(arrowTo(7, 7)).toBe('↘');
    expect(arrowTo(-7, -7)).toBe('↖');
  });
  it('shows for four seconds when nothing is within 25 m', () => {
    expect(LOOT_HINT).toEqual({ radius: 25, seconds: 4 });
  });
});
