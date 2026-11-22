'use client';

/**
 * The lobby's Style row: four 44 px slots (Outfit, Gun, Canopy, Smoke) with a tray under the row, or a bottom sheet on phones.
 * A tap on an unlocked item wears it; a tap on a locked one only previews it on the fighter on the airstrip, with the level it
 * needs underneath. Everything here is looks: no number, bar or rarity anywhere. After Ready the row is disabled.
 */
import { useEffect, useRef, useState } from 'react';

import { Chip } from '~/components/Chip';
import { uiTick } from '~/components/uiSound';
import { itemsOf, lockedFooter, lockLabel, lookHas, outfitById } from '~/game/cosmetics';
import { FIGHTERS } from '~/game/sim/constants';

import type { Career } from '~/game/career';
import type { Item, Look, RewardKind } from '~/game/cosmetics';
import type { FighterId } from '~/game/sim/types';

const SLOTS: { kind: RewardKind; caption: string }[] = [
  { kind: 'outfit', caption: 'Outfit' },
  { kind: 'finish', caption: 'Gun' },
  { kind: 'canopy', caption: 'Canopy' },
  { kind: 'smoke', caption: 'Smoke' },
];

/** What the staging scene should show instead of what is worn: a locked item being looked at. */
export type StylePreview = { kind: 'outfit' | 'finish'; key: string } | null;

/** The look as worn, with a previewed outfit (on this fighter) or finish laid over it. */
export const previewed = (look: Look, fighter: FighterId, preview: StylePreview): Look =>
  !preview ? look : preview.kind === 'outfit' ? { ...look, outfit: { ...look.outfit, [fighter]: preview.key } } : { ...look, finish: preview.key };

const wearing = (look: Look, kind: RewardKind, fighter: FighterId): Item => {
  const key = kind === 'outfit' ? look.outfit[fighter] : kind === 'finish' ? look.finish : kind === 'canopy' ? look.canopy : look.smoke;
  return itemsOf(kind).find((i) => i.key === key)!;
};

export const StyleRow = ({
  career,
  fighter,
  disabled,
  onLook,
  onSeen,
  onPreview,
  onOpen,
}: {
  career: Career;
  fighter: FighterId;
  disabled: boolean;
  onLook: (look: Look) => void;
  onSeen: (ids: string[]) => void;
  onPreview: (p: StylePreview) => void;
  /** The tray opened or closed (the lobby's Esc closes it before it leaves the lobby). */
  onOpen: (open: boolean) => void;
}) => {
  const [open, setOpen] = useState<RewardKind | null>(null);
  const [locked, setLocked] = useState<Item | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Partial<Record<RewardKind, HTMLButtonElement | null>>>({});

  const close = (restoreFocus = false) => {
    const was = open;
    setOpen(null);
    setLocked(null);
    onPreview(null);
    onOpen(false);
    if (restoreFocus && was) slotRefs.current[was]?.focus();
  };

  // Esc closes the tray (and gives focus back to its slot); the lobby's own Esc is held off while it is open (onOpen).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.preventDefault();
      close(true);
    };
    // In the capture phase, and stopped there, so the lobby's own Esc (back to the menu) never also sees this key.
    const onCapture = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      onKey(e);
    };
    window.addEventListener('keydown', onCapture, true);
    return () => window.removeEventListener('keydown', onCapture, true);
  });
  useEffect(() => {
    if (disabled && open) close();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const isNew = (kind: RewardKind) => itemsOf(kind).some((i) => career.unlocked.includes(i.id) && !career.seen.includes(i.id));

  const pickSlot = (kind: RewardKind) => {
    if (disabled) return;
    uiTick(false);
    if (open === kind) return close(true);
    setOpen(kind);
    setLocked(null);
    onPreview(null);
    onOpen(true);
    const fresh = itemsOf(kind).filter((i) => career.unlocked.includes(i.id) && !career.seen.includes(i.id)).map((i) => i.id);
    if (fresh.length) onSeen(fresh);
  };

  const pickItem = (i: Item) => {
    const owned = career.unlocked.includes(i.id);
    uiTick(owned);
    if (!owned) {
      setLocked(i);
      onPreview(i.kind === 'outfit' || i.kind === 'finish' ? { kind: i.kind, key: i.key } : null);
      return;
    }
    setLocked(null);
    onPreview(null);
    const look = career.look;
    onLook(
      i.kind === 'outfit' ? { ...look, outfit: { ...look.outfit, [fighter]: i.key } } : i.kind === 'finish' ? { ...look, finish: i.key } : i.kind === 'canopy' ? { ...look, canopy: i.key } : { ...look, smoke: i.key },
    );
  };

  const f = FIGHTERS[fighter];
  const shown = open ? itemsOf(open) : [];
  const outfitName = open === 'outfit' ? outfitById(locked?.kind === 'outfit' ? locked.key : career.look.outfit[fighter]).name : null;

  return (
    <div ref={root} data-style className="flex flex-col gap-2" role="group" aria-label="Style">
      <div className="relative z-20 flex items-start gap-4">
        {SLOTS.map(({ kind, caption }) => {
          const item = wearing(career.look, kind, fighter);
          const on = open === kind;
          return (
            <div key={kind} className="flex w-11 flex-col items-center gap-1">
              <button
                type="button"
                disabled={disabled}
                aria-label={`${caption}: ${item.name}`}
                aria-expanded={on}
                onClick={() => pickSlot(kind)}
                ref={(el) => {
                  slotRefs.current[kind] = el;
                }}
                className={`relative flex h-11 w-11 items-center justify-center border-2 bg-ink/70 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream ${on ? 'border-cream' : 'border-cream/20'} ${disabled ? 'opacity-40' : 'hover:border-cream/60'}`}
              >
                <Chip item={item} fighter={fighter} w={26} h={22} />
                {isNew(kind) && <span aria-label="New" className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-gold" />}
              </button>
              <span className="text-xs text-cream/65 [@media(max-height:420px)]:hidden">{caption}</span>
            </div>
          );
        })}
      </div>

      {open && (
        <>
          {/* Tapping outside closes the tray. */}
          <button type="button" aria-label="Close" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => close(true)} />
          <div
            role="group"
            aria-label={`${SLOTS.find((s) => s.kind === open)!.caption} choices`}
            className="panel-cut z-20 flex flex-col gap-2 bg-ink-deep/90 p-3 backdrop-blur max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[50dvh] max-sm:overflow-y-auto [@media(max-height:500px)]:fixed [@media(max-height:500px)]:inset-x-0 [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:max-h-[50dvh] [@media(max-height:500px)]:overflow-y-auto"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button type="button" aria-label="Close" onClick={() => close(true)} className="mx-auto hidden h-1.5 w-12 rounded-full bg-cream/30 max-sm:block [@media(max-height:500px)]:block" />
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-cream">
              <span>Looks only. Stats never change.</span>
              {outfitName && <span className="font-normal text-cream/70">{outfitName} for {f.name}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {shown.map((i) => {
                const owned = career.unlocked.includes(i.id);
                const worn = lookHas(career.look, i, fighter) && !locked;
                const looking = locked?.id === i.id;
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-label={owned ? i.name : `${i.name}, locked: ${lockLabel(i.from)}`}
                    aria-pressed={owned ? worn : looking}
                    title={owned ? i.name : lockLabel(i.from)}
                    onClick={() => pickItem(i)}
                    className={`relative flex h-11 w-11 items-center justify-center border-2 bg-ink/70 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream ${worn || looking ? 'border-cream' : 'border-cream/15'} ${owned ? '' : 'opacity-60'}`}
                  >
                    <Chip item={i} fighter={fighter} w={26} h={22} />
                    {!owned && <span className="absolute inset-x-0 bottom-0 bg-ink-deep/80 text-center text-[10px] font-bold leading-3 text-cream">{lockLabel(i.from)}</span>}
                  </button>
                );
              })}
            </div>
            <p className="min-h-5 text-sm text-cream/75" aria-live="polite">
              {locked ? lockedFooter(locked.from, career.level, career.streak.days) : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
};
