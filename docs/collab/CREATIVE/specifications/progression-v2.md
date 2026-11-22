# Progression v2: a slower level curve and rewards worth wanting

Owner: Creative Director. Date: 2026-11-22. Request: R-011. Replaces the XP, level and unlock parts of
`basic-launch-kpi.md` items 2 and 4. Storage, the `Today` card and the round-report XP lines from those items stay.

## Why

Reis played the build: levels come far too fast, and 11 canopy colours answer "what is their advantage?" with nothing.
What I found in the code:

- `progress.ts` gives a typical first round 110-190 XP (placement x3, 15 per KO, +40 first round, 60 per goal) against
  100 XP for Level 2. Level 2 arrives after one round and Level 10 after roughly 15 rounds, so the bar means nothing.
- Every reward is a canopy. You see your own canopy for about 20 seconds per round, so it does not feel like you own anything.
- Players never see the rewards in the wild. All 19 bots use the classic look, so nobody sees what is waiting for them.

The fix has three parts:

1. **Slower levels.** Rounds give fewer XP, and the curve rises gently.
2. **Rewards you carry all round.** Outfits for the fighter and finishes for the gun show the whole round, from the airstrip to the #1 sticker.
3. **Rewards seen in the wild.** Bots wear rewards, so players see a gold rifle or a Synthwave Hotfix before they own one.

**Nothing gives a gameplay advantage.** Every item changes only how you look. Health, speed, damage, hitboxes, the super
and fire rate stay exactly the same. The answer to Reis's question is "people see it". The UI says this once, plainly
(see "How the UI says looks only").

## 1. XP and the level curve

### XP per round (replaces `roundLines`, `GOAL_XP`, `ALL_GOALS_XP`)

| Line on the report | XP | Notes |
|---|---|---|
| `Round played` | 20 | Every finished round. Even a bad round moves the bar. |
| `Survived 2:31` | 1 per 6 s, max 40 | Shows the time in m:ss. |
| `Outlasted 10` | 2 per fighter outlasted (`total - place`) | #1 of 20 = 38, #10 = 20. |
| `Knock-out` / `Knock-outs x2` | 20 each | |
| `Damage 150` | 1 per 25 | |
| `Win` | 60 | |
| `First round today` | 50 + 10 x min(streak days, 5) | 50-100. On a streak the line reads `First round today, 3-day streak`. |
| goal text (gold) | 75 each | Same as today, gold flash. |
| `All goals done` (gold) | 75 | |

Lines with 0 XP are hidden, as they are today.

Reference rounds (worked out from the table):

| Round | XP |
|---|---|
| #16, 1:10, no KO, 40 dmg | 40 |
| #10, 2:30, 1 KO, 150 dmg | 91 |
| #4, 3:30, 2 KO, 300 dmg | 139 |
| #1, 4:00, 4 KO, 500 dmg | 258 |

An average new player earns about 65 XP per round, before the day bonus and the goals.

### Curve (replaces `xpToNext`)

`xpToNext(level) = min(900, 230 + 35 * (level - 1))`

| Level | XP to next | Total XP to reach it |
|---|---|---|
| 2 | 265 | 230 |
| 3 | 300 | 495 |
| 4 | 335 | 795 |
| 5 | 370 | 1,130 |
| 6 | 405 | 1,500 |
| 7 | 440 | 1,905 |
| 8 | 475 | 2,345 |
| 9 | 510 | 2,820 |
| 10 | 545 | 3,330 |
| 12 | 615 | 4,455 |
| 15 | 720 | 6,405 |
| 20 | 895 | 10,355 |
| 21+ | 900 each | |

Pacing, from a quick model. Each round gives the average above, plus the first-round bonus, plus 1-3 daily goals done
early in the day.

| Player | Level 2 | Level 5 | Level 10 | Level 20 |
|---|---|---|---|---|
| Hooked: 10 rounds on day 1, then 6 a day, all goals | round 2 | day 2 (round ~11) | day 4 (~25 rounds) | day 12 (~76) |
| Casual: 4 rounds a day, 5 days a week, 2 goals | round 2 | day 4 (round ~9) | about a week of play (~26 rounds) | about 4 weeks (~80) |
| Light: 3 rounds every other day, 1 goal | round 2 | day 7 (round ~10) | ~28 rounds | ~88 rounds |

What the targets mean for one session. A 10-minute session is about three rounds. It ends with Level 2 reached and the
Level 3 bar more than half full, which is the "one more round" hook. Level 5 comes on day 1-2 for a hooked player.
Level 10 takes about a week of casual play. Level 20 is for loyal players. Levels above 20 keep counting (900 XP each)
and have no new rewards in v2.

### Existing saves

Never take anything away from a player:

- Keep `level` as saved.
- Clamp `xp` to `xpToNext(level) - 1`.
- Grant everything the new table gives at or below the saved level.
- Map old canopy ids into the new unlock list.

Old over-levelled saves will own a lot early. That is fine, because there are few web players before Basic Launch. For
testing on the web build only, add a `?career=reset` flag, so Reis can replay the curve from Level 1.

## 2. The reward track

Rewards come in four kinds:

- **Outfit**: a colour scheme for the fighter.
- **Gun finish**: one finish that applies to every gun you hold.
- **Canopy**: the minor reward that fills the levels between the bigger ones.
- **Drop smoke**: a trail in the sky.

Outfits come in sets: each one unlocks for all four fighters at once, so a reward never lands on a fighter you do not
play. The three milestones are marked ★.

| Level | Reward | Kind |
|---|---|---|
| 1 | Standard outfits, Factory finish, Classic canopy | start |
| 2 | Mint stripes | canopy |
| 3 | **Dark Mode** | outfit set |
| 4 | **Arctic** | gun finish |
| 5 ★ | **Drop Smoke** (your canopy's colour) | sky trail |
| 6 | Navy chevron | canopy |
| 7 | **Arctic** | outfit set |
| 8 | **Cherry** | gun finish |
| 9 | Checker | canopy |
| 10 ★ | **Gold Build** gun finish + Gold cells canopy | bundle |
| 11 | Two-tone split | canopy |
| 12 | **Synthwave** | outfit set |
| 13 | Sunset | canopy |
| 14 | **Terminal** | gun finish |
| 15 | Rainbow cells | canopy |
| 16 | Night | canopy |
| 17 | **Terminal** | outfit set |
| 18 | **Synthwave** | gun finish |
| 19 | Rainbow smoke | smoke colour |
| 20 ★ | **Legend** outfit set + Legend canopy | bundle |
| streak 3 days | Teal waves | canopy |
| streak 7 days | **Ember** canopy + **Ember** gun finish | bundle |

Totals: 6 outfit sets (Standard plus 5), 7 gun finishes (Factory plus 6), 12 canopies (the 11 existing plus Legend), and
3 smoke settings (Off, Canopy colour, Rainbow).

From Level 2 to Level 20, one reward of the same kind never comes two levels in a row. A player who plays one fighter
gets something new on their own fighter at Levels 3, 7, 12, 17 and 20, and in their hand at Levels 4, 8, 10, 14 and 18.

### Rules for every outfit

These rules are about readability and fairness.

- **The silhouette never changes.** Keep the hood, beard, glasses, hair cloud, beanie and backpack. An outfit changes only colours.
- **Skin, hair and beard colours never change.**
- **No camouflage.** The top and trousers are never mid-green, olive or brown, so no outfit blends into the grass or the
  dirt. Legacy's default green stays, because it is the fighter's own colour.
- **Nothing very dark.** No main colour is darker than `#1c2024` (the rim light needs something to light).
- **Only Terminal and Legend glow.** They may use one emissive or metal material, which adds at most one draw call per
  fighter wearing them. Every other set only changes vertex colours: `skinRig` bakes colour per vertex, so the draw
  calls do not change.

### Outfit parts (names refer to `characters.ts`)

The outfit fields map onto the rig like this:

- **For every fighter:**
  - `top` covers the torso, upper arms, elbows and forearms.
  - `pants` covers the thighs, knees and shins.
  - `shoes` covers the shoes.
  - `kit` covers the shared pack (`olive`), the flap and pouches (`oliveDark`) and the roll (`tan`).
- **Per fighter:**
  - Hotfix: `hood`, `pocket`, `headset` (band, cups, boom), `strings`.
  - Legacy: `shirt` (the front panel), `buttons`, `lens` (the rims).
  - Standup: `lanyard`, `badge`.
  - Intern: `stripe`, `beanie`, `cuff`, `pom`, `bag` (the backpack), `bagTrim` (the flap and straps).

Belt, buckle, holster, vest and straps keep their current colours unless a cell below says otherwise.

Standard is the colours in the code today.

#### Dark Mode (Level 3)

The body is charcoal, and each fighter's own colour shows only on the signature pieces. The kit stays as it is.

| Fighter | top | pants | shoes | signature parts |
|---|---|---|---|---|
| Hotfix | `#262a35` | `#171a22` | `#f2542d` | hood `#f2542d`, pocket `#1b1f2e`, headset `#1b1f2e`, strings `#f2542d` |
| Legacy | `#262a35` | `#171a22` | `#2ec27e` | shirt `#3a3f4d`, buttons `#2ec27e`, lens `#2ec27e` |
| Standup | `#262a35` | `#171a22` | `#3ec5ff` | lanyard `#3e7bfa`, badge `#3ec5ff` |
| Intern | `#262a35` | `#171a22` | `#ffc93c` | stripe `#ffc93c`, beanie `#262a35`, cuff `#ffc93c`, pom `#ffc93c`, bag `#ffc93c`, bagTrim `#c98a1b` |

#### Arctic (Level 7)

White and ice blue. Snow kit: pack `#dfe6ee`, flap and pouches `#b9c4d0`, roll `#8fa3b8`.

| Fighter | top | pants | shoes | signature parts |
|---|---|---|---|---|
| Hotfix | `#f4f6fa` | `#8fa3b8` | `#5aa9e6` | hood `#f4f6fa`, pocket `#bfd6ea`, headset `#2b3045`, strings `#5aa9e6` |
| Legacy | `#f4f6fa` | `#8fa3b8` | `#2b3045` | shirt `#bfd6ea`, buttons `#2b3045`, lens `#5aa9e6` |
| Standup | `#f4f6fa` | `#8fa3b8` | `#5aa9e6` | lanyard `#5aa9e6`, badge `#bfd6ea` |
| Intern | `#f4f6fa` | `#2b3045` | `#5aa9e6` | stripe `#5aa9e6`, beanie `#5aa9e6`, cuff `#bfd6ea`, pom `#f4f6fa`, bag `#bfd6ea`, bagTrim `#8fa3b8` |

#### Synthwave (Level 12)

Pink, purple and cyan. Kit: pack `#2a1f4d`, flap and pouches `#1c1440`, roll `#ff5fa2`.

| Fighter | top | pants | shoes | signature parts |
|---|---|---|---|---|
| Hotfix | `#6b3fd1` | `#2a1f4d` | `#3ef0ff` | hood `#ff5fa2`, pocket `#2a1f4d`, headset `#2a1f4d`, strings `#3ef0ff` |
| Legacy | `#6b3fd1` | `#2a1f4d` | `#ff5fa2` | shirt `#ff5fa2`, buttons `#3ef0ff`, lens `#3ef0ff` |
| Standup | `#ff5fa2` | `#2a1f4d` | `#3ef0ff` | lanyard `#3ef0ff`, badge `#6b3fd1` |
| Intern | `#ff5fa2` | `#2a1f4d` | `#3ef0ff` | stripe `#3ef0ff`, beanie `#6b3fd1`, cuff `#2a1f4d`, pom `#3ef0ff`, bag `#6b3fd1`, bagTrim `#ff5fa2` |

#### Terminal (Level 17)

Near-black with phosphor green. Kit: pack `#1c2420`, flap and pouches `#141a17`, roll `#39ff88`. Parts marked **glow**
use one shared emissive material: colour `#39ff88`, emissive `#39ff88`, intensity 0.6.

| Fighter | top | pants | shoes | signature parts |
|---|---|---|---|---|
| Hotfix | `#1c2420` | `#141a17` | `#39ff88` | hood `#1c2420`, pocket `#1f6b45`, headset `#1f6b45`, mic **glow**, strings `#39ff88` |
| Legacy | `#1c2420` | `#141a17` | `#1c2420` | shirt `#1f6b45`, buttons `#39ff88`, lens **glow** |
| Standup | `#1c2420` | `#141a17` | `#39ff88` | lanyard `#39ff88`, badge **glow** |
| Intern | `#1c2420` | `#141a17` | `#39ff88` | stripe **glow**, beanie `#1c2420`, cuff `#1f6b45`, pom `#39ff88`, bag `#1c2420`, bagTrim `#39ff88` |

#### Legend (Level 20 ★)

Black and polished gold. This is the set people should notice across the map. Parts marked **gold** use one shared
metal material: colour `#ffc23d`, metalness 0.85, roughness 0.28, emissive `#2a1a00`. On every fighter, Legend also changes:

- Kit: pack `#23262f`, flap and pouches `#1c2024`, roll **gold**.
- Buckle: **gold**.
- Belt: `#1c2024`.

| Fighter | top | pants | shoes | signature parts |
|---|---|---|---|---|
| Hotfix | `#1c2024` | `#23262f` | **gold** | hood `#1c2024`, pocket `#23262f`, headset **gold**, mic stays gold, strings **gold** |
| Legacy | `#1c2024` | `#23262f` | `#1c2024` | shirt `#f4f2ea`, buttons **gold**, lens **gold** |
| Standup | `#1c2024` | `#23262f` | **gold** | lanyard **gold**, badge **gold** |
| Intern | `#1c2024` | `#23262f` | **gold** | stripe **gold**, beanie `#1c2024`, cuff **gold**, pom **gold**, bag `#23262f`, bagTrim **gold** |

### Gun finishes (`guns.ts`: one material set per finish)

A finish is a different set of the `M` materials: `steel`, `dark`, `polymer`, `walnut`, `olive`, `tan`, `brass`, `red`,
`glass`.

- **Cost.** `mergeRigid` already merges one mesh per material, so a finish adds no draw calls. Cache one material set per finish.
- **Where it shows.** The finish is on the guns in your hands, and on other fighters' guns.
- **Where it does not.** Ground loot always stays Factory, so players recognise loot by its shape and colour, as today.
  Bombs stay Factory.
- **No patterns.** From the gameplay camera a gun is 20-40 px long, so only blocks of colour and the metal sheen read.

Each cell gives colour, metalness `m`, roughness `r` and emissive `e`; `-` means unchanged.

| Finish | steel | dark | polymer | walnut / olive / tan | brass / red | glass |
|---|---|---|---|---|---|---|
| Factory (L1) | as today | as today | as today | as today | as today | as today |
| Arctic (L4) | `#8c97a3` m.5 r.4 | `#2b3045` | `#e9edf2` r.7 | `#dfe6ee` r.75 | `#5aa9e6` | - |
| Cherry (L8) | `#2a2c31` m.6 r.35 | `#15171d` | `#c8202f` r.35 | `#c8202f` r.35; tan `#f4f2ea` | `#f4f2ea` | - |
| Gold Build (L10 ★) | `#ffc23d` m.9 r.22 e`#2a1a00` | `#d9961a` m.85 r.3 | `#1c2024` r.6 | `#1c2024` | `#fff0b0` m.6 | `#ffe08a` e`#3a2a00` |
| Terminal (L14) | `#1c2420` m.4 r.5 | `#0b0f0d` | `#141a17` | `#1c2420` | `#39ff88` e`#39ff88` (intensity 0.8) | `#39ff88` e`#1f6b45` |
| Synthwave (L18) | `#d6dcff` m.85 r.25 | `#2a1f4d` | `#6b3fd1` | `#ff5fa2` | `#3ef0ff` e`#1a6b70` | `#3ef0ff` |
| Ember (streak 7) | `#2a1210` m.5 | `#150a08` | `#3a1410` | `#d9261c` | `#ffb020` e`#5a2a00` | - |

On the launcher, the `red` warning band takes the finish's brass/red colour (a green line on Terminal, a pale gold line on Gold Build).

### Canopies

The existing 11 keep their looks and only move levels, as in the track above:

| Canopy | was | now |
|---|---|---|
| Mint stripes | L2 | L2 |
| Navy chevron | L4 | L6 |
| Checker | L7 | L9 |
| Gold cells | L5 | L10 |
| Two-tone split | L10 | L11 |
| Sunset | L3 | L13 |
| Rainbow cells | L15 | L15 |
| Night | L20 | L16 |

Teal waves (streak 3) and Ember (streak 7) do not change.

One canopy is new:

| id | name | from | a | b | pattern |
|---|---|---|---|---|---|
| `legend` | Legend | L20 | `#1c2024` | `#ffc23d` | `cells` |

### Drop Smoke (Level 5 ★)

This is the first big reward. During the drop the sky is full of jumpers, and only you leave a coloured trail. Everyone
in the air sees it.

- **When.** Free fall and canopy only. It stops at touchdown, and the puffs already in the air fade over their life. No
  smoke on the ground, so it never marks you in a fight.
- **Emitter.** At the feet (the midpoint of the shoes). One puff every 0.05 s in free fall and every 0.08 s under the canopy.
- **Puff.** A camera-facing soft disc (reuse a vfx puff sprite if there is one, otherwise a radial-gradient texture).
  Size 0.6 m growing to 2.2 m over a 2.5 s life, ease-out. Opacity 0.55 falling to 0, depthWrite off. It drifts 0.3 m/s
  up and away from the camera.
- **Colour.** Default `Canopy colour`: the equipped canopy's `a`; with Classic, the fighter colour from `FIGHTERS`.
  `Rainbow` (L19) moves the hue one full turn every 3 s.
- **Budget.**
  - At most 40 live puffs per jumper.
  - At most 4 jumpers with smoke at a time: you plus the 3 nearest bots that have it.
  - Low tier: 20 puffs per jumper, and only your own smoke.
  - One instanced mesh for all puffs, so +1 draw call.
- **Off.** `Off` is always an option in Style, for players who do not want the trail.

## 3. Where rewards live

### How the UI says looks only

- One sentence, shown at the top of the Style tray every time: **`Looks only. Stats never change.`**
- No item shows a number, a bar, a rarity colour or a "+%" anywhere.
- Fighter cards keep their speed and super bars. Those belong to the fighter, never to an outfit.
- The first reward card a player ever sees (Level 2) adds one line: **`Everyone can see it. Nobody gets stronger.`**

### Lobby (PreMatch): the Style row

The `Canopy` swatch row under the fighter cards is replaced by one **Style** row of four slots in a line:
**Outfit**, **Gun**, **Canopy**, **Smoke**.

- **Slot.** 44 x 44 px (touch minimum), with the equipped item's chip inside and a plain sentence-case caption under it
  (`Outfit`, `Gun`, `Canopy`, `Smoke`; 12 px, cream at 65 %). No uppercase labels and no headings above the row.
- **New.** A 6 px gold dot on a slot's top-right while that category holds something new and unseen. It clears when the
  player opens that category.
- **Tray.** Tapping a slot opens its tray.
  - Desktop: under the row, items 44 x 44 in a wrapping grid of up to 8 per line.
  - Phones (portrait, or landscape at 500 px height or less): a bottom sheet of at most 50 % height, with a close bar.
  - Esc, tapping outside, or tapping the slot again closes it.
- **Tray header.** One line: `Looks only. Stats never change.` For Outfit, it ends with the fighter's name:
  `Dark Mode for Hotfix`.
- **Unlocked item.** A tap equips it at once (uiTick). The selected item has a 2 px cream border.
- **Locked item.** Shown at 60 % opacity with `Lv 12` (or `3 days` for a streak item) in 10 px bold. A tap previews it
  but cannot equip it. Outfits and finishes appear on the 3D staging fighter, and the tray footer reads
  `Unlocks at Level 12. You are Level 6.` Closing the tray, or tapping an unlocked item, goes back to what is equipped.
  Seeing the locked set on your own fighter is the strongest pull of all.
- **Live preview.** Outfit and Gun repaint the staging fighter (rebuild the rig with the outfit, rebuild the gun with
  the finish). Canopy and Smoke show only in their chips, because the airstrip scene has no canopy.
- **Ready.** After `Ready` the whole row is disabled, as the canopy row is today.
- **Outfits per fighter.** Each fighter keeps its own outfit: Hotfix in Synthwave and Intern in Arctic is allowed. Gun
  finish, canopy and smoke apply to all fighters.

Chips (the same skewed language as today's canopy swatch, `-skew-x-12`):

- **Outfit**: three vertical bands, top 50 %, the main signature part 25 % and trousers 25 %, in the colours of the
  fighter being edited.
- **Gun**: two bands, steel and polymer, with a 2 px line in the brass/red colour across them. Gold Build uses a
  gradient `#ffe08a` to `#ffc23d` to `#d9961a`; Synthwave and Arctic steel get a light-to-dark sheen gradient.
- **Canopy**: today's `canopySwatch`.
- **Smoke**: a soft radial puff of the colour; a rainbow gradient for Rainbow; a crossed grey circle for Off.

### Main menu: the next reward

Under the `LevelBar`, one line: `Next at Level 4: Arctic gun finish`, followed by a 24 x 14 chip.

- If a ★ milestone is within two levels, show the milestone instead, in gold: `Level 5: Drop Smoke`.
- Above Level 20 the line is hidden.

The `Today` card gets one line under the goals while a streak runs: `3-day streak. Day 7 unlocks Ember.` After day 7 it
reads `8-day streak.`

### Round report: the unlock moment

This replaces the `Level up!` text and the `New canopy:` line in `XpPanel`. The XP lines, their timing and the bar stay.

1. The bar fills (0.7 s, as today). On a level-up it fills to 100 %, flashes gold-white `#fff0b0` for 0.15 s, and refills
   from 0 to the new XP.
2. The `Level N` text pops: scale 1.25 to 1 over 0.25 s, ease-out, in gold, with `uiTick(true)`.
3. 0.3 s later the **reward card** rises in (riseIn, 0.3 s):
   - `panel-cut`, background `ink-deep`, with a 2 px border in the item's main colour.
   - Left: the chip at 64 x 40. A white diagonal band at 30 % opacity sweeps across it once in 0.6 s.
   - Right, in the display face at 20 px in cream: the item name and kind, e.g. `Arctic gun finish`,
     `Dark Mode outfits`, `Navy chevron canopy`.
   - Under it, in 14 px cream at 70 %: `On for your next drop.`
   - Sound: `uiImpact(0.4)`.
4. **Milestones (5, 10, 20)** get a bigger card:
   - Full panel width, a gold `#ffc23d` border, and a chip at 96 x 56.
   - A title line in gold: `Level 10 reward`.
   - 14 small gold and fighter-colour squares burst from the chip over 0.8 s.
   - Sound: `uiWhoosh()` then `uiImpact(0.8)`, plus `platform.happytime()` (already called on every level-up).
   - Name lines: L5 `Drop Smoke: your trail in the sky`, L10 `Gold Build: every gun in gold`,
     L20 `Legend outfits for all four fighters`.
5. **Several unlocks in one round** (a streak bundle, two levels at once): show at most 2 cards. If there are more,
   end with the line `+1 more in Style`.
6. **No level-up.** Under the bar, in 14 px cream at 60 %: `Next at Level 6: Navy chevron canopy`, using the same
   milestone rule as the menu.
7. **Auto-equip.** A new item is equipped at once (outfit sets on the fighter just played), so the very next drop shows
   it. This keeps today's canopy behaviour. It is never equipped over a choice the player made in the same lobby visit.
8. **Reduced motion.** Everything shows at once: no sweep, no burst, no pop.

### Bots wear rewards (render only)

This is how players learn what exists. Each bot's look is picked from a hash of the match seed and the bot id, in the
renderer only. The sim stays deterministic, and nothing goes over the network.

| Kind | Odds |
|---|---|
| Outfit | Standard 55 %, Dark Mode 15, Arctic 10, Synthwave 8, Terminal 7, Legend 5 |
| Gun finish | Factory 60 %, Arctic 10, Cherry 10, Gold Build 7, Terminal 6, Synthwave 4, Ember 3 |
| Canopy | Classic 50 %; the other 11 share the rest evenly |
| Smoke | 20 % Canopy colour |

Online matches are not in the portal build, so in v2 online shows the default look. Sending look ids in the join
message comes later.

## 4. Daily goals and streak, tuned

- Three goals per local day, from the same pool and seed. `Win a round` needs Level 8 (it was 5, but Level 5 now comes
  on day 2).
- 75 XP per goal, plus 75 when all three are done. A full goal day is worth 300 XP, about 4.5 average rounds, which is
  a strong reason to come back without letting goals carry the curve.
- First round today: 50 + 10 per streak day, up to +100 at 5 days or more. This makes the streak worth something every
  day, not only on days 3 and 7.
- Streak: days in a row with at least one goal done (unchanged). Missing a day starts again at 1. Day 3 unlocks Teal
  waves. Day 7 unlocks Ember (canopy and gun finish).

## Data (a suggestion; engineering decides)

`Career` becomes `v: 2`, with these fields:

- `unlocked: string[]`, with kind-prefixed ids: `outfit:darkmode`, `finish:gold`, `canopy:mint`, `smoke:canopy`.
- `look: { outfit: Record<FighterId, string>, finish, canopy, smoke }`
- `seen: string[]` (for the gold dots).

A v1 save maps its plain canopy ids to `canopy:<id>`, and `canopy` to `look.canopy`. One catalogue file (for example
`cosmetics.ts`, which can absorb `canopies.ts`) holds the track table, so the report, the menu and the lobby all read
the same source.

## Build order (about 1 day)

1. XP and curve numbers, goals, streak bonus, and save migration with tests (1 h).
2. The catalogue and unlock table, replacing `canopiesForLevel` (1 h).
3. Outfits in `buildRig(id, outfit)` (2 h).
4. Finishes in `buildGun(kind, finish)`, with cached material sets (1 h).
5. The report reward card and the menu's next-reward line (1.5 h).
6. The lobby Style row, tray and locked preview (2 h).
7. Drop Smoke (1.5 h).
8. Bot looks (0.5 h).

If the day runs out, cut in this order:

- Bot smoke.
- Then the locked preview, so locked items only show `Lv N`.

Never cut Drop Smoke, because Level 5 must stay a real moment.

## Acceptance

- A fresh profile reaches Level 2 on round 2 or 3 of typical play, not round 1. Test this with the reference rounds:
  round 1 at 91 XP plus 50 first-round XP stays under 230.
- `xpToNext(1..21)` match the table. A Level 5 save needs 370 XP to reach Level 6.
- At every level from 1 to 20, the lobby shows exactly the rewards in the track table as unlocked, and the rest show `Lv N`.
- All four fighters in all six outfit sets keep their silhouettes. On a contact sheet at 390 x 844 from the gameplay
  camera, each set still reads as the same four people.
- Draw calls with 20 fighters: Standard and the four colour-only sets add nothing. Terminal and Legend add at most one
  per fighter wearing them. Gun finishes add nothing. Drop Smoke adds at most one in total.
- Ground loot is Factory in every finish.
- No item shows a stat anywhere. `Looks only. Stats never change.` is in the Style tray.
- A Level 4 to 5 round shows the gold milestone card, and the next drop trails smoke in the canopy colour. After
  touchdown no smoke is emitted.
- A reload keeps the level, the unlocks and every equipped item.

## Must not change

- The sim, hitboxes, stats, ground loot looks and the 11 existing canopy patterns.
- Skin and hair colours, and fighter silhouettes.
- The report's XP-line rhythm (0.15 s) and the bar.
- No eyebrow labels, no pop-ups on menu open, no paid or ad-gated items.
