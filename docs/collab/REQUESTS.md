# Requests (Claude Code -> Creative Director)

Format: `## R-001 — title` then Context, Expected deliverable, Priority (P0-P3), Status (open | in-progress | done | blocked).

## R-001 — Initial creative audit and direction
- Context: First run. See CREATIVE_DIRECTOR.md section 12.
- Expected deliverable: BRIEF.md, CREATIVE/ core docs, CREATIVE/research/, creative audit, prioritized roadmap.
- Priority: P0
- Status: deferred (Reis 2026-11-21: do R-002 first; run a light audit later)

## R-002 — Parachute (canopy) feel: legs and turns
- Context: Reis playtest feedback (verbatim intent): under the canopy the legs are stiff — they should bend and feel alive, not hang straight; left/right turns are far too extreme and elastic, the jumper almost flips over. Current implementation is described in docs/SKYDIVE.md. Code facts (do not edit code): canopy bank spring in src/game/render/chute.ts `bankWant = clamp(yawV*0.55, ±0.7 rad)` (~40°) on an under-damped spring (damping ratio 0.5); body hangs from a pendulum spring in src/game/render/characters.ts `poseChute` (legs dangle, toggles pull down in turns, body twists into turns). Sim (src/game/sim/step.ts) steers canopy horizontal velocity with first-order momentum. Total drop time (~8.2 s) and the deterministic sim must stay unchanged.
- Expected deliverable: CREATIVE/specifications/canopy-feel.md — the target feel in measurable terms engineering can tune to: leg pose under canopy (knee/hip bend ranges, how they respond to swing, turns, flare, landing), max bank and body swing angles for a full-input turn, how fast turns settle (overshoot allowed or not), how the camera should read it, and what to avoid. Reference real paragliding/skydiving canopy behaviour, original look only.
- Priority: P0
- Status: done (spec ready for implementation: CREATIVE/specifications/canopy-feel.md, 2026-11-21)

## R-003 — Review canopy-feel build (1c1f652)
- Context: R-002 spec implemented in commit 1c1f652; deviations listed in LOG.md 2026-11-21 entry. Frames: ~/.agents-know/personal/feedback4/shots/lcs-canopy-feel/ (contact sheets after-desktop-contact-sheet.png, after-phone-contact-sheet.png + per-frame PNGs for left/right/reverse/flare).
- Expected deliverable: accept, or F-xxx items in FEEDBACK.md with exact changes. Judge the deviations too.
- Priority: P0
- Status: done (accepted 2026-11-21; deviations 1-4 accepted; one non-blocking follow-up F-001, P2. Reis's playtest stays the final check.)

## R-004 — Results screen stat cards (Kills / Damage / Survived) redesign
- Context: Reis (verbatim, Azerbaijani): "qırağında xətt dizaynı olmasın, başa düşülür ki standard Claude dizaynıdır, redesign qəşəng et gəlsin" = no coloured edge-line on the side; it reads as a generic AI-made design; redesign it beautifully. Screenshot: CREATIVE/research/reis-results-stats-2026-11-21.png. Code: src/components/Match.tsx ~line 232 (`stats` array) and the grid below it: `panel-cut` cards, bg-ink/90, `boxShadow: inset 3px 0 0 <color>` (the edge line), icon (StatGlyph, hidden on phone), big display-font number + small label, rise-in animation. Colours: kills #ff3d6e, damage #ffd23f, survived #3ec5ff. Scope: ONLY these three cards — the rest of the results screen stays as it is. Must work at phone width (3 columns, small heights ≤520px) and with reduced motion. No eyebrow labels, no left/side accent stripes, nothing that reads as a template dashboard tile.
- Expected deliverable: CREATIVE/ui/results-stats.md — exact visual spec (shape, background, how colour identity is carried without an edge line, number/label typography, icon treatment incl. phone, spacing, entrance animation, states like 0 kills), CSS-level values engineering can implement directly.
- Priority: P0
- Status: done (spec ready for implementation: CREATIVE/ui/results-stats.md, 2026-11-21)

## R-005 — Review results stat stickers build (9bc1550)
- Context: R-004 implemented in 9bc1550; deviation in LOG.md (phone number size). Shots: ~/.agents-know/personal/feedback4/shots/lcs-results-stats/ (win-desktop, win-phone 390, win-phone360, win-landscape 640x360; *-mid = mid-animation). Zero state not captured.
- Expected deliverable: accept, or F-xxx items.
- Priority: P0
- Status: done (reviewed 2026-11-21: direction and finals accepted; phone 1.9rem deviation accepted; F-002 band stretch during count-up, F-003 phone gaps, both P1. Zero state still unverified: capture one 0-kill/0-damage frame with the F-002/F-003 fix.)

## R-006 — CrazyGames Basic Launch KPI plan
- Context: Reis (urgent): LCS goes to CrazyGames Basic Launch after Parking Lot's review. Full Launch needs avg playtime 10+ min, D1 10-15 %, conversion (1+ min played) 80 %+, CTR top 20 % of Shooting. Online is not in the portal build. Judge the cold-start build, covers (docs/portal/covers/) and preview videos.
- Expected deliverable: CREATIVE/specifications/basic-launch-kpi.md — at most 8 ranked changes, each tied to one KPI, impact, effort, exact spec; top 3 doable in 1-2 days.
- Priority: P0
- Status: done (CD 2026-11-22): spec ready. Top 3: safe first drop (no firing in the air, 24 spare pistol rounds, gentler bots for the first 3 rounds), career level with canopy unlocks saved via platform.storage, new covers + recut preview video.

## R-007 — Cover key art at CrazyGames-homepage level
- Context: Reis showed the CrazyGames homepage covers that win (_studio/refs/crazygames-top-covers-1.png, -2.png) and wants ours at that level. Constraint from engineering: no image generation, so covers are rendered in three.js from the game's own models, with a code/SVG title.
- Expected deliverable: one studio-wide spec, a section per game with 2 concepts (A primary, B alternative): staging, camera, 16:9/2:3/1:1 grids, CrazyGames badge zone, lighting and palette, effects, title, a 240 px thumbnail test, plus rules for every cover.
- Priority: P0
- Status: done (CD 2026-11-22): ~/Desktop/projects/games-studio/_studio/creative-collab/covers-keyart-spec.md, section 2. A "Hot drop": Blaze huge under the cropped orange/cream canopy, banking, pistol out with a muzzle flash, on a blue sky with the hazy valley low; title low-left. B "Outrun the Deadline": Rookie vaults a farm fence toward the camera with the blue zone wall behind. This replaces the cover part of CREATIVE/specifications/basic-launch-kpi.md (the preview-video part stands). After rendering, file a review R-item with covers-small-card-check.png.

## R-008 — Map v2: an immersive 240 m battleground before Basic Launch
- Context: Reis wants the LCS map redesigned before the CrazyGames Basic Launch (after Parking Lot's review, a few days). Sources: opportunity-research/sprint-2026-11/br-proposal.md (240 m, ~10 named places, Deadline v2, loot tiers) and feedback4/spec-lcs-visual-quality.md (environmental storytelling, immersive map, satisfying exploration). Goals: named places with identity, landmarks visible from the drop, roads/river/bridges, hot drops vs quiet edges, fair for 20, rounds ~4-6 min, phone-safe (existing GLBs and procedural props only), original look.
- Expected deliverable: CREATIVE/specifications/map-v2.md with a tile-scale layout (CREATIVE/levels/map-v2.svg), each place (size, buildings, loot tier, landmark, reason to go), road/river network, drop-path and Deadline centre rules, sightline/cover notes, density and draw-call budgets, phased build order with a 1-day shippable slice 1.
- Priority: P0
- Status: done (CD 2026-11-22): spec and SVG ready. 120 x 120 tiles, today's map kept and shifted +16, 13 places (4 hot: Old Town, Container Yard, The Campus, Mast Hill), 9 code-made landmarks each with its own colour and top-view shape, 5 river crossings, Route 1 spine. Slice 1 (1 day): water tower + Market Square, twin cranes, pole sign, farm names, place banner, names on the minimap during the drop, all on today's map.

## R-009 — Review map v2 slice 1 and slice 2 shots
- Context: R-008 slices 1 and 2 are built (LOG 2026-11-22: commits 854c038, 4481b70, 898aa41). Shots: ~/.agents-know/personal/feedback4/shots/lcs-map-v2/ (s1-*: Market Square and water tower, cranes, pole sign, place banner on desktop and phone; plane-*, canopy-*, ground-*, s2-*: the 240 m valley from the plane, canopy and ground at 1280x720 and 390x844).
- Expected deliverable: accept, or F-xxx items: can you name the places from the plane, are the landmarks readable by shape and colour, is the banner and minimap naming right, what to dress in slice 3. Also say what to do about dead air (13-15 % against the 10 % gate, it trades one for one with round length in the bot-sim) and the lone-house, cabin and conveyor positions that moved from the plan (see LOG).
- Priority: P0
- Status: done (CD 2026-11-22): accepted with changes, F-004..F-010 in FEEDBACK.md

## R-010 — Re-review F-004 to F-010 (map v2 review round 2)
- Context: F-004 to F-009 are built, and F-010 items 1 to 4 plus both conditions (LOG 2026-11-22, commits 22ca711 and 5cb5183). Shots: ~/.agents-know/personal/feedback4/shots/lcs-map-v2-r2/ (r2-plane-*: eight plane views at 1280x720 and 390x844; r2-canopy40-*: 40 m over Old Town, the Yard, the Campus and Mast Hill; r2-canopy-* and r2-ground-*: low canopy and ground beside the HQ tower, the water tower and the cranes, where the fade shows, with r2low-* for the low tier's dither; r2-contact-sheet-slice3.png: the slice 3 gate contact sheet at 390x844).
- Expected deliverable: accept or F-xxx items. Please judge: (1) the ghosted tower, cranes and water tower (does the player read, does the fade pop); (2) the Market Square across Route 1 and its kerb (the kerb is left open where the road enters); (3) the mast (6 m red and white bands, 1 Hz light with a glow disc, three guy lines, wider pad) and the windmill from the plane; (4) the minimap names (all in the plane, three under the canopy), the weapon card put away in the air and the phone drop layout; (5) the plane view from the cheaper far trees (a flat lump or a 6-sided cone past 90 m, always for the forest outside the map); (6) clouds (none inside the map's inner 70 %, none within 30 m of a landmark; I added no thin puffs inside); (7) decide what to do about the round length: dead air is now 3 to 4 % (gate 10 %) but the median is about 3:25 against 4:00-5:30 and p10 about 2:40 against 3:00. Every knob that removed dead air shortened rounds (LOG has the table); the Deadline's late phases do not change a round's length at all. Either relax the length gates to what the sim gives, or name a lever that keeps fights spread out without more kills per fight (no more bots, no smaller map, no more damage were off the table).
- Priority: P0 (blocks Basic Launch: the length gates)
- Status: done (CD, 2026-11-22): all items accepted; round length accepted as is with relaxed gates (map-v2.md "Round length decision"). Not blocking Basic Launch.

## R-011 — Progression v2: slower levels, rewards worth wanting
- Context: Reis played the build: leveling is far too fast and 11 canopy colours feel pointless ("what is their advantage?"). Wants rewards that mean something: fighter outfits and/or weapon skins. Rounds ~3-4 min (map v2), instant rematch; KPIs playtime 10+ min, D1 10-15 %. Code: src/game/career.ts, progress.ts, canopies.ts, report XpPanel in Match.tsx, lobby PreMatch.tsx.
- Expected deliverable: CREATIVE/specifications/progression-v2.md with XP sources and curve (numbers), full unlock table, visuals per item (hex, mesh parts), equip UI and unlock moment, daily goals/streak tuned; cosmetic only, ~1 day to build.
- Priority: P0
- Status: done (CD, 2026-11-22): spec ready. xpToNext = min(900, 230 + 35(L-1)); round XP roughly halved (avg ~65); L2 round 2-3, L5 day 1-2 (hooked), L10 ~a week casual, L20 ~80 rounds. Track: 5 outfit sets (Dark Mode 3, Arctic 7, Synthwave 12, Terminal 17, Legend 20), 6 gun finishes (Arctic 4, Cherry 8, Gold Build 10, Terminal 14, Synthwave 18, Ember streak 7), canopies as filler, milestones L5 Drop Smoke, L10 Gold Build, L20 Legend. Lobby Style row + tray with locked preview, report reward card, bots wear rewards (render only). "Looks only. Stats never change."

## R-012 — Review the progression v2 contact sheet
- Context: R-011 is built. Rigs and guns are drawn with the game's lights from a tilted camera, not captured in a round.
- Expected deliverable: a verdict on the contact sheets in ~/.agents-know/personal/feedback4/shots/lcs-progression-v2/ (sheet-outfits, sheet-finishes, sheet-guns at 390x844 and 1280x720): do all four fighters keep their silhouettes in all six sets, do the sets read apart at gameplay distance, do Terminal and Legend stand out enough, does Gold Build read as gold (metalness was capped, see LOG). Also the lobby tray (tray-*) and the Level 5 gold card (report-l5-*, report-l6-* for a normal card).
- Priority: P1
- Status: open

## R-013 — Public online play flow (quick match, bots fill, CrazyGames)
- Context: Reis wants online to be the most fun part: public servers with random people, bots fill when too few humans gather in time, more humans as players grow, must work on the site and CrazyGames. Current online = private friend rooms, host-browser authority, hidden on CG.
- Expected deliverable: CREATIVE/specifications/online-public-flow.md (flow, matchmaking rules, boarding screen, CG Instant Multiplayer/room data, disconnect/rejoin, 3 am case, abuse basics, copy, KPIs, phased rollout).
- Priority: P1
- Status: done (spec ready, 2026-11-22; 3 open engineering questions in section 14)

## R-014 — Mobile + gameplay quality audit and plan (phases 1-3)
- Context: owner brief before CrazyGames: too many mobile bugs, oversized UI, lobby names overlapping the top bar, touch controls, mobile camera, gameplay quality, CG readiness. QA runs a parallel technical bug hunt (ENGINEERING/mobile-bug-hunt.md).
- Expected deliverable: CREATIVE/specifications/mobile-quality-audit.md with problems, root causes, P0-P3, parallel work packages, tests, CG readiness.
- Priority: P0
- Status: done (CD, 2026-11-22): audit + plan ready. P0: lobby overlap (incl. CG 907x510), touch UI by touch detection (CG technical requirement), desktop shoulder camera inside tree crowns. Work packages WP-0 (device profile + layout test, first), A lobby/HUD/report, B touch/input/cameras (owns game.ts), C feel/feedback, D perf/render.

## R-015 — Review the "Made for desktop" card (portal build, desktop only)
- Context: Reis made LCS desktop only after the CrazyGames rejection (2026-11-24). On a phone or tablet (CG SDK `systemInfo.device.type`) the portal build shows one card instead of the game. Engineering reused the approved rotate-card look (same background, fonts, colours); the icon and the copy are placeholders: "Made for desktop" / "Last Commit Standing plays with a mouse and keyboard. Open it on a computer to drop in."
- Expected deliverable: accept or replace the title, line and icon. Shot: ENGINEERING/desktop-only-card-844x390.png.
- Priority: P1 (before the CG resubmit)
- Status: open

## R-016 — Rename "the Storm" (originality risk before the CG resubmit)
- Context: CrazyGames requires original names and content; LCS was rejected for "overall quality" on 2026-11-24. The shrinking zone is called "the Storm" with HUD lines "Storm moves in", "Storm closing", "Final Storm", "You were caught by the Storm" (src/game/copy/neutral.ts `zone`, also studio.ts and the boot tips in portal/index.html). Fortnite calls its zone "the Storm" with near-identical wording; a CG reviewer may read LCS as a Fortnite-alike. See ENGINEERING/cg-copyright-list.md.
- Expected deliverable: a new zone name and the exact lines for every `zone` key (name, waiting, closing, final, outside, caught for you/others) plus the boot tip, fitting the game's world (paratroopers, farmland map). Also say whether the fighter name "Bastion" should stay.
- Priority: P0 (blocks the CG resubmit)
- Status: open
