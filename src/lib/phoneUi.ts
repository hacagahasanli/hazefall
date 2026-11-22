import { isTouchUi, subscribe } from '~/lib/device';

/**
 * One UI scale for phones. The HUD, the touch buttons and the menus are laid out for a landscape phone 844 x 390 px
 * (an iPhone 14) at scale 1; on a smaller screen everything shrinks together instead of each piece being patched, so
 * nothing lands on top of anything else. The scale is published as the CSS variable --ui on <html>, and the class
 * `lcs-phone` marks a landscape phone (the touch UI, see src/lib/device.ts, no taller than 520 px).
 * Pure functions here (tested); `installPhoneUi` wires them to the window.
 */

/** The size the layouts are drawn for. */
export const REF_W = 844;
export const REF_H = 390;
/** Smallest scale: below this the buttons would be too small to hit (about 0.68 of 44 px is 30 px). */
export const MIN_SCALE = 0.68;

/** The touch UI in landscape, short enough to need the compact layouts. */
export const isPhoneLandscape = (touchUi: boolean, w: number, h: number): boolean => touchUi && w > h && h <= 520;

/** 1 at 844 x 390 and bigger, down to MIN_SCALE; the tighter of height and width decides. Never above 1. */
export const phoneScale = (w: number, h: number): number => {
  const k = Math.min(h / REF_H, w / (REF_W * 0.9));
  return Math.round(Math.max(MIN_SCALE, Math.min(1, k)) * 100) / 100;
};

export const installPhoneUi = (): (() => void) => {
  const root = document.documentElement;
  const apply = () => {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    const phone = isPhoneLandscape(isTouchUi(), w, h);
    root.classList.toggle('lcs-phone', phone);
    root.style.setProperty('--ui', String(phone ? phoneScale(w, h) : 1));
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);
  const off = subscribe(apply);
  return () => {
    off();
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
    window.visualViewport?.removeEventListener('resize', apply);
  };
};
