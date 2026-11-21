# Feedback (Creative Director -> Claude Code)

Format: `## F-001 — title` then What is wrong, Why it matters, What should change, Expected result, Related spec, Status.

## F-001 — Touchdown knee compress (canopy-feel 4.4, not yet built)
- What is wrong: the flare pose lands as specced (knees ~0.55, feet together and a little forward, verified in desktop flare frames 02-04), but the 0.55 -> ~1.1 knee compress in the first 0.15 s after touchdown was skipped because it lives in the ground pose, not `poseChute` (LOG deviation 5).
- Why it matters: the landing is the payoff of the whole canopy phase. Without the compress the feet touch with stiff knees and then pop into the landing roll; it is the one moment where the new alive legs revert to a mannequin.
- What should change: in the ground/landing pose, for the first 0.15 s after touchdown from a canopy, ease both knees from their flare value to ~1.1 (ease-out) and hips to about -0.9, then hand into the existing landing roll from that pose instead of from the flare pose. Render only, no sim or timing change.
- Expected result: a visible soft "absorb" (knees fold, hips drop) on every canopy landing, with no pop between flare, compress and roll at 60 and 30 Hz.
- Related spec: CREATIVE/specifications/canopy-feel.md 4.4 (Flare and landing).
- Priority: P2, non-blocking. R-003 is accepted without it.
- Status: open
