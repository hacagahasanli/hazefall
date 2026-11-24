'use client';

/**
 * The in-round HUD pieces, laid out the way battle royale players expect: health and abilities bottom left, guns bottom
 * right over the minimap, players left and kills top right. Pictures over words: gun silhouettes, item icons, cooldown
 * rings with a tiny keycap. On a phone the thumbs own both bottom corners, so the same pieces sit compact at the top left.
 */

import type { ReactNode } from 'react';

import { GRADE_CSS } from '~/game/render/game';
import { FIGHTERS } from '~/game/sim/constants';
import type { HudState } from '~/game/render/game';
import type { FighterId, WeaponKind } from '~/game/sim/types';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** Side-view gun silhouettes on a 64 x 24 box, muzzle to the right. */
const GUN_PATHS: Record<WeaponKind, string> = {
  fists: 'M24 8h14a4 4 0 0 1 4 4v3a5 5 0 0 1-5 5H27a5 5 0 0 1-5-5v-5a2 2 0 0 1 2-2zM26 8v4M30 8v4M34 8v4M38 8v4',
  pistol: 'M17 6h31v5H35l-1 3h-3.5l-2.5 8h-8l3-11h-6zM30.5 11.5h-4l-.6 2.4c1.6.6 3.3.4 4.6-.4z',
  smg: 'M5 9h9V7h31v2h8v3h-8v1h-8l-1.4 9h-5l1.4-9h-6l-1.6 4h-4.6l1.2-4H14v2.5H5z',
  shotgun: 'M2 10.5 17 7h45v3H49v3.5H35V12h-4l-2 4.5h-4.5L26 12h-7L3.5 17.5z',
  rifle: 'M2 9.5h10V7h18V4.5h12V7h20v2.5H45V11h-7v1.5h-3.5l1.8 8.5h-5L29.5 12.5H26L24.8 16h-4.4l1.1-3.5H13L3.5 16z',
  sniper: 'M2 11.5 16 9h24v2h23v1.6H40V14H30l-2 4.5h-4.4L25 14h-7L3.5 17zM20 4h18v3.2H20zM25 7h2v2h-2zM31 7h2v2h-2z',
  rockets: 'M4 8h52l6-3v13l-6-3H4zM22 15h5l-1.2 6h-4.6zM34 15h5l-1 5h-4.4zM28 4h6v4h-6z',
};

export const GunIcon = ({ kind, color, className }: { kind: WeaponKind; color: string; className?: string }) => (
  <svg viewBox="0 0 64 24" className={className} aria-hidden>
    <path
      d={GUN_PATHS[kind]}
      fill={kind === 'fists' ? 'none' : color}
      stroke={kind === 'fists' ? color : 'rgba(10,13,24,0.7)'}
      strokeWidth={kind === 'fists' ? 2 : 0.8}
      strokeLinejoin="round"
      paintOrder="stroke"
    />
  </svg>
);

/** Small 16 x 16 line icons for what you carry and for the abilities. */
const Icon = ({ children, color = 'currentColor', size = 16, className }: { children: ReactNode; color?: string; size?: number; className?: string }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} className={className} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

const ITEM_ICONS = {
  bandage: (
    <>
      <rect x="1.5" y="5" width="13" height="6" rx="3" transform="rotate(-35 8 8)" />
      <path d="M7.3 8.5l1.4-1" strokeWidth={3.4} />
    </>
  ),
  medkit: (
    <>
      <rect x="1.5" y="4" width="13" height="10" rx="1.5" />
      <path d="M6 4V2.5h4V4M8 6.5v5M5.5 9h5" />
    </>
  ),
  coffee: (
    <>
      <path d="M2.5 6h9v4.5a3.5 3.5 0 0 1-3.5 3.5h-2a3.5 3.5 0 0 1-3.5-3.5z" />
      <path d="M11.5 7.5h1a1.8 1.8 0 0 1 0 3.6h-1.2M5 2.2v1.6M8 1.8v2" />
    </>
  ),
  bomb: (
    <>
      <circle cx="7" cy="9.5" r="4.8" />
      <path d="M10.3 6.2l1.6-1.6M12.5 2.5l.6-.6M13.2 4.6h.9M11 2v-.6" />
    </>
  ),
  vest: <path d="M5 1.5 3 3v11.5h4V10h2v4.5h4V3l-2-1.5L9.5 4h-3z" />,
  pack: (
    <>
      <rect x="3" y="4" width="10" height="10.5" rx="2.5" />
      <path d="M6 4V2.5h4V4M5.5 9h5v3h-5z" />
    </>
  ),
};

/** The supers, one picture each: a dash, a wall, a slowing field, a blast. */
const SUPER_ICONS: Record<FighterId, ReactNode> = {
  hotfix: <path d="M2 3.5 6.5 8 2 12.5M7.5 3.5 12 8l-4.5 4.5M12 3.5h2v9h-2" />,
  legacy: <path d="M1.5 3h13v10h-13zM1.5 6.3h13M1.5 9.7h13M6 3v3.3M10.5 6.3v3.4M6 9.7V13" />,
  // The slow-field canister: a round bomb with a clock face and a fuse lever.
  standup: (
    <>
      <circle cx="7.5" cy="9.5" r="5" />
      <path d="M7.5 7v2.6l1.8 1.2M6 4.5h3M7.5 4.5V3M10.2 3.6 13 1.6M12.4 4.4l1.6-.4" />
    </>
  ),
  intern: (
    <>
      <circle cx="8" cy="8" r="1.6" />
      <path d="M4.6 4.6a4.8 4.8 0 0 0 0 6.8M11.4 4.6a4.8 4.8 0 0 1 0 6.8M2.4 2.4a8 8 0 0 0 0 11.2M13.6 2.4a8 8 0 0 1 0 11.2" />
    </>
  ),
};
const ROLL_ICON = <path d="M3 10.5a5 5 0 1 1 3 3.9M3 10.5 1.5 7.8M3 10.5l2.8-1" />;

const PersonIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden fill="currentColor">
    <circle cx="8" cy="4" r="2.8" />
    <path d="M2.5 15c0-3.8 2.4-6.2 5.5-6.2s5.5 2.4 5.5 6.2z" />
  </svg>
);
const KillIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="8" cy="8" r="5.2" />
    <path d="M8 .8v3.4M8 11.8v3.4M.8 8h3.4M11.8 8h3.4" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

// ---------------------------------------------------------------------------
// Keycaps
// ---------------------------------------------------------------------------

/** A key's shortest readable name, for a keycap a few pixels wide. */
export const capLabel = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named: Record<string, string> = {
    ShiftLeft: '⇧', ShiftRight: '⇧', Space: '␣', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↵', Tab: '⇥', CapsLock: 'Caps', Backquote: '`',
  };
  return named[code] ?? code.replace(/^Numpad/, 'N').slice(0, 4);
};

const Cap = ({ k, className = '' }: { k: string; className?: string }) => (
  <kbd className={`inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-[3px] border border-b-2 border-cream/35 bg-ink-deep px-[3px] font-sans text-[9px] font-bold leading-none text-cream/90 ${className}`}>
    {k}
  </kbd>
);

// ---------------------------------------------------------------------------
// Health and shield
// ---------------------------------------------------------------------------

/**
 * One bar: a dark track, the fill, and a pale trail that lags behind a hit so you see how much you just lost. `step`
 * draws a notch every so many points (25 health, a vest's plates).
 */
const Meter = ({ value, max, color, height, step }: { value: number; max: number; color: string; height: number; step: number }) => {
  const k = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const notch = `${(step / Math.max(1, max)) * 100}%`;
  return (
    <div className="relative w-full overflow-hidden rounded-[2px] bg-ink-deep/80 ring-1 ring-black/40" style={{ height }}>
      <div className="absolute inset-y-0 left-0 bg-cream/55 transition-[width] delay-300 duration-500 ease-out" style={{ width: `${k * 100}%` }} />
      <div className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${k * 100}%`, background: color }}>
        <div className="absolute inset-x-0 top-0 h-1/3 bg-white/25" />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(${notch} - 2px), rgba(10,13,24,0.85) calc(${notch} - 2px) ${notch})` }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ability rings
// ---------------------------------------------------------------------------

const Ring = ({ value, color, icon, cap, label, size }: { value: number; color: string; icon: ReactNode; cap?: string; label: string; size: number }) => {
  const ready = value >= 1;
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${ready ? 'ready' : `${Math.floor(value * 100)}%`}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden style={ready ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined}>
        <circle cx="24" cy="24" r="23" fill="rgba(10,13,24,0.8)" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(230,235,245,0.14)" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={ready ? color : '#8b93ad'} strokeWidth="3" strokeLinecap={ready ? 'butt' : 'round'} strokeDasharray={`${Math.max(0, Math.min(1, value)) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon color={ready ? color : 'rgba(230,235,245,0.5)'} size={size * 0.42}>
          {icon}
        </Icon>
      </span>
      {cap && <Cap k={cap} className="absolute -bottom-1 -right-1" />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

const Count = ({ icon, n, of, color, dim }: { icon: ReactNode; n: number | string; of?: number; color?: string; dim?: boolean }) => (
  <span className={`flex items-center gap-0.5 rounded-[3px] bg-ink-deep/75 py-0.5 pl-1 pr-1.5 ${dim ? 'opacity-45' : ''}`} style={color ? { color } : { color: 'rgba(230,235,245,0.85)' }}>
    {icon}
    <span className="font-display text-[11px] leading-none text-cream">{n}</span>
    {of !== undefined && <span className="text-[9px] leading-none text-cream/45">/{of}</span>}
  </span>
);

const ROMAN = ['', 'I', 'II', 'III'];

/** Health (and the vest's shield over it), what you carry, and, on a keyboard, the super and roll rings beside it. */
export const Vitals = ({
  hud,
  colorBlind,
  rings,
  keys,
}: {
  hud: HudState;
  colorBlind: boolean;
  /** Show the cooldown rings (on a phone the buttons carry their own). */
  rings: boolean;
  keys: { super: string; roll: string } | null;
}) => {
  const f = FIGHTERS[hud.fighter];
  const low = hud.hp / hud.maxHp <= 0.35;
  const hpColor = low ? (colorBlind ? '#ff9f1c' : '#ff3d6e') : colorBlind ? '#3ec5ff' : '#3ddc84';
  const items: ReactNode[] = [];
  if (hud.vest > 0) items.push(<Count key="vest" icon={<Icon size={13} color={GRADE_CSS[hud.vest - 1]}>{ITEM_ICONS.vest}</Icon>} n={ROMAN[hud.vest]} />);
  if (hud.pack > 0) items.push(<Count key="pack" icon={<Icon size={13} color={GRADE_CSS[hud.pack - 1]}>{ITEM_ICONS.pack}</Icon>} n={ROMAN[hud.pack]} />);
  // Bandages, med kits and bombs always show as count / room (Reis, 2026-11-24), dimmed when there are none.
  items.push(<Count key="b" icon={<Icon size={13}>{ITEM_ICONS.bandage}</Icon>} n={hud.bag.bandages} of={hud.bag.cap.bandage} dim={hud.bag.bandages === 0} />);
  items.push(<Count key="m" icon={<Icon size={13}>{ITEM_ICONS.medkit}</Icon>} n={hud.bag.medkits} of={hud.bag.cap.medkit} dim={hud.bag.medkits === 0} />);
  if (hud.bag.coffees > 0) items.push(<Count key="c" icon={<Icon size={13}>{ITEM_ICONS.coffee}</Icon>} n={hud.bag.coffees} />);
  items.push(<Count key="x" icon={<Icon size={13}>{ITEM_ICONS.bomb}</Icon>} n={hud.bag.bombs} of={hud.bag.cap.bomb} dim={hud.bag.bombs === 0} />);
  if (hud.buzz > 0) items.push(<Count key="buzz" color="#ffd23f" icon={<Icon size={13} color="#ffd23f">{ITEM_ICONS.coffee}</Icon>} n={`${Math.ceil(hud.buzz)}s`} />);
  return (
    <div className="flex items-end gap-2.5">
      <div className={`flex flex-col gap-1 ${rings ? "w-52 sm:w-60" : "w-48 [@media(max-height:400px)]:w-40"}`}>
        {items.length > 0 && <div className="flex flex-wrap items-center gap-1">{items}</div>}
        <div className="flex items-end gap-2">
          <span className="w-11 text-right font-display text-2xl leading-[0.85] tabular-nums drop-shadow-[0_2px_0_rgba(10,13,24,0.8)]" style={{ color: low ? hpColor : '#e6ebf5' }}>
            {Math.ceil(hud.hp)}
          </span>
          <div className="flex flex-1 flex-col gap-[3px]">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[11px] leading-none" style={{ color: f.color }}>
                {f.name}
              </span>
              {hud.armor > 0 && <span className="font-display text-[10px] leading-none text-blue">{Math.ceil(hud.armor)}</span>}
            </div>
            {hud.vest > 0 && <Meter value={hud.armor} max={hud.vestMax} color="#3ec5ff" height={5} step={Math.max(1, hud.vestMax / (hud.vest + 1))} />}
            <Meter value={hud.hp} max={hud.maxHp} color={hpColor} height={12} step={25} />
          </div>
        </div>
      </div>
      {rings && (
        <div className="flex gap-2 pb-px">
          <Ring value={hud.superCharge} color="#ffd23f" icon={SUPER_ICONS[hud.fighter]} cap={keys?.super} label={hud.superName} size={44} />
          <Ring value={Math.min(1, hud.roll)} color="#3ec5ff" icon={ROLL_ICON} cap={keys?.roll} label="Roll" size={36} />
        </div>
      )}
    </div>
  );
};

/** The two gun slots, in key order: the one in your hands big with its magazine, the other small. */
export const Weapons = ({ hud, keys, compact }: { hud: HudState; keys: [string, string] | null; compact: boolean }) => (
  <div className={`flex ${compact ? 'flex-row items-end gap-1.5' : 'flex-col items-stretch gap-1'}`}>
    {hud.slots.map((sl, i) => {
      const color = sl.kind ? (sl.rarity > 0 ? GRADE_CSS[sl.rarity] : '#e6ebf5') : 'rgba(230,235,245,0.35)';
      const kind: WeaponKind | null = sl.kind ?? (sl.active ? 'fists' : null);
      if (!sl.active)
        return (
          <div
            key={i}
            className={`relative flex items-center gap-2 rounded-[3px] px-2 ${compact ? 'h-8 w-[5.5rem]' : 'h-9'} ${sl.kind ? 'bg-ink-deep/60' : 'border border-dashed border-cream/20 bg-ink-deep/30'}`}
            style={sl.kind ? { boxShadow: `inset 0 -2px 0 ${color}55` } : undefined}
            aria-label={sl.name ? `Slot ${i + 1}: ${sl.name}, ${sl.mag} of ${sl.ammo}` : `Slot ${i + 1} empty`}
          >
            {keys && <Cap k={keys[i]} className="opacity-70" />}
            {kind && <GunIcon kind={kind} color={color} className={`opacity-60 ${compact ? 'h-5 w-12' : 'h-6 w-16'}`} />}
            {sl.kind && <span className="ml-auto font-display text-sm leading-none text-cream/60">{sl.mag}</span>}
          </div>
        );
      const reloading = hud.reloading !== null;
      return (
        <div
          key={i}
          className={`panel-cut relative flex items-center gap-2 overflow-hidden bg-ink-deep/85 ${compact ? 'h-11 pl-2 pr-2.5' : 'h-[3.75rem] pl-2.5 pr-3'}`}
          style={{ boxShadow: `inset 0 -3px 0 ${sl.kind ? color : 'rgba(230,235,245,0.2)'}` }}
          aria-label={sl.name ? `Slot ${i + 1}: ${sl.name}, ${sl.mag} in the magazine, ${sl.ammo} spare` : 'Fists'}
        >
          {keys && <Cap k={keys[i]} className="absolute left-1.5 top-1.5" />}
          {kind && <GunIcon kind={kind} color={color} className={`${compact ? 'h-7 w-[4.5rem]' : 'mt-1 h-9 w-24'} ${keys ? 'ml-3' : ''}`} />}
          {sl.kind && (
            <span className="ml-auto flex items-baseline gap-1 leading-none">
              <span
                className={`font-display tabular-nums ${compact ? 'text-2xl' : 'text-[2rem]'} ${reloading ? 'text-gold/70' : sl.mag === 0 ? 'text-orange' : 'text-cream'}`}
              >
                {sl.mag}
              </span>
              <span className={`font-display ${compact ? 'text-[11px]' : 'text-sm'} ${sl.ammo === 0 ? 'text-orange/80' : 'text-cream/45'}`}>{sl.ammo}</span>
            </span>
          )}
          {reloading && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-ink-deep">
              <span className="block h-full bg-gold" style={{ width: `${hud.reloading! * 100}%` }} />
            </span>
          )}
        </div>
      );
    })}
  </div>
);

/** Players left and your kills, as two counters with a picture each. `pulse` lets the kill number jump when it rises. */
export const Counters = ({ alive, kills, pulse }: { alive: number; kills: number; pulse: boolean }) => (
  <div className="flex items-center gap-3">
    <span className="flex items-center gap-1.5" aria-label={`${alive} players left`}>
      <PersonIcon className="h-4 w-4 text-cream/70" />
      <span className="font-display text-xl leading-none text-cream">{alive}</span>
    </span>
    <span className="h-4 w-px bg-cream/20" />
    <span className="flex items-center gap-1.5" aria-label={`${kills} ${kills === 1 ? 'kill' : 'kills'}`}>
      <KillIcon className="h-4 w-4 text-orange" />
      <span key={kills} className={`inline-block font-display text-xl leading-none text-cream ${pulse && kills > 0 ? 'animate-[killPulse_0.5s_ease-out] motion-reduce:animate-none' : ''}`}>
        {kills}
      </span>
    </span>
  </div>
);

// Shared with the round report.
export const StatIcon = { kills: KillIcon, person: PersonIcon };
