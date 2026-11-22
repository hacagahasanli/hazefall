/**
 * The one number behind a loading screen. The bar's width and the percent text both read `value()`, so they can never
 * disagree. Real checkpoints (`reach`) move the target; between two checkpoints the target creeps a little towards the
 * next one (never past it), and the shown value eases towards the target, so the bar keeps moving smoothly without
 * claiming more than is done. It never goes back, and it stops at 99 % until `complete()`: 100 % only shows once
 * everything is really in, and `finished()` turns true only after the 100 % has been drawn.
 *
 * Pure and time-free (the caller passes the frame time to `tick`), so it is unit-tested, and the portal page's boot
 * screen runs this same file inlined as a plain script (see the boot-screen plugin in vite.portal.config.ts).
 */

export interface BootProgressOptions {
  /** The highest value before `complete()` (0.99: the text tops out at 99 %). */
  cap?: number;
  /** Seconds for the shown value to cover about 63 % of the way to the target. */
  ease?: number;
  /** Seconds for the creep to cover about 63 % of its share of the gap to the next checkpoint. */
  creep?: number;
  /** How much of the gap to the next checkpoint the creep may cover at most (0..1). */
  creepShare?: number;
}

export interface BootProgress {
  /** A real checkpoint: at least `at` is done (0..1), and `next` is where the next checkpoint will put it. */
  reach: (at: number, next?: number) => void;
  /** Everything is in: the value may now run to 1. */
  complete: () => void;
  /** Advances by `dt` seconds and returns the shown value. */
  tick: (dt: number) => number;
  /** The shown value, 0..1: the bar's width. */
  value: () => number;
  /** The shown value as the whole percent on screen: floor(value × 100), and 100 only once complete and arrived. */
  percent: () => number;
  /** Complete, and the shown value has arrived at 1. */
  finished: () => boolean;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export const createBootProgress = ({ cap = 0.99, ease = 0.22, creep = 3, creepShare = 0.7 }: BootProgressOptions = {}): BootProgress => {
  let at = 0;
  let next = 0;
  let since = 0;
  let shown = 0;
  let done = false;

  const target = () => {
    if (done) return 1;
    const gap = Math.max(0, next - at);
    return Math.min(cap, at + gap * creepShare * (1 - Math.exp(-since / creep)));
  };

  return {
    reach: (v, n) => {
      const a = clamp01(v);
      if (a > at) {
        at = a;
        since = 0;
      }
      if (n !== undefined) next = Math.max(next, clamp01(n));
      if (next < at) next = at;
    },
    complete: () => {
      done = true;
    },
    tick: (dt) => {
      const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
      since += d;
      const goal = target();
      if (goal > shown) {
        shown += (goal - shown) * (ease > 0 ? 1 - Math.exp(-d / ease) : 1);
        if (goal - shown < (done ? 0.004 : 0.0005)) shown = goal;
      }
      if (!done) shown = Math.min(shown, cap);
      return shown;
    },
    value: () => shown,
    percent: () => (done && shown >= 1 ? 100 : Math.min(99, Math.floor(shown * 100 + 1e-9))),
    finished: () => done && shown >= 1,
  };
};
