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

# R-009 review: map v2 slices 1 and 2 (854c038, 4481b70, 898aa41)

Verdict: **accepted with changes.** The valley works: from the plane at 1280x720 and 390x844 I can name Old Town (red
disc), the Container Yard (two gold bars over the river), The Campus (blue block with the green ring, the strongest read
on the map), the Railyard (rails and rust boxcars), Lakeside (pond and pier) and Deadwood (orange lookout in dark
green). Route 1 and the river read as the map's cross. The pole sign is a small gold dot (fine for a T2 place); the
mast and the windmill are the weakest reads (slice 3). Banner and minimap names are the right names in the right
places. Deviations in LOG 2026-11-22 are all accepted (see F-010 for two conditions). Items below are the changes.

## F-004 — Tall landmarks hide the player (HQ tower, cranes, water tower)
- What is wrong: landmarks are merged into the baked statics and never fade. s2-canopy-campus-390x844: landing beside the
  HQ, the whole phone screen is tower floors, the jumper is a speck at the bottom. s2-ground-campus (both sizes): the HQ
  covers the top half of the screen and anyone standing north of it. ground-yard-1280x720: the crane cab and beam sit
  right over the player; the player is a few red pixels between yellow bars.
- Why it matters: readability of your own fighter and of enemies beats landmark mass every time. Hot drops (Campus,
  Yard, Old Town) are exactly where this happens, and it is worst on phones.
- What should change:
  1. HQ tower height 18 -> **12 m** (4 window bands, not 6). Ring and roof colours unchanged. It still reads first from
     the plane (it is the only blue 6 x 6 roof).
  2. Split the tall parts out of the baked statics into one "tall landmarks" group: HQ body + roof + ring, water tower
     tank + lid, both cranes' top beam + cab + boom, lookout cabin + roof, mast above 6 m. Budget **+5 draw calls** max.
     Legs and footings stay baked.
  3. Each frame (ground and canopy), test the segment camera -> local player's chest against each tall part's AABB
     (inflated 1 m). On hit, fade that part to **opacity 0.3** over 0.15 s (alpha with depthWrite off, or a dither
     discard on low tier); restore over 0.3 s after 0.4 s without a hit. Shadows keep casting at full strength.
  4. Same rule for the plane camera is not needed (the plane is above everything).
- Expected result: in a scripted walk around and under each landmark at 1280x720 and 390x844, the local player is never
  hidden for more than 0.2 s; s2-canopy-campus-390 re-shot shows the jumper and the plaza through a ghosted tower.
- Related spec: map-v2.md section 5 (HQ height updated), section 11 (phones first-class).
- Priority: P0 (blocks Basic Launch)
- Status: accepted (CD re-review R-010, 2026-11-22)

## F-005 — Dead air vs round length: dead air wins
- What is wrong: dead air after 1:00 is 13.4 % (gate 10 %); p10 round length is 3:26 (gate 3:30). In the bot-sim they
  trade one for one.
- Why it matters: for Basic Launch the KPIs are conversion, playtime per session and D1, and a CrazyGames newcomer
  experiences *their* round, not the match: they land, loot, and then walk. Thirty quiet seconds in a four-minute round
  is the classic battle-royale quit moment. p10 being 4 s short is invisible to any player; a shorter round also means
  one more round (and more XP, R-006) per session. So: **dead air is the hard gate; round length is the soft one.**
- What should change (spec gates already updated in map-v2.md slice 2):
  - New gates: dead air **<= 10 %** (hard), median **4:00-5:30**, p10 **>= 3:00**, p90 <= 6:30, Deadline deaths <= 1.
  - Tune in this order, re-running 50 matches after each, and stop at the first step that meets the gates:
    1. `LANDING_GRACE.bot` 90 s +-50 % -> **50 s +-40 %** (bot vs bot only; NEWBIE human rules untouched). Today some bots
       cannot start a fight until 2:15, which is dead air after 1:00 by construction.
    2. First circle `wait 150 / shrink 70` -> **`wait 110 / shrink 90`** (the phase still ends about when it does
       now, but the first circle is shown 40 s earlier, so the field starts converging during the quiet stretch).
    3. `ZONE_RULES.lull` 20 -> **15 s**.
    4. Only if still over 10 %: the higher-pressure settings you already found, keeping the variant with median >= 4:00.
  - Do not: add bots, shrink the map, or raise damage.
  - Also log (report only, no gate) the human seat's quiet time in rookie rounds: seconds between landing + 30 s and the
    first enemy within 40 m or first shot taken.
- Expected result: one 50-match run meeting all five gates, numbers in LOG.
- Related spec: map-v2.md section 10 slice 2 gates; basic-launch-kpi.md.
- Priority: P0
- Status: closed (CD, 2026-11-22, R-010): accepted as built. Length gates relaxed to median 3:00-4:30, p10 >= 2:30, p90 <= 5:30; dead air <= 10 % stays hard. See map-v2.md "Round length decision".

## F-006 — Plane view is over any budget (high: 468 calls / 1.26M tris)
- What is wrong: plane-centre-1280x720 high tier: 468 calls, 1257k tris, 50 fps, worst frame 100 ms (s2-plane-* 381-501
  calls, 0.93-1.24M tris). My spec measured the plane view but gave no budget for it: my miss. Low tier plane is not
  measured. Several plane and ground shots show "worst 100 ms" frames.
- Why it matters: the drop is the game's best moment and the first thing a CrazyGames player sees; a hitch or 40 fps on
  a mid phone there costs conversion.
- What should change:
  1. Budget (added to map-v2.md section 9): plane / free fall **low <= 275 calls / 500k tris, high <= 460 / 950k**.
  2. In the plane and free-fall phases, size the shadow camera to the 120 m around the camera's look point, not the
     whole valley, and let trees outside it skip the shadow pass.
  3. Tree LOD by distance from the camera: beyond 90 m use a single low cone/blob variant (<= 20 tris) in the same
     chunked instances (no new calls). The outer forest beyond the tree ring may use the low variant always.
  4. Find the 100 ms frames: if it is first-use shader compile of the new landmark/boxcar/rail materials, prewarm with
     `renderer.compile` during the lobby countdown.
- Expected result: all six fixed views within budget on both tiers, no frame over 50 ms in a scripted plane-to-ground
  run, and one throttled run (Chrome 4x CPU, 390x844, low) logged before Basic Launch.
- Related spec: map-v2.md section 9.
- Priority: P1
- Status: accepted (CD re-review R-010, 2026-11-22)

## F-007 — HUD in the air: weapon card covers the drop minimap; canopy names collide
- What is wrong: (a) desktop plane shots: the weapon card (pistol 12/24 and slot 2) sits on the enlarged minimap and hides
  `Windmill Hill` and `Deadwood`. (b) phone plane shots: the drop minimap's left edge (x ~130) runs under the HP bar
  (x 12-205) and the `Mast Hill` label touches it. (c) under the canopy the minimap is back to its small size but still
  shows all 13 names, stacked on each other (canopy-oldtown, s2-canopy-railyard; s2-canopy-campus-390 shows four names
  covering the whole map).
- Why it matters: names during the drop are the reason slice 1 exists; covered or stacked names teach nothing.
- What should change:
  1. Hide the weapon card and slot 2 while in the plane, free fall and canopy (since R-006 nobody can fire in the air);
     fade them in over 0.2 s on touchdown. HP stays.
  2. Phone: the drop minimap's top edge sits 8 px below the HP bar's bottom; width unchanged.
  3. Names by minimap size: large drop minimap = all names; small minimap under the canopy = at most the **3 names
     nearest the jumper within 60 m**, placed in order of tier then distance, skipping any label whose box overlaps one
     already drawn; on the ground = only the place you stand in (as now).
- Expected result: re-shot plane and canopy views at both sizes show every visible label whole and no label overlapping
  another label or a HUD element.
- Related spec: map-v2.md section 9 (minimap), slice 1 item 6.
- Priority: P1
- Status: accepted (CD re-review R-010, 2026-11-22)

## F-008 — Market Square reads as a road with two gravel patches
- What is wrong: after the shift, Route 1 (asphalt with edge lines and yellow dashes) runs straight through the square
  (ground-market-1280x720, s1-banner-oldtown): it splits the one open space in Old Town into two halves. My spec put the
  square across Route 1 without saying how the road meets it.
- Why it matters: a square is a place you name and fight over; a road with verges is something you cross.
- What should change: between the square's north and south edges (y 47-53) the road paint stops (no edge lines, no
  dashes) and the square's paving runs continuous across x 60-61 in the square's colour, with a 1-tile darker kerb line
  on the square's outline only. Collision and walk speed unchanged. Nothing placed on the road tiles.
- Expected result: from the canopy and on the ground the square is one paved rectangle with the water tower in its
  north-east quarter; Route 1 visibly enters and leaves it.
- Related spec: map-v2.md section 4, Old Town.
- Priority: P1
- Status: accepted (CD re-review R-010, 2026-11-22)

## F-009 — Clouds cover the places in the plane view
- What is wrong: low cloud puffs (opacity 0.92) sit between the plane camera and the map interior: over the Yard and the
  Market in plane-centre, over Mast Hill's approach in s2-plane-mast.
- Why it matters: the plane view is where players pick a place by its landmark.
- What should change: clouds stay outside the inner **70 % of the map square** (over the edge forest and beyond); inside
  it, at most 2 thin puffs at opacity 0.45. Count and look of the outer clouds unchanged.
- Expected result: no landmark is covered by a cloud in any of the plane shots.
- Related spec: map-v2.md section 2 (name places from the plane).
- Priority: P2
- Status: accepted (CD re-review R-010, 2026-11-22)

## F-010 — Slice 3 dressing order and two conditions on accepted deviations
- Deviations accepted: lone houses 3 tiles from places, cabin at 5,49, conveyor at 78,48, motel 2-tile gaps, port
  offices at 90,38 / 90,75, the South field meadow. Conditions: (1) the conveyor slopes **into** the Quarry rect and its
  gravel cone stands inside it, not on the East lane; (2) the South field gets a cover element every <= 20 m along River
  Road (boulder pair or hay-bale stack), so section 8's road rule holds while the meadow stays a rifle space.
- Dress in this order (each one item, shots after each group):
  1. Mast: blinking red light (1 Hz emissive), red/white bands at least 1.2 m tall, 3 guy lines, gravel pad 1 tile wider
     (today it is the hardest landmark to spot from the plane).
  2. Windmill: sails 15 % larger and turning faster in the plane phase only, so the north has a moving read.
  3. Crossings: the Weir's grey deck with a low parapet; 2 hard-cover pieces at each end of all 5 crossings (section 6).
  4. Deadline centre rules with sim tests (section 7).
  5. Story props: Campus car park full, tipped boxcar, lodge campfire, boathouse deck.
  6. Cover pass to section 8 and the plain-grass share (report the % after).
- Expected result: slice 3 gate contact sheet (plane, 40 m canopy over each hot place, 390x844) where each landmark is
  identifiable, mast included.
- Related spec: map-v2.md sections 4-8, slice 3.
- Priority: P1
- Status: partly done (engineering, 2026-11-22): both conditions, items 1 to 4 (mast, windmill, crossings, Deadline centre rules with sim tests). Items 5 (story props) and 6 (cover pass and the plain-grass share) are not started; see LOG and R-010. CD 2026-11-22: items 1-4 and both conditions accepted; items 5 and 6 are post-launch polish and do not block Basic Launch.

## F-011
- What is wrong: one roof slope on most houses renders pure black (RGB 0,0,0) on a real GPU, on the main menu backdrop and in game. It does not show in SwiftShader (low tier, no shadows).
- Why it matters: reads as broken rendering in the first 10 s; the likeliest cause of a CrazyGames "overall quality" rejection.
- What should change / expected result / acceptance: see CREATIVE/cg-preflight-lcs-2026-11-22.md B1.
- Related spec: cg-preflight-lcs-2026-11-22.md
- Priority: P0 (blocks the CrazyGames submission)
- Status: fixed (engineering, 9ffeec9: house materials were fully metallic with no environment map)

## F-012
- What is wrong: at 1020x540 the Fighter panel opens with the picker out of view and the style chips cut by the footer.
- What should change: see cg-preflight-lcs-2026-11-22.md B2.
- Priority: P0 (cheap, same pass as F-011)
- Status: fixed (a1072bf); layout matrix 2026-11-24 clean at 1020x540 and every CG size

## F-013
- What is wrong: kill feed "you was caught by the Storm" (neutral.ts zone.caught with name 'you').
- What should change: "You were caught by the Storm"; check the other name-taking lines. See preflight B3.
- Priority: P0 (5 min)
- Status: superseded by F-015

## F-014 (R-015) — "Made for desktop" card: accepted
- Reviewed: ENGINEERING/desktop-only-card-844x390.png and `#desk` in portal/index.html.
- Verdict: accept as shipped. Title "Made for desktop", line "Last Commit Standing plays with a mouse and keyboard. Open it on a computer to drop in.", monitor-with-prompt icon (yellow `>`, green `_`). It matches the approved rotate card, is honest, and the prompt glyph ties to the commit theme without being a third-party icon.
- Must not change: background, fonts, colours, centred stack. Keep the trailing period (it is two sentences; the rotate card is one fragment, so the difference is fine).
- Status: closed (no change needed)

## F-015 (R-016) — Rename "the Storm" to "the Haze"; rename fighter "Bastion" to "Hedge"
- What is wrong: "the Storm" with "Storm closing" / "Final Storm" is Fortnite's zone wording; "Bastion" is an Overwatch hero name. Both read as borrowed to a CG reviewer checking originality.
- Decision: the zone is **the Haze** (fits the blue shimmer wall #6fb6ff over farmland; not the zone name of Fortnite, PUBG, Apex, Free Fire or CoD). The fighter `legacy` is **Hedge** (farmland hedgerow = a living wall; role "Defender" and super "Barricade" stay).
- Exact strings, src/game/copy/neutral.ts:
  - `zone.name`: `'the Haze'`
  - `zone.waiting`: `'Haze moves in'`
  - `zone.closing`: `'Haze closing'`
  - `zone.final`: `'Final Haze'`
  - `zone.outside`: `'Outside the safe zone!'` (unchanged)
  - `zone.caught`: you -> `'You were caught in the Haze'`; others -> `` `${who} was caught in the Haze` ``
  - `intro.line`: `'Land, grab a gun and stay inside the safe zone as the Haze closes in. The last one standing wins.'`
  - `fighters.legacy.name`: `'Hedge'`
- portal/index.html boot tip (line ~202): `'The safe zone closes phase by phase, and the Haze hurts more each time.'`
- src/components/Match.tsx lines 515 and 1062: change "Caught outside by" to "Caught in" when the cause is the zone, so it reads "Caught in the Haze." (keep "Caught outside by {weapon}" only if killedWith can be a weapon there; otherwise just use "Caught in {COPY.zone.name}").
- Also check studio.ts `zone` and any portrait/asset file names or alt text with "Bastion"/"Storm" (grep found none player-facing in src/ and portal/ besides the above; the world.ts "storm" is a code comment, leave it).
- Capitalise "Haze" everywhere; every new string is no longer than the old one.
- Supersedes F-013 (the caught line is fixed by this item).
- Acceptance: `grep -rni "storm\|bastion" src portal` returns only code comments/tests.
- Status: fixed (engineering, 8110e7c, 2026-11-24)
