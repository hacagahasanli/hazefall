'use client';

/**
 * The platform around a round: tells it when loading ends and when play starts and stops, and follows its mute button.
 * No ads here: a midgame ad after every round broke the tempo, so the portal shows a banner on the main menu instead
 * (`MenuBanner`). On our own site the platform is the no-op web adapter, so all of this quietly does nothing.
 */
import { useEffect } from 'react';

import type { startMatch } from '~/game/render/game';
import type { Platform } from '~/platform/types';

type Game = ReturnType<typeof startMatch>;

export const usePlatformRound = (platform: Platform, game: Game | null, opts: { playing: boolean; loaded: boolean }) => {
  const { playing, loaded } = opts;

  // Loading ends with the first frame of the round.
  useEffect(() => {
    if (loaded) platform.loadingStop();
  }, [loaded, platform]);

  // gameplayStart/Stop follow what is on screen (the adapter forwards only changes).
  useEffect(() => {
    if (!loaded) return;
    if (playing) platform.gameplayStart();
    else platform.gameplayStop();
  }, [playing, loaded, platform]);
  // Leaving the round (back to the picker) stops gameplay too.
  useEffect(() => () => platform.gameplayStop(), [platform]);

  // The portal's mute button.
  useEffect(() => {
    if (!game) return;
    game.setMuted('portal', platform.muted());
    return platform.onMutedChange((m) => game.setMuted('portal', m));
  }, [game, platform]);
};
