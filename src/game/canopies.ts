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

/** The levels are the reward track's (see cosmetics.ts); the two streak canopies come at 3 and 7 days. */
export const CANOPIES: Canopy[] = [
  { id: CLASSIC, name: 'Classic', from: { level: 1 }, a: 0, b: 0xf4f2ea, pattern: 'stripes' },
  { id: 'mint', name: 'Mint stripes', from: { level: 2 }, a: 0x3ddcb0, b: 0xf4f2ea, pattern: 'stripes' },
  { id: 'navy', name: 'Navy chevron', from: { level: 6 }, a: 0x1c2f6b, b: 0xe8eefc, pattern: 'chevron' },
  { id: 'checker', name: 'Checker', from: { level: 9 }, a: 0x15171d, b: 0xf4f2ea, pattern: 'checker' },
  { id: 'gold', name: 'Gold cells', from: { level: 10 }, a: 0xffc233, b: 0xd9961a, pattern: 'cells' },
  { id: 'split', name: 'Two-tone split', from: { level: 11 }, a: 0xff3d6e, b: 0x3ec5ff, pattern: 'split' },
  { id: 'sunset', name: 'Sunset', from: { level: 13 }, a: 0xff8a2b, b: 0x8a3fd1, pattern: 'stripes' },
  { id: 'rainbow', name: 'Rainbow cells', from: { level: 15 }, a: 0, b: 0, pattern: 'rainbow' },
  { id: 'night', name: 'Night', from: { level: 16 }, a: 0x141a33, b: 0x6f7fd1, pattern: 'cells' },
  { id: 'legend', name: 'Legend', from: { level: 20 }, a: 0x1c2024, b: 0xffc23d, pattern: 'cells' },
  { id: 'teal', name: 'Teal waves', from: { streak: 3 }, a: 0x1fb5a8, b: 0xbdf2ea, pattern: 'waves' },
  { id: 'ember', name: 'Ember', from: { streak: 7 }, a: 0xd9261c, b: 0xffb020, pattern: 'fade' },
];

export const canopyById = (id: string): Canopy => CANOPIES.find((c) => c.id === id) ?? CANOPIES[0];

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

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** A small CSS fill that shows a canopy's colours (the lobby's swatches and the level-up). */
export const canopySwatch = (c: Canopy, own = 0xff6a3d): string => {
  if (c.pattern === 'rainbow') return `linear-gradient(90deg, ${[0, 3, 6, 9, 11].map((i) => css(cellColor(c, i, 0, 12, 6, own))).join(', ')})`;
  if (c.pattern === 'fade' || c.pattern === 'split') return `linear-gradient(90deg, ${css(cellColor(c, 0, 0, 12, 6, own))}, ${css(cellColor(c, 11, 0, 12, 6, own))})`;
  const a = css(cellColor(c, 0, 0, 12, 6, own));
  const b = css(cellColor(c, 1, 0, 12, 6, own));
  return `repeating-linear-gradient(90deg, ${a} 0 5px, ${b} 5px 10px)`;
};
