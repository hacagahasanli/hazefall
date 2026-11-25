# Character animation polish: LOG (branch anim-polish-1)

Brief: `reis-brief-2026-11-25.md` plus the later Shift-roll requirement. Only motion changed; no looks, colours or faces.

## Root causes
1. **Lean (Q/E).** `poseTopDown` put the lean on `rig.body`: `rotation.z += lean*0.55` and `position.x = -lean*0.38`. Every bone
   (legs, belt, torso, head, arms, gun) is a child of `body`, whose origin is at the feet, so the whole figure tipped like a
   plank, the feet slid 0.39 m sideways and rotated, and no knee, hip or pelvis moved.
2. **Feet and floor.** The body was lowered by a vertical approximation (`legDrop`) that ignored the body's own tilt and the
   leg's spread; the run showed ankles up to 0.22 m below the floor, crouched toes pitched into the ground. Breathing and gun
   kick moved the whole body, so standing feet floated and slid.
3. **Roll (Shift dodge and the parachute landing roll, one code path).** Body rotated a full turn about the *feet* with the
   legs bent and everything else straight: a rigid plank, no fold, gun arms left behind.

## What changed (all in `src/game/render/`)
- `legIk.ts` (new): analytic two-bone leg IK (`solveLeg`, `ankleOf`, `clampHip`) and an exact critically damped `spring`.
- `buildRig`: new `upper` group (torso, head, arms, gun; pivots about the hip centre, children keep their coordinates so
  every existing arm IK / pose is unchanged), `pelvis` group (belt, holster, pouches), and a `foot` joint per leg (the shoe
  is the same mesh at the same place). No geometry, colour or size changed.
- Lean: spring-smoothed lean (w=13, dt-exact). Spine tips 0.52 rad about the hips, pelvis tilts half that and shifts
  towards the lean, head counter-rolls 45%, rifle stays nearly level (same net cant as before). Both feet are solved by IK to
  the ankle positions the gait produced, so the pelvis shift bends the knees (lean side takes the weight) and nothing slides.
- Feet: levelled against the ground (blend: flat when slow, gait pitch when running), body lowered so the lowest ankle rests
  exactly on the floor.
- Idle: breathing and a tiny weight sway move the upper body only (weapon counter-rolled so aim is untouched, off in
  reducedMotion); gun kick moves the upper body, not the feet. Standing-turn shuffle now alternates feet.
- Roll (`poseRoll`): a pure function of progress k (same 0.5 s / 0.75 s, so gameplay timing is identical): fold in over the
  first 20% (chin to chest, spine rounded, thighs up and out past the chest, heels to the hips, gun held close with both hands),
  turn about the stomach with the pack and shoulder meeting the ground first, unfold over 74-96% into the ready stance. The
  lowest body point (head, torso and pack corners, hands, elbows, knees, feet) always rests on the floor: no clipping, no
  floating. Eases out of the run pose over the first 12%. reducedMotion: same fold, a forward dip of 0.8 rad, no somersault.
- Other poses (freefall, canopy, death, swim, ladder) call `neutralStance` so they are bit-for-bit unchanged.

## Numbers (harness, 60 fps, hotfix; before / after)
| scenario | foot drift while planted | lowest ankle (m) | hand-to-grip gap |
|---|---|---|---|
| lean L/R standing | 0.388 / 0.032* | -0.093 / 0.000 | 0 / 0 |
| lean while moving | n/a | -0.134 / 0.000 | 0 / 0 |
| run | n/a | -0.222 / 0.000 | 0 / 0 |
| crouch | n/a | -0.053 / 0.000 | 0 / 0 |
| roll | n/a | whole body -1.05 / -0.005 | 0.54 / 0 |
(*the 0.032 is the first-frame settle; the unit test measures <0.02 after settling and <0.005 over 6 s of idle.)
Full table: `/private/tmp/hazefall-anim/{before,after}/measures.json`.

## Captures (before = main 8a0810b, after = this branch; contact sheets, top row side view, bottom row back or front view)
`/private/tmp/hazefall-anim/before/*.png` and `/private/tmp/hazefall-anim/after/*.png`: idle, walk, run, back, strafe,
diagonal, leanL, leanR, leanMove, leanFlip, turnStand, turnMove, crouch, jump, roll, rollReduced, landRoll, reload.
Roll: `.../before/roll.png` vs `.../after/roll.png`. Rebuild with `npm run anim:sheet` then
`node scripts/char-anim/capture.mjs <out> 3208`.

## Tests
`npx vitest run`: 40 files, 455 tests pass; `tsc --noEmit` clean. New `legIk.test.ts` (12): IK hits any reachable target with
the knee forward, springs agree between 30 and 240 fps, lean keeps both feet planted (all 4 fighters, +-1), hips shift and
belt tilts less than the spine, no floor penetration, hands stay on the grip as well as at rest (6 guns x 4 fighters x
lean), 30 vs 120 fps final pose agrees, no snap when the lean flips, idle feet do not move, crouched feet are flat.

## Not verified / limits
- Not driven inside a full live round (the dev build loads too slowly under software GL to script a drop, lean and roll in
  time). The harness (`scripts/char-anim`) runs the game's real `poseTopDown` and rig through the sim's own smoothing.
  A manual look at Q/E, Shift and a parachute landing in a real round is still needed.
- One rigid torso mesh: the spine cannot truly bend (no split torso without touching looks). Lean is distributed over pelvis
  tilt, spine tip about the hips and head counter-roll. No shoulder-blade bones.
- Locomotion feet are not world-planted (the stride is velocity-synced as before); only stance, lean and turn are planted.
- Sim shoots from a lateral offset of 0.77 m at full lean (`LEAN.offset*0.7`); the new visual chest is about 0.40 m out
  (before: ~1.0 m), the head about 0.55 m. Decide whether to raise `LEAN_POSE.shift/spine` or lower `LEAN.offset`.
- The gun model during a dodge roll follows the hand (held close to the chest); during the landing roll game.ts hides it.

---

# 2026-11-25 — Aim and bullet line: the gun follows the crosshair, rounds leave the barrel straight into it

Reis's reports: (1) raising the aim (at a roof) does not raise the gun; (2) a round leaves the gun, swerves right and only
then flies straight; (3) "the aim point is too close". Same code on `main` (8a0810b) and this branch.

## Reproduction (before the fix; failing output in `/private/tmp/hazefall-aim/repro-before.txt`)
- Round start vs drawn rifle muzzle (hotfix, standing): sim start 0.61 m right, 1.10 m up; drawn muzzle 0.11 m right,
  1.29 m up. Gap 0.50 m (lean right: sim 1.36 m right vs muzzle 0.53 m, gap 0.83 m).
- Live round (dev portal build, scripted with `__lcs.director`): rounds start `right 0.605 / h 1.1` standing, `1.374`
  leaning right (`/private/tmp/hazefall-aim/before.log`); after the fix `0.148 / 1.36` and `0.514 / 1.21`, i.e. at the drawn
  muzzle the client sent (`0.142 / 1.37`, `0.525 / 1.21`), within the gun's recoil travel between two shots.
- Aim pitch fed to the gun for someone on the street aiming at a roof: 0 (needed ~0.43 rad).
- Leaning and aiming up (pitch 0.5): the barrel swung 0.26-0.29 rad sideways off the aim.

## Root causes
1. **Gun pitch**: `game.ts` computed `aimPitch = aimD > 1.5 && p.z > 0.5 ? atan2(1.1 - chestHeight, aimD) : 0`: only when
   the shooter stands on a roof, and only down at ground chest height. The crosshair's height (`aimH`) was never used, so on
   the street the gun never rose. Second fault: the poser added the pitch as `rotation.x` in the spine's frame; with the spine
   rolled by a lean, pitching about that tilted axis swung the barrel sideways.
2. **Bullet swerve**: since 73d2183 (2026-11-24 corner-shot fix) the sim fired from the *camera's* side line
   (`hitPoint + camSide`, 0.62 m right of the body, at chest height 1.1 m, + 0.6 m forward), while the gun is drawn 0.11 m right,
   ~1.3 m up. The renderer draws each tracer from the drawn muzzle and blends it into the sim's line over the first 6 m
   (`game.ts` projectile loop), so every round visibly slid ~0.5 m right (0.83 m leaning right) before running straight.
   Trigger: any over-the-shoulder shot. Contributing: `LEAN.offset` 1.1 (0.77 m at full lean) against a drawn lean of ~0.45 m.
3. **"Aim point too close"**: the crosshair point itself is right (ray from the camera, first hit up to 170 m, sky = 170 m out
   and the round keeps going). What read as a near aim point was the tracer reaching the crosshair line after ~6 m (the blend)
   and then flying along it. Fixed by 2.

## Fix
- Sim (`step.ts` `muzzleOf`, exported): rounds leave from the muzzle. A person's client sends its drawn muzzle
  (`Input.muzzle` = [right, up from feet, forward] in the body's facing); the sim holds it within `MUZZLE.reach` (1.25 m) of a
  modelled muzzle (`MUZZLE`: 0.11 m right of the leaned shoulder, chest + 0.2 m, 1.0 m out) and uses the shoulder if a wall
  stands between. Bots, first person and old clients get the modelled muzzle. The round then flies in a straight line from
  that point through the crosshair point (no extra 0.6 m step). Fists still reach from the body.
- `LEAN.offset` 1.1 -> 0.64 (0.45 m at full lean: drawn chest ~0.40, rifle muzzle ~0.45, head ~0.55). Same `hitPoint` for
  everyone (bots, remote players), so peeking stays symmetric; the shoulder camera and first-person eye move out with it.
- Gun (`characters.ts`): new `aimYaw`; the aim direction is built in the body's frame and carried into the spine's frame
  (body tip, lean roll, breath), then applied as the weapon's pitch/yaw. `game.ts` feeds pitch and yaw from the sim's muzzle
  to the aim point (`muzzleLine.ts` `gunAim`; aimH, else chest height over the point as the round flies).
- Wire: `[.., aimH, muzzle r, u, f]` (inputs up to 11 numbers; `camSide` retired); snapshots carry `prev.muzzle`.
- Sniper contrail starts at the shot's muzzle height and ends where the sim says.

## Tests (`npx vitest run`: 41 files, 462 tests pass; `tsc --noEmit` clean; `npm run build:web` ok)
- `render/muzzleLine.test.ts` (new): round start = drawn muzzle within 2 cm (4 fighters x 5 guns x lean L/0/R x crouch x aim
  up/level/down), the line passes the aim height at the aim point, drawn barrel within 4 deg of the aim point in all those
  cases, aiming at a roof raises the gun, a far-off client muzzle is clamped, bots ignore it, a muzzle inside a wall falls back
  to the shoulder, `LEAN.offset * 0.7` lies between the drawn chest and head lean for every fighter.
- `sim.test.ts` corner test rewritten (behaviour change, needs Reis's OK): before, a target the *camera* saw past a corner was
  hit while standing behind it; now the round leaves the muzzle, so leaning out (E) hits and standing behind the corner the wall
  takes it (standard third-person rule).
- `net.test.ts`: the muzzle and aimH survive the wire.

## Captures (live dev build, 1280x720, crops around the screen centre; magenta = screen centre)
`/private/tmp/hazefall-aim/before/sheet-zoom.png` vs `/private/tmp/hazefall-aim/after3/sheet-zoom.png`
(rows: level, lean right, aimed up; frames ~20/40/60 ms after the trigger). Raw frames in the same folders; script
`/private/tmp/hazefall-aim/capture.mjs <port> <outDir>` against `npx vite --config vite.portal.config.ts --port <port>`.

## Not fixed / follow-ups
- Rockets still leave from `hitPoint` + 0.8 m at launch height and fly at the camera pitch with gravity (own path).
- Bots' modelled muzzle height is chest + 0.2 m for every fighter; the drawn one ranges 0.8 m (Standup) to 1.4 m (Hotfix),
  so a bot tracer still blends (vertically) over its first 6 m.
- Jumping: the sim fires from ground-level chest, the drawn gun is in the air (pre-existing).
- Camera proposal (not changed): shoulder arm 3.2 m -> 3.6 m, side 0.62 -> 0.68 m, scoped arm 1.4 -> 1.8 m, if Reis meant the
  camera sits too close while aiming.

## 2026-11-25 (2) — Reis approved: honest crosshair (obstruction marker), farther shoulder camera, rocket + bot muzzles

- **Corner rule approved** (standing behind a corner the wall takes the shot; lean out with Q/E to hit).
- **Obstruction marker**: every frame `game.ts` traces your round's real line (sim `shotObstruction`: your muzzle
  (`muzzleOf`, with the drawn muzzle) to the crosshair's point, the same 0.4 m steps, slope and `solidStep` collision as a
  flying round). If the ground, a wall, a roof or a rock takes it more than 0.5 m short of the point, a small "blocked" ring
  (circle with a slash, white over a dark outline, 22 px, 1.25x with the large HUD; `render/aimBlock.ts`) sits on screen where
  it will hit, and the crosshair dims to 30% (`HudState.aimBlocked`). Lean out until the line clears and both go back. Your
  own aim only (over the shoulder and first person), alive on the ground with a gun up; not for rockets (they arc), bombs,
  heals, bots or spectators. Touch players use the high follow view with auto-aim (no crosshair), so it does not apply
  there. Static marker, nothing for reducedMotion to calm. The look is engineering's placeholder: Creative Director to review.
- **Shoulder camera** (`SHOULDER_CAM` in game.ts): arm 3.2 -> 3.6 m, side 0.62 -> 0.68 m, scoped arm 1.4 -> 1.8 m (scoped side
  0.45, pivot, fov unchanged). The arm's wall/roof/trunk march and the side-wall push are unchanged and read the new values;
  the crosshair ray starts where the arm ends. Live check behind a house corner: arm 3.60, no clipping.
- **Rockets** leave from the launcher's muzzle (`muzzleOf`, height included) with their own pitch and gravity arc as before.
- **Bots' muzzle** is modelled per fighter (height, crouch drop and push, lean left/right side shift and drop) and per gun
  (`MUZZLE` in constants.ts): within 8 cm of the drawn muzzle for every fighter x bullet gun x lean x crouch, 10 cm for the
  launcher (test), so their tracers no longer bend.

Tests: 465 pass (new: bots' model vs the drawn rig, obstruction standing vs leaning at a real corner, open ground / ground
hit, rocket start). tsc clean, `npm run build:web` ok; the preview on 127.0.0.1:3320 serves the new bundle.
Capture: `/private/tmp/hazefall-aim/block/sheet.png` and `zoom.png` (top/left standing: marker on the wall, dim crosshair;
bottom/right leaning with E: clear). Script `/private/tmp/hazefall-aim/capture-block.mjs <port> <outDir>`.

## 2026-11-25 (3) — The marker and the real round now share one code path

Reis: "in some places the crosshair shows clear, yet my shot hits the wall". New randomized test
(`sim/shotPreview.test.ts`): ~1330 shots per seed, from open tiles next to walls, window sills, trunks, rocks and props,
aimed like the shoulder camera (a ray from the lens through the crosshair, first solid hit), random gun, lean, crouch,
movement; compares the HUD's answer with what the fired round really does (stopped by something more than 0.5 m short).

| | agreement | blocked shots shown clear | clear shots shown blocked |
|---|---|---|---|
| afadb05 (same harness, seed 7) | 85.0% | 113 of 199 (57%) | 87 |
| now, seed 7 / 21 / 99 / 5 / 1234 | 95.9 / 95.0 / 95.7 / 96.1 / 96.8% | 0 in 6742 shots | 44-67 per seed (spread edge only) |

Root causes (measured with the harness):
1. **Different pose (suspect b)**: the trace used the player as drawn, but the sim fired after that tick's step: moved by
   up to 0.11 m, lean and crouch one step closer to the keys, body turned to the new aim. About a third of the false clears.
   Fix: a shot now fires from the pose the tick began with (`poseOf`, `planShot`), which is exactly the state the HUD traced.
2. **Spread (suspect e)**: the trace followed the centre line only; a random round off-centre clipped the corner. The rest of
   the false clears. Fix: the trace flies every bearing the shot can take (each shotgun pellet; for one round, 9 bearings
   across its spread) and marks if any is blocked. The 4-5% "shown blocked but this round got through" are these edges.
3. **Separate stepping (suspect c)**: the trace stepped 0.4 m from the muzzle with its own slope code; the round stepped
   speed*DT/steps and checks at its own points, so a corner clipped for less than a step could be hit by one and missed by
   the other. Fix: one shared `advanceBullet` (the real round's flight, people optional) and `newBullet` used by both; round
   sub-steps 0.4 -> 0.2 m, so a clipped corner is missed only for a sliver.
4. Suspects (a) and (d): the shoulder fallback is part of `muzzleOf`, which `planShot` uses for both, so (a) cannot differ.
   (d): the 0.5 m slack is kept (a crosshair on a wall must not read as blocked by that same wall); no false clear came
   from it in the runs. (f): crouch and lean come from the same tick-start pose for both.
`shotPreview(state, player, input)` (sim) plans with `planShot` and flies with `advanceBullet`; `shoot` uses `planShot`.
The HUD calls it with the next input as it will be sent (held lean/crouch, this frame's crosshair point and drawn muzzle).
The old `shotObstruction` is gone. Online, a client's state trails the host's, so it can still differ there by a tick.
Once, the muzzle-model bot test failed twice in a row (rockets lean 1: 0.23 m), then passed in 7 later runs with the same
code; not reproduced, cause unknown (the sim and rig have no random or clock input).
