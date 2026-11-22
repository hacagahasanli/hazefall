# Mobile and gameplay quality audit: Last Commit Standing (portal-build b8e5c2b), 2026-11-22

Phases 1-3 of the pre-CrazyGames quality project: audit, prioritise, plan. Nothing here is implemented. Nothing in this
document is called fixed unless a commit and a screenshot say so.

Owner: Creative Director. Companion: `docs/collab/ENGINEERING/mobile-bug-hunt.md` (QA's technical bug, performance and
responsive-matrix measurement). When this audit was finished that file was still a one-line placeholder, so this
document does not reference any QA findings. Pure bugs and frame-time numbers belong in QA's file; where they overlap,
QA's measurements win.

Screenshots: `docs/collab/CREATIVE/shots/mobile-audit/` (below, file names only). Raw measurements (element boxes,
button sizes, overlaps per size): `shots/mobile-audit/measure.txt`. The capture script that made both:
`shots/mobile-audit/audit-capture.mjs` (playwright-core 1.65, Chrome for Testing with Metal, run from a scratch folder
against `npx vite --config vite.portal.config.ts --port 3263`). Use it as the starting point for the layout test in WP-0.

---

## 0. How this was tested, and what I could not see

- Build: `portal-build` at b8e5c2b, the portal (CrazyGames) build served by Vite dev, CrazyGames SDK stubbed with
  `environment: 'crazygames'` and `systemInfo.device.type` set per profile.
- Real Chromium with the GPU (`--use-angle=metal`). Phones: touch, `isMobile`, DPR 3, Android Chrome UA. Tablets: touch,
  DPR 2. Desktop: mouse, DPR 1. One context at a time (two parallel GPU contexts slowed the game enough to produce false
  failures; those runs were thrown away).
- Sizes (all landscape unless noted; phones are played in landscape, portrait shows the rotate card):

  | Device class | Sizes run | Note |
  |---|---|---|
  | Phone (320/360/375/390/412/430 wide in portrait) | 568x320, 640x360, 667x375, 844x390, 915x412, 932x430 | `--ui` 0.75, 0.84, 0.88, 1, 1, 1 |
  | Phone portrait | 390x844 | rotate card |
  | CrazyGames mobile | 800x450 | CG's listed mobile size |
  | Tablet (768/820/1024) | 1024x768, 1080x607 (CG's listed tablet size), 768x1024 portrait | 1180x820 not run (see limits) |
  | CrazyGames desktop iframe | 1020x540, 860x484, 907x510 (CG listed) | |
  | Desktop | 1366x768 (CG listed), 1920x1080 | 1280x720 and 1440x900 not re-run in this pass |

- Flow per size: boot, menu, Play, lobby at first frame and full, Ready, plane, free fall, canopy, ground, a full touch
  cluster (sniper + second gun + bandage given by script), firing at a bot placed 5 m away, pause, forced win report.
- Measured from the DOM: every lobby header box against every lobby panel box, every touch button's size and position,
  HUD boxes against buttons, buttons against buttons, button area as a share of the screen.
- Read the code for: `PreMatch.tsx`, `TouchControls.tsx`, `phoneUi.ts`, `orientation.ts`, `staging.ts`, the camera,
  auto-aim and touch-input parts of `game.ts`, `feedback.ts`, `settings.ts`, sim constants (weapons, MOVE).
- CrazyGames docs fetched today: requirements/quality, requirements/technical, requirements/gameplay.
- Skills used as the bar: gamedev-router, game-ui-ux, input-systems (and its touch reference), camera-systems,
  web-game-feel, fps-shooter, performance-optimization, web-game-vision.

Limits (do not read more into this audit than this):

- Stills, not motion. Playwright drove the game by script; I did not play by hand, so stick feel, turn feel and
  camera smoothing are judged from code and frames, not from my thumbs.
- No audio heard.
- No real phone. Emulated touch and DPR do not show real thermal throttling, real Safari/iOS behaviour, system gestures
  or notch safe areas. Every touch item below needs the device test in its package.
- The web build (`dev:web`) shares the lobby (`PreMatch`) with the portal build; online rooms are not in either Vite
  build today, so online lobby states (human names in a room) were not tested.
- 1180x820, 1280x720 and 1440x900 were not re-run in this pass (time); the 1366x768 and 1920x1080 results bracket them.
- Frame timing was not measured here (QA's job).

---

## 1. Current state in one paragraph

The game is in better shape than the owner's frustration suggests at 800x450 and above: the loop is complete, the
menu over the live map is strong, the round report is better than the CrazyGames references, hit feedback (hitmarker,
damage numbers, hitstop, flinch) exists, no console errors at any size. What makes it feel unfinished on phones is
structural, not cosmetic: (1) the lobby is built from two independent fixed-position stacks that collide on short
screens, (2) the touch layer shows eleven buttons, most of them shrunk below a thumb's size on small phones, with no way
to choose a target, (3) the top-down camera uses the desktop distance on a phone, so your fighter is about 12-18 px
tall, and (4) several phase screens (plane, air, lobby countdown, report on 568x320) stack overlays on each other. On
desktop the default over-the-shoulder camera pushes itself into tree crowns. None of this needs new features; it needs
the layouts and the camera to be designed for the screen they run on.

---

## 2. What is good (keep, do not touch)

- Menu over the live map with canopies drifting down (`844x390-01-menu.jpg`); the logo; daily goals; level line.
- Round report at 667x375 and up (`667x375-12-report.jpg`, `1020x540-12-report.jpg`).
- Pause menu: three clear buttons, readable at 568x320 (`568x320-11-pause.jpg`).
- Damage numbers and hitmarker read at phone size (`568x320-10-firing.jpg`: "-80" is clear).
- Rotate card (`390x844-01-portrait.jpg`) and the phone pixel budget idea.
- The canopy view on desktop (`1020x540-07-canopy.jpg`): canopy, valley, landmarks, it sells the game.
- The lobby's 3D squad by the plane (`1366x768-03-lobby-full.jpg`): the right idea; it only needs framing and space.
- Identity: low-poly, the four fighters, the cream/gold/green palette, the slanted panel cut. Keep all of it. Nothing in
  this plan adds neon, glass, glow edges or generic sci-fi chrome.

---

## 3. Problems found

Each item: evidence (screenshot + measurement), root cause, proposed change, priority. Priorities:
P0 game-breaking or a CrazyGames compliance/first-impression defect; P1 major mobile usability or gameplay;
P2 quality/polish; P3 minor.

### 3.1 Lobby

#### L1. Fighter name and "You drop as" overlap the top bar (Menu, Level, status). P0

The owner's "player names overlap the top HUD" is this: the fighter name (BLAZE) and its "You drop as" label run under
the Menu button and the Level plate. There are no 3D name tags in the lobby scene (`staging.ts` draws none), so the
names in question are the identity stack's.

Measured gap between the bottom of the top bar and the top of the left panel (negative = overlap):

| Size | Gap | What overlaps | Shot |
|---|---|---|---|
| 568x320 | **-68 px** | Menu x BLAZE (84x29), Level x BLAZE (156x32), Level x "You drop as" | `568x320-03-lobby-full.jpg`, `568x320-02-lobby-0s.jpg` |
| 640x360 | **-28 px** | Menu and Level x "You drop as" | `640x360-03-lobby-full.jpg` |
| 667x375 | **-13 px** | Menu and Level x "You drop as" | `667x375-03-lobby-full.jpg` |
| 844x390 | +2 px (touching) | | `844x390-03-lobby-full.jpg` |
| 907x510 (CG listed desktop size) | **-30 px** | Level x "You drop as" (160x20), Level x BLAZE | `907x510-03-lobby-full.jpg` |
| 1020x540 | 0 px (touching) | | `1020x540-03-lobby-full.jpg` |
| 932x430 / 915x412 / 800x450 / 860x484 | +42 / +24 / +62 / +96 | | |
| 1366x768 / 1920x1080 | +204 / +516 | (desktop has the opposite problem: see L4) | |

Root cause (from `PreMatch.tsx`):

1. **No shared layout container.** The top bar is `fixed top-0`; the identity stack is `fixed bottom-0` and grows
   upward with its content. They are siblings with nothing between them that reserves the top bar's height, so the
   stack simply grows into it when the screen is short. No z-index or scaling tweak can fix that; only a layout with
   both in one container can.
2. **Content-driven height with six rows.** "You drop as" (20) + name (32) + fighter tiles (64) + Style row (64) +
   Ready (50) + "The match starts when you are ready." (16) + gaps: 288 px of stack on a 320 px screen whose top bar
   already takes 76 px.
3. **The lobby is outside the phone UI scale.** The Menu button and Level plate measure exactly 84x36 and 160x46 at
   568x320 (`--ui` 0.75) and at 667x375 (`--ui` 0.88): d0a9f50 scaled the HUD, touch buttons and menus, but
   `PreMatch` uses fixed Tailwind sizes and only a few `max-height` font steps.
4. **Breakpoint gap.** The `max-height:500px` branch puts Menu and Level in one row (top bar 76 px); at 501-640 px
   tall the bar stacks them (114 px) while the panel uses its compact form, so 907x510 overlaps by 30 px even on
   desktop. Media queries on the viewport cannot know how tall the other stack is.

Proposed change: the lobby redesign in section 4.1 (one grid shell, the top bar in its own row, the identity plate
inside a row that clips, a layout test that fails on any overlap). Not "shrink 20 %".

Acceptance: at every size in section 0, no box of the top bar intersects any box of the lobby panels, the dock or the
3D hero's projected bounding box, with at least 8 px clearance; asserted by the WP-0 layout test, not by eye.

#### L2. The lobby eats the screen on phones and reads like a web page. P1

- 568x320: the left stack covers 47 % of the width and almost the full height; the hero stands in the remaining
  half, and the back-row fighter (green Rookie) stands right behind the Style slots (`568x320-03-lobby-full.jpg`,
  `667x375-03-lobby-full.jpg`). Six stacked rows with labels under each slot ("Outfit", "Gun", "Canopy", "Smoke") and a
  sentence under Ready is the vocabulary of a form, not a game lobby.
- Three counters say the same thing: "Lobby full", "20/20" and, on desktop, "MATCH LOBBY 20/20" plus a 20-name list
  (`907x510-03-lobby-full.jpg`).
- On 907x510 to 1920x1080 the roster panel is drawn over the fourth squad member (the blue fighter is behind the list
  in `907x510-03-lobby-full.jpg`, `1366x768-03-lobby-full.jpg`, `1920x1080-03-lobby-full.jpg`).
- The Rush description line runs across the 3D Rookie's body at 907x510 and 1366x768 (pre-flight nice-to-have 7, still
  open).

Root cause: the lobby was laid out as a desktop page (panels at the edges, a list on the right) and then compressed for
short screens with media queries; the 3D camera (`staging.ts` orbitLook `C - 0.8`) does not know where the panels are.

Proposed change: section 4.1.

#### L3. After Ready, the countdown strip covers half the lobby at 568x320. P1

`568x320-04-lobby-ready.jpg`: the "MATCH STARTING 0:08" panel sits over the Ready button, the Style row and the
fighter tiles; the other three fighter tiles fade to 25 % and read as broken empty frames. At 844x390 and 1020x540 the
strip sits bottom-right and is fine, but it is a third separate panel for one number.

Proposed change: the Ready button becomes the countdown in place (section 4.1, "Ready and countdown"). No new panel.

#### L4. Desktop lobby UI does not scale up. P2

At 1920x1080 the Ready button is 216x56 and the Level plate 160x46, the same pixel sizes as at 1020x540; the left
column is a thin strip on a huge picture with 516 px of empty space above it (`1920x1080-03-lobby-full.jpg`). It looks
unfinished on a big monitor, which is how CrazyGames fullscreen desktop players see it (1920x1080 is a CG key size).

Proposed change: one desktop scale for the lobby and menus, `--ui-d = clamp(1, viewport height / 800, 1.35)`, applied
to the same tokens as `--ui` (section 4.1).

#### L5. First session takes two presses and about 15 s to the plane. P1 (Full Launch), P2 (Basic Launch)

Boot, menu (Play), lobby (Ready), 9 s countdown plus the 3.2 s launch, then the plane. CrazyGames' gameplay
requirements say, for a full implementation: "Games should drop new users directly into gameplay. If that isn't
feasible, a maximum of one click is allowed." Basic Launch does not check this; Full Launch does.

Proposed change: for a player with zero rounds played, Play opens the lobby with the countdown already running
(the existing `quick` path, 8 s), Ready skips straight to the launch, and the fighter stays changeable until the launch
starts. Returning players keep today's Ready press. One click from menu to plane.

### 3.2 Touch controls

Measured cluster at three phone sizes (CSS px, `measure.txt`):

| Button | 568x320 (`--ui` 0.75) | 667x375 (0.88) | 844x390 (1.0) |
|---|---|---|---|
| Fire | 69 | 81 | 92 |
| Super | 44 | 51 | 58 |
| Roll | **39** | 46 | 52 |
| Jump | **39** | 46 | 52 |
| Heal | **38** | 44 | 50 |
| Scope | **42** | 49 | 56 |
| Reload | **36** | **42** | 48 |
| Pick up | **35** | **40** | 46 |
| Swap | **32** | **37** | 42 |
| Lean Q / E | **29** | **33** | **38** |
| Pause | **30** | **35** | **40** |

Bold: under 44 px, the common minimum for a touch target (Apple HIG 44 pt, Material 48 dp). With the player's own
"button size" setting at its minimum (0.7) the lean buttons would be about 20 px. Buttons also touch: Jump x Reload
(2x14 px) and Super x Lean E (2x2) at every phone size.

#### T1. Too many buttons, too small on small phones. P1

Eleven buttons in a 282x236 box at scale 1 (`568x320-09-ground-fullcluster.jpg`, `844x390-09-ground-fullcluster.jpg`).
Root cause: one cluster drawn for 844x390 and scaled down uniformly by `--ui` with a floor of 0.68, so every button
shrinks together instead of the layout giving up space; and every action got its own permanent button, including two
that make little sense on a north-up, auto-aim camera (lean Q/E, labelled with keyboard letters on a phone).

Proposed change: section 4.2: four permanent buttons, the rest contextual, a size floor that never scales below 44 px
(Fire 72), the cluster gives up gaps before sizes.

#### T2. No way to choose a target on touch. P1

Touch is always auto-aim (`game.ts`: `touch` forces auto; `autoAim` picks the nearest visible enemy on screen). With two
enemies in view you shoot the closer one whether you want to or not; you cannot shoot a doorway, a fleeing player or a
specific threat; the sniper's SCOPE is a separate button you hold while something else aims for you; supers are thrown
at the auto target or straight ahead (`lastThrowAim = null` on touch).

Proposed change: FIRE becomes an aim stick on drag (section 4.2, "Fire: tap and drag"). Tap keeps today's auto-aim, so
nothing gets harder for a new player.

#### T3. The ground cluster shows in the air. P1

`568x320-06-freefall.jpg` and `568x320-07-canopy.jpg`: in free fall and under the canopy the screen shows Super,
Reload, Jump, Pick-up and both lean buttons, none of which do anything useful there, around FIRE (= open canopy) and
DIVE. It reads as unfinished and hides the landing area you are choosing.

Proposed change: an air cluster (section 4.2): free fall shows OPEN and DIVE; canopy shows FIRE and DIVE (FIRE only if
firing under the canopy is allowed for that drop).

#### T4. Touch release is fragile (risk, needs a device test). P1

`Pad` releases on `pointerup` and `pointercancel` only. There is no `lostpointercapture`, window `blur` or
`visibilitychange` release, so a system gesture, notification shade or app switch while FIRE is held can leave it held
(stuck firing) until the next touch. `press()` has a `touchHeld.clear()` path but nothing calls it on those events. I
could not reproduce a stuck button in emulation; it is a code-reading risk to verify on an Android phone and an iPhone.

Proposed change: release every held button and the stick on `lostpointercapture`, `blur`, `visibilitychange` (hidden),
pause and the rotate card. One function, `releaseAll()`.

#### T5. Accidental taps between buttons. P2

Each button is its own hit area with pointer capture; the gaps between neighbours (2-10 px at 568x320) are dead or go
to the stick layer underneath (the stick covers the left half only, so on the right they go nowhere). A thumb landing
between JUMP and RELOAD does nothing or the wrong thing.

Proposed change: one pointer router for the whole cluster: a touch inside the cluster box goes to the nearest button
centre within (radius + 10 px); visuals stay as drawn.

#### T6. The stick: OK, two small fixes. P2

Floating stick in the left half below 90 px, follows the thumb past its rim, 12 % deadzone, full speed at 72 % of the
radius: correct pattern (matches input-systems' touch guidance). Two issues: the response is almost digital (12-72 %
ramps 0-1 linearly, then full), which makes walking onto a loot item or a doorway overshoot; and the dashed "MOVE" ring
stays on screen all round, including on the plane where the stick does nothing (`568x320-05-plane.jpg`).

Proposed change: two-stage response (12-40 % of radius maps to 0.25-0.6 speed, 40-80 % to 0.6-1.0, curved); hide the
MOVE ring on the plane and after the player's first stick use in a session.

### 3.3 Mobile camera

#### C1. Your fighter is 12-18 px tall on a phone. P1

`568x320-08-ground.jpg` (about 12 px), `800x450-08-ground.jpg` (about 16-18 px, the same size as a sheep),
`1024x768-09-ground-fullcluster.jpg` (about 25 px). Estimated from the frames, not measured in code. Root cause: the
ground camera (`game.ts`, `want = (x, 36k, y + 22k)`, FOV 42) is the desktop camera; the phone gets the same world area
on a third of the pixels, and about 8 % of it is under buttons and another strip under the HUD. At this size the
fighter's pose, gun and facing (all the animation work) cannot be read, and enemies are dots.

Proposed change: a phone camera profile (section 4.3): fighter body height 7-8 % of the viewport height on phones
(today about 4-5 %), about 6 % on tablets; desktop third-person view unchanged.

#### C2. Auto-aim reach is tied to what is on screen. P1 (blocks C1)

`autoAim` only considers players within ±1.25 of the screen in normalised device coordinates. Zooming the phone camera
in (C1) would silently shorten auto-aim reach and make touch players weaker. Root cause: eligibility by screen bounds.

Proposed change: on touch, eligibility by world distance equal to the desktop view's footprint (computed once from the
desktop camera numbers), plus an edge arrow when the chosen target is off screen (section 4.3).

#### C3. Air and plane views on phones. P1

- Plane (`568x320-05-plane.jpg`, `844x390-05-plane.jpg`): the big drop map takes 55 % of the width at 568x320; the
  "20 PLAYERS ONE WINNER" banner is drawn across both the map and the plane; two hints say the same thing ("Tap JUMP to
  jump 15S" at the top and "Tap JUMP" at the bottom); the MOVE ring shows.
- Free fall / canopy small minimap at 92 px shows only two place names that fill it ("HOLLIS FARM", "LAKESIDE":
  `568x320-06-freefall.jpg`).

Proposed change: section 4.3, "Plane and air on phones".

#### C4. Desktop default camera (shoulder) goes inside tree crowns. P0

`1366x768-08-ground.jpg`: right after landing, huge dark leaf polygons and a black branch slab cover the top half and
cut across the fighter; dithered leaves fill the frame. `1020x540-10-firing.jpg`: the camera has pulled in so close
that the fighter's head and backpack fill a third of the screen, a tree trunk and foliage in front, a thin black beam
across the frame. Both are the first seconds on the ground in two different rounds, with the default camera (`settings.ts`
`camera: 'shoulder'`) that every CrazyGames desktop reviewer gets.

Root cause (from frames and the camera code's shape; engineering confirms): the shoulder camera's wall check treats tree
crowns and foliage as solid and pulls the arm in, and foliage between or around the camera is drawn instead of faded.
Leaves are not walls.

Proposed change: the arm collides with buildings, walls, rocks and trunks only (not crowns, bushes, grass); any foliage
mesh within 3 m of the camera or crossing the camera-to-chest segment fades to 0.25 (the same fade machinery as the
F-004 landmarks), and the arm never shortens below 2.2 m. Also move the "Click to look around with the mouse · Esc
pauses" hint off the fighter (it sits on the fighter's back in both shots).

Acceptance: land in Old Town, Deadwood and the South field forest edge at 1020x540 and 1366x768; in 10 random landings
no frame shows a leaf polygon larger than 10 % of the screen, and the fighter's height stays within 22-32 % of the
screen height.

### 3.4 HUD and phase screens

| # | Problem | Evidence | Root cause | Proposed change | P |
|---|---|---|---|---|---|
| H1 | Round report: Play again is below the fold at 568x320 | `568x320-12-report.jpg` (stats and XP fill the screen; no button visible) vs `667x375-12-report.jpg` | under 640 px wide the report falls back to one column (Tailwind `sm`) and the buttons go last | on any landscape screen the report uses the two-column layout; Play again and Main menu are pinned in view; XP lines collapse to the total with a "details" toggle below 360 px tall | P1 |
| H2 | Kill feed on phones sits at right 176 px top, in the Scope / upper cluster area | `Match.tsx` kill feed classes; Scope at y 139-188 at 568x320 | kill feed placed under the minimap on touch | kill feed moves under the vitals block, top-left, max 3 lines, 11 px*ui | P2 |
| H3 | Contextual hints can land on buttons and on the fighter | pre-flight item 5 (Hold DIVE over Q/E at 390 wide); `1366x768-08-ground.jpg` (mouse hint on the fighter's back) | hints centred on the whole screen | hints centre in the free band between the stick zone and the cluster zone (section 4.2 zones) on touch, lower third on desktop, never inside 18 % of the screen around the fighter | P2 |
| H4 | Auto-aim reticle is small at phone scale | `568x320-10-firing.jpg` | fixed 1.1 m ring | ring radius scales so it is at least 22 px on screen | P2 |
| H5 | Tablet portrait card says "Rotate your phone" | `768x1024-01-portrait.jpg` | one string | "Turn your device sideways"; CrazyGames also prompts rotation itself (technical requirements), keep ours as the fallback | P3 |
| H6 | "Lobby full" + "20/20" + "MATCH LOBBY 20/20" | lobby shots | three components each show the count | one counter (section 4.1) | P3 |
| H7 | Dark barn roofs read as holes from the plane | `1366x768-05-plane.jpg` (two charcoal roofs centre-left) | roof colour near black from above | lift the barn roof colour to the palette's dark red or mid grey; not black-roof bug B1 (that is fixed in 9ffeec9) | P3 |
| H8 | Boot screen shows "Ready" while the bar is at 70 % | `shots/mobile-audit` first runs (boot under load) | label switches before the bar | label says "Almost ready" until the bar reaches 100 | P3 |

### 3.5 Gameplay quality (honest audit)

Judged from code, the sim constants and stills. I did not play by hand; items marked "verify" need a playtest.

| Area | Finding | Verdict | P |
|---|---|---|---|
| Movement | `MOVE = { accel: 40, friction: 45, turn: 12 }`: about 0.16 s to top speed, 0.15 s to stop. Snappy, correct for an arcade BR. | Keep | - |
| Stick to movement | near-digital response (T6) makes fine positioning hard on touch | Fix in WP-B | P2 |
| Fighter readability on phones | 12-18 px tall (C1): the single biggest "feels cheap" factor on phones | Fix in WP-B | P1 |
| TTK (100 HP, no vest, from `WEAPONS`) | pistol 3 hits / 0.70 s; SMG 5 / 0.36 s; rifle 4 / 0.48 s; shotgun 1-2 up close; sniper 2 / 1.5 s; rockets 1. Mid TTK band (fps-shooter), fine for top-down with auto-aim. The SMG is twice as fast as the pistol at close range, which is right for loot progression. | Keep; WP-C adds a TTK table test so it stays deliberate | - |
| Hit feedback | hitmarker, hitstop (28-90 ms), flinch, damage numbers, damage-direction arc exist (`feedback.ts`). Damage numbers read at 568x320. | Keep | - |
| Phone hit feedback | no haptics; on a phone vibration is the cheapest "it registered" channel | Add (WP-C) | P2 |
| Kill moment | the kill marker lasts 0.3 s; from 12 px fighters the KO is hard to see on phones (verify after C1) | Re-check after C1; if still weak, a short KO burst (web-game-feel "huge" tier minus shake on touch) | P2 |
| Shooting while moving on touch | auto-aim turns the upper body to the target; legs follow the stick (code). Not verified in motion. | Verify in WP-B device test | - |
| Camera follow | ground follow `1 - exp(-6 dt)`, look-ahead eased at 2/s, frame-rate independent (camera-systems bar met) | Keep | - |
| Sound | 14 files load, per-weapon sounds exist (pre-flight). Not heard by me. | Needs a listen test (WP-C) | - |
| Match flow | lobby, plane, drop, fight, report, Play again (quick countdown). Complete. First session needs one click less (L5). | L5 | P1/P2 |
| Map and pacing | accepted in R-010; not re-audited here | - | - |
| Small unfinished details | MOVE ring on the plane; keyboard letters on touch lean buttons; duplicate jump hints; banner over the plane map; three lobby counters; 25 % opacity fighter tiles after Ready | all covered above | P2/P3 |

### 3.6 CrazyGames compliance items found while auditing

| # | Requirement (source) | Today | P |
|---|---|---|---|
| G1 | "Use CrazyGames system info for device-specific experiences. Don't rely on touch detection to show mobile controls." (requirements/technical) | Touch controls, forced auto-aim, the phone UI scale, the rotate card, the lobby's touch mode and the tier choice all decide from `(pointer: coarse)` or `'ontouchstart' in window` (`TouchControls.useTouch`, `game.ts:266`, `AimChoice.tsx:11`, `phoneUi.ts`, `orientation.ts`, `staging.ts:61`, `showcase.ts:30`). `platform.deviceType()` already reads `systemInfo.device.type` but only feeds the quality tier. A touchscreen Windows laptop on CrazyGames gets touch buttons and forced auto-aim; `'ontouchstart' in window` is true there in Chrome. | **P0** |
| G2 | Readable at 907x510, 1216x684, 1366x768, 1920x1080, 800x450, 1080x607 (requirements/gameplay) | 907x510 lobby overlap (L1). 1216x684 not run; it sits between 1020x540 (touching) and 1366x768 (fine). | P0 (via L1) |
| G3 | "Avoid keys with browser behavior, such as Escape (closes fullscreen)" (requirements/quality, a guideline, not mandatory) | Esc pauses and goes back from the lobby; the hint says "Esc pauses" | P2: add P as pause, keep Esc working, show "P · pause" in hints |
| G4 | "Custom in-game fullscreen buttons are prohibited" | none; `disableAutoFullscreen()` is called in both entries | OK |
| G5 | Initial download 20 MB for mobile homepage eligibility | not measured here (QA) | - |

---

## 4. Proposed changes (the designs)

### 4.1 Lobby: "Airstrip" layout

Objective: a compact, game-like lobby where the fighter on the airstrip is the hero of the screen, every control is
under a thumb or a key, nothing can overlap at any size, and desktop looks as finished as the phone.

Architecture change (explained before it is proposed):

- Today: three `position: fixed` islands (top bar, bottom-left stack, right list) plus a full-screen 3D canvas whose
  camera aims at a hard-coded offset. Nothing knows about anything else.
- Proposed: one CSS grid shell over the canvas, inset by the safe area:
  `grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr) auto;` named rows `top`, `stage`,
  `dock`. The identity plate lives in the `stage` row with `align-self: end`, `min-height: 0`, `overflow: clip`, so it can
  only grow upward inside its own row and can never reach the top bar. Sizes inside use container queries on the shell
  (`container-type: size`) instead of viewport media queries, so the plate drops its optional lines based on the space
  it actually has.
- The 3D framing follows the layout: the shell measures the free rectangle (the `stage` row minus the plate) and passes
  it to `staging.ts` (`setFrame({x, y, w, h})` in CSS px); staging uses `camera.setViewOffset` so the hero stands centred
  in that rectangle, and exposes `heroRect()` (the projected bounding box) for the layout test. This removes the
  hard-coded `C - 0.8` look offset.
- Scale tokens: the lobby uses `--ui` on phones (already published by `phoneUi.ts`) and a new desktop scale
  `--ui-d = clamp(1, innerHeight / 800, 1.35)` elsewhere. Every size below is written at scale 1.

Layout (scale 1; phone values are at 844x390, desktop at 1366x768):

```
+--------------------------------------------------------------------------+
| [<] [Lv 7 ====--]                                  ooooooooooooooooo 20/20 |  top: 40 px phone / 48 desktop
|                                                                          |
|                       (3D squad, hero centred in the free area)          |
| BLAZE                                                                    |  stage: plate bottom-left
| Rush [G]  a fast dash...                                                 |
|                                                                          |
| [f1][f2][f3][f4] | [o][g][c][s]                            [  READY  ]   |  dock: 64 px phone / 84 desktop
+--------------------------------------------------------------------------+
```

- **Top bar** (one row, never stacks): back as a 40x40 square with a chevron (the word "Menu" and the Esc key cap only
  when the bar is 900 px wide or more); a compact Level chip ("Lv 7" + a 4 px gold bar, 112 px wide on phones, 160 on
  desktop; tap/hover shows XP); right: the lobby counter, "20/20" in the display face at 22 px with 20 small pips that
  fill as players join (the pips replace the roster list and the "Players joining / Lobby full" word on phones; on
  desktop the word stays, 12 px, above the number). Nothing else up here.
- **Identity plate** (stage row, bottom-left, max 38 % of the width): fighter name in the display face (32 px phone,
  64 px desktop), in the fighter's colour, with the existing rise-in animation; one line under it: role, the super key
  cap and super name (phone: super name only; desktop: full sentence, wrapping to at most two lines, `max-width: 34ch`).
  "You drop as" is removed (the name in the fighter's colour over your fighter says it). The plate's text has the
  existing dark drop-shadow and sits on the existing left-edge gradient; no panel behind it.
- **Dock** (bottom row): four fighter tiles (52x60 phone, 72x84 desktop, the existing portrait cut and colour border),
  a 1 px divider, four Style slots (44x44 phone, 56x56 desktop; icon only on phones, the label appears in the slot's
  tray header and as `aria-label`; desktop keeps the label under the slot at 11 px), then flexible space, then READY.
  The Style tray opens as today (bottom sheet on phones), anchored above the dock.
- **READY**: bottom-right, under the right thumb, exactly where FIRE will be in the round: 176x56 phone, 240x72 desktop,
  green, the existing pulse, "Space" key cap on desktop only. The sentence "The match starts when you are ready." is
  removed at every size.
- **Ready and countdown**: pressing Ready turns the same button into the countdown: label "0:08" in the display face,
  the button's fill drains left to right in gold over the countdown, a one-line caption above it in 11 px ("Map ready" /
  "Loading the map 12/28"). No separate strip. The three other fighter tiles go to 45 % opacity with a small lock
  glyph, not 25 % (they read as broken at 25 %). At the launch, the dock and top bar slide out as today.
- **Roster**: removed from the screen. The pips carry the filling; the names of 19 bots carry no decision. When online
  rooms ship, the same top-bar counter opens a roster sheet on tap; humans get a name chip floating over their fighter
  in the 3D scene (clamped inside the `stage` row by the same frame).
- **Hero framing** (staging): hero's head top at least 8 px under the top bar, feet at least 8 px above the dock, body
  height 52-62 % of the stage row, horizontal centre in the middle of the free rectangle; the three others may be cut by
  the dock but never by the plate; nothing of the hero behind any UI. Portrait never happens on touch (rotate card); a
  portrait desktop window keeps today's wider lens.
- **First session** (L5): rounds played 0, the countdown starts on arrival (8 s), READY reads "Go now" and launches.

What must not change: the airstrip scene, the plane, the squad, fighter colours, the Style row's behaviour and
unlock rules, keyboard control (←/→/1-4 to pick, Space ready, Esc back), the launch sequence (crane, 3-2-1, fade).

Acceptance (all by the WP-0 layout test at every size in section 0, plus screenshots):

1. Zero overlaps between top bar, plate, dock, READY and `heroRect()`; at least 8 px clearance everywhere.
2. Nothing of the UI covers more than 34 % of the screen area on phones (today about 45-50 % at 568x320).
3. Every tap target in the lobby is at least 44x44 CSS px.
4. At 1920x1080 READY is at least 300 px wide and the name at least 80 px tall (scale 1.35).
5. Ready-to-launch shows no extra panel; the button counts down.

### 4.2 Touch controls: "Thumb arc", designed for our mechanics

Objective: the fewest buttons that cover what LCS actually asks of a thumb (move, shoot, jump, roll, super, heal, pick
up, swap, scope, the drop), all big enough to hit without looking, readable at a glance, and a way to choose your
target without losing auto-aim.

Decisions (and why):

- **No camera rotation on touch.** The top-down camera is north-up and auto-aim does the aiming; a camera drag would
  need a third thumb or steal the fire thumb. Aim choice comes from dragging FIRE instead.
- **No lean buttons on touch.** Lean exists to get the muzzle round a corner. On touch, lean is applied automatically:
  when FIRE is held, the chosen target is not visible from the chest but is from one shoulder offset (`clearShot`
  already tests the three offsets), the input sets lean to that side. Desktop keeps Q/E.
- **Context over permanence.** RELOAD (auto-reload already exists when the magazine is empty), HEAL, USE, SWAP and the
  sniper's scope appear only when they can do something.

Ground layout at scale 1 (844x390). Positions are button centres measured from the bottom-right safe corner (mirrored
for left-handed). Sizes are diameters in CSS px.

| Button | Centre (x, y from corner) | Size | Shows | Notes |
|---|---|---|---|---|
| FIRE | (76, 76) | 100 | always | tap = auto-aim fire; drag = aim stick (below) |
| ROLL | (180, 48) | 60 | always | cooldown ring as today |
| JUMP | (158, 142) | 60 | always | |
| SUPER | (250, 104) | 66 | always | charge ring; drag to aim throw supers |
| RELOAD | (84, 186) | 50 | magazine not full and spare ammo | |
| HEAL | (236, 198) | 54 | hurt and holding a heal | sub-label = item, as today |
| USE | (320, 60) | 56 | something to pick up within reach, or holding a bomb | shows the item's icon; hold = throw bomb as today |
| SWAP | (322, 142) | 50 | both slots full | icon + small name of the gun it draws |
| Pause | top bar, left of the minimap | 44 | always | |

Removed: SCOPE (merged into FIRE drag with a sniper), lean Q/E (auto-lean), the separate "Jump" label on FIRE outside
the plane.

Air layouts: plane: JUMP only (as today) and no MOVE ring. Free fall: OPEN (at the FIRE spot, 100) and DIVE (at the ROLL
spot, 60). Canopy: FIRE (only when firing under the canopy is allowed for this drop) and DIVE. Nothing else.

Sizing rule (replaces "scale the whole cluster by `--ui`"): `rendered = max(floor, base * ui * touchSize)` with floor
44 px for every button and 72 px for FIRE/OPEN. Positions scale by `ui` only. If the cluster then does not fit in its
zone (below), positions compress toward the corner (gaps shrink to a minimum of 6 px between circles); sizes never drop
under the floor. The player's size setting keeps its range but can no longer push a button under the floor.

Zones (the contract between the HUD in WP-A and the cluster in WP-B; scale 1, multiply by `ui`):

- Cluster zone: bottom-right, 360 x 250 from the safe corner, never more than 46 % of the width or 64 % of the height.
- Stick zone: left 50 % of the screen, below the top 90 px.
- HUD top band: top 64 px. Vitals and weapon cards top-left, the phase pill top-centre, Pause and minimap top-right
  (minimap 112 px square).
- Free band for hints and prompts: between the stick zone's right edge and the cluster zone's left edge, bottom 30 %
  of the screen, max width 40 % of the screen. Hints never go elsewhere on touch.
- Kill feed: under the vitals, top-left.

Fire: tap and drag (the aim stick):

- Press: fires as today (auto-aim target, red reticle).
- Drag more than 14 px (scaled by `ui`) from the press point: manual aim. Heading follows the drag direction (screen
  up = north, the camera is north-up). A dashed aim line on the ground from the muzzle, 40 % white, length = the gun's
  falloff start (12 m pistol, 25 m rifle...), red where it crosses an enemy. Light aim assist: if a visible enemy is
  within 8 degrees of the drag direction, aim snaps to them (fps-shooter: optional aim assist, small cone).
- Fire keeps firing while held (the sim's fire rate rules as today).
- With a sniper: drag = scope (the existing scoped camera slides out the drag direction), release = shot; tap =
  unscoped auto-aim shot. This replaces the SCOPE button.
- Release: heading eases back to the move direction after 0.4 s.
- SUPER uses the same drag for throw supers: drag shows the existing arc and landing circle, release throws; tap throws
  at the auto target as today.

Pointer handling (architecture change, explained): today each button captures its own pointer. Proposed: one pointer
router for the cluster zone that assigns each new touch to the nearest visible button centre within (radius + 10 px),
tracks it by `pointerId` until release, and releases everything on `lostpointercapture`, `blur`, `visibilitychange`
(hidden), pause and the rotate card (T4, T5). The stick keeps its own handler. Simultaneous input stays independent:
stick (thumb 1) + FIRE drag (thumb 2) + JUMP or ROLL (thumb 2 lifting off FIRE, or a third finger) must all work.

Look: keep the current round dark buttons, cream border, gold for accent and pressed, display face labels. Labels for
FIRE / ROLL / JUMP / SUPER stay words (they are learned in the first round); RELOAD, USE, SWAP use icons (24 px path set
in `icons.ts`), HEAL keeps word + item. No keyboard letters on touch anywhere.

Acceptance:

1. At 568x320 and every phone size: no button under 44 px (FIRE under 72), no two buttons touching (6 px min gap), the
   cluster inside its zone, measured by the WP-0 test.
2. In a typical ground moment (pistol, full magazine, nothing nearby) four buttons show.
3. Free fall shows exactly OPEN and DIVE.
4. CDP multi-touch test: stick held + FIRE dragged + JUMP tapped in one sequence moves, aims manually and jumps; every
   button releases after a synthetic `blur`.
5. Device test (Android Chrome and iPhone Safari, by Reis): 5 rounds; report missed presses, accidental presses, any
   stuck fire.

### 4.3 Mobile camera

Camera profile (architecture change, explained): today the ground camera numbers are constants inside the camera step.
Proposed: one profile object chosen from the input profile (WP-0) and the screen: `{ height, back, fov, lookAhead,
viewOffset }` for `phone` (touch, short side 520 px or less), `tablet` (touch, taller) and `desktop`. The camera step
reads the profile; nothing else changes.

| Profile | Ground camera | Target | Look-ahead | View offset |
|---|---|---|---|---|
| phone | k = 0.66 (height about 24, back about 14.5), FOV 42 | fighter body height 7-8 % of the viewport height (about 28-31 px at 844x390) | 0.35 s velocity + 3 m facing, cap 5 m; while firing, toward the target (frame both) | fighter at 46 % x, 46 % y of the screen (slightly up and left, away from the cluster) |
| tablet | k = 0.8 | about 6 % | as phone | 48 %, 48 % |
| desktop third view | k = 1 (today) | today | today | none |

- Tune k by the target percentages, not by the numbers above; measure fighter height from the projected rig bounds in
  a test.
- Auto-aim on touch: eligibility = line of sight and world distance within the desktop view's half-diagonal footprint
  (compute once from the desktop numbers), not screen NDC. When the chosen target is off screen, a small red chevron at
  the screen edge points at it (same red as the reticle, colour-blind orange).
- Air: free fall and canopy keep today's framing (it reads well on phones: `568x320-07-canopy.jpg`), only the HUD
  changes. Landing transition: the zoom eases from the canopy framing to the phone ground framing over 0.6 s.
- Fades: confirm that trees and roofs between the camera and your fighter fade (as the F-004 landmarks do); at the
  phone zoom more crowns will cross the line. If they do not, add them to the fade set.
- Smoothing stays `1 - exp(-rate dt)` (camera-systems bar). No new smoothing.
- Desktop shoulder camera: C4 (foliage).

Plane and air on phones (C3):

- Drop map at most 42 % of the screen width or 70 % of its height, whichever is smaller; place names at 9 px*ui with
  collision culling (the R-010 rule), names only on this big map.
- The "20 PLAYERS ONE WINNER" title: in the free area left of the map, 28 px*ui, never over the map or the plane; on
  phones it shows for 2 s then fades (it already reads from the lobby countdown).
- One jump prompt only: the top pill with the timer ("Tap JUMP · 15 s"); the bottom hint goes away on the plane.
- Small minimap in the air and on the ground: no place names on phones; the place banner (R-008) already names where
  you are.

Acceptance: fighter height measured in a test at 568x320, 844x390, 1024x768 within the targets; auto-aim picks a target
at the same world distance on a phone as on desktop (unit test on the eligibility function); the plane screenshots at
568x320 and 844x390 show no overlap between title, map, plane and prompt.

### 4.4 Gameplay feel and feedback

- Haptics (Android; iOS Safari has no vibration API, so nothing happens there): `navigator.vibrate` 8 ms on a hit you
  land (at most every 120 ms), 18 ms when you are hit, 30 ms on your KO, 40 ms when you are knocked out. Off when the
  setting "Vibration" is off (default on) and when reduced motion is on. Render-side only (web-game-feel rule).
- KO readability on phones: re-check after C1; if still weak, the KO uses the web-game-feel "huge" tier without camera
  shake on touch (particles 30, flash 120 ms, the existing kill marker).
- TTK table test (fps-shooter Pattern 2): a vitest that prints shots-to-kill and TTK per weapon at 0, 15 and 40 m
  against 100 and 150 HP, and fails if a weapon leaves its band (pistol 0.6-0.9 s, SMG 0.3-0.45, rifle 0.4-0.6 at 15 m).
  No numbers change now.
- Sound: one listen pass on a phone speaker and headphones: gun bus about -8 dB under hits, footsteps audible at 10 m,
  nothing clipping when 5 guns fire. Report, then fix only what fails (web-game-audio).

---

## 5. Priorities

### P0 (fix before submitting anywhere)

| ID | Item | Section | Package |
|---|---|---|---|
| P0-1 | Lobby top bar and identity stack overlap at 568x320, 640x360, 667x375 and at CrazyGames' 907x510; touching at 844x390 and 1020x540 | L1, 4.1 | A |
| P0-2 | Touch UI decided by touch detection, not CrazyGames system info (technical requirement) | G1 | 0 |
| P0-3 | Desktop default shoulder camera inside tree crowns right after landing | C4 | B (arm) + D (foliage fade) |

### P1 (major mobile usability or gameplay)

| ID | Item | Section | Package |
|---|---|---|---|
| P1-1 | Fighter 12-18 px tall on phones: phone camera profile | C1, 4.3 | B |
| P1-2 | Auto-aim reach tied to the screen (must go with P1-1) | C2, 4.3 | B |
| P1-3 | Eleven touch buttons, seven under 44 px at 568x320: Thumb arc layout, size floor, context buttons | T1, 4.2 | B |
| P1-4 | No target choice on touch: FIRE drag-to-aim, sniper scope and throw aim on drag | T2, 4.2 | B |
| P1-5 | Ground cluster in the air: air layouts | T3, 4.2 | B |
| P1-6 | Touch release on lost capture / blur / hidden (risk, device-verify) | T4, 4.2 | B |
| P1-7 | Lobby redesign: Airstrip layout, dock, hero framing, roster removal, 4th fighter no longer under the list | L2, 4.1 | A |
| P1-8 | Countdown strip covers half the lobby at 568x320: Ready becomes the countdown | L3, 4.1 | A |
| P1-9 | Report: Play again below the fold at 568x320 | H1 | A |
| P1-10 | Plane on phones: map size, title over map and plane, duplicate prompt, MOVE ring | C3, 4.3 | A (layout) + B (prompt text in game.ts) |
| P1-11 | First session: one click from menu to plane (Full Launch requirement) | L5, 4.1 | A |

### P2 (quality and polish)

Stick response curve and MOVE ring (T6, B); cluster pointer router for in-between taps (T5, B); kill feed position
(H2, A); hint placement zones (H3, A for DOM, B for hint text in `game.ts`); reticle scale (H4, B); desktop lobby
scale-up (L4, A); Esc guideline, add P to pause (G3, B for keys, A for the hint copy); haptics (4.4, C); KO readability
re-check (4.4, C); sound listen pass (4.4, C); TTK test (4.4, C).

### P3 (minor)

Tablet rotate card copy (H5, A); one lobby counter (H6, A, comes free with 4.1); barn roof colour from the plane (H7,
D); boot "Ready" at 70 % (H8, A).

---

## 6. Implementation plan: work packages

Rule for parallel work: each package owns its files. Nobody edits another package's files; if a package needs a change
in someone else's file, it asks the owner (one-line hooks are fine, through the owner). `game.ts` (3,158 lines) is the
contention point: **WP-B owns `src/game/render/game.ts`.** WP-C and WP-D deliver their work in their own files and get
any call site added by WP-B.

### WP-0. Foundations (do first; one engineer, about half a day; everyone else starts after it merges)

- Goal: one input/device profile from the platform (P0-2), and the layout test everyone else uses.
- Files: new `src/lib/device.ts` (`setDeviceProfile(platform.deviceType())` at boot; `inputProfile(): 'touch' | 'mouse'`
  and `deviceClass(): 'phone' | 'tablet' | 'desktop'`; the platform's answer wins, `(pointer: coarse)` only when the
  platform gives none, `'ontouchstart' in window` never decides); `portal/main.tsx`, `web/main.tsx` (call it before
  render); swap the call sites in `TouchControls.tsx` (`useTouch` only), `game.ts` line 266 (the `touch` constant only),
  `AimChoice.tsx`, `orientation.ts`, `phoneUi.ts`, `staging.ts:61`, `showcase.ts:30`, `deviceFacts.ts`, `telemetry.ts`.
  This one-time touch of other packages' files is the reason WP-0 goes first and stays tiny.
- New `scripts/layout-matrix.mjs` (from `shots/mobile-audit/audit-capture.mjs`): runs the size matrix of section 0,
  writes screenshots, and asserts: lobby box overlaps with 8 px clearance (needs `heroRect()` later from WP-A: the
  assertion is added when WP-A lands), touch button sizes and gaps, HUD vs cluster zones, report buttons in view. Exit
  code 1 on any failure.
- Skills to load: game-ui-ux, input-systems.
- Tests: unit tests for `device.ts` (platform desktop + coarse pointer = mouse; platform mobile = touch; platform null +
  coarse = touch; null + fine = mouse); the matrix script runs green on today's build except the known failures it is
  meant to catch (record them as the baseline).

### WP-A. Lobby, menus, HUD layout and report (DOM layout and lobby framing)

- Goal: P0-1, P1-7, P1-8, P1-9, P1-10 (layout side), P1-11; P2 H2, H3 (DOM side), L4; P3 H5, H6, H8.
- Files owned: `src/components/PreMatch.tsx`, `StyleRow.tsx`, `MainMenu.tsx`, `FighterSelect.tsx`, `Transitions.tsx`,
  `SettingsPanel.tsx`, `Match.tsx` (HUD layout, plane title and map box, kill feed, hint box placement, report),
  `src/game/render/staging.ts` (`setFrame`, `setViewOffset`, `heroRect`), `portal/portal.css`, `portal/index.html`
  (rotate card copy, boot label), `src/game/copy/*` lobby and HUD strings, `src/lib/phoneUi.ts` is **not** A's (B).
- Order: (1) lobby grid shell + top bar + plate + dock + READY, (2) staging frame and `heroRect`, (3) Ready-as-countdown,
  (4) first-session auto-countdown, (5) report two-column on landscape, (6) plane title/map/kill feed/hint zones,
  (7) desktop scale `--ui-d`.
- Skills to load: game-ui-ux (anchors and containers, one scaling policy, safe areas, screen stack), camera-systems
  (view offset framing), web-game-vision (the loop, phones first-class).
- Tests: WP-0 matrix green for the lobby, report and HUD zones at every size; keyboard path through the lobby (←/→, 1-4,
  Space, Esc) still works; screenshots before/after at 568x320, 844x390, 907x510, 1020x540, 1920x1080 into
  `docs/collab/CREATIVE/shots/mobile-audit/after/`; a vitest for the first-session rule (0 rounds = countdown on arrival).
- Must not change: game rules, the launch sequence, Style unlock logic, the airstrip scene content.

### WP-B. Touch controls, input and cameras

- Goal: P1-1 to P1-6, P1-10 (prompt text), P0-3 (arm side); P2 T5, T6, H4, G3 keys, H3 hint text.
- Files owned: `src/components/TouchControls.tsx`, `src/lib/phoneUi.ts`, `src/game/render/game.ts` (all of it),
  `src/game/render/hints.ts`, `src/game/render/icons.ts`, `src/game/settings.ts` (new: vibration toggle default on, for
  WP-C; P as a pause key).
- Order: (1) cluster layout + size floor + context visibility + air layouts, (2) pointer router + releaseAll, (3) phone
  camera profile + auto-aim eligibility + off-screen chevron, (4) FIRE drag-to-aim + auto-lean + sniper/throw drag,
  (5) shoulder arm ignores foliage + min arm length, (6) stick curve, MOVE ring, reticle scale, hint dedupe.
- Skills to load: input-systems (touch controls, deadzones, release), camera-systems (profiles, view offset,
  frame-rate-independent follow), fps-shooter (aim assist cone, scope sensitivity), game-ui-ux (zones), web-game-vision
  section 7.
- Tests: vitests for the size rule (`max(floor, base*ui*size)`), the zone fit, context visibility per state, auto-aim
  eligibility by distance, drag-direction to heading mapping, stick curve outputs at 0.12/0.4/0.8/1.0; CDP multi-touch
  script (stick + FIRE drag + JUMP; synthetic blur releases all); fighter height measured at 568x320, 844x390, 1024x768;
  ten shoulder-camera landings at 1020x540 (C4 acceptance); then Reis's device test on Android and iPhone (5 rounds
  each, report missed/accidental/stuck presses and camera comfort).
- Must not change: the sim (`src/game/sim/*`), desktop mouse aim and keyboard bindings, the third-person desktop camera
  numbers, the air camera framing.

### WP-C. Gameplay feel and feedback

- Goal: P2 haptics, KO readability re-check, TTK test, sound listen pass.
- Files owned: `src/game/render/feedback.ts`, new `src/game/render/haptics.ts`, `src/game/render/vfx.ts`,
  `src/game/sfx.ts`, `src/game/audioBudget.ts`, `src/game/render/characters.ts` (only if KO needs a pose tweak),
  `src/game/sim/balance.test.ts` (new TTK test; no constant changes).
- Hooks: haptics fire from inside `feedback.ts`'s existing per-event functions, so no `game.ts` edit is needed; if one
  is, WP-B adds it.
- Skills to load: web-game-feel (tiers, one feedback entry point, reduce motion), fps-shooter (TTK table), web-game-audio
  and audio-design (listen pass).
- Tests: vitest for the haptics rate limit and the settings gate (vibrate is stubbed); TTK table test; feedback tests
  still green; a listen report in LOG.md.
- Must not change: damage, fire rates, hitstop values (unless the listen/feel pass says so and the CD agrees).

### WP-D. Performance and render quality

- Goal: P0-3 (foliage side), P3 H7, and whatever QA's `mobile-bug-hunt.md` ranks first for performance.
- Files owned: `src/game/render/nature.ts` (foliage near-camera fade), `quality.ts`, `chunks.ts`, `merge.ts`,
  `world.ts` (barn roof colour), `perfOverlay.ts`.
- Items: foliage within 3 m of the camera or crossing the camera-to-chest segment fades to 0.25 (reuse the F-004 fade
  approach, one uniform per merged foliage mesh, no per-tree draw calls); barn roof colour; precompile match materials
  during the lobby countdown if QA still sees the 0.7 s lobby-to-match stall; the phone-profile camera (WP-B) shows more
  detail per pixel but less area, so re-measure draw calls and triangles at 844x390 after WP-B's camera lands.
- Skills to load: performance-optimization (budget, measure, one bottleneck, re-measure), threejs-materials-lighting,
  web-game-vision section 3.
- Tests: `?perf` numbers before/after at 844x390 and 1020x540 on the same machine, three runs each (avg and p95 frame
  time, calls, triangles); C4 acceptance shots shared with WP-B; a 15-minute session on a real phone for thermal
  throttling (Reis).

### Dependencies

WP-0 first. Then A, B, C, D in parallel. Two joins: the HUD/cluster zones (A and B both follow section 4.2's zones;
the WP-0 test checks both), and C4 (B's arm change and D's fade land together, then one set of acceptance shots).

---

## 7. CrazyGames readiness assessment

Sources: docs.crazygames.com requirements/quality, requirements/technical, requirements/gameplay (fetched 2026-11-22),
plus the earlier pre-flight (`CREATIVE/cg-preflight-lcs-2026-11-22.md`). Parking Lot's rejection reason ("overall
quality") is not in the docs as a rule; it is a reviewer judgement, so the bar below is "nothing looks broken in the
first minute at any CG size, and phones play comfortably".

### Blockers first

1. **Lobby overlap at 907x510** (a size CrazyGames lists) and on small phones (P0-1). A reviewer on the default desktop
   iframe at a smaller laptop sees the fighter name under the Level plate in the screen right after Play.
2. **Touch controls by touch detection** (P0-2). An explicit technical requirement; also wrong behaviour on touch
   laptops.
3. **Desktop default camera inside trees** (P0-3). The first ground frames in two of two desktop rounds. This is
   exactly the "overall quality" impression.

### Assessment by area

| Area | State | Verdict |
|---|---|---|
| First impression | Boot over the real map, then the live menu: strong | Ready |
| Loading | not timed in this pass (dev server); pre-flight measured the menu at 2.8 s on localhost; initial download not measured here (QA) | QA to confirm under 20 MB for mobile homepage |
| Lobby | overlap (P0-1), web-like layout on phones (P1-7) | **Not ready** |
| Mobile usability | buttons under 44 px on small phones, no target choice, ground cluster in the air, fighter too small | **Not ready** (P1-1 to P1-6) |
| Gameplay | complete BR loop, snappy movement, mid TTK, feedback in place | Ready on desktop once P0-3 is fixed |
| Multiplayer reliability | online is not in the portal build; CG gets solo with 19 bots, which the quality guideline allows if solo is clear ("Solo · 19 bots" on Play is clear) | Not applicable to this submission |
| Controls | desktop: rebindable, hints, Esc pause (guideline G3, P2); touch: see above | Desktop ready; touch not |
| Performance | not measured here; pre-flight saw 120 fps at iframe sizes on an M-series Mac | QA |
| Polish | report, pause, menu good; small leftovers listed in P2/P3 | After P1 |
| Onboarding | contextual hints, no forced tutorial (meets the guideline "skippable, visual over text") | Ready; hint placement P2 |
| Match flow | complete; two clicks + about 15 s to the plane for new players (Full Launch asks one click) | Basic Launch ready; Full Launch needs P1-11 |
| Replayability | progression v2, daily goals, Play again quick | Ready |
| Bugs / stability | no console errors in 16 sizes of full flow; no crashes | Ready (QA's hunt may add items) |

### Recommendation

Do not submit on b8e5c2b. Submit after WP-0, P0-1 (as part of WP-A's lobby shell), P0-3, and P1-1, P1-3, P1-5, P1-9 at
minimum: those are what a reviewer on a phone or a small laptop sees in the first minute. The rest of P1 can follow in
the first update, but P1-4 (drag-to-aim) and P1-6 (release robustness) should be in before any mobile homepage push.
Re-run the full matrix (WP-0 script) and a CD review of the after-shots before submitting.

---

## 8. Open questions for engineering: answered from the code (WP-0, 2026-11-22, portal-build b8e5c2b + WP-0 commits)

1. **Is firing under the canopy allowed on the first drop?** No, and not only on the first drop: nobody can shoot in the
   plane, in free fall or under the parachute, in every round. `step.ts` `updateFall` pushes a `fireBlocked` event on a
   fresh fire press and never reaches `shoot()`; the comment under the open canopy reads "you can look where you aim, but
   nothing fires" (commit b433e90, "Nobody can shoot in the plane, in free fall or under the parachute"). There is no
   separate "safe first drop" mode: the rule is the same for all rounds. Consequences for the touch layout (4.2):
   - In the air, touch FIRE only means "jump / open the canopy": `keyRoles.shootJump` turns `touchFire` into a jump when
     not on the ground, and the sim only pulls the canopy on `input.jump`, only while `canopy < 0` and after
     `DROP.minFreefallDrop`. Once the canopy is opening the press does nothing except the `fireBlocked` toast.
   - So **canopy shows DIVE only** (no FIRE: a FIRE button there is a button that does nothing). Free fall shows OPEN
     (the FIRE spot, 100 px) and DIVE, as 4.2 says; OPEN disappears when the canopy starts opening. Update the air layouts
     in 4.2 accordingly: "Canopy: FIRE (only when firing under the canopy is allowed)" becomes "Canopy: DIVE".
2. **Does the F-004 landmark fade include tree crowns?** No. F-004 is `props.ts` `tallLandmarks()`: one merged mesh of at
   most 16 tall parts (HQ block, water tank, crane beams and cabs, lookout cabin, mast above 6 m); each fades to 0.3 when
   the segment camera-to-chest crosses its box grown by 1 m. Trees are not in it. Trees have a different mechanism in
   `nature.ts`: leaf and trunk materials (`windy(..., cutout = true)`) discard fragments in a Bayer dither when they are
   above 2.2 m and within `uFade` metres of `uFocus` on the ground plane. Who sets the circle (`updateNature`):
   - top-down camera: `world.update` (world.ts:917) centres it on the player with radius 4.5 m, every frame;
   - shoulder camera: `game.ts:2678` centres it midway between camera and player with radius `armNow / 2 + 3`
     (overrides the line above, it runs later in the frame);
   - first person: radius 0, no cut-out.
   It is a ground-distance dither, not a camera-to-chest segment test: no smoothing in time, no fade (a hard 4x4 Bayer
   discard, which is the dithered look in `1366x768-08-ground.jpg`), no blending by distance from the lens. So WP-D cannot
   just reuse F-004 for crowns; the F-004 approach (a per-part uniform in one merged mesh) fits `tallLandmarks`, whereas
   trees are instanced chunks, so the near-camera fade needs a new uniform path in `leafMaterial` (a camera-to-chest
   segment distance in the fragment shader, smooth alpha-hash instead of the Bayer cut). Also correction to C4's root-cause
   guess: the shoulder arm does not treat crowns as solid. `solidAt` -> `tileHit` for a tree tile only tests the
   trunk circle (`SHAPES.trunk` = 0.45 m radius, at any height), roofs and walls. The arm (`game.ts` ~2650) marches out in
   0.25 m steps and shortens for a trunk, wall, roof slab or `y < 0.25`, down to `max(0.35, d - 0.3)`; the body hides at
   arm <= 0.75. So the "camera pulled in so close the head fills a third of the screen" case is most likely a trunk beside
   the landing spot, and the leaf polygons are crowns around that short arm: broadleaf crowns start at about 2.9 m, all inside
   the cut-out's >2.2 m band, but the circle is only `armNow/2 + 3` (about 3.2 m at a 0.35 m arm) so leaves further out
   than that stay solid. Confirm with the C4 acceptance landings; it needs a render, not code reading. WP-B's "arm
   ignores foliage" item may therefore already be true; what needs a decision is the trunk case and the proposed 2.2 m arm
   floor.
3. **Was the lobby left out of `--ui` on purpose?** No reason is recorded. d0a9f50's diff touches `FighterSelect`, `Hud`,
   `MainMenu`, `Match`, `SettingsPanel`, `TouchControls`, `phoneUi` and nothing in `PreMatch.tsx`, `StyleRow.tsx` or
   `Transitions.tsx`; its message lists the HUD, minimap, pause, cluster, plane map/title, settings, main menu and How to
   play, and does not mention the lobby. The lobby had already been given its own short-screen rules in a1072bf ("Fit
   every screen to CrazyGames iframe sizes ... lobby ..."), which is the likely reason it was skipped. Nothing in the Style
   tray depends on that: `StyleRow` uses no `--ui` and no scale-sensitive sizes, the tray is a plain bottom sheet. So the
   grid shell in 4.1 does not need to account for an intentional exception. Note the `lcs-phone` class and `--ui` are
   only installed by `portal/main.tsx` (`installPhoneUi`), not by the web build entry `web/main.tsx`, so on the web build
   `--ui` is never set (the `var(--ui, 1)` fallbacks make it 1) and the phone scale does not apply there at all.
