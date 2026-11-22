'use client';

/**
 * The fighter picker, shared by the site's lobby and the portal build: the picked fighter big (portrait, stats, super),
 * the four to choose from, and the three how-to cards. Portraits are rendered from the game's own models after the page
 * has painted (`usePortraits`).
 */
import { useEffect, useRef, useState } from 'react';

import { COPY } from '~/game/copy/studio';
import { FIGHTERS } from '~/game/sim/constants';

import type { Look } from '~/game/cosmetics';
import type { FighterId } from '~/game/sim/types';

export const FIGHTER_IDS: FighterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const IDS = FIGHTER_IDS;
export const PICK_KEY = 'lcs:fighter';

const SPEEDS = IDS.map((id) => FIGHTERS[id].speed);
const COSTS = IDS.map((id) => FIGHTERS[id].superCost);
/** 0..1 within the roster, so the bars compare fighters, never a made-up maximum. */
const rel = (v: number, all: number[], invert = false) => {
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const k = hi === lo ? 1 : (v - lo) / (hi - lo);
  return 0.35 + 0.65 * (invert ? 1 - k : k);
};

const Bar = ({ label, value, text, color }: { label: string; value: number; text: string; color: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-cream/55">
      <span>{label}</span>
      <span className="text-cream/80">{text}</span>
    </div>
    <div className="h-1.5 overflow-hidden bg-cream/10">
      <div className="h-full transition-all duration-500" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  </div>
);

type Portraits = Record<FighterId, string> | null;

/**
 * The fighters' portraits, rendered after the page has painted (null until then, or while `skip`). With a `look` they wear it,
 * and are drawn again when it changes (the Fighter screen's Style tray).
 */
/** The portraits drawn for the default look, kept for the rest of the visit: the menu draws them while it idles, so the lobby
 *  and the Fighter screen show them on their first frame instead of drawing four WebGL pictures after they open. */
let warmed: Portraits = null;
let warming: Promise<void> | null = null;

/** Draws the default-look portraits (and fetches the lobby's scene code) while the page is idle. Safe to call again. */
export const warmLobby = (): Promise<void> => {
  warming ??= new Promise<void>((resolve) => {
    const run = () =>
      void Promise.all([import('~/game/render/showcase'), import('~/game/render/staging')])
        .then(([{ renderPortraits }]) => {
          warmed ??= renderPortraits();
        })
        .catch(() => undefined)
        .finally(resolve);
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(run, { timeout: 1500 });
    else setTimeout(run, 300);
  });
  return warming;
};

/**
 * The fighters' portraits, rendered after the page has painted (null until then, or while `skip`). With a `look` they wear it,
 * and are drawn again when it changes (the Fighter screen's Style tray). The default look is served from the warm cache.
 */
export const usePortraits = (skip = false, look?: Look): Portraits => {
  const [portraits, setPortraits] = useState<Portraits>(warmed);
  const lookKey = look ? JSON.stringify(look.outfit) + look.finish : '';
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    if (skip || (portraits && !lookKey)) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ renderPortraits }) => {
          if (!cancelled) setPortraits(renderPortraits(lookRef.current));
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, lookKey, !portraits]);
  return portraits;
};

/** The fighter you drop as, big. */
/** `tight`: on a short, wide window the Fighter screen trims the hero's spacing (the lobby keeps the roomy one). */
export const FighterCard = ({ fighter, portraits, tight = false }: { fighter: FighterId; portraits: Portraits; tight?: boolean }) => {
  const f = FIGHTERS[fighter];
  return (
      <div className="panel-cut relative flex shrink-0 min-h-[300px] overflow-hidden border border-cream/10 bg-ink/70 backdrop-blur sm:min-h-[380px] [@media(max-height:640px)]:sm:min-h-0">
        <div
          className="absolute inset-0 opacity-50 transition-[background] duration-700"
          style={{
            background: `radial-gradient(circle at 70% 65%, ${f.color}, transparent 60%)`,
          }}
        />
        <div className={`relative z-10 flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6 [@media(max-height:640px)]:sm:gap-2 [@media(max-height:640px)]:sm:p-4 ${tight ? '[@media(max-height:600px)]:sm:gap-1.5 [@media(max-height:600px)]:sm:p-3' : ''} [@media(max-height:420px)]:sm:gap-1! [@media(max-height:420px)]:sm:p-2.5!`}>
          <div className="flex flex-col gap-2 [@media(max-height:600px)]:sm:gap-1">
            <span className={`text-sm font-semibold text-cream/60 ${tight ? '[@media(max-height:420px)]:sm:hidden' : ''}`}>
              You drop as
            </span>
            <h1
              key={fighter}
              className={`font-display text-4xl leading-none [animation:riseIn_0.35s_ease-out] sm:text-6xl ${tight ? '[@media(max-height:600px)]:sm:text-4xl' : ''} [@media(max-height:500px)]:text-3xl`}
              style={{ color: f.color }}
            >
              {f.name.toUpperCase()}
            </h1>
            <span className="text-sm text-cream/70">{f.role}</span>
          </div>
          <div className={`flex max-w-[11rem] flex-col gap-3 ${tight ? '[@media(max-height:600px)]:sm:gap-1.5' : ''} sm:max-w-[15rem] [@media(max-height:500px)]:max-w-[22rem] ${tight ? '[@media(max-height:420px)]:sm:max-w-[26rem]' : ''} [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:gap-3 [@media(max-height:500px)]:[&>*]:flex-1`}>
            <Bar label="Health" value={1} text={`${f.hp}`} color="#3ddc84" />
            <Bar
              label="Speed"
              value={rel(f.speed, SPEEDS)}
              text={`${f.speed} m/s`}
              color="#3ec5ff"
            />
            <Bar
              label="Super charge"
              value={rel(f.superCost, COSTS, true)}
              text={f.superCost <= 140 ? 'fast' : 'slow'}
              color="#ffd23f"
            />
          </div>
          <div className={`panel-cut max-w-xs bg-ink-deep/70 p-3 text-sm ${tight ? '[@media(max-height:600px)]:sm:p-2 [@media(max-height:600px)]:sm:text-xs' : ''} [@media(max-height:500px)]:p-2 [@media(max-height:500px)]:text-xs`}>
            <span className="font-bold text-gold">G · {f.superName}</span>
            <span className="text-cream/80">: {f.superText}</span>
          </div>
        </div>
        {portraits && (
          // A rendered portrait, not a photo: plain <img> is right here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={fighter}
            src={portraits[fighter]}
            alt={`${f.name}, ${f.role}`}
            className="pointer-events-none absolute -right-8 bottom-0 z-0 h-[62%] w-auto sm:h-[92%] [@media(max-height:500px)]:h-[72%] [@media(max-height:500px)]:-right-2 object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)] [animation:riseIn_0.4s_ease-out] sm:right-2"
          />
        )}
      </div>
  );
};

/** Pick one of the four. */
/** `shortGrid`: on a short, wide window the four sit two by two (the Fighter screen puts them beside the hero). */
export const FighterGrid = ({ fighter, portraits, onPick, shortGrid = false }: { fighter: FighterId; portraits: Portraits; onPick: (id: FighterId) => void; shortGrid?: boolean }) => (
  <>
    <div className="flex items-end justify-between">
      <h2 className="font-display text-xl [@media(max-height:500px)]:text-base">
        Pick a fighter
      </h2>
      <span className="text-xs text-cream/50 [@media(max-height:500px)]:hidden">
        Same guns for all: the super is yours
      </span>
    </div>
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${shortGrid ? '[@media(max-height:600px)]:sm:grid-cols-2' : ''}`}
      role="radiogroup"
      aria-label="Fighter"
    >
      {IDS.map((id) => {
        const c = FIGHTERS[id];
        const on = id === fighter;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(id)}
            className={`panel-cut group relative flex h-36 flex-col justify-end overflow-hidden border-2 bg-ink/80 p-2.5 text-left transition sm:h-44 ${shortGrid ? '[@media(max-height:600px)_and_(min-height:501px)]:sm:h-32 [@media(max-height:500px)]:sm:h-24' : ''} [@media(max-height:500px)]:h-28 ${on ? 'border-gold' : 'border-cream/10 hover:border-cream/30'}`}
          >
            <div
              className={`absolute inset-0 transition ${on ? 'opacity-60' : 'opacity-25 group-hover:opacity-40'}`}
              style={{
                background: `radial-gradient(circle at 50% 40%, ${c.color}, transparent 65%)`,
              }}
            />
            {portraits && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={portraits[id]}
                alt=""
                className={`absolute inset-x-0 top-0 mx-auto h-[82%] w-auto object-contain transition ${on ? 'scale-105' : 'opacity-80 group-hover:scale-105'}`}
              />
            )}
            <div className="relative z-10 flex items-baseline justify-between bg-gradient-to-t from-ink-deep/90 to-transparent pt-4">
              <span
                className="truncate font-display text-base leading-none [@media(max-height:500px)]:text-xs"
                style={{ color: c.color }}
              >
                {c.name}
              </span>
              {on && (
                <span className="text-[9px] font-bold tracking-widest text-gold [@media(max-height:500px)]:hidden">
                  YOU
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  </>
);

/** Drop, loot, survive. */
/** What the three cards say on a phone (the game's own copy names keys). */
const HOW_TO_TOUCH: [string, string][] = [
  ['Drop', 'Tap JUMP over the place you want to land, free-fall, then tap FIRE to open the parachute and steer with the stick.'],
  ['Loot', 'Walk over loot. The arrow button picks up what you stand on, SWAP changes gun and HEAL uses what you carry.'],
  ['Survive', 'Stay inside the safe zone. The left thumb moves, FIRE aims by itself at whoever you can see, ROLL gets you out of trouble and SUPER fires when its ring is full.'],
];

export const HowTo = ({ touch = false }: { touch?: boolean }) => (
  <section className="grid gap-3 sm:grid-cols-3">
    {(touch ? HOW_TO_TOUCH : COPY.howTo).map(([title, text], i) => (
      <div key={title} className="panel-cut flex gap-4 bg-ink/70 p-4 backdrop-blur [@media(max-height:500px)]:gap-3 [@media(max-height:500px)]:p-3">
        <span className="font-display text-2xl text-gold/80">0{i + 1}</span>
        <div className="flex flex-col gap-1">
          <span className="font-display text-base">{title}</span>
          <span className="text-sm text-cream/70 [@media(max-height:500px)]:text-xs">{text}</span>
        </div>
      </div>
    ))}
  </section>
);
