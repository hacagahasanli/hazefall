# Fighters v3: AI-generated 3D models (path B)

Owner: Creative Director. Request: R-021 (path B). Date: 2026-11-25. Status: spec delivered. Blaze first; the other three wait for Reis's approval of Blaze.

**Why path B.** Reis rejected the procedural faces from path A (`hazefall-fighters-v2/docs/collab/ENGINEERING/char-redesign/blaze-v2-r1/face-crop-2x.png`): an 80-face icosahedron with boxes for brows, lids and mouth reads as a ball with stickers, not as a sculpted face. Path A cannot reach the reference without hand-modelling. So the models are now made with an AI 3D generator (Tripo3D or Meshy), auto-rigged, and imported as glTF.

**What this spec replaces and keeps.**
- **Kept from `fighters-v2.md`:** each fighter's identity: personality, silhouette idea, outfit, colours (§4 tables), the no-rifle rule on the Fighter screen (§5), the hero/tile framing and light rig (§6), and the pick reactions/idle ideas.
- **Dropped from `fighters-v2.md`:** everything procedural: `sculptHead`, the eye kit made of cylinders, `headR` values, cone/torus build recipes, the 2,600-triangle budget, the "eyes as bones" blink, and `Spec` body numbers.
- **Changed here:** heights (Blaze is no longer the tall one, owner direction 2026-11-25), Tempo is now a woman (CD decision, §3), and the triangle budget (§6).

**Style reference** (style only, never copy its characters): `ENGINEERING/char-redesign/reis-ref-lowpoly-faces.png`.
- Take from it: big flat triangular facets on skin and cloth, warm skin with light and dark facets, big eyes (white sclera, coloured iris, dark pupil, one catchlight), thick block brows, hair as a few large layered chunky shards, flat colour blocks on modern casual clothes, soft readable shapes with no fine detail.
- Do not take: the purple spiky hair with a cream headband, the pink bob with a headband, the teal jacket with geometric patches, the blue-green asymmetric tunic, or any of its faces. Our four must not resemble them.

---

## 1. Shared style block (paste into every generation)

Use the **full block** where the tool has a separate style or "art direction" field, and in concept-image prompts. The per-fighter text-to-3D prompts in §4 already contain the **short line**, so they stay under 600 characters.

**Full block**
> Stylized low-poly 3D game character in a faceted, flat-shaded style: large visible triangular facets on face, skin, hair and clothes, each facet one flat colour, no smoothing. Flat solid colour blocks, no fine textures, no fabric pattern, no text, no logos, no numbers. Stylized proportions with a slightly large head, big expressive eyes with white sclera, coloured iris, dark pupil and one catchlight, thick block brows, hair built from a few big chunky layered shards. Modern casual outfit. A-pose: arms straight, 45 degrees down from the shoulders, palms facing the thighs, fingers slightly apart; legs straight, feet shoulder width, toes forward. Neutral expression, mouth closed, eyes looking forward. Empty hands, no weapon, no props in hands. Single character, full body, game-ready mesh, clean separated limbs, 8,000-15,000 triangles before decimation.

**Short line** (first sentence of every §4 prompt)
> Stylized faceted low-poly game character, flat-shaded large facets, flat colour blocks, no texture detail, A-pose, neutral face, empty open hands, game-ready.

**Generator settings (both tools)**
- Pose: **A-pose** (preferred over T-pose: shoulders deform better in a run and a raised-gun pose). Use T-pose only if the auto-rigger rejects the A-pose model.
- Style preset: the tool's low-poly / stylized preset if it exists; never "realistic". Texture on, PBR off (we want albedo colour only, no roughness/metal/normal maps).
- Symmetry: on, except Tempo (one raised brow, crossbody strap) and Rookie (backpack is symmetric, so on is fine).
- Topology: quad or triangle is fine; target 8-15k triangles from the generator. Decimation happens after the pick (§6).
- The parachute pack, armor vest and gun are **not** part of the model. Engineering attaches the existing ones to the bones. So the back must be clear for the chute pack (Rookie's school backpack is the exception, see §4.4), and nothing may stick out from the chest more than a jacket would.

**Expression rule.** There are no face blendshapes in this pipeline, so the face is baked. "Neutral" means mouth closed and relaxed, but the personality shows in the brows and eye shape (Blaze relaxed and confident, Hedge heavy-lidded and calm, Tempo one brow up, Rookie wide-eyed and eager). No open mouths, no teeth, no grins: they look wrong when the body runs or gets hit.

**Age rule.** All four are adults. Tempo is a short adult woman, not a child, and Rookie is a young adult, not a kid. This is a shooter: a child-looking model is a hard reject.

---

## 2. Order of work (gate)

1. **Blaze only.** Generate 4-8 concept images with the §5 prompt (any 2D image model). Engineering posts them as a contact sheet in `ENGINEERING/char-redesign/blaze-v3/`. The CD shortlists two; **Reis picks one.**
2. Image-to-3D from the picked concept (Tripo3D and Meshy both; 3-4 variants each). Run the §4 text-to-3D prompt in parallel as a control, since text-to-3D sometimes wins on the body even when it loses on the face.
3. Engineering renders the best 2-3 meshes in the review scene (§7) and posts the screenshot set. The CD scores them against §7; **Reis approves one.**
4. Auto-rig (Tripo or Meshy auto-rig, or Mixamo), recolour to the exact §4 hex values, decimate (§6), and post the in-game screenshot set again (Fighter screen hero and tile, in match). CD review in `FEEDBACK.md`; **Reis approves Blaze in the game.**
5. Only then Hedge, Tempo and Rookie, in that order, the same way. Blaze's approved model is the **style anchor**: attach his front render as a style image in every later generation where the tool allows it, and judge facet size and eye style against him (§7, item C).

If Blaze fails twice at step 3 (no variant passes A1-A4), stop and report to the CD before spending more credits. The fallback is a hand-cleanup pass on the best face in Blender, not more generations.

---

## 3. Line-up: heights and silhouettes (all four)

Owner direction 2026-11-25: Blaze is shorter than in v2, close to average height, with a slightly bigger head, but still athletic and quick-looking. Hedge is now the tallest. Heights are relative to Hedge = 1.00 and measured to the top of the head shape (hair, beanie and pompom included).

| Fighter | Heads tall (stylized) | Height vs Hedge | In-game height (m, visual only) | Shape nobody else has | Black shape at 48 px |
|---|---|---|---|---|---|
| Hedge | 6 | 1.00 | 1.95 | Broad trapezoid with shoulder pads, bald dome, beard | a wide block, wider at the shoulders than the feet |
| Blaze | 5.5 | 0.92 | 1.80 | Slim, athletic; hair shards swept back like a flame; headset cups | a slim upright figure with a backward point at the top |
| Rookie | 5 | 0.88 body, 0.94 with pompom | 1.72 (1.83 to the pompom tip) | Round bump on top, backpack hump behind, big wrapped fists | a bump on top, a bump behind, heavy hands |
| Tempo | 4.5 | 0.74 with hair cloud | 1.45 | Small body under a hair cloud 1.5x the head width | a lollipop: big round top, small body |

How Blaze and Rookie stay apart now that they are close in height: Blaze is slim (shoulders about 2 head widths) with a pointed, back-swept top and long legs for his size (legs about 48% of his height); Rookie is stocky (shoulders about 2.4 head widths, puffer bulk), with a round top, a hump behind and fists 1.4x normal hand size. If both read the same at 48 px, fix it on Rookie (more bulk), not by making Blaze tall again.

In-game heights are the visual scale for the imported model. Hitboxes and the sim stay as they are; if engineering finds the new scale needs a sim change, raise it in `REQUESTS.md`.

---

## 4. Per-fighter prompts and palettes

Each prompt below is ready to paste into text-to-3D (all are under 600 characters, counted). The negative prompt goes in the tool's negative field; if a tool has none, drop it. Hex values are for the recolour pass after generation (generators follow colour words, not hex), and for checking §7 item E.

### 4.1 Blaze (Runner, `hotfix`), UI colour `#ff6a3d`

Personality: fast, cocky, always on call. Relaxed, confident look; eyes a little narrowed with focus. Compact athlete, not a beanpole.

**Text-to-3D prompt** (546 chars)
```
Stylized faceted low-poly game character, flat-shaded large facets, flat colour blocks, no texture detail, A-pose, neutral face, empty open hands, game-ready. Adult male runner, athletic, compact, average height, 5.5 heads tall, slightly big head. Warm tan skin, big amber eyes, thick dark brows, calm confident look. Plum-black hair in chunky shards swept back like a flame, orange dyed tips. Black headset over ears with small gold mic. Red-orange hoodie, hood down as a collar, kangaroo pocket. Slim navy joggers. White sneakers, orange soles.
```

**Negative prompt**
```
realistic, photoreal, smooth sculpt, high-poly, subdivided, PBR, fine texture, noise, text, logo, letters, weapon, gun, holding object, armor, vest, military, camouflage, helmet, tall, lanky, skinny, chibi, child, hood up, open mouth, angry, melted, fused fingers, extra fingers, extra limbs, asymmetric eyes, hair over eyes, long coat, cape, base, pedestal
```

**Palette**

| Part | Hex | Role |
|---|---|---|
| Hoodie, hood collar | `#f2542d` | Primary |
| Kangaroo pocket, hoodie shadow side | `#c8411f` | Primary dark |
| Hoodie strings | `#fffaf0` | detail |
| Joggers | `#23283a` | Dark |
| Sneakers | `#fffaf0` | Accent |
| Sneaker soles | `#f2542d` | Accent |
| Headset | `#1b1f2e` | Dark |
| Mic tip | `#ffc93c` | Accent |
| Skin | `#c68a63` | identity |
| Hair, brows | `#2b1f2a` | identity |
| Hair tips (front shards + longest back shard only) | `#f2763d` | identity |
| Iris | `#d98a2b` | identity |
| Sclera | `#f4efe6` | identity |
| Pupil, lid line | `#1b1f2e` | identity |

### 4.2 Hedge (Defender, `legacy`), UI colour `#3ddc84`

Personality: calm, immovable, the big brother. Steady, unimpressed, heavy-lidded.

**Text-to-3D prompt** (532 chars)
```
Stylized faceted low-poly game character, flat-shaded large facets, flat colour blocks, no texture detail, A-pose, neutral face, empty open hands, game-ready. Adult man, tall and broad, 6 heads tall, wide trapezoid torso, big shoulder pads, calm steady look. Ruddy light skin, steel-blue eyes, heavy lids. Bald top, short warm silver hair at sides and back, thick chunky silver beard and moustache, octagonal dark-rimmed glasses. Green padded work jacket, cream shirt front with three buttons. Brown work trousers, dark brown boots.
```

**Negative prompt**
```
realistic, photoreal, smooth sculpt, high-poly, subdivided, PBR, fine texture, noise, text, logo, weapon, gun, holding object, armor plates, military, camouflage, helmet, hat, hair on top, long hair, sunglasses, tinted lenses, fat belly, chibi, angry, open mouth, melted, fused fingers, extra limbs, asymmetric eyes, cape, base, pedestal
```

**Palette**

| Part | Hex | Role |
|---|---|---|
| Work jacket | `#2ec27e` | Primary |
| Shoulder pads, jacket shadow side | `#1f8a59` | Primary dark |
| Shirt front | `#f1ead8` | detail |
| Buttons, glasses rims | `#1b1f2e` | detail |
| Trousers | `#4e4034` | Dark |
| Boots | `#3a2a20` | Dark |
| Belt buckle (if generated) | `#c9a45a` | Accent |
| Skin | `#e2a383` | identity |
| Hair, beard | `#c9c2b6` | identity |
| Moustache, brows | `#a89f92` | identity |
| Iris | `#4a7fb0` | identity |
| Sclera / pupil | `#f4efe6` / `#1b1f2e` | identity |

Glasses: rims only, no lens fill and no tint. The eyes must show through.

### 4.3 Tempo (Controller, `standup`), UI colour `#3ec5ff`

Personality: quick, cheeky, keeps the rhythm. Curious, one brow up.

CD decision: Tempo is a **woman**. v2 never fixed a gender, and an all-male roster of four is a weaker line-up for the Fighter screen and the covers. Everything else about Tempo (hair cloud, goggles, sky-blue windbreaker, canister strap) is unchanged.

**Text-to-3D prompt** (528 chars)
```
Stylized faceted low-poly game character, flat-shaded large facets, flat colour blocks, no texture detail, A-pose, neutral face, empty open hands, game-ready. Short adult woman, small slim body, 4.5 heads tall, big head. Deep brown skin, big honey-amber eyes, one brow raised, curious look. Huge round dark hair cloud 1.5x head width, goggles with yellow lenses pushed up on the hair. Oversized sky-blue windbreaker, wide cuffs. Coral crossbody strap with small yellow canister pouch at left hip. Navy trousers. Yellow sneakers.
```

**Negative prompt**
```
realistic, photoreal, smooth sculpt, high-poly, subdivided, PBR, fine texture, noise, text, logo, weapon, gun, grenade in hand, holding object, armor, military, camouflage, helmet, child, toddler, baby face, chibi, braids, straight hair, hair over eyes, goggles over eyes, open mouth, melted, fused fingers, extra limbs, asymmetric eyes, base, pedestal
```

**Palette**

| Part | Hex | Role |
|---|---|---|
| Windbreaker | `#3a9cf2` | Primary |
| Trousers | `#23283a` | Dark |
| Sneakers | `#ffc93c` | Accent |
| Crossbody strap, goggle frames and band | `#e23d5c` | Accent |
| Goggle lenses, pouch lid | `#ffc93c` | Accent |
| Skin | `#8d5a3b` | identity |
| Hair cloud, brows | `#2a1f26` | identity |
| Iris | `#c07a2f` | identity |
| Sclera / pupil | `#f4efe6` / `#1b1f2e` | identity |

### 4.4 Rookie (Brawler, `intern`), UI colour `#ffd23f`

Personality: young, eager, a bit too ready. Wide-eyed.

**Text-to-3D prompt** (512 chars)
```
Stylized faceted low-poly game character, flat-shaded large facets, flat colour blocks, no texture detail, A-pose, neutral face, empty open hands, game-ready. Young adult man, sturdy, 5 heads tall, round friendly face, eager wide eyes. Light peach skin, big green eyes, raised ginger brows. Red beanie, white pompom, short ginger bangs. Yellow puffer jacket with a band round the middle and a red chest stripe. Blue jeans, red high-top sneakers. Big hands with white wraps. Navy school backpack with yellow trim.
```

**Negative prompt**
```
realistic, photoreal, smooth sculpt, high-poly, subdivided, PBR, fine texture, noise, text, logo, weapon, gun, holding object, boxing gloves, armor, military, camouflage, helmet, child, chibi, freckles, long hair, open mouth, angry, melted, fused fingers, extra limbs, asymmetric eyes, backpack fused to arms, base, pedestal
```

**Palette**

| Part | Hex | Role |
|---|---|---|
| Puffer jacket | `#f5c02e` | Primary |
| Chest stripe | `#e23d5c` | Accent |
| Beanie | `#e23d5c` | Accent |
| Beanie cuff | `#a82e2e` | Accent dark |
| Pompom | `#fffaf0` | detail |
| Jeans | `#3567d6` | Secondary |
| High-tops | `#e23d5c` | Accent |
| Hand wraps | `#f4efe6` | detail |
| Backpack / backpack trim | `#2f3a56` / `#f5c02e` | Dark / Primary |
| Skin | `#f0c09a` | identity |
| Bangs / brows | `#c2622d` / `#a8501f` | identity |
| Iris | `#3f8a4a` | identity |
| Sclera / pupil | `#f4efe6` / `#1b1f2e` | identity |

Backpack: Rookie's school backpack is his signature and replaces the chute pack visually. Engineering decides whether the chute pack sits behind it or is hidden on Rookie; it must not float or clip.

---

## 5. 2D concept-image prompts (for image-to-3D)

Image-to-3D usually gives better faces than text-to-3D, because the face is decided in 2D first, where we can judge it. Use any 2D model (Gemini, GPT image, Midjourney). Generate 4-8, pick one, then feed it to Tripo or Meshy image-to-3D. If the tool takes multi-view input, generate a back view with the same prompt plus "back view, same character" and give it both.

Each prompt = the **concept frame** + the fighter text.

**Concept frame (start of every concept prompt)**
> Character turnaround concept, front view only, full body from the top of the hair to the soles of the shoes, centred, orthographic camera at chest height, no perspective distortion. Original video game hero rendered as a stylized faceted low-poly 3D model: large flat-shaded triangular facets on skin, hair and clothes, flat colour blocks, no fine texture, no outlines. Soft even studio light from the front, no harsh shadows, no ground shadow. Plain flat light grey background #d9dbe0. A-pose: arms straight, 45 degrees down, palms facing the thighs, fingers slightly apart, legs straight, feet shoulder width. Neutral expression, mouth closed, looking straight at the camera. Empty hands. No weapon, no props, no text, no logo, no watermark, single character.

**Blaze**
> [concept frame] Adult male runner, athletic and compact, average height, about 5.5 heads tall, slightly big head. Warm tan skin with light and dark facets. Big amber eyes with white sclera, dark pupils and one catchlight each, thick dark block brows angled slightly down toward the nose, relaxed confident look. Plum-black hair in five or six large chunky shards swept back and up like a flame, two short shards falling over the forehead, the front shards and the longest back shard dyed orange at the tips. Black over-ear gaming headset with a short boom and a small gold mic tip. Red-orange hoodie with the hood down, rolled as a collar behind the neck, a kangaroo pocket in a darker orange, cream drawstrings. Slim navy joggers. White sneakers with orange soles.

**Hedge**
> [concept frame] Tall, broad adult man, about 6 heads tall, wide trapezoid upper body, big padded shoulders. Ruddy light skin with warm facets. Smaller steel-blue eyes with heavy lids, thick flat silver-grey brows, calm unimpressed look. Bald, faceted top of the head; short warm silver hair at the sides and back. Thick chunky silver beard built from large facets, a slightly darker silver moustache covering the mouth. Octagonal dark-rimmed glasses with clear lenses framing the eyes. Green padded work jacket with darker green shoulder pads, cream shirt front with three dark buttons. Brown work trousers, dark brown work boots.

**Tempo**
> [concept frame] Short adult woman, small slim body, about 4.5 heads tall, big head, clearly an adult. Deep brown skin with warm facets. Big honey-amber eyes, left brow flat, right brow raised, curious cheeky look, small closed mouth. A huge round cloud of dark curly hair built from big faceted puffs, 1.5 times the head width, with the brows visible below it. Goggles with coral frames and yellow lenses pushed up onto the hair. Oversized sky-blue windbreaker with wide cuffs. A coral crossbody strap from the right shoulder to the left hip with a small yellow-lidded canister pouch at the hip. Navy trousers, yellow sneakers.

**Rookie**
> [concept frame] Sturdy young adult man, about 5 heads tall, round friendly face, clearly an adult. Light peach skin with warm facets. Big wide green eyes, ginger brows raised slightly, eager look, closed mouth. Red beanie with a darker red cuff and a white faceted pompom on top, three short ginger bang shards under the cuff, ears showing. Yellow puffer jacket with a puffed band around the middle and a red chest stripe. Blue jeans, red high-top sneakers. Hands 1.4 times normal size with white cloth wraps over the palms and knuckles, fingers open. Navy school backpack with yellow trim, straps over both shoulders.

---

## 6. Technical targets for the delivered model (what the CD needs, not how)

- Generator output: 8-15k triangles. After decimation: **at most 6k triangles in a match** (20 fighters on screen, phones included), and the Fighter screen may use the undecimated or a lighter-decimated version (at most 15k). Engineering may change these numbers with measured frame times; log it.
- Decimation must keep the facet look: flat shading (split normals per face), no smoothing groups. The face must keep its eye shapes: decimate the head less than the body if needed (keep at least 1.5k triangles on the head).
- Colour: albedo only, one texture of at most 512x512 per fighter, or vertex colours. After the recolour pass every §4 colour region matches its hex (§7 item E). No baked lighting or AO in the texture beyond the facet light/dark variation (that variation is wanted, within ±10% value of the base hex).
- Outfits: the Style screen recolours parts. Keep each clothing region a separate flat colour (or a separate material slot) so outfits can still recolour top, pants, shoes and accents. Identity parts (skin, hair, eyes, brows, beard) never recolour.
- Rig: humanoid skeleton from the auto-rigger (Mixamo-compatible names preferred), with head, neck, spine, both arms to the hands, both legs to the toes. Finger bones are optional.

---

## 7. Acceptance criteria (judged from screenshots)

**Review scene (engineering renders, same for every candidate):** the §6.1 Fighter-screen light rig from `fighters-v2.md` (key `#ffe8cc` from camera-left, UI-colour rim), ACES, exposure 1.05, background `#1b1f2e`. Screenshot set per candidate, posted to `ENGINEERING/char-redesign/<fighter>-v3-rN/`:
`front.png`, `three-quarter.png`, `side.png`, `back.png`, `face-crop.png` (head fills 80% of a 600 px square), `hero-1216x684.png`, `tile-1216x684.png`, `match-3m.png` (shoulder camera, 3 m behind, 1216x684), `match-far.png` (fighter 30 px tall), `silhouette-48px.png` (black fill on white, 48 px tall; from step 5 on, all generated fighters side by side), `rig-test.png` (4 frames: run stride, arms raised forward as if holding a rifle, crouch, hit flinch).

**A. Face (the reason for path B)**
- A1. Face crop: both eyes show white sclera, a coloured iris, a dark pupil and a catchlight; the eyes are the same size and level (asymmetry under 10%); the brows are distinct blocks; the nose and mouth are simple planes, not blobs. It should compare with the faces in Reis's reference in quality, without resembling them.
- A2. Fighter-screen tile at 1216x684: the face is at least 40 px tall and both eyes read as white with a dark centre. The personality (§4) is readable without the name.
- A3. Hero at 1216x684: you can tell the expression (Blaze confident, Hedge calm, Tempo curious, Rookie eager) from 1 m away from a laptop screen.
- A4. In match at 3 m: the head reads as a head with hair and a face, not a ball. Eyes may be dots; they must not vanish or turn into dark holes.

**B. Silhouette**
- B1. At 48 px in black, each fighter is identified by shape alone (§3 column "Black shape"). From step 5 on, test all generated fighters side by side; no two may be confused.
- B2. The relative heights match §3 within ±3%. Blaze must not be the tallest.
- B3. In `match-far.png` the Primary colour covers at least 50% of the visible body area.

**C. Style consistency (all four)**
- C1. Faceted and flat-shaded everywhere: no smooth gradients, no subdivided-looking areas, no painted texture detail (stitches, wrinkles, fabric weave, pores).
- C2. Facet size is similar across the four: compared in the same `front.png` framing, the face has roughly the same number of visible facets (about 30-80) on every fighter.
- C3. Same eye construction on all four (sclera, iris, pupil, catchlight; block brows). Same hair language: large chunky shards or puffs, never strands.
- C4. All four look like they come from one game when placed side by side; none drifts into realism, anime cel-shading, or voxel/blocky style.

**D. Mesh quality and rigging**
- D1. No melted geometry: no blobby merged areas, no holes, no floating fragments, no hair growing through the face or ears, no shoes merged with each other.
- D2. Hands: five fingers or a clear mitten with a separate thumb; no fused fingers; hands do not touch the thighs. Rookie's wraps follow the hand shape.
- D3. Clear gaps under the arms and between the legs in A-pose, so the auto-rigger does not weld arm to torso or leg to leg.
- D4. Feet: flat soles, both shoes the same size, toes forward.
- D5. `rig-test.png`: no candy-wrapper twisting at the wrists or shoulders, no torn geometry at the hips or armpits, hair and headgear move with the head, Blaze's headset stays on the ears, Hedge's glasses stay on the face, Tempo's hair cloud does not stretch, Rookie's backpack follows the spine.
- D6. Triangle counts as in §6, stated in the review post.

**E. Colour**
- E1. After the recolour pass, each §4 region matches its hex: sampled on a lit facet in `front.png`, within ±10% value and ±8 degrees hue of the target.
- E2. The Primary sits in the UI colour's hue family after tone mapping: Blaze reads orange (not salmon or red), Hedge green, Tempo sky blue, Rookie yellow.
- E3. No `#000000` and no pure `#ffffff` anywhere on the body; no olive (`#4f5638`, `#3b412a`, `#a08c64`).

**F. Must not change**
- The Fighter screen layout, copy and stats; the no-rifle hero pose rule (`fighters-v2.md` §5, poses rebuilt for the new rig); hitboxes and the sim.

**Verdict rule.** A candidate passes step 3 if A1-A3, B2, C1, D1-D4 pass. A4, B1, B3, D5 and E are checked again in-game at step 4. Reis has the final say on the face.

---

## 8. Limitations of this spec

- The CD has not run Tripo3D or Meshy in this session and has not inspected their current settings; the generator settings in §1 are the CD's working assumptions about these tools (style presets, negative fields, A-pose auto-rig). Engineering should report any setting that does not exist.
- No web research on AI-3D character quality was done this turn. The claim that image-to-3D gives better faces than text-to-3D comes from the request and is treated as an assumption; step 2 runs both to check it.
- Blink and facial animation from path A are dropped (there are no face bones or blendshapes). If engineering can add a simple eyelid blink later, it is welcome, not required.
- AI disclosure: the store pages must state that AI tools were used for 3D character models (CrazyGames already lists Claude and Gemini; add the 3D tool).
