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

/**
 * The lobby between rounds. Offline for now: nine bots are always ready, you press Ready.
 * Online (next milestone) the same screen lists the friends who joined by invite link, and the
 * round starts when everyone is ready.
 */
export const Lobby = () => {
  const [fighter, setFighter] = useState<FighterId>('hotfix');
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aim, setAim] = useState<AimMode>('auto');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PICK_KEY) as FighterId | null;
      if (saved && IDS.includes(saved)) setFighter(saved);
      setAim(readAim());
    } catch {
      /* no storage */
    }
  }, []);

  const pick = (id: FighterId) => {
    setFighter(id);
    try {
      window.localStorage.setItem(PICK_KEY, id);
    } catch {
      /* ignore */
    }
  };

  if (playing) {
    return <Match key={round} fighter={fighter} onExit={() => setPlaying(false)} />;
  }

  return (
    <main className="grid-bg mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-cream/50 hover:text-cream">
            ← Last Commit Standing
          </Link>
          <h1 className="font-display text-3xl">Lobby</h1>
          <p className="text-sm text-cream/60">Pick who you drop as. Everyone starts with fists; guns are on the campus.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setPlaying(true);
          }}
          className="panel-cut bg-gold px-10 py-3 text-lg font-bold uppercase tracking-wider text-ink-deep hover:brightness-110"
        >
          Ready
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {IDS.map((id) => {
          const f = FIGHTERS[id];
          const on = id === fighter;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              className={`panel-cut flex flex-col gap-2 border-2 bg-ink p-4 text-left ${on ? 'border-gold' : 'border-cream/10 hover:border-cream/30'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-xl" style={{ color: f.color }}>
                  {f.name}
                </span>
                {on && <span className="text-[10px] font-bold tracking-widest text-gold">YOU</span>}
              </div>
              <span className="text-xs text-cream/50">{f.role}</span>
              <div className="text-xs text-cream/70">
                {f.hp} HP · speed {f.speed}
              </div>
              <div className="text-sm text-cream/80">
                <span className="font-bold text-cream">Q · {f.superName}:</span> {f.superText}
              </div>
            </button>
          );
        })}
      </section>

      <section className="panel-cut max-w-md bg-ink/80 p-4">
        <AimChoice
          value={aim}
          onChange={(m) => {
            setAim(m);
            saveAim(m);
          }}
        />
      </section>

      <section className="panel-cut bg-ink/80 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg">In this lobby · 10 / 10</h2>
          <span className="text-xs text-cream/50">Invite links come with online play</span>
        </div>
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
          <li className="flex justify-between rounded bg-cream/10 px-3 py-1.5">
            <span>
              you · <span style={{ color: FIGHTERS[fighter].color }}>{FIGHTERS[fighter].name}</span>
            </span>
            <span className="text-gold">not ready</span>
          </li>
          {BOT_NAMES.map((n) => (
            <li key={n} className="flex justify-between rounded bg-cream/5 px-3 py-1.5 text-cream/70">
              <span>{n} · bot</span>
              <span className="text-green">ready</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-2 text-sm text-cream/70 sm:grid-cols-3">
        <div className="panel-cut bg-ink/60 p-3">
          <b className="text-cream">Drop.</b> The cargo drone crosses the campus. Hold Space to jump, steer with WASD while you
          glide down.
        </div>
        <div className="panel-cut bg-ink/60 p-3">
          <b className="text-cream">Loot.</b> Guns, armor, med kits and bombs lie in the buildings. Walk over them, or press E to
          swap. Server racks break and sometimes drop loot.
        </div>
        <div className="panel-cut bg-ink/60 p-3">
          <b className="text-cream">Survive.</b> The Deadline closes in until nothing is left. Space shoots at the nearest enemy
          you can see (or aim with the mouse), Q is your super. Hide in plants. Esc Esc pauses.
        </div>
      </section>
    </main>
  );
};
