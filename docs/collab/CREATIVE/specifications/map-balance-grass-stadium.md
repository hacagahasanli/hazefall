# Map balance: tall grass, plain ground, and The Pitch (R-018)

Owner: Creative Director. Status: ready for engineering (2026-11-24). Builds on `map-v2.md` (sections 5 and 8 still apply).

All coordinates are **tiles in the plain frame** (0..119, as `MAP[y][x]`, `BUILDINGS`, `PLACES`). A tile is 2 m.
Read from the live generator (`buildMap` in `src/game/sim/constants.ts`, 44 buildings) and `buildGrass` /
`buildTallGrass` / the ground painter in `src/game/render/nature.ts`.

## 1. What is wrong today (measured)

| Measure | Now | Problem |
|---|---|---|
| Tiles that get lawn tufts (`g`, `t`, `b`) | 8,681 of 14,400 (60 %), 5-14 tufts each | Grass blades on almost everything, including every alley and yard in town |
| Old Town tiles with tufts | 491 of 1,295 (38 %) | The town reads as a meadow with houses dropped in it (Reis: "town full of small grass") |
| Tall grass `h` | 721 tiles (5.0 %) | 48 random ellipses placed anywhere, 59 tiles of them inside Old Town; few where you actually cross open ground toward a hot place |
| Plain ground | none: every open tile is either tufted lawn, paving or dirt path | No calm ground, so nothing frames the places and the tall grass does not stand out |

Goal: **three ground grades that each mean something.** Tall grass = cover on the approaches. Lawn tufts = open
countryside. Plain ground = where people live and walk (town, yards, verges) and big bald spots in the fields.

## 2. Tall grass (`h`)

Keep both existing random meadow loops (the old-map 14 and the new-frame 34): they are fine filler and changing them
reshuffles the random stream. Add one **fixed pass with no random numbers**, placed right after the Mast Hill block
(after line `for (const [x, y] of [[28, 8], ...]) ... set(x, y, 'k')`) and before the door-clearing pass.

### 2a. Designed patches

Ellipse test per tile: `((x-cx)/rx)^2 + ((y-cy)/ry)^2 <= 1 + (tileHash(x, y, 7) - 0.5) * 0.5`, only on `g` tiles,
never where `nearHouse` is set (3 tiles round any building). Counts are what the test gives on today's map.

| ID | Centre (cx, cy) | rx x ry | ~tiles | Why it is there |
|---|---|---|---|---|
| T1 | 38, 25 | 6 x 3.5 | 61 | North field between Mast Hill and the orchard: the long open walk to Route 1 |
| T2 | 73, 6 | 6 x 3.5 | 62 | East of Route 1 at the top of the map: cover for the Windmill Hill / Deadwood rotation |
| T3 | 66, 37 | 3.5 x 2.5 | 28 | Between Redgate Farm and Old Town's north edge: the approach into town from the north-east |
| T4 | 48, 22 | 4 x 2.5 | 18 | South of the orchard, west of Route 1 |
| T5 | 24, 40 | 3.5 x 2.5 | 18 | North-west of the West lane bridge: the approach to the river from Hollis Farm |
| T6 | 6, 90 | 3 x 2.5 | 21 | Between Lakeside and the Campus, by the Lake lane |
| T7 | 12, 115 | 4 x 1.5 | 12 | South edge below the Campus (a flank along the tree line) |
| T8 | 30, 115 | 4 x 1.5 | 11 | Same strip, east half |
| T9 | 70, 114 | 4 x 2 | 23 | South of the Truck Stop motel row, between it and the Railyard main line |
| T10 | 80, 115 | 4 x 1.5 | 13 | Same strip, continues T9 east |
| T11 | 112, 87 | 3 x 2 | 17 | East edge south of River Road (the Weir side) |

Total about 284 tiles.

### 2b. River reed belts

For every column `x` from 3 to 116, skip it if it is within 4 columns of a bridge deck (`RIVER.bridges`: 9-10, 31-32,
59-62, 86-87, 113-115, so skip `bx-4 .. bx+bw+3`), inside Old Town (44-78) or inside the paved Container Yard (89-113).
On each bank, take the first `g` tile next to water (north bank: `MAP[y+1][x] === 'o'`; south bank: `MAP[y-1][x] === 'o'`):

- set it to `h` if `tileHash(x, y, 11) < 0.7` and not `nearHouse`;
- then also the tile one step further from the water if `tileHash(x, y, 12) < 0.35` and it is `g`.

About 34 tiles: broken 1-2 tile belts, so the riverbank reads from the plane as a ragged straw edge, and a swimmer has
somewhere to come out. Crossings stay open (the bridge rocks remain the only cover there, by design).

### 2c. Out of town

Inside the Old Town rectangle (x 44-78, y 42-78), turn every `h` back into `g` **unless** it is within 3 tiles of water
(the bank strips at rows 53-55 and 61-63 by the Route 1 bridge stay). About 45 tiles go. Towns have yards, not meadows.

### 2d. Never tall grass

Market Square, any paved tile, The Pitch footprint plus its 1-tile margin (section 4), the South field rows 87-89
x 62-105 (kept clear for the duel test), and the bridge-end rock spots.

**Target after 2a-2d: 950-1,050 `h` tiles (6.6-7.3 %, up from 5.0 %), with at least 60 % of the new ones outside every
`PLACES` rectangle.** No change to how `h` hides you or how `buildTallGrass` draws it.

## 3. Lawn tufts and plain ground (renderer only, no sim change)

Change `buildGrass` so the tuft count per tile is `round((5 + lush * 9) * k)` with `k` from this table (first rule
that matches wins). Tiles with `k = 0` are **plain ground**.

| Where | k | What it looks like |
|---|---|---|
| The Pitch rectangle (x 63-75, y 67-80) | 0 | Mown pitch and cinder track (section 4.6) |
| Within 2 tiles of any building's footprint, anywhere on the map | 0 | Trodden yard: plain ground, with the earth tint below |
| Inside a `PLACES` rectangle of tier 3 (Old Town, Campus, Mast Hill; Container Yard is paved anyway) and more than 2 tiles from a building | 0.25, and only where `lush > 0.55` | A few garden clumps, otherwise plain |
| Inside any other `PLACES` rectangle (farms, Truck Stop, Railyard, Quarry, Lakeside, Windmill Hill, Deadwood) | 0.6 | Thinner lawn |
| Within 1.5 m of a route's edge (`routeDistance` 0.1-1.5) | 0.3 | Mown verge |
| A tile 4-adjacent to `h` | 1 | Lawn grows up into the meadow, so the edge is soft |
| Open fields, bald spots: `fbm(tx * 0.05 + 70, ty * 0.05 + 31, 3) < 0.33` | 0 | Short turf in big soft shapes (about 15-20 % of the fields) |
| Tree `t` and bush `b` tiles | 0.5 | Shade under crowns |
| Everything else | 1 | As today |

**Earth tint for plain ground in places.** In the ground painter, on `g` tiles inside any `PLACES` rectangle that are
within 2 tiles of a building (the same test as the k = 0 row), mix the grass colour toward packed earth
`[138, 118, 86]` (#8a7656) by 0.45, plus 0.2 more on tiles that have building walls within 2 tiles on two opposite sides
(alleys). Use the existing edge wobble `e` so it never shows tile squares. The fields' bald spots get **no** tint (they
stay green short turf).

Targets: tufted tiles from 8,681 to about 6,000 (-30 % instances, a performance win too); Old Town tufted tiles from 491
to at most 120 effective (sum of `k`). From the plane the town should read as roofs on a buff-and-green ground, the
fields as green with straw meadows, and the two must be visibly different.

## 4. The Pitch: a small stadium on the south bank of Old Town

The town's football ground, empty now: two stands, a mown pitch with faded lines, floodlights. Original, no real venue;
name **The Pitch** (a plain place name that also nods to the dev story: a startup pitch).

### 4.1 Where, and what it replaces

Old Town south bank, east of Route 1, between the river and River Road. **Footprint x 63-75, y 67-80
(13 x 14 tiles, 26 x 28 m)**, plus a 1-tile margin x 62 / 76, y 66 / 81.

It replaces **four houses** (index in today's `BUILDINGS`, x0, y0, w x h):

| # | x0, y0 | w x h |
|---|---|---|
| 40 | 65, 66 | 5 x 4 |
| 9 | 64, 71 | 6 x 6 |
| 10 | 71, 71 | 5 x 5 |
| 35 | 72, 77 | 5 x 4 |

Building 36 (77, 68, 4 x 5) **stays**: its west wall (x 77) is solid and its doors are on its north and south sides, so
column 76 is a 1-tile alley between it and the stadium's east wall. Loot removed with the four houses: 9 `l` and 1 `r`;
The Pitch puts back 9 `s` and 3 `r` (section 4.4). `BUILDINGS` goes 44 -> 40 (the map test's lower bound is 40: keep it
at 40, do not raise it).

### 4.2 How to build it (no random numbers)

One late pass in `buildMap`, after the "No house stands on a road" block and **before** the reachability flood:

1. Remove every building whose footprint intersects x 62-76, y 66-81 (exactly the four above). Their tiles become `g`.
2. Stamp the grid in 4.3 over x 62-76, y 66-81 (margin tiles too). Any tile the grid marks `.` (keep) is left as it is.
3. Push one prop `{ kind: 'stadium', x0: 63, y0: 67, w: 13, h: 14, seed: 0.5 }` (new kind; decor only, it draws all the
   `v` tiles of the stadium as one model, like `river` covers its tiles).
4. Export `STADIUM = { x0: 63, y0: 67, w: 13, h: 14, pitch: { x0: 67, y0: 69, w: 5, h: 10 } }` beside `MARKET_SQUARE`,
   for the renderer and tests.
5. Add `['The Pitch', 63, 67, 76, 81]` to `PLACES` **before** `'Old Town'` (`placeAt` keeps the first place of the top tier,
   so the HUD shows The Pitch inside it and Old Town around it). `PLACE_TIER['The Pitch'] = 3`. Bot landing cap: 2.

Because the pass draws no random numbers, the rest of the map comes out exactly as today.

### 4.3 Tile grid

Columns 62-76 left to right, rows 66-81 top to bottom. Codes are the existing ones; `G` = `g` pitch grass (tufts off),
`.` = leave the tile as it is.

```
      666666667777777
      234567890123456    (x = 62..76)
 66   ..k............    margin: keep the bridge-end rock at 64,66; clear t/b/h/r/f to g
 67   gvvvffaaaffvvvg    north end: corners + stand ends, steel railing, north gate 68-70
 68   gvvvpppspppvvvg    track; loot 69,68
 69   gvvvpGGGGGpvvvg    north goal (decor) over 68-70
 70   gvvvDGrsGGpvvvg    dugout 66,70; crate 68,70; penalty-spot loot 69,70
 71   gvvvDGGGRRpvvvg    dugout 66,71; pitch roller 70-71,71
 72   avvvsGGGGGpvvvg    gate apron 62,72; loot 66,72
 73   aaaaaGGsGGrvvvg    west gate tunnel 63-65, mouth 66; centre loot 69,73; crate 72,73
 74   aaasaGGsGGpvvvg    tunnel loot 65,74; centre loot 69,74
 75   avvvsCGGGGpvvvg    loot 66,75; line-marker cart 67,75
 76   gvvvDGGGGGpvvvg    dugout 66,76
 77   gvvvDGGsrGpvvvg    dugout 66,77; penalty-spot loot 69,77; crate 70,77
 78   gvvvpGGGGGpvvvg    south goal (decor) over 68-70
 79   gvvvpppspppvvvg    track; loot 69,79
 80   gvvvffaaaffvvvg    south end, south gate 68-70
 81   gggggpppppggggg    margin; path 67-71 runs on to River Road (row 82)
```

Legend for the letters that are not tile codes: `D` dugout, `R` roller, `C` cart are all `v` (block you and bullets);
`G` is `g`. So in tiles: outer wall x 63 and 75 plus rows 67/80 at x 63-65 and 73-75 = `v`; west stand x 64-65 and
east stand x 73-74, rows 68-79 = `v` (except the tunnel rows 73-74 at x 63-65 = `a`); end railings x 66-67 and 71-72 on
rows 67 and 80 = `f`; gates x 68-70 on rows 67 and 80 = `a`; track = `p`; pitch x 67-71, y 69-78 = `g`.

Checks the grid already meets: three ways in (west gate from Route 1, north gate from the river bank, south gate from
River Road), so no dead end; the longest clear line inside is 24 m along the pitch (town rule is 30 m); two hard-cover
pieces within 6 m of the centre spot (roller at 2.9 tiles, cart at 2.5 tiles); 9 recognisable fight points (2 dugouts,
roller, cart, 3 crates, tunnel, 2 end gates). The end railings stop you but not bullets, so the pitch can be shot into
from the river bank and from River Road: it is a bowl you can be watched in, not a safe room.

### 4.4 Loot

9 outdoor `s` (tier 3, as Old Town): centre spot 69,73 and 69,74; penalty spots 69,70 and 69,77; track by the goals
69,68 and 69,79; tunnel 65,74; by the dugouts 66,72 and 66,75. 3 crates `r`: 68,70, 72,73, 70,77. The best loot is on the
open centre spot, on purpose: the fight is whether you run onto the pitch.

### 4.5 What it is made of (the `stadium` prop)

| Part | Tiles | Size | Look |
|---|---|---|---|
| Outer wall | x 63 and 75, ends of rows 67 / 80 | 3.6 m high, full tile | Rendered blockwork `#e6dcc6`, a 0.35 m violet band at the top `#7a5cd0`, a darker plinth 0.4 m `#b9ae97` |
| West gate | 63-65 x 73-74 | 2 tiles wide | Two square pillars 0.6 m, a lintel at 3.9 m, and a board 4 x 0.8 m above it at 3.9-4.7 m facing west, violet with cream `#efe6d2` letters **THE PITCH** in the game's display font. Floor of the tunnel: concrete. Open above (no roof over the tunnel) |
| West stand (main) | 64-65 x 68-79 | 4 m deep | Front parapet 1.1 m (concrete `#cdc4b0`), then 3 steps of seating rising to 3.0 m at the back; seats violet `#7a5cd0`, every 6th seat cream `#efe6d2` and about 1 in 12 missing (it is an old ground). Flat cantilever roof at 4.6 m over x 63-65 only (never over the track), pale `#d6d2c8` with a violet fascia |
| East stand | 73-74 x 68-79 | 4 m deep | Same rake and seats, **no roof**: from above it is the violet strip |
| End railings | rows 67 / 80, x 66-67 and 71-72 | 1.1 m | Galvanised steel `#9aa3a8`: top rail and vertical bars every 0.25 m. Must not use the farm fence model |
| End gates | rows 67 / 80, x 68-70 | 3 tiles | Two steel posts 1.6 m at the gate sides, gate leaves folded open against the railing (decor) |
| Dugouts | 66 x 70-71 and 66 x 76-77 | 1 x 2 tiles, 2.0 m | Dark shell `#4a4f57` curving over a cream bench, open to the pitch |
| Pitch roller | 70-71 x 71 | 2 x 1 tiles | Iron drum `#3b3f44` Ø1.1 m, cream handle frame |
| Line-marker cart | 67 x 75 | 1 tile | Small white `#f0ede4` cart, grey wheels, 0.9 m |
| Goals (decor, no collision) | x 68-70 on rows 69 and 78 | 5 m wide x 2.0 m x 1.2 m deep | White `#f4f1e8` posts and bar, the net as light grey lines; set on the goal line, mouth facing the centre |
| Floodlights (decor, no collision) | stand corners 64,68 / 64,79 / 74,68 / 74,79 | 11 m | Grey pole 0.35 m from the stand corner; head 1.6 x 1.0 m tilted 30 degrees down toward the centre spot, 6 cream lamp squares. Lamps unlit by day (emissive 0). Cast shadows |

Rules: one material (vertex colours) for the whole stadium plus the existing emissive set if the lamps ever light; at
most **+2 draw calls and 8k triangles**. Violet `#7a5cd0` is the stadium's accent: no other landmark uses it, and keep
it off cars and containers within 20 m. The floodlights join the tall-landmark fade over the local player (F-004 rule).

### 4.6 Ground inside (ground painter)

- **Pitch** (x 67-71, y 69-78, world x 134-144, y 138-158): mown stripes, 2 m bands across the width,
  alternating `#5fae3e` and `#4f9a35` (`band = floor((wy - 138) / 2) % 2`). No meadow mix, no dry spots, no tufts.
- **Lines**, faded white `#ece8da` at 85 %, 0.12 m wide, inset 0.3 m: touchlines x 134.3 and 143.7, goal lines y 138.3 and
  157.7, halfway line y 148, centre circle r 2.0 m at (139, 148), a goal box 4 m wide x 1.6 m deep at each end centred
  on x 139, penalty spots (0.25 m discs) at (139, 141) and (139, 155). Break each line in 2-3 short gaps (worn).
- **Track** (`p` tiles inside the footprint): cinder `#9a5b45` mixed with `#7d4836` by `fbm` instead of the path dirt.
- **Tunnel, gates, apron**: concrete `#b8b2a6` (lighter than asphalt so the entrances read).

### 4.7 How it reads

- **From the plane and canopy:** in a town of brown and grey roofs, a bright **striped green rectangle with white lines**
  inside a **rust ring**, framed by a **violet strip** (east stand) and a **pale bar** (west roof), with four long
  floodlight shadows. Nothing else on the map has that shape. It sits right beside Route 1 and the main bridge, so it
  is also the obvious "land south of the bridge" callout.
- **On foot from Route 1 / the bridge:** the floodlight masts and the main-stand roof show over the town roofs; the
  west gate with its violet board faces the road directly across a short concrete apron.
- **From the river bank:** through the north railing you see the whole pitch and anyone on it.
- **Inside:** stand fronts loom on both long sides (parapet at chest height, seats rising behind), the dugouts and the
  roller are the only things to hide behind in the middle. Quiet and empty: no crowd sound, no banners.

## 5. Acceptance criteria

1. Tile counter: `h` between 950 and 1,050; no `h` in Old Town except within 3 tiles of water; none inside x 62-76, y 66-81.
2. `BUILDINGS.length === 40`; none of them intersects x 62-76, y 66-81; building 36 at 77,68 still there.
3. `MAP` rows 67-80, columns 62-76 equal the grid in 4.3 (a test can hold the 16 strings).
4. Everything outside the margin x 62-76, y 66-81 and outside the tall-grass and town-`h` changes is identical to today's
   `MAP` (diff test against a stored snapshot).
5. `placeAt` at the centre spot (139, 148 m) returns `The Pitch`; at (124, 140 m) on Route 1 returns `Old Town`.
6. Reachability: every tile of the pitch and track is reachable from Route 1 (flood from 60,3), through each of the three
   gates on its own (block the other two in the test).
7. Grass instance count from `buildGrass` at least 25 % lower than today; zero tufts inside the stadium rectangle and
   within 2 tiles of any building.
8. Screenshots for CD review: (a) from the plane over Old Town at the usual cruise height, (b) canopy at ~40 m south of the
   bridge, (c) on foot at the west gate from Route 1, (d) on the centre spot looking north, (e) an Old Town alley at
   shoulder height, (f) T1 or T2 from the ground. 1216x684.

## 6. Must not change

The old map's random streams and anything they place (only the late passes above touch the grid); the river, bridges,
bridge rocks, roads and their routes; the Market Square and water tower; how tall grass hides you; the South field strip
rows 87-89 x 62-105; Mast Hill's "nothing taller than grass" ring (patches T1 and T5 are outside it or allowed blobs).
