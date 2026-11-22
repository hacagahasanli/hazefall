/**
 * Career level, unlocks, daily goals and the day streak: pure rules, applied to the saved `Career` after every round
 * (`applyRound`). The page only loads, calls this, saves, and shows the summary on the round report.
 *
 * XP per round (progression v2): 20 for playing, 1 per 6 s survived (up to 40), 2 per fighter outlasted, 20 per knock-out,
 * 1 per 25 damage, 60 for a win, 50 + 10 per streak day (up to 5) for the first round of the day, 75 per daily goal and 75
 * for all three. XP to the next level: `min(900, 230 + 35 * (level - 1))`.
 */
import { equipNew, rewardsAtLevel, rewardsAtStreak } from './cosmetics';
import { recordRound, xpToNext } from './career';
import { mulberry32 } from './sim/bot-params';

import type { Career, Daily, RoundResult } from './career';
import type { FighterId } from './sim/types';

/** What a round showed beyond the report's numbers (what the daily goals look at). */
export interface RoundFacts {
  /** The named place the player touched down in, or null. */
  landedIn: string | null;
  pickedRifle: boolean;
  /** Height (m) the canopy opened at, or null if it never did. */
  openedAlt: number | null;
}

export const NO_FACTS: RoundFacts = { landedIn: null, pickedRifle: false, openedAlt: null };

export { xpToNext };

// ---------- daily goals

export interface GoalDef {
  id: string;
  text: string;
  /** Progress needed, and what a round adds to it. */
  target: number;
  gain: (r: RoundResult, f: RoundFacts) => number;
  /** From this career level on (a win is a lot to ask on day one). */
  minLevel?: number;
}

export const GOALS: GoalDef[] = [
  { id: 'top10', text: 'Finish in the top 10', target: 1, gain: (r) => (r.place <= 10 ? 1 : 0) },
  { id: 'damage', text: 'Deal 300 damage', target: 300, gain: (r) => r.damage },
  { id: 'kos', text: 'Knock out 2 fighters', target: 2, gain: (r) => r.kills },
  { id: 'survive', text: 'Survive 3 minutes', target: 180, gain: (r) => r.survived },
  { id: 'yard', text: 'Land in the Container Yard', target: 1, gain: (_r, f) => (f.landedIn === 'Container Yard' ? 1 : 0) },
  { id: 'rifle', text: 'Pick up a rifle', target: 1, gain: (_r, f) => (f.pickedRifle ? 1 : 0) },
  { id: 'win', text: 'Win a round', target: 1, gain: (r) => (r.won ? 1 : 0), minLevel: 8 },
  { id: 'low', text: 'Open your canopy below 60 m', target: 1, gain: (_r, f) => (f.openedAlt !== null && f.openedAlt < 60 ? 1 : 0) },
];

export const GOAL_XP = 75;
export const ALL_GOALS_XP = 75;

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day of a moment: goals and streaks follow the player's own midnight. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yesterdayKey = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
/** Whole hours (rounded up, at least 1) until the next local midnight. */
export const hoursToReset = (d: Date) => Math.max(1, Math.ceil((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime()) / 3600000));

const seedOf = (day: string) => {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** Three different goals for a day: the same for everyone on that date (a seed of the date), and a win only from level 8. */
export const goalsFor = (day: string, level: number): string[] => {
  const pool = GOALS.filter((g) => (g.minLevel ?? 0) <= level).map((g) => g.id);
  const rand = mulberry32(seedOf(day));
  const picked: string[] = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return picked;
};

export const newDaily = (day: string, level: number): Daily => ({ day, goals: goalsFor(day, level), progress: {}, done: [], rounds: 0, allDone: false });

/** Today's goals for this career (new ones when the day has changed; nothing is saved by looking). */
export const dailyFor = (c: Career, now: Date): Daily => (c.daily && c.daily.day === dayKey(now) ? c.daily : newDaily(dayKey(now), c.level));

export const goalDef = (id: string) => GOALS.find((g) => g.id === id);

// ---------- one finished round

export interface XpLine {
  label: string;
  xp: number;
  /** A daily goal finished this round (the report flashes it gold). */
  goal?: boolean;
}

export interface RoundSummary {
  lines: XpLine[];
  gained: number;
  /** Level and XP into it before and after. */
  before: { level: number; xp: number };
  after: { level: number; xp: number };
  levelUps: number[];
  /** Item ids unlocked by this round (by level or by a streak), in the order of the track. */
  newItems: string[];
  /** Goals finished by this round. */
  goalsDone: string[];
  streak: number;
}

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** The streak as it stands on this day: a streak whose last day was before yesterday has already ended. */
export const liveStreak = (c: Career, now: Date): number => (c.streak.lastDay === dayKey(now) || c.streak.lastDay === yesterdayKey(now) ? c.streak.days : 0);

/** The line under the goals while a streak runs. */
export const streakLine = (days: number) => (days < 7 ? `${days}-day streak. Day 7 unlocks Ember.` : `${days}-day streak.`);

/** The XP lines a round earns before the daily goals add theirs. `streak` is the days in a row going into the round. */
export const roundLines = (r: RoundResult, firstOfDay: boolean, streak = 0): XpLine[] => {
  const lines: XpLine[] = [
    { label: 'Round played', xp: 20 },
    { label: `Survived ${clock(r.survived)}`, xp: Math.min(40, Math.floor(r.survived / 6)) },
    { label: `Outlasted ${Math.max(0, r.total - r.place)}`, xp: Math.max(0, r.total - r.place) * 2 },
    { label: r.kills === 1 ? 'Knock-out' : `Knock-outs x${r.kills}`, xp: r.kills * 20 },
    { label: `Damage ${Math.round(r.damage)}`, xp: Math.floor(r.damage / 25) },
  ];
  if (r.won) lines.push({ label: 'Win', xp: 60 });
  if (firstOfDay) lines.push({ label: streak >= 2 ? `First round today, ${streak}-day streak` : 'First round today', xp: 50 + 10 * Math.min(streak, 5) });
  return lines.filter((l) => l.xp > 0);
};

/** The career after one more finished round, with what happened for the report. The input is not changed. */
export const applyRound = (c: Career, r: RoundResult, facts: RoundFacts, now: Date): { career: Career; summary: RoundSummary } => {
  const today = dayKey(now);
  const daily = dailyFor(c, now);
  const lines = roundLines(r, daily.rounds === 0, liveStreak(c, now));

  // Goals: progress counts across the day's rounds.
  const progress = { ...daily.progress };
  const done = [...daily.done];
  const goalsDone: string[] = [];
  for (const id of daily.goals) {
    const g = goalDef(id);
    if (!g || done.includes(id)) continue;
    progress[id] = Math.min(g.target, (progress[id] ?? 0) + g.gain(r, facts));
    if (progress[id] >= g.target) {
      done.push(id);
      goalsDone.push(id);
      lines.push({ label: g.text, xp: GOAL_XP, goal: true });
    }
  }
  const allDone = daily.goals.length > 0 && done.length === daily.goals.length;
  if (allDone && !daily.allDone) lines.push({ label: 'All goals done', xp: ALL_GOALS_XP, goal: true });

  // The streak: days in a row with at least one goal done.
  let streak = c.streak;
  if (goalsDone.length > 0 && streak.lastDay !== today) {
    streak = { days: streak.lastDay === yesterdayKey(now) ? streak.days + 1 : 1, lastDay: today };
  }

  // XP, levels and what they unlock.
  const gained = lines.reduce((a, l) => a + l.xp, 0);
  let level = c.level;
  let xp = c.xp + gained;
  const levelUps: number[] = [];
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelUps.push(level);
  }
  // Everything the track gives for the levels reached and the streak day just reached.
  const unlocked = new Set(c.unlocked);
  const newItems: string[] = [];
  const grant = (ids: string[]) =>
    ids.forEach((id) => {
      if (!unlocked.has(id)) {
        unlocked.add(id);
        newItems.push(id);
      }
    });
  for (const l of levelUps) grant(rewardsAtLevel(l).map((i) => i.id));
  if (streak.days !== c.streak.days) grant(rewardsAtStreak(streak.days).map((i) => i.id));
  // A new item is worn at once (outfit sets on the fighter just played), so the very next drop shows it.
  const look = equipNew(c.look, newItems, r.fighter as FighterId);

  const base = recordRound(c, r);
  return {
    career: { ...base, xp, level, unlocked: [...unlocked], look, daily: { day: today, goals: daily.goals, progress, done, rounds: daily.rounds + 1, allDone }, streak },
    summary: { lines, gained, before: { level: c.level, xp: c.xp }, after: { level, xp }, levelUps, newItems, goalsDone, streak: streak.days },
  };
};
