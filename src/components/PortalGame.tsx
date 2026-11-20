'use client';

/**
 * The portal build's whole game: the main menu over the live battleground, then solo rounds against nine bots. Nothing
 * online, no outbound links. The round report offers Play again or Main menu; a midgame ad may play as the player leaves
 * it (see useBreaks). Settings are shared by the menu and the pause menu (useSettings).
 */
import { useState } from 'react';

import { readAim, saveAim } from '~/components/AimChoice';
import { FIGHTER_IDS, PICK_KEY } from '~/components/FighterSelect';
import { MainMenu } from '~/components/MainMenu';
import { Match } from '~/components/Match';
import { PreMatch } from '~/components/PreMatch';
import { useWipe } from '~/components/Transitions';
import { useTouch } from '~/components/TouchControls';
import { useSettings } from '~/components/useSettings';

import type { AimMode } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';

export const PortalGame = ({ platform, credit }: { platform: Platform; credit: string }) => {
  const [fighter, setFighter] = useState<FighterId>(() => {
    const saved = platform.storage.getItem(PICK_KEY) as FighterId | null;
    return saved && FIGHTER_IDS.includes(saved) ? saved : 'hotfix';
  });
  const [round, setRound] = useState(0);
  /**
   * menu → lobby (fighter, lobby filling, wait for Ready) → readying (the match loads underneath, held, while the
   * countdown runs) → match. Play again goes back to the lobby with everyone already there.
   */
  const [stage, setStage] = useState<'menu' | 'lobby' | 'readying' | 'match'>('menu');
  const [quick, setQuick] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aim, setAim] = useState<AimMode>(() => readAim());
  const [settings, setSettings] = useSettings(platform.storage);
  const touch = useTouch();
  // Every change of screen goes through a quick wipe (see Transitions): the next screen is built while it covers.
  const wipe = useWipe(settings.reducedMotion);

  const pickFighter = (id: FighterId) => {
    setFighter(id);
    platform.storage.setItem(PICK_KEY, id);
  };
  const toLobby = (again: boolean) =>
    wipe.run(again ? 'Rematch' : 'Lobby', () => {
      setQuick(again);
      setLoaded(false);
      setStage('lobby');
    });
  const toMenu = () =>
    wipe.run(
      'Menu',
      () => {
        setAim(readAim());
        setStage('menu');
      },
      '#3ec5ff',
    );

  if (stage !== 'menu') {
    return (
      <>
        {wipe.node}
        {/* The match: built underneath the lobby once you are ready, released at the end of the launch. */}
        {(stage === 'readying' || stage === 'match') && (
          <Match
            key={round}
            fighter={fighter}
            platform={platform}
            credit={credit}
            exitLabel="Main menu"
            held={stage !== 'match'}
            onLoaded={() => setLoaded(true)}
            onPlayAgain={() => toLobby(true)}
            onExit={toMenu}
          />
        )}
        {(stage === 'lobby' || stage === 'readying') && (
          <div className="fixed inset-0 z-50">
            <PreMatch
              platform={platform}
              settings={settings}
              fighter={fighter}
              onFighter={pickFighter}
              quick={quick}
              touch={touch}
              loaded={loaded}
              onReady={() => {
                setRound((r) => r + 1);
                setStage('readying');
              }}
              onBack={toMenu}
              onLaunch={() => setStage('match')}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {wipe.node}
      <MainMenu
      platform={platform}
      settings={settings}
      onSettings={setSettings}
      fighter={fighter}
      onFighter={pickFighter}
      aim={aim}
      onAim={(m) => {
        setAim(m);
        saveAim(m);
      }}
      onPlay={() => toLobby(false)}
      credit={credit}
      touch={touch}
    />
    </>
  );
};
