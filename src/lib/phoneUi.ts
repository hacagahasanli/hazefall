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

/* ------------------------------------------------------------------------------------------------------------------ *
 * Touch buttons (spec 4.2): sizes, which buttons show, and where they sit. Pure, so it is tested; TouchControls draws it.
 * ------------------------------------------------------------------------------------------------------------------ */

export type PadId = 'fire' | 'roll' | 'jump' | 'super' | 'reload' | 'heal' | 'use' | 'swap' | 'crouch';

/** No touch button is smaller than this (CSS px); FIRE and OPEN, under the thumb, never under FIRE_FLOOR. */
export const TOUCH_FLOOR = 44;
export const FIRE_FLOOR = 72;
/** The least space between two round buttons. */
export const PAD_GAP = 6;
/** The cluster zone at scale 1 (from the bottom corner), and the shares of the screen it may never pass. */
export const CLUSTER_ZONE = { w: 360, h: 250, maxW: 0.46, maxH: 0.64 };

/** Thumb arc at scale 1 (844 x 390): each button's centre from the bottom corner, and its size. */
export const PAD_SPEC: Record<PadId, { x: number; y: number; size: number }> = {
  fire: { x: 76, y: 76, size: 100 },
  roll: { x: 180, y: 48, size: 60 },
  jump: { x: 158, y: 142, size: 60 },
  super: { x: 250, y: 104, size: 66 },
  reload: { x: 84, y: 186, size: 50 },
  heal: { x: 236, y: 198, size: 54 },
  use: { x: 320, y: 60, size: 56 },
  swap: { x: 322, y: 142, size: 50 },
  // Crouch (a toggle) on the free spot high in the arc; the sniper's SCOPE moved to the upper right (sidePads).
  crouch: { x: 160, y: 214, size: 54 },
};

/** rendered = max(floor, base * ui * size): the player's size setting can no longer push a button under the floor. */
export const padSize = (base: number, ui: number, size: number, floor = TOUCH_FLOOR): number => Math.max(floor, base * ui * size);

/** What the cluster must know to decide which buttons show. */
export interface PadContext {
  /** 'plane', 'fall' (free fall), 'canopy' (opening or open) or 'ground'. */
  stage: 'plane' | 'fall' | 'canopy' | 'ground';
  /** Magazine not full and rounds left to put in it. */
  canReload: boolean;
  /** A heal in the bag and hurt. */
  canHeal: boolean;
  /** Something to pick up within reach, or a bomb in hand to throw. */
  canUse: boolean;
  /** Both gun slots full. */
  canSwap: boolean;
  sniper: boolean;
}

/**
 * The buttons shown now, in a fixed order. Plane: JUMP only (the FIRE spot). Free fall: OPEN and DIVE. Canopy: DIVE (nobody
 * can shoot under the parachute, so no FIRE). Ground: FIRE, ROLL, JUMP, SUPER always; the rest only when they can do something.
 */
export const visiblePads = (c: PadContext): PadId[] => {
  if (c.stage === 'plane') return ['fire'];
  if (c.stage === 'fall') return ['fire', 'roll'];
  if (c.stage === 'canopy') return ['roll'];
  const out: PadId[] = ['fire', 'roll', 'jump', 'super'];
  if (c.canReload) out.push('reload');
  if (c.canHeal) out.push('heal');
  if (c.canUse) out.push('use');
  if (c.canSwap) out.push('swap');
  out.push('crouch');
  return out;
};

/**
 * The two buttons outside the thumb arc, the way battle-royale players know them: a second FIRE high on the stick's side
 * (left), so you can move and shoot with the left thumb while the right one aims and dodges, and SCOPE high on the right,
 * left of the pause button under the minimap. Both only on the ground (SCOPE only with a sniper). Boxes are given by their
 * centre from the TOP corner on their side (x from that side's edge, y from the top) and their diameter, in CSS px.
 *
 * Sizes follow the device: phones scale with `ui` (never under the floors), tablets (ui 1 on a tall screen) grow up to
 * 1.25x with the screen's short side, so a thumb finds them without looking on a 13" tablet too.
 */
export const SIDE_SPEC = { fire: { size: 78, floor: 60 }, scope: { size: 62, floor: TOUCH_FLOOR } };
export const deviceGrow = (ui: number, w: number, h: number) => (ui >= 1 ? Math.max(1, Math.min(1.25, Math.min(w, h) / 600)) : 1);
export const sidePads = (ui: number, size: number, w: number, h: number, sniper: boolean, stage: PadContext['stage']) => {
  if (stage !== 'ground') return { fire: null, scope: null };
  const k = deviceGrow(ui, w, h);
  const fire = Math.max(SIDE_SPEC.fire.floor, SIDE_SPEC.fire.size * ui * size * k);
  const scope = Math.max(SIDE_SPEC.scope.floor, SIDE_SPEC.scope.size * ui * size * k);
  // Left FIRE: below the health block (about 70 px at ui 1), at about 40 % of the height, never under the move hint.
  const fireY = Math.min(Math.max(70 * ui + fire / 2 + 12, h * 0.4), h * 0.62);
  // SCOPE: in the top right, just left of the minimap (112 px of map in 4 px of padding, 8 px in from the edge), level with
  // its middle: clear of the thumb arc below it and of the counters' pill in the middle of the top edge.
  const map = 112 * ui + 8;
  return {
    fire: { x: 18 + fire / 2, y: fireY, size: fire },
    scope: sniper ? { x: 8 + map + 12 + scope / 2, y: Math.max(scope / 2 + 8, 8 + map / 2), size: scope } : null,
  };
};

export interface PadBox {
  /** Centre from the bottom corner, and the diameter, all in CSS px. */
  x: number;
  y: number;
  size: number;
}

/** The cluster zone for a screen: 360 x 250 at scale 1 times ui, never over 46 % of the width or 64 % of the height. */
export const clusterZone = (ui: number, w: number, h: number) => ({
  w: Math.min(CLUSTER_ZONE.w * ui, w * CLUSTER_ZONE.maxW),
  h: Math.min(CLUSTER_ZONE.h * ui, h * CLUSTER_ZONE.maxH),
});

/**
 * Where each shown button goes. Sizes follow `padSize`; positions scale by ui only, then squeeze toward the corner (the gaps
 * give way, the sizes do not) until every button is inside the zone. Two buttons that still sit closer than PAD_GAP are pushed
 * apart along the line between them, back inside the zone.
 */
export const layoutPads = (ids: PadId[], ui: number, size: number, w: number, h: number): Partial<Record<PadId, PadBox>> => {
  // A big size setting on a small screen cannot fit nine buttons: it gives way (down to 1, never under the floors) until they fit.
  let s = size;
  let out = layoutPadsAt(ids, ui, s, w, h);
  while (s > 1 && !padsFit(ids, out)) {
    s = Math.max(1, s - 0.05);
    out = layoutPadsAt(ids, ui, s, w, h);
  }
  return out;
};

const padsFit = (ids: PadId[], out: Partial<Record<PadId, PadBox>>): boolean =>
  ids.every((a, i) =>
    ids.slice(i + 1).every((b) => {
      const p = out[a]!;
      const q = out[b]!;
      return Math.hypot(p.x - q.x, p.y - q.y) - (p.size + q.size) / 2 >= PAD_GAP - 0.5;
    }),
  );

const layoutPadsAt = (ids: PadId[], ui: number, size: number, w: number, h: number): Partial<Record<PadId, PadBox>> => {
  const zone = clusterZone(ui, w, h);
  const out: Partial<Record<PadId, PadBox>> = {};
  for (const id of ids) {
    const s = PAD_SPEC[id];
    out[id] = { x: s.x * ui, y: s.y * ui, size: padSize(s.size, ui, size, id === 'fire' ? FIRE_FLOOR : TOUCH_FLOOR) };
  }
  const boxes = ids.map((id) => out[id]!);
  // Squeeze: one factor per axis, the tightest button decides.
  let fx = 1;
  let fy = 1;
  for (const b of boxes) {
    fx = Math.min(fx, (zone.w - b.size / 2) / b.x);
    fy = Math.min(fy, (zone.h - b.size / 2) / b.y);
  }
  for (const b of boxes) {
    b.x *= fx;
    b.y *= fy;
  }
  // Relax: separate buttons that came closer than PAD_GAP (a few passes are enough for nine circles).
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const need = (a.size + c.size) / 2 + PAD_GAP;
        if (d >= need - 0.01) continue;
        const push = (need - d) / 2 + 0.01;
        // FIRE stays put (it is under the thumb); the other one takes the whole push.
        const [ma, mc] = i === 0 && ids[0] === 'fire' ? [0, 2] : [1, 1];
        a.x -= (dx / d) * push * ma;
        a.y -= (dy / d) * push * ma;
        c.x += (dx / d) * push * mc;
        c.y += (dy / d) * push * mc;
        moved = true;
      }
    }
    for (const b of boxes) {
      b.x = Math.max(b.size / 2, Math.min(zone.w - b.size / 2, b.x));
      b.y = Math.max(b.size / 2, Math.min(zone.h - b.size / 2, b.y));
    }
    if (!moved) break;
  }
  return out;
};

/* ------------------------------------------------------------------------------------------------------------------ *
 * Ground camera profile (spec 4.3): the phone sees the same world on a third of the pixels, so it sits closer.
 * ------------------------------------------------------------------------------------------------------------------ */

export type CameraKind = 'phone' | 'tablet' | 'desktop';

export interface CameraProfile {
  kind: CameraKind;
  /** Scales the ground camera's height and back distance (the desktop view is 1). */
  k: number;
  /** Where the fighter sits on the screen (0.5 = the middle): slightly up and left on a phone, away from the buttons. */
  fx: number;
  fy: number;
  /** Look-ahead: metres the way you face, and the cap on look-ahead as a whole. */
  face: number;
  cap: number;
}

/** The desktop ground camera: 36 m up and 22 m back at k = 1, FOV 42, looking at a point 1 m south of the fighter. */
export const GROUND_CAM = { up: 36, back: 22, fov: 42, aim: 1 };
/** Phone: short side of the screen 520 px or less. */
export const PHONE_SHORT = 520;

export const cameraProfile = (touch: boolean, w: number, h: number): CameraProfile => {
  if (!touch) return { kind: 'desktop', k: 1, fx: 0.5, fy: 0.5, face: 2.5, cap: 4 };
  if (Math.min(w, h) <= PHONE_SHORT) return { kind: 'phone', k: PHONE_K, fx: 0.46, fy: 0.46, face: 3, cap: 5 };
  return { kind: 'tablet', k: TABLET_K, fx: 0.48, fy: 0.48, face: 3, cap: 5 };
};
/** Tuned by the fighter's measured height on screen (see phoneUi.test.ts): about 7 to 8 % of the screen on a phone, 6 % on a tablet. */
export const PHONE_K = 0.68;
export const TABLET_K = 0.8;

/** A fighter this tall (m) is what the camera numbers are tuned for. */
export const FIGHTER_M = 1.8;

/**
 * How tall a fighter standing at the middle of the view is on screen, as a share of the viewport height, for the ground
 * camera at scale k (pinhole maths; feet and head projected, so the tilt is included).
 */
export const fighterShare = (k: number, aspect = 16 / 9, fov = GROUND_CAM.fov, height = FIGHTER_M): number => {
  const cam = { y: GROUND_CAM.up * k, z: GROUND_CAM.back * k };
  // The camera looks from (0, y, z) at (0, 0, aim): forward f, up u in the y-z plane.
  const fz = GROUND_CAM.aim - cam.z;
  const fy = -cam.y;
  const fl = Math.hypot(fy, fz);
  const f = { y: fy / fl, z: fz / fl };
  const u = { y: -f.z, z: f.y };
  const rel = (py: number) => {
    const dy = py - cam.y;
    const dz = 0 - cam.z;
    const depth = dy * f.y + dz * f.z;
    return (dy * u.y + dz * u.z) / depth / Math.tan((fov * Math.PI) / 360);
  };
  void aspect;
  // NDC y runs -1..1 over the viewport height, so the share is half the NDC difference.
  return Math.abs(rel(height) - rel(0)) / 2;
};

/** Auto-aim reach in metres: the farthest ground point of the desktop view (16:9) from the fighter. Computed once from the numbers above. */
export const autoAimReach = (aspect = 16 / 9): number => {
  const camY = GROUND_CAM.up;
  const camZ = GROUND_CAM.back;
  const fz = GROUND_CAM.aim - camZ;
  const fl = Math.hypot(-camY, fz);
  const f = { y: -camY / fl, z: fz / fl };
  const u = { y: -f.z, z: f.y };
  const th = Math.tan((GROUND_CAM.fov * Math.PI) / 360);
  let reach = 0;
  for (const nx of [-1, 1]) {
    for (const ny of [-1, 1]) {
      // Ray through that corner: forward + nx*th*aspect*right + ny*th*up; right is +x.
      const dy = f.y + ny * th * u.y;
      const dz = f.z + ny * th * u.z;
      const dx = nx * th * aspect;
      if (dy >= -1e-6) continue;
      const t = -camY / dy;
      reach = Math.max(reach, Math.hypot(dx * t, camZ + dz * t));
    }
  }
  return reach;
};

/** Auto-aim on touch: who is eligible depends on how far they are in the world, not on what the (zoomed) screen shows. */
export const inAutoAimReach = (dx: number, dy: number, reach: number): boolean => dx * dx + dy * dy <= reach * reach;

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
