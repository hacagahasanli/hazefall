# Weapon balance

Every gun owns a distance and none is best everywhere. The numbers below come from `src/game/sim/balance.ts`, a pure
calculator that uses the same constants and rules as the sim, and `src/game/sim/balance.test.ts` holds each gun to its
role, so a later change to `WEAPONS` can't quietly break balance. Print the current table with
`npx tsx scripts/balance-table.ts`.

## Roles

| Gun | Role | Held by the test |
|---|---|---|
| Shotgun | Close-range king | One pump kills bare and two kill through a Vest III out to 6 m. Fastest gun of all within 6 m. Under 10 damage a pump past 15 m. |
| SMG | Fastest from 7 to 12 m, falls off hard | Fastest gun at 9 to 12 m. Beats the rifle and pistol at every distance up to 12 m. Under a quarter of its damage past 30 m, and at least 1.4x slower than the rifle from 20 m. |
| Rifle | Reliable at mid and long range | Fastest gun from 20 to 50 m. Slower than the SMG and the shotgun inside 6 m. Keeps at least half its damage at any range. |
| Pistol | Baseline | Never the fastest anywhere, but finishes a bare fighter with the rounds it's found with out to 50 m. Three shots up close. |
| Sniper | Long range, slow | 2 hits on bare health and 3 through a full vest at every range up to 150 m and every grade. Fastest from 70 m on. At least 1.4 s between shots. |
| Rockets | Rare power weapon | A direct hit downs a bare fighter, a vest survives one. One round per magazine, a 16 m/s rocket you can see coming, and only in tier 3 loot (1 ticket). |

Rarity stays modest: a prime gun saves at most one shot (or 12 % of a long string of shots).

## How the numbers are worked out

- **Ticks**: the sim runs at 60 Hz and a gun fires once its cooldown, counted down by 1/60 s per tick, reaches 0, so the
  real gap between shots is the rate rounded up to whole ticks (the pistol's 0.35 s is 22 ticks, 0.367 s; the SMG's
  0.09 s is 6 ticks, 0.100 s).
- **Hit chance**: a bullet hits if it passes within 0.7 m of the target's centre (`PLAYER_RADIUS + 0.15`). A single
  bullet gets random jitter across its spread, so its hit chance at distance d is the share of the spread that falls
  inside `2 asin(0.7 / d)`. The shotgun's pellets are spread evenly over its fan, so the calculator counts the ones
  that pass within 0.7 m.
- **Falloff**: full damage up to `falloff.start`, linear down to `falloff.min` at `falloff.end`, measured over the
  distance the bullet flew (from the muzzle 0.6 m in front of the shooter to the edge of the body).
- **TTK**: the expected trigger pulls to deal 100 (bare) or 200 (100 health + Vest III, which soaks hits 1:1), the
  whole-tick gaps between them, a reload whenever the magazine runs dry, plus the last bullet's flight time. "n/a" means
  the gun can't do it at that range with the rounds it's found with. Perfect aim at a target standing still, from a full
  magazine: real fights are slower, but the order between the guns is what matters.
- **Rockets**: a direct hit goes off at the body's edge (0.8 m from the centre), so it deals `1 - 0.7 * 0.8 / 3` of its
  damage, 81 %.
- **DPS**: burst is one magazine with every pellet on target; sustained adds the reload once per magazine.

Fists are melee only (1.6 m): 15 a hit every 0.467 s, so they show "n/a" at 5 m and beyond.

## Before

Common grade, TTK in seconds with the trigger pulls in brackets.

| Weapon | Dmg | RPM | Burst DPS | Sustained DPS | Mag/reserve | Reload | TTK 100 @5 m | TTK 200 @5 m | TTK 100 @20 m | TTK 200 @20 m | TTK 100 @50 m | TTK 200 @50 m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fists | 15 | 129 | 32 | 32 | - | - | n/a | n/a | n/a | n/a | n/a | n/a |
| Pistol | 34 | 164 | 93 | 79 | 12/24 | 1.1 s | 0.88 s (3) | 1.98 s (6) | 1.69 s (4) | 2.79 s (7) | 4.04 s (8) | 7.70 s (16) |
| SMG | 22 | 600 | 220 | 143 | 30/60 | 1.7 s | 0.54 s (5) | 1.04 s (10) | 1.36 s (9) | 2.16 s (17) | 7.59 s (47) | n/a |
| Shotgun | 14x7 | 71 | 115 | 91 | 6/12 | 2.2 s | 1.88 s (3) | 3.58 s (5) | n/a | n/a | n/a | n/a |
| Rifle | 30 | 360 | 180 | 127 | 25/50 | 1.9 s | 0.60 s (4) | 1.10 s (7) | 0.92 s (4) | 1.42 s (7) | 2.21 s (8) | 3.38 s (15) |
| Sniper | 80 | 43 | 57 | 49 | 5/5 | 2.6 s | 1.46 s (2) | 2.86 s (3) | 1.65 s (2) | 3.05 s (3) | 2.02 s (2) | 3.42 s (3) |
| Rockets | 110 | 50 | 92 | 46 | 1/3 | 2.4 s | 2.71 s (2) | 5.11 s (3) | 3.65 s (2) | 6.05 s (3) | 5.53 s (2) | 7.92 s (3) |

Fastest gun by distance before: SMG from 0 to 12 m (the shotgun was never fastest anywhere), rifle from 15 to 40 m,
sniper from 60 m.

Problems:

- **The shotgun was a trap.** Seven pellets over a 0.5 rad fan meant only 3 connected at 5 m and 1 past 9 m, so it took
  three pumps (1.9 s) to finish a bare fighter at 5 m, slower than every other gun, and it did nothing past 12 m.
- **The rifle was the best gun from 13 m outwards and almost the best up close** (0.60 s at 5 m against the SMG's
  0.54 s), with half damage at any range, so there was rarely a reason to carry anything else.
- **The sniper lost its two-shot kill past about 90 m** (56 damage at 100 m) and its 1.4 s gap was the same as the
  rocket's.
- **Rockets did 89 on a direct hit**, so even the rare power weapon needed two hits on a bare fighter.

## After

| Weapon | Dmg | RPM | Burst DPS | Sustained DPS | Mag/reserve | Reload | TTK 100 @5 m | TTK 200 @5 m | TTK 100 @20 m | TTK 200 @20 m | TTK 100 @50 m | TTK 200 @50 m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fists | 15 | 129 | 32 | 32 | - | - | n/a | n/a | n/a | n/a | n/a | n/a |
| Pistol | 34 | 164 | 93 | 79 | 12/24 | 1.1 s | 0.88 s (3) | 1.98 s (6) | 1.69 s (4) | 2.79 s (7) | 4.04 s (8) | 7.70 s (16) |
| SMG | 22 | 600 | 220 | 143 | 30/60 | 1.7 s | 0.54 s (5) | 1.04 s (10) | 1.46 s (10) | 2.36 s (19) | 10.99 s (65) | n/a |
| Shotgun | 13x8 | 75 | 130 | 101 | 6/12 | 2.2 s | 0.18 s (1) | 0.98 s (2) | n/a | n/a | n/a | n/a |
| Rifle | 28 | 360 | 168 | 119 | 25/50 | 1.9 s | 0.60 s (4) | 1.27 s (8) | 0.92 s (4) | 1.58 s (8) | 1.88 s (6) | 2.88 s (12) |
| Sniper | 80 | 40 | 53 | 46 | 5/5 | 2.6 s | 1.58 s (2) | 3.10 s (3) | 1.77 s (2) | 3.28 s (3) | 2.14 s (2) | 3.66 s (3) |
| Rockets | 125 | 50 | 104 | 52 | 1/3 | 2.4 s | 0.31 s (1) | 2.71 s (2) | 1.25 s (1) | 3.65 s (2) | 3.13 s (1) | 5.53 s (2) |

Fastest gun by distance after (bare and geared): shotgun from 0 to 6 m, SMG from 7 to 14 m, rifle from 15 to 50 m,
sniper from 60 m.

Expected damage per trigger pull (pellets that connect for the shotgun):

```
Fists    2m 15.0  5m 0.0  8m 0.0  12m 0.0  15m 0.0  20m 0.0  30m 0.0  50m 0.0  100m 0.0
Pistol   2m 34.0  5m 34.0  8m 34.0  12m 34.0  15m 32.8  20m 29.1  30m 21.8  50m 12.7  100m 0.0
SMG      2m 22.0  5m 22.0  8m 22.0  12m 22.0  15m 19.1  20m 11.1  30m 3.1  50m 1.5  100m 0.0
Shotgun  2m 104.0[8]  5m 104.0[8]  8m 72.5[6]  12m 27.6[4]  15m 6.0[2]  20m 2.6[2]  30m 2.6[2]  50m 0.0[0]  100m 0.0[0]
Rifle    2m 28.0  5m 28.0  8m 28.0  12m 28.0  15m 28.0  20m 28.0  30m 27.0  50m 17.1  100m 6.2
Sniper   2m 80.0  5m 80.0  8m 80.0  12m 80.0  15m 80.0  20m 80.0  30m 80.0  50m 80.0  100m 72.3
Rockets  2m 101.7  5m 101.7  8m 101.7  12m 101.7  15m 101.7  20m 101.7  30m 101.7  50m 101.7  100m 0.0
```

## What changed and why

| Gun | Before | After | Why |
|---|---|---|---|
| Shotgun | 14 x 7 pellets, 0.5 rad fan, 0.85 s, falloff 5 to 18 m (x0.15), range 45 m | 13 x 8 pellets, 0.22 rad fan, 0.80 s, falloff 6 to 15 m (x0.1), range 30 m | The tighter fan lands all 8 pellets out to 6.4 m: one pump (104) downs a bare fighter and two (208) a Vest III. It still spreads to 4 pellets at 12 m and 2 at 15 m with steep falloff, so it's useless past 15 m. 0.80 s keeps the two-pump kill through a vest just ahead of the SMG at 5 m. |
| SMG | falloff 10 to 35 m (x0.35) | falloff 12 to 30 m (x0.25) | Full damage to 12 m so it owns 7 to 12 m, then it drops off faster and lower, so it can't fight the rifle at range. |
| Rifle | 30 damage, spread 0.04, falloff 20 to 60 m (x0.5) | 28 damage, spread 0.035, falloff 25 to 70 m (x0.55) | A little less damage means 8 hits through a vest instead of 7, so the SMG out-kills it up close; the tighter spread and longer falloff make it better where it belongs, at 20 to 50 m. Still 4 hits on bare health. |
| Sniper | 1.4 s, falloff 40 to 100 m (x0.7) | 1.5 s, falloff 60 to 120 m (x0.85) | Keeps 2 hits bare and 3 geared at every range out to its 160 m reach (68 damage at the floor), and a slower trigger so missing hurts. |
| Rockets | 110 | 125 | A direct hit (81 % of the damage at the body's edge) now deals 102, enough to down a bare fighter; a vest survives one. Still one round per magazine, a slow rocket and tier 3 loot only. |
| Pistol, fists | unchanged | unchanged | The pistol is the baseline everything else is measured against. |

Scope sway: the sniper has no sway in the sim (the scope is a camera zoom only, and the sniper has no spread), so there
is nothing to tune there. If unscoped shots ever feel too easy, a small spread when not scoped is the place to add it.

## Pacing check

40 bot matches (`npx tsx scripts/bot-sim.ts 40 1`, seeds 1 to 40), before and after:

| | Before | After |
|---|---|---|
| Match length from Play, median | 3:53 | 3:50 |
| p10 / p90 | 3:08 / 5:08 | 3:09 / 5:00 |
| Dead air after the first ground minute | 16.8 % of 20 s windows | 15.8 % |
| Fights per minute, early / mid | 9.80 / 6.75 | 8.70 / 6.77 |
| Alive at 2:00 / 3:00 / 4:00 | 11.2 / 5.2 / 2.1 | 11.3 / 5.7 / 2.4 |
| Passive stand-in: average placement, wins | 8.2, 7 of 40 | 9.7, 1 of 40 |

Matches last as long as before and dead air is about the same. The passive stand-in (it only shoots back) places a little
worse, since bots that close in with a shotgun now finish it.
