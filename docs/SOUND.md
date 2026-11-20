# Sound budget

Game sound is in `src/game/sfx.ts` (synthesised, plus the recorded guns and reloads in `public/assets/sounds`); the
menu ticks and the pre-match bed are in `src/components/uiSound.ts`. The limits live in `src/game/audioBudget.ts`, and
`src/game/audioBudget.test.ts` fails if a gated sound has no row or a row goes unused.

## The graph

```
voices ─> sfx (1) / ui (0.7) / amb (0.5, ducked) / guns (Guns slider) ─┬─> compressor ─> master (Master slider, mutes) ─> limiter ─> out
                                                └─ room reverb send ───┘
menu ticks, wipes, impacts, pre-match bed ─> their own gain (Master level, mute) ─> out
```

- Compressor: threshold -14 dB, ratio 5. Limiter: threshold -3 dB, ratio 20, 1 ms attack.
- Footsteps scale with the Steps slider. Mutes (player, portal, ad, held) zero the master.

## Target levels (default sliders)

| What | Level | Notes |
| --- | --- | --- |
| Pre-match bed (wind + plane idling) | about -44 dBFS median (was -38) | dark: nothing above ~500 Hz worth hearing |
| Main menu | silent between ticks | no bed |
| A busy fight (SMG, bot pistol, six runners, hits) | about -27 dBFS RMS, peaks under -4 | no clipping |
| Your gunshots | well under everything else | GUN_LEVEL 0.4, Guns slider 0.6 |
| Hit tick / elimination | over the gunfight | ui bus, centred |

## Limits

| Sound | Cooldown | Voices | Note |
| --- | --- | --- | --- |
| gunshots | - | 5 (SHOT_BUDGET) | recorded and synthesised share the pool |
| hit tick | 45 ms | 1 | a stronger tick always gets through |
| others' footsteps | - | 4 | your own steps are never dropped |
| hit | - | 3 | |
| reload | - | 2 | others' reloads only within 30 m |
| vault / roll | - | 2 | |
| dry fire | 220 ms | 1 | the mistake click |
| explosion | 90 ms | 2 | ducks the bed 12 dB |
| glass / push / KO | 150 / 120 / 150 ms | 1 / 2 / 2 | |
| menu tick | 45 ms | 2 | a select always ticks |
| screen wipe whoosh | 250 ms | 1 | filtered noise, ~300 ms, menu / lobby / report wipes |
| countdown / report impact | 120 ms | 2 | low thump and click: 3-2-1, the drop, the placement landing |

## Adding a sound

1. Does a visual or an existing sound already say it? Then no new sound.
2. Add a row to `BUDGET` and here; gate the function with `if (!may('name')) return;`.
3. Pick the bus (sfx, ui for things about you, amb for beds, guns for shots). Never connect to `ctx.destination`.
4. Vary pitch and gain (`vary()` does it for `tone` and `noise`).
5. A loop needs a reason, a low-pass and a level near -45 dBFS or lower, and must fade out when its screen goes.
6. Dev check: `sfx.stats()` gives plays and drops per gated sound.
