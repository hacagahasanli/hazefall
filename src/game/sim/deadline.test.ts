// The Deadline's centre rules (docs/collab/CREATIVE/specifications/map-v2.md section 7), picked in the sim so every browser agrees.
import { DT, MAP, SIZE, TILE, WORLD, ZONE_PHASES } from './constants';
import { circleCentreOk, createGame, step } from './step';
import { NO_INPUT } from './types';

import type { GameState, Input } from './types';

const idle = (): Input[] => Array.from({ length: 10 }, () => ({ ...NO_INPUT }));
const at = (tx: number, ty: number) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE] as const;
const find = (test: (tx: number, ty: number) => boolean) => {
  for (let ty = 0; ty < SIZE; ty++) for (let tx = 0; tx < SIZE; tx++) if (test(tx, ty)) return at(tx, ty);
  throw new Error('no such tile');
};

describe('the Deadline centre rules', () => {
  it('never centres a circle on water, a bridge deck, a prop or the inside of a building', () => {
    const [wx, wy] = find((x, y) => MAP[y][x] === 'o' && MAP[y][x + 1] === 'o' && MAP[y][x - 1] === 'o');
    expect(circleCentreOk(wx, wy, 30, 0)).toBe(false);
    const [dx, dy] = find((x, y) => MAP[y][x] === 'd');
    expect(circleCentreOk(dx, dy, 12, 4)).toBe(false);
    const [vx, vy] = find((x, y) => MAP[y][x] === 'v');
    expect(circleCentreOk(vx, vy, 30, 0)).toBe(false);
    const [fx, fy] = find((x, y) => MAP[y][x] === '.');
    expect(circleCentreOk(fx, fy, 30, 0)).toBe(false);
  });

  it('from the third circle on, rejects a circle that is more than a quarter water; from the fourth, one with no cover near its centre', () => {
    // On the river bank with a small circle: about half of it is water.
    const [bx, by] = find((x, y) => MAP[y][x] === 'g' && MAP[y + 1]?.[x] === 'o' && MAP[y - 3]?.[x] === 'g' && MAP[y - 1]?.[x] === 'g');
    expect(circleCentreOk(bx, by, 12, 1)).toBe(true);
    expect(circleCentreOk(bx, by, 12, 2)).toBe(false);
    // Cover tiles within 15 m, counted here on its own.
    const cover = (tx: number, ty: number) => {
      let n = 0;
      for (let y = ty - 8; y <= ty + 8; y++) for (let x = tx - 8; x <= tx + 8; x++) if ('krv#ftw'.includes(MAP[y]?.[x] ?? '#') && Math.hypot(x - tx, y - ty) * TILE <= 15) n += 1;
      return n;
    };
    const bare = find((x, y) => MAP[y][x] === 'g' && cover(x, y) < 6 && MAP[y][x - 1] === 'g');
    const covered = find((x, y) => MAP[y][x] === 'g' && cover(x, y) >= 8);
    expect(circleCentreOk(bare[0], bare[1], 12, 2)).toBe(true);
    expect(circleCentreOk(bare[0], bare[1], 12, 3)).toBe(false);
    expect(circleCentreOk(covered[0], covered[1], 12, 3)).toBe(true);
  });

  it('every circle of a full round stays 12 m inside the edge, and later circles meet the rules (12 seeds)', () => {
    let picked = 0;
    let passed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s: GameState = createGame('hotfix', seed);
      let phase = -1;
      for (let i = 0; i < 60 * 600 && s.phase !== 'over'; i++) {
        step(s, idle());
        const z = s.zone;
        if (s.phase === 'play' && z.state !== 'done' && z.phase !== phase) {
          phase = z.phase;
          const def = ZONE_PHASES[z.phase];
          if (def.radius > 0 && z.phase >= 1) {
            picked += 1;
            expect(z.toX).toBeGreaterThanOrEqual(Math.min(def.radius + 12, WORLD / 2));
            expect(z.toX).toBeLessThanOrEqual(Math.max(WORLD - def.radius - 12, WORLD / 2));
            if (circleCentreOk(z.toX, z.toY, def.radius, z.phase)) passed += 1;
          }
        }
      }
    }
    expect(DT).toBeGreaterThan(0);
    // Up to 8 draws, the last one kept if none passes: nearly all pass.
    expect(passed / picked).toBeGreaterThan(0.9);
  }, 120000);
});
