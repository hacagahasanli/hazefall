'use client';

import { useEffect, useRef } from 'react';

import { SUPPORT_PAY_URL, SUPPORT_URL } from '~/lib/links';

/*
 * Site only: the portal build renders PortalGame from portal/main.tsx and never imports this file, and Match only shows
 * the `support` it is given (the lobby passes SupportLink, the portal passes nothing), so no outbound link reaches
 * dist/portal (scripts/portal-report.mjs checks it).
 *
 * The support UI itself is the studio's shared module, vendored in src/vendor/nalbaki-support (synced by
 * scripts/sync-nalbaki-support.mjs): Baki the mascot, $3 / $5 / $10 chips and a button to the real itch.io page. It is a
 * web component, so it is loaded on the client only, after the page has painted.
 */

type Variant = 'menu' | 'pause' | 'results';

/** Space kept for each variant while the module loads, so nothing jumps. */
const RESERVE: Record<Variant, string> = { menu: 'min-h-[214px]', results: 'min-h-[190px]', pause: 'min-h-11' };

export const Support = ({ variant, className = '' }: { variant: Variant; className?: string }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    let cleanup: (() => void) | undefined;
    void import('~/vendor/nalbaki-support/nalbaki-support.js').then(({ mountSupport }) => {
      if (gone || !host.current) return;
      cleanup = mountSupport(host.current, { variant, href: SUPPORT_PAY_URL, pageHref: SUPPORT_URL });
    });
    return () => {
      gone = true;
      cleanup?.();
    };
  }, [variant]);
  return <div ref={host} className={`${RESERVE[variant]} ${className}`} />;
};

/** What Match is handed by the lobby: `pill` in the pause menu (one line), `card` on the round report. */
export const SupportLink = ({ variant = 'pill' }: { variant?: 'pill' | 'card' }) =>
  variant === 'card' ? <Support variant="results" className="w-full max-w-xl" /> : <Support variant="pause" />;
