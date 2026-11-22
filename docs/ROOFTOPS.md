# Rooftops: roofs you stand on, height-aware shooting and line of sight

Feedback 5 (Reis): land on a roof and stay there, jump and walk on it, drop off it, fight from it and against it, no
clipping into a house from above, no shooting through walls or roofs, and a seamless move from the air to the roof to
the ground.

## How houses worked before this change (inspection)

- **Map.** `constants.ts` builds an 88 x 88 string map of 2 m tiles. A house is a rectangle (`BUILDINGS`: tile x0, y0,
  w, h, model, barn) whose ring is wall `#` with two-tile doors (`.` on the ring) and windows `w`; the inside is floor
  `.` with loot `l`, crates `r` and furniture `u`. Nothing in the sim knew about a roof: a building was walls on a flat
  plane.
- **Height.** The sim was 2D. Only a jumper in the air had a height (`alt`); on the ground everyone was at 0. There was
  no jump on the ground (`Input.jump` is the drone/parachute key and is sent with the fire key).
- **Landing.** When `alt` reached 0, `updateDrop` moved you to `freeSpot`, the nearest spot that is not blocked. Over a
  house the nearest free spot is usually the floor inside, so a jumper who came down on a roof appeared indoors. That's
  the "enter it in a way that doesn't feel right" Reis described.
- **Collision.** `pushOut` and `circleBlocked` treat every obstacle as an infinitely tall 2D shape (walls, windows,
  fences, trunks, rocks, crates, furniture, rails).
- **Bullets.** A bullet has a height `h` that runs from the shooter's chest (1.1 m, or `alt + 1.1` under a canopy) to
  the chest of whoever the aim point is on (`aimedAt`, within 2.5 m). Walls, trunks, rocks, crates and props stopped it
  while `h < 3` (`solidAt` is 2D). Hitting a player ignored height. Rockets were already height-aware against players.
- **Line of sight.** `lineOfSight` was 2D (`solidAt` every 0.5 m); bots and the top-down auto-aim use it.
- **Render.** The top-down view dresses each house with a Kenney model scaled to the footprint (4 to 7 m tall, varied)
  and fades it out when you walk in. First person and the shoulder view draw the real 2.6 m walls and a generated gabled
  roof (`buildRoof`: eaves at 2.6 m, ridge on the long axis, rise `min(2.2, 0.32 x span)`, barns `min(3.2, 0.42 x span)`).
  The shoulder camera stops at 2D walls and at a 2.6 m ceiling when indoors.

## Decisions

1. **Pitched roofs with feet on the slope.** The roofs are drawn pitched, so the walkable surface follows the same gable
   `buildRoof` draws: `roofAt(x, y)` is the eave height rising linearly to the ridge across the short side. Shoulder and
   first-person views already draw exactly this shape, so feet sit on the tiles. In the top-down view each Kenney model
   is scaled vertically so its top meets the same ridge height (the houses keep their footprint and look; their height
   becomes the sim's roof). I picked a slope over a flat top because a flat top would mean redrawing every roof, and
   because the slope is an honest elevation: the ridge is the highest point, and the far slope gives cover.
2. **Two layers per house.** A house's footprint has a floor layer (0 m, walls around it, entered through doors) and a
   roof layer (feet above about 1.5 m: the roof surface). You can only reach the roof layer from above (landing, a
   ladder). Walls and the ceiling separate the layers, so you can't clip from one into the other.
3. **Feet height on the ground.** `Player.z` (feet above the ground) and `Player.jz` (vertical speed). Gravity 18 m/s²,
   jump 5 m/s (about a 0.7 m hop, not enough to reach a 2.6 m eave or clear a fence). Walking keeps your feet on the
   surface (up and down the slope). Walking off the edge drops you with gravity to the ground or to another surface. A
   drop of more than 1 m plays the landing dust and sound. No fall damage (a roof is under 5 m).
4. **Obstacles have tops.** Each obstacle gets a height (walls and windows 2.6 m, props 2.6 m, trunks always,
   rocks 1.3 m, crates 1.3 m, fences and rails 1.1 m, furniture 0.9 m). You collide with one only while your feet are
   below its top. On the ground nothing changes (a hop is lower than any of them). On a roof the walls beneath you don't
   stop you.
5. **Landing.** A jumper over a footprint lands on its roof at `roofAt` (it's checked against the surface, not 0). A
   jumper who comes in from the side under the eave lands on the nearest open spot outside the house, never inside.
6. **3D solids for bullets and sight.** `solidAt3(x, y, h)`: obstacles below their bullet tops, window sills below
   0.9 m, and the roof slab (from the 2.45 m ceiling up to the roof surface) over the whole footprint. A step that
   crosses the slab between samples counts as blocked too. Bullets, rockets, `lineOfSight` (now with heights), bots,
   auto-aim and the sniper contrail all use it. So walls and roofs block both ways, doors and windows let shots through,
   and someone on a roof can only hit people inside through an opening they can see from where they stand (in practice
   another house's door or window, since the roof under you covers the room below). I added no roof holes.
7. **Hits are 3D.** A bullet hits a body only at a height between the feet and the top of the head. A shot that isn't
   aimed at anyone runs from your chest to chest height over the aim point, so from a roof you shoot down at what you
   point at, and from the ground, aiming at someone on a roof climbs to their chest. Explosions measure the height
   difference and don't pass through a roof slab.
8. **Roof access: a ladder on each house.** One wall tile per house (picked once per map from tile hashes, never a door,
   window or corner, with open ground outside) carries a ladder. Push into it, as you'd push into a window to vault, and
   you climb onto the roof in about a second. You get down by walking off the edge. Ladders were the cheapest clean
   option: one list, one climb state that reuses the vault fields, and one instanced mesh.
9. **Bots.** A bot's landing spot moves from the middle of the house to just outside its nearest door, so bots still
   land, walk in and loot (they don't land on roofs and get stuck). A bot that finds itself on a roof (bumped off
   course, chasing) stays while it's fighting someone it can see. Otherwise it walks off the nearest edge towards where
   it wants to go. Bots don't climb ladders.
10. **Jump key.** A new `jump` action (default B, rebindable; touch gets a JUMP button). In the air the jump key also
    pulls the canopy, like the fire key does today.
11. **Camera.** Shoulder view: the arm stops at 3D solids (walls, roof slabs), and above a roof it stays above the
    surface. Top-down: a house fades out only when you're inside it, not when you stand on its roof. First person: the
    eyes ride on `z`.

## Plan (slices)

1. `sim/roofs.ts`: footprint lookup, `roofAt`, `supportAt`, ladders, `solidAt3`, `roofBetween`, plus unit tests.
2. `step.ts`: `z`/`jz`/`climb`, collision with tops, jump/walk-off/land, roof landing, ladders, 3D bullets, LOS,
   explosions, loot dropped on a roof stays on the roof.
3. Bots: doorstep landings, leaving roofs, 3D LOS.
4. Input: the jump action and the touch button.
5. Render: bodies, loot and impacts at their height, top-down house heights, ladders, the camera, and aiming at elevated
   people.
6. Tests (roof landing on every building, jump and walk-off, no fall-through, LOS through roofs, walls and doors,
   determinism), bot-sim before/after, frames `lcs5-roofs-*`.

## Results

- **What I built.** All of the above. Also: flat-roofed models (house_type19/20) get a flat walkable roof at the eaves in
  every view. Barns are drawn with 2.6 m walls to match their walkable roof. A loot beam indoors stops under the
  ceiling. Bodies, loot, impacts, explosions and health bars sit at their real height. Top-down mouse aim snaps to
  someone up on a roof under the cursor. First person aims at whoever is under the crosshair, in 3D. At eye level a
  health bar only shows for someone you have a clear line to. Dropping off an edge plays a `thud` event (dust and the
  landing sound), not a parachute `land`.
- **Edge cases fixed along the way.** A house is solid from the outside whenever your feet are off the ground (above
  0.8 m), doorways included. So you can't fall back into a roof from below, or float in through a door after walking
  off the eave. You only come down onto a roof from above it.
- **Tests.** `src/game/sim/roofs.test.ts` (16 tests):
  - roof geometry on every building, and ladders;
  - a parachute landing on every house stays on the roof; drifting into a wall lands you outside;
  - walking all over a roof never drops you inside; jumping on a roof; walking off the edge; a hop stays low;
  - climbing a ladder;
  - line of sight through a roof (both ways), through a wall, and through a doorway;
  - shots from a roof into the room below (blocked), through a doorway (hit), and roof to ground and back (hit);
  - cover; loot dropped on a roof stays on it;
  - two identical runs of a match give the same result; no bot stays on a roof for more than 20 s.

  The full suite passes (193 tests).
- **bot-sim (20 matches, seed 1), before and after.**
  - Match length from Play: median 3:43 before, 4:17 after. Average 4:00 before, 4:06 after.
  - p90: 5:15 before, 4:44 after.
  - Dead air after the first ground minute: 13.2% before, 17.1% after.
  - First fight after landing: 40.4 s before, 40.5 s after.
  - Bots landing in distinct buildings: 19.0 before, 16.7 after. Bots now land on the doorstep, so two bots picking
    the same house share a door, and a doorstep can count towards a neighbouring house.

  Walls, roofs and the 3D line of sight now block shots that used to go through, and bombs that land on a roof don't
  hurt the people inside. That plausibly explains the slightly longer median and the extra dead air.
- **Frames.** `~/.agents-know/personal/feedback4/shots/lcs5-roofs-*`: landing before and after, top-down and over the
  shoulder; rooftop fight, top-down and over the shoulder; a shot through a doorway; cover; the camera indoors; and
  town overviews before and after.
