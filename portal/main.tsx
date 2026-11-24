/// <reference types="vite/client" />
/**
 * The portal build's entry: no home page, no lobby server, no outbound links, straight into a solo round against nine
 * bots (CrazyGames asks that new players land in gameplay). The platform adapter is chosen first and told that loading
 * has started; the menu ends it. The portal owns fullscreen, so the game never asks.
 */
import { createRoot } from 'react-dom/client';

import { PortalGame } from '~/components/PortalGame';
import { disableAutoFullscreen } from '~/components/TouchControls';
import { deviceType, installDevice, isDesktopOnlyBlocked, setPlatformDevice } from '~/lib/device';
import { boot } from '~/lib/loading';
import { lockViewport } from '~/lib/lockViewport';
import { installPhoneUi } from '~/lib/phoneUi';
import { STUDIO_NAME } from '~/lib/studio';
import { detectPlatform } from '~/platform';

import './portal.css';

disableAutoFullscreen();
lockViewport();
// The fallback guess (primary pointer) holds until the platform answers; the platform's system info then decides, and the
// phone UI scale follows the change (src/lib/device.ts).
installDevice();
installPhoneUi();

// Boot checkpoints (0..1): game code 0.40, engine 0.44, platform 0.47, menu 0.50, then the menu's scene and models up
// to 0.97 (MainMenu), and 100 % once its first frame is drawn with every model in.
boot.step('Engine running', 0.44, 0.47);
void detectPlatform().then((platform) => {
  setPlatformDevice(platform.deviceType());
  // Desktop only (Reis, 2026-11-24, after the CrazyGames quality rejection): phones and tablets get the "Made for desktop"
  // card (portal/index.html #desk) and the game never starts. On CrazyGames the SDK's systemInfo.device.type decides, so a
  // touch-screen laptop ('desktop') gets the full game; elsewhere the fallback guess in src/lib/device.ts.
  if (isDesktopOnlyBlocked(deviceType())) {
    document.documentElement.classList.add('lcs-desktop-only');
    return;
  }
  boot.step('Platform ready', 0.47, 0.5);
  platform.loadingStart();
  createRoot(document.getElementById('root')!).render(<PortalGame platform={platform} credit={STUDIO_NAME} />);
});
