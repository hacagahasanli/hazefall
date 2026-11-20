'use client';

/**
 * The main menu (Nalbaki Games front-end spec): the live battleground behind everything (the real map, the plane crossing,
 * fighters under their parachutes), a dark gradient on the left with the title and a big slanted menu: PLAY, FIGHTER,
 * SETTINGS, HOW TO PLAY, CREDITS. ↑/↓ (or W/S) move, Enter picks, Esc closes a panel; hover and focus slide in an accent
 * bar with a soft tick. On phones the menu is a stack of thumb-sized buttons at the bottom over the scene.
 */
import { useEffect, useRef, useState } from 'react';

import { FighterCard, FighterGrid, HowTo, usePortraits } from '~/components/FighterSelect';
import { SettingsPanel } from '~/components/SettingsPanel';
import { setUiSound, uiTick } from '~/components/uiSound';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { FIGHTERS } from '~/game/sim/constants';
import { brandUrl } from '~/lib/assets';
import { boot, loadCount, onLoadCount } from '~/lib/loading';
import { GAME_TITLE } from '~/lib/studio';

import type { AimMode } from '~/game/render/game';
import type { Settings } from '~/game/settings';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';
import type { ReactNode } from 'react';

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
    boot.step('Menu ready', 0.72);
    boot.progress(0.72, 'Building the battleground');
    boot.ready();
    boot.onGone(() => setEntered(true));
    const base = loadCount();
    let live = false;
    let models = false;
    let finished = false;
    const check = () => {
      if (!live || !models || finished) return;
      finished = true;
      boot.step('First frame drawn', 1);
      boot.done();
    };
    bootLive.current = () => {
      live = true;
      check();
    };
    return onLoadCount((c) => {
      const total = c.total - base.total;
      const done = c.done - base.done;
      if (total <= 0 || models) return;
      boot.progress(0.72 + 0.26 * (done / total), `Loading models  ${done} / ${total}`);
      if (done < total) return;
      models = true;
      boot.step(`Models  ${total} / ${total}`, 0.98);
      check();
    });
  }, []);
  useEffect(() => setUiSound(settings.master, settings.muted || platform.muted()), [settings.master, settings.muted, platform]);

  const items: { id: string; label: string; sub?: string; primary?: boolean; run: () => void }[] = [
    { id: 'play', label: 'Play', sub: 'Solo · 9 bots', primary: true, run: onPlay },
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
        const n = (i + (down ? 1 : items.length - 1)) % items.length;
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

        <nav aria-label="Main menu" className="flex flex-col gap-1.5 max-sm:gap-2 [@media(max-height:500px)]:gap-0.5">
          {items.map((it, i) => (
            <button
              key={it.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              onClick={() => {
                uiTick(true);
                it.run();
              }}
              onMouseEnter={() => {
                if (focus !== i) uiTick();
                setFocus(i);
                buttons.current[i]?.focus({ preventScroll: true });
              }}
              onFocus={() => setFocus(i)}
              style={{ animationDelay: `${0.08 + i * 0.05}s` }}
              className={`group relative flex items-baseline gap-3 overflow-hidden text-left outline-none [animation:slideIn_0.45s_ease-out_both] focus-visible:ring-1 focus-visible:ring-green/35 max-sm:panel-cut max-sm:bg-ink/80 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur ${it.primary ? 'py-1 sm:py-2' : 'py-1'}`}
            >
              {/* The accent bar slides in from the left on hover and focus. */}
              <span className={`absolute left-0 top-1/2 h-[70%] w-1.5 -translate-y-1/2 -skew-x-12 bg-green transition-all duration-200 ${focus === i ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'}`} />
              <span
                className={`font-display uppercase italic leading-none transition-all duration-200 ${focus === i ? 'translate-x-5 text-green' : 'text-cream/85'} ${it.primary ? 'text-5xl sm:text-6xl [@media(max-height:500px)]:text-4xl' : 'text-2xl sm:text-3xl [@media(max-height:500px)]:text-xl'}`}
              >
                {it.label}
              </span>
              {it.sub && <span className={`text-[11px] font-bold uppercase tracking-widest transition-all duration-200 ${focus === i ? 'translate-x-5 text-cream/80' : 'text-cream/45'}`}>{it.sub}</span>}
            </button>
          ))}
        </nav>

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
                ['fire', 'Shoot / jump'],
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
          <p className="text-sm text-cream/60">On a phone: the left thumb moves (the stick appears where you touch), FIRE aims by itself at whoever you can see.</p>
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
