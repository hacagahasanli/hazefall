# Assets

Everything in `public/assets` comes from the packs below. `scripts/import-assets.sh` copies exactly
these files from the downloaded packs, so the list here and the script stay in sync.

| What | Pack | Author | Licence | Files |
| --- | --- | --- | --- | --- |
| Crops, fences, flowers, stumps, logs | Nature Kit 2.1 | Kenney (kenney.nl) | CC0 1.0 | `public/assets/models/crops_*`, `fence_*`, `flower_*`, `stump_round`, `log_stack` |
| 21 house exteriors | City Kit (Suburban) 1.0 | Kenney | CC0 1.0 | `public/assets/models/house_type01..21.glb` |
| Crates, barrels, tent, signpost, workbench | Survival Kit 2.0 | Kenney | CC0 1.0 | `public/assets/models/box-large.glb` and the others, `Textures/` |
| Gunshots (9mm, 9mm isolated, 5.56, 7.62x54R, 20 gauge), pump, bolt, per-gun reloads (9mm pistol, AR, .308, shotgun shell), pistol dry fire | Snake's Authentic Gun Sounds 1 and 2 | Snake (f8studios.itch.io) | Free; commercial use allowed, credit not required (author's terms on the itch.io pages) | `public/assets/sounds/*.m4a`, trimmed to 1.1–2.2 s with a fade and encoded as AAC |

Not from a pack: the cars, containers, tents, windmill, campfire, pond, pier, animals and birds (`src/game/render/props.ts`), the terrain texture, grass, trees, bushes and rocks (`src/game/render/nature.ts`), the clouds, the plane, the parachutes, the characters and their guns, the barns, the HUD and every
synthesised sound effect (explosions, hits, UI) are built in code in this repo.

The original downloads are not committed; only the files the game loads are.

## Logo and icons

The wordmark, emblem, favicons, app icons and share image come from the studio's own brand set
(`games-studio/brand/last-commit-standing`, built from SIL OFL fonts turned into outlines): `public/favicon*`,
`public/apple-touch-icon.png`, `public/icons/`, `public/og.jpg`, `public/brand/`, and the portal copies in `portal/static/`.
