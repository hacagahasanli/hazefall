# Feedback (Creative Director -> Claude Code)

Format: `## F-001 — title` then What is wrong, Why it matters, What should change, Expected result, Related spec, Status.

## F-001 — Touchdown knee compress (canopy-feel 4.4, not yet built)
- What is wrong: the flare pose lands as specced (knees ~0.55, feet together and a little forward, verified in desktop flare frames 02-04), but the 0.55 -> ~1.1 knee compress in the first 0.15 s after touchdown was skipped because it lives in the ground pose, not `poseChute` (LOG deviation 5).
- Why it matters: the landing is the payoff of the whole canopy phase. Without the compress the feet touch with stiff knees and then pop into the landing roll; it is the one moment where the new alive legs revert to a mannequin.
- What should change: in the ground/landing pose, for the first 0.15 s after touchdown from a canopy, ease both knees from their flare value to ~1.1 (ease-out) and hips to about -0.9, then hand into the existing landing roll from that pose instead of from the flare pose. Render only, no sim or timing change.
- Expected result: a visible soft "absorb" (knees fold, hips drop) on every canopy landing, with no pop between flare, compress and roll at 60 and 30 Hz.
- Related spec: CREATIVE/specifications/canopy-feel.md 4.4 (Flare and landing).
- Priority: P2, non-blocking. R-003 is accepted without it.
- Status: open

## F-002 — Stat band stretches during the count-up
- What is wrong: in `StatSticker` (Match.tsx ~211) the band is sized by the numeral span, and that span holds `shown`, the counting value. Damage counts 0 -> 1240 from d+0.08 s to d+0.58 s, so after the band has wiped in (done at d+0.26 s) it jumps wider in steps as the number gains digits (1 -> 2 -> 3 -> 4 digits). `tabular-nums` only fixes digit width, not digit count; the spec's "tabular-nums keeps the width still" was wrong for multi-digit values. Visible in win-desktop-mid: the damage band is a short stub while the final one is ~4 digits wide.
- Why it matters: the sticker should be slapped down once at full size; a band that grows in jerks after its wipe reads as layout reflow, not as a designed beat. Kills with 10+ does the same.
- What should change: size the numeral block from the final value and lay the counting value over it.
  - Inside the `relative inline-block` wrapper, render the number span twice: first `<span className="invisible ...same classes...">{stat.value}</span>` (sets width and height, keeps the band's em/percent geometry), then the visible counting span with `absolute left-0 bottom-0` (same classes, text-shadow, transform-origin and `lcsStatLand` animation as now).
  - Digits stay left-aligned, so the count fills the band from the left. No other change to band, sizes or timing.
- Expected result: in every mid frame the band is already its final width; only the digits change. Final frames identical to the current build.
- Related spec: CREATIVE/ui/results-stats.md, Entrance step 3 (spec text corrected).
- Priority: P1
- Status: done (engineering, 2026-11-21)

## F-003 — Phone: uneven gaps between the three stickers
- What is wrong: the grid uses three equal columns, but the stickers are deliberately unequal (Kills "4" ~77 px incl. label, Damage "1240" ~93 px, Survived "0:00" ~90 px at 360 px). Damage overflows its ~90 px column, so at 360 px the gap is ~58 px Kills->Damage but only ~15 px Damage->Survived, and the gold and blue bands nearly touch and read as one strip (win-phone360, also visible at 390).
- Why it matters: three separate stickers need equal breathing room; when two bands almost meet the row looks cramped and accidental, and it gets worse with a 4-digit kill-free damage plus a 10:00+ survive time.
- What should change: below `sm` only, size columns by content and spread them: grid classes `grid grid-cols-[auto_auto_auto] justify-between items-end justify-items-start gap-x-4 gap-y-2 pl-2 sm:grid-cols-3 sm:justify-normal sm:gap-x-10`. Desktop (sm and up) and the 640x360 landscape layout keep the current equal columns (landscape is >= sm width; it looks right as is).
- Expected result: at 360 and 390 the two gaps between stickers are equal (~25 px at 360), Survived's band ends on the content's right edge area, no overlap, no wrap, no horizontal scroll. Number size stays 1.9rem.
- Related spec: CREATIVE/ui/results-stats.md, Layout (updated).
- Priority: P1
- Status: done (engineering, 2026-11-21)
