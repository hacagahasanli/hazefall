# Canopy feel: legs, turns, swing (R-002)

Status: ready for implementation. Owner: Creative Director. Date: 2026-11-21.
Scope: render only (`src/game/render/chute.ts` `moveChute`, `src/game/render/characters.ts` `poseChute`/`airBody`,
camera block in `src/game/render/game.ts`). The sim (`src/game/sim/step.ts`), its determinism and the total drop time
must not change. Note: `docs/SKYDIVE.md` Feedback 5 says door to ground is now ~11.6 s (canopy ~8.7 s), not the 8.2 s
quoted in R-002; whichever is current stays as it is. Nothing in this spec touches timing.

## 1. Objective

Under the canopy the jumper should look like a relaxed person sitting in a harness, flying a wing that turns firmly and
settles: alive legs, readable turns, no near-flips. Calm and controlled is the target, because the canopy is where the
player scouts a landing spot and the others in the sky. It is not a stunt phase.

## 2. Current problem (from the code, 2026-11-21)

Measured from the constants, not from a capture (I did not run the game in this pass):

1. **Turns overshoot twice.** Canopy bank target `clamp(yawV*0.55, ±0.70 rad)` (40°) on a bank spring with damping
   ratio 0.5 (~16 % overshoot, so ~46° peak). The body then follows `bank*0.85` on its own spring with damping ratio
   0.28 (~40 % overshoot): the body can reach ~50-55° roll and swing back past level. Two under-damped springs in series
   read as rubber, which is what Reis called "elastic, almost flips over".
2. **Reversals spike.** When the stick reverses, the sim velocity passes near zero and its heading flips 180° in one
   tick. The canopy yaw spring sees an error of ~π, `yawV` spikes and the bank pins at the 40° clamp.
3. **Legs hang straight.** Hip flex ~6° (`legX ≈ -0.1`), knees 13-16° (`shinX 0.22-0.28`) with ±8° noise. From the game
   camera that is a straight vertical line. Real jumpers sit in their leg straps.

## 3. Reference behaviour (general domain knowledge, not re-verified online in this pass)

- Ram-air and paraglider pilots hang 4-8 m under the wing; the body is a pendulum under it. Gentle and medium turns sit
  at roughly 15-30° of bank; 45° and beyond is spiral-dive territory, an advanced and deliberate manoeuvre.
- In a turn the pilot swings out and leans into it with a short lag behind the wing, then settles. A well-flown turn
  has no visible rebound swing.
- Skydivers under canopy sit in the leg straps: hips flexed, knees softly bent, feet hanging below the knees, legs a
  little apart. They shift weight in turns (inside knee comes up), and before landing bring feet and knees together,
  knees slightly bent, feet a little forward, ready to absorb.
- Paragliding harnesses are seated (hips ~90°). That is a different silhouette and must not be copied. We use the
  skydiver's light sit.

Our interpretation: the real pendulum period for our 4.6 m lines is ~4.3 s, too slow and floaty for a game. We use a
stylised ~2.1 s pendulum with heavy damping so it reads as weight without wobble.

## 4. Target numbers

Angles: rad (deg). Rig conventions as in the current code: `legX` negative = thigh forward (hip flexion), `shinX`
positive = knee bend. Engineering: confirm signs in `showcase.ts` before tuning.

### 4.1 Canopy heading (yaw spring, `moveChute`)

| Parameter | Now | Target |
|---|---|---|
| Heading error fed to the spring | unclamped (up to π) | clamp to ±1.0 (57°) |
| Yaw rate `yawV` | unclamped | clamp to ±1.6 rad/s (90° in ~1 s at full input, matching the sim) |
| Yaw spring ω / damping ratio | 3.2 / 0.78 | 3.2 / 0.90 |
| Lag of canopy heading behind velocity heading in a steady full turn | not specified | ≤ 20° |

On a reversal the canopy turns through one side (the side `yawV` already has; if zero, the side the error points to)
as one continuous turn. It never snaps or flips heading.

### 4.2 Canopy bank

| Parameter | Now | Target |
|---|---|---|
| Bank target | `clamp(yawV*0.55, ±0.70)` | `maxBank * tanh(yawV / 1.0)` (smooth saturation, no clip kink) |
| maxBank, steering | 0.70 (40°) | **0.38 (22°)** |
| maxBank, diving (Shift) | same | 0.45 (26°), blended by airspeed between `chuteSpeed` and `chuteDiveSpeed` |
| Bank spring ω / damping ratio | 5 / 0.5 | 4.0 / 0.85 |
| Rise time 10 → 90 % of target | n/a | ≤ 0.55 s |
| Overshoot | ~16 % | ≤ 3 % |
| Back to within ±1° of level after the stick is released | n/a | ≤ 1.0 s |
| Nose in a turn (pitch) | none | dips forward by `0.06 * |turn|` (≤ 3.5°): turning costs height, as on real canopies |

The opening surge and the slow pitch rock stay as they are.

### 4.3 Body swing under the canopy (`airBody` while flying)

| Parameter | Now | Target |
|---|---|---|
| Body roll target | `bank * 0.85` | `bank * 0.80` (max 18° steering, ~21° diving) |
| Hard ceiling, body roll (world) | none | never more than canopy bank + 4°, never beyond 25° |
| Swing spring ω / damping ratio (flying) | 3.6 / 0.28 | **3.0 / 0.60** (period ~2.1 s) |
| Overshoot after a turn ends | ~40 % | ≤ 10 %, one soft swing; the second peak is < 1.5° (invisible) |
| Settle to within ±2° | n/a | ≤ 1.7 s after the canopy levels |
| Body roll peak lags canopy bank peak by | n/a | 0.15-0.30 s (weight hanging under the wing) |
| Body yaw into the turn | `turn * 0.18` | keep, ≤ 10° |
| Head yaw into the turn | `turn * 0.45`, rate 5 | ≤ 25°, rate 7: the head leads the body by ~0.1 s (look, then turn) |
| Wind gust on roll/pitch | ±0.03 | keep |

**Opening is the exception.** For the first 2.5 s after `deployTime` the swing damping ratio blends from 0.30 to 0.60.
The opening keeps its lively forward-back swing (body pitch ≤ 35°, at most two visible swings, settled by 3 s).
Turns get the damped spring.

Silhouette check at the peak of a full-input turn: the line from the harness to the middle of the canopy tilts ≤ 22°
from vertical, and the feet sit ≤ 0.45 m to the side of the point below the harness.

### 4.4 Legs

Base pose, flying hands off. Asymmetric on purpose: mirrored legs read as a mannequin.

| Joint | Left | Right |
|---|---|---|
| Hip flexion (`legX`) | -0.42 (24°) | -0.58 (33°) |
| Hip spread (`legZ`) | -0.10 | +0.10 (knees about hip-width apart, feet ~0.25-0.35 m apart) |
| Knee bend (`shinX`) | 0.62 (36°) | 0.85 (49°) |

Life. Every term is additive on the base and clamped by the limits below.

| Driver | Effect | Amount |
|---|---|---|
| Idle noise (existing `gust`, own seed per joint) | hip flexion | ±0.08, k ≈ 0.4-0.6 |
| | knee bend | ±0.12, k ≈ 0.7-0.9 (L and R on different seeds and rates, never in phase) |
| Forward/back swing (body pitch velocity) | legs trail the swing: body swings forward, feet go back | hip ±0.30 at peak swing speed, lag 0.12-0.20 s (joint rate ~5/s) |
| | knees open when the legs are thrown back, fold when they swing forward | knee -0.20 / +0.30 |
| Turn (`turn`, -1..1) | weight shift: inside knee comes up | inside hip -0.20, inside knee +0.35 |
| | outside leg reaches a little | outside knee -0.15 |
| | both feet drift to the outside of the turn (centrifugal) | hip spread +0.12 towards the outside, both legs |
| Dive (Shift) | legs stream back and together | blend over 0.4 s to hip -0.15, knee 0.35, spread ±0.03 |
| Leg-strap shuffle (optional, P2) | every 4-7 s (deterministic from seed and time) one leg | knee +0.35 and back over 0.6 s, ease in-out |

Flare and landing. The flare blend starts at `flareAlt + 2` m (4.5 m), as now, eased out over ~0.6 s.

| Joint | Flare target (both legs) |
|---|---|
| Hip flexion | -0.75 (43°): feet a little forward |
| Hip spread | ±0.03: feet and knees together |
| Knee bend | 0.55 (31°): ready to absorb |
| Idle noise | fades to 20 % |

At touchdown the knees compress from 0.55 to ~1.1 within the first 0.15 s, handing into the existing landing roll with
no pop.

Limits. These hold at all times under the canopy:
- Knee 0.15-1.30. The knee never reaches straight and never bends backwards.
- Hip flexion -0.95 to +0.15. The thigh never goes visibly behind the body except in the dive's stream-back.
- The feet never cross the body's midline or pass through each other (minimum foot gap 0.12 m).
- Any leg joint turns at most 4 rad/s outside the opening kick and touchdown, so nothing snaps.

From the default canopy camera the jumper is small, so the legs must read as a bent "sit" silhouette (thigh and shin
visibly at an angle) on a phone screen. That is why the knees sit at 36-49°, slightly more than a real relaxed hang.

### 4.5 Camera under the canopy

- The camera never rolls and never inherits the canopy's bank or the body's swing. The horizon stays level, so the
  swing reads against a steady frame. The current eased follow from the sim position already does this; keep it.
- No shake under the canopy (the buffet already fades with `chuteCam`; keep it that way).
- P2, optional: lead the look point along the velocity by `0.2 s * v`, capped at 1.5 m and eased at 2/s, so a turn
  shows where you are heading. Skip it if it fights the "high back-off" framing on phones.

### 4.6 Reduced motion

Swing damping ratio 0.8 (no visible overshoot), idle leg noise and shuffle at 50 %, and the opening swing at most one
swing.

## 5. What must not change

- The sim: velocities, steering response, sink, timings, determinism. All of this is render-side.
- Toggle hand motion (the inside toggle comes down in a turn, both for the flare), the lines-stay-connected guarantee,
  the canopy shape and deployment stages, the opening surge.
- The look: the original ram-air canopy and the low-poly rig. No new assets.
- Bots and the player use the same pose code.
- The perf budget. These are constant changes plus a few extra terms per leg: no new draw calls.

## 6. Avoid

- Two under-damped springs in series (canopy and body) with low damping. Only the opening may ring.
- Any bank or roll beyond 26° outside a dive, or a hard clamp you can see as a sudden stop. Use tanh.
- Straight legs, mirrored legs, legs in phase with each other, or a leg loop with a visible period under 3 s.
- Copying a paraglider's seated harness pose or any specific game's canopy animation.
- Camera roll, camera shake or FOV pumping under the canopy.

## 7. Acceptance criteria

Engineering can check the numbers in a unit test on `moveChute` plus the swing spring (extend `chute.test.ts`), driving
the canopy with the velocity the sim produces at 60 Hz and at 30 Hz:

1. Full-input 90° turn at `chuteSpeed`: peak canopy bank between 18° and 22°, overshoot ≤ 3 %, peak body roll ≤ 19°,
   body settled to ±2° within 1.7 s of the canopy levelling.
2. Full 180° stick reversal: `|yawV|` ≤ 1.6 rad/s throughout, canopy bank ≤ 22°, one continuous turn with no heading
   snap; the same at 30 Hz.
3. Diving full turn: peak bank ≤ 26°.
4. Release after a held turn: canopy within ±1° of level by 1.0 s, no second visible body swing (second peak < 1.5°).
5. Legs: in a hands-off glide, both knees stay in 0.45-1.05 and hips in -0.25 to -0.75 the whole time; L and R knee
   angles differ by ≥ 0.1 for at least 70 % of frames (not mirrored).
6. Flare: at 1 m above ground, knees 0.45-0.65, hip spread ≤ 0.05 per leg.
7. Visual (`showcase.ts` and a phone-portrait capture at the default canopy camera): a full left and a full right
   turn read as a firm lean that settles, never a flip. Reis's playtest is the final check.

## 8. Open questions

None blocking.
