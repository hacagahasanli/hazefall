<div align="center">

# Last Commit Standing

### Ten developers. One merge.

A game by **[Nalbaki Games](https://nalbakigames.com)**.

### [▶ Play with friends](https://lastcommit.nalbakigames.com/play) · [Studio](https://nalbakigames.com) · [Floor 42](https://floor42.nalbakigames.com)

</div>

A battle royale in the browser for developers who never agree: up to ten of you parachute into the
same countryside with a pistol each, the Deadline closes in, and only the last one standing gets
to merge. Play with friends by link (bots fill the empty places, or switch them off), or solo
against nine bots. Works on phones.

## How a round goes

1. **Room**: pick your fighter, press *Play with friends* and send the link (or play solo with bots).
   Everyone says ready, the host starts.
2. **Drop**: a cargo plane crosses the map. Jump with Space, free-fall, steer the parachute down.
3. **Loot**: you land with a pistol and one magazine. Guns, armor, ammo, med kits and bombs lie in
   houses, barns and the container port; walk over them or press F.
4. **Fight**: Space shoots (auto-aim on whoever you can see, or mouse aim), Q / E lean, Shift rolls,
   G is your fighter's super, R reloads. Hide in tall grass, swim the river, take a bridge.
5. **The Deadline** closes in, phase by phase; outside it you lose health every second.
6. Last one standing wins: **MERGED TO MAIN**. Everyone else gets their round report.

## Fighters

Everyone has 100 health and up to 100 armor; about three hits take you down. What differs is speed
and the super (G):

| Fighter | Speed | Super (G) |
| --- | --- | --- |
| Hotfix | 6.6 m/s | Deploy: a fast dash that hits everyone in its path |
| Legacy | 5.9 m/s | Deprecated: drops a wall that blocks bullets |
| Standup | 6.9 m/s | Timebox: a field that slows enemies |
| Intern | 6.3 m/s | Force push to main: a blast that throws everyone back |

## Weapons

Pistol, SMG, shotgun, rifle, sniper and rockets, with magazines and spare rounds, plus bombs, armor
vests, ammo boxes and med kits. Loot glows by rarity.

## Support

Last Commit Standing is free. If you enjoyed it, you can [☕ support the studio](https://nalbakigames.com/support).

## Run it

```bash
npm install
npm run dev        # http://localhost:3100
npm run server     # the lobby server for online rooms (ws://localhost:2568); open /play?server=ws://localhost:2568
npm run test:run   # simulation and netcode tests: map, river, drop, loot, armor, Deadline, online sync
```

Design: [docs/DESIGN.md](docs/DESIGN.md).
