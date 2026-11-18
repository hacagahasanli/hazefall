// The match's wire format between the host's browser and the guests' browsers.

import { initialRacks } from '../sim/step';
import { NO_INPUT } from '../sim/types';

import type { GameEvent, GameState, Input, Loot } from '../sim/types';

/** The host sends a snapshot every 3 ticks: 20 a second. */
export const SNAPSHOT_EVERY_TICKS = 3;

const BUTTONS = ['fire', 'super', 'use', 'reload', 'roll', 'jump'] as const;
const LEAN_L = 1 << 6;
const LEAN_R = 1 << 7;
const SNAP = 1 << 8;
/** Presses that must survive when inputs are folded together (everything but leaning). */
export const PRESS_BITS = 0b111111;

/** One tick of input: [clientTick, buttons, mx * 100, my * 100, aimX, aimY]. */
export type WireInput = [number, number, number, number, number, number];
export const NO_WIRE: WireInput = [0, 0, 0, 0, 0, 0];

const r2 = (v: number) => Math.round(v * 100) / 100;

export const encodeInput = (tick: number, i: Input): WireInput => {
  let bits = 0;
  BUTTONS.forEach((b, n) => {
    if (i[b]) bits |= 1 << n;
  });
  if (i.lean < -0.5) bits |= LEAN_L;
  if (i.lean > 0.5) bits |= LEAN_R;
  if (i.snap) bits |= SNAP;
  return [tick, bits, Math.round(i.mx * 100), Math.round(i.my * 100), r2(i.aimX), r2(i.aimY)];
};

export const decodeInput = (w: WireInput): Input => {
  const s: Input = { ...NO_INPUT, mx: w[2] / 100, my: w[3] / 100, aimX: w[4], aimY: w[5] };
  BUTTONS.forEach((b, n) => {
    s[b] = (w[1] & (1 << n)) !== 0;
  });
  s.lean = w[1] & LEAN_L ? -1 : w[1] & LEAN_R ? 1 : 0;
  s.snap = (w[1] & SNAP) !== 0;
  return s;
};

export const isWireInput = (w: unknown): w is WireInput =>
  Array.isArray(w) &&
  w.length === 6 &&
  w.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  Math.abs(w[2]) <= 100 &&
  Math.abs(w[3]) <= 100;

/**
 * An input queue per remote player, as the authority runs it: one input per tick in tick order;
 * if the queue backs up it folds the oldest into the next (presses OR-ed, so a shot or a jump is
 * never lost); if nothing new came in it keeps the movement and aim and drops one-off presses.
 */
export const createInputQueue = () => {
  let queue: WireInput[] = [];
  let current: Input = { ...NO_INPUT };
  let wire: WireInput = NO_WIRE;
  let ack = 0;
  return {
    push: (ws: unknown[]) => {
      for (const w of ws.slice(0, 12))
        if (isWireInput(w) && w[0] > ack && !queue.some((q) => q[0] === w[0])) queue.push(w);
    },
    next: (): Input => {
      queue.sort((a, b) => a[0] - b[0]);
      while (queue.length > 4) {
        const old = queue.shift()!;
        queue[0] = [
          queue[0][0],
          queue[0][1] | (old[1] & PRESS_BITS),
          queue[0][2],
          queue[0][3],
          queue[0][4],
          queue[0][5],
        ];
      }
      const n = queue.shift();
      if (n) {
        current = decodeInput(n);
        wire = n;
        ack = n[0];
      } else {
        current = {
          ...current,
          fire: current.fire,
          super: false,
          use: current.use,
          reload: false,
          roll: false,
          jump: false,
        };
      }
      return current;
    },
    get wire() {
      return wire;
    },
    get ack() {
      return ack;
    },
  };
};

/**
 * Events only the authority can decide: who got hit, who went down, what broke, who picked what
 * up. Guests play these from the host's log (each once, by sequence number), never from their
 * own prediction. Everything else (shots, reloads, rolls, footsteps) they predict.
 */
export const AUTHORITATIVE: GameEvent['type'][] = [
  'hit',
  'ko',
  'win',
  'rackBroken',
  'explosion',
  'zone',
  'zoneHurt',
  'pickup',
  'land',
];
export const isAuthoritative = (e: GameEvent) => AUTHORITATIVE.includes(e.type);

export interface Snapshot {
  /** The host's tick. */
  tick: number;
  /** Per player: the last input tick of theirs the host has applied (0 for bots and the host). */
  ack: number[];
  /** Per player: the input the host is using now (bots' too), for the guests to predict with. */
  inputs: WireInput[];
  state: GameState;
  /** Recent authoritative events with their sequence numbers. */
  log: [number, GameEvent][];
}

const INITIAL_RACKS = initialRacks();

// Infinity (fists' magazine) doesn't survive JSON: it travels as a marker. Positions and the
// like are rounded to a millimetre, which halves the size.
const INF = '__inf';
const replacer = (_k: string, v: unknown) =>
  v === Infinity
    ? INF
    : v === -Infinity
      ? `-${INF}`
      : typeof v === 'number' && !Number.isInteger(v)
        ? Math.round(v * 1000) / 1000
        : v;
const reviver = (_k: string, v: unknown) =>
  v === INF ? Infinity : v === `-${INF}` ? -Infinity : v;

/**
 * Snapshots are small: the crates travel as the few that differ from a fresh map, and the loot
 * list only when the host says so (it changes rarely: when it changes and once a second).
 */
export const encodeSnapshot = (s: Snapshot, withLoot: boolean) => {
  const racks: [number, number][] = [];
  s.state.racks.forEach((v, i) => {
    if (v !== INITIAL_RACKS[i]) racks.push([i, v]);
  });
  const state = { ...s.state, racks, events: [], loot: withLoot ? s.state.loot : undefined };
  return JSON.stringify({ ...s, state }, replacer);
};

/** `prevLoot` fills in the loot when this snapshot left it out. */
export const decodeSnapshot = (raw: string, prevLoot: Loot[]): Snapshot => {
  const s = JSON.parse(raw, reviver) as Snapshot & {
    state: GameState & { racks: [number, number][]; loot?: Loot[] };
  };
  const racks = INITIAL_RACKS.slice();
  for (const [i, v] of s.state.racks) racks[i] = v;
  return {
    ...s,
    state: { ...s.state, racks, loot: s.state.loot ?? prevLoot.map((l) => ({ ...l })), events: [] },
  };
};
