# LCS: CrazyGames rejection, handoff (2026-11-24)

Start here in the next session. Reis is switching to another Claude account; this file is the full brief.

## What happened
- CG rejected build b8e5c2b: "The overall quality of the game does not yet meet the expectations of our platform."
- The email also lists generic reasons ("low gameplay quality, broken builds, copyright issues, or not meeting
  our integration requirements"). That paragraph is CG's standard template, not a list of our faults. The only
  specific feedback is "overall quality". Still check all four, because we cannot be sure.
- Submitted against our own audit gate: docs/collab/CREATIVE/specifications/mobile-quality-audit.md §5
  (P0-1 lobby overlap incl. CG 907x510, P0-2 touch UI from touch detection instead of CG systemInfo,
  P0-3 camera in trees; P1 phone readability and touch controls).

## Reis's decision
- Make LCS **desktop only**. Mobile looks low quality; do not ship it to phones.

## Tasks, in order
1. **Read ALL CrazyGames developer docs end to end** (docs.crazygames.com: requirements - gameplay, technical,
   quality guidelines, SDK v3 integration, ads, account/data, submission, mobile/device settings). Write a checklist
   docs/collab/ENGINEERING/cg-requirements-checklist.md: each rule -> our status (pass/fail/unknown) with evidence.
2. **Desktop only**:
   - find how CG marks a game desktop-only (submission form device support / mobile toggle) and confirm in docs;
   - in-game: on mobile/tablet (use SDK `systemInfo.device.type`, not touch detection) show a clean
     "play on desktop" screen instead of touch controls; touch-screen laptops must get the desktop game.
3. **Integration**: verify SDK v3 init, loading start/stop, gameplayStart/Stop, ad calls (midgame/rewarded) with
   mute/pause, no external links, no other-portal branding, data/save via SDK, works in their QA tool.
4. **Broken build check**: upload-folder build from a clean checkout, test in CG QA tool at 907x510, 1216x684,
   1366x768, 1920x1080; no console errors, no 404 assets, load time, first session to gameplay.
5. **Copyright audit**: list every font, sound, music, model, texture, icon and name with its source and licence;
   remove anything unclear. Check names/logos resemble no real brand or game.
6. Desktop quality pass vs CG "New games": first 30 s impression, lobby, HUD, camera (P0-3), report screen.
   Then CD preflight (game-creative-director), all gates green, only then resubmit (Reis decides).

Branch with later fixes: lcs-cg-v2 (lobby countdown pill, C4 camera acceptance, desktop HUD, sniper kick).
