/// <reference types="vite/client" />
/**
 * The portal build's entry: no home page, no lobby server, no outbound links, straight into a solo round against nine
 * bots (CrazyGames asks that new players land in gameplay). The platform adapter is chosen first and told that loading
 * has started; the first frame of the round ends it (see useBreaks). The portal owns fullscreen, so the game never asks.
 */
import { createRoot } from 'react-dom/client';

import { PortalGame } from '~/components/PortalGame';
import { disableAutoFullscreen } from '~/components/TouchControls';
import { STUDIO_NAME } from '~/lib/studio';
import { detectPlatform } from '~/platform';

import './portal.css';

disableAutoFullscreen();

void detectPlatform().then((platform) => {
  platform.loadingStart();
  createRoot(document.getElementById('root')!).render(<PortalGame platform={platform} credit={STUDIO_NAME} />);
});
