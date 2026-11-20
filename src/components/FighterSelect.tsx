'use client';

/**
 * The fighter picker, shared by the site's lobby and the portal build: the picked fighter big (portrait, stats, super),
 * the four to choose from, and the three how-to cards. Portraits are rendered from the game's own models after the page
 * has painted (`usePortraits`).
 */
import { useEffect, useState } from 'react';

import { COPY } from '~/game/copy/studio';
import { FIGHTERS } from '~/game/sim/constants';

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

/** The fighters' portraits, rendered once after the page has painted (null until then, or while `skip`). */
export const usePortraits = (skip = false): Portraits => {
  const [portraits, setPortraits] = useState<Portraits>(null);
  useEffect(() => {
    if (skip || portraits) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void import('~/game/render/showcase').then(({ renderPortraits }) => {
          if (!cancelled) setPortraits(renderPortraits());
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [skip, portraits]);
  return portraits;
};

/** The fighter you drop as, big. */
export const FighterCard = ({ fighter, portraits }: { fighter: FighterId; portraits: Portraits }) => {
  const f = FIGHTERS[fighter];
  return (
      <div className="panel-cut relative flex min-h-[300px] overflow-hidden border border-cream/10 bg-ink/70 backdrop-blur sm:min-h-[380px] [@media(max-height:500px)]:min-h-[250px]">
        <div
          className="absolute inset-0 opacity-50 transition-[background] duration-700"
          style={{
            background: `radial-gradient(circle at 70% 65%, ${f.color}, transparent 60%)`,
          }}
        />
        <div className="relative z-10 flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-cream/55">
              You drop as
            </span>
            <h1
              key={fighter}
              className="font-display text-4xl leading-none [animation:riseIn_0.35s_ease-out] sm:text-6xl [@media(max-height:500px)]:text-4xl"
              style={{ color: f.color }}
            >
              {f.name.toUpperCase()}
            </h1>
            <span className="text-sm text-cream/70">{f.role}</span>
          </div>
          <div className="flex max-w-[11rem] flex-col gap-3 sm:max-w-[15rem]">
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
          <div className="panel-cut max-w-xs bg-ink-deep/70 p-3 text-sm">
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
            className="pointer-events-none absolute -right-8 bottom-0 z-0 h-[62%] w-auto sm:h-[92%] [@media(max-height:500px)]:h-[72%] [@media(max-height:500px)]:-right-14 object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)] [animation:riseIn_0.4s_ease-out] sm:right-2"
          />
        )}
      </div>
  );
};

/** Pick one of the four. */
export const FighterGrid = ({ fighter, portraits, onPick }: { fighter: FighterId; portraits: Portraits; onPick: (id: FighterId) => void }) => (
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
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
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
            className={`panel-cut group relative flex h-36 flex-col justify-end overflow-hidden border-2 bg-ink/80 p-2.5 text-left transition sm:h-44 [@media(max-height:500px)]:h-28 ${on ? 'border-gold' : 'border-cream/10 hover:border-cream/30'}`}
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
export const HowTo = () => (
  <section className="grid gap-3 sm:grid-cols-3">
    {COPY.howTo.map(([title, text], i) => (
      <div key={title} className="panel-cut flex gap-4 bg-ink/70 p-4 backdrop-blur">
        <span className="font-display text-2xl text-gold/80">0{i + 1}</span>
        <div className="flex flex-col gap-1">
          <span className="font-display text-base">{title}</span>
          <span className="text-sm text-cream/70">{text}</span>
        </div>
      </div>
    ))}
  </section>
);
