'use client';

/**
 * The round's anonymous usage events (round_start, round_end). Reads the HUD only; it never changes play.
 * On a portal build nothing is sent: `init` is never called there (it lives in TelemetryInit, which only the Next site
 * renders), so every `track` below returns at once.
 */
import { useEffect, useRef } from 'react';

import { track } from '~/lib/telemetry';

import type { HudState } from '~/game/render/game';

/** Rounds started in this page visit (Match remounts for every round, so the count lives here). */
let roundsThisVisit = 0;

interface OpenRound {
  mode: 'bots' | 'online';
}

export const useTelemetry = (hud: HudState | null, o: { held: boolean; showResult: boolean; online: boolean }): void => {
  const open = useRef<OpenRound | null>(null);
  const hudRef = useRef(hud);
  hudRef.current = hud;

  const end = (result: 'win' | 'lose' | 'quit') => {
    const r = open.current;
    if (!r) return;
    open.current = null;
    const h = hudRef.current;
    track('round_end', {
      mode: r.mode,
      result,
      dur_s: h ? Math.max(0, Math.round(h.survived)) : 0,
      ...(result !== 'quit' && h ? { placement: h.won ? 1 : h.placement, of: h.total } : {}),
      max_level: 0,
    });
  };

  // The round begins with the first frame the player can see (a held round, built behind a menu, waits).
  const live = !!hud && !o.held;
  useEffect(() => {
    if (!live || open.current) return;
    open.current = { mode: o.online ? 'online' : 'bots' };
    roundsThisVisit += 1;
    track('round_start', { mode: open.current.mode, character: hudRef.current?.fighter, n_in_session: roundsThisVisit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // The report comes up: placed first or not.
  useEffect(() => {
    if (o.showResult) end(hudRef.current?.won ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.showResult]);

  // Leaving mid-round (back to the lobby, closing the match) is a quit.
  useEffect(() => () => end('quit'), []); // eslint-disable-line react-hooks/exhaustive-deps
};
