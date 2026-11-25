# Reis brief 2026-11-25: Character movement, leaning & weapon handling — full-body animation polish (Hazefall)

Main problem (Reis): leaning left/right (Q/E) moves only the upper body; hips, legs, knees, feet and balance do not react, so the character looks stiff and disconnected. Goal: one physically connected human body, comparable to polished modern tactical shooters; subtle, believable, no exaggeration, no robotic snaps.

Requirements (summary of Reis's full brief):
1. Inspect rig/hierarchy (pelvis, spine, chest, arms, legs, feet), how poses blend, which systems write the same transforms. Improve, don't rebuild.
2. Lean: progressive spine/torso bend (not one rigid block), shoulders adjust, pelvis subtly compensates, legs react to weight shift, knees bend where supported, feet keep ground contact, centre of gravity visibly shifts; never upright-from-waist-down while the top leans; no sliding/floating.
3. Feet/legs: no floating, no floor penetration, no crossed legs, natural knee bend, no foot sliding when stationary, weight distribution matches movement, alive idle stance. Lightweight IK (two-bone) if the rig lacks it.
4. Weapon & arms: shoulders, elbows, wrists, hands correctly placed; weapon stays attached to both hands and aligned with the body while walking, running, leaning and in transitions; arms never detached/stretched/stiff.
5. Transitions: idle, walk, run, stop, start, turn, lean L/R, return from lean, crouch, jump, land — smooth, no snapping/teleporting; settle on stop; body reacts to direction changes.
6. Orientation: forward/back/side/diagonal, turning while moving/standing, moving while leaning — coherent.
7. Technical: frame-rate independent (dt-based damping), no fighting transforms, no jitter, responsive controls.
8. Idle: subtle breathing, small posture shifts, shoulder movement, weapon stabilisation — must not affect aim or camera.
9. Chains must work together: Pelvis -> Spine -> Chest -> Shoulders -> Arms -> Hands -> Weapon and Pelvis -> Thighs -> Knees -> Legs -> Feet -> Ground.
10. Don't replace the model without a strong reason, don't break controls/camera/weapons, no new dependencies, no whole-model rotation as "animation", don't leave it half done. If the rig lacks bones, explain and do the best possible with what exists.
11. Validate in the real game: standing, forward, back, side, diagonal, lean L/R standing, lean while moving, return from lean, turning standing/moving, weapon in every state. Check foot sliding, floating feet, broken knees, unnatural pelvis, arms off weapon, weapon misalignment, snapping, clipping, FPS-dependence. Fix what you find.
