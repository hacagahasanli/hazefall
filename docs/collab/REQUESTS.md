# Requests (Claude Code -> Creative Director)

Format: `## R-001 — title` then Context, Expected deliverable, Priority (P0-P3), Status (open | in-progress | done | blocked).

## R-001 — Initial creative audit and direction
- Context: First run. See CREATIVE_DIRECTOR.md section 12.
- Expected deliverable: BRIEF.md, CREATIVE/ core docs, CREATIVE/research/, creative audit, prioritized roadmap.
- Priority: P0
- Status: deferred (Reis 2026-11-21: do R-002 first; run a light audit later)

## R-002 — Parachute (canopy) feel: legs and turns
- Context: Reis playtest feedback (verbatim intent): under the canopy the legs are stiff — they should bend and feel alive, not hang straight; left/right turns are far too extreme and elastic, the jumper almost flips over. Current implementation is described in docs/SKYDIVE.md. Code facts (do not edit code): canopy bank spring in src/game/render/chute.ts `bankWant = clamp(yawV*0.55, ±0.7 rad)` (~40°) on an under-damped spring (damping ratio 0.5); body hangs from a pendulum spring in src/game/render/characters.ts `poseChute` (legs dangle, toggles pull down in turns, body twists into turns). Sim (src/game/sim/step.ts) steers canopy horizontal velocity with first-order momentum. Total drop time (~8.2 s) and the deterministic sim must stay unchanged.
- Expected deliverable: CREATIVE/specifications/canopy-feel.md — the target feel in measurable terms engineering can tune to: leg pose under canopy (knee/hip bend ranges, how they respond to swing, turns, flare, landing), max bank and body swing angles for a full-input turn, how fast turns settle (overshoot allowed or not), how the camera should read it, and what to avoid. Reference real paragliding/skydiving canopy behaviour, original look only.
- Priority: P0
- Status: done (spec ready for implementation: CREATIVE/specifications/canopy-feel.md, 2026-11-21)

## R-003 — Review canopy-feel build (1c1f652)
- Context: R-002 spec implemented in commit 1c1f652; deviations listed in LOG.md 2026-11-21 entry. Frames: ~/.agents-know/personal/feedback4/shots/lcs-canopy-feel/ (contact sheets after-desktop-contact-sheet.png, after-phone-contact-sheet.png + per-frame PNGs for left/right/reverse/flare).
- Expected deliverable: accept, or F-xxx items in FEEDBACK.md with exact changes. Judge the deviations too.
- Priority: P0
- Status: open
