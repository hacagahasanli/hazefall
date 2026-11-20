/**
 * Screen-space hit feedback, drawn on a thin DOM layer over the canvas every frame (the React HUD
 * only updates 10 times a second, too slow for a 0.15 s marker):
 * - the hitmarker: an X when a hit of yours lands. First person it sits on the crosshair; from the
 *   high camera it sits on the person you hit. White for a hit, blue on armor, red for the kill.
 * - damage direction: a red arc near the screen's edge pointing to whoever just hit you, 0.8 s.
 * Render only: it reads what happened, never changes it.
 */

export type MarkKind = 'hit' | 'armor' | 'kill';

export interface FeedbackLook {
  colorBlind: boolean;
  reducedMotion: boolean;
}

/** Marker colours; colour-blind mode swaps red for orange (blue stays: blue and orange tell apart). */
export const markColor = (kind: MarkKind, colorBlind: boolean) =>
  kind === 'kill' ? (colorBlind ? '#ff9f1c' : '#ff3048') : kind === 'armor' ? '#3ec5ff' : '#ffffff';
export const arcColor = (colorBlind: boolean) => (colorBlind ? '#ff9f1c' : '#ff2a3c');

/** How long each marker shows (s): a hit is a flick, a kill stays a moment longer. */
export const MARK_LIFE: Record<MarkKind, number> = { hit: 0.15, armor: 0.15, kill: 0.26 };
export const ARC_LIFE = 0.8;

/**
 * Screen angle (radians, 0 = right, +PI/2 = down the screen) of a map direction (dx, dy).
 * High camera: map x runs right, map y runs down the screen. First person: relative to where you
 * look (`yaw`), straight ahead is up the screen.
 */
export const screenAngle = (dx: number, dy: number, yaw: number | null) => {
  const a = Math.atan2(dy, dx);
  return yaw === null ? a : a - yaw - Math.PI / 2;
};

/** An SVG arc path of `span` radians centred on `angle`, radius r round (cx, cy). */
export const arcPath = (cx: number, cy: number, r: number, angle: number, span: number) => {
  const a0 = angle - span / 2;
  const a1 = angle + span / 2;
  const f = (n: number) => n.toFixed(1);
  return `M${f(cx + Math.cos(a0) * r)} ${f(cy + Math.sin(a0) * r)}A${f(r)} ${f(r)} 0 0 1 ${f(cx + Math.cos(a1) * r)} ${f(cy + Math.sin(a1) * r)}`;
};

const NS = 'http://www.w3.org/2000/svg';

export const createHitOverlay = (host: HTMLElement) => {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2', overflow: 'hidden' });

  // The X: four strokes with a gap in the middle, each over a dark outline so it reads on sand and snow alike.
  const mark = document.createElementNS(NS, 'svg');
  mark.setAttribute('viewBox', '-16 -16 32 32');
  Object.assign(mark.style, { position: 'absolute', left: '0', top: '0', width: '34px', height: '34px', display: 'none', willChange: 'transform, opacity' });
  const strokes: SVGLineElement[] = [];
  for (const under of [true, false]) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', String(sx * 4.5));
      l.setAttribute('y1', String(sy * 4.5));
      l.setAttribute('x2', String(sx * 12));
      l.setAttribute('y2', String(sy * 12));
      l.setAttribute('stroke-linecap', 'round');
      l.setAttribute('stroke-width', under ? '5.5' : '3');
      l.setAttribute('stroke', under ? 'rgba(10,13,24,0.75)' : '#fff');
      mark.appendChild(l);
      if (!under) strokes.push(l);
    }
  }

  // The arcs: one full-screen SVG with a few reusable paths.
  const arcsSvg = document.createElementNS(NS, 'svg');
  Object.assign(arcsSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const arcs = Array.from({ length: 4 }, () => {
    const under = document.createElementNS(NS, 'path');
    const p = document.createElementNS(NS, 'path');
    for (const el of [under, p]) {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-linecap', 'round');
      el.style.display = 'none';
      arcsSvg.appendChild(el);
    }
    under.setAttribute('stroke', 'rgba(10,13,24,0.55)');
    under.setAttribute('stroke-width', '17');
    p.setAttribute('stroke-width', '11');
    return { under, p, life: 0, x: 0, y: 0, from: -1 };
  });

  layer.append(arcsSvg, mark);
  host.appendChild(layer);

  const marker = { kind: 'hit' as MarkKind, life: 0, age: 0, target: -1 };

  return {
    /** A hit of yours landed on `target` (a player index). */
    hit: (kind: MarkKind, target: number) => {
      // A kill or armor marker is never replaced by a plain hit from the same burst.
      if (marker.life > 0 && marker.kind === 'kill' && kind !== 'kill') return;
      if (marker.life > 0 && marker.kind === 'armor' && kind === 'hit' && marker.age < 0.06) return;
      Object.assign(marker, { kind, life: MARK_LIFE[kind], age: 0, target });
    },
    /** Someone at (x, y) on the map (player index `from`) hit you. */
    hurt: (from: number, x: number, y: number) => {
      // The same shooter refreshes their own arc; otherwise the oldest arc is reused.
      const slot = arcs.find((a) => a.life > 0 && a.from === from) ?? arcs.reduce((o, a) => (a.life < o.life ? a : o));
      Object.assign(slot, { life: ARC_LIFE, x, y, from });
    },
    /**
     * Draw. `self` is your own map position and where you are on the screen (px); `yaw` is your
     * look direction in first person, null from the high camera; `markAt` is where the marker goes
     * (the crosshair in first person, above the target from above), or null to hide it.
     */
    update: (
      dt: number,
      look: FeedbackLook,
      view: { self: { x: number; y: number; sx: number; sy: number }; yaw: number | null; markAt: (target: number) => { x: number; y: number } | null },
    ) => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      // Marker.
      if (marker.life > 0) {
        marker.life -= dt;
        marker.age += dt;
        const at = marker.life > 0 ? view.markAt(marker.target) : null;
        if (!at) {
          mark.style.display = 'none';
          if (marker.life <= 0) marker.target = -1;
        } else {
          const color = markColor(marker.kind, look.colorBlind);
          for (const l of strokes) l.setAttribute('stroke', color);
          // A quick pop in, then it fades over its last 40 %.
          const pop = look.reducedMotion ? 1 : 1 + Math.max(0, 0.07 - marker.age) * 6;
          const size = (marker.kind === 'kill' ? 1.35 : 1) * pop;
          const fade = Math.min(1, marker.life / (MARK_LIFE[marker.kind] * 0.4));
          mark.style.display = 'block';
          mark.style.opacity = String(fade);
          mark.style.transform = `translate(${(at.x - 17).toFixed(1)}px, ${(at.y - 17).toFixed(1)}px) scale(${size.toFixed(3)})`;
        }
      } else mark.style.display = 'none';

      // Arcs, near the edge, round where you are on the screen.
      const r = Math.min(w, h) * 0.4;
      const color = arcColor(look.colorBlind);
      for (const a of arcs) {
        if (a.life <= 0) continue;
        a.life -= dt;
        if (a.life <= 0) {
          a.under.style.display = a.p.style.display = 'none';
          continue;
        }
        const ang = screenAngle(a.x - view.self.x, a.y - view.self.y, view.yaw);
        const d = arcPath(view.self.sx, view.self.sy, r, ang, 0.62);
        const k = a.life / ARC_LIFE;
        // Full strength for the first half, then it fades out.
        const op = Math.min(1, k * 2);
        a.under.setAttribute('d', d);
        a.p.setAttribute('d', d);
        a.p.setAttribute('stroke', color);
        a.under.style.display = a.p.style.display = 'block';
        a.under.style.opacity = String(op * 0.8);
        a.p.style.opacity = String(op * 0.95);
      }
    },
    /** Hide everything at once (the round is over, or you went down). */
    clear: () => {
      marker.life = 0;
      mark.style.display = 'none';
      for (const a of arcs) {
        a.life = 0;
        a.under.style.display = a.p.style.display = 'none';
      }
    },
    dispose: () => layer.remove(),
  };
};
