# HUD layout v2 (R-017, Reis bug list batch C item 17)

Desktop only. Touch branches in `Match.tsx` and `TouchControls.tsx` stay as they are (not shipped; the portal gates phones).
Wireframe at 1216x684: `CREATIVE/assets/hud-layout-v2-1216x684.svg` (placement only, not the final look).

## 1. Objective and idea

Reis asked for the layout grammar of a classic tactical shooter: map top left, health bottom left, ammo bottom right,
weapons and items as a keyed column on the right. We take that grammar only. The look stays ours: ink panels with the
`panel-cut` corner, Bungee numerals, cream / gold / green / blue from `globals.css`, gun silhouettes from `Hud.tsx`.

The one new idea is the **rack**: the right column is a rack of drawers, each with its key cut into the left edge.
What is in your hands is the drawer **pulled out** 10 px to the left with a gold edge. You read "what am I holding,
what else do I have, which key" from the column's silhouette before you read any number. No glow, no gradient, no
labels in capitals, no small spaced titles over anything.

Today's problems this fixes (from `ENGINEERING/hud-current-1600x900.png`):
- Bandage / med kit / bomb counts are 11 px chips crammed above the health bar; the keys 3/4/5 are not shown anywhere.
- The gun block floats over the minimap bottom right; the minimap and guns compete in the same corner.
- The full key list sits top left in 10 px grey text; it will collide with the minimap's new place.
- The fps and net lines sit top centre on top of the zone line area.

## 2. Scale

One CSS variable on the match root replaces `hudZoom` for desktop. All numbers in this spec are design px at `--hud = 1`
(1216x684), applied with `zoom: var(--hud)` on each HUD block, as `hudZoom` is today.

```
base  = clamp(0.8, min(vw / 1216, vh / 684), 1.35)
--hud = largeHud ? min(base * 1.2, vh / 520) : base
```

| Viewport | --hud | Screen in design px | Notes |
|---|---|---|---|
| 821x462 | 0.80 (floor) | 1026 x 578 | smallest CG size; everything below fits, checked against this box |
| 1216x684 | 1.00 | 1216 x 684 | CG default iframe, the reference size |
| 1920x1080 | 1.35 (cap) | 1422 x 800 | the HUD does not grow with the screen past 1.35: more world, same HUD |
| 821x462 large HUD | 0.89 | 924 x 520 | the `vh / 520` cap keeps the right stack clear of the kill feed |

Recompute on `resize`. Edge margin is 12 design px on every side at every size (>= 9.6 real px at 821x462).

CrazyGames overlays: on desktop CG draws nothing over the iframe during play (ads are full-screen SDK breaks); there is
no on-screen pause button on desktop (Esc / P). I did not re-verify the CG overlay rule this session; the 12 px margin
is the safety. The rotate / desktop-only card is outside the match and unaffected.

## 3. Placement at 1216x684

All boxes are design px: x, y = top left; or anchored as named.

| Element | Anchor | Box at 1216x684 | Size |
|---|---|---|---|
| Minimap | top left | x 12, y 12 | 168 x 168 box (160 map + 4 padding), `panel-cut`, `bg-ink-deep/80` |
| Drop map (stage `drone`) | top left | x 12, y 12 | 340 x 340 map + 4 padding; at 821x462 it is 272 real px, fits |
| Status line (fps, net) | top left, under map | x 12, y 188 | text 11 px, one line each, only when on |
| Zone line | top centre | centre x, y 12 | height 30, as today |
| Counters (alive, kills) | top right | right 12, y 12 | ~120 x 32, as today |
| Kill feed | top right | right 12, from y 52 | rows 20 high, gap 4, max 5 (ends at y 168) |
| Gun slot 1 | right column | x 1028..1204, y 416..456 | 176 x 40 |
| Gun slot 2 | right column | x 1028..1204, y 460..500 | 176 x 40 |
| Bandage (3) | right column | x 1084..1204, y 508..538 | 120 x 30 |
| Med kit (4) | right column | x 1084..1204, y 542..572 | 120 x 30 |
| Bomb (5) | right column | x 1084..1204, y 576..606 | 120 x 30 |
| Ammo | bottom right | x 1028..1204, y 616..672 | 176 x 56 |
| Vitals (health, shield, name) | bottom left | x 12..272, bottom 12 | see 5 |
| Gear chips (vest, pack, coffee) | bottom left, over the bars | x 72, y 608..626 | height 18 |
| Super ring (G) | bottom left, right of bars | x 284, bottom 12 | 44 |
| Roll ring (Shift) | right of super | x 336, bottom 12 | 36 |
| Heal progress | bottom centre | y 530..552 | 208 wide, as today |
| Hint line (prompt) | bottom centre | bottom 92 (y 562..592) | height 30, max width 460 |
| Crosshair, scope, place banner, elimination banner, "Click to look around" | unchanged | | |
| Damage numbers | world space, unchanged | | |

Column geometry: right edges all at `right 12`. Built bottom-up from the ammo block: ammo, gap 10, three item tiles
(gap 4), gap 8, two gun tiles (gap 4). Total column 192 high. Item tiles are narrower than gun tiles on purpose: guns
are the heavier objects, items hang under them like smaller drawers.

Collision checks (design px):
- 821x462 (1026 x 578): ammo y 510..566, column y 310..500, kill feed ends 168. Vitals end at x 372; column's leftmost
  pixel (an active pulled gun tile) at x 828; hint line 460 wide centred at 513 spans 283..743 at y 456..486, above the
  vitals' top (y ~498). Nothing touches.
- 1920x1080 (1422 x 800): same anchors; more open world in the middle.
- Drop map 340 at 821x462: x 12..352; zone line centred at 513, ~200 wide, starts at 413. Clear.

## 4. The right column (rack)

### 4.1 Tile anatomy

Every tile, left to right:
1. **Key notch**: an 18 x 18 keycap 6 px from the tile's left edge, vertically centred. Text 11 px Chakra bold.
   Shows the bound key from `settings.keys` via `capLabel` (defaults 1, 2, 3, 4, 5). Always shown in the column,
   regardless of `showKeyHints`: here the key is the content, not a hint.
2. **Picture**: gun tiles use `GunIcon` at 72 x 27 starting 32 px from the left edge; item tiles use the existing
   `ITEM_ICONS` (bandage, medkit, bomb) at 18 px, 32 px from the left edge. No words on the tiles.
3. **Count**, right-aligned 8 px from the right edge:
   - Gun tiles: magazine count only, Bungee 15, `tabular-nums`. The spare count lives in the ammo block.
   - Item tiles: `n/room`, `n` in Bungee 14, `/room` in Chakra 11 at cream 45 %. Example `2/4`.
4. **Grade line** (gun tiles only): 2 px bottom inner line in the gun's grade colour (`GRADE_CSS[rarity]`, common
   uses cream at 35 %). Same language as today's slots.

Shape: `panel-cut` with a 6 px cut (gun tiles) and 5 px cut (item tiles); the 10 px cut is too heavy at 30 px height.
Add a `panel-cut-sm` utility for this (engineering's call on the name).

### 4.2 States

Exactly one tile is **active** at a time: the gun in your hands, or the bomb while `bombOut`. A heal in progress makes
its tile active instead (bandage or med kit) for the duration.

| State | When | Look |
|---|---|---|
| Empty | gun slot has nothing; item count 0 | No fill. 1 px dashed border cream 18 %. Keycap outline only, text cream 50 %. Icon cream 30 % (gun slot: no icon). Count `0/4` all cream 35 %. |
| Has items | count > 0 and usable | Fill `ink-deep` 72 %. Keycap outline cream 50 %, text cream 90 %. Icon cream 85 % (gun in grade colour at 60 %). Count cream; `/room` cream 45 %. |
| Active | in hand / in use | Tile moves 10 px left (gun tiles 186 wide, item tiles 130 wide; the right edge stays). Fill `ink-deep` 90 %. 3 px gold `#ffd23f` bar on the left edge. Keycap filled gold, text ink. Icon at full colour. Using a bandage or med kit: the left bar is green `#3ddc84` instead of gold and a 2 px green line fills along the bottom with `using.progress`. |
| Full | count == room | As "has items", but `/room` goes to cream 100 % so `4/4` reads as one solid number, and a 1 px cream 35 % inner border. No new colour. |
| Cannot use | count > 0 but the key would do nothing now | Contents (icon, count) at 40 % opacity, fill stays. Keycap outline cream 25 %. Not dashed, so it never looks empty. |

Cannot-use rules (match the sim, `step.ts` `startHeal` and the bomb rule):
- Bandage: `hp >= 75`, or swimming, or another heal in use.
- Med kit: `hp >= maxHp`, or swimming, or another heal in use.
- Bomb: swimming, or a heal in use, or not on the ground.
- Gun slots never get this state (empty is its own state).

`HudState` needs two additions for this: `bombOut: boolean` and `canUse: { bandage: boolean; medkit: boolean; bomb: boolean }`
(the existing `canUse` boolean is used by touch; name the new one e.g. `itemReady`). Engineering's call on names.

Column visibility: the whole column and the ammo block show only on stage `ground` (fade in 0.2 s on touchdown, as
the guns do today). Hidden in the plane, free fall and under the canopy.

### 4.3 Motion

- Becoming active: the tile slides 10 px left in 120 ms `ease-out`; the one that stops being active slides back in 120 ms.
  Gold bar and keycap fill switch at the start, not tweened.
- Count goes up (pickup): the number scales 1 -> 1.25 -> 1 in 200 ms. A gun into an empty slot: the tile fill flashes
  to cream 20 % and back in 250 ms.
- Count goes down (used, thrown): no animation; the number just changes.
- Pressing a key that cannot act (empty or cannot use): the tile nudges 3 px left and back twice in 160 ms total, and the
  hint line shows the reason for 1.5 s (copy in 8).
- `reducedMotion`: no slide (switch in place), no scale, no nudge; the hint line still shows.

## 5. Ammo block (bottom right)

Box 176 x 56, `panel-cut`, `ink-deep` 85 %, right 12, bottom 12. Content right-aligned, 12 px padding:
- Magazine: Bungee 38, cream. Orange `#ff3d6e` at 0. Gold 70 % while reloading.
- A 1 x 28 divider, cream 25 %, 10 px gaps.
- Spare: Bungee 18, cream 50 %. Orange 80 % at 0.
- Reload: 3 px gold bar along the bottom fills with `reloading` (as today).
- Fists (no gun in hand): the fists outline icon 28 px and no numbers.
- Bomb in hand: bomb icon 24 px in gold, then `n` in Bungee 38 and `/room` Bungee 18 cream 50 %. Same box.
No gun name. The active gun tile above already shows which gun it is.

## 6. Bottom left: you

Mostly today's `Vitals` with the item chips taken out and the numeral larger.
- Health numeral: Bungee 34, right-aligned in a 52 px column at x 12, baseline on the health bar's bottom. Colour rules
  as today (low = red / colour-blind orange).
- Health bar: 200 x 12 at x 72, bottom 12. Notches every 25 (as today). Lag trail as today.
- Shield bar: 200 x 5, 4 px above the health bar, only with a vest.
- Name row: fighter name Chakra 11 in the fighter colour, left; shield points Bungee 10 blue, right. 4 px above the bars.
- Gear chips row, 6 px above the name row, height 18, gap 4, using today's `Count` chip:
  - Vest: vest icon in grade colour + roman grade (`I`, `II`, `III`). Only with a vest.
  - Pack: pack icon in grade colour + roman grade. Only with a pack.
  - Coffee: keycap `V` (when `showKeyHints`), coffee icon, `n/room`. Shown when `coffees > 0` or buzz is on.
  - Buzz: while `buzz > 0`, the coffee chip's icon and count turn gold and its seconds `14s` replace `n/room`; a 2 px gold
    line under the chip drains with the remaining buzz (20 s full). When buzz ends and coffees is 0, the chip goes.
- Super ring 44 and roll ring 36 right of the bars (x 284 and x 336), bottom 12, keycaps G and Shift as today. Unchanged look.

## 7. Everything else

- **Zone line**: top centre, unchanged in look and copy (the Haze strings from F-015).
- **Counters**: top right, unchanged.
- **Kill feed**: top right under the counters, `right 12`, `top 52`, rows 20 high, Chakra 12, `ink-deep` 75 %. Lines
  where you are the killer get a 2 px orange left bar. Max 5 rows, as the data already limits.
- **Hint line**: bottom centre, bottom 92, max width 460, `panel-cut`, Chakra 13. Grade colouring as today.
- **Heal progress**: bottom centre, its bar bottom at 132 (just over the hint line). Label: sentence case (`Bandage`),
  remove `tracking-wider` and bold-caps feel; Chakra 12 green.
- **Status line** (under the minimap, top 188, left 12), only when on:
  - fps: `60 fps · high` (lower case, no caps; orange under 40 as today).
  - net: `Host · 3/4 direct · 42 ms`, `Host · solo`, `Direct · 42 ms`, `Via server · 42 ms`. Sentence case, no `tracking-widest`.
- **Drop map**: in the plane the minimap grows to 340 in the same top-left spot (grows down and right).

## 8. Copy

Hint line on a key that cannot act (1.5 s, then the normal prompt returns). `{x}` = the bound key's label.
- Empty slot: `Slot 2 is empty` / `Slot 1 is empty`
- No items: `No bandages` / `No med kits` / `No bombs`
- Bandage at 75+: `Bandages heal up to 75 · {4} for a med kit` (if a med kit is carried) else `Bandages heal up to 75`
- Full health (bandage or med kit): `Health is full`
- Swimming: `Not in the water`
- Another heal running: `Already healing`
- Bomb in the air: `Land first`

No other new copy. The tiles carry no words.

## 9. Removed or moved

- **Removed**: the item chips row in `Vitals` for bandage, med kit and bomb (they live in the column now).
- **Removed**: the gun block above the minimap (`bottom-[222px] right-3`); the gun slots are the top of the column.
- **Removed from the round**: the full key list top left (`!touch && settings.showKeyHints && !firstRound`). It collides
  with the minimap and every key it names is either on a HUD keycap now or in How to play. Move the same list into the
  pause menu (Esc / P) as a keys panel. Update the CG checklist row "Show controls" to: "keycaps on every HUD action +
  key list in the pause menu + How to play".
- **Moved**: minimap bottom right -> top left. fps / net lines top centre -> under the minimap.
- `showKeyHints` off now hides only the ring keycaps and the coffee `V`; the column keycaps always show.

## 10. Must not change

Palette, fonts, `panel-cut`, gun silhouettes and item icons; crosshair, scope, place and elimination banners, damage
numbers, zone tint and pulse; the HUD fade rules for plane / fall / canopy; all touch layouts; any game logic.

## 11. Acceptance

1. At 821x462, 1216x684 and 1920x1080 (plus 1020x540 and 1366x768 from the layout matrix) no two HUD boxes overlap, and
   every box is at least 12 design px from each edge. Add these to the layout matrix with a box-overlap check on `data-hud`
   attributes (`minimap`, `vitals`, `rack`, `ammo`, `counters`, `feed`, `zone`, `hint`).
2. Screenshots at 1216x684 show: slot 1 active with rifle (gold bar, pulled out); then `5` pressed with 1 bomb (bomb tile
   active, slot 1 back in the rack, ammo block shows the bomb count); bandage `0/4` empty; med kit at full health (cannot use);
   bandages `4/4` full; a bandage in use (green bar, progress line).
3. Keys shown in the column follow rebinding (rebind 3 to Q: the bandage keycap reads Q).
4. At 821x462 the smallest text on screen is at least 8.8 real px (11 px at 0.8) and the count numbers are at least 11 real px.
5. Nothing in the HUD uses uppercase with letter-spacing.
6. Plane, fall and canopy: no column and no ammo block; drop map top left; on landing the column fades in within 0.2 s.

## 12. Limitations

- I could not run the game; positions come from the code, the two screenshots and arithmetic at the three sizes.
- The CG desktop overlay rule was not re-fetched this session.
- No research beyond the reference image Reis supplied; the rack idea is my own interpretation, not taken from that game.
