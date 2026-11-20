/**
 * The sound budget: how often each one-shot may start and how many of it may sound at once. `sfx.ts` and `uiSound.ts` ask
 * the gate before building a voice; over budget, the sound is dropped (never queued). Gunshots keep their own pool in
 * sfx.ts (SHOT_BUDGET, 5 voices) and hit ticks their own 45 ms rule. The contract is docs/SOUND.md: a
 * new sound gets a row here first, and the test fails if a gated name has none.
 *
 * No Web Audio here, so it runs (and is tested) in node.
 */

export interface Budget {
  /** Minimum time between two starts. */
  cooldownMs: number;
  /** How many may sound at once. */
  maxVoices: number;
  /** How long one counts as sounding. */
  lengthMs: number;
}

export const BUDGET = {
  // Other fighters' steps: a crowd running past is a patter, not a drum roll. Your own steps skip the gate.
  step: { cooldownMs: 0, maxVoices: 4, lengthMs: 120 },
  hit: { cooldownMs: 0, maxVoices: 3, lengthMs: 150 },
  reload: { cooldownMs: 0, maxVoices: 2, lengthMs: 600 },
  vault: { cooldownMs: 0, maxVoices: 2, lengthMs: 450 },
  dryFire: { cooldownMs: 220, maxVoices: 1, lengthMs: 80 },
  explosion: { cooldownMs: 90, maxVoices: 2, lengthMs: 1000 },
  glass: { cooldownMs: 150, maxVoices: 1, lengthMs: 400 },
  push: { cooldownMs: 120, maxVoices: 2, lengthMs: 300 },
  ko: { cooldownMs: 150, maxVoices: 2, lengthMs: 700 },
  // Menu ticks: holding an arrow key repeats ~30 times a second; a tick every 45 ms at most.
  uiTick: { cooldownMs: 45, maxVoices: 2, lengthMs: 120 },
} as const satisfies Record<string, Budget>;

export type SoundName = keyof typeof BUDGET;

export interface Gate {
  allow: (name: SoundName, now: number) => boolean;
  active: (name: SoundName, now: number) => number;
  stats: () => Record<string, { played: number; dropped: number }>;
}

export const createGate = (budget: Record<string, Budget> = BUDGET): Gate => {
  const last = new Map<string, number>();
  const ends = new Map<string, number[]>();
  const counts: Record<string, { played: number; dropped: number }> = {};
  const live = (name: string, now: number) => {
    const e = (ends.get(name) ?? []).filter((t) => t > now);
    ends.set(name, e);
    return e;
  };
  return {
    allow: (name, now) => {
      const b = budget[name];
      const c = (counts[name] ??= { played: 0, dropped: 0 });
      const prev = last.get(name);
      const e = live(name, now);
      if ((prev !== undefined && now - prev < b.cooldownMs) || e.length >= b.maxVoices) {
        c.dropped++;
        return false;
      }
      last.set(name, now);
      e.push(now + b.lengthMs);
      c.played++;
      return true;
    },
    active: (name, now) => live(name, now).length,
    stats: () => counts,
  };
};
