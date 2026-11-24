# Online public play: flow, matchmaking and rollout (Last Commit Standing)

Owner: Creative Director. Date: 2026-11-22. Status: ready for engineering (design/spec only, no code was changed).
Related: `basic-launch-kpi.md`, `progression-v2.md`, `docs/collab/ENGINEERING/online-latency-plan-2026-11-22.md` (engineering, in
progress: region and transport choices live there, this spec only states what the player must experience).

## 0. Goal in one paragraph

Online is where LCS gets its best stories: a real person on the next roof, a last circle against someone who actually
thinks. The flow must never make a player pay for an empty server. Rule above all: **nobody waits more than 25 seconds
alone, and nobody ever sees an empty match.** Bots are the floor, people are the ceiling: with 1 player online you get 1
person and 19 bots after a short wait; with 400 online every seat is a person. The same flow works on
lastcommit.nalbakigames.com and on CrazyGames.

## 1. Inputs and evidence

Verified (read in the repo, `portal-build`):
- `server/LcsRoom.ts` + `src/game/net/lobby.ts`: one Colyseus room type `lcs`, always private (`setPrivate(true)`), up to
  `MAX_PEOPLE = 10`, the host decides on bots (fill to `MATCH_SEATS = 20`), ready checks, host presses Start. **The server
  does not run the match: the host's browser does** and sends ~10 KB snapshots at 20 Hz to every guest over WebRTC (relay
  through the server if the direct line fails). A guest who leaves becomes a bot; **if the host leaves, the round ends for
  everyone.** A room is locked during a round (nobody can join).
- `OnlinePanel.tsx`: invite link + copy/share, name field, member grid, bots checkbox, Start / I'm ready.
- `ONLINE_PLAY = false` (`src/lib/studio.ts`); the web menu shows a disabled `Online · Coming soon` row and the site-only
  `OnlineInterest` button; the CrazyGames build hides the row (`showsOnlineRow`).
- Menu today: `Play` (primary, "Solo · 19 bots"), Fighter, Settings, How to play, Credits.
- Fly app `lcs-game`, one `shared-cpu-1x` 256 MB machine in `fra`, auto-stop (cold start ~5 s per the netcode skill).

Verified (CrazyGames docs, fetched 2026-11-22: docs.crazygames.com/sdk/game and /requirements/multiplayer):
- Room data: `updateRoom({ roomId, isJoinable, inviteParams })`, `leftRoom()`, `addJoinRoomListener`, `game.inviteParams`
  on start, `inviteLink({...})`, `getInviteParam(name)`. `showInviteButton` is deprecated (use room data).
- `game.isInstantMultiplayer`: send the user straight into a joinable multiplayer location. "The first player in a party
  goes into a new private room with default settings"; an intermediate configuration screen is acceptable; **games with
  20+ players may place players directly into public gameplay**; users must be joinable immediately after launch.
- Required: pass room and status through the SDK (Join/Invite); **show CrazyGames usernames in-game**; **round-based games
  must keep the same group together into the next match** without going back through the CrazyGames UI; submit lobby
  sizes with the build. Recommended: allow joining a room at any time (spectate, or a popup that the room is mid-round);
  use the join listener so joining does not reload the page. Chat, if any, must obey `settings.disableChat` and needs a
  profanity filter. `gameplayStart/Stop` rules still apply.
- From the brief (not re-fetched): if solo and multiplayer both exist, solo must be equally prominent; CrazyGames hosts no
  servers.

Creative interpretation (genre knowledge, not inspected for this task): large-lobby games (battle royales, party
royales, .io games) hide thin populations with bot backfill and short, visible fill timers; players forgive bots, they do
not forgive waiting or an empty map. The common failure is dishonesty (a "120 players online" that is 119 bots) and dead
air in queue screens. LCS is a 20-seat game, so it can be honest and still always full.

## 2. Decisions (and why)

| # | Decision | Why |
|---|---|---|
| D1 | **Minimum humans to start = 1.** Bots fill every empty seat at start. | A minimum of 2 means the 3 am player waits forever and leaves. Bots are already good company (solo works). |
| D2 | **One open "flight" per region at a time.** Every Quick match joiner in a region goes into the same boarding flight until it closes; the next joiner opens the next one. | With low concurrency, splitting people across parallel lobbies is the worst outcome. One funnel guarantees two people online at the same minute meet. |
| D3 | **Fill timer 25 s, extended by people, capped at 45 s** (section 4). | 25 s is short enough for CrazyGames conversion, long enough to catch a second person at low traffic; each arrival buys a little more time so groups grow when traffic exists. |
| D4 | **Public matches must not depend on a stranger's browser.** Before CrazyGames: the authoritative sim runs on our server for public flights (engineering confirms cost/effort). Private rooms may keep the host-browser model. | Today the host can see and judge everything (cheating), a host phone on 4G cannot upload 9 x 1.6 Mbit/s, and one host closing the tab ends the round for 19 others. Fine among friends, unacceptable among strangers. |
| D5 | **No free-text chat.** Names only (cleaned), CrazyGames username when logged in. Quick pings come later, never typed text. | Chat brings moderation duties and adds nothing to a 3-minute BR. Removes most abuse surface. |
| D6 | **Honest counts, no fake population.** The lobby shows "4 people · 16 bots". The live "N online" number appears only when it is flattering (section 6.3). | Trust; CrazyGames players spot bots quickly. Honesty at the lobby lets the round itself stay immersive. |
| D7 | **In the round, bots and people look the same** (no bot badge in the HUD/kill feed). The result screen marks bots in the standings with a small glyph. | Keeps the fight tense; the truth is one screen later. Bot names are already dev-joke names, so nobody is fooled for long. |
| D8 | **Online rounds give +25 % XP when at least 2 people were in the round.** Same goals and streaks as solo. | Pulls players toward the mode Reis wants to be the most fun, without letting a 1-person online round farm XP. |
| D9 | **Solo and Online are two equal primary menu items** on every platform. | CrazyGames requirement, and solo is the safe instant start that protects conversion. |
| D10 | **A dropped player is never a statue:** their fighter goes on autopilot (bot brain) at once, and they can take it back. | Other players see a living fighter; the leaver loses nothing on a wifi blip. |

## 3. Player flow from the menu

### 3.1 Menu (both platforms)

```
SOLO                      You + 19 bots
ONLINE                    Quick match · bots fill in at 0:25   (or "37 online now", section 6.3)
Private room              Play with friends
Fighter                   Hotfix
Settings / How to play / Credits
```

- `Solo` and `Online` share the primary style and size (today only `Play` has it). `Private room` is a normal row.
- Initial focus: the mode the player last started (first visit: Solo). Stored in settings.
- `Online` goes straight into Quick match: no extra chooser screen. One press, one loading screen, then the boarding
  screen (render the boarding screen the instant the button is pressed, connecting happens behind it, web-game-vision
  rule "loading screen the instant the button is pressed").
- Remove `Online · Coming soon` and the `OnlineInterest` button when online is open.

### 3.2 States of a public flight (server)

```
OPEN (1 person, timer running) -> BOARDING (2+ people, timer extends) -> DOORS CLOSING (3 s, no joins)
   -> IN ROUND (plane, drop, fight) -> RESULTS (20 s "next flight together" window) -> new flight
```

### 3.3 Private room

The existing room flow (invite link, name, member list, bots switch, ready, host starts) stays as it is for slice 1.
Later changes (slice 3): anyone with the link can join during a round and waits in the room lobby for the next round
(today the room is locked); CrazyGames username replaces the typed name when logged in. Drop the small uppercase spaced
labels (`INVITE YOUR FRIENDS`, `IN THIS ROOM`) in any new version: plain sentence-case headings (studio rule, no eyebrow
tags).

## 4. Matchmaking rules (Quick match)

All numbers are server constants, logged per flight so we can tune them.

| Rule | Value |
|---|---|
| Fill timer starts | when the first person joins the flight |
| Base wait | 25 s |
| Each further person joins | +6 s, but the total since the first join never exceeds 45 s |
| Last joiner protection | the flight never closes less than 5 s after someone joined (they must see the board) |
| Flight is full (human cap) | timer jumps to 5 s |
| Human cap | slice 1: 6 (host-browser upload limit); slice 2+: 20 (server sim) |
| Doors closing | 3 s, no joins, board frozen, then the round starts |
| Bot fill | at doors closing, bots take every seat not held by a person (20 seats total) |
| Bot replacement in the lobby | seats are shown 1-20 from the start; empty seats show the bot that *would* take them. When a person joins, they take the lowest bot seat: the bot name flips to their name (section 6). Bots are only created at start, so nothing is "kicked". |
| One open flight per region | yes (D2). Overflow only when the open one is full or closing. |
| Region (slice 1) | `fra` only |
| Region (later, after the latency plan) | pick the lowest-RTT region; **people beat ping:** if that region's open flight is empty and another region with RTT ≤ 150 ms has people boarding, join that one. Never place a player above 180 ms. Settings gets `Region: Auto / <list>`; the boarding screen shows the region and ping. |
| Skill matching | none until concurrency is high (≥ 150 people in a region at peak). Rookies (first 3 rounds) keep their personal soft rules (bots wait longer before engaging that person), applied per person in online rounds. |
| Bot difficulty online | standard bot params; bots pick targets among people and bots alike (no "hunt the humans"). |
| Cold server | if the machine is stopped, the first join takes ~5 s: the boarding screen says "Warming up the server" and the 25 s timer starts only once the flight exists. |

### 4.1 One human online at 3 am

1. Press Online. Boarding screen appears at once: "Looking for people · bots fill in at 0:25".
2. The `Play solo instead` button is visible the whole time (one tap, no penalty, starts a normal solo round).
3. At 0:00 the flight closes with 1 person + 19 bots; the round is a normal round played on the server. The doors-closing
   line says "Just you tonight. 19 bots are boarding." Honest, friendly, no apology screen.
4. No +25 % online bonus (D8), all other progress counts.
5. Slice 4 adds late boarding (section 9): a person who presses Online while that flight is still in the plane takes a
   bot's seat before it jumps, so two night owls still meet.

## 5. What happens if someone drops, leaves or comes back

| Situation | Behaviour | Copy |
|---|---|---|
| Leaves during boarding | Seat freed after a 5 s grace (covers a reload); their name flips back to a bot. | Others see the flip only. |
| Drops mid-round (tab closed, wifi) | Their fighter goes on autopilot immediately (bot brain, keeps fighting). Reconnect allowed until the round ends (slice 2: server sim) or 20 s (slice 1: host model). | On return, menu banner: "Your round is still on" + `Rejoin`. In round: toast "Back in control". |
| Phone tab hidden > 10 s | Same as a drop: autopilot until the tab returns, then control comes back without a prompt. | "Back in control" |
| Rejoin after being knocked out meanwhile | Straight to their result screen for that round. | "You were knocked out while away" (with who/what as usual) |
| No input for 45 s after landing (AFK) | Autopilot; at round end they get results but no +25 % bonus. | none in round |
| Host leaves (slice 1 only, host-browser model) | Round ends for all; everyone gets XP and goal progress for the time they survived; back to a new flight with the same people (6.4). | "The host's connection dropped. Round over, your progress is saved." `Next flight` / `Menu` |
| Server restart / deploy | Deploy only when no flights are live, or drain: no new flights for 4 min before the restart. | If it still happens: "We lost the server. Your progress up to now is saved." |

Rejoin needs a reconnection token in `sessionStorage` (works across a reload, not across devices). That is enough.

## 6. The boarding screen (no dead air)

### 6.1 Concept: the departure board

The waiting screen is a **flight manifest**: the plane is about to take off, and the board fills with who is on it. It
uses what LCS already owns (the plane at the start of every round, the live map backdrop from the menu), it shows the
fill timer, the people and the bots in one honest picture, and every person joining is a small event.

Layout (desktop 1280x720):
- Background: the menu's live showcase (plane crossing, canopies), dimmed as behind the side panels.
- Left 55 %: the manifest board, 20 rows in 2 columns of 10. Each row: seat number, fighter colour dot, name. People in
  cream at full opacity, bots in cream at 40 % with their bot name, you highlighted with the gold row background (as in
  today's member list). When a person takes a seat the row does a split-flap flip (2 half-flips, 90 ms each, a soft
  click on the UI bus at -18 dB), the counter line updates.
- Above the board, big display-face timer: `0:18`, with the line under it (section 7). Last 5 s: the timer turns gold
  and ticks once per second.
- Right 45 %: your fighter card and the Style row (change fighter/outfit/canopy while waiting; reuse `FighterCard` and
  `StyleRow`), then today's goals with progress (progression v2), then one rotating tip (every 7 s, 12 short tips from
  How to play, e.g. "Hold G to aim a throw", "The zone hurts more each phase").
- Bottom right: `Play solo instead` (secondary) and `Leave` (text button). No primary button: the timer is the action.

Phone (390x844 portrait and 844x390 landscape):
- Timer and count line on top, the board as a 2 x 10 grid of compact chips (name truncated at 10 chars, no seat number),
  fighter card collapsed to one row with a `Change` button that opens the existing Fighter panel, goals hidden (tip line
  stays), buttons at the bottom in the thumb zone. Must fit 360x640 without scrolling; landscape ≤ 400 px tall: two
  columns side by side (board left, timer + buttons right).
- Reduced motion: the flip becomes a 120 ms cross-fade; the backdrop is still.

Acceptance: from button press to boarding screen ≤ 200 ms (render first, connect after); a second browser joining is
visible on the first within 1 s; the screen never shows a blank list or a spinner alone; no layout jump when names flip.

### 6.2 Doors closing (3 s)

The board freezes, rows of bots fill in quickly top to bottom (one every 60 ms), line changes to the doors copy, then
the normal match loading/plane starts. `gameplayStart` only when the round starts.

### 6.3 The live count

The menu sub-line under `Online` shows `N online now` only when N (people seen by the matchmaker in the last 5 minutes,
all regions) is ≥ 8. Below that it shows `Quick match · bots fill in at 0:25`. Never show 1, 2 or 3 online.

### 6.4 After the round: stay together

Results screen in an online round shows `Next flight` (primary) and `Menu`. All people who press `Next flight` within
20 s go into the same new flight together (server keeps them as a group, then the flight opens to new joiners as usual).
On the result screen a small line counts down: "Next flight with this group in 0:14 · 3 people in". This satisfies the
CrazyGames round-continuity rule and is the main online retention loop. Results also show "People this round: 4" and the
bot glyph in standings (D7).

## 7. Copy for every state

Tone: short, dry dev humour where it does not cost clarity; never fake urgency. All sentence case.

| Where / state | Copy |
|---|---|
| Menu row sub (low traffic) | `Quick match · bots fill in at 0:25` |
| Menu row sub (≥ 8 online) | `37 online now` |
| Menu private room sub | `Play with friends` |
| Connecting (≤ 5 s) | `Connecting…` |
| Cold start (> 2 s) | `Warming up the server…` |
| Can't connect (after 10 s or error) | `Can't reach the server right now.` buttons `Try again` / `Play solo` |
| Boarding, alone | `Looking for people · bots fill in at 0:25` |
| Boarding, 2+ people | `4 people · 16 bots · doors close in 0:18` |
| Someone joins (toast under timer, 2 s) | `yolo_dev boarded` |
| Flight full | `Full flight · taking off in 0:05` |
| Doors closing, 1 person | `Just you tonight. 19 bots are boarding.` |
| Doors closing, 2+ | `Doors closing · 4 people, 16 bots` |
| Region chip (later) | `Europe · 42 ms` |
| Secondary buttons | `Play solo instead`, `Leave` |
| Rejoin banner on menu | `Your round is still on` button `Rejoin` |
| Back in control | `Back in control` |
| Knocked out while away | `You were knocked out while away` |
| Host dropped (slice 1) | `The host's connection dropped. Round over, your progress is saved.` |
| Server lost | `We lost the server. Your progress up to now is saved.` |
| Online bonus on results | `Online bonus +25 % XP` (only with 2+ people) |
| Next flight countdown | `Next flight with this group in 0:14 · 3 people in` |
| Results people line | `People this round: 4` |
| Joined a private room mid-round (slice 3) | `They're mid-round. You'll drop in with them next round.` stays in the room lobby with the board (no solo offer here: it would take them out of the room) |
| Room full (private) | `This room is full (10 / 10).` `Quick match` / `Menu` |
| Invite link expired | `That room has closed.` `Quick match` / `Menu` |
| Name rejected by filter | (silent) falls back to `player` + 3 digits |
| Old client version | `A new version is out. Reload to play online.` `Reload` |

## 8. CrazyGames integration

| Need | Behaviour |
|---|---|
| Menu | Two equal primary rows `Solo` and `Online` (D9); `Private room` below. |
| `isInstantMultiplayer === true` at start | Skip the main menu after loading; create a **private room** with defaults (bots on) and open the room screen (allowed intermediate screen) with the invite controls; call `updateRoom({ roomId, isJoinable: true, inviteParams: { room: <id>, region: <code> } })` at once so friends can join immediately. Room id includes the region (`ab12fra`), as CrazyGames asks. Why private and not straight into public: friends who launched as a party expect to play together; the public flight is one tap away. |
| Game started from an invite (`game.inviteParams` non-null) | Skip the menu and onboarding, join that room. If it is mid-round: wait in the room lobby with the board (copy above). If closed/full: the copy above, then the menu. |
| Already playing and accepts an invite (`addJoinRoomListener`) | In menu/lobby: switch rooms without reload. Mid-round in solo or another online round: confirm `Leave this round to join your friend?` `Join` / `Stay`. |
| Room data while in a public flight | `isJoinable: true` while boarding and during the results "next flight" window; `false` in round. Friend who joins during boarding lands in the same flight. |
| Room data in a private room | `isJoinable: true` unless full (they wait for the next round). |
| Leaving | `leftRoom()` on every leave (menu, solo, tab close where possible). |
| Usernames | Logged-in CrazyGames username is the display name (cleaned, 14 chars); guests use their typed name. |
| Lobby size to submit | 20 per match (Quick match), 10 people per private room (until the private room moves to the server sim). |
| gameplayStart / gameplayStop | Start only when a round starts; stop on results, boarding, room lobby, menu. |
| Ads | Never request any ad while in a room or flight (a break pauses one browser while 19 others play; with the host model it would freeze everyone). Menu banner only, as today. |
| `settings.disableChat` | No chat exists (D5). If quick pings ship, they are preset only and still hide when `disableChat` is true. |
| Telemetry | The portal build sends no telemetry today: online KPIs on CrazyGames come from server-side counters (section 11) and the CrazyGames dashboard. No personal data in server logs (session ids only). |

## 9. Party, late boarding and growth features (after the first slices)

- **Party into Quick match:** a private room's host can press `Quick match together`: the whole group boards the next
  public flight as one block (counts against the human cap, never split).
- **Late boarding:** while a flight is in the plane phase and a bot has not jumped yet, a new Quick match player may take
  that bot's seat (only if it raises people per round; announced as `Late boarding, you're in`). Requires the server sim.
- **Spectate after knock-out:** follow your killer until the round ends; also used for invite joiners mid-round.
- **Warm-up while boarding:** a local, offline shooting yard behind the board (no network cost). Only if boarding times
  grow past 30 s median.
- **Quick pings** (preset, e.g. "Loot here", "Danger") for parties; never free text.

## 10. Cheating and abuse basics

| Risk | Answer |
|---|---|
| Client-side hacks (speed, damage, wallhack via state) | Server owns the sim for public flights (D4); clients send inputs only; validate every message (shape, finite numbers, enum ranges: `protocol.ts` already validates inputs). Wallhack is limited by sending only what is needed later (out of scope for slice 2; note it). |
| Host cheating (slice 1) | Accepted risk for a site-only beta; that is one reason slice 1 does not go to CrazyGames. |
| Join flooding / bots scripting the server | Per-IP limits: 10 joins/min, 3 open connections; max message size (relay limit exists, add one for inputs); drop clients that send > 120 messages/s. |
| Offensive names | Existing `cleanName` + a small profanity list (server side) + CrazyGames username when logged in. Rejected names become `player` + 3 digits silently. |
| Chat abuse | No chat (D5). |
| Teaming in a solo BR | Not enforced. Watch for complaints; if it becomes a pattern, add duo mode rather than detection. |
| AFK farming the online bonus | Bonus needs 2+ people and some input after landing (AFK rule, section 5). |
| Old clients | Version check on join; mismatched versions get the reload copy. |

## 11. KPIs to watch

Server counters (per region, per day; no personal data), plus the site telemetry for the web build and the CrazyGames
dashboard for the portal.

| KPI | First target | Act if |
|---|---|---|
| Boarding wait, median / p90 | ≤ 25 s / ≤ 45 s | p90 > 45 s: bug in the timer rules |
| Left during boarding | ≤ 15 % of joins | > 25 %: shorten base wait to 20 s, check the screen |
| People per round, median | 1 at launch, track the trend | stays 1 for a week at decent traffic: check D2 funnel |
| Rounds with 2+ people | ≥ 30 % within 2 weeks of the CrazyGames update | < 10 %: add late boarding sooner |
| Online share of rounds | 25-40 % | < 10 %: the menu or the copy undersells online |
| Rounds per online session vs solo | online ≥ solo + 1 | lower: look at Next flight usage |
| Next flight acceptance | ≥ 50 % of people at results | lower: results screen copy/placement |
| D1 retention, online players vs solo | online ≥ solo | |
| Mid-round drops / rejoin success | ≤ 5 % / ≥ 70 % | |
| Host-ended rounds (slice 1) | ≤ 5 % of online rounds | > 10 %: speed up slice 2 |
| RTT median / p90 per region | from the latency plan | |
| Server cost per 1,000 rounds | track | |
| CrazyGames: playtime 10+ min, D1, conversion | unchanged or better after the update | conversion drops: online is too prominent as first action, revisit default focus |

## 12. Phased rollout

### Slice 1: Quick match beta on our site (the smallest thing that tests the idea)

Scope: web build only (CrazyGames build unchanged), Europe (`fra`), behind `ONLINE_PLAY`.
1. Server: a second room type for public flights: listed (not private), no host controls, no ready checks, the fill timer
   and cap from section 4 (cap 6), one open flight at a time, doors closing, bots fill to 20 at start. The host browser
   (current model) is picked by the server: prefer a desktop member, then the lowest RTT; fall back to the first joiner.
2. Client: menu `Solo` + `Online` equal rows, `Private room` row (existing room flow, unchanged); boarding screen v1
   (board with names and bots, timer, count line, `Play solo instead`, `Leave`; the flip animation, goals and tips may
   follow in slice 2); `Next flight` on results re-queues (a plain re-queue, not yet as a group).
3. Drops: existing guest-to-bot handover; host drop ends the round with progress saved and the copy above.
4. Counters: boarding wait, leaves during boarding, people per round, host-ended rounds, drops (server logs are enough).
5. Test: automated 2- and 6-browser runs through the deployed server (joins flip seats, timer extends, doors close, bots
   fill, one guest closes a tab, the host closes a tab), then one evening playtest with Reis and friends on different
   networks. Exit criteria: no stuck flights, wait p90 ≤ 45 s, nobody sees an empty or broken board, the round feels like
   the solo round.

### Slice 2: Safe with strangers (gate before CrazyGames)

Server-owned sim for public flights (D4), cap 20, autopilot on drop + rejoin until round end, `Next flight` as a group,
online XP bonus, profanity list, rate limits, version check, boarding screen v2 (flip, goals, tips, phone layouts), the
results line "People this round" and the bot glyph. Regions when the latency plan says so (people-beat-ping rule).

### Slice 3: CrazyGames update

Section 8 in full: room data, Instant Multiplayer into a private room, invite params, join listener, usernames, joining a
private room mid-round, lobby sizes in the upload form, no ads in rooms. Submit as an update; watch the CrazyGames KPIs
for a week against the pre-online baseline.

### Slice 4: Grow

Party into Quick match, late boarding, spectate, quick pings, warm-up yard if waits grow, skill matching once a region
has ≥ 150 people at peak.

## 13. Must not change

The solo round (rules, bots, drop timing, canopy feel, progression); the deterministic sim; solo stays one tap from the
menu on every platform; no midgame video ads; phones first-class; no copied names, text or UI from other games.

## 14. Open questions for engineering (answer in LOG.md or REQUESTS.md)

1. Cost/effort of running the match sim on the server (20 fighters, bots, 60 Hz) per flight on `shared-cpu-1x`: how many
   flights per machine? If ≤ 2 days of work, skip the host-model public flight and start slice 1 directly on the server
   sim (it removes the host-drop row and the cap of 6).
2. Can a public flight be joined by a party as a block on the current Colyseus matchmaker, or does it need a small custom
   queue?
3. Is the 5 s cold start acceptable with auto-stop, or should one machine stay warm (`min_machines_running = 1`) once
   online is public? Recommendation: keep one warm from slice 3.
