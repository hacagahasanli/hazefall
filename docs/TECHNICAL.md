# Last Commit Standing: technical guide

Reader: a developer who knows web development (Next.js, React, TypeScript) but has not built a game.
Goal: after reading this you can find any rule in the code, change a number safely, and see why the project is split the way it is.

Everything here was read from the source at commit `efd3251`; `file:line` points at the lines as of that commit. For the game design (what the game is meant to be) read `docs/DESIGN.md`; this guide describes what the code does today. Where the two differ, see "Known gaps" at the end.

Status: a single-player prototype, you against 9 bots, in the browser. There is no networking code.

---

## 1. Run it

```bash
npm install
npm run dev          # http://localhost:3100 (next dev -p 3100)
npm run test:run     # vitest, 17 tests, about 1 s
npm run type-check   # tsc --noEmit
```

Open `http://localhost:3100/play`. Observed when writing this guide: `npm run test:run` printed `Tests 17 passed (17)`; `npm run type-check` printed no errors; `/play` answered HTTP 200.

Dev aids (both active only when `NODE_ENV !== 'production'`, i.e. under `npm run dev`):

| Aid | How | What it does | Source |
|---|---|---|---|
| Close camera | add `?cam=near` to the URL, for example `/play?cam=near` | The ground camera sits 3.2 m up and 4 m behind you instead of 36 m up, to check character animation. | `game.ts:730` |
| `window.__lcs` | type it in the browser console | `{ state(), buildings, map }`: the live `GameState`, the `BUILDINGS` list and the `MAP` strings. | `game.ts:1070` |

`window.__lcs.state()` is the fastest way to learn the game: call it again after something happens and compare.

---

## 2. Architecture in one picture

```text
src/
  app/                    Next.js App Router: pages only
    page.tsx              title screen
    play/page.tsx         renders <Lobby/>
  components/             React UI around the canvas
    Lobby.tsx             fighter pick, Play button, remembers the pick
    Match.tsx             owns the canvas, the HUD, the Esc Esc menu
    AimChoice.tsx         auto-aim / mouse-aim switch
  game/
    sim/                  THE RULES. Pure TypeScript: no DOM, no three.js
      constants.ts        map generator, weapons, fighters, drop, zone numbers
      types.ts            GameState, Player, Input, GameEvent
      step.ts             step(state, inputs): one tick of the game
      bot.ts              createBot(): returns a function state -> Input
      sim.test.ts         17 vitest tests
    render/               WHAT YOU SEE. three.js
      game.ts             startMatch(): the loop, input, camera, HUD data
      characters.ts       fighter models and animation
      nature.ts           terrain texture, grass, trees, wind
      roads.ts            roads and paths as geometry
      furniture.ts        room furniture, rugs
      guns.ts             gun models
      world.ts            assembles the map, houses fade when you enter
      vfx.ts, palette.ts  particles, shared materials
    sfx.ts                WebAudio sound, buses, volumes
public/assets/            Kenney CC0 models, recorded gunshots (see ASSETS.md)
```

The one rule that shapes everything: **`src/game/sim` knows nothing about the screen.** `step()` takes a state and the ten players' inputs and changes the state. Rendering reads the state; it never writes rules back. Why a web developer should care:

- It is like a reducer: `state = step(state, inputs)`, but it mutates in place for speed.
- It runs headless, so the tests play whole rounds in about a second.
- It could run on a server unchanged (the file header in `types.ts` says so). Nothing does that yet.

Effects (sound, particles, camera shake) are driven by **events**: each `step()` clears `state.events` and the rules push things like `{ type: 'hit', ... }`. The renderer reads them in `handle()` (`game.ts:486`). The rules never call a sound.

---

## 3. The loop and time (`game.ts:1042`)

A game loop calls update-and-draw many times per second. This one separates the two:

- **Simulation: fixed 60 Hz.** `DT = 1/60` (`constants.ts:3`). The frame callback adds the real elapsed time (capped at 0.1 s, so a background tab cannot cause a huge catch-up) to an accumulator `acc` and runs `step()` once per `DT` it holds.
- **Drawing: once per display frame.** `renderFrame(dt, alpha)` draws between two ticks. Before each tick the code copies every player's position into `prev`; drawing uses `prev + (now - prev) * alpha`, where `alpha = acc / DT`. Without this, movement would look stuttery at 120 or 144 Hz screens.
- **Pause** sets `acc = 0` so the world freezes while the camera keeps drawing (`game.ts:1048`).
- **HUD to React: 10 Hz.** `emitHud()` builds a plain `HudState` object and calls `onHud` every 0.1 s, so React re-renders 10 times a second, not 60. The minimap is redrawn at the same 10 Hz.

Why fixed timestep: the same input must give the same result on any computer and any frame rate, which is also what makes tests meaningful.

**Determinism.** The simulation never calls `Math.random`: `step.ts` uses `nextRandom(state)`, a small PRNG whose seed lives in `state.seed`. The map is generated from fixed seeds (below). Two caveats: `startMatch` picks the match seed with `Math.random()` (`game.ts:118`), and each bot has its own private PRNG outside the state (`bot.ts:26`), so a recorded input log replays the same, but a bot does not replay from the state alone.

---

## 4. The simulation (`src/game/sim`)

### 4.1 Units

World size is 128 x 128 metres: 64 x 64 tiles, `TILE = 2` m (`constants.ts:6-8`). The player is a circle of radius 0.55 m (`PLAYER_RADIUS`). `x` runs right and `y` runs down the map; in three.js `y` becomes depth (`z`).

### 4.2 The map is generated, the same every time (`constants.ts:53`)

`MAP` is an array of 64 strings, one character per tile. It is built once at import time by `buildMap()` from fixed seeds (`rng(91827)` for the layout, `rng(5150)` for furniture), so every browser and every match gets the identical map.

| Char | Tile | Blocks you | Blocks bullets |
|---|---|---|---|
| `g` | grass | no | no |
| `p` | dirt path | no | no |
| `a` | asphalt road | no | no |
| `#` | wall | yes | yes |
| `w` | window | yes (you can vault it) | no |
| `.` | floor inside a building | no | no |
| `f` | fence (thin rail) | yes (vaultable) | no |
| `t` | tree (trunk only) | yes | yes |
| `k` | rock | yes | yes |
| `r` | crate / server rack (has hit points, breaks) | yes while standing | yes while standing |
| `b`, `c` | bush, crops | no; you hide inside | no |
| `u` | furniture | yes (vaultable) | no, you shoot over it |
| `l`, `s` | loot spot inside / outside | no | no |

Generation order: roads and dirt paths first, then the Old Town grid of houses, 6 lone houses, three farms, the forest ("Deadwood"), the quarry, scattered trees and bushes, the door aprons, and last the tree line around the edge.

**Furniture placement with a reachability check** (`furnish`, `constants.ts:155`). Placing furniture at random can wall someone into a room. So each building does this:

1. Collect candidate tiles: floor tiles that touch a wall or window, are not next to a door, and are not in the doorway of an inner wall.
2. Shuffle them with the furniture's own random stream. A separate stream means adding furniture does not reshuffle the rest of the map.
3. Take a piece only if a breadth-first search (`connected()`) from a door still reaches every walkable tile of the building. If not, the piece is taken back.
4. Target count: `(w-2)*(h-2) / 3.5` pieces for a house, `/ 6` for a barn, at least 1.

Crates inside buildings go through the same check (they are removed if they sit by a door or split the room).

**Door aprons** (`constants.ts:317`, "Every door opens onto open ground"). Farms, yards and scattered trees are placed after the houses and could block a door from outside. A final pass walks every door tile and, for the two tiles in front of it, turns any fence, tree, rock or crate (`ftkr`) back into grass.

**`ROUTES`** (`constants.ts:31`) is the centre line of every road and path in world metres. The map characters only say "road here"; the renderer draws a clean curved strip along `ROUTES` instead of colouring tiles (section 5.4). The generator pushes `ROUTES` as it paints, so the two cannot disagree.

**What you actually bump into** (`SHAPES`, `constants.ts:360`). A tile is 2 m, but a tree is only its trunk (0.45 m radius), a rock 0.95 m, a crate 0.8 m, a fence a rail 0.16 m either side of the tile centre and furniture the tile minus 0.22 m. Trees are drawn up to 0.4 m off their tile centre (`treeSpot`) so a forest does not look like a grid; collision uses the same offset. The renderer places models at the same spots, so what you see is what stops you.

### 4.3 State (`types.ts`)

`GameState` holds everything: `tick`, `phase` (`drop`, `play`, `over`), `seed`, the `drone`, `racks` (health per tile index), `players[10]`, `projectiles`, `loot`, `walls` (the Legacy super), `fields` (the Standup super), `zone`, `winner`, `events`. A `Player` carries position, velocity, heading, hp, armor, weapon, magazine and spare ammo, reload timer, super charge, vault state and `prev` (last tick's input).

Player 0 is you; players 1 to 9 are bots with names from `BOT_NAMES`. Each tick the loop builds an `Input[10]` array: your keyboard for index 0, `bots[i](state)` for the rest (`game.ts:1051`).

### 4.4 One tick: `step()` (`step.ts:838`)

In this order:

1. Clear `state.events`; `tick += 1`.
2. If the phase is `drop`, move the drone and every player still in the air (`updateDrop`).
3. For every living player on the ground, `updatePlayer`: cooldowns, regeneration, turning, reload, vault or dash or normal movement, shooting, super, pickups.
4. Move projectiles (`updateProjectile`); bullets stop at solids or players, lobbed bombs and rockets explode when their arc ends.
5. Age slow fields and temporary walls.
6. In the `play` phase only, advance the Deadline (`updateZone`).

Because the Deadline only runs in `play` and `play` starts when everyone has landed, the zone waits for the slowest parachute.

**Edge-triggered buttons.** Super, use and reload fire on the tick the key goes down, not while it is held. `pressed(k) = input[k] && !p.prev[k]` (`step.ts:684`), which is why every player stores `prev`.

### 4.5 Collision: `pushOut` and `moveBy` (`step.ts:126`, `:206`)

Games usually do not "check, then refuse the move". They move first, then push the body out of whatever it overlaps. That is what makes you **slide** along a wall instead of sticking to it.

- **`pushOut(pos, r)`** looks at the tiles around the circle. For each obstacle it finds the nearest point on the obstacle's shape (a box, or a circle for trunks, rocks and crates) and moves the circle out along the line between the two. If the circle's centre is inside a box it leaves by the nearest side. It repeats up to 3 times because pushing out of one thing can push into another (a corner). It also clamps to the map edge.
- **`moveBy(p, dx, dy)`** moves in sub-steps of at most 0.2 m and calls `pushOut` after each, so a fast mover (a dash covers 8 m in 0.28 s) cannot jump over a thin fence rail.
- **Sliding.** After moving, `updatePlayer` compares where it wanted to go with where it ended up. The difference is the contact normal. It removes the part of the velocity pointing into the obstacle and keeps the part along it (`step.ts:752-763`). Running diagonally into a wall keeps you moving along it; the test "running diagonally into a wall slides along it" covers this.
- **Movement feel.** Velocity accelerates towards the wanted speed (`MOVE.accel` 24) and eases off with `MOVE.friction` 20. Heading turns toward the aim at `MOVE.turn` 8 rad/s, never snapping.

**Vaulting** (`step.ts:764-802`). `pushOut` returns which "vaultable" tile (`w`, `f`, `u`) you pressed on. If you keep pushing straight into one for `VAULT.after` (0.15 s), `tryVault` snaps the direction to the nearest axis and looks 1.1 to 3.2 m ahead (`VAULT.reach`) for the first spot where a circle fits. It then runs a 0.42 s scripted hop there (smoothstep from start to end, no shooting meanwhile). Trees, rocks, walls and standing crates are not vaultable.

**Bullets** are not circles. A bullet advances in steps of at most 0.4 m and tests `solidAt` (a point test; windows, fences, furniture and plants return false) and a 0.7 m hit radius around each other player.

### 4.6 Weapons, magazines, reload, ammo boxes

Stats are in `WEAPONS` (`constants.ts:414`): damage, bullets per shot, spread, speed, range, fire interval, `ammo` found in the gun, `mag` and `reload` seconds.

| Weapon | Damage x bullets | Mag / spare when found | Reload (s) | Range (m) |
|---|---|---|---|---|
| Fists | 110 | infinite | none | 1.6 |
| Pistol | 140 | 12 / 36 total | 1.1 | 13 |
| SMG | 75 | 30 / 90 total | 1.7 | 12 |
| Shotgun | 70 x 7 | 6 / 18 total | 2.2 | 7 |
| Rifle | 120 | 25 / 75 total | 1.9 | 20 |
| Sniper | 700 | 5 / 10 total | 2.6 | 34 |
| Rockets | 900, radius 3 m | 1 / 4 total | 2.4 | 16 (lobbed) |

("Total" is `ammo`, magazine plus spare; the gun starts with a full magazine and the rest as spare.)

- **Firing** (`shoot`, `step.ts:547`): blocked while reloading; an empty magazine with spare rounds starts a reload instead of firing; each shot reduces `mag`; reaching 0 starts a reload.
- **Reload** (`startReload`, `updateReload`): `reload` seconds later, `min(mag size - mag, spare)` rounds move from spare to magazine. R reloads early. The `reload` event carries the gun and position, so other players' reloads are audible.
- **Out of everything**: the gun stays in hand, you hit with fists (`kind = 'fists'` inside `shoot`) and a `dryFire` event plays a click. Picking up an ammo box refills it.
- **Ammo box**: adds `mag * AMMO_BOX_MAGS` (2) spare rounds for the gun in your hands, and starts a reload if the magazine is empty. It is picked up automatically while spare rounds are under 2 magazines.
- **Swapping**: walking over a gun picks it up automatically only if you hold fists or an empty gun; otherwise press E, which drops yours (with its remaining rounds) and takes the new one. A KO drops the gun, item and armor you carried.
- **Rockets and bombs** are lobbed: a `lob` projectile flies a fixed 0.35 s plus distance/22 along an arc to the aim point, then `explode` damages everyone in radius with linear falloff (`1 - 0.7 * d/radius`), halved for the thrower, and damages crates and racks.
- **Armor** absorbs 60 % of each hit (`ARMOR.absorb`) until its 500 points are gone; the Deadline ignores armor.
- **Regeneration**: 25 hp/s starting 6 s after the last combat.
- **Supers**: charge grows with damage dealt (`damage / superCost`); Q fires it when full. Hotfix dashes (takes no damage from other players while dashing), Legacy places a wall, Standup a slow field, Intern a knock-back blast.

### 4.7 The drop

You spawn on a cargo drone that crosses the map on a random line (`createGame`, `step.ts:285`). Press Space (or fire) to jump once it is over the campus; at 92 % of the flight everyone left aboard is pushed out. You fall for 3.2 s (free fall) then glide for 5 s under a parachute, steering at 14 and then 7 m/s; landing picks the nearest unblocked spot (`freeSpot`). Heights come from `fallHeight` (`constants.ts:482`). Bots pick a random moment in 15 to 75 % of the flight.

### 4.8 The Deadline (zone) (`step.ts:395-435`)

`ZONE_PHASES` has 5 phases of wait, shrink, target radius and damage per second: for example phase 1 waits 42 s, shrinks over 32 s to radius 60, then deals 12 hp/s outside. The first circle has radius `WORLD * 0.72` (about 92 m, bigger than the map). Each next circle's centre is chosen at random inside the current one (`pickNextCircle`, within 60 % of the spare room) using `nextRandom`, so it is deterministic. Waits plus shrinks total 224 s after everyone has landed. Outside the circle you take `dps * DT` per tick through `hurt(..., ignoreArmor)`.

### 4.9 Visibility

`canSee(state, viewer, target)` (`step.ts:231`): a target standing in a bush or crops is invisible unless the viewer is within `PLANT_REVEAL` (2.4 m) or the target fired in the last second (`revealed`). Auto-aim and bots both use it, so hiding works against them too. `lineOfSight` samples the segment every 0.5 m with `solidAt`.

### 4.10 The bots (`bot.ts`)

Each bot is a closure `state -> Input` that re-thinks every 8 ticks (7.5 times a second) and repeats its plan in between; one-shot buttons (super, use) are only pressed on a thinking tick.

| Priority | Behaviour |
|---|---|
| Drone | jump at a personal moment (`jumpAt`) |
| Falling | glide gently toward the point (48 m, 48 m), a little left of the map centre |
| Zone | if outside the target circle's 85 % and the Deadline is shrinking or under 12 s away, run to the next circle's centre |
| Target seen (within 22 m, line of sight) | keep the range the gun likes (`PREFERRED`: pistol 9 m, shotgun 3.5 m, sniper 18 m, ...) while strafing; fire inside 95 % of range; super under 9 m; throw a bomb under 11 m |
| Otherwise | walk to the nearest useful loot within 30 m, else toward the next circle |
| Hurt, calm | use a med kit under 55 % hp |

Aim has a per-bot random error (0.6 to 1.4 m) so they can be beaten. There is no path-finding: when a bot barely moved over a think interval and its goal is more than 1.5 m away, it walks 25 to 55 ticks in a direction 90 degrees (plus a little) off its goal (`detour`).

### 4.11 Tests (`sim.test.ts`)

17 tests, run in Node with no browser: map shape, windows and fences vs bullets, trunk and rock shapes, furniture reachability, doors opening on open ground, edge of the world, the drop, loot swap, armor, magazines and ammo boxes, sliding, vaulting, the Deadline and a full round of 10 bots ending in one winner. The sim has no tests for rendering, input, audio or React.

---

## 5. Rendering (`src/game/render`)

Everything is three.js with no game engine. The scene is built once in `startMatch()` and then updated each frame.

### 5.1 `game.ts`: the glue

- **Setup** (`:129`): renderer (pixel ratio capped at 2, soft shadows, ACES tone mapping), fog, one hemisphere light, one shadow-casting sun that follows the camera focus, the world, the zone wall, the drone plane, a cloud layer, 10 character rigs, health bars, pooled bullet meshes.
- **Input** (`:400`): keyboard in a `Set` of key codes. W A S D or arrows move; Space shoots (and jumps from the drone); Q super; E pick up or use; R reload; T toggles auto or mouse aim; M mutes. Auto-aim picks the nearest visible enemy within `AUTO_AIM_RANGE` (22 m) in line of sight (`autoAim`, `:443`); with none, you aim along the way you last moved. Mouse aim casts a ray from the camera onto a plane at chest height.
- **Camera** (`:~890`). Three modes, blended with a frame-rate independent damping `1 - exp(-k * dt)`: on the drone, high above looking over the map with a wider lens (so you pick where to jump); falling, close above and behind the jumper; on the ground, 36 m up and 22 m back. Camera shake is `trauma^2` (a value from 0 to 1 that hits raise and time drains at 1.5 per second), applied as smooth noise offsets.
- **Events to effects** (`handle`, `:486`): muzzle flash and a casing on `shot`, sparks on `hit`, dust on `impact`, fire on `explosion`, and so on, plus sound and shake.
- **Damage numbers** (`popDamage`, `:619`): a pool of text sprites drawn from a canvas. Only hits you deal or take get a number. Hits on the same target within 0.35 s are added into one number, so an SMG burst reads as one growing figure; the colour says dealt, taken, armor or KO.
- **Footsteps** (`:~810`): the walk cycle phase `rig.phase` advances with speed; each time it crosses a multiple of pi a foot has landed, and `sfx.footstep` plays with the surface under the player (`surfaceAt`: grass, hard, wood, dirt or leaves), panned from world x and quieter with distance (silent beyond 28 m).
- **Drop animation**: free fall uses a head-first pose, then a parachute mesh; the height is interpolated between ticks like x and y so the fall is smooth at any frame rate.
- **Minimap**: the static map is drawn once to an off-screen canvas, then each 0.1 s the current and next circle and the visible players are drawn on top.

### 5.2 Characters and two-bone IK (`characters.ts`)

Fighters are low-poly models built from boxes and spheres in code (`buildRig`); each has a different silhouette. They are made of named groups: body, head, two legs, and for each arm an upper arm and a forearm.

`poseTopDown` (`:490`) animates them with no animation files:

- **Legs** swing with `sin(phase)`. The phase advances with the real speed and runs backward when moving away from the facing direction, so strafing steps sideways and back-pedalling plays the cycle in reverse. Leg angles come from velocity relative to facing (`fwd`, `side`).
- **Body** leans into speed, banks into turns (from the yaw rate) and breathes when still. The yaw itself follows the sim heading on a critically damped spring (`game.ts:783`), so turns start and stop smoothly.
- **Arms, two-bone IK** (`reach`, `:450`). To make both hands land on a gun, the code solves a two-link arm: given the shoulder, the target hand position and the arm length, the elbow sits on a triangle between them, bent down and outward (a "pole" direction), and each bone's quaternion is set with `setFromUnitVectors`. The right hand targets the grip, the left hand the fore-end (or cups the pistol grip) using per-gun offsets in `HOLD`. If the target is out of reach the arm straightens toward it.
- **Recoil**: each shot kicks the gun back for 0.12 s (`sinceShot`).

### 5.3 `nature.ts`: terrain, grass, trees, wind

Nothing is a texture file.

- **Terrain**: `paintTerrain` draws a 1024 x 1024 canvas (8 px per metre) once. Each pixel mixes two meadow greens over large noise patches (`fbm`, fractal value noise) with dry spots and grain. Dirt, asphalt, soil, gravel and floorboards are per-tile weight grids sampled bilinearly with noise-wobbled edges, which is why the transitions are soft. Cost: it runs at start-up (a million pixels).
- **Instancing**: trees (broadleaf, birch, conifer variants made from displaced blobs), bushes, rocks and grass tufts are `InstancedMesh`: one draw call per kind, thousands of copies. Beyond the map edge, `outerForest` adds 1400 trees so the world does not end on a flat plane.
- **Wind** (`windy`, `:173`): the standard three.js material is patched with `onBeforeCompile` to add a vertex-shader sway. Displacement grows with height above a pivot and uses a per-instance phase from its position and a slow "gust" term, all driven by one shared uniform `uTime`.
- **Parting grass**: the same shader reads `uPeople`, up to 10 positions (`setPeople`), and bends nearby blades away, more at the tips.
- **Canopy cut-out**: for leaves, the fragment shader discards pixels above 2.2 m within `uFade` (4.5 m, set by `world.update`) of the player, using a 4 x 4 Bayer dither so the hole has a stippled edge. Trees never hide your fighter.

### 5.4 `roads.ts`

Roads are geometry, not texture. `ROUTES` points go through a Catmull-Rom curve, are re-sampled every few decimetres with normals, and become triangle strips: asphalt with edge lines and a dashed centre line, dirt paths with soft vertex alpha edges. They stay sharp at any zoom. `routeDistance(x, y)` (signed distance to the nearest route) lets the grass generator keep roads and paths clear.

### 5.5 `furniture.ts`, `guns.ts`, `world.ts`

- **Furniture**: each kind (house and barn pieces) is one merged geometry with vertex colours, drawn as one `InstancedMesh`. Every `u` tile gets a kind chosen from `tileHash` and faces away from the nearest wall.
- **Guns**: built from boxes and cylinders; each points along +z with the grip at the origin so it fits the hand anchor on the rig. Sizes are about 1.3 times life so they read from the high camera.
- **`world.ts`** assembles the scene. Houses, fences, crops, flowers and crates come from CC0 Kenney models in `public/assets/models` (see `ASSETS.md`), instanced; the barns, trees, grass and terrain are code. `update()` each frame fades the exterior of the building you are standing in (opacity eased by 0.2 per frame) and shrinks its walls to waist height, so the room reads from above; it swaps broken crates for nothing, and updates the nature shader uniforms.

---

## 6. Audio (`src/game/sfx.ts`)

Created with `createSfx()` and driven by events; the sim does not know about it.

- **Unlock.** Browsers refuse audio until a user gesture, so the `AudioContext` is created lazily by `unlock()`, called on keydown and mousedown (`game.ts:431`, `:412`). Sounds asked for before that are skipped.
- **Graph.** voices -> panner (stereo from world x, `x / 19.5` clamped to plus or minus 0.8) -> a bus -> `DynamicsCompressor` -> master gain -> speakers. A copy of each voice also goes to a generated 0.9 s room reverb.
- **Buses and defaults** (`sfx.ts:18-22`, `:106`):

| Control | Default | Kind |
|---|---|---|
| Master ("All sound") | 0.8, times a fixed 0.75 | master gain |
| `guns` bus ("Gunshots") | 0.6 | bus gain |
| Footsteps ("Footsteps") | 0.8 | multiplier inside `footstep` |
| `sfx` / `ui` / `amb` buses | 1.0 / 0.7 / 0.5 | fixed |

- **Volume sliders**: `Match.tsx` shows three sliders in the Esc Esc menu; `setVolume` applies at once and saves `{master, guns, steps}` as JSON in `localStorage` under `lcs:volume` (reads and writes are in try/catch). M mutes (key `merge-conflict:muted`).
- **Gunshots** are recordings (`public/assets/sounds/*.m4a`, fetched and decoded when the context starts), played on the `guns` bus at `GUN_LEVEL` 0.4 scaled by distance. Until the files decode, the code falls back to a synthesised crack, body and thump. Footsteps, hits, explosions, vaults and UI sounds are always synthesised from oscillators and filtered noise. A budget of 5 gunshot voices stops rapid fire from clipping.
- **Surfaces**: footsteps differ for grass (soft brush), dirt, hard floor and asphalt (click and heel), wood (a hollow thud) and plants (rustle).

---

## 7. UI (`src/components`)

| Component | Job |
|---|---|
| `Lobby` | Pick a fighter (saved to `localStorage` key `lcs:fighter`) and start a match. Remounting `Match` with a new `key` is how "play again" works. |
| `Match` | Creates the canvas and the minimap canvas, calls `startMatch` in an effect, shows the HUD from `HudState`, the Esc Esc menu (aim choice, sound sliders, resume, exit) and the end screen with placement. Disposes the game on unmount. |
| `AimChoice` | Auto-aim or mouse aim; stored in `lcs:aim` and also toggled by T. |

React only draws the HUD. It reads the 10 Hz `HudState` snapshot and calls a few methods returned by `startMatch` (`setPaused`, `setVolume`, `setAimMode`, `dispose`); it does not touch the simulation. Esc pressed twice within 450 ms opens the menu and pauses (this is offline, so pausing is fair).

---

## 8. Where to change what

| I want to change... | Edit |
|---|---|
| Gun damage, magazine, range | `WEAPONS` in `constants.ts` |
| What the loot is worth | `LOOT_TABLE` (more copies of a name = more common) |
| Fighter HP, speed, super cost | `FIGHTERS`; super numbers in `SUPERS` |
| How fast the zone closes | `ZONE_PHASES` |
| Drop timing | `DROP` |
| How the map looks (layout) | `buildMap()` and its seeds; run the tests after, they check doors and room reachability |
| Run speed feel | `MOVE`; slide and vault in `step.ts` |
| Bot behaviour | `bot.ts` (`PREFERRED`, `think`) |
| Default volumes | `DEFAULT_VOLUMES` in `sfx.ts` |

Changing anything under `sim/` changes the rules for everyone; run `npm run test:run`.

---

## 9. Known gaps (read from the code, not guessed)

- **`docs/DESIGN.md` is out of date against the code.** It describes a 64 x 64 m "campus" with racks and water coolers; the code builds a 128 x 128 m countryside (64 x 64 tiles of 2 m) with houses, farms, a forest and a quarry. It also lists no rifle, sniper, rockets or magazines. `README.md` says the game is offline against 9 bots, which matches the code. Not changed here.
- **The `sfx.ts` header comment is stale**: it says "no audio files", but gunshots are recorded samples (section 6, `ASSETS.md`).
- **No networking**: no server, no room code, no prediction. The sim is built to allow it.
- **Tests** cover only `sim`. Rendering, input, audio and the React shell have none.
- **No path-finding** for bots (detours only).
- **`window.__lcs` and `?cam=near`** exist only in development builds.
- **Not run for this guide**: a production build (`npm run build`) and an in-browser play-through.
