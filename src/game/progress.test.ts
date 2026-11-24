import { describe, expect, it } from 'vitest';

import { CANOPIES, cellColor, canopyById } from './canopies';
import { unlockedFor } from './cosmetics';
import { CAREER_KEY, defaultCareer, loadCareer, saveCareer } from './career';
import { applyRound, dailyFor, dayKey, GOALS, goalsFor, hoursToReset, NO_FACTS, roundLines, xpToNext } from './progress';
import { memoryStore } from '~/platform/web';

import type { Career, RoundResult } from './career';

const round = (o: Partial<RoundResult> = {}): RoundResult => ({ fighter: 'hotfix', place: 19, total: 20, won: false, kills: 0, damage: 0, survived: 50, ...o });
const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('xp and levels', () => {
  const sum = (r: RoundResult, first = false, streak = 0) => roundLines(r, first, streak).reduce((a, l) => a + l.xp, 0);

  it('the curve: min(1800, 460 + 70 * (level - 1)), twice the v2 table', () => {
    const table: Record<number, number> = { 1: 460, 2: 530, 3: 600, 4: 670, 5: 740, 6: 810, 7: 880, 8: 950, 9: 1020, 10: 1090, 12: 1230, 15: 1440, 20: 1790, 21: 1800, 40: 1800 };
    for (const [l, xp] of Object.entries(table)) expect(xpToNext(Number(l))).toBe(xp);
    // The spec's "total XP to reach it" column.
    const total = (level: number) => Array.from({ length: level - 1 }, (_, i) => xpToNext(i + 1)).reduce((a, b) => a + b, 0);
    expect([2, 3, 4, 5, 6, 10, 15, 20].map(total)).toEqual([460, 990, 1590, 2260, 3000, 6660, 12810, 20710]);
  });

  it('XP per round: played 20, survived 1 per 6 s (max 40), outlasted 3 each, top 10/5/3 bonus 15/35/60, knock-out 20, damage 1 per 25, win 150', () => {
    // The four reference rounds of the spec.
    expect(sum(round({ place: 16, survived: 70, kills: 0, damage: 40 }))).toBe(44);
    expect(sum(round({ place: 10, survived: 150, kills: 1, damage: 150 }))).toBe(116);
    expect(sum(round({ place: 4, survived: 210, kills: 2, damage: 300 }))).toBe(190);
    expect(sum(round({ place: 1, won: true, survived: 240, kills: 4, damage: 500 }))).toBe(367);
    expect(sum(round({ place: 20, survived: 900 }))).toBe(20 + 40 + 0);
    // A win is worth far more than second place now.
    expect(sum(round({ place: 1, won: true })) - sum(round({ place: 2 }))).toBeGreaterThanOrEqual(90);
    // #1 of 20 outlasts 19... the report says Outlasted 19 and pays 57.
    expect(roundLines(round({ place: 1, won: true }), false).find((l) => l.label === 'Outlasted 19')?.xp).toBe(57);
  });

  it('the report lines read as the spec words and zero lines are hidden', () => {
    const labels = roundLines(round({ place: 10, survived: 151, kills: 2, damage: 150, won: true }), true, 3).map((l) => l.label);
    expect(labels).toEqual(['Round played', 'Survived 2:31', 'Outlasted 10', 'Knock-outs x2', 'Damage 150', 'Win', 'First round today, 3-day streak']);
    expect(roundLines(round({ place: 20, survived: 3, kills: 1, damage: 0 }), false).map((l) => l.label)).toEqual(['Round played', 'Knock-out']);
  });

  it('first round today pays 50 + 10 per streak day, up to 100', () => {
    const first = (streak: number) => roundLines(round(), true, streak).find((l) => l.label.startsWith('First round today'))!.xp;
    expect([0, 1, 3, 5, 9].map(first)).toEqual([50, 60, 80, 100, 100]);
  });

  it('a fresh profile does not reach level 2 in round 1 (116 XP + 50 first round < 460) but does by round 4 of typical play', () => {
    const day = noon(2026, 11, 22);
    let c = defaultCareer();
    c = applyRound(c, round({ place: 10, survived: 150, kills: 1, damage: 150 }), NO_FACTS, day).career;
    expect(c.level).toBe(1);
    expect(c.xp).toBe(166);
    // Twice as slow as v2 (which took 2 rounds): level 2 comes in round 3 or 4, daily goals included.
    let rounds = 1;
    while (c.level < 2 && rounds < 10) {
      c = applyRound(c, round({ place: 10, survived: 150, kills: 1, damage: 150 }), NO_FACTS, day).career;
      rounds += 1;
    }
    expect(rounds).toBeGreaterThanOrEqual(3);
    expect(rounds).toBeLessThanOrEqual(4);
    expect(c.level).toBe(2);
    expect(c.unlocked).toContain('canopy:mint');
  });

  it('a finished round also counts as a round played, with its bests', () => {
    const { career } = applyRound(defaultCareer(), round({ place: 4, kills: 2 }), NO_FACTS, noon(2026, 11, 22));
    expect(career).toMatchObject({ roundsPlayed: 1, bestPlace: 4, bestKills: 2, kills: 2 });
  });

  it('carries leftover xp over a level and can climb several levels at once, owning what the track gives', () => {
    const { career, summary } = applyRound({ ...defaultCareer(), xp: 440 }, round({ place: 1, won: true, kills: 12, damage: 2400, survived: 300 }), NO_FACTS, noon(2026, 11, 22));
    expect(summary.levelUps.length).toBeGreaterThanOrEqual(2);
    expect(career.level).toBe(summary.after.level);
    expect(career.xp).toBeLessThan(xpToNext(career.level));
    expect(summary.gained).toBe(summary.lines.reduce((a, l) => a + l.xp, 0));
    expect(career.unlocked).toEqual(expect.arrayContaining(unlockedFor(career.level, 0)));
    expect(summary.newItems).toEqual(expect.arrayContaining(['canopy:mint', 'outfit:darkmode']));
  });

  it('a new item is worn at once: outfit sets on the fighter just played, the rest as the one setting', () => {
    const c = { ...defaultCareer(), level: 2, xp: xpToNext(2) - 1 };
    const { career } = applyRound(c, round({ fighter: 'legacy' }), NO_FACTS, noon(2026, 11, 22));
    expect(career.level).toBe(3);
    expect(career.look.outfit).toEqual({ hotfix: 'standard', legacy: 'darkmode', standup: 'standard', intern: 'standard' });
    const l4 = applyRound({ ...career, xp: xpToNext(3) - 1 }, round(), NO_FACTS, noon(2026, 11, 22)).career;
    expect(l4.look.finish).toBe('arctic');
    const l5 = applyRound({ ...l4, xp: xpToNext(4) - 1 }, round(), NO_FACTS, noon(2026, 11, 22));
    expect(l5.summary.newItems).toEqual(['smoke:canopy']);
    expect(l5.career.look.smoke).toBe('canopy');
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
  it('saves and loads a career with unlocks, what is worn, goals and the streak', () => {
    const s = memoryStore();
    const { career } = applyRound(defaultCareer(), round({ place: 3, kills: 3, damage: 400 }), NO_FACTS, noon(2026, 11, 22));
    const worn = { ...career, look: { ...career.look, finish: 'factory' }, seen: ['canopy:classic'] };
    saveCareer(s, worn);
    expect(loadCareer(s)).toEqual(worn);
  });

  it('a save from before levels existed keeps its rounds and starts at level 1', () => {
    const s = memoryStore();
    s.setItem(CAREER_KEY, JSON.stringify({ v: 1, roundsPlayed: 6, wins: 1, kills: 9, bestPlace: 2, bestKills: 4, fighterRun: { id: 'legacy', n: 2 } }));
    expect(loadCareer(s)).toMatchObject({ v: 2, roundsPlayed: 6, wins: 1, kills: 9, bestPlace: 2, level: 1, xp: 0, daily: null, streak: { days: 0, lastDay: null } });
    expect(loadCareer(s).look.canopy).toBe('classic');
    expect(loadCareer(s).unlocked).toEqual(unlockedFor(1, 0));
    s.setItem(CAREER_KEY, JSON.stringify({ level: -3, xp: -5, daily: { day: 5 } }));
    expect(loadCareer(s)).toMatchObject({ level: 1, xp: 0, daily: null });
  });

  it('a version 1 save keeps its level, clamps xp to the new bar, owns everything up to its level and keeps old canopies', () => {
    const s = memoryStore();
    // Level 4 under the old curve, 250 xp into it (the old bar was 175): the new bar for level 4 is 335.
    s.setItem(CAREER_KEY, JSON.stringify({ v: 1, level: 4, xp: 9999, unlocked: ['classic', 'mint', 'sunset', 'navy', 'gold', 'teal'], canopy: 'gold', streak: { days: 3, lastDay: '2026-11-21' } }));
    const c = loadCareer(s);
    expect(c.level).toBe(4);
    expect(c.xp).toBe(xpToNext(4) - 1);
    // Old canopies stay even where the new table puts them later (Gold cells is now Level 10).
    expect(c.unlocked).toEqual(expect.arrayContaining(['canopy:mint', 'canopy:sunset', 'canopy:navy', 'canopy:gold', 'canopy:teal', 'outfit:darkmode', 'finish:arctic']));
    expect(c.unlocked).not.toContain('outfit:arctic');
    expect(c.look.canopy).toBe('gold');
    expect(c.look.smoke).toBe('off');
    // Over-levelled old saves own a lot, never less.
    s.setItem(CAREER_KEY, JSON.stringify({ v: 1, level: 12, xp: 3, unlocked: ['classic', 'night'] }));
    const big = loadCareer(s);
    expect(big.unlocked).toEqual(expect.arrayContaining(unlockedFor(12, 0)));
    expect(big.unlocked).toContain('canopy:night');
    expect(big.look.smoke).toBe('canopy');
  });

  it('an equipped item that is not owned falls back to the start look; a good version 2 save loads as saved', () => {
    const s = memoryStore();
    s.setItem(CAREER_KEY, JSON.stringify({ v: 2, level: 2, xp: 4, unlocked: ['canopy:mint'], look: { outfit: { hotfix: 'legend' }, finish: 'gold', canopy: 'mint', smoke: 'canopy' }, seen: ['canopy:mint', 'outfit:legend'] }));
    const c = loadCareer(s);
    expect(c.look).toEqual({ outfit: { hotfix: 'standard', legacy: 'standard', standup: 'standard', intern: 'standard' }, finish: 'factory', canopy: 'mint', smoke: 'off' });
    expect(c.seen).toEqual(['canopy:mint']);
    // A save that is not JSON at all gives a fresh career.
    s.setItem(CAREER_KEY, '{nope');
    expect(loadCareer(s).level).toBe(1);
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

  it('a win is asked only from level 8', () => {
    for (let i = 1; i <= 60; i++) {
      const day = `2027-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`;
      expect(goalsFor(day, 7)).not.toContain('win');
    }
    expect(Array.from({ length: 60 }, (_, i) => goalsFor(`2027-02-${i}`, 8)).some((g) => g.includes('win'))).toBe(true);
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
    expect(r.summary.lines.filter((l) => l.label === 'Deal 300 damage' || l.label === 'Knock out 2 fighters').map((l) => l.xp)).toEqual([75, 75]);
    expect(r.summary.lines.some((l) => l.label === 'All goals done')).toBe(false);
    c = r.career;
    // Done goals do not pay again; the third finishes the day.
    r = applyRound(c, round({ damage: 500, kills: 3, place: 6 }), NO_FACTS, day);
    expect(r.summary.goalsDone).toEqual(['top10']);
    expect(r.summary.lines.find((l) => l.label === 'All goals done')?.xp).toBe(75);
    expect(r.career.daily!.allDone).toBe(true);
    expect(r.career.daily!.rounds).toBe(4);
    const later = applyRound(r.career, round({ damage: 500 }), NO_FACTS, day);
    expect(later.summary.lines.some((l) => l.label === 'All goals done')).toBe(false);
  });

  it('the first round of the day pays 50 once, and a new day brings new goals', () => {
    const d1 = noon(2026, 11, 22);
    const a = applyRound(defaultCareer(), round(), NO_FACTS, d1);
    expect(a.summary.lines.find((l) => l.label === 'First round today')?.xp).toBe(50);
    const b = applyRound(a.career, round(), NO_FACTS, d1);
    expect(b.summary.lines.some((l) => l.label === 'First round today')).toBe(false);
    const d2 = noon(2026, 11, 23);
    expect(dailyFor(b.career, d2).day).toBe('2026-11-23');
    expect(dailyFor(b.career, d2).rounds).toBe(0);
    expect(applyRound(b.career, round(), NO_FACTS, d2).summary.lines.some((l) => l.label === 'First round today')).toBe(true);
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

  it('counts days in a row, holds within a day, resets after a missed day, and unlocks Teal waves at 3 and Ember (canopy and gun finish) at 7', () => {
    let c = defaultCareer();
    const seen: number[] = [];
    const unlocked: string[] = [];
    for (let d = 20; d <= 26; d++) {
      const r = finishAGoal(c, noon(2026, 11, d));
      c = r.career;
      seen.push(c.streak.days);
      unlocked.push(...r.summary.newItems.filter((id) => id === 'canopy:teal' || id === 'canopy:ember' || id === 'finish:ember'));
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(unlocked.sort()).toEqual(['canopy:ember', 'canopy:teal', 'finish:ember']);
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
