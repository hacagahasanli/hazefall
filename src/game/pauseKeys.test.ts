import { describe, expect, it } from 'vitest';

import { lockReleaseOpensMenu, pauseKeyAction, SAME_PRESS_MS } from './pauseKeys';

import type { PauseContext } from './pauseKeys';

const ctx = (c: Partial<PauseContext> = {}): PauseContext => ({
  pauseKey: 'KeyP', settingsOpen: false, held: false, over: false, menuOpen: false, msSinceLockRelease: 99999, ...c,
});

describe('the pause menu keys', () => {
  it('one Esc opens the menu, one Esc closes it', () => {
    expect(pauseKeyAction({ code: 'Escape' }, ctx())).toBe('toggle');
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ menuOpen: true }))).toBe('toggle');
  });

  it('P does the same', () => {
    expect(pauseKeyAction({ code: 'KeyP' }, ctx())).toBe('toggle');
    expect(pauseKeyAction({ code: 'KeyP' }, ctx({ menuOpen: true }))).toBe('toggle');
  });

  it('follows a rebound pause key', () => {
    expect(pauseKeyAction({ code: 'KeyP' }, ctx({ pauseKey: 'KeyO' }))).toBe('ignore');
    expect(pauseKeyAction({ code: 'KeyO' }, ctx({ pauseKey: 'KeyO' }))).toBe('toggle');
  });

  it('ignores other keys and held-down repeats', () => {
    expect(pauseKeyAction({ code: 'KeyW' }, ctx())).toBe('ignore');
    expect(pauseKeyAction({ code: 'Escape', repeat: true }, ctx())).toBe('ignore');
  });

  it('leaves Esc to the settings panel and to the pre-match screen', () => {
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ settingsOpen: true, menuOpen: true }))).toBe('ignore');
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ held: true }))).toBe('ignore');
  });

  it('does not open a menu over the result', () => {
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ over: true }))).toBe('ignore');
  });

  it('an Esc the browser also reports right after releasing the mouse is the same press', () => {
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ menuOpen: true, msSinceLockRelease: 10 }))).toBe('ignore');
    expect(pauseKeyAction({ code: 'Escape' }, ctx({ menuOpen: true, msSinceLockRelease: SAME_PRESS_MS }))).toBe('toggle');
    // P is not what releases the mouse, so it is never swallowed.
    expect(pauseKeyAction({ code: 'KeyP' }, ctx({ msSinceLockRelease: 10 }))).toBe('toggle');
  });

  it('losing the mouse opens the menu only while playing and focused', () => {
    const ok = { held: false, over: false, hasFocus: true, settingsOpen: false };
    expect(lockReleaseOpensMenu(ok)).toBe(true);
    expect(lockReleaseOpensMenu({ ...ok, hasFocus: false })).toBe(false); // alt-tab
    expect(lockReleaseOpensMenu({ ...ok, over: true })).toBe(false);
    expect(lockReleaseOpensMenu({ ...ok, held: true })).toBe(false);
    expect(lockReleaseOpensMenu({ ...ok, settingsOpen: true })).toBe(false);
  });
});
