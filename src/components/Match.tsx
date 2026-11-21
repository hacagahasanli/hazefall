'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ComponentType } from 'react';

import { COPY } from '~/game/copy/studio';
import { GRADE_CSS, startMatch } from '~/game/render/game';
import { FIGHTERS } from '~/game/sim/constants';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { usePlatformRound } from '~/components/usePlatformRound';
import { useTelemetry } from '~/components/useTelemetry';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { SettingsPanel } from '~/components/SettingsPanel';
import { useSettings } from '~/components/useSettings';
import { createWebPlatform } from '~/platform/web';
import { TouchControls, useTouch } from '~/components/TouchControls';
import { ShockRing, Streaks } from '~/components/Transitions';
import { uiImpact } from '~/components/uiSound';
import { capLabel, Counters, Vitals, Weapons } from '~/components/Hud';
import { createBootProgress } from '~/lib/bootProgress';
import { loadCount, onLoadCount } from '~/lib/loading';
import type { Session } from '~/game/net/session';
import type { HudState } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

/** Seconds the "who took you out" card shows before the round report. */
const DEATH_CARD = 2.2;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The placement's colour: gold for the win, green for the last five, cream for the rest. */
const placeColor = (place: number) => (place === 1 ? '#ffd23f' : place <= 5 ? '#3ddc84' : '#e6ebf5');

/**
 * The placement on the round report, in the game's display face as a sticker: a hard dark drop under the numerals and a
 * slanted band behind them (red for a knock-out, gold for the win). It counts down from the last place to yours, then
 * lands with a hit and a ring (a win lands gold, with slow rays behind). Without motion it is simply there.
 */
const Placement = ({ place, total, won, fx }: { place: number; total: number; won: boolean; fx: boolean }) => {
  const [n, setN] = useState(fx ? total : place);
  const [landed, setLanded] = useState(!fx);
  useEffect(() => {
    if (!fx) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 520);
      setN(Math.round(total + (place - total) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        setLanded(true);
        uiImpact(won ? 1 : 0.55);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const color = landed ? placeColor(place) : '#e6ebf5';
  return (
    <div className="relative flex items-end gap-3 leading-none" aria-label={`Placed ${place} of ${total}`}>
      {won && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[40%] top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-70"
          style={{
            background: 'repeating-conic-gradient(from 0deg, rgba(255,210,63,0.3) 0deg 7deg, transparent 7deg 22deg)',
            maskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
            animation: fx ? 'lcsRays 24s linear infinite' : undefined,
          }}
        />
      )}
      {landed && fx && <ShockRing color={won ? '#ffd23f' : '#ff3d6e'} size="16rem" duration={0.7} />}
      <span aria-hidden className="relative block">
        {/* The band behind the numerals. */}
        <span
          className="absolute -left-4 -right-5 bottom-[14%] top-[46%] -skew-x-12"
          style={{
            background: won ? 'linear-gradient(90deg,#1d2540,#141a2b)' : 'linear-gradient(90deg,#ff3d6e,#c42a55)',
            boxShadow: won ? 'inset 0 3px 0 #ffd23f, inset 0 -3px 0 #ffb020' : undefined,
            opacity: landed ? 0.95 : 0.4,
          }}
        />
        <span
          key={landed ? 'landed' : 'counting'}
          className={`relative flex items-start font-display text-[7rem] sm:text-[10rem] [@media(max-height:520px)]:text-[5rem] ${landed ? '' : 'opacity-70'}`}
          style={{
            color,
            textShadow: '0 0.045em 0 #0a0d18, 0 0.09em 0 rgba(10,13,24,0.55), 0 0.2em 0.5em rgba(0,0,0,0.45)',
            animation: landed && fx ? 'lcsLand 0.45s cubic-bezier(0.2,0.8,0.2,1) both' : undefined,
          }}
        >
          <span className="mr-[0.04em] mt-[0.12em] text-[0.45em]">#</span>
          {n}
        </span>
      </span>
      <span className="relative mb-[1rem] flex items-baseline gap-1.5 whitespace-nowrap text-cream/60 [@media(max-height:520px)]:mb-2">
        <span className="text-lg">of</span>
        <span className="font-display text-3xl leading-none text-cream/80">{total}</span>
      </span>
    </div>
  );
};

/**
 * The loading screen of a round that is not built behind the lobby (the site's rounds): a holo panel with the real
 * progress (the model files asked for and arrived since it opened), the plane crossing, and a rotating tip.
 */
const MatchLoading = ({ fx }: { fx: boolean }) => {
  const [c, setC] = useState({ done: 0, total: 0 });
  const [tip, setTip] = useState(() => Math.floor(Math.random() * COPY.tips.length));
  // One number drives both the bar and the percent: real checkpoints move it, it eases between them on every frame, never
  // goes back (more files asked for later only slow it down) and holds at 99 % until the round takes over.
  const progress = useMemo(() => createBootProgress(), []);
  const [shown, setShown] = useState({ value: 0, percent: 0 });
  useEffect(() => {
    const base = loadCount();
    // Building the map comes first (no files yet), then the models arrive one by one.
    const checkpoint = (done: number, total: number) => {
      if (total > 0) progress.reach(0.2 + (0.75 * done) / total, 0.2 + (0.75 * Math.min(total, done + 1)) / total);
      else progress.reach(0.05, 0.2);
    };
    checkpoint(0, 0);
    const off = onLoadCount((n) => {
      const done = n.done - base.done;
      const total = n.total - base.total;
      setC({ done, total });
      checkpoint(done, total);
    });
    const t = setInterval(() => setTip((i) => i + 1), 3600);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const value = progress.tick((now - last) / 1000);
      last = now;
      const percent = progress.percent();
      setShown((s) => (s.value === value && s.percent === percent ? s : { value, percent }));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      off();
      clearInterval(t);
      cancelAnimationFrame(raf);
    };
  }, [progress]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#13213a,#0a0d18_60%,#05070e)] px-6" role="status" aria-live="polite">
      <div aria-hidden className="grid-bg absolute inset-0 opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.25)_0_1px,transparent_1px_3px)]" />
      {fx && <Streaks color="#3ec5ff" count={4} seed={7} />}
      <div className="relative flex w-full max-w-md flex-col gap-3">
        <div className="lcs-glitch-in font-display text-3xl leading-none text-gold sm:text-4xl" style={{ textShadow: '-3px 0 rgba(255,61,110,0.6), 3px 0 rgba(62,197,255,0.6)' }}>
          Loading the map
        </div>
        <div className="flex items-baseline justify-between text-sm text-cream/70">
          <span>{c.total > 0 ? `Models ${c.done} / ${c.total}` : 'Building the battleground'}</span>
          <span className="font-display text-xl tabular-nums text-cream">{shown.percent}%</span>
        </div>
        <div className="panel-cut relative h-3 overflow-hidden bg-cream/10">
          <div className="h-full origin-left bg-[linear-gradient(90deg,#3ddc84,#ffd23f)]" style={{ transform: `scaleX(${shown.value})` }} />
          <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9px,#0a0d18_9px_12px)]" />
        </div>
        <p key={tip} className="min-h-10 text-sm text-cream/80 [animation:riseIn_0.4s_ease-out]">
          <span className="mr-2 font-display text-gold">›</span>
          {COPY.tips[tip % COPY.tips.length]}
        </p>
      </div>
    </div>
  );
};

/** The cup that crowns a win. */
const Trophy = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden>
    <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="#ffd23f" stroke="#0a0d18" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M14 9H7v3a8 8 0 0 0 8 8M34 9h7v3a8 8 0 0 1-8 8" fill="none" stroke="#0a0d18" strokeWidth="6" strokeLinecap="round" />
    <path d="M14 9H7v3a8 8 0 0 0 8 8M34 9h7v3a8 8 0 0 1-8 8" fill="none" stroke="#ffd23f" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M21 26h6v7h-6zM15 34h18v6H15z" fill="#ffb020" stroke="#0a0d18" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M18 9v6" stroke="#fff6c8" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const StatGlyph = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const STAT_ICON = {
  kills: 'M8 2.8a5.2 5.2 0 1 0 0 10.4A5.2 5.2 0 1 0 8 2.8M8 .8v3.4M8 11.8v3.4M.8 8h3.4M11.8 8h3.4',
  damage: 'M8 1l1.6 4.2L14 4l-2.6 3.6L15 10l-4.4.2L11 15l-3-3.4L5 15l.4-4.8L1 10l3.6-2.4L2 4l4.4 1.2z',
  survived: 'M8 2.5a6 6 0 1 0 0 12 6 6 0 1 0 0-12M8 5.5v3.2l2.2 1.4M6.4 1h3.2',
};

/**
 * The round report: where you placed, who took you out and with what, and how your round went,
 * then straight into the next match or back to the lobby.
 */
const Result = ({
  hud,
  onPlayAgain,
  onExit,
  online,
  Support,
  exitLabel,
  fx,
}: {
  hud: HudState;
  onPlayAgain: () => void;
  onExit: () => void;
  online: boolean;
  Support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  exitLabel: string;
  /** Motion on (the game's reduced-motion setting off). */
  fx: boolean;
}) => {
  // The host's browser runs the round: it must stay until the round is over.
  const hostWaits = online && hud.host && hud.phase !== 'over';
  const place = hud.won ? 1 : hud.placement;
  const stats: { key: keyof typeof STAT_ICON; label: string; value: string; color: string }[] = [
    { key: 'kills', label: hud.kills === 1 ? 'Kill' : 'Kills', value: String(hud.kills), color: '#ff3d6e' },
    { key: 'damage', label: 'Damage', value: String(hud.damage), color: '#ffd23f' },
    { key: 'survived', label: 'Survived', value: fmtTime(hud.survived), color: '#3ec5ff' },
  ];
  const killerColor = hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff';
  const accent = hud.won ? '#ffd23f' : '#ff3d6e';
  return (
    <div className="absolute inset-0 z-30 flex animate-[fadeIn_0.35s_ease-out] overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_at_30%_40%,rgba(20,26,43,0.7),rgba(10,13,24,0.95))] px-6 py-4 backdrop-blur-sm">
      {/* The report comes in on a slash of light, gold for a win and red for a loss, and a few streaks. */}
      {fx && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[-20%] left-0 w-[45vw]"
            style={{ background: `linear-gradient(90deg, transparent, ${hud.won ? 'rgba(255,210,63,0.35)' : 'rgba(255,61,110,0.3)'}, transparent)`, animation: 'lcsSweep 0.7s cubic-bezier(0.6,0,0.3,1) both' }}
          />
          <Streaks color={accent} count={hud.won ? 10 : 6} seed={hud.placement} />
        </>
      )}
      {/* A win: a warm gold light from above. */}
      {hud.won && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,210,63,0.22),transparent_70%)]" />}
      <div className="relative m-auto flex w-full max-w-3xl flex-col gap-7 [@media(max-height:520px)]:gap-3">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 [@media(max-height:520px)]:gap-y-2">
          <div className="flex flex-col items-start">
            {hud.won && (
              <Trophy
                className="mb-1 ml-2 h-16 w-16 drop-shadow-[0_0_24px_rgba(255,210,63,0.6)] sm:h-20 sm:w-20 [@media(max-height:520px)]:h-10 [@media(max-height:520px)]:w-10"
                style={fx ? { animation: 'lcsLand 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.55s both' } : undefined}
              />
            )}
            <Placement place={place} total={hud.total} won={hud.won} fx={fx} />
          </div>
          <div className="flex max-w-sm flex-col gap-2 pb-4 [@media(max-height:520px)]:pb-1">
            <h2
              className={`font-display text-3xl leading-none sm:text-[2.6rem] [@media(max-height:520px)]:text-2xl ${fx ? 'lcs-glitch-in' : ''}`}
              style={{ color: hud.won ? '#ffd23f' : '#e6ebf5', ...(fx ? { animationDelay: '0.45s' } : {}) }}
            >
              {hud.won ? COPY.result.won : COPY.result.lost}
            </h2>
            <p className="text-lg leading-snug text-cream/80">
              {hud.won ? (
                <>{COPY.result.wonLine(hud.total - 1)}</>
              ) : hud.killedBy ? (
                <>
                  Taken out by{' '}
                  <b className="font-display" style={{ color: killerColor }}>
                    {hud.killedBy}
                  </b>{' '}
                  with {hud.killedWith}.
                </>
              ) : (
                <>Caught outside by {hud.killedWith ?? COPY.zone.name}.</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((st, i) => (
              <div
                key={st.key}
                className="panel-cut flex animate-[riseIn_0.5s_ease-out_both] items-center gap-3 bg-ink/90 px-4 py-3 [@media(max-height:520px)]:py-2"
                style={{ animationDelay: `${0.5 + i * 0.07}s`, boxShadow: `inset 3px 0 0 ${st.color}` }}
              >
                <span style={{ color: st.color }} className="hidden sm:block">
                  <StatGlyph d={STAT_ICON[st.key]} />
                </span>
                <span className="flex flex-col">
                  <span className="font-display text-3xl leading-none text-cream [@media(max-height:520px)]:text-2xl">{st.value}</span>
                  <span className="mt-1 text-sm text-cream/60">{st.label}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="animate-[riseIn_0.5s_ease-out_0.75s_both] text-sm text-cream/55">
            Accuracy <b className="font-semibold text-cream/85">{hud.accuracy}%</b>
            <span className="mx-2 text-cream/25">·</span>
            <b className="font-semibold text-cream/85">{hud.distance} m</b> on foot
          </p>
        </div>

        {hostWaits && (
          <p className="text-sm text-cream/70">
            You are the host: the round runs on your device, so it goes on for the others until
            there is a winner. {hud.alive} still standing.
          </p>
        )}
        <div className="flex flex-wrap gap-3 [animation:riseIn_0.4s_ease-out_0.8s_both]">
          <button
            type="button"
            autoFocus
            disabled={hostWaits}
            onClick={onPlayAgain}
            className="panel-cut bg-gold px-10 py-3.5 font-display text-xl text-ink-deep shadow-[0_6px_0_#b8901c] transition hover:brightness-110 active:translate-y-[3px] active:shadow-[0_3px_0_#b8901c] disabled:opacity-40 [@media(max-height:520px)]:py-2.5"
          >
            {online ? 'Back to the room' : 'Play again'}
          </button>
          {!online && (
            <button
              type="button"
              onClick={onExit}
              className="panel-cut bg-cream/10 px-8 py-3.5 font-display text-lg text-cream/90 transition hover:bg-cream/20 disabled:opacity-40 [@media(max-height:520px)]:py-2.5"
            >
              {exitLabel}
            </button>
          )}
        </div>
        {Support && (
          <div className="[animation:riseIn_0.45s_ease-out_1s_both]">
            <Support variant="card" />
          </div>
        )}
      </div>
    </div>
  );
};

export const Match = ({
  fighter,
  session,
  onExit,
  onPlayAgain,
  platform: platformProp,
  support: Support,
  credit,
  exitLabel = 'Back to lobby',
  held = false,
  onLoaded,
}: {
  fighter: FighterId;
  session?: Session;
  onExit: () => void;
  onPlayAgain: () => void;
  /** The page's platform (a portal SDK); our own site gets the no-op web adapter. */
  platform?: Platform;
  /** The site's support link (the only outbound link in a round). Left out in the portal build: portals allow none. */
  support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  /** A studio credit line in the pause menu. */
  credit?: string;
  /** The report's second button, and the pause menu's way out. */
  exitLabel?: string;
  /** Built behind the pre-match screen: loads, then waits frozen and silent until this turns false. */
  held?: boolean;
  /** The map is built and the first frames are drawn (the pre-match screen may launch). */
  onLoaded?: () => void;
}) => {
  const heldRef = useRef(held);
  heldRef.current = held;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const online = !!session?.online;
  const platform = useMemo(() => platformProp ?? createWebPlatform(), [platformProp]);
  const [settings, setSettings] = useSettings(platform.storage);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Larger HUD text (accessibility): the HUD blocks are zoomed as a whole, so nothing reflows. */
  const hudZoom = settings.largeHud ? 1.25 : 1;
  const [game, setGame] = useState<ReturnType<typeof startMatch> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ReturnType<typeof startMatch> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastEsc = useRef(0);
  const touch = useTouch();

  // Building the map takes a moment and blocks the page: let the loading screen paint first
  // (two animation frames), then build. The screen goes when the first HUD update arrives.
  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = mapRef.current;
    if (!canvas || !minimap) return;
    let m: ReturnType<typeof startMatch> | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        const st = settingsRef.current;
        m = startMatch(canvas, {
          fighter,
          held: heldRef.current,
          name: 'you',
          aimMode: readAim(),
          minimap,
          onHud: setHud,
          session,
          tier: resolveTier(st.quality, deviceFacts(platform.deviceType())),
          autoTier: st.quality === 'auto',
          settings: st,
          onMuteKey: () => setSettings({ ...settingsRef.current, muted: !settingsRef.current.muted }),
        });
        gameRef.current = m;
        setGame(m);
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gameRef.current = null;
      setGame(null);
      m?.dispose();
    };
  }, [fighter, session, platform]);

  // Settings changed (in the pause menu, or the mute key): applied to the running round at once.
  const lastQuality = useRef(settings.quality);
  useEffect(() => {
    if (!game) return;
    game.applySettings(settings);
    if (lastQuality.current !== settings.quality) {
      lastQuality.current = settings.quality;
      game.setTier(resolveTier(settings.quality, deviceFacts(platform.deviceType())));
    }
  }, [game, settings, platform]);

  // Held behind the pre-match screen until the launch; then the picture comes up out of the launch's black.
  useEffect(() => {
    game?.setHeld(held);
  }, [game, held]);
  useEffect(() => {
    if (hud) onLoadedRef.current?.();
  }, [!!hud]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = FIGHTERS[fighter];
  const over = hud && (hud.dead || hud.phase === 'over');
  // Let the fall play out first (or the win sink in) before the report comes up: going down,
  // a short card says who took you out and with what, then the report follows.
  const showResult =
    !!hud && ((hud.dead && hud.deadFor > DEATH_CARD) || (hud.won && hud.phase === 'over'));
  /** Kill colour (the banner, the death card): red, or orange in colour-blind mode. */
  const killColor = settings.colorBlind ? '#ff9f1c' : '#ff3d6e';

  // Anonymous usage events: a no-op unless the site started counting (never on a portal build).
  useTelemetry(hud, { held, showResult, online });

  usePlatformRound(platform, game, {
    loaded: !!hud && !held,
    playing: !!hud && !held && !menuOpen && !showResult && hud.phase !== 'over',
  });

  // Esc twice opens the menu and pauses the match (it's offline, so pausing is fair). Esc closes it.
  // P does the same in one press (in a portal's fullscreen, Esc belongs to the browser).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || heldRef.current) return;
      if (e.code === settingsRef.current.keys.pause && !e.repeat) {
        if (!over) setMenuOpen((o) => !o);
        return;
      }
      if (e.code !== 'Escape') return;
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      const now = performance.now();
      const double = now - lastEsc.current < 450;
      lastEsc.current = double ? 0 : now;
      if (double) setMenuOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, over, settingsOpen]);

  useEffect(() => {
    gameRef.current?.setPaused(menuOpen);
    if (!menuOpen) setSettingsOpen(false);
  }, [menuOpen]);

  // Remember the aim choice, whether it was made in the menu or with T.
  useEffect(() => {
    if (!hud) return;
    saveAim(hud.aimMode);
  }, [hud?.aimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
      {/* The picture opens out of the launch's black: two shutters part from a bright seam (a plain fade without motion). */}
      {!held && hud &&
        (settings.reducedMotion ? (
          <div className="pointer-events-none absolute inset-0 z-[60] bg-black [animation:fadeOut_0.5s_ease-out_forwards]" />
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[60] overflow-hidden [animation:fadeOut_0.1s_linear_0.6s_forwards]">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-black [animation:lcsShutterUp_0.55s_cubic-bezier(0.7,0,0.2,1)_both]" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-black [animation:lcsShutterDown_0.55s_cubic-bezier(0.7,0,0.2,1)_both]" />
            <div className="absolute inset-x-0 top-1/2 -mt-px h-[2px] bg-white shadow-[0_0_30px_8px_rgba(255,210,63,0.8)] [animation:lcsSeam_0.5s_ease-out_both]" />
          </div>
        ))}
      {!hud && !held && <MatchLoading fx={!settings.reducedMotion} />}
      {/* Outside the Deadline: the screen turns blue, and the edges flash red with every bite. */}
      {hud?.zone.outside && !hud.dead && hud.phase !== 'over' && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(47,140,255,0.12) 35%, rgba(30,90,220,0.42) 100%)',
            }}
          />
          <div
            key={hud.zoneHits}
            className="pointer-events-none absolute inset-0 z-20 animate-[zonePulse_0.7s_ease-out_forwards]"
            style={{ boxShadow: `inset 0 0 140px 40px ${settings.colorBlind ? 'rgba(255,159,28,0.75)' : 'rgba(255,40,60,0.75)'}` }}
          />
        </>
      )}
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`}
      />

      {/* Minimap */}
      {/* On phones it sits top right, out of the thumbs' way. */}
      <div
        className={`panel-cut absolute bg-ink-deep/80 p-1.5 ${touch ? 'right-2 top-2' : 'bottom-3 right-3'}`}
        style={touch ? { marginRight: 'env(safe-area-inset-right)' } : undefined}
      >
        {/* Big while you're on the plane choosing where to jump. */}
        <canvas
          ref={mapRef}
          width={hud?.stage === 'drone' ? 340 : 192}
          height={hud?.stage === 'drone' ? 340 : 192}
          className={
            hud?.stage === 'drone'
              ? touch
                ? 'block h-[min(340px,62vh,62vw)] w-[min(340px,62vh,62vw)]'
                : 'block h-[340px] w-[340px]'
              : touch
                ? 'block h-[min(120px,28vh,30vw)] w-[min(120px,28vh,30vw)]'
                : 'block h-48 w-48'
          }
        />
      </div>

      {hud && (
        <>
          {/* You: health, shield, what you carry and the ability rings, bottom left (top left on a phone, out of the thumbs' way). */}
          <div
            className={`pointer-events-none absolute flex flex-col gap-1.5 ${touch ? 'left-3 top-2' : 'bottom-4 left-4'}`}
            style={{ ...(touch ? { marginLeft: 'env(safe-area-inset-left)' } : {}), zoom: hudZoom }}
          >
            <Vitals
              hud={hud}
              colorBlind={settings.colorBlind}
              rings={!touch}
              keys={{ super: capLabel(settings.keys.super), roll: capLabel(settings.keys.roll) }}
            />
            {touch && <Weapons hud={hud} keys={null} compact />}
          </div>
          {/* Your guns, over the minimap (bottom right). */}
          {!touch && (
            <div className="pointer-events-none absolute bottom-[222px] right-3 w-[204px]" style={{ zoom: hudZoom }}>
              <Weapons hud={hud} keys={[capLabel(settings.keys.slot1), capLabel(settings.keys.slot2)]} compact={false} />
            </div>
          )}
          {/* Players left and your kills, top right, the kill feed under them. */}
          {!touch && (
            <div className="panel-cut pointer-events-none absolute right-4 top-3 bg-ink-deep/80 px-3 py-1.5" style={{ zoom: hudZoom }}>
              <Counters alive={hud.alive} kills={hud.kills} pulse={!settings.reducedMotion} />
            </div>
          )}

          {/* The first seconds on the plane: what this game is about. */}
          {hud.stage === 'drone' && hud.phase === 'drop' && hud.planeTime < 3.2 && (
            <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.6),rgba(10,13,24,0.1)_70%)] px-6 text-center">
              {COPY.intro.above && (
                <div className="font-mono text-xs tracking-[0.3em] text-green/90 [animation:fadeIn_0.4s_ease-out]">{COPY.intro.above}</div>
              )}
              <div
                className={`font-display text-4xl leading-none text-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-7xl ${settings.reducedMotion ? '' : 'lcs-glitch-in'}`}
                style={settings.reducedMotion ? undefined : { animationDelay: '0.35s' }}
              >
                {COPY.intro.title(hud.total)[0]}
                <br />
                {COPY.intro.title(hud.total)[1]}
              </div>
              <div className="max-w-lg text-sm text-cream/85 [animation:fadeIn_0.8s_ease-out] sm:text-base">{COPY.intro.line}</div>
              {COPY.intro.below && (
                <div className="font-mono text-xs tracking-[0.3em] text-orange/90 [animation:fadeIn_0.4s_ease-out]">{COPY.intro.below}</div>
              )}
            </div>
          )}

          {/* Deadline and players left */}
          <div
            className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[124px] sm:top-3' : 'top-3'}`}
          >
            <div className="panel-cut flex items-center gap-3 bg-ink-deep/85 px-3 py-1 sm:gap-4 sm:px-4 sm:py-1.5" style={{ zoom: hudZoom }}>
              {touch && (
                <>
                  <Counters alive={hud.alive} kills={hud.kills} pulse={!settings.reducedMotion} />
                  <span className="h-4 w-px bg-cream/20" />
                </>
              )}
              <span
                className={`text-sm ${hud.zone.outside ? 'font-bold text-orange' : 'text-cream/80'}`}
              >
                {hud.zone.outside ? COPY.zone.outside : hud.zone.label}
                {hud.zone.seconds > 0 && (
                  <span className="ml-2 font-display text-gold">{hud.zone.seconds}s</span>
                )}
              </span>
            </div>
          </div>

          {/* The sniper's scope: in first person a round lens with a reticle and black all round;
              from above a lighter ring round the far spot you are looking at. */}
          {hud.scoped && (
            <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
              <div
                className="absolute inset-0"
                style={{
                  background: hud.firstPerson || hud.shoulder
                    ? 'radial-gradient(circle at 50% 50%, transparent 0, transparent min(38vh, 38vw), rgba(0,0,0,0.92) calc(min(38vh, 38vw) + 3px), #000 calc(min(38vh, 38vw) + 40px))'
                    : 'radial-gradient(circle at 50% 50%, transparent 0, transparent 30%, rgba(5,8,16,0.55) 62%)',
                }}
              />
              <div className="absolute left-1/2 top-1/2 h-px w-[min(76vh,76vw)] -translate-x-1/2 bg-black/80" />
              <div className="absolute left-1/2 top-1/2 h-[min(76vh,76vw)] w-px -translate-y-1/2 bg-black/80" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3d3d]" />
              <div className="absolute left-1/2 top-1/2 h-[min(76vh,76vw)] w-[min(76vh,76vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/70" />
            </div>
          )}

          {/* First person: a crosshair, and how to take the mouse. */}
          {(hud.firstPerson || hud.shoulder) && !over && !hud.scoped && (
            <>
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" />
              </div>
              {!hud.mouseLocked && !touch && (
                <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
                  <span className="panel-cut bg-ink-deep/85 px-4 py-2 text-sm text-cream">Click to look around with the mouse · Esc lets it go</span>
                </div>
              )}
            </>
          )}

          {/* You took someone out: a big centred banner for a moment, and the kill sound. */}
          {hud.elim && !over && (
            <div
              className="pointer-events-none absolute inset-x-0 top-[13%] z-[5] flex justify-center px-4"
              role="status"
              aria-live="polite"
            >
              <div
                key={hud.elim.id}
                className={`flex flex-col items-center gap-1.5 text-center ${settings.reducedMotion ? 'animate-[elimFade_1.4s_ease-out_forwards]' : 'animate-[elimIn_1.4s_ease-out_forwards]'} motion-reduce:animate-none`}
                style={{ zoom: hudZoom }}
              >
                <div className="panel-cut flex items-baseline gap-3 bg-ink-deep/80 px-5 py-2 font-display text-2xl leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)] sm:px-6 sm:py-2.5 sm:text-4xl">
                  <span style={{ color: killColor }}>ELIMINATED</span>
                  <span className="text-cream">{hud.elim.name}</span>
                </div>
                <div className="rounded bg-ink-deep/70 px-3 py-0.5 text-sm font-bold tracking-widest text-cream/90 sm:text-base">
                  <span className="font-display text-gold">{hud.elim.left}</span> LEFT
                </div>
              </div>
            </div>
          )}

          {/* You went down: who took you out and with what, before the round report comes up. */}
          {hud.dead && !hud.won && !showResult && (
            <div
              className="pointer-events-none absolute inset-0 z-[5] flex items-start justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.15)_30%,rgba(10,13,24,0.7))] px-4 pt-[11vh] animate-[fadeIn_0.3s_ease-out]"
              role="status"
              aria-live="assertive"
            >
              {!settings.reducedMotion && (
                <>
                  <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 160px 50px ${killColor}`, animation: 'lcsFlash 0.7s ease-out both' }} />
                  <Streaks color={killColor} count={5} seed={3} />
                </>
              )}
              <div className="relative flex flex-col items-center gap-2 text-center animate-[riseIn_0.35s_ease-out_both]" style={{ zoom: hudZoom }}>
                <div
                  className={`font-display text-4xl leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] sm:text-6xl ${settings.reducedMotion ? '' : 'lcs-glitch-in'}`}
                  style={{ color: killColor }}
                >
                  {COPY.result.lost}
                </div>
                <div className="panel-cut bg-ink-deep/85 px-5 py-2 text-lg text-cream sm:text-2xl">
                  {hud.killedBy ? (
                    <>
                      by{' '}
                      <b className="font-display" style={{ color: hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff' }}>
                        {hud.killedBy}
                      </b>{' '}
                      with {hud.killedWith}
                    </>
                  ) : (
                    <>Caught outside by {hud.killedWith ?? COPY.zone.name}</>
                  )}
                </div>
                <div className="text-sm font-bold tracking-widest text-cream/75">
                  <span className="font-display text-gold">#{hud.placement}</span> OF {hud.total}
                </div>
              </div>
            </div>
          )}

          {/* Online: how the line is doing. */}
          {hud.net && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[158px] sm:top-12' : 'top-12'}`}
            >
              <span className="rounded bg-ink-deep/70 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-cream/60">
                {hud.host
                  ? `HOST · ${hud.net.total ? `${hud.net.direct}/${hud.net.total} DIRECT` : 'SOLO'}${hud.net.total ? ` · ${hud.net.rtt} MS` : ''}`
                  : `${hud.net.direct ? 'DIRECT' : 'VIA SERVER'} · ${hud.net.rtt} MS`}
              </span>
            </div>
          )}

          {/* Kill feed */}
          <div
            className={`pointer-events-none absolute flex flex-col items-end gap-1 text-xs ${touch ? 'right-2 top-[176px] sm:top-[min(140px,32vh,33vw)]' : 'right-4 top-[52px]'}`}
          >
            {hud.feed.map((k) => (
              <span key={k.id} className="rounded bg-ink-deep/80 px-2 py-0.5 text-cream/80">
                {k.text}
              </span>
            ))}
          </div>

          {/* Prompt */}
          {hud.prompt && !over && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'bottom-[150px] sm:bottom-6' : 'bottom-24'}`}
            >
              <span
                className="panel-cut bg-ink-deep/85 px-4 py-1.5 text-sm text-cream"
                style={{ zoom: hudZoom, ...(hud.promptGrade !== null && hud.promptGrade > 0 ? { color: GRADE_CSS[hud.promptGrade], boxShadow: `inset 3px 0 0 ${GRADE_CSS[hud.promptGrade]}` } : {}) }}
              >
                {hud.prompt}
              </span>
            </div>
          )}

          {/* A heal in progress: what, and how far along. */}
          {hud.using && !over && (
            <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'bottom-[190px] sm:bottom-16' : 'bottom-36'}`}>
              <div className="flex w-52 flex-col items-center gap-1" style={{ zoom: hudZoom }}>
                <span className="text-xs font-bold tracking-wider text-green">{hud.using.name}</span>
                <span className="panel-cut h-2 w-full overflow-hidden bg-ink-deep/80">
                  <span className="block h-full bg-green" style={{ width: `${Math.min(1, hud.using.progress) * 100}%` }} />
                </span>
              </div>
            </div>
          )}

          {settings.showFps && (
            <div className={`pointer-events-none absolute z-[6] rounded bg-ink-deep/75 px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${hud.fps < 40 ? 'text-orange' : 'text-green'} ${touch ? 'bottom-2 left-1/2 -translate-x-1/2' : 'left-1/2 top-12 -translate-x-1/2'}`}>
              {hud.fps} FPS · {hud.tier.toUpperCase()}
            </div>
          )}

          {touch && !over && !menuOpen && (
            <TouchControls
              size={settings.touchSize}
              opacity={settings.touchOpacity}
              leftHanded={settings.leftHanded}
              press={(b, on) => gameRef.current?.press(b, on)}
              onMove={(x, y) => gameRef.current?.setStick(x, y)}
              onPause={() => setMenuOpen(true)}
              onPlane={hud.stage === 'drone'}
              inAir={hud.stage === 'falling'}
              superReady={hud.superCharge}
              rollReady={Math.min(1, hud.roll)}
              sniper={hud.sniper}
              canSwap={hud.slots.every((sl) => sl.name !== null)}
              swapLabel={hud.slots.find((sl) => !sl.active)?.name ?? null}
              heal={hud.healNext}
            />
          )}

          {/* Controls */}
          {!touch && (
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(50vw-13rem)] flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.up)} />
                <Key k={keyLabel(settings.keys.left)} />
                <Key k={keyLabel(settings.keys.down)} />
                <Key k={keyLabel(settings.keys.right)} /> move
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.fire)} /> shoot / jump
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.leanL)} />
                <Key k={keyLabel(settings.keys.leanR)} /> lean
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.super)} /> super
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.use)} /> pick up / use
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.reload)} /> reload
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.slot1)} />
                <Key k={keyLabel(settings.keys.slot2)} />
                <Key k={keyLabel(settings.keys.swap)} /> / wheel · guns
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.heal)} /> heal
                <Key k={keyLabel(settings.keys.coffee)} /> {COPY.items.coffee.toLowerCase()}
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.roll)} /> roll
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.scope)} /> / right click · scope
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.aim)} /> {hud.aimMode === 'mouse' ? 'mouse aim' : 'auto-aim'}
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.mute)} /> mute
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.pause)} /> / <Key k="Esc" />
                <Key k="Esc" /> menu
              </span>
            </div>
          )}

          {/* Esc Esc menu */}
          {menuOpen && !over && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-deep/70">
              <div
                role="dialog"
                aria-label="Paused"
                className="panel-cut flex max-h-[94vh] w-[22rem] max-w-[94vw] flex-col items-center gap-4 overflow-y-auto bg-ink p-6 text-center sm:p-7"
              >
                <div className="font-display text-4xl text-gold">{online ? 'Menu' : 'Paused'}</div>
                {online && (
                  <p className="text-xs text-cream/60">
                    Online the round keeps going while this menu is open.
                  </p>
                )}
                <button
                  type="button"
                  autoFocus
                  onClick={() => setMenuOpen(false)}
                  className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider text-cream hover:bg-cream/20"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="panel-cut w-full bg-orange/90 px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  {online && hud.host ? 'End the round for everyone' : exitLabel === 'Back to lobby' ? 'Leave match' : 'Quit to menu'}
                </button>
                {!touch && <p className="text-[10px] text-cream/40">Esc or {keyLabel(settings.keys.pause)} to resume</p>}
                {Support && <Support />}
                {credit && <p className="text-[10px] tracking-widest text-cream/40">A game by {credit}</p>}
              </div>
            </div>
          )}

          {menuOpen && settingsOpen && (
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              onClose={() => setSettingsOpen(false)}
              touch={touch}
              tier={hud.tier}
              portalMuted={platform.muted()}
              aim={{ value: hud.aimMode, onChange: (m) => gameRef.current?.setAimMode(m) }}
            />
          )}

          {/* Result: after the fall (or the win) settles, a full-screen round report. */}
          {showResult && (
            <Result
              hud={hud}
              onPlayAgain={onPlayAgain}
              onExit={onExit}
              online={online}
              Support={Support}
              exitLabel={exitLabel}
              fx={!settings.reducedMotion}
            />
          )}
        </>
      )}
    </main>
  );
};
