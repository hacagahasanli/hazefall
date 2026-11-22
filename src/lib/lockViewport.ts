/**
 * Keeps the page from ever scaling or scrolling under a thumb. The meta viewport and `touch-action: none` do it on
 * Chrome; Safari on iPhone ignores user-scalable=no and fires its own pinch and double-tap zoom (also when the game runs
 * inside a portal's iframe, where it zooms the portal's page), so the gesture events and two-finger moves are cancelled here.
 */
export const lockViewport = (): void => {
  const stop = (e: Event) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      const scale = (e as TouchEvent & { scale?: number }).scale;
      if (e.touches.length > 1 && scale !== undefined && scale !== 1) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('dblclick', stop, { passive: false });
  // Double-tap zoom on a bare area: a second touch end within 350 ms of the last one, off any control, is cancelled.
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      const onControl = (e.target as HTMLElement | null)?.closest?.('button, a, input, select, textarea, [role="button"], [role="tab"], [role="radio"]');
      if (!onControl && now - lastEnd < 350) e.preventDefault();
      lastEnd = now;
    },
    { passive: false },
  );
  // Selecting text or dragging an image would start the magnifier or a drag ghost.
  document.addEventListener('selectstart', stop);
  document.addEventListener('contextmenu', stop);
};
