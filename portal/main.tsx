/// <reference types="vite/client" />
/**
 * The portal build's entry: no home page, no lobby server, no outbound links, straight into a solo round against nine
 * bots (CrazyGames asks that new players land in gameplay). The platform adapter is chosen first and told that loading
 * has started; the first frame of the round ends it (see useBreaks). The portal owns fullscreen, so the game never asks.
 */
import { createRoot } from 'react-dom/client';

import { PortalGame } from '~/components/PortalGame';
import { disableAutoFullscreen } from '~/components/TouchControls';
import { setBreakRules } from '~/components/useBreaks';
import { boot } from '~/lib/loading';
import { STUDIO_NAME } from '~/lib/studio';
import { detectPlatform } from '~/platform';

import './portal.css';

disableAutoFullscreen();
// Dev only: ?testBreaks makes an ad due after every round (the SDK shows its demo ad on localhost).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('testBreaks')) setBreakRules({ firstAfterRounds: 1, firstAfterPlay: 0, interval: 0 });

// Boot checkpoints (0..1): game code 0.40, engine 0.44, platform 0.47, menu 0.50, then the menu's scene and models up
// to 0.97 (MainMenu), and 100 % once its first frame is drawn with every model in.
boot.step('Engine running', 0.44, 0.47);
void detectPlatform().then((platform) => {
  boot.step('Platform ready', 0.47, 0.5);
  platform.loadingStart();
  createRoot(document.getElementById('root')!).render(<PortalGame platform={platform} credit={STUDIO_NAME} />);
});
