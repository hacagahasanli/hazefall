/// <reference types="vite/client" />
/**
 * The web build's entry (lastcommit.nalbakigames.com): the portal build's game, menu and boot screen, plus a small Support
 * us pill (main menu, pause menu, round report), the "Online is coming" button on the menu, and the studio's anonymous
 * stats. No CrazyGames SDK: the plain web adapter, so no ads and no banners. If this page ever runs on CrazyGames, the pill,
 * the button and the stats stay off.
 */
import { createRoot } from 'react-dom/client';

import { GAME_VERSION } from '~/components/MainMenu';
import { resetCareerIfAsked } from '~/game/career';
import { OnlineInterest } from '~/components/OnlineInterest';
import { PortalGame } from '~/components/PortalGame';
import { SupportLink } from '~/components/SupportLink';
import { disableAutoFullscreen } from '~/components/TouchControls';
import { boot } from '~/lib/loading';
import { STUDIO_NAME } from '~/lib/studio';
import { init, track } from '~/lib/telemetry';
import { createWebPlatform } from '~/platform/web';

import '../portal/portal.css';

/** The studio's stats endpoint (public; the Next site read it from NEXT_PUBLIC_STATS_URL). */
const STATS_URL = 'https://stats.nalbakigames.com/v1/b';

const onCrazyGames = () => {
  try {
    if ((window as { CrazyGames?: unknown }).CrazyGames) return true;
    const where = [location.hostname, document.referrer, ...Array.from(location.ancestorOrigins ?? [])].join(' ');
    return /crazygames/i.test(where);
  } catch {
    return false;
  }
};

const crazy = onCrazyGames();
if (!crazy) {
  init({ endpoint: STATS_URL, game: 'lcs', build: GAME_VERSION });
  // Loading starts now; load_done and menu_view go when the menu is first on screen (MainMenu).
  track('load_start');
}

// The same start as the portal build (portal/main.tsx): the boot checkpoints, then the menu.
disableAutoFullscreen();
boot.step('Engine running', 0.44, 0.47);
const platform = createWebPlatform();
boot.step('Platform ready', 0.47, 0.5);
platform.loadingStart();
// ?career=reset (web build only, for testing): start again from Level 1, then drop the flag so a reload does not wipe it again.
if (!crazy && resetCareerIfAsked(platform.storage, location.search)) {
  const url = new URL(location.href);
  url.searchParams.delete('career');
  history.replaceState(null, '', url);
}
createRoot(document.getElementById('root')!).render(
  <PortalGame platform={platform} credit={STUDIO_NAME} support={crazy ? undefined : SupportLink} onlineInterest={crazy ? undefined : OnlineInterest} />,
);
