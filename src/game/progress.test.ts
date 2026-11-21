import { describe, expect, it } from 'vitest';

import { canopiesForLevel, CANOPIES, cellColor, canopyById } from './canopies';
import { CAREER_KEY, defaultCareer, loadCareer, saveCareer } from './career';
import { applyRound, dailyFor, dayKey, GOALS, goalsFor, hoursToReset, NO_FACTS, roundLines, xpToNext } from './progress';
import { memoryStore } from '~/platform/web';

import type { Career, RoundResult } from './career';

const round = (o: Partial<RoundResult> = {}): RoundResult => ({ fighter: 'hotfix', place: 19, total: 20, won: false, kills: 0, damage: 0, survived: 50, ...o });
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('xp and levels', () => {
  it('the rule: survived, placement, knock-outs, damage, win bonus, first round of the day', () => {
    const sum = (r: RoundResult, first = false) => roundLines(r, first).reduce((a, l) => a + l.xp, 0);
    expect(sum(round({ survived: 37, place: 19 }))).toBe(3 + 6); // a typical bad round
    expect(sum(round({ survived: 900, place: 20 }))).toBe(30 + 3); // time is capped at 30
    expect(sum(round({ place: 1, won: true, survived: 200, kills: 4, damage: 450 }))).toBe(20 + 60 + 60 + 22 + 50);
    expect(sum(round(), true)).toBe(5 + 6 + 40);
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(5)).toBe(200);
  });

  it('a fresh profile reaches level 2 within two rounds of the length the gentle bots give (90 s, #12)', () => {
    let c = defaultCareer();
    const day = noon(2026, 11, 22);
    let levels = 0;
    for (let i = 0; i < 2 && c.level < 2; i++) {
      c = applyRound(c, round({ survived: 90, place: 12, kills: i, damage: 40 }), NO_FACTS, day).career;
      levels = c.level;
    }
    expect(levels).toBe(2);
    expect(c.unlocked).toContain('mint');
  });

  it('a finished round also counts as a round played, with its bests', () => {
    const { career } = applyRound(defaultCareer(), round({ place: 4, kills: 2 }), NO_FACTS, noon(2026, 11, 22));
    expect(career).toMatchObject({ roundsPlayed: 1, bestPlace: 4, bestKills: 2, kills: 2 });
  });

  it('carries leftover xp over a level and can climb several levels at once', () => {
    const { career, summary } = applyRound({ ...defaultCareer(), xp: 90 }, round({ place: 1, won: true, kills: 6, damage: 900, survived: 300 }), NO_FACTS, noon(2026, 11, 22));
    expect(summary.levelUps.length).toBeGreaterThanOrEqual(2);
    expect(career.level).toBe(summary.after.level);
    expect(career.xp).toBeLessThan(xpToNext(career.level));
    expect(summary.gained).toBe(summary.lines.reduce((a, l) => a + l.xp, 0));
    expect(career.unlocked).toEqual(expect.arrayContaining(canopiesForLevel(career.level)));
  });

  it('canopy unlocks follow the spec table', () => {
    const at = (l: number) => canopiesForLevel(l).filter((id) => id !== 'classic');
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual(['mint']);
    expect(at(5)).toEqual(['mint', 'sunset', 'navy', 'gold']);
    expect(at(20)).toHaveLength(8);
  });
});

describe('canopy painting', () => {
  it('classic uses the fighter colour in stripes with white; every canopy gives a colour for every cell', () => {
    const classic = canopyById('classic');
    expect(cellColor(classic, 0, 0, 12, 6, 0xff6a3d)).toBe(0xff6a3d);
    expect(cellColor(classic, 1, 0, 12, 6, 0xff6a3d)).toBe(0xf4f2ea);
    for (const c of CANOPIES) for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
      const col = cellColor(c, i, j, 12, 6, 0x3ddc84);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThanOrEqual(0xffffff);
    }
    expect(cellColor(canopyById('split'), 2, 0, 12, 6, 0)).not.toBe(cellColor(canopyById('split'), 9, 0, 12, 6, 0));
    expect(cellColor(canopyById('rainbow'), 0, 0, 12, 6, 0)).not.toBe(cellColor(canopyById('rainbow'), 6, 0, 12, 6, 0));
  });
});

describe('the career save with levels', () => {
  it('saves and loads a career with unlocks, the picked canopy, goals and the streak', () => {
    const s = memoryStore();
    const { career } = applyRound(defaultCareer(), round({ place: 3, kills: 3, damage: 400 }), NO_FACTS, noon(2026, 11, 22));
    saveCareer(s, { ...career, canopy: career.unlocked[career.unlocked.length - 1] });
    expect(loadCareer(s)).toEqual({ ...career, canopy: career.unlocked[career.unlocked.length - 1] });
  });

  it('a save from before levels existed keeps its rounds and starts at level 1; an unknown canopy falls back to classic', () => {
    const s = memoryStore();
    s.setItem(CAREER_KEY, JSON.stringify({ v: 1, roundsPlayed: 6, wins: 1, kills: 9, bestPlace: 2, bestKills: 4, fighterRun: { id: 'legacy', n: 2 } }));
    expect(loadCareer(s)).toMatchObject({ roundsPlayed: 6, wins: 1, kills: 9, bestPlace: 2, level: 1, xp: 0, canopy: 'classic', unlocked: ['classic'], daily: null, streak: { days: 0, lastDay: null } });
    s.setItem(CAREER_KEY, JSON.stringify({ level: 4, xp: 30, unlocked: ['mint'], canopy: 'gold', streak: { days: 'x' } }));
    expect(loadCareer(s)).toMatchObject({ level: 4, xp: 30, unlocked: ['classic', 'mint'], canopy: 'classic', streak: { days: 0, lastDay: null } });
    s.setItem(CAREER_KEY, JSON.stringify({ level: -3, xp: -5, daily: { day: 5 } }));
    expect(loadCareer(s)).toMatchObject({ level: 1, xp: 0, daily: null });
  });
});

describe('daily goals', () => {
  it('the same three goals for a date (a seed of the date), different dates differ, always three different', () => {
    const a = goalsFor('2026-11-22', 1);
    expect(goalsFor('2026-11-22', 1)).toEqual(a);
    expect(new Set(a).size).toBe(3);
    const days = Array.from({ length: 20 }, (_, i) => goalsFor(`2026-12-${String(i + 1).padStart(2, '0')}`, 1).join());
    expect(new Set(days).size).toBeGreaterThan(10);
  });

  it('a win is asked only from level 5', () => {
    for (let i = 1; i <= 60; i++) {
      const day = `2027-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`;
      expect(goalsFor(day, 4)).not.toContain('win');
    }
    expect(Array.from({ length: 60 }, (_, i) => goalsFor(`2027-02-${i}`, 5)).some((g) => g.includes('win'))).toBe(true);
    expect(GOALS.every((g) => g.id && g.text)).toBe(true);
  });

  it('progress counts across rounds, a finished goal pays once, all three pay a bonus', () => {
    const day = noon(2026, 11, 22);
    const goals = goalsFor(dayKey(day), 1);
    let c: Career = { ...defaultCareer(), daily: { day: dayKey(day), goals: ['damage', 'kos', 'top10'], progress: {}, done: [], rounds: 1, allDone: false } };
    expect(goals).toHaveLength(3);
    // 200 damage then 150 more: the goal is done in the second round.
    let r = applyRound(c, round({ damage: 200, place: 15 }), NO_FACTS, day);
    expect(r.summary.goalsDone).toEqual([]);
    c = r.career;
    expect(c.daily!.progress.damage).toBe(200);
    r = applyRound(c, round({ damage: 150, place: 12, kills: 2 }), NO_FACTS, day);
    expect(r.summary.goalsDone.sort()).toEqual(['damage', 'kos']);
    expect(r.summary.lines.filter((l) => l.label === 'Deal 300 damage' || l.label === 'Knock out 2 fighters').map((l) => l.xp)).toEqual([60, 60]);
    expect(r.summary.lines.some((l) => l.label === 'All goals done')).toBe(false);
    c = r.career;
    // Done goals do not pay again; the third finishes the day.
    r = applyRound(c, round({ damage: 500, kills: 3, place: 6 }), NO_FACTS, day);
    expect(r.summary.goalsDone).toEqual(['top10']);
    expect(r.summary.lines.find((l) => l.label === 'All goals done')?.xp).toBe(100);
    expect(r.career.daily!.allDone).toBe(true);
    expect(r.career.daily!.rounds).toBe(4);
    const later = applyRound(r.career, round({ damage: 500 }), NO_FACTS, day);
    expect(later.summary.lines.some((l) => l.label === 'All goals done')).toBe(false);
  });

  it('the first round of the day pays 40 once, and a new day brings new goals', () => {
    const d1 = noon(2026, 11, 22);
    const a = applyRound(defaultCareer(), round(), NO_FACTS, d1);
    expect(a.summary.lines.some((l) => l.label === 'First round of the day')).toBe(true);
    const b = applyRound(a.career, round(), NO_FACTS, d1);
    expect(b.summary.lines.some((l) => l.label === 'First round of the day')).toBe(false);
    const d2 = noon(2026, 11, 23);
    expect(dailyFor(b.career, d2).day).toBe('2026-11-23');
    expect(dailyFor(b.career, d2).rounds).toBe(0);
    expect(applyRound(b.career, round(), NO_FACTS, d2).summary.lines.some((l) => l.label === 'First round of the day')).toBe(true);
  });

  it('goals read the round facts: container yard, a rifle, canopy below 60 m', () => {
    const day = noon(2026, 11, 22);
    const c = { ...defaultCareer(), daily: { day: dayKey(day), goals: ['yard', 'rifle', 'low'], progress: {}, done: [], rounds: 1, allDone: false } };
    const miss = applyRound(c, round(), { landedIn: 'Quarry', pickedRifle: false, openedAlt: 120 }, day);
    expect(miss.summary.goalsDone).toEqual([]);
    const hit = applyRound(c, round(), { landedIn: 'Container Yard', pickedRifle: true, openedAlt: 44 }, day);
    expect(hit.summary.goalsDone.sort()).toEqual(['low', 'rifle', 'yard']);
  });
});

describe('the day streak', () => {
  const finishAGoal = (c: ReturnType<typeof defaultCareer>, day: Date) => {
    const base = { ...c, daily: { day: dayKey(day), goals: ['top10', 'damage', 'kos'], progress: {}, done: [], rounds: 1, allDone: false } };
    return applyRound(base, round({ place: 5 }), NO_FACTS, day);
  };

  it('counts days in a row, holds within a day, resets after a missed day, and unlocks canopies at 3 and 7', () => {
    let c = defaultCareer();
    const seen: number[] = [];
    const unlocked: string[] = [];
    for (let d = 20; d <= 26; d++) {
      const r = finishAGoal(c, noon(2026, 11, d));
      c = r.career;
      seen.push(c.streak.days);
      unlocked.push(...r.summary.newCanopies.filter((id) => id === 'teal' || id === 'ember'));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(unlocked).toEqual(['teal', 'ember']);
    // Another goal the same day does not count twice.
    const same = applyRound({ ...c, daily: { ...c.daily!, done: [], progress: {}, goals: ['top10', 'damage', 'kos'] } }, round({ place: 2 }), NO_FACTS, noon(2026, 11, 26));
    expect(same.career.streak.days).toBe(7);
    // A day with no goal done leaves the streak alone, a gap of one day starts it again.
    const quiet = applyRound(c, round({ place: 19 }), NO_FACTS, noon(2026, 11, 27));
    expect(quiet.career.streak.days).toBe(7);
    const after = finishAGoal(c, noon(2026, 11, 29));
    expect(after.career.streak.days).toBe(1);
  });

  it('days follow the local calendar and the reset countdown is in whole hours', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 0, 6, 0, 1))).toBe('2026-01-06');
    expect(hoursToReset(new Date(2026, 10, 22, 17, 0))).toBe(7);
    expect(hoursToReset(new Date(2026, 10, 22, 23, 59, 30))).toBe(1);
  });
});
