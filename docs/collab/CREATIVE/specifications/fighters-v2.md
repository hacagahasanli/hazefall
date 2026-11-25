# Fighters v2: Blaze, Hedge, Tempo, Rookie

Owner: Creative Director. Request: R-021. Date: 2026-11-25. Status: spec delivered, path A (procedural low-poly in `src/game/render/characters.ts`). **Path A rejected by Reis 2026-11-25; superseded by `fighters-v3-ai3d.md`.** Identity (personality, outfits, §4 palettes), §5 no-rifle rule and §6 framing still apply; procedural build details and §3 heights do not.

Style reference (style only, not to be copied): `ENGINEERING/char-redesign/reis-ref-lowpoly-faces.png`. What we take from it: big flat facets, large eyes with white sclera, a coloured iris and one catchlight, thick block brows, hair as a few big chunky shards, flat colour blocks on clothes. What we do not take: its hair shapes, the purple spiky hair plus headband, the teal jacket with shapes, the two-tone diagonal tunic, or any of its faces.

---

## 1. Objective and current problem

**Objective.** The four fighters should look like characters from a polished indie game. On the Fighter screen you should want to pick one because of their face and attitude, not because of a stat bar.

**What is wrong today** (checked in `docs/portal/screens/menu-desktop-fighter.png` and `CREATIVE/shots/cg-preflight/fighter-scrolled-860.png`):

1. **No faces.** The head is a 0.19 m icosahedron and the eyes are two 4.5 x 6 cm ink boxes. In the hero portrait Blaze's face is about 40 px of skin with two dots. You cannot see any expression.
2. **They all look like soldiers.** The portrait renders `rig.vest.visible = true`, a rifle in every hand, an olive pack, olive belt pouches and an olive holster on every fighter. The olive kit takes up more of the frame than the fighter's own colour, which is the "realistic military look" Reis rejected.
3. **The camera is too far and too high.** It frames the full body from above (`camera (1.7, 1.55, 3.6)`, FOV 30), so the head is about 10% of the card height and the shoes get as much space as the face.
4. **Model colours and UI colours disagree.** Rookie's UI colour is yellow `#ffd23f`, but the model is mostly white and red. Tempo's UI colour is sky `#3ec5ff`, but the model is royal blue `#3e7bfa`.
5. **The tiles are full bodies at about 120 px.** At that size every fighter becomes a small olive block with a gun.

**What already works and must not change:** the four body plans (Blaze tall and lean, Hedge a wide block, Tempo small, Rookie medium with a pack), Tempo's hair cloud, Hedge's beard and glasses, Rookie's beanie and pompom, Blaze's orange hoodie and headset (the approved covers show Blaze in that look), flat-shaded low poly, the one-draw-call skinned rig, and outfits that only recolour parts.

---

## 2. Global character rules (all four)

### 2.1 Two reading distances
- **Far (in a match, 15-60 px tall):** only the silhouette and two colour blocks count. Each fighter needs one shape nobody else has (§3), and the primary colour must cover at least 50% of the visible body area.
- **Near (Fighter screen, results, covers):** the face does the work: eyes, brows, mouth and hair.
- No detail smaller than 0.03 m on the body (head parts excepted). Nothing that only reads at 4K.

### 2.2 Head sculpt (shared function, e.g. `sculptHead(r, shape)`)
Start from `IcosahedronGeometry(r, 1)` (80 faces, as today). Apply these vertex moves as a pure function of position, so the shared vertices stay welded:
- **Jaw taper:** where `y < -0.2r`, `x *= 0.82` and `z *= 0.92`.
- **Face plane:** where `z > 0.45r` and `|y| < 0.4r`, `z = 0.45r + (z - 0.45r) * 0.55`. This flattens the front so the eyes sit on it.
- **Overall:** scale `(1.0, 1.06, 0.96)`.
- Per fighter, `shape` adds one tweak: Hedge `jawWide` (skip the jaw taper, `x *= 1.08` below `y < 0`), Rookie `round` (jaw taper 0.9 instead of 0.82), Blaze and Tempo use the default.
- **Nose:** `ConeGeometry(0.11r, 0.22r, 3)` (a three-sided pyramid), tip pointing +z, at `(0, -0.12r, 0.5r)` after the sculpt. Skin colour.
- **Ears:** `IcosahedronGeometry(0.16r, 0)`, scaled `(0.5, 1, 0.8)`, at `(±0.98r, -0.05r, 0)`. Skin colour. Hidden where a headset cup or hair covers them.

### 2.3 Eye kit (shared, e.g. `addFace(head, r, face)`)
Every eye part is a thin 8-segment cylinder (an octagon, which keeps the facet look) rotated to face +z. The parts are layered 0.004 m apart in z to avoid z-fighting, and they never cast shadows (`mesh(..., false)`). Each eye is yawed `±0.22 rad` so it follows the head curve.

| Part | Size (of r) | Position | Colour |
|---|---|---|---|
| Sclera | width 0.30r, height 0.36r (scale y 1.2) | centre `x = ±0.36r`, `y = -0.02r`, on the face plane | `#f4efe6` (warm white, never pure white) |
| Iris | diameter 0.20r | centred, 0.03r below the sclera centre (eyes look slightly down and forward) | per fighter (§4) |
| Pupil | diameter 0.10r | centred on the iris | `#1b1f2e` |
| Catchlight | diameter 0.05r | iris centre `+0.045r x, +0.05r y` (same side on both eyes, toward the key light) | `#fffaf0` |
| Upper lid line | box 0.34r x 0.06r x 0.02 | top edge of the sclera, angle per fighter | `#1b1f2e` |
| Brow | box 0.30r x 0.08r x 0.05r (Hedge 0.12r tall) | 0.14r above the sclera top, angle per fighter | hair colour |
| Mouth | per fighter (§4) | `y = -0.44r`, on the face | `#3a1f24` (dark warm, not ink) |

Per-fighter eye size multipliers: Blaze 1.0, Hedge 0.8 (narrower, older, behind glasses), Tempo 1.05, Rookie 1.15 (the biggest and most open).

**Bones for the face:** put each eye's parts (sclera, iris, pupil, catchlight, lid line) under its own group, `eyeL` and `eyeR`, children of `head`. `skinRig` turns a mesh's parent into a bone, so these become bones and the blink costs no extra draw call. Expose `rig.eyes: [eyeL, eyeR]`. The brows stay on `head`.

**Blink:** scale both eye groups to `y = 0.12` for 90 ms (40 ms close, 50 ms open), then back to 1. Blink every 2.8-5.5 s at random (seeded per rig), and once at the start of the pick reaction (§6.4). Blink in every pose and every view. Reduced motion: keep blinking, it is not motion sickness material.

### 2.4 Kit: less soldier, more character
Applies to all four, in the shared kit block of `buildRig`:
- **Remove** the belt pouches (`beltPouchL/R`) and the holster. Keep the belt and buckle.
- **Keep** the back pack, flap, side pouches and roll (the parachute container that the harness and risers need, `HARNESS_BACK`). Their Standard colours become per fighter (§4) instead of olive `#4f5638`/`#3b412a`/`#a08c64`.
- **Shoulder straps** take the fighter's `strap` colour (§4) instead of `#2a2d24`.
- **Armor vest restyle:** a plate in `#3a4152` with a 0.03 m trim band along the bottom edge in `#9aa3b8`, and no magazines. It still has to read as armor in a match, so keep its size.
- **Olive is retired** from the Standard look. No `#4f5638`, `#3b412a` or `#a08c64` remains on a Standard fighter.

### 2.5 Colour rules
- Every fighter has a **Primary** (about 55-65% of the body), a **Dark** (20-30%: trousers, straps, pack), an **Accent** (5-10%, the one pop), plus skin, hair and iris.
- The darkest value is `#1b1f2e` (ink). No `#000000`. No pure `#ffffff` on the body, except the catchlight `#fffaf0`.
- The Primary sits in the same hue family as the fighter's UI colour in `FIGHTERS[id].color`.
- **Identity parts never change with an outfit:** skin, hair, hair tips, brows, iris, sclera, beard and mouth. They use `mat()` directly, like skin does today, and stay out of the outfit part table (`cosmetics.test.ts` already rejects skin, hair and beard parts in a set).
- **New outfit parts** are listed per fighter (§4). They must be added to `STANDARD` with the values below. For sets that do not list a new part, the rule is in §4 under each fighter.

### 2.6 Budget
- Each fighter is still at most 3 draw calls (the skinned body, plus the gun and vest as today).
- At most 2,600 triangles per fighter including the face. Hair uses detail-0 primitives and 3-4 segment cones.
- No textures and no new materials beyond today's flat-shaded `mat()` set: colours are baked as vertex colours.

---

## 3. Silhouette sheet (the far read)

| Fighter | Shape nobody else has | Height (m) | Read as a black shape at 48 px |
|---|---|---|---|
| Blaze | Hair shards swept back like a flame, headset cups, long legs | about 2.10 | tall, thin, points backward at the top |
| Hedge | Wide block with padded shoulders, round bald head, beard | about 1.92 | a trapezoid, wider at the top than the base |
| Tempo | Small body under a hair cloud 1.5x the head, goggles on the cloud | about 1.46 | a lollipop: big round top, small body |
| Rookie | Pompom on top, backpack hump behind, big wrapped fists | about 1.82 | a bump on top, a bump behind, heavy hands |

---

## 4. Per-fighter specifications

Measurements are in metres, in `Spec` terms. Unlisted Spec values keep today's numbers.

### 4.1 Blaze (Runner), `hotfix`

**Personality:** fast, cocky, always "on call". Half-smiling, eyes narrowed with focus.

**Face**
- Sculpt: default. Skin `#c68a63`.
- Iris `#d98a2b` (amber).
- Lid line tilted 0.12 rad down toward the nose (focused). Brows tilted 0.18 rad down toward the nose, outer ends higher, so he looks confident and not angry.
- Mouth: a smirk. Box 0.20r x 0.035r, rotated 0.15 rad, offset `x = +0.06r` (toward the side of the catchlight). Add a 0.05r cube at the high end for the cheek dimple.

**Head, hair, headgear**
- `headR` 0.19 -> **0.25**.
- Hair cap: `SphereGeometry(r*1.06, 7, 4, 0, 2π, 0, 0.52π)`, set back 0.04r so the forehead shows. Colour `#2b1f2a`.
- Shards: 7 `ConeGeometry` with 4 radial segments (faceted pyramids), sized r 0.28-0.40r and h 0.7-1.05r. Five sweep back and up (rotation x between -1.9 and -2.3 rad, spread in y over ±0.6 rad, the longest in the middle back). Two short front shards fall over the brow (rotation x +0.5, at `x = ±0.15r`). The two front shards and the tip of the longest back shard are the **tip colour `#f2763d`** (dyed ends). That is the only hair colour change.
- **Hood down:** the hood becomes a rolled collar behind the neck. Use `TorusGeometry(r*0.95, r*0.22, 4, 8, π*1.3)`, lying flat, open at the front, at the neck. Part `hood`.
- Headset (kept, it is his cover look): the band arcs over the hair at r*1.5, cups at `±1.05r` (they hide the ears), the boom and gold mic as today, rescaled to the new r.

**Body**
- legLen 0.9, torsoW 0.48 (was 0.5), torsoH 0.66, torsoD 0.30, armLen 0.80, armR 0.065, legR 0.08. Long and lean.
- The hoodie hem flares out: add a box ring `torsoW*1.06 x 0.08 x torsoD*1.06` at the hem in part `top`.

**Outfit and equipment**
- Hoodie: part `top`. The kangaroo pocket (`pocket`) and strings (`strings`) are kept.
- Slim joggers: part `pants`. White runners (`shoes`) with a 0.025 m orange sole stripe in the new part `sole`.
- Chute pack, straps and belt per the table below.

| Part / slot | Hex | Role |
|---|---|---|
| top, hood | `#f2542d` | Primary |
| pocket | `#c8411f` | Primary dark |
| strings | `#fffaf0` | detail |
| pants | `#23283a` | Dark |
| shoes | `#fffaf0` | Accent (the white feet read when running) |
| sole (new) | `#f2542d` | Accent |
| headset | `#1b1f2e` | Dark |
| mic | `#ffc93c` | Accent (keeps its glow) |
| pack / flap / roll | `#2b3045` / `#23283a` / `#c8411f` | Dark |
| strap (new) | `#1b1f2e` | Dark |
| belt / buckle | `#23283a` / `#9aa3b8` | Dark |
| skin | `#c68a63` | identity |
| hair / tips / brows | `#2b1f2a` / `#f2763d` / `#2b1f2a` | identity |
| iris | `#d98a2b` | identity |

New-part fallback in other sets: `sole` takes that set's `strings`, and `strap` takes that set's `pants`.

**Idle (§6.3):** light bounce on the toes, plus a small head nod as if listening to the headset.

### 4.2 Hedge (Defender), `legacy`

**Personality:** calm, immovable, the big brother. A steady, unimpressed look. He has seen worse.

**Face**
- Sculpt `jawWide`. Skin `#e2a383` (warmer and ruddier than Rookie, so the two no longer share a skin tone).
- Eye size 0.8. Iris `#4a7fb0` (steel blue). Lid line flat (0 rad), lowered 0.04r: heavy lids, calm.
- Brows 0.12r tall, nearly flat (0.05 rad down toward the nose), colour `#a89f92`.
- Glasses (kept): two `TorusGeometry(0.24r, 0.03r, 4, 8)` rims around the eyes (octagonal rims), part `lens`, plus a 0.12r bridge box. They frame the eyes and must not cover them: no lens fill.
- Mouth: hidden under the moustache. No mouth mesh.

**Head, hair, headgear**
- `headR` 0.23 -> **0.28**. The bald top is head skin.
- Side and back hair: two side blocks (kept, rescaled) plus one back fringe box `1.4r x 0.35r x 0.3r` at `y = -0.05r`, `z = -0.8r`. Colour `#c9c2b6` (warm silver).
- Beard: `IcosahedronGeometry(r*0.95, 0)` (detail 0, so chunkier facets than today), scaled `(1.1, 0.9, 0.8)`, colour `#c9c2b6`. Moustache: a 3-sided wedge `0.55r` wide, colour `#a89f92`.

**Body**
- legLen 0.55, torsoW 0.95, torsoH 0.75, torsoD 0.55, armLen 0.64, armR 0.12, legR 0.15 (kept).
- **Shoulder pads (new part `pads`):** one box per shoulder, `0.30 x 0.12 x 0.42`, tilted 0.25 rad outward, sitting on the shoulder joint and parented to the **torso** (not the arm, so a raised arm does not swing a pad). They make the trapezoid silhouette.

**Outfit and equipment**
- Padded work jacket (part `top`), with the cream shirt front (`shirt`) and three buttons (`buttons`) kept.
- Work trousers and boots.

| Part / slot | Hex | Role |
|---|---|---|
| top | `#2ec27e` | Primary |
| pads (new) | `#1f8a59` | Primary dark |
| shirt | `#f1ead8` | detail |
| buttons | `#1b1f2e` | detail |
| lens | `#1b1f2e` | detail |
| pants | `#4e4034` | Dark |
| shoes | `#3a2a20` | Dark |
| pack / flap / roll | `#1f3a2e` / `#173027` / `#c9a45a` | Dark, plus a brass roll as the Accent |
| strap (new) | `#173027` | Dark |
| belt / buckle | `#3a2a20` / `#c9a45a` | Accent buckle |
| skin | `#e2a383` | identity |
| hair, beard / moustache, brows | `#c9c2b6` / `#a89f92` | identity |
| iris | `#4a7fb0` | identity |

New-part fallback in other sets: `pads` takes that set's `pants`, and `strap` takes `pants`.

**Idle:** a slow, deep breath, plus a slow look-around.

### 4.3 Tempo (Controller), `standup`

**Personality:** quick, cheeky, keeps the rhythm. A curious look, one brow up, ready to throw something.

**Face**
- Sculpt default. Skin `#8d5a3b`.
- Eye size 1.05. Iris `#c07a2f` (honey; it reads on dark skin, where a dark iris disappears).
- Lid line tilted 0.06 rad up toward the nose (open, curious). Brows: left flat, right raised 0.06r and tilted 0.2 rad (the one-brow-up look). Colour `#2a1f26`.
- Mouth: small and asymmetric. Box 0.14r x 0.035r, rotated -0.1 rad.

**Head, hair, headgear**
- `headR` 0.19 -> **0.25**. Big head on a small body: Tempo is the "cute" read.
- Hair cloud (kept, it is the best silhouette in the game): 7 `IcosahedronGeometry(·, 0)` puffs instead of 8, rescaled so the cloud spans 1.5x the head width. The front puffs stop 0.1r above the brows so the brows show. Colour `#2a1f26`.
- **Goggles pushed up on the cloud (new):** two 8-segment cylinders, r 0.16r and depth 0.08r, at `(±0.2r, 0.55r, 0.75r)`, tilted back 0.5 rad. The lenses are part `badge`. The frames and the strap (a flattened torus around the cloud at that height) are part `lanyard`.

**Body**
- legLen 0.45, torsoW 0.48, torsoH 0.45, torsoD 0.30, armLen 0.50, armR 0.065 (kept).
- Oversized windbreaker: the sleeves are 1.25x `armR` at the cuff end, so the forearm cylinder tapers outward (`CylinderGeometry(armR*1.25, armR*0.95, ...)`). The torso box is 1.04x wide at the hem.
- **Crossbody strap (replaces the lanyard and badge on the chest):** a box `0.05 x torsoH*1.25 x 0.03`, diagonal from the right shoulder to the left hip, in part `lanyard`, with a canister pouch (an 8-segment cylinder, r 0.06, h 0.12, upright) at the left hip. The pouch lid is part `badge`. This ties the look to Slow Bomb.

**Outfit**

| Part / slot | Hex | Role |
|---|---|---|
| top | `#3a9cf2` | Primary (between the model's old `#3e7bfa` and the UI's `#3ec5ff`) |
| pants | `#23283a` | Dark |
| shoes | `#ffc93c` | Accent |
| lanyard (strap, goggle frames) | `#e23d5c` | Accent (coral) |
| badge (goggle lenses, pouch lid) | `#ffc93c` | Accent |
| pack / flap / roll | `#22304a` / `#1b2538` / `#e23d5c` | Dark |
| strap (new) | `#1b2538` | Dark |
| belt / buckle | `#23283a` / `#9aa3b8` | Dark |
| skin | `#8d5a3b` | identity |
| hair, brows | `#2a1f26` | identity |
| iris | `#c07a2f` | identity |

New-part fallback: `strap` takes `pants`.

**Idle:** keeps the beat. A head tilt on a rhythm and a foot tap.

### 4.4 Rookie (Brawler), `intern`

**Personality:** young, eager, a bit too ready. Wide eyes and a grin, fists up.

**Face**
- Sculpt `round`. Skin `#f0c09a` (the lightest of the four, a new value; `#e9b48f` is now free).
- Eye size 1.15. Iris `#3f8a4a` (green).
- Lid line 0.08 rad up toward the nose. Brows raised 0.05r, tilted 0.12 rad up toward the nose (eager). Colour `#a8501f`.
- Mouth: a grin. A trapezoid built from a box 0.26r x 0.08r with a `#f4efe6` teeth strip 0.22r x 0.025r on its top edge.

**Head, hair, headgear**
- `headR` 0.19 -> **0.26**.
- Beanie, cuff and pompom kept and rescaled. Pompom: `IcosahedronGeometry(0.30r, 0)`, raised to `1.2r` so it pokes out of the silhouette.
- **Ginger bangs (new):** three 4-sided cones, r 0.12r and h 0.3r, pointing down out of the cuff over the forehead at `x = -0.2r, 0, 0.18r`. Colour `#c2622d`.
- Ears stick out from under the cuff (`§2.2` ears, scaled 1.15x).

**Body**
- legLen 0.70, torsoW 0.54, torsoH 0.55, torsoD 0.34, armLen 0.62, armR 0.08, legR 0.10.
- **Fists:** the hands are 1.4x size, wrapped. The new part `wraps` covers the lower 60% of each hand. Hands keep skin on the knuckles (the top 40%).
- Puffer jacket: the torso box plus a second box `torsoW*1.08 x 0.1 x torsoD*1.08` around the middle (part `top`) gives the puffer band. The existing chest `stripe` stays above it.

**Outfit and equipment**
- The school backpack is kept as his signature, and its colour changes so it does not vanish against the new yellow jacket.

| Part / slot | Hex | Role |
|---|---|---|
| top | `#f5c02e` | Primary (matches the UI's `#ffd23f`) |
| stripe | `#e23d5c` | Accent |
| beanie | `#e23d5c` | Accent |
| cuff | `#a82e2e` | Accent dark |
| pom | `#fffaf0` | detail (it reads against the red beanie) |
| pants | `#3567d6` | Secondary (jeans) |
| shoes | `#e23d5c` | Accent (high-tops) |
| wraps (new) | `#f4efe6` | detail |
| bag | `#2f3a56` | Dark |
| bagTrim | `#f5c02e` | Primary |
| strap (new) | `#2f3a56` | Dark (the bag straps on the chest) |
| belt / buckle | `#2a2d3a` / `#9aa3b8` | Dark |
| skin | `#f0c09a` | identity |
| bangs, brows | `#c2622d` / `#a8501f` | identity |
| iris | `#3f8a4a` | identity |

New-part fallback: `wraps` takes that set's `pom`, and `strap` takes `bag`.

**Idle:** a boxer's bounce with the fists up.

---

## 5. Pose rule on the Fighter screen: no rifle

The Fighter screen says "Same guns for all: the super is yours". Four people holding the same rifle reads as a squad of soldiers. So on the Fighter screen (hero and tiles), **no gun is shown and the vest is off.** Each fighter stands in a signature pose built from today's bones (rotations in radians, about the rig's own axes, model facing +z):

| Fighter | Pose | Bones |
|---|---|---|
| Blaze | One hand to the headset, weight on the back leg | armR x -2.4, z -0.35, foreR x -2.1 (the hand reaches the cup); armL relaxed x 0.1, z 0.12; legL x 0.12, legR x -0.08; body lean x 0.06 |
| Hedge | Fists on hips, feet wide | both upper arms z ±0.75, x 0.2; forearms x -1.6, bent inward; legs z ±0.08 |
| Tempo | Tossing the canister | armL x -1.3, foreL x -1.2 (palm up at shoulder height); a canister prop (the §4.3 pouch shape, r 0.06, h 0.12, `#3a9cf2` body, `#ffc93c` lid) floats 0.12 m above the palm; armR relaxed |
| Rookie | Boxing guard | both upper arms x -0.9, z ±0.25; forearms x -1.9; fists in front of the chin, 0.15 m apart; knees bent (shins x 0.2) |

The angles are starting values (sign as in `poseRig`, where a negative x raises an arm forward). The described result is the target: for example, Blaze's hand must visibly touch the headset cup. Tune the angles until it does.

Exception: while the player previews a **gun finish** in the Style tray, the hero switches to today's rifle-ready pose with that gun. It returns to the signature pose when the tray closes.

In matches nothing changes: the gun poses stay as they are.

---

## 6. The Fighter screen (Reis's top priority)

Where: `src/components/FighterSelect.tsx` (`FighterCard`, `FighterGrid`), shown inside `SidePanel title="Fighter"` in `MainMenu.tsx` and in `Lobby.tsx`. The portraits come from `renderPortraits()` in `src/game/render/showcase.ts`. The primary target is the CrazyGames default iframe, 1216x684 desktop, followed by 821x462 and 1920x1080.

### 6.1 Hero card: a live render of the picked fighter
- Replace the hero's PNG with **one small live WebGL canvas** for the selected fighter only. It plays the idle loop. Cap it at 30 fps and pixel ratio `min(devicePixelRatio, 1.5)`. It stops drawing when the panel is closed or the tab is hidden, and it is disposed with the panel.
- Fallback: a static PNG with the same camera, lighting and pose for the low tier, reduced motion, and while the canvas is loading. The warm-cache idea in `warmLobby` stays, now for this PNG.
- **Framing ("cowboy shot"):** knees up. The top of the hair or headgear sits 5-7% below the card's top edge. The **face (brow to chin) is 17-20% of the card height**. The fighter stands in the right 55% of the card, with the body centre at about 68% of the card width.
- **Camera:** perspective, FOV 24. Position it relative to the head centre `H`: `(0.55, H.y - 0.25, 3.3)`, looking at `(0, H.y - 0.55, 0)`. That is slightly below eye level, so the fighter looks a touch heroic without the camera looking up their nose. Turn the fighter `-0.45 rad` (toward the text on the left). Then turn the **head** a further 0.2 rad toward the camera, so the face is nearly frontal on a 3/4 body.
- **Backdrop: a faceted shard wall (no blur glow).** It sits in the same scene, 1.6 m behind the fighter, and fills the frame. Use a plane subdivided 7 x 5 with every inner vertex jittered by ±35% of a cell (seeded per fighter, so it never shimmers), flat-shaded.
  - Face colours: the fighter's Primary multiplied to 30% luminance, with ±7% value variation per face.
  - A band of 4-6 triangles crossing behind the head at full Primary luminance x 0.55 makes a lit "shard" that frames the face.
  - This replaces the CSS radial gradient in the hero card. It ties the screen to the faceted characters instead of a generic glow.
- **The left side stays readable:** a CSS mask on the canvas fades it from 100% at 45% width to 0% at 15% width, so the name, stats and super text sit on the card's ink background.
- **Lighting (three points, no shadows needed):**
  - **Key:** `DirectionalLight #ffe8cc`, intensity 2.6, from camera-left and above `(-1.6, 2.6, 3.0)`. It lights the face plane and catches the catchlight side, and the facets alternate light and shade across the cheeks.
  - **Fill:** `HemisphereLight` sky `#dfe8ff`, ground `#2a2f3d`, intensity 1.0. That is lower than today's 1.6, so the facets show.
  - **Rim:** `DirectionalLight` in the fighter's UI colour, intensity 3.2, from behind-right `(2.4, 2.0, -2.6)`. It outlines the hair, shoulder and one arm in colour.
  - Tone mapping ACES, exposure 1.05. Check that the Primary still reads as its hue after tone mapping: Blaze must look orange, not salmon (acceptance item A7).
- **Contact:** no floor in a knees-up shot. Instead, add a 25% black gradient from the card's bottom edge to 12% of the card's height, so the cropped legs sink into shadow and are not cut hard.

### 6.2 The four tiles
- Static PNGs, rendered once per look, as today (no live canvas: four live canvases cost too much).
- **Bust framing:** chest up. The face is 38-45% of the tile height, the hair or headgear stays inside the tile, the head is centred at 42% height, and the fighter is turned -0.3 rad with the head facing the camera. The same lighting as the hero, with the shard wall in the PNG at 60% of the hero's brightness.
- Selected: as today (gold border, `scale-105`), plus the shard wall at full brightness. Unselected: the whole PNG at 80% opacity. Hover: 92%.
- Keep the name strip and the colour of `c.color`.

### 6.3 Idle loops (hero canvas; also used when the fighter stands still in a match, at half amplitude)
All idles are sums of sines on the rig's existing bones, with a 4-6 s period so they do not look mechanical. Limits: body y at most ±0.02 m, any bone at most ±0.12 rad from its pose. Reduced motion: only the breath (body y ±0.006) and blinks.

| Fighter | Loop |
|---|---|
| Blaze | Toe bounce: body y `0.015*|sin(2.4t)|`. Head nod x `0.05*sin(4.8t)` (to a beat in the headset). Every 5-7 s a glance away and back: head y 0.25 over 0.3 s, hold 0.6 s, back over 0.3 s. |
| Hedge | Slow breath: body y `0.012*sin(0.8t)` and torso scale x/z `1 + 0.012*sin(0.8t)`. Slow look-around: head y `0.18*sin(0.35t)`. No bounce. Blinks are 30% slower (130 ms). |
| Tempo | Keeps the beat: head z `0.10*sin(π·1.25t)` (a tilt on the beat, 75 bpm), right foot tap (shinR x `0.15*max(0, sin(π·2.5t))`), and the canister prop bobs `0.04*sin(π·2.5t)` with a small spin. |
| Rookie | Boxer's bounce: body y `0.018*|sin(3.2t)|`, fists alternate forward (foreL/foreR x `±0.08*sin(3.2t)`), shoulders roll (body z `0.04*sin(1.6t)`). |

### 6.4 Pick reaction (0.5-0.7 s, every time a fighter is picked)
The fighter turns in from 0.3 rad further away with a `back.out` ease and blinks once. Then each one does a short beat:
- **Blaze:** the smirk widens (mouth scale x 1.3 for 0.4 s) and a quick two-finger tap on the headset (foreR x -0.2 and back).
- **Hedge:** a single slow nod (head x 0.15 down and up over 0.6 s).
- **Tempo:** tosses the canister 0.25 m up and catches it.
- **Rookie:** two quick punches (foreL then foreR x +0.5 and back, 0.15 s each).

Sound is not in scope (it is an R- item for audio later).

### 6.5 Text and layout
The layout, copy, stat bars and Style row do not change. The name keeps `font-display` in `f.color`. The only change in the card is that the radial gradient is removed, because the shard wall replaces it.

---

## 7. Implementation order (Blaze first, on a branch, not in the CG build under review)

**Phase 1: Blaze's model, still renders only.**
1. Write the shared `sculptHead`, `addFace` (eyes as bones, blink support) and the global kit changes from §2.4. Note that the kit changes touch all four fighters. That is intended, and the other three must not break.
2. Rebuild Blaze per §4.1: head, hair, collar, headset, sole and colours. Add the new parts `sole` and `strap` to `STANDARD`, with the fallbacks for the other sets.
3. Change `renderPortraits` for Blaze only: no vest, no gun, the signature pose, the §6.1 camera, lights and shard wall, and the §6.2 tile framing.
4. **Screenshot set for CD and Reis review** (put it in `ENGINEERING/char-redesign/blaze-v2/`):
   - `hero-1216x684.png`: the Fighter panel with Blaze picked.
   - `hero-1920x1080.png` and `hero-821x462.png`.
   - `face-crop-2x.png`: a 2x render of the head only, front and 3/4.
   - `silhouette-48px.png`: old Blaze and new Blaze as black shapes, plus the three current fighters, at 48 px tall.
   - `outfits-sheet.png`: Blaze in all 6 outfits (`scripts/looks-sheet`).
   - `match-shoulder.png`: shoulder camera, standing and running.
   - `match-canopy.png`: under the canopy (the harness and hands must still meet the risers).
   - `match-far.png`: Blaze among bots at normal play distance.
   - Before and after numbers: `renderer.info.render.triangles` and draw calls for one fighter.
5. **Gate:** CD writes `F-` items, and Reis approves the face. If after one round of fixes the face is still not at the level of the reference, stop path A and open an R- item for path B (GLB models). Do not start the other three on a face that has not passed.

**Phase 2: the live hero for Blaze.** The §6.1 live canvas, the Blaze idle (§6.3), blink and the pick reaction (§6.4). Add a short screen recording (5 s, 30 fps) to the review folder.

**Phase 3: Hedge, then Tempo, then Rookie,** one commit each. Each one gets the same screenshot set and its own CD gate. Their poses, idles and reactions come with them.

**Phase 4: finish.** The vest restyle checked in a match, the in-match idle at half amplitude, the outfit fallbacks checked across all sets for all four, and the portal covers left as they are (Blaze keeps his hoodie, headset and orange, so the covers still match).

---

## 8. Acceptance criteria (checkable from screenshots unless noted)

**Face and model**
- A1. In `hero-1216x684.png`, each of Blaze's eyes is at least 12 px wide, and the sclera, iris, pupil and catchlight are all visible as separate colours. The brows are clearly visible above the eyes.
- A2. In `hero-1216x684.png`, the face (brow to chin) is 17-20% of the hero card's height, and the top of the hair is 5-7% below the card top.
- A3. In the 1216x684 tile, Blaze's face is at least 40 px tall, and both eyes show as white with a dark centre.
- A4. In `silhouette-48px.png`, new Blaze reads as different from the other three, with the hair shards and headset breaking the head outline. CD confirms.
- A5. No olive (`#4f5638`, `#3b412a`, `#a08c64`) appears on a Standard fighter. No rifle and no vest appear on the Fighter screen unless a gun finish is being previewed.
- A6. Facets are visible on the cheeks and jaw in `face-crop-2x.png`: at least 3 distinct shading values across one cheek. A smooth-looking head fails.
- A7. After tone mapping, Blaze's hoodie measures in the orange range (hue 10-22°, saturation ≥ 60%) in the hero render. It does not drift to salmon or pink.
- A8. In `outfits-sheet.png`, all 6 outfits render with no part in an unintended colour (no white or default-grey fallback), and in every set the hair, skin, eyes and brows are identical to Standard.

**Performance and regressions (engineering checks)**
- A9. One fighter is at most 3 draw calls and at most 2,600 triangles. On the 20-fighter test map, frame time is within 5% of the pre-change build on the same machine and tier.
- A10. `match-canopy.png`: the hands still reach the toggles, and the risers leave the pack's shoulder straps. `match-shoulder.png`: the bigger head and hair do not block the over-the-shoulder view of the crosshair.
- A11. All tests pass, including `cosmetics.test.ts` (outfits keep the same part keys and never touch skin or hair) and `looks.test.ts`.

**Live hero (Phase 2)**
- A12. The idle loop is visible in the recording and stays within §6.3's limits. With reduced motion on, only the breath and blinks remain.
- A13. Blinks happen every 2.8-5.5 s and are hard to catch in a still frame (90 ms).
- A14. The hero canvas draws nothing while the Fighter panel is closed or the tab is hidden (checked in DevTools: no rAF work).

---

## 9. Must not change
- The fighter IDs, stats, names, supers, UI colours (`FIGHTERS[id].color`), and the sim's hitboxes. The bigger heads are visual only.
- The rig's bone structure that the gameplay poses use (`body`, `armL/R`, `foreL/R`, `legL/R`, `shinL/R`, `head`, `weapon`, `hand`, `vest`). You may add new bones, but not rename these.
- The one-skinned-mesh bake and the flat-shaded material set.
- Fighter screen layout, copy, stats, Style row and the 1216x684 fit without scrolling.
- The CG build under review: this work lives on a branch until the CG verdict and Reis's approval.

## 10. Notes on sources
- **Verified (seen this turn):** the reference image, today's `characters.ts`, `showcase.ts` `renderPortraits`, `FighterSelect.tsx`, `MainMenu.tsx`, `cosmetics.ts`, the two Fighter-screen screenshots and an in-match screenshot. Fighters in a match are about 20-40 px tall.
- **Not done:** no new web research on character-select screens this turn. The framing and lighting choices (knees-up hero, three-point light with a coloured rim, bust tiles) are the CD's craft judgement, not cited findings.
- **Assumption:** bones with a non-uniform scale (the blink) work with today's `skinRig` bake. If they do not, engineering should report it in REQUESTS.md. The fallback is to move the lid line down over the eye instead of scaling.
