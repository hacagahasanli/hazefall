import { describe, expect, it } from 'vitest';

import { blocksPortrait } from './orientation';

describe('orientation gate', () => {
  it('blocks a touch screen held upright', () => {
    expect(blocksPortrait(true, 390, 844)).toBe(true);
    expect(blocksPortrait(true, 360, 780)).toBe(true);
  });
  it('lets landscape through', () => {
    expect(blocksPortrait(true, 844, 390)).toBe(false);
    expect(blocksPortrait(true, 800, 450)).toBe(false);
  });
  it('never blocks a mouse and keyboard window', () => {
    expect(blocksPortrait(false, 500, 900)).toBe(false);
  });
});
