'use client';

/**
 * The main menu (Nalbaki Games front-end spec): the live battleground behind everything (the real map, the plane crossing,
 * fighters under their parachutes), a dark gradient on the left with the title and a big slanted menu: PLAY, FIGHTER,
 * SETTINGS, HOW TO PLAY, CREDITS. ↑/↓ (or W/S) move, Enter picks, Esc closes a panel; hover and focus slide in an accent
 * bar with a soft tick. On phones the menu is a stack of thumb-sized buttons at the bottom over the scene.
 */
import { useEffect, useRef, useState } from 'react';

import { FighterCard, FighterGrid, HowTo, usePortraits } from '~/components/FighterSelect';
import { MenuBanner } from '~/components/MenuBanner';
import { SettingsPanel } from '~/components/SettingsPanel';
import { setUiSound, uiTick } from '~/components/uiSound';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { FIGHTERS, PLAYERS } from '~/game/sim/constants';
import { brandUrl } from '~/lib/assets';
import { boot, loadCount, onLoadCount } from '~/lib/loading';
import { GAME_TITLE, ONLINE_PLAY } from '~/lib/studio';
import { loadDone, track } from '~/lib/telemetry';

import type { AimMode } from '~/game/render/game';
import type { Settings } from '~/game/settings';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';
import type { ComponentType, ReactNode } from 'react';

export const GAME_VERSION = '1.0.0';

type Panel = 'fighter' | 'settings' | 'how' | 'credits' | null;

/** The live scene behind the menu, cheaper on the low tier and still with reduced motion. */
const Backdrop = ({ settings, platform, onLive }: { settings: Settings; platform: Platform; onLive?: () => void }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const tier = resolveTier(settings.quality, deviceFacts(platform.deviceType()));
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ startShowcase }) => {
          if (cancelled) return;
          dispose = startShowcase(
            canvas,
            () => {
              setLive(true);
              onLive?.();
            },
            { tier, still: settings.reducedMotion },
          ).dispose;
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      dispose?.();
    };
  }, [tier, settings.reducedMotion]);
  return <canvas ref={ref} aria-hidden className={`fixed inset-0 h-full w-full transition-opacity duration-1000 ${live ? 'opacity-100' : 'opacity-0'}`} />;
};

/** A side panel for Fighter, How to play and Credits (Settings has its own). */
const SidePanel = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex bg-ink-deep/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label={title}
        className="flex h-full w-full max-w-[880px] flex-col border-r border-cream/10 bg-[linear-gradient(100deg,#0a0d18_0%,#121a22_100%)] shadow-[20px_0_60px_rgba(0,0,0,0.5)] [animation:slideIn_0.25s_ease-out]"
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <h2 className="px-5 pb-3 pt-5 font-display text-3xl italic text-green sm:px-7 sm:text-4xl">{title}</h2>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 sm:px-7">{children}</div>
        <footer className="flex justify-end border-t border-cream/10 px-5 py-4 sm:px-7" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            type="button"
            autoFocus
            onClick={() => {
              uiTick(true);
              onClose();
            }}
            className="panel-cut bg-green px-8 py-2.5 font-display text-base uppercase text-ink-deep hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
          >
            Back
          </button>
        </footer>
      </div>
    </div>
  );
};

/** The menu was shown once in this page visit (menu_view and load_done are sent once). */
let menuSent = false;

export const MainMenu = ({
  platform,
  settings,
  onSettings,
  fighter,
  onFighter,
  aim,
  onAim,
  onPlay,
  credit,
  touch,
  support: Support,
  onlineInterest: OnlineInterest,
}: {
  platform: Platform;
  settings: Settings;
  onSettings: (s: Settings) => void;
  fighter: FighterId;
  onFighter: (f: FighterId) => void;
  aim: AimMode;
  onAim: (m: AimMode) => void;
  onPlay: () => void;
  credit: string;
  touch: boolean;
  /** Our own site's Support us pill under the menu (portals pass nothing: no outbound links). */
  support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  /** Our own site's "Online is coming" button under the menu while online play is closed (portals pass nothing). */
  onlineInterest?: ComponentType;
}) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [focus, setFocus] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const portraits = usePortraits(panel !== 'fighter');
  const f = FIGHTERS[fighter];

  // The menu is the first thing a player can use: loading is over.
  useEffect(() => platform.loadingStop(), [platform]);

  // First visit in the portal: the boot screen is still up over the menu. It follows the real loading of the scene behind
  // (each model file, then the first frame) and goes when both are in; the menu's entrance plays as it goes.
  const [entered, setEntered] = useState(() => !boot.active());
  const bootLive = useRef<() => void>(() => {});
  useEffect(() => {
    if (!boot.active()) return;
    // Checkpoints from 0.50 (menu up) to 0.97 (every model in); 100 % only when the scene's first frame is drawn too.
    // The model count is every file asked for since the page opened, so files asked for before the menu still count.
    const MODELS_FROM = 0.56;
    const MODELS_TO = 0.97;
    boot.step('Menu ready', 0.5, MODELS_FROM);
    boot.progress(0.5, 'Building the island', MODELS_FROM);
    boot.ready();
    boot.onGone(() => setEntered(true));
    let live = false;
    let finished = false;
    const check = () => {
      const c = loadCount();
      if (!live || finished || c.done < c.total) return;
      finished = true;
      boot.step('First frame drawn', MODELS_TO);
      boot.done();
    };
    bootLive.current = () => {
      live = true;
      check();
    };
    const models = (c: { done: number; total: number }) => {
      if (c.total <= 0) return;
      const share = (n: number) => MODELS_FROM + (MODELS_TO - MODELS_FROM) * Math.min(1, n / c.total);
      boot.progress(share(c.done), `Loading models  ${c.done} / ${c.total}`, share(c.done + 1));
      check();
    };
    models(loadCount());
    return onLoadCount(models);
  }, []);
  useEffect(() => setUiSound(settings.master, settings.muted || platform.muted()), [settings.master, settings.muted, platform]);

  // Anonymous counting (a no-op unless the web build started it; never on a portal): the first time the menu is on screen.
  useEffect(() => {
    if (!entered || menuSent) return;
    menuSent = true;
    loadDone();
    track('menu_view');
  }, [entered]);

  const items: { id: string; label: string; sub?: string; primary?: boolean; soon?: boolean; run: () => void }[] = [
    { id: 'play', label: 'Play', sub: `Solo · ${PLAYERS - 1} bots`, primary: true, run: onPlay },
    // Online play is not open yet (ONLINE_PLAY): shown, labelled, and not selectable.
    ...(ONLINE_PLAY ? [] : [{ id: 'online', label: 'Online', soon: true, run: () => {} }]),
    { id: 'fighter', label: 'Fighter', sub: f.name, run: () => setPanel('fighter') },
    { id: 'settings', label: 'Settings', run: () => setPanel('settings') },
    { id: 'how', label: 'How to play', run: () => setPanel('how') },
    { id: 'credits', label: 'Credits', run: () => setPanel('credits') },
  ];

  // ↑/↓ (and W/S) walk the menu, Enter and Space pick (the focused button handles those itself).
  useEffect(() => {
    if (panel) return;
    const onKey = (e: KeyboardEvent) => {
      const up = e.code === 'ArrowUp' || e.code === 'KeyW';
      const down = e.code === 'ArrowDown' || e.code === 'KeyS';
      if (!up && !down) return;
      e.preventDefault();
      setFocus((i) => {
        let n = i;
        do n = (n + (down ? 1 : items.length - 1)) % items.length;
        while (items[n].soon && n !== i);
        buttons.current[n]?.focus();
        return n;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, items.length]);
  useEffect(() => {
    if (!panel) buttons.current[focus]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, entered]);

  return (
    <main className="relative h-[100dvh] w-screen select-none overflow-hidden bg-ink-deep text-cream">
      <Backdrop settings={settings} platform={platform} onLive={() => bootLive.current()} />
      {/* Dark on the left for the menu, a vignette round the edges, and on phones a floor of shade under the buttons. */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(10,13,24,0.94)_0%,rgba(10,13,24,0.78)_26%,rgba(10,13,24,0.15)_48%,rgba(10,13,24,0)_70%)] max-sm:bg-[linear-gradient(0deg,rgba(10,13,24,0.96)_0%,rgba(10,13,24,0.75)_45%,rgba(10,13,24,0.1)_75%)]" />
      <div className="pointer-events-none fixed inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.55)]" />

      <div
        key={entered ? 'in' : 'boot'}
        className={`relative flex h-full w-full flex-col justify-between gap-4 px-6 py-6 sm:w-[min(440px,38vw)] sm:min-w-[340px] sm:px-10 sm:py-9 max-sm:justify-end ${panel ? 'invisible' : ''}`}
        aria-hidden={!!panel}
        style={{ paddingLeft: 'max(1.5rem, env(safe-area-inset-left))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex flex-col gap-1 [animation:slideIn_0.5s_ease-out] max-sm:mb-auto max-sm:mt-2 [@media(max-height:500px)]:gap-0">
          <h1 className="m-0">
            {/* The wordmark (brand/last-commit-standing/logo.svg): a fixed-ratio image, so a plain <img> is right. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brandUrl('logo.svg')}
              alt={GAME_TITLE}
              width={1130}
              height={306}
              className={`h-auto w-full max-w-[400px] drop-shadow-[0_6px_28px_rgba(0,0,0,0.65)] [@media(max-height:500px)]:max-w-[260px] ${settings.reducedMotion ? '' : 'lcs-glitch-in'}`}
            />
          </h1>
        </div>

        <div className="flex flex-col gap-4 max-sm:gap-3">
          <nav aria-label="Main menu" className="flex flex-col gap-1.5 max-sm:gap-2 [@media(max-height:500px)]:gap-0.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                disabled={it.soon}
                aria-disabled={it.soon || undefined}
                title={it.soon ? 'Online play is coming soon' : undefined}
                onClick={() => {
                  if (it.soon) return;
                  uiTick(true);
                  it.run();
                }}
                onMouseEnter={() => {
                  if (it.soon) return;
                  if (focus !== i) uiTick();
                  setFocus(i);
                  buttons.current[i]?.focus({ preventScroll: true });
                }}
                onFocus={() => setFocus(i)}
                style={{ animationDelay: `${0.08 + i * 0.05}s` }}
                className={`group relative flex items-baseline gap-3 overflow-hidden text-left outline-none disabled:cursor-not-allowed [animation:slideIn_0.45s_ease-out_both] focus-visible:ring-1 focus-visible:ring-green/35 max-sm:panel-cut max-sm:bg-ink/80 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur ${it.primary ? 'py-1 sm:py-2' : 'py-1'}`}
              >
                {/* The accent bar slides in from the left on hover and focus. */}
                <span className={`absolute left-0 top-1/2 h-[70%] w-1.5 -translate-y-1/2 -skew-x-12 bg-green transition-all duration-200 ${focus === i ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'}`} />
                <span
                  className={`font-display uppercase italic leading-none transition-all duration-200 ${it.soon ? 'text-cream/35' : focus === i ? 'translate-x-5 text-green' : 'text-cream/85'} ${it.primary ? 'text-5xl sm:text-6xl [@media(max-height:500px)]:text-4xl' : 'text-2xl sm:text-3xl [@media(max-height:500px)]:text-xl'}`}
                >
                  {it.label}
                </span>
                {it.soon && <span className="self-center rounded-sm bg-gold/90 px-2 py-0.5 text-xs font-bold text-ink-deep">Coming soon</span>}
                {it.sub && <span className={`text-[11px] font-bold uppercase tracking-widest transition-all duration-200 ${focus === i ? 'translate-x-5 text-cream/80' : 'text-cream/45'}`}>{it.sub}</span>}
              </button>
            ))}
          </nav>

          {/* Our own site's extras (never on a portal): the "Online is coming" button and the Support us pill. */}
          {((OnlineInterest && !ONLINE_PLAY) || Support) && (
            // On a short landscape screen the menu fills the height, so they sit at the bottom right, over the scene.
            <div className="flex flex-col items-start gap-3 [animation:slideIn_0.45s_ease-out_0.4s_both] [@media(max-height:500px)]:fixed [@media(max-height:500px)]:bottom-[max(0.75rem,env(safe-area-inset-bottom))] [@media(max-height:500px)]:right-[max(1rem,env(safe-area-inset-right))] [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2">
              {OnlineInterest && !ONLINE_PLAY && <OnlineInterest />}
              {Support && <Support variant="menu" />}
            </div>
          )}

          {/* The portal's banner (none on our own site): under the menu, on phones at the bottom, collapsed when empty. */}
          <MenuBanner platform={platform} active={entered && !panel} />
        </div>

        <footer className="flex items-center justify-between gap-3 text-xs text-cream/50 max-sm:mt-2">
          <span>{credit}</span>
          <span>
            v{GAME_VERSION}
            {!touch && <span className="ml-3 hidden lg:inline">↑ ↓ · Enter</span>}
          </span>
        </footer>
      </div>

      {panel === 'settings' && (
        <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setPanel(null)} touch={touch} aim={{ value: aim, onChange: onAim }} portalMuted={platform.muted()} />
      )}
      {panel === 'fighter' && (
        <SidePanel title="Fighter" onClose={() => setPanel(null)}>
          <FighterCard fighter={fighter} portraits={portraits} />
          <FighterGrid fighter={fighter} portraits={portraits} onPick={(id) => (uiTick(), onFighter(id))} />
        </SidePanel>
      )}
      {panel === 'how' && (
        <SidePanel title="How to play" onClose={() => setPanel(null)}>
          <HowTo />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {(
              [
                ['up', 'Move'],
                ['fire', 'Shoot'],
                ['jump', 'Jump'],
                ['use', 'Pick up / use'],
                ['reload', 'Reload'],
                ['roll', 'Roll'],
                ['super', 'Super'],
                ['leanL', 'Lean left'],
                ['leanR', 'Lean right'],
                ['pause', 'Pause'],
              ] as const
            ).map(([a, label]) => (
              <div key={a} className="flex items-center justify-between gap-2 border-b border-cream/5 py-1.5">
                <span className="text-cream/70">{label}</span>
                <kbd className="rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1.5 text-xs font-bold">
                  {a === 'up' ? [settings.keys.up, settings.keys.left, settings.keys.down, settings.keys.right].map(keyLabel).join(' ') : keyLabel(settings.keys[a])}
                </kbd>
              </div>
            ))}
          </div>
          <p className="text-sm text-cream/60">On a phone: the left thumb moves (the stick appears where you touch), FIRE aims by itself at whoever you can see, and the small arrow button above it picks up what you stand on (a key shows over it).</p>
        </SidePanel>
      )}
      {panel === 'credits' && (
        <SidePanel title="Credits" onClose={() => setPanel(null)}>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-cream/55">A game by</span>
            <span className="font-display text-3xl">{credit}</span>
          </div>
          <div className="flex flex-col gap-2 text-sm text-cream/75">
            <p>Design, code, characters, vehicles, the island, effects and synthesised sound: {credit}.</p>
            <p>Houses, crops, fences, crates and props: Kenney (CC0).</p>
            <p>Recorded gunshots and reloads: Snake&apos;s Authentic Gun Sounds.</p>
            <p>Fonts: Bungee and Chakra Petch (SIL Open Font License).</p>
            <p>Built with three.js and React.</p>
          </div>
          <span className="text-xs text-cream/45">Version {GAME_VERSION}</span>
        </SidePanel>
      )}
    </main>
  );
};
