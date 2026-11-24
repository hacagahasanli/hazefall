# CrazyGames pre-flight: Last Commit Standing (portal-build a1072bf), 2026-11-22

## Verdict: FIX FIRST, then submit tonight

The build is at or above the level of the shooters on crazygames.com/new today in menu polish, HUD, round report and
performance. One rendering defect is the kind of thing that reads as "not finished" in the first 10 seconds: pure
black roof slopes on the houses, on the main menu backdrop and in every house view during a round. Fix it (plus two
cheap layout and copy fixes, under 2 h together), re-shoot the menu on a real GPU, then submit.

Shots: `docs/collab/CREATIVE/shots/cg-preflight/` (paths below are relative to that folder).

## How this was tested

- Build: `dist/portal` built at 13:37, the same time as commit a1072bf, served with `vite preview --config
  vite.portal.config.ts --port 3210`. Note: port 3204 on this machine was running the **web** build (`vite.web.config.ts`),
  which shows "Online · Coming soon", "Online is coming, tell me when" and "Support us". The portal build with the
  CrazyGames platform active shows none of these (checked). Do not judge the portal from 3204.
- The CrazyGames SDK was stubbed (`environment: 'crazygames'`, ads finish at once), so the game ran its CrazyGames path:
  `loadingStop` fires, `gameplayStart` at drop, `gameplayStop` on pause and on death, `gameplayStart` again on resume.
- Headed Chromium on an Apple M-series GPU, 1020x540 and 860x484 (two full rounds, menu screens, pause), 390x700 touch
  emulation (menu, lobby, plane, canopy), plus one SwiftShader (software GL) run for comparison.
- Played by script (move, J to shoot with auto-aim, F, Space), not by hand. I saw stills, not motion; I could not listen
  to audio (14 sound files loaded, AudioContext running, no console errors).
- References opened on crazygames.com/new: Rift Trooper, Zero Gravity Battleground, SWAT OPS: Body Camera, March.io
  (`cg-ref-*.png`). All released Nov 2026, rated 8.4-9.6. What they share in the first 30 s: a title or menu, then
  gameplay with the controls shown in the game itself (SWAT: WASD + mouse prompts with "hold F to skip tutorial";
  March.io: "Steer with WASD" card with Skip; Zero Gravity: key list on the HUD). LCS does this too with contextual
  hints (`Space · jump`, `Hold Left Shift · dive`, `Loot nearby`, `Out of ammo · find an ammo box`), so it meets the norm.

## What is good (keep)

- Load: menu at 2.8 s on localhost; the boot screen with the plane over the real map and a real progress bar, then a
  crossfade into the live menu (`g1020-01-boot.png`, `c1020-02-menu.png`).
- Main menu over the live map with parachutes coming down; clear PLAY with "Solo · 19 bots"; daily goals; level bar.
  No placeholder text, no debug UI, no outbound links in the CrazyGames path.
- Lobby with 3D fighters, roster filling to 20/20, a Ready button with its key, and a countdown (`c1020-20-play-0.png`).
- Plane view with named places on the minimap (`g1020-11-pre-5.png`), canopy (`g1020-20-play-6.png`), Old Town
  landing (`h860-12-fall-13.png`), damage numbers, storm tint and a red "Outside the safe zone!" timer (`g1020-20-play-128.png`).
- Pause: Resume / Settings / Quit to menu (`h860-13-pause.png`). Settings has tabs, key rebinding, aim mode.
- Round report: big placement, cause ("Taken out by WAFFLE with an explosion"), kills / damage / time, XP lines,
  level bar, next reward, Play again + Main menu (`g1020-30-report.png`, `h860-30-report.png`). Better than any of the
  four references.
- Performance: a steady 120 fps in play at both iframe sizes, p95 frame 9 ms, no hitches over 50 ms during play. Two
  one-off stalls: about 1.0 s on the first menu frame (under the boot screen's exit) and about 0.7 s at the lobby to
  match switch. Neither is in gameplay.

## BLOCKERS

### B1. Pure black roof slopes on houses (main menu and in game). The only rejection-grade item.

- Evidence: `c1020-02-menu.png`, `gpu-menu-tier-high.png` (menu backdrop: the houses in the centre each have one slope
  in black), `h860-12-fall-13.png` (landing in Old Town: three of four houses show a black half-roof), `h860-20-play-9.png`.
  Sampled pixels are RGB (0,0,0) and (1,2,4): true black, not dark shade.
- Not in `swiftshader-menu-1020.png`: software GL picks the low tier (no shadows), and the same roofs show two normal
  shades. So this shows on real desktop GPUs (what the reviewer uses) and probably never showed in headless or
  software-GL captures, which would explain how it got through earlier reviews.
- Why it matters: it is the first thing behind the logo, and from the default camera every house you run past has a
  black hole for a roof. To a reviewer it reads as broken rendering, which is the "overall quality" kind of rejection.
- Fix spec (engineering finds the cause; the candidates I would check first, from reading `render/world.ts`):
  1. The roof slopes use `MeshStandardMaterial({ vertexColors, side: DoubleSide, flatShading })` with `castShadow` and
     `receiveShadow` both on. A double-sided mesh that casts onto itself is a known cause of a fully shadowed slope.
     Try `roof.receiveShadow = false`, or `shadowSide: THREE.FrontSide` on the roof material, or a `shadow.normalBias`
     of about 0.02-0.05 on the sun.
  2. If shadows are not the cause: check that the side away from the sun gets hemisphere light (no NaN or zero-length
     normals from `flatShading` on DoubleSide), and that the doorway cut from 24cdf2b does not open the shell into an
     unlit inside.
  3. Check the same thing on the barn roof (`roofMat`, DoubleSide, flat) and the gables.
- Acceptance: on a real GPU (Apple, plus one Windows Chrome if anyone has one), menu at 1020x540 and an Old Town landing
  at 860x484: no roof or wall face below about 15 % of its sunlit side's brightness, and no region of RGB under (8,8,8)
  bigger than a few pixels on any building. The shaded slope should look like a darker version of the roof colour.
- Do not change: the roof colours, the lighting mood, the perf tiers.
- Estimate: 30-90 min including re-shooting.

### B2. Fighter screen at 1020x540 hides the fighter picker (cheap, do it with B1)

- Evidence: `c1020-03-fighter.png` (what opens: one big Blaze card, the Outfit/Gun/Canopy/Smoke chips cut by the footer
  bar with their labels hidden, no other fighters in view, no sign the panel scrolls) against `fighter-scrolled-1020.png`
  (the real content: "Pick a fighter" with all four, 286 px further down). At 860x484 the same panel fits much better
  (`fighter-scrolled-860.png`): 1020x540, the CrazyGames default, is the worst case.
- Why it matters: the reviewer clicks FIGHTER, sees one character and half-cut chips, and either thinks there is one
  fighter or that the layout is broken.
- Fix spec: when the viewport height is 600 or less, the "Pick a fighter" row must be fully visible without scrolling.
  Simplest: cap the hero card at about 170 px high there (stats left, the model smaller on the right, as at 860x484)
  and put the chips in one row beside the stats or under the picker. Alternative: move "Pick a fighter" above the hero
  card on short screens. Also give the scroll area a bottom fade (24 px, panel colour) whenever more content is below.
- Acceptance: at 1020x540 and 860x484, opening FIGHTER shows all four fighter cards and the four chips with labels,
  with nothing cut by the footer.
- Estimate: 30-45 min.

### B3. Kill feed says "you was caught by the Storm" (trivial)

- Evidence: run text at 3:22 in the 1020 round (`g1020-20-play-128.png` is just before it; the line shows in the feed
  when the storm knocks you out).
- Cause: `src/game/copy/neutral.ts` line 25, `caught: (who) => \`${who} was caught by the Storm\``, called with
  `name: 'you'` (`Match.tsx` around line 677).
- Fix spec: when the knocked-out fighter is the player, the line reads "You were caught by the Storm". Check the other
  feed lines that take a name for the same "you" case. Also check `studio.ts` for the same pattern.
- Not rejection-grade alone, but it is in front of the reviewer at the moment they die, and it costs 5 minutes.

## NICE-TO-HAVE (do not block the submission)

1. HUD health number overlaps the bar: "100" touches the first bar segment and sits under the fighter name, with no
   plate behind it (`hud` crop of `g1020-20-play-11.png`, also the phone shots). Give the number 6 px clearance and the
   name its own line above the bar.
2. Landing at the map edge: jumping the moment the plane starts drops you into the edge forest, with a flat untextured
   green field filling the top half of the screen (`g1020-20-play-0.png`, `g1020-20-play-11.png`). Darken or texture the
   outside ground, or keep the plane path start inside the tree ring.
3. Solo lobby wait: Ready only works once the fake roster fills (about 5 s), then a 10 s countdown. Load to gameplay is
   about 18 s plus the flight. Fine for a battle royale, but letting Ready count from the first second would cut 5 s.
4. Lobby on first open at 860x484 and on the phone: the 3D scene is a dark empty plane and ground for the first second
   before fighters appear (`h860-10-lobby.png`, `p390-contact.png`). A short fade-in once the models are in.
5. Phone portrait: the "Hold DIVE · dive to go farther, faster" hint sits over the Q/E and SUPER buttons
   (`p390-contact.png`, fourth panel). Move hints above the button cluster on touch layouts.
6. How to play at 1020x540: Pause is cut by the footer (`c1020-05-howto.png`); same bottom fade as B2.
7. Lobby duplicates the count ("Lobby full 20/20" and "MATCH LOBBY 20/20"); the Rush line runs across the 3D fighter's
   head (`c1020-11-pre-7.png`).
8. The 0.7 s stall at the lobby to match switch: if it ever lands on a visible frame, precompile the match materials
   (`renderer.compileAsync`) during the countdown.

## Not checked (limits)

- Real CrazyGames iframe with real ads (midroll and rewarded flow), the QA tool, and a real phone.
- Audio by ear.
- Windows or low-end GPUs. The `?tier=` URL override did not seem to change the tier in my runs, so I could not confirm
  whether B1 also shows on the medium tier, only that it shows on this Mac's automatic tier and not in software GL.
- A hand-played round with real aiming. The scripted rounds ended at #2 of 20 after 3:22 (storm, 0 kills) and at #20
  after 0:48 (explosion).
