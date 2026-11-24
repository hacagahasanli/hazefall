# Next session starts here (2026-11-24 evening)

Work in the worktree `~/Desktop/projects/games-studio/lcs-deploy-main` (branch **main**, everything merged and pushed).
`last-commit-standing/` is the old `lcs-cg-v2` branch: do not work there. node_modules: `ln -sf ../last-commit-standing/node_modules node_modules`
for tsc/vitest/dev, then `unlink node_modules` before committing. Commit as hacagahasanli, no Claude attribution, push to main.

## Done today
Reis bug list batches A-D (3D crosshair aim, crane legs, roofs, houses off roads, lobby 10 s, F picks up, 3 bandage / 4 med kit /
5 bomb, no auto heal, mouse-only shooting, HUD v2 rack, slower XP, grass balance, The Pitch stadium), merge of the 23 Nov main line
(crouch C, look Alt, props as drawn), stadium push-out and z-fighting fix, pause-menu key list removed, window frames flush,
corner shots leave from the camera line (`Input.camSide`), CrazyGames: Play starts the first round itself and the fighter is
picked on the Fighter page only, F-018 preflight items 1, 2, 3, 5, 6, 7, 9. CG rules re-read: checklist
`docs/collab/ENGINEERING/cg-requirements-checklist.md`. Store copy: `docs/collab/CREATIVE/specifications/cg-store-copy-v2.md`.

## Next (in order) — goal: CG resubmission that gets APPROVED
1. F-018 item 4 (last blocker): (a) fade grass tufts and tall grass within ~1.8-2.6 m of the camera (render/nature.ts),
   (b) shoulder camera eases off walls so a wall never fills > 1/3 of the screen, (c) Auto quality holds 60 fps at 1216x684.
2. F-018 item 8: at most two text lines on screen (zone line + one hint); "Click · shoot" only with a gun on the ground.
3. Covers (3) and videos (2) per cg-store-copy-v2.md section 5; Safari check; CD sign-off in FEEDBACK F-018.
4. Then Reis uploads to CG as a NEW game (old entry 3de1b152 is rejected and locked); Poki adapter after that.
Not verified in a real round yet: Play again -> lobby -> Ready, crouch in tall grass, Alt on Windows.

## Also
- Backlog (agents-know, profile personal): studio site LCS card image, Parking Slot last, Floor 42 images (after uploads).
- Upwork cron dies with /clear: re-create per `opportunity-research/sprint-2026-11/upwork-scan-cron.md` (17,47 * * * *).
