'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ComponentType } from 'react';

import { COPY } from '~/game/copy/studio';
import { GRADE_CSS, startMatch } from '~/game/render/game';
import { FIGHTERS } from '~/game/sim/constants';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { useBreaks } from '~/components/useBreaks';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { SettingsPanel } from '~/components/SettingsPanel';
import { useSettings } from '~/components/useSettings';
import { createWebPlatform } from '~/platform/web';
import { TouchControls, useTouch } from '~/components/TouchControls';
import type { Session } from '~/game/net/session';
import type { HudState } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';

const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="panel-cut h-3 w-44 bg-ink-deep/80 sm:w-64">
    <div
      className="h-full transition-[width] duration-150"
      style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }}
    />
  </div>
);

const ROMAN = ['', 'I', 'II', 'III'];
const Chip = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <span className="rounded-sm bg-ink-deep/70 px-1.5 py-px text-cream/85" style={color ? { color, boxShadow: `inset 2px 0 0 ${color}` } : undefined}>
    {children}
  </span>
);

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

/** Seconds the "who took you out" card shows before the round report. */
const DEATH_CARD = 2.2;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
  busy,
}: {
  hud: HudState;
  onPlayAgain: () => void;
  onExit: () => void;
  online: boolean;
  Support?: ComponentType;
  exitLabel: string;
  /** A midgame ad is playing: the buttons wait. */
  busy: boolean;
}) => {
  // The host's browser runs the round: it must stay until the round is over.
  const hostWaits = online && hud.host && hud.phase !== 'over';
  const stats: [string, string][] = [
    ['Kills', String(hud.kills)],
    ['Damage dealt', String(hud.damage)],
    ['Accuracy', `${hud.accuracy}%`],
    ['Survived', fmtTime(hud.survived)],
    ['Distance', `${hud.distance} m`],
  ];
  const killerColor = hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff';
  return (
    <div className="absolute inset-0 z-30 flex animate-[fadeIn_0.6s_ease-out] items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.72),rgba(10,13,24,0.95))] px-6 py-4 backdrop-blur-sm">
      <div className="flex w-full max-w-4xl flex-col gap-8 [@media(max-height:520px)]:gap-3">
        <div className="flex flex-wrap items-end gap-8 [@media(max-height:520px)]:gap-4">
          <div className="flex items-baseline font-display leading-none">
            <span
              className={`text-[7rem] sm:text-[11rem] [@media(max-height:520px)]:text-[5.5rem] ${hud.won ? 'text-gold' : 'text-cream'}`}
            >
              #{hud.won ? 1 : hud.placement}
            </span>
            <span className="text-4xl text-cream/40">/{hud.total}</span>
          </div>
          <div className="flex flex-col gap-2 pb-6 [@media(max-height:520px)]:pb-2">
            <span
              className={`text-base font-bold ${hud.won ? 'text-green' : 'text-orange'}`}
            >
              {hud.won ? 'Round won' : 'Eliminated'}
            </span>
            <h2 className="font-display text-3xl leading-none sm:text-5xl [@media(max-height:520px)]:text-3xl">
              {hud.won ? COPY.result.won : COPY.result.lost}
            </h2>
            <p className="text-lg text-cream/80">
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 [@media(max-height:520px)]:grid-cols-5 [@media(max-height:520px)]:gap-2">
          {stats.map(([label, value], i) => (
            <div
              key={label}
              className="panel-cut flex animate-[riseIn_0.5s_ease-out_both] flex-col gap-1 bg-ink/90 p-4 [@media(max-height:520px)]:p-2.5"
              style={{ animationDelay: `${0.25 + i * 0.08}s` }}
            >
              <span className="font-display text-3xl text-cream [@media(max-height:520px)]:text-2xl">
                {value}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-cream/55">
                {label}
              </span>
            </div>
          ))}
        </div>

        {hostWaits && (
          <p className="text-sm text-cream/70">
            You are the host: the round runs on your device, so it goes on for the others until
            there is a winner. {hud.alive} still standing.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            disabled={hostWaits || busy}
            onClick={onPlayAgain}
            className="panel-cut flex items-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase disabled:opacity-40 [@media(max-height:520px)]:py-3 text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.3)] hover:brightness-110"
          >
            {online ? 'Back to the room →' : 'Play again →'}
          </button>
          {!online && (
            <button
              type="button"
              disabled={busy}
              onClick={onExit}
              className="panel-cut bg-cream/10 px-8 py-4 font-bold uppercase tracking-wider text-cream/90 hover:bg-cream/20 disabled:opacity-40 [@media(max-height:520px)]:py-3"
            >
              {exitLabel}
            </button>
          )}
        </div>
        {Support && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-cream/60">
            Enjoyed it? <Support />
          </p>
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
  support?: ComponentType;
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

  const breaks = useBreaks(platform, game, {
    loaded: !!hud && !held,
    playing: !!hud && !held && !menuOpen && !showResult && hud.phase !== 'over',
    roundOver: showResult,
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
      {!held && hud && <div className="pointer-events-none absolute inset-0 z-[60] bg-black [animation:fadeOut_0.8s_ease-out_forwards]" />}
      {!hud && !held && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-ink-deep"
          role="status"
          aria-live="polite"
        >
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cream/15 border-t-gold" />
          <div className="font-display text-2xl text-gold">Loading the map</div>
          <p className="text-sm text-cream/60">Boarding the plane with nine others…</p>
        </div>
      )}
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
          {/* You */}
          <div
            className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1.5"
            style={{ ...(touch ? { marginLeft: 'env(safe-area-inset-left)' } : {}), zoom: hudZoom }}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg" style={{ color: f.color }}>
                {f.name}
              </span>
              {hud.reloading !== null && (
                <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-gold">
                  RELOADING
                  <span className="h-1 w-12 overflow-hidden rounded bg-cream/15">
                    <span
                      className="block h-full bg-gold"
                      style={{ width: `${hud.reloading * 100}%` }}
                    />
                  </span>
                </span>
              )}
            </div>
            {/* Two gun slots: the one in your hands lit, its grade as the colour of the edge. */}
            <div className="flex gap-1.5">
              {hud.slots.map((sl, i) => (
                <div
                  key={i}
                  className={`flex min-w-[5.5rem] items-baseline gap-1.5 rounded-sm border-l-[3px] px-1.5 py-0.5 sm:min-w-[7.5rem] ${sl.active ? 'bg-ink-deep/85' : 'bg-ink-deep/50 opacity-60'}`}
                  style={{ borderColor: sl.name ? GRADE_CSS[sl.rarity] : 'rgba(232,238,247,0.2)' }}
                >
                  {!touch && <span className="text-[10px] font-bold text-cream/50">{keyLabel(i === 0 ? settings.keys.slot1 : settings.keys.slot2)}</span>}
                  <span className="text-xs font-semibold" style={{ color: sl.name ? (sl.rarity > 0 ? GRADE_CSS[sl.rarity] : '#e8eef7') : 'rgba(232,238,247,0.4)' }}>
                    {sl.name ?? 'empty'}
                  </span>
                  {sl.name && (
                    <span className={`font-display text-sm ${sl.mag === 0 ? 'text-orange' : 'text-cream'}`}>
                      {sl.mag}
                      <span className="text-cream/50">/{sl.ammo}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Bar
              value={hud.hp}
              max={hud.maxHp}
              color={hud.hp / hud.maxHp > 0.35 ? (settings.colorBlind ? '#3ec5ff' : '#3ddc84') : settings.colorBlind ? '#ff9f1c' : '#ff3d6e'}
            />
            {hud.armor > 0 && <Bar value={hud.armor} max={hud.vestMax} color="#3ec5ff" />}
            {/* What you carry: vest and backpack grades, heals and bombs out of what the backpack holds, coffee left. */}
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold">
              {hud.vest > 0 && <Chip color={GRADE_CSS[hud.vest - 1]}>Vest {ROMAN[hud.vest]}</Chip>}
              {hud.pack > 0 && <Chip color={GRADE_CSS[hud.pack - 1]}>Pack {ROMAN[hud.pack]}</Chip>}
              {hud.bag.bandages > 0 && <Chip>{COPY.items.bandage} {hud.bag.bandages}/{hud.bag.cap.bandage}</Chip>}
              {hud.bag.medkits > 0 && <Chip>{COPY.items.medkit} {hud.bag.medkits}/{hud.bag.cap.medkit}</Chip>}
              {hud.bag.coffees > 0 && <Chip>{COPY.items.coffee} {hud.bag.coffees}</Chip>}
              {hud.bag.bombs > 0 && <Chip>Bomb {hud.bag.bombs}</Chip>}
              {hud.buzz > 0 && <Chip color="#ffd23f">{COPY.items.coffee} {Math.ceil(hud.buzz)}s</Chip>}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">
                {touch ? 'Super' : keyLabel(settings.keys.super)} · {hud.superName}
              </span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div
                  className="h-full"
                  style={{
                    width: `${hud.superCharge * 100}%`,
                    background: hud.superCharge >= 1 ? '#ffd23f' : '#8b93ad',
                  }}
                />
              </div>
              {hud.superCharge >= 1 && <span className="font-bold text-gold">ready</span>}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cream/60">{touch ? 'Roll' : `${keyLabel(settings.keys.roll)} · Roll`}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded bg-cream/15">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(1, hud.roll) * 100}%`,
                    background: hud.roll >= 1 ? '#3ec5ff' : '#8b93ad',
                  }}
                />
              </div>
            </div>
          </div>

          {/* The first seconds on the plane: what this game is about. */}
          {hud.stage === 'drone' && hud.phase === 'drop' && hud.planeTime < 3.2 && (
            <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.6),rgba(10,13,24,0.1)_70%)] px-6 text-center">
              {COPY.intro.above && (
                <div className="font-mono text-xs tracking-[0.3em] text-green/90 [animation:fadeIn_0.4s_ease-out]">{COPY.intro.above}</div>
              )}
              <div className="font-display text-4xl leading-none text-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] [animation:riseIn_0.5s_ease-out] sm:text-7xl">
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
              <span className="font-display text-xl text-cream">{hud.alive}</span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">LEFT</span>
              <span className="h-4 w-px bg-cream/20" />
              {/* Your kills; the number jumps each time it goes up. */}
              <span
                key={hud.kills}
                className={`inline-block font-display text-xl text-cream ${hud.kills > 0 && !settings.reducedMotion ? 'animate-[killPulse_0.5s_ease-out] motion-reduce:animate-none' : ''}`}
              >
                {hud.kills}
              </span>
              <span className="text-[10px] font-semibold tracking-widest text-cream/50">{hud.kills === 1 ? 'KILL' : 'KILLS'}</span>
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
              <div className="flex flex-col items-center gap-2 text-center animate-[riseIn_0.35s_ease-out_both]" style={{ zoom: hudZoom }}>
                <div className="font-display text-4xl leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] sm:text-6xl" style={{ color: killColor }}>
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
            className={`pointer-events-none absolute flex flex-col items-end gap-1 text-xs ${touch ? 'right-2 top-[176px] sm:top-[min(140px,32vh,33vw)]' : 'right-4 top-3'}`}
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
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
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
              onPlayAgain={() => void breaks.next(onPlayAgain)}
              onExit={() => void breaks.next(onExit)}
              online={online}
              Support={Support}
              exitLabel={exitLabel}
              busy={breaks.inBreak}
            />
          )}
        </>
      )}
    </main>
  );
};
