/**
 * A developer's performance readout: frame rate, frame time (average and worst over the last half second, plus the
 * main-thread time the frame took), and what the GPU was asked to draw in the last frame (draw calls and triangles from
 * `renderer.info`, shadow pass included), with the quality tier and the live geometry and texture counts.
 *
 * Off unless asked for: `?perf` in the address shows it from the start, and in a development build F8 toggles it. Nothing
 * is created until it is first shown, so a normal player (the portal build included) pays nothing for it.
 */
import type * as THREE from 'three';

export const perfRequested = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf');
export const PERF_KEY = 'F8';

export const createPerfOverlay = (renderer: THREE.WebGLRenderer, tierName: () => string) => {
  let el: HTMLDivElement | null = null;
  let on = false;
  let frames = 0;
  let sumMs = 0;
  let worstMs = 0;
  let sumCpu = 0;
  let since = 0;

  const show = (next: boolean) => {
    on = next;
    if (on && !el) {
      el = document.createElement('div');
      el.setAttribute('data-perf', '');
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        position: 'fixed', top: '112px', left: '12px', zIndex: '9999', pointerEvents: 'none',
        font: '11px/1.35 ui-monospace, Menlo, Consolas, monospace', color: '#e8ffe8', background: 'rgba(0,0,0,0.62)',
        padding: '4px 8px', borderRadius: '4px', whiteSpace: 'pre',
      });
      el.textContent = 'perf…';
      document.body.appendChild(el);
    }
    if (el) el.style.display = on ? 'block' : 'none';
  };

  return {
    get on() {
      return on;
    },
    toggle: () => show(!on),
    show,
    /** Once a frame, after rendering: dt is the time since the last frame (s), cpuMs what this frame took on the main thread. */
    frame: (dt: number, cpuMs: number) => {
      if (!on || !el) return;
      const ms = dt * 1000;
      frames += 1;
      sumMs += ms;
      sumCpu += cpuMs;
      worstMs = Math.max(worstMs, ms);
      since += dt;
      if (since < 0.5) return;
      const { calls, triangles } = renderer.info.render;
      const { geometries, textures } = renderer.info.memory;
      const avg = sumMs / frames;
      el.textContent =
        `${(1000 / avg).toFixed(0)} fps  ${avg.toFixed(1)} ms (worst ${worstMs.toFixed(1)}, cpu ${(sumCpu / frames).toFixed(1)})\n` +
        `${calls} calls  ${(triangles / 1000).toFixed(1)}k tris  ${geometries} geo  ${textures} tex  ${tierName()}`;
      frames = 0;
      sumMs = 0;
      sumCpu = 0;
      worstMs = 0;
      since = 0;
    },
    dispose: () => {
      el?.remove();
      el = null;
    },
  };
};
