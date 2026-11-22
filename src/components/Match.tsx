'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ComponentType } from 'react';

import { COPY } from '~/game/copy/studio';
import { GRADE_CSS, startMatch } from '~/game/render/game';
import { accentCss, headlineAt, itemById, MILESTONE_LINE, MILESTONES, nextReward, rewardLabel } from '~/game/cosmetics';
import { Chip, fighterHex } from '~/components/Chip';
import { xpToNext } from '~/game/progress';
import { FIGHTERS } from '~/game/sim/constants';

import { AimChoice, readAim, saveAim } from '~/components/AimChoice';
import { usePlatformRound } from '~/components/usePlatformRound';
import { useTelemetry } from '~/components/useTelemetry';
import { deviceFacts } from '~/game/render/deviceFacts';
import { resolveTier } from '~/game/render/quality';
import { keyLabel } from '~/game/settings';
import { SettingsPanel } from '~/components/SettingsPanel';
import { useSettings } from '~/components/useSettings';
import { lockReleaseOpensMenu, pauseKeyAction } from '~/game/pauseKeys';
import { createWebPlatform } from '~/platform/web';
import { TouchControls, useTouch } from '~/components/TouchControls';
import { useRotateBlock } from '~/lib/orientation';
import { ShockRing, Streaks } from '~/components/Transitions';
import { uiImpact, uiTick, uiWhoosh } from '~/components/uiSound';
import { capLabel, Counters, Vitals, Weapons } from '~/components/Hud';
import { createBootProgress } from '~/lib/bootProgress';
import { loadCount, onLoadCount } from '~/lib/loading';
import type { Look } from '~/game/cosmetics';
import type { Session } from '~/game/net/session';
import type { HudState } from '~/game/render/game';
import type { FighterId } from '~/game/sim/types';
import type { Platform } from '~/platform/types';
import type { RoundSummary } from '~/game/progress';

/** What the career adds to a round report. */
export interface RoundReport {
  /** One line of personal context under the stats (new best, first kill, ...). */
  line: string | null;
  /** After three rounds with one fighter: another to try (their name). */
  nudge?: string | null;
  /** XP, level and goals for the round: the lines count up, the bar fills, a new canopy shows. */
  summary?: RoundSummary;
}

const Key = ({ k }: { k: string }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-b-2 border-cream/30 bg-cream/10 px-1 text-[10px] font-bold leading-4 text-cream">
    {k}
  </kbd>
);

/** Seconds the "who took you out" card shows before the round report. */
const DEATH_CARD = 2.2;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The placement's colour: gold for the win, green for the last five, cream for the rest. */
const placeColor = (place: number) => (place === 1 ? '#ffd23f' : place <= 5 ? '#3ddc84' : '#e6ebf5');

/**
 * The placement on the round report, in the game's display face as a sticker: a hard dark drop under the numerals and a
 * slanted band behind them (red for a knock-out, gold for the win). It counts down from the last place to yours, then
 * lands with a hit and a ring (a win lands gold, with slow rays behind). Without motion it is simply there.
 */
const Placement = ({ place, total, won, fx }: { place: number; total: number; won: boolean; fx: boolean }) => {
  const [n, setN] = useState(fx ? total : place);
  const [landed, setLanded] = useState(!fx);
  useEffect(() => {
    if (!fx) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 520);
      setN(Math.round(total + (place - total) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        setLanded(true);
        uiImpact(won ? 1 : 0.55);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const color = landed ? placeColor(place) : '#e6ebf5';
  return (
    <div className="relative flex items-end gap-3 leading-none" aria-label={`Placed ${place} of ${total}`}>
      {won && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-[40%] top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-70"
          style={{
            background: 'repeating-conic-gradient(from 0deg, rgba(255,210,63,0.3) 0deg 7deg, transparent 7deg 22deg)',
            maskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 15%, transparent 68%)',
            animation: fx ? 'lcsRays 24s linear infinite' : undefined,
          }}
        />
      )}
      {landed && fx && <ShockRing color={won ? '#ffd23f' : '#ff3d6e'} size="16rem" duration={0.7} />}
      <span aria-hidden className="relative block">
        {/* The band behind the numerals. */}
        <span
          className="absolute -left-4 -right-5 bottom-[14%] top-[46%] -skew-x-12"
          style={{
            background: won ? 'linear-gradient(90deg,#1d2540,#141a2b)' : 'linear-gradient(90deg,#ff3d6e,#c42a55)',
            boxShadow: won ? 'inset 0 3px 0 #ffd23f, inset 0 -3px 0 #ffb020' : undefined,
            opacity: landed ? 0.95 : 0.4,
          }}
        />
        <span
          key={landed ? 'landed' : 'counting'}
          className={`relative flex items-start font-display text-[7rem] sm:text-[10rem] [@media(min-height:521px)_and_(max-height:640px)]:sm:text-[6.5rem] [@media(max-height:520px)]:text-[5rem] ${landed ? '' : 'opacity-70'}`}
          style={{
            color,
            textShadow: '0 0.045em 0 #0a0d18, 0 0.09em 0 rgba(10,13,24,0.55), 0 0.2em 0.5em rgba(0,0,0,0.45)',
            animation: landed && fx ? 'lcsLand 0.45s cubic-bezier(0.2,0.8,0.2,1) both' : undefined,
          }}
        >
          <span className="mr-[0.04em] mt-[0.12em] text-[0.45em]">#</span>
          {n}
        </span>
      </span>
      <span className="relative mb-[1rem] flex items-baseline gap-1.5 whitespace-nowrap text-cream/60 [@media(max-height:520px)]:mb-2">
        <span className="text-lg">of</span>
        <span className="font-display text-3xl leading-none text-cream/80">{total}</span>
      </span>
    </div>
  );
};

/**
 * The loading screen of a round that is not built behind the lobby (the site's rounds): a holo panel with the real
 * progress (the model files asked for and arrived since it opened), the plane crossing, and a rotating tip.
 */
const MatchLoading = ({ fx }: { fx: boolean }) => {
  const [c, setC] = useState({ done: 0, total: 0 });
  const [tip, setTip] = useState(() => Math.floor(Math.random() * COPY.tips.length));
  // One number drives both the bar and the percent: real checkpoints move it, it eases between them on every frame, never
  // goes back (more files asked for later only slow it down) and holds at 99 % until the round takes over.
  const progress = useMemo(() => createBootProgress(), []);
  const [shown, setShown] = useState({ value: 0, percent: 0 });
  useEffect(() => {
    const base = loadCount();
    // Building the map comes first (no files yet), then the models arrive one by one.
    const checkpoint = (done: number, total: number) => {
      if (total > 0) progress.reach(0.2 + (0.75 * done) / total, 0.2 + (0.75 * Math.min(total, done + 1)) / total);
      else progress.reach(0.05, 0.2);
    };
    checkpoint(0, 0);
    const off = onLoadCount((n) => {
      const done = n.done - base.done;
      const total = n.total - base.total;
      setC({ done, total });
      checkpoint(done, total);
    });
    const t = setInterval(() => setTip((i) => i + 1), 3600);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const value = progress.tick((now - last) / 1000);
      last = now;
      const percent = progress.percent();
      setShown((s) => (s.value === value && s.percent === percent ? s : { value, percent }));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      off();
      clearInterval(t);
      cancelAnimationFrame(raf);
    };
  }, [progress]);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#13213a,#0a0d18_60%,#05070e)] px-6" role="status" aria-live="polite">
      <div aria-hidden className="grid-bg absolute inset-0 opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.25)_0_1px,transparent_1px_3px)]" />
      {fx && <Streaks color="#3ec5ff" count={4} seed={7} />}
      <div className="relative flex w-full max-w-md flex-col gap-3">
        <div className="lcs-glitch-in font-display text-3xl leading-none text-gold sm:text-4xl" style={{ textShadow: '-3px 0 rgba(255,61,110,0.6), 3px 0 rgba(62,197,255,0.6)' }}>
          Loading the map
        </div>
        <div className="flex items-baseline justify-between text-sm text-cream/70">
          <span>{c.total > 0 ? `Models ${c.done} / ${c.total}` : 'Building the battleground'}</span>
          <span className="font-display text-xl tabular-nums text-cream">{shown.percent}%</span>
        </div>
        <div className="panel-cut relative h-3 overflow-hidden bg-cream/10">
          <div className="h-full origin-left bg-[linear-gradient(90deg,#3ddc84,#ffd23f)]" style={{ transform: `scaleX(${shown.value})` }} />
          <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_9px,#0a0d18_9px_12px)]" />
        </div>
        <p key={tip} className="min-h-10 text-sm text-cream/80 [animation:riseIn_0.4s_ease-out]">
          <span className="mr-2 font-display text-gold">›</span>
          {COPY.tips[tip % COPY.tips.length]}
        </p>
      </div>
    </div>
  );
};

/** The cup that crowns a win. */
const Trophy = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden>
    <path d="M14 6h20v10a10 10 0 0 1-20 0z" fill="#ffd23f" stroke="#0a0d18" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M14 9H7v3a8 8 0 0 0 8 8M34 9h7v3a8 8 0 0 1-8 8" fill="none" stroke="#0a0d18" strokeWidth="6" strokeLinecap="round" />
    <path d="M14 9H7v3a8 8 0 0 0 8 8M34 9h7v3a8 8 0 0 1-8 8" fill="none" stroke="#ffd23f" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M21 26h6v7h-6zM15 34h18v6H15z" fill="#ffb020" stroke="#0a0d18" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M18 9v6" stroke="#fff6c8" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const StatGlyph = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const STAT_BAND = {
  kills: 'linear-gradient(90deg,#ff3d6e,#c42a55)',
  damage: 'linear-gradient(90deg,#ffd23f,#d9a514)',
  survived: 'linear-gradient(90deg,#3ec5ff,#1f8fcf)',
};
type Stat = { key: keyof typeof STAT_BAND; label: string; value: string; color: string; count?: number };

/**
 * One stat on the round report: a smaller sibling of the placement sticker, a cream number with a hard drop on its own
 * slanted colour band as wide as the digits. Kills and damage count up as they land; a zero gets a grey band.
 */
const StatSticker = ({ stat, index, fx }: { stat: Stat; index: number; fx: boolean }) => {
  const d = 0.55 + index * 0.09;
  const zero = stat.count === 0;
  const [shown, setShown] = useState(fx && stat.count !== undefined ? '0' : stat.value);
  useEffect(() => {
    if (!fx || stat.count === undefined || stat.count === 0) return;
    const to = stat.count;
    let raf = 0;
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 500);
        setShown(String(Math.round(to * (1 - Math.pow(1 - k, 3)))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, (d + 0.08) * 1000);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div role="group" aria-label={`${stat.value} ${stat.label}`} className="relative flex flex-col items-start">
      <span aria-hidden className="relative inline-block">
        <span
          className="absolute"
          style={{
            left: '-0.22em',
            right: '-0.38em',
            top: '50%',
            bottom: '6%',
            transform: 'skewX(-12deg)',
            transformOrigin: 'left',
            background: zero ? 'rgba(230,235,245,0.10)' : STAT_BAND[stat.key],
            opacity: 0.92,
            animation: fx ? `lcsBandIn 0.26s cubic-bezier(0.2,0.8,0.2,1) ${d}s both` : undefined,
          }}
        />
        {/* The final value, invisible, sets the band width so it never grows while the number counts up. */}
        <span className="invisible relative block font-display tabular-nums leading-none text-[1.9rem] sm:text-5xl [@media(max-height:520px)]:text-[1.75rem]">{stat.value}</span>
        <span
          className={`absolute bottom-0 left-0 block font-display tabular-nums leading-none text-[1.9rem] sm:text-5xl [@media(max-height:520px)]:text-[1.75rem] ${zero ? 'text-cream/55' : 'text-cream'}`}
          style={{
            textShadow: '0 0.06em 0 #0a0d18, 0 0.12em 0 rgba(10,13,24,0.55), 0 0.25em 0.5em rgba(0,0,0,0.4)',
            transformOrigin: 'left bottom',
            animation: fx ? `lcsStatLand 0.38s cubic-bezier(0.2,0.8,0.2,1) ${d + 0.08}s both` : undefined,
          }}
        >
          {shown}
        </span>
      </span>
      <span
        className="mt-1.5 flex items-center gap-1.5 text-sm text-cream/65 [@media(max-height:520px)]:mt-1 [@media(max-height:520px)]:text-xs"
        style={fx ? { animation: `riseIn 0.35s ease-out ${d + 0.16}s both` } : undefined}
      >
        <span style={{ color: stat.color, opacity: zero ? 0.6 : 1 }} className="[&_svg]:h-3.5 [&_svg]:w-3.5">
          <StatGlyph d={STAT_ICON[stat.key]} />
        </span>
        {stat.label}
      </span>
    </div>
  );
};

const STAT_ICON = {
  kills: 'M8 2.8a5.2 5.2 0 1 0 0 10.4A5.2 5.2 0 1 0 8 2.8M8 .8v3.4M8 11.8v3.4M.8 8h3.4M11.8 8h3.4',
  damage: 'M8 1l1.6 4.2L14 4l-2.6 3.6L15 10l-4.4.2L11 15l-3-3.4L5 15l.4-4.8L1 10l3.6-2.4L2 4l4.4 1.2z',
  survived: 'M8 2.5a6 6 0 1 0 0 12 6 6 0 1 0 0-12M8 5.5v3.2l2.2 1.4M6.4 1h3.2',
};

/** A reward card on the round report: the chip, the item's name and kind, and a line on when it is on. Milestones (5, 10, 20) are bigger and gold. */
const RewardCard = ({ id, fighter, level, fx, first }: { id: string; fighter: FighterId; level: number | null; fx: boolean; first: boolean }) => {
  const item = itemById(id);
  if (!item) return null;
  const big = level !== null;
  const border = big ? '#ffc23d' : accentCss(item, fighter, fighterHex(fighter));
  return (
    <div className={`panel-cut flex flex-col gap-1 bg-ink-deep px-3 py-2.5 ${big ? 'w-full' : ''}`} style={{ border: `2px solid ${border}`, animation: fx ? 'riseIn 0.3s ease-out both' : undefined }}>
      {big && <p className="font-display text-sm text-gold">Level {level} reward</p>}
      <div className="flex items-center gap-3">
        <span className="relative">
          <Chip item={item} fighter={fighter} w={big ? 96 : 64} h={big ? 56 : 40} sweep={fx} />
          {big && fx && (
            <span aria-hidden className="pointer-events-none absolute inset-0">
              {Array.from({ length: 14 }, (_, i) => {
                const a = (i / 14) * Math.PI * 2;
                const d = 52 + (i % 3) * 14;
                return (
                  <span
                    key={i}
                    className="lcs-burst absolute left-1/2 top-1/2 h-1.5 w-1.5"
                    style={{ background: i % 2 ? '#ffc23d' : FIGHTERS[fighter].color, ['--bx' as string]: `${Math.cos(a) * d}px`, ['--by' as string]: `${Math.sin(a) * d}px`, animation: 'burstOut 0.8s ease-out both' }}
                  />
                );
              })}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-xl leading-tight text-cream">{big ? MILESTONE_LINE[level] : rewardLabel(item)}</span>
          <span className="text-sm text-cream/70">On for your next drop.</span>
          {first && <span className="text-sm text-cream/70">Everyone can see it. Nobody gets stronger.</span>}
        </div>
      </div>
    </div>
  );
};

/**
 * What the round earned: one line per source of XP counting in (0.15 s apart), then the level's bar. On a level-up the bar
 * fills to full, flashes, refills from 0, the level number pops and the reward card rises in (milestones get a bigger gold
 * one). Without a level-up a line under the bar names the next reward. Without motion it is all simply there.
 */
const XpPanel = ({ summary, fx, fighter }: { summary: RoundSummary; fx: boolean; fighter: FighterId }) => {
  const { lines, before, after, levelUps, newItems } = summary;
  const leveled = levelUps.length > 0;
  const need = xpToNext(after.level);
  const [fill, setFill] = useState(fx ? before.xp / xpToNext(before.level) : after.xp / need);
  const [level, setLevel] = useState(fx && leveled ? before.level : after.level);
  const [flash, setFlash] = useState(false);
  const [snap, setSnap] = useState(false);
  const [pop, setPop] = useState(false);
  const [cards, setCards] = useState(!fx);
  const milestone = levelUps.find((l) => MILESTONES.includes(l)) ?? null;
  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    const showCards = () => {
      setCards(true);
      if (milestone !== null) {
        uiWhoosh();
        window.setTimeout(() => uiImpact(0.8), 120);
      } else if (newItems.length > 0) uiImpact(0.4);
    };
    if (!fx) {
      if (newItems.length > 0) showCards();
      return;
    }
    const t0 = 150 * lines.length + 900;
    if (!leveled) {
      at(t0, () => setFill(after.xp / need));
      if (newItems.length > 0) at(t0 + 700, showCards);
    } else {
      at(t0, () => setFill(1));
      at(t0 + 700, () => setFlash(true));
      at(t0 + 850, () => {
        setFlash(false);
        setSnap(true);
        setFill(0);
        setLevel(after.level);
        setPop(true);
        uiTick(true);
      });
      at(t0 + 900, () => {
        setSnap(false);
        setFill(after.xp / need);
      });
      at(t0 + 1150, showCards);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (i: number) => (fx ? { animation: `riseIn 0.3s ease-out ${0.85 + i * 0.15}s both` } : undefined);

  // The cards: a milestone's headline first, at most two, then how many are left in Style.
  const head = milestone !== null ? headlineAt(milestone)?.id : undefined;
  const ordered = head && newItems.includes(head) ? [head, ...newItems.filter((id) => id !== head)] : newItems;
  const shown = ordered.slice(0, 2);
  const next = !leveled ? nextReward(after.level) : null;
  return (
    <div className="flex max-w-sm flex-col gap-1 pl-2 [@media(max-height:640px)_and_(min-width:640px)]:max-w-none" aria-label="Experience earned">
      <ul className="flex flex-col gap-0.5 text-sm [@media(max-height:640px)_and_(min-width:720px)]:grid [@media(max-height:640px)_and_(min-width:720px)]:grid-cols-2 [@media(max-height:640px)_and_(min-width:720px)]:gap-x-6 [@media(max-height:640px)_and_(min-width:640px)]:text-xs">
        {lines.map((l, i) => (
          <li key={l.label} className={`flex items-baseline justify-between gap-6 [@media(max-height:640px)_and_(min-width:640px)]:gap-3 ${l.goal ? 'font-semibold text-gold' : 'text-cream/75'}`} style={at(i)}>
            <span>{l.label}</span>
            <span className="font-display tabular-nums">+{l.xp}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-3 text-sm text-cream/80" style={at(lines.length)}>
        <span className={`inline-block whitespace-nowrap font-display ${pop ? 'text-gold' : ''}`} style={pop && fx ? { animation: 'levelPop 0.25s ease-out both' } : undefined}>
          Level {level}
        </span>
        <div className="h-2 flex-1 overflow-hidden bg-cream/10">
          <div className={`h-full ${snap ? '' : 'transition-[width] duration-700 ease-out'}`} style={{ width: `${Math.round(fill * 100)}%`, background: flash ? '#fff0b0' : 'var(--color-gold)' }} />
        </div>
        <span className="whitespace-nowrap tabular-nums text-cream/60">{after.xp}/{need} XP</span>
      </div>
      {next && (
        <p className={`text-sm ${next.milestone ? 'text-gold' : 'text-cream/60'}`} style={at(lines.length + 1)}>
          {next.text}
        </p>
      )}
      <div className="flex flex-col gap-2" aria-live="polite">
        {cards &&
          shown.map((id) => (
            <RewardCard key={id} id={id} fighter={fighter} level={id === head ? milestone : null} fx={fx} first={before.level === 1 && id === shown[0]} />
          ))}
        {cards && ordered.length > 2 && <p className="text-sm text-cream/70">+{ordered.length - 2} more in Style</p>}
      </div>
    </div>
  );
};

/**
 * The round report: where you placed, who took you out and with what, and how your round went,
 * then straight into the next match or back to the lobby.
 */
const Result = ({
  hud,
  fighter,
  onPlayAgain,
  onExit,
  online,
  Support,
  exitLabel,
  fx,
  report,
}: {
  hud: HudState;
  /** The fighter played (an outfit reward is shown on them). */
  fighter: FighterId;
  onPlayAgain: () => void;
  onExit: () => void;
  online: boolean;
  Support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  exitLabel: string;
  /** Motion on (the game's reduced-motion setting off). */
  fx: boolean;
  /** What the career adds to this round's report (the portal build's offline rounds). */
  report: RoundReport | null;
}) => {
  // The host's browser runs the round: it must stay until the round is over.
  const hostWaits = online && hud.host && hud.phase !== 'over';
  const place = hud.won ? 1 : hud.placement;
  const stats: Stat[] = [
    { key: 'kills', label: hud.kills === 1 ? 'Kill' : 'Kills', value: String(hud.kills), color: '#ff3d6e', count: hud.kills },
    { key: 'damage', label: 'Damage', value: String(hud.damage), color: '#ffd23f', count: hud.damage },
    { key: 'survived', label: 'Survived', value: fmtTime(hud.survived), color: '#3ec5ff' },
  ];
  const killerColor = hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff';
  const accent = hud.won ? '#ffd23f' : '#ff3d6e';
  return (
    <div className="absolute inset-0 z-30 flex animate-[fadeIn_0.35s_ease-out] overflow-y-auto overflow-x-hidden bg-[radial-gradient(ellipse_at_30%_40%,rgba(20,26,43,0.7),rgba(10,13,24,0.95))] px-6 py-4 backdrop-blur-sm">
      {/* The report comes in on a slash of light, gold for a win and red for a loss, and a few streaks. */}
      {fx && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[-20%] left-0 w-[45vw]"
            style={{ background: `linear-gradient(90deg, transparent, ${hud.won ? 'rgba(255,210,63,0.35)' : 'rgba(255,61,110,0.3)'}, transparent)`, animation: 'lcsSweep 0.7s cubic-bezier(0.6,0,0.3,1) both' }}
          />
          <Streaks color={accent} count={hud.won ? 10 : 6} seed={hud.placement} />
        </>
      )}
      {/* A win: a warm gold light from above. */}
      {hud.won && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,210,63,0.22),transparent_70%)]" />}
      <div className="relative m-auto flex w-full max-w-3xl flex-col gap-7 [@media(max-height:520px)]:gap-3 [@media(max-height:640px)_and_(min-width:640px)]:grid [@media(max-height:640px)_and_(min-width:640px)]:max-w-5xl [@media(max-height:640px)_and_(min-width:640px)]:grid-cols-2 [@media(max-height:640px)_and_(min-width:640px)]:content-center [@media(max-height:640px)_and_(min-width:640px)]:gap-x-8 [@media(max-height:640px)_and_(min-width:640px)]:gap-y-3">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 [@media(max-height:520px)]:gap-y-2 [@media(max-height:640px)_and_(min-width:640px)]:col-start-1">
          <div className="flex flex-col items-start">
            {hud.won && (
              <Trophy
                className="mb-1 ml-2 h-16 w-16 drop-shadow-[0_0_24px_rgba(255,210,63,0.6)] sm:h-20 sm:w-20 [@media(min-height:521px)_and_(max-height:640px)]:sm:h-10 [@media(min-height:521px)_and_(max-height:640px)]:sm:w-10 [@media(max-height:520px)]:h-8 [@media(max-height:520px)]:w-8"
                style={fx ? { animation: 'lcsLand 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.55s both' } : undefined}
              />
            )}
            <Placement place={place} total={hud.total} won={hud.won} fx={fx} />
          </div>
          <div className="flex max-w-sm flex-col gap-2 pb-4 [@media(max-height:520px)]:pb-1 [@media(max-height:640px)_and_(min-width:640px)]:max-w-none">
            <h2
              className={`font-display text-3xl leading-none sm:text-[2.6rem] [@media(min-height:521px)_and_(max-height:640px)]:sm:text-3xl [@media(max-height:520px)]:text-2xl ${fx ? 'lcs-glitch-in' : ''}`}
              style={{ color: hud.won ? '#ffd23f' : '#e6ebf5', ...(fx ? { animationDelay: '0.45s' } : {}) }}
            >
              {hud.won ? COPY.result.won : COPY.result.lost}
            </h2>
            <p className="text-lg leading-snug text-cream/80">
              {hud.won ? (
                <>{COPY.result.wonLine(hud.total - 1)}</>
              ) : hud.killedBy ? (
                <>
                  Taken out by{' '}
                  <b className="font-display" style={{ color: killerColor }}>
                    {hud.killedBy}
                  </b>{' '}
                  with {hud.killedWith}.
                </>
              ) : (
                <>Caught outside by {hud.killedWith ?? COPY.zone.name}.</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 [@media(max-height:640px)_and_(min-width:640px)]:contents">
          <div className="grid grid-cols-[auto_auto_auto] items-end justify-between justify-items-start gap-x-4 gap-y-2 pl-2 sm:grid-cols-3 sm:justify-normal sm:gap-x-10 [@media(max-height:640px)_and_(min-width:640px)]:col-start-1 [@media(max-height:640px)_and_(min-width:640px)]:gap-x-6">
            {stats.map((st, i) => (
              <StatSticker key={st.key} stat={st} index={i} fx={fx} />
            ))}
          </div>
          <div className="flex flex-col gap-2 [@media(max-height:640px)_and_(min-width:640px)]:col-start-2 [@media(max-height:640px)_and_(min-width:640px)]:row-span-4 [@media(max-height:640px)_and_(min-width:640px)]:row-start-1 [@media(max-height:640px)_and_(min-width:640px)]:self-center">
            {report?.summary && <XpPanel summary={report.summary} fx={fx} fighter={fighter} />}
            {report?.line && <p className="animate-[riseIn_0.5s_ease-out_0.7s_both] pl-2 text-lg font-semibold text-gold">{report.line}</p>}
            {report?.nudge && <p className="animate-[riseIn_0.5s_ease-out_0.72s_both] pl-2 text-sm text-cream/75">{report.nudge}</p>}
            <p className="animate-[riseIn_0.5s_ease-out_0.75s_both] text-sm text-cream/55">
              Accuracy <b className="font-semibold text-cream/85">{hud.accuracy}%</b>
              <span className="mx-2 text-cream/25">·</span>
              <b className="font-semibold text-cream/85">{hud.distance} m</b> on foot
            </p>
          </div>
        </div>

        {hostWaits && (
          <p className="text-sm text-cream/70 [@media(max-height:640px)_and_(min-width:640px)]:col-start-1">
            You are the host: the round runs on your device, so it goes on for the others until
            there is a winner. {hud.alive} still standing.
          </p>
        )}
        <div className="flex flex-wrap gap-3 [animation:riseIn_0.4s_ease-out_0.8s_both] max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-6 max-sm:bg-ink-deep/95 max-sm:px-6 max-sm:py-3 [@media(max-height:640px)_and_(min-width:640px)]:col-start-1 [@media(max-height:500px)_and_(min-width:640px)]:flex-nowrap [@media(max-height:500px)_and_(min-width:640px)]:gap-2">
          <button
            type="button"
            autoFocus
            disabled={hostWaits}
            onClick={onPlayAgain}
            className="panel-cut bg-gold px-10 [@media(max-height:500px)_and_(min-width:640px)]:px-4 py-3.5 whitespace-nowrap font-display text-xl [@media(max-height:500px)_and_(min-width:640px)]:text-lg text-ink-deep shadow-[0_6px_0_#b8901c] transition hover:brightness-110 active:translate-y-[3px] active:shadow-[0_3px_0_#b8901c] disabled:opacity-40 [@media(max-height:520px)]:py-2.5"
          >
            {online ? 'Back to the room' : 'Play again'}
          </button>
          {!online && (
            <button
              type="button"
              onClick={onExit}
              className="panel-cut bg-cream/10 px-8 [@media(max-height:500px)_and_(min-width:640px)]:px-3 py-3.5 whitespace-nowrap font-display text-lg [@media(max-height:500px)_and_(min-width:640px)]:text-base text-cream/90 transition hover:bg-cream/20 disabled:opacity-40 [@media(max-height:520px)]:py-2.5"
            >
              {exitLabel}
            </button>
          )}
        </div>
        {Support && (
          <div className="[animation:riseIn_0.45s_ease-out_1s_both] [@media(max-height:640px)_and_(min-width:640px)]:col-start-1">
            <Support variant="card" />
          </div>
        )}
      </div>
    </div>
  );
};

export const Match = ({
  fighter,
  session,
  onExit,
  onPlayAgain,
  platform: platformProp,
  support: Support,
  credit,
  exitLabel = 'Back to lobby',
  held = false,
  onLoaded,
  rookie = false,
  firstRound = false,
  look,
  onRoundEnd,
}: {
  fighter: FighterId;
  session?: Session;
  onExit: () => void;
  onPlayAgain: () => void;
  /** The page's platform (a portal SDK); our own site gets the no-op web adapter. */
  platform?: Platform;
  /** The site's support link (the only outbound link in a round). Left out in the portal build: portals allow none. */
  support?: ComponentType<{ variant?: 'pill' | 'card' | 'menu' }>;
  /** A studio credit line in the pause menu. */
  credit?: string;
  /** The report's second button, and the pause menu's way out. */
  exitLabel?: string;
  /** Built behind the pre-match screen: loads, then waits frozen and silent until this turns false. */
  held?: boolean;
  /** The map is built and the first frames are drawn (the pre-match screen may launch). */
  onLoaded?: () => void;
  /** A new player's first rounds: gentler bots (see `NEWBIE`). */
  rookie?: boolean;
  /** The very first round: no sentence on the plane's title card, no key legend (the keys show up when they matter). */
  firstRound?: boolean;
  /** What you wear, picked in the lobby (outfit, gun finish, canopy, smoke). */
  look?: Look;
  /** Called once when the round report comes up (offline rounds); what it returns is shown on the report. */
  onRoundEnd?: (hud: HudState) => RoundReport | null;
}) => {
  const heldRef = useRef(held);
  heldRef.current = held;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const online = !!session?.online;
  const platform = useMemo(() => platformProp ?? createWebPlatform(), [platformProp]);
  const [settings, setSettings] = useSettings(platform.storage);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Larger HUD text (accessibility): the HUD blocks are zoomed as a whole, so nothing reflows. */
  const hudZoom = `calc(${settings.largeHud ? 1.25 : 1} * var(--ui, 1))`;

  const [game, setGame] = useState<ReturnType<typeof startMatch> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  /** The health bar's box, so the big drop minimap on a phone can sit 8 px below it. */
  const vitalsRef = useRef<HTMLDivElement>(null);
  const [mapTop, setMapTop] = useState<number | null>(null);
  /** Where the Deadline pill goes on a phone while the big drop map is up: 8 px under it. */
  const [pillTop, setPillTop] = useState<number | null>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof startMatch> | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const touch = useTouch();
  // Held upright, a touch screen shows the rotate card (portal/index.html); the round waits in the pause menu behind it.
  const rotateBlocked = useRotateBlock();
  useEffect(() => {
    if (rotateBlocked && !online && !heldRef.current) setMenuOpen(true);
  }, [rotateBlocked, online]);
  const inPlane = hud?.stage === 'drone';
  useLayoutEffect(() => {
    // On a phone the big drop map starts 8 px under the health bar (it used to run underneath it).
    const el = vitalsRef.current;
    if (!touch || !inPlane || !el) {
      setMapTop(null);
      return;
    }
    const measure = () => setMapTop(Math.round(el.getBoundingClientRect().bottom + 8));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [touch, inPlane, hudZoom, hud != null]);
  useLayoutEffect(() => {
    const el = mapBoxRef.current;
    setPillTop(touch && inPlane && el && mapTop !== null && window.innerWidth < 480 ? Math.round(el.getBoundingClientRect().bottom + 8) : null);
  }, [touch, inPlane, mapTop]);

  // Building the map takes a moment and blocks the page: let the loading screen paint first
  // (two animation frames), then build. The screen goes when the first HUD update arrives.
  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = mapRef.current;
    if (!canvas || !minimap) return;
    let m: ReturnType<typeof startMatch> | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        const st = settingsRef.current;
        m = startMatch(canvas, {
          fighter,
          rookie,
          firstRound,
          look,
          held: heldRef.current,
          name: 'you',
          aimMode: readAim(),
          minimap,
          onHud: setHud,
          session,
          tier: resolveTier(st.quality, deviceFacts(platform.deviceType())),
          autoTier: st.quality === 'auto',
          settings: st,
          onMuteKey: () => setSettings({ ...settingsRef.current, muted: !settingsRef.current.muted }),
        });
        gameRef.current = m;
        setGame(m);
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      gameRef.current = null;
      setGame(null);
      m?.dispose();
    };
  }, [fighter, session, platform]);

  // Settings changed (in the pause menu, or the mute key): applied to the running round at once.
  const lastQuality = useRef(settings.quality);
  useEffect(() => {
    if (!game) return;
    game.applySettings(settings);
    if (lastQuality.current !== settings.quality) {
      lastQuality.current = settings.quality;
      game.setTier(resolveTier(settings.quality, deviceFacts(platform.deviceType())));
    }
  }, [game, settings, platform]);

  // Held behind the pre-match screen until the launch; then the picture comes up out of the launch's black.
  useEffect(() => {
    game?.setHeld(held);
  }, [game, held]);
  useEffect(() => {
    if (hud) onLoadedRef.current?.();
  }, [!!hud]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = FIGHTERS[fighter];
  const over = hud && (hud.dead || hud.phase === 'over');
  // Let the fall play out first (or the win sink in) before the report comes up: going down,
  // a short card says who took you out and with what, then the report follows.
  const showResult =
    !!hud && ((hud.dead && hud.deadFor > DEATH_CARD) || (hud.won && hud.phase === 'over'));
  /** Kill colour (the banner, the death card): red, or orange in colour-blind mode. */
  const killColor = settings.colorBlind ? '#ff9f1c' : '#ff3d6e';

  // The round is over for you: the career takes it in once, and the report shows what it says.
  const onRoundEndRef = useRef(onRoundEnd);
  onRoundEndRef.current = onRoundEnd;
  const [report, setReport] = useState<RoundReport | null>(null);
  const reported = useRef(false);
  useEffect(() => {
    if (!showResult || !hud || online || reported.current) return;
    reported.current = true;
    const r = onRoundEndRef.current?.(hud) ?? null;
    if (r?.summary && r.summary.levelUps.length > 0) platform.happytime();
    setReport(r);
  }, [showResult, hud, online, platform]);

  // Anonymous usage events: a no-op unless the site started counting (never on a portal build).
  useTelemetry(hud, { held, showResult, online });

  usePlatformRound(platform, game, {
    loaded: !!hud && !held,
    playing: !!hud && !held && !menuOpen && !showResult && hud.phase !== 'over',
  });

  // One Esc (or P) opens the menu and pauses the match (offline, so pausing is fair); one more closes it.
  // With the mouse captured the browser spends that Esc on handing the mouse back, so the page may only see the lock end:
  // that counts as the press (see pauseKeys). In a portal's fullscreen the browser may keep Esc for itself: P still works.
  const lockReleasedAt = useRef(-1e9);
  const menuStateRef = useRef({ over: false, settingsOpen: false, menuOpen: false });
  menuStateRef.current = { over: !!over, settingsOpen, menuOpen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = menuStateRef.current;
      const action = pauseKeyAction(e, {
        pauseKey: settingsRef.current.keys.pause,
        settingsOpen: m.settingsOpen,
        held: !!heldRef.current,
        over: m.over,
        menuOpen: m.menuOpen,
        msSinceLockRelease: performance.now() - lockReleasedAt.current,
      });
      if (action === 'toggle') setMenuOpen(!m.menuOpen);
    };
    let wasLocked = false;
    const onLock = () => {
      const locked = document.pointerLockElement != null;
      const released = wasLocked && !locked;
      wasLocked = locked;
      if (!released) return;
      const m = menuStateRef.current;
      if (!lockReleaseOpensMenu({ held: !!heldRef.current, over: m.over, hasFocus: document.hasFocus(), settingsOpen: m.settingsOpen })) return;
      lockReleasedAt.current = performance.now();
      setMenuOpen(true);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerlockchange', onLock);
    };
  }, []);

  useEffect(() => {
    gameRef.current?.setPaused(menuOpen);
    if (!menuOpen) setSettingsOpen(false);
    // The menu needs the mouse: if it opened with P (or a button) while the mouse was captured, give it back.
    else if (document.pointerLockElement) document.exitPointerLock();
  }, [menuOpen]);

  // Remember the aim choice, whether it was made in the menu or with T.
  useEffect(() => {
    if (!hud) return;
    saveAim(hud.aimMode);
  }, [hud?.aimMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-ink-deep">
      {/* The picture opens out of the launch's black: two shutters part from a bright seam (a plain fade without motion). */}
      {!held && hud &&
        (settings.reducedMotion ? (
          <div className="pointer-events-none absolute inset-0 z-[60] bg-black [animation:fadeOut_0.5s_ease-out_forwards]" />
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[60] overflow-hidden [animation:fadeOut_0.1s_linear_0.6s_forwards]">
            <div className="absolute inset-x-0 top-0 h-1/2 bg-black [animation:lcsShutterUp_0.55s_cubic-bezier(0.7,0,0.2,1)_both]" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-black [animation:lcsShutterDown_0.55s_cubic-bezier(0.7,0,0.2,1)_both]" />
            <div className="absolute inset-x-0 top-1/2 -mt-px h-[2px] bg-white shadow-[0_0_30px_8px_rgba(255,210,63,0.8)] [animation:lcsSeam_0.5s_ease-out_both]" />
          </div>
        ))}
      {!hud && !held && <MatchLoading fx={!settings.reducedMotion} />}
      {/* Outside the Deadline: the screen turns blue, and the edges flash red with every bite. */}
      {hud?.zone.outside && !hud.dead && hud.phase !== 'over' && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(47,140,255,0.12) 35%, rgba(30,90,220,0.42) 100%)',
            }}
          />
          <div
            key={hud.zoneHits}
            className="pointer-events-none absolute inset-0 z-20 animate-[zonePulse_0.7s_ease-out_forwards]"
            style={{ boxShadow: `inset 0 0 140px 40px ${settings.colorBlind ? 'rgba(255,159,28,0.75)' : 'rgba(255,40,60,0.75)'}` }}
          />
        </>
      )}
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${hud?.aimMode === 'mouse' ? 'cursor-crosshair' : ''}`}
      />

      {/* Minimap */}
      {/* On phones it sits top right, out of the thumbs' way. */}
      <div
        ref={mapBoxRef}
        data-hud="minimap"
        className={`panel-cut absolute bg-ink-deep/80 ${touch ? 'p-1' : 'p-1.5'} ${touch ? `right-2 ${mapTop === null ? 'top-2' : ''}` : 'bottom-3 right-3'}`}
        style={touch ? { marginRight: 'env(safe-area-inset-right)', ...(mapTop !== null ? { top: mapTop } : {}) } : undefined}
      >
        {/* Big while you're on the plane choosing where to jump. */}
        <canvas
          ref={mapRef}
          width={hud?.stage === 'drone' ? 340 : 192}
          height={hud?.stage === 'drone' ? 340 : 192}
          className={
            hud?.stage === 'drone'
              ? touch
                ? 'block h-[min(300px,58vh,58vw)] w-[min(300px,58vh,58vw)]'
                : 'block h-[340px] w-[340px]'
              : touch
                ? 'block h-[calc(112px*var(--ui,1))] w-[calc(112px*var(--ui,1))]'
                : 'block h-48 w-48'
          }
        />
      </div>

      {hud && (
        <>
          {/* You: health, shield, what you carry and the ability rings, bottom left (top left on a phone, out of the thumbs' way). */}
          <div
            data-hud="vitals"
            className={`pointer-events-none absolute flex flex-col gap-1.5 ${touch ? 'left-3 top-2' : 'bottom-4 left-4'}`}
            style={{ ...(touch ? { marginLeft: 'env(safe-area-inset-left)' } : {}), zoom: hudZoom }}
          >
            <div ref={vitalsRef}>
              <Vitals
                hud={hud}
                colorBlind={settings.colorBlind}
                rings={!touch}
                keys={settings.showKeyHints ? { super: capLabel(settings.keys.super), roll: capLabel(settings.keys.roll) } : null}
              />
            </div>
            {/* The guns are put away in the plane, in free fall and under the canopy (nobody can fire there): they fade in over 0.2 s on touchdown. */}
            {touch && (
              <div className={`transition-opacity duration-200 motion-reduce:transition-none ${hud.stage === 'ground' ? 'opacity-100' : 'opacity-0'}`} aria-hidden={hud.stage !== 'ground'}>
                <Weapons hud={hud} keys={null} compact />
              </div>
            )}
          </div>
          {/* Your guns, over the minimap (bottom right). */}
          {!touch && (
            <div
              className={`pointer-events-none absolute bottom-[222px] right-3 w-[204px] transition-opacity duration-200 motion-reduce:transition-none ${hud.stage === 'ground' ? 'opacity-100' : 'opacity-0'}`}
              style={{ zoom: hudZoom }}
              aria-hidden={hud.stage !== 'ground'}
            >
              <Weapons hud={hud} keys={settings.showKeyHints ? [capLabel(settings.keys.slot1), capLabel(settings.keys.slot2)] : null} compact={false} />
            </div>
          )}
          {/* Players left and your kills, top right, the kill feed under them. */}
          {!touch && (
            <div className="panel-cut pointer-events-none absolute right-4 top-3 bg-ink-deep/80 px-3 py-1.5" style={{ zoom: hudZoom }}>
              <Counters alive={hud.alive} kills={hud.kills} pulse={!settings.reducedMotion} />
            </div>
          )}

          {/* The first seconds on the plane: what this game is about. */}
          {hud.stage === 'drone' && hud.phase === 'drop' && hud.planeTime < 3.2 && (
            <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.6),rgba(10,13,24,0.1)_70%)] px-6 text-center">
              {COPY.intro.above && (
                <div className="font-mono text-xs tracking-[0.3em] text-green/90 [animation:fadeIn_0.4s_ease-out]">{COPY.intro.above}</div>
              )}
              <div
                className={`font-display text-4xl leading-none text-gold drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-7xl [@media(max-height:520px)]:sm:text-4xl ${settings.reducedMotion ? '' : 'lcs-glitch-in'}`}
                style={settings.reducedMotion ? undefined : { animationDelay: '0.35s' }}
              >
                {COPY.intro.title(hud.total)[0]}
                <br />
                {COPY.intro.title(hud.total)[1]}
              </div>
              {COPY.intro.below && (
                <div className="font-mono text-xs tracking-[0.3em] text-orange/90 [animation:fadeIn_0.4s_ease-out]">{COPY.intro.below}</div>
              )}
            </div>
          )}

          {/* Deadline and players left */}
          <div
            className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? `${pillTop === null ? 'top-[124px]' : ''} sm:top-3` : 'top-3'}`}
            style={{
              ...(pillTop !== null ? { top: pillTop } : {}),
              // On a touch screen the pill sits between the health block (left) and the minimap (right), never over either.
              ...(touch
                ? {
                    paddingLeft: `calc((${hudZoom} * 208px) + env(safe-area-inset-left))`,
                    paddingRight: `calc(${hud.stage === 'drone' ? 'min(300px, 58vh, 58vw) + 24px' : '(112px * var(--ui, 1)) + 24px'} + env(safe-area-inset-right))`,
                  }
                : {}),
            }}
          >
            <div data-hud="pill" className="panel-cut flex items-center gap-3 whitespace-nowrap bg-ink-deep/85 px-3 py-1 sm:gap-4 sm:px-4 sm:py-1.5" style={{ zoom: hudZoom }}>
              {touch && hud.stage !== 'drone' && (
                <>
                  <Counters alive={hud.alive} kills={hud.kills} pulse={!settings.reducedMotion} />
                  <span className="h-4 w-px bg-cream/20" />
                </>
              )}
              <span
                className={`text-sm ${hud.zone.outside ? 'font-bold text-orange' : 'text-cream/80'}`}
              >
                {hud.zone.outside ? COPY.zone.outside : hud.zone.label}
                {hud.zone.seconds > 0 && (
                  <span className="ml-2 font-display text-gold">{hud.zone.seconds}s</span>
                )}
              </span>
            </div>
          </div>

          {/* The sniper's scope: in first person a round lens with a reticle and black all round;
              from above a lighter ring round the far spot you are looking at. */}
          {hud.scoped && (
            <div className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
              <div
                className="absolute inset-0"
                style={{
                  background: hud.firstPerson || hud.shoulder
                    ? 'radial-gradient(circle at 50% 50%, transparent 0, transparent min(38vh, 38vw), rgba(0,0,0,0.92) calc(min(38vh, 38vw) + 3px), #000 calc(min(38vh, 38vw) + 40px))'
                    : 'radial-gradient(circle at 50% 50%, transparent 0, transparent 30%, rgba(5,8,16,0.55) 62%)',
                }}
              />
              <div className="absolute left-1/2 top-1/2 h-px w-[min(76vh,76vw)] -translate-x-1/2 bg-black/80" />
              <div className="absolute left-1/2 top-1/2 h-[min(76vh,76vw)] w-px -translate-y-1/2 bg-black/80" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3d3d]" />
              <div className="absolute left-1/2 top-1/2 h-[min(76vh,76vw)] w-[min(76vh,76vw)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/70" />
            </div>
          )}

          {/* First person: a crosshair, and how to take the mouse. */}
          {(hud.firstPerson || hud.shoulder) && !over && !hud.scoped && (
            <>
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" aria-hidden>
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-cream/90 shadow" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-cream/90 shadow" />
                <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" />
              </div>
              {!hud.mouseLocked && !touch && (
                <div className="pointer-events-none absolute inset-x-0 top-[58%] flex justify-center">
                  <span className="panel-cut bg-ink-deep/85 px-4 py-2 text-sm text-cream">Click to look around with the mouse · Esc pauses</span>
                </div>
              )}
            </>
          )}

          {/* You walked into a named place: its name, top centre, for 1.6 s (the placement sticker's language: cream with a hard dark drop). */}
          {hud.place && !over && !hud.dead && (
            <div className={`pointer-events-none absolute inset-x-0 z-[4] flex justify-center px-4 ${touch ? 'top-[22%]' : 'top-[9%]'}`} role="status" aria-live="polite">
              <div
                key={hud.place.id}
                className={`text-center font-display text-[1.75rem] leading-none text-cream sm:text-[2.5rem] ${settings.reducedMotion ? 'animate-[elimFade_1.6s_ease-out_forwards]' : 'animate-[placeIn_1.6s_ease-out_forwards]'} motion-reduce:animate-none`}
                style={{ zoom: hudZoom, textShadow: '0 0.045em 0 #0a0d18, 0 0.09em 0 rgba(10,13,24,0.55), 0 0.2em 0.5em rgba(0,0,0,0.45)' }}
              >
                {hud.place.name}
              </div>
            </div>
          )}

          {/* You took someone out: a big centred banner for a moment, and the kill sound. */}
          {hud.elim && !over && (
            <div
              className="pointer-events-none absolute inset-x-0 top-[13%] z-[5] flex justify-center px-4"
              role="status"
              aria-live="polite"
            >
              <div
                key={hud.elim.id}
                className={`flex flex-col items-center gap-1.5 text-center ${settings.reducedMotion ? 'animate-[elimFade_1.4s_ease-out_forwards]' : 'animate-[elimIn_1.4s_ease-out_forwards]'} motion-reduce:animate-none`}
                style={{ zoom: hudZoom }}
              >
                <div className="panel-cut flex items-baseline gap-3 bg-ink-deep/80 px-5 py-2 font-display text-2xl leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)] sm:px-6 sm:py-2.5 sm:text-4xl">
                  <span style={{ color: killColor }}>ELIMINATED</span>
                  <span className="text-cream">{hud.elim.name}</span>
                </div>
                <div className="rounded bg-ink-deep/70 px-3 py-0.5 text-sm font-bold tracking-widest text-cream/90 sm:text-base">
                  <span className="font-display text-gold">{hud.elim.left}</span> LEFT
                </div>
              </div>
            </div>
          )}

          {/* You went down: who took you out and with what, before the round report comes up. */}
          {hud.dead && !hud.won && !showResult && (
            <div
              className="pointer-events-none absolute inset-0 z-[5] flex items-start justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,13,24,0.15)_30%,rgba(10,13,24,0.7))] px-4 pt-[11vh] [@media(max-height:500px)]:pt-[16vh] animate-[fadeIn_0.3s_ease-out]"
              role="status"
              aria-live="assertive"
            >
              {!settings.reducedMotion && (
                <>
                  <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 160px 50px ${killColor}`, animation: 'lcsFlash 0.7s ease-out both' }} />
                  <Streaks color={killColor} count={5} seed={3} />
                </>
              )}
              <div className="relative flex flex-col items-center gap-2 text-center animate-[riseIn_0.35s_ease-out_both]" style={{ zoom: hudZoom }}>
                <div
                  className={`font-display text-4xl leading-none drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] sm:text-6xl [@media(max-height:500px)]:sm:text-4xl ${settings.reducedMotion ? '' : 'lcs-glitch-in'}`}
                  style={{ color: killColor }}
                >
                  {COPY.result.lost}
                </div>
                <div className="panel-cut bg-ink-deep/85 px-5 py-2 text-lg text-cream sm:text-2xl">
                  {hud.killedBy ? (
                    <>
                      by{' '}
                      <b className="font-display" style={{ color: hud.killerFighter ? FIGHTERS[hud.killerFighter].color : '#6fb6ff' }}>
                        {hud.killedBy}
                      </b>{' '}
                      with {hud.killedWith}
                    </>
                  ) : (
                    <>Caught outside by {hud.killedWith ?? COPY.zone.name}</>
                  )}
                </div>
                <div className="text-sm font-bold tracking-widest text-cream/75">
                  <span className="font-display text-gold">#{hud.placement}</span> OF {hud.total}
                </div>
              </div>
            </div>
          )}

          {/* Online: how the line is doing. */}
          {hud.net && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'top-[158px] sm:top-12' : 'top-12'}`}
            >
              <span className="rounded bg-ink-deep/70 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-cream/60">
                {hud.host
                  ? `HOST · ${hud.net.total ? `${hud.net.direct}/${hud.net.total} DIRECT` : 'SOLO'}${hud.net.total ? ` · ${hud.net.rtt} MS` : ''}`
                  : `${hud.net.direct ? 'DIRECT' : 'VIA SERVER'} · ${hud.net.rtt} MS`}
              </span>
            </div>
          )}

          {/* Kill feed */}
          <div
            className={`pointer-events-none absolute flex flex-col items-end gap-1 text-xs ${touch ? 'right-2 top-[176px] sm:top-[calc(124px*var(--ui,1)+14px)]' : 'right-4 top-[52px]'}`}
          >
            {hud.feed.map((k) => (
              <span key={k.id} className="rounded bg-ink-deep/80 px-2 py-0.5 text-cream/80">
                {k.text}
              </span>
            ))}
          </div>

          {/* Prompt */}
          {hud.prompt && !over && (
            <div
              className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'bottom-[150px] sm:bottom-6' : 'bottom-24'}`}
            >
              <span
                className="panel-cut bg-ink-deep/85 px-4 py-1.5 text-sm text-cream"
                style={{ zoom: hudZoom, ...(hud.promptGrade !== null && hud.promptGrade > 0 ? { color: GRADE_CSS[hud.promptGrade], boxShadow: `inset 3px 0 0 ${GRADE_CSS[hud.promptGrade]}` } : {}) }}
              >
                {hud.prompt}
              </span>
            </div>
          )}

          {/* A heal in progress: what, and how far along. */}
          {hud.using && !over && (
            <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${touch ? 'bottom-[190px] sm:bottom-16' : 'bottom-36'}`}>
              <div className="flex w-52 flex-col items-center gap-1" style={{ zoom: hudZoom }}>
                <span className="text-xs font-bold tracking-wider text-green">{hud.using.name}</span>
                <span className="panel-cut h-2 w-full overflow-hidden bg-ink-deep/80">
                  <span className="block h-full bg-green" style={{ width: `${Math.min(1, hud.using.progress) * 100}%` }} />
                </span>
              </div>
            </div>
          )}

          {settings.showFps && (
            <div className={`pointer-events-none absolute z-[6] rounded bg-ink-deep/75 px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${hud.fps < 40 ? 'text-orange' : 'text-green'} ${touch ? 'bottom-2 left-1/2 -translate-x-1/2' : 'left-1/2 top-12 -translate-x-1/2'}`}>
              {hud.fps} FPS · {hud.tier.toUpperCase()}
            </div>
          )}

          {touch && !over && !menuOpen && (
            <TouchControls
              size={settings.touchSize}
              opacity={settings.touchOpacity}
              leftHanded={settings.leftHanded}
              press={(b, on) => gameRef.current?.press(b, on)}
              onMove={(x, y) => gameRef.current?.setStick(x, y)}
              onPause={() => setMenuOpen(true)}
              onPlane={hud.stage === 'drone'}
              inAir={hud.stage === 'falling'}
              superReady={hud.superCharge}
              rollReady={Math.min(1, hud.roll)}
              sniper={hud.sniper}
              canSwap={hud.slots.every((sl) => sl.name !== null)}
              swapLabel={hud.slots.find((sl) => !sl.active)?.name ?? null}
              heal={hud.healNext}
            />
          )}

          {/* Controls */}
          {!touch && settings.showKeyHints && !firstRound && (
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(50vw-13rem)] flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-cream/50">
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.up)} />
                <Key k={keyLabel(settings.keys.left)} />
                <Key k={keyLabel(settings.keys.down)} />
                <Key k={keyLabel(settings.keys.right)} /> move
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.fire)} /> shoot
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.jump)} /> jump
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.leanL)} />
                <Key k={keyLabel(settings.keys.leanR)} /> lean
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.super)} /> super
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.use)} /> pick up / use
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.reload)} /> reload
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.slot1)} />
                <Key k={keyLabel(settings.keys.slot2)} />
                <Key k={keyLabel(settings.keys.swap)} /> / wheel · guns
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.heal)} /> heal
                <Key k={keyLabel(settings.keys.coffee)} /> {COPY.items.coffee.toLowerCase()}
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.roll)} /> roll
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.scope)} /> / right click · scope
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.aim)} /> {hud.aimMode === 'mouse' || hud.firstPerson || hud.shoulder ? 'mouse aim' : 'auto-aim'}
              </span>
              <span className="flex items-center gap-1">
                <Key k={keyLabel(settings.keys.mute)} /> mute
              </span>
              <span className="flex items-center gap-1">
                <Key k="Esc" /> / <Key k={keyLabel(settings.keys.pause)} /> menu
              </span>
            </div>
          )}

          {/* Esc / P menu */}
          {menuOpen && !over && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-deep/70">
              <div
                role="dialog"
                aria-label="Paused"
                className="panel-cut flex max-h-[94vh] w-[22rem] max-w-[94vw] flex-col items-center gap-4 overflow-y-auto bg-ink p-6 text-center sm:p-7"
              >
                <div className="font-display text-4xl text-gold">{online ? 'Menu' : 'Paused'}</div>
                {online && (
                  <p className="text-xs text-cream/60">
                    Online the round keeps going while this menu is open.
                  </p>
                )}
                <button
                  type="button"
                  autoFocus
                  onClick={() => setMenuOpen(false)}
                  className="panel-cut w-full bg-gold px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="panel-cut w-full bg-cream/10 px-5 py-2 font-bold uppercase tracking-wider text-cream hover:bg-cream/20"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="panel-cut w-full bg-orange/90 px-5 py-2 font-bold uppercase tracking-wider text-ink-deep"
                >
                  {online && hud.host ? 'End the round for everyone' : exitLabel === 'Back to lobby' ? 'Leave match' : 'Quit to menu'}
                </button>
                {!touch && <p className="text-[10px] text-cream/40">Esc or {keyLabel(settings.keys.pause)} to resume</p>}
                {Support && <Support />}
                {credit && <p className="text-[10px] tracking-widest text-cream/40">A game by {credit}</p>}
              </div>
            </div>
          )}

          {menuOpen && settingsOpen && (
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              onClose={() => setSettingsOpen(false)}
              touch={touch}
              tier={hud.tier}
              portalMuted={platform.muted()}
              aim={{ value: hud.aimMode, onChange: (m) => gameRef.current?.setAimMode(m) }}
            />
          )}

          {/* Result: after the fall (or the win) settles, a full-screen round report. */}
          {showResult && (
            <Result
              hud={hud}
              fighter={fighter}
              onPlayAgain={onPlayAgain}
              onExit={onExit}
              online={online}
              Support={Support}
              exitLabel={exitLabel}
              fx={!settings.reducedMotion}
              report={report}
            />
          )}
        </>
      )}
    </main>
  );
};
