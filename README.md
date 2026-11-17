# Last Commit Standing

### Ten developers drop onto the campus. The Deadline closes in. The last commit standing ships.

A Merge Conflict game: a top-down battle royale in the browser, in short rounds.

> Status: playable prototype, offline against 9 bots. Online lobbies with invite links come next.

## How a round goes

1. **Lobby**: pick your fighter, press Ready.
2. **Drop**: a cargo drone crosses the campus. Hold Space to jump, steer with WASD while you glide.
3. **Loot**: everyone lands with fists. Guns, armor, med kits and bombs lie in the buildings; server racks break and sometimes drop loot.
4. **Fight**: Space shoots at the nearest enemy you can see; Q fires your fighter's super. Hide in plants.
5. **The Deadline** shrinks in five phases until nothing is left; outside it you lose health every second.
6. Last one standing wins; everyone goes back to the lobby.

## Fighters

| Fighter | HP | Super (Q) |
| --- | --- | --- |
| Hotfix | 1000 | Deploy: a fast dash that hits everyone in its path |
| Legacy | 1300 | Deprecated: drops a wall that blocks bullets |
| Standup | 900 | Timebox: a field that slows enemies |
| Intern | 1000 | Force push to main: a blast that throws everyone back |

## Weapons

Pistol, SMG, shotgun, rifle (common to uncommon), sniper and rockets (rare), plus bombs, armor vests and med kits.

## Run it

```bash
npm install
npm run dev        # http://localhost:3100
npm run test:run   # simulation tests: map, drop, loot, armor, Deadline, a full 10-bot round
```

Design: [docs/DESIGN.md](docs/DESIGN.md).
