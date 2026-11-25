import { describe, expect, it } from 'vitest';

import { MAP, PLAYERS, TILE } from '../sim/constants';
import { createMatch, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import {
  createInputQueue,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  isWireInput,
  encodeSnapshot,
} from './protocol';
import { MATCH_SEATS } from './lobby';
import { createGuestSession, createHostSession } from './session';

import type { Addressed, StartMessage } from './lobby';
import type { Input } from '../sim/types';
import type { Room } from '@colyseus/sdk';

/**
 * A stand-in for the lobby server: each browser gets a fake room; 'relay' and 'signal' messages
 * are delivered to the addressed seat after `delayTicks` (the tests step everyone together).
 * Without WebRTC in Node every game message takes the relay path, like a blocked network would.
 */
const hub = (delayTicks = 3) => {
  const handlers = new Map<number, Map<string, Set<(m: unknown) => void>>>();
  const queue: { at: number; slot: number; type: string; msg: unknown }[] = [];
  let now = 0;
  const roomFor = (slot: number) => {
    const mine = new Map<string, Set<(m: unknown) => void>>();
    handlers.set(slot, mine);
    return {
      send: (type: string, msg: Addressed<unknown>) => {
        if (type === 'relay' || type === 'signal')
          queue.push({ at: now + delayTicks, slot: msg.to, type, msg: { ...msg, from: slot } });
      },
      onMessage: (type: string, cb: (m: unknown) => void) => {
        if (!mine.has(type)) mine.set(type, new Set());
        mine.get(type)!.add(cb);
        return () => mine.get(type)!.delete(cb);
      },
    } as unknown as Room;
  };
  const advance = () => {
    now += 1;
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      if (q.at > now) continue;
      queue.splice(i--, 1);
      handlers
        .get(q.slot)
        ?.get(q.type)
        ?.forEach((cb) => cb(q.msg));
    }
  };
  /** Tell one browser something as the server would (e.g. 'left'). */
  const tell = (slot: number, type: string, msg: unknown) =>
    handlers
      .get(slot)
      ?.get(type)
      ?.forEach((cb) => cb(msg));
  return { roomFor, advance, tell };
};

const start = (slot: number, bots: boolean): StartMessage => ({
  slot,
  seed: 4242,
  seats: [
    { name: 'reis', fighter: 'hotfix', bot: false },
    { name: 'friend', fighter: 'legacy', bot: false },
    { name: 'third', fighter: 'intern', bot: false },
    ...(bots
      ? Array.from({ length: 7 }, (_, i) => ({ name: `bot${i}`, fighter: null, bot: true }))
      : []),
  ],
});

/** A stretch of open meadow 30 tiles long, so nobody runs into a wall. */
const OPEN = (() => {
  for (let y = 4; y < MAP.length - 4; y++) {
    const x = MAP[y].indexOf('g'.repeat(30));
    if (x >= 0) return { x: x * TILE + 2, y: y * TILE + TILE / 2 };
  }
  throw new Error('no open meadow');
})();

/** Everyone lands on the meadow at once, in a row (player 1 out in front), so the test can get to the fighting. */
const landAll = (
  states: { players: { stage: string; alt: number; x: number; y: number }[] }[],
) => {
  for (const s of states)
    s.players.forEach((p, i) =>
      Object.assign(p, {
        stage: 'ground',
        alt: 0,
        x: OPEN.x + (i === 1 ? 12 : i * 1.2),
        y: OPEN.y,
      }),
    );
};

describe('online play', () => {
  it('inputs survive the wire, presses are never lost when folded', () => {
    const i: Input = {
      ...NO_INPUT,
      mx: 0.71,
      my: -0.71,
      fire: true,
      roll: true,
      lean: -1,
      aimX: 12.345,
      aimY: 99.999,
    };
    // The 3D aim and the drawn muzzle (where the round leaves) travel too; without a muzzle the sim models one.
    const aimed = encodeInput(8, { ...i, aimH: 3.456, muzzle: [0.114, 1.293, 1.135] });
    expect(isWireInput(aimed)).toBe(true);
    expect(decodeInput(aimed)).toMatchObject({ aimH: 3.46, muzzle: [0.11, 1.29, 1.14] });
    expect(decodeInput(encodeInput(8, { ...i, aimH: 2 })).muzzle).toBeUndefined();
    const back = decodeInput(encodeInput(7, i));
    expect(back).toMatchObject({
      mx: 0.71,
      my: -0.71,
      fire: true,
      roll: true,
      lean: -1,
      aimX: 12.35,
      aimY: 100,
    });
    const q = createInputQueue();
    q.push([
      encodeInput(1, { ...NO_INPUT, roll: true }),
      ...[2, 3, 4, 5, 6, 7].map((t) => encodeInput(t, NO_INPUT)),
    ]);
    expect(q.next().roll).toBe(true); // tick 1 folded into tick 3, the roll kept
  });

  it('gun slots, swap, heal and coffee presses survive the wire and folding', () => {
    for (const i of [{ slot: 1 }, { slot: 2 }, { cycle: true }, { heal: true }, { coffee: true }]) {
      expect(decodeInput(encodeInput(3, { ...NO_INPUT, ...i }))).toMatchObject(i);
    }
    expect(decodeInput(encodeInput(3, NO_INPUT))).toMatchObject({ slot: 0, cycle: false, heal: false, coffee: false });
    const q = createInputQueue();
    q.push([encodeInput(1, { ...NO_INPUT, heal: true, slot: 2 }), ...[2, 3, 4, 5, 6].map((t) => encodeInput(t, NO_INPUT))]);
    const n = q.next();
    expect(n.heal).toBe(true);
    expect(n.slot).toBe(2);
  });

  it('an online round with bots has as many fighters as an offline one', () => {
    expect(MATCH_SEATS).toBe(PLAYERS);
  });

  it('a snapshot of a full match is small and comes back the same', () => {
    const seats = start(0, true).seats.map((x) => ({ ...x, fighter: x.fighter as never }));
    while (seats.length < PLAYERS) seats.push({ name: `bot${seats.length}`, fighter: null as never, bot: true });
    const s = createMatch(seats, 9);
    expect(s.players).toHaveLength(PLAYERS);
    for (let i = 0; i < 600; i++)
      step(
        s,
        s.players.map(() => NO_INPUT),
      );
    s.racks[100] = 0;
    const raw = encodeSnapshot(
      { tick: 5, ack: s.players.map(() => 0), inputs: [], state: s, log: [] },
      false,
    );
    expect(raw.length).toBeLessThan(13_000);
    const back = decodeSnapshot(raw, s.loot);
    expect(back.state.racks).toEqual(s.racks);
    expect(back.state.loot.length).toBe(s.loot.length);
    expect(back.state.players[3].x).toBeCloseTo(s.players[3].x, 2);
    expect(back.state.players[0].mag).toBe(s.players[0].mag);
    // Every player field survives the packing (numbers to a millimetre), the last input too.
    s.players[4].prev = { ...NO_INPUT, fire: true, slot: 2, pitch: 0.25 };
    Object.assign(s.players[5], { weapon: 'fists', mag: Infinity });
    const again = decodeSnapshot(
      encodeSnapshot({ tick: 6, ack: [], inputs: [], state: s, log: [] }, false),
      s.loot,
    );
    const round = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1000) / 1000 : x)));
    expect(round(again.state.players)).toEqual(round(s.players));
    expect(again.state.players[5].mag).toBe(Infinity);
    // The loot list too, when it is sent.
    const withLoot = encodeSnapshot({ tick: 7, ack: [], inputs: [], state: s, log: [] }, true);
    expect(withLoot.length).toBeLessThan(18_000);
    expect(round(decodeSnapshot(withLoot, []).state.loot)).toEqual(round(s.loot));
    expect(again.state.players[4].prev.slot).toBe(2);
  });

  it("a guest's moves and shots reach the host, and every browser ends up seeing the same match", () => {
    const h = hub(3);
    const host = createHostSession(h.roomFor(0), start(0, true));
    const g1 = createGuestSession(h.roomFor(1), start(1, true));
    const g2 = createGuestSession(h.roomFor(2), start(2, true));
    landAll([host.state, g1.state, g2.state]);
    const x0 = host.state.players[1].x;
    let shots = 0;
    for (let t = 0; t < 120; t++) {
      // Guest 1 runs right and shoots; the others stand still.
      const ev = g1.tick({ ...NO_INPUT, mx: 1, fire: t > 60, aimX: OPEN.x + 100, aimY: OPEN.y });
      shots += ev.filter((e) => e.type === 'shot' && e.owner === 1).length;
      g2.tick(NO_INPUT);
      host.tick(NO_INPUT);
      h.advance();
    }
    for (let t = 0; t < 12; t++) {
      g1.tick(NO_INPUT);
      g2.tick(NO_INPUT);
      host.tick(NO_INPUT);
      h.advance();
    }
    // The host moved guest 1 by what they pressed (~7 m in 2 s at 6+ m/s, minus the start).
    expect(host.state.players[1].x - x0).toBeGreaterThan(8);
    expect(host.state.players[1].shots).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0); // the guest heard its own shots at once (prediction)
    // Both guests agree with the host about where guest 1 is, to within a few centimetres.
    for (const g of [g1, g2])
      expect(Math.abs(g.state.players[1].x - host.state.players[1].x)).toBeLessThan(0.3);
    host.dispose();
    g1.dispose();
    g2.dispose();
  });

  it('a guest who leaves is played by a bot from then on; a round with no bots has only the people', () => {
    const h = hub(2);
    const host = createHostSession(h.roomFor(0), start(0, false));
    expect(host.state.players.length).toBe(3);
    expect(host.state.players.every((p) => !p.bot)).toBe(true);
    landAll([host.state]);
    h.tell(0, 'left', { slot: 2 });
    const y0 = host.state.players[2].y;
    const x0 = host.state.players[2].x;
    for (let t = 0; t < 600; t++) {
      host.tick(NO_INPUT);
      h.advance();
    }
    // The bot that took over moved the player somewhere.
    expect(Math.hypot(host.state.players[2].x - x0, host.state.players[2].y - y0)).toBeGreaterThan(
      1,
    );
    host.dispose();
  });
});
