import { createBot } from '../sim/bot';
import { createGame, createMatch, step } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import { connectPeer } from './peer';
import {
  createInputQueue,
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  isAuthoritative,
  NO_WIRE,
  SNAPSHOT_EVERY_TICKS,
} from './protocol';

import type { StartMessage } from './lobby';
import type { PeerLink } from './peer';
import type { WireInput } from './protocol';
import type { FighterId, GameEvent, GameState, Input } from '../sim/types';
import type { Room } from '@colyseus/sdk';

/** How the line to the others is doing, for the HUD. */
export interface NetStatus {
  /** Host: guests on a direct line / all guests. Guest: 1/1 when direct to the host. */
  direct: number;
  total: number;
  /** Round trip in ms (host: the worst guest's). */
  rtt: number;
}

/**
 * What the renderer plays: the match state, advanced one fixed tick at a time with this
 * browser's input. Offline it runs the match with bots; online either this browser is the host
 * (it runs the match for everyone) or a guest (it predicts and is corrected by the host).
 */
export interface Session {
  /** This browser's player id. */
  readonly me: number;
  readonly online: boolean;
  readonly host: boolean;
  readonly state: GameState;
  /** One 60 Hz tick. Returns the events to show and sound this tick. */
  tick: (input: Input) => GameEvent[];
  readonly net: NetStatus | null;
  dispose: () => void;
}

const randomSeed = () => (Math.random() * 1e9) | 0;

/** You and nineteen bots, in this browser only. */
export const createOfflineSession = (fighter: FighterId, name: string): Session => {
  const state = createGame(fighter, randomSeed(), name);
  const bots = state.players.map((p) => (p.bot ? createBot(p.id, randomSeed()) : null));
  // Development only: what each bot is doing, for checking their behaviour in the browser.
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __lcsBots?: unknown }).__lcsBots = bots;
  return {
    me: 0,
    online: false,
    host: true,
    state,
    tick: (input) => {
      step(
        state,
        state.players.map((p) => (p.id === 0 ? (p.alive ? input : NO_INPUT) : bots[p.id]!(state))),
      );
      return state.events;
    },
    net: null,
    dispose: () => undefined,
  };
};

const seatsOf = (start: StartMessage) =>
  start.seats.map((s) => ({ name: s.name, fighter: s.fighter as FighterId | null, bot: s.bot }));

/**
 * The host's browser runs the round for everyone, exactly as a game server would: each guest's
 * inputs come in over their line into a queue (one per tick, folded if they back up), bots think
 * here, and 20 times a second every guest gets a snapshot of the whole match. A guest who leaves
 * is handed to a bot. The host itself plays with no delay at all.
 */
export const createHostSession = (room: Room, start: StartMessage): Session => {
  const state = createMatch(seatsOf(start), start.seed);
  const me = start.slot;
  const n = state.players.length;
  const bots = state.players.map((p) => (p.bot ? createBot(p.id, randomSeed()) : null));
  const guests = state.players
    .map((p) => (!p.bot && p.id !== me ? p.id : -1))
    .filter((i) => i >= 0);
  const links = new Map<number, PeerLink>();
  const queues = new Map<number, ReturnType<typeof createInputQueue>>();
  const offs: (() => void)[] = [];
  for (const g of guests) {
    const link = connectPeer(room, g, true);
    const q = createInputQueue();
    links.set(g, link);
    queues.set(g, q);
    offs.push(link.on((m) => m.t === 'in' && q.push(m.w)));
  }
  // A guest left: a bot takes over their player from where they stand.
  offs.push(
    room.onMessage('left', (msg: { slot: number }) => {
      if (!queues.has(msg.slot)) return;
      queues.delete(msg.slot);
      links.get(msg.slot)?.close();
      links.delete(msg.slot);
      bots[msg.slot] = createBot(msg.slot, randomSeed());
    }),
  );

  let tick = 0;
  let seq = 0;
  const log: [number, GameEvent][] = [];
  const wires: WireInput[] = Array.from({ length: n }, () => NO_WIRE);
  let lootKey = '';
  let lootFresh = 0;
  let ended = false;

  return {
    me,
    online: true,
    host: true,
    state,
    tick: (input) => {
      tick += 1;
      const inputs = state.players.map((p) => {
        let i: Input;
        if (p.id === me) i = p.alive ? input : NO_INPUT;
        else if (bots[p.id]) i = bots[p.id]!(state);
        else i = queues.get(p.id)?.next() ?? NO_INPUT;
        wires[p.id] =
          p.id === me || bots[p.id] ? encodeInput(0, i) : (queues.get(p.id)?.wire ?? NO_WIRE);
        return i;
      });
      step(state, inputs);
      for (const e of state.events) if (isAuthoritative(e)) log.push([++seq, e]);
      while (log.length && log[0][0] < seq - 60) log.shift();

      if (tick % SNAPSHOT_EVERY_TICKS === 0 && links.size) {
        // Loot goes out when it changed (three times, in case a packet is lost) and once a second.
        const key = state.loot.map((l) => l.id).join(',');
        if (key !== lootKey) {
          lootKey = key;
          lootFresh = 3;
        }
        const withLoot = lootFresh > 0 || tick % 60 === 0;
        lootFresh = Math.max(0, lootFresh - 1);
        const ack = state.players.map((p) => queues.get(p.id)?.ack ?? 0);
        const raw = encodeSnapshot(
          { tick, ack, inputs: wires, state, log: log.slice(-30) },
          withLoot,
        );
        for (const link of links.values()) link.send({ t: 'snap', raw });
      }
      // The round is over: a moment later everyone goes back to the room's lobby.
      if (state.phase === 'over' && !ended) {
        ended = true;
        setTimeout(() => room.send('end'), 4000);
      }
      return state.events;
    },
    get net() {
      const all = [...links.values()];
      return {
        direct: all.filter((l) => l.direct).length,
        total: all.length,
        rtt: all.reduce((m, l) => Math.max(m, l.rtt), 0),
      };
    },
    dispose: () => {
      offs.forEach((off) => off());
      links.forEach((l) => l.close());
    },
  };
};

/**
 * A guest's browser: client-side prediction with reconciliation against the host. Every tick it
 * applies its own input at once (so moving and shooting feel instant) and sends it to the host.
 * When a snapshot arrives it adopts the host's state (the truth) and replays the inputs the host
 * has not applied yet; everyone else is assumed to keep doing what the host last saw them do.
 * Hits, knock-outs and pickups are only ever shown from the host's event log.
 */
export const createGuestSession = (room: Room, start: StartMessage): Session => {
  const me = start.slot;
  let state = createMatch(seatsOf(start), start.seed);
  const link = connectPeer(room, 0, false);
  let pending: string | null = null;
  let lastSnapTick = 0;
  let history: WireInput[] = [];
  let others: Input[] = state.players.map(() => ({ ...NO_INPUT }));
  let acked = 0;
  let seen = 0;
  let tick = 0;
  const off = link.on((m) => {
    if (m.t === 'snap') pending = m.raw;
  });

  const reconcile = (raw: string): GameEvent[] => {
    const snap = decodeSnapshot(raw, state.loot);
    if (snap.tick <= lastSnapTick) return [];
    lastSnapTick = snap.tick;
    state = snap.state;
    others = snap.inputs.map((w) => decodeInput(w));
    acked = snap.ack[me] ?? 0;
    history = history.filter((w) => w[0] > acked);
    for (const w of history) {
      const inputs = others.slice();
      inputs[me] = decodeInput(w);
      step(state, inputs);
    }
    // The host's word on hits, knock-outs and pickups, each played once.
    const fresh = snap.log.filter(([s]) => s > seen).map(([, e]) => e);
    if (snap.log.length) seen = Math.max(seen, snap.log[snap.log.length - 1][0]);
    return fresh;
  };

  return {
    me,
    online: true,
    host: false,
    get state() {
      return state;
    },
    tick: (input) => {
      const told = pending ? reconcile(pending) : [];
      pending = null;
      tick += 1;
      const w = encodeInput(tick, input);
      history.push(w);
      if (history.length > 240) history.shift();
      // The line drops packets: every packet carries the last few inputs not yet confirmed.
      link.send({ t: 'in', w: history.filter((h) => h[0] > acked).slice(-6) });
      const inputs = others.slice();
      inputs[me] = state.players[me]?.alive ? input : NO_INPUT;
      step(state, inputs);
      return [...state.events.filter((e) => !isAuthoritative(e)), ...told];
    },
    get net() {
      return { direct: link.direct ? 1 : 0, total: 1, rtt: link.rtt };
    },
    dispose: () => {
      off();
      link.close();
    },
  };
};
