'use client';

/**
 * Screen transitions, all CSS over the page (nothing drawn in WebGL, so the match's draw calls never change):
 *  - the wipe between screens (menu, lobby, round report): slanted bands sweep across, the screen changes while they cover
 *    it (250 ms in), and they sweep off; 520 ms in all, a soft whoosh with it. A key press or a tap during it changes
 *    the screen at once. With reduced motion (the game's setting or the system's) the screen just changes.
 *  - small pieces the screens share: a shock ring and light streaks for impacts.
 * The keyframes live in globals.css (lcs-wipe, lcsRing, lcsStreak, ...).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { uiWhoosh } from '~/components/uiSound';

import type { CSSProperties, ReactNode } from 'react';

/** When the bands fully cover the screen (ms): the change happens here. */
const COVER_MS = 250;

const systemReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface Wipe {
  /** Sweeps across with `label`, runs `change` while the screen is covered, sweeps off. */
  run: (label: string, change: () => void, tone?: string) => void;
  /** The overlay: render it once, above everything. */
  node: ReactNode;
}

export const useWipe = (reducedMotion: boolean): Wipe => {
  const [wipe, setWipe] = useState<{ id: number; label: string; tone: string } | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const change = pending.current;
    pending.current = null;
    change?.();
  }, []);

  // Skippable: a key or a tap while it is still covering changes the screen now (the bands carry on off).
  useEffect(() => {
    if (!wipe) return;
    const skip = () => flush();
    window.addEventListener('keydown', skip, true);
    window.addEventListener('pointerdown', skip, true);
    return () => {
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
    };
  }, [wipe, flush]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    (label: string, change: () => void, tone = '#3ddc84') => {
      flush();
      if (reducedMotion || systemReduced()) {
        change();
        return;
      }
      pending.current = change;
      setWipe({ id: ++seq.current, label, tone });
      uiWhoosh();
      timer.current = setTimeout(flush, COVER_MS);
    },
    [reducedMotion, flush],
  );

  const node = wipe ? (
    <div
      key={wipe.id}
      className="lcs-wipe"
      aria-hidden
      style={{ '--lcs-tone': wipe.tone } as CSSProperties}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setWipe((w) => (w?.id === wipe.id ? null : w));
      }}
    >
      <i className="w1" />
      <i className="w2" />
      <div className="w3">
        <span>{wipe.label}</span>
      </div>
    </div>
  ) : null;

  return { run, node };
};

/** A ring bursting out from the middle of its box (an impact). Re-key it to fire again. */
export const ShockRing = ({ color = '#ffd23f', size = '18rem', duration = 0.6 }: { color?: string; size?: string; duration?: number }) => (
  <span
    aria-hidden
    className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
    style={{
      width: size,
      height: size,
      marginLeft: `calc(${size} / -2)`,
      marginTop: `calc(${size} / -2)`,
      border: `3px solid ${color}`,
      boxShadow: `0 0 30px ${color}, inset 0 0 24px ${color}`,
      animation: `lcsRing ${duration}s cubic-bezier(0.2, 0.7, 0.3, 1) both`,
    }}
  />
);

/** A few thin light streaks shooting across the screen (an impact, the launch). Re-key to fire again. */
export const Streaks = ({ color = '#e6ebf5', count = 5, seed = 0 }: { color?: string; count?: number; seed?: number }) => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    {Array.from({ length: count }, (_, i) => {
      // Spread over the height, the same each time for a given seed (no flicker between renders).
      const r = (n: number) => ((Math.sin((i + 1) * 12.9898 + seed * 78.233 + n) * 43758.5453) % 1 + 1) % 1;
      return (
        <span
          key={i}
          className="absolute left-1/2 h-[2px] w-[45vw] rounded-full"
          style={{
            top: `${12 + r(1) * 76}%`,
            marginLeft: '-22.5vw',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            opacity: 0,
            animation: `lcsStreak ${0.32 + r(2) * 0.2}s ease-out ${r(3) * 0.12}s both`,
          }}
        />
      );
    })}
  </div>
);
