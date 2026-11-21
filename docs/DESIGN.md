# Last Commit Standing: design

A Nalbaki Games game. **Top-down battle royale for 20 players in short rounds (~4 minutes: the Deadline takes about 3 min 45 s from landing to the last circle).**
The Deadline closes in, the office shrinks, and the last developer standing ships.

Everything here is original: names, characters, abilities, items, art and rules. The genre (a
top-down arena shooter with a shrinking zone) is shared with many games; nothing specific to any
one of them is copied.

## The flow

```
Title ──▶ Pick a fighter ──▶ Lobby (online: invite / quick match · offline: vs bots)
                                   │
                                   ▼
              Drop-in: 20 fighters spawn around the edge of the campus
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        │  Loot: smash server racks for Power Cells,          │
        │        pick up bombs and med kits                   │
        │  Fight: auto-aim attack (Space), super (Q) when     │
        │         charged, hide in plants                     │
        │  Deadline: the zone shrinks in phases; outside it   │
        │            you lose health every second             │
        └──────────────────────────┬──────────────────────────┘
                                   │  KO'd? spectate the killer, see your placement
                                   ▼
               Results: placement, KOs, damage ──▶ Play again / change fighter
```

## Map: the campus

- 64 x 64 m, seen from above at an angle, the camera follows you.
- Built from a hand-made tile layout: walls (block movement and bullets), plants (you can walk in;
  inside you are hidden unless an enemy is very close or you shoot), server racks (block, break
  under fire, drop a Power Cell), water coolers (decor), open floor.
- Symmetric so no spawn is better than another.
- Minimap in the corner: walls, the current and next Deadline circle, you, visible enemies.

## The Deadline (the zone)

| Phase | Wait | Shrink | Radius at end | Damage outside |
|---|---|---|---|---|
| 1 | 30 s | 20 s | 22 m | 4 hp/s |
| 2 | 20 s | 15 s | 13 m | 8 hp/s |
| 3 | 15 s | 12 s | 6 m | 14 hp/s |
| 4 | 10 s | 10 s | 0 m | 25 hp/s |

The next circle is shown before it starts closing. Its centre is random but always inside the
current one.

## Fighters

Every fighter: 3 attack charges that refill over time, a super that charges by dealing damage,
and the same movement. They differ in how they fight.

| Fighter | HP | Speed | Attack | Super |
|---|---|---|---|---|
| **Hotfix** (on-call engineer) | 3200 | fast | **Patch burst**: 3 quick shots, mid range | **Deploy**: a fast dash that damages everyone it passes through |
| **Legacy** (senior maintainer) | 4800 | slow | **Monolith**: wide close-range spread | **Deprecated**: drops a wall segment that blocks bullets for 6 s |
| **Standup** (scrum lead) | 2600 | normal | **Ping**: one long-range precise shot | **Timebox**: a canister thrown on an arc (up to 15 m) that bursts for up to 32 damage and leaves a field that slows enemies inside it for 4 s |
| **Intern** (first week) | 3000 | normal | **Lob**: a bomb arcing over walls | **Force push to main**: a big blast around them that knocks enemies back |

## Items

- **Power Cell** (from server racks): +10 % damage and +300 max HP, stacks; dropped when you're KO'd.
- **Bomb**: one throw, lobbed onto the target, lethal right next to it.
- **Coffee**: heals 1000 over 2 s.

## Controls (desktop, keyboard first)

| Key | Action |
|---|---|
| W A S D | move (top-down, 8 directions) |
| Space | attack; aims at the nearest visible enemy (mouse aim with T) |
| Q | super, when charged |
| E | use / throw an item |
| Esc Esc | pause menu (offline) |

## Online

Same architecture as Floor 42: one deterministic simulation shared by the browser and a
Colyseus server that decides every hit; clients predict their own movement and reconcile.
Rooms of up to 10 people, bots fill the other seats up to 20 so a match always starts. Invite links for private matches.

## Milestones

1. **Prototype (now):** offline vs 19 bots, the campus, 4 fighters, the Deadline, minimap, items,
   results. Reis plays and picks what stays.
2. Game feel and sound pass (our `web-game-feel` and `web-game-audio` skills).
3. Online rooms of up to 10 people, bots filling the round to 20, (our `web-multiplayer-netcode` skill).
4. Duos (10 teams of 2), more maps, cosmetics.
