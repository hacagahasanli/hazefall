/**
 * The game is played in landscape. On a touch screen held upright, a full-screen "rotate your phone" card covers
 * everything (portal/index.html draws it with plain CSS from the first paint) and a running round pauses behind it.
 * A desktop window that happens to be taller than wide is never blocked: only a coarse pointer counts.
 */
import { useEffect, useState } from 'react';

export const blocksPortrait = (coarse: boolean, w: number, h: number): boolean => coarse && h > w;

const read = (): boolean => blocksPortrait(!!window.matchMedia?.('(pointer: coarse)').matches, window.innerWidth, window.innerHeight);

/** True while a touch screen is held upright. */
export const useRotateBlock = (): boolean => {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const update = () => setBlocked(read());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return blocked;
};
