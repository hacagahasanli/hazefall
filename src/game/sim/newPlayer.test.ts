import { describe, expect, it } from 'vitest';

import { createBot, sparedRookie } from './bot';
import { DT, NEWBIE, START_WEAPON } from './constants';
import { createGame, step } from './step';
import { NO_INPUT } from './types';

import type { GameEvent, GameState, Input } from './types';

const idle = (s: GameState): Input[] => s.players.map(() => ({ ...NO_INPUT }));

describe('a safe first drop', () => {
  it('everyone starts with the pistol, one magazine and two spare', () => {
    expect(START_WEAPON).toMatchObject({ kind: 'pistol', mag: 12, spare: 24 });
    const s = createGame('hotfix', 5);
    for (const p of s.players) expect([p.weapon, p.mag, p.ammo]).toEqual(['pistol', 12, 24]);
  });

  it('holding fire from the plane to the ground spends nothing: you land with 12 / 24', () => {
    const s = createGame('hotfix', 3);
    const events: GameEvent[] = [];
    let landedAmmo: [number, number] | null = null;
    for (let i = 0; i < 60 * 120 && !landedAmmo; i++) {
      const inputs = idle(s);
      const p = s.players[0];
      // Held from the plane to the last metre of air (on the ground a held trigger shoots, as it should).
      inputs[0] = { ...NO_INPUT, fire: p.stage === 'drone' || p.alt > 1, aimX: p.x + 5, aimY: p.y };
      step(s, inputs);
      events.push(...s.events);
      if (s.players[0].stage === 'ground') landedAmmo = [s.players[0].mag, s.players[0].ammo];
    }
    expect(landedAmmo).toEqual([12, 24]);
    expect(events.some((e) => e.type === 'shot' && e.owner === 0)).toBe(false);
  });

  it('a press in free fall or under the canopy says why nothing fired, once per press', () => {
    const s = createGame('hotfix', 3);
    s.drone.t = 0.5;
    const jump = idle(s);
    jump[0] = { ...NO_INPUT, jump: true };
    step(s, jump);
    expect(s.players[0].stage).toBe('falling');
    const blocked: number[] = [];
    // Pressed, held, released, pressed again.
    const pattern = [false, true, true, true, false, true];
    for (const fire of pattern) {
      const inputs = idle(s);
      inputs[0] = { ...NO_INPUT, fire };
      step(s, inputs);
      blocked.push(s.events.filter((e) => e.type === 'fireBlocked').length);
    }
    expect(blocked).toEqual([0, 1, 0, 0, 0, 1]);
    // Under the open canopy it is the same.
    s.players[0].canopy = 5;
    const inputs = idle(s);
    inputs[0] = { ...NO_INPUT, fire: true };
    step(s, idle(s));
    step(s, inputs);
    expect(s.events.some((e) => e.type === 'fireBlocked')).toBe(true);
    expect(s.players[0].mag).toBe(12);
  });

  it('on the ground the pistol still fires', () => {
    const s = createGame('hotfix', 3);
    const p = s.players[0];
    p.stage = 'ground';
    p.x = 100;
    p.y = 100;
    s.phase = 'play';
    for (const o of s.players) o.stage = 'ground';
    const inputs = idle(s);
    inputs[0] = { ...NO_INPUT, fire: true, aimX: 110, aimY: 100 };
    step(s, inputs);
    expect(p.mag).toBe(11);
  });
});

describe("a new player's first rounds", () => {
  it('only a match set up for a new player is softer', () => {
    expect(createGame('hotfix', 1).rookie).toBeUndefined();
    expect(createGame('hotfix', 1, 'you', [], true).rookie).toBe(true);
    expect(NEWBIE).toMatchObject({ human: 35, aimError: 1.35, spareSeconds: 8 });
  });

  it('no bot picks the new player as a target in the air or in their first 8 seconds on the ground', () => {
    const rookie = createGame('hotfix', 1, 'you', [], true);
    const vet = createGame('hotfix', 1);
    const me = rookie.players[0];
    expect(sparedRookie(rookie, me)).toBe(true); // still in the plane
    expect(sparedRookie(vet, vet.players[0])).toBe(false);
    me.stage = 'ground';
    me.landedTick = rookie.tick;
    expect(sparedRookie(rookie, me)).toBe(true);
    rookie.tick += Math.round(NEWBIE.spareSeconds / DT) - 1;
    expect(sparedRookie(rookie, me)).toBe(true);
    rookie.tick += 2;
    expect(sparedRookie(rookie, me)).toBe(false);
    // Bots are never spared.
    expect(sparedRookie(rookie, rookie.players[1])).toBe(false);
  });

  it('a bot looking straight at a new player does not notice them for 8 s after they land, but does notice an ordinary player', () => {
    const run = (rookie: boolean) => {
      const s = createGame('hotfix', 9, 'you', [], rookie);
      const bot = createBot(1, 77);
      s.phase = 'play';
      for (const o of s.players) {
        o.stage = 'ground';
        o.alive = o.id <= 1;
        o.landedTick = 0;
      }
      s.players[0].x = 200;
      s.players[0].y = 200;
      s.players[1].x = 206;
      s.players[1].y = 200;
      s.players[1].heading = Math.PI;
      let noticed = -1;
      for (let i = 0; i < Math.round(7.5 / DT) && noticed < 0; i++) {
        step(s, [{ ...NO_INPUT }, bot(s)]);
        if (bot.info().target === 0) noticed = i * DT;
      }
      return noticed;
    };
    expect(run(true)).toBe(-1);
    expect(run(false)).toBeGreaterThanOrEqual(0);
  });
});
