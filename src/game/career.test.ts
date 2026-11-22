import { describe, expect, it } from 'vitest';

import { CAREER_KEY, contextLine, defaultCareer, isRookie, loadCareer, nudgeFighter, recordRound, saveCareer } from './career';
import { memoryStore } from '~/platform/web';

import type { RoundResult } from './career';

const round = (o: Partial<RoundResult> = {}): RoundResult => ({ fighter: 'hotfix', place: 12, total: 20, won: false, kills: 0, damage: 0, survived: 90, ...o });

describe('the career save', () => {
  it('a fresh profile is a rookie with nothing saved', () => {
    const c = loadCareer(memoryStore());
    expect(c).toEqual(defaultCareer());
    expect(isRookie(c)).toBe(true);
  });

  it('saves and loads what a round changed', () => {
    const s = memoryStore();
    const after = recordRound(loadCareer(s), round({ place: 4, kills: 2, won: false }));
    saveCareer(s, after);
    expect(loadCareer(s)).toEqual(after);
    expect(after).toMatchObject({ roundsPlayed: 1, kills: 2, bestPlace: 4, bestKills: 2, fighterRun: { id: 'hotfix', n: 1 } });
  });

  it('the first three rounds are rookie rounds, the fourth is not', () => {
    let c = defaultCareer();
    const seen: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(isRookie(c));
      c = recordRound(c, round());
    }
    expect(seen).toEqual([true, true, true, false]);
  });

  it('old and damaged saves load without losing the fields that are fine', () => {
    const s = memoryStore();
    // Only a counter from an earlier build, and no career.
    s.setItem('lcs.roundsPlayed', '5');
    expect(loadCareer(s).roundsPlayed).toBe(5);
    // A save from before fields existed (no wins, no fighter run), plus a field of the wrong type.
    const s2 = memoryStore();
    s2.setItem(CAREER_KEY, JSON.stringify({ roundsPlayed: 7, kills: 'many', bestPlace: 3 }));
    expect(loadCareer(s2)).toEqual({ ...defaultCareer(), roundsPlayed: 7, bestPlace: 3 });
    // Broken JSON, a list, a number, a place of zero.
    for (const bad of ['{nope', '[1,2]', '42', 'null']) {
      s2.setItem(CAREER_KEY, bad);
      expect(loadCareer(s2)).toEqual(defaultCareer());
    }
    s2.setItem(CAREER_KEY, JSON.stringify({ roundsPlayed: 2, bestPlace: 0 }));
    expect(loadCareer(s2).bestPlace).toBeNull();
  });

  it('a store that throws still gives a default career and never breaks a save', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadCareer(broken)).toEqual(defaultCareer());
    expect(() => saveCareer(broken, defaultCareer())).not.toThrow();
  });
});

describe('the line under the stats', () => {
  const played = (place: number, kills = 0) => recordRound(defaultCareer(), round({ place, kills }));
  it('a new best comes first', () => expect(contextLine(played(8), round({ place: 4 }))).toBe('New best: #4'));
  it('the first kill ever', () => expect(contextLine(played(8), round({ place: 12, kills: 1 }))).toBe('First kill!'));
  it('best so far, with the next goal', () => {
    const before = recordRound(played(4, 1), round({ place: 9, kills: 1 }));
    expect(contextLine(before, round({ place: 10 }))).toBe('Best so far: #4. Top 3 next.');
    expect(contextLine(recordRound(defaultCareer(), round({ place: 2, kills: 1 })), round({ place: 10 }))).toBe('Best so far: #2.');
  });
  it('the very first round: fighters outlived, none in last place', () => {
    expect(contextLine(defaultCareer(), round({ place: 8 }))).toBe('You outlived 12 fighters.');
    expect(contextLine(defaultCareer(), round({ place: 19 }))).toBe('You outlived 1 fighter.');
    expect(contextLine(defaultCareer(), round({ place: 20 }))).toBeNull();
  });
});

describe('the nudge to try another fighter', () => {
  it('comes after three rounds with the same fighter, then every three more, and a switch starts the count again', () => {
    let c = defaultCareer();
    const nudges: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      c = recordRound(c, round({ fighter: 'hotfix' }));
      nudges.push(nudgeFighter(c));
    }
    expect(nudges).toEqual([null, null, 'intern', null, null, 'intern', null]);
    c = recordRound(c, round({ fighter: 'intern' }));
    expect(c.fighterRun).toEqual({ id: 'intern', n: 1 });
    expect(nudgeFighter(c)).toBeNull();
    for (let i = 0; i < 2; i++) c = recordRound(c, round({ fighter: 'intern' }));
    expect(nudgeFighter(c)).toBe('standup');
  });
});

describe('?career=reset (web build only)', () => {
  it('wipes the career and the old counter only for career=reset', async () => {
    const { resetCareerIfAsked } = await import('./career');
    const s = memoryStore();
    saveCareer(s, { ...defaultCareer(), level: 9, roundsPlayed: 40 });
    expect(resetCareerIfAsked(s, '?career=other')).toBe(false);
    expect(resetCareerIfAsked(s, '')).toBe(false);
    expect(loadCareer(s).level).toBe(9);
    expect(resetCareerIfAsked(s, '?x=1&career=reset')).toBe(true);
    expect(loadCareer(s)).toMatchObject({ level: 1, roundsPlayed: 0 });
  });
});
