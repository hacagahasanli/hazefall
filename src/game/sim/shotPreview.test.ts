import { describe, expect, it } from 'vitest';

import { CROUCH, LEAN, MAP, TILE } from './constants';
import { createGame, shotPreview, solidStep, step } from './step';
import { NO_INPUT } from './types';

import type { GameEvent, Input, WeaponKind } from './types';

// Reis, 2026-11-25: "in some places the crosshair shows clear, yet my shot hits the wall". Many shots round real corners,
// window sills, trunks and rocks of the map, aimed the way the shoulder camera aims (a ray from the lens through the
// crosshair), with random lean, crouch, movement and guns: the HUD's answer must match what the fired round really does.

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const SOLID = new Set(['#', 't', 'k', 'w', 'v']);
const OPEN = new Set(['g', 'p', 'a', '.']);

/** Open tiles next to something a round can hit. */
const spots = () => {
  const out: { x: number; y: number }[] = [];
  for (let y = 4; y < MAP.length - 4; y++) for (let x = 4; x < MAP[y].length - 4; x++) {
    if (!OPEN.has(MAP[y][x])) continue;
    let near = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (SOLID.has(MAP[y + j][x + i])) near = true;
    if (near) out.push({ x, y });
  }
  return out;
};

const GUNS: WeaponKind[] = ['rifle', 'smg', 'pistol', 'sniper', 'shotgun'];

const run = (n: number, seed: number) => {
  const r = rng(seed);
  const all = spots();
  const s = createGame('hotfix', 1);
  const me = s.players[0];
  s.players.slice(1).forEach((p) => Object.assign(p, { stage: 'falling', alt: 80, canopy: -1, x: 6, y: 6 }));
  s.drone.t = 1;
  const idle = (): Input[] => s.players.map(() => ({ ...NO_INPUT }));
  const res = { n: 0, blocked: 0, after: 0, falseClear: 0, overWarn: 0 };
  for (let k = 0; k < n; k++) {
    const sp = all[Math.floor(r() * all.length)];
    const weapon = GUNS[Math.floor(r() * GUNS.length)];
    const lean = [-1, -0.5, 0, 0.5, 1][Math.floor(r() * 5)];
    const crouch = r() < 0.3 ? 1 : r() < 0.2 ? r() : 0;
    Object.assign(me, {
      stage: 'ground', alive: true, hp: 100, x: sp.x * TILE + 0.3 + r() * 1.4, y: sp.y * TILE + 0.3 + r() * 1.4, z: 0, jz: 0, vx: 0, vy: 0,
      heading: r() * Math.PI * 2, lean, crouch, weapon, mag: 5, ammo: 0, cooldown: 0, reload: 0, swapping: 0, rarity: 0, item: null, using: null, rolling: 0, climb: 0, vault: 0,
    });
    // The lens: behind and right of the head, looking along a random bearing and pitch (as the shoulder camera does).
    const yaw = r() * Math.PI * 2;
    const pitch = -0.25 + r() * 0.6;
    const c = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch);
    const side = 0.68 + lean * LEAN.offset * 0.7;
    const ox = me.x - sn * side - c * cp * 3.6, oy = me.y + c * side - sn * cp * 3.6, oh = 1.62 - CROUCH.drop * 1.15 * crouch + Math.sin(pitch) * -3.6;
    let end = 60;
    let px = ox + c * cp * 3.6, py = oy + sn * cp * 3.6, ph = oh + Math.sin(pitch) * 3.6;
    for (let t = 3.9; t < 60; t += 0.3) {
      const x = ox + c * cp * t, y = oy + sn * cp * t, h = oh + Math.sin(pitch) * t;
      if (h <= 0 || solidStep(s, px, py, ph, x, y, h)) { end = t; break; }
      px = x; py = y; ph = h;
    }
    const aim = { x: ox + c * cp * end, y: oy + sn * cp * end, h: Math.max(0, oh + Math.sin(pitch) * end) };
    if ((aim.x - me.x) * c + (aim.y - me.y) * sn < 1.5) continue;
    const moving = r() < 0.4;
    const input: Input = {
      ...NO_INPUT, fire: true, snap: true, lean: [-1, 0, 1][Math.floor(r() * 3)], crouch: r() < 0.3,
      mx: moving ? Math.cos(r() * 6.28) : 0, my: moving ? Math.sin(r() * 6.28) : 0,
      aimX: aim.x, aimY: aim.y, aimH: aim.h,
    };
    me.prev = { ...input, fire: false };
    // What the HUD shows. (Before, at afadb05, the same harness measured 85.0% agreement and 113 of 199 blocked shots shown
    // clear: the trace used the pose after the tick's step and only the centre line of the spread. LOG.md, 2026-11-25.)
    const after = !!shotPreview(s, me, input);
    // What the round really does.
    const inputs = idle();
    inputs[0] = input;
    step(s, inputs);
    const shot = s.events.find((e) => e.type === 'shot' && e.owner === 0) as Extract<GameEvent, { type: 'shot' }> | undefined;
    if (!shot) continue;
    const reach = Math.hypot(aim.x - shot.x, aim.y - shot.y);
    let actual = false;
    const look = (evs: GameEvent[]) => {
      for (const e of evs) if (e.type === 'impact' && Math.hypot(e.x - shot.x, e.y - shot.y) < reach - 0.5) actual = true;
    };
    look(s.events);
    for (let t = 0; t < 400 && s.projectiles.some((q) => q.owner === 0 && q.kind === 'bullet'); t++) {
      step(s, idle());
      look(s.events);
    }
    s.projectiles.length = 0;
    res.n++;
    if (actual) res.blocked++;
    if (after === actual) res.after++;
    if (actual && !after) res.falseClear++;
    if (!actual && after) res.overWarn++;
  }
  return res;
};

describe('the obstruction marker tells the truth', () => {
  it('never shows clear when the round is stopped short (randomized round real corners, sills, trunks and rocks)', () => {
    const res = run(1500, Number(process.env.SEED ?? 7));
    console.log('shotPreview agreement', JSON.stringify(res), `after ${(100 * res.after / res.n).toFixed(1)}%`);
    expect(res.n).toBeGreaterThan(800);
    expect(res.blocked).toBeGreaterThan(50);
    expect(res.falseClear).toBe(0);
    // It may warn when only the edge of the spread clips (honest about the cone), but not often.
    expect(res.overWarn / res.n).toBeLessThan(0.06);
  }, 120000);
});
