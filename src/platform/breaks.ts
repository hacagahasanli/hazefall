/**
 * When the game may ask for a midgame ad. Pure: the caller passes the time, so the rules are tested without a browser.
 *
 * CrazyGames ad requirements (https://docs.crazygames.com/requirements/ads/):
 *  - only between rounds: the game asks only when the player leaves the round report (Play again or Change fighter), never
 *    during a round, on the plane, or from the pause menu;
 *  - not before the player has had a fair amount of play: `firstAfterRounds` finished rounds and `firstAfterPlay` seconds;
 *  - at most one every `interval` seconds (the SDK's own cooldown is 3 minutes, so we never ask for one it would refuse);
 *  - at most one per gap between two rounds.
 * A battle royale round lasts minutes, not seconds, so one finished round is enough to earn the first break.
 */
export interface BreakRules {
  firstAfterRounds: number;
  firstAfterPlay: number;
  interval: number;
}

export const BREAK_RULES: BreakRules = {
  firstAfterRounds: 1,
  firstAfterPlay: 90,
  interval: 180,
};

export class BreakScheduler {
  private play = 0;
  private rounds = 0;
  private lastAd = -Infinity;
  private gapUsed = true;

  constructor(private rules: BreakRules = BREAK_RULES) {}

  /** Seconds of real play (not paused, not on the round report, not in an ad). */
  addPlay(seconds: number) {
    if (seconds > 0 && Number.isFinite(seconds)) this.play += seconds;
  }

  /** A round ended (the report came up). Opens a new gap between rounds. */
  roundEnded() {
    this.rounds++;
    this.gapUsed = false;
  }

  /** May a midgame ad play now, as the player leaves the round report? */
  shouldBreak(now: number): boolean {
    const r = this.rules;
    return !this.gapUsed && this.rounds >= r.firstAfterRounds && this.play >= r.firstAfterPlay && now - this.lastAd >= r.interval;
  }

  /** An ad played: the cooldown starts again and this gap has had its ad. */
  adShown(now: number) {
    this.lastAd = now;
    this.gapUsed = true;
  }

  /** The player left the report without an ad (none was due, or it failed): the gap is closed all the same. */
  gapClosed() {
    this.gapUsed = true;
  }

  get stats() {
    return { play: this.play, rounds: this.rounds };
  }
}
