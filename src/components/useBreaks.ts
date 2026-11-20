'use client';

/**
 * The platform around a round: tells it when play starts and stops, follows its mute button, counts play time, and, as the
 * player leaves the round report, plays a midgame ad when one is due (`BreakScheduler`). On our own site the platform is
 * the no-op web adapter, so all of this quietly does nothing but run the next action.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { BreakScheduler } from '~/platform/breaks';

import type { startMatch } from '~/game/render/game';
import type { Platform } from '~/platform/types';

type Game = ReturnType<typeof startMatch>;

const now = () => performance.now() / 1000;

/** One scheduler for the whole visit (a Match is remounted every round). */
let shared: BreakScheduler | null = null;
const scheduler = () => (shared ??= new BreakScheduler());

export interface Breaks {
  /** A midgame ad is playing (or being requested): the report's buttons are blocked. */
  inBreak: boolean;
  /** Leave the round report: a midgame ad first if one is due, then `action`. */
  next: (action: () => void) => Promise<void>;
}

export const useBreaks = (platform: Platform, game: Game | null, opts: { playing: boolean; loaded: boolean; roundOver: boolean }): Breaks => {
  const [inBreak, setInBreak] = useState(false);
  const { playing, loaded, roundOver } = opts;

  // Loading ends with the first frame of the round.
  useEffect(() => {
    if (loaded) platform.loadingStop();
  }, [loaded, platform]);

  // gameplayStart/Stop follow what is on screen (the adapter forwards only changes).
  useEffect(() => {
    if (!loaded) return;
    if (playing && !inBreak) platform.gameplayStart();
    else platform.gameplayStop();
  }, [playing, loaded, inBreak, platform]);
  // Leaving the round (back to the picker) stops gameplay too.
  useEffect(() => () => platform.gameplayStop(), [platform]);

  // Count the seconds of real play.
  useEffect(() => {
    if (!playing) return;
    let last = now();
    const id = setInterval(() => {
      const t = now();
      scheduler().addPlay(t - last);
      last = t;
    }, 1000);
    return () => {
      scheduler().addPlay(now() - last);
      clearInterval(id);
    };
  }, [playing]);

  // The round report came up: a new gap between rounds opens.
  useEffect(() => {
    if (roundOver) scheduler().roundEnded();
  }, [roundOver]);

  // The portal's mute button.
  useEffect(() => {
    if (!game) return;
    game.setMuted('portal', platform.muted());
    return platform.onMutedChange((m) => game.setMuted('portal', m));
  }, [game, platform]);

  const busy = useRef(false);
  const next = useCallback(
    async (action: () => void) => {
      if (busy.current) return;
      busy.current = true;
      const s = scheduler();
      if (platform.ads && s.shouldBreak(now())) {
        setInBreak(true);
        // Mute and freeze only once the ad has really started.
        const r = await platform.commercialBreak({
          onStart: () => {
            game?.setPaused(true);
            game?.setMuted('ad', true);
          },
        });
        game?.setMuted('ad', false);
        if (r === 'shown') s.adShown(now());
        else s.gapClosed();
        setInBreak(false);
      } else s.gapClosed();
      busy.current = false;
      action();
    },
    [game, platform],
  );

  return { inBreak, next };
};
