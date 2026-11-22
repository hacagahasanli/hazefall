'use client';

/**
 * The lobby before a round: Play leads here, not straight into the match. Behind the UI the squad waits on the airstrip
 * by the idling cargo plane (render/staging). You pick your fighter while the lobby fills with the other nineteen; nothing
 * starts until you press Ready. Then the fighter is locked, the match starts loading underneath (held, see Match `held`),
 * and a "match starting" strip counts down at the bottom. The last seconds are the launch: the camera cranes over the
 * squad to the battleground, the engines spool up, a big 3-2-1, a fade to black, and the plane scene comes straight up
 * out of the black, already loaded. If the device is still building the map, the strip says so and waits. Esc goes back
 * to the menu. After a round, Play again skips the Ready press: the lobby is full and the countdown already running.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePortraits } from '~/components/FighterSelect';
import { ShockRing, Streaks } from '~/components/Transitions';
import { setUiSound, startHum, uiImpact, uiTick } from '~/components/uiSound';
import { COPY } from '~/game/copy/studio';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { FIGHTERS, PLAYERS } from '~/game/sim/constants';
import { previewed, StyleRow } from '~/components/StyleRow';
import { xpToNext } from '~/game/progress';
import { loadCount, onLoadCount } from '~/lib/loading';

import type { StylePreview } from '~/components/StyleRow';
import type { Career } from '~/game/career';
import type { Look } from '~/game/cosmetics';
import type { Staging } from '~/game/render/staging';
import type { Settings } from '~/game/settings';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';

const IDS = Object.keys(FIGHTERS) as FighterId[];
/** The launch: camera move, 3-2-1 and the fade all live in this window. */
const LAUNCH = 3.2;
const FADE = 0.45;

/** The career level in the lobby's plate style: "Level 7", the XP into the next level and a thin gold bar. */
const LevelPlate = ({ career }: { career: Career }) => {
  const need = xpToNext(career.level);
  return (
    <div className="panel-cut flex w-40 flex-col gap-1 bg-ink-deep/70 px-3 py-2 backdrop-blur" aria-label={`Level ${career.level}, ${career.xp} of ${need} XP`}>
      <span className="flex items-baseline justify-between gap-2 text-sm font-semibold text-cream">
        <span>Level {career.level}</span>
        <span className="text-xs font-normal tabular-nums text-cream/65">{career.xp}/{need} XP</span>
      </span>
      <div className="h-1.5 overflow-hidden bg-cream/10">
        <div className="h-full bg-gold" style={{ width: `${Math.min(100, Math.round((career.xp / need) * 100))}%` }} />
      </div>
    </div>
  );
};

export const PreMatch = ({
  platform,
  settings,
  fighter,
  onFighter,
  onReady,
  loaded,
  onLaunch,
  onBack,
  quick = false,
  touch,
  career,
  onLook,
  onSeen,
}: {
  platform: Platform;
  settings: Settings;
  fighter: FighterId;
  onFighter: (id: FighterId) => void;
  /** Ready pressed: the fighter is locked, start loading the match. */
  onReady: () => void;
  /** The match underneath has loaded and may be launched into. */
  loaded: boolean;
  onLaunch: () => void;
  onBack: () => void;
  /** Play again: a shorter wait, the lobby already full. */
  quick?: boolean;
  touch: boolean;
  /** What the game remembers: what is unlocked and worn (the portal build). */
  career?: Career;
  /** A different look was picked in the Style row. */
  onLook?: (look: Look) => void;
  /** The player opened a category: these ids are no longer new. */
  onSeen?: (ids: string[]) => void;
}) => {
  /** Seconds from Ready to the match. A rematch is ready the moment the lobby is up, so its countdown is the launch plus a breath. */
  const count = quick ? LAUNCH + 0.8 : 9;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staging = useRef<Staging | null>(null);
  // A locked outfit or finish being looked at in the Style tray: shown on the fighter, never worn.
  const [preview, setPreview] = useState<StylePreview>(null);
  const trayOpen = useRef(false);
  const shownLook = useRef<Look | undefined>(undefined);
  shownLook.current = career ? previewed(career.look, fighter, preview) : undefined;
  const [live, setLive] = useState(false);
  const [t, setT] = useState(0);
  const end = useRef(Infinity);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [readied, setReadied] = useState(false);
  const [readyAt, setReadyAt] = useState(0);
  const portraits = usePortraits();
  const f = FIGHTERS[fighter];
  const tier = resolveTier(settings.quality, deviceFacts(platform.deviceType()));
  const hum = useRef<ReturnType<typeof startHum> | null>(null);
  const launched = useRef(false);
  const launchRef = useRef(onLaunch);
  const mountedAt = useRef(performance.now());
  launchRef.current = onLaunch;
  const done = useRef(false);

  useEffect(() => setUiSound(settings.master, settings.muted || platform.muted()), [settings.master, settings.muted, platform]);

  // The staging scene, once; fighter changes swap the squad in place.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void import('~/game/render/staging').then(({ startStaging }) => {
      if (cancelled) return;
      staging.current = startStaging(canvas, fighter, () => setLive(true), { tier, still: settings.reducedMotion, look: shownLook.current });
    });
    return () => {
      cancelled = true;
      staging.current?.dispose();
      staging.current = null;
    };
    // The scene is built once per visit; the fighter is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, settings.reducedMotion]);
  useEffect(() => staging.current?.setFighter(fighter), [fighter]);
  // What the fighter on the airstrip wears: the look worn, or the locked one being previewed.
  const lookKey = shownLook.current ? JSON.stringify(shownLook.current) : '';
  useEffect(() => {
    if (shownLook.current) staging.current?.setLook(shownLook.current);
  }, [lookKey, live]);

  useEffect(() => {
    hum.current = startHum();
    return () => hum.current?.stop();
  }, []);

  // The clock: rAF-driven so the countdown and the camera move stay in step. It starts once the scene is on screen, so
  // a slow device building the airstrip never eats the countdown.
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const start = performance.now();
    let lastWhole = 99;
    const tick = (now: number) => {
      const s = (now - start) / 1000;
      setT(s);
      // Not loaded yet as the launch nears: the strip waits ("Joining") rather than cutting to a loading screen.
      if (!loadedRef.current && end.current - s < LAUNCH + 0.6) end.current = s + LAUNCH + 0.6;
      const left = end.current - s;
      if (left <= LAUNCH && !launched.current) {
        launched.current = true;
        staging.current?.launch(LAUNCH - FADE + 0.2);
        hum.current?.rev();
      }
      const whole = Number.isFinite(left) ? Math.ceil(left) : 99;
      // 3, 2, 1 land as hits that climb; the drop itself hits hardest.
      if (whole !== lastWhole && whole >= 1 && whole <= 3) uiImpact(0.25 + (3 - whole) * 0.25);
      if (whole !== lastWhole && whole === 0) uiImpact(1);
      lastWhole = whole;
      if (left <= 0 && !done.current) {
        done.current = true;
        hum.current?.stop();
        launchRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  // The real loading of the match behind the lobby: model files asked for and arrived since Ready.
  const [models, setModels] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (!readied) return;
    const base = loadCount();
    return onLoadCount((c) => setModels({ done: c.done - base.done, total: c.total - base.total }));
  }, [readied]);

  const ready = useCallback(() => {
    if (readied || !live) return;
    uiTick(true);
    uiImpact(0.15);
    setReadied(true);
    setReadyAt(t);
    end.current = t + count;
    onReadyRef.current();
  }, [readied, live, t, count]);

  // Play again: no Ready press, the countdown is already running.
  useEffect(() => {
    if (quick && live && !readied) ready();
  }, [quick, live, readied, ready]);

  const left = Math.max(0, end.current - t);
  const launching = left <= LAUNCH;
  const pick = useCallback(
    (id: FighterId) => {
      // Ready locks your fighter: the match is already being built with it.
      if (readied || id === fighter) return;
      uiTick(false);
      onFighter(id);
    },
    [readied, fighter, onFighter],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The key that pressed Play (or a held one) must not also ready up on arrival.
      if (e.repeat || performance.now() - mountedAt.current < 600) return;
      // Keys on the Style row belong to the row (Space presses a slot, Esc closes its tray).
      if ((e.target as HTMLElement | null)?.closest?.('[data-style]')) return;
      if (e.code === 'Escape' && trayOpen.current) return;
      if (e.code === 'Escape' && !launching) {
        e.preventDefault();
        uiTick(true);
        onBack();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        ready();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
        const i = IDS.indexOf(fighter);
        const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1;
        pick(IDS[(i + dir + IDS.length) % IDS.length]);
      } else if (/^Digit[1-4]$/.test(e.code)) pick(IDS[Number(e.code.slice(5)) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, pick, onBack, fighter, launching]);

  // The lobby: you first, then the other nineteen joining over the first three seconds (already there on Play again).
  const names = COPY.botNames.slice(0, PLAYERS - 1);
  const joinEvery = quick ? 0 : 2.9 / names.length;
  const joined = quick ? names.length : Math.min(names.length, Math.floor(Math.max(0, t - 0.6) / joinEvery));
  const full = joined >= names.length;
  const secs = Number.isFinite(left) ? Math.ceil(left - 0.001) : 0;
  const big = launching && secs >= 1 && secs <= 3 ? secs : null;
  const fade = Math.min(1, Math.max(0, (FADE - left) / FADE));
  const status = !full ? 'Players joining' : readied ? 'Ready' : 'Lobby full';
  /** After Ready: 0..1 through the countdown, for the strip. */
  const progress = readied ? Math.min(1, (t - readyAt) / Math.max(0.1, end.current - readyAt)) : 0;
  const joining = readied && !loaded && left <= LAUNCH + 0.7;
  /** How much of the match is loaded (real: model files in), for the strip while it waits. */
  // Never back: more files asked for later must not shrink the bar (the count's total grows as the map asks for them).
  const mapPeak = useRef(0);
  mapPeak.current = Math.max(mapPeak.current, loaded ? 1 : models && models.total > 0 ? 0.15 + (0.8 * models.done) / models.total : 0.1);
  const mapShare = mapPeak.current;
  const fx = !settings.reducedMotion;

  return (
    <main className="relative h-[100dvh] w-screen select-none overflow-hidden bg-ink-deep text-cream">
      <canvas ref={canvasRef} aria-hidden className={`fixed inset-0 h-full w-full transition-opacity duration-300 ${live ? 'opacity-100' : 'opacity-0'}`} />
      {/* Letterbox bars slide in for the launch: the cinema cue that the match is about to start. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 bg-black transition-[height] duration-700 ease-out" style={{ height: launching ? '9vh' : 0 }} />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 bg-black transition-[height] duration-700 ease-out" style={{ height: launching ? '9vh' : 0 }} />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(270deg,rgba(10,13,24,0.88)_0%,rgba(10,13,24,0.55)_24%,rgba(10,13,24,0)_46%)] max-sm:bg-[linear-gradient(0deg,rgba(10,13,24,0.95)_0%,rgba(10,13,24,0.6)_40%,rgba(10,13,24,0)_65%)]" />
      <div className="pointer-events-none fixed inset-0 shadow-[inset_0_0_200px_rgba(0,0,0,0.6)]" />

      {/* One column owns the top bar and the identity stack, so the stack can only grow into the space the bar leaves (it used to be two fixed islands that met on short screens). */}
      <div className="pointer-events-none fixed inset-0 flex flex-col">
      {/* Top: the status and the clock. */}
      <header
        className={`pointer-events-auto flex shrink-0 items-start justify-between gap-4 px-5 pt-4 transition-opacity duration-500 sm:px-8 sm:pt-6 [@media(max-height:500px)]:pt-2 ${launching ? 'opacity-0' : 'opacity-100'}`}
        style={{ paddingLeft: 'max(1.25rem, env(safe-area-inset-left))', paddingRight: 'max(1.25rem, env(safe-area-inset-right))' }}
      >
        <div className="flex flex-col items-start gap-2 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-center">
          <button
            type="button"
            onClick={() => {
              uiTick(true);
              onBack();
            }}
            className={`panel-cut bg-ink-deep/70 px-4 py-2 text-sm font-semibold text-cream/80 backdrop-blur hover:text-cream focus-visible:outline-2 focus-visible:outline-green ${touch ? 'min-h-11' : ''}`}
          >
            ← Menu{!touch && <span className="ml-2 text-cream/45">Esc</span>}
          </button>
          {career && <LevelPlate career={career} />}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right" aria-live="polite">
          <span className="text-sm font-semibold text-cream/70">{status}</span>
          <span className="font-display text-2xl leading-none tabular-nums text-gold drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)] sm:text-3xl">
            {joined + 1}/{PLAYERS}
          </span>
        </div>
      </header>

      {/* Left (bottom on phones): who you are. */}
      <section
        className={`pointer-events-auto mt-auto flex max-w-[min(560px,58vw)] min-h-0 flex-col gap-3 px-5 pb-6 transition-all duration-500 sm:px-8 sm:pb-9 max-sm:max-w-none [@media(max-height:640px)]:sm:gap-2 [@media(max-height:640px)]:sm:pb-5 [@media(max-height:500px)]:gap-1.5 [@media(max-height:500px)]:pb-3 [@media(max-height:500px)]:sm:pb-3 ${launching ? 'translate-y-6 opacity-0' : 'opacity-100'}`}
        style={{ paddingLeft: 'max(1.25rem, env(safe-area-inset-left))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <span className="text-sm font-semibold text-cream/70 [@media(max-height:640px)]:hidden">You drop as</span>
        <h1
          key={fighter}
          className="font-display text-5xl leading-[0.9] drop-shadow-[0_4px_20px_rgba(0,0,0,0.7)] [animation:riseIn_0.35s_ease-out] sm:text-7xl [@media(max-height:500px)]:text-4xl [@media(max-height:420px)]:text-3xl"
          style={{ color: f.color }}
        >
          {f.name.toUpperCase()}
        </h1>
        <p className="max-w-md text-sm text-cream/85 sm:text-base [@media(max-height:500px)]:hidden">
          {f.role} · <kbd className="mx-0.5 inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/40 bg-cream/10 px-1 text-xs font-bold leading-5 text-cream">{touch ? 'SUPER' : keyLabel(settings.keys.super)}</kbd> <b className="text-gold">{f.superName}</b>: {f.superText}
        </p>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Fighter">
          {IDS.map((id, i) => {
            const on = id === fighter;
            const c = FIGHTERS[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c.name}
                onClick={() => pick(id)}
                disabled={readied && !on}
                className={`panel-cut relative h-20 w-16 overflow-hidden border-2 bg-ink/80 transition sm:h-24 sm:w-20 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-14 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-11 ${on ? '-translate-y-1' : readied ? 'opacity-25' : 'opacity-75 hover:opacity-100'}`}
                style={{ borderColor: on ? c.color : 'rgba(230,235,245,0.12)' }}
              >
                <span className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 50% 80%, ${c.color}, transparent 70%)` }} />
                {portraits && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portraits[id]} alt="" className="absolute inset-x-0 bottom-0 h-full w-full object-cover object-top" />
                )}
                {!touch && <span className="absolute left-1 top-0.5 text-[10px] font-bold text-cream/70">{i + 1}</span>}
              </button>
            );
          })}
        </div>
        {career && onLook && (
          <StyleRow
            career={career}
            fighter={fighter}
            disabled={readied}
            onLook={onLook}
            onSeen={(ids) => onSeen?.(ids)}
            onPreview={setPreview}
            onOpen={(o) => {
              trayOpen.current = o;
            }}
          />
        )}
        <button
          type="button"
          onClick={ready}
          disabled={readied || !live}
          className={`panel-cut relative mt-2 w-fit px-8 py-3 font-display text-xl uppercase transition [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream sm:text-2xl ${readied ? 'bg-cream/15 text-cream/70' : 'bg-green text-ink-deep hover:brightness-110'} ${!readied && live && !settings.reducedMotion ? '[animation:readyPulse_1.6s_ease-in-out_infinite]' : ''}`}
        >
          {readied ? <span className={fx ? 'lcs-glitch-in inline-block' : ''}>Ready ✓</span> : 'Ready'}
          {!touch && !readied && settings.showKeyHints && <span className="ml-3 text-sm opacity-70">Space</span>}
        </button>
        {!readied && live && full && <span className="text-xs text-cream/60 [@media(max-height:640px)]:hidden">The match starts when you are ready.</span>}
      </section>
      </div>

      {/* Right: the lobby filling (hidden on short phones, where the clock already says it). */}
      <aside
        className={`fixed right-0 top-1/2 flex w-[min(340px,34vw)] -translate-y-1/2 flex-col gap-2 pr-5 transition-all duration-500 sm:pr-8 [@media(min-height:501px)_and_(max-height:640px)]:top-[5.5rem] [@media(min-height:501px)_and_(max-height:640px)]:translate-y-0 [@media(min-height:501px)_and_(max-height:640px)]:gap-1 max-sm:hidden [@media(max-height:500px)]:hidden ${launching ? 'translate-x-8 opacity-0' : 'opacity-100'}`}
        style={{ paddingRight: 'max(1.25rem, env(safe-area-inset-right))' }}
        aria-label="Players in this match"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">Match lobby</h2>
          <span className="font-display text-lg tabular-nums text-gold">{joined + 1}/{PLAYERS}</span>
        </div>
        <div className="h-1 overflow-hidden bg-cream/10">
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${((joined + 1) / PLAYERS) * 100}%` }} />
        </div>
        <ol className="grid grid-cols-2 gap-1 [@media(max-height:640px)]:gap-0.5">
          <li className="panel-cut col-span-2 flex items-center gap-2 bg-ink/80 px-3 py-1.5 text-sm [@media(max-height:640px)]:py-1">
            <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
            <b className="flex-1">You</b>
            <span className={`text-xs ${readied ? 'text-green' : 'text-cream/50'}`}>{readied ? 'ready' : f.name}</span>
          </li>
          {names.map((n, i) => (
            <li
              key={n}
              className={`panel-cut flex min-w-0 items-center gap-2 bg-ink/60 px-2.5 py-1 text-xs transition-all duration-300 [@media(max-height:640px)]:py-0.5 ${i < joined ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green/70" />
              <span className="min-w-0 flex-1 truncate text-cream/85">{n}</span>
            </li>
          ))}
        </ol>
      </aside>

      {/* After Ready: the match-starting strip, bottom centre. */}
      {readied && !launching && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-center px-4 max-sm:bottom-auto max-sm:top-28 [@media(max-height:640px)_and_(min-width:640px)]:justify-end [@media(max-height:640px)_and_(min-width:640px)]:px-6 [@media(max-height:500px)_and_(min-width:640px)]:bottom-3"
          aria-live="polite"
        >
          <div className="panel-cut flex w-[min(420px,92vw)] flex-col gap-2 bg-ink-deep/85 px-5 py-3 backdrop-blur [animation:riseIn_0.35s_ease-out] [@media(max-height:640px)_and_(min-width:640px)]:w-[min(300px,44vw)] [@media(max-height:640px)_and_(min-width:640px)]:gap-1.5 [@media(max-height:640px)_and_(min-width:640px)]:py-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-display text-base uppercase tracking-wide text-cream">{joining ? 'Joining match' : 'Match starting'}</span>
              <span className="font-display text-3xl leading-none tabular-nums text-gold">
                {joining ? '…' : `0:${String(Math.max(0, secs)).padStart(2, '0')}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden bg-cream/10">
              <div
                className={`h-full ${joining ? 'bg-green' : 'bg-gold'}`}
                style={{ width: `${(joining ? mapShare : progress) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-cream/60">
              {PLAYERS}/{PLAYERS} ready · {loaded ? 'map ready' : models && models.total > 0 ? `loading the map · ${models.done}/${models.total} models` : 'building the map'}
            </span>
          </div>
        </div>
      )}

      {/* Ready: a green pulse round the screen's edge, once. */}
      {readied && fx && (
        <div className="pointer-events-none fixed inset-0" style={{ boxShadow: 'inset 0 0 140px 30px rgba(61,220,132,0.55)', animation: 'lcsFlash 0.6s ease-out both' }} />
      )}

      {/* The launch: 3-2-1 slam in with a ring, light streaks and a jolt; then the drop and the fade. */}
      {big !== null && (
        <div
          key={big}
          className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center gap-2"
          style={fx ? { animation: 'lcsShake 0.28s ease-out both' } : undefined}
          aria-live="assertive"
        >
          {fx && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,210,63,0.28),transparent_55%)]" style={{ ['--lcs-flash' as string]: 1, animation: 'lcsFlash 0.5s ease-out both' }} />
              <Streaks color={big === 1 ? '#ffd23f' : '#e6ebf5'} count={big === 1 ? 9 : 5} seed={big} />
              <ShockRing color={big === 1 ? '#ffd23f' : '#3ddc84'} size="min(70vw, 26rem)" />
            </>
          )}
          <span
            className="relative font-display text-[9rem] leading-none text-cream sm:text-[13rem]"
            style={{
              textShadow: '-5px 0 rgba(255,61,110,0.8), 5px 0 rgba(62,197,255,0.8), 0 6px 40px rgba(0,0,0,0.8)',
              animation: fx ? 'lcsSlam 1s cubic-bezier(0.2, 0.8, 0.2, 1) both' : undefined,
              color: big === 1 ? 'var(--color-gold)' : undefined,
            }}
          >
            {big}
          </span>
          <span className="relative text-base font-semibold text-cream/85 drop-shadow sm:text-lg">{COPY.intro.title(PLAYERS).join(' · ')}</span>
        </div>
      )}
      {/* The last half second: a hot white streak across the middle as the screen goes to black. */}
      {fade > 0 && fx && (
        <div className="pointer-events-none fixed inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white shadow-[0_0_40px_10px_rgba(255,210,63,0.8)]" style={{ opacity: 1 - fade * 0.6 }} />
      )}
      <div className="pointer-events-none fixed inset-0 bg-black" style={{ opacity: fade }} />
    </main>
  );
};
