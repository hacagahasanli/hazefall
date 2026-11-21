# Results screen stat stickers (Kills / Damage / Survived)

R-004. Scope: only the three stat cards in `Result` (src/components/Match.tsx, the `stats` grid). Everything else on the report (placement, headline, killer line, accuracy line, buttons, support card) stays exactly as it is.

## Problem
The current cards are dark clipped boxes with a 3 px coloured inset edge line, a line icon and a number over a grey label. That is the default "dashboard KPI tile": it ignores the report's own language and Reis reads it as a stock AI layout.

## Direction: "score stickers"
Drop the boxes. Each stat becomes a smaller sibling of the placement numeral: the number in Bungee with the same hard dark drop, sitting on its own slanted colour band (the placement's band, skewX(-12deg), behind the lower half of the digits). The colour is the band, not a border. Because the band hugs the digits, the three stats have different widths, like stickers slapped on a laptop lid, not three equal tiles. The placement stays the hero; the stats are the same family at about a quarter of its size.

Why this one: the report already has one strong idea (the sticker numeral on a slanted band, the trophy landing, the sweep of light). Reusing it at a smaller scale makes the stats belong to that screen and to the game's loud display type, instead of adding a second visual system. No panel, no border, no stripe, no eyebrow label.

## Layout
- Grid stays `grid grid-cols-3`, but `items-end justify-items-start`, gap `gap-x-5 gap-y-2 sm:gap-x-10`. Add `pl-2` to the grid so the band's left bleed is never clipped.
- Each cell: `relative flex flex-col items-start`. No background, no padding, no `panel-cut`, no `boxShadow`, no `bg-ink/90`.
- Order inside a cell: numeral block (number + band), then the label row under it.

## Numeral block
- Wrapper: `<span class="relative inline-block" aria-hidden>`.
- Band (first child, absolutely positioned, behind the digits):
  - `position:absolute; left:-0.22em; right:-0.38em; top:50%; bottom:6%; transform:skewX(-12deg);`
  - Kills: `background: linear-gradient(90deg,#ff3d6e,#c42a55)`
  - Damage: `background: linear-gradient(90deg,#ffd23f,#d9a514)`
  - Survived: `background: linear-gradient(90deg,#3ec5ff,#1f8fcf)`
  - `opacity: 0.92`. Units are `em` so the band scales with the number size on every breakpoint.
- Number (second child): `relative font-display tabular-nums leading-none text-cream`
  - Size: `text-[2.5rem] sm:text-5xl`, at `[@media(max-height:520px)]:text-[1.75rem]`.
  - `text-shadow: 0 0.06em 0 #0a0d18, 0 0.12em 0 rgba(10,13,24,0.55), 0 0.25em 0.5em rgba(0,0,0,0.4)` (the placement's drop, a touch heavier so cream digits stay readable where they overlap the gold band).
  - Survived keeps the `0:59` format; the colon is part of the sticker.

## Label row
- `mt-1.5 flex items-center gap-1.5 text-sm text-cream/65`, at `[@media(max-height:520px)]:mt-1 text-xs`.
- Icon: the existing `StatGlyph` paths at `h-3.5 w-3.5` (phone: same size), stroke `currentColor` in the stat colour. Visible on every width now (remove `hidden sm:block`): it is small enough for 3 columns at 360 px and it carries the colour to the label line.
- Label text unchanged: Kill/Kills, Damage, Survived. Sentence case, no uppercase, no letter-spacing.

## Zero state (0 kills, 0 damage)
A zero is honest, not celebrated:
- Band: `background: rgba(230,235,245,0.10)`, no gradient.
- Number: `text-cream/55`, same drop shadow.
- Icon stays in its colour at `opacity:0.6`; label unchanged.
- Survived is never zero-styled.

## Entrance (fx on)
Replaces the single `riseIn` on the card. Per cell, start delay `d = 0.55s + i * 0.09s` (after the placement has landed and the headline glitched in):
1. Band wipes in: new keyframe `lcsBandIn { from { transform: skewX(-12deg) scaleX(0) } to { transform: skewX(-12deg) scaleX(1) } }`, `transform-origin: left`, `0.26s cubic-bezier(0.2,0.8,0.2,1) d both`.
2. Number lands: new keyframe `lcsStatLand { 0% {opacity:0; transform:scale(1.6)} 35% {opacity:1; transform:scale(0.92)} 60% {transform:scale(1.04)} 100% {opacity:1; transform:scale(1)} }`, `0.38s cubic-bezier(0.2,0.8,0.2,1) (d + 0.08s) both`, `transform-origin: left bottom`.
3. Kills and Damage count up from 0 to the value over 0.5 s with ease-out cubic (same curve as `Placement`), starting with step 2; `tabular-nums` keeps the width still. Survived does not count, it lands.
4. Label row: `riseIn 0.35s ease-out (d + 0.16s) both`.
No sound, no shake, no glow: the placement already spent the impact.

## Reduced motion (fx off, and the global prefers-reduced-motion rule)
Everything in its final state at once: band full width, final numbers, no count-up, no keyframes. Nothing may start at `opacity:0` without an animation to bring it back.

## Accessibility
- Cell: `role="group"` with `aria-label="{value} {label}"` (for example "3 Kills", "0:59 Survived"), because the counting number is `aria-hidden`.
- Cream digits on the bands with the dark drop pass for large text; the labels stay cream/65 on the dark report background as today.

## Acceptance
- No box, border, inset shadow or side stripe on any stat at any width.
- Each stat reads as a coloured slanted band under a cream Bungee number with a hard dark drop, visibly the same family as the placement sticker, smaller.
- Bands are as wide as their numbers (Kills "0" is short, Damage "1240" long).
- 360x640 and 640x360 (max-height 520): three columns fit, no wrap, no horizontal scroll, icons visible.
- 0 kills / 0 damage show the grey band and dimmed number.
- fx off: final state, no motion.
- Accuracy line, buttons and the rest of the report unchanged.

## Must not change
`stats` data and colours (#ff3d6e, #ffd23f, #3ec5ff), labels, `fmtTime`, the accuracy/distance line, any other part of `Result`.
