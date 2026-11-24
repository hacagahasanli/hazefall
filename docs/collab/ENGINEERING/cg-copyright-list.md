# Copyright list: Last Commit Standing portal build (dist/portal), 2026-11-24

Everything the CrazyGames build ships, with source and licence. Full asset table: ASSETS.md.

| Item | Files in the build | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| Font: Bungee 400 | `bungee-400-*.woff2` | David Jonathan Ross, Google Fonts (via `portal/public/fonts`) | SIL OFL 1.1 | OK |
| Font: Chakra Petch 400/500/600/700 | `chakra-petch-*-*.woff2` | Cadson Demak, Google Fonts | SIL OFL 1.1 | OK |
| Gun sounds (14 files: pistol, smg, rifle, shotgun, sniper, pump, bolt, dry fire, 6 reloads) | `assets/sounds/*.m4a` | Snake's Authentic Gun Sounds 1 and 2, f8studios.itch.io | Author: "All sounds can be used commercially, and credit is not needed" (itch page, read 2026-11-24). Trimmed and re-encoded by us. | OK (credit given anyway in Credits) |
| Other sound effects (explosions, hits, UI, footsteps) | none (synthesised at run time) | own code, `src/game/sfx.ts` | own | OK |
| Music | none | - | - | OK |
| Houses (21) | `assets/models/house_type01..21.glb` | Kenney City Kit (Suburban) 1.0 | CC0 1.0 | OK |
| Crops, fences, flowers, stump, log stack | `assets/models/crops_*`, `fence_*`, `flower_*`, `stump_round`, `log_stack` | Kenney Nature Kit 2.1 | CC0 1.0 | OK |
| Crates, barrel, tent, signpost, workbench + `Textures/` | `assets/models/box-large.glb` etc. | Kenney Survival Kit 2.0 | CC0 1.0 | OK |
| Characters, guns, cars, plane, parachutes, trees, terrain, props, animals, clouds, HUD icons | none (built in code) | own code, `src/game/render/*` | own | OK |
| Logo, wordmark, favicons, app icons | `icons/`, `favicon*`, `brand/` | studio brand set, outlines from OFL fonts | own | OK |
| CrazyGames SDK | loaded from sdk.crazygames.com | CrazyGames | platform SDK | OK |

## Names (originality)
| Name | Where | Risk |
| --- | --- | --- |
| Last Commit Standing | title | none found |
| Blaze, Bastion, Tempo, Rookie | fighters | low: "Bastion" is also an Overwatch hero and a Supergiant game title (common English word) |
| the Storm ("Storm moves in", "Final Storm") | shrinking zone | **medium: Fortnite calls its shrinking zone "the Storm"**, with near-identical HUD wording. Rename is a creative call: R-016 to CD |
| Old Town, Deadwood, Southfield Farm | map places | none (generic / real-world place words) |
| Bot names (Maverick, Pebble, Nova, ...) | bots | none (common words) |

No external links, other-portal branding or studio jokes in the portal build (`scripts/portal-report.mjs` checks; neutral copy alias in `vite.portal.config.ts`).
