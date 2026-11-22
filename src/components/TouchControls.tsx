'use client';

import { useEffect, useRef, useState } from 'react';

import { PICKUP_ICON, SWAP_ICON } from '~/game/render/icons';

import type { TouchButton } from '~/game/render/game';

type Press = (b: TouchButton, on: boolean) => void;

/** True on phones and tablets (known only after mount). */
export const useTouch = () => {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
  }, []);
  return touch;
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
  style,
  size = 68,
  ready = 1,
  accent = false,
  sub,
  icon,
}: {
  b: TouchButton;
  label: string;
  /** An icon (24 × 24 path, see game/render/icons) shown instead of the label; the label stays as its accessible name. */
  icon?: string;
  /** A small second line under the label (what the button will use or draw). */
  sub?: string;
  press: Press;
  style: React.CSSProperties;
  size?: number;
  ready?: number;
  accent?: boolean;
}) => {
  const [down, setDown] = useState(false);
  const up = () => {
    setDown(false);
    press(b, false);
  };
  return (
    <button
      type="button"
      aria-label={label}
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
        ...style,
      }}
      onPointerDown={(e) => {
        goFullscreen();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDown(true);
        press(b, true);
      }}
      onPointerUp={up}
      onPointerCancel={up}
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
 * Phone controls: the stick anywhere in the left half; on the right, FIRE under the thumb (it
 * aims by itself at whoever you can see; on the plane it is JUMP), ROLL beside it, a small pick-up
 * icon above it (pick up, hold to throw a bomb), then RELOAD, the SUPER with its charge ring, the two lean
 * buttons, a small swap icon (the other gun, when both slots are full), HEAL (named after what it will use), JUMP, and pause.
 */
export const TouchControls = ({
  press,
  onMove,
  onPause,
  onPlane,
  inAir = false,
  superReady,
  rollReady,
  sniper = false,
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
  superReady: number;
  rollReady: number;
  /** A sniper in hand: a SCOPE button to hold. */
  sniper?: boolean;
  /** Both gun slots full: a SWAP button, named after the gun it draws. */
  canSwap?: boolean;
  swapLabel?: string | null;
  /** What HEAL would use now (null: nothing to use, the button hides). */
  heal?: string | null;
  /** Settings: the buttons' scale and opacity, and left-handed (stick on the right, buttons on the left). */
  size?: number;
  opacity?: number;
  leftHanded?: boolean;
}) => (
  <div
    className="absolute inset-0 z-[5] select-none"
    style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
  >
    <Stick onMove={onMove} right={leftHanded} opacity={opacity} />
    {/*
      The button cluster, drawn for an 844 x 390 phone at scale 1 and scaled by the phone UI scale (--ui) and the player's
      size setting, from the bottom corner. Every button is given by its centre (from the corner) and its size: FIRE under
      the thumb, the others on two arcs round it, nothing above 236 px (the minimap ends at 132 px from the top).
    */}
    <div
      className="absolute bottom-0 h-[236px] w-[282px]"
      style={{
        ...(leftHanded ? { left: 'env(safe-area-inset-left)' } : { right: 'env(safe-area-inset-right)' }),
        opacity,
        transform: `scale(calc(${size} * var(--ui, 1)))`,
        transformOrigin: leftHanded ? 'bottom left' : 'bottom right',
      }}
    >
      <Pad b="fire" label={onPlane ? 'Jump' : 'Fire'} press={press} size={92} accent style={at(66, 66, 92, leftHanded)} />
      {!onPlane && (
        <>
          <Pad b="roll" label={inAir ? 'Dive' : 'Roll'} press={press} size={52} ready={rollReady} style={at(158, 50, 52, leftHanded)} />
          <Pad b="jump" label="Jump" press={press} size={52} style={at(142, 116, 52, leftHanded)} />
          <Pad b="reload" label="Reload" press={press} size={48} style={at(94, 152, 48, leftHanded)} />
          {/* Pick up (and hold to throw a bomb): a small icon button. */}
          <Pad b="use" label="Pick up" icon={PICKUP_ICON} press={press} size={46} style={at(30, 150, 46, leftHanded)} />
          {sniper && <Pad b="scope" label="Scope" press={press} size={56} accent style={at(36, 214, 56, leftHanded)} />}
          <Pad b="super" label="Super" press={press} size={58} ready={superReady} accent={superReady >= 1} style={at(212, 104, 58, leftHanded)} />
          {canSwap && <Pad b="swap" label={swapLabel ? `Swap to ${swapLabel}` : 'Swap guns'} icon={SWAP_ICON} press={press} size={42} style={at(222, 40, 42, leftHanded)} />}
          {heal && <Pad b="heal" label="Heal" sub={heal} press={press} size={50} accent style={at(188, 170, 50, leftHanded)} />}
          <Pad b="leanL" label="◀ Q" press={press} size={38} style={at(258, 196, 38, leftHanded)} />
          <Pad b="leanR" label="E ▶" press={press} size={38} style={at(258, 150, 38, leftHanded)} />
        </>
      )}
    </div>
    {/* Pause: just left of the minimap (hidden on the plane, where the big map takes the corner). */}
    {!onPlane && (
      <button
        type="button"
        aria-label="Pause"
        onClick={onPause}
        className="absolute flex items-center justify-center rounded-full border-2 border-cream/30 bg-ink-deep/60 text-cream"
        style={{
          width: 'calc(40px * var(--ui, 1))',
          height: 'calc(40px * var(--ui, 1))',
          right: 'calc(124px * var(--ui, 1) + 16px + env(safe-area-inset-right))',
          top: 8,
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

/** A button's place in the cluster from its centre (distance from the corner) and size; mirrored when left-handed. */
const at = (cx: number, cy: number, size: number, left: boolean): React.CSSProperties => ({
  [left ? 'left' : 'right']: cx - size / 2,
  bottom: cy - size / 2,
});
