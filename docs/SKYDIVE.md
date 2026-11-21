# The skydive and the parachute

Owner's spec: `~/.agents-know/personal/feedback4/spec-lcs-skydive.md`. Constraints: original look (no copied assets or
animations), the browser perf budget (`?perf`), and the deterministic fixed-timestep sim (physics in `src/game/sim`,
visuals in `src/game/render`). Bots and the player use the same drop.

## What was there (portal-build, Nov 2026)

- **Sim** (`step.ts` `updateDrop`): the drop was a timer. `p.fall` counted down 8.2 s; height was a straight line of it
  (`fallHeight`: 75 m to 30 m in 3.2 s of free fall, then 30 m to 1 m in 5 s under the canopy). Horizontal speed snapped
  to the input (14 m/s free fall, 7 m/s canopy): no gravity, drag, momentum or opening force. Free fall heading snapped
  to the input direction.
- **Rig** (`characters.ts`): skinned primitive fighters with two-bone arms and legs and a `reach` IK. `poseFreefall` set
  one fixed spread pose with a single sine flutter (an obvious loop); `poseChute` hung the body from a pendulum spring
  with hands on the risers. Poses were set, not blended, so freefall to canopy snapped.
- **Chute** (`chute.ts`): an 8-panel round dome with cylinder lines, glued to the body's tilt; "deployment" was the whole
  canopy scaling up from 8 % in 0.7 s. The canopy turned with the mouse aim (the rig yaw is the aim heading).
- **Camera** (`game.ts`): locked above and behind; an eased back-off when the canopy opened. No wind shake.
- **Sound**: a jump blip and a landing thump. No wind, no opening.
- **Kept**: the touchdown collapse (`releaseChute`, 0.7 s, no disc left behind), the snapshot format (players travel as
  their `newPlayer` keys, so new fields sync by themselves).

## Plan

### 1. Sim: a real fall (`step.ts`, `constants.ts`, `types.ts`)
- Replace the timer with state: `alt` (m above ground), `vz` (descent speed, m/s) and `canopy` (seconds since the
  canopy started to deploy, -1 before). `fallHeight`/`fall` go; `chestHeight` and the render read `alt`.
- Vertical: gravity minus quadratic drag, `dv/dt = g - k v^2`. Free fall terminal 20 m/s; the canopy deploys at 40 m
  (or earlier with Space after a second of free fall) and over 1.1 s its drag ramps (bag and line stretch, then
  inflation on a smoothstep) to a 5.5 m/s canopy, a ~2.5 g opening; a short flare near the ground. Tuned so the whole
  drop still takes ~8.2 s (match pacing unchanged).
- Horizontal: first-order momentum towards the steered velocity (fast response in free fall, slower and floatier under
  the canopy), the plane's forward speed carried out the door and bled off by drag, a gentle per-match wind derived from
  the route (no extra random draws) and a deterministic turbulence wobble.
- Bots steer with a critically damped target velocity so inertia does not make them overshoot their spot.
- Tests: terminal velocity, drag, deployment deceleration curve, steering inertia, determinism, total drop time.

### 2. Render: the body (`characters.ts`)
- One blend helper: every air pose slerps each joint towards its target, so plane exit, free fall, deployment, canopy
  and landing never snap.
- Free fall: an arched belly-to-earth posture, arms out with elbows bent ~90 degrees, knees bent, feet up. Wind adds
  layered non-repeating noise (incommensurate sines, seeded per player) per limb, scaled by airspeed. Steering tracks
  (legs extend, arms sweep back, head down) and banks (dip a shoulder). The first half-second tumbles out of the door
  from upright into the arch.
- Deployment: the right hand reaches back and pulls, then the line stretch swings the body from flat to upright (the
  opening shock drives the existing pendulum), legs kick forward, hands go up to the toggles.
- Canopy flight: hanging from the harness, legs dangle independently and lag the swing, the hands work the steering
  toggles (one pulls down into a turn, both flare before landing), the body twists into turns and faces the canopy, not
  the mouse, unless you are shooting.

### 3. Render: the canopy (`chute.ts`)
- An original ram-air canopy: a cell grid built once per jumper into one buffer geometry (two colours), with suspension
  lines as one `LineSegments` (one draw call) whose ends are recomputed each frame from the canopy and the body's
  shoulder straps, so they stay connected whatever the body does.
- Deployment stages, from `canopy` seconds: the bag leaves the pack, lines pay out to full stretch with the fabric as a
  streamer, the cells inflate from the middle out with flutter dying as it pressurises, a small overshoot, then flying.
- The canopy has its own orientation spring (yaw follows the direction of travel, bank into turns, pitch oscillation);
  turns pull the inside trailing edge down and twist the span. Breathing and a light flutter while flying.
- LOD: canopies far from the camera update their shape at a lower rate.

### 4. Camera, sound, atmosphere (`game.ts`, `sfx.ts`)
- Free fall: a trailing spring follow, a small speed-scaled wind shake (off with reduced motion), FOV opening with speed.
- Deployment: the camera carries on a moment as the canopy bites (you rise in the frame), a small FOV kick, then eases
  into the canopy framing. Canopy: stable eased follow.
- Sound: a filtered, gusting wind loop scaled by airspeed (low-passed, not hiss), the deployment rustle and the
  opening crack and whump, a softer wind under the canopy.
- Wind streaks past the camera in free fall (one `LineSegments`).

### 5. Checks
Sim unit tests; bot-sim 40 matches before/after; `?perf` draw calls, triangles and frame cost in free fall, deployment
and canopy, before/after; Playwright frame sequences (desktop and phone, default and close camera), contact sheets and
mp4 in `~/.agents-know/personal/feedback4/shots/lcs-skydive-*`.

## Results (Nov 2026)

Implemented as planned. Numbers:

- **Drop physics** (`src/game/sim/drop.test.ts`): door to ground 8.15 s with the automatic pull (was 8.2 s); free fall to
  the pull at 40 m in ~3.1 s at up to 20 m/s; the opening peaks at ~2.5 g inside the inflation with no tick-to-tick
  jerk; the canopy flies at 5.7 m/s and flares to ~3.5 m/s at touchdown. Same inputs give the same drop to the bit.
- **bot-sim, 40 matches, seeds 1-40**: match length median 3:50 -> 3:49 (avg 242.4 -> 240.0 s), dead air 15.8 % -> 15.5 %,
  Deadline starts 24.6 -> 24.5 s after Play, bots in distinct buildings 19/19 both. Within noise.
- **`?perf`** (M-series Mac, Playwright Chromium, machine under load, 20 jumpers, 3 runs): draw calls in the air
  168-229 before, 190-219 after (desktop); triangles 0.29-0.49M before, 0.40-0.53M after (the closer free-fall camera and
  the canopy camera see a little more); GPU-synced render 4-6 ms before, 4.8-8 ms after (desktop), 3.2-4.5 ms before,
  3.5-5.4 ms after (phone viewport). Inside the render-perf pass envelope (<= 242 calls, 0.3-0.7M triangles, ~8 ms).
- Frames, contact sheets and mp4s: `~/.agents-know/personal/feedback4/shots/lcs-skydive-*`.

Not done: the canopy has no cloth simulation (its deformation is procedural), lines are 1-pixel GL lines, and the
landing still uses the existing forward roll.

## Feedback 5: a longer, steerable canopy (Nov 2026)

Reis: descent a little too quick; more time floating; smoother, more natural steering with momentum; choose a landing
spot and spot the others before the ground; not slow or unresponsive; a sense of danger when landing.

- **Sink** (`constants.ts`): the canopy floats at 3.7 m/s (was 5.7) up to its steering speed, and the automatic pull
  moved from 40 m to 44 m, just under the clouds. Door to ground hands off: 8.15 s -> 11.6 s (`glide`), of which the
  canopy 5.07 s -> 8.7 s (1.7x). Free fall is unchanged apart from ending 4 m higher (3.1 s -> 2.85 s).
- **The canopy always flies**: hands off it glides on at 3 m/s the way it was going (it no longer stops dead in the air);
  steered it flies at up to 8 m/s (was 7) and follows the stick faster (response 1.1 -> 1.6 /s), so a 90 degree turn comes
  round in under a second without stalling. Opening a little longer (1.1 s -> 1.25 s) so the lower canopy sink keeps the
  opening shock near 3 g.
- **Dive** (`input.roll`: Shift, or the roll button, labelled Dive in the air): 14 m/s, sinking up to 5.6 m/s (the old
  canopy rate). Glide ratio about 2.2 steering, 2.5 diving, so the dive reaches farther and gets there sooner, at the cost
  of time in the air. The sink follows the airspeed (`chuteSink`), so it eases in and out with the momentum.
- **Reach**: about 100 m from the door steering in a straight line with the automatic pull, 111 m diving (was about
  68 m); pulling early and diving goes well past 150 m.
- **Bots** use the same rules: they steer at the same speeds and hold the dive when their spot is farther than a plain
  glide still reaches. They land closer to their planned spot than before (median 1.1 m -> 0.1 m).
- **Seeing the others** (`game.ts`): high under the canopy the camera backs off up to 30 % more, closing back to the
  normal canopy framing by 12 m up, so more open sky (and the canopies in it) is in view. Nothing reveals anyone you
  could not see yourself: no minimap dots, markers or arrows.
- **Landing danger**: someone landing within 30 m of you while you are in the air or in your first 8 s on the ground is
  heard, a thud and the canopy's rustle from their side, fading with distance (`sfx.landNear`). Sound only.
- **Look**: the canopy's yaw spring is quicker (2.4 -> 3.2 rad/s) and it banks harder into turns (up to 0.7 rad).
- A hint under the canopy: `Hold Shift · dive to go farther, faster`.
- **bot-sim, 40 matches, seeds 1-40, before -> after**: match length median 3:49 -> 3:55 (avg 240.0 -> 236.9 s), dead air
  15.5 % -> 14.7 %, Deadline starts 24.5 -> 27.9 s after Play (it starts when the last jumper lands, so it always
  follows the landings; the first wait is unchanged), bots in distinct buildings 19/19 both, first fight 40.2 -> 40.6 s
  after landing. Bots door to ground median 8.15 -> 11.6 s, canopy 5.07 -> 8.7 s.
- Frames and mp4s: `~/.agents-know/personal/feedback4/shots/lcs5-drop-*` (`lcs5-drop-compare.mp4` side by side).
