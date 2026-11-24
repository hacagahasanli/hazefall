# CrazyGames store copy v2 + quality preflight (R-019)

Owner: Creative Director. Date: 2026-11-24. For: the NEW CrazyGames submission of Last Commit Standing (desktop only).
Engineering fixes from section 6 are tracked as F-018 in FEEDBACK.md.

Sources used (verified 2026-11-24): docs.crazygames.com `requirements/quality` and `requirements/game-covers` (fetched
today), crazygames.com/tags (tag names below exist there), ENGINEERING/cg-requirements-checklist.md, `src/game/settings.ts`
(`ACTIONS`, `DEFAULT_KEYS`, `FIXED_KEYS`), `src/game/render/game.ts` (mouse: left = fire, right = scope, wheel = swap),
`src/game/copy/neutral.ts` (the portal build's words), screenshots ENGINEERING/hud-v2-1216x684-bomb.png,
pitch-canopy-1216x684.png, pitch-centre-north-1216x684.png, CREATIVE/shots/cg-preflight/c1020-10-lobby.png.
Not seen: the game in motion, audio, a Windows machine, CG's QA tool.

---

## 1. Title and tagline

- **Title: Last Commit Standing** (unchanged).
  Why keep it: it is distinct (CG's rule: a name that cannot be confused with other games), "...Standing" tells a new
  player it is last-one-standing, it matches lastcommit.nalbakigames.com and our existing assets, and the rejection was
  about quality, not the name. "Commit" reads in plain English as "go all in", so it does not need the developer joke
  to make sense. Do not add a subtitle to the title field.
- **Tagline** (use where a one-liner is shown, e.g. social, itch, our own site; not on covers):
  **"Twenty drop in. The Haze closes. One stays standing."**

## 2. Descriptions

Rules followed: original wording; no other game's names or signature terms; desktop only stated; solo with bots stated
plainly (CG: if there is no friend play, say so); every feature named exists in the portal build today.

### Short description (one paragraph, about 160 characters)

> Skydive into a living town, steer your parachute, grab a gun and outlast 19 rivals as the Haze closes in. A third-person
> survival shooter for mouse and keyboard.

### Long description (CG "Description" field)

> **Last Commit Standing** is a 20-player survival shooter played over the shoulder. Jump from the plane whenever you
> like, free-fall, then steer your parachute down to the spot you want: a river town, a container yard with cranes,
> a campus tower, a small football ground with floodlights.
>
> You land with a pistol and two spare magazines. Everything else is out there: rifles, shotguns, SMGs and a sniper,
> vests I to III, backpacks, bandages, med kits and bombs. Blue and gold beams mark the best gear, and the busiest
> places hide the most of it.
>
> Then the Haze moves in. Phase by phase it squeezes the safe zone and hurts more each time, pushing everyone together.
> Lean round corners, crouch in tall grass, roll out of trouble and save your fighter's super for the moment it counts.
> Rounds last about three to four minutes, so one more try is always close.
>
> **Features**
> - Free drop: pick your moment to jump, dive to go farther, open the canopy and land where you choose
> - Four fighters, each with a super: a dash, a barricade, a slowing canister or a shockwave
> - Real cover: lean round corners, crouch behind crates, hide in tall grass
> - Healing is your choice: bandages and med kits, never automatic
> - Levels, daily goals and unlockable outfits, canopies and smoke trails
>
> Solo against 19 bots. Made for desktop: mouse and keyboard, every key can be changed in Settings.

Fighter count, super names (neutral copy: Rush, Barricade, Slow Bomb, Shockwave), round length (LOG 2026-11-22: median
3:24), rarity beams, cosmetics and daily goals were checked against the code and LOG. If engineering removes or renames
any of them before upload, tell the CD and do not upload stale text.

## 3. Controls (CG "Controls" field, exact; desktop only)

Paste as-is, one line each. Defaults from `DEFAULT_KEYS` + `FIXED_KEYS`; mouse from `game.ts`.

```
Move: W A S D or arrow keys
Aim and look: mouse (click the game to capture it)
Shoot: left mouse button
Sniper scope: right mouse button or Z
Jump / open parachute: Space
Dive (in the air) / roll: Shift
Crouch: C
Lean: Q / E
Look around: hold Alt
Pick up: F
Guns: 1 / 2, X or mouse wheel to swap
Reload: R
Bandage: 3   Med kit: 4   Best heal: H
Bomb: 5, then left click to throw
Energy drink: V
Super: G
Pause: P or Esc   Mute: M
```

Left out on purpose: T (switch aim mode, a Settings option, not a control a new player needs). If F-018 item 5 changes
the Alt default, update the "Look around" line to the new key before upload.

## 4. Category and tags

- **Category: Shooting.**
- **Tags, in this order: Battle Royale, Third Person Shooter, 3D, Gun, Survival, Sniper.**
  - Battle Royale: the genre; only 19 games carry it on CG today, so it is a discoverable shelf.
  - Third Person Shooter: our camera (replaces the wrong "Top-Down").
  - 3D, Gun, Survival, Sniper: true to the game and existing CG tags. Use the first four if CG caps the count.
- **Never use:** Top-Down (wrong camera), Multiplayer / With friends / 2 Player / Co-op (solo with bots only: a false
  multiplayer tag is the fastest way to bad ratings), Mobile (desktop only), FPS (not first person by default).

## 5. Covers and videos

CG rules (verified today): covers 1920x1080, 800x1200, 800x800 with consistent visuals; only the title as text; no
borders, icons, logos, "New"/"Play" words; not blurry. Videos 15-20 s, both 1920x1080 and 1080x1620 (2:3), no sound, no
fast-forward, first frame = the static cover, no black screens/bars, no default mouse cursor, no promo text or icons.
CG recommends covers that are not plain gameplay screenshots, with a stylised title font.

### 5.1 One key image, three crops

Concept "Touchdown": the moment the drop becomes the fight. Staged in the engine (posed rig, real assets, free camera,
HUD off, high quality, shadows on, golden-hour light from `staging.ts`), rendered at 2x and downscaled so edges are clean.

- **Hero:** Blaze (orange outfit, headphones, backpack) landing on a roof ridge in Old Town, one knee bent from the
  landing compression, rifle raised to the right shoulder, looking past the camera. The orange ram-air canopy is
  collapsing behind and above her, lines still visible. Camera low, 3/4 front, 35-40 mm feel, so she fills about 45 %
  of the frame height in the landscape cover.
- **Behind:** the river and bridge, the Pitch's violet stands and two floodlights, the yellow cranes far right, three
  or four other canopies (different colours from the unlocks) still coming down in the sky.
- **Edge of the world:** the blue Haze wall rising at the horizon on one side (the side away from the title), so the
  threat reads in a thumbnail.
- **Title:** "LAST COMMIT STANDING" in Bungee, cream (`--color-cream` #e6ebf5) with a hard ink drop (`--color-ink-deep`
  #0a0d18, offset down-right, no blur, no glow, no gradient), three lines stacked LAST COMMIT / STANDING or LAST /
  COMMIT / STANDING to fit the crop. "STANDING" may be gold (#ffd23f). Nothing else on the image: no tagline, no badge.
- **Crops:**
  - 1920x1080: title left third, vertically centred; Blaze right of centre; Haze wall far left behind the title.
  - 800x1200: canopy top third, Blaze middle, title bottom third over the rooftops (darken the rooftops 15 % under the
    title for contrast, as a lighting choice, not a box).
  - 800x800: tighter on Blaze and the canopy, title across the bottom 30 %, two lines.
- **Acceptance:** title legible at 200 px wide; Blaze and the canopy readable at 120 px; no UI, crosshair, cursor, fps
  text or watermark; no border; same light and colours in all three.

### 5.2 Video 1, landscape 1920x1080, 18 s, real gameplay (HUD v2 on)

Recorded from a real round in the portal build (bots), mouse already captured (no lock pill, no cursor), Show FPS off,
key hints on. Cut, not sped up.

| Time | Shot |
| --- | --- |
| 0.0-1.0 | The 1920x1080 cover as a still (required first frame), hard cut |
| 1.0-4.0 | Plane door view, jump, free fall over the river town, minimap names visible |
| 4.0-7.0 | Canopy open, steering down toward the Pitch's floodlights, other canopies around |
| 7.0-9.5 | Landing in the Pitch, run to a gold beam, pick up a rifle (rack tile flashes) |
| 9.5-14.0 | Fight over the shoulder: lean out of the dugout, hits with damage numbers, one knockout in the feed |
| 14.0-16.5 | Haze wall moving in, roll through tall grass toward the safe zone |
| 16.5-18.0 | Report screen "LAST ONE STANDING" with placement 1, hold |

### 5.3 Video 2, portrait 1080x1620, 16 s

Same story, recorded natively at a 1080x1620 viewport (not a crop with bars). HUD off except crosshair, damage numbers
and kill feed, because HUD v2 is laid out for landscape and must not look broken.

| Time | Shot |
| --- | --- |
| 0.0-1.0 | The 800x1200 cover scaled to 1080x1620 as the first frame |
| 1.0-4.5 | Free fall straight down onto the town, then the canopy opening above the camera |
| 4.5-7.0 | Landing on a roof, jump to the next roof |
| 7.0-12.5 | Over-the-shoulder fight in the container yard (vertical framing suits cranes and stacks) |
| 12.5-16.0 | Win: the "LAST ONE STANDING" sticker over the town, hold |

Both videos: no audio track, no text added in the edit, no black frames, under 50 MB (H.264, CRF 18-20).

---

## 6. Quality preflight against CG's guidelines

Verdict: **not ready yet.** The game is above the bar in content and HUD, but three things a reviewer meets in the first
minute still say "unfinished": in-game text that contradicts the controls, colliding messages at the top of the screen
right after landing, and a slow path to the first action. Fix items 1-5 before upload; 6-10 are cheap and should go in
the same pass. Ranked by impact on a reviewer's first 2 minutes.

| # | Guideline | Problem (evidence) | Fix for engineering |
| --- | --- | --- | --- |
| 1 | Easy to learn, clear language, consistent controls | How to play and the lobby aim picker teach keys that no longer work: `neutral.ts` howTo says "J or the left button shoots" and "3 takes your heals in hand and 4 a bomb"; `AimChoice.tsx` says "J shoots the nearest enemy you can see". J does nothing since batch B; 3/4/5 are bandage/med kit/bomb. A reviewer who reads it and presses J thinks the game is broken. | Replace in `neutral.ts` AND `studio.ts` with the copy in 6.1. Auto-aim hint: "Left click shoots the nearest enemy you can see". Add a test that no copy string contains "J " as a key. |
| 2 | Clear layout, no defects | Top-centre collision in the first seconds on the ground: the place title (`top-[9%]` = 62 px at 684) is drawn over the "Click to look around with the mouse · Esc pauses" pill (`top-[84px]`), under "Everyone is landing" (pitch-centre-north, hud-v2-bomb shots). Three messages stack in the same 100 px. | One top-centre message at a time. Move the mouse-capture prompt to the crosshair: centred, 56 px below screen centre (scaled by `--hud`), text "Click to aim with the mouse". Drop "· Esc pauses" from it (pause is in How to play and Esc is a key CG warns about). The place title keeps the top; the zone line stays above it. Show the capture prompt only on the ground, never in plane/free fall/canopy where the mouse is not needed. |
| 3 | Land in gameplay quickly; first 30 s | First action is far away: Play, lobby, Ready, a 10 s countdown, then up to 20 s of plane before you even jump; first shot often after 60 s. CG's first-session test is exactly this window. | Portal build, first round of a session only: Play goes straight into the lobby with Ready already set and the 10 s countdown running (the player can still change fighter; Space/Ready skips to 3 s). The plane shows the "Space · jump" hint from second 0. Later rounds keep Reis's rule (Play again waits for Ready). **Needs Reis's OK** because it touches batch B item 11+5. |
| 4 | High-quality, consistent graphics | Close-to-camera views look cheap: in hud-v2-1216x684-bomb the shoulder camera sits in tall grass with blades as big as the character and two large flat wall planes fill 40 % of the screen; the frame ran at 30 fps on "high". | (a) Fade out tall-grass and tuft instances within 1.8 m of the camera (alpha or scale to 0 over 1.8-2.6 m). (b) When the camera is within 1.0 m of a wall, ease to the other shoulder or pull in toward the head (0.15 s), so a wall never fills more than a third of the screen. (c) "Auto" quality must hold 60 fps at 1216x684 in the Campus on a mid laptop (Intel Iris class): drop grass density before resolution. |
| 5 | Avoid keys with built-in browser behaviour | "Look around" is hold Left Alt. On Windows, Chrome and Edge move focus to the browser menu when Alt is tapped and released, so the next keys may go to the browser, not the game (not verified here: no Windows machine). | Test on Windows Chrome and Edge: tap Alt in a round, then press W. If the game loses input, change the default to `KeyB` (free, in `SPARE_KEYS`), bump `keysVersion`, update the hint and section 3 of this spec. |
| 6 | No defects | The 100 HP numeral overlaps the fighter name ("100" over "BLAZE", pitch-centre-north). LOG says it was fixed in the same batch; the shot shows it. | Verify at 100 HP at 821x462, 1216x684, 1920x1080; the name starts after the numeral's widest value plus 8 px. |
| 7 | Consistent graphics | Debug text in captures: fps/draw-call lines under the minimap in every engineering shot. Safe in the build (`showFps` false), a risk in covers, videos and QA screenshots. | Before recording or QA: fresh profile, Show FPS off. Add a portal-report check that `showFps` defaults to false. |
| 8 | Little onboarding text, visuals first | Contextual hints are good (one line, keycaps), but "Hold Left Shift · dive to go farther, faster" and the bottom "Click · shoot" sit under the canopy at the same time as two top pills (pitch-canopy shot). | Max two text lines on screen at once: zone line + one hint. Hint queue priority: action you can do now (Space jump, open canopy, Shift dive) > loot > shoot. "Click · shoot" only appears once you hold a gun on the ground. |
| 9 | Clear buttons, comfortable layout | Lobby "AIM AND SHOOT" small spaced uppercase label above the picker: reads as an AI-template eyebrow tag (studio rule). | Sentence-case label "Aim" in the body style at 12 px, or no label (the two buttons explain themselves). |
| 10 | Name and imagery reflect gameplay | Old CG entry text said "storm", "mobile", "Top-Down". | Use only sections 2-4 of this spec in the new entry; do not copy fields from the rejected entry. |

### 6.1 Copy to paste (portal `neutral.ts`; mirror the same keys in `studio.ts` with its zone word)

howTo:
- Drop: "Jump from the plane when you like, free-fall, then steer the parachute down. You land with a pistol and two
  spare magazines."
- Loot: "Walk over loot to take it; press F when a key shows over an item. Two gun slots: 1 / 2, X or the mouse wheel to
  swap. Blue and gold beams mark the best gear."
- Survive: "Left click shoots, right click scopes a sniper. 3 bandage, 4 med kit, 5 bomb then click to throw. Q / E
  lean, C crouch, Shift roll, G super. Stay inside the safe zone."

Tips stay as they are (checked: none mention a wrong key).

### 6.2 Re-check before upload (CD gate)

Send the CD: one menu shot, the lobby, plane, canopy, first 5 s on the ground and the report at 1216x684, plus the
three covers. CD signs off in FEEDBACK F-018 before Reis uploads. Nothing is submitted while any of items 1-5 is open.
