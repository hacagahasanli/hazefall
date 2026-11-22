/**
 * What a key press means for the pause menu. Pure, so the one-press Esc is tested without a browser.
 *
 * Esc and the pause key (P) both toggle the menu in one press. With the mouse captured (pointer lock) the browser uses
 * that Esc to hand the mouse back and may never show it to the page: the page sees the lock end instead, and that counts
 * as the press (`lockReleased`). If the browser does deliver the key as well, `msSinceLockRelease` keeps it from
 * toggling a second time.
 */
export type PauseAction = 'toggle' | 'open' | 'ignore';

/** An Esc seen this soon after the mouse was released is the same press. */
export const SAME_PRESS_MS = 100;

export interface PauseContext {
  /** The code bound to pause (P by default). */
  pauseKey: string;
  /** The settings panel (inside the menu), or a match still held behind the pre-match screen, owns the keys. */
  settingsOpen: boolean;
  held: boolean;
  /** The round is over for you: there is nothing to pause. */
  over: boolean;
  menuOpen: boolean;
  msSinceLockRelease: number;
}

export const pauseKeyAction = (e: { code: string; repeat?: boolean }, c: PauseContext): PauseAction => {
  if (c.settingsOpen || c.held || e.repeat) return 'ignore';
  const isPause = e.code === c.pauseKey;
  if (!isPause && e.code !== 'Escape') return 'ignore';
  if (!isPause && c.msSinceLockRelease < SAME_PRESS_MS) return 'ignore';
  if (c.menuOpen) return 'toggle';
  return c.over ? 'ignore' : 'toggle';
};

/** The browser took the mouse back (Esc) while the match was running: that opens the menu. */
export const lockReleaseOpensMenu = (c: { held: boolean; over: boolean; hasFocus: boolean; settingsOpen: boolean }): boolean =>
  !c.held && !c.over && c.hasFocus && !c.settingsOpen;
