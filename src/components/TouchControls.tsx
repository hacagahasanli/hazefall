'use client';

import { useEffect, useRef, useState } from 'react';

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
const Stick = ({ onMove }: { onMove: (x: number, y: number) => void }) => {
  const [base, setBase] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const baseRef = useRef({ x: 0, y: 0 });
  const R = 58;

  const release = () => {
    pointer.current = null;
    setBase(null);
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      className="absolute bottom-0 left-0 top-24 w-1/2 touch-none"
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
        <div className="pointer-events-none absolute" style={{ left: base.x - R, top: base.y - R }}>
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
          className="pointer-events-none absolute bottom-8 flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-cream/25 text-[10px] font-semibold uppercase tracking-widest text-cream/50"
          style={{ left: 'calc(20px + env(safe-area-inset-left))' }}
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
}: {
  b: TouchButton;
  label: string;
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
      <span className="relative leading-none">{label}</span>
    </button>
  );
};

/**
 * Phone controls: the stick anywhere in the left half; on the right, FIRE under the thumb (it
 * aims by itself at whoever you can see; on the plane it is JUMP), ROLL beside it, USE above it
 * (pick up, med kit, hold to throw a bomb), then RELOAD, the SUPER with its charge ring, the two
 * lean buttons, and pause.
 */
export const TouchControls = ({
  press,
  onMove,
  onPause,
  onPlane,
  superReady,
  rollReady,
}: {
  press: Press;
  onMove: (x: number, y: number) => void;
  onPause: () => void;
  onPlane: boolean;
  superReady: number;
  rollReady: number;
}) => (
  <div
    className="absolute inset-0 z-[5] select-none"
    style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
  >
    <Stick onMove={onMove} />
    <div
      className="absolute bottom-0 h-[300px] w-[260px]"
      style={{ right: 'env(safe-area-inset-right)' }}
    >
      <Pad
        b="fire"
        label={onPlane ? 'Jump' : 'Fire'}
        press={press}
        size={108}
        accent
        style={{ right: 16, bottom: 18 }}
      />
      {!onPlane && (
        <>
          <Pad
            b="roll"
            label="Roll"
            press={press}
            ready={rollReady}
            style={{ right: 136, bottom: 14 }}
          />
          <Pad b="use" label="Use" press={press} style={{ right: 36, bottom: 138 }} />
          <Pad
            b="reload"
            label="Reload"
            press={press}
            size={58}
            style={{ right: 124, bottom: 102 }}
          />
          <Pad
            b="super"
            label="Super"
            press={press}
            size={62}
            ready={superReady}
            accent={superReady >= 1}
            style={{ right: 118, bottom: 176 }}
          />
          <Pad b="leanL" label="◀ Q" press={press} size={46} style={{ right: 200, bottom: 160 }} />
          <Pad b="leanR" label="E ▶" press={press} size={46} style={{ right: 200, bottom: 104 }} />
        </>
      )}
    </div>
    {/* Pause: just left of the minimap (hidden on the plane, where the big map takes the corner). */}
    {!onPlane && (
      <button
        type="button"
        aria-label="Pause"
        onClick={onPause}
        className="absolute flex h-11 w-11 items-center justify-center rounded-full border-2 border-cream/30 bg-ink-deep/60 text-cream"
        style={{
          right: 'calc(min(120px, 28vh, 30vw) + 26px + env(safe-area-inset-right))',
          top: 10,
        }}
      >
        <span className="flex gap-1">
          <span className="h-4 w-1.5 rounded-sm bg-cream" />
          <span className="h-4 w-1.5 rounded-sm bg-cream" />
        </span>
      </button>
    )}
  </div>
);
