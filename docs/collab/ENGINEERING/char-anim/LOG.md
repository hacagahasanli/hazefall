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
