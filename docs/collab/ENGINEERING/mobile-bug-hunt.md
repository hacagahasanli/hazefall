# Mobile bug hunt, responsive matrix and performance audit

Last Commit Standing, branch `portal-build`, 2026-11-22. Measurement only: no product code changed, nothing committed. Company mode not stated, so `standard` was used.

**Code baseline.** Work started at `b8e5c2b`. Two commits landed during the audit: `4b706a9` and `b0f58b7` (touch UI now decided by `src/lib/device.ts`).
- B1, B3, B4 and B8 were re-run on the dev server at `b0f58b7` and still reproduce, with the same output.
- Line numbers below are at `b0f58b7`.
- The perf build and the matrix ran at `b8e5c2b` or in between; the new commits changed only touch detection.

**Rig.**
- Browser: Playwright-core 1.65 driving Chrome for Testing, ANGLE on Metal (Apple M1 Pro GPU).
- Phones: emulated with touch, DPR 3 and an Android user agent. Multi-touch sent through CDP `Input.dispatchTouchEvent`.
- Scripts: `matrix.mjs`, `portrait.mjs`, `hunt1-3.mjs`, `leak*.mjs`, `perf.mjs`, `prof.mjs` and `warns.mjs`, in the session scratchpad `qa/` folder.
- Screenshots: `docs/collab/CREATIVE/shots/mobile-audit/qa/`.

**Evidence tags.**
- **verified**: reproduced here.
- **code**: read in the source, not reproduced.
- **assumed**: expected but not checked.

## Bugs

| ID | Sev | Bug | Status |
|---|---|---|---|
| B1 | P1 | After round-over, a touch player who was holding Fire and the stick keeps running and shooting behind the result screen | verified |
| B2 | P1 | The lobby (staging) WebGL context leaks: one more live context per round | verified (retainer not identified) |
| B3 | P2 | Scope stuck: if the Scope pad disappears while held, the next sniper is already scoped | verified |
| B4 | P2 | Heal stuck: if the Heal pad disappears while held, the first Heal tap after a refill is lost | verified |
| B5 | P2 | Lobby at 568x320: "You drop as" covers "← Menu" (taps blocked) and the Level plate overlaps the fighter name | verified |
| B6 | P2 | Tab or app going to the background: no pause, audio not suspended, touch state not cleared | code; needs a real phone |
| B7 | P2 | Auto quality is off during the drop (the heaviest phase), and a tier step-down causes a 0.24-0.9 s freeze | verified |
| B8 | P3 | Rotating back to landscape leaves the round paused | verified; the code comment says this is intended (product call) |
| B9 | P3 | Upright tablets get the "Rotate your phone" card | verified (product and copy call) |
| B10 | P3 | Tap targets under 30 px | verified |
| B11 | P3 | 444 `toNonIndexed` warnings and a `PCFSoftShadowMap` warning on every boot, production build included | verified |
| B12 | P3 | Result screen at 568x320: the list reaches the bottom edge, so the actions need a scroll | verified screenshot; whether the buttons can be reached was not checked |

### B1 (P1): input stays held after round-over, so the winner keeps running and shooting

**Repro (verified, `hunt3.mjs` T10, 844x390 touch).** Hold Fire and push the stick. End the round (all bots dead, `phase = 'over'`). Lift both fingers.
```
T10b over, fingers still held   "phase":"over" … "shots":57 … "prev":{"mx":1,"fire":true}   (Fire pad present? false)
T10c fingers lifted after over  "phase":"over" … "shots":65 … "prev":{"mx":1,"fire":true}
T10d player x drift 1.5s after lift: 9.90
```

**Trigger.** The round ends with a finger down. That is the normal way to win on touch: you hold Fire for the last kill.

**Cause.**
- `src/components/Match.tsx:1128` (`touch && !over && !menuOpen`) unmounts `TouchControls` while pointers are still down.
- Neither `Pad` (`src/components/TouchControls.tsx:124`) nor `Stick` (`:49`) releases on unmount, so `press(b, false)` and `onMove(0, 0)` never run.
- The game clears `touchHeld` and `stick` only in `setPaused` (`src/game/render/game.ts:3086`), which round-over does not call.
- `session.tick(alive ? readInput() : NO_INPUT)` (`game.ts:2991`) keeps feeding the winner.

**Effect.** Gunfire and running continue behind the report. Whether `shots` feeds accuracy or career stats was not checked.

**Fix plan.**
- Add an unmount cleanup to `Pad` and `Stick` that sends `press(b, false)` or `onMove(0, 0)` when they are down.
- Also clear `touchHeld` and `stick` in the game when `state.phase` turns `'over'`.
- Proof: re-run T10 and expect `prev` to be `{}` and `shots` to stop rising.

### B2 (P1): the lobby WebGL context leaks every round

**Repro (verified, `leak5.mjs` and `leakstk.mjs`).** Loop five times: menu, Play, Ready, ground, Pause, Quit to menu.
- Garbage collection is forced with `--expose-gc` before every sample.
- Contexts are tracked with `WeakRef` plus `isContextLost()`.

**Result.**
- Live, not-lost contexts at the menu: `2, 2, 3, 4, 5, 6`. Each round adds one.
- Creation stack of each survivor: `ALIVE detached 1433x662 :: … startStaging (src/game/render/staging.ts)`, one per round.
- The `startShowcase`, `renderPortraits` and `startMatch` contexts are all `gone`.

**Cause (partly proven).**
- `staging.ts:332-344` `dispose()` calls `renderer.dispose()` but never `renderer.forceContextLoss()`. The match renderer does both (`game.ts:3153`).
- Something still references the staging renderer after dispose. Its dispose loop only covers `Mesh`/`Points` with one material and `.map`.
- `game.ts:3140-3150` documents the same class of leak, already fixed there ("one left undisposed … kept the whole old renderer").
- The exact retainer is **not identified**. Next step: a DevTools heap snapshot, then "Detached HTMLCanvasElement" → Retainers.

**Effect.**
- About one antialiased 1433x662 drawing buffer of GPU memory is kept per round on a phone.
- Chrome caps contexts at 16 and drops the oldest, so desktop Chrome probably survives.
- iOS Safari has lower limits, so reloads or crashes after several rounds are a real risk. **Needs a real iPhone.**

**Fix plan.**
- Call `forceContextLoss()` in the staging dispose.
- Reuse the `game.ts` dispose-every-drawable loop.
- Proof: re-run `leak5.mjs` and expect the menu count to stay at 2.

**Siblings.** `showcase.ts:150-160` (`startShowcase`) and `showcase.ts:169-208` (`renderPortraits`) also skip `forceContextLoss`. GC reclaimed them in this test, but they should get the same change.

**Checked clean (verified).**
- Window and document listeners: 27 at the menu after every cycle, 35 in a round.
- One rAF loop, 60/s in every state.
- Menu heap flat at 141-146 MB over 9 cycles (`leak9.mjs`).
- No page errors.

### B3 (P2): Scope stays on

**Repro (verified, `hunt2.mjs` T5).** Hold Scope. Switch to the SMG (the Scope pad unmounts). Lift the finger. Switch back to the sniper.
```
T5c "weapon":"smg" "prev":{}
T5d sniper back, no finger  "prev":{"scope":true}
```
One Scope tap clears it.

**Cause.** The conditional pad at `TouchControls.tsx:281` releases nothing on unmount, so `touchHeld` keeps `'scope'` (`game.ts:3073`). `scopeHeld` (`game.ts:1296`) picks it up again as soon as a sniper is in hand.

**Fix.** The same `Pad` cleanup as B1.

### B4 (P2): Heal stuck, so the first tap is lost

**Repro (verified, T6).** Hold Heal with one bandage. The bandage runs out and the pad unmounts. Lift the finger. Refill to two bandages and tap Heal once.
```
T6c "prev":{"heal":true}
T6d first heal tap after refill  "hp":32.29 "using":null   (no heal started)
```

**Cause.**
- The pad at `TouchControls.tsx:284` (`heal && <Pad>`) unmounts while held, and `touchHeld` keeps `'heal'`.
- The sim starts a heal only on a new press (`step.ts:1454`: `input.heal && !p.prev.heal`), so the next tap's press edge is swallowed.

**Same pattern, not reproduced.** The Swap pad (`TouchControls.tsx:283`, read as `cycle` at `game.ts:1286`) can also unmount while held.

**Fix.** The same `Pad` cleanup as B1.

### B5 (P2): lobby top-left collision at 568x320

**Evidence (verified).** `shots/mobile-audit/qa/ph568x320-lobby.png`. The audit reports:
- `button "← Menu" covered by span "You drop as"`
- `span "Level 1" x span "You drop as" 98%`
- "BLAZE" runs under the Level plate.
- 640x360 and every larger landscape size are clean (`ph640x360-lobby-ref.png`).

**Cause.**
- The left column is anchored to the bottom (`src/components/PreMatch.tsx:299`, `fixed bottom-0 … flex-col`). It holds the heading `:302`, the name `:305`, the cards `:326` and Ready `:356`.
- Its smallest size rule is `max-height:420px`. At 320 px tall the column is taller than the space under the top bar (`:276`), so it grows up under Menu and Level.

**Player names list.** Hidden on phones (`:366`). Where it shows (tablets, desktop, CrazyGames 1020x540 and 860x484), it does not overlap Back, Level or the status.

**Fix idea.** Add a `max-height:340px` step (hide "You drop as", shrink the cards), or cap the column to the viewport height minus the top bar.

### B6 (P2): background or app switch not handled

**Code (verified by grep).**
- The only `visibilitychange`/`pagehide` handlers are telemetry (`src/lib/telemetry.ts:433-436`).
- `onBlur` (`game.ts:964`) clears keyboard keys only, not `touchHeld` or `stick`.
- `sfx.ts` never suspends the `AudioContext`; it only resumes it (`:106`).

**Behaviour: not emulatable.** In headless and headed Playwright, the page stayed `visible` when another tab came to the front (`hunt3.mjs` T9).

**Expected on a device (assumed).**
- Background audio may keep playing on Android Chrome.
- The player returns to a live fight with no pause.
- If the OS swallows the `touchend`, the held input sticks. `touchcancel` is handled (T4 passes).

**Fix.** On `visibilitychange` to hidden: open the pause menu (offline), suspend audio, and clear touch state. Also clear touch state on `blur`.

### B7 (P2, performance): no auto quality in the drop, and a step-down freezes the game

**No auto quality in the drop (verified).**
- The auto-tier guard skips `state.phase === 'drop'` (`game.ts:2955`).
- The drop is the heaviest phase. At 6x CPU, freefall ran p50 29.5, p95 37.6, p99 63 ms (about 33 fps) and the plane about 47 fps, with no adaptation.
- `phase` is still `'drop'` just after landing (T10a), so the first ground fights get no adaptation either.

**Freeze on step-down (verified).**
- Medium to low turns shadows off, which recompiles every material (`game.ts:2931-2935`).
- First frame after the toggle, sim paused: **238 ms** at 1020x540 (1x), **392 ms** at 1920x1080 (1x), **900 ms** at a phone with 4x CPU, **473 ms** with 6x CPU.
- This hits mid-fight, on exactly the weak devices the step-down is meant to help.

**Fix ideas.**
- Allow resolution-only steps during the drop.
- Precompile the no-shadow programs at load, or keep shadows and step the resolution further.

### B8 (P3): rotating back stays paused

**Verified (T8).** Portrait opens the pause menu and the rotate card. After rotating back to landscape the menu is still up, and the sim advanced 0 ticks in 1 s. Screenshot: `shots/mobile-audit/qa/bug-rotate-back-stays-paused.png`.

**Code.** `Match.tsx:645` only opens the menu, and `src/lib/orientation.ts` says this is on purpose.

**Product call.** Auto-resume, or a 3-2-1 resume from the paused menu.

### B9 (P3): upright tablets get the rotate card

**Verified (`portrait.mjs`).** At 768x1024, 820x1180 and 1024x1366 the card covers the screen and says "Rotate your phone" (`portrait-768x1024.png`).

**Product and copy call.** Let tablets play upright, or change the text to "Rotate your device".

### B10 (P3): tap targets under 30 px (verified)

- Main menu items: 28-29 px tall at every phone size.
- Settings tabs and switches: 28 px. Slider tracks: 6 px.
- Lean `◀ Q` / `E ▶`: 29x29 at 568x320.
- Everything else in-round passes on phones.

### B11 (P3): boot warnings (verified on the production build, `warns.mjs`)

- `toNonIndexed(): BufferGeometry is already non-indexed`: **444** times.
  - Likely source: `src/game/render/props.ts:140`. `IcosahedronGeometry` is already non-indexed; `nature.ts:273` has the guard to copy.
- `PCFSoftShadowMap has been removed`: from `game.ts:270` and `staging.ts:69`. Since three r182 `PCFShadowMap` is already soft.

## Input checks that passed (verified, 844x390)

| Test | Result |
|---|---|
| Stick and Fire held, then Jump added (3 touches) | `prev {"my":-1,"fire":true,"jump":true}`; each release clears only its own input |
| Fire dragged 290 px off the pad and released outside | stops (pointer capture works) |
| 20 rapid taps at 50 ms | +20 shots, nothing stuck |
| `touchcancel` while firing | released |
| Pause with stick and Fire held, resume with fingers still down | cleared by `setPaused` |
| Resize and rotation mid-round | canvas follows, no errors (pause behaviour is B8) |

## Responsive matrix (portal dev build)

**Screens.** Menu, fighter, settings (5 tabs), how to play, credits, lobby, plane, freefall, canopy, ground, pause, report.

**Checks** (`audit.mjs`): document overflow, off-screen controls, overlap, covered controls, targets under 30 px. Failures are saved as `shots/mobile-audit/qa/<viewport>-<screen>.png`.

| Viewport | Result |
|---|---|
| 568x320 (320-wide phone, landscape) | **Lobby fails (B5)**; lean pads 29 px; report needs a scroll (B12) |
| 640x360, 667x375, 844x390, 915x412, 932x430 | Clean |
| Phone portrait 320x568, 360x640, 375x667, 390x844, 412x915, 430x932 | Rotate card covers the screen, no overflow (`portrait-320x568.png`) |
| Tablet landscape 1024x768, 1180x820, 1366x1024 | Clean |
| Tablet portrait 768x1024, 820x1180, 1024x1366 | Rotate card (B9) |
| Desktop 1280x720, 1440x900, 1920x1080 | Clean |
| CrazyGames 1020x540, 860x484, 800x450 (touch) | Clean |

**Dismissed as false positives after checking the screenshots:**
- Pause hint text sits hidden behind the panel.
- Inline spans: "G · Rush", the kbd chips.
- `dsk1280x720-menu` was taken while the boot gate was still showing.
- On phones the HUD pill sits behind the report overlay.

## Performance (production portal build, `?perf`, vsync and frame cap off)

**Setups.**
- Phone: 844x390, DPR 3, auto tier `medium`, canvas 1433x662.
- Desktop: auto tier `high`.

**Columns.**
- "Frame" is the interval between rAF callbacks.
- "CPU" is the time inside the callback (main thread).

| Device / phase | Frame p50 / p95 / p99 ms | fps | CPU/frame ms | Draw calls | Triangles |
|---|---|---|---|---|---|
| **Phone 4x CPU** menu | 10.4 / 11.5 / 12.3 | 96 | 9.8 | n/a | n/a |
| lobby | 6.5 / 13.4 / 15.8 | 131 | 6.2 | n/a | n/a |
| plane | 11.2 / 13.4 / 15.3 | 88 | 10.6 | 311 | 749k |
| freefall + canopy | 14.0 / 16.7 / 18.0 | 70 | 13.3 | 352 | 751k |
| ground | 11.3 / 13.5 / 15.1 | 87 | 10.7 | 229 | 355k |
| **Phone 6x CPU** (low end) menu | 16.7 / 19.4 / 20.7 | 59 | 16.0 | n/a | n/a |
| plane | 21.3 / 25.5 / 29.4 | 47 | 19.9 | 324 | 761k |
| freefall + canopy | **29.5 / 37.6 / 63.0** | **33** | 28.2 | 302 | 734k |
| ground | 24.1 / 30.4 / 36.3 | 40 | 23.0 | 217 | 372k |
| **Desktop 1920x1080** plane | 3.6 / 6.4 / 7.6 | 254 | 3.7 | 286 | 758k |
| freefall + canopy | 2.9 / 4.1 / 5.0 | 329 | 2.9 | 224 | 633k |
| ground | 3.0 / 6.6 / 7.7 | 279 | 3.4 | 250 | 566k |
| **CrazyGames 1020x540** ground | 2.7 / 3.1 / 3.4 | 367 | 2.5 | 262 | 645k |

**Render cost.** Measured with `__lcsPerf.bench`: ms per synchronous `render()`, GPU wait included, same frozen ground view.

| Setup | Shadows on | Shadows off | Shadow cost |
|---|---|---|---|
| Desktop 1080p, 2048 map | 6.60 | 5.59 | 1.0 ms (15%) |
| 1020x540, 2048 map | 7.08 | 6.18 | 0.9 ms (13%) |
| Phone 4x, 1024 map | 11.17 | 9.03 | 2.1 ms (19%) |
| Phone 6x, 1024 map | 17.87 | 14.87 | 3.0 ms (17%) |

**Tiers (phone 4x).** High 12.1 ms, medium 10.9 ms, low 8.2 ms. Low draws 138 calls against 229.

**Scene.** 1,571 meshes, 387-400 of them shadow casters. 930 geometries, 462 materials, 7 textures, one shadow light.

**Memory.**
- Round heap on the phone: 105-161 MB, falling back to 85-107 MB after GC. No growth over 40 s.
- Menu heap after 9 rounds: 141-146 MB, flat.
- Live WebGL contexts grow (B2).

**Load (local server, no network throttle).**

| Step | Time / size |
|---|---|
| Navigation to the menu | 1.1-1.8 s |
| Downloaded before the menu | about 3.5 MB |
| Play → lobby | 0.6-0.9 s |
| World build | 0.38 s at 1x, 1.65 s at 4x, 2.49 s at 6x |
| Ready → first tick | 9.2-9.4 s (the "players joining" fill, a design wait) |

**Bundle.**
- 2.8 MB, 70 files.
- `index.js` 1,319.6 kB (396.3 kB gzip). CSS 91 kB (14.9 kB gzip).
- Models 976 kB, sounds 272 kB.
- No code split.

### Bottlenecks

1. **CPU-bound on the main thread.**
   - Ground CPU per frame: 2.5-3.4 ms at 1x, 10.7 ms at 4x, 23 ms at 6x. That tracks the CPU throttle. Render cost is below the frame interval everywhere.
   - Profile, ground, 1x (`prof.mjs`): three.js is about 58% of busy time.
   - Top costs: `updateMatrixWorld` and `multiplyMatrices` (about 12% of busy time), then `setFromEuler`, `traverse` and `updateWorldMatrix`.
   - The game's own `chunks.ts update` is 1%. The sim `step.ts` is 0.2%.
   - No mesh ever sets `matrixAutoUpdate = false`, so all 1,571 meshes, static props included, recompute matrices every frame.
2. **Program lookups every frame.** `getParameters` and `getProgram` take about 1.1% of wall time. The per-frame fog update is a suspect (unproven).
3. **The drop on weak phones.** About 33 fps, p99 63 ms at 6x CPU, with no auto quality (B7).
4. **The shadow pass.** 13-19% of render time; turning it off freezes the game (B7).

## Needs a real phone

- **B2:** 8-10 rounds on an iPhone (Safari); watch for a reload or crash.
- **B6:** hold Fire, switch apps for 5 s, come back. Check the audio stops and Fire is not stuck.
- **Mobile GPU and fill rate.** The numbers above used an M1 Pro GPU with only the CPU throttled. Use `?perf` plus the in-game FPS readout on Adreno or Mali.
- **Thermal throttling.** A 15-minute session.
- **iOS safe areas and the Android address bar.** Emulation does not model them.
- **Online rooms** (Next app with 2 contexts): **not run**, out of time.
