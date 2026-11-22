'use client';

/**
 * The portal build's whole game: the main menu over the live battleground, then solo rounds against nineteen bots. Nothing
 * online, no outbound links. The round report offers Play again or Main menu, straight on with no ad in between; the only
 * ad is a banner under the main menu (MenuBanner). Settings are shared by the menu and the pause menu (useSettings).
 */
import { useRef, useState } from 'react';

import { readAim, saveAim } from '~/components/AimChoice';
import { FIGHTER_IDS, PICK_KEY } from '~/components/FighterSelect';
import { MainMenu } from '~/components/MainMenu';
import { Match } from '~/components/Match';
import { contextLine, isRookie, loadCareer, nudgeFighter, saveCareer } from '~/game/career';
import { applyRound } from '~/game/progress';
import { PreMatch } from '~/components/PreMatch';
import { FIGHTERS } from '~/game/sim/constants';
import { useWipe } from '~/components/Transitions';
import { useTouch } from '~/components/TouchControls';
import { useSettings } from '~/components/useSettings';

import type { RoundReport } from '~/components/Match';
import type { Career, RoundResult } from '~/game/career';
import type { Look } from '~/game/cosmetics';
import type { AimMode } from '~/game/render/game';
import type { HudState } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { ComponentType } from 'react';
import type { Platform } from '~/platform/types';

export const PortalGame = ({
  platform,
  credit,
  support: givenSupport,
  onlineInterest: givenInterest,
}: {
  platform: Platform;
  credit: string;
  /** Our own site's Support us pill (main menu, pause menu, round report). The portal build passes nothing. */
  support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  /** Our own site's "Online is coming" button on the main menu. The portal build passes nothing. */
  onlineInterest?: ComponentType;
}) => {
  // Never an outbound link when the game runs on CrazyGames, whatever the page passed in.
  const support = platform.id === 'crazygames' ? undefined : givenSupport;
  const onlineInterest = platform.id === 'crazygames' ? undefined : givenInterest;
  const [fighter, setFighter] = useState<FighterId>(() => {
    const saved = platform.storage.getItem(PICK_KEY) as FighterId | null;
    return saved && FIGHTER_IDS.includes(saved) ? saved : 'hotfix';
  });
  const [round, setRound] = useState(0);
  // What the game remembers (rounds played, level, canopies, goals): loaded once, saved after every round. The round that is
  // about to start reads it when Ready is pressed, so a new player's first rounds get the gentle bots and the light first-round
  // screen. `careerRef` is what the next round reads, the state is what the menu and the lobby show.
  const [career, setCareer] = useState<Career>(() => loadCareer(platform.storage));
  const careerRef = useRef(career);
  const [roundKind, setRoundKind] = useState<{ rookie: boolean; first: boolean; look: Look }>({ rookie: false, first: false, look: career.look });
  const keepCareer = (c: Career) => {
    careerRef.current = c;
    saveCareer(platform.storage, c);
    setCareer(c);
  };
  const finishRound = (hud: HudState): RoundReport | null => {
    const before = careerRef.current;
    const result: RoundResult = {
      fighter,
      place: hud.won ? 1 : hud.placement,
      total: hud.total,
      won: hud.won,
      kills: hud.kills,
      damage: hud.damage,
      survived: hud.survived,
    };
    const { career: played, summary } = applyRound(before, result, hud.facts, new Date());
    // Anything just unlocked is already worn for the next drop (applyRound equips it; change it in the lobby).
    keepCareer(played);
    const next = nudgeFighter(played) as FighterId | null;
    return { line: contextLine(before, result), nudge: next ? `Try ${FIGHTERS[next].name} next` : null, summary };
  };
  const pickLook = (look: Look) => keepCareer({ ...careerRef.current, look });
  /** The player opened a category in Style: what it held is no longer new. */
  const markSeen = (ids: string[]) => keepCareer({ ...careerRef.current, seen: [...new Set([...careerRef.current.seen, ...ids])] });
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
            support={support}
            exitLabel="Main menu"
            held={stage !== 'match'}
            rookie={roundKind.rookie}
            firstRound={roundKind.first}
            look={roundKind.look}
            onRoundEnd={finishRound}
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
                setRoundKind({ rookie: isRookie(careerRef.current), first: careerRef.current.roundsPlayed === 0, look: careerRef.current.look });
                setRound((r) => r + 1);
                setStage('readying');
              }}
              career={career}
              onLook={pickLook}
              onSeen={markSeen}
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
      support={support}
      onlineInterest={onlineInterest}
      career={career}
      onLook={pickLook}
      onSeen={markSeen}
    />
    </>
  );
};
