import { describe, expect, it } from 'vitest';

import {
  autoAimReach,
  cameraProfile,
  clusterZone,
  FIRE_FLOOR,
  fighterShare,
  inAutoAimReach,
  isPhoneLandscape,
  layoutPads,
  MIN_SCALE,
  PAD_GAP,
  padSize,
  phoneScale,
  TOUCH_FLOOR,
  visiblePads,
} from './phoneUi';
import type { PadContext, PadId } from './phoneUi';

describe('phone UI scale', () => {
  it('is 1 on the reference phone and on anything bigger', () => {
    expect(phoneScale(844, 390)).toBe(1);
    expect(phoneScale(932, 430)).toBe(1);
  });
  it('shrinks with the shorter side', () => {
    expect(phoneScale(800, 360)).toBeCloseTo(0.92, 2);
    expect(phoneScale(667, 375)).toBeCloseTo(0.88, 2);
    expect(phoneScale(568, 320)).toBeLessThan(0.85);
  });
  it('never goes below the floor', () => {
    expect(phoneScale(300, 150)).toBe(MIN_SCALE);
  });
  it('knows a landscape phone from a desktop window and a portrait phone', () => {
    expect(isPhoneLandscape(true, 844, 390)).toBe(true);
    expect(isPhoneLandscape(true, 390, 844)).toBe(false);
    expect(isPhoneLandscape(false, 844, 390)).toBe(false);
    expect(isPhoneLandscape(true, 1024, 768)).toBe(false);
  });
});

const ground: PadContext = { stage: 'ground', canReload: false, canHeal: false, canUse: false, canSwap: false, sniper: false };

describe('touch button size rule', () => {
  it('is max(floor, base * ui * size)', () => {
    expect(padSize(60, 1, 1)).toBe(60);
    expect(padSize(60, 0.75, 1)).toBe(TOUCH_FLOOR + 1);
    expect(padSize(50, 0.75, 1)).toBe(TOUCH_FLOOR);
    expect(padSize(100, 1, 1.2)).toBe(120);
  });
  it('never lets the size setting push a button under the floor', () => {
    expect(padSize(50, 0.68, 0.7)).toBe(TOUCH_FLOOR);
    expect(padSize(100, 0.68, 0.7, FIRE_FLOOR)).toBe(FIRE_FLOOR);
  });
});

describe('which touch buttons show', () => {
  it('shows four in a typical ground moment', () => {
    expect(visiblePads(ground)).toEqual(['fire', 'roll', 'jump', 'super']);
  });
  it('adds RELOAD, HEAL, USE, SWAP and SCOPE only when they can do something', () => {
    expect(visiblePads({ ...ground, canReload: true })).toContain('reload');
    expect(visiblePads({ ...ground, canHeal: true })).toContain('heal');
    expect(visiblePads({ ...ground, canUse: true })).toContain('use');
    expect(visiblePads({ ...ground, canSwap: true })).toContain('swap');
    expect(visiblePads({ ...ground, sniper: true })).toContain('scope');
    expect(visiblePads({ ...ground, canReload: true, canHeal: true, canUse: true, canSwap: true, sniper: true })).toHaveLength(9);
  });
  it('has no lean buttons', () => {
    expect(visiblePads({ ...ground, canReload: true, canHeal: true, canUse: true, canSwap: true, sniper: true })).not.toContain('leanL' as PadId);
  });
  it('shows no ground cluster in the air: JUMP on the plane, OPEN and DIVE in free fall, DIVE under the canopy', () => {
    // Context buttons asked for in the air still stay hidden.
    const busy = { canReload: true, canHeal: true, canUse: true, canSwap: true, sniper: true };
    expect(visiblePads({ ...ground, ...busy, stage: 'plane' })).toEqual(['fire']);
    expect(visiblePads({ ...ground, ...busy, stage: 'fall' })).toEqual(['fire', 'roll']);
    expect(visiblePads({ ...ground, ...busy, stage: 'canopy' })).toEqual(['roll']);
  });
});

describe('touch cluster layout', () => {
  const sizes: [number, number][] = [[568, 320], [640, 360], [667, 375], [800, 450], [844, 390], [915, 412], [932, 430]];
  const every: PadContext[] = [
    ground,
    { ...ground, canReload: true, canHeal: true, canUse: true, canSwap: true, sniper: true },
    { ...ground, stage: 'plane' },
    { ...ground, stage: 'fall' },
    { ...ground, stage: 'canopy' },
  ];
  for (const [w, h] of sizes) {
    for (const setting of [0.7, 1, 1.3]) {
      it(`${w}x${h}, size setting ${setting}: nothing under the floor, gaps kept, inside the zone`, () => {
        const ui = isPhoneLandscape(true, w, h) ? phoneScale(w, h) : 1;
        const zone = clusterZone(ui, w, h);
        for (const c of every) {
          const ids = visiblePads(c);
          const boxes = layoutPads(ids, ui, setting, w, h);
          ids.forEach((id, i) => {
            const b = boxes[id]!;
            expect(b.size, id).toBeGreaterThanOrEqual(id === 'fire' ? FIRE_FLOOR : TOUCH_FLOOR);
            expect(b.x + b.size / 2, `${id} right`).toBeLessThanOrEqual(zone.w + 0.5);
            expect(b.y + b.size / 2, `${id} top`).toBeLessThanOrEqual(zone.h + 0.5);
            expect(b.x - b.size / 2, `${id} left`).toBeGreaterThanOrEqual(-0.5);
            ids.slice(i + 1).forEach((o) => {
              const q = boxes[o]!;
              const gap = Math.hypot(b.x - q.x, b.y - q.y) - (b.size + q.size) / 2;
              expect(gap, `${id} to ${o}`).toBeGreaterThanOrEqual(PAD_GAP - 0.5);
            });
          });
        }
      });
    }
  }
  it('keeps the zone to 46 % of the width and 64 % of the height', () => {
    const z = clusterZone(1, 568, 320);
    expect(z.w).toBeLessThanOrEqual(568 * 0.46);
    expect(z.h).toBeLessThanOrEqual(320 * 0.64);
  });
});

describe('phone camera', () => {
  it('is the desktop view on a desktop, closer on a phone and in between on a tablet', () => {
    expect(cameraProfile(false, 1366, 768).k).toBe(1);
    expect(cameraProfile(true, 844, 390).kind).toBe('phone');
    expect(cameraProfile(true, 1024, 768).kind).toBe('tablet');
    expect(cameraProfile(true, 844, 390).k).toBeLessThan(cameraProfile(true, 1024, 768).k);
    expect(cameraProfile(true, 1024, 768).k).toBeLessThan(1);
  });
  it('leaves the desktop look-ahead numbers as they were', () => {
    const d = cameraProfile(false, 1366, 768);
    expect([d.face, d.cap, d.fx, d.fy]).toEqual([2.5, 4, 0.5, 0.5]);
  });
  it('makes the phone fighter bigger on screen than the desktop one (pinhole maths)', () => {
    expect(fighterShare(cameraProfile(true, 844, 390).k)).toBeGreaterThan(fighterShare(1) * 1.4);
  });
});

describe('touch auto-aim reach', () => {
  const reach = autoAimReach();
  it('is the desktop view footprint: tens of metres, from the same camera numbers', () => {
    expect(reach).toBeGreaterThan(30);
    expect(reach).toBeLessThan(60);
  });
  it('picks the same targets at the same world distance whatever the phone camera shows', () => {
    // Eligibility looks only at the distance: the camera profile is not an input.
    for (const d of [5, 20, reach - 1]) expect(inAutoAimReach(d, 0, reach)).toBe(true);
    for (const d of [reach + 1, 80]) expect(inAutoAimReach(0, d, reach)).toBe(false);
    expect(inAutoAimReach(reach * 0.75, reach * 0.75, reach)).toBe(false);
  });
});
