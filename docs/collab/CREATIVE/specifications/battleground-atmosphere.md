# Battleground atmosphere: a valley that was left in a hurry

Owner: Creative Director. Date: 2026-11-23. Request: R-015. Builds on `map-v2.md` (layout, places, landmarks, budgets:
all unchanged). Engineering implements today; items are ranked, the **1-day slice** is marked `[SLICE]`.

## 0. What I looked at

Verified: map dump of `buildMap` (SIZE 120, 53 buildings, 721 `h` tiles in 73 blobs, largest 42 tiles at 81-89,21-28;
by place: Lakeside 124, Windmill Hill 106, Old Town 59, Mast Hill 36, Railyard 36, Truck Stop 32, outside places 301);
fresh shots on `npm run dev:portal` (shoulder view, the default camera on desktop): inside the 81,21 meadow the grass is a
wall above the fighter's head, the screen is 70 % blades; on the Route bridge into Old Town, tall grass lines both banks
and hides the houses' ground floors. Existing shots (lcs-map-v2, -r2): from above the map reads as lawn, roofs and trees
in one saturated green; houses are tinted Kenney shells standing straight on grass, nothing around them.
Code read: nature.ts (`buildTallGrass` 22 tufts/tile, Y scale 3.2-4.6 = blades 0.9-2.7 m; `buildGrass`; `paintTerrain`),
world.ts (shells from above with `TINTS`; at eye level instanced 2 m wall cubes coloured `FACADES[bi % 7]`, sill + glass
on `w` tiles, merged `buildRoof`; doorway frames, lamps, tape; scorch + sandbags "battle zone"), props.ts (statics merged
per material, `chunk: 88`, baked), chunks.ts (one chunked kind = 1 draw call), step.ts (`inPlant` = `b c h`, untargetable
beyond `PLANT_REVEAL` 2.4 m).

Two facts drive the plan: **phones only ever see the top-down camera** (shells, roofs, ground, props), **desktop players
mostly see the shoulder camera** (code walls and roofs). Every item says which view it serves.

## 1. Direction: "left in a hurry"

The valley's people left the morning the Deadline came. They left mid-task: laundry still on the line, a market day
packed half away, cars with their boots open, a launch party at the Campus abandoned mid-toast. Then the fighters
arrived: scorch marks, kicked-over bins, one burnt-out car. That is the story every prop tells. It is civilian and warm,
never military: **no sandbags at houses, no barbed wire, no ammo crates, no camo nets, no tank traps, no barricades**.

Readability rules for every addition (they override any per-item value):
- **R1. Looks solid = is solid.** Decor with no collision stays at or below **0.6 m**, or stands flush against a wall or a
  `v` prop, or is thin (posts, lines, wheels). Anything else that looks like cover must be a real `v`/`r` tile. Today's
  rule in world.ts ("none of it reads as cover") stays.
- **R2. Landmark accents stay exclusive** (map-v2 section 5): no new object uses `0xe23d5c 0xffc93c 0x2ec27e 0xf2542d
  0x3e7bfa` over 1 m². Use the dressing palette in section 4.
- **R3. The fight stays the brightest thing.** No new emissive except tiny (< 0.1 m²) details; no decal brighter than the
  ground it lies on.
- **R4. Nothing on decks, doors' 2-tile clear zone, roads' driving lanes or loot tiles.**

## 2. Ranked changes

| # | Change | View | Cost | Slice |
|---|---|---|---|---|
| 1 | Tall grass: fewer, smaller, tactical patches | both | instances -70 % | `[SLICE]` |
| 2 | Meadow edges: short grass, wildflower drifts, small plants | both | +3 calls | `[SLICE]` |
| 3 | Ground around buildings: aprons and worn door paths | both (top-down most) | 0 calls | `[SLICE]` apron only |
| 4 | Facade kit on the eye-level walls | shoulder / FPP | +1 call | `[SLICE]` core pieces |
| 5 | District colour palettes (walls, roofs, shell tints) + roof ridge and chimneys | both | 0 calls | `[SLICE]` |
| 6 | Market Square bunting + three "packed car" scenes | both (reads from the plane) | in #9 batch | `[SLICE]` |
| 7 | Light, fog and ground grade | both | 0 | `[SLICE]` |
| 8 | Lived-in yards: sandbags out, woodpiles/water butts/bins/laundry in | both | in #9 batch | later |
| 9 | Per-place story dressing (one merged batch) | both | +1 call per 88 m chunk in view | later |
| 10 | Crouch-gated concealment in tall grass | gameplay | 0 | when crouch (G) lands |
| 11 | River reeds, tyre tracks, desire paths | both | +1 call | later |
| 12 | Earlier-round traces: one burnt car, kicked bins, scorch trim | both | 0 | later |

Budgets for the whole pass (measure with `?perf&tier=low|high`, the map-v2 fixed views): low ground worst **≤ +12 calls,
≤ +40k tris**; plane view **≤ +10 calls**; world build **≤ +40 ms**; no new texture, no new GLB; tall-grass instances
15.9k → **≤ 5k**. Map-v2 frame budgets still apply as ceilings.

---

### 1. Tall grass: tactical patches, not walls `[SLICE]`

Problem: 721 `h` tiles, 15.9k tufts up to 2.7 m. A 1.8 m fighter disappears and so does the scene around him.

**Map rule** (sim/constants.ts, at the end of `buildMap`, before the "every door opens onto open ground" pass; deterministic):
1. Set `h` → `g` inside the four town rectangles: Old Town 44,42-79,79; Truck Stop 52,90-79,105; The Campus 10,90-41,115;
   Container Yard 89,36-113,83 (towns use walls for cover, map-v2 section 8).
2. Set `h` → `g` where the tile is within **3 tiles** (Chebyshev) of any building tile, or within **1 tile** of a road or
   lane strip (`routeDistance` < 2 m). Doors, streets and yard fronts stay readable.
3. For every remaining 4-connected `h` blob of `n` tiles: if `n ≤ 6` keep it; else keep the
   `K = clamp(round(n × 0.45), 6, 16)` tiles nearest the blob centroid (tie-break by `tileHash`), the rest → `g`.
   **Exempt**: the three Mast Hill blobs (centres 30,12 / 4,22 / 14,27: they are that approach's only cover by design).
4. Target after the rule: **220-320 `h` tiles**, every quadrant keeps at least 6 patches. Add a map test for both.

**Render** (`buildTallGrass`):
- Core tiles (all four neighbours `h`): **16 tufts/tile** (was 22); XZ scale `1.1 + r()*0.5` (was 1.4-2.2); Y scale
  `1.9 + r()*0.45` (was 3.2-4.6) → blades **0.55-1.35 m**, mean ~0.9 m: waist to chest on a standing fighter.
- Rim tiles (any 4-neighbour not `h`): **10 tufts/tile**, Y scale × 0.75 (blades 0.4-1.0 m). The patch rises from its
  edge instead of standing up as a wall.
- Colours: straw share 40 % → 30 %; add 10 % seed-head blades `setHSL(0.13, 0.35, 1.0 + r()*0.1)`; rest as today.
- Shoulder view: the camera now looks over the meadow; you see who stands in it (chest up) and you see the patch as a
  place, not a screen-filling wall.
- Terrain under patches (`paintTerrain` meadow mix 0.7) stays.

Why: a hiding spot you choose and approach is tactics; a field that hides everyone is noise. Cost: ~4.5k instances,
same 1 call; fewer shadow casters.

### 2. Meadow edges: short grass, flowers, small plants `[SLICE]`

Every `g` tile within Chebyshev **2** of an `h` tile (this includes the tiles item 1 converted) becomes a **meadow edge**
(render-only, no tile change):
- Lawn tufts (`buildGrass`) × 1.5 count and Y × 1.3 there (0.3-0.75 m).
- **Wildflower clumps**: new code geometry `flowerClump`: 5 stems (one blade triangle each, 0.22-0.42 m, base
  `0x4f7a35`, tip `0x6f9a45`) each topped by a flat diamond head 0.09 m across (2 triangles), colours baked per vertex.
  Two variants, picked by `fbm(tx*0.12, ty*0.12) > 0.5` so colour comes in drifts:
  - warm: heads `0xf4efe0` cream, `0xf2d46b` butter, `0xe07a5f` coral (2/2/1);
  - cool: heads `0xf4efe0` cream, `0xb9a3d9` lilac, `0x8fa8d9` cornflower (2/2/1).
  Count: **5 per edge tile**; plus on plain `g` outside towns, **4 per tile where `fbm(tx*0.15+7, ty*0.15) > 0.64`**
  (drifts on ~10 % of the fields, not a sprinkle). Instance colour = lightness jitter 0.88-1.1 only.
- **Small leafy plants**: new code geometry `leafClump`: 5 broad triangles 0.16-0.3 m, baked `0x3f6b35` to `0x5a8a40`.
  **3 per edge tile**, 1 per plain `g` tile where `hash < 0.08`.
- All three: `chunkedInstances`, `reach: GRASS_REACH`, `castShadow: false`, windy like the lawn (amount 0.2).
  Keep the Kenney `flower_redA/yellowB`, stumps and log piles as they are.

Why: the transition is what makes the field look grown rather than placed; flowers give the green a second and third
colour. Cost: **+3 draw calls** (two flower kinds, one leaf kind), ~10-14k instances at 30-40 triangles each, all inside
the reach cull.

### 3. Ground around buildings `[SLICE: apron only]`

`paintTerrain`, new weight grids, all at paint time (0 draw calls):
- **Apron**: every building gets a ring of worn ground on open tiles round its footprint. Weight 0.75 at the wall,
  falling to 0 at **2.2 m**, edge wobbled with the existing `e`. Colour `mix(DIRT, GRAVEL, 0.4)` = about `[130,113,92]`.
  In the Campus, Truck Stop and Container Yard use a hard-edged **1.2 m concrete sidewalk** `[150,146,138]` (no wobble)
  instead, so those places read as built-up.
- **Door paths** (later, item 11): from each doorway (`findDoorways`) a 1.2 m worn strip toward the nearest route point,
  max 14 m, `DIRT` weight 0.55, wobble 0.3 m.

Why: a house on bare lawn reads as dropped in; a trodden ring and a path to the road read as lived in. This is the
single strongest change from the top-down (phone) camera.

### 4. Facade kit on the eye-level walls `[SLICE: pieces a-e]`

Built in world.ts next to `allInteriors`, shown and hidden with it (shoulder/FPP only; from above the shells stay).
**One `InstancedMesh`** of a unit `BoxGeometry(1,1,1)`, `MeshStandardMaterial({ flatShading: true, roughness: 0.9 })`,
per-instance matrix + colour, `castShadow = false`: **+1 draw call** for the whole map. An "exterior face" is a side of a
`#` or `w` tile whose neighbour is outside the building. Values in metres; "proud" = how far it stands off the wall face.

| Piece | Where | Size (along × high × proud) | Centre height | Colour |
|---|---|---|---|---|
| a. Plinth (wear band) | every exterior face | 2.0 × 0.45 × 0.06 | 0.225 | wall colour × 0.62, then mixed 30 % toward `0x5a4a38` |
| b. Eave fascia | every exterior face | 2.0 × 0.22 × 0.08 | 2.49 | district trim |
| c. Corner post | each outer corner of a building | 0.16 × 2.6 × 0.16 (on the corner) | 1.3 | district trim |
| d. Window frame | each exterior face of a `w` tile: lintel 1.9 × 0.12 × 0.08 at 2.42; two jambs 0.12 × 1.5 × 0.08 at x ±0.9, 1.65; one mullion 0.06 × 1.5 × 0.04 at 1.65 | | | district trim |
| e. Sill ledge | under each window | 2.0 × 0.08 × 0.22 | 0.92 | district trim × 0.85 |
| f. Door step | outside each doorway | (2 × `DOOR_HALF` + 0.3) × 0.14 × 0.7 deep | 0.07 | `0xa8a196`; cabins `0x7a5a3a` |
| g. Flower box (later) | 35 % of windows in Old Town, farms, cabins (`hash`) | 1.4 × 0.22 × 0.25, plus 3 heads 0.18³ on top | 0.78 / 0.98 | box = door colour; heads from the flower colours |
| h. Shutters (later) | 40 % of houses in Old Town, farms, cabins; only where the wall tile beside the window is `#` | 0.42 × 1.5 × 0.05 each side, outer edge at ±1.2 | 1.65 | door colour |
| i. Porch canopy (later) | 50 % of doorways in Old Town and Truck Stop | 2.8 × 0.08 × 1.0 deep | just above the existing door lamp | roof colour |

Door colours (muted, never an accent): `0x3f5a3a 0x4a6a8a 0x7a3a2e 0x2b2d30 0x5b4636 0x2f4a5a`, one per building by hash.
Keep the existing door frames, doormats, lamps and hazard tape exactly (the tape is the "way in" read).

Instance count: about 53 buildings × ~22 exterior faces × 2-6 pieces ≈ **4-6k boxes, ~60k triangles** worst if every
building is in view; the frustum test on one mesh is per mesh, so split into the same 88 m chunks if it shows in `?perf`.

### 5. District palettes, roof ridge and chimneys `[SLICE]`

District of a building = the `DISTRICTS` rectangle (metres) its centre is in; none = "lone".
Pick by `hash(bi)` within the district's list. **Walls** replace `FACADES[bi % 7]` at eye level (and the gable colour);
**roofs** replace `ROOFS[i % 5]` in `buildRoof`; **shell tints** replace `TINTS[i % 7]` from above (multiplied as today).

| District | Walls | Trim | Roofs | Shell tints (from above) |
|---|---|---|---|---|
| Old Town | `0xd9c8a8 0xc9a98a 0xb87a5e 0xe4d7c1 0xa9b996` | `0xf1ead8` | `0x7a3a2e 0x6b4a32 0x4a5560` | `0xffe2cc 0xfff0d8 0xffd6c0 0xf0e8ff` |
| Farms + lone houses | `0xe8e0cc 0xd8c49a` (barns stay `0x9b3b30`) | `0x5b4636` | `0x5a6b45 0x6b4a32` | `0xfff6e0 0xf0ffe0` |
| Lakeside, Deadwood, Windmill Hill (cabins) | `0x8a6440 0x6f5136 0xa07c56` | `0xe4d7c1` | `0x3f5a3a 0x3f4650` | `0xe0d0b8 0xd8e8d0` |
| Truck Stop | `0xd8b8a4 0xb9c8d6 0xe8dcb0 0xc8d8c0` (motel rooms cycle in order) | `0xf4f1ea` | `0x4a5560` | `0xffd6e8 0xc8dcff 0xfff0b8 0xd8ffe0` |
| The Campus | `0xc4c0b6 0xdedbd2` | `0x3f4650` | `0x4a5560` | `0xc8dcff 0xffffff` |
| Industrial (Container Yard, Railyard, Quarry, Mast Hill) | `0x8f969c 0x9c7f66 0xb0aca2` | `0x3f4650` | `0x3f4650 0x5c6066` | `0xd0d4d8 0xc8c0b8` |

Roof details in `buildRoof` (merged with the roofs, baked, **0 extra calls**):
- **Ridge cap** on gabled roofs: box L × 0.12 × 0.3 on the ridge, roof colour × 0.7.
- **Chimney** on 50 % of gabled houses in Old Town, farms, lone houses and cabins (`hash(bi, 21)`): box 0.6 × 1.2 × 0.6,
  set 30 % along the ridge length on the slope, top 0.5 m above the ridge; colour `0x8a6a5a` (Old Town, farms) or the
  wall colour (cabins); a 0.7 × 0.08 × 0.7 cap `0x3a3430`.
- Flat roofs (`FLAT_MODELS`): one AC box 1.2 × 0.6 × 0.9 `0x9aa3a8` on the Campus and Truck Stop only.

Why: today every house differs only by an index into one list, so all places share one look. Per-district palettes are
what lets a player know Old Town from the Truck Stop at street level, the same way the landmarks work from the sky.

### 6. Market Square bunting and three packed cars `[SLICE]`

Built into the item 9 dressing batch (props.ts statics, baked).
- **Bunting**, Market Square (`MARKET_SQUARE`): 4 strings. Two cross Route 1 at the square's north and south edges
  (tile rows y0 and y0+h-1, from x 58 to x 63), two run from the water tower's legs to the two tents. Height at the ends
  **4.6 m** on thin posts (0.1 × 4.6 × 0.1, `0x5a4a3a`) where there is no wall; sag 0.8 m mid-span (6 segments).
  Line 0.03 m `0x3a3430`. Pennants every 0.6 m: flat triangle 0.30 wide × 0.35 deep, double-sided, cycling
  `0xf4efe0 0x3a8f8a 0xd9a04a 0x9a8fc0`. From the plane they read as dotted lines over the square (market day).
- **Packed cars**: 3 of the existing car props (1 in the Campus car park, 2 at the Truck Stop; pick by seed): the boot
  lid drawn open (rotated ~70° up at the rear), 2 suitcases 0.5 × 0.35 × 0.2 on the ground behind it
  (`0x6a4a3a`, `0x3a5a7a`), one on the roof 0.6 × 0.25 × 0.4 `0x7a6a4a`. Plus 2 dropped suitcases on the verge of
  Route 1 just north of the Route bridge (flat, ≤ 0.35 m). Collision unchanged.

### 7. Light, fog and ground grade `[SLICE]`

game.ts / nature.ts, one pass, compare before/after at the map-v2 fixed views:
- Sun: colour `0xfff0d0` → **`0xffe6c0`**, intensity 2.4 → **2.5**; offset from the focus `(-20, 60, +14)` →
  **`(-26, 54, +18)`**: shadows ~45 % longer (more depth from above), still short enough that a house's shadow does not
  swallow its doorway. Keep the shadow box size; widen only if shadows clip.
- Hemisphere: sky `0xcfeaff` → **`0xd2e6ff`**, ground `0x55703f` → **`0x6a6848`** (less green bounce on walls),
  intensity 1.5 → **1.4**.
- Fog and background: `0x9fd3f5` → **`0xa8d0ee`** (both, they must match); fog distances unchanged.
- Ground grade in `paintTerrain`: `GRASS_B [98,146,58]` → **`[104,138,64]`**; dry-patch weight 0.55 → **0.7**.
- Exposure and tone mapping unchanged.
Acceptance: the fighter, loot glows and muzzle flashes are still the highest-contrast things on screen in the shoulder
and top views; landmark accents read the same from the plane.

### 8. Lived-in yards (later)

world.ts "battle zone" block: **remove the sandbags** at house corners (military read). Same corner rule, probability
0.4 → **0.6**, item by `hash`: woodpile 45 % (2.0 × 0.6 × 0.6, logs as 3 rows of 0.18 boxes `0x7a5a3a`/`0x8a6a48`, ends
`0xc8a878`), water butt 30 % (cylinder Ø0.6 × 0.9, 8 sides, `0x3f5a3a`, against the wall), 2 bins 25 % (Ø0.5 × 0.9,
`0x4a5a4a`, lids `0x3a4a3a`). Scorch marks: keep, probability 0.6 → **0.35** (story, not a war zone).
Laundry lines: 9 total (Old Town south bank 3, one per farm 3, Lakeside 1, lone houses 2): 2 posts 0.08 × 2.0, line
0.03 thick, 5-6 m, 5 cloths 0.5 × 0.6 × 0.02 hanging, colours `0xf4efe0 0x8fb3d9 0xe0a890 0xd9cf8a 0xb9a3d9`.
Plus pieces g-i of item 4.

### 9. Per-place story dressing (later; one merged batch)

All of it: code boxes and low-segment cylinders with `paint()` vertex colours on **one** material
`dressMat = MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })`, added to the props
`statics` group → `mergeStatic(…, { chunk: 88, bake: true })`. Cost: **+1 call per 88 m chunk drawn** (2-4 on the
ground, ≤ 9 from the plane) plus shadow pass for pieces ≥ 0.4 m; **≤ 25k triangles** total. Every piece obeys R1-R4.

| Place | Story | Pieces (max count) |
|---|---|---|
| Old Town | Market day packed half away | bunting 4 (item 6); spilled produce crates 4 (0.35 m, fruit `0xd9a04a 0x8aa040 0xc8603a`, one tipped) by the tents; bins 6 in pairs at alley mouths, against walls; bicycles 4 leaning on walls (wheels: torus r 0.33, tube 0.025, 3×10 segs); laundry 3 (item 8) |
| Container Yard | Shift stopped mid-load | bollards on the quay edge every 6 m (~20, Ø0.35 × 0.5, `0x3f4650`); pallet stacks 4 (1.2 × 0.15 × 1.0, 1-3 high) against containers; oil drums 6 in 2 clusters against containers (`0x3a5a7a 0x8a4a3a`); rope coils 2; white lane lines on the paving in `paintTerrain` (0.15 m) |
| The Campus | Launch party left mid-toast | benches 4 facing the plaza (0.45 m); bike rack + 3 bikes by the gatehouse; office chairs 3 on the plaza, one on its side; folding table 0.75 m against a pavilion wall with 6 cups; 3 balloons (Ø0.35, `0xf4efe0 0x3a8f8a 0x9a8fc0`, string to the table, 1.6 m); a laptop on one bench (0.35 × 0.02 × 0.25, `0x2b2d30`, screen face `0x9fd3f5`, the only dev wink) |
| Truck Stop | Everyone filled up and drove | tyre stacks 4 against the shop wall (3 tyres, 0.75 m); packed cars 2 (item 6); housekeeping cart 1 against motel room 2 (0.9 m); ice machine 1 against room 4 (1.0 m); bins 2 |
| Railyard | Cargo spilled, no one came back | sleeper stacks 3 (2.4 × 0.4 × 1.2); drums 4; hand cart 1 on yard track y 101 at x 95 (0.6 m); loose boxes 5 (0.4 m) beside the tipped boxcar |
| Hollis / Redgate / Southfield | Harvest stopped | square hay bales 6 per farm in 2 low rows by the barn (1.0 × 0.45 × 0.5, `0xd9c27a`, never round bales: they read as cover); wheelbarrow 1; milk churns 3 against the farmhouse; water trough 1 by the fence (0.5 m); laundry 1 |
| Windmill Hill | Milling day | flour sacks 4 against the tower base (`0xe4dccb`); apple crates 6 along the orchard lanes (0.3 m); ladders 2 leaning on orchard trees |
| Lakeside | Picnic abandoned | upturned canoe 1 on the shore by the boathouse (4.2 × 0.35 × 0.8, `0x2f6a7a`); picnic blanket 2 × 1.6 flat (checks `0xd9cfb8`/`0x8a4a3a`) + basket; life ring on the boathouse wall (`0xe0dcd0` with `0xe07a5f` bands); laundry 1 |
| Deadwood | Hunters' camp | woodpiles 2 against the lodge; chopping block + axe 1 |
| Mast Hill | Crew left mid-job | cable drums 2 (Ø0.9) against the control house; generator box 1 against a wall (1.2 × 0.8 × 0.7, `0x5a6a5a`); traffic cones 3 at the gates (`0xe0dcd0` with a `0xe07a5f` band, 0.5 m) |
| Quarry | Site closed | cones 6; drums 2; wheelbarrow 1; low rubble piles 2 (0.4 m, gravel colour) |
| Lone houses (8) | Someone lived here | mailbox at the lane side (post 0.08 × 1.1 + box); woodpile or water butt (item 8); 50 %: garden bed 2 × 1 × 0.15 (`0x5a4030`) with 6 leaf clumps |

### 10. Crouch-gated concealment in tall grass (when crouch on G lands)

With item 1 a standing fighter shows chest-up in tall grass. Then he must also be targetable, or the screen lies.
Rule: in `step.ts` line 348 (`inPlant` concealment), an `h` tile conceals **only while crouched**; `b` bushes and `c`
crops unchanged. Bots that seek a plant to hide in (`bot-params.ts` ~470) crouch when they pick an `h` tile. Until crouch
ships, `h` keeps today's rule (same compromise bushes already make). Grass height in item 1 was chosen so a crouched
fighter is mostly covered; if crouch height turns out above 1.15 m, raise core Y scale to `2.1 + r()*0.4`.

### 11. Reeds, tyre tracks, desire paths (later)

- Reeds: `g` tiles 4-adjacent to river `o`, outside the town rectangles and more than 4 tiles from any crossing axis,
  on 35 % of them (`hash`): one clump = 9 blades 0.8-1.1 m (`0x7a8a48` → tips `0xa89a5a`) + 2 cattail heads
  (0.05 × 0.2, `0x5a3a24`). One chunked kind, +1 call, no tile change.
- Tyre tracks in `paintTerrain`: 6, from Mill Road and River Road into the three farm fields and to the Lakeside
  boathouse: two strips 0.35 m wide, 1.6 m apart, 12-20 m, gentle curve, `DIRT_DARK` weight 0.35.
- Door paths: item 3 second bullet.

### 12. Earlier-round traces (later)

- One car prop (on Route 1 north of Windmill Hill, by seed) drawn **burnt**: body `0x2b2722`, panels mixed with
  `0x6a3a24` rust, no glass, tyres gone (wheels 0.1 lower), a scorch decal under it. Collision unchanged.
- 4 of the item 9 bins drawn tipped over with a 0.6 m litter spill (flat).
- Nothing else: no bullet-hole decals, no broken fences (they still block, a broken look would lie).

## 3. The 1-day slice (biggest visible change)

In this order, each shippable alone:
1. Item 1 (map rule + tall grass render), with the map test. ~1.5 h
2. Item 2 (edges, two flower clumps, leaf clumps). ~2 h
3. Item 3 apron and sidewalk only. ~1 h
4. Item 5 palettes, ridge caps, chimneys. ~1 h
5. Item 4 pieces a-f (one instanced mesh). ~2.5 h
6. Item 6 bunting and packed cars (start `dressMat` + the batch here). ~1.5 h
7. Item 7 light and grade. ~0.5 h

Expected read after the slice: from the plane, places sit in worn ground with their own roof colours, meadows are
patches with flowered edges, the Market Square has bunting. At shoulder height, houses have bases, frames, steps and
chimneys in their district's colours, and you see across a meadow.

**Acceptance shots** (1280x720 shoulder and 390x844 top-down, before/after pairs, into
`~/.agents-know/personal/feedback4/shots/lcs-atmosphere/`): inside the 81,21 meadow; Route bridge looking into Old Town;
Market Square from 40 m canopy; Truck Stop motel row; a farm; Lakeside cabins; the plane over the centre. Plus `?perf`
numbers for the map-v2 fixed views against the budgets above, the `h` tile count, and the tall-grass instance count.

## 4. Dressing palette (all new objects draw from this)

Neutrals `0xf4efe0 0xe4dccb 0xa8a196 0x5a4a3a 0x3a3430 0x2b2d30`; woods `0x7a5a3a 0x8a6a48 0xc8a878`;
muted colours `0x3a8f8a teal, 0xd9a04a ochre, 0x9a8fc0 lilac, 0x8fb3d9 sky, 0xe07a5f coral, 0x3a5a7a navy,
0x3f5a3a bottle green, 0x8a4a3a brick`. Coral and ochre only in pieces under 1 m².

## 5. What NOT to do

- Do not move places, roads, buildings, loot or cover tiles; only `h` → `g` changes the map (item 1).
- No military dressing (section 1 list). No text, logos or readable signs in the world.
- No tall decor without collision (R1); no round hay bales, no stacked crates as decor.
- No new GLB or image texture; no per-object materials (everything instanced or merged).
- No uniform sprinkle: flowers, plants and props come in drifts and clusters tied to a place or a rule.
- No tall grass in towns, in front of doors or along roads; never a single meadow larger than 16 tiles.
- No darker, moodier grade: this is a bright summer valley; the change is warmth and depth, not gloom.
- Do not touch landmark colours, the Deadline wall, loot glows or the door "way in" tape and lamps.

## 6. Limitations

- Fresh shots: two meadow views and one Old Town view (shoulder camera) from `npm run dev:portal` while engineering was
  editing the same tree; the run reloaded mid-capture, so I did not get the Truck Stop or farm views. Everything else is
  from the 2026-11-22 shot sets and the code.
- Crouch height is unknown to me; item 10's grass numbers assume ~1.1 m crouched.
- No phone hardware; cost figures are estimates from instance and piece counts, to be confirmed with `?perf`.
- No external research this pass: the direction follows map-v2's research and the project's own rules.
