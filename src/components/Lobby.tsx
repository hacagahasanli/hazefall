'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { Match } from '~/components/Match';
import { BOT_NAMES, FIGHTERS } from '~/game/sim/constants';

import type { AimMode } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';

const IDS: FighterId[] = ['hotfix', 'legacy', 'standup', 'intern'];
const PICK_KEY = 'lcs:fighter';

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

/**
 * The lobby between rounds. Offline for now: nine bots are always ready, you press Ready.
 * Online (next milestone) the same screen lists the friends who joined by invite link, and the
 * round starts when everyone is ready. Same look as the home page (cut panels, rendered
 * portraits, gold call to action) but a calm backdrop: no live battleground behind it.
 */
export const Lobby = () => {
  const [fighter, setFighter] = useState<FighterId>('hotfix');
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aim, setAim] = useState<AimMode>('auto');
  const [portraits, setPortraits] = useState<Record<FighterId, string> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PICK_KEY) as FighterId | null;
      if (saved && IDS.includes(saved)) setFighter(saved);
      setAim(readAim());
    } catch {
      /* no storage */
    }
  }, []);

  // Portraits come from the game's own models, rendered once after the page has painted.
  useEffect(() => {
    if (playing || portraits) return;
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
  }, [playing, portraits]);

  const pick = (id: FighterId) => {
    setFighter(id);
    try {
      window.localStorage.setItem(PICK_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const ready = () => {
    setRound((r) => r + 1);
    setPlaying(true);
  };

  if (playing) {
    return <Match key={round} fighter={fighter} onExit={() => setPlaying(false)} onPlayAgain={() => setRound((r) => r + 1)} />;
  }

  const f = FIGHTERS[fighter];

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-ink-deep text-cream">
      {/* A calm backdrop: the picked fighter's colour glowing behind them, a faint map grid. */}
      <div
        className="pointer-events-none fixed inset-0 transition-[background] duration-700"
        style={{ background: `radial-gradient(ellipse 60% 70% at 22% 45%, ${f.color}2e, transparent 70%), radial-gradient(ellipse 50% 60% at 100% 100%, #3ec5ff14, transparent 70%)` }}
      />
      <div className="grid-bg pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-8 sm:pb-8">
        <header className="flex items-center justify-between gap-3 whitespace-nowrap text-[10px] font-semibold tracking-[0.2em] text-blue sm:text-xs sm:tracking-[0.3em]">
          <Link href="/" className="hover:text-cream">
            <span className="text-green">&lt;&lt;</span> LAST COMMIT STANDING
          </Link>
          <span className="flex items-center gap-2 text-cream/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green" /> LOBBY · 10 / 10
          </span>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
          {/* The fighter you drop as, big. */}
          <div className="panel-cut relative flex min-h-[300px] overflow-hidden border border-cream/10 bg-ink/70 backdrop-blur sm:min-h-[380px] [@media(max-height:500px)]:min-h-[250px]">
            <div className="absolute inset-0 opacity-50 transition-[background] duration-700" style={{ background: `radial-gradient(circle at 70% 65%, ${f.color}, transparent 60%)` }} />
            <div className="relative z-10 flex flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-cream/55">You drop as</span>
                <h1 key={fighter} className="font-display text-4xl leading-none [animation:riseIn_0.35s_ease-out] sm:text-6xl [@media(max-height:500px)]:text-4xl" style={{ color: f.color }}>
                  {f.name.toUpperCase()}
                </h1>
                <span className="text-sm text-cream/70">{f.role}</span>
              </div>
              <div className="flex max-w-[11rem] flex-col gap-3 sm:max-w-[15rem]">
                <Bar label="Health" value={1} text={`${f.hp}`} color="#3ddc84" />
                <Bar label="Speed" value={rel(f.speed, SPEEDS)} text={`${f.speed} m/s`} color="#3ec5ff" />
                <Bar label="Super charge" value={rel(f.superCost, COSTS, true)} text={f.superCost <= 140 ? 'fast' : 'slow'} color="#ffd23f" />
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

          <div className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-xl [@media(max-height:500px)]:text-base">Pick a fighter</h2>
              <span className="text-xs text-cream/50 [@media(max-height:500px)]:hidden">Same guns for all: the super is yours</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Fighter">
              {IDS.map((id) => {
                const c = FIGHTERS[id];
                const on = id === fighter;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(id)}
                    className={`panel-cut group relative flex h-36 flex-col justify-end overflow-hidden border-2 bg-ink/80 p-2.5 text-left transition sm:h-44 [@media(max-height:500px)]:h-28 ${on ? 'border-gold' : 'border-cream/10 hover:border-cream/30'}`}
                  >
                    <div className={`absolute inset-0 transition ${on ? 'opacity-60' : 'opacity-25 group-hover:opacity-40'}`} style={{ background: `radial-gradient(circle at 50% 40%, ${c.color}, transparent 65%)` }} />
                    {portraits && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portraits[id]} alt="" className={`absolute inset-x-0 top-0 mx-auto h-[82%] w-auto object-contain transition ${on ? 'scale-105' : 'opacity-80 group-hover:scale-105'}`} />
                    )}
                    <div className="relative z-10 flex items-baseline justify-between bg-gradient-to-t from-ink-deep/90 to-transparent pt-4">
                      <span className="truncate font-display text-base leading-none [@media(max-height:500px)]:text-xs" style={{ color: c.color }}>
                        {c.name}
                      </span>
                      {on && <span className="text-[9px] font-bold tracking-widest text-gold [@media(max-height:500px)]:hidden">YOU</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
              <AimChoice
                value={aim}
                onChange={(m) => {
                  setAim(m);
                  saveAim(m);
                }}
              />
            </div>

            <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold tracking-widest text-cream/50">IN THIS LOBBY</span>
                <span className="text-[10px] text-cream/40">Invite links come with online play</span>
              </div>
              <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-5">
                <li className="flex items-center gap-1.5 truncate bg-gold/15 px-2 py-1 text-cream">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span className="truncate">you</span>
                </li>
                {BOT_NAMES.map((n) => (
                  <li key={n} className="flex items-center gap-1.5 truncate bg-cream/5 px-2 py-1 text-cream/65">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
                    <span className="truncate">{n}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Desktop: the big button sits here; on phones it rides along at the bottom. */}
            <button
              type="button"
              onClick={ready}
              className="panel-cut group fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110 sm:static sm:self-end"
            >
              Ready · drop in
              <span className="transition group-hover:translate-x-1">→</span>
            </button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Drop', 'Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and one magazine.'],
            ['02', 'Loot', 'Guns, armor, ammo, med kits and bombs lie in houses, barns and yards. Walk over them or press F.'],
            ['03', 'Survive', 'Stay inside the Deadline. Space shoots, Q / E lean, Shift rolls, G is your super, hide in tall grass. Esc Esc pauses.'],
          ].map(([n, title, text]) => (
            <div key={n} className="panel-cut flex gap-4 bg-ink/70 p-4 backdrop-blur">
              <span className="font-display text-2xl text-gold/80">{n}</span>
              <div className="flex flex-col gap-1">
                <span className="font-display text-base">{title}</span>
                <span className="text-sm text-cream/70">{text}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
};
