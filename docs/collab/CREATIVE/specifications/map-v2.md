# Map v2: a valley you can name from the canopy

Owner: Creative Director. Date: 2026-11-22. Request: R-008. Layout drawing: `CREATIVE/levels/map-v2.svg` (true tile
scale, 5 px per tile). Sources: Reis's visual quality brief (feedback4/spec-lcs-visual-quality.md),
opportunity-research/sprint-2026-11/br-proposal.md section 3, `sim/constants.ts` buildMap, `bot-params.ts` landingPlan,
`render/props.ts`, `render/mapImage.ts`, docs/ROOFTOPS.md, basic-launch-kpi.md.

## 1. What I looked at and what is wrong today

Verified (dist/portal, headless Chromium 1280x720, one round from the plane to the ground; map dumped from `buildMap`):

- **Size and fill.** 88 x 88 tiles (176 m). 26 buildings (2 barns), 104 loot spots (66 indoor, 25 outdoor, 13 crates).
  51 % of all tiles are plain grass `g`. Only props: 28 containers, 6 cars, 3 tents, 1 windmill.
- **From the plane** the map reads as one evenly sprinkled lawn: houses of similar size scattered at similar spacing.
  The windmill is the only thing you could name from the air; the Container Yard reads as a grey strip on the east edge.
  Old Town is a loose 4 x 4 grid, not a town: no street, no square, no centre.
- **Under the canopy** (44 m and lower) there is nothing taller than a roof to steer toward. Height does not read
  top-down anyway; what reads is the shape and colour seen from above and the shadow it throws.
- **On the ground** the place names exist only in code (`DISTRICTS`) and on the home screen. Nothing tells you where you
  are, so a player never learns the map.
- **Pacing.** With 20 players on 176 m, the bot-sim median round is ~2:50 (LOG 2026-11-22). The target is 4-6 min.
- **Perf baseline (`?perf`, same machine, portal build):** low tier: canopy 215 calls / 377k tris, ground 128-333 calls /
  230-502k tris; high tier: canopy 356 / 731k, ground 197-488 / 452-925k. All at 60 fps on an M-series Mac. No phone
  measured.

Research (verified, Epic's Fortnite level design guide, dev.epicgames.com): make each area distinct so players can call it
by name; landmarks that are "easily identifiable" and "seen from a distance"; avoid "only a single way in or out";
"three to five points of engagement" per fight space; "too much visibility can incite combat at unfun ranges". Epic's
2018 map update notes (via search summary, page not fetchable) add a POI where density was too low and split the map
into biomes readable from the bus. My interpretation: for a top-down game, "seen from a distance" means **seen from
above**. Every landmark below is designed by its silhouette from above, its colour and its shadow, not its height alone.

## 2. Direction

**One valley, one river, one road, thirteen places you can name.** A river runs west to east through the middle;
Route 1 runs north to south across it. Where they cross is Old Town. Each quadrant has one hot place, some mid farms
and a quiet edge. Every place has one landmark with its own colour and a top-view shape that nothing else uses, so from
the plane you can say "I'm going to the yellow cranes" or "the green ring".

Identity rules (keep the game's look; this is the countryside of the current map grown up, not a new genre):
- Low-poly, flat-shaded, the existing palette (`palette.ts`). No new GLB files. Landmarks are code-made from boxes and
  cylinders, merged into the static mesh like the windmill.
- One accent colour per landmark, used nowhere else on the map at that size. Colours come from the palette: red
  `0xe23d5c`, gold `0xffc93c`, green `0x2ec27e`, orange `0xf2542d`, blue `0x3e7bfa`.
- The dev theme stays a light touch: one place, The Campus, is where the developers worked. Everything else is a real
  valley. No text on signs (rule from the covers spec and CrazyGames: no copy in the world).

## 3. Scale and grid

- **120 x 120 tiles of 2 m = 240 m.** `SIZE = 120`. Border tree ring stays 2 tiles. 20 players: 2,880 m² each (1.86x
  today). Run speed ~6.3 m/s: edge to edge 38 s, corner to corner 54 s.
- **The current map is kept and shifted +16 tiles** in x and y (today's `O = 12` becomes 28 for the old heart; every
  tile coordinate of today's places gets +16). The river, the three bridges, Old Town, the farms, the Quarry, the
  Container Yard, the Truck Stop, Lakeside and the windmill move with it unchanged in kind. The new 16-tile ring and
  corners carry the new places. This keeps slice 2 a scaffold, not a rewrite.
- River: `riverCentre(x) = 60 + sin((x - 16) / 7) * 2 + sin((x - 16) / 3.1) * 0.5`, half width 3.2, from x 0 to 119.

### Overview (1 character = 4 x 4 tiles = 8 m)

```
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT    T  tree ring (edge)
T..............=.............T    =  asphalt (Route 1, Campus Drive)
T..M.h.........=........L....T    -  dirt road        :  rail
T..h.h.........=.............T    ~  river            #  crossing
T..............=.........h...T    h  building         B  barn
T..............*.h...........T    M  radio mast (Mast Hill)
T..............=.....h.....h.T    *  windmill (Windmill Hill)
T..---h---h---------------...T    L  fire lookout (Deadwood)
T.....h..B..h..=.....-.......T    W  water tower (Old Town)
T.-....-.......=...B.h.......T    V  conveyor (Quarry)
T.-....-.......=.....-.h....-T    C  twin cranes (Container Yard)
T.-..h.-...h.h.=.hh..-......-T    H  HQ tower (The Campus)
T.-....-...h.h.W.hh..-......-T    S  pole sign (Truck Stop)
Th-....-...h...=..h.hV..C...-T    G  signal gantry (Railyard)
T~#~...-..~~~~~=....~#~~~~~.-T
T.-.~~~-#~....~#~~~~~-....~~#T
T.-....-...h.h.=.hh..-...C..-T
T.-B...-.......=.....-......-T
T.-....-...h.h.=.hh..-......-T
T.-....-.B.h...=.....-.h....-T
T.-----------------------...-T
T.-..h.........=.....-.......T
T..............S.........h...T
T...h...h..h...=..h..........T
T.h.......======..........B..T
T.....H.......hhhh..::G::::::T
T..............=....:::::::::T
T...h.h.h.::::::::::::::::::hT
T..............=......h......T
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```

The SVG is the exact reference (place rectangles, roads, crossings, landmark points). Building blocks in it are
indicative: engineering places houses with the existing `free()` / `house()` inside each place rectangle.

## 4. The places

Tile rectangles are `x0,y0 - x1,y1` (end exclusive). Loot spots counted before the 70 % spawn roll. Tier = `PLACE_TIER`.

| # | Place | Rect | Tier | Buildings | Loot spots | Landmark | Why you go there |
|---|---|---|---|---|---|---|---|
| 1 | **Old Town** | 44,42 - 79,79 | 3 | 18 houses (10 north bank, 8 south) | ~60 | Water tower | The hot drop. Most loot, close fights in alleys, the Route bridge between the two banks |
| 2 | **Container Yard** | 89,36 - 113,83 | 3 | 2 port offices + 40 containers | ~28 | Twin cranes | Tier-3 loot in two open squares you must enter; tight lanes; the Weir as a back door |
| 3 | **The Campus** | 10,90 - 41,115 | 3 | 4 office pavilions, gatehouse, HQ tower (solid) | ~22 | HQ tower with green ring | Second hot drop, far from Old Town: glass offices round a plaza, the dev story |
| 4 | **Mast Hill** | 4,4 - 27,25 | 3 | control house, 2 sheds in a fence | ~10 | Radio mast | Few but best items (sniper, Vest III) on an exposed hill: risky by exposure, not by crowd |
| 5 | **Quarry** | 76,48 - 89,57 | 2 | site office | ~8 | Conveyor | Rock cover on the north bank between Old Town and the Yard |
| 6 | **Truck Stop** | 52,90 - 79,105 | 2 | shop + 4-room motel row | ~18 | Pole sign | Mid loot on Route 1 south; motel rooms are quick to clear |
| 7 | **Railyard** | 80,93 - 117,117 | 2 | engine shed (barn), goods shed, signal box | ~14 | Signal gantry | Long boxcar lanes: rifle and sniper play |
| 8 | **Hollis Farm** (was North Farm) | 34,32 - 51,45 | 2 | barn + farmhouse | ~10 | Red barn | Safe-ish mid loot, crops to hide in |
| 9 | **Redgate Farm** (was East Farm) | 72,34 - 89,47 | 2 | barn + farmhouse | ~10 | Red barn | Same, beside the Quarry and the Yard |
| 10 | **Southfield Farm** (was South Farm) | 33,74 - 50,87 | 2 | barn + farmhouse | ~10 | Red barn | Same, on River Road south-west |
| 11 | **Windmill Hill** | 30,4 - 79,28 | 1 | miller's cottage, 3 tents | ~8 | Windmill (exists) | Quiet north: sheep, orchard rows, a safe start |
| 12 | **Lakeside** | 4,40 - 31,91 | 1 | 4 cabins incl. boathouse | ~14 | Pond + pier + boathouse | Quiet west, the newcomer's landing |
| 13 | **Deadwood** (moves to the NE) | 88,4 - 117,31 | 1 | hunting lodge, hut | ~8 | Fire lookout | Dense conifers for ambush and stealth, little loot |
| - | Lone houses | near roads | 1 | 8 | ~24 | - | Something on the way between places |

Totals: **57 buildings** (today 26), **~244 loot spots** (today 104) = ~170 items at 70 % = 8.5 per player.
Three farms are small farmsteads, so the map reads as ten places plus three farms.

Renames: the three farms get family names so you can say them (`Hollis`, `Redgate`, `Southfield`); they still end with
`Farm`, so the cow herds keep working. `Deadwood` moves its name to the new NE forest; today's forest patch south-east of
Old Town (72,68 - 88,88 after the shift) stays as unnamed woods. `Container Yard` keeps its name (the daily goal uses it).

### Place details

**Old Town (T3).** Today's grid generator, raised to 18 houses with 1-tile alleys. Route 1 is its main street (x 59-62).
New: the **Market Square** on the north bank, 56,47 - 66,53, paved `a`, with the water tower at 63,48 (2 x 2 `v`),
2 market tents (tent prop), 3 crates `r` and 6 outdoor loot `s`. No house inside the square. The square is the only
open space in town: four streets enter it (one per side). South bank: 8 houses, a fenced yard per two houses (existing
40 % rule). The Route bridge (x 59-62) is the town's one big chokepoint; the West and East bridges are 28 tiles away
for anyone who will not take it.

**Container Yard (T3).** Today's yard, plus a **quay** 103,36 - 113,83: paved, two columns of containers (x 104 and
108). The two cranes stand inside today's yard, one on each bank: north crane 3 x 2 at 95,53, south crane at 99,65
(staggered so the booms pass each other), each boom reaching 12 m out over the water toward the other bank. 2 port offices
(6 x 5) at 90,40 and 90,74, each with 3 loot `l`. Container count 40 (28 today). Keep both loot squares.

**The Campus (T3).** The developers' office park. Plaza 19,95 - 31,107 paved `a`. HQ tower: a solid 6 x 6 `v` block at
22,98 (not enterable, it is the landmark). Four office pavilions 8 x 6 at 12,92 / 30,92 / 12,106 / 30,106, each with an
inner wall (house() does this at w >= 7), 4 loot each. Gatehouse 4 x 4 at 23,109. Car park 12,100 - 20,104 with 5 cars.
Bushes `b` in 2 x 1 planters along the plaza edge (cover, never more than 3 in a row). Campus Drive (asphalt) joins it to
Route 1 at y 96. The rail line ends here at a buffer stop (40,110): the commuter halt.

**Mast Hill (T3).** Fence ring 8,7 - 23,20 with 2-tile gates on the south and east sides. Mast at 14,9 (2 x 2 `v`).
Control house 7 x 5 at 9,13, sheds 4 x 4 at 18,13 and 18,8. Ground inside the fence: gravel (`a` tile drawn light, see
landmarks). Outside: no trees within 10 tiles of the fence; 3 tall-grass blobs and 6 rocks only. The approach is the
risk. Loot table tier 3 but only ~10 spots.

**Quarry (T2).** Today's rocks, plus the conveyor (1 x 6 `v` at 86,51) and a gravel cone (decor, no collision), site
office 5 x 4 at 80,53.

**Truck Stop (T2).** Today's car park and shop shifted, cars 6 -> 9. Motel row: 4 small houses 4 x 5 at x 54, 59, 64,
69, y 100, one tile apart (house() with w = 4 makes a single room each). Pole sign at 62,91 (1 x 1 `v`) beside Route 1.

**Railyard (T2).** Main line y 110 from x 40 to the east edge; two yard tracks y 101 and y 105, x 82-117. Track tiles
stay walkable (`p`); the renderer draws ballast and sleepers along the route (new route kind `rail`, see section 9).
Boxcars: the container prop, recoloured rust/brown, 3 x 2, 6-7 per yard track, gaps of 1-4 tiles: lanes 40-60 m long
with breaks to cross. One boxcar tipped on its side at the east end (story prop). Engine shed (barn) 10 x 6 at 100,93,
goods shed 8 x 5 at 84,112, signal box 4 x 4 at 111,106. Signal gantry over both yard tracks at x 90.

**Farms (T2).** Today's `farm()` unchanged, shifted, renamed.

**Windmill Hill (T1).** Today's windmill, tents, campfire and sheep, shifted. New: the orchard 31,5 - 57,16, broadleaf
trees on a 3-tile grid (rows are the identity from above), tall grass between some rows. Miller's cottage 5 x 4 at 68,21.

**Lakeside (T1).** Today's pond, pier and two cabins, plus a cabin at 5,52 and a boathouse 5 x 4 at 12,69 on the pond's
west shore with a short deck into the water. Lake lane (dirt, x 10) runs to the Footbridge.

**Deadwood (T1).** 88,4 - 117,31: 50 % trees, 15 % bushes, two clearings (radius 3 tiles) around the lodge (6 x 5 at
100,14, campfire beside it) and the hut (4 x 4 at 108,24). Fire lookout at 95,8.

**Lone houses (T1).** 8, each within 3 tiles of a road or lane and at least 10 tiles from any place rectangle
(indicative spots in the SVG). No random scatter: a house by a road reads as a real farm or a roadside home; a house in
the middle of a field reads as generated.

## 5. Landmarks (code-made, merged with the statics)

Each one is designed for the view from above first. Height in metres; footprint is the collision `v`.

| Landmark | Footprint | Height | From above | Build |
|---|---|---|---|---|
| Water tower (Old Town) | 2 x 2 | 16 m | **Red disc** (tank lid `0xe23d5c`) on a cream drum, 4 thin legs | Cylinder tank Ø6 m, 8 sides, cone lid; 4 box legs with X braces |
| Twin cranes (Yard) | 3 x 2 each | 20 m | **Two long gold bars** over the water (`0xffc93c`) | Portal: 4 legs, top beam, boom 22 m out over the river, cab box; no collision on the boom |
| Radio mast (Mast Hill) | 2 x 2 | 30 m | Thin, so the read is its **long shadow** plus a **blinking red light** (1 Hz, emissive) and a light gravel pad | Tapered 3-sided lattice from boxes, red/white bands every 5 m, 3 guy lines (thin lines, decor) |
| HQ tower (Campus) | 6 x 6 | 18 m | **Green ring on a blue roof** (`0x2ec27e` ring, `0x3e7bfa` roof) | Box with 4 emissive window bands per side, roof slab, torus-like ring of 12 boxes (flat ring, 8 m across) |
| Windmill (exists) | 2 x 2 | 10 m | White tower, turning sails | Keep |
| Fire lookout (Deadwood) | 2 x 2 | 14 m | **Orange square** in dark green (`0xf2542d` roof) | 4 legs, cabin box, pyramid roof, a zig-zag stair (decor) |
| Pole sign (Truck Stop) | 1 x 1 | 12 m | **Gold disc** with a dark rim | Pole + a round board on top, faced up 20° so the disc shows from above; emissive rim at night palette |
| Signal gantry (Railyard) | 1 x 1 x 2 legs | 7 m | Dark bar across the tracks with a red and a green light | Two legs, a beam, 2 emissive dots |
| Conveyor (Quarry) | 1 x 6 | 0-10 m slope | **Grey diagonal line** ending on a pale gravel cone | Inclined box on 3 legs, cone 5 m |

Rules: no other object on the map uses a landmark's accent colour at more than 1 m² (cars and containers use their
existing palettes; remove red from `CAR_COLORS` only if a red car ever sits within 20 m of the water tower: it does not
need to). Landmarks cast shadows. Each landmark costs at most 1 extra material; all landmarks together at most
**+8 draw calls** and **+20k triangles**.

## 6. Roads, river and crossings

- **Route 1** (asphalt, 2 tiles): x 60, from the north edge to the south edge, through Windmill Hill, Old Town's main
  street, the Route bridge and the Truck Stop. It is the map's spine and the drop's best orientation line.
- **Mill Road** (dirt): y 30, x 12-100: Mast Hill gate - Hollis - Route 1 - Redgate - Deadwood.
- **River Road** (dirt): y 82, x 14-98: Lakeside - Southfield - Route 1 - woods - Container Yard south.
- **Campus Drive** (asphalt): y 96, x 40-60.
- Lanes (dirt, N-S): Lake lane x 10 (y 36-84), West lane x 31 (y 36-80, over the West bridge), East lane x 86 (y 32-86,
  over the East bridge), Quay lane x 113 (y 40-80, over the Weir).
- **Rail**: main line y 110 x 40-117, yard tracks y 101 and 105 x 82-117.
- **Crossings (5)**, west to east: Footbridge x 9 (2 wide, wood), West bridge x 31 (2, wood, exists), Route bridge x 59
  (4, asphalt, exists), East bridge x 86 (2, wood, exists), **The Weir** x 113 (3 wide, concrete deck: `d` tiles drawn
  as grey concrete with a low parapet). Gaps 22-27 tiles: from any bank point the nearest crossing is at most ~14 tiles
  (28 m, under 5 s). Swimming stays possible everywhere.
- Each crossing gets hard cover at both ends: 2 pieces (crate, rock or car) 2-4 tiles off the deck's axis, never on the
  deck. The deck itself is exposed on purpose.

## 7. Drop path and the Deadline

**Plane.** Keep the random line through the centre. Offset `off` from ±0.15 to **±0.12 WORLD** (±29 m) so every route
passes within 60 m of the Market Square. `reach = 0.62 WORLD` and `flight 20 s` stay (the plane flies ~15 m/s instead of
11). The canopy covers about 100 m from the door, so the corners (Mast Hill, Deadwood, Railyard, The Campus are
130-150 m from the centre) are reachable only from routes that pass their side: corners are a choice the route gives
you, which is the point of a quiet edge.

**Bot landing plan** (`landingPlan`): `REACH` 68 -> 90 m; `NEAR_BAND` x1.36 (33-68 m). Per-place caps: Old Town 5,
Container Yard 4, The Campus 4, Mast Hill 2, any tier 2 place 3, any tier 1 place 2, at most 2 per building (exists).
At least 3 places within canopy reach of the route get **no** bot, so a human who wants quiet can find it by looking
for places with no canopies over them.

**Deadline v2 for 240 m** (start radius stays 0.72 WORLD = 173 m). Radii scaled from today's table x1.36 and rounded:

| Phase | Radius | dps |
|---|---|---|
| 1 | 104 | 3 |
| 2 | 78 | 5 |
| 3 | 50 | 8 |
| 4 | 28 | 13 |
| 5 | 12 | 20 |
| 6 | 0 | 35 |

Waits and shrinks: start from today's table and tune with bot-sim to the gates in section 10. The existing guarantees
(edge speed, one-third-of-time rotation, lull breaker, squeeze, rush) stay as they are.

**Centre rules** (in `pickNextCircle`, deterministic: up to 8 draws from `nextRandom`, keep the first that passes,
else the last):
1. The centre tile is not water, not a `v` prop and not a building interior.
2. From phase 3 on, at most 25 % of the new circle's area is water (the river must not eat the late game).
3. From phase 4 on, at least 6 cover tiles (`k r v t # f` or a house wall) lie within 15 m of the centre, and the centre
   is not on a bridge deck or the Weir. Final circles never land in an empty field or on the river.
4. The circle stays at least 12 m inside the edge tree ring (`WORLD - r - 12`), so nobody fights against the wall.

## 8. Sightlines and cover

- **Towns** (Old Town, Campus, Truck Stop): no clear line longer than 30 m (15 tiles) inside the place, except along
  Route 1 (up to 50 m). Every paved open space (square, plaza, car park) has at least 2 hard-cover pieces within 6 m of
  its centre. Every building has 2 doors (exists).
- **Open by design**: Mast Hill approach (60 m with only grass and rocks), the Railyard lanes along the tracks (40-60 m,
  broken every 1-4 boxcars), the river and its crossings. These are where rifles and snipers pay off.
- **Fields**: along every road, no stretch of more than 40 m without a cover element (tree, rock, bush, fence, car)
  within 6 m of the road. Plain grass `g` drops from 51 % to at most 42 % of the tiles.
- **No dead ends**: every place has at least 2 exits; the Mast Hill fence has 2 gates; the Yard squares keep 2 lanes in.
- **Fight spaces**: aim for 3-5 recognisable points of engagement per open space (Epic's guideline): e.g. the Market
  Square has the water tower legs, 2 tents and 3 crates.

## 9. Density and render budgets

| Item | Today | v2 | Note |
|---|---|---|---|
| Buildings | 26 | 57 (max 60) | Frustum culled; merged per material (exists) |
| Loot spots | 104 | ~244 | ~170 items |
| Containers + boxcars | 28 | 40 + 14 | One material per colour, not one per container (today each makes its own) |
| Cars | 6 | 18 | |
| Tents | 3 | 5 | |
| Landmarks | 1 | 9 | +8 calls, +20k tris max |
| Interior trees (`t`, not the ring) | ~140 | ~700 | Chunked instances (exists): no extra calls |
| Map gen time | - | <= 150 ms | |
| New GLB / textures | - | 0 | Code-made geometry only |

**Frame budgets** (measure with `?perf&tier=low|high` at 6 fixed views: plane over the centre, canopy at 40 m over Old
Town, ground in the Market Square, ground in the Yard, ground at the Campus plaza, ground on Route 1 in the fields):

- Low tier: canopy view <= **250 calls / 450k tris**; worst ground view <= **380 calls / 580k tris**.
- High tier: canopy <= 420 calls / 850k tris; worst ground <= 560 calls / 1.05M tris.
- That is about +15 % over today's worst. If the canopy view goes over, instance the house models per type before
  cutting content. FPS on low tier never trips the 40 fps guard in a scripted fly-through.
- Terrain paint: 1024² over 240 m is 4.3 px/m (today 5.8). Acceptable on low; use 2048² on high.
- Minimap: the whole map still fits (1 px ~ 0.6 tile at 190 px). Place names appear on the minimap only during the drop
  (white, small, display font) and are hidden on the ground except the one you are in.

New render pieces: route kind `rail` (ballast strip 1.6 m, sleepers every 0.8 m as one instanced box, two rails as two
thin strips), concrete deck for the Weir (same deck code, grey material, parapet instead of rails), boxcar = container
prop with a roof ridge and rust colours, light gravel `a` variant for Mast Hill and the quay (a tint per district is
enough).

## 10. Build order (slices)

### Slice 1: landmarks and names on today's map (1 day, ships alone)

Everything goes where it will stay after the shift (today's coordinates; slice 2 adds +16).
1. **Market Square** in Old Town: keep houses out of 40,31 - 50,37 (today's tiles), pave it, put the **water tower** at
   47,32, 2 tents, 3 crates, 6 outdoor loot.
2. **Twin cranes** in the Container Yard, one per bank: today's tiles 79,37 and 83,49 (3 x 2 each, replacing the
   containers there), booms over the water.
3. **Pole sign** at the Truck Stop beside the main path (today's tile 46,75).
4. Farms renamed (Hollis, Redgate, Southfield); `PLACE_TIER` keys follow.
5. **Place banner**: entering a named place shows its name for 1.6 s at the top centre in the display font (cream with
   the hard dark drop, the placement sticker's language), once per place per round, not during the drop. No eyebrow,
   no "Entering". Phone: same, 70 % size.
6. **Names during the drop**: the minimap shows the place names while you are in the plane or the air.
7. Acceptance: from the plane at 1280x720 and 390x844 you can point at the water tower, the cranes and the windmill;
   landing in Old Town shows `Old Town`; `?perf` canopy and ground numbers within +5 % of the baseline in section 1;
   all tests green.

### Slice 2: grow to 240 m (2 days)

`SIZE 120`, old heart +16, river and routes extended, Route 1 asphalt full length, Footbridge and Weir, new places with
buildings, loot and tiers (Campus with a plain HQ box, Mast Hill with a plain mast, Deadwood NE, Railyard tracks and
boxcars, Motel, Orchard, Lakeside cabins), lone houses by roads, Deadline radii, plane offset, landing plan
(`REACH`, `NEAR_BAND`, caps), outer forest ring and shadow box sized from `WORLD`, terrain paint, minimap, Home map.
Gates: flood fill (every walkable tile and every door reachable); bot-sim 50 matches **median 4:30-5:30 from Play,
p10 >= 3:30, p90 <= 6:30, dead air <= 10 % after 1:00, zone deaths <= 1 per match, first fight after landing <= 45 s
median**; perf within section 9 budgets; map gen <= 150 ms; load time not worse than today +10 %.

### Slice 3: dress and tune (1-2 days)

Full landmark models for the new places (mast with light, HQ with ring, lookout, gantry, conveyor, boathouse), story
props (Campus car park full, tipped boxcar, lodge campfire, market tents), the cover pass to meet section 8, the Deadline
centre rules with sim tests, `rail` route render and the Weir's concrete deck. Gate: same bot-sim gates; a headless
fly-over contact sheet (plane, 40 m canopy over each hot place) where each landmark is identifiable at 390x844.

### Slice 4: later (not needed for Basic Launch)

Windowed minimap and a big map with names, a ford tile (`q`, 0.7x speed), supply drops and events from the
br-proposal (Patch Drop, Cold Storage vault).

## 11. Must not change

The art style and palette; the skydive and canopy feel and timings; the deterministic sim (all map generation stays
seeded); rooftops, ladders and doors behaviour (ROOFTOPS.md); new-player rules (NEWBIE); 20 players; phones first-class.

## 12. Limitations

- Judged from the portal build on desktop headless Chromium and the map dump. No phone, no sound, no online test.
- Perf numbers are from an M-series Mac; phone budgets are extrapolated, so slice 2's perf gate must be measured, not
  assumed.
- Round length gates are targets for bot-sim; I could not run the bigger map, so the zone waits are left to tuning.
- Epic's 2018 map-update post returned 403; its content above comes from a search summary only.
