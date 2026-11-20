'use client';

/**
 * The portal build's whole game: solo against nine bots, nothing online, no outbound links. New players land straight in
 * a round (portals ask that the first click leads to gameplay); the round report offers Play again or Change fighter,
 * which opens the picker. A midgame ad may play as the player leaves the report (see useBreaks).
 */
import { useState } from 'react';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { FIGHTER_IDS, FighterCard, FighterGrid, HowTo, PICK_KEY, usePortraits } from '~/components/FighterSelect';
import { Match } from '~/components/Match';
import { useTouch } from '~/components/TouchControls';
import { FIGHTERS } from '~/game/sim/constants';
import { GAME_TITLE } from '~/lib/studio';

import type { AimMode } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';

export const PortalGame = ({ platform, credit }: { platform: Platform; credit: string }) => {
  const [fighter, setFighter] = useState<FighterId>(() => {
    const saved = platform.storage.getItem(PICK_KEY) as FighterId | null;
    return saved && FIGHTER_IDS.includes(saved) ? saved : 'hotfix';
  });
  const [round, setRound] = useState(0);
  const [picking, setPicking] = useState(false);
  const [aim, setAim] = useState<AimMode>(() => readAim());
  const portraits = usePortraits(!picking);
  const touch = useTouch();

  if (!picking) {
    return (
      <Match
        key={round}
        fighter={fighter}
        platform={platform}
        credit={credit}
        exitLabel="Change fighter"
        onPlayAgain={() => setRound((r) => r + 1)}
        onExit={() => setPicking(true)}
      />
    );
  }

  const pick = (id: FighterId) => {
    setFighter(id);
    platform.storage.setItem(PICK_KEY, id);
  };
  const play = () => {
    setRound((r) => r + 1);
    setPicking(false);
  };
  const f = FIGHTERS[fighter];

  return (
    <main className="relative h-[100dvh] overflow-y-auto bg-ink-deep text-cream">
      <div
        className="pointer-events-none fixed inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(ellipse 60% 70% at 22% 45%, ${f.color}2e, transparent 70%), radial-gradient(ellipse 50% 60% at 100% 100%, #3ec5ff14, transparent 70%)`,
        }}
      />
      <div className="grid-bg pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-6 px-4 pb-28 pt-5 sm:px-8 sm:pb-8">
        <header className="flex items-center justify-between gap-3 whitespace-nowrap text-[10px] font-semibold tracking-[0.2em] text-blue sm:text-xs sm:tracking-[0.3em]">
          <span>{GAME_TITLE.toUpperCase()}</span>
          <span className="flex items-center gap-2 text-cream/60">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green" /> SOLO · 10 PLAYERS
          </span>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] [@media(max-height:500px)]:grid-cols-2 [@media(max-height:500px)]:gap-4">
          <FighterCard fighter={fighter} portraits={portraits} />
          <div className="flex flex-col gap-4">
            <FighterGrid fighter={fighter} portraits={portraits} onPick={pick} />
            {!touch && (
              <div className="panel-cut bg-ink/80 p-3 backdrop-blur">
                <AimChoice
                  value={aim}
                  onChange={(m) => {
                    setAim(m);
                    saveAim(m);
                  }}
                />
              </div>
            )}
            <div className="flex justify-end">
              {/* Desktop: the big button sits here; on phones it rides along at the bottom. */}
              <button
                type="button"
                autoFocus
                onClick={play}
                className="panel-cut group fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-3 bg-gold px-10 py-4 font-display text-xl uppercase text-ink-deep shadow-[0_0_40px_rgba(255,210,63,0.35)] transition hover:brightness-110 sm:static"
              >
                Play
                <span className="transition group-hover:translate-x-1">→</span>
              </button>
            </div>
          </div>
        </section>

        <HowTo />
        <p className="text-center text-[10px] tracking-widest text-cream/35">A game by {credit}</p>
      </div>
    </main>
  );
};
