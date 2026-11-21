/**
 * The parachute colours a player unlocks. Every jumper sees the canopy, so it is the reward: no new meshes, each one is a
 * pair of colours and a rule that picks one of them for every cell of the wing (`buildChute` paints with it). The default,
 * `classic`, is the fighter's own colour in stripes with white.
 */
export type CanopyPattern = 'stripes' | 'cells' | 'chevron' | 'split' | 'checker' | 'rainbow' | 'waves' | 'fade';

export interface Canopy {
  id: string;
  /** Shown in the lobby and on the level-up. */
  name: string;
  /** Where it comes from: a career level, or a day streak. */
  from: { level: number } | { streak: number };
  a: number;
  b: number;
  pattern: CanopyPattern;
}

export const CLASSIC = 'classic';

/** Unlocked in this order of level; the two streak canopies come from `STREAK_CANOPIES`. */
export const CANOPIES: Canopy[] = [
  { id: CLASSIC, name: 'Classic', from: { level: 1 }, a: 0, b: 0xf4f2ea, pattern: 'stripes' },
  { id: 'mint', name: 'Mint stripes', from: { level: 2 }, a: 0x3ddcb0, b: 0xf4f2ea, pattern: 'stripes' },
  { id: 'sunset', name: 'Sunset', from: { level: 3 }, a: 0xff8a2b, b: 0x8a3fd1, pattern: 'stripes' },
  { id: 'navy', name: 'Navy chevron', from: { level: 4 }, a: 0x1c2f6b, b: 0xe8eefc, pattern: 'chevron' },
  { id: 'gold', name: 'Gold cells', from: { level: 5 }, a: 0xffc233, b: 0xd9961a, pattern: 'cells' },
  { id: 'checker', name: 'Checker', from: { level: 7 }, a: 0x15171d, b: 0xf4f2ea, pattern: 'checker' },
  { id: 'split', name: 'Two-tone split', from: { level: 10 }, a: 0xff3d6e, b: 0x3ec5ff, pattern: 'split' },
  { id: 'rainbow', name: 'Rainbow cells', from: { level: 15 }, a: 0, b: 0, pattern: 'rainbow' },
  { id: 'night', name: 'Night', from: { level: 20 }, a: 0x141a33, b: 0x6f7fd1, pattern: 'cells' },
  { id: 'teal', name: 'Teal waves', from: { streak: 3 }, a: 0x1fb5a8, b: 0xbdf2ea, pattern: 'waves' },
  { id: 'ember', name: 'Ember', from: { streak: 7 }, a: 0xd9261c, b: 0xffb020, pattern: 'fade' },
];

export const canopyById = (id: string): Canopy => CANOPIES.find((c) => c.id === id) ?? CANOPIES[0];

/** The canopies a level reaches (all of those at or below it). */
export const canopiesForLevel = (level: number) => CANOPIES.filter((c) => 'level' in c.from && c.from.level <= level).map((c) => c.id);

/** The streak canopy a day count unlocks (3 and 7 days), or null. */
export const streakCanopy = (days: number): string | null => CANOPIES.find((c) => 'streak' in c.from && c.from.streak === days)?.id ?? null;

const hsl = (h: number) => {
  // A saturated, fairly light colour for hue h (0..1): the rainbow's cells.
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return 0.58 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to = (v: number) => Math.round(v * 255);
  return (to(f(0)) << 16) | (to(f(8)) << 8) | to(f(4));
};

/**
 * The colour (0xRRGGBB) of the cell at rib `i` (of `ns`) and station `j` (of `nc`) on the wing's top. `own` is the fighter's
 * colour, used by `classic` only. Underside and tips are shaded from it by the caller.
 */
export const cellColor = (c: Canopy, i: number, j: number, ns: number, nc: number, own: number): number => {
  const a = c.id === CLASSIC ? own : c.a;
  const b = c.b;
  switch (c.pattern) {
    case 'stripes':
      return i % 2 ? b : a;
    case 'cells':
    case 'checker':
      return (i + j) % 2 ? b : a;
    case 'chevron':
      // Rows of V shapes: the parity flips with the rib's distance from the middle.
      return (Math.abs(i - (ns - 1) / 2) + j) % 2 < 1 ? a : b;
    case 'split':
      return i < ns / 2 ? a : b;
    case 'rainbow':
      return hsl(i / ns);
    case 'waves':
      return (i + (j % 2)) % 2 ? b : a;
    case 'fade': {
      // Dark red at the left tip to gold at the right.
      const t = i / Math.max(1, ns - 1);
      const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
      return (lerp((a >> 16) & 255, (b >> 16) & 255) << 16) | (lerp((a >> 8) & 255, (b >> 8) & 255) << 8) | lerp(a & 255, b & 255);
    }
  }
};
