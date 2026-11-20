import { SUPPORT_URL } from '~/lib/links';

/*
 * Site only: the portal build renders PortalGame from portal/main.tsx and never imports this file, and Match only shows
 * the `support` it is given (the lobby passes SupportLink, the portal passes nothing), so no outbound link reaches
 * dist/portal (scripts/portal-report.mjs checks it).
 */

/** A cup of coffee with steam curling off it, in the game's colours (the steam rises unless motion is reduced). */
const SteamingCup = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 48 48" aria-hidden className={className}>
    <g className="lcs-steam" fill="none" stroke="#e6ebf5" strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
      <path d="M17 15c-3-3 3-5 0-9" />
      <path d="M24 15c-3-3 3-5 0-9" />
      <path d="M31 15c-3-3 3-5 0-9" />
    </g>
    <path d="M9 19h29v9c0 8-6 14-14.5 14S9 36 9 28z" fill="#ffd23f" stroke="#0a0d18" strokeWidth="2" />
    <path d="M38 22h2.5a5 5 0 010 10H37" fill="none" stroke="#ffd23f" strokeWidth="3.2" />
    <path d="M12 23h23" stroke="#0a0d18" strokeWidth="1.5" opacity="0.25" />
    <path d="M17 31c2 2.5 4.5 3.5 6.5 3.5s4.5-1 6.5-3.5" fill="none" stroke="#0a0d18" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
    <ellipse cx="23.5" cy="44" rx="15" ry="2" fill="#0a0d18" opacity="0.35" />
  </svg>
);

/**
 * The support link inside a round (the lobby passes it to Match). `pill` (the pause menu): a small warm pill. `card` (the
 * round report): a friendly card with a steaming cup, a line on why it helps, and a gold button. Opens in a new tab; never
 * shown during play.
 */
export const SupportLink = ({ className = '', variant = 'pill' }: { className?: string; variant?: 'pill' | 'card' }) =>
  variant === 'card' ? (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener"
      className={`panel-cut group relative flex w-full max-w-xl items-center gap-3 overflow-hidden border border-gold/35 bg-[linear-gradient(110deg,rgba(255,210,63,0.16),rgba(255,61,110,0.07)_55%,rgba(20,26,43,0.92))] p-3 pr-4 transition hover:border-gold/80 focus-visible:border-cream focus-visible:outline-none sm:gap-4 sm:p-3.5 ${className}`}
    >
      {/* A soft light passes over the card when you point at it. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)] opacity-0 group-hover:opacity-100 group-hover:[animation:lcsSweep_0.9s_ease-out] motion-reduce:hidden" />
      <SteamingCup className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-base leading-tight text-cream sm:text-lg">Enjoyed the round?</span>
        <span className="text-xs leading-snug text-cream/70 sm:text-sm">The game is free to play. A coffee for the studio keeps the next update coming.</span>
        <span aria-hidden className="mt-1 text-sm font-bold text-gold sm:hidden">
          Buy us a coffee →
        </span>
      </span>
      <span className="panel-cut hidden shrink-0 items-center gap-1.5 bg-gold px-3.5 py-2 text-sm font-bold text-ink-deep transition group-hover:brightness-110 sm:inline-flex">
        Buy us a coffee
        <span aria-hidden className="transition group-hover:translate-x-0.5 motion-reduce:transition-none">
          →
        </span>
      </span>
      <span className="sr-only"> Buy us a coffee (opens the Nalbaki Games support page in a new tab)</span>
    </a>
  ) : (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener"
      className={`group inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold transition hover:bg-gold hover:text-ink-deep focus-visible:bg-gold focus-visible:text-ink-deep motion-reduce:transition-none ${className}`}
    >
      <span aria-hidden className="lcs-cup inline-block">
        ☕
      </span>{' '}
      Buy us a coffee
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );

/** A crate of coffee under a little striped parachute, drawn in the game's colours. Sways gently unless motion is reduced. */
const SupplyDrop = () => (
  <svg viewBox="0 0 64 72" width="64" height="72" aria-hidden className="lcs-drop h-16 w-14 shrink-0 sm:h-[72px] sm:w-16">
    <path d="M6 26C6 12 18 4 32 4s26 8 26 22c-4-3-8-3-13 0-4-3-9-3-13 0-4-3-9-3-13 0-5-3-9-3-13 0z" fill="#ff3d6e" />
    <path d="M19 26c0-12 5-20 13-22-3 6-4 14-0 22-4-3-9-3-13 0zM45 26c0-12-5-20-13-22 3 6 4 14 0 22 4-3 9-3 13 0z" fill="#e6ebf5" />
    <path d="M7 26l18 22M58 26L39 48M32 26v22" stroke="#e6ebf5" strokeWidth="1.5" opacity="0.7" />
    <rect x="18" y="46" width="28" height="22" rx="3" fill="#c98b3c" stroke="#0a0d18" strokeWidth="2" />
    <path d="M18 57h28M32 46v22" stroke="#0a0d18" strokeWidth="1.5" opacity="0.35" />
    <text x="32" y="62" textAnchor="middle" fontSize="13">☕</text>
  </svg>
);

/**
 * The home-page version: a supply drop for the studio. The whole card is the link, sitting under the Drop in button so it never
 * competes with it, with a gold button in the game's cut-corner style.
 */
export const SupportCard = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className="panel-cut group flex w-full max-w-md items-center gap-4 border-2 border-gold/50 bg-ink/85 p-3.5 backdrop-blur-sm transition hover:border-gold hover:bg-ink focus-visible:border-cream focus-visible:bg-gold/15 focus-visible:outline-none sm:p-4"
  >
    <SupplyDrop />
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
      <span className="font-display text-lg leading-tight text-cream sm:text-xl">Send us a supply drop</span>
      <span className="text-sm leading-snug text-cream/75">The game is free to play. A coffee for the studio keeps the next update coming.</span>
      <span className="panel-cut mt-1 inline-flex items-center gap-2 bg-gold px-4 py-1.5 text-sm font-bold text-ink-deep transition group-hover:brightness-110 group-focus-visible:brightness-110">
        ☕ Buy us a coffee
        <span aria-hidden className="transition group-hover:translate-x-1 motion-reduce:transition-none">
          →
        </span>
      </span>
    </span>
    <span className="sr-only"> (opens the Nalbaki Games support page in a new tab)</span>
  </a>
);

/** A coffee button pinned to the top corner of the home page, so it is seen on the first screen of a phone too. */
export const SupportCorner = () => (
  <a
    href={SUPPORT_URL}
    target="_blank"
    rel="noopener"
    className="lcs-corner panel-cut absolute right-4 top-4 z-20 inline-flex items-center gap-2 bg-gold px-3.5 py-2 text-sm font-bold text-ink-deep shadow-[0_0_24px_rgba(255,210,63,0.35)] transition hover:brightness-110 focus-visible:bg-cream focus-visible:underline focus-visible:outline-none sm:right-8 sm:top-6"
  >
    <span aria-hidden className="lcs-cup inline-block">
      ☕
    </span>
    Buy us a coffee
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);
