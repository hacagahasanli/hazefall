# Hazefall — CG videos, engineering plan v1 (2026-11-24)

Follows CREATIVE/specifications/cg-store-copy-v2.md §5.2/§5.3 (story, lengths, rules), with Reis's ask: over-the-shoulder,
high quality, lots of motion. CG rules: 15-20 s, 1920x1080 and 1080x1620, no sound, no fast-forward, first frame = cover,
no black frames, no cursor, no added text.

## How it is made (real gameplay, not AI)
1. **Frame-perfect capture.** Playwright drives the real portal build with a virtual clock: the game advances exactly
   1/60 s per frame and each frame is saved as a PNG at full resolution (2x render, downscaled). So the video is perfectly
   smooth at 60 fps even if a frame takes long to draw, at High quality with shadows. ffmpeg -> H.264, CRF 16, yuv420p.
2. **Director mode (dev-only, `?director=1`, not in the CG build):** a scripted pilot plays the round so every shot lands:
   - your fighter takes no damage (so the take never ends early), bots fight normally;
   - the pilot steers the drop to The Pitch, picks the gold-beam rifle, then aims at the nearest visible bot with smooth,
     human-like mouse moves (eased turn, small overshoot), leans and rolls on cue;
   - a fixed seed, so a good take can be re-rendered identically after tweaks;
   - camera = the real shoulder camera; a few shots add a slow orbit/dolly ease for the cover-to-gameplay transitions.
3. Takes are cut, not sped up. Several takes per shot, the best one kept.

## Video 1 — landscape 1920x1080, 18 s (HUD v2 on, FPS off)
| Time | Shot |
| --- | --- |
| 0.0-1.0 | The Hazefall landscape cover, still (CG's required first frame) |
| 1.0-3.5 | Inside the plane door, over the shoulder: jump; the town, river and stadium below |
| 3.5-6.0 | Free fall then canopy opens with a jolt; steering down past other canopies toward the Pitch floodlights |
| 6.0-8.5 | Touchdown on the pitch, sprint to a gold beam, grab the rifle (rack tile flashes) |
| 8.5-13.5 | Shoulder fight: lean out of the dugout, tracer hits with damage numbers, a roll to cover, one knockout in the feed |
| 13.5-16.0 | The blue Haze wall sweeping in; roll through tall grass toward the safe zone |
| 16.0-18.0 | Win: "LAST ONE STANDING", hold |

## Video 2 — portrait 1080x1620, 16 s (native viewport, HUD off except crosshair, hit numbers, kill feed)
| Time | Shot |
| --- | --- |
| 0.0-1.0 | The portrait cover (800x1200 scaled) as the first frame |
| 1.0-4.5 | Free fall straight down onto the town, canopy opens above |
| 4.5-7.0 | Landing on a roof, jump to the next roof |
| 7.0-12.5 | Shoulder fight in the container yard (cranes and stacks suit the tall frame) |
| 12.5-16.0 | Win sticker over the town, hold |

## Check before handing over
Every frame: no cursor, no FPS text, no pause pill, no black frame; first frame = cover; file < 50 MB; watched in full by
Claude (contact sheet of 1 frame per second) and then by Reis and the CD.

## Cost
Director mode + capture script ~1.5-2 h of work; rendering is local (no tokens). Tokens go to writing the pilot and
checking contact sheets, not to the video itself.
