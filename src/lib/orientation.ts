/**
 * The game is played in landscape. On a touch screen held upright, a full-screen "rotate your phone" card covers
 * everything (portal/index.html draws it with plain CSS from the first paint) and a running round pauses behind it.
 * A desktop window that happens to be taller than wide is never blocked: only the touch UI (src/lib/device.ts) counts.
 */
import { useEffect, useState } from 'react';

import { isTouchUi, subscribe } from '~/lib/device';

export const blocksPortrait = (touchUi: boolean, w: number, h: number): boolean => touchUi && h > w;

const read = (): boolean => blocksPortrait(isTouchUi(), window.innerWidth, window.innerHeight);

/** True while a touch screen is held upright. */
export const useRotateBlock = (): boolean => {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const update = () => setBlocked(read());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const off = subscribe(update);
    return () => {
      off();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return blocked;
};
