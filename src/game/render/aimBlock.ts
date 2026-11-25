/**
 * The obstruction marker (third-person shooter standard): when the round's real line, from the muzzle to the crosshair's
 * point, meets a wall first, a small "blocked" ring (a circle with a slash) sits on screen where the wall will take it, and
 * the crosshair dims (HudState.aimBlocked). Lean out until the line is clear and it goes away. Drawn in the DOM each frame
 * (the React HUD updates at 10 Hz), static (nothing moves, so reducedMotion has nothing to calm).
 */
const NS = 'http://www.w3.org/2000/svg';
const PX = 22;

export const createAimBlockOverlay = (host: HTMLElement) => {
  const mark = document.createElementNS(NS, 'svg');
  mark.setAttribute('viewBox', '-12 -12 24 24');
  mark.setAttribute('aria-hidden', 'true');
  Object.assign(mark.style, { position: 'absolute', left: '0', top: '0', width: `${PX}px`, height: `${PX}px`, pointerEvents: 'none', zIndex: '2', display: 'none', willChange: 'transform' });
  for (const under of [true, false]) {
    const stroke = under ? 'rgba(10,13,24,0.8)' : '#fff';
    const width = under ? '4' : '1.8';
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '7');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', width);
    const l = document.createElementNS(NS, 'line');
    for (const [k, v] of [['x1', '-5'], ['y1', '5'], ['x2', '5'], ['y2', '-5']]) l.setAttribute(k, v);
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', width);
    l.setAttribute('stroke-linecap', 'round');
    mark.append(c, l);
  }
  host.appendChild(mark);
  let shown = false;
  return {
    /** At CSS pixel (x, y) of the host, `scale` 1 (or larger with the large HUD). */
    show: (x: number, y: number, scale = 1) => {
      mark.style.transform = `translate(${x - (PX * scale) / 2}px, ${y - (PX * scale) / 2}px) scale(${scale})`;
      mark.style.transformOrigin = '0 0';
      if (!shown) mark.style.display = 'block';
      shown = true;
    },
    hide: () => {
      if (shown) mark.style.display = 'none';
      shown = false;
    },
    dispose: () => mark.remove(),
  };
};
