# Assets

Everything in `public/assets` comes from the packs below. `scripts/import-assets.sh` copies exactly
these files from the downloaded packs, so the list here and the script stay in sync.

| What | Pack | Author | Licence | Files |
| --- | --- | --- | --- | --- |
| Trees, bushes, rocks, crops, fences, flowers, grass, stumps, logs | Nature Kit 2.1 | Kenney (kenney.nl) | CC0 1.0 | `public/assets/models/tree_*.glb`, `plant_*`, `rock_*`, `crops_*`, `fence_*`, `flower_*`, `grass_large`, `stump_round`, `log_stack` |
| 21 house exteriors | City Kit (Suburban) 1.0 | Kenney | CC0 1.0 | `public/assets/models/house_type01..21.glb` |
| Crates, barrels, tent, signpost, workbench | Survival Kit 2.0 | Kenney | CC0 1.0 | `public/assets/models/box-large.glb` and the others, `Textures/` |
| Gunshots (9mm, 5.56, 7.62x39, 7.62x54R, 20 gauge), pump, bolt, reload | Snake's Authentic Gun Sounds 1 and 2 | Snake (f8studios.itch.io) | Free; commercial use allowed, credit not required (author's terms on the itch.io pages) | `public/assets/sounds/*.m4a`, trimmed to 1.1–2.2 s with a fade and encoded as AAC |

Not from a pack: the plane, the parachutes, the characters and their guns, the barns, the HUD and every
synthesised sound effect (explosions, hits, UI) are built in code in this repo.

The original downloads are not committed; only the files the game loads are.
