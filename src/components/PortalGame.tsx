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
  const [inMenu, setInMenu] = useState(true);
  /** Play leads to the pre-match (fighter, lobby, countdown), not straight into the round; Play again runs a short one. */
  const [staging, setStaging] = useState<null | 'full' | 'quick'>(null);
  const [aim, setAim] = useState<AimMode>(() => readAim());
  const [settings, setSettings] = useSettings(platform.storage);
  const touch = useTouch();

  const pickFighter = (id: FighterId) => {
    setFighter(id);
    platform.storage.setItem(PICK_KEY, id);
  };

  if (staging) {
    return (
      <PreMatch
        platform={platform}
        settings={settings}
        fighter={fighter}
        onFighter={pickFighter}
        quick={staging === 'quick'}
        touch={touch}
        onBack={() => {
          setStaging(null);
          setInMenu(true);
        }}
        onLaunch={() => {
          setRound((r) => r + 1);
          setStaging(null);
          setInMenu(false);
        }}
      />
    );
  }

  if (!inMenu) {
    return (
      <Match
        key={round}
        fighter={fighter}
        platform={platform}
        credit={credit}
        exitLabel="Main menu"
        onPlayAgain={() => setStaging('quick')}
        onExit={() => {
          setAim(readAim());
          setInMenu(true);
        }}
      />
    );
  }

  return (
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
      onPlay={() => setStaging('full')}
      credit={credit}
      touch={touch}
    />
  );
};
