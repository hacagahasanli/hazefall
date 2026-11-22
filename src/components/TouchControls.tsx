'use client';

import { useEffect, useRef, useState } from 'react';

import { PICKUP_ICON, RELOAD_ICON, SWAP_ICON } from '~/game/render/icons';
import { isTouchUi, subscribe } from '~/lib/device';
import { clusterZone as layoutZone, isPhoneLandscape, layoutPads, padSize, phoneScale, TOUCH_FLOOR, visiblePads } from '~/lib/phoneUi';
import type { PadId } from '~/lib/phoneUi';

import type { TouchButton } from '~/game/render/game';

type Press = (b: TouchButton, on: boolean) => void;

/** True on phones and tablets, as src/lib/device.ts decides (known only after mount). */
export const useTouch = () => {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(isTouchUi());
    return subscribe(() => setTouch(isTouchUi()));
  }, []);
  return touch;
};

/** The screen size and the phone UI scale (the same rule as installPhoneUi), following resizes and the visual viewport. */
const useScreen = () => {
  const read = () => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const w = Math.round(vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 844));
    const h = Math.round(vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 390));
    return { w, h, ui: isPhoneLandscape(true, w, h) ? phoneScale(w, h) : 1 };
  };
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const on = () => setScreen(read());
    on();
    window.addEventListener('resize', on);
    window.visualViewport?.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      window.visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  return screen;
};

/** Ask once for fullscreen: on Android it hides the browser bars and turns the phone sideways. */
let askedFullscreen = false;
/** Portals run the game in their own frame with their own fullscreen button: the game must not ask for it itself. */
export const disableAutoFullscreen = () => {
  askedFullscreen = true;
};
const goFullscreen = () => {
  if (askedFullscreen || typeof document === 'undefined') return;
  askedFullscreen = true;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!req || document.fullscreenElement) return;
  req({ navigationUI: 'hide' } as FullscreenOptions)
    .then(() =>
      (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.(
        'landscape',
      ),
    )
    .catch(() => undefined);
};

/**
 * The movement stick: analog, it appears where your thumb lands anywhere in the left half and
 * follows it if you drag past its rim, so you never run out of stick.
 */
const Stick = ({ onMove, right = false, opacity = 1 }: { onMove: (x: number, y: number) => void; right?: boolean; opacity?: number }) => {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const baseRef = useRef({ x: 0, y: 0 });
  const R = 54;

  const release = () => {
    pointer.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className={`absolute bottom-0 top-[calc(90px*var(--ui,1))] w-1/2 touch-none ${right ? 'right-0' : 'left-0'}`}
      style={{ opacity }}
      onPointerDown={(e) => {
        goFullscreen();
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        baseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        setBase(baseRef.current);
        setKnob({ x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const b = baseRef.current;
        let dx = e.clientX - r.left - b.x;
        let dy = e.clientY - r.top - b.y;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          // Drag the base along behind the thumb.
          b.x += (dx / d) * (d - R);
          b.y += (dy / d) * (d - R);
          setBase({ ...b });
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        setKnob({ x: dx, y: dy });
        // A small dead zone, then full speed comes quickly (running is what you want most).
        const m = Math.hypot(dx, dy) / R;
        const k = m < 0.12 ? 0 : Math.min(1, (m - 0.12) / 0.6) / Math.max(m, 1e-6);
        onMove((dx / R) * k, (dy / R) * k);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
    >
      {base ? (
        <div className="pointer-events-none absolute" style={{ left: base.x - R, top: base.y - R, zoom: 'var(--ui, 1)' } as React.CSSProperties}>
          <div
            className="rounded-full border-2 border-cream/25 bg-ink-deep/35"
            style={{ width: R * 2, height: R * 2 }}
          />
          <div
            className="absolute rounded-full bg-cream/75 shadow-lg"
            style={{ width: 54, height: 54, left: R - 27 + knob.x, top: R - 27 + knob.y }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute bottom-6 flex h-[calc(96px*var(--ui,1))] w-[calc(96px*var(--ui,1))] items-center justify-center rounded-full border-2 border-dashed border-cream/25 text-[10px] font-semibold uppercase tracking-widest text-cream/50"
          style={right ? { right: 'calc(20px + env(safe-area-inset-right))' } : { left: 'calc(20px + env(safe-area-inset-left))' }}
        >
          move
        </div>
      )}
    </div>
  );
};

const Pad = ({
  b,
  label,
  press,
  box,
  ready = 1,
  accent = false,
  sub,
  icon,
  right,
}: {
  b: TouchButton;
  label: string;
  /** An icon (24 × 24 path, see game/render/icons) shown instead of the label; the label stays as its accessible name. */
  icon?: string;
  /** A small second line under the label (what the button will use or draw). */
  sub?: string;
  press: Press;
  /** Centre from the bottom corner and diameter (CSS px), from layoutPads. */
  box: { x: number; y: number; size: number };
  ready?: number;
  accent?: boolean;
  /** Mirrored: the cluster is on the left (left-handed). */
  right: boolean;
}) => {
  const [down, setDown] = useState(false);
  const isDown = useRef(false);
  const up = () => {
    isDown.current = false;
    setDown(false);
    press(b, false);
  };
  // A button that hides while it is held (RELOAD once the magazine is full) must let go, or the game would hold it for good.
  useEffect(
    () => () => {
      if (isDown.current) press(b, false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [b],
  );
  const size = box.size;
  return (
    <button
      type="button"
      aria-label={label}
      data-touch-btn={b}
      className={`absolute flex touch-none select-none items-center justify-center rounded-full border-2 font-display uppercase shadow-lg transition-transform ${
        down
          ? 'scale-95 border-gold bg-gold/85 text-ink-deep'
          : accent
            ? 'border-gold/70 bg-ink-deep/60 text-gold'
            : 'border-cream/30 bg-ink-deep/55 text-cream/90'
      }`}
      style={{
        width: size,
        height: size,
        fontSize: size > 90 ? 18 : size > 60 ? 12 : 10,
        [right ? 'left' : 'right']: box.x - size / 2,
        bottom: box.y - size / 2,
      }}
      onPointerDown={(e) => {
        goFullscreen();
        e.currentTarget.setPointerCapture(e.pointerId);
        isDown.current = true;
        setDown(true);
        press(b, true);
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Recharging: dim, with a ring filling up round it. */}
      {ready < 1 && (
        <svg
          className="pointer-events-none absolute inset-0 -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle cx="50" cy="50" r="47" fill="rgba(10,13,24,0.55)" />
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="#ffd23f"
            strokeWidth="5"
            strokeDasharray={`${ready * 295} 295`}
          />
        </svg>
      )}
      <span className="relative flex flex-col items-center leading-none">
        {icon ? (
          <svg viewBox="0 0 24 24" aria-hidden className="h-[46%] w-[46%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        ) : (
          label
        )}
        {sub && <span className="mt-0.5 max-w-[48px] truncate font-sans text-[8px] normal-case opacity-80">{sub}</span>}
      </span>
    </button>
  );
};

/**
 * Phone controls ("thumb arc", spec 4.2): the stick anywhere in the left half; on the right, FIRE under the thumb (it aims by
 * itself at whoever you can see), ROLL, JUMP and SUPER (with its charge ring) around it, and the rest only when they can do
 * something: RELOAD, HEAL (named after what it will use), USE (pick up; hold to throw a bomb), SWAP (the other gun, when both
 * slots are full) and, with a sniper, SCOPE. On the plane only JUMP shows; in free fall OPEN and DIVE; under the canopy DIVE.
 * Every button is at least 44 px (FIRE and OPEN 72); where the cluster is short of room the gaps give way, never the sizes.
 */
export const TouchControls = ({
  press,
  onMove,
  onPause,
  onPlane,
  inAir = false,
  chute = false,
  superReady,
  rollReady,
  sniper = false,
  canReload = false,
  canUse = false,
  canSwap = false,
  swapLabel = null,
  heal = null,
  size = 1,
  opacity = 0.9,
  leftHanded = false,
}: {
  press: Press;
  onMove: (x: number, y: number) => void;
  onPause: () => void;
  onPlane: boolean;
  /** Out of the plane and still in the air: the roll button dives the canopy. */
  inAir?: boolean;
  /** The canopy has started to open: nothing to open any more, and nobody shoots under it, so FIRE goes. */
  chute?: boolean;
  superReady: number;
  rollReady: number;
  /** A sniper in hand: a SCOPE button to hold. */
  sniper?: boolean;
  /** The magazine is not full and there are rounds to load: a RELOAD button. */
  canReload?: boolean;
  /** Something to pick up within reach, or a bomb in hand: a USE button. */
  canUse?: boolean;
  /** Both gun slots full: a SWAP button, named after the gun it draws. */
  canSwap?: boolean;
  swapLabel?: string | null;
  /** What HEAL would use now (null: nothing to use, the button hides). */
  heal?: string | null;
  /** Settings: the buttons' scale and opacity, and left-handed (stick on the right, buttons on the left). */
  size?: number;
  opacity?: number;
  leftHanded?: boolean;
}) => {
  const { w, h, ui } = useScreen();
  const stage = onPlane ? 'plane' : inAir ? (chute ? 'canopy' : 'fall') : 'ground';
  const ids = visiblePads({ stage, canReload, canHeal: !!heal, canUse, canSwap, sniper });
  const boxes = layoutPads(ids, ui, size, w, h);
  const show = (id: PadId) => boxes[id];
  const box = (id: PadId) => boxes[id]!;
  const zone = layoutZone(ui, w, h);
  return (
    <div className="absolute inset-0 z-[5] select-none" style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}>
      <Stick onMove={onMove} right={leftHanded} opacity={opacity} />
      {/* The button cluster: every button given by its centre from the bottom corner and its size, inside the cluster zone. */}
      <div
        className="pointer-events-none absolute bottom-0"
        style={{
          width: zone.w,
          height: zone.h,
          ...(leftHanded ? { left: 'env(safe-area-inset-left)' } : { right: 'env(safe-area-inset-right)' }),
          opacity,
        }}
      >
        <span className="pointer-events-auto contents">
          {show('fire') && (
            <Pad b="fire" label={stage === 'plane' ? 'Jump' : stage === 'fall' ? 'Open' : 'Fire'} press={press} box={box('fire')} right={leftHanded} accent />
          )}
          {show('roll') && (
            <Pad b="roll" label={stage === 'ground' ? 'Roll' : 'Dive'} press={press} box={box('roll')} right={leftHanded} ready={rollReady} />
          )}
          {show('jump') && <Pad b="jump" label="Jump" press={press} box={box('jump')} right={leftHanded} />}
          {show('super') && (
            <Pad b="super" label="Super" press={press} box={box('super')} right={leftHanded} ready={superReady} accent={superReady >= 1} />
          )}
          {show('reload') && <Pad b="reload" label="Reload" icon={RELOAD_ICON} press={press} box={box('reload')} right={leftHanded} />}
          {show('heal') && <Pad b="heal" label="Heal" sub={heal ?? undefined} press={press} box={box('heal')} right={leftHanded} accent />}
          {/* Pick up (and hold to throw a bomb): an icon button. */}
          {show('use') && <Pad b="use" label="Pick up" icon={PICKUP_ICON} press={press} box={box('use')} right={leftHanded} />}
          {show('swap') && (
            <Pad b="swap" label={swapLabel ? `Swap to ${swapLabel}` : 'Swap guns'} icon={SWAP_ICON} press={press} box={box('swap')} right={leftHanded} />
          )}
          {show('scope') && <Pad b="scope" label="Scope" press={press} box={box('scope')} right={leftHanded} accent />}
        </span>
      </div>
      {/* Pause: just left of the minimap (hidden on the plane, where the big map takes the corner). */}
      {!onPlane && (
        <button
          type="button"
          aria-label="Pause"
          onClick={onPause}
          className="absolute flex items-center justify-center rounded-full border-2 border-cream/30 bg-ink-deep/60 text-cream"
          style={{
            width: padSize(40, ui, 1),
            height: padSize(40, ui, 1),
            right: 'calc(124px * var(--ui, 1) + 16px + env(safe-area-inset-right))',
            top: 8,
            minWidth: TOUCH_FLOOR,
            minHeight: TOUCH_FLOOR,
          }}
        >
          <span className="flex gap-1">
            <span className="h-3.5 w-1.5 rounded-sm bg-cream" />
            <span className="h-3.5 w-1.5 rounded-sm bg-cream" />
          </span>
        </button>
      )}
    </div>
  );
};
