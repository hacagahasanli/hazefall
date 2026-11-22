'use client';

/**
 * A reward's chip: the skewed swatch (the same language as the old canopy swatch) for an outfit, a gun finish, a canopy or a
 * smoke setting, drawn from the fills in cosmetics.ts. Used by the lobby's Style row and tray, the round report's reward card
 * and the menu's next-reward line, so one item always looks the same everywhere.
 */
import { chipCss } from '~/game/cosmetics';
import { FIGHTERS } from '~/game/sim/constants';

import type { Item } from '~/game/cosmetics';
import type { FighterId } from '~/game/sim/types';

export const fighterHex = (f: FighterId) => Number.parseInt(FIGHTERS[f].color.slice(1), 16);

export const Chip = ({
  item,
  fighter,
  w,
  h,
  sweep = false,
  className = '',
}: {
  item: Item;
  /** The fighter an outfit is shown on (and whose colour canopy and smoke chips take). */
  fighter: FighterId;
  w: number;
  h: number;
  /** A white band sweeps across once (the reward card). */
  sweep?: boolean;
  className?: string;
}) => (
  <span aria-hidden className={`relative inline-block shrink-0 -skew-x-12 overflow-hidden ${className}`} style={{ width: w, height: h, background: chipCss(item, fighter, fighterHex(fighter)) }}>
    {item.kind === 'smoke' && item.key === 'off' && (
      <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-3/4 w-3/4 skew-x-12 text-cream/70" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="M6.5 17.5l11-11" />
      </svg>
    )}
    {sweep && <span className="lcs-sweep absolute inset-y-0 left-0 w-1/3 bg-white/30" style={{ animation: 'chipSweep 0.6s ease-out 0.2s both' }} />}
  </span>
);
