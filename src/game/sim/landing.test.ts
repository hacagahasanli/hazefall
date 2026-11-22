// Where the bots land on the 240 m map: per-place caps, and quiet places left for anyone who wants them.
import { landingPlan, placeCap, QUIET_PLACES } from './bot-params';
import { BUILDINGS, PLAYERS, TILE, placeAt } from './constants';
import { createGame } from './step';

describe('where the bots land', () => {
  it('keeps to each place\'s cap, at most two to a building, and leaves three places the route reaches empty', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const s = createGame('hotfix', seed);
      const plan = landingPlan(s);
      expect(plan.size).toBe(PLAYERS - 1);
      const perPlace = new Map<string, number>();
      for (const l of plan.values()) {
        const name = placeAt(l.x, l.y)?.name ?? null;
        if (name !== null) perPlace.set(name, (perPlace.get(name) ?? 0) + 1);
      }
      for (const [name, n] of perPlace) expect(n).toBeLessThanOrEqual(placeCap(name));
      // Places with a building within the canopy's reach (90 m) of the route and nobody landing in them.
      const d = s.drone;
      const len2 = (d.x1 - d.x0) ** 2 + (d.y1 - d.y0) ** 2;
      const reach = new Set<string>();
      for (const b of BUILDINGS) {
        const cx = (b.x0 + b.w / 2) * TILE;
        const cy = (b.y0 + b.h / 2) * TILE;
        const t = Math.min(1, Math.max(0, ((cx - d.x0) * (d.x1 - d.x0) + (cy - d.y0) * (d.y1 - d.y0)) / len2));
        const name = placeAt(cx, cy)?.name;
        if (name && Math.hypot(cx - (d.x0 + (d.x1 - d.x0) * t), cy - (d.y0 + (d.y1 - d.y0) * t)) < 90) reach.add(name);
      }
      const empty = [...reach].filter((n) => !perPlace.has(n));
      expect(empty.length).toBeGreaterThanOrEqual(QUIET_PLACES);
    }
  });
});
