# Basic Launch KPI plan: Last Commit Standing (CrazyGames build)

Owner: Creative Director. Date: 2026-11-22. Request: R-006.
Target for Full Launch: average playtime 10+ min, D1 retention 10-15 %, conversion (opened -> 1+ min played) 80 %+,
thumbnail CTR in the top 20 % of Shooting.

## Sources and how this was judged

- Verified (CrazyGames docs, fetched 2026-11-22): docs.crazygames.com/resources/basic-launch-metrics (the four KPIs and
  their benchmarks; **CTR is scored only for games that start Basic Launch on or after 23 Nov 2026, so it counts for us**),
  docs.crazygames.com/requirements/game-covers (covers: main character or big stylized title, "don't simply screenshot the
  gameplay", "don't write anything besides the title", no borders; preview video: 15-20 s, starts on the static cover
  frame, no black bars, no promo text, intense battles for action games), docs.crazygames.com/requirements/quality
  (users reach gameplay quickly, visuals over text).
- Played: `dist/portal` served locally, headless Chromium 1280x720 and 390x844, cold start, then 7 min of scripted play
  (random WASD, J held in bursts, F, Space; not a skilled human). Read: PortalGame.tsx, Match.tsx, sim/bot-params.ts,
  render/chute.ts, platform/types.ts. Viewed all 9 covers and both preview videos (frame sheets at 1 fps).
- Not verified: real CrazyGames traffic, real phones, sound, how a skilled first-timer plays. Impact numbers below are
  my estimates, not measurements.

## What a new player gets today

- **First 60 s.** Menu paints at ~4 s (load 90 % at 1 s, good). Play -> lobby (Ready with Space) -> countdown -> plane ->
  jump. Control of the jumper at ~18-22 s. The drop is the best moment in the game (canopy, landscape, other jumpers).
- **The trap.** J (shoot) works during free-fall and under the canopy and **spends the pistol's only magazine**:
  12 -> 0 before landing in every scripted round. The player lands with "Out of ammo · find an ammo box or another gun",
  often in a forest far from loot.
- **First minutes.** Round 1: knocked out at 0:37 after landing, #20 of 20. Round 2: 0:50, #19. Round 3: 0:50, #20.
  Round 4: hid, #2 by the Storm at 2:29. Bots are tuned to engage a human sooner than each other
  (`LANDING_GRACE.human 18 s`, rushers x0.6 = ~11 s). Result: ~45 s of lobby + plane + drop for ~30 s of losing.
- **Why they quit.** Death before the first gun, before the first kill, with a #20 sticker; nothing kept from the round;
  every round restarts from zero; the visible "Online · Coming soon" row says the real game is elsewhere.
- **Why they would come back tomorrow.** Nothing today: no level, no unlocks, no stats history, no daily goal. Only the
  fighter pick and settings are saved.
- **Covers.** Three gameplay screenshots with a tagline. B (firefight, -56) is the strongest, but all three break the
  CrazyGames cover rules (plain screenshots, text besides the title), the fighters are small, and B says
  "10 PLAYERS. 1 WINNER." while the game says 20.
- **Preview videos.** Landscape and portrait: ~12 of 15 s are free-fall and canopy over trees, ~3 s on the ground with one
  "-34". For the Shooting category the video shows almost no shooting, and it does not open on the cover frame.

## Ranked changes (top 3 first: 1-2 days together)

### 1. Safe first drop: no wasted ammo, a gun on landing, a grace period (Conversion, Playtime) - S

Expected impact: conversion +10-15 pts (no first-minute death and no "Out of ammo"), playtime +1-2 min per session (the
first rounds last 2+ min instead of 40 s).

- **Fire is off in the air.** While the jumper is in the plane, free-falling or under the canopy, J / left click / the
  touch fire button do nothing and spend no ammo. Show the hint `Land first, then shoot` (existing hint pill, 1.5 s, at
  most once per round) the first time fire is pressed in the air.
- **Never empty-handed.** The pistol has 12 in the magazine and **24 spare** at the start of every round (today: one
  magazine). The `Out of ammo` hint stays for every other gun.
- **New-player rounds.** For the player's first 3 rounds ever (counter `lcs.roundsPlayed` in `platform.storage`, see #2):
  `LANDING_GRACE.human` 18 -> 35 s; bots aiming at the human get `aimError` x1.35; bots never target the human in the
  first 8 s after the human lands, whatever the persona. From round 4 on, today's values. Bot-vs-bot rules unchanged.
- **Land near loot.** If the player lands on a spot with no loot item within 25 m, the arrow hint `Loot nearby` points to
  the nearest weapon pickup for 4 s (reuse the minimap ping colour; no new art).
- Acceptance: scripted run that holds J from jump to landing lands with 12/24; rounds 1-3 of a fresh profile average
  > 90 s survived with the same random-input script that died at 37-50 s today.
- Do not change: drop timing, canopy feel (canopy-feel.md), the sim's determinism (the new-player numbers are inputs to
  the match setup, recorded with it).

### 2. Career level with canopy unlocks, saved in the cloud (D1, Playtime) - M

Expected impact: D1 +3-5 pts; playtime +1-2 min ("one more round to level 5").

- **Storage.** One JSON under `lcs.career` in `platform.storage` (CrazyGames data module on the portal, localStorage on the
  web): `{ v:1, xp, level, roundsPlayed, wins, kills, bestPlace, bestKills, unlocked:[canopy ids], canopy, daily:{...},
  streak:{ days, lastDay } }`.
- **XP per round** (shown line by line on the round report): survived 1 XP per 10 s (cap 30), placement
  `max(0, 21 - place) * 3` (#1 = 60), kills 15 each, damage 1 per 20, win bonus +50, first round of the day +40.
  A typical bad round gives ~25 XP, a top-5 ~90.
- **Levels.** XP to next level = `100 + 25 * (level - 1)`. Levels 2-5 come within the first session (~4-6 rounds).
- **Unlock = canopy.** The canopy is the game's signature and every jumper sees it. `buildChute(color)` already takes the
  colour, so each unlock is a colour plus a cell pattern, no new meshes:
  L2 Mint stripes, L3 Sunset (orange/purple), L4 Navy chevron, L5 Gold cells, L7 Checker (black/white),
  L10 Two-tone split, L15 Rainbow cells, L20 Night (dark cells, light seams). Patterns are per-cell colour keys in the
  existing vertex-colour array (alternate cells, chevron = cell index parity by row, split = left/right half).
- **Where it shows.** Menu: under the logo, a thin level bar `Level 4 · 230/175 XP` (cream text, gold fill, no label above
  it). Lobby: a `Canopy` row of swatches under the fighter cards; locked ones grey with `Lv 7`. Round report: below the
  three stat stickers, the XP lines count up (0.15 s each), the bar fills, and a level-up shows the new canopy spinning
  in a small canvas for 1.2 s with `New canopy: Gold cells`. `platform.happytime()` on level-up.
- Acceptance: a fresh profile reaches Level 2 after 1-2 rounds; the chosen canopy appears in the next drop; reload of the
  page keeps level and canopy.

### 3. New covers and a recut preview video (CTR) - S-M

Expected impact: CTR from probably bottom half to top 30-20 % of Shooting (estimate; A/B test them on CrazyGames).

- **Covers (all three sizes, same composition):** no tagline, title only (existing logo lockup, bigger: 40 % of the
  landscape width). Subject: one fighter (Blaze, orange) **large**, three-quarter from below, under the striped canopy
  with the pistol drawn, filling 45-55 % of the frame height; behind and smaller, two more jumpers and the plane; ground
  far below with the river. Real in-engine render from a posed camera (no paint-over that changes the style), sky-and-land
  colours as the menu. Landscape: fighter right third, title left. Portrait 800x1200: title top, fighter centre-low.
  Square: fighter centre, title top-left. One muzzle flash on the pistol is allowed; no damage numbers, no HUD.
- **Second cover for the A/B test:** the same lockup over a ground firefight, fighter close (40 % height) firing the
  shotgun, one rival in the frame knocked back. Still no text besides the title.
- **Preview video (15 s, landscape and portrait, native 2:3 framing, no bars):** 0.0-0.5 s the static cover; 0.5-3 s the
  jump and the canopy opening (closer camera than today); 3-13 s ground fights only: a pickup glow, two KOs with the
  `ELIMINATED` banner, a rocket or shotgun hit, the Storm wall; 13-15 s the `#1` win sticker. No cursor, no text overlays.
  Capture with the new-player bots off (real fights) and the HUD on.
- Fix the copy everywhere on the portal page: 20 players, not 10.

### 4. Daily goals and a day streak (D1) - M

Expected impact: D1 +2-4 pts (the main "come back tomorrow" reason).

- Three goals per local day, picked from a fixed list by a seed of the date: `Finish in the top 10`, `Deal 300 damage`,
  `Knock out 2 fighters`, `Survive 3 minutes`, `Land in the container port`, `Pick up a rifle`, `Win a round`
  (only as 1 of 3 after level 5), `Open your canopy below 60 m`. Progress counts across rounds of the day.
- Reward: 60 XP each, all three +100 XP. Streak: days in a row with at least one goal done; at 3 and 7 days a bonus
  canopy (`Streak 3: Teal waves`, `Streak 7: Ember`).
- UI: a `Today` card on the menu under Play (three rows, checkbox glyph, `2/3`), `New goals in 7 h` under it once done.
  On the round report, a goal finished this round flashes gold. No pop-ups at menu open.

### 5. Round report that pulls into the next round (Playtime) - S

Expected impact: playtime +1 min (more rounds per session).

- Under the stats: one line of personal context, the first that applies: `New best: #4` / `Best so far: #4. Top 3 next.`
  / `First kill!` / `You outlived 12 fighters.` (from `20 - place`).
- `Play again` is the focused default (Enter, gamepad A, big touch target), `Main menu` secondary.
- Play again with `quick` skips the Ready press: the lobby shows for 3 s with the countdown already running.
- Eliminated before #5: show `Spectate` (follow the fighter who knocked you out) beside Play again only if engineering
  already has it; do not build spectating for this.

### 6. Hide `Online · Coming soon` on the CrazyGames build (Conversion, trust) - S

- The disabled row tells a first-timer the real game is not here. Remove the row on `platform.id === 'crazygames'`; the
  web build keeps it. Menu order: Play, Fighter, Settings, How to play, Credits.

### 7. Fighter supers as a reason to switch (Playtime) - S

- In the lobby, under the fighter cards, one line per fighter's super with its key (`G · Rush: a dash that hits
  everyone in its path`), already there for the picked fighter; add a `Try Rookie next` nudge on the round report after
  3 rounds with the same fighter. Supers are the variety that exists already; players need to notice it.

### 8. First-round onboarding without text walls (Conversion) - S

- The lobby/plane screen shows "20 PLAYERS ONE WINNER" plus a sentence. Keep the big title, drop the sentence. Show the
  three verbs as key glyphs on screen at the right time instead: `Space` at the plane (exists), `J` only after landing
  (pairs with #1), `F` next to the first loot item in range (exists as the pickup key). Hide the full keyboard legend in the
  top-left for the first round (it is 4 rows of small keys on a 1280 screen); keep it from round 2 and in the pause menu.

## Order and effort

Day 1: #1 (S), #6 (S), #5 (S). Day 2: #2 (M) and #3 covers and video (S-M; art and capture can run in parallel).
Then #4, #7, #8. Do not start new modes or maps before #1-#4 are in: they fix the four KPIs at the cheapest point.

## Must not change

Canopy feel and drop timing; the sim's determinism; the art style (low-poly, original); no midgame video ads; phones
stay first-class (every new UI item above needs a 390x844 and 844x390 layout before it ships).
