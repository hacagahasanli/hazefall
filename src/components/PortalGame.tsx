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
  const [aim, setAim] = useState<AimMode>(() => readAim());
  const [settings, setSettings] = useSettings(platform.storage);
  const touch = useTouch();

  if (!inMenu) {
    return (
      <Match
        key={round}
        fighter={fighter}
        platform={platform}
        credit={credit}
        exitLabel="Main menu"
        onPlayAgain={() => setRound((r) => r + 1)}
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
      onFighter={(id) => {
        setFighter(id);
        platform.storage.setItem(PICK_KEY, id);
      }}
      aim={aim}
      onAim={(m) => {
        setAim(m);
        saveAim(m);
      }}
      onPlay={() => {
        setRound((r) => r + 1);
        setInMenu(false);
      }}
      credit={credit}
      touch={touch}
    />
  );
};
