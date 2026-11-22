/**
 * What the game remembers about a player between visits: how many rounds they have played, their best placement and kills,
 * which fighter they keep picking. One JSON under `lcs.career` in `platform.storage` (CrazyGames' data module on the portal,
 * localStorage on the web). Pure functions only: the page loads, applies a finished round and saves.
 *
 * Old saves always load: a missing key, broken JSON, a field of the wrong type or a save from before a field existed give
 * that field's default, never an error and never a reset of the fields that are fine.
 */
import { FIGHTER_ORDER, LOOK_START, itemById, unlockedFor } from './cosmetics';
import { NEWBIE_ROUNDS } from './sim/constants';

import type { Look } from './cosmetics';
import type { KeyValue } from '~/platform/types';

export const CAREER_KEY = 'lcs.career';
/** The counter an earlier build kept on its own; read once when there is no career yet. */
const LEGACY_ROUNDS_KEY = 'lcs.roundsPlayed';

/** Today's daily goals and how far they got (see progress.ts). */
export interface Daily {
  /** The local day these goals belong to (YYYY-MM-DD). */
  day: string;
  goals: string[];
  progress: Record<string, number>;
  done: string[];
  /** Rounds finished today (0 = the next one is the first of the day). */
  rounds: number;
  allDone: boolean;
}

export interface Career {
  v: 2;
  /** Career level (from 1) and the XP earned into it. */
  level: number;
  xp: number;
  /** Kind-prefixed ids of everything unlocked (`outfit:arctic`, `finish:gold`, `canopy:mint`, `smoke:canopy`). */
  unlocked: string[];
  /** What is equipped: an outfit per fighter, and one gun finish, canopy and smoke setting. */
  look: Look;
  /** Unlocked ids the player has already looked at (the lobby's gold dot shows for the rest). */
  seen: string[];
  daily: Daily | null;
  /** Days in a row with a daily goal done, and the last such day (YYYY-MM-DD). */
  streak: { days: number; lastDay: string | null };
  roundsPlayed: number;
  wins: number;
  kills: number;
  /** Best (lowest) placement so far; null before the first round. */
  bestPlace: number | null;
  bestKills: number;
  /** The fighter picked in the most recent rounds, and how many rounds in a row. */
  fighterRun: { id: string | null; n: number };
}

/** XP to the next level: `min(900, 230 + 35 * (level - 1))`. Lives here so loading a save can clamp to it. */
export const xpToNext = (level: number) => Math.min(900, 230 + 35 * (level - 1));

export const defaultCareer = (): Career => ({
  v: 2,
  level: 1,
  xp: 0,
  unlocked: unlockedFor(1, 0),
  look: structuredClone(LOOK_START),
  seen: unlockedFor(1, 0),
  daily: null,
  streak: { days: 0, lastDay: null },
  roundsPlayed: 0,
  wins: 0,
  kills: 0,
  bestPlace: null,
  bestKills: 0,
  fighterRun: { id: null, n: 0 },
});

const count = (x: unknown, fallback = 0) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : fallback);

/** Reads the career from a store; anything missing or wrong falls back to the default for that field. */
export const loadCareer = (store: KeyValue): Career => {
  const base = defaultCareer();
  let raw: unknown = null;
  try {
    const text = store.getItem(CAREER_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    let legacy = 0;
    try {
      legacy = Number(store.getItem(LEGACY_ROUNDS_KEY));
    } catch {
      legacy = 0;
    }
    return { ...base, roundsPlayed: Number.isFinite(legacy) && legacy > 0 ? Math.floor(legacy) : 0 };
  }
  const o = raw as Record<string, unknown>;
  const run = o.fighterRun && typeof o.fighterRun === 'object' ? (o.fighterRun as Record<string, unknown>) : {};
  const bestPlace = count(o.bestPlace, 0);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  const streak = o.streak && typeof o.streak === 'object' ? (o.streak as Record<string, unknown>) : {};
  const d = o.daily && typeof o.daily === 'object' ? (o.daily as Record<string, unknown>) : null;
  const progress: Record<string, number> = {};
  if (d && d.progress && typeof d.progress === 'object') for (const [k, v] of Object.entries(d.progress)) progress[k] = count(v);
  const level = Math.max(1, count(o.level, 1));
  const days = count(streak.days);
  const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
  // Everything the table gives at or below the saved level, plus what the save already owned. A version 1 save listed plain
  // canopy ids; they become `canopy:<id>`. Nothing is ever taken away.
  const owned = strs(o.unlocked).map((id) => (itemById(id) ? id : itemById(`canopy:${id}`) ? `canopy:${id}` : ''));
  const unlocked = [...new Set([...unlockedFor(level, days), ...owned.filter(Boolean)])];
  // A streak item the old save owned as a canopy (Teal waves, Ember) brings its sibling (Ember's gun finish).
  if (unlocked.includes('canopy:ember') && !unlocked.includes('finish:ember')) unlocked.push('finish:ember');
  const has = (id: string) => unlocked.includes(id);
  const rawLook = rec(o.look);
  const rawOutfit = rec(rawLook.outfit);
  const pickId = (kind: string, val: unknown, fallback: string) => (typeof val === 'string' && has(`${kind}:${val}`) ? val : fallback);
  const look: Look = {
    outfit: Object.fromEntries(FIGHTER_ORDER.map((f) => [f, pickId('outfit', rawOutfit[f], 'standard')])) as Look['outfit'],
    finish: pickId('finish', rawLook.finish, 'factory'),
    // A version 1 save kept its picked canopy at the top level.
    canopy: pickId('canopy', rawLook.canopy ?? o.canopy, 'classic'),
    smoke: pickId('smoke', rawLook.smoke, level >= 5 && o.v !== 2 ? 'canopy' : 'off'),
  };
  // A save that never saw the gold dots has seen everything it already has.
  const seen = o.v === 2 ? strs(o.seen).filter(has) : unlocked;
  const xp = Math.min(count(o.xp), xpToNext(level) - 1);
  return {
    v: 2,
    level,
    xp,
    unlocked,
    look,
    seen,
    daily:
      d && typeof d.day === 'string'
        ? { day: d.day, goals: strs(d.goals), progress, done: strs(d.done), rounds: count(d.rounds), allDone: d.allDone === true }
        : null,
    streak: { days, lastDay: typeof streak.lastDay === 'string' ? streak.lastDay : null },
    roundsPlayed: count(o.roundsPlayed),
    wins: count(o.wins),
    kills: count(o.kills),
    bestPlace: bestPlace >= 1 ? bestPlace : null,
    bestKills: count(o.bestKills),
    fighterRun: { id: typeof run.id === 'string' ? run.id : null, n: count(run.n) },
  };
};

export const saveCareer = (store: KeyValue, c: Career) => {
  try {
    store.setItem(CAREER_KEY, JSON.stringify(c));
  } catch {
    /* the store refused: the career is simply not remembered */
  }
};

/** A new player's first rounds get the gentler bots (see `NEWBIE` in the sim). */
export const isRookie = (c: Career) => c.roundsPlayed < NEWBIE_ROUNDS;

/** What a finished round gives the career: the report's numbers. */
export interface RoundResult {
  fighter: string;
  place: number;
  total: number;
  won: boolean;
  kills: number;
  damage: number;
  survived: number;
}

/** The career after one more round (the input is not changed). */
export const recordRound = (c: Career, r: RoundResult): Career => ({
  ...c,
  roundsPlayed: c.roundsPlayed + 1,
  wins: c.wins + (r.won ? 1 : 0),
  kills: c.kills + r.kills,
  bestPlace: c.bestPlace === null ? r.place : Math.min(c.bestPlace, r.place),
  bestKills: Math.max(c.bestKills, r.kills),
  fighterRun: { id: r.fighter, n: c.fighterRun.id === r.fighter ? c.fighterRun.n + 1 : 1 },
});

/**
 * The one line of context under the stats: the first that applies (new best, first kill ever, best so far, fighters outlived). `before` is the career as it was when the round began.
 * Null when there is nothing worth saying (last place, no kills, nobody outlived).
 */
export const contextLine = (before: Career, r: RoundResult): string | null => {
  const best = before.bestPlace;
  if (best !== null && r.place < best) return `New best: #${r.place}`;
  // The first kill ever is a one-off: it goes before the line that would otherwise come up every round.
  if (r.kills > 0 && before.kills === 0) return 'First kill!';
  if (best !== null) return `Best so far: #${best}.${best > 3 ? ' Top 3 next.' : ''}`;
  const outlived = r.total - r.place;
  return outlived > 0 ? `You outlived ${outlived} ${outlived === 1 ? 'fighter' : 'fighters'}.` : null;
};

/** Fighters to suggest, in the order the nudge tries them (Rookie first). */
const NUDGE_ORDER = ['intern', 'standup', 'legacy', 'hotfix'];

/**
 * After three rounds in a row with one fighter (and again after every three more), the id of another fighter to try, so the
 * supers the game already has get noticed. Null otherwise. `after` is the career with the round just played.
 */
export const nudgeFighter = (after: Career): string | null => {
  const { id, n } = after.fighterRun;
  if (!id || n < 3 || n % 3 !== 0) return null;
  return NUDGE_ORDER.find((o) => o !== id) ?? null;
};
