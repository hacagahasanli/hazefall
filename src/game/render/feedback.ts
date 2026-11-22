/**
 * Screen-space hit feedback, drawn on a thin DOM layer over the canvas every frame (the React HUD
 * only updates 10 times a second, too slow for a 0.15 s marker):
 * - the hitmarker: an X when a hit of yours lands. First person it sits on the crosshair; from the
 *   high camera it sits on the person you hit. White for a hit, blue on armor, red for the kill. The hit that
 *   strips the vest and the kill also throw four short sparks outwards (there are no headshots in the sim).
 * - damage direction: a red arc near the screen's edge pointing to whoever just hit you, 0.8 s.
 * Render only: it reads what happened, never changes it.
 */

export type MarkKind = 'hit' | 'armor' | 'break' | 'kill';

export interface FeedbackLook {
  colorBlind: boolean;
  reducedMotion: boolean;
}

/** Marker colours; colour-blind mode swaps red for orange (blue stays: blue and orange tell apart). */
export const markColor = (kind: MarkKind, colorBlind: boolean) =>
  kind === 'kill' ? (colorBlind ? '#ff9f1c' : '#ff3048') : kind === 'armor' || kind === 'break' ? '#3ec5ff' : '#ffffff';
export const arcColor = (colorBlind: boolean) => (colorBlind ? '#ff9f1c' : '#ff2a3c');

/** How long each marker shows (s): a hit is a flick, a kill stays a moment longer. */
export const MARK_LIFE: Record<MarkKind, number> = { hit: 0.15, armor: 0.15, break: 0.22, kill: 0.3 };
/** How strongly each marker outranks another from the same burst. */
const MARK_RANK: Record<MarkKind, number> = { hit: 0, armor: 1, break: 2, kill: 3 };

/**
 * Hitstop for a hit YOU land (real seconds; render only, local only): a kill holds longest, a shotgun, sniper or rocket
 * a little, and the light guns a few milliseconds, at most once per `lightGap` so a spray never stutters.
 */
export const HITSTOP = { light: 0.028, heavy: 0.05, kill: 0.09, lightGap: 0.16 };
export const hitstopFor = (weapon: string, kill: boolean, sinceLast: number) =>
  kill ? HITSTOP.kill : weapon === 'shotgun' || weapon === 'sniper' || weapon === 'rockets' ? HITSTOP.heavy : sinceLast >= HITSTOP.lightGap ? HITSTOP.light : 0;

/** The flinch of whoever is hit: snaps away from the shot in 30 ms, then eases back (0..1 over FLINCH_LIFE seconds). */
export const FLINCH_LIFE = 0.16;
export const flinchCurve = (age: number) => {
  if (age < 0 || age >= FLINCH_LIFE) return 0;
  if (age < 0.03) return age / 0.03;
  const k = 1 - (age - 0.03) / (FLINCH_LIFE - 0.03);
  return k * k;
};
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
/** The marker's box on screen (px): 48 view units, a touch over a pixel each. */
const MARK_PX = 51;

export const createHitOverlay = (host: HTMLElement) => {
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2', overflow: 'hidden' });

  // The X: four strokes with a gap in the middle, each over a dark outline so it reads on sand and snow alike.
  const mark = document.createElementNS(NS, 'svg');
  mark.setAttribute('viewBox', '-24 -24 48 48');
  Object.assign(mark.style, { position: 'absolute', left: '0', top: '0', width: `${MARK_PX}px`, height: `${MARK_PX}px`, display: 'none', willChange: 'transform, opacity' });
  const strokes: SVGLineElement[] = [];
  for (const under of [true, false]) {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', String(sx * 4.5));
      l.setAttribute('y1', String(sy * 4.5));
      l.setAttribute('x2', String(sx * 12));
      l.setAttribute('y2', String(sy * 12));
      l.setAttribute('stroke-linecap', 'round');
      l.setAttribute('stroke-width', under ? '5' : '2.6');
      l.setAttribute('stroke', under ? 'rgba(10,13,24,0.8)' : '#fff');
      mark.appendChild(l);
      if (!under) strokes.push(l);
    }
  }
  // The burst for a kill or a stripped vest: four short sparks between the X's arms that fly out and fade.
  const sparks: { l: SVGLineElement; sx: number; sy: number }[] = [];
  for (const under of [true, false]) {
    for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('stroke-linecap', 'round');
      l.setAttribute('stroke-width', under ? '4' : '2');
      l.setAttribute('stroke', under ? 'rgba(10,13,24,0.7)' : '#fff');
      l.style.display = 'none';
      mark.appendChild(l);
      sparks.push({ l, sx, sy });
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
      // A stronger marker is never replaced by a weaker one from the same burst.
      if (marker.life > 0 && MARK_RANK[kind] < MARK_RANK[marker.kind] && (marker.kind !== 'armor' || marker.age < 0.06)) return;
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
          // A hard snap in (a third bigger for the first 50 ms), then it fades over its last 40 %.
          const pop = look.reducedMotion ? 1 : marker.age < 0.05 ? 1.33 - marker.age * 6.6 : 1;
          const size = (marker.kind === 'kill' ? 1.3 : 1) * pop;
          const fade = Math.min(1, marker.life / (MARK_LIFE[marker.kind] * 0.4));
          // The sparks fly out from just past the X (they stay put without motion).
          const burst = marker.kind === 'kill' || marker.kind === 'break';
          const t = Math.min(1, marker.age / MARK_LIFE[marker.kind]);
          const r0 = look.reducedMotion ? 13 : 10 + 8 * (1 - (1 - t) * (1 - t));
          for (const sp of sparks) {
            sp.l.style.display = burst ? 'block' : 'none';
            if (!burst) continue;
            sp.l.setAttribute('x1', (sp.sx * r0).toFixed(1));
            sp.l.setAttribute('y1', (sp.sy * r0).toFixed(1));
            sp.l.setAttribute('x2', (sp.sx * (r0 + 5)).toFixed(1));
            sp.l.setAttribute('y2', (sp.sy * (r0 + 5)).toFixed(1));
          }
          mark.style.display = 'block';
          mark.style.opacity = String(fade);
          const half = MARK_PX / 2;
          mark.style.transform = `translate(${(at.x - half).toFixed(1)}px, ${(at.y - half).toFixed(1)}px) scale(${size.toFixed(3)})`;
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
