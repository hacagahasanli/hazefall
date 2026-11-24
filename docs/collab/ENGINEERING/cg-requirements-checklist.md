# CrazyGames requirements checklist: Last Commit Standing (lcs-cg-v2)

Sources read 2026-11-24: docs.crazygames.com `requirements/intro`, `requirements/technical`, `requirements/gameplay`,
`requirements/quality`, `sdk/game`, `sdk/user`, `faq`. Status: PASS / FAIL / OPEN (not yet verified) / N/A.
Evidence is a file, a command or a test step. Update the status column as later steps verify things.

## Rejection and resubmission
- The rejection text ("overall quality ... does not yet meet the expectations") is CG's generic quality verdict. FAQ:
  a rejected game may be resubmitted "as long as you've made clear improvements"; "if you resubmit the same game with only
  small tweaks, the outcome will most likely be the same". No waiting period is documented.
- Where: developer portal (developer.crazygames.com, game 3de1b152). Exact button (new version on the same game vs new
  submission) to be read in the portal: see section "Portal" below. Reis submits; we never do.
- Optional: ask developer-relations@crazygames.com for the specific issues (Reis decides; nothing sent by us).

## Technical
| Rule | Status | Evidence |
| --- | --- | --- |
| Initial download <= 50 MB (<= 20 MB for mobile homepage) | PASS | `npm run build:portal`: 2.8 MB on disk, 1.7 MB gzip |
| Total size <= 250 MB, file count <= 1500 | PASS | 70 files |
| Relative paths only | PASS | `scripts/portal-report.mjs` check; only absolute URL is the SDK script |
| Works in Chrome and Edge; Safari ok or disabled there | OPEN | Chrome tested in step 4; Safari not tested |
| Runs smoothly on a 4 GB Chromebook (else disabled on ChromeOS) | OPEN | low tier exists (`render/quality.ts`); no device test |
| Device-specific UI from SDK `user.systemInfo.device.type`, not touch detection | PASS (step 2) | `src/lib/device.ts`; desktop-only gate added in step 2 |
| `user-select: none` on body | PASS | `portal/portal.css` |
| Mouse + keyboard (touch only if mobile supported) | PASS | desktop only from step 2 |
| User consent notice if personal data beyond SDK events | PASS | portal build sends no telemetry and has no lobby server (portal-report check) |
| AudioContext resumed in a user gesture | OPEN | verify in step 4 (sound after first click) |
| SDK: `init`, `loadingStart/Stop`, `gameplayStart/Stop` | OPEN | `src/platform/crazygames.ts`; verify in QA tool, step 4 |
| SDK: `game.settings.muteAudio` + change listener honoured | PASS (code) | `crazygames.ts` `muted/onMutedChange` |
| Basic Launch: no ad or banner calls | PASS | ads gated by `VITE_CG_ADS` (off); banner calls only when on |
| Saves through SDK `data` module | PASS (code) | `crazygames.ts` `storage` |
| Physics consistent at 144/165 Hz | PASS (code) | fixed sim step `src/game/sim/constants.ts` DT = 1/60 |

## Gameplay
| Rule | Status | Evidence |
| --- | --- | --- |
| Legible at DPR 1 and at 907x510, 1216x684, 1077x606, 821x462, 1366x768, 1920x1080, 1536x864, 1280x720 | OPEN | step 3 screenshots |
| English localisation; locale from systemInfo, fallback English | PASS | game is English only (allowed) |
| Intuitive controls; restricted keys | PASS | Esc and P both pause; key handling by `e.code` (physical keys, so AZERTY users get the same positions); Esc, Tab, F5, F11 reserved (`settings.ts`) |
| Load quickly, no errors or crashes | PASS (local) | clean build ed36ef7 with real SDK at 1216x684: 0 console errors, 0 failed requests; CG QA tool still to run |
| Original names, assets, content | OPEN | step 5 copyright list |
| No custom fullscreen button | PASS | `disableAutoFullscreen()` in `portal/main.tsx`; no requestFullscreen call in portal path |
| No cross-promotion / external links | PASS | portal-report "no outbound links"; neutral copy alias |
| PEGI 12 | PASS | stylised shooter, no blood/gore (attested PEGI 12 on 2026-11-22) |
| Land in gameplay (max one click) | OPEN | boot -> menu -> Play; count clicks in step 4 |

## Quality guidelines (optional, but the reason we were rejected)
| Guideline | Status | Notes |
| --- | --- | --- |
| High-quality, consistent graphics, no defects | OPEN | F-011 black roofs fixed (9ffeec9); P0-3 camera in trees: step 3 |
| Clear buttons, comfortable layout | OPEN | P0-1 lobby overlap at 907x510, F-012 Fighter panel at 1020x540: step 3 |
| Skippable onboarding in gameplay, little text | OPEN | first 30 s review in CD preflight |
| Show controls (keyboard overlay) | PASS | in-round key hints and How to play |
| Interface designed for the device (desktop, optionally mobile) | PASS (step 2) | desktop only |
| Solo as prominent as multiplayer | PASS | portal build is solo only (online hidden) |

## Portal (read in the developer portal, 2026-11-24)
- Game 3de1b152 (ID 181110) shows REJECTED: "You can't update your game info anymore"; Game Versions has no "Submit new
  version" button, only Preview and old drafts. So the resubmit is a NEW game via "Submit a game" (matches the FAQ: resubmit
  with clear improvements). Reis decides whether to "Remove game" the old entry first or ask developer relations.
- No device field in Game Info. The desktop-only switch is expected in the upload/QA flow (earlier uploads had Yes/No
  toggles there); confirm when the new submission is started.
- The old metadata must change in the new submission: description says "the storm closes in" (now the Haze) and "Play
  against bots on desktop or mobile" (now desktop only); controls list a "Mobile:" line; tag "Top-Down" is wrong (the game
  is third-person shoulder camera). New copy is the CD's (request it before upload).
